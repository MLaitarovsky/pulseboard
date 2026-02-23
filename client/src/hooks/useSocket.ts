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

interface UseSocketReturn {
  status: ConnectionStatus;
  viewers: PresenceUser[];
  cursors: Map<string, CursorPosition>;
  sendCursorMove: (x: number, y: number, page: string) => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

export function useSocket(teamId: string): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [viewers, setViewers] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Map<string, CursorPosition>>(new Map());

  useEffect(() => {
    // Connect to Socket.IO server
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // --- Connection lifecycle ---
    socket.on('connect', () => {
      setStatus('connected');
      console.log('🟢 Socket connected');
      // Join team room
      socket.emit('join_team', {
        teamId,
        userId: `user-${socket.id?.substring(0, 6)}`,
        userName: `User ${socket.id?.substring(0, 4)}`,
      });
    });

    socket.on('connecting', () => setStatus('connecting'));

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
      console.log('🟢 Socket reconnected');
      // Re-join team room after reconnect
      socket.emit('join_team', {
        teamId,
        userId: `user-${socket.id?.substring(0, 6)}`,
        userName: `User ${socket.id?.substring(0, 4)}`,
      });
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

    // Cleanup
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [teamId]);

  // Clean up stale cursors (no update in 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors((prev) => {
        const now = Date.now();
        const next = new Map(prev);
        for (const [userId, cursor] of next) {
          if (now - cursor.timestamp > 5000) {
            next.delete(userId);
          }
        }
        return next;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const sendCursorMove = useCallback((x: number, y: number, page: string) => {
    socketRef.current?.emit('cursor_move', { x, y, page });
  }, []);

  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
  }, []);

  const off = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  return { status, viewers, cursors, sendCursorMove, on, off };
}
