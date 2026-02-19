'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Plus,
  Clock,
  ChevronRight,
  X,
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

const statusFilters = ['all', 'open', 'acknowledged', 'investigating', 'resolved'] as const;
type StatusFilter = (typeof statusFilters)[number];

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
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

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');

  async function fetchIncidents() {
    try {
      setLoading(true);
      const statusParam = filter !== 'all' ? `?status=${filter}` : '';
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents${statusParam}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setIncidents(data);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setCreating(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          severity: newSeverity,
          createdBy: 'demo-user',
        }),
      });

      if (!res.ok) throw new Error('Failed to create');

      // Reset form and refresh
      setNewTitle('');
      setNewDesc('');
      setNewSeverity('medium');
      setShowCreate(false);
      fetchIncidents();
    } catch (err) {
      console.error('Failed to create incident:', err);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    fetchIncidents();
  }, [filter]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            Incidents
          </h1>
          <p className="text-sm text-text-dim mt-1">
            Track and manage active and resolved incidents
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-red/10 text-accent-red border border-accent-red/20 text-sm font-medium hover:bg-accent-red/20 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Report Incident
        </button>
      </div>

      {/* Create Incident Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-text-primary">Report New Incident</h2>
              <button onClick={() => setShowCreate(false)} className="text-text-dim hover:text-text-primary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={createIncident} className="space-y-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-text-dim block mb-1.5">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Brief description of the incident"
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-dim/50 focus:outline-none focus:border-accent-red/50"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-text-dim block mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What's happening? What's the impact?"
                  rows={3}
                  className="w-full bg-surface-2 border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-dim/50 focus:outline-none focus:border-accent-red/50 resize-none"
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-text-dim block mb-1.5">Severity</label>
                <div className="flex gap-2">
                  {(['critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setNewSeverity(sev)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all',
                        newSeverity === sev
                          ? severityColors[sev]
                          : 'bg-surface-2 text-text-dim border-border'
                      )}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-text-dim hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-accent-red text-white text-sm font-medium hover:bg-accent-red/90 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Filters */}
      <div className="flex items-center gap-2 mb-6">
        {statusFilters.map((status) => {
          const count =
            status === 'all'
              ? incidents.length
              : incidents.filter((i) => i.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize border transition-all',
                filter === status
                  ? status === 'all'
                    ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                    : statusColors[status]
                  : 'bg-surface-2 text-text-dim border-border hover:border-accent-green/20'
              )}
            >
              {status === 'all' ? 'All' : status}
              <span className="ml-1.5 opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5">
              <div className="skeleton h-5 w-2/3 mb-3" />
              <div className="skeleton h-4 w-1/2 mb-2" />
              <div className="skeleton h-3 w-1/4" />
            </div>
          ))
        ) : incidents.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-text-dim/30" />
            <p className="text-sm text-text-dim">No incidents found</p>
          </div>
        ) : (
          incidents.map((incident) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`}>
              <div className="bg-surface border border-border rounded-xl p-5 hover:border-accent-green/20 transition-colors cursor-pointer group">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Severity + Status badges */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx('text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold', severityColors[incident.severity])}>
                        {incident.severity}
                      </span>
                      <span className={clsx('text-[10px] font-mono uppercase px-2 py-0.5 rounded border', statusColors[incident.status])}>
                        {incident.status}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-medium text-text-primary group-hover:text-accent-green transition-colors">
                      {incident.title}
                    </h3>

                    {/* Description */}
                    {incident.description && (
                      <p className="text-xs text-text-dim mt-1 line-clamp-2">
                        {incident.description}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-3 text-[10px] text-text-dim font-mono">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(incident.created_at)}
                      </span>
                      <span className="text-text-dim/30">·</span>
                      <span>
                        Duration: {duration(incident.created_at, incident.resolved_at)}
                      </span>
                      <span className="text-text-dim/30">·</span>
                      <span>by {incident.created_by}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-text-dim/0 group-hover:text-text-dim/50 transition-colors shrink-0 mt-4" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
