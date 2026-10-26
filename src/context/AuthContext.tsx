import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types/client.ts';
import { api, clearAuthTokens, setAuthTokens } from '../lib/api.ts';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';
type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  signup: (data: { name: string; email: string; password: string; username?: string }) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const logoutEventKey = 'rentreel-auth-event';

const broadcastLogout = () => {
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('rentreel-auth');
    channel.postMessage({ type: 'logout' });
    channel.close();
  }
  localStorage.setItem(logoutEventKey, String(Date.now()));
  localStorage.removeItem(logoutEventKey);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const logout = useCallback(async () => {
    await api.auth.logout();
    clearAuthTokens();
    setUser(null);
    setStatus('unauthenticated');
    broadcastLogout();
  }, []);

  useEffect(() => {
    let active = true;
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
          setStatus('unauthenticated');
        }
      });
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel('rentreel-auth') : null;
    const onLogout = () => {
      clearAuthTokens();
      setUser(null);
      setStatus('unauthenticated');
    };
    channel?.addEventListener('message', onLogout);
    const onStorage = (event: StorageEvent) => {
      if (event.key === logoutEventKey) onLogout();
    };
    window.addEventListener('rentreel-auth-expired', onLogout);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      channel?.close();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rentreel-auth-expired', onLogout);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    status,
    login: async (email, password) => {
      const result = await api.auth.login({ email, password });
      setAuthTokens(result);
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    signup: async (data) => {
      await api.auth.signup(data);
    },
    verifyEmail: async (email, code) => {
      const result = await api.auth.verifyEmail({ email, code });
      setAuthTokens(result);
      setUser(result.user);
      setStatus('authenticated');
      return result.user;
    },
    logout,
  }), [logout, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-300">Loading RentReel...</div>;
  return status === 'authenticated' ? children : null;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-300">Loading RentReel...</div>;
  return status === 'unauthenticated' ? children : null;
}
