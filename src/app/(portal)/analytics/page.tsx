'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarCheck, IndianRupee, Star, TimerReset, XCircle } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { useGet } from '@/lib/hooks';
import { count, money, pct, title } from '@/lib/format';
import { Card, CountUp, ErrorState, PageHeader, Skeleton, Stat, Tabs, cx } from '@/components/ui/primitives';

interface Analytics { period: { from: string; to: string }; appointments: { byStatus: Record<string, number>; total: number; completionRate: number | null; cancellationRate: number | null; noShowRate: number | null; upcoming: number }; diagnosticOrders: Record<string, number>; pharmacyOrders: Record<string, number>; revenue: { grossMinor: number; completedTransactions: number }; rating: { average: number | null; count: number } }
interface Daily { kind: 'appointments' | 'diagnostic_orders' | 'pharmacy_orders' | 'trips'; series: { date: string; total: number; completed: number; cancelled: number; grossMinor: number }[] }

const RANGES = [{ key: '7', label: '7 Days' }, { key: '30', label: '30 Days' }, { key: '90', label: '90 Days' }];
const KIND_WORD: Record<Daily['kind'], string> = { appointments: 'Bookings', diagnostic_orders: 'Orders', pharmacy_orders: 'Orders', trips: 'Trips' };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/** A page is the morning report: what happened over the period, how well it went, what it earned. */
export default function AnalyticsPage() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const [days, setDays] = useState('30');
  const range = useMemo(() => {
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date(to.getTime() - Number(days) * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return `from=${from.toISOString()}&to=${to.toISOString()}`;
  }, [days]);
  const summary = useGet<Analytics>(`${base}/analytics?${range}`);
  const daily = useGet<Daily>(`${base}/analytics/daily?${range}`);
  const a = summary.data;
  const isClinical = ['DOCTOR', 'HOSPITAL', 'CLINIC'].includes(org.type);
  const isAmbulance = org.type === 'AMBULANCE_OPERATOR';
  const series = (daily.data?.series ?? []).map((d) => ({ ...d, day: dayLabel(d.date), gross: d.grossMinor / 100 }));
  const kindWord = daily.data ? KIND_WORD[daily.data.kind] : isAmbulance ? 'Trips' : 'Activity';
  const totals = series.reduce((acc, d) => ({ total: acc.total + d.total, completed: acc.completed + d.completed, cancelled: acc.cancelled + d.cancelled }), { total: 0, completed: 0, cancelled: 0 });
  // Ambulance trips have no per-status summary; derive it from the daily series.
  const orders = isAmbulance
    ? (daily.data ? { COMPLETED: totals.completed, CANCELLED: totals.cancelled, OTHER: Math.max(0, totals.total - totals.completed - totals.cancelled) } : undefined)
    : org.type === 'PHARMACY' ? a?.pharmacyOrders : a?.diagnosticOrders;
  const orderTotal = isAmbulance ? totals.total : Object.values(orders ?? {}).reduce((s, n) => s + n, 0);
  const unitWord = isAmbulance ? 'Trips' : 'Orders';

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description="Booking volume, completion and cancellation rates, revenue and ratings for the period. Figures update as the day goes on." actions={<Tabs tabs={RANGES} active={days} onChange={setDays} />} />
      {summary.isError ? <ErrorState error={summary.error} retry={() => summary.refetch()} /> : (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isClinical ? (
            <>
              <Stat icon={CalendarCheck} accent="blue" label="Bookings" value={a ? <CountUp value={a.appointments.total} /> : ''} loading={summary.isPending} hint={a ? `${count(a.appointments.upcoming)} upcoming` : undefined} />
              <Stat icon={BarChart3} accent="green" label="Completion Rate" value={a ? pct(a.appointments.completionRate) : ''} loading={summary.isPending} progress={a?.appointments.completionRate ?? null} progressLabel="Completed" />
              <Stat icon={XCircle} accent="orange" label="Cancellation Rate" value={a ? pct(a.appointments.cancellationRate) : ''} loading={summary.isPending} hint={a ? `No-shows ${pct(a.appointments.noShowRate)}` : undefined} />
            </>
          ) : (
            <>
              <Stat icon={CalendarCheck} accent="blue" label={unitWord} value={a ? <CountUp value={orderTotal} /> : ''} loading={summary.isPending} hint={a ? `${count(totals.completed)} completed in the period` : undefined} />
              <Stat icon={BarChart3} accent="green" label="Completion Rate" value={totals.total ? pct(Math.round((totals.completed / totals.total) * 1000) / 10) : '—'} loading={daily.isPending} progress={totals.total ? (totals.completed / totals.total) * 100 : null} progressLabel="Completed" />
              <Stat icon={XCircle} accent="orange" label="Cancelled / Rejected" value={totals.total ? pct(Math.round((totals.cancelled / totals.total) * 1000) / 10) : '—'} loading={daily.isPending} />
            </>
          )}
          <Stat icon={IndianRupee} accent="purple" label="Gross Earned" value={a ? <CountUp value={a.revenue.grossMinor} format={(n) => money(Math.round(n))} /> : ''} loading={summary.isPending} hint={a ? `${count(a.revenue.completedTransactions)} completed services` : undefined} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={`${kindWord} per Day`} description="Completed in green, cancelled or rejected in orange, everything else still in progress.">
          {daily.isPending ? <Skeleton rows={6} /> : daily.isError ? <ErrorState error={daily.error} retry={() => daily.refetch()} /> : series.length === 0 ? <p className="py-10 text-center text-sm text-grey-500">Nothing in this period yet.</p> : (
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: 5, fontSize: 12 }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill="#059669" />
                  <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#ea580c" />
                  <Bar dataKey="total" name="Total" fill="#2563eb" opacity={0.25} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Gross per Day" description="Rupees from completed services, by the day they were booked.">
          {daily.isPending ? <Skeleton rows={6} /> : series.length === 0 ? <p className="py-10 text-center text-sm text-grey-500">No earnings in this period.</p> : (
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs><linearGradient id="gross" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Gross']} contentStyle={{ borderRadius: 5, fontSize: 12 }} />
                  <Area type="monotone" dataKey="gross" stroke="#7c3aed" fill="url(#gross)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={isClinical ? 'Appointments by Status' : `${unitWord} by Status`}>
          {summary.isPending || (isAmbulance && daily.isPending) ? <Skeleton rows={4} /> : <StatusBars data={isClinical ? (a?.appointments.byStatus ?? {}) : (orders ?? {})} />}
        </Card>
        <Card title="Patient Rating" description="Published reviews only; the platform moderates every review before it counts.">
          {summary.isPending ? <Skeleton rows={2} /> : (
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-orange-soft text-orange"><Star size={24} aria-hidden /></span>
              <div>
                <p className="tnum text-3xl font-bold">{a?.rating.average != null ? a.rating.average.toFixed(1) : '—'}<span className="text-base font-normal text-grey-500"> / 5</span></p>
                <p className="text-xs text-grey-500">{count(a?.rating.count ?? 0)} published reviews</p>
              </div>
              <div className="ml-auto flex items-center gap-1 text-xs text-grey-500"><TimerReset size={12} aria-hidden /> Period {days} days</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatusBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
  if (!entries.length) return <p className="text-sm text-grey-500">Nothing in this period.</p>;
  const max = Math.max(...entries.map((e) => e[1]));
  return (
    <ul className="stagger space-y-2">
      {entries.map(([status, n]) => (
        <li key={status} className="text-sm">
          <div className="mb-1 flex items-center justify-between"><span>{status === 'OTHER' ? 'Other / In Progress' : title(status)}</span><span className="tnum font-medium">{count(n)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-grey-100"><div className={cx('h-full rounded-full transition-[width] duration-500', status === 'COMPLETED' || status === 'DELIVERED' ? 'bg-green' : status.startsWith('CANCELLED') || status === 'REJECTED' || status === 'NO_SHOW' || status === 'RETURNED' ? 'bg-orange' : 'bg-blue')} style={{ width: `${(n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
