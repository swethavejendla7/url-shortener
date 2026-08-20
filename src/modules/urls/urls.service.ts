import { ConflictError, GoneError, NotFoundError, ServiceUnavailableError } from '../../lib/errors.js';
import { TtlCache } from '../../lib/cache.js';
import { config } from '../../config.js';
import { bucketReferrer, parseUserAgent } from '../../lib/userAgent.js';
import { generateShortCode } from './shortCode.js';
import { ShortCodeTakenError, UrlsRepository, type ClickBreakdown, type UrlRecord } from './urls.repository.js';

const MAX_GENERATION_ATTEMPTS = 5;

export interface CreateUrlParams {
  longUrl: string;
  customAlias?: string;
  expiresInDays?: number;
}

export interface UrlView {
  shortCode: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

export interface UrlListItem extends UrlView {
  totalClicks: number;
}

export interface AnalyticsView {
  shortCode: string;
  totalClicks: number;
  createdAt: string;
  lastClickedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  breakdown: ClickBreakdown;
}

function toView(record: UrlRecord): UrlView {
  return {
    shortCode: record.short_code,
    shortUrl: `${config.baseUrl}/${record.short_code}`,
    longUrl: record.long_url,
    createdAt: record.created_at,
    expiresAt: record.expires_at,
    isActive: record.is_active === 1,
  };
}

function isExpired(record: UrlRecord): boolean {
  return record.expires_at !== null && new Date(record.expires_at).getTime() < Date.now();
}

export class UrlsService {
  private readonly redirectCache: TtlCache<string, UrlRecord>;

  constructor(private readonly repo: UrlsRepository = new UrlsRepository()) {
    this.redirectCache = new TtlCache<string, UrlRecord>(config.cache.ttlMs, config.cache.maxEntries);
  }

  create(params: CreateUrlParams): UrlView {
    const expiresAt = params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    if (params.customAlias) {
      try {
        const record = this.repo.create({
          shortCode: params.customAlias,
          longUrl: params.longUrl,
          isCustomAlias: true,
          expiresAt,
        });
        return toView(record);
      } catch (err) {
        if (err instanceof ShortCodeTakenError) {
          throw new ConflictError(`alias "${params.customAlias}" is already taken`);
        }
        throw err;
      }
    }

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const shortCode = generateShortCode();
      try {
        const record = this.repo.create({
          shortCode,
          longUrl: params.longUrl,
          isCustomAlias: false,
          expiresAt,
        });
        return toView(record);
      } catch (err) {
        if (err instanceof ShortCodeTakenError) continue;
        throw err;
      }
    }

    throw new ServiceUnavailableError('could not generate a unique short code, please retry');
  }

  listAll(): UrlListItem[] {
    return this.repo.findAllWithClickCounts().map((record) => ({
      ...toView(record),
      totalClicks: record.click_count,
    }));
  }

  getMetadata(shortCode: string): UrlView {
    const record = this.repo.findByShortCode(shortCode);
    if (!record) throw new NotFoundError(`no URL found for code "${shortCode}"`);
    return toView(record);
  }

  /** Resolves a short code to its target for redirect purposes, using the hot-path cache. */
  resolveForRedirect(shortCode: string): UrlRecord {
    const cached = this.redirectCache.get(shortCode);
    const record = cached ?? this.repo.findByShortCode(shortCode);

    if (!record) throw new NotFoundError(`no URL found for code "${shortCode}"`);
    if (!cached) this.redirectCache.set(shortCode, record);

    if (record.is_active !== 1) throw new GoneError('this link has been deactivated');
    if (isExpired(record)) throw new GoneError('this link has expired');

    return record;
  }

  recordClick(shortCode: string, referrer: string | null, userAgent: string | null): void {
    const { browser, os } = parseUserAgent(userAgent);
    this.repo.recordClick(shortCode, {
      referrerBucket: bucketReferrer(referrer),
      userAgent,
      browser,
      os,
    });
  }

  delete(shortCode: string): void {
    const deleted = this.repo.softDelete(shortCode);
    if (!deleted) throw new NotFoundError(`no active URL found for code "${shortCode}"`);
    this.redirectCache.delete(shortCode);
  }

  getAnalytics(shortCode: string): AnalyticsView {
    const record = this.repo.findByShortCode(shortCode);
    if (!record) throw new NotFoundError(`no URL found for code "${shortCode}"`);

    return {
      shortCode: record.short_code,
      totalClicks: this.repo.countClicks(shortCode),
      createdAt: record.created_at,
      lastClickedAt: this.repo.lastClickedAt(shortCode),
      expiresAt: record.expires_at,
      isActive: record.is_active === 1,
      breakdown: this.repo.clickBreakdown(shortCode),
    };
  }
}
