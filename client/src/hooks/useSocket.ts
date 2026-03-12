'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface PresenceUser {
  userId: string;
  userName: string;
  color: string;
  joinedAt: string;
}

interface CursorPosition {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  page: string;
  timestamp: number;
}

export interface LiveEvent {
  id: string;
  source: string;
  eventType: string;
  title: string;
  severity: string;
  occurredAt: string;
}

export interface LiveAnnotation {
  id: string;
  team_id: string;
  user_id: string;
  content: string;
  timestamp_target: string;
  created_at: string;
}

export interface TimelineCursorData {
  userId: string;
  userName: string;
  color: string;
  timestamp: string;
  updatedAt: number;
}

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  incidentId?: string;
  actor: string;
  timestamp: string;
}

interface UseSocketReturn {
  status: ConnectionStatus;
  viewers: PresenceUser[];
  cursors: Map<string, CursorPosition>;
  sendCursorMove: (x: number, y: number, page: string) => void;
  sendTimelineCursor: (timestamp: string | null) => void;
  timelineCursors: Map<string, TimelineCursorData>;
  lastEvent: LiveEvent | null;
  eventBatch: LiveEvent[];
  metricsVersion: number;
  incidentVersion: number;
  lastAnnotation: LiveAnnotation | null;
  lastNotification: LiveNotification | null;
}

const BATCH_INTERVAL = 200; // ms — flush buffered events every 200ms

export function useSocket(teamId: string): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [eventBatch, setEventBatch] = useState<LiveEvent[]>([]);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [incidentVersion, setIncidentVersion] = useState(0);
  const [lastAnnotation, setLastAnnotation] = useState<LiveAnnotation | null>(null);
  const [timelineCursors, setTimelineCursors] = useState<Map<string, TimelineCursorData>>(new Map());
  const [lastNotification, setLastNotification] = useState<LiveNotification | null>(null);

  // ─── Event batching buffer ───
  const eventBufferRef = useRef<LiveEvent[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimeRef = useRef<string | null>(null);

  // Flush buffered events to state
  const flushBuffer = useCallback(() => {
    if (eventBufferRef.current.length === 0) return;
    const batch = [...eventBufferRef.current];
    eventBufferRef.current = [];

    // Set the most recent event as lastEvent (for components that watch individual events)
    setLastEvent(batch[batch.length - 1]);

    // Set the full batch (for components that want all at once)
    setEventBatch(batch);
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // Debug: log all incoming events
    socket.onAny((eventName, ...args) => {
      console.log(`📨 Socket event: ${eventName}`, args);
    });

    // --- Connection lifecycle ---
    socket.on('connect', () => {
      setStatus('connected');
      console.log('🟢 Socket connected:', socket.id);
      socket.emit('join_team', {
        teamId,
        userId: `user-${socket.id?.substring(0, 6)}`,
        userName: `User ${socket.id?.substring(0, 4)}`,
      });
    });

    socket.on('disconnect', (reason) => {
      setStatus('disconnected');
      console.log(`🔴 Socket disconnected: ${reason}`);
    });

    socket.on('reconnect_attempt', (attempt) => {
      setStatus('connecting');
      console.log(`🟡 Reconnecting... attempt ${attempt}`);
    });

    // ─── Reconnect recovery: fetch missed events ───
    socket.on('reconnect', () => {
      setStatus('connected');
      console.log('🟢 Socket reconnected — fetching missed events');

      // Re-join room
      socket.emit('join_team', {
        teamId,
        userId: `user-${socket.id?.substring(0, 6)}`,
        userName: `User ${socket.id?.substring(0, 4)}`,
      });

      // Fetch events since last received timestamp
      if (lastEventTimeRef.current) {
        const since = encodeURIComponent(lastEventTimeRef.current);
        fetch(`/api/teams/${teamId}/events?limit=50&from=${since}`)
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.events?.length > 0) {
              console.log(`📥 Recovered ${data.events.length} missed events`);
              const recovered: LiveEvent[] = data.events.map((e: any) => ({
                id: e.id,
                source: e.source,
                eventType: e.event_type || e.eventType || '',
                title: e.title,
                severity: e.severity,
                occurredAt: e.occurred_at || e.occurredAt || new Date().toISOString(),
              }));
              // Push recovered events through the batch system
              eventBufferRef.current.push(...recovered);
              flushBuffer();
            }
          })
          .catch((err) => console.warn('Failed to recover missed events:', err));
      }

      // Also bump metrics/incidents version to trigger refetches
      setMetricsVersion((v) => v + 1);
      setIncidentVersion((v) => v + 1);
    });

    // --- Presence ---
    socket.on('viewers_list', (list: PresenceUser[]) => {
      setViewers(list);
    });

    socket.on('user_joined', (user: PresenceUser) => {
      setViewers((prev) => [...prev.filter(u => u.userId !== user.userId), user]);
    });

    socket.on('user_left', (userId: string) => {
      setViewers((prev) => prev.filter(u => u.userId !== userId));
      setCursors((prev) => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    // --- Cursor tracking ---
    socket.on('cursor_move', (cursor: CursorPosition) => {
      setCursors((prev) => {
        const next = new Map(prev);
        next.set(cursor.userId, cursor);
        return next;
      });
    });

    // ─── Live data events with BATCHING ───
    socket.on('new_event', (event: any) => {
      console.log('🔥 new_event received in hook:', event);

      const normalized: LiveEvent = {
        id: event.id || `live-${Date.now()}-${Math.random()}`,
        source: event.source,
        eventType: event.eventType || event.event_type || '',
        title: event.title,
        severity: event.severity,
        occurredAt: event.occurredAt || event.occurred_at || new Date().toISOString(),
      };

      // Track last received time for reconnect recovery
      lastEventTimeRef.current = normalized.occurredAt;

      // Buffer the event instead of setting state immediately
      eventBufferRef.current.push(normalized);

      // Start a flush timer if one isn't already running
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(() => {
          batchTimerRef.current = null;
          // Flush all buffered events at once
          const batch = [...eventBufferRef.current];
          eventBufferRef.current = [];

          if (batch.length > 0) {
            setLastEvent(batch[batch.length - 1]);
            setEventBatch(batch);
          }
        }, BATCH_INTERVAL);
      }
    });

    socket.on('metrics_update', () => {
      console.log('📊 metrics_update received');
      setMetricsVersion((v) => v + 1);
    });

    socket.on('incident_update', () => {
      console.log('🚨 incident_update received');
      setIncidentVersion((v) => v + 1);
    });

    socket.on('new_annotation', (annotation: any) => {
      console.log('📌 new_annotation received:', annotation);
      setLastAnnotation(annotation);
    });

    // ─── Timeline cursor sync ───
    socket.on('timeline_cursor', (data: any) => {
      if (!data.userId) return;
      setTimelineCursors((prev) => {
        const next = new Map(prev);
        if (data.timestamp === null) {
          // User left the timeline — remove their cursor
          next.delete(data.userId);
        } else {
          next.set(data.userId, {
            userId: data.userId,
            userName: data.userName || 'User',
            color: data.color || '#60a5fa',
            timestamp: data.timestamp,
            updatedAt: Date.now(),
          });
        }
        return next;
      });
    });

    // ─── In-app notifications ───
    socket.on('notification', (data: LiveNotification) => {
      console.log('🔔 notification received:', data);
      setLastNotification(data);
    });

    // Cleanup
    return () => {
      if (batchTimerRef.current) {
        clearTimeout(batchTimerRef.current);
        batchTimerRef.current = null;
      }
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [teamId, flushBuffer]);

  // Clean up stale cursors
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        next.forEach((cursor, userId) => {
          if (now - cursor.timestamp > 5000) {
            next.delete(userId);
          }
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const sendCursorMove = useCallback((x: number, y: number, page: string) => {
    socketRef.current?.emit('cursor_move', { x, y, page });
  }, []);

  // Send timeline-specific cursor (hovered timestamp or null when leaving)
  const sendTimelineCursor = useCallback((timestamp: string | null) => {
    socketRef.current?.emit('timeline_cursor', { timestamp });
  }, []);

  // Clean up stale timeline cursors (no update in 3 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setTimelineCursors((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        let changed = false;
        next.forEach((cursor, userId) => {
          if (now - cursor.updatedAt > 3000) {
            next.delete(userId);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return { status, viewers, cursors, sendCursorMove, sendTimelineCursor, timelineCursors, lastEvent, eventBatch, metricsVersion, incidentVersion, lastAnnotation, lastNotification };
}
