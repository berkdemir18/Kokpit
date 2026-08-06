/**
 * Trakt'tan gelen kayıtları TMDB ile tamamlar.
 *
 * Trakt export'unda poster, tür ve dizinin gerçekten bitip bitmediği yok.
 * Bu araç her kayıt için TMDB'den posteri/türleri çeker, dizilerde tam bölüm
 * listesini alıp izlenmişleri işaretler ve duruma göre "İzlendi / İzleniyor"
 * ayrımını düzeltir.
 */

import { store, db } from './store';
import { EpisodeRecord, Title } from './model';
import { fetchArtwork, fetchShowEpisodes, hasTmdbKey } from './tmdb';
import { nowISO } from './util';

export interface EnrichProgress {
  done: number;
  total: number;
  current: string;
}

export interface EnrichSummary {
  posters: number;
  statusFixed: number;
  episodesFilled: number;
  failed: number;
}

/** Poster/tür eksiği olan ya da durumu şüpheli TMDB kayıtları. */
export function needsEnrich(): Title[] {
  return db().titles.filter((t) => t.tmdbId && (!t.posterUrl || !t.genres.length));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kayıtları sırayla tamamlar. TMDB serbest kotayı zorlamamak için
 * istekler arasında kısa bekleme var; ilerleme geri bildirilir.
 */
export async function enrichFromTmdb(
  onProgress: (p: EnrichProgress) => void,
  opts: { withEpisodes?: boolean } = {},
): Promise<EnrichSummary> {
  if (!hasTmdbKey()) throw new Error('Önce Ayarlar\'dan TMDB API key gir.');

  const targets = db().titles.filter((t) => t.tmdbId);
  const sum: EnrichSummary = { posters: 0, statusFixed: 0, episodesFilled: 0, failed: 0 };

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    onProgress({ done: i, total: targets.length, current: t.name });

    try {
      if (!t.posterUrl || !t.genres.length) {
        const art = await fetchArtwork(t.tmdbId!, t.kind);
        store.update((d) => {
          const x = d.titles.find((y) => y.id === t.id);
          if (!x) return;
          if (art.posterUrl && !x.posterUrl) { x.posterUrl = art.posterUrl; sum.posters++; }
          if (art.genres.length && !x.genres.length) x.genres = art.genres;
          if (art.year && !x.year) x.year = art.year;
          x.updatedAt = nowISO();
        }, { quiet: true });
        await sleep(120);
      }

      // Dizide tam bölüm listesi: bitmiş mi devam mı ancak böyle bilinir.
      if (opts.withEpisodes && t.kind === 'dizi') {
        const fresh = await fetchShowEpisodes(t.tmdbId!);
        if (fresh.length) {
          store.update((d) => {
            const x = d.titles.find((y) => y.id === t.id);
            if (!x) return;
            const seen = new Map(x.episodes.map((e) => [`${e.season}x${e.number}`, e]));
            const merged: EpisodeRecord[] = fresh.map((f) => {
              const ex = seen.get(`${f.season}x${f.number}`);
              return {
                season: f.season, number: f.number, name: f.name, airDate: f.airDate,
                watched: ex?.watched ?? false, watchedAt: ex?.watchedAt ?? '',
                rating: ex?.rating ?? null, comment: ex?.comment ?? '',
              };
            });
            x.episodes = merged;
            x.episodesFetchedAt = nowISO();
            sum.episodesFilled++;
          }, { quiet: true });
        }
        await sleep(150);
      }

      // Durum düzeltmesi: hepsi izlendiyse "İzlendi", değilse "İzleniyor".
      store.update((d) => {
        const x = d.titles.find((y) => y.id === t.id);
        if (!x || x.kind !== 'dizi' || !x.episodes.length || x.status === 'dropped') return;
        const watched = x.episodes.filter((e) => e.watched).length;
        const want = watched === x.episodes.length ? 'done' : watched > 0 ? 'active' : 'planned';
        if (x.status !== want) { x.status = want; sum.statusFixed++; }
      }, { quiet: true });
    } catch {
      sum.failed++;
    }
  }

  onProgress({ done: targets.length, total: targets.length, current: '' });
  store.touch();
  await store.flush();
  return sum;
}

/**
 * TMDB'siz hızlı onarım: elde bölüm listesi olan dizilerde hepsi izlenmişse
 * durumu "İzlendi" yapar. İnternet gerekmez.
 */
export function fixWatchedStatuses(): number {
  let fixed = 0;
  store.update((d) => {
    for (const x of d.titles) {
      if (x.kind !== 'dizi' || !x.episodes.length || x.status === 'dropped') continue;
      const watched = x.episodes.filter((e) => e.watched).length;
      const want = watched === x.episodes.length ? 'done' : watched > 0 ? 'active' : 'planned';
      if (x.status !== want) { x.status = want; fixed++; }
    }
  });
  return fixed;
}
