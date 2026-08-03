import { useEffect, useMemo, useRef, useState } from 'react'
import { addTask, useStore } from './lib/store'
import { useTheme } from './lib/useAccent'
import { formatDue, parseDueFromText } from './lib/date'
import { hideQuick } from './lib/window'
import { isTauri } from './lib/persistence'
import { NookMark } from './components/NookMark'

const QUICK_OPENED = 'nook://quick-opened'

/**
 * A spotlight for one thought. The point is that it costs nothing to reach:
 * the global shortcut opens it over whatever you were doing, Enter files the
 * task, Escape or a click elsewhere dismisses it, and you are back where you
 * were. Anything more than a single field would defeat that.
 */
export default function QuickCapture() {
  const data = useStore()
  useTheme(
    data.settings.theme,
    data.settings.accent,
    data.settings.accentCustom,
    data.settings.font,
  )

  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(() => parseDueFromText(text), [text])
  const title = (parsed?.title ?? text).trim()

  // The window is only hidden, never destroyed, so it has to reset itself
  // every time it is summoned rather than on mount.
  useEffect(() => {
    if (!isTauri()) return
    let stop: (() => void) | undefined
    let cancelled = false

    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      const off = await listen(QUICK_OPENED, () => {
        setText('')
        // The window is still being shown when the event lands.
        requestAnimationFrame(() => inputRef.current?.focus())
      })
      if (cancelled) off()
      else stop = off
    })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    if (!title) return
    addTask({ title, due: parsed?.due ?? null })
    setText('')
    void hideQuick()
  }

  return (
    <div className="h-full p-4">
      <div className="pane-solid flex h-full flex-col justify-center rounded-xl px-5">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-fg-3">
            <NookMark size={18} />
          </span>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') void hideQuick()
            }}
            placeholder="Что нужно сделать?"
            aria-label="Быстрая запись"
            className="min-w-0 flex-1 bg-transparent text-lg text-fg outline-none placeholder:text-fg-3"
          />
          {parsed?.due && (
            <span className="tnum shrink-0 rounded-full bg-accent-dim px-2.5 py-1 text-sm text-fg">
              {formatDue(parsed.due)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
