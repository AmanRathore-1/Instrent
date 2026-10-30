DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "rentreel"."User" WHERE "clerkId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot drop User.clerkId: non-null legacy identifiers exist. Back them up and clear them before retrying.';
  END IF;
  IF EXISTS (SELECT 1 FROM "rentreel"."WebhookEvent") THEN
    RAISE EXCEPTION 'Cannot drop WebhookEvent: event records exist. Back them up or remove them before retrying.';
  END IF;
END $$;

DROP INDEX "rentreel"."User_clerkId_key";
ALTER TABLE "rentreel"."User" DROP COLUMN "clerkId";
DROP TABLE "rentreel"."WebhookEvent";
