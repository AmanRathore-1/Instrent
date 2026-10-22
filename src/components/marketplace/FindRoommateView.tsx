
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Heart,
  MapPin,
  MessageCircle,
  Search,
  Users,
} from 'lucide-react';

import type { Comment, Post } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

const PostInteractions: React.FC<{
  post: Post;
  realtimeSocket: ReturnType<typeof useApp>['realtimeSocket'];
  showToast: ReturnType<typeof useApp>['showToast'];
}> = ({ post, realtimeSocket, showToast }) => {
  const { currentUser } = useApp();

  const [isLiked, setIsLiked] = useState(Boolean(post.isLiked));
  const [isSaved, setIsSaved] = useState(Boolean(post.isSaved));
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [savesCount, setSavesCount] = useState(post.savesCount);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIsLiked(Boolean(post.isLiked));
    setIsSaved(Boolean(post.isSaved));
    setLikesCount(post.likesCount);
    setSavesCount(post.savesCount);
    setCommentsCount(post.commentsCount);
  }, [
    post.isLiked,
    post.isSaved,
    post.likesCount,
    post.savesCount,
    post.commentsCount,
  ]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentError('');

    try {
      const result = await api.getPostComments(post.id);
      setComments(result.comments);
      setCommentCursor(result.nextCursor);
    } catch (cause) {
      setCommentError(
        cause instanceof Error
          ? cause.message
          : 'Could not load comments.',
      );
    } finally {
      setCommentsLoading(false);
    }
  }, [post.id]);

  useEffect(() => {
    if (!commentsOpen || !realtimeSocket) return;

    const handlePostChanged = (change: { postId?: string }) => {
      if (change.postId === post.id) void loadComments();
    };

    realtimeSocket.on('post:changed', handlePostChanged);

    return () => {
      realtimeSocket.off('post:changed', handlePostChanged);
    };
  }, [commentsOpen, loadComments, post.id, realtimeSocket]);

  const toggleLike = async () => {
    setBusy(true);

    try {
      const result = await api.setPostLike(post.id, !isLiked);
      setIsLiked(result.isLiked);
      setLikesCount(result.likesCount);
    } catch (cause) {
      showToast(
        cause instanceof Error ? cause.message : 'Could not update like.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleSave = async () => {
    setBusy(true);

    try {
      const result = await api.setPostSave(post.id, !isSaved);
      setIsSaved(result.isSaved);
      setSavesCount(result.savesCount);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not update saved post.',
        'error',
      );
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

      setComments((current) => [...current, result.comment]);
      setCommentsCount((count) => count + 1);
      setCommentText('');
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not post comment.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const saveCommentEdit = async (commentId: string) => {
    try {
      await api.updateComment(commentId, editingText);

      setComments((items) =>
        items.map((comment) =>
          comment.id === commentId
            ? { ...comment, text: editingText.trim() }
            : comment,
        ),
      );

      setEditingComment(null);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not update comment.',
        'error',
      );
    }
  };

  const deleteComment = async (comment: Comment) => {
    try {
      await api.deleteComment(comment.id);

      setComments((items) =>
        items.filter((item) => item.id !== comment.id),
      );

      setCommentsCount((count) => Math.max(0, count - 1));
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not delete comment.',
        'error',
      );
    }
  };

  const loadMoreComments = async () => {
    if (!commentCursor) return;

    try {
      const result = await api.getPostComments(post.id, commentCursor);

      setComments((items) => [...items, ...result.comments]);
      setCommentCursor(result.nextCursor);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not load more comments.',
        'error',
      );
    }
  };

  return (
    <div className="border-t border-zinc-800 pt-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void toggleLike()}
          disabled={busy}
          aria-label={isLiked ? 'Unlike post' : 'Like post'}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-300 disabled:opacity-50"
        >
          <Heart
            className={`h-4 w-4 ${
              isLiked ? 'fill-rose-500 text-rose-500' : ''
            }`}
          />
          {likesCount}
        </button>

        <button
          type="button"
          onClick={() => {
            const opening = !commentsOpen;
            setCommentsOpen(opening);
            if (opening) void loadComments();
          }}
          aria-expanded={commentsOpen}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-300"
        >
          <MessageCircle className="h-4 w-4" />
          {commentsCount}
        </button>

        <button
          type="button"
          onClick={() => void toggleSave()}
          disabled={busy}
          aria-label={isSaved ? 'Unsave post' : 'Save post'}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-300 disabled:opacity-50"
        >
          <Bookmark
            className={`h-4 w-4 ${
              isSaved ? 'fill-amber-400 text-amber-400' : ''
            }`}
          />
          {savesCount}
        </button>
      </div>

      {commentsOpen && (
        <div className="mt-3 space-y-2">
          {commentsLoading && (
            <p className="text-[11px] text-zinc-500">
              Loading comments...
            </p>
          )}

          {commentError && (
            <p role="alert" className="text-[11px] text-rose-300">
              {commentError}
            </p>
          )}

          {!commentsLoading &&
            !commentError &&
            comments.length === 0 && (
              <p className="text-[11px] text-zinc-500">
                No comments yet.
              </p>
            )}

          {comments.map((comment) => (
            <div
              key={comment.id}
              className="flex items-start gap-2 text-[11px] text-zinc-300"
            >
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-white">
                  {comment.userName}
                </span>{' '}

                {editingComment === comment.id ? (
                  <input
                    autoFocus
                    value={editingText}
                    onChange={(event) =>
                      setEditingText(event.target.value)
                    }
                    maxLength={2200}
                    aria-label="Edit comment"
                    className="ml-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-white"
                  />
                ) : (
                  comment.text
                )}
              </span>

              {comment.userId === currentUser?.id &&
                (editingComment === comment.id ? (
                  <span className="flex gap-2">
                    <button
                      onClick={() => void saveCommentEdit(comment.id)}
                      className="text-emerald-300"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingComment(null)}
                      className="text-zinc-500"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingComment(comment.id);
                        setEditingText(comment.text);
                      }}
                      className="text-zinc-500 hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void deleteComment(comment)}
                      className="text-zinc-500 hover:text-rose-300"
                    >
                      Delete
                    </button>
                  </span>
                ))}
            </div>
          ))}

          {commentCursor && (
            <button
              onClick={() => void loadMoreComments()}
              className="text-[10px] text-zinc-400 underline"
            >
              Load older comments
            </button>
          )}

          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              maxLength={2200}
              aria-label="Write a comment"
              placeholder="Add a comment..."
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white outline-none focus:border-rose-500"
            />

            <button
              type="submit"
              disabled={busy || !commentText.trim()}
              className="rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export const FindRoommateView: React.FC<{
  mode?: 'feed' | 'roommates';
}> = ({ mode = 'roommates' }) => {
  const {
    currentUser,
    openChatWith,
    openUserProfile,
    showToast,
    realtimeSocket,
  } = useApp();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busyUsers, setBusyUsers] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const loadMoreMarker = useRef<HTMLDivElement>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await api.getPosts();
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Could not load room posts.';

      setError(message);
      console.error('Failed to load roommate posts:', cause);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);

    try {
      const result = await api.getPosts(undefined, nextCursor);

      setPosts((current) => {
        const existingIds = new Set(
          current.map((post) => post.id),
        );

        return [
          ...current,
          ...result.posts.filter(
            (post) => !existingIds.has(post.id),
          ),
        ];
      });

      setNextCursor(result.nextCursor);
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not load more room posts.',
        'error',
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, showToast]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const marker = loadMoreMarker.current;

    if (!marker || !nextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMorePosts();
        }
      },
      { rootMargin: '500px 0px' },
    );

    observer.observe(marker);

    return () => observer.disconnect();
  }, [loadMorePosts, nextCursor]);

  useEffect(() => {
    if (!realtimeSocket) return;

    const handlePostChanged = () => {
      void loadPosts();
    };

    realtimeSocket.on('post:changed', handlePostChanged);

    return () => {
      realtimeSocket.off('post:changed', handlePostChanged);
    };
  }, [loadPosts, realtimeSocket]);

  const query = search.trim().toLowerCase();

  const filteredPosts = posts.filter((post) => {
    return (
      !query ||
      post.caption.toLowerCase().includes(query) ||
      post.location.toLowerCase().includes(query) ||
      post.owner?.name.toLowerCase().includes(query)
    );
  });

  const toggleFollow = async (post: Post) => {
    if (
      !post.owner ||
      post.owner.id === currentUser?.id ||
      busyUsers.includes(post.owner.id)
    ) {
      return;
    }

    setBusyUsers((users) => [...users, post.owner!.id]);

    try {
      const result = await api.setFollowing(
        post.owner.id,
        !post.isFollowingOwner,
      );

      setPosts((items) =>
        items.map((item) =>
          item.ownerId === post.ownerId
            ? {
                ...item,
                isFollowingOwner: result.isFollowing,
                owner: item.owner
                  ? {
                      ...item.owner,
                      followersCount: result.followersCount,
                    }
                  : item.owner,
              }
            : item,
        ),
      );
    } catch (cause) {
      showToast(
        cause instanceof Error
          ? cause.message
          : 'Could not update follow status.',
        'error',
      );
    } finally {
      setBusyUsers((users) =>
        users.filter((id) => id !== post.ownerId),
      );
    }
  };

  return (
    <section className="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-rose-400" />

            <h1 className="text-2xl font-bold text-white">
              {mode === 'feed' ? 'Room feed' : 'Find a roommate'}
            </h1>
          </div>

          <p className="mt-1 text-xs text-zinc-400">
            {mode === 'feed'
              ? 'Rooms and roommate posts shared by the community.'
              : 'Browse real room posts from people in the community.'}
          </p>
        </div>

        {/* Search bar: white icon and white focus border */}
        <label className="flex items-center gap-2 rounded-xl border border-white/70 bg-zinc-900 px-3 transition-colors focus-within:border-white">
          <Search className="h-4 w-4 shrink-0 text-white" />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-h-10 w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-400 sm:w-64"
            placeholder="Search by person, room or area"
            aria-label="Search room posts"
          />
        </label>
      </div>

      {loading && (
        <p className="py-16 text-center text-xs text-zinc-400">
          Loading room posts...
        </p>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5 text-center"
        >
          <p className="text-sm font-semibold text-rose-200">
            Room posts are unavailable
          </p>

          <p className="mt-1 text-xs text-zinc-400">{error}</p>

          <button
            onClick={() => void loadPosts()}
            className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && filteredPosts.length === 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-5 py-16 text-center">
          <Users className="mx-auto h-8 w-8 text-zinc-500" />

          <h2 className="mt-4 text-sm font-semibold text-zinc-200">
            {posts.length ? 'No matching rooms' : 'No room posts yet'}
          </h2>

          <p className="mt-1 text-xs text-zinc-500">
            {posts.length
              ? 'Try a different search.'
              : 'When people share room photos, they will appear here.'}
          </p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {filteredPosts.map((post) => {
          const owner = post.owner;

          return (
            <article
              key={post.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80"
            >
              <div className="flex items-center justify-between gap-3 p-3">
                <button
                  onClick={() =>
                    owner && openUserProfile(owner.username)
                  }
                  className="flex min-w-0 items-center gap-2.5 text-left"
                  disabled={!owner}
                >
                  {owner?.avatar ? (
                    <img
                      src={owner.avatar}
                      alt={owner.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-white">
                      {owner?.name.slice(0, 1).toUpperCase() || '?'}
                    </span>
                  )}

                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white">
                      {owner?.name || 'Account unavailable'}
                    </span>

                    <span className="block truncate text-[10px] text-zinc-500">
                      @{owner?.username || 'unknown'}
                    </span>
                  </span>
                </button>

                {owner && owner.id !== currentUser?.id && (
                  <button
                    onClick={() => void toggleFollow(post)}
                    disabled={busyUsers.includes(owner.id)}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50 ${
                      post.isFollowingOwner
                        ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        : 'bg-sky-600 text-white hover:bg-sky-500'
                    }`}
                  >
                    {post.isFollowingOwner ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              <div className="relative aspect-square bg-zinc-950">
                {post.images?.[0] && (
                  <img
                    src={post.images[0]}
                    alt={post.caption}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>

              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  {post.location && (
                    <p className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <MapPin className="h-3 w-3 text-rose-400" />
                      {post.location}
                    </p>
                  )}

                  {post.rentAmount && (
                    <p className="text-xs font-bold text-emerald-300">
                      ₹{post.rentAmount.toLocaleString('en-IN')}/mo
                    </p>
                  )}
                </div>

                {post.caption && (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-200">
                    {post.caption}
                  </p>
                )}

                <PostInteractions
                  post={post}
                  realtimeSocket={realtimeSocket}
                  showToast={showToast}
                />

                {owner && owner.id !== currentUser?.id && (
                  <button
                    onClick={() => void openChatWith(owner.id)}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Message
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && nextCursor && (
        <div
          ref={loadMoreMarker}
          className="mt-6 flex justify-center"
        >
          <button
            type="button"
            onClick={() => void loadMorePosts()}
            disabled={isLoadingMore}
            className="rounded-xl bg-zinc-800 px-5 py-2.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  );
};
