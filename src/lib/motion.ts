/**
 * Shared motion vocabulary. Everything eases out on the same curve as the CSS
 * transitions, in the 120–220 ms band: motion here reports a state change, it
 * is never decoration, and nothing overshoots.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const T = { duration: 0.2, ease: EASE_OUT }
export const T_FAST = { duration: 0.14, ease: EASE_OUT }
export const T_LAYOUT = { duration: 0.22, ease: EASE_OUT }

/**
 * Шарик нижнего меню — единственное исключение из «ничего не пружинит».
 *
 * Здесь отскок и есть смысл движения: шарик перелетает к новому разделу,
 * чуть проскакивает цель и садится на место, и глаз успевает проследить,
 * куда он делся. Затухание ~0.75: перелёт на 3–4% и покой примерно за 0.3 с —
 * отскок ещё читается, а прогиб полосы едет за шариком плавно, не дёргаясь.
 */
export const T_DOCK = { type: 'spring' as const, stiffness: 620, damping: 36, mass: 0.9 }

/** Row entering or leaving a list. */
export const rowMotion = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: T_FAST },
  transition: T,
}

/** Panel that expands in place, such as the subtask checklist. */
export const collapseMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' as const },
  exit: { opacity: 0, height: 0 },
  transition: T,
  style: { overflow: 'hidden' },
}

/**
 * Whole-view swap, e.g. tasks to settings. Enter only, no exit: the outgoing
 * view must never linger waiting on an animation to finish.
 */
export const viewMotion = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: T,
}
