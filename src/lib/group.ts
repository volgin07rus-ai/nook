import type { Task } from '../types'
import { daysBetween, todayKey } from './date'

export interface TaskGroup {
  key: string
  title: string
  tasks: Task[]
}

const ORDER = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday', 'done'] as const

const TITLES: Record<(typeof ORDER)[number], string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  week: 'На этой неделе',
  later: 'Позже',
  someday: 'Без срока',
  done: 'Выполнено',
}

function bucketOf(task: Task): (typeof ORDER)[number] {
  if (task.done) return 'done'
  if (!task.due) return 'someday'

  const diff = daysBetween(todayKey(), task.due)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return 'week'
  return 'later'
}

/** Splits an already-sorted list into deadline sections, dropping empty ones. */
export function groupTasks(tasks: Task[]): TaskGroup[] {
  const buckets = new Map<string, Task[]>()
  for (const task of tasks) {
    const key = bucketOf(task)
    const existing = buckets.get(key)
    if (existing) existing.push(task)
    else buckets.set(key, [task])
  }

  return ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    title: TITLES[key],
    tasks: buckets.get(key)!,
  }))
}
