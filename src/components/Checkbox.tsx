import { CheckIcon } from './icons'

interface CheckboxProps {
  checked: boolean
  onChange: () => void
  label: string
  /** Category colour, used to hint which list the task belongs to. */
  tint?: string
  size?: 'sm' | 'md'
}

export function Checkbox({ checked, onChange, label, tint, size = 'md' }: CheckboxProps) {
  const box = size === 'sm' ? 'h-4 w-4' : 'h-[18px] w-[18px]'

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      /* Пустой кружок выпуклый — его нажимают; отмеченный вдавлен, как кнопка,
         которую уже вдавили. Состояние читается ещё и на ощупь для глаза. */
      className={`focus-ring press ${box} ${checked ? 'sink' : 'raise'} grid shrink-0 place-items-center rounded-full border transition-[box-shadow,background-color,border-color] duration-150`}
      style={{
        borderColor: checked
          ? 'var(--color-accent)'
          : (tint ?? 'var(--color-control)'),
        background: checked ? 'var(--color-accent)' : 'transparent',
      }}
    >
      <CheckIcon
        size={size === 'sm' ? 10 : 11}
        weight="bold"
        className="transition-opacity duration-150"
        style={{
          color: 'var(--color-on-accent)',
          opacity: checked ? 1 : 0,
        }}
      />
    </button>
  )
}
