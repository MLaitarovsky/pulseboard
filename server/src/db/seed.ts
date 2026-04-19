import pool from './pool';
import { v4 as uuidv4 } from 'uuid';

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function seedDatabase(): Promise<void> {
  console.log('🌱 Seeding database...');

  // Check if already seeded
  const existing = await pool.query('SELECT COUNT(*) FROM teams');
  if (parseInt(existing.rows[0].count) > 0) {
    console.log('⏩ Database already seeded, skipping');
    return;
  }

  // Create demo teams
  const teamId = uuidv4();
  await pool.query(
    'INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3)',
    [teamId, 'Acme Engineering', 'acme-eng']
  );
  await pool.query(
    'INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3)',
    [uuidv4(), 'Acme Platform', 'acme-platform']
  );
  await pool.query(
    'INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3)',
    [uuidv4(), 'Acme Infrastructure', 'acme-infra']
  );

  // Seed 3 weeks of metrics (every 15 minutes)
  console.log('  📊 Seeding metrics...');
  const now = new Date();
  const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const metricValues: string[] = [];
  let current = new Date(threeWeeksAgo);

  while (current <= now) {
    const timestamp = current.toISOString();

    // Uptime: mostly 99.5-100%, occasional dips
    const uptimeDip = Math.random() < 0.05;
    const uptime = uptimeDip ? randomBetween(95, 98.5) : randomBetween(99.2, 99.99);

    // Error rate: mostly low, spikes sometimes
    const errorSpike = Math.random() < 0.08;
    const errorRate = errorSpike ? randomBetween(2, 8) : randomBetween(0.1, 1.5);

    // Deploy frequency: 0-3 deploys per day
    const deployFreq = Math.random() < 0.3 ? Math.floor(randomBetween(1, 4)) : 0;

    // Response time: 50-200ms normally, spikes to 500+
    const latencySpike = Math.random() < 0.06;
    const responseTime = latencySpike ? randomBetween(400, 1200) : randomBetween(45, 220);

    metricValues.push(`('${teamId}', 'uptime', ${uptime.toFixed(2)}, '${timestamp}')`);
    metricValues.push(`('${teamId}', 'error_rate', ${errorRate.toFixed(2)}, '${timestamp}')`);
    metricValues.push(`('${teamId}', 'deploy_frequency', ${deployFreq}, '${timestamp}')`);
    metricValues.push(`('${teamId}', 'response_time', ${responseTime.toFixed(1)}, '${timestamp}')`);

    // Advance 15 minutes
    current = new Date(current.getTime() + 15 * 60 * 1000);
  }

  // Batch insert metrics (chunks of 500)
  for (let i = 0; i < metricValues.length; i += 500) {
    const chunk = metricValues.slice(i, i + 500);
    await pool.query(`
      INSERT INTO metrics (team_id, type, value, timestamp)
      VALUES ${chunk.join(', ')}
    `);
  }

  // Seed events
  console.log('  📡 Seeding events...');
  const githubEvents = [
    { type: 'deployment', title: 'Deployed to production', severity: 'info' },
    { type: 'deployment', title: 'Deployed to staging', severity: 'info' },
    { type: 'workflow_run', title: 'CI pipeline passed', severity: 'info' },
    { type: 'workflow_run', title: 'CI pipeline failed', severity: 'warning' },
    { type: 'push', title: 'Pushed to main branch', severity: 'info' },
  ];

  const sentryEvents = [
    { type: 'error', title: 'TypeError: Cannot read properties of undefined', severity: 'error' },
    { type: 'error', title: 'RangeError: Maximum call stack size exceeded', severity: 'error' },
    { type: 'error', title: 'NetworkError: Failed to fetch', severity: 'warning' },
    { type: 'error', title: 'UnhandledPromiseRejection in /api/users', severity: 'critical' },
    { type: 'error', title: '500 Internal Server Error on /api/payments', severity: 'critical' },
  ];

  const uptimeEvents = [
    { type: 'ping_success', title: 'Health check passed — api.acme.com', severity: 'info' },
    { type: 'ping_fail', title: 'Health check FAILED — api.acme.com', severity: 'critical' },
    { type: 'ping_success', title: 'Health check passed — app.acme.com', severity: 'info' },
    { type: 'latency_warning', title: 'High latency detected — api.acme.com (850ms)', severity: 'warning' },
  ];

  const eventInserts: string[] = [];
  current = new Date(threeWeeksAgo);

  while (current <= now) {
    // ~5-15 events per day
    const eventsToday = Math.floor(randomBetween(5, 16));
    for (let i = 0; i < eventsToday; i++) {
      const source = randomChoice(['github', 'github', 'sentry', 'uptime'] as const);
      const eventPool = source === 'github' ? githubEvents : source === 'sentry' ? sentryEvents : uptimeEvents;
      const event = randomChoice(eventPool);
      const occurredAt = new Date(current.getTime() + randomBetween(0, 24 * 60 * 60 * 1000));

      if (occurredAt > now) continue;

      const desc = `Auto-generated seed event for ${source}`;
      const metadata = JSON.stringify({ seed: true, source });
      eventInserts.push(
        `('${teamId}', '${source}', '${event.type}', '${event.title.replace(/'/g, "''")}', '${desc}', '${event.severity}', '${metadata}', '${occurredAt.toISOString()}')`
      );
    }
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
  }

  for (let i = 0; i < eventInserts.length; i += 200) {
    const chunk = eventInserts.slice(i, i + 200);
    await pool.query(`
      INSERT INTO events (team_id, source, event_type, title, description, severity, metadata, occurred_at)
      VALUES ${chunk.join(', ')}
    `);
  }

  // Seed incidents
  console.log('  🚨 Seeding incidents...');
  const incidents = [
    {
      title: 'Payment API returning 500 errors',
      description: 'Multiple users reporting failed payments. Stripe webhook handler throwing unhandled exceptions.',
      severity: 'critical',
      status: 'resolved',
      daysAgo: 14,
    },
    {
      title: 'High latency on /api/search endpoint',
      description: 'Search queries taking 3-5 seconds. Likely missing database index on the products table.',
      severity: 'high',
      status: 'resolved',
      daysAgo: 10,
    },
    {
      title: 'Staging deployment pipeline broken',
      description: 'GitHub Actions workflow failing on the build step. Node version mismatch in CI config.',
      severity: 'medium',
      status: 'resolved',
      daysAgo: 7,
    },
    {
      title: 'Memory leak in WebSocket connection handler',
      description: 'Server memory usage climbing steadily. Connections not being properly cleaned up on disconnect.',
      severity: 'high',
      status: 'investigating',
      daysAgo: 2,
    },
    {
      title: 'Sentry error spike: CORS errors on mobile',
      description: 'New CORS policy blocking requests from the mobile web app. Started after last deployment.',
      severity: 'medium',
      status: 'open',
      daysAgo: 0,
    },
  ];

  for (const inc of incidents) {
    const createdAt = new Date(now.getTime() - inc.daysAgo * 24 * 60 * 60 * 1000);
    const result = await pool.query(`
      INSERT INTO incidents (team_id, title, description, severity, status, created_by, created_at, updated_at ${inc.status === 'resolved' ? ', resolved_at' : ''})
      VALUES ($1, $2, $3, $4, $5, 'seed-user', $6, $6 ${inc.status === 'resolved' ? ', $6' : ''})
      RETURNING id
    `, [teamId, inc.title, inc.description, inc.severity, inc.status, createdAt]);

    const incidentId = result.rows[0].id;

    // Add timeline entries
    await pool.query(`
      INSERT INTO incident_timeline (incident_id, action, actor, message, created_at)
      VALUES ($1, 'created', 'seed-user', 'Incident reported', $2)
    `, [incidentId, createdAt]);

    if (inc.status === 'investigating' || inc.status === 'resolved') {
      await pool.query(`
        INSERT INTO incident_timeline (incident_id, action, actor, message, created_at)
        VALUES ($1, 'acknowledged', 'seed-user', 'Investigating the issue', $2)
      `, [incidentId, new Date(createdAt.getTime() + 30 * 60 * 1000)]);
    }

    if (inc.status === 'resolved') {
      await pool.query(`
        INSERT INTO incident_timeline (incident_id, action, actor, message, created_at)
        VALUES ($1, 'resolved', 'seed-user', 'Root cause identified and fixed', $2)
      `, [incidentId, new Date(createdAt.getTime() + 4 * 60 * 60 * 1000)]);
    }
  }

  console.log('✅ Seeding complete!');
  console.log(`   Team ID: ${teamId}`);
  console.log(`   Team slug: acme-eng`);
}
