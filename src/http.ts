import axios, { type AxiosInstance } from 'axios';
import type { RezkaOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://rezka.ag';
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function createHttpClient(options: RezkaOptions = {}): AxiosInstance {
  return axios.create({
    baseURL: options.baseUrl ?? DEFAULT_BASE_URL,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers,
    },
  });
}
