'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useSocketContext } from './SocketProvider';
import { usePathname } from 'next/navigation';

interface CursorData {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
  page: string;
  timestamp: number;
}

function CursorIcon({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      fill="none"
      style={{ filter: `drop-shadow(0 1px 2px rgba(0,0,0,0.5))` }}
    >
      <path
        d="M0.928711 0.524902L15.0713 10.0249L8.00002 11.5249L4.92871 19.5249L0.928711 0.524902Z"
        fill={color}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export default function CursorOverlay() {
  const { cursors, sendCursorMove } = useSocketContext();
  const pathname = usePathname();
  const throttleRef = useRef<number>(0);

  // Broadcast own cursor position (throttled to ~30fps)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const now = Date.now();
    if (now - throttleRef.current < 33) return; // ~30fps
    throttleRef.current = now;

    // Send normalized coordinates (percentage of viewport)
    const x = (e.clientX / window.innerWidth) * 100;
    const y = (e.clientY / window.innerHeight) * 100;
    sendCursorMove(x, y, pathname);
  }, [sendCursorMove, pathname]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Convert cursors Map to array, filter to same page
  const visibleCursors: CursorData[] = [];
  cursors.forEach((cursor, userId) => {
    if (cursor.page === pathname) {
      visibleCursors.push(cursor);
    }
  });

  if (visibleCursors.length === 0) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
    >
      {visibleCursors.map((cursor) => {
        // Convert percentage back to pixels
        const px = (cursor.x / 100) * window.innerWidth;
        const py = (cursor.y / 100) * window.innerHeight;

        return (
          <div
            key={cursor.userId}
            className="absolute"
            style={{
              left: px,
              top: py,
              transition: 'left 0.1s linear, top 0.1s linear',
              willChange: 'left, top',
            }}
          >
            {/* Cursor arrow */}
            <CursorIcon color={cursor.color} />

            {/* Name label */}
            <div
              className="absolute left-4 top-4 px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap shadow-lg"
              style={{
                backgroundColor: cursor.color,
                color: getContrastColor(cursor.color),
              }}
            >
              {cursor.userName}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pick black or white text based on background color brightness
function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
