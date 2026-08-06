/**
 * İlk açılış öğreticisi.
 *
 * Yalnızca diskte veri dosyası yokken (temiz kurulum) otomatik açılır —
 * mevcut kullanıcıların verisine ve akışına dokunmaz. Ayarlar'daki
 * "Öğreticiyi göster" düğmesiyle her zaman tekrar açılabilir.
 *
 * Sekiz modülü tek tek gezdirmek yerine anlatım dört adımda toplandı:
 * ne olduğu → günlük kullanım → takip modülleri → kısayollar ve veri.
 * Amaç tur izletmek değil, kullanıcının ilk beş dakikada nereye
 * yazacağını bilmesi.
 */

import { h } from './dom';
import { icon, IconName } from './icons';
import { mountOverlay, closeOverlay } from './overlay';
import { navigate, ViewId } from '../core/router';

interface Item {
  view: ViewId;
  iconName: IconName;
  title: string;
  desc: string;
}

interface Step {
  badge: string;
  title: string;
  lead: string;
  items?: Item[];
  keys?: [string, string][];
  foot?: string;
}

const STEPS: Step[] = [
  {
    badge: 'BAŞLANGIÇ',
    title: 'Kokpit’e hoş geldin',
    lead:
      'Kokpit; notlarını, izlediklerini, hedeflerini ve hatırlatıcılarını tek pencerede toplayan ' +
      'kişisel bir takip uygulaması. İnternete bağlanmadan çalışır, verin bilgisayarından çıkmaz.',
    items: [
      { view: 'dashboard', iconName: 'dashboard', title: 'Sol taraf modüller', desc: 'Yedi modül var; sırayla 1–7 tuşlarıyla da geçebilirsin.' },
      { view: 'dashboard', iconName: 'brand', title: 'Bu ekranı istediğin zaman aç', desc: 'Ayarlar → “Öğreticiyi göster” ile bu tur tekrar başlar.' },
    ],
    foot: 'Şu an gördüğün kayıtlar örnek veridir — Ayarlar’dan tek tuşla temizlenir.',
  },
  {
    badge: 'GÜNLÜK KULLANIM',
    title: 'Aklına geleni nereye yazacaksın?',
    lead:
      'Çoğu gün üç ekran yeter. Aklına bir şey geldiğinde uygulamayı açmanı bile beklemez: ' +
      'Alt+Q ile küçük bir kutu açılır, yazarsın, kapanır.',
    items: [
      { view: 'dashboard', iconName: 'dashboard', title: 'Bugün', desc: 'Açılış ekranı. Hızlı not kutusu, bugünün ajandası ve alışkanlık listesi burada.' },
      { view: 'notes', iconName: 'notes', title: 'Notlar', desc: 'Blok tabanlı editör: “/” yaz, blok menüsü açılsın. Başlık, yapılacak listesi, kod, tablo, iç içe sayfa.' },
      { view: 'agenda', iconName: 'agenda', title: 'Takvim & Hatırlatıcı', desc: '“yarın 14:00 diş hekimi” diye yaz, tarihi kendi ayıklar. Zamanı gelince Windows bildirimi gelir.' },
    ],
  },
  {
    badge: 'TAKİP',
    title: 'İlerlemeni takip eden modüller',
    lead: 'Bunlar zaman içinde dolar. Bugün boş görünmeleri normal — kullandıkça anlam kazanırlar.',
    items: [
      { view: 'watch', iconName: 'watch', title: 'İzleme', desc: 'Film ve dizi takibi. Dizide kaçıncı bölümde kaldığını tutar; puan, etiket ve geçmiş akışı var.' },
      { view: 'goals', iconName: 'goals', title: 'Hedefler', desc: 'Hedefler, kilometre taşları ve alışkanlık serileri. Seriyi kırmamak asıl mesele.' },
      { view: 'stats', iconName: 'stats', title: 'İstatistik', desc: 'Yukarıdaki her şeyin grafiklerle özeti.' },
    ],
  },
  {
    badge: 'SON',
    title: 'Kısayollar ve verin',
    lead: 'Bu dördünü ezberlersen uygulamayı fareye dokunmadan kullanırsın.',
    keys: [
      ['Alt + Q', 'Hızlı yakalama — uygulama kapalıyken bile açılır'],
      ['Ctrl + K', 'Komut paleti — her şeye buradan ulaşılır'],
      ['1 – 7', 'Modüller arası geçiş'],
      ['Esc', 'Açık pencereyi kapat'],
    ],
    foot:
      'Verin %APPDATA%\\com.berk.kokpit\\data.json içinde, senin bilgisayarında durur. ' +
      'Her açılışta yedeklenir (son 10 yedek saklanır). Ayarlar’dan Obsidian’a markdown olarak dışa aktarabilirsin.',
  },
];

/** Turu açar. `onDone` yalnızca tur bittiğinde/atlandığında çağrılır. */
export function openOnboarding(onDone?: () => void): void {
  let step = 0;

  const overlay = h('div', { class: 'overlay overlay--center' });
  const card = h('div', { class: 'onb' });
  overlay.append(card);

  const finish = (): void => {
    window.removeEventListener('keydown', onKey, true);
    closeOverlay();
    onDone?.();
  };

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(step + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(); }
  }

  function go(next: number): void {
    if (next < 0) return;
    if (next >= STEPS.length) { finish(); return; }
    step = next;
    draw();
  }

  function draw(): void {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;

    card.replaceChildren(
      h('div', { class: 'onb__head' },
        h('span', { class: 'onb__badge', text: s.badge }),
        h('span', { class: 'onb__count', text: `${step + 1} / ${STEPS.length}` }),
      ),
      h('div', { class: 'onb__body' },
        h('h2', { class: 'onb__title', text: s.title }),
        h('p', { class: 'onb__lead', text: s.lead }),

        s.items
          ? h('div', { class: 'onb__items' },
              ...s.items.map((it) =>
                h('div', { class: 'onb__item' },
                  h('span', { class: 'onb__icon', style: { color: `var(--c-${it.view})` } }, icon(it.iconName, 16)),
                  h('div', {},
                    h('div', { class: 'onb__item-title', text: it.title }),
                    h('div', { class: 'onb__item-desc', text: it.desc }),
                  ),
                ),
              ),
            )
          : null,

        s.keys
          ? h('div', { class: 'onb__keys' },
              ...s.keys.map(([k, what]) =>
                h('div', { class: 'onb__key-row' },
                  h('kbd', { class: 'onb__kbd', text: k }),
                  h('span', { class: 'onb__key-what', text: what }),
                ),
              ),
            )
          : null,

        s.foot ? h('p', { class: 'onb__foot', text: s.foot }) : null,
      ),
      h('div', { class: 'onb__nav' },
        h('div', { class: 'onb__dots' },
          ...STEPS.map((_, i) =>
            h('button', {
              class: 'onb__dot' + (i === step ? ' is-on' : ''),
              title: `${i + 1}. adım`,
              onclick: () => go(i),
            }),
          ),
        ),
        h('button', { class: 'btn btn--ghost', text: 'Atla', onclick: finish }),
        step > 0
          ? h('button', { class: 'btn', text: 'Geri', onclick: () => go(step - 1) })
          : null,
        h('button', {
          class: 'btn btn--primary',
          text: last ? 'Başla' : 'İleri',
          onclick: () => go(step + 1),
        }),
      ),
    );
  }

  draw();
  mountOverlay(overlay);
  window.addEventListener('keydown', onKey, true);
  // Tur "Bugün" ekranının üstünde başlasın; arkada başka modül durmasın.
  navigate('dashboard');
}
