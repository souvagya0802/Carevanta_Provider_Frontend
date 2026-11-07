'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button, Field, Input, PasswordInput, Skeleton } from '@/components/ui/primitives';
import { Logo } from '@/lib/branding';

/** Mirrors the API's password policy so the person sees the rule before submitting. */
function passwordProblem(p: string): string | null {
  if (p.length < 12) return 'At least 12 characters';
  if (p.length > 128) return 'At most 128 characters';
  if (new Set(p).size < 6) return 'Use more different characters';
  return null;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<Skeleton rows={6} />}><ResetInner /></Suspense>;
}

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm && confirm !== password ? 'Passwords do not match' : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (token.trim().length < 20 || problem || mismatch || !confirm) { setError('Check the code and the password rules'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/auth/password/reset', { token: token.trim(), newPassword: password }, undefined);
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOKEN_INVALID') setError('This code is invalid or has expired. Request a new one.');
      else if (err instanceof ApiError) setError(err.message);
      else setError('Could not reach Carevanta. Check your connection.');
    } finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-grey-200 bg-paper p-8 shadow-[var(--shadow-card)]">
        <Logo size="md" className="mx-auto mb-4 rounded-lg" />
        {done ? (
          <div className="text-center">
            <CheckCircle2 size={28} className="mx-auto text-green" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Password Changed</h1>
            <p className="mt-1 text-sm text-grey-600">You have been signed out everywhere. Taking you to sign in…</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Choose a New Password</h1>
            <p className="mt-1 text-sm text-grey-600">Paste the code from your email or SMS, then set a password of at least 12 characters.</p>
            <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
              <Field label="Reset Code" required><Input value={token} onChange={(e) => setToken(e.target.value)} autoComplete="one-time-code" className="font-mono" /></Field>
              <Field label="New Password" required error={problem ?? undefined} hint="12+ characters; avoid common or repetitive passwords"><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
              <Field label="Confirm Password" required error={mismatch ?? undefined}><PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
              {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>}
              <Button type="submit" className="h-11 w-full" loading={busy} disabled={!!problem || !!mismatch || !token || !confirm}>Set Password</Button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-grey-700 underline-offset-2 hover:underline"><ArrowLeft size={14} aria-hidden /> Back to Sign In</Link>
      </div>
    </main>
  );
}
