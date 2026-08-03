import { useEffect, useState } from 'react'
import { isTauri } from './persistence'
import { isMaximized } from './window'

/**
 * Tracks whether the window is maximized. A frameless window keeps its rounded
 * corners when maximized, which leaves the desktop showing through at the
 * screen corners, so the shell squares itself off in that state.
 */
export function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    const sync = async () => setMaximized(await isMaximized())
    void sync()

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const stop = await getCurrentWindow().onResized(() => void sync())
      if (cancelled) stop()
      else unlisten = stop
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  return maximized
}
