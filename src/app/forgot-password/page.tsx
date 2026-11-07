'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui/primitives';
import { Logo, useBranding } from '@/lib/branding';

/** Asks the API to send a one-time reset code. The response is the same whether or not the account exists. */
export default function ForgotPasswordPage() {
  const { branding } = useBranding();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (identifier.trim().length < 3) { setError('Enter the email or mobile number on your account'); return; }
    setBusy(true); setError(null);
    try {
      await api.post('/auth/password/forgot', { identifier: identifier.trim() }, undefined);
      setSent(true);
    } catch {
      setError('Could not send the code right now. Try again in a minute.');
    } finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-lg border border-grey-200 bg-paper p-8 shadow-[var(--shadow-card)]">
        <Logo size="md" className="mx-auto mb-4 rounded-lg" />
        {sent ? (
          <div className="text-center">
            <MailCheck size={28} className="mx-auto text-green" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">Check Your Messages</h1>
            <p className="mt-1 text-sm text-grey-600">If an account exists for <span className="font-medium text-ink">{identifier}</span>, a reset code is on its way. It expires in 60 minutes.</p>
            <Link href={`/reset-password?identifier=${encodeURIComponent(identifier)}`} className="mt-5 inline-block"><Button>I Have the Code</Button></Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold">Reset Your Password</h1>
            <p className="mt-1 text-sm text-grey-600">We will send a one-time code to the email or mobile on your {branding.name} account.</p>
            <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
              <Field label="Email or Mobile" required error={error ?? undefined}><Input autoFocus autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></Field>
              <Button type="submit" className="h-11 w-full" loading={busy}>Send Code</Button>
            </form>
          </>
        )}
        <Link href="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-grey-700 underline-offset-2 hover:underline"><ArrowLeft size={14} aria-hidden /> Back to Sign In</Link>
      </div>
    </main>
  );
}
