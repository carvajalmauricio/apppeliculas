import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { z } from "zod";
import { prisma } from "./src/lib/prisma";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: process.env.NEXT_PUBLIC_APP_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  type PlaylistItem = {
    id: string;
    url: string;
    title: string;
    addedBy: string;
  };

  type RoomState = {
    hostId: string;
    users: Set<string>;
    bufferState: Map<string, boolean>;
    names: Map<string, string>;
    playlist: PlaylistItem[];
    currentPlaylistIndex: number;
  };

  const roomIdSchema = z.string().min(1).max(100);
  const usernameSchema = z.string().trim().min(1).max(50);
  const timeSchema = z.number().finite().nonnegative();
  const messageSchema = z.string().trim().min(1).max(500);
  const urlSchema = z.string().url().max(2000);
  const emojiSchema = z.string().min(1).max(10);
  const coordSchema = z.number().min(0).max(100);

  const rooms = new Map<string, RoomState>();
  const lastSeen = new Map<string, number>();
  const STALE_MS = 45000;

  const rateLimits = new Map<string, { [key: string]: { count: number; resetAt: number } }>();
  const RATE_WINDOWS: Record<string, { limit: number; windowMs: number }> = {
    play: { limit: 5, windowMs: 5000 },
    pause: { limit: 5, windowMs: 5000 },
    seek: { limit: 8, windowMs: 5000 },
    "time-update": { limit: 20, windowMs: 10000 },
    "send-message": { limit: 10, windowMs: 5000 },
    "force-ready": { limit: 3, windowMs: 10000 },
    "send-reaction": { limit: 10, windowMs: 5000 },
    "playlist-add": { limit: 10, windowMs: 30000 },
  };

  const allow = (socketId: string, event: string) => {
    const cfg = RATE_WINDOWS[event];
    if (!cfg) return true;

    const now = Date.now();
    const perSocket = rateLimits.get(socketId) || {};
    const entry = perSocket[event] || { count: 0, resetAt: now + cfg.windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + cfg.windowMs;
    }

    entry.count += 1;
    perSocket[event] = entry;
    rateLimits.set(socketId, perSocket);

    if (entry.count > cfg.limit) {
      console.warn(`Rate limit exceeded for ${event} by ${socketId}`);
      return false;
    }
    return true;
  };

  const emitPersistedState = async (roomId: string, target: string | null = null) => {
    try {
      const state = await prisma.room.findUnique({
        where: { id: roomId },
        select: { isPlaying: true, timestamp: true },
      });

      if (!state) return;
      const payload = { time: state.timestamp, isPlaying: state.isPlaying };
      if (target) {
        io.to(target).emit("persisted-state", payload);
      } else {
        io.to(roomId).emit("persisted-state", payload);
      }
    } catch (err) {
      console.error("Failed to emit persisted state", err);
    }
  };

  const persistState = async (roomId: string, time: number, isPlaying: boolean) => {
    try {
      await prisma.room.update({
        where: { id: roomId },
        data: { timestamp: time, isPlaying },
      });
    } catch (err) {
      console.error("Failed to persist room state", err);
    }
  };

  const getOrCreateRoom = (roomId: string, socketId: string): RoomState => {
    const room = rooms.get(roomId);
    if (!room) {
      const created: RoomState = {
        hostId: socketId,
        users: new Set(),
        bufferState: new Map(),
        names: new Map(),
        playlist: [],
        currentPlaylistIndex: 0,
      };
      rooms.set(roomId, created);
      return created;
    }
    return room;
  };

  const isHost = (room: RoomState, socketId: string) => room.hostId === socketId;

  const computeAllBuffered = (room: RoomState) => {
    return Array.from(room.users).every((uid) => room.bufferState.get(uid));
  };

  io.on("connection", (socket) => {
    console.log("Client connected", socket.id);
    lastSeen.set(socket.id, Date.now());

    socket.on("join-room", (payload) => {
      const parsedRoom = roomIdSchema.safeParse(payload?.roomId ?? payload);
      const parsedName = usernameSchema.safeParse(payload?.username || "Invitado");
      if (!parsedRoom.success || !parsedName.success) {
        console.warn(`Invalid room join payload from ${socket.id}`);
        return;
      }

      // Check if room exists BEFORE creating it to know if this is the first user
      const existingRoom = rooms.get(parsedRoom.data);
      const isNewRoom = !existingRoom;
      
      const room = getOrCreateRoom(parsedRoom.data, socket.id);

      socket.join(parsedRoom.data);
      room.users.add(socket.id);
      room.bufferState.set(socket.id, true);
      room.names.set(socket.id, parsedName.data);

      // Determine host status
      if (isNewRoom) {
        // First user in a new room is always the host
        console.log(`New room ${parsedRoom.data} created, ${socket.id} is host`);
        socket.emit("is-host", true);
      } else {
        // Recover host if previous host socket is gone
        const hostStillPresent = room.users.has(room.hostId);
        if (!hostStillPresent) {
          room.hostId = socket.id;
          console.log(`Host recovered to ${socket.id} in room ${parsedRoom.data}`);
          socket.emit("is-host", true);
          io.to(parsedRoom.data).emit("host-changed", { hostId: socket.id });
        } else if (isHost(room, socket.id)) {
          console.log(`${socket.id} rejoining as host in room ${parsedRoom.data}`);
          socket.emit("is-host", true);
        } else {
          socket.emit("is-host", false);
          io.to(room.hostId).emit("sync-request", { requesterId: socket.id });
        }
      }

      const usersInRoom = Array.from(room.users).filter((id) => id !== socket.id);
      socket.emit("all-users", usersInRoom);

      const allBuffered = computeAllBuffered(room);
      socket.emit("global-buffer-state", { isReady: allBuffered });

      io.to(parsedRoom.data).emit("presence", {
        users: Array.from(room.users).map((id) => ({
          id,
          name: room.names.get(id) || "Invitado",
          isHost: room.hostId === id,
        })),
      });

      void emitPersistedState(parsedRoom.data, socket.id);
    });

    socket.on("join-voice-chat", ({ roomId }) => {
      const parsed = roomIdSchema.safeParse(roomId);
      if (!parsed.success) return;

      const room = getOrCreateRoom(parsed.data, socket.id);
      socket.join(parsed.data);

      if (!room.users.has(socket.id)) {
        room.users.add(socket.id);
        room.bufferState.set(socket.id, true);
        room.names.set(socket.id, room.names.get(socket.id) || "Invitado");
      }

      const otherUsers = Array.from(room.users).filter((id) => id !== socket.id);
      socket.emit("voice-all-users", otherUsers);
      socket.to(parsed.data).emit("voice-user-joined", { userID: socket.id });
    });

    socket.on("voice-sending-signal", ({ userToSignal, signal, callerID }) => {
      console.log(`Voice: Sending signal from ${callerID} to ${userToSignal}`);
      io.to(userToSignal).emit("voice-user-joined-signal", { signal, callerID });
    });

    socket.on("voice-returning-signal", ({ signal, callerID }) => {
      console.log(`Voice: Returning signal from ${socket.id} to ${callerID}`);
      io.to(callerID).emit("voice-receiving-returned-signal", { signal, id: socket.id });
    });

    socket.on("send-message", ({ roomId, message }) => {
      if (!allow(socket.id, "send-message")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedMessage = messageSchema.safeParse(message);
      if (!parsedRoom.success || !parsedMessage.success) return;
      const senderName = rooms.get(parsedRoom.data)?.names.get(socket.id) || "";
      io.to(parsedRoom.data).emit("receive-message", { message: parsedMessage.data, senderId: socket.id, senderName });
    });

    // ============ REACTIONS ============
    socket.on("send-reaction", ({ roomId, emoji, username, x, y }) => {
      if (!allow(socket.id, "send-reaction")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedEmoji = emojiSchema.safeParse(emoji);
      const parsedUsername = usernameSchema.safeParse(username);
      const parsedX = coordSchema.safeParse(x);
      const parsedY = coordSchema.safeParse(y);
      
      if (!parsedRoom.success || !parsedEmoji.success || !parsedUsername.success || 
          !parsedX.success || !parsedY.success) return;
      
      const reactionId = `${socket.id}-${Date.now()}`;
      io.to(parsedRoom.data).emit("reaction", {
        id: reactionId,
        emoji: parsedEmoji.data,
        username: parsedUsername.data,
        x: parsedX.data,
        y: parsedY.data,
      });
    });

    // ============ PLAYLIST ============
    socket.on("playlist-get", ({ roomId }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success) return;
      
      const room = rooms.get(parsedRoom.data);
      if (!room) return;
      
      socket.emit("playlist-update", {
        playlist: room.playlist,
        currentIndex: room.currentPlaylistIndex,
      });
    });

    socket.on("playlist-add", ({ roomId, url, title }) => {
      if (!allow(socket.id, "playlist-add")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedUrl = urlSchema.safeParse(url);
      const parsedTitle = messageSchema.safeParse(title);
      
      if (!parsedRoom.success || !parsedUrl.success || !parsedTitle.success) return;
      
      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;
      
      const newItem: PlaylistItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url: parsedUrl.data,
        title: parsedTitle.data,
        addedBy: room.names.get(socket.id) || "Host",
      };
      
      room.playlist.push(newItem);
      
      io.to(parsedRoom.data).emit("playlist-update", {
        playlist: room.playlist,
        currentIndex: room.currentPlaylistIndex,
      });
    });

    socket.on("playlist-remove", ({ roomId, itemId }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success) return;
      
      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;
      
      const index = room.playlist.findIndex(item => item.id === itemId);
      if (index === -1) return;
      
      room.playlist.splice(index, 1);
      
      // Adjust current index if needed
      if (index < room.currentPlaylistIndex) {
        room.currentPlaylistIndex--;
      } else if (index === room.currentPlaylistIndex && room.currentPlaylistIndex >= room.playlist.length) {
        room.currentPlaylistIndex = Math.max(0, room.playlist.length - 1);
      }
      
      io.to(parsedRoom.data).emit("playlist-update", {
        playlist: room.playlist,
        currentIndex: room.currentPlaylistIndex,
      });
    });

    socket.on("playlist-play", ({ roomId, index }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedIndex = z.number().int().nonnegative().safeParse(index);
      
      if (!parsedRoom.success || !parsedIndex.success) return;
      
      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;
      if (parsedIndex.data >= room.playlist.length) return;
      
      room.currentPlaylistIndex = parsedIndex.data;
      const newVideo = room.playlist[parsedIndex.data];
      
      io.to(parsedRoom.data).emit("playlist-update", {
        playlist: room.playlist,
        currentIndex: room.currentPlaylistIndex,
      });
      
      io.to(parsedRoom.data).emit("playlist-next", {
        index: parsedIndex.data,
        url: newVideo.url,
      });
    });

    socket.on("heartbeat", ({ roomId }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success) return;
      lastSeen.set(socket.id, Date.now());
    });

    socket.on("buffer-status", ({ roomId, isBuffered }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success || typeof isBuffered !== "boolean") return;

      const room = rooms.get(parsedRoom.data);
      if (!room) return;

      if (!room.users.has(socket.id)) return;

      room.bufferState.set(socket.id, isBuffered);
      const allBuffered = computeAllBuffered(room);
      io.to(parsedRoom.data).emit("global-buffer-state", { isReady: allBuffered });
    });

    socket.on("transfer-host", ({ roomId, targetId }) => {
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success) return;
      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;
      if (!room.users.has(targetId)) return;

      room.hostId = targetId;
      io.to(targetId).emit("is-host", true);
      io.to(parsedRoom.data).emit("host-changed", { hostId: targetId });
      io.to(parsedRoom.data).emit("presence", {
        users: Array.from(room.users).map((id) => ({
          id,
          name: room.names.get(id) || "Invitado",
          isHost: room.hostId === id,
        })),
      });
    });

    socket.on("force-ready", ({ roomId }) => {
      if (!allow(socket.id, "force-ready")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      if (!parsedRoom.success) return;
      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;

      room.users.forEach((uid) => room.bufferState.set(uid, true));
      io.to(parsedRoom.data).emit("global-buffer-state", { isReady: true });
    });

    socket.on("play", ({ roomId, time }) => {
      if (!allow(socket.id, "play")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedTime = timeSchema.safeParse(time);
      if (!parsedRoom.success || !parsedTime.success) return;

      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;

      socket.to(parsedRoom.data).emit("play", { time: parsedTime.data });
      void persistState(parsedRoom.data, parsedTime.data, true);
    });

    socket.on("pause", ({ roomId, time }) => {
      if (!allow(socket.id, "pause")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedTime = timeSchema.safeParse(time);
      if (!parsedRoom.success || !parsedTime.success) return;

      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;

      socket.to(parsedRoom.data).emit("pause", { time: parsedTime.data });
      void persistState(parsedRoom.data, parsedTime.data, false);
    });

    socket.on("seek", ({ roomId, time }) => {
      if (!allow(socket.id, "seek")) return;
      const parsedRoom = roomIdSchema.safeParse(roomId);
      const parsedTime = timeSchema.safeParse(time);
      if (!parsedRoom.success || !parsedTime.success) return;

      const room = rooms.get(parsedRoom.data);
      if (!room || !isHost(room, socket.id)) return;

      socket.to(parsedRoom.data).emit("seek", { time: parsedTime.data });
      void persistState(parsedRoom.data, parsedTime.data, false);
    });
    
    // Host sends sync data to a specific requester
    socket.on("sync-response", ({ requesterId, time, isPlaying }) => {
      const parsedTime = timeSchema.safeParse(time);
      if (!parsedTime.success || typeof isPlaying !== "boolean") return;
      io.to(requesterId).emit("sync-response", { time: parsedTime.data, isPlaying });
    });

    // Periodic sync from host to ensure everyone is aligned
     socket.on("time-update", ({ roomId, time, isPlaying }) => {
       if (!allow(socket.id, "time-update")) return;
       const parsedRoom = roomIdSchema.safeParse(roomId);
       const parsedTime = timeSchema.safeParse(time);
       if (!parsedRoom.success || !parsedTime.success || typeof isPlaying !== "boolean") return;

       const room = rooms.get(parsedRoom.data);
       if (!room || !isHost(room, socket.id)) return;

       socket.to(parsedRoom.data).emit("sync-check", { time: parsedTime.data, isPlaying, sentAt: Date.now() });
       void persistState(parsedRoom.data, parsedTime.data, isPlaying);
     });

    socket.on("disconnect", () => {
      console.log("Client disconnected", socket.id);
      lastSeen.delete(socket.id);
      
      // Handle host disconnection
      for (const [roomId, room] of rooms.entries()) {
        if (!room.users.has(socket.id)) continue;

        room.users.delete(socket.id);
        room.bufferState.delete(socket.id);
        room.names.delete(socket.id);

        if (room.users.size > 0) {
          const allBuffered = computeAllBuffered(room);
          io.to(roomId).emit("global-buffer-state", { isReady: allBuffered });
        }

        if (room.hostId === socket.id) {
          const nextHost = room.users.values().next().value as string | undefined;
          if (nextHost) {
            room.hostId = nextHost;
            io.to(room.hostId).emit("is-host", true);
            io.to(roomId).emit("host-changed", { hostId: room.hostId });
            void emitPersistedState(roomId);
          } else {
            rooms.delete(roomId);
          }
        }

        io.to(roomId).emit("presence", {
          users: Array.from(room.users).map((id) => ({
            id,
            name: room.names.get(id) || "Invitado",
            isHost: room.hostId === id,
          })),
        });

        break;
      }
    });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [socketId, ts] of lastSeen.entries()) {
      if (now - ts > STALE_MS) {
        const stale = io.sockets.sockets.get(socketId);
        if (stale) {
          stale.disconnect(true);
        } else {
          lastSeen.delete(socketId);
        }
      }
    }
  }, 15000);

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
