/**
 * Notlar — Notion mantığında sayfa sistemi.
 *
 * Sol: sayfa ağacı (iç içe, sınırsız derinlik), favoriler, kategoriler, arşiv,
 *      arama ve filtreler.
 * Sağ: kapak + simge + başlık + özellikler + BLOK editörü + alt sayfalar +
 *      ilişkiler + geri bağlantılar. Sayfa bir veritabanına çevrilebilir;
 *      o zaman alt sayfaları tablo/liste/pano/galeri/takvim olarak gösterir.
 *
 * Yazarken ekran yeniden çizilmez: blok editörü modeli sessizce günceller,
 * sol ağaç yazma bittikten ~600 ms sonra yerinde tazelenir.
 */

import { store, db } from '../core/store';
import { Page, NOTE_COVERS, PROP_TYPES, PropType } from '../core/model';
import { newBlock, blocksPlain } from '../core/blocks';
import {
  pageById, pageTitle, childrenOf, breadcrumb, createPage, updatePage,
  deletePage, restorePages, setArchived, movePage, toggleRelation, relatedPages,
  backlinks, resolveWikilink, searchPages, todoProgress, newProp, UNTITLED,
} from '../core/pages';
import { h, clear } from '../ui/dom';
import { toast, confirmDialog, formModal } from '../ui/overlay';
import { BlockEditor, hideFormatBar } from '../ui/block-editor';
import { renderDatabase } from '../ui/page-db';
import { shortDate, fullDate, splitList, nowISO } from '../core/util';

type SideFilter = 'sayfalar' | 'son' | 'favoriler' | 'arşiv';
type SortKey = 'güncelleme' | 'oluşturma' | 'ad';

interface NotesUI {
  selected: string;
  query: string;
  filter: SideFilter;
  tag: string;
  sort: SortKey;
  expanded: Set<string>;
}

const ui: NotesUI = {
  selected: '',
  query: '',
  filter: 'sayfalar',
  tag: '',
  sort: 'güncelleme',
  expanded: new Set<string>(),
};

/** Düz listelerde sıralama — ağaç kendi doğal sırasını korur. */
function sorted(pages: Page[]): Page[] {
  const by: Record<SortKey, (a: Page, b: Page) => number> = {
    'güncelleme': (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    'oluşturma': (a, b) => b.createdAt.localeCompare(a.createdAt),
    ad: (a, b) => pageTitle(a).localeCompare(pageTitle(b), 'tr'),
  };
  return [...pages].sort(by[ui.sort]);
}

/** Sayfa simgeleri — hızlı seçim ızgarası. */
const ICONS = [
  '📄', '📝', '✅', '📌', '💡', '🎯', '🔥', '⭐', '📚', '🧠',
  '🗂️', '🧪', '🖥️', '🔐', '🐧', '🌐', '📊', '📥', '🗓️', '⏰',
  '🎬', '🎮', '⚽', '🎵', '☕', '🍿', '💰', '✈️', '🏋️', '🇬🇧',
];


/** Dışarıdan (Bugün ekranı, komut paleti) bir sayfayı açmak için. */
export function openNote(id: string): void {
  ui.selected = id;
  for (const p of breadcrumb(id)) ui.expanded.add(p.id);
}

/** Hızlı yakalama: Gelen Kutusu kategorisinde yeni sayfa. */
export function addNoteToInbox(text: string): void {
  const lines = text.split('\n').filter(Boolean);
  const title = (lines[0] ?? 'Yakalama').slice(0, 60);
  const rest = lines.slice(1);
  const id = createPage('', title, [
    ...(rest.length ? rest.map((l) => newBlock('text', l)) : [newBlock('text')]),
  ]);
  updatePage(id, (p) => { p.category = 'Gelen Kutusu'; p.icon = '📥'; });
}

/* ============================================================== ÇİZİM */

export function renderNotes(root: HTMLElement): void {
  hideFormatBar();
  clear(root);

  const pages = db().pages;
  if (!pages.find((p) => p.id === ui.selected)) {
    const first = pages.find((p) => !p.archived);
    ui.selected = first ? first.id : '';
  }

  root.append(
    h('div', { class: 'grid-notes' },
      sidebar(root),
      pageView(root),
    ),
  );
}

/* ============================================================ SOL AĞAÇ */

function sidebar(root: HTMLElement): HTMLElement {
  const search = h('input', {
    class: 'notes-search',
    placeholder: 'sayfalarda ara…',
    value: ui.query,
    oninput: (e) => { ui.query = (e.target as HTMLInputElement).value; refreshTree(root); },
  });

  const panel = h('div', { class: 'card card--view notes-panel' },
    h('div', { class: 'card__head card__head--tint' },
      h('span', { class: 'sub-text', text: '⌕' }),
      search,
      h('button', {
        class: 'notes-new', title: 'yeni sayfa', text: '+',
        onclick: () => newPage(root, ''),
      }),
    ),
    filterBar(root),
  );

  const tags = tagBar(root);
  if (tags) panel.append(tags);

  const tree = h('div', { class: 'notes-list' });
  panel.append(tree);
  fillTree(tree, root);
  panel.append(
    h('div', { class: 'notes-foot' },
      h('button', { class: 'notes-tpl', text: '＋ Sayfa', onclick: () => newPage(root, '') }),
      h('button', { class: 'notes-tpl', text: '☑ Yapılacaklar', onclick: () => newPage(root, '', 'todo') }),
      h('button', { class: 'notes-tpl', text: '🗄 Veritabanı', onclick: () => newPage(root, '', 'db') }),
    ),
  );
  return panel;
}

function filterBar(root: HTMLElement): HTMLElement {
  const bar = h('div', { class: 'notes-filters' });
  const defs: [SideFilter, string, string][] = [
    ['sayfalar', '📄', 'tüm sayfalar (ağaç)'],
    ['son', '🕘', 'son düzenlenenler'],
    ['favoriler', '⭐', 'favoriler'],
    ['arşiv', '🗄', 'arşiv'],
  ];
  for (const [id, label, title] of defs) {
    bar.append(h('button', {
      class: `notes-filter${ui.filter === id ? ' is-on' : ''}`,
      text: label, title,
      onclick: () => { ui.filter = id; ui.tag = ''; refreshTree(root); paintFilterBar(root); },
    }));
  }

  const sortSel = h('select', {
    class: 'notes-sort',
    title: 'sıralama',
    onchange: (e) => { ui.sort = (e.target as HTMLSelectElement).value as SortKey; refreshTree(root); },
  });
  for (const k of ['güncelleme', 'oluşturma', 'ad'] as SortKey[]) {
    const o = h('option', { value: k, text: k });
    if (k === ui.sort) o.selected = true;
    sortSel.append(o);
  }
  bar.append(sortSel);
  return bar;
}

/** Etiket şeridi: tıklayınca o etiketin sayfaları listelenir. */
function tagBar(root: HTMLElement): HTMLElement | null {
  const counts = new Map<string, number>();
  for (const p of db().pages) {
    if (p.archived) continue;
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const bar = h('div', { class: 'notes-tags' });
  for (const [t, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    bar.append(h('button', {
      class: `notes-tagchip${ui.tag === t ? ' is-on' : ''}`,
      text: `#${t} ${n}`,
      onclick: () => { ui.tag = ui.tag === t ? '' : t; refreshTree(root); },
    }));
  }
  return bar;
}

function paintFilterBar(root: HTMLElement): void {
  const old = root.querySelector('.notes-filters');
  old?.replaceWith(filterBar(root));
}

function refreshTree(root: HTMLElement): void {
  const tree = root.querySelector('.notes-list') as HTMLElement | null;
  if (tree) fillTree(tree, root);
}

function fillTree(tree: HTMLElement, root: HTMLElement): void {
  clear(tree);

  // Arama: ağaç yerine düz sonuç listesi.
  if (ui.query.trim()) {
    const hits = searchPages(ui.query, ui.filter === 'arşiv');
    if (!hits.length) { tree.append(h('div', { class: 'empty-state', text: 'Sayfa bulunamadı.' })); return; }
    tree.append(h('div', { class: 'notes-group', text: `sonuç · ${hits.length}` }));
    for (const hit of hits) {
      tree.append(h('button', {
        class: `note-item${hit.page.id === ui.selected ? ' is-active' : ''}`,
        onclick: () => { open(hit.page.id, root); },
      },
        h('div', { class: 'row', style: { gap: '7px' } },
          h('div', { class: 'note-item__icon', text: hit.page.icon || '📄' }),
          h('div', { class: 'note-item__title ellipsis', text: pageTitle(hit.page) }),
          h('span', { class: 'note-item__where', text: hit.where }),
        ),
        hit.excerpt ? h('div', { class: 'note-item__excerpt ellipsis', text: hit.excerpt }) : null,
      ));
    }
    return;
  }

  if (ui.filter === 'favoriler') {
    listFlat(tree, root, sorted(db().pages.filter((p) => p.favorite && !p.archived)), 'favoriler');
    return;
  }
  if (ui.filter === 'arşiv') {
    listFlat(tree, root, sorted(db().pages.filter((p) => p.archived)), 'arşiv');
    return;
  }
  if (ui.filter === 'son') {
    const recent = [...db().pages].filter((p) => !p.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 25);
    listFlat(tree, root, recent, 'son düzenlenenler');
    return;
  }

  // Etiket filtresi açıksa düz liste.
  if (ui.tag) {
    const tagged = sorted(db().pages.filter((p) => !p.archived && p.tags.includes(ui.tag)));
    listFlat(tree, root, tagged, `#${ui.tag}`);
    tree.prepend(h('button', {
      class: 'notes-tag-clear', text: '× etiket filtresini kaldır',
      onclick: () => { ui.tag = ''; refreshTree(root); },
    }));
    return;
  }

  const roots = childrenOf('');
  if (!roots.length) {
    tree.append(h('div', { class: 'empty-state', text: 'Henüz sayfa yok.' }));
    return;
  }

  const favs = db().pages.filter((p) => p.favorite && !p.archived);
  if (favs.length) {
    tree.append(h('div', { class: 'notes-group', text: `favoriler · ${favs.length}` }));
    for (const p of favs) tree.append(treeRow(p, root, 0, true));
  }

  const cats = [...new Set(roots.map((p) => p.category).filter(Boolean))].sort();
  const plain = roots.filter((p) => !p.category);

  tree.append(h('div', { class: 'notes-group', text: `sayfalar · ${roots.length}` }));
  for (const p of plain) tree.append(treeRow(p, root, 0));

  for (const c of cats) {
    tree.append(h('div', { class: 'notes-group', text: c.toLowerCase() }));
    for (const p of roots.filter((x) => x.category === c)) tree.append(treeRow(p, root, 0));
  }
}

function listFlat(tree: HTMLElement, root: HTMLElement, pages: Page[], label: string): void {
  if (!pages.length) {
    tree.append(h('div', { class: 'empty-state', text: 'Burası boş.' }));
    return;
  }
  tree.append(h('div', { class: 'notes-group', text: `${label} · ${pages.length}` }));
  for (const p of pages) tree.append(treeRow(p, root, 0, true));
}

/** Ağaç satırı: aç/kapa oku, simge, başlık, + alt sayfa. */
function treeRow(p: Page, root: HTMLElement, depth: number, flat = false): HTMLElement {
  const kids = flat ? [] : childrenOf(p.id);
  const open = ui.expanded.has(p.id);
  const td = todoProgress(p);

  const chevron = h('button', {
    class: `tree-chevron${kids.length ? '' : ' is-empty'}${open ? ' is-open' : ''}`,
    text: kids.length ? '▸' : '·',
    onclick: (e) => {
      e.stopPropagation();
      if (!kids.length) return;
      if (open) ui.expanded.delete(p.id); else ui.expanded.add(p.id);
      refreshTree(root);
    },
  });

  const row = h('div', {
    class: `note-item tree-row${p.id === ui.selected ? ' is-active' : ''}`,
    style: { paddingLeft: `${8 + depth * 14}px` },
    onclick: () => open2(p.id, root),
  },
    h('div', { class: 'row', style: { gap: '4px' } },
      chevron,
      h('div', { class: 'note-item__icon', text: p.icon || (p.database.on ? '🗄️' : '📄') }),
      h('div', { class: 'note-item__title ellipsis', text: pageTitle(p) }),
      td.total
        ? h('span', { class: `note-item__todo${td.done === td.total ? ' is-done' : ''}`, text: `${td.done}/${td.total}` })
        : null,
      p.favorite ? h('span', { class: 'note-item__pin', text: '★' }) : null,
      h('button', {
        class: 'tree-add', text: '+', title: 'alt sayfa ekle',
        onclick: (e) => { e.stopPropagation(); newPage(root, p.id); },
      }),
    ),
  );

  if (!kids.length || !open) return row;

  const wrap = h('div', { class: 'tree-branch' }, row);
  for (const k of kids) wrap.append(treeRow(k, root, depth + 1));
  return wrap;
}

function open2(id: string, root: HTMLElement): void {
  open(id, root);
}

function open(id: string, root: HTMLElement): void {
  flushTitle();
  ui.selected = id;
  for (const p of breadcrumb(id)) if (p.id !== id) ui.expanded.add(p.id);
  renderNotes(root);
}

/* =========================================================== SAĞ SAYFA */

function pageView(root: HTMLElement): HTMLElement {
  const p = pageById(ui.selected);
  if (!p) {
    return h('div', { class: 'note-page note-page--empty' },
      h('div', { class: 'empty-state' },
        h('div', { text: 'Soldan bir sayfa seç ya da yeni oluştur.' }),
        h('div', { class: 'empty-state__hint', text: 'Her not bir sayfadır: içine alt sayfa, tablo, yapılacak listesi koyabilirsin.' }),
      ));
  }

  const page = h('div', { class: 'note-page' });
  page.append(coverStrip(p, root));
  page.append(head(p, root));
  page.append(propsPanel(p, root));

  if (p.database.on) {
    page.append(renderDatabase(p, {
      onOpen: (id) => open(id, root),
      onChange: () => renderNotes(root),
    }));
  }

  const host = h('div', { class: 'be-host' });
  page.append(host);
  new BlockEditor(host, {
    blocks: p.blocks,
    onChange: (structural) => saveBlocks(p.id, structural, root),
    onOpenPage: (id) => open(id, root),
    onCreateSubpage: (title) => {
      const id = createPage(p.id, title);
      ui.expanded.add(p.id);
      // Editör kendi çizimini bitirsin, sonra sayfa (alt sayfa bölümü + ağaç)
      // tazelensin — aynı turda çizersek editörün kökü kopuyor.
      window.setTimeout(() => renderNotes(root), 0);
      return id;
    },
    onWikilink: (name) => resolveWikilink(name, ''),
    pageTitle: (id) => pageTitle(pageById(id)),
    pageIcon: (id) => pageById(id)?.icon ?? '',
  });

  const subs = subpagesPanel(p, root);
  if (subs) page.append(subs);
  page.append(relationsPanel(p, root));
  const back = backlinksPanel(p, root);
  if (back) page.append(back);
  page.append(footer(p));
  return page;
}

/** Blok değişimini kaydeder. Yazarken sessiz, yapısalda tam kayıt. */
let treeTimer: number | null = null;
function saveBlocks(id: string, structural: boolean, root: HTMLElement): void {
  updatePage(id, (p) => {
    // Bloklar zaten yerinde düzenlendi; burada yalnız updatedAt tazeleniyor.
    void p;
  }, !structural);
  if (treeTimer !== null) window.clearTimeout(treeTimer);
  treeTimer = window.setTimeout(() => refreshTree(root), 600);
}

/* ------------------------------------------------------------- kapak */

function coverStrip(p: Page, root: HTMLElement): HTMLElement {
  const gradient = NOTE_COVERS.find(([name]) => name === p.cover)?.[1] ?? '';
  const wrap = h('div', {
    class: `note-cover${gradient ? ' is-on' : ''}`,
    style: gradient ? { background: gradient } : {},
  });

  const picker = h('div', { class: 'note-cover__picker' });
  for (const [name, css] of NOTE_COVERS) {
    picker.append(h('button', {
      class: `note-cover__swatch${p.cover === name ? ' is-on' : ''}`,
      title: name, style: { background: css },
      onclick: () => { updatePage(p.id, (x) => { x.cover = x.cover === name ? '' : name; }); renderNotes(root); },
    }));
  }
  if (p.cover) {
    picker.append(h('button', {
      class: 'note-cover__clear', text: 'kapağı kaldır',
      onclick: () => { updatePage(p.id, (x) => { x.cover = ''; }); renderNotes(root); },
    }));
  }
  wrap.append(picker);
  return wrap;
}

/* ------------------------------------------------- başlık + eylemler */

function head(p: Page, root: HTMLElement): HTMLElement {
  const crumbs = h('div', { class: 'note-crumbs' });
  const trail = breadcrumb(p.id);
  trail.forEach((c, i) => {
    if (i) crumbs.append(h('span', { class: 'note-crumbs__sep', text: '/' }));
    crumbs.append(h('button', {
      class: `note-crumbs__item${c.id === p.id ? ' is-current' : ''}`,
      text: `${c.icon || '📄'} ${pageTitle(c)}`,
      onclick: () => open(c.id, root),
    }));
  });

  const titleInput = h('input', {
    class: 'note-title-input',
    value: p.title,
    placeholder: UNTITLED,
    oninput: () => queueTitle(p.id, titleInput.value, root),
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      flushTitle();
      (root.querySelector('.be-text') as HTMLElement | null)?.focus();
    },
  });

  const iconBtn = h('button', {
    class: 'note-emoji', title: 'sayfa simgesi', text: p.icon || (p.database.on ? '🗄️' : '📄'),
    onclick: (e) => { e.stopPropagation(); openIconPicker(p.id, root); },
  });

  return h('div', { class: 'note-page__head' },
    crumbs,
    h('div', { class: 'note-page__titlerow' }, iconBtn, titleInput, actions(p, root)),
  );
}

function actions(p: Page, root: HTMLElement): HTMLElement {
  const btn = (label: string, title: string, on: boolean, run: () => void, danger = false) =>
    h('button', {
      class: `note-icon-btn${on ? ' is-on' : ''}${danger ? ' note-icon-btn--danger' : ''}`,
      title, text: label, onclick: run,
    });

  return h('div', { class: 'note-page__icons' },
    btn(p.favorite ? '★' : '☆', p.favorite ? 'favorilerden çıkar' : 'favorilere ekle', p.favorite, () => {
      updatePage(p.id, (x) => { x.favorite = !x.favorite; });
      renderNotes(root);
    }),
    btn('🗄️', p.database.on ? 'veritabanını kapat' : 'veritabanına çevir', p.database.on, () => {
      updatePage(p.id, (x) => { x.database.on = !x.database.on; });
      renderNotes(root);
    }),
    btn('📤', 'başka sayfanın altına taşı', false, () => void movePrompt(p, root)),
    btn(p.archived ? '📂' : '📦', p.archived ? 'arşivden çıkar' : 'arşive at', p.archived, () => {
      setArchived(p.id, !p.archived);
      toast(p.archived ? 'Arşivden çıkarıldı' : 'Arşive atıldı');
      renderNotes(root);
    }),
    btn('🗑', 'sil', false, () => void removePage(p, root), true),
  );
}

/* ------------------------------------------------------------ başlık kaydı */

let titleTimer: number | null = null;
let titlePending: (() => void) | null = null;

function queueTitle(id: string, value: string, root: HTMLElement): void {
  titlePending = () => {
    updatePage(id, (p) => { p.title = value; }, true);
    refreshTree(root);
  };
  if (titleTimer !== null) window.clearTimeout(titleTimer);
  titleTimer = window.setTimeout(() => { titlePending?.(); titlePending = null; }, 400);
}

function flushTitle(): void {
  if (titleTimer !== null) window.clearTimeout(titleTimer);
  titleTimer = null;
  titlePending?.();
  titlePending = null;
}

/* --------------------------------------------------------- simge seçici */

function openIconPicker(id: string, root: HTMLElement): void {
  document.querySelector('.emoji-pop')?.remove();
  const pop = h('div', { class: 'emoji-pop' });
  for (const e of ICONS) {
    pop.append(h('button', {
      class: 'emoji-pop__item', text: e,
      onmousedown: (ev) => ev.preventDefault(),
      onclick: () => { updatePage(id, (p) => { p.icon = e; }); pop.remove(); renderNotes(root); },
    }));
  }
  pop.append(h('button', {
    class: 'emoji-pop__clear', text: 'simgeyi kaldır',
    onmousedown: (ev) => ev.preventDefault(),
    onclick: () => { updatePage(id, (p) => { p.icon = ''; }); pop.remove(); renderNotes(root); },
  }));
  (root.querySelector('.note-page__titlerow') ?? document.body).append(pop);
  const close = (ev: MouseEvent) => {
    if (!pop.contains(ev.target as Node)) { pop.remove(); document.removeEventListener('mousedown', close); }
  };
  window.setTimeout(() => document.addEventListener('mousedown', close), 0);
}

/* ------------------------------------------------------------ özellikler */

function propsPanel(p: Page, root: HTMLElement): HTMLElement {
  const wrap = h('div', { class: 'note-props' });

  const rowFor = (key: string, control: HTMLElement, glyph = '') =>
    h('div', { class: 'note-props__row' },
      h('div', { class: 'note-props__key' }, h('span', { class: 'note-props__glyph', text: glyph }), h('span', { text: key })),
      control,
    );

  // Etiketler
  const tagInput = h('input', {
    class: 'note-props__input',
    value: p.tags.join(', '),
    placeholder: 'etiket ekle…',
    oninput: () => updatePage(p.id, (x) => { x.tags = splitList(tagInput.value); }, true),
    onblur: () => { updatePage(p.id, (x) => { x.tags = splitList(tagInput.value); }); refreshTree(root); },
  });
  wrap.append(rowFor('Etiketler', tagInput, '#'));

  // Kategori
  const catInput = h('input', {
    class: 'note-props__input',
    value: p.category,
    placeholder: 'kategori (ör. Gelen Kutusu)',
    oninput: () => updatePage(p.id, (x) => { x.category = catInput.value.trim(); }, true),
    onblur: () => { updatePage(p.id, (x) => { x.category = catInput.value.trim(); }); refreshTree(root); },
  });
  wrap.append(rowFor('Kategori', catInput, '▦'));

  // Kullanıcı özellikleri
  for (const prop of p.props) {
    const control = propControl(p, prop.id, root);
    const keyInput = h('input', {
      class: 'note-props__keyinput',
      value: prop.key,
      oninput: () => updatePage(p.id, (x) => {
        const t = x.props.find((y) => y.id === prop.id);
        if (t) t.key = keyInput.value;
      }, true),
    });
    wrap.append(
      h('div', { class: 'note-props__row' },
        h('div', { class: 'note-props__key' },
          h('button', {
            class: 'note-props__type', text: prop.type, title: 'türü değiştir',
            onclick: () => {
              updatePage(p.id, (x) => {
                const t = x.props.find((y) => y.id === prop.id);
                if (t) t.type = PROP_TYPES[(PROP_TYPES.indexOf(t.type) + 1) % PROP_TYPES.length] as PropType;
              });
              renderNotes(root);
            },
          }),
          keyInput,
        ),
        control,
        h('button', {
          class: 'note-props__del', text: '×', title: 'özelliği sil',
          onclick: () => {
            updatePage(p.id, (x) => { x.props = x.props.filter((y) => y.id !== prop.id); });
            renderNotes(root);
          },
        }),
      ),
    );
  }

  wrap.append(h('button', {
    class: 'note-props__add', text: '+ özellik ekle',
    onclick: () => {
      updatePage(p.id, (x) => { x.props.push(newProp()); });
      renderNotes(root);
    },
  }));

  return wrap;
}

function propControl(p: Page, propId: string, root: HTMLElement): HTMLElement {
  const prop = p.props.find((x) => x.id === propId)!;
  const save = (v: string, quiet = true) => updatePage(p.id, (x) => {
    const t = x.props.find((y) => y.id === propId);
    if (t) t.value = v;
  }, quiet);

  if (prop.type === 'onay') {
    return h('button', {
      class: `be-check${prop.value === 'evet' ? ' is-on' : ''}`,
      text: prop.value === 'evet' ? '✓' : '',
      onclick: () => { save(prop.value === 'evet' ? '' : 'evet', false); renderNotes(root); },
    });
  }
  const input = h('input', {
    class: 'note-props__input',
    type: prop.type === 'tarih' ? 'date' : prop.type === 'sayı' ? 'number' : 'text',
    value: prop.value,
    placeholder: prop.type === 'seçim' ? 'değer (ör. Okunuyor)' : prop.type === 'url' ? 'https://…' : 'değer',
    oninput: () => save(input.value),
    onblur: () => save(input.value, false),
  });
  return input;
}

/* ---------------------------------------------------------- alt sayfalar */

function subpagesPanel(p: Page, root: HTMLElement): HTMLElement | null {
  const kids = childrenOf(p.id);
  if (p.database.on) return null; // veritabanı görünümü zaten gösteriyor
  if (!kids.length) {
    return h('div', { class: 'note-section' },
      h('button', {
        class: 'note-section__add', text: '+ alt sayfa ekle',
        onclick: () => newPage(root, p.id),
      }),
    );
  }
  const wrap = h('div', { class: 'note-section' },
    h('div', { class: 'note-section__title', text: `Alt sayfalar · ${kids.length}` }),
  );
  const listEl = h('div', { class: 'note-subpages' });
  for (const k of kids) {
    listEl.append(h('button', {
      class: 'note-subpage', onclick: () => open(k.id, root),
    },
      h('span', { class: 'note-subpage__icon', text: k.icon || '📄' }),
      h('span', { class: 'note-subpage__title ellipsis', text: pageTitle(k) }),
      h('span', { class: 'note-subpage__meta', text: shortDate(k.updatedAt.slice(0, 10)) }),
    ));
  }
  wrap.append(listEl);
  wrap.append(h('button', {
    class: 'note-section__add', text: '+ alt sayfa ekle',
    onclick: () => newPage(root, p.id),
  }));
  return wrap;
}

/* ------------------------------------------------------------- ilişkiler */

function relationsPanel(p: Page, root: HTMLElement): HTMLElement {
  const rel = relatedPages(p.id);
  const wrap = h('div', { class: 'note-section' },
    h('div', { class: 'note-section__title', text: `İlişkili sayfalar · ${rel.length}` }),
  );
  const listEl = h('div', { class: 'note-chips' });
  for (const r of rel) {
    listEl.append(h('span', { class: 'note-relchip' },
      h('button', {
        class: 'note-relchip__open', text: `${r.icon || '📄'} ${pageTitle(r)}`,
        onclick: () => open(r.id, root),
      }),
      h('button', {
        class: 'note-relchip__x', text: '×', title: 'ilişkiyi kaldır',
        onclick: () => { toggleRelation(p.id, r.id); renderNotes(root); },
      }),
    ));
  }
  listEl.append(h('button', {
    class: 'note-section__add', text: '+ ilişki kur',
    onclick: () => void relationPrompt(p, root),
  }));
  wrap.append(listEl);
  return wrap;
}

async function relationPrompt(p: Page, root: HTMLElement): Promise<void> {
  const others = db().pages.filter((x) => x.id !== p.id && !x.archived);
  if (!others.length) { toast('Bağlanacak başka sayfa yok'); return; }
  const res = await formModal({
    title: 'İlişki kur',
    meta: pageTitle(p),
    fields: [{
      kind: 'select', key: 'target', label: 'Sayfa',
      options: others.map((x) => [x.id, `${x.icon || '📄'} ${pageTitle(x)}`] as [string, string]),
    }],
    saveLabel: 'Bağla',
  });
  if (!res) return;
  toggleRelation(p.id, res.target);
  renderNotes(root);
}

async function movePrompt(p: Page, root: HTMLElement): Promise<void> {
  const blocked = new Set([p.id]);
  const options: [string, string][] = [['', '— kök seviye —']];
  for (const x of db().pages) {
    if (blocked.has(x.id) || x.archived) continue;
    if (breadcrumb(x.id).some((c) => c.id === p.id)) continue; // kendi torunu
    options.push([x.id, `${x.icon || '📄'} ${pageTitle(x)}`]);
  }
  const res = await formModal({
    title: 'Sayfayı taşı',
    meta: pageTitle(p),
    fields: [{ kind: 'select', key: 'parent', label: 'Üst sayfa', value: p.parentId, options }],
    saveLabel: 'Taşı',
  });
  if (!res) return;
  if (!movePage(p.id, res.parent)) { toast('Sayfa kendi altına taşınamaz'); return; }
  if (res.parent) ui.expanded.add(res.parent);
  renderNotes(root);
}

/* --------------------------------------------------------- geri bağlantı */

function backlinksPanel(p: Page, root: HTMLElement): HTMLElement | null {
  const links = backlinks(p.id);
  if (!links.length) return null;
  const wrap = h('div', { class: 'note-section note-section--back' },
    h('div', { class: 'note-section__title', text: `Bu sayfaya bağlantı veren notlar · ${links.length}` }),
  );
  for (const l of links) {
    wrap.append(h('button', {
      class: 'note-backlink', onclick: () => open(l.page.id, root),
    },
      h('span', { class: 'note-backlink__title', text: `${l.page.icon || '📄'} ${pageTitle(l.page)}` }),
      h('span', { class: 'note-backlink__ctx ellipsis', text: l.context }),
    ));
  }
  return wrap;
}

/* --------------------------------------------------------------- altlık */

function footer(p: Page): HTMLElement {
  const words = blocksPlain(p.blocks).trim().split(/\s+/).filter(Boolean).length;
  return h('div', { class: 'note-page__foot sub-text' },
    h('span', { text: `oluşturuldu ${fullDate(p.createdAt.slice(0, 10))}` }),
    h('span', { text: `· güncellendi ${shortDate(p.updatedAt.slice(0, 10))}` }),
    h('span', { text: `· ${words} kelime · ${p.blocks.length} blok` }),
    h('span', { class: 'push', text: "'/' blok menüsü · Ctrl+B kalın · Tab girinti" }),
  );
}

/* ------------------------------------------------------------ sayfa CRUD */

const TODO_TEMPLATE = () => [
  newBlock('h2', 'Bugün'),
  newBlock('todo'),
  newBlock('todo'),
  newBlock('h2', 'Sonra'),
  newBlock('todo'),
];

function newPage(root: HTMLElement, parentId: string, template: 'bos' | 'todo' | 'db' = 'bos'): void {
  flushTitle();
  const blocks = template === 'todo' ? TODO_TEMPLATE() : [newBlock('text')];
  const id = createPage(parentId, template === 'todo' ? 'Yapılacaklar' : template === 'db' ? 'Yeni veritabanı' : '', blocks);
  updatePage(id, (p) => {
    if (template === 'todo') { p.icon = '✅'; p.cover = 'mor'; }
    if (template === 'db') {
      p.icon = '🗄️';
      p.database.on = true;
      p.blocks = [newBlock('text', 'Her satır ayrı bir sayfadır — satıra tıklayınca açılır.')];
    }
  });
  if (parentId) ui.expanded.add(parentId);
  ui.selected = id;
  ui.filter = 'sayfalar';
  ui.query = '';
  renderNotes(root);
  (root.querySelector('.note-title-input') as HTMLInputElement | null)?.focus();
}

async function removePage(p: Page, root: HTMLElement): Promise<void> {
  const kids = childrenOf(p.id, true).length;
  const ok = await confirmDialog(`"${pageTitle(p)}" sayfası silinsin mi?`, 'Sayfayı sil', {
    detail: kids
      ? `${kids} alt sayfa da silinecek. Geri almak için bildirimdeki "GERİ AL"a bas.`
      : 'Geri almak için silme sonrası çıkan bildirimdeki "GERİ AL"a bas.',
  });
  if (!ok) return;
  const removed = deletePage(p.id);
  ui.selected = '';
  toast(`${removed.length} sayfa silindi`, () => { restorePages(removed); renderNotes(root); });
  renderNotes(root);
}

/** Palet: yeni sayfa. */
export function openNoteForm(): void {
  const root = document.querySelector('.content') as HTMLElement | null;
  if (root) newPage(root, '');
}

/** Dışa aktarma ve istatistik için: sayfa sayısı vb. */
export function pageStats(): { total: number; favorite: number; archived: number; inbox: number } {
  const pages = db().pages;
  return {
    total: pages.filter((p) => !p.archived).length,
    favorite: pages.filter((p) => p.favorite && !p.archived).length,
    archived: pages.filter((p) => p.archived).length,
    inbox: pages.filter((p) => p.category === 'Gelen Kutusu' && !p.archived).length,
  };
}

/** Sayfa güncellenince zaman damgasını tazelemek için (blok editörü kullanır). */
export function touchPage(id: string): void {
  store.updateQuiet((d) => {
    const p = d.pages.find((x) => x.id === id);
    if (p) p.updatedAt = nowISO();
  });
}
