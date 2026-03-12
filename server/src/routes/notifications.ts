import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { resolveTeamId } from '../utils/resolveTeam';

const router = Router();

// ─── Webhook Configs ───

// GET /api/teams/:teamId/webhooks — list webhook configs
router.get('/:teamId/webhooks', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const result = await pool.query(
      'SELECT * FROM webhook_configs WHERE team_id = $1 ORDER BY created_at DESC',
      [teamId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching webhook configs:', error);
    res.status(500).json({ error: 'Failed to fetch webhook configs' });
  }
});

// POST /api/teams/:teamId/webhooks — create a webhook config
router.post('/:teamId/webhooks', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const { name, url, events, secret } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }

    const result = await pool.query(`
      INSERT INTO webhook_configs (team_id, name, url, events, secret, enabled)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [
      teamId,
      name,
      url,
      events || ['incident_created', 'incident_resolved', 'incident_escalated'],
      secret || null,
    ]);

    console.log(`🔗 Webhook config created: ${name} → ${url}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating webhook config:', error);
    res.status(500).json({ error: 'Failed to create webhook config' });
  }
});

// PATCH /api/teams/:teamId/webhooks/:webhookId — update
router.patch('/:teamId/webhooks/:webhookId', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const { webhookId } = req.params;
    const { name, url, events, secret, enabled } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (url !== undefined) { fields.push(`url = $${idx++}`); values.push(url); }
    if (events !== undefined) { fields.push(`events = $${idx++}`); values.push(events); }
    if (secret !== undefined) { fields.push(`secret = $${idx++}`); values.push(secret || null); }
    if (enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(enabled); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(webhookId, teamId);

    const result = await pool.query(
      `UPDATE webhook_configs SET ${fields.join(', ')} WHERE id = $${idx++} AND team_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook config not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating webhook config:', error);
    res.status(500).json({ error: 'Failed to update webhook config' });
  }
});

// DELETE /api/teams/:teamId/webhooks/:webhookId
router.delete('/:teamId/webhooks/:webhookId', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const result = await pool.query(
      'DELETE FROM webhook_configs WHERE id = $1 AND team_id = $2 RETURNING id',
      [req.params.webhookId, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook config not found' });
    }

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting webhook config:', error);
    res.status(500).json({ error: 'Failed to delete webhook config' });
  }
});

// POST /api/teams/:teamId/webhooks/:webhookId/test — send a test notification
router.post('/:teamId/webhooks/:webhookId/test', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const config = await pool.query(
      'SELECT * FROM webhook_configs WHERE id = $1 AND team_id = $2',
      [req.params.webhookId, teamId]
    );

    if (config.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook config not found' });
    }

    const webhook = config.rows[0];
    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      incident: { id: 'test-123', title: 'Test Notification', severity: 'medium', status: 'open' },
      actor: 'demo-user',
      message: 'This is a test notification from PulseBoard',
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'PulseBoard-Webhook/1.0' },
        body: JSON.stringify(testPayload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      res.json({ success: response.ok, status: response.status, statusText: response.statusText });
    } catch (err: any) {
      res.json({ success: false, error: err.message });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to test webhook' });
  }
});

// ─── Notification Log ───

// GET /api/teams/:teamId/notifications — list notification log
router.get('/:teamId/notifications', async (req: Request, res: Response) => {
  try {
    const teamId = await resolveTeamId(req.params.teamId);
    if (!teamId) return res.status(404).json({ error: 'Team not found' });

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const result = await pool.query(
      'SELECT * FROM notification_log WHERE team_id = $1 ORDER BY created_at DESC LIMIT $2',
      [teamId, limit]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

export default router;
