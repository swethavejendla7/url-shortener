import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { freshApp } from './testApp.js';
import { getDb } from '../../src/db/connection.js';

let app: Express;

beforeEach(() => {
  app = freshApp();
});

describe('POST /api/urls', () => {
  it('creates a short URL for a valid long URL', async () => {
    const res = await request(app).post('/api/urls').send({ longUrl: 'https://example.com/page' });

    expect(res.status).toBe(201);
    expect(res.body.shortCode).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(res.body.longUrl).toBe('https://example.com/page');
    expect(res.body.shortUrl).toContain(res.body.shortCode);
    expect(res.body.isActive).toBe(true);
  });

  it('rejects a missing longUrl', async () => {
    const res = await request(app).post('/api/urls').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects an unsafe URL scheme', async () => {
    const res = await request(app).post('/api/urls').send({ longUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('creates a short URL with a custom alias', async () => {
    const res = await request(app)
      .post('/api/urls')
      .send({ longUrl: 'https://example.com', customAlias: 'my-alias' });

    expect(res.status).toBe(201);
    expect(res.body.shortCode).toBe('my-alias');
  });

  it('returns 409 when the custom alias is already taken', async () => {
    await request(app).post('/api/urls').send({ longUrl: 'https://example.com', customAlias: 'dup' });
    const res = await request(app)
      .post('/api/urls')
      .send({ longUrl: 'https://example.com/other', customAlias: 'dup' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('sets an expiry timestamp when expiresInDays is given', async () => {
    const res = await request(app)
      .post('/api/urls')
      .send({ longUrl: 'https://example.com', expiresInDays: 1 });

    expect(res.status).toBe(201);
    expect(res.body.expiresAt).not.toBeNull();
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('GET /:shortCode (redirect)', () => {
  it('redirects to the long URL and records a click', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com/target' });
    const shortCode = create.body.shortCode;

    const redirect = await request(app).get(`/${shortCode}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('https://example.com/target');

    const analytics = await request(app).get(`/api/urls/${shortCode}/analytics`);
    expect(analytics.body.totalClicks).toBe(1);
    expect(analytics.body.lastClickedAt).not.toBeNull();
  });

  it('buckets clicks by referrer host and parsed browser/OS for the analytics breakdown', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const shortCode = create.body.shortCode;
    const chromeMacUa =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

    await request(app)
      .get(`/${shortCode}`)
      .set('Referer', 'https://twitter.com/some/status/123')
      .set('User-Agent', chromeMacUa);
    await request(app).get(`/${shortCode}`); // no referer, no UA -> "direct" / unknown

    const analytics = await request(app).get(`/api/urls/${shortCode}/analytics`);
    expect(analytics.body.totalClicks).toBe(2);
    expect(analytics.body.breakdown.byReferrer).toEqual(
      expect.arrayContaining([
        { label: 'twitter.com', count: 1 },
        { label: 'direct', count: 1 },
      ]),
    );
    expect(analytics.body.breakdown.byBrowser).toEqual(
      expect.arrayContaining([{ label: 'Chrome', count: 1 }]),
    );
    expect(analytics.body.breakdown.byOs).toEqual(
      expect.arrayContaining([{ label: 'Mac OS', count: 1 }]),
    );
  });

  it('returns 404 for an unknown short code', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 410 for a deactivated link', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const shortCode = create.body.shortCode;

    await request(app).delete(`/api/urls/${shortCode}`);
    const res = await request(app).get(`/${shortCode}`);
    expect(res.status).toBe(410);
  });

  it('returns 410 for a link deleted after its redirect cache entry was already warmed', async () => {
    // Regression test: app.ts previously constructed a separate UrlsService
    // (and therefore a separate TtlCache) for the /api/urls router than for
    // the root redirect route. DELETE invalidated the cache on the former,
    // but the redirect endpoint read from the latter, so a link redirected
    // once and then deleted kept 302-ing to its (deactivated) target until
    // the cache TTL expired. Caught via manual smoke test, not by the
    // existing 410 test above, because that test never redirects first and
    // so never warms the cache before deleting.
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const shortCode = create.body.shortCode;

    const warmed = await request(app).get(`/${shortCode}`);
    expect(warmed.status).toBe(302);

    await request(app).delete(`/api/urls/${shortCode}`);

    const res = await request(app).get(`/${shortCode}`);
    expect(res.status).toBe(410);
  });

  it('returns 410 for an expired link', async () => {
    const create = await request(app)
      .post('/api/urls')
      .send({ longUrl: 'https://example.com', expiresInDays: 1 });
    const shortCode = create.body.shortCode;

    // Back-date the expiry directly in the DB to deterministically simulate
    // time passing, rather than depending on wall-clock time in the test.
    getDb().prepare('UPDATE urls SET expires_at = ? WHERE short_code = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      shortCode,
    );

    const res = await request(app).get(`/${shortCode}`);
    expect(res.status).toBe(410);
  });
});

describe('GET /api/urls (list)', () => {
  it('returns an empty array when nothing has been created', async () => {
    const res = await request(app).get('/api/urls');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all created links, newest first, with a per-link click count', async () => {
    const first = await request(app).post('/api/urls').send({ longUrl: 'https://example.com/first' });
    const second = await request(app).post('/api/urls').send({ longUrl: 'https://example.com/second' });
    await request(app).get(`/${second.body.shortCode}`);
    await request(app).get(`/${second.body.shortCode}`);

    const res = await request(app).get('/api/urls');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // newest first
    expect(res.body[0].shortCode).toBe(second.body.shortCode);
    expect(res.body[0].totalClicks).toBe(2);
    expect(res.body[1].shortCode).toBe(first.body.shortCode);
    expect(res.body[1].totalClicks).toBe(0);
  });

  it('still lists a link after it has been soft-deleted, marked inactive', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    await request(app).delete(`/api/urls/${create.body.shortCode}`);

    const res = await request(app).get('/api/urls');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].isActive).toBe(false);
  });
});

describe('GET /api/urls/:shortCode', () => {
  it('returns metadata without redirecting', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const res = await request(app).get(`/api/urls/${create.body.shortCode}`);

    expect(res.status).toBe(200);
    expect(res.body.longUrl).toBe('https://example.com');
  });

  it('returns 404 for an unknown code', async () => {
    const res = await request(app).get('/api/urls/nope1234');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/urls/:shortCode', () => {
  it('soft-deletes an existing URL', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const del = await request(app).delete(`/api/urls/${create.body.shortCode}`);
    expect(del.status).toBe(204);
  });

  it('returns 404 when deleting a code that does not exist', async () => {
    const res = await request(app).delete('/api/urls/nope1234');
    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('static convenience UI', () => {
  it('serves the web form at the root path', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<form id="create-form">');
  });

  it('does not shadow a real short code that happens to look like a static path', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const res = await request(app).get(`/${create.body.shortCode}`);
    expect(res.status).toBe(302);
  });
});
