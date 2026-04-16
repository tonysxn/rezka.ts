import { parse } from 'node-html-parser';
import { createHttpClient } from './http.js';
import { Media } from './Media.js';
import { detectMediaType } from './utils.js';
import type { AxiosInstance } from 'axios';
import type {
  SearchResult,
  RezkaOptions,
  MediaType,
  BrowseOptions,
  BrowsePage,
  BrowseItem,
  LoginResult,
} from './types.js';

// ─── Shared default client (lazy singleton) ───────────────────────────────────

let _defaultHttp: AxiosInstance | null = null;
function getDefaultHttp(): AxiosInstance {
  return (_defaultHttp ??= createHttpClient());
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Search HDRezka for movies and TV series.
 *
 * @param query - Search query string
 * @param options - Optional config (custom mirror, timeout, headers)
 *
 * @example
 * ```typescript
 * import { search } from 'rezka-api';
 * const results = await search('mr robot');
 * console.log(results[0].url);
 * ```
 */
export async function search(query: string, options?: RezkaOptions): Promise<SearchResult[]> {
  if (!query.trim()) throw new Error('Search query cannot be empty');

  const http = options?._http ?? (options ? createHttpClient(options) : getDefaultHttp());

  const response = await http.post<string>(
    '/engine/ajax/search.php',
    new URLSearchParams({ q: query }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  const root = parse(response.data);

  return root
    .getElementsByTagName('li')
    .map(el => {
      const anchor = el.querySelector('a');
      const titleEl = el.querySelector('.enty');
      const url = anchor?.getAttribute('href') ?? '';
      return {
        url,
        title: titleEl?.innerText.trim() ?? '',
        type: detectMediaType(url) as MediaType,
        year: el.querySelector('.b-post__infolast')?.innerText.trim() ?? '',
      };
    })
    .filter(r => Boolean(r.url));
}

/**
 * Load and parse an HDRezka media page.
 *
 * Returns a {@link Media} instance — all metadata (title, translations, seasons…)
 * is immediately available as properties. Stream URLs require an additional
 * async call to `.streams()` or `.episode().streams()`.
 *
 * @param url - Full page URL, e.g. `https://rezka.ag/films/action/12345-title.html`
 * @param options - Optional config
 *
 * @example
 * ```typescript
 * import { load } from 'rezka-api';
 * const media = await load('https://rezka.ag/films/...');
 * console.log(media.title, media.year);
 * const streams = await media.streams();
 * ```
 */
export async function load(url: string, options?: RezkaOptions): Promise<Media> {
  if (!url.trim()) throw new Error('URL cannot be empty');

  const http = options?._http ?? (options ? createHttpClient(options) : getDefaultHttp());
  const response = await http.get<string>(url);
  return new Media(response.data, url, http);
}

/**
 * Create a reusable client bound to specific options.
 * Useful when working with a custom mirror or shared timeout/headers.
 *
 * @example
 * ```typescript
 * import { createClient } from 'rezka-api';
 * const client = createClient({ baseUrl: 'https://my-mirror.com', timeout: 30_000 });
 * const results = await client.search('inception');
 * const media   = await client.load(results[0].url);
 * ```
 */
export function createClient(options: RezkaOptions) {
  const http = options._http ?? createHttpClient(options);
  return {
    search: (query: string) => search(query, { ...options, _http: http }),
    load:   (url: string)   => load(url,   { ...options, _http: http }),
  };
}

// ─── Browse catalog ───────────────────────────────────────────────────────────

const BROWSE_TYPE_MAP: Record<string, string> = {
  movie: 'films',
  series: 'series',
  cartoon: 'cartoons',
  anime: 'animation',
};

/**
 * Browse the HDRezka catalog — lists of movies, series, cartoons or anime.
 *
 * @param browseOptions - What to browse (type, filter, page, genreUrl)
 * @param clientOptions - HTTP options (baseUrl, timeout, headers)
 *
 * @example
 * ```typescript
 * import { browse } from 'rezka-api';
 *
 * // Latest series, page 1
 * const page = await browse({ type: 'series', filter: 'last' });
 * console.log(page.items[0].title);
 * console.log(page.hasNextPage); // true → call with page: 2
 *
 * // Specific genre URL
 * const page = await browse({ genreUrl: '/films/comedy/' });
 * ```
 */
export async function browse(
  browseOptions?: BrowseOptions,
  clientOptions?: RezkaOptions
): Promise<BrowsePage> {
  const http =
    clientOptions?._http ??
    (clientOptions ? createHttpClient(clientOptions) : getDefaultHttp());

  const { type, filter, page = 1, genreUrl } = browseOptions ?? {};

  let basePath = '';
  if (genreUrl) {
    basePath = genreUrl.replace(/^\//, '').replace(/\/$/, '') + '/';
  } else if (type && BROWSE_TYPE_MAP[type]) {
    basePath = BROWSE_TYPE_MAP[type] + '/';
  }

  const pagePath = page > 1 ? `page/${page}/` : '';
  const path = `/${basePath}${pagePath}`;
  const params = filter ? `?filter=${filter}` : '';

  const response = await http.get<string>(`${path}${params}`);
  const root = parse(response.data);

  const items: BrowseItem[] = root
    .querySelectorAll('.b-content__inline_item')
    .map(el => {
      const url = el.getAttribute('data-url') ?? el.querySelector('a')?.getAttribute('href') ?? '';
      const id = parseInt(el.getAttribute('data-id') ?? '0', 10);
      const title = el.querySelector('.b-content__inline_item-link a')?.innerText.trim() ?? '';
      const poster = el.querySelector('img')?.getAttribute('src') ?? '';
      const info = el.querySelector('.b-content__inline_item-info')?.innerText.trim() ?? '';
      return { id, url, title, poster, type: detectMediaType(url) as MediaType, info };
    })
    .filter(item => Boolean(item.url));

  const nextBtn = root.querySelector('.b-navigation__next');
  const hasNextPage = Boolean(nextBtn) && !nextBtn?.parentNode?.rawTagName?.includes('span');

  return { items, page, hasNextPage };
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Log in to HDRezka and return an authenticated client.
 *
 * The returned client automatically includes the session cookies in every
 * subsequent request, enabling personalised features (history, favourites, etc.).
 *
 * @throws If credentials are wrong or the server rejects the login.
 *
 * @example
 * ```typescript
 * import { login } from 'rezka-api';
 *
 * const client = await login('you@email.com', 'password');
 * const results = await client.search('inception');
 * const media   = await client.load(results[0].url);
 * ```
 */
export async function login(
  email: string,
  password: string,
  options?: RezkaOptions
): Promise<ReturnType<typeof createClient>> {
  const http =
    options?._http ?? (options ? createHttpClient(options) : getDefaultHttp());

  const response = await http.post<LoginResult>(
    '/ajax/login/',
    new URLSearchParams({
      login_name: email,
      login_password: password,
      login_not_save: '0',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }
  );

  if (!response.data?.success) {
    throw new Error(response.data?.message ?? 'Login failed — check your credentials');
  }

  const setCookies: string[] = (response.headers['set-cookie'] as string[] | undefined) ?? [];
  const cookieString = setCookies.map(c => c.split(';')[0]).join('; ');

  return createClient({
    ...options,
    headers: { ...options?.headers, Cookie: cookieString },
  });
}

// ─── Named exports ────────────────────────────────────────────────────────────

export { Media } from './Media.js';
export type { EpisodeRef } from './Media.js';
export type {
  SearchResult,
  Translation,
  Season,
  Episode,
  InfoRow,
  StreamUrls,
  MediaType,
  Rating,
  BrowseItem,
  BrowsePage,
  BrowseOptions,
  BrowseFilter,
  LoginResult,
  RezkaOptions,
} from './types.js';

// ─── Default export (convenience) ────────────────────────────────────────────

const rezka = { search, load, browse, login, createClient };
export default rezka;
