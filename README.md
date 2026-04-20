# rezka.ts

> Unofficial TypeScript API wrapper for the [HDRezka](https://rezka.ag) streaming service.

## Features

- **No boilerplate** — top-level `search()`, `load()`, `browse()` functions, no class instantiation required
- **Unified stream API** — one `.streams()` call for movies; fluent `.episode(s, e).streams()` for series
- **Transparent AJAX hydration** — `load()` silently fetches lazy-loaded seasons/episodes for popular series (see [below](#transparent-ajax-hydration))
- **Rich metadata** — IMDb/KP ratings, actors, directors, genres, country, duration and more, parsed eagerly
- **Browse catalog** — list movies/series by type, filter (`last`, `popular`, `soon`) and page
- **Authentication** — `login()` returns a ready-to-use authenticated client
- **Consistent types** — all IDs are `number`, `type` is a proper union, not `string`
- **Smart defaults** — omit `translationId` to auto-use the first available track
- **TypeScript-first** — full type definitions, zero `any`
- **Dual CJS / ESM** — works in any Node.js project (CommonJS or ESM)

---

## Transparent AJAX Hydration

### The problem: lazy-loaded seasons on popular series

HDRezka optimises its server load by **not rendering season/episode tabs in the initial HTML** for high-traffic series. Instead, the browser triggers an AJAX call once the page has loaded and populates the tabs dynamically. A plain HTML parser (like `node-html-parser`) cannot see this deferred content, so naïve scraping returns `seasons: []`.

### How `load()` solves it automatically

When `load(url)` detects that the returned `Media` object has no seasons **and** the page embeds an `initCDNSeriesEvents(…)` JavaScript call (the reliable signal that this is a series player), it transparently fires a single background POST to:

```
POST /ajax/get_cdn_series/
  id            = <post_id>
  translator_id = <default_translator_id>
  action        = get_episodes
```

The response contains two HTML fragments:

| Key | Content |
|---|---|
| `seasons` | `<li data-tab_id="N">Сезон N</li>` — season tabs |
| `episodes` | `<ul id="simple-episodes-list-N">…</ul>` — all episode lists |

The library parses these fragments and populates `media.seasons` and an internal episode cache. All subsequent calls to `media.episodes(seasonId)` are served from that cache — **no extra network round-trips**.

### What this means for you

```typescript
// Works the same for a 3-episode indie series and a blockbuster with 5 seasons:
const media = await load('https://rezka.ag/series/action/31432-pacany-2019-latest.html');

console.log(media.seasons);
// [ { id: 1, title: 'Сезон 1' }, { id: 2, title: 'Сезон 2' }, … ]  ← always populated

console.log(media.translations);
// [ { id: 376, title: 'HDrezka Studio' }, … ]  ← full list, not just "Default"

const eps = media.episodes(1);
// [ { episodeId: 1, title: 'Серия 1' }, … ]  ← from AJAX cache if needed

const streams = await media.episode(1, 1).streams();
// { '1080p': 'https://…', '720p': '…' }
```

The hydration is **completely transparent** — you never call it manually; `load()` handles everything.

---

## Installation

```bash
npm install rezka.ts
# or
yarn add rezka.ts
# or
pnpm add rezka.ts
```

**Requires Node.js ≥ 18.**

---

## Quick Start

```typescript
import { search, load, browse } from 'rezka.ts';
// or: import rezka from 'rezka.ts';  then rezka.search(...) / rezka.load(...)

// 1. Search
const results = await search('mr robot');
console.log(results[0]);
// { url: 'https://rezka.ag/series/...', title: 'Мистер Робот', type: 'series', year: '' }

// 2. Load media page — all metadata available synchronously
const media = await load(results[0].url);
console.log(media.title);           // "Мистер Робот"
console.log(media.origTitle);       // "Mr. Robot"
console.log(media.type);            // "series"
console.log(media.rating.imdb);     // { score: 8.5, votes: 1234567 }
console.log(media.directors);       // ['Sam Esmail']
console.log(media.actors);          // ['Rami Malek', ...]
console.log(media.genres);          // ['Thriller', 'Drama']
console.log(media.translations);    // [{ id: 56, title: 'English' }, ...]

// 3a. Movie — get streams directly
const streams = await media.streams();     // uses first translation
const streams = await media.streams(56);   // or pick a specific one
console.log(streams);  // { '1080p': 'https://...m3u8', '720p': '...', ... }

// 3b. Series — fluent episode selector
const streams = await media.episode(1, 1).streams();     // S01E01, default translation
const streams = await media.episode(1, 3).streams(56);   // S01E03, specific translation

// 4. Browse catalog
const page = await browse({ type: 'movie', filter: 'popular' });
console.log(page.items[0].title);
console.log(page.hasNextPage); // → call with page: 2
```

---

## API Reference

### `search(query, options?)`

```typescript
search(query: string, options?: RezkaOptions): Promise<SearchResult[]>
```

Search for movies and TV series.

```typescript
const results = await search('inception');
// [{ url, title, type: 'movie', year }, ...]
```

**Throws** if `query` is empty.

---

### `load(url, options?)`

```typescript
load(url: string, options?: RezkaOptions): Promise<Media>
```

Load and parse an HDRezka page. Returns a `Media` object — **all metadata is immediately available** as properties (no extra requests needed). Stream URLs require an additional async call.

```typescript
const media = await load('https://rezka.ag/films/action/12345-inception.html');
```

**Throws** if `url` is empty.

---

### `browse(browseOptions?, clientOptions?)`

```typescript
browse(browseOptions?: BrowseOptions, clientOptions?: RezkaOptions): Promise<BrowsePage>
```

Browse the HDRezka catalog — returns a paginated list of items.

```typescript
import { browse } from 'rezka.ts';

// Popular movies, page 1
const page = await browse({ type: 'movie', filter: 'popular' });
console.log(page.items);      // BrowseItem[]
console.log(page.hasNextPage); // true → fetch page 2

// Latest series, page 2
const page2 = await browse({ type: 'series', filter: 'last', page: 2 });

// Specific genre URL
const comedy = await browse({ genreUrl: '/films/comedy/' });
```

#### `BrowseOptions`

| Option | Type | Description |
|---|---|---|
| `type` | `'movie' \| 'series' \| 'cartoon' \| 'anime'` | Content type to browse |
| `filter` | `'last' \| 'popular' \| 'soon' \| 'watching'` | Sort order |
| `page` | `number` | Page number, 1-based (default: `1`) |
| `genreUrl` | `string` | Direct genre path, e.g. `'/films/comedy/'` — overrides `type` |

---

### `login(email, password, options?)`

```typescript
login(email: string, password: string, options?: RezkaOptions): Promise<client>
```

Log in to HDRezka. Returns an **authenticated client** with session cookies baked in — use it like `createClient()`.

```typescript
import { login } from 'rezka.ts';

const client = await login('you@email.com', 'password');
const results = await client.search('inception');
const media   = await client.load(results[0].url);
```

**Throws** if credentials are incorrect.

---

### `createClient(options)`

For cases where you need a **custom mirror, timeout, or shared configuration**. Returns an object with the same `search` and `load` methods bound to that config.

```typescript
import { createClient } from 'rezka.ts';

const client = createClient({
  baseUrl: 'https://my-mirror.com',
  timeout: 30_000,
});

const results = await client.search('inception');
const media   = await client.load(results[0].url);
```

---

### `RezkaOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | `'https://rezka.ag'` | Service base URL |
| `timeout` | `number` | `15000` | Request timeout (ms) |
| `headers` | `Record<string, string>` | `{}` | Extra HTTP headers |

---

### `Media`

Returned by `load()`. All metadata is parsed eagerly and available as **readonly properties** (synchronous).

#### Properties

| Property | Type | Description |
|---|---|---|
| `id` | `number` | Internal HDRezka post ID |
| `url` | `string` | Original URL the page was loaded from |
| `title` | `string` | Localized title |
| `origTitle` | `string \| null` | Original (non-localized) title |
| `type` | `MediaType` | `'movie' \| 'series' \| 'animation' \| 'cartoon' \| 'anime' \| 'documentary' \| 'unknown'` |
| `year` | `string \| null` | Release year |
| `thumbnail` | `string \| null` | Poster image URL |
| `description` | `string \| null` | Plot description |
| `rating` | `{ imdb: Rating \| null; kp: Rating \| null }` | IMDb and KinoPoisk scores |
| `slogan` | `string \| null` | Tagline / slogan |
| `country` | `string \| null` | Country of production |
| `quality` | `string \| null` | Video quality label (e.g. `'HDRip'`) |
| `ageRating` | `number \| null` | Age restriction as a number (e.g. `16`) |
| `duration` | `number \| null` | Runtime in minutes |
| `genres` | `string[]` | Genre names |
| `directors` | `string[]` | Director names |
| `actors` | `string[]` | Main cast names |
| `info` | `InfoRow[]` | Raw metadata table rows |
| `translations` | `Translation[]` | Available audio tracks — pass `.id` to `.streams()` |
| `seasons` | `Season[]` | Season list — empty array for movies |

#### `media.episodes(seasonId)`

```typescript
episodes(seasonId: number): Episode[]
```

Get the episode list for a season. IDs come from `media.seasons`.

```typescript
const season   = media.seasons[0];           // { id: 1, title: 'Season 1' }
const episodes = media.episodes(season.id);  // [{ id, episodeId, seasonId, title }]
```

#### `media.episode(seasonId, episodeId)`

```typescript
episode(seasonId: number, episodeId: number): EpisodeRef
```

Select a specific episode. Returns an `EpisodeRef` synchronously (no network call yet). Call `.streams()` on it to fetch HLS URLs.

```typescript
const ref     = media.episode(1, 1);
const streams = await ref.streams();     // first available translation
const streams = await ref.streams(56);   // specific translation ID
```

#### `media.streams(translationId?)`

```typescript
streams(translationId?: number): Promise<StreamUrls>
```

Fetch HLS stream URLs for a **movie or animation**. Defaults to the first translation if `translationId` is omitted.

**Throws** with a descriptive error if called on a `series` — use `.episode().streams()` for that.

```typescript
const streams = await media.streams();    // { '1080p': 'https://...', '720p': '...' }
const url4k   = streams['2160p'];
const url1080 = streams['1080p'];
```

---

### Types

```typescript
type MediaType    = 'movie' | 'series' | 'animation' | 'cartoon' | 'anime' | 'documentary' | 'unknown';
type StreamUrls   = Record<string, string>;  // quality → HLS URL
type BrowseFilter = 'last' | 'popular' | 'soon' | 'watching';

interface Rating       { score: number; votes: number; }
interface SearchResult { url: string; title: string; type: MediaType; year: string; }
interface Translation  { id: number; title: string; }
interface Season       { id: number; title: string; }
interface Episode      { id: number; episodeId: number; seasonId: number; title: string; }
interface InfoRow      { key: string; value: string; }
interface EpisodeRef   { streams(translationId?: number): Promise<StreamUrls>; }
interface BrowseItem   { id: number; url: string; title: string; poster: string; type: MediaType; info: string; }
interface BrowsePage   { items: BrowseItem[]; page: number; hasNextPage: boolean; }
interface BrowseOptions {
  type?: 'movie' | 'series' | 'cartoon' | 'anime';
  filter?: BrowseFilter;
  page?: number;
  genreUrl?: string;
}
```

---

## Full Example — Series

```typescript
import { search, load } from 'rezka.ts';

const results = await search('mr robot');
const media   = await load(results[0].url);

console.log(`${media.title} (${media.origTitle})`);       // Мистер Робот (Mr. Robot)
console.log(`IMDb: ${media.rating.imdb?.score}`);         // IMDb: 8.5
console.log(`Genres: ${media.genres.join(', ')}`);
console.log(`Directors: ${media.directors.join(', ')}`);

// Seasons & episodes
const season   = media.seasons[0];
const episodes = media.episodes(season.id);

// Stream S01E01 with the first available translation
const streams = await media.episode(season.id, episodes[0].episodeId).streams();
console.log('Qualities:', Object.keys(streams).join(', '));
console.log('1080p:', streams['1080p']);
```

---

## Full Example — Movie

```typescript
import { search, load } from 'rezka.ts';

const results = await search('inception');
const media   = await load(results[0].url);

console.log(`${media.duration} min, ${media.country}, ${media.ageRating}+`);

const streams = await media.streams();    // auto first translation
const streams = await media.streams(56); // specific translation
console.log(streams);
// { '1080p': 'https://...m3u8', '720p': '...', '4K': '...' }
```

---

## Full Example — Browse Catalog

```typescript
import { browse } from 'rezka.ts';

let page = 1;
while (true) {
  const result = await browse({ type: 'series', filter: 'popular', page });
  for (const item of result.items) {
    console.log(`[${item.id}] ${item.title}  ${item.info}`);
  }
  if (!result.hasNextPage) break;
  page++;
}
```

---

## Development

```bash
npm install
npm run build       # CJS + ESM → dist/
npm test            # 59 tests
npm run typecheck
```

### Project Structure

```
rezka.ts/
├── src/
│   ├── types.ts   # All TypeScript types and interfaces
│   ├── utils.ts   # Stream URL decoder, parser, type detector
│   ├── http.ts    # Axios client factory
│   ├── Media.ts   # Media class — metadata + stream methods
│   └── index.ts   # Public API: search(), load(), browse(), login(), createClient()
├── tests/
│   ├── utils.test.ts   # Unit tests (decoder, parser, type detection)
│   └── rezka.test.ts   # Integration tests with mocked HTTP
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## License

ISC © neverlxsss
