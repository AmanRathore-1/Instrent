import React from 'react';
import { Building2, Film, Home, MessageSquare, PlusCircle, Settings, UserRound, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const Sidebar: React.FC = () => {
  const { currentUser, activeView, setActiveView, openCreateModal, openUserProfile } = useApp();

  const navigation = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'reels' as const, label: 'Reels', icon: Film },
    { id: 'roommates' as const, label: 'Find Roommate', icon: Users },
    { id: 'messages' as const, label: 'Messages', icon: MessageSquare },
  ];

  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-20 shrink-0 flex-col justify-between border-r border-white/[0.06] bg-zinc-950/90 p-3 shadow-2xl shadow-black/20 md:flex lg:w-72 lg:p-5">
      <div className="min-w-0">
        <button
          onClick={() => setActiveView('home')}
          aria-label="InstRent home"
          className="group flex w-full min-w-0 items-center justify-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-white/[0.04] lg:justify-start"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 shadow-lg shadow-rose-500/20 transition-transform group-hover:scale-105">
            <Building2 className="h-5 w-5 text-white" />
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="block text-xl font-black tracking-tight text-white">Inst<span className="bg-gradient-to-r from-rose-400 to-orange-300 bg-clip-text text-transparent">Rent</span></span>
            <span className="block truncate text-[11px] font-medium text-zinc-400">Rooms and roommates</span>
          </span>
        </button>

        <nav aria-label="Main navigation" className="mt-8 space-y-2">
          {navigation.map(({ id, label, icon: Icon }) => {
            const selected = activeView === id;
            return (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                aria-label={label}
                title={label}
                aria-current={selected ? 'page' : undefined}
                className={`flex w-full items-center justify-center gap-3.5 rounded-2xl border px-2 py-3 text-sm font-semibold transition-colors lg:justify-start lg:px-3.5 ${
                  selected ? 'border-rose-400/20 bg-gradient-to-r from-rose-500/15 to-orange-400/5 text-white shadow-lg shadow-rose-950/20' : 'border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon className={`h-5 w-5 shrink-0 ${selected ? 'text-rose-400' : 'text-zinc-400'}`} />
                <span className="hidden lg:inline">{label}</span>
              </button>
            );
          })}
          <button
            onClick={() => openCreateModal('post')}
            aria-label="Post a room"
            title="Post a room"
            className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 px-2 py-3 text-sm font-extrabold text-white shadow-xl shadow-rose-950/30 transition-opacity hover:opacity-95 lg:justify-start lg:px-3.5"
          >
            <PlusCircle className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">Post a room</span>
          </button>
        </nav>
      </div>

      <div className="min-w-0 space-y-2 border-t border-white/[0.06] pt-4">
        <button
          onClick={() => setActiveView('settings')}
          aria-label="Account settings"
          title="Account"
          className={`flex w-full items-center justify-center gap-3.5 rounded-2xl border px-2 py-3 text-sm font-semibold transition-colors lg:justify-start lg:px-3.5 ${
            activeView === 'settings' ? 'border-rose-400/20 bg-rose-500/10 text-white' : 'border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <Settings className="h-5 w-5 shrink-0 text-zinc-400" />
          <span className="hidden lg:inline">Account</span>
        </button>
        {currentUser && (
          <button
            onClick={() => openUserProfile(currentUser.username)}
            aria-label="Open profile"
            title={currentUser.name}
            className={`flex w-full min-w-0 items-center justify-center gap-3 rounded-xl px-2 py-2 text-left transition-colors lg:justify-start ${
              activeView === 'user-profile' ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
            }`}
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full border border-zinc-700 object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-white">
                {currentUser.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="hidden min-w-0 lg:block">
              <span className="block truncate text-xs font-bold text-white">{currentUser.name}</span>
              <span className="block truncate text-[10px] text-zinc-400">@{currentUser.username}</span>
            </span>
            <UserRound className="ml-auto hidden h-4 w-4 shrink-0 text-zinc-500 lg:block" />
          </button>
        )}
      </div>
    </aside>
  );
};
