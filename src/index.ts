import { createApp } from './app.js';
import { config } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './lib/logger.js';

runMigrations(getDb());

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, baseUrl: config.baseUrl }, 'url-shortener listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
