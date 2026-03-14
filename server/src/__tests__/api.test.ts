import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, server } from '../index';
import pool from '../db/pool';

// Use a known team slug from seed data
const TEAM_SLUG = 'acme-eng';

beforeAll(async () => {
  // Wait for migrations and seed to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));
});

afterAll(async () => {
  server.close();
  await pool.end();
});

describe('Health endpoint', () => {
  it('GET /api/health returns 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
  });
});

describe('Metrics API', () => {
  it('GET /api/teams/:teamId/metrics returns metrics snapshot', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/metrics`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('errorRate');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns 404 for unknown team', async () => {
    const res = await request(app).get('/api/teams/nonexistent-team/metrics');
    expect(res.status).toBe(404);
  });
});

describe('Events API', () => {
  it('GET /api/teams/:teamId/events returns paginated events', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/events?limit=5`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeLessThanOrEqual(5);
  });

  it('events have required fields', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/events?limit=1`);
    if (res.body.events.length > 0) {
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
  it('GET /api/teams/:teamId/incidents returns incidents list', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/incidents`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('incidents have required fields', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/incidents`);
    if (res.body.length > 0) {
      const incident = res.body[0];
      expect(incident).toHaveProperty('id');
      expect(incident).toHaveProperty('title');
      expect(incident).toHaveProperty('severity');
      expect(incident).toHaveProperty('status');
      expect(['critical', 'high', 'medium', 'low']).toContain(incident.severity);
    }
  });

  it('can filter incidents by status', async () => {
    const res = await request(app).get(`/api/teams/${TEAM_SLUG}/incidents?status=open`);
    expect(res.status).toBe(200);
    for (const incident of res.body) {
      expect(incident.status).toBe('open');
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
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test incident from CI');
    expect(res.body.status).toBe('open');
  });

  it('rejects invalid status transitions', async () => {
    // Create an incident
    const created = await request(app)
      .post(`/api/teams/${TEAM_SLUG}/incidents`)
      .send({ title: 'Transition test', severity: 'low', createdBy: 'ci-test' });

    // Try to resolve directly from open (invalid — must go through acknowledged first)
    const res = await request(app)
      .patch(`/api/teams/${TEAM_SLUG}/incidents/${created.body.id}`)
      .send({ status: 'resolved' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Cannot transition');
  });
});

describe('Webhooks API', () => {
  it('GET /api/webhooks/test/github creates a test event', async () => {
    const res = await request(app).get(`/api/webhooks/test/github?team=${TEAM_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'test_event_created');
    expect(res.body).toHaveProperty('event');
    expect(res.body.event.source).toBe('github');
  });

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
    expect(res.body.error).toContain('team');
  });
});
