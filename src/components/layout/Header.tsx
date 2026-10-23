import React from 'react';
import { Bell, LogOut, Plus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const Header: React.FC<{
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
}> = ({ onOpenSearch, onOpenNotifications }) => {
  const { openCreateModal, signOut } = useApp();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl lg:px-8">
      <button
        onClick={onOpenSearch}
        className="group flex min-w-0 max-w-md flex-1 items-center gap-3 rounded-full border border-white bg-zinc-900 px-4 py-2 text-left text-sm text-zinc-300 shadow-inner transition-all hover:bg-zinc-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <Search className="h-4 w-4 shrink-0 text-white" />
        <span className="truncate text-zinc-400">Find roommates and rooms...</span>
      </button>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenNotifications}
          aria-label="Notifications"
          className="rounded-full border border-zinc-800 bg-zinc-900 p-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          onClick={() => openCreateModal('post')}
          className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-rose-500/20 transition-opacity hover:opacity-95 sm:flex"
        >
          <Plus className="h-3.5 w-3.5 stroke-[3]" />
          <span>Post a room</span>
        </button>
        <button
          onClick={() => void signOut()}
          className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
};
