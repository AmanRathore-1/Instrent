import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import type { Request, RequestHandler, Response } from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { Prisma, type User as DbUser } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma.js';
import { createSocketServer } from './socket.js';
import type { Server as SocketServer } from 'socket.io';
import { isAllowedOrigin } from './config/cors.js';
import { env } from './config/env.js';
import {
  CloudinaryNotConfiguredError,
  CloudinaryUploadError,
  createSignedUpload,
  createVideoThumbnailUrl,
  deleteCloudinaryAssets,
  verifyUploadedAsset,
} from './cloudinary.js';
import { persistThenPublish } from './modules/social/service.js';
import { createRoomRouter } from './modules/rooms/routes.js';
import { shouldSyncLegacyUserProfile, syncLegacyMessage, syncLegacyMessageStatus, syncLegacyNotification, syncLegacyNotificationStatus } from './legacy-sync.js';
import {
  consumeOtp,
  consumePasswordResetGrant,
  cleanupAuthRecords,
  createPasswordResetGrant,
  findUserByEmail,
  findAuthUser,
  hashPassword,
  issueOtp,
  issueSession,
  normalizeEmail,
  rotateRefreshSession,
  verifyEmailOtp,
  verifyAccessToken,
  verifyPassword,
} from './auth.js';

const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
const port = env.PORT;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uploadDirectory = path.join(projectRoot, 'server', 'uploads');
const clientDirectory = path.join(projectRoot, 'dist');
const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io: SocketServer = createSocketServer(httpServer);
const authCleanupTimer = setInterval(() => {
  void cleanupAuthRecords().catch((error: unknown) => {
    logger.warn({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Auth record cleanup failed');
  });
}, 24 * 60 * 60 * 1000);
authCleanupTimer.unref();
const routeParam = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

const authLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const accountAttempts = new Map<string, { count: number; resetAt: number }>();
const accountRateLimit = (req: Request, res: Response, key: string) => {
  const now = Date.now();
  const current = accountAttempts.get(key);
  if (!current || current.resetAt <= now) {
    accountAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) {
    res.status(429).json({ error: 'Too many authentication attempts. Try again later.', code: 'RATE_LIMITED' });
    return false;
  }
  current.count += 1;
  return true;
};
const switchRoleSchema = z.object({
  role: z.enum(['TENANT', 'OWNER', 'PG_HOSTEL', 'BROKER']),
}).strict();
const reportSchema = z.object({
  targetType: z.enum(['POST', 'ROOM', 'USER', 'REEL']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2200).optional(),
}).strict();
const reportStatusSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
}).strict();

const paginationCursorSchema = z.string().max(256).optional();
const decodeCursor = (cursor: unknown) => {
  const parsed = paginationCursorSchema.safeParse(cursor);
  if (!parsed.success || !parsed.data) return undefined;
  try {
    const value = JSON.parse(Buffer.from(parsed.data, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = typeof value.createdAt === 'string' ? new Date(value.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime()) || typeof value.id !== 'string') return undefined;
    return { createdAt, id: value.id };
  } catch {
    return undefined;
  }
};
const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');

const usernameBase = (name: string, userId: string) => {
  const safeName = name.toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 18);
  return safeName || `user_${userId.slice(-8)}`;
};

app.use(helmet());
app.use(pinoHttp({
  logger,
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  serializers: {
    req: (req) => ({ id: req.id, method: req.method }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) callback(null, true);
    else callback(new Error('Origin not allowed.'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
}));

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDirectory, { fallthrough: false, maxAge: '7d' }));

const requireAuth: RequestHandler = (req, res, next) => {
  const authorization = req.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  void verifyAccessToken(token)
    .then((user) => {
      res.locals.userId = user.id;
      next();
    })
    .catch(() => res.status(401).json({ error: 'Your session has expired. Please sign in again.' }));
};
const requireUser = requireAuth;

const refreshCookieName = 'rentreel_refresh';
const parseCookie = (header: string | undefined, name: string) =>
  (() => {
    const value = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
    return value ? decodeURIComponent(value) : undefined;
  })();
const setRefreshCookie = (res: Response, token: string) => {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const sameSite = env.NODE_ENV === 'production' ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', `${refreshCookieName}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=${sameSite}; Max-Age=${env.REFRESH_TOKEN_TTL_SECONDS}${secure}`);
};
const clearRefreshCookie = (res: Response) => {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  const sameSite = env.NODE_ENV === 'production' ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', `${refreshCookieName}=; Path=/api/auth; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure}`);
};
const sameOrigin = (req: Request, res: Response) => {
  const origin = req.header('origin');
  if (origin && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' });
    return false;
  }
  return true;
};

const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const authorization = req.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    const authenticated = await verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: authenticated.id },
      select: { activeRole: true },
    });
    if (user?.activeRole !== 'ADMIN') {
      res.status(403).json({ error: 'Administrator access is required.' });
      return;
    }
    res.locals.userId = authenticated.id;
    next();
  } catch (error) {
    next(error);
  }
};

app.post('/api/presence/heartbeat', requireUser, async (_req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: res.locals.userId as string },
      data: { lastSeenAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users/discover', requireUser, async (req, res, next) => {
  try {
    const viewer = await prisma.user.findUnique({
      where: { id: res.locals.userId as string },
      select: { id: true },
    });
    if (!viewer) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const pageSize = Math.min(Math.max(Number(req.query.take) || 50, 1), 100);
    const cutoff = new Date(Date.now() - env.PRESENCE_TIMEOUT_SECONDS * 1000);
    const users = await prisma.user.findMany({
      where: {
        id: { not: viewer.id },
        ...(query ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { locationArea: { contains: query, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: {
        id: true, username: true, name: true, avatar: true, bio: true, city: true,
        locationArea: true, occupation: true, instituteOrCompany: true,
        lastSeenAt: true, roommateProfile: { select: { budgetMin: true, budgetMax: true, moveInAt: true, preferences: true } },
        followers: { where: { followerId: viewer.id }, select: { id: true } },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { name: 'asc' }],
      take: pageSize,
    });
    res.json({
      users: users.map((user) => ({
        ...user,
        isOnline: user.lastSeenAt !== null && user.lastSeenAt >= cutoff,
        isFollowing: user.followers.length > 0,
        followers: undefined,
      })),
      onlineCount: users.filter((user) => user.lastSeenAt !== null && user.lastSeenAt >= cutoff).length,
      presenceTimeoutSeconds: env.PRESENCE_TIMEOUT_SECONDS,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({ ok: true });
});
const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', (req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  next();
});
app.use('/api/auth', authLimiter);

const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(120),
  username: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.]+$/).optional(),
  ),
}).strict();
const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
}).strict();
const otpSchema = z.object({
  email: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/),
}).strict();
const emailSchema = z.object({ email: z.string().email().max(320) }).strict();
const resetGrantSchema = z.object({ grant: z.string().min(30).max(200) }).strict();
const resetPasswordSchema = resetGrantSchema.extend({ password: z.string().min(12).max(128) }).strict();

const publicAuthUser = (user: {
  id: string;
  email: string;
  name: string;
  username: string;
  authVersion: number;
  emailVerifiedAt?: Date | null;
}) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  username: user.username,
});

const authMetadata = (req: Request) => ({ userAgent: req.get('user-agent'), ip: req.ip });
const hashValue = (value: string) => createHash('sha256').update(value).digest('hex');
const authError = (
  res: Response,
  status: number,
  error: string,
  code: string,
  details?: Array<{ field: string; message: string }>,
) => res.status(status).json({ error, code, ...(details ? { details } : {}) });

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(
        res,
        422,
        'Provide valid account details.',
        'VALIDATION_ERROR',
        parsed.error.issues.map((issue) => ({
          field: issue.path.length ? issue.path.join('.') : 'request',
          message: issue.message,
        })),
      );
      return;
    }
    const email = normalizeEmail(parsed.data.email);
    if (!accountRateLimit(req, res, `signup:${email}`)) return;
    if (await findUserByEmail(email)) {
      authError(res, 409, 'An account with that email already exists.', 'EMAIL_IN_USE');
      return;
    }
    const baseUsername = (parsed.data.username || usernameBase(parsed.data.name, randomUUID())).toLowerCase();
    let username = baseUsername;
    if (await prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername.slice(0, 22)}_${randomUUID().slice(-6)}`;
    }
    const user = await prisma.user.create({
      data: {
        clerkId: null,
        email,
        name: parsed.data.name,
        username,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true, name: true, username: true, authVersion: true, emailVerifiedAt: true },
    });
    await issueOtp(user.id, 'EMAIL_VERIFY');
    res.status(201).json({ requiresVerification: true, user: publicAuthUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.filter((value): value is string => typeof value === 'string')
        : typeof error.meta?.target === 'string'
          ? [error.meta.target]
          : [];
      logger.warn({ conflictTarget: target }, 'Signup unique constraint conflict');
      if (target.includes('email')) {
        authError(res, 409, 'An account with that email already exists.', 'EMAIL_IN_USE');
        return;
      }
      if (target.includes('username')) {
        authError(res, 409, 'That username is already in use.', 'USERNAME_IN_USE');
        return;
      }
      authError(res, 409, 'An account with those details already exists.', 'ACCOUNT_CONFLICT');
      return;
    }
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(res, 422, 'Provide a valid email and password.', 'VALIDATION_ERROR');
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (!accountRateLimit(req, res, `login:${normalizeEmail(parsed.data.email)}`)) return;
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      authError(res, 401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
      return;
    }
    if (!user.emailVerifiedAt) {
      await issueOtp(user.id, 'EMAIL_VERIFY');
      res.status(403).json({ error: 'Verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED', requiresVerification: true });
      return;
    }
    const tokens = await issueSession(user, authMetadata(req));
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken, user: publicAuthUser(user) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verify-email', async (req, res, next) => {
  try {
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter the six-digit verification code.' });
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (!accountRateLimit(req, res, `verify-email:${normalizeEmail(parsed.data.email)}`)) return;
    if (!user) {
      authError(res, 400, 'Invalid or expired verification code.', 'INVALID_OTP');
      return;
    }
    const verifiedUser = await verifyEmailOtp(user.id, parsed.data.code);
    const tokens = await issueSession(verifiedUser, authMetadata(req));
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken, user: publicAuthUser(verifiedUser) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid or expired verification code.') {
      authError(res, 400, error.message, 'INVALID_OTP');
      return;
    }
    next(error);
  }
});

app.post('/api/auth/resend-verification-otp', async (req, res, next) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(res, 422, 'Provide a valid email address.', 'VALIDATION_ERROR');
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (!accountRateLimit(req, res, `resend:${normalizeEmail(parsed.data.email)}`)) return;
    if (user && !user.emailVerifiedAt) await issueOtp(user.id, 'EMAIL_VERIFY');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/forgot-password', async (req, res, next) => {
  try {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(res, 422, 'Provide a valid email address.', 'VALIDATION_ERROR');
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    logger.info({ accountFound: Boolean(user) }, 'Forgot-password account lookup completed');
    if (!accountRateLimit(req, res, `forgot:${normalizeEmail(parsed.data.email)}`)) return;
    if (user) await issueOtp(user.id, 'PASSWORD_RESET');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/verify-reset-otp', async (req, res, next) => {
  try {
    const parsed = otpSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(res, 422, 'Enter a valid verification code.', 'VALIDATION_ERROR');
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (!accountRateLimit(req, res, `verify-reset:${normalizeEmail(parsed.data.email)}`)) return;
    if (!user) throw new Error('Invalid or expired verification code.');
    await consumeOtp(user.id, 'PASSWORD_RESET', parsed.data.code);
    res.json({ grant: await createPasswordResetGrant(user.id) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid or expired verification code.') {
      authError(res, 400, error.message, 'INVALID_OTP');
      return;
    }
    next(error);
  }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      authError(res, 422, 'Enter a valid reset grant and password.', 'VALIDATION_ERROR');
      return;
    }
    const userId = await consumePasswordResetGrant(parsed.data.grant);
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    if (!existingUser) {
      authError(res, 400, 'Invalid or expired reset grant.', 'INVALID_GRANT');
      return;
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(parsed.data.password),
        emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        authVersion: { increment: 1 },
      },
      select: { id: true, email: true, name: true, username: true, authVersion: true, emailVerifiedAt: true },
    });
    await prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    io.in(`user:${userId}`).disconnectSockets(true);
    const tokens = await issueSession(user, authMetadata(req));
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken, user: publicAuthUser(user) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid or expired reset grant.') {
      authError(res, 400, error.message, 'INVALID_GRANT');
      return;
    }
    next(error);
  }
});

app.post('/api/auth/logout', async (req, res, next) => {
  try {
    if (!sameOrigin(req, res)) return;
    const rawToken = parseCookie(req.headers.cookie, refreshCookieName);
    if (rawToken) {
      const session = await prisma.refreshSession.findUnique({ where: { tokenHash: hashValue(rawToken) }, select: { userId: true, id: true } });
      if (session) {
        await prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
        io.in(`user:${session.userId}`).disconnectSockets(true);
      }
    }
    clearRefreshCookie(res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  if (!sameOrigin(req, res)) return;
  const rawToken = parseCookie(req.headers.cookie, refreshCookieName);
  if (!rawToken) {
    authError(res, 401, 'Invalid refresh session.', 'INVALID_REFRESH');
    return;
  }
  try {
    const tokens = await rotateRefreshSession(rawToken, authMetadata(req));
    setRefreshCookie(res, tokens.refreshToken);
    res.json({ accessToken: tokens.accessToken });
  } catch {
    clearRefreshCookie(res);
    authError(res, 401, 'Invalid refresh session.', 'INVALID_REFRESH');
  }
});

app.get('/api/auth/me', requireAuth, async (_req, res) => {
  const user = await findAuthUser(res.locals.userId as string);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' });
    return;
  }
  res.json({ user: publicAuthUser(user) });
});

app.use('/api', createRoomRouter({ prisma, requireUser, writeLimiter, io }));

app.get('/api/notifications', requireUser, async (req, res, next) => {
  try {
    const userId = res.locals.userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const cursor = decodeCursor(req.query.cursor);
    const rawTake = Number(req.query.take);
    const take = Number.isInteger(rawTake) ? Math.min(Math.max(rawTake, 1), 100) : 30;
    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = notifications.length > take;
    const items = notifications.slice(0, take);
    const unreadCount = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
    res.json({
      notifications: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      unreadCount,
      nextCursor: hasMore && items.length
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/notifications/:notificationId/read', requireUser, async (req, res, next) => {
  try {
    const userId = res.locals.userId as string;
    const notificationId = routeParam(req.params.notificationId);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user || !notificationId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid notification id.' : 'Profile not found.' });
      return;
    }
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { isRead: true },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    await syncLegacyNotificationStatus(prisma, notificationId, true);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/notifications/mark-all-read', requireUser, async (req, res, next) => {
  try {
    const userId = res.locals.userId as string;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    await prisma.$executeRaw`
      UPDATE "public"."Notification"
      SET "isRead" = true
      WHERE "userId" = (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${res.locals.userId as string} AS uuid)))
    `;
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reports', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const parsed = reportSchema.safeParse(req.body);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide a valid report target and reason.' });
      return;
    }
    if (parsed.data.targetType === 'USER' && parsed.data.targetId === user.id) {
      res.status(400).json({ error: 'You cannot report your own profile.' });
      return;
    }
    const report = await prisma.report.create({ data: { ...parsed.data, reporterId: user.id } });
    res.status(201).json({ success: true, report });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/reports', requireAdmin, async (_req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { reporter: { select: { id: true, username: true, name: true, avatar: true } } },
    });
    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/reports/:reportId', requireAdmin, async (req, res, next) => {
  try {
    const reportId = routeParam(req.params.reportId);
    const parsed = reportStatusSchema.safeParse(req.body);
    if (!reportId || !parsed.success) {
      res.status(400).json({ error: 'Invalid report status.' });
      return;
    }
    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status: parsed.data.status },
      include: { reporter: { select: { id: true, username: true, name: true, avatar: true } } },
    });
    res.json({ success: true, report });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'Report not found.' });
      return;
    }
    next(error);
  }
});

app.get('/api/admin/users', requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    res.json({ users: await Promise.all(users.map((user) => serializeUser(user))) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/verify-user/:userId', requireAdmin, async (req, res, next) => {
  try {
    const userId = routeParam(req.params.userId);
    const parsed = z.object({ isVerified: z.boolean() }).strict().safeParse(req.body);
    if (!userId || !parsed.success) {
      res.status(400).json({ error: 'Invalid verification request.' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isVerified: parsed.data.isVerified },
    });
    res.json({ success: true, user: await serializeUser(user) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    next(error);
  }
});

app.get('/api/admin/metrics', requireAdmin, async (_req, res, next) => {
  try {
    const [users, posts, reels, rooms, activeRooms, inquiries, pendingReports] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.reel.count(),
      prisma.room.count(),
      prisma.room.count({ where: { status: 'AVAILABLE' } }),
      prisma.roomInquiry.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
    ]);
    res.json({ users, posts, reels, rooms, activeRooms, totalInquiries: inquiries, pendingReports });
  } catch (error) {
    next(error);
  }
});

const serializeUser = async (user: DbUser, currentUserId?: string) => {
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ]);
  const activeRole = ['TENANT', 'OWNER', 'PG_HOSTEL', 'BROKER', 'ADMIN'].includes(user.activeRole)
    ? user.activeRole as 'TENANT' | 'OWNER' | 'PG_HOSTEL' | 'BROKER' | 'ADMIN'
    : 'TENANT';
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.id === currentUserId ? user.email : '',
    avatar: user.avatar,
    bio: user.bio,
    roles: [activeRole],
    activeRole,
    isVerified: user.isVerified,
    city: user.city,
    locationArea: user.locationArea,
    occupation: user.occupation || undefined,
    instituteOrCompany: user.instituteOrCompany || undefined,
    followersCount,
    followingCount,
    createdAt: user.createdAt.toISOString(),
  };
};

const findSignedInUser = async (req: Request, res: Response) => {
  const userId = res.locals.userId as string | undefined;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
};

const syncLegacyUserProfile = async (user: DbUser) => {
  if (!shouldSyncLegacyUserProfile(user.clerkId)) return;
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ]);
  await prisma.$executeRaw`
    INSERT INTO "public"."UserProfile"
      ("id", "clerkUserId", "username", "email", "name", "avatar", "bio",
       "roles", "activeRole", "city", "locationArea", "authProvider",
       "providerSubject", "isVerified", "followersCount", "followingCount",
       "createdAt", "updatedAt")
    VALUES
      (${user.id}, ${user.clerkId}, ${user.username}, ${user.email}, ${user.name},
       ${user.avatar}, ${user.bio}, ARRAY[${user.activeRole}]::text[], ${user.activeRole},
       ${user.city}, ${user.locationArea}, 'LOCAL', ${user.clerkId}, ${user.isVerified},
       ${followersCount}, ${followingCount}, ${user.createdAt}, ${user.updatedAt})
    ON CONFLICT ("clerkUserId") DO UPDATE SET
      "username" = EXCLUDED."username",
      "email" = EXCLUDED."email",
      "name" = EXCLUDED."name",
      "avatar" = EXCLUDED."avatar",
      "bio" = EXCLUDED."bio",
      "roles" = EXCLUDED."roles",
      "activeRole" = EXCLUDED."activeRole",
      "city" = EXCLUDED."city",
      "locationArea" = EXCLUDED."locationArea",
      "providerSubject" = EXCLUDED."providerSubject",
      "isVerified" = EXCLUDED."isVerified",
      "followersCount" = EXCLUDED."followersCount",
      "followingCount" = EXCLUDED."followingCount",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
};

const syncLegacyUserCounts = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { clerkId: true } });
  if (!user) return;
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);
  await prisma.$executeRaw`
    UPDATE "public"."UserProfile"
    SET "followersCount" = ${followersCount},
        "followingCount" = ${followingCount},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "clerkUserId" = ${user.clerkId}
  `;
};

const serializePost = async (post: {
  id: string;
  authorId: string;
  media: Array<{ url: string; position: number }>;
  caption: string;
  location: string;
  rent: number | null;
  roomType: string | null;
  createdAt: Date;
  author: DbUser;
  _count: { likes: number; comments: number; saves: number };
  likes: Array<{ id: string }>;
  saves: Array<{ id: string }>;
}, currentUserId?: string) => ({
  id: post.id,
  ownerId: post.authorId,
  images: post.media.sort((first, second) => first.position - second.position).map((asset) => asset.url),
  caption: post.caption,
  location: post.location,
  rentAmount: post.rent ?? undefined,
  roomType: post.roomType ?? undefined,
  likesCount: post._count.likes,
  commentsCount: post._count.comments,
  savesCount: post._count.saves,
  createdAt: post.createdAt.toISOString(),
  owner: await serializeUser(post.author, currentUserId),
  isLiked: post.likes.length > 0,
  isSaved: post.saves.length > 0,
});

const serializeReel = async (reel: {
  id: string;
  authorId: string;
  caption: string;
  videoUrl: string;
  publicId: string;
  coverUrl: string | null;
  location: string;
  createdAt: Date;
  author: DbUser;
  _count: { likes: number; comments: number };
  likes: Array<{ id: string }>;
}, currentUserId: string) => ({
  id: reel.id,
  ownerId: reel.authorId,
  videoUrl: reel.videoUrl,
  thumbnailUrl: reel.coverUrl || createVideoThumbnailUrl(reel.publicId),
  caption: reel.caption,
  location: reel.location,
  category: 'ROOM_TOUR' as const,
  likesCount: reel._count.likes,
  commentsCount: reel._count.comments,
  savesCount: 0,
  viewsCount: 0,
  createdAt: reel.createdAt.toISOString(),
  owner: await serializeUser(reel.author, currentUserId),
  isLiked: reel.likes.length > 0,
});

const handleCurrentProfile = async (_req: Request, res: Response, next: (error?: unknown) => void) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: res.locals.userId as string } });
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    await syncLegacyUserProfile(user);

    res.json({ user: await serializeUser(user, user.id) });
  } catch (error) {
    next(error);
  }
};

app.get('/api/profile', requireUser, handleCurrentProfile);
app.post('/api/auth/profile', requireUser, handleCurrentProfile);

app.post('/api/auth/switch-role', requireUser, async (req, res, next) => {
  try {
    const parsed = switchRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Choose a valid account role.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: res.locals.userId as string } });
    if (!user) {
      res.status(404).json({ error: 'Create your profile before changing roles.' });
      return;
    }
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { activeRole: parsed.data.role },
    });
    res.json({ success: true, user: await serializeUser(updatedUser, updatedUser.id) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts', requireUser, async (req, res, next) => {
  try {
    const signedInUser = await findSignedInUser(req, res);
    if (!signedInUser) {
      res.status(404).json({ error: 'Create your profile before viewing room posts.' });
      return;
    }
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor !== undefined && !cursor) {
      res.status(400).json({ error: 'Invalid feed cursor.' });
      return;
    }
    const rawTake = Number(req.query.take);
    const take = Number.isInteger(rawTake) ? Math.min(Math.max(rawTake, 1), 50) : 20;
    const posts = await prisma.post.findMany({
      where: {
        ...(userId ? { authorId: userId } : {}),
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      include: {
        author: true,
        media: { orderBy: { position: 'asc' } },
        _count: { select: { likes: true, comments: true, saves: true } },
        likes: { where: { userId: signedInUser.id }, select: { id: true } },
        saves: { where: { userId: signedInUser.id }, select: { id: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = posts.length > take;
    const items = posts.slice(0, take);
    const followedUsers = await prisma.follow.findMany({
      where: {
        followerId: signedInUser.id,
        followedId: { in: [...new Set(items.map((post) => post.authorId))] },
      },
      select: { followedId: true },
    });
    const followingIds = new Set(followedUsers.map((follow) => follow.followedId));
    res.json({
      posts: await Promise.all(items.map(async (post) => ({
        ...await serializePost(post, signedInUser.id),
        isFollowingOwner: followingIds.has(post.authorId),
      }))),
      nextCursor: hasMore && items.length
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reels', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor !== undefined && !cursor) {
      res.status(400).json({ error: 'Invalid reel cursor.' });
      return;
    }
    const rawTake = Number(req.query.take);
    const take = Number.isInteger(rawTake) ? Math.min(Math.max(rawTake, 1), 30) : 10;
    const reels = await prisma.reel.findMany({
      where: cursor ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      } : undefined,
      include: {
        author: true,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = reels.length > take;
    const items = reels.slice(0, take);
    res.json({
      reels: await Promise.all(items.map((reel) => serializeReel(reel, user.id))),
      nextCursor: hasMore && items.length
        ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reels', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const body = z.object({
      caption: z.string().trim().min(1).max(2200),
      publicId: z.string().min(1).max(255),
      location: z.string().trim().max(120).optional().default(''),
    }).strict().safeParse(req.body);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: 'Add a caption and upload a supported video.' });
      return;
    }
    const reservation = await prisma.mediaUpload.findFirst({
      where: {
        ownerId: user.id,
        publicId: body.data.publicId,
        resourceType: 'video',
        attachedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!reservation) {
      res.status(403).json({ error: 'This video upload is expired, already used, or not yours.' });
      return;
    }
    const asset = await verifyUploadedAsset(body.data.publicId, 'video', user.id, 100 * 1024 * 1024);
    if (!['mp4', 'webm', 'mov'].includes(asset.format.toLowerCase())) {
      res.status(400).json({ error: 'Upload an MP4, WebM, or MOV video.' });
      return;
    }
    const reelId = await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        const attached = await transaction.mediaUpload.updateMany({
          where: {
            id: reservation.id,
            ownerId: user.id,
            publicId: asset.publicId,
            resourceType: 'video',
            attachedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { attachedAt: new Date() },
        });
        if (attached.count !== 1) {
          throw new Error('This video upload has expired or has already been attached to content.');
        }
        const created = await transaction.reel.create({
          data: {
            authorId: user.id,
            caption: body.data.caption,
            location: body.data.location,
            videoUrl: asset.url,
            publicId: asset.publicId,
            coverUrl: createVideoThumbnailUrl(asset.publicId),
          },
          select: { id: true },
        });
        return created.id;
      }, { maxWait: 10_000, timeout: 20_000 }),
      (id) => io.emit('reel:changed', { reelId: id, authorId: user.id }),
    );
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        author: true,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
      },
    });
    if (!reel) {
      throw new Error('Reel saved but could not be loaded for the response.');
    }
    res.status(201).json({ success: true, reel: await serializeReel(reel, user.id) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/reels/:reelId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const reelId = routeParam(req.params.reelId);
    const body = z.object({
      caption: z.string().trim().min(1).max(2200),
      location: z.string().trim().max(120).optional(),
    }).strict().safeParse(req.body);
    if (!user || !reelId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid reel id.' : 'Profile not found.' });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: 'Enter a caption of up to 2,200 characters.' });
      return;
    }
    const existing = await prisma.reel.findUnique({ where: { id: reelId }, select: { authorId: true } });
    if (!existing) {
      res.status(404).json({ error: 'Reel not found.' });
      return;
    }
    if (existing.authorId !== user.id) {
      res.status(403).json({ error: 'You can only edit your own reels.' });
      return;
    }
    const updated = await persistThenPublish(
      () => prisma.reel.update({
        where: { id: reelId },
        data: {
          caption: body.data.caption,
          ...(body.data.location !== undefined ? { location: body.data.location } : {}),
        },
        include: {
          author: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId: user.id }, select: { id: true } },
        },
      }),
      (savedReel) => io.emit('reel:changed', { reelId, authorId: savedReel.authorId }),
    );
    res.json({ success: true, reel: await serializeReel(updated, user.id) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reels/:reelId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const reelId = routeParam(req.params.reelId);
    if (!user || !reelId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid reel id.' : 'Profile not found.' });
      return;
    }
    const reel = await prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      res.status(404).json({ error: 'Reel not found.' });
      return;
    }
    if (reel.authorId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own reels.' });
      return;
    }
    await deleteCloudinaryAssets([{ publicId: reel.publicId, resourceType: 'video' }]);
    await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        await transaction.reel.delete({ where: { id: reelId } });
        await transaction.mediaUpload.deleteMany({ where: { publicId: reel.publicId } });
      }),
      () => io.emit('reel:changed', { reelId, authorId: user.id }),
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/reels/:reelId/like', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const reelId = routeParam(req.params.reelId);
    if (!user || !reelId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid reel id.' : 'Profile not found.' });
      return;
    }
    const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { authorId: true } });
    if (!reel) {
      res.status(404).json({ error: 'Reel not found.' });
      return;
    }
    const created = await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        const result = await transaction.like.createMany({
          data: [{ userId: user.id, postId: null, reelId }],
          skipDuplicates: true,
        });
        if (result.count > 0 && reel.authorId !== user.id) {
          const like = await transaction.like.findUniqueOrThrow({
            where: { userId_reelId: { userId: user.id, reelId } },
            select: { id: true },
          });
          await transaction.notification.create({
            data: {
              userId: reel.authorId,
              type: 'LIKE',
              title: 'New like',
              message: `${user.name} liked your reel.`,
              metadata: { reelId },
              dedupeKey: `reel-like:${like.id}`,
            },
          });
        }
        return result.count > 0;
      }),
      (changed) => {
        if (changed) {
          io.emit('reel:changed', { reelId, authorId: reel.authorId });
          if (reel.authorId !== user.id) io.to(`user:${reel.authorId}`).emit('notification:new');
        }
      },
    );
    const likesCount = await prisma.like.count({ where: { reelId } });
    res.json({ success: true, isLiked: true, likesCount, changed: created });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reels/:reelId/like', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const reelId = routeParam(req.params.reelId);
    if (!user || !reelId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid reel id.' : 'Profile not found.' });
      return;
    }
    const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { authorId: true } });
    if (!reel) {
      res.status(404).json({ error: 'Reel not found.' });
      return;
    }
    await persistThenPublish(
      () => prisma.like.deleteMany({ where: { userId: user.id, reelId } }),
      (result) => {
        if (result.count > 0) io.emit('reel:changed', { reelId, authorId: reel.authorId });
      },
    );
    const likesCount = await prisma.like.count({ where: { reelId } });
    res.json({ success: true, isLiked: false, likesCount });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reels/:reelId/comments', requireUser, async (req, res, next) => {
  try {
    const reelId = routeParam(req.params.reelId);
    if (!reelId) {
      res.status(400).json({ error: 'Invalid reel id.' });
      return;
    }
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor !== undefined && !cursor) {
      res.status(400).json({ error: 'Invalid comment cursor.' });
      return;
    }
    const comments = await prisma.comment.findMany({
      where: {
        reelId,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      include: { user: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 31,
    });
    const hasMore = comments.length > 30;
    const items = comments.slice(0, 30);
    res.json({
      comments: items.slice().reverse().map((comment) => ({
        id: comment.id,
        targetId: reelId,
        targetType: 'REEL' as const,
        userId: comment.userId,
        userName: comment.user.name,
        userAvatar: comment.user.avatar,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
      })),
      nextCursor: hasMore && items.length
        ? encodeCursor(items[0].createdAt, items[0].id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/reels/:reelId/comments', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const reelId = routeParam(req.params.reelId);
    const body = z.object({ text: z.string().trim().min(1).max(2200) }).safeParse(req.body);
    if (!user || !reelId || !body.success) {
      res.status(user ? 400 : 404).json({ error: user ? 'Enter a comment of 1 to 2,200 characters.' : 'Profile not found.' });
      return;
    }
    const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { authorId: true } });
    if (!reel) {
      res.status(404).json({ error: 'Reel not found.' });
      return;
    }
    const comment = await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        const created = await transaction.comment.create({
          data: { userId: user.id, reelId, text: body.data.text },
          include: { user: true },
        });
        if (reel.authorId !== user.id) {
          await transaction.notification.create({
            data: {
              userId: reel.authorId,
              type: 'INQUIRY',
              title: 'New comment',
              message: `${user.name} commented on your reel.`,
              metadata: { reelId },
              dedupeKey: `reel-comment:${created.id}`,
            },
          });
        }
        return created;
      }),
      () => {
        io.emit('reel:changed', { reelId, authorId: reel.authorId });
        if (reel.authorId !== user.id) io.to(`user:${reel.authorId}`).emit('notification:new');
      },
    );
    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        targetId: reelId,
        targetType: 'REEL',
        userId: comment.userId,
        userName: comment.user.name,
        userAvatar: comment.user.avatar,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/comments/:commentId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const commentId = routeParam(req.params.commentId);
    const body = z.object({ text: z.string().trim().min(1).max(2200) }).strict().safeParse(req.body);
    if (!user || !commentId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid comment id.' : 'Profile not found.' });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: 'Enter a comment of 1 to 2,200 characters.' });
      return;
    }
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, postId: true, reelId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }
    if (existing.userId !== user.id) {
      res.status(403).json({ error: 'You can only edit your own comments.' });
      return;
    }
    const comment = await persistThenPublish(
      () => prisma.comment.update({ where: { id: commentId }, data: { text: body.data.text } }),
      () => {
        if (existing.postId) io.emit('post:changed', { postId: existing.postId });
        if (existing.reelId) io.emit('reel:changed', { reelId: existing.reelId });
      },
    );
    res.json({ success: true, comment: { id: comment.id, text: comment.text, updatedAt: comment.updatedAt.toISOString() } });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/comments/:commentId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const commentId = routeParam(req.params.commentId);
    if (!user || !commentId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid comment id.' : 'Profile not found.' });
      return;
    }
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true, postId: true, reelId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }
    if (existing.userId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own comments.' });
      return;
    }
    await persistThenPublish(
      () => prisma.comment.delete({ where: { id: commentId } }),
      () => {
        if (existing.postId) io.emit('post:changed', { postId: existing.postId });
        if (existing.reelId) io.emit('reel:changed', { reelId: existing.reelId });
      },
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const allowedImageTypes = new Map([
  ['image/jpeg', true],
  ['image/png', true],
  ['image/webp', true],
  ['image/avif', true],
]);
const signedUploadSchema = z.object({
  resourceType: z.enum(['image', 'video']),
  mimeType: z.string().min(1).max(80),
  fileSize: z.number().int().positive(),
});
app.post('/api/media/signature', requireUser, uploadLimiter, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const body = signedUploadSchema.safeParse(req.body);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: 'Provide a supported media type and file size.' });
      return;
    }
    const maxBytes = body.data.resourceType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
    if (
      body.data.fileSize > maxBytes ||
      (body.data.resourceType === 'image' && !allowedImageTypes.has(body.data.mimeType)) ||
      (body.data.resourceType === 'video' && !['video/mp4', 'video/webm', 'video/quicktime'].includes(body.data.mimeType))
    ) {
      res.status(400).json({ error: 'Unsupported media format or file size exceeds the allowed limit.' });
      return;
    }
    const signed = createSignedUpload(user.id, body.data.resourceType, body.data.mimeType);
    const expiredUploads = await prisma.mediaUpload.findMany({
      where: {
        ownerId: user.id,
        attachedAt: null,
        expiresAt: { lte: new Date() },
      },
      select: { id: true, publicId: true, resourceType: true },
      take: 50,
    });
    if (expiredUploads.length > 0) {
      const assets: Array<{ publicId: string; resourceType: 'image' | 'video' }> = [];
      for (const asset of expiredUploads) {
        if (asset.resourceType !== 'image' && asset.resourceType !== 'video') {
          throw new Error('Expired media reservation has an unsupported resource type.');
        }
        assets.push({ publicId: asset.publicId, resourceType: asset.resourceType });
      }
      await deleteCloudinaryAssets(assets);
      await prisma.mediaUpload.deleteMany({
        where: {
          id: { in: expiredUploads.map((asset) => asset.id) },
          attachedAt: null,
          expiresAt: { lte: new Date() },
        },
      });
    }
    await prisma.mediaUpload.create({
      data: {
        ownerId: user.id,
        publicId: signed.publicId,
        resourceType: body.data.resourceType,
        mimeType: body.data.mimeType,
        fileSize: body.data.fileSize,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    res.json({ upload: signed, maxBytes });
  } catch (error) {
    next(error);
  }
});

app.post('/api/media/complete', requireUser, uploadLimiter, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const body = z.object({
      reservedPublicId: z.string().min(1).max(255),
      publicId: z.string().min(1).max(255),
      resourceType: z.enum(['image', 'video']),
    }).strict().safeParse(req.body);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: 'Invalid uploaded media details.' });
      return;
    }
    const reservation = await prisma.mediaUpload.findFirst({
      where: {
        ownerId: user.id,
        publicId: body.data.reservedPublicId,
        resourceType: body.data.resourceType,
        attachedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, fileSize: true },
    });
    if (!reservation) {
      res.status(403).json({ error: 'This upload reservation is expired, already used, or not yours.' });
      return;
    }
    const maxBytes = body.data.resourceType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
    if (reservation.fileSize > maxBytes) {
      res.status(400).json({ error: 'Uploaded media exceeds the allowed size.' });
      return;
    }
    const asset = await verifyUploadedAsset(
      body.data.publicId,
      body.data.resourceType,
      user.id,
      Math.min(maxBytes, reservation.fileSize),
      body.data.reservedPublicId,
    );
    const result = await prisma.mediaUpload.updateMany({
      where: {
        id: reservation.id,
        ownerId: user.id,
        publicId: body.data.reservedPublicId,
        resourceType: body.data.resourceType,
        attachedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { publicId: asset.publicId },
    });
    if (result.count !== 1) {
      res.status(409).json({ error: 'This upload could not be confirmed. Please upload it again.' });
      return;
    }
    res.json({ publicId: asset.publicId });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Create your profile before posting a room.' });
      return;
    }
    const { caption, location, publicIds, rent, roomType } = req.body as {
      caption?: unknown;
      location?: unknown;
      publicIds?: unknown;
      rent?: unknown;
      roomType?: unknown;
    };
    if (typeof caption !== 'string' || caption.trim().length === 0 || caption.length > 2200) {
      res.status(400).json({ error: 'Add a caption of up to 2,200 characters.' });
      return;
    }
    const parsedIds = z.array(z.string().min(1).max(255)).min(1).max(10).safeParse(publicIds);
    if (!parsedIds.success || new Set(parsedIds.data).size !== parsedIds.data.length) {
      res.status(400).json({ error: 'Upload 1 to 10 unique room photos before posting.' });
      return;
    }
    const reservations = await prisma.mediaUpload.findMany({
      where: {
        ownerId: user.id,
        publicId: { in: parsedIds.data },
        resourceType: 'image',
        attachedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (reservations.length !== parsedIds.data.length) {
      res.status(403).json({ error: 'One or more uploaded photos are expired, already used, or not yours.' });
      return;
    }
    const assets = await Promise.all(parsedIds.data.map((publicId) =>
      verifyUploadedAsset(publicId, 'image', user.id, 10 * 1024 * 1024),
    ));
    const postId = await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        const attached = await transaction.mediaUpload.updateMany({
          where: {
            ownerId: user.id,
            publicId: { in: parsedIds.data },
            resourceType: 'image',
            attachedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { attachedAt: new Date() },
        });
        if (attached.count !== parsedIds.data.length) {
          throw new Error('One or more uploaded photos have already been attached to content.');
        }
        const post = await transaction.post.create({
          data: {
            authorId: user.id,
            caption: caption.trim(),
            location: typeof location === 'string' ? location.trim().slice(0, 120) : '',
            rent: Number.isInteger(rent) && Number(rent) > 0 ? Number(rent) : null,
            roomType: typeof roomType === 'string' ? roomType.slice(0, 40) : null,
            media: {
              create: assets.map((asset, position) => ({
                url: asset.url,
                publicId: asset.publicId,
                position,
              })),
            },
          },
          select: { id: true },
        });
        return post.id;
      }, { maxWait: 10_000, timeout: 20_000 }),
      (id) => io.emit('post:changed', { postId: id, authorId: user.id }),
    );
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: true,
        media: { orderBy: { position: 'asc' } },
        _count: { select: { likes: true, comments: true, saves: true } },
        likes: { where: { userId: user.id }, select: { id: true } },
        saves: { where: { userId: user.id }, select: { id: true } },
      },
    });
    if (!post) {
      throw new Error('Post saved but could not be loaded for the response.');
    }
    res.status(201).json({ success: true, post: await serializePost(post, user.id) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/posts/:postId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    const body = z.object({
      caption: z.string().trim().min(1).max(2200).optional(),
      location: z.string().trim().max(120).optional(),
      rent: z.number().int().positive().nullable().optional(),
      roomType: z.string().trim().max(40).nullable().optional(),
    }).strict().safeParse(req.body);
    if (!user || !postId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid post id.' : 'Profile not found.' });
      return;
    }
    if (!body.success || Object.keys(body.data).length === 0) {
      res.status(400).json({ error: 'Provide valid post details to update.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    if (post.authorId !== user.id) {
      res.status(403).json({ error: 'You can only edit your own posts.' });
      return;
    }
    const updated = await persistThenPublish(
      () => prisma.post.update({
        where: { id: postId },
        data: body.data,
        include: {
          author: true,
          media: { orderBy: { position: 'asc' } },
          _count: { select: { likes: true, comments: true, saves: true } },
          likes: { where: { userId: user.id }, select: { id: true } },
          saves: { where: { userId: user.id }, select: { id: true } },
        },
      }),
      (savedPost) => io.emit('post:changed', { postId, authorId: savedPost.authorId }),
    );
    res.json({ success: true, post: await serializePost(updated, user.id) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:postId', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const postId = routeParam(req.params.postId);
    if (!postId) {
      res.status(400).json({ error: 'Invalid post id.' });
      return;
    }
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { media: { select: { publicId: true } } },
    });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    if (post.authorId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own posts.' });
      return;
    }
    await deleteCloudinaryAssets(post.media.map((asset) => ({ publicId: asset.publicId, resourceType: 'image' as const })));
    await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        await transaction.post.delete({ where: { id: post.id } });
        await transaction.mediaUpload.deleteMany({ where: { publicId: { in: post.media.map((asset) => asset.publicId) } } });
      }),
      () => io.emit('post:changed', { postId: post.id, authorId: user.id }),
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:postId/like', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    if (!user || !postId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid post id.' : 'Profile not found.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.like.createMany({
        data: [{ userId: user.id, postId, reelId: null }],
        skipDuplicates: true,
      });
      if (result.count === 0 || post.authorId === user.id) return;
      const like = await transaction.like.findUniqueOrThrow({
        where: { userId_postId: { userId: user.id, postId } },
        select: { id: true },
      });
      await transaction.notification.create({
        data: {
          userId: post.authorId,
          type: 'LIKE',
          title: 'New like',
          message: `${user.name} liked your room post.`,
          metadata: { postId },
          dedupeKey: `post-like:${like.id}`,
        },
      });
    });
    const likesCount = await prisma.like.count({ where: { postId } });
    io.emit('post:changed', { postId, authorId: post.authorId });
    if (post.authorId !== user.id) io.to(`user:${post.authorId}`).emit('notification:new');
    res.json({ success: true, isLiked: true, likesCount });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:postId/like', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    if (!user || !postId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid post id.' : 'Profile not found.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    await prisma.like.deleteMany({ where: { userId: user.id, postId } });
    const likesCount = await prisma.like.count({ where: { postId } });
    io.emit('post:changed', { postId, authorId: post.authorId });
    res.json({ success: true, isLiked: false, likesCount });
  } catch (error) {
    next(error);
  }
});

app.put('/api/posts/:postId/save', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    if (!user || !postId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid post id.' : 'Profile not found.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    await prisma.savedRoom.createMany({
      data: [{ userId: user.id, postId, roomId: null }],
      skipDuplicates: true,
    });
    const savesCount = await prisma.savedRoom.count({ where: { postId } });
    io.emit('post:changed', { postId, authorId: post.authorId });
    res.json({ success: true, isSaved: true, savesCount });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/posts/:postId/save', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    if (!user || !postId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid post id.' : 'Profile not found.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    await prisma.savedRoom.deleteMany({ where: { userId: user.id, postId } });
    const savesCount = await prisma.savedRoom.count({ where: { postId } });
    io.emit('post:changed', { postId, authorId: post.authorId });
    res.json({ success: true, isSaved: false, savesCount });
  } catch (error) {
    next(error);
  }
});

app.get('/api/posts/:postId/comments', requireUser, async (req, res, next) => {
  try {
    const postId = routeParam(req.params.postId);
    if (!postId) {
      res.status(400).json({ error: 'Invalid post id.' });
      return;
    }
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor !== undefined && !cursor) {
      res.status(400).json({ error: 'Invalid comment cursor.' });
      return;
    }
    const rawTake = Number(req.query.take);
    const take = Number.isInteger(rawTake) ? Math.min(Math.max(rawTake, 1), 100) : 30;
    const comments = await prisma.comment.findMany({
      where: {
        postId,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      include: { user: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    const hasMore = comments.length > take;
    const items = comments.slice(0, take);
    res.json({
      comments: items.slice().reverse().map((comment) => ({
        id: comment.id,
        targetId: postId,
        targetType: 'POST' as const,
        userId: comment.userId,
        userName: comment.user.name,
        userAvatar: comment.user.avatar,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
      })),
      nextCursor: hasMore && items.length
        ? encodeCursor(items[0].createdAt, items[0].id)
        : null,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/posts/:postId/comments', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const postId = routeParam(req.params.postId);
    const body = z.object({ text: z.string().trim().min(1).max(2200) }).safeParse(req.body);
    if (!user || !postId || !body.success) {
      res.status(user ? 400 : 404).json({ error: user ? 'Enter a comment of 1 to 2,200 characters.' : 'Profile not found.' });
      return;
    }
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found.' });
      return;
    }
    const comment = await prisma.$transaction(async (transaction) => {
      const created = await transaction.comment.create({
        data: { userId: user.id, postId, text: body.data.text },
        include: { user: true },
      });
      if (post.authorId !== user.id) {
        await transaction.notification.create({
          data: {
            userId: post.authorId,
            type: 'INQUIRY',
            title: 'New comment',
            message: `${user.name} commented on your room post.`,
            metadata: { postId },
            dedupeKey: `post-comment:${created.id}`,
          },
        });
      }
      return created;
    });
    io.emit('post:changed', { postId, authorId: post.authorId });
    if (post.authorId !== user.id) io.to(`user:${post.authorId}`).emit('notification:new');
    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        targetId: postId,
        targetType: 'POST',
        userId: comment.userId,
        userName: comment.user.name,
        userAvatar: comment.user.avatar,
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/users/:username', requireUser, async (req, res, next) => {
  try {
    const signedInUser = await findSignedInUser(req, res);
    if (!signedInUser) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const username = routeParam(req.params.username);
    if (!username) {
      res.status(400).json({ error: 'Invalid username.' });
      return;
    }
    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const [posts, reels, isFollowing] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id },
        include: {
          author: true,
          media: { orderBy: { position: 'asc' } },
          _count: { select: { likes: true, comments: true, saves: true } },
          likes: { where: { userId: signedInUser.id }, select: { id: true } },
          saves: { where: { userId: signedInUser.id }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.reel.findMany({
        where: { authorId: user.id },
        include: {
          author: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId: signedInUser.id }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.follow.findUnique({
        where: { followerId_followedId: { followerId: signedInUser.id, followedId: user.id } },
      }),
    ]);
    res.json({
      user: await serializeUser(user, signedInUser.id),
      isFollowing: Boolean(isFollowing),
      posts: await Promise.all(posts.map(async (post) => ({
        ...await serializePost(post, signedInUser.id),
        isFollowingOwner: Boolean(isFollowing),
      }))),
      reels: await Promise.all(reels.map((reel) => serializeReel(reel, signedInUser.id))),
    });
  } catch (error) {
    next(error);
  }
});

const listProfileConnections = async (
  req: Request,
  res: Response,
  kind: 'followers' | 'following',
) => {
  const currentUser = await findSignedInUser(req, res);
  const username = routeParam(req.params.username);
  if (!currentUser) {
    res.status(404).json({ error: 'Profile not found.' });
    return;
  }
  if (!username) {
    res.status(400).json({ error: 'Invalid username.' });
    return;
  }
  const profile = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!profile) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor !== undefined && !cursor) {
    res.status(400).json({ error: 'Invalid connection cursor.' });
    return;
  }
  const rawTake = Number(req.query.take);
  const take = Number.isInteger(rawTake) ? Math.min(Math.max(rawTake, 1), 50) : 30;
  const rows = await prisma.follow.findMany({
    where: {
      ...(kind === 'followers' ? { followedId: profile.id } : { followerId: profile.id }),
      ...(cursor ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      } : {}),
    },
    include: { follower: true, followed: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const items = rows.slice(0, take);
  const users = await Promise.all(items.map(async (row) => {
    const connection = kind === 'followers' ? row.follower : row.followed;
    const [serialized, isFollowing] = await Promise.all([
      serializeUser(connection, currentUser.id),
      prisma.follow.findUnique({
        where: { followerId_followedId: { followerId: currentUser.id, followedId: connection.id } },
        select: { id: true },
      }),
    ]);
    return { ...serialized, isFollowing: Boolean(isFollowing) };
  }));
  res.json({
    users,
    nextCursor: hasMore && items.length
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null,
  });
};

app.get('/api/users/:username/followers', requireUser, async (req, res, next) => {
  try {
    await listProfileConnections(req, res, 'followers');
  } catch (error) {
    next(error);
  }
});

app.get('/api/users/:username/following', requireUser, async (req, res, next) => {
  try {
    await listProfileConnections(req, res, 'following');
  } catch (error) {
    next(error);
  }
});

app.patch('/api/users/me', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const update: Prisma.UserUpdateInput = {};
    for (const field of ['name', 'username', 'bio', 'city', 'locationArea', 'occupation', 'instituteOrCompany'] as const) {
      const value = body[field];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (field === 'name' && (trimmed.length === 0 || trimmed.length > 100)) {
          res.status(400).json({ error: 'Name must be between 1 and 100 characters.' });
          return;
        }
        if (field === 'username' && !/^[a-zA-Z0-9_.]{3,30}$/.test(trimmed)) {
          res.status(400).json({ error: 'Username must be 3–30 letters, numbers, dots or underscores.' });
          return;
        }
        if (field === 'bio' && trimmed.length > 500) {
          res.status(400).json({ error: 'Bio must be 500 characters or fewer.' });
          return;
        }
        update[field] = field === 'username' ? trimmed.toLowerCase() : trimmed;
      }
    }
    if (body.occupation === null) update.occupation = null;
    const updatedUser = await prisma.user.update({ where: { id: user.id }, data: update });
    await syncLegacyUserProfile(updatedUser);
    res.json({ user: await serializeUser(updatedUser, user.id) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/users/:targetId/follow', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const targetId = routeParam(req.params.targetId);
    if (!targetId) {
      res.status(400).json({ error: 'Invalid user id.' });
      return;
    }
    if (targetId === user.id) {
      res.status(400).json({ error: 'You cannot follow your own profile.' });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const created = await prisma.follow.createMany({
      data: [{ followerId: user.id, followedId: targetId }],
      skipDuplicates: true,
    });
    if (created.count > 0) {
      const follow = await prisma.follow.findUniqueOrThrow({
        where: { followerId_followedId: { followerId: user.id, followedId: targetId } },
        select: { id: true },
      });
      const notification = await prisma.notification.create({
        data: {
          userId: targetId,
          type: 'NEW_FOLLOWER',
          title: 'New follower',
          message: `${user.name} started following you.`,
          metadata: { username: user.username },
          dedupeKey: `follow:${follow.id}`,
        },
      });
      await syncLegacyNotification(prisma, notification);
      io.to(`user:${targetId}`).emit('notification:new');
    }
    const followersCount = await prisma.follow.count({ where: { followedId: targetId } });
    await Promise.all([syncLegacyUserCounts(user.id), syncLegacyUserCounts(targetId)]);
    io.to(`user:${targetId}`).emit('profile:followers-changed', { followersCount });
    res.json({ success: true, isFollowing: true, followersCount });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/users/:targetId/follow', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const targetId = routeParam(req.params.targetId);
    if (!user || !targetId) {
      res.status(user ? 400 : 404).json({ error: user ? 'Invalid user id.' : 'Profile not found.' });
      return;
    }
    if (targetId === user.id) {
      res.status(400).json({ error: 'You cannot unfollow your own profile.' });
      return;
    }
    const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    await prisma.follow.deleteMany({ where: { followerId: user.id, followedId: targetId } });
    const followersCount = await prisma.follow.count({ where: { followedId: targetId } });
    await Promise.all([syncLegacyUserCounts(user.id), syncLegacyUserCounts(targetId)]);
    io.to(`user:${targetId}`).emit('profile:followers-changed', { followersCount });
    res.json({ success: true, isFollowing: false, followersCount });
  } catch (error) {
    next(error);
  }
});
const asContext = (value: unknown): Prisma.InputJsonValue | undefined =>
  value && typeof value === 'object' ? value as Prisma.InputJsonValue : undefined;

const conversationInclude = {
  participants: { include: { user: true } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.ConversationInclude;

const serializeConversation = async (conversation: {
  id: string;
  activeContext: Prisma.JsonValue | null;
  updatedAt: Date;
  participants: Array<{ user: DbUser }>;
  messages: Array<{ text: string; createdAt: Date }>;
}, currentUserId: string) => {
  const otherMember = conversation.participants.find((participant) => participant.user.id !== currentUserId);
  const unreadCount = await prisma.message.count({
    where: { conversationId: conversation.id, receiverId: currentUserId, isRead: false },
  });
  return {
    id: conversation.id,
    participants: conversation.participants.map((participant) => participant.user.id),
    lastMessage: conversation.messages[0]?.text || '',
    lastMessageAt: conversation.updatedAt.toISOString(),
    unreadCount,
    activeContext: conversation.activeContext || undefined,
    otherUser: otherMember ? await serializeUser(otherMember.user) : undefined,
  };
};

app.get('/api/conversations', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId: user.id },
      include: { conversation: { include: conversationInclude } },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });
    res.json({
      conversations: await Promise.all(
        memberships.map(({ conversation }) => serializeConversation(conversation, user.id)),
      ),
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/conversations', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const targetUserId = req.body?.targetUserId;
    if (!user || typeof targetUserId !== 'string') {
      res.status(user ? 400 : 404).json({ error: user ? 'Choose a valid user.' : 'Profile not found.' });
      return;
    }
    if (targetUserId === user.id) {
      res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
      return;
    }
    const otherUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!otherUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    const pairKey = [user.id, otherUser.id].sort().join(':');
    let conversation = await prisma.conversation.findUnique({
      where: { pairKey },
      include: conversationInclude,
    });
    if (!conversation) {
      try {
        conversation = await prisma.conversation.create({
          data: {
            pairKey,
            activeContext: asContext(req.body.context),
            participants: { create: [{ userId: user.id }, { userId: otherUser.id }] },
          },
          include: conversationInclude,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
        conversation = await prisma.conversation.findUnique({
          where: { pairKey },
          include: conversationInclude,
        });
        if (!conversation) throw error;
      }
    }
    io.to(`user:${user.id}`).emit('conversation:changed', { conversationId: conversation.id });
    io.to(`user:${otherUser.id}`).emit('conversation:changed', { conversationId: conversation.id });
    res.json({
      conversation: await serializeConversation(conversation, user.id),
      otherUser: await serializeUser(otherUser),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/conversations/:conversationId/messages', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const conversationId = routeParam(req.params.conversationId);
    if (!conversationId) {
      res.status(400).json({ error: 'Invalid conversation id.' });
      return;
    }
    const membership = user
      ? await prisma.conversationParticipant.findFirst({
          where: { conversationId, userId: user.id },
          include: { conversation: { include: conversationInclude } },
        })
      : null;
    if (!membership || !user) {
      res.status(user ? 404 : 401).json({ error: 'Conversation not found.' });
      return;
    }
    const cursor = decodeCursor(req.query.cursor);
    if (req.query.cursor !== undefined && !cursor) {
      res.status(400).json({ error: 'Invalid message cursor.' });
      return;
    }
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId: membership.conversation.id,
        receiverId: user.id,
        isRead: false,
      },
      select: { id: true, senderId: true },
    });
    const readResult = await prisma.message.updateMany({
      where: {
        conversationId: membership.conversation.id,
        receiverId: user.id,
        isRead: false,
      },
      data: { isRead: true },
    });
    for (const message of unreadMessages) {
      await syncLegacyMessageStatus(prisma, { id: message.id, isRead: true });
    }
    if (readResult.count > 0) {
      io.to(`user:${user.id}`).emit('conversation:read', {
        conversationId: membership.conversation.id,
      });
    }
    for (const senderId of new Set(unreadMessages.map((message) => message.senderId))) {
      io.to(`user:${senderId}`).emit('message:read', {
        messageIds: unreadMessages.filter((message) => message.senderId === senderId).map((message) => message.id),
        conversationId: membership.conversation.id,
      });
    }
    const newestFirst = await prisma.message.findMany({
      where: {
        conversationId: membership.conversation.id,
        ...(cursor ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    });
    const hasMore = newestFirst.length > 50;
    const page = newestFirst.slice(0, 50);
    const nextCursor = hasMore && page.length > 0
      ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
      : null;
    const messages = page.reverse();
    const other = membership.conversation.participants.find((participant) => participant.user.id !== user.id)?.user;
    res.json({
      conversation: await serializeConversation(membership.conversation, user.id),
      otherUser: other ? await serializeUser(other) : null,
      hasMore,
      nextCursor,
      messages: messages.map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        receiverId: message.receiverId,
        text: message.text,
        context: message.context || undefined,
        idempotencyKey: message.idempotencyKey || undefined,
        isRead: message.isRead,
        deliveredAt: message.deliveredAt?.toISOString(),
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/messages/unread-count', requireUser, async (_req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: res.locals.userId as string }, select: { id: true } });
    if (!user) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }
    const unreadCount = await prisma.message.count({
      where: { receiverId: user.id, isRead: false },
    });
    res.json({ unreadCount });
  } catch (error) {
    next(error);
  }
});

app.post('/api/messages', requireUser, async (req, res, next) => {
  try {
    const user = await findSignedInUser(req, res);
    const bodySchema = z.object({
      conversationId: z.string().uuid(),
      receiverId: z.string().uuid(),
      text: z.string().trim().min(1).max(5000),
      idempotencyKey: z.string().uuid(),
      context: z.object({
        type: z.enum(['PROPERTY', 'LISTING', 'REEL', 'REQUIREMENT', 'ROOM']),
        id: z.string().min(1).max(100),
        title: z.string().min(1).max(200),
        subtitle: z.string().max(200).optional(),
        price: z.number().nonnegative().optional(),
        imageUrl: z.string().url().optional(),
        location: z.string().max(200).optional(),
      }).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!user || !parsed.success) {
      res.status(user ? 400 : 404).json({
        error: user ? 'Provide a valid conversation, recipient, message, and idempotency key.' : 'Profile not found.',
      });
      return;
    }
    const { conversationId, receiverId, text, idempotencyKey, context } = parsed.data;
    const memberships = await prisma.conversationParticipant.findMany({
      where: { conversationId, userId: { in: [user.id, receiverId] } },
      select: { userId: true },
    });
    if (memberships.length !== 2) {
      res.status(403).json({ error: 'You are not a member of this conversation.' });
      return;
    }
    const existingMessage = await prisma.message.findUnique({ where: { idempotencyKey } });
    if (existingMessage) {
      if (
        existingMessage.senderId !== user.id ||
        existingMessage.receiverId !== receiverId ||
        existingMessage.conversationId !== conversationId
      ) {
        res.status(409).json({ error: 'The idempotency key has already been used.' });
        return;
      }
      res.status(200).json({ success: true, message: {
        ...existingMessage,
        context: existingMessage.context || undefined,
        createdAt: existingMessage.createdAt.toISOString(),
      } });
      return;
    }
    const message = await persistThenPublish(
      () => prisma.$transaction(async (transaction) => {
        const saved = await transaction.message.create({
          data: {
            conversationId,
            senderId: user.id,
            receiverId,
            text,
            context: asContext(context),
            idempotencyKey,
          },
        });
        await transaction.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        await transaction.notification.create({
          data: {
            userId: receiverId,
            type: 'NEW_MESSAGE',
            title: 'New message',
            message: `${user.name} sent you a message.`,
            metadata: { conversationId },
            dedupeKey: `message:${saved.id}`,
          },
        });
        return saved;
      }),
      (saved) => {
        const savedMessage = {
          id: saved.id,
          conversationId: saved.conversationId,
          senderId: saved.senderId,
          receiverId: saved.receiverId,
          text: saved.text,
          context: saved.context || undefined,
          idempotencyKey: saved.idempotencyKey || undefined,
          isRead: saved.isRead,
          deliveredAt: saved.deliveredAt?.toISOString(),
          createdAt: saved.createdAt.toISOString(),
        };
        io.to(`user:${user.id}`).emit('message:new', savedMessage);
        io.to(`user:${receiverId}`).emit('message:new', savedMessage);
        io.to(`user:${user.id}`).emit('conversation:changed', { conversationId });
        io.to(`user:${receiverId}`).emit('message:notification', {
          conversationId,
          message: savedMessage,
        });
        io.to(`user:${receiverId}`).emit('notification:new');
        io.to(`user:${receiverId}`).emit('conversation:changed', { conversationId });
      },
    );
    const notification = await prisma.notification.findUnique({
      where: { dedupeKey: `message:${message.id}` },
    });
    await syncLegacyMessage(prisma, message);
    if (notification) await syncLegacyNotification(prisma, notification);
    const serializedMessage = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      context: message.context || undefined,
      idempotencyKey: message.idempotencyKey || undefined,
      isRead: message.isRead,
      deliveredAt: message.deliveredAt?.toISOString(),
      createdAt: message.createdAt.toISOString(),
    };
    res.status(201).json({ success: true, message: serializedMessage });
  } catch (error) {
    next(error);
  }
});

if (env.NODE_ENV === 'production') {
  app.use(express.static(clientDirectory, { index: false }));
  app.use((_req, res, next) => {
    res.sendFile(path.join(clientDirectory, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.get('/', (_req, res) => {
  if (env.NODE_ENV === 'production') {
    res.sendFile(path.join(clientDirectory, 'index.html'));
    return;
  }
  res.json({ ok: true, service: 'rentreel-api' });
});
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: (error?: unknown) => void) => {
  const isTransactionError = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028';
  logger.error({
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'Unknown API error',
    prismaCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    ...(isTransactionError && error instanceof Error ? { prismaMessage: error.message.slice(0, 500) } : {}),
  }, 'API request failed');
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 10 MB or smaller.' : 'Invalid image upload.' });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: 'That resource already exists.' });
    return;
  }
  if (isTransactionError) {
    res.status(503).json({ error: 'The database took too long to publish this content. Your upload is still available; retry publishing.' });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2021', 'P2022'].includes(error.code)) {
    res.status(503).json({ error: 'Database schema is not ready. Apply the pending Prisma migrations.' });
    return;
  }
  if (error instanceof CloudinaryNotConfiguredError) {
    res.status(503).json({ error: error.message });
    return;
  }
  if (error instanceof CloudinaryUploadError) {
    res.status(502).json({ error: 'Cloudinary could not store the room photo. Check the server log and try again.' });
    return;
  }
  if (error instanceof Error && error.message === 'Please wait before requesting another code.') {
    res.status(429).json({ error: error.message, code: 'OTP_COOLDOWN' });
    return;
  }
  if (error instanceof Error && error.message === 'Email delivery failed.') {
    res.status(503).json({ error: 'We could not deliver the email. Please try again later.', code: 'EMAIL_DELIVERY_FAILED' });
    return;
  }
  if (error instanceof Error && error.message === 'Email delivery is not configured.') {
    res.status(503).json({ error: 'Email delivery is not configured. Add the SMTP environment variables and try again.', code: 'EMAIL_DELIVERY_NOT_CONFIGURED' });
    return;
  }
  res.status(500).json({ error: 'Unexpected server error.' });
});

httpServer.listen(port, '0.0.0.0', () => {
  logger.info({
    port,
    smtpConfigured: Boolean(env.SMTP_HOST && env.SMTP_FROM_EMAIL),
  }, 'RentReel API and Socket.IO listening');
});

let shuttingDown = false;
const shutdown = (signal: NodeJS.Signals) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  void io.close()
    .then(() => prisma.$disconnect())
    .then(() => logger.info('Graceful shutdown completed'))
    .catch((error: unknown) => {
      logger.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Graceful shutdown failed');
      process.exitCode = 1;
    });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
