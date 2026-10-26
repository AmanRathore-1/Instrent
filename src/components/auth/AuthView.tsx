import { useState } from 'react';
import type { User } from '../../types/client.ts';
import { api, clearAuthTokens } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthInput, OtpInput, PasswordInput, PasswordStrength, SubmitButton } from './AuthFormControls.tsx';

type Props = { onAuthenticated: (user: User) => void };
type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export function AuthView({ onAuthenticated }: Props) {
  const { login, signup, verifyEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [resetGrant, setResetGrant] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        const user = await login(email, password);
        onAuthenticated(user);
      } else if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await signup({ email, password, name, username: username || undefined });
        setMode('verify');
        setMessage('Check your email for the six-digit verification code.');
      } else if (mode === 'verify') {
        const user = await verifyEmail(email, code);
        onAuthenticated(user);
      } else if (mode === 'forgot') {
        await api.auth.forgotPassword(email);
        setMode('reset');
        setMessage('If an account exists, a password reset code has been sent.');
      } else {
        if (!resetGrant) {
          const result = await api.auth.verifyResetOtp({ email, code });
          setResetGrant(result.grant);
          setMessage('Code verified. Choose a new password.');
          return;
        }
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await api.auth.resetPassword({ grant: resetGrant, password });
        clearAuthTokens();
        setResetGrant('');
        setPassword('');
        setCode('');
        setMode('login');
        setMessage('Password reset successfully. You can now sign in.');
      }
    } catch (caught) {
      const authError = caught as Error & { requiresVerification?: boolean };
      setError(authError.message);
      if (authError.requiresVerification) setMode('verify');
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'register' ? 'Create your account'
    : mode === 'verify' ? 'Verify your email'
      : mode === 'forgot' ? 'Reset your password'
        : mode === 'reset' ? 'Choose a new password'
          : 'Welcome back';

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold text-white">RentReel</h1>
        <p className="mt-2 text-sm text-zinc-400">Find your space. Connect with your community.</p>
      </div>
      <form
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {mode === 'register' && (
          <>
            <label className="block text-sm text-zinc-300">
              Full name
              <AuthInput required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" autoComplete="name" />
            </label>
            <label className="block text-sm text-zinc-300">
              Username (optional)
              <AuthInput value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username (optional)" autoComplete="username" />
            </label>
          </>
        )}
        {(mode !== 'reset' || !resetGrant) && (
          <label className="block text-sm text-zinc-300">
            Email address
            <AuthInput required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" />
          </label>
        )}
        {(mode === 'login' || mode === 'register' || (mode === 'reset' && Boolean(resetGrant))) && (
          <label className="block text-sm text-zinc-300">
            {mode === 'reset' ? 'New password' : 'Password'}
            <PasswordInput required minLength={mode === 'login' ? 1 : 12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Password' : 'Password (12+ characters)'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
        )}
        {(mode === 'register' || (mode === 'reset' && Boolean(resetGrant))) && (
          <>
            <PasswordStrength password={password} />
            <label className="block text-sm text-zinc-300">
              Confirm password
              <PasswordInput required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" autoComplete="new-password" />
            </label>
          </>
        )}
        {(mode === 'verify' || (mode === 'reset' && !resetGrant)) && (
          <OtpInput value={code} onChange={setCode} />
        )}
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        <SubmitButton busy={busy}>{mode === 'verify' ? 'Verify email' : mode === 'forgot' ? 'Send reset code' : mode === 'reset' ? 'Reset password' : mode === 'register' ? 'Create account' : 'Sign in'}</SubmitButton>
        {mode === 'login' && (
          <button type="button" onClick={() => setMode('forgot')} className="w-full text-xs text-zinc-400 hover:text-white">Forgot password?</button>
        )}
        {mode === 'verify' && (
          <button type="button" onClick={() => void api.auth.resendVerification(email)} className="w-full text-xs text-zinc-400 hover:text-white">Resend verification code</button>
        )}
        <button type="button" onClick={() => { setError(''); setMessage(''); setMode(mode === 'login' ? 'register' : 'login'); }} className="w-full text-xs text-zinc-400 hover:text-white">
          {mode === 'login' ? 'Need an account? Sign up' : 'Back to sign in'}
        </button>
      </form>
    </div>
  );
}
