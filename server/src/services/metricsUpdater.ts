import pool from "../db/pool";
import { redis } from "../db/redis";
import { NormalizedEvent } from "./normalizers";

/**
 * After ingesting a new event, update the relevant metrics.
 * Also publishes to Redis so real-time listeners can pick it up (Phase 4).
 */
export async function updateMetricsFromEvent(
  teamId: string,
  event: NormalizedEvent,
): Promise<void> {
  try {
    switch (event.source) {
      case "github":
        if (event.eventType === "deployment") {
          await incrementDeployFrequency(teamId);
        }
        break;

      case "sentry":
        if (
          ["error", "issue_triggered", "issue_created"].includes(
            event.eventType,
          )
        ) {
          await recalculateErrorRate(teamId);
        }
        break;

      case "uptime":
        if (
          event.eventType === "ping_success" ||
          event.eventType === "ping_fail"
        ) {
          await updateUptimeMetric(teamId, event.eventType === "ping_success");
        }
        if (
          event.eventType === "latency_warning" ||
          event.eventType === "ping_success"
        ) {
          const responseTime = event.metadata.responseTime;
          if (responseTime) {
            await updateResponseTime(teamId, responseTime);
          }
        }
        break;
    }

    // Publish the new event to Redis for real-time broadcasting (Phase 4)
    console.log(`📡 Publishing to Redis: team:${teamId}:events`);
    await redis.publish(`team:${teamId}:events`, JSON.stringify(event));
  } catch (error) {
    console.error("Error updating metrics from event:", error);
  }
}

async function incrementDeployFrequency(teamId: string): Promise<void> {
  // Count deploys in the last 7 days
  const result = await pool.query(
    `
    SELECT COUNT(*) as count FROM events
    WHERE team_id = $1
      AND source = 'github'
      AND event_type = 'deployment'
      AND occurred_at >= NOW() - INTERVAL '7 days'
  `,
    [teamId],
  );

  const count = parseInt(result.rows[0].count) || 0;

  await pool.query(
    `
    INSERT INTO metrics (team_id, type, value, timestamp)
    VALUES ($1, 'deploy_frequency', $2, NOW())
  `,
    [teamId, count],
  );
}

async function recalculateErrorRate(teamId: string): Promise<void> {
  // Error rate = errors in last 24h / total events in last 24h * 100
  const result = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE severity IN ('error', 'critical')) as errors,
      COUNT(*) as total
    FROM events
    WHERE team_id = $1
      AND occurred_at >= NOW() - INTERVAL '24 hours'
  `,
    [teamId],
  );

  const errors = parseInt(result.rows[0].errors) || 0;
  const total = parseInt(result.rows[0].total) || 1;
  const errorRate = (errors / total) * 100;

  await pool.query(
    `
    INSERT INTO metrics (team_id, type, value, timestamp)
    VALUES ($1, 'error_rate', $2, NOW())
  `,
    [teamId, errorRate.toFixed(2)],
  );
}

async function updateUptimeMetric(
  teamId: string,
  isUp: boolean,
): Promise<void> {
  // Uptime = successful pings / total pings in last 24h * 100
  const result = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'ping_success') as successes,
      COUNT(*) as total
    FROM events
    WHERE team_id = $1
      AND source = 'uptime'
      AND event_type IN ('ping_success', 'ping_fail')
      AND occurred_at >= NOW() - INTERVAL '24 hours'
  `,
    [teamId],
  );

  const successes = parseInt(result.rows[0].successes) || 0;
  const total = parseInt(result.rows[0].total) || 1;
  const uptime = (successes / total) * 100;

  await pool.query(
    `
    INSERT INTO metrics (team_id, type, value, timestamp)
    VALUES ($1, 'uptime', $2, NOW())
  `,
    [teamId, uptime.toFixed(2)],
  );
}

async function updateResponseTime(
  teamId: string,
  responseTime: number,
): Promise<void> {
  await pool.query(
    `
    INSERT INTO metrics (team_id, type, value, timestamp)
    VALUES ($1, 'response_time', $2, NOW())
  `,
    [teamId, responseTime],
  );
}
