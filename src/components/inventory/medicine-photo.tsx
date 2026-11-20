'use client';

import { createElement, useRef } from 'react';
import { Camera, Droplet, FlaskConical, ImagePlus, Lock, Package, Pill, Pipette, Syringe, Tablets, Wind, type LucideIcon } from 'lucide-react';
import { API_BASE, request } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { useToast } from '@/components/ui/toast';
import { Button, cx } from '@/components/ui/primitives';

/** Who may change a medicine's photo, from this pharmacy's point of view. */
export type PhotoOwner = 'none' | 'mine' | 'carevanta' | 'other';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 2 * 1024 * 1024;

/** From the picker fields (imageUrl, imageSource, imageProviderId). Mirrors the API rule. */
export function photoOwnerOf(m: { imageUrl?: string | null; imageSource?: string | null; imageProviderId?: string | null }, providerId: string): PhotoOwner {
  if (!m.imageUrl) return 'none';
  if (m.imageSource === 'PROVIDER') return m.imageProviderId === providerId ? 'mine' : 'other';
  return 'carevanta';
}

/** Neutral placeholder by dosage form when there is no photo. */
export function formIcon(form: string | null | undefined): LucideIcon {
  const f = (form ?? '').toLowerCase();
  if (/capsule/.test(f)) return Pill;
  if (/tablet|lozenge/.test(f)) return Tablets;
  if (/syrup|suspension|solution|liquid|elixir|mixture/.test(f)) return FlaskConical;
  if (/inject|vial|ampoule|infusion/.test(f)) return Syringe;
  if (/cream|ointment|gel|lotion/.test(f)) return Droplet;
  if (/inhal|rotacap|respule/.test(f)) return Wind;
  if (/drop/.test(f)) return Pipette;
  return Package;
}

export function MedicineThumb({ imageUrl, dosageForm, name, size = 'md' }: { imageUrl?: string | null; dosageForm?: string | null; name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- API-served, versioned URL
    return <img src={imageUrl.startsWith('http') ? imageUrl : `${API_BASE}${imageUrl}`} alt={`Photo of ${name}`} loading="lazy" className={cx(dim, 'shrink-0 rounded-[5px] border border-grey-200 bg-paper object-contain')} />;
  }
  return (
    <span aria-hidden className={cx(dim, 'inline-flex shrink-0 items-center justify-center rounded-[5px] border border-grey-200 bg-grey-50 text-grey-400')}>
      {createElement(formIcon(dosageForm), { size: size === 'sm' ? 14 : 18 })}
    </span>
  );
}

/**
 * "Add Photo" when there is none, "Change Photo" when this pharmacy added it, otherwise a disabled note.
 * Opens the camera on phones (capture="environment"); JPEG, PNG or WebP up to 2 MB. Live at once.
 */
export function PhotoButton({ providerId, medicineId, owner, onSaved, invalidate = [] }: { providerId: string; medicineId: string; owner: PhotoOwner; onSaved?: (imageUrl: string | null) => void; invalidate?: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const upload = useAction(
    (file: File) => request<{ data: { imageUrl: string | null } }>(`/portal/providers/${providerId}/medicines/${medicineId}/image`, { method: 'PUT', raw: { data: file, contentType: file.type } }),
    { success: 'Photo saved', invalidate: [`/portal/providers/${providerId}/inventory`, ...invalidate], onSuccess: (res) => onSaved?.(res.data.imageUrl) },
  );
  if (owner === 'carevanta' || owner === 'other') {
    return (
      <Button size="sm" variant="ghost" disabled title={owner === 'carevanta' ? 'Carevanta set this photo' : 'Another pharmacy added this photo'}>
        <Lock size={12} aria-hidden /> {owner === 'carevanta' ? 'Photo Set By Carevanta' : 'Photo Already Added'}
      </Button>
    );
  }
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error(new Error('Choose a JPEG, PNG or WebP photo'));
    if (file.size > MAX) return toast.error(new Error('The photo must be 2 MB or smaller. Try a lower camera resolution.'));
    upload.mutate(file);
  };
  return (
    <>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={upload.isPending} title="JPEG, PNG or WebP, up to 2 MB">
        {owner === 'none' ? <Camera size={12} aria-hidden /> : <ImagePlus size={12} aria-hidden />} {owner === 'none' ? 'Add Photo' : 'Change Photo'}
      </Button>
    </>
  );
}
