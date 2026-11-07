'use client';

import { useState } from 'react';
import { Activity, MapPin, PhoneCall, Siren } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { relative, title } from '@/lib/format';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { RequireCapability } from '@/components/layout/portal-shell';

interface Offer { id: string; requestId: string; reference: string; pickupDistrict: string | null; pickupLatitude: number | null; pickupLongitude: number | null; requiredVehicleType: string | null; offeredAt: string }
interface Vehicle { id: string; registrationNumber: string; vehicleType: string; status: string }
interface Request { id: string; reference: string; status: string; pickupDistrict: string | null; pickupLatitude: number | null; pickupLongitude: number | null; pickupAddress?: string | null; callerPhone?: string | null; assignments?: { id: string; operatorProviderId: string; status: string; vehicleId: string | null }[] }
const INCIDENTS = [{ key: 'VEHICLE_BREAKDOWN', label: 'Vehicle Breakdown' }, { key: 'DELAY', label: 'Serious Delay (Traffic, Wrong Address)' }, { key: 'PATIENT_CONDITION', label: 'Patient Condition Changed' }, { key: 'HANDOVER_DISPUTE', label: 'Problem at Hospital Handover' }, { key: 'SAFETY', label: 'Safety of Crew or Patient' }, { key: 'OTHER', label: 'Something Else' }];

const PROGRESS = [{ status: 'EN_ROUTE', label: 'On the Way' }, { status: 'ARRIVED', label: 'Arrived at Patient' }, { status: 'PATIENT_ONBOARD', label: 'Patient Onboard' }, { status: 'AT_DESTINATION', label: 'At Hospital' }, { status: 'COMPLETED', label: 'Trip Completed' }];

export default function DispatchPage() {
  return <RequireCapability anyOf={['manage_dispatch']}><Inner /></RequireCapability>;
}

function Inner() {
  const org = useOrg();
  const portal = usePortal();
  const toast = useToast();
  const base = `/portal/providers/${org.providerId}`;
  const offers = useGet<Offer[]>(`${base}/dispatch/offers`, { refetchInterval: 10_000 });
  const vehicles = useGet<Vehicle[]>(`${base}/vehicles`);
  const [accepting, setAccepting] = useState<Offer | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [eta, setEta] = useState('15');
  // Active trips come from the server so a crew member who reloads mid-trip, or opens the page on another phone, still sees it.
  const trips = useGet<Request[]>(`${base}/dispatch/active`, { refetchInterval: 15_000 });
  const active = trips.data?.[0] ?? null;
  const [note, setNote] = useState('');
  const [incident, setIncident] = useState(false);
  const [incidentForm, setIncidentForm] = useState({ category: 'DELAY', description: '' });
  const reportIncident = useAction(() => api.post<{ data: { reference: string } }>(`${base}/dispatch/requests/${active!.id}/incident`, incidentForm), { onSuccess: (r) => { toast.success('Incident reported', `Case ${r.data.reference} — the control room will call you`); setIncident(false); setIncidentForm({ category: 'DELAY', description: '' }); } });
  const available = (vehicles.data ?? []).filter((v) => v.status === 'AVAILABLE');
  const inv = [`${base}/dispatch/offers`, `${base}/dispatch/active`, `${base}/vehicles`];
  const accept = useAction(() => api.post<{ data: Request }>(`${base}/dispatch/assignments/${accepting!.id}/accept`, { vehicleId, etaMinutes: Number(eta) }), { invalidate: inv, onSuccess: () => { toast.success('Dispatch accepted — go now', `${accepting!.reference}`); setAccepting(null); } });
  const decline = useAction((o: Offer) => api.post(`${base}/dispatch/assignments/${o.id}/decline`, {}), { concurrent: true, success: 'Offer declined', invalidate: inv });
  const progress = useAction((status: string) => api.post<{ data: Request }>(`${base}/dispatch/requests/${active!.id}/progress`, { status, note: note.trim() || undefined }), { invalidate: inv, onSuccess: (_r, status) => { setNote(''); toast.success(PROGRESS.find((p) => p.status === status)?.label ?? 'Updated'); } });

  return (
    <div className="space-y-4">
      <PageHeader title="Dispatch" description="Emergency requests are offered to operators covering the district. Accept only when a verified vehicle can leave now; patients are told the honest status." />
      <div className="rounded-lg border border-red/30 bg-red-soft p-3 text-sm"><p className="flex items-center gap-2 font-semibold text-red"><Siren size={16} aria-hidden /> {portal.ui.emergencyNumber} always comes first</p><p className="mt-0.5 text-xs text-grey-700">Patients are shown the national emergency number before any platform dispatch. Never promise an arrival you cannot make.</p></div>

      {active && (
        <Card title={`Active Trip · ${active.reference}`} description={active.pickupDistrict ? `Pickup in ${active.pickupDistrict}` : undefined} actions={<Badge accent="blue">{title(active.status)}</Badge>}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {active.pickupLatitude != null && active.pickupLongitude != null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${active.pickupLatitude},${active.pickupLongitude}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1 rounded-lg bg-ink px-3 font-medium text-paper"><MapPin size={14} aria-hidden /> Navigate to Pickup</a>}
            {active.callerPhone && <a href={`tel:${active.callerPhone}`} className="inline-flex h-10 items-center gap-1 rounded-lg border border-grey-300 px-3 font-medium"><PhoneCall size={14} aria-hidden /> Call {active.callerPhone}</a>}
            <Button variant="ghost" className="text-red" onClick={() => setIncident(true)}><Siren size={14} /> Report Incident</Button>
          </div>
          {active.pickupAddress && <p className="mt-2 text-sm text-grey-700">{active.pickupAddress}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-5">{PROGRESS.map((p, i) => { const done = PROGRESS.findIndex((x) => x.status === active.status) >= i; const next = PROGRESS[PROGRESS.findIndex((x) => x.status === active.status) + 1]?.status === p.status || (active.status === 'ACCEPTED' && i === 0); return <Button key={p.status} variant={done ? 'secondary' : next ? 'primary' : 'ghost'} disabled={!next || progress.isPending} onClick={() => progress.mutate(p.status)} className="h-11">{p.label}</Button>; })}</div>
          <Field label="Note" className="mt-3" hint="Optional, e.g. traffic or patient condition on handover"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </Card>
      )}

      <Card title="Open Offers" description="Refreshes every 10 seconds" actions={<span className="flex items-center gap-1 text-xs text-green"><span className="h-2 w-2 animate-pulse rounded-full bg-green" /> Live</span>}>
        {offers.isPending ? <Skeleton rows={2} /> : offers.isError ? <ErrorState error={offers.error} retry={() => offers.refetch()} /> : !offers.data?.length ? <p className="text-sm text-grey-500">No requests right now. {available.length ? `${available.length} vehicle${available.length > 1 ? 's' : ''} available.` : 'No vehicle is marked available, so you will not receive offers.'}</p> : (
          <ul className="space-y-2">
            {offers.data.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-red/30 bg-red-soft p-3">
                <Activity size={18} className="shrink-0 text-red" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{o.reference} · {o.pickupDistrict ?? 'Location pending'}</span><span className="block text-xs text-grey-700">{o.requiredVehicleType ? `${title(o.requiredVehicleType)} needed · ` : ''}offered {relative(o.offeredAt)}</span></span>
                <span className="flex gap-2"><Button onClick={() => { setAccepting(o); setVehicleId(available[0]?.id ?? ''); }} disabled={!available.length} title={available.length ? undefined : 'No available vehicle'}>Accept</Button><Button variant="secondary" onClick={() => decline.mutate(o)} loading={decline.isPending}>Decline</Button></span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {incident && active && (
        <Dialog open onClose={() => setIncident(false)} title="Report an Incident" description={`Trip ${active.reference} · goes straight to the platform control room`} icon={Siren} footer={<><Button variant="ghost" onClick={() => setIncident(false)} disabled={reportIncident.isPending}>Cancel</Button><Button variant="danger" onClick={() => reportIncident.mutate()} loading={reportIncident.isPending} disabled={incidentForm.description.trim().length < 10}>Send Report</Button></>}>
          <div className="space-y-3">
            <p className="rounded-lg border border-red/30 bg-red-soft p-3 text-xs text-grey-700">If anyone is in immediate danger, call {portal.ui.emergencyNumber} first. This report alerts the platform team; it does not replace emergency services.</p>
            <Field label="What Happened" required><Select value={incidentForm.category} onChange={(e) => setIncidentForm({ ...incidentForm, category: e.target.value })}>{INCIDENTS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</Select></Field>
            <Field label="Details" required hint="At least 10 characters; include times and places"><Textarea value={incidentForm.description} onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })} className="min-h-28" autoFocus /></Field>
          </div>
        </Dialog>
      )}
      {accepting && (
        <Dialog open onClose={() => setAccepting(null)} title={`Accept ${accepting.reference}`} description="Choose the vehicle that is leaving now and an honest arrival estimate." icon={PhoneCall} footer={<><Button variant="ghost" onClick={() => setAccepting(null)} disabled={accept.isPending}>Back</Button><Button onClick={() => accept.mutate()} loading={accept.isPending} disabled={!vehicleId || !eta}>Accept & Dispatch</Button></>}>
          <div className="space-y-3">
            <Field label="Vehicle" required><Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{available.map((v) => <option key={v.id} value={v.id}>{v.registrationNumber} · {title(v.vehicleType)}</option>)}</Select></Field>
            <Field label="Estimated Arrival (Minutes)" required><Input type="number" min={1} max={240} value={eta} onChange={(e) => setEta(e.target.value)} /></Field>
          </div>
        </Dialog>
      )}
    </div>
  );
}
