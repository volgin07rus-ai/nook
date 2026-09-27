import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Category, Task } from '../types'
import { matchesFilter, sameFilter, type Filter } from '../lib/filters'
import { T, T_FAST } from '../lib/motion'
import { CheckIcon, SunIcon, TrayIcon, WarningCircleIcon } from './icons'

interface FilterSheetProps {
  open: boolean
  onClose: () => void
  tasks: Task[]
  categories: Category[]
  filter: Filter
  onPick: (filter: Filter) => void
}

/**
 * All the filters, on demand, instead of a chip rail above the list.
 *
 * The rail had two problems. It mixed two different kinds of thing — states
 * and categories — in one flat row, and four state chips pushed every category
 * off the right edge, so the lists you actually made were the ones you could
 * not see. Here they are separate groups, all visible at once, and the row
 * they used to occupy goes back to the tasks.
 */
export function FilterSheet({
  open,
  onClose,
  tasks,
  categories,
  filter,
  onPick,
}: FilterSheetProps) {
  // A sheet over the whole app should not leave the list scrolling behind it.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const count = (candidate: Filter) => tasks.filter((t) => matchesFilter(t, candidate)).length

  const pick = (next: Filter) => {
    onPick(next)
    onClose()
  }

  const states: Array<{ filter: Filter; label: string; icon: React.ReactNode; tone?: 'danger' }> = [
    { filter: { kind: 'all' }, label: 'Все задачи', icon: <TrayIcon size={18} /> },
    { filter: { kind: 'today' }, label: 'Сегодня', icon: <SunIcon size={18} /> },
    {
      filter: { kind: 'overdue' },
      label: 'Просроченные',
      icon: <WarningCircleIcon size={18} />,
      tone: 'danger',
    },
    { filter: { kind: 'done' }, label: 'Выполненные', icon: <CheckIcon size={18} /> },
  ]

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть выбор списка"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T_FAST}
            className="fixed inset-0 z-[60] bg-[oklch(0%_0_0/0.45)]"
          />

          <motion.div
            role="dialog"
            aria-label="Списки"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={T}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[80%] overflow-hidden rounded-t-xl bg-panel"
            style={{ paddingBottom: 'var(--safe-bottom, 0px)' }}
          >
            {/* Grabber: says "this came from the bottom and goes back there". */}
            <div className="flex justify-center pt-2.5 pb-1">
              <span className="h-1 w-9 rounded-full bg-line" />
            </div>

            <div className="scroll-y max-h-[70vh] px-3 pt-2 pb-4">
              <Group title="Состояние">
                {states.map((state) => (
                  <Row
                    key={state.label}
                    label={state.label}
                    icon={state.icon}
                    count={count(state.filter)}
                    tone={state.tone}
                    active={sameFilter(filter, state.filter)}
                    onClick={() => pick(state.filter)}
                  />
                ))}
              </Group>

              {categories.length > 0 && (
                <Group title="Категории">
                  {categories.map((category) => (
                    <Row
                      key={category.id}
                      label={category.name}
                      icon={
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: category.color }}
                        />
                      }
                      count={tasks.filter((t) => t.categoryId === category.id && !t.done).length}
                      active={sameFilter(filter, { kind: 'category', categoryId: category.id })}
                      onClick={() => pick({ kind: 'category', categoryId: category.id })}
                    />
                  ))}
                </Group>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-1 last:mb-0">
      <h2 className="px-3 pt-3 pb-1.5 text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">
        {title}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function Row({
  label,
  icon,
  count,
  tone,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  count: number
  tone?: 'danger'
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`focus-ring press flex h-12 items-center gap-3 rounded-lg px-3 text-left transition-colors duration-150 ${
        active ? 'bg-accent-dim text-fg' : 'text-fg-2'
      }`}
    >
      <span className={`grid w-5 shrink-0 place-items-center ${active ? 'text-accent' : 'text-fg-3'}`}>
        {icon}
      </span>
      <span className="text-md min-w-0 flex-1 truncate">{label}</span>
      {count > 0 && (
        /* The active row sits on accent-dim, darker than the surface the muted
         * token was tuned against, so it steps up one level. */
        <span
          className={`tnum shrink-0 text-sm ${
            tone === 'danger' && count > 0 ? 'text-danger' : active ? 'text-fg-2' : 'text-fg-3'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
