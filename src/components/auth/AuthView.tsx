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
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); const [name, setName] = useState('');
  const [username, setUsername] = useState(''); const [code, setCode] = useState(''); const [grant, setGrant] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const changeMode = (next: Mode) => { setMode(next); setError(''); setMessage(''); setCode(''); if (next !== 'reset') setGrant(''); };
  const handleError = (caught: unknown) => {
    if (caught instanceof ApiError) {
      if (caught.code === 'EMAIL_IN_USE') { changeMode('login'); setMessage('An account with this email already exists. Sign in instead.'); return; }
      if (caught.code === 'EMAIL_NOT_VERIFIED') changeMode('verify');
      setError(caught.message); return;
    }
    setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
  };
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') onAuthenticated(await login(email, password));
      else if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await signup({ email, password, name, ...(username.trim() ? { username: username.trim() } : {}) });
        setCooldown(60); changeMode('verify'); setMessage('Check your email for the six-digit verification code.');
      } else if (mode === 'verify') onAuthenticated(await verifyOtp(email, code));
      else if (mode === 'forgot') { await forgotPassword(email); setCooldown(60); changeMode('reset'); setMessage('If an account exists, a password reset code has been sent.'); }
      else if (!grant) { setGrant((await api.auth.verifyResetOtp({ email, code })).grant); setMessage('Code verified. Enter your new password and submit again.'); }
      else {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await api.auth.resetPassword({ grant, password }); setPassword(''); setConfirmPassword(''); changeMode('login'); setMessage('Password reset successfully. You can now sign in.');
      }
    } catch (caught) { handleError(caught); } finally { setBusy(false); }
  };
  const resend = async () => {
    if (busy || cooldown) return;
    setBusy(true); setError('');
    try { await resendOtp(email); setCooldown(60); setMessage('A new verification code has been sent.'); }
    catch (caught) { handleError(caught); } finally { setBusy(false); }
  };
  const title = mode === 'register' ? 'Create your account' : mode === 'verify' ? 'Verify your email' : mode === 'forgot' ? 'Forgot password' : mode === 'reset' ? 'Reset password' : 'Welcome back';
  const needsEmail = mode !== 'reset' || !grant; const needsPassword = mode === 'login' || mode === 'register' || (mode === 'reset' && Boolean(grant)); const needsCode = mode === 'verify' || (mode === 'reset' && !grant);
  return <ModernLoginSignup><div className="mb-6 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg font-bold text-rose-300">IR</div><h1 className="text-3xl font-extrabold tracking-tight text-white">InstRent</h1><p className="mt-2 text-sm text-zinc-400">Find your space. Connect with your community.</p></div>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-4"><h2 className="text-lg font-bold text-white">{title}</h2>
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}{message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}
      {mode === 'register' && <><label className="block text-sm text-zinc-300">Full name<AuthInput required value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label><label className="block text-sm text-zinc-300">Username (optional)<AuthInput value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label></>}
      {needsEmail && <label className="block text-sm text-zinc-300">Email address<AuthInput required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>}
      {needsPassword && <label className="block text-sm text-zinc-300">{mode === 'reset' ? 'New password' : 'Password'}<PasswordInput required minLength={mode === 'login' ? 1 : 12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
      {(mode === 'register' || (mode === 'reset' && Boolean(grant))) && <><PasswordStrength password={password} /><label className="block text-sm text-zinc-300">Confirm password<PasswordInput required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label></>}
      {needsCode && <><OtpInput value={code} onChange={setCode} /><button type="button" disabled={busy || Boolean(cooldown)} onClick={() => void resend()} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">{cooldown ? 'Resend code in ' + cooldown + 's' : 'Resend code'}</button><button type="button" onClick={() => changeMode('login')} className="w-full text-xs text-zinc-400 hover:text-white">Change email</button></>}
      <SubmitButton busy={busy}>{mode === 'verify' ? 'Verify email' : mode === 'forgot' ? 'Send reset code' : mode === 'reset' ? (grant ? 'Reset password' : 'Verify code') : mode === 'register' ? 'Create account' : 'Sign in'}</SubmitButton>
      {mode === 'login' && <button type="button" disabled={busy} onClick={() => changeMode('forgot')} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">Forgot password?</button>}
      {(mode === 'login' || mode === 'forgot' || mode === 'reset') && <button type="button" disabled={busy} onClick={() => changeMode(mode === 'login' ? 'register' : 'login')} className="w-full text-xs text-zinc-400 hover:text-white disabled:opacity-50">{mode === 'login' ? 'Need an account? Sign up' : 'Back to sign in'}</button>}
    </form></ModernLoginSignup>;
}
