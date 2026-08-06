/** Tarih, metin ve kucuk hesap yardimcilari. Saf fonksiyonlar — test edilebilir. */

import type { HabitLogs, ID, ISODate } from './model';

export function uid(prefix = 'k'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** Yerel gune gore YYYY-MM-DD (UTC kaymasi yok). */
export function dayKey(d: Date = new Date()): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDay(key: ISODate): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86400000);
}

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AYLAR_UZUN = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export const MONTH_SHORT = AYLAR;

/** "12 Tem" */
export function shortDate(key: ISODate | ''): string {
  if (!key) return '—';
  const d = parseDay(key);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${AYLAR[d.getMonth()]}`;
}

/** "4 Ağustos 2026" — yil dahil tam tarih. */
export function fullDate(key: ISODate | ''): string {
  if (!key) return '—';
  const d = parseDay(key.slice(0, 10));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${AYLAR_UZUN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "4 Ağu 2026" — kart/tablo icin kisa ama yilli. */
export function midDate(key: ISODate | ''): string {
  if (!key) return '—';
  const d = parseDay(key.slice(0, 10));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Pazartesi 4 Ağustos 2026" */
export function longDate(d: Date = new Date()): string {
  return `${GUNLER[d.getDay()]} ${d.getDate()} ${AYLAR_UZUN[d.getMonth()]} ${d.getFullYear()}`;
}

export function clockTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('tr-TR');
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtDuration(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}s ${String(m).padStart(2, '0')}d` : `${m}d`;
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return clamp(Math.round((part / whole) * 100));
}

export function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Bulundugumuz haftanin pazartesi gunu. */
export function weekStart(d: Date = new Date()): Date {
  const c = new Date(d);
  const day = (c.getDay() + 6) % 7; // pazartesi = 0
  c.setDate(c.getDate() - day);
  c.setHours(0, 0, 0, 0);
  return c;
}

/**
 * Bugunden geriye dogru kesintisiz gun sayisi.
 * Bugun isaretli degilse dun'den baslar (gun daha bitmedi).
 */
export function streak(days: ISODate[], today: ISODate = dayKey()): number {
  const set = new Set(days);
  let cursor = today;
  if (!set.has(cursor)) {
    cursor = dayKey(addDays(parseDay(today), -1));
    if (!set.has(cursor)) return 0;
  }
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = dayKey(addDays(parseDay(cursor), -1));
  }
  return n;
}

export function bestStreak(days: ISODate[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const d of sorted) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    prev = d;
    if (run > best) best = run;
  }
  return best;
}

export function habitDays(logs: HabitLogs, id: ID): ISODate[] {
  return logs[id] ?? [];
}

/** Son `count` gun icin gun anahtarlari (eskiden yeniye). */
export function lastDays(count: number, today: Date = new Date()): ISODate[] {
  const out: ISODate[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(dayKey(addDays(today, -i)));
  return out;
}

/** Heatmap seviyesi 0-4. */
export function heatLevel(value: number, max: number): number {
  if (value <= 0) return 0;
  if (max <= 0) return 1;
  const r = value / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

/* ------------------------------------------------ tarih + saat (hatırlatıcı) */

/** "YYYY-MM-DDTHH:mm" (yerel saat; saat dilimi eki yok). */
export function dtKey(d: Date = new Date()): string {
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** dtKey'i tekrar Date'e çevirir. Bozuksa Invalid Date döner. */
export function parseDT(s: string): Date {
  if (!s) return new Date(NaN);
  const [datePart, timePart = '00:00'] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
}

/** "21:30" */
export function fmtTime(s: string): string {
  const t = s.split('T')[1];
  return t ? t.slice(0, 5) : '';
}

/** "4 Ağu · 21:30" — bugünse "bugün 21:30". */
export function fmtDT(s: string): string {
  if (!s) return '—';
  const day = s.slice(0, 10);
  const time = fmtTime(s);
  const today = dayKey();
  const tomorrow = dayKey(addDays(new Date(), 1));
  if (day === today) return time ? `bugün ${time}` : 'bugün';
  if (day === tomorrow) return time ? `yarın ${time}` : 'yarın';
  return time ? `${shortDate(day)} · ${time}` : shortDate(day);
}

/** Tekrar eden hatırlatıcının bir sonraki zamanı. */
export function nextOccurrence(at: string, repeat: string): string {
  const d = parseDT(at);
  if (Number.isNaN(d.getTime())) return at;
  if (repeat === 'günlük') d.setDate(d.getDate() + 1);
  else if (repeat === 'haftalık') d.setDate(d.getDate() + 7);
  else if (repeat === 'aylık') d.setMonth(d.getMonth() + 1);
  else return at;
  return dtKey(d);
}

const AY_ADLARI: Record<string, number> = {
  ocak: 0, şubat: 1, subat: 1, mart: 2, nisan: 3, mayıs: 4, mayis: 4, haziran: 5,
  temmuz: 6, ağustos: 7, agustos: 7, eylül: 8, eylul: 8, ekim: 9, kasım: 10, kasim: 10, aralık: 11, aralik: 11,
};
const GUN_ADLARI: Record<string, number> = {
  pazar: 0, pazartesi: 1, salı: 2, sali: 2, çarşamba: 3, carsamba: 3,
  perşembe: 4, persembe: 4, cuma: 5, cumartesi: 6,
};

export interface ParsedWhen {
  /** Bulunduysa "YYYY-MM-DDTHH:mm". */
  at: string;
  /** Zaman ifadesi çıkarılmış metin. */
  text: string;
  /** Metinde gerçekten bir zaman bulundu mu. */
  found: boolean;
  /** Metinde bir GÜN geçiyor muydu ("yarın", "5 ağustos", "cuma")? */
  hasDay: boolean;
  /** Metinde bir SAAT geçiyor muydu ("21.30")? */
  hasTime: boolean;
}

/**
 * "yarın 21.30 diş hekimi" gibi serbest metinden tarih+saat çıkarır.
 * Bulamazsa bugünün tarihi + bir sonraki tam saat döner (found=false).
 */
export function parseWhen(input: string, now: Date = new Date()): ParsedWhen {
  let text = input.trim();
  const base = new Date(now);
  base.setSeconds(0, 0);
  let dayFound = false;
  let timeFound = false;
  const target = new Date(base);

  /**
   * Deseni arar ve KABUL EDİLİRSE metinden çıkarır.
   * `accept` olmadan yazılan ilk sürüm, "21.30"u gün.ay sanıp reddediyor ama
   * yine de metinden siliyordu; saat bir daha bulunamıyordu.
   */
  const eat = (re: RegExp, accept?: (m: RegExpMatchArray) => boolean): RegExpMatchArray | null => {
    const m = text.match(re);
    if (!m) return null;
    if (accept && !accept(m)) return null;
    text = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).replace(/\s{2,}/g, ' ').trim();
    return m;
  };

  // "5 ağustos" / "5 ağustos 2026"
  const dm = eat(new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(AY_ADLARI).join('|')})(\\s+(\\d{4}))?\\b`, 'i'));
  if (dm) {
    target.setDate(Number(dm[1]));
    target.setMonth(AY_ADLARI[dm[2].toLowerCase()]);
    if (dm[4]) target.setFullYear(Number(dm[4]));
    dayFound = true;
  }

  // "12.08.2026" / "12/08" — ay 12'den büyükse tarih değildir ("21.30" saattir).
  if (!dayFound) {
    const num = eat(
      /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b(?!\d)/,
      (m) => Number(m[2]) >= 1 && Number(m[2]) <= 12,
    );
    if (num) {
      target.setDate(Number(num[1]));
      target.setMonth(Number(num[2]) - 1);
      if (num[3]) target.setFullYear(Number(num[3].length === 2 ? '20' + num[3] : num[3]));
      dayFound = true;
    }
  }

  if (!dayFound && eat(/\b(yarın|yarin)\b/i)) { target.setDate(target.getDate() + 1); dayFound = true; }
  if (!dayFound && eat(/\b(bugün|bugun)\b/i)) dayFound = true;
  if (!dayFound && eat(/\b(öbür ?gün|obur ?gun)\b/i)) { target.setDate(target.getDate() + 2); dayFound = true; }

  // "cuma", "pazartesi" → bu haftanın gelecek günü
  if (!dayFound) {
    const g = eat(new RegExp(`\\b(${Object.keys(GUN_ADLARI).join('|')})\\b`, 'i'));
    if (g) {
      const want = GUN_ADLARI[g[1].toLowerCase()];
      let delta = (want - target.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      target.setDate(target.getDate() + delta);
      dayFound = true;
    }
  }

  // saat: "21:30", "21.30", "21", "saat 9"
  const tm = eat(/\b(?:saat\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (tm) {
    target.setHours(Number(tm[1]), Number(tm[2]), 0, 0);
    timeFound = true;
  } else {
    const hOnly = eat(/\bsaat\s*([01]?\d|2[0-3])\b/i);
    if (hOnly) { target.setHours(Number(hOnly[1]), 0, 0, 0); timeFound = true; }
  }

  if (!timeFound) target.setHours(9, 0, 0, 0);
  // Saat verilip gün verilmediyse ve o saat geçtiyse yarına at.
  if (timeFound && !dayFound && target.getTime() <= base.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return {
    at: dtKey(target),
    text: text.trim(),
    found: dayFound || timeFound,
    hasDay: dayFound,
    hasTime: timeFound,
  };
}

/** Ay ızgarası: pazartesi başlangıçlı 6x7 gün anahtarı. */
export function monthGrid(year: number, month: number): ISODate[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // pazartesi = 0
  const start = addDays(first, -offset);
  const out: ISODate[] = [];
  for (let i = 0; i < 42; i++) out.push(dayKey(addDays(start, i)));
  return out;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bir metinde kac yapilacak maddesi var, kaci isaretli. */
export function todoStats(src: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of src.split('\n')) {
    const m = /^\s*[-*]\s+\[( |x|X)\]\s+/.exec(line);
    if (!m) continue;
    total++;
    if (m[1].toLowerCase() === 'x') done++;
  }
  return { done, total };
}

/** `> [!uyarı]` bilgi kutularinin baslik/renk esleme tablosu. */
const CALLOUTS: Record<string, [string, string]> = {
  not: ['📝', 'not'],
  bilgi: ['💡', 'bilgi'],
  ipucu: ['💡', 'ipucu'],
  uyarı: ['⚠️', 'uyarı'],
  uyari: ['⚠️', 'uyarı'],
  önemli: ['🔥', 'önemli'],
  onemli: ['🔥', 'önemli'],
  yapıldı: ['✅', 'yapıldı'],
  yapildi: ['✅', 'yapıldı'],
};

/**
 * Basit markdown -> HTML (not sayfasi icin; harici bagimlilik yok).
 *
 * Desteklenen: # basliklar, - / * madde, 1. numarali madde, - [ ] yapilacak,
 * > alinti, > [!uyarı] bilgi kutusu, --- ayrac, ``` kod blogu, `kod`,
 * **kalin**, *egik*, ~~ustu cizili~~, ==vurgu==, [metin](adres).
 *
 * Her blok `data-line` tasir: sayfaya tiklayinca imlecin kaynaktaki dogru
 * satira konabilmesi (Notion tarzi "yaziya tikla, duzenlemeye gec") ve
 * yapilacak kutularinin isaretlenebilmesi buna dayanir.
 */
export function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let inCode = false;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  };
  const openList = (t: 'ul' | 'ol', cls = '') => {
    if (listType !== t) { closeList(); out.push(`<${t}${cls ? ` class="${cls}"` : ''}>`); listType = t; }
  };

  lines.forEach((line, idx) => {
    const fence = line.trim().startsWith('```');
    if (fence) {
      closeList();
      if (!inCode) {
        const lang = escapeHtml(line.trim().slice(3).trim());
        out.push(`<pre data-lang="${lang}" data-line="${idx}"><code>`);
      } else {
        out.push('</code></pre>');
      }
      inCode = !inCode;
      return;
    }
    if (inCode) { out.push(escapeHtml(line)); return; }

    const esc = escapeHtml(line);

    const heading = /^(#{1,4})\s+(.*)$/.exec(esc);
    if (heading) {
      closeList();
      const n = heading[1].length;
      out.push(`<h${n} data-line="${idx}">${inline(heading[2])}</h${n}>`);
      return;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(esc)) { closeList(); out.push(`<hr data-line="${idx}">`); return; }

    const quote = /^\s*&gt;\s?(.*)$/.exec(esc);
    if (quote) {
      closeList();
      const call = /^\[!([^\]]+)\]\s*(.*)$/.exec(quote[1]);
      if (call) {
        const key = call[1].toLowerCase().trim();
        const [icon, label] = CALLOUTS[key] ?? ['📌', call[1].trim()];
        out.push(
          `<div class="md-callout md-callout--${escapeHtml(label)}" data-line="${idx}">` +
          `<span class="md-callout__icon">${icon}</span>` +
          `<span class="md-callout__body"><b>${escapeHtml(label)}</b> ${inline(call[2])}</span></div>`,
        );
        return;
      }
      out.push(`<blockquote data-line="${idx}">${inline(quote[1])}</blockquote>`);
      return;
    }

    const todo = /^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(esc);
    if (todo) {
      openList('ul', 'md-todos');
      const checked = todo[2].toLowerCase() === 'x';
      const indent = Math.min(3, Math.floor(todo[1].length / 2));
      out.push(
        `<li class="md-todo${checked ? ' is-done' : ''}" data-line="${idx}" data-indent="${indent}">` +
        `<span class="md-todo__box">${checked ? '✓' : ''}</span>` +
        `<span class="md-todo__text">${inline(todo[3])}</span></li>`,
      );
      return;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(esc);
    if (bullet) { openList('ul'); out.push(`<li data-line="${idx}">${inline(bullet[1])}</li>`); return; }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(esc);
    if (numbered) { openList('ol'); out.push(`<li data-line="${idx}">${inline(numbered[1])}</li>`); return; }

    if (!esc.trim()) { closeList(); return; }

    closeList();
    out.push(`<p data-line="${idx}">${inline(esc)}</p>`);
  });

  closeList();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    // [metin](adres) — yalnız http(s) ve obsidian bağlantıları.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="md-wikilink">$1</span>');
}
