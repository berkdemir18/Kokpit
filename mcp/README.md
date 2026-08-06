# Kokpit MCP

Kokpit'in verisini yapay zekâ asistanlarına **salt okunur** açan MCP sunucusu.
Film/dizi takibi, notlar, hedefler/alışkanlıklar, hatırlatıcılar ve takvim —
hepsi araç olarak sorulabiliyor.

Veriyi **hiçbir araç değiştirmez**. Yazma sadece Kokpit uygulamasından yapılır.

## Kurulum

```bash
cd <proje>\mcp && npm install
```

Node 18+ yeterli (kurulumda 24.17 ile test edildi).

## Bağlama

**Claude Code** — kurulu (`claude mcp add kokpit -s user -- node <proje>\mcp\server.js`).
Kontrol: `claude mcp list`.

**OpenCode** — `~/.config/opencode/opencode.jsonc` içindeki `mcp.kokpit` girdisi.

**Diğer istemciler** (Cursor, Codex, Gemini CLI, Claude Desktop…) aynı stdio komutunu ister:

```json
{
  "mcpServers": {
    "kokpit": { "command": "node", "args": ["<proje>\\mcp\\server.js"] }
  }
}
```

## Araçlar

| Araç | Ne yapar |
|---|---|
| `kokpit_ozet` | Genel durum: izleme sayıları, şu an izlenen diziler ve kalınan bölüm, hedefler ve alışkanlıklar, yaklaşan hatırlatıcılar, son notlar. **İlk buraya bakılır.** |
| `izleme_ara` | Film/dizi filtreleme: metin, tür (film/dizi), durum, etiket, min puan, yapım/izlenme yılı, sıralama, limit |
| `izleme_detay` | Tek kayıt: puan, tür, yorum, kiminle; dizide sezon sezon bölüm listesi + sırada gelen bölüm |
| `izleme_istatistik` | Ay/tür dağılımı, puan ortalaması ve dağılımı, en yüksek puanlılar, izlenen bölüm sayısı |
| `notlar_ara` | Notlarda/sayfalarda başlık + gövde + etiket + kategori araması, eşleşen satırdan alıntı |
| `not_oku` | Notun tam içeriği markdown olarak (bloklar, yapılacaklar, tablolar, kod, özellikler, ilişkiler, alt sayfalar) |
| `hedefler_aliskanliklar` | Hedefler + kilometre taşları; alışkanlıklarda güncel seri ve haftalık durum |
| `ajanda` | Verilen gün aralığındaki hatırlatıcılar (gecikenler dahil) ve takvim etkinlikleri |
| `son_hareketler` | Tüm modüllerde son değişiklikler tek akışta, güne göre gruplu |

## Veri kaynağı

Varsayılan: `%APPDATA%\com.berk.kokpit\data.json`
Değiştirmek için `KOKPIT_DATA` ortam değişkenine tam yol ver (yedek dosyayı incelemek için kullanışlı).

Dosya `mtime`'a göre önbelleğe alınır — Kokpit veriyi kaydeder kaydetmez sunucu
yeni hâli okur, yeniden başlatmak gerekmez. Şema v4 (eski `notes`) ve v5
(bloklu `pages`) dosyalarının ikisi de okunur.

## Test

```bash
cd <proje>\mcp && npm test
```

Sunucuyu gerçek stdio üzerinden başlatır, bütün araçları çağırır, boş/hatalı
çıktı ve bilinmeyen kayıt davranışını kontrol eder.
