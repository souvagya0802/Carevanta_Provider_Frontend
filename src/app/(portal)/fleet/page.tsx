'use client';

import { useState } from 'react';
import { Ambulance, Plus, Power, PowerOff, UserRound } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, title } from '@/lib/format';
import { Badge, Button, Card, Checkbox, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

interface Vehicle { id: string; registrationNumber: string; vehicleType: string; status: string; equipment: string[]; insuranceValidUntil: string | null; fitnessValidUntil: string | null; documentsExpired: boolean; verifiedAt: string | null }
interface Crew { id: string; fullName: string; role: string; licenseNumber: string | null; licenseValidUntil: string | null; licenseExpired: boolean; isActive: boolean }
interface Location { id: string; name: string; isActive: boolean }

const VEHICLE_TYPES: Record<string, string> = { BLS: 'Basic Life Support', ALS: 'Advanced Life Support', PATIENT_TRANSPORT: 'Patient Transport', NEONATAL: 'Neonatal', MORTUARY: 'Mortuary' };
const EQUIPMENT = ['OXYGEN', 'STRETCHER', 'WHEELCHAIR', 'FIRST_AID', 'SUCTION', 'CARDIAC_MONITOR', 'DEFIBRILLATOR', 'VENTILATOR', 'INFUSION_PUMP', 'INCUBATOR'];
const STATUS_HELP: Record<string, string> = { PENDING_VERIFICATION: 'Awaiting platform verification of RC, insurance and fitness.', AVAILABLE: 'Can be offered dispatches.', ON_TRIP: 'Currently on a dispatch.', OUT_OF_SERVICE: 'Taken off the road by you or the platform.', SUSPENDED: 'Suspended by the platform.' };

export default function FleetPage() {
  const org = useOrg();
  const { can } = usePortal();
  const base = `/portal/providers/${org.providerId}`;
  const vehicles = useGet<Vehicle[]>(`${base}/vehicles`);
  const crew = useGet<Crew[]>(`${base}/crew`);
  const detail = useGet<{ locations: Location[] }>(base);
  const [addVehicle, setAddVehicle] = useState(false);
  const [addCrew, setAddCrew] = useState(false);
  const editable = can('manage_profile');
  const toast = useToast();
  const setStatus = useAction(({ v, status }: { v: Vehicle; status: 'AVAILABLE' | 'OUT_OF_SERVICE' }) => api.post(`${base}/vehicles/${v.id}/status`, { status }), { concurrent: true, invalidate: [`${base}/vehicles`, `${base}/dispatch`], onSuccess: (_r, { status }) => toast.success(status === 'AVAILABLE' ? 'Vehicle back in service — it can receive offers' : 'Vehicle taken off the road') });

  return (
    <div className="space-y-4">
      <PageHeader title="Vehicles & Crew" description="Every ambulance is verified by the platform before it can be dispatched. Mark a vehicle off the road when it is in the workshop or without a crew; only vehicles in service receive offers. Keep insurance, fitness and driver licences current." />
      <Card title="Vehicles" actions={editable && <Button size="sm" onClick={() => setAddVehicle(true)}><Plus size={14} /> Add Vehicle</Button>}>
        {vehicles.isPending ? <Skeleton rows={3} /> : vehicles.isError ? <ErrorState error={vehicles.error} retry={() => vehicles.refetch()} /> : !vehicles.data?.length ? <p className="text-sm text-grey-500">No vehicles yet. Add each ambulance with its registration number and insurance expiry.</p> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {vehicles.data.map((v) => (
              <li key={v.id} className="rounded-lg border border-grey-200 p-3">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-base font-semibold">{v.registrationNumber}</span><Badge accent={v.status === 'AVAILABLE' ? 'green' : v.status === 'ON_TRIP' ? 'blue' : v.status === 'PENDING_VERIFICATION' ? 'orange' : 'red'}>{title(v.status)}</Badge></div>
                <p className="mt-1 text-sm">{VEHICLE_TYPES[v.vehicleType] ?? title(v.vehicleType)}{v.equipment.length ? ` · ${v.equipment.map(title).join(', ')}` : ''}</p>
                <p className="mt-1 text-xs text-grey-500">Insurance to {date(v.insuranceValidUntil)}{v.fitnessValidUntil ? ` · fitness to ${date(v.fitnessValidUntil)}` : ''}{v.documentsExpired && <span className="ml-1 font-medium text-red">· documents expired</span>}</p>
                <p className="mt-1 text-xs text-grey-500">{STATUS_HELP[v.status]}</p>
                {can('manage_dispatch') && v.verifiedAt && (v.status === 'AVAILABLE' || v.status === 'OUT_OF_SERVICE') && (
                  <div className="mt-2 flex gap-2 border-t border-grey-100 pt-2">
                    {v.status === 'AVAILABLE'
                      ? <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ v, status: 'OUT_OF_SERVICE' })} loading={setStatus.isPending && setStatus.variables?.v.id === v.id}><PowerOff size={14} /> Take Off Road</Button>
                      : <Button size="sm" onClick={() => setStatus.mutate({ v, status: 'AVAILABLE' })} loading={setStatus.isPending && setStatus.variables?.v.id === v.id} disabled={v.documentsExpired} title={v.documentsExpired ? 'Renew insurance / fitness first' : undefined}><Power size={14} /> Put Back in Service</Button>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Crew" actions={editable && <Button size="sm" onClick={() => setAddCrew(true)}><Plus size={14} /> Add Crew Member</Button>}>
        {crew.isPending ? <Skeleton rows={3} /> : crew.isError ? <ErrorState error={crew.error} retry={() => crew.refetch()} /> : !crew.data?.length ? <p className="text-sm text-grey-500">No crew yet. Drivers need a valid driving licence; add EMTs, paramedics and nurses as applicable.</p> : (
          <ul className="divide-y divide-grey-100">
            {crew.data.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <UserRound size={16} className="shrink-0 text-grey-400" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.fullName}</span><span className="block text-xs text-grey-500">{title(c.role)}{c.licenseNumber ? ` · licence ${c.licenseNumber}` : ''}{c.licenseValidUntil ? ` to ${date(c.licenseValidUntil)}` : ''}</span></span>
                {c.licenseExpired && <Badge accent="red">Licence Expired</Badge>}
                {!c.isActive && <Badge>Inactive</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {addVehicle && <VehicleDialog base={base} locations={(detail.data?.locations ?? []).filter((l) => l.isActive)} onClose={() => setAddVehicle(false)} />}
      {addCrew && <CrewDialog base={base} onClose={() => setAddCrew(false)} />}
    </div>
  );
}

function VehicleDialog({ base, locations, onClose }: { base: string; locations: Location[]; onClose: () => void }) {
  const [f, setF] = useState({ registrationNumber: '', vehicleType: 'BLS', equipment: ['OXYGEN', 'STRETCHER', 'FIRST_AID'] as string[], insuranceValidUntil: '', fitnessValidUntil: '', baseLocationId: locations[0]?.id ?? '' });
  const reg = f.registrationNumber.toUpperCase().replace(/\s|-/g, '');
  const problems: Record<string, string> = {};
  if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(reg)) problems.registrationNumber = 'Indian format, e.g. WB29AB1234';
  if (!f.insuranceValidUntil) problems.insuranceValidUntil = 'Required'; else if (new Date(f.insuranceValidUntil) < new Date()) problems.insuranceValidUntil = 'Insurance has expired';
  if (f.fitnessValidUntil && new Date(f.fitnessValidUntil) < new Date()) problems.fitnessValidUntil = 'Fitness certificate has expired';
  const save = useAction(() => api.post(`${base}/vehicles`, { registrationNumber: reg, vehicleType: f.vehicleType, equipment: f.equipment, insuranceValidUntil: f.insuranceValidUntil, fitnessValidUntil: f.fitnessValidUntil || undefined, baseLocationId: f.baseLocationId || undefined }), { success: 'Vehicle added — the platform will verify its documents', invalidate: [`${base}/vehicles`, `${base}/verification`], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Add Vehicle" description="Upload the RC, insurance, fitness and permit under Documents so verification can pass." icon={Ambulance} size="lg" footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={Object.keys(problems).length > 0}>Add Vehicle</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Registration Number" required error={f.registrationNumber ? problems.registrationNumber : undefined}><Input value={f.registrationNumber} onChange={(e) => setF({ ...f, registrationNumber: e.target.value.toUpperCase() })} placeholder="WB29AB1234" className="font-mono" autoFocus /></Field>
        <Field label="Type" required><Select value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value })}>{Object.entries(VEHICLE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Insurance Valid Until" required error={f.insuranceValidUntil ? problems.insuranceValidUntil : undefined}><Input type="date" value={f.insuranceValidUntil} onChange={(e) => setF({ ...f, insuranceValidUntil: e.target.value })} /></Field>
        <Field label="Fitness Valid Until" error={problems.fitnessValidUntil}><Input type="date" value={f.fitnessValidUntil} onChange={(e) => setF({ ...f, fitnessValidUntil: e.target.value })} /></Field>
        {locations.length > 0 && <Field label="Base Station" className="sm:col-span-2"><Select value={f.baseLocationId} onChange={(e) => setF({ ...f, baseLocationId: e.target.value })}><option value="">Not Fixed</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>}
        <Field label="Equipment on Board" className="sm:col-span-2"><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">{EQUIPMENT.map((eq) => <Checkbox key={eq} label={title(eq)} checked={f.equipment.includes(eq)} onChange={(e) => setF({ ...f, equipment: e.target.checked ? [...f.equipment, eq] : f.equipment.filter((x) => x !== eq) })} />)}</div></Field>
      </div>
    </Dialog>
  );
}

function CrewDialog({ base, onClose }: { base: string; onClose: () => void }) {
  const [f, setF] = useState({ fullName: '', role: 'DRIVER', licenseNumber: '', licenseValidUntil: '' });
  const problems: Record<string, string> = {};
  if (f.fullName.trim().length < 2) problems.fullName = 'Required';
  if (f.role === 'DRIVER' && !f.licenseNumber.trim()) problems.licenseNumber = 'Drivers need a driving licence number';
  if (f.licenseValidUntil && new Date(f.licenseValidUntil) < new Date()) problems.licenseValidUntil = 'Licence has expired';
  const save = useAction(() => api.post(`${base}/crew`, { fullName: f.fullName.trim(), role: f.role, licenseNumber: f.licenseNumber.trim() || undefined, licenseValidUntil: f.licenseValidUntil || undefined }), { success: 'Crew member added', invalidate: [`${base}/crew`], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Add Crew Member" icon={UserRound} footer={<><Button variant="ghost" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={Object.keys(problems).length > 0}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Full Name" required error={f.fullName ? problems.fullName : undefined}><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus /></Field>
        <Field label="Role" required><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="DRIVER">Driver</option><option value="EMT">EMT</option><option value="PARAMEDIC">Paramedic</option><option value="NURSE">Nurse</option></Select></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={f.role === 'DRIVER' ? 'Driving Licence No.' : 'Registration / Licence No.'} required={f.role === 'DRIVER'} error={problems.licenseNumber}><Input value={f.licenseNumber} onChange={(e) => setF({ ...f, licenseNumber: e.target.value })} /></Field>
          <Field label="Valid Until" error={problems.licenseValidUntil}><Input type="date" value={f.licenseValidUntil} onChange={(e) => setF({ ...f, licenseValidUntil: e.target.value })} /></Field>
        </div>
      </div>
    </Dialog>
  );
}
