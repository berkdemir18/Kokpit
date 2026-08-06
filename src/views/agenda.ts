/**
 * Takvim & Hatırlatıcı ekranı.
 *
 * Sol: ay ızgarası (gün üzerinde hatırlatıcı/etkinlik noktaları).
 * Sağ: seçili günün listesi + hızlı hatırlatıcı ekleme + yaklaşanlar.
 *
 * Google Takvim salt-okunur gelir (gizli iCal adresi, Ayarlar'dan girilir);
 * hatırlatıcılar yereldir ve zamanı gelince Windows bildirimi gönderir.
 */

import { db, store } from '../core/store';
import { Reminder, REPEATS, REPEAT_LABEL, Repeat } from '../core/model';
import { h, clear } from '../ui/dom';
import { toast, confirmDialog, formModal } from '../ui/overlay';
import {
  dayKey, monthGrid, parseDay, shortDate, fmtTime, fmtDT, parseWhen, dtKey, longDate,
} from '../core/util';
import {
  addReminder, completeReminder, removeReminder, updateReminder,
  remindersOn, eventsOn, overdue, syncGoogleCalendar,
} from '../core/reminders';

const AY_UZUN = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const ui = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selected: dayKey(),
  syncing: false,
};

const rerender = (): void => {
  const el = document.querySelector('.content') as HTMLElement | null;
  if (el) renderAgenda(el);
};

export function renderAgenda(root: HTMLElement): void {
  clear(root);
  root.append(
    h('div', { class: 'grid-agenda' },
      h('div', { class: 'stack-md' }, calendarCard(), googleCard()),
      h('div', { class: 'stack-md' }, dayCard(), upcomingCard()),
    ),
  );
}

/* ------------------------------------------------------------- ay ızgarası */

function calendarCard(): HTMLElement {
  const days = monthGrid(ui.year, ui.month);
  const today = dayKey();

  const step = (delta: number) => {
    let m = ui.month + delta;
    let y = ui.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    ui.month = m; ui.year = y;
    rerender();
  };

  const head = h('div', { class: 'card__head card__head--tint' },
    h('button', { class: 'cal-nav', text: '‹', onclick: () => step(-1) }),
    h('div', { class: 'card__title', text: `${AY_UZUN[ui.month]} ${ui.year}` }),
    h('button', { class: 'cal-nav', text: '›', onclick: () => step(1) }),
    h('button', {
      class: 'mini-btn push', text: 'BUGÜN',
      onclick: () => {
        const now = new Date();
        ui.year = now.getFullYear(); ui.month = now.getMonth(); ui.selected = dayKey(now);
        rerender();
      },
    }),
  );

  const grid = h('div', { class: 'cal-grid' });
  for (const g of GUN_KISA) grid.append(h('div', { class: 'cal-dow', text: g }));

  for (const key of days) {
    const d = parseDay(key);
    const otherMonth = d.getMonth() !== ui.month;
    const rems = remindersOn(key);
    const evs = eventsOn(key);
    const openRems = rems.filter((r) => !r.done).length;

    const cell = h('button', {
      class: `cal-day${otherMonth ? ' is-out' : ''}${key === today ? ' is-today' : ''}${key === ui.selected ? ' is-selected' : ''}`,
      onclick: () => { ui.selected = key; rerender(); },
    },
      h('div', { class: 'cal-day__num', text: String(d.getDate()) }),
    );

    if (rems.length || evs.length) {
      const dots = h('div', { class: 'cal-day__dots' });
      if (openRems) dots.append(h('span', { class: 'cal-dot cal-dot--rem' }));
      else if (rems.length) dots.append(h('span', { class: 'cal-dot cal-dot--done' }));
      if (evs.length) dots.append(h('span', { class: 'cal-dot cal-dot--ev' }));
      cell.append(dots);
    }
    grid.append(cell);
  }

  return h('div', { class: 'card card--view' }, head, h('div', { class: 'cal-wrap' }, grid, legend()));
}

function legend(): HTMLElement {
  return h('div', { class: 'cal-legend' },
    h('span', { class: 'cal-dot cal-dot--rem' }), h('span', { text: 'hatırlatıcı' }),
    h('span', { class: 'cal-dot cal-dot--ev' }), h('span', { text: 'Google Takvim' }),
    h('span', { class: 'cal-dot cal-dot--done' }), h('span', { text: 'tamamlandı' }),
  );
}

/* ------------------------------------------------------------- gün paneli */

function dayCard(): HTMLElement {
  const key = ui.selected;
  const rems = remindersOn(key);
  const evs = eventsOn(key);
  const isToday = key === dayKey();

  const card = h('div', { class: 'card card--agenda' },
    h('div', { class: 'card__head card__head--tint' },
      h('div', { class: 'card__title', text: isToday ? 'Bugün' : longDate(parseDay(key)) }),
      h('div', { class: 'sub-text push', text: `${rems.length} hatırlatıcı · ${evs.length} etkinlik` }),
    ),
  );

  card.append(quickAdd(key));

  const body = h('div', { class: 'card__body' });

  if (isToday) {
    const late = overdue().filter((r) => r.at.slice(0, 10) < key);
    if (late.length) {
      body.append(h('div', { class: 'line-sep line-sep--warn', text: `geciken · ${late.length}` }));
      for (const r of late) body.append(reminderRow(r, true));
    }
  }

  for (const r of rems) body.append(reminderRow(r, false));

  for (const e of evs) {
    body.append(
      h('div', { class: 'agenda-row agenda-row--event' },
        h('div', { class: 'agenda-row__gdot' }),
        h('div', { class: 'agenda-row__time', text: e.allDay ? 'tüm gün' : fmtTime(e.start) }),
        h('div', { style: { minWidth: '0' } },
          h('div', { class: 'agenda-row__title ellipsis', text: e.title }),
          e.location ? h('div', { class: 'sub-text ellipsis', text: e.location }) : null,
        ),
        h('span', { class: 'agenda-row__src push', text: 'GOOGLE' }),
      ),
    );
  }

  if (!rems.length && !evs.length) {
    body.append(h('div', { class: 'empty-state', text: 'Bu gün boş. Yukarıdan hatırlatıcı ekleyebilirsin.' }));
  }

  card.append(body);
  return card;
}

/** Tek satırda hatırlatıcı ekleme: "21.30 anneme telefon" yazıp Enter. */
function quickAdd(day: string): HTMLElement {
  const input = h('input', {
    class: 'agenda-add__input',
    placeholder: 'ör: 21.30 anneme telefon — Enter ile ekle',
  });
  const preview = h('div', { class: 'agenda-add__preview' });

  /**
   * Metinde gün geçiyorsa ("yarın 14:00") ona uyulur; yalnız saat yazıldıysa
   * takvimde SEÇİLİ gün kullanılır — 12 Ağustos seçiliyken "21.30 x" yazınca
   * hatırlatıcı 12 Ağustos 21:30'a kurulur.
   */
  const resolve = (raw: string): string => {
    const p = parseWhen(raw);
    if (p.hasDay) return p.at;
    return `${day}T${p.hasTime ? p.at.slice(11) : '09:00'}`;
  };

  const refresh = () => {
    const raw = input.value.trim();
    if (!raw) { preview.textContent = ''; return; }
    preview.textContent = `⏰ ${fmtDT(resolve(raw))}`;
  };

  const submit = () => {
    const raw = input.value.trim();
    if (!raw) return;
    const p = parseWhen(raw);
    const at = resolve(raw);
    addReminder(p.text || raw, at);
    input.value = '';
    preview.textContent = '';
    toast(`Hatırlatıcı kuruldu · ${fmtDT(at)}`);
    rerender();
  };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  return h('div', { class: 'agenda-add' },
    h('span', { class: 'agenda-add__icon', text: '＋' }),
    input,
    preview,
    h('button', { class: 'mini-btn', text: 'DETAYLI', onclick: () => void openReminderForm(day) }),
  );
}

function reminderRow(r: Reminder, late: boolean): HTMLElement {
  return h('div', { class: `agenda-row${r.done ? ' is-done' : ''}${late ? ' is-late' : ''}` },
    h('button', {
      class: `checkbox${r.done ? ' is-on' : ''}`, text: r.done ? '✓' : '',
      onclick: () => { completeReminder(r.id); rerender(); },
    }),
    h('div', { class: 'agenda-row__time', text: fmtTime(r.at) }),
    h('button', {
      class: 'agenda-row__main',
      onclick: () => void openReminderForm(r.at.slice(0, 10), r),
    },
      h('div', { class: 'agenda-row__title ellipsis', text: r.title }),
      r.note ? h('div', { class: 'sub-text ellipsis', text: r.note }) : null,
    ),
    r.repeat !== 'none' ? h('span', { class: 'agenda-row__rep', title: REPEAT_LABEL[r.repeat], text: '⟳' }) : null,
    late ? h('span', { class: 'agenda-row__late', text: shortDate(r.at.slice(0, 10)) }) : null,
    h('button', {
      class: 'agenda-row__del', text: '×', title: 'sil',
      onclick: () => void removeWithConfirm(r),
    }),
  );
}

async function removeWithConfirm(r: Reminder): Promise<void> {
  const ok = await confirmDialog(`"${r.title}" hatırlatıcısı silinsin mi?`, 'Hatırlatıcıyı sil');
  if (!ok) return;
  removeReminder(r.id);
  toast('Hatırlatıcı silindi');
  rerender();
}

async function openReminderForm(day: string, r?: Reminder): Promise<void> {
  const res = await formModal({
    title: r ? 'Hatırlatıcıyı düzenle' : 'Yeni hatırlatıcı',
    meta: 'zamanı gelince Windows bildirimi gelir',
    wide: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Ne hatırlatılacak', value: r?.title ?? '', span: 2 },
      { kind: 'datetime', key: 'at', label: 'Tarih & saat', value: r?.at ?? `${day}T21:30` },
      {
        kind: 'select', key: 'repeat', label: 'Tekrar', value: r?.repeat ?? 'none',
        options: REPEATS.map((x) => [x, REPEAT_LABEL[x]] as [string, string]),
      },
      { kind: 'textarea', key: 'note', label: 'Not (opsiyonel)', value: r?.note ?? '', span: 2, rows: 2 },
    ],
    saveLabel: r ? 'Güncelle' : 'Kur',
    onDelete: r ? () => { removeReminder(r.id); toast('Hatırlatıcı silindi'); rerender(); } : undefined,
  });
  if (!res) return;
  if (!res.title.trim()) { toast('Başlık boş olamaz'); return; }
  const at = res.at || `${day}T09:00`;
  if (r) {
    updateReminder(r.id, { title: res.title.trim(), at, repeat: res.repeat as Repeat, note: res.note, notified: false });
    toast('Hatırlatıcı güncellendi');
  } else {
    addReminder(res.title.trim(), at, res.repeat as Repeat, res.note);
    toast(`Hatırlatıcı kuruldu · ${fmtDT(at)}`);
  }
  ui.selected = at.slice(0, 10);
  rerender();
}

/* ----------------------------------------------------------- yaklaşanlar */

function upcomingCard(): HTMLElement {
  const now = dtKey();
  const next = db().reminders
    .filter((r) => !r.done && r.at >= now)
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(0, 8);

  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: 'Yaklaşanlar' }),
      h('div', { class: 'sub-text push', text: `${next.length} kayıt` }),
    ),
  );
  const body = h('div', { class: 'card__body' });
  for (const r of next) {
    body.append(
      h('button', {
        class: 'line-row',
        onclick: () => { ui.selected = r.at.slice(0, 10); const d = parseDay(ui.selected); ui.year = d.getFullYear(); ui.month = d.getMonth(); rerender(); },
      },
        h('div', { class: 'agenda-row__time', text: fmtTime(r.at) }),
        h('div', { class: 'ellipsis', style: { fontSize: 'var(--fs-13)' }, text: r.title }),
        h('div', { class: 'sub-text push', text: fmtDT(r.at) }),
      ),
    );
  }
  if (!next.length) body.append(h('div', { class: 'empty-state', text: 'Yaklaşan hatırlatıcı yok.' }));
  card.append(body);
  return card;
}

/* --------------------------------------------------------- Google Takvim */

function googleCard(): HTMLElement {
  const s = db().settings;
  const has = !!s.icsUrl.trim();

  const card = h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: 'Google Takvim' }),
      h('div', { class: 'sub-text push', text: has ? (s.icsSyncedAt ? `son eşitleme ${new Date(s.icsSyncedAt).toLocaleString('tr-TR')}` : 'hiç eşitlenmedi') : 'bağlı değil' }),
    ),
  );

  const body = h('div', { style: { padding: '13px 16px' } });

  if (!has) {
    body.append(
      h('div', { class: 'gcal-help' },
        'Google Takvim → sol menüden takvimin üstüne gel → ⋮ → ',
        h('b', { text: 'Ayarlar ve paylaşım' }),
        ' → en altta ',
        h('b', { text: 'Gizli adres (iCal biçiminde)' }),
        ' → adresi kopyala ve aşağıya yapıştır. Etkinlikler Kokpit\'e gelir; Kokpit Google\'a bir şey yazmaz.',
      ),
    );
  }

  const input = h('input', {
    class: 'field__input',
    style: { marginTop: '10px' },
    value: s.icsUrl,
    placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics',
  });

  const syncBtn = h('button', {
    class: 'btn btn--primary',
    text: ui.syncing ? 'Eşitleniyor…' : 'Kaydet ve eşitle',
    disabled: ui.syncing,
    onclick: async () => {
      store.update((d) => { d.settings.icsUrl = input.value.trim(); });
      if (!input.value.trim()) { toast('Adres temizlendi'); rerender(); return; }
      ui.syncing = true;
      rerender();
      try {
        const sum = await syncGoogleCalendar();
        toast(`${sum.kept} etkinlik alındı · ${sum.calendar}`);
      } catch (err) {
        toast(`Takvim hatası: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        ui.syncing = false;
        rerender();
      }
    },
  });

  body.append(input, h('div', { class: 'row', style: { gap: '8px', marginTop: '10px' } },
    syncBtn,
    has ? h('button', {
      class: 'btn push', text: 'Etkinlikleri temizle',
      onclick: async () => {
        if (!(await confirmDialog('Alınan takvim etkinlikleri silinsin mi?', 'Etkinlikleri temizle'))) return;
        store.update((d) => { d.events = []; });
        toast('Etkinlikler temizlendi');
        rerender();
      },
    }) : null,
  ));

  card.append(body);
  return card;
}

/** Komut paletinden yeni hatırlatıcı. */
export function openReminderQuick(): void {
  void openReminderForm(ui.selected);
}
