//! Veri dosyasinin sahibi. Atomik yazma + otomatik yedek rotasyonu.

use serde::Serialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const DATA_FILE: &str = "data.json";
pub const BACKUP_DIR: &str = "backups";
pub const MAX_BACKUPS: usize = 10;
/// Kac yazimda bir otomatik yedek alinir.
pub const BACKUP_EVERY: u32 = 20;

#[derive(Serialize, Clone)]
pub struct DataInfo {
    pub path: String,
    pub dir: String,
    pub size: u64,
    pub exists: bool,
    pub backup_count: usize,
    pub last_backup: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct BackupInfo {
    pub file: String,
    pub size: u64,
    pub stamp: String,
}

pub fn data_path(app_dir: &Path) -> PathBuf {
    app_dir.join(DATA_FILE)
}

pub fn backup_dir(app_dir: &Path) -> PathBuf {
    app_dir.join(BACKUP_DIR)
}

pub fn ensure_dirs(app_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(app_dir).map_err(|e| format!("klasor olusturulamadi: {e}"))?;
    fs::create_dir_all(backup_dir(app_dir)).map_err(|e| format!("yedek klasoru olusturulamadi: {e}"))?;
    Ok(())
}

pub fn read(app_dir: &Path) -> Result<Option<String>, String> {
    let p = data_path(app_dir);
    if !p.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&p).map_err(|e| format!("veri okunamadi: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(None);
    }
    // Bozuk dosyayi sessizce yutma: cagiran taraf yedekten donebilsin.
    serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|e| format!("veri dosyasi bozuk: {e}"))?;
    Ok(Some(raw))
}

/// Gecici dosyaya yazip rename ile yer degistirir; yazim sirasinda cokme olsa da
/// eski dosya bozulmaz. Windows'ta antivirus taze .tmp'yi tarayip kisa sure
/// kilitleyebildigi icin rename birkac kez denenir, olmazsa dogrudan yazilir.
pub fn write_atomic(app_dir: &Path, contents: &str) -> Result<(), String> {
    ensure_dirs(app_dir)?;
    let target = data_path(app_dir);
    let tmp = app_dir.join("data.json.tmp");

    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("gecici dosya acilamadi: {e}"))?;
        f.write_all(contents.as_bytes())
            .map_err(|e| format!("yazilamadi: {e}"))?;
        f.sync_all().map_err(|e| format!("diske yazilamadi: {e}"))?;
    }

    // rename'i birkac kez dene (Windows sharing-violation'a karsi).
    let mut last_err = String::new();
    for attempt in 0..6 {
        match fs::rename(&tmp, &target) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = e.to_string();
                std::thread::sleep(std::time::Duration::from_millis(40 * (attempt + 1)));
            }
        }
    }

    // Son care: dogrudan hedefe yaz (atomik degil ama veri kaybini onler).
    match fs::write(&target, contents) {
        Ok(()) => {
            let _ = fs::remove_file(&tmp);
            Ok(())
        }
        Err(e) => Err(format!("dosya yazilamadi (rename: {last_err}) (dogrudan: {e})")),
    }
}

pub fn stamp_now() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

pub fn create_backup(app_dir: &Path) -> Result<Option<String>, String> {
    let src = data_path(app_dir);
    if !src.exists() {
        return Ok(None);
    }
    ensure_dirs(app_dir)?;
    let name = format!("data-{}.json", stamp_now());
    let dst = backup_dir(app_dir).join(&name);
    fs::copy(&src, &dst).map_err(|e| format!("yedek alinamadi: {e}"))?;
    rotate(app_dir)?;
    Ok(Some(name))
}

fn rotate(app_dir: &Path) -> Result<(), String> {
    let mut items = list_backups(app_dir)?;
    // list_backups yeniden eskiye sirali; fazlasini sil.
    if items.len() > MAX_BACKUPS {
        let extra = items.split_off(MAX_BACKUPS);
        for b in extra {
            let _ = fs::remove_file(backup_dir(app_dir).join(b.file));
        }
    }
    Ok(())
}

pub fn list_backups(app_dir: &Path) -> Result<Vec<BackupInfo>, String> {
    let dir = backup_dir(app_dir);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<BackupInfo> = fs::read_dir(&dir)
        .map_err(|e| format!("yedekler listelenemedi: {e}"))?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.starts_with("data-") || !name.ends_with(".json") {
                return None;
            }
            let size = e.metadata().map(|m| m.len()).unwrap_or(0);
            let stamp = name
                .trim_start_matches("data-")
                .trim_end_matches(".json")
                .to_string();
            Some(BackupInfo { file: name, size, stamp })
        })
        .collect();
    out.sort_by(|a, b| b.stamp.cmp(&a.stamp));
    Ok(out)
}

pub fn read_backup(app_dir: &Path, file: &str) -> Result<String, String> {
    // Yol kacisini engelle: sadece duz dosya adi kabul edilir.
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("gecersiz yedek adi".into());
    }
    let p = backup_dir(app_dir).join(file);
    let raw = fs::read_to_string(&p).map_err(|e| format!("yedek okunamadi: {e}"))?;
    serde_json::from_str::<serde_json::Value>(&raw).map_err(|e| format!("yedek bozuk: {e}"))?;
    Ok(raw)
}

pub fn info(app_dir: &Path) -> Result<DataInfo, String> {
    let p = data_path(app_dir);
    let backups = list_backups(app_dir)?;
    Ok(DataInfo {
        path: p.to_string_lossy().to_string(),
        dir: app_dir.to_string_lossy().to_string(),
        size: fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
        exists: p.exists(),
        backup_count: backups.len(),
        last_backup: backups.first().map(|b| b.stamp.clone()),
    })
}
