import { verifyToken } from '@clerk/backend';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import pino from 'pino';
import { prisma } from './prisma.js';
import { isAllowedOrigin } from './config/cors.js';
import { env } from './config/env.js';

const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

const conversationPayload = z.object({
  conversationId: z.string().uuid(),
});
const typingPayload = conversationPayload.extend({ isTyping: z.boolean() });
const receiptPayload = z.object({ messageId: z.string().uuid() });

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) callback(null, true);
        else callback(new Error('Origin not allowed'));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const claims = await verifyToken(token, {
        secretKey: env.CLERK_SECRET_KEY,
      });
      const user = await prisma.user.findUnique({
        where: { clerkId: claims.sub },
        select: { id: true },
      });
      if (!user) {
        next(new Error('Profile not found'));
        return;
      }
      socket.data.userId = user.id;
      next();
    } catch (error) {
      logger.warn({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Socket authentication failed');
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
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
        void socket.leave(`conversation:${parsed.data.conversationId}`);
      }
    });

    socket.on('conversation:typing', async (payload: unknown) => {
      const parsed = typingPayload.safeParse(payload);
      if (!parsed.success) return;
      try {
        const membership = await prisma.conversationParticipant.findFirst({
          where: { conversationId: parsed.data.conversationId, userId },
          select: { id: true },
        });
        if (!membership) return;
        socket.to(`conversation:${parsed.data.conversationId}`).emit('conversation:typing', {
          conversationId: parsed.data.conversationId,
          userId,
          isTyping: parsed.data.isTyping,
        });
      } catch (error) {
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not authorize typing event');
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
          io.to(`user:${message.senderId}`).emit('message:read', { messageId: message.id });
        }
        acknowledge?.({ success: true });
      } catch (error) {
        acknowledge?.({ success: false });
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not persist message read receipt');
      }
    });

    socket.on('disconnect', () => {
      void io.in(`user:${userId}`).fetchSockets().then((sockets) => {
        if (sockets.length === 0) io.emit('presence:offline', { userId });
      }).catch((error: unknown) => {
        logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Could not update presence');
      });
    });
  });

  return io;
}
