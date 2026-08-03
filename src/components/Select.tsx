import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { T_FAST } from '../lib/motion'
import { CaretDownIcon, CheckIcon } from './icons'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Accessible name, since these rarely carry a visible <label>. */
  label: string
  /** Optional leading glyph, e.g. the sort icon. */
  icon?: React.ReactNode
  /** Renders flush, without the field chrome, for use inside another field. */
  bare?: boolean
  className?: string
}

const MENU_MARGIN = 6

/**
 * A listbox that looks like the rest of the app instead of like a Windows
 * system menu. It keeps the affordances of the native control it replaces:
 * arrow keys move, Enter picks, Escape cancels, Home and End jump, and the
 * menu is announced as a listbox. The popup renders in a portal so it is never
 * clipped by the scrolling card it sits in.
 */
export function Select({
  value,
  onChange,
  options,
  label,
  icon,
  bare = false,
  className = '',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const current = options[selectedIndex]

  const place = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.max(rect.width, 168)
    const estimated = Math.min(options.length * 34 + 8, 280)
    const below = window.innerHeight - rect.bottom - MENU_MARGIN
    // Flip above when there is not enough room underneath.
    const top =
      below < estimated && rect.top > below
        ? rect.top - MENU_MARGIN - estimated
        : rect.bottom + MENU_MARGIN
    setPosition({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      top: Math.max(8, top),
      width,
    })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }

    document.addEventListener('mousedown', onPointerDown)
    // Any layout shift under an open menu invalidates its position.
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  const commit = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        setActive(selectedIndex)
        setOpen(true)
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(active)
        break
      case 'Escape':
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => {
          setActive(selectedIndex)
          setOpen((was) => !was)
        }}
        onKeyDown={onKeyDown}
        className={`focus-ring flex items-center gap-2 text-left text-sm text-fg-2 transition-colors duration-150 hover:text-fg ${
          bare ? '' : 'field px-3 py-2'
        } ${className}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{current?.label ?? ''}</span>
        <CaretDownIcon
          size={12}
          className="shrink-0 transition-transform duration-150"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && position && (
            <motion.div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={T_FAST}
              style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                width: position.width,
                zIndex: 80,
              }}
              className="scroll-y max-h-70 rounded-lg border border-line bg-panel p-1 shadow-[var(--shadow-lift)]"
            >
              {options.map((option, index) => {
                const selected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => commit(index)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-100 ${
                      index === active ? 'bg-raised text-fg' : 'text-fg-2'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selected && <CheckIcon size={13} className="shrink-0 text-accent" />}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
