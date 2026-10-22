import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from 'react';
import { io, type Socket } from 'socket.io-client';

import type { ReactNode } from 'react';

import type {
  User,
  ActiveView,
  UserRole,
  MessageContext,
} from '../types/client';

import { api, getClerkAccessToken } from '../lib/api';

interface ToastInfo {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

interface AppContextType {
  currentUser: User | null;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;

  viewParams: Record<string, any>;
  setViewParams: (params: Record<string, any>) => void;

  isCreateModalOpen: boolean;
  createModalTab: 'post' | 'reel';

  openCreateModal: (tab?: 'post' | 'reel') => void;
  closeCreateModal: () => void;

  unreadNotificationsCount: number;
  unreadMessagesCount: number;

  openChatWith: (
    targetUserId: string,
    context?: MessageContext
  ) => Promise<void>;

  openPropertyProfile: (propertyId: string) => void;
  openUserProfile: (username: string) => void;
  openListingDetail: (listingId: string) => void;
  switchUserRole: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;

  toasts: ToastInfo[];
  showToast: (
    message: string,
    type?: 'success' | 'info' | 'warning' | 'error'
  ) => void;

  refreshUserData: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshUnreadMessages: () => Promise<void>;
  realtimeSocket: Socket | null;

  scheduleVisitData: {
    isOpen: boolean;
    propertyId?: string;
    propertyTitle?: string;
    ownerId?: string;
  };

  openScheduleVisit: (
    propertyId: string,
    propertyTitle: string,
    ownerId: string
  ) => void;

  closeScheduleVisit: () => void;

  isNotificationsOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;

  isSearchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const realtimeDisconnectWarningDelayMs = 6_000;

export const AppProvider = ({
  children,
  clerkUserId,
  onSignOut,
}: {
  children: ReactNode;
  clerkUserId: string;
  onSignOut: () => Promise<void>;
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [activeView, setActiveView] =
    useState<ActiveView>('home');

  const [viewParams, setViewParams] =
    useState<Record<string, any>>({});

  const [isUserLoading, setIsUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [createModalTab, setCreateModalTab] = useState<'post' | 'reel'>('post');

  const [unreadNotificationsCount, setUnreadNotificationsCount] =
    useState(0);

  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [realtimeSocket, setRealtimeSocket] = useState<Socket | null>(null);

  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  const [isNotificationsOpen, setIsNotificationsOpen] =
    useState(false);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [scheduleVisitData, setScheduleVisitData] = useState<{
    isOpen: boolean;
    propertyId?: string;
    propertyTitle?: string;
    ownerId?: string;
  }>({ isOpen: false });

  const showToast = (
    message: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'success'
  ) => {
    const id = `${Date.now()}-${Math.random()}`;

    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
  };
  const showToastRef = useRef(showToast);

  const refreshUserData = async (): Promise<void> => {
    try {
      const data = await api.syncCurrentUser();
      setCurrentUser(data.user);
      setUserLoadError(null);
    } catch (error) {
      console.error('Failed to sync the Clerk account with the app profile:', error);
      setCurrentUser(null);
      throw error;
    }
  };

  const refreshUnreadMessages = async (): Promise<void> => {
    try {
      const result = await api.getUnreadMessageCount();
      setUnreadMessagesCount(result.unreadCount);
    } catch (error) {
      console.error('Failed to refresh unread messages:', error);
      throw error;
    }
  };

  const refreshNotifications = async (): Promise<void> => {
    try {
      const notifications = await api.getNotifications();
      setUnreadNotificationsCount(notifications.unreadCount);
    } catch (error) {
      console.warn('Failed to fetch notifications:', error);
      throw error;
    }
  };

  useEffect(() => {
    let isMounted = true;

    setIsUserLoading(true);
    setUserLoadError(null);

    const initializeUser = async () => {
      try {
        await refreshUserData();

        if (!isMounted) return;

        await refreshNotifications();
        await refreshUnreadMessages();
      } catch (error: unknown) {
        console.error('Failed to initialize user profile:', error);

        if (isMounted) {
          setUserLoadError(
            error instanceof Error
              ? error.message
              : 'Could not load your account.'
          );
        }
      } finally {
        if (isMounted) {
          setIsUserLoading(false);
        }
      }
    };

    void initializeUser();

    return () => {
      isMounted = false;
    };
  }, [clerkUserId]);

  useEffect(() => {
    let isCancelled = false;
    let socket: Socket | null = null;
    let reconnectWarningTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectWarningShown = false;
    setRealtimeSocket(null);

    if (!currentUser) {
      return () => {
        isCancelled = true;
      };
    }

    const scheduleReconnectWarning = () => {
      if (reconnectWarningTimer || reconnectWarningShown || isCancelled) return;
      reconnectWarningTimer = setTimeout(() => {
        reconnectWarningTimer = null;
        if (isCancelled || socket?.connected || reconnectWarningShown) return;
        reconnectWarningShown = true;
        showToastRef.current('Real-time updates are unavailable. Check your connection.', 'error');
      }, realtimeDisconnectWarningDelayMs);
    };

    socket = io({
      auth: (callback) => {
        void getClerkAccessToken()
          .then((token) => callback({ token: token ?? '' }))
          .catch(() => callback({ token: '' }));
      },
    });
    setRealtimeSocket(socket);

    const handleConnect = () => {
      if (reconnectWarningTimer) clearTimeout(reconnectWarningTimer);
      reconnectWarningTimer = null;
      reconnectWarningShown = false;
      void Promise.all([refreshNotifications(), refreshUnreadMessages()]).catch((error: unknown) => {
        console.error('Could not resync realtime badge counts:', error);
      });
    };
    const handleDisconnect = () => scheduleReconnectWarning();
    const handleConnectError = () => scheduleReconnectWarning();
    const handleMessageNotification = () => {
      void refreshUnreadMessages().catch((error: unknown) => {
        console.error('Could not sync unread message count:', error);
      });
    };
    const handleNotification = () => {
      void refreshNotifications().catch((error: unknown) => {
        console.error('Could not sync notifications:', error);
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:notification', handleMessageNotification);
    socket.on('notification:new', handleNotification);
    scheduleReconnectWarning();

    return () => {
      isCancelled = true;
      if (reconnectWarningTimer) clearTimeout(reconnectWarningTimer);
      socket?.off('connect', handleConnect);
      socket?.off('disconnect', handleDisconnect);
      socket?.off('connect_error', handleConnectError);
      socket?.off('message:notification', handleMessageNotification);
      socket?.off('notification:new', handleNotification);
      socket?.disconnect();
    };
  }, [currentUser?.id]);

  const openCreateModal = (tab: 'post' | 'reel' = 'post') => {
    setCreateModalTab(tab);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const openChatWith = async (
    targetUserId: string,
    context?: MessageContext
  ) => {
    try {
      const result = await api.startConversation(targetUserId, context);

      setViewParams({
        conversationId: result.conversation.id,
        context,
      });

      setActiveView('messages');

      showToast('Chat opened successfully!', 'info');
    } catch (error: unknown) {
      showToast(
        error instanceof Error ? error.message : 'Could not start chat',
        'error'
      );
    }
  };

  const openPropertyProfile = (propertyId: string) => {
    setViewParams({ propertyId });
    setActiveView('property-profile');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openUserProfile = (username: string) => {
    setViewParams({ username, refreshKey: Date.now() });
    setActiveView('user-profile');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openListingDetail = (listingId: string) => {
    setViewParams({ listingId });
    setActiveView('home');
  };

  const switchUserRole = async (role: UserRole): Promise<void> => {
    try {
      const result = await api.switchRole(role);

      setCurrentUser(result.user);
      showToast(`Switched active mode to ${role}`, 'info');
    } catch (error: unknown) {
      showToast(
        error instanceof Error ? error.message : 'Failed to change role',
        'error'
      );
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await onSignOut();
      setCurrentUser(null);
    } catch (error: unknown) {
      console.error('Failed to sign out:', error);
      showToast(
        error instanceof Error ? error.message : 'Could not sign out. Please try again.',
        'error'
      );
    }
  };

  const openScheduleVisit = (
    propertyId: string,
    propertyTitle: string,
    ownerId: string
  ) => {
    setScheduleVisitData({
      isOpen: true,
      propertyId,
      propertyTitle,
      ownerId,
    });
  };

  const closeScheduleVisit = () => {
    setScheduleVisitData({ isOpen: false });
  };

  const openNotifications = () => setIsNotificationsOpen(true);
  const closeNotifications = () => setIsNotificationsOpen(false);

  const openSearch = () => setIsSearchOpen(true);
  const closeSearch = () => setIsSearchOpen(false);

  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">
        <p className="text-sm">
          Loading your RentReel account...
        </p>
      </div>
    );
  }

  if (userLoadError) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-rose-300">
          {userLoadError}
        </p>

        <button
          onClick={() => {
            setIsUserLoading(true);
            setUserLoadError(null);

            void refreshUserData()
              .then(() => refreshNotifications())
              .catch((error: unknown) => {
                console.error('Failed to retry user initialization:', error);

                setUserLoadError(
                  error instanceof Error
                    ? error.message
                    : 'Could not load your account.'
                );
              })
              .finally(() => {
                setIsUserLoading(false);
              });
          }}
          className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-500"
        >
          Retry
        </button>
        <button
          onClick={() => void signOut()}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-900"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider
      value={{
        currentUser,
        activeView,
        setActiveView,
        viewParams,
        setViewParams,

        isCreateModalOpen,
        createModalTab,
        openCreateModal,
        closeCreateModal,

        unreadNotificationsCount,
        unreadMessagesCount,

        openChatWith,
        openPropertyProfile,
        openUserProfile,
        openListingDetail,
        switchUserRole,
        signOut,

        toasts,
        showToast,

        refreshUserData,
        refreshNotifications,
        refreshUnreadMessages,
        realtimeSocket,

        scheduleVisitData,
        openScheduleVisit,
        closeScheduleVisit,

        isNotificationsOpen,
        openNotifications,
        closeNotifications,

        isSearchOpen,
        openSearch,
        closeSearch,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }

  return context;
};