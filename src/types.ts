import { htmlToText, looksLikePlainText, sanitize, textToHtml } from './lib/richtext'

export type Priority = 'low' | 'normal' | 'high'

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  done: boolean
  /** ms epoch */
  createdAt: number
  /** ms epoch, null while the task is open */
  completedAt: number | null
  /** 'YYYY-MM-DD', null when the task has no deadline */
  due: string | null
  /**
   * 'HH:MM' — время внутри дня, если задача стоит на конкретный час.
   *
   * Отдельно от remindAt намеренно: напоминание — это когда толкнуть, а это —
   * когда оно стоит в расписании. У встречи в 14:00 с напоминанием за час два
   * разных времени, и одним полем их не выразить.
   */
  dueTime: string | null
  priority: Priority
  /** null means "Без категории" */
  categoryId: string | null
  notes: string
  subtasks: Subtask[]
  repeat: Repeat
  /** ms epoch of the reminder, null when none is set */
  remindAt: number | null
  /** true once the notification has fired, so it never repeats */
  reminded: boolean
  /** ms epoch последней правки — по нему сходятся две копии, см. lib/sync.ts */
  updatedAt: number
}

export interface Category {
  id: string
  name: string
  color: string
  /** Pinned categories are moved to the top of the list and marked. */
  pinned: boolean
  updatedAt: number
}

/**
 * Accents are a closed set, not a free colour picker: the neutral surfaces are
 * tinted toward the accent hue, so an arbitrary colour would break cohesion.
 */
/**
 * `l` is the accent lightness per theme and `on` the text that sits on it.
 * Graphite flips between near-white and near-black so the primary button reads
 * as ink on paper in light mode and paper on ink in dark mode. Coloured accents
 * stay light in both themes and always carry dark text, which keeps every
 * button above 5:1 without a second rule.
 */
export const ACCENTS = {
  graphite: { label: 'Графит', hue: 70, chroma: 0.005, l: { dark: 93, light: 25 }, on: { dark: 16, light: 97 } },
  copper: { label: 'Медь', hue: 62, chroma: 0.125, l: { dark: 74, light: 70 }, on: { dark: 19, light: 18 } },
  rose: { label: 'Роза', hue: 15, chroma: 0.14, l: { dark: 72, light: 68 }, on: { dark: 18, light: 18 } },
  emerald: { label: 'Изумруд', hue: 155, chroma: 0.13, l: { dark: 73, light: 68 }, on: { dark: 17, light: 17 } },
  steel: { label: 'Сталь', hue: 215, chroma: 0.1, l: { dark: 73, light: 68 }, on: { dark: 16, light: 16 } },
} as const

export type AccentPreset = keyof typeof ACCENTS
/** 'custom' reads the hex in `accentCustom` instead of the preset table. */
export type AccentKey = AccentPreset | 'custom'
export type ThemeKey = 'dark' | 'light'
/** 'app' follows the main theme; the others pin the widget on its own. */
export type WidgetTheme = 'app' | 'dark' | 'light'
export type FontKey = 'system' | 'mono'
/** floating: above every window. desktop: pinned to the bottom layer. */
export type WidgetMode = 'floating' | 'desktop'

export const FONT_STACKS: Record<FontKey, string> = {
  system: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif",
  mono: "'Cascadia Mono', Consolas, ui-monospace, monospace",
}

export interface Settings {
  theme: ThemeKey
  accent: AccentKey
  /** Hex used when `accent` is 'custom'. */
  accentCustom: string
  font: FontKey
  /** Global shortcut for quick capture, in Tauri accelerator form. */
  quickShortcut: string
  /** Lets the widget stay dark while the app is light, or the reverse. */
  widgetTheme: WidgetTheme
  /** What the widget lists: 'all', 'today', 'overdue' or 'cat:<id>'. */
  widgetFilter: string
  widgetMode: WidgetMode
  /** widget background opacity, 0.1–1 */
  widgetOpacity: number
  /** show the widget automatically on launch */
  widgetOnLaunch: boolean
  /** show completed tasks in the list instead of hiding them */
  showCompleted: boolean
  /** Reading comfort in the notepad: line height as a multiple, 1.2–2.4 */
  noteLineHeight: number
  /** and tracking in em, 0–0.12 */
  noteLetterSpacing: number
}

/**
 * A note has no separate title field on purpose: its first non-empty line is
 * the title. One less thing to fill in, and the list still reads well.
 */
export interface Note {
  id: string
  /**
   * A name of its own, when the first line is not the one you want in the
   * list. Empty means "use the first line", which is what most notes want and
   * what they all did before this field existed.
   */
  title: string
  /** Markup, not plain text: notes carry formatting. See lib/richtext.ts. */
  body: string
  createdAt: number
  updatedAt: number
}

export function noteTitle(note: Note): string {
  const named = note.title.trim()
  if (named) return named.slice(0, 80)
  const line = htmlToText(note.body)
    .split('\n')
    .find((l) => l.trim())
  return line ? line.trim().slice(0, 80) : 'Без названия'
}

/**
 * A film on the watchlist.
 *
 * Deliberately not a Task. A task is something you owe someone by a date, and
 * the whole apparatus around it — deadline, priority, repeat, reminder — has
 * nothing to say about a film. What a watchlist needs is a rating to choose by
 * and a mark for "seen", and those two are exactly what a task cannot hold.
 */
export interface Film {
  id: string
  title: string
  /** 0–10 to one decimal, the scale the ratings are copied from. Null = unrated. */
  rating: number | null
  watched: boolean
  createdAt: number
  /** ms epoch when it was ticked off, null while it is still on the list */
  watchedAt: number | null
  updatedAt: number
}

/** Ratings are quoted from elsewhere, so they keep that scale exactly. */
export const RATING_MIN = 0
export const RATING_MAX = 10

/** Rounds to the one decimal the scale has and refuses anything off it. */
export function clampRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value * 10) / 10
  if (rounded < RATING_MIN || rounded > RATING_MAX) return null
  return rounded
}

/**
 * Привычка — то, что делают каждый день, а не один раз к сроку.
 *
 * Не задача с повтором: повторяющаяся задача на каждый день рождает новую
 * копию и закрывает старую, а у привычки одна запись на всю жизнь и история
 * отметок внутри. Именно история здесь и ценна — серия, процент за месяц,
 * сетка дней, — и по разрозненным копиям задач её не собрать.
 */
export interface Habit {
  id: string
  name: string
  color: string
  /** Дни, когда отмечено: 'YYYY-MM-DD', без повторов, по возрастанию. */
  days: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Запись о том, что было удалено.
 *
 * Без неё синхронизация не работает вовсе: удаление на телефоне выглядит на
 * ноутбуке ровно как «на телефоне этой задачи ещё нет», и она приезжает
 * обратно. Могила помнит, что именно и когда убрали.
 */
export interface Grave {
  id: string
  at: number
}

export interface AppData {
  version: 10
  tasks: Task[]
  categories: Category[]
  /** Free-form notes, kept separate from the task list. */
  notes: Note[]
  /** The watchlist. Its own collection, not a category of tasks. */
  films: Film[]
  /** Ежедневные привычки с историей отметок. */
  habits: Habit[]
  settings: Settings
  /** Что удалено и когда. Чистится от записей старше трёх месяцев. */
  graveyard: Grave[]
  /** Когда последний раз меняли настройки: они сходятся целиком, не по полям. */
  settingsAt: number
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Высокий',
  normal: 'Обычный',
  low: 'Низкий',
}

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Не повторять',
  daily: 'Каждый день',
  weekly: 'Каждую неделю',
  monthly: 'Каждый месяц',
}

const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

export const PRIORITY_OPTIONS = toOptions(PRIORITY_LABEL)
export const REPEAT_OPTIONS = toOptions(REPEAT_LABEL)

/**
 * Sixteen colours chosen to be told apart at the size of a 8px dot.
 *
 * The previous palette held lightness and chroma constant and only moved the
 * hue, which is exactly what makes swatches blur together: at equal lightness
 * neighbouring hues carry the same visual weight. Here lightness and chroma
 * move with the hue, so any two entries differ in at least two dimensions.
 */
export const CATEGORY_PALETTE = [
  'oklch(62% 0.20 25)', // красный
  'oklch(72% 0.17 55)', // оранжевый
  'oklch(83% 0.15 90)', // янтарный
  'oklch(77% 0.19 128)', // лаймовый
  'oklch(58% 0.16 148)', // зелёный
  'oklch(71% 0.11 185)', // бирюзовый
  'oklch(81% 0.11 212)', // голубой
  'oklch(56% 0.18 255)', // синий
  'oklch(46% 0.19 277)', // индиго
  'oklch(61% 0.21 302)', // фиолетовый
  'oklch(68% 0.22 330)', // пурпурный
  'oklch(79% 0.13 350)', // розовый
  'oklch(48% 0.08 55)', // коричневый
  'oklch(84% 0.05 88)', // песочный
  'oklch(60% 0.04 240)', // сланцевый
  'oklch(52% 0.01 70)', // серый
]

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    accent: 'graphite',
    accentCustom: '#7A8B99',
    font: 'system',
    quickShortcut: 'Ctrl+Alt+N',
    widgetTheme: 'app',
    widgetFilter: 'all',
    widgetMode: 'desktop',
    widgetOpacity: 0.35,
    widgetOnLaunch: true,
    showCompleted: false,
    noteLineHeight: 1.6,
    noteLetterSpacing: 0,
  }
}

export function defaultData(): AppData {
  return {
    version: 10,
    tasks: [],
    films: [],
    habits: [],
    graveyard: [],
    settingsAt: 0,
    categories: [
      { id: createId(), name: 'Личное', color: CATEGORY_PALETTE[1], pinned: false, updatedAt: 0 },
      { id: createId(), name: 'Работа', color: CATEGORY_PALETTE[4], pinned: false, updatedAt: 0 },
      { id: createId(), name: 'Учёба', color: CATEGORY_PALETTE[3], pinned: false, updatedAt: 0 },
    ],
    notes: [],
    settings: defaultSettings(),
  }
}

const PRIORITIES: Priority[] = ['low', 'normal', 'high']
const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'monthly']
const THEMES: ThemeKey[] = ['dark', 'light']
const FONTS: FontKey[] = ['system', 'mono']
const WIDGET_THEMES: WidgetTheme[] = ['app', 'dark', 'light']
const WIDGET_MODES: WidgetMode[] = ['desktop', 'floating']
const ACCENT_KEYS: AccentKey[] = [...(Object.keys(ACCENTS) as AccentPreset[]), 'custom']

/** Accepts only a six-digit hex, so a malformed value cannot reach the CSS. */
function asHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim()
    : fallback
}

/** Reads one stored value, falling back when it is missing or malformed. */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/**
 * Метка времени из файла.
 *
 * Запасное значение важно: файлы, написанные до появления синхронизации,
 * меток не имеют. Взять ноль было бы неверно — при первом же слиянии всё
 * старое проиграло бы всему новому. Поэтому берётся дата создания.
 */
function asStamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/** Только 'ЧЧ:ММ' в пределах суток; всё прочее читается как «времени нет». */
function asTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  if (Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return m[1] + ':' + m[2]
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Отметки привычки: только даты нужного вида, без повторов, по порядку. */
function asDays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const keys = raw.filter((d): d is string => typeof d === 'string' && DAY_KEY.test(d))
  return [...new Set(keys)].sort()
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function normalizeSubtasks(raw: unknown): Subtask[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s): s is Subtask => !!s && typeof s.title === 'string')
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id : createId(),
      title: s.title,
      done: !!s.done,
    }))
}

/** Fills in anything missing so an older or partial file still loads. */
export function normalize(raw: unknown): AppData {
  const base = defaultData()
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Partial<AppData>

  const categories = Array.isArray(data.categories)
    ? data.categories
        .filter((c): c is Category => !!c && typeof c.id === 'string')
        .map((c) => ({ ...c, pinned: !!c.pinned, updatedAt: asStamp(c.updatedAt, 0) }))
    : base.categories

  const known = new Set(categories.map((c) => c.id))
  const tasks = Array.isArray(data.tasks)
    ? data.tasks
        .filter((t): t is Task => !!t && typeof t.id === 'string' && typeof t.title === 'string')
        .map((t) => ({
          id: t.id,
          title: t.title,
          done: !!t.done,
          createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
          completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
          due: typeof t.due === 'string' ? t.due : null,
          dueTime: asTime(t.dueTime),
          priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
          // Drop references to categories that no longer exist.
          categoryId: t.categoryId && known.has(t.categoryId) ? t.categoryId : null,
          notes: typeof t.notes === 'string' ? t.notes : '',
          subtasks: normalizeSubtasks(t.subtasks),
          repeat: REPEATS.includes(t.repeat) ? t.repeat : 'none',
          remindAt: typeof t.remindAt === 'number' ? t.remindAt : null,
          reminded: !!t.reminded,
          updatedAt: asStamp(t.updatedAt, t.createdAt),
        }))
    : []

  // Built key by key rather than spread, so settings that were removed in a
  // later version do not linger in the file forever.
  const stored = (data.settings ?? {}) as Record<string, unknown>
  const settings: Settings = {
    theme: oneOf(stored.theme, THEMES, base.settings.theme),
    accent: oneOf(stored.accent, ACCENT_KEYS, base.settings.accent),
    accentCustom: asHex(stored.accentCustom, base.settings.accentCustom),
    font: oneOf(stored.font, FONTS, base.settings.font),
    quickShortcut: asText(stored.quickShortcut, base.settings.quickShortcut),
    widgetTheme: oneOf(stored.widgetTheme, WIDGET_THEMES, base.settings.widgetTheme),
    widgetFilter: asText(stored.widgetFilter, base.settings.widgetFilter),
    widgetMode: oneOf(stored.widgetMode, WIDGET_MODES, base.settings.widgetMode),
    widgetOpacity: clampNumber(stored.widgetOpacity, 0.1, 1, base.settings.widgetOpacity),
    widgetOnLaunch: asBool(stored.widgetOnLaunch, base.settings.widgetOnLaunch),
    showCompleted: asBool(stored.showCompleted, base.settings.showCompleted),
    noteLineHeight: clampNumber(stored.noteLineHeight, 1.2, 2.4, base.settings.noteLineHeight),
    noteLetterSpacing: clampNumber(
      stored.noteLetterSpacing,
      0,
      0.12,
      base.settings.noteLetterSpacing,
    ),
  }

  let notes: Note[] = Array.isArray(data.notes)
    ? data.notes
        .filter((n): n is Note => !!n && typeof n.body === 'string')
        .map((n) => ({
          id: typeof n.id === 'string' ? n.id : createId(),
          title: typeof n.title === 'string' ? n.title : '',
          // Notes used to be plain text. Rather than key off the file version,
          // which an imported file can claim to be anything, decide per note by
          // what the body actually is — and sanitize whatever came in as markup.
          body: looksLikePlainText(n.body) ? textToHtml(n.body) : sanitize(n.body),
          createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
          updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
        }))
    : []

  // Older files had a single scratchpad string; carry it over as one note.
  const legacy = (data as { notepad?: unknown }).notepad
  if (notes.length === 0 && typeof legacy === 'string' && legacy.trim()) {
    notes = [
      {
        id: createId(),
        title: '',
        body: textToHtml(legacy),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
  }

  const films: Film[] = Array.isArray(data.films)
    ? data.films
        .filter((f): f is Film => !!f && typeof f.title === 'string')
        .map((f) => ({
          id: typeof f.id === 'string' ? f.id : createId(),
          title: f.title,
          rating: clampRating(f.rating),
          watched: !!f.watched,
          createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
          watchedAt: typeof f.watchedAt === 'number' ? f.watchedAt : null,
          updatedAt: asStamp(f.updatedAt, f.createdAt),
        }))
    : []

  const habits: Habit[] = Array.isArray(data.habits)
    ? data.habits
        .filter((h): h is Habit => !!h && typeof h.name === 'string' && h.name.trim() !== '')
        .map((h) => {
          const createdAt = typeof h.createdAt === 'number' ? h.createdAt : Date.now()
          return {
            id: typeof h.id === 'string' ? h.id : createId(),
            name: h.name.trim().slice(0, 80),
            color: typeof h.color === 'string' && h.color.trim() ? h.color : CATEGORY_PALETTE[0],
            days: asDays(h.days),
            createdAt,
            updatedAt: asStamp(h.updatedAt, createdAt),
          }
        })
    : []

  const graveyard: Grave[] = Array.isArray(data.graveyard)
    ? data.graveyard
        .filter((g): g is Grave => !!g && typeof g.id === 'string' && typeof g.at === 'number')
        .map((g) => ({ id: g.id, at: g.at }))
    : []

  return {
    version: 10,
    tasks,
    categories,
    notes,
    films,
    habits,
    settings,
    graveyard,
    settingsAt: asStamp((data as { settingsAt?: unknown }).settingsAt, 0),
  }
}
