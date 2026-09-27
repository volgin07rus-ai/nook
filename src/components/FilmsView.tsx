import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Film, Note } from '../types'
import { noteTitle } from '../types'
import { addFilm, deleteFilm, importFilms, toggleFilmWatched, updateFilm } from '../lib/store'
import {
  FILM_FILTER_LABEL,
  FILM_SORT_OPTIONS,
  filmCounts,
  formatRating,
  matchesFilmFilter,
  parseFilmsFromNote,
  parseRating,
  sortFilms,
  type FilmFilter,
  type FilmSort,
  type ParsedFilm,
} from '../lib/films'
import { plural } from '../lib/date'
import { rowMotion, T, T_FAST } from '../lib/motion'
import { Checkbox } from './Checkbox'
import { Select } from './Select'
import {
  FilmSlateIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
  SortAscendingIcon,
  TrashIcon,
} from './icons'

interface FilmsViewProps {
  films: Film[]
  /** Only for the import: a watchlist usually starts life inside a note. */
  notes: Note[]
  phone?: boolean
}

const FILTERS: FilmFilter[] = ['all', 'want', 'seen']

/**
 * The watchlist.
 *
 * One layout for both platforms, because there is nothing here a wide window
 * would spend its extra width on: a film is a rating, a title and a tick, and
 * that row is the same row on a phone.
 *
 * The rating is an ordinary field on every row rather than something behind an
 * edit mode. It is the value that actually changes — you look a film up, you
 * type the number — so it gets the direct treatment, and the title, which is
 * written once, hides behind the pencil.
 */
export function FilmsView({ films, notes, phone = false }: FilmsViewProps) {
  const [filter, setFilter] = useState<FilmFilter>('all')
  const [sort, setSort] = useState<FilmSort>('rating')
  const [importing, setImporting] = useState(false)

  const visible = useMemo(
    () => sortFilms(films.filter((film) => matchesFilmFilter(film, filter)), sort),
    [films, filter, sort],
  )
  const counts = filmCounts(films)

  return (
    <div
      className={
        phone
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex min-w-0 flex-1 flex-col pr-4 pb-4 pl-1'
      }
    >
      <div className={`flex shrink-0 items-start gap-3 ${phone ? 'px-4 pt-3' : 'px-4 pt-2'}`}>
        <div className="min-w-0 flex-1">
          <h1 className={`truncate font-semibold text-fg ${phone ? 'text-xl' : 'text-xl'}`}>
            Фильмы
          </h1>
          <p className="mt-0.5 text-sm text-fg-3">
            {films.length === 0
              ? 'список пуст'
              : `${counts.want} хочу посмотреть · ${counts.seen} посмотрено`}
          </p>
        </div>

        <Select
          label="Сортировка"
          value={sort}
          onChange={(value) => setSort(value as FilmSort)}
          options={FILM_SORT_OPTIONS}
          icon={<SortAscendingIcon size={14} className="shrink-0 text-fg-2" />}
          className={phone ? 'w-36 shrink-0' : 'w-44 shrink-0'}
        />
      </div>

      <div className={`shrink-0 px-4 ${phone ? 'pt-3' : 'pt-4'}`}>
        <FilmComposer />
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {FILTERS.map((candidate) => (
            <Chip
              key={candidate}
              label={candidate === 'want' ? 'Хочу' : FILM_FILTER_LABEL[candidate]}
              active={filter === candidate}
              onClick={() => setFilter(candidate)}
            />
          ))}
        </div>

        {/* The list normally starts life in a note, so getting it out of one is
            a first-class action rather than something buried in settings. */}
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="focus-ring press flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg"
        >
          <NotePencilIcon size={13} />
          Из записки
        </button>
      </div>

      <div className="scroll-y min-h-0 flex-1 px-4 pt-3 pb-4">
        {visible.length === 0 ? (
          <Empty filter={filter} total={films.length} onImport={() => setImporting(true)} />
        ) : (
          <ul className="card divide-y divide-line-soft overflow-hidden">
            <AnimatePresence initial={false}>
              {visible.map((film) => (
                <FilmRow key={film.id} film={film} />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        notes={notes}
        films={films}
      />
    </div>
  )
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`focus-ring press shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors duration-150 ${
        active ? 'bg-accent-dim text-fg' : 'bg-fill text-fg-2 hover:bg-fill-hover hover:text-fg'
      }`}
    >
      {label}
    </button>
  )
}

// ----------------------------------------------------------------- composing

function FilmComposer() {
  const [title, setTitle] = useState('')
  const [rating, setRating] = useState('')

  const submit = () => {
    if (!title.trim()) return
    addFilm(title, parseRating(rating))
    setTitle('')
    setRating('')
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder="Название фильма"
        aria-label="Название фильма"
        className="field text-md min-w-0 flex-1 px-3 py-2.5 text-fg outline-none placeholder:text-fg-3"
      />
      <input
        value={rating}
        onChange={(event) => setRating(cleanRating(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
        placeholder="0–10"
        inputMode="decimal"
        aria-label="Оценка"
        className="field tnum w-16 shrink-0 px-2 py-2.5 text-center text-sm text-fg outline-none placeholder:text-fg-3"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim()}
        aria-label="Добавить фильм"
        title="Добавить фильм"
        className="focus-ring press btn-primary grid h-11 w-11 shrink-0 place-items-center"
      >
        <PlusIcon size={18} />
      </button>
    </div>
  )
}

/** Digits and one separator, at most: everything else is not a rating. */
function cleanRating(value: string): string {
  return value.replace(/[^\d.,]/g, '').slice(0, 4)
}

// ---------------------------------------------------------------------- rows

function FilmRow({ film }: { film: Film }) {
  const [editing, setEditing] = useState(false)

  return (
    <motion.li
      layout="position"
      {...rowMotion}
      className="group flex items-center gap-3 px-3 py-2 transition-colors duration-150 hover:bg-raised"
    >
      <Checkbox
        checked={film.watched}
        onChange={() => toggleFilmWatched(film.id)}
        label={film.watched ? `Вернуть в список: ${film.title}` : `Посмотрено: ${film.title}`}
      />

      <RatingField film={film} />

      {editing ? (
        <TitleField film={film} onDone={() => setEditing(false)} />
      ) : (
        <span
          className={`text-md min-w-0 flex-1 truncate transition-colors duration-150 ${
            film.watched ? 'text-fg-3 line-through' : 'text-fg'
          }`}
          title={film.title}
        >
          {film.title}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <RowButton label={`Переименовать: ${film.title}`} onClick={() => setEditing(true)}>
          <PencilSimpleIcon size={14} />
        </RowButton>
        <RowButton label={`Удалить: ${film.title}`} danger onClick={() => deleteFilm(film.id)}>
          <TrashIcon size={14} />
        </RowButton>
      </div>
    </motion.li>
  )
}

function RowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`focus-ring press grid h-8 w-8 place-items-center rounded-full text-fg-2 transition-colors duration-150 ${
        danger ? 'hover:text-danger' : 'hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * The rating, editable where it is shown.
 *
 * A draft is held while the field has the focus, because "7." is a legal thing
 * to have typed and an illegal thing to store: parsing on every keystroke would
 * throw the dot away as fast as it was typed. The value is read back out on
 * blur, so what stays on screen is always what was actually saved.
 */
function RatingField({ film }: { film: Film }) {
  const [draft, setDraft] = useState<string | null>(null)
  const stored = film.rating === null ? '' : formatRating(film.rating)

  const commit = () => {
    if (draft !== null && draft !== stored) updateFilm(film.id, { rating: parseRating(draft) })
    setDraft(null)
  }

  return (
    <input
      value={draft ?? stored}
      inputMode="decimal"
      placeholder="—"
      aria-label={`Оценка: ${film.title}`}
      title="Оценка от 0 до 10"
      onFocus={(event) => {
        setDraft(stored)
        event.currentTarget.select()
      }}
      onChange={(event) => setDraft(cleanRating(event.target.value))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className="field tnum h-9 w-14 shrink-0 px-1 text-center text-sm text-fg outline-none placeholder:text-fg-3"
    />
  )
}

function TitleField({ film, onDone }: { film: Film; onDone: () => void }) {
  const [draft, setDraft] = useState(film.title)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== film.title) updateFilm(film.id, { title: trimmed })
    onDone()
  }

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') onDone()
      }}
      aria-label={`Название: ${film.title}`}
      className="field text-md min-w-0 flex-1 px-2 py-1 text-fg outline-none"
    />
  )
}

function Empty({
  filter,
  total,
  onImport,
}: {
  filter: FilmFilter
  total: number
  onImport: () => void
}) {
  if (total === 0) {
    return (
      <div className="card flex min-h-52 flex-col items-center justify-center gap-3 px-8 py-12 text-center">
        <FilmSlateIcon size={26} className="text-fg-3" />
        <p className="text-md font-medium text-fg-2">Список пуст</p>
        <p className="max-w-xs text-sm leading-relaxed text-fg-3">
          Впиши название и оценку сверху. Если список уже есть в записке, его можно перенести
          целиком
        </p>
        <button
          type="button"
          onClick={onImport}
          className="focus-ring press btn-quiet mt-1 px-4 py-2 text-sm"
        >
          Перенести из записки
        </button>
      </div>
    )
  }

  return (
    <div className="card flex min-h-40 items-center justify-center px-6 py-10 text-center">
      <p className="text-md font-medium text-fg-2">
        {filter === 'want' ? 'Всё посмотрено' : 'Пока ничего не посмотрено'}
      </p>
    </div>
  )
}

// -------------------------------------------------------------------- import

interface PreviewItem extends ParsedFilm {
  /** Already on the list, so the import will step over it. */
  duplicate: boolean
}

/**
 * Moving a list out of a note.
 *
 * Every line is shown as it was read before anything is written, because the
 * reading is a guess: a rating is only separated from a title when the line
 * leaves no doubt about which is which. Seeing "9 рота" arrive whole, and a
 * missing rating arrive blank, is the difference between a tool you trust with
 * fifty lines and one you check by hand afterwards.
 */
function ImportDialog({
  open,
  onClose,
  notes,
  films,
}: {
  open: boolean
  onClose: () => void
  notes: Note[]
  films: Film[]
}) {
  const [pickedId, setPickedId] = useState<string | null>(null)
  const picked = notes.find((note) => note.id === pickedId) ?? null

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reopening starts at the note list again rather than on the last preview.
  useEffect(() => {
    if (!open) setPickedId(null)
  }, [open])

  const preview: PreviewItem[] = useMemo(() => {
    if (!picked) return []
    const seen = new Set(films.map((film) => film.title.trim().toLocaleLowerCase('ru')))
    return parseFilmsFromNote(picked.body).map((item) => {
      const key = item.title.trim().toLocaleLowerCase('ru')
      const duplicate = seen.has(key)
      seen.add(key)
      return { ...item, duplicate }
    })
  }, [picked, films])

  const fresh = preview.filter((item) => !item.duplicate)

  const confirm = () => {
    importFilms(preview)
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть перенос"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={T_FAST}
            className="fixed inset-0 z-[60] bg-[oklch(0%_0_0/0.45)]"
          />

          <motion.div
            role="dialog"
            aria-label="Перенести список из записки"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={T}
            className="fixed inset-x-4 top-[8%] bottom-[8%] z-[70] mx-auto flex max-w-lg flex-col overflow-hidden rounded-xl bg-panel shadow-[var(--shadow-lift)]"
          >
            <div className="shrink-0 border-b border-line-soft px-5 py-4">
              <h2 className="text-lg font-semibold text-fg">
                {picked ? 'Что получится' : 'Из какой записки'}
              </h2>
              <p className="mt-0.5 text-sm text-fg-3">
                {picked
                  ? `${fresh.length} ${plural(fresh.length, 'фильм', 'фильма', 'фильмов')}${
                      preview.length - fresh.length > 0
                        ? `, повторов пропущено: ${preview.length - fresh.length}`
                        : ''
                    }`
                  : 'Каждая строка станет фильмом'}
              </p>
            </div>

            <div className="scroll-y min-h-0 flex-1 px-3 py-3">
              {!picked ? (
                notes.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-fg-3">Записок пока нет</p>
                ) : (
                  <div className="flex flex-col">
                    {notes.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setPickedId(note.id)}
                        className="focus-ring press flex items-center gap-3 rounded-lg px-3 py-3 text-left text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg"
                      >
                        <NotePencilIcon size={16} className="shrink-0 text-fg-3" />
                        <span className="text-md min-w-0 flex-1 truncate">{noteTitle(note)}</span>
                        <span className="tnum shrink-0 text-xs text-fg-3">
                          {parseFilmsFromNote(note.body).length}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : preview.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-fg-3">
                  В этой записке нет строк, которые можно перенести
                </p>
              ) : (
                <ul className="flex flex-col">
                  {preview.map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className={`flex items-center gap-3 px-3 py-2 ${
                        item.duplicate ? 'opacity-45' : ''
                      }`}
                    >
                      <span
                        className="h-[18px] w-[18px] shrink-0 rounded-full border"
                        style={{
                          borderColor: item.watched
                            ? 'var(--color-accent)'
                            : 'var(--color-control)',
                          background: item.watched ? 'var(--color-accent)' : 'transparent',
                        }}
                      />
                      <span className="tnum w-9 shrink-0 text-center text-sm text-fg-2">
                        {item.rating === null ? '—' : formatRating(item.rating)}
                      </span>
                      <span
                        className={`text-md min-w-0 flex-1 truncate ${
                          item.watched ? 'text-fg-3 line-through' : 'text-fg'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.duplicate && (
                        <span className="shrink-0 text-xs text-fg-3">уже есть</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-line-soft px-5 py-3">
              <button
                type="button"
                onClick={picked ? () => setPickedId(null) : onClose}
                className="focus-ring press btn-quiet px-4 py-2 text-sm"
              >
                {picked ? 'Назад' : 'Отмена'}
              </button>
              {picked && (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={fresh.length === 0}
                  className="focus-ring press btn-primary px-4 py-2 text-sm"
                >
                  Добавить {fresh.length}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
