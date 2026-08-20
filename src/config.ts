import 'dotenv/config';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intFromEnv('PORT', 3000),
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',
  dbPath: process.env.DB_PATH ?? './data/shortener.sqlite',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  rateLimit: {
    createMax: intFromEnv('RATE_LIMIT_CREATE_MAX', 20),
    createWindowMs: intFromEnv('RATE_LIMIT_CREATE_WINDOW_MS', 60_000),
    redirectMax: intFromEnv('RATE_LIMIT_REDIRECT_MAX', 120),
    redirectWindowMs: intFromEnv('RATE_LIMIT_REDIRECT_WINDOW_MS', 60_000),
  },

  cache: {
    ttlMs: intFromEnv('CACHE_TTL_MS', 300_000),
    maxEntries: intFromEnv('CACHE_MAX_ENTRIES', 5000),
  },
} as const;
