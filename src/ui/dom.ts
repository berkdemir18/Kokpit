/** Kucuk DOM yardimcilari — framework yok, tip guvenli element uretimi. */

type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  class?: string;
  text?: string;
  html?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  href?: string;
  src?: string;
  alt?: string;
  rows?: number;
  min?: string;
  max?: string;
  step?: string;
  checked?: boolean;
  disabled?: boolean;
  dataset?: Record<string, string>;
  onclick?: (e: MouseEvent) => void;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  onkeydown?: (e: KeyboardEvent) => void;
  onblur?: (e: FocusEvent) => void;
  onmousedown?: (e: MouseEvent) => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const {
    class: cls, text, html, style, dataset,
    onclick, oninput, onchange, onkeydown, onblur, onmousedown,
    ...rest
  } = attrs;

  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  if (html !== undefined) el.innerHTML = html;
  if (typeof style === 'string') el.setAttribute('style', style);
  else if (style) applyStyle(el, style);
  if (dataset) for (const [k, v] of Object.entries(dataset)) el.dataset[k] = v;
  if (onclick) el.addEventListener('click', onclick as EventListener);
  if (oninput) el.addEventListener('input', oninput as EventListener);
  if (onchange) el.addEventListener('change', onchange as EventListener);
  if (onkeydown) el.addEventListener('keydown', onkeydown as EventListener);
  if (onblur) el.addEventListener('blur', onblur as EventListener);
  if (onmousedown) el.addEventListener('mousedown', onmousedown as EventListener);

  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null || v === false) continue;
    if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }

  append(el, children);
  return el;
}

/**
 * Stil nesnesini uygular. `--x` ile başlayan anahtarlar CSS özel değişkenidir
 * ve `Object.assign` ile atanamaz; setProperty gerekir.
 */
function applyStyle(el: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else (el.style as unknown as Record<string, unknown>)[k] = v;
  }
}

export function append(parent: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(c instanceof Node ? c : String(c));
  }
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    f.append(c instanceof Node ? c : String(c));
  }
  return f;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

/** Ilerleme cubugu. */
export function bar(percent: number, color = 'var(--accent)', variant = ''): HTMLElement {
  return h('div', { class: `bar ${variant}` },
    h('div', { class: 'bar__fill', style: { width: `${Math.max(0, Math.min(100, percent))}%`, background: color } }),
  );
}

/** Mono etiket satiri. */
export function mono(text: string, cls = ''): HTMLElement {
  return h('div', { class: `mono ${cls}`, text });
}

export function emptyState(message: string, hint = ''): HTMLElement {
  return h('div', { class: 'empty-state' },
    h('div', { text: message }),
    hint ? h('div', { class: 'empty-state__hint', text: hint }) : null,
  );
}
