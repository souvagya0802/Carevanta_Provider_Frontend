'use client';

import { useState } from 'react';
import { Building2, Save, Stethoscope } from 'lucide-react';
import { useOrg, usePortal, useTypeWords } from '@/lib/portal';
import { api, ApiError } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { title } from '@/lib/format';
import { Badge, Button, Checkbox, ErrorState, Field, FormSection, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui/primitives';

interface Detail {
  id: string; type: string; status: string; version: number; legalName: string; displayName: string; description: string | null; contactEmail: string | null; contactPhone: string | null; gstin: string | null; registrationNumber: string | null;
  doctor: { gender: string | null; yearsOfExperience: number | null; languages: string[]; defaultFeeMinor: number | null; bio: string | null; specialities: { code: string; name: string; isPrimary: boolean; verified: boolean }[]; qualifications: { degree: string; institution: string; yearAwarded: number | null; verified: boolean }[]; registrations: { council: string; registrationNumber: string; verifiedAt: string | null }[] } | null;
  facility: { ownershipType: string; bedCount: number | null; icuBedCount: number | null; hasEmergency: boolean; isOpen24x7: boolean; establishmentRegistrationNo: string | null; establishmentRegistrationAuth: string | null; accreditations: string[] } | null;
  diagnostic: { offersPathology: boolean; offersImaging: boolean; homeCollectionAvailable: boolean; establishmentRegistrationNo: string | null; nablCertificateNo: string | null; nablScope: string | null; aerbLicenseNo: string | null; pcpndtRegistrationNo: string | null; typicalTurnaroundHours: number | null } | null;
  pharmacy: { retailDrugLicenseNo: string | null; wholesaleDrugLicenseNo: string | null; drugLicenseValidUntil: string | null; pharmacistName: string | null; pharmacistRegistrationNo: string | null; homeDeliveryAvailable: boolean } | null;
  ambulance: { dispatchPhone: string | null; isOpen24x7: boolean; fleetSize: number | null } | null;
}

export default function ProfilePage() {
  const org = useOrg();
  const base = `/portal/providers/${org.providerId}`;
  const detail = useGet<Detail>(base);
  if (detail.isPending) return <Skeleton rows={8} />;
  if (detail.isError) return <ErrorState error={detail.error} retry={() => detail.refetch()} />;
  return <ProfileForm key={detail.data.version} d={detail.data} base={base} />;
}

/** One form, one PATCH: only fields that changed are sent, with the version we loaded so concurrent edits are caught. */
function ProfileForm({ d, base }: { d: Detail; base: string }) {
  const { can } = usePortal();
  const words = useTypeWords(d.type);
  const editable = can('manage_profile') && d.status !== 'DEACTIVATED';
  const num = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [f, setF] = useState({
    displayName: d.displayName, legalName: d.legalName, description: d.description ?? '', contactPhone: d.contactPhone ?? '', contactEmail: d.contactEmail ?? '', gstin: d.gstin ?? '', registrationNumber: d.registrationNumber ?? '',
    gender: d.doctor?.gender ?? '', yearsOfExperience: num(d.doctor?.yearsOfExperience), languages: (d.doctor?.languages ?? []).join(', '), defaultFee: d.doctor?.defaultFeeMinor != null ? String(d.doctor.defaultFeeMinor / 100) : '', bio: d.doctor?.bio ?? '',
    ownershipType: d.facility?.ownershipType ?? 'PRIVATE', bedCount: num(d.facility?.bedCount), icuBedCount: num(d.facility?.icuBedCount), hasEmergency: d.facility?.hasEmergency ?? false, isOpen24x7: d.facility?.isOpen24x7 ?? d.ambulance?.isOpen24x7 ?? false, establishmentRegistrationNo: d.facility?.establishmentRegistrationNo ?? d.diagnostic?.establishmentRegistrationNo ?? '', establishmentRegistrationAuth: d.facility?.establishmentRegistrationAuth ?? '', accreditations: (d.facility?.accreditations ?? []).join(', '),
    offersPathology: d.diagnostic?.offersPathology ?? false, offersImaging: d.diagnostic?.offersImaging ?? false, homeCollectionAvailable: d.diagnostic?.homeCollectionAvailable ?? false, nablCertificateNo: d.diagnostic?.nablCertificateNo ?? '', nablScope: d.diagnostic?.nablScope ?? '', aerbLicenseNo: d.diagnostic?.aerbLicenseNo ?? '', pcpndtRegistrationNo: d.diagnostic?.pcpndtRegistrationNo ?? '', typicalTurnaroundHours: num(d.diagnostic?.typicalTurnaroundHours),
    retailDrugLicenseNo: d.pharmacy?.retailDrugLicenseNo ?? '', wholesaleDrugLicenseNo: d.pharmacy?.wholesaleDrugLicenseNo ?? '', drugLicenseValidUntil: d.pharmacy?.drugLicenseValidUntil ?? '', pharmacistName: d.pharmacy?.pharmacistName ?? '', pharmacistRegistrationNo: d.pharmacy?.pharmacistRegistrationNo ?? '', homeDeliveryAvailable: d.pharmacy?.homeDeliveryAvailable ?? false,
    dispatchPhone: d.ambulance?.dispatchPhone ?? '', fleetSize: num(d.ambulance?.fleetSize),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const payload = () => {
    const s = (v: string) => (v.trim() === '' ? null : v.trim());
    const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
    const body: Record<string, unknown> = { expectedVersion: d.version };
    const core: Record<string, unknown> = { displayName: f.displayName.trim(), legalName: f.legalName.trim(), description: s(f.description), contactPhone: s(f.contactPhone), contactEmail: s(f.contactEmail), gstin: d.type === 'DOCTOR' ? undefined : s(f.gstin)?.toUpperCase() ?? null, registrationNumber: d.type === 'DOCTOR' ? undefined : s(f.registrationNumber) };
    for (const [k, v] of Object.entries(core)) if (v !== undefined && v !== (d as unknown as Record<string, unknown>)[k]) body[k] = v;
    const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
    if (d.type === 'DOCTOR') body.doctor = { gender: f.gender || undefined, yearsOfExperience: n(f.yearsOfExperience), languages: list(f.languages), defaultFeeMinor: f.defaultFee ? Math.round(Number(f.defaultFee) * 100) : undefined, bio: s(f.bio) ?? undefined };
    if (d.type === 'HOSPITAL' || d.type === 'CLINIC') body.facility = { ownershipType: f.ownershipType, bedCount: n(f.bedCount), icuBedCount: n(f.icuBedCount), hasEmergency: f.hasEmergency, isOpen24x7: f.isOpen24x7, establishmentRegistrationNo: s(f.establishmentRegistrationNo) ?? undefined, establishmentRegistrationAuth: s(f.establishmentRegistrationAuth) ?? undefined, accreditations: list(f.accreditations).map((a) => a.toUpperCase().replace(/\s+/g, '_')) };
    if (d.type === 'DIAGNOSTIC_LAB' || d.type === 'IMAGING_CENTRE') body.diagnostic = { offersPathology: f.offersPathology, offersImaging: f.offersImaging, homeCollectionAvailable: f.homeCollectionAvailable, establishmentRegistrationNo: s(f.establishmentRegistrationNo) ?? undefined, nablCertificateNo: s(f.nablCertificateNo) ?? undefined, nablScope: s(f.nablScope) ?? undefined, aerbLicenseNo: s(f.aerbLicenseNo) ?? undefined, pcpndtRegistrationNo: s(f.pcpndtRegistrationNo) ?? undefined, typicalTurnaroundHours: n(f.typicalTurnaroundHours) };
    if (d.type === 'PHARMACY') body.pharmacy = { retailDrugLicenseNo: s(f.retailDrugLicenseNo) ?? undefined, wholesaleDrugLicenseNo: s(f.wholesaleDrugLicenseNo) ?? undefined, drugLicenseValidUntil: f.drugLicenseValidUntil || undefined, pharmacistName: s(f.pharmacistName) ?? undefined, pharmacistRegistrationNo: s(f.pharmacistRegistrationNo) ?? undefined, homeDeliveryAvailable: f.homeDeliveryAvailable };
    if (d.type === 'AMBULANCE_OPERATOR') body.ambulance = { dispatchPhone: s(f.dispatchPhone) ?? undefined, isOpen24x7: f.isOpen24x7, fleetSize: n(f.fleetSize) };
    return body;
  };

  const save = useAction(() => api.patch(base, payload()), {
    success: 'Profile saved', invalidate: [base, '/portal/me'],
    errorMessage: (e) => (e instanceof ApiError && e.status === 409 ? 'Someone else changed this profile. Reload the page and apply your edits again.' : undefined),
    onError: (e) => {
      if (e instanceof ApiError && e.status !== 409) setErrors(e.fieldErrors);
    },
  });
  const problems: Record<string, string> = {};
  if (f.displayName.trim().length < 2) problems.displayName = 'At least 2 characters';
  if (f.legalName.trim().length < 2) problems.legalName = 'At least 2 characters';
  if (!f.contactPhone.trim() && !f.contactEmail.trim()) problems.contactPhone = 'A phone or email is required';
  if (f.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(f.gstin.trim())) problems.gstin = '15-character GSTIN';
  const valid = Object.keys(problems).length === 0;
  const err = (k: string) => errors[k] ?? problems[k];

  return (
    <div className="space-y-4">
      <PageHeader title="Profile" description={`How your ${words.noun} appears to patients and to the verification team. Changes to licence numbers are re-checked.`} actions={editable && <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}><Save size={16} /> Save Changes</Button>} />
      {!editable && <p className="rounded-lg border border-grey-200 bg-grey-50 p-3 text-sm text-grey-700">Your role can view this profile but not edit it. Ask an owner or admin.</p>}
      <div className="flex flex-wrap gap-2 text-xs"><Badge>{title(d.type)}</Badge><Badge accent={d.status === 'APPROVED' ? 'green' : 'orange'}>{title(d.status)}</Badge></div>

      <FormSection title={d.type === 'DOCTOR' ? 'Identity' : 'Organisation'} icon={d.type === 'DOCTOR' ? Stethoscope : Building2} accent="blue">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Display Name" required error={err('displayName')} hint="Shown to patients"><Input value={f.displayName} onChange={(e) => set('displayName', e.target.value)} disabled={!editable} /></Field>
          <Field label={d.type === 'DOCTOR' ? 'Full Name (as Registered)' : 'Legal Name'} required error={err('legalName')}><Input value={f.legalName} onChange={(e) => set('legalName', e.target.value)} disabled={!editable} /></Field>
          <Field label="Contact Phone" error={err('contactPhone')}><Input inputMode="tel" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} disabled={!editable} /></Field>
          <Field label="Contact Email" error={err('contactEmail')}><Input type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} disabled={!editable} /></Field>
          {d.type !== 'DOCTOR' && <Field label="GSTIN" error={err('gstin')}><Input value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} disabled={!editable} maxLength={15} /></Field>}
          {d.type !== 'DOCTOR' && <Field label="Business Registration No." error={err('registrationNumber')}><Input value={f.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value)} disabled={!editable} /></Field>}
          <Field label={d.type === 'DOCTOR' ? 'Short Introduction' : 'Description'} className="md:col-span-2" hint="Shown on your public listing"><Textarea value={d.type === 'DOCTOR' ? f.bio : f.description} onChange={(e) => set(d.type === 'DOCTOR' ? 'bio' : 'description', e.target.value)} disabled={!editable} className="min-h-24" /></Field>
        </div>
      </FormSection>

      {d.type === 'DOCTOR' && d.doctor && (
        <FormSection title="Professional Details" icon={Stethoscope} accent="green" hint="Specialities, qualifications and council registration are verified by the platform; ask the Carevanta team to change them.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Years of Experience"><Input type="number" min={0} max={70} value={f.yearsOfExperience} onChange={(e) => set('yearsOfExperience', e.target.value)} disabled={!editable} /></Field>
            <Field label="Gender"><Select value={f.gender} onChange={(e) => set('gender', e.target.value)} disabled={!editable}><option value="">Prefer Not to Say</option><option value="FEMALE">Female</option><option value="MALE">Male</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Default Consultation Fee (₹)"><Input type="number" min={0} value={f.defaultFee} onChange={(e) => set('defaultFee', e.target.value)} disabled={!editable} /></Field>
            <Field label="Languages" hint="Comma separated"><Input value={f.languages} onChange={(e) => set('languages', e.target.value)} disabled={!editable} /></Field>
          </div>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <div><dt className="text-xs text-grey-500">Specialities</dt><dd className="mt-1 flex flex-wrap gap-1">{d.doctor.specialities.map((s) => <Badge key={s.code} accent={s.verified ? 'green' : 'orange'}>{s.name}{s.isPrimary ? ' · Primary' : ''}</Badge>)}</dd></div>
            <div><dt className="text-xs text-grey-500">Qualifications</dt><dd className="mt-1">{d.doctor.qualifications.map((q) => <p key={q.degree + q.institution}>{q.degree}, {q.institution}{q.yearAwarded ? ` (${q.yearAwarded})` : ''} {q.verified && <Badge accent="green">Verified</Badge>}</p>)}</dd></div>
            <div><dt className="text-xs text-grey-500">Council Registration</dt><dd className="mt-1">{d.doctor.registrations.map((r) => <p key={r.registrationNumber}>{r.council} · {r.registrationNumber} {r.verifiedAt && <Badge accent="green">Verified</Badge>}</p>)}</dd></div>
          </dl>
        </FormSection>
      )}

      {(d.type === 'HOSPITAL' || d.type === 'CLINIC') && (
        <FormSection title="Facility Details" icon={Building2} accent="green">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Ownership"><Select value={f.ownershipType} onChange={(e) => set('ownershipType', e.target.value)} disabled={!editable}>{['PRIVATE', 'GOVERNMENT', 'TRUST_OR_NGO', 'OTHER'].map((o) => <option key={o} value={o}>{title(o)}</option>)}</Select></Field>
            <Field label="Clinical Establishment Reg. No."><Input value={f.establishmentRegistrationNo} onChange={(e) => set('establishmentRegistrationNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="Registering Authority" className="xl:col-span-2"><Input value={f.establishmentRegistrationAuth} onChange={(e) => set('establishmentRegistrationAuth', e.target.value)} disabled={!editable} /></Field>
            <Field label={d.type === 'HOSPITAL' ? 'Inpatient Beds' : 'Day-Care Beds'}><Input type="number" min={0} value={f.bedCount} onChange={(e) => set('bedCount', e.target.value)} disabled={!editable} /></Field>
            {d.type === 'HOSPITAL' && <Field label="ICU Beds"><Input type="number" min={0} value={f.icuBedCount} onChange={(e) => set('icuBedCount', e.target.value)} disabled={!editable} /></Field>}
            <Field label="Accreditations" hint="Comma separated, e.g. NABH, NABL" className="md:col-span-2"><Input value={f.accreditations} onChange={(e) => set('accreditations', e.target.value)} disabled={!editable} /></Field>
            <div className="flex flex-col justify-end gap-2 pb-1 md:col-span-2"><Checkbox label="Has an Emergency / Casualty Department" checked={f.hasEmergency} onChange={(e) => set('hasEmergency', e.target.checked)} disabled={!editable} /><Checkbox label="Open 24×7" checked={f.isOpen24x7} onChange={(e) => set('isOpen24x7', e.target.checked)} disabled={!editable} /></div>
          </div>
        </FormSection>
      )}

      {(d.type === 'DIAGNOSTIC_LAB' || d.type === 'IMAGING_CENTRE') && (
        <FormSection title="Services & Licensing" icon={Building2} accent="green">
          <div className="grid gap-2 md:grid-cols-3">
            <Checkbox label="Pathology" checked={f.offersPathology} onChange={(e) => set('offersPathology', e.target.checked)} disabled={!editable} />
            <Checkbox label="Imaging" checked={f.offersImaging} onChange={(e) => set('offersImaging', e.target.checked)} disabled={!editable} />
            <Checkbox label="Home Sample Collection" checked={f.homeCollectionAvailable} onChange={(e) => set('homeCollectionAvailable', e.target.checked)} disabled={!editable} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Clinical Establishment Reg. No."><Input value={f.establishmentRegistrationNo} onChange={(e) => set('establishmentRegistrationNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="NABL Certificate No."><Input value={f.nablCertificateNo} onChange={(e) => set('nablCertificateNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="NABL Scope" className="md:col-span-2"><Input value={f.nablScope} onChange={(e) => set('nablScope', e.target.value)} disabled={!editable} /></Field>
            <Field label="AERB Licence No."><Input value={f.aerbLicenseNo} onChange={(e) => set('aerbLicenseNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="PC-PNDT Registration No."><Input value={f.pcpndtRegistrationNo} onChange={(e) => set('pcpndtRegistrationNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="Report Turnaround (Hours)"><Input type="number" min={1} max={720} value={f.typicalTurnaroundHours} onChange={(e) => set('typicalTurnaroundHours', e.target.value)} disabled={!editable} /></Field>
          </div>
        </FormSection>
      )}

      {d.type === 'PHARMACY' && (
        <FormSection title="Drug Licensing" icon={Building2} accent="green" hint="Licences are per premises; keep the expiry date current so orders are not paused.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Retail Drug Licence No."><Input value={f.retailDrugLicenseNo} onChange={(e) => set('retailDrugLicenseNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="Wholesale Drug Licence No."><Input value={f.wholesaleDrugLicenseNo} onChange={(e) => set('wholesaleDrugLicenseNo', e.target.value)} disabled={!editable} /></Field>
            <Field label="Licence Valid Until"><Input type="date" value={f.drugLicenseValidUntil} onChange={(e) => set('drugLicenseValidUntil', e.target.value)} disabled={!editable} /></Field>
            <Field label="Registered Pharmacist"><Input value={f.pharmacistName} onChange={(e) => set('pharmacistName', e.target.value)} disabled={!editable} /></Field>
            <Field label="Pharmacist Registration No."><Input value={f.pharmacistRegistrationNo} onChange={(e) => set('pharmacistRegistrationNo', e.target.value)} disabled={!editable} /></Field>
            <div className="flex items-end pb-2 md:col-span-2"><Checkbox label="Home Delivery Available" checked={f.homeDeliveryAvailable} onChange={(e) => set('homeDeliveryAvailable', e.target.checked)} disabled={!editable} /></div>
          </div>
        </FormSection>
      )}

      {d.type === 'AMBULANCE_OPERATOR' && (
        <FormSection title="Dispatch" icon={Building2} accent="green">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Dispatch Phone" required><Input inputMode="tel" value={f.dispatchPhone} onChange={(e) => set('dispatchPhone', e.target.value)} disabled={!editable} /></Field>
            <Field label="Fleet Size"><Input type="number" min={0} value={f.fleetSize} onChange={(e) => set('fleetSize', e.target.value)} disabled={!editable} /></Field>
            <div className="flex items-end pb-2"><Checkbox label="Operates 24×7" checked={f.isOpen24x7} onChange={(e) => set('isOpen24x7', e.target.checked)} disabled={!editable} /></div>
          </div>
        </FormSection>
      )}

      {editable && <div className="flex justify-end"><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}><Save size={16} /> Save Changes</Button></div>}
    </div>
  );
}
