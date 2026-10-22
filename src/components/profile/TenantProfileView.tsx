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
  } = useApp();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeContentTab, setActiveContentTab] = useState<'posts' | 'reels'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [occupation, setOccupation] = useState('');
  const [instituteOrCompany, setInstituteOrCompany] = useState('');
  const [connectionKind, setConnectionKind] = useState<'followers' | 'following' | null>(null);
  const [connections, setConnections] = useState<Array<User & { isFollowing: boolean }>>([]);
  const [connectionsCursor, setConnectionsCursor] = useState<string | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
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
  }, [user]);

  const toggleFollow = async () => {
    if (!user || isOwnProfile) return;
    try {
      const result = await api.setFollowing(user.id, !isFollowing);
      setIsFollowing(result.isFollowing);
      setUser((previous) => previous
        ? { ...previous, followersCount: result.followersCount }
        : previous);
      showToast(result.isFollowing ? `Following ${user.name}` : `Unfollowed ${user.name}`, 'info');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update follow status.', 'error');
    }
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

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
        <p className="text-xs text-zinc-400">Loading profile...</p>
      </div>
    );
  }

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
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-8">
      {onBack && (
        <button onClick={onBack} className="mb-5 text-xs font-medium text-zinc-400 hover:text-white">
          Back
        </button>
      )}
      {loadError && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
          Profile could not be refreshed: {loadError}
        </div>
      )}

      <header className="flex flex-col gap-6 border-b border-zinc-800/80 pb-8 sm:flex-row sm:gap-12 sm:px-8 sm:pb-10">
        <div className="flex shrink-0 justify-center sm:w-56 sm:pt-2">
          <div className="h-28 w-28 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[3px] sm:h-36 sm:w-36">
            <img
              src={user.avatar}
              alt={user.name}
              className="h-full w-full rounded-full border-[3px] border-zinc-950 object-cover"
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-normal tracking-normal text-white">{user.username}</h1>
              {user.isVerified && <ShieldCheck className="h-5 w-5 text-sky-400" aria-label="Verified" />}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {isOwnProfile ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 sm:flex-none"
                  >
                    Edit profile
                  </button>
                  <button
                    onClick={() => openCreateModal('post')}
                    className="flex-1 rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 sm:flex-none"
                  >
                    Share a room
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void toggleFollow()}
                    className={`flex-1 rounded-lg px-4 py-1.5 text-xs font-semibold sm:flex-none ${
                      isFollowing ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-sky-600 text-white hover:bg-sky-500'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {isFollowing ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                      {isFollowing ? 'Following' : 'Follow'}
                    </span>
                  </button>
                  <button
                    onClick={() => void openChatWith(user.id)}
                    className="flex-1 rounded-lg bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 sm:flex-none"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5" />
                      Message
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-center gap-8 text-xs sm:justify-start sm:gap-10">
            <p><strong className="text-white">{posts.length}</strong> posts</p>
            <button onClick={() => setConnectionKind('followers')} className="hover:text-white">
              <strong className="text-white">{user.followersCount}</strong> followers
            </button>
            <button onClick={() => setConnectionKind('following')} className="hover:text-white">
              <strong className="text-white">{user.followingCount}</strong> following
            </button>
          </div>

          <div className="mt-5 space-y-1 text-xs">
            <p className="font-semibold text-white">{user.name}</p>
            {user.bio && <p className="whitespace-pre-wrap text-zinc-200">{user.bio}</p>}
            {(user.locationArea || user.city) && (
              <p className="flex items-center justify-center gap-1 text-zinc-400 sm:justify-start">
                <MapPin className="h-3.5 w-3.5 text-rose-400" />
                {[user.locationArea, user.city].filter(Boolean).join(', ')}
              </p>
            )}
            {(user.instituteOrCompany || user.occupation) && (
              <p className="flex items-center justify-center gap-1 text-zinc-400 sm:justify-start">
                {user.occupation === 'STUDENT'
                  ? <GraduationCap className="h-3.5 w-3.5 text-amber-400" />
                  : <Briefcase className="h-3.5 w-3.5 text-sky-400" />}
                {user.instituteOrCompany || user.occupation?.replaceAll('_', ' ').toLowerCase()}
              </p>
            )}
          </div>
        </div>
      </header>

      <div role="tablist" aria-label="Profile content" className="mb-5 flex justify-center border-b border-zinc-800/80">
        <button
          id="profile-posts-tab"
          type="button"
          role="tab"
          aria-selected={activeContentTab === 'posts'}
          aria-controls="profile-posts-panel"
          onClick={() => setActiveContentTab('posts')}
          className={`flex min-h-12 min-w-32 items-center justify-center gap-2 border-t-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
            activeContentTab === 'posts'
              ? 'border-zinc-100 text-zinc-100'
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
          className={`flex min-h-12 min-w-32 items-center justify-center gap-2 border-t-2 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
            activeContentTab === 'reels'
              ? 'border-zinc-100 text-zinc-100'
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
            <div className="grid grid-cols-3 gap-1 sm:gap-5">
              {posts.map((post) => (
                <div key={post.id} className="group relative aspect-square overflow-hidden bg-zinc-900">
                  <img
                    src={post.images[0]}
                    alt={post.caption}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="line-clamp-2 text-[10px] font-semibold text-white">{post.caption}</span>
                  </div>
                </div>
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
                <div key={reel.id} className="relative aspect-square overflow-hidden bg-zinc-900">
                  <video
                    src={reel.videoUrl}
                    poster={reel.thumbnailUrl || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={reel.caption || 'Room reel'}
                    className="h-full w-full object-cover"
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
              {connectionsLoading && <p className="py-4 text-center text-xs text-zinc-500">Loading…</p>}
            </div>
            {connectionsCursor && (
              <button disabled={connectionsLoading} onClick={() => void loadConnections(connectionsCursor)} className="border-t border-zinc-800 py-3 text-xs font-semibold text-zinc-300 disabled:opacity-50">
                Load more
              </button>
            )}
          </section>
        </div>
      )}

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
