import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

const DURATION = 6000

let current: Toast | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function showToast(message: string, action?: { label: string; run: () => void }) {
  if (timer) clearTimeout(timer)
  current = {
    id: ++seq,
    message,
    actionLabel: action?.label,
    onAction: action?.run,
  }
  emit()
  timer = setTimeout(dismissToast, DURATION)
}

export function dismissToast() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (current === null) return
  current = null
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => current

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
