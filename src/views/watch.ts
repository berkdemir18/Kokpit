/** İzleme modülü — film & dizi takibi. */

import { store, db } from '../core/store';
import {
  Title, TitleKind, Status, STATUS_LABEL, DB, EpisodeRecord,
} from '../core/model';
import { h, clear } from '../ui/dom';
import { formModal, toast, Field, closeOverlay, mountOverlay, confirmDialog } from '../ui/overlay';
import { searchTmdb, hasTmdbKey, TmdbResult } from '../core/tmdb';
import { needsEnrich, enrichFromTmdb, fixWatchedStatuses } from '../core/enrich';
import { openShowDetail } from './show-detail';
import {
  uid, nowISO, dayKey, splitList, uniq, midDate, fullDate, lastDays, parseDay, MONTH_SHORT,
} from '../core/util';

const DOW_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cts', 'Paz'];

type Tab = Status;

type ViewMode = 'grid' | 'list' | 'history';

interface WatchUI {
  tab: Tab;
  mode: ViewMode;
  kind: 'all' | TitleKind;
  genres: string[];
  minRating: number;
  sort: 'added' | 'rating' | 'watched' | 'name';
  query: string;
  /** Tür/puan/sıralama filtreleri varsayılan olarak gizli (sadeleştirme). */
  filtersOpen: boolean;
  /** Geçmiş şeridinde seçili gün (boşsa hepsi). */
  historyDay: string;
}

const ui: WatchUI = {
  tab: 'active', mode: 'grid', kind: 'all', genres: [], minRating: 0, sort: 'added', query: '',
  filtersOpen: false, historyDay: '',
};

/* ------------------------------------------------------- kalınan bölüm */

export interface Progress {
  /** "S2 · B5" — sıradaki izlenecek bölüm. */
  next: string;
  /** İzlenen/toplam bölüm (TMDB'den bölüm listesi varsa). */
  watched: number;
  total: number;
  pct: number;
}

/**
 * Dizide nerede kaldığını hesaplar.
 * TMDB'den bölüm listesi varsa ilk izlenmemiş bölüm; yoksa elle tutulan
 * sezon/bölüm sayacının bir sonrası.
 */
export function seriesProgress(t: Title): Progress | null {
  if (t.kind !== 'dizi') return null;

  if (t.episodes.length) {
    const sorted = [...t.episodes].sort((a, b) => a.season - b.season || a.number - b.number);
    const watched = sorted.filter((e) => e.watched).length;
    const nextEp = sorted.find((e) => !e.watched);
    return {
      next: nextEp ? `S${nextEp.season} · B${nextEp.number}` : 'bitti',
      watched,
      total: sorted.length,
      pct: sorted.length ? Math.round((watched / sorted.length) * 100) : 0,
    };
  }

  const season = t.season || 1;
  return {
    next: `S${season} · B${t.episode + 1}`,
    watched: t.episode,
    total: 0,
    pct: 0,
  };
}

const RATING_COLOR = (r: number): string =>
  r >= 9 ? 'var(--success)' : r >= 7 ? 'var(--warn)' : 'var(--dim)';

const STATUS_COLOR: Record<Status, string> = {
  done: 'var(--success)',
  active: 'var(--accent)',
  planned: 'var(--dim)',
  dropped: 'var(--danger)',
};

export function renderWatch(root: HTMLElement): void {
  clear(root);
  const d = db();

  const wrap = h('div', { class: 'stack-md' });
  wrap.append(kindMenu(root));
  const repair = repairBar(root);
  if (repair) wrap.append(repair);
  wrap.append(toolbar(root));
  if (d.settings.showStatStrip) wrap.append(statStrip());
  wrap.append(h('div', { class: 'watch-list' }, currentView()));
  root.append(wrap);
}

/* ------------------------------------------------- büyük Film / Dizi menüsü */

/** İzleme ekranının en üstündeki ana ayrım: Tümü · Filmler · Diziler. */
function kindMenu(root: HTMLElement): HTMLElement {
  const all = db().titles;
  const defs: ['all' | TitleKind, string, string, number][] = [
    ['all', 'Tümü', '◈', all.length],
    ['film', 'Filmler', '▣', all.filter((t) => t.kind === 'film').length],
    ['dizi', 'Diziler', '▤', all.filter((t) => t.kind === 'dizi').length],
  ];

  const menu = h('div', { class: 'kind-menu' });
  for (const [id, label, icon, count] of defs) {
    const items = id === 'all' ? all : all.filter((t) => t.kind === id);
    const watching = items.filter((t) => t.status === 'active').length;
    const rated = items.filter((t) => t.rating);
    const avg = rated.length ? (rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length).toFixed(1) : '—';
    menu.append(
      h('button', {
        class: `kind-card${ui.kind === id ? ' is-active' : ''}`,
        onclick: () => { ui.kind = id; renderWatch(root); },
      },
        h('div', { class: 'kind-card__icon', text: icon }),
        h('div', { class: 'kind-card__main' },
          h('div', { class: 'kind-card__label', text: label }),
          h('div', { class: 'kind-card__meta', text: `${watching} izleniyor · ort. ${avg}` }),
        ),
        h('div', { class: 'kind-card__count', text: String(count) }),
      ),
    );
  }
  return menu;
}

/* ------------------------------------------------------- onarım çubuğu */

/**
 * Trakt'tan gelen kayıtlarda poster/tür yok ve bitmiş diziler "izleniyor"da
 * kalıyor. Eksik varsa bu şerit görünür; TMDB ile tek tuşta tamamlanır.
 */
function repairBar(root: HTMLElement): HTMLElement | null {
  const missing = needsEnrich().length;
  if (!missing) return null;

  const status = h('div', { class: 'repair__status', text: `${missing} kayıtta poster/tür eksik` });
  let busy = false;

  const run = async (withEpisodes: boolean) => {
    if (busy) return;
    if (!hasTmdbKey()) { toast('Önce Ayarlar → TMDB API key gir'); return; }
    busy = true;
    try {
      const sum = await enrichFromTmdb((p) => {
        status.textContent = `${p.done}/${p.total} · ${p.current}`;
      }, { withEpisodes });
      toast(`${sum.posters} poster · ${sum.statusFixed} durum düzeltildi${sum.failed ? ` · ${sum.failed} hata` : ''}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
      renderWatch(root);
    }
  };

  return h('div', { class: 'repair' },
    h('span', { class: 'repair__icon', text: '⟳' }),
    status,
    h('button', {
      class: 'mini-btn push', text: 'DURUMLARI DÜZELT',
      title: 'internetsiz: bölümlerin hepsi izlenmişse "İzlendi" yapar',
      onclick: () => { const n = fixWatchedStatuses(); toast(`${n} kaydın durumu düzeltildi`); renderWatch(root); },
    }),
    h('button', { class: 'btn', text: 'Posterleri çek', onclick: () => void run(false) }),
    h('button', { class: 'btn btn--primary', text: 'Poster + bölüm listesi', onclick: () => void run(true) }),
  );
}

/** Seçili ana ayrıma (Tümü / Filmler / Diziler) düşen kayıtlar. */
function inKind(): Title[] {
  const all = db().titles;
  return ui.kind === 'all' ? all : all.filter((t) => t.kind === ui.kind);
}

/**
 * Sekme sayaçları SEÇİLİ TÜRE göre hesaplanır. Eskiden hep tüm kütüphaneyi
 * sayıyordu: "Filmler"e geçince de "İzleniyor 19" yazıyor, listede 3 kayıt
 * görünüyordu (2026-08-05'te Berk bildirdi).
 */
function counts(): Record<Tab, number> {
  const t = inKind();
  return {
    active: t.filter((x) => x.status === 'active').length,
    planned: t.filter((x) => x.status === 'planned').length,
    done: t.filter((x) => x.status === 'done').length,
    dropped: t.filter((x) => x.status === 'dropped').length,
  };
}

function allGenres(): string[] {
  return uniq(inKind().flatMap((t) => t.genres)).sort((a, b) => a.localeCompare(b, 'tr'));
}

function filtered(): Title[] {
  const q = ui.query.trim().toLowerCase();
  // Arama yapılıyorsa sekme filtresini yok say — aradığın şey başka sekmedeyse
  // "sonuç yok" görmeyesin diye.
  let list = q ? [...db().titles] : db().titles.filter((t) => t.status === ui.tab);
  if (q) {
    list = list.filter((t) =>
      (t.name + ' ' + t.genres.join(' ') + ' ' + t.withWho.join(' ')).toLowerCase().includes(q));
  }
  if (ui.kind !== 'all') list = list.filter((t) => t.kind === ui.kind);
  if (ui.genres.length) list = list.filter((t) => ui.genres.some((g) => t.genres.includes(g)));
  if (ui.minRating) list = list.filter((t) => (t.rating ?? 0) >= ui.minRating);
  const by = {
    added: (a: Title, b: Title) => b.createdAt.localeCompare(a.createdAt),
    rating: (a: Title, b: Title) => (b.rating ?? 0) - (a.rating ?? 0),
    watched: (a: Title, b: Title) => (b.watchedAt || '').localeCompare(a.watchedAt || ''),
    name: (a: Title, b: Title) => a.name.localeCompare(b.name, 'tr'),
  }[ui.sort];
  return [...list].sort(by);
}

function toolbar(root: HTMLElement): HTMLElement {
  const c = counts();
  const tabs: [Tab, string][] = [
    ['active', STATUS_LABEL.active],
    ['planned', STATUS_LABEL.planned],
    ['done', STATUS_LABEL.done],
    ['dropped', STATUS_LABEL.dropped],
  ];
  const seg = h('div', { class: 'segmented' });
  for (const [id, label] of tabs) {
    seg.append(
      h('button', {
        class: `segmented__item${ui.tab === id ? ' is-active' : ''}`,
        onclick: () => { ui.tab = id; renderWatch(root); },
      },
        label,
        h('span', { class: 'segmented__count', text: String(c[id]) }),
      ),
    );
  }

  const genreRow = h('div', { class: 'row', style: { gap: '5px', flexWrap: 'wrap' } });
  for (const g of allGenres().slice(0, 14)) {
    const on = ui.genres.includes(g);
    genreRow.append(h('button', {
      class: `chip${on ? ' is-on' : ''}`, text: g,
      onclick: () => {
        ui.genres = on ? ui.genres.filter((x) => x !== g) : [...ui.genres, g];
        renderWatch(root);
      },
    }));
  }

  const ratingChip = h('button', {
    class: `chip${ui.minRating ? ' is-on' : ''}`,
    onclick: () => { ui.minRating = ui.minRating >= 9 ? 0 : ui.minRating + 1 === 1 ? 6 : ui.minRating + 1; renderWatch(root); },
  }, ui.minRating ? `Puan ≥ ${ui.minRating}` : 'Puan', h('span', { class: 'mono', style: { fontSize: '9px' }, text: '▾' }));

  const sortLabels = { added: 'eklenme', rating: 'puan', watched: 'izleme', name: 'ad (A-Z)' };
  const sortChip = h('button', {
    class: 'chip',
    onclick: () => {
      const order: WatchUI['sort'][] = ['added', 'rating', 'watched', 'name'];
      ui.sort = order[(order.indexOf(ui.sort) + 1) % order.length];
      renderWatch(root);
    },
  }, `Sıra: ${sortLabels[ui.sort]}`, h('span', { class: 'mono', style: { fontSize: '9px' }, text: '▾' }));

  const clearFiltersBtn = (ui.genres.length || ui.minRating)
    ? h('button', {
        class: 'chip', text: 'filtreleri temizle',
        onclick: () => { ui.genres = []; ui.minRating = 0; renderWatch(root); },
      })
    : null;

  // Izgara / Liste / Geçmiş (Trakt'taki gibi gün gün akış)
  const viewToggle = h('div', { class: 'segmented segmented--mini' });
  for (const [id, label] of [['grid', 'Izgara'], ['list', 'Liste'], ['history', 'Geçmiş']] as [ViewMode, string][]) {
    viewToggle.append(h('button', {
      class: `segmented__item${ui.mode === id ? ' is-active' : ''}`,
      text: label,
      onclick: () => { ui.mode = id; renderWatch(root); },
    }));
  }

  const searchInput = h('input', {
    class: 'watch-search',
    placeholder: 'listede ara…',
    value: ui.query,
    oninput: (e) => {
      ui.query = (e.target as HTMLInputElement).value;
      const listHost = root.querySelector('.watch-list') as HTMLElement | null;
      if (listHost) {
        listHost.replaceChildren(currentView());
      }
    },
  });

  const activeFilters = ui.genres.length + (ui.minRating ? 1 : 0);
  const filterToggle = h('button', {
    class: `chip${ui.filtersOpen || activeFilters ? ' is-on' : ''}`,
    onclick: () => { ui.filtersOpen = !ui.filtersOpen; renderWatch(root); },
  }, 'Filtre', activeFilters ? h('span', { class: 'chip__badge', text: String(activeFilters) }) : null);

  // Sadeleştirme: tür/puan/sıralama satırı varsayılan olarak kapalı durur.
  const filterPanel = ui.filtersOpen
    ? h('div', { class: 'watch-filters' },
        h('div', { class: 'row', style: { gap: '5px', flexWrap: 'wrap', alignItems: 'center' } },
          ratingChip, sortChip, clearFiltersBtn),
        genreRow.children.length ? genreRow : null,
      )
    : null;

  return h('div', { class: 'stack-sm' },
    tmdbAddBar(root),
    h('div', { class: 'toolbar' },
      seg,
      h('div', { class: 'row push', style: { gap: '8px' } },
        filterToggle,
        h('div', { class: 'watch-search-box' }, h('span', { class: 'sub-text', text: '⌕' }), searchInput),
        viewToggle),
    ),
    filterPanel,
  );
}

/** İstatistik şeridi de seçili türü izler (Filmler'deyken yalnız filmler). */
function statStrip(): HTMLElement {
  const d = db();
  const scope = inKind();
  const scopeLabel = ui.kind === 'film' ? ' · filmler' : ui.kind === 'dizi' ? ' · diziler' : '';
  const done = scope.filter((t) => t.status === 'done');
  const rated = scope.filter((t) => t.rating);
  const now = new Date();
  const thisMonth = done.filter((t) => {
    if (!t.watchedAt) return false;
    const dt = new Date(t.watchedAt);
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  }).length;
  const avg = rated.length ? (rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length).toFixed(1) : '—';

  const genreCount = new Map<string, number>();
  for (const t of scope) for (const g of t.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const topGenre = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0];

  const yearDone = done.filter((t) => t.watchedAt && new Date(t.watchedAt).getFullYear() === now.getFullYear()).length;
  const watching = scope.filter((t) => t.status === 'active').length;

  // Sadeleştirme: beş hücre yerine dört, hepsi tek bakışta okunur.
  const cells: [string, string, string][] = [
    ['Bu ay izlenen', String(thisMonth), `tamamlanan${scopeLabel}`],
    ['Şu an izlenen', String(watching), `devam eden${scopeLabel}`],
    ['Ortalama puan', String(avg), `${rated.length} puanlı kayıt`],
    ['Yıl toplamı', String(yearDone), ui.kind === 'all'
      ? `hedef ${d.settings.yearlyWatchTarget} · en çok ${topGenre ? topGenre[0] : '—'}`
      : `en çok ${topGenre ? topGenre[0] : '—'}`],
  ];

  const strip = h('div', { class: 'stat-strip' });
  for (const [label, value, note] of cells) {
    strip.append(
      h('div', { class: 'stat-strip__cell' },
        h('div', { class: 'stat-strip__label', text: label }),
        h('div', { class: 'stat-strip__value', text: value }),
        h('div', { class: 'stat-strip__note', text: note }),
      ),
    );
  }
  return strip;
}

function currentView(): HTMLElement {
  if (ui.mode === 'list') return listView();
  if (ui.mode === 'history') return historyView();
  return gridView();
}

/* ------------------------------------------------- Geçmiş (Trakt akışı) */

interface HistoryItem {
  title: Title;
  day: string;
  /** Dizide izlenen bölüm; filmde yok. */
  ep?: EpisodeRecord;
}

/**
 * Trakt'ın "Geçmiş" ekranı gibi: en yeniden eskiye, gün gün gruplanmış akış.
 * Dizilerde her izlenen BÖLÜM ayrı satırdır, filmlerde kaydın kendisi.
 */
function historyItems(): HistoryItem[] {
  const out: HistoryItem[] = [];
  const q = ui.query.trim().toLowerCase();

  for (const t of db().titles) {
    if (ui.kind !== 'all' && t.kind !== ui.kind) continue;
    if (q && !t.name.toLowerCase().includes(q)) continue;
    if (ui.genres.length && !ui.genres.some((g) => t.genres.includes(g))) continue;
    if (ui.minRating && (t.rating ?? 0) < ui.minRating) continue;

    if (t.kind === 'dizi' && t.episodes.length) {
      for (const e of t.episodes) {
        if (e.watched && e.watchedAt) out.push({ title: t, day: e.watchedAt, ep: e });
      }
    } else if (t.watchedAt) {
      out.push({ title: t, day: t.watchedAt });
    }
  }

  return out.sort((a, b) => b.day.localeCompare(a.day));
}

function historyView(): HTMLElement {
  const items = historyItems();
  if (!items.length) {
    return h('div', { class: 'card' },
      h('div', { class: 'empty-state' },
        h('div', { text: 'Geçmişte kayıt yok.' }),
        h('div', { class: 'empty-state__hint', text: 'Trakt içe aktarımı ya da bölüm işaretlemesi yapınca burası dolar.' }),
      ));
  }

  // Gün şeridi: son 7 günün yoğunluğu (Trakt'taki üst şerit gibi).
  const perDay = new Map<string, number>();
  for (const it of items) perDay.set(it.day, (perDay.get(it.day) ?? 0) + 1);

  const strip = h('div', { class: 'hist-strip' });
  for (const dk of lastDays(7)) {
    const d = parseDay(dk);
    const n = perDay.get(dk) ?? 0;
    const dots = h('div', { class: 'hist-strip__dots' });
    for (let i = 0; i < Math.min(n, 4); i++) dots.append(h('span', { class: 'hist-dot' }));
    // Şerit tıklanabilir: bir güne basınca akış o güne süzülür, tekrar
    // basınca filtre kalkar. (Önce <div>'di, hiçbir şey yapmıyordu.)
    strip.append(
      h('button', {
        class: `hist-strip__day${dk === dayKey() ? ' is-today' : ''}${n ? '' : ' is-empty'}`
          + `${ui.historyDay === dk ? ' is-picked' : ''}`,
        title: n ? `${n} kayıt` : 'kayıt yok',
        onclick: () => {
          ui.historyDay = ui.historyDay === dk ? '' : dk;
          renderWatch(document.querySelector('.content') as HTMLElement);
        },
      },
        h('div', { class: 'hist-strip__mon', text: MONTH_SHORT[d.getMonth()] }),
        h('div', { class: 'hist-strip__num', text: String(d.getDate()) }),
        h('div', { class: 'hist-strip__dow', text: DOW_SHORT[(d.getDay() + 6) % 7] }),
        dots,
      ),
    );
  }

  const wrap = h('div', { class: 'stack-md' }, h('div', { class: 'hist-strip-wrap' }, strip));

  const shown = ui.historyDay ? items.filter((it) => it.day === ui.historyDay) : items;
  if (ui.historyDay) {
    wrap.append(
      h('div', { class: 'hist-filter' },
        h('span', { text: `${fullDate(ui.historyDay)} · ${shown.length} kayıt` }),
        h('button', {
          class: 'mini-btn push', text: 'FİLTREYİ KALDIR',
          onclick: () => { ui.historyDay = ''; renderWatch(document.querySelector('.content') as HTMLElement); },
        }),
      ),
    );
  }
  if (!shown.length) {
    wrap.append(h('div', { class: 'card' }, h('div', { class: 'empty-state', text: 'Bu günde kayıt yok.' })));
    return wrap;
  }

  // Gün gün gruplar — çok uzamasın diye ilk 200 satır.
  let lastDay = '';
  let group: HTMLElement | null = null;
  for (const it of shown.slice(0, 200)) {
    if (it.day !== lastDay) {
      lastDay = it.day;
      wrap.append(h('div', { class: 'hist-daytitle', text: fullDate(it.day) }));
      group = h('div', { class: 'hist-grid' });
      wrap.append(group);
    }
    group?.append(historyCard(it));
  }

  if (shown.length > 200) {
    wrap.append(h('div', { class: 'sub-text', style: { textAlign: 'center', padding: '12px' }, text: `+${shown.length - 200} kayıt daha` }));
  }
  return wrap;
}

function historyCard(it: HistoryItem): HTMLElement {
  const t = it.title;
  const poster = h('div', { class: 'hist-card__poster' });
  if (t.posterUrl) poster.append(h('img', { class: 'poster__img', src: t.posterUrl, alt: t.name }));
  else poster.append(h('div', { class: 'poster__empty', text: t.name.slice(0, 18) }));

  const heading = it.ep
    ? `S${it.ep.season} • B${it.ep.number} — ${it.ep.name || 'Bölüm'}`
    : t.name;

  const rating = it.ep?.rating ?? (it.ep ? null : t.rating);

  return h('button', {
    class: 'hist-card',
    onclick: () => openTitle(t, document.querySelector('.content') as HTMLElement),
  },
    poster,
    h('div', { class: 'hist-card__body' },
      h('div', { class: 'hist-card__title', text: heading }),
      it.ep ? h('div', { class: 'hist-card__show ellipsis', text: t.name }) : null,
      h('div', { class: 'hist-card__date', text: fullDate(it.day) }),
      h('div', { class: 'hist-card__foot' },
        h('span', { class: 'hist-card__kind', text: t.kind === 'film' ? 'FİLM' : 'DİZİ' }),
        rating
          ? h('span', { class: 'hist-card__star', style: { color: RATING_COLOR(rating) }, text: `★ ${rating}` })
          : null,
      ),
    ),
  );
}

function gridView(): HTMLElement {
  const list = filtered();
  if (!list.length) return h('div', { class: 'card' }, emptyMsg());
  const grid = h('div', { class: 'poster-grid' });
  for (const t of list) grid.append(posterCard(t));
  return grid;
}

function posterCard(t: Title): HTMLElement {
  const poster = h('div', { class: 'poster' });
  if (t.posterUrl) {
    poster.append(h('img', { class: 'poster__img', src: t.posterUrl, alt: t.name }));
  } else {
    poster.append(h('div', { class: 'poster__empty', text: 'POSTER' }));
  }
  poster.append(h('div', { class: 'poster__kind', text: t.kind === 'film' ? 'FİLM' : 'DİZİ' }));

  // Puan her zaman görünür — kaydı açmaya gerek yok.
  if (t.rating) {
    poster.append(h('div', {
      class: 'poster__rating',
      style: { background: RATING_COLOR(t.rating) },
    }, h('span', { class: 'poster__star', text: '★' }), String(t.rating)));
  } else if (t.status === 'done') {
    poster.append(h('div', { class: 'poster__rating poster__rating--none', text: 'puansız' }));
  }

  // Dizilerde nerede kaldığın da kartta yazar.
  const prog = seriesProgress(t);
  if (prog && t.status !== 'planned') {
    const foot = h('div', { class: 'poster__foot' },
      h('div', { class: 'poster__ep', text: prog.next }),
    );
    if (t.status === 'active') {
      foot.append(h('button', {
        class: 'poster__bump', text: '+1', title: 'sıradaki bölümü işaretle',
        onclick: (e) => { e.stopPropagation(); bumpEpisode(t.id); },
      }));
    }
    poster.append(foot);
    if (prog.total) {
      poster.append(h('div', { class: 'poster__prog' },
        h('div', { class: 'poster__prog__fill', style: { width: `${prog.pct}%` } })));
    }
  }

  const meta = ui.query.trim()
    ? `${STATUS_LABEL[t.status]}${t.year ? ' · ' + t.year : ''}`
    : `${t.year || '—'} · ${t.genres.slice(0, 2).join(', ') || 'etiketsiz'}`;
  // Yalnız yapım yılı değil, gerçekten ne zaman izlediğin de kartta yazsın.
  const watchedLine = t.watchedAt ? `izlendi ${midDate(t.watchedAt)}` : '';

  const sub = h('div', {
    class: 'poster-card__meta',
    style: ui.query.trim() ? { color: STATUS_COLOR[t.status] } : {},
    text: meta,
  });

  return h('button', { class: 'poster-card', onclick: () => openTitle(t, document.querySelector('.content') as HTMLElement) },
    poster,
    h('div', { class: 'poster-card__name', text: t.name }),
    sub,
    prog && prog.total
      ? h('div', { class: 'poster-card__prog', text: `${prog.watched}/${prog.total} bölüm` })
      : null,
    watchedLine ? h('div', { class: 'poster-card__watched', text: watchedLine }) : null,
  );
}

function listView(): HTMLElement {
  const list = filtered();
  // Sadeleştirildi: "etiketler" ve "kiminle" çıktı, "kaldığın bölüm" geldi.
  const cols = '56px 1fr 130px 90px 70px 108px';
  const card = h('div', { class: 'card' });
  card.append(
    h('div', { class: 'table__head', style: { gridTemplateColumns: cols } },
      h('div', { text: 'Tür' }), h('div', { text: 'Ad' }), h('div', { text: 'Kaldığın yer' }),
      h('div', { text: 'Tarih' }), h('div', { text: 'Puan' }), h('div', { text: 'Durum' }),
    ),
  );
  if (!list.length) { card.append(emptyMsg()); return card; }
  for (const t of list) {
    const prog = seriesProgress(t);
    card.append(
      h('button', {
        class: 'table__row', style: { gridTemplateColumns: cols },
        onclick: () => openTitle(t, document.querySelector('.content') as HTMLElement),
      },
        h('div', { class: 'sub-text', text: t.kind === 'film' ? 'FİLM' : 'DİZİ' }),
        h('div', { class: 'ellipsis' }, h('span', { style: { fontWeight: '500' }, text: t.name }), ' ',
          h('span', { style: { color: 'var(--dim-3)' }, text: t.year ? String(t.year) : '' })),
        prog
          ? h('div', { class: 'row', style: { gap: '7px' } },
              h('span', { class: 'ep-chip', text: prog.next }),
              prog.total ? h('span', { class: 'sub-text', text: `${prog.watched}/${prog.total}` }) : null)
          : h('div', { class: 'sub-text', text: '—' }),
        h('div', { class: 'sub-text', text: midDate(t.watchedAt) }),
        h('div', { class: 'rating-cell', style: { color: t.rating ? RATING_COLOR(t.rating) : 'var(--dim-4)' }, text: t.rating ? `★ ${t.rating}` : '—' }),
        h('div', {}, h('span', { class: 'pill', style: { color: STATUS_COLOR[t.status], borderColor: 'currentColor' }, text: STATUS_LABEL[t.status] })),
      ),
    );
  }
  return card;
}

function emptyMsg(): HTMLElement {
  return h('div', { class: 'empty-state' },
    h('div', { text: 'Bu sekmede kayıt yok.' }),
    h('div', { class: 'empty-state__hint', text: 'Sağ üstten "Yeni kayıt" ile ekle (kısayol: N).' }),
  );
}

/* ------------------------------------------------------- hızlı detay paneli */

/** TMDB'ye bağlı diziler için Trakt tarzı bölüm ekranını, diğerleri için hızlı paneli açar. */
function openTitle(t: Title, root: HTMLElement): void {
  if (t.kind === 'dizi' && t.tmdbId) {
    void openShowDetail(t, () => renderWatch(root));
    return;
  }
  openDetail(t, root);
}

/**
 * Kayda tıklayınca açılan panel: 12 alanlı formu doldurmadan
 * puan ver / durum değiştir / bölüm artır yapabilirsin.
 */
function openDetail(t: Title, root: HTMLElement): void {
  const rerender = () => { closeOverlay(); openDetail(currentTitle(t.id) ?? t, root); renderWatch(root); };

  const cur = currentTitle(t.id);
  if (!cur) return;

  // 1–10 puan şeridi
  const ratingRow = h('div', { class: 'detail-ratings' });
  for (let i = 1; i <= 10; i++) {
    ratingRow.append(
      h('button', {
        class: `rating-dot${cur.rating === i ? ' is-on' : ''}`,
        text: String(i),
        style: cur.rating === i ? { background: RATING_COLOR(i), color: 'var(--bg)' } : {},
        onclick: () => {
          store.update((d) => {
            const x = d.titles.find((y) => y.id === cur.id);
            if (x) { x.rating = x.rating === i ? null : i; x.updatedAt = nowISO(); }
          });
          rerender();
        },
      }),
    );
  }

  // durum düğmeleri
  const statusRow = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
  for (const s of ['planned', 'active', 'done', 'dropped'] as Status[]) {
    statusRow.append(
      h('button', {
        class: `chip${cur.status === s ? ' is-on' : ''}`,
        style: cur.status === s ? { color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] } : {},
        text: STATUS_LABEL[s],
        onclick: () => {
          store.update((d) => {
            const x = d.titles.find((y) => y.id === cur.id);
            if (!x) return;
            x.status = s;
            if (s === 'done' && !x.watchedAt) x.watchedAt = dayKey();
            x.updatedAt = nowISO();
          });
          ui.tab = s;
          rerender();
        },
      }),
    );
  }

  // dizi bölüm sayacı
  const epRow = cur.kind === 'dizi'
    ? h('div', { class: 'row', style: { gap: '10px', marginTop: '4px' } },
        h('div', { class: 'field__label', text: 'Sezon / Bölüm' }),
        h('div', { class: 'row push', style: { gap: '6px' } },
          h('button', { class: 'mini-btn', text: '− SEZON', onclick: () => { stepSeries(cur.id, -1, 0); rerender(); } }),
          h('div', { class: 'ep-badge', text: `S${cur.season || 1} · B${cur.episode}` }),
          h('button', { class: 'mini-btn', text: '+ SEZON', onclick: () => { stepSeries(cur.id, 1, 0); rerender(); } }),
          h('button', { class: 'mini-btn', text: '− BÖLÜM', onclick: () => { stepSeries(cur.id, 0, -1); rerender(); } }),
          h('button', { class: 'btn btn--primary', text: '+1 BÖLÜM', onclick: () => { stepSeries(cur.id, 0, 1); rerender(); } }),
        ),
      )
    : null;

  const poster = h('div', { class: 'detail-poster' });
  if (cur.posterUrl) poster.append(h('img', { class: 'poster__img', src: cur.posterUrl, alt: cur.name }));
  else poster.append(h('div', { class: 'poster__empty', text: 'POSTER' }));

  const modal = h('div', { class: 'modal modal--wide' },
    h('div', { class: 'modal__head' },
      h('div', { class: 'modal__title', text: cur.name }),
      h('div', { class: 'modal__meta', text: `${cur.kind === 'film' ? 'Film' : 'Dizi'}${cur.year ? ' · ' + cur.year : ''}` }),
    ),
    h('div', { class: 'detail-body' },
      poster,
      h('div', { class: 'detail-main' },
        h('div', { class: 'field__label', text: 'Puan' }),
        ratingRow,
        h('div', { class: 'field__label', style: { marginTop: '14px' }, text: 'Durum' }),
        statusRow,
        epRow,
        cur.genres.length
          ? h('div', { class: 'row', style: { gap: '6px', marginTop: '14px', flexWrap: 'wrap' } },
              ...cur.genres.map((g) => h('span', { class: 'tag', text: g })))
          : null,
        cur.withWho.length
          ? h('div', { class: 'sub-text', style: { marginTop: '10px' }, text: `birlikte: ${cur.withWho.join(', ')}` })
          : null,
        cur.watchedAt
          ? h('div', { class: 'sub-text', text: `izlendi: ${fullDate(cur.watchedAt)}` })
          : null,
        h('div', { class: 'field__label', style: { marginTop: '14px' }, text: 'Yorum' }),
        (() => {
          const ta = h('textarea', {
            class: 'field__area', rows: 3, value: cur.review,
            placeholder: 'kısa yorumun…',
            onblur: () => {
              store.update((d) => {
                const x = d.titles.find((y) => y.id === cur.id);
                if (x && x.review !== ta.value) { x.review = ta.value; x.updatedAt = nowISO(); }
              });
              renderWatch(root);
            },
          });
          return ta;
        })(),
      ),
    ),
    h('div', { class: 'modal__foot' },
      h('button', { class: 'btn', text: 'Tüm alanları düzenle', onclick: () => { closeOverlay(); void openForm(root, cur); } }),
      h('button', { class: 'btn push', style: { color: 'var(--danger)' }, text: 'Sil', onclick: () => { closeOverlay(); void remove(cur, root); } }),
      h('button', { class: 'btn btn--primary', text: 'Kapat', onclick: () => { closeOverlay(); renderWatch(root); } }),
    ),
  );

  const overlay = h('div', {
    class: 'overlay overlay--center',
    onclick: (e) => { if (e.target === overlay) { closeOverlay(); renderWatch(root); } },
  }, modal);
  mountOverlay(overlay);
}

function currentTitle(id: string): Title | undefined {
  return db().titles.find((x) => x.id === id);
}

function stepSeries(id: string, dSeason: number, dEpisode: number): void {
  store.update((d) => {
    const x = d.titles.find((y) => y.id === id);
    if (!x) return;
    if (dSeason) x.season = Math.max(1, (x.season || 1) + dSeason);
    if (dEpisode) x.episode = Math.max(0, x.episode + dEpisode);
    x.updatedAt = nowISO();
  });
}

/* ------------------------------------------------------------------ eylem */

/** Sıradaki bölümü izlendi işaretler (TMDB bölüm listesi varsa onu kullanır). */
function bumpEpisode(id: string): void {
  let label = '';
  let name = '';
  store.update((d) => {
    const t = d.titles.find((x) => x.id === id);
    if (!t) return;
    name = t.name;
    if (t.episodes.length) {
      const sorted = [...t.episodes].sort((a, b) => a.season - b.season || a.number - b.number);
      const next = sorted.find((e) => !e.watched);
      if (!next) { label = 'hepsi izlendi'; return; }
      next.watched = true;
      next.watchedAt = dayKey();
      t.season = next.season;
      t.episode = next.number;
      label = `S${next.season} · B${next.number}`;
    } else {
      t.episode += 1;
      label = `S${t.season || 1} · B${t.episode}`;
    }
    t.updatedAt = nowISO();
  });
  toast(`${name} → ${label} işaretlendi`);
  renderWatch(document.querySelector('.content') as HTMLElement);
}

async function openForm(root: HTMLElement, existing?: Title): Promise<void> {
  const t = existing;
  const fields: Field[] = [
    { kind: 'text', key: 'name', label: 'Ad', value: t?.name ?? '', span: 2 },
    { kind: 'select', key: 'kind', label: 'Tür', value: t?.kind ?? 'film',
      options: [['film', 'Film'], ['dizi', 'Dizi']] },
    { kind: 'number', key: 'year', label: 'Yıl', value: t?.year ? String(t.year) : '', min: '1900', max: '2100' },
    { kind: 'select', key: 'status', label: 'Durum', value: t?.status ?? 'planned',
      options: (['planned', 'active', 'done', 'dropped'] as Status[]).map((s) => [s, STATUS_LABEL[s]]) },
    { kind: 'number', key: 'rating', label: 'Puan / 10', value: t?.rating ? String(t.rating) : '', min: '1', max: '10' },
    { kind: 'text', key: 'genres', label: 'Etiketler (virgülle)', value: t?.genres.join(', ') ?? '' },
    { kind: 'text', key: 'withWho', label: 'Kiminle (virgülle)', value: t?.withWho.join(', ') ?? '' },
    { kind: 'date', key: 'watchedAt', label: 'İzlenme tarihi', value: t?.watchedAt ?? '' },
    { kind: 'text', key: 'posterUrl', label: 'Poster URL (opsiyonel)', value: t?.posterUrl ?? '', span: 2 },
    { kind: 'number', key: 'season', label: 'Sezon (dizi)', value: t ? String(t.season) : '1' },
    { kind: 'number', key: 'episode', label: 'Bölüm (dizi)', value: t ? String(t.episode) : '0' },
    { kind: 'textarea', key: 'review', label: 'Yorum', value: t?.review ?? '', span: 2, rows: 3 },
  ];

  const res = await formModal({
    title: existing ? 'Kaydı düzenle · Film & Dizi' : 'Yeni kayıt · Film & Dizi',
    meta: hasTmdbKey() ? 'TMDB\'de arayıp otomatik ekleyebilirsin' : 'elle giriş',
    fields,
    saveLabel: existing ? 'Güncelle' : 'Kaydet',
    wide: true,
    onDelete: existing ? () => void remove(existing, root) : undefined,
  });
  if (!res) return;
  if (!res.name.trim()) { toast('Ad boş olamaz'); return; }

  const now = nowISO();
  const rating = res.rating ? Math.max(1, Math.min(10, Number(res.rating))) : null;
  const patch: Omit<Title, 'id' | 'createdAt'> = {
    kind: (res.kind as TitleKind) || 'film',
    name: res.name.trim(),
    year: res.year ? Number(res.year) : null,
    genres: splitList(res.genres),
    status: (res.status as Status) || 'planned',
    rating,
    posterUrl: res.posterUrl.trim(),
    imdb: t?.imdb ?? '',
    watchedAt: res.watchedAt || (res.status === 'done' && !existing ? dayKey() : t?.watchedAt ?? ''),
    withWho: splitList(res.withWho),
    review: res.review,
    season: Number(res.season) || 0,
    episode: Number(res.episode) || 0,
    tags: t?.tags ?? [],
    updatedAt: now,
    tmdbId: t?.tmdbId ?? null,
    episodes: t?.episodes ?? [],
    episodesFetchedAt: t?.episodesFetchedAt ?? '',
  };

  store.update((d: DB) => {
    if (existing) {
      const idx = d.titles.findIndex((x) => x.id === existing.id);
      if (idx >= 0) d.titles[idx] = { ...d.titles[idx], ...patch };
    } else {
      d.titles.unshift({ id: uid('t'), createdAt: now, ...patch });
    }
  });
  toast(existing ? `${patch.name} güncellendi` : `${patch.name} kaydedildi`);
  if (patch.status !== ui.tab && !existing) ui.tab = patch.status;
  renderWatch(root);
}

async function remove(t: Title, root: HTMLElement): Promise<void> {
  const ok = await confirmDialog(`"${t.name}" silinsin mi?`, 'Kaydı sil');
  if (!ok) return;
  const snapshot = { ...t };
  store.update((d) => { d.titles = d.titles.filter((x) => x.id !== t.id); });
  toast(`${t.name} silindi`, () => {
    store.update((d) => { d.titles.unshift(snapshot); });
    renderWatch(root);
  });
  renderWatch(root);
}

/* -------------------------------------------------------------- TMDB arama */

/** Her zaman görünen ekleme çubuğu: yazınca altında sonuç açılır, tıklayınca direkt kayıt oluşur. */
function tmdbAddBar(root: HTMLElement): HTMLElement {
  let seq = 0;
  let debounceTimer: number | null = null;
  const active = hasTmdbKey();

  const resultsHost = h('div', { class: 'tmdb-add__results' });

  const input = h('input', {
    class: 'tmdb-add__input',
    placeholder: active ? 'Film veya dizi ara ve tek tıkla ekle…' : 'TMDB key gerekli · Ayarlar > TMDB',
    disabled: !active,
    oninput: () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      const val = (input as HTMLInputElement).value;
      debounceTimer = window.setTimeout(() => void run(val), 300);
    },
    onblur: () => { window.setTimeout(() => resultsHost.classList.remove('is-open'), 120); },
  });

  async function run(q: string): Promise<void> {
    const mySeq = ++seq;
    if (!q.trim()) { clear(resultsHost); resultsHost.classList.remove('is-open'); return; }
    try {
      const results = await searchTmdb(q);
      if (mySeq !== seq) return;
      clear(resultsHost);
      if (!results.length) {
        resultsHost.append(h('div', { class: 'tmdb-add__empty', text: 'sonuç yok' }));
      } else {
        for (const r of results.slice(0, 8)) resultsHost.append(resultRow(r));
      }
      resultsHost.classList.add('is-open');
    } catch (err) {
      if (mySeq !== seq) return;
      clear(resultsHost);
      resultsHost.append(h('div', { class: 'tmdb-add__empty', text: `hata: ${err instanceof Error ? err.message : String(err)}` }));
      resultsHost.classList.add('is-open');
    }
  }

  function resultRow(r: TmdbResult): HTMLElement {
    const thumb = h('div', { class: 'tmdb-add__thumb' });
    if (r.posterUrl) thumb.append(h('img', { src: r.posterUrl, alt: r.name }));
    return h('button', {
      class: 'tmdb-add__row',
      // mousedown'da preventDefault: input blur olup dropdown kapanmadan once tiklama gecerli olsun.
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        (input as HTMLInputElement).value = '';
        clear(resultsHost);
        resultsHost.classList.remove('is-open');
        addFromTmdb(r, root);
      },
    },
      thumb,
      h('div', { class: 'tmdb-add__info' },
        h('div', { class: 'tmdb-add__name', text: r.name }),
        h('div', { class: 'tmdb-add__meta', text: `${r.kind === 'film' ? 'Film' : 'Dizi'}${r.year ? ' · ' + r.year : ''}` }),
      ),
    );
  }

  return h('div', { class: 'tmdb-add' }, h('span', { class: 'tmdb-add__icon', text: '⌕' }), input, resultsHost);
}

/** TMDB sonucundan tek tıkla kayıt oluşturur; form doldurtmaz, direkt ilgili ekranı açar. */
function addFromTmdb(r: TmdbResult, root: HTMLElement): void {
  const already = db().titles.find((x) => x.tmdbId === r.id && x.kind === r.kind);
  if (already) {
    toast(`${already.name} zaten kayıtlı`);
    openTitle(already, root);
    return;
  }
  const now = nowISO();
  const t: Title = {
    id: uid('t'), kind: r.kind, name: r.name, year: r.year, genres: r.genres,
    status: 'planned', rating: null, posterUrl: r.posterUrl, imdb: '',
    watchedAt: '', withWho: [], review: '', season: 1, episode: 0, tags: [],
    createdAt: now, updatedAt: now, tmdbId: r.id, episodes: [], episodesFetchedAt: '',
  };
  store.update((d) => { d.titles.unshift(t); });
  toast(`${t.name} eklendi`);
  ui.tab = 'planned';
  renderWatch(root);
  openTitle(t, root);
}

/** Komut paletinden "yeni film ekle" için: izleme ekranına gidip arama çubuğuna odaklanır. */
export function openWatchForm(): void {
  const root = document.querySelector('.content') as HTMLElement;
  renderWatch(root);
  (root.querySelector('.tmdb-add__input') as HTMLInputElement | null)?.focus();
}
