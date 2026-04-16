# rezka-api

> Unofficial TypeScript API wrapper for the [HDRezka](https://rezka.ag) streaming service.

## Features

- **No boilerplate** — top-level `search()` and `load()` functions, no class instantiation required
- **Unified stream API** — one `.streams()` call for movies; fluent `.episode(s, e).streams()` for series
- **Consistent types** — all IDs are `number`, `type` is a proper union, not `string`
- **Smart defaults** — omit `translationId` to auto-use the first available track
- **TypeScript-first** — full type definitions, zero `any`
- **Dual CJS / ESM** — works in any Node.js project (CommonJS or ESM)

---

## Installation

```bash
npm install rezka-api
# or
yarn add rezka-api
# or
pnpm add rezka-api
```

**Requires Node.js ≥ 18.**

---

## Quick Start

```typescript
import { search, load } from 'rezka-api';
// or: import rezka from 'rezka-api';  then rezka.search(...) / rezka.load(...)

// 1. Search
const results = await search('mr robot');
console.log(results[0]);
// { url: 'https://rezka.ag/series/...', title: 'Мистер Робот', type: 'series', year: '' }

// 2. Load media page — all metadata available synchronously
const media = await load(results[0].url);
console.log(media.title);        // "Мистер Робот"
console.log(media.origTitle);    // "Mr. Robot"
console.log(media.type);         // "series"
console.log(media.translations); // [{ id: 56, title: 'English' }, ...]

// 3a. Movie — get streams directly
const streams = await media.streams();       // uses first translation
const streams = await media.streams(56);    // or pick a specific one
console.log(streams);  // { '1080p': 'https://...m3u8', '720p': '...', ... }

// 3b. Series — fluent episode selector
const streams = await media.episode(1, 1).streams();     // S01E01, default translation
const streams = await media.episode(1, 3).streams(56);   // S01E03, English
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

### `createClient(options)`

For cases where you need a **custom mirror, timeout, or shared configuration**. Returns an object with the same `search` and `load` methods bound to that config.

```typescript
import { createClient } from 'rezka-api';

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
| `year` | `string \| null` | Release year (from the metadata table) |
| `thumbnail` | `string \| null` | Poster image URL |
| `description` | `string \| null` | Plot description |
| `info` | `InfoRow[]` | Structured metadata table (genre, country, director, cast…) |
| `translations` | `Translation[]` | Available audio tracks — pass `.id` to `.streams()` |
| `seasons` | `Season[]` | Season list — empty array for movies |

#### `media.episodes(seasonId)`

```typescript
episodes(seasonId: number): Episode[]
```

Get the episode list for a season. IDs come from `media.seasons`.

```typescript
const season   = media.seasons[0];          // { id: 1, title: 'Season 1' }
const episodes = media.episodes(season.id);  // [{ id, episodeId, seasonId, title }]
```

#### `media.episode(seasonId, episodeId)`

```typescript
episode(seasonId: number, episodeId: number): EpisodeRef
```

Select a specific episode. Returns an `EpisodeRef` synchronously (no network call yet). Call `.streams()` on it to fetch HLS URLs.

```typescript
const ref     = media.episode(1, 1);
const streams = await ref.streams();       // first available translation
const streams = await ref.streams(56);     // specific translation ID
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
type MediaType = 'movie' | 'series' | 'animation' | 'cartoon' | 'anime' | 'documentary' | 'unknown';
type StreamUrls = Record<string, string>;  // quality → HLS URL

interface SearchResult { url: string; title: string; type: MediaType; year: string; }
interface Translation  { id: number; title: string; }
interface Season       { id: number; title: string; }
interface Episode      { id: number; episodeId: number; seasonId: number; title: string; }
interface InfoRow      { key: string; value: string; }
interface EpisodeRef   { streams(translationId?: number): Promise<StreamUrls>; }
```

---

## Full Example — Browse and Stream a Series

```typescript
import { search, load } from 'rezka-api';

const results = await search('mr robot');
const media   = await load(results[0].url);

console.log(`${media.title} (${media.origTitle})`);  // Мистер Робот (Mr. Robot)
console.log(`Type: ${media.type}`);                  // series
console.log(`Year: ${media.year}`);

// Translations
media.translations.forEach(t => console.log(`[${t.id}] ${t.title}`));
// [56] English
// [238] Русский

// Seasons & episodes
const season   = media.seasons[0];
const episodes = media.episodes(season.id);
console.log(`${season.title}: ${episodes.length} episodes`);

// Stream S01E01 with the first available translation
const streams = await media.episode(season.id, episodes[0].episodeId).streams();
console.log('Qualities:', Object.keys(streams).join(', '));
console.log('1080p:', streams['1080p']);
```

---

## Full Example — Stream a Movie

```typescript
import { search, load } from 'rezka-api';

const results = await search('inception');
const media   = await load(results[0].url);

// Get all qualities, auto-pick first translation
const streams = await media.streams();
console.log(streams);
// { '1080p': 'https://...m3u8', '720p': '...', '480p': '...' }

// Pick a specific translation
const streams = await media.streams(56);
```

---

## Development

```bash
# Install dependencies
npm install

# Build (CJS + ESM → dist/)
npm run build

# Run tests
npm test

# Watch mode
npm run test:watch

# Type-check
npm run typecheck
```

### Project Structure

```
rezka-api/
├── src/
│   ├── types.ts        # All TypeScript types and interfaces
│   ├── utils.ts        # Stream URL decoder, parser, type detector
│   ├── http.ts         # Axios client factory
│   ├── Media.ts        # Media class — metadata + stream methods
│   └── index.ts        # Public API: search(), load(), createClient()
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
