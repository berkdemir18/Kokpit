/**
 * Android tarzı gün + saat seçici.
 *
 * Tarayıcının `datetime-local` yerlisi çerçevesiz/hep-üstte pencerede
 * kullanılamıyordu: açılan yerli takvim odağı çalıyor, pencere kapanıyordu.
 * Bu seçici tamamen uygulama içinde çizilir — odak hiç kaybolmaz.
 *
 * Düzen: üstte gün şeridi (bugün/yarın/… + takvim), altta saat ve dakika
 * tekerleri (kaydırınca ortadaki değer seçilir), en altta hazır saatler.
 *
 * v0.7.7 — tekerler yeniden yazıldı:
 *  - Değer artık tarayıcının kaydırma konumundan ÖLÇÜLMÜYOR. Eskiden her
 *    değişimde tüm seçici yeniden çiziliyor, sonra scrollTop elle
 *    ayarlanıyordu; bu da yeni bir scroll olayı doğurup ölçümü tetikliyordu →
 *    ekran titriyor, saat ileri geri gidip geliyordu. Şimdi seçili değeri
 *    yalnızca biz belirliyoruz, kaydırma sadece görüntüyü ortalıyor.
 *  - Fare tekerini yukarı çevirmek değeri KÜÇÜLTÜR (13 → 12); aşağı büyütür.
 *  - Dakika tekeri 5'er değil BİRER birer: istenen her dakika seçilebilir.
 */

import { h, clear } from './dom';
import {
  dayKey, parseDT, parseDay, addDays, monthGrid, fullDate, MONTH_SHORT,
} from '../core/util';

const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const GUN_UZUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Hazır saatler — en sık kurulan hatırlatıcılar tek dokunuşta. */
const PRESETS: [string, string][] = [
  ['08:00', 'sabah'],
  ['12:30', 'öğle'],
  ['19:00', 'akşam'],
  ['21:30', 'gece'],
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

export interface WhenPickerOptions {
  /** Başlangıç değeri "YYYY-MM-DDTHH:mm". */
  value: string;
  onPick: (at: string) => void;
  onCancel: () => void;
}

/** Tek bir teker (saat ya da dakika). Değeri dışarıdan da ayarlanabilir. */
interface Wheel {
  el: HTMLElement;
  /** Seçili değeri değiştirir (onChange tetiklemeden). */
  set(v: number): void;
  /** DOM'a girdikten sonra seçili değeri ortalar. */
  layout(): void;
}

function makeWheel(
  values: number[],
  initial: number,
  onChange: (v: number) => void,
): Wheel {
  const list = h('div', { class: 'wp__wheel' });
  const cells = new Map<number, HTMLElement>();

  // Üst/alt boşluk: ilk ve son değer de ortaya gelebilsin.
  list.append(h('div', { class: 'wp__pad' }));
  for (const v of values) {
    const cell = h('button', {
      class: 'wp__cell',
      dataset: { v: String(v) },
      text: pad2(v),
      // Tıklama metin kutusundan odağı çalmasın (ayrı pencere kapanıyordu).
      onmousedown: (e) => e.preventDefault(),
      onclick: () => pick(v),
    });
    cells.set(v, cell);
    list.append(cell);
  }
  list.append(h('div', { class: 'wp__pad' }));

  let cur = initial;

  const mark = (): void => {
    for (const [v, el] of cells) el.classList.toggle('is-on', v === cur);
  };

  const center = (smooth: boolean): void => {
    const el = cells.get(cur);
    if (!el || !list.clientHeight) return;
    const top = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
    // Kaydırma yalnız görüntü içindir; seçili değeri buradan okumuyoruz.
    list.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  };

  const set = (v: number): void => {
    if (!cells.has(v)) return;
    cur = v;
    mark();
    center(true);
  };

  const pick = (v: number): void => {
    if (v === cur) return;
    set(v);
    onChange(v);
  };

  /** Fare tekeri: yukarı → önceki (küçük) değer, aşağı → sonraki. */
  list.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    if (!e.deltaY) return;
    const i = values.indexOf(cur);
    const next = values[Math.min(values.length - 1, Math.max(0, i + (e.deltaY > 0 ? 1 : -1)))];
    pick(next);
  }, { passive: false });

  mark();
  return {
    el: list,
    set,
    layout: () => { center(false); },
  };
}

/**
 * Seçiciyi verilen kabın içine çizer. Kapanınca kap boşaltılır.
 * Dönen fonksiyon seçiciyi dışarıdan kapatır.
 */
export function mountWhenPicker(host: HTMLElement, opts: WhenPickerOptions): () => void {
  const start = parseDT(opts.value);
  let day = Number.isNaN(start.getTime()) ? dayKey() : dayKey(start);
  let hour = Number.isNaN(start.getTime()) ? 9 : start.getHours();
  let minute = Number.isNaN(start.getTime()) ? 0 : start.getMinutes();
  let calOpen = false;
  let calYear = parseDay(day).getFullYear();
  let calMonth = parseDay(day).getMonth();

  const close = () => { clear(host); host.classList.remove('is-open'); };

  const value = () => `${day}T${pad2(hour)}:${pad2(minute)}`;

  /* ----------------------------------------------------------- gün şeridi */

  const dayRow = (): HTMLElement => {
    const row = h('div', { class: 'wp__days' });
    for (let i = 0; i < 7; i++) {
      const d = addDays(new Date(), i);
      const key = dayKey(d);
      const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : GUN_KISA[(d.getDay() + 6) % 7];
      row.append(
        h('button', {
          class: `wp__day${key === day ? ' is-on' : ''}`,
          onmousedown: (e) => e.preventDefault(),
          onclick: () => { day = key; calOpen = false; paint(); },
        },
          h('div', { class: 'wp__dayName', text: label }),
          h('div', { class: 'wp__dayNum', text: String(d.getDate()) }),
        ),
      );
    }
    row.append(
      h('button', {
        class: `wp__day wp__day--more${calOpen ? ' is-on' : ''}`,
        title: 'takvimden seç',
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { calOpen = !calOpen; paint(); },
      },
        h('div', { class: 'wp__dayName', text: 'başka' }),
        h('div', { class: 'wp__dayNum', text: '▦' }),
      ),
    );
    return row;
  };

  const calendar = (): HTMLElement => {
    const step = (delta: number) => {
      calMonth += delta;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0; calYear++; }
      paint();
    };
    const grid = h('div', { class: 'wp__cal' });
    for (const g of GUN_KISA) grid.append(h('div', { class: 'wp__caldow', text: g }));
    for (const key of monthGrid(calYear, calMonth)) {
      const d = parseDay(key);
      grid.append(h('button', {
        class: `wp__calday${d.getMonth() !== calMonth ? ' is-out' : ''}${key === day ? ' is-on' : ''}${key === dayKey() ? ' is-today' : ''}`,
        text: String(d.getDate()),
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { day = key; calOpen = false; paint(); },
      }));
    }
    return h('div', { class: 'wp__calwrap' },
      h('div', { class: 'wp__calhead' },
        h('button', { class: 'wp__calnav', text: '‹', onclick: () => step(-1) }),
        h('div', { class: 'wp__calmon', text: `${MONTH_SHORT[calMonth]} ${calYear}` }),
        h('button', { class: 'wp__calnav', text: '›', onclick: () => step(1) }),
      ),
      grid,
    );
  };

  /* ----------------------------------------------------------------- çizim */

  // Saat/dakika değişince TÜM seçici yeniden çizilmez; yalnız bu üç parça
  // tazelenir. (Tam yeniden çizim tekerleri sıfırlayıp titremeye yol açıyordu.)
  let sumTimeEl: HTMLElement | null = null;
  let presetsEl: HTMLElement | null = null;
  let hourWheel: Wheel | null = null;
  let minuteWheel: Wheel | null = null;

  const paintPresets = (): void => {
    if (!presetsEl) return;
    clear(presetsEl);
    for (const [time, label] of PRESETS) {
      const [ph, pm] = time.split(':').map(Number);
      presetsEl.append(h('button', {
        class: `wp__preset${hour === ph && minute === pm ? ' is-on' : ''}`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => setTime(ph, pm),
      }, h('b', { text: time }), ' ', label));
    }
  };

  /** Saat/dakikayı günceller ve yalnız gerekli parçaları tazeler. */
  function setTime(h24: number, min: number): void {
    const nh = (h24 + 24) % 24;
    const nm = (min + 60) % 60;
    if (nh !== hour) { hour = nh; hourWheel?.set(hour); }
    if (nm !== minute) { minute = nm; minuteWheel?.set(minute); }
    if (sumTimeEl) sumTimeEl.textContent = `${pad2(hour)}:${pad2(minute)}`;
    paintPresets();
  }

  function paint(): void {
    clear(host);
    host.classList.add('is-open');

    const d = parseDay(day);
    sumTimeEl = h('span', { class: 'wp__sumTime push', text: `${pad2(hour)}:${pad2(minute)}` });
    const summary = h('div', { class: 'wp__summary' },
      h('span', { class: 'wp__sumDay', text: `${fullDate(day)} · ${GUN_UZUN[d.getDay()]}` }),
      sumTimeEl,
    );

    hourWheel = makeWheel(
      Array.from({ length: 24 }, (_, i) => i),
      hour,
      (v) => setTime(v, minute),
    );
    minuteWheel = makeWheel(
      Array.from({ length: 60 }, (_, i) => i),
      minute,
      (v) => setTime(hour, v),
    );

    // ▲ yukarıdaki (küçük) değere gider — teker yönüyle aynı mantık.
    const stepBtn = (text: string, title: string, fn: () => void) => h('button', {
      class: 'wp__step', text, title,
      onmousedown: (e) => e.preventDefault(),
      onclick: fn,
    });

    const wheels = h('div', { class: 'wp__wheels' },
      h('div', { class: 'wp__col' },
        stepBtn('▲', 'bir saat geri', () => setTime(hour - 1, minute)),
        hourWheel.el,
        stepBtn('▼', 'bir saat ileri', () => setTime(hour + 1, minute)),
        h('div', { class: 'wp__collabel', text: 'saat' }),
      ),
      h('div', { class: 'wp__colon', text: ':' }),
      h('div', { class: 'wp__col' },
        stepBtn('▲', 'bir dakika geri', () => setTime(hour, minute - 1)),
        minuteWheel.el,
        stepBtn('▼', 'bir dakika ileri', () => setTime(hour, minute + 1)),
        h('div', { class: 'wp__collabel', text: 'dakika' }),
      ),
    );

    presetsEl = h('div', { class: 'wp__presets' });

    host.append(
      h('div', { class: 'wp' },
        summary,
        dayRow(),
        calOpen ? calendar() : null,
        wheels,
        presetsEl,
        h('div', { class: 'wp__foot' },
          h('button', {
            class: 'mini-btn', text: 'ŞİMDİ',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => { const n = new Date(); day = dayKey(n); paint(); setTime(n.getHours(), n.getMinutes()); },
          }),
          h('button', {
            class: 'mini-btn push', text: 'VAZGEÇ',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => { close(); opts.onCancel(); },
          }),
          h('button', {
            class: 'wp__ok', text: 'Tamam',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => { const v = value(); close(); opts.onPick(v); },
          }),
        ),
      ),
    );

    paintPresets();
    // Ölçüm için düzenin oturması gerekiyor.
    requestAnimationFrame(() => { hourWheel?.layout(); minuteWheel?.layout(); });
  }

  paint();
  return close;
}
