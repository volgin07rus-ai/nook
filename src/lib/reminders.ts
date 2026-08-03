import { useEffect } from 'react'
import type { Task } from '../types'
import { markReminded } from './store'
import { isTauri } from './persistence'
import { publishReminders } from './window'

const FIRED_EVENT = 'nook://reminder-fired'

/**
 * Keeps the Rust scheduler in sync with the task list. Only the main window
 * runs this: Rust holds a single queue, and one owner means one notification.
 */
export function useReminderBridge(tasks: Task[]) {
  const pending = tasks
    .filter((task) => !task.done && !task.reminded && task.remindAt !== null)
    .map((task) => ({ id: task.id, title: task.title, at: task.remindAt as number }))

  // Cheap structural key so we only cross into Rust when something changed.
  const key = pending.map((r) => `${r.id}:${r.at}`).join('|')

  useEffect(() => {
    void publishReminders(pending)
    // `pending` is rebuilt every render; `key` is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const stop = await listen<string>(FIRED_EVENT, (event) => markReminded(event.payload))
      if (cancelled) stop()
      else unlisten = stop
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
