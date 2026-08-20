import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * In-memory, per-process rate limiting. Documented limitation: this does not
 * share state across multiple instances of the service, so a horizontally
 * scaled deployment gets a per-instance limit rather than a true global one
 * (e.g. 3 instances effectively allow 3x the configured rate). A shared store
 * (Redis) is the production upgrade path — flagged rather than silently
 * accepted, same as the redirect cache's single-instance limitation.
 */
// Factories rather than module-level singletons: each `createApp()` call
// (once per process in production, once per test in the test suite) gets its
// own limiter state. A shared singleton would otherwise leak hit counts
// across independently-constructed apps within the same process — most
// visibly, across test cases in the same file.
export function createUrlLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.createWindowMs,
    limit: config.rateLimit.createMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'RATE_LIMITED',
      message: 'too many links created from this address, try again shortly',
    },
  });
}

export function redirectLimiter() {
  return rateLimit({
    windowMs: config.rateLimit.redirectWindowMs,
    limit: config.rateLimit.redirectMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'too many requests, try again shortly' },
  });
}
