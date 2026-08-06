/** Modüller arası tek arama indeksi — komut paletini besler. */

import { db } from './store';
import { ViewId } from './router';
import { shortDate, fmtDT } from './util';

export interface SearchHit {
  kind: string;
  label: string;
  meta: string;
  view: ViewId;
}

export function buildIndex(): SearchHit[] {
  const d = db();
  const out: SearchHit[] = [];

  for (const t of d.titles) {
    out.push({ kind: t.kind === 'film' ? 'FİLM' : 'DİZİ', label: t.name, meta: `${t.year || '—'} · ${t.genres.join(', ')}`, view: 'watch' });
  }
  for (const l of d.labs) {
    out.push({ kind: 'LAB', label: l.name, meta: `${l.platform} · ${l.difficulty} · ${l.solvedAt ? shortDate(l.solvedAt) : 'çözülmedi'}`, view: 'cyber' });
  }
  for (const t of d.tasks) {
    const phase = d.phases.find((p) => p.id === t.phaseId);
    out.push({
      kind: 'GÖREV',
      label: t.title,
      meta: `${phase?.code ?? ''}${t.when ? ' · ' + t.when : ''}${t.done ? ' · ✓' : ''}`,
      view: 'cyber',
    });
  }
  for (const r of d.resources) {
    out.push({ kind: 'KAYNAK', label: r.title, meta: `${r.kind} · %${r.progress}`, view: 'cyber' });
  }
  for (const s of d.snippets) {
    out.push({ kind: 'KOMUT', label: s.title, meta: s.language, view: 'cyber' });
  }
  for (const g of d.goals) {
    out.push({ kind: 'HEDEF', label: g.title, meta: g.area, view: 'goals' });
  }
  for (const h of d.habits.filter((x) => !x.archived)) {
    out.push({ kind: 'ALIŞKANLIK', label: h.name, meta: h.cadence, view: 'goals' });
  }
  for (const page of d.pages.filter((x) => !x.archived)) {
    out.push({
      kind: page.database.on ? 'VERİTABANI' : 'SAYFA',
      label: page.title || 'Başlıksız',
      meta: page.tags.join(', ') || page.category || 'etiketsiz',
      view: 'notes',
    });
  }
  for (const r of d.reminders) {
    out.push({ kind: 'HATIRLATICI', label: r.title, meta: `${fmtDT(r.at)}${r.done ? ' · ✓' : ''}`, view: 'agenda' });
  }
  for (const e of d.events) {
    out.push({ kind: 'ETKİNLİK', label: e.title, meta: `${fmtDT(e.start)} · ${e.calendar}`, view: 'agenda' });
  }
  return out;
}

export function search(query: string, index: SearchHit[]): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.slice(0, 40);
  const terms = q.split(/\s+/);
  const scored: [number, SearchHit][] = [];
  for (const hit of index) {
    const hay = `${hit.label} ${hit.kind} ${hit.meta}`.toLowerCase();
    let ok = true;
    let score = 0;
    for (const term of terms) {
      const i = hay.indexOf(term);
      if (i < 0) { ok = false; break; }
      score += i === 0 ? 3 : hit.label.toLowerCase().includes(term) ? 2 : 1;
    }
    if (ok) scored.push([score, hit]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 40).map(([, h]) => h);
}
