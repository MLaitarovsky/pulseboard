import { Router, Request, Response } from "express";
import pool from "../db/pool";
import { normalizePayload } from "../services/normalizers";
import { updateMetricsFromEvent } from "../services/metricsUpdater";
import { verifyGitHubSignature } from "../utils/webhookVerify";
import { resolveTeamId } from "../utils/resolveTeam";

const router = Router();

/**
 * POST /api/webhooks/:source
 *
 * Receives webhook payloads from external services.
 * Query param: ?team=<teamSlugOrId> (required)
 *
 * Example:
 *   POST /api/webhooks/github?team=acme-eng
 *   POST /api/webhooks/sentry?team=acme-eng
 *   POST /api/webhooks/uptime?team=acme-eng
 */
router.post("/:source", async (req: Request, res: Response) => {
  const source = req.params.source as string;
  const teamParam = req.query.team as string;

  // Validate source
  const validSources = ["github", "sentry", "uptime"];
  if (!validSources.includes(source)) {
    return res.status(400).json({
      error: `Invalid source: ${source}. Must be one of: ${validSources.join(", ")}`,
    });
  }

  // Validate team
  if (!teamParam) {
    return res.status(400).json({
      error: "Missing required query parameter: team (e.g., ?team=acme-eng)",
    });
  }

  const teamId = await resolveTeamId(teamParam);
  if (!teamId) {
    return res.status(404).json({ error: `Team not found: ${teamParam}` });
  }

  // Verify GitHub webhook signature (if secret is configured)
  if (source === "github") {
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && secret !== "your-webhook-secret-here") {
      const signature = req.headers["x-hub-signature-256"] as string;
      const isValid = verifyGitHubSignature(
        JSON.stringify(req.body),
        signature,
        secret,
      );
      if (!isValid) {
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }
  }

  const payload = req.body;

  // Normalize the payload into our unified event schema
  const normalized = normalizePayload(
    source,
    payload,
    req.headers as Record<string, any>,
  );

  if (!normalized) {
    return res.status(422).json({
      error: "Could not normalize payload",
      source,
    });
  }

  try {
    // Store the normalized event + raw payload in the database
    const result = await pool.query(
      `
      INSERT INTO events (team_id, source, event_type, title, description, severity, metadata, raw_payload, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, source, event_type, title, severity, occurred_at, received_at
    `,
      [
        teamId,
        normalized.source,
        normalized.eventType,
        normalized.title,
        normalized.description,
        normalized.severity,
        JSON.stringify(normalized.metadata),
        JSON.stringify(payload),
        normalized.occurredAt,
      ],
    );

    const storedEvent = result.rows[0];

    // Update metrics based on the event
    await updateMetricsFromEvent(teamId, normalized);

    console.log(
      `📡 Webhook [${source}] → ${normalized.title} (${normalized.severity})`,
    );

    res.status(201).json({
      status: "received",
      event: storedEvent,
    });
  } catch (error) {
    console.error(`Error processing ${source} webhook:`, error);
    res.status(500).json({ error: "Failed to process webhook" });
  }
});

/**
 * GET /api/webhooks/test/:source
 *
 * Convenience endpoint to test webhooks by sending a fake payload.
 * Only available in development.
 */
router.get("/test/:source", async (req: Request, res: Response) => {
  const source = req.params.source as string;
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not available in production" });
  }

  const teamParam = (req.query.team as string) || "acme-eng";

  const testPayloads: Record<string, any> = {
    github: {
      action: "completed",
      workflow_run: {
        name: "CI Pipeline",
        conclusion: Math.random() > 0.3 ? "success" : "failure",
        head_branch: "main",
        actor: { login: "demo-user" },
        html_url: "https://github.com/demo/repo/actions/runs/123",
        run_number: Math.floor(Math.random() * 500),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      repository: { full_name: "acme/pulseboard" },
      sender: { login: "demo-user" },
    },
    sentry: {
      action: "triggered",
      data: {
        issue: {
          id: `ISSUE-${Math.floor(Math.random() * 9999)}`,
          title: [
            "TypeError: Cannot read properties of undefined",
            "RangeError: Maximum call stack size exceeded",
            "NetworkError: Failed to fetch",
            "SyntaxError: Unexpected token",
            "ReferenceError: x is not defined",
          ][Math.floor(Math.random() * 5)],
          culprit: "/api/users/profile",
          project: { name: "pulseboard-api", slug: "pulseboard-api" },
          level: Math.random() > 0.5 ? "error" : "warning",
          count: Math.floor(Math.random() * 50) + 1,
          userCount: Math.floor(Math.random() * 10) + 1,
          firstSeen: new Date(Date.now() - 86400000).toISOString(),
          lastSeen: new Date().toISOString(),
        },
      },
    },
    uptime: {
      url: [
        "https://api.acme.com",
        "https://app.acme.com",
        "https://cdn.acme.com",
      ][Math.floor(Math.random() * 3)],
      status: Math.random() > 0.2 ? "up" : "down",
      status_code: Math.random() > 0.2 ? 200 : 503,
      response_time: Math.floor(Math.random() * 800) + 50,
      threshold: 500,
      timestamp: new Date().toISOString(),
    },
  };

  const payload = testPayloads[source];
  if (!payload) {
    return res
      .status(400)
      .json({ error: `No test payload for source: ${source}` });
  }

  // Normalize
  const headers =
    source === "github" ? { "x-github-event": "workflow_run" } : {};
  const normalized = normalizePayload(source, payload, headers);

  if (!normalized) {
    return res.status(422).json({ error: "Normalization failed" });
  }

  const teamId = await resolveTeamId(teamParam);
  if (!teamId) {
    return res.status(404).json({ error: "Team not found" });
  }

  // Store
  const result = await pool.query(
    `
    INSERT INTO events (team_id, source, event_type, title, description, severity, metadata, raw_payload, occurred_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, source, event_type, title, severity, occurred_at, received_at
  `,
    [
      teamId,
      normalized.source,
      normalized.eventType,
      normalized.title,
      normalized.description,
      normalized.severity,
      JSON.stringify(normalized.metadata),
      JSON.stringify(payload),
      normalized.occurredAt,
    ],
  );

  await updateMetricsFromEvent(teamId, normalized);

  console.log(`🧪 Test webhook [${source}] → ${normalized.title}`);

  res.json({
    status: "test_event_created",
    event: result.rows[0],
    normalized,
  });
});

export default router;
