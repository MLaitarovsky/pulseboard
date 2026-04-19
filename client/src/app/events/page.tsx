'use client';

import { useEffect, useState } from 'react';
import { Github, Bug, Wifi, Radio, Filter } from 'lucide-react';
import { clsx } from 'clsx';
import { useTeamId } from '@/components/TeamProvider';

interface EventItem {
  id: string;
  source: 'github' | 'sentry' | 'uptime';
  event_type: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata: Record<string, any>;
  occurred_at: string;
  received_at: string;
}

const sourceIcons: Record<string, any> = {
  github: Github,
  sentry: Bug,
  uptime: Wifi,
};

const sourceColors: Record<string, string> = {
  github: 'text-accent-purple bg-accent-purple/10 border-accent-purple/30',
  sentry: 'text-accent-red bg-accent-red/10 border-accent-red/30',
  uptime: 'text-accent-green bg-accent-green/10 border-accent-green/30',
};

const severityBadges: Record<string, string> = {
  info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  warning: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
  error: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  critical: 'bg-accent-red/20 text-accent-red border-accent-red/30',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type SourceFilter = 'all' | 'github' | 'sentry' | 'uptime';

export default function EventsPage() {
  const TEAM_ID = useTeamId();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [page, setPage] = useState(0);
  const limit = 30;

  async function fetchEvents() {
    try {
      setLoading(true);
      const sourceParam = filter !== 'all' ? `&source=${filter}` : '';
      const res = await fetch(
        `/api/teams/${TEAM_ID}/events?limit=${limit}&offset=${page * limit}${sourceParam}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEvents(data.events);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEvents();
  }, [filter, page]);

  const totalPages = Math.ceil(total / limit);

  const filterButtons: { key: SourceFilter; label: string; icon: any }[] = [
    { key: 'all', label: 'All', icon: Radio },
    { key: 'github', label: 'GitHub', icon: Github },
    { key: 'sentry', label: 'Sentry', icon: Bug },
    { key: 'uptime', label: 'Uptime', icon: Wifi },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          Events
        </h1>
        <p className="text-sm text-text-dim mt-1">
          All ingested events from GitHub, Sentry, and uptime monitors
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-6">
        <Filter className="w-3.5 h-3.5 text-text-dim" />
        {filterButtons.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setFilter(key); setPage(0); }}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              filter === key
                ? 'bg-accent-green/10 text-accent-green border border-accent-green/30'
                : 'bg-surface-2 text-text-dim border border-border hover:border-accent-green/20'
            )}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-dim font-mono">
          {total} total events
        </span>
      </div>

      {/* Events Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[40px_1fr_100px_100px_140px] gap-4 px-5 py-3 border-b border-border text-[10px] font-mono uppercase tracking-wider text-text-dim">
          <span />
          <span>Event</span>
          <span>Source</span>
          <span>Severity</span>
          <span>Time</span>
        </div>

        {/* Rows */}
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[40px_1fr_100px_100px_140px] gap-4 px-5 py-3.5 border-b border-border/50"
            >
              <div className="skeleton w-8 h-8 rounded-lg" />
              <div className="skeleton h-4 w-3/4 my-auto" />
              <div className="skeleton h-4 w-16 my-auto" />
              <div className="skeleton h-4 w-14 my-auto" />
              <div className="skeleton h-4 w-24 my-auto" />
            </div>
          ))
        ) : events.length === 0 ? (
          <div className="px-5 py-12 text-center text-text-dim text-sm">
            No events found
          </div>
        ) : (
          events.map((event) => {
            const Icon = sourceIcons[event.source] || Wifi;
            return (
              <div
                key={event.id}
                className="grid grid-cols-[40px_1fr_100px_100px_140px] gap-4 px-5 py-3.5 border-b border-border/50 hover:bg-surface-2/50 transition-colors"
              >
                <div
                  className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    sourceColors[event.source]
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col justify-center min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {event.title}
                  </p>
                  <p className="text-[10px] text-text-dim font-mono truncate mt-0.5">
                    {event.event_type}
                  </p>
                </div>
                <div className="flex items-center">
                  <span className="text-xs text-text-dim capitalize">
                    {event.source}
                  </span>
                </div>
                <div className="flex items-center">
                  <span
                    className={clsx(
                      'text-[10px] font-mono uppercase px-2 py-0.5 rounded border',
                      severityBadges[event.severity]
                    )}
                  >
                    {event.severity}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-xs text-text-dim">
                    {formatDate(event.occurred_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-text-dim hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Previous
          </button>
          <span className="text-xs text-text-dim font-mono">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 text-xs rounded-lg bg-surface-2 border border-border text-text-dim hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
