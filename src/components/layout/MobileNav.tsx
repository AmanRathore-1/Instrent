import React from 'react';
import { Film, Home, Users, PlusCircle, MessageSquare, User } from 'lucide-react';
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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 flex items-center justify-around px-2 z-40">
      {/* Home */}
      <button
        onClick={() => setActiveView('home')}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
          activeView === 'home' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Home className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] mt-0.5 font-semibold">Home</span>
      </button>

      {/* Find Roommate */}
      <button
        onClick={() => setActiveView('roommates')}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
          activeView === 'roommates' ? 'text-rose-500' : 'text-zinc-400 hover:text-zinc-200'
        }`}
      >
        <Users className="w-5 h-5 stroke-[2.2]" />
        <span className="text-[10px] mt-0.5 font-semibold">Roommate</span>
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
        className="flex flex-col items-center justify-center -mt-4 w-12 h-12 rounded-full bg-gradient-to-tr from-rose-500 via-pink-500 to-amber-400 text-white shadow-lg shadow-rose-500/30 active:scale-95 transition-transform"
      >
        <PlusCircle className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Messages */}
      <button
        onClick={() => setActiveView('messages')}
        className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors relative ${
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
