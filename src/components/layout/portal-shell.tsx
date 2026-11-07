'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronDown, Loader2, LogOut, Megaphone, Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode, useSyncExternalStore } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { Logo, useBranding } from '@/lib/branding';
import { PortalProvider, usePortal, useTypeWords } from '@/lib/portal';
import { title } from '@/lib/format';
import { NAV_GROUPS, mobileNav, visibleNav } from './portal-nav';
import { NotificationBell } from './notification-bell';
import { Badge, Button, ErrorState, cx } from '@/components/ui/primitives';

/**
 * Portal shell. Desktop: black sidebar with grouped navigation and an
 * organisation switcher. Phone: a compact top bar, a slide-in drawer for the
 * full menu, and a bottom bar with the five most-used destinations so staff
 * can work one-handed at a reception desk or in a van.
 */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <PortalProvider>
      <ShellInner>{children}</ShellInner>
    </PortalProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const { me, loading: authLoading, logout } = useAuth();
  const { branding } = useBranding();
  const portal = usePortal();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const words = useTypeWords(portal.org?.type ?? '');

  useEffect(() => {
    if (!authLoading && !me) router.replace('/login');
  }, [authLoading, me, router]);

  if (authLoading || !me || portal.loading) return <Splash label={!me ? 'Signing you in…' : 'Loading your organisation…'} />;
  if (portal.error) return <div className="p-6"><ErrorState error={portal.error} retry={() => void portal.refresh()} /></div>;
  if (!portal.org) return <NoOrganisation name={me.fullName} support={portal.ui.support} onSignOut={() => void logout().then(() => router.replace('/login'))} />;

  const org = portal.org;
  const items = visibleNav(org.type, portal.can, portal.ui.types[org.type]?.nav);
  const support = portal.ui.support;
  const announcement = portal.ui.announcement;
  const bottom = mobileNav(items);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const current = items.find((n) => isActive(n.href));
  const initials = me.fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const signOut = () => void logout().then(() => router.replace('/login'));

  const orgSwitcher = portal.memberships.length > 1 ? (
    <label className="block px-3 pb-3">
      <span className="sr-only">Organisation</span>
      <select value={org.providerId} onChange={(e) => { portal.switchOrg(e.target.value); setOpen(false); router.push('/'); }} className="h-10 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-paper focus:border-white [&>option]:text-ink">
        {portal.memberships.map((m) => <option key={m.providerId} value={m.providerId}>{m.displayName} · {title(m.type)}</option>)}
      </select>
    </label>
  ) : null;

  const nav = (
    <nav aria-label="Main" className="flex h-full flex-col bg-ink text-paper">
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <Logo size="sm" onDark className="shrink-0 rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{branding.name}</span>
            <span className="block truncate text-[11px] text-grey-400">Provider Portal</span>
          </span>
        </Link>
        <button className="-mr-2 flex h-10 w-10 items-center justify-center rounded-lg text-grey-400 hover:bg-white/10 hover:text-paper lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button>
      </div>
      <div className="mx-3 mb-3 rounded-lg bg-white/10 p-3">
        <p className="truncate text-sm font-semibold">{org.displayName}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-grey-300">{title(org.type)} · {title(org.memberRole)} <Badge accent={org.status === 'APPROVED' ? 'green' : org.status === 'REJECTED' || org.status === 'SUSPENDED' ? 'red' : 'orange'}>{title(org.status)}</Badge></p>
      </div>
      {orgSwitcher}
      <div className="dark-scroll flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => {
          const group = items.filter((i) => i.group === g);
          if (!group.length) return null;
          return (
            <div key={g} className="mb-4">
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-grey-500">{g}</p>
              <ul className="space-y-0.5">
                {group.map((i) => (
                  <li key={i.href + i.label}>
                    <Link href={i.href} aria-current={isActive(i.href) ? 'page' : undefined} onClick={() => setOpen(false)} className={cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors', isActive(i.href) ? 'bg-paper font-semibold text-ink shadow-sm' : 'text-grey-300 hover:bg-white/10 hover:text-paper')}>
                      <i.icon size={16} aria-hidden className={isActive(i.href) ? 'text-ink' : 'text-grey-400'} />
                      <span className="truncate">{i.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {(support.email || support.phone || support.helpUrl) && (
        <div className="border-t border-white/10 px-4 py-3 text-[11px] text-grey-400">
          <p className="font-semibold uppercase tracking-wide text-grey-500">Need Help?</p>
          {support.phone && <a href={`tel:${support.phone.replace(/\s/g, '')}`} className="block truncate hover:text-paper">{support.phone}</a>}
          {support.email && <a href={`mailto:${support.email}`} className="block truncate hover:text-paper">{support.email}</a>}
          {support.helpUrl && <a href={support.helpUrl} target="_blank" rel="noreferrer" className="block truncate hover:text-paper">Help Centre</a>}
          {support.hours && <p className="truncate">{support.hours}</p>}
        </div>
      )}
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper text-xs font-bold text-ink">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.fullName}</span>
            <span className="block truncate text-[11px] text-grey-400">{me.email ?? me.phone ?? ''}</span>
          </span>
          <button aria-label="Sign Out" title="Sign Out" onClick={signOut} className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-grey-400 hover:bg-white/10 hover:text-paper"><LogOut size={16} /></button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <aside className="hidden h-full w-64 shrink-0 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">{nav}</aside>
        </div>
      )}
      <ActivityBar />
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-grey-200 bg-paper/90 px-4 backdrop-blur lg:h-16 lg:px-8">
          <button className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-grey-100 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <Logo size="nav" className="shrink-0 rounded-lg lg:hidden" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">{current?.label ?? org.displayName}</p>
            <p className="hidden truncate text-xs text-grey-500 sm:block">{org.displayName} · {title(org.type)}</p>
          </div>
          {org.status !== 'APPROVED' && <Link href="/verification" className="hidden sm:block"><Badge accent={org.status === 'REJECTED' || org.status === 'SUSPENDED' ? 'red' : 'orange'}>{org.status === 'DRAFT' ? 'Not Submitted' : title(org.status)}</Badge></Link>}
          <NotificationBell />
          <details className="relative">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full p-1 pr-2 hover:bg-grey-100 [&::-webkit-details-marker]:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">{initials}</span>
              <ChevronDown size={14} className="text-grey-500" />
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-grey-200 bg-paper p-2 text-sm shadow-[var(--shadow-float)]">
              <p className="truncate px-2 py-1 font-medium">{me.fullName}</p>
              <p className="truncate px-2 pb-2 text-xs text-grey-500">{title(org.memberRole)} at {org.displayName}</p>
              {portal.memberships.length > 1 && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-grey-500">Switch Organisation</p>}
              {portal.memberships.length > 1 && portal.memberships.map((m) => <button key={m.providerId} type="button" onClick={() => { portal.switchOrg(m.providerId); router.push('/'); }} className={cx('flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-grey-100', m.providerId === org.providerId && 'font-medium')}><Building2 size={14} /> <span className="truncate">{m.displayName}</span></button>)}
              <Link href="/account/password" className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-2 hover:bg-grey-100">Change Password</Link>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}><LogOut size={14} /> Sign Out</Button>
            </div>
          </details>
        </header>
        {announcement && (
          <div role="status" className={cx('flex items-start gap-2 border-b px-4 py-2 text-sm lg:px-8', announcement.tone === 'warning' ? 'border-orange/30 bg-orange-soft' : announcement.tone === 'success' ? 'border-green/30 bg-green-soft' : 'border-blue/30 bg-blue-soft')}>
            <Megaphone size={16} className="mt-0.5 shrink-0 text-grey-600" aria-hidden />
            <p className="min-w-0 flex-1 text-grey-800">{announcement.text}{announcement.link && <> <a href={announcement.link} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Read more</a></>}</p>
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-24 lg:px-8 lg:py-6 lg:pb-6">
          {/* Re-mounting on navigation gives each page a short entrance. */}
          <div key={pathname} className="animate-fade-up">{children}</div>
        </main>
        {bottom.length > 0 && (
          <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-grey-200 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {bottom.map((i) => (
              <Link key={i.href + i.label} href={i.href} aria-current={isActive(i.href) ? 'page' : undefined} className={cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]', isActive(i.href) ? 'font-semibold text-ink' : 'text-grey-500')}>
                <i.icon size={20} aria-hidden />
                <span className="truncate">{i.label.split(' ')[0]}</span>
              </Link>
            ))}
          </nav>
        )}
      </div>
      <span className="sr-only">{words.noun}</span>
    </div>
  );
}

/** Full-screen branded loader shown while the session and organisation load. */
function Splash({ label }: { label: string }) {
  const { branding } = useBranding();
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-canvas" role="status" aria-live="polite">
      <div className="animate-pop flex items-center gap-3">
        <Logo size="md" className="rounded-xl" />
        <span className="text-lg font-semibold">{branding.name}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-grey-500"><Loader2 size={16} className="animate-spin" aria-hidden /> {label}</div>
    </div>
  );
}

const noopSubscribe = () => () => {};

/** Thin bar along the top while any request is in flight, so the app never feels frozen. */
function ActivityBar() {
  // The server never has requests in flight, so only show the bar once hydrated (avoids a hydration mismatch).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const inFlight = useIsFetching() + useIsMutating();
  const busy = hydrated && inFlight > 0;
  return (
    <div aria-hidden className={cx('pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300', busy ? 'opacity-100' : 'opacity-0')}>
      <div className="activity-bar h-full w-full bg-blue" />
    </div>
  );
}

function NoOrganisation({ name, support, onSignOut }: { name: string; support: { email?: string; phone?: string; helpUrl?: string }; onSignOut: () => void }) {
  const { branding } = useBranding();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="animate-scale-in w-full max-w-md rounded-lg border border-grey-200 bg-paper p-8 text-center shadow-[var(--shadow-card)]">
        <Building2 size={28} className="mx-auto text-grey-400" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold">No Organisation Yet</h1>
        <p className="mt-1 text-sm text-grey-600">Hi {name.split(' ')[0]}. Your account is not linked to a hospital, clinic, lab, pharmacy, ambulance service or practice on {branding.name}.</p>
        <p className="mt-3 text-sm text-grey-600">If your organisation is already registered, ask its owner to add you as staff. If not, contact the {branding.name} team to register it.</p>
        {(support.email || support.phone) && <p className="mt-3 text-sm text-grey-600">{support.phone && <a className="font-medium underline-offset-2 hover:underline" href={`tel:${support.phone.replace(/\s/g, '')}`}>{support.phone}</a>}{support.phone && support.email ? ' · ' : ''}{support.email && <a className="font-medium underline-offset-2 hover:underline" href={`mailto:${support.email}`}>{support.email}</a>}</p>}
        <Button variant="secondary" className="mt-6" onClick={onSignOut}><LogOut size={16} /> Sign Out</Button>
      </div>
    </main>
  );
}

/** Page-level capability gate for the active organisation. */
export function RequireCapability({ anyOf, children }: { anyOf: string[]; children: ReactNode }) {
  const { can } = usePortal();
  if (!anyOf.some((c) => can(c))) {
    return (
      <div role="alert" className="rounded-lg border border-red/30 bg-red-soft px-6 py-10 text-center">
        <p className="font-medium text-red">Your role does not include this area</p>
        <p className="mt-1 text-sm text-grey-700">Ask an owner or admin of your organisation if you need it.</p>
      </div>
    );
  }
  return <>{children}</>;
}
