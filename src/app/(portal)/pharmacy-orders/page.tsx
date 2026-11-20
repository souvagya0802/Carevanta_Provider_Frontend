'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Package, Printer, Truck } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useFilters, useGet } from '@/lib/hooks';
import { date, dateTime, money, relative, title } from '@/lib/format';
import { printDocument } from '@/lib/print';
import { PrescriptionFile } from '@/components/prescription-file';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, Dialog, ErrorState, Field, PageHeader, Select, Skeleton, Tabs, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { InvoiceDownloads, type InvoiceMeta } from '@/components/invoices';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Order { id: string; reference: string; status: string; patient: { id: string; fullName: string }; fulfilment: string; deliveryPincode: string | null; prescriptionId: string | null; totalMinor: number; statusReason: string | null; items: { id: string; medicine: { name: string; strength: string | null; schedule: string }; batchNumber: string | null; expiryDate: string | null; quantity: number; unitPriceMinor: number }[]; transaction: { id: string; status: string } | null; createdAt: string; invoices?: InvoiceMeta[] }

const STATUSES = ['PLACED', 'PRESCRIPTION_REVIEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED', 'RETURNED'];
/** The Open tab: the API filters by one status at a time, so the open set is kept on the page. */
const isOpenOrder = (o: { status: string }) => OPEN.includes(o.status);
const OPEN = ['PLACED', 'PRESCRIPTION_REVIEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];
const NEXT: Record<string, { status: string; label: string; tone?: 'danger' | 'primary'; when?: 'PICKUP' | 'DELIVERY' }[]> = {
  PLACED: [{ status: 'ACCEPTED', label: 'Accept', tone: 'primary' }, { status: 'REJECTED', label: 'Reject', tone: 'danger' }],
  PRESCRIPTION_REVIEW: [{ status: 'ACCEPTED', label: 'Accept', tone: 'primary' }, { status: 'REJECTED', label: 'Reject', tone: 'danger' }],
  ACCEPTED: [{ status: 'PREPARING', label: 'Start Preparing', tone: 'primary' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  PREPARING: [{ status: 'READY_FOR_PICKUP', label: 'Ready for Pickup', tone: 'primary', when: 'PICKUP' }, { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', tone: 'primary', when: 'DELIVERY' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  READY_FOR_PICKUP: [{ status: 'DELIVERED', label: 'Handed Over', tone: 'primary' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  OUT_FOR_DELIVERY: [{ status: 'DELIVERED', label: 'Delivered', tone: 'primary' }, { status: 'RETURNED', label: 'Returned', tone: 'danger' }],
};

export default function PharmacyOrdersPage() {
  return <RequireCapability anyOf={['manage_bookings']}><Suspense fallback={<Skeleton rows={6} />}><OrdersInner /></Suspense></RequireCapability>;
}

function OrdersInner() {
  const org = useOrg();
  const params = useSearchParams();
  const base = `/portal/providers/${org.providerId}`;
  const [view, setView] = useState<'open' | 'all'>('open');
  const { filters, set, reset } = useFilters({ status: '' });
  const [openId, setOpenId] = useState<string | null>(params.get('id'));

  const columns: ColumnDef<Order, unknown>[] = [
    { header: 'Order', cell: ({ row }) => <div><p className="font-medium">{row.original.patient.fullName}</p><p className="font-mono text-xs text-grey-500">{row.original.reference} · {relative(row.original.createdAt)}</p></div> },
    { header: 'Items', cell: ({ row }) => <span className="text-xs">{row.original.items.slice(0, 3).map((i) => `${i.medicine.name} ×${i.quantity}`).join(', ')}{row.original.items.length > 3 ? ` +${row.original.items.length - 3}` : ''}</span> },
    { header: 'Fulfilment', cell: ({ row }) => <span className="flex items-center gap-1 text-xs">{row.original.fulfilment === 'DELIVERY' ? <><Truck size={12} aria-hidden /> Delivery · {row.original.deliveryPincode}</> : 'Pickup'}</span> },
    { header: 'Status', cell: ({ row }) => <span className="flex flex-wrap gap-1"><Badge>{row.original.status}</Badge>{row.original.prescriptionId && <Badge accent="blue">Rx</Badge>}</span> },
    { header: 'Amount', cell: ({ row }) => <span className="tnum">{money(row.original.totalMinor)}</span> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex justify-end"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setOpenId(row.original.id); }}><Eye size={14} /> Open</Button></span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Accept, prepare and hand over medicine orders. Prescription-only items wait for a pharmacist's approval; stock is reserved as soon as an order is placed." />
      <Tabs tabs={[{ key: 'open', label: 'Open' }, { key: 'all', label: 'All' }]} active={view} onChange={(k) => { setView(k as typeof view); reset(); }} />
      <Card padded={false}>
        <div className="p-5">
          <DataTable<Order>
            path={`${base}/pharmacy-orders`}
            params={{ status: filters.status }}
            rowFilter={view === 'open' && !filters.status ? isOpenOrder : undefined}
            columns={columns}
            onRowClick={(o) => setOpenId(o.id)}
            emptyTitle="No Orders"
            emptyDescription="Orders appear here when patients order from your store or the Carevanta team orders for them."
            toolbar={<><Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-52"><option value="">{view === 'open' ? 'All Open' : 'All Statuses'}</option>{(view === 'open' ? OPEN : STATUSES).map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>{filters.status && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}</>}
          />
        </div>
      </Card>
      {openId && <OrderDialog base={base} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OrderDialog({ base, id, onClose }: { base: string; id: string; onClose: () => void }) {
  const { can } = usePortal();
  const org = useOrg();
  const toast = useToast();
  const order = useGet<Order>(`${base}/pharmacy-orders/${id}`);
  const [pending, setPending] = useState<{ status: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const inv = [`${base}/pharmacy-orders`, `${base}/pharmacy-orders/${id}`, `${base}/inventory`, `${base}/analytics`];
  const advance = useAction(() => api.post(`${base}/pharmacy-orders/${id}/status`, { status: pending!.status, reason: reason.trim() || undefined }), { success: 'Order updated', invalidate: inv, onSuccess: () => { setPending(null); setReason(''); } });
  const o = order.data;
  const needsReason = ['REJECTED', 'CANCELLED', 'RETURNED'].includes(pending?.status ?? '');
  const actions = o ? (NEXT[o.status] ?? []).filter((x) => !x.when || x.when === o.fulfilment) : [];

  return (
    <Dialog open onClose={onClose} size="lg" icon={Package} title={o ? `${o.patient.fullName} · ${o.reference}` : 'Order'} description={o ? `${title(o.fulfilment)}${o.deliveryPincode ? ` to ${o.deliveryPincode}` : ''} · placed ${relative(o.createdAt)}` : undefined}
      footer={<>{can('manage_bookings') && actions.map((x) => <Button key={x.status} variant={x.tone === 'danger' ? 'danger' : 'primary'} onClick={() => setPending({ status: x.status, label: x.label })}>{x.label}</Button>)}{o && !['PLACED', 'PRESCRIPTION_REVIEW', 'REJECTED', 'CANCELLED'].includes(o.status) && <Button variant="secondary" onClick={() => { try { printDocument({ kind: 'Invoice', organisation: { name: org.displayName }, reference: o.reference, issuedAt: dateTime(o.createdAt), billTo: { name: o.patient.fullName }, lines: o.items.map((i) => ({ label: `${i.medicine.name}${i.medicine.strength ? ` ${i.medicine.strength}` : ''}`, detail: i.batchNumber ? `Batch ${i.batchNumber}${i.expiryDate ? ` · Exp ${date(i.expiryDate)}` : ''}` : undefined, qty: i.quantity, amountMinor: i.unitPriceMinor * i.quantity })), totalMinor: o.totalMinor, paymentStatus: title(o.transaction?.status ?? 'PENDING'), notes: ['Prices include all taxes. Schedule H/H1 medicines were dispensed against a prescription reviewed by a registered pharmacist.', 'Returns are accepted within 7 days for unopened, undamaged packs; cold-chain and Schedule X items are not returnable.'] }); } catch (e) { toast.error(e); } }}><Printer size={14} /> Print Invoice</Button>}<Button variant="ghost" onClick={onClose}>Close</Button></>}>
      {order.isPending ? <Skeleton rows={6} /> : order.isError || !o ? <ErrorState error={order.error} retry={() => order.refetch()} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Badge>{o.status}</Badge>{o.transaction && <Badge accent={o.transaction.status === 'PAID' ? 'green' : 'orange'}>Payment {title(o.transaction.status)}</Badge>}{o.statusReason && <span className="text-xs text-grey-600">{o.statusReason}</span>}</div>
          <InvoiceDownloads base={base} transaction={o.transaction} invoices={o.invoices} />
          {o.status === 'PRESCRIPTION_REVIEW' && <p className="rounded-lg border border-orange/30 bg-orange-soft p-3 text-xs text-grey-700">This order contains prescription-only medicines. A pharmacist must approve the prescription under Prescriptions before it can be accepted.</p>}
          {o.prescriptionId && can('review_prescriptions') && <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-grey-500">Prescription</h3><PrescriptionFile providerId={org.providerId} prescriptionId={o.prescriptionId} /></div>}
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-grey-500"><tr><th className="py-1">Medicine</th><th className="px-2 py-1">Batch</th><th className="px-2 py-1 text-right">Qty</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {o.items.map((i) => <tr key={i.id} className="border-t border-grey-100"><td className="py-1.5"><p>{i.medicine.name}{i.medicine.strength ? ` ${i.medicine.strength}` : ''}</p>{i.medicine.schedule !== 'OTC' && <Badge accent="orange">{i.medicine.schedule.replace('SCHEDULE_', 'Sch ')}</Badge>}</td><td className="px-2 py-1.5 text-xs text-grey-600">{i.batchNumber ?? '—'}{i.expiryDate ? ` · exp ${date(i.expiryDate)}` : ''}</td><td className="tnum px-2 py-1.5 text-right">{i.quantity}</td><td className="tnum py-1.5 text-right">{money(i.unitPriceMinor * i.quantity)}</td></tr>)}
              <tr className="border-t border-grey-200 font-semibold"><td colSpan={3} className="py-1.5">Total</td><td className="tnum py-1.5 text-right">{money(o.totalMinor)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-grey-500">Reserved stock is released if the order is rejected, cancelled or returned, and deducted when it is delivered or handed over.</p>
        </div>
      )}
      {pending && (
        <Dialog open onClose={() => setPending(null)} title={pending.label} description={needsReason ? 'The patient is told the reason; reserved stock goes back on the shelf.' : undefined} footer={<><Button variant="ghost" onClick={() => setPending(null)} disabled={advance.isPending}>Back</Button><Button variant={needsReason ? 'danger' : 'primary'} onClick={() => advance.mutate()} loading={advance.isPending} disabled={needsReason && reason.trim().length < 5}>{pending.label}</Button></>}>
          <Field label={needsReason ? 'Reason (Shown to the Patient)' : 'Note'} required={needsReason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-24" autoFocus /></Field>
        </Dialog>
      )}
    </Dialog>
  );
}
