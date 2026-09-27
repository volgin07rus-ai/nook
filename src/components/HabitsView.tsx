import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Habit } from '../types'
import { CATEGORY_PALETTE } from '../types'
import { addHabit, deleteHabit, toggleHabitDay, updateHabit } from '../lib/store'
import {
  existedOn,
  isDone,
  lastDays,
  monthKeys,
  pct,
  streakOf,
  summarize,
  type DayTotal,
} from '../lib/habits'
import { currentMonth, monthLabel } from '../lib/calendar'
import { plural, shiftDays, todayKey } from '../lib/date'
import { rowMotion, T_LAYOUT } from '../lib/motion'
import { inkOn } from '../lib/color'
import { CheckIcon, FireIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from './icons'

interface HabitsViewProps {
  habits: Habit[]
  phone?: boolean
}

/**
 * Привычки.
 *
 * Сверху — витрина: четыре плитки с числами и маленькими графиками, чтобы
 * результат было видно раньше, чем список. Потом сам список на сегодня — по
 * кружку на привычку, — и под ним два графика: столбики по дням и сетка
 * месяца, где каждую точку можно поставить задним числом.
 */
export function HabitsView({ habits, phone = false }: HabitsViewProps) {
  const today = todayKey()
  const summary = useMemo(() => summarize(habits), [habits])
  const fortnight = useMemo(() => lastDays(habits, 14), [habits])
  const month = useMemo(() => {
    const ref = currentMonth()
    return { label: monthLabel(ref), keys: monthKeys(ref.year, ref.month) }
  }, [])

  const subtitle =
    habits.length === 0
      ? 'пока ни одной'
      : summary.doneToday === summary.total
        ? 'на сегодня всё отмечено'
        : `${summary.doneToday} из ${summary.total} на сегодня`

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className={phone ? 'shrink-0 px-4 pt-3' : 'shrink-0 px-5 pt-2'}>
        <h1 className="text-xl font-semibold text-fg">Привычки</h1>
        <p className="mt-0.5 text-sm text-fg-3">{subtitle}</p>
      </header>

      <div className={`scroll-y min-h-0 flex-1 ${phone ? 'px-4 pt-3 pb-4' : 'px-5 pt-4 pb-4'}`}>
        <div className={`flex flex-col gap-3 ${phone ? '' : 'mx-auto max-w-4xl'}`}>
          <div className={`grid gap-3 ${phone ? 'grid-cols-2' : 'grid-cols-4'}`}>
            <Tile
              eyebrow="Сегодня"
              value={`${summary.doneToday}/${summary.total}`}
              hint={summary.total === 0 ? 'нет привычек' : 'отмечено'}
            >
              <Progress value={pct(summary.doneToday, summary.total)} />
            </Tile>
            <Tile
              eyebrow="Серия"
              value={summary.streak}
              hint={`${plural(summary.streak, 'день', 'дня', 'дней')} подряд`}
            >
              <p className="truncate text-xs text-fg-3">
                {summary.leader
                  ? `${summary.leader.habit.name} — ${summary.leader.days} ${plural(summary.leader.days, 'день', 'дня', 'дней')}`
                  : 'начни сегодня'}
              </p>
            </Tile>
            <Tile eyebrow="Неделя" value={`${summary.weekRate}%`} hint="за 7 дней">
              <MiniBars rows={summary.week} />
            </Tile>
            <Tile eyebrow="Месяц" value={`${summary.monthRate}%`} hint={month.label.toLowerCase()}>
              <MiniDots rows={summary.month} />
            </Tile>
          </div>

          <Composer count={habits.length} />

          {habits.length === 0 ? (
            <Empty />
          ) : (
            <>
              <section className="card overflow-hidden">
                <ul className="divide-y divide-line-soft">
                  <AnimatePresence initial={false}>
                    {habits.map((habit) => (
                      <HabitRow key={habit.id} habit={habit} today={today} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>

              <div className={`grid gap-3 ${phone ? '' : 'grid-cols-2'}`}>
                <section className="card px-5 py-4">
                  <Eyebrow>Последние 14 дней</Eyebrow>
                  <Bars rows={fortnight} />
                </section>

                <section className="card px-5 py-4">
                  <Eyebrow>{month.label}</Eyebrow>
                  <div className="mt-1 flex flex-col">
                    {habits.map((habit) => (
                      <MonthStrip key={habit.id} habit={habit} keys={month.keys} today={today} />
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ витрина

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">{children}</h2>
}

/** Плитка витрины: подпись, число, строка пояснения и картинка внизу. */
function Tile({
  eyebrow,
  value,
  hint,
  children,
}: {
  eyebrow: string
  value: string | number
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="card flex flex-col px-4 py-3.5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="tnum text-xl leading-none font-semibold text-fg">{value}</span>
        <span className="truncate text-xs text-fg-3">{hint}</span>
      </p>
      <div className="mt-3 flex h-7 items-end">{children}</div>
    </section>
  )
}

function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-fill">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${value}%`, transition: 'width 220ms var(--ease-out-quart)' }}
      />
    </div>
  )
}

/** Семь столбиков по доле отмеченного, сегодняшний ярче. */
function MiniBars({ rows }: { rows: DayTotal[] }) {
  return (
    <div className="flex h-full w-full items-end gap-1">
      {rows.map((day) => {
        const value = pct(day.done, day.total)
        return (
          <div
            key={day.key}
            className="min-w-0 flex-1 rounded-sm"
            title={`${day.label}: ${day.done} из ${day.total}`}
            style={{
              height: `${value === 0 ? 8 : Math.max(14, value)}%`,
              background: value === 0 ? 'var(--color-line)' : 'var(--color-accent)',
              opacity: value === 0 || day.isToday ? 1 : 0.45,
              transition: 'height 220ms var(--ease-out-quart)',
            }}
          />
        )
      })}
    </div>
  )
}

/** Точка на день месяца: полная, половинная, пустая. */
function MiniDots({ rows }: { rows: DayTotal[] }) {
  return (
    <div className="grid w-full grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px]">
      {rows.map((day) => {
        const full = day.total > 0 && day.done === day.total
        const some = day.done > 0
        return (
          <span
            key={day.key}
            title={`${day.day}: ${day.done} из ${day.total}`}
            className="aspect-square rounded-full"
            style={{
              background: some ? 'var(--color-accent)' : 'var(--color-line)',
              opacity: full || !some ? 1 : 0.45,
            }}
          />
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- composer

function Composer({ count }: { count: number }) {
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    // Шаг в пять по палитре из шестнадцати: соседние привычки получают
    // заметно разные цвета, а не два оттенка одного.
    addHabit(name, CATEGORY_PALETTE[(count * 5) % CATEGORY_PALETTE.length])
    setName('')
  }

  return (
    <div className="field flex items-center gap-2.5 px-3 py-2.5">
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim()}
        aria-label="Добавить привычку"
        title="Добавить привычку"
        className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-fg disabled:opacity-40"
      >
        <PlusIcon size={16} />
      </button>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') setName('')
        }}
        placeholder="Новая привычка"
        aria-label="Новая привычка"
        className="text-md min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
      />
    </div>
  )
}

function Empty() {
  return (
    <div className="card flex min-h-40 flex-col items-center justify-center gap-2 px-8 py-10 text-center">
      <p className="text-md font-medium text-fg-2">Привычек пока нет</p>
      <p className="max-w-xs text-sm leading-relaxed text-fg-3">
        Впиши первую сверху — например, «Зарядка» или «Читать 20 минут». Каждый день
        отмечай кружком, а графики соберутся сами
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ строки

/** Одна привычка: кружок на сегодня, название, серия и последние семь дней. */
function HabitRow({ habit, today }: { habit: Habit; today: string }) {
  const [editing, setEditing] = useState(false)
  const done = isDone(habit, today)
  const streak = streakOf(habit.days, today)

  return (
    <motion.li layout="position" {...rowMotion} transition={T_LAYOUT} className="group relative">
      {editing ? (
        <HabitEditor habit={habit} onDone={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? `${habit.name}: снять отметку за сегодня` : `${habit.name}: отметить сегодня`}
            onClick={() => toggleHabitDay(habit.id, today)}
            className="focus-ring press grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150"
            style={{ borderColor: habit.color, background: done ? habit.color : 'transparent' }}
          >
            <CheckIcon
              size={14}
              weight="bold"
              className="transition-opacity duration-150"
              style={{ color: inkOn(habit.color), opacity: done ? 1 : 0 }}
            />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-md truncate text-fg">{habit.name}</p>
            {/* Серия и неделя в одной строке под названием, а не сбоку от
                него: сбоку они отъедали у названия половину ширины телефона. */}
            <div className="mt-1 flex items-center gap-2.5 text-xs text-fg-3">
              <span className="flex shrink-0 items-center gap-1">
                <FireIcon size={12} weight={streak > 0 ? 'fill' : 'regular'} />
                <span className="tnum">
                  {streak} {plural(streak, 'день', 'дня', 'дней')}
                </span>
              </span>
              <WeekStrip habit={habit} today={today} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Изменить привычку ${habit.name}`}
            title="Изменить"
            className="focus-ring press grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-3 opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
          >
            <PencilSimpleIcon size={14} />
          </button>
        </div>
      )}
    </motion.li>
  )
}

/** Семь квадратиков за неделю, сегодняшний обведён. */
function WeekStrip({ habit, today }: { habit: Habit; today: string }) {
  const keys = Array.from({ length: 7 }, (_, i) => shiftDays(i - 6))
  return (
    <div className="flex shrink-0 items-center gap-[3px]" aria-hidden>
      {keys.map((key) => {
        const on = isDone(habit, key)
        const absent = !existedOn(habit, key)
        return (
          <span
            key={key}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{
              background: on ? habit.color : 'var(--color-fill)',
              opacity: absent && !on ? 0.3 : 1,
              boxShadow: key === today ? `inset 0 0 0 1.5px ${habit.color}` : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

function HabitEditor({ habit, onDone }: { habit: Habit; onDone: () => void }) {
  const [name, setName] = useState(habit.name)

  const save = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== habit.name) updateHabit(habit.id, { name: trimmed })
    onDone()
  }

  return (
    <div className="enter bg-raised px-4 py-4">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') onDone()
        }}
        aria-label="Название привычки"
        className="field text-md w-full px-3 py-2 text-fg outline-none"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORY_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => updateHabit(habit.id, { color })}
            aria-label={`Цвет ${color}`}
            aria-pressed={color === habit.color}
            className="focus-ring grid h-7 w-7 place-items-center rounded-full transition-transform duration-150 hover:scale-110"
            style={{ background: color }}
          >
            {color === habit.color && (
              <CheckIcon size={12} weight="bold" style={{ color: inkOn(color) }} />
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => deleteHabit(habit.id)}
          aria-label={`Удалить привычку ${habit.name}`}
          title="Удалить"
          className="focus-ring press grid h-9 w-9 place-items-center rounded-full text-fg-3 transition-colors duration-150 hover:text-danger"
        >
          <TrashIcon size={15} />
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onDone} className="focus-ring press btn-quiet px-4 py-2 text-sm">
          Отмена
        </button>
        <button type="button" onClick={save} className="focus-ring press btn-primary px-4 py-2 text-sm">
          Готово
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- графики

/** Столбик на день по доле отмеченных привычек; над сегодняшним — процент. */
function Bars({ rows }: { rows: DayTotal[] }) {
  return (
    <div className="mt-4 flex items-end gap-1.5">
      {rows.map((day) => {
        const value = pct(day.done, day.total)
        return (
          <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span
              className={`tnum rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
                day.isToday ? 'bg-accent text-on-accent' : 'invisible'
              }`}
            >
              {value}%
            </span>
            <div className="flex h-20 w-full items-end">
              <div
                className="w-full rounded-md"
                title={`${day.day} ${day.label}: ${day.done} из ${day.total}`}
                style={{
                  height: `${value === 0 ? 4 : Math.max(8, value)}%`,
                  background: value === 0 ? 'var(--color-line)' : 'var(--color-accent)',
                  opacity: value === 0 || day.isToday ? 1 : 0.45,
                  transition: 'height 220ms var(--ease-out-quart)',
                }}
              />
            </div>
            <span
              className={`tnum text-[10px] leading-none ${day.isToday ? 'text-fg' : 'text-fg-3'}`}
            >
              {day.day}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Месяц одной привычки точками. Точка — кнопка: забытую вчерашнюю отметку
 * ставят отсюда, не залезая в историю. Будущие дни не нажимаются.
 */
function MonthStrip({ habit, keys, today }: { habit: Habit; keys: string[]; today: string }) {
  const past = keys.filter((key) => key <= today && existedOn(habit, key))
  const done = past.filter((key) => isDone(habit, key)).length

  return (
    <div className="border-t border-line-soft py-3 first:border-t-0">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: habit.color }} />
        <span className="min-w-0 flex-1 truncate text-fg-2">{habit.name}</span>
        <span className="tnum shrink-0 text-xs text-fg-3">
          {done}/{past.length}
        </span>
      </div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}
      >
        {keys.map((key) => {
          const future = key > today
          const on = isDone(habit, key)
          const absent = !existedOn(habit, key)
          return (
            <button
              key={key}
              type="button"
              disabled={future}
              aria-pressed={on}
              aria-label={`${Number(key.slice(8))} ${habit.name}`}
              onClick={() => toggleHabitDay(habit.id, key)}
              className="focus-ring aspect-square rounded-full transition-colors duration-150"
              style={{
                background: on ? habit.color : 'var(--color-fill)',
                opacity: future || (absent && !on) ? 0.3 : 1,
                boxShadow:
                  key === today
                    ? `0 0 0 2px var(--color-surface), 0 0 0 3.5px ${habit.color}`
                    : undefined,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
