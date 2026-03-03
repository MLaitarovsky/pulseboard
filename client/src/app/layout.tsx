import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { SocketProvider } from "@/components/SocketProvider";
import CursorOverlay from "@/components/CursorOverlay";

export const metadata: Metadata = {
  title: "PulseBoard — Live Team Metrics & Incident Dashboard",
  description: "Real-time operational dashboard for engineering teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SocketProvider teamId="acme-eng">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-60">
              <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
            </main>
          </div>
          <CursorOverlay />
        </SocketProvider>
      </body>
    </html>
  );
}
