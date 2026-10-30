import { Router } from 'express';
import type { Request, RequestHandler, Response } from 'express';
import type { Server } from 'socket.io';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyUploadedAsset, deleteCloudinaryAssets } from '../../cloudinary.js';
import { canManageRoom, canViewRoomAddress } from './authorization.js';
import { roomCreateSchema, roomSearchSchema, roomUpdateSchema, roommateProfileSchema, roommateSearchSchema } from './validation.js';

type RoomRoutesDependencies = {
  prisma: PrismaClient;
  requireUser: RequestHandler;
  writeLimiter: RequestHandler;
  io: Server;
};

type RoomCursor = { id: string; createdAt: Date; rent?: number };
const routeParam = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

const decodeRoomCursor = (value: unknown): RoomCursor | undefined => {
  if (typeof value !== 'string' || value.length > 256) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      id?: unknown;
      createdAt?: unknown;
      rent?: unknown;
    };
    const createdAt = typeof decoded.createdAt === 'string' ? new Date(decoded.createdAt) : null;
    if (
      typeof decoded.id !== 'string' ||
      !createdAt ||
      Number.isNaN(createdAt.getTime()) ||
      (decoded.rent !== undefined && (typeof decoded.rent !== 'number' || !Number.isInteger(decoded.rent)))
    ) return undefined;
    return { id: decoded.id, createdAt, rent: decoded.rent as number | undefined };
  } catch {
    return undefined;
  }
};

const encodeRoomCursor = (room: { id: string; createdAt: Date; rent: number }) =>
  Buffer.from(JSON.stringify({
    id: room.id,
    createdAt: room.createdAt.toISOString(),
    rent: room.rent,
  })).toString('base64url');

const publicRoom = (room: {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  amenities: string[];
  rent: number;
  roomType: string;
  availableAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  media: Array<{ id: string; url: string; publicId: string; resourceType: string; position: number }>;
  owner: { id: string; username: string; name: string; avatar: string; bio: string };
  savedBy: Array<{ id: string }>;
}, viewerId: string) => ({
  id: room.id,
  ownerId: room.ownerId,
  title: room.title,
  description: room.description,
  city: room.city,
  area: room.area,
  fullAddress: canViewRoomAddress(room.ownerId, viewerId) ? room.fullAddress : '',
  amenities: room.amenities,
  rent: room.rent,
  roomType: room.roomType,
  availableAt: room.availableAt?.toISOString(),
  status: room.status,
  media: room.media.sort((a, b) => a.position - b.position).map((asset) => ({
    id: asset.id,
    url: asset.url,
    resourceType: asset.resourceType,
    position: asset.position,
  })),
  photos: room.media.filter((asset) => asset.resourceType === 'image').map((asset) => asset.url),
  owner: {
    id: room.owner.id,
    username: room.owner.username,
    name: room.owner.name,
    avatar: room.owner.avatar,
    bio: room.owner.bio,
  },
  isSaved: room.savedBy.length > 0,
  createdAt: room.createdAt.toISOString(),
  updatedAt: room.updatedAt.toISOString(),
});

const getViewer = async (req: Request, res: Response, prisma: PrismaClient) => {
  const userId = res.locals.userId as string | undefined;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
};

const roomInclude = (viewerId: string) => ({
  owner: { select: { id: true, username: true, name: true, avatar: true, bio: true } },
  media: { orderBy: { position: 'asc' as const } },
  savedBy: { where: { userId: viewerId }, select: { id: true } },
});

const cursorWhere = (cursor: RoomCursor, sort: string): Prisma.RoomWhereInput => {
  if (sort === 'rent-asc' && cursor.rent !== undefined) {
    return {
      OR: [
        { rent: { gt: cursor.rent } },
        { rent: cursor.rent, createdAt: { lt: cursor.createdAt } },
        { rent: cursor.rent, createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }
  if (sort === 'rent-desc' && cursor.rent !== undefined) {
    return {
      OR: [
        { rent: { lt: cursor.rent } },
        { rent: cursor.rent, createdAt: { lt: cursor.createdAt } },
        { rent: cursor.rent, createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
};

const authorizedMedia = async (
  prisma: PrismaClient,
  ownerId: string,
  publicIds: string[],
) => {
  if (publicIds.length === 0) return [];
  if (new Set(publicIds).size !== publicIds.length) {
    throw new Error('Duplicate media assets are not allowed.');
  }
  const reservations = await prisma.mediaUpload.findMany({
    where: {
      ownerId,
      publicId: { in: publicIds },
      attachedAt: null,
      expiresAt: { gt: new Date() },
      resourceType: { in: ['image', 'video'] },
    },
  });
  if (reservations.length !== publicIds.length) {
    throw new Error('One or more media uploads are expired, already attached, or not yours.');
  }
  return Promise.all(publicIds.map(async (publicId) => {
    const reservation = reservations.find((item) => item.publicId === publicId);
    if (!reservation) throw new Error('Media upload reservation not found.');
    const type = reservation.resourceType === 'video' ? 'video' : 'image';
    const maxBytes = type === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    const asset = await verifyUploadedAsset(publicId, type, ownerId, maxBytes);
    return { ...asset, resourceType: type };
  }));
};

const createConversationForRoom = async (
  prisma: PrismaClient,
  viewerId: string,
  ownerId: string,
  roomId: string,
  roomTitle: string,
) => {
  const pairKey = [viewerId, ownerId].sort().join(':');
  const existing = await prisma.conversation.findUnique({ where: { pairKey } });
  if (existing) return existing;
  try {
    return await prisma.conversation.create({
      data: {
        pairKey,
        activeContext: { type: 'ROOM', id: roomId, title: roomTitle },
        participants: { create: [{ userId: viewerId }, { userId: ownerId }] },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.conversation.findUnique({ where: { pairKey } });
      if (raced) return raced;
    }
    throw error;
  }
};

export function createRoomRouter({ prisma, requireUser, writeLimiter, io }: RoomRoutesDependencies) {
  const router = Router();
  router.use((req, res, next) => {
    const requiresUser = req.path === '/rooms'
      || req.path.startsWith('/rooms/')
      || req.path === '/saved/rooms'
      || req.path === '/roommate-profile/me'
      || req.path === '/roommates';
    if (requiresUser) return requireUser(req, res, next);
    next();
  });

  router.get('/rooms', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      const cursor = decodeRoomCursor(req.query.cursor);
      if (req.query.cursor !== undefined && !cursor) {
        res.status(400).json({ error: 'Invalid room cursor.' });
        return;
      }
      const takeValue = Number(req.query.take);
      const take = Number.isInteger(takeValue) ? Math.min(Math.max(takeValue, 1), 50) : 20;
      const search = roomSearchSchema.safeParse(req.query);
      if (!search.success) {
        const issue = search.error.issues[0]?.message;
        res.status(400).json({ error: issue || 'Provide valid room filters.' });
        return;
      }
      const { minRent, maxRent } = search.data;
      const amenities = search.data.amenities?.split(',').map((item) => item.trim()).filter(Boolean) || [];
      const sort = search.data.sort;
      if (!['newest', 'rent-asc', 'rent-desc'].includes(sort)) {
        res.status(400).json({ error: 'Sort must be newest, rent-asc, or rent-desc.' });
        return;
      }
      const availableDate = search.data.availableBefore;
      const where: Prisma.RoomWhereInput = {
        status: search.data.status || 'AVAILABLE',
        ...(search.data.q ? {
          OR: [
            { title: { contains: search.data.q, mode: 'insensitive' } },
            { description: { contains: search.data.q, mode: 'insensitive' } },
            { city: { contains: search.data.q, mode: 'insensitive' } },
            { area: { contains: search.data.q, mode: 'insensitive' } },
          ],
        } : {}),
        ...(search.data.city ? {
          city: { contains: search.data.city, mode: 'insensitive' },
        } : {}),
        ...(search.data.area ? {
          area: { contains: search.data.area, mode: 'insensitive' },
        } : {}),
        ...(search.data.roomType ? { roomType: search.data.roomType } : {}),
        ...(minRent !== undefined || maxRent !== undefined ? {
          rent: { ...(minRent !== undefined ? { gte: minRent } : {}), ...(maxRent !== undefined ? { lte: maxRent } : {}) },
        } : {}),
        ...(amenities.length ? { amenities: { hasEvery: amenities } } : {}),
        ...(availableDate ? { availableAt: { lte: availableDate } } : {}),
        ...(cursor ? cursorWhere(cursor, sort) : {}),
      };
      const rooms = await prisma.room.findMany({
        where,
        include: roomInclude(viewer.id),
        orderBy: sort === 'rent-asc'
          ? [{ rent: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
          : sort === 'rent-desc'
            ? [{ rent: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      });
      const hasMore = rooms.length > take;
      const items = rooms.slice(0, take);
      res.json({
        rooms: items.map((room) => publicRoom(room, viewer.id)),
        nextCursor: hasMore && items.length ? encodeRoomCursor(items[items.length - 1]) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const parsed = roomCreateSchema.safeParse(req.body);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      if (!parsed.success) {
        res.status(400).json({ error: 'Room details are invalid.' });
        return;
      }
      const assets = await authorizedMedia(prisma, viewer.id, parsed.data.media.map((media) => media.publicId));
      const room = await prisma.$transaction(async (transaction) => {
        const created = await transaction.room.create({
          data: {
            ownerId: viewer.id,
            title: parsed.data.title,
            description: parsed.data.description,
            city: parsed.data.city,
            area: parsed.data.area,
            fullAddress: parsed.data.fullAddress,
            amenities: parsed.data.amenities,
            rent: parsed.data.rent,
            roomType: parsed.data.roomType,
            availableAt: parsed.data.availableAt ? new Date(parsed.data.availableAt) : null,
            status: parsed.data.status,
            media: {
              create: assets.map((asset, position) => ({
                url: asset.url,
                publicId: asset.publicId,
                resourceType: asset.resourceType,
                position,
              })),
            },
          },
          include: roomInclude(viewer.id),
        });
        if (assets.length) {
          const attached = await transaction.mediaUpload.updateMany({
            where: {
              ownerId: viewer.id,
              publicId: { in: assets.map((asset) => asset.publicId) },
              attachedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { attachedAt: new Date() },
          });
          if (attached.count !== assets.length) throw new Error('Media was already attached to another listing.');
        }
        return created;
      });
      res.status(201).json({ success: true, room: publicRoom(room, viewer.id) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: roomInclude(viewer.id),
      });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      res.json({ room: publicRoom(room, viewer.id) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      const parsed = roomUpdateSchema.safeParse(req.body);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      if (!parsed.success || Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: 'Provide valid room fields to update.' });
        return;
      }
      const existing = await prisma.room.findUnique({ where: { id: roomId }, include: { media: true } });
      if (!existing) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (!canManageRoom(existing.ownerId, viewer.id)) {
        res.status(403).json({ error: 'You can only update your own rooms.' });
        return;
      }
      const newMedia = parsed.data.media === undefined
        ? undefined
        : await authorizedMedia(prisma, viewer.id, parsed.data.media.map((media) => media.publicId));
      const room = await prisma.$transaction(async (transaction) => {
        if (newMedia) await transaction.roomMedia.deleteMany({ where: { roomId } });
        const updated = await transaction.room.update({
          where: { id: roomId },
          data: {
            ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
            ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
            ...(parsed.data.city !== undefined ? { city: parsed.data.city } : {}),
            ...(parsed.data.area !== undefined ? { area: parsed.data.area } : {}),
            ...(parsed.data.fullAddress !== undefined ? { fullAddress: parsed.data.fullAddress } : {}),
            ...(parsed.data.amenities !== undefined ? { amenities: parsed.data.amenities } : {}),
            ...(parsed.data.rent !== undefined ? { rent: parsed.data.rent } : {}),
            ...(parsed.data.roomType !== undefined ? { roomType: parsed.data.roomType } : {}),
            ...(parsed.data.availableAt !== undefined ? { availableAt: parsed.data.availableAt ? new Date(parsed.data.availableAt) : null } : {}),
            ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
            ...(newMedia ? {
              media: {
                create: newMedia.map((asset, position) => ({
                  url: asset.url,
                  publicId: asset.publicId,
                  resourceType: asset.resourceType,
                  position,
                })),
              },
            } : {}),
          },
          include: roomInclude(viewer.id),
        });
        if (newMedia?.length) {
          const attached = await transaction.mediaUpload.updateMany({
            where: {
              ownerId: viewer.id,
              publicId: { in: newMedia.map((asset) => asset.publicId) },
              attachedAt: null,
              expiresAt: { gt: new Date() },
            },
            data: { attachedAt: new Date() },
          });
          if (attached.count !== newMedia.length) throw new Error('Media was already attached to another listing.');
        }
        if (newMedia) {
          await transaction.mediaUpload.deleteMany({ where: { publicId: { in: existing.media.map((asset) => asset.publicId) } } });
        }
        return updated;
      });
      if (newMedia) {
        await deleteCloudinaryAssets(existing.media.map((asset) => ({
          publicId: asset.publicId,
          resourceType: asset.resourceType === 'video' ? 'video' as const : 'image' as const,
        })));
      }
      res.json({ success: true, room: publicRoom(room, viewer.id) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rooms/:roomId', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { media: true } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (!canManageRoom(room.ownerId, viewer.id)) {
        res.status(403).json({ error: 'You can only delete your own rooms.' });
        return;
      }
      await deleteCloudinaryAssets(room.media.map((asset) => ({
        publicId: asset.publicId,
        resourceType: asset.resourceType === 'video' ? 'video' as const : 'image' as const,
      })));
      await prisma.$transaction(async (transaction) => {
        await transaction.room.delete({ where: { id: roomId } });
        await transaction.mediaUpload.deleteMany({ where: { publicId: { in: room.media.map((asset) => asset.publicId) } } });
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId/media/order', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      const body = z.object({ mediaIds: z.array(z.string().uuid()).min(1).max(10) }).strict().safeParse(req.body);
      if (!viewer || !roomId || !body.success) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Provide valid media ordering.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { media: { select: { id: true } } } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (!canManageRoom(room.ownerId, viewer.id)) {
        res.status(403).json({ error: 'You can only reorder your own room photos.' });
        return;
      }
      const existingIds = new Set(room.media.map((item) => item.id));
      if (body.data.mediaIds.length !== existingIds.size || body.data.mediaIds.some((id) => !existingIds.has(id)) || new Set(body.data.mediaIds).size !== body.data.mediaIds.length) {
        res.status(400).json({ error: 'Provide every room media id exactly once.' });
        return;
      }
      await prisma.$transaction(body.data.mediaIds.map((id, position) =>
        prisma.roomMedia.update({ where: { id }, data: { position } }),
      ));
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.put('/rooms/:roomId/save', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      await prisma.savedRoom.createMany({ data: [{ userId: viewer.id, roomId, postId: null }], skipDuplicates: true });
      res.json({ success: true, isSaved: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/rooms/:roomId/save', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      await prisma.savedRoom.deleteMany({ where: { userId: viewer.id, roomId } });
      res.json({ success: true, isSaved: false });
    } catch (error) {
      next(error);
    }
  });

  router.get('/saved/rooms', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      const saved = await prisma.savedRoom.findMany({
        where: { userId: viewer.id, roomId: { not: null } },
        include: { room: { include: roomInclude(viewer.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      res.json({ rooms: saved.flatMap((item) => item.room ? [publicRoom(item.room, viewer.id)] : []) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/contact', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true, title: true } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (room.ownerId === viewer.id) {
        res.status(400).json({ error: 'You cannot contact yourself about your own room.' });
        return;
      }
      const conversation = await createConversationForRoom(prisma, viewer.id, room.ownerId, roomId, room.title);
      io.to(`user:${viewer.id}`).emit('conversation:changed', { conversationId: conversation.id });
      io.to(`user:${room.ownerId}`).emit('conversation:changed', { conversationId: conversation.id });
      res.json({ success: true, conversationId: conversation.id, context: { type: 'ROOM', id: roomId, title: room.title } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/inquiries', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      const body = z.object({
        message: z.string().trim().min(1).max(2200),
        idempotencyKey: z.string().uuid(),
      }).strict().safeParse(req.body);
      if (!viewer || !roomId || !body.success) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Provide a message and request id.' : 'Profile not found.' });
        return;
      }
      const existing = await prisma.roomInquiry.findUnique({ where: { idempotencyKey: body.data.idempotencyKey } });
      if (existing) {
        if (existing.requesterId !== viewer.id || existing.roomId !== roomId) {
          res.status(409).json({ error: 'This request id has already been used.' });
          return;
        }
        res.json({ success: true, inquiry: existing });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (room.ownerId === viewer.id) {
        res.status(400).json({ error: 'You cannot inquire about your own room.' });
        return;
      }
      const inquiry = await prisma.$transaction(async (transaction) => {
        const created = await transaction.roomInquiry.create({
          data: {
            roomId,
            requesterId: viewer.id,
            ownerId: room.ownerId,
            message: body.data.message,
            idempotencyKey: body.data.idempotencyKey,
          },
        });
        await transaction.notification.create({
          data: {
            userId: room.ownerId,
            type: 'ROOM_INQUIRY',
            title: 'New room inquiry',
            message: `${viewer.name} sent an inquiry about your room.`,
            metadata: { roomId, inquiryId: created.id },
            dedupeKey: `room-inquiry:${created.id}`,
          },
        });
        return created;
      });
      io.to(`user:${room.ownerId}`).emit('notification:new');
      io.to(`user:${room.ownerId}`).emit('room:inquiry', { inquiryId: inquiry.id, roomId });
      res.status(201).json({ success: true, inquiry });
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId/inquiries', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      if (!viewer || !roomId) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid room id.' : 'Profile not found.' });
        return;
      }
      const room = await prisma.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
      if (!room) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      if (!canManageRoom(room.ownerId, viewer.id)) {
        res.status(403).json({ error: 'Only the room owner can view inquiries.' });
        return;
      }
      const inquiries = await prisma.roomInquiry.findMany({
        where: { roomId },
        include: { requester: { select: { id: true, username: true, name: true, avatar: true, city: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      res.json({ inquiries });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/rooms/:roomId/inquiries/:inquiryId', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const roomId = routeParam(req.params.roomId);
      const inquiryId = routeParam(req.params.inquiryId);
      const body = z.object({ status: z.enum(['ACCEPTED', 'DECLINED']) }).strict().safeParse(req.body);
      if (!viewer || !roomId || !inquiryId || !body.success) {
        res.status(viewer ? 400 : 404).json({ error: viewer ? 'Invalid inquiry update.' : 'Profile not found.' });
        return;
      }
      const inquiry = await prisma.roomInquiry.findUnique({ where: { id: inquiryId } });
      if (!inquiry || inquiry.roomId !== roomId) {
        res.status(404).json({ error: 'Inquiry not found.' });
        return;
      }
      if (inquiry.ownerId !== viewer.id) {
        res.status(403).json({ error: 'Only the room owner can update this inquiry.' });
        return;
      }
      const updated = await prisma.roomInquiry.update({ where: { id: inquiryId }, data: { status: body.data.status } });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      next(error);
    }
  });

  router.put('/roommate-profile/me', writeLimiter, async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      const parsed = roommateProfileSchema.safeParse(req.body);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      if (!parsed.success) {
        res.status(400).json({ error: 'Provide a city, bio, valid budget and move-in details.' });
        return;
      }
      const profile = await prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: viewer.id },
          data: { city: parsed.data.city, bio: parsed.data.bio },
        });
        return transaction.roommateProfile.upsert({
          where: { userId: viewer.id },
          create: {
            userId: viewer.id,
            budgetMin: parsed.data.budgetMin,
            budgetMax: parsed.data.budgetMax,
            moveInAt: parsed.data.moveInAt ? new Date(parsed.data.moveInAt) : null,
            preferences: parsed.data.preferences,
          },
          update: {
            budgetMin: parsed.data.budgetMin,
            budgetMax: parsed.data.budgetMax,
            moveInAt: parsed.data.moveInAt ? new Date(parsed.data.moveInAt) : null,
            preferences: parsed.data.preferences,
          },
        });
      });
      res.json({ success: true, profile: { ...profile, city: parsed.data.city, bio: parsed.data.bio } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/roommate-profile/me', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      const profile = await prisma.roommateProfile.findUnique({ where: { userId: viewer.id } });
      res.json({ profile: profile ? { ...profile, city: viewer.city, bio: viewer.bio } : null });
    } catch (error) {
      next(error);
    }
  });

  router.get('/roommates', async (req, res, next) => {
    try {
      const viewer = await getViewer(req, res, prisma);
      if (!viewer) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      const cursor = decodeRoomCursor(req.query.cursor);
      if (req.query.cursor !== undefined && !cursor) {
        res.status(400).json({ error: 'Invalid roommate cursor.' });
        return;
      }
      const search = roommateSearchSchema.safeParse(req.query);
      if (!search.success) {
        res.status(400).json({ error: 'Provide valid roommate filters.' });
        return;
      }
      const { minBudget, maxBudget, lifestyle, moveInBefore: moveInDate } = search.data;
      const profiles = await prisma.roommateProfile.findMany({
        where: {
          userId: { not: viewer.id },
          user: {
            city: search.data.city
              ? { contains: search.data.city, mode: 'insensitive' }
              : { not: '' },
            bio: { not: '' },
          },
          ...(moveInDate ? { moveInAt: { lte: moveInDate } } : {}),
          ...(lifestyle ? { preferences: { path: ['lifestyle'], array_contains: [lifestyle] } } : {}),
          ...(minBudget !== undefined || maxBudget !== undefined || cursor ? {
            AND: [
              ...(minBudget !== undefined ? [{ OR: [{ budgetMax: null }, { budgetMax: { gte: minBudget } }] }] : []),
              ...(maxBudget !== undefined ? [{ OR: [{ budgetMin: null }, { budgetMin: { lte: maxBudget } }] }] : []),
              ...(cursor ? [{
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }] : []),
            ],
          } : {}),
        },
        include: { user: { select: { id: true, username: true, name: true, avatar: true, bio: true, city: true, locationArea: true, occupation: true, instituteOrCompany: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 31,
      });
      const items = profiles.slice(0, 30);
      const followedUsers = items.length
        ? await prisma.follow.findMany({
            where: {
              followerId: viewer.id,
              followedId: { in: items.map((profile) => profile.userId) },
            },
            select: { followedId: true },
          })
        : [];
      const followedUserIds = new Set(followedUsers.map((follow) => follow.followedId));
      res.json({
        profiles: items.map((profile) => ({
          id: profile.id,
          user: profile.user,
          budgetMin: profile.budgetMin,
          budgetMax: profile.budgetMax,
          moveInAt: profile.moveInAt?.toISOString(),
          preferences: profile.preferences,
          isFollowing: followedUserIds.has(profile.userId),
        })),
        nextCursor: profiles.length > 30 && items.length
          ? encodeRoomCursor({ id: items[items.length - 1].id, createdAt: items[items.length - 1].createdAt, rent: 0 })
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
