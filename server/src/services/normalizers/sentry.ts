/**
 * Sentry Webhook Normalizer
 *
 * Handles Sentry issue and event webhooks:
 * - issue: New error, resolved, assigned, etc.
 * - event_alert: Alert rule triggered
 * - metric_alert: Metric threshold breached
 */

interface NormalizedEvent {
  source: 'sentry';
  eventType: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, any>;
  occurredAt: Date;
}

export function normalizeSentry(payload: any): NormalizedEvent {
  // Sentry sends different payload shapes depending on the integration type
  // Check for issue alerts, metric alerts, or generic webhook

  if (payload.action && payload.data?.issue) {
    return normalizeIssueAlert(payload);
  }

  if (payload.data?.metric_alert) {
    return normalizeMetricAlert(payload);
  }

  if (payload.data?.event) {
    return normalizeEventAlert(payload);
  }

  // Fallback for generic/unknown payloads
  return normalizeGenericSentry(payload);
}

function normalizeIssueAlert(payload: any): NormalizedEvent {
  const issue = payload.data.issue;
  const action = payload.action || 'triggered';
  const title = issue.title || 'Unknown error';
  const culprit = issue.culprit || '';
  const project = issue.project?.name || issue.project?.slug || 'unknown';
  const level = issue.level || 'error';
  const count = issue.count || 1;
  const userCount = issue.userCount || 0;

  const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    fatal: 'critical',
    debug: 'info',
  };

  const actionTitles: Record<string, string> = {
    triggered: title,
    created: `New error: ${title}`,
    resolved: `Resolved: ${title}`,
    assigned: `Assigned: ${title}`,
    ignored: `Ignored: ${title}`,
  };

  return {
    source: 'sentry',
    eventType: `issue_${action}`,
    title: actionTitles[action] || title,
    description: `${culprit} in ${project} — ${count} events, ${userCount} users affected`,
    severity: action === 'resolved' ? 'info' : severityMap[level] || 'error',
    metadata: {
      action,
      issueId: issue.id,
      shortId: issue.shortId,
      title,
      culprit,
      project,
      level,
      count: parseInt(count),
      userCount: parseInt(userCount),
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      url: issue.permalink || null,
    },
    occurredAt: new Date(issue.lastSeen || Date.now()),
  };
}

function normalizeMetricAlert(payload: any): NormalizedEvent {
  const alert = payload.data.metric_alert;
  const name = alert.title || 'Metric alert';
  const status = payload.data.description_title || 'triggered';

  return {
    source: 'sentry',
    eventType: 'metric_alert',
    title: `Metric alert: ${name}`,
    description: status,
    severity: 'warning',
    metadata: {
      alertId: alert.id,
      name,
      status,
      dateCreated: alert.date_created,
    },
    occurredAt: new Date(alert.date_created || Date.now()),
  };
}

function normalizeEventAlert(payload: any): NormalizedEvent {
  const event = payload.data.event;
  const title = event.title || event.message || 'Unknown event';
  const level = event.level || event.tags?.find((t: any) => t.key === 'level')?.value || 'error';
  const url = event.web_url || event.url || null;

  const severityMap: Record<string, 'info' | 'warning' | 'error' | 'critical'> = {
    info: 'info',
    warning: 'warning',
    error: 'error',
    fatal: 'critical',
  };

  return {
    source: 'sentry',
    eventType: 'error',
    title,
    description: event.culprit || event.message || '',
    severity: severityMap[level] || 'error',
    metadata: {
      eventId: event.event_id,
      title,
      level,
      platform: event.platform,
      url,
      tags: event.tags || [],
    },
    occurredAt: new Date(event.datetime || event.received || Date.now()),
  };
}

function normalizeGenericSentry(payload: any): NormalizedEvent {
  return {
    source: 'sentry',
    eventType: 'unknown',
    title: payload.message || 'Sentry event',
    description: JSON.stringify(payload).substring(0, 200),
    severity: 'warning',
    metadata: {
      raw: true,
    },
    occurredAt: new Date(),
  };
}
