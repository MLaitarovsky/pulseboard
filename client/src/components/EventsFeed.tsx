'use client';

import { useEffect, useState, useRef } from 'react';
import { Github, Bug, Wifi, ChevronRight, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useSocketContext } from './SocketProvider';

interface EventItem {
  id?: string;
  source: 'github' | 'sentry' | 'uptime';
  event_type?: string;
  eventType?: string;
  title: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  occurred_at?: string;
  occurredAt?: string;
  received_at?: string;
  isNew?: boolean;
}

interface EventsResponse {
  events: EventItem[];
  total: number;
}

const TEAM_ID = 'acme-eng';

const sourceIcons: Record<string, any> = {
  github: Github,
  sentry: Bug,
  uptime: Wifi,
};

const sourceColors: Record<string, string> = {
  github: 'text-accent-purple bg-accent-purple/10',
  sentry: 'text-accent-red bg-accent-red/10',
  uptime: 'text-accent-green bg-accent-green/10',
};

const severityDots: Record<string, string> = {
  info: 'bg-accent-blue',
  warning: 'bg-accent-yellow',
  error: 'bg-accent-red',
  critical: 'bg-accent-red animate-pulse',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function EventsFeed({ limit = 20 }: { limit?: number }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on, off } = useSocketContext();

  async function fetchEvents() {
    try {
      setError(null);
      const res = await fetch(`/api/teams/${TEAM_ID}/events?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: EventsResponse = await res.json();
      setEvents(data.events);
    } catch (err) {
      setError('Could not load events');
      console.error('Events fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  // Listen for real-time events via Socket.IO
  useEffect(() => {
    function handleNewEvent(event: any) {
      const normalized: EventItem = {
        id: event.id || `live-${Date.now()}`,
        source: event.source,
        event_type: event.eventType || event.event_type,
        title: event.title,
        severity: event.severity,
        occurred_at: event.occurredAt || event.occurred_at || new Date().toISOString(),
        isNew: true,
      };

      setEvents((prev) => {
        // Prepend new event, keep max of `limit` items
        const updated = [normalized, ...prev].slice(0, limit);
        return updated;
      });

      // Remove the "isNew" highlight after 3 seconds
      setTimeout(() => {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === normalized.id ? { ...e, isNew: false } : e
          )
        );
      }, 3000);
    }

    on('new_event', handleNewEvent);
    return () => off('new_event', handleNewEvent);
  }, [on, off, limit]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
            <div className="flex-1">
              <div className="skeleton h-3.5 w-3/4 mb-2" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-dim">
        <p className="text-sm mb-3">{error}</p>
        <button
          onClick={() => { setLoading(true); fetchEvents(); }}
          className="flex items-center gap-1.5 text-xs text-accent-green hover:underline"
        >
          <RefreshCw className="w-3 h-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {events.map((event, index) => {
        const Icon = sourceIcons[event.source] || Wifi;
        const time = event.occurred_at || event.occurredAt || '';
        return (
          <div
            key={event.id || index}
            className={clsx(
              'flex items-start gap-3 p-3 rounded-lg hover:bg-surface-2 transition-all cursor-default group',
              event.isNew && 'bg-accent-green/5 border-l-2 border-accent-green'
            )}
          >
            {/* Source icon */}
            <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', sourceColors[event.source])}>
              <Icon className="w-3.5 h-3.5" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', severityDots[event.severity])} />
                <p className="text-sm text-text-primary truncate">{event.title}</p>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                  {event.source}
                </span>
                <span className="text-text-dim/30">·</span>
                <span className="text-[10px] text-text-dim">
                  {time ? timeAgo(time) : 'just now'}
                </span>
                {event.isNew && (
                  <span className="text-[9px] font-mono uppercase tracking-wider text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded">
                    live
                  </span>
                )}
              </div>
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-text-dim/0 group-hover:text-text-dim/50 transition-colors shrink-0 mt-2" />
          </div>
        );
      })}
    </div>
  );
}
