import React, { useEffect, useState } from 'react';
import { Bookmark, Heart, MapPin, MessageCircle, Send, X } from 'lucide-react';
import type { Comment, Post } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { CommentSkeleton, InlineLoader, useDelayedFlag } from '../loading/index.ts';

export const PostDetailModal: React.FC<{
  post: Post;
  onClose: () => void;
}> = ({ post, onClose }) => {
  const { currentUser, openUserProfile, showToast } = useApp();
  const [isLiked, setIsLiked] = useState(Boolean(post.isLiked));
  const [isSaved, setIsSaved] = useState(Boolean(post.isSaved));
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [busy, setBusy] = useState(false);
  const commentsVisible = useDelayedFlag(loadingComments);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoadingComments(true);
    void api.getPostComments(post.id)
      .then((result) => {
        if (!active) return;
        setComments(result.comments);
        setCommentCursor(result.nextCursor);
      })
      .catch((cause) => {
        if (active) showToast(cause instanceof Error ? cause.message : 'Could not load comments.', 'error');
      })
      .finally(() => {
        if (active) setLoadingComments(false);
      });
    return () => {
      active = false;
    };
  }, [post.id, showToast]);

  const toggleLike = async () => {
    setBusy(true);
    try {
      const result = await api.setPostLike(post.id, !isLiked);
      setIsLiked(result.isLiked);
      setLikesCount(result.likesCount);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update like.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    setBusy(true);
    try {
      const result = await api.setPostSave(post.id, !isSaved);
      setIsSaved(result.isSaved);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update bookmark.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const result = await api.addPostComment(post.id, text);
      setComments((items) => [...items, result.comment]);
      setCommentText('');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not add comment.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadMoreComments = async () => {
    if (!commentCursor) return;
    try {
      const result = await api.getPostComments(post.id, commentCursor);
      setComments((items) => [...items, ...result.comments]);
      setCommentCursor(result.nextCursor);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not load more comments.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Post details"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/50 md:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-0 items-center justify-center bg-black md:w-[58%]">
          <button type="button" onClick={onClose} aria-label="Close post details" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-rose-500/30 md:hidden">
            <X className="h-5 w-5" />
          </button>
          {post.images[0] ? <img src={post.images[0]} alt={post.caption} className="max-h-[48vh] w-full object-contain md:max-h-[92vh]" /> : <div className="p-12 text-sm text-zinc-500">No media available</div>}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-white/[0.08] p-4">
            <button type="button" onClick={() => post.owner && openUserProfile(post.owner.username)} className="flex min-w-0 items-center gap-3 text-left hover:text-rose-300">
              {post.owner?.avatar ? <img src={post.owner.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-400 font-bold text-white">{post.owner?.name.slice(0, 1).toUpperCase() || '?'}</span>}
              <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{post.owner?.name || 'Account unavailable'}</span><span className="block truncate text-xs text-zinc-500">@{post.owner?.username || 'unknown'}</span></span>
            </button>
            <button type="button" onClick={onClose} aria-label="Close post details" className="ml-auto hidden rounded-full p-2 text-zinc-400 hover:bg-white/[0.08] hover:text-white md:block"><X className="h-5 w-5" /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{post.caption}</p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400">
              {post.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-rose-400" />{post.location}</span>}
              {post.rentAmount != null && <span className="font-bold text-emerald-300">₹{post.rentAmount.toLocaleString('en-IN')}/mo</span>}
              {post.roomType && <span className="rounded-full bg-white/[0.07] px-2 py-1">{post.roomType}</span>}
            </div>

            <div className="mt-5 border-t border-white/[0.08] pt-4">
              <div className="flex items-center gap-5">
                <button type="button" disabled={busy} onClick={() => void toggleLike()} aria-label={isLiked ? 'Unlike post' : 'Like post'} className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-rose-300 disabled:opacity-50"><Heart className={`h-5 w-5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />{likesCount}</button>
                <span className="inline-flex items-center gap-2 text-sm text-zinc-400"><MessageCircle className="h-5 w-5" />{comments.length || post.commentsCount}</span>
                <button type="button" disabled={busy} onClick={() => void toggleSave()} aria-label={isSaved ? 'Remove bookmark' : 'Bookmark post'} className="ml-auto text-zinc-300 hover:text-amber-300 disabled:opacity-50"><Bookmark className={`h-5 w-5 ${isSaved ? 'fill-amber-400 text-amber-400' : ''}`} /></button>
                {post.owner && post.owner.id !== currentUser?.id && <button type="button" onClick={() => void navigator.share?.({ title: post.caption, url: window.location.href })} aria-label="Share post" className="text-zinc-300 hover:text-rose-300"><Send className="h-5 w-5" /></button>}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {commentsVisible && <CommentSkeleton />}
              {!loadingComments && comments.map((comment) => <div key={comment.id} className="flex gap-2 text-xs text-zinc-300"><span className="font-semibold text-white">{comment.userName}</span><span className="min-w-0">{comment.text}</span></div>)}
              {!loadingComments && !comments.length && <p className="text-xs text-zinc-500">No comments yet.</p>}
              {commentCursor && <button type="button" onClick={() => void loadMoreComments()} className="text-xs text-zinc-400 underline">Load older comments</button>}
            </div>
          </div>

          <form onSubmit={submitComment} className="flex gap-2 border-t border-white/[0.08] p-4">
            <input value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add a comment..." maxLength={2200} aria-label="Add a comment" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white outline-none focus:border-rose-400/50" />
            <button type="submit" disabled={busy || !commentText.trim()} className="rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? <InlineLoader /> : 'Post'}</button>
          </form>
        </div>
      </section>
    </div>
  );
};
