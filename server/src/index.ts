import express from 'express';
import cors from 'cors';
import http from 'http';
import dotenv from 'dotenv';

import { runMigrations } from './db/migrate';
import { seedDatabase } from './db/seed';
import healthRouter from './routes/health';
import metricsRouter from './routes/metrics';
import eventsRouter from './routes/events';
import incidentsRouter from './routes/incidents';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// --------------- Middleware ---------------
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// --------------- Routes ---------------
app.use('/api/health', healthRouter);
app.use('/api/teams', metricsRouter);
app.use('/api/teams', eventsRouter);
app.use('/api/teams', incidentsRouter);

// --------------- Error Handling ---------------
app.use(notFoundHandler);
app.use(errorHandler);

// --------------- Start ---------------
async function start() {
  try {
    // Run database migrations
    await runMigrations();

    // Seed with demo data
    await seedDatabase();

    server.listen(PORT, () => {
      console.log(`
  ┌─────────────────────────────────────┐
  │                                     │
  │   🟢 PulseBoard Server Running     │
  │   http://localhost:${PORT}            │
  │                                     │
  │   Health: /api/health               │
  │   Metrics: /api/teams/:id/metrics   │
  │   Events: /api/teams/:id/events     │
  │   Incidents: /api/teams/:id/incidents│
  │                                     │
  └─────────────────────────────────────┘
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { app, server };
