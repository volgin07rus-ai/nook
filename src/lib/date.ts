const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

/** Local-time 'YYYY-MM-DD'. Never use toISOString here — it shifts to UTC. */
export function dateKey(value: Date | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value)
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function todayKey(): string {
  return dateKey(new Date())
}

export function shiftDays(days: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

/** Whole days between two 'YYYY-MM-DD' keys (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const start = new Date(ay, am - 1, ad).getTime()
  const end = new Date(by, bm - 1, bd).getTime()
  return Math.round((end - start) / 86_400_000)
}

/** 'Сегодня' / 'Завтра' / 'Вчера' / '12 авг' / '12 авг 2027' */
export function formatDue(due: string): string {
  const diff = daysBetween(todayKey(), due)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Завтра'
  if (diff === -1) return 'Вчера'
  if (diff > 1 && diff < 7) return `Через ${diff} дн.`

  const [y, m, d] = due.split('-').map(Number)
  const label = `${d} ${MONTHS_SHORT[m - 1]}`
  return y === new Date().getFullYear() ? label : `${label} ${y}`
}

/**
 * For a timestamp that is always in the past, such as when a note was last
 * touched. `formatDue` is the deadline version and knows "Завтра" and
 * "Через N дн.", which would be nonsense here.
 */
export function formatPast(ms: number): string {
  const key = dateKey(ms)
  const diff = daysBetween(todayKey(), key)
  if (diff === 0) return 'Сегодня'
  if (diff === -1) return 'Вчера'

  const [y, m, d] = key.split('-').map(Number)
  const label = `${d} ${MONTHS_SHORT[m - 1]}`
  return y === new Date().getFullYear() ? label : `${label} ${y}`
}

export function weekdayShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()]
}

export function isOverdue(due: string | null, done: boolean): boolean {
  if (!due || done) return false
  return daysBetween(todayKey(), due) < 0
}

export function isToday(due: string | null): boolean {
  return !!due && due === todayKey()
}

/**
 * Parses a natural-language date suffix typed into the composer, e.g.
 * "Купить хлеб сегодня" or "Позвонить 12.08". Returns null when nothing matched.
 */
export function parseDueFromText(text: string): { title: string; due: string } | null {
  const trimmed = text.trim()

  const keywords: Array<[RegExp, () => string]> = [
    [/\s+сегодня$/i, () => todayKey()],
    [/\s+завтра$/i, () => shiftDays(1)],
    [/\s+послезавтра$/i, () => shiftDays(2)],
  ]
  for (const [pattern, resolve] of keywords) {
    if (pattern.test(trimmed)) {
      return { title: trimmed.replace(pattern, '').trim(), due: resolve() }
    }
  }

  // "12.08" or "12.08.2027"
  const explicit = trimmed.match(/\s+(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (explicit) {
    const day = Number(explicit[1])
    const month = Number(explicit[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      let year = new Date().getFullYear()
      if (explicit[3]) {
        const parsed = Number(explicit[3])
        year = parsed < 100 ? 2000 + parsed : parsed
      }
      const candidate = dateKey(new Date(year, month - 1, day))
      return { title: trimmed.slice(0, explicit.index).trim(), due: candidate }
    }
  }

  return null
}

/** Next occurrence of a repeating task, based on its deadline or on today. */
export function advanceDue(due: string | null, repeat: 'daily' | 'weekly' | 'monthly'): string {
  const [y, m, d] = (due ?? todayKey()).split('-').map(Number)
  const next = new Date(y, m - 1, d)
  if (repeat === 'daily') next.setDate(next.getDate() + 1)
  if (repeat === 'weekly') next.setDate(next.getDate() + 7)
  // setMonth clamps 31 Jan + 1 month to 28 Feb rather than spilling into March.
  if (repeat === 'monthly') {
    const day = next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, lastDay))
  }
  return dateKey(next)
}

/** 'YYYY-MM-DDTHH:mm' for <input type="datetime-local">, in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** 'Сегодня, 14:30' / '12 авг, 09:05' */
export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const time = `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
  return `${formatDue(dateKey(d))}, ${time}`
}

/** "3 задачи" — Russian plural agreement. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
