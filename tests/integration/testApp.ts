import type { Express } from 'express';
import { closeDb, getDb } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createApp } from '../../src/app.js';

/** Creates a fresh Express app backed by a brand-new in-memory SQLite DB. */
export function freshApp(): Express {
  closeDb();
  const db = getDb();
  runMigrations(db);
  return createApp();
}
