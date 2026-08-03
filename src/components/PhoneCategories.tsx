import { useState } from 'react'
import type { Category } from '../types'
import { CATEGORY_PALETTE } from '../types'
import { addCategory, deleteCategory, toggleCategoryPin, updateCategory } from '../lib/store'
import { toHexInput } from '../lib/color'
import { PlusIcon, PushPinIcon, TrashIcon } from './icons'

/**
 * Categories on a phone.
 *
 * The desktop manages them from the sidebar, where hover reveals the controls
 * and a drag handle sets the order. Neither works under a thumb, so this is a
 * plain list: tap the dot for the colour, the name to rename, the icons to pin
 * or delete. Order is left to the desktop — reordering is a rare, fiddly
 * action and a bad one to do by accident while scrolling.
 */
export function PhoneCategories({ categories }: { categories: Category[] }) {
  const [draft, setDraft] = useState('')

  const create = () => {
    const name = draft.trim()
    if (!name) return
    addCategory(name, CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length])
    setDraft('')
  }

  return (
    <div>
      {categories.length > 0 && (
        <ul className="mb-3 flex flex-col divide-y divide-line-soft">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      )}

      <div className="field flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={create}
          disabled={!draft.trim()}
          aria-label="Добавить категорию"
          className="focus-ring press grid h-7 w-7 shrink-0 place-items-center rounded-full text-fg-2 disabled:opacity-40"
        >
          <PlusIcon size={16} />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') create()
          }}
          placeholder="Новая категория"
          aria-label="Новая категория"
          className="text-md min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
        />
      </div>
    </div>
  )
}

function CategoryRow({ category }: { category: Category }) {
  // Local until it settles: writing on every keystroke would push a snapshot
  // onto the undo stack per letter and bury whatever was there before.
  const [name, setName] = useState(category.name)

  const commit = () => {
    const next = name.trim()
    if (next && next !== category.name) updateCategory(category.id, { name: next })
    else if (!next) setName(category.name)
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <label
        className="focus-within:ring-accent grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full"
        style={{ background: category.color }}
      >
        <input
          type="color"
          value={toHexInput(category.color)}
          onChange={(e) => updateCategory(category.id, { color: e.target.value })}
          aria-label={`Цвет категории ${category.name}`}
          className="sr-only"
        />
      </label>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
        aria-label={`Название категории ${category.name}`}
        className="text-md min-w-0 flex-1 bg-transparent text-fg outline-none"
      />

      <button
        type="button"
        onClick={() => toggleCategoryPin(category.id)}
        aria-pressed={category.pinned}
        aria-label={
          category.pinned
            ? `Открепить категорию ${category.name}`
            : `Закрепить категорию ${category.name}`
        }
        className={`focus-ring press grid h-9 w-9 shrink-0 place-items-center rounded-full ${
          category.pinned ? 'text-accent' : 'text-fg-3'
        }`}
      >
        <PushPinIcon size={16} weight={category.pinned ? 'fill' : 'regular'} />
      </button>

      <button
        type="button"
        onClick={() => deleteCategory(category.id)}
        aria-label={`Удалить категорию ${category.name}`}
        className="focus-ring press grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-3"
      >
        <TrashIcon size={16} />
      </button>
    </li>
  )
}
