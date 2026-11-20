'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Download, FileText, Share2 } from 'lucide-react';
import { ApiError, api } from '@/lib/api';
import { useDownload } from '@/lib/download';
import { date, money } from '@/lib/format';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

export type InvoiceKind = 'TAX_INVOICE' | 'CREDIT_NOTE' | 'COMMISSION_INVOICE' | 'SETTLEMENT_STATEMENT';
export interface InvoiceMeta {
  id: string;
  number: string;
  kind: InvoiceKind;
  issuedAt: string;
  currency: string;
  totalMinor: number;
  taxMinor: number;
  sourceType?: string | null;
  sourceId?: string | null;
  transactionId?: string | null;
  providerId?: string | null;
  patientProfileId?: string | null;
  pdfUrl?: string | null;
}

export const INVOICE_LABEL: Record<InvoiceKind, string> = {
  TAX_INVOICE: 'Download Invoice',
  CREDIT_NOTE: 'Credit Note',
  COMMISSION_INVOICE: 'Commission Invoice',
  SETTLEMENT_STATEMENT: 'Statement',
};
export const INVOICE_KIND_NAME: Record<InvoiceKind, string> = { TAX_INVOICE: 'Tax Invoice', CREDIT_NOTE: 'Credit Note', COMMISSION_INVOICE: 'Commission Invoice', SETTLEMENT_STATEMENT: 'Settlement Statement' };

/** Transaction states after money was taken, so a tax invoice exists (refunds add a credit note). */
export const PAID_STATES = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];
export const isPaid = (status: string | null | undefined) => !!status && PAID_STATES.includes(status);
export const pdfPath = (inv: InvoiceMeta) => inv.pdfUrl || `/invoices/${inv.id}/pdf`;

/** Accepts `{ data: { items } }`, `{ items }` or `{ data: [] }`. */
export function invoiceItems(r: unknown): InvoiceMeta[] {
  const o = (r ?? {}) as { data?: unknown; items?: unknown };
  const inner = (o.data ?? o) as { items?: unknown } | unknown[];
  const list = Array.isArray(inner) ? inner : Array.isArray((inner as { items?: unknown }).items) ? (inner as { items: unknown[] }).items : Array.isArray(o.items) ? o.items : [];
  return list as InvoiceMeta[];
}
function nextCursorOf(r: unknown): string | null {
  const o = (r ?? {}) as { page?: { nextCursor?: string | null }; data?: { page?: { nextCursor?: string | null } } };
  return o.page?.nextCursor ?? o.data?.page?.nextCursor ?? null;
}

/** One download button (plus a Share button on phones that can share files). 44 px tall on phones. */
export function InvoiceButton({ inv, label }: { inv: InvoiceMeta; label?: string }) {
  const { download, busy, shareable } = useDownload();
  const path = pdfPath(inv);
  const name = `${inv.number || inv.id}.pdf`;
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="secondary" className="h-11 sm:h-8" loading={busy === path} onClick={() => void download(path, { fallbackName: name })} aria-label={`${label ?? INVOICE_LABEL[inv.kind] ?? 'Download'} ${inv.number}`}>
        <Download size={14} aria-hidden /> {label ?? INVOICE_LABEL[inv.kind] ?? 'Download'}
      </Button>
      {shareable && (
        <Button size="sm" variant="ghost" className="h-11 w-11 px-0 sm:h-8 sm:w-8" onClick={() => void download(path, { fallbackName: name, share: true })} aria-label={`Share ${inv.number}`}>
          <Share2 size={14} aria-hidden />
        </Button>
      )}
    </span>
  );
}

/**
 * Invoice and credit note downloads for one transaction, inside an appointment or order dialog.
 * Silent while the invoice API is not live (404) or nothing was generated yet: never a toast on open.
 */
export function InvoiceDownloads({ base, transaction, invoices }: { base: string; transaction?: { id: string; status: string } | null; invoices?: InvoiceMeta[] | null }) {
  const fromDetail = Array.isArray(invoices) && invoices.length > 0;
  const paid = isPaid(transaction?.status) || fromDetail;
  const path = transaction ? `${base}/transactions/${transaction.id}/invoices` : null;
  const q = useQuery({
    queryKey: ['get', path],
    queryFn: ({ signal }) => api.get<unknown>(path!, signal).then(invoiceItems).catch(() => [] as InvoiceMeta[]),
    enabled: !!path && paid && !fromDetail,
    retry: false,
    staleTime: 60_000,
  });
  if (!transaction && !fromDetail) return null;
  if (transaction?.status === 'CANCELLED' && !fromDetail) return null;
  const heading = <h3 className="text-xs font-semibold uppercase tracking-wide text-grey-500">Invoice</h3>;
  if (!paid) {
    return (
      <div>
        {heading}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" className="h-11 sm:h-8" disabled title="Available after payment"><FileText size={14} aria-hidden /> Download Invoice</Button>
          <span className="text-xs text-grey-500">Available after payment</span>
        </div>
      </div>
    );
  }
  const items = fromDetail ? invoices! : q.data ?? [];
  if (!fromDetail && q.isPending) return null;
  return (
    <div>
      {heading}
      {items.length === 0 ? <p className="mt-1 text-xs text-grey-500">No invoices yet. The invoice appears here shortly after payment.</p> : (
        <div className="mt-1 flex flex-wrap gap-2">{items.map((inv) => <InvoiceButton key={inv.id} inv={inv} />)}</div>
      )}
    </div>
  );
}

const NOT_YET: Partial<Record<InvoiceKind, string>> = {
  COMMISSION_INVOICE: 'It is issued when the payout batch is approved.',
  SETTLEMENT_STATEMENT: 'It is issued when the payout batch is approved.',
  TAX_INVOICE: 'It is issued shortly after the payment is received.',
  CREDIT_NOTE: 'It is issued when a refund completes.',
};

/**
 * Buttons that look up a list of documents only when clicked (so a table of payouts or
 * transactions makes no extra requests), then download the one of the chosen kind.
 * A click may show a toast: an error, or that the document is not issued yet.
 */
export function LazyInvoiceButtons({ listPath, kinds, variant = 'ghost' }: { listPath: string | null; kinds: InvoiceKind[]; variant?: 'ghost' | 'secondary' }) {
  const toast = useToast();
  const { download } = useDownload();
  const [pending, setPending] = useState<InvoiceKind | null>(null);
  if (!listPath) return null;
  const get = async (kind: InvoiceKind) => {
    setPending(kind);
    try {
      let items: InvoiceMeta[] = [];
      try {
        items = invoiceItems(await api.get<unknown>(listPath));
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) {
          toast.error(e, 'Could not load the documents');
          return;
        }
      }
      const inv = items.find((i) => i.kind === kind);
      if (!inv) {
        toast.toast({ kind: 'info', title: `${INVOICE_KIND_NAME[kind]} Not Available Yet`, description: NOT_YET[kind] });
        return;
      }
      await download(pdfPath(inv), { fallbackName: `${inv.number || inv.id}.pdf` });
    } finally {
      setPending(null);
    }
  };
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {kinds.map((k) => <Button key={k} size="sm" variant={variant} className="h-11 sm:h-8" loading={pending === k} onClick={() => void get(k)}><Download size={14} aria-hidden /> {INVOICE_LABEL[k]}</Button>)}
    </span>
  );
}

/** "Commission Invoice" and "Statement" for one settlement batch. */
export function SettlementDocuments({ base, batchId }: { base: string; batchId: string | null | undefined }) {
  return <LazyInvoiceButtons listPath={batchId ? `${base}/settlements/${batchId}/invoices` : null} kinds={['COMMISSION_INVOICE', 'SETTLEMENT_STATEMENT']} />;
}

/** Finance → Invoices: patient invoices and credit notes for this provider's services, newest first. */
export function ProviderInvoices({ base }: { base: string }) {
  const q = useInfiniteQuery({
    queryKey: ['provider-invoices', base],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      try {
        const r = await api.get<unknown>(`${base}/invoices?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, signal);
        return { items: invoiceItems(r), next: nextCursorOf(r) };
      } catch {
        return { items: [] as InvoiceMeta[], next: null };
      }
    },
    getNextPageParam: (last) => last.next,
    retry: false,
  });
  if (q.isPending) return <Skeleton rows={4} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) return <EmptyState title="No Invoices Yet" description="Tax invoices and credit notes for paid appointments and orders appear here." />;
  return (
    <div>
      <ul className="divide-y divide-grey-100">
        {items.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="min-w-0">
              <span className="flex items-center gap-2"><span className="font-mono text-xs">{inv.number}</span><Badge accent={inv.kind === 'CREDIT_NOTE' ? 'orange' : 'blue'}>{INVOICE_KIND_NAME[inv.kind] ?? inv.kind}</Badge></span>
              <span className="block text-xs text-grey-500">{date(inv.issuedAt)} · <span className="tnum">{money(inv.totalMinor)}</span></span>
            </span>
            <InvoiceButton inv={inv} label="Download" />
          </li>
        ))}
      </ul>
      {q.hasNextPage && <Button size="sm" variant="ghost" className="mt-2 h-11 sm:h-8" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load More</Button>}
    </div>
  );
}
