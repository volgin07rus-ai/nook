import { useEffect } from 'react'
import type { AccentKey, FontKey, ThemeKey } from '../types'
import { ACCENTS, FONT_STACKS } from '../types'
import { clamp, contrast, hexToOklch, onAccentLightness, type Oklch } from './color'

/** Lightness is searched inside this range, never outside it. */
const RANGE: [number, number] = [28, 95]
const MIN_CONTRAST = 4.5

interface Resolved {
  hue: number
  chroma: number
  lightness: number
  onLightness: number
}

/**
 * Turns whatever the user picked into the four numbers the stylesheet needs.
 *
 * A custom colour keeps its hue and chroma but has its lightness clamped, and
 * the text on top is chosen by measuring contrast rather than assuming: an
 * arbitrary hex may be light or dark, and a button whose label disappears is
 * worse than one a few percent off the requested shade.
 */
export function resolveAccent(accent: AccentKey, custom: string, theme: ThemeKey): Resolved {
  const preset = accent === 'custom' ? null : (ACCENTS[accent] ?? ACCENTS.graphite)
  if (preset) {
    return {
      hue: preset.hue,
      chroma: preset.chroma,
      lightness: preset.l[theme],
      onLightness: preset.on[theme],
    }
  }

  const parsed = hexToOklch(custom)
  if (!parsed) {
    const fallback = ACCENTS.graphite
    return {
      hue: fallback.hue,
      chroma: fallback.chroma,
      lightness: fallback.l[theme],
      onLightness: fallback.on[theme],
    }
  }

  // High chroma turns garish, and this hue also tints every neutral surface.
  const chroma = clamp(parsed.c, 0, 0.17)
  const { lightness, onLightness } = readableLightness(parsed.l, chroma, parsed.h)
  return { hue: parsed.h, chroma, lightness, onLightness }
}

/**
 * Finds the lightness nearest the one the user picked at which the label on the
 * accent still clears 4.5:1. Clamping to a fixed band is not enough: a mid
 * lightness at high chroma can leave both black and white text below the line,
 * so the value has to be measured and walked away from, not assumed.
 */
function readableLightness(wanted: number, chroma: number, hue: number) {
  const [min, max] = RANGE
  const start = clamp(wanted, min, max)

  for (let delta = 0; delta <= max - min; delta += 1) {
    for (const candidate of delta === 0 ? [start] : [start + delta, start - delta]) {
      if (candidate < min || candidate > max) continue
      const color: Oklch = { l: candidate, c: chroma, h: hue }
      const onLightness = onAccentLightness(color)
      const ink: Oklch = { l: onLightness, c: 0.012, h: hue }
      if (contrast(color, ink) >= MIN_CONTRAST) {
        return { lightness: candidate, onLightness }
      }
    }
  }

  // Unreachable for any in-gamut colour, but never return something unreadable.
  const fallback: Oklch = { l: max, c: chroma, h: hue }
  return { lightness: max, onLightness: onAccentLightness(fallback) }
}

/**
 * Publishes the theme, accent and font as root variables. Surfaces, text and
 * borders all derive from --hue, so switching the accent retints the whole
 * palette at once instead of dropping one foreign colour onto neutral grey.
 */
export function useTheme(theme: ThemeKey, accent: AccentKey, custom: string, font: FontKey) {
  useEffect(() => {
    const { hue, chroma, lightness, onLightness } = resolveAccent(accent, custom, theme)
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('--hue', String(hue))
    root.style.setProperty('--chroma', String(chroma))
    root.style.setProperty('--l-accent', `${lightness}%`)
    root.style.setProperty('--l-on-accent', `${onLightness}%`)
    root.style.setProperty('--font-ui', FONT_STACKS[font] ?? FONT_STACKS.system)
  }, [theme, accent, custom, font])
}

/** Swatch colour for the accent picker, matching how it renders in the theme. */
export function accentSwatch(accent: AccentKey, custom: string, theme: ThemeKey): string {
  const { hue, chroma, lightness } = resolveAccent(accent, custom, theme)
  return `oklch(${lightness}% ${chroma} ${hue})`
}
