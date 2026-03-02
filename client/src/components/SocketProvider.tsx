'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useSocket, ConnectionStatus, LiveEvent } from '@/hooks/useSocket';

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

interface SocketContextValue {
  status: ConnectionStatus;
  viewers: PresenceUser[];
  cursors: Map<string, CursorPosition>;
  sendCursorMove: (x: number, y: number, page: string) => void;
  lastEvent: LiveEvent | null;
  metricsVersion: number;
  incidentVersion: number;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({
  teamId,
  children,
}: {
  teamId: string;
  children: ReactNode;
}) {
  const socket = useSocket(teamId);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}
