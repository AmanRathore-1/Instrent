import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, MapPin, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';

const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const maxImageSize = 10 * 1024 * 1024;

export const CreateModal: React.FC = () => {
  const {
    currentUser,
    isCreateModalOpen,
    closeCreateModal,
    showToast,
    openUserProfile,
  } = useApp();
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [rent, setRent] = useState('');
  const [roomType, setRoomType] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const previewUrls = useRef<string[]>([]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  if (!isCreateModalOpen) return null;

  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const valid = selected.filter((file) => acceptedImageTypes.includes(file.type) && file.size <= maxImageSize);
    if (valid.length !== selected.length) {
      showToast('Use JPEG, PNG, WebP, or AVIF photos up to 10 MB each.', 'warning');
    }
    const added = valid.slice(0, Math.max(0, 10 - photos.length));
    if (added.length < valid.length) showToast('A post can contain up to 10 photos.', 'warning');
    const urls = added.map((file) => URL.createObjectURL(file));
    previewUrls.current = [...previewUrls.current, ...urls];
    setPhotos((items) => [...items, ...added]);
    setPreviews((items) => [...items, ...urls]);
    event.target.value = '';
  };

  const removePhoto = (index: number) => {
    const url = previews[index];
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.current = previewUrls.current.filter((item) => item !== url);
    }
    setPhotos((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setPreviews((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const publishPost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (photos.length === 0) {
      showToast('Add at least one photo of the room.', 'warning');
      return;
    }
    if (!caption.trim()) {
      showToast('Write a caption before posting.', 'warning');
      return;
    }

    setIsPublishing(true);
    try {
      const completed = photos.map(() => 0);
      const uploaded = await Promise.all(photos.map((photo, index) =>
        api.uploadMedia(photo, 'image', (percent) => {
          completed[index] = percent;
          setUploadProgress(Math.round(completed.reduce((total, value) => total + value, 0) / completed.length));
        }),
      ));
      await api.createPost({
        publicIds: uploaded.map((asset) => asset.publicId),
        caption: caption.trim(),
        location: location.trim(),
        rentAmount: rent ? Number(rent) : undefined,
        roomType: roomType || undefined,
      });
      showToast('Room post shared.', 'success');
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
      setPhotos([]);
      setPreviews([]);
      setCaption('');
      setLocation('');
      setRent('');
      setRoomType('');
      setUploadProgress(0);
      closeCreateModal();
      if (currentUser) openUserProfile(currentUser.username);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not publish your room post.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
      onClick={closeCreateModal}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 id="create-room-title" className="text-base font-bold text-white">Share a room</h2>
            <p className="mt-1 text-xs text-zinc-400">Post real photos to your profile and roommate feed.</p>
          </div>
          <button onClick={closeCreateModal} aria-label="Close" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={publishPost} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((preview, index) => (
                  <div key={preview} className="group relative aspect-square overflow-hidden rounded-lg bg-zinc-950">
                    <img src={preview} alt={`Room photo ${index + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      aria-label={`Remove photo ${index + 1}`}
                      className="absolute right-2 top-2 rounded-full bg-black/75 p-2 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < 10 && (
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 p-5 text-center hover:border-rose-400">
                <span className="rounded-full bg-rose-500/10 p-3 text-rose-300">
                  <Upload className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-white">
                  {photos.length ? 'Add more room photos' : 'Choose room photos'}
                </span>
                <span className="text-[10px] text-zinc-500">JPEG, PNG, WebP or AVIF · up to 10 MB each</span>
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={addPhotos} className="sr-only" />
              </label>
            )}

            <label className="block text-xs font-semibold text-zinc-300">
              Caption
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={2200}
                rows={4}
                required
                placeholder="Describe the room, availability, and who you’re hoping to live with."
                className="mt-1.5 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500"
              />
              <span className="mt-1 block text-right font-normal text-zinc-500">{caption.length}/2200</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-300">
                Location
                <span className="relative mt-1.5 block">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    maxLength={120}
                    placeholder="Area, city"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-9 pr-3 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500"
                  />
                </span>
              </label>
              <label className="text-xs font-semibold text-zinc-300">
                Monthly rent (optional)
                <input
                  type="number"
                  min="1"
                  value={rent}
                  onChange={(event) => setRent(event.target.value)}
                  placeholder="₹"
                  className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500"
                />
              </label>
            </div>

            <label className="block text-xs font-semibold text-zinc-300">
              Room type (optional)
              <select
                value={roomType}
                onChange={(event) => setRoomType(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-normal text-white outline-none focus:border-rose-500"
              >
                <option value="">Choose room type</option>
                <option value="Private room">Private room</option>
                <option value="Shared room">Shared room</option>
                <option value="Flatmate wanted">Flatmate wanted</option>
                <option value="PG">PG</option>
              </select>
            </label>
          </div>

          <footer className="border-t border-zinc-800 p-4">
            <button
              type="submit"
              disabled={isPublishing || photos.length === 0 || !caption.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-bold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ImagePlus className="h-4 w-4" />
              {isPublishing ? 'Publishing...' : 'Share post'}
            </button>
            {isPublishing && (
              <p className="mt-2 text-center text-[10px] text-zinc-400" role="status">
                Uploading room photos: {uploadProgress}%
              </p>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
};
