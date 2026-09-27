import { useEffect, useRef, useState } from 'react'
import { formatDateTime } from '../lib/date'
import {
  EMPTY_CONFIG,
  isConfigured,
  readConfig,
  syncNow,
  testConnection,
  writeConfig,
  type SyncConfig,
  type SyncResult,
} from '../lib/sync'
import { ArrowCounterClockwiseIcon, CheckIcon, WarningCircleIcon } from './icons'

/**
 * Настройки синхронизации.
 *
 * Токен намеренно живёт не в общих настройках приложения, а в своём файле —
 * общие уезжают в тот самый репозиторий, и ключ от хранилища оказался бы
 * внутри хранилища, да ещё и навсегда в истории коммитов. Поэтому здесь свои
 * поля и своё сохранение, а не привычный updateSettings.
 */
export function SyncSettings() {
  const [config, setConfig] = useState<SyncConfig>(EMPTY_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const dirty = useRef(false)

  useEffect(() => {
    void readConfig().then((stored) => {
      setConfig(stored)
      setLoaded(true)
    })
  }, [])

  const edit = (patch: Partial<SyncConfig>) => {
    dirty.current = true
    setConfig((current) => ({ ...current, ...patch }))
  }

  const save = async () => {
    if (!dirty.current) return
    dirty.current = false
    await writeConfig(config)
  }

  const run = async (action: () => Promise<SyncResult>) => {
    setBusy(true)
    await save()
    setResult(await action())
    setBusy(false)
  }

  if (!loaded) return null

  const ready = isConfigured(config)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-fg-3">
        Данные складываются в приватный репозиторий на GitHub, откуда их забирает
        второе устройство. Репозиторий должен быть именно приватным: публичный
        видит кто угодно.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Владелец"
          value={config.owner}
          placeholder="твой логин"
          onChange={(owner) => edit({ owner })}
          onBlur={save}
        />
        <Field
          label="Репозиторий"
          value={config.repo}
          placeholder="nook-data"
          onChange={(repo) => edit({ repo })}
          onBlur={save}
        />
      </div>

      <Field
        label="Токен доступа"
        value={config.token}
        placeholder="github_pat_..."
        secret
        onChange={(token) => edit({ token })}
        onBlur={save}
      />

      <p className="text-xs leading-relaxed text-fg-3">
        Токен берётся на github.com → Settings → Developer settings → Personal
        access tokens → Fine-grained tokens. Доступ — только к этому
        репозиторию, право Contents: Read and write. Никуда, кроме GitHub, он не
        уходит и в синхронизируемый файл не попадает.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void run(() => testConnection(config))}
          className="focus-ring press btn-quiet px-4 py-2 text-sm disabled:opacity-40"
        >
          Проверить связь
        </button>
        <button
          type="button"
          disabled={busy || !ready}
          onClick={() => void run(syncNow)}
          className="focus-ring press btn-primary flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-40"
        >
          <ArrowCounterClockwiseIcon size={14} />
          Синхронизировать
        </button>
      </div>

      {result && (
        <p
          className={`flex items-start gap-2 text-sm ${
            result.ok ? 'text-fg-2' : 'text-danger'
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {result.ok ? <CheckIcon size={14} /> : <WarningCircleIcon size={14} />}
          </span>
          {result.message}
        </p>
      )}

      {config.lastAt > 0 && (
        <p className="text-xs text-fg-3">Последний обмен: {formatDateTime(config.lastAt)}</p>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  placeholder,
  secret,
  onChange,
  onBlur,
}: {
  label: string
  value: string
  placeholder: string
  secret?: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-[0.08em] text-fg-3 uppercase">{label}</span>
      <input
        value={value}
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className="field text-md w-full px-3 py-2 text-fg outline-none placeholder:text-fg-3"
      />
    </label>
  )
}
