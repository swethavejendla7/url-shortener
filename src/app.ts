import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { urlsRouter } from './modules/urls/urls.routes.js';
import { UrlsController } from './modules/urls/urls.controller.js';
import { UrlsService } from './modules/urls/urls.service.js';
import { RedirectController } from './modules/urls/redirect.controller.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { redirectLimiter } from './middleware/rateLimiter.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestLogger);
  app.use(express.json({ limit: '10kb' }));

  // A thin, optional convenience UI over the JSON API below — express.static
  // only serves a response for requests that match a real file (index.html,
  // "/"), and calls next() for everything else, so a real short code like
  // GET /aB3xY9z still falls through to the redirect route further down.
  app.use(express.static(publicDir));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // One UrlsService instance shared between both controllers: it owns the
  // redirect cache, and that cache is only ever invalidated on the instance
  // that handles the write. Two independently-constructed services (each
  // with their own default `new UrlsService()`) would mean a DELETE through
  // urlsRouter's controller never invalidates the cache the redirect
  // controller reads from, and the redirect endpoint keeps serving a
  // soft-deleted link as if it were still active until the cache TTL expires.
  const urlsService = new UrlsService();
  app.use('/api/urls', urlsRouter(new UrlsController(urlsService)));

  const redirectController = new RedirectController(urlsService);
  app.get('/:shortCode', redirectLimiter(), redirectController.redirect);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
