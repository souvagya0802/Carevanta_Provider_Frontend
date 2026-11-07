'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { relative } from '@/lib/format';
import { Button, cx } from '@/components/ui/primitives';

interface Note { id: string; title: string | null; body: string | null; link: string | null; readAt: string | null; createdAt: string }

/**
 * Header bell: unread count polled every 30 s (push, when enabled, arrives
 * faster; the poll keeps desktops without push honest), a dropdown with the
 * latest items, mark-all-read, and a link to the full list.
 */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const count = useGet<{ unread: number; latestAt: string | null }>('/portal/notifications/unread-count', { refetchInterval: 30_000 });
  const latest = useGet<{ items: Note[] }>('/portal/notifications?channel=IN_APP&limit=8');
  const unread = count.data?.unread ?? 0;
  const invalidate = () => { void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[1] === 'string' && (q.queryKey[1] as string).startsWith('/portal/notifications') }); };
  const readAll = useAction(() => api.post('/portal/notifications/read', {}), { onSuccess: invalidate });
  const open = useAction((n: Note) => (n.readAt ? Promise.resolve() : api.post('/portal/notifications/read', { ids: [n.id] })), { concurrent: true, onSuccess: (_r, n) => { invalidate(); if (n.link) router.push(n.link); } });
  const items = latest.data?.items ?? [];

  return (
    <details className="relative">
      <summary aria-label={unread ? `${unread} unread notifications` : 'Notifications'} className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full hover:bg-grey-100 [&::-webkit-details-marker]:hidden">
        <Bell size={18} className={cx(unread && 'animate-pop')} aria-hidden />
        {unread > 0 && <span className="tnum absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-paper">{unread > 99 ? '99+' : unread}</span>}
      </summary>
      {/* Phones: pinned under the header across the screen (anchoring to the bell pushed it off the left edge). Larger screens: under the bell. */}
      <div className="animate-scale-in fixed inset-x-3 top-[76px] z-30 max-h-[70vh] overflow-y-auto rounded-xl border border-grey-200 bg-paper p-2 text-sm shadow-[var(--shadow-float)] sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[360px]">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="font-semibold">Notifications</p>
          {unread > 0 && <Button size="sm" variant="ghost" onClick={() => readAll.mutate()} loading={readAll.isPending}><CheckCheck size={14} /> Mark All Read</Button>}
        </div>
        {items.length === 0 ? <p className="px-2 py-6 text-center text-xs text-grey-500">Nothing yet. New bookings, orders and offers will appear here.</p> : (
          <ul className="max-h-80 divide-y divide-grey-100 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => open.mutate(n)} className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-grey-50', !n.readAt && 'bg-blue-soft/60')}>
                  <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-blue')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate', !n.readAt && 'font-semibold')}>{n.title ?? 'Notification'}</span>
                    {n.body && <span className="block truncate text-xs text-grey-600">{n.body}</span>}
                    <span className="block text-[11px] text-grey-500">{relative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link href="/notifications" className="mt-1 flex min-h-10 items-center justify-center rounded-lg px-2 py-2 text-center text-xs font-medium text-grey-700 hover:bg-grey-100">See All Notifications</Link>
      </div>
    </details>
  );
}
