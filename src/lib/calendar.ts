/**
 * Календарь: тот же список задач, разложенный по дням и часам.
 *
 * Отдельной сущности «событие» здесь нет и не нужно. Встреча — это задача со
 * сроком и временем, у неё уже есть категория, напоминание и отметка о
 * выполнении. Заводить рядом второй тип значило бы дублировать всё это и
 * потом объяснять пользователю, почему напоминание у события ставится не так,
 * как у задачи.
 */

import type { Task } from '../types'
import { dateKey, todayKey } from './date'

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const MONTHS_IN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

const WEEKDAYS_FULL = [
  'Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота',
]

/** Неделя начинается с понедельника — как принято здесь, а не как в Date. */
export const WEEKDAY_HEADS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export interface DayCell {
  /** 'YYYY-MM-DD' */
  key: string
  day: number
  /** false у хвостов соседних месяцев, которыми добита сетка */
  inMonth: boolean
  today: boolean
  /** суббота или воскресенье */
  weekend: boolean
}

export interface MonthRef {
  year: number
  /** 0–11, как в Date */
  month: number
}

export function currentMonth(): MonthRef {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function monthOf(key: string): MonthRef {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export function shiftMonth(ref: MonthRef, by: number): MonthRef {
  const d = new Date(ref.year, ref.month + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function monthLabel(ref: MonthRef): string {
  const label = MONTHS[ref.month]
  const title = label.charAt(0).toUpperCase() + label.slice(1)
  return ref.year === new Date().getFullYear() ? title : `${title} ${ref.year}`
}

/** 'Пятница, 15 августа' */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const weekday = WEEKDAYS_FULL[new Date(y, m - 1, d).getDay()]
  return `${weekday}, ${d} ${MONTHS_IN[m - 1]}`
}

/**
 * Сетка месяца: всегда шесть недель по семь дней.
 *
 * Ровно шесть, а не столько, сколько нужно именно этому месяцу: иначе при
 * листании сетка то в пять рядов, то в шесть, и всё под ней прыгает вверх-вниз.
 */
export function monthGrid(ref: MonthRef): DayCell[] {
  const first = new Date(ref.year, ref.month, 1)
  // getDay(): 0 — воскресенье. Сдвигаем к понедельнику.
  const lead = (first.getDay() + 6) % 7
  const today = todayKey()

  const cells: DayCell[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(ref.year, ref.month, 1 - lead + i)
    const key = dateKey(date)
    const weekday = date.getDay()
    cells.push({
      key,
      day: date.getDate(),
      inMonth: date.getMonth() === ref.month && date.getFullYear() === ref.year,
      today: key === today,
      weekend: weekday === 0 || weekday === 6,
    })
  }
  return cells
}

/** Все задачи одного дня, в порядке времени; безвременные идут после. */
export function tasksOfDay(tasks: Task[], key: string): Task[] {
  return tasks
    .filter((task) => task.due === key)
    .sort((a, b) => {
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime)
      if (a.dueTime !== b.dueTime) return a.dueTime ? -1 : 1
      return a.createdAt - b.createdAt
    })
}

/** Сколько задач в каждом дне — для точек в сетке, одним проходом по списку. */
export function countByDay(tasks: Task[]): Map<string, Task[]> {
  const out = new Map<string, Task[]>()
  for (const task of tasks) {
    if (!task.due) continue
    const list = out.get(task.due)
    if (list) list.push(task)
    else out.set(task.due, [task])
  }
  return out
}

export const HOURS = Array.from({ length: 24 }, (_, h) => h)

export function formatHour(hour: number): string {
  return `${`${hour}`.padStart(2, '0')}:00`
}

/** Час, в котором стоит задача, или null если времени нет. */
export function hourOf(task: Task): number | null {
  if (!task.dueTime) return null
  const hour = Number(task.dueTime.slice(0, 2))
  return Number.isFinite(hour) ? hour : null
}

/** 'ЧЧ:ММ' из того, что набрали руками. Пустое — это «без времени». */
export function parseTime(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  const m = /^(\d{1,2})[:.]?(\d{2})?$/.exec(text)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h > 23 || min > 59) return null
  return `${`${h}`.padStart(2, '0')}:${`${min}`.padStart(2, '0')}`
}
