'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, FileUp } from 'lucide-react';
import { useOrg, usePortal } from '@/lib/portal';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/lib/hooks';
import { date, dateTime, title } from '@/lib/format';
import { DOCUMENT_TYPES } from '@/lib/providers-meta';
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, PageHeader, Select, Skeleton } from '@/components/ui/primitives';

interface Doc { id: string; documentType: string; status: string; fileName: string; mimeType: string; sizeBytes: number; documentNumber: string | null; issuedAt: string | null; expiresAt: string | null; expired: boolean; reviewedAt: string | null; reviewNote: string | null; createdAt: string }

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png'];

export default function DocumentsPage() {
  return <Suspense fallback={<Skeleton rows={6} />}><DocumentsInner /></Suspense>;
}

function DocumentsInner() {
  const org = useOrg();
  const { can } = usePortal();
  const params = useSearchParams();
  const base = `/portal/providers/${org.providerId}`;
  const docs = useGet<Doc[]>(`${base}/documents`);
  const [uploading, setUploading] = useState<string | null>(params.get('type'));
  const editable = can('manage_profile');
  const current = (docs.data ?? []).filter((d) => d.status !== 'SUPERSEDED');
  const history = (docs.data ?? []).filter((d) => d.status === 'SUPERSEDED');

  return (
    <div className="space-y-4">
      <PageHeader title="Documents" description="Licences, registrations and certificates the verification team checks. Uploading a newer file of the same type replaces the old one; nothing is deleted." actions={editable && <Button onClick={() => setUploading('')}><FileUp size={16} /> Upload Document</Button>} />
      <Card padded={false}>
        {docs.isPending ? <div className="p-5"><Skeleton rows={4} /></div> : docs.isError ? <div className="p-5"><ErrorState error={docs.error} retry={() => docs.refetch()} /></div> : current.length === 0 ? (
          <div className="p-8 text-center"><FileText size={24} className="mx-auto text-grey-400" aria-hidden /><p className="mt-2 text-sm font-medium">No documents yet</p><p className="mt-0.5 text-xs text-grey-500">Start with the registration or licence for your organisation; the Verification page lists what each check needs.</p></div>
        ) : (
          <ul className="divide-y divide-grey-100">
            {current.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <FileText size={18} className="shrink-0 text-grey-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{title(d.documentType)}</p>
                  <p className="truncate text-xs text-grey-500">{d.fileName} · {Math.max(1, Math.round(d.sizeBytes / 1024))} kB{d.documentNumber ? ` · No. ${d.documentNumber}` : ''}{d.expiresAt ? ` · expires ${date(d.expiresAt)}` : ''} · uploaded {dateTime(d.createdAt)}</p>
                  {d.reviewNote && d.status === 'REJECTED' && <p className="mt-0.5 text-xs text-red">{d.reviewNote}</p>}
                </div>
                <span className="flex items-center gap-1">
                  <Badge accent={d.status === 'ACCEPTED' ? 'green' : d.status === 'UPLOADED' ? 'orange' : d.status === 'REJECTED' ? 'red' : 'ink'}>{d.status === 'UPLOADED' ? 'Under Review' : title(d.status)}</Badge>
                  {d.expired && <Badge accent="red">Expired</Badge>}
                  {editable && (d.status === 'REJECTED' || d.expired) && <Button size="sm" variant="secondary" onClick={() => setUploading(d.documentType)}>Replace</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {history.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-grey-600">Previous versions ({history.length})</summary><ul className="mt-2 space-y-1 text-xs text-grey-500">{history.map((d) => <li key={d.id}>{title(d.documentType)} · {d.fileName} · {dateTime(d.createdAt)}</li>)}</ul></details>}
      {uploading !== null && <UploadDialog base={base} initialType={uploading} onClose={() => setUploading(null)} />}
    </div>
  );
}

function UploadDialog({ base, initialType, onClose }: { base: string; initialType: string; onClose: () => void }) {
  const [f, setF] = useState({ documentType: DOCUMENT_TYPES.includes(initialType as (typeof DOCUMENT_TYPES)[number]) ? initialType : 'OTHER', documentNumber: '', issuedAt: '', expiresAt: '' });
  const [file, setFile] = useState<File | null>(null);
  const fileProblem = !file ? 'Choose a file' : !ACCEPT.includes(file.type) ? 'PDF, JPEG or PNG only' : file.size > MAX_BYTES ? 'Larger than 10 MB' : null;
  const dateProblem = f.expiresAt && new Date(f.expiresAt) < new Date() ? 'This document has already expired' : f.issuedAt && f.expiresAt && f.issuedAt > f.expiresAt ? 'Expiry is before issue date' : null;
  const upload = useAction(() => {
    const q = new URLSearchParams({ documentType: f.documentType, fileName: file!.name, ...(f.documentNumber ? { documentNumber: f.documentNumber.trim() } : {}), ...(f.issuedAt ? { issuedAt: f.issuedAt } : {}), ...(f.expiresAt ? { expiresAt: f.expiresAt } : {}) });
    return api.upload(`${base}/documents?${q}`, file!, file!.type);
  }, { success: 'Uploaded — the verification team will review it', invalidate: [`${base}/documents`, `${base}/verification`], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title="Upload Document" description="A clear scan or photo. The file is checked for type and size before it is accepted." icon={FileUp} footer={<><Button variant="ghost" onClick={onClose} disabled={upload.isPending}>Cancel</Button><Button onClick={() => upload.mutate()} loading={upload.isPending} disabled={!!fileProblem || !!dateProblem}>Upload</Button></>}>
      <div className="space-y-3">
        <Field label="Document Type" required><Select value={f.documentType} onChange={(e) => setF({ ...f, documentType: e.target.value })}>{DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{title(t)}</option>)}</Select></Field>
        <Field label="File" required error={file ? fileProblem ?? undefined : undefined} hint="PDF, JPEG or PNG · up to 10 MB"><Input type="file" accept={ACCEPT.join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-auto py-1.5" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Document Number"><Input value={f.documentNumber} onChange={(e) => setF({ ...f, documentNumber: e.target.value })} maxLength={80} /></Field>
          <Field label="Issued On"><Input type="date" value={f.issuedAt} onChange={(e) => setF({ ...f, issuedAt: e.target.value })} /></Field>
          <Field label="Expires On" error={dateProblem ?? undefined}><Input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-grey-500">Documents are stored encrypted at rest and every view by the verification team is logged.</p>
      </div>
    </Dialog>
  );
}
