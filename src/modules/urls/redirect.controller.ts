import type { NextFunction, Request, Response } from 'express';
import { UrlsService } from './urls.service.js';

export class RedirectController {
  constructor(private readonly service: UrlsService = new UrlsService()) {}

  redirect = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const shortCode = req.params.shortCode as string;
      const record = this.service.resolveForRedirect(shortCode);

      // Click recording is synchronous (better-sqlite3 is a sync API) and
      // happens before the redirect is sent, so a click is never "lost" to a
      // process crash between responding and logging it. See
      // docs/ai-traceability.md for why an earlier fire-and-forget async
      // version was rejected.
      this.service.recordClick(shortCode, req.get('referer') ?? null, req.get('user-agent') ?? null);

      res.redirect(302, record.long_url);
    } catch (err) {
      next(err);
    }
  };
}
