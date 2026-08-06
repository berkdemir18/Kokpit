# KOKPİT — Tasarım Sözleşmesi

Bu belge, Berk'in Claude Design ile yaptığı tasarımın koda nasıl bağlandığını ve
görünümü değiştirmek için nereye dokunulacağını anlatır.

## Tek gerçek kaynak: `src/styles/tokens.css`

Kodun hiçbir yerinde renk/gölge/yarıçap **sabit yazılmaz**. Her şey CSS
değişkeninden gelir. Rengi/temayı değiştirmek için sadece bu dosyayı düzenle;
mantık (`.ts`) dosyalarına dokunmaya gerek yok.

Mevcut değerler doğrudan tasarımdan alındı (koyu + camgöbeği neon):

| Token grubu | Örnekler |
|---|---|
| Yüzeyler | `--bg #0b0c0f`, `--surface #121419`, `--surface-2 #16181e`, `--input-bg #0e1014` |
| Kenarlar | `--line`, `--border #23262e`, `--border-hover #343945` |
| Metin | `--text #e7e9ee`, `--text-2 #cfd3db`, `--dim` … `--dim-5` (kademeli gri) |
| Vurgu/durum | `--accent #57b6ff`, `--success #6ee7a8`, `--warn #efc770`, `--danger #ef7a72` |
| Heatmap | `--heat-0` … `--heat-4` (5 kademe) |
| Tipografi | `--font-ui` (IBM Plex Sans), `--font-mono` (IBM Plex Mono), `--fs-*` ölçek |

> **Not (2026-08-04):** `--fs-*` ölçeğinin küçük ucu okunabilirlik için ~1–1.5px
> büyütüldü (eski tasarım değerleri `tokens.css` içinde yorum olarak duruyor).
> Daha küçük/daha büyük istersen sadece o bloğu değiştir. Ayrıca ikincil meta
> satırları için tek bir `.sub-text` sınıfı var — dağınık inline mono stiller
> onun yerini aldı.
| Ölçü | `--r-*` yarıçap, `--sidebar-w`, `--bar-h`, `--shadow-*` |

> Vurgu rengi çalışma anında da değişebilir: Ayarlar → Görünüm (4 hazır renk).
> Bu, `--accent`, `--accent-glow`, `--heat-4` değişkenlerini `store.applyAccent()`
> ile günceller. Kalıcı tema için yine `tokens.css`.

## Fontlar

`src/fonts/` içine gömülü (IBM Plex Sans + Mono, latin + latin-ext, 400/500/600).
İnternet gerekmez — uygulama tamamen çevrimdışı. `src/styles/fonts.css` bunları
`@font-face` ile tanımlar.

## Bileşen envanteri: `src/styles/components.css`

Her sınıf sadece token kullanır. Ana bileşenler ve durumları:

- **Kabuk:** `.app-shell`, `.sidebar`, `.nav-item` (`.is-active`), `.topbar`,
  `.searchbox`, `.capture-btn`, `.content`
- **Kart:** `.card`, `.card__head/__title/__meta/__body`, `.card--pad`
- **İstatistik:** `.tile` (`.tile--static`), `.tile__label/__num/__unit/__note`,
  `.stat-strip`
- **İlerleme:** `.bar` (`.bar--4/5/8`), `.bar__fill`
- **Liste/tablo:** `.line-row`, `.table__head`, `.table__row`, `.tree-row`
- **Etiket/rozet:** `.pill`, `.tag`, `.chip` (`.is-on`), `.kind-badge`, `.checkbox`
  (`.is-on`, `--lg/--sm`)
- **Buton:** `.btn` (`.btn--primary/--ghost/--mono/--block`), `.mini-btn`
- **Sekme:** `.segmented` (`.segmented__item.is-active`), `.tabs`
- **İzleme:** `.poster-grid`, `.poster-card`, `.poster` + `__kind/__rating/__ep/__bump`
- **Not:** `.note-item` (`.is-active`), `.note-body`, `.note-md` (markdown çıktısı)
- **Grafik:** `.chart`, `.chart__bar` (`--muted`), `.dist-row`
- **Katman:** `.overlay`, `.modal`, `.palette`, `.capture`, `.toast`, `.empty-state`

Durum sınıfları: `hover` (CSS `:hover`), seçili (`.is-active`/`.is-on`),
boş (`.empty-state`).

## Ekran yerleşimleri

Her modül `src/views/<ad>.ts` içinde; DOM'u `src/ui/dom.ts` `h()` yardımcısıyla kurar.

- **Bugün** (`dashboard.ts`): tek satır özet → solda hızlı not kutusu ve son
  notlar | sağda bugünün ajandası ve alışkanlık listesi.
- **İzleme** (`watch.ts`): araç çubuğu (durum sekmeleri + filtre çipleri + arama +
  görünüm/ekle) → istatistik şeridi → poster ızgarası **veya** liste tablosu.
  Karta tıklayınca **hızlı detay paneli** açılır (`.detail-body`): 1–10 puan şeridi
  (`.rating-dot`), durum düğmeleri, dizi için sezon/bölüm sayacı, yorum alanı.
  12 alanlı tam form yalnızca "Tüm alanları düzenle" ile açılır.
  Arama yazarken sekme filtresi devre dışı kalır (kayıt hangi sekmedeyse bulunur).

- **Hedefler** (`goals.ts`): sol alışkanlık kartları (91 günlük mini heatmap) |
  sağ hedef kartları + haftalık özet grafiği.
- **Notlar** (`notes.ts`): sol not listesi | sağ editör. Sadeleştirildi: ayrı
  düzenleme modalı yok — başlık, gövde ve etiketler yerinde düzenlenip
  otomatik kaydediliyor. `ÖNİZLE` markdown çıktısına geçer.
- **İstatistik** (`stats.ts`): 5 yıllık kutu → aylık grafik | dağılımlar.
- **Ayarlar** (`settings.ts`): sol veri/yedek/tema | sağ kısayollar/export.

## Değiştirmek istersen

- **Renk/tema:** yalnız `tokens.css`.
- **Boşluk/köşe/gölge:** `tokens.css` (`--r-*`, `--shadow-*`) veya `components.css`.
- **Bir bileşenin görünümü:** `components.css` içindeki ilgili sınıf.
- **Yerleşim/içerik:** ilgili `views/*.ts`.

İskelet, tasarım katmanı olmadan da (token değerleri değişse bile) çalışır ve
okunur kalır; tasarım her zaman üstüne giydirilir.
