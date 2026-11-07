'use client';

import { useState } from 'react';
import { ClipboardList, Home, Plus, Search } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useDebounced, useGet } from '@/lib/hooks';
import { money, title } from '@/lib/format';
import { Badge, Button, Card, Checkbox, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, cx } from '@/components/ui/primitives';

interface Offering { id: string; serviceCode: string; serviceName: string; category: string; requiresPrescription: boolean; locationId: string | null; locationName: string | null; priceMinor: number; currency: string; homeServiceAvailable: boolean; turnaroundHours: number | null; isActive: boolean }
interface Service { id: string; code: string; name: string; category: string; requiresPrescription: boolean; sampleType: string | null; fastingRequired: boolean | null; preparationInstructions: string | null; isPanel: boolean }
interface Location { id: string; name: string; isActive: boolean }

const CATEGORY_FOR: Record<string, string[]> = { DIAGNOSTIC_LAB: ['DIAGNOSTIC_TEST', 'IMAGING', 'HOME_CARE'], IMAGING_CENTRE: ['IMAGING', 'DIAGNOSTIC_TEST'], HOSPITAL: ['CONSULTATION', 'PROCEDURE', 'SURGERY', 'DIAGNOSTIC_TEST', 'IMAGING', 'HOME_CARE', 'OTHER'], CLINIC: ['CONSULTATION', 'PROCEDURE', 'DIAGNOSTIC_TEST', 'OTHER'] };

export default function ServicesPage() {
  const org = useOrg();
  const { can } = usePortal();
  const base = `/portal/providers/${org.providerId}`;
  const offerings = useGet<Offering[]>(`${base}/services`);
  const detail = useGet<{ locations: Location[] }>(base);
  const [editing, setEditing] = useState<Offering | null | 'new'>(null);
  const [view, setView] = useState<'active' | 'all'>('active');
  const editable = can('manage_profile');
  const rows = (offerings.data ?? []).filter((o) => view === 'all' || o.isActive);
  const isLab = ['DIAGNOSTIC_LAB', 'IMAGING_CENTRE'].includes(org.type);

  return (
    <div className="space-y-4">
      <PageHeader title="Services & Prices" description={isLab ? 'Tests and scans you perform, with the price patients pay. Patients search by test, so unlisted tests cannot be booked.' : 'Published prices for consultations, procedures and packages. Only verified services are shown to patients.'} actions={editable && <Button onClick={() => setEditing('new')}><Plus size={16} /> Add Service</Button>} />
      <Tabs tabs={[{ key: 'active', label: 'Active' }, { key: 'all', label: 'All' }]} active={view} onChange={(k) => setView(k as typeof view)} />
      <Card padded={false}>
        {offerings.isPending ? <div className="p-5"><Skeleton rows={4} /></div> : offerings.isError ? <div className="p-5"><ErrorState error={offerings.error} retry={() => offerings.refetch()} /></div> : rows.length === 0 ? <div className="p-8 text-center"><ClipboardList size={24} className="mx-auto text-grey-400" aria-hidden /><p className="mt-2 text-sm font-medium">No services listed</p><p className="mt-0.5 text-xs text-grey-500">Add the tests or services you offer with their prices.</p></div> : (
          <ul className="divide-y divide-grey-100">
            {rows.map((o) => (
              <li key={o.id} className={cx('flex flex-wrap items-center gap-3 px-5 py-3', !o.isActive && 'opacity-60')}>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{o.serviceName}</p><p className="text-xs text-grey-500">{title(o.category)}{o.locationName ? ` · ${o.locationName}` : ' · all locations'}{o.turnaroundHours ? ` · report in ${o.turnaroundHours} h` : ''}</p></div>
                <span className="flex flex-wrap items-center gap-1">{o.requiresPrescription && <Badge accent="orange">Rx Needed</Badge>}{o.homeServiceAvailable && <Badge accent="blue"><Home size={10} className="mr-1 inline" aria-hidden />Home</Badge>}{!o.isActive && <Badge>Hidden</Badge>}</span>
                <span className="tnum w-24 text-right text-sm font-semibold">{money(o.priceMinor)}</span>
                {editable && <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>Edit</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <OfferingDialog base={base} orgType={org.type} locations={(detail.data?.locations ?? []).filter((l) => l.isActive)} existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function OfferingDialog({ base, orgType, locations, existing, onClose }: { base: string; orgType: string; locations: Location[]; existing: Offering | null; onClose: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim());
  const cats = CATEGORY_FOR[orgType] ?? ['OTHER'];
  const [category, setCategory] = useState(cats[0]!);
  const results = useGet<Service[]>(!existing && (dq.length >= 2 || category) ? `/portal/catalogue/services?category=${category}${dq ? `&q=${encodeURIComponent(dq)}` : ''}&limit=25` : null);
  const [service, setService] = useState<Service | null>(existing ? { id: '', code: existing.serviceCode, name: existing.serviceName, category: existing.category, requiresPrescription: existing.requiresPrescription, sampleType: null, fastingRequired: null, preparationInstructions: null, isPanel: false } : null);
  const [f, setF] = useState({ locationId: existing?.locationId ?? '', price: existing ? String(existing.priceMinor / 100) : '', homeServiceAvailable: existing?.homeServiceAvailable ?? false, turnaroundHours: existing?.turnaroundHours ? String(existing.turnaroundHours) : '', isActive: existing?.isActive ?? true });
  const priceOk = f.price !== '' && Number(f.price) >= 0;
  const save = useAction(() => api.put(`${base}/services/${service!.code}`, { locationId: f.locationId || null, priceMinor: Math.round(Number(f.price) * 100), homeServiceAvailable: f.homeServiceAvailable, turnaroundHours: f.turnaroundHours ? Number(f.turnaroundHours) : undefined, isActive: f.isActive }), { success: existing ? 'Service updated' : 'Service added', invalidate: [`${base}/services`], onSuccess: onClose });

  return (
    <Dialog open onClose={onClose} title={existing ? `Edit ${existing.serviceName}` : 'Add Service'} description="Prices are shown to patients before they book and are the amount settled to you, before the platform fee." icon={ClipboardList} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!service || !priceOk}>{existing ? 'Save' : 'Add'}</Button></>}>
      <div className="space-y-3">
        {!existing && (
          <Field label="Service" required hint="From the platform catalogue so patients can compare like with like; ask the Carevanta team to add a missing test">
            {service ? <div className="flex items-center justify-between rounded-lg border border-grey-200 px-3 py-2 text-sm"><span>{service.name} <span className="text-grey-500">· {title(service.category)}</span>{service.requiresPrescription && <Badge accent="orange">Rx</Badge>}</span><button type="button" className="text-xs text-grey-500 underline-offset-2 hover:underline" onClick={() => setService(null)}>Change</button></div> : (
              <div className="space-y-2">
                <div className="flex gap-2"><Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">{cats.map((c) => <option key={c} value={c}>{title(c)}</option>)}</Select><div className="relative flex-1"><Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-grey-400" /><Input placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" autoFocus /></div></div>
                <ul className="max-h-56 overflow-y-auto rounded-lg border border-grey-200 text-sm">{results.isPending ? <li className="px-3 py-2 text-grey-500">Loading…</li> : results.data?.length ? results.data.map((s) => <li key={s.id}><button type="button" className="flex w-full items-center justify-between gap-2 border-b border-grey-100 px-3 py-2 text-left last:border-0 hover:bg-grey-50" onClick={() => setService(s)}><span>{s.name}{s.fastingRequired ? <span className="text-xs text-grey-500"> · fasting</span> : null}</span>{s.requiresPrescription && <Badge accent="orange">Rx</Badge>}</button></li>) : <li className="px-3 py-2 text-grey-500">Nothing matches in this category.</li>}</ul>
              </div>
            )}
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price (₹)" required><Input type="number" min={0} step="1" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
          <Field label="Location" hint="Leave as all if the price is the same everywhere"><Select value={f.locationId} onChange={(e) => setF({ ...f, locationId: e.target.value })}><option value="">All Locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          {['DIAGNOSTIC_TEST', 'IMAGING'].includes(service?.category ?? '') && <Field label="Report Turnaround (Hours)"><Input type="number" min={1} max={720} value={f.turnaroundHours} onChange={(e) => setF({ ...f, turnaroundHours: e.target.value })} /></Field>}
          <div className="flex flex-col justify-end gap-2 pb-1">
            {service?.category === 'DIAGNOSTIC_TEST' && <Checkbox label="Available for Home Sample Collection" checked={f.homeServiceAvailable} onChange={(e) => setF({ ...f, homeServiceAvailable: e.target.checked })} />}
            <Checkbox label="Visible to Patients" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          </div>
        </div>
        {f.homeServiceAvailable && <p className="text-xs text-grey-500">Home collection also needs coverage areas under Locations & Hours; patients outside them see centre visit only.</p>}
      </div>
    </Dialog>
  );
}
