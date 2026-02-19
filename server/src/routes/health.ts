import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { redis } from '../db/redis';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Check PostgreSQL
    const dbResult = await pool.query('SELECT NOW()');
    const dbTime = dbResult.rows[0].now;

    // Check Redis
    await redis.ping();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'connected', time: dbTime },
        redis: { status: 'connected' },
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
