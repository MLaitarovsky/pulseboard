'use client';

import { Radio } from 'lucide-react';

export default function EventsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">
          Events
        </h1>
        <p className="text-sm text-text-dim mt-1">
          All ingested events from GitHub, Sentry, and uptime monitors
        </p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-12 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-text-dim">
          <Radio className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Events Feed</p>
          <p className="text-sm mt-2 opacity-60">
            Phase 2.3 — Full events list with source filtering
          </p>
        </div>
      </div>
    </div>
  );
}
