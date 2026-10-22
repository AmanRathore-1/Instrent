
import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, MapPin, Users } from 'lucide-react';

import type { User } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

type OnlineUser = User & {
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

type RoommateCard = {
  id: string;
  user: OnlineUser;
  isFollowing: boolean;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInAt?: string;
  preferences: { lifestyle: string[] } | null;
};

export const RoommateFinderView: React.FC = () => {
  const { openUserProfile } = useApp();

  const [users, setUsers] = useState<RoommateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOnlineUsers = useCallback(async () => {
    try {
      setError('');

      // Reuse the existing roommate discovery API.
      const response = await api.findRoommates({}, undefined);

      // Show only users whose backend presence says they are online.
      const activeUsers: RoommateCard[] =
        response.profiles.filter(
          (profile: RoommateCard) =>
            profile.user?.isOnline === true
        );

      setUsers(activeUsers);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load online users.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOnlineUsers();

    // Refresh online status every 15 seconds.
    const interval = window.setInterval(() => {
      void fetchOnlineUsers();
    }, 15000);

    return () => window.clearInterval(interval);
  }, [fetchOnlineUsers]);

  return (
    <section className="mx-auto min-h-full w-full max-w-5xl px-4 py-6 sm:px-6">

      {/* Simple heading */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500">
          <Users className="h-6 w-6 text-white" />
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-white">
            Active Roommates
          </h1>

          <p className="mt-1 text-sm text-zinc-400">
            People online right now
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold text-emerald-300">
            Live
          </span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex min-h-40 items-center justify-center">
          <LoaderCircle className="h-7 w-7 animate-spin text-rose-400" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-900 bg-zinc-900 p-6 text-center">
          <p className="text-sm text-red-300">{error}</p>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchOnlineUsers();
            }}
            className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      )}

      {/* Online profile cards */}
      {!loading && !error && users.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map(({ id, user }) => (
            <button
              key={id}
              type="button"
              onClick={() => openUserProfile(user.username)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-rose-500/50 hover:bg-zinc-800/80"
            >
              {/* Profile photo */}
              <div className="relative shrink-0">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    loading="lazy"
                    className="h-16 w-16 rounded-full border-2 border-zinc-700 object-cover transition group-hover:border-rose-400"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-700 bg-gradient-to-br from-rose-500 to-orange-500 text-xl font-bold text-white">
                    {user.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}

                {/* Genuine online indicator */}
                <span
                  title="Online now"
                  className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px] border-zinc-900 bg-emerald-400"
                />
              </div>

              {/* Name and location */}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-bold text-white group-hover:text-rose-400">
                  {user.name}
                </h2>

                <p className="mt-1 truncate text-sm text-zinc-500">
                  @{user.username}
                </p>

                <div className="mt-2 flex items-center gap-1.5 text-sm text-zinc-400">
                  <MapPin className="h-4 w-4 shrink-0 text-rose-400" />

                  <span className="truncate">
                    {user.city || 'Location not added'}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Online now
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No online users */}
      {!loading && !error && users.length === 0 && (
        <div className="py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
            <Users className="h-8 w-8 text-zinc-500" />
          </div>

          <h2 className="text-lg font-bold text-white">
            No one is online right now
          </h2>

          <p className="mt-2 text-sm text-zinc-500">
            Online members will appear here automatically.
          </p>
        </div>
      )}
    </section>
  );
};
