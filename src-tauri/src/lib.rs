use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
// Only the desktop posts notifications from Rust; on Android that is Android's job.
#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WebviewWindow, WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/*
 * Windows and Android share the task logic and nothing else. Everything that
 * needs a window manager — the tray, the desktop widget, quick capture, the
 * global shortcut — is behind #[cfg(desktop)], because on Android there is no
 * second window to show and no key combination that reaches a background app.
 * What stays shared: the store, the dated backups and the reminder loop.
 */

const REMINDER_FIRED: &str = "nook://reminder-fired";
#[cfg(desktop)]
const QUICK_OPENED: &str = "nook://quick-opened";
const STORE_FILE: &str = "nook.json";
/// How many dated copies of the store to keep before the oldest is dropped.
const BACKUP_COPIES: usize = 7;
#[cfg(desktop)]
pub const DEFAULT_QUICK_SHORTCUT: &str = "Ctrl+Alt+N";

/*
 * Widget backdrop: plain window transparency, no blur.
 *
 * Windows gives a third-party window no way to keep a live blur once it loses
 * focus. Acrylic is switched off for inactive windows, and the legacy
 * blur-behind stopped blurring on Windows 11 entirely, flooding the window
 * with flat grey instead. In desktop mode the widget is almost never the
 * active window, so either effect would be off exactly when it matters.
 *
 * Transparency alone has none of that behaviour: the wallpaper shows through
 * unblurred, identically whether the widget has focus or not, and how much
 * shows is the opacity slider in settings.
 */

#[cfg(desktop)]
fn show_and_focus(window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ------------------------------------------------------------------ reminders

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Reminder {
    pub id: String,
    pub title: String,
    /// Fire time, ms since epoch.
    pub at: i64,
}

#[derive(Default)]
struct Reminders(Mutex<Vec<Reminder>>);

/// The frontend owns the task list and re-publishes the pending reminders on
/// every change. Scheduling lives here rather than in a webview timer because
/// Windows throttles timers in hidden windows, which is exactly when a
/// reminder matters most.
///
/// On Android this queue no longer delivers anything: the system freezes a
/// backgrounded app within seconds, so a loop in this process could only fire
/// while the app was already open. There the alarms are handed to Android's own
/// scheduler (NookAlarms.kt), which wakes the app up on time even from cold.
/// The loop still runs on the phone, but only to mark what is already past as
/// delivered, so the task list agrees with what the notification shade showed.
#[tauri::command]
fn set_reminders(state: tauri::State<'_, Reminders>, reminders: Vec<Reminder>) {
    if let Ok(mut pending) = state.0.lock() {
        *pending = reminders;
    }
}

fn spawn_reminder_loop(app: tauri::AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(20));

        let due: Vec<Reminder> = {
            let state = app.state::<Reminders>();
            let Ok(mut pending) = state.0.lock() else { continue };
            let now = now_ms();
            // Fire anything already due and drop it from the queue in one pass.
            let (due, rest): (Vec<_>, Vec<_>) = pending.drain(..).partition(|r| r.at <= now);
            *pending = rest;
            due
        };

        for reminder in due {
            // Only the desktop shows it from here. On Android the system alarm
            // has already put it in the shade, and showing a second copy from
            // this loop would double every reminder the moment the app opened.
            #[cfg(desktop)]
            {
                let shown = app
                    .notification()
                    .builder()
                    .title("Напоминание")
                    .body(&reminder.title)
                    .show();
                if let Err(err) = shown {
                    log::warn!("не удалось показать уведомление: {err}");
                }
            }
            // Let the frontend mark it as delivered so it never repeats.
            let _ = app.emit(REMINDER_FIRED, reminder.id.clone());
        }
    });
}

// -------------------------------------------------------------------- windows

#[cfg(desktop)]
#[tauri::command]
fn toggle_widget(app: tauri::AppHandle) -> Result<bool, String> {
    let widget = app
        .get_webview_window("widget")
        .ok_or_else(|| "окно виджета не найдено".to_string())?;

    if widget.is_visible().map_err(|e| e.to_string())? {
        widget.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        show_and_focus(&widget);
        Ok(true)
    }
}

#[cfg(desktop)]
#[tauri::command]
fn is_widget_visible(app: tauri::AppHandle) -> Result<bool, String> {
    match app.get_webview_window("widget") {
        Some(widget) => widget.is_visible().map_err(|e| e.to_string()),
        None => Ok(false),
    }
}

#[cfg(desktop)]
#[tauri::command]
fn show_main(app: tauri::AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "главное окно не найдено".to_string())?;
    show_and_focus(&main);
    Ok(())
}

/// `desktop` pins the widget to the bottom layer so it lives on the desktop and
/// other windows pass over it. Otherwise it floats above everything.
#[cfg(desktop)]
#[tauri::command]
fn set_widget_layer(app: tauri::AppHandle, desktop: bool) -> Result<(), String> {
    let Some(widget) = app.get_webview_window("widget") else {
        return Ok(());
    };
    if desktop {
        widget.set_always_on_top(false).map_err(|e| e.to_string())?;
        widget.set_always_on_bottom(true).map_err(|e| e.to_string())?;
    } else {
        widget.set_always_on_bottom(false).map_err(|e| e.to_string())?;
        widget.set_always_on_top(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn show_widget(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(widget) = app.get_webview_window("widget") {
        let _ = widget.show();
    }
    Ok(())
}

// ------------------------------------------------------ настройки синхрона

/// Адрес репозитория и токен доступа.
///
/// Лежит в своём файле, а не в nook.json, и это принципиально: nook.json
/// уезжает в тот самый репозиторий. Токен внутри него означал бы, что ключ
/// от хранилища лежит в самом хранилище — и остаётся там в истории коммитов
/// навсегда, даже если потом его убрать.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SyncConfig {
    pub owner: String,
    pub repo: String,
    pub token: String,
    /// Отпечаток последней разобранной версии — по нему видно, менялось ли
    /// удалённое с прошлого раза.
    pub last_sha: String,
    pub last_at: i64,
}

const SYNC_FILE: &str = "sync.json";

fn sync_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(SYNC_FILE))
}

#[tauri::command]
fn read_sync_config(app: tauri::AppHandle) -> Result<SyncConfig, String> {
    let path = sync_path(&app)?;
    if !path.exists() {
        return Ok(SyncConfig::default());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_sync_config(app: tauri::AppHandle, config: SyncConfig) -> Result<(), String> {
    let path = sync_path(&app)?;
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

// -------------------------------------------------------------- картинки

/// Куда складываются картинки записок.
///
/// Отдельными файлами, а не внутри nook.json: фотография весит сотни
/// килобайт, а хранилище переписывается целиком на каждую правку текста.
/// Пара снимков в заметке — и каждое нажатие клавиши переписывало бы
/// мегабайты. Плюс в самом json остаётся только имя файла, и он остаётся
/// читаемым и переносимым.
fn images_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Имя файла картинки. Только то, что выдаёт save_image: без точек, слешей
/// и прочего, чем можно было бы выйти из папки.
fn safe_image_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && !name.contains("..")
}

/// Сохраняет картинку и возвращает её имя. Уменьшение и сжатие делает
/// фронтенд: там уже есть canvas, а тащить сюда декодер jpeg ради этого
/// значило бы удвоить размер приложения.
#[tauri::command]
fn save_image(app: tauri::AppHandle, bytes: Vec<u8>, ext: String) -> Result<String, String> {
    let ext = match ext.as_str() {
        "jpg" | "jpeg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        other => return Err(format!("неподдерживаемый формат: {other}")),
    };
    if bytes.is_empty() {
        return Err("пустой файл".into());
    }

    let name = format!("{}-{}.{ext}", now_ms(), std::process::id());
    let path = images_dir(&app)?.join(&name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(name)
}

/// Кладёт картинку под уже известным именем.
///
/// Нужна синхронизации: имя файла записано внутри записки, и приехавшая с
/// другого устройства картинка обязана лечь именно под ним, иначе ссылка в
/// тексте укажет в пустоту.
#[tauri::command]
fn save_image_as(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    if !safe_image_name(&name) {
        return Err("недопустимое имя файла".into());
    }
    if bytes.is_empty() {
        return Err("пустой файл".into());
    }
    let path = images_dir(&app)?.join(&name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Полный путь к картинке — фронтенд превращает его в ссылку для вебвью.
#[tauri::command]
fn image_path(app: tauri::AppHandle, name: String) -> Result<String, String> {
    if !safe_image_name(&name) {
        return Err("недопустимое имя файла".into());
    }
    let path = images_dir(&app)?.join(&name);
    Ok(path.to_string_lossy().into_owned())
}

/// Удаляет картинки, на которые больше никто не ссылается.
///
/// Зовётся приложением со списком имён, которые встречаются в записках.
/// Держать счётчик ссылок было бы точнее и куда хрупче: любая потерянная
/// правка рассинхронизировала бы его навсегда, а здесь источник правды —
/// сами записки.
#[tauri::command]
fn prune_images(app: tauri::AppHandle, keep: Vec<String>) -> Result<usize, String> {
    let dir = images_dir(&app)?;
    let keep: std::collections::HashSet<&str> = keep.iter().map(|s| s.as_str()).collect();

    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(0) };
    let mut removed = 0usize;
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else { continue };
        if keep.contains(name.as_str()) {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

// -------------------------------------------------------------- quick capture

/// Toggles the quick capture window. Pressing the shortcut while it is already
/// up closes it, so the same key gets you both in and out.
#[cfg(desktop)]
#[tauri::command]
fn toggle_quick(app: tauri::AppHandle) -> Result<(), String> {
    let quick = app
        .get_webview_window("quick")
        .ok_or_else(|| "окно быстрой записи не найдено".to_string())?;

    if quick.is_visible().unwrap_or(false) {
        let _ = quick.hide();
    } else {
        let _ = quick.center();
        show_and_focus(&quick);
        let _ = app.emit(QUICK_OPENED, ());
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn hide_quick(app: tauri::AppHandle) {
    if let Some(quick) = app.get_webview_window("quick") {
        let _ = quick.hide();
    }
}

/// Rebinds the global shortcut. Returns an error the frontend can show if the
/// combination is malformed or already taken by another program.
#[cfg(desktop)]
#[tauri::command]
fn set_quick_shortcut(app: tauri::AppHandle, accelerator: String) -> Result<(), String> {
    let manager = app.global_shortcut();
    let _ = manager.unregister_all();

    manager
        .on_shortcut(accelerator.as_str(), |app, _shortcut, event| {
            // Fire on press only, or the key would toggle twice per stroke.
            if event.state() == ShortcutState::Pressed {
                let _ = toggle_quick(app.clone());
            }
        })
        .map_err(|err| format!("не удалось назначить сочетание: {err}"))
}

// ------------------------------------------------------------------- backups

/// Copies the store next to itself under a dated name and keeps the newest few.
///
/// The app holds the only copy of the data, so this runs on every launch: a
/// single bad write should not be able to take everything with it. The label
/// comes from the frontend because it already has the local date, and date
/// arithmetic in Rust would need a dependency for no gain.
#[tauri::command]
fn make_backup(app: tauri::AppHandle, label: String) -> Result<Option<String>, String> {
    if !label.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("недопустимое имя копии".into());
    }

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let source = dir.join(STORE_FILE);
    if !source.exists() {
        return Ok(None);
    }

    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;

    let target = backups.join(format!("nook-{label}.json"));
    // One copy per day is plenty; rewriting today's keeps it current.
    std::fs::copy(&source, &target).map_err(|e| e.to_string())?;

    prune_backups(&backups);
    Ok(Some(target.to_string_lossy().into_owned()))
}

fn prune_backups(dir: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<_> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("nook-") && n.ends_with(".json"))
        })
        .collect();

    // Dated names sort chronologically, so the oldest are simply the first.
    files.sort();
    let keep = BACKUP_COPIES.min(files.len());
    for stale in &files[..files.len() - keep] {
        let _ = std::fs::remove_file(stale);
    }
}

#[cfg(desktop)]
#[tauri::command]
fn open_backups(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/**
 * The app was called Aurora before, under a different identifier, so its data
 * lived in a different folder. Carry it over once, on first run of the renamed
 * build, rather than silently starting empty.
 */
#[cfg(desktop)]
fn migrate_legacy_store(app: &tauri::AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let target = dir.join(STORE_FILE);
    if target.exists() {
        return;
    }

    let Some(parent) = dir.parent() else { return };
    let legacy = parent.join("com.volgin.aurora").join("aurora.json");
    if !legacy.exists() {
        return;
    }

    if let Err(err) = std::fs::create_dir_all(&dir) {
        log::warn!("не удалось создать папку данных: {err}");
        return;
    }
    match std::fs::copy(&legacy, &target) {
        Ok(_) => log::info!("данные перенесены из старой папки Aurora"),
        Err(err) => log::warn!("не удалось перенести старые данные: {err}"),
    }
}

#[cfg(desktop)]
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Открыть Nook", true, None::<&str>)?;
    let widget_item =
        MenuItem::with_id(app, "widget", "Показать или скрыть виджет", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &widget_item, &quit_item])?;

    TrayIconBuilder::with_id("aurora-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Nook")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(main) = app.get_webview_window("main") {
                    show_and_focus(&main);
                }
            }
            "widget" => {
                let _ = toggle_widget(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(main) = tray.app_handle().get_webview_window("main") {
                    show_and_focus(&main);
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(Reminders::default())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init());

    // Everything below needs a window manager, a tray or a keyboard that stays
    // live behind other apps. None of that exists on a phone.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            toggle_widget,
            is_widget_visible,
            show_widget,
            show_main,
            set_widget_layer,
            set_reminders,
            toggle_quick,
            hide_quick,
            set_quick_shortcut,
            make_backup,
            open_backups,
            save_image,
            save_image_as,
            image_path,
            prune_images,
            read_sync_config,
            write_sync_config
        ])
        .on_window_event(|window, event| match event {
            // Closing never quits: the main window hides to the tray so the
            // desktop widget keeps running. Quit from the tray menu.
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            // Quick capture is a spotlight, not a window you manage: clicking
            // anywhere else dismisses it.
            WindowEvent::Focused(false) if window.label() == "quick" => {
                let _ = window.hide();
            }
            _ => {}
        });

    // The phone build keeps only what a single screen can use. A command that
    // is not registered here is one the frontend must never call, which is why
    // the Android checks live in lib/window.ts rather than in try/catch.
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        set_reminders,
        make_backup,
        save_image,
        save_image_as,
        image_path,
        prune_images,
        read_sync_config,
        write_sync_config
    ]);

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                migrate_legacy_store(app.handle());
                build_tray(app.handle())?;

                // The frontend rebinds this from settings once it has loaded;
                // this is so the shortcut works even before any window opens.
                if let Err(err) =
                    set_quick_shortcut(app.handle().clone(), DEFAULT_QUICK_SHORTCUT.into())
                {
                    log::warn!("{err}");
                }
            }

            spawn_reminder_loop(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
