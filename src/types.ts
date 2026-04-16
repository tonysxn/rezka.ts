import type { AxiosInstance } from 'axios';

export type MediaType =
  | 'movie'
  | 'series'
  | 'animation'
  | 'cartoon'
  | 'anime'
  | 'documentary'
  | 'unknown';

export interface SearchResult {
  url: string;
  title: string;
  type: MediaType;
  year: string;
}

export interface Translation {
  id: number;
  title: string;
}

export interface Season {
  id: number;
  title: string;
}

export interface Episode {
  id: number;
  episodeId: number;
  seasonId: number;
  title: string;
}

export interface InfoRow {
  key: string;
  value: string;
}

/** A map of quality label to HLS stream URL, e.g. `{ '1080p': 'https://...m3u8' }` */
export type StreamUrls = Record<string, string>;

export interface Rating {
  score: number;
  votes: number;
}

export interface BrowseItem {
  id: number;
  url: string;
  title: string;
  poster: string;
  type: MediaType;
  info: string;
}

export interface BrowsePage {
  items: BrowseItem[];
  page: number;
  hasNextPage: boolean;
}

export type BrowseFilter = 'last' | 'popular' | 'soon' | 'watching';

export interface BrowseOptions {
  /** Content type to browse */
  type?: 'movie' | 'series' | 'cartoon' | 'anime';
  /** Filter order */
  filter?: BrowseFilter;
  /** Page number, 1-based */
  page?: number;
  /** Direct genre path, e.g. `'/films/comedy/'` — overrides `type` */
  genreUrl?: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
}

export interface RezkaOptions {
  /** Service base URL. Defaults to `'https://rezka.ag'` */
  baseUrl?: string;
  /** Request timeout in ms. Defaults to `15000` */
  timeout?: number;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** @internal Inject a custom axios instance (for testing / proxying) */
  _http?: AxiosInstance;
}
