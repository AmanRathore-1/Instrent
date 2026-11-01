ALTER TABLE "rentreel"."Post"
  ADD COLUMN "roomFeedRank" INTEGER NOT NULL DEFAULT 0;

UPDATE "rentreel"."Post"
SET "roomFeedRank" = floor(random() * 2147483647)::integer
WHERE "roomFeedRank" = 0;

CREATE INDEX "Post_rent_roomFeedRank_id_idx"
  ON "rentreel"."Post" ("rent", "roomFeedRank", "id");
