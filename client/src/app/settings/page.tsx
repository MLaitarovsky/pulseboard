'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Plus, Trash2, TestTube, CheckCircle, XCircle,
  ExternalLink, Bell, Globe, ToggleLeft, ToggleRight, Loader2, Copy, Check, RotateCcw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useTeamId } from '@/components/TeamProvider';
import { useToast } from '@/components/ToastProvider';
import { useSocketContext } from '@/components/SocketProvider';
import { authHeaders } from '@/lib/api';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret?: string;
  created_at: string;
}

interface NotificationLogEntry {
  id: string;
  type: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

const ALL_EVENTS = [
  { value: 'incident_created', label: 'Incident Created' },
  { value: 'incident_resolved', label: 'Incident Resolved' },
  { value: 'incident_escalated', label: 'Escalated' },
  { value: 'incident_acknowledged', label: 'Acknowledged' },
  { value: 'incident_investigating', label: 'Investigating' },
  { value: 'incident_reopened', label: 'Reopened' },
  { value: 'severity_change', label: 'Severity Change' },
];

export default function SettingsPage() {
  const TEAM_ID = useTeamId();
  const { toast } = useToast();
  const { webhookVersion } = useSocketContext();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [notifPage, setNotifPage] = useState(0);
  const [notifTotal, setNotifTotal] = useState(0);
  const NOTIF_LIMIT = 20;

  // Form state
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>(['incident_created', 'incident_resolved', 'incident_escalated']);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function fetchData(page = notifPage) {
    try {
      const [webhooksRes, logsRes] = await Promise.all([
        fetch(`/api/teams/${TEAM_ID}/webhooks`, { headers: authHeaders() }),
        fetch(`/api/teams/${TEAM_ID}/notifications?limit=${NOTIF_LIMIT}&offset=${page * NOTIF_LIMIT}`, { headers: authHeaders() }),
      ]);
      if (webhooksRes.ok) setWebhooks(await webhooksRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setNotifications(data.notifications ?? data);
        setNotifTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch settings data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(notifPage); }, [notifPage]);

  // Re-sync webhook list when another session creates/updates/deletes a webhook
  useEffect(() => {
    if (webhookVersion === 0) return; // skip initial mount
    fetchData(notifPage);
  }, [webhookVersion]);

  function isValidUrl(url: string) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function createWebhook() {
    if (!formName.trim() || !formUrl.trim()) return;
    if (!isValidUrl(formUrl)) {
      setSaveError('Webhook URL must be a valid https:// address.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/webhooks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: formName, url: formUrl, secret: formSecret || undefined, events: formEvents }),
      });
      if (res.ok) {
        setFormName(''); setFormUrl(''); setFormSecret(''); setShowAddForm(false);
        setFormEvents(['incident_created', 'incident_resolved', 'incident_escalated']);
        await fetchData();
        toast('Webhook created');
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || `Server error (${res.status})`);
      }
    } catch (err) {
      setSaveError('Network error — is the server running?');
    } finally {
      setSaving(false);
    }
  }

  async function toggleWebhook(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setWebhooks((prev) => prev.map((w) => w.id === id ? { ...w, enabled } : w));
        toast(enabled ? 'Webhook enabled' : 'Webhook disabled');
      } else {
        toast('Failed to update webhook', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
  }

  async function deleteWebhook(id: string) {
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/webhooks/${id}`, { method: 'DELETE', headers: authHeaders() });
      if (res.ok) {
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
        toast('Webhook deleted');
      } else {
        toast('Failed to delete webhook', 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
  }

  async function testWebhook(id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/webhooks/${id}/test`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      setTestResult({ id, success: data.success, message: data.success ? `${data.status} ${data.statusText}` : data.error || 'Failed' });
    } catch (err) {
      setTestResult({ id, success: false, message: 'Network error' });
    } finally {
      setTesting(null);
    }
  }

  function toggleEvent(event: string) {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  }

  async function retryNotification(id: string) {
    setRetrying(id);
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/notifications/${id}/retry`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        toast('Notification delivered');
      } else {
        toast('Retry failed — check recipient URL', 'error');
      }
      await fetchData();
    } catch {
      toast('Network error', 'error');
    } finally {
      setRetrying(null);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : '';

  const inboundEndpoints = [
    { source: 'github',  label: 'GitHub',  description: 'Push, PR, deployment events' },
    { source: 'sentry',  label: 'Sentry',  description: 'Error and issue alerts' },
    { source: 'uptime',  label: 'Uptime',  description: 'Monitor up/down events' },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-dim mt-1">Configure webhook endpoints, notification channels, and integrations</p>
      </div>

      {/* ─── Inbound Webhook URLs ─── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ExternalLink className="w-4 h-4 text-accent-blue" />
          <h2 className="text-sm font-semibold text-text-primary">Receive Events</h2>
          <span className="text-[10px] font-mono text-text-dim bg-surface-2 px-2 py-0.5 rounded">Inbound</span>
        </div>
        <p className="text-xs text-text-dim mb-4">Paste these URLs into your external services to send events to PulseBoard.</p>
        <div className="space-y-2">
          {inboundEndpoints.map(({ source, label, description }) => {
            const url = `${baseUrl}/api/webhooks/${source}?team=${TEAM_ID}`;
            const key = `inbound-${source}`;
            return (
              <div key={source} className="bg-surface border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-16 shrink-0">
                  <span className="text-[10px] font-mono font-semibold text-text-primary">{label}</span>
                  <p className="text-[9px] text-text-dim/70 mt-0.5">{description}</p>
                </div>
                <code className="flex-1 text-xs font-mono text-text-dim bg-surface-2 px-3 py-1.5 rounded-lg truncate">
                  {url}
                </code>
                <button
                  onClick={() => copyToClipboard(url, key)}
                  className="p-1.5 rounded-lg text-text-dim hover:text-accent-blue hover:bg-accent-blue/10 transition-colors shrink-0"
                  title="Copy URL"
                >
                  {copied === key ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Webhook Configurations ─── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent-purple" />
            <h2 className="text-sm font-semibold text-text-primary">Webhook Endpoints</h2>
            <span className="text-[10px] font-mono text-text-dim bg-surface-2 px-2 py-0.5 rounded">{webhooks.length}</span>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-green/10 text-accent-green border border-accent-green/30 hover:bg-accent-green/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Webhook
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-surface border border-accent-green/20 rounded-xl p-5 mb-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim block mb-1.5">Name</label>
                <input
                  type="text" value={formName} onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Slack #incidents"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-surface-2 border border-border text-text-primary outline-none focus:border-accent-green/40"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim block mb-1.5">Webhook URL</label>
                <input
                  type="url" value={formUrl} onChange={(e) => { setFormUrl(e.target.value); setSaveError(null); }}
                  placeholder="https://hooks.slack.com/services/..."
                  className={clsx(
                    'w-full px-3 py-2 rounded-lg text-sm bg-surface-2 border text-text-primary outline-none focus:border-accent-green/40',
                    formUrl && !isValidUrl(formUrl) ? 'border-accent-red/50' : 'border-border'
                  )}
                />
                {formUrl && !isValidUrl(formUrl) && (
                  <p className="text-[10px] text-accent-red mt-1">Must be a valid https:// URL</p>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim block mb-1.5">Signing Secret (optional)</label>
              <input
                type="text" value={formSecret} onChange={(e) => setFormSecret(e.target.value)}
                placeholder="HMAC secret for signature verification"
                className="w-full px-3 py-2 rounded-lg text-sm bg-surface-2 border border-border text-text-primary outline-none focus:border-accent-green/40 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-text-dim block mb-2">Events to subscribe</label>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((evt) => (
                  <button
                    key={evt.value}
                    onClick={() => toggleEvent(evt.value)}
                    className={clsx(
                      'px-2.5 py-1 rounded text-[10px] font-mono transition-colors border',
                      formEvents.includes(evt.value)
                        ? 'bg-accent-green/10 text-accent-green border-accent-green/30'
                        : 'bg-surface-2 text-text-dim border-border hover:border-accent-green/20'
                    )}
                  >
                    {evt.label}
                  </button>
                ))}
              </div>
            </div>
            {saveError && (
              <p className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2">{saveError}</p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => { setShowAddForm(false); setSaveError(null); }} className="px-3 py-1.5 rounded-lg text-xs text-text-dim hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button
                onClick={createWebhook}
                disabled={!formName.trim() || !formUrl.trim() || !isValidUrl(formUrl) || saving}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Create Webhook'}
              </button>
            </div>
          </div>
        )}

        {/* Webhook list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-5">
                <div className="skeleton h-4 w-40 mb-2" />
                <div className="skeleton h-3 w-64" />
              </div>
            ))}
          </div>
        ) : webhooks.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-12 text-center">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-20 text-text-dim" />
            <p className="text-sm text-text-dim">No webhook endpoints configured</p>
            <p className="text-xs text-text-dim/60 mt-1">Add a webhook URL to receive incident notifications</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className={clsx(
                'bg-surface border rounded-xl p-5 transition-colors',
                webhook.enabled ? 'border-border' : 'border-border/50 opacity-60'
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-text-primary">{webhook.name}</p>
                      <span className={clsx(
                        'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded',
                        webhook.enabled ? 'bg-accent-green/10 text-accent-green' : 'bg-surface-2 text-text-dim'
                      )}>
                        {webhook.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-text-dim truncate">{webhook.url}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {webhook.events.map((evt) => (
                        <span key={evt} className="text-[9px] font-mono bg-surface-2 text-text-dim px-1.5 py-0.5 rounded">
                          {evt.replace('incident_', '')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <button
                      onClick={() => testWebhook(webhook.id)}
                      disabled={testing === webhook.id}
                      className="p-2 rounded-lg text-text-dim hover:text-accent-purple hover:bg-accent-purple/10 transition-colors"
                      title="Send test notification"
                    >
                      {testing === webhook.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => toggleWebhook(webhook.id, !webhook.enabled)}
                      className="p-2 rounded-lg text-text-dim hover:text-accent-green hover:bg-accent-green/10 transition-colors"
                      title={webhook.enabled ? 'Disable' : 'Enable'}
                    >
                      {webhook.enabled ? <ToggleRight className="w-4 h-4 text-accent-green" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => deleteWebhook(webhook.id)}
                      className="p-2 rounded-lg text-text-dim hover:text-accent-red hover:bg-accent-red/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {testResult && testResult.id === webhook.id && (
                  <div className={clsx(
                    'mt-3 px-3 py-2 rounded-lg text-xs font-mono flex items-center gap-2',
                    testResult.success ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
                  )}>
                    {testResult.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Notification Log ─── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-accent-yellow" />
          <h2 className="text-sm font-semibold text-text-primary">Notification Log</h2>
          {notifTotal > 0 && (
            <span className="text-[10px] font-mono text-text-dim bg-surface-2 px-2 py-0.5 rounded">{notifTotal} total</span>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-20 text-text-dim" />
            <p className="text-sm text-text-dim">No notifications yet</p>
            <p className="text-xs text-text-dim/60 mt-1">Notifications will appear here when incidents are created or updated</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.map((notif) => (
                <div key={notif.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-surface-2/50 transition-colors">
                  <div className={clsx(
                    'w-2 h-2 rounded-full shrink-0',
                    notif.status === 'sent' ? 'bg-accent-green' : 'bg-accent-red'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary truncate">{notif.subject || notif.type}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-text-dim">{notif.channel}</span>
                      {notif.recipient && (
                        <>
                          <span className="text-text-dim/20">·</span>
                          <span className="text-[9px] font-mono text-text-dim truncate max-w-[200px]">{notif.recipient}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {notif.status === 'failed' && notif.channel === 'webhook' && (
                      <button
                        onClick={() => retryNotification(notif.id)}
                        disabled={retrying === notif.id}
                        className="p-1.5 rounded-lg text-text-dim hover:text-accent-yellow hover:bg-accent-yellow/10 transition-colors"
                        title="Retry delivery"
                      >
                        {retrying === notif.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <div className="text-right">
                      <span className={clsx(
                        'text-[9px] font-mono uppercase px-1.5 py-0.5 rounded',
                        notif.status === 'sent' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'
                      )}>
                        {notif.status}
                      </span>
                      <p className="text-[9px] font-mono text-text-dim/40 mt-1">
                        {new Date(notif.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {notifTotal > NOTIF_LIMIT && (
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-[10px] font-mono text-text-dim">
              {notifPage * NOTIF_LIMIT + 1}–{Math.min((notifPage + 1) * NOTIF_LIMIT, notifTotal)} of {notifTotal}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNotifPage((p) => Math.max(0, p - 1))}
                disabled={notifPage === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-dim border border-border hover:text-text-primary hover:border-border/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => setNotifPage((p) => p + 1)}
                disabled={(notifPage + 1) * NOTIF_LIMIT >= notifTotal}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-text-dim border border-border hover:text-text-primary hover:border-border/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
