import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './loading.css';
export { PageLoader } from './PageLoader.tsx';

type DelayedFlagOptions = { showAfter?: number; minimumVisible?: number };

export function useDelayedFlag(active: boolean, options: DelayedFlagOptions = {}) {
  const { showAfter = 180, minimumVisible = 300 } = options;
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (active) {
      const timer = window.setTimeout(() => {
        shownAt.current = Date.now();
        visibleRef.current = true;
        setVisible(true);
      }, showAfter);
      return () => window.clearTimeout(timer);
    }
    if (!visibleRef.current) return undefined;
    const elapsed = shownAt.current ? Date.now() - shownAt.current : minimumVisible;
    const timer = window.setTimeout(() => {
      shownAt.current = null;
      visibleRef.current = false;
      setVisible(false);
    }, Math.max(0, minimumVisible - elapsed));
    return () => window.clearTimeout(timer);
  }, [active, minimumVisible, showAfter]);

  return visible;
}

export function Spinner({ size = 16, standalone = false }: { size?: 14 | 16 | 18 | 24; standalone?: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 animate-loading-spin rounded-full border-2 border-current border-t-transparent ${standalone ? 'align-middle' : ''}`}
      style={{ width: size, height: size }}
      role={standalone ? 'status' : undefined}
      aria-label={standalone ? 'Loading' : undefined}
    />
  );
}

export function Skeleton({ className = '', width, height, rounded = 'rounded-xl' }: {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: string;
}) {
  return (
    <span
      className={`block animate-loading-shimmer bg-zinc-800/80 transition-opacity duration-150 ${rounded} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className} aria-busy="true"><span className="sr-only">Loading {label}</span>{children}</div>;
}

export function ConversationListSkeleton({ count = 5 }: { count?: number }) {
  return <SkeletonGroup label="conversations" className="divide-y divide-zinc-800/60">{Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center gap-3.5 p-4"><Skeleton width={42} height={42} rounded="rounded-full" /><div className="min-w-0 flex-1 space-y-2"><Skeleton height={12} className="w-2/3" /><Skeleton height={10} className="w-1/2" /></div></div>)}</SkeletonGroup>;
}

export function ProfileSkeleton() {
  return <SkeletonGroup label="profile" className="mx-auto max-w-3xl space-y-5 px-4 py-10"><div className="flex items-center gap-4"><Skeleton width={80} height={80} rounded="rounded-full" /><div className="flex-1 space-y-3"><Skeleton height={18} className="w-1/2" /><Skeleton height={12} className="w-2/3" /></div></div><Skeleton height={90} /><div className="grid grid-cols-3 gap-3"><Skeleton height={100} rounded="rounded-2xl" /><Skeleton height={100} rounded="rounded-2xl" /><Skeleton height={100} rounded="rounded-2xl" /></div></SkeletonGroup>;
}

export function CommentSkeleton({ count = 2 }: { count?: number }) {
  return <SkeletonGroup label="comments" className="space-y-2">{Array.from({ length: count }, (_, index) => <div key={index} className="flex items-center gap-2"><Skeleton width={24} height={24} rounded="rounded-full" /><Skeleton height={11} className="w-2/3" /></div>)}</SkeletonGroup>;
}

export function NotificationSkeleton({ count = 4 }: { count?: number }) {
  return <SkeletonGroup label="notifications" className="space-y-2 p-2">{Array.from({ length: count }, (_, index) => <div key={index} className="flex items-start gap-3 rounded-2xl p-3.5"><Skeleton width={36} height={36} rounded="rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton height={12} className="w-2/3" /><Skeleton height={10} className="w-full" /><Skeleton height={10} className="w-1/3" /></div></div>)}</SkeletonGroup>;
}

export function PostSkeleton({ count = 2 }: { count?: number }) {
  return <SkeletonGroup label="posts" className="space-y-4">{Array.from({ length: count }, (_, index) => <article key={index} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70"><div className="flex items-center gap-3 p-4"><Skeleton width={36} height={36} rounded="rounded-full" /><Skeleton height={12} className="w-1/3" /></div><Skeleton height={260} rounded="rounded-none" /><div className="space-y-3 p-4"><Skeleton height={12} className="w-2/3" /><Skeleton height={10} className="w-1/2" /></div></article>)}</SkeletonGroup>;
}

export function RoomCardSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonGroup label="rooms" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: count }, (_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900"><Skeleton height={190} rounded="rounded-none" /><div className="space-y-3 p-4"><Skeleton height={14} className="w-2/3" /><Skeleton height={11} className="w-1/2" /></div></div>)}</SkeletonGroup>;
}

export function ButtonLoader({ label, busyLabel = 'Working...' }: { label: ReactNode; busyLabel?: string }) {
  return <span className="inline-flex min-w-0 items-center justify-center gap-2"><span className={busyLabel ? '' : 'invisible'}>{busyLabel}</span><span className="absolute"><Spinner size={16} /></span><span className="invisible">{label}</span></span>;
}

export function InlineLoader({ label = 'Loading' }: { label?: string }) {
  return <span className="inline-flex items-center gap-2 text-xs text-zinc-400" role="status"><Spinner size={14} />{label}</span>;
}

export function LoadingButton({ busy, children, busyLabel = 'Working...', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel?: string }) {
  return <button {...props} disabled={busy || props.disabled} aria-busy={busy} className={className}>{busy ? <ButtonLoader label={children} busyLabel={busyLabel} /> : children}</button>;
}
