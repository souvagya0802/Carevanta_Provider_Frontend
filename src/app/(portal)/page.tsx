'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, BadgeCheck, CalendarCheck, CheckCircle2, Clock, FlaskConical, IndianRupee, Package, Star, Users } from 'lucide-react';
import { useOrg, usePortal, useTypeWords } from '@/lib/portal';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/lib/hooks';
import { count, money, nowMs, pct, title } from '@/lib/format';
import type { ReactNode } from 'react';
import { Badge, Card, CountUp, ErrorState, Skeleton, cx } from '@/components/ui/primitives';

interface Analytics { period: { from: string; to: string }; appointments: { byStatus: Record<string, number>; total: number; completionRate: number | null; cancellationRate: number | null; noShowRate: number | null; upcoming: number }; diagnosticOrders: Record<string, number>; pharmacyOrders: Record<string, number>; revenue: { grossMinor: number; completedTransactions: number }; rating: { average: number | null; count: number } }
interface Verification { providerStatus: string; caseStatus: string | null; decisionNote: string | null; checks: { checkType: string; isRequired: boolean; status: string; todo: string[] }[]; readyToSubmit: boolean; blockers: string[] }
interface Appointment { id: string; reference: string; status: string; patient: { fullName: string }; doctor: { displayName: string }; location: { name: string } | null; startsAt: string; feeMinor: number }
interface Summary { balanceMinor: number; unsettledMinor: number; period: { grossMinor: number; commissionMinor: number; completedTransactions: number } }

/**
 * Home: the morning glance. What needs attention first (verification, SLA),
 * then today's work, then the numbers for the last 30 days.
 */
export default function HomePage() {
  const org = useOrg();
  const { can } = usePortal();
  const { me } = useAuth();
  const words = useTypeWords(org.type);
  const base = `/portal/providers/${org.providerId}`;
  const isClinical = ['DOCTOR', 'HOSPITAL', 'CLINIC'].includes(org.type);
  const isLab = ['DIAGNOSTIC_LAB', 'IMAGING_CENTRE'].includes(org.type);
  const analytics = useGet<Analytics>(`${base}/analytics`);
  const verification = useGet<Verification>(`${base}/verification`);
  const today = useGet<Appointment[]>(isClinical && can('manage_bookings') ? `${base}/appointments-today` : null);
  const finance = useGet<Summary>(can('view_finance') ? `${base}/finance/summary` : null);
  const firstName = me?.fullName.split(' ')[0] ?? 'there';
  const a = analytics.data;
  const v = verification.data;
  const todoCount = v?.checks.reduce((s, c) => s + c.todo.length, 0) ?? 0;
  const liveToday = today.data?.filter((x) => ['REQUESTED', 'CONFIRMED', 'CHECKED_IN'].includes(x.status)) ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-ink p-5 text-paper lg:p-6">
        <p className="text-sm text-grey-300">Good {greeting(nowMs())}, {firstName}</p>
        <h1 className="mt-1 text-xl font-bold lg:text-2xl">{org.displayName}</h1>
        <p className="mt-1 text-sm text-grey-300">{title(org.type)} · you are {title(org.memberRole).toLowerCase()}</p>
        <div className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat icon={CalendarCheck} label={isClinical ? 'Appointments Today' : isLab ? 'Open Orders' : org.type === 'PHARMACY' ? 'Open Orders' : 'Upcoming'} value={isClinical ? (today.isPending && can('manage_bookings') ? null : count(liveToday.length)) : isLab ? (a ? count(sum(a.diagnosticOrders, ['REQUESTED', 'CONFIRMED', 'SAMPLE_COLLECTED', 'PROCESSING'])) : null) : org.type === 'PHARMACY' ? (a ? count(sum(a.pharmacyOrders, ['PLACED', 'PRESCRIPTION_REVIEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'])) : null) : (a ? count(a.appointments.upcoming) : null)} />
          <HeroStat icon={CheckCircle2} label="Completion · 30 Days" value={a ? (a.appointments.completionRate == null ? pct(null) : <CountUp value={a.appointments.completionRate} format={(n) => pct(Math.round(n * 10) / 10)} />) : null} />
          <HeroStat icon={IndianRupee} label="Gross · 30 Days" value={a ? <CountUp value={a.revenue.grossMinor} format={(n) => money(Math.round(n))} /> : null} />
          <HeroStat icon={Star} label="Rating" value={a ? (a.rating.average != null ? `${a.rating.average.toFixed(1)} · ${count(a.rating.count)}` : 'No reviews yet') : null} />
        </div>
      </section>

      {verification.isPending ? <Skeleton rows={2} /> : v && v.providerStatus !== 'APPROVED' && (
        <Link href="/verification" className={cx('flex items-start gap-3 rounded-lg border p-4 text-sm', v.providerStatus === 'REJECTED' || v.providerStatus === 'SUSPENDED' ? 'border-red/30 bg-red-soft' : 'border-orange/30 bg-orange-soft')}>
          {v.providerStatus === 'REJECTED' || v.providerStatus === 'SUSPENDED' ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red" aria-hidden /> : <BadgeCheck size={18} className="mt-0.5 shrink-0 text-orange" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{v.providerStatus === 'DRAFT' ? 'Your organisation is not listed yet' : v.providerStatus === 'SUBMITTED' || v.providerStatus === 'UNDER_REVIEW' ? 'Verification in progress' : v.providerStatus === 'CHANGES_REQUESTED' ? 'The verification team needs something from you' : v.providerStatus === 'REJECTED' ? 'Your application was not approved' : 'Your listing is suspended'}</span>
            <span className="block text-xs text-grey-700">{v.decisionNote ?? (v.readyToSubmit ? 'Everything required is in place — submit for verification.' : v.blockers[0] ?? (todoCount ? `${todoCount} item${todoCount > 1 ? 's' : ''} still needed for your checks.` : 'Patients can book only after approval.'))}</span>
          </span>
          <ArrowRight size={16} className="mt-0.5 shrink-0 text-grey-500" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {isClinical && can('manage_bookings') && (
            <Card title="Today" description={today.data ? `${liveToday.length} live · ${today.data.length - liveToday.length} done or missed` : undefined} actions={<Link href="/appointments" className="inline-flex min-h-10 items-center text-xs font-medium underline-offset-2 hover:underline sm:min-h-0">All Appointments</Link>}>
              {today.isPending ? <Skeleton rows={4} /> : today.isError ? <ErrorState error={today.error} retry={() => today.refetch()} /> : today.data!.length === 0 ? <p className="text-sm text-grey-500">No appointments today.</p> : (
                <ul className="divide-y divide-grey-100">
                  {today.data!.slice(0, 8).map((x) => (
                    <li key={x.id}>
                      <Link href={`/appointments/${x.id}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 hover:bg-grey-50">
                        <span className="tnum w-14 shrink-0 text-sm font-semibold">{new Date(x.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.patient.fullName}</span><span className="block truncate text-xs text-grey-500">{org.type === 'DOCTOR' ? x.location?.name ?? '' : x.doctor.displayName}{x.location && org.type !== 'DOCTOR' ? ` · ${x.location.name}` : ''}</span></span>
                        <span className="shrink-0"><Badge>{x.status}</Badge></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {isLab && a && (
            <Card title="Orders · Last 30 Days" actions={<Link href="/diagnostic-orders" className="inline-flex min-h-10 items-center text-xs font-medium underline-offset-2 hover:underline sm:min-h-0">Open Orders</Link>}>
              <StatusRow data={a.diagnosticOrders} icon={FlaskConical} empty="No diagnostic orders in this period." />
            </Card>
          )}
          {org.type === 'PHARMACY' && a && (
            <Card title="Orders · Last 30 Days" actions={<Link href="/pharmacy-orders" className="inline-flex min-h-10 items-center text-xs font-medium underline-offset-2 hover:underline sm:min-h-0">Open Orders</Link>}>
              <StatusRow data={a.pharmacyOrders} icon={Package} empty="No medicine orders in this period." />
            </Card>
          )}
          {isClinical && a && a.appointments.total > 0 && (
            <Card title="Appointments · Last 30 Days">
              <StatusRow data={a.appointments.byStatus} icon={CalendarCheck} empty="" />
              <p className="mt-3 text-xs text-grey-500">Cancellations {pct(a.appointments.cancellationRate)} · No-shows {pct(a.appointments.noShowRate)} · {count(a.appointments.upcoming)} upcoming</p>
            </Card>
          )}
          {analytics.isError && <ErrorState error={analytics.error} retry={() => analytics.refetch()} />}
        </div>
        <div className="min-w-0 space-y-4">
          {can('view_finance') && (
            <Card title="Earnings" actions={<Link href="/finance" className="inline-flex min-h-10 items-center text-xs font-medium underline-offset-2 hover:underline sm:min-h-0">Details</Link>}>
              {finance.isPending ? <Skeleton rows={3} /> : finance.isError ? <ErrorState error={finance.error} /> : finance.data && (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-grey-500">Owed to You</dt><dd className="tnum font-semibold">{money(finance.data.balanceMinor)}</dd></div>
                  <div className="flex justify-between"><dt className="text-grey-500">Gross · 30 Days</dt><dd className="tnum">{money(finance.data.period.grossMinor)}</dd></div>
                  <div className="flex justify-between"><dt className="text-grey-500">Platform Fee · 30 Days</dt><dd className="tnum">{money(finance.data.period.commissionMinor)}</dd></div>
                  <div className="flex justify-between"><dt className="text-grey-500">Completed Services</dt><dd className="tnum">{count(finance.data.period.completedTransactions)}</dd></div>
                </dl>
              )}
            </Card>
          )}
          <Card title="Quick Actions">
            <div className="grid grid-cols-2 gap-2">
              {isClinical && can('manage_schedules') && <Quick href="/schedules" icon={Clock} label="Schedules" />}
              {isClinical && can('manage_bookings') && <Quick href="/appointments" icon={CalendarCheck} label="Appointments" />}
              {isLab && <Quick href="/services" icon={FlaskConical} label="Tests & Prices" />}
              {org.type === 'PHARMACY' && can('manage_inventory') && <Quick href="/inventory" icon={Package} label="Stock" />}
              <Quick href="/locations" icon={ArrowRight} label={words.locationsTitle} />
              <Quick href="/documents" icon={BadgeCheck} label="Documents" />
              {can('manage_staff') && <Quick href="/staff" icon={Users} label="Staff" />}
              {can('view_finance') && <Quick href="/finance" icon={IndianRupee} label="Payouts" />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const sum = (m: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + (m[k] ?? 0), 0);
/** Greeting by the IST hour, so it matches the clinic's clock whatever the device's time zone. */
const greeting = (ms: number) => {
  const h = Number(new Date(ms).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
};

function HeroStat({ icon: Icon, label, value }: { icon: typeof Star; label: string; value: ReactNode | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-3 transition-colors hover:bg-white/15">
      <div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10"><Icon size={15} aria-hidden /></span>{value === null ? <span className="h-6 w-16 animate-pulse rounded bg-white/10" /> : <span className="tnum min-w-0 break-words text-base leading-tight font-bold sm:text-lg">{value}</span>}</div>
      <p className="mt-1.5 text-xs text-grey-300">{label}</p>
    </div>
  );
}

function StatusRow({ data, icon: Icon, empty }: { data: Record<string, number>; icon: typeof Star; empty: string }) {
  const entries = Object.entries(data).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-grey-500">{empty}</p>;
  const max = Math.max(...entries.map((e) => e[1]));
  return (
    <ul className="space-y-2">
      {entries.map(([k, n]) => (
        <li key={k} className="flex items-center gap-3 text-sm">
          <Icon size={14} className="shrink-0 text-grey-400" aria-hidden />
          <span className="w-28 shrink-0 truncate sm:w-40" title={title(k)}>{title(k)}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-grey-100"><span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((n / max) * 100)}%` }} /></span>
          <span className="tnum w-10 shrink-0 text-right font-medium">{count(n)}</span>
        </li>
      ))}
    </ul>
  );
}

function Quick({ href, icon: Icon, label }: { href: string; icon: typeof Star; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg border border-grey-200 px-3 py-2.5 text-sm hover:bg-grey-50">
      <Icon size={16} className="shrink-0 text-grey-500" aria-hidden /><span className="truncate">{label}</span>
    </Link>
  );
}

