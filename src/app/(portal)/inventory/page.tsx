'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Pill, Plus, Search } from 'lucide-react';
import { useOrg } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useDebounced, useGet } from '@/lib/hooks';
import { date, money, nowMs, title } from '@/lib/format';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, cx } from '@/components/ui/primitives';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Batch { id: string; locationId: string; locationName: string; medicine: { id: string; name: string; strength: string | null; schedule: string; requiresPrescription: boolean }; batchNumber: string; expiryDate: string; quantityOnHand: number; quantityReserved: number; available: number; onShelf?: number; mrpMinor: number; sellingPriceMinor: number; expired: boolean; expiringSoon: boolean }
interface Medicine { id: string; name: string; genericName: string | null; strength: string | null; dosageForm: string | null; packSize: string | null; manufacturer: string | null; schedule: string; requiresPrescription: boolean }
interface Location { id: string; name: string; isActive: boolean }

export default function InventoryPage() {
  return <RequireCapability anyOf={['manage_inventory']}><Inner /></RequireCapability>;
}

function Inner() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const [view, setView] = useState<'all' | 'low' | 'expiring' | 'expired'>('all');
  const stock = useGet<Batch[]>(`${base}/inventory${dq ? `?q=${encodeURIComponent(dq)}` : ''}`);
  const detail = useGet<{ locations: Location[] }>(base);
  const [adding, setAdding] = useState<Batch | null | 'new'>(null);
  const rows = useMemo(() => (stock.data ?? []).filter((b) => (view === 'all' ? true : view === 'low' ? b.available <= 10 && !b.expired && !b.expiringSoon : view === 'expiring' ? b.expiringSoon : b.expired)), [stock.data, view]);
  const counts = useMemo(() => ({ low: (stock.data ?? []).filter((b) => b.available <= 10 && !b.expired && !b.expiringSoon).length, expiring: (stock.data ?? []).filter((b) => b.expiringSoon).length, expired: (stock.data ?? []).filter((b) => b.expired).length }), [stock.data]);
  const locations = (detail.data?.locations ?? []).filter((l) => l.isActive);

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" description="Batches are dispensed first-expiry-first-out. Batches within 30 days of expiry are never sold through the platform; reserved quantities belong to open orders." actions={<Button onClick={() => setAdding('new')} disabled={!locations.length}><Plus size={16} /> Add Batch</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input aria-label="Search medicine" placeholder="Medicine Name" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 pl-9" /></div>
        <Tabs tabs={[{ key: 'all', label: 'All' }, { key: 'low', label: 'Low Stock', count: counts.low || undefined }, { key: 'expiring', label: 'Expiring Soon', count: counts.expiring || undefined }, { key: 'expired', label: 'Expired', count: counts.expired || undefined }]} active={view} onChange={(k) => setView(k as typeof view)} />
      </div>
      <Card padded={false}>
        {stock.isPending ? <div className="p-5"><Skeleton rows={5} /></div> : stock.isError ? <div className="p-5"><ErrorState error={stock.error} retry={() => stock.refetch()} /></div> : rows.length === 0 ? <div className="p-8 text-center"><Pill size={24} className="mx-auto text-grey-400" aria-hidden /><p className="mt-2 text-sm font-medium">{stock.data?.length ? 'No batches match' : 'No stock yet'}</p><p className="mt-0.5 text-xs text-grey-500">{stock.data?.length ? 'Try another filter.' : 'Add your first batch; patients only see medicines you have in stock.'}</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-grey-50 text-left text-xs uppercase tracking-wide text-grey-600"><tr><th className="px-4 py-2">Medicine</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Expiry</th><th className="px-3 py-2 text-right">On Hand</th><th className="px-3 py-2 text-right">Reserved</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2 text-right">MRP</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className={cx('border-t border-grey-100', b.expired && 'bg-red-soft/40')}>
                    <td className="px-4 py-2"><p className="font-medium">{b.medicine.name}{b.medicine.strength ? ` ${b.medicine.strength}` : ''}</p><p className="text-xs text-grey-500">{b.locationName}{b.medicine.requiresPrescription ? ' · Rx only' : ''}</p></td>
                    <td className="px-3 py-2 font-mono text-xs">{b.batchNumber}</td>
                    <td className="px-3 py-2 text-xs"><span className={cx(b.expired ? 'font-medium text-red' : b.expiringSoon ? 'font-medium text-orange' : '')}>{date(b.expiryDate)}</span>{b.expired && <Badge accent="red">Expired</Badge>}{!b.expired && b.expiringSoon && <Badge accent="orange">Soon</Badge>}</td>
                    <td className="tnum px-3 py-2 text-right">{b.quantityOnHand}</td>
                    <td className="tnum px-3 py-2 text-right text-grey-600">{b.quantityReserved}</td>
                    <td className={cx('tnum px-3 py-2 text-right font-semibold', b.available <= 10 && 'text-orange')}>{b.available}{(b.expired || b.expiringSoon) && <span className="block whitespace-nowrap text-[11px] font-normal text-grey-500">On Shelf (Not Sellable): {b.onShelf ?? Math.max(0, b.quantityOnHand - b.quantityReserved)}</span>}</td>
                    <td className="tnum px-3 py-2 text-right">{money(b.mrpMinor)}</td>
                    <td className="tnum px-3 py-2 text-right">{money(b.sellingPriceMinor)}</td>
                    <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setAdding(b)}>Adjust</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <BatchDialog base={base} locations={locations} existing={adding === 'new' ? null : adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

function BatchDialog({ base, locations, existing, onClose }: { base: string; locations: Location[]; existing: Batch | null; onClose: () => void }) {
  const [mq, setMq] = useState('');
  const dmq = useDebounced(mq.trim());
  const meds = useGet<Medicine[]>(!existing && dmq.length >= 2 ? `/portal/catalogue/medicines?q=${encodeURIComponent(dmq)}&limit=10` : null);
  const [medicine, setMedicine] = useState<Medicine | null>(existing ? { id: existing.medicine.id, name: existing.medicine.name, genericName: null, strength: existing.medicine.strength, dosageForm: null, packSize: null, manufacturer: null, schedule: existing.medicine.schedule, requiresPrescription: existing.medicine.requiresPrescription } : null);
  const [f, setF] = useState({ locationId: existing?.locationId ?? locations[0]?.id ?? '', batchNumber: existing?.batchNumber ?? '', expiryDate: existing?.expiryDate ?? '', quantityOnHand: existing ? String(existing.quantityOnHand) : '', mrp: existing ? String(existing.mrpMinor / 100) : '', price: existing ? String(existing.sellingPriceMinor / 100) : '' });
  const problems: Record<string, string> = {};
  if (!medicine) problems.medicine = 'Pick a medicine';
  if (!f.batchNumber.trim()) problems.batchNumber = 'Required';
  if (!f.expiryDate) problems.expiryDate = 'Required'; else if (new Date(f.expiryDate) <= new Date()) problems.expiryDate = 'Already expired';
  else if (new Date(f.expiryDate).getTime() - nowMs() < 30 * 86_400_000) problems.expiryDate = 'Expires within 30 days — it cannot be sold through the platform';
  if (f.quantityOnHand === '' || Number(f.quantityOnHand) < 0) problems.quantityOnHand = 'Enter a quantity';
  if (existing && Number(f.quantityOnHand) < existing.quantityReserved) problems.quantityOnHand = `${existing.quantityReserved} are reserved for open orders`;
  if (!f.mrp || Number(f.mrp) <= 0) problems.mrp = 'Required';
  if (!f.price || Number(f.price) <= 0) problems.price = 'Required'; else if (Number(f.price) > Number(f.mrp)) problems.price = 'Cannot exceed MRP';
  const valid = Object.keys(problems).length === 0;
  const save = useAction(() => api.put(`${base}/inventory`, { locationId: f.locationId, medicineId: medicine!.id, batchNumber: f.batchNumber.trim(), expiryDate: f.expiryDate, quantityOnHand: Number(f.quantityOnHand), mrpMinor: Math.round(Number(f.mrp) * 100), sellingPriceMinor: Math.round(Number(f.price) * 100) }), { success: existing ? 'Batch updated' : 'Batch added', invalidate: [`${base}/inventory`], onSuccess: onClose });

  return (
    <Dialog open onClose={onClose} title={existing ? 'Adjust Batch' : 'Add Batch'} description={existing ? `${existing.medicine.name} · batch ${existing.batchNumber}` : 'Enter the batch exactly as printed on the strip or box.'} icon={Pill} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>{existing ? 'Save' : 'Add Batch'}</Button></>}>
      <div className="space-y-3">
        {!existing && (
          <Field label="Medicine" required error={mq && !medicine ? problems.medicine : undefined} hint="From the platform catalogue; ask the Carevanta team to add a missing brand">
            {medicine ? <div className="flex items-center justify-between rounded-lg border border-grey-200 px-3 py-2 text-sm"><span>{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ''}{medicine.manufacturer ? <span className="text-grey-500"> · {medicine.manufacturer}</span> : null} {medicine.requiresPrescription && <Badge accent="orange">Rx</Badge>}</span><button type="button" className="text-xs text-grey-500 underline-offset-2 hover:underline" onClick={() => setMedicine(null)}>Change</button></div> : (
              <div className="relative">
                <Input placeholder="Type at least 2 letters…" value={mq} onChange={(e) => setMq(e.target.value)} autoFocus />
                {dmq.length >= 2 && <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-grey-200 bg-paper py-1 text-sm shadow-[var(--shadow-float)]">{meds.isPending ? <li className="px-3 py-2 text-grey-500">Searching…</li> : meds.data?.length ? meds.data.map((m) => <li key={m.id}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-grey-50" onClick={() => { setMedicine(m); setMq(''); }}><span>{m.name}{m.strength ? ` ${m.strength}` : ''}{m.dosageForm ? ` · ${title(m.dosageForm)}` : ''}</span><span className="shrink-0 text-xs text-grey-500">{m.schedule.replace('SCHEDULE_', 'Sch ')}</span></button></li>) : <li className="px-3 py-2 text-grey-500">No medicines match</li>}</ul>}
              </div>
            )}
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Store" required><Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })} disabled={!!existing}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Batch Number" required error={f.batchNumber ? problems.batchNumber : undefined}><Input value={f.batchNumber} onChange={(e) => setF({ ...f, batchNumber: e.target.value })} disabled={!!existing} className="font-mono" /></Field>
          <Field label="Expiry Date" required error={f.expiryDate ? problems.expiryDate : undefined}><Input type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
          <Field label="Quantity on Hand" required error={f.quantityOnHand ? problems.quantityOnHand : undefined} hint={existing ? `${existing.quantityReserved} reserved for open orders` : 'Units (tablets, bottles, strips as you sell them)'}><Input type="number" min={0} value={f.quantityOnHand} onChange={(e) => setF({ ...f, quantityOnHand: e.target.value })} /></Field>
          <Field label="MRP (₹ per Unit)" required error={f.mrp ? problems.mrp : undefined}><Input type="number" min={0} step="0.01" value={f.mrp} onChange={(e) => setF({ ...f, mrp: e.target.value })} /></Field>
          <Field label="Selling Price (₹ per Unit)" required error={f.price ? problems.price : undefined} hint="Must not exceed MRP"><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-grey-500"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-orange" aria-hidden /> Selling above MRP is an offence under the Drugs (Prices Control) Order; the platform refuses it.</p>
      </div>
    </Dialog>
  );
}
