'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, FileText, IndianRupee, Printer, Receipt, Wallet } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { count, date, dateTime, money, title } from '@/lib/format';
import { DataTable } from '@/components/ui/data-table';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Skeleton, Tabs, Textarea, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { LazyInvoiceButtons, ProviderInvoices, SettlementDocuments } from '@/components/invoices';
import { RequireCapability } from '@/components/layout/portal-shell';
import { openPrintWindow, printDocument, type PrintDoc, type PrintLine } from '@/lib/print';

interface Summary { balanceMinor: number; unsettledMinor: number; period: { from: string; to: string; grossMinor: number; refundedMinor: number; commissionMinor: number; completedTransactions: number }; lastPayout: { amountMinor: number; paidAt: string | null; reference: string | null } | null }
interface Txn { id: string; reference: string; sourceType: string; sourceId?: string | null; category: string; grossMinor: number; refundedMinor: number; status: string; attribution: string; commissionEligible: boolean; eligibilityReason: string | null; serviceCompletedAt: string | null; createdAt: string }
interface Ledger { id: string; entryType: string; amountMinor: number; transactionId: string | null; settlementItemId: string | null; description: string | null; createdAt: string }
/** `batchId` is needed for the batch documents (commission invoice, statement); the buttons hide while the API does not send it. */
interface Payout { id: string; batchId?: string | null; batchReference: string; batchStatus: string; periodEnd: string; amountMinor: number; status: string; payoutReference: string | null; paidAt: string | null; failureReason: string | null; createdAt: string }

/** Statuses where money has been received, so a receipt makes sense. */
const RECEIPT_STATUSES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

interface SourceDetail { patient?: { fullName: string }; reference?: string; doctor?: { displayName: string }; feeMinor?: number; items?: { serviceName?: string; priceMinor?: number; medicine?: { name: string; strength: string | null }; quantity?: number; unitPriceMinor?: number }[] }

/** The order or appointment behind a transaction, for the patient's name and the item lines. Best effort: the document prints from the transaction alone if this fails. */
async function loadSource(base: string, t: Txn): Promise<SourceDetail | null> {
  const seg = t.sourceType === 'APPOINTMENT' ? 'appointments' : t.sourceType === 'DIAGNOSTIC_ORDER' ? 'diagnostic-orders' : t.sourceType === 'PHARMACY_ORDER' ? 'pharmacy-orders' : null;
  if (!seg || !t.sourceId) return null;
  try {
    return (await api.get<{ data: SourceDetail }>(`${base}/${seg}/${t.sourceId}`)).data;
  } catch {
    return null;
  }
}

function buildDoc(kind: PrintDoc['kind'], t: Txn, orgName: string, src: SourceDetail | null): PrintDoc {
  let lines: PrintLine[] = [];
  if (src?.items?.length) {
    lines = src.items.map((i) => i.medicine
      ? { label: `${i.medicine.name}${i.medicine.strength ? ` ${i.medicine.strength}` : ''}`, qty: i.quantity, amountMinor: (i.unitPriceMinor ?? 0) * (i.quantity ?? 1) }
      : { label: i.serviceName ?? title(t.category), amountMinor: i.priceMinor ?? 0 });
  } else if (src?.doctor) {
    lines = [{ label: 'Consultation', detail: src.doctor.displayName, amountMinor: src.feeMinor ?? t.grossMinor }];
  }
  if (!lines.length) lines = [{ label: `${title(t.sourceType)} · ${title(t.category)}`, amountMinor: t.grossMinor }];
  const notes = [`Transaction ${t.reference}${src?.reference ? ` for ${src.reference}` : ''}.`];
  if (t.refundedMinor) notes.push(`${money(t.refundedMinor)} has been refunded to the patient.`);
  if (t.attribution === 'PROVIDER_DIRECT') notes.push('Paid at the counter.');
  return {
    kind,
    organisation: { name: orgName },
    reference: t.reference,
    issuedAt: dateTime(t.serviceCompletedAt ?? t.createdAt),
    billTo: { name: src?.patient?.fullName ?? 'Patient' },
    lines,
    totalMinor: t.grossMinor,
    paymentStatus: title(t.status),
    notes,
  };
}

export default function FinancePage() {
  return <RequireCapability anyOf={['view_finance']}><Inner /></RequireCapability>;
}

function Inner() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const summary = useGet<Summary>(`${base}/finance/summary`);
  const [tab, setTab] = useState<'transactions' | 'ledger' | 'payouts' | 'invoices'>('transactions');
  const [refund, setRefund] = useState<Txn | null>(null);
  const [refundForm, setRefundForm] = useState({ reason: '', amount: '' });
  const toast = useToast();
  const requestRefund = useAction(() => api.post<{ data: { reference: string } }>(`${base}/finance/transactions/${refund!.id}/refund-request`, { reason: refundForm.reason.trim(), amountMinor: refundForm.amount ? Math.round(Number(refundForm.amount) * 100) : undefined }), { invalidate: [`${base}/finance`], onSuccess: (r) => { toast.success('Refund requested', `Case ${r.data.reference} — the finance team reviews it within 3 working days`); setRefund(null); setRefundForm({ reason: '', amount: '' }); } });
  const s = summary.data;
  const print = (kind: PrintDoc['kind'], t: Txn) => {
    let w: Window;
    try {
      w = openPrintWindow();
    } catch (e) {
      toast.error(e);
      return;
    }
    void loadSource(base, t).then((src) => printDocument(buildDoc(kind, t, org.displayName, src), w));
  };

  const txnColumns: ColumnDef<Txn, unknown>[] = [
    { header: 'Reference', cell: ({ row }) => <div><p className="font-mono text-xs">{row.original.reference}</p><p className="text-xs text-grey-500">{title(row.original.sourceType)} · {title(row.original.category)}</p></div> },
    { header: 'Completed', cell: ({ row }) => <span className="text-xs">{row.original.serviceCompletedAt ? dateTime(row.original.serviceCompletedAt) : <span className="text-grey-400">Not yet</span>}</span> },
    { header: 'Gross', cell: ({ row }) => <span className="tnum">{money(row.original.grossMinor)}</span> },
    { header: 'Refunded', cell: ({ row }) => <span className="tnum text-grey-600">{row.original.refundedMinor ? money(row.original.refundedMinor) : '—'}</span> },
    { header: 'Status', cell: ({ row }) => <Badge>{row.original.status}</Badge> },
    { header: 'Platform Fee', cell: ({ row }) => <span className="text-xs">{row.original.commissionEligible ? <Badge accent="blue">Applies</Badge> : <span className="text-grey-500" title={row.original.eligibilityReason ?? undefined}>None{row.original.attribution === 'PROVIDER_DIRECT' ? ' · walk-in' : ''}</span>}</span> },
    { id: 'actions', header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <span className="flex flex-wrap justify-end gap-1">{RECEIPT_STATUSES.includes(row.original.status) ? <LazyInvoiceButtons listPath={`${base}/transactions/${row.original.id}/invoices`} kinds={row.original.refundedMinor ? ['TAX_INVOICE', 'CREDIT_NOTE'] : ['TAX_INVOICE']} /> : row.original.status === 'PENDING_PAYMENT' ? <Button size="sm" variant="ghost" className="h-11 sm:h-8" disabled title="Available after payment"><FileText size={14} aria-hidden /> Download Invoice</Button> : null}<Button size="sm" variant="ghost" onClick={() => print('Invoice', row.original)}><Printer size={14} /> Print Invoice</Button>{(RECEIPT_STATUSES.includes(row.original.status) || (row.original.status === 'PAY_AT_PROVIDER' && !!row.original.serviceCompletedAt)) && <Button size="sm" variant="ghost" onClick={() => print('Receipt', row.original)}><Printer size={14} /> Print Receipt</Button>}{(row.original.status === 'PAID' || row.original.status === 'PARTIALLY_REFUNDED') && <Button size="sm" variant="ghost" onClick={() => setRefund(row.original)}>Request Refund</Button>}</span> },
  ];
  const ledgerColumns: ColumnDef<Ledger, unknown>[] = [
    { header: 'When', cell: ({ row }) => <span className="text-xs">{dateTime(row.original.createdAt)}</span> },
    { header: 'Entry', cell: ({ row }) => <div><p className="text-sm">{title(row.original.entryType)}</p>{row.original.description && <p className="text-xs text-grey-500">{row.original.description}</p>}</div> },
    { header: 'Amount', cell: ({ row }) => <span className={cx('tnum font-medium', row.original.amountMinor < 0 ? 'text-red' : 'text-green')}>{row.original.amountMinor < 0 ? '−' : '+'}{money(Math.abs(row.original.amountMinor))}</span> },
    { header: 'Settled', cell: ({ row }) => row.original.settlementItemId ? <Badge accent="green">Paid Out</Badge> : <Badge accent="orange">Pending</Badge> },
  ];
  const payoutColumns: ColumnDef<Payout, unknown>[] = [
    { header: 'Batch', cell: ({ row }) => <div><p className="font-mono text-xs">{row.original.batchReference}</p><p className="text-xs text-grey-500">Up to {date(row.original.periodEnd)}</p></div> },
    { header: 'Amount', cell: ({ row }) => <span className="tnum font-medium">{money(row.original.amountMinor)}</span> },
    { header: 'Status', cell: ({ row }) => <div><Badge>{row.original.status}</Badge>{row.original.failureReason && <p className="text-xs text-red">{row.original.failureReason}</p>}</div> },
    { header: 'Paid', cell: ({ row }) => <span className="text-xs">{row.original.paidAt ? `${dateTime(row.original.paidAt)}${row.original.payoutReference ? ` · UTR ${row.original.payoutReference}` : ''}` : '—'}</span> },
    { id: 'documents', header: () => <span className="sr-only">Documents</span>, cell: ({ row }) => ['APPROVED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FAILED'].includes(row.original.batchStatus) ? <SettlementDocuments base={base} batchId={row.original.batchId} /> : <span className="text-xs text-grey-400" title="Issued when the payout batch is approved">After approval</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Earnings & Payouts" description="Every completed service becomes a ledger entry: your share, the platform fee and any refund. Payouts are transferred to your verified bank account in batches." />
      {summary.isPending ? <Skeleton rows={2} /> : summary.isError ? <ErrorState error={summary.error} retry={() => summary.refetch()} /> : s && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile icon={Wallet} label="Owed to You" value={money(s.balanceMinor)} sub={s.balanceMinor < 0 ? 'Negative: platform fee on pay-at-counter bookings is recovered from the next payout' : `${money(s.unsettledMinor)} not yet in a batch`} tone={s.balanceMinor < 0 ? 'warn' : undefined} />
          <Tile icon={IndianRupee} label="Gross · 30 Days" value={money(s.period.grossMinor)} sub={`${count(s.period.completedTransactions)} completed services`} />
          <Tile icon={Receipt} label="Platform Fee · 30 Days" value={money(s.period.commissionMinor)} sub={s.period.refundedMinor ? `${money(s.period.refundedMinor)} refunded to patients` : 'No refunds'} />
          <Tile icon={Banknote} label="Last Payout" value={s.lastPayout ? money(s.lastPayout.amountMinor) : '—'} sub={s.lastPayout ? `${dateTime(s.lastPayout.paidAt)}${s.lastPayout.reference ? ` · UTR ${s.lastPayout.reference}` : ''}` : 'No payout yet'} />
        </div>
      )}
      <Tabs tabs={[{ key: 'transactions', label: 'Transactions' }, { key: 'ledger', label: 'Ledger' }, { key: 'payouts', label: 'Payouts' }, { key: 'invoices', label: 'Invoices' }]} active={tab} onChange={(k) => setTab(k as typeof tab)} />
      <Card padded={false}>
        <div className="p-5">
          {tab === 'transactions' && <DataTable<Txn> path={`${base}/finance/transactions`} columns={txnColumns} emptyTitle="No Transactions Yet" emptyDescription="Completed appointments and orders appear here." />}
          {tab === 'ledger' && <DataTable<Ledger> path={`${base}/finance/ledger`} columns={ledgerColumns} emptyTitle="No Ledger Entries Yet" emptyDescription="Entries are written when a service completes, a refund is processed or a payout is made." />}
          {tab === 'payouts' && <DataTable<Payout> path={`${base}/finance/settlements`} columns={payoutColumns} emptyTitle="No Payouts Yet" emptyDescription="Earnings are paid out after the settlement hold period, to the bank account verified on your profile." />}
          {tab === 'invoices' && <ProviderInvoices base={base} />}
        </div>
      </Card>
      <p className="text-xs text-grey-500">Amounts are in rupees. The platform fee follows the agreement for your provider category; a copy is available from the platform team.</p>
      {refund && (
        <Dialog open onClose={() => setRefund(null)} title="Request a Refund" description={`${refund.reference} · ${money(refund.grossMinor - refund.refundedMinor)} still refundable`} icon={Receipt} footer={<><Button variant="ghost" onClick={() => setRefund(null)} disabled={requestRefund.isPending}>Cancel</Button><Button onClick={() => requestRefund.mutate()} loading={requestRefund.isPending} disabled={refundForm.reason.trim().length < 10 || (!!refundForm.amount && (Number(refundForm.amount) <= 0 || Number(refundForm.amount) * 100 > refund.grossMinor - refund.refundedMinor))}>Send Request</Button></>}>
          <div className="space-y-3">
            <Field label="Why Should the Patient Be Refunded?" required hint="At least 10 characters. The finance team sees this and may contact you."><Textarea value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} className="min-h-24" autoFocus /></Field>
            <Field label="Amount (₹)" hint="Leave blank for a full refund"><Input type="number" min={1} step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })} /></Field>
            <p className="text-xs text-grey-500">Refunds go back to the patient the way they paid. Your ledger is adjusted when the refund completes; if the money was already paid out to you, it is recovered from the next payout.</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, tone }: { icon: typeof Wallet; label: string; value: string; sub: string; tone?: 'warn' }) {
  return (
    <div className={cx('rounded-lg border p-3', tone === 'warn' ? 'border-orange/30 bg-orange-soft' : 'border-grey-200 bg-paper')}>
      <div className="flex items-center gap-2"><Icon size={16} className="text-grey-500" aria-hidden /><p className="text-xs font-medium text-grey-600">{label}</p></div>
      <p className="tnum mt-1 text-xl font-bold">{value}</p>
      <p className="truncate text-xs text-grey-500" title={sub}>{sub}</p>
    </div>
  );
}
