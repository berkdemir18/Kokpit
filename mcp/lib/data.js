/**
 * Kokpit veri dosyasini okur ve normallestirir.
 *
 * Veri tek bir JSON dosyasinda duruyor (Tauri appDataDir). Uygulama calisirken
 * dosyayi atomik yazdigi icin okuma guvenli; yine de dosya kilitliyse kisa bir
 * bekleyip tekrar deniyoruz. Sonuc mtime'a gore onbellege alinir.
 */

import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Uygulamanin varsayilan veri yolu (src-tauri/tauri.conf.json → identifier). */
export const DEFAULT_DATA_PATH =
  process.env.KOKPIT_DATA ||
  join(homedir(), 'AppData', 'Roaming', 'com.berk.kokpit', 'data.json');

const EMPTY = {
  schema: 0,
  titles: [], phases: [], tasks: [], resources: [], labs: [], snippets: [],
  sessions: [], habits: [], habitLogs: {}, goals: [], pages: [],
  reminders: [], events: [], settings: {},
};

let cache = null; // { mtimeMs, size, db }

async function readJson(path) {
  // Yazma anina denk gelirsek dosya yarim okunabilir; bir kez daha dene.
  for (let i = 0; i < 3; i++) {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (err) {
      if (i === 2) throw err;
      await new Promise((r) => setTimeout(r, 120));
    }
  }
}

/**
 * Veriyi okur. Dosya degismediyse onbellekten doner.
 * v4 ve oncesindeki `notes` dizisi `pages` gibi sunulur (govde markdown kalir).
 */
export async function loadDB(path = DEFAULT_DATA_PATH) {
  let st;
  try {
    st = await stat(path);
  } catch {
    throw new Error(
      `Kokpit veri dosyasi bulunamadi: ${path}\n` +
      `Uygulamayi bir kez calistir ya da KOKPIT_DATA ortam degiskeniyle yolu belirt.`
    );
  }
  if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.db;

  const raw = await readJson(path);
  const db = normalize(raw, path, st);
  cache = { mtimeMs: st.mtimeMs, size: st.size, db };
  return db;
}

function arr(v) { return Array.isArray(v) ? v : []; }

function normalize(raw, path, st) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const db = { ...EMPTY, ...d };
  for (const k of ['titles', 'phases', 'tasks', 'resources', 'labs', 'snippets',
    'sessions', 'habits', 'goals', 'reminders', 'events']) {
    db[k] = arr(db[k]);
  }
  db.habitLogs = db.habitLogs && typeof db.habitLogs === 'object' ? db.habitLogs : {};
  db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
  db.pages = Array.isArray(d.pages) ? d.pages.map(normPage) : arr(d.notes).map(noteToPage);
  db._meta = {
    path,
    schema: db.schema ?? 0,
    updatedAt: new Date(st.mtimeMs).toISOString(),
    sizeKb: Math.round(st.size / 1024),
  };
  return db;
}

function normPage(p) {
  return {
    id: p.id ?? '',
    title: p.title ?? '',
    icon: p.icon ?? '',
    parentId: p.parentId ?? '',
    blocks: Array.isArray(p.blocks) ? p.blocks : [],
    body: '',            // blok tabanli sayfada govde bloklardan uretilir
    tags: arr(p.tags),
    category: p.category ?? '',
    favorite: !!p.favorite,
    archived: !!p.archived,
    props: arr(p.props),
    relations: arr(p.relations),
    database: p.database ?? { on: false },
    createdAt: p.createdAt ?? '',
    updatedAt: p.updatedAt ?? '',
  };
}

/** v0.7 ve oncesi: tek parca markdown govdeli not. */
function noteToPage(n) {
  const tags = arr(n.tags);
  return {
    id: n.id ?? '',
    title: n.title ?? '',
    icon: n.icon ?? '',
    parentId: '',
    blocks: [],
    body: n.body ?? '',
    tags: tags.filter((t) => t !== 'gelen-kutusu'),
    category: tags.includes('gelen-kutusu') ? 'Gelen Kutusu' : '',
    favorite: !!n.pinned,
    archived: false,
    props: [],
    relations: [],
    database: { on: false },
    createdAt: n.createdAt ?? '',
    updatedAt: n.updatedAt ?? '',
  };
}
