/**
 * Hatırlatıcı motoru + Google Takvim (gizli iCal adresi) içe aktarma.
 *
 * Hatırlatıcılar yerelde tutulur; zamanı gelince Windows masaüstü bildirimi
 * gönderilir. Google Takvim tarafı salt-okunurdur: etkinlikler Kokpit'e gelir,
 * Kokpit'ten Google'a bir şey yazılmaz.
 */

import { store, db } from './store';
import { CalEvent, Reminder, Repeat } from './model';
import * as api from './api';
import { dtKey, parseDT, uid, nowISO, dayKey, nextOccurrence } from './util';

/* ------------------------------------------------------------------- CRUD */

export function addReminder(title: string, at: string, repeat: Repeat = 'none', note = ''): Reminder {
  const r: Reminder = {
    id: uid('rem'),
    title: title.trim() || 'Hatırlatıcı',
    note,
    at,
    done: false,
    notified: false,
    repeat,
    tags: [],
    createdAt: nowISO(),
  };
  store.update((d) => { d.reminders.push(r); });
  return r;
}

export function updateReminder(id: string, patch: Partial<Reminder>): void {
  store.update((d) => {
    const r = d.reminders.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  });
}

export function removeReminder(id: string): void {
  store.update((d) => { d.reminders = d.reminders.filter((x) => x.id !== id); });
}

/**
 * Tamamlandı işaretler. Tekrarlı hatırlatıcı silinmez; bir sonraki
 * zamanına atlar (böylece "her gün 08:00 spor" kendini yeniler).
 */
export function completeReminder(id: string): void {
  store.update((d) => {
    const r = d.reminders.find((x) => x.id === id);
    if (!r) return;
    if (r.repeat !== 'none') {
      r.at = nextOccurrence(r.at, r.repeat);
      r.notified = false;
      r.done = false;
    } else {
      r.done = !r.done;
    }
  });
}

export function remindersOn(day: string): Reminder[] {
  return db().reminders
    .filter((r) => r.at.slice(0, 10) === day)
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function eventsOn(day: string): CalEvent[] {
  return db().events
    .filter((e) => e.start.slice(0, 10) === day)
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Bugünden itibaren yaklaşan (tamamlanmamış) hatırlatıcılar. */
export function upcoming(limit = 5): Reminder[] {
  const now = dtKey();
  return db().reminders
    .filter((r) => !r.done && r.at >= now.slice(0, 10))
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, limit);
}

/** Zamanı geçmiş ama hâlâ yapılmamış olanlar. */
export function overdue(): Reminder[] {
  const now = dtKey();
  return db().reminders
    .filter((r) => !r.done && r.at < now)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/* -------------------------------------------------------------- zamanlayıcı */

let timer: number | null = null;
let syncTimer: number | null = null;

/** Bekleyen hatırlatıcılar → Rust'ın anlayacağı biçim (erken uyarı düşülmüş). */
function pendingList(): api.PendingReminder[] {
  const s = db().settings;
  const lead = Math.max(0, s.notifyLeadMin || 0);
  return db().reminders
    .filter((r) => !r.done && !r.notified && !!r.at)
    .map((r) => ({
      id: r.id,
      title: r.title,
      // Metinde hatırlatıcının KENDİ saati yazar; `at` ise bildirimin çıkacağı
      // (erken uyarı kadar öne alınmış) saattir.
      body: r.note || `Saat ${r.at.slice(11, 16)} · Kokpit hatırlatıcı`,
      at: lead ? dtKey(new Date(parseDT(r.at).getTime() - lead * 60000)) : r.at,
    }));
}

/**
 * Bekleyen hatırlatıcıları Rust'a bildirir. Bildirimi Rust gönderir: pencere
 * tepsiye inince Windows, gizli webview'in zamanlayıcılarını kısıp bir süre
 * sonra donduruyor — JS tarafı saati kaçırıyordu (2026-08-05 hatası).
 */
export function syncNative(): void {
  if (!api.isTauri()) return;
  if (syncTimer !== null) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    void api.syncReminders(pendingList(), db().settings.notifyEnabled);
  }, 400);
}

/**
 * Hatırlatıcı motorunu başlatır.
 *
 * Tauri'de: liste Rust'a gönderilir, zamanı gelince Rust bildirimi yollar ve
 * `kokpit://reminder-fired` olayıyla haber verir — burada da ekrandaki alarm
 * kartı gösterilip hatırlatıcı "bildirildi" olarak işaretlenir.
 * Tarayıcıda (vite dev): eski davranış, 20 sn'lik yerel tur.
 */
export function startScheduler(onFire?: (r: Reminder) => void): void {
  if (timer !== null) window.clearInterval(timer);

  if (api.isTauri()) {
    void api.onReminderFired((id) => {
      const r = db().reminders.find((x) => x.id === id);
      if (!r) return;
      if (!r.notified) store.update((d) => {
        const t = d.reminders.find((x) => x.id === id);
        if (t) t.notified = true;
      });
      onFire?.(r);
    });
    // Veri değişimlerini store yakalar; bu tur yalnız emniyet kemeri.
    timer = window.setInterval(() => syncNative(), 60000);
    syncNative();
    return;
  }

  timer = window.setInterval(() => void tick(onFire), 20000);
  void tick(onFire);
}

/** Tarayıcı modu (Tauri yokken) için yerel tur. */
export async function tick(onFire?: (r: Reminder) => void): Promise<void> {
  const s = db().settings;
  if (!s.notifyEnabled) return;
  const lead = Math.max(0, s.notifyLeadMin || 0);
  const threshold = dtKey(new Date(Date.now() + lead * 60000));

  const due = db().reminders.filter((r) => !r.done && !r.notified && r.at && r.at <= threshold);
  if (!due.length) return;

  // Önce işaretle, sonra gönder: bildirim hata verse bile döngüye girmesin.
  store.update((d) => {
    for (const r of d.reminders) {
      if (due.some((x) => x.id === r.id)) r.notified = true;
    }
  });

  for (const r of due) {
    const when = r.at.slice(11, 16);
    await api.notify(`⏰ ${r.title}`, r.note || `Saat ${when} · Kokpit hatırlatıcı`);
    onFire?.(r);
  }
}

export function stopScheduler(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

/* --------------------------------------------------------- Google Takvim */

/** ICS satır katlamasını (RFC 5545) açar: devam satırları boşlukla başlar. */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeIcs(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** "20260804T183000Z" | "20260804T213000" | "20260804" → dtKey / dayKey. */
function icsDate(value: string, params: string): { key: string; allDay: boolean } {
  const allDay = params.includes('VALUE=DATE') || /^\d{8}$/.test(value);
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  if (allDay) return { key: `${y}-${m}-${d}`, allDay: true };
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  if (value.endsWith('Z')) {
    // UTC → yerel saate çevir.
    const utc = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm));
    return { key: dtKey(utc), allDay: false };
  }
  return { key: `${y}-${m}-${d}T${hh}:${mm}`, allDay: false };
}

/** ICS metnini etkinliklere çevirir (tekrarlayan kurallar genişletilmez). */
export function parseIcs(raw: string, calendarName = 'Google Takvim'): CalEvent[] {
  const out: CalEvent[] = [];
  let cur: Partial<CalEvent> | null = null;
  let calName = calendarName;

  for (const line of unfold(raw)) {
    if (line.startsWith('X-WR-CALNAME:')) { calName = line.slice(13).trim() || calendarName; continue; }
    if (line === 'BEGIN:VEVENT') { cur = { calendar: calName }; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.start && cur.title) {
        out.push({
          id: uid('ev'),
          uid: cur.uid ?? '',
          title: cur.title,
          start: cur.start,
          end: cur.end ?? cur.start,
          allDay: cur.allDay ?? false,
          location: cur.location ?? '',
          calendar: cur.calendar ?? calName,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const sep = line.indexOf(':');
    if (sep < 0) continue;
    const left = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const name = left.split(';')[0].toUpperCase();

    if (name === 'SUMMARY') cur.title = unescapeIcs(value);
    else if (name === 'LOCATION') cur.location = unescapeIcs(value);
    else if (name === 'UID') cur.uid = value.trim();
    else if (name === 'DTSTART') { const p = icsDate(value.trim(), left); cur.start = p.key; cur.allDay = p.allDay; }
    else if (name === 'DTEND') { cur.end = icsDate(value.trim(), left).key; }
  }
  return out;
}

export interface SyncSummary {
  total: number;
  kept: number;
  calendar: string;
}

/**
 * Google Takvim gizli adresinden etkinlikleri çeker.
 * Adres: Google Takvim → takvim ayarları → "Gizli adres (iCal formatı)".
 * Geçmiş 30 gün + gelecek 180 gün aralığı tutulur; gerisi atılır.
 */
export async function syncGoogleCalendar(): Promise<SyncSummary> {
  const url = db().settings.icsUrl.trim();
  if (!url) throw new Error('Önce Ayarlar\'dan Google Takvim iCal adresini gir.');
  const raw = await api.fetchText(url);
  if (!raw.includes('BEGIN:VCALENDAR')) throw new Error('Bu adres bir iCal takvimi değil.');

  const all = parseIcs(raw);
  const from = dayKey(new Date(Date.now() - 30 * 86400000));
  const to = dayKey(new Date(Date.now() + 180 * 86400000));
  const kept = all.filter((e) => e.start.slice(0, 10) >= from && e.start.slice(0, 10) <= to);

  store.update((d) => {
    d.events = kept;
    d.settings.icsSyncedAt = nowISO();
  });

  return { total: all.length, kept: kept.length, calendar: kept[0]?.calendar ?? 'Google Takvim' };
}

/** Takvim etkinliğinden hatırlatıcı üretir (etkinlik saatinden N dk önce). */
export function reminderFromEvent(e: CalEvent, leadMin = 30): Reminder {
  const at = e.allDay
    ? `${e.start.slice(0, 10)}T09:00`
    : dtKey(new Date(parseDT(e.start).getTime() - leadMin * 60000));
  return addReminder(e.title, at, 'none', e.location);
}
