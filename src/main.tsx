
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, SignIn, useAuth, useClerk, useUser } from '@clerk/clerk-react';

import './index.css';
import App from './App.tsx';
import { AppProvider } from './context/AppContext.tsx';
import { setClerkTokenGetter } from './lib/api.ts';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY is missing from the root .env file.'
  );
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const { isLoaded: isUserLoaded, user } = useUser();

  if (!isLoaded || (isSignedIn && !isUserLoaded)) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-300">Loading RentReel...</p>
      </div>
    );
  }

  if (!isSignedIn || !userId) {
    setClerkTokenGetter(null);
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-extrabold text-white">
            RentReel
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Find your space. Connect with your community.
          </p>
        </div>

        <SignIn routing="hash" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-300">Loading your Clerk account...</p>
      </div>
    );
  }

  setClerkTokenGetter(getToken);

  return (
    <AppProvider clerkUserId={userId} onSignOut={signOut}>
      <App />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <AuthenticatedApp />
    </ClerkProvider>
  </StrictMode>
);
