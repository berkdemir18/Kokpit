/**
 * v0.7.8 testleri — Notion tarzı not sayfası (yapılacak sayacı, bilgi kutusu,
 * vurgu, satır eşlemesi) ve eski veri dosyasının yeni not alanlarıyla açılması.
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown, todoStats } from '../src/core/util';
import { migrate } from '../src/core/model';

describe('todoStats', () => {
  it('işaretli/toplam sayar', () => {
    const s = todoStats('- [ ] süt\n- [x] ekmek\nnormal satır\n- [X] peynir');
    expect(s.total).toBe(3);
    expect(s.done).toBe(2);
  });

  it('yapılacak yoksa sıfır', () => {
    expect(todoStats('# başlık\nmetin')).toEqual({ done: 0, total: 0 });
  });

  it('madde işaretini yapılacak sanmaz', () => {
    expect(todoStats('- düz madde').total).toBe(0);
  });
});

describe('renderMarkdown — v0.7.8', () => {
  it('her blok data-line taşır (metne tıkla → o satırı düzenle)', () => {
    const html = renderMarkdown('# başlık\n\nparagraf\n\n- madde');
    expect(html).toContain('<h1 data-line="0">');
    expect(html).toContain('<p data-line="2">');
    expect(html).toContain('<li data-line="4">');
  });

  it('bilgi kutusu üretir', () => {
    const html = renderMarkdown('> [!uyarı] dikkat et');
    expect(html).toContain('md-callout--uyarı');
    expect(html).toContain('dikkat et');
    // düz alıntıya düşmemeli
    expect(html).not.toContain('<blockquote');
  });

  it('bilinmeyen kutu türü de kutu olarak çizilir', () => {
    expect(renderMarkdown('> [!kendi] metin')).toContain('md-callout--kendi');
  });

  it('düz alıntı hâlâ blockquote', () => {
    expect(renderMarkdown('> sıradan alıntı')).toContain('<blockquote data-line="0">');
  });

  it('==vurgu== işaretlenir', () => {
    expect(renderMarkdown('bu ==önemli== bir yer')).toContain('<mark>önemli</mark>');
  });

  it('yapılacak girinti seviyesi taşır', () => {
    const html = renderMarkdown('- [ ] üst\n    - [ ] alt');
    expect(html).toContain('data-indent="0"');
    expect(html).toContain('data-indent="2"');
  });

  it('kutu içeriği de kaçırılır (XSS)', () => {
    expect(renderMarkdown('> [!not] <script>')).not.toContain('<script>');
  });
});

describe('migrate — eski notlar sayfaya dönüşüyor', () => {
  it('sabitlenen not favori olur, gelen-kutusu kategoriye geçer', () => {
    const d = migrate({
      schema: 4,
      notes: [
        { id: 'n1', title: 'eski', body: ['# Başlık', '', 'gövde'].join('\n'), tags: ['a'], pinned: true, icon: '🎯', cover: 'mor' },
        { id: 'n2', title: 'gelen', body: 'satır', tags: ['gelen-kutusu'] },
      ],
    });
    expect(d.pages).toHaveLength(2);
    expect(d.pages[0].favorite).toBe(true);
    expect(d.pages[0].icon).toBe('🎯');
    expect(d.pages[0].cover).toBe('mor');
    expect(d.pages[0].blocks[0].type).toBe('h1');
    expect(d.pages[0].blocks[1].text).toBe('gövde');
    expect(d.pages[1].category).toBe('Gelen Kutusu');
    expect(d.pages[1].tags).toEqual([]);
  });

  it('yeni sayfa dosyası olduğu gibi okunur', () => {
    const d = migrate({
      schema: 5,
      pages: [{ id: 'p1', title: 'Sayfa', blocks: [{ id: 'b1', type: 'todo', text: 'süt', checked: true }] }],
    });
    expect(d.pages[0].blocks[0].type).toBe('todo');
    expect(d.pages[0].blocks[0].checked).toBe(true);
    expect(d.pages[0].database.on).toBe(false);
    expect(d.pages[0].props).toEqual([]);
  });

  it('bozuk blok türü metne düşer, sayfa boş kalmaz', () => {
    const d = migrate({ schema: 5, pages: [{ id: 'p1', blocks: [{ type: 'uyduruk' }] }] });
    expect(d.pages[0].blocks[0].type).toBe('text');
    const bos = migrate({ schema: 5, pages: [{ id: 'p2' }] });
    expect(bos.pages[0].blocks).toHaveLength(1);
  });
});
