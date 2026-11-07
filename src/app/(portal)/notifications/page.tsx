'use client';

import { useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Bell, BellOff, BellRing, CheckCheck, Download, Smartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction, useFilters } from '@/lib/hooks';
import { dateTime, relative, title } from '@/lib/format';
import { disablePush, enablePush, getPushState, isStandalone, type PushState } from '@/lib/push';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, PageHeader, Select, Tabs, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

interface Note { id: string; channel: string; templateKey: string; status: string; title: string | null; body: string | null; link: string | null; readAt: string | null; sentAt: string | null; createdAt: string }

/** Plain-language names for the messages the platform sends staff. */
const LABELS: Record<string, string> = {
  'auth.account_created': 'Your account was created',
  'auth.password_reset': 'Password reset code',
  'auth.verify_email': 'Email verification code',
  'auth.verify_phone': 'Mobile verification code',
  'provider.status_changed': 'Verification status changed',
  'booking.confirmed': 'Appointment confirmed',
  'booking.cancelled': 'Appointment cancelled',
};

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'inapp' | 'sent'>('inapp');
  const { filters, set } = useFilters({ channel: '' });
  const invalidate = () => { void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[1] === 'string' && (q.queryKey[1] as string).startsWith('/portal/notifications') }); };
  const readAll = useAction(() => api.post('/portal/notifications/read', {}), { success: 'All marked as read', invalidate: ['/portal/notifications'], onSuccess: invalidate });
  const openOne = useAction((n: Note) => (n.readAt ? Promise.resolve() : api.post('/portal/notifications/read', { ids: [n.id] })), { concurrent: true, onSuccess: (_r, n) => { invalidate(); if (n.link) window.location.assign(n.link); } });

  const inApp: ColumnDef<Note, unknown>[] = [
    { header: 'Notification', cell: ({ row }) => <button type="button" onClick={() => openOne.mutate(row.original)} className="flex items-start gap-2 text-left"><span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', row.original.readAt ? 'bg-transparent' : 'bg-blue')} aria-hidden /><span><span className={cx('block text-sm', !row.original.readAt && 'font-semibold')}>{row.original.title ?? 'Notification'}</span>{row.original.body && <span className="block text-xs text-grey-600">{row.original.body}</span>}</span></button> },
    { header: 'When', cell: ({ row }) => <span className="text-xs text-grey-600" title={dateTime(row.original.createdAt)}>{relative(row.original.createdAt)}</span> },
    { header: 'Read', cell: ({ row }) => (row.original.readAt ? <Badge accent="ink">Read</Badge> : <Badge accent="blue">New</Badge>) },
  ];
  const sent: ColumnDef<Note, unknown>[] = [
    { header: 'Message', cell: ({ row }) => <div><p className="text-sm font-medium">{row.original.title ?? LABELS[row.original.templateKey] ?? title(row.original.templateKey.replace('.', '_'))}</p><p className="text-xs text-grey-500">{row.original.channel.replace('_', ' ')} · {relative(row.original.createdAt)}</p></div> },
    { header: 'Status', cell: ({ row }) => <Badge accent={row.original.status === 'SENT' ? 'green' : row.original.status === 'FAILED' ? 'red' : 'orange'}>{title(row.original.status)}</Badge> },
    { header: 'Sent', cell: ({ row }) => <span className="text-xs text-grey-600">{row.original.sentAt ? dateTime(row.original.sentAt) : '—'}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Notifications" description="What the platform told you and your team: new bookings, orders, dispatch offers, verification decisions. Turn on push to get them on this device even when the app is closed." actions={tab === 'inapp' && <Button variant="secondary" onClick={() => readAll.mutate()} loading={readAll.isPending}><CheckCheck size={16} /> Mark All Read</Button>} />
      <div className="grid gap-4 lg:grid-cols-2"><PushCard /><InstallCard /></div>
      <Tabs tabs={[{ key: 'inapp', label: 'In App' }, { key: 'sent', label: 'Email & SMS Sent to Me' }]} active={tab} onChange={(k) => setTab(k as typeof tab)} />
      <Card padded={false}>
        <div className="p-5">
          {tab === 'inapp'
            ? <DataTable<Note> path="/portal/notifications" params={{ channel: 'IN_APP' }} columns={inApp} emptyTitle="Nothing Yet" emptyDescription="New bookings, orders and offers for your organisation will appear here." />
            : <DataTable<Note> path="/portal/notifications" params={{ channel: filters.channel || undefined }} columns={sent} emptyTitle="No Messages Yet" emptyDescription="Verification decisions and account messages sent by email or SMS show here. Codes are never shown." toolbar={<Select aria-label="Channel" value={filters.channel} onChange={(e) => set('channel', e.target.value)} className="w-40"><option value="">Email, SMS & Push</option><option value="EMAIL">Email</option><option value="SMS">SMS</option><option value="PUSH">Push</option></Select>} />}
        </div>
      </Card>
    </div>
  );
}

function PushCard() {
  const toast = useToast();
  const [state, setState] = useState<PushState | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    getPushState().then((s) => { if (alive) setState(s); }).catch(() => { if (alive) setState('unavailable'); });
    return () => { alive = false; };
  }, []);
  const toggle = useAction(() => (state === 'on' ? disablePush() : enablePush()), { onSuccess: (s) => { setState(s); if (s === 'on') toast.success('Push notifications are on for this device'); else if (s === 'blocked') toast.error(new Error('Notifications are blocked in your browser settings for this site')); else if (s === 'off') toast.success('Push notifications turned off on this device'); } });
  const copy: Record<PushState | 'loading', string> = {
    loading: 'Checking this device…',
    unsupported: 'This browser cannot receive push notifications. On iPhone, install the app to your Home Screen first (iOS 16.4 or later).',
    blocked: 'Notifications are blocked for this site in the browser settings. Allow them there, then try again.',
    unavailable: 'The platform has not enabled push notifications yet.',
    off: 'Get new bookings, orders and dispatch offers as system notifications on this device, even with the app closed.',
    on: 'This device receives push notifications. Each device you use needs to be turned on separately.',
  };
  return (
    <Card title="Push Notifications" description={copy[state]} actions={state === 'on' ? <Badge accent="green">On</Badge> : state === 'off' ? <Badge accent="orange">Off</Badge> : null}>
      <Button variant={state === 'on' ? 'secondary' : 'primary'} onClick={() => toggle.mutate()} loading={toggle.isPending || state === 'loading'} disabled={state === 'unsupported' || state === 'blocked' || state === 'unavailable'}>
        {state === 'on' ? <><BellOff size={16} /> Turn Off on This Device</> : <><BellRing size={16} /> Turn On for This Device</>}
      </Button>
      <p className="mt-2 flex items-center gap-1 text-xs text-grey-500"><Bell size={12} aria-hidden /> Emergency dispatch offers are sent with high priority and stay on screen until opened.</p>
    </Card>
  );
}

function InstallCard() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  const standalone = typeof window !== 'undefined' && isStandalone();
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
  return (
    <Card title="Install on Your Phone" description={standalone || installed ? 'You are using the installed app.' : prompt ? 'Install the portal as an app: full screen, its own icon, faster to open, push notifications.' : ios ? 'On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen”.' : 'Open this page in Chrome or Edge on your phone and use “Install app” / “Add to Home Screen” from the browser menu.'} actions={(standalone || installed) && <Badge accent="green">Installed</Badge>}>
      {prompt && !standalone && !installed ? (
        <Button onClick={() => { void prompt.prompt().then(() => prompt.userChoice).then((c) => { if (c.outcome === 'accepted') setInstalled(true); setPrompt(null); }); }}><Download size={16} /> Install App</Button>
      ) : (
        <p className="flex items-center gap-1 text-xs text-grey-500"><Smartphone size={12} aria-hidden /> Works on Android, iPhone and desktop. Same login, same data, no app store needed.</p>
      )}
    </Card>
  );
}
