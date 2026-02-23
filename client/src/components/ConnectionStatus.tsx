'use client';

import { useSocketContext } from './SocketProvider';
import { clsx } from 'clsx';

export default function ConnectionStatus() {
  const { status } = useSocketContext();

  const config = {
    connected: { color: 'bg-accent-green', pulse: 'pulse-green', label: 'Connected' },
    connecting: { color: 'bg-accent-yellow', pulse: '', label: 'Reconnecting...' },
    disconnected: { color: 'bg-accent-red', pulse: '', label: 'Disconnected' },
  };

  const { color, pulse, label } = config[status];

  return (
    <div className="flex items-center gap-2 text-xs text-text-dim">
      <span className={clsx('w-2 h-2 rounded-full', color, pulse)} />
      {label}
    </div>
  );
}
