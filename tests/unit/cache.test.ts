import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../src/lib/cache.js';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a stored value before it expires', () => {
    const cache = new TtlCache<string, number>(1000, 10);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('expires a value once the TTL has elapsed', () => {
    const cache = new TtlCache<string, number>(1000, 10);
    cache.set('a', 1);
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least-recently-used entry once maxEntries is exceeded', () => {
    const cache = new TtlCache<string, number>(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    // Touch 'a' so 'b' becomes the least-recently-used entry.
    cache.get('a');
    cache.set('c', 3);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('removes a value on delete', () => {
    const cache = new TtlCache<string, number>(60_000, 10);
    cache.set('a', 1);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
  });
});
