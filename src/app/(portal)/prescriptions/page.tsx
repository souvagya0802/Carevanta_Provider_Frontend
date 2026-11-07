'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ScrollText } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useFilters } from '@/lib/hooks';
import { date, dateTime, nowMs, title, toIstInput } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, Dialog, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { RequireCapability } from '@/components/layout/portal-shell';
import { PrescriptionFile } from '@/components/prescription-file';

interface Rx { id: string; patient: { id: string; fullName: string }; reviewStatus: string; reviewNote: string | null; reviewedAt: string | null; issuedOn: string | null; validUntil: string | null; orders: { id: string; reference: string; status: string }[]; createdAt: string }

export default function PrescriptionsPage() {
  return <RequireCapability anyOf={['review_prescriptions']}><Inner /></RequireCapability>;
}

function Inner() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const { filters, set } = useFilters({ status: 'PENDING' });
  const [reviewing, setReviewing] = useState<Rx | null>(null);
  const [f, setF] = useState({ decision: 'APPROVED', note: '', validUntil: '' });
  const review = useAction(() => api.post(`${base}/prescriptions/${reviewing!.id}/review`, { decision: f.decision, note: f.note.trim() || undefined, validUntil: f.validUntil || undefined }), { success: f.decision === 'APPROVED' ? 'Prescription approved — the order can be accepted' : 'Prescription rejected', invalidate: [`${base}/prescriptions`, `${base}/pharmacy-orders`], onSuccess: () => { setReviewing(null); setF({ decision: 'APPROVED', note: '', validUntil: '' }); } });

  const columns: ColumnDef<Rx, unknown>[] = [
    { header: 'Patient', cell: ({ row }) => <div><p className="font-medium">{row.original.patient.fullName}</p><p className="text-xs text-grey-500">Uploaded {dateTime(row.original.createdAt)}</p></div> },
    { header: 'Orders', cell: ({ row }) => <span className="text-xs">{row.original.orders.map((o) => `${o.reference} (${title(o.status)})`).join(', ') || '—'}</span> },
    { header: 'Issued / Valid', cell: ({ row }) => <span className="text-xs">{row.original.issuedOn ? date(row.original.issuedOn) : '—'}{row.original.validUntil ? ` → ${date(row.original.validUntil)}` : ''}</span> },
    { header: 'Review', cell: ({ row }) => <div><Badge accent={row.original.reviewStatus === 'APPROVED' ? 'green' : row.original.reviewStatus === 'REJECTED' ? 'red' : 'orange'}>{title(row.original.reviewStatus)}</Badge>{row.original.reviewNote && <p className="text-xs text-grey-500">{row.original.reviewNote}</p>}</div> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex justify-end">{row.original.reviewStatus === 'PENDING' && <Button size="sm" onClick={() => setReviewing(row.original)}>Review</Button>}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Prescriptions" description="A registered pharmacist checks each prescription before Schedule H, H1 or X medicines are dispensed. Your decision is recorded against your name." />
      <Card padded={false}>
        <div className="p-5">
          <DataTable<Rx> path={`${base}/prescriptions`} params={{ status: filters.status }} columns={columns} emptyTitle={filters.status === 'PENDING' ? 'Nothing Waiting for Review' : 'No Prescriptions'} emptyDescription="Prescriptions attached to orders at your pharmacy appear here." toolbar={<Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-44"><option value="PENDING">Pending Review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="">All</option></Select>} />
        </div>
      </Card>
      {reviewing && (
        <Dialog open onClose={() => setReviewing(null)} title="Review Prescription" description={`${reviewing.patient.fullName} · ${reviewing.orders.map((o) => o.reference).join(', ')}`} icon={ScrollText} size="lg" footer={<><Button variant="ghost" onClick={() => setReviewing(null)} disabled={review.isPending}>Cancel</Button><Button variant={f.decision === 'REJECTED' ? 'danger' : 'primary'} onClick={() => review.mutate()} loading={review.isPending} disabled={f.decision === 'REJECTED' && f.note.trim().length < 5}>{f.decision === 'APPROVED' ? 'Approve' : 'Reject'}</Button></>}>
          <div className="space-y-3">
            <PrescriptionFile providerId={org.providerId} prescriptionId={reviewing.id} />
            <p className="rounded-lg border border-grey-200 bg-grey-50 p-3 text-xs text-grey-700">Confirm the prescriber&apos;s registration, the date, the medicines and quantities, and that it has not already been dispensed.</p>
            <Field label="Decision" required><Select value={f.decision} onChange={(e) => setF({ ...f, decision: e.target.value })}><option value="APPROVED">Approve — dispensing may proceed</option><option value="REJECTED">Reject — invalid, expired or unclear</option></Select></Field>
            {f.decision === 'APPROVED' && <Field label="Valid Until" hint="Usually the prescriber's validity or 6 months for chronic medication"><Input type="date" value={f.validUntil} min={toIstInput(nowMs()).slice(0, 10)} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>}
            <Field label={f.decision === 'REJECTED' ? 'Reason (Shown to the Patient)' : 'Note'} required={f.decision === 'REJECTED'}><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="min-h-20" /></Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
