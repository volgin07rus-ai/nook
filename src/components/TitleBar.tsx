import { MinusIcon, SquareIcon, XIcon } from './icons'
import { hideWindow, minimizeWindow, toggleMaximizeWindow } from '../lib/window'
import { useMaximized } from '../lib/useMaximized'
import { NookLogo } from './NookLogo'

/**
 * Title bar for the frameless main window. The strip is a Tauri drag region;
 * the controls opt out of it.
 */
export function TitleBar() {
  const maximized = useMaximized()

  return (
    <header
      data-tauri-drag-region
      className="drag-region flex h-11 shrink-0 items-center justify-between bg-canvas pr-2 pl-5"
    >
      {/* The wordmark replaces the app name: it says the same thing better. */}
      <span data-tauri-drag-region className="flex items-center text-fg-2">
        <NookLogo height={14} />
      </span>

      <div className="no-drag flex items-center">
        <WindowButton label="Свернуть" onClick={() => void minimizeWindow()}>
          <MinusIcon />
        </WindowButton>
        <WindowButton
          label={maximized ? 'Восстановить размер' : 'Развернуть на весь экран'}
          onClick={() => void toggleMaximizeWindow()}
        >
          <SquareIcon size={13} />
        </WindowButton>
        <WindowButton label="Свернуть в трей" danger onClick={() => void hideWindow()}>
          <XIcon />
        </WindowButton>
      </div>
    </header>
  )
}

function WindowButton({
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
      className={`focus-ring flex h-8 w-9 items-center justify-center rounded-full text-fg-2 transition-colors duration-150 ${
        danger ? 'hover:bg-danger hover:text-canvas' : 'hover:bg-raised hover:text-fg'
      }`}
    >
      {children}
    </button>
  )
}
