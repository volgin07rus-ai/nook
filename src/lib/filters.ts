import type { Category, Task } from '../types'
import { isOverdue, todayKey } from './date'

export type FilterKind = 'all' | 'today' | 'overdue' | 'done' | 'category'

export interface Filter {
  kind: FilterKind
  categoryId?: string
}

export const ALL_TASKS: Filter = { kind: 'all' }

/**
 * The widget stores its scope as one string in settings, because a nested
 * object in a settings file is harder to validate than 'cat:<id>'.
 */
export function parseWidgetFilter(value: string): Filter {
  if (value === 'today') return { kind: 'today' }
  if (value === 'overdue') return { kind: 'overdue' }
  if (value.startsWith('cat:')) return { kind: 'category', categoryId: value.slice(4) }
  return ALL_TASKS
}

export function matchesFilter(task: Task, filter: Filter): boolean {
  switch (filter.kind) {
    case 'today':
      return !task.done && task.due === todayKey()
    case 'overdue':
      return isOverdue(task.due, task.done)
    case 'done':
      return task.done
    case 'category':
      return task.categoryId === filter.categoryId
    case 'all':
    default:
      return true
  }
}

export function filterTitle(filter: Filter, categories: Category[]): string {
  switch (filter.kind) {
    case 'today':
      return 'Сегодня'
    case 'overdue':
      return 'Просроченные'
    case 'done':
      return 'Выполненные'
    case 'category':
      return categories.find((c) => c.id === filter.categoryId)?.name ?? 'Категория'
    case 'all':
    default:
      return 'Все задачи'
  }
}

export function sameFilter(a: Filter, b: Filter): boolean {
  return a.kind === b.kind && a.categoryId === b.categoryId
}

/** Completed tasks are hidden everywhere except the "Выполненные" view. */
export function hidesCompleted(filter: Filter): boolean {
  return filter.kind !== 'done'
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return task.title.toLowerCase().includes(q)
}
