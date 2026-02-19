import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

// GET /api/teams/:teamId/events — paginated events list
router.get('/:teamId/events', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { source, limit = '50', offset = '0' } = req.query;

    let query = `
      SELECT id, team_id, source, event_type, title, description, severity, metadata, occurred_at, received_at
      FROM events
      WHERE team_id = $1
    `;
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (source) {
      query += ` AND source = $${paramIndex++}`;
      params.push(source);
    }

    query += ` ORDER BY received_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM events WHERE team_id = $1',
      [teamId]
    );

    res.json({
      events: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// POST /api/teams/:teamId/events — manually create an event
router.post('/:teamId/events', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { source, eventType, title, description, severity, metadata } = req.body;

    const result = await pool.query(`
      INSERT INTO events (team_id, source, event_type, title, description, severity, metadata, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `, [teamId, source, eventType, title, description, severity, JSON.stringify(metadata || {})]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

export default router;
