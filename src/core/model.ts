/** Kokpit veri modeli. Tek bir JSON dosyasinda saklanir. */

import { Block, normalizeBlock, markdownToBlocks, newBlock } from './blocks';

/** v5: notlar bloklu SAYFA'lara dönüştü (Notion mantığı). */
export const SCHEMA_VERSION = 5;

export type ID = string;
export type ISODate = string; // YYYY-MM-DD

export type Status = 'planned' | 'active' | 'done' | 'dropped';

export const STATUS_LABEL: Record<Status, string> = {
  planned: 'İzlenecek',
  active: 'İzleniyor',
  done: 'İzlendi',
  dropped: 'Bıraktım',
};

export const RESOURCE_STATUS_LABEL: Record<Status, string> = {
  planned: 'planlı',
  active: 'aktif',
  done: 'bitti',
  dropped: 'bırakıldı',
};

/* ------------------------------------------------------------------ İzleme */

export type TitleKind = 'film' | 'dizi';

/** Trakt tarzi bolum takibi: her bolum icin ayri izlendi/puan/yorum. */
export interface EpisodeRecord {
  season: number;
  number: number;
  name: string;
  airDate: ISODate | '';
  watched: boolean;
  watchedAt: ISODate | '';
  rating: number | null; // 1-10
  comment: string;
}

export interface Title {
  id: ID;
  kind: TitleKind;
  name: string;
  year: number | null;
  genres: string[];
  status: Status;
  rating: number | null; // 1-10
  posterUrl: string;
  imdb: string;
  watchedAt: ISODate | '';
  withWho: string[];
  review: string;
  season: number;
  episode: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** TMDB'den eklendiyse dolu — dolu olan dizilerde tam bolum listesi cekilebilir. */
  tmdbId: number | null;
  /** Bolum bazli takip (yalniz dizi). tmdbId varsa TMDB'den doldurulur/senkronlanir. */
  episodes: EpisodeRecord[];
  episodesFetchedAt: string;
}

/* ------------------------------------------------------------------- Siber */

export type Area = 'ağ' | 'linux' | 'web' | 'exploit' | 'adli' | 'blue' | 'kripto';

export const AREAS: Area[] = ['ağ', 'linux', 'web', 'exploit', 'adli', 'blue', 'kripto'];

export const AREA_VAR: Record<Area, string> = {
  'ağ': 'var(--area-ag)',
  linux: 'var(--area-linux)',
  web: 'var(--area-web)',
  exploit: 'var(--area-exploit)',
  adli: 'var(--area-adli)',
  blue: 'var(--area-blue)',
  kripto: 'var(--area-kripto)',
};

/** Yol haritası fazı — Berk'in SOC planındaki "FAZ 0", "FAZ 1"… */
export interface Phase {
  id: ID;
  code: string;   // FAZ 0
  title: string;
  when: string;   // AĞU–EYL 2026 · ~6 HAFTA
  goal: string;
  order: number;
}

/** Faz içindeki tek bir görev; işaretlenebilir. */
export interface RoadmapTask {
  id: ID;
  phaseId: ID;
  when: string;   // Hafta 1-2 / EKİM / SÜREKLİ
  title: string;
  note: string;
  tags: string[]; // ÜCRETSİZ, KRİTİK, EN ÖNCELİKLİ…
  done: boolean;
  doneAt: ISODate | '';
  order: number;
}

export type ResourceKind = 'kurs' | 'kitap' | 'video' | 'makale' | 'lab';

export interface Resource {
  id: ID;
  kind: ResourceKind;
  title: string;
  link: string;
  progress: number; // 0-100
  status: Status;
  phaseId: ID | null;
  rating: number | null;
  updatedAt: string;
}

export type Platform = 'TryHackMe' | 'HackTheBox' | 'CTF' | 'diğer';
export type Difficulty = 'Kolay' | 'Orta' | 'Zor' | 'Insane';

export interface LabEntry {
  id: ID;
  platform: Platform;
  name: string;
  difficulty: Difficulty;
  solvedAt: ISODate | '';
  durationMin: number;
  writeup: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Snippet {
  id: ID;
  title: string;
  language: string;
  code: string;
  explanation: string;
  tags: string[];
  updatedAt: string;
}

export interface StudySession {
  id: ID;
  date: ISODate;
  minutes: number;
  area: Area;
  note: string;
}

/* -------------------------------------------------- Hedefler & alışkanlıklar */

export type Cadence = 'günlük' | 'haftalık';

export interface Habit {
  id: ID;
  name: string;
  cadence: Cadence;
  targetPerWeek: number;
  archived: boolean;
  createdAt: string;
}

/** Tamamlanan gunler: habitId -> ISODate[] */
export type HabitLogs = Record<ID, ISODate[]>;

export interface Milestone {
  text: string;
  done: boolean;
}

export interface Goal {
  id: ID;
  title: string;
  area: string;
  targetDate: ISODate | '';
  milestones: Milestone[];
  status: Status;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ Notlar */

export interface NoteLink {
  type: 'title' | 'lab' | 'node' | 'goal' | 'resource' | '';
  id: ID | '';
}

/** v0.7 ve öncesi: tek parça markdown gövdeli not. Yalnız göç için duruyor. */
export interface Note {
  id: ID;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  link: NoteLink;
  createdAt: string;
  updatedAt: string;
  icon: string;
  cover: string;
}

/* -------------------------------------------------------- Sayfalar (v0.8) */

/** Sayfaya eklenen özel özellik — veritabanı sütunu gibi çalışır. */
export type PropType = 'metin' | 'sayı' | 'seçim' | 'tarih' | 'onay' | 'url';

export const PROP_TYPES: PropType[] = ['metin', 'sayı', 'seçim', 'tarih', 'onay', 'url'];

export interface PageProp {
  id: ID;
  key: string;
  type: PropType;
  value: string;
}

export type DbView = 'tablo' | 'liste' | 'pano' | 'galeri' | 'takvim';

export const DB_VIEWS: DbView[] = ['tablo', 'liste', 'pano', 'galeri', 'takvim'];

/** Sayfa bir veritabanıysa: alt sayfaları satır olarak gösterir. */
export interface PageDatabase {
  on: boolean;
  view: DbView;
  /** Pano/galeri gruplaması ve takvim tarihi için kullanılacak özellik adı. */
  groupBy: string;
  dateKey: string;
  /** Tabloda gösterilecek özellik adları (boşsa hepsi). */
  columns: string[];
}

/**
 * Notion mantığında sayfa. Her şey bir sayfadır: not da, veritabanı satırı da,
 * alt sayfa da. İçerik bloklardan oluşur (`core/blocks.ts`).
 */
export interface Page {
  id: ID;
  title: string;
  icon: string;
  cover: string;
  /** Üst sayfa; boşsa kök seviye. İç içe sayfa ağacı buradan kurulur. */
  parentId: ID | '';
  blocks: Block[];
  tags: string[];
  category: string;
  favorite: boolean;
  archived: boolean;
  props: PageProp[];
  /** Elle kurulan ilişkiler (çift yönlü tutulur). */
  relations: ID[];
  database: PageDatabase;
  createdAt: string;
  updatedAt: string;
}

export function emptyPage(id: ID, now: string, parentId: ID | '' = ''): Page {
  return {
    id, title: '', icon: '', cover: '', parentId,
    blocks: [], tags: [], category: '', favorite: false, archived: false,
    props: [], relations: [],
    database: { on: false, view: 'tablo', groupBy: '', dateKey: '', columns: [] },
    createdAt: now, updatedAt: now,
  };
}

/** Notion tarzı sayfa kapakları — ad → CSS degrade. */
export const NOTE_COVERS: [string, string][] = [
  ['mor', 'linear-gradient(120deg, #4c3b7a, #b39ddb)'],
  ['mavi', 'linear-gradient(120deg, #17384f, #57b6ff)'],
  ['yeşil', 'linear-gradient(120deg, #1d4a38, #6ee7a8)'],
  ['amber', 'linear-gradient(120deg, #5a4318, #efc770)'],
  ['gül', 'linear-gradient(120deg, #5a2a44, #e0a3c8)'],
  ['gece', 'linear-gradient(120deg, #0f1116, #2f3440)'],
];

/* ------------------------------------------------- Hatırlatıcı & takvim */

export type Repeat = 'none' | 'günlük' | 'haftalık' | 'aylık';

export const REPEATS: Repeat[] = ['none', 'günlük', 'haftalık', 'aylık'];

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'tekrar yok',
  'günlük': 'her gün',
  'haftalık': 'her hafta',
  'aylık': 'her ay',
};

/** Yerel hatırlatıcı. `at` = "YYYY-MM-DDTHH:mm" (yerel saat, saat dilimi yok). */
export interface Reminder {
  id: ID;
  title: string;
  note: string;
  at: string;
  done: boolean;
  /** Bildirim gönderildi mi (aynı hatırlatıcı iki kez ötmesin). */
  notified: boolean;
  repeat: Repeat;
  tags: string[];
  createdAt: string;
}

/** Google Takvim'den (gizli iCal adresi) çekilen salt-okunur etkinlik. */
export interface CalEvent {
  id: ID;
  uid: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm" ya da tüm gün için "YYYY-MM-DD". */
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  calendar: string;
}

/* ---------------------------------------------------------------- Ayarlar */

export interface Settings {
  accent: string;
  vaultPath: string;
  vaultSubdir: string;
  weeklyStudyTarget: number; // dakika
  yearlyWatchTarget: number;
  showStatStrip: boolean;
  lastExportAt: string;
  tmdbApiKey: string;
  /** Google Takvim gizli iCal adresi (salt-okunur içe aktarma). */
  icsUrl: string;
  icsSyncedAt: string;
  /** Masaüstü bildirimi açık mı ve kaç dakika önce ötsün. */
  notifyEnabled: boolean;
  notifyLeadMin: number;
  /** Renkli modül vurguları (kapatılırsa tek renk temaya döner). */
  colorfulModules: boolean;
}

export interface DB {
  schema: number;
  titles: Title[];
  phases: Phase[];
  tasks: RoadmapTask[];
  resources: Resource[];
  labs: LabEntry[];
  snippets: Snippet[];
  sessions: StudySession[];
  habits: Habit[];
  habitLogs: HabitLogs;
  goals: Goal[];
  pages: Page[];
  reminders: Reminder[];
  events: CalEvent[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: '#57b6ff',
  vaultPath: '',
  vaultSubdir: '03 - Projeler/Kokpit',
  weeklyStudyTarget: 780,
  yearlyWatchTarget: 60,
  showStatStrip: true,
  lastExportAt: '',
  tmdbApiKey: '',
  icsUrl: '',
  icsSyncedAt: '',
  notifyEnabled: true,
  notifyLeadMin: 0,
  colorfulModules: true,
};

export function emptyDB(): DB {
  return {
    schema: SCHEMA_VERSION,
    titles: [],
    phases: [],
    tasks: [],
    resources: [],
    labs: [],
    snippets: [],
    sessions: [],
    habits: [],
    habitLogs: {},
    goals: [],
    pages: [],
    reminders: [],
    events: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Sayfaları okur. Dosyada `pages` yoksa (v4 ve öncesi) eski `notes` dizisi
 * sayfalara ÇEVRİLİR: markdown gövde bloklara ayrıştırılır, sabitlenen notlar
 * favorilere geçer, "gelen-kutusu" etiketi kategori olur. Hiçbir şey kaybolmaz.
 */
function readPages(d: Partial<DB> & { notes?: unknown }): Page[] {
  const raw = d.pages;
  if (Array.isArray(raw)) {
    return raw.map((p) => normalizePage(p as Partial<Page>));
  }

  const notes = Array.isArray(d.notes) ? (d.notes as Partial<Note>[]) : [];
  return notes.map((n): Page => {
    const now = n.updatedAt ?? n.createdAt ?? '';
    const page = emptyPage(n.id || '', now);
    page.title = n.title ?? '';
    page.icon = n.icon ?? '';
    page.cover = n.cover ?? '';
    page.blocks = markdownToBlocks(n.body ?? '');
    page.tags = (n.tags ?? []).filter((t) => t !== 'gelen-kutusu');
    page.category = (n.tags ?? []).includes('gelen-kutusu') ? 'Gelen Kutusu' : '';
    page.favorite = n.pinned ?? false;
    page.createdAt = n.createdAt ?? now;
    page.updatedAt = now;
    return page;
  });
}

function normalizePage(p: Partial<Page>): Page {
  const base = emptyPage(p.id || '', p.updatedAt ?? '');
  const blocks = Array.isArray(p.blocks) ? p.blocks.map(normalizeBlock) : [];
  return {
    ...base,
    ...p,
    id: p.id || base.id,
    title: p.title ?? '',
    icon: p.icon ?? '',
    cover: p.cover ?? '',
    parentId: p.parentId ?? '',
    blocks: blocks.length ? blocks : [newBlock('text')],
    tags: p.tags ?? [],
    category: p.category ?? '',
    favorite: p.favorite ?? false,
    archived: p.archived ?? false,
    props: Array.isArray(p.props) ? p.props : [],
    relations: Array.isArray(p.relations) ? p.relations : [],
    database: { ...base.database, ...(p.database ?? {}) },
    createdAt: p.createdAt ?? base.createdAt,
    updatedAt: p.updatedAt ?? base.updatedAt,
  };
}

/** Eksik alanlari tamamlar; eski surumden gelen dosyayi da acabilmek icin. */
export function migrate(raw: unknown): DB {
  const base = emptyDB();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<DB>;
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const titles = arr<Partial<Title>>(d.titles).map((t): Title => ({
    id: t.id ?? '',
    kind: t.kind ?? 'film',
    name: t.name ?? '',
    year: t.year ?? null,
    genres: t.genres ?? [],
    status: t.status ?? 'planned',
    rating: t.rating ?? null,
    posterUrl: t.posterUrl ?? '',
    imdb: t.imdb ?? '',
    watchedAt: t.watchedAt ?? '',
    withWho: t.withWho ?? [],
    review: t.review ?? '',
    season: t.season ?? 0,
    episode: t.episode ?? 0,
    tags: t.tags ?? [],
    createdAt: t.createdAt ?? '',
    updatedAt: t.updatedAt ?? '',
    tmdbId: t.tmdbId ?? null,
    episodes: t.episodes ?? [],
    episodesFetchedAt: t.episodesFetchedAt ?? '',
  }));
  return {
    schema: SCHEMA_VERSION,
    titles,
    phases: arr<Phase>(d.phases),
    tasks: arr<RoadmapTask>(d.tasks),
    resources: arr<Resource>(d.resources),
    labs: arr<LabEntry>(d.labs),
    snippets: arr<Snippet>(d.snippets),
    sessions: arr<StudySession>(d.sessions),
    habits: arr<Habit>(d.habits),
    habitLogs:
      d.habitLogs && typeof d.habitLogs === 'object' ? (d.habitLogs as HabitLogs) : {},
    goals: arr<Goal>(d.goals),
    pages: readPages(d),
    reminders: arr<Partial<Reminder>>(d.reminders).map((r): Reminder => ({
      id: r.id ?? '',
      title: r.title ?? '',
      note: r.note ?? '',
      at: r.at ?? '',
      done: r.done ?? false,
      notified: r.notified ?? false,
      repeat: r.repeat ?? 'none',
      tags: r.tags ?? [],
      createdAt: r.createdAt ?? '',
    })),
    events: arr<CalEvent>(d.events),
    settings: { ...base.settings, ...(d.settings ?? {}) },
  };
}
