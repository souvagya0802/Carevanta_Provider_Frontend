'use client';

import { useState } from 'react';
import { Clock, MapPin, Plus, Power, Star } from 'lucide-react';
import { useOrg, usePortal, useTypeWords } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, ErrorState, Field, Input, PageHeader, Skeleton, cx } from '@/components/ui/primitives';
import { PracticeLocations, newLocation, toLocationPayload, validateLocation, type LocationDraft, type LocationErrors, type Region } from '@/components/forms/practice-locations';

interface Location { id: string; name: string; addressLine1: string; locality: string | null; city: string; district: string; state: string; pincode: string; latitude: number | null; longitude: number | null; phone: string | null; isPrimary: boolean; isActive: boolean; operatingHours: { dayOfWeek: number; opensAtMin: number; closesAtMin: number; isClosed: boolean }[] }
interface Detail { version: number; locations: Location[]; serviceAreas?: unknown }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

export default function LocationsPage() {
  const org = useOrg();
  const { can } = usePortal();
  const words = useTypeWords(org.type);
  const base = `/portal/providers/${org.providerId}`;
  const detail = useGet<Detail>(base);
  const regions = useGet<Region[]>('/portal/catalogue/regions');
  const [adding, setAdding] = useState(false);
  const [hoursFor, setHoursFor] = useState<Location | null>(null);
  const [toggle, setToggle] = useState<Location | null>(null);
  const editable = can('manage_profile');
  const inv = [base];

  const deactivate = useAction((l: Location) => api.patch(`${base}/locations/${l.id}`, { isActive: !l.isActive }), { success: 'Location updated', invalidate: inv, onSuccess: () => setToggle(null) });
  const makePrimary = useAction((l: Location) => api.patch(`${base}/locations/${l.id}`, { isPrimary: true }), { success: 'Primary location changed', invalidate: inv });

  if (detail.isPending) return <Skeleton rows={6} />;
  if (detail.isError) return <ErrorState error={detail.error} retry={() => detail.refetch()} />;
  const locations = detail.data.locations;
  const active = locations.filter((l) => l.isActive);

  return (
    <div className="space-y-4">
      <PageHeader title={words.locationsTitle} description={`Every ${words.locationNoun} patients can visit or that serves them. Each needs a map pin for distance search and opening hours for availability.`} actions={editable && <Button onClick={() => setAdding(true)}><Plus size={16} /> Add {words.locationNoun.replace(/\b\w/g, (c) => c.toUpperCase())}</Button>} />
      {active.length === 0 && <p className="rounded-lg border border-orange/30 bg-orange-soft p-3 text-sm text-grey-700">No active {words.locationNoun}. One is required before verification and before patients can find you.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {locations.map((l) => {
          const open = l.operatingHours.filter((h) => !h.isClosed);
          return (
            <Card key={l.id} className={cx(!l.isActive && 'opacity-60')} title={l.name} description={`${l.addressLine1}, ${l.locality ? `${l.locality}, ` : ''}${l.city}, ${l.district} ${l.pincode}`} actions={<span className="flex gap-1">{l.isPrimary && <Badge accent="ink">Primary</Badge>}{!l.isActive && <Badge accent="red">Inactive</Badge>}{!l.latitude && <Badge accent="orange">No Map Pin</Badge>}</span>}>
              <div className="flex items-start gap-2 text-sm">
                <Clock size={14} className="mt-0.5 shrink-0 text-grey-400" aria-hidden />
                <div className="min-w-0 flex-1 text-xs text-grey-700">
                  {open.length === 0 ? <p className="text-orange">Opening hours not set — patients see no availability.</p> : (
                    <ul className="grid grid-cols-2 gap-x-3">{[1, 2, 3, 4, 5, 6, 0].map((d) => { const h = open.filter((x) => x.dayOfWeek === d); return <li key={d} className="flex justify-between gap-2"><span className="text-grey-500">{DAYS[d]}</span><span className="tnum">{h.length ? h.map((x) => `${toTime(x.opensAtMin)}–${toTime(x.closesAtMin)}`).join(', ') : 'Closed'}</span></li>; })}</ul>
                  )}
                </div>
              </div>
              {l.phone && <p className="mt-2 text-xs text-grey-500">Phone {l.phone}</p>}
              {editable && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-grey-100 pt-3">
                  <Button size="sm" variant="secondary" onClick={() => setHoursFor(l)}><Clock size={14} /> Opening Hours</Button>
                  {!l.isPrimary && l.isActive && <Button size="sm" variant="ghost" onClick={() => makePrimary.mutate(l)} loading={makePrimary.isPending}><Star size={14} /> Make Primary</Button>}
                  <Button size="sm" variant="ghost" className={l.isActive ? 'text-red' : ''} onClick={() => setToggle(l)} disabled={l.isPrimary && l.isActive}><Power size={14} /> {l.isActive ? 'Deactivate' : 'Reactivate'}</Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {COVERAGE[org.type] && <CoverageCard base={base} purpose={COVERAGE[org.type]!.purpose} title={COVERAGE[org.type]!.title} hint={COVERAGE[org.type]!.hint} regions={regions.data ?? []} editable={editable} />}
      {adding && <AddLocationDialog base={base} noun={words.locationNoun} regions={regions.data} regionsLoading={regions.isPending} isFirst={locations.length === 0} onClose={() => setAdding(false)} />}
      {hoursFor && <HoursDialog base={base} location={hoursFor} onClose={() => setHoursFor(null)} />}
      <ConfirmDialog open={!!toggle} onClose={() => setToggle(null)} onConfirm={() => toggle && deactivate.mutate(toggle)} title={toggle?.isActive ? `Deactivate ${toggle.name}?` : `Reactivate ${toggle?.name}?`} message={toggle?.isActive ? 'Patients will no longer see or book this location. Existing bookings are not cancelled automatically.' : 'The location becomes bookable again once your organisation is approved.'} confirmLabel={toggle?.isActive ? 'Deactivate' : 'Reactivate'} loading={deactivate.isPending} danger={!!toggle?.isActive} />
    </div>
  );
}

function AddLocationDialog({ base, noun, regions, regionsLoading, isFirst, onClose }: { base: string; noun: string; regions: Region[] | undefined; regionsLoading: boolean; isFirst: boolean; onClose: () => void }) {
  const [drafts, setDrafts] = useState<LocationDraft[]>([newLocation(isFirst)]);
  const [errors, setErrors] = useState<Record<string, LocationErrors>>({});
  const save = useAction(async () => {
    for (const d of drafts) await api.post(`${base}/locations`, toLocationPayload(d));
  }, { success: drafts.length > 1 ? `${drafts.length} locations added` : 'Location added', invalidate: [base, '/portal/me'], onSuccess: onClose });
  const submit = () => {
    const errs: Record<string, LocationErrors> = {};
    for (const d of drafts) { const e = validateLocation(d); if (Object.keys(e).length) errs[d.key] = e; }
    setErrors(errs);
    if (!Object.keys(errs).length && drafts.length) save.mutate();
  };
  return (
    <Dialog open onClose={onClose} size="full" icon={MapPin} title={`Add ${noun.replace(/\b\w/g, (c) => c.toUpperCase())}`} description="Pick the spot on the map; the address fills in. You can add several at once." footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={submit} loading={save.isPending} disabled={!drafts.length}>Save</Button></>}>
      <PracticeLocations value={drafts} onChange={(next) => { setDrafts(next); if (Object.keys(errors).length) setErrors({}); }} regions={regions} regionsLoading={regionsLoading} errors={errors} noun={noun} />
    </Dialog>
  );
}

/** Weekly hours editor: one row per day, closed toggle, validated before save. */
function HoursDialog({ base, location, onClose }: { base: string; location: Location; onClose: () => void }) {
  const initial = [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const h = location.operatingHours.find((x) => x.dayOfWeek === d && !x.isClosed);
    return { day: d, open: !!h, from: h ? toTime(h.opensAtMin) : '09:00', to: h ? toTime(h.closesAtMin) : '18:00' };
  });
  const [rows, setRows] = useState(initial);
  const problems = rows.filter((r) => r.open && toMin(r.to) <= toMin(r.from)).map((r) => DAYS[r.day]);
  const save = useAction(() => api.put(`${base}/locations/${location.id}/hours`, { hours: rows.filter((r) => r.open).map((r) => ({ dayOfWeek: r.day, opensAtMin: toMin(r.from), closesAtMin: toMin(r.to) })) }), { success: 'Opening hours saved', invalidate: [base], onSuccess: onClose });
  const copyMonday = () => { const mon = rows.find((r) => r.day === 1)!; setRows(rows.map((r) => (r.day >= 2 && r.day <= 6 ? { ...r, open: mon.open, from: mon.from, to: mon.to } : r))); };
  return (
    <Dialog open onClose={onClose} title="Opening Hours" description={location.name} icon={Clock} footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={problems.length > 0}>Save Hours</Button></>}>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const r = rows.find((x) => x.day === d)!;
          return (
            <div key={d} className="grid grid-cols-[72px_1fr_1fr] items-center gap-2 sm:grid-cols-[90px_1fr_1fr]">
              <Checkbox label={DAYS[d]!} checked={r.open} onChange={(e) => setRows(rows.map((x) => (x.day === d ? { ...x, open: e.target.checked } : x)))} />
              <Field label={d === 1 ? 'Opens' : ''}><Input type="time" value={r.from} disabled={!r.open} onChange={(e) => setRows(rows.map((x) => (x.day === d ? { ...x, from: e.target.value } : x)))} /></Field>
              <Field label={d === 1 ? 'Closes' : ''}><Input type="time" value={r.to} disabled={!r.open} onChange={(e) => setRows(rows.map((x) => (x.day === d ? { ...x, to: e.target.value } : x)))} /></Field>
            </div>
          );
        })}
        <div className="flex items-center justify-between pt-1">
          <Button size="sm" variant="ghost" onClick={copyMonday}>Copy Monday to Tue–Sat</Button>
          {problems.length > 0 && <p className="text-xs text-red">Closing must be after opening: {problems.join(', ')}</p>}
        </div>
        <p className="text-xs text-grey-500">Times are Indian Standard Time. Leave a day unticked for closed. Doctors&apos; consultation slots are set separately under Schedules.</p>
      </div>
    </Dialog>
  );
}

/* ─── Coverage areas (home collection, delivery, ambulance) ──────────────── */
const COVERAGE: Record<string, { purpose: 'HOME_COLLECTION' | 'DELIVERY' | 'AMBULANCE'; title: string; hint: string }> = {
  DIAGNOSTIC_LAB: { purpose: 'HOME_COLLECTION', title: 'Home Collection Coverage', hint: 'Districts and PIN codes where your phlebotomist can collect samples at home. Patients outside them see centre visit only.' },
  IMAGING_CENTRE: { purpose: 'HOME_COLLECTION', title: 'Home Service Coverage', hint: 'Districts and PIN codes where you offer portable services at home, if any.' },
  PHARMACY: { purpose: 'DELIVERY', title: 'Delivery Coverage', hint: 'Districts and PIN codes you deliver to. Orders outside them are pickup only.' },
  AMBULANCE_OPERATOR: { purpose: 'AMBULANCE', title: 'Service Area', hint: 'Districts you respond in. Emergency requests are offered only to operators covering the district.' },
};
interface Area { purpose: string; district: string; pincode: string | null }

function CoverageCard({ base, purpose, title, hint, regions, editable }: { base: string; purpose: Area['purpose']; title: string; hint: string; regions: Region[]; editable: boolean }) {
  const areas = useGet<Area[]>(`${base}/service-areas`);
  const [editing, setEditing] = useState(false);
  const mine = (areas.data ?? []).filter((a) => a.purpose === purpose);
  const byDistrict = new Map<string, string[]>();
  for (const a of mine) byDistrict.set(a.district, [...(byDistrict.get(a.district) ?? []), ...(a.pincode ? [a.pincode] : [])]);
  return (
    <Card title={title} description={hint} actions={editable && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><MapPin size={14} /> Edit Coverage</Button>}>
      {areas.isPending ? <Skeleton rows={2} /> : areas.isError ? <ErrorState error={areas.error} retry={() => areas.refetch()} /> : mine.length === 0 ? (
        <p className="text-sm text-orange">No coverage set — {purpose === 'AMBULANCE' ? 'you will not receive emergency requests' : purpose === 'DELIVERY' ? 'patients can only pick up' : 'patients can only visit the centre'}.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {[...byDistrict.entries()].map(([district, pins]) => <li key={district} className="rounded-lg border border-grey-200 px-3 py-1.5 text-sm"><span className="font-medium">{district}</span>{pins.length ? <span className="text-grey-500"> · PIN {pins.join(', ')}</span> : <span className="text-grey-500"> · whole district</span>}</li>)}
        </ul>
      )}
      {editing && <CoverageDialog base={base} purpose={purpose} initial={mine} regions={regions} onClose={() => setEditing(false)} />}
    </Card>
  );
}

function CoverageDialog({ base, purpose, initial, regions, onClose }: { base: string; purpose: Area['purpose']; initial: Area[]; regions: Region[]; onClose: () => void }) {
  const [rows, setRows] = useState<{ district: string; pincode: string }[]>(initial.length ? initial.map((a) => ({ district: a.district, pincode: a.pincode ?? '' })) : [{ district: regions[0]?.district ?? '', pincode: '' }]);
  const districts = [...new Set(regions.map((r) => r.district))].sort();
  const problems = rows.map((r) => (!r.district.trim() ? 'District is required' : r.pincode && !/^[1-9][0-9]{5}$/.test(r.pincode) ? 'PIN code must be 6 digits' : null));
  const valid = problems.every((p) => !p) && rows.length <= 200;
  const save = useAction(() => api.put(`${base}/service-areas`, { areas: rows.map((r) => ({ purpose, district: r.district.trim(), ...(r.pincode ? { pincode: r.pincode } : {}) })).filter((r) => r.district) }), { success: 'Coverage saved', invalidate: [`${base}/service-areas`], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Coverage Areas" description="One row per district, or per PIN code inside a district for finer control. Leave PIN blank to cover the whole district." icon={MapPin} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>Save Coverage</Button></>}>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-2">
            <Field label={i === 0 ? 'District' : ''} error={problems[i] === 'District is required' ? problems[i]! : undefined}>
              <Input list="coverage-districts" value={r.district} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, district: e.target.value } : x)))} placeholder="District" />
            </Field>
            <Field label={i === 0 ? 'PIN (Optional)' : ''} error={problems[i] === 'PIN code must be 6 digits' ? problems[i]! : undefined}>
              <Input inputMode="numeric" maxLength={6} value={r.pincode} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pincode: e.target.value.replace(/\D/g, '') } : x)))} placeholder="721636" className="font-mono" />
            </Field>
            <Button variant="ghost" size="sm" aria-label="Remove row" className="mb-1 text-red" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>Remove</Button>
          </div>
        ))}
        <datalist id="coverage-districts">{districts.map((d) => <option key={d} value={d} />)}</datalist>
        <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { district: rows[rows.length - 1]?.district ?? '', pincode: '' }])}><Plus size={14} /> Add Row</Button>
        <p className="text-xs text-grey-500">Districts come from the platform&apos;s launch regions; you can also type a district that is not launched yet.</p>
      </div>
    </Dialog>
  );
}
