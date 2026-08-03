import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import type { Category, Priority, Repeat, Task } from '../types'
import { PRIORITY_LABEL, PRIORITY_OPTIONS, REPEAT_LABEL, REPEAT_OPTIONS } from '../types'
import { Select, type SelectOption } from './Select'
import { DateTimeField } from './DateTimeField'
import { formatDateTime, formatDue, fromLocalInput, isOverdue, isToday, toLocalInput } from '../lib/date'
import {
  addSubtask,
  deleteSubtask,
  deleteTask,
  snoozeTask,
  toggleSubtask,
  toggleTask,
  updateTask,
} from '../lib/store'
import { Checkbox } from './Checkbox'
import {
  BellIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  DotsSixVerticalIcon,
  FlagIcon,
  ListChecksIcon,
  NotePencilIcon,
  PencilSimpleIcon,
  PlusIcon,
  RepeatIcon,
  TrashIcon,
} from './icons'
import { collapseMotion, rowMotion, T_LAYOUT } from '../lib/motion'

interface TaskItemProps {
  task: Task
  categories: Category[]
  /** Compact rows for the widget: no inline editing, tighter spacing. */
  compact?: boolean
  /** Manual sort only: turns the row into a drag handle target. */
  draggable?: boolean
}

export function TaskItem({
  task,
  categories,
  compact = false,
  draggable = false,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // Dragging starts from the handle only, so a plain click still ticks the box.
  const dragControls = useDragControls()

  const category = categories.find((c) => c.id === task.categoryId) ?? null
  const late = isOverdue(task.due, task.done)
  const doneSubtasks = task.subtasks.filter((s) => s.done).length
  const hasSubtasks = task.subtasks.length > 0
  const canSnooze = !task.done && task.remindAt !== null && task.reminded
  const hasMeta =
    task.due || category || task.priority !== 'normal' || task.repeat !== 'none' || task.remindAt

  if (editing) {
    return <TaskEditor task={task} categories={categories} onDone={() => setEditing(false)} />
  }

  const body = (
    <>
      <div
        className={`group flex items-start gap-3 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
        onDoubleClick={compact ? undefined : () => setEditing(true)}
      >
        <span className="pt-0.5">
          <Checkbox
            checked={task.done}
            onChange={() => toggleTask(task.id)}
            label={task.done ? `Вернуть в работу: ${task.title}` : `Выполнить: ${task.title}`}
            tint={category?.color}
            size={compact ? 'sm' : 'md'}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`text-md break-words transition-colors duration-150 ${
              task.done ? 'text-fg-3 line-through' : 'text-fg'
            }`}
          >
            {task.title}
          </p>

          {hasMeta && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
              {task.due && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    late ? 'font-medium text-danger' : isToday(task.due) ? 'text-fg-2' : ''
                  }`}
                >
                  <CalendarBlankIcon size={12} />
                  {formatDue(task.due)}
                </span>
              )}

              {task.remindAt !== null && !task.done && (
                <span className="inline-flex items-center gap-1">
                  <BellIcon size={12} weight={task.reminded ? 'regular' : 'fill'} />
                  {formatDateTime(task.remindAt)}
                </span>
              )}

              {task.repeat !== 'none' && (
                <span className="inline-flex items-center gap-1">
                  <RepeatIcon size={12} />
                  {REPEAT_LABEL[task.repeat]}
                </span>
              )}

              {task.priority !== 'normal' && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    task.priority === 'high' ? 'text-danger' : ''
                  }`}
                >
                  <FlagIcon size={12} />
                  {PRIORITY_LABEL[task.priority]}
                </span>
              )}

              {category && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: category.color }}
                  />
                  {category.name}
                </span>
              )}

              {task.notes && (
                <span className="inline-flex items-center gap-1" title={task.notes}>
                  <NotePencilIcon size={12} />
                  заметка
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Always reachable: with no subtasks yet this is the way to add the first. */}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            title={
              hasSubtasks
                ? expanded
                  ? 'Свернуть подзадачи'
                  : 'Показать подзадачи'
                : 'Добавить подзадачи'
            }
            className={`focus-ring press flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-xs text-fg-2 transition-all duration-150 hover:text-fg ${
              hasSubtasks ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
            }`}
          >
            <ListChecksIcon size={12} />
            {hasSubtasks && (
              <span className="tnum">
                {doneSubtasks}/{task.subtasks.length}
              </span>
            )}
            <CaretDownIcon
              size={10}
              className="transition-transform duration-150"
              style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
            />
          </button>

          {/* Only after a reminder has already gone off: before that there is
              nothing to push back. */}
          {canSnooze && (
            <button
              type="button"
              onClick={() => snoozeTask(task.id, 10)}
              title="Напомнить снова через 10 минут"
              className="focus-ring press flex items-center gap-1 rounded-full bg-panel px-2 py-1 text-xs text-fg-2 transition-colors duration-150 hover:text-fg"
            >
              <BellIcon size={12} />
              +10 мин
            </button>
          )}

          {!compact && (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              {draggable && (
                <button
                  type="button"
                  aria-label={`Переместить задачу ${task.title}`}
                  title="Потяни, чтобы поменять порядок"
                  onPointerDown={(e) => dragControls.start(e)}
                  className="grid h-7 w-7 cursor-grab place-items-center rounded-full text-fg-2 hover:text-fg active:cursor-grabbing"
                >
                  <DotsSixVerticalIcon size={14} />
                </button>
              )}
              <RowButton label="Изменить задачу" onClick={() => setEditing(true)}>
                <PencilSimpleIcon size={14} />
              </RowButton>
              <RowButton label="Удалить задачу" danger onClick={() => deleteTask(task.id)}>
                <TrashIcon size={14} />
              </RowButton>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && <SubtaskList key="subtasks" task={task} compact={compact} />}
      </AnimatePresence>
    </>
  )

  const rowClass = 'transition-colors duration-150 hover:bg-raised'

  // Manual order needs a Reorder.Item; every other mode keeps the lighter
  // motion.li, so dragging machinery is not mounted when it cannot be used.
  if (draggable) {
    return (
      <Reorder.Item
        value={task}
        dragListener={false}
        dragControls={dragControls}
        transition={T_LAYOUT}
        className={rowClass}
      >
        {body}
      </Reorder.Item>
    )
  }

  return (
    <motion.li layout="position" layoutId={task.id} {...rowMotion} className={rowClass}>
      {body}
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
      className={`focus-ring press grid h-7 w-7 place-items-center rounded-full text-fg-2 transition-colors duration-150 ${
        danger ? 'hover:text-danger' : 'hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}

// ----------------------------------------------------------------- subtasks

function SubtaskList({ task, compact }: { task: Task; compact: boolean }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    addSubtask(task.id, draft)
    setDraft('')
  }

  return (
    <motion.div {...collapseMotion} className={`pb-3 ${compact ? 'pl-10' : 'pl-12'}`}>
      <ul className="flex flex-col">
        {task.subtasks.map((subtask) => (
          <li key={subtask.id} className="group/sub flex items-center gap-2.5 py-1">
            <Checkbox
              checked={subtask.done}
              onChange={() => toggleSubtask(task.id, subtask.id)}
              label={`Подзадача: ${subtask.title}`}
              size="sm"
            />
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                subtask.done ? 'text-fg-3 line-through' : 'text-fg-2'
              }`}
            >
              {subtask.title}
            </span>
            <button
              type="button"
              onClick={() => deleteSubtask(task.id, subtask.id)}
              aria-label={`Удалить подзадачу ${subtask.title}`}
              className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-2 opacity-0 transition-opacity duration-150 group-hover/sub:opacity-100 hover:text-danger focus-visible:opacity-100"
            >
              <TrashIcon size={12} />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center gap-2 pr-4">
        {/* The plus adds too, not just Enter: it is the thing people aim at. */}
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          aria-label="Добавить подзадачу"
          title="Добавить подзадачу"
          className="focus-ring press grid h-6 w-6 shrink-0 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-fg disabled:opacity-40"
        >
          <PlusIcon size={13} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') setDraft('')
          }}
          placeholder="Добавить подзадачу"
          aria-label="Новая подзадача"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm text-fg outline-none placeholder:text-fg-3"
        />
      </div>
    </motion.div>
  )
}

// ------------------------------------------------------------------- editor

function TaskEditor({
  task,
  categories,
  onDone,
}: {
  task: Task
  categories: Category[]
  onDone: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [due, setDue] = useState(task.due ?? '')
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [categoryId, setCategoryId] = useState(task.categoryId ?? '')
  const [repeat, setRepeat] = useState<Repeat>(task.repeat)
  const [remindAt, setRemindAt] = useState(task.remindAt ? toLocalInput(task.remindAt) : '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const save = () => {
    const trimmed = title.trim()
    if (trimmed) {
      const nextRemind = fromLocalInput(remindAt)
      updateTask(task.id, {
        title: trimmed,
        notes: notes.trim(),
        due: due || null,
        priority,
        categoryId: categoryId || null,
        repeat,
        remindAt: nextRemind,
        // A moved reminder should fire again.
        reminded: nextRemind === task.remindAt ? task.reminded : false,
      })
    }
    onDone()
  }

  return (
    /* Same layoutId as the row it replaces, so the card grows into the editor
     * instead of the list jumping. */
    <motion.li layout="position" layoutId={task.id} transition={T_LAYOUT} className="bg-raised px-4 py-4">
      <Labelled label="Задача">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onDone()
          }}
          className="field text-md w-full px-3 py-2 text-fg outline-none"
        />
      </Labelled>

      <div className="mt-3">
        <Labelled label="Заметка">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Детали, ссылки, что угодно"
            className="field scroll-y w-full resize-none px-3 py-2 text-sm text-fg-2 outline-none placeholder:text-fg-3"
          />
        </Labelled>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Labelled label="Срок">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="field w-full px-2.5 py-2 text-sm text-fg-2 outline-none"
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
            value={categoryId}
            onChange={setCategoryId}
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
        <div className="col-span-2">
          <Labelled label="Напоминание">
            <DateTimeField
              value={remindAt}
              onChange={setRemindAt}
              label="Когда напомнить"
              placeholder="Не напоминать"
            />
          </Labelled>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="focus-ring press btn-quiet px-4 py-2 text-sm"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={save}
          className="focus-ring press btn-primary px-4 py-2 text-sm"
        >
          Сохранить
        </button>
      </div>
    </motion.li>
  )
}

/**
 * A <label> would steal the click from the custom listbox, so the caption is a
 * plain block above the control.
 */
export function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-[0.08em] text-fg-3 uppercase">{label}</span>
      {children}
    </div>
  )
}

export function categoryOptions(categories: Category[]): SelectOption[] {
  return [
    { value: '', label: 'Без категории' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]
}
