import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { config } from '../config.js';

let db: Database.Database | undefined;

function ensureDataDir(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  ensureDataDir(config.dbPath);
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
