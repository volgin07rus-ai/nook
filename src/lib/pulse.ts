/**
 * Результативность дня для главного экрана: задачи и привычки вместе.
 *
 * Два раздела, но день один. Смотреть на него удобно одним числом — сколько
 * из намеченного на сегодня уже сделано, — и одной серией: сколько дней подряд
 * было сделано хоть что-нибудь. Обзор разбирает это подробнее, а здесь только
 * то, что читается за секунду над списком.
 */

import type { Habit, Task } from '../types'
import { dateKey, shiftDays, todayKey, weekdayShort } from './date'
import { streakOf, totalsOn } from './habits'

export interface PulseDay {
  key: string
  label: string
  /** закрытых задач плюс отмеченных привычек */
  count: number
  isToday: boolean
}

export interface Pulse {
  /** намечено на сегодня: задачи со сроком «сегодня» и все привычки */
  planned: number
  /** из них сделано */
  done: number
  /** 0–100, или null, когда на сегодня ничего не намечено */
  rate: number | null
  /** задач закрыто сегодня, с любым сроком */
  tasksDone: number
  habitsDone: number
  habitsTotal: number
  /** дней подряд, когда закрыта задача или отмечена привычка */
  streak: number
  week: PulseDay[]
  /** максимум за неделю, чтобы масштабировать столбики */
  peak: number
}

export function computePulse(tasks: Task[], habits: Habit[]): Pulse {
  const today = todayKey()

  const closedByDay = new Map<string, number>()
  for (const task of tasks) {
    if (!task.done || task.completedAt === null) continue
    const key = dateKey(task.completedAt)
    closedByDay.set(key, (closedByDay.get(key) ?? 0) + 1)
  }

  const week: PulseDay[] = []
  for (let offset = 6; offset >= 0; offset--) {
    const key = shiftDays(-offset)
    const count = (closedByDay.get(key) ?? 0) + totalsOn(habits, key).done
    week.push({ key, label: weekdayShort(key), count, isToday: key === today })
  }

  const active = new Set<string>(closedByDay.keys())
  for (const habit of habits) for (const day of habit.days) active.add(day)

  const dueToday = tasks.filter((task) => task.due === today)
  const habitsToday = totalsOn(habits, today)

  const planned = dueToday.length + habitsToday.total
  const done = dueToday.filter((task) => task.done).length + habitsToday.done

  return {
    planned,
    done,
    rate: planned === 0 ? null : Math.round((done / planned) * 100),
    tasksDone: closedByDay.get(today) ?? 0,
    habitsDone: habitsToday.done,
    habitsTotal: habitsToday.total,
    streak: streakOf(active, today),
    week,
    peak: Math.max(1, ...week.map((day) => day.count)),
  }
}
