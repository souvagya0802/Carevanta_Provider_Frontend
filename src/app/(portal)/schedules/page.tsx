'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Lock, Plus, Unlock, UserRound } from 'lucide-react';
import { DoctorDialog } from '@/components/doctor-dialog';
import { useOrg } from '@/lib/portal';
import { api, ApiError } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { money, nowMs } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Doctor { doctorProviderId: string; displayName: string; affiliationId: string | null; consultationFeeMinor: number | null; locationId: string | null; department: string | null; specialities: string[] }
interface Schedule { id: string; doctorProviderId: string; doctorName: string; locationId: string; locationName: string; dayOfWeek: number; startMinute: number; endMinute: number; slotMinutes: number; capacityPerSlot: number; feeMinor: number | null; validFrom: string; validTo: string | null; isActive: boolean }
interface Slot { id: string; doctorProviderId: string; doctorName: string; locationId: string; locationName: string | null; startsAt: string; endsAt: string; capacity: number; bookedCount: number; status: string; feeMinor: number }
interface Location { id: string; name: string; isActive: boolean }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const istDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const dateKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export default function SchedulesPage() {
  return <RequireCapability anyOf={['manage_schedules']}><SchedulesInner /></RequireCapability>;
}

function SchedulesInner() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const doctors = useGet<Doctor[]>(`${base}/doctors`);
  const detail = useGet<{ locations: Location[] }>(base);
  const [doctorId, setDoctorId] = useState('');
  const activeDoctor = doctorId || doctors.data?.[0]?.doctorProviderId || '';
  const schedules = useGet<Schedule[]>(activeDoctor ? `${base}/schedules?doctorProviderId=${activeDoctor}` : null);
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const weekEnd = addDays(weekStart, 7);
  const slotsPath = activeDoctor ? `${base}/slots?doctorProviderId=${activeDoctor}&from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}` : null;
  const slots = useGet<Slot[]>(slotsPath);
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState<Schedule | null>(null);
  const [stopping, setStopping] = useState<Schedule | null>(null);
  const [viewDoctor, setViewDoctor] = useState<string | null>(null);
  const inv = [`${base}/schedules`, `${base}/slots`];
  const stop = useAction((s: Schedule) => api.post(`${base}/schedules/${s.id}/deactivate`), { success: 'Schedule stopped — existing slots stay open until you block them', invalidate: inv, onSuccess: () => setStopping(null) });
  // Flip the chip at once (optimistic), confirm with a toast, roll back on error;
  // the background refetch then brings the server's copy.
  const setSlotStatus = (id: string, status: string) => qc.setQueryData<Slot[]>(['get', slotsPath], (old) => old?.map((x) => (x.id === id ? { ...x, status } : x)));
  const toggleSlot = useAction((s: Slot) => api.post(`${base}/slots/${s.id}/status`, { status: s.status === 'OPEN' ? 'BLOCKED' : 'OPEN' }), {
    concurrent: true,
    invalidate: inv,
    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: ['get', slotsPath] });
      setSlotStatus(s.id, s.status === 'OPEN' ? 'BLOCKED' : 'OPEN');
    },
    onSuccess: (_r, s) => toast.success(s.status === 'OPEN' ? 'Slot Blocked' : 'Slot Reopened', `${new Date(s.startsAt).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}${s.status === 'OPEN' ? ' — patients can no longer book it' : ' — patients can book it again'}`),
    onError: (_e, s) => setSlotStatus(s.id, s.status),
  });
  const byDay = useMemo(() => { const m = new Map<string, Slot[]>(); for (const s of slots.data ?? []) { const k = istDay(s.startsAt); m.set(k, [...(m.get(k) ?? []), s]); } return m; }, [slots.data]);
  const locations = (detail.data?.locations ?? []).filter((l) => l.isActive);

  if (doctors.isPending) return <Skeleton rows={6} />;
  if (doctors.isError) return <ErrorState error={doctors.error} retry={() => doctors.refetch()} />;
  if (!doctors.data?.length) return <><PageHeader title="Schedules & Slots" /><Card><p className="text-sm text-grey-600">No doctor to schedule yet. {org.type === 'DOCTOR' ? 'Your practice profile is missing.' : 'Invite doctors under Doctors; once an affiliation is active you can set their timings here.'}</p></Card></>;
  const doctor = doctors.data.find((d) => d.doctorProviderId === activeDoctor)!;

  return (
    <div className="space-y-4">
      <PageHeader title="Schedules & Slots" description="A schedule is a weekly template (Monday 10:00–13:00, 15-minute slots). Generating slots opens real bookable times; block a slot for leave." actions={<Button onClick={() => setCreating(true)} disabled={!locations.length}><Plus size={16} /> New Schedule</Button>} />
      {org.type !== 'DOCTOR' && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Doctor" className="w-full max-w-sm"><Select value={activeDoctor} onChange={(e) => setDoctorId(e.target.value)}>{doctors.data.map((d) => <option key={d.doctorProviderId} value={d.doctorProviderId}>{d.displayName}{d.specialities.length ? ` · ${d.specialities[0]}` : ''}{d.department ? ` (${d.department})` : ''}</option>)}</Select></Field>
          <Button variant="secondary" onClick={() => setViewDoctor(activeDoctor)}><UserRound size={16} /> View Profile</Button>
        </div>
      )}
      {!locations.length && <p className="rounded-lg border border-orange/30 bg-orange-soft p-3 text-sm text-grey-700">Add an active location first; slots belong to a location.</p>}

      <Card title="Weekly Templates" description={doctor.displayName}>
        {schedules.isPending ? <Skeleton rows={3} /> : schedules.isError ? <ErrorState error={schedules.error} /> : !schedules.data?.length ? <p className="text-sm text-grey-500">No schedule yet. Create one, then generate slots for the coming weeks.</p> : (
          <ul className="divide-y divide-grey-100">
            {schedules.data.map((s) => (
              <li key={s.id} className={cx('flex flex-wrap items-center gap-3 py-2.5', !s.isActive && 'opacity-60')}>
                <span className="w-10 shrink-0 text-sm font-semibold">{DAYS[s.dayOfWeek]}</span>
                <span className="min-w-0 flex-1 text-sm"><span className="tnum font-medium">{toTime(s.startMinute)}–{toTime(s.endMinute)}</span> · {s.slotMinutes} min · {s.capacityPerSlot} per slot · {money(s.feeMinor)}<span className="block text-xs text-grey-500">{s.locationName} · from {s.validFrom}{s.validTo ? ` to ${s.validTo}` : ''}</span></span>
                {!s.isActive ? <Badge>Stopped</Badge> : <span className="flex gap-1"><Button size="sm" variant="secondary" onClick={() => setGenerating(s)}><CalendarPlus size={14} /> Generate Slots</Button><Button size="sm" variant="ghost" className="text-red" onClick={() => setStopping(s)}>Stop</Button></span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Slots" description="Tap a slot to block or reopen it. Booked slots cannot be blocked." actions={
        <span className="flex items-center gap-1 text-xs"><Button size="sm" variant="ghost" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={14} /></Button><span className="tnum w-40 text-center">{weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><Button size="sm" variant="ghost" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={14} /></Button></span>
      }>
        {slots.isPending ? <Skeleton rows={4} /> : slots.isError ? <ErrorState error={slots.error} /> : (
          <div className="grid gap-3 md:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => {
              const day = addDays(weekStart, i);
              const key = dateKey(day);
              const list = byDay.get(key) ?? [];
              const open = list.filter((s) => s.status === 'OPEN').length;
              const booked = list.reduce((n, s) => n + s.bookedCount, 0);
              return (
                <div key={key} className="rounded-lg border border-grey-200 p-2">
                  <p className="text-xs font-semibold">{DAYS[day.getDay()]} <span className="text-grey-500">{day.getDate()}</span></p>
                  <p className="text-[11px] text-grey-500">{list.length ? `${open} open · ${booked} booked` : 'No slots'}</p>
                  <ul className="mt-2 flex flex-wrap gap-1 md:flex-col">
                    {list.map((s) => (
                      <li key={s.id}>
                        <button type="button" disabled={s.bookedCount > 0 || (toggleSlot.isPending && toggleSlot.variables?.id === s.id)} onClick={() => toggleSlot.mutate(s)} title={s.bookedCount > 0 ? `${s.bookedCount} booked` : s.status === 'OPEN' ? 'Block this slot' : 'Reopen this slot'} aria-label={`${new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} · ${s.bookedCount > 0 ? `${s.bookedCount} booked` : s.status === 'OPEN' ? 'Open, tap to block' : 'Blocked, tap to reopen'}`} className={cx('flex min-h-10 w-full items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[11px] md:min-h-0', s.bookedCount > 0 ? 'border-green/30 bg-green-soft text-green' : s.status === 'OPEN' ? 'border-grey-200 hover:bg-grey-50' : 'border-red/30 bg-red-soft text-red')}>
                          <span className="tnum">{new Date(s.startsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                          {s.bookedCount > 0 ? <span>{s.bookedCount}/{s.capacity}</span> : s.status === 'OPEN' ? <Unlock size={10} aria-hidden /> : <Lock size={10} aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {creating && <ScheduleDialog base={base} doctor={doctor} locations={locations} onClose={() => setCreating(false)} />}
      {viewDoctor && <DoctorDialog base={base} doctorProviderId={viewDoctor} onClose={() => setViewDoctor(null)} />}
      {generating && <GenerateDialog base={base} schedule={generating} onClose={() => setGenerating(null)} />}
      <ConfirmDialog open={!!stopping} onClose={() => setStopping(null)} onConfirm={() => stopping && stop.mutate(stopping)} title="Stop This Schedule?" message="No new slots will be generated from it. Slots already generated stay bookable; block them individually if the doctor is unavailable." confirmLabel="Stop Schedule" loading={stop.isPending} danger />
    </div>
  );
}

function ScheduleDialog({ base, doctor, locations, onClose }: { base: string; doctor: Doctor; locations: Location[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [f, setF] = useState({ locationId: doctor.locationId && locations.some((l) => l.id === doctor.locationId) ? doctor.locationId : (locations[0]?.id ?? ''), days: [1, 2, 3, 4, 5] as number[], from: '10:00', to: '13:00', slotMinutes: '15', capacity: '1', fee: doctor.consultationFeeMinor != null ? String(doctor.consultationFeeMinor / 100) : '', validFrom: today, validTo: '' });
  const span = toMin(f.to) - toMin(f.from);
  const slotMin = Number(f.slotMinutes);
  const problems: string[] = [];
  if (!f.locationId) problems.push('Choose a location');
  if (!f.days.length) problems.push('Pick at least one day');
  if (span <= 0) problems.push('End must be after start');
  else if (slotMin && span % slotMin !== 0) problems.push(`${span} minutes is not a whole number of ${slotMin}-minute slots`);
  if (f.validTo && f.validTo < f.validFrom) problems.push('Valid-to is before valid-from');
  const create = useAction(async () => {
    setServerError(null);
    const done: number[] = [];
    for (const day of [...f.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) {
      try {
        await api.post(`${base}/schedules`, { doctorProviderId: doctor.doctorProviderId, locationId: f.locationId, dayOfWeek: day, startMinute: toMin(f.from), endMinute: toMin(f.to), slotMinutes: slotMin, capacityPerSlot: Number(f.capacity), feeMinor: f.fee ? Math.round(Number(f.fee) * 100) : undefined, validFrom: f.validFrom, validTo: f.validTo || undefined });
        done.push(day);
      } catch (err) {
        // Say which day was refused (e.g. 409: overlaps an existing schedule) and what was already saved.
        const msg = err instanceof Error ? err.message : 'Could not create the schedule';
        if (done.length) {
          void qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[1] === 'string' && (q.queryKey[1] as string).startsWith(`${base}/schedules`) });
          setF((cur) => ({ ...cur, days: cur.days.filter((d) => !done.includes(d)) }));
        }
        setServerError(`${DAYS[day]}: ${msg}${done.length ? ` (${done.map((d) => DAYS[d]).join(', ')} ${done.length > 1 ? 'were' : 'was'} created)` : ''}`);
        throw err;
      }
    }
  }, { success: `${f.days.length} schedule${f.days.length > 1 ? 's' : ''} created — now generate slots`, invalidate: [`${base}/schedules`], onSuccess: onClose, errorMessage: (e) => (e instanceof ApiError && e.status === 409 ? `Not created: ${e.message}` : undefined) });
  return (
    <Dialog open onClose={onClose} title="New Schedule" description={`${doctor.displayName} · one template per selected day`} icon={CalendarDays} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={problems.length > 0}>Create</Button></>}>
      <div className="space-y-3">
        <Field label="Location" required><Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        <Field label="Days" required>
          <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" onClick={() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })} className={cx('min-h-10 rounded-lg border px-3 py-1.5 text-sm sm:min-h-0', f.days.includes(d) ? 'border-ink bg-ink text-paper' : 'border-grey-300 hover:bg-grey-50')}>{DAYS[d]}</button>)}</div>
        </Field>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="Starts" required><Input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Ends" required><Input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Minutes per Slot" required><Select value={f.slotMinutes} onChange={(e) => setF({ ...f, slotMinutes: e.target.value })}>{[5, 10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m}</option>)}</Select></Field>
          <Field label="Patients per Slot" required hint="More than 1 for token-style OPD"><Input type="number" min={1} max={200} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
          <Field label="Fee (₹)" hint={doctor.consultationFeeMinor != null ? `Affiliation fee ${money(doctor.consultationFeeMinor)} if blank` : 'Doctor default if blank'}><Input type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
          <Field label="Valid From" required><Input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} /></Field>
          <Field label="Valid To" hint="Blank = until stopped"><Input type="date" value={f.validTo} min={f.validFrom} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></Field>
        </div>
        {span > 0 && slotMin > 0 && span % slotMin === 0 && <p className="text-xs text-grey-500">{span / slotMin} slots per day · up to {(span / slotMin) * Number(f.capacity || 1)} patients.</p>}
        {problems.length > 0 && <p className="text-xs text-red">{problems[0]}</p>}
        {serverError && <p role="alert" className="rounded-lg border border-red/30 bg-red-soft p-3 text-sm text-red">{serverError}</p>}
      </div>
    </Dialog>
  );
}

function GenerateDialog({ base, schedule, onClose }: { base: string; schedule: Schedule; onClose: () => void }) {
  const toast = useToast();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const plus = (d: number) => new Date(nowMs() + d * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [range, setRange] = useState({ from: today, to: plus(28) });
  const days = Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000);
  const problem = days < 0 ? 'End is before start' : days > 62 ? 'At most 62 days at a time' : null;
  const run = useAction(() => api.post<{ data: { created: number; skipped: number } }>(`${base}/schedules/${schedule.id}/generate-slots`, range), { invalidate: [`${base}/slots`], onSuccess: (r) => { toast.success(`${r.data.created} slots opened`, r.data.skipped ? `${r.data.skipped} already existed and were kept` : undefined); onClose(); } });
  return (
    <Dialog open onClose={onClose} title="Generate Slots" description={`${DAYS[schedule.dayOfWeek]} ${toTime(schedule.startMinute)}–${toTime(schedule.endMinute)} at ${schedule.locationName}`} icon={CalendarPlus} footer={<><Button variant="ghost" onClick={onClose} disabled={run.isPending}>Cancel</Button><Button onClick={() => run.mutate()} loading={run.isPending} disabled={!!problem}>Generate</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required><Input type="date" value={range.from} min={today} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="To" required error={problem ?? undefined}><Input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <div className="col-span-2 flex flex-wrap gap-2 text-xs">{[7, 14, 28, 56].map((d) => <button key={d} type="button" className="min-h-10 rounded-lg border border-grey-300 px-2 py-1 hover:bg-grey-50 sm:min-h-0" onClick={() => setRange({ from: today, to: plus(d) })}>Next {d} Days</button>)}</div>
      </div>
      <p className="mt-3 text-xs text-grey-500">Existing slots are never duplicated. Patients can book a slot as soon as it exists.</p>
    </Dialog>
  );
}
