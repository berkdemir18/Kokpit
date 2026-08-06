/**
 * Tauri kopru katmani. Uygulama tarayicida (vite dev) acildiginda
 * localStorage'a duser, boylece arayuz Tauri olmadan da calisir.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface DataInfo {
  path: string;
  dir: string;
  size: number;
  exists: boolean;
  backup_count: number;
  last_backup: string | null;
}

export interface BackupInfo {
  file: string;
  size: number;
  stamp: string;
}

export interface OutFile {
  name: string;
  content: string;
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const LS_KEY = 'kokpit:data';

export async function loadData(): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(LS_KEY);
  return (await invoke<string | null>('load_data')) ?? null;
}

/** Kaydeder; otomatik yedek alindiysa yedek dosya adini doner. */
export async function saveData(contents: string): Promise<string | null> {
  if (!isTauri()) {
    localStorage.setItem(LS_KEY, contents);
    return null;
  }
  return (await invoke<string | null>('save_data', { contents })) ?? null;
}

export async function createBackup(): Promise<string | null> {
  if (!isTauri()) return null;
  return (await invoke<string | null>('create_backup')) ?? null;
}

export async function listBackups(): Promise<BackupInfo[]> {
  if (!isTauri()) return [];
  return await invoke<BackupInfo[]>('list_backups');
}

export async function restoreBackup(file: string): Promise<string> {
  return await invoke<string>('restore_backup', { file });
}

export async function dataInfo(): Promise<DataInfo> {
  if (!isTauri()) {
    const raw = localStorage.getItem(LS_KEY) ?? '';
    return {
      path: 'localStorage (tarayıcı modu)',
      dir: '',
      size: new Blob([raw]).size,
      exists: !!raw,
      backup_count: 0,
      last_backup: null,
    };
  }
  return await invoke<DataInfo>('data_info');
}

export async function exportVault(
  vault: string,
  subdir: string,
  files: OutFile[],
): Promise<string[]> {
  return await invoke<string[]>('export_vault', { vault, subdir, files });
}

export async function writeFiles(dir: string, files: OutFile[]): Promise<string[]> {
  return await invoke<string[]>('write_files', { dir, files });
}

export async function listJsonFiles(dir: string): Promise<string[]> {
  if (!isTauri()) return [];
  return await invoke<string[]>('list_json_files', { dir });
}

export async function readDirFile(dir: string, name: string): Promise<string> {
  return await invoke<string>('read_dir_file', { dir, name });
}

export async function pickFolder(title: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const res = await open({ directory: true, multiple: false, title });
  return typeof res === 'string' ? res : null;
}

export async function openPath(path: string): Promise<void> {
  if (!isTauri()) return;
  const { openPath: op } = await import('@tauri-apps/plugin-opener');
  await op(path);
}

/**
 * Uzak metin çeker (Google Takvim iCal adresi). Tarayıcıdan çekince CORS'a
 * takıldığı için istek Rust tarafından yapılır.
 */
export async function fetchText(url: string): Promise<string> {
  if (!isTauri()) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
  return await invoke<string>('fetch_url', { url });
}

/**
 * Windows masaüstü bildirimi.
 *
 * Tauri'de bildirimi Rust gönderir (`notify_now`): AppUserModelID orada kayıt
 * defterine tanıtıldığı için taşınabilir exe'de de balon + ses çıkar. Eklenti
 * üzerinden gönderince kurulum yapılmamış sürümde sessizce düşüyordu.
 */
export async function notify(title: string, body: string, alarm = false): Promise<void> {
  if (!isTauri()) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
    return;
  }
  await invoke('notify_now', { title, body, alarm });
}

export interface PendingReminder {
  id: string;
  title: string;
  body: string;
  /** "YYYY-MM-DDTHH:mm" — bildirimin çıkacağı yerel zaman. */
  at: string;
}

/** Bekleyen hatırlatıcıları Rust zamanlayıcısına yollar. */
export async function syncReminders(items: PendingReminder[], enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke('sync_reminders', { items, enabled });
}

/** Rust zamanı gelen hatırlatıcıyı bildirdiğinde çağrılır. */
export async function onReminderFired(cb: (id: string) => void): Promise<void> {
  if (!isTauri()) return;
  await listen<{ id: string }>('kokpit://reminder-fired', (e) => cb(e.payload.id));
}

/** Bildirim izni var mı (Ayarlar ekranı için). */
export async function notificationAllowed(): Promise<boolean> {
  if (!isTauri()) return 'Notification' in window && Notification.permission === 'granted';
  const n = await import('@tauri-apps/plugin-notification');
  return await n.isPermissionGranted();
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    if (!('Notification' in window)) return false;
    return (await Notification.requestPermission()) === 'granted';
  }
  const n = await import('@tauri-apps/plugin-notification');
  if (await n.isPermissionGranted()) return true;
  return (await n.requestPermission()) === 'granted';
}

export interface CapturePayload { kind: string; text: string; at: string; repeat: string; }

/** Ayri hizli yakalama penceresi bir sey gonderdiginde cagrilir. */
export async function onCaptureSubmit(cb: (p: CapturePayload) => void): Promise<void> {
  if (!isTauri()) return;
  await listen<CapturePayload>('kokpit://capture-submit', (e) => cb(e.payload));
}

/** Global kisayol (Alt+Q) tetiklendiginde cagrilir. */
export async function onQuickCapture(cb: () => void): Promise<void> {
  if (!isTauri()) return;
  await listen('kokpit://quick-capture', () => cb());
}
