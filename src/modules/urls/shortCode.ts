import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 7;

/**
 * Generates a random base62 short code. Uses rejection sampling on random
 * bytes so every character of the alphabet has equal probability (a naive
 * `byte % 62` would bias low values since 256 isn't a multiple of 62).
 */
export function generateShortCode(length = DEFAULT_LENGTH): string {
  const chars: string[] = [];
  // Oversample: with 62/256 acceptance odds we occasionally need extra bytes
  // beyond `length`, but never more than a small multiple in practice.
  while (chars.length < length) {
    const bytes = randomBytes(length * 2);
    for (const byte of bytes) {
      if (chars.length >= length) break;
      if (byte < 248) {
        // 248 = 4 * 62, the largest multiple of 62 that fits in a byte.
        chars.push(ALPHABET[byte % 62] as string);
      }
    }
  }
  return chars.join('');
}

const RESERVED_PATHS = new Set(['api', 'health', 'favicon.ico', 'index.html']);
const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

export function isValidAlias(alias: string): boolean {
  return ALIAS_PATTERN.test(alias) && !RESERVED_PATHS.has(alias.toLowerCase());
}
