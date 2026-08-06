/** Kenar çubuğu + üst bar. Ana içerik alanını döndürür. */

import { store, db } from '../core/store';
import { VIEWS, ViewId, currentView, navigate } from '../core/router';
import { fmtBytes, clockTime, dayKey } from '../core/util';
import { h, clear } from './dom';
import { icon } from './icons';
import type { DataInfo } from '../core/api';

export interface ShellRefs {
  content: HTMLElement;
  titleEl: HTMLElement;
  metaEl: HTMLElement;
  navEl: HTMLElement;
  footEl: HTMLElement;
  dotEl: HTMLElement;
}

export interface Counts {
  watch: number;
  goals: number;
  notes: number;
  dashboard: number;
  agenda: number;
}

export function buildShell(
  root: HTMLElement,
  onCapture: () => void,
  onPalette: () => void,
): ShellRefs {
  clear(root);

  const navEl = h('div', { class: 'sidebar__nav' });
  const footEl = h('div', { class: 'sidebar__foot' });

  const sidebar = h('div', { class: 'sidebar' },
    h('div', { class: 'sidebar__brand' },
      h('div', { class: 'sidebar__mark' }, icon('brand', 20)),
      h('div', { class: 'sidebar__name', text: 'KOKPİT' }),
      h('div', { class: 'sidebar__ver', text: 'v0.8' }),
    ),
    navEl,
    footEl,
  );

  const dotEl = h('div', { class: 'topbar__dot' });
  const titleEl = h('div', { class: 'topbar__title' });
  const metaEl = h('div', { class: 'topbar__meta' });
  const content = h('div', { class: 'content' });

  const main = h('div', { class: 'main' },
    h('div', { class: 'topbar' },
      dotEl,
      h('div', { class: 'topbar__titles' }, titleEl, metaEl),
      h('button', { class: 'searchbox', onclick: onPalette },
        h('div', { class: 'mono', text: '⌕' }),
        h('div', { text: 'Her şeyde ara…' }),
        h('div', { class: 'searchbox__kbd', text: 'Ctrl K' }),
      ),
      h('button', { class: 'capture-btn', onclick: onCapture },
        h('span', { class: 'capture-btn__plus', text: '+' }),
        ' Hızlı yakalama ',
        h('span', { class: 'capture-btn__kbd', text: '⇧⌃N' }),
      ),
    ),
    content,
  );

  root.append(sidebar, main);
  return { content, titleEl, metaEl, navEl, footEl, dotEl };
}

export function renderNav(refs: ShellRefs, counts: Counts): void {
  clear(refs.navEl);
  const view = currentView();
  const countFor: Record<ViewId, string> = {
    dashboard: String(counts.dashboard || ''),
    notes: String(counts.notes),
    agenda: String(counts.agenda || ''),
    watch: String(counts.watch),
    goals: String(counts.goals),
    stats: '',
    settings: '',
  };
  for (const v of VIEWS) {
    const on = v.id === view;
    refs.navEl.append(
      h('button', {
        class: `nav-item${on ? ' is-active' : ''}`,
        style: { '--nav-c': v.color } as unknown as Partial<CSSStyleDeclaration>,
        onclick: () => navigate(v.id),
      },
        h('div', { class: 'nav-item__bar' }),
        h('div', { class: 'nav-item__icon' }, icon(v.id)),
        h('div', { class: 'nav-item__label', text: v.label }),
        h('div', { class: 'nav-item__count', text: countFor[v.id] }),
      ),
    );
  }
}

export function renderFoot(refs: ShellRefs, info: DataInfo | null, onExport: () => void): void {
  clear(refs.footEl);
  const saved = store.save.lastSavedAt ? clockTime(store.save.lastSavedAt) : '—';
  const statusText =
    store.save.status === 'error'
      ? 'kayıt hatası'
      : store.save.status === 'saving'
        ? 'kaydediliyor…'
        : `yerel veri · yazıldı ${saved}`;
  const dotColor = store.save.status === 'error' ? 'var(--danger)' : 'var(--success)';

  const sizeLine = info
    ? `${info.path.includes('data.json') ? 'data.json' : 'veri'} · ${fmtBytes(info.size)}`
    : 'veri yükleniyor…';
  const backupLine = info ? `yedek: ${info.backup_count}/10` : '';

  refs.footEl.append(
    h('div', { class: 'sidebar__status' },
      h('div', { class: 'sidebar__pulse', style: { background: dotColor } }),
      h('div', { class: 'sidebar__statusText', text: statusText }),
    ),
    h('div', { class: 'sidebar__meta', html: `${sizeLine}<br>${backupLine}` }),
    h('button', {
      class: 'btn btn--mono btn--block',
      text: "OBSIDIAN'A YAZ",
      onclick: onExport,
    }),
  );
}

export function renderTopbar(refs: ShellRefs): void {
  const view = currentView();
  const d = db();
  const today = dayKey();
  const dueToday = d.reminders.filter((r) => !r.done && r.at.slice(0, 10) === today).length;

  const titles: Record<ViewId, [string, string]> = {
    dashboard: ['Bugün', dashMeta()],
    notes: ['Notlar', notesMeta()],
    agenda: ['Takvim & Hatırlatıcı', `${dueToday} BUGÜN · ${d.reminders.filter((r) => !r.done).length} AÇIK · ${d.events.length} TAKVİM ETKİNLİĞİ`],
    watch: ['İzleme', watchMeta()],
    goals: ['Hedefler & Alışkanlıklar', `${d.habits.filter((h2) => !h2.archived).length} ALIŞKANLIK · ${d.goals.filter((g) => g.status === 'active').length} AÇIK HEDEF`],
    stats: ['İstatistik', 'BİRLEŞİK GÖRÜNÜM · ' + new Date().getFullYear()],
    settings: ['Ayarlar', 'KOKPİT 0.8 · TAURI 2 · YEREL VERİ'],
  };
  const [t, m] = titles[view];
  refs.titleEl.textContent = t;
  refs.metaEl.textContent = m;
  refs.dotEl.replaceChildren(icon(view, 15));
}

function notesMeta(): string {
  const pages = db().pages;
  const live = pages.filter((p) => !p.archived);
  return `${live.length} SAYFA · ${live.filter((p) => p.favorite).length} FAVORİ · ${live.filter((p) => p.database.on).length} VERİTABANI · ${pages.length - live.length} ARŞİV`;
}

function dashMeta(): string {
  const d = db();
  const today = dayKey();
  const due = d.reminders.filter((r) => !r.done && r.at.slice(0, 10) === today).length;
  const inbox = d.pages.filter((p) => p.category === 'Gelen Kutusu' && !p.archived).length;
  return `${due} HATIRLATICI · ${inbox} GELEN KUTUSU · SON YAZIM ${store.save.lastSavedAt ? clockTime(store.save.lastSavedAt) : '—'}`;
}

function watchMeta(): string {
  const d = db();
  const rated = d.titles.filter((t) => t.rating);
  const avg = rated.length ? (rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length).toFixed(1) : '—';
  return `${d.titles.length} KAYIT · ${d.titles.filter((t) => t.status === 'active').length} İZLENİYOR · ORT. PUAN ${avg}`;
}

