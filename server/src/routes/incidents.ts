import { Router, Request, Response } from 'express';
import pool from '../db/pool';

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['acknowledged', 'investigating'],
  acknowledged: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: ['reopened'],
  reopened: ['acknowledged', 'investigating'],
};

const router = Router();

// GET /api/teams/:teamId/incidents — list incidents
router.get('/:teamId/incidents', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { status, severity } = req.query;

    let query = `SELECT * FROM incidents WHERE team_id = $1`;
    const params: any[] = [teamId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (severity) {
      query += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// GET /api/teams/:teamId/incidents/:id — single incident
router.get('/:teamId/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(500).json({ error: 'Failed to fetch incident' });
  }
});

// POST /api/teams/:teamId/incidents — create incident
router.post('/:teamId/incidents', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { title, description, severity, createdBy } = req.body;

    // Create the incident
    const result = await pool.query(`
      INSERT INTO incidents (team_id, title, description, severity, status, created_by)
      VALUES ($1, $2, $3, $4, 'open', $5)
      RETURNING *
    `, [teamId, title, description, severity, createdBy]);

    const incident = result.rows[0];

    // Add "created" entry to timeline
    await pool.query(`
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, 'created', $2, $3)
    `, [incident.id, createdBy, `Incident created with severity: ${severity}`]);

    res.status(201).json(incident);
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

// PATCH /api/teams/:teamId/incidents/:id — update incident status
router.patch('/:teamId/incidents/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, actor, message } = req.body;

    // Get current incident
    const current = await pool.query('SELECT * FROM incidents WHERE id = $1', [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const incident = current.rows[0];

    // Validate state transition
    const allowedTransitions = VALID_TRANSITIONS[incident.status] || [];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({
        error: `Invalid transition: ${incident.status} → ${status}`,
        allowedTransitions,
      });
    }

    // Update incident
    const resolvedAt = status === 'resolved' ? 'NOW()' : 'resolved_at';
    const result = await pool.query(`
      UPDATE incidents
      SET status = $1, updated_at = NOW(), resolved_at = ${status === 'resolved' ? 'NOW()' : 'resolved_at'}
      WHERE id = $2
      RETURNING *
    `, [status, id]);

    // Add timeline entry
    await pool.query(`
      INSERT INTO incident_timeline (incident_id, action, actor, message)
      VALUES ($1, $2, $3, $4)
    `, [id, status, actor || 'system', message || `Status changed to ${status}`]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating incident:', error);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

// GET /api/teams/:teamId/incidents/:id/timeline — incident timeline
router.get('/:teamId/incidents/:id/timeline', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      SELECT * FROM incident_timeline
      WHERE incident_id = $1
      ORDER BY created_at ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch incident timeline' });
  }
});

export default router;
