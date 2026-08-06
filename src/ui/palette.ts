/** Ctrl+K komut paleti — arama + hızlı komutlar. */

import { navigate } from '../core/router';
import { buildIndex, search, SearchHit } from '../core/search';
import { h, clear } from './dom';
import { closeOverlay, anyOverlayOpen, mountOverlay } from './overlay';
import { openWatchForm } from '../views/watch';
import { openLabForm } from '../views/cyber';
import { openNoteForm } from '../views/notes';
import { openReminderQuick } from '../views/agenda';
import { syncGoogleCalendar } from '../core/reminders';
import { runExport } from '../core/export';
import { store } from '../core/store';
import { createBackup } from '../core/api';
import { toast } from './overlay';

interface Command {
  kind: string;
  label: string;
  meta: string;
  run: () => void;
}

const COMMANDS: Command[] = [
  { kind: 'KOMUT', label: 'Yeni film / dizi ekle', meta: 'izleme', run: () => { navigate('watch'); openWatchForm(); } },
  { kind: 'KOMUT', label: 'Yeni lab kaydı ekle', meta: 'siber', run: () => { navigate('cyber'); openLabForm(); } },
  { kind: 'KOMUT', label: 'Yeni not oluştur', meta: 'notlar', run: () => { navigate('notes'); openNoteForm(); } },
  { kind: 'KOMUT', label: 'Yeni hatırlatıcı kur', meta: 'takvim', run: () => { navigate('agenda'); openReminderQuick(); } },
  { kind: 'KOMUT', label: 'Google Takvimi eşitle', meta: 'takvim', run: async () => { try { const s = await syncGoogleCalendar(); toast(`${s.kept} etkinlik alındı`); } catch (e) { toast(String(e instanceof Error ? e.message : e)); } } },
  { kind: 'KOMUT', label: "Obsidian'a dışa aktar", meta: 'export', run: () => void runExport() },
  { kind: 'KOMUT', label: 'Yedek al', meta: 'veri', run: async () => { await store.flush(); const f = await createBackup(); toast(f ? `Yedek alındı · ${f}` : 'Yedek alındı'); } },
  { kind: 'GİT', label: 'Bugün', meta: 'ekran', run: () => navigate('dashboard') },
  { kind: 'GİT', label: 'Takvim', meta: 'ekran', run: () => navigate('agenda') },
  { kind: 'GİT', label: 'İzleme', meta: 'ekran', run: () => navigate('watch') },
  { kind: 'GİT', label: 'Siber', meta: 'ekran', run: () => navigate('cyber') },
  { kind: 'GİT', label: 'Hedefler', meta: 'ekran', run: () => navigate('goals') },
  { kind: 'GİT', label: 'Notlar', meta: 'ekran', run: () => navigate('notes') },
  { kind: 'GİT', label: 'İstatistik', meta: 'ekran', run: () => navigate('stats') },
  { kind: 'GİT', label: 'Ayarlar', meta: 'ekran', run: () => navigate('settings') },
];

let active = 0;
let results: (SearchHit | Command)[] = [];

export function openPalette(): void {
  if (anyOverlayOpen()) return;
  const index = buildIndex();
  active = 0;

  const input = h('input', { class: 'palette__input', placeholder: 'ara ya da komut yaz…' });
  const listEl = h('div', { class: 'palette__list' });
  const total = index.length;

  const commandMode = (q: string) => q.startsWith('>') || q.startsWith(':');

  const refresh = () => {
    const q = input.value;
    if (!q.trim()) {
      results = [...COMMANDS];
    } else if (commandMode(q)) {
      const t = q.slice(1).trim().toLowerCase();
      results = COMMANDS.filter((c) => (c.label + c.meta).toLowerCase().includes(t));
    } else {
      const hits = search(q, index);
      const cmds = COMMANDS.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase()));
      results = [...cmds.slice(0, 3), ...hits];
    }
    active = 0;
    paint(listEl);
  };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); paint(listEl); scrollTo(listEl); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(listEl); scrollTo(listEl); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); }
  });

  const box = h('div', { class: 'palette' },
    h('div', { class: 'palette__head' },
      h('div', { class: 'mono', style: { color: 'var(--accent)' }, text: '⌕' }),
      input,
      h('div', { class: 'mono', style: { color: 'var(--dim-3)' }, text: 'Esc kapat' }),
    ),
    listEl,
    h('div', { class: 'palette__foot' },
      h('div', { text: '↑↓ gez' }), h('div', { text: '⏎ aç' }), h('div', { text: '> komutlar' }),
      h('div', { class: 'push', text: `tek indeks · ${total} kayıt` }),
    ),
  );

  const overlay = h('div', {
    class: 'overlay overlay--top',
    onclick: (e) => { if (e.target === overlay) closeOverlay(); },
  }, box);

  mountOverlay(overlay);
  refresh();
  input.focus();
}

function choose(i: number): void {
  const item = results[i];
  if (!item) return;
  closeOverlay();
  if ('run' in item) item.run();
  else navigate(item.view);
}

function paint(listEl: HTMLElement): void {
  clear(listEl);
  if (!results.length) { listEl.append(h('div', { class: 'empty-state', text: 'Sonuç yok.' })); return; }
  results.forEach((r, i) => {
    listEl.append(
      h('button', {
        class: `palette__item${i === active ? ' is-active' : ''}`,
        dataset: { idx: String(i) },
        onclick: () => choose(i),
      },
        h('div', { class: 'palette__kind', text: r.kind }),
        h('div', { class: 'palette__label', text: r.label }),
        h('div', { class: 'palette__meta', text: r.meta }),
      ),
    );
  });
}

function scrollTo(listEl: HTMLElement): void {
  const el = listEl.querySelector(`[data-idx="${active}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: 'nearest' });
}
