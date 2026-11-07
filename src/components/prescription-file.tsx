'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/**
 * The uploaded prescription (image or PDF), fetched with the bearer token as
 * a Blob. Blob URLs are created only where they are used (an effect writing
 * the <img> src, or a click opening a new tab) and revoked afterwards, so no
 * patient document stays addressable in the page.
 */
export function PrescriptionFile({ providerId, prescriptionId }: { providerId: string; prescriptionId: string }) {
  const toast = useToast();
  const path = `/portal/providers/${providerId}/prescriptions/${prescriptionId}/file`;
  const file = useQuery({
    queryKey: ['rx-file', path],
    queryFn: async () => (await api.blob(path)).blob,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });
  const blob = file.data;
  const isImage = !!blob && blob.type.startsWith('image/');
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!blob || !blob.type.startsWith('image/')) return;
    const url = URL.createObjectURL(blob);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const openInTab = () => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) toast.error(new Error('Allow pop-ups for this site to open the prescription'));
    // The new tab has loaded the document by then; free the memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (file.isPending) return <Skeleton rows={3} />;
  if (file.isError) {
    const missing = file.error instanceof ApiError && file.error.status === 404;
    return (
      <div role="status" className="rounded-lg border border-orange/30 bg-orange-soft p-3 text-xs text-grey-700">
        {missing ? 'The prescription file is not available here yet. Ask the patient to show it, or check again shortly.' : `Could not load the prescription: ${file.error instanceof Error ? file.error.message : 'unknown error'}`}
        {!missing && <Button size="sm" variant="secondary" className="mt-2" onClick={() => void file.refetch()}>Try Again</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private blob, not an optimisable asset
        <img ref={imgRef} alt="Uploaded prescription" className="max-h-[50vh] w-full rounded-lg border border-grey-200 bg-grey-50 object-contain" />
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-grey-200 bg-grey-50 p-3">
          <FileText size={20} className="shrink-0 text-grey-500" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">{blob?.type === 'application/pdf' ? 'Prescription (PDF)' : 'Prescription file'}</p>
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={openInTab}><ExternalLink size={14} /> {isImage ? 'Open Full Size' : 'Open'}</Button>
    </div>
  );
}
