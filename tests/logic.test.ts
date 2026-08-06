import { describe, it, expect } from 'vitest';
import {
  streak, bestStreak, heatLevel, pct, splitList, renderMarkdown,
  dayKey, addDays, daysBetween, fmtDuration,
} from '../src/core/util';

const back = (n: number) => dayKey(addDays(new Date(), -n));

describe('streak', () => {
  it('bugün + dün + evvelsi gün = 3', () => {
    expect(streak([back(0), back(1), back(2)])).toBe(3);
  });
  it('bugün işaretli değilse dünden sayar', () => {
    expect(streak([back(1), back(2)])).toBe(2);
  });
  it('boşluk seriyi kırar', () => {
    expect(streak([back(0), back(1), back(3), back(4)])).toBe(2);
  });
  it('hiç yoksa 0', () => {
    expect(streak([])).toBe(0);
  });
  it('sadece eski günler (dün de yoksa) 0', () => {
    expect(streak([back(5), back(6)])).toBe(0);
  });
});

describe('bestStreak', () => {
  it('en uzun kesintisiz dizi', () => {
    expect(bestStreak([back(10), back(9), back(8), back(5), back(4)])).toBe(3);
  });
  it('tekrarlar sorun değil', () => {
    expect(bestStreak([back(1), back(1), back(0)])).toBe(2);
  });
});

describe('heatLevel', () => {
  it('0 değer = seviye 0', () => expect(heatLevel(0, 100)).toBe(0));
  it('max değer = seviye 4', () => expect(heatLevel(100, 100)).toBe(4));
  it('orta değer', () => expect(heatLevel(30, 100)).toBe(2));
  it('küçük değer', () => expect(heatLevel(10, 100)).toBe(1));
});

describe('pct', () => {
  it('yarısı = 50', () => expect(pct(1, 2)).toBe(50));
  it('sıfır bölen = 0', () => expect(pct(5, 0)).toBe(0));
  it('100 üstü kırpılır', () => expect(pct(3, 2)).toBe(100));
});

describe('splitList', () => {
  it('virgülle ayırır ve trimler', () => {
    expect(splitList(' a , b ,c, ')).toEqual(['a', 'b', 'c']);
  });
});

describe('daysBetween', () => {
  it('ardışık gün = 1', () => {
    expect(daysBetween(back(1), back(0))).toBe(1);
  });
});

describe('fmtDuration', () => {
  it('saat + dakika', () => expect(fmtDuration(140)).toBe('2s 20d'));
  it('sadece dakika', () => expect(fmtDuration(45)).toBe('45d'));
  it('sıfır', () => expect(fmtDuration(0)).toBe('—'));
});

describe('renderMarkdown', () => {
  it('başlık üretir', () => {
    // v0.7.8: her blok data-line taşıyor (metne tıklayınca o satırda düzenleme).
    expect(renderMarkdown('# Merhaba')).toContain('<h1 data-line="0">Merhaba</h1>');
  });
  it('kod bloğu üretir', () => {
    // v0.7: <pre> artık dil bilgisini data-lang ile taşıyor.
    const html = renderMarkdown('```bash\nkod\n```');
    expect(html).toContain('<pre data-lang="bash" data-line="0"><code>');
    expect(html).toContain('kod');
  });
  it('kalın metin', () => {
    expect(renderMarkdown('**önemli**')).toContain('<strong>önemli</strong>');
  });
  it('liste maddesi', () => {
    expect(renderMarkdown('- madde')).toContain('<li data-line="0">madde</li>');
  });
  it('HTML kaçışı (XSS koruması)', () => {
    expect(renderMarkdown('<script>')).not.toContain('<script>');
    expect(renderMarkdown('<script>')).toContain('&lt;script&gt;');
  });
});
