ALTER TABLE "rentreel"."User"
  ADD COLUMN "isOpenToRoommates" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "User_isOpenToRoommates_createdAt_id_idx"
  ON "rentreel"."User" ("isOpenToRoommates", "createdAt", "id");
