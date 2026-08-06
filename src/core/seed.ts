/**
 * İlk açılışta yüklenen örnek veri — uygulama boş bir ekranla değil, tasarımdaki
 * gibi dolu açılsın diye. Ayarlardan "tüm veriyi sıfırla" ile temizlenebilir.
 */

import { DB, emptyDB, emptyPage } from './model';
import { markdownToBlocks } from './blocks';
import { addDays, dayKey, uid } from './util';
import { ROADMAP } from './roadmap-data';

/**
 * Yol haritası fazlarını ve görevlerini üretir.
 * Hem ilk kurulumda hem de eski (yol haritası olmayan) bir veri dosyası
 * açıldığında kullanılır — mevcut veriye dokunmadan sadece haritayı ekler.
 */
export function buildRoadmap(): { phases: DB['phases']; tasks: DB['tasks'] } {
  const phases: DB['phases'] = [];
  const tasks: DB['tasks'] = [];
  ROADMAP.forEach((p, pi) => {
    const phaseId = uid('p');
    phases.push({ id: phaseId, code: p.code, title: p.title, when: p.when, goal: p.goal, order: pi });
    p.tasks.forEach((t, ti) => {
      tasks.push({
        id: uid('rt'), phaseId, when: t.when, title: t.title, note: t.note,
        tags: t.tags, done: false, doneAt: '', order: ti,
      });
    });
  });
  return { phases, tasks };
}

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

  /* --- Siber yol haritası: örnek fazlar (roadmap-data.ts) --- */
  const rm = buildRoadmap();
  db.phases = rm.phases;
  db.tasks = rm.tasks;

  const phaseByCode = (code: string) => db.phases.find((p) => p.code === code)?.id ?? null;

  /* --- Kaynaklar: örnek kayıtlar, kendi kaynaklarınla değiştir --- */
  const resDefs: [DB['resources'][0]['kind'], string, string, number, DB['resources'][0]['status'], string][] = [
    ['lab', 'Komut satırı alıştırmaları', 'örnek kayıt', 0, 'planned', 'FAZ 0'],
    ['kurs', 'Giriş seviyesi güvenlik kursu', 'örnek kayıt', 0, 'planned', 'FAZ 0'],
    ['kurs', 'Betik dili temelleri', 'örnek kayıt', 0, 'planned', 'FAZ 0'],
    ['lab', 'Başlangıç öğrenme yolu', 'örnek kayıt · ~20 saat', 0, 'planned', 'FAZ 1'],
    ['kurs', 'Ağ temelleri kursu', 'örnek kayıt · ~30 saat', 0, 'planned', 'FAZ 1'],
    ['lab', 'Uygulamalı analiz yolu', 'örnek kayıt', 0, 'planned', 'FAZ 2'],
    ['kitap', 'Bir gramer kitabı', 'haftada 2 ünite', 0, 'planned', 'FAZ 2'],
  ];
  db.resources = resDefs.map(([kind, title, link, progress, status, code]) => ({
    id: uid('r'), kind, title, link, progress, status,
    phaseId: phaseByCode(code), rating: null, updatedAt: now,
  }));

  /* --- Lab günlüğü: boş başlar, ilk odayı çözünce sen eklersin --- */
  db.labs = [];

  /* --- Komut defteri: örnek kayıtlar, biçimi göstermek için --- */
  const snipDefs: [string, string, string, string][] = [
    ['Ağ keşfi — temel 4 komut', 'bash', 'ping -c 4 example.com\nnslookup example.com\ntraceroute example.com\nnetstat -tulpn', 'Ağ temellerinin pratiği. Çıktıyı okumaya çalış.'],
    ['Dosya arama — find & grep', 'bash', 'find / -name "*.log" 2>/dev/null\ngrep -rn "ERROR" /var/log/\nfind . -type f -mtime -1', 'Fare kullanmadan dosya bulup içinde kelime aratmak.'],
    ['Log filtreleyen betik', 'python', 'with open("app.log") as f:\n    hatalar = [s for s in f if "ERROR" in s]\n\nwith open("hatalar.log", "w") as f:\n    f.writelines(hatalar)\n\nprint(f"{len(hatalar)} hata satiri yazildi")', 'Küçük bir otomasyon örneği.'],
    ['İzinler — chmod & chown', 'bash', 'ls -la\nchmod 644 dosya.txt\nchmod +x script.sh\nchown kullanici:kullanici dosya.txt', 'rwx mantığını oturt: 4=oku, 2=yaz, 1=çalıştır.'],
  ];
  db.snippets = snipDefs.map(([title, language, code, explanation]) => ({
    id: uid('s'), title, language, code, explanation, tags: [], updatedAt: now,
  }));

  /* --- Çalışma oturumları: boş başlar, çalıştıkça heatmap dolar --- */
  db.sessions = [];

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
    ['Faz 0 — temeli kaz', 'siber', dayKey(addDays(today, 45)), [
      ['Sanal makine kuruldu', false],
      ['Temel komutlar kas hafızasında', false],
      ['İlk alıştırma seti bitti', false],
      ['Bitirme betiği yazıldı', false],
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
    ['Yasal sınır — izin yoksa dokunma', '# Kural\n\n**İzin verilmeyen hiçbir sisteme dokunma.** Sadece:\n\n- kendi lab makinelerin\n- TryHackMe / HackTheBox / OverTheWire gibi izinli platformlar\n- yazılı izin aldığın sistemler\n\nKaza eseri açık bulursan: kullanma, kanıt toplama, sahibine bildir.\nTürkiye\'de TCK 243-244 kapsamında yetkisiz erişim suç.', ['kural', 'siber'], true, '⚖️', 'gül'],
    ['Haftalık rutin şablonu', '# Haftalık rutin\n\nGünde 1.5–2 saat, haftada 5 gün.\n\n- **Pzt–Sal:** komut satırı pratiği\n- **Çar:** kurs\n- **Per:** ağ pratiği\n- **Cum:** betik yazma\n- **Her gün:** 20 dk yabancı dil + 3 cümlelik not\n\nYoğun dönemde: günde 30 dk\'ya düşür ama **sıfırlama**. Seri kırılmasın.', ['sistem', 'rutin'], true, '🗓️', 'mavi'],
    ['Lab planı', '# Ev lab kurulumu\n\nSanallaştırma üzerinde 3 makine:\n\n1. Test istemcisi\n2. Hedef sistem\n3. Kayıt/izleme sunucusu\n\nEgzersiz: senaryoyu çalıştır → kayıtlarda izini bul. Bu tek alıştırma onlarca kurstan değerli.', ['lab', 'plan'], false, '🧪', 'yeşil'],
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
