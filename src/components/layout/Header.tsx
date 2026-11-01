import React from 'react';
import { Bell, LogOut, Plus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const Header: React.FC<{
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
}> = ({ onOpenSearch, onOpenNotifications }) => {
  const { openCreateModal, signOut } = useApp();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-white/[0.06] bg-zinc-950/75 px-4 py-4 backdrop-blur-2xl lg:px-8">
      <button
        onClick={onOpenSearch}
        className="group flex min-w-0 max-w-xl flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-left text-sm text-zinc-300 shadow-inner transition-all hover:border-rose-400/30 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30"
      >
        <Search className="h-4 w-4 shrink-0 text-white" />
        <span className="truncate text-zinc-400">Search rooms by location, university or keywords...</span>
      </button>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenNotifications}
          aria-label="Notifications"
          className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-zinc-300 transition-colors hover:border-rose-400/30 hover:bg-white/[0.08] hover:text-white"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          onClick={() => openCreateModal('post')}
          className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-400 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-950/30 transition-opacity hover:opacity-95 sm:flex"
        >
          <Plus className="h-3.5 w-3.5 stroke-[3]" />
          <span>Post a room</span>
        </button>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
};
