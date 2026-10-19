import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, GraduationCap, MapPin, MessageCircle, Users, UserPlus, UserCheck } from 'lucide-react';
import type { User } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

type RoommateCard = {
  id: string;
  user: User;
  budgetMin: number | null;
  budgetMax: number | null;
  moveInAt?: string;
  preferences: { lifestyle: string[] } | null;
  isFollowing: boolean;
};

export const RoommateFinderView: React.FC = () => {
  const { currentUser, showToast, openUserProfile, openChatWith } = useApp();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profile, setProfile] = useState({
    city: '',
    bio: '',
    budgetMin: '',
    budgetMax: '',
    moveInAt: '',
    lifestyle: '',
  });
  const [filters, setFilters] = useState({ city: '', minBudget: '', maxBudget: '', moveInBefore: '', lifestyle: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [people, setPeople] = useState<RoommateCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyUsers, setBusyUsers] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void api.getRoommateProfile().then(({ profile: saved }) => {
      if (!active || !saved) return;
      setProfile({
        city: saved.city,
        bio: saved.bio,
        budgetMin: saved.budgetMin == null ? '' : String(saved.budgetMin),
        budgetMax: saved.budgetMax == null ? '' : String(saved.budgetMax),
        moveInAt: saved.moveInAt ? saved.moveInAt.slice(0, 10) : '',
        lifestyle: saved.preferences?.lifestyle.join(', ') || '',
      });
    }).catch((cause: unknown) => {
      if (active) setProfileError(cause instanceof Error ? cause.message : 'Could not load your roommate profile.');
    }).finally(() => {
      if (active) setProfileLoading(false);
    });
    return () => { active = false; };
  }, []);

  const loadPeople = useCallback(async (nextCursor?: string) => {
    setLoading(true);
    setError('');
    const params = Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value.trim()));
    try {
      const response = await api.findRoommates(params, nextCursor);
      setPeople((items) => nextCursor
        ? [...items, ...response.profiles.filter((item) => !items.some((existing) => existing.id === item.id))]
        : response.profiles);
      setCursor(response.nextCursor);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not find roommates.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileBusy(true);
    setProfileError('');
    try {
      await api.saveRoommateProfile({
        city: profile.city.trim(),
        bio: profile.bio.trim(),
        budgetMin: profile.budgetMin ? Number(profile.budgetMin) : null,
        budgetMax: profile.budgetMax ? Number(profile.budgetMax) : null,
        moveInAt: profile.moveInAt ? new Date(`${profile.moveInAt}T00:00:00.000Z`).toISOString() : null,
        preferences: { lifestyle: profile.lifestyle.split(',').map((item) => item.trim()).filter(Boolean) },
      });
      showToast('Roommate profile saved.', 'success');
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Could not save your profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const toggleFollow = async (person: RoommateCard) => {
    if (person.user.id === currentUser?.id || busyUsers.includes(person.user.id)) return;
    setBusyUsers((items) => [...items, person.user.id]);
    try {
      const response = await api.setFollowing(person.user.id, !person.isFollowing);
      setPeople((items) => items.map((item) => item.id === person.id
        ? { ...item, isFollowing: response.isFollowing }
        : item));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update follow status.', 'error');
    } finally {
      setBusyUsers((items) => items.filter((id) => id !== person.user.id));
    }
  };

  return (
    <section className="mx-auto max-w-6xl p-4 pb-24">
      <header className="mb-5">
        <h1 className="text-xl font-black text-white">Find a roommate</h1>
        <p className="mt-1 text-xs text-zinc-500">Discover real members with completed roommate profiles.</p>
      </header>

      <form onSubmit={(event) => void saveProfile(event)} className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-bold text-white">Your roommate profile</h2>
        <p className="mt-1 text-[10px] text-zinc-500">Your profile appears in discovery after you add your city and bio.</p>
        {profileLoading ? <div className="mt-4 h-24 animate-pulse rounded-xl bg-zinc-800" /> : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs text-zinc-300">City<input required maxLength={120} value={profile.city} onChange={(event) => setProfile((item) => ({ ...item, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
              <label className="text-xs text-zinc-300">Minimum budget<input type="number" min="0" value={profile.budgetMin} onChange={(event) => setProfile((item) => ({ ...item, budgetMin: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
              <label className="text-xs text-zinc-300">Maximum budget<input type="number" min="1" value={profile.budgetMax} onChange={(event) => setProfile((item) => ({ ...item, budgetMax: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
              <label className="text-xs text-zinc-300">Move-in date<input type="date" value={profile.moveInAt} onChange={(event) => setProfile((item) => ({ ...item, moveInAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
              <label className="text-xs text-zinc-300 sm:col-span-2">Lifestyle (comma separated)<input maxLength={500} value={profile.lifestyle} onChange={(event) => setProfile((item) => ({ ...item, lifestyle: event.target.value }))} placeholder="early riser, vegetarian, quiet" className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
              <label className="text-xs text-zinc-300 sm:col-span-2 lg:col-span-3">About you<textarea required maxLength={500} rows={3} value={profile.bio} onChange={(event) => setProfile((item) => ({ ...item, bio: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white" /></label>
            </div>
            {profileError && <p role="alert" className="mt-3 text-xs text-rose-300">{profileError}</p>}
            <button disabled={profileBusy} className="mt-3 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{profileBusy ? 'Saving…' : 'Save profile'}</button>
          </>
        )}
      </form>

      <form onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); }} className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input aria-label="Filter by city" placeholder="City" value={filters.city} onChange={(event) => setFilters((item) => ({ ...item, city: event.target.value }))} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input aria-label="Minimum budget filter" type="number" min="0" placeholder="Min budget" value={filters.minBudget} onChange={(event) => setFilters((item) => ({ ...item, minBudget: event.target.value }))} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input aria-label="Maximum budget filter" type="number" min="0" placeholder="Max budget" value={filters.maxBudget} onChange={(event) => setFilters((item) => ({ ...item, maxBudget: event.target.value }))} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input aria-label="Move in by date filter" type="date" value={filters.moveInBefore} onChange={(event) => setFilters((item) => ({ ...item, moveInBefore: event.target.value }))} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input aria-label="Lifestyle filter" placeholder="Lifestyle" value={filters.lifestyle} onChange={(event) => setFilters((item) => ({ ...item, lifestyle: event.target.value }))} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <button className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold sm:col-span-2 lg:col-span-5">Find people</button>
      </form>

      {error && <div role="alert" className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{error}</div>}
      {loading && people.length === 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((id) => <div key={id} className="h-40 animate-pulse rounded-xl bg-zinc-900" />)}</div>}
      {!loading && !error && people.length === 0 && <div className="py-14 text-center text-sm text-zinc-500"><Users className="mx-auto mb-2 h-8 w-8" />No completed roommate profiles match these filters.</div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((person) => (
          <article key={person.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-3">
              <button onClick={() => openUserProfile(person.user.username)} aria-label={`Open ${person.user.name}'s profile`}>
                {person.user.avatar ? <img src={person.user.avatar} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-full bg-zinc-800 text-sm font-bold">{person.user.name.slice(0, 1)}</span>}
              </button>
              <button onClick={() => openUserProfile(person.user.username)} className="min-w-0 text-left">
                <span className="block truncate text-sm font-bold text-white">{person.user.name}</span>
                <span className="block truncate text-[10px] text-zinc-500">@{person.user.username}</span>
              </button>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-zinc-400"><MapPin className="h-3.5 w-3.5 text-rose-400" />{person.user.city}</p>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-300">{person.user.bio}</p>
            {(person.budgetMin != null || person.budgetMax != null) && <p className="mt-2 text-xs text-emerald-300">Budget {person.budgetMin == null ? '' : `₹${person.budgetMin.toLocaleString('en-IN')}`}–{person.budgetMax == null ? '' : `₹${person.budgetMax.toLocaleString('en-IN')}`}</p>}
            {person.moveInAt && <p className="mt-1 text-[10px] text-zinc-500">Move-in: {new Date(person.moveInAt).toLocaleDateString()}</p>}
            {person.preferences?.lifestyle.length ? <p className="mt-2 text-[10px] text-zinc-400">Lifestyle: {person.preferences.lifestyle.join(', ')}</p> : null}
            {(person.user.occupation || person.user.instituteOrCompany) && <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400">{person.user.occupation === 'STUDENT' ? <GraduationCap className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}{person.user.instituteOrCompany || person.user.occupation?.toLowerCase()}</p>}
            <div className="mt-4 flex gap-2">
              {person.user.id !== currentUser?.id && <button onClick={() => void toggleFollow(person)} disabled={busyUsers.includes(person.user.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-zinc-800 py-2 text-[10px] font-semibold text-white disabled:opacity-50">{person.isFollowing ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}{person.isFollowing ? 'Following' : 'Follow'}</button>}
              {person.user.id !== currentUser?.id && <button onClick={() => void openChatWith(person.user.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 py-2 text-[10px] font-semibold text-white"><MessageCircle className="h-3.5 w-3.5" />Message</button>}
            </div>
          </article>
        ))}
      </div>
      {cursor && <button disabled={loading} onClick={() => void loadPeople(cursor)} className="mx-auto mt-6 block rounded-lg bg-zinc-800 px-5 py-2 text-xs font-semibold disabled:opacity-50">{loading ? 'Loading…' : 'Load more'}</button>}
    </section>
  );
};
