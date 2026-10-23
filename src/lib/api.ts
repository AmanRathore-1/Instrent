import type {
  User,
  Property,
  RentalListing,
  RentalRequirement,
  Reel,
  Post,
  Comment,
  Review,
  Conversation,
  Message,
  Notification,
  VisitRequest,
  Report,
  UserRole,
  RentalRoom,
} from '../types/client.ts';
import axios from 'axios';

const BASE_URL = '/api';

type ClerkTokenGetter = () => Promise<string | null>;

let clerkTokenGetter: ClerkTokenGetter | null = null;

export function setClerkTokenGetter(getToken: ClerkTokenGetter | null) {
  clerkTokenGetter = getToken;
}

export function getClerkAccessToken(): Promise<string | null> {
  if (!clerkTokenGetter) {
    return Promise.reject(new Error('Clerk authentication is not ready.'));
  }
  return clerkTokenGetter();
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  if (!clerkTokenGetter) {
    throw new Error('Clerk authentication is not ready. Please sign in and try again.');
  }

  const token = await clerkTokenGetter();
  if (!token) {
    throw new Error('Your Clerk session has expired. Please sign in again.');
  }

  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (options?.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  try {
    const response = await axios.request<T>({
      url: `${BASE_URL}${url}`,
      method: options?.method || 'GET',
      data: options?.body,
      headers: Object.fromEntries(headers.entries()),
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError<{ error?: string }>(error)) {
      throw new Error(error.response?.data?.error || error.message);
    }
    throw error;
  }
}

export const api = {
  heartbeat: () => fetchJson<{ success: boolean }>('/presence/heartbeat', { method: 'POST' }),
  discoverUsers: (query?: string) => fetchJson<{
    users: Array<User & {
      isOnline: boolean;
      isFollowing: boolean;
      lastSeenAt: string | null;
      roommateProfile: { budgetMin: number | null; budgetMax: number | null; moveInAt: string | null; preferences: { lifestyle?: string[] } | null } | null;
    }>;
    onlineCount: number;
    presenceTimeoutSeconds: number;
  }>(`/users/discover${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  syncCurrentUser: () => fetchJson<{ user: User }>('/auth/profile', { method: 'POST' }),
  switchRole: (role: UserRole) =>
    fetchJson<{ success: boolean; user: User }>('/auth/switch-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  // Feed
  getFeed: () =>
    fetchJson<{
      listings: RentalListing[];
      reels: Reel[];
      requirements: RentalRequirement[];
      posts: Post[];
    }>('/feed'),
  getRooms: (filters?: Record<string, string>, cursor?: string) => {
    const params = new URLSearchParams(filters);
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return fetchJson<{ rooms: RentalRoom[]; nextCursor: string | null }>(`/rooms${query ? `?${query}` : ''}`);
  },
  getRoom: (roomId: string) => fetchJson<{ room: RentalRoom }>(`/rooms/${roomId}`),
  getSavedRooms: () => fetchJson<{ rooms: RentalRoom[] }>('/saved/rooms'),
  createRoom: (data: {
    title: string;
    description: string;
    city: string;
    area: string;
    fullAddress: string;
    rent: number;
    roomType: string;
    amenities: string[];
    availableAt?: string | null;
    status: RentalRoom['status'];
    media: Array<{ publicId: string }>;
  }) =>
    fetchJson<{ success: boolean; room: RentalRoom }>('/rooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRoom: (roomId: string, data: Partial<{
    title: string;
    description: string;
    city: string;
    area: string;
    fullAddress: string;
    rent: number;
    roomType: string;
    amenities: string[];
    availableAt: string | null;
    status: RentalRoom['status'];
    media: Array<{ publicId: string }>;
  }>) =>
    fetchJson<{ success: boolean; room: RentalRoom }>(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteRoom: (roomId: string) =>
    fetchJson<{ success: boolean }>(`/rooms/${roomId}`, { method: 'DELETE' }),
  reorderRoomMedia: (roomId: string, mediaIds: string[]) =>
    fetchJson<{ success: boolean }>(`/rooms/${roomId}/media/order`, {
      method: 'PATCH',
      body: JSON.stringify({ mediaIds }),
    }),
  setRoomSaved: (roomId: string, isSaved: boolean) =>
    fetchJson<{ success: boolean; isSaved: boolean }>(`/rooms/${roomId}/save`, {
      method: isSaved ? 'PUT' : 'DELETE',
    }),
  contactRoomOwner: (roomId: string) =>
    fetchJson<{ success: boolean; conversationId: string; context: { type: 'ROOM'; id: string; title: string } }>(
      `/rooms/${roomId}/contact`,
      { method: 'POST' },
    ),
  createRoomInquiry: (roomId: string, message: string, idempotencyKey: string) =>
    fetchJson<{ success: boolean }>(`/rooms/${roomId}/inquiries`, {
      method: 'POST',
      body: JSON.stringify({ message, idempotencyKey }),
    }),
  getRoommateProfile: () =>
    fetchJson<{ profile: null | { budgetMin: number | null; budgetMax: number | null; moveInAt: string | null; preferences: { lifestyle: string[] }; city: string; bio: string } }>('/roommate-profile/me'),
  saveRoommateProfile: (data: {
    city: string;
    bio: string;
    budgetMin?: number | null;
    budgetMax?: number | null;
    moveInAt?: string | null;
    preferences: { lifestyle: string[] };
  }) =>
    fetchJson<{ success: boolean }>('/roommate-profile/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  findRoommates: (filters?: Record<string, string>, cursor?: string) => {
    const params = new URLSearchParams(filters);
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return fetchJson<{ profiles: Array<{
      id: string;
      user: User;
      budgetMin: number | null;
      budgetMax: number | null;
      moveInAt?: string;
      preferences: { lifestyle: string[] } | null;
      isFollowing: boolean;
    }>; nextCursor: string | null }>(`/roommates${query ? `?${query}` : ''}`);
  },
  uploadMedia: async (
    file: File,
    resourceType: 'image' | 'video',
    onProgress?: (percent: number) => void,
  ) => {
    const signed = await fetchJson<{
      upload: {
        apiKey: string;
        cloudName: string;
        timestamp: number;
        signature: string;
        folder: string;
        publicId: string;
        allowedFormats: string[];
      };
      maxBytes: number;
    }>('/media/signature', {
      method: 'POST',
      body: JSON.stringify({ resourceType, mimeType: file.type, fileSize: file.size }),
    });
    if (file.size > signed.maxBytes) throw new Error('This file exceeds the upload size limit.');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signed.upload.apiKey);
    formData.append('timestamp', String(signed.upload.timestamp));
    formData.append('signature', signed.upload.signature);
    formData.append('folder', signed.upload.folder);
    formData.append('public_id', signed.upload.publicId);
    formData.append('allowed_formats', signed.upload.allowedFormats.join(','));
    try {
      const response = await axios.post<{
        public_id: string;
        secure_url: string;
        resource_type: string;
        bytes: number;
      }>(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.upload.cloudName)}/${resourceType}/upload`,
        formData,
        { onUploadProgress: (event) => {
          if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
        } },
      );
      const asset = response.data;
      if (
        typeof asset.public_id !== 'string' ||
        asset.public_id.length === 0 ||
        typeof asset.secure_url !== 'string' ||
        asset.resource_type !== resourceType ||
        !Number.isInteger(asset.bytes) ||
        asset.bytes <= 0 ||
        asset.bytes > signed.maxBytes
      ) {
        throw new Error('Cloudinary returned an invalid uploaded asset.');
      }
      const assetUrl = new URL(asset.secure_url);
      if (
        assetUrl.protocol !== 'https:' ||
        assetUrl.hostname !== 'res.cloudinary.com' ||
        !assetUrl.pathname.startsWith(`/${signed.upload.cloudName}/${resourceType}/upload/`)
      ) {
        throw new Error('Cloudinary returned an invalid uploaded asset URL.');
      }

      const completed = await fetchJson<{ publicId: string }>('/media/complete', {
        method: 'POST',
        body: JSON.stringify({
          reservedPublicId: signed.upload.publicId,
          publicId: asset.public_id,
          resourceType,
        }),
      });
      return { publicId: completed.publicId, url: asset.secure_url };
    } catch (error) {
      if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
        throw new Error(error.response?.data?.error?.message || error.message);
      }
      throw error;
    }
  },

  // Properties
  getProperties: (params?: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson<{ properties: Property[] }>(`/properties${query ? `?${query}` : ''}`);
  },
  getPropertyById: (id: string) =>
    fetchJson<{
      property: Property;
      owner: User;
      rooms: any[];
      listings: RentalListing[];
      reels: Reel[];
      reviews: Review[];
      isSaved: boolean;
      isFollowing: boolean;
    }>(`/properties/${id}`),
  createProperty: (data: Partial<Property>) =>
    fetchJson<{ success: boolean; property: Property }>('/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateProperty: (id: string, data: Partial<Property>) =>
    fetchJson<{ success: boolean; property: Property }>(`/properties/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteProperty: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/properties/${id}`, {
      method: 'DELETE',
    }),
  getPropertyRooms: (id: string) =>
    fetchJson<{ rooms: any[] }>(`/properties/${id}/rooms`),
  addPropertyRoom: (id: string, roomData: any) =>
    fetchJson<{ success: boolean; room: any }>(`/properties/${id}/rooms`, {
      method: 'POST',
      body: JSON.stringify(roomData),
    }),

  // Listings (with 10-day lifecycle)
  getListings: (params?: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson<{ listings: RentalListing[] }>(`/listings${query ? `?${query}` : ''}`);
  },
  getListingById: (id: string) =>
    fetchJson<{
      listing: RentalListing;
      owner: User;
      property: Property;
      isSaved: boolean;
    }>(`/listings/${id}`),
  createListing: (data: Partial<RentalListing>) =>
    fetchJson<{ success: boolean; listing: RentalListing }>('/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateListing: (id: string, data: Partial<RentalListing>) =>
    fetchJson<{ success: boolean; listing: RentalListing }>(`/listings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteListing: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/listings/${id}`, {
      method: 'DELETE',
    }),
  renewListing: (id: string) =>
    fetchJson<{ success: boolean; listing: RentalListing; message: string }>(`/listings/${id}/renew`, {
      method: 'POST',
    }),
  markListingRented: (id: string) =>
    fetchJson<{ success: boolean; listing: RentalListing; message: string }>(`/listings/${id}/mark-rented`, {
      method: 'POST',
    }),
  pauseListing: (id: string) =>
    fetchJson<{ success: boolean; listing: RentalListing }>(`/listings/${id}/pause`, {
      method: 'POST',
    }),

  // Requirements (Tenant discovery)
  getRequirements: (params?: Record<string, string>) => {
    const query = new URLSearchParams(params).toString();
    return fetchJson<{ requirements: RentalRequirement[] }>(`/requirements${query ? `?${query}` : ''}`);
  },
  createRequirement: (data: Partial<RentalRequirement>) =>
    fetchJson<{ success: boolean; requirement: RentalRequirement }>('/requirements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteRequirement: (id: string) =>
    fetchJson<{ success: boolean; message: string }>(`/requirements/${id}`, {
      method: 'DELETE',
    }),
  getRequirementMatches: (id: string) =>
    fetchJson<{
      requirement: RentalRequirement;
      matches: Array<{
        property: Property;
        listing?: RentalListing;
        score: number;
        matchedCriteria: string[];
        unmatchedCriteria: string[];
        owner: User;
      }>;
    }>(`/requirements/${id}/matches`),

  // Reels
  getReels: (cursor?: string) =>
    fetchJson<{ reels: Reel[]; nextCursor: string | null }>(
      `/reels${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  createReel: (data: { caption: string; publicId: string; location?: string }) =>
    fetchJson<{ success: boolean; reel: Reel }>('/reels', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateReel: (id: string, data: { caption: string; location?: string }) =>
    fetchJson<{ success: boolean; reel: Reel }>(`/reels/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteReel: (id: string) =>
    fetchJson<{ success: boolean }>(`/reels/${id}`, {
      method: 'DELETE',
    }),
  setReelLike: (id: string, isLiked: boolean) =>
    fetchJson<{ success: boolean; isLiked: boolean; likesCount: number }>(`/reels/${id}/like`, {
      method: isLiked ? 'PUT' : 'DELETE',
    }),
  getReelComments: (id: string, cursor?: string) =>
    fetchJson<{ comments: Comment[]; nextCursor: string | null }>(
      `/reels/${id}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  addReelComment: (id: string, text: string) =>
    fetchJson<{ success: boolean; comment: Comment }>(`/reels/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  updateComment: (id: string, text: string) =>
    fetchJson<{ success: boolean }>(`/comments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  deleteComment: (id: string) =>
    fetchJson<{ success: boolean }>(`/comments/${id}`, { method: 'DELETE' }),

  // Reviews
  getPropertyReviews: (propertyId: string) =>
    fetchJson<{ reviews: Review[] }>(`/properties/${propertyId}/reviews`),
  addPropertyReview: (propertyId: string, data: { rating: number; comment: string }) =>
    fetchJson<{ success: boolean; review: Review }>(`/properties/${propertyId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // In-Person Visit Requests
  getVisitRequests: () => fetchJson<{ visits: VisitRequest[] }>('/visits'),
  createVisitRequest: (data: {
    propertyId: string;
    listingId?: string;
    ownerId: string;
    preferredDate: string;
    preferredTime: string;
    message?: string;
  }) =>
    fetchJson<{ success: boolean; visit: VisitRequest }>('/visits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateVisitRequestStatus: (id: string, status: 'ACCEPTED' | 'REJECTED' | 'COMPLETED') =>
    fetchJson<{ success: boolean; visit: VisitRequest }>(`/visits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Social & Profiles
  getPosts: (userId?: string, cursor?: string) => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (cursor) params.set('cursor', cursor);
    const query = params.toString();
    return fetchJson<{ posts: Post[]; nextCursor: string | null }>(`/posts${query ? `?${query}` : ''}`);
  },
  setPostLike: (postId: string, isLiked: boolean) =>
    fetchJson<{ success: boolean; isLiked: boolean; likesCount: number }>(`/posts/${postId}/like`, {
      method: isLiked ? 'PUT' : 'DELETE',
    }),
  setPostSave: (postId: string, isSaved: boolean) =>
    fetchJson<{ success: boolean; isSaved: boolean; savesCount: number }>(`/posts/${postId}/save`, {
      method: isSaved ? 'PUT' : 'DELETE',
    }),
  getPostComments: (postId: string, cursor?: string) =>
    fetchJson<{ comments: Comment[]; nextCursor: string | null }>(
      `/posts/${postId}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  addPostComment: (postId: string, text: string) =>
    fetchJson<{ success: boolean; comment: Comment }>(`/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  createPost: (data: {
    caption: string;
    location: string;
    publicIds: string[];
    rentAmount?: number;
    roomType?: string;
  }) =>
    fetchJson<{ success: boolean; post: Post }>('/posts', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        rent: data.rentAmount,
      }),
    }),
  deletePost: (id: string) =>
    fetchJson<{ success: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
  updatePost: (id: string, data: { caption?: string; location?: string; rent?: number | null; roomType?: string | null }) =>
    fetchJson<{ success: boolean; post: Post }>(`/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  updateMyProfile: (
    data: Omit<Partial<Pick<User, 'name' | 'username' | 'bio' | 'city' | 'locationArea' | 'occupation' | 'instituteOrCompany'>>, 'occupation'> & {
      occupation?: User['occupation'] | null;
    },
  ) =>
    fetchJson<{ user: User }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getUserProfile: (username: string) =>
    fetchJson<{
      user: User;
      isFollowing: boolean;
      posts: Post[];
      reels: Reel[];
    }>(`/users/${username}`),
  getProfileConnections: (username: string, kind: 'followers' | 'following', cursor?: string) =>
    fetchJson<{ users: Array<User & { isFollowing: boolean }>; nextCursor: string | null }>(
      `/users/${encodeURIComponent(username)}/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  setFollowing: (userId: string, isFollowing: boolean) =>
    fetchJson<{ success: boolean; isFollowing: boolean; followersCount: number }>(`/users/${userId}/follow`, {
      method: isFollowing ? 'PUT' : 'DELETE',
    }),
  toggleSave: (targetType: 'listing' | 'property' | 'reel' | 'post', targetId: string) =>
    fetchJson<{ success: boolean; isSaved: boolean }>('/social/save', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId }),
    }),
  getSavedItems: () =>
    fetchJson<{
      listings: RentalListing[];
      properties: Property[];
      reels: Reel[];
    }>('/social/saved'),

  // Messages
  getUnreadMessageCount: () =>
    fetchJson<{ unreadCount: number }>('/messages/unread-count'),
  getConversations: () => fetchJson<{ conversations: Conversation[] }>('/conversations'),
  startConversation: (targetUserId: string, context?: any) =>
    fetchJson<{ conversation: Conversation; otherUser: User }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, context }),
    }),
  getMessages: (conversationId: string, cursor?: string) =>
    fetchJson<{
      conversation: Conversation;
      otherUser: User | null;
      hasMore: boolean;
      nextCursor: string | null;
      messages: Message[];
    }>(`/conversations/${conversationId}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
  sendMessage: (data: {
    conversationId: string;
    receiverId: string;
    text: string;
    idempotencyKey: string;
    context?: any;
    imageUrl?: string;
  }) =>
    fetchJson<{ success: boolean; message: Message }>('/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Notifications
  getNotifications: (cursor?: string) =>
    fetchJson<{ notifications: Notification[]; unreadCount: number; nextCursor: string | null }>(
      `/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  markNotificationRead: (id: string) =>
    fetchJson<{ success: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    fetchJson<{ success: boolean }>('/notifications/mark-all-read', { method: 'POST' }),

  // Search
  searchGlobal: (query: string, tab = 'all') =>
    fetchJson<{
      properties: Property[];
      listings: RentalListing[];
      users: User[];
      reels: Reel[];
      requirements: RentalRequirement[];
    }>(`/search?q=${encodeURIComponent(query)}&tab=${tab}`),

  // Anti-fraud & Reports
  createReport: (data: { targetType: 'POST' | 'ROOM' | 'USER' | 'REEL'; targetId: string; reason: string; details?: string }) =>
    fetchJson<{ success: boolean; report: Report }>('/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getAdminReports: () => fetchJson<{ reports: Report[] }>('/admin/reports'),
  updateReportStatus: (id: string, status: 'RESOLVED' | 'DISMISSED') =>
    fetchJson<{ success: boolean; report: Report }>(`/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  verifyUser: (id: string, isVerified = true) =>
    fetchJson<{ success: boolean; user: User }>(`/admin/verify-user/${id}`, {
      method: 'POST',
      body: JSON.stringify({ isVerified }),
    }),

  // Admin
  getAdminUsers: () => fetchJson<{ users: User[] }>('/admin/users'),
  getAdminMetrics: () => fetchJson<any>('/admin/metrics'),
};
