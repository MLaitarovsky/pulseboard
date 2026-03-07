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

interface UseSocketReturn {
  status: ConnectionStatus;
  viewers: PresenceUser[];
  cursors: Map<string, CursorPosition>;
  sendCursorMove: (x: number, y: number, page: string) => void;
  lastEvent: LiveEvent | null;
  eventBatch: LiveEvent[];
  lastAnnotation: LiveAnnotation | null;
  metricsVersion: number;
  incidentVersion: number;
}

const BATCH_INTERVAL = 200;

export function useSocket(teamId: string): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null);
  const [eventBatch, setEventBatch] = useState<LiveEvent[]>([]);
  const [lastAnnotation, setLastAnnotation] = useState<LiveAnnotation | null>(null);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [incidentVersion, setIncidentVersion] = useState(0);

  const eventBufferRef = useRef<LiveEvent[]>([]);
  const batchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastEventTimeRef = useRef<string | null>(null);

  const flushBuffer = useCallback(() => {
    if (eventBufferRef.current.length === 0) return;
    const batch = [...eventBufferRef.current];
    eventBufferRef.current = [];
    setLastEvent(batch[batch.length - 1]);
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

    socket.onAny((eventName, ...args) => {
      console.log(`📨 Socket event: ${eventName}`, args);
    });

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

    socket.on('reconnect', () => {
      setStatus('connected');
      console.log('🟢 Socket reconnected — fetching missed events');
      socket.emit('join_team', {
        teamId,
        userId: `user-${socket.id?.substring(0, 6)}`,
        userName: `User ${socket.id?.substring(0, 4)}`,
      });

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
              eventBufferRef.current.push(...recovered);
              flushBuffer();
            }
          })
          .catch((err) => console.warn('Failed to recover missed events:', err));
      }

      setMetricsVersion((v) => v + 1);
      setIncidentVersion((v) => v + 1);
    });

    // --- Presence ---
    socket.on('viewers_list', (list: PresenceUser[]) => setViewers(list));
    socket.on('user_joined', (user: PresenceUser) => {
      setViewers((prev) => [...prev.filter(u => u.userId !== user.userId), user]);
    });
    socket.on('user_left', (userId: string) => {
      setViewers((prev) => prev.filter(u => u.userId !== userId));
      setCursors((prev) => { const next = new Map(prev); next.delete(userId); return next; });
    });

    // --- Cursors ---
    socket.on('cursor_move', (cursor: CursorPosition) => {
      setCursors((prev) => { const next = new Map(prev); next.set(cursor.userId, cursor); return next; });
    });

    // --- Live events with batching ---
    socket.on('new_event', (event: any) => {
      const normalized: LiveEvent = {
        id: event.id || `live-${Date.now()}-${Math.random()}`,
        source: event.source,
        eventType: event.eventType || event.event_type || '',
        title: event.title,
        severity: event.severity,
        occurredAt: event.occurredAt || event.occurred_at || new Date().toISOString(),
      };
      lastEventTimeRef.current = normalized.occurredAt;
      eventBufferRef.current.push(normalized);
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(() => {
          batchTimerRef.current = null;
          const batch = [...eventBufferRef.current];
          eventBufferRef.current = [];
          if (batch.length > 0) {
            setLastEvent(batch[batch.length - 1]);
            setEventBatch(batch);
          }
        }, BATCH_INTERVAL);
      }
    });

    // --- Annotations (real-time from other users) ---
    socket.on('new_annotation', (annotation: any) => {
      console.log('📌 new_annotation received:', annotation);
      setLastAnnotation(annotation);
    });

    socket.on('metrics_update', () => {
      console.log('📊 metrics_update received');
      setMetricsVersion((v) => v + 1);
    });

    socket.on('incident_update', () => {
      console.log('🚨 incident_update received');
      setIncidentVersion((v) => v + 1);
    });

    return () => {
      if (batchTimerRef.current) { clearTimeout(batchTimerRef.current); batchTimerRef.current = null; }
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
          if (now - cursor.timestamp > 5000) next.delete(userId);
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const sendCursorMove = useCallback((x: number, y: number, page: string) => {
    socketRef.current?.emit('cursor_move', { x, y, page });
  }, []);

  return { status, viewers, cursors, sendCursorMove, lastEvent, eventBatch, lastAnnotation, metricsVersion, incidentVersion };
}
