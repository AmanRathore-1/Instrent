
import React, { useCallback, useEffect, useState } from 'react';
import {
  Heart,
  MapPin,
  MessageCircle,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import type { Reel } from '../../types/client.ts';

export const ReelsView: React.FC = () => {
  const { currentUser, openUserProfile, showToast } = useApp();

  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [editingReelId, setEditingReelId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [savingReelId, setSavingReelId] = useState<string | null>(null);
  const [deletingReelId, setDeletingReelId] = useState<string | null>(null);

  const loadReels = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);

    setError('');

    try {
      const result = await api.getReels();
      setReels(result.reels);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load reels.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReels(true);

    const interval = window.setInterval(() => {
      void loadReels();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [loadReels]);

  const startEditing = (reel: Reel) => {
    setEditingReelId(reel.id);
    setEditedCaption(reel.caption);
    setEditedLocation(reel.location);
  };

  const cancelEditing = () => {
    setEditingReelId(null);
    setEditedCaption('');
    setEditedLocation('');
  };

  const saveCaption = async (reelId: string) => {
    const caption = editedCaption.trim();
    if (!caption) {
      showToast('A reel caption cannot be empty.', 'warning');
      return;
    }

    setSavingReelId(reelId);
    try {
      const result = await api.updateReel(reelId, {
        caption,
        location: editedLocation.trim(),
      });
      setReels((items) => items.map((item) => item.id === reelId ? result.reel : item));
      cancelEditing();
      showToast('Reel caption updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update this reel.', 'error');
    } finally {
      setSavingReelId(null);
    }
  };

  const deleteReel = async (reel: Reel) => {
    if (!window.confirm('Delete this reel? This action cannot be undone.')) return;

    setDeletingReelId(reel.id);
    try {
      await api.deleteReel(reel.id);
      setReels((items) => items.filter((item) => item.id !== reel.id));
      if (editingReelId === reel.id) cancelEditing();
      showToast('Reel deleted.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this reel.', 'error');
    } finally {
      setDeletingReelId(null);
    }
  };

  return (
    <main className="min-h-screen bg-black px-4 py-6 pb-24 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <header className="mb-7 flex items-center justify-between gap-4 border-b border-zinc-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Video className="h-6 w-6 text-rose-400" />
              <h1 className="text-2xl font-extrabold sm:text-3xl">
                Room Reels
              </h1>
            </div>

            <p className="mt-2 text-sm text-zinc-400">
              Discover room tours shared by the RentReel community.
            </p>
          </div>

        </header>

        {/* Loading */}
        {loading && (
          <div className="flex min-h-72 items-center justify-center">
            <RefreshCw className="h-7 w-7 animate-spin text-rose-400" />
            <span className="ml-3 text-sm text-zinc-400">
              Loading reels...
            </span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-rose-300">{error}</p>
            <button
              type="button"
              onClick={() => void loadReels(true)}
              className="mt-4 rounded-lg bg-zinc-800 px-5 py-2 text-sm hover:bg-zinc-700"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && reels.length === 0 && (
          <div className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 px-5 text-center">
            <div className="mb-5 rounded-full bg-zinc-900 p-5">
              <Camera className="h-10 w-10 text-zinc-500" />
            </div>

            <h2 className="text-xl font-bold">No reels yet</h2>

            <p className="mt-2 max-w-md text-sm text-zinc-400">
              Room tours uploaded by you and other members will appear here.
            </p>

          </div>
        )}

        {/* All users' reels */}
        {!loading && !error && reels.length > 0 && (
          <>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Explore reels
              </h2>

              <button
                type="button"
                onClick={() => void loadReels()}
                disabled={refreshing}
                aria-label="Refresh reels"
                className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {reels.map((reel) => {
                const owner = reel.owner;

                return (
                  <article
                    key={reel.id}
                    className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 transition hover:border-zinc-600"
                  >
                    {/* Video player */}
                    <div className="relative aspect-[9/14] overflow-hidden bg-zinc-900">
                      {reel.videoUrl ? (
                        <video
                          src={reel.videoUrl}
                          poster={reel.thumbnailUrl || undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                          <Video className="h-12 w-12" />
                          <p className="text-xs">
                            Video unavailable
                          </p>
                        </div>
                      )}
                    </div>

                    {/* User profile */}
                    <div className="p-4">
                      <button
                        type="button"
                        onClick={() => {
                          if (owner?.username) {
                            openUserProfile(owner.username);
                          }
                        }}
                        disabled={!owner?.username}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        {owner?.avatar ? (
                          <img
                            src={owner.avatar}
                            alt={owner.name || 'User profile'}
                            loading="lazy"
                            className="h-11 w-11 shrink-0 rounded-full border border-zinc-700 object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-lg font-bold">
                            {owner?.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">
                            {owner?.name || 'RentReel member'}
                          </p>

                          <p className="truncate text-xs text-zinc-500">
                            {owner?.username
                              ? `@${owner.username}`
                              : 'Community member'}
                          </p>
                        </div>
                      </button>

                      {/* Caption */}
                      {editingReelId === reel.id ? (
                        <div className="mt-4">
                          <label htmlFor={`reel-caption-${reel.id}`} className="sr-only">
                            Edit reel caption
                          </label>
                          <textarea
                            id={`reel-caption-${reel.id}`}
                            value={editedCaption}
                            onChange={(event) => setEditedCaption(event.target.value)}
                            maxLength={2200}
                            rows={4}
                            disabled={savingReelId === reel.id}
                            className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500 disabled:opacity-60"
                          />
                          <label
                            htmlFor={`reel-location-${reel.id}`}
                            className="mt-3 block text-xs font-medium text-zinc-400"
                          >
                            Location
                          </label>
                          <input
                            id={`reel-location-${reel.id}`}
                            value={editedLocation}
                            onChange={(event) => setEditedLocation(event.target.value)}
                            maxLength={120}
                            disabled={savingReelId === reel.id}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-rose-500 disabled:opacity-60"
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-500">{editedCaption.length}/2200</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={cancelEditing}
                                disabled={savingReelId === reel.id}
                                className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs hover:bg-zinc-700 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void saveCaption(reel.id)}
                                disabled={savingReelId === reel.id || !editedCaption.trim()}
                                className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold hover:bg-rose-500 disabled:opacity-50"
                              >
                                <Save className="h-3.5 w-3.5" />
                                {savingReelId === reel.id ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : reel.caption ? (
                        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
                          {reel.caption}
                        </p>
                      ) : null}

                      {/* Location and rent */}
                      {(reel.location || reel.rentAmount != null) && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          {reel.location && (
                            <p className="flex min-w-0 items-center gap-1.5 text-xs text-zinc-400">
                              <MapPin className="h-4 w-4 shrink-0 text-rose-400" />
                              <span className="truncate">
                                {reel.location}
                              </span>
                            </p>
                          )}

                          {reel.rentAmount != null && (
                            <p className="text-sm font-bold text-emerald-400">
                              ₹{reel.rentAmount.toLocaleString('en-IN')}/mo
                            </p>
                          )}
                        </div>
                      )}

                      {/* Reel engagement */}
                      <div className="mt-4 flex items-center gap-5 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Heart className="h-4 w-4 text-rose-400" />
                          {reel.likesCount ?? 0}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <MessageCircle className="h-4 w-4" />
                          {reel.commentsCount ?? 0}
                        </span>
                      </div>

                      {currentUser?.id === reel.ownerId && (
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(reel)}
                            disabled={Boolean(savingReelId || deletingReelId)}
                            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit caption
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteReel(reel)}
                            disabled={deletingReelId === reel.id || Boolean(savingReelId)}
                            className="flex items-center justify-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300 hover:bg-red-950/50 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingReelId === reel.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default ReelsView;
