import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, Reorder, motion } from 'motion/react'
import { reorderVisibleTasks, undo, useStore, useStoreReady } from './lib/store'
import { viewMotion } from './lib/motion'
import { useTheme } from './lib/useAccent'
import { useMaximized } from './lib/useMaximized'
import { useReminderBridge } from './lib/reminders'
import {
  ALL_TASKS,
  filterTitle,
  hidesCompleted,
  matchesFilter,
  matchesSearch,
  type Filter,
} from './lib/filters'
import { sortTasks, type SortMode } from './lib/stats'
import { groupTasks } from './lib/group'
import { plural, todayKey } from './lib/date'
import {
  isWidgetVisible,
  makeBackup,
  setQuickShortcut,
  setWidgetLayer,
  showWidget,
  toggleWidget,
} from './lib/window'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { StatsPanel } from './components/StatsPanel'
import { TaskComposer } from './components/TaskComposer'
import { TaskItem } from './components/TaskItem'
import { SettingsView } from './components/SettingsView'
import { Toast } from './components/Toast'
import { Select } from './components/Select'
import { NotepadView } from './components/NotepadView'
import { FilmsView } from './components/FilmsView'
import { CalendarView } from './components/CalendarView'
import { HabitsView } from './components/HabitsView'
import { PulseCard } from './components/PulseCard'
import { PhoneApp } from './components/PhoneApp'
import { imagesIn, pruneImages } from './lib/images'
import { syncIfConfigured } from './lib/sync'
import { startAutoSync } from './lib/autosync'
import { IS_PHONE } from './lib/platform'
import { Dock, type DockItem } from './components/Dock'
import {
  CalendarDotsIcon,
  FilmSlateIcon,
  GearSixIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  SortAscendingIcon,
  TargetIcon,
  TrayIcon,
} from './components/icons'

/** 'stats' is a phone tab. On the desktop the statistics are always on screen. */
export type View = 'tasks' | 'habits' | 'settings' | 'notepad' | 'films' | 'calendar' | 'stats'

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'smart', label: 'Сначала срочные' },
  { value: 'manual', label: 'Вручную' },
  { value: 'due', label: 'По сроку' },
  { value: 'priority', label: 'По приоритету' },
  { value: 'created', label: 'Сначала новые' },
  { value: 'alpha', label: 'По алфавиту' },
]

export default function App() {
  const data = useStore()
  const ready = useStoreReady()
  useTheme(
    data.settings.theme,
    data.settings.accent,
    data.settings.accentCustom,
    data.settings.font,
  )
  useReminderBridge(data.tasks)
  const maximized = useMaximized()

  const [filter, setFilter] = useState<Filter>(ALL_TASKS)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('smart')
  const [view, setView] = useState<View>('tasks')
  const [widgetVisible, setWidgetVisible] = useState(false)
  const launched = useRef(false)

  // Everything that has to happen once, after the stored settings arrive.
  useEffect(() => {
    if (!ready || launched.current) return
    launched.current = true
    void (async () => {
      await setWidgetLayer(data.settings.widgetMode === 'desktop')
      if (data.settings.widgetOnLaunch) await showWidget()
      setWidgetVisible(!!(await isWidgetVisible()))
      await setQuickShortcut(data.settings.quickShortcut)
      // One dated copy per launch. The app holds the only copy of the data,
      // so a bad write should not be able to take everything with it.
      await makeBackup(todayKey())
      // Файлы, на которые больше не ссылается ни одна записка, здесь и
      // прибираются: удалённая из текста картинка иначе осталась бы на диске
      // навсегда. Источник правды — сами записки, отдельного учёта нет.
      await pruneImages(data.notes.flatMap((note) => imagesIn(note.body)))
      // Обмен с репозиторием при запуске: приложение открывают, чтобы
      // посмотреть, что там — значит первым делом надо забрать чужие правки.
      await syncIfConfigured()
    })()
  }, [ready, data.settings.widgetMode, data.settings.widgetOnLaunch, data.settings.quickShortcut])

  /*
   * Дальше обмен идёт сам: правки уезжают через несколько секунд, чужие
   * приезжают по опросу раз в минуту и при уходе с экрана и возвращении.
   *
   * visibilitychange, а не закрытие окна: на телефоне окно не закрывают, его
   * сворачивают, и это единственное событие, которое туда вообще приходит.
   */
  useEffect(() => startAutoSync(), [])

  // Ctrl+Z anywhere, as long as the user is not typing into a field.
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

  const handleToggleWidget = async () => {
    setWidgetVisible(!!(await toggleWidget()))
  }

  const visible = useMemo(() => {
    const scoped = data.tasks.filter(
      (task) =>
        matchesFilter(task, filter) &&
        matchesSearch(task, query) &&
        (data.settings.showCompleted || !hidesCompleted(filter) || !task.done),
    )
    return sortTasks(scoped, sort)
  }, [data.tasks, data.settings.showCompleted, filter, query, sort])

  const groups = useMemo(
    () => (sort === 'smart' ? groupTasks(visible) : [{ key: 'flat', title: '', tasks: visible }]),
    [visible, sort],
  )

  const openCount = visible.filter((t) => !t.done).length

  if (IS_PHONE) {
    return (
      <PhoneApp
        data={data}
        ready={ready}
        view={view}
        onNavigate={setView}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next)
          setView('tasks')
        }}
        query={query}
        onQueryChange={setQuery}
        groups={groups}
        visibleCount={visible.length}
        openCount={openCount}
      />
    )
  }

  return (
    /*
     * The panel fills the window exactly. It used to sit inside a transparent
     * margin so a CSS shadow had somewhere to land, but that pushed the resize
     * border away from the visible edge: you had to grab 16px past where the
     * window appeared to end. Separation from the wallpaper comes from the rim
     * instead, which costs no geometry.
     */
    <div className="h-full">
      <div
        className={`pane-solid relative flex h-full flex-col overflow-hidden ${
          maximized ? 'rounded-none' : 'rounded-xl'
        }`}
      >
        <TitleBar />

        <div className="flex min-h-0 flex-1">
          <Sidebar
            tasks={data.tasks}
            categories={data.categories}
            filter={filter}
            onFilterChange={(next) => {
              setFilter(next)
              setView('tasks')
            }}
            view={view}
            onToggleWidget={() => void handleToggleWidget()}
            widgetVisible={widgetVisible}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              {/* Deliberately not wrapped in AnimatePresence: a view swap is a
               * state change and must not wait on an exit animation to finish. The
               * outgoing view unmounts at once, the incoming one fades in. */}
              {view === 'settings' ? (
                <motion.div key="settings" {...viewMotion} className="flex min-w-0 flex-1">
                  <SettingsView data={data} />
                </motion.div>
              ) : view === 'notepad' ? (
                <motion.div key="notepad" {...viewMotion} className="flex min-w-0 flex-1">
                  <NotepadView notes={data.notes} />
                </motion.div>
              ) : view === 'films' ? (
                <motion.div key="films" {...viewMotion} className="flex min-w-0 flex-1">
                  <FilmsView films={data.films} notes={data.notes} />
                </motion.div>
              ) : view === 'calendar' ? (
                <motion.div key="calendar" {...viewMotion} className="flex min-w-0 flex-1">
                  <CalendarView tasks={data.tasks} categories={data.categories} />
                </motion.div>
              ) : view === 'habits' ? (
                <motion.div key="habits" {...viewMotion} className="flex min-w-0 flex-1">
                  <HabitsView habits={data.habits} />
                </motion.div>
              ) : view === 'stats' ? (
                /* На узком окне колонка обзора спрятана, и сюда ведёт карточка
                   результата над списком. На широком она не нужна. */
                <motion.div key="stats" {...viewMotion} className="flex min-w-0 flex-1">
                  <StatsPanel tasks={data.tasks} categories={data.categories} habits={data.habits} phone />
                </motion.div>
              ) : (
                <motion.div key="tasks" {...viewMotion} className="flex min-w-0 flex-1">
                    <main className="flex min-w-0 flex-1 flex-col pb-4">
                    <div className="flex items-end gap-3 px-5 pt-2 pb-4">
                      <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-semibold text-fg">
                          {filterTitle(filter, data.categories)}
                        </h1>
                        <p className="mt-0.5 text-sm text-fg-3">
                          {openCount === 0
                            ? 'активных задач нет'
                            : `${openCount} ${plural(openCount, 'активная задача', 'активные задачи', 'активных задач')}`}
                        </p>
                      </div>

                      <div className="field flex w-44 items-center gap-2 px-3 py-2">
                        <MagnifyingGlassIcon size={14} className="shrink-0 text-fg-2" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Поиск"
                          aria-label="Поиск по задачам"
                          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
                        />
                      </div>

                      <Select
                        label="Сортировка"
                        value={sort}
                        onChange={(v) => setSort(v as SortMode)}
                        options={SORT_OPTIONS}
                        icon={<SortAscendingIcon size={14} className="shrink-0 text-fg-2" />}
                        className="w-48 shrink-0"
                      />
                    </div>

                    {/* Пока колонка обзора не влезает, результат дня стоит здесь. */}
                    <div className="px-5 pb-3 min-[1140px]:hidden">
                      <PulseCard tasks={data.tasks} habits={data.habits} onOpen={() => setView('stats')} />
                    </div>

                    <div className="px-5 pb-4">
                      <TaskComposer
                        categories={data.categories}
                        defaultCategoryId={
                          filter.kind === 'category' ? (filter.categoryId ?? null) : null
                        }
                        defaultDue={filter.kind === 'today' ? todayKey() : null}
                      />
                    </div>

                    <div className="scroll-y min-h-0 flex-1 px-5">
                      {!ready ? (
                        <TaskSkeleton />
                      ) : visible.length === 0 ? (
                        <EmptyState query={query} filter={filter} />
                      ) : (
                        <div className="flex flex-col gap-5">
                          {groups.map((group) => (
                            <section key={group.key}>
                              {group.title && (
                                <h2 className="mb-2 flex items-baseline gap-2 px-1 text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">
                                  {group.title}
                                  {/* No opacity here: it would drag the muted
                                      token below the 4.5:1 floor. */}
                                  <span className="tnum">{group.tasks.length}</span>
                                </h2>
                              )}
                              {sort === 'manual' ? (
                                <Reorder.Group
                                  axis="y"
                                  values={group.tasks}
                                  onReorder={(next) => reorderVisibleTasks(next.map((t) => t.id))}
                                  className="card divide-y divide-line-soft overflow-hidden"
                                >
                                  {group.tasks.map((task) => (
                                    <TaskItem
                                      key={task.id}
                                      task={task}
                                      categories={data.categories}
                                      draggable
                                    />
                                  ))}
                                </Reorder.Group>
                              ) : (
                                <ul className="card divide-y divide-line-soft overflow-hidden">
                                  <AnimatePresence initial={false}>
                                    {group.tasks.map((task) => (
                                      <TaskItem key={task.id} task={task} categories={data.categories} />
                                    ))}
                                  </AnimatePresence>
                                </ul>
                              )}
                            </section>
                          ))}
                        </div>
                      )}
                    </div>
                    </main>

                    <div className="hidden min-[1140px]:flex">
                      <StatsPanel tasks={data.tasks} categories={data.categories} habits={data.habits} />
                    </div>
                </motion.div>
              )}
            </div>

            <DesktopDock
              view={view}
              onNavigate={setView}
              overdue={data.tasks.filter((t) => matchesFilter(t, { kind: 'overdue' })).length}
            />
          </div>
        </div>

        <Toast />
      </div>
    </div>
  )
}

/**
 * Разделы на компьютере — то же нижнее меню, что на телефоне.
 *
 * Здесь места хватает на все шесть сразу, поэтому «Ещё» не нужно. Обзора среди
 * них нет: на широком окне статистика и так стоит справа от задач. Фильтры и
 * категории остаются в боковой панели — это не разделы, а виды одного списка.
 * Порядок тот же, что на телефоне, чтобы рука не переучивалась.
 */
function DesktopDock({
  view,
  onNavigate,
  overdue,
}: {
  view: View
  onNavigate: (view: View) => void
  overdue: number
}) {
  const items: DockItem[] = [
    { id: 'tasks', label: 'Задачи', Icon: TrayIcon, alert: overdue > 0, onPress: () => onNavigate('tasks') },
    { id: 'habits', label: 'Привычки', Icon: TargetIcon, onPress: () => onNavigate('habits') },
    { id: 'films', label: 'Фильмы', Icon: FilmSlateIcon, onPress: () => onNavigate('films') },
    { id: 'notepad', label: 'Блокнот', Icon: NotePencilIcon, onPress: () => onNavigate('notepad') },
    { id: 'calendar', label: 'Календарь', Icon: CalendarDotsIcon, onPress: () => onNavigate('calendar') },
    { id: 'settings', label: 'Настройки', Icon: GearSixIcon, onPress: () => onNavigate('settings') },
  ]

  return <Dock items={items} active={items.findIndex((item) => item.id === view)} />
}

/** Skeleton matches the row geometry so nothing jumps when data arrives. */
function TaskSkeleton() {
  return (
    <ul className="card divide-y divide-line-soft overflow-hidden" aria-hidden>
      {[68, 52, 74, 44, 60].map((width, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3.5">
          <span className="skeleton h-[18px] w-[18px] rounded-full" />
          <span className="skeleton h-3" style={{ width: `${width}%` }} />
        </li>
      ))}
    </ul>
  )
}

function EmptyState({ query, filter }: { query: string; filter: Filter }) {
  if (query.trim()) {
    return <Empty title="Ничего не найдено" body={`По запросу «${query.trim()}» задач нет`} />
  }

  switch (filter.kind) {
    case 'today':
      return <Empty title="На сегодня ничего" />
    case 'overdue':
      return <Empty title="Просроченного нет" />
    case 'done':
      return <Empty title="Пока ничего не выполнено" />
    case 'category':
      return <Empty title="В этой категории пусто" />
    default:
      return <Empty title="Задач нет" />
  }
}

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="card flex min-h-52 flex-col items-center justify-center gap-2 px-8 py-12 text-center">
      <p className="text-md font-medium text-fg-2">{title}</p>
      {body && <p className="max-w-xs text-sm leading-relaxed text-fg-3">{body}</p>}
    </div>
  )
}
