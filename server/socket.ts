import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { decodeJwt } from 'jose';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from './prisma.js';
import { isAllowedOrigin } from './config/cors.js';
import { env } from './config/env.js';
import { syncLegacyMessageStatus } from './legacy-sync.js';
import { verifyAccessToken } from './auth.js';

const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

const conversationPayload = z.object({
  conversationId: z.string().uuid(),
});
const typingPayload = conversationPayload.extend({ isTyping: z.boolean() });
const receiptPayload = z.object({ messageId: z.string().uuid() });
const typingTimeoutMs = 3_000;

export function createSocketServer(httpServer: HttpServer): Server {
  const typingSocketsByRoom = new Map<string, Set<string>>();

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) callback(null, true);
        else callback(new Error('Origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const user = await verifyAccessToken(token);
      socket.data.userId = user.id;
      const expiry = decodeJwt(token).exp;
      if (!expiry || expiry <= Math.floor(Date.now() / 1000)) {
        next(new Error('Authentication token expired'));
        return;
      }
      socket.data.accessTokenExpiresAt = expiry * 1000;
      next();
    } catch (error) {
      logger.warn({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Socket authentication failed');
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const joinedConversations = new Set<string>();
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const expiresIn = (socket.data.accessTokenExpiresAt as number) - Date.now();
    const expiryTimer = setTimeout(() => {
      socket.emit('auth:expired');
      socket.disconnect(true);
    }, Math.max(0, expiresIn));
    socket.join(`user:${userId}`);
    io.emit('presence:online', { userId });
    void io.fetchSockets().then((sockets) => {
      socket.emit('presence:snapshot', {
        userIds: [...new Set(sockets.map((connected) => connected.data.userId as string))],
      });
    }).catch((error: unknown) => {
      logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not load presence snapshot');
    });

    socket.on('conversation:join', async (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => {
      const parsed = conversationPayload.safeParse(payload);
      if (!parsed.success) {
        acknowledge?.({ success: false });
        return;
      }
      try {
        const membership = await prisma.conversationParticipant.findFirst({
          where: { conversationId: parsed.data.conversationId, userId },
          select: { id: true },
        });
        if (membership) {
          socket.join(`conversation:${parsed.data.conversationId}`);
          joinedConversations.add(parsed.data.conversationId);
          const otherParticipant = await prisma.conversationParticipant.findFirst({
            where: { conversationId: parsed.data.conversationId, userId: { not: userId } },
            select: { userId: true },
          });
          if (otherParticipant) {
            const otherSockets = await io.in(`user:${otherParticipant.userId}`).fetchSockets();
            socket.emit('presence:snapshot', {
              userIds: otherSockets.length ? [otherParticipant.userId] : [],
            });
          }
          const pending = await prisma.message.findMany({
            where: {
              conversationId: parsed.data.conversationId,
              receiverId: userId,
              deliveredAt: null,
            },
            select: { id: true, senderId: true },
          });
          if (pending.length) {
            const deliveredAt = new Date();
            await prisma.message.updateMany({
              where: { id: { in: pending.map((message) => message.id) }, receiverId: userId, deliveredAt: null },
              data: { deliveredAt },
            });
            for (const message of pending) {
              io.to(`user:${message.senderId}`).emit('message:delivered', {
                messageId: message.id,
                deliveredAt: deliveredAt.toISOString(),
              });
            }
          }
        }
        acknowledge?.({ success: Boolean(membership) });
      } catch (error) {
        acknowledge?.({ success: false });
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not authorize conversation room');
      }
    });

    socket.on('conversation:leave', (payload: unknown) => {
      const parsed = conversationPayload.safeParse(payload);
      if (parsed.success) {
        const conversationId = parsed.data.conversationId;
        const timer = typingTimers.get(conversationId);
        if (timer) clearTimeout(timer);
        typingTimers.delete(conversationId);
        const typingRoom = `conversation:${conversationId}`;
        const typingSockets = typingSocketsByRoom.get(typingRoom);
        typingSockets?.delete(socket.id);
        if (typingSockets && typingSockets.size === 0) {
          typingSocketsByRoom.delete(typingRoom);
          socket.to(typingRoom).emit('conversation:typing', {
            conversationId,
            userId,
            isTyping: false,
          });
        }
        joinedConversations.delete(conversationId);
        void socket.leave(`conversation:${parsed.data.conversationId}`);
      }
    });

    socket.on('conversation:typing', async (payload: unknown) => {
      const parsed = typingPayload.safeParse(payload);
      if (!parsed.success || !joinedConversations.has(parsed.data.conversationId)) return;
      const { conversationId, isTyping } = parsed.data;
      const typingRoom = `conversation:${conversationId}`;
      let typingSockets = typingSocketsByRoom.get(typingRoom);

      if (!isTyping) {
        const timer = typingTimers.get(conversationId);
        if (timer) clearTimeout(timer);
        typingTimers.delete(conversationId);
        typingSockets?.delete(socket.id);
        if (typingSockets && typingSockets.size === 0) {
          typingSocketsByRoom.delete(typingRoom);
          socket.to(typingRoom).emit('conversation:typing', { conversationId, userId, isTyping: false });
        }
        return;
      }

      if (!typingSockets) {
        typingSockets = new Set();
        typingSocketsByRoom.set(typingRoom, typingSockets);
      }
      const wasTyping = typingSockets.has(socket.id);
      typingSockets.add(socket.id);
      const existingTimer = typingTimers.get(conversationId);
      if (existingTimer) clearTimeout(existingTimer);
      const timer = setTimeout(() => {
        typingTimers.delete(conversationId);
        const activeSockets = typingSocketsByRoom.get(typingRoom);
        activeSockets?.delete(socket.id);
        if (activeSockets && activeSockets.size === 0) {
          typingSocketsByRoom.delete(typingRoom);
          socket.to(typingRoom).emit('conversation:typing', { conversationId, userId, isTyping: false });
        }
      }, typingTimeoutMs);
      typingTimers.set(conversationId, timer);
      if (!wasTyping) {
        socket.to(typingRoom).emit('conversation:typing', { conversationId, userId, isTyping: true });
      }
    });

    socket.on('message:delivered', async (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => {
      const parsed = receiptPayload.safeParse(payload);
      if (!parsed.success) {
        acknowledge?.({ success: false });
        return;
      }
      try {
        const message = await prisma.message.findFirst({
          where: {
            id: parsed.data.messageId,
            receiverId: userId,
            conversation: { participants: { some: { userId } } },
          },
          select: { id: true, senderId: true },
        });
        if (!message) {
          acknowledge?.({ success: false });
          return;
        }
        const deliveredAt = new Date();
        const result = await prisma.message.updateMany({
          where: { id: message.id, receiverId: userId, deliveredAt: null },
          data: { deliveredAt },
        });
        if (result.count > 0) {
          await syncLegacyMessageStatus(prisma, { id: message.id, isRead: false });
          io.to(`user:${message.senderId}`).emit('message:delivered', {
            messageId: message.id,
            deliveredAt: deliveredAt.toISOString(),
          });
        }
        acknowledge?.({ success: true });
      } catch (error) {
        acknowledge?.({ success: false });
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not persist message delivery receipt');
      }
    });

    socket.on('message:read', async (payload: unknown, acknowledge?: (result: { success: boolean }) => void) => {
      const parsed = receiptPayload.safeParse(payload);
      if (!parsed.success) {
        acknowledge?.({ success: false });
        return;
      }
      try {
        const message = await prisma.message.findFirst({
          where: {
            id: parsed.data.messageId,
            receiverId: userId,
            conversation: { participants: { some: { userId } } },
          },
          select: { id: true, senderId: true },
        });
        if (!message) {
          acknowledge?.({ success: false });
          return;
        }
        const result = await prisma.message.updateMany({
          where: { id: message.id, receiverId: userId, isRead: false },
          data: { isRead: true },
        });
        if (result.count > 0) {
          await syncLegacyMessageStatus(prisma, { id: message.id, isRead: true });
          io.to(`user:${message.senderId}`).emit('message:read', { messageId: message.id });
        }
        acknowledge?.({ success: true });
      } catch (error) {
        acknowledge?.({ success: false });
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not persist message read receipt');
      }
    });

    socket.on('disconnect', () => {
      clearTimeout(expiryTimer);
      for (const [conversationId, timer] of typingTimers) {
        clearTimeout(timer);
        const typingRoom = `conversation:${conversationId}`;
        const typingSockets = typingSocketsByRoom.get(typingRoom);
        typingSockets?.delete(socket.id);
        if (typingSockets && typingSockets.size === 0) {
          typingSocketsByRoom.delete(typingRoom);
          socket.to(typingRoom).emit('conversation:typing', {
            conversationId,
            userId,
            isTyping: false,
          });
        }
      }
      typingTimers.clear();
      void io.in(`user:${userId}`).fetchSockets().then((sockets) => {
        if (sockets.length === 0) io.emit('presence:offline', { userId });
      }).catch((error: unknown) => {
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not update presence');
      });
    });
  });

  return io;
}
