import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, MessageCircle, RefreshCw, Search, UserPlus, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

type DiscoverUser = Awaited<ReturnType<typeof api.discoverUsers>>['users'][number];

const UserCard: React.FC<{
  user: DiscoverUser;
  onProfile: () => void;
  onMessage: () => void;
  onFollow: () => void;
  busy: boolean;
}> = ({ user, onProfile, onMessage, onFollow, busy }) => {
  const preferences = user.roommateProfile?.preferences?.lifestyle || [];
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl shadow-black/10">
      <div className="flex gap-3">
        <button type="button" onClick={onProfile} className="relative h-14 w-14 shrink-0">
          {user.avatar ? <img src={user.avatar} alt={user.name} className="h-14 w-14 rounded-full object-cover" /> : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 text-lg font-bold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-[3px] border-zinc-900 ${user.isOnline ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
        </button>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onProfile} className="block max-w-full truncate text-left font-bold text-white hover:text-rose-300">{user.name}</button>
          <p className="truncate text-xs text-zinc-500">@{user.username}</p>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-400"><MapPin className="h-3 w-3 text-rose-400" />{user.city || user.locationArea || 'Location not added'}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {preferences.slice(0, 3).map((preference) => <span key={preference} className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">{preference}</span>)}
        {user.roommateProfile?.budgetMin != null && <span className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300">Budget ₹{user.roommateProfile.budgetMin}{user.roommateProfile.budgetMax ? `–₹${user.roommateProfile.budgetMax}` : '+'}</span>}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onProfile} className="flex-1 rounded-lg bg-zinc-800 px-2 py-2 text-xs font-semibold text-white hover:bg-zinc-700">View Profile</button>
        <button type="button" onClick={onMessage} className="rounded-lg border border-zinc-700 px-2.5 text-zinc-300 hover:border-rose-400 hover:text-white" aria-label={`Message ${user.name}`}><MessageCircle className="h-4 w-4" /></button>
        <button type="button" onClick={onFollow} disabled={busy} className="rounded-lg border border-zinc-700 px-2.5 text-zinc-300 hover:border-rose-400 hover:text-white disabled:opacity-50" aria-label={user.isFollowing ? `Unfollow ${user.name}` : `Follow ${user.name}`}><UserPlus className="h-4 w-4" /></button>
      </div>
    </article>
  );
};

export const RoommateFinderView: React.FC = () => {
  const { openUserProfile, openChatWith, showToast } = useApp();
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadUsers = useCallback(async (search = appliedQuery) => {
    setLoading(true);
    const version = ++requestVersion.current;
    setError('');
    try {
      const result = await api.discoverUsers(search);
      if (version !== requestVersion.current) return;
      setUsers(result.users);
    } catch (cause) {
      if (version !== requestVersion.current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to load roommate profiles.');
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [appliedQuery]);

  useEffect(() => { void loadUsers(); const interval = window.setInterval(() => void loadUsers(), 30_000); return () => { window.clearInterval(interval); requestVersion.current += 1; }; }, [loadUsers]);

  const online = useMemo(() => users.filter((user) => user.isOnline), [users]);
  const offline = useMemo(() => users.filter((user) => !user.isOnline), [users]);
  const toggleFollow = async (user: DiscoverUser) => {
    setBusy(user.id);
    try {
      const result = await api.setFollowing(user.id, !user.isFollowing);
      setUsers((items) => items.map((item) => item.id === user.id ? { ...item, isFollowing: result.isFollowing } : item));
    } catch (cause) { showToast(cause instanceof Error ? cause.message : 'Could not update follow status.', 'error'); }
    finally { setBusy(null); }
  };

  const section = (title: string, items: DiscoverUser[], onlineState: boolean) => (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${onlineState ? 'bg-emerald-400' : 'bg-zinc-500'}`} /><h2 className="text-sm font-bold text-white">{title}</h2><span className="text-xs text-zinc-500">({items.length})</span></div>
      {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((user) => <UserCard key={user.id} user={user} busy={busy === user.id} onProfile={() => openUserProfile(user.username)} onMessage={() => void openChatWith(user.id)} onFollow={() => void toggleFollow(user)} />)}</div> : <div className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-xs text-zinc-500">{onlineState ? 'No users are online right now.' : 'No offline users match your search.'}</div>}
    </section>
  );

  return <section className="mx-auto min-h-full w-full max-w-6xl px-4 py-6 pb-24 sm:px-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="flex items-center gap-2"><Users className="h-5 w-5 text-rose-400" /><h1 className="text-2xl font-black text-white">Find Your Roommate</h1></div><p className="mt-1 text-sm text-zinc-400">Discover people and find your perfect roommate.</p></div>
      <form onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query.trim()); }} className="flex w-full max-w-md items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 focus-within:border-rose-400"><Search className="h-4 w-4 text-zinc-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username or location" className="min-h-10 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500" /></form>
    </div>
    {loading && <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-44 animate-pulse rounded-2xl bg-zinc-900" />)}</div>}
    {!loading && error && <div role="alert" className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="text-sm text-rose-200">{error}</p><button type="button" onClick={() => void loadUsers()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-white"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>}
    {!loading && !error && users.length === 0 && <div className="mt-8 rounded-2xl border border-zinc-800 py-16 text-center text-sm text-zinc-500">No users match your search.</div>}
    {!loading && !error && users.length > 0 && <>{section(`Online users`, online, true)}{section('Offline users', offline, false)}</>}
  </section>;
};
