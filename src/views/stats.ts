/**
 * İstatistik modülü — tüm modüllerin birleşik görünümü.
 *
 * 2026-08-04'te baştan yazıldı: div'lerle çizilen kaba çubuklar yerine
 * eksenli/kılavuzlu SVG grafikler, sekmeli düzen ve gerçek karşılaştırmalar.
 */

import { db } from '../core/store';
import { Title } from '../core/model';
import { h, clear, bar } from '../ui/dom';
import { lineChart, barChart, histogram, chartBox } from '../ui/chart';
import {
  MONTH_SHORT, fmtNum, habitDays, bestStreak, streak, sum, lastDays, dayKey,
} from '../core/util';

type StatTab = 'genel' | 'izleme' | 'alışkanlık';

const ui = { tab: 'genel' as StatTab, year: new Date().getFullYear() };

const rerender = (): void => {
  const el = document.querySelector('.content') as HTMLElement | null;
  if (el) renderStats(el);
};

export function renderStats(root: HTMLElement): void {
  clear(root);
  const wrap = h('div', { class: 'stack-md' }, header(), tabs());
  switch (ui.tab) {
    case 'genel': wrap.append(generalTab()); break;
    case 'izleme': wrap.append(watchTab()); break;
    case 'alışkanlık': wrap.append(habitTab()); break;
  }
  root.append(wrap);
}

/* ---------------------------------------------------------------- başlık */

function years(): number[] {
  const d = db();
  const set = new Set<number>([new Date().getFullYear()]);
  for (const t of d.titles) if (t.watchedAt) set.add(Number(t.watchedAt.slice(0, 4)));
  return [...set].filter((y) => y > 2000).sort((a, b) => b - a);
}

function header(): HTMLElement {
  const row = h('div', { class: 'stats-head' },
    h('div', {},
      h('div', { class: 'stats-head__year', text: String(ui.year) }),
      h('div', { class: 'sub-text', text: 'yıllık birleşik görünüm' }),
    ),
  );
  const picker = h('div', { class: 'segmented segmented--mini push' });
  for (const y of years().slice(0, 4)) {
    picker.append(h('button', {
      class: `segmented__item${ui.year === y ? ' is-active' : ''}`,
      text: String(y),
      onclick: () => { ui.year = y; rerender(); },
    }));
  }
  row.append(picker);
  return row;
}

function tabs(): HTMLElement {
  const defs: [StatTab, string][] = [
    ['genel', 'Genel'], ['izleme', 'İzleme'], ['alışkanlık', 'Alışkanlık'],
  ];
  const el = h('div', { class: 'tabs' });
  for (const [id, label] of defs) {
    el.append(h('button', {
      class: `tabs__item${ui.tab === id ? ' is-active' : ''}`,
      text: label,
      onclick: () => { ui.tab = id; rerender(); },
    }));
  }
  return el;
}

/* ------------------------------------------------------------ yardımcılar */

interface KpiDef {
  label: string;
  value: string;
  unit?: string;
  note: string;
  color: string;
  /** 0-100 ilerleme çubuğu (varsa). */
  pct?: number;
}

function kpiRow(defs: KpiDef[]): HTMLElement {
  const grid = h('div', { class: `tiles tiles--${defs.length}` });
  for (const k of defs) {
    grid.append(
      h('div', { class: 'tile tile--static tile--kpi', style: { '--kpi-c': k.color } as unknown as Partial<CSSStyleDeclaration> },
        h('div', { class: 'tile__label', text: k.label }),
        h('div', { class: 'tile__value' },
          h('div', { class: 'tile__num tile__num--sm', style: { color: k.color }, text: k.value }),
          k.unit ? h('div', { class: 'tile__unit', text: k.unit }) : null,
        ),
        k.pct !== undefined ? bar(k.pct, k.color) : null,
        h('div', { class: 'tile__note', text: k.note }),
      ),
    );
  }
  return grid;
}

function card(titleText: string, meta: string, ...body: (Node | null)[]): HTMLElement {
  return h('div', { class: 'card' },
    h('div', { class: 'card__head' },
      h('div', { class: 'card__title', text: titleText }),
      meta ? h('div', { class: 'sub-text push', text: meta }) : null,
    ),
    h('div', { class: 'card__pad' }, ...body),
  );
}

function inYear(iso: string): boolean {
  return !!iso && Number(iso.slice(0, 4)) === ui.year;
}

function distRow(label: string, pct: number, value: string, color: string): HTMLElement {
  return h('div', { class: 'dist-row' },
    h('div', { class: 'dist-row__label ellipsis', text: label }),
    h('div', { style: { flex: '1' } },
      h('div', { class: 'bar bar--8' }, h('div', { class: 'bar__fill', style: { width: `${pct}%`, background: color } })),
    ),
    h('div', { class: 'dist-row__value', text: value }),
  );
}

function emptyCard(msg: string): HTMLElement {
  return h('div', { class: 'card' }, h('div', { class: 'empty-state', text: msg }));
}

/* ------------------------------------------------------------ genel sekme */

function generalTab(): HTMLElement {
  const d = db();
  const watched = d.titles.filter((t) => inYear(t.watchedAt)).length;
  const notesYear = d.pages.filter((n) => inYear(n.createdAt)).length;
  const live = d.habits.filter((x) => !x.archived);
  const bestSeri = Math.max(0, ...live.map((hb) => streak(habitDays(d.habitLogs, hb.id))));
  const goalsDone = d.goals.filter((g) => g.status === 'done').length;

  const kpis = kpiRow([
    { label: 'İzlenen içerik', value: String(watched), unit: 'adet', note: `hedef ${d.settings.yearlyWatchTarget}`, color: 'var(--c-watch)', pct: Math.min(100, Math.round((watched / Math.max(1, d.settings.yearlyWatchTarget)) * 100)) },
    { label: 'Yazılan sayfa', value: String(notesYear), unit: 'sayfa', note: `toplam ${d.pages.length}`, color: 'var(--c-notes)' },
    { label: 'En uzun seri', value: String(bestSeri), unit: 'gün', note: `${live.length} aktif alışkanlık`, color: 'var(--c-goals)' },
    { label: 'Tamamlanan hedef', value: String(goalsDone), unit: 'hedef', note: `${d.goals.filter((g) => g.status === 'active').length} açık`, color: 'var(--c-goals)' },
  ]);

  const watchByMonth = new Array(12).fill(0);
  const notesByMonth = new Array(12).fill(0);
  for (const t of d.titles) if (inYear(t.watchedAt)) watchByMonth[Number(t.watchedAt.slice(5, 7)) - 1] += 1;
  for (const n of d.pages) if (inYear(n.createdAt)) notesByMonth[Number(n.createdAt.slice(5, 7)) - 1] += 1;

  const hasData = sum(watchByMonth) + sum(notesByMonth) > 0;

  return h('div', { class: 'stack-md' },
    kpis,
    hasData
      ? card('Aylık izlenen içerik', `${ui.year} · adet`,
          chartBox(lineChart({
            labels: MONTH_SHORT,
            series: [{ label: 'içerik', values: watchByMonth, color: 'var(--c-watch)', fill: true }],
            fmtValue: (v) => fmtNum(Math.round(v)),
          })))
      : emptyCard('Bu yıl için henüz veri yok. İzleme ekranından kayıt ekle.'),
    h('div', { class: 'grid-stats' },
      card('Aylık yazılan sayfa', `${ui.year}`,
        chartBox(barChart({ labels: MONTH_SHORT, values: notesByMonth, color: 'var(--c-notes)', height: 190 }))),
      card('Son 30 gün', 'günlük tamamlanan alışkanlık',
        chartBox(last30Chart())),
    ),
  );
}

function last30Chart(): SVGSVGElement {
  const d = db();
  const live = d.habits.filter((x) => !x.archived);
  const byDay = new Map<string, number>();
  for (const hb of live) for (const day of habitDays(d.habitLogs, hb.id)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  const days = lastDays(30);
  return barChart({
    labels: days.map((x, i) => (i % 5 === 0 ? x.slice(8) : '')),
    values: days.map((x) => byDay.get(x) ?? 0),
    color: 'var(--c-goals)',
    height: 190,
    target: live.length || undefined,
  });
}

/* ----------------------------------------------------------- izleme sekme */

function watchTab(): HTMLElement {
  const d = db();
  if (!d.titles.length) return emptyCard('Henüz film/dizi kaydı yok.');

  const films = d.titles.filter((t) => t.kind === 'film');
  const series = d.titles.filter((t) => t.kind === 'dizi');
  const rated = d.titles.filter((t) => t.rating);
  const avg = rated.length ? (sum(rated.map((t) => t.rating ?? 0)) / rated.length) : 0;
  const yearDone = d.titles.filter((t) => inYear(t.watchedAt)).length;
  const episodes = sum(series.map((t) => (t.episodes.length ? t.episodes.filter((e) => e.watched).length : t.episode)));

  const kpis = kpiRow([
    { label: 'Toplam kayıt', value: String(d.titles.length), note: `${films.length} film · ${series.length} dizi`, color: 'var(--c-watch)' },
    { label: 'Bu yıl izlenen', value: String(yearDone), unit: 'adet', note: `hedef ${d.settings.yearlyWatchTarget}`, color: 'var(--c-watch)', pct: Math.min(100, Math.round((yearDone / Math.max(1, d.settings.yearlyWatchTarget)) * 100)) },
    { label: 'Ortalama puan', value: avg ? avg.toFixed(1) : '—', unit: '/10', note: `${rated.length} puanlı kayıt`, color: 'var(--warn)' },
    { label: 'İzlenen bölüm', value: fmtNum(episodes), unit: 'bölüm', note: `${series.filter((t) => t.status === 'active').length} dizi devam ediyor`, color: 'var(--violet)' },
  ]);

  // puan dağılımı 1–10
  const buckets = new Array(10).fill(0);
  for (const t of rated) buckets[(t.rating ?? 1) - 1] += 1;
  const bucketColor = (i: number) => (i >= 8 ? 'var(--success)' : i >= 6 ? 'var(--warn)' : 'var(--dim-2)');

  // tür dağılımı
  const genreCount = new Map<string, number>();
  for (const t of d.titles) for (const g of t.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxGenre = Math.max(1, ...topGenres.map((x) => x[1]));
  const genreWrap = h('div', { class: 'col', style: { gap: '11px' } });
  for (const [label, count] of topGenres) {
    genreWrap.append(distRow(label, Math.round((count / maxGenre) * 100), String(count), 'var(--c-watch)'));
  }
  if (!topGenres.length) genreWrap.append(h('div', { class: 'empty-state', text: 'Tür bilgisi yok.' }));

  // en yüksek puanlılar
  const top = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 6);
  const topWrap = h('div', { class: 'col', style: { gap: '2px' } });
  for (const t of top) topWrap.append(titleRow(t));

  const monthCount = new Array(12).fill(0);
  for (const t of d.titles) if (inYear(t.watchedAt)) monthCount[Number(t.watchedAt.slice(5, 7)) - 1] += 1;

  return h('div', { class: 'stack-md' },
    kpis,
    h('div', { class: 'grid-stats' },
      card('Puan dağılımı', `ortalama ${avg ? avg.toFixed(1) : '—'}`,
        chartBox(histogram(buckets, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], bucketColor))),
      card('Türler', `${genreCount.size} farklı tür`, genreWrap),
    ),
    card('Aylık izleme', `${ui.year}`,
      chartBox(barChart({ labels: MONTH_SHORT, values: monthCount, color: 'var(--c-watch)', height: 190 }))),
    card('En yüksek puan verdiklerin', `${rated.length} puanlı kayıt`, topWrap),
  );
}

function titleRow(t: Title): HTMLElement {
  const color = (t.rating ?? 0) >= 9 ? 'var(--success)' : (t.rating ?? 0) >= 7 ? 'var(--warn)' : 'var(--dim)';
  return h('div', { class: 'toplist-row' },
    h('div', { class: 'toplist-row__rating', style: { color }, text: `★ ${t.rating}` }),
    h('div', { class: 'ellipsis', style: { fontSize: 'var(--fs-13)' }, text: t.name }),
    h('div', { class: 'sub-text push', text: `${t.kind === 'film' ? 'film' : 'dizi'}${t.year ? ' · ' + t.year : ''}` }),
  );
}

/* ------------------------------------------------------- alışkanlık sekme */

function habitTab(): HTMLElement {
  const d = db();
  const active = d.habits.filter((hb) => !hb.archived);
  if (!active.length) return emptyCard('Alışkanlık yok. Hedefler ekranından ekle.');

  const days = lastDays(28);
  const rows = active.map((hb) => {
    const list = habitDays(d.habitLogs, hb.id);
    const hit = days.filter((x) => list.includes(x)).length;
    return {
      name: hb.name,
      cur: streak(list),
      best: bestStreak(list),
      rate: Math.round((hit / 28) * 100),
      list,
    };
  }).sort((a, b) => b.rate - a.rate);

  const best = rows[0];
  const totalRate = Math.round(sum(rows.map((r) => r.rate)) / rows.length);

  const kpis = kpiRow([
    { label: 'Ortalama tutarlılık', value: `%${totalRate}`, note: 'son 28 gün', color: 'var(--c-goals)', pct: totalRate },
    { label: 'En iyi alışkanlık', value: best.name.slice(0, 14), note: `%${best.rate} · ${best.cur}g seri`, color: 'var(--success)' },
    { label: 'En uzun seri', value: String(Math.max(...rows.map((r) => r.best))), unit: 'gün', note: 'tüm zamanlar', color: 'var(--warn)' },
    { label: 'Aktif alışkanlık', value: String(active.length), unit: 'adet', note: `${d.goals.filter((g) => g.status === 'active').length} açık hedef`, color: 'var(--accent)' },
  ]);

  const table = h('div', { class: 'col', style: { gap: '10px' } });
  for (const r of rows) {
    const strip = h('div', { class: 'habit-strip' });
    for (const dk of days) {
      strip.append(h('div', {
        class: `habit-strip__cell${r.list.includes(dk) ? ' is-on' : ''}${dk === dayKey() ? ' is-today' : ''}`,
        title: dk,
      }));
    }
    table.append(
      h('div', { class: 'habit-stat' },
        h('div', { class: 'habit-stat__name ellipsis', text: r.name }),
        strip,
        h('div', { class: 'habit-stat__nums' },
          h('span', { style: { color: 'var(--warn)' }, text: `${r.cur}g` }),
          h('span', { class: 'sub-text', text: `en uzun ${r.best}g` }),
          h('span', { style: { color: 'var(--text)', fontWeight: '600' }, text: `%${r.rate}` }),
        ),
      ),
    );
  }

  return h('div', { class: 'stack-md' },
    kpis,
    card('Son 28 gün', 'her kutu bir gün', table),
  );
}
