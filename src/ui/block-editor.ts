/**
 * Blok editörü — Notion mantığı.
 *
 * Sayfa, ayrı ayrı düzenlenebilen bloklardan oluşur. Her metin bloğu kendi
 * `contenteditable` alanıdır; yazarken EKRAN YENİDEN ÇİZİLMEZ, yalnız model
 * sessizce güncellenir (imleç asla kaçmaz). Yeniden çizim sadece yapısal
 * değişimde olur (blok eklendi/silindi/türü değişti) ve sonrasında imleç
 * hedeflenen bloğa geri konur.
 *
 * Kullanıcı markdown işareti GÖRMEZ: "## " yazınca blok başlığa döner ve
 * işaret silinir; Ctrl+B kalın yapar. İşaretler yalnız dosyada saklanır.
 */

import {
  Block, BlockType, BLOCK_LABEL, BLOCK_ICON, TEXTY,
  newBlock, findBlock, takeBlock, moveBlock, inlineToHtml, htmlToInline, shortcutFor,
} from '../core/blocks';
import { h, clear } from './dom';
import { highlight } from '../core/highlight';
import { uid } from '../core/util';

export interface EditorOptions {
  /** Blokların kaynağı — düzenleme doğrudan bu diziyi değiştirir. */
  blocks: Block[];
  /** Model değişti: sessiz kayıt (yazarken) ya da tam kayıt (yapısal). */
  onChange: (structural: boolean) => void;
  /** Alt sayfa bloğuna tıklandı / `[[bağlantı]]` açıldı. */
  onOpenPage: (pageId: string) => void;
  /** Yeni alt sayfa oluştur (başlık ver, id dön). */
  onCreateSubpage: (title: string) => string;
  /** `[[Ad]]` yazıldı: varsa bul, yoksa oluştur, id dön. */
  onWikilink: (name: string) => string;
  /** Sayfa adı → başlık (alt sayfa bloğunu çizmek için). */
  pageTitle: (id: string) => string;
  pageIcon: (id: string) => string;
  readOnly?: boolean;
}

interface FocusTarget { id: string; at: 'start' | 'end'; }

export class BlockEditor {
  private host: HTMLElement;
  private opts: EditorOptions;
  private focusNext: FocusTarget | null = null;
  private collapsed = new Set<string>();
  private dragId = '';

  constructor(host: HTMLElement, opts: EditorOptions) {
    this.host = host;
    this.opts = opts;
    this.render();
  }

  setBlocks(blocks: Block[]): void {
    this.opts.blocks = blocks;
    this.render();
  }

  /* --------------------------------------------------------------- çizim */

  render(): void {
    clear(this.host);
    this.host.className = 'be';
    for (const b of this.opts.blocks) this.host.append(this.renderBlock(b, this.opts.blocks, 0));
    this.host.append(this.tail());
    this.applyFocus();
  }

  /** Sayfanın altındaki boş alan: tıklayınca yeni blok açar (Notion gibi). */
  private tail(): HTMLElement {
    return h('div', {
      class: 'be__tail',
      title: 'yeni blok',
      onclick: () => {
        const list = this.opts.blocks;
        const last = list[list.length - 1];
        if (last && last.type === 'text' && !last.text) { this.focus(last.id, 'end'); this.applyFocus(); return; }
        const b = newBlock('text');
        list.push(b);
        this.focus(b.id, 'end');
        this.commit(true);
      },
    });
  }

  private renderBlock(b: Block, list: Block[], depth: number): HTMLElement {
    const row = h('div', {
      class: `be-block be-block--${b.type}`,
      dataset: { id: b.id, depth: String(depth) },
    });

    if (!this.opts.readOnly) row.append(this.gutter(b, list));
    row.append(this.content(b, list, depth));

    // Sürükle-bırak hedefi
    row.addEventListener('dragover', (e) => {
      if (!this.dragId || this.dragId === b.id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      row.classList.toggle('is-over-top', before);
      row.classList.toggle('is-over-bottom', !before);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('is-over-top', 'is-over-bottom');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const before = row.classList.contains('is-over-top');
      row.classList.remove('is-over-top', 'is-over-bottom');
      if (this.dragId && moveBlock(this.opts.blocks, this.dragId, b.id, before)) this.commit(true);
      this.dragId = '';
    });

    if (b.children.length && !this.collapsed.has(b.id)) {
      const kids = h('div', { class: 'be-children' });
      for (const c of b.children) kids.append(this.renderBlock(c, b.children, depth + 1));
      const wrap = h('div', { class: 'be-nest' }, row, kids);
      return wrap;
    }
    return row;
  }

  /** Solda beliren tutamak: + yeni blok, ⠿ sürükle / menü. */
  private gutter(b: Block, list: Block[]): HTMLElement {
    const add = h('button', {
      class: 'be-gutter__btn', text: '+', title: 'aşağıya blok ekle',
      onclick: () => {
        const idx = list.indexOf(b);
        const nb = newBlock('text');
        list.splice(idx + 1, 0, nb);
        this.focus(nb.id, 'end');
        this.commit(true);
        window.setTimeout(() => this.openSlashMenu(nb.id), 0);
      },
    });

    const handle = h('button', {
      class: 'be-gutter__btn be-gutter__handle', text: '⠿', title: 'sürükle ya da tıkla',
      onclick: (e) => { e.stopPropagation(); this.openBlockMenu(b, list, handle); },
    });
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      this.dragId = b.id;
      e.dataTransfer?.setData('text/plain', b.id);
      (handle.closest('.be-block') as HTMLElement | null)?.classList.add('is-dragging');
    });
    handle.addEventListener('dragend', () => {
      this.dragId = '';
      this.host.querySelectorAll('.is-dragging').forEach((x) => x.classList.remove('is-dragging'));
    });

    return h('div', { class: 'be-gutter' }, add, handle);
  }

  /* -------------------------------------------------------- blok içeriği */

  private content(b: Block, list: Block[], depth: number): HTMLElement {
    switch (b.type) {
      case 'divider':
        return h('div', { class: 'be-divider' }, h('hr'));
      case 'image':
        return this.mediaBlock(b, 'image');
      case 'video':
        return this.mediaBlock(b, 'video');
      case 'table':
        return this.tableBlock(b);
      case 'subpage':
        return this.subpageBlock(b);
      case 'bookmark':
        return this.bookmarkBlock(b);
      case 'code':
        return this.codeBlock(b, list);
      default:
        return this.textBlock(b, list, depth);
    }
  }

  /** Metin taşıyan bloklar (başlık, madde, yapılacak, alıntı, kutu…). */
  private textBlock(b: Block, list: Block[], depth: number): HTMLElement {
    const editable = h('div', {
      class: 'be-text',
      html: inlineToHtml(b.text),
    });
    editable.contentEditable = this.opts.readOnly ? 'false' : 'true';
    editable.spellcheck = false;
    editable.dataset.ph = this.placeholder(b);

    editable.addEventListener('input', () => this.onInput(b, editable, list));
    editable.addEventListener('keydown', (e) => this.onKey(e, b, editable, list, depth));
    editable.addEventListener('paste', (e) => this.onPaste(e, b, editable, list));
    editable.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a.wikilink') as HTMLElement | null;
      if (link && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.opts.onOpenPage(this.opts.onWikilink(link.dataset.page ?? ''));
      }
    });
    editable.addEventListener('mouseup', () => showFormatBar(editable, () => this.save(b, editable)));

    const parts: (HTMLElement | null)[] = [];

    if (b.type === 'todo') {
      parts.push(h('button', {
        class: `be-check${b.checked ? ' is-on' : ''}`,
        text: b.checked ? '✓' : '',
        onclick: () => { b.checked = !b.checked; this.commit(true); },
      }));
    }
    if (b.type === 'toggle') {
      const open = !this.collapsed.has(b.id);
      parts.push(h('button', {
        class: `be-toggle${open ? ' is-open' : ''}`,
        text: '▸',
        title: open ? 'kapat' : 'aç',
        onclick: () => {
          if (open) this.collapsed.add(b.id); else this.collapsed.delete(b.id);
          this.render();
        },
      }));
    }
    if (b.type === 'bullet') parts.push(h('span', { class: 'be-bullet', text: '•' }));
    if (b.type === 'numbered') {
      // Kesintisiz numaralı dizinin kaçıncısı olduğunu bul (araya başka blok
      // girerse numaralandırma yeniden 1'den başlar — Notion da böyle yapar).
      let n = 1;
      for (let i = list.indexOf(b) - 1; i >= 0 && list[i].type === 'numbered'; i--) n++;
      parts.push(h('span', { class: 'be-num', text: `${n}.` }));
    }
    if (b.type === 'callout') {
      parts.push(h('button', {
        class: 'be-callout__icon',
        text: CALLOUT_ICON[b.meta] ?? '💡',
        title: 'kutu türünü değiştir',
        onclick: () => {
          const keys = Object.keys(CALLOUT_ICON);
          b.meta = keys[(keys.indexOf(b.meta) + 1) % keys.length];
          this.commit(true);
        },
      }));
    }

    const wrap = h('div', { class: `be-content be-content--${b.type}` }, ...parts, editable);
    if (b.type === 'callout') wrap.classList.add(`be-callout--${b.meta || 'bilgi'}`);
    return wrap;
  }

  private placeholder(b: Block): string {
    if (b.type === 'h1') return 'Başlık 1';
    if (b.type === 'h2') return 'Başlık 2';
    if (b.type === 'h3') return 'Başlık 3';
    if (b.type === 'todo') return 'Yapılacak';
    if (b.type === 'quote') return 'Alıntı';
    if (b.type === 'callout') return 'Bilgi kutusu';
    if (b.type === 'toggle') return 'Açılır başlık';
    if (b.type === 'equation') return 'Denklem';
    return "Yazmaya başla, '/' ile blok ekle";
  }

  private codeBlock(b: Block, list: Block[]): HTMLElement {
    const pre = h('pre', { class: 'be-code__body' });
    const code = h('code', { html: highlight(b.text, b.meta || 'bash') });
    code.contentEditable = this.opts.readOnly ? 'false' : 'true';
    code.spellcheck = false;
    pre.append(code);

    code.addEventListener('input', () => {
      b.text = code.textContent ?? '';
      this.commit(false);
    });
    code.addEventListener('blur', () => {
      code.innerHTML = highlight(b.text, b.meta || 'bash');
    });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        return;
      }
      if (e.key === 'Backspace' && !(code.textContent ?? '')) {
        e.preventDefault();
        this.removeBlock(b, list);
      }
      e.stopPropagation();
    });

    const langs = ['bash', 'python', 'javascript', 'typescript', 'sql', 'json', 'html', 'css', 'powershell'];
    const sel = h('select', {
      class: 'be-code__lang',
      onchange: (e) => {
        b.meta = (e.target as HTMLSelectElement).value;
        code.innerHTML = highlight(b.text, b.meta);
        this.commit(false);
      },
    });
    for (const l of langs) {
      const o = h('option', { value: l, text: l });
      if (l === (b.meta || 'bash')) o.selected = true;
      sel.append(o);
    }

    return h('div', { class: 'be-content be-code' }, sel, pre);
  }

  private mediaBlock(b: Block, kind: 'image' | 'video'): HTMLElement {
    if (!b.meta) {
      const input = h('input', {
        class: 'be-media__input',
        placeholder: kind === 'image' ? 'resim adresi yapıştır (https://…)' : 'video adresi (YouTube / mp4)',
        onkeydown: (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          b.meta = (e.target as HTMLInputElement).value.trim();
          this.commit(true);
        },
      });
      return h('div', { class: 'be-content be-media be-media--empty' },
        h('span', { class: 'be-media__icon', text: kind === 'image' ? '🖼' : '▶' }),
        input,
      );
    }

    const body = kind === 'image'
      ? h('img', { class: 'be-media__img', src: b.meta, alt: b.text })
      : embedFor(b.meta);

    return h('div', { class: 'be-content be-media' },
      body,
      h('button', {
        class: 'be-media__clear', text: '×', title: 'adresi değiştir',
        onclick: () => { b.meta = ''; this.commit(true); },
      }),
    );
  }

  /** Bağlantı kartı: adres girilir, alan adıyla birlikte kart olarak durur. */
  private bookmarkBlock(b: Block): HTMLElement {
    if (!b.meta) {
      const input = h('input', {
        class: 'be-media__input',
        placeholder: 'bağlantı adresi (https://…) — Enter',
        onkeydown: (e) => {
          if (e.key !== 'Enter') { e.stopPropagation(); return; }
          e.preventDefault();
          const v = (e.target as HTMLInputElement).value.trim();
          if (!v) return;
          b.meta = /^https?:/.test(v) ? v : `https://${v}`;
          if (!b.text) b.text = hostOf(b.meta);
          this.commit(true);
        },
      });
      return h('div', { class: 'be-content be-media be-media--empty' },
        h('span', { class: 'be-media__icon', text: '🔖' }),
        input,
      );
    }

    const label = h('div', { class: 'be-bookmark__title', html: inlineToHtml(b.text || hostOf(b.meta)) });
    label.contentEditable = this.opts.readOnly ? 'false' : 'true';
    label.addEventListener('input', () => { b.text = htmlToInline(label.innerHTML); this.commit(false); });
    label.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); e.stopPropagation(); });

    return h('div', { class: 'be-content be-bookmark' },
      h('span', { class: 'be-bookmark__icon', text: '🔖' }),
      h('div', { class: 'be-bookmark__main' },
        label,
        (() => {
          const a = h('a', { class: 'be-bookmark__url ellipsis', href: b.meta, text: b.meta });
          a.target = '_blank';
          a.rel = 'noreferrer';
          return a;
        })(),
      ),
      h('button', {
        class: 'be-bookmark__clear', text: '×', title: 'adresi değiştir',
        onclick: () => { b.meta = ''; this.commit(true); },
      }),
    );
  }

  private subpageBlock(b: Block): HTMLElement {
    const title = this.opts.pageTitle(b.meta);
    return h('button', {
      class: 'be-content be-subpage',
      onclick: () => this.opts.onOpenPage(b.meta),
    },
      h('span', { class: 'be-subpage__icon', text: this.opts.pageIcon(b.meta) || '📄' }),
      h('span', { class: 'be-subpage__title', text: title }),
      h('span', { class: 'be-subpage__hint', text: 'alt sayfa →' }),
    );
  }

  private tableBlock(b: Block): HTMLElement {
    const table = h('table', { class: 'be-table' });
    b.rows.forEach((row, ri) => {
      const tr = h('tr', {});
      row.forEach((cell, ci) => {
        const td = h(ri === 0 ? 'th' : 'td', { text: cell });
        td.contentEditable = this.opts.readOnly ? 'false' : 'true';
        td.addEventListener('input', () => { b.rows[ri][ci] = td.textContent ?? ''; this.commit(false); });
        td.addEventListener('keydown', (e) => e.stopPropagation());
        tr.append(td);
      });
      table.append(tr);
    });

    return h('div', { class: 'be-content be-table-wrap' },
      table,
      h('div', { class: 'be-table__tools' },
        h('button', {
          class: 'mini-btn', text: '+ SATIR',
          onclick: () => { b.rows.push(b.rows[0].map(() => '')); this.commit(true); },
        }),
        h('button', {
          class: 'mini-btn', text: '+ SÜTUN',
          onclick: () => { for (const r of b.rows) r.push(''); this.commit(true); },
        }),
      ),
    );
  }

  /* ------------------------------------------------------------- yazma */

  private save(b: Block, el: HTMLElement): void {
    b.text = htmlToInline(el.innerHTML);
  }

  private onInput(b: Block, el: HTMLElement, list: Block[]): void {
    const plain = el.textContent ?? '';

    // Markdown kısayolu: satır başına yazılan işaret bloğun türünü değiştirir.
    const sc = shortcutFor(plain);
    if (sc && b.type !== 'code') {
      b.type = sc.type;
      b.text = sc.rest;
      if (sc.checked !== undefined) b.checked = sc.checked;
      if (sc.type === 'divider') b.text = '';
      if (sc.type === 'table') b.rows = [['', ''], ['', '']];
      this.focus(b.id, 'end');
      this.commit(true);
      return;
    }

    // `[[Ad]]` tamamlandıysa sayfayı bul/oluştur ve bağlantıya çevir.
    if (/\[\[[^\]]+\]\]/.test(plain)) {
      this.save(b, el);
      const names = [...b.text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
      for (const n of names) this.opts.onWikilink(n);
      el.innerHTML = inlineToHtml(b.text);
      this.focus(b.id, 'end');
      this.applyFocus();
      this.commit(true);
      return;
    }

    this.save(b, el);
    this.commit(false);
    void list;
  }

  private onPaste(e: ClipboardEvent, b: Block, el: HTMLElement, list: Block[]): void {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text.includes('\n')) return; // tek satır: tarayıcıya bırak (düz metin)
    e.preventDefault();
    // Çok satırlı yapıştırma: her satır ayrı blok olsun.
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const idx = list.indexOf(b);
    const made: Block[] = [];
    for (const line of lines) {
      const sc = shortcutFor(line + ' ');
      const nb = newBlock(sc ? sc.type : 'text', sc ? sc.rest : line);
      if (sc?.checked) nb.checked = true;
      made.push(nb);
    }
    if (!(el.textContent ?? '').trim()) {
      list.splice(idx, 1, ...made);
    } else {
      list.splice(idx + 1, 0, ...made);
    }
    this.focus(made[made.length - 1].id, 'end');
    this.commit(true);
  }

  private onKey(e: KeyboardEvent, b: Block, el: HTMLElement, list: Block[], depth: number): void {
    // Biçimlendirme kısayolları — kullanıcı ** yazmaz.
    if (e.ctrlKey || e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); document.execCommand('bold'); this.save(b, el); this.commit(false); return; }
      if (k === 'i') { e.preventDefault(); document.execCommand('italic'); this.save(b, el); this.commit(false); return; }
      if (k === 'e') { e.preventDefault(); wrapSelection('code'); this.save(b, el); this.commit(false); return; }
      if (k === 'h') { e.preventDefault(); wrapSelection('mark'); this.save(b, el); this.commit(false); return; }
      if (k === 'd') { e.preventDefault(); wrapSelection('del'); this.save(b, el); this.commit(false); return; }
      return;
    }

    if (e.key === 'Escape') { hideFormatBar(); (el as HTMLElement).blur(); return; }

    if (e.key === '/' && !(el.textContent ?? '').trim()) {
      e.preventDefault();
      this.openSlashMenu(b.id);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.save(b, el);
      const after = splitAtCaret(el);
      b.text = htmlToInline(el.innerHTML);

      // Boş liste maddesinde Enter: listeden çık (Notion davranışı).
      if (!b.text.trim() && !after.trim() && b.type !== 'text') {
        b.type = 'text';
        this.focus(b.id, 'end');
        this.commit(true);
        return;
      }

      const keep: BlockType[] = ['bullet', 'numbered', 'todo'];
      const nb = newBlock(keep.includes(b.type) ? b.type : 'text', after);
      const idx = list.indexOf(b);
      list.splice(idx + 1, 0, nb);
      this.focus(nb.id, 'start');
      this.commit(true);
      return;
    }

    if (e.key === 'Backspace' && caretAtStart(el)) {
      e.preventDefault();
      this.save(b, el);
      if (b.type !== 'text') {
        // Önce türü sıfırla (Notion: başlıkta Backspace önce metne çevirir).
        b.type = 'text';
        this.focus(b.id, 'start');
        this.commit(true);
        return;
      }
      const idx = list.indexOf(b);
      if (idx === 0 && depth === 0) return;
      const prev = idx > 0 ? list[idx - 1] : null;
      if (prev && TEXTY.includes(prev.type)) {
        prev.text += b.text;
        list.splice(idx, 1);
        this.focus(prev.id, 'end');
        this.commit(true);
        return;
      }
      this.removeBlock(b, list);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      this.save(b, el);
      const idx = list.indexOf(b);
      if (e.shiftKey) {
        this.outdent(b);
      } else if (idx > 0) {
        const prev = list[idx - 1];
        list.splice(idx, 1);
        prev.children.push(b);
        this.collapsed.delete(prev.id);
      }
      this.focus(b.id, 'end');
      this.commit(true);
      return;
    }

    if (e.key === 'ArrowUp' && caretAtStart(el)) {
      const prev = this.flat()[this.flat().findIndex((x) => x.id === b.id) - 1];
      if (prev) { e.preventDefault(); this.focus(prev.id, 'end'); this.applyFocus(); }
      return;
    }
    if (e.key === 'ArrowDown' && caretAtEnd(el)) {
      const flat = this.flat();
      const next = flat[flat.findIndex((x) => x.id === b.id) + 1];
      if (next) { e.preventDefault(); this.focus(next.id, 'start'); this.applyFocus(); }
    }
  }

  private outdent(b: Block): void {
    // Üst bloğun children'ından çıkar, üst bloğun kardeşi yap.
    const parentOf = (list: Block[], target: Block): { list: Block[]; owner: Block } | null => {
      for (const x of list) {
        if (x.children.includes(target)) return { list, owner: x };
        const inner = parentOf(x.children, target);
        if (inner) return inner;
      }
      return null;
    };
    const hit = parentOf(this.opts.blocks, b);
    if (!hit) return;
    hit.owner.children = hit.owner.children.filter((x) => x.id !== b.id);
    hit.list.splice(hit.list.indexOf(hit.owner) + 1, 0, b);
  }

  private removeBlock(b: Block, list: Block[]): void {
    const idx = list.indexOf(b);
    const flat = this.flat();
    const prev = flat[flat.findIndex((x) => x.id === b.id) - 1];
    list.splice(idx, 1);
    if (!this.opts.blocks.length) this.opts.blocks.push(newBlock('text'));
    this.focus(prev ? prev.id : this.opts.blocks[0].id, 'end');
    this.commit(true);
  }

  /** Tüm blokları (alt bloklar dahil) görünen sırayla verir. */
  private flat(): Block[] {
    const out: Block[] = [];
    const rec = (list: Block[]) => {
      for (const b of list) { out.push(b); if (!this.collapsed.has(b.id)) rec(b.children); }
    };
    rec(this.opts.blocks);
    return out;
  }

  /* ---------------------------------------------------------- menüler */

  /** "/" menüsü — blok türü seçimi, yazarak filtrelenir. */
  openSlashMenu(blockId: string): void {
    const hit = findBlock(this.opts.blocks, blockId);
    if (!hit) return;
    const anchor = this.host.querySelector(`[data-id="${blockId}"] .be-text`) as HTMLElement | null;

    const menu = h('div', { class: 'be-menu' });
    const search = h('input', { class: 'be-menu__search', placeholder: 'blok ara…' });
    const listEl = h('div', { class: 'be-menu__list' });
    menu.append(search, listEl);

    const types: BlockType[] = [
      'text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'numbered', 'toggle',
      'quote', 'callout', 'code', 'divider', 'table', 'image', 'video',
      'bookmark', 'equation', 'subpage',
    ];

    let items: HTMLElement[] = [];
    let active = 0;

    const paint = (q = '') => {
      clear(listEl);
      items = [];
      const found = types.filter((t) => BLOCK_LABEL[t].toLowerCase().includes(q.toLowerCase()));
      found.forEach((t, i) => {
        const item = h('button', {
          class: `be-menu__item${i === 0 ? ' is-active' : ''}`,
          onmousedown: (e) => e.preventDefault(),
          onclick: () => { apply(t); },
        },
          h('span', { class: 'be-menu__glyph', text: BLOCK_ICON[t] }),
          h('span', { text: BLOCK_LABEL[t] }),
        );
        items.push(item);
        listEl.append(item);
      });
      active = 0;
      if (!found.length) listEl.append(h('div', { class: 'be-menu__empty', text: 'blok bulunamadı' }));
    };

    const apply = (t: BlockType) => {
      const target = findBlock(this.opts.blocks, blockId);
      if (!target) return;
      close();
      const b = target.block;
      if (t === 'subpage') {
        const id = this.opts.onCreateSubpage('');
        b.type = 'subpage';
        b.meta = id;
        b.text = '';
      } else if (t === 'table') {
        b.type = 'table';
        b.rows = [['Başlık', 'Başlık'], ['', '']];
      } else {
        b.type = t;
        if (t === 'callout' && !b.meta) b.meta = 'bilgi';
        if (t === 'code' && !b.meta) b.meta = 'bash';
        if (t === 'image' || t === 'video' || t === 'bookmark') b.meta = '';
      }
      this.focus(b.id, 'end');
      this.commit(true);
    };

    const close = () => {
      menu.remove();
      document.removeEventListener('mousedown', onOutside, true);
    };
    const onOutside = (ev: MouseEvent) => { if (!menu.contains(ev.target as Node)) close(); };

    search.addEventListener('input', () => paint(search.value));
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); anchor?.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[active]?.classList.remove('is-active');
        active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % Math.max(1, items.length);
        items[active]?.classList.add('is-active');
        items[active]?.scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); items[active]?.click(); }
    });

    paint();
    (anchor?.closest('.be-block') ?? this.host).append(menu);
    document.addEventListener('mousedown', onOutside, true);
    search.focus();
  }

  /** Tutamak menüsü: türü değiştir, kopyala, sil. */
  private openBlockMenu(b: Block, list: Block[], anchor: HTMLElement): void {
    document.querySelector('.be-menu')?.remove();
    const menu = h('div', { class: 'be-menu be-menu--block' });

    const item = (label: string, glyph: string, run: () => void, danger = false) =>
      h('button', {
        class: `be-menu__item${danger ? ' is-danger' : ''}`,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => { menu.remove(); run(); },
      }, h('span', { class: 'be-menu__glyph', text: glyph }), h('span', { text: label }));

    menu.append(
      item('Türü değiştir', '⇄', () => this.openSlashMenu(b.id)),
      item('Kopyala', '⧉', () => {
        const copy: Block = JSON.parse(JSON.stringify(b));
        copy.id = uid('b');
        list.splice(list.indexOf(b) + 1, 0, copy);
        this.commit(true);
      }),
      item('Yukarı taşı', '↑', () => {
        const i = list.indexOf(b);
        if (i > 0) { list.splice(i, 1); list.splice(i - 1, 0, b); this.commit(true); }
      }),
      item('Aşağı taşı', '↓', () => {
        const i = list.indexOf(b);
        if (i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, b); this.commit(true); }
      }),
      item('Sil', '🗑', () => {
        takeBlock(this.opts.blocks, b.id);
        if (!this.opts.blocks.length) this.opts.blocks.push(newBlock('text'));
        this.commit(true);
      }, true),
    );

    (anchor.closest('.be-block') ?? this.host).append(menu);
    const onOutside = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener('mousedown', onOutside, true); }
    };
    window.setTimeout(() => document.addEventListener('mousedown', onOutside, true), 0);
  }

  /* ---------------------------------------------------------- odaklanma */

  private focus(id: string, at: 'start' | 'end'): void {
    this.focusNext = { id, at };
  }

  private applyFocus(): void {
    if (!this.focusNext) return;
    const { id, at } = this.focusNext;
    this.focusNext = null;
    const el = this.host.querySelector(`[data-id="${id}"] .be-text, [data-id="${id}"] .be-code__body code`) as HTMLElement | null;
    if (!el) return;
    el.focus();
    placeCaret(el, at);
  }

  private commit(structural: boolean): void {
    this.opts.onChange(structural);
    if (structural) this.render();
  }
}

/* ------------------------------------------------------------ yardımcılar */

const CALLOUT_ICON: Record<string, string> = {
  bilgi: '💡', uyarı: '⚠️', önemli: '🔥', not: '📝', yapıldı: '✅',
};

/** Adresten alan adı ("github.com") — bağlantı kartı başlığı için. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function embedFor(url: string): HTMLElement {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/.exec(url);
  if (yt) {
    const f = h('iframe', { class: 'be-media__frame' });
    f.setAttribute('src', `https://www.youtube.com/embed/${yt[1]}`);
    f.setAttribute('allowfullscreen', 'true');
    f.setAttribute('frameborder', '0');
    return f;
  }
  const v = h('video', { class: 'be-media__img' });
  v.setAttribute('src', url);
  v.setAttribute('controls', 'true');
  return v;
}

/** Seçimi verilen etiketle sarar (Ctrl+E kod, Ctrl+H vurgu…). */
function wrapSelection(tag: 'code' | 'mark' | 'del'): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const el = document.createElement(tag);
  try {
    el.appendChild(range.extractContents());
    range.insertNode(el);
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(el);
    sel.addRange(after);
  } catch {
    /* karışık seçim: sessizce geç */
  }
}

export function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().length === 0;
}

export function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el);
  r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return r.toString().length === 0;
}

export function placeCaret(el: HTMLElement, at: 'start' | 'end'): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(at === 'start');
  sel.removeAllRanges();
  sel.addRange(r);
}

/** İmleçten sonrasını keser ve satır içi markdown olarak döner. */
function splitAtCaret(el: HTMLElement): string {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return '';
  const r = sel.getRangeAt(0);
  const after = r.cloneRange();
  after.selectNodeContents(el);
  after.setStart(r.endContainer, r.endOffset);
  const frag = after.extractContents();
  const box = document.createElement('div');
  box.appendChild(frag);
  return htmlToInline(box.innerHTML);
}

/* ------------------------------------------------- seçim biçim çubuğu */

let formatBar: HTMLElement | null = null;

/** Metin seçilince üstünde beliren küçük biçim çubuğu (Notion'daki gibi). */
function showFormatBar(host: HTMLElement, save: () => void): void {
  hideFormatBar();
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  if (!host.contains(sel.anchorNode)) return;

  const rect = sel.getRangeAt(0).getBoundingClientRect();
  const bar = h('div', { class: 'be-format' });
  const btn = (label: string, title: string, run: () => void) =>
    h('button', {
      class: 'be-format__btn', text: label, title,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { run(); save(); },
    });

  bar.append(
    btn('B', 'kalın (Ctrl+B)', () => document.execCommand('bold')),
    btn('I', 'eğik (Ctrl+I)', () => document.execCommand('italic')),
    btn('S', 'üstü çizili (Ctrl+D)', () => wrapSelection('del')),
    btn('</>', 'kod (Ctrl+E)', () => wrapSelection('code')),
    btn('🖍', 'vurgu (Ctrl+H)', () => wrapSelection('mark')),
  );

  bar.style.left = `${Math.max(8, rect.left)}px`;
  bar.style.top = `${Math.max(8, rect.top - 42)}px`;
  document.body.append(bar);
  formatBar = bar;

  const off = (e: MouseEvent) => {
    if (bar.contains(e.target as Node)) return;
    hideFormatBar();
    document.removeEventListener('mousedown', off, true);
  };
  window.setTimeout(() => document.addEventListener('mousedown', off, true), 0);
}

export function hideFormatBar(): void {
  formatBar?.remove();
  formatBar = null;
}
