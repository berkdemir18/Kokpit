mod files;
mod notify;
mod scheduler;
mod store;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

/// Yazim sayaci — her BACKUP_EVERY yazimda bir otomatik yedek.
struct WriteCounter(Mutex<u32>);

fn app_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("veri klasoru bulunamadi: {e}"))?;
    store::ensure_dirs(&dir)?;
    Ok(dir)
}

#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<Option<String>, String> {
    store::read(&app_dir(&app)?)
}

#[tauri::command]
fn save_data(
    app: tauri::AppHandle,
    counter: State<'_, WriteCounter>,
    contents: String,
) -> Result<Option<String>, String> {
    let dir = app_dir(&app)?;
    // Yazmadan once gecerli JSON mu diye bak; bozuk icerik dosyaya gitmesin.
    serde_json::from_str::<serde_json::Value>(&contents)
        .map_err(|e| format!("gecersiz veri: {e}"))?;
    store::write_atomic(&dir, &contents)?;

    let mut n = counter.0.lock().map_err(|_| "sayac kilidi".to_string())?;
    *n += 1;
    if *n >= store::BACKUP_EVERY {
        *n = 0;
        return store::create_backup(&dir);
    }
    Ok(None)
}

#[tauri::command]
fn create_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    store::create_backup(&app_dir(&app)?)
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<store::BackupInfo>, String> {
    store::list_backups(&app_dir(&app)?)
}

#[tauri::command]
fn restore_backup(app: tauri::AppHandle, file: String) -> Result<String, String> {
    let dir = app_dir(&app)?;
    let raw = store::read_backup(&dir, &file)?;
    // Geri yuklemeden once mevcut hali de yedekle ki geri donus mumkun olsun.
    let _ = store::create_backup(&dir);
    store::write_atomic(&dir, &raw)?;
    Ok(raw)
}

#[tauri::command]
fn data_info(app: tauri::AppHandle) -> Result<store::DataInfo, String> {
    store::info(&app_dir(&app)?)
}

#[tauri::command]
fn export_vault(
    vault: String,
    subdir: String,
    files: Vec<files::OutFile>,
) -> Result<Vec<String>, String> {
    files::export_to_vault(&vault, &subdir, &files)
}

#[tauri::command]
fn write_files(dir: String, files: Vec<files::OutFile>) -> Result<Vec<String>, String> {
    files::write_files(&dir, &files)
}

#[tauri::command]
fn list_json_files(dir: String) -> Result<Vec<String>, String> {
    files::list_json_files(&dir)
}

#[tauri::command]
fn read_dir_file(dir: String, name: String) -> Result<String, String> {
    files::read_dir_file(&dir, &name)
}

/// Uzak metin (Google Takvim gizli iCal adresi) — tarayicidan CORS'a takildigi
/// icin istek burada yapilir. Yalniz https adreslerine izin verilir.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    if !url.starts_with("https://") {
        return Err("yalnizca https adresleri desteklenir".into());
    }
    let res = tauri_plugin_http::reqwest::get(&url)
        .await
        .map_err(|e| format!("baglanti hatasi: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    res.text().await.map_err(|e| format!("okuma hatasi: {e}"))
}

/// Hizli yakalama penceresi acilir. Ana pencere gizli kalir — Berk yalnizca
/// kucuk kutuyu gormek istiyor.
fn show_capture(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        let _ = app.emit_to("capture", "kokpit://capture-open", ());
    } else {
        // Pencere yoksa eski davranisa dus: ana pencerede modal ac.
        show_main(app);
        let _ = app.emit("kokpit://quick-capture", ());
    }
}

/// Kucuk pencere veriyi kendisi yazmaz (iki yazici data.json'u bozar);
/// ana pencereye iletir, kayit orada tek elden yapilir.
#[tauri::command]
fn submit_capture(
    app: tauri::AppHandle,
    kind: String,
    text: String,
    at: String,
    repeat: String,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
    app.emit_to(
        "main",
        "kokpit://capture-submit",
        serde_json::json!({ "kind": kind, "text": text, "at": at, "repeat": repeat }),
    )
    .map_err(|e| e.to_string())
}

/// Bekleyen hatirlaticilari Rust zamanlayicisina yollar. Pencere tepsideyken
/// webview zamanlayicilari kisildigi icin bildirimi Rust gonderir.
#[tauri::command]
fn sync_reminders(
    app: tauri::AppHandle,
    state: State<'_, scheduler::SchedulerState>,
    items: Vec<scheduler::Pending>,
    enabled: bool,
) {
    scheduler::sync(&app, &state, items, enabled);
}

/// Tek seferlik bildirim (Ayarlar'daki test dugmesi ve arayuz uyarilari).
#[tauri::command]
fn notify_now(app: tauri::AppHandle, title: String, body: String, alarm: Option<bool>) {
    notify::ensure_app_id(&app);
    notify::show(&app, &title, &body, alarm.unwrap_or(false));
}

#[tauri::command]
fn hide_capture(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("capture") {
        let _ = w.hide();
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .manage(WriteCounter(Mutex::new(0)))
        .manage(scheduler::SchedulerState::default());

    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
        // Tek elle basilabilsin diye asil kisayol Alt+Q; eskisi de calisir.
        let alt_q = Shortcut::new(Some(Modifiers::ALT), Code::KeyQ);
        let ctrl_shift_n = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN);
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, sc, event| {
                    if event.state() == ShortcutState::Pressed
                        && (sc == &alt_q || sc == &ctrl_shift_n)
                    {
                        show_capture(app);
                    }
                })
                .build(),
        );
    }

    builder
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            create_backup,
            list_backups,
            restore_backup,
            data_info,
            export_vault,
            write_files,
            list_json_files,
            read_dir_file,
            fetch_url,
            submit_capture,
            hide_capture,
            sync_reminders,
            notify_now
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Acilista bir yedek al (veri varsa).
            if let Ok(dir) = app_dir(&handle) {
                let _ = store::create_backup(&dir);
            }

            // Windows toast'in tasinabilir exe'de de calismasi icin AUMID'yi
            // tanit; ardindan hatirlatici ipligini baslat.
            notify::ensure_app_id(&handle);
            notify::log(&handle, "uygulama acildi, zamanlayici basliyor");
            scheduler::start(handle.clone());

            // Tanilama bayragi: bildirim yolunu veriye dokunmadan dener.
            if std::env::args().any(|a| a == "--bildirim-testi") {
                scheduler::queue_self_test(&handle.state::<scheduler::SchedulerState>());
                notify::log(&handle, "--bildirim-testi: sahte hatirlatici kuyruga eklendi");
            }

            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
                // Kisayol baska bir uygulamada kayitliysa uygulama yine de acilsin.
                let _ = handle
                    .global_shortcut()
                    .register(Shortcut::new(Some(Modifiers::ALT), Code::KeyQ));
                let _ = handle.global_shortcut().register(Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::KeyN,
                ));

                // Hizli yakalama penceresi: gizli baslar, kisayolla one cikar.
                let _ = tauri::WebviewWindowBuilder::new(
                    app,
                    "capture",
                    tauri::WebviewUrl::App("index.html#/capture".into()),
                )
                .title("Kokpit — Hizli yakalama")
                .inner_size(560.0, 420.0)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .center()
                .visible(false)
                .build();

                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let open_i = MenuItem::with_id(app, "open", "Kokpit'i ac", true, None::<&str>)?;
                let capture_i =
                    MenuItem::with_id(app, "capture", "Hizli yakalama", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Cikis", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &capture_i, &quit_i])?;

                TrayIconBuilder::with_id("kokpit-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Kokpit")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "open" => show_main(app),
                        "capture" => show_capture(app),
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
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kapatinca tepsiye insin, kapanmasin.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            // NOT: kucuk pencere odagi kaybedince KAPATILMIYOR. Once oyleydi
            // ama acilan her ac-kapa (saat secici, select) odagi caliyor,
            // pencere kullanicinin elinden kayip gidiyordu. Kapatma yollari:
            // Esc, x dugmesi, gonderme.
        })
        .run(tauri::generate_context!())
        .expect("Kokpit baslatilamadi");
}
