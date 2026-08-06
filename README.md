# Kokpit

Kokpit, tek bir masaüstü uygulamasında Notion tarzı notlar, film/dizi takibi, hedef ve alışkanlıklar, hatırlatıcı ve takvim tutan kişisel bir takip uygulamasıdır. Windows için Tauri v2 ile derlenir, verisini tamamen yerelde saklar ve internete bağlanmadan çalışır.

![sürüm](https://img.shields.io/badge/s%C3%BCr%C3%BCm-0.8-blue) ![platform](https://img.shields.io/badge/platform-Windows-lightgrey) ![lisans](https://img.shields.io/badge/lisans-MIT-green)

## Yapay Zekâ Kullanımı

Bu uygulama; tasarım, geliştirme, hata ayıklama ve paketleme süreçlerinde yapay zekâ araçlarının desteğiyle geliştirilmiştir. Arayüz iskeleti Claude ile tasarlanmış, kod Claude Code ile yazılmıştır.

## Kurulum

En kolay yol: [Releases](../../releases) bölümünden indirin.

- `Kokpit-v0.8.exe` — taşınabilir sürüm, kurulum gerektirmez.
- `Kokpit_0.8_kurulum.exe` — NSIS kurulumu (yalnızca geçerli kullanıcıya kurar).

Windows SmartScreen uyarı verirse "Ek bilgi" → "Yine de çalıştır" ile geçilebilir; paket imzalı değildir.

## Modüller

| Modül | İçerik |
|---|---|
| **Bugün** | Not ağırlıklı gösterge paneli, hızlı not kutusu, günün ajandası, bugünün alışkanlıkları |
| **Notlar** | Blok tabanlı Notion mantığı: 18 blok türü, iç içe sayfa, ilişki ve geri bağlantı, sayfa → veritabanı (tablo/liste/pano/galeri/takvim) |
| **İzleme** | Film ve dizi takibi, sezon-bölüm sayacı, puan, etiket, Geçmiş akışı, TMDB ile poster/bölüm listesi zenginleştirme, Trakt içe aktarma |
| **Hedefler** | Hedefler, kilometre taşları, alışkanlık serileri ve mini ısı haritası |
| **Takvim & Hatırlatıcı** | Ay ızgarası, tekrar eden hatırlatıcılar, doğal dil girişi ("yarın 14:00 diş hekimi"), Windows bildirimi, Google Takvim salt-okunur iCal içe aktarma |
| **İstatistik** | SVG grafiklerle üç sekmelik özet (genel / izleme / alışkanlık) |
| **Ayarlar** | Tema, modül renkleri, veri sıfırlama, Obsidian dışa aktarma |

Uygulama geneli: `Ctrl+K` komut paleti, `Alt+Q` global hızlı yakalama penceresi, sistem tepsisi, atomik veri yazma + otomatik yedek (son 10), Obsidian markdown dışa aktarma.

İlk açılışta dört adımlık bir tanıtım turu çıkar (ne olduğu → günlük kullanım → takip modülleri → kısayollar). Yalnızca temiz kurulumda otomatik açılır; sonradan Ayarlar → Kısayollar → **Öğreticiyi göster** ile tekrar açılabilir.

## MCP sunucusu

`mcp/` altında, Kokpit verisini yapay zekâ asistanlarına **salt okunur** açan bir MCP (Model Context Protocol) sunucusu bulunur. 9 araç sunar: genel özet, izleme arama/detay/istatistik, not arama ve okuma, hedefler/alışkanlıklar, ajanda, son hareketler. Hiçbir araç veriyi değiştirmez — tek yazıcı Kokpit uygulamasıdır.

Ayrıntı ve istemci kurulumu için [mcp/README.md](./mcp/README.md).

## Veri

Veri tek bir dosyada tutulur:

```
%APPDATA%\com.berk.kokpit\data.json
```

Yazma atomiktir ve her açılışta yedek alınır (son 10 yedek saklanır). Uygulama TMDB ve Google Takvim dışında hiçbir yere bağlanmaz; bu ikisi de yalnızca Ayarlar'dan kendi anahtarınızı/adresinizi girerseniz çalışır. Depoda gömülü anahtar yoktur.

## Geliştirme

Gereksinimler: Node.js 18+, Rust toolchain, Windows için MSVC derleme araçları.

```bash
npm install
npm run dev          # Vite geliştirme sunucusu
npm run tauri dev    # Masaüstü penceresiyle
```

Kalite komutları:

```bash
npm run build        # tsc --noEmit + vite build
npm test             # vitest
npm run tauri build  # exe + NSIS kurulumu üretir
```

## Mimari

Framework yok — saf TypeScript + Vite, arayüz doğrudan DOM üzerinden kuruluyor.

```
src/core/      model, store, bloklar, sayfalar, hatırlatıcılar, TMDB
src/ui/        blok editörü, hızlı yakalama formu, zaman seçici, komut paleti, öğretici, kabuk
src/views/     modül ekranları (dashboard, notes, agenda, watch, goals, stats, settings)
src/styles/    tokens.css — tüm renk ve tipografi tek dosyada
src-tauri/     Rust tarafı: dosya deposu, bildirim, hatırlatıcı zamanlayıcı
mcp/           salt okunur MCP sunucusu
tests/         vitest
```

Renk ve tipografi kuralları için [docs/DESIGN-CONTRACT.md](./docs/DESIGN-CONTRACT.md): görsel değerler `styles/tokens.css` içinde izole tutulur, mantığa dokunmadan değiştirilebilir.

## Lisans

MIT — [LICENSE](./LICENSE)

`src/fonts/` altındaki IBM Plex Sans ve IBM Plex Mono yazı tipleri IBM'e aittir ve SIL Open Font License 1.1 ile dağıtılır.
