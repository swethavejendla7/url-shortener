import { describe, expect, it } from 'vitest';
import { generateShortCode, isValidAlias } from '../../src/modules/urls/shortCode.js';

describe('generateShortCode', () => {
  it('generates a code of the requested length using only base62 characters', () => {
    const code = generateShortCode(7);
    expect(code).toHaveLength(7);
    expect(code).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('respects a custom length', () => {
    expect(generateShortCode(12)).toHaveLength(12);
  });

  it('generates distinct codes across many calls (no obvious bias/collisions)', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateShortCode()));
    // With 62^7 possible codes, 2000 draws colliding would indicate a serious bug.
    expect(codes.size).toBe(2000);
  });
});

describe('isValidAlias', () => {
  it('accepts alphanumeric aliases with dashes/underscores', () => {
    expect(isValidAlias('my-cool_link1')).toBe(true);
  });

  it('rejects aliases that are too short', () => {
    expect(isValidAlias('ab')).toBe(false);
  });

  it('rejects aliases with disallowed characters', () => {
    expect(isValidAlias('has space')).toBe(false);
    expect(isValidAlias('slash/here')).toBe(false);
  });

  it('rejects reserved paths regardless of case', () => {
    expect(isValidAlias('api')).toBe(false);
    expect(isValidAlias('HEALTH')).toBe(false);
  });
});
