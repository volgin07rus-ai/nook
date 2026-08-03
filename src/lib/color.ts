/**
 * Just enough colour maths to accept an arbitrary hex from a colour picker and
 * fold it into the OKLCH palette the rest of the app is built on. No library:
 * these are the published sRGB↔OKLab matrices, about forty lines in total.
 */

export interface Oklch {
  /** 0–100 */
  l: number
  /** roughly 0–0.4 */
  c: number
  /** degrees, 0–360 */
  h: number
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

export function parseHex(input: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim())
  if (!match) return null
  const int = Number.parseInt(match[1], 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

export function hexToOklch(input: string): Oklch | null {
  const rgb = parseHex(input)
  if (!rgb) return null

  const r = srgbToLinear(rgb.r / 255)
  const g = srgbToLinear(rgb.g / 255)
  const b = srgbToLinear(rgb.b / 255)

  const lRoot = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mRoot = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const sRoot = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const l = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot
  const bb = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot

  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360

  return { l: l * 100, c: Math.hypot(a, bb), h }
}

/** Linear-light sRGB, clipped to gamut. */
function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const lightness = l / 100
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b

  const l3 = lRoot ** 3
  const m3 = mRoot ** 3
  const s3 = sRoot ** 3
  const clip = (v: number) => Math.min(1, Math.max(0, v))

  return [
    clip(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    clip(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    clip(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ]
}

const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

export function oklchToHex(color: Oklch): string {
  const channel = (v: number) =>
    Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255)
      .toString(16)
      .padStart(2, '0')
  const [r, g, b] = oklchToLinearRgb(color)
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

const OKLCH_PATTERN = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i

export function parseColor(value: string): Oklch | null {
  const hex = hexToOklch(value)
  if (hex) return hex
  const match = OKLCH_PATTERN.exec(value)
  if (!match) return null
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) }
}

/** `<input type="color">` only speaks hex, but the palette is written in OKLCH. */
export function toHexInput(value: string, fallback = '#808080'): string {
  if (/^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim().toLowerCase()
  const parsed = parseColor(value)
  return parsed ? oklchToHex(parsed) : fallback
}

/** Near-black or near-white, whichever stays visible on the given colour. */
export function inkOn(value: string): string {
  const parsed = parseColor(value)
  if (!parsed) return '#ffffff'
  return luminance(parsed) > 0.32 ? '#141414' : '#ffffff'
}

export function luminance(color: Oklch): number {
  const [r, g, b] = oklchToLinearRgb(color)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: Oklch, b: Oklch): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/**
 * Picks near-black or near-white for text sitting on the accent, whichever
 * reads better. A custom colour cannot be trusted to be light or dark, so this
 * is measured rather than assumed.
 */
export function onAccentLightness(accent: Oklch): number {
  const ink = { l: 18, c: 0.012, h: accent.h }
  const paper = { l: 97, c: 0.012, h: accent.h }
  return contrast(accent, ink) >= contrast(accent, paper) ? 18 : 97
}
