import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { freshApp } from './testApp.js';
import { config } from '../../src/config.js';

let app: Express;

beforeEach(() => {
  app = freshApp();
});

describe('rate limiting', () => {
  it('rejects create requests once the per-window limit is exceeded', async () => {
    const max = config.rateLimit.createMax;

    for (let i = 0; i < max; i++) {
      const res = await request(app).post('/api/urls').send({ longUrl: `https://example.com/${i}` });
      expect(res.status).toBe(201);
    }

    const overLimit = await request(app).post('/api/urls').send({ longUrl: 'https://example.com/over' });
    expect(overLimit.status).toBe(429);
    expect(overLimit.body.error).toBe('RATE_LIMITED');
  }, 15_000);

  it('rate-limits the redirect endpoint independently from the create endpoint', async () => {
    const create = await request(app).post('/api/urls').send({ longUrl: 'https://example.com' });
    const shortCode = create.body.shortCode;
    const max = config.rateLimit.redirectMax;

    for (let i = 0; i < max; i++) {
      const res = await request(app).get(`/${shortCode}`);
      expect(res.status).toBe(302);
    }

    const overLimit = await request(app).get(`/${shortCode}`);
    expect(overLimit.status).toBe(429);
  }, 15_000);
});
