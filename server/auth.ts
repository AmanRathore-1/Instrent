import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import pino from 'pino';
import { prisma } from './prisma.js';
import { env } from './config/env.js';
import { EmailDeliveryError, sendAuthEmail } from './email.js';

const accessTokenLifetimeSeconds = env.ACCESS_TOKEN_TTL_SECONDS;
const refreshTokenLifetimeMs = env.REFRESH_TOKEN_TTL_SECONDS * 1000;
const otpLifetimeMs = env.OTP_TTL_SECONDS * 1000;
const grantLifetimeMs = 10 * 60 * 1000;
const maxOtpAttempts = 5;
const jwtSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const otpSecret = Buffer.from(env.OTP_HMAC_SECRET, 'utf8');
const authLogger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });

export type AuthPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  username: string;
  authVersion: number;
  emailVerifiedAt: Date | null;
};

const hashValue = (value: string) => createHash('sha256').update(value).digest('hex');
const hashOtp = (userId: string, purpose: AuthPurpose, code: string) =>
  createHmac('sha256', otpSecret).update(`${userId}:${purpose}:${code}`).digest('hex');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isOtpUsable = (otp: { expiresAt: Date; attempts: number; consumedAt: Date | null }, now = new Date()) =>
  !otp.consumedAt && otp.expiresAt > now && otp.attempts < maxOtpAttempts;
export const isGrantUsable = (grant: { expiresAt: Date; consumedAt: Date | null }, now = new Date()) =>
  !grant.consumedAt && grant.expiresAt > now;

export const hashPassword = (password: string) => argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
});
export const verifyPassword = (password: string, hash: string) => argon2.verify(hash, password);

const selectAuthUser = {
  id: true,
  email: true,
  name: true,
  username: true,
  authVersion: true,
  emailVerifiedAt: true,
} as const;

export const findUserByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email: normalizeEmail(email) }, select: { ...selectAuthUser, passwordHash: true } });

export const findAuthUser = (userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: selectAuthUser });

const createAccessToken = (user: AuthUser) =>
  new SignJWT({ authVersion: user.authVersion })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer('rentreel-api')
    .setAudience('rentreel-web')
    .setIssuedAt()
    .setExpirationTime(`${accessTokenLifetimeSeconds}s`)
    .sign(jwtSecret);

export const verifyAccessToken = async (token: string) => {
  const { payload } = await jwtVerify(token, jwtSecret, {
    algorithms: ['HS256'],
    issuer: 'rentreel-api',
    audience: 'rentreel-web',
  });
  if (typeof payload.sub !== 'string' || typeof payload.authVersion !== 'number') {
    throw new Error('Invalid access token.');
  }
  const user = await findAuthUser(payload.sub);
  if (!user || user.authVersion !== payload.authVersion || !user.emailVerifiedAt) {
    throw new Error('Invalid access token.');
  }
  return user;
};

export const createRefreshSession = async (
  userId: string,
  metadata: { familyId?: string; userAgent?: string; ip?: string } = {},
) => {
  const rawToken = randomBytes(48).toString('base64url');
  const session = await prisma.refreshSession.create({
    data: {
      userId,
      tokenHash: hashValue(rawToken),
      familyId: metadata.familyId || randomUUID(),
      expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
      userAgent: metadata.userAgent?.slice(0, 500),
      ip: metadata.ip?.slice(0, 64),
    },
  });
  return { rawToken, session };
};

export const issueSession = async (
  user: AuthUser,
  metadata: { userAgent?: string; ip?: string } = {},
) => ({
  accessToken: await createAccessToken(user),
  refreshToken: (await createRefreshSession(user.id, metadata)).rawToken,
});

export const rotateRefreshSession = async (
  rawToken: string,
  metadata: { userAgent?: string; ip?: string } = {},
) => {
  const tokenHash = hashValue(rawToken);
  const stored = await prisma.refreshSession.findUnique({ where: { tokenHash } });
  if (!stored || stored.expiresAt <= new Date()) throw new Error('Invalid refresh token.');
  if (stored.revokedAt) {
    await prisma.refreshSession.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new Error('Refresh token reuse detected.');
  }
  const user = await findAuthUser(stored.userId);
  if (!user) throw new Error('Invalid refresh token.');

  const result = await prisma.$transaction(async (transaction) => {
    const nextRawToken = randomBytes(48).toString('base64url');
    const next = await transaction.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: hashValue(nextRawToken),
        familyId: stored.familyId,
        expiresAt: new Date(Date.now() + refreshTokenLifetimeMs),
        userAgent: metadata.userAgent?.slice(0, 500),
        ip: metadata.ip?.slice(0, 64),
      },
    });
    const revoked = await transaction.refreshSession.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById: next.id },
    });
    if (revoked.count !== 1) throw new Error('Refresh token reuse detected.');
    return nextRawToken;
  });
  return { accessToken: await createAccessToken(user), refreshToken: result };
};

export const issueOtp = async (userId: string, purpose: AuthPurpose) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new Error('Account not found.');
  const recent = await prisma.emailOtp.findFirst({
    where: { userId, purpose },
    orderBy: { lastSentAt: 'desc' },
    select: { lastSentAt: true },
  });
  if (recent && recent.lastSentAt.getTime() > Date.now() - 60_000) {
    throw new Error('Please wait before requesting another code.');
  }
  const code = String(randomInt(100000, 1_000_000));
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.emailOtp.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now },
    });
    await transaction.emailOtp.create({
      data: {
        userId,
        purpose,
        otpHash: hashOtp(userId, purpose, code),
        expiresAt: new Date(Date.now() + otpLifetimeMs),
        lastSentAt: now,
      },
    });
  });
  authLogger.info({ userId, purpose, attempted: true }, 'Attempting OTP email delivery');
  try {
    await sendAuthEmail(user.email, purpose, code);
    authLogger.info({ userId, purpose }, 'OTP email delivery accepted');
  } catch (error) {
    throw error instanceof EmailDeliveryError ? error : new EmailDeliveryError();
  }
};

export const consumeOtp = async (userId: string, purpose: AuthPurpose, code: string) => {
  const otp = await prisma.emailOtp.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || !isOtpUsable(otp)) {
    throw new Error('Invalid or expired verification code.');
  }
  const supplied = Buffer.from(hashOtp(userId, purpose, code));
  const expected = Buffer.from(otp.otpHash);
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!matches) {
    await prisma.emailOtp.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: maxOtpAttempts } },
      data: { attempts: { increment: 1 } },
    });
    throw new Error('Invalid or expired verification code.');
  }
  const consumed = await prisma.emailOtp.updateMany({
    where: { id: otp.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: maxOtpAttempts } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error('Invalid or expired verification code.');
};

export const verifyEmailOtp = async (userId: string, code: string) => {
  const otp = await prisma.emailOtp.findFirst({
    where: { userId, purpose: 'EMAIL_VERIFY', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp || !isOtpUsable(otp)) {
    throw new Error('Invalid or expired verification code.');
  }
  const supplied = Buffer.from(hashOtp(userId, 'EMAIL_VERIFY', code));
  const expected = Buffer.from(otp.otpHash);
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!matches) {
    await prisma.emailOtp.updateMany({
      where: { id: otp.id, consumedAt: null, attempts: { lt: maxOtpAttempts } },
      data: { attempts: { increment: 1 } },
    });
    throw new Error('Invalid or expired verification code.');
  }
  const now = new Date();
  const verified = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.emailOtp.updateMany({
      where: { id: otp.id, consumedAt: null, expiresAt: { gt: now }, attempts: { lt: maxOtpAttempts } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw new Error('Invalid or expired verification code.');
    return transaction.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: now, isVerified: true },
      select: selectAuthUser,
    });
  });
  return verified;
};

export const createPasswordResetGrant = async (userId: string) => {
  const rawGrant = randomBytes(32).toString('base64url');
  await prisma.passwordResetGrant.create({
    data: {
      userId,
      grantHash: hashValue(rawGrant),
      expiresAt: new Date(Date.now() + grantLifetimeMs),
    },
  });
  return rawGrant;
};

export const consumePasswordResetGrant = async (rawGrant: string) => {
  const grant = await prisma.passwordResetGrant.findUnique({ where: { grantHash: hashValue(rawGrant) } });
  if (!grant || !isGrantUsable(grant)) throw new Error('Invalid or expired reset grant.');
  const consumed = await prisma.passwordResetGrant.updateMany({
    where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw new Error('Invalid or expired reset grant.');
  return grant.userId;
};

export const cleanupAuthRecords = () =>
  prisma.$transaction([
    prisma.emailOtp.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] } }),
    prisma.passwordResetGrant.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] } }),
    prisma.refreshSession.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] } }),
  ]);
