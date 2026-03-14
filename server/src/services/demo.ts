import pool from "../db/pool";

let demoInterval: NodeJS.Timeout | null = null;
let incidentDemoTimeout: NodeJS.Timeout | null = null;
let storedIo: any = null;
let storedTeamSlug: string = "";
let storedTeamId: string = "";

const DEMO_EVENTS = {
  github: [
    {
      type: "deployment",
      title: "Deploy #{{n}} to production — main@{{sha}}",
      severity: "info",
    },
    {
      type: "deployment",
      title: "Deploy #{{n}} to staging — feature/auth@{{sha}}",
      severity: "info",
    },
    {
      type: "workflow_run",
      title: "CI Pipeline passed — PR #{{n}}",
      severity: "info",
    },
    {
      type: "workflow_run",
      title: "CI Pipeline failed — PR #{{n}}",
      severity: "error",
    },
    {
      type: "push",
      title: "Push to main — {{n}} commits by demo-dev",
      severity: "info",
    },
  ],
  sentry: [
    {
      type: "error",
      title: "TypeError: Cannot read property of undefined",
      severity: "error",
    },
    {
      type: "error",
      title: "RangeError: Maximum call stack size exceeded",
      severity: "critical",
    },
    {
      type: "error",
      title: "NetworkError: Failed to fetch /api/users",
      severity: "warning",
    },
    {
      type: "error",
      title: "SyntaxError: Unexpected token in JSON",
      severity: "error",
    },
    {
      type: "error",
      title: "TimeoutError: Request exceeded 30s limit",
      severity: "warning",
    },
  ],
  uptime: [
    {
      type: "ping_success",
      title: "api.acme.com — 200 OK ({{ms}}ms)",
      severity: "info",
    },
    {
      type: "ping_success",
      title: "app.acme.com — 200 OK ({{ms}}ms)",
      severity: "info",
    },
    {
      type: "ping_slow",
      title: "api.acme.com — 200 OK ({{ms}}ms) — Slow",
      severity: "warning",
    },
    {
      type: "ping_fail",
      title: "api.acme.com — 503 Service Unavailable",
      severity: "critical",
    },
    {
      type: "ping_success",
      title: "cdn.acme.com — 200 OK ({{ms}}ms)",
      severity: "info",
    },
  ],
};

function randomSha(): string {
  return Math.random().toString(16).substring(2, 9);
}

function randomMs(): string {
  return (50 + Math.floor(Math.random() * 400)).toString();
}

function randomN(): string {
  return (100 + Math.floor(Math.random() * 900)).toString();
}

function fillTemplate(title: string): string {
  return title
    .replace("{{sha}}", randomSha())
    .replace("{{ms}}", randomMs())
    .replace("{{n}}", randomN());
}

/**
 * Generate a single random event and broadcast it via Socket.IO.
 */
async function generateEvent(): Promise<void> {
  console.log(
    `🔄 generateEvent called — io: ${!!storedIo}, slug: ${storedTeamSlug}, id: ${storedTeamId}`,
  );
  const teamId = storedTeamId;
  const teamSlug = storedTeamSlug;
  const io = storedIo;

  if (!teamId) return;

  const sources = ["github", "sentry", "uptime"] as const;
  const source = sources[Math.floor(Math.random() * sources.length)];
  const events = DEMO_EVENTS[source];
  const template = events[Math.floor(Math.random() * events.length)];

  const title = fillTemplate(template.title);
  const now = new Date();

  try {
    const result = await pool.query(
      `
      INSERT INTO events (team_id, source, event_type, title, severity, occurred_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        teamId,
        source,
        template.type,
        title,
        template.severity,
        now,
        JSON.stringify({ demo: true }),
      ],
    );

    const event = result.rows[0];

    // Emit directly via Socket.IO using the SLUG-based room name
    // (clients join room "team:acme-eng", not "team:<uuid>")
    if (io) {
      const roomName = `team:${teamId}`;
      io.to(roomName).emit("new_event", {
        id: event.id,
        source: event.source,
        eventType: event.event_type,
        title: event.title,
        severity: event.severity,
        occurredAt: event.occurred_at,
      });
      io.to(roomName).emit("metrics_update", { refetch: true });
    }

    // Update a random metric
    const metricTypes = ["uptime", "error_rate", "response_time"] as const;
    const metricType =
      metricTypes[Math.floor(Math.random() * metricTypes.length)];
    let value: number;

    switch (metricType) {
      case "uptime":
        value = 99 + Math.random() * 0.99;
        break;
      case "error_rate":
        value = Math.random() * 2.5;
        break;
      case "response_time":
        value = 80 + Math.random() * 200;
        break;
    }

    await pool.query(
      `INSERT INTO metrics (team_id, type, value) VALUES ($1, $2, $3)`,
      [teamId, metricType, value],
    );
  } catch (err) {
    console.warn("Demo event generation failed:", err);
  }
}

/**
 * Simulate a full incident lifecycle over ~50 seconds.
 */
async function simulateIncidentLifecycle(
  teamId: string,
  teamSlug: string,
  io?: any,
): Promise<void> {
  const titles = [
    "Database connection pool exhausted",
    "API response time spike > 5s",
    "Payment service 503 errors",
    "CDN cache invalidation failure",
    "Memory leak detected in worker pods",
  ];

  const title = titles[Math.floor(Math.random() * titles.length)];
  const severity = ["critical", "high"][Math.floor(Math.random() * 2)];
  const roomName = `team:${teamId}`;

  try {
    // 1. Create incident (t=0)
    const created = await pool.query(
      `
      INSERT INTO incidents (team_id, title, description, severity, status, created_by)
      VALUES ($1, $2, $3, $4, 'open', 'demo-bot')
      RETURNING *
    `,
      [teamId, title, `[Demo] Automated incident simulation`, severity],
    );

    const incidentId = created.rows[0].id;

    await pool.query(
      `INSERT INTO incident_timeline (incident_id, action, actor, message) VALUES ($1, 'created', 'demo-bot', $2)`,
      [incidentId, `Incident created: ${title}`],
    );

    // Broadcast via Socket.IO directly
    if (io) {
      io.to(roomName).emit("incident_update", {
        type: "created",
        incident: created.rows[0],
      });
      io.to(roomName).emit("notification", {
        id: `demo-${Date.now()}`,
        type: "incident_created",
        title: `🚨 New incident: ${title}`,
        message: `Severity: ${severity}`,
        severity,
        incidentId,
        actor: "demo-bot",
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`🎬 Demo incident started: ${title}`);

    // 2. Acknowledge (t=10s)
    incidentDemoTimeout = setTimeout(async () => {
      await pool.query(
        `UPDATE incidents SET status = 'acknowledged', updated_at = NOW() WHERE id = $1`,
        [incidentId],
      );
      await pool.query(
        `INSERT INTO incident_timeline (incident_id, action, actor, message) VALUES ($1, 'acknowledged', 'demo-oncall', 'On-call engineer acknowledged')`,
        [incidentId],
      );
      if (io) {
        io.to(roomName).emit("incident_update", { type: "acknowledged" });
        io.to(roomName).emit("notification", {
          id: `demo-${Date.now()}`,
          type: "incident_acknowledged",
          title: `👁️ Acknowledged: ${title}`,
          message: "On-call engineer acknowledged",
          severity,
          incidentId,
          actor: "demo-oncall",
          timestamp: new Date().toISOString(),
        });
      }
    }, 10000);

    // 3. Investigating (t=25s)
    setTimeout(async () => {
      await pool.query(
        `UPDATE incidents SET status = 'investigating', updated_at = NOW() WHERE id = $1`,
        [incidentId],
      );
      await pool.query(
        `INSERT INTO incident_timeline (incident_id, action, actor, message) VALUES ($1, 'investigating', 'demo-oncall', 'Root cause analysis in progress')`,
        [incidentId],
      );
      if (io) {
        io.to(roomName).emit("incident_update", { type: "investigating" });
        io.to(roomName).emit("notification", {
          id: `demo-${Date.now()}`,
          type: "incident_investigating",
          title: `🔍 Investigating: ${title}`,
          message: "Root cause analysis in progress",
          severity,
          incidentId,
          actor: "demo-oncall",
          timestamp: new Date().toISOString(),
        });
      }
    }, 25000);

    // 4. Resolved (t=50s)
    setTimeout(async () => {
      await pool.query(
        `UPDATE incidents SET status = 'resolved', updated_at = NOW(), resolved_at = NOW() WHERE id = $1`,
        [incidentId],
      );
      await pool.query(
        `INSERT INTO incident_timeline (incident_id, action, actor, message) VALUES ($1, 'resolved', 'demo-oncall', 'Fix deployed, monitoring for recurrence')`,
        [incidentId],
      );
      if (io) {
        io.to(roomName).emit("incident_update", { type: "resolved" });
        io.to(roomName).emit("notification", {
          id: `demo-${Date.now()}`,
          type: "incident_resolved",
          title: `✅ Resolved: ${title}`,
          message: "Fix deployed, monitoring for recurrence",
          severity,
          incidentId,
          actor: "demo-oncall",
          timestamp: new Date().toISOString(),
        });
      }
      console.log(`🎬 Demo incident resolved: ${title}`);
    }, 50000);
  } catch (err) {
    console.error("Demo incident lifecycle failed:", err);
  }
}

/**
 * Start demo mode — generate events at regular intervals.
 */
export function startDemoMode(
  teamId: string,
  teamSlug: string,
  io: any,
  intervalMs = 4000,
): void {
  if (demoInterval) {
    console.log("⚠️ Demo mode already running");
    return;
  }

  storedIo = io;
  storedTeamSlug = teamSlug;
  storedTeamId = teamId;

  console.log(
    `🎬 Demo mode started (team: ${teamSlug}, interval: ${intervalMs}ms)`,
  );
  demoInterval = setInterval(() => generateEvent(), intervalMs);
  // Generate one immediately
  generateEvent();
}

/**
 * Stop demo mode.
 */
export function stopDemoMode(): void {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    console.log("⏹️ Demo mode stopped");
  }
  if (incidentDemoTimeout) {
    clearTimeout(incidentDemoTimeout);
    incidentDemoTimeout = null;
  }
  storedIo = null;
  storedTeamSlug = "";
  storedTeamId = "";
}

export function isDemoRunning(): boolean {
  return demoInterval !== null;
}

export { simulateIncidentLifecycle };
