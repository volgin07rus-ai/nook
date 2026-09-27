import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Note } from '../types'
import { noteTitle } from '../types'
import { addNote, deleteNote, setNoteBody, setNoteTitle, updateSettings, useStore } from '../lib/store'
import { htmlToText, sanitize } from '../lib/richtext'
import { hydrate, imageUrl, saveImage } from '../lib/images'
import { formatPast, plural } from '../lib/date'
import { showToast } from '../lib/toast'
import { rowMotion, T_FAST, T_LAYOUT } from '../lib/motion'
import { useKeyboard } from '../lib/useKeyboard'
import {
  CaretLeftIcon,
  ListBulletsIcon,
  ImageIcon,
  ListChecksIcon,
  MinusIcon,
  PlusIcon,
  TextAaIcon,
  TrashIcon,
} from './icons'

const SAVE_DELAY = 400

interface NotepadViewProps {
  notes: Note[]
  /** One screen at a time on a phone: the list, then the note. */
  phone?: boolean
}

export function NotepadView({ notes, phone = false }: NotepadViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(phone ? null : (notes[0]?.id ?? null))

  // Keep the selection valid as notes come and go.
  const selected = useMemo(() => {
    const found = notes.find((n) => n.id === selectedId) ?? null
    // The desktop always keeps one open, because the pane next to the list
    // would otherwise sit empty. On a phone the list is a screen of its own,
    // so nothing opens until it is tapped.
    return phone ? found : (found ?? notes[0] ?? null)
  }, [notes, selectedId, phone])

  useEffect(() => {
    if (!phone && selected && selected.id !== selectedId) setSelectedId(selected.id)
  }, [phone, selected, selectedId])

  const create = () => {
    const note = addNote()
    setSelectedId(note.id)
  }

  const list = (
    <div
      className={
        phone
          ? 'flex min-h-0 flex-1 flex-col'
          : 'card flex w-60 shrink-0 flex-col overflow-hidden'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h1 className={`font-semibold text-fg ${phone ? 'text-xl' : 'text-lg'}`}>Блокнот</h1>
        {/* On a phone the plus lives near the thumb instead, below. */}
        {!phone && (
          <button
            type="button"
            onClick={create}
            title="Новая записка"
            aria-label="Новая записка"
            className="focus-ring press grid h-7 w-7 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg"
          >
            <PlusIcon size={15} />
          </button>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="px-4 pb-4 text-sm leading-relaxed text-fg-3">
          Записок пока нет. Нажми плюс, чтобы завести первую
        </p>
      ) : (
        <ul
          className={`scroll-y min-h-0 flex-1 ${phone ? '' : 'border-t border-line-soft'}`}
        >
          <AnimatePresence initial={false}>
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                active={!phone && note.id === selected?.id}
                onSelect={() => setSelectedId(note.id)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )

  if (phone) {
    if (selected) {
      return (
        <NoteEditor
          key={selected.id}
          note={selected}
          count={notes.length}
          phone
          onBack={() => setSelectedId(null)}
        />
      )
    }
    return (
      /*
       * The plus sits bottom-right rather than in the header. On a phone the
       * top corner is the furthest point from a thumb holding the device, and
       * "add a note" is the one thing this screen is for.
       */
      <div className="relative flex min-h-0 flex-1 flex-col">
        {list}
        <button
          type="button"
          onClick={create}
          aria-label="Новая записка"
          className="focus-ring press absolute right-4 bottom-4 grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--shadow-lift)]"
        >
          <PlusIcon size={22} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 gap-3 pr-4 pb-4 pl-1">
      {list}

      {selected ? (
        <NoteEditor key={selected.id} note={selected} count={notes.length} />
      ) : (
        <div className="card flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-md font-medium text-fg-2">Ничего не выбрано</p>
          <p className="max-w-xs text-sm leading-relaxed text-fg-3">
            Первая строка записки становится её заголовком, отдельно вводить его не нужно
          </p>
        </div>
      )}
    </div>
  )
}

function NoteRow({
  note,
  active,
  onSelect,
  onDelete,
}: {
  note: Note
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <motion.li layout="position" {...rowMotion} transition={T_LAYOUT} className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        /* pr-11, а не px-4: справа стоит кнопка удаления, и длинное название
           заезжало прямо под неё. На телефоне кнопка видна всегда, так что
           место под неё резервируется постоянно — иначе строка прыгала бы. */
        className={`flex w-full flex-col gap-0.5 border-b border-line-soft py-3 pr-11 pl-4 text-left transition-colors duration-150 ${
          active ? 'bg-accent-dim' : 'hover:bg-raised'
        }`}
      >
        <span className={`truncate text-sm ${active ? 'text-fg' : 'text-fg-2'}`}>
          {noteTitle(note)}
        </span>
        {/* Always the date, never a text preview: the title already comes from
            the body, so echoing more of the same text underneath told you
            nothing and made the row jump around while typing.
            The selected row sits on accent-dim, darker than the card the muted
            token was tuned against, so it steps up one level. */}
        <span className={`truncate text-xs ${active ? 'text-fg-2' : 'text-fg-3'}`}>
          {formatPast(note.updatedAt)}
        </span>
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label={`Удалить записку ${noteTitle(note)}`}
        title="Удалить записку"
        className="focus-ring press absolute top-2.5 right-2 grid h-6 w-6 place-items-center rounded-full text-fg-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
      >
        <TrashIcon size={13} />
      </button>
    </motion.li>
  )
}

/**
 * Saves shortly after typing stops, and flushes immediately when the note is
 * switched or the view is left, so nothing is lost mid-sentence.
 */
function NoteEditor({
  note,
  count,
  phone = false,
  onBack,
}: {
  note: Note
  count: number
  phone?: boolean
  onBack?: () => void
}) {
  const settings = useStore().settings
  const spacing = { line: settings.noteLineHeight, letter: settings.noteLetterSpacing }
  const onSpacing = (next: Partial<{ line: number; letter: number }>) =>
    updateSettings({
      ...(next.line !== undefined ? { noteLineHeight: next.line } : {}),
      ...(next.letter !== undefined ? { noteLetterSpacing: next.letter } : {}),
    })
  const keyboard = useKeyboard()

  const [title, setTitle] = useState(note.title)
  const titleSaved = useRef(note.title)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [dirty, setDirty] = useState(false)
  const [words, setWords] = useState(() => countWords(note.body))
  const [empty, setEmpty] = useState(() => !htmlToText(note.body).trim())
  const [marks, setMarks] = useState<Marks>(NO_MARKS)
  const saved = useRef(note.body)
  const latest = useRef(note.body)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)

  /*
   * The editing surface is uncontrolled, which it has to be: writing to
   * innerHTML on every keystroke would destroy and rebuild the nodes the caret
   * lives in, and the caret would jump to the start after every letter. React
   * sets the markup once, the browser owns it from there, and the component is
   * keyed by note id so switching notes remounts it.
   */
  useEffect(() => {
    let alive = true
    // Разметка приходит с именами файлов вместо адресов; настоящие адреса
    // подставляются здесь, только для показа. См. lib/images.ts.
    void hydrate(note.body).then((html) => {
      if (alive && areaRef.current) areaRef.current.innerHTML = html
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Adopt edits made in the other window, but never clobber local typing.
  useEffect(() => {
    if (note.body !== saved.current && !timer.current) {
      saved.current = note.body
      latest.current = note.body
      const incoming = note.body
      void hydrate(incoming).then((html) => {
        // Пока ходили за адресами, человек мог начать печатать — тогда
        // подставлять чужую разметку уже нельзя.
        if (saved.current === incoming && !timer.current && areaRef.current) {
          areaRef.current.innerHTML = html
        }
      })
      setWords(countWords(incoming))
      setEmpty(!htmlToText(incoming).trim())
    }
  }, [note.body])

  useEffect(() => {
    if (!note.body) areaRef.current?.focus()
  }, [note.id, note.body])

  // Which marks are under the caret right now, for the pressed state — and
  // where the caret was, for when the size field steals the focus.
  useEffect(() => {
    const onSelect = () => {
      const root = areaRef.current
      const selection = document.getSelection()
      if (!root || !root.contains(selection?.anchorNode ?? null)) return
      if (selection && selection.rangeCount > 0) {
        savedRange.current = selection.getRangeAt(0).cloneRange()
      }
      setMarks(readMarks(root))
    }
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [])

  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (latest.current !== saved.current) {
      saved.current = latest.current
      setNoteBody(note.id, latest.current)
    }
    setDirty(false)
  }

  const flushTitle = () => {
    if (titleTimer.current) {
      clearTimeout(titleTimer.current)
      titleTimer.current = null
    }
    if (title !== titleSaved.current) {
      titleSaved.current = title
      setNoteTitle(note.id, title)
    }
  }

  const onTitleChange = (value: string) => {
    setTitle(value)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      titleTimer.current = null
      if (value !== titleSaved.current) {
        titleSaved.current = value
        setNoteTitle(note.id, value)
      }
    }, SAVE_DELAY)
  }

  // Remounted per note via the key, so this also flushes when switching notes.
  useEffect(() => flush, [])
  useEffect(() => flushTitle, [])

  const onChange = () => {
    const root = areaRef.current
    if (!root) return
    // Sanitised on the way out, not on the way in: rewriting innerHTML mid-edit
    // would move the caret. What the user types is safe; what a paste brings in
    // is cleaned here before it can reach storage.
    const html = sanitize(root.innerHTML)
    latest.current = html
    setWords(countWords(html))
    setEmpty(!htmlToText(html).trim())
    setDirty(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      flush()
    }, SAVE_DELAY)
  }

  /* Runs the command, then re-reads the document: the toolbar reflects what the
   * caret is actually in, never what we assume the click did. */
  const run = (fn: () => void) => {
    const root = areaRef.current
    if (!root) return

    /*
     * Whether the editor had the focus has to be read *before* focusing it.
     * Focusing an unfocused contenteditable drops the caret at the very start,
     * and asking afterwards whether the selection is inside the editor always
     * answers yes — so the restore never ran and every command from the size
     * field landed on the first word of the note.
     */
    const hadFocus = root.contains(document.activeElement)
    root.focus()
    if (!hadFocus && savedRange.current) {
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(savedRange.current)
    }

    fn()
    onChange()
    setMarks(readMarks(root))
  }

  /**
   * Вставка фотографии.
   *
   * Через обычное поле выбора файла, а не через системный диалог tauri: на
   * телефоне это открывает галерею и камеру, на компьютере — проводник, и
   * одинаково работает в обоих вебвью без отдельной ветки на платформу.
   */
  const insertImage = async (file: File) => {
    try {
      const name = await saveImage(file)
      const url = await imageUrl(name)
      if (!url) return
      run(() => {
        document.execCommand(
          'insertHTML',
          false,
          `<img data-nook="${name}" src="${url}" alt="">`,
        )
      })
    } catch (error) {
      showToast(`Не удалось добавить фото: ${String(error)}`)
    }
  }

  const toggle = (command: 'bold' | 'italic' | 'underline' | 'strikeThrough') =>
    run(() => document.execCommand(command, false))

  const setSize = (px: number) =>
    run(() => {
      const next = clampSize(px)
      if (next !== marks.size) applyFontSize(next)
    })

  const makeList = (kind: 'bullet' | 'todo') =>
    run(() => {
      const root = areaRef.current
      if (!root) return
      const already = listAtSelection(root)

      // Second press on the same kind turns the list back into paragraphs.
      if (already?.kind === kind) {
        document.execCommand('insertUnorderedList', false)
        return
      }
      // Switching kind: the <ul> is already there, only the flavour changes.
      if (already) {
        already.el.classList.toggle('todo', kind === 'todo')
        return
      }
      document.execCommand('insertUnorderedList', false)
      const made = listAtSelection(root)
      if (made && kind === 'todo') made.el.classList.add('todo')
    })

  /*
   * Ticking a checklist item. The circle is drawn by CSS rather than being a
   * real element — a button inside contenteditable fights the caret — so the
   * hit test is "did the click land in the marker gutter of this row".
   */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const item = target.closest('li')
    if (!item || !item.parentElement?.classList.contains('todo')) return

    // The circle is painted to the left of the row's own box, in the list's
    // padding, so the hit area is the strip before it — not inside it. The
    // multiplier tracks padding-left on ul.todo in the stylesheet.
    const rect = item.getBoundingClientRect()
    const gutter = (parseFloat(getComputedStyle(item).fontSize) || 15) * 2.4
    if (event.clientX >= rect.left || event.clientX < rect.left - gutter) return

    /*
     * Ticking is not editing, so it must not summon the keyboard. preventDefault
     * alone did not hold: the tap lands inside the contenteditable, and Android
     * opens the keyboard off the touch sequence even when focus is blocked. So
     * if the editor was not being typed in, it is put back out of focus.
     */
    const wasEditing = event.currentTarget.contains(document.activeElement)
    event.preventDefault()

    if (item.getAttribute('data-done') === '1') item.removeAttribute('data-done')
    else item.setAttribute('data-done', '1')
    onChange()

    if (!wasEditing) {
      const editor = event.currentTarget
      requestAnimationFrame(() => editor.blur())
    }
  }

  return (
    <div
      className={
        phone
          ? // No bottom padding: the bar goes right against the keyboard.
            'flex min-h-0 flex-1 flex-col px-4 pt-2 pb-0'
          : 'card flex min-h-0 flex-1 flex-col px-7 py-6'
      }
    >
      {/* The name is a field, not the first line of the text. Left empty it
          still falls back to the first line, which is what most notes want. */}
      <div className="mb-2 flex shrink-0 items-center gap-1">
        {phone && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Назад к списку записок"
            className="focus-ring press -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-fg-2"
          >
            <CaretLeftIcon size={20} />
          </button>
        )}
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={flushTitle}
          placeholder={firstLineOf(note) || 'Название'}
          aria-label="Название записки"
          className="text-md min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 font-medium text-fg outline-none placeholder:font-normal placeholder:text-fg-3 focus:bg-panel"
        />
      </div>

      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-4">
        <span className="text-xs text-fg-3">
          {count} {plural(count, 'записка', 'записки', 'записок')}
        </span>
        <span className="text-xs text-fg-3">
          {dirty
            ? 'сохраняю…'
            : words === 0
              ? 'пусто'
              : `${words} ${plural(words, 'слово', 'слова', 'слов')}`}
        </span>
      </div>

      <div
        ref={areaRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Текст записки"
        onInput={onChange}
        onPointerDown={onPointerDown}
        onBlur={flush}
        data-empty={empty}
        data-placeholder="Мысль, ссылка, черновик — что угодно"
        spellCheck={false}
        style={{
          lineHeight: spacing.line,
          letterSpacing: `${spacing.letter}em`,
          // Also as a variable: the checklist circles centre themselves on the
          // line box, and calc() cannot read the line-height property.
          ['--note-line' as string]: spacing.line,
          // Clears the bar below, and the soft keyboard under it.
          paddingBottom: keyboard.inset + 8,
        }}
        className="note-body scroll-y text-md min-h-0 w-full flex-1 bg-transparent text-fg outline-none"
      />

      {/*
       * The bar sits at the bottom, not the top. At the top it scrolls out of
       * reach the moment the note is longer than the screen — exactly when it
       * is needed. Down here it stays put, and the offset lifts it clear of
       * the soft keyboard, which on Android draws over the page rather than
       * resizing it.
       */}
      <div
        className="shrink-0"
        style={{ transform: keyboard.inset ? `translateY(-${keyboard.inset}px)` : undefined }}
      >
        <Toolbar
          marks={marks}
          onToggle={toggle}
          onSize={setSize}
          onList={makeList}
          onImage={insertImage}
          spacing={spacing}
          onSpacing={onSpacing}
        />
      </div>
    </div>
  )
}

/** The line the title falls back to, shown as the placeholder so it is clear
 *  what the list will say when the field is left empty. */
function firstLineOf(note: Note): string {
  const line = htmlToText(note.body)
    .split('\n')
    .find((l) => l.trim())
  return line ? line.trim().slice(0, 60) : ''
}


// ---------------------------------------------------------------- formatting

/**
 * Sizes are plain pixels, every whole number in the range — no ladder that
 * skips from 16 to 18 and decides for you. 15 is the app's body size, so a
 * note with nothing set reads exactly like the rest of the app.
 */
const MIN_SIZE = 8
const MAX_SIZE = 32
const BASE_SIZE = 15

const clampSize = (px: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(px)))

interface Marks {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  size: number
  list: 'bullet' | 'todo' | null
}
const NO_MARKS: Marks = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  size: BASE_SIZE,
  list: null,
}

/** The <ul> the caret is inside, if any, and which flavour it is. */
function listAtSelection(
  root: HTMLElement,
): { el: HTMLElement; kind: 'bullet' | 'todo' } | null {
  const node = document.getSelection()?.anchorNode
  if (!node || !root.contains(node)) return null
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const list = start?.closest('ul')
  if (!list || !root.contains(list)) return null
  return { el: list as HTMLElement, kind: list.classList.contains('todo') ? 'todo' : 'bullet' }
}

/**
 * The word the caret sits in. This is what a size applies to when nothing is
 * selected — "make the word I just wrote bigger" is the whole point, and
 * selecting it by hand first defeats it.
 */
function wordAround(range: Range): Range | null {
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  let start = range.startOffset
  let end = range.startOffset
  while (start > 0 && !/\s/.test(text[start - 1])) start--
  while (end < text.length && !/\s/.test(text[end])) end++
  if (start === end) return null
  const word = document.createRange()
  word.setStart(node, start)
  word.setEnd(node, end)
  return word
}

function applyFontSize(px: number) {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return
  let range = selection.getRangeAt(0)

  if (range.collapsed) {
    const word = wordAround(range)
    if (!word) return
    range = word
  }

  const span = document.createElement('span')
  span.style.fontSize = `${px}px`
  span.appendChild(range.extractContents())
  // Sizes inside the new one would fight it; the outer size wins.
  for (const inner of span.querySelectorAll<HTMLElement>('span[style*="font-size"]')) {
    inner.style.removeProperty('font-size')
    if (!inner.getAttribute('style')) inner.replaceWith(...inner.childNodes)
  }
  range.insertNode(span)
  collapseNestedSize(span)

  // Keep what was just changed selected, so pressing + again grows the same
  // words instead of starting over somewhere else.
  const after = document.createRange()
  after.selectNodeContents(span)
  selection.removeAllRanges()
  selection.addRange(after)
}

/**
 * Pressing + on the same word again lands the new wrapper *inside* the old
 * one, because the range being wrapped is already in it. Left alone the
 * wrappers stack — one per press — and the note grows markup forever while
 * looking identical. Where the parent holds nothing but this span, it has
 * nothing left to say, so it goes.
 */
function collapseNestedSize(span: HTMLElement) {
  let parent = span.parentElement
  while (
    parent &&
    parent.tagName === 'SPAN' &&
    parent.style.fontSize &&
    parent.textContent === span.textContent
  ) {
    parent.replaceWith(span)
    parent = span.parentElement
  }
}

/** Nearest explicit size above the caret, or the body size when there is none. */
function sizeAtSelection(root: HTMLElement): number {
  const node = document.getSelection()?.anchorNode
  if (!node || !root.contains(node)) return BASE_SIZE
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const sized = start?.closest('span[style*="font-size"]') as HTMLElement | null
  if (!sized) return BASE_SIZE
  const px = parseFloat(sized.style.fontSize)
  return Number.isFinite(px) ? px : BASE_SIZE
}

function readMarks(root: HTMLElement): Marks {
  return {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    strike: document.queryCommandState('strikeThrough'),
    size: sizeAtSelection(root),
    list: listAtSelection(root)?.kind ?? null,
  }
}

function countWords(html: string): number {
  const text = htmlToText(html).trim()
  return text ? text.split(/\s+/).length : 0
}

interface Spacing {
  line: number
  letter: number
}

function Toolbar({
  marks,
  onToggle,
  onSize,
  onList,
  onImage,
  spacing,
  onSpacing,
}: {
  marks: Marks
  onToggle: (command: 'bold' | 'italic' | 'underline' | 'strikeThrough') => void
  onSize: (px: number) => void
  onList: (kind: 'bullet' | 'todo') => void
  onImage: (file: File) => void
  spacing: Spacing
  onSpacing: (next: Partial<Spacing>) => void
}) {
  return (
    /*
     * One row that scrolls sideways, not a wrapping grid.
     *
     * Ten controls need more width than a phone has. Wrapping made the bar two
     * storeys tall; shrinking the buttons put them under the 44px a thumb can
     * reliably hit. Scrolling keeps both the height and the target size, and
     * costs only a swipe to reach the far end — which is how the keyboard bars
     * people already use behave.
     */
    /* bg-canvas is not decoration: lifted over the keyboard the bar sits on top
     * of the note text, and without a fill of its own the words showed through
     * the buttons. */
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line-soft bg-canvas px-1 py-1 [scrollbar-width:none]">
      <Tool label="Жирный" active={marks.bold} onPress={() => onToggle('bold')}>
        <span className="text-md font-bold">Ж</span>
      </Tool>
      <Tool label="Курсив" active={marks.italic} onPress={() => onToggle('italic')}>
        <span className="text-md italic">К</span>
      </Tool>
      <Tool label="Подчёркнутый" active={marks.underline} onPress={() => onToggle('underline')}>
        <span className="text-md underline">Ч</span>
      </Tool>
      <Tool label="Зачёркнутый" active={marks.strike} onPress={() => onToggle('strikeThrough')}>
        <span className="text-md line-through">З</span>
      </Tool>

      <Divider />

      <Tool
        label="Мельче"
        active={false}
        disabled={marks.size <= MIN_SIZE}
        onPress={() => onSize(marks.size - 1)}
      >
        <MinusIcon size={16} />
      </Tool>
      <SizeField value={marks.size} onSubmit={onSize} />
      <Tool
        label="Крупнее"
        active={false}
        disabled={marks.size >= MAX_SIZE}
        onPress={() => onSize(marks.size + 1)}
      >
        <PlusIcon size={16} />
      </Tool>

      <Divider />

      <Tool label="Список" active={marks.list === 'bullet'} onPress={() => onList('bullet')}>
        <ListBulletsIcon size={18} />
      </Tool>
      <Tool label="Список с галочками" active={marks.list === 'todo'} onPress={() => onList('todo')}>
        <ListChecksIcon size={18} />
      </Tool>

      <Divider />

      <PhotoButton onPick={onImage} />

      {/* Spacing stays behind a button: set once, then left alone. */}
      <AppearanceMenu spacing={spacing} onSpacing={onSpacing} />
    </div>
  )
}

/**
 * Кнопка «фото».
 *
 * Внутри — обычное поле выбора файла, спрятанное под клавишу панели. На
 * телефоне такое поле открывает галерею и камеру, на компьютере проводник,
 * и делает это средствами системы: ни отдельного диалога, ни отдельной
 * ветки на платформу.
 */
function PhotoButton({ onPick }: { onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Tool label="Фото" active={false} onPress={() => inputRef.current?.click()}>
        <ImageIcon size={18} />
      </Tool>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Поле обнуляется, иначе выбор того же снимка второй раз подряд
          // не вызовет события вовсе.
          event.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px shrink-0 bg-line-soft" />
}

function AppearanceMenu({
  spacing,
  onSpacing,
}: {
  spacing: Spacing
  onSpacing: (next: Partial<Spacing>) => void
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ right: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  /*
   * The panel is a portal, not a child of the button.
   *
   * The toolbar scrolls sideways, and an element that scrolls also clips: an
   * absolutely positioned panel inside it was cut away at the bar's own edge,
   * so pressing the button did nothing visible at all. Out here nothing can
   * clip it, at the cost of positioning it by hand.
   */
  useLayoutEffect(() => {
    if (!open) return
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setAt({
      right: Math.max(8, window.innerWidth - rect.right),
      bottom: Math.max(8, window.innerHeight - rect.top + 8),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={buttonRef} className="shrink-0">
      <Tool label="Интервалы" active={open} onPress={() => setOpen((was) => !was)}>
        <TextAaIcon size={18} />
      </Tool>

      {createPortal(
        <AnimatePresence>
          {open && at && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={T_FAST}
              style={{ position: 'fixed', right: at.right, bottom: at.bottom, zIndex: 80 }}
              className="w-60 rounded-lg border border-line bg-panel p-3 shadow-[var(--shadow-lift)]"
            >
              <Slider
                label="Между строками"
                value={spacing.line}
                min={1.2}
                max={2.4}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(line) => onSpacing({ line })}
              />
              <div className="mt-3">
                <Slider
                  label="Между буквами"
                  value={spacing.letter}
                  min={0}
                  max={0.12}
                  step={0.005}
                  format={(v) => `${Math.round(v * 1000)}`}
                  onChange={(letter) => onSpacing({ letter })}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-fg-2">{label}</span>
        <span className="tnum text-xs text-fg-3">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--color-accent)]"
      />
    </label>
  )
}

/**
 * The size, as a number you can also type into. The +/− buttons are for
 * nudging; when you already know you want 22, walking there one press at a
 * time is the wrong tool.
 */
function SizeField({ value, onSubmit }: { value: number; onSubmit: (px: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const px = Number(draft)
    if (draft !== null && draft !== '' && Number.isFinite(px)) onSubmit(px)
    setDraft(null)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft ?? String(value)}
      title="Размер шрифта"
      aria-label="Размер шрифта"
      onFocus={(e) => {
        setDraft(String(value))
        e.currentTarget.select()
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className="field tnum focus-ring text-md h-11 w-11 shrink-0 rounded-lg px-0 text-center text-fg-2 outline-none focus:text-fg"
    />
  )
}

function Tool({
  label,
  active,
  disabled = false,
  onPress,
  children,
}: {
  label: string
  active: boolean
  disabled?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      /* Without this the button takes focus, the selection collapses, and the
       * command lands on nothing. */
      onPointerDown={(e) => e.preventDefault()}
      onClick={onPress}
      /* 44px, not 36: the smaller size was a reliable miss under a thumb.
       * Каждая кнопка — отдельная клавиша с собственной подложкой; включённая
       * заливается приглушённым акцентом. */
      className={`focus-ring press grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors duration-150 disabled:opacity-40 ${
        active ? 'bg-accent-dim text-fg' : 'bg-fill text-fg-2 hover:bg-fill-hover hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
