ALTER TABLE "rentreel"."User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE INDEX "User_lastSeenAt_idx" ON "rentreel"."User"("lastSeenAt");
