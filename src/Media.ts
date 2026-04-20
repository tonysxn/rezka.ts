import { parse, type HTMLElement } from 'node-html-parser';
import type { AxiosInstance } from 'axios';
import type { Translation, Season, Episode, InfoRow, StreamUrls, MediaType, Rating } from './types.js';
import { decodeStreamUrl, parseStreamUrls, detectMediaType } from './utils.js';

interface CdnResponse {
  success: boolean;
  url: string;
  message?: string;
}

interface AjaxEpisodesResponse {
  success: boolean;
  message?: string;
  seasons?: string;
  episodes?: string;
}

// ─── EpisodeRef ───────────────────────────────────────────────────────────────

/**
 * A reference to a specific series episode, returned by `media.episode()`.
 * Call `.streams()` to fetch HLS URLs.
 */
export interface EpisodeRef {
  /**
   * Fetch HLS stream URLs for this episode.
   * @param translationId - ID from `media.translations`. Defaults to the first available.
   */
  streams(translationId?: number): Promise<StreamUrls>;
}

// ─── Media ───────────────────────────────────────────────────────────────────

/**
 * A loaded HDRezka media page (movie or series).
 *
 * Construct via `load(url)` — all metadata is ready synchronously after that.
 * Stream URLs require an additional async `.streams()` call.
 */
export class Media {
  /** Internal HDRezka post ID */
  readonly id: number;
  /** Original URL this page was loaded from */
  readonly url: string;
  /** Localized title */
  readonly title: string;
  /** Original (non-localized) title, or `null` */
  readonly origTitle: string | null;
  /** Content type inferred from the URL */
  readonly type: MediaType;
  /** Release year extracted from the metadata table, or `null` */
  readonly year: string | null;
  /** Poster image URL, or `null` */
  readonly thumbnail: string | null;
  /** Plot description, or `null` */
  readonly description: string | null;
  /** Structured metadata rows (genre, country, director, cast…) */
  readonly info: InfoRow[];
  /** Available audio translations. Pass `.id` to `.streams()` */
  translations: Translation[];
  /** Season list — empty for movies */
  seasons: Season[];
  /** IMDb and KinoPoisk ratings */
  readonly rating: { imdb: Rating | null; kp: Rating | null };
  /** Tagline / slogan, or `null` */
  readonly slogan: string | null;
  /** Country of production, or `null` */
  readonly country: string | null;
  /** Video quality label, e.g. `'HDRip'`, or `null` */
  readonly quality: string | null;
  /** Age restriction (e.g. 16), or `null` */
  readonly ageRating: number | null;
  /** Runtime in minutes, or `null` */
  readonly duration: number | null;
  /** List of director names */
  readonly directors: string[];
  /** List of main cast names */
  readonly actors: string[];
  /** List of genre names */
  readonly genres: string[];

  private readonly root: HTMLElement;
  private readonly http: AxiosInstance;
  private _hydratedEpisodesMap: Map<number, Episode[]> | null = null;

  constructor(html: string, url: string, http: AxiosInstance) {
    this.root = parse(html);
    this.url = url;
    this.http = http;
    this.type = detectMediaType(url);

    this.info = this.parseInfo();
    this.id = this.parseId();
    this.title = this.root.querySelector('.b-post__title')?.innerText.trim() ?? '';
    this.origTitle = this.root.querySelector('.b-post__origtitle')?.innerText.trim() ?? null;
    this.thumbnail = this.root.querySelector('.b-sidecover img')?.getAttribute('src') ?? null;
    this.description = this.root.querySelector('.b-post__description_text')?.innerText.trim() ?? null;
    this.year = (() => { const _r = this.info.find((_row) => /год|year|выход/i.test(_row.key)); if (!_r) return null; const _m = _r.value.match(/\d{4}/); return _m ? _m[0] : _r.value.trim() || null; })();
    this.translations = this.parseTranslations();
    this.seasons = this.parseSeasons();
    this.rating = this.parseRating();
    this.slogan = this.decodeHtml(this.parseInfoField(/слоган/i) ?? '') || null;
    this.country = this.parseInfoField(/страна/i) ?? null;
    this.quality = this.parseInfoField(/в качестве/i) ?? null;
    this.ageRating = this.parseAgeRating();
    this.duration = this.parseDuration();
    this.directors = this.parseItemprop('director');
    this.actors = this.parseItemprop('actor');
    this.genres = this.parseGenres();
  }

  // ─── Episode navigation ───────────────────────────────────────────────────

  /**
   * Get the episode list for a specific season.
   * @param seasonId - Use an `id` value from `media.seasons`
   */
  episodes(seasonId: number): Episode[] {
    if (this._hydratedEpisodesMap) {
      return this._hydratedEpisodesMap.get(seasonId) ?? [];
    }

    const root = this.root.getElementById(`simple-episodes-list-${seasonId}`);
    if (!root) return [];

    return root.getElementsByTagName('li').map(el => ({
      id: parseInt(el.getAttribute('data-id') ?? '0', 10),
      episodeId: parseInt(el.getAttribute('data-episode_id') ?? '0', 10),
      seasonId,
      title: el.innerText.trim(),
    }));
  }

  /**
   * Select a specific episode to stream. Returns an {@link EpisodeRef} — no network call yet.
   *
   * @param seasonId  - Season ID (from `media.seasons[n].id`, usually 1-based)
   * @param episodeId - Episode ID (from `media.episodes(s)[n].episodeId`, usually 1-based)
   *
   * @example
   * ```typescript
   * const streams = await media.episode(1, 1).streams();
   * const streams = await media.episode(1, 3).streams(56);
   * ```
   */
  episode(seasonId: number, episodeId: number): EpisodeRef {
    return {
      streams: (translationId?: number) =>
        this.resolveStreams('get_stream', translationId, { season: seasonId, episode: episodeId }),
    };
  }

  // ─── Streams ─────────────────────────────────────────────────────────────

  /**
   * Fetch HLS stream URLs for a **movie** (or animation treated as a single piece).
   * For series, use `media.episode(season, episode).streams()` instead.
   *
   * @param translationId - Translation ID from `media.translations`. Defaults to first available.
   * @returns A map of quality label → HLS URL, e.g. `{ '1080p': 'https://...m3u8' }`
   * @throws If called on a series — use `.episode()` for that.
   *
   * @example
   * ```typescript
   * const streams = await media.streams();       // first translation
   * const streams = await media.streams(56);     // specific translation
   * const url1080 = streams['1080p'];
   * ```
   */
  async streams(translationId?: number): Promise<StreamUrls> {
    if (this.hasSeriesSignal()) {
      throw new Error(
        `"${this.title}" is a ${this.type}. ` +
          'Use media.episode(seasonId, episodeId).streams() to get episode streams.'
      );
    }
    return this.resolveStreams('get_movie', translationId);
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private async resolveStreams(
    action: 'get_movie' | 'get_stream',
    translationId?: number,
    ep?: { season: number; episode: number }
  ): Promise<StreamUrls> {
    const tid = translationId ?? this.translations[0]?.id;
    if (tid === undefined) {
      throw new Error('No translations found on this page. Check media.translations.');
    }

    const params: Record<string, string> = {
      id: String(this.id),
      translator_id: String(tid),
      action,
    };

    if (ep) {
      params.season = String(ep.season);
      params.episode = String(ep.episode);
    }

    const response = await this.http.post<CdnResponse>(
      '/ajax/get_cdn_series/',
      new URLSearchParams(params),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }
    );

    const data = response.data;
    if (!data?.url) {
      throw new Error(`Stream request failed: ${data?.message ?? 'empty response'}`);
    }

    return parseStreamUrls(decodeStreamUrl(data.url));
  }

  private parseId(): number {
    const el = this.root.getElementById('user-favorites-holder');
    if (!el) throw new Error('Cannot find post ID (#user-favorites-holder missing)');
    return parseInt(el.getAttribute('data-post_id') ?? '0', 10);
  }

  private parseInfo(): InfoRow[] {
    const table = this.root.querySelector('.b-post__info');
    if (!table) return [];

    return table.getElementsByTagName('tr').reduce<InfoRow[]>((acc, row) => {
      const key = row.querySelector('h2')?.innerText.trim();
      const tds = row.getElementsByTagName('td');
      if (key && tds.length >= 2) {
        acc.push({ key, value: tds[1].innerText.trim() });
      }
      return acc;
    }, []);
  }

  private parseTranslations(): Translation[] {
    const list = this.root.getElementById('translators-list');
    if (!list) {
      const scripts = this.root.querySelectorAll('script');
      for (const s of scripts) {
        const m =
          s.innerText.match(/initCDNSeriesEvents\s*\(\s*\d+\s*,\s*(\d+)\s*,/) ??
          s.innerText.match(/initCDNMoviesEvents\s*\(\s*\d+\s*,\s*(\d+)\s*,/);
        if (m) return [{ id: parseInt(m[1], 10), title: 'Default' }];
      }
      return [];
    }

    return list.querySelectorAll('[data-translator_id]').map(el => ({
      id: parseInt(el.getAttribute('data-translator_id') ?? '0', 10),
      title: el.getAttribute('title') || el.innerText.trim(),
    }));
  }

  /**
   * Returns `true` when the page embeds an `initCDNSeriesEvents` call,
   * which is the reliable signal that this page represents a **series**
   * (regardless of the URL-based `type`) and its episodes may be lazy-loaded.
   * Used internally by `load()` to decide whether hydration is needed.
   */
  hasSeriesSignal(): boolean {
    for (const s of this.root.querySelectorAll('script')) {
      if (s.innerText.includes('initCDNSeriesEvents')) return true;
    }
    return false;
  }

  /**
   * Fetches seasons and episodes via AJAX when the static HTML does not
   * include `#simple-seasons-tabs` (lazy-loaded for popular series).
   * Called automatically by `load()` — do not call manually.
   */
  async hydrateFromAjax(): Promise<void> {
    const tid = this.translations[0]?.id;
    if (tid === undefined) return;

    try {
      const response = await this.http.post<AjaxEpisodesResponse>(
        '/ajax/get_cdn_series/',
        new URLSearchParams({
          id: String(this.id),
          translator_id: String(tid),
          action: 'get_episodes',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } }
      );

      const data = response.data;
      if (!data?.success) return;

      if (data.seasons) {
        const seasonsRoot = parse(`<ul>${data.seasons}</ul>`);
        const parsed = seasonsRoot.getElementsByTagName('li').map(el => ({
          id: parseInt(el.getAttribute('data-tab_id') ?? '0', 10),
          title: el.innerText.trim(),
        })).filter(s => s.id > 0);
        if (parsed.length > 0) this.seasons = parsed;
      }

      if (data.episodes) {
        this._hydratedEpisodesMap = new Map();
        const epsRoot = parse(data.episodes);
        for (const ul of epsRoot.querySelectorAll('ul[id^="simple-episodes-list-"]')) {
          const seasonId = parseInt(
            (ul.getAttribute('id') ?? '').replace('simple-episodes-list-', ''),
            10
          );
          if (!seasonId) continue;
          const eps = ul.getElementsByTagName('li').map(el => ({
            id: parseInt(el.getAttribute('data-id') ?? '0', 10),
            episodeId: parseInt(el.getAttribute('data-episode_id') ?? '0', 10),
            seasonId,
            title: el.innerText.trim(),
          }));
          this._hydratedEpisodesMap.set(seasonId, eps);
        }
      }
    } catch {
      // Graceful degradation — leave seasons/episodes as-is
    }
  }

  private parseSeasons(): Season[] {
    const root = this.root.getElementById('simple-seasons-tabs');
    if (!root) return [];

    return root.getElementsByTagName('li').map(el => ({
      id: parseInt(el.getAttribute('data-tab_id') ?? '0', 10),
      title: el.innerText.trim(),
    }));
  }

  private parseRating(): { imdb: Rating | null; kp: Rating | null } {
    const parseOne = (selector: string): Rating | null => {
      const el = this.root.querySelector(selector);
      if (!el) return null;
      const score = parseFloat(el.querySelector('.bold')?.innerText ?? '');
      const text = el.innerText;
      const votesMatch = text.match(/\(([\d\s,. ]+)\)/);
      const votes = parseInt((votesMatch?.[1] ?? '').replace(/\D/g, ''), 10);
      if (isNaN(score)) return null;
      return { score, votes: isNaN(votes) ? 0 : votes };
    };
    return {
      imdb: parseOne('.b-post__info_rates.imdb'),
      kp: parseOne('.b-post__info_rates.kp'),
    };
  }

  private parseInfoField(key: RegExp): string | null {
    const row = this.info.find(r => key.test(r.key));
    return row?.value.trim() || null;
  }

  private parseAgeRating(): number | null {
    const raw = this.parseInfoField(/возраст/i);
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  private parseDuration(): number | null {
    const raw = this.parseInfoField(/время/i);
    if (!raw) return null;
    const n = parseInt(raw.replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  private parseItemprop(prop: 'actor' | 'director'): string[] {
    const els = this.root.querySelectorAll(`[itemprop="${prop}"]`);
    if (els.length > 0) {
      return els
        .map(el => {
          const name = el.querySelector('[itemprop="name"]') ?? el.querySelector('a') ?? el;
          return name.innerText.trim();
        })
        .filter(Boolean);
    }
    return this.parsePersonLinks(prop === 'director' ? /режиссер/i : /ролях|актер/i);
  }

  private parsePersonLinks(key: RegExp): string[] {
    const table = this.root.querySelector('.b-post__info');
    if (!table) return [];
    for (const row of table.getElementsByTagName('tr')) {
      if (key.test(row.querySelector('h2')?.innerText ?? '')) {
        const tds = row.getElementsByTagName('td');
        if (tds.length < 2) continue;
        return tds[1].getElementsByTagName('a').map(a => a.innerText.trim()).filter(Boolean);
      }
    }
    return [];
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/&laquo;/g, '«')
      .replace(/&raquo;/g, '»')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/[«»]/g, '')
      .trim();
  }

  private parseGenres(): string[] {
    const table = this.root.querySelector('.b-post__info');
    if (!table) return [];
    for (const row of table.getElementsByTagName('tr')) {
      if (/жанр|genre/i.test(row.querySelector('h2')?.innerText ?? '')) {
        const tds = row.getElementsByTagName('td');
        if (tds.length < 2) continue;
        return tds[1].getElementsByTagName('a').map(a => a.innerText.trim()).filter(Boolean);
      }
    }
    return [];
  }
}
