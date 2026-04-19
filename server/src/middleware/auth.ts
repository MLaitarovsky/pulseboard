import { Request, Response, NextFunction } from 'express';

/**
 * API key auth middleware.
 * Only active when the API_KEY env var is set.
 * Exempt: /api/health and inbound webhook ingestion routes (/api/webhooks/:source).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next(); // auth disabled — no key configured

  // Always allow health checks and inbound webhook ingestion
  if (req.path === '/api/health' || req.path.startsWith('/api/webhooks/')) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
