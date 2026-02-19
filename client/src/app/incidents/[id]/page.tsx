'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  Search,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';

const TEAM_ID = 'acme-eng';

interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'reopened';
  created_by: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface TimelineEntry {
  id: string;
  incident_id: string;
  action: string;
  actor: string;
  message: string;
  created_at: string;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['acknowledged', 'investigating'],
  acknowledged: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: ['reopened'],
  reopened: ['acknowledged', 'investigating'],
};

const statusColors: Record<string, string> = {
  open: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  acknowledged: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20',
  investigating: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  resolved: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  reopened: 'bg-accent-red/10 text-accent-red border-accent-red/20',
};

const severityColors: Record<string, string> = {
  critical: 'bg-accent-red text-white',
  high: 'bg-accent-red/70 text-white',
  medium: 'bg-accent-yellow/80 text-black',
  low: 'bg-surface-3 text-text-dim',
};

const actionIcons: Record<string, any> = {
  created: AlertTriangle,
  acknowledged: Eye,
  investigating: Search,
  resolved: CheckCircle,
  reopened: RotateCcw,
  comment: MessageSquare,
};

const actionColors: Record<string, string> = {
  created: 'bg-accent-red/20 text-accent-red',
  acknowledged: 'bg-accent-yellow/20 text-accent-yellow',
  investigating: 'bg-accent-purple/20 text-accent-purple',
  resolved: 'bg-accent-green/20 text-accent-green',
  reopened: 'bg-accent-red/20 text-accent-red',
  comment: 'bg-accent-blue/20 text-accent-blue',
};

const transitionLabels: Record<string, string> = {
  acknowledged: 'Acknowledge',
  investigating: 'Investigate',
  resolved: 'Resolve',
  reopened: 'Reopen',
};

const transitionColors: Record<string, string> = {
  acknowledged: 'bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30 hover:bg-accent-yellow/20',
  investigating: 'bg-accent-purple/10 text-accent-purple border-accent-purple/30 hover:bg-accent-purple/20',
  resolved: 'bg-accent-green/10 text-accent-green border-accent-green/30 hover:bg-accent-green/20',
  reopened: 'bg-accent-red/10 text-accent-red border-accent-red/30 hover:bg-accent-red/20',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function duration(from: string, to: string | null): string {
  const start = new Date(from);
  const end = to ? new Date(to) : new Date();
  const mins = Math.floor((end.getTime() - start.getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function fetchIncident() {
    try {
      const [incRes, timeRes] = await Promise.all([
        fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}`),
        fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}/timeline`),
      ]);

      if (!incRes.ok) throw new Error('Incident not found');
      const incData = await incRes.json();
      setIncident(incData);

      if (timeRes.ok) {
        const timeData = await timeRes.json();
        setTimeline(timeData);
      }
    } catch (err) {
      console.error('Failed to fetch incident:', err);
    } finally {
      setLoading(false);
    }
  }

  async function transitionTo(newStatus: string) {
    if (!incident) return;

    try {
      setUpdating(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          actor: 'demo-user',
          message: `Status changed to ${newStatus}`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        alert(errData.error || 'Failed to update');
        return;
      }

      // Refresh data
      await fetchIncident();
    } catch (err) {
      console.error('Failed to update incident:', err);
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    fetchIncident();
  }, [incidentId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-40 w-full rounded-xl" />
        <div className="skeleton h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-text-dim/30" />
        <p className="text-text-dim">Incident not found</p>
        <Link href="/incidents" className="text-accent-green text-sm hover:underline mt-2 inline-block">
          ← Back to incidents
        </Link>
      </div>
    );
  }

  const nextStates = VALID_TRANSITIONS[incident.status] || [];

  return (
    <div>
      {/* Back link */}
      <Link
        href="/incidents"
        className="inline-flex items-center gap-1.5 text-xs text-text-dim hover:text-accent-green transition-colors mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Incidents
      </Link>

      {/* Incident Header */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={clsx('text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold', severityColors[incident.severity])}>
              {incident.severity}
            </span>
            <span className={clsx('text-[10px] font-mono uppercase px-2 py-0.5 rounded border', statusColors[incident.status])}>
              {incident.status}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-dim">
            <Clock className="w-3.5 h-3.5" />
            Duration: {duration(incident.created_at, incident.resolved_at)}
          </div>
        </div>

        <h1 className="text-xl font-semibold text-text-primary mb-2">
          {incident.title}
        </h1>

        {incident.description && (
          <p className="text-sm text-text-dim leading-relaxed">
            {incident.description}
          </p>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border text-xs text-text-dim font-mono">
          <span>Created: {formatDate(incident.created_at)}</span>
          <span className="text-text-dim/30">·</span>
          <span>By: {incident.created_by}</span>
          {incident.resolved_at && (
            <>
              <span className="text-text-dim/30">·</span>
              <span>Resolved: {formatDate(incident.resolved_at)}</span>
            </>
          )}
        </div>

        {/* State Transition Buttons */}
        {nextStates.length > 0 && (
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim mr-2">
              Transition to:
            </span>
            {nextStates.map((status) => (
              <button
                key={status}
                onClick={() => transitionTo(status)}
                disabled={updating}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50',
                  transitionColors[status]
                )}
              >
                {updating ? '...' : transitionLabels[status] || status}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-text-dim mb-6">
          Incident Timeline
        </h2>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

          <div className="space-y-6">
            {timeline.map((entry, index) => {
              const Icon = actionIcons[entry.action] || MessageSquare;
              const colorClass = actionColors[entry.action] || actionColors.comment;

              return (
                <div key={entry.id} className="relative flex items-start gap-4 pl-0">
                  {/* Icon node */}
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10', colorClass)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary capitalize">
                        {entry.action}
                      </span>
                      <span className="text-[10px] text-text-dim font-mono">
                        by {entry.actor}
                      </span>
                    </div>
                    {entry.message && (
                      <p className="text-sm text-text-dim mt-0.5">{entry.message}</p>
                    )}
                    <span className="text-[10px] text-text-dim/60 font-mono mt-1 block">
                      {formatDate(entry.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
