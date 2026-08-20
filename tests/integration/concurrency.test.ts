import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { UrlsRepository, ShortCodeTakenError } from '../../src/modules/urls/urls.repository.js';

beforeEach(() => {
  closeDb();
  runMigrations(getDb());
});

describe('UrlsRepository.create — short-code collision handling', () => {
  it('rejects a duplicate short code with a clean domain error, not a raw DB exception', () => {
    const repo = new UrlsRepository();
    const params = {
      shortCode: 'DUPCODE',
      longUrl: 'https://example.com/a',
      isCustomAlias: false,
      expiresAt: null,
    };

    repo.create(params);

    // Two callers racing to claim the same code — within this Node process
    // that means two sequential calls (see docs/scenarios/02-brownfield.md
    // for why true interleaving isn't reproducible in-process); across
    // multiple service instances sharing this DB file it would be two
    // genuinely concurrent INSERTs. Either way the second one must land here,
    // as a typed domain error, not a raw SqliteError.
    expect(() => repo.create({ ...params, longUrl: 'https://example.com/b' })).toThrow(
      ShortCodeTakenError,
    );
  });

  it('does not leave a partial/corrupt row behind after a rejected duplicate insert', () => {
    const repo = new UrlsRepository();
    const params = {
      shortCode: 'DUPCODE2',
      longUrl: 'https://example.com/a',
      isCustomAlias: false,
      expiresAt: null,
    };
    repo.create(params);

    try {
      repo.create({ ...params, longUrl: 'https://example.com/b' });
    } catch {
      // expected — asserted above; this test only cares about the row state after
    }

    expect(repo.findByShortCode('DUPCODE2')?.long_url).toBe('https://example.com/a');
  });
});

vi.mock('../../src/modules/urls/shortCode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/urls/shortCode.js')>();
  return { ...actual, generateShortCode: vi.fn() };
});

describe('UrlsService.create — transparent retry on generator collisions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('retries with a new code when the generator produces one that is already taken', async () => {
    const { generateShortCode } = await import('../../src/modules/urls/shortCode.js');
    const { UrlsService } = await import('../../src/modules/urls/urls.service.js');
    vi.mocked(generateShortCode)
      .mockReturnValueOnce('TAKEN01') // 1st attempt: collides
      .mockReturnValueOnce('TAKEN01') // 2nd attempt: collides again
      .mockReturnValueOnce('FRESH01'); // 3rd attempt: succeeds

    const repo = new UrlsRepository();
    repo.create({
      shortCode: 'TAKEN01',
      longUrl: 'https://example.com/existing',
      isCustomAlias: false,
      expiresAt: null,
    });

    const service = new UrlsService(repo);
    const result = service.create({ longUrl: 'https://example.com/new' });

    expect(result.shortCode).toBe('FRESH01');
    expect(generateShortCode).toHaveBeenCalledTimes(3);
  });

  it('surfaces a clean 503 (not a raw DB error) if every generation attempt collides', async () => {
    const { generateShortCode } = await import('../../src/modules/urls/shortCode.js');
    const { UrlsService } = await import('../../src/modules/urls/urls.service.js');
    vi.mocked(generateShortCode).mockReturnValue('ALWAYS01');

    const repo = new UrlsRepository();
    repo.create({
      shortCode: 'ALWAYS01',
      longUrl: 'https://example.com/existing',
      isCustomAlias: false,
      expiresAt: null,
    });

    const service = new UrlsService(repo);
    expect(() => service.create({ longUrl: 'https://example.com/new' })).toThrow(
      /unique short code/,
    );
    expect(generateShortCode).toHaveBeenCalledTimes(5); // MAX_GENERATION_ATTEMPTS
  });
});
