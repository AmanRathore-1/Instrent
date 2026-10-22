import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronDown, ChevronUp, Home, MapPin, MessageCircle, Plus, Trash2, Video, X } from 'lucide-react';
import type { RentalRoom } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

const mediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime']);

export const RoomsView: React.FC<{ initialRoomId?: string }> = ({ initialRoomId }) => {
  const { currentUser, showToast, setActiveView, setViewParams } = useApp();
  const [rooms, setRooms] = useState<RentalRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RentalRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState({ city: '', minRent: '', maxRent: '', roomType: '', amenities: '', availableBefore: '', sort: 'newest' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [roomForm, setRoomForm] = useState({
    title: '', description: '', city: '', area: '', fullAddress: '', rent: '', roomType: '',
    amenities: '', availableAt: '', status: 'AVAILABLE' as RentalRoom['status'],
  });
  const showToastRef = useRef(showToast);
  const loadingMoreRef = useRef(false);
  const roomRequestVersion = useRef(0);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  const loadRooms = useCallback(async (cursor?: string) => {
    if (cursor && loadingMoreRef.current) return;
    const requestVersion = ++roomRequestVersion.current;
    if (!cursor) {
      setLoading(true);
      setError('');
      loadingMoreRef.current = false;
      setLoadingMore(false);
    } else {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const activeParams = Object.fromEntries(
        Object.entries(appliedFilters).filter(([, value]) => value.trim().length > 0),
      );
      const result = await api.getRooms(activeParams, cursor);
      if (requestVersion !== roomRequestVersion.current) return;
      setRooms((items) => cursor
        ? [...items, ...result.rooms.filter((room) => !items.some((item) => item.id === room.id))]
        : result.rooms);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      if (requestVersion !== roomRequestVersion.current) return;
      const message = cause instanceof Error ? cause.message : 'Could not load rooms.';
      setError(message);
    } finally {
      if (requestVersion === roomRequestVersion.current) {
        setLoading(false);
        if (cursor) {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    }
  }, [appliedFilters]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!initialRoomId) return;
    void api.getRoom(initialRoomId).then(({ room }) => setSelectedRoom(room)).catch((cause: unknown) => {
      showToastRef.current(cause instanceof Error ? cause.message : 'Could not load saved room.', 'error');
    });
  }, [initialRoomId]);

  const openRoom = async (room: RentalRoom) => {
    try {
      const result = await api.getRoom(room.id);
      setSelectedRoom(result.room);
      setInquiryMessage('');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not load room details.', 'error');
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selectedMedia = Array.from(form.querySelector<HTMLInputElement>('input[name="room-media"]')?.files ?? []);
    if (selectedMedia.some((file) => !mediaTypes.has(file.type) || file.size > (file.type.startsWith('video/') ? 100 : 10) * 1024 * 1024)) {
      showToast('Photos must be supported images up to 10 MB; videos up to 100 MB.', 'warning');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      if (selectedMedia.length > 10) {
        showToast('A room listing can contain up to 10 media files.', 'warning');
        return;
      }
      const uploaded = await Promise.all(selectedMedia.map((file, index) => api.uploadMedia(file, file.type.startsWith('video/') ? 'video' : 'image', (percent) => {
        if (selectedMedia.length) setProgress(Math.round(((index * 100) + percent) / selectedMedia.length));
      })));
      const result = await api.createRoom({
        ...roomForm,
        rent: Number(roomForm.rent),
        amenities: roomForm.amenities.split(',').map((amenity) => amenity.trim()).filter(Boolean),
        availableAt: roomForm.availableAt ? new Date(roomForm.availableAt).toISOString() : null,
        media: uploaded.map(({ publicId }) => ({ publicId })),
      });
      setRooms((items) => [result.room, ...items]);
      setCreateOpen(false);
      setRoomForm({ title: '', description: '', city: '', area: '', fullAddress: '', rent: '', roomType: '', amenities: '', availableAt: '', status: 'AVAILABLE' });
      showToast('Room listing created.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not create room listing.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveRoom = async (room: RentalRoom) => {
    try {
      const result = await api.setRoomSaved(room.id, !room.isSaved);
      const updated = { ...room, isSaved: result.isSaved };
      setRooms((items) => items.map((item) => item.id === room.id ? updated : item));
      setSelectedRoom((item) => item?.id === room.id ? updated : item);
      showToast(result.isSaved ? 'Room saved.' : 'Room removed from saved.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not save room.', 'error');
    }
  };

  const contactOwner = async (room: RentalRoom) => {
    try {
      const response = await api.contactRoomOwner(room.id);
      setViewParams({ conversationId: response.conversationId, context: response.context });
      setActiveView('messages');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not contact the owner.', 'error');
    }
  };

  const sendInquiry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRoom || !inquiryMessage.trim()) return;
    try {
      await api.createRoomInquiry(selectedRoom.id, inquiryMessage.trim(), crypto.randomUUID());
      setInquiryMessage('');
      showToast('Inquiry sent to the room owner.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not send your inquiry.', 'error');
    }
  };

  const deleteRoom = async (room: RentalRoom) => {
    if (!window.confirm('Delete this room and its media?')) return;
    try {
      await api.deleteRoom(room.id);
      setRooms((items) => items.filter((item) => item.id !== room.id));
      setSelectedRoom(null);
      showToast('Room listing deleted.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not delete this room.', 'error');
    }
  };

  const updateRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRoom) return;
    try {
      const result = await api.updateRoom(selectedRoom.id, {
        title: roomForm.title,
        description: roomForm.description,
        city: roomForm.city,
        area: roomForm.area,
        fullAddress: roomForm.fullAddress,
        rent: Number(roomForm.rent),
        roomType: roomForm.roomType,
        amenities: roomForm.amenities.split(',').map((amenity) => amenity.trim()).filter(Boolean),
        availableAt: roomForm.availableAt ? new Date(roomForm.availableAt).toISOString() : null,
        status: roomForm.status,
      });
      setSelectedRoom(result.room);
      setRooms((items) => items.map((item) => item.id === result.room.id ? result.room : item));
      setEditOpen(false);
      showToast('Room listing updated.', 'success');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not update this room.', 'error');
    }
  };

  const moveMedia = async (index: number, offset: -1 | 1) => {
    if (!selectedRoom) return;
    const ordered = [...selectedRoom.media];
    const target = index + offset;
    if (target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    try {
      await api.reorderRoomMedia(selectedRoom.id, ordered.map((asset) => asset.id));
      const updated = {
        ...selectedRoom,
        media: ordered.map((asset, position) => ({ ...asset, position })),
      };
      setSelectedRoom(updated);
      setRooms((items) => items.map((room) => room.id === updated.id ? updated : room));
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Could not reorder room media.', 'error');
    }
  };

  if (selectedRoom) {
    const isOwner = currentUser?.id === selectedRoom.ownerId;
    return (
      <section className="mx-auto max-w-5xl p-4 pb-24">
        <button onClick={() => setSelectedRoom(null)} className="mb-4 inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to rooms
        </button>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="grid grid-cols-2 gap-2">
              {selectedRoom.media.map((asset) => asset.resourceType === 'video'
                ? <video key={asset.id} src={asset.url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black object-cover" />
                : <img key={asset.id} src={asset.url} alt={selectedRoom.title} loading="lazy" decoding="async" className="aspect-video w-full rounded-xl bg-zinc-900 object-cover" />)}
              {selectedRoom.media.length === 0 && <div className="col-span-2 grid aspect-video place-items-center rounded-xl bg-zinc-900"><Home className="h-8 w-8 text-zinc-600" /></div>}
            </div>
            {isOwner && selectedRoom.media.length > 1 && (
              <div className="mt-2 space-y-1">
                {selectedRoom.media.map((asset, index) => (
                  <div key={asset.id} className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-1.5 text-[10px] text-zinc-400">
                    <span className="truncate">{asset.resourceType === 'video' ? 'Video' : 'Photo'} {index + 1}</span>
                    <span className="flex gap-1">
                      <button disabled={index === 0} onClick={() => void moveMedia(index, -1)} aria-label={`Move media ${index + 1} up`} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button disabled={index === selectedRoom.media.length - 1} onClick={() => void moveMedia(index, 1)} aria-label={`Move media ${index + 1} down`} className="rounded p-1 hover:bg-zinc-800 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-white">{selectedRoom.title}</h1>
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400"><MapPin className="h-3.5 w-3.5" />{selectedRoom.area}, {selectedRoom.city}</p>
              </div>
              <strong className="whitespace-nowrap text-lg text-emerald-300">₹{selectedRoom.rent.toLocaleString('en-IN')}/mo</strong>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{selectedRoom.description}</p>
            {selectedRoom.amenities.length > 0 && <p className="mt-3 text-xs text-zinc-400">Amenities: {selectedRoom.amenities.join(', ')}</p>}
            {selectedRoom.availableAt && <p className="mt-2 text-xs text-zinc-400">Available from {new Date(selectedRoom.availableAt).toLocaleDateString()}</p>}
            {isOwner && <p className="mt-2 text-xs text-zinc-400">Private address: {selectedRoom.fullAddress || 'Not provided'}</p>}
          </div>
          <aside className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-3">
              {selectedRoom.owner.avatar && <img src={selectedRoom.owner.avatar} alt="" loading="lazy" decoding="async" className="h-10 w-10 rounded-full object-cover" />}
              <div><p className="text-sm font-semibold text-white">{selectedRoom.owner.name}</p><p className="text-xs text-zinc-500">@{selectedRoom.owner.username}</p></div>
            </div>
            {!isOwner && (
              <>
                <button onClick={() => void contactOwner(selectedRoom)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500">
                  <MessageCircle className="h-4 w-4" /> Contact owner
                </button>
                <button onClick={() => void saveRoom(selectedRoom)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-2.5 text-xs font-semibold text-white hover:bg-zinc-700">
                  <Bookmark className={`h-4 w-4 ${selectedRoom.isSaved ? 'fill-amber-400 text-amber-400' : ''}`} /> {selectedRoom.isSaved ? 'Saved' : 'Save room'}
                </button>
                <form onSubmit={(event) => void sendInquiry(event)} className="mt-4 border-t border-zinc-800 pt-4">
                  <label className="block text-xs font-semibold text-zinc-300">Send an inquiry<textarea value={inquiryMessage} onChange={(event) => setInquiryMessage(event.target.value)} maxLength={2200} rows={3} required className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-white outline-none focus:border-rose-500" /></label>
                  <button type="submit" disabled={!inquiryMessage.trim()} className="mt-2 w-full rounded-lg border border-zinc-700 py-2 text-xs font-semibold text-white disabled:opacity-50">Send inquiry</button>
                </form>
              </>
            )}
            {isOwner && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => { setRoomForm({ title: selectedRoom.title, description: selectedRoom.description, city: selectedRoom.city, area: selectedRoom.area, fullAddress: selectedRoom.fullAddress, rent: String(selectedRoom.rent), roomType: selectedRoom.roomType, amenities: selectedRoom.amenities.join(', '), availableAt: selectedRoom.availableAt ? selectedRoom.availableAt.slice(0, 10) : '', status: selectedRoom.status }); setEditOpen(true); }} className="flex-1 rounded-lg bg-zinc-800 py-2 text-xs font-semibold text-white">Edit listing</button>
                <button onClick={() => void deleteRoom(selectedRoom)} aria-label="Delete room" className="rounded-lg bg-rose-950 px-3 text-rose-300"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </aside>
        </div>

        {editOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setEditOpen(false)}>
            <form onSubmit={(event) => void updateRoom(event)} onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex justify-between"><h2 className="font-bold">Edit room</h2><button type="button" onClick={() => setEditOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div>
              <RoomFields value={roomForm} onChange={setRoomForm} />
              <button className="w-full rounded-lg bg-rose-600 py-2 text-xs font-bold">Save changes</button>
            </form>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl p-4 pb-24">
      <header className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-black text-white">Rooms for rent</h1><p className="mt-1 text-xs text-zinc-500">Browse real listings from RentReel members.</p></div>
        <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" /> List a room</button>
      </header>
      <form onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); }} className="mt-5 grid gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <input value={filters.city} onChange={(event) => setFilters((value) => ({ ...value, city: event.target.value }))} placeholder="City" aria-label="Filter city" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input type="number" min="0" value={filters.minRent} onChange={(event) => setFilters((value) => ({ ...value, minRent: event.target.value }))} placeholder="Min budget" aria-label="Minimum rent" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input type="number" min="0" value={filters.maxRent} onChange={(event) => setFilters((value) => ({ ...value, maxRent: event.target.value }))} placeholder="Max budget" aria-label="Maximum rent" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input value={filters.roomType} onChange={(event) => setFilters((value) => ({ ...value, roomType: event.target.value }))} placeholder="Room type" aria-label="Room type" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input value={filters.amenities} onChange={(event) => setFilters((value) => ({ ...value, amenities: event.target.value }))} placeholder="Amenities, comma separated" aria-label="Amenities" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <input type="date" value={filters.availableBefore} onChange={(event) => setFilters((value) => ({ ...value, availableBefore: event.target.value }))} aria-label="Available by date" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs" />
        <select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value }))} aria-label="Sort rooms" className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs">
          <option value="newest">Newest</option><option value="rent-asc">Rent: low to high</option><option value="rent-desc">Rent: high to low</option>
        </select>
        <button className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white sm:col-span-3 lg:col-span-7">Apply filters</button>
      </form>

      {loading && rooms.length === 0 && <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-900" />)}</div>}
      {error && <div role="alert" className="mt-6 rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-xs text-rose-200">{error}<button onClick={() => void loadRooms()} className="ml-3 underline">Retry</button></div>}
      {!loading && !error && rooms.length === 0 && <div className="py-16 text-center text-sm text-zinc-500">No rooms match these filters.</div>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <article key={room.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            <button onClick={() => void openRoom(room)} className="block w-full text-left">
              <div className="relative aspect-[4/3] bg-zinc-950">
                {room.media[0]?.resourceType === 'video'
                  ? <video src={room.media[0].url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  : room.photos[0] ? <img src={room.photos[0]} alt={room.title} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Home className="h-9 w-9 text-zinc-700" /></div>}
                <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">{room.status.toLowerCase()}</span>
              </div>
              <div className="p-4">
                <div className="flex justify-between gap-2"><h2 className="truncate text-sm font-bold text-white">{room.title}</h2><span className="shrink-0 text-xs font-bold text-emerald-300">₹{room.rent.toLocaleString('en-IN')}</span></div>
                <p className="mt-1 text-xs text-zinc-400">{room.area}, {room.city} · {room.roomType}</p>
              </div>
            </button>
            <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
              <span className="text-[10px] text-zinc-500">By {room.owner.name}</span>
              <button onClick={() => void saveRoom(room)} aria-label={room.isSaved ? 'Unsave room' : 'Save room'} className="rounded-lg p-1.5 text-zinc-300 hover:bg-zinc-800">
                <Bookmark className={`h-4 w-4 ${room.isSaved ? 'fill-amber-400 text-amber-400' : ''}`} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {nextCursor && <button disabled={loading || loadingMore} onClick={() => void loadRooms(nextCursor)} className="mx-auto mt-6 block rounded-lg bg-zinc-800 px-5 py-2.5 text-xs font-semibold disabled:opacity-50">{loadingMore ? 'Loading…' : 'Load more rooms'}</button>}

      {createOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => !busy && setCreateOpen(false)}>
          <form onSubmit={(event) => void handleCreate(event)} onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold text-white">List a room</h2><button type="button" onClick={() => setCreateOpen(false)} disabled={busy} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <RoomFields value={roomForm} onChange={setRoomForm} />
            <label className="block rounded-lg border border-dashed border-zinc-700 p-3 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-2"><Video className="h-4 w-4" /> Photos or video (up to 10 files)</span>
              <input name="room-media" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime" className="mt-2 block w-full text-xs" />
            </label>
            {busy && <p className="text-center text-xs text-zinc-400" role="status">Uploading media: {progress}%</p>}
            <button disabled={busy} className="w-full rounded-lg bg-rose-600 py-2.5 text-xs font-bold disabled:opacity-50">{busy ? 'Publishing…' : 'Publish room'}</button>
          </form>
        </div>
      )}
    </section>
  );
};

type RoomFormState = {
  title: string; description: string; city: string; area: string; fullAddress: string;
  rent: string; roomType: string; amenities: string; availableAt: string; status: RentalRoom['status'];
};

const RoomFields: React.FC<{ value: RoomFormState; onChange: React.Dispatch<React.SetStateAction<RoomFormState>> }> = ({ value, onChange }) => (
  <>
    <label className="block text-xs text-zinc-300">Title<input required maxLength={160} value={value.title} onChange={(event) => onChange((prev) => ({ ...prev, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
    <label className="block text-xs text-zinc-300">Description<textarea required maxLength={2200} rows={3} value={value.description} onChange={(event) => onChange((prev) => ({ ...prev, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-zinc-300">City<input required maxLength={120} value={value.city} onChange={(event) => onChange((prev) => ({ ...prev, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
      <label className="text-xs text-zinc-300">Area<input required maxLength={160} value={value.area} onChange={(event) => onChange((prev) => ({ ...prev, area: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
      <label className="text-xs text-zinc-300">Monthly rent<input required type="number" min="1" value={value.rent} onChange={(event) => onChange((prev) => ({ ...prev, rent: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
      <label className="text-xs text-zinc-300">Room type<input required maxLength={40} value={value.roomType} onChange={(event) => onChange((prev) => ({ ...prev, roomType: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
    </div>
    <label className="block text-xs text-zinc-300">Private full address<input maxLength={500} value={value.fullAddress} onChange={(event) => onChange((prev) => ({ ...prev, fullAddress: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
    <label className="block text-xs text-zinc-300">Amenities (comma separated)<input value={value.amenities} onChange={(event) => onChange((prev) => ({ ...prev, amenities: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-zinc-300">Available from<input type="date" value={value.availableAt} onChange={(event) => onChange((prev) => ({ ...prev, availableAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white" /></label>
      <label className="text-xs text-zinc-300">Status<select value={value.status} onChange={(event) => onChange((prev) => ({ ...prev, status: event.target.value as RentalRoom['status'] }))} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option><option value="RENTED">Rented</option></select></label>
    </div>
  </>
);
