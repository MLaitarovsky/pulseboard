/**
 * Uptime Monitor Webhook Normalizer
 *
 * Handles payloads from uptime monitoring services
 * (e.g., UptimeRobot, Pingdom, BetterStack, or custom pings):
 * - ping_success: Health check passed
 * - ping_fail: Health check failed
 * - latency_warning: High response time detected
 * - ssl_expiry: SSL certificate expiring soon
 */

interface NormalizedEvent {
  source: 'uptime';
  eventType: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, any>;
  occurredAt: Date;
}

export function normalizeUptime(payload: any): NormalizedEvent {
  const eventType = detectEventType(payload);

  switch (eventType) {
    case 'ping_fail':
      return normalizePingFail(payload);
    case 'ping_success':
      return normalizePingSuccess(payload);
    case 'latency_warning':
      return normalizeLatencyWarning(payload);
    case 'ssl_expiry':
      return normalizeSslExpiry(payload);
    default:
      return normalizeGenericUptime(payload);
  }
}

function detectEventType(payload: any): string {
  // Support various uptime monitor payload formats
  if (payload.event_type) return payload.event_type;
  if (payload.alertType) return mapAlertType(payload.alertType);

  // Infer from payload contents
  if (payload.status === 'down' || payload.is_up === false) return 'ping_fail';
  if (payload.status === 'up' || payload.is_up === true) return 'ping_success';
  if (payload.response_time && payload.response_time > (payload.threshold || 500)) return 'latency_warning';
  if (payload.ssl_days_remaining != null) return 'ssl_expiry';

  return 'ping_success';
}

function mapAlertType(alertType: string): string {
  const map: Record<string, string> = {
    down: 'ping_fail',
    up: 'ping_success',
    'ssl_expiry': 'ssl_expiry',
  };
  return map[alertType] || alertType;
}

function normalizePingFail(payload: any): NormalizedEvent {
  const url = payload.url || payload.monitor_url || payload.name || 'unknown';
  const statusCode = payload.status_code || payload.http_status || null;
  const responseTime = payload.response_time || null;
  const reason = payload.reason || payload.error || (statusCode ? `HTTP ${statusCode}` : 'Connection failed');

  return {
    source: 'uptime',
    eventType: 'ping_fail',
    title: `Health check FAILED — ${extractHost(url)}`,
    description: `${url} is down. ${reason}${responseTime ? ` (${responseTime}ms)` : ''}`,
    severity: 'critical',
    metadata: {
      url,
      statusCode,
      responseTime,
      reason,
      monitorId: payload.monitor_id || payload.id || null,
      region: payload.region || null,
    },
    occurredAt: new Date(payload.timestamp || payload.datetime || Date.now()),
  };
}

function normalizePingSuccess(payload: any): NormalizedEvent {
  const url = payload.url || payload.monitor_url || payload.name || 'unknown';
  const statusCode = payload.status_code || payload.http_status || 200;
  const responseTime = payload.response_time || null;

  return {
    source: 'uptime',
    eventType: 'ping_success',
    title: `Health check passed — ${extractHost(url)}`,
    description: `${url} responded with ${statusCode}${responseTime ? ` in ${responseTime}ms` : ''}`,
    severity: 'info',
    metadata: {
      url,
      statusCode,
      responseTime,
      monitorId: payload.monitor_id || payload.id || null,
      region: payload.region || null,
    },
    occurredAt: new Date(payload.timestamp || payload.datetime || Date.now()),
  };
}

function normalizeLatencyWarning(payload: any): NormalizedEvent {
  const url = payload.url || payload.monitor_url || payload.name || 'unknown';
  const responseTime = payload.response_time || 0;
  const threshold = payload.threshold || 500;

  return {
    source: 'uptime',
    eventType: 'latency_warning',
    title: `High latency detected — ${extractHost(url)} (${responseTime}ms)`,
    description: `${url} responded in ${responseTime}ms, exceeding the ${threshold}ms threshold`,
    severity: 'warning',
    metadata: {
      url,
      responseTime,
      threshold,
      monitorId: payload.monitor_id || payload.id || null,
      region: payload.region || null,
    },
    occurredAt: new Date(payload.timestamp || payload.datetime || Date.now()),
  };
}

function normalizeSslExpiry(payload: any): NormalizedEvent {
  const url = payload.url || payload.monitor_url || 'unknown';
  const daysRemaining = payload.ssl_days_remaining || payload.days || 0;

  return {
    source: 'uptime',
    eventType: 'ssl_expiry',
    title: `SSL expiring soon — ${extractHost(url)} (${daysRemaining} days)`,
    description: `SSL certificate for ${url} expires in ${daysRemaining} days`,
    severity: daysRemaining <= 7 ? 'critical' : 'warning',
    metadata: {
      url,
      daysRemaining,
      monitorId: payload.monitor_id || payload.id || null,
    },
    occurredAt: new Date(payload.timestamp || payload.datetime || Date.now()),
  };
}

function normalizeGenericUptime(payload: any): NormalizedEvent {
  const url = payload.url || payload.monitor_url || 'unknown';

  return {
    source: 'uptime',
    eventType: 'unknown',
    title: `Uptime event — ${extractHost(url)}`,
    description: `Received uptime event for ${url}`,
    severity: 'info',
    metadata: { url, raw: true },
    occurredAt: new Date(payload.timestamp || Date.now()),
  };
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
