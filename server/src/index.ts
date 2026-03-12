import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";

import { runMigrations } from "./db/migrate";
import { seedDatabase } from "./db/seed";
import { initializeSocket } from "./services/socket";
import healthRouter from "./routes/health";
import teamsRouter from "./routes/teams";
import metricsRouter from "./routes/metrics";
import eventsRouter from "./routes/events";
import incidentsRouter from "./routes/incidents";
import webhooksRouter from "./routes/webhooks";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import annotationsRouter from "./routes/annotations";
import notificationsRouter from "./routes/notifications";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;
const io = initializeSocket(server);

// --------------- Middleware ---------------
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json());

// --------------- Routes ---------------
app.use("/api/health", healthRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/teams", metricsRouter);
app.use("/api/teams", eventsRouter);
app.use("/api/teams", incidentsRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/teams", annotationsRouter);
app.use("/api/teams", notificationsRouter);
app.set("io", io);

// --------------- Error Handling ---------------
app.use(notFoundHandler);
app.use(errorHandler);

// --------------- Start ---------------
async function start() {
  try {
    await runMigrations();
    await seedDatabase();

    // Initialize Socket.IO (attaches to the HTTP server)
    const io = initializeSocket(server);

    server.listen(PORT, () => {
      console.log(`
  ┌──────────────────────────────────────────┐
  │                                          │
  │   🟢 PulseBoard Server Running          │
  │   http://localhost:${PORT}                 │
  │                                          │
  │   REST API + Socket.IO on same port      │
  │   Health:    /api/health                 │
  │   Webhooks:  /api/webhooks/:source       │
  │   WebSocket: ws://localhost:${PORT}        │
  │                                          │
  └──────────────────────────────────────────┘
      `);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

start();

export { app, server };
