import type { NextFunction, Request, Response } from 'express';
import { createUrlSchema } from './urls.schema.js';
import { UrlsService } from './urls.service.js';
import { ValidationError } from '../../lib/errors.js';

export class UrlsController {
  constructor(private readonly service: UrlsService = new UrlsService()) {}

  create = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const selfHost = req.get('host');
      const parsed = createUrlSchema(selfHost).safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('invalid request body', parsed.error.flatten());
      }
      const view = this.service.create(parsed.data);
      res.status(201).json(view);
    } catch (err) {
      next(err);
    }
  };

  list = (_req: Request, res: Response, next: NextFunction): void => {
    try {
      res.json(this.service.listAll());
    } catch (err) {
      next(err);
    }
  };

  getMetadata = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const view = this.service.getMetadata(req.params.shortCode as string);
      res.json(view);
    } catch (err) {
      next(err);
    }
  };

  delete = (req: Request, res: Response, next: NextFunction): void => {
    try {
      this.service.delete(req.params.shortCode as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getAnalytics = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const view = this.service.getAnalytics(req.params.shortCode as string);
      res.json(view);
    } catch (err) {
      next(err);
    }
  };
}
