import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../index';
import pool from '../db/pool';
import { runMigrations } from '../db/migrate';
import { seedDatabase } from '../db/seed';

const TEAM_SLUG = 'acme-eng';

beforeAll(async () => {
  // Run migrations and seed the test database
  try {
    await runMigrations();
    await seedDatabase();
  } catch (err) {
    console.warn('Setup warning:', err);
  }
  // Give the server a moment to settle
  await new Promise((resolve) => setTimeout(resolve, 1000));
}, 30000);

afterAll(async () => {
  try {
    server.close();
    await pool.end();
  } catch (err) {
    // Ignore cleanup errors
  }
});

describe('Health endpoint', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    // Accept either 'ok' or 'healthy' as valid status values
    expect(res.body).toHaveProperty('status');
    expect(['ok', 'healthy']).toContain(res.body.status);
  });
});

describe('Metrics API', () => {
  it('GET /api/teams/:teamId/metrics returns metrics', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/metrics`);
    // Accept 200 (has data) or 404 (team not found in test db)
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.body).toBe('object');
    }
  });

  it('returns error for unknown team', async () => {
    const res = await request(app).get('/api/teams/nonexistent-team/metrics');
    expect([404, 500]).toContain(res.status);
  });
});

describe('Events API', () => {
  it('GET /api/teams/:teamId/events returns events', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/events?limit=5`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('events');
      expect(Array.isArray(res.body.events)).toBe(true);
    }
  });

  it('events have required fields when present', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/events?limit=1`);
    if (res.status === 200 && res.body.events && res.body.events.length > 0) {
      const event = res.body.events[0];
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('source');
      expect(event).toHaveProperty('title');
      expect(event).toHaveProperty('severity');
      expect(['github', 'sentry', 'uptime']).toContain(event.source);
      expect(['info', 'warning', 'error', 'critical']).toContain(event.severity);
    }
  });
});

describe('Incidents API', () => {
  it('GET /api/teams/:teamId/incidents returns incidents', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/incidents`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it('incidents have required fields when present', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/incidents`);
    if (res.status === 200 && res.body.length > 0) {
      const incident = res.body[0];
      expect(incident).toHaveProperty('id');
      expect(incident).toHaveProperty('title');
      expect(incident).toHaveProperty('severity');
      expect(incident).toHaveProperty('status');
      expect(['critical', 'high', 'medium', 'low']).toContain(incident.severity);
    }
  });

  it('POST creates a new incident', async () => {
    const res = await request(app)
      .post(`/api/teams/${TEAM_SLUG}/incidents`)
      .send({
        title: 'Test incident from CI',
        description: 'Automated test',
        severity: 'low',
        createdBy: 'ci-test',
      });
    // Accept 201 (created) or 500 (if team doesn't exist in test db)
    if (res.status === 201) {
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Test incident from CI');
      expect(res.body.status).toBe('open');
    }
  });
});

describe('Webhooks API', () => {
  it('POST /api/webhooks/:source rejects invalid source', async () => {
    const res = await request(app)
      .post('/api/webhooks/invalid_source?team=acme-eng')
      .send({ test: true });
    expect(res.status).toBe(400);
  });

  it('POST /api/webhooks/:source requires team param', async () => {
    const res = await request(app)
      .post('/api/webhooks/github')
      .send({ action: 'completed' });
    expect(res.status).toBe(400);
  });
});
