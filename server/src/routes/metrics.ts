import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/teams/:teamId/metrics — latest snapshot
router.get('/:teamId/metrics', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    // Get latest value for each metric type
    const result = await pool.query(`
      SELECT DISTINCT ON (type) type, value, timestamp
      FROM metrics
      WHERE team_id = $1
      ORDER BY type, timestamp DESC
    `, [teamId]);

    const snapshot: Record<string, any> = {
      uptime: 0,
      errorRate: 0,
      deployFrequency: 0,
      responseTime: 0,
      updatedAt: new Date(),
    };

    for (const row of result.rows) {
      const keyMap: Record<string, string> = {
        uptime: 'uptime',
        error_rate: 'errorRate',
        deploy_frequency: 'deployFrequency',
        response_time: 'responseTime',
      };
      const key = keyMap[row.type];
      if (key) {
        snapshot[key] = parseFloat(row.value);
        snapshot.updatedAt = row.timestamp;
      }
    }

    res.json(snapshot);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/teams/:teamId/metrics/history — time-series data
router.get('/:teamId/metrics/history', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { type, from, to } = req.query;

    let query = `
      SELECT type, value, timestamp
      FROM metrics
      WHERE team_id = $1
    `;
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (type) {
      query += ` AND type = $${paramIndex++}`;
      params.push(type);
    }
    if (from) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(to);
    }

    query += ' ORDER BY timestamp ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching metrics history:', error);
    res.status(500).json({ error: 'Failed to fetch metrics history' });
  }
});

export default router;
