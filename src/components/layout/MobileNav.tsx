import React from 'react';
import { Film, Home, PlusCircle, MessageSquare, User } from 'lucide-react';
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

  const itemClass = (isActive: boolean) =>
    `flex h-12 min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-0.5 transition-colors ${
      isActive ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
    }`;

  const labelClass = 'mt-0.5 max-w-full truncate text-[9px] font-semibold min-[375px]:text-[10px]';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] w-full items-center justify-between gap-0 border-t border-zinc-800 bg-zinc-950/95 px-1 pt-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <button onClick={() => setActiveView('home')} aria-label="Home" className={itemClass(activeView === 'home')}>
        <Home className="h-5 w-5 shrink-0 stroke-[2.2]" />
        <span className={labelClass}>Home</span>
      </button>

      <button onClick={() => setActiveView('reels')} aria-label="Reels" className={itemClass(activeView === 'reels')}>
        <Film className="h-5 w-5 shrink-0 stroke-[2.2]" />
        <span className={labelClass}>Reels</span>
      </button>

      <button
        onClick={() => openCreateModal('post')}
        title="Post a room"
        aria-label="Post a room"
        className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl"
      >
        <span className="flex h-12 w-12 shrink-0 -translate-y-2 items-center justify-center rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 text-white shadow-lg shadow-rose-500/30 transition-transform active:scale-95">
          <PlusCircle className="h-6 w-6 stroke-[2.5]" />
        </span>
      </button>

      <button onClick={() => setActiveView('messages')} aria-label="Messages" className={itemClass(activeView === 'messages')}>
        <span className="relative">
          <MessageSquare className="h-5 w-5 shrink-0 stroke-[2.2]" />
          {unreadMessagesCount > 0 && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-zinc-950" />
          )}
        </span>
        <span className={labelClass}>Messages</span>
      </button>

      <button
        onClick={() => {
          if (currentUser) {
            openUserProfile(currentUser.username);
          } else {
            setActiveView('saved');
          }
        }}
        aria-label="Profile"
        className={itemClass(activeView === 'user-profile' || activeView === 'saved')}
      >
        {currentUser?.avatar ? (
          <img src={currentUser.avatar} alt="Profile" className="h-5 w-5 shrink-0 rounded-full border border-zinc-700 object-cover" />
        ) : (
          <User className="h-5 w-5 shrink-0 stroke-[2.2]" />
        )}
        <span className={labelClass}>Profile</span>
      </button>
    </nav>
  );
};
