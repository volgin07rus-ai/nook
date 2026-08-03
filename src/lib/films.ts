/**
 * The watchlist: rating, title, seen or not.
 *
 * Ratings are copied from wherever they were read — a 0–10 scale with one
 * decimal — so they are stored and shown on exactly that scale. Always one
 * decimal, including 8.0: a column of numbers is read by scanning down it, and
 * "8" next to "7.4" breaks the alignment that makes scanning work.
 */

import type { Film } from '../types'
import { clampRating } from '../types'

export type FilmSort = 'rating' | 'added' | 'alpha'
export type FilmFilter = 'all' | 'want' | 'seen'

export const FILM_SORT_OPTIONS: Array<{ value: FilmSort; label: string }> = [
  { value: 'rating', label: 'По оценке' },
  { value: 'added', label: 'Сначала новые' },
  { value: 'alpha', label: 'По алфавиту' },
]

export const FILM_FILTER_LABEL: Record<FilmFilter, string> = {
  all: 'Все',
  want: 'Хочу посмотреть',
  seen: 'Посмотрел',
}

export function formatRating(rating: number): string {
  return rating.toFixed(1)
}

/**
 * Reads a rating the way it gets typed: a comma is a decimal point here, and
 * a half-finished "7." is not a number yet. An empty field clears the rating
 * rather than meaning zero — zero is a verdict, blank is "not looked up yet".
 */
export function parseRating(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (!text) return null
  if (!/^\d{1,2}(\.\d+)?$/.test(text)) return null
  return clampRating(Number(text))
}

export function matchesFilmFilter(film: Film, filter: FilmFilter): boolean {
  if (filter === 'want') return !film.watched
  if (filter === 'seen') return film.watched
  return true
}

export function filmCounts(films: Film[]): { want: number; seen: number } {
  let seen = 0
  for (const film of films) if (film.watched) seen++
  return { want: films.length - seen, seen }
}

/**
 * Sorted, with what has already been watched sunk to the bottom.
 *
 * The list answers "what do I watch tonight", so a 9.1 seen last year has no
 * business sitting above an unseen 8.4 — it is not a candidate at all. The
 * "Посмотрел" filter is where finished films are read in their own order, and
 * there the sink has nothing left to do.
 */
export function sortFilms(films: Film[], sort: FilmSort): Film[] {
  const compare = (a: Film, b: Film): number => {
    if (a.watched !== b.watched) return a.watched ? 1 : -1

    switch (sort) {
      case 'rating': {
        // Unrated last: a blank is "not looked up yet", which says nothing
        // about the film and must not read as the worst score on the list.
        if (a.rating === null || b.rating === null) {
          if (a.rating === b.rating) break
          return a.rating === null ? 1 : -1
        }
        if (a.rating !== b.rating) return b.rating - a.rating
        break
      }
      case 'alpha':
        return a.title.localeCompare(b.title, 'ru')
      case 'added':
        break
    }

    // Newest first as the tiebreak, so equal ratings do not shuffle about.
    return b.createdAt - a.createdAt
  }

  return [...films].sort(compare)
}

// ------------------------------------------------------- import from a note

export interface ParsedFilm {
  title: string
  rating: number | null
  watched: boolean
}

interface Line {
  text: string
  /** The block element the line came from, for the tick and the strike. */
  el: Element | null
}

const BLOCKS = new Set(['P', 'DIV', 'H2', 'LI'])
const STRUCK = 'S, STRIKE, DEL'

/**
 * Splits note markup into visible lines, keeping the element each came from —
 * `htmlToText` throws that away, and it is what carries "already watched".
 */
function blockLines(html: string): Line[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const lines: Line[] = []
  const buffer = { text: '' }

  const flush = (owner: Element | null) => {
    if (buffer.text.trim()) lines.push({ text: buffer.text, el: owner })
    buffer.text = ''
  }

  /*
   * One buffer for the whole document, not one per element.
   *
   * The split is between elements that *are* a line and elements that merely
   * *contain* them. A <ul> is neither a line nor an inline mark: flattening it
   * to its own text — which is what treating every non-block as inline did —
   * glued a fifty-film checklist into a single row. So anything that is not a
   * line is walked into, and only <p>, <div>, <h2> and <li> end one.
   */
  const walk = (node: Node, owner: Element | null) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        buffer.text += child.textContent ?? ''
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as Element

      if (el.tagName === 'BR') {
        flush(owner)
        continue
      }
      if (BLOCKS.has(el.tagName)) {
        // Whatever was collected before the block belongs to the block outside.
        flush(owner)
        walk(el, el)
        flush(el)
        continue
      }
      walk(el, owner)
    }
  }

  walk(doc.body, null)
  flush(null)
  return lines
}

/** A line counts as watched if it is ticked off, or struck through end to end. */
function isWatched(el: Element | null): boolean {
  if (!el) return false
  if (el.getAttribute('data-done') === '1') return true
  const own = el.textContent?.trim() ?? ''
  if (!own) return false
  return [...el.querySelectorAll(STRUCK)].some((s) => (s.textContent?.trim() ?? '') === own)
}

/*
 * Where the rating sits in a hand-written line.
 *
 * A decimal is unambiguous — nothing else in a film title looks like "7.8" —
 * so it is taken from either end on its own. A bare integer is not: "9 рота",
 * "7 психопатов" and "8 подруг Оушена" all begin with one, and "Терминатор 2"
 * ends with one. So an integer only counts when something separates it from
 * the title: a dash, a colon, a slash, or brackets around it. Under-reading is
 * the right way to be wrong here — a missing rating is one tap to fix, a title
 * with its first word eaten is not.
 */
const DEC = String.raw`(?:10[.,]0|\d[.,]\d)`
const INT = String.raw`(?:10|\d)`
const SEP = String.raw`[-–—:|/]`

const PATTERNS: Array<{ re: RegExp; title: 1 | 2; rating: 1 | 2 }> = [
  { re: new RegExp(String.raw`^(${DEC})\s*${SEP}?\s+(.+)$`), rating: 1, title: 2 },
  { re: new RegExp(String.raw`^(${DEC})\s*${SEP}\s*(.+)$`), rating: 1, title: 2 },
  { re: new RegExp(String.raw`^(.+?)\s+${SEP}?\s*(${DEC})$`), title: 1, rating: 2 },
  { re: new RegExp(String.raw`^[[(](${INT}|${DEC})[\])]\s*(.+)$`), rating: 1, title: 2 },
  { re: new RegExp(String.raw`^(.+?)\s*[[(](${INT}|${DEC})[\])]$`), title: 1, rating: 2 },
  // Whitespace before the separator is required here and not above: without it
  // "8-й рейс" reads as an 8, while "8 — Начало" still reads the way it looks.
  { re: new RegExp(String.raw`^(${INT})\s+${SEP}\s*(.+)$`), rating: 1, title: 2 },
  { re: new RegExp(String.raw`^(.+?)\s+${SEP}\s*(${INT})$`), title: 1, rating: 2 },
]

/** Separates a rating from a title, leaving the line alone when unsure. */
export function splitRating(line: string): { title: string; rating: number | null } {
  const text = line.trim()
  for (const { re, title, rating } of PATTERNS) {
    const match = re.exec(text)
    if (!match) continue
    const value = parseRating(match[rating])
    const rest = match[title].trim()
    // A line that is only a number is a rating with nothing to rate.
    if (value === null || !rest) continue
    return { title: rest, rating: value }
  }
  return { title: text, rating: null }
}

/** Every line of a note read as a film. The caller shows this before saving. */
export function parseFilmsFromNote(html: string): ParsedFilm[] {
  return blockLines(html)
    .map((line) => {
      const { title, rating } = splitRating(line.text)
      return { title, rating, watched: isWatched(line.el) }
    })
    .filter((film) => film.title.length > 0)
}

/** Titles already on the list, so an import does not double them up. */
export function isDuplicate(films: Film[], title: string): boolean {
  const key = title.trim().toLocaleLowerCase('ru')
  return films.some((film) => film.title.trim().toLocaleLowerCase('ru') === key)
}
