'use client';

import { Award, BadgeCheck, Building2, CalendarDays, Languages, MapPin, Star, Stethoscope } from 'lucide-react';
import { useGet } from '@/lib/hooks';
import { count, date, money, title } from '@/lib/format';
import { Badge, Dialog, ErrorState, Skeleton } from '@/components/ui/primitives';

/**
 * Everything a facility may know about a doctor it works with: verified
 * specialities, qualifications and council registration, experience, languages,
 * where else they practise, and how they work at *this* facility. Patient
 * records are never part of this view.
 */
export interface DoctorDetail {
  id: string; displayName: string; status: string; gender: string | null; yearsOfExperience: number | null; languages: string[]; bio: string | null; defaultFeeMinor: number | null;
  rating: { average: number | null; count: number };
  specialities: { code: string; name: string; isPrimary: boolean; verified: boolean }[];
  qualifications: { degree: string; institution: string; yearAwarded: number | null; verified: boolean }[];
  registrations: { council: string; registrationNumber: string; registrationYear: number | null; validUntil: string | null; verified: boolean }[];
  practiceLocations: { name: string; city: string; district: string }[];
  affiliations: { facility: string; type: string; status: string; department: string | null; engagementType: string; isHere: boolean }[];
  here: { affiliationId: string; status: string; department: string | null; roleTitle: string | null; engagementType: string; consultationFeeMinor: number | null; startDate: string | null; location: string | null; activeSchedules: number; upcomingAppointments: number; completedAppointments: number } | null;
}

export function DoctorDialog({ base, doctorProviderId, onClose }: { base: string; doctorProviderId: string; onClose: () => void }) {
  const q = useGet<DoctorDetail>(`${base}/doctors/${doctorProviderId}`);
  const d = q.data;
  const primary = d?.specialities.find((s) => s.isPrimary) ?? d?.specialities[0];
  return (
    <Dialog open onClose={onClose} size="lg" icon={Stethoscope} title={d?.displayName ?? 'Doctor'} description={d ? [primary?.name, d.yearsOfExperience != null ? `${d.yearsOfExperience} yrs experience` : null].filter(Boolean).join(' · ') : undefined}>
      {q.isPending ? <Skeleton rows={8} /> : q.isError || !d ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {d.specialities.map((s) => <Badge key={s.code} accent={s.isPrimary ? 'blue' : 'ink'}>{s.name}{s.verified ? '' : ' (unverified)'}</Badge>)}
            {d.rating.average != null && <span className="ml-auto inline-flex items-center gap-1 text-sm"><Star size={14} className="text-orange" aria-hidden /> <span className="tnum font-semibold">{d.rating.average.toFixed(1)}</span> <span className="text-xs text-grey-500">({count(d.rating.count)})</span></span>}
          </div>
          {d.bio && <p className="text-sm text-grey-700">{d.bio}</p>}

          {d.here && (
            <section className="rounded-lg border border-grey-200 bg-grey-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Building2 size={14} aria-hidden /> At Your Facility</h3>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Row k="Department" v={d.here.department ?? 'Not set'} />
                <Row k="Engagement" v={`${title(d.here.engagementType)}${d.here.roleTitle ? ` · ${d.here.roleTitle}` : ''}`} />
                <Row k="Consultation Fee" v={money(d.here.consultationFeeMinor ?? d.defaultFeeMinor)} />
                <Row k="Location" v={d.here.location ?? 'Any'} />
                <Row k="Since" v={d.here.startDate ? date(d.here.startDate) : '—'} />
                <Row k="Status" v={<Badge accent={d.here.status === 'ACTIVE' ? 'green' : 'orange'}>{title(d.here.status)}</Badge>} />
                <Row k="Weekly Templates" v={String(d.here.activeSchedules)} />
                <Row k="Appointments" v={`${count(d.here.upcomingAppointments)} upcoming · ${count(d.here.completedAppointments)} completed`} />
              </dl>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Award size={14} aria-hidden /> Qualifications</h3>
              {d.qualifications.length === 0 ? <p className="mt-1 text-sm text-grey-500">None recorded.</p> : <ul className="mt-1 space-y-1 text-sm">{d.qualifications.map((x, i) => <li key={i}><span className="font-medium">{x.degree}</span> · {x.institution}{x.yearAwarded ? ` (${x.yearAwarded})` : ''}{x.verified && <BadgeCheck size={12} className="ml-1 inline text-green" aria-label="Verified" />}</li>)}</ul>}
            </section>
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><BadgeCheck size={14} aria-hidden /> Council Registration</h3>
              {d.registrations.length === 0 ? <p className="mt-1 text-sm text-grey-500">None recorded.</p> : <ul className="mt-1 space-y-1 text-sm">{d.registrations.map((x, i) => <li key={i}><span className="font-medium">{x.council}</span><span className="block text-xs text-grey-600">No. {x.registrationNumber}{x.registrationYear ? ` · since ${x.registrationYear}` : ''}{x.validUntil ? ` · valid to ${date(x.validUntil)}` : ''} · {x.verified ? 'verified by the platform' : 'not yet verified'}</span></li>)}</ul>}
            </section>
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Languages size={14} aria-hidden /> Languages & Fee</h3>
              <p className="mt-1 text-sm">{d.languages.length ? d.languages.map((l) => LANG[l] ?? l).join(', ') : 'Not stated'}</p>
              <p className="text-sm text-grey-600">Default fee {money(d.defaultFeeMinor)}{d.gender ? ` · ${title(d.gender)}` : ''}</p>
            </section>
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin size={14} aria-hidden /> Own Practice</h3>
              {d.practiceLocations.length === 0 ? <p className="mt-1 text-sm text-grey-500">No private chamber listed.</p> : <ul className="mt-1 space-y-1 text-sm">{d.practiceLocations.map((l, i) => <li key={i}>{l.name} · {l.city}, {l.district}</li>)}</ul>}
            </section>
          </div>

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={14} aria-hidden /> Also Practises At</h3>
            {d.affiliations.filter((a) => !a.isHere).length === 0 ? <p className="mt-1 text-sm text-grey-500">No other hospital or clinic on the platform.</p> : (
              <ul className="mt-1 divide-y divide-grey-100 text-sm">{d.affiliations.filter((a) => !a.isHere).map((a, i) => <li key={i} className="flex items-center justify-between gap-2 py-1.5"><span>{a.facility} <span className="text-xs text-grey-500">· {title(a.type)}{a.department ? ` · ${a.department}` : ''}</span></span><Badge accent={a.status === 'ACTIVE' ? 'green' : 'ink'}>{title(a.engagementType)}</Badge></li>)}</ul>
            )}
          </section>
          <p className="text-xs text-grey-500">Specialities, degrees and registrations marked verified were checked by the platform during onboarding. Contact details and patient records are not shared between facilities.</p>
        </div>
      )}
    </Dialog>
  );
}

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', bn: 'Bengali', te: 'Telugu', ta: 'Tamil', mr: 'Marathi', gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', or: 'Odia', pa: 'Punjabi', ur: 'Urdu' };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-grey-100 py-1 last:border-0 sm:border-0"><dt className="text-grey-500">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}
