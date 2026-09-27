import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { View } from '../App'
import type { Icon } from '@phosphor-icons/react'
import { T, T_FAST } from '../lib/motion'
import { CalendarDotsIcon, ChartBarIcon, GearSixIcon } from './icons'

/**
 * Разделы, которые не заслужили постоянного места внизу.
 *
 * Деление не по важности, а по частоте: задачи, привычки, фильмы и блокнот
 * открывают каждый день, а календарь, обзор и настройки — когда понадобится.
 * Больше пяти кнопок внизу не помещается так, чтобы в каждую попадал палец.
 */
export const MORE_VIEWS: Array<{ view: View; label: string; hint: string; Icon: Icon }> = [
  {
    view: 'calendar',
    label: 'Календарь',
    hint: 'Дела по дням и часам',
    Icon: CalendarDotsIcon,
  },
  {
    view: 'stats',
    label: 'Обзор',
    hint: 'Сколько сделано и по каким категориям',
    Icon: ChartBarIcon,
  },
  {
    view: 'settings',
    label: 'Настройки',
    hint: 'Тема, акцент, виджет, данные',
    Icon: GearSixIcon,
  },
]

export function MoreSheet({
  open,
  onClose,
  view,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  view: View
  onNavigate: (view: View) => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pick = (next: View) => {
    onNavigate(next)
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть список разделов"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T_FAST}
            className="fixed inset-0 z-[60] bg-[oklch(0%_0_0/0.45)]"
          />

          <motion.div
            role="dialog"
            aria-label="Разделы"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={T}
            className="fixed inset-x-0 bottom-0 z-[70] overflow-hidden rounded-t-xl bg-panel"
            style={{ paddingBottom: 'var(--safe-bottom, 0px)' }}
          >
            {/* Захват: говорит, что шторка пришла снизу и туда же уйдёт. */}
            <div className="flex justify-center pt-2.5 pb-1">
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            <div className="flex flex-col px-3 pt-2 pb-4">
              {MORE_VIEWS.map((item) => {
                const active = view === item.view
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => pick(item.view)}
                    aria-current={active ? 'page' : undefined}
                    className={`focus-ring press flex items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors duration-150 ${
                      active ? 'bg-accent-dim text-fg' : 'text-fg-2'
                    }`}
                  >
                    <span
                      className={`grid w-5 shrink-0 place-items-center ${
                        active ? 'text-accent' : 'text-fg-3'
                      }`}
                    >
                      <item.Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-md block truncate">{item.label}</span>
                      <span
                        className={`block truncate text-xs ${active ? 'text-fg-2' : 'text-fg-3'}`}
                      >
                        {item.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
