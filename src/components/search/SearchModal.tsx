import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import type { RentalRoom } from '../../types/client.ts';

const minRentOptions = [1000, 3000, 5000, 8000, 10000, 15000, 20000, 25000, 30000];
const maxRentOptions = [3000, 5000, 8000, 10000, 15000, 20000, 25000, 30000, 50000, 100000];
const formatRent = (value: number) => `₹${value.toLocaleString('en-IN')}`;

export const SearchModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { openUserProfile, setViewParams, setActiveView } = useApp();
  const [query, setQuery] = useState('');
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [appliedMinRent, setAppliedMinRent] = useState('');
  const [appliedMaxRent, setAppliedMaxRent] = useState('');
  const [roomType, setRoomType] = useState('');
  const [status, setStatus] = useState('AVAILABLE');
  const [showFilters, setShowFilters] = useState(false);
  const [rooms, setRooms] = useState<RentalRoom[]>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.discoverUsers>>['users']>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');
  const requestVersion = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    const version = ++requestVersion.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      Promise.all([
        api.getRooms({ q: query.trim(), minRent: appliedMinRent, maxRent: appliedMaxRent, roomType, status }),
        api.discoverUsers(query.trim()),
      ]).then(([roomResult, userResult]) => { if (version === requestVersion.current) { setRooms(roomResult.rooms); setUsers(userResult.users); } })
        .catch((cause) => { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : 'Search is unavailable.'); })
        .finally(() => { if (version === requestVersion.current) setLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); requestVersion.current += 1; };
  }, [isOpen, query, appliedMinRent, appliedMaxRent, roomType, status]);

  if (!isOpen) return null;
  const applyFilters = () => {
    const min = minRent.trim() === '' ? undefined : Number(minRent);
    const max = maxRent.trim() === '' ? undefined : Number(maxRent);
    if (
      (min !== undefined && (!Number.isInteger(min) || min < 0)) ||
      (max !== undefined && (!Number.isInteger(max) || max < 0))
    ) {
      setFilterError('Rent must be a non-negative whole number.');
      return;
    }
    if (min !== undefined && max !== undefined && min > max) {
      setFilterError('Minimum rent cannot exceed maximum rent.');
      return;
    }
    setFilterError('');
    setAppliedMinRent(minRent.trim());
    setAppliedMaxRent(maxRent.trim());
  };
  const reset = () => {
    setQuery('');
    setMinRent('');
    setMaxRent('');
    setAppliedMinRent('');
    setAppliedMaxRent('');
    setRoomType('');
    setStatus('AVAILABLE');
    setFilterError('');
  };
  const selectClass = 'rounded-lg border border-white bg-zinc-950 px-3 py-2 text-xs text-white outline-none transition focus:border-white focus:ring-2 focus:ring-white/20';
  const minRentLabel = minRent ? formatRent(Number(minRent)) : 'Any minimum';
  const maxRentLabel = maxRent ? formatRent(Number(maxRent)) : 'Any maximum';
  return <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-16 backdrop-blur-md" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Search rooms and people" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-3 border-b border-zinc-800 p-4"><Search className="h-5 w-5 text-white" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rooms, locations or people" className="min-h-10 flex-1 rounded-lg border border-white bg-zinc-950 px-3 text-sm text-white outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-white/20" /><button type="button" onClick={() => setShowFilters((value) => !value)} className={`rounded-lg p-2 ${showFilters ? 'bg-rose-500/20 text-rose-300' : 'text-white hover:bg-zinc-800'}`} aria-label="Toggle search filters"><SlidersHorizontal className="h-4 w-4" /></button><button type="button" onClick={onClose} aria-label="Close search" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button></div>
      {showFilters && <div className="border-b border-zinc-800 p-4"><div className="grid gap-2 sm:grid-cols-5"><select aria-label="Minimum rent" value={minRent} onChange={(event) => { setMinRent(event.target.value); setFilterError(''); }} className={selectClass}><option value="">{minRentLabel}</option>{minRentOptions.map((value) => <option key={value} value={value}>{formatRent(value)}</option>)}</select><select aria-label="Maximum rent" value={maxRent} onChange={(event) => { setMaxRent(event.target.value); setFilterError(''); }} className={selectClass}><option value="">{maxRentLabel}</option>{maxRentOptions.map((value) => <option key={value} value={value}>{formatRent(value)}</option>)}</select><select value={roomType} onChange={(event) => setRoomType(event.target.value)} className={selectClass}><option value="">Any room type</option><option value="SINGLE">Single</option><option value="DOUBLE">Double</option><option value="TRIPLE">Triple</option><option value="STUDIO">Studio</option><option value="1BHK">1 BHK</option><option value="2BHK">2 BHK</option><option value="3BHK">3 BHK</option></select><select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option><option value="RENTED">Rented</option></select><button type="button" onClick={applyFilters} className="rounded-lg bg-gradient-to-r from-rose-500 to-amber-400 px-3 py-2 text-xs font-bold text-white hover:from-rose-400 hover:to-amber-300">Apply filters</button></div>{filterError && <p role="alert" className="mt-2 text-xs text-rose-300">{filterError}</p>}<button type="button" onClick={reset} className="mt-2 text-xs font-semibold text-zinc-400 underline hover:text-white">Reset filters</button></div>}
      <div className="flex-1 overflow-y-auto p-4">{loading && <p className="py-8 text-center text-xs text-zinc-400">Searching...</p>}{error && <p role="alert" className="py-8 text-center text-xs text-rose-300">{error}</p>}      {!loading && !error && !query.trim() && !minRent && !maxRent && !roomType && status === 'AVAILABLE' && <p className="py-8 text-center text-xs text-zinc-500">Search rooms by title, city, locality, description, or find people by name and username.</p>}
        {!loading && !error && users.length > 0 && <><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">People</h2>{users.slice(0, 5).map((user) => <button key={user.id} type="button" onClick={() => { openUserProfile(user.username); onClose(); }} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-left hover:bg-zinc-800"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-white">{user.avatar ? <img src={user.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : user.name.slice(0, 1)}</span><span><span className="block text-xs font-semibold text-white">{user.name}</span><span className="text-[11px] text-zinc-500">@{user.username} · {user.city || 'Location not added'}</span></span><Users className="ml-auto h-4 w-4 text-zinc-500" /></button>)}</>}
        {!loading && !error && rooms.length > 0 && <><h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-zinc-500">Rooms</h2>{rooms.map((room) => <button key={room.id} type="button" onClick={() => { setViewParams({ roomId: room.id }); setActiveView('rooms'); onClose(); }} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-left hover:bg-zinc-800">{room.photos[0] ? <img src={room.photos[0]} alt="" className="h-14 w-14 rounded-lg object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-800"><MapPin className="h-5 w-5 text-zinc-500" /></span>}<span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{room.title}</span><span className="block truncate text-xs text-zinc-400">{room.city} · {room.area} · ₹{room.rent}</span><span className="block truncate text-[11px] text-zinc-500">{room.description}</span></span></button>)}</>}
        {!loading && !error && (query.trim() || minRent || maxRent || roomType || status !== 'AVAILABLE') && rooms.length === 0 && users.length === 0 && <p className="py-10 text-center text-xs text-zinc-500">No rooms or people match these filters.</p>}
      </div>
    </section>
  </div>;
};
