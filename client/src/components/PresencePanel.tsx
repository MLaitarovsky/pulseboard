'use client';

import { useState } from 'react';
import { Users, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useSocketContext } from './SocketProvider';

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function PresencePanel() {
  const { viewers, status } = useSocketContext();
  const [expanded, setExpanded] = useState(false);

  const count = viewers.length || 1;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          'flex items-center gap-2 text-xs bg-surface border rounded-lg px-3 py-2 transition-all hover:border-accent-green/30',
          status === 'connected' ? 'text-text-dim border-border' : 'text-accent-yellow border-accent-yellow/30'
        )}
      >
        <Users className="w-3.5 h-3.5" />
        <span>{count} viewer{count !== 1 ? 's' : ''}</span>

        {/* Avatar stack */}
        {viewers.length > 0 && (
          <div className="flex -space-x-1.5 ml-1">
            {viewers.slice(0, 5).map((v) => (
              <div
                key={v.userId}
                className="w-5 h-5 rounded-full border-2 border-surface text-[8px] flex items-center justify-center font-bold"
                style={{
                  backgroundColor: v.color,
                  color: getContrastColor(v.color),
                }}
                title={v.userName}
              >
                {v.userName.charAt(0).toUpperCase()}
              </div>
            ))}
            {viewers.length > 5 && (
              <div className="w-5 h-5 rounded-full bg-surface-3 border-2 border-surface text-[8px] flex items-center justify-center text-text-dim">
                +{viewers.length - 5}
              </div>
            )}
          </div>
        )}

        <ChevronDown className={clsx(
          'w-3 h-3 transition-transform',
          expanded && 'rotate-180'
        )} />
      </button>

      {/* Dropdown panel */}
      {expanded && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-primary">Active Viewers</span>
              <span className={clsx(
                'w-2 h-2 rounded-full',
                status === 'connected' ? 'bg-accent-green pulse-green' : 'bg-accent-red'
              )} />
            </div>
            <p className="text-[10px] text-text-dim mt-0.5">
              {status === 'connected' ? 'Connected via WebSocket' : 'Reconnecting...'}
            </p>
          </div>

          <div className="max-h-[240px] overflow-y-auto">
            {viewers.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-text-dim">
                Just you here
              </div>
            ) : (
              <div className="py-1">
                {viewers.map((viewer) => (
                  <div
                    key={viewer.userId}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        backgroundColor: viewer.color,
                        color: getContrastColor(viewer.color),
                      }}
                    >
                      {viewer.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">
                        {viewer.userName}
                      </p>
                      <p className="text-[10px] text-text-dim">
                        Joined {timeAgo(viewer.joinedAt)}
                      </p>
                    </div>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: viewer.color }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-t border-border bg-surface-2/50">
            <p className="text-[9px] text-text-dim/60 font-mono">
              Cursors visible to all viewers
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
