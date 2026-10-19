import React from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const SettingsView: React.FC = () => {
  const { currentUser, openUserProfile, signOut } = useApp();

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <h1 className="text-2xl font-bold text-white">Account</h1>
      <p className="mt-1 text-xs text-zinc-400">Manage your profile and sign-in session.</p>

      {currentUser && (
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          {currentUser.avatar ? (
            <img src={currentUser.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-lg font-bold text-white">
              {currentUser.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{currentUser.name}</p>
            <p className="truncate text-xs text-zinc-400">@{currentUser.username}</p>
          </div>
          <button
            onClick={() => openUserProfile(currentUser.username)}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
          >
            <UserRound className="h-4 w-4" />
            Profile
          </button>
        </div>
      )}

      <button
        onClick={() => void signOut()}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-900 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </section>
  );
};
