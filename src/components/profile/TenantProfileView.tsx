import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  GraduationCap,
  Grid3X3,
  MapPin,
  Plus,
  Send,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import type { Post, Reel, User } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { InlineLoader, ProfileSkeleton, useDelayedFlag } from '../loading/index.ts';
import { PostDetailModal } from '../posts/PostDetailModal.tsx';

interface TenantProfileProps {
  username: string;
  refreshKey?: number;
  onBack?: () => void;
}

export const TenantProfileView: React.FC<TenantProfileProps> = ({ username, refreshKey, onBack }) => {
  const {
    currentUser,
    openChatWith,
    showToast,
    refreshUserData,
    openCreateModal,
    openUserProfile,
    realtimeSocket,
    viewParams,
  } = useApp();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<'posts' | 'reels'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [canViewContent, setCanViewContent] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [followRequests, setFollowRequests] = useState<Array<{ id: string; user: User }>>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadingVisible = useDelayedFlag(loading);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [name, setName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [occupation, setOccupation] = useState('');
  const [instituteOrCompany, setInstituteOrCompany] = useState('');
  const [isOpenToRoommates, setIsOpenToRoommates] = useState(false);
  const [connectionKind, setConnectionKind] = useState<'followers' | 'following' | null>(null);
  const [connections, setConnections] = useState<Array<User & { isFollowing: boolean }>>([]);
  const [connectionsCursor, setConnectionsCursor] = useState<string | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const connectionsLoadingVisible = useDelayedFlag(connectionsLoading);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const profileUsername = username || currentUser?.username || '';
  const isOwnProfile = Boolean(user && currentUser?.id === user.id);

  const loadProfile = useCallback(async () => {
    if (!profileUsername) {
      setUser(null);
      setPosts([]);
      setReels([]);
      setLoadError('Your profile is not available yet.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const data = await api.getUserProfile(profileUsername);
      setUser(data.user);
      setPosts(data.posts || []);
      setReels(data.reels || []);
      setIsFollowing(data.isFollowing);
      setRequestStatus(data.requestStatus);
      setCanViewContent(data.canViewContent);
      setIsPrivate(Boolean(data.user.isPrivate));
    } catch (cause) {
      console.error('Failed to load profile:', cause);
      setLoadError(cause instanceof Error ? cause.message : 'Could not load this profile.');
      setUser(null);
      setPosts([]);
      setReels([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser, profileUsername]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile, refreshKey]);

  useEffect(() => {
    if (!realtimeSocket || !user) return;
    const handlePostChanged = (change: { authorId?: string }) => {
      if (change.authorId === user.id) void loadProfile();
    };
    const handleReelChanged = (change: { authorId?: string }) => {
      if (change.authorId === user.id) void loadProfile();
    };
    const handleFollowersChanged = (change: { followersCount?: number }) => {
      if (typeof change.followersCount === 'number') {
        setUser((previous) => previous
          ? { ...previous, followersCount: change.followersCount! }
          : previous);
      }
    };
    realtimeSocket.on('post:changed', handlePostChanged);
    realtimeSocket.on('reel:changed', handleReelChanged);
    realtimeSocket.on('profile:followers-changed', handleFollowersChanged);
    return () => {
      realtimeSocket.off('post:changed', handlePostChanged);
      realtimeSocket.off('reel:changed', handleReelChanged);
      realtimeSocket.off('profile:followers-changed', handleFollowersChanged);
    };
  }, [loadProfile, realtimeSocket, user]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setUsernameInput(user.username);
    setBio(user.bio || '');
    setCity(user.city || '');
    setLocationArea(user.locationArea || '');
    setOccupation(user.occupation || '');
    setInstituteOrCompany(user.instituteOrCompany || '');
    setIsOpenToRoommates(user.isOpenToRoommates);
    setIsPrivate(Boolean(user.isPrivate));
  }, [user]);

  useEffect(() => {
    if (typeof viewParams.postId !== 'string') return;
    const post = posts.find((item) => item.id === viewParams.postId);
    if (post) setSelectedPost(post);
  }, [posts, viewParams.postId]);

  const toggleFollow = async () => {
    if (!user || isOwnProfile) return;
    try {
      const result = await api.setFollowing(user.id, !isFollowing);
      setIsFollowing(result.isFollowing);
      if ('requestStatus' in result) setRequestStatus(result.requestStatus || null);
      if (result.requestStatus === 'PENDING') { showToast('Follow request sent.', 'success'); return; }
      setCanViewContent(true);
      if (typeof result.followersCount === 'number') {
        setUser((previous) => previous ? { ...previous, followersCount: result.followersCount! } : previous);
      }
      showToast(result.isFollowing ? `Following ${user.name}` : `Unfollowed ${user.name}`, 'info');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update follow status.', 'error');
    }
  };

  const loadFollowRequests = useCallback(async () => {
    if (!isOwnProfile) return;
    setRequestsLoading(true);
    try {
      const result = await api.getFollowRequests();
      setFollowRequests(result.requests.map(({ id, user }) => ({ id, user })));
    } catch (error) {
      showToastRef.current(error instanceof Error ? error.message : 'Could not load follow requests.', 'error');
    } finally { setRequestsLoading(false); }
  }, [isOwnProfile]);

  useEffect(() => { void loadFollowRequests(); }, [loadFollowRequests]);

  const respondToRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await api.respondToFollowRequest(requestId, action);
      setFollowRequests((items) => items.filter((item) => item.id !== requestId));
      if (action === 'accept') await loadProfile();
      showToast(action === 'accept' ? 'Follow request accepted.' : 'Follow request declined.', 'success');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Could not update follow request.', 'error'); }
  };

  const loadConnections = useCallback(async (cursor?: string) => {
    if (!connectionKind) return;
    setConnectionsLoading(true);
    try {
      const result = await api.getProfileConnections(profileUsername, connectionKind, cursor);
      setConnections((items) => cursor ? [...items, ...result.users] : result.users);
      setConnectionsCursor(result.nextCursor);
    } catch (cause) {
      showToastRef.current(cause instanceof Error ? cause.message : 'Could not load profile connections.', 'error');
    } finally {
      setConnectionsLoading(false);
    }
  }, [connectionKind, profileUsername]);

  useEffect(() => {
    if (!connectionKind) return;
    setConnections([]);
    setConnectionsCursor(null);
    void loadConnections();
  }, [connectionKind, loadConnections]);

  const toggleConnectionFollow = async (connection: User & { isFollowing: boolean }) => {
    try {
      const result = await api.setFollowing(connection.id, !connection.isFollowing);
      setConnections((items) => items.map((item) => item.id === connection.id
        ? { ...item, isFollowing: result.isFollowing, followersCount: result.followersCount }
        : item));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update follow status.', 'error');
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const result = await api.updateMyProfile({
        name,
        username: usernameInput,
        bio,
        city,
        locationArea,
        occupation: occupation ? occupation as User['occupation'] : null,
        instituteOrCompany,
        isOpenToRoommates,
        isPrivate,
      });
      setUser(result.user);
      await refreshUserData();
      setIsEditing(false);
      if (result.user.username !== profileUsername) openUserProfile(result.user.username);
      showToast('Profile updated.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return loadingVisible ? <ProfileSkeleton /> : null;

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm font-semibold text-zinc-200">Could not load profile</p>
        <p className="mt-2 text-xs text-zinc-400">{loadError || 'Profile not found.'}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => void loadProfile()}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-700"
          >
            Try again
          </button>
          {onBack && (
            <button onClick={onBack} className="rounded-xl px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800">
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-3 pb-24 pt-4 sm:px-6 sm:pt-8 lg:px-8">
      {onBack && (
        <button onClick={onBack} className="mb-4 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-white">
          Back
        </button>
      )}
      {loadError && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Profile could not be refreshed: {loadError}
        </div>
      )}

      <header className="rounded-3xl border border-zinc-800/90 bg-zinc-900/65 p-4 shadow-2xl shadow-black/10 sm:p-6 lg:p-8">
        <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:gap-7 lg:gap-9">
          <div className="flex shrink-0 justify-center sm:justify-start">
            <div className="h-24 w-24 rounded-full bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-600 p-[3px] shadow-xl shadow-rose-950/30 sm:h-28 sm:w-28 lg:h-32 lg:w-32">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-full w-full rounded-full border-[3px] border-zinc-950 object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border-[3px] border-zinc-950 bg-zinc-800 text-4xl font-black text-white">
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center justify-center gap-2 sm:justify-start">
                  <h1 className="break-words text-xl font-black tracking-tight text-white sm:text-2xl">{user.name}</h1>
                  {user.isVerified && <ShieldCheck className="h-5 w-5 text-sky-400" aria-label="Verified" />}
                </div>
                <p className="mt-1 text-sm text-zinc-500">@{user.username}</p>
              </div>
              <div className="hidden gap-2 sm:flex">
                {isOwnProfile && <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">Member profile</span>}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950/40 py-3 sm:mt-6 sm:py-4">
              <p className="text-center text-[10px] uppercase tracking-wider text-zinc-500"><strong className="block text-lg tracking-normal text-white">{posts.length}</strong>posts</p>
              <button onClick={() => setConnectionKind('followers')} className="text-center text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white">
                <strong className="block text-lg tracking-normal text-white">{user.followersCount}</strong>followers
              </button>
              <button onClick={() => setConnectionKind('following')} className="text-center text-[10px] uppercase tracking-wider text-zinc-500 hover:text-white">
                <strong className="block text-lg tracking-normal text-white">{user.followingCount}</strong>following
              </button>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              {user.bio && <p className="mx-auto max-w-2xl whitespace-pre-wrap leading-relaxed text-zinc-200 sm:mx-0">{user.bio}</p>}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-zinc-400 sm:justify-start">
                {(user.locationArea || user.city) && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-rose-400" />{[user.locationArea, user.city].filter(Boolean).join(', ')}</span>}
                {(user.instituteOrCompany || user.occupation) && <span className="inline-flex items-center gap-1.5">{user.occupation === 'STUDENT' ? <GraduationCap className="h-3.5 w-3.5 text-amber-400" /> : <Briefcase className="h-3.5 w-3.5 text-sky-400" />}{user.instituteOrCompany || user.occupation?.replaceAll('_', ' ').toLowerCase()}</span>}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isOwnProfile && (followRequests.length > 0 || requestsLoading) && (
        <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><h2 className="text-sm font-bold text-white">Follow requests</h2><span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-300">{followRequests.length}</span></div>
          {requestsLoading ? <p className="px-4 py-5 text-xs text-zinc-400">Loading requests…</p> : followRequests.map(({ id, user: requester }) => (
            <div key={id} className="flex items-center gap-3 border-b border-zinc-800/70 px-4 py-3 last:border-0">
              <button onClick={() => openUserProfile(requester.username)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-white">{requester.name.slice(0,1)}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{requester.name}</span><span className="block truncate text-xs text-zinc-500">@{requester.username}</span></span>
              </button>
              <button onClick={() => void respondToRequest(id, 'reject')} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300">Decline</button>
              <button onClick={() => void respondToRequest(id, 'accept')} className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white">Accept</button>
            </div>
          ))}
        </section>
      )}

      <div className="mx-auto mt-4 flex w-full max-w-2xl flex-col gap-2 sm:mt-5 sm:flex-row sm:justify-end">
        {isOwnProfile ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-zinc-500 hover:bg-zinc-700 sm:max-w-56"
            >
              Edit profile
            </button>
            <button
              onClick={() => openCreateModal('post')}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 sm:max-w-56"
            >
              Share a room
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => void toggleFollow()}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                isFollowing || requestStatus === 'PENDING' ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {isFollowing ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                {isFollowing ? 'Following' : requestStatus === 'PENDING' ? 'Requested' : 'Follow'}
              </span>
            </button>
            {(!isPrivate || isFollowing) && (
            <button
              onClick={() => void openChatWith(user.id)}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-700"
            >
              <span className="inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Message
              </span>
            </button>
            )}
          </>
        )}
      </div>

      {!canViewContent && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-rose-400" />
          <h2 className="mt-3 text-lg font-bold text-white">This account is private</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">Follow this account and wait for approval to see their posts and reels or send a message.</p>
        </section>
      )}
      {canViewContent && (
      <>
      <div role="tablist" aria-label="Profile content" className="mb-5 flex w-full justify-center border-b border-zinc-800/80">
        <button
          id="profile-posts-tab"
          type="button"
          role="tab"
          aria-selected={activeContentTab === 'posts'}
          aria-controls="profile-posts-panel"
          onClick={() => setActiveContentTab('posts')}
          className={`relative flex min-h-12 w-36 items-center justify-center gap-2 border-b-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition sm:w-40 ${
            activeContentTab === 'posts'
              ? 'border-rose-400 text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          <Grid3X3 className="h-4 w-4" />
          Posts
        </button>
        <button
          id="profile-reels-tab"
          type="button"
          role="tab"
          aria-selected={activeContentTab === 'reels'}
          aria-controls="profile-reels-panel"
          onClick={() => setActiveContentTab('reels')}
          className={`relative flex min-h-12 min-w-32 items-center justify-center gap-2 border-b-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
            activeContentTab === 'reels'
              ? 'border-rose-400 text-zinc-100'
              : 'border-transparent text-zinc-500 hover:text-zinc-200'
          }`}
        >
          <Video className="h-4 w-4" />
          Reels
        </button>
      </div>

      {activeContentTab === 'posts' ? (
        <section id="profile-posts-panel" role="tabpanel" aria-labelledby="profile-posts-tab">
          {posts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {posts.map((post) => (
                <button key={post.id} type="button" onClick={() => setSelectedPost(post)} aria-label={`Open post: ${post.caption || 'Room post'}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-left shadow-lg shadow-black/10">
                  {post.images?.[0] && (
                    <img
                      src={post.images[0]}
                      alt={post.caption}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="line-clamp-2 text-[10px] font-semibold text-white">{post.caption}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <h2 className="text-sm font-semibold text-zinc-200">No room posts yet</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {isOwnProfile ? 'Share room photos to start your profile.' : 'Room photos shared by this person will appear here.'}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => openCreateModal('post')}
                  className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Create your first post
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <section id="profile-reels-panel" role="tabpanel" aria-labelledby="profile-reels-tab">
          {isOwnProfile && (
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => openCreateModal('reel')}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-2.5 text-xs font-bold text-white transition hover:brightness-110"
              >
                <Plus className="h-4 w-4" />
                Upload room reel
              </button>
            </div>
          )}
          {reels.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 sm:gap-5">
              {reels.map((reel) => (
                <div key={reel.id} className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg shadow-black/10">
                  <video
                    src={reel.videoUrl}
                    poster={reel.thumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={reel.caption || 'Room reel'}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {reel.caption && (
                    <p className="pointer-events-none absolute inset-x-0 bottom-10 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-5 text-[10px] font-medium text-white">
                      {reel.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <h2 className="text-sm font-semibold text-zinc-200">No reels yet</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Room tours shared by this person will appear here.
              </p>
            </div>
          )}
        </section>
      )}

      {connectionKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setConnectionKind(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={connectionKind === 'followers' ? 'Followers' : 'Following'}
            className="flex max-h-[75vh] w-full max-w-sm flex-col rounded-2xl border border-zinc-800 bg-zinc-950"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h2 className="text-sm font-bold text-white">{connectionKind === 'followers' ? 'Followers' : 'Following'}</h2>
              <button onClick={() => setConnectionKind(null)} aria-label="Close connections" className="rounded-lg p-1 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-32 flex-1 space-y-2 overflow-y-auto p-3">
              {connections.map((connection) => (
                <div key={connection.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-zinc-900">
                  <button onClick={() => { setConnectionKind(null); openUserProfile(connection.username); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    {connection.avatar
                      ? <img src={connection.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                      : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold">{connection.name.slice(0, 1)}</span>}
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-white">{connection.name}</span>
                      <span className="block truncate text-[10px] text-zinc-500">@{connection.username}</span>
                    </span>
                  </button>
                  {connection.id !== currentUser?.id && (
                    <button onClick={() => void toggleConnectionFollow(connection)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-zinc-700">
                      {connection.isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              ))}
              {connections.length === 0 && !connectionsLoading && (
                <p className="py-8 text-center text-xs text-zinc-500">No {connectionKind} to show.</p>
              )}
              {connectionsLoadingVisible && <div className="flex justify-center py-4"><InlineLoader /></div>}
            </div>
            {connectionsCursor && (
              <button disabled={connectionsLoading} onClick={() => void loadConnections(connectionsCursor)} className="border-t border-zinc-800 py-3 text-xs font-semibold text-zinc-300 disabled:opacity-50">
                Load more
              </button>
            )}
          </section>
        </div>
      )}

      </>
      )}

      {selectedPost && <PostDetailModal post={selectedPost} onClose={() => setSelectedPost(null)} />}

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setIsEditing(false)}>
          <form
            onSubmit={saveProfile}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Edit profile</h2>
              <button type="button" onClick={() => setIsEditing(false)} aria-label="Close" className="text-zinc-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-300">
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
              </label>
              <label className="text-xs text-zinc-300">
                Username
                <input value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
              </label>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <span>
                <span className="block text-sm font-semibold text-white">Open to Roommates</span>
                <span className="mt-1 block text-xs text-zinc-400">Allow other users to discover you as a potential roommate.</span>
              </span>
              <input
                type="checkbox"
                checked={isOpenToRoommates}
                onChange={(event) => setIsOpenToRoommates(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors ${isOpenToRoommates ? 'bg-gradient-to-r from-rose-500 to-orange-500' : 'bg-zinc-700'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${isOpenToRoommates ? 'translate-x-5' : 'translate-x-0'}`} />
              </span>
              <span className="sr-only">{isOpenToRoommates ? 'On' : 'Off'}</span>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <span><span className="block text-sm font-semibold text-white">Private account</span><span className="mt-1 block text-xs text-zinc-400">Only approved followers can see your posts, reels and message you.</span></span>
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="h-5 w-5 accent-rose-500" />
            </label>
            <p className="text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {isOpenToRoommates ? 'On' : 'Off'}
            </p>
            <label className="block text-xs text-zinc-300">
              Bio
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-300">
                City
                <input value={city} onChange={(event) => setCity(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
              </label>
              <label className="text-xs text-zinc-300">
                Area
                <input value={locationArea} onChange={(event) => setLocationArea(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
              </label>
              <label className="text-xs text-zinc-300">
                I am a
                <select value={occupation} onChange={(event) => setOccupation(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white">
                  <option value="">Prefer not to say</option>
                  <option value="STUDENT">Student</option>
                  <option value="WORKING_PROFESSIONAL">Working professional</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="text-xs text-zinc-300">
                School or workplace
                <input value={instituteOrCompany} onChange={(event) => setInstituteOrCompany(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-xs text-white" />
              </label>
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-sky-600 py-2.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
