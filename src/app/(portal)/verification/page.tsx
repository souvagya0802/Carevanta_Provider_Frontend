'use client';

import Link from 'next/link';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileUp, Send, XCircle } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { title, titleCase } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, ErrorState, PageHeader, Skeleton, cx } from '@/components/ui/primitives';
import { useState } from 'react';

interface Verification {
  providerStatus: string; caseStatus: string | null; decisionNote: string | null; requiredChecks: string[]; optionalChecks: string[];
  checks: { checkType: string; isRequired: boolean; status: string; validUntil: string | null; identifiers: { label: string; value: string }[]; evidence: { documentType: string; status: string }[]; todo: string[] }[];
  readyToSubmit: boolean; blockers: string[];
}

const CHECK_HELP: Record<string, string> = {
  IDENTITY: 'A government identity document for the owner or authorised person.',
  PROFESSIONAL_REGISTRATION: 'Medical or pharmacy council registration, checked against the council register.',
  QUALIFICATION: 'Degree certificates for the qualifications you listed.',
  FACILITY_REGISTRATION: 'Clinical Establishment registration or trade licence for the premises.',
  TAX_REGISTRATION: 'GST certificate, if you are registered for GST.',
  DRUG_LICENSE: 'Retail or wholesale drug licence for each store.',
  RADIOLOGY_LICENSE: 'AERB licence for X-ray / CT and PC-PNDT registration for ultrasound.',
  ACCREDITATION: 'NABL or NABH certificate, if you claim accreditation.',
  VEHICLE_REGISTRATION: 'Registration certificate, fitness and permit for each ambulance.',
  VEHICLE_INSURANCE: 'Current insurance for each ambulance.',
  ADDRESS: 'Your premises address, confirmed against your licence and the map pin.',
  BANK_ACCOUNT: 'A payout account verified from a cancelled cheque or bank proof.',
};

export default function VerificationPage() {
  const org = useOrg();
  const { can } = usePortal();
  const base = `/portal/providers/${org.providerId}`;
  const v = useGet<Verification>(`${base}/verification`);
  const [confirm, setConfirm] = useState(false);
  const submit = useAction(() => api.post(`${base}/submit`), { success: 'Submitted — the verification team will review your documents', invalidate: [`${base}/verification`, base, '/portal/me'], onSuccess: () => setConfirm(false) });

  if (v.isPending) return <Skeleton rows={8} />;
  if (v.isError) return <ErrorState error={v.error} retry={() => v.refetch()} />;
  const d = v.data;
  const required = d.checks.filter((c) => c.isRequired);
  const passed = required.filter((c) => c.status === 'PASSED' || c.status === 'WAIVED').length;
  const stage = d.providerStatus === 'APPROVED' ? 'approved' : d.providerStatus === 'REJECTED' || d.providerStatus === 'SUSPENDED' ? 'blocked' : d.caseStatus ? 'review' : 'draft';

  return (
    <div className="space-y-4">
      <PageHeader title="Verification" description="Patients only see verified organisations. Each check below must pass before approval; upload the matching documents and the team reviews them." actions={can('manage_profile') && d.readyToSubmit && <Button onClick={() => setConfirm(true)}><Send size={16} /> {d.providerStatus === 'DRAFT' ? 'Submit for Verification' : 'Resubmit'}</Button>} />

      <div className={cx('flex items-start gap-3 rounded-lg border p-4 text-sm', stage === 'approved' ? 'border-green/30 bg-green-soft' : stage === 'blocked' ? 'border-red/30 bg-red-soft' : 'border-orange/30 bg-orange-soft')}>
        {stage === 'approved' ? <CheckCircle2 size={20} className="shrink-0 text-green" aria-hidden /> : stage === 'blocked' ? <XCircle size={20} className="shrink-0 text-red" aria-hidden /> : stage === 'review' ? <Clock size={20} className="shrink-0 text-orange" aria-hidden /> : <BadgeCheck size={20} className="shrink-0 text-orange" aria-hidden />}
        <div className="min-w-0">
          <p className="font-semibold">{stage === 'approved' ? 'Approved and listed' : stage === 'blocked' ? (d.providerStatus === 'REJECTED' ? 'Not approved' : 'Listing suspended') : stage === 'review' ? (d.caseStatus === 'AWAITING_PROVIDER' ? 'Action needed from you' : 'Under review by the verification team') : 'Not submitted yet'}</p>
          <p className="mt-0.5 text-xs text-grey-700">{d.decisionNote ?? (stage === 'draft' ? (d.readyToSubmit ? 'Everything required for submission is in place. Upload your documents first so the review goes faster, then submit.' : `Before you can submit: ${d.blockers.join('; ')}.`) : stage === 'review' ? 'Usually decided within 3 working days. You will be emailed either way.' : stage === 'approved' ? 'Keep licences current; the team is alerted before they expire.' : 'Fix the issues noted and resubmit.')}</p>
          {stage !== 'approved' && <p className="mt-2 text-xs text-grey-600">Required checks passed: <span className="tnum font-semibold text-ink">{passed}/{required.length}</span></p>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {d.checks.map((c) => {
          const tone = c.status === 'PASSED' ? 'green' : c.status === 'FAILED' ? 'red' : c.status === 'WAIVED' ? 'blue' : 'orange';
          return (
            <Card key={c.checkType} title={title(c.checkType)} description={CHECK_HELP[c.checkType]} actions={<span className="flex items-center gap-1"><Badge accent={tone}>{c.status === 'PENDING' ? 'To Do' : title(c.status)}</Badge>{!c.isRequired && <Badge>Optional</Badge>}</span>}>
              {c.identifiers.length > 0 && <dl className="space-y-1 text-sm">{c.identifiers.map((i) => <div key={i.label + i.value} className="flex justify-between gap-3"><dt className="text-grey-500">{titleCase(i.label)}</dt><dd className="text-right font-medium break-all">{i.value}</dd></div>)}</dl>}
              {c.evidence.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {c.evidence.map((e) => (
                    <li key={e.documentType} className="flex items-center justify-between gap-2">
                      <span>{title(e.documentType)}</span>
                      {e.status === 'ACCEPTED' ? <Badge accent="green">Accepted</Badge> : e.status === 'UPLOADED' ? <Badge accent="orange">Under Review</Badge> : e.status === 'REJECTED' ? <Badge accent="red">Rejected</Badge> : e.status === 'EXPIRED' ? <Badge accent="red">Expired</Badge> : can('manage_profile') ? <Link href={`/documents?type=${e.documentType}`} className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"><FileUp size={12} aria-hidden /> Upload</Link> : <Badge>Missing</Badge>}
                    </li>
                  ))}
                </ul>
              )}
              {c.todo.length > 0 && <ul className="mt-3 space-y-1">{c.todo.map((t) => <li key={t} className="flex items-start gap-1.5 text-xs text-orange"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />{t}</li>)}</ul>}
              {c.validUntil && <p className="mt-2 text-xs text-grey-500">Valid until {c.validUntil}</p>}
            </Card>
          );
        })}
      </div>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => submit.mutate()} title="Submit for Verification?" message="The verification team will check your details and documents. You can keep editing locations and services meanwhile; identity details are locked until a decision." confirmLabel="Submit" loading={submit.isPending} />
    </div>
  );
}
