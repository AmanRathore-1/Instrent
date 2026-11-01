import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

type ImageCarouselProps = {
  images: string[];
  alt: string;
  className?: string;
};

const isImageUrl = (value: string) => value.trim().length > 0;

export const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, alt, className = '' }) => {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const availableImages = useMemo(
    () => images.filter((image) => isImageUrl(image) && !failedImages.has(image)),
    [failedImages, images],
  );

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(availableImages.length - 1, 0)));
  }, [availableImages.length]);

  useEffect(() => {
    if (!galleryOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGalleryOpen(false);
      if (event.key === 'ArrowLeft') setIndex((current) => (current - 1 + availableImages.length) % availableImages.length);
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % availableImages.length);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [availableImages.length, galleryOpen]);

  const markFailed = (image: string) => {
    setFailedImages((current) => new Set(current).add(image));
  };

  const move = (offset: number) => {
    if (availableImages.length < 2) return;
    setIndex((current) => (current + offset + availableImages.length) % availableImages.length);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0]?.clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) >= 40) move(distance > 0 ? -1 : 1);
  };

  const navigation = availableImages.length > 1 && (
    <>
      <button
        type="button"
        aria-label="Previous image"
        onClick={(event) => { event.stopPropagation(); move(-1); }}
        className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-zinc-950/65 p-2 text-white opacity-0 shadow-lg transition hover:bg-rose-500/80 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Next image"
        onClick={(event) => { event.stopPropagation(); move(1); }}
        className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-zinc-950/65 p-2 text-white opacity-0 shadow-lg transition hover:bg-rose-500/80 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <>
      <div
        className={`group relative h-full w-full overflow-hidden ${className}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {availableImages[index] ? (
          <button type="button" className="block h-full w-full cursor-zoom-in" onClick={() => setGalleryOpen(true)} aria-label={`Open ${alt} gallery`}>
            <img
              src={availableImages[index]}
              alt={alt}
              loading="lazy"
              decoding="async"
              onError={() => markFailed(availableImages[index])}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ) : (
          <div className="grid h-full place-items-center text-xs text-zinc-600">No room photo</div>
        )}
        {navigation}
        {availableImages.length > 1 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-zinc-950/70 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
            {index + 1}/{availableImages.length}
          </div>
        )}
        {availableImages.length > 1 && (
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-zinc-950/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md">
            {availableImages.length} photos
          </span>
        )}
      </div>

      {galleryOpen && availableImages.length > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setGalleryOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${alt} gallery`}
            className="group relative flex h-full w-full max-w-6xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => setGalleryOpen(false)} aria-label="Close gallery" className="absolute right-0 top-0 z-10 rounded-full bg-zinc-900/80 p-2 text-white transition hover:bg-rose-500/80">
              <X className="h-5 w-5" />
            </button>
            <img src={availableImages[index]} alt={alt} onError={() => markFailed(availableImages[index])} className="max-h-[88vh] max-w-full rounded-xl object-contain" />
            {navigation}
            {availableImages.length > 1 && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-zinc-900/80 px-3 py-1 text-xs text-white">{index + 1}/{availableImages.length}</span>}
          </section>
        </div>
      )}
    </>
  );
};
