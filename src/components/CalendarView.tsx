import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Category, Task } from '../types'
import { addTask } from '../lib/store'
import {
  HOURS,
  countByDay,
  currentMonth,
  dayLabel,
  formatHour,
  hourOf,
  monthGrid,
  monthLabel,
  parseTime,
  shiftMonth,
  tasksOfDay,
  WEEKDAY_HEADS,
  type DayCell,
  type MonthRef,
} from '../lib/calendar'
import { plural, todayKey } from '../lib/date'
import { rowMotion } from '../lib/motion'
import { TaskItem } from './TaskItem'
import { CaretLeftIcon, CaretRightIcon, PlusIcon } from './icons'

interface CalendarViewProps {
  tasks: Task[]
  categories: Category[]
  phone?: boolean
}

/** С какого часа открывается расписание, если день пуст. */
const DAY_START = 7

/**
 * Календарь.
 *
 * Сверху месяц целиком — чтобы одним взглядом понять, в какие дни что-то есть.
 * Снизу выбранный день по часам — чтобы понять, во сколько именно. Это два
 * разных вопроса, и одним экраном без разделения на них не ответить: месяц с
 * подробностями не помещается, а день без месяца не даёт навигации.
 */
export function CalendarView({ tasks, categories, phone = false }: CalendarViewProps) {
  const [month, setMonth] = useState<MonthRef>(currentMonth)
  const [selected, setSelected] = useState<string>(todayKey)
  const [addingAt, setAddingAt] = useState<number | 'none' | null>(null)

  const cells = useMemo(() => monthGrid(month), [month])
  const byDay = useMemo(() => countByDay(tasks), [tasks])
  const dayTasks = useMemo(() => tasksOfDay(tasks, selected), [tasks, selected])
  const timed = dayTasks.filter((task) => task.dueTime !== null)
  const untimed = dayTasks.filter((task) => task.dueTime === null)

  const agendaRef = useRef<HTMLDivElement>(null)
  const firstHour = timed.length > 0 ? hourOf(timed[0]) : null

  /*
   * Расписание открывается не на полуночи.
   *
   * Сутки — это двадцать четыре строки, и первым делом было бы видно три часа
   * ночи. Прокрутка идёт к первому занятому часу, а если день пуст — к утру.
   */
  useEffect(() => {
    const container = agendaRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(
      `[data-hour="${firstHour ?? DAY_START}"]`,
    )
    if (!target) return
    /*
     * Отступ считается через прямоугольники, а не через offsetTop.
     *
     * offsetTop меряется от ближайшего позиционированного предка, а у
     * прокручиваемого блока position не выставлен — и значение приходило от
     * самого верха экрана, вместе с высотой месячной сетки. Прокрутка тогда
     * улетала за нижнюю границу и упиралась в неё.
     */
    const offset =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop
    container.scrollTop = offset
    /*
     * firstHour в зависимостях, а не только день.
     *
     * При первой отрисовке данные из хранилища ещё не пришли, день выглядит
     * пустым — и расписание уезжало к семи утра, оставаясь там же после
     * загрузки. Так оно доедет до первого занятого часа, когда тот появится.
     * Перепрыгнет и позже, если появилось дело раньше всех, — но туда как раз
     * и надо смотреть.
     */
  }, [selected, firstHour])

  const pick = (key: string) => {
    setSelected(key)
    setAddingAt(null)
    // Клик по хвосту соседнего месяца листает туда, а не молча ничего не делает.
    const [year, monthNumber] = key.split('-').map(Number)
    if (year !== month.year || monthNumber - 1 !== month.month) {
      setMonth({ year, month: monthNumber - 1 })
    }
  }

  const add = (hour: number | 'none') => (title: string, time: string | null) => {
    addTask({
      title,
      due: selected,
      dueTime: hour === 'none' ? time : (time ?? formatHour(hour)),
    })
    setAddingAt(null)
  }

  const grid = (
    <div className={phone ? 'shrink-0 px-4 pt-3' : 'w-84 shrink-0 pt-2 pl-1'}>
      <div className="mb-2 flex items-center gap-1">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-fg">
          {monthLabel(month)}
        </h1>
        <StepButton label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}>
          <CaretLeftIcon size={16} />
        </StepButton>
        <StepButton label="Следующий месяц" onClick={() => setMonth(shiftMonth(month, 1))}>
          <CaretRightIcon size={16} />
        </StepButton>
        <button
          type="button"
          onClick={() => {
            setMonth(currentMonth())
            pick(todayKey())
          }}
          className="focus-ring press ml-1 shrink-0 rounded-full bg-fill px-3 py-1.5 text-xs text-fg-2 transition-colors duration-150 hover:bg-fill-hover hover:text-fg"
        >
          Сегодня
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {WEEKDAY_HEADS.map((head) => (
          <span key={head} aria-hidden className="pb-1 text-center text-xs text-fg-3">
            {head}
          </span>
        ))}

        {cells.map((cell) => (
          <DayButton
            key={cell.key}
            cell={cell}
            tasks={byDay.get(cell.key) ?? []}
            categories={categories}
            selected={cell.key === selected}
            onPick={() => pick(cell.key)}
          />
        ))}
      </div>
    </div>
  )

  const agenda = (
    <div
      className={
        phone ? 'flex min-h-0 flex-1 flex-col pt-3' : 'card flex min-h-0 flex-1 flex-col'
      }
    >
      <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3 pb-2">
        <h2 className="text-md min-w-0 truncate font-medium text-fg">{dayLabel(selected)}</h2>
        <span className="shrink-0 text-xs text-fg-3">
          {dayTasks.length === 0
            ? 'пусто'
            : `${dayTasks.length} ${plural(dayTasks.length, 'задача', 'задачи', 'задач')}`}
        </span>
      </div>

      <div ref={agendaRef} className="scroll-y min-h-0 flex-1 px-2 pb-4">
        {/* Дела без часа — над сеткой: они относятся ко всему дню, и в конце
            суток до них пришлось бы доскроллить. */}
        <HourBlock
          label="Весь день"
          hourKey="none"
          tasks={untimed}
          categories={categories}
          adding={addingAt === 'none'}
          onToggleAdd={() => setAddingAt(addingAt === 'none' ? null : 'none')}
          onSubmit={add('none')}
        />

        {HOURS.map((hour) => (
          <HourBlock
            key={hour}
            label={formatHour(hour)}
            hourKey={hour}
            tasks={timed.filter((task) => hourOf(task) === hour)}
            categories={categories}
            adding={addingAt === hour}
            onToggleAdd={() => setAddingAt(addingAt === hour ? null : hour)}
            onSubmit={add(hour)}
          />
        ))}
      </div>
    </div>
  )

  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {grid}
        {agenda}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 gap-3 pr-4 pb-4 pl-1">
      {grid}
      {agenda}
    </div>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring press grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg"
    >
      {children}
    </button>
  )
}

/** Клетка месяца: число и до трёх точек по цветам категорий. */
function DayButton({
  cell,
  tasks,
  categories,
  selected,
  onPick,
}: {
  cell: DayCell
  tasks: Task[]
  categories: Category[]
  selected: boolean
  onPick: () => void
}) {
  const open = tasks.filter((task) => !task.done)
  const dots = open.slice(0, 3)

  const tone = selected
    ? 'text-fg'
    : !cell.inMonth
      ? 'text-fg-3'
      : cell.weekend
        ? 'text-fg-2'
        : 'text-fg'

  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={selected ? 'date' : undefined}
      aria-label={`${cell.day}, задач: ${open.length}`}
      className={`focus-ring press relative flex h-11 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors duration-150 ${
        selected ? 'bg-accent-dim' : 'hover:bg-raised'
      }`}
    >
      <span
        className={`tnum text-sm leading-none ${tone} ${
          cell.today ? 'font-semibold underline decoration-2 underline-offset-4' : ''
        }`}
      >
        {cell.day}
      </span>

      {/* Точка на задачу, максимум три. Число рядом с ними читалось бы как ещё
          одна дата, поэтому «сколько именно» показывает расписание ниже. */}
      <span className="flex h-1.5 items-center gap-0.5">
        {dots.map((task) => (
          <span
            key={task.id}
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background:
                categories.find((c) => c.id === task.categoryId)?.color ?? 'var(--color-fg-3)',
            }}
          />
        ))}
        {open.length > 3 && <span className="text-[9px] leading-none text-fg-3">+</span>}
      </span>
    </button>
  )
}

/** Один час расписания: подпись слева, задачи справа, плюс для добавления. */
function HourBlock({
  label,
  hourKey,
  tasks,
  categories,
  adding,
  onToggleAdd,
  onSubmit,
}: {
  label: string
  hourKey: number | 'none'
  tasks: Task[]
  categories: Category[]
  adding: boolean
  onToggleAdd: () => void
  onSubmit: (title: string, time: string | null) => void
}) {
  return (
    <section data-hour={hourKey} className="group/hour flex gap-2 border-b border-line-soft py-1">
      {/* Сама подпись часа и есть кнопка «добавить сюда»: отдельный плюс в
          каждой из двадцати пяти строк превратил бы расписание в частокол. */}
      <button
        type="button"
        onClick={onToggleAdd}
        aria-label={`Добавить на ${label}`}
        title={`Добавить на ${label}`}
        aria-expanded={adding}
        className="focus-ring press mt-1 flex w-16 shrink-0 items-start justify-between gap-1 rounded-md px-1 py-1 text-left"
      >
        <span className="tnum text-xs text-fg-3">{label}</span>
        <PlusIcon
          size={11}
          className={`mt-0.5 shrink-0 text-fg-3 transition-opacity duration-150 group-hover/hour:opacity-100 ${
            adding ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </button>

      <div className="min-w-0 flex-1">
        {tasks.length > 0 && (
          <ul className="flex flex-col">
            <AnimatePresence initial={false}>
              {tasks.map((task) => (
                <TaskItem key={task.id} task={task} categories={categories} compact />
              ))}
            </AnimatePresence>
          </ul>
        )}

        {adding && <SlotComposer hourKey={hourKey} onSubmit={onSubmit} />}

        {tasks.length === 0 && !adding && <div className="h-6" />}
      </div>
    </section>
  )
}

function SlotComposer({
  hourKey,
  onSubmit,
}: {
  hourKey: number | 'none'
  onSubmit: (title: string, time: string | null) => void
}) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState(hourKey === 'none' ? '' : formatHour(hourKey))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    onSubmit(trimmed, parseTime(time))
    setTitle('')
  }

  return (
    <motion.div {...rowMotion} className="my-1 flex items-center gap-2">
      <input
        ref={ref}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setTitle('')
        }}
        placeholder="Что в это время?"
        aria-label="Что в это время"
        className="field text-md min-w-0 flex-1 px-3 py-2 text-fg outline-none placeholder:text-fg-3"
      />
      {/* Час можно поправить прямо здесь: строка задаёт начало, а встреча
          нередко в 14:30, а не ровно в 14:00. */}
      <input
        value={time}
        onChange={(e) => setTime(e.target.value.replace(/[^\d:.]/g, '').slice(0, 5))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        inputMode="numeric"
        placeholder="--:--"
        aria-label="Время"
        className="field tnum w-16 shrink-0 px-1 py-2 text-center text-sm text-fg outline-none placeholder:text-fg-3"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        aria-label="Добавить"
        className="focus-ring press btn-primary grid h-10 w-10 shrink-0 place-items-center"
      >
        <PlusIcon size={16} />
      </button>
    </motion.div>
  )
}
