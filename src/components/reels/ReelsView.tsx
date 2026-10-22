import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Heart, MessageCircle, Pause, Play, Share2, Volume2, VolumeX, X } from 'lucide-react';
import type { Comment, Reel } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

export const ReelsView: React.FC = () => {
  const { currentUser, openUserProfile, openCreateModal, showToast, realtimeSocket } = useApp();
  const [reels, setReels] = useState<Reel[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeReelId, setActiveReelId] = useState('');
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [commentsReelId, setCommentsReelId] = useState('');
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const loadMoreMarker = useRef<HTMLDivElement>(null);
  const videoElements = useRef(new Map<string, HTMLVideoElement>());
  const showToastRef = useRef(showToast);
  const loadingMore = useRef(false);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const loadReels = useCallback(async (cursor?: string) => {
    if (cursor && loadingMore.current) return;
    if (cursor) loadingMore.current = true;
    if (!cursor) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await api.getReels(cursor);
      setReels((items) => cursor
        ? [...items, ...response.reels.filter((reel) => !items.some((item) => item.id === reel.id))]
        : response.reels);
      setNextCursor(response.nextCursor);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load reels.';
      setError(message);
      showToastRef.current(message, 'error');
    } finally {
      setLoading(false);
      if (cursor) loadingMore.current = false;
    }
  }, []);

  useEffect(() => {
    void loadReels();
  }, [loadReels]);

  useEffect(() => {
    const root = scroller.current;
    if (!root || reels.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const id = (entry.target as HTMLElement).dataset.reelId;
        if (!id) return;
        const itemVideo = videoElements.current.get(id);
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          setActiveReelId(id);
          setIsPlaying(true);
          if (itemVideo) void itemVideo.play().catch(() => setIsPlaying(false));
        } else {
          itemVideo?.pause();
        }
      });
    }, { root, threshold: [0.65] });
    root.querySelectorAll('[data-reel-id]').forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [reels]);

  useEffect(() => {
    if (!nextCursor || !loadMoreMarker.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadReels(nextCursor);
    }, { rootMargin: '500px 0px' });
    observer.observe(loadMoreMarker.current);
    return () => observer.disconnect();
  }, [loadReels, nextCursor]);

  useEffect(() => {
    if (!realtimeSocket) return;
    const reload = () => void loadReels();
    realtimeSocket.on('reel:changed', reload);
    return () => {
      realtimeSocket.off('reel:changed', reload);
    };
  }, [loadReels, realtimeSocket]);

  useEffect(() => {
    const reelId = window.location.hash.startsWith('#reel=')
      ? decodeURIComponent(window.location.hash.slice(6))
      : '';
    if (!reelId || !reels.some((reel) => reel.id === reelId)) return;
    document.getElementById(`reel-${reelId}`)?.scrollIntoView({ block: 'start' });
    setActiveReelId(reelId);
  }, [reels]);

  const toggleLike = async (reel: Reel) => {
    try {
      const result = await api.setReelLike(reel.id, !reel.isLiked);
      setReels((items) => items.map((item) => item.id === reel.id
        ? { ...item, isLiked: result.isLiked, likesCount: result.likesCount }
        : item));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update this like.', 'error');
    }
  };

  const openComments = async (reelId: string) => {
    setCommentsReelId(reelId);
    setComments([]);
    try {
      const result = await api.getReelComments(reelId);
      setComments(result.comments);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not load comments.', 'error');
    }
  };

  const addComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentsReelId || !commentText.trim() || commentBusy) return;
    setCommentBusy(true);
    try {
      const result = await api.addReelComment(commentsReelId, commentText.trim());
      setComments((items) => [...items, result.comment]);
      setReels((items) => items.map((reel) => reel.id === commentsReelId
        ? { ...reel, commentsCount: reel.commentsCount + 1 }
        : reel));
      setCommentText('');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not post your comment.', 'error');
    } finally {
      setCommentBusy(false);
    }
  };

  const shareReel = async (reel: Reel) => {
    const url = new URL(window.location.href);
    url.hash = `reel=${encodeURIComponent(reel.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'RentReel', text: reel.caption, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        showToast('Reel link copied.', 'success');
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name !== 'AbortError') {
        showToast('Could not share this reel.', 'error');
      }
    }
  };

  const deleteReel = async (reel: Reel) => {
    if (!window.confirm('Delete this reel?')) return;
    try {
      await api.deleteReel(reel.id);
      setReels((items) => items.filter((item) => item.id !== reel.id));
      showToast('Reel deleted.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not delete this reel.', 'error');
    }
  };

  const togglePlayback = (reel: Reel) => {
    const itemVideo = videoElements.current.get(reel.id);
    if (!itemVideo) return;
    if (itemVideo.paused) {
      void itemVideo.play().then(() => setIsPlaying(true)).catch(() => {
        showToast('Playback could not start. Tap the video to try again.', 'warning');
      });
    } else {
      itemVideo.pause();
      setIsPlaying(false);
    }
  };

  if (loading && reels.length === 0) {
    return <div className="mx-auto max-w-3xl animate-pulse p-8 text-center text-sm text-zinc-400">Loading reels...</div>;
  }

  if (error && reels.length === 0) {
    return (
      <section className="mx-auto max-w-xl p-8 text-center">
        <p className="text-sm text-rose-300">{error}</p>
        <button onClick={() => void loadReels()} className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold">Try again</button>
      </section>
    );
  }

  return (
    <section className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div>
          <h1 className="text-sm font-bold text-white">Room reels</h1>
          <p className="text-[10px] text-zinc-500">Real room tours shared by RentReel members</p>
        </div>
        <button onClick={() => openCreateModal('reel')} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500">
          <Camera className="h-4 w-4" /> Create reel
        </button>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto scroll-smooth">
        {reels.map((reel) => (
          <article
            key={reel.id}
            id={`reel-${reel.id}`}
            data-reel-id={reel.id}
            className="relative mx-auto h-[calc(100dvh-7rem)] min-h-[32rem] w-full max-w-lg snap-start overflow-hidden bg-black sm:my-3 sm:rounded-2xl"
          >
            <video
              ref={(element) => {
                if (element) videoElements.current.set(reel.id, element);
                else videoElements.current.delete(reel.id);
              }}
              src={reel.videoUrl}
              poster={reel.thumbnailUrl}
              playsInline
              muted={isMuted}
              loop
              preload={activeReelId === reel.id ? 'auto' : 'none'}
              onClick={() => togglePlayback(reel)}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <button
                onClick={() => reel.owner && openUserProfile(reel.owner.username)}
                className="flex items-center gap-2 text-left"
              >
                {reel.owner?.avatar
                  ? <img src={reel.owner.avatar} alt="" loading="lazy" decoding="async" className="h-9 w-9 rounded-full border border-white/60 object-cover" />
                  : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold">{reel.owner?.name.slice(0, 1) || '?'}</span>}
                <span className="text-xs font-semibold text-white">{reel.owner?.name || 'Member'}</span>
              </button>
              {currentUser?.id === reel.ownerId && (
                <button onClick={() => void deleteReel(reel)} aria-label="Delete your reel" className="rounded-full bg-black/40 p-2 text-white hover:bg-rose-600">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="absolute inset-y-1/3 right-3 flex flex-col items-center gap-5">
              <button onClick={() => void toggleLike(reel)} aria-label={reel.isLiked ? 'Unlike reel' : 'Like reel'} className="flex flex-col items-center gap-1 text-white">
                <Heart className={`h-7 w-7 drop-shadow ${reel.isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                <span className="text-[10px] font-semibold">{reel.likesCount}</span>
              </button>
              <button onClick={() => void openComments(reel.id)} aria-label="Open comments" className="flex flex-col items-center gap-1 text-white">
                <MessageCircle className="h-7 w-7 drop-shadow" />
                <span className="text-[10px] font-semibold">{reel.commentsCount}</span>
              </button>
              <button onClick={() => void shareReel(reel)} aria-label="Share reel" className="rounded-full p-1 text-white">
                <Share2 className="h-6 w-6 drop-shadow" />
              </button>
              <button onClick={() => setIsMuted((muted) => !muted)} aria-label={isMuted ? 'Unmute reel' : 'Mute reel'} className="rounded-full p-1 text-white">
                {isMuted ? <VolumeX className="h-6 w-6 drop-shadow" /> : <Volume2 className="h-6 w-6 drop-shadow" />}
              </button>
              <button onClick={() => togglePlayback(reel)} aria-label={isPlaying && activeReelId === reel.id ? 'Pause reel' : 'Play reel'} className="rounded-full p-1 text-white">
                {isPlaying && activeReelId === reel.id ? <Pause className="h-6 w-6 drop-shadow" /> : <Play className="h-6 w-6 drop-shadow" />}
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 p-4 pr-16">
              <p className="whitespace-pre-wrap text-sm font-medium text-white drop-shadow">{reel.caption}</p>
              <p className="mt-1 text-[10px] text-zinc-200">{new Date(reel.createdAt).toLocaleDateString()}</p>
            </div>
          </article>
        ))}
        {reels.length === 0 && !loading && (
          <div className="grid min-h-full place-content-center px-6 text-center">
            <Camera className="mx-auto h-10 w-10 text-zinc-600" />
            <p className="mt-3 text-sm font-semibold text-white">No reels yet</p>
            <p className="mt-1 text-xs text-zinc-400">Room tours members share will appear here.</p>
          </div>
        )}
        {nextCursor && <div ref={loadMoreMarker} className="h-8 text-center text-xs text-zinc-500">{loading ? 'Loading more reels…' : ''}</div>}
      </div>

      {commentsReelId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setCommentsReelId('')}>
          <section role="dialog" aria-modal="true" aria-label="Reel comments" className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-t-2xl border border-zinc-800 bg-zinc-950 p-4 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold">Comments</h2>
              <button onClick={() => setCommentsReelId('')} aria-label="Close comments"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-24 flex-1 space-y-3 overflow-y-auto py-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-2 text-xs">
                  <span className="font-semibold text-white">{comment.userName}</span>
                  <span className="min-w-0 break-words text-zinc-300">{comment.text}</span>
                </div>
              ))}
              {comments.length === 0 && <p className="py-6 text-center text-xs text-zinc-500">Be the first to comment.</p>}
            </div>
            <form onSubmit={(event) => void addComment(event)} className="flex gap-2 border-t border-zinc-800 pt-3">
              <input value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={2200} aria-label="Write a comment" placeholder="Add a comment…" className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-rose-500" />
              <button type="submit" disabled={commentBusy || !commentText.trim()} className="rounded-lg bg-rose-600 px-3 text-xs font-semibold disabled:opacity-50">Post</button>
            </form>
          </section>
        </div>
      )}

    </section>
  );
};
