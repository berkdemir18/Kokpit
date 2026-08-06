//! Windows masaustu bildirimi (toast).
//!
//! SORUN: Windows bir toast'i ancak bilinen bir AppUserModelID (AUMID) adina
//! gosterir. Kurulumla gelen surumde bunu Baslat menusundeki kisayol saglar;
//! TASINABILIR (portable) exe'de kisayol olmadigi icin bildirim sessizce
//! dusuyordu — Berk hicbir balon/ses gormuyordu.
//!
//! COZUM: AUMID'yi kayit defterine kendimiz tanitiyoruz
//! (HKCU\Software\Classes\AppUserModelId\<AUMID>). Bu, Microsoft'un paketsiz
//! uygulamalar icin onerdigi yol; kisayol gerekmeden toast calisiyor.
//! Yine de basarisiz olursa PowerShell'in her Windows'ta kayitli AUMID'sine
//! duserek bildirimi mutlaka gosteriyoruz.
//!
//! NOT: Windows, bir AUMID'yi ilk kullanildigi anda adiyla birlikte kendi
//! veritabanina isliyor; sonradan yazilan DisplayName balonun basliginda
//! gorunmuyor. Bu yuzden kimlik once kayit defterine yazilir, sonra ilk
//! bildirim gonderilir.
//!
//! Bildirimler Rust tarafindan gonderilir: pencere tepsiye inince webview'in
//! zamanlayicilari Windows tarafindan kisilir/dondurulur, JS tarafi saati
//! kacirabilir. Rust ipligi her zaman calisir.

pub const AUMID: &str = "com.berk.kokpit.app";
const APP_NAME: &str = "Kokpit";

#[cfg(windows)]
const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128.png");

/// Bildirim ikonunu veri klasorune yazar (kayit defteri dosya yolu ister).
#[cfg(windows)]
fn icon_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("kokpit-bildirim.png");
    if !path.exists() {
        std::fs::write(&path, ICON_BYTES).ok()?;
    }
    Some(path)
}

/// AUMID'yi kayit defterine yazar. Ucuz ve tekrar tekrar calistirilabilir.
#[cfg(windows)]
pub fn ensure_app_id(app: &tauri::AppHandle) {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let key = format!("HKCU\\Software\\Classes\\AppUserModelId\\{AUMID}");
    let set = |name: &str, value: &str| {
        let _ = Command::new("reg")
            .args(["add", &key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    };
    set("DisplayName", APP_NAME);
    if let Some(icon) = icon_file(app) {
        set("IconUri", &icon.display().to_string());
    }
}

#[cfg(not(windows))]
pub fn ensure_app_id(_app: &tauri::AppHandle) {}

/// WinRT cagrilari, cagiran ipligin COM apartmanina girmis olmasini ister.
/// Bu yapilmadan `Toast::show()` sessizce hata donuyordu: hatirlatici ipligi
/// kendi std::thread'i oldugu icin bildirim hic cikmiyordu (2026-08-05).
/// Iplik zaten baska bir apartmana girmisse cagri RPC_E_CHANGED_MODE dondurur;
/// zararsizdir, mevcut apartman kullanilir.
#[cfg(windows)]
pub fn enter_com() {
    use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    unsafe {
        CoInitializeEx(std::ptr::null(), COINIT_MULTITHREADED as u32);
    }
}

#[cfg(not(windows))]
pub fn enter_com() {}

/// Bildirimi gosterir. `alarm` true ise kullanici kapatana kadar ekranda kalir.
#[cfg(windows)]
pub fn show(app: &tauri::AppHandle, title: &str, body: &str, alarm: bool) {
    use tauri_winrt_notification::{Duration, Scenario, Sound, Toast};

    enter_com();

    let build = |id: &str| {
        let mut t = Toast::new(id)
            .title(title)
            .text1(body)
            .sound(Some(if alarm { Sound::Reminder } else { Sound::Default }));
        if alarm {
            t = t.scenario(Scenario::Reminder);
        } else {
            t = t.duration(Duration::Short);
        }
        if let Some(icon) = icon_file(app) {
            t = t.icon(
                &icon,
                tauri_winrt_notification::IconCrop::Square,
                APP_NAME,
            );
        }
        t
    };

    match build(AUMID).show() {
        Ok(()) => {
            log(app, &format!("gonderildi: {title}"));
            return;
        }
        Err(e) => log(app, &format!("AUMID ile gonderilemedi ({e:?}) — PowerShell kimligine dusuluyor")),
    }
    // Son care: her Windows'ta kayitli olan PowerShell kimligi.
    match build(Toast::POWERSHELL_APP_ID).show() {
        Ok(()) => log(app, &format!("PowerShell kimligiyle gonderildi: {title}")),
        Err(e) => log(app, &format!("HATA: bildirim hic gonderilemedi: {e:?}")),
    }
}

/// Bildirim gunlugu — "bildirim gelmiyor" sikayetini tesihs etmek icin.
/// `%APPDATA%\com.berk.kokpit\bildirim.log` (son 200 satir tutulur).
pub fn log(app: &tauri::AppHandle, line: &str) {
    use std::io::Write as _;
    use tauri::Manager;
    let Ok(dir) = app.path().app_data_dir() else { return };
    let path = dir.join("bildirim.log");

    // Dosya buyurse basi atilir. Oku-yaz yerine EKLEME kipi kullaniliyor:
    // zamanlayici ipligi ile ana iplik ayni anda yazinca satirlar birbirine
    // giriyordu.
    if std::fs::metadata(&path).map(|m| m.len() > 64_000).unwrap_or(false) {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            let keep: Vec<&str> = raw.lines().rev().take(200).collect();
            let _ = std::fs::write(&path, keep.into_iter().rev().collect::<Vec<_>>().join("\r\n"));
        }
    }

    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{} {line}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"));
    }
}

#[cfg(not(windows))]
pub fn show(app: &tauri::AppHandle, title: &str, body: &str, _alarm: bool) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}
