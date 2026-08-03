/**
 * Windows and Android run the same bundle, so one flag decides which half of
 * the app is real.
 *
 * Read from the user agent rather than from a Tauri plugin: it is available
 * synchronously at module load, which is what the entry point needs to pick a
 * root component, and it costs no dependency. The Android webview identifies
 * itself honestly here.
 */
export const IS_ANDROID = /android/i.test(navigator.userAgent)

/**
 * `?phone=1` forces the phone layout anywhere. It exists so the phone screens
 * can be looked at and measured on a desktop, without an emulator and without
 * reinstalling on a handset for every change. Nothing reaches it by accident:
 * neither window in the Windows build carries that parameter.
 */
const forced = new URLSearchParams(window.location.search).get('phone') === '1'

/**
 * What the phone build gives up, and why:
 *
 *   the desktop widget    — nothing to pin to; Android has its own widget
 *                           system, which is native code, not a webview
 *   quick capture         — a second window over other apps
 *   the global shortcut   — no keyboard that reaches a background app
 *   the tray              — no tray
 *   autostart             — the system decides what starts
 *   the title bar         — the system draws it
 *   opening the backup folder — no file manager to hand a path to
 *
 * The commands behind those are not even registered in the Android build (see
 * src-tauri/src/lib.rs), so calling one would throw rather than fail quietly.
 * Every wrapper in lib/window.ts checks this flag first.
 */
export const IS_PHONE = IS_ANDROID || forced
