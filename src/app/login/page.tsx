'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ShieldCheck } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Field, Input, PasswordInput } from '@/components/ui/primitives';
import { Logo, useBranding } from '@/lib/branding';

const Schema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or mobile number'),
  password: z.string().min(1, 'Enter your password'),
});
type Values = z.infer<typeof Schema>;

export default function LoginPage() {
  const { me, loading, login } = useAuth();
  const { branding } = useBranding();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { identifier: '', password: '' } });

  useEffect(() => {
    if (!loading && me) router.replace('/');
  }, [loading, me, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const user = await login(values.identifier, values.password);
      router.replace(user.mustChangePassword ? '/account/password' : '/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACCOUNT_LOCKED') setError('Too many failed attempts. Wait a few minutes or reset your password.');
        else if (err.code === 'ACCOUNT_INACTIVE') setError('This account is not active. Contact the Carevanta team.');
        else if (err.status === 429) setError('Too many attempts. Please wait a minute.');
        else setError('That email/mobile or password is not right.');
      } else setError('Could not reach Carevanta. Check your internet connection.');
    }
  });

  return (
    <main className="flex min-h-dvh flex-col bg-ink text-paper lg:flex-row">
      <section className="flex flex-1 flex-col justify-between px-6 py-8 lg:px-16 lg:py-14">
        <div className="flex items-center gap-3">
          <Logo size="sm" onDark className="rounded-lg" />
          <span className="text-sm font-semibold">{branding.name}</span>
        </div>
        <div className="my-10 max-w-lg lg:my-0">
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">Provider Portal</h1>
          <p className="mt-3 text-sm text-grey-300 lg:text-base">Run your hospital, clinic, laboratory, pharmacy, ambulance service or practice on {branding.name}: bookings, schedules, reports, stock, staff and payouts in one place.</p>
          <ul className="mt-6 space-y-2 text-sm text-grey-300">
            <li className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-green" aria-hidden /> Every action is recorded against your name.</li>
            <li className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-green" aria-hidden /> Patient details are shown only where your role needs them.</li>
          </ul>
        </div>
        <p className="hidden text-xs text-grey-500 lg:block">Works on phones, tablets and desktops.</p>
      </section>
      <section className="flex items-center justify-center bg-paper px-4 py-10 text-ink lg:w-[460px] lg:px-10">
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold">Sign In</h2>
          <p className="mt-1 text-sm text-grey-600">Use the email or mobile number your organisation registered.</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email or Mobile" error={form.formState.errors.identifier?.message} required>
              <Input autoComplete="username" inputMode="email" autoFocus aria-invalid={!!form.formState.errors.identifier} {...form.register('identifier')} />
            </Field>
            <Field label="Password" error={form.formState.errors.password?.message} required>
              <PasswordInput autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
            </Field>
            {error && <p role="alert" className="rounded-lg border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">{error}</p>}
            <Button type="submit" className="h-11 w-full" loading={form.formState.isSubmitting}>Sign In</Button>
          </form>
          <div className="mt-6 flex flex-col gap-2 text-sm">
            <Link href="/forgot-password" className="text-grey-700 underline-offset-2 hover:underline">Forgot your password?</Link>
            <p className="text-xs text-grey-500">New to {branding.name}? Your organisation is registered and verified by the Carevanta team first; you then receive an invitation to set a password.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
