/**
 * Veritabanı görünümleri.
 *
 * Bir sayfa "veritabanı"na çevrildiğinde ALT SAYFALARI satır olur. Veriler
 * hiç değişmez, yalnız görünüm değişir: tablo · liste · pano · galeri · takvim.
 * Her satır gerçek bir sayfadır; tıklayınca içeriği açılır.
 */

import { Page, DB_VIEWS, DbView } from '../core/model';
import { childrenOf, pageTitle, createPage, updatePage, propValue, dbColumns, newProp, excerptOf } from '../core/pages';
import { h, clear } from './dom';
import { monthGrid, dayKey, parseDay, MONTH_SHORT, shortDate } from '../core/util';

export interface DbOptions {
  onOpen: (pageId: string) => void;
  /** Yapısal değişiklik: ekran yeniden çizilsin. */
  onChange: () => void;
}

export function renderDatabase(p: Page, opts: DbOptions): HTMLElement {
  const wrap = h('div', { class: 'pdb' });
  wrap.append(toolbar(p, opts));

  const rows = childrenOf(p.id);
  const body = h('div', { class: 'pdb__body' });
  if (!rows.length) {
    body.append(h('div', { class: 'empty-state' },
      h('div', { text: 'Bu veritabanı boş.' }),
      h('div', { class: 'empty-state__hint', text: 'Her satır ayrı bir sayfadır — "+ Yeni satır" ile ekle.' }),
    ));
  } else {
    switch (p.database.view) {
      case 'liste': body.append(listView(rows, opts)); break;
      case 'pano': body.append(boardView(p, rows, opts)); break;
      case 'galeri': body.append(galleryView(rows, opts)); break;
      case 'takvim': body.append(calendarView(p, rows, opts)); break;
      default: body.append(tableView(p, rows, opts));
    }
  }
  wrap.append(body);
  return wrap;
}

function toolbar(p: Page, opts: DbOptions): HTMLElement {
  const seg = h('div', { class: 'segmented segmented--mini' });
  for (const v of DB_VIEWS) {
    seg.append(h('button', {
      class: `segmented__item${p.database.view === v ? ' is-active' : ''}`,
      text: v,
      onclick: () => { updatePage(p.id, (x) => { x.database.view = v as DbView; }); opts.onChange(); },
    }));
  }

  const cols = dbColumns(p.id);
  const groupSel = h('select', {
    class: 'pdb__select',
    title: 'panoyu/galeriyi neye göre grupla',
    onchange: (e) => {
      updatePage(p.id, (x) => { x.database.groupBy = (e.target as HTMLSelectElement).value; });
      opts.onChange();
    },
  });
  for (const [val, label] of [['', 'grup: yok'], ...cols.map((c) => [c, `grup: ${c}`] as [string, string])]) {
    const o = h('option', { value: val, text: label });
    if (val === p.database.groupBy) o.selected = true;
    groupSel.append(o);
  }

  const dateSel = h('select', {
    class: 'pdb__select',
    title: 'takvimde hangi tarih kullanılsın',
    onchange: (e) => {
      updatePage(p.id, (x) => { x.database.dateKey = (e.target as HTMLSelectElement).value; });
      opts.onChange();
    },
  });
  for (const [val, label] of [['', 'tarih: güncelleme'], ...cols.map((c) => [c, `tarih: ${c}`] as [string, string])]) {
    const o = h('option', { value: val, text: label });
    if (val === p.database.dateKey) o.selected = true;
    dateSel.append(o);
  }

  return h('div', { class: 'pdb__bar' },
    seg,
    h('div', { class: 'row push', style: { gap: '6px' } },
      p.database.view === 'takvim' ? dateSel : groupSel,
      h('button', {
        class: 'mini-btn', text: '+ SÜTUN',
        title: 'tüm satırlara yeni özellik ekle',
        onclick: () => {
          const key = `Özellik ${cols.length + 1}`;
          for (const child of childrenOf(p.id)) {
            updatePage(child.id, (c) => { const np = newProp(key); c.props.push(np); });
          }
          opts.onChange();
        },
      }),
      h('button', {
        class: 'btn btn--primary', text: '+ Yeni satır',
        onclick: () => {
          const id = createPage(p.id, '');
          // Var olan sütunları yeni satıra da ver ki tablo hizalı kalsın.
          updatePage(id, (c) => { for (const key of dbColumns(p.id)) c.props.push(newProp(key)); });
          opts.onOpen(id);
        },
      }),
    ),
  );
}

/* --------------------------------------------------------------- tablo */

function tableView(p: Page, rows: Page[], opts: DbOptions): HTMLElement {
  const cols = dbColumns(p.id);
  const table = h('table', { class: 'pdb-table' });

  const head = h('tr', {}, h('th', { text: 'Başlık' }));
  for (const c of cols) head.append(h('th', { text: c }));
  head.append(h('th', { class: 'pdb-table__thin', text: '' }));
  table.append(head);

  for (const r of rows) {
    const tr = h('tr', {});
    tr.append(h('td', { class: 'pdb-table__title' },
      h('button', {
        class: 'pdb-table__open',
        onclick: () => opts.onOpen(r.id),
      },
        h('span', { text: r.icon || '📄' }),
        h('span', { class: 'ellipsis', text: pageTitle(r) }),
      ),
    ));

    for (const c of cols) {
      const prop = r.props.find((x) => x.key === c);
      const td = h('td', {});
      const input = h('input', {
        class: 'pdb-table__cell',
        type: prop?.type === 'tarih' ? 'date' : prop?.type === 'sayı' ? 'number' : 'text',
        value: prop?.value ?? '',
        placeholder: '—',
        oninput: () => {
          updatePage(r.id, (x) => {
            const t = x.props.find((y) => y.key === c);
            if (t) t.value = input.value;
            else x.props.push({ ...newProp(c), value: input.value });
          }, true);
        },
      });
      td.append(input);
      tr.append(td);
    }

    tr.append(h('td', {},
      h('button', { class: 'pdb-table__go', text: '→', title: 'sayfayı aç', onclick: () => opts.onOpen(r.id) }),
    ));
    table.append(tr);
  }

  return h('div', { class: 'pdb-table__wrap' }, table);
}

/* --------------------------------------------------------------- liste */

function listView(rows: Page[], opts: DbOptions): HTMLElement {
  const wrap = h('div', { class: 'pdb-list' });
  for (const r of rows) {
    wrap.append(h('button', { class: 'pdb-list__row', onclick: () => opts.onOpen(r.id) },
      h('span', { class: 'pdb-list__icon', text: r.icon || '📄' }),
      h('span', { class: 'pdb-list__title ellipsis', text: pageTitle(r) }),
      h('span', { class: 'pdb-list__meta ellipsis', text: excerptOf(r) }),
      h('span', { class: 'pdb-list__date', text: shortDate(r.updatedAt.slice(0, 10)) }),
    ));
  }
  return wrap;
}

/* ---------------------------------------------------------------- pano */

function boardView(p: Page, rows: Page[], opts: DbOptions): HTMLElement {
  const key = p.database.groupBy;
  const groups = new Map<string, Page[]>();
  for (const r of rows) {
    const g = (key ? propValue(r, key) : r.category) || 'Grupsuz';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }

  const board = h('div', { class: 'pdb-board' });
  for (const [name, items] of groups) {
    const col = h('div', { class: 'pdb-col' },
      h('div', { class: 'pdb-col__head' },
        h('span', { class: 'pdb-col__name', text: name }),
        h('span', { class: 'pdb-col__count', text: String(items.length) }),
      ),
    );

    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('is-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('is-over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('is-over');
      const id = e.dataTransfer?.getData('text/plain');
      if (!id) return;
      updatePage(id, (x) => {
        if (!key) { x.category = name === 'Grupsuz' ? '' : name; return; }
        const t = x.props.find((y) => y.key === key);
        if (t) t.value = name === 'Grupsuz' ? '' : name;
        else x.props.push({ ...newProp(key), value: name === 'Grupsuz' ? '' : name });
      });
      opts.onChange();
    });

    for (const r of items) {
      const card = h('div', { class: 'pdb-card', onclick: () => opts.onOpen(r.id) },
        h('div', { class: 'pdb-card__title' },
          h('span', { text: r.icon || '📄' }),
          h('span', { class: 'ellipsis', text: pageTitle(r) }),
        ),
        excerptOf(r) ? h('div', { class: 'pdb-card__body ellipsis', text: excerptOf(r) }) : null,
        r.tags.length ? h('div', { class: 'pdb-card__tags', text: r.tags.map((t) => `#${t}`).join(' ') }) : null,
      );
      card.draggable = true;
      card.addEventListener('dragstart', (e) => e.dataTransfer?.setData('text/plain', r.id));
      col.append(card);
    }

    col.append(h('button', {
      class: 'pdb-col__add', text: '+ kart',
      onclick: () => {
        const id = createPage(p.id, '');
        updatePage(id, (x) => {
          if (!key) { x.category = name === 'Grupsuz' ? '' : name; return; }
          x.props.push({ ...newProp(key), value: name === 'Grupsuz' ? '' : name });
        });
        opts.onOpen(id);
      },
    }));
    board.append(col);
  }
  return board;
}

/* -------------------------------------------------------------- galeri */

function galleryView(rows: Page[], opts: DbOptions): HTMLElement {
  const grid = h('div', { class: 'pdb-gallery' });
  for (const r of rows) {
    const cover = r.cover
      ? h('div', { class: 'pdb-tile__cover', style: { background: coverCss(r.cover) } })
      : h('div', { class: 'pdb-tile__cover pdb-tile__cover--plain' });
    grid.append(h('button', { class: 'pdb-tile', onclick: () => opts.onOpen(r.id) },
      cover,
      h('div', { class: 'pdb-tile__icon', text: r.icon || '📄' }),
      h('div', { class: 'pdb-tile__title ellipsis', text: pageTitle(r) }),
      h('div', { class: 'pdb-tile__meta ellipsis', text: excerptOf(r) || '—' }),
    ));
  }
  return grid;
}

function coverCss(name: string): string {
  const found = ([
    ['mor', 'linear-gradient(120deg, #4c3b7a, #b39ddb)'],
    ['mavi', 'linear-gradient(120deg, #17384f, #57b6ff)'],
    ['yeşil', 'linear-gradient(120deg, #1d4a38, #6ee7a8)'],
    ['amber', 'linear-gradient(120deg, #5a4318, #efc770)'],
    ['gül', 'linear-gradient(120deg, #5a2a44, #e0a3c8)'],
    ['gece', 'linear-gradient(120deg, #0f1116, #2f3440)'],
  ] as [string, string][]).find(([n]) => n === name);
  return found ? found[1] : 'var(--surface-3)';
}

/* -------------------------------------------------------------- takvim */

function calendarView(p: Page, rows: Page[], opts: DbOptions): HTMLElement {
  const key = p.database.dateKey;
  const dateOf = (r: Page): string => {
    const raw = key ? propValue(r, key) : r.updatedAt;
    return (raw || '').slice(0, 10);
  };

  const today = new Date();
  const grid = monthGrid(today.getFullYear(), today.getMonth());
  const byDay = new Map<string, Page[]>();
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(r);
  }

  const wrap = h('div', { class: 'pdb-cal' },
    h('div', { class: 'pdb-cal__head', text: `${MONTH_SHORT[today.getMonth()]} ${today.getFullYear()}` }),
  );
  const row = h('div', { class: 'pdb-cal__grid' });
  for (const d of ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz']) {
    row.append(h('div', { class: 'pdb-cal__dow', text: d }));
  }
  for (const key2 of grid) {
    const inMonth = parseDay(key2).getMonth() === today.getMonth();
    const cell = h('div', {
      class: `pdb-cal__cell${inMonth ? '' : ' is-out'}${key2 === dayKey(today) ? ' is-today' : ''}`,
    },
      h('div', { class: 'pdb-cal__num', text: String(parseDay(key2).getDate()) }),
    );
    for (const r of byDay.get(key2) ?? []) {
      cell.append(h('button', {
        class: 'pdb-cal__item ellipsis',
        text: `${r.icon || '📄'} ${pageTitle(r)}`,
        onclick: () => opts.onOpen(r.id),
      }));
    }
    row.append(cell);
  }
  wrap.append(row);
  return wrap;
}

/** Görünüm listesini dışarıya da açalım (ayarlar/testler). */
export { DB_VIEWS };

export function clearDb(host: HTMLElement): void {
  clear(host);
}
