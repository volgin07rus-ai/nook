import { useMemo } from 'react'
import type { Habit, Task } from '../types'
import { computePulse } from '../lib/pulse'
import { plural } from '../lib/date'
import { CaretRightIcon } from './icons'

interface PulseCardProps {
  tasks: Task[]
  habits: Habit[]
  /** Нажатие ведёт в обзор, где всё это разобрано подробнее. */
  onOpen: () => void
}

/**
 * Результат дня над списком задач.
 *
 * Кольцо — доля сделанного из намеченного на сегодня, строка — из чего она
 * сложилась, столбики — неделя. Одна карточка высотой в две строки: ей нельзя
 * отнимать у списка больше, чем стоит одна задача.
 */
export function PulseCard({ tasks, habits, onOpen }: PulseCardProps) {
  const pulse = useMemo(() => computePulse(tasks, habits), [tasks, habits])

  const parts: string[] = []
  if (pulse.tasksDone > 0) {
    parts.push(`${pulse.tasksDone} ${plural(pulse.tasksDone, 'задача', 'задачи', 'задач')}`)
  }
  if (pulse.habitsTotal > 0) {
    parts.push(`${pulse.habitsDone}/${pulse.habitsTotal} привычек`)
  }
  if (pulse.streak > 1) {
    parts.push(`серия ${pulse.streak} ${plural(pulse.streak, 'день', 'дня', 'дней')}`)
  }

  const title =
    pulse.planned === 0
      ? 'На сегодня ничего не намечено'
      : pulse.done === pulse.planned
        ? 'На сегодня всё сделано'
        : `${pulse.done} из ${pulse.planned} на сегодня`

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Открыть обзор"
      className="focus-ring press card flex w-full items-center gap-3 px-4 py-3 text-left"
    >
      <Ring value={pulse.rate} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-fg-3">
          {parts.length > 0 ? parts.join(' · ') : 'пока ничего не сделано'}
        </span>
      </span>

      <span className="flex h-8 shrink-0 items-end gap-[2px]" aria-hidden>
        {pulse.week.map((day) => (
          <span
            key={day.key}
            className="w-1 rounded-full"
            title={`${day.label}: ${day.count}`}
            style={{
              height: `${day.count === 0 ? 12 : Math.max(25, (day.count / pulse.peak) * 100)}%`,
              background: day.count === 0 ? 'var(--color-line)' : 'var(--color-accent)',
              opacity: day.count === 0 || day.isToday ? 1 : 0.45,
              transition: 'height 220ms var(--ease-out-quart)',
            }}
          />
        ))}
      </span>

      <CaretRightIcon size={14} className="shrink-0 text-fg-3" />
    </button>
  )
}

/** Кольцо с процентом внутри; прочерк, когда считать не от чего. */
function Ring({ value }: { value: number | null }) {
  const size = 44
  const thickness = 4
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = value === null ? 0 : Math.max(0, Math.min(100, value))

  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
          style={{ transition: 'stroke-dasharray 220ms var(--ease-out-quart)' }}
        />
      </svg>
      <span className="tnum absolute text-[11px] leading-none font-semibold text-fg">
        {value === null ? '—' : `${clamped}%`}
      </span>
    </span>
  )
}
