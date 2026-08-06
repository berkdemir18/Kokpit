/**
 * Bugün ekranı — sade ve not ağırlıklı (2026-08-04'te yeniden kuruldu).
 *
 * Düzen: solda büyük not yazma alanı + son notlar, sağda bugünün ajandası
 * (hatırlatıcı + takvim) ve kısa "bugün yapılacaklar" listesi.
 * Eski dört büyük sayaç kutusu kaldırıldı; yerine tek satır ince özet geldi.
 */

import { store, db } from '../core/store';
import { navigate } from '../core/router';
import { h, clear } from '../ui/dom';
import { toast } from '../ui/overlay';
import {
  dayKey, streak, habitDays, longDate, shortDate, fmtTime, fmtDT,
  weekStart, sum, lastDays, parseWhen,
} from '../core/util';
import { toggleHabit } from './goals';
import { addNoteToInbox, openNote } from './notes';
import { excerptOf } from '../core/pages';
import { roadmapProgress } from './cyber';
import { remindersOn, eventsOn, addReminder, completeReminder, overdue } from '../core/reminders';

export function renderDashboard(root: HTMLElement): void {
  clear(root);
  root.append(
    h('div', { class: 'stack-md' },
      summaryLine(),
      h('div', { class: 'grid-dash' },
        h('div', { class: 'stack-md' }, composer(root), recentNotes(root)),
        h('div', { class: 'stack-md' }, todayAgenda(root), todayChecklist(root)),
      ),
    ),
  );
}

const rerender = (): void => {
  const el = document.querySelector('.content') as HTMLElement | null;
  if (el) renderDashboard(el);
};

/* ------------------------------------------------------- ince özet satırı */

/** Dört büyük kutu yerine tek satır: bakınca geçilecek, dikkat çalmayacak. */
function summaryLine(): HTMLElement {
  const d = db();
  const rm = roadmapProgress();
  const byDay = new Map<string, number>();
  for (const s of d.sessions) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.minutes);
  const weekMin = sum(lastDays(7).map((dk) => byDay.get(dk) ?? 0));
  const watchedThisWeek = d.titles.filter((t) => t.watchedAt && new Date(t.watchedAt) >= weekStart()).length;
  const bestStreakVal = Math.max(0, ...d.habits.filter((hb) => !hb.archived).map((hb) => streak(habitDays(d.habitLogs, hb.id))));

  const cells: [string, string, string, () => void][] = [
    ['yol haritası', `%${rm.pct}`, 'var(--c-cyber)', () => navigate('cyber')],
    ['bu hafta siber', `${weekMin} dk`, 'var(--c-cyber)', () => navigate('cyber')],
    ['seri', `${bestStreakVal} gün`, 'var(--c-goals)', () => navigate('goals')],
    ['bu hafta izlenen', String(watchedThisWeek), 'var(--c-watch)', () => navigate('watch')],
  ];

  const row = h('div', { class: 'daybar' },
    h('div', { class: 'daybar__date', text: longDate() }),
  );
  for (const [label, value, color, go] of cells) {
    row.append(
      h('button', { class: 'daybar__cell', onclick: go },
        h('span', { class: 'daybar__value', style: { color }, text: value }),
        h('span', { class: 'daybar__label', text: label }),
      ),
    );
  }
  return row;
}

/* ------------------------------------------------------------- not yazma */

/**
 * Ana yazma alanı. Metnin içinde saat geçiyorsa ("21.30 spor") altta
 * "hatırlatıcı kur" düğmesi belirir — ayrı ekrana gitmeye gerek kalmaz.
 */
function composer(root: HTMLElement): HTMLElement {
  const ta = h('textarea', {
    class: 'composer__input',
    placeholder: 'Bugün aklında ne var? Yaz, Ctrl+Enter ile kaydet…',
  });

  const hint = h('div', { class: 'composer__parsed' });

  const saveNote = () => {
    const v = ta.value.trim();
    if (!v) return;
    addNoteToInbox(v);
    ta.value = '';
    clear(hint);
    toast('Gelen Kutusu\'na eklendi');
    renderDashboard(root);
  };

  const saveReminder = (at: string, text: string) => {
    addReminder(text, at);
    ta.value = '';
    clear(hint);
    toast(`Hatırlatıcı kuruldu · ${fmtDT(at)}`);
    renderDashboard(root);
  };

  const refreshHint = () => {
    clear(hint);
    const raw = ta.value.trim();
    if (!raw) return;
    const p = parseWhen(raw);
    if (!p.found) return;
    hint.append(
      h('span', { class: 'composer__parsedText', text: `⏰ ${fmtDT(p.at)} — "${p.text || raw}"` }),
      h('button', {
        class: 'mini-btn mini-btn--accent push',
        text: 'HATIRLATICI KUR',
        onclick: () => saveReminder(p.at, p.text || raw),
      }),
    );
  };

  ta.addEventListener('input', refreshHint);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveNote(); }
  });

  return h('div', { class: 'card card--view' },
    h('div', { class: 'card__head card__head--tint' },
      h('div', { class: 'card__title', text: 'Hızlı not' }),
      h('div', { class: 'sub-text push', text: 'Ctrl+Enter → Gelen Kutusu' }),
    ),
    h('div', { class: 'composer' },
      ta,
      hint,
      h('div', { class: 'composer__foot' },
        h('button', { class: 'mini-btn', text: 'NOTLARI AÇ', onclick: () => navigate('notes') }),
        h('button', { class: 'btn btn--primary push', text: 'Kaydet', onclick: saveNote }),
      ),
    ),
  );
}

/* ------------------------------------------------------------- son notlar */

function recentNotes(root: HTMLElement): HTMLElement {
  const notes = [...db().pages]
    .filter((p) => !p.archived)
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .slice(0, 6);

  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: 'Son notlar' }),
      h('button', { class: 'mini-btn push', text: 'HEPSİ', onclick: () => navigate('notes') }),
    ),
  );

  if (!notes.length) {
    card.append(h('div', { class: 'empty-state', text: 'Henüz sayfa yok. Yukarıdan yazmaya başla.' }));
    return card;
  }

  const grid = h('div', { class: 'note-cards' });
  for (const n of notes) {
    grid.append(
      h('button', {
        class: 'note-card',
        onclick: () => { openNote(n.id); navigate('notes'); },
      },
        h('div', { class: 'note-card__title ellipsis' },
          n.favorite ? h('span', { class: 'note-card__pin', text: '★ ' }) : null,
          `${n.icon || ''} ${n.title || 'Başlıksız'}`.trim(),
        ),
        h('div', { class: 'note-card__body', text: excerptOf(n) || 'boş' }),
        h('div', { class: 'note-card__foot' },
          h('span', { text: n.tags[0] ? `#${n.tags[0]}` : (n.category || 'etiketsiz') }),
          h('span', { class: 'push', text: shortDate(n.updatedAt.slice(0, 10)) }),
        ),
      ),
    );
  }
  card.append(grid);
  void root;
  return card;
}

/* ---------------------------------------------------------- bugün ajanda */

function todayAgenda(root: HTMLElement): HTMLElement {
  const today = dayKey();
  const rems = remindersOn(today);
  const evs = eventsOn(today);
  const late = overdue().filter((r) => r.at.slice(0, 10) < today);

  const card = h('div', { class: 'card card--agenda' },
    h('div', { class: 'card__head card__head--tint' },
      h('div', { class: 'card__title', text: 'Bugünün ajandası' }),
      h('button', { class: 'mini-btn push', text: 'TAKVİM', onclick: () => navigate('agenda') }),
    ),
  );

  const body = h('div', { class: 'card__body' });

  if (late.length) {
    body.append(
      h('div', { class: 'agenda-late' },
        h('span', { text: `${late.length} geciken hatırlatıcı` }),
        h('button', { class: 'mini-btn push', text: 'GÖSTER', onclick: () => navigate('agenda') }),
      ),
    );
  }

  for (const r of rems) {
    body.append(
      h('div', { class: `agenda-row${r.done ? ' is-done' : ''}` },
        h('button', {
          class: `checkbox${r.done ? ' is-on' : ''}`, text: r.done ? '✓' : '',
          onclick: () => { completeReminder(r.id); rerender(); },
        }),
        h('div', { class: 'agenda-row__time', text: fmtTime(r.at) }),
        h('div', { class: 'agenda-row__title ellipsis', text: r.title }),
        r.repeat !== 'none' ? h('span', { class: 'agenda-row__rep', text: '⟳' }) : null,
      ),
    );
  }

  for (const e of evs) {
    body.append(
      h('div', { class: 'agenda-row agenda-row--event' },
        h('div', { class: 'agenda-row__gdot' }),
        h('div', { class: 'agenda-row__time', text: e.allDay ? 'tüm gün' : fmtTime(e.start) }),
        h('div', { class: 'agenda-row__title ellipsis', text: e.title }),
      ),
    );
  }

  if (!rems.length && !evs.length && !late.length) {
    body.append(h('div', { class: 'empty-state', text: 'Bugün için bir şey yok.' }));
  }

  card.append(body);
  void root;
  return card;
}

/* -------------------------------------------------- bugün yapılacaklar */

/** Alışkanlıklar + yol haritasının ilk 3 açık görevi — tek kısa liste. */
function todayChecklist(root: HTMLElement): HTMLElement {
  const d = db();
  const today = dayKey();
  const active = d.habits.filter((hb) => !hb.archived);
  const done = active.filter((hb) => habitDays(d.habitLogs, hb.id).includes(today)).length;

  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: 'Bugün yapılacaklar' }),
      h('div', { class: 'sub-text push', text: `${done}/${active.length}` }),
    ),
  );
  const body = h('div', { class: 'card__body' });

  for (const hb of active) {
    const on = habitDays(d.habitLogs, hb.id).includes(today);
    body.append(
      h('button', { class: 'line-row', onclick: () => { toggleHabit(hb.id); renderDashboard(root); } },
        h('div', { class: `checkbox${on ? ' is-on' : ''}`, text: on ? '✓' : '' }),
        h('div', { class: on ? 'done-text' : '', style: { fontSize: 'var(--fs-13)' }, text: hb.name }),
        h('div', { class: 'sub-text push', text: `${streak(habitDays(d.habitLogs, hb.id))}g` }),
      ),
    );
  }

  const phases = [...d.phases].sort((a, b) => a.order - b.order);
  const open: { title: string; code: string; id: string }[] = [];
  for (const p of phases) {
    for (const t of d.tasks.filter((x) => x.phaseId === p.id && !x.done).sort((a, b) => a.order - b.order)) {
      open.push({ title: t.title, code: p.code, id: t.id });
      if (open.length >= 3) break;
    }
    if (open.length >= 3) break;
  }

  if (open.length) {
    body.append(h('div', { class: 'line-sep', text: 'yol haritası' }));
    for (const t of open) {
      body.append(
        h('button', {
          class: 'line-row',
          onclick: () => { completeRoadmapTask(t.id); renderDashboard(root); },
        },
          h('div', { class: 'checkbox' }),
          h('div', { style: { minWidth: '0' } },
            h('div', { class: 'ellipsis', style: { fontSize: 'var(--fs-13)' }, text: t.title }),
            h('div', { class: 'sub-text', text: t.code }),
          ),
        ),
      );
    }
  }

  if (!active.length && !open.length) {
    body.append(h('div', { class: 'empty-state', text: 'Liste boş.' }));
  }
  card.append(body);
  return card;
}

function completeRoadmapTask(id: string): void {
  store.update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (t) { t.done = true; t.doneAt = dayKey(); }
  });
  toast('Görev tamamlandı ✓');
}
