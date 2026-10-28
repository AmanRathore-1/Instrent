import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { AuthProvider, ProtectedRoute, useAuth } from './context/AuthContext.tsx';

function Root() {
  const { status, logout } = useAuth();
  if (status === 'loading') return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-300">Loading InstRent...</div>;
  if (status === 'unauthenticated') return <AuthView onAuthenticated={() => undefined} />;

  return (
    <ProtectedRoute>
      <AppProvider onSignOut={logout}><App /></AppProvider>
    </ProtectedRoute>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider><Root /></AuthProvider>
  </StrictMode>,
);
