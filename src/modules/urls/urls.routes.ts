import { Router } from 'express';
import { UrlsController } from './urls.controller.js';
import { createUrlLimiter } from '../../middleware/rateLimiter.js';

export function urlsRouter(controller: UrlsController = new UrlsController()): Router {
  const router = Router();

  router.post('/', createUrlLimiter(), controller.create);
  router.get('/', controller.list);
  router.get('/:shortCode', controller.getMetadata);
  router.get('/:shortCode/analytics', controller.getAnalytics);
  router.delete('/:shortCode', controller.delete);

  return router;
}
