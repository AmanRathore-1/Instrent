import React, { useEffect, useState } from 'react';
import { Bookmark, Home, MapPin } from 'lucide-react';
import type { RentalRoom } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

export const SavedView: React.FC = () => {
  const { setViewParams, setActiveView, showToast } = useApp();
  const [rooms, setRooms] = useState<RentalRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api.getSavedRooms().then((response) => {
      if (active) setRooms(response.rooms);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load saved rooms.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const unsaveRoom = async (room: RentalRoom) => {
    try {
      await api.setRoomSaved(room.id, false);
      setRooms((items) => items.filter((item) => item.id !== room.id));
      showToast('Room removed from saved rooms.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not remove saved room.', 'error');
    }
  };

  return (
    <section className="mx-auto max-w-5xl px-4 py-6 pb-24">
      <header className="mb-6 flex items-center gap-2">
        <Bookmark className="h-5 w-5 fill-amber-400 text-amber-400" />
        <h1 className="text-xl font-black text-white">Saved rooms</h1>
      </header>
      {loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-900" />)}</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-xs text-rose-200">{error}</div>}
      {!loading && !error && rooms.length === 0 && <div className="py-16 text-center text-sm text-zinc-500">You have not saved any rooms yet.</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <article key={room.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <button onClick={() => { setViewParams({ roomId: room.id }); setActiveView('rooms'); }} className="block w-full text-left">
              {room.photos[0]
                ? <img src={room.photos[0]} alt={room.title} className="aspect-[4/3] w-full object-cover" />
                : <div className="grid aspect-[4/3] place-items-center bg-zinc-950"><Home className="h-8 w-8 text-zinc-700" /></div>}
              <div className="p-4">
                <div className="flex justify-between gap-2"><h2 className="truncate text-sm font-bold text-white">{room.title}</h2><span className="whitespace-nowrap text-xs font-bold text-emerald-300">₹{room.rent.toLocaleString('en-IN')}/mo</span></div>
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400"><MapPin className="h-3.5 w-3.5" />{room.area}, {room.city}</p>
              </div>
            </button>
            <button onClick={() => void unsaveRoom(room)} className="w-full border-t border-zinc-800 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white">Remove saved room</button>
          </article>
        ))}
      </div>
    </section>
  );
};
