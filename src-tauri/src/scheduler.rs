//! Hatirlatici zamanlayicisi (Rust tarafinda).
//!
//! NEDEN BURADA: Zamanlayici once webview icinde (JS `setInterval`) calisiyordu.
//! Pencere tepsiye inince WebView2 gizli sayfanin zamanlayicilarini kisiyor,
//! bir sure sonra tamamen donduruyor — uygulama gorev yoneticisinde acikken bile
//! bildirim gelmiyordu (Berk'in bildirdigi hata, 2026-08-05). Rust ipligi
//! pencere gizliyken de aynen calisir.
//!
//! Arayuz bekleyen hatirlaticilari `sync_reminders` ile buraya yollar; burasi
//! zamani gelince Windows bildirimini gonderir ve ana pencereye
//! `kokpit://reminder-fired` olayini yollar (ekrandaki alarm karti + isaretleme
//! icin). Ayni hatirlatici iki kez patlamasin diye gonderilenler akilda tutulur.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::notify;

/// Arayuzden gelen bekleyen hatirlatici.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pending {
    pub id: String,
    pub title: String,
    pub body: String,
    /// Bildirimin gonderilecegi yerel zaman: "YYYY-MM-DDTHH:MM".
    /// (Erken uyari suresi arayuzde zaten dusulur.)
    pub at: String,
}

#[derive(Default)]
pub struct Queue {
    items: Vec<Pending>,
    /// Arayuzden bagimsiz eklenenler (tanilama testi). `sync` bunlara dokunmaz.
    extra: Vec<Pending>,
    /// "id@at" — gonderilmis olanlar; tekrar gonderilmez.
    fired: HashSet<String>,
    /// Gunluge ayni satiri tekrar tekrar yazmamak icin son durumun ozeti.
    last_log: String,
    enabled: bool,
}

pub struct SchedulerState(pub Mutex<Queue>);

impl Default for SchedulerState {
    fn default() -> Self {
        SchedulerState(Mutex::new(Queue {
            enabled: true,
            ..Default::default()
        }))
    }
}

fn key(p: &Pending) -> String {
    format!("{}@{}", p.id, p.at)
}

/// Simdiki yerel zamanin karsilastirma anahtari. Bicim sabit oldugu icin
/// metin karsilastirmasi tarih karsilastirmasiyla ayni sonucu verir.
fn now_key() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// Bekleyen listeyi tazeler (arayuz her degisimde yollar).
pub fn sync(app: &tauri::AppHandle, state: &SchedulerState, items: Vec<Pending>, enabled: bool) {
    let Ok(mut q) = state.0.lock() else { return };
    let n = items.len();
    let ilk = items.iter().map(|p| p.at.clone()).min().unwrap_or_default();
    q.items = items;
    q.enabled = enabled;
    // Artik listede olmayanlarin "gonderildi" kaydini tutmaya gerek yok.
    let live: HashSet<String> = q.items.iter().chain(q.extra.iter()).map(key).collect();
    q.fired.retain(|k| live.contains(k));

    // Arayuz her veri degisiminde eslestirme yolluyor; gunluge yalnizca
    // durum gercekten degistiginde yaz.
    let ozet = format!("{n}|{enabled}|{ilk}");
    let degisti = q.last_log != ozet;
    q.last_log = ozet;
    drop(q);
    if degisti {
        notify::log(
            app,
            &format!("arayuzden {n} bekleyen hatirlatici geldi (acik={enabled}, en yakin={ilk})"),
        );
    }
}

/// Tanilama: `Kokpit.exe --bildirim-testi` ile acilinca 30 saniye sonrasina
/// sahte bir hatirlatici koyar. Veriye dokunmaz; "pencereyi kapatinca bildirim
/// geliyor mu" sorusunu tek basina yanitlar.
pub fn queue_self_test(state: &SchedulerState) {
    let at = (chrono::Local::now() + chrono::Duration::seconds(30))
        .format("%Y-%m-%dT%H:%M")
        .to_string();
    let Ok(mut q) = state.0.lock() else { return };
    q.enabled = true;
    // `items` degil `extra`: arayuz acilista sync edince kuyrugu tazeliyor,
    // test kaydi oradan silinirdi.
    q.extra.push(Pending {
        id: "self-test".into(),
        title: "Kokpit bildirim testi".into(),
        body: "Bu balonu gorduysen tepsideyken bildirimler calisiyor.".into(),
        at,
    });
}

/// 10 saniyede bir zamani gelenleri gonderen arka plan ipligi.
pub fn start(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        notify::enter_com();
        scheduler_loop(app)
    });
}

fn scheduler_loop(app: tauri::AppHandle) {
    notify::log(&app, "zamanlayici ipligi calisiyor");
    loop {
        std::thread::sleep(Duration::from_secs(10));

        let due: Vec<Pending> = {
            let state = app.state::<SchedulerState>();
            let Ok(mut q) = state.0.lock() else { continue };
            if !q.enabled {
                continue;
            }
            let now = now_key();
            let mut out = Vec::new();
            for p in q.items.iter().chain(q.extra.iter()) {
                if p.at.is_empty() || p.at > now {
                    continue;
                }
                let k = key(p);
                if q.fired.contains(&k) {
                    continue;
                }
                out.push(p.clone());
            }
            for p in &out {
                q.fired.insert(key(p));
            }
            out
        };

        for p in due {
            let saat = p.at.get(11..16).unwrap_or("");
            let body = if p.body.is_empty() {
                format!("Saat {saat} · Kokpit hatirlatici")
            } else {
                p.body.clone()
            };
            notify::log(&app, &format!("zamani geldi: {} (at={})", p.title, p.at));
            notify::show(&app, &format!("⏰ {}", p.title), &body, true);
            let _ = app.emit_to(
                "main",
                "kokpit://reminder-fired",
                serde_json::json!({ "id": p.id }),
            );
        }
    }
}
