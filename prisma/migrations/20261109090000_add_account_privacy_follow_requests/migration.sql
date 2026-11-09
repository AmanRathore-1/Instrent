ALTER TABLE "rentreel"."User" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;
UPDATE "rentreel"."User" SET "isPrivate" = false WHERE "isPrivate" IS NULL;
ALTER TABLE "rentreel"."User" ALTER COLUMN "isPrivate" SET DEFAULT false;
ALTER TABLE "rentreel"."User" ALTER COLUMN "isPrivate" SET NOT NULL;

CREATE TABLE "rentreel"."FollowRequest" (
  "id" UUID NOT NULL,
  "requesterId" UUID NOT NULL,
  "recipientId" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FollowRequest_requesterId_recipientId_key"
  ON "rentreel"."FollowRequest"("requesterId", "recipientId");
CREATE INDEX "FollowRequest_recipientId_status_createdAt_idx"
  ON "rentreel"."FollowRequest"("recipientId", "status", "createdAt");
CREATE INDEX "FollowRequest_requesterId_status_createdAt_idx"
  ON "rentreel"."FollowRequest"("requesterId", "status", "createdAt");

ALTER TABLE "rentreel"."FollowRequest"
  ADD CONSTRAINT "FollowRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "rentreel"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rentreel"."FollowRequest"
  ADD CONSTRAINT "FollowRequest_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "rentreel"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
