-- Extend the existing notification type check for persisted post and reel alerts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "rentreel"."Notification"
    WHERE "type" NOT IN (
      'EXPIRING_SOON',
      'LISTING_EXPIRED',
      'LISTING_RENEWED',
      'NEW_MESSAGE',
      'COMMENT',
      'VISIT_REQUEST',
      'REQUIREMENT_MATCH',
      'LIKE',
      'NEW_FOLLOWER',
      'ROOM_INQUIRY',
      'NEW_POST',
      'NEW_REEL'
    )
  ) THEN
    RAISE EXCEPTION 'Unexpected Notification.type value; review data before extending notification types';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"rentreel"."Notification"'::regclass
      AND conname = 'Notification_type_allowed_check'
  ) THEN
    ALTER TABLE "rentreel"."Notification" DROP CONSTRAINT "Notification_type_allowed_check";
  END IF;

  ALTER TABLE "rentreel"."Notification"
    ADD CONSTRAINT "Notification_type_allowed_check"
    CHECK ("type" IN (
      'EXPIRING_SOON',
      'LISTING_EXPIRED',
      'LISTING_RENEWED',
      'NEW_MESSAGE',
      'COMMENT',
      'VISIT_REQUEST',
      'REQUIREMENT_MATCH',
      'LIKE',
      'NEW_FOLLOWER',
      'ROOM_INQUIRY',
      'NEW_POST',
      'NEW_REEL'
    ));
END $$;
