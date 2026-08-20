import { describe, expect, it } from 'vitest';
import { bucketReferrer, parseUserAgent } from '../../src/lib/userAgent.js';

const CHROME_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SAFARI_IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('parseUserAgent', () => {
  it('extracts browser and OS from a desktop Chrome UA string', () => {
    const result = parseUserAgent(CHROME_MAC_UA);
    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('Mac OS');
  });

  it('extracts browser and OS from a mobile Safari UA string', () => {
    const result = parseUserAgent(SAFARI_IOS_UA);
    expect(result.browser).toBe('Mobile Safari');
    expect(result.os).toBe('iOS');
  });

  it('returns nulls (not "Unknown") for a missing UA string', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
  });

  it('returns nulls for an unparseable UA string rather than throwing', () => {
    expect(parseUserAgent('not-a-real-user-agent')).toEqual({ browser: null, os: null });
  });
});

describe('bucketReferrer', () => {
  it('buckets a missing referrer as "direct"', () => {
    expect(bucketReferrer(null)).toBe('direct');
  });

  it('reduces a full referrer URL down to its host', () => {
    expect(bucketReferrer('https://twitter.com/some/status/123?ref=abc')).toBe('twitter.com');
  });

  it('falls back to "direct" for a malformed referrer value', () => {
    expect(bucketReferrer('not a url')).toBe('direct');
  });
});
