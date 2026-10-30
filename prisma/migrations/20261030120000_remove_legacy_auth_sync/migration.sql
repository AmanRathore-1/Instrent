DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'rentreel'
      AND table_name = 'User'
      AND column_name = 'clerkId'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "rentreel"."User"
      WHERE "clerkId" IS NOT NULL
        AND "passwordHash" IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot drop User.clerkId: accounts with a legacy identifier and no password hash exist.';
    END IF;
  END IF;
  IF to_regclass('"rentreel"."WebhookEvent"') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "rentreel"."WebhookEvent") THEN
      RAISE EXCEPTION 'Cannot drop WebhookEvent: event records exist.';
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS "rentreel"."User_clerkId_key";
ALTER TABLE "rentreel"."User" DROP COLUMN IF EXISTS "clerkId";
DROP TABLE IF EXISTS "rentreel"."WebhookEvent";
