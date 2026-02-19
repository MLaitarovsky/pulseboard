// ==========================================
// PulseBoard — Shared Types
// ==========================================

// ---------- Teams ----------
export interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

// ---------- Metrics ----------
export type MetricType = 'uptime' | 'error_rate' | 'deploy_frequency' | 'response_time';

export interface Metric {
  id: string;
  teamId: string;
  type: MetricType;
  value: number;
  timestamp: Date;
}

export interface MetricsSnapshot {
  uptime: number;
  errorRate: number;
  deployFrequency: number;
  responseTime: number;
  updatedAt: Date;
}

// ---------- Events ----------
export type EventSource = 'github' | 'sentry' | 'uptime';
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface NormalizedEvent {
  id: string;
  teamId: string;
  source: EventSource;
  eventType: string;
  title: string;
  description: string;
  severity: EventSeverity;
  metadata: Record<string, any>;
  rawPayload?: Record<string, any>;
  occurredAt: Date;
  receivedAt: Date;
}

// ---------- Incidents ----------
export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'reopened';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface Incident {
  id: string;
  teamId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

// Valid state transitions for the incident state machine
export const VALID_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ['acknowledged', 'investigating'],
  acknowledged: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: ['reopened'],
  reopened: ['acknowledged', 'investigating'],
};

// ---------- Incident Timeline ----------
export type TimelineAction = 'created' | 'acknowledged' | 'escalated' | 'investigating' | 'resolved' | 'reopened' | 'comment';

export interface IncidentTimelineEntry {
  id: string;
  incidentId: string;
  action: TimelineAction;
  actor: string;
  message: string;
  createdAt: Date;
}

// ---------- Annotations ----------
export interface Annotation {
  id: string;
  teamId: string;
  userId: string;
  content: string;
  timestampTarget: Date;
  xPosition: number;
  yPosition: number;
  createdAt: Date;
}

// ---------- Socket.IO Events ----------
export interface ServerToClientEvents {
  new_event: (event: NormalizedEvent) => void;
  metrics_update: (metrics: MetricsSnapshot) => void;
  incident_update: (incident: Incident) => void;
  cursor_move: (cursor: CursorPosition) => void;
  user_joined: (user: PresenceUser) => void;
  user_left: (userId: string) => void;
  new_annotation: (annotation: Annotation) => void;
}

export interface ClientToServerEvents {
  join_team: (teamId: string) => void;
  leave_team: (teamId: string) => void;
  cursor_move: (cursor: CursorPosition) => void;
}

// ---------- Presence / Cursors ----------
export interface CursorPosition {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  page: string;
  timestamp: number;
}

export interface PresenceUser {
  userId: string;
  userName: string;
  color: string;
  joinedAt: Date;
}
