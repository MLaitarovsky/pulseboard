"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  Search,
  RotateCcw,
  Shield,
  X,
  ExternalLink,
} from "lucide-react";
import { clsx } from "clsx";
import { useSocketContext } from "./SocketProvider";
import Link from "next/link";

interface ToastNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  incidentId?: string;
  actor: string;
  timestamp: string;
  exiting?: boolean;
}

const typeIcons: Record<string, any> = {
  incident_created: AlertTriangle,
  incident_resolved: CheckCircle,
  incident_acknowledged: Eye,
  incident_investigating: Search,
  incident_reopened: RotateCcw,
  incident_escalated: Shield,
  severity_change: Shield,
};

const typeColors: Record<
  string,
  { bg: string; border: string; accent: string }
> = {
  incident_created: {
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    accent: "#ef4444",
  },
  incident_resolved: {
    bg: "rgba(0,229,160,0.1)",
    border: "rgba(0,229,160,0.25)",
    accent: "#00e5a0",
  },
  incident_acknowledged: {
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.25)",
    accent: "#fbbf24",
  },
  incident_investigating: {
    bg: "rgba(168,85,247,0.1)",
    border: "rgba(168,85,247,0.25)",
    accent: "#a855f7",
  },
  incident_reopened: {
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.25)",
    accent: "#ef4444",
  },
  incident_escalated: {
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.25)",
    accent: "#fbbf24",
  },
  severity_change: {
    bg: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.25)",
    accent: "#fbbf24",
  },
};

const MAX_TOASTS = 5;
const TOAST_DURATION = 8000; // 8 seconds

export default function NotificationToasts() {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const { lastNotification } = useSocketContext();

  const removeToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  // React to new notifications from socket
  useEffect(() => {
    if (!lastNotification) return;

    const toast: ToastNotification = {
      id: lastNotification.id,
      type: lastNotification.type,
      title: lastNotification.title,
      message: lastNotification.message,
      severity: lastNotification.severity,
      incidentId: lastNotification.incidentId,
      actor: lastNotification.actor,
      timestamp: lastNotification.timestamp,
    };

    setToasts((prev) => {
      const updated = [toast, ...prev].slice(0, MAX_TOASTS);
      return updated;
    });

    // Auto-dismiss after duration
    const timer = setTimeout(() => removeToast(toast.id), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [lastNotification, removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9998] flex flex-col gap-2 w-[380px] pointer-events-none">
      {toasts.map((toast) => {
        const Icon = typeIcons[toast.type] || AlertTriangle;
        const colors = typeColors[toast.type] || typeColors.incident_created;

        return (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto rounded-xl p-4 shadow-2xl transition-all duration-300",
              toast.exiting
                ? "opacity-0 translate-x-8"
                : "opacity-100 translate-x-0",
            )}
            style={{
              background: "#1a1a2e",
              border: `1px solid ${colors.border}`,
              backdropFilter: "blur(12px)",
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${colors.accent}10`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: colors.bg }}
              >
                <Icon className="w-4 h-4" style={{ color: colors.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {toast.title}
                </p>
                <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
                  {toast.message}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-mono text-white/30">
                    {new Date(toast.timestamp).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="text-white/15">·</span>
                  <span className="text-[10px] font-mono text-white/30">
                    {toast.actor}
                  </span>
                  {toast.incidentId && (
                    <>
                      <span className="text-white/15">·</span>
                      <Link
                        href={`/incidents/${toast.incidentId}`}
                        className="text-[10px] font-mono flex items-center gap-1 transition-colors hover:underline"
                        style={{ color: colors.accent }}
                      >
                        View <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white/30" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-0.5 rounded-full overflow-hidden bg-white/5">
              <div
                className="h-full rounded-full"
                style={{
                  background: colors.accent,
                  animation: `shrink ${TOAST_DURATION}ms linear forwards`,
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        );
      })}

      <style jsx>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
