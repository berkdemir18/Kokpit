/**
 * v0.8 — blok çekirdeği testleri.
 * Markdown → blok dönüşümü, blok ağacı işlemleri, satır içi biçim ve
 * yazarken çalışan markdown kısayolları.
 */

import { describe, it, expect } from 'vitest';
import {
  markdownToBlocks, blocksToMarkdown, newBlock, findBlock, takeBlock, moveBlock,
  walk, inlineToHtml, plainText, blocksPlain, shortcutFor, normalizeBlock, Block,
} from '../src/core/blocks';

const md = (s: string) => markdownToBlocks(s);

describe('markdownToBlocks', () => {
  it('başlıkları türe çevirir', () => {
    const b = md('# bir\n## iki\n### üç');
    expect(b.map((x) => x.type)).toEqual(['h1', 'h2', 'h3']);
    expect(b[0].text).toBe('bir');
  });

  it('yapılacak kutusunu işaretiyle okur', () => {
    const b = md('- [ ] süt\n- [x] ekmek');
    expect(b[0].type).toBe('todo');
    expect(b[0].checked).toBe(false);
    expect(b[1].checked).toBe(true);
    expect(b[1].text).toBe('ekmek');
  });

  it('madde ve numaralı listeyi ayırır', () => {
    const b = md('- madde\n1. birinci');
    expect(b[0].type).toBe('bullet');
    expect(b[1].type).toBe('numbered');
  });

  it('kod bloğunu dili ve gövdesiyle alır', () => {
    const b = md('```python\nprint(1)\nprint(2)\n```');
    expect(b[0].type).toBe('code');
    expect(b[0].meta).toBe('python');
    expect(b[0].text).toBe('print(1)\nprint(2)');
  });

  it('bilgi kutusunu alıntıdan ayırır', () => {
    const b = md('> [!uyarı] dikkat\n> normal alıntı');
    expect(b[0].type).toBe('callout');
    expect(b[0].meta).toBe('uyarı');
    expect(b[1].type).toBe('quote');
  });

  it('ayraç ve boş satır', () => {
    const b = md('metin\n\n---\n\nson');
    expect(b.map((x) => x.type)).toEqual(['text', 'divider', 'text']);
  });

  it('boş girdide bile bir blok döner (sayfa asla boş kalmaz)', () => {
    expect(md('')).toHaveLength(1);
    expect(md('')[0].type).toBe('text');
  });
});

describe('blocksToMarkdown — tur atınca bozulmuyor', () => {
  it('başlık/liste/yapılacak/kod aynen geri gelir', () => {
    const src = '# Başlık\n- [ ] süt\n- [x] ekmek\n- madde\n1. bir\n> alıntı\n```bash\nls -la\n```';
    const round = blocksToMarkdown(md(src));
    const again = md(round);
    expect(again.map((b) => b.type)).toEqual(md(src).map((b) => b.type));
    expect(again.map((b) => b.text)).toEqual(md(src).map((b) => b.text));
  });

  it('numaralandırma sırayla yazılır', () => {
    const out = blocksToMarkdown(md('1. a\n1. b\n1. c'));
    expect(out).toBe('1. a\n2. b\n3. c');
  });
});

describe('blok ağacı', () => {
  const tree = (): Block[] => {
    const a = newBlock('text', 'a');
    const b = newBlock('text', 'b');
    const c = newBlock('text', 'c');
    a.children.push(c);
    return [a, b];
  };

  it('findBlock alt bloğu da bulur', () => {
    const t = tree();
    const hit = findBlock(t, t[0].children[0].id);
    expect(hit?.block.text).toBe('c');
  });

  it('takeBlock çıkarır', () => {
    const t = tree();
    const id = t[1].id;
    expect(takeBlock(t, id)?.text).toBe('b');
    expect(t).toHaveLength(1);
  });

  it('moveBlock sırayı değiştirir', () => {
    const t = tree();
    moveBlock(t, t[1].id, t[0].id, true);
    expect(t[0].text).toBe('b');
  });

  it('blok kendi alt ağacına taşınamaz', () => {
    const t = tree();
    const child = t[0].children[0].id;
    expect(moveBlock(t, t[0].id, child, false)).toBe(false);
    // yapı bozulmadı
    expect(t).toHaveLength(2);
    expect(t[0].children).toHaveLength(1);
  });

  it('walk alt blokları da gezer', () => {
    const seen: string[] = [];
    walk(tree(), (b) => seen.push(b.text));
    expect(seen).toEqual(['a', 'c', 'b']);
  });
});

describe('satır içi biçim', () => {
  it('kalın/eğik/kod/vurgu HTML olur', () => {
    const html = inlineToHtml('**kalın** *eğik* `kod` ==vurgu==');
    expect(html).toContain('<strong>kalın</strong>');
    expect(html).toContain('<em>eğik</em>');
    expect(html).toContain('<code>kod</code>');
    expect(html).toContain('<mark>vurgu</mark>');
  });

  it('sayfa bağlantısı data-page taşır', () => {
    expect(inlineToHtml('[[ChatGPT]]')).toContain('data-page="ChatGPT"');
  });

  it('yalnız http(s) bağlantı kabul edilir', () => {
    expect(inlineToHtml('[a](https://x.com)')).toContain('href="https://x.com"');
    expect(inlineToHtml('[a](javascript:alert(1))')).not.toContain('href=');
  });

  it('HTML kaçışı korunuyor', () => {
    expect(inlineToHtml('<script>')).not.toContain('<script>');
  });

  it('plainText işaretleri temizler', () => {
    expect(plainText('**a** `b` [[C]] ==d==')).toBe('a b C d');
  });

  it('blocksPlain tüm sayfayı düz metne indirir', () => {
    const b = md('# Başlık\n- [ ] süt');
    const table = newBlock('table');
    table.rows = [['x', 'y']];
    expect(blocksPlain([...b, table])).toContain('Başlık');
    expect(blocksPlain([...b, table])).toContain('süt');
    expect(blocksPlain([...b, table])).toContain('x y');
  });
});

describe('shortcutFor — yazarken tür değiştirme', () => {
  it('işaretleri tanır ve metinden siler', () => {
    expect(shortcutFor('## ')).toEqual({ type: 'h2', rest: '' });
    expect(shortcutFor('- süt')).toEqual({ type: 'bullet', rest: 'süt' });
    expect(shortcutFor('[] görev')).toEqual({ type: 'todo', rest: 'görev', checked: false });
    expect(shortcutFor('1. bir')).toEqual({ type: 'numbered', rest: 'bir' });
    expect(shortcutFor('> alıntı')).toEqual({ type: 'quote', rest: 'alıntı' });
  });

  it('yapılacak kalıbı maddeden önce gelir', () => {
    expect(shortcutFor('- [ ] süt')).toEqual({ type: 'todo', rest: 'süt', checked: false });
    expect(shortcutFor('- [x] ekmek')).toEqual({ type: 'todo', rest: 'ekmek', checked: true });
  });

  it('h3 h1 ile karışmaz', () => {
    expect(shortcutFor('### üç')?.type).toBe('h3');
    expect(shortcutFor('# bir')?.type).toBe('h1');
  });

  it('düz metinde tetiklenmez', () => {
    expect(shortcutFor('merhaba')).toBeNull();
    expect(shortcutFor('3 elma aldım')).toBeNull();
  });
});

describe('normalizeBlock', () => {
  it('eksik alanları tamamlar', () => {
    const b = normalizeBlock({ type: 'todo', text: 'x' });
    expect(b.checked).toBe(false);
    expect(b.children).toEqual([]);
    expect(b.rows).toEqual([]);
    expect(b.id).toBeTruthy();
  });

  it('bilinmeyen tür metne düşer', () => {
    expect(normalizeBlock({ type: 'zzz' }).type).toBe('text');
  });

  it('alt blokları da normalleştirir', () => {
    const b = normalizeBlock({ type: 'toggle', children: [{ type: 'todo' }] });
    expect(b.children[0].type).toBe('todo');
    expect(b.children[0].checked).toBe(false);
  });
});
