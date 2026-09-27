import { useEffect, useId, useState } from 'react'
import { motion } from 'motion/react'
import type {
  AccentPreset,
  AppData,
  FontKey,
  ThemeKey,
  WidgetMode,
  WidgetTheme,
} from '../types'
import { T_LAYOUT } from '../lib/motion'
import { ACCENTS, normalize } from '../types'
import { Select } from './Select'
import { SyncSettings } from './SyncSettings'
import { Labelled } from './TaskItem'
import { clearCompleted, replaceAll, updateSettings } from '../lib/store'
import { accentSwatch } from '../lib/useAccent'
import {
  getAutostart,
  openBackups,
  setAutostart,
  setQuickShortcut,
  setWidgetLayer,
  showWidget,
  testNotification,
} from '../lib/window'
import { isTauri } from '../lib/persistence'
import { IS_PHONE } from '../lib/platform'
import { PhoneCategories } from './PhoneCategories'
import { MonitorIcon, MoonIcon, PushPinIcon, SunIcon } from './icons'

interface SettingsViewProps {
  data: AppData
}

/**
 * Settings render inline in the content area rather than in a modal: a dialog
 * would be the lazy first thought for something the user may want to keep open
 * while the widget changes behind it.
 */
export function SettingsView({ data }: SettingsViewProps) {
  const [autostart, setAutostartState] = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const {
    theme,
    accent,
    accentCustom,
    font,
    quickShortcut,
    widgetTheme,
    widgetFilter,
    widgetMode,
    widgetOpacity,
    widgetOnLaunch,
    showCompleted,
  } = data.settings

  const widgetScopes = [
    { value: 'all', label: 'Все задачи' },
    { value: 'today', label: 'Сегодня' },
    { value: 'overdue', label: 'Просроченные' },
    ...data.categories.map((c) => ({ value: `cat:${c.id}`, label: c.name })),
  ]

  useEffect(() => {
    void getAutostart().then(setAutostartState)
  }, [])

  const toggleAutostart = async () => {
    const next = !autostart
    setAutostartState(next)
    await setAutostart(next)
  }

  const changeWidgetMode = async (mode: WidgetMode) => {
    updateSettings({ widgetMode: mode })
    await setWidgetLayer(mode === 'desktop')
    await showWidget()
  }

  const runNotificationTest = async () => {
    const ok = await testNotification()
    const system = IS_PHONE ? 'Android' : 'Windows'
    setNotifyResult(
      ok
        ? `Отправлено. Если ничего не появилось, проверь уведомления для Nook в настройках ${system}`
        : `${system} не разрешил уведомления для Nook`,
    )
  }

  const doneCount = data.tasks.filter((t) => t.done).length

  const applyImport = () => {
    try {
      replaceAll(normalize(JSON.parse(importText)))
      setImportError(null)
      setImportText('')
    } catch {
      setImportError('Не удалось прочитать JSON. Проверь, что текст скопирован целиком')
    }
  }

  return (
    <div className={`scroll-y min-h-0 flex-1 ${IS_PHONE ? 'px-4 pt-3 pb-4' : 'pr-4 pb-4 pl-1'}`}>
      <div className={`card mx-auto max-w-2xl ${IS_PHONE ? 'px-5 py-5' : 'px-7 py-6'}`}>
        <h1 className="text-xl font-semibold text-fg">Настройки</h1>

        {/* The sidebar manages categories on the desktop; the phone has no
            sidebar, so they live here instead of being desktop-only. */}
        {IS_PHONE && (
          <Section title="Категории">
            <PhoneCategories categories={data.categories} />
          </Section>
        )}

        <Section title="Тема">
          <Segmented
            value={theme}
            options={[
              { value: 'dark' as ThemeKey, label: 'Тёмная', icon: <MoonIcon size={14} /> },
              { value: 'light' as ThemeKey, label: 'Светлая', icon: <SunIcon size={14} /> },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
        </Section>

        <Section title="Акцент">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACCENTS) as AccentPreset[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => updateSettings({ accent: key })}
                aria-pressed={accent === key}
                className={`focus-ring press flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ${
                  accent === key
                    ? 'border-accent text-fg'
                    : 'border-line text-fg-2 hover:border-fg-3 hover:text-fg'
                }`}
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: accentSwatch(key, accentCustom, theme) }}
                />
                {ACCENTS[key].label}
              </button>
            ))}

            {/* Native picker: the OS dialog is better than anything worth
                building here, and it costs nothing to ship. */}
            <label
              className={`focus-within:ring-accent flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 ${
                accent === 'custom'
                  ? 'border-accent text-fg'
                  : 'border-line text-fg-2 hover:border-fg-3 hover:text-fg'
              }`}
            >
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: accentSwatch('custom', accentCustom, theme) }}
              />
              Свой
              <input
                type="color"
                value={accentCustom}
                onChange={(e) => updateSettings({ accent: 'custom', accentCustom: e.target.value })}
                aria-label="Свой цвет акцента"
                className="sr-only"
              />
            </label>
          </div>
        </Section>

        <Section title="Шрифт">
          <Segmented
            value={font}
            options={[
              { value: 'system' as FontKey, label: 'Системный' },
              { value: 'mono' as FontKey, label: 'Cascadia Mono' },
            ]}
            onChange={(v) => updateSettings({ font: v })}
          />
        </Section>

        {!IS_PHONE && (
          <Section title="Быстрая запись">
            <ShortcutField
              value={quickShortcut}
              onChange={(next) => updateSettings({ quickShortcut: next })}
            />
          </Section>
        )}

        {!IS_PHONE && (
        <Section title="Виджет">
          <Segmented
            value={widgetTheme}
            options={[
              { value: 'app' as WidgetTheme, label: 'Как в приложении' },
              { value: 'dark' as WidgetTheme, label: 'Тёмный', icon: <MoonIcon size={14} /> },
              { value: 'light' as WidgetTheme, label: 'Светлый', icon: <SunIcon size={14} /> },
            ]}
            onChange={(v) => updateSettings({ widgetTheme: v })}
          />
          <div className="mt-3" />
          <Segmented
            value={widgetMode}
            options={[
              {
                value: 'desktop' as WidgetMode,
                label: 'На рабочем столе',
                icon: <MonitorIcon size={14} />,
              },
              {
                value: 'floating' as WidgetMode,
                label: 'Поверх окон',
                icon: <PushPinIcon size={14} />,
              },
            ]}
            onChange={(v) => void changeWidgetMode(v)}
          />
          <div className="mt-5 max-w-xs">
            <Labelled label="Что показывать">
              <Select
                label="Что показывать в виджете"
                value={widgetFilter}
                onChange={(v) => updateSettings({ widgetFilter: v })}
                options={widgetScopes}
              />
            </Labelled>
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <span className="text-sm text-fg-2">Плотность фона</span>
            <span className="tnum text-sm text-fg-3">{Math.round(widgetOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(widgetOpacity * 100)}
            onChange={(e) => updateSettings({ widgetOpacity: Number(e.target.value) / 100 })}
            className="mt-1.5 w-full accent-[var(--color-accent)]"
            aria-label="Плотность фона виджета"
          />
          <div className="mt-5">
            <Toggle
              label="Открывать виджет при запуске"
              checked={widgetOnLaunch}
              onChange={() => updateSettings({ widgetOnLaunch: !widgetOnLaunch })}
            />
          </div>
        </Section>
        )}

        {/* На телефоне виджет системный: тему и слой задаёт Android, а из
            настроек приложения он читает только прозрачность. */}
        {IS_PHONE && (
          <Section title="Виджет">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-fg-2">Плотность фона</span>
              <span className="tnum text-sm text-fg-3">{Math.round(widgetOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(widgetOpacity * 100)}
              onChange={(e) => updateSettings({ widgetOpacity: Number(e.target.value) / 100 })}
              className="mt-1.5 w-full accent-[var(--color-accent)]"
              aria-label="Плотность фона виджета"
            />
            <p className="mt-2 text-xs leading-relaxed text-fg-3">
              Виджет обновится, когда выйдешь из приложения
            </p>
          </Section>
        )}

        <Section title="Напоминания">
          <button
            type="button"
            onClick={() => void runNotificationTest()}
            disabled={!isTauri()}
            className="focus-ring press btn-quiet px-4 py-2 text-sm disabled:opacity-40"
          >
            Проверить уведомление
          </button>
          {/* Feedback, not a description: this one stays. */}
          {notifyResult && <p className="mt-2 text-xs leading-relaxed text-fg-3">{notifyResult}</p>}
        </Section>

        <Section title="Поведение">
          <div className="flex flex-col gap-4">
            <Toggle
              label="Показывать выполненные в общем списке"
              checked={showCompleted}
              onChange={() => updateSettings({ showCompleted: !showCompleted })}
            />
            {isTauri() && !IS_PHONE && (
              <Toggle
                label="Запускать при входе в Windows"
                checked={autostart}
                onChange={() => void toggleAutostart()}
              />
            )}
          </div>
        </Section>

        <Section title="Выполненные задачи">
          <button
            type="button"
            onClick={clearCompleted}
            disabled={doneCount === 0}
            className="focus-ring press btn-quiet px-4 py-2 text-sm hover:text-danger disabled:opacity-40"
          >
            Удалить выполненные ({doneCount})
          </button>
        </Section>

        {/* Android has no file manager to hand a path to, and the app's own
            folder is not reachable from one anyway. */}
        {!IS_PHONE && (
          <Section title="Резервные копии">
            <button
              type="button"
              onClick={() => void openBackups()}
              disabled={!isTauri()}
              className="focus-ring press btn-quiet px-4 py-2 text-sm disabled:opacity-40"
            >
              Открыть папку с копиями
            </button>
          </Section>
        )}

        <Section title="Синхронизация">
          <SyncSettings />
        </Section>

        <Section title="Перенос вручную">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-2">Скопируй этот текст, чтобы сохранить копию</span>
            <textarea
              readOnly
              value={JSON.stringify(data)}
              onFocus={(e) => e.currentTarget.select()}
              rows={3}
              className="field scroll-y w-full resize-none px-3 py-2 font-mono text-xs text-fg-3 outline-none"
            />
          </label>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-sm text-fg-2">Вставь копию, чтобы восстановить</span>
            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value)
                setImportError(null)
              }}
              rows={3}
              placeholder='{"version":2,...}'
              className="field scroll-y w-full resize-none px-3 py-2 font-mono text-xs text-fg-2 outline-none placeholder:text-fg-3"
            />
          </label>
          {importError && <p className="mt-1.5 text-sm text-danger">{importError}</p>}
          <button
            type="button"
            onClick={applyImport}
            disabled={!importText.trim()}
            className="focus-ring press btn-primary mt-3 px-4 py-2 text-sm"
          >
            Восстановить
          </button>

          {isTauri() && !IS_PHONE && (
            <p className="mt-4 text-xs leading-relaxed text-fg-3">
              Файл с данными:{' '}
              <code className="font-mono">%APPDATA%\com.volgin.nook\nook.json</code>
            </p>
          )}

          {/* The one thing a phone user has to be told, because it is the only
              way data crosses between the two copies. */}
          {IS_PHONE && (
            <p className="mt-4 text-xs leading-relaxed text-fg-3">
              Версия на телефоне и версия на компьютере не связаны. Список у каждой свой, и
              перенести его можно только этими двумя полями
            </p>
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-line-soft pt-5">
      <h2 className="mb-3 text-xs font-medium tracking-[0.09em] text-fg-3 uppercase">{title}</h2>
      {children}
    </section>
  )
}

/**
 * Builds a Tauri accelerator from a real key press. A bare letter is rejected
 * on purpose: a global shortcut without a modifier would swallow that key in
 * every other program on the machine.
 */
function toAccelerator(event: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Super')
  if (mods.length === 0) return null

  const code = event.code
  let key: string | null = null
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^F([1-9]|1[0-2])$/.test(code)) key = code
  else if (code === 'Space') key = 'Space'

  return key ? [...mods, key].join('+') : null
}

function ShortcutField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const capture = async (event: React.KeyboardEvent) => {
    event.preventDefault()
    if (event.key === 'Escape') {
      setCapturing(false)
      return
    }

    const accelerator = toAccelerator(event)
    if (!accelerator) return

    // Bind it before storing it: the combination may belong to another program,
    // and a setting that does not work is worse than no change at all.
    const failed = await setQuickShortcut(accelerator)
    if (failed) {
      setError('Это сочетание занято другой программой. Попробуй другое')
      return
    }
    setError(null)
    setCapturing(false)
    onChange(accelerator)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setCapturing(true)
        }}
        onKeyDown={capturing ? (e) => void capture(e) : undefined}
        onBlur={() => setCapturing(false)}
        className={`focus-ring press rounded-full border px-4 py-2 font-mono text-sm transition-colors duration-150 ${
          capturing
            ? 'border-accent text-fg-3'
            : 'border-line text-fg hover:border-fg-3'
        }`}
      >
        {capturing ? 'Нажми сочетание…' : value}
      </button>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>
  onChange: (value: T) => void
}) {
  // Unique per instance so the theme and widget switches do not share a pill.
  const groupId = useId()

  return (
    <div className="inline-flex gap-1 rounded-full bg-panel p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`focus-ring press relative flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors duration-150 ${
              active ? 'text-on-accent' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`segment-${groupId}`}
                transition={T_LAYOUT}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <span className="relative flex items-center gap-2">
              {option.icon}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="focus-ring flex items-start gap-3 rounded-lg text-left"
    >
      <span className="min-w-0 flex-1 text-sm text-fg">{label}</span>
      <span
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150"
        style={{ background: checked ? 'var(--color-accent)' : 'var(--color-line)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full transition-[left] duration-150 ease-[var(--ease-out-quart)]"
          style={{
            left: checked ? 18 : 2,
            background: checked ? 'var(--color-on-accent)' : 'var(--color-fg-3)',
          }}
        />
      </span>
    </button>
  )
}
