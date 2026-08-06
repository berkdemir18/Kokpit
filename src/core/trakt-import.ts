/**
 * Trakt.tv export klasorunu (Ayarlar > Data > Export) okuyup İzleme'ye aktarir.
 * Bolum izleme gecmisini, puanlari ve filmleri Title/EpisodeRecord modeline isler.
 * Ayni tmdbId'li kayit varsa birlestirir (tekrar calistirmak guvenli).
 */

import { store } from './store';
import { EpisodeRecord, Title } from './model';
import { uid, nowISO, dayKey } from './util';
import { listJsonFiles, readDirFile } from './api';

export interface TraktImportSummary {
  showsAdded: number;
  showsUpdated: number;
  moviesAdded: number;
  moviesUpdated: number;
  episodesMarked: number;
}

interface TraktIds { tmdb?: number | null }

interface TraktHistoryEvent {
  watched_at: string;
  type: string;
  episode?: { number: number; season: number; title?: string };
  show?: { title: string; year?: number; ids?: TraktIds };
}

interface TraktRatedEpisode {
  rating: number;
  episode: { season: number; number: number };
  show: { ids?: TraktIds };
}

interface TraktRatedShow {
  rating: number;
  show: { ids?: TraktIds };
}

interface TraktWatchedMovie {
  last_watched_at: string;
  movie: { title: string; year?: number; ids?: TraktIds };
}

interface TraktRatedMovie {
  rating: number;
  movie: { ids?: TraktIds };
}

async function readJson<T>(dir: string, name: string): Promise<T | null> {
  try {
    const raw = await readDirFile(dir, name);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const epKey = (season: number, number: number): string => `${season}x${number}`;

export async function importTraktExport(dir: string): Promise<TraktImportSummary> {
  const files = await listJsonFiles(dir);
  const historyFiles = files.filter((f) => /^watched-history-\d+\.json$/i.test(f));
  if (!historyFiles.length && !files.includes('watched-movies.json')) {
    throw new Error('Bu klasörde Trakt export dosyası bulunamadı (watched-history-*.json / watched-movies.json bekleniyor)');
  }

  const summary: TraktImportSummary = {
    showsAdded: 0, showsUpdated: 0, moviesAdded: 0, moviesUpdated: 0, episodesMarked: 0,
  };

  /* ------------------------------------------------------------ diziler */
  const showMap = new Map<number, { title: string; year: number | null; episodes: Map<string, EpisodeRecord> }>();

  for (const f of historyFiles) {
    const events = await readJson<TraktHistoryEvent[]>(dir, f);
    if (!events) continue;
    for (const ev of events) {
      const tmdbId = ev.show?.ids?.tmdb;
      if (ev.type !== 'episode' || !ev.episode || !tmdbId) continue;
      if (!showMap.has(tmdbId)) {
        showMap.set(tmdbId, { title: ev.show?.title ?? '', year: ev.show?.year ?? null, episodes: new Map() });
      }
      const entry = showMap.get(tmdbId)!;
      const key = epKey(ev.episode.season, ev.episode.number);
      const watchedAt = dayKey(new Date(ev.watched_at));
      const prev = entry.episodes.get(key);
      if (!prev || watchedAt > prev.watchedAt) {
        entry.episodes.set(key, {
          season: ev.episode.season,
          number: ev.episode.number,
          name: prev?.name ?? ev.episode.title ?? '',
          airDate: prev?.airDate ?? '',
          watched: true,
          watchedAt,
          rating: prev?.rating ?? null,
          comment: prev?.comment ?? '',
        });
      }
    }
  }

  const ratedEpisodes = (await readJson<TraktRatedEpisode[]>(dir, 'ratings-episodes.json')) ?? [];
  for (const r of ratedEpisodes) {
    const tmdbId = r.show.ids?.tmdb;
    const entry = tmdbId ? showMap.get(tmdbId) : undefined;
    if (!entry) continue;
    const ex = entry.episodes.get(epKey(r.episode.season, r.episode.number));
    if (ex) ex.rating = r.rating;
  }

  const ratedShows = (await readJson<TraktRatedShow[]>(dir, 'ratings-shows.json')) ?? [];
  const showRating = new Map<number, number>();
  for (const r of ratedShows) if (r.show.ids?.tmdb) showRating.set(r.show.ids.tmdb, r.rating);

  store.update((d) => {
    for (const [tmdbId, entry] of showMap) {
      const episodes = [...entry.episodes.values()].sort((a, b) => a.season - b.season || a.number - b.number);
      const lastWatched = episodes.reduce((max, e) => (e.watchedAt > max ? e.watchedAt : max), '');
      const now = nowISO();
      const existing = d.titles.find((t) => t.tmdbId === tmdbId && t.kind === 'dizi');
      if (existing) {
        const merged = new Map(existing.episodes.map((e) => [epKey(e.season, e.number), e]));
        for (const e of episodes) merged.set(epKey(e.season, e.number), e);
        existing.episodes = [...merged.values()].sort((a, b) => a.season - b.season || a.number - b.number);
        if (lastWatched > existing.watchedAt) existing.watchedAt = lastWatched;
        if (showRating.has(tmdbId)) existing.rating = showRating.get(tmdbId)!;
        // Elde tuttugumuz butun bolumler izlendiyse dizi "izleniyor"da kalmasin.
        if (existing.episodes.length && existing.episodes.every((e) => e.watched)) existing.status = 'done';
        else if (existing.status !== 'dropped') existing.status = 'active';
        const lastEp = existing.episodes[existing.episodes.length - 1];
        if (lastEp) { existing.season = lastEp.season; existing.episode = lastEp.number; }
        existing.updatedAt = now;
        summary.showsUpdated++;
      } else {
        const last = episodes[episodes.length - 1];
        const t: Title = {
          id: uid('t'), kind: 'dizi', name: entry.title, year: entry.year,
          genres: [],
          status: episodes.length && episodes.every((e) => e.watched) ? 'done' : 'active',
          rating: showRating.get(tmdbId) ?? null,
          posterUrl: '', imdb: '', watchedAt: lastWatched, withWho: [], review: '',
          season: last?.season ?? 1, episode: last?.number ?? 0,
          tags: [], createdAt: now, updatedAt: now,
          tmdbId, episodes, episodesFetchedAt: '',
        };
        d.titles.unshift(t);
        summary.showsAdded++;
      }
      summary.episodesMarked += episodes.length;
    }
  });

  /* ------------------------------------------------------------- filmler */
  const watchedMovies = (await readJson<TraktWatchedMovie[]>(dir, 'watched-movies.json')) ?? [];
  const ratedMovies = (await readJson<TraktRatedMovie[]>(dir, 'ratings-movies.json')) ?? [];
  const movieRating = new Map<number, number>();
  for (const r of ratedMovies) if (r.movie.ids?.tmdb) movieRating.set(r.movie.ids.tmdb, r.rating);

  store.update((d) => {
    for (const wm of watchedMovies) {
      const tmdbId = wm.movie.ids?.tmdb;
      if (!tmdbId) continue;
      const watchedAt = dayKey(new Date(wm.last_watched_at));
      const now = nowISO();
      const existing = d.titles.find((t) => t.tmdbId === tmdbId && t.kind === 'film');
      if (existing) {
        existing.status = 'done';
        if (!existing.watchedAt) existing.watchedAt = watchedAt;
        if (movieRating.has(tmdbId)) existing.rating = movieRating.get(tmdbId)!;
        existing.updatedAt = now;
        summary.moviesUpdated++;
      } else {
        const t: Title = {
          id: uid('t'), kind: 'film', name: wm.movie.title, year: wm.movie.year ?? null,
          genres: [], status: 'done', rating: movieRating.get(tmdbId) ?? null,
          posterUrl: '', imdb: '', watchedAt, withWho: [], review: '',
          season: 0, episode: 0, tags: [], createdAt: now, updatedAt: now,
          tmdbId, episodes: [], episodesFetchedAt: '',
        };
        d.titles.unshift(t);
        summary.moviesAdded++;
      }
    }
  });

  return summary;
}
