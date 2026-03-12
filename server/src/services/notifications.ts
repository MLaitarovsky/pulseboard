import pool from '../db/pool';

interface NotificationPayload {
  teamId: string;
  type: 'incident_created' | 'incident_resolved' | 'incident_escalated' | 'incident_acknowledged' | 'incident_investigating' | 'incident_reopened' | 'severity_change';
  incident: {
    id: string;
    title: string;
    severity: string;
    status: string;
    createdBy?: string;
  };
  actor: string;
  message: string;
  timestamp: string;
}

/**
 * Fire notifications for an incident state change.
 * 1. Broadcast via Socket.IO (in-app toast)
 * 2. Deliver to configured webhook URLs
 * 3. Log everything to notification_log
 */
export async function fireIncidentNotification(
  payload: NotificationPayload,
  io?: any
): Promise<void> {
  const { teamId, type, incident, actor, message, timestamp } = payload;

  // 1. Broadcast in-app toast via Socket.IO
  if (io) {
    io.to(`team:${teamId}`).emit('notification', {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: getNotificationTitle(type, incident),
      message,
      severity: incident.severity,
      incidentId: incident.id,
      actor,
      timestamp,
    });
  }

  // Log the in-app notification
  await logNotification(teamId, type, 'in_app', {
    subject: getNotificationTitle(type, incident),
    body: message,
    metadata: { incidentId: incident.id, actor },
    status: 'sent',
  });

  // 2. Deliver to configured webhook URLs
  try {
    const configs = await pool.query(
      `SELECT * FROM webhook_configs WHERE team_id = $1 AND enabled = true AND $2 = ANY(events)`,
      [teamId, type]
    );

    for (const config of configs.rows) {
      await deliverWebhook(config, payload);
    }
  } catch (err) {
    console.warn('Could not query webhook configs:', err);
  }
}

/**
 * Deliver a webhook POST to a configured URL.
 */
async function deliverWebhook(
  config: { id: string; team_id: string; name: string; url: string; secret?: string },
  payload: NotificationPayload
): Promise<void> {
  const body = JSON.stringify({
    event: payload.type,
    timestamp: payload.timestamp,
    incident: payload.incident,
    actor: payload.actor,
    message: payload.message,
  });

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'PulseBoard-Webhook/1.0',
      'X-PulseBoard-Event': payload.type,
    };

    // Add HMAC signature if secret is configured
    if (config.secret) {
      const crypto = require('crypto');
      const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
      headers['X-PulseBoard-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const statusText = `${res.status} ${res.statusText}`;
    const success = res.ok;

    console.log(`📨 Webhook [${config.name}] → ${config.url}: ${statusText}`);

    await logNotification(config.team_id, payload.type, 'webhook', {
      recipient: config.url,
      subject: `${payload.type}: ${payload.incident.title}`,
      body: body.substring(0, 500),
      metadata: { webhookConfigId: config.id, webhookName: config.name, responseStatus: res.status },
      status: success ? 'sent' : 'failed',
      error: success ? undefined : statusText,
    });
  } catch (err: any) {
    console.error(`❌ Webhook [${config.name}] failed:`, err.message);

    await logNotification(config.team_id, payload.type, 'webhook', {
      recipient: config.url,
      subject: `${payload.type}: ${payload.incident.title}`,
      body: body.substring(0, 500),
      metadata: { webhookConfigId: config.id, webhookName: config.name },
      status: 'failed',
      error: err.message || 'Unknown error',
    });
  }
}

/**
 * Log a notification to the database.
 */
async function logNotification(
  teamId: string,
  type: string,
  channel: string,
  data: {
    recipient?: string;
    subject?: string;
    body?: string;
    metadata?: Record<string, any>;
    status: string;
    error?: string;
  }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notification_log (team_id, type, channel, recipient, subject, body, metadata, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        teamId, type, channel,
        data.recipient || null,
        data.subject || null,
        data.body || null,
        JSON.stringify(data.metadata || {}),
        data.status,
        data.error || null,
      ]
    );
  } catch (err) {
    console.warn('Failed to log notification:', err);
  }
}

function getNotificationTitle(type: string, incident: { title: string; severity: string }): string {
  switch (type) {
    case 'incident_created': return `🚨 New incident: ${incident.title}`;
    case 'incident_resolved': return `✅ Resolved: ${incident.title}`;
    case 'incident_escalated': return `⬆️ Escalated: ${incident.title}`;
    case 'incident_acknowledged': return `👁️ Acknowledged: ${incident.title}`;
    case 'incident_investigating': return `🔍 Investigating: ${incident.title}`;
    case 'incident_reopened': return `🔄 Reopened: ${incident.title}`;
    case 'severity_change': return `⚠️ Severity changed: ${incident.title}`;
    default: return `📋 ${incident.title}`;
  }
}

export { NotificationPayload };
