export function BootLoader({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-6 text-zinc-100" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-2xl bg-gradient-to-br from-rose-500 to-amber-400" />
        <p className="text-sm text-zinc-300">{message}...</p>
      </div>
    </main>
  );
}
