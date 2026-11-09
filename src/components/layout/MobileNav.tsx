import React from 'react';
import { Film, Home, PlusCircle, MessageSquare, User, Building2 } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export const MobileNav: React.FC = () => {
  const {
    activeView,
    setActiveView,
    openCreateModal,
    unreadMessagesCount,
    currentUser,
    openUserProfile,
  } = useApp();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] w-full items-start justify-around gap-0 border-t border-zinc-800 bg-zinc-950/95 px-0.5 pt-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      {/* Home */}
      <button
        onClick={() => setActiveView('home')}
        className={`flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 transition-colors ${
          activeView === 'home' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Home className="w-5 h-5 stroke-[2.2]" />
        <span className="mt-0.5 max-w-full truncate text-[9px] font-semibold min-[375px]:text-[10px]">Home</span>
      </button>

      {/* Rooms */}
      <button
        onClick={() => setActiveView('rooms')}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
          activeView === 'rooms' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Building2 className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] mt-0.5 font-semibold">Rooms</span>
      </button>

      <button
        onClick={() => setActiveView('reels')}
        aria-label="Reels"
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
          activeView === 'reels' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Film className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] mt-0.5 font-semibold">Reels</span>
      </button>

      {/* Post Room Button (Prominent Callout) */}
      <button
        onClick={() => openCreateModal('post')}
        title="Post a room"
        className="flex h-12 w-12 shrink-0 flex-col items-center justify-center -mt-4 rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 text-white shadow-lg shadow-rose-500/30 active:scale-95 transition-transform"
      >
        <PlusCircle className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Messages */}
      <button
        onClick={() => setActiveView('messages')}
        className={`relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 transition-colors ${
          activeView === 'messages' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <MessageSquare className="w-5 h-5 stroke-[2.2]" />
        {unreadMessagesCount > 0 && (
          <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-zinc-950" />
        )}
        <span className="text-[10px] mt-0.5 font-semibold">Messages</span>
      </button>

      {/* Saved / Profile */}
      <button
        onClick={() => {
          if (currentUser) {
            openUserProfile(currentUser.username);
          } else {
            setActiveView('saved');
          }
        }}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
          activeView === 'user-profile' || activeView === 'saved'
            ? 'text-rose-500'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        {currentUser?.avatar ? (
          <img
            src={currentUser.avatar}
            alt="Profile"
            className="w-5 h-5 rounded-full object-cover border border-zinc-700"
          />
        ) : (
          <User className="w-5 h-5 stroke-[2.2]" />
        )}
        <span className="text-[10px] mt-0.5 font-semibold">Profile</span>
      </button>
    </nav>
  );
};
