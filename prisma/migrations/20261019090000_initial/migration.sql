-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "rentreel";

-- CreateTable
CREATE TABLE "rentreel"."User" (
    "id" UUID NOT NULL,
    "clerkId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "locationArea" TEXT NOT NULL DEFAULT '',
    "occupation" TEXT,
    "instituteOrCompany" TEXT,
    "activeRole" TEXT NOT NULL DEFAULT 'TENANT',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Post" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "caption" VARCHAR(2200) NOT NULL,
    "location" VARCHAR(120) NOT NULL DEFAULT '',
    "rent" INTEGER,
    "roomType" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Reel" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "caption" VARCHAR(2200) NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "coverUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Comment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postId" UUID,
    "reelId" UUID,
    "text" VARCHAR(2200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Like" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postId" UUID,
    "reelId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."MediaUpload" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" VARCHAR(10) NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Follow" (
    "id" UUID NOT NULL,
    "followerId" UUID NOT NULL,
    "followedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Room" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2200) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "area" VARCHAR(160) NOT NULL,
    "fullAddress" TEXT NOT NULL DEFAULT '',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rent" INTEGER NOT NULL,
    "roomType" VARCHAR(40) NOT NULL,
    "availableAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."RoomMedia" (
    "id" UUID NOT NULL,
    "roomId" UUID,
    "postId" UUID,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" VARCHAR(10) NOT NULL DEFAULT 'image',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."RoommateProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "moveInAt" TIMESTAMP(3),
    "preferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoommateProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."SavedRoom" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roomId" UUID,
    "postId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."RoomInquiry" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "message" VARCHAR(2200) NOT NULL,
    "idempotencyKey" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Conversation" (
    "id" UUID NOT NULL,
    "pairKey" TEXT NOT NULL,
    "activeContext" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "text" VARCHAR(5000) NOT NULL,
    "context" JSONB,
    "idempotencyKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "dedupeKey" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."Report" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" VARCHAR(40) NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "details" VARCHAR(2200),
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentreel"."WebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "rentreel"."User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "rentreel"."User"("username");

-- CreateIndex
CREATE INDEX "User_createdAt_id_idx" ON "rentreel"."User"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_id_idx" ON "rentreel"."Post"("authorId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Post_createdAt_id_idx" ON "rentreel"."Post"("createdAt", "id");

-- CreateIndex
CREATE INDEX "Reel_authorId_createdAt_id_idx" ON "rentreel"."Reel"("authorId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Reel_createdAt_id_idx" ON "rentreel"."Reel"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Reel_publicId_key" ON "rentreel"."Reel"("publicId");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_id_idx" ON "rentreel"."Comment"("postId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Comment_reelId_createdAt_id_idx" ON "rentreel"."Comment"("reelId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Like_postId_createdAt_id_idx" ON "rentreel"."Like"("postId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Like_reelId_createdAt_id_idx" ON "rentreel"."Like"("reelId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_postId_key" ON "rentreel"."Like"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_reelId_key" ON "rentreel"."Like"("userId", "reelId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_publicId_key" ON "rentreel"."MediaUpload"("publicId");

-- CreateIndex
CREATE INDEX "MediaUpload_ownerId_expiresAt_idx" ON "rentreel"."MediaUpload"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "Follow_followedId_createdAt_id_idx" ON "rentreel"."Follow"("followedId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followedId_key" ON "rentreel"."Follow"("followerId", "followedId");

-- CreateIndex
CREATE INDEX "Room_ownerId_createdAt_id_idx" ON "rentreel"."Room"("ownerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Room_city_area_rent_idx" ON "rentreel"."Room"("city", "area", "rent");

-- CreateIndex
CREATE INDEX "Room_createdAt_id_idx" ON "rentreel"."Room"("createdAt", "id");

-- CreateIndex
CREATE INDEX "RoomMedia_roomId_position_idx" ON "rentreel"."RoomMedia"("roomId", "position");

-- CreateIndex
CREATE INDEX "RoomMedia_postId_position_idx" ON "rentreel"."RoomMedia"("postId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMedia_publicId_key" ON "rentreel"."RoomMedia"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "RoommateProfile_userId_key" ON "rentreel"."RoommateProfile"("userId");

-- CreateIndex
CREATE INDEX "SavedRoom_userId_createdAt_id_idx" ON "rentreel"."SavedRoom"("userId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRoom_userId_roomId_key" ON "rentreel"."SavedRoom"("userId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedRoom_userId_postId_key" ON "rentreel"."SavedRoom"("userId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomInquiry_idempotencyKey_key" ON "rentreel"."RoomInquiry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RoomInquiry_roomId_createdAt_id_idx" ON "rentreel"."RoomInquiry"("roomId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RoomInquiry_requesterId_createdAt_id_idx" ON "rentreel"."RoomInquiry"("requesterId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "RoomInquiry_ownerId_status_createdAt_idx" ON "rentreel"."RoomInquiry"("ownerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_pairKey_key" ON "rentreel"."Conversation"("pairKey");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_id_idx" ON "rentreel"."Conversation"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_conversationId_idx" ON "rentreel"."ConversationParticipant"("userId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "rentreel"."ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_idempotencyKey_key" ON "rentreel"."Message"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_id_idx" ON "rentreel"."Message"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Message_receiverId_isRead_idx" ON "rentreel"."Message"("receiverId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "rentreel"."Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "rentreel"."Notification"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "rentreel"."Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Report_reporterId_createdAt_id_idx" ON "rentreel"."Report"("reporterId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "rentreel"."Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "rentreel"."Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "rentreel"."WebhookEvent"("eventId");

-- AddForeignKey
ALTER TABLE "rentreel"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Reel" ADD CONSTRAINT "Reel_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rentreel"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Comment" ADD CONSTRAINT "Comment_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "rentreel"."Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rentreel"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Like" ADD CONSTRAINT "Like_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "rentreel"."Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."MediaUpload" ADD CONSTRAINT "MediaUpload_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Follow" ADD CONSTRAINT "Follow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Room" ADD CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoomMedia" ADD CONSTRAINT "RoomMedia_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rentreel"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoomMedia" ADD CONSTRAINT "RoomMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rentreel"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoommateProfile" ADD CONSTRAINT "RoommateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."SavedRoom" ADD CONSTRAINT "SavedRoom_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."SavedRoom" ADD CONSTRAINT "SavedRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rentreel"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."SavedRoom" ADD CONSTRAINT "SavedRoom_postId_fkey" FOREIGN KEY ("postId") REFERENCES "rentreel"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoomInquiry" ADD CONSTRAINT "RoomInquiry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rentreel"."Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoomInquiry" ADD CONSTRAINT "RoomInquiry_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."RoomInquiry" ADD CONSTRAINT "RoomInquiry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "rentreel"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "rentreel"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentreel"."Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "rentreel"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cross-column invariants are enforced in PostgreSQL because Prisma schema syntax cannot express CHECK constraints.
ALTER TABLE "rentreel"."Follow" ADD CONSTRAINT "Follow_no_self_follow_check" CHECK ("followerId" <> "followedId");
ALTER TABLE "rentreel"."Comment" ADD CONSTRAINT "Comment_exactly_one_content_check" CHECK (num_nonnulls("postId", "reelId") = 1);
ALTER TABLE "rentreel"."Like" ADD CONSTRAINT "Like_exactly_one_content_check" CHECK (num_nonnulls("postId", "reelId") = 1);
ALTER TABLE "rentreel"."RoomMedia" ADD CONSTRAINT "RoomMedia_exactly_one_parent_check" CHECK (num_nonnulls("roomId", "postId") = 1);
ALTER TABLE "rentreel"."SavedRoom" ADD CONSTRAINT "SavedRoom_exactly_one_target_check" CHECK (num_nonnulls("roomId", "postId") = 1);
