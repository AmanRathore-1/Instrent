type RawClient = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
};

export const shouldSyncLegacyUserProfile = (clerkId: string | null) => Boolean(clerkId);

type RoomProjection = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  city: string;
  area: string;
  fullAddress: string;
  amenities: string[];
  rent: number;
  roomType: string;
  availableAt: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  media: Array<{ url: string }>;
};

export const syncLegacyRoom = async (client: RawClient, room: RoomProjection) => {
  const photos = room.media.map((asset) => asset.url);
  const isAvailable = room.status === 'AVAILABLE';
  const expiresAt = new Date(room.createdAt.getTime() + 10 * 24 * 60 * 60 * 1000);
  await client.$executeRaw`
    INSERT INTO "public"."Property"
      ("id", "ownerId", "title", "description", "propertyType", "city", "area",
       "fullAddress", "amenities", "rules", "foodOption", "genderPreference",
       "noBrokerage", "coverPhoto", "photos", "totalRooms", "availableRooms",
       "minRent", "maxRent", "rating", "reviewCount", "isVerified", "createdAt", "updatedAt")
    VALUES
      (            ${room.id}, (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${room.ownerId} AS uuid))), ${room.title}, ${room.description}, 'ROOM',
       ${room.city}, ${room.area}, ${room.fullAddress}, ${room.amenities},
       ARRAY[]::text[], 'NONE', 'ANY', true, ${photos[0] || ''}, ${photos},
       1, ${isAvailable ? 1 : 0}, ${room.rent}, ${room.rent}, 0, 0, false,
       ${room.createdAt}, ${room.updatedAt})
    ON CONFLICT ("id") DO UPDATE SET
      "ownerId" = EXCLUDED."ownerId", "title" = EXCLUDED."title",
      "description" = EXCLUDED."description", "city" = EXCLUDED."city",
      "area" = EXCLUDED."area", "fullAddress" = EXCLUDED."fullAddress",
      "amenities" = EXCLUDED."amenities", "coverPhoto" = EXCLUDED."coverPhoto",
      "photos" = EXCLUDED."photos", "availableRooms" = EXCLUDED."availableRooms",
      "minRent" = EXCLUDED."minRent", "maxRent" = EXCLUDED."maxRent",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
  await client.$executeRaw`
    INSERT INTO "public"."Room"
      ("id", "propertyId", "roomNumber", "roomType", "rent", "deposit",
       "furnishing", "hasAC", "hasAttachedBath", "hasBalcony", "photos",
       "availableFrom", "isAvailable", "createdAt")
    VALUES
      (${room.id}, ${room.id}, ${room.id.slice(0, 8)}, ${room.roomType}, ${room.rent},
       0, 'UNFURNISHED', false, false, false, ${photos},
       ${room.availableAt?.toISOString() || null}, ${isAvailable}, ${room.createdAt})
    ON CONFLICT ("id") DO UPDATE SET
      "propertyId" = EXCLUDED."propertyId", "roomType" = EXCLUDED."roomType",
      "rent" = EXCLUDED."rent", "photos" = EXCLUDED."photos",
      "availableFrom" = EXCLUDED."availableFrom", "isAvailable" = EXCLUDED."isAvailable"
  `;
  await client.$executeRaw`
    INSERT INTO "public"."Listing"
      ("id", "propertyId", "roomId", "ownerId", "title", "description", "rent",
       "deposit", "propertyType", "roomType", "city", "area", "photos",
       "amenities", "genderPreference", "status", "createdAt", "expiresAt",
       "rentedAt", "renewedAt", "viewsCount", "inquiriesCount", "savesCount", "isFeatured")
    VALUES
      (${room.id}, ${room.id}, ${room.id}, (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${room.ownerId} AS uuid))), ${room.title},
       ${room.description}, ${room.rent}, 0, 'ROOM', ${room.roomType}, ${room.city},
       ${room.area}, ${photos}, ${room.amenities}, 'ANY',
       ${isAvailable ? 'ACTIVE' : room.status}, ${room.createdAt}, ${expiresAt},
       ${room.status === 'RENTED' ? room.updatedAt : null}, null, 0, 0, 0, false)
    ON CONFLICT ("id") DO UPDATE SET
      "title" = EXCLUDED."title", "description" = EXCLUDED."description",
      "rent" = EXCLUDED."rent", "roomType" = EXCLUDED."roomType",
      "city" = EXCLUDED."city", "area" = EXCLUDED."area",
      "photos" = EXCLUDED."photos", "amenities" = EXCLUDED."amenities",
      "status" = EXCLUDED."status", "expiresAt" = EXCLUDED."expiresAt",
      "rentedAt" = EXCLUDED."rentedAt"
  `;
};

export const deleteLegacyRoom = async (client: RawClient, roomId: string) => {
  await client.$executeRaw`DELETE FROM "public"."Listing" WHERE "id" = ${roomId}`;
  await client.$executeRaw`DELETE FROM "public"."Room" WHERE "id" = ${roomId}`;
  await client.$executeRaw`DELETE FROM "public"."Property" WHERE "id" = ${roomId}`;
};

export const syncLegacyMessage = async (client: RawClient, message: {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  context: unknown;
  isRead: boolean;
  createdAt: Date;
}) => {
  await client.$executeRaw`
    INSERT INTO "public"."Message"
      ("id", "conversationId", "senderId", "receiverId", "text", "context", "isRead", "createdAt")
    VALUES
      (${message.id}, ${message.conversationId},
       (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${message.senderId} AS uuid))),
       (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${message.receiverId} AS uuid))),
       ${message.text}, ${message.context || null}, ${message.isRead}, ${message.createdAt})
    ON CONFLICT ("id") DO UPDATE SET
      "text" = EXCLUDED."text", "context" = EXCLUDED."context",
      "isRead" = EXCLUDED."isRead"
  `;
};

export const syncLegacyNotification = async (client: RawClient, notification: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  metadata: unknown;
  isRead: boolean;
  createdAt: Date;
}) => {
  await client.$executeRaw`
    INSERT INTO "public"."Notification"
      ("id", "userId", "type", "title", "message", "metadata", "isRead", "createdAt")
    VALUES
      (${notification.id},
       (SELECT "id" FROM "public"."UserProfile" WHERE "clerkUserId" = (SELECT "clerkId" FROM "rentreel"."User" WHERE "id" = CAST(${notification.userId} AS uuid))),
       ${notification.type}, ${notification.title},
       ${notification.message}, ${notification.metadata || null}, ${notification.isRead}, ${notification.createdAt})
    ON CONFLICT ("id") DO UPDATE SET
      "type" = EXCLUDED."type", "title" = EXCLUDED."title",
      "message" = EXCLUDED."message", "metadata" = EXCLUDED."metadata",
      "isRead" = EXCLUDED."isRead"
  `;
};

export const syncLegacyMessageStatus = async (client: RawClient, message: {
  id: string;
  isRead: boolean;
  deliveredAt?: Date | null;
}) => {
  await client.$executeRaw`
    UPDATE "public"."Message"
    SET "isRead" = ${message.isRead}
    WHERE "id" = ${message.id}
  `;
};

export const syncLegacyNotificationStatus = async (client: RawClient, notificationId: string, isRead: boolean) => {
  await client.$executeRaw`
    UPDATE "public"."Notification"
    SET "isRead" = ${isRead}
    WHERE "id" = ${notificationId}
  `;
};
