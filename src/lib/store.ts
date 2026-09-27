import { useSyncExternalStore } from 'react'
import type {
  AppData,
  Category,
  Film,
  Habit,
  Note,
  Priority,
  Repeat,
  Settings,
  Subtask,
  Task,
} from '../types'
import { clampRating, createId, defaultData, noteTitle } from '../types'
import type { Grave } from '../types'
import { isDuplicate, type ParsedFilm } from './films'
import { advanceDue } from './date'
import { backend } from './persistence'
import { showToast } from './toast'

let state: AppData = defaultData()
let loaded = false
const listeners = new Set<() => void>()

/** Snapshots for undo. Personal-scale data, so whole-state copies are cheap. */
const UNDO_LIMIT = 40
let past: AppData[] = []

function notify() {
  for (const listener of listeners) listener()
}

/** Replaces state without writing back, for changes from the other window. */
function adopt(next: AppData) {
  state = next
  // The other window's history is not ours to undo.
  past = []
  notify()
}

function commit(next: AppData) {
  state = next
  notify()
  void backend.save(next)
}

/** Applies a change and records the previous state so it can be undone. */
function update(mutate: (data: AppData) => AppData) {
  const previous = state
  const next = mutate(previous)
  if (next === previous) return
  past.push(previous)
  if (past.length > UNDO_LIMIT) past.shift()
  commit(next)
}

/**
 * Похоронить запись.
 *
 * Удаление обязано оставлять след, иначе синхронизация вернёт его обратно:
 * на второй копии отсутствие записи неотличимо от «её тут ещё не было».
 * Записи старше трёх месяцев выбрасываются — к тому времени обе копии давно
 * узнали об удалении, а могила иначе росла бы вечно.
 */
const GRAVE_TTL = 90 * 24 * 60 * 60 * 1000

function bury(data: AppData, ids: string[]): Grave[] {
  const now = Date.now()
  const fresh = data.graveyard.filter((g) => now - g.at < GRAVE_TTL && !ids.includes(g.id))
  return [...fresh, ...ids.map((id) => ({ id, at: now }))]
}

/** Settings are preferences, not content: they stay out of the undo history. */
function updateQuiet(mutate: (data: AppData) => AppData) {
  commit(mutate(state))
}

export function undo(): boolean {
  const previous = past.pop()
  if (!previous) return false
  commit(previous)
  return true
}

export function canUndo(): boolean {
  return past.length > 0
}

// ---------------------------------------------------------------- lifecycle

let initPromise: Promise<void> | null = null

export function initStore(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      adopt(await backend.load())
      loaded = true
      notify()
      await backend.watch(adopt)
    })()
  }
  return initPromise
}

// ------------------------------------------------------------------- access

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getState = (): AppData => state
export const isLoaded = (): boolean => loaded

export function useStore(): AppData {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, isLoaded, isLoaded)
}

// ----------------------------------------------------------------- mutations

export interface NewTask {
  title: string
  due?: string | null
  dueTime?: string | null
  priority?: Priority
  categoryId?: string | null
  repeat?: Repeat
  remindAt?: number | null
}

function buildTask(input: NewTask): Task {
  return {
    id: createId(),
    title: input.title.trim(),
    done: false,
    createdAt: Date.now(),
    completedAt: null,
    due: input.due ?? null,
    dueTime: input.due ? (input.dueTime ?? null) : null,
    priority: input.priority ?? 'normal',
    categoryId: input.categoryId ?? null,
    notes: '',
    subtasks: [],
    repeat: input.repeat ?? 'none',
    remindAt: input.remindAt ?? null,
    reminded: false,
    updatedAt: Date.now(),
  }
}

export function addTask(input: NewTask): Task {
  const task = buildTask(input)
  update((data) => ({ ...data, tasks: [task, ...data.tasks] }))
  return task
}

/**
 * Completing a repeating task closes this occurrence and schedules the next
 * one, with its checklist reset and the reminder shifted by the same gap.
 */
function nextOccurrence(task: Task): Task {
  const due = advanceDue(task.due, task.repeat as 'daily' | 'weekly' | 'monthly')
  let remindAt: number | null = null
  if (task.remindAt !== null) {
    const shift = task.due
      ? new Date(due).getTime() - new Date(task.due).getTime()
      : 86_400_000
    remindAt = task.remindAt + shift
  }
  return {
    ...task,
    id: createId(),
    done: false,
    createdAt: Date.now(),
    completedAt: null,
    due,
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    remindAt,
    reminded: false,
    updatedAt: Date.now(),
  }
}

export function toggleTask(id: string) {
  const task = state.tasks.find((t) => t.id === id)
  if (!task) return
  const completing = !task.done

  update((data) => {
    const tasks = data.tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            done: completing,
            completedAt: completing ? Date.now() : null,
            updatedAt: Date.now(),
          }
        : t,
    )
    if (completing && task.repeat !== 'none') {
      tasks.unshift(nextOccurrence(task))
    }
    return { ...data, tasks }
  })

  if (completing) {
    showToast(
      task.repeat === 'none' ? 'Задача выполнена' : 'Выполнена, следующая запланирована',
      { label: 'Отменить', run: () => void undo() },
    )
  }
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id'>>) {
  update((data) => ({
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task,
    ),
  }))
}

/**
 * Pushes a reminder back. `reminded` is cleared so the Rust queue picks it up
 * again: without that the task would keep its new time and never fire.
 */
export function snoozeTask(id: string, minutes: number) {
  update((data) => ({
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            remindAt: Date.now() + minutes * 60_000,
            reminded: false,
            updatedAt: Date.now(),
          }
        : task,
    ),
  }))
  showToast(`Напомню через ${minutes} мин`, { label: 'Отменить', run: () => void undo() })
}

/**
 * Applies a drag inside the currently visible list. Only the dragged subset
 * moves: the tasks in `orderedIds` are laid back into the slots they already
 * occupied, in their new relative order, so anything filtered out of view
 * keeps its place in the file.
 */
export function reorderVisibleTasks(orderedIds: string[]) {
  update((data) => {
    const moving = new Set(orderedIds)
    const byId = new Map(data.tasks.map((task) => [task.id, task]))
    const queue = orderedIds
      .map((id) => byId.get(id))
      .filter((task): task is Task => task !== undefined)

    let next = 0
    return {
      ...data,
      tasks: data.tasks.map((task) => (moving.has(task.id) ? queue[next++] : task)),
    }
  })
}

export function deleteTask(id: string) {
  const task = state.tasks.find((t) => t.id === id)
  update((data) => ({
    ...data,
    tasks: data.tasks.filter((t) => t.id !== id),
    graveyard: bury(data, [id]),
  }))
  if (task) {
    showToast(`Удалено: ${task.title}`, { label: 'Вернуть', run: () => void undo() })
  }
}

export function clearCompleted() {
  const count = state.tasks.filter((t) => t.done).length
  if (count === 0) return
  update((data) => ({
    ...data,
    tasks: data.tasks.filter((task) => !task.done),
    graveyard: bury(
      data,
      data.tasks.filter((task) => task.done).map((task) => task.id),
    ),
  }))
  showToast(`Удалено выполненных: ${count}`, { label: 'Вернуть', run: () => void undo() })
}

/** Marks a reminder as delivered. Not undoable: it reflects what already happened. */
export function markReminded(id: string) {
  updateQuiet((data) => ({
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === id ? { ...task, reminded: true, updatedAt: Date.now() } : task,
    ),
  }))
}

// ------------------------------------------------------------------ subtasks

function mapSubtasks(taskId: string, fn: (subtasks: Subtask[]) => Subtask[]) {
  update((data) => ({
    ...data,
    tasks: data.tasks.map((task) =>
      task.id === taskId
        ? { ...task, subtasks: fn(task.subtasks), updatedAt: Date.now() }
        : task,
    ),
  }))
}

export function addSubtask(taskId: string, title: string) {
  const trimmed = title.trim()
  if (!trimmed) return
  mapSubtasks(taskId, (subtasks) => [...subtasks, { id: createId(), title: trimmed, done: false }])
}

export function toggleSubtask(taskId: string, subtaskId: string) {
  mapSubtasks(taskId, (subtasks) =>
    subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s)),
  )
}

export function renameSubtask(taskId: string, subtaskId: string, title: string) {
  const trimmed = title.trim()
  if (!trimmed) return
  mapSubtasks(taskId, (subtasks) =>
    subtasks.map((s) => (s.id === subtaskId ? { ...s, title: trimmed } : s)),
  )
}

export function deleteSubtask(taskId: string, subtaskId: string) {
  mapSubtasks(taskId, (subtasks) => subtasks.filter((s) => s.id !== subtaskId))
}

// ---------------------------------------------------------------- categories

export function addCategory(name: string, color: string): Category {
  const category: Category = {
    id: createId(),
    name: name.trim(),
    color,
    pinned: false,
    updatedAt: Date.now(),
  }
  update((data) => ({ ...data, categories: [...data.categories, category] }))
  return category
}

/** Applies a new order coming from the drag handle in the sidebar. */
export function reorderCategories(ordered: Category[]) {
  update((data) => ({ ...data, categories: ordered }))
}

/**
 * Pinning moves the category to the top so that the visible order always
 * matches the stored order; otherwise dragging would fight the pinning.
 */
export function toggleCategoryPin(id: string) {
  update((data) => {
    const category = data.categories.find((c) => c.id === id)
    if (!category) return data
    const rest = data.categories.filter((c) => c.id !== id)
    const next = { ...category, pinned: !category.pinned, updatedAt: Date.now() }
    return { ...data, categories: next.pinned ? [next, ...rest] : [...rest, next] }
  })
}

export function updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
  update((data) => ({
    ...data,
    categories: data.categories.map((c) =>
      c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c,
    ),
  }))
}

/** Deletes a category; its tasks survive and fall back to "Без категории". */
export function deleteCategory(id: string) {
  const category = state.categories.find((c) => c.id === id)
  update((data) => ({
    ...data,
    categories: data.categories.filter((c) => c.id !== id),
    tasks: data.tasks.map((task) =>
      task.categoryId === id
        ? { ...task, categoryId: null, updatedAt: Date.now() }
        : task,
    ),
    graveyard: bury(data, [id]),
  }))
  if (category) {
    showToast(`Категория удалена: ${category.name}`, { label: 'Вернуть', run: () => void undo() })
  }
}

// ------------------------------------------------------------------ settings

// --------------------------------------------------------------------- notes

export function addNote(): Note {
  const now = Date.now()
  const note: Note = { id: createId(), title: '', body: '', createdAt: now, updatedAt: now }
  update((data) => ({ ...data, notes: [note, ...data.notes] }))
  return note
}

/** Typing is not something to undo keystroke by keystroke, so this is quiet. */
export function setNoteBody(id: string, body: string) {
  updateQuiet((data) => ({
    ...data,
    notes: data.notes.map((note) =>
      note.id === id ? { ...note, body, updatedAt: Date.now() } : note,
    ),
  }))
}

/** Same reasoning as the body: renaming letter by letter is not undo history. */
export function setNoteTitle(id: string, title: string) {
  updateQuiet((data) => ({
    ...data,
    notes: data.notes.map((note) =>
      note.id === id ? { ...note, title, updatedAt: Date.now() } : note,
    ),
  }))
}

export function deleteNote(id: string) {
  const note = state.notes.find((n) => n.id === id)
  update((data) => ({
    ...data,
    notes: data.notes.filter((n) => n.id !== id),
    graveyard: bury(data, [id]),
  }))
  if (note) {
    showToast(`Записка удалена: ${noteTitle(note)}`, { label: 'Вернуть', run: () => void undo() })
  }
}

// --------------------------------------------------------------------- films

export function addFilm(title: string, rating: number | null): Film | null {
  const trimmed = title.trim()
  if (!trimmed) return null
  const film: Film = {
    id: createId(),
    title: trimmed,
    rating: clampRating(rating),
    watched: false,
    createdAt: Date.now(),
    watchedAt: null,
    updatedAt: Date.now(),
  }
  update((data) => ({ ...data, films: [film, ...data.films] }))
  return film
}

/**
 * Editing the title or the rating in place. Quiet for the same reason typing
 * into a note is: a rating is arrived at digit by digit, and "7", "7." and
 * "7.8" are not three states worth stepping back through.
 */
export function updateFilm(id: string, patch: Partial<Omit<Film, 'id'>>) {
  updateQuiet((data) => ({
    ...data,
    films: data.films.map((film) =>
      film.id === id ? { ...film, ...patch, updatedAt: Date.now() } : film,
    ),
  }))
}

export function toggleFilmWatched(id: string) {
  const film = state.films.find((f) => f.id === id)
  if (!film) return
  const watched = !film.watched

  update((data) => ({
    ...data,
    films: data.films.map((f) =>
      f.id === id
        ? {
            ...f,
            watched,
            watchedAt: watched ? Date.now() : null,
            updatedAt: Date.now(),
          }
        : f,
    ),
  }))

  if (watched) {
    showToast(`Посмотрено: ${film.title}`, { label: 'Отменить', run: () => void undo() })
  }
}

export function deleteFilm(id: string) {
  const film = state.films.find((f) => f.id === id)
  update((data) => ({
    ...data,
    films: data.films.filter((f) => f.id !== id),
    graveyard: bury(data, [id]),
  }))
  if (film) {
    showToast(`Удалено: ${film.title}`, { label: 'Вернуть', run: () => void undo() })
  }
}

/**
 * Bulk add from a note, as a single undoable step: an import that went wrong
 * should come back with one Ctrl+Z, not with forty.
 *
 * Order is preserved from the note and the batch goes on the end, so an import
 * never pushes what was already on the list out of the way. Returns how many
 * were skipped as duplicates, which is what the caller reports.
 */
export function importFilms(parsed: ParsedFilm[]): { added: number; skipped: number } {
  const now = Date.now()
  const fresh: Film[] = []
  let skipped = 0

  for (const item of parsed) {
    const title = item.title.trim()
    if (!title) continue
    if (isDuplicate(state.films, title) || isDuplicate(fresh, title)) {
      skipped++
      continue
    }
    fresh.push({
      id: createId(),
      title,
      rating: clampRating(item.rating),
      watched: item.watched,
      // Descending, so the note's own order survives "сначала новые".
      createdAt: now - fresh.length,
      watchedAt: item.watched ? now : null,
      updatedAt: now,
    })
  }

  if (fresh.length > 0) {
    update((data) => ({ ...data, films: [...data.films, ...fresh] }))
    showToast(`Добавлено фильмов: ${fresh.length}`, { label: 'Отменить', run: () => void undo() })
  }

  return { added: fresh.length, skipped }
}

// -------------------------------------------------------------------- habits

export function addHabit(name: string, color: string): Habit | null {
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) return null
  const habit: Habit = {
    id: createId(),
    name: trimmed,
    color,
    days: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  // В конец, а не в начало: список привычек — это порядок дня, и новая
  // привычка не должна вставать перед теми, что делают первыми.
  update((data) => ({ ...data, habits: [...data.habits, habit] }))
  return habit
}

export function updateHabit(id: string, patch: Partial<Pick<Habit, 'name' | 'color'>>) {
  update((data) => ({
    ...data,
    habits: data.habits.map((habit) =>
      habit.id === id ? { ...habit, ...patch, updatedAt: Date.now() } : habit,
    ),
  }))
}

/**
 * Поставить или снять отметку за день.
 *
 * Отменяется через Ctrl+Z, но без всплывашки: галочки ставят по нескольку
 * раз в день, и подтверждать каждую было бы шумом.
 */
export function toggleHabitDay(id: string, key: string) {
  update((data) => ({
    ...data,
    habits: data.habits.map((habit) => {
      if (habit.id !== id) return habit
      const days = habit.days.includes(key)
        ? habit.days.filter((day) => day !== key)
        : [...habit.days, key].sort()
      return { ...habit, days, updatedAt: Date.now() }
    }),
  }))
}

export function reorderHabits(ordered: Habit[]) {
  update((data) => ({ ...data, habits: ordered }))
}

export function deleteHabit(id: string) {
  const habit = state.habits.find((h) => h.id === id)
  update((data) => ({
    ...data,
    habits: data.habits.filter((h) => h.id !== id),
    graveyard: bury(data, [id]),
  }))
  if (habit) {
    showToast(`Удалено: ${habit.name}`, { label: 'Вернуть', run: () => void undo() })
  }
}

export function updateSettings(patch: Partial<Settings>) {
  updateQuiet((data) => ({
    ...data,
    settings: { ...data.settings, ...patch },
    settingsAt: Date.now(),
  }))
}

export function replaceAll(data: AppData) {
  update(() => data)
}
