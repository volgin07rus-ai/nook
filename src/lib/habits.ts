/**
 * Арифметика привычек: серии, проценты, ряды по дням.
 *
 * Всё считается от списка отметок, который хранится у самой привычки. Никаких
 * отдельных счётчиков в данных нет — их пришлось бы держать в согласии с
 * отметками при каждой правке, а пересчитать по нескольким сотням дат
 * дешевле, чем один раз ошибиться.
 */

import type { Habit } from '../types'
import { dateKey, daysBetween, shiftDays, todayKey, weekdayShort } from './date'

export function isDone(habit: Habit, key: string): boolean {
  return habit.days.includes(key)
}

/**
 * Существовала ли привычка в этот день.
 *
 * Заведённой сегодня нечего было отмечать вчера, и считать ей вчерашний
 * пропуск — значит начинать каждую привычку с провала.
 */
export function existedOn(habit: Habit, key: string): boolean {
  return dateKey(habit.createdAt) <= key
}

/**
 * Серия дней подряд, считая назад от сегодня.
 *
 * Пустое «сегодня» серию не рвёт — день ещё не кончился. Рвёт пустое «вчера».
 */
export function streakOf(days: Iterable<string>, today = todayKey()): number {
  const set = new Set(days)
  let cursor = set.has(today) ? 0 : 1
  let length = 0
  while (length < 3650 && set.has(shiftDays(-cursor))) {
    length++
    cursor++
  }
  return length
}

/** Самая длинная серия за всю историю привычки. */
export function bestStreak(habit: Habit): number {
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of habit.days) {
    run = previous !== null && daysBetween(previous, key) === 1 ? run + 1 : 1
    if (run > best) best = run
    previous = key
  }
  return best
}

export interface DayTotal {
  key: string
  /** «пн», «вт»… */
  label: string
  /** число месяца */
  day: number
  done: number
  /** сколько привычек существовало в этот день */
  total: number
  isToday: boolean
}

/** Сколько привычек отмечено в один день и сколько их тогда было всего. */
export function totalsOn(habits: Habit[], key: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const habit of habits) {
    if (!existedOn(habit, key)) continue
    total++
    if (isDone(habit, key)) done++
  }
  return { done, total }
}

function dayTotal(habits: Habit[], key: string, today: string): DayTotal {
  return {
    key,
    label: weekdayShort(key),
    day: Number(key.slice(8)),
    ...totalsOn(habits, key),
    isToday: key === today,
  }
}

/** Последние `count` дней, сегодняшний последним. */
export function lastDays(habits: Habit[], count: number): DayTotal[] {
  const today = todayKey()
  const out: DayTotal[] = []
  for (let offset = count - 1; offset >= 0; offset--) {
    out.push(dayTotal(habits, shiftDays(-offset), today))
  }
  return out
}

/** Все дни месяца по порядку, включая будущие. */
export function monthKeys(year: number, month: number): string[] {
  const length = new Date(year, month + 1, 0).getDate()
  return Array.from({ length }, (_, i) => dateKey(new Date(year, month, i + 1)))
}

export function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function sum(rows: DayTotal[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const row of rows) {
    done += row.done
    total += row.total
  }
  return { done, total }
}

export interface HabitsSummary {
  total: number
  doneToday: number
  /** дней подряд хотя бы с одной отметкой, по всем привычкам вместе */
  streak: number
  /** чья текущая серия длиннее всех */
  leader: { habit: Habit; days: number } | null
  week: DayTotal[]
  /** 0–100 за последние семь дней */
  weekRate: number
  /** дни текущего месяца по сегодняшний */
  month: DayTotal[]
  monthRate: number
}

export function summarize(habits: Habit[]): HabitsSummary {
  const today = todayKey()
  const { done: doneToday, total } = totalsOn(habits, today)

  const everyDay = new Set<string>()
  for (const habit of habits) for (const day of habit.days) everyDay.add(day)

  let leader: HabitsSummary['leader'] = null
  for (const habit of habits) {
    const days = streakOf(habit.days, today)
    if (days > 0 && (leader === null || days > leader.days)) leader = { habit, days }
  }

  const week = lastDays(habits, 7)
  const now = new Date()
  const month = monthKeys(now.getFullYear(), now.getMonth())
    .filter((key) => key <= today)
    .map((key) => dayTotal(habits, key, today))

  const w = sum(week)
  const m = sum(month)

  return {
    total,
    doneToday,
    streak: streakOf(everyDay, today),
    leader,
    week,
    weekRate: pct(w.done, w.total),
    month,
    monthRate: pct(m.done, m.total),
  }
}
