import { Server as SocketServer } from "socket.io";
import http from "http";
import { redisSub } from "../db/redis";

interface ConnectedUser {
  socketId: string;
  userId: string;
  userName: string;
  color: string;
  teamId: string;
  joinedAt: Date;
}

// Track connected users per team
const teamUsers = new Map<string, Map<string, ConnectedUser>>();

// Generate a random color for cursor display
const CURSOR_COLORS = [
  "#00e5a0",
  "#6c5ce7",
  "#ff6b6b",
  "#ffd93d",
  "#00b4d8",
  "#a855f7",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#60a5fa",
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

export function initializeSocket(server: http.Server): SocketServer {
  const io = new SocketServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    let currentUser: ConnectedUser | null = null;

    // --- Join a team room ---
    socket.on(
      "join_team",
      async (data: { teamId: string; userId?: string; userName?: string }) => {
        const { userId, userName } = data;

        // Resolve slug to UUID so room names match Redis channels
        const { resolveTeamId } = await import("../utils/resolveTeam");
        const teamId = (await resolveTeamId(data.teamId)) || data.teamId;
        const roomName = `team:${teamId}`;

        // Leave any previous room
        if (currentUser) {
          socket.leave(`team:${currentUser.teamId}`);
          removeUserFromTeam(currentUser.teamId, socket.id);
          io.to(`team:${currentUser.teamId}`).emit("user_left", socket.id);
        }

        // Join new room
        socket.join(roomName);

        currentUser = {
          socketId: socket.id,
          userId: userId || `user-${socket.id.substring(0, 6)}`,
          userName: userName || `User ${socket.id.substring(0, 4)}`,
          color: getRandomColor(),
          teamId,
          joinedAt: new Date(),
        };

        addUserToTeam(teamId, currentUser);

        // Notify others in the room
        socket.to(roomName).emit("user_joined", {
          userId: currentUser.userId,
          userName: currentUser.userName,
          color: currentUser.color,
          joinedAt: currentUser.joinedAt,
        });

        // Send current viewers list to the joining user
        const viewers = getTeamUsers(teamId);
        socket.emit(
          "viewers_list",
          viewers.map((u) => ({
            userId: u.userId,
            userName: u.userName,
            color: u.color,
            joinedAt: u.joinedAt,
          })),
        );

        console.log(
          `👤 ${currentUser.userName} joined team:${teamId} (${viewers.length} viewers)`,
        );
      },
    );

    // --- Cursor movement ---
    socket.on("cursor_move", (data: { x: number; y: number; page: string }) => {
      if (!currentUser) return;

      socket.to(`team:${currentUser.teamId}`).emit("cursor_move", {
        userId: currentUser.userId,
        userName: currentUser.userName,
        color: currentUser.color,
        x: data.x,
        y: data.y,
        page: data.page,
        timestamp: Date.now(),
      });
    });

    // --- Disconnect ---
    socket.on("disconnect", (reason) => {
      if (currentUser) {
        const roomName = `team:${currentUser.teamId}`;
        removeUserFromTeam(currentUser.teamId, socket.id);
        io.to(roomName).emit("user_left", currentUser.userId);
        console.log(
          `👋 ${currentUser.userName} left team:${currentUser.teamId} (${reason})`,
        );
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  // --- Redis Pub/Sub → Socket.IO bridge ---
  // When a webhook event is ingested and published to Redis,
  // broadcast it to the relevant team room via Socket.IO
  setupRedisBridge(io);

  console.log("⚡ Socket.IO initialized");
  return io;
}

/**
 * Subscribe to Redis channels and forward events to Socket.IO rooms.
 */
function setupRedisBridge(io: SocketServer): void {
  redisSub.psubscribe("team:*:events", (err, count) => {
    if (err) {
      console.error("❌ Redis psubscribe error:", err);
      return;
    }
    console.log(`📡 Subscribed to ${count} Redis channel(s)`);
  });

  redisSub.on("pmessage", (pattern, channel, message) => {
    console.log(`📨 Redis pmessage received — channel: ${channel}`);

    try {
      const parts = channel.split(":");
      const teamId = parts[1];
      const event = JSON.parse(message);

      // Check how many sockets are in the room
      const room = io.sockets.adapter.rooms.get(`team:${teamId}`);
      console.log(
        `📡 Broadcasting to team:${teamId} — ${room?.size || 0} socket(s) in room`,
      );

      io.to(`team:${teamId}`).emit("new_event", event);
      io.to(`team:${teamId}`).emit("metrics_update", { refetch: true });
    } catch (error) {
      console.error("Error forwarding Redis message:", error);
    }
  });
}

// --- Helpers for tracking users per team ---

function addUserToTeam(teamId: string, user: ConnectedUser): void {
  if (!teamUsers.has(teamId)) {
    teamUsers.set(teamId, new Map());
  }
  teamUsers.get(teamId)!.set(user.socketId, user);
}

function removeUserFromTeam(teamId: string, socketId: string): void {
  const users = teamUsers.get(teamId);
  if (users) {
    users.delete(socketId);
    if (users.size === 0) {
      teamUsers.delete(teamId);
    }
  }
}

function getTeamUsers(teamId: string): ConnectedUser[] {
  const users = teamUsers.get(teamId);
  return users ? Array.from(users.values()) : [];
}

export { getTeamUsers };
