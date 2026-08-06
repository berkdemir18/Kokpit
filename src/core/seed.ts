/**
 * İlk açılışta yüklenen örnek veri — uygulama boş bir ekranla değil, tasarımdaki
 * gibi dolu açılsın diye. Ayarlardan "tüm veriyi sıfırla" ile temizlenebilir.
 */

import { DB, emptyDB, emptyPage } from './model';
import { markdownToBlocks } from './blocks';
import { addDays, dayKey, uid } from './util';

export function seedDB(): DB {
  const db = emptyDB();
  const now = new Date().toISOString();
  const today = new Date();
  const d = (back: number) => dayKey(addDays(today, -back));

  /* --- İzleme --- */
  const titles: [string, 'film' | 'dizi', number, number, DB['titles'][0]['status'], string[], string[], number, number, number][] = [
    ['Dune: Part Two', 'film', 2024, 9, 'done', ['bilimkurgu', 'epik'], ['Berk', 'Ece'], 24, 0, 0],
    ['Mr. Robot', 'dizi', 2016, 10, 'active', ['gerilim', 'hacker'], [], 6, 3, 4],
    ['Zodiac', 'film', 2007, 8, 'done', ['polisiye'], ['Berk'], 38, 0, 0],
    ['Severance', 'dizi', 2022, 9, 'active', ['distopya'], ['Ece'], 40, 1, 7],
    ['Sicario', 'film', 2015, 8, 'done', ['aksiyon', 'gerilim'], ['Kaan'], 47, 0, 0],
    ['Whiplash', 'film', 2014, 9, 'done', ['dram', 'müzik'], ['Ece'], 63, 0, 0],
    ['Chernobyl', 'dizi', 2019, 10, 'done', ['dram', 'tarih'], ['Berk'], 82, 5, 5],
    ['Blade Runner 2049', 'film', 2017, 9, 'done', ['bilimkurgu'], ['Kaan'], 96, 0, 0],
    ['Hacksaw Ridge', 'film', 2016, 0, 'planned', ['savaş'], [], 0, 0, 0],
    ['Dark', 'dizi', 2017, 8, 'dropped', ['gizem'], [], 0, 1, 3],
    ['Arrival', 'film', 2016, 8, 'done', ['bilimkurgu'], ['Ece'], 110, 0, 0],
    ['The Prestige', 'film', 2006, 0, 'planned', ['gizem'], [], 0, 0, 0],
  ];
  db.titles = titles.map(([name, kind, year, rating, status, genres, withWho, back, season, episode]) => ({
    id: uid('t'), kind, name, year, genres, status,
    rating: rating || null, posterUrl: '', imdb: '',
    watchedAt: status === 'done' ? d(back) : '',
    withWho, review: '', season, episode, tags: [], createdAt: now, updatedAt: now,
    tmdbId: null, episodes: [], episodesFetchedAt: '',
  }));

  /* --- Alışkanlıklar: örnek kayıtlar --- */
  const habitDefs: [string, DB['habits'][0]['cadence'], number][] = [
    ['Çalışma · 1.5 saat', 'günlük', 5],
    ['Yabancı dil · 20 dk', 'günlük', 7],
    ['Öğrendiğini 3 cümleyle not al', 'günlük', 5],
    ['Spor', 'haftalık', 3],
  ];
  db.habits = habitDefs.map(([name, cadence, targetPerWeek]) => ({
    id: uid('h'), name, cadence, targetPerWeek, archived: false, createdAt: now,
  }));
  db.habits.forEach((hb) => { db.habitLogs[hb.id] = []; });

  /* --- Hedefler: örnek kilometre taşları --- */
  const goalDefs: [string, string, string, [string, boolean][]][] = [
    ['Yeni bir konuya başla', 'öğrenme', dayKey(addDays(today, 45)), [
      ['Kaynak seçildi', false],
      ['İlk hafta tamamlandı', false],
      ['Ara tekrar yapıldı', false],
      ['Bitirme çalışması yazıldı', false],
    ]],
    ['Yabancı dil seviyesini bir kademe yükselt', 'ingilizce', dayKey(addDays(today, 180)), [
      ['Mevcut seviye ölçüldü', false],
      ['İçerikler orijinal dilde takip ediliyor', false],
      ['İlk yabancı dilde özet yazıldı', false],
    ]],
    ['Yılda 40 film/dizi', 'izleme', `${today.getFullYear()}-12-31`, [['İlk 20', false]]],
  ];
  db.goals = goalDefs.map(([title, area, targetDate, ms]) => ({
    id: uid('g'), title, area, targetDate,
    milestones: ms.map(([text, done]) => ({ text, done })),
    status: 'active', note: '', createdAt: now, updatedAt: now,
  }));

  /* --- Notlar --- */
  const noteDefs: [string, string, string[], boolean, string, string][] = [
    ['Blok editörü nasıl çalışır', '# Bloklar\n\nHer satır bir **blok**. Satır başında `/` yazınca blok menüsü açılır.\n\n- [ ] Yapılacak maddesi — kutuya tıkla, işaretlensin\n- [x] İşaretlenmiş madde\n\n> [!bilgi]\n> Böyle bir bilgi kutusu için satıra `> [!bilgi]` yaz.\n\nSeçtiğin metinde biçim çubuğu çıkar: **kalın**, *eğik*, `kod`, ==vurgu==.', ['rehber'], true, '📘', 'mor'],
    ['Haftalık rutin şablonu', '# Haftalık rutin\n\nBu sayfayı kendi düzenine göre değiştir.\n\n- **Pzt–Sal:** derin çalışma\n- **Çar:** okuma\n- **Per:** proje\n- **Cum:** toparlama ve gözden geçirme\n- **Her gün:** 20 dk yabancı dil + 3 cümlelik not\n\nYoğun dönemde süreyi kısalt ama **sıfırlama** — süreklilik miktardan önemli.', ['sistem', 'rutin'], true, '🗓️', 'mavi'],
    ['Sayfa içinde sayfa', '# İç içe yapı\n\nBir sayfanın altına alt sayfa açabilirsin; sol listede ağaç olarak görünür.\n\nBir sayfayı **veritabanına** çevirirsen alt sayfaları satır olur: tablo, liste, pano, galeri ve takvim görünümleriyle bakabilirsin.', ['rehber'], false, '🗂️', 'yeşil'],
    ['Gelen Kutusu · takip edilecekler', 'Buraya sonra bakılacakları at.\nHızlı yakalama (Alt+Q) ile eklediklerin de buraya düşer.', ['gelen-kutusu'], false, '📥', ''],
  ];
  db.pages = noteDefs.map(([title, body, tags, pinned, icon, cover], i) => {
    const page = emptyPage(uid('page'), dayKey(addDays(today, -i * 2)) + 'T14:02:00');
    page.title = title;
    page.blocks = markdownToBlocks(body);
    page.tags = tags.filter((t) => t !== 'gelen-kutusu');
    page.category = tags.includes('gelen-kutusu') ? 'Gelen Kutusu' : '';
    page.favorite = pinned;
    page.icon = icon;
    page.cover = cover;
    page.createdAt = now;
    return page;
  });

  /* --- Hatırlatıcılar: nasıl çalıştığını göstermek için birkaç örnek --- */
  const remDefs: [string, string, string, DB['reminders'][0]['repeat']][] = [
    ['Çalışma · 1.5 saat', dayKey(today), '20:00', 'günlük'],
    ['Yabancı dil · 20 dk', dayKey(today), '22:30', 'günlük'],
    ['Haftalık gözden geçirme', dayKey(addDays(today, 3)), '18:00', 'haftalık'],
  ];
  db.reminders = remDefs.map(([title, day, time, repeat]) => ({
    id: uid('rem'), title, note: '', at: `${day}T${time}`,
    done: false, notified: false, repeat, tags: [], createdAt: now,
  }));

  db.events = [];

  /* Temiz kurulum: ilk açılışta öğretici turu gösterilsin. */
  db.settings.onboarded = false;

  return db;
}
