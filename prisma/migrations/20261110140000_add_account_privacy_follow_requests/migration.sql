-- Add account privacy and pending follow requests without changing existing follows.
ALTER TABLE "rentreel"."User"
  ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "rentreel"."FollowRequest" (
  "id" UUID NOT NULL,
  "followerId" UUID NOT NULL,
  "followedId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FollowRequest_followerId_followedId_key" UNIQUE ("followerId", "followedId"),
  CONSTRAINT "FollowRequest_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowRequest_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FollowRequest_not_self_check" CHECK ("followerId" <> "followedId")
);

CREATE INDEX IF NOT EXISTS "FollowRequest_followedId_createdAt_id_idx"
  ON "rentreel"."FollowRequest"("followedId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "FollowRequest_followerId_createdAt_id_idx"
  ON "rentreel"."FollowRequest"("followerId", "createdAt", "id");

-- Keep existing notification values intact while allowing follow-request events.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "rentreel"."Notification"
    WHERE "type" NOT IN (
      'EXPIRING_SOON','LISTING_EXPIRED','LISTING_RENEWED','NEW_MESSAGE','COMMENT',
      'VISIT_REQUEST','REQUIREMENT_MATCH','LIKE','NEW_FOLLOWER','ROOM_INQUIRY',
      'NEW_POST','NEW_REEL','FOLLOW_REQUEST','FOLLOW_REQUEST_ACCEPTED'
    )
  ) THEN
    RAISE EXCEPTION 'Unexpected Notification.type value; review data before extending notification types';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"rentreel"."Notification"'::regclass
      AND conname = 'Notification_type_allowed_check'
  ) THEN
    ALTER TABLE "rentreel"."Notification" DROP CONSTRAINT "Notification_type_allowed_check";
  END IF;

  ALTER TABLE "rentreel"."Notification"
    ADD CONSTRAINT "Notification_type_allowed_check"
    CHECK ("type" IN (
      'EXPIRING_SOON','LISTING_EXPIRED','LISTING_RENEWED','NEW_MESSAGE','COMMENT',
      'VISIT_REQUEST','REQUIREMENT_MATCH','LIKE','NEW_FOLLOWER','ROOM_INQUIRY',
      'NEW_POST','NEW_REEL','FOLLOW_REQUEST','FOLLOW_REQUEST_ACCEPTED'
    ));
END $$;
