import { useEffect, useState } from 'react'

export interface KeyboardState {
  /** The soft keyboard is up. */
  open: boolean
  /**
   * How much of the layout it covers, which is often zero: some Android
   * setups shrink the page when the keyboard opens and some draw over it.
   * Only the second kind needs anything lifted.
   */
  inset: number
}

const CLOSED: KeyboardState = { open: false, inset: 0 }

/** Below this a height change is a browser chrome shuffle, not a keyboard. */
const THRESHOLD = 120

/**
 * Watches the soft keyboard.
 *
 * Two separate facts, because they are not the same question. Whether the
 * keyboard is up decides what to hide — the tab bar has no business taking a
 * row of screen while someone is typing. How much it covers decides what to
 * lift, and measuring that against window.innerHeight is the trap: on a phone
 * that already shrank the page, innerHeight still reports the full window, so
 * a bar gets lifted a second time and floats in mid-air above the keys.
 * documentElement.clientHeight is the layout viewport, so it shrinks exactly
 * when the page did, and the leftover is the part really covered.
 */
export function useKeyboard(): KeyboardState {
  const [state, setState] = useState<KeyboardState>(CLOSED)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    // The keyboard-closed height. Taking it at mount would be wrong if the
    // keyboard were already up, so it is learned instead — see below.
    let tallest = vv.height

    const typing = (): boolean => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return false
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
    }

    const measure = () => {
      /*
       * The closed height is re-learned whenever nothing has the focus, and
       * only held as a high-water mark while something does.
       *
       * A mark that only ever grows gets stuck: let the viewport be tall once —
       * a rotation, a split-screen resize, one odd reading at startup — and
       * every later height looks like a keyboard is up, so the tab bar hides
       * and never comes back. There is no keyboard without a focused field, so
       * with nothing focused whatever the viewport measures now *is* the
       * closed height, and that is the reading to trust.
       */
      tallest = typing() ? Math.max(tallest, vv.height) : vv.height
      const hidden = tallest - vv.height
      const layout = document.documentElement.clientHeight
      const covered = layout - vv.height - vv.offsetTop

      const next: KeyboardState = {
        open: hidden > THRESHOLD,
        inset: covered > THRESHOLD ? Math.round(covered) : 0,
      }

      /*
       * Only on a real change.
       *
       * The viewport fires scroll events by the frame, and handing back a fresh
       * object each time re-rendered the whole editor on every one of them —
       * which is what made the toolbar twitch and blink while scrolling a long
       * note. The numbers almost never differ between those events.
       */
      setState((prev) =>
        prev.open === next.open && prev.inset === next.inset ? prev : next,
      )
    }

    measure()
    vv.addEventListener('resize', measure)
    vv.addEventListener('scroll', measure)
    return () => {
      vv.removeEventListener('resize', measure)
      vv.removeEventListener('scroll', measure)
    }
  }, [])

  return state
}
