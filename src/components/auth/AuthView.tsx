import { useEffect, useState } from 'react';
import type { User } from '../../types/client.ts';
import { ApiError, api } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { AuthInput, OtpInput, PasswordInput, PasswordStrength, SubmitButton } from './AuthFormControls.tsx';
import ModernLoginSignup from '../ui/modern-login-signup.tsx';

type Props = { onAuthenticated: (user: User) => void };
type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

export function AuthView({ onAuthenticated }: Props) {
  const { login, signup, verifyOtp, resendOtp, forgotPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [resetGrant, setResetGrant] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setMessage('');
    setFieldErrors({});
    setCode('');
    if (nextMode !== 'reset') setResetGrant('');
  };

  const handleError = (caught: unknown) => {
    if (caught instanceof ApiError) {
      if (caught.code === 'EMAIL_IN_USE') {
        changeMode('login');
        setMessage('An account with this email already exists. Sign in instead.');
        return;
      }
      if (caught.code === 'EMAIL_DELIVERY_FAILED' && (mode === 'register' || mode === 'login')) {
        changeMode('verify');
        setResendSeconds(60);
        setMessage('Your account was created, but the verification email was not delivered. Try resend verification after the cooldown.');
        return;
      }
      setError(caught.message);
      setFieldErrors(caught.fieldErrors);
      if (caught.code === 'EMAIL_NOT_VERIFIED') {
        changeMode('verify');
        setError(caught.message);
      }
      return;
    }
    setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    setFieldErrors({});
    try {
      if (mode === 'login') {
        const user = await login(email, password);
        onAuthenticated(user);
      } else if (mode === 'register') {
        if (password !== confirmPassword) {
          setFieldErrors({ confirmPassword: 'Passwords do not match.' });
          throw new Error('Passwords do not match.');
        }
        await signup({ email, password, name: fullName, ...(username.trim() ? { username: username.trim() } : {}) });
        setCode('');
        setResendSeconds(60);
        changeMode('verify');
        setMessage('Check your email for the six-digit verification code.');
      } else if (mode === 'verify') {
        const user = await verifyOtp(email, code);
        onAuthenticated(user);
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setCode('');
        setResendSeconds(60);
        changeMode('reset');
        setMessage('If an account exists, a password reset code has been sent.');
      } else {
        if (!resetGrant) {
          const result = await api.auth.verifyResetOtp({ email, code });
          setResetGrant(result.grant);
          setMessage('Code verified. Enter your new password and submit again.');
        } else {
          if (password !== confirmPassword) {
            setFieldErrors({ confirmPassword: 'Passwords do not match.' });
            throw new Error('Passwords do not match.');
          }
          await api.auth.resetPassword({ grant: resetGrant, password });
          setPassword('');
          setConfirmPassword('');
          setResetGrant('');
          changeMode('login');
          setMessage('Password reset successfully. You can now sign in.');
        }
      }
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || resendSeconds > 0) return;
    setBusy(true);
    setError('');
    try {
      await resendOtp(email);
      setResendSeconds(60);
      setMessage('A new verification code has been sent.');
    } catch (caught) {
      handleError(caught);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'register' ? 'Create your account'
    : mode === 'verify' ? 'Verify your email'
      : mode === 'forgot' ? 'Forgot password'
        : mode === 'reset' ? 'Reset password'
          : 'Welcome back';

  const inputError = (field: string) => fieldErrors[field] ? <p className="mt-1 text-xs text-rose-300">{fieldErrors[field]}</p> : null;

  return (
    <ModernLoginSignup>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg font-bold text-rose-300">IR</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">InstRent</h1>
        <p className="mt-2 text-sm text-zinc-400">Find your space. Connect with your community.</p>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}

        {mode === 'register' && (
          <>
            <label className="block text-sm text-zinc-300">Full name
              <AuthInput required value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" />
              {inputError('name')}
            </label>
            <label className="block text-sm text-zinc-300">Username (optional)
              <AuthInput value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              {inputError('username')}
            </label>
          </>
        )}

        {(mode !== 'reset' || !resetGrant) && (
          <label className="block text-sm text-zinc-300">Email address
            <AuthInput required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            {inputError('email')}
          </label>
        )}

        {(mode === 'login' || mode === 'register' || (mode === 'reset' && Boolean(resetGrant))) && (
          <label className="block text-sm text-zinc-300">{mode === 'reset' ? 'New password' : 'Password'}
            <PasswordInput required minLength={mode === 'login' ? 1 : 12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {inputError('password')}
          </label>
        )}
        {(mode === 'register' || (mode === 'reset' && Boolean(resetGrant))) && (
          <>
            <PasswordStrength password={password} />
            <label className="block text-sm text-zinc-300">Confirm password
              <PasswordInput required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              {inputError('confirmPassword')}
            </label>
          </>
        )}
        {(mode === 'verify' || (mode === 'reset' && !resetGrant)) && (
          <>
            <OtpInput value={code} onChange={setCode} />
            <button type="button" disabled={busy || resendSeconds > 0} onClick={() => void resend()} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend code'}
            </button>
            <button type="button" onClick={() => changeMode('login')} className="w-full text-xs text-zinc-400 hover:text-white">Change email</button>
          </>
        )}

        <SubmitButton busy={busy}>{mode === 'verify' ? 'Verify email' : mode === 'forgot' ? 'Send reset code' : mode === 'reset' ? (resetGrant ? 'Reset password' : 'Verify code') : mode === 'register' ? 'Create account' : 'Sign in'}</SubmitButton>
        {mode === 'login' && <button type="button" disabled={busy} onClick={() => changeMode('forgot')} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">Forgot password?</button>}
        {(mode === 'login' || mode === 'forgot' || mode === 'reset') && <button type="button" disabled={busy} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">{mode === 'login' ? 'Need an account? Sign up' : 'Back to sign in'}</button>}
      </form>
    </ModernLoginSignup>
  );
}
