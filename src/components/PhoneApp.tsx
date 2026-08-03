import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { AppData, Task } from '../types'
import type { View } from '../App'
import type { Filter } from '../lib/filters'
import { filterTitle, matchesFilter } from '../lib/filters'
import { plural, todayKey } from '../lib/date'
import { T_LAYOUT, viewMotion } from '../lib/motion'
import { useKeyboard } from '../lib/useKeyboard'
import { TaskComposer } from './TaskComposer'
import { TaskItem } from './TaskItem'
import { SettingsView } from './SettingsView'
import { NotepadView } from './NotepadView'
import { FilmsView } from './FilmsView'
import { StatsPanel } from './StatsPanel'
import { Toast } from './Toast'
import { FilterSheet } from './FilterSheet'
import {
  CaretDownIcon,
  ChartBarIcon,
  FilmSlateIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  TrayIcon,
  XIcon,
} from './icons'

export interface TaskGroup {
  key: string
  title: string
  tasks: Task[]
}

interface PhoneAppProps {
  data: AppData
  ready: boolean
  view: View
  onNavigate: (view: View) => void
  filter: Filter
  onFilterChange: (filter: Filter) => void
  query: string
  onQueryChange: (query: string) => void
  groups: TaskGroup[]
  visibleCount: number
  openCount: number
}

/**
 * The phone shell.
 *
 * The desktop spends its width on three columns — filters, list, statistics —
 * that are all visible at once. A phone has one column, so the same three
 * become tabs along the bottom, where a thumb reaches them, and the filters
 * collapse into a row of chips above the list.
 *
 * Everything below the shell is the same components the desktop uses. Only the
 * arrangement changes.
 */
export function PhoneApp({
  data,
  ready,
  view,
  onNavigate,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  groups,
  visibleCount,
  openCount,
}: PhoneAppProps) {
  const keyboard = useKeyboard()

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Toast anchors to this box rather than the window, so undo lands just
          above the tab bar instead of under it. */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        style={{ paddingTop: 'var(--safe-top, 0px)' }}
      >
        {view === 'settings' ? (
          <motion.div key="settings" {...viewMotion} className="flex min-h-0 flex-1 flex-col">
            <SettingsView data={data} />
          </motion.div>
        ) : view === 'notepad' ? (
          <motion.div key="notepad" {...viewMotion} className="flex min-h-0 flex-1 flex-col">
            <NotepadView notes={data.notes} phone />
          </motion.div>
        ) : view === 'films' ? (
          <motion.div key="films" {...viewMotion} className="flex min-h-0 flex-1 flex-col">
            <FilmsView films={data.films} notes={data.notes} phone />
          </motion.div>
        ) : view === 'stats' ? (
          <motion.div key="stats" {...viewMotion} className="flex min-h-0 flex-1 flex-col">
            <StatsPanel tasks={data.tasks} categories={data.categories} phone />
          </motion.div>
        ) : (
          <motion.div key="tasks" {...viewMotion} className="flex min-h-0 flex-1 flex-col">
            <TasksScreen
              data={data}
              ready={ready}
              filter={filter}
              onFilterChange={onFilterChange}
              query={query}
              onQueryChange={onQueryChange}
              groups={groups}
              visibleCount={visibleCount}
              openCount={openCount}
            />
          </motion.div>
        )}

        <Toast />
      </div>

      {/* Gone while the keyboard is up. Nothing on it can be reached with the
          keys in the way, and the row it costs is the row the formatting bar
          needs to sit against the keyboard instead of floating above it. */}
      {!keyboard.open && (
        <Tabs
          view={view}
          onNavigate={onNavigate}
          overdue={data.tasks.filter((t) => matchesFilter(t, { kind: 'overdue' })).length}
        />
      )}
    </div>
  )
}

function TasksScreen({
  data,
  ready,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  groups,
  visibleCount,
  openCount,
}: {
  data: AppData
  ready: boolean
  filter: Filter
  onFilterChange: (filter: Filter) => void
  query: string
  onQueryChange: (query: string) => void
  groups: TaskGroup[]
  visibleCount: number
  openCount: number
}) {
  // Search is a whole row of screen width, so it is not worth keeping around
  // when it is empty.
  const [searching, setSearching] = useState(false)
  const [picking, setPicking] = useState(false)

  const closeSearch = () => {
    onQueryChange('')
    setSearching(false)
  }

  return (
    <>
      <header className="shrink-0 px-4 pt-3">
        <div className="flex items-start gap-2">
          {/* The title is the filter control. It already names the current
              list, so making it the way to change it costs no extra screen. */}
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-haspopup="dialog"
            aria-expanded={picking}
            className="focus-ring press -ml-1 flex min-w-0 flex-1 flex-col items-start rounded-lg px-1 py-0.5 text-left"
          >
            <span className="flex min-w-0 max-w-full items-center gap-1.5">
              <span className="truncate text-xl font-semibold text-fg">
                {filterTitle(filter, data.categories)}
              </span>
              <CaretDownIcon size={16} className="shrink-0 text-fg-3" />
            </span>
            <span className="mt-0.5 text-sm text-fg-3">
              {openCount === 0
                ? 'активных задач нет'
                : `${openCount} ${plural(openCount, 'активная задача', 'активные задачи', 'активных задач')}`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => (searching ? closeSearch() : setSearching(true))}
            aria-label={searching ? 'Закрыть поиск' : 'Поиск по задачам'}
            aria-expanded={searching}
            className="focus-ring press grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-2"
          >
            {searching ? <XIcon size={18} /> : <MagnifyingGlassIcon size={18} />}
          </button>
        </div>

        {searching && (
          <div className="field enter mt-2 flex items-center gap-2.5 px-3 py-2.5">
            <MagnifyingGlassIcon size={16} className="shrink-0 text-fg-2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Поиск"
              aria-label="Поиск по задачам"
              className="text-md min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
            />
          </div>
        )}
      </header>

      <FilterSheet
        open={picking}
        onClose={() => setPicking(false)}
        tasks={data.tasks}
        categories={data.categories}
        filter={filter}
        onPick={onFilterChange}
      />

      <div className="shrink-0 px-4 pt-3">
        <TaskComposer
          categories={data.categories}
          defaultCategoryId={filter.kind === 'category' ? (filter.categoryId ?? null) : null}
          defaultDue={filter.kind === 'today' ? todayKey() : null}
        />
      </div>

      <div className="scroll-y min-h-0 flex-1 px-4 pt-3 pb-4">
        {!ready ? (
          <TaskSkeleton />
        ) : visibleCount === 0 ? (
          <Empty query={query} filter={filter} />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <section key={group.key}>
                {group.title && (
                  <h2 className="mb-2 flex items-baseline gap-2 px-1 text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">
                    {group.title}
                    <span className="tnum">{group.tasks.length}</span>
                  </h2>
                )}
                {/* No manual reordering here: a drag gesture on a phone is a
                    scroll, and the two cannot share the same finger. */}
                <ul className="card divide-y divide-line-soft overflow-hidden">
                  <AnimatePresence initial={false}>
                    {group.tasks.map((task) => (
                      <TaskItem key={task.id} task={task} categories={data.categories} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const TABS: Array<{ view: View; label: string; icon: React.ReactNode }> = [
  { view: 'tasks', label: 'Задачи', icon: <TrayIcon size={20} /> },
  { view: 'notepad', label: 'Блокнот', icon: <NotePencilIcon size={20} /> },
  { view: 'films', label: 'Фильмы', icon: <FilmSlateIcon size={20} /> },
  { view: 'stats', label: 'Обзор', icon: <ChartBarIcon size={20} /> },
  { view: 'settings', label: 'Настройки', icon: <GearSixIcon size={20} /> },
]

/** Bottom bar, padded past the gesture area so nothing sits under the swipe. */
function Tabs({
  view,
  onNavigate,
  overdue,
}: {
  view: View
  onNavigate: (view: View) => void
  overdue: number
}) {
  return (
    <nav
      className="flex shrink-0 border-t border-line-soft bg-canvas"
      style={{ paddingBottom: 'var(--safe-bottom, 0px)' }}
    >
      {TABS.map((tab) => {
        const active = view === tab.view
        return (
          <button
            key={tab.view}
            type="button"
            onClick={() => onNavigate(tab.view)}
            aria-current={active ? 'page' : undefined}
            className={`focus-ring relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 ${
              active ? 'text-accent' : 'text-fg-3'
            }`}
          >
            {/*
             * One lamp for the whole bar, not one per tab.
             *
             * Sharing a layoutId means the same element is handed from tab to
             * tab, so switching slides it across instead of switching one off
             * and another on. Behind the icon, never over it: the beam is a
             * hint about where you are, and it must not make the glyph it is
             * pointing at any harder to read.
             */}
            {active && (
              <motion.span
                layoutId="tab-lamp"
                transition={T_LAYOUT}
                aria-hidden
                className="tab-lamp pointer-events-none absolute inset-0"
              />
            )}

            <span className={`relative ${active ? 'tab-glow' : ''}`}>
              {tab.icon}
              {tab.view === 'tasks' && overdue > 0 && (
                <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-danger" />
              )}
            </span>
            <span className="relative text-xs">{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function TaskSkeleton() {
  return (
    <ul className="card divide-y divide-line-soft overflow-hidden" aria-hidden>
      {[68, 52, 74, 44].map((width, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3.5">
          <span className="skeleton h-[18px] w-[18px] rounded-full" />
          <span className="skeleton h-3" style={{ width: `${width}%` }} />
        </li>
      ))}
    </ul>
  )
}

function Empty({ query, filter }: { query: string; filter: Filter }) {
  const title = query.trim()
    ? 'Ничего не найдено'
    : filter.kind === 'today'
      ? 'На сегодня ничего'
      : filter.kind === 'overdue'
        ? 'Просроченного нет'
        : filter.kind === 'done'
          ? 'Пока ничего не выполнено'
          : filter.kind === 'category'
            ? 'В этой категории пусто'
            : 'Задач нет'

  return (
    <div className="card flex min-h-40 items-center justify-center px-6 py-10 text-center">
      <p className="text-md font-medium text-fg-2">{title}</p>
    </div>
  )
}
