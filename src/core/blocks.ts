/**
 * Blok çekirdeği — Notion mantığı.
 *
 * Bir sayfa artık tek parça metin DEĞİL, bağımsız blokların listesi. Her blok
 * kendi türünü (başlık, madde, yapılacak, kod, tablo…) ve kendi metnini taşır;
 * editörde ayrı ayrı düzenlenir, sürüklenip yeri değiştirilir, silinir.
 *
 * Blok METNİ satır içi markdown olarak saklanır (`**kalın**`, `` `kod` ``,
 * `[[Sayfa]]`, `[metin](adres)`). Editör bunu contenteditable için HTML'e
 * çevirir, yazma bitince geri markdown'a serileştirir — kullanıcı hiçbir
 * zaman `**` görmez ama dosya insan-okur ve dışa aktarılabilir kalır.
 *
 * Bu dosya SAF: DOM'a yalnız `htmlToInline` içinde, çağrıldığında dokunur
 * (testler node ortamında koşuyor).
 */

import { escapeHtml, uid } from './util';

export type BlockType =
  | 'text' | 'h1' | 'h2' | 'h3'
  | 'bullet' | 'numbered' | 'todo' | 'toggle'
  | 'quote' | 'callout' | 'code' | 'divider'
  | 'image' | 'video' | 'bookmark' | 'equation'
  | 'table' | 'subpage';

export interface Block {
  id: string;
  type: BlockType;
  /** Satır içi markdown. Ayraç/tablo/alt sayfa bloklarında boş olabilir. */
  text: string;
  /** yapılacak & toggle: işaretli/açık mı. */
  checked: boolean;
  /**
   * Türe göre ek bilgi:
   *  code → dil · callout → tür (bilgi/uyarı/…) · image/video/bookmark → adres
   *  subpage → sayfa id'si · equation → boş (metin formülü tutar)
   */
  meta: string;
  /** toggle ve liste blokları alt blok taşıyabilir. */
  children: Block[];
  /** table: ilk satır başlık kabul edilir. */
  rows: string[][];
}

export const BLOCK_LABEL: Record<BlockType, string> = {
  text: 'Metin',
  h1: 'Başlık 1',
  h2: 'Başlık 2',
  h3: 'Başlık 3',
  bullet: 'Madde listesi',
  numbered: 'Numaralı liste',
  todo: 'Yapılacak',
  toggle: 'Açılır liste',
  quote: 'Alıntı',
  callout: 'Bilgi kutusu',
  code: 'Kod',
  divider: 'Ayraç',
  image: 'Resim',
  video: 'Video',
  bookmark: 'Bağlantı kartı',
  equation: 'Denklem',
  table: 'Tablo',
  subpage: 'Alt sayfa',
};

export const BLOCK_ICON: Record<BlockType, string> = {
  text: '¶', h1: 'H1', h2: 'H2', h3: 'H3',
  bullet: '•', numbered: '1.', todo: '☑', toggle: '▸',
  quote: '❝', callout: '💡', code: '</>', divider: '—',
  image: '🖼', video: '▶', bookmark: '🔖', equation: '∑',
  table: '▦', subpage: '📄',
};

/** İçinde metin yazılabilen bloklar (contenteditable alan alır). */
export const TEXTY: BlockType[] = [
  'text', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'toggle',
  'quote', 'callout', 'code', 'equation',
];

export function newBlock(type: BlockType = 'text', text = ''): Block {
  return {
    id: uid('b'),
    type,
    text,
    checked: false,
    meta: type === 'callout' ? 'bilgi' : type === 'code' ? 'bash' : '',
    children: [],
    rows: type === 'table' ? [['', ''], ['', '']] : [],
  };
}

/** Eksik alanları tamamlar — eski/bozuk veri de açılabilsin. */
export function normalizeBlock(raw: unknown): Block {
  const b = (raw ?? {}) as Partial<Block>;
  const type = (b.type && BLOCK_LABEL[b.type] ? b.type : 'text') as BlockType;
  return {
    id: b.id || uid('b'),
    type,
    text: typeof b.text === 'string' ? b.text : '',
    checked: b.checked === true,
    meta: typeof b.meta === 'string' ? b.meta : '',
    children: Array.isArray(b.children) ? b.children.map(normalizeBlock) : [],
    rows: Array.isArray(b.rows) ? b.rows.map((r) => (Array.isArray(r) ? r.map(String) : [])) : [],
  };
}

/* ------------------------------------------------------------ ağaç işleri */

/** Blokları (alt bloklar dahil) sırayla gezer. */
export function walk(blocks: Block[], fn: (b: Block, parent: Block[]) => void): void {
  for (const b of blocks) {
    fn(b, blocks);
    if (b.children.length) walk(b.children, fn);
  }
}

export function findBlock(blocks: Block[], id: string): { block: Block; list: Block[]; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { block: blocks[i], list: blocks, index: i };
    const inner = findBlock(blocks[i].children, id);
    if (inner) return inner;
  }
  return null;
}

/** `id`li bloğu listeden çıkarır ve döner. */
export function takeBlock(blocks: Block[], id: string): Block | null {
  const hit = findBlock(blocks, id);
  if (!hit) return null;
  hit.list.splice(hit.index, 1);
  return hit.block;
}

/** `targetId`nin altına (before=true ise üstüne) taşır. Kendi içine taşımaz. */
export function moveBlock(blocks: Block[], id: string, targetId: string, before: boolean): boolean {
  if (id === targetId) return false;
  const src = findBlock(blocks, id);
  if (!src) return false;
  // Kendi alt ağacının içine bırakmaya çalışırsa iptal.
  if (findBlock(src.block.children, targetId)) return false;

  src.list.splice(src.index, 1);
  const dst = findBlock(blocks, targetId);
  if (!dst) { src.list.splice(src.index, 0, src.block); return false; }
  dst.list.splice(before ? dst.index : dst.index + 1, 0, src.block);
  return true;
}

/* --------------------------------------------------- satır içi markdown */

/** Satır içi markdown → HTML (hem okuma hem contenteditable için). */
export function inlineToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[\[([^\]]+)\]\]/g, '<a class="wikilink" data-page="$1">$1</a>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

/**
 * contenteditable HTML → satır içi markdown.
 * Tarayıcının ürettiği etiketleri (b/i/strike/font/span/div/br) da karşılar.
 */
export function htmlToInline(html: string): string {
  const host = document.createElement('div');
  host.innerHTML = html;
  return serialize(host).replace(/ /g, ' ').replace(/[ \t]+$/g, '');
}

function serialize(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? '')
        // Metnin kendisindeki işaretler kaçırılsın ki tur atınca bozulmasın.
        .replace(/([*`~=[\]])/g, '\\$1');
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const inner = serialize(child);
    const tag = child.tagName.toLowerCase();
    if (tag === 'br') { out += ' '; continue; }
    if (!inner.trim() && tag !== 'a') { continue; }
    switch (tag) {
      case 'b': case 'strong': out += `**${inner}**`; break;
      case 'i': case 'em': out += `*${inner}*`; break;
      case 'code': out += `\`${inner}\``; break;
      case 's': case 'del': case 'strike': out += `~~${inner}~~`; break;
      case 'mark': out += `==${inner}==`; break;
      case 'a': {
        const page = child.dataset.page;
        if (page) { out += `[[${page}]]`; break; }
        const href = child.getAttribute('href') ?? '';
        out += /^https?:/.test(href) ? `[${inner}](${href})` : inner;
        break;
      }
      default: out += inner;
    }
  }
  // Kaçırma işaretlerini geri al: yalnız gerçek biçim işaretleri kalsın.
  return out.replace(/\\([*`~=[\]])/g, '$1');
}

/** Blok metninden düz metin (arama, özet, başlık türetme). */
export function plainText(md: string): string {
  return md
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*`~=]/g, '')
    .trim();
}

/** Sayfanın tüm metni — arama ve özet için. */
export function blocksPlain(blocks: Block[]): string {
  const parts: string[] = [];
  walk(blocks, (b) => {
    if (b.text) parts.push(plainText(b.text));
    for (const row of b.rows) parts.push(row.join(' '));
  });
  return parts.join('\n');
}

/* --------------------------------------------------- markdown ↔ bloklar */

/**
 * Eski tek parça markdown gövdeyi bloklara çevirir.
 * v0.7 ve öncesindeki notların kayıpsız açılması buna bağlı.
 */
export function markdownToBlocks(src: string): Block[] {
  const lines = src.split('\n');
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { body.push(lines[i]); i++; }
      i++;
      const b = newBlock('code', body.join('\n'));
      b.meta = lang || 'bash';
      out.push(b);
      continue;
    }

    i++;
    if (!trimmed) continue;

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      out.push(newBlock((['h1', 'h2', 'h3'] as BlockType[])[heading[1].length - 1], heading[2]));
      continue;
    }
    if (/^(---|\*\*\*|___)$/.test(trimmed)) { out.push(newBlock('divider')); continue; }

    const todo = /^[-*]\s+\[( |x|X)\]\s*(.*)$/.exec(trimmed);
    if (todo) {
      const b = newBlock('todo', todo[2]);
      b.checked = todo[1].toLowerCase() === 'x';
      out.push(b);
      continue;
    }

    const callout = /^>\s*\[!([^\]]+)\]\s*(.*)$/.exec(trimmed);
    if (callout) {
      const b = newBlock('callout', callout[2]);
      b.meta = callout[1].toLowerCase();
      out.push(b);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) { out.push(newBlock('quote', quote[1])); continue; }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) { out.push(newBlock('bullet', bullet[1])); continue; }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) { out.push(newBlock('numbered', numbered[1])); continue; }

    out.push(newBlock('text', trimmed));
  }

  return out.length ? out : [newBlock('text')];
}

/** Bloklar → markdown (Obsidian'a dışa aktarma ve yedek okunabilirliği için). */
export function blocksToMarkdown(blocks: Block[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const out: string[] = [];
  let counter = 0;

  for (const b of blocks) {
    if (b.type === 'numbered') counter++; else counter = 0;
    switch (b.type) {
      case 'h1': out.push(`${pad}# ${b.text}`); break;
      case 'h2': out.push(`${pad}## ${b.text}`); break;
      case 'h3': out.push(`${pad}### ${b.text}`); break;
      case 'bullet': out.push(`${pad}- ${b.text}`); break;
      case 'numbered': out.push(`${pad}${counter}. ${b.text}`); break;
      case 'todo': out.push(`${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`); break;
      case 'toggle': out.push(`${pad}- ${b.text}`); break;
      case 'quote': out.push(`${pad}> ${b.text}`); break;
      case 'callout': out.push(`${pad}> [!${b.meta || 'bilgi'}] ${b.text}`); break;
      case 'code': out.push(`${pad}\`\`\`${b.meta}\n${b.text}\n${pad}\`\`\``); break;
      case 'divider': out.push(`${pad}---`); break;
      case 'image': out.push(`${pad}![](${b.meta})`); break;
      case 'video': out.push(`${pad}[video](${b.meta})`); break;
      case 'bookmark': out.push(`${pad}[${b.text || b.meta}](${b.meta})`); break;
      case 'equation': out.push(`${pad}$$${b.text}$$`); break;
      case 'subpage': out.push(`${pad}[[${b.text}]]`); break;
      case 'table':
        b.rows.forEach((row, ri) => {
          out.push(`${pad}| ${row.join(' | ')} |`);
          if (ri === 0) out.push(`${pad}|${row.map(() => ' --- ').join('|')}|`);
        });
        break;
      default: out.push(`${pad}${b.text}`);
    }
    if (b.children.length) out.push(blocksToMarkdown(b.children, depth + 1));
  }
  return out.join('\n');
}

/**
 * Yazarken markdown kısayolu: satır başına yazılan işaret bloğun TÜRÜNÜ
 * değiştirir ve işaret metinden silinir ("## " yazınca H2 olur, "##" görünmez).
 */
export function shortcutFor(text: string): { type: BlockType; rest: string; checked?: boolean } | null {
  // Yapılacak kalıpları ÖNCE denenir: "- [ ] süt" yapıştırıldığında madde
  // olarak okunup "[ ]" metne düşmesin.
  const todo = /^(?:[-*+]\s+)?\[( |x|X)?\]\s/.exec(text);
  if (todo) return { type: 'todo', rest: text.slice(todo[0].length), checked: (todo[1] ?? '').toLowerCase() === 'x' };

  const map: [RegExp, BlockType][] = [
    [/^###\s/, 'h3'],
    [/^##\s/, 'h2'],
    [/^#\s/, 'h1'],
    [/^>>\s/, 'toggle'],
    [/^[-*+]\s/, 'bullet'],
    [/^\d+[.)]\s/, 'numbered'],
    [/^>\s/, 'quote'],
    [/^"\s/, 'quote'],
    [/^\|\s/, 'callout'],
    [/^```/, 'code'],
    [/^---$/, 'divider'],
  ];
  for (const [re, type] of map) {
    const m = re.exec(text);
    if (m) return { type, rest: text.slice(m[0].length) };
  }
  return null;
}
