import { describe, it, expect } from 'vitest';
import { cartesianProduct, decodeStreamUrl, parseStreamUrls } from '../src/utils.js';

// ─── cartesianProduct ────────────────────────────────────────────────────────

describe('cartesianProduct', () => {
  it('generates all pairs for repeat=2', () => {
    const result = cartesianProduct(['a', 'b'], 2);
    expect(result).toEqual([
      ['a', 'a'],
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'b'],
    ]);
  });

  it('generates triples for repeat=3 with single element', () => {
    const result = cartesianProduct(['x'], 3);
    expect(result).toEqual([['x', 'x', 'x']]);
  });

  it('returns [[]] for repeat=0', () => {
    const result = cartesianProduct(['a', 'b'], 0);
    expect(result).toEqual([[]]);
  });

  it('product count is arr.length ^ repeat', () => {
    const result = cartesianProduct(['@', '#', '!'], 2);
    expect(result).toHaveLength(9); // 3^2
  });
});

// ─── parseStreamUrls ─────────────────────────────────────────────────────────

describe('parseStreamUrls', () => {
  it('parses a single quality-url pair', () => {
    const input = '[360p] https://cdn.example.com/360.m3u8';
    const result = parseStreamUrls(input);
    expect(result['360p']).toBe('https://cdn.example.com/360.m3u8');
  });

  it('parses multiple comma-separated pairs', () => {
    const input =
      '[360p] https://cdn.example.com/360.m3u8,[720p] https://cdn.example.com/720.m3u8,[1080p] https://cdn.example.com/1080.m3u8';
    const result = parseStreamUrls(input);
    expect(Object.keys(result)).toHaveLength(3);
    expect(result['720p']).toBe('https://cdn.example.com/720.m3u8');
    expect(result['1080p']).toBe('https://cdn.example.com/1080.m3u8');
  });

  it('strips HTML tags from quality label', () => {
    const input = '[<b>1080p</b>] https://cdn.example.com/1080.m3u8';
    const result = parseStreamUrls(input);
    expect(result['1080p']).toBeDefined();
    expect(result['1080p']).toBe('https://cdn.example.com/1080.m3u8');
  });

  it('ignores entries without a valid URL', () => {
    const input = '[360p] ,,[720p] https://cdn.example.com/720.m3u8';
    const result = parseStreamUrls(input);
    expect(result['360p']).toBeUndefined();
    expect(result['720p']).toBeDefined();
  });

  it('returns empty object for empty string', () => {
    expect(parseStreamUrls('')).toEqual({});
  });
});

// ─── decodeStreamUrl ─────────────────────────────────────────────────────────

describe('decodeStreamUrl', () => {
  it('returns URL unchanged when it already contains https://', () => {
    const url = '[1080p] https://cdn.example.com/video.m3u8';
    expect(decodeStreamUrl(url)).toContain('https://cdn.example.com/video.m3u8');
  });

  it('strips #h prefix', () => {
    const url = '#h[720p] https://cdn.example.com/720.m3u8';
    const result = decodeStreamUrl(url);
    expect(result).not.toContain('#h');
    expect(result).toContain('https://');
  });

  it('removes //_// separators', () => {
    const url = '[360p] https://cdn.example.com/360.m3u8//_//[720p] https://cdn.example.com/720.m3u8';
    const result = decodeStreamUrl(url);
    expect(result).not.toContain('//_//');
    expect(result).toContain('https://');
  });

  it('base64-decodes a properly padded payload', () => {
    const originalText = '[1080p] https://cdn.example.com/video.m3u8';
    // Build a payload that does NOT contain https:// before decoding
    // (simulate: encode the plain text to base64, then strip padding)
    const encoded = Buffer.from(originalText).toString('base64').replace(/=+$/, '');
    const result = decodeStreamUrl(encoded);
    expect(result).toContain('https://cdn.example.com/video.m3u8');
  });
});
