/** Trakt tarzı dizi detay ekranı: sezon sekmeleri, bölüm bölüm işaretleme, puan ve yorum. */

import { store, db } from '../core/store';
import { EpisodeRecord, STATUS_LABEL, Status, Title } from '../core/model';
import { h, clear } from '../ui/dom';
import { closeOverlay, mountOverlay, toast, confirmDialog } from '../ui/overlay';
import { fetchShowEpisodes } from '../core/tmdb';
import { dayKey, nowISO, shortDate } from '../core/util';

const STATUS_COLOR: Record<Status, string> = {
  done: 'var(--success)',
  active: 'var(--accent)',
  planned: 'var(--dim)',
  dropped: 'var(--danger)',
};

const RATING_COLOR = (r: number): string =>
  r >= 9 ? 'var(--success)' : r >= 7 ? 'var(--warn)' : 'var(--dim)';

let expandedEp: string | null = null;

function current(id: string): Title | undefined {
  return db().titles.find((t) => t.id === id);
}

function seasonsOf(t: Title): number[] {
  const nums = [...new Set(t.episodes.map((e) => e.season))].sort((a, b) => a - b);
  return nums.length ? nums : [1];
}

export async function openShowDetail(t: Title, onClose: () => void): Promise<void> {
  const state = { season: seasonsOf(t)[seasonsOf(t).length - 1] ?? 1 };
  expandedEp = null;

  // Kabuk (overlay/modal/head/foot) BİR KEZ kurulur; her değişiklikte sadece
  // içerik (bodyEl) yeniden doldurulur. Aksi halde overlay her tıklamada
  // kapanıp yeniden açılıyormuş gibi görünüp göz kırpıyordu.
  const metaEl = h('div', { class: 'modal__meta', text: '' });
  const bodyEl = h('div', { class: 'modal__body', style: { display: 'block' } });

  const modal = h('div', { class: 'modal modal--xl' },
    h('div', { class: 'modal__head' },
      h('div', { class: 'modal__title', text: t.name }),
      metaEl,
    ),
    bodyEl,
    h('div', { class: 'modal__foot' },
      h('div', { class: 'modal__hint', text: 'Esc kapat' }),
      h('button', {
        class: 'btn push', style: { color: 'var(--danger)' }, text: 'Diziyi sil',
        onclick: async () => {
          const ok = await confirmDialog(`"${t.name}" kaydı silinsin mi?`, 'Kaydı sil', {
            detail: 'Bölüm işaretlerin ve puanların da silinir.',
          });
          if (!ok) return;
          const snap = { ...t };
          store.update((d) => { d.titles = d.titles.filter((x) => x.id !== t.id); });
          closeOverlay();
          toast(`${t.name} silindi`, () => { store.update((d) => { d.titles.unshift(snap); }); onClose(); });
          onClose();
        },
      }),
      h('button', { class: 'btn', text: 'Kapat', onclick: () => { closeOverlay(); onClose(); } }),
    ),
  );

  const overlay = h('div', {
    class: 'overlay overlay--center',
    onclick: (e) => { if (e.target === overlay) { closeOverlay(); onClose(); } },
    onkeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeOverlay(); onClose(); } },
  }, modal);
  mountOverlay(overlay);

  async function refetch(): Promise<void> {
    if (!t.tmdbId) return;
    toast('TMDB\'den bölüm listesi çekiliyor…');
    try {
      const fresh = await fetchShowEpisodes(t.tmdbId);
      store.update((d) => {
        const x = d.titles.find((y) => y.id === t.id);
        if (!x) return;
        const byKey = new Map(x.episodes.map((e) => [`${e.season}x${e.number}`, e]));
        const merged: EpisodeRecord[] = fresh.map((f) => {
          const ex = byKey.get(`${f.season}x${f.number}`);
          return {
            season: f.season, number: f.number, name: f.name, airDate: f.airDate,
            watched: ex?.watched ?? false, watchedAt: ex?.watchedAt ?? '',
            rating: ex?.rating ?? null, comment: ex?.comment ?? '',
          };
        });
        x.episodes = merged;
        x.episodesFetchedAt = nowISO();
        x.updatedAt = nowISO();
      });
      const cur = current(t.id);
      if (cur) t = cur;
      toast('Bölüm listesi güncellendi');
      state.season = seasonsOf(t)[seasonsOf(t).length - 1] ?? 1;
      render();
    } catch (err) {
      toast(`Hata: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function toggleEpisode(ep: EpisodeRecord): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      const e = x.episodes.find((y) => y.season === ep.season && y.number === ep.number);
      if (!e) return;
      e.watched = !e.watched;
      e.watchedAt = e.watched ? dayKey() : '';
      x.updatedAt = nowISO();
      const watchedCount = x.episodes.filter((y) => y.watched).length;
      if (watchedCount > 0 && x.status === 'planned') x.status = 'active';
      if (x.episodes.length > 0 && watchedCount === x.episodes.length) x.status = 'done';
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function markSeasonWatchedUpTo(ep: EpisodeRecord): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      for (const e of x.episodes) {
        if (e.season === ep.season && e.number <= ep.number && !e.watched) {
          e.watched = true;
          e.watchedAt = dayKey();
        }
      }
      x.updatedAt = nowISO();
      if (x.status === 'planned') x.status = 'active';
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function markSeasonComplete(season: number): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      for (const e of x.episodes) {
        if (e.season === season && !e.watched) { e.watched = true; e.watchedAt = dayKey(); }
      }
      x.updatedAt = nowISO();
      const watchedCount = x.episodes.filter((y) => y.watched).length;
      if (watchedCount > 0 && x.status === 'planned') x.status = 'active';
      if (x.episodes.length > 0 && watchedCount === x.episodes.length) x.status = 'done';
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function markShowComplete(): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      for (const e of x.episodes) { if (!e.watched) { e.watched = true; e.watchedAt = dayKey(); } }
      x.status = 'done';
      x.updatedAt = nowISO();
    });
    const cur = current(t.id);
    if (cur) t = cur;
    toast(`${t.name} tamamlandı`);
    render();
  }

  function setEpisodeRating(ep: EpisodeRecord, rating: number | null): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      const e = x?.episodes.find((y) => y.season === ep.season && y.number === ep.number);
      if (e) e.rating = rating;
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function setEpisodeComment(ep: EpisodeRecord, comment: string): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      const e = x?.episodes.find((y) => y.season === ep.season && y.number === ep.number);
      if (e) e.comment = comment;
    });
  }

  function setStatus(s: Status): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      x.status = s;
      x.updatedAt = nowISO();
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function setShowRating(r: number): void {
    store.update((d) => {
      const x = d.titles.find((y) => y.id === t.id);
      if (!x) return;
      x.rating = x.rating === r ? null : r;
      x.updatedAt = nowISO();
    });
    const cur = current(t.id);
    if (cur) t = cur;
    render();
  }

  function episodeRow(ep: EpisodeRecord): HTMLElement {
    const key = `${ep.season}x${ep.number}`;
    const isExpanded = expandedEp === key;

    const check = h('button', {
      class: `ep-row__check${ep.watched ? ' is-on' : ''}`,
      text: ep.watched ? '✓' : '',
      title: ep.watched ? 'izlenmedi işaretle' : 'izledim işaretle',
      onclick: (e) => { e.stopPropagation(); toggleEpisode(ep); },
    });

    const row = h('div', { class: `ep-row${ep.watched ? ' is-watched' : ''}` },
      check,
      h('div', { class: 'ep-row__num', text: `B${ep.number}` }),
      h('button', {
        class: 'ep-row__name', text: ep.name || `Bölüm ${ep.number}`,
        onclick: () => { expandedEp = isExpanded ? null : key; render(); },
      }),
      h('div', { class: 'ep-row__air', text: ep.airDate ? shortDate(ep.airDate) : '' }),
      h('div', {
        class: 'ep-row__rating',
        style: { color: ep.rating ? RATING_COLOR(ep.rating) : 'var(--dim-4)' },
        text: ep.rating ? String(ep.rating) : '—',
      }),
    );

    if (!isExpanded) return row;

    const dots = h('div', { class: 'ep-mini-dots' });
    for (let i = 1; i <= 10; i++) {
      dots.append(h('button', {
        class: `ep-mini-dot${ep.rating === i ? ' is-on' : ''}`,
        text: String(i),
        style: ep.rating === i ? { background: RATING_COLOR(i), color: 'var(--bg)' } : {},
        onclick: () => setEpisodeRating(ep, ep.rating === i ? null : i),
      }));
    }

    const commentBox = h('textarea', {
      class: 'field__area', rows: 2, value: ep.comment, placeholder: 'bu bölüm hakkında kısa not…',
      onblur: (e) => setEpisodeComment(ep, (e.target as HTMLTextAreaElement).value),
    });

    const upTo = h('button', {
      class: 'btn', style: { marginTop: '8px' }, text: `S${ep.season} B${ep.number}'e kadar izlendi işaretle`,
      onclick: () => markSeasonWatchedUpTo(ep),
    });

    const wrap = h('div', { class: 'ep-row__expand' }, dots, commentBox, upTo);
    return h('div', {}, row, wrap);
  }

  function render(): void {
    const cur = current(t.id) ?? t;
    t = cur;
    const seasons = seasonsOf(t);
    if (!seasons.includes(state.season)) state.season = seasons[seasons.length - 1];

    const watchedTotal = t.episodes.filter((e) => e.watched).length;
    const totalEps = t.episodes.length;
    const seasonEps = t.episodes.filter((e) => e.season === state.season).sort((a, b) => a.number - b.number);
    const seasonWatched = seasonEps.filter((e) => e.watched).length;

    metaEl.textContent = `${t.year ?? ''} · ${watchedTotal}/${totalEps || '?'} bölüm`;

    const seasonTabs = h('div', { class: 'segmented segmented--mini' });
    for (const sn of seasons) {
      const epsInSeason = t.episodes.filter((e) => e.season === sn).length;
      const doneInSeason = t.episodes.filter((e) => e.season === sn && e.watched).length;
      seasonTabs.append(h('button', {
        class: `segmented__item${state.season === sn ? ' is-active' : ''}`,
        text: `S${sn}`,
        title: `${doneInSeason}/${epsInSeason}`,
        onclick: () => { state.season = sn; render(); },
      }));
    }

    const statusRow = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } });
    for (const s of ['planned', 'active', 'done', 'dropped'] as Status[]) {
      statusRow.append(h('button', {
        class: `chip${t.status === s ? ' is-on' : ''}`,
        style: t.status === s ? { color: STATUS_COLOR[s], borderColor: STATUS_COLOR[s] } : {},
        text: STATUS_LABEL[s],
        onclick: () => setStatus(s),
      }));
    }

    const ratingRow = h('div', { class: 'detail-ratings' });
    for (let i = 1; i <= 10; i++) {
      ratingRow.append(h('button', {
        class: `rating-dot${t.rating === i ? ' is-on' : ''}`,
        text: String(i),
        style: t.rating === i ? { background: RATING_COLOR(i), color: 'var(--bg)' } : {},
        onclick: () => setShowRating(i),
      }));
    }

    const poster = h('div', { class: 'detail-poster' });
    if (t.posterUrl) poster.append(h('img', { class: 'poster__img', src: t.posterUrl, alt: t.name }));
    else poster.append(h('div', { class: 'poster__empty', text: 'POSTER' }));

    const progressPct = totalEps ? Math.round((watchedTotal / totalEps) * 100) : 0;

    const epList = h('div', { class: 'ep-list' });
    if (!seasonEps.length) {
      epList.append(h('div', { class: 'empty-state' },
        h('div', { text: t.tmdbId ? 'Bu sezon için bölüm bilgisi yok.' : 'Bölüm listesi yok.' }),
        !t.tmdbId ? h('div', { class: 'empty-state__hint', text: 'Bu kayıt TMDB ile eşleşmediği için otomatik bölüm listesi çekilemiyor.' }) : null,
      ));
    } else {
      for (const ep of seasonEps) epList.append(episodeRow(ep));
    }

    const completeBtns = h('div', { class: 'row', style: { gap: '8px' } },
      totalEps > 0 && watchedTotal < totalEps
        ? h('button', { class: 'btn btn--primary', text: '✓ Diziyi tamamla', onclick: () => markShowComplete() })
        : null,
      seasonEps.length > 0 && seasonWatched < seasonEps.length
        ? h('button', { class: 'btn', text: `✓ S${state.season} sezonunu tamamla`, onclick: () => markSeasonComplete(state.season) })
        : null,
    );

    clear(bodyEl);
    bodyEl.append(
      h('div', { class: 'row', style: { gap: '16px', alignItems: 'flex-start' } },
        poster,
        h('div', { class: 'detail-main' },
          h('div', { class: 'field__label', text: 'Genel puan' }),
          ratingRow,
          h('div', { class: 'field__label', style: { marginTop: '14px' }, text: 'Durum' }),
          statusRow,
          h('div', { class: 'field__label', style: { marginTop: '14px' }, text: `İlerleme · %${progressPct}` }),
          h('div', { class: 'show-progress' }, h('div', { class: 'show-progress__bar', style: { width: `${progressPct}%` } })),
          completeBtns.children.length ? h('div', { style: { marginTop: '10px' } }, completeBtns) : null,
        ),
      ),
      h('div', { class: 'row', style: { gap: '10px', marginTop: '18px', alignItems: 'center' } },
        seasonTabs,
        h('div', { class: 'push sub-text', text: `S${state.season}: ${seasonWatched}/${seasonEps.length || 0} izlendi` }),
        t.tmdbId
          ? h('button', { class: 'btn btn--mono', text: t.episodes.length ? 'BÖLÜM LİSTESİNİ YENİLE' : 'BÖLÜM LİSTESİNİ GETİR', onclick: () => void refetch() })
          : null,
      ),
      h('div', { style: { marginTop: '10px' } }, epList),
    );
  }

  render();
  if (t.tmdbId && !t.episodes.length) {
    await refetch();
  }
}
