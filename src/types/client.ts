export type UserRole = 'TENANT' | 'OWNER' | 'PG_HOSTEL' | 'BROKER' | 'ADMIN';

export type OccupationType = 'STUDENT' | 'WORKING_PROFESSIONAL' | 'OTHER';

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  phone?: string;
  avatar: string;
  bio?: string;
  roles: UserRole[];
  activeRole: UserRole;
  isVerified: boolean;
  city: string;
  locationArea: string;
  occupation?: OccupationType;
  instituteOrCompany?: string;
  authProvider?: 'LOCAL';
  providerSubject?: string;
  followersCount: number;
  followingCount: number;
  rating?: number;
  reviewCount?: number;
  createdAt: string;
}

export interface RentalRoom {
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
  availableAt?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'RENTED';
  media: Array<{ id: string; url: string; resourceType: 'image' | 'video'; position: number }>;
  photos: string[];
  owner: Pick<User, 'id' | 'username' | 'name' | 'avatar' | 'bio'>;
  isSaved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Reel {
  id: string;
  ownerId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  location: string;
  category: 'ROOM_TOUR';
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  viewsCount: number;
  createdAt: string;
  owner?: User;
  isLiked?: boolean;
}

export interface Post {
  id: string;
  ownerId: string;
  images: string[];
  caption: string;
  location: string;
  rentAmount?: number;
  roomType?: string;
  isFollowingOwner?: boolean;
  likesCount: number;
  commentsCount: number;
  savesCount: number;
  createdAt: string;
  owner?: User;
  isLiked?: boolean;
  isSaved?: boolean;
}

export interface Comment {
  id: string;
  targetId: string;
  targetType: 'REEL' | 'POST';
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  createdAt: string;
}

export interface MessageContext {
  type: 'REEL' | 'ROOM';
  id: string;
  title: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  context?: MessageContext;
  idempotencyKey?: string;
  isRead: boolean;
  deliveredAt?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt: string;
  unreadCount: number;
  activeContext?: MessageContext;
  otherUser?: User;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'NEW_MESSAGE'
    | 'COMMENT'
    | 'ROOM_INQUIRY'
    | 'LIKE'
    | 'NEW_FOLLOWER';
  title: string;
  message: string;
  linkUrl?: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterId: string;
  targetType: 'POST' | 'ROOM' | 'USER' | 'REEL';
  targetId: string;
  reason: string;
  details?: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  reporter?: User;
}

export type ActiveView =
  | 'home'
  | 'explore'
  | 'reels'
  | 'find-property'
  | 'rooms'
  | 'roommates'
  | 'messages'
  | 'saved'
  | 'settings'
  | 'user-profile';


