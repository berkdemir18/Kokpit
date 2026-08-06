/** TMDB (The Movie Database) arama entegrasyonu — film/dizi kaydını elle yazmak yerine aratıp seçmek için. */

import { db } from './store';
import type { TitleKind } from './model';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';

const MOVIE_GENRES: Record<number, string> = {
  28: 'Aksiyon', 12: 'Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç',
  99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 14: 'Fantastik', 36: 'Tarih',
  27: 'Korku', 10402: 'Müzik', 9648: 'Gizem', 10749: 'Romantik', 878: 'Bilim Kurgu',
  10770: 'TV Filmi', 53: 'Gerilim', 10752: 'Savaş', 37: 'Vahşi Batı',
};

const TV_GENRES: Record<number, string> = {
  10759: 'Aksiyon & Macera', 16: 'Animasyon', 35: 'Komedi', 80: 'Suç',
  99: 'Belgesel', 18: 'Dram', 10751: 'Aile', 10762: 'Çocuk', 9648: 'Gizem',
  10763: 'Haber', 10764: 'Reality', 10765: 'Bilim Kurgu & Fantastik',
  10766: 'Pembe Dizi', 10767: 'Konuşma', 10768: 'Savaş & Politika', 37: 'Vahşi Batı',
};

export interface TmdbResult {
  id: number;
  kind: TitleKind;
  name: string;
  year: number | null;
  genres: string[];
  posterUrl: string;
}

interface TmdbApiItem {
  id: number;
  media_type: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  poster_path?: string | null;
}

export function hasTmdbKey(): boolean {
  return !!db().settings.tmdbApiKey.trim();
}

export interface TmdbEpisodeBrief {
  season: number;
  number: number;
  name: string;
  airDate: string;
}

interface TmdbShowDetail {
  seasons?: { season_number: number }[];
}

interface TmdbSeasonDetail {
  episodes?: { episode_number: number; name?: string; air_date?: string }[];
}

/** Bir dizinin tum sezon/bolum listesini ceker (Trakt tarzi tam liste icin). */
export async function fetchShowEpisodes(tmdbId: number): Promise<TmdbEpisodeBrief[]> {
  const key = db().settings.tmdbApiKey.trim();
  if (!key) throw new Error('TMDB key ayarlanmadı');

  const showRes = await fetch(`${BASE}/tv/${tmdbId}?api_key=${encodeURIComponent(key)}&language=tr-TR`);
  if (!showRes.ok) throw new Error(`TMDB dizi bilgisi alınamadı (${showRes.status})`);
  const show = (await showRes.json()) as TmdbShowDetail;
  const seasonNums = (show.seasons ?? [])
    .map((s) => s.season_number)
    .filter((n) => n > 0);

  const episodes: TmdbEpisodeBrief[] = [];
  for (const sn of seasonNums) {
    const segRes = await fetch(`${BASE}/tv/${tmdbId}/season/${sn}?api_key=${encodeURIComponent(key)}&language=tr-TR`);
    if (!segRes.ok) continue;
    const seg = (await segRes.json()) as TmdbSeasonDetail;
    for (const ep of seg.episodes ?? []) {
      episodes.push({
        season: sn,
        number: ep.episode_number,
        name: ep.name || `Bölüm ${ep.episode_number}`,
        airDate: ep.air_date ?? '',
      });
    }
  }
  return episodes;
}

interface TmdbDetail {
  poster_path?: string | null;
  genres?: { id: number; name: string }[];
  first_air_date?: string;
  release_date?: string;
}

/**
 * Tek bir kaydın posterini ve türlerini çeker.
 * Trakt'tan gelen kayıtlarda poster/tür yok; toplu tamamlama için kullanılır.
 */
export async function fetchArtwork(
  tmdbId: number,
  kind: TitleKind,
): Promise<{ posterUrl: string; genres: string[]; year: number | null }> {
  const key = db().settings.tmdbApiKey.trim();
  if (!key) throw new Error('TMDB key ayarlanmadı');
  const path = kind === 'film' ? 'movie' : 'tv';
  const res = await fetch(`${BASE}/${path}/${tmdbId}?api_key=${encodeURIComponent(key)}&language=tr-TR`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const d = (await res.json()) as TmdbDetail;
  const date = d.first_air_date || d.release_date || '';
  return {
    posterUrl: d.poster_path ? `${IMG}${d.poster_path}` : '',
    genres: (d.genres ?? []).map((g) => g.name).filter(Boolean),
    year: date ? Number(date.slice(0, 4)) : null,
  };
}

export async function searchTmdb(query: string): Promise<TmdbResult[]> {
  const key = db().settings.tmdbApiKey.trim();
  if (!key || !query.trim()) return [];
  const url = `${BASE}/search/multi?api_key=${encodeURIComponent(key)}&language=tr-TR&include_adult=false&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB isteği başarısız (${res.status})`);
  const data = (await res.json()) as { results?: TmdbApiItem[] };
  const items = data.results ?? [];
  return items
    .filter((it) => it.media_type === 'movie' || it.media_type === 'tv')
    .map((it): TmdbResult => {
      const isMovie = it.media_type === 'movie';
      const genreMap = isMovie ? MOVIE_GENRES : TV_GENRES;
      const dateStr = isMovie ? it.release_date : it.first_air_date;
      return {
        id: it.id,
        kind: isMovie ? 'film' : 'dizi',
        name: (isMovie ? it.title : it.name) ?? '',
        year: dateStr ? Number(dateStr.slice(0, 4)) || null : null,
        genres: (it.genre_ids ?? []).map((g) => genreMap[g]).filter((g): g is string => !!g),
        posterUrl: it.poster_path ? `${IMG}${it.poster_path}` : '',
      };
    })
    .filter((r) => r.name);
}
