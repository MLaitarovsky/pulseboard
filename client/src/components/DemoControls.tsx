'use client';

import { useState, useEffect } from 'react';
import { Play, Square, Zap, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function DemoControls() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(false);

  useEffect(() => {
    fetch('/api/demo/status')
      .then((r) => r.json())
      .then((d) => setRunning(d.running))
      .catch(() => {});
  }, []);

  async function toggleDemo() {
    setLoading(true);
    try {
      const endpoint = running ? '/api/demo/stop' : '/api/demo/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: 'acme-eng' }),
      });
      if (res.ok) setRunning(!running);
    } catch (err) {
      console.error('Demo toggle failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function triggerIncident() {
    setIncidentLoading(true);
    try {
      await fetch('/api/demo/incident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: 'acme-eng' }),
      });
    } catch (err) {
      console.error('Incident simulation failed:', err);
    } finally {
      setTimeout(() => setIncidentLoading(false), 1000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleDemo}
        disabled={loading}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
          running
            ? 'bg-accent-red/10 text-accent-red border-accent-red/30 hover:bg-accent-red/20'
            : 'bg-accent-green/10 text-accent-green border-accent-green/30 hover:bg-accent-green/20'
        )}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : running ? (
          <Square className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        {running ? 'Stop Demo' : 'Start Demo'}
      </button>

      <button
        onClick={triggerIncident}
        disabled={incidentLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent-purple/10 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/20 transition-all disabled:opacity-50"
        title="Simulate a full incident lifecycle (create → acknowledge → investigate → resolve)"
      >
        {incidentLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Zap className="w-3.5 h-3.5" />
        )}
        Simulate Incident
      </button>

      {running && (
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-accent-green">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          Generating events...
        </span>
      )}
    </div>
  );
}
