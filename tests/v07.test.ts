/**
 * v0.7 testleri — hatırlatıcı zaman ayrıştırma, iCal okuma, kod renklendirme,
 * markdown yapılacak kutuları ve dizi ilerlemesi.
 */

import { describe, it, expect } from 'vitest';
import {
  parseWhen, dtKey, parseDT, fmtDT, nextOccurrence, monthGrid, renderMarkdown, dayKey, addDays,
} from '../src/core/util';
import { tokenize, highlight, langSpec } from '../src/core/highlight';
import { parseIcs } from '../src/core/reminders';
import { seriesProgress } from '../src/views/watch';
import { migrate, SCHEMA_VERSION } from '../src/core/model';
import type { Title, EpisodeRecord } from '../src/core/model';

const NOW = new Date(2026, 7, 4, 12, 0, 0); // 4 Ağustos 2026, Salı 12:00

describe('parseWhen — serbest metinden zaman', () => {
  it('"21.30 spor" bugünün 21:30\'unu bulur', () => {
    const p = parseWhen('21.30 spor', NOW);
    expect(p.found).toBe(true);
    expect(p.at).toBe('2026-08-04T21:30');
    expect(p.text).toBe('spor');
  });

  it('saat geçmişse yarına atar', () => {
    const p = parseWhen('09:00 kahvaltı', NOW);
    expect(p.at).toBe('2026-08-05T09:00');
  });

  it('"yarın 14:00" yarını bulur', () => {
    const p = parseWhen('yarın 14:00 diş hekimi', NOW);
    expect(p.at).toBe('2026-08-05T14:00');
    expect(p.text).toBe('diş hekimi');
  });

  it('"5 ağustos" gün adını okur', () => {
    const p = parseWhen('5 ağustos 18:00 kargo', NOW);
    expect(p.at).toBe('2026-08-05T18:00');
  });

  it('gün adı verilince haftanın gelecek gününe gider', () => {
    // 4 Ağustos salı → cuma = 7 Ağustos
    const p = parseWhen('cuma sinema', NOW);
    expect(p.at.slice(0, 10)).toBe('2026-08-07');
  });

  it('zaman yoksa found=false ve metin bozulmaz', () => {
    const p = parseWhen('markete gitmem lazım', NOW);
    expect(p.found).toBe(false);
    expect(p.text).toBe('markete gitmem lazım');
  });

  it('yalnız saat yazılınca hasDay false kalır (seçili gün korunsun diye)', () => {
    const p = parseWhen('21.30 spor', NOW);
    expect(p.hasTime).toBe(true);
    expect(p.hasDay).toBe(false);
  });

  it('gün yazılınca hasDay true olur', () => {
    expect(parseWhen('yarın spor', NOW).hasDay).toBe(true);
    expect(parseWhen('12.08.2026 spor', NOW).hasDay).toBe(true);
  });

  it('"21:30" ile "21.30" aynı sonucu verir', () => {
    expect(parseWhen('21:30 x', NOW).at).toBe(parseWhen('21.30 x', NOW).at);
  });
});

describe('tarih & saat yardımcıları', () => {
  it('dtKey ve parseDT birbirinin tersi', () => {
    const key = dtKey(NOW);
    expect(key).toBe('2026-08-04T12:00');
    expect(dtKey(parseDT(key))).toBe(key);
  });

  it('fmtDT bugünü "bugün" der', () => {
    expect(fmtDT(`${dayKey()}T21:30`)).toBe('bugün 21:30');
  });

  it('fmtDT yarını "yarın" der', () => {
    expect(fmtDT(`${dayKey(addDays(new Date(), 1))}T08:00`)).toBe('yarın 08:00');
  });

  it('nextOccurrence günlük tekrarı bir gün ileri alır', () => {
    expect(nextOccurrence('2026-08-04T21:30', 'günlük')).toBe('2026-08-05T21:30');
  });

  it('nextOccurrence haftalık tekrarı 7 gün ileri alır', () => {
    expect(nextOccurrence('2026-08-04T21:30', 'haftalık')).toBe('2026-08-11T21:30');
  });

  it('tekrar yoksa zaman değişmez', () => {
    expect(nextOccurrence('2026-08-04T21:30', 'none')).toBe('2026-08-04T21:30');
  });

  it('monthGrid 42 gün döner ve pazartesiyle başlar', () => {
    const g = monthGrid(2026, 7);
    expect(g).toHaveLength(42);
    expect(parseDT(g[0]).getDay()).toBe(1); // pazartesi
    expect(g).toContain('2026-08-01');
    expect(g).toContain('2026-08-31');
  });
});

describe('parseIcs — Google Takvim', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Berk',
    'BEGIN:VEVENT',
    'UID:abc123',
    'SUMMARY:Diş hekimi randevusu',
    'LOCATION:Etimesgut',
    'DTSTART:20260805T140000',
    'DTEND:20260805T150000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:def456',
    'SUMMARY:Umre',
    'DTSTART;VALUE=DATE:20260824',
    'DTEND;VALUE=DATE:20260825',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('etkinlikleri okur', () => {
    const evs = parseIcs(ics);
    expect(evs).toHaveLength(2);
    expect(evs[0].title).toBe('Diş hekimi randevusu');
    expect(evs[0].start).toBe('2026-08-05T14:00');
    expect(evs[0].location).toBe('Etimesgut');
    expect(evs[0].calendar).toBe('Berk');
  });

  it('tüm gün etkinliğini işaretler', () => {
    const evs = parseIcs(ics);
    expect(evs[1].allDay).toBe(true);
    expect(evs[1].start).toBe('2026-08-24');
  });

  it('katlanmış satırları birleştirir', () => {
    // RFC 5545: devam satırının başındaki tek boşluk katlama işaretidir,
    // içeriğin parçası değildir — kaldırılıp doğrudan eklenir.
    const folded = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Çok uzun bir etkinlik ',
      ' adı devam ediyor',
      'DTSTART:20260805T090000',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseIcs(folded)[0].title).toBe('Çok uzun bir etkinlik adı devam ediyor');
  });

  it('kaçırılmış virgül/satır sonu çözülür', () => {
    const esc = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:a\\, b\\nc\r\nDTSTART:20260805T090000\r\nEND:VEVENT\r\nEND:VCALENDAR';
    expect(parseIcs(esc)[0].title).toBe('a, b\nc');
  });
});

describe('highlight — kod renklendirme', () => {
  it('bash anahtar kelimesi ve bayrağı ayırır', () => {
    const kinds = tokenize('nmap -sV 10.0.0.1 # tara', 'bash').map((t) => t.kind);
    expect(kinds).toContain('builtin');
    expect(kinds).toContain('flag');
    expect(kinds).toContain('comment');
  });

  it('python metnini string olarak işaretler', () => {
    const tokens = tokenize('print("merhaba")', 'python');
    expect(tokens.find((t) => t.kind === 'string')?.text).toBe('"merhaba"');
    expect(tokens.find((t) => t.kind === 'builtin')?.text).toBe('print');
  });

  it('kabuk değişkenini tanır', () => {
    expect(tokenize('echo $HOME', 'bash').some((t) => t.kind === 'variable' && t.text === '$HOME')).toBe(true);
  });

  it('HTML kaçırılır (XSS koruması)', () => {
    // `<` ve `>` ayrı token olduğu için ayrı ayrı kaçırılır; önemli olan
    // çıktıda çalıştırılabilir bir etiketin kalmaması.
    const html = highlight('<script>alert(1)</script>', 'javascript');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('</script>');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
  });

  it('bilinmeyen dil düz metne düşer', () => {
    expect(langSpec('klingonca').label).toBe('metin');
    expect(highlight('sadece yazı', 'klingonca')).toContain('sadece');
  });

  it('token metinleri birleşince kaynak kodu verir', () => {
    const code = 'if [ -f x ]; then\n  echo "var"\nfi';
    expect(tokenize(code, 'bash').map((t) => t.text).join('')).toBe(code);
  });
});

describe('renderMarkdown — v0.7 blokları', () => {
  it('yapılacak kutusu üretir ve satır numarası taşır', () => {
    const html = renderMarkdown('- [ ] süt al\n- [x] ekmek al');
    expect(html).toContain('class="md-todo" data-line="0"');
    expect(html).toContain('md-todo is-done" data-line="1"');
  });
  it('alıntı ve ayraç', () => {
    expect(renderMarkdown('> not')).toContain('<blockquote data-line="0">');
    expect(renderMarkdown('---')).toContain('<hr data-line="0">');
  });
  it('numaralı liste', () => {
    expect(renderMarkdown('1. bir')).toContain('<ol>');
  });
  it('bağlantı yalnız http(s) kabul eder', () => {
    expect(renderMarkdown('[site](https://a.com)')).toContain('href="https://a.com"');
    expect(renderMarkdown('[kötü](javascript:alert(1))')).not.toContain('href=');
  });
});

describe('migrate — eski veri dosyası açılabiliyor mu', () => {
  it('v3 dosyası (hatırlatıcı/etkinlik yok) kayıpsız açılır', () => {
    const eski = {
      schema: 3,
      titles: [{ id: 't1', name: 'Mr. Robot', kind: 'dizi', rating: 10 }],
      phases: [{ id: 'p1', code: 'FAZ 0', title: 'Temel', when: '', goal: '', order: 0 }],
      tasks: [{ id: 'rt1', phaseId: 'p1', title: 'Linux', done: true }],
      notes: [{ id: 'n1', title: 'not', body: 'gövde', tags: [], pinned: false }],
      settings: { accent: '#57b6ff', tmdbApiKey: 'abc' },
    };
    const d = migrate(eski);
    expect(d.schema).toBe(SCHEMA_VERSION);
    expect(d.titles[0].name).toBe('Mr. Robot');
    expect(d.tasks[0].done).toBe(true);
    // v5: notlar bloklu sayfalara dönüştü, gövde bloklara ayrıştı.
    expect(d.pages[0].blocks[0].text).toBe('gövde');
    // yeni alanlar boş ama var
    expect(d.reminders).toEqual([]);
    expect(d.events).toEqual([]);
    // eski ayar korunur, yeni ayarlar varsayılana düşer
    expect(d.settings.tmdbApiKey).toBe('abc');
    expect(d.settings.notifyEnabled).toBe(true);
    expect(d.settings.colorfulModules).toBe(true);
    expect(d.settings.icsUrl).toBe('');
  });

  it('bozuk hatırlatıcı kaydı çökertmez', () => {
    const d = migrate({ reminders: [{ id: 'r1' }] });
    expect(d.reminders[0]).toMatchObject({ id: 'r1', title: '', at: '', repeat: 'none', done: false });
  });
});

describe('seriesProgress — nerede kaldım', () => {
  const base: Title = {
    id: 't1', kind: 'dizi', name: 'Mr. Robot', year: 2016, genres: [], status: 'active',
    rating: 10, posterUrl: '', imdb: '', watchedAt: '', withWho: [], review: '',
    season: 3, episode: 4, tags: [], createdAt: '', updatedAt: '',
    tmdbId: null, episodes: [], episodesFetchedAt: '',
  };

  const ep = (season: number, number: number, watched: boolean): EpisodeRecord => ({
    season, number, name: '', airDate: '', watched, watchedAt: '', rating: null, comment: '',
  });

  it('film için null döner', () => {
    expect(seriesProgress({ ...base, kind: 'film' })).toBeNull();
  });

  it('bölüm listesi yoksa sayaçtan sıradakini verir', () => {
    expect(seriesProgress(base)?.next).toBe('S3 · B5');
  });

  it('bölüm listesi varsa ilk izlenmemiş bölümü verir', () => {
    const t = { ...base, episodes: [ep(1, 1, true), ep(1, 2, true), ep(1, 3, false), ep(2, 1, false)] };
    const p = seriesProgress(t);
    expect(p?.next).toBe('S1 · B3');
    expect(p?.watched).toBe(2);
    expect(p?.total).toBe(4);
    expect(p?.pct).toBe(50);
  });

  it('hepsi izlendiyse "bitti" der', () => {
    const t = { ...base, episodes: [ep(1, 1, true), ep(1, 2, true)] };
    expect(seriesProgress(t)?.next).toBe('bitti');
    expect(seriesProgress(t)?.pct).toBe(100);
  });
});
