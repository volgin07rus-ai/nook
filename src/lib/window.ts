import { isTauri } from './persistence'
import { IS_PHONE } from './platform'

/**
 * Thin wrappers around the Tauri window API. Every call is a no-op in the
 * browser preview so the same components render in both environments.
 */

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow()
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

/**
 * For commands the Android build never registers. Calling one there would throw
 * "command not found", so the guard belongs here rather than in a try/catch at
 * every call site.
 */
async function invokeDesktop<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (IS_PHONE) return null
  return invoke<T>(command, args)
}

/** The phone has no window to manage: the system owns the frame. */
const noWindowControls = () => !isTauri() || IS_PHONE

export async function minimizeWindow() {
  if (noWindowControls()) return
  await (await currentWindow()).minimize()
}

export async function toggleMaximizeWindow() {
  if (noWindowControls()) return
  await (await currentWindow()).toggleMaximize()
}

/** Hides the window: the app stays alive in the tray so the widget keeps running. */
export async function hideWindow() {
  if (noWindowControls()) return
  await (await currentWindow()).hide()
}

export async function isMaximized(): Promise<boolean> {
  if (noWindowControls()) return false
  return (await currentWindow()).isMaximized()
}

export async function startDragging() {
  if (noWindowControls()) return
  await (await currentWindow()).startDragging()
}

export const toggleQuick = () => invokeDesktop<void>('toggle_quick')
export const hideQuick = () => invokeDesktop<void>('hide_quick')

/**
 * Rebinds the global shortcut. Returns an error message rather than throwing:
 * the combination may already belong to another program, and that is something
 * to show in settings, not a crash.
 */
export async function setQuickShortcut(accelerator: string): Promise<string | null> {
  if (!isTauri() || IS_PHONE) return null
  try {
    await invoke<void>('set_quick_shortcut', { accelerator })
    return null
  } catch (error) {
    return String(error)
  }
}

/** Dated copy of the store, keeping the newest few. Label is 'YYYY-MM-DD'. */
export const makeBackup = (label: string) => invoke<string | null>('make_backup', { label })
export const openBackups = () => invokeDesktop<void>('open_backups')

export const toggleWidget = () => invokeDesktop<boolean>('toggle_widget')
export const isWidgetVisible = () => invokeDesktop<boolean>('is_widget_visible')
export const showWidget = () => invokeDesktop<void>('show_widget')
export const showMainWindow = () => invokeDesktop<void>('show_main')

/** desktop: pinned to the bottom layer. floating: above every other window. */
export const setWidgetLayer = (desktop: boolean) =>
  invokeDesktop<void>('set_widget_layer', { desktop })


export interface ReminderPayload {
  id: string
  title: string
  at: number
}

export const publishReminders = (reminders: ReminderPayload[]) =>
  invoke<void>('set_reminders', { reminders })

// --------------------------------------------------------------- notifications

/** Sends one notification now, so the user can confirm Windows lets them through. */
export async function testNotification(): Promise<boolean> {
  if (!isTauri()) return false
  const { isPermissionGranted, requestPermission, sendNotification } = await import(
    '@tauri-apps/plugin-notification'
  )
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return false
  sendNotification({ title: 'Nook', body: 'Напоминания работают' })
  return true
}

// ------------------------------------------------------------------ autostart

export async function getAutostart(): Promise<boolean> {
  if (!isTauri() || IS_PHONE) return false
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri() || IS_PHONE) return
  const { enable, disable } = await import('@tauri-apps/plugin-autostart')
  await (on ? enable() : disable())
}
