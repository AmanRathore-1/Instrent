import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, Users, X } from 'lucide-react';
import type { Post } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const { openUserProfile, realtimeSocket } = useApp();
  const [query, setQuery] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [postVersion, setPostVersion] = useState(0);

  useEffect(() => {
    if (!isOpen || !realtimeSocket) return;
    const handlePostChanged = () => setPostVersion((version) => version + 1);
    realtimeSocket.on('post:changed', handlePostChanged);
    return () => {
      realtimeSocket.off('post:changed', handlePostChanged);
    };
  }, [isOpen, realtimeSocket]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void api.getPosts()
      .then((result) => {
        if (!cancelled) setPosts(result.posts);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Search is unavailable.');
          console.error('Roommate search failed:', cause);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, postVersion]);

  const matchingPosts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return posts.filter((post) =>
      post.caption.toLowerCase().includes(term) ||
      post.location.toLowerCase().includes(term) ||
      post.owner?.name.toLowerCase().includes(term) ||
      post.owner?.username.toLowerCase().includes(term),
    );
  }, [posts, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-16 backdrop-blur-md" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search room posts"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
          <Search className="h-5 w-5 text-rose-400" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rooms, areas or people"
            className="min-h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
          <button onClick={onClose} aria-label="Close search" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {!query.trim() && (
            <div className="py-12 text-center text-xs text-zinc-500">
              Search published room posts and real profiles.
            </div>
          )}
          {loading && <p className="py-8 text-center text-xs text-zinc-400">Searching...</p>}
          {error && <p role="alert" className="py-8 text-center text-xs text-rose-300">{error}</p>}
          {!loading && !error && query.trim() && matchingPosts.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-500">No matching room posts.</div>
          )}
          {!loading && !error && matchingPosts.map((post) => (
            <button
              key={post.id}
              onClick={() => {
                if (post.owner) openUserProfile(post.owner.username);
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5 text-left hover:bg-zinc-800"
            >
              {post.images[0] ? (
                <img src={post.images[0]} alt="" loading="lazy" decoding="async" className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-800">
                  <Users className="h-5 w-5 text-zinc-400" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-white">{post.owner?.name || 'Profile unavailable'}</span>
                <span className="mt-0.5 block truncate text-[11px] text-zinc-400">{post.caption}</span>
                {post.location && (
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-zinc-500">
                    <MapPin className="h-3 w-3" /> {post.location}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
