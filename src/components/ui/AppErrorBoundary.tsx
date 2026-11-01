import React from 'react';

type State = { hasError: boolean };

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
        <div>
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-sm text-zinc-400">Reload InstRent to continue.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-xl bg-gradient-to-r from-rose-500 to-amber-400 px-5 text-sm font-bold">
            Reload
          </button>
        </div>
      </main>
    );
  }
}
