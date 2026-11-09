import React, { Suspense, useEffect } from 'react';
import { useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { MobileNav } from './components/layout/MobileNav.tsx';
import { Header } from './components/layout/Header.tsx';
import { NotificationsDrawer } from './components/notifications/NotificationsDrawer.tsx';
import { SearchModal } from './components/search/SearchModal.tsx';
import { PageLoader } from './components/loading/index.ts';

const HomeView = React.lazy(() => import('./components/home/HomeView.tsx').then(({ HomeView }) => ({ default: HomeView })));
const ReelsView = React.lazy(() => import('./components/reels/ReelsView.tsx').then(({ ReelsView }) => ({ default: ReelsView })));
const FindRoommateView = React.lazy(() => import('./components/marketplace/FindRoommateView.tsx').then(({ FindRoommateView }) => ({ default: FindRoommateView })));
const RoomsView = React.lazy(() => import('./components/rooms/RoomsView.tsx').then(({ RoomsView }) => ({ default: RoomsView })));
const RoommateFinderView = React.lazy(() => import('./components/roommates/RoommateFinderView.tsx').then(({ RoommateFinderView }) => ({ default: RoommateFinderView })));
const MessagesView = React.lazy(() => import('./components/messages/MessagesView.tsx').then(({ MessagesView }) => ({ default: MessagesView })));
const SavedView = React.lazy(() => import('./components/saved/SavedView.tsx').then(({ SavedView }) => ({ default: SavedView })));
const SettingsView = React.lazy(() => import('./components/settings/SettingsView.tsx').then(({ SettingsView }) => ({ default: SettingsView })));
const TenantProfileView = React.lazy(() => import('./components/profile/TenantProfileView.tsx').then(({ TenantProfileView }) => ({ default: TenantProfileView })));
const CreateModal = React.lazy(() => import('./components/create/CreateModal.tsx').then(({ CreateModal }) => ({ default: CreateModal })));

const AppContent: React.FC = () => {
  const {
    currentUser,
    activeView,
    setActiveView,
    viewParams,
    isCreateModalOpen,
    toasts,
    isNotificationsOpen,
    openNotifications,
    closeNotifications,
    isSearchOpen,
    openSearch,
    closeSearch,
  } = useApp();

  useEffect(() => {
    if (window.location.hash.startsWith('#reel=')) setActiveView('reels');
  }, [setActiveView]);

  return (
    <div className="flex min-h-screen min-h-dvh w-full min-w-0 flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-rose-500/30 selection:text-rose-200 md:flex-row">
      {/* Desktop Left Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex min-h-screen min-h-dvh min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <Header
          onOpenSearch={openSearch}
          onOpenNotifications={openNotifications}
        />

        {/* View Routing */}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-clip pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Suspense fallback={<PageLoader />}>
            {activeView === 'home' && <HomeView />}
            {activeView === 'reels' && <ReelsView />}
            {(activeView === 'find-property' || activeView === 'explore') && <FindRoommateView />}
            {activeView === 'rooms' && <RoomsView initialRoomId={viewParams.roomId} />}
            {activeView === 'roommates' && <RoommateFinderView />}
            {activeView === 'messages' && (
              <MessagesView
                initialConversationId={viewParams.conversationId}
                initialContext={viewParams.context}
              />
            )}
            {activeView === 'saved' && <SavedView />}
            {activeView === 'settings' && <SettingsView />}
            {activeView === 'user-profile' && (
              <TenantProfileView
                username={viewParams.username || currentUser?.username || ''}
                refreshKey={viewParams.refreshKey}
                onBack={() => setActiveView('home')}
              />
            )}
          </Suspense>
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav />
      </div>

      {/* Global Modals & Drawers */}
      {isCreateModalOpen && (
        <Suspense fallback={<PageLoader fullScreen={false} />}>
          <CreateModal />
        </Suspense>
      )}
      <NotificationsDrawer isOpen={isNotificationsOpen} onClose={closeNotifications} />
      <SearchModal isOpen={isSearchOpen} onClose={closeSearch} />

      {/* Lightweight Floating Toast Notifications */}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-3 z-50 space-y-2 sm:right-6 md:bottom-6">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto max-w-[calc(100vw-1.5rem)] break-words rounded-2xl border px-4 py-2.5 text-xs font-bold shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-2 ${
                toast.type === 'success'
                  ? 'bg-zinc-900/95 text-emerald-300 border-emerald-500/30'
                  : toast.type === 'error'
                  ? 'bg-zinc-900/95 text-rose-300 border-rose-500/30'
                  : toast.type === 'warning'
                  ? 'bg-zinc-900/95 text-amber-300 border-amber-500/30'
                  : 'bg-zinc-900/95 text-white border-zinc-700'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return <AppContent />;
}
