export const canManageRoom = (ownerId: string, viewerId: string) => ownerId === viewerId;

export const canViewRoomAddress = (ownerId: string, viewerId: string) => ownerId === viewerId;
