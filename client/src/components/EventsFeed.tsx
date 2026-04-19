'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Github, Bug, Wifi, ChevronRight, RefreshCw, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import { useSocketContext } from './SocketProvider';
import { useTeamId } from './TeamProvider';

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
  const TEAM_ID = useTeamId();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent } = useSocketContext();

  // ─── "New events" banner state ───
  const [pendingEvents, setPendingEvents] = useState<EventItem[]>([]);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // ─── Detect scroll position ───
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setIsScrolledDown(container.scrollTop > 60);
  }, []);

  // ─── React to live events from socket ───
  const lastProcessedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    // Deduplicate — don't process the same event twice
    if (lastProcessedRef.current === lastEvent.id) return;
    lastProcessedRef.current = lastEvent.id;

    const newItem: EventItem = {
      id: lastEvent.id,
      source: lastEvent.source as any,
      event_type: lastEvent.eventType,
      title: lastEvent.title,
      severity: lastEvent.severity as any,
      occurred_at: lastEvent.occurredAt,
      isNew: true,
    };

    if (isScrolledDown) {
      setPendingEvents((prev) => [newItem, ...prev]);
    } else {
      setEvents((prev) => [newItem, ...prev].slice(0, limit));

      // Remove highlight after 3 seconds
      const id = newItem.id;
      setTimeout(() => {
        setEvents((prev) =>
          prev.map((e) => e.id === id ? { ...e, isNew: false } : e)
        );
      }, 3000);
    }
  }, [lastEvent, isScrolledDown, limit]);

  // ─── Show pending events (click banner) ───
  function showPendingEvents() {
    const withHighlight = pendingEvents.map((e) => ({ ...e, isNew: true }));
    setEvents((prev) => [...withHighlight, ...prev].slice(0, limit));
    setPendingEvents([]);

    // Scroll to top
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

    // Remove highlights after 3s
    const ids = withHighlight.map((e) => e.id);
    setTimeout(() => {
      setEvents((prev) =>
        prev.map((e) => ids.includes(e.id) ? { ...e, isNew: false } : e)
      );
    }, 3000);
  }

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
    <div className="relative">
      {/* ─── "New events" banner ─── */}
      {pendingEvents.length > 0 && (
        <button
          onClick={showPendingEvents}
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-2 text-xs font-medium transition-all bg-accent-green/15 text-accent-green border-b border-accent-green/20 hover:bg-accent-green/25 backdrop-blur-sm"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          {pendingEvents.length} new event{pendingEvents.length !== 1 ? 's' : ''}
        </button>
      )}

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="space-y-1 max-h-[360px] overflow-y-auto"
      >
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
              <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', sourceColors[event.source])}>
                <Icon className="w-3.5 h-3.5" />
              </div>
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
    </div>
  );
}
