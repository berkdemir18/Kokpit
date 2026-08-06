/**
 * Merkezi durum. Tek bir DB nesnesi tutar, degisiklikte aboneleri uyandirir
 * ve yazmayi geciktirerek (debounce) diske kaydeder.
 */

import * as api from './api';
import { DB, emptyDB, migrate } from './model';

type Listener = () => void;

export interface SaveState {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: string;
  error: string;
  lastBackup: string;
}

class Store {
  db: DB = emptyDB();
  ready = false;
  /** Açılışta diskte veri dosyası var mıydı? (ilk çalıştırma seed kararı için) */
  hadFile = false;
  save: SaveState = { status: 'idle', lastSavedAt: '', error: '', lastBackup: '' };

  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private pending = false;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  async load(): Promise<void> {
    try {
      const raw = await api.loadData();
      this.hadFile = raw !== null;
      this.db = raw ? migrate(JSON.parse(raw)) : emptyDB();
    } catch (err) {
      this.db = emptyDB();
      this.hadFile = true; // dosya var ama bozuk: seed'le üstüne yazma
      this.save.status = 'error';
      this.save.error = String(err);
    }
    this.ready = true;
    this.applyAccent();
    this.emit();
  }

  /**
   * Veriyi degistir ve kaydet. Tum yazma yollari buradan gecer.
   *
   * `quiet: true` → aboneler uyandirilmaz. Yazi yazarken (not govdesi, gorev
   * notu…) her tusa basista arayuz yeniden cizilirse imlec kaybolur; boyle
   * yerlerde sessiz yazim kullanilir.
   */
  update(fn: (db: DB) => void, opts: { persist?: boolean; quiet?: boolean } = {}): void {
    fn(this.db);
    if (!opts.quiet) this.emit();
    if (opts.persist !== false) this.scheduleSave();
  }

  /** Yazi yazarken kullanilan kisayol: kaydet ama hicbir sey yeniden cizme. */
  updateQuiet(fn: (db: DB) => void): void {
    this.update(fn, { quiet: true });
  }

  /** Sadece arayuz tazelensin (veri degismedi). */
  touch(): void {
    this.emit();
  }

  private scheduleSave(): void {
    this.pending = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), 400);
  }

  /** Bekleyen yazimi hemen diske gecir. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.pending) return;
    this.pending = false;
    this.save.status = 'saving';
    this.emit();
    try {
      const backup = await api.saveData(JSON.stringify(this.db, null, 2));
      this.save.status = 'saved';
      this.save.lastSavedAt = new Date().toISOString();
      this.save.error = '';
      if (backup) this.save.lastBackup = backup;
    } catch (err) {
      this.save.status = 'error';
      this.save.error = String(err);
    }
    this.emit();
  }

  /** Yedekten geri yukleme sonrasi bellegi tazeler. */
  replace(raw: string): void {
    this.db = migrate(JSON.parse(raw));
    this.applyAccent();
    this.emit();
  }

  /** Renkli modüller kapalıysa kök sınıfa `no-color` ekler. */
  applyColorMode(): void {
    document.documentElement.classList.toggle('no-color', this.db.settings.colorfulModules === false);
  }

  applyAccent(): void {
    const accent = this.db.settings.accent || '#57b6ff';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-glow', `${accent}66`);
    document.documentElement.style.setProperty('--heat-4', accent);
  }
}

export const store = new Store();
export const db = (): DB => store.db;
