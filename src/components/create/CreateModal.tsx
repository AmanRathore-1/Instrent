import React, { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, MapPin, Trash2, Upload, Video, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';

const acceptedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const acceptedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const maxImageSize = 10 * 1024 * 1024;
const maxVideoSize = 100 * 1024 * 1024;

type ComposerMode = 'post' | 'reel';

export const CreateModal: React.FC = () => {
  const {
    currentUser,
    isCreateModalOpen,
    createModalTab,
    closeCreateModal,
    showToast,
    openUserProfile,
    setActiveView,
  } = useApp();
  const mode: ComposerMode = createModalTab;
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<Array<string | null>>([]);
  const [photoProgress, setPhotoProgress] = useState<number[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [rent, setRent] = useState('');
  const [roomType, setRoomType] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const previewUrls = useRef<string[]>([]);
  const videoElement = useRef<HTMLVideoElement>(null);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!video || !videoElement.current) return;
    const url = URL.createObjectURL(video);
    const element = videoElement.current;
    element.src = url;
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [video]);

  if (!isCreateModalOpen) return null;

  const resetComposer = () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
    setPhotos([]);
    setPreviews([]);
    setUploadedPhotoIds([]);
    setPhotoProgress([]);
    setVideo(null);
    setUploadedVideoId(null);
    setUploadProgress(0);
    setCaption('');
    setLocation('');
    setRent('');
    setRoomType('');
  };

  const closeComposer = () => {
    if (isPublishing) return;
    resetComposer();
    closeCreateModal();
  };

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
    setUploadedPhotoIds((items) => [...items, ...added.map(() => null)]);
    setPhotoProgress((items) => [...items, ...added.map(() => 0)]);
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
    setUploadedPhotoIds((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setPhotoProgress((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const selectVideo = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!selected) return;
    if (!acceptedVideoTypes.includes(selected.type) || selected.size > maxVideoSize) {
      showToast('Use an MP4, WebM, or MOV video up to 100 MB.', 'warning');
      return;
    }
    setVideo(selected);
    setUploadedVideoId(null);
    setUploadProgress(0);
  };

  const publishPost = async () => {
    const outcomes = await Promise.allSettled(photos.map(async (photo, index) => {
      const savedId = uploadedPhotoIds[index];
      if (savedId) return savedId;
      const uploaded = await api.uploadMedia(photo, 'image', (percent) => {
        setPhotoProgress((items) => items.map((value, itemIndex) => itemIndex === index ? percent : value));
      });
      setUploadedPhotoIds((items) => items.map((value, itemIndex) => itemIndex === index ? uploaded.publicId : value));
      return uploaded.publicId;
    }));
    const failedUpload = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failedUpload?.status === 'rejected') throw failedUpload.reason;
    const publicIds = outcomes.map((outcome) => {
      if (outcome.status !== 'fulfilled') throw outcome.reason;
      return outcome.value;
    });
    await api.createPost({
      publicIds,
      caption: caption.trim(),
      location: location.trim(),
      rentAmount: rent ? Number(rent) : undefined,
      roomType: roomType || undefined,
    });
  };

  const publishReel = async () => {
    let publicId = uploadedVideoId;
    if (!publicId && video) {
      const uploaded = await api.uploadMedia(video, 'video', setUploadProgress);
      publicId = uploaded.publicId;
      setUploadedVideoId(publicId);
    }
    if (!publicId) throw new Error('Choose a video before publishing.');
    await api.createReel({
      publicId,
      caption: caption.trim(),
      location: location.trim(),
    });
  };

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!caption.trim()) {
      showToast('Write a caption before publishing.', 'warning');
      return;
    }
    if (mode === 'post' && photos.length === 0) {
      showToast('Add at least one photo of the room.', 'warning');
      return;
    }
    if (mode === 'reel' && !video) {
      showToast('Choose a video for your reel.', 'warning');
      return;
    }

    setIsPublishing(true);
    try {
      if (mode === 'post') {
        await publishPost();
        showToast('Room post shared.', 'success');
        resetComposer();
        closeCreateModal();
        if (currentUser) openUserProfile(currentUser.username);
      } else {
        await publishReel();
        showToast('Your reel is live.', 'success');
        resetComposer();
        closeCreateModal();
        if (currentUser) openUserProfile(currentUser.username);
        else setActiveView('reels');
      }
    } catch (error) {
      console.error(`Failed to upload or publish ${mode}:`, error);
      showToast(error instanceof Error ? error.message : 'Could not publish your content. Your verified uploads are ready to retry.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const verifiedPhotos = uploadedPhotoIds.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
      onClick={closeComposer}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">
              {mode === 'post' ? 'Create a room post' : 'Create a room reel'}
            </p>
            <h2 id="create-room-title" className="mt-1 text-lg font-bold text-white">
              {mode === 'post' ? 'Share your space' : 'Upload a room tour'}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              {mode === 'post'
                ? 'Share room photos on your profile.'
                : 'Upload a room tour video from your profile.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeComposer}
            disabled={isPublishing}
            aria-label="Close"
            className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={publish} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            {mode === 'post' ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {previews.map((preview, index) => (
                    <div key={preview} className="group relative aspect-square overflow-hidden rounded-2xl bg-zinc-900">
                      <img src={preview} alt={`Room photo ${index + 1}`} className="h-full w-full object-cover" />
                      {uploadedPhotoIds[index] ? (
                        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-emerald-950/90 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                          <Check className="h-3 w-3" /> Verified
                        </span>
                      ) : isPublishing && (
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2">
                          <div className="h-1 overflow-hidden rounded-full bg-white/20">
                            <div className="h-full bg-rose-400 transition-all" style={{ width: `${photoProgress[index] ?? 0}%` }} />
                          </div>
                          <p className="mt-1 text-right text-[9px] text-white">{photoProgress[index] ?? 0}%</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        disabled={isPublishing}
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute right-2 top-2 rounded-full bg-black/75 p-2 text-white opacity-100 transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 disabled:hidden"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 10 && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-4 text-center transition hover:border-rose-400 hover:bg-zinc-900">
                      <span className="rounded-2xl bg-rose-500/10 p-3 text-rose-300"><Upload className="h-5 w-5" /></span>
                      <span className="text-xs font-semibold text-white">{photos.length ? 'Add photos' : 'Choose photos'}</span>
                      <span className="text-[10px] text-zinc-500">Up to 10 · 10 MB each</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={addPhotos} disabled={isPublishing} className="sr-only" />
                    </label>
                  )}
                </div>
                {verifiedPhotos > 0 && (
                  <p className="flex items-center gap-2 text-[11px] text-emerald-300" role="status">
                    <Check className="h-3.5 w-3.5" /> {verifiedPhotos} of {photos.length} photos uploaded and verified. You can retry publishing without re-uploading them.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {video ? (
                  <div className="relative mx-auto aspect-[9/12] max-h-[360px] overflow-hidden rounded-2xl bg-black">
                    <video ref={videoElement} controls playsInline className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => { setVideo(null); setUploadedVideoId(null); setUploadProgress(0); }}
                      disabled={isPublishing}
                      aria-label="Remove selected video"
                      className="absolute right-3 top-3 rounded-full bg-black/75 p-2 text-white hover:bg-rose-600 disabled:hidden"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {uploadedVideoId && (
                      <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-emerald-950/90 px-3 py-1.5 text-[10px] font-semibold text-emerald-300">
                        <Check className="h-3 w-3" /> Video uploaded and verified
                      </span>
                    )}
                  </div>
                ) : (
                  <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center transition hover:border-rose-400 hover:bg-zinc-900">
                    <span className="rounded-2xl bg-rose-500/10 p-4 text-rose-300"><Video className="h-6 w-6" /></span>
                    <span className="text-sm font-semibold text-white">Choose a room tour video</span>
                    <span className="text-xs text-zinc-500">MP4, WebM, or MOV · up to 100 MB</span>
                    <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={selectVideo} disabled={isPublishing} className="sr-only" />
                  </label>
                )}
                {isPublishing && !uploadedVideoId && (
                  <div role="status" className="space-y-1 text-[11px] text-zinc-400">
                    <div className="flex justify-between"><span>Uploading video to Cloudinary</span><span>{uploadProgress}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full bg-rose-400 transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <label className="block text-xs font-semibold text-zinc-300">
              Caption
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={2200}
                rows={3}
                required
                disabled={isPublishing}
                placeholder={mode === 'post'
                  ? 'Describe the room, availability, and who you’re hoping to live with.'
                  : 'Tell people what makes this space special.'}
                className="mt-1.5 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-3 text-xs font-normal text-white outline-none placeholder:text-zinc-600 border-white focus:border-white disabled:opacity-60"
              />
              <span className="mt-1 block text-right font-normal text-zinc-500">{caption.length}/2200</span>
            </label>

            {mode === 'reel' && (
              <label className="block text-xs font-semibold text-zinc-300">
                Location (optional)
                <span className="relative mt-1.5 block">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                  <input
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    maxLength={120}
                    disabled={isPublishing}
                    placeholder="Area, city"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500 disabled:opacity-60"
                  />
                </span>
              </label>
            )}

            {mode === 'post' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-zinc-300">
                    Location
                    <span className="relative mt-1.5 block">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-zinc-500" />
                      <input
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        maxLength={120}
                        disabled={isPublishing}
                        placeholder="Area, city"
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-9 pr-3 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500 disabled:opacity-60"
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
                      disabled={isPublishing}
                      placeholder="₹"
                      className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-normal text-white outline-none placeholder:text-zinc-600 focus:border-rose-500 disabled:opacity-60"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-zinc-300">
                  Room type (optional)
                  <select
                    value={roomType}
                    onChange={(event) => setRoomType(event.target.value)}
                    disabled={isPublishing}
                    className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs font-normal text-white outline-none focus:border-rose-500 disabled:opacity-60"
                  >
                    <option value="">Choose room type</option>
                    <option value="Private room">Private room</option>
                    <option value="Shared room">Shared room</option>
                    <option value="Flatmate wanted">Flatmate wanted</option>
                    <option value="PG">PG</option>
                  </select>
                </label>
              </>
            )}
          </div>

          <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-4 sm:px-6">
            <button
              type="submit"
              disabled={isPublishing || !caption.trim() || (mode === 'post' ? photos.length === 0 : !video)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 py-3.5 text-xs font-bold text-white shadow-lg shadow-rose-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === 'post' ? <ImagePlus className="h-4 w-4" /> : <Film className="h-4 w-4" />}
              {isPublishing ? 'Uploading and publishing...' : mode === 'post' ? 'Share photo post' : 'Publish video reel'}
            </button>
            <p className="mt-2 text-center text-[10px] text-zinc-500">
              {isPublishing
                ? 'Your media is uploaded securely, then saved to your profile.'
                : 'Uploads are verified before your content is published.'}
            </p>
          </footer>
        </form>
      </section>
    </div>
  );
};
