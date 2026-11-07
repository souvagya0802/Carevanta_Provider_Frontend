'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, Eye, IndianRupee, ListOrdered, Search, UserPlus } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { api, newIdempotencyKey, qs, type Page } from '@/lib/api';
import { useAction, useDebounced, useFilters, useGet } from '@/lib/hooks';
import { dateTime, money, nowMs, relative, title } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { RequireCapability } from '@/components/layout/portal-shell';

export interface Appt {
  id: string; reference: string; status: string; mode: string; source: string; attribution: string;
  patient: { id: string; fullName: string; relationship: string }; doctor: { id: string; displayName: string }; facility: { id: string; displayName: string; type: string }; location: { id: string; name: string; city: string } | null; department: { code: string; name: string } | null;
  startsAt: string; endsAt: string; feeMinor: number; statusReason: string | null; confirmedAt: string | null; checkedInAt: string | null; completedAt: string | null; cancelledAt: string | null;
  transaction: { id: string; reference: string; status: string } | null; version: number; createdAt: string;
  events?: { fromStatus: string | null; toStatus: string; actorKind: string; note: string | null; createdAt: string }[];
}

const LIVE = ['REQUESTED', 'CONFIRMED', 'CHECKED_IN'];
/** The statuses the Today view lists (same set as the API's appointments-today). */
const TODAY_STATUSES = ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'];
const ALL_STATUSES = ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_PROVIDER', 'CANCELLED_BY_PLATFORM', 'REJECTED', 'NO_SHOW', 'RESCHEDULED'];
type View = 'today' | 'upcoming' | 'past' | 'all';
/** Now, rounded down to the minute, as an ISO string: stable between renders so the list query key does not change every render. */
const minuteIso = () => new Date(Math.floor(nowMs() / 60_000) * 60_000).toISOString();

/**
 * Write an appointment returned by an action straight into every cached copy
 * (detail, today list, table pages) so the screen shows the new status at
 * once; the invalidation that follows then refreshes history and counts.
 */
function usePatchAppointment(base: string) {
  const qc = useQueryClient();
  return (a: Appt) => {
    const merge = (x: Appt): Appt => (x.id === a.id ? { ...x, ...a, events: x.events } : x);
    qc.setQueryData<Appt>(['get', `${base}/appointments/${a.id}`], (old) => (old ? merge(old) : old));
    qc.setQueriesData<Appt[]>({ predicate: (q) => q.queryKey[0] === 'get' && typeof q.queryKey[1] === 'string' && (q.queryKey[1].startsWith(`${base}/appointments-today`) || q.queryKey[1].startsWith(`${base}/appointments?`)) }, (old) => (Array.isArray(old) ? old.map(merge) : old));
    qc.setQueriesData<Page<Appt>>({ predicate: (q) => q.queryKey[0] === 'table' && q.queryKey[1] === `${base}/appointments` }, (old) => (old?.data ? { ...old, data: old.data.map(merge) } : old));
  };
}
/** What a provider can do from each status; the API enforces the same table plus time rules. */
const ACTIONS: Record<string, { action: string; label: string; tone?: 'danger' | 'primary' }[]> = {
  REQUESTED: [{ action: 'CONFIRM', label: 'Confirm', tone: 'primary' }, { action: 'REJECT', label: 'Reject', tone: 'danger' }],
  CONFIRMED: [{ action: 'CHECK_IN', label: 'Check In', tone: 'primary' }, { action: 'NO_SHOW', label: 'No-Show' }, { action: 'CANCEL', label: 'Cancel', tone: 'danger' }],
  CHECKED_IN: [{ action: 'COMPLETE', label: 'Complete', tone: 'primary' }, { action: 'CANCEL', label: 'Cancel', tone: 'danger' }],
};
const ACTION_HELP: Record<string, string> = {
  CONFIRM: 'The patient is told the appointment is confirmed.',
  REJECT: 'The slot is released and any payment is refunded. A reason is required and shown to the patient.',
  CHECK_IN: 'Marks the patient as arrived. Allowed on the day of the appointment.',
  NO_SHOW: 'Only after the slot time has passed. Unpaid bookings are closed; paid ones stay for review.',
  COMPLETE: 'Closes the visit and makes the fee settleable.',
  CANCEL: 'The slot is released and any payment is refunded. A reason is required and shown to the patient.',
};

export default function AppointmentsPage() {
  return <RequireCapability anyOf={['manage_bookings']}><Suspense fallback={<Skeleton rows={6} />}><AppointmentsInner /></Suspense></RequireCapability>;
}

function AppointmentsInner() {
  const org = useOrg();
  const params = useSearchParams();
  const base = `/portal/providers/${org.providerId}`;
  const [view, setView] = useState<View>('today');
  // "Now" for the Upcoming / Past split: fixed when the tab is chosen, not recomputed every render.
  const [now, setNow] = useState(minuteIso);
  const [todayIst] = useState(() => istDay(new Date(nowMs())));
  const changeView = (k: string) => { setNow(minuteIso()); setView(k as View); };
  const { filters, set, reset } = useFilters({ status: '', q: '', doctorId: '', departmentCode: '', date: '' });
  const q = useDebounced(filters.q.trim());
  const isFacility = org.type !== 'DOCTOR';
  const doctors = useGet<Doctor[]>(isFacility ? `${base}/doctors` : null);
  const departments = [...new Map((doctors.data ?? []).filter((d) => d.departmentCode).map((d) => [d.departmentCode!, d.department!])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const anyFilter = filters.q || filters.status || filters.doctorId || filters.departmentCode || filters.date;
  const scopeFilters = isFacility && (
    <>
      <Select aria-label="Doctor" value={filters.doctorId} onChange={(e) => set('doctorId', e.target.value)} className="w-52"><option value="">All Doctors</option>{(doctors.data ?? []).map((d) => <option key={d.doctorProviderId} value={d.doctorProviderId}>{d.displayName}</option>)}</Select>
      <Select aria-label="Department" value={filters.departmentCode} onChange={(e) => set('departmentCode', e.target.value)} className="w-48"><option value="">All Departments</option>{departments.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</Select>
    </>
  );
  const [openId, setOpenId] = useState<string | null>(params.get('id'));
  const [walkIn, setWalkIn] = useState(false);
  const [queue, setQueue] = useState(false);
  const today = useGet<Appt[]>(view === 'today' && !q ? `${base}/appointments-today` : null, { refetchInterval: 60_000 });
  // Searching on Today goes to the server (name, phone or reference) for today's IST date.
  const todaySearch = useGet<Appt[]>(view === 'today' && q ? `${base}/appointments${qs({ date: todayIst, q, doctorProviderId: filters.doctorId || undefined, departmentCode: filters.departmentCode || undefined, limit: 100 })}` : null);
  const todayData = q ? todaySearch : today;

  const columns: ColumnDef<Appt, unknown>[] = [
    { header: 'When', cell: ({ row }) => <div className="min-w-28"><p className="tnum text-sm font-medium">{new Date(row.original.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</p><p className="text-xs text-grey-500">{new Date(row.original.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}</p></div> },
    { header: 'Patient', cell: ({ row }) => <div><p className="font-medium">{row.original.patient.fullName}</p><p className="text-xs text-grey-500">{title(row.original.patient.relationship)} · {row.original.reference}</p></div> },
    { header: org.type === 'DOCTOR' ? 'Where' : 'Doctor', cell: ({ row }) => <span className="text-xs">{org.type === 'DOCTOR' ? `${row.original.facility.displayName}${row.original.location ? ` · ${row.original.location.name}` : ''}` : `${row.original.doctor.displayName}${row.original.department ? ` · ${row.original.department.name}` : ''}${row.original.location ? ` · ${row.original.location.name}` : ''}`}</span> },
    { header: 'Status', cell: ({ row }) => <Badge>{row.original.status}</Badge> },
    { header: 'Fee', cell: ({ row }) => <span className="tnum">{money(row.original.feeMinor)}</span> },
    { header: 'Payment', cell: ({ row }) => row.original.transaction ? <Badge>{row.original.transaction.status}</Badge> : <span className="text-xs text-grey-400">—</span> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex justify-end"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setOpenId(row.original.id); }}><Eye size={14} /> Open</Button></span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Appointments" description="Confirm requests, check patients in and complete visits. Cancellations and rejections refund the patient automatically. Walk-ins take a real slot so the app never double-books it." actions={<Button onClick={() => setWalkIn(true)}><UserPlus size={16} /> Record Walk-In</Button>} />
      <Tabs tabs={[{ key: 'today', label: 'Today' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }, { key: 'all', label: 'All' }]} active={view} onChange={changeView} />
      {view === 'today' ? (
        <Card padded={false}>
          <div className="p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input aria-label="Search" placeholder="Patient, Phone or Reference" value={filters.q} onChange={(e) => set('q', e.target.value)} className="w-60 pl-9" /></div>
              <Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-44"><option value="">All Statuses</option>{['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>
              {scopeFilters}
              {anyFilter && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
              <Button size="sm" variant={queue ? 'primary' : 'secondary'} className="ml-auto" aria-pressed={queue} onClick={() => setQueue(!queue)}><ListOrdered size={14} /> Queue View</Button>
            </div>
            {todayData.isPending ? <Skeleton rows={5} /> : todayData.isError ? <ErrorState error={todayData.error} retry={() => todayData.refetch()} /> : (() => {
              const rows = (todayData.data ?? []).filter((a) => istDay(new Date(a.startsAt)) === todayIst && TODAY_STATUSES.includes(a.status) && (!filters.status || a.status === filters.status) && (!filters.doctorId || a.doctor.id === filters.doctorId) && (!filters.departmentCode || a.department?.code === filters.departmentCode)).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
              if (!rows.length) return <p className="py-8 text-center text-sm text-grey-500">{q || todayData.data?.length ? 'No appointments match.' : 'No appointments today.'}</p>;
              if (queue) return <QueueView rows={rows} base={base} orgType={org.type} onOpen={setOpenId} />;
              return (
                <ul className="divide-y divide-grey-100">
                  {rows.map((a) => (
                    <li key={a.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 py-3', !LIVE.includes(a.status) && 'opacity-60')}>
                      <span className="tnum w-16 shrink-0 text-base font-semibold">{new Date(a.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.patient.fullName}</span><span className="block truncate text-xs text-grey-500">{org.type === 'DOCTOR' ? `${a.facility.displayName}` : a.doctor.displayName}{a.location ? ` · ${a.location.name}` : ''} · {money(a.feeMinor)}</span></span>
                      <span className="shrink-0"><Badge>{a.status}</Badge></span>
                      <span className="flex shrink-0 gap-1">
                        {(ACTIONS[a.status] ?? []).filter((x) => x.tone === 'primary').map((x) => <QuickAction key={x.action} base={base} appt={a} action={x.action} label={x.label} />)}
                        <Button size="sm" variant="secondary" aria-label={`Open ${a.patient.fullName}`} onClick={() => setOpenId(a.id)}><Eye size={14} /></Button>
                      </span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </Card>
      ) : (
        <Card padded={false}>
          <div className="p-5">
            <DataTable<Appt>
              path={`${base}/appointments`}
              params={{ status: filters.status || undefined, doctorProviderId: filters.doctorId || undefined, departmentCode: filters.departmentCode || undefined, q: q || undefined, date: filters.date || undefined, startsFrom: view === 'upcoming' ? now : undefined, startsTo: view === 'past' ? now : undefined }}
              columns={columns}
              onRowClick={(a) => setOpenId(a.id)}
              emptyTitle={view === 'upcoming' ? 'No Upcoming Appointments' : view === 'past' ? 'No Past Appointments' : 'No Appointments'}
              emptyDescription="Appointments appear here as soon as patients book or your front desk records a walk-in."
              toolbar={<><div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input aria-label="Search" placeholder="Patient, Phone or Reference" value={filters.q} onChange={(e) => set('q', e.target.value)} className="w-60 pl-9" /></div>{scopeFilters}<Input type="date" aria-label="Date" title="Date" value={filters.date} min={view === 'upcoming' ? todayIst : undefined} max={view === 'past' ? todayIst : undefined} onChange={(e) => set('date', e.target.value)} className="w-44" /><Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-52"><option value="">All Statuses</option>{ALL_STATUSES.map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>{anyFilter && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}</>}
            />
          </div>
        </Card>
      )}
      {openId && <AppointmentDialog base={base} id={openId} orgType={org.type} onClose={() => setOpenId(null)} />}
      {walkIn && <WalkInDialog base={base} orgType={org.type} onClose={() => setWalkIn(false)} />}
    </div>
  );
}

/* ─── Queue view: who is being seen, who is next, how long they wait ─────── */
const istTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function QueueView({ rows, base, orgType, onOpen }: { rows: Appt[]; base: string; orgType: string; onOpen: (id: string) => void }) {
  const groups = new Map<string, Appt[]>();
  for (const a of rows) {
    const key = orgType === 'DOCTOR' ? `${a.facility.displayName}${a.location ? ` · ${a.location.name}` : ''}` : a.doctor.displayName;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  if (!groups.size) return <p className="py-8 text-center text-sm text-grey-500">No appointments today.</p>;
  return (
    <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[...groups.entries()].map(([name, list]) => {
        const sorted = [...list].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
        const token = (a: Appt) => sorted.indexOf(a) + 1;
        const serving = sorted.find((a) => a.status === 'CHECKED_IN');
        const waiting = sorted.filter((a) => a.status === 'CONFIRMED' || a.status === 'REQUESTED');
        const done = sorted.filter((a) => a.status === 'COMPLETED').length;
        const first = sorted[0];
        const slotMinutes = first ? Math.max(5, Math.round((new Date(first.endsAt).getTime() - new Date(first.startsAt).getTime()) / 60_000)) : 15;
        return (
          <Card key={name} title={name} description={`${done} seen · ${waiting.length} waiting${serving ? ' · 1 in consultation' : ''}`}>
            {serving ? (
              <div className="rounded-lg border border-green/30 bg-green-soft p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-green">Now Serving · Token {token(serving)}</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-left text-sm font-medium underline-offset-2 hover:underline" onClick={() => onOpen(serving.id)}>{serving.patient.fullName}</button>
                  <QuickAction base={base} appt={serving} action="COMPLETE" label="Complete" />
                </div>
              </div>
            ) : <p className="rounded-lg border border-dashed border-grey-300 p-3 text-xs text-grey-500">Nobody is checked in. Check in the next patient when they arrive.</p>}
            {waiting.length > 0 && (
              <ol className="mt-3 divide-y divide-grey-100">
                {waiting.map((a, i) => {
                  const wait = (i + (serving ? 1 : 0)) * slotMinutes;
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <span className="tnum flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-grey-100 text-xs font-bold">{token(a)}</span>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(a.id)}>
                        <span className="block truncate text-sm font-medium">{a.patient.fullName}</span>
                        <span className="block text-xs text-grey-500">{istTime(a.startsAt)} · {a.status === 'REQUESTED' ? 'not yet confirmed' : wait === 0 ? 'next' : `about ${wait} min`}</span>
                      </button>
                      <QuickAction base={base} appt={a} action={a.status === 'REQUESTED' ? 'CONFIRM' : 'CHECK_IN'} label={a.status === 'REQUESTED' ? 'Confirm' : 'Check In'} />
                    </li>
                  );
                })}
              </ol>
            )}
            {!waiting.length && !serving && done > 0 && <p className="mt-2 text-xs text-grey-500">All patients seen.</p>}
          </Card>
        );
      })}
    </div>
  );
}

/* ─── Walk-in: the front desk books a real slot for a patient at the counter ─ */
interface Doctor { doctorProviderId: string; displayName: string; department: string | null; departmentCode: string | null; specialities: string[] }
interface Slot { id: string; startsAt: string; endsAt: string; capacity: number; bookedCount: number; status: string; locationName: string | null; feeMinor: number }
const istDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

function WalkInDialog({ base, orgType, onClose }: { base: string; orgType: string; onClose: () => void }) {
  const toast = useToast();
  const doctors = useGet<Doctor[]>(`${base}/doctors`);
  const [doctorId, setDoctorId] = useState('');
  const activeDoctor = doctorId || doctors.data?.[0]?.doctorProviderId || '';
  const [day, setDay] = useState(() => istDay(new Date()));
  const from = new Date(`${day}T00:00:00+05:30`);
  const to = new Date(from.getTime() + 86_400_000);
  const slots = useGet<Slot[]>(activeDoctor ? `${base}/slots?doctorProviderId=${activeDoctor}&from=${from.toISOString()}&to=${to.toISOString()}` : null);
  // A walk-in may take the slot that is running right now (the patient is at
  // the counter) or any later one; slots that have already ended are never offered.
  const now = nowMs();
  const open = (slots.data ?? []).filter((s) => s.status === 'OPEN' && s.bookedCount < s.capacity && new Date(s.endsAt).getTime() > now).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  const [slotId, setSlotId] = useState('');
  const chosen = open.find((s) => s.id === slotId) ?? open[0];
  const [f, setF] = useState({ name: '', phone: '' });
  const phoneOk = /^[6-9]\d{9}$/.test(f.phone) || /^\+[1-9]\d{7,14}$/.test(f.phone);
  // One key per dialog attempt: a double tap or a network retry replays the same
  // booking. The dialog unmounts on success, so reopening it starts a new key.
  const [idemKey] = useState(() => newIdempotencyKey('walkin'));
  const patch = usePatchAppointment(base);
  const book = useAction(() => api.post<{ data: Appt }>(`${base}/appointments/walk-in`, { slotId: chosen!.id, patientFullName: f.name.trim(), patientPhone: f.phone.trim() }, idemKey), {
    invalidate: [`${base}/appointments`, `${base}/slots`, `${base}/analytics`],
    onSuccess: (r) => {
      const a = r?.data;
      if (a?.id) patch(a);
      toast.success(`Walk-In ${a?.status ? title(a.status) : 'Recorded'}`, `${a?.reference ? `${a.reference} · ` : ''}Pay at the counter — no platform fee applies to walk-ins`);
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title="Record a Walk-In" description="Books a real slot so the app cannot give it to someone else. The patient pays at the counter." icon={UserPlus} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={book.isPending}>Cancel</Button><Button onClick={() => book.mutate()} loading={book.isPending} disabled={!chosen || f.name.trim().length < 2 || !phoneOk}>Book Walk-In</Button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {orgType !== 'DOCTOR' && <Field label="Doctor" required>{doctors.isPending ? <Skeleton rows={1} /> : <Select value={activeDoctor} onChange={(e) => { setDoctorId(e.target.value); setSlotId(''); }}>{(doctors.data ?? []).map((d) => <option key={d.doctorProviderId} value={d.doctorProviderId}>{d.displayName}</option>)}</Select>}</Field>}
          <Field label="Day" required><Input type="date" value={day} min={istDay(new Date())} onChange={(e) => { setDay(e.target.value); setSlotId(''); }} /></Field>
        </div>
        <Field label="Slot" required hint={slots.data && !open.length ? 'No open slot — add timings under Schedules & Slots or pick another day' : 'The current or next open slot is preselected'}>
          {slots.isPending && activeDoctor ? <Skeleton rows={2} /> : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {open.map((s) => <button key={s.id} type="button" onClick={() => setSlotId(s.id)} aria-pressed={chosen?.id === s.id} className={cx('min-h-10 rounded-lg border px-2.5 py-1.5 text-xs sm:min-h-0', chosen?.id === s.id ? 'border-ink bg-ink text-paper' : 'border-grey-300 hover:bg-grey-50')}><span className="tnum">{istTime(s.startsAt)}</span>{new Date(s.startsAt).getTime() <= now ? ' · Now' : ''}{s.capacity > 1 ? ` · ${s.capacity - s.bookedCount} left` : ''}</button>)}
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Patient Name" required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <Field label="Mobile Number" required hint="10-digit Indian mobile; used for the confirmation SMS and to find the patient next time" error={f.phone && !phoneOk ? 'Enter a valid mobile number' : undefined}><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d+]/g, '') })} placeholder="98000 00000" /></Field>
        </div>
        {chosen && <p className="text-xs text-grey-500">Fee {money(chosen.feeMinor)}{chosen.locationName ? ` · ${chosen.locationName}` : ''}. Recorded as pay-at-counter; it will not be settled through the platform.</p>}
      </div>
    </Dialog>
  );
}

function QuickAction({ base, appt, action, label }: { base: string; appt: Appt; action: string; label: string }) {
  const patch = usePatchAppointment(base);
  const run = useAction(() => api.post<{ data: Appt & { refundRequestedMinor: number } }>(`${base}/appointments/${appt.id}/actions`, { action }), { success: `${label} Done`, invalidate: [`${base}/appointments`, `${base}/appointments-today`, `${base}/analytics`], onSuccess: (r) => { if (r?.data?.id) patch(r.data); } });
  return <Button size="sm" onClick={() => run.mutate()} loading={run.isPending}>{label}</Button>;
}

export function AppointmentDialog({ base, id, orgType, onClose }: { base: string; id: string; orgType: string; onClose: () => void }) {
  const toast = useToast();
  const appt = useGet<Appt>(`${base}/appointments/${id}`);
  const [pending, setPending] = useState<{ action: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const inv = [`${base}/appointments`, `${base}/appointments-today`, `${base}/appointments/${id}`, `${base}/analytics`];
  const patch = usePatchAppointment(base);
  const act = useAction(() => api.post<{ data: Appt & { refundRequestedMinor: number } }>(`${base}/appointments/${id}/actions`, { action: pending!.action, reason: reason.trim() || undefined }), {
    invalidate: inv,
    // Show the new status and actions at once from the response; the refetch then adds the history line.
    onSuccess: (r) => { if (r?.data?.id) patch(r.data); toast.success(`${pending!.label} Done`, r.data.refundRequestedMinor > 0 ? `A refund of ${money(r.data.refundRequestedMinor)} has been raised for the patient.` : undefined); setPending(null); setReason(''); },
  });
  const a = appt.data;
  const needsReason = pending?.action === 'REJECT' || pending?.action === 'CANCEL';

  return (
    <Dialog open onClose={onClose} size="lg" icon={CalendarCheck} title={a ? `${a.patient.fullName} · ${a.reference}` : 'Appointment'} description={a ? `${dateTime(a.startsAt)} · ${orgType === 'DOCTOR' ? a.facility.displayName : a.doctor.displayName}${a.location ? ` · ${a.location.name}` : ''}` : undefined}
      footer={<>{a && (ACTIONS[a.status] ?? []).map((x) => <Button key={x.action} variant={x.tone === 'danger' ? 'danger' : x.tone === 'primary' ? 'primary' : 'secondary'} onClick={() => setPending({ action: x.action, label: x.label })}>{x.label}</Button>)}<Button variant="ghost" onClick={onClose}>Close</Button></>}>
      {appt.isPending ? <Skeleton rows={6} /> : appt.isError || !a ? <ErrorState error={appt.error} retry={() => appt.refetch()} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Badge>{a.status}</Badge><Badge>{title(a.mode)}</Badge><Badge>{title(a.source)}</Badge>{a.transaction && <Badge accent={a.transaction.status === 'PAID' ? 'green' : 'orange'}>Payment {title(a.transaction.status)}</Badge>}</div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-grey-500">Patient</dt><dd className="font-medium">{a.patient.fullName} <span className="font-normal text-grey-500">({title(a.patient.relationship)})</span></dd></div>
            <div><dt className="text-xs text-grey-500">Fee</dt><dd className="tnum flex items-center gap-1"><IndianRupee size={12} aria-hidden />{money(a.feeMinor)}</dd></div>
            <div><dt className="text-xs text-grey-500">Slot</dt><dd>{dateTime(a.startsAt)} → {new Date(a.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</dd></div>
            <div><dt className="text-xs text-grey-500">Booked</dt><dd>{relative(a.createdAt)} via {title(a.source)}</dd></div>
            {a.statusReason && <div className="sm:col-span-2"><dt className="text-xs text-grey-500">Latest Note</dt><dd>{a.statusReason}</dd></div>}
          </dl>
          {a.events && a.events.length > 0 && (
            <div><h3 className="text-xs font-semibold uppercase tracking-wide text-grey-500">History</h3><ul className="mt-1 divide-y divide-grey-100 text-xs">{a.events.map((e, i) => <li key={i} className="flex justify-between gap-2 py-1.5"><span>{e.fromStatus ? `${title(e.fromStatus)} → ` : ''}<span className="font-medium">{title(e.toStatus)}</span> · {e.actorKind.toLowerCase()}{e.note ? ` — ${e.note}` : ''}</span><span className="shrink-0 text-grey-500">{dateTime(e.createdAt)}</span></li>)}</ul></div>
          )}
          <p className="text-xs text-grey-500">Patient contact details are shared only through the platform&apos;s reminders and messages.</p>
        </div>
      )}
      {pending && (
        <Dialog open onClose={() => setPending(null)} title={`${pending.label} Appointment`} description={ACTION_HELP[pending.action]} footer={<><Button variant="ghost" onClick={() => setPending(null)} disabled={act.isPending}>Back</Button><Button variant={needsReason ? 'danger' : 'primary'} onClick={() => act.mutate()} loading={act.isPending} disabled={needsReason && reason.trim().length < 5}>{pending.label}</Button></>}>
          <Field label={needsReason ? 'Reason (Shown to the Patient)' : 'Note'} required={needsReason} hint={needsReason ? 'At least 5 characters' : 'Optional'}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-24" autoFocus /></Field>
        </Dialog>
      )}
    </Dialog>
  );
}
