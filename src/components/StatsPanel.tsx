import { useMemo } from 'react'
import type { Category, Task } from '../types'
import { computeStats } from '../lib/stats'
import { plural } from '../lib/date'
import { ProgressRing } from './ProgressRing'

interface StatsPanelProps {
  tasks: Task[]
  categories: Category[]
  /** Own tab on a phone: full width instead of a fixed side column. */
  phone?: boolean
}

/**
 * Sibling tiles on the canvas, never tiles inside a tile: a card within a card
 * is always wrong. Inside each tile, grouping is hairlines and space.
 */
export function StatsPanel({ tasks, categories, phone = false }: StatsPanelProps) {
  const stats = useMemo(() => computeStats(tasks), [tasks])

  const byCategory = useMemo(
    () =>
      categories
        .map((category) => {
          const scoped = tasks.filter((t) => t.categoryId === category.id)
          const done = scoped.filter((t) => t.done).length
          return {
            category,
            total: scoped.length,
            done,
            rate: scoped.length === 0 ? 0 : Math.round((done / scoped.length) * 100),
          }
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total),
    [tasks, categories],
  )

  return (
    <aside
      className={
        phone
          ? 'scroll-y min-h-0 flex-1 px-4 pt-3 pb-4'
          : 'scroll-y w-[19rem] shrink-0 bg-canvas pr-4 pb-4 pl-1'
      }
    >
      {phone && <h1 className="mb-3 text-xl font-semibold text-fg">Обзор</h1>}
      <div className="flex flex-col gap-3">
        <section className="card flex flex-col items-center px-6 py-7">
          <ProgressRing
            value={stats.rate}
            caption={stats.total === 0 ? 'пока пусто' : `${stats.done} из ${stats.total}`}
          />
          <p className="mt-4 text-center text-sm leading-relaxed text-fg-3">
            {stats.total === 0
              ? 'Отмечай задачи выполненными, и здесь появится прогресс'
              : stats.open === 0
                ? 'Всё закрыто'
                : `Осталось ${stats.open} ${plural(stats.open, 'задача', 'задачи', 'задач')}`}
          </p>
        </section>

        <section className="card grid grid-cols-3 divide-x divide-line-soft">
          <Metric value={stats.doneToday} label="сегодня" />
          <Metric
            value={stats.streak}
            label={plural(stats.streak, 'день', 'дня', 'дней')}
            hint="подряд"
          />
          <Metric
            value={stats.overdue}
            label="просрочено"
            tone={stats.overdue > 0 ? 'danger' : undefined}
          />
        </section>

        <section className="card px-6 py-5">
          <Eyebrow>Последние 7 дней</Eyebrow>
          <div className="mt-4 flex h-20 items-end justify-between gap-1.5">
            {stats.week.map((day) => (
              <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <span className="tnum text-xs text-fg-3">{day.done > 0 ? day.done : ''}</span>
                <div
                  className="w-full rounded-full"
                  style={{
                    height: `${day.done === 0 ? 3 : Math.max(12, (day.done / stats.weekPeak) * 100)}%`,
                    background: day.done === 0 ? 'var(--color-line)' : 'var(--color-accent)',
                    transition: 'height 220ms var(--ease-out-quart)',
                  }}
                  title={`${day.key}: ${day.done}`}
                />
                <span className={`text-xs ${day.isToday ? 'text-fg-2' : 'text-fg-3'}`}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {byCategory.length > 0 && (
          <section className="card px-6 py-5">
            <Eyebrow>По категориям</Eyebrow>
            <ul className="mt-4 flex flex-col gap-3.5">
              {byCategory.map(({ category, total, done, rate }) => (
                <li key={category.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: category.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-fg-2">{category.name}</span>
                    <span className="tnum shrink-0 text-xs text-fg-3">
                      {done}/{total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${rate}%`,
                        background: category.color,
                        transition: 'width 220ms var(--ease-out-quart)',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">{children}</h2>
}

function Metric({
  value,
  label,
  hint,
  tone,
}: {
  value: number
  label: string
  hint?: string
  tone?: 'danger'
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-5">
      <span
        className={`tnum text-lg leading-none font-semibold ${
          tone === 'danger' ? 'text-danger' : 'text-fg'
        }`}
      >
        {value}
      </span>
      <span className="text-xs text-fg-3">{label}</span>
      {hint && <span className="text-xs text-fg-3">{hint}</span>}
    </div>
  )
}
