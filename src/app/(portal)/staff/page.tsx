'use client';

import { useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { dateTime, title } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Member { id: string; userId: string; fullName: string; email: string | null; phone: string | null; memberRole: string; status: string; joinedAt: string | null }
interface Detail { members: Member[]; type: string }

/** What each role can do, in the words staff understand. */
const ROLES: Record<string, { label: string; help: string; types?: string[] }> = {
  OWNER: { label: 'Owner', help: 'Everything, including adding other owners and viewing earnings.' },
  ADMIN: { label: 'Admin', help: 'Profile, locations, schedules, bookings, earnings. Cannot manage staff.' },
  STAFF: { label: 'Front Desk', help: 'Appointments and orders only: confirm, check in, complete, cancel.' },
  PHARMACIST: { label: 'Pharmacist', help: 'Reviews prescriptions, manages stock and dispenses orders.', types: ['PHARMACY'] },
  LAB_TECHNICIAN: { label: 'Lab Technician', help: 'Moves orders along and publishes reports.', types: ['DIAGNOSTIC_LAB', 'IMAGING_CENTRE'] },
  DISPATCHER: { label: 'Dispatcher', help: 'Accepts and tracks ambulance dispatches.', types: ['AMBULANCE_OPERATOR'] },
};

export default function StaffPage() {
  return <RequireCapability anyOf={['manage_staff']}><StaffInner /></RequireCapability>;
}

function StaffInner() {
  const org = useOrg();
  const { me } = useAuth();
  const base = `/portal/providers/${org.providerId}`;
  const detail = useGet<Detail>(base);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const remove = useAction((m: Member) => api.delete(`${base}/members/${m.id}`), { success: 'Staff member removed', invalidate: [base], onSuccess: () => setRemoving(null) });
  if (detail.isPending) return <Skeleton rows={6} />;
  if (detail.isError) return <ErrorState error={detail.error} retry={() => detail.refetch()} />;
  const members = detail.data.members.filter((m) => m.status !== 'REMOVED');
  const myRole = members.find((m) => m.userId === me?.id)?.memberRole;
  const owners = members.filter((m) => m.memberRole === 'OWNER' && m.status === 'ACTIVE').length;

  return (
    <div className="space-y-4">
      <PageHeader title="Staff" description="Who can sign in for your organisation and what they can do. Invited people set their own password from the link they receive." actions={<Button onClick={() => setInviting(true)}><UserPlus size={16} /> Add Staff</Button>} />
      <Card padded={false}>
        <ul className="divide-y divide-grey-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-grey-100 text-xs font-bold">{m.fullName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.fullName}{m.userId === me?.id ? ' (you)' : ''}</p>
                <p className="truncate text-xs text-grey-500">{m.email ?? m.phone ?? '—'}{m.joinedAt ? ` · since ${dateTime(m.joinedAt)}` : ''}</p>
              </div>
              <Badge accent={m.memberRole === 'OWNER' ? 'ink' : 'blue'}>{ROLES[m.memberRole]?.label ?? title(m.memberRole)}</Badge>
              {m.status !== 'ACTIVE' && <Badge accent="orange">{title(m.status)}</Badge>}
              {m.userId !== me?.id && !(m.memberRole === 'OWNER' && owners <= 1) && <Button size="sm" variant="ghost" className="text-red" onClick={() => setRemoving(m)}>Remove</Button>}
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Roles" description="Permissions are enforced by the platform, not just hidden in menus.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">{Object.entries(ROLES).filter(([, r]) => !r.types || r.types.includes(org.type)).map(([k, r]) => <li key={k} className="rounded-lg border border-grey-200 p-3"><p className="font-medium">{r.label}</p><p className="text-xs text-grey-600">{r.help}</p></li>)}</ul>
      </Card>
      {inviting && <InviteDialog base={base} type={org.type} canGrantOwner={myRole === 'OWNER'} onClose={() => setInviting(false)} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing)} title={`Remove ${removing?.fullName ?? ''}?`} message="They lose access to this organisation immediately. Their account itself is not deleted." confirmLabel="Remove" loading={remove.isPending} danger />
    </div>
  );
}

function InviteDialog({ base, type, canGrantOwner, onClose }: { base: string; type: string; canGrantOwner: boolean; onClose: () => void }) {
  const roles = Object.entries(ROLES).filter(([k, r]) => (!r.types || r.types.includes(type)) && (k !== 'OWNER' || canGrantOwner));
  const [f, setF] = useState({ fullName: '', email: '', phone: '', memberRole: roles.find(([k]) => k === 'STAFF') ? 'STAFF' : (roles[0]?.[0] ?? 'STAFF') });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const problems: Record<string, string> = {};
  if (f.fullName.trim().length < 2) problems.fullName = 'At least 2 characters';
  if (!f.email.trim() && !f.phone.trim()) problems.email = 'Email or mobile is required';
  if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) problems.email = 'Invalid email';
  if (f.phone && !/^(\+[1-9]\d{7,14}|[6-9]\d{9})$/.test(f.phone.trim())) problems.phone = 'Use +91… or a 10-digit mobile';
  const invite = useAction(() => api.post<{ data: { invited: boolean } }>(`${base}/members`, { fullName: f.fullName.trim(), email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, memberRole: f.memberRole }), { invalidate: [base], onSuccess: onClose, onError: (e) => { if (e instanceof ApiError) setErrors(e.fieldErrors); } });
  return (
    <Dialog open onClose={onClose} title="Add Staff" description="If this person already has a Carevanta account with the same email or mobile, it is linked; otherwise they are invited to set a password." icon={Users} footer={<><Button variant="ghost" onClick={onClose} disabled={invite.isPending}>Cancel</Button><Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={Object.keys(problems).length > 0}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Full Name" required error={errors.fullName ?? (f.fullName ? problems.fullName : undefined)}><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" error={errors.email ?? (f.email ? problems.email : undefined)}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Mobile" error={errors.phone ?? (f.phone ? problems.phone : undefined)}><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
        <Field label="Role" required hint={ROLES[f.memberRole]?.help}><Select value={f.memberRole} onChange={(e) => setF({ ...f, memberRole: e.target.value })}>{roles.map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</Select></Field>
        {!f.email && f.phone && <p className="text-xs text-orange">Invitations go out by email today; with only a mobile number the person cannot receive the set-password link yet. Add an email if you can.</p>}
      </div>
    </Dialog>
  );
}
