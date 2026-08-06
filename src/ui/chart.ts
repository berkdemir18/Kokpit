/**
 * Küçük SVG grafik yardımcıları — harici kütüphane yok.
 * Hepsi tema değişkenlerini kullanır, ölçekleri kendi hesaplar ve
 * eksen/kılavuz çizgisi çizer (istatistik ekranının "amatör" görünmemesi için).
 */

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function title(node: SVGElement, text: string): void {
  const t = el('title');
  t.textContent = text;
  node.append(t);
}

export interface Series {
  label: string;
  values: number[];
  color: string;
  /** Alan dolgusu (çizgi grafikte). */
  fill?: boolean;
}

/** Değer eksenini okunur "yuvarlak" bir tavana çıkarır (10, 25, 50, 100…). */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

function gridAndAxis(
  svg: SVGSVGElement,
  box: { x: number; y: number; w: number; h: number },
  max: number,
  ticks: number,
  fmt: (v: number) => string,
): void {
  for (let i = 0; i <= ticks; i++) {
    const value = (max / ticks) * i;
    const y = box.y + box.h - (box.h * i) / ticks;
    svg.append(el('line', {
      x1: box.x, x2: box.x + box.w, y1: y, y2: y,
      stroke: 'var(--line)', 'stroke-width': 1,
      'stroke-dasharray': i === 0 ? '0' : '2 4',
    }));
    const label = el('text', {
      x: box.x - 8, y: y + 3.5, 'text-anchor': 'end',
      fill: 'var(--dim-4)', 'font-size': 9.5, 'font-family': 'var(--font-mono)',
    });
    label.textContent = fmt(value);
    svg.append(label);
  }
}

/* ------------------------------------------------------------ çizgi/alan */

export interface LineChartOptions {
  labels: string[];
  series: Series[];
  height?: number;
  fmtValue?: (v: number) => string;
}

/** Aylık aktivite gibi seriler için yumuşatılmış alan grafiği. */
export function lineChart(o: LineChartOptions): SVGSVGElement {
  const h = o.height ?? 220;
  const w = 720;
  const box = { x: 44, y: 14, w: w - 60, h: h - 46 };
  const fmt = o.fmtValue ?? ((v: number) => String(Math.round(v)));

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'svg-chart', preserveAspectRatio: 'none' });
  const max = niceMax(Math.max(1, ...o.series.flatMap((s) => s.values)));
  gridAndAxis(svg, box, max, 4, fmt);

  const n = Math.max(1, o.labels.length - 1);
  const px = (i: number) => box.x + (box.w * i) / n;
  const py = (v: number) => box.y + box.h - (box.h * v) / max;

  o.series.forEach((s, si) => {
    const pts = s.values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
    if (s.fill) {
      const gradId = `grad${si}-${Math.random().toString(36).slice(2, 7)}`;
      const defs = el('defs');
      const lg = el('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.append(el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.34 }));
      lg.append(el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
      defs.append(lg);
      svg.append(defs);
      svg.append(el('polygon', {
        points: `${box.x},${box.y + box.h} ${pts.join(' ')} ${px(s.values.length - 1)},${box.y + box.h}`,
        fill: `url(#${gradId})`,
      }));
    }
    svg.append(el('polyline', {
      points: pts.join(' '), fill: 'none', stroke: s.color,
      'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    s.values.forEach((v, i) => {
      const dot = el('circle', { cx: px(i), cy: py(v), r: 2.8, fill: 'var(--bg)', stroke: s.color, 'stroke-width': 1.6 });
      title(dot, `${o.labels[i]} · ${fmt(v)}`);
      svg.append(dot);
    });
  });

  o.labels.forEach((label, i) => {
    const t = el('text', {
      x: px(i), y: h - 10, 'text-anchor': 'middle',
      fill: 'var(--dim-4)', 'font-size': 9.5, 'font-family': 'var(--font-mono)',
    });
    t.textContent = label;
    svg.append(t);
  });

  return svg;
}

/* ---------------------------------------------------------------- sütun */

export interface BarChartOptions {
  labels: string[];
  values: number[];
  color: string;
  height?: number;
  fmtValue?: (v: number) => string;
  /** Belirtilirse kesikli hedef çizgisi çizilir. */
  target?: number;
}

export function barChart(o: BarChartOptions): SVGSVGElement {
  const h = o.height ?? 200;
  const w = 720;
  const box = { x: 44, y: 14, w: w - 60, h: h - 46 };
  const fmt = o.fmtValue ?? ((v: number) => String(Math.round(v)));

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, class: 'svg-chart', preserveAspectRatio: 'none' });
  const max = niceMax(Math.max(1, ...o.values, o.target ?? 0));
  gridAndAxis(svg, box, max, 4, fmt);

  const slot = box.w / Math.max(1, o.values.length);
  const bw = Math.min(30, slot * 0.55);

  o.values.forEach((v, i) => {
    const bh = (box.h * v) / max;
    const x = box.x + slot * i + (slot - bw) / 2;
    const rect = el('rect', {
      x, y: box.y + box.h - bh, width: bw, height: Math.max(v > 0 ? 2 : 0, bh),
      rx: 3, fill: o.color, opacity: 0.9,
    });
    title(rect, `${o.labels[i]} · ${fmt(v)}`);
    svg.append(rect);
  });

  if (o.target) {
    const y = box.y + box.h - (box.h * o.target) / max;
    svg.append(el('line', {
      x1: box.x, x2: box.x + box.w, y1: y, y2: y,
      stroke: 'var(--warn)', 'stroke-width': 1, 'stroke-dasharray': '5 4', opacity: 0.8,
    }));
  }

  o.labels.forEach((label, i) => {
    const t = el('text', {
      x: box.x + slot * i + slot / 2, y: h - 10, 'text-anchor': 'middle',
      fill: 'var(--dim-4)', 'font-size': 9.5, 'font-family': 'var(--font-mono)',
    });
    t.textContent = label;
    svg.append(t);
  });

  return svg;
}

/* ---------------------------------------------------------------- halka */

export interface DonutSlice { label: string; value: number; color: string; }

/** Orta boşluklu halka grafik + ortada toplam. */
export function donut(slices: DonutSlice[], centerTop: string, centerSub: string): SVGSVGElement {
  const size = 190;
  const r = 74;
  const stroke = 20;
  const c = size / 2;
  const total = slices.reduce((a, s) => a + s.value, 0);

  const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, class: 'svg-donut' });
  svg.append(el('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--track)', 'stroke-width': stroke }));

  const circ = 2 * Math.PI * r;
  let offset = 0;
  for (const s of slices) {
    if (s.value <= 0 || total <= 0) continue;
    const len = (s.value / total) * circ;
    const arc = el('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: s.color, 'stroke-width': stroke,
      'stroke-dasharray': `${len} ${circ - len}`,
      'stroke-dashoffset': -offset,
      transform: `rotate(-90 ${c} ${c})`,
      'stroke-linecap': 'butt',
    });
    title(arc, `${s.label} · ${s.value}`);
    svg.append(arc);
    offset += len;
  }

  const top = el('text', { x: c, y: c - 2, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 30, 'font-weight': 600 });
  top.textContent = centerTop;
  svg.append(top);
  const sub = el('text', { x: c, y: c + 17, 'text-anchor': 'middle', fill: 'var(--dim-3)', 'font-size': 10.5, 'font-family': 'var(--font-mono)' });
  sub.textContent = centerSub;
  svg.append(sub);

  return svg;
}

/* -------------------------------------------------------------- histogram */

/** 1–10 puan dağılımı gibi sabit kovalı histogram. */
export function histogram(buckets: number[], labels: string[], colorFor: (i: number) => string, height = 130): SVGSVGElement {
  const w = 360;
  const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, class: 'svg-chart' });
  const max = Math.max(1, ...buckets);
  const slot = w / buckets.length;
  const bw = slot * 0.62;
  const base = height - 20;

  buckets.forEach((v, i) => {
    const bh = ((base - 8) * v) / max;
    const rect = el('rect', {
      x: slot * i + (slot - bw) / 2, y: base - bh, width: bw, height: Math.max(v > 0 ? 2 : 0, bh),
      rx: 2.5, fill: colorFor(i), opacity: v ? 0.92 : 0.25,
    });
    title(rect, `${labels[i]} puan · ${v} kayıt`);
    svg.append(rect);

    const t = el('text', {
      x: slot * i + slot / 2, y: height - 6, 'text-anchor': 'middle',
      fill: 'var(--dim-4)', 'font-size': 9, 'font-family': 'var(--font-mono)',
    });
    t.textContent = labels[i];
    svg.append(t);
  });

  return svg;
}

/** Grafiği bir kart gövdesine yerleştirmek için sarmalayıcı. */
export function chartBox(node: SVGSVGElement): HTMLElement {
  const div = document.createElement('div');
  div.className = 'chart-box';
  div.append(node);
  return div;
}
