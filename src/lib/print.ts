/**
 * Printable documents (invoice, receipt) rendered in a fresh window so the
 * portal's own styles never leak in and the print dialog shows only the paper.
 * Everything is plain HTML with inline CSS; no external assets are needed.
 */
import { money } from './format';

export interface PrintLine { label: string; detail?: string; qty?: number; amountMinor: number }
export interface PrintDoc {
  kind: 'Invoice' | 'Receipt';
  organisation: { name: string; address?: string; phone?: string; licence?: string; gstin?: string };
  reference: string;
  issuedAt: string;
  billTo: { name: string; phone?: string };
  lines: PrintLine[];
  totalMinor: number;
  paymentStatus: string;
  notes?: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Open the print window. Call this straight from the click handler (pop-up
 * blockers allow windows only there), then pass it to printDocument once any
 * data has loaded. No 'noopener': with it window.open returns null and nothing
 * could be written. The link back to the portal is cut right away instead.
 */
export function openPrintWindow(): Window {
  const w = window.open('about:blank', '_blank', 'width=800,height=900');
  if (!w) throw new Error('Allow pop-ups for this site to print');
  try {
    w.opener = null;
  } catch {
    /* some browsers make opener read-only; the document has no scripts that use it */
  }
  w.document.write('<!doctype html><title>Preparing…</title><p style="font:14px sans-serif;margin:32px">Preparing the document…</p>');
  return w;
}

export function printDocument(doc: PrintDoc, target?: Window) {
  const w = target ?? openPrintWindow();
  w.document.open();
  const rows = doc.lines.map((l) => `<tr><td>${esc(l.label)}${l.detail ? `<div class="muted">${esc(l.detail)}</div>` : ''}</td><td class="num">${l.qty ?? ''}</td><td class="num">${esc(money(l.amountMinor))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.kind)} ${esc(doc.reference)}</title>
<style>
  body { font: 13px/1.45 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 32px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 24px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .muted { color: #666; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .total td { border-top: 2px solid #111; border-bottom: 0; font-weight: 700; font-size: 15px; }
  .badge { display: inline-block; border: 1px solid #111; border-radius: 5px; padding: 2px 8px; font-size: 11px; text-transform: uppercase; }
  .foot { margin-top: 28px; font-size: 11px; color: #666; }
  @media print { body { margin: 12mm; } .noprint { display: none; } }
</style></head><body>
<div class="head">
  <div><h1>${esc(doc.organisation.name)}</h1>${doc.organisation.address ? `<div class="muted">${esc(doc.organisation.address)}</div>` : ''}${doc.organisation.phone ? `<div class="muted">Phone ${esc(doc.organisation.phone)}</div>` : ''}${doc.organisation.licence ? `<div class="muted">Licence ${esc(doc.organisation.licence)}</div>` : ''}${doc.organisation.gstin ? `<div class="muted">GSTIN ${esc(doc.organisation.gstin)}</div>` : ''}</div>
  <div style="text-align:right"><div class="badge">${esc(doc.kind)}</div><div style="margin-top:6px;font-weight:600">${esc(doc.reference)}</div><div class="muted">${esc(doc.issuedAt)}</div></div>
</div>
<h2>Bill To</h2><div>${esc(doc.billTo.name)}${doc.billTo.phone ? ` · ${esc(doc.billTo.phone)}` : ''}</div>
<h2>Items</h2>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead><tbody>${rows}<tr class="total"><td>Total</td><td></td><td class="num">${esc(money(doc.totalMinor))}</td></tr></tbody></table>
<p style="margin-top:12px">Payment: <strong>${esc(doc.paymentStatus)}</strong></p>
${doc.notes?.length ? `<div class="foot">${doc.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
<p class="noprint" style="margin-top:24px"><button onclick="window.print()">Print</button></p>
<script>setTimeout(function(){ window.print(); }, 250);</script>
</body></html>`);
  w.document.close();
}
