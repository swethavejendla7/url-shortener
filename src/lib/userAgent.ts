import { UAParser } from 'ua-parser-js';

export interface ParsedUserAgent {
  browser: string | null;
  os: string | null;
}

/** Best-effort browser/OS extraction. Unrecognized or missing UA strings yield nulls, not "Unknown". */
export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) return { browser: null, os: null };

  const result = new UAParser(userAgent).getResult();
  return {
    browser: result.browser.name ?? null,
    os: result.os.name ?? null,
  };
}

/**
 * Reduces a Referer header down to a bucket suitable for grouping: the
 * referring host, or "direct" when there is none. A full referrer URL
 * (path/query included) would fragment the breakdown into near-unique
 * buckets and isn't what "where are clicks coming from" is asking for.
 */
export function bucketReferrer(referrer: string | null): string {
  if (!referrer) return 'direct';
  try {
    return new URL(referrer).host || 'direct';
  } catch {
    return 'direct';
  }
}
