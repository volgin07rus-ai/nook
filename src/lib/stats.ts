import type { Task } from '../types'
import { dateKey, daysBetween, isOverdue, shiftDays, todayKey, weekdayShort } from './date'

export interface DayBucket {
  key: string
  label: string
  done: number
  isToday: boolean
}

export interface Stats {
  total: number
  done: number
  open: number
  /** 0–100, rounded */
  rate: number
  doneToday: number
  dueToday: number
  overdue: number
  /** consecutive days ending today with at least one completed task */
  streak: number
  week: DayBucket[]
  /** best single day in the last 7, used to scale the chart */
  weekPeak: number
}

export function computeStats(tasks: Task[], days = 7): Stats {
  const today = todayKey()
  const total = tasks.length
  const done = tasks.filter((t) => t.done).length

  const completionsByDay = new Map<string, number>()
  for (const task of tasks) {
    if (!task.done || task.completedAt === null) continue
    const key = dateKey(task.completedAt)
    completionsByDay.set(key, (completionsByDay.get(key) ?? 0) + 1)
  }

  const week: DayBucket[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const key = shiftDays(-offset)
    week.push({
      key,
      label: weekdayShort(key),
      done: completionsByDay.get(key) ?? 0,
      isToday: key === today,
    })
  }

  // A streak survives today being empty — it only breaks once yesterday is empty too.
  let streak = 0
  let cursor = completionsByDay.get(today) ? 0 : 1
  while (cursor < 3650) {
    const key = shiftDays(-cursor)
    if (!completionsByDay.get(key)) break
    streak++
    cursor++
  }

  return {
    total,
    done,
    open: total - done,
    rate: total === 0 ? 0 : Math.round((done / total) * 100),
    doneToday: completionsByDay.get(today) ?? 0,
    dueToday: tasks.filter((t) => !t.done && t.due === today).length,
    overdue: tasks.filter((t) => isOverdue(t.due, t.done)).length,
    streak,
    week,
    weekPeak: Math.max(1, ...week.map((d) => d.done)),
  }
}

export type SortMode = 'smart' | 'manual' | 'created' | 'due' | 'priority' | 'alpha'

const PRIORITY_WEIGHT = { high: 0, normal: 1, low: 2 } as const

/** Undated tasks sort after dated ones instead of jumping to the top. */
function dueRank(due: string | null): number {
  if (!due) return Number.MAX_SAFE_INTEGER
  return daysBetween('1970-01-01', due)
}

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  // Manual order is the stored order: dragging a row rewrites the array.
  if (mode === 'manual') return tasks

  const sorted = [...tasks]
  switch (mode) {
    case 'due':
      return sorted.sort((a, b) => dueRank(a.due) - dueRank(b.due) || b.createdAt - a.createdAt)
    case 'priority':
      return sorted.sort(
        (a, b) =>
          PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || b.createdAt - a.createdAt,
      )
    case 'alpha':
      return sorted.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    case 'created':
      return sorted.sort((a, b) => b.createdAt - a.createdAt)
    case 'smart':
    default:
      // Overdue first, then by deadline, then by priority, then newest.
      return sorted.sort((a, b) => {
        const aLate = isOverdue(a.due, a.done) ? 0 : 1
        const bLate = isOverdue(b.due, b.done) ? 0 : 1
        return (
          aLate - bLate ||
          dueRank(a.due) - dueRank(b.due) ||
          PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
          b.createdAt - a.createdAt
        )
      })
  }
}
