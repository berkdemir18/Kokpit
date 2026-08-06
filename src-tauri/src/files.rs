//! Disari yazma: Obsidian vault markdown export ve CSV.
//! Icerigi frontend uretir; burasi sadece guvenli sekilde dosyaya yazar.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
pub struct OutFile {
    pub name: String,
    pub content: String,
}

fn safe_name(name: &str) -> Result<&str, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || name.contains(':')
    {
        return Err(format!("gecersiz dosya adi: {name}"));
    }
    Ok(name)
}

/// Vault icinde `03 - Projeler/Kokpit/` altina yazar. Elle yazilan notlara
/// dokunmaz: sadece verilen dosya adlarini olusturur/gunceller.
pub fn export_to_vault(vault: &str, subdir: &str, files: &[OutFile]) -> Result<Vec<String>, String> {
    let root = PathBuf::from(vault);
    if !root.is_dir() {
        return Err("vault klasoru bulunamadi".into());
    }
    let target = root.join(subdir);
    fs::create_dir_all(&target).map_err(|e| format!("klasor olusturulamadi: {e}"))?;

    let mut written = Vec::new();
    for f in files {
        let name = safe_name(&f.name)?;
        if !name.ends_with(".md") {
            return Err(format!("sadece .md yazilir: {name}"));
        }
        let p = target.join(name);
        fs::write(&p, &f.content).map_err(|e| format!("{name} yazilamadi: {e}"))?;
        written.push(p.to_string_lossy().to_string());
    }
    Ok(written)
}

/// Secilen klasore CSV dosyalarini yazar.
pub fn write_files(dir: &str, files: &[OutFile]) -> Result<Vec<String>, String> {
    let d = Path::new(dir);
    if !d.is_dir() {
        return Err("klasor bulunamadi".into());
    }
    let mut written = Vec::new();
    for f in files {
        let name = safe_name(&f.name)?;
        let p = d.join(name);
        fs::write(&p, &f.content).map_err(|e| format!("{name} yazilamadi: {e}"))?;
        written.push(p.to_string_lossy().to_string());
    }
    Ok(written)
}

/// Klasordeki .json dosya adlarini doner (Trakt export klasorunu okumak icin).
pub fn list_json_files(dir: &str) -> Result<Vec<String>, String> {
    let d = Path::new(dir);
    if !d.is_dir() {
        return Err("klasor bulunamadi".into());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(d).map_err(|e| format!("klasor okunamadi: {e}"))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.to_ascii_lowercase().ends_with(".json") {
            names.push(name);
        }
    }
    Ok(names)
}

/// Klasor icinden tek bir dosyayi okur (isim, safe_name ile dogrulanir).
pub fn read_dir_file(dir: &str, name: &str) -> Result<String, String> {
    let n = safe_name(name)?;
    let p = Path::new(dir).join(n);
    fs::read_to_string(&p).map_err(|e| format!("{n} okunamadi: {e}"))
}
