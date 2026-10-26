import { useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function AuthInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`auth-input ${props.className ?? ''}`} />;
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <AuthInput {...props} type={visible ? 'text' : 'password'} className="pr-16" />
      <button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const score = [password.length >= 12, /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const labels = ['Too short', 'Weak', 'Good', 'Strong', 'Very strong'];
  return password ? <p className="text-xs text-zinc-400">Password strength: {labels[score]}</p> : null;
}

export function OtpInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6).slice(0, 6).split('');
  const update = (index: number, next: string) => {
    const clean = next.replace(/\D/g, '');
    if (!clean) {
      const current = digits.map((digit) => digit === ' ' ? '' : digit);
      current[index] = '';
      onChange(current.join(''));
      return;
    }
    const nextDigits = digits.map((digit) => digit === ' ' ? '' : digit);
    clean.split('').slice(0, 6 - index).forEach((digit, offset) => { nextDigits[index + offset] = digit; });
    onChange(nextDigits.join(''));
    refs.current[Math.min(index + clean.length, 5)]?.focus();
  };
  return (
    <div className="flex justify-between gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element; }}
          value={digit.trim()}
          inputMode="numeric"
          maxLength={1}
          autoComplete="one-time-code"
          aria-label={`Verification digit ${index + 1}`}
          onChange={(event) => update(index, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
          }}
          onPaste={(event) => { event.preventDefault(); update(index, event.clipboardData.getData('text')); }}
          className="h-12 w-10 rounded-xl border border-zinc-700 bg-zinc-950 text-center text-lg text-white"
        />
      ))}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button disabled={busy} className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Please wait...' : children}</button>;
}
