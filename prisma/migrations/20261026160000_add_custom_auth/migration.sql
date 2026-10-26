-- Additive custom authentication storage. Existing legacy identifiers remain
-- nullable so existing profiles and legacy sync data are preserved.
ALTER TABLE "rentreel"."User"
  ALTER COLUMN "clerkId" DROP NOT NULL;

ALTER TABLE "rentreel"."User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "rentreel"."User"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique normalized email constraint: duplicate user emails exist';
  END IF;
END $$;
UPDATE "rentreel"."User" SET "email" = LOWER(BTRIM("email"));
CREATE UNIQUE INDEX "User_email_key" ON "rentreel"."User"("email");

CREATE TABLE "rentreel"."EmailOtp" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "purpose" VARCHAR(30) NOT NULL,
  "otpHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailOtp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rentreel"."RefreshSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "familyId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "replacedById" UUID,
  "userAgent" VARCHAR(500),
  "ip" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rentreel"."PasswordResetGrant" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "grantHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "PasswordResetGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "rentreel"."RefreshSession"("tokenHash");
CREATE UNIQUE INDEX "PasswordResetGrant_grantHash_key" ON "rentreel"."PasswordResetGrant"("grantHash");
CREATE INDEX "EmailOtp_userId_purpose_idx" ON "rentreel"."EmailOtp"("userId", "purpose");
CREATE INDEX "RefreshSession_userId_expiresAt_idx" ON "rentreel"."RefreshSession"("userId", "expiresAt");
CREATE INDEX "RefreshSession_familyId_idx" ON "rentreel"."RefreshSession"("familyId");
CREATE INDEX "PasswordResetGrant_userId_expiresAt_idx" ON "rentreel"."PasswordResetGrant"("userId", "expiresAt");

ALTER TABLE "rentreel"."EmailOtp" ADD CONSTRAINT "EmailOtp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rentreel"."RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rentreel"."RefreshSession" ADD CONSTRAINT "RefreshSession_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "rentreel"."RefreshSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rentreel"."PasswordResetGrant" ADD CONSTRAINT "PasswordResetGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
