/** Siber güvenlik modülü — SOC yol haritası, kaynaklar, lab günlüğü, komut defteri. */

import { store, db } from '../core/store';
import {
  Phase, RoadmapTask, Resource, LabEntry, Snippet,
  Area, AREAS, Status, ResourceKind, Platform, Difficulty,
  RESOURCE_STATUS_LABEL,
} from '../core/model';
import { h, clear, bar } from '../ui/dom';
import { formModal, toast, confirmDialog } from '../ui/overlay';
import { highlight, LANGUAGES } from '../core/highlight';
import {
  uid, nowISO, dayKey, shortDate, fmtNum, fmtDuration, splitList,
  lastDays, heatLevel, sum,
} from '../core/util';

type CyberTab = 'roadmap' | 'resources' | 'labs' | 'snippets';
const ui = {
  tab: 'roadmap' as CyberTab,
  openPhases: new Set<string>(),
  heatOpen: false,
  initialized: false,
};

const HEAT_VARS = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const DIFF_COLOR: Record<Difficulty, string> = {
  Kolay: 'var(--success)', Orta: 'var(--warn)', Zor: 'var(--danger)', Insane: 'var(--pink)',
};
const RES_STATUS_COLOR: Record<Status, string> = {
  done: 'var(--success)', active: 'var(--accent)', planned: 'var(--dim)', dropped: 'var(--danger)',
};
/**
 * Hızlı yakalamadan gelen görevler bu etiketi taşır. Etiket sayesinde görev
 * hem yol haritasında yerini alır hem de üstteki "Yakalananlar" kutusunda
 * görünür — eskiden 37 görevlik kapalı bir faz kartının en altına ekleniyor,
 * Berk eklediği görevi bir daha bulamıyordu (2026-08-05).
 */
export const CAPTURE_TAG = 'YAKALANAN';

const TAG_COLOR: Record<string, string> = {
  'YAKALANAN': 'var(--c-notes)',
  'ÜCRETSİZ': 'var(--success)',
  'KRİTİK': 'var(--danger)',
  'EN ÖNCELİKLİ': 'var(--danger)',
  'EN DEĞERLİ İŞ': 'var(--warn)',
  'EN ETKİLİ': 'var(--warn)',
  'ALIŞKANLIK': 'var(--accent)',
};

export function renderCyber(root: HTMLElement): void {
  clear(root);

  // İlk açılışta: tamamlanmamış ilk fazı açık göster.
  if (!ui.initialized) {
    ui.initialized = true;
    const next = nextPhase();
    if (next) ui.openPhases.add(next.id);
  }

  const wrap = h('div', { class: 'stack-md' });
  wrap.append(studyStrip());
  wrap.append(tabBar(root));
  switch (ui.tab) {
    case 'roadmap': wrap.append(roadmap(root)); break;
    case 'resources': wrap.append(resources(root)); break;
    case 'labs': wrap.append(labs(root)); break;
    case 'snippets': wrap.append(snippets(root)); break;
  }
  root.append(wrap);
}

/* -------------------------------------------------- çalışma şeridi (katlanır) */

function minutesByDay(): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of db().sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.minutes);
  return m;
}

function studyStreak(byDay: Map<string, number>): number {
  let n = 0;
  const cursor = new Date();
  if (!(byDay.get(dayKey(cursor)) ?? 0)) cursor.setDate(cursor.getDate() - 1);
  while (byDay.get(dayKey(cursor)) ?? 0) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

/** Tek satır çalışma özeti; heatmap istenirse açılır. */
function studyStrip(): HTMLElement {
  const byDay = minutesByDay();
  const weekMin = sum(lastDays(7).map((d) => byDay.get(d) ?? 0));
  const stk = studyStreak(byDay);
  const target = db().settings.weeklyStudyTarget || 450;

  const head = h('div', { class: 'row', style: { gap: '18px', padding: '13px 16px' } },
    h('div', { class: 'strip-stat' }, 'bu hafta ', h('b', { text: `${fmtNum(weekMin)} dk` }),
      h('span', { class: 'strip-stat__sub', text: ` / ${fmtNum(target)}` })),
    h('div', { class: 'strip-stat' }, 'seri ', h('b', { style: { color: 'var(--warn)' }, text: `${stk} gün` })),
    h('div', { class: 'row push', style: { gap: '8px' } },
      h('button', { class: 'mini-btn', text: '+ ÇALIŞMA EKLE', onclick: () => void logSession() }),
      h('button', {
        class: 'mini-btn',
        text: ui.heatOpen ? 'HARİTAYI GİZLE' : 'HARİTAYI GÖSTER',
        onclick: () => { ui.heatOpen = !ui.heatOpen; renderCyber(document.querySelector('.content') as HTMLElement); },
      }),
    ),
  );

  const card = h('div', { class: 'card' }, head);
  if (!ui.heatOpen) return card;

  const days = lastDays(364);
  const max = Math.max(60, ...byDay.values());
  const grid = h('div', { class: 'heatmap' });
  for (const d of days) {
    const v = byDay.get(d) ?? 0;
    grid.append(h('div', {
      class: 'heatmap__cell',
      title: v ? `${d} · ${v} dk` : d,
      style: { background: HEAT_VARS[heatLevel(v, max)] },
    }));
  }
  const yearTotal = sum([...byDay.values()]);
  card.append(
    h('div', { style: { padding: '0 16px 16px' } },
      grid,
      h('div', { class: 'heat-legend' },
        h('div', { text: `son 12 ay · toplam ${fmtNum(yearTotal)} dk` }),
      ),
    ),
  );
  return card;
}

async function logSession(): Promise<void> {
  const res = await formModal({
    title: 'Çalışma ekle',
    fields: [
      { kind: 'number', key: 'minutes', label: 'Dakika', value: '90', min: '1' },
      { kind: 'select', key: 'area', label: 'Alan', value: 'linux', options: AREAS.map((a) => [a, a]) },
      { kind: 'date', key: 'date', label: 'Tarih', value: dayKey() },
      { kind: 'text', key: 'note', label: 'Ne çalıştın?', value: '' },
    ],
    saveLabel: 'Ekle',
  });
  if (!res) return;
  const minutes = Number(res.minutes) || 0;
  if (minutes <= 0) { toast('Dakika 0 olamaz'); return; }
  store.update((d) => {
    d.sessions.push({
      id: uid('ss'), date: res.date || dayKey(),
      minutes, area: (res.area as Area) || 'linux', note: res.note,
    });
  });
  toast(`${minutes} dk çalışma eklendi`);
  renderCyber(document.querySelector('.content') as HTMLElement);
}

/* ------------------------------------------------------------- sekmeler */

function tabBar(root: HTMLElement): HTMLElement {
  const d = db();
  const defs: [CyberTab, string, number][] = [
    ['roadmap', 'Yol Haritası', d.tasks.filter((t) => !t.done).length],
    ['resources', 'Kaynaklar', d.resources.length],
    ['labs', 'Lab Günlüğü', d.labs.length],
    ['snippets', 'Komut Defteri', d.snippets.length],
  ];
  const tabs = h('div', { class: 'tabs' });
  for (const [id, label, count] of defs) {
    tabs.append(
      h('button', {
        class: `tabs__item${ui.tab === id ? ' is-active' : ''}`,
        onclick: () => { ui.tab = id; renderCyber(root); },
      }, label, count ? h('span', { class: 'segmented__count', text: String(count) }) : null),
    );
  }
  return h('div', { class: 'row', style: { gap: '10px' } }, tabs);
}

/* --------------------------------------------------------------- roadmap */

function phaseTasks(phaseId: string): RoadmapTask[] {
  return db().tasks.filter((t) => t.phaseId === phaseId).sort((a, b) => a.order - b.order);
}

function phaseProgress(phaseId: string): { done: number; total: number; pct: number } {
  const ts = phaseTasks(phaseId);
  const done = ts.filter((t) => t.done).length;
  return { done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
}

/** İlk tamamlanmamış faz. */
function nextPhase(): Phase | undefined {
  const ps = [...db().phases].sort((a, b) => a.order - b.order);
  return ps.find((p) => phaseProgress(p.id).pct < 100) ?? ps[0];
}

export function roadmapProgress(): { done: number; total: number; pct: number } {
  const ts = db().tasks;
  const done = ts.filter((t) => t.done).length;
  return { done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
}

function roadmap(root: HTMLElement): HTMLElement {
  const d = db();
  const phases = [...d.phases].sort((a, b) => a.order - b.order);
  if (!phases.length) {
    return h('div', { class: 'card' },
      h('div', { class: 'empty-state' },
        h('div', { text: 'Yol haritası boş.' }),
        h('div', { class: 'empty-state__hint', text: 'Ayarlar → "Tüm veriyi sıfırla" ile SOC yol haritası geri yüklenir.' }),
      ));
  }

  const total = roadmapProgress();
  const current = nextPhase();

  const header = h('div', { class: 'card card--pad' },
    h('div', { class: 'row', style: { gap: '12px', marginBottom: '12px' } },
      h('div', {},
        h('div', { class: 'card__title', text: 'SOC Analisti yol haritası' }),
        current
          ? h('div', { class: 'sub-text', text: `şu an: ${current.code} · ${current.when}` })
          : null,
      ),
      h('div', { class: 'push', style: { textAlign: 'right' } },
        h('div', { style: { fontSize: 'var(--fs-26)', fontWeight: '600', lineHeight: '1' }, text: `${total.pct}%` }),
        h('div', { class: 'sub-text', text: `${total.done} / ${total.total} görev` }),
      ),
    ),
    bar(total.pct, 'var(--accent)', 'bar--5'),
  );

  const list = h('div', { class: 'stack-sm' });
  for (const p of phases) list.append(phaseCard(p, root));

  return h('div', { class: 'stack-sm' }, header, captureInbox(root), list);
}

function phaseCard(p: Phase, root: HTMLElement): HTMLElement {
  const prog = phaseProgress(p.id);
  const open = ui.openPhases.has(p.id);
  const complete = prog.pct === 100 && prog.total > 0;

  const head = h('button', {
    class: `phase-head${open ? ' is-open' : ''}`,
    onclick: () => {
      if (open) ui.openPhases.delete(p.id);
      else ui.openPhases.add(p.id);
      renderCyber(root);
    },
  },
    h('div', { class: 'phase-head__chevron', text: open ? '▾' : '▸' }),
    h('div', { class: 'phase-head__code', style: complete ? { color: 'var(--success)', borderColor: 'var(--success)' } : {}, text: p.code }),
    h('div', { class: 'phase-head__main' },
      h('div', { class: 'phase-head__title', text: p.title }),
      p.when ? h('div', { class: 'sub-text', text: p.when }) : null,
    ),
    h('div', { class: 'phase-head__prog' },
      h('div', { class: 'sub-text', style: { textAlign: 'right', marginBottom: '4px' }, text: `${prog.done}/${prog.total}` }),
      bar(prog.pct, complete ? 'var(--success)' : 'var(--accent)', 'bar--4'),
    ),
  );

  const card = h('div', { class: 'card' }, head);
  if (!open) return card;

  const body = h('div', { class: 'phase-body' });
  if (p.goal) body.append(h('div', { class: 'phase-goal', text: p.goal }));
  for (const t of phaseTasks(p.id)) body.append(taskRow(t, root));
  body.append(
    h('button', {
      class: 'mini-btn', style: { margin: '10px 16px 14px' },
      text: '+ GÖREV EKLE', onclick: () => void openTask(root, p.id),
    }),
  );
  card.append(body);
  return card;
}

/** Not kutusu açık olan görevler (yeniden çizimde açık kalsınlar). */
const openNotes = new Set<string>();

function taskRow(t: RoadmapTask, root: HTMLElement): HTMLElement {
  const main = h('div', { class: 'task-row__main' },
    h('div', { class: 'task-row__head' },
      t.when ? h('span', { class: 'task-row__when', text: t.when }) : null,
      h('span', { class: 'task-row__title', text: t.title }),
      ...t.tags.map((tag) =>
        h('span', { class: 'task-tag', style: { color: TAG_COLOR[tag] ?? 'var(--dim)' }, text: tag })),
    ),
  );

  main.append(noteArea(t, root));

  return h('div', { class: `task-row${t.done ? ' is-done' : ''}` },
    h('button', {
      class: `checkbox${t.done ? ' is-on' : ''}`,
      text: t.done ? '✓' : '',
      onclick: () => toggleTask(t.id, root),
    }),
    main,
    h('button', {
      class: 'task-row__edit', text: '⋯', title: 'düzenle',
      onclick: () => void openTask(root, t.phaseId, t),
    }),
  );
}

/**
 * Görevin altındaki not alanı. Kapalıyken mevcut nota (yoksa "+ not")
 * tıklanır, açılınca satır içi yazılır ve sessizce kaydedilir — yazarken
 * ekran yeniden çizilmediği için imleç kaçmaz.
 */
function noteArea(t: RoadmapTask, root: HTMLElement): HTMLElement {
  if (!openNotes.has(t.id)) {
    return h('button', {
      class: t.note ? 'task-row__note' : 'task-row__addnote',
      title: 'notu düzenle',
      text: t.note || '+ not ekle',
      onclick: () => { openNotes.add(t.id); renderCyber(root); },
    });
  }

  const ta = h('textarea', {
    class: 'task-note-input',
    rows: 3,
    value: t.note,
    placeholder: 'bu görevle ilgili notun… (komut, link, nerede kaldın)',
  });

  const save = () => {
    store.updateQuiet((d) => {
      const x = d.tasks.find((y) => y.id === t.id);
      if (x && x.note !== ta.value) x.note = ta.value;
    });
  };

  let timer: number | null = null;
  ta.addEventListener('input', () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(save, 400);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); save(); openNotes.delete(t.id); renderCyber(root); }
  });

  const wrap = h('div', { class: 'task-note' },
    ta,
    h('div', { class: 'task-note__foot' },
      h('div', { class: 'sub-text', text: 'yazdıkça kaydedilir · Esc kapat' }),
      h('button', {
        class: 'mini-btn push', text: 'KAPAT',
        onclick: () => { if (timer !== null) window.clearTimeout(timer); save(); openNotes.delete(t.id); renderCyber(root); },
      }),
    ),
  );
  window.setTimeout(() => ta.focus(), 0);
  return wrap;
}

function toggleTask(id: string, root: HTMLElement): void {
  let title = '';
  let done = false;
  store.update((d) => {
    const t = d.tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? dayKey() : '';
    title = t.title;
    done = t.done;
  });
  if (done) {
    const prog = roadmapProgress();
    toast(`${title} ✓ · yol haritası %${prog.pct}`);
  }
  renderCyber(root);
}

async function openTask(root: HTMLElement, phaseId: string, t?: RoadmapTask): Promise<void> {
  const res = await formModal({
    title: t ? 'Görevi düzenle' : 'Yeni görev',
    wide: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Görev', value: t?.title ?? '', span: 2 },
      { kind: 'text', key: 'when', label: 'Ne zaman', value: t?.when ?? '' },
      { kind: 'text', key: 'tags', label: 'Etiket', value: t?.tags.join(', ') ?? '' },
      { kind: 'textarea', key: 'note', label: 'Açıklama', value: t?.note ?? '', span: 2, rows: 3 },
    ],
    saveLabel: t ? 'Güncelle' : 'Ekle',
    onDelete: t
      ? async () => {
          if (!(await confirmDialog(`"${t.title}" görevi silinsin mi?`, 'Görevi sil'))) return;
          store.update((d) => { d.tasks = d.tasks.filter((x) => x.id !== t.id); });
          toast('Görev silindi');
          renderCyber(root);
        }
      : undefined,
  });
  if (!res) return;
  if (!res.title.trim()) { toast('Görev boş olamaz'); return; }
  store.update((d) => {
    if (t) {
      const x = d.tasks.find((y) => y.id === t.id);
      if (x) Object.assign(x, { title: res.title.trim(), when: res.when, note: res.note, tags: splitList(res.tags) });
    } else {
      const order = d.tasks.filter((x) => x.phaseId === phaseId).length;
      d.tasks.push({
        id: uid('rt'), phaseId, when: res.when, title: res.title.trim(),
        note: res.note, tags: splitList(res.tags), done: false, doneAt: '', order,
      });
    }
  });
  toast(t ? 'Görev güncellendi' : 'Görev eklendi');
  renderCyber(root);
}

/* ------------------------------------------------------------- kaynaklar */

function resources(root: HTMLElement): HTMLElement {
  const d = db();
  const head = h('div', { class: 'row' },
    h('div', { class: 'section-label', text: 'Kaynaklar' }),
    h('button', { class: 'btn btn--primary push', text: '+ Kaynak ekle', onclick: () => void openResource(root) }),
  );
  if (!d.resources.length) {
    return h('div', { class: 'stack-sm' }, head,
      h('div', { class: 'card' }, h('div', { class: 'empty-state', text: 'Kaynak yok.' })));
  }
  const grid = h('div', { class: 'grid-2' });
  for (const r of d.resources) grid.append(resourceCard(r, root));
  return h('div', { class: 'stack-sm' }, head, grid);
}

function resourceCard(r: Resource, root: HTMLElement): HTMLElement {
  const phase = db().phases.find((p) => p.id === r.phaseId);
  return h('button', {
    class: 'card card--pad res-card',
    onclick: () => void openResource(root, r),
  },
    h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-start' } },
      h('div', { class: 'res-card__kind', text: r.kind }),
      h('div', { style: { minWidth: '0' } },
        h('div', { class: 'res-card__title', text: r.title }),
        h('div', { class: 'sub-text', text: r.link }),
      ),
      h('div', { class: 'push sub-text', style: { color: RES_STATUS_COLOR[r.status], flex: 'none' }, text: RESOURCE_STATUS_LABEL[r.status] }),
    ),
    h('div', { class: 'row', style: { gap: '10px', marginTop: '10px' } },
      h('div', { style: { flex: '1' } }, bar(r.progress, 'var(--accent)', 'bar--4')),
      h('div', { class: 'sub-text', text: `${r.progress}%` }),
    ),
    phase ? h('div', { class: 'sub-text', style: { marginTop: '8px' }, text: `${phase.code} · ${phase.title.slice(0, 40)}` }) : null,
  );
}

async function openResource(root: HTMLElement, r?: Resource): Promise<void> {
  const d = db();
  const phaseOpts: [string, string][] = [
    ['', '(faz yok)'],
    ...d.phases.map((p) => [p.id, `${p.code} — ${p.title.slice(0, 40)}`] as [string, string]),
  ];
  const kinds: ResourceKind[] = ['kurs', 'kitap', 'video', 'makale', 'lab'];
  const res = await formModal({
    title: r ? 'Kaynağı düzenle' : 'Yeni kaynak',
    fields: [
      { kind: 'text', key: 'title', label: 'Başlık', value: r?.title ?? '', span: 2 },
      { kind: 'select', key: 'kind', label: 'Tür', value: r?.kind ?? 'kurs', options: kinds.map((k) => [k, k]) },
      { kind: 'number', key: 'progress', label: 'İlerleme %', value: String(r?.progress ?? 0), min: '0', max: '100' },
      { kind: 'select', key: 'status', label: 'Durum', value: r?.status ?? 'planned', options: (['planned', 'active', 'done', 'dropped'] as Status[]).map((s) => [s, RESOURCE_STATUS_LABEL[s]]) },
      { kind: 'text', key: 'link', label: 'Bağlantı / konum', value: r?.link ?? '' },
      { kind: 'select', key: 'phaseId', label: 'Hangi faz', value: r?.phaseId ?? '', options: phaseOpts, span: 2 },
    ],
    saveLabel: r ? 'Güncelle' : 'Ekle',
    onDelete: r ? async () => { if (!(await confirmDialog(`"${r.title}" kaynağı silinsin mi?`, 'Kaynağı sil'))) return; store.update((dd) => { dd.resources = dd.resources.filter((x) => x.id !== r.id); }); toast('Kaynak silindi'); renderCyber(root); } : undefined,
  });
  if (!res) return;
  if (!res.title.trim()) { toast('Başlık boş olamaz'); return; }
  const progress = Math.max(0, Math.min(100, Number(res.progress) || 0));
  store.update((dd) => {
    if (r) {
      const x = dd.resources.find((y) => y.id === r.id);
      if (x) Object.assign(x, { title: res.title.trim(), kind: res.kind as ResourceKind, progress, status: res.status as Status, link: res.link, phaseId: res.phaseId || null, updatedAt: nowISO() });
    } else {
      dd.resources.unshift({ id: uid('r'), kind: res.kind as ResourceKind, title: res.title.trim(), link: res.link, progress, status: res.status as Status, phaseId: res.phaseId || null, rating: null, updatedAt: nowISO() });
    }
  });
  toast(r ? 'Kaynak güncellendi' : 'Kaynak eklendi');
  renderCyber(root);
}

/* ----------------------------------------------------------------- labs */

function labs(root: HTMLElement): HTMLElement {
  const d = db();
  const head = h('div', { class: 'row' },
    h('div', { class: 'section-label', text: 'Lab günlüğü' }),
    h('button', { class: 'btn btn--primary push', text: '+ Lab ekle', onclick: () => void openLab(root) }),
  );
  if (!d.labs.length) {
    return h('div', { class: 'stack-sm' }, head,
      h('div', { class: 'card' },
        h('div', { class: 'empty-state' },
          h('div', { text: 'Henüz lab kaydın yok.' }),
          h('div', { class: 'empty-state__hint', text: 'İlk OverTheWire / TryHackMe odanı bitirince buraya ekle.' }),
        )));
  }
  const cols = '110px 1fr 90px 80px 100px 1.4fr';
  const card = h('div', { class: 'card' });
  card.append(
    h('div', { class: 'table__head', style: { gridTemplateColumns: cols } },
      h('div', { text: 'Platform' }), h('div', { text: 'Lab' }), h('div', { text: 'Zorluk' }),
      h('div', { text: 'Süre' }), h('div', { text: 'Çözüm' }), h('div', { text: 'Not' }),
    ),
  );
  const sorted = [...d.labs].sort((a, b) => (b.solvedAt || '9999').localeCompare(a.solvedAt || '9999'));
  for (const l of sorted) {
    card.append(
      h('button', { class: 'table__row', style: { gridTemplateColumns: cols }, onclick: () => void openLab(root, l) },
        h('div', { class: 'sub-text', text: l.platform }),
        h('div', { style: { fontWeight: '500' }, text: l.name }),
        h('div', {}, h('span', { class: 'pill', style: { color: DIFF_COLOR[l.difficulty] }, text: l.difficulty })),
        h('div', { class: 'sub-text', text: fmtDuration(l.durationMin) }),
        h('div', { class: 'sub-text', text: l.solvedAt ? shortDate(l.solvedAt) : 'çözülmedi' }),
        h('div', { class: 'ellipsis sub-text', text: l.writeup }),
      ),
    );
  }
  return h('div', { class: 'stack-sm' }, head, card);
}

async function openLab(root: HTMLElement, l?: LabEntry): Promise<void> {
  const plats: Platform[] = ['TryHackMe', 'HackTheBox', 'CTF', 'diğer'];
  const diffs: Difficulty[] = ['Kolay', 'Orta', 'Zor', 'Insane'];
  const res = await formModal({
    title: l ? 'Lab kaydını düzenle' : 'Yeni lab kaydı',
    wide: true,
    fields: [
      { kind: 'text', key: 'name', label: 'Lab adı', value: l?.name ?? '', span: 2 },
      { kind: 'select', key: 'platform', label: 'Platform', value: l?.platform ?? 'TryHackMe', options: plats.map((p) => [p, p]) },
      { kind: 'select', key: 'difficulty', label: 'Zorluk', value: l?.difficulty ?? 'Kolay', options: diffs.map((x) => [x, x]) },
      { kind: 'number', key: 'durationMin', label: 'Süre (dk)', value: String(l?.durationMin ?? 0), min: '0' },
      { kind: 'date', key: 'solvedAt', label: 'Çözüm tarihi', value: l?.solvedAt ?? dayKey() },
      { kind: 'textarea', key: 'writeup', label: 'Writeup / 3 cümlelik not', value: l?.writeup ?? '', span: 2, rows: 4 },
    ],
    saveLabel: l ? 'Güncelle' : 'Ekle',
    onDelete: l ? async () => { if (!(await confirmDialog(`"${l.name}" lab kaydı silinsin mi?`, 'Lab kaydını sil'))) return; store.update((d) => { d.labs = d.labs.filter((x) => x.id !== l.id); }); toast('Lab silindi'); renderCyber(root); } : undefined,
  });
  if (!res) return;
  if (!res.name.trim()) { toast('Lab adı boş olamaz'); return; }
  const now = nowISO();
  store.update((d) => {
    if (l) {
      const x = d.labs.find((y) => y.id === l.id);
      if (x) Object.assign(x, { name: res.name.trim(), platform: res.platform as Platform, difficulty: res.difficulty as Difficulty, durationMin: Number(res.durationMin) || 0, solvedAt: res.solvedAt, writeup: res.writeup, updatedAt: now });
    } else {
      d.labs.unshift({ id: uid('l'), name: res.name.trim(), platform: res.platform as Platform, difficulty: res.difficulty as Difficulty, durationMin: Number(res.durationMin) || 0, solvedAt: res.solvedAt, writeup: res.writeup, tags: [], createdAt: now, updatedAt: now });
    }
  });
  toast(l ? 'Lab güncellendi' : 'Lab eklendi');
  renderCyber(root);
}

/* ------------------------------------------------------------- snippets */

function snippets(root: HTMLElement): HTMLElement {
  const d = db();
  const head = h('div', { class: 'row' },
    h('div', { class: 'section-label', text: 'Komut defteri' }),
    h('button', { class: 'btn btn--primary push', text: '+ Komut ekle', onclick: () => void openSnippet(root) }),
  );
  if (!d.snippets.length) {
    return h('div', { class: 'stack-sm' }, head,
      h('div', { class: 'card' }, h('div', { class: 'empty-state', text: 'Komut yok.' })));
  }
  const grid = h('div', { class: 'grid-2' });
  for (const s of d.snippets) grid.append(snippetCard(s, root));
  return h('div', { class: 'stack-sm' }, head, grid);
}

function snippetCard(s: Snippet, root: HTMLElement): HTMLElement {
  // Kod VS Code'daki gibi renklendirilir; highlight() metni kaçırdığı için
  // innerHTML güvenli (bkz. core/highlight.ts).
  const lines = s.code.split('\n');
  const gutter = h('div', { class: 'code-gutter' });
  for (let i = 1; i <= lines.length; i++) gutter.append(h('div', { text: String(i) }));

  return h('div', { class: 'card snippet-card' },
    h('div', { class: 'card__head' },
      h('button', { class: 'card__title snippet-card__title', text: s.title, onclick: () => void openSnippet(root, s) }),
      h('span', { class: 'lang-badge', text: s.language }),
      h('button', {
        class: 'mini-btn push', text: 'KOPYALA',
        onclick: async () => { await navigator.clipboard.writeText(s.code).catch(() => {}); toast(`${s.title} kopyalandı`); },
      }),
    ),
    h('div', { class: 'code-wrap' },
      gutter,
      h('pre', { class: 'code-block' }, h('code', { html: highlight(s.code, s.language) })),
    ),
    s.explanation ? h('div', { class: 'snippet__note', text: s.explanation }) : null,
    s.tags.length
      ? h('div', { class: 'row', style: { gap: '5px', padding: '0 14px 12px', flexWrap: 'wrap' } },
          ...s.tags.map((tg) => h('span', { class: 'tag', text: tg })))
      : null,
  );
}

async function openSnippet(root: HTMLElement, s?: Snippet): Promise<void> {
  const res = await formModal({
    title: s ? 'Komutu düzenle' : 'Yeni komut',
    wide: true,
    fields: [
      { kind: 'text', key: 'title', label: 'Başlık', value: s?.title ?? '', span: 2 },
      {
        kind: 'select', key: 'language', label: 'Dil', value: s?.language ?? 'bash',
        options: LANGUAGES.map((l) => [l, l] as [string, string]),
      },
      { kind: 'text', key: 'tags', label: 'Etiketler', value: s?.tags.join(', ') ?? '' },
      { kind: 'textarea', key: 'code', label: 'Kod', value: s?.code ?? '', span: 2, rows: 8 },
      { kind: 'textarea', key: 'explanation', label: 'Açıklama', value: s?.explanation ?? '', span: 2, rows: 2 },
    ],
    saveLabel: s ? 'Güncelle' : 'Ekle',
    onDelete: s ? async () => { if (!(await confirmDialog(`"${s.title}" komutu silinsin mi?`, 'Komutu sil'))) return; store.update((d) => { d.snippets = d.snippets.filter((x) => x.id !== s.id); }); toast('Komut silindi'); renderCyber(root); } : undefined,
  });
  if (!res) return;
  if (!res.title.trim() || !res.code.trim()) { toast('Başlık ve kod gerekli'); return; }
  store.update((d) => {
    if (s) {
      const x = d.snippets.find((y) => y.id === s.id);
      if (x) Object.assign(x, { title: res.title.trim(), language: res.language || 'bash', code: res.code, explanation: res.explanation, tags: splitList(res.tags), updatedAt: nowISO() });
    } else {
      d.snippets.unshift({ id: uid('s'), title: res.title.trim(), language: res.language || 'bash', code: res.code, explanation: res.explanation, tags: splitList(res.tags), updatedAt: nowISO() });
    }
  });
  toast(s ? 'Komut güncellendi' : 'Komut eklendi');
  renderCyber(root);
}

/**
 * Hızlı yakalamanın "Görev" sekmesi buraya düşer: görev, tamamlanmamış ilk
 * fazın EN ÜSTÜNE eklenir ve `YAKALANAN` etiketiyle işaretlenir. Hiç faz
 * yoksa false döner.
 */
export function addRoadmapTask(title: string): boolean {
  const phase = nextPhase();
  if (!phase) return false;
  store.update((d) => {
    const own = d.tasks.filter((x) => x.phaseId === phase.id);
    const minOrder = own.length ? Math.min(...own.map((x) => x.order)) : 0;
    d.tasks.push({
      id: uid('rt'), phaseId: phase.id, when: 'YENİ', title: title.trim(),
      note: '', tags: [CAPTURE_TAG], done: false, doneAt: '', order: minOrder - 1,
    });
  });
  return true;
}

/** Yakalanmış (henüz bitmemiş) görevler — en yeni önce. */
function capturedTasks(): RoadmapTask[] {
  return db().tasks
    .filter((t) => !t.done && t.tags.includes(CAPTURE_TAG))
    .sort((a, b) => a.order - b.order);
}

/**
 * "Görev yakaladım, nereye gitti?" — Siber ekranına geçince yol haritası
 * sekmesini açar ve yakalanan görevlerin bulunduğu fazları açık gösterir.
 */
export function revealCapturedTasks(): void {
  ui.tab = 'roadmap';
  ui.initialized = true;
  for (const t of capturedTasks()) ui.openPhases.add(t.phaseId);
}

/** Yakalanan görevlerin listelendiği üst kutu. */
function captureInbox(root: HTMLElement): HTMLElement | null {
  const items = capturedTasks();
  if (!items.length) return null;

  const d = db();
  const box = h('div', { class: 'card capture-inbox' },
    h('div', { class: 'card__head card__head--tint' },
      h('span', { class: 'card__title', text: 'Yakalananlar' }),
      h('span', { class: 'sub-text push', text: `${items.length} görev · hızlı yakalamadan geldi` }),
    ),
  );

  const body = h('div', { class: 'capture-inbox__list' });
  for (const t of items) {
    const phase = d.phases.find((p) => p.id === t.phaseId);
    body.append(
      h('div', { class: 'capture-inbox__row' },
        h('button', {
          class: 'checkbox', title: 'tamamlandı', text: '',
          onclick: () => toggleTask(t.id, root),
        }),
        h('div', { class: 'capture-inbox__main' },
          h('div', { class: 'capture-inbox__title', text: t.title }),
          h('div', { class: 'sub-text', text: phase ? `${phase.code} · ${phase.title}` : 'faz yok' }),
        ),
        h('button', {
          class: 'mini-btn', text: 'DÜZENLE',
          onclick: () => void openTask(root, t.phaseId, t),
        }),
        h('button', {
          class: 'mini-btn', text: 'LİSTEDEN ÇIKAR',
          title: 'görev yol haritasında kalır, bu kutudan düşer',
          onclick: () => {
            store.update((dd) => {
              const x = dd.tasks.find((y) => y.id === t.id);
              if (x) x.tags = x.tags.filter((g) => g !== CAPTURE_TAG);
            });
            renderCyber(root);
          },
        }),
      ),
    );
  }
  box.append(body);
  return box;
}

/** Komut paletinden yeni lab için. */
export function openLabForm(): void {
  ui.tab = 'labs';
  void openLab(document.querySelector('.content') as HTMLElement);
}
