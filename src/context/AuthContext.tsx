import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types/client.ts';
import { api, clearAuthTokens, clearSessionHint, hasSessionHint, markSessionActive, setAuthTokens } from '../lib/api.ts';
import { PageLoader } from '../components/loading/index.ts';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  signup: (data: { name: string; email: string; password: string; username?: string }) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<User>;
  resendOtp: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (grant: string, password: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const logoutEventKey = 'rentreel-auth-event';

const broadcastLogout = (userId: string) => {
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('rentreel-auth');
    channel.postMessage({ type: 'logout', userId });
    channel.close();
  }
  localStorage.setItem(logoutEventKey, JSON.stringify({ userId, at: Date.now() }));
  localStorage.removeItem(logoutEventKey);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const loading = status === 'loading';

  const logout = useCallback(async () => {
    const userId = user?.id;
    await api.auth.logout();
    clearAuthTokens();
    clearSessionHint();
    setUser(null);
    setStatus('unauthenticated');
    if (userId) broadcastLogout(userId);
  }, [user]);

  useEffect(() => {
    let active = true;
    if (hasSessionHint()) {
      void api.auth.restore()
        .then((result) => {
          if (active) {
            setUser(result.user);
            setStatus('authenticated');
          }
        })
        .catch(() => {
          if (active) {
            clearAuthTokens();
            clearSessionHint();
            setStatus('unauthenticated');
          }
        });
    } else {
      setStatus('unauthenticated');
    }
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('rentreel-auth') : null;
    const applyLogout = () => {
      clearAuthTokens();
      clearSessionHint();
      setUser(null);
      setStatus('unauthenticated');
    };
    const onChannelLogout = (event: MessageEvent<{ type?: string; userId?: string }>) => {
      if (event.data?.userId === user?.id) applyLogout();
    };
    const onAuthExpired = () => applyLogout();
    channel?.addEventListener('message', onChannelLogout);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== logoutEventKey || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue) as { userId?: string };
        if (payload.userId === user?.id) applyLogout();
      } catch {
        return;
      }
    };
    window.addEventListener('rentreel-auth-expired', onAuthExpired);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      channel?.removeEventListener('message', onChannelLogout);
      channel?.close();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rentreel-auth-expired', onAuthExpired);
    };
  }, [user?.id]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    status,
    login: async (email, password) => {
      clearAuthTokens();
      clearSessionHint();
      const result = await api.auth.login({ email, password });
      setAuthTokens(result);
      markSessionActive();
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    signup: async (data) => {
      await api.auth.signup(data);
    },
    verifyOtp: async (email, code) => {
      const result = await api.auth.verifyEmail({ email, code });
      setAuthTokens(result);
      markSessionActive();
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    resendOtp: async (email) => {
      await api.auth.resendVerification(email);
    },
    forgotPassword: async (email) => {
      await api.auth.forgotPassword(email);
    },
    resetPassword: async (grant, password) => {
      await api.auth.resetPassword({ grant, password });
      clearAuthTokens();
      clearSessionHint();
      setUser(null);
      setStatus('unauthenticated');
    },
    verifyEmail: async (email, code) => {
      const result = await api.auth.verifyEmail({ email, code });
      setAuthTokens(result);
      markSessionActive();
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    logout,
  }), [loading, logout, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return status === 'authenticated' ? children : null;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return status === 'unauthenticated' ? children : null;
}
