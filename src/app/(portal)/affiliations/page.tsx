'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Link2, Search, Stethoscope } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useDebounced, useFilters, useGet } from '@/lib/hooks';
import { date, money, relative, title } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, ConfirmDialog, Dialog, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { RequireCapability } from '@/components/layout/portal-shell';
import { DoctorDialog } from '@/components/doctor-dialog';

interface Aff { id: string; status: string; initiatedBy: string; doctor: { id: string; displayName: string; status: string; specialities: string[]; yearsOfExperience: number | null; ratingAverage: number | null; ratingCount: number }; facility: { id: string; displayName: string; type: string; status: string }; location: { id: string; name: string } | null; department: { code: string; name: string } | null; roleTitle: string | null; engagementType: string; consultationFeeMinor: number | null; doctorConfirmedAt: string | null; facilityConfirmedAt: string | null; verifiedAt: string | null; startDate: string | null; statusReason: string | null; version: number; createdAt: string }
interface Hit { id: string; type: string; displayName: string; city: string | null; district: string | null }

const STATUS_HELP: Record<string, string> = { INVITED: 'Waiting for the doctor to accept.', REQUESTED: 'Waiting for the facility to accept.', PENDING_VERIFICATION: 'Both agreed; the platform is verifying.', ACTIVE: 'Live — patients can book the doctor here.', REJECTED: 'Declined.', SUSPENDED: 'Paused by the platform.', ENDED: 'Finished.', CANCELLED: 'Withdrawn before acceptance.' };
const ENGAGEMENTS = ['FULL_TIME', 'PART_TIME', 'VISITING', 'CONSULTANT'];

export default function AffiliationsPage() {
  return <RequireCapability anyOf={['manage_affiliations']}><Inner /></RequireCapability>;
}

function Inner() {
  const org = useOrg();
  const isDoctor = org.type === 'DOCTOR';
  const listPath = isDoctor ? '/portal/doctor/affiliations' : `/portal/providers/${org.providerId}/affiliations`;
  const actPath = (id: string, action: string) => (isDoctor ? `/portal/doctor/affiliations/${id}/${action}` : `/portal/providers/${org.providerId}/affiliations/${id}/${action}`);
  const { filters, set, reset } = useFilters({ status: '', departmentCode: '', specialityCode: '', q: '' });
  const q = useDebounced(filters.q.trim());
  const departments = useGet<{ code: string; name: string }[]>(!isDoctor ? '/portal/catalogue/departments' : null);
  const specialities = useGet<{ code: string; name: string }[]>(!isDoctor ? '/portal/catalogue/specialities' : null);
  const [viewDoctor, setViewDoctor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ aff: Aff; action: 'accept' | 'decline' | 'withdraw' | 'end' } | null>(null);
  const [note, setNote] = useState('');
  const act = useAction(() => api.post(actPath(confirm!.aff.id, confirm!.action), { note: note.trim() || undefined }), { success: 'Updated', invalidate: [listPath, `/portal/providers/${org.providerId}/doctors`], onSuccess: () => { setConfirm(null); setNote(''); } });

  const actionsFor = (a: Aff): { action: 'accept' | 'decline' | 'withdraw' | 'end'; label: string; danger?: boolean }[] => {
    if (a.status === 'INVITED') return isDoctor ? [{ action: 'accept', label: 'Accept' }, { action: 'decline', label: 'Decline', danger: true }] : [{ action: 'withdraw', label: 'Withdraw Invite', danger: true }];
    if (a.status === 'REQUESTED') return isDoctor ? [{ action: 'withdraw', label: 'Withdraw Request', danger: true }] : [{ action: 'accept', label: 'Accept' }, { action: 'decline', label: 'Decline', danger: true }];
    if (a.status === 'ACTIVE' || a.status === 'PENDING_VERIFICATION') return [{ action: 'end', label: 'End', danger: true }];
    return [];
  };

  const columns: ColumnDef<Aff, unknown>[] = [
    { header: isDoctor ? 'Facility' : 'Doctor', cell: ({ row }) => isDoctor ? <div><p className="font-medium">{row.original.facility.displayName}</p><p className="text-xs text-grey-500">{title(row.original.facility.type)}{row.original.department ? ` · ${row.original.department.name}` : ''}{row.original.location ? ` · ${row.original.location.name}` : ''}</p></div> : (
      <div>
        <button type="button" className="min-h-10 text-left font-medium underline-offset-2 hover:underline sm:min-h-0" onClick={() => setViewDoctor(row.original.doctor.id)}>{row.original.doctor.displayName}</button>
        <p className="text-xs text-grey-700">{row.original.doctor.specialities.length ? row.original.doctor.specialities.join(', ') : <span className="text-orange">No verified speciality</span>}{row.original.doctor.yearsOfExperience != null ? ` · ${row.original.doctor.yearsOfExperience} yrs` : ''}{row.original.doctor.ratingAverage != null ? ` · ★ ${row.original.doctor.ratingAverage.toFixed(1)}` : ''}</p>
        <p className="text-xs text-grey-500">Dept: {row.original.department?.name ?? 'not set'}{row.original.location ? ` · ${row.original.location.name}` : ''}</p>
      </div>
    ) },
    { header: 'Terms', cell: ({ row }) => <span className="text-xs">{title(row.original.engagementType)}{row.original.roleTitle ? ` · ${row.original.roleTitle}` : ''} · {money(row.original.consultationFeeMinor)}</span> },
    { header: 'Status', cell: ({ row }) => <div><Badge accent={row.original.status === 'ACTIVE' ? 'green' : ['REJECTED', 'ENDED', 'CANCELLED', 'SUSPENDED'].includes(row.original.status) ? 'red' : 'orange'}>{title(row.original.status)}</Badge><p className="text-xs text-grey-500">{STATUS_HELP[row.original.status]}</p></div> },
    { header: 'Since', cell: ({ row }) => <span className="text-xs text-grey-600">{row.original.startDate ? date(row.original.startDate) : relative(row.original.createdAt)}</span> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex justify-end gap-1">{actionsFor(row.original).map((x) => <Button key={x.action} size="sm" variant={x.danger ? 'ghost' : 'primary'} className={x.danger ? 'text-red' : ''} onClick={() => setConfirm({ aff: row.original, action: x.action })}>{x.label}</Button>)}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={isDoctor ? 'Hospitals & Clinics' : 'Doctors'} description={isDoctor ? 'Where you practise. Request to join a facility, or accept its invitation; the platform verifies before patients can book you there.' : 'Doctors who consult at your facility. Invite a verified doctor; once they accept and the platform verifies, you can set their schedule.'} actions={<Button onClick={() => setCreating(true)}><Link2 size={16} /> {isDoctor ? 'Request to Join' : 'Invite Doctor'}</Button>} />
      <Card padded={false}>
        <div className="p-5">
          <DataTable<Aff> path={listPath} params={{ status: filters.status, departmentCode: filters.departmentCode, specialityCode: filters.specialityCode, q }} columns={columns} emptyTitle={isDoctor ? 'No Facilities Yet' : 'No Doctors Yet'} emptyDescription={isDoctor ? 'Request to join the hospitals and clinics where you sit.' : 'Invite the doctors who consult here so patients can book them.'} toolbar={<>
            <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input aria-label="Search" placeholder={isDoctor ? 'Facility Name' : 'Doctor Name'} value={filters.q} onChange={(e) => set('q', e.target.value)} className="w-56 pl-9" /></div>
            {!isDoctor && <Select aria-label="Department" value={filters.departmentCode} onChange={(e) => set('departmentCode', e.target.value)} className="w-48"><option value="">All Departments</option>{departments.data?.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select>}
            {!isDoctor && <Select aria-label="Speciality" value={filters.specialityCode} onChange={(e) => set('specialityCode', e.target.value)} className="w-48"><option value="">All Specialities</option>{specialities.data?.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</Select>}
            <Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-44"><option value="">All Statuses</option>{Object.keys(STATUS_HELP).map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>
            {(filters.q || filters.departmentCode || filters.specialityCode || filters.status) && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
          </>} />
          {viewDoctor && <DoctorDialog base={`/portal/providers/${org.providerId}`} doctorProviderId={viewDoctor} onClose={() => setViewDoctor(null)} />}
        </div>
      </Card>
      {creating && <AffiliationDialog isDoctor={isDoctor} providerId={org.providerId} listPath={listPath} onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => act.mutate()} title={confirm ? `${title(confirm.action)} — ${isDoctor ? confirm.aff.facility.displayName : confirm.aff.doctor.displayName}` : ''} message={confirm?.action === 'end' ? 'Future slots at this facility are blocked. Existing bookings need to be handled with the patients.' : confirm?.action === 'accept' ? 'Both sides then wait for platform verification.' : 'The other party is informed.'} confirmLabel={confirm ? title(confirm.action) : 'Confirm'} loading={act.isPending} danger={confirm?.action !== 'accept'}>
        <Field label="Note" className="mt-3"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </ConfirmDialog>
    </div>
  );
}

function AffiliationDialog({ isDoctor, providerId, listPath, onClose }: { isDoctor: boolean; providerId: string; listPath: string; onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const hits = useGet<Hit[]>(dq.length >= 2 ? `/portal/catalogue/providers?q=${encodeURIComponent(dq)}${isDoctor ? '' : '&type=DOCTOR'}&limit=8` : null);
  const [target, setTarget] = useState<Hit | null>(null);
  const departments = useGet<{ code: string; name: string }[]>(!isDoctor ? '/portal/catalogue/departments' : null);
  const [f, setF] = useState({ departmentCode: '', roleTitle: '', engagementType: 'VISITING', fee: '', startDate: '' });
  const create = useAction(() => api.post(isDoctor ? '/portal/doctor/affiliations/request' : `/portal/providers/${providerId}/affiliations/invite`, { ...(isDoctor ? { facilityProviderId: target!.id } : { doctorProviderId: target!.id }), departmentCode: f.departmentCode || undefined, roleTitle: f.roleTitle.trim() || undefined, engagementType: f.engagementType, consultationFeeMinor: f.fee ? Math.round(Number(f.fee) * 100) : undefined, startDate: f.startDate || undefined }), { success: isDoctor ? 'Request sent to the facility' : 'Invitation sent to the doctor', invalidate: [listPath], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={isDoctor ? 'Request to Join a Facility' : 'Invite a Doctor'} description="Only approved providers can be linked. Terms can be adjusted later by the platform if both sides agree." icon={isDoctor ? Building2 : Stethoscope} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={!target}>{isDoctor ? 'Send Request' : 'Send Invitation'}</Button></>}>
      <div className="space-y-3">
        <Field label={isDoctor ? 'Hospital or Clinic' : 'Doctor'} required>
          {target ? <div className="flex items-center justify-between rounded-lg border border-grey-200 px-3 py-2 text-sm"><span>{target.displayName} <span className="text-grey-500">· {title(target.type)}{target.district ? ` · ${target.district}` : ''}</span></span><button type="button" className="text-xs text-grey-500 underline-offset-2 hover:underline" onClick={() => setTarget(null)}>Change</button></div> : (
            <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input placeholder="Search by name (at least 2 letters)…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoFocus />
              {dq.length >= 2 && <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-grey-200 bg-paper py-1 text-sm shadow-[var(--shadow-float)]">{hits.isPending ? <li className="px-3 py-2 text-grey-500">Searching…</li> : hits.data?.filter((h) => isDoctor ? ['HOSPITAL', 'CLINIC'].includes(h.type) : h.type === 'DOCTOR').length ? hits.data!.filter((h) => isDoctor ? ['HOSPITAL', 'CLINIC'].includes(h.type) : h.type === 'DOCTOR').map((h) => <li key={h.id}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-grey-50" onClick={() => { setTarget(h); setQ(''); }}><span>{h.displayName}</span><span className="shrink-0 text-xs text-grey-500">{title(h.type)}{h.district ? ` · ${h.district}` : ''}</span></button></li>) : <li className="px-3 py-2 text-grey-500">No approved {isDoctor ? 'facilities' : 'doctors'} match. They must be registered and verified on Carevanta first.</li>}</ul>}
            </div>
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {!isDoctor && <Field label="Department"><Select value={f.departmentCode} onChange={(e) => setF({ ...f, departmentCode: e.target.value })}><option value="">None</option>{departments.data?.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</Select></Field>}
          <Field label="Engagement" required><Select value={f.engagementType} onChange={(e) => setF({ ...f, engagementType: e.target.value })}>{ENGAGEMENTS.map((x) => <option key={x} value={x}>{title(x)}</option>)}</Select></Field>
          <Field label="Role Title" hint="e.g. Senior Consultant"><Input value={f.roleTitle} onChange={(e) => setF({ ...f, roleTitle: e.target.value })} maxLength={120} /></Field>
          <Field label="Consultation Fee at This Facility (₹)"><Input type="number" min={0} value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
          <Field label="Start Date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        </div>
      </div>
    </Dialog>
  );
}
