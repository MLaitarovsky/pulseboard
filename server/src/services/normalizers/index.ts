import { normalizeGitHub } from './github';
import { normalizeSentry } from './sentry';
import { normalizeUptime } from './uptime';

export interface NormalizedEvent {
  source: 'github' | 'sentry' | 'uptime';
  eventType: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, any>;
  occurredAt: Date;
}

/**
 * Normalize a raw webhook payload into our unified event schema.
 * Returns null if the payload can't be parsed.
 */
export function normalizePayload(
  source: string,
  payload: any,
  headers?: Record<string, any>
): NormalizedEvent | null {
  try {
    switch (source) {
      case 'github': {
        // GitHub sends the event type in the X-GitHub-Event header
        const eventType = headers?.['x-github-event'] || payload.action || 'unknown';
        return normalizeGitHub(eventType, payload);
      }
      case 'sentry': {
        return normalizeSentry(payload);
      }
      case 'uptime': {
        return normalizeUptime(payload);
      }
      default:
        console.warn(`Unknown webhook source: ${source}`);
        return null;
    }
  } catch (error) {
    console.error(`Failed to normalize ${source} payload:`, error);
    return null;
  }
}
