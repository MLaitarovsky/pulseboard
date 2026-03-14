# PulseBoard

**Real-time operational dashboard for engineering teams** — monitor deployments, incidents, and system health with live WebSocket updates, multiplayer cursors, and interactive D3.js visualizations.

![Tech Stack](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat&logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat&logo=socket.io)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=flat&logo=d3.js&logoColor=white)

![Dashboard Screenshot](./docs/ReadmePager.png)

---

## What It Does

PulseBoard is a full-stack monitoring dashboard where teams can:

- **Watch system metrics update in real-time** — uptime, error rates, deploy frequency, response time
- **Receive and normalize webhook events** from GitHub Actions, Sentry, and uptime monitors into a unified timeline
- **Manage incidents** through a full lifecycle state machine (Open → Acknowledged → Investigating → Resolved) with severity tracking and auto-generated post-mortem templates
- **Collaborate live** with Figma-style multiplayer cursors and shared timeline annotations
- **Explore data** on an interactive D3.js timeline with brush-to-zoom, annotation markers, and collaborative cursor sync
- **Get notified** via in-app toast notifications and configurable webhook endpoints (Slack/Discord style)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Client (Next.js 14)                     │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌────────────────┐  │
│  │Dashboard │  │ Incidents │  │ Events   │  │   Settings     │  │
│  │ Metrics  │  │ Timeline  │  │ Feed     │  │ Webhook Config │  │
│  │ D3 Chart │  │ State Mgr │  │ Live     │  │ Notif Log      │  │
│  └────┬─────┘  └────┬──────┘  └────┬─────┘  └────────────────┘  │
│       │              │              │                             │
│  ┌────┴──────────────┴──────────────┴───┐                        │
│  │  SocketProvider (useSocket hook)     │  ← WebSocket           │
│  │  • Event batching (200ms buffer)     │                        │
│  │  • Reconnect recovery                │                        │
│  │  • Cursor sync + Timeline cursors    │                        │
│  │  • Toast notifications               │                        │
│  └──────────────────┬───────────────────┘                        │
└─────────────────────┼────────────────────────────────────────────┘
                      │ WebSocket + REST API
┌─────────────────────┼────────────────────────────────────────────┐
│                     │       Server (Express + Socket.IO)          │
│  ┌──────────────────┴───────────────────┐                        │
│  │  Socket.IO Server                    │                        │
│  │  • Team rooms + presence             │                        │
│  │  • Redis Pub/Sub → broadcast         │                        │
│  │  • Cursor relay + Timeline cursors   │                        │
│  └──────────────────┬───────────────────┘                        │
│                     │                                            │
│  ┌──────────┐  ┌────┴──────┐  ┌────────────┐  ┌──────────────┐  │
│  │ REST API │  │ Webhooks  │  │ Normalizer │  │ Notification │  │
│  │ Metrics  │  │ Receiver  │→ │ GitHub     │  │ Service      │  │
│  │ Events   │  │ /webhooks │  │ Sentry     │  │ In-app toast │  │
│  │Incidents │  │ /:source  │  │ Uptime     │  │ Webhook POST │  │
│  │Annotate  │  └───────────┘  └────────────┘  │ HMAC signing │  │
│  └──────────┘                                  └──────────────┘  │
│                                                                  │
│  ┌────────────────────────────┬──────────────────────────┐       │
│  │      PostgreSQL            │         Redis            │       │
│  │  teams, metrics, events    │  Pub/Sub (events,        │       │
│  │  incidents, timeline       │   incidents, annotations)│       │
│  │  annotations, webhook_cfg  │  Session + caching       │       │
│  │  notification_log          │                          │       │
│  └────────────────────────────┴──────────────────────────┘       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS | App Router, SSR-ready, type safety |
| **Data Viz** | D3.js | Custom zoomable timeline, brush selection, annotations — far beyond chart libraries |
| **Real-time** | Socket.IO + Redis Pub/Sub | Bi-directional WebSocket with room-based broadcasting and horizontal scaling |
| **Backend** | Express, TypeScript | Lightweight, full control over WebSocket lifecycle |
| **Database** | PostgreSQL | Relational data with JSONB for flexible webhook payloads, time-series indexing |
| **Cache/PubSub** | Redis | Event fanout, session management, pub/sub bridge |
| **Infra** | Docker, GitHub Actions | Multi-stage builds, full CI pipeline (lint → typecheck → test → build) |

---

## Features

### Real-Time Dashboard
- Live metric cards with flash animations on update
- Events feed with "X new events" banner (like Twitter)
- 200ms event batching to prevent render thrashing
- Automatic reconnect recovery — fetches missed events on disconnect

### Interactive D3.js Timeline
- Zoomable time axis with scroll-to-zoom and drag-to-pan
- **Brush selection** — drag to select a time range, auto-zooms with cubic easing
- **Annotations** — click to drop timestamped notes, persisted to DB, synced in real-time
- Event dots color-coded by source and severity, incident bars with stagger logic

### Multiplayer Collaboration
- **Live cursors** — see other team members' cursors on the page (Figma-style)
- **Timeline cursors** — hover the D3 chart and others see your position as a vertical line with your name
- Viewer count with avatar indicators

### Incident Management
- Full state machine: Open → Acknowledged → Investigating → Resolved (+ Escalate, Reopen)
- Severity tracking with modal-based changes and reason logging
- Auto-generated post-mortem templates on resolution
- Timeline view of all state transitions

### Webhook Ingestion
- Normalized event pipeline: GitHub Actions, Sentry, Uptime → unified schema
- HMAC signature verification for GitHub webhooks
- Raw payload storage for debugging
- Auto-updates metrics on event ingestion

### Notification System
- In-app toast notifications via Socket.IO (auto-dismiss, progress bar, incident links)
- Configurable webhook endpoints with event subscription filters
- HMAC signing for outbound webhooks
- Full notification log with sent/failed status

### Demo Mode
- Auto-generates realistic events every 4 seconds
- "Simulate Incident" button triggers a full lifecycle (create → ack → investigate → resolve over 50s)
- Perfect for portfolio demos — visitors see a live, active dashboard immediately

---

## Getting Started

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git

### Quick Start (Docker)

```bash
git clone https://github.com/MLaitarovsky/pulseboard.git
cd pulseboard

# Start everything
docker compose up -d

# Run database migrations & seed
cd server
npm install
npx tsx src/db/migrate.ts
npx tsx src/db/seed.ts
cd ..

# Open the dashboard
open http://localhost:3000
```

### Local Development

```bash
# Terminal 1: Start databases
docker compose up postgres redis -d

# Terminal 2: Start server
cd server
cp .env.example .env
npm install
npm run dev

# Terminal 3: Start client
cd client
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment Variables

**Server** (`server/.env`):
```
PORT=3001
DATABASE_URL=postgres://pulseboard:pulseboard_dev@localhost:5432/pulseboard
REDIS_URL=redis://localhost:6379
CLIENT_URL=http://localhost:3000
WEBHOOK_SECRET=your_secret_here
```

**Client** (`client/.env.local`):
```
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

---

## Project Structure

```
pulseboard/
├── client/                    # Next.js 14 frontend
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   │   ├── page.tsx       # Dashboard
│   │   │   ├── incidents/     # Incident list + detail
│   │   │   ├── events/        # Events feed page
│   │   │   └── settings/      # Webhook config + notification log
│   │   ├── components/
│   │   │   ├── TimelineChart.tsx      # D3.js interactive timeline
│   │   │   ├── EventsFeed.tsx         # Live events with batch support
│   │   │   ├── SocketProvider.tsx     # React context for WebSocket
│   │   │   ├── CursorOverlay.tsx      # Multiplayer cursor rendering
│   │   │   ├── NotificationToasts.tsx # In-app toast notifications
│   │   │   ├── DemoControls.tsx       # Demo mode start/stop UI
│   │   │   └── Sidebar.tsx            # Navigation with team selector
│   │   └── hooks/
│   │       └── useSocket.ts           # WebSocket hook (batching, cursors, notifications)
│   └── Dockerfile
├── server/                    # Express + Socket.IO backend
│   ├── src/
│   │   ├── routes/
│   │   │   ├── incidents.ts   # Incident CRUD + state machine
│   │   │   ├── webhooks.ts    # Webhook receiver + normalizers
│   │   │   ├── notifications.ts # Webhook config + notification log
│   │   │   ├── annotations.ts # Timeline annotations CRUD
│   │   │   └── demo.ts        # Demo mode controls
│   │   ├── services/
│   │   │   ├── socket.ts      # Socket.IO server + Redis bridge
│   │   │   ├── notifications.ts # Notification delivery engine
│   │   │   ├── normalizers.ts # Webhook payload normalizers
│   │   │   └── demo.ts        # Demo event generator
│   │   ├── db/
│   │   │   ├── pool.ts        # PostgreSQL connection pool
│   │   │   ├── redis.ts       # Redis client + subscriber
│   │   │   ├── migrate.ts     # Database schema migrations
│   │   │   └── seed.ts        # Realistic seed data generator
│   │   └── __tests__/         # API + normalizer tests (Vitest)
│   └── Dockerfile
├── docker-compose.yml         # Full stack: client, server, postgres, redis
├── .github/workflows/ci.yml  # CI: lint → typecheck → test → build
└── README.md
```

---

## Testing

```bash
cd server
npm test
```

Runs API endpoint tests (supertest) and webhook normalizer unit tests (vitest).

---

## Deployment

| Service | Platform | Notes |
|---------|----------|-------|
| **Frontend** | Vercel | Connect `client/` directory, set `NEXT_PUBLIC_SOCKET_URL` |
| **Backend** | Railway / Fly.io | Deploy from `server/`, set `DATABASE_URL`, `REDIS_URL`, `CLIENT_URL` |
| **Database** | Neon / Railway Postgres | Free tier available |
| **Redis** | Upstash / Railway Redis | Free tier available |

---

## What I Learned

- **D3.js in React** — Managing D3's imperative DOM manipulation alongside React's declarative model requires careful ref management and understanding when to let D3 vs React own the DOM
- **WebSocket backpressure** — Batching high-frequency events (200ms buffer) prevents render thrashing while keeping the UI feeling live
- **Reconnect recovery** — Tracking the last-received timestamp and fetching missed events on reconnect prevents data gaps
- **State machines for workflows** — Encoding valid transitions explicitly (not just any status → any status) prevents impossible states and makes the system predictable
- **Multi-stage Docker builds** — Separating build and runtime stages cut the final image size by ~70%

---

## License

MIT
