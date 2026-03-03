"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Rocket,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { clsx } from "clsx";
import EventsFeed from "@/components/EventsFeed";
import TimelineChart from "@/components/TimelineChart";
import PresencePanel from "@/components/PresencePanel";
import { useSocketContext } from "@/components/SocketProvider";

const TEAM_ID = "acme-eng";

interface MetricsSnapshot {
  uptime: number;
  errorRate: number;
  deployFrequency: number;
  responseTime: number;
  updatedAt: string;
}

interface IncidentSummary {
  open: number;
  investigating: number;
  critical: number;
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  color,
  trend,
  flash,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: any;
  color: string;
  trend?: "up" | "down" | "neutral";
  flash?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    green: "text-accent-green bg-accent-green/10 border-accent-green/20",
    purple: "text-accent-purple bg-accent-purple/10 border-accent-purple/20",
    red: "text-accent-red bg-accent-red/10 border-accent-red/20",
    yellow: "text-accent-yellow bg-accent-yellow/10 border-accent-yellow/20",
  };
  const valueColor: Record<string, string> = {
    green: "text-accent-green",
    purple: "text-accent-purple",
    red: "text-accent-red",
    yellow: "text-accent-yellow",
  };

  return (
    <div
      className={clsx(
        "bg-surface border border-border rounded-xl p-5 transition-all duration-500",
        flash
          ? "border-accent-green/50 shadow-[0_0_15px_rgba(0,229,160,0.1)]"
          : "hover:border-accent-green/30",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-dim uppercase tracking-wider font-mono">
          {label}
        </span>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[color]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx(
            "text-2xl font-bold font-mono transition-all duration-300",
            valueColor[color],
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-text-dim">{unit}</span>}
      </div>
      {trend && (
        <div className="flex items-center gap-1 mt-2 text-xs text-text-dim">
          {trend === "up" ? (
            <TrendingUp className="w-3 h-3 text-accent-green" />
          ) : trend === "down" ? (
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
  const [incidents, setIncidents] = useState<IncidentSummary>({
    open: 0,
    investigating: 0,
    critical: 0,
  });
  const [loading, setLoading] = useState(true);
  const [metricsFlash, setMetricsFlash] = useState(false);

  const { status, metricsVersion, incidentVersion } = useSocketContext();

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/metrics`);
      if (res.ok) setMetrics(await res.json());
    } catch (err) {
      console.error("Failed to fetch metrics:", err);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/${TEAM_ID}/incidents`);
      if (res.ok) {
        const data = await res.json();
        const open = data.filter((i: any) => i.status !== "resolved").length;
        const investigating = data.filter(
          (i: any) => i.status === "investigating",
        ).length;
        const critical = data.filter(
          (i: any) => i.severity === "critical" && i.status !== "resolved",
        ).length;
        setIncidents({ open, investigating, critical });
      }
    } catch (err) {
      console.error("Failed to fetch incidents:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await Promise.all([fetchMetrics(), fetchIncidents()]);
      setLoading(false);
    }
    init();
  }, [fetchMetrics, fetchIncidents]);

  useEffect(() => {
    if (metricsVersion > 0) {
      setMetricsFlash(true);
      setTimeout(() => setMetricsFlash(false), 1500);
      fetchMetrics();
    }
  }, [metricsVersion, fetchMetrics]);

  useEffect(() => {
    if (incidentVersion > 0) {
      fetchIncidents();
    }
  }, [incidentVersion, fetchIncidents]);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
            Dashboard
          </h1>
          <p className="text-sm text-text-dim mt-1">
            Real-time overview of your system health and activity
          </p>
        </div>
        <PresencePanel />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-xl p-5"
            >
              <div className="skeleton h-4 w-20 mb-4" />
              <div className="skeleton h-8 w-24" />
            </div>
          ))
        ) : (
          <>
            <MetricCard
              label="Uptime"
              value={metrics?.uptime?.toFixed(2) ?? "—"}
              unit="%"
              icon={Activity}
              color="green"
              trend="up"
              flash={metricsFlash}
            />
            <MetricCard
              label="Error Rate"
              value={metrics?.errorRate?.toFixed(2) ?? "—"}
              unit="%"
              icon={AlertTriangle}
              color="red"
              trend="down"
              flash={metricsFlash}
            />
            <MetricCard
              label="Deploys (7d)"
              value={metrics?.deployFrequency ?? "—"}
              icon={Rocket}
              color="purple"
              trend="neutral"
              flash={metricsFlash}
            />
            <MetricCard
              label="Response Time"
              value={metrics?.responseTime?.toFixed(0) ?? "—"}
              unit="ms"
              icon={Clock}
              color="yellow"
              trend="up"
              flash={metricsFlash}
            />
          </>
        )}
      </div>

      {/* Timeline + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-5 h-[440px]">
          <TimelineChart />
        </div>
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Recent Events
              </h2>
              <p className="text-[10px] text-text-dim font-mono uppercase tracking-wider mt-0.5">
                Live feed
              </p>
            </div>
            <div
              className={clsx(
                "w-2 h-2 rounded-full",
                status === "connected"
                  ? "bg-accent-green pulse-green"
                  : "bg-accent-red",
              )}
            />
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            <EventsFeed limit={20} />
          </div>
        </div>
      </div>

      {/* Incidents Banner */}
      {!loading && incidents.open > 0 && (
        <div className="mt-4 bg-accent-red/5 border border-accent-red/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-red/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-accent-red" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {incidents.open} active incident
                {incidents.open !== 1 ? "s" : ""}
                {incidents.critical > 0 && (
                  <span className="ml-2 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-accent-red/15 text-accent-red">
                    {incidents.critical} critical
                  </span>
                )}
              </p>
              <p className="text-xs text-text-dim mt-0.5">
                {incidents.investigating > 0
                  ? `${incidents.investigating} under investigation`
                  : "Awaiting acknowledgment"}
              </p>
            </div>
          </div>
          <a
            href="/incidents"
            className="text-xs text-accent-red hover:underline font-medium"
          >
            View all →
          </a>
        </div>
      )}
    </div>
  );
}
