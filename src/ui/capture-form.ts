/**
 * Hızlı yakalama FORMU — tek kaynak.
 *
 * Aynı form iki yerde kullanılır:
 *  - Alt+Q ile açılan ayrı, çerçevesiz pencere (`capture-window.ts`)
 *  - Uygulama içi Ctrl+Shift+N kutusu / "+ Hızlı yakala" düğmesi (`overlay.ts`)
 *
 * Eskiden ikisi ayrı ayrı yazılmıştı ve birbirinden farklıydı (biri yerli
 * `datetime-local` kullanıyordu, birinde Gönder düğmesi ve kalıp çipleri yoktu).
 * Artık ikisi de burayı kullanır — görünüm ve davranış birebir aynı.
 */

import { Repeat, REPEATS, REPEAT_LABEL } from '../core/model';
import { parseWhen, fmtDT } from '../core/util';
import { h, clear } from './dom';
import { mountWhenPicker } from './when-picker';

export type CaptureKind = 'not' | 'hatırlatıcı' | 'görev';

export interface CaptureResult {
  kind: CaptureKind;
  text: string;
  /** hatırlatıcı için "YYYY-MM-DDTHH:mm". */
  at: string;
  repeat: Repeat;
}

/** [id, etiket, kısayol tuşu, yer tutucu] */
const TABS: [CaptureKind, string, string, string][] = [
  ['not', 'Not', '1', 'Aklındakini yaz… → Gelen Kutusu'],
  ['hatırlatıcı', 'Hatırlatıcı', '2', 'ör: 21.30 anneme telefon · yarın 14:00 diş hekimi'],
  ['görev', 'Görev', '3', 'Yol haritasına görev ekle…'],
];

/**
 * Sık kullanılan kalıplar — tek tıkla doldurur, yazmayı kısaltır.
 * Hatırlatıcı sekmesindeki hazır saat kalıpları (21:30 / yarın 09:00 /
 * cuma 18:00) Berk'in isteğiyle kaldırıldı (2026-08-05): saat zaten alttaki
 * saat seçicisinden veriliyordu, çipler yer kaplıyordu.
 */
const SUGGESTIONS: Record<CaptureKind, string[]> = {
  not: ['Fikir: ', 'Araştır: ', 'Satın al: '],
  'hatırlatıcı': [],
  'görev': ['TryHackMe ', 'Lab: ', 'Oku: '],
};

const HINT: Record<CaptureKind, string> = {
  not: 'Gelen Kutusu\'na düşer',
  'hatırlatıcı': 'saati metnin içine yazabilirsin',
  'görev': 'yol haritasındaki güncel faza eklenir',
};

export interface CaptureFormOptions {
  /** Açılışta seçili sekme. */
  initial?: CaptureKind;
  /** 'window' → ayrı Alt+Q penceresi, 'modal' → uygulama içi kutu. */
  variant: 'window' | 'modal';
  /** Gönderildi (form kendini sıfırlar; kapatma çağıranın işi). */
  onSubmit: (res: CaptureResult) => void;
  /** Esc / × ile kapatıldı. */
  onClose: () => void;
  /** Saat seçici açılıp kapandı — ayrı pencere boyunu buna göre değiştirir. */
  onPicking?: (open: boolean) => void;
}

export interface CaptureForm {
  /** Kutunun kök elemanı (`.cw`). */
  el: HTMLElement;
  focus(): void;
  /** Metni ve seçili zamanı temizler. */
  reset(): void;
  /** Açık saat seçicisini kapatır; açık değilse false döner. */
  closePicker(): boolean;
}

export function buildCaptureForm(opts: CaptureFormOptions): CaptureForm {
  let kind: CaptureKind = opts.initial ?? 'not';
  let manualAt = '';
  let repeat: Repeat = 'none';

  const input = h('textarea', { class: 'cw__input' });
  const tabsEl = h('div', { class: 'cw__tabs' });
  const whenEl = h('div', { class: 'cw__when' });
  const pickerHost = h('div', { class: 'cw__picker' });
  const chipsEl = h('div', { class: 'cw__chips' });
  const hintEl = h('div', { class: 'cw__hint' });

  /* ------------------------------------------------------------- sekmeler */

  const paintTabs = (): void => {
    clear(tabsEl);
    for (const [id, label, key] of TABS) {
      tabsEl.append(h('button', {
        class: `cw__tab${kind === id ? ' is-active' : ''}`,
        dataset: { kind: id },
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { kind = id; paint(); input.focus(); },
      }, label, h('span', { class: 'cw__tabkey', text: key })));
    }
  };

  /* ----------------------------------------------------- zaman + tekrar */

  let closePickerFn: (() => void) | null = null;

  const setPicking = (on: boolean): void => {
    box.classList.toggle('is-picking', on);
    opts.onPicking?.(on);
  };

  const closePicker = (): boolean => {
    if (!closePickerFn) return false;
    closePickerFn();
    closePickerFn = null;
    setPicking(false);
    return true;
  };

  const openPicker = (at: string): void => {
    if (closePicker()) return;
    setPicking(true);
    closePickerFn = mountWhenPicker(pickerHost, {
      value: at,
      onPick: (v) => {
        manualAt = v;
        closePickerFn = null;
        setPicking(false);
        paintWhen();
        input.focus();
      },
      onCancel: () => { closePickerFn = null; setPicking(false); input.focus(); },
    });
  };

  const paintWhen = (): void => {
    clear(whenEl);
    if (kind !== 'hatırlatıcı') {
      whenEl.style.display = 'none';
      pickerHost.style.display = 'none';
      return;
    }
    whenEl.style.display = 'flex';
    pickerHost.style.display = '';
    const at = manualAt || parseWhen(input.value).at;
    whenEl.append(
      h('button', {
        class: 'cw__chip cw__chip--time',
        title: 'gün ve saati seç',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => openPicker(at),
      }, '⏰ ', fmtDT(at), h('span', { class: 'cw__chipEdit', text: '▾' })),
      (() => {
        const sel = h('select', {
          class: 'cw__repeat',
          onchange: (e) => { repeat = (e.target as HTMLSelectElement).value as Repeat; },
        });
        for (const r of REPEATS) {
          const o = h('option', { value: r, text: REPEAT_LABEL[r] });
          if (r === repeat) o.selected = true;
          sel.append(o);
        }
        return sel;
      })(),
    );
  };

  /* ---------------------------------------------------------- kalıp çipleri */

  const paintChips = (): void => {
    clear(chipsEl);
    const list = SUGGESTIONS[kind];
    chipsEl.style.display = list.length ? 'flex' : 'none';
    for (const s of list) {
      chipsEl.append(h('button', {
        class: 'cw__chip',
        text: s.trim(),
        onmousedown: (e) => e.preventDefault(),
        onclick: () => {
          input.value = s + input.value;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
          paintWhen();
        },
      }));
    }
  };

  const paint = (): void => {
    const def = TABS.find(([id]) => id === kind);
    input.placeholder = def ? def[3] : '';
    hintEl.textContent = HINT[kind];
    paintTabs();
    paintWhen();
    paintChips();
  };

  /* ------------------------------------------------------------- gönderme */

  const reset = (): void => {
    input.value = '';
    manualAt = '';
    repeat = 'none';
    closePicker();
    paint();
  };

  const send = (): void => {
    const raw = input.value.trim();
    if (!raw) { input.focus(); return; }
    const p = parseWhen(raw);
    const text = kind === 'hatırlatıcı' && p.found ? (p.text || raw) : raw;
    const res: CaptureResult = { kind, text, at: manualAt || p.at, repeat };
    reset();
    opts.onSubmit(res);
  };

  /* ------------------------------------------------------------- klavye */

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (closePicker()) { input.focus(); return; }
      opts.onClose();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const i = TABS.findIndex(([id]) => id === kind);
      kind = TABS[(i + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length][0];
      paint();
      input.focus();
      return;
    }
    // Ctrl+1/2/3 (ya da Alt+1/2/3) ile sekme
    if ((e.ctrlKey || e.altKey) && e.key >= '1' && e.key <= '3') {
      e.preventDefault();
      kind = TABS[Number(e.key) - 1][0];
      paint();
      input.focus();
    }
  };

  /* --------------------------------------------------------------- kutu */

  const box = h('div', { class: `cw${opts.variant === 'modal' ? ' cw--modal' : ''}` },
    h('div', { class: 'cw__head' },
      h('span', { class: 'cw__dot' }),
      h('span', { class: 'cw__brand', text: 'HIZLI YAKALAMA' }),
      h('button', {
        class: 'cw__close push', text: '×', title: 'kapat (Esc)',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => opts.onClose(),
      }),
    ),
    tabsEl,
    input,
    whenEl,
    pickerHost,
    chipsEl,
    h('div', { class: 'cw__foot' },
      hintEl,
      h('span', { class: 'cw__keys push', text: '⏎ gönder · Esc kapat' }),
      h('button', {
        class: 'cw__send', text: 'Gönder',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => send(),
      }),
    ),
  );

  box.addEventListener('keydown', onKey);
  input.addEventListener('input', () => { if (kind === 'hatırlatıcı' && !manualAt) paintWhen(); });

  paint();

  return {
    el: box,
    focus: () => input.focus(),
    reset,
    closePicker,
  };
}
