import { useMemo, useRef, useState } from 'react'
import type { Category, Priority, Repeat } from '../types'
import { PRIORITY_OPTIONS, REPEAT_OPTIONS } from '../types'
import { formatDue, fromLocalInput, parseDueFromText, shiftDays, todayKey } from '../lib/date'
import { addTask } from '../lib/store'
import { PlusIcon } from './icons'
import { Labelled, categoryOptions } from './TaskItem'
import { Select } from './Select'
import { DateTimeField } from './DateTimeField'

interface TaskComposerProps {
  categories: Category[]
  /** Category preselected by the sidebar, if any. */
  defaultCategoryId: string | null
  /** Deadline preselected by the active filter. */
  defaultDue?: string | null
}

export function TaskComposer({
  categories,
  defaultCategoryId,
  defaultDue = null,
}: TaskComposerProps) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState<string | null>(defaultDue)
  const [priority, setPriority] = useState<Priority>('normal')
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [remindAt, setRemindAt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // A trailing "сегодня" / "завтра" / "12.08" in the text wins over the picker.
  const parsed = useMemo(() => parseDueFromText(title), [title])
  const effectiveDue = parsed?.due ?? due
  const finalTitle = (parsed?.title ?? title).trim()

  // Details stay folded away until there is something to attach them to.
  const expanded = title.trim().length > 0

  const submit = () => {
    if (!finalTitle) return
    addTask({
      title: finalTitle,
      due: effectiveDue,
      priority,
      categoryId: categoryId ?? defaultCategoryId,
      repeat,
      remindAt: fromLocalInput(remindAt),
    })
    setTitle('')
    setDue(defaultDue)
    setPriority('normal')
    setRepeat('none')
    setRemindAt('')
    inputRef.current?.focus()
  }

  return (
    <div className="field px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={!finalTitle}
          aria-label="Добавить задачу"
          title="Добавить задачу"
          className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-fg disabled:opacity-40"
        >
          <PlusIcon size={16} />
        </button>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setTitle('')
          }}
          placeholder="Что нужно сделать?"
          aria-label="Новая задача"
          className="text-md min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
        />
        {effectiveDue && (
          <span className="tnum shrink-0 rounded-sm bg-accent-dim px-1.5 py-0.5 text-xs text-accent-hi">
            {formatDue(effectiveDue)}
          </span>
        )}
      </div>

      {expanded && (
        <div className="enter mt-3 border-t border-line-soft pt-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Labelled label="Срок">
              <Select
                label="Срок"
                value={due ?? ''}
                onChange={(v) => setDue(v || null)}
                options={[
                  { value: '', label: 'Без срока' },
                  { value: todayKey(), label: 'Сегодня' },
                  { value: shiftDays(1), label: 'Завтра' },
                  { value: shiftDays(7), label: 'Через неделю' },
                ]}
              />
            </Labelled>
            <Labelled label="Приоритет">
              <Select
                label="Приоритет"
                value={priority}
                onChange={(v) => setPriority(v as Priority)}
                options={PRIORITY_OPTIONS}
              />
            </Labelled>
            <Labelled label="Категория">
              <Select
                label="Категория"
                value={categoryId ?? ''}
                onChange={(v) => setCategoryId(v || null)}
                options={categoryOptions(categories)}
              />
            </Labelled>
            <Labelled label="Повтор">
              <Select
                label="Повтор"
                value={repeat}
                onChange={(v) => setRepeat(v as Repeat)}
                options={REPEAT_OPTIONS}
              />
            </Labelled>
          </div>

          {/* A reminder used to be reachable only by opening a task you had
              already created. Wanting to be reminded is part of writing the
              task down, not an afterthought. */}
          <div className="mt-3">
            <Labelled label="Напоминание">
              <DateTimeField
                value={remindAt}
                onChange={setRemindAt}
                label="Когда напомнить"
                placeholder="Не напоминать"
              />
            </Labelled>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={!finalTitle}
              className="focus-ring press btn-primary shrink-0 px-4 py-1.5 text-sm"
            >
              Добавить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
