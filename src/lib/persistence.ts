import type { AppData } from '../types'
import { normalize } from '../types'

const FILE = 'nook.json'
const KEY = 'data'
const WEB_KEY = 'nook:data'
const CHANGE_EVENT = 'nook://data-changed'

/** True inside the Tauri webview, false when previewing in a plain browser. */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface Backend {
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
  /** Notifies when the *other* window changed the data. Returns an unsubscribe. */
  watch(onChange: (data: AppData) => void): Promise<() => void>
}

interface ChangePayload {
  /** Window label of the sender, so it can ignore its own broadcast. */
  source: string
  data: AppData
}

/** Persists to a JSON file in the app data dir and syncs both windows via events. */
function tauriBackend(): Backend {
  // Lazily imported so the browser preview never touches Tauri modules.
  const store = import('@tauri-apps/plugin-store').then((m) => m.load(FILE, { autoSave: false }))
  const events = () => import('@tauri-apps/api/event')
  const label = () =>
    import('@tauri-apps/api/window').then((m) => m.getCurrentWindow().label)

  return {
    async load() {
      const s = await store
      return normalize(await s.get(KEY))
    },
    async save(data) {
      const s = await store
      await s.set(KEY, data)
      await s.save()
      const [{ emit }, source] = await Promise.all([events(), label()])
      await emit(CHANGE_EVENT, { source, data } satisfies ChangePayload)
    },
    async watch(onChange) {
      const [{ listen }, self] = await Promise.all([events(), label()])
      // `emit` broadcasts to every webview including this one — drop the echo.
      return listen<ChangePayload>(CHANGE_EVENT, (event) => {
        if (event.payload?.source === self) return
        onChange(normalize(event.payload?.data))
      })
    },
  }
}

/** Browser fallback used by `npm run dev` previews. */
function webBackend(): Backend {
  return {
    async load() {
      try {
        const raw = localStorage.getItem(WEB_KEY)
        return normalize(raw ? JSON.parse(raw) : null)
      } catch {
        return normalize(null)
      }
    },
    async save(data) {
      localStorage.setItem(WEB_KEY, JSON.stringify(data))
    },
    async watch(onChange) {
      const handler = (event: StorageEvent) => {
        if (event.key !== WEB_KEY || !event.newValue) return
        try {
          onChange(normalize(JSON.parse(event.newValue)))
        } catch {
          /* ignore malformed payloads from another tab */
        }
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}

export const backend: Backend = isTauri() ? tauriBackend() : webBackend()
