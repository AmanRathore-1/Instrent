-- Validate cross-column invariants before adding any missing constraints.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rentreel"."Comment" WHERE num_nonnulls("postId", "reelId") <> 1) THEN
    RAISE EXCEPTION 'Comment rows must reference exactly one post or reel';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Like" WHERE num_nonnulls("postId", "reelId") <> 1) THEN
    RAISE EXCEPTION 'Like rows must reference exactly one post or reel';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."SavedRoom" WHERE num_nonnulls("roomId", "postId") <> 1) THEN
    RAISE EXCEPTION 'SavedRoom rows must reference exactly one room or post';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."RoomMedia" WHERE num_nonnulls("roomId", "postId") <> 1) THEN
    RAISE EXCEPTION 'RoomMedia rows must reference exactly one room or post';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."User" WHERE "activeRole" NOT IN ('TENANT', 'OWNER', 'PG_HOSTEL', 'BROKER', 'ADMIN')) THEN
    RAISE EXCEPTION 'Unexpected User.activeRole value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Room" WHERE "status" NOT IN ('AVAILABLE', 'UNAVAILABLE', 'RENTED')) THEN
    RAISE EXCEPTION 'Unexpected Room.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."RoomInquiry" WHERE "status" NOT IN ('PENDING', 'ACCEPTED', 'DECLINED')) THEN
    RAISE EXCEPTION 'Unexpected RoomInquiry.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Report" WHERE "status" NOT IN ('PENDING', 'RESOLVED', 'DISMISSED')) THEN
    RAISE EXCEPTION 'Unexpected Report.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Notification" WHERE "type" NOT IN ('EXPIRING_SOON', 'LISTING_EXPIRED', 'LISTING_RENEWED', 'NEW_MESSAGE', 'INQUIRY', 'COMMENT', 'VISIT_REQUEST', 'REQUIREMENT_MATCH', 'LIKE', 'NEW_FOLLOWER', 'ROOM_INQUIRY')) THEN
    RAISE EXCEPTION 'Unexpected Notification.type value; review data before applying enum-domain constraint';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."Comment"'::regclass AND conname = 'Comment_exactly_one_content_check') THEN
    ALTER TABLE "rentreel"."Comment" ADD CONSTRAINT "Comment_exactly_one_content_check" CHECK (num_nonnulls("postId", "reelId") = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."Like"'::regclass AND conname = 'Like_exactly_one_content_check') THEN
    ALTER TABLE "rentreel"."Like" ADD CONSTRAINT "Like_exactly_one_content_check" CHECK (num_nonnulls("postId", "reelId") = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."SavedRoom"'::regclass AND conname = 'SavedRoom_exactly_one_target_check') THEN
    ALTER TABLE "rentreel"."SavedRoom" ADD CONSTRAINT "SavedRoom_exactly_one_target_check" CHECK (num_nonnulls("roomId", "postId") = 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."RoomMedia"'::regclass AND conname = 'RoomMedia_exactly_one_parent_check') THEN
    ALTER TABLE "rentreel"."RoomMedia" ADD CONSTRAINT "RoomMedia_exactly_one_parent_check" CHECK (num_nonnulls("roomId", "postId") = 1);
  END IF;
END $$;

-- CHECK constraints retain the existing string representation while validating its domain.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rentreel"."User" WHERE "activeRole" NOT IN ('TENANT', 'OWNER', 'PG_HOSTEL', 'BROKER', 'ADMIN')) THEN
    RAISE EXCEPTION 'Unexpected User.activeRole value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Room" WHERE "status" NOT IN ('AVAILABLE', 'UNAVAILABLE', 'RENTED')) THEN
    RAISE EXCEPTION 'Unexpected Room.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."RoomInquiry" WHERE "status" NOT IN ('PENDING', 'ACCEPTED', 'DECLINED')) THEN
    RAISE EXCEPTION 'Unexpected RoomInquiry.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Report" WHERE "status" NOT IN ('PENDING', 'RESOLVED', 'DISMISSED')) THEN
    RAISE EXCEPTION 'Unexpected Report.status value; review data before applying enum-domain constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."Notification" WHERE "type" NOT IN ('EXPIRING_SOON', 'LISTING_EXPIRED', 'LISTING_RENEWED', 'NEW_MESSAGE', 'INQUIRY', 'COMMENT', 'VISIT_REQUEST', 'REQUIREMENT_MATCH', 'LIKE', 'NEW_FOLLOWER', 'ROOM_INQUIRY')) THEN
    RAISE EXCEPTION 'Unexpected Notification.type value; review data before applying enum-domain constraint';
  END IF;

  UPDATE "rentreel"."Notification" SET "type" = 'COMMENT' WHERE "type" = 'INQUIRY';

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."User"'::regclass AND conname = 'User_activeRole_allowed_check') THEN
    ALTER TABLE "rentreel"."User" ADD CONSTRAINT "User_activeRole_allowed_check" CHECK ("activeRole" IN ('TENANT', 'OWNER', 'PG_HOSTEL', 'BROKER', 'ADMIN'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."Room"'::regclass AND conname = 'Room_status_allowed_check') THEN
    ALTER TABLE "rentreel"."Room" ADD CONSTRAINT "Room_status_allowed_check" CHECK ("status" IN ('AVAILABLE', 'UNAVAILABLE', 'RENTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."RoomInquiry"'::regclass AND conname = 'RoomInquiry_status_allowed_check') THEN
    ALTER TABLE "rentreel"."RoomInquiry" ADD CONSTRAINT "RoomInquiry_status_allowed_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."Report"'::regclass AND conname = 'Report_status_allowed_check') THEN
    ALTER TABLE "rentreel"."Report" ADD CONSTRAINT "Report_status_allowed_check" CHECK ("status" IN ('PENDING', 'RESOLVED', 'DISMISSED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"rentreel"."Notification"'::regclass AND conname = 'Notification_type_allowed_check') THEN
    ALTER TABLE "rentreel"."Notification" ADD CONSTRAINT "Notification_type_allowed_check" CHECK ("type" IN ('EXPIRING_SOON', 'LISTING_EXPIRED', 'LISTING_RENEWED', 'NEW_MESSAGE', 'COMMENT', 'VISIT_REQUEST', 'REQUIREMENT_MATCH', 'LIKE', 'NEW_FOLLOWER', 'ROOM_INQUIRY'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Room_status_city_area_rent_idx" ON "rentreel"."Room"("status", "city", "area", "rent");
CREATE INDEX IF NOT EXISTS "Message_conversationId_receiverId_isRead_idx" ON "rentreel"."Message"("conversationId", "receiverId", "isRead");

CREATE TYPE "rentreel"."VisitRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED');
CREATE TABLE "rentreel"."VisitRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL,
  "requesterId" UUID NOT NULL,
  "ownerId" UUID NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "note" VARCHAR(2200),
  "status" "rentreel"."VisitRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VisitRequest_roomId_scheduledAt_idx" ON "rentreel"."VisitRequest"("roomId", "scheduledAt");
CREATE INDEX "VisitRequest_requesterId_createdAt_idx" ON "rentreel"."VisitRequest"("requesterId", "createdAt");
CREATE INDEX "VisitRequest_ownerId_status_scheduledAt_idx" ON "rentreel"."VisitRequest"("ownerId", "status", "scheduledAt");
ALTER TABLE "rentreel"."VisitRequest" ADD CONSTRAINT "VisitRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rentreel"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rentreel"."VisitRequest" ADD CONSTRAINT "VisitRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rentreel"."VisitRequest" ADD CONSTRAINT "VisitRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Install pg_trgm only when the database reports it as available.
DO $$
DECLARE extension_schema TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    SELECT namespace.nspname INTO extension_schema
    FROM pg_extension extension
    JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'pg_trgm';
  END IF;

  IF extension_schema IS NULL THEN
    RAISE NOTICE 'pg_trgm is not installed; title/description/city/area trigram indexes were skipped';
  ELSE
    EXECUTE format('CREATE INDEX IF NOT EXISTS "Room_title_trgm_idx" ON "rentreel"."Room" USING GIN ("title" %I.gin_trgm_ops)', extension_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS "Room_description_trgm_idx" ON "rentreel"."Room" USING GIN ("description" %I.gin_trgm_ops)', extension_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS "Room_city_trgm_idx" ON "rentreel"."Room" USING GIN ("city" %I.gin_trgm_ops)', extension_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS "Room_area_trgm_idx" ON "rentreel"."Room" USING GIN ("area" %I.gin_trgm_ops)', extension_schema);
  END IF;
END $$;
