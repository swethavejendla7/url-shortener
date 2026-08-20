import type Database from 'better-sqlite3';
import { getDb } from '../../db/connection.js';

export interface UrlRecord {
  id: number;
  short_code: string;
  long_url: string;
  custom_alias: 0 | 1;
  is_active: 0 | 1;
  created_at: string;
  expires_at: string | null;
}

export interface NewUrl {
  shortCode: string;
  longUrl: string;
  isCustomAlias: boolean;
  expiresAt: string | null;
}

export class ShortCodeTakenError extends Error {
  constructor(shortCode: string) {
    super(`short code already exists: ${shortCode}`);
    this.name = 'ShortCodeTakenError';
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

export class UrlsRepository {
  constructor(private readonly db: Database.Database = getDb()) {}

  /**
   * Claims a short code atomically: attempt the INSERT directly and let
   * SQLite's UNIQUE constraint be the single source of truth on availability,
   * rather than checking with a separate SELECT first. A check-then-insert
   * two-step is only safe when nothing else can run between the two steps;
   * that holds for concurrent requests within this one Node process (JS run-
   * to-completion means two requests' synchronous code can't interleave) but
   * not across multiple instances of this service sharing the same SQLite
   * file, which is exactly the kind of assumption that quietly breaks the
   * first time this service is scaled horizontally. See
   * docs/scenarios/02-brownfield.md for the full analysis and a reproduction.
   */
  create(input: NewUrl): UrlRecord {
    const createdAt = new Date().toISOString();

    try {
      const result = this.db
        .prepare(
          `INSERT INTO urls (short_code, long_url, custom_alias, is_active, created_at, expires_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(input.shortCode, input.longUrl, input.isCustomAlias ? 1 : 0, createdAt, input.expiresAt);

      return this.findById(result.lastInsertRowid as number)!;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ShortCodeTakenError(input.shortCode);
      }
      throw err;
    }
  }

  findById(id: number): UrlRecord | undefined {
    return this.db.prepare('SELECT * FROM urls WHERE id = ?').get(id) as UrlRecord | undefined;
  }

  findByShortCode(shortCode: string): UrlRecord | undefined {
    return this.db.prepare('SELECT * FROM urls WHERE short_code = ?').get(shortCode) as
      | UrlRecord
      | undefined;
  }

  /**
   * All URLs ever created, newest first, with a per-link click count attached
   * via a LEFT JOIN (so links with zero clicks still appear, with count 0).
   * Deleted (is_active = 0) links are included, not filtered out — same
   * "history stays queryable after deletion" reasoning as the analytics
   * endpoint. Capped at `limit`: this is a prototype-scale listing with no
   * pagination, documented as a known limitation rather than silently
   * assumed to scale to an unbounded link count.
   */
  findAllWithClickCounts(limit = 100): UrlWithClickCount[] {
    return this.db
      .prepare(
        `SELECT u.*, COUNT(c.id) as click_count
         FROM urls u
         LEFT JOIN clicks c ON c.short_code = u.short_code
         GROUP BY u.id
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ?`,
      )
      .all(limit) as UrlWithClickCount[];
  }

  softDelete(shortCode: string): boolean {
    const result = this.db
      .prepare('UPDATE urls SET is_active = 0 WHERE short_code = ? AND is_active = 1')
      .run(shortCode);
    return result.changes > 0;
  }

  recordClick(shortCode: string, click: ClickMetadata): void {
    this.db
      .prepare(
        `INSERT INTO clicks (short_code, clicked_at, referrer, user_agent, browser, os)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        shortCode,
        new Date().toISOString(),
        click.referrerBucket,
        click.userAgent,
        click.browser,
        click.os,
      );
  }

  countClicks(shortCode: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM clicks WHERE short_code = ?')
      .get(shortCode) as { count: number };
    return row.count;
  }

  lastClickedAt(shortCode: string): string | null {
    const row = this.db
      .prepare('SELECT clicked_at FROM clicks WHERE short_code = ? ORDER BY clicked_at DESC LIMIT 1')
      .get(shortCode) as { clicked_at: string } | undefined;
    return row?.clicked_at ?? null;
  }

  private breakdown(shortCode: string, column: 'referrer' | 'browser' | 'os'): BreakdownEntry[] {
    return this.db
      .prepare(
        `SELECT COALESCE(${column}, 'unknown') as label, COUNT(*) as count
         FROM clicks WHERE short_code = ?
         GROUP BY label ORDER BY count DESC LIMIT 10`,
      )
      .all(shortCode) as BreakdownEntry[];
  }

  clickBreakdown(shortCode: string): ClickBreakdown {
    return {
      byReferrer: this.breakdown(shortCode, 'referrer'),
      byBrowser: this.breakdown(shortCode, 'browser'),
      byOs: this.breakdown(shortCode, 'os'),
    };
  }
}

export interface ClickMetadata {
  referrerBucket: string;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
}

export interface BreakdownEntry {
  label: string;
  count: number;
}

export interface ClickBreakdown {
  byReferrer: BreakdownEntry[];
  byBrowser: BreakdownEntry[];
  byOs: BreakdownEntry[];
}

export type UrlWithClickCount = UrlRecord & { click_count: number };
