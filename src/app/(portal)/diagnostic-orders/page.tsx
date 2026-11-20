'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Eye, FileUp, FlaskConical, Home, Printer } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useFilters, useGet } from '@/lib/hooks';
import { dateTime, fromIstInput, money, nowMs, relative, title, toIstInput } from '@/lib/format';
import { printDocument } from '@/lib/print';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { InvoiceDownloads, type InvoiceMeta } from '@/components/invoices';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Order { id: string; reference: string; status: string; patient: { id: string; fullName: string }; collectionMode: string; collectionPincode: string | null; scheduledAt: string | null; totalMinor: number; statusReason: string | null; items: { id: string; serviceName: string; priceMinor: number }[]; reports: { id: string; version: number; status: string; publishedAt: string | null; correctionReason: string | null }[]; transaction: { id: string; status: string; reference: string } | null; createdAt: string; invoices?: InvoiceMeta[] }

const STATUSES = ['REQUESTED', 'CONFIRMED', 'SAMPLE_COLLECTED', 'PROCESSING', 'REPORT_READY', 'COMPLETED', 'CANCELLED', 'REJECTED'];
/** The Open tab: the API filters by one status at a time, so the open set is kept on the page. */
const isOpenOrder = (o: { status: string }) => OPEN.includes(o.status);
const OPEN = ['REQUESTED', 'CONFIRMED', 'SAMPLE_COLLECTED', 'PROCESSING', 'REPORT_READY'];
/** Next steps per status, in the order a lab works them. */
const NEXT: Record<string, { status: string; label: string; tone?: 'danger' | 'primary' }[]> = {
  REQUESTED: [{ status: 'CONFIRMED', label: 'Confirm', tone: 'primary' }, { status: 'REJECTED', label: 'Reject', tone: 'danger' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  CONFIRMED: [{ status: 'SAMPLE_COLLECTED', label: 'Sample Collected', tone: 'primary' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  SAMPLE_COLLECTED: [{ status: 'PROCESSING', label: 'Start Processing', tone: 'primary' }, { status: 'CANCELLED', label: 'Cancel', tone: 'danger' }],
  PROCESSING: [{ status: 'REPORT_READY', label: 'Report Ready', tone: 'primary' }],
  REPORT_READY: [{ status: 'COMPLETED', label: 'Complete', tone: 'primary' }],
};

export default function DiagnosticOrdersPage() {
  return <RequireCapability anyOf={['manage_bookings', 'publish_reports']}><Suspense fallback={<Skeleton rows={6} />}><OrdersInner /></Suspense></RequireCapability>;
}

function OrdersInner() {
  const org = useOrg();
  const params = useSearchParams();
  const base = `/portal/providers/${org.providerId}`;
  const [view, setView] = useState<'open' | 'all'>('open');
  const { filters, set, reset } = useFilters({ status: '', collectionMode: '' });
  const [openId, setOpenId] = useState<string | null>(params.get('id'));

  const columns: ColumnDef<Order, unknown>[] = [
    { header: 'Order', cell: ({ row }) => <div><p className="font-medium">{row.original.patient.fullName}</p><p className="font-mono text-xs text-grey-500">{row.original.reference}</p></div> },
    { header: 'Tests', cell: ({ row }) => <span className="text-xs">{row.original.items.map((i) => i.serviceName).join(', ')}</span> },
    { header: 'Collection', cell: ({ row }) => <span className="flex items-center gap-1 text-xs">{row.original.collectionMode === 'HOME_COLLECTION' ? <><Home size={12} aria-hidden /> Home · {row.original.collectionPincode}</> : 'Centre Visit'}</span> },
    { header: 'Scheduled', cell: ({ row }) => <span className="text-xs">{row.original.scheduledAt ? dateTime(row.original.scheduledAt) : <span className="text-orange">Not set</span>}</span> },
    { header: 'Status', cell: ({ row }) => <span className="flex flex-wrap gap-1"><Badge>{row.original.status}</Badge>{row.original.reports.length > 0 && <Badge accent="blue">Report v{row.original.reports[row.original.reports.length - 1]!.version}</Badge>}</span> },
    { header: 'Amount', cell: ({ row }) => <span className="tnum">{money(row.original.totalMinor)}</span> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex justify-end"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setOpenId(row.original.id); }}><Eye size={14} /> Open</Button></span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Orders & Reports" description="Move each order from request to report. Publishing a report notifies the patient; corrections keep every earlier version." />
      <Tabs tabs={[{ key: 'open', label: 'Open' }, { key: 'all', label: 'All' }]} active={view} onChange={(k) => { setView(k as typeof view); reset(); }} />
      <Card padded={false}>
        <div className="p-5">
          <DataTable<Order>
            path={`${base}/diagnostic-orders`}
            params={{ status: filters.status, collectionMode: filters.collectionMode }}
            rowFilter={view === 'open' && !filters.status ? isOpenOrder : undefined}
            columns={columns}
            onRowClick={(o) => setOpenId(o.id)}
            emptyTitle="No Orders"
            emptyDescription="Orders appear here when patients book your tests or when the Carevanta team books on their behalf."
            toolbar={<>
              <Select aria-label="Status" value={filters.status} onChange={(e) => set('status', e.target.value)} className="w-48"><option value="">{view === 'open' ? 'All Open' : 'All Statuses'}</option>{(view === 'open' ? OPEN : STATUSES).map((s) => <option key={s} value={s}>{title(s)}</option>)}</Select>
              <Select aria-label="Collection" value={filters.collectionMode} onChange={(e) => set('collectionMode', e.target.value)} className="w-44"><option value="">Any Collection</option><option value="HOME_COLLECTION">Home Collection</option><option value="CENTRE_VISIT">Centre Visit</option></Select>
              {(filters.status || filters.collectionMode) && <Button size="sm" variant="ghost" onClick={reset}>Clear</Button>}
            </>}
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
  const order = useGet<Order>(`${base}/diagnostic-orders/${id}`);
  const [pending, setPending] = useState<{ status: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [correction, setCorrection] = useState('');
  const inv = [`${base}/diagnostic-orders`, `${base}/diagnostic-orders/${id}`, `${base}/analytics`];
  const advance = useAction(() => api.post(`${base}/diagnostic-orders/${id}/status`, { status: pending!.status, reason: reason.trim() || undefined }), { success: 'Order updated', invalidate: inv, onSuccess: () => { setPending(null); setReason(''); } });
  const schedule = useAction(() => api.post(`${base}/diagnostic-orders/${id}/schedule`, { scheduledAt: fromIstInput(when) }), { success: 'Time saved — the patient is informed', invalidate: inv, onSuccess: () => setScheduling(false) });
  const publish = useAction(() => api.upload(`${base}/diagnostic-orders/${id}/reports${correction.trim() ? `?correctionReason=${encodeURIComponent(correction.trim())}` : ''}`, file!, 'application/pdf'), { success: 'Report published', invalidate: inv, onSuccess: () => { setPublishing(false); setFile(null); setCorrection(''); } });
  const o = order.data;
  const needsReason = pending?.status === 'CANCELLED' || pending?.status === 'REJECTED';
  const hasReport = !!o?.reports.length;
  const canPublish = can('publish_reports') && !!o && ['PROCESSING', 'REPORT_READY', 'COMPLETED'].includes(o.status);

  return (
    <Dialog open onClose={onClose} size="lg" icon={FlaskConical} title={o ? `${o.patient.fullName} · ${o.reference}` : 'Order'} description={o ? `${title(o.collectionMode)} · placed ${relative(o.createdAt)}` : undefined}
      footer={<>{o && can('manage_bookings') && (NEXT[o.status] ?? []).map((x) => <Button key={x.status} variant={x.tone === 'danger' ? 'danger' : x.tone === 'primary' ? 'primary' : 'secondary'} onClick={() => setPending({ status: x.status, label: x.label })} disabled={x.status === 'REPORT_READY' && !hasReport} title={x.status === 'REPORT_READY' && !hasReport ? 'Publish the report first' : undefined}>{x.label}</Button>)}{o && !['REQUESTED', 'CANCELLED', 'REJECTED'].includes(o.status) && <Button variant="secondary" onClick={() => { try { printDocument({ kind: 'Receipt', organisation: { name: org.displayName }, reference: o.reference, issuedAt: dateTime(o.createdAt), billTo: { name: o.patient.fullName }, lines: o.items.map((i) => ({ label: i.serviceName, amountMinor: i.priceMinor })), totalMinor: o.totalMinor, paymentStatus: title(o.transaction?.status ?? 'PENDING'), notes: [o.collectionMode === 'HOME_COLLECTION' ? `Home collection at PIN ${o.collectionPincode}` : 'Sample collected at the centre', 'Reports are published in the patient app; corrected reports keep every earlier version.'] }); } catch (e) { toast.error(e); } }}><Printer size={14} /> Print Receipt</Button>}<Button variant="ghost" onClick={onClose}>Close</Button></>}>
      {order.isPending ? <Skeleton rows={6} /> : order.isError || !o ? <ErrorState error={order.error} retry={() => order.refetch()} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Badge>{o.status}</Badge>{o.transaction && <Badge accent={o.transaction.status === 'PAID' ? 'green' : 'orange'}>Payment {title(o.transaction.status)}</Badge>}{o.statusReason && <span className="text-xs text-grey-600">{o.statusReason}</span>}</div>
          <InvoiceDownloads base={base} transaction={o.transaction} invoices={o.invoices} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-grey-500">Tests</h3>
              <ul className="mt-1 divide-y divide-grey-100 text-sm">{o.items.map((i) => <li key={i.id} className="flex justify-between py-1.5"><span>{i.serviceName}</span><span className="tnum">{money(i.priceMinor)}</span></li>)}<li className="flex justify-between py-1.5 font-semibold"><span>Total</span><span className="tnum">{money(o.totalMinor)}</span></li></ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-grey-500">Collection</h3>
              <p className="mt-1 text-sm">{o.collectionMode === 'HOME_COLLECTION' ? `Home collection · PIN ${o.collectionPincode}` : 'Patient visits the centre'}</p>
              <p className="text-sm">{o.scheduledAt ? dateTime(o.scheduledAt) : <span className="text-orange">No time set yet</span>}</p>
              {can('manage_bookings') && ['REQUESTED', 'CONFIRMED'].includes(o.status) && <Button size="sm" variant="secondary" className="mt-2" onClick={() => { setWhen(o.scheduledAt ? toIstInput(o.scheduledAt) : ''); setScheduling(true); }}><CalendarClock size={14} /> {o.scheduledAt ? 'Change Time' : 'Set Time'}</Button>}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-grey-500">Reports</h3>{canPublish && <Button size="sm" variant="secondary" onClick={() => setPublishing(true)}><FileUp size={14} /> {hasReport ? 'Publish Correction' : 'Publish Report'}</Button>}</div>
            {o.reports.length === 0 ? <p className="mt-1 text-sm text-grey-500">{o.status === 'PROCESSING' ? 'Upload the signed PDF when results are ready.' : 'Reports can be published once the order is processing.'}</p> : (
              <ul className="mt-1 divide-y divide-grey-100 text-sm">{o.reports.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1.5"><span>Version {r.version}{r.correctionReason ? <span className="block text-xs text-grey-500">Correction: {r.correctionReason}</span> : null}</span><span className="flex items-center gap-2 text-xs text-grey-500"><Badge accent={r.status === 'PUBLISHED' ? 'green' : 'ink'}>{title(r.status)}</Badge>{dateTime(r.publishedAt)}</span></li>)}</ul>
            )}
          </div>
          <p className="text-xs text-grey-500">Patients see the report in their app immediately after publishing. Old versions stay visible as amended, never deleted.</p>
        </div>
      )}
      {pending && (
        <Dialog open onClose={() => setPending(null)} title={pending.label} description={needsReason ? 'The patient is told the reason and any payment is refunded.' : undefined} footer={<><Button variant="ghost" onClick={() => setPending(null)} disabled={advance.isPending}>Back</Button><Button variant={needsReason ? 'danger' : 'primary'} onClick={() => advance.mutate()} loading={advance.isPending} disabled={needsReason && reason.trim().length < 5}>{pending.label}</Button></>}>
          <Field label={needsReason ? 'Reason (Shown to the Patient)' : 'Note'} required={needsReason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-24" autoFocus /></Field>
        </Dialog>
      )}
      {scheduling && (
        <Dialog open onClose={() => setScheduling(false)} title="Collection / Visit Time" icon={CalendarClock} footer={<><Button variant="ghost" onClick={() => setScheduling(false)}>Cancel</Button><Button onClick={() => schedule.mutate()} loading={schedule.isPending} disabled={!fromIstInput(when) || new Date(fromIstInput(when)!).getTime() < nowMs()}>Save Time</Button></>}>
          <Field label="Date and Time" required hint="Indian Standard Time"><Input type="datetime-local" value={when} min={toIstInput(nowMs())} onChange={(e) => setWhen(e.target.value)} /></Field>
        </Dialog>
      )}
      {publishing && (
        <Dialog open onClose={() => setPublishing(false)} title={hasReport ? 'Publish a Corrected Report' : 'Publish Report'} icon={FileUp} footer={<><Button variant="ghost" onClick={() => setPublishing(false)} disabled={publish.isPending}>Cancel</Button><Button onClick={() => publish.mutate()} loading={publish.isPending} disabled={!file || file.type !== 'application/pdf' || (hasReport && correction.trim().length < 5)}>Publish</Button></>}>
          <div className="space-y-3">
            <Field label="Signed Report (PDF)" required hint="Up to 10 MB"><Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-1.5" /></Field>
            {hasReport && <Field label="Correction Reason" required hint="Recorded on the new version and shown to the patient and their doctor"><Textarea value={correction} onChange={(e) => setCorrection(e.target.value)} className="min-h-20" /></Field>}
            <p className="text-xs text-grey-500">Check the patient name and order reference on the PDF before publishing. A report published to the wrong order must be corrected, not deleted.</p>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}
