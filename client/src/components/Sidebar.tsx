'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, AlertTriangle, Radio, Settings, Activity } from 'lucide-react';
import { clsx } from 'clsx';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { href: '/events', label: 'Events', icon: Radio },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

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

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                isActive
                  ? 'bg-accent-green/10 text-accent-green'
                  : 'text-text-dim hover:text-text-primary hover:bg-surface-2'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Connection Status */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-text-dim">
          <span className="w-2 h-2 rounded-full bg-accent-green pulse-green" />
          Connected
        </div>
        <p className="text-[10px] text-text-dim/60 mt-1 font-mono">
          Acme Engineering
        </p>
      </div>
    </aside>
  );
}
