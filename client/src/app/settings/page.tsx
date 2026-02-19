'use client';

import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-text-dim mt-1">
          Configure webhook endpoints, notification channels, and team settings
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-12 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-text-dim">
          <Settings className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Team Settings</p>
          <p className="text-sm mt-2 opacity-60">
            Phase 7.3 — Webhook URLs, notification preferences, team config
          </p>
        </div>
      </div>
    </div>
  );
}
