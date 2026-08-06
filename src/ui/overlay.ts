/** Toast, modal form, sekmeli hızlı yakalama ve uygulama içi onay penceresi. */

import { h, clear } from './dom';
import { buildCaptureForm, CaptureKind, CaptureResult } from './capture-form';

export type { CaptureKind, CaptureResult };

let toastTimer: number | null = null;
let toastEl: HTMLElement | null = null;

/**
 * Alt köşede kısa bildirim. İkinci parametre bir eylem düğmesi ekler;
 * etiketi varsayılan "GERİ AL", üçüncü parametreyle değiştirilebilir
 * (ör. yakalanan görev için "GÖSTER").
 */
export function toast(text: string, action?: () => void, actionLabel = 'GERİ AL'): void {
  if (toastEl) toastEl.remove();
  const el = h('div', { class: 'toast' },
    h('div', { class: 'toast__dot' }),
    h('div', { class: 'toast__text', text }),
    action
      ? h('button', {
          class: 'toast__undo',
          text: actionLabel,
          onclick: () => { action(); hideToast(); },
        })
      : null,
  );
  document.body.append(el);
  toastEl = el;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, 4000);
}

function hideToast(): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = null;
  toastEl?.remove();
  toastEl = null;
}

/* ------------------------------------------------------------------ modal */

export type Field =
  | { kind: 'text'; key: string; label: string; value?: string; span?: 1 | 2; placeholder?: string }
  | { kind: 'number'; key: string; label: string; value?: string; span?: 1 | 2; min?: string; max?: string; step?: string }
  | { kind: 'date'; key: string; label: string; value?: string; span?: 1 | 2 }
  | { kind: 'datetime'; key: string; label: string; value?: string; span?: 1 | 2 }
  | { kind: 'select'; key: string; label: string; value?: string; span?: 1 | 2; options: [string, string][] }
  | { kind: 'textarea'; key: string; label: string; value?: string; span?: 1 | 2; rows?: number; placeholder?: string }
  | { kind: 'checkbox'; key: string; label: string; value?: string; span?: 1 | 2 };

export interface ModalOptions {
  title: string;
  meta?: string;
  fields: Field[];
  saveLabel?: string;
  wide?: boolean;
  onDelete?: () => void;
}

let openOverlay: HTMLElement | null = null;
/** Onay kutusu ayrı katmanda durur; altındaki modalı kapatmaz. */
let confirmLayer: HTMLElement | null = null;

export function anyOverlayOpen(): boolean {
  return openOverlay !== null || confirmLayer !== null;
}

export function closeOverlay(): void {
  // Üstte onay kutusu varsa önce o kapanır.
  if (confirmLayer) { confirmLayer.remove(); confirmLayer = null; return; }
  openOverlay?.remove();
  openOverlay = null;
}

/** Dışarıda (ör. komut paleti) oluşturulan overlay'ı kayıt eder. */
export function mountOverlay(el: HTMLElement): void {
  closeOverlay();
  document.body.append(el);
  openOverlay = el;
}

/* -------------------------------------------------------- onay penceresi */

export interface ConfirmOptions {
  title?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Kırmızı onay düğmesi (silme gibi geri dönüşsüz işler). */
  danger?: boolean;
}

/**
 * Uygulama içi onay kutusu — Windows'un kendi penceresi yerine.
 * Enter onaylar, Esc vazgeçer; imleç doğrudan onay düğmesinde başlar.
 */
export function confirmDialog(message: string, title = 'Emin misin?', opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmLayer) { confirmLayer.remove(); confirmLayer = null; }
    const danger = opts.danger ?? true;

    const done = (v: boolean) => {
      confirmLayer?.remove();
      confirmLayer = null;
      resolve(v);
    };

    const okBtn = h('button', {
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
      text: opts.confirmLabel ?? (danger ? 'Sil' : 'Tamam'),
      onclick: () => done(true),
    });

    const box = h('div', { class: 'confirm' },
      h('div', { class: 'confirm__head' },
        h('div', { class: `confirm__icon${danger ? ' confirm__icon--danger' : ''}`, text: danger ? '!' : '?' }),
        h('div', {},
          h('div', { class: 'confirm__title', text: opts.title ?? title }),
          h('div', { class: 'confirm__msg', text: message }),
        ),
      ),
      opts.detail ? h('div', { class: 'confirm__detail', text: opts.detail }) : null,
      h('div', { class: 'confirm__foot' },
        h('div', { class: 'modal__hint', text: '⏎ onayla · Esc vazgeç' }),
        h('button', { class: 'btn push', text: opts.cancelLabel ?? 'Vazgeç', onclick: () => done(false) }),
        okBtn,
      ),
    );

    const layer = h('div', {
      class: 'overlay overlay--center overlay--confirm',
      onclick: (e) => { if (e.target === layer) done(false); },
      onkeydown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); }
        if (e.key === 'Enter') { e.preventDefault(); done(true); }
      },
    }, box);

    document.body.append(layer);
    confirmLayer = layer;
    okBtn.focus();
  });
}

/** Form modali. Kaydedilirse alan degerlerini, vazgecilirse null doner. */
export function formModal(opts: ModalOptions): Promise<Record<string, string> | null> {
  closeOverlay();
  return new Promise((resolve) => {
    const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();

    const body = h('div', { class: 'modal__body' });
    for (const f of opts.fields) {
      const wrap = h('div', { class: `field${f.span === 2 ? ' field--wide' : ''}` },
        h('div', { class: 'field__label', text: f.label }),
      );
      let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      switch (f.kind) {
        case 'textarea':
          input = h('textarea', {
            class: 'field__area',
            rows: f.rows ?? 3,
            value: f.value ?? '',
            placeholder: f.placeholder ?? '',
          });
          break;
        case 'select': {
          const sel = h('select', { class: 'field__select' });
          for (const [val, label] of f.options) {
            const o = h('option', { value: val, text: label });
            if (val === (f.value ?? '')) o.selected = true;
            sel.append(o);
          }
          input = sel;
          break;
        }
        case 'checkbox':
          input = h('input', { class: 'field__input', type: 'checkbox' });
          (input as HTMLInputElement).checked = f.value === 'true';
          break;
        case 'number':
          input = h('input', {
            class: 'field__input', type: 'number', value: f.value ?? '',
            min: f.min, max: f.max, step: f.step,
          });
          break;
        case 'date':
          input = h('input', { class: 'field__input', type: 'date', value: f.value ?? '' });
          break;
        case 'datetime':
          input = h('input', { class: 'field__input', type: 'datetime-local', value: f.value ?? '' });
          break;
        default:
          input = h('input', {
            class: 'field__input', type: 'text', value: f.value ?? '',
            placeholder: f.placeholder ?? '',
          });
      }
      inputs.set(f.key, input);
      wrap.append(input);
      body.append(wrap);
    }

    const collect = (): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, el] of inputs) {
        out[k] = el instanceof HTMLInputElement && el.type === 'checkbox'
          ? String(el.checked)
          : el.value;
      }
      return out;
    };

    const done = (val: Record<string, string> | null) => { closeOverlay(); resolve(val); };

    const modal = h('div', { class: `modal${opts.wide ? ' modal--wide' : ''}` },
      h('div', { class: 'modal__head' },
        h('div', { class: 'modal__title', text: opts.title }),
        opts.meta ? h('div', { class: 'modal__meta', text: opts.meta }) : null,
      ),
      body,
      h('div', { class: 'modal__foot' },
        h('div', { class: 'modal__hint', text: 'Ctrl+Enter kaydet · Esc vazgeç' }),
        opts.onDelete
          ? h('button', {
              class: 'btn', text: 'Sil',
              style: { color: 'var(--danger)' },
              onclick: () => { closeOverlay(); opts.onDelete?.(); resolve(null); },
            })
          : null,
        h('button', { class: 'btn push', text: 'Vazgeç', onclick: () => done(null) }),
        h('button', {
          class: 'btn btn--primary',
          text: opts.saveLabel ?? 'Kaydet',
          onclick: () => done(collect()),
        }),
      ),
    );

    const overlay = h('div', {
      class: 'overlay overlay--center',
      onclick: (e) => { if (e.target === overlay) done(null); },
      onkeydown: (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); done(null); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(collect()); }
      },
    }, modal);

    document.body.append(overlay);
    openOverlay = overlay;
    const first = [...inputs.values()][0];
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
  });
}

/* ------------------------------------------------- sekmeli hızlı yakalama */

/**
 * Uygulama içi hızlı yakalama (Ctrl+Shift+N / "+ Hızlı yakala").
 *
 * Alt+Q penceresiyle AYNI formu kullanır (`capture-form.ts`) — sekmeler,
 * saat seçici, kalıp çipleri, Gönder düğmesi ve kısayollar birebir aynı.
 */
export function capturePrompt(initial: CaptureKind = 'not'): Promise<CaptureResult | null> {
  closeOverlay();
  return new Promise((resolve) => {
    let settled = false;
    const done = (res: CaptureResult | null) => {
      if (settled) return;
      settled = true;
      closeOverlay();
      resolve(res);
    };

    const form = buildCaptureForm({
      initial,
      variant: 'modal',
      onSubmit: (res) => done(res),
      onClose: () => done(null),
    });

    const overlay = h('div', {
      class: 'overlay overlay--capture',
      onclick: (e) => { if (e.target === overlay) done(null); },
    }, form.el);

    document.body.append(overlay);
    openOverlay = overlay;
    form.focus();
  });
}

/* ---------------------------------------------------------- alarm kartı */

/**
 * Zamanı gelen hatırlatıcı için ekranda kalan kart.
 * Windows toast'ı görünmese bile (portable exe) bu kart her zaman çıkar.
 */
export function alarmCard(
  title: string,
  note: string,
  onDone: () => void,
  onSnooze: (min: number) => void,
): void {
  const layer = h('div', { class: 'alarm' },
    h('div', { class: 'alarm__head' },
      h('span', { class: 'alarm__bell', text: '⏰' }),
      h('div', { style: { minWidth: '0' } },
        h('div', { class: 'alarm__title', text: title }),
        note ? h('div', { class: 'alarm__note', text: note }) : null,
      ),
      h('button', {
        class: 'alarm__x push', text: '×', title: 'kapat',
        onclick: () => layer.remove(),
      }),
    ),
    h('div', { class: 'alarm__foot' },
      h('button', { class: 'mini-btn', text: '10 DK ERTELE', onclick: () => { onSnooze(10); layer.remove(); } }),
      h('button', { class: 'mini-btn', text: '1 SAAT', onclick: () => { onSnooze(60); layer.remove(); } }),
      h('button', { class: 'btn btn--primary push', text: 'Tamam', onclick: () => { onDone(); layer.remove(); } }),
    ),
  );
  document.body.append(layer);
}

export function modalIsOpen(): boolean {
  return openOverlay !== null;
}

export function clearBody(el: HTMLElement): void {
  clear(el);
}
