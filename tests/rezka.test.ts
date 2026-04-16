import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { search, load, createClient, browse } from '../src/index.js';
import { Media } from '../src/Media.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SEARCH_HTML = `
<ul>
  <li>
    <a href="https://rezka.ag/series/drama/12345-mr-robot.html">
      <span class="enty" data-type="serial">Мистер Робот</span>
    </a>
  </li>
  <li>
    <a href="https://rezka.ag/films/action/99999-another.html">
      <span class="enty" data-type="film">Another Movie</span>
    </a>
  </li>
</ul>
`.trim();

const PAGE_HTML = `
<html><body>
  <div id="user-favorites-holder" data-post_id="12345"></div>
  <div class="b-post__title">Мистер Робот</div>
  <div class="b-post__origtitle">Mr. Robot</div>
  <div class="b-post__description_text">A cyber-security engineer by day...</div>
  <div class="b-post__infolast">4 сезона</div>
  <div class="b-sidecover"><img src="https://example.com/poster.jpg"/></div>
  <span class="b-post__info_rates imdb" title="IMDb"><b class="bold">8.5</b> (1,234,567)</span>
  <span class="b-post__info_rates kp" title="КиноПоиск"><b class="bold">8.2</b> (345,678)</span>
  <table class="b-post__info">
    <tr><td><h2>Жанр</h2></td><td><a href="/genre/drama/">Драма</a>, <a href="/genre/thriller/">Триллер</a></td></tr>
    <tr><td><h2>Страна</h2></td><td>США</td></tr>
    <tr><td><h2>Слоган</h2></td><td>«Test slogan»</td></tr>
    <tr><td><h2>В качестве</h2></td><td>HDRip</td></tr>
    <tr><td><h2>Возраст</h2></td><td>16+</td></tr>
    <tr><td><h2>Время</h2></td><td>148 мин.</td></tr>
  </table>
  <span itemprop="director" itemscope="">
    <a href="/person/1/"><span itemprop="name">Sam Esmail</span></a>
  </span>
  <span itemprop="actor" itemscope="">
    <a href="/person/2/"><span itemprop="name">Rami Malek</span></a>
  </span>
  <span itemprop="actor" itemscope="">
    <a href="/person/3/"><span itemprop="name">Christian Slater</span></a>
  </span>
  <ul id="translators-list">
    <li data-translator_id="56" title="English">English</li>
    <li data-translator_id="238" title="Русский">Русский</li>
  </ul>
  <ul id="simple-seasons-tabs">
    <li data-tab_id="1">Сезон 1</li>
    <li data-tab_id="2">Сезон 2</li>
  </ul>
  <ul id="simple-episodes-list-1">
    <li data-id="12345" data-episode_id="1">Серия 1</li>
    <li data-id="12345" data-episode_id="2">Серия 2</li>
    <li data-id="12345" data-episode_id="3">Серия 3</li>
  </ul>
  <ul id="simple-episodes-list-2">
    <li data-id="12345" data-episode_id="1">Серия 1</li>
  </ul>
</body></html>
`.trim();

const STREAM_URL = '[1080p] https://cdn.example.com/1080.m3u8,[720p] https://cdn.example.com/720.m3u8';
const CDN_RESPONSE = { success: true, url: STREAM_URL };

const MOVIE_URL  = 'https://rezka.ag/films/action/99999-inception.html';
const SERIES_URL = 'https://rezka.ag/series/drama/12345-mr-robot.html';
const BASE       = 'https://rezka.ag';

// Minimal movie HTML fixture (no seasons/episodes)
const MOVIE_HTML = PAGE_HTML.replace(/<ul id="simple-seasons-tabs">[\s\S]*?<\/ul>/, '')
                             .replace(/<ul id="simple-episodes-list-[\s\S]*?<\/ul>/g, '');

// ─── Test helper ─────────────────────────────────────────────────────────────

function makeClient() {
  const instance = axios.create({ baseURL: BASE });
  const mock = new MockAdapter(instance);
  const client = createClient({ _http: instance });
  return { client, mock, instance };
}

// ─── search() ────────────────────────────────────────────────────────────────

describe('search()', () => {
  let mock: MockAdapter;
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    ({ client, mock } = makeClient());
    mock.onPost(`${BASE}/engine/ajax/search.php`).reply(200, SEARCH_HTML);
  });

  afterEach(() => mock.reset());

  it('returns an array of SearchResult', async () => {
    const results = await client.search('mr robot');
    expect(results).toHaveLength(2);
  });

  it('maps url and title correctly', async () => {
    const results = await client.search('mr robot');
    expect(results[0].url).toBe(SERIES_URL);
    expect(results[0].title).toBe('Мистер Робот');
  });

  it('infers type from URL path (series → series)', async () => {
    const results = await client.search('mr robot');
    expect(results[0].type).toBe('series');
    expect(results[1].type).toBe('movie');
  });

  it('throws on empty query', async () => {
    await expect(client.search('')).rejects.toThrow('empty');
    await expect(client.search('   ')).rejects.toThrow('empty');
  });

  it('filters results that have no URL', async () => {
    mock.onPost(`${BASE}/engine/ajax/search.php`).reply(200, '<ul><li><span class="enty">No link</span></li></ul>');
    const results = await client.search('nothing');
    expect(results).toHaveLength(0);
  });
});

// ─── load() ──────────────────────────────────────────────────────────────────

describe('load()', () => {
  let mock: MockAdapter;
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    ({ client, mock } = makeClient());
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
  });

  afterEach(() => mock.reset());

  it('returns a Media instance', async () => {
    const media = await client.load(SERIES_URL);
    expect(media).toBeInstanceOf(Media);
  });

  it('throws on empty URL', async () => {
    await expect(client.load('')).rejects.toThrow('empty');
    await expect(client.load('   ')).rejects.toThrow('empty');
  });

  it('exposes the source URL', async () => {
    const media = await client.load(SERIES_URL);
    expect(media.url).toBe(SERIES_URL);
  });
});

// ─── Media metadata ───────────────────────────────────────────────────────────

describe('Media metadata', () => {
  let media: Media;

  beforeEach(async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
    media = await client.load(SERIES_URL);
  });

  it('parses id as a number', () => {
    expect(media.id).toBe(12345);
    expect(typeof media.id).toBe('number');
  });

  it('parses title', () => {
    expect(media.title).toBe('Мистер Робот');
  });

  it('parses origTitle', () => {
    expect(media.origTitle).toBe('Mr. Robot');
  });

  it('parses description', () => {
    expect(media.description).toContain('cyber-security');
  });

  it('parses thumbnail', () => {
    expect(media.thumbnail).toBe('https://example.com/poster.jpg');
  });

  it('infers type from URL as series', () => {
    expect(media.type).toBe('series');
  });

  it('parses info table rows', () => {
    expect(media.info.length).toBeGreaterThanOrEqual(2);
    expect(media.info[0].key).toBe('Жанр');
    expect(media.info[1].key).toBe('Страна');
  });

  it('parses translations with numeric IDs', () => {
    expect(media.translations).toHaveLength(2);
    expect(media.translations[0]).toEqual({ id: 56, title: 'English' });
    expect(media.translations[1]).toEqual({ id: 238, title: 'Русский' });
    expect(typeof media.translations[0].id).toBe('number');
  });

  it('parses seasons with numeric IDs', () => {
    expect(media.seasons).toHaveLength(2);
    expect(media.seasons[0]).toEqual({ id: 1, title: 'Сезон 1' });
    expect(typeof media.seasons[0].id).toBe('number');
  });

  it('returns [] for seasons on a page with no season tabs', async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, '<html><div id="user-favorites-holder" data-post_id="1"></div></html>');
    const empty = await client.load(SERIES_URL);
    expect(empty.seasons).toEqual([]);
  });
});

// ─── Media rich metadata ────────────────────────────────────────────────────

describe('Media rich metadata', () => {
  let media: Media;

  beforeEach(async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
    media = await client.load(SERIES_URL);
  });

  it('parses IMDb rating', () => {
    expect(media.rating.imdb).not.toBeNull();
    expect(media.rating.imdb!.score).toBe(8.5);
    expect(media.rating.imdb!.votes).toBe(1234567);
  });

  it('parses KP rating', () => {
    expect(media.rating.kp).not.toBeNull();
    expect(media.rating.kp!.score).toBe(8.2);
    expect(media.rating.kp!.votes).toBe(345678);
  });

  it('returns null ratings when absent', async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, '<html><div id="user-favorites-holder" data-post_id="1"></div></html>');
    const empty = await client.load(SERIES_URL);
    expect(empty.rating.imdb).toBeNull();
    expect(empty.rating.kp).toBeNull();
  });

  it('parses slogan (strips guillemots)', () => {
    expect(media.slogan).toBe('Test slogan');
  });

  it('parses country', () => {
    expect(media.country).toBe('США');
  });

  it('parses quality', () => {
    expect(media.quality).toBe('HDRip');
  });

  it('parses ageRating as number', () => {
    expect(media.ageRating).toBe(16);
    expect(typeof media.ageRating).toBe('number');
  });

  it('parses duration as number', () => {
    expect(media.duration).toBe(148);
    expect(typeof media.duration).toBe('number');
  });

  it('parses genres from info table links', () => {
    expect(media.genres).toEqual(['Драма', 'Триллер']);
  });

  it('parses directors via itemprop', () => {
    expect(media.directors).toEqual(['Sam Esmail']);
  });

  it('parses actors via itemprop', () => {
    expect(media.actors).toHaveLength(2);
    expect(media.actors[0]).toBe('Rami Malek');
    expect(media.actors[1]).toBe('Christian Slater');
  });
});

// ─── browse() ────────────────────────────────────────────────────────────────

const BROWSE_HTML = `
<html><body>
  <div class="b-content__inline_item" data-id="100" data-url="https://rezka.ag/films/action/100-matrix.html">
    <div class="b-content__inline_item-cover">
      <a href="/films/action/100-matrix.html"><img src="https://img.example.com/matrix.jpg" /></a>
    </div>
    <div class="b-content__inline_item-body">
      <div class="b-content__inline_item-link"><a href="/films/action/100-matrix.html">The Matrix</a></div>
      <div class="b-content__inline_item-info">США, 1999 / Боевик</div>
    </div>
  </div>
  <div class="b-content__inline_item" data-id="200" data-url="https://rezka.ag/films/drama/200-inception.html">
    <div class="b-content__inline_item-cover">
      <a href="/films/drama/200-inception.html"><img src="https://img.example.com/inception.jpg" /></a>
    </div>
    <div class="b-content__inline_item-body">
      <div class="b-content__inline_item-link"><a href="/films/drama/200-inception.html">Inception</a></div>
      <div class="b-content__inline_item-info">США, 2010 / Триллер</div>
    </div>
  </div>
  <div class="b-navigation">
    <a class="b-navigation__next" href="/films/page/2/">→</a>
  </div>
</body></html>
`.trim();

describe('browse()', () => {
  let mock: MockAdapter;
  let instance: ReturnType<typeof axios.create>;

  beforeEach(() => {
    ({ mock, instance } = makeClient());
  });

  afterEach(() => mock.reset());

  it('returns BrowsePage with items array', async () => {
    mock.onGet(`${BASE}/films/`).reply(200, BROWSE_HTML);
    const page = await browse({ type: 'movie' }, { _http: instance });
    expect(page.items).toHaveLength(2);
    expect(page.page).toBe(1);
  });

  it('maps item id, url and title correctly', async () => {
    mock.onGet(`${BASE}/films/`).reply(200, BROWSE_HTML);
    const page = await browse({ type: 'movie' }, { _http: instance });
    expect(page.items[0].id).toBe(100);
    expect(page.items[0].url).toBe('https://rezka.ag/films/action/100-matrix.html');
    expect(page.items[0].title).toBe('The Matrix');
    expect(page.items[0].type).toBe('movie');
  });

  it('detects hasNextPage = true when next button exists', async () => {
    mock.onGet(`${BASE}/films/`).reply(200, BROWSE_HTML);
    const page = await browse({ type: 'movie' }, { _http: instance });
    expect(page.hasNextPage).toBe(true);
  });

  it('detects hasNextPage = false when no next button', async () => {
    const noNextHtml = BROWSE_HTML.replace('<a class="b-navigation__next"', '<span class="b-navigation__next"').replace('</a>', '</span>');
    mock.onGet(`${BASE}/films/`).reply(200, noNextHtml);
    const page = await browse({ type: 'movie' }, { _http: instance });
    expect(page.hasNextPage).toBe(false);
  });

  it('uses filter query param', async () => {
    mock.onGet(`${BASE}/films/?filter=popular`).reply(200, BROWSE_HTML);
    const page = await browse({ type: 'movie', filter: 'popular' }, { _http: instance });
    expect(page.items).toHaveLength(2);
  });

  it('uses page/N/ path for pages > 1', async () => {
    mock.onGet(`${BASE}/films/page/2/`).reply(200, BROWSE_HTML);
    const page = await browse({ type: 'movie', page: 2 }, { _http: instance });
    expect(page.page).toBe(2);
    expect(page.items).toHaveLength(2);
  });
});

// ─── Media.episodes() ────────────────────────────────────────────────────────

describe('Media.episodes()', () => {
  let media: Media;

  beforeEach(async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
    media = await client.load(SERIES_URL);
  });

  it('returns episodes for a given season ID', () => {
    expect(media.episodes(1)).toHaveLength(3);
  });

  it('maps episodeId as a number', () => {
    const eps = media.episodes(1);
    expect(eps[0].episodeId).toBe(1);
    expect(eps[2].episodeId).toBe(3);
    expect(typeof eps[0].episodeId).toBe('number');
  });

  it('includes seasonId on each episode', () => {
    const eps = media.episodes(1);
    expect(eps[0].seasonId).toBe(1);
  });

  it('returns [] for non-existent season', () => {
    expect(media.episodes(99)).toEqual([]);
  });

  it('season 2 has 1 episode', () => {
    expect(media.episodes(2)).toHaveLength(1);
  });
});

// ─── Media.episode().streams() ───────────────────────────────────────────────

describe('Media.episode().streams()', () => {
  let media: Media;
  let mock: MockAdapter;

  beforeEach(async () => {
    const { client, mock: m } = makeClient();
    mock = m;
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
    media = await client.load(SERIES_URL);
  });

  afterEach(() => mock.reset());

  it('returns StreamUrls with correct quality keys', async () => {
    mock.onPost(`${BASE}/ajax/get_cdn_series/`).reply(200, CDN_RESPONSE);
    const streams = await media.episode(1, 1).streams();
    expect(streams).toHaveProperty('1080p');
    expect(streams).toHaveProperty('720p');
    expect(streams['1080p']).toBe('https://cdn.example.com/1080.m3u8');
  });

  it('accepts an explicit translationId', async () => {
    mock.onPost(`${BASE}/ajax/get_cdn_series/`).reply(200, CDN_RESPONSE);
    const streams = await media.episode(1, 1).streams(56);
    expect(streams['720p']).toBe('https://cdn.example.com/720.m3u8');
  });

  it('throws when CDN response has no url field', async () => {
    mock.onPost(`${BASE}/ajax/get_cdn_series/`).reply(200, { success: false, message: 'Not found' });
    await expect(media.episode(1, 1).streams()).rejects.toThrow();
  });
});

// ─── Media.streams() for movies ──────────────────────────────────────────────

describe('Media.streams() — movie', () => {
  let media: Media;
  let mock: MockAdapter;

  beforeEach(async () => {
    const { client, mock: m } = makeClient();
    mock = m;
    mock.onGet(MOVIE_URL).reply(200, MOVIE_HTML);
    media = await client.load(MOVIE_URL);
  });

  afterEach(() => mock.reset());

  it('returns StreamUrls for a movie', async () => {
    mock.onPost(`${BASE}/ajax/get_cdn_series/`).reply(200, CDN_RESPONSE);
    const streams = await media.streams();
    expect(streams['1080p']).toBe('https://cdn.example.com/1080.m3u8');
    expect(streams['720p']).toBe('https://cdn.example.com/720.m3u8');
  });

  it('accepts an explicit translationId', async () => {
    mock.onPost(`${BASE}/ajax/get_cdn_series/`).reply(200, CDN_RESPONSE);
    const streams = await media.streams(56);
    expect(streams['1080p']).toBeDefined();
  });
});

// ─── Media.streams() guard for series ────────────────────────────────────────

describe('Media.streams() — guard on series', () => {
  it('throws a helpful error when called on a series', async () => {
    const { client, mock } = makeClient();
    mock.onGet(SERIES_URL).reply(200, PAGE_HTML);
    const media = await client.load(SERIES_URL);
    await expect(media.streams()).rejects.toThrow(/episode/);
  });
});
