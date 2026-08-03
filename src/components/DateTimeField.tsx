import { useRef } from 'react'
import { formatDateTime } from '../lib/date'
import { BellIcon, XIcon } from './icons'

interface DateTimeFieldProps {
  /** 'YYYY-MM-DDTHH:mm' or '' */
  value: string
  onChange: (value: string) => void
  label: string
  /** What to show when nothing is set. */
  placeholder: string
}

/**
 * A date and time picker that says what it is when it is empty.
 *
 * A bare `input[type=datetime-local]` renders as a blank strip on Android —
 * no placeholder, no visible control, nothing to say it can be tapped. So the
 * visible part is ours: an icon and either the chosen moment or the word for
 * "not set". The native input stays for the picker itself, opened through
 * showPicker(), because the system date wheel is better than anything worth
 * building here and is what the user already knows.
 */
export function DateTimeField({ value, onChange, label, placeholder }: DateTimeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const open = () => {
    const input = inputRef.current
    if (!input) return
    // showPicker needs a user gesture, which a click is. Where it is missing,
    // focusing still opens the picker on most browsers.
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        /* falls through to focus below */
      }
    }
    input.focus()
    input.click()
  }

  const chosen = value ? formatDateTime(fromInputValue(value)) : null

  return (
    <div className="field flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={open}
        aria-label={label}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
      >
        <BellIcon size={14} className="shrink-0 text-fg-2" />
        <span className={`min-w-0 flex-1 truncate text-sm ${chosen ? 'text-fg' : 'text-fg-3'}`}>
          {chosen ?? placeholder}
        </span>
      </button>

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Убрать напоминание"
          title="Убрать напоминание"
          className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-3 hover:text-fg"
        >
          <XIcon size={13} />
        </button>
      )}

      {/* Off-screen rather than display:none: a hidden input cannot be given a
          picker, and this one still has to be one the browser will open. */}
      <input
        ref={inputRef}
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
    </div>
  )
}

/** '2026-07-30T18:30' -> ms, without going through the shared parser twice. */
function fromInputValue(value: string): number {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}
