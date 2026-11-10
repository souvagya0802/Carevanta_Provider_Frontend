'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { PageCopyContext } from '@/components/ui/primitives';

/**
 * Which organisation the signed-in person is acting for. A user can belong to
 * several providers (a doctor with their own practice who also administers a
 * clinic), so the active one is chosen here and remembered per browser.
 *
 * The portal's wording and structure can be adjusted by the platform's
 * super-admin (Settings → Provider Portal); that configuration is loaded here
 * and applied to navigation labels, page titles and organisation words.
 */
export interface Membership {
  providerId: string;
  displayName: string;
  type: string;
  status: string;
  isListed: boolean;
  memberRole: string;
  capabilities: string[];
  joinedAt: string | null;
  /** Doctor practices only: speciality names, primary first. Empty for facilities. */
  specialities: string[];
}
interface PortalMe { memberships: Membership[]; ownDoctorProviderId: string | null }

export interface TypeWords { noun: string; locationNoun: string; locationsTitle: string }
export interface PortalUi {
  announcement: { text: string; tone: string; until?: string; link?: string } | null;
  support: { email?: string; phone?: string; helpUrl?: string; hours?: string };
  types: Record<string, { words?: Partial<TypeWords>; nav?: Record<string, { label?: string; hidden?: boolean }>; pages?: Record<string, { title?: string; description?: string }> }>;
  emergencyNumber: string;
}
const EMPTY_UI: PortalUi = { announcement: null, support: {}, types: {}, emergencyNumber: '112' };

interface PortalState {
  loading: boolean;
  error: unknown;
  memberships: Membership[];
  org: Membership | null;
  ownDoctorProviderId: string | null;
  ui: PortalUi;
  /** True when the active membership grants the capability (platform staff see everything). */
  can: (...capabilities: string[]) => boolean;
  switchOrg: (providerId: string) => void;
  refresh: () => Promise<unknown>;
}

const ACTIVE_KEY = 'carevanta.portal.activeProvider';
const PortalContext = createContext<PortalState | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const query = useQuery({ queryKey: ['get', '/portal/me'], queryFn: () => api.get<{ data: PortalMe }>('/portal/me').then((r) => r.data), enabled: !!me, staleTime: 60_000 });
  // Configuration is optional: if it cannot be loaded the portal simply uses its shipped wording.
  const config = useQuery({ queryKey: ['get', '/portal/config'], queryFn: () => api.get<{ data: PortalUi }>('/portal/config').then((r) => r.data), enabled: !!me, staleTime: 5 * 60_000, retry: 1 });
  // The last organisation the person worked in is remembered per browser; it is
  // only honoured if they still belong to it, otherwise the first membership wins.
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
  });

  const switchOrg = useCallback((providerId: string) => {
    setActiveId(providerId);
    try { localStorage.setItem(ACTIVE_KEY, providerId); } catch { /* ignore */ }
  }, []);

  const value = useMemo<PortalState>(() => {
    const memberships = query.data?.memberships ?? [];
    const org = memberships.find((m) => m.providerId === activeId) ?? memberships[0] ?? null;
    const platformStaff = !!me && me.permissions.includes('providers.read');
    return {
      loading: !me || query.isPending,
      error: query.error,
      memberships,
      org,
      ownDoctorProviderId: query.data?.ownDoctorProviderId ?? null,
      ui: config.data ?? EMPTY_UI,
      can: (...caps) => platformStaff || (!!org && caps.every((c) => org.capabilities.includes(c))),
      switchOrg,
      refresh: () => query.refetch(),
    };
  }, [query, config.data, activeId, me, switchOrg]);

  const pageCopy = value.org ? (value.ui.types[value.org.type]?.pages ?? null) : null;
  return (
    <PortalContext.Provider value={value}>
      <PageCopyContext.Provider value={pageCopy}>{children}</PageCopyContext.Provider>
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalState {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}

/** The active organisation, or throws — for pages that only render inside the shell. */
export function useOrg(): Membership {
  const { org } = usePortal();
  if (!org) throw new Error('No active organisation');
  return org;
}

/** Friendly words per provider type, used in headings and empty states. */
export const TYPE_WORDS: Record<string, TypeWords> = {
  DOCTOR: { noun: 'practice', locationNoun: 'chamber', locationsTitle: 'Practice Locations' },
  HOSPITAL: { noun: 'hospital', locationNoun: 'branch', locationsTitle: 'Campus & Branches' },
  CLINIC: { noun: 'clinic', locationNoun: 'branch', locationsTitle: 'Clinic Locations' },
  DIAGNOSTIC_LAB: { noun: 'laboratory', locationNoun: 'centre', locationsTitle: 'Laboratory & Collection Centres' },
  IMAGING_CENTRE: { noun: 'imaging centre', locationNoun: 'centre', locationsTitle: 'Imaging Centres' },
  PHARMACY: { noun: 'pharmacy', locationNoun: 'store', locationsTitle: 'Store Locations' },
  AMBULANCE_OPERATOR: { noun: 'ambulance service', locationNoun: 'base station', locationsTitle: 'Base Stations' },
};
const GENERIC_WORDS: TypeWords = { noun: 'organisation', locationNoun: 'location', locationsTitle: 'Locations' };
export const typeWords = (type: string, overrides?: Partial<TypeWords>): TypeWords => ({ ...(TYPE_WORDS[type] ?? GENERIC_WORDS), ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, v]) => !!v)) });

/** Words for a provider type with the super-admin's overrides applied. */
export function useTypeWords(type: string): TypeWords {
  const { ui } = usePortal();
  return typeWords(type, ui.types[type]?.words);
}
