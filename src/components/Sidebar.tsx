import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, Reorder, motion, useDragControls } from 'motion/react'
import type { Category, Task } from '../types'
import { CATEGORY_PALETTE } from '../types'
import {
  addCategory,
  deleteCategory,
  reorderCategories,
  toggleCategoryPin,
  updateCategory,
} from '../lib/store'
import { matchesFilter, sameFilter, type Filter } from '../lib/filters'
import { T_FAST, T_LAYOUT } from '../lib/motion'
import { inkOn, toHexInput } from '../lib/color'
import type { View } from '../App'
import {
  CheckIcon,
  DotsSixVerticalIcon,
  PlusIcon,
  PushPinIcon,
  SquaresFourIcon,
  SunIcon,
  TrashIcon,
  TrayIcon,
  WarningCircleIcon,
  XIcon,
} from './icons'

interface SidebarProps {
  tasks: Task[]
  categories: Category[]
  filter: Filter
  onFilterChange: (filter: Filter) => void
  view: View
  onToggleWidget: () => void
  widgetVisible: boolean
}

/**
 * Боковая панель — только виды списка задач: фильтры и категории.
 * Разделы приложения переехали в нижнее меню, см. Dock.
 */
export function Sidebar({
  tasks,
  categories,
  filter,
  onFilterChange,
  view,
  onToggleWidget,
  widgetVisible,
}: SidebarProps) {
  const [adding, setAdding] = useState(false)
  const [draftName, setDraftName] = useState('')

  const onTasks = view === 'tasks'
  const count = (candidate: Filter) => tasks.filter((t) => matchesFilter(t, candidate)).length
  const isActive = (candidate: Filter) => onTasks && sameFilter(filter, candidate)

  const createCategory = () => {
    const name = draftName.trim()
    if (name) {
      addCategory(name, CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length])
    }
    setDraftName('')
    setAdding(false)
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-canvas pb-3 pl-3">
      <nav className="flex flex-col gap-1 pb-4">
        <NavItem
          icon={<TrayIcon />}
          label="Все задачи"
          count={tasks.filter((t) => !t.done).length}
          active={isActive({ kind: 'all' })}
          onClick={() => onFilterChange({ kind: 'all' })}
        />
        <NavItem
          icon={<SunIcon />}
          label="Сегодня"
          count={count({ kind: 'today' })}
          active={isActive({ kind: 'today' })}
          onClick={() => onFilterChange({ kind: 'today' })}
        />
        <NavItem
          icon={<WarningCircleIcon />}
          label="Просроченные"
          count={count({ kind: 'overdue' })}
          countTone="danger"
          active={isActive({ kind: 'overdue' })}
          onClick={() => onFilterChange({ kind: 'overdue' })}
        />
        <NavItem
          icon={<CheckIcon />}
          label="Выполненные"
          active={isActive({ kind: 'done' })}
          onClick={() => onFilterChange({ kind: 'done' })}
        />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line-soft pt-4">
        <div className="mb-2 flex items-center justify-between pr-1 pl-3">
          <h2 className="text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">Категории</h2>
          <button
            type="button"
            onClick={() => setAdding(true)}
            title="Новая категория"
            aria-label="Новая категория"
            className="focus-ring press grid h-7 w-7 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        <div className="scroll-y min-h-0 flex-1 pr-1 pb-2">
          <Reorder.Group
            axis="y"
            values={categories}
            onReorder={reorderCategories}
            className="flex flex-col gap-1"
          >
            {categories.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                count={tasks.filter((t) => t.categoryId === category.id && !t.done).length}
                active={isActive({ kind: 'category', categoryId: category.id })}
                onSelect={() => onFilterChange({ kind: 'category', categoryId: category.id })}
                onDelete={() => {
                  if (sameFilter(filter, { kind: 'category', categoryId: category.id })) {
                    onFilterChange({ kind: 'all' })
                  }
                  deleteCategory(category.id)
                }}
              />
            ))}
          </Reorder.Group>

          {adding ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={createCategory}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createCategory()
                if (e.key === 'Escape') {
                  setDraftName('')
                  setAdding(false)
                }
              }}
              placeholder="Название"
              className="field mt-1 w-full px-2 py-1.5 text-sm text-fg outline-none placeholder:text-fg-3"
            />
          ) : (
            categories.length === 0 && (
              <p className="px-2 py-1.5 text-xs leading-relaxed text-fg-3">
                Категории разносят задачи по спискам. Создай первую кнопкой сверху
              </p>
            )
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-line-soft pt-3 pr-1">
        <NavItem
          icon={<SquaresFourIcon />}
          label={widgetVisible ? 'Скрыть виджет' : 'Показать виджет'}
          active={false}
          onClick={onToggleWidget}
        />
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  count,
  countTone,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  countTone?: 'danger'
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`focus-ring press relative flex items-center gap-2.5 rounded-full px-3 py-2 text-left text-sm transition-colors duration-150 ${
        active ? 'text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg'
      }`}
    >
      {/* One shared pill for the whole sidebar: it slides to whatever is
       * selected instead of blinking on and off in two places. */}
      {active && (
        <motion.span
          layoutId="sidebar-active"
          transition={T_LAYOUT}
          className="absolute inset-0 rounded-full bg-accent-dim"
        />
      )}
      <span className={`relative ${active ? 'text-accent' : 'text-fg-2'}`}>{icon}</span>
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        /* The active row sits on accent-dim, which is darker than the canvas
         * the muted token was tuned against, so it steps up one level. */
        <span
          className={`tnum relative shrink-0 text-xs ${
            countTone === 'danger' ? 'text-danger' : active ? 'text-fg-2' : 'text-fg-3'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function CategoryRow({
  category,
  count,
  active,
  onSelect,
  onDelete,
}: {
  category: Category
  count: number
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(category.name)
  const [confirming, setConfirming] = useState(false)
  const [picking, setPicking] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  // Dragging is started from the handle only, so a plain click still selects.
  const dragControls = useDragControls()

  const commitRename = () => {
    const name = draft.trim()
    if (name) updateCategory(category.id, { name })
    else setDraft(category.name)
    setRenaming(false)
  }

  return (
    <Reorder.Item
      value={category}
      dragListener={false}
      dragControls={dragControls}
      transition={T_LAYOUT}
      className="group relative"
    >
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraft(category.name)
              setRenaming(false)
            }
          }}
          className="field w-full px-2 py-1.5 text-sm text-fg outline-none"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={() => setRenaming(true)}
            title="Двойной клик переименовывает"
            aria-current={active ? 'page' : undefined}
            className={`focus-ring press relative flex w-full items-center gap-2.5 rounded-full py-2 pr-2 pl-8 text-left text-sm transition-colors duration-150 ${
              active ? 'text-fg' : 'text-fg-2 hover:bg-raised hover:text-fg'
            }`}
          >
            {active && (
              <motion.span
                layoutId="sidebar-active"
                transition={T_LAYOUT}
                className="absolute inset-0 rounded-full bg-accent-dim"
              />
            )}
            <span className="relative min-w-0 flex-1 truncate">{category.name}</span>
            {category.pinned && (
              <PushPinIcon size={11} weight="fill" className="relative shrink-0 text-fg-3" />
            )}
            {count > 0 && (
              <span
                className={`tnum relative shrink-0 text-xs group-hover:invisible ${
                  active ? 'text-fg-2' : 'text-fg-3'
                }`}
              >
                {count}
              </span>
            )}
          </button>

          {/* Drag handle, left edge. Visible on hover so the row stays calm. */}
          <button
            type="button"
            aria-label={`Переместить категорию ${category.name}`}
            title="Потяни, чтобы поменять порядок"
            onPointerDown={(e) => dragControls.start(e)}
            className="absolute top-1/2 left-0 grid h-6 w-5 -translate-y-1/2 cursor-grab place-items-center text-fg-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 active:cursor-grabbing"
          >
            <DotsSixVerticalIcon size={13} />
          </button>

          <button
            ref={swatchRef}
            type="button"
            onClick={() => setPicking((was) => !was)}
            aria-label={`Цвет категории ${category.name}`}
            title="Сменить цвет"
            className="focus-ring absolute top-1/2 left-4 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-transform duration-150 hover:scale-125"
            style={{ background: category.color }}
          />

          <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={onDelete}
                  title="Удалить, задачи останутся"
                  aria-label={`Подтвердить удаление категории ${category.name}`}
                  className="focus-ring press grid h-6 w-6 place-items-center rounded-full text-danger"
                >
                  <CheckIcon size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  title="Отмена"
                  aria-label="Отменить удаление"
                  className="focus-ring press grid h-6 w-6 place-items-center rounded-full text-fg-2 hover:text-fg"
                >
                  <XIcon size={14} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => toggleCategoryPin(category.id)}
                  aria-pressed={category.pinned}
                  title={category.pinned ? 'Открепить' : 'Закрепить сверху'}
                  aria-label={
                    category.pinned
                      ? `Открепить категорию ${category.name}`
                      : `Закрепить категорию ${category.name}`
                  }
                  className={`focus-ring press grid h-6 w-6 place-items-center rounded-full transition-colors duration-150 ${
                    category.pinned ? 'text-accent' : 'text-fg-2 hover:text-fg'
                  }`}
                >
                  <PushPinIcon size={13} weight={category.pinned ? 'fill' : 'regular'} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  title="Удалить категорию"
                  aria-label={`Удалить категорию ${category.name}`}
                  className="focus-ring press grid h-6 w-6 place-items-center rounded-full text-fg-2 transition-colors duration-150 hover:text-danger"
                >
                  <TrashIcon size={13} />
                </button>
              </>
            )}
          </div>

          <ColorPopover
            open={picking}
            anchor={swatchRef}
            current={category.color}
            onPick={(color) => {
              updateCategory(category.id, { color })
              setPicking(false)
            }}
            onClose={() => setPicking(false)}
          />
        </>
      )}
    </Reorder.Item>
  )
}

/** Small palette anchored to the colour dot, in a portal so the scrolling
 * category list cannot clip it. */
function ColorPopover({
  open,
  anchor,
  current,
  onPick,
  onClose,
}: {
  open: boolean
  anchor: React.RefObject<HTMLButtonElement | null>
  current: string
  onPick: (color: string) => void
  onClose: () => void
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const rect = anchor.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      left: Math.min(rect.left - 8, window.innerWidth - 240),
      top: Math.min(rect.bottom + 8, window.innerHeight - 160),
    })
  }, [open, anchor])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (anchor.current?.contains(target) || popoverRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [open, anchor, onClose])

  return createPortal(
    <AnimatePresence>
      {open && position && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={T_FAST}
          style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 80 }}
          className="w-46 rounded-lg border border-line bg-panel p-2 shadow-[var(--shadow-lift)]"
        >
          <div className="grid grid-cols-4 gap-2">
            {CATEGORY_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => onPick(color)}
                aria-label={`Цвет ${color}`}
                className="focus-ring grid h-8 w-8 place-items-center rounded-full transition-transform duration-150 hover:scale-110"
                style={{ background: color }}
              >
                {color === current && (
                  <CheckIcon size={14} weight="bold" style={{ color: inkOn(color) }} />
                )}
              </button>
            ))}
          </div>

          {/* Anything outside the sixteen: the OS picker handles it. */}
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border-t border-line-soft px-1 pt-2.5 text-xs text-fg-2 hover:text-fg">
            <span
              className="h-4 w-4 shrink-0 rounded-full border border-line"
              style={{ background: current }}
            />
            Свой цвет
            <input
              type="color"
              value={toHexInput(current)}
              onChange={(e) => onPick(e.target.value)}
              aria-label="Свой цвет категории"
              className="sr-only"
            />
          </label>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
