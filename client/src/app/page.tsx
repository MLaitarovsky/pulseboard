'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Rocket, Clock, TrendingUp, TrendingDown } from 'lucide-react';

// Demo team ID — will be dynamic later
const TEAM_ID = 'acme-eng';

interface MetricsSnapshot {
  uptime: number;
  errorRate: number;
  deployFrequency: number;
  responseTime: number;
  updatedAt: string;
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  color,
  trend,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: any;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const colorClasses: Record<string, string> = {
    green: 'text-accent-green bg-accent-green/10 border-accent-green/20',
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
    red: 'text-accent-red bg-accent-red/10 border-accent-red/20',
    yellow: 'text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20',
  };

  const valueColor: Record<string, string> = {
    green: 'text-accent-green',
    purple: 'text-accent-purple',
    red: 'text-accent-red',
    yellow: 'text-accent-yellow',
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-5 hover:border-accent-green/30 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-dim uppercase tracking-wider font-mono">
          {label}
        </span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono ${valueColor[color]}`}>
          {value}
        </span>
        {unit && <span className="text-sm text-text-dim">{unit}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2 text-xs text-text-dim">
          {trend === 'up' ? (
            <TrendingUp className="w-3 h-3 text-accent-green" />
          ) : trend === 'down' ? (
            <TrendingDown className="w-3 h-3 text-accent-red" />
          ) : null}
          <span>vs last 24h</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Fetch from the API (proxied through Next.js rewrites)
        const res = await fetch(`/api/teams/${TEAM_ID}/metrics`);
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-text-dim mt-1">
          Real-time overview of your system health and activity
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          // Skeleton loaders
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-xl p-5">
              <div className="skeleton h-4 w-20 mb-4" />
              <div className="skeleton h-8 w-24" />
            </div>
          ))
        ) : (
          <>
            <MetricCard
              label="Uptime"
              value={metrics?.uptime?.toFixed(2) ?? '—'}
              unit="%"
              icon={Activity}
              color="green"
              trend="up"
            />
            <MetricCard
              label="Error Rate"
              value={metrics?.errorRate?.toFixed(2) ?? '—'}
              unit="%"
              icon={AlertTriangle}
              color="red"
              trend="down"
            />
            <MetricCard
              label="Deploys (7d)"
              value={metrics?.deployFrequency ?? '—'}
              icon={Rocket}
              color="purple"
              trend="neutral"
            />
            <MetricCard
              label="Response Time"
              value={metrics?.responseTime?.toFixed(0) ?? '—'}
              unit="ms"
              icon={Clock}
              color="yellow"
              trend="up"
            />
          </>
        )}
      </div>

      {/* Placeholder sections for next phases */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Timeline Chart Placeholder */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 min-h-[350px] flex items-center justify-center">
          <div className="text-center text-text-dim">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">D3.js Timeline</p>
            <p className="text-xs mt-1 opacity-60">Phase 5 — Coming soon</p>
          </div>
        </div>

        {/* Events Feed Placeholder */}
        <div className="bg-surface border border-border rounded-xl p-5 min-h-[350px] flex items-center justify-center">
          <div className="text-center text-text-dim">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Live Events Feed</p>
            <p className="text-xs mt-1 opacity-60">Phase 2.3 — Next up</p>
          </div>
        </div>
      </div>
    </div>
  );
}
