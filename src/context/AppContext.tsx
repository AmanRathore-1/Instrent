import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import type { Socket } from 'socket.io-client';

import type { ReactNode } from 'react';

import type {
  User,
  ActiveView,
  UserRole,
  MessageContext,
} from '../types/client';

import { api, API_URL, ApiError, getAccessToken } from '../lib/api';

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

  openUserProfile: (username: string) => void;
  switchUserRole: (role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;

  toasts: ToastInfo[];
  showToast: (
    message: string,
    type?: 'success' | 'info' | 'warning' | 'error'
  ) => void;

  refreshUserData: () => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
  refreshUnreadMessages: () => Promise<void>;
  realtimeSocket: Socket | null;

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
  onSignOut,
}: {
  children: ReactNode;
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

  const toastTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const userSyncRequest = useRef<Promise<boolean> | null>(null);

  const showToast = useCallback((
    message: string,
    type: 'success' | 'info' | 'warning' | 'error' = 'success'
  ) => {
    const id = `${Date.now()}-${Math.random()}`;

    setToasts((prev) => [...prev, { id, message, type }]);

    const timer = setTimeout(() => {
      toastTimers.current.delete(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4000);
    toastTimers.current.set(id, timer);
  }, []);

  useEffect(() => () => {
    toastTimers.current.forEach((timer) => clearTimeout(timer));
    toastTimers.current.clear();
  }, []);

  useEffect(() => {
    let active = true;
    const sendHeartbeat = () => {
      if (active) void api.heartbeat().catch((error) => console.error('Presence heartbeat failed:', error));
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 45_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const refreshUserData = useCallback(async (): Promise<boolean> => {
    if (userSyncRequest.current) return userSyncRequest.current;
    const request = (async () => {
      try {
        const data = await api.syncCurrentUser();
        setCurrentUser(data.user);
        setUserLoadError(null);
        return true;
      } catch (error) {
        console.error('Failed to sync the account with the app profile:', error);
        setCurrentUser(null);
        if (error instanceof ApiError && (error.status === 401 || error.status === 404 || error.code === 'UNAUTHENTICATED')) {
          setUserLoadError(null);
          return false;
        }
        throw error;
      }
    })();
    userSyncRequest.current = request;
    try {
      await request;
    } finally {
      if (userSyncRequest.current === request) {
        userSyncRequest.current = null;
      }
    }
    return request;
  }, []);

  const refreshUnreadMessages = useCallback(async (): Promise<void> => {
    try {
      const result = await api.getUnreadMessageCount();
      setUnreadMessagesCount(result.unreadCount);
    } catch (error) {
      console.error('Failed to refresh unread messages:', error);
      throw error;
    }
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    try {
      const notifications = await api.getNotifications();
      setUnreadNotificationsCount(notifications.unreadCount);
    } catch (error) {
      console.warn('Failed to fetch notifications:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initializeUser = async () => {
      try {
        const hasProfile = await refreshUserData();

        if (!isMounted || !hasProfile) return;

        await Promise.all([refreshNotifications(), refreshUnreadMessages()]);
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
  }, [refreshNotifications, refreshUnreadMessages, refreshUserData]);

  const currentUserId = currentUser?.id;

  useEffect(() => {
    let isCancelled = false;
    let socket: Socket | null = null;
    let teardownSocket = () => {};
    let reconnectWarningTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectWarningShown = false;

    if (!currentUserId) {
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
        showToast('Real-time updates are unavailable. Check your connection.', 'error');
      }, realtimeDisconnectWarningDelayMs);
    };

    void import('socket.io-client')
      .then(({ io }) => {
        if (isCancelled) return;
        const connectedSocket = io(API_URL || undefined, {
          auth: (callback) => callback({ token: getAccessToken() ?? '' }),
        });
        socket = connectedSocket;
        setRealtimeSocket(connectedSocket);

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
        const handleIncomingMessage = (message: { id: string; receiverId: string }) => {
          if (message.receiverId === currentUserId) {
            connectedSocket.emit('message:delivered', { messageId: message.id });
          }
        };
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

        connectedSocket.on('connect', handleConnect);
        const handleAuthExpired = () => {
          connectedSocket.disconnect();
          void api.auth.restore()
            .then(() => connectedSocket.connect())
            .catch(() => undefined);
        };
        const handleAuthConnectError = (error: Error) => {
          if (/expired|invalid authentication token/i.test(error.message)) {
            void api.auth.restore()
              .then(() => connectedSocket.connect())
              .catch(() => undefined);
          }
        };
        connectedSocket.on('auth:expired', handleAuthExpired);
        connectedSocket.on('connect_error', handleAuthConnectError);
        connectedSocket.on('disconnect', handleDisconnect);
        connectedSocket.on('connect_error', handleConnectError);
        connectedSocket.on('message:new', handleIncomingMessage);
        connectedSocket.on('message:notification', handleMessageNotification);
        connectedSocket.on('notification:new', handleNotification);
        teardownSocket = () => {
          connectedSocket.off('connect', handleConnect);
          connectedSocket.off('disconnect', handleDisconnect);
          connectedSocket.off('connect_error', handleConnectError);
          connectedSocket.off('connect_error', handleAuthConnectError);
          connectedSocket.off('auth:expired', handleAuthExpired);
          connectedSocket.off('message:new', handleIncomingMessage);
          connectedSocket.off('message:notification', handleMessageNotification);
          connectedSocket.off('notification:new', handleNotification);
          connectedSocket.disconnect();
        };
        scheduleReconnectWarning();
      })
      .catch((error: unknown) => {
        if (isCancelled) return;
        console.error('Failed to initialize real-time updates:', error);
        showToast('Real-time updates could not be initialized.', 'error');
      });

    return () => {
      isCancelled = true;
      if (reconnectWarningTimer) clearTimeout(reconnectWarningTimer);
      teardownSocket();
      socket = null;
    };
  }, [currentUserId, refreshNotifications, refreshUnreadMessages, showToast]);

  const openCreateModal = useCallback((tab: 'post' | 'reel' = 'post') => {
    setCreateModalTab(tab);
    setIsCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const openChatWith = useCallback(async (
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
  }, [showToast]);

  const openUserProfile = useCallback((username: string) => {
    setViewParams({ username, refreshKey: Date.now() });
    setActiveView('user-profile');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const switchUserRole = useCallback(async (role: UserRole): Promise<void> => {
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
  }, [showToast]);

  const signOut = useCallback(async (): Promise<void> => {
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
  }, [onSignOut, showToast]);

  const openNotifications = useCallback(() => setIsNotificationsOpen(true), []);
  const closeNotifications = useCallback(() => setIsNotificationsOpen(false), []);

  const openSearch = useCallback(() => setIsSearchOpen(true), []);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  const contextValue = useMemo<AppContextType>(() => ({
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
    openUserProfile,
    switchUserRole,
    signOut,
    toasts,
    showToast,
    refreshUserData,
    refreshNotifications,
    refreshUnreadMessages,
    realtimeSocket,
    isNotificationsOpen,
    openNotifications,
    closeNotifications,
    isSearchOpen,
    openSearch,
    closeSearch,
  }), [
    activeView,
    closeCreateModal,
    closeNotifications,
    closeSearch,
    createModalTab,
    currentUser,
    isCreateModalOpen,
    isNotificationsOpen,
    isSearchOpen,
    openChatWith,
    openCreateModal,
    openNotifications,
    openSearch,
    openUserProfile,
    realtimeSocket,
    refreshNotifications,
    refreshUnreadMessages,
    refreshUserData,
    showToast,
    signOut,
    switchUserRole,
    toasts,
    unreadMessagesCount,
    unreadNotificationsCount,
    viewParams,
  ]);

  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">
        <p className="text-sm">
          Loading your InstRent account...
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
              .then(() => Promise.all([refreshNotifications(), refreshUnreadMessages()]))
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
      value={contextValue}
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
