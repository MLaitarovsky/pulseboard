# PulseBoard

> Real-time operational dashboard for engineering teams — monitor uptime, deployments, error rates, and incidents with live collaboration.

![Status](https://img.shields.io/badge/status-in%20development-yellow)

## What is PulseBoard?

PulseBoard is a lightweight, real-time dashboard where engineering teams can monitor system health, track deployments, manage incidents, and collaborate during outages — with live cursors and timeline annotations. Think of it as a collaborative war room that's always on.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, D3.js |
| **Backend** | Node.js, Express, Socket.IO |
| **Database** | PostgreSQL (time-series metrics, events, incidents) |
| **Cache/PubSub** | Redis (real-time event broadcasting) |
| **Infrastructure** | Docker, GitHub Actions CI |

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Git

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/pulseboard.git
cd pulseboard
```

### 2. Start the databases
```bash
docker-compose up -d
```

### 3. Set up the server
```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### 4. Set up the client
```bash
cd client
cp .env.example .env.local
npm install
npm run dev
```

### 5. Open the app
Visit [http://localhost:3000](http://localhost:3000)

## Project Structure

```
pulseboard/
├── client/          → Next.js 14 frontend
├── server/          → Express API + Socket.IO server
├── shared/          → Shared TypeScript types
├── docker-compose.yml
└── README.md
```

## Features (Roadmap)

- [x] Project scaffolding & monorepo setup
- [x] Core REST API (metrics, events, incidents)
- [x] Dashboard UI with metric cards
- [x] Webhook ingestion engine
- [x] Real-time WebSocket updates
- [ ] Interactive D3.js timeline
- [ ] Live multiplayer cursors
- [ ] Incident state machine
- [ ] Docker + CI/CD pipeline
- [ ] Deployment & demo mode

## License

MIT
