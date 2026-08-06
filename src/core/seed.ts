/**
 * İlk açılışta örnek veri. Berk uygulamayı boş bir ekranla değil, tasarımdaki
 * gibi dolu görsün diye. Ayarlardan "tüm veriyi sıfırla" ile temizlenebilir.
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

  /* --- Siber yol haritası: Berk'in gerçek SOC planı --- */
  const rm = buildRoadmap();
  db.phases = rm.phases;
  db.tasks = rm.tasks;

  const phaseByCode = (code: string) => db.phases.find((p) => p.code === code)?.id ?? null;

  /* --- Kaynaklar: yol haritasındaki gerçek kaynaklar --- */
  const resDefs: [DB['resources'][0]['kind'], string, string, number, DB['resources'][0]['status'], string][] = [
    ['lab', 'OverTheWire — Bandit (seviye 0–15)', 'overthewire.org', 0, 'planned', 'FAZ 0'],
    ['kurs', 'BTK Akademi — Siber Güvenliğe Giriş', 'btkakademi.gov.tr', 0, 'planned', 'FAZ 0'],
    ['kurs', 'Python temeli — Kaggle / BTK', 'kaggle.com', 0, 'planned', 'FAZ 0'],
    ['lab', 'TryHackMe — Pre Security yolu', 'tryhackme.com · ~20 saat', 0, 'planned', 'FAZ 1'],
    ['lab', 'TryHackMe — Complete Beginner yolu', 'tryhackme.com · ~40 saat', 0, 'planned', 'FAZ 1'],
    ['kurs', 'Cisco NetAcad — Intro to Cybersecurity', 'netacad.com · ~15 saat', 0, 'planned', 'FAZ 2'],
    ['lab', 'TryHackMe — SOC Level 1', 'tryhackme.com · ~$14/ay', 0, 'planned', 'FAZ 2'],
    ['kitap', 'English Grammar in Use (Murphy)', 'haftada 2 ünite', 0, 'planned', 'EN'],
  ];
  db.resources = resDefs.map(([kind, title, link, progress, status, code]) => ({
    id: uid('r'), kind, title, link, progress, status,
    phaseId: phaseByCode(code), rating: null, updatedAt: now,
  }));

  /* --- Lab günlüğü: boş başlar, ilk odayı çözünce sen eklersin --- */
  db.labs = [];

  /* --- Komut defteri: Faz 0 için işine yarayacak temel komutlar --- */
  const snipDefs: [string, string, string, string][] = [
    ['Ağ keşfi — temel 4 komut', 'bash', 'ping -c 4 google.com\nnslookup google.com\ntraceroute google.com\nnetstat -tulpn', 'Faz 0 ağ sorularının pratiği. Kendi internetinde dene, çıktıyı anlamaya çalış.'],
    ['Dosya arama — find & grep', 'bash', 'find / -name "*.log" 2>/dev/null\ngrep -rn "ERROR" /var/log/\nfind . -type f -mtime -1', 'Fare kullanmadan dosya bulup içinde kelime aratmak — Bandit\'in ölçüsü bu.'],
    ['Log filtreleyen Python (Faz 0 bitirme projesi)', 'python', 'with open("app.log") as f:\n    hatalar = [s for s in f if "ERROR" in s]\n\nwith open("hatalar.log", "w") as f:\n    f.writelines(hatalar)\n\nprint(f"{len(hatalar)} hata satiri yazildi")', 'Faz 0\'ı kapatan proje. Tek başına yazabiliyorsan faz tamam demektir.'],
    ['İzinler — chmod & chown', 'bash', 'ls -la\nchmod 644 dosya.txt\nchmod +x script.sh\nchown berk:berk dosya.txt', 'rwx mantığını oturt: 4=oku, 2=yaz, 1=çalıştır.'],
  ];
  db.snippets = snipDefs.map(([title, language, code, explanation]) => ({
    id: uid('s'), title, language, code, explanation, tags: [], updatedAt: now,
  }));

  /* --- Çalışma oturumları: boş başlar, çalıştıkça heatmap dolar --- */
  db.sessions = [];

  /* --- Alışkanlıklar: yol haritasının haftalık rutinine göre --- */
  const habitDefs: [string, DB['habits'][0]['cadence'], number][] = [
    ['Siber çalışma · 1.5 saat', 'günlük', 5],
    ['İngilizce · 20 dk (Anki + input)', 'günlük', 7],
    ['Öğrendiğini 3 cümleyle not al', 'günlük', 5],
    ['Spor', 'haftalık', 3],
  ];
  db.habits = habitDefs.map(([name, cadence, targetPerWeek]) => ({
    id: uid('h'), name, cadence, targetPerWeek, archived: false, createdAt: now,
  }));
  db.habits.forEach((hb) => { db.habitLogs[hb.id] = []; });

  /* --- Hedefler: yol haritasının kilometre taşları --- */
  const goalDefs: [string, string, string, [string, boolean][]][] = [
    ['Faz 0 — temeli kaz', 'siber', '2026-09-30', [
      ['Ubuntu + VirtualBox kurulu', false],
      ['25 Linux komutu kas hafızasında', false],
      ['Bandit 0–15 bitti', false],
      ['Log filtreleyen Python script yazıldı', false],
    ]],
    ['Siber Vatan 2027 başvurusu', 'siber', '2026-10-31', [
      ['sibervatan.org haftalık kontrol', false],
      ['Başvuru yapıldı', false],
    ]],
    ['İngilizce B1 → B2', 'ingilizce', '2027-02-28', [
      ['EF SET ile mevcut seviye ölçüldü', false],
      ['Mr. Robot İngilizce altyazıya geçildi', false],
      ['İlk İngilizce writeup yazıldı', false],
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
    ['Haftalık rutin şablonu', '# Haftalık rutin (Faz 0)\n\nGünde 1.5–2 saat, haftada 5 gün.\n\n- **Pzt–Sal:** Linux pratiği / Bandit\n- **Çar:** kurs (BTK / Kaggle)\n- **Per:** ağ pratiği (ping, nslookup, traceroute)\n- **Cum:** Python\n- **Her gün:** 20 dk İngilizce + 3 cümlelik not\n\nSınav döneminde: günde 30 dk\'ya düşür ama **sıfırlama**. Seri kırılmasın.', ['sistem', 'rutin'], true, '🗓️', 'mavi'],
    ['Kendi lab planım', '# Ev lab kurulumu (Faz 2 hedefi)\n\nVirtualBox\'ta 3 makine:\n\n1. **Kali** — saldırgan\n2. **Windows 10** — kurban\n3. **Ubuntu + Wazuh** — SIEM\n\nEgzersiz: saldır → log\'da o saldırıyı bul. Bu tek alıştırma 10 kurstan değerli.', ['lab', 'plan'], false, '🧪', 'yeşil'],
    ['Gelen Kutusu · takip edilecekler', 'sibervatan.org (haftalık kontrol)\nTÜBİTAK BİLGEM yaz kampı — mart\'tan itibaren\nStaj başvuruları — Şubat–Nisan', ['gelen-kutusu'], false, '📥', ''],
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
    ['Siber çalışma · 1.5 saat', dayKey(today), '20:00', 'günlük'],
    ['İngilizce · 20 dk', dayKey(today), '22:30', 'günlük'],
    ['sibervatan.org başvuru kontrolü', dayKey(addDays(today, 3)), '18:00', 'haftalık'],
  ];
  db.reminders = remDefs.map(([title, day, time, repeat]) => ({
    id: uid('rem'), title, note: '', at: `${day}T${time}`,
    done: false, notified: false, repeat, tags: [], createdAt: now,
  }));

  db.events = [];

  return db;
}
