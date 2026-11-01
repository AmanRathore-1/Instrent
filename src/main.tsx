import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';
import App from './App.tsx';
import { AuthView } from './components/auth/AuthView.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { AuthProvider, ProtectedRoute, useAuth } from './context/AuthContext.tsx';
import { BootLoader } from './components/ui/BootLoader.tsx';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary.tsx';

function Root() {
  const { status, logout } = useAuth();
  if (status === 'loading') return <BootLoader message="Checking your session" />;
  if (status === 'unauthenticated') return <AuthView onAuthenticated={() => undefined} />;

  return (
    <ProtectedRoute>
      <AppProvider onSignOut={logout}><App /></AppProvider>
    </ProtectedRoute>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><AuthProvider><Root /></AuthProvider></AppErrorBoundary>
  </StrictMode>,
);
