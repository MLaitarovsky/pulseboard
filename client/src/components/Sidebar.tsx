"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  AlertTriangle,
  Radio,
  Settings,
  Activity,
  ChevronDown,
  User,
} from "lucide-react";
import { clsx } from "clsx";
import { useSocketContext } from "./SocketProvider";
import { useTeam } from "./TeamProvider";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/events", label: "Events", icon: Radio },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { status } = useSocketContext();
  const { teams, teamId, team, setTeamId } = useTeam();
  const [teamOpen, setTeamOpen] = useState(false);

  const statusColor =
    status === "connected"
      ? "bg-accent-green"
      : status === "connecting"
        ? "bg-yellow-400"
        : "bg-red-500";

  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting..."
        : "Disconnected";

  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent-green" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-text-primary tracking-tight">
              PulseBoard
            </h1>
            <p className="text-[10px] font-mono text-text-dim uppercase tracking-wider">
              Live Dashboard
            </p>
          </div>
        </div>
      </div>

      {/* Team Selector */}
      <div className="px-3 pt-3 pb-1">
        <div className="relative">
          <button
            onClick={() => setTeamOpen(!teamOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all bg-surface-2 border border-border hover:border-accent-green/30 text-text-primary"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded bg-accent-purple/20 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-accent-purple">
                  {(team?.name ?? teamId).charAt(0).toUpperCase()}
                </span>
              </span>
              <span className="truncate">{team?.name ?? teamId}</span>
            </div>
            <ChevronDown
              className={clsx(
                "w-3.5 h-3.5 text-text-dim transition-transform shrink-0",
                teamOpen && "rotate-180",
              )}
            />
          </button>

          {teamOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg bg-surface border border-border shadow-xl z-50 overflow-hidden">
              {teams.map((t) => (
                <button
                  key={t.slug}
                  onClick={() => {
                    setTeamId(t.slug);
                    setTeamOpen(false);
                  }}
                  className={clsx(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors",
                    t.slug === teamId
                      ? "bg-accent-green/10 text-accent-green"
                      : "text-text-dim hover:text-text-primary hover:bg-surface-2",
                  )}
                >
                  <span className="w-5 h-5 rounded bg-accent-purple/20 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-accent-purple">
                      {t.name.charAt(0)}
                    </span>
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-accent-green/10 text-accent-green"
                  : "text-text-dim hover:text-text-primary hover:bg-surface-2",
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + Connection Status */}
      <div className="p-4 border-t border-border space-y-3">
        {/* User Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-accent-purple/20 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-accent-purple" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary truncate">
              Demo User
            </p>
            <p className="text-[10px] text-text-dim font-mono truncate">
              demo@acme.dev
            </p>
          </div>
        </div>

        {/* Connection */}
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              statusColor,
              status === "connected" && "pulse-green",
            )}
          />
          {statusLabel}
        </div>
        <p className="text-[10px] text-text-dim/60 font-mono">
          {team?.name ?? teamId}
        </p>
      </div>
    </aside>
  );
}
