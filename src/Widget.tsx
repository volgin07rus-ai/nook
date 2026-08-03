import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { addTask, undo, updateSettings, useStore, useStoreReady } from './lib/store'
import { useTheme } from './lib/useAccent'
import { computeStats, sortTasks } from './lib/stats'
import { filterTitle, matchesFilter, parseWidgetFilter } from './lib/filters'
import { dateKey, parseDueFromText, plural, todayKey } from './lib/date'
import { hideWindow, setWidgetLayer, showMainWindow } from './lib/window'
import { TaskItem } from './components/TaskItem'
import { Toast } from './components/Toast'
import { NookMark } from './components/NookMark'
import { ArrowSquareOutIcon, MonitorIcon, PlusIcon, PushPinIcon, XIcon } from './components/icons'

/**
 * The one place glass is earned: this window floats on the wallpaper and must
 * not black it out. Opacity and layer are user-controlled from settings.
 */
export default function Widget() {
  const data = useStore()
  const ready = useStoreReady()
  // The widget can be pinned to its own theme: a dark panel reads better on a
  // photographic wallpaper even when the app itself is light.
  const widgetTheme =
    data.settings.widgetTheme === 'app' ? data.settings.theme : data.settings.widgetTheme
  useTheme(widgetTheme, data.settings.accent, data.settings.accentCustom, data.settings.font)

  const [draft, setDraft] = useState('')
  const applied = useRef(false)

  const desktopMode = data.settings.widgetMode === 'desktop'

  // Re-assert the layer once settings load, and whenever the mode changes.
  useEffect(() => {
    if (!ready) return
    applied.current = true
    void setWidgetLayer(desktopMode)
  }, [ready, desktopMode])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The widget can be pinned to one slice of the list: on a desktop you
  // usually want today, or one project, not everything you have ever written.
  const filter = useMemo(
    () => parseWidgetFilter(data.settings.widgetFilter),
    [data.settings.widgetFilter],
  )
  const scoped = useMemo(
    () => data.tasks.filter((task) => matchesFilter(task, filter)),
    [data.tasks, filter],
  )

  const stats = useMemo(() => computeStats(scoped), [scoped])

  // Open tasks first, then anything ticked off today so it can still be undone.
  const visible = useMemo(() => {
    const today = todayKey()
    const open = sortTasks(
      scoped.filter((t) => !t.done),
      'smart',
    )
    const justDone = scoped.filter(
      (t) => t.done && t.completedAt !== null && dateKey(t.completedAt) === today,
    )
    return [...open, ...justDone]
  }, [scoped])

  const scopeLabel = filterTitle(filter, data.categories)

  const submit = () => {
    const parsed = parseDueFromText(draft)
    const title = (parsed?.title ?? draft).trim()
    if (!title) return
    addTask({ title, due: parsed?.due ?? null })
    setDraft('')
  }

  return (
    /* No transparent margin here either: it would move the resize border off
       the visible edge. The rim does the separating. */
    <div className="h-full">
      <div
        className="pane-glass relative flex h-full flex-col overflow-hidden rounded-2xl"
        style={
          { '--glass-opacity': `${data.settings.widgetOpacity * 100}%` } as React.CSSProperties
        }
      >
        <header
          data-tauri-drag-region
          className="drag-region flex shrink-0 items-start gap-2 px-4 pt-3.5 pb-2"
        >
          {/* The widget has no title bar, so the mark is what says which app
              this floating panel belongs to. The wordmark would not fit. */}
          <span data-tauri-drag-region className="mt-0.5 shrink-0 text-fg-3">
            <NookMark size={15} />
          </span>

          <div data-tauri-drag-region className="min-w-0 flex-1">
            <p data-tauri-drag-region className="text-md leading-tight font-medium text-fg">
              {stats.open === 0
                ? 'Всё выполнено'
                : `${stats.open} ${plural(stats.open, 'задача', 'задачи', 'задач')}`}
            </p>
            <p data-tauri-drag-region className="mt-0.5 truncate text-xs text-fg-2">
              {/* When the widget is pinned to one list, say which one: the
                  counts above would otherwise look wrong against the app. */}
              {data.settings.widgetFilter !== 'all'
                ? scopeLabel
                : stats.overdue > 0
                  ? `${stats.overdue} ${plural(stats.overdue, 'просрочена', 'просрочены', 'просрочено')}`
                  : stats.doneToday > 0
                    ? `сегодня закрыто ${stats.doneToday}`
                    : 'просроченного нет'}
            </p>
          </div>

          <div className="no-drag flex shrink-0 items-center">
            <WidgetButton
              label={desktopMode ? 'Поднять поверх окон' : 'Опустить на рабочий стол'}
              onClick={() => updateSettings({ widgetMode: desktopMode ? 'floating' : 'desktop' })}
            >
              {desktopMode ? <MonitorIcon size={14} /> : <PushPinIcon size={14} weight="fill" />}
            </WidgetButton>
            <WidgetButton label="Открыть Nook" onClick={() => void showMainWindow()}>
              <ArrowSquareOutIcon size={14} />
            </WidgetButton>
            <WidgetButton label="Скрыть виджет" danger onClick={() => void hideWindow()}>
              <XIcon size={14} />
            </WidgetButton>
          </div>
        </header>

        <div className="shrink-0 px-4 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${stats.rate}%`,
                  transition: 'width 220ms var(--ease-out-quart)',
                }}
              />
            </div>
            <span className="tnum shrink-0 text-xs text-fg-2">{stats.rate}%</span>
          </div>
        </div>

        <div className="scroll-y min-h-0 flex-1">
          {!ready ? null : visible.length === 0 ? (
            <div className="flex h-full min-h-24 items-center justify-center px-6 text-center">
              <p className="text-sm leading-relaxed text-fg-3">
                Задач нет. Добавь первую в поле снизу
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              <AnimatePresence initial={false}>
                {visible.map((task) => (
                  <TaskItem key={task.id} task={task} categories={data.categories} compact />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="shrink-0 p-3">
          <div className="field flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={submit}
              disabled={!draft.trim()}
              aria-label="Добавить задачу"
              title="Добавить задачу"
              className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-fg disabled:opacity-40"
            >
              <PlusIcon size={14} />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                if (e.key === 'Escape') setDraft('')
              }}
              placeholder="Быстрая задача"
              aria-label="Быстрая задача"
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
            />
          </div>
        </div>

        <Toast />
      </div>
    </div>
  )
}

function WidgetButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`focus-ring press grid h-7 w-7 place-items-center rounded-full text-fg-2 transition-colors duration-150 ${
        danger ? 'hover:text-danger' : 'hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
