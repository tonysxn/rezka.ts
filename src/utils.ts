import type { StreamUrls, MediaType } from './types.js';

const TYPE_MAP: Record<string, MediaType> = {
  films: 'movie',
  series: 'series',
  animation: 'animation',
  cartoons: 'cartoon',
  anime: 'anime',
  documentary: 'documentary',
};

/**
 * Infers the media type from the HDRezka URL structure.
 * e.g. `https://rezka.ag/films/action/...` → `'movie'`
 */
export function detectMediaType(url: string): MediaType {
  const segment = url.split('/').find((_, i, arr) => arr[i - 1]?.includes('rezka'));
  return TYPE_MAP[segment ?? ''] ?? 'unknown';
}

const TRASH_CHARS = ['@', '#', '!', '^', '$'];

/**
 * Cartesian product of an array with itself, repeated `repeat` times.
 * Used to generate all possible trash-char combinations for the decoder.
 */
export function cartesianProduct(arr: string[], repeat: number): string[][] {
  const copies: string[][] = Array.from({ length: repeat }, () => [...arr]);
  return copies.reduce<string[][]>(
    (acc, val) => {
      const result: string[][] = [];
      for (const a of acc) {
        for (const b of val) {
          result.push([...a, b]);
        }
      }
      return result;
    },
    [[]]
  );
}

/**
 * Decodes the obfuscated stream URL returned by rezka.ag CDN endpoint.
 *
 * The service encodes stream URLs by:
 *   1. Prepending '#h'
 *   2. Splitting parts with '//_//'
 *   3. Inserting base64-encoded trash-character combos
 *
 * If none of that is present the whole payload is base64-encoded.
 */
export function decodeStreamUrl(data: string): string {
  let decoded = data.replace(/#h/g, '').split('//_//').join('');

  for (let len = 2; len <= 3; len++) {
    const combos = cartesianProduct(TRASH_CHARS, len);
    for (const combo of combos) {
      const encoded = Buffer.from(combo.join(''), 'utf8').toString('base64');
      if (decoded.includes(encoded)) {
        decoded = decoded.replaceAll(encoded, '');
      }
    }
  }

  if (decoded.includes('https://')) {
    return decoded;
  }

  // Fallback: the remaining string is base64-encoded
  return Buffer.from(decoded + '==', 'base64').toString('utf8');
}

/**
 * Parses the quality→URL map from a rezka stream string.
 *
 * Format example:
 *   "[360p] https://cdn.example.com/360.mp4:hls:manifest.m3u8 or https://...,[720p] ..."
 */
export function parseStreamUrls(text: string): StreamUrls {
  const urls: StreamUrls = {};

  for (const part of text.split(',')) {
    const bracketClose = part.indexOf(']');
    if (bracketClose === -1) continue;

    const quality = part
      .substring(0, bracketClose + 1)
      .replace('[', '')
      .replace(']', '')
      .replace(/<[^>]*>/g, '')
      .trim();

    const segments = part.trim().split(' ');
    const url = segments[segments.length - 1].trim();

    if (quality && url.startsWith('http')) {
      urls[quality] = url;
    }
  }

  return urls;
}
