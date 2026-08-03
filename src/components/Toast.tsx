import { AnimatePresence, motion } from 'motion/react'
import { dismissToast, useToast } from '../lib/toast'
import { T } from '../lib/motion'
import { ArrowCounterClockwiseIcon, XIcon } from './icons'

/**
 * Undo lives here rather than in a confirmation dialog: ticking a task should
 * stay a single click, and the mistake is cheap to walk back for a few seconds.
 */
export function Toast() {
  const toast = useToast()

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={T}
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-raised py-2 pr-2 pl-4 shadow-[var(--shadow-lift)]"
          >
            <span className="truncate text-sm text-fg">{toast.message}</span>

            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.()
                  dismissToast()
                }}
                className="focus-ring press btn-primary flex shrink-0 items-center gap-1.5 px-3 py-1 text-sm"
              >
                <ArrowCounterClockwiseIcon size={13} />
                {toast.actionLabel}
              </button>
            )}

            <button
              type="button"
              onClick={dismissToast}
              aria-label="Скрыть уведомление"
              className="focus-ring press grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-fg"
            >
              <XIcon size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
