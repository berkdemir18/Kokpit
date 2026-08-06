/** Hedefler & Alışkanlıklar modülü. */

import { store, db } from '../core/store';
import { Habit, Goal, Milestone, Cadence } from '../core/model';
import { h, clear, bar } from '../ui/dom';
import { formModal, toast, confirmDialog } from '../ui/overlay';
import {
  uid, nowISO, dayKey, lastDays, streak, bestStreak, habitDays,
  daysBetween, weekStart,
} from '../core/util';

const HEAT_VARS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function renderGoals(root: HTMLElement): void {
  clear(root);
  root.append(
    h('div', { class: 'grid-goals' },
      habitColumn(root),
      goalColumn(root),
    ),
  );
}

/* ------------------------------------------------------------ alışkanlık */

export function toggleHabit(id: string, day = dayKey()): boolean {
  let on = false;
  store.update((d) => {
    const arr = d.habitLogs[id] ?? (d.habitLogs[id] = []);
    const i = arr.indexOf(day);
    if (i >= 0) { arr.splice(i, 1); on = false; }
    else { arr.push(day); on = true; }
  });
  return on;
}

function habitRate(id: string): number {
  const days = habitDays(db().habitLogs, id);
  const recent = lastDays(28);
  const hit = recent.filter((d) => days.includes(d)).length;
  return Math.round((hit / 28) * 100);
}

function habitColumn(root: HTMLElement): HTMLElement {
  const d = db();
  const col = h('div', { class: 'stack-sm' });
  col.append(
    h('div', { class: 'row' },
      h('div', { class: 'section-label', text: 'Alışkanlıklar' }),
      h('button', { class: 'mini-btn push', text: '+ EKLE', onclick: () => void openHabit(root) }),
    ),
  );
  const active = d.habits.filter((hb) => !hb.archived);
  if (!active.length) col.append(h('div', { class: 'card' }, h('div', { class: 'empty-state', text: 'Alışkanlık yok.' })));
  for (const hb of active) col.append(habitCard(hb, root));
  return col;
}

function habitCard(hb: Habit, root: HTMLElement): HTMLElement {
  const days = habitDays(db().habitLogs, hb.id);
  const today = dayKey();
  const on = days.includes(today);
  const cur = streak(days);
  const best = bestStreak(days);
  const rate = habitRate(hb.id);

  const check = h('button', {
    class: `checkbox checkbox--lg${on ? ' is-on' : ''}`,
    text: on ? '✓' : '',
    onclick: () => {
      toggleHabit(hb.id);
      renderGoals(root);
    },
  });

  const heat = h('div', { class: 'heatmap heatmap--sm' });
  for (const dk of lastDays(91)) {
    heat.append(h('div', { class: 'heatmap__cell', title: dk, style: { background: days.includes(dk) ? HEAT_VARS[3] : HEAT_VARS[0] } }));
  }

  return h('div', { class: 'card card--pad' },
    h('div', { class: 'row', style: { gap: '10px', marginBottom: '12px' } },
      check,
      h('button', { style: { fontSize: '13.5px', fontWeight: '600', background: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }, text: hb.name, onclick: () => void openHabit(root, hb) }),
      h('div', { class: 'pill', text: hb.cadence }),
      h('div', { class: 'row push', style: { gap: '16px', fontSize: '10.5px', color: 'var(--dim-3)', fontFamily: 'var(--font-mono)' } },
        h('div', {}, 'mevcut ', h('span', { style: { color: 'var(--warn)', fontWeight: '600' }, text: `${cur}g` })),
        h('div', {}, 'en uzun ', h('span', { style: { color: 'var(--text)', fontWeight: '600' }, text: `${best}g` })),
        h('div', { text: `${rate}%` }),
      ),
    ),
    heat,
  );
}

async function openHabit(root: HTMLElement, hb?: Habit): Promise<void> {
  const res = await formModal({
    title: hb ? 'Alışkanlığı düzenle' : 'Yeni alışkanlık',
    fields: [
      { kind: 'text', key: 'name', label: 'Ad', value: hb?.name ?? '', span: 2 },
      { kind: 'select', key: 'cadence', label: 'Sıklık', value: hb?.cadence ?? 'günlük', options: [['günlük', 'Günlük'], ['haftalık', 'Haftalık']] },
      { kind: 'number', key: 'targetPerWeek', label: 'Haftalık hedef', value: String(hb?.targetPerWeek ?? 7), min: '1', max: '7' },
    ],
    saveLabel: hb ? 'Güncelle' : 'Ekle',
    onDelete: hb ? () => void removeHabit(hb, root) : undefined,
  });
  if (!res) return;
  if (!res.name.trim()) { toast('Ad boş olamaz'); return; }
  store.update((d) => {
    if (hb) {
      const x = d.habits.find((y) => y.id === hb.id);
      if (x) Object.assign(x, { name: res.name.trim(), cadence: res.cadence as Cadence, targetPerWeek: Number(res.targetPerWeek) || 7 });
    } else {
      const id = uid('h');
      d.habits.push({ id, name: res.name.trim(), cadence: res.cadence as Cadence, targetPerWeek: Number(res.targetPerWeek) || 7, archived: false, createdAt: nowISO() });
      d.habitLogs[id] = [];
    }
  });
  toast(hb ? 'Alışkanlık güncellendi' : 'Alışkanlık eklendi');
  renderGoals(root);
}

async function removeHabit(hb: Habit, root: HTMLElement): Promise<void> {
  if (!(await confirmDialog(`"${hb.name}" silinsin mi? Geçmiş de silinir.`, 'Alışkanlığı sil'))) return;
  store.update((d) => { d.habits = d.habits.filter((x) => x.id !== hb.id); delete d.habitLogs[hb.id]; });
  toast('Alışkanlık silindi');
  renderGoals(root);
}

/* ---------------------------------------------------------------- hedef */

function goalProgress(g: Goal): number {
  if (!g.milestones.length) return g.status === 'done' ? 100 : 0;
  return Math.round((g.milestones.filter((m) => m.done).length / g.milestones.length) * 100);
}

function goalColumn(root: HTMLElement): HTMLElement {
  const d = db();
  const col = h('div', { class: 'stack-sm' });
  col.append(
    h('div', { class: 'row' },
      h('div', { class: 'section-label', text: 'Hedefler' }),
      h('button', { class: 'mini-btn push', text: '+ EKLE', onclick: () => void openGoal(root) }),
    ),
  );
  const open = d.goals.filter((g) => g.status !== 'done' && g.status !== 'dropped');
  if (!open.length) col.append(h('div', { class: 'card' }, h('div', { class: 'empty-state', text: 'Açık hedef yok.' })));
  for (const g of open) col.append(goalCard(g, root));
  col.append(weekSummaryCard());
  return col;
}

function goalCard(g: Goal, root: HTMLElement): HTMLElement {
  const prog = goalProgress(g);
  let dueText = 'tarih yok';
  let dueColor = 'var(--dim-3)';
  if (g.targetDate) {
    const left = daysBetween(dayKey(), g.targetDate);
    if (left < 0) { dueText = `${-left} gün geçti`; dueColor = 'var(--danger)'; }
    else if (left <= 30) { dueText = `${left} gün kaldı`; dueColor = 'var(--warn)'; }
    else { dueText = `${left} gün kaldı`; }
  }

  const card = h('div', { class: 'card card--pad' },
    h('div', { class: 'row', style: { gap: '10px', alignItems: 'baseline' } },
      h('button', { style: { fontSize: '13.5px', fontWeight: '600', background: 'none', cursor: 'pointer', color: 'var(--text)' }, text: g.title, onclick: () => void openGoal(root, g) }),
      h('div', { class: 'mono push', style: { fontSize: '10px', color: dueColor }, text: dueText }),
    ),
    h('div', { class: 'row', style: { gap: '10px', margin: '11px 0 12px' } },
      h('div', { style: { flex: '1' } }, bar(prog, 'var(--accent)', 'bar--5')),
      h('div', { class: 'mono', style: { fontSize: '11px', fontWeight: '600', color: 'var(--text)' }, text: `${prog}%` }),
    ),
  );
  const msWrap = h('div', { class: 'col', style: { gap: '6px' } });
  g.milestones.forEach((m, i) => {
    msWrap.append(
      h('button', { class: 'row', style: { gap: '9px', background: 'none', cursor: 'pointer', textAlign: 'left' }, onclick: () => { toggleMilestone(g.id, i); renderGoals(root); } },
        h('div', { class: `checkbox checkbox--sm${m.done ? ' is-on' : ''}`, text: m.done ? '✓' : '' }),
        h('div', { style: { fontSize: '12.5px', color: m.done ? 'var(--dim)' : 'var(--text-2)', textDecoration: m.done ? 'line-through' : 'none' }, text: m.text }),
      ),
    );
  });
  card.append(msWrap);
  return card;
}

function toggleMilestone(goalId: string, idx: number): void {
  store.update((d) => {
    const g = d.goals.find((x) => x.id === goalId);
    if (g && g.milestones[idx]) { g.milestones[idx].done = !g.milestones[idx].done; g.updatedAt = nowISO(); }
  });
}

function weekSummaryCard(): HTMLElement {
  // Bu haftanın her günü: kaç alışkanlık tamamlandı (hedef = aktif alışkanlık sayısı).
  const d = db();
  const live = d.habits.filter((x) => !x.archived);
  const start = weekStart();
  const byDay = new Map<string, number>();
  for (const hb of live) for (const day of habitDays(d.habitLogs, hb.id)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  const target = live.length;
  const maxH = 76;
  const maxVal = Math.max(target, ...DAYS.map((_, i) => byDay.get(dayKey(new Date(start.getTime() + i * 86400000))) ?? 0), 1);

  const chart = h('div', { class: 'chart', style: { height: '96px', gap: '10px' } });
  DAYS.forEach((label, i) => {
    const dk = dayKey(new Date(start.getTime() + i * 86400000));
    const val = byDay.get(dk) ?? 0;
    const barH = Math.round((val / maxVal) * maxH);
    const targetH = Math.round((target / maxVal) * maxH);
    chart.append(
      h('div', { class: 'chart__col' },
        h('div', { style: { width: '100%', height: `${maxH}px`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative' } },
          h('div', { style: { position: 'absolute', left: '10%', right: '10%', bottom: `${targetH}px`, height: '1px', background: 'var(--border-strong)' } }),
          h('div', { style: { width: '60%', height: `${barH}px`, background: val >= target && target > 0 ? 'var(--success)' : 'var(--accent)', borderRadius: '2px 2px 0 0' }, title: `${val} alışkanlık` }),
        ),
        h('div', { class: 'chart__label', text: label }),
      ),
    );
  });

  return h('div', { class: 'card card--pad' },
    h('div', { class: 'card__title', style: { marginBottom: '14px' }, text: 'Haftalık özet · hedef vs gerçekleşen' }),
    chart,
  );
}

async function openGoal(root: HTMLElement, g?: Goal): Promise<void> {
  const res = await formModal({
    title: g ? 'Hedefi düzenle' : 'Yeni hedef',
    wide: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Başlık', value: g?.title ?? '', span: 2 },
      { kind: 'text', key: 'area', label: 'Alan', value: g?.area ?? 'genel' },
      { kind: 'date', key: 'targetDate', label: 'Hedef tarih', value: g?.targetDate ?? '' },
      { kind: 'textarea', key: 'milestones', label: 'Kilometre taşları (her satır bir madde; başına ✓ koyarsan tamamlanmış sayılır)', value: (g?.milestones ?? []).map((m) => (m.done ? '✓ ' : '') + m.text).join('\n'), span: 2, rows: 5 },
    ],
    saveLabel: g ? 'Güncelle' : 'Ekle',
    onDelete: g ? async () => { if (!(await confirmDialog(`"${g.title}" hedefi silinsin mi?`, 'Hedefi sil'))) return; store.update((d) => { d.goals = d.goals.filter((x) => x.id !== g.id); }); toast('Hedef silindi'); renderGoals(root); } : undefined,
  });
  if (!res) return;
  if (!res.title.trim()) { toast('Başlık boş olamaz'); return; }
  const milestones: Milestone[] = res.milestones.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const done = l.startsWith('✓');
    return { text: l.replace(/^✓\s*/, ''), done };
  });
  const now = nowISO();
  store.update((d) => {
    if (g) {
      const x = d.goals.find((y) => y.id === g.id);
      if (x) Object.assign(x, { title: res.title.trim(), area: res.area, targetDate: res.targetDate, milestones, updatedAt: now });
    } else {
      d.goals.unshift({ id: uid('g'), title: res.title.trim(), area: res.area, targetDate: res.targetDate, milestones, status: 'active', note: '', createdAt: now, updatedAt: now });
    }
  });
  toast(g ? 'Hedef güncellendi' : 'Hedef eklendi');
  renderGoals(root);
}
