'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Clock, AlertTriangle, CheckCircle, Eye, Search,
  RotateCcw, MessageSquare, ChevronUp, ChevronDown, FileText,
  Send, Copy, Shield, X,
} from 'lucide-react';
import { useTeamId } from '@/components/TeamProvider';

interface Incident {
  id: string; title: string; description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'acknowledged' | 'investigating' | 'resolved' | 'reopened';
  created_by: string; created_at: string; updated_at: string; resolved_at: string | null;
}

interface TimelineEntry {
  id: string; incident_id: string; action: string;
  actor: string; message: string; created_at: string;
}

interface PostMortem {
  incident: any;
  metrics: {
    timeToAcknowledge: string; timeToInvestigate: string;
    timeToResolve: string; totalDuration: string;
    severityChanges: number; timelineEntries: number;
    commentsCount: number; relatedEventsCount: number;
  };
  timeline: any[];
  relatedEvents: any[];
  template: {
    summary: string; impactSection: string; timelineSection: string;
    metricsSection: string; rootCause: string; actionItems: string;
    lessonsLearned: string;
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['acknowledged', 'investigating'],
  acknowledged: ['investigating', 'resolved'],
  investigating: ['resolved'],
  resolved: ['reopened'],
  reopened: ['acknowledged', 'investigating'],
};

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' },
  acknowledged: { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
  investigating: { bg: 'rgba(168,85,247,0.1)', text: '#a855f7', border: 'rgba(168,85,247,0.2)' },
  resolved: { bg: 'rgba(0,229,160,0.1)', text: '#00e5a0', border: 'rgba(0,229,160,0.2)' },
  reopened: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.2)' },
};

const severityBg: Record<string, string> = {
  critical: '#ef4444',
  high: 'rgba(239,68,68,0.7)',
  medium: 'rgba(251,191,36,0.8)',
  low: 'rgba(107,114,128,0.5)',
};

const severityText: Record<string, string> = {
  critical: '#ffffff',
  high: '#ffffff',
  medium: '#000000',
  low: '#ffffff',
};

const severityBorder: Record<string, string> = {
  critical: 'rgba(239,68,68,0.4)',
  high: 'rgba(239,68,68,0.3)',
  medium: 'rgba(251,191,36,0.3)',
  low: 'rgba(107,114,128,0.3)',
};

const actionIconMap: Record<string, any> = {
  created: AlertTriangle, acknowledged: Eye, investigating: Search,
  resolved: CheckCircle, reopened: RotateCcw, comment: MessageSquare,
  severity_change: Shield,
};

const actionBg: Record<string, string> = {
  created: 'rgba(239,68,68,0.15)',
  acknowledged: 'rgba(251,191,36,0.15)',
  investigating: 'rgba(168,85,247,0.15)',
  resolved: 'rgba(0,229,160,0.15)',
  reopened: 'rgba(239,68,68,0.15)',
  comment: 'rgba(96,165,250,0.15)',
  severity_change: 'rgba(251,191,36,0.15)',
};

const actionText: Record<string, string> = {
  created: '#ef4444',
  acknowledged: '#fbbf24',
  investigating: '#a855f7',
  resolved: '#00e5a0',
  reopened: '#ef4444',
  comment: '#60a5fa',
  severity_change: '#fbbf24',
};

const transitionLabels: Record<string, string> = {
  acknowledged: 'Acknowledge', investigating: 'Investigate',
  resolved: 'Resolve', reopened: 'Reopen',
};

const transitionBg: Record<string, string> = {
  acknowledged: 'rgba(251,191,36,0.1)',
  investigating: 'rgba(168,85,247,0.1)',
  resolved: 'rgba(0,229,160,0.1)',
  reopened: 'rgba(239,68,68,0.1)',
};

const transitionText: Record<string, string> = {
  acknowledged: '#fbbf24',
  investigating: '#a855f7',
  resolved: '#00e5a0',
  reopened: '#ef4444',
};

const transitionBorder: Record<string, string> = {
  acknowledged: 'rgba(251,191,36,0.3)',
  investigating: 'rgba(168,85,247,0.3)',
  resolved: 'rgba(0,229,160,0.3)',
  reopened: 'rgba(239,68,68,0.3)',
};

// Color for severity in the modal header
const severityAccent: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#fbbf24',
  low: '#6b7280',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
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

// ─── Severity Change Modal (dark themed) ──────────────
function SeverityModal({
  isOpen, targetSeverity, currentSeverity, onConfirm, onCancel,
}: {
  isOpen: boolean; targetSeverity: string; currentSeverity: string;
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!isOpen) return null;

  const oldIdx = SEVERITIES.indexOf(currentSeverity as any);
  const newIdx = SEVERITIES.indexOf(targetSeverity as any);
  const isEscalation = newIdx < oldIdx;
  const accentColor = severityAccent[targetSeverity] || '#fbbf24';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#1a1a2e',
          border: `1px solid ${accentColor}33`,
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: `0 25px 50px rgba(0,0,0,0.5), 0 0 30px ${accentColor}10`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isEscalation
              ? <ChevronUp size={16} style={{ color: '#ef4444' }} />
              : <ChevronDown size={16} style={{ color: '#00e5a0' }} />
            }
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff', fontFamily: 'monospace' }}>
              {isEscalation ? 'Escalate' : 'De-escalate'} to{' '}
              <span style={{ color: accentColor, textTransform: 'uppercase' }}>{targetSeverity}</span>
            </h3>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: '4px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px', marginBottom: '16px',
          background: 'rgba(255,255,255,0.03)', fontSize: '11px', fontFamily: 'monospace',
        }}>
          <span style={{
            padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px',
            background: severityBg[currentSeverity], color: severityText[currentSeverity],
          }}>{currentSeverity}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>→</span>
          <span style={{
            padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 600, fontSize: '10px',
            background: severityBg[targetSeverity], color: severityText[targetSeverity],
          }}>{targetSeverity}</span>
        </div>

        <label style={{ display: 'block', fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Reason (optional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you changing the severity?"
          rows={3}
          autoFocus
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid rgba(255,255,255,0.1)`,
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '13px',
            color: '#ffffff',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = `${accentColor}66`; }}
          onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onConfirm(reason); }}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 500,
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)',
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            style={{
              padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              background: `${accentColor}20`, color: accentColor,
              border: `1px solid ${accentColor}50`, cursor: 'pointer',
            }}
          >
            Confirm Change
          </button>
        </div>

        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '10px', textAlign: 'right', fontFamily: 'monospace' }}>
          Ctrl+Enter to confirm
        </div>
      </div>
    </div>
  );
}

// ─── Error Toast ──────────────────────────────────────
function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div style={{
      position: 'fixed', top: '20px', right: '20px', zIndex: 100,
      background: 'rgba(239,68,68,0.15)', color: '#ef4444',
      border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px',
      padding: '12px 20px', fontSize: '13px', fontFamily: 'monospace',
      backdropFilter: 'blur(8px)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '400px',
    }}>
      <AlertTriangle size={14} />
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}>
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────
export default function IncidentDetailPage() {
  const TEAM_ID = useTeamId();
  const params = useParams();
  const incidentId = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [comment, setComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [postmortem, setPostmortem] = useState<PostMortem | null>(null);
  const [showPostmortem, setShowPostmortem] = useState(false);
  const [loadingPM, setLoadingPM] = useState(false);
  const [copiedPM, setCopiedPM] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Severity modal state
  const [sevModalOpen, setSevModalOpen] = useState(false);
  const [sevModalTarget, setSevModalTarget] = useState('');

  const clearError = useCallback(() => setErrorMsg(''), []);

  const fetchIncident = useCallback(async () => {
    try {
      const [incRes, timeRes] = await Promise.all([
        fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}`),
        fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}/timeline`),
      ]);
      if (!incRes.ok) throw new Error('Incident not found');
      setIncident(await incRes.json());
      if (timeRes.ok) setTimeline(await timeRes.json());
    } catch (err) {
      console.error('Failed to fetch incident:', err);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  async function transitionTo(newStatus: string) {
    if (!incident) return;
    setErrorMsg('');
    try {
      setUpdating(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, actor: 'demo-user', message: `Status changed to ${newStatus}` }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setErrorMsg(err.error || 'Failed to update status');
        return;
      }
      await fetchIncident();
    } catch (err) {
      setErrorMsg('Network error');
    } finally {
      setUpdating(false);
    }
  }

  function openSeverityModal(newSeverity: string) {
    setSevModalTarget(newSeverity);
    setSevModalOpen(true);
  }

  async function confirmSeverityChange(reason: string) {
    setSevModalOpen(false);
    if (!incident || incident.severity === sevModalTarget) return;
    setErrorMsg('');
    try {
      setUpdating(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}/severity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ severity: sevModalTarget, actor: 'demo-user', reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        setErrorMsg(err.error || 'Failed to update severity');
        return;
      }
      await fetchIncident();
    } catch (err) {
      setErrorMsg('Network error updating severity');
    } finally {
      setUpdating(false);
    }
  }

  async function addCommentHandler() {
    if (!comment.trim()) return;
    try {
      setAddingComment(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'demo-user', message: comment }),
      });
      if (res.ok) { setComment(''); await fetchIncident(); }
    } catch (err) {
      console.error('Failed:', err);
    } finally {
      setAddingComment(false);
    }
  }

  async function generatePostmortem() {
    try {
      setLoadingPM(true);
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents/${incidentId}/postmortem`);
      if (res.ok) { setPostmortem(await res.json()); setShowPostmortem(true); }
    } catch (err) {
      console.error('Failed:', err);
    } finally {
      setLoadingPM(false);
    }
  }

  function copyPostmortem() {
    if (!postmortem) return;
    const t = postmortem.template;
    const md = [t.summary, t.impactSection, t.timelineSection, t.metricsSection, t.rootCause, t.actionItems, t.lessonsLearned].join('\n');
    navigator.clipboard.writeText(md);
    setCopiedPM(true);
    setTimeout(() => setCopiedPM(false), 2000);
  }

  useEffect(() => { fetchIncident(); }, [fetchIncident]);

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
        <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.2)' }} />
        <p style={{ color: 'rgba(255,255,255,0.4)' }}>Incident not found</p>
        <Link href="/incidents" className="text-sm hover:underline mt-2 inline-block" style={{ color: '#00e5a0' }}>
          Back to incidents
        </Link>
      </div>
    );
  }

  const nextStates = VALID_TRANSITIONS[incident.status] || [];
  const currentSevIndex = SEVERITIES.indexOf(incident.severity);
  const ss = statusStyles[incident.status] || statusStyles.open;

  return (
    <div>
      {/* Severity Modal */}
      <SeverityModal
        isOpen={sevModalOpen}
        targetSeverity={sevModalTarget}
        currentSeverity={incident.severity}
        onConfirm={confirmSeverityChange}
        onCancel={() => setSevModalOpen(false)}
      />

      {/* Error Toast */}
      <ErrorToast message={errorMsg} onDismiss={clearError} />

      <Link href="/incidents" className="inline-flex items-center gap-1.5 text-xs transition-colors mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Incidents
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div
            className="rounded-xl p-6"
            style={{ background: 'var(--surface)', border: `1px solid ${severityBorder[incident.severity]}` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold"
                  style={{ background: severityBg[incident.severity], color: severityText[incident.severity] }}
                >
                  {incident.severity}
                </span>
                <span
                  className="text-[10px] font-mono uppercase px-2 py-0.5 rounded"
                  style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}
                >
                  {incident.status}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                <Clock className="w-3.5 h-3.5" />
                {duration(incident.created_at, incident.resolved_at)}
              </div>
            </div>

            <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{incident.title}</h1>
            {incident.description && <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>{incident.description}</p>}

            <div className="flex items-center gap-4 mt-4 pt-4 text-xs font-mono" style={{ borderTop: '1px solid var(--border)', color: 'rgba(255,255,255,0.4)' }}>
              <span>Created: {formatDate(incident.created_at)}</span>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>&#183;</span>
              <span>By: {incident.created_by}</span>
              {incident.resolved_at && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>&#183;</span>
                  <span style={{ color: '#00e5a0' }}>Resolved: {formatDate(incident.resolved_at)}</span>
                </>
              )}
            </div>

            {nextStates.length > 0 && (
              <div className="flex items-center gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-[10px] font-mono uppercase tracking-wider mr-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Transition to:</span>
                {nextStates.map((s) => (
                  <button key={s} onClick={() => transitionTo(s)} disabled={updating}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                    style={{ background: transitionBg[s], color: transitionText[s], border: `1px solid ${transitionBorder[s]}` }}
                  >
                    {updating ? '...' : transitionLabels[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-xs font-mono uppercase tracking-wider mb-6" style={{ color: 'rgba(255,255,255,0.4)' }}>Incident Timeline</h2>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />
              <div className="space-y-5">
                {timeline.map((entry) => {
                  const Icon = actionIconMap[entry.action] || MessageSquare;
                  return (
                    <div key={entry.id} className="relative flex items-start gap-4">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10"
                        style={{ background: actionBg[entry.action] || actionBg.comment }}
                      >
                        <Icon className="w-3.5 h-3.5" style={{ color: actionText[entry.action] || actionText.comment }} />
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                            {entry.action.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>by {entry.actor}</span>
                        </div>
                        {entry.message && <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{entry.message}</p>}
                        <span className="text-[10px] font-mono mt-1 block" style={{ color: 'rgba(255,255,255,0.25)' }}>{formatDate(entry.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Add Comment */}
            <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(96,165,250,0.1)' }}>
                  <MessageSquare className="w-3.5 h-3.5" style={{ color: '#60a5fa' }} />
                </div>
                <div className="flex-1">
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment or update..."
                    rows={2}
                    className="w-full rounded-lg px-4 py-2.5 text-sm resize-none"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(96,165,250,0.4)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addCommentHandler(); }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Ctrl+Enter to send</span>
                    <button onClick={addCommentHandler} disabled={!comment.trim() || addingComment}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-all"
                      style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
                    >
                      <Send className="w-3 h-3" />{addingComment ? 'Sending...' : 'Comment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Severity Escalation */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Severity</h3>
            <div className="space-y-2">
              {SEVERITIES.map((sev, idx) => {
                const isActive = incident.severity === sev;
                const canChange = incident.status !== 'resolved';
                return (
                  <button key={sev}
                    onClick={() => canChange && !isActive && openSeverityModal(sev)}
                    disabled={isActive || !canChange || updating}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all"
                    style={isActive ? {
                      background: severityBg[sev],
                      color: severityText[sev],
                      border: '1px solid transparent',
                    } : canChange ? {
                      background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.4)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                    } : {
                      background: 'rgba(255,255,255,0.02)',
                      color: 'rgba(255,255,255,0.15)',
                      border: '1px solid var(--border)',
                      cursor: 'not-allowed',
                    }}
                  >
                    <span className="capitalize">{sev}</span>
                    {isActive && <span className="text-[9px] opacity-75">CURRENT</span>}
                    {!isActive && canChange && idx < currentSevIndex && <ChevronUp className="w-3 h-3" style={{ color: '#ef4444' }} />}
                    {!isActive && canChange && idx > currentSevIndex && <ChevronDown className="w-3 h-3" style={{ color: '#00e5a0' }} />}
                  </button>
                );
              })}
            </div>
            {incident.status === 'resolved' && (
              <p className="text-[10px] mt-3 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Severity locked for resolved incidents
              </p>
            )}
          </div>

          {/* Response Metrics */}
          {postmortem && (
            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <h3 className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Response Metrics</h3>
              <div className="space-y-3">
                {[
                  { label: 'Time to Acknowledge', value: postmortem.metrics.timeToAcknowledge },
                  { label: 'Time to Investigate', value: postmortem.metrics.timeToInvestigate },
                  { label: 'Time to Resolve', value: postmortem.metrics.timeToResolve },
                  { label: 'Total Duration', value: postmortem.metrics.totalDuration },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                    <span className="text-xs font-mono font-medium" style={{ color: value === 'N/A' ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Related Events</span>
                <span className="text-xs font-mono" style={{ color: '#60a5fa' }}>{postmortem.metrics.relatedEventsCount}</span>
              </div>
            </div>
          )}

          {/* Post-Mortem */}
          <div className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Post-Mortem</h3>
            {!showPostmortem ? (
              <button onClick={generatePostmortem} disabled={loadingPM}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50 transition-all"
                style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                <FileText className="w-4 h-4" />{loadingPM ? 'Generating...' : 'Generate Post-Mortem'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs" style={{ color: '#00e5a0' }}><CheckCircle className="w-3.5 h-3.5" />Post-mortem generated</div>
                <button onClick={copyPostmortem}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                >
                  <Copy className="w-3 h-3" />{copiedPM ? 'Copied!' : 'Copy as Markdown'}
                </button>
                <button onClick={() => setShowPostmortem(false)}
                  className="w-full text-center text-[10px] transition-colors"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Hide
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post-Mortem Preview */}
      {showPostmortem && postmortem && (
        <div className="mt-6 rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid rgba(168,85,247,0.2)' }}>
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)', background: 'rgba(168,85,247,0.04)' }}>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: '#a855f7' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Post-Mortem Report</h2>
            </div>
            <button onClick={copyPostmortem}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              <Copy className="w-3 h-3" />{copiedPM ? 'Copied!' : 'Copy Markdown'}
            </button>
          </div>
          <div className="p-6 space-y-6 text-sm leading-relaxed font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <div>
              <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>
                Incident Post-Mortem: {incident.title}
              </h3>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Severity</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{ background: severityBg[incident.severity], color: severityText[incident.severity] }}
                  >{incident.severity}</span>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <span className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Duration</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{postmortem.metrics.totalDuration}</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Response Metrics</h4>
              <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                {[
                  { label: 'Time to Acknowledge', value: postmortem.metrics.timeToAcknowledge },
                  { label: 'Time to Investigate', value: postmortem.metrics.timeToInvestigate },
                  { label: 'Time to Resolve', value: postmortem.metrics.timeToResolve },
                  { label: 'Related Events', value: String(postmortem.metrics.relatedEventsCount) },
                ].map(({ label, value }, i) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5"
                    style={i > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
                  >
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Timeline ({postmortem.timeline.length} entries)</h4>
              <div className="space-y-2">
                {postmortem.timeline.map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <span className="shrink-0 w-16" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="uppercase font-semibold shrink-0 w-24" style={{ color: '#00e5a0' }}>
                      {entry.action.replace('_', ' ')}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-6 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Template Sections</h4>
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>Copy the full markdown and fill in the sections below in your team wiki or docs.</p>
              {['Root Cause', 'Action Items', 'Lessons Learned'].map((section) => (
                <div key={section} className="rounded-lg p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h5 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{section}</h5>
                  <p className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    {section === 'Root Cause' && 'Describe the root cause of the incident here.'}
                    {section === 'Action Items' && 'Add preventative measures, monitoring improvements, and documentation updates.'}
                    {section === 'Lessons Learned' && 'What went well? What could be improved?'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
