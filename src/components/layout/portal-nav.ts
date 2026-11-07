import {
  Activity, Ambulance, BadgeCheck, Banknote, BarChart3, Bell, Building2, CalendarCheck, CalendarDays, ClipboardList, FileText, FlaskConical, LayoutDashboard, Link2, MapPin, Package, Pill, ScrollText, Settings, Stethoscope, Users, type LucideIcon,
} from 'lucide-react';

/**
 * Navigation is derived from three things: what kind of organisation is
 * active (a pharmacy has stock, a lab has reports), what the member's role
 * allows, and what the platform's super-admin has configured for that
 * provider type (renamed or hidden pages). Items whose capability the person
 * lacks are hidden; the API enforces them regardless.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: string;
  /** Provider types the item applies to; empty = all. */
  types: string[];
  /** Any one of these capabilities shows the item; empty = every member. */
  capabilities: string[];
  /** Shown in the phone bottom bar (max 4 besides Home). */
  mobile?: boolean;
}
export type NavOverrides = Record<string, { label?: string; hidden?: boolean }>;

const FACILITIES = ['HOSPITAL', 'CLINIC'];
const DIAGNOSTICS = ['DIAGNOSTIC_LAB', 'IMAGING_CENTRE'];

export const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: LayoutDashboard, group: 'Overview', types: [], capabilities: [], mobile: true },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, group: 'Overview', types: [], capabilities: [] },
  { href: '/verification', label: 'Verification', icon: BadgeCheck, group: 'Overview', types: [], capabilities: [] },

  { href: '/appointments', label: 'Appointments', icon: CalendarCheck, group: 'Day to Day', types: ['DOCTOR', ...FACILITIES], capabilities: ['manage_bookings'], mobile: true },
  { href: '/schedules', label: 'Schedules & Slots', icon: CalendarDays, group: 'Day to Day', types: ['DOCTOR', ...FACILITIES], capabilities: ['manage_schedules'] },
  { href: '/diagnostic-orders', label: 'Orders & Reports', icon: FlaskConical, group: 'Day to Day', types: DIAGNOSTICS, capabilities: ['manage_bookings', 'publish_reports'], mobile: true },
  { href: '/pharmacy-orders', label: 'Orders', icon: Package, group: 'Day to Day', types: ['PHARMACY'], capabilities: ['manage_bookings'], mobile: true },
  { href: '/prescriptions', label: 'Prescriptions', icon: ScrollText, group: 'Day to Day', types: ['PHARMACY'], capabilities: ['review_prescriptions'] },
  { href: '/inventory', label: 'Stock', icon: Pill, group: 'Day to Day', types: ['PHARMACY'], capabilities: ['manage_inventory'], mobile: true },
  { href: '/dispatch', label: 'Dispatch', icon: Activity, group: 'Day to Day', types: ['AMBULANCE_OPERATOR'], capabilities: ['manage_dispatch'], mobile: true },
  { href: '/fleet', label: 'Vehicles & Crew', icon: Ambulance, group: 'Day to Day', types: ['AMBULANCE_OPERATOR'], capabilities: [] },

  { href: '/profile', label: 'Profile', icon: Building2, group: 'Organisation', types: [], capabilities: [] },
  { href: '/locations', label: 'Locations & Hours', icon: MapPin, group: 'Organisation', types: [], capabilities: [] },
  { href: '/services', label: 'Services & Prices', icon: ClipboardList, group: 'Organisation', types: [...FACILITIES, ...DIAGNOSTICS], capabilities: [] },
  { href: '/affiliations', label: 'Doctors', icon: Stethoscope, group: 'Organisation', types: FACILITIES, capabilities: ['manage_affiliations'] },
  { href: '/affiliations', label: 'Hospitals & Clinics', icon: Link2, group: 'Organisation', types: ['DOCTOR'], capabilities: ['manage_affiliations'] },
  { href: '/documents', label: 'Documents', icon: FileText, group: 'Organisation', types: [], capabilities: [] },
  { href: '/staff', label: 'Staff', icon: Users, group: 'Organisation', types: [], capabilities: ['manage_staff'] },

  { href: '/finance', label: 'Earnings & Payouts', icon: Banknote, group: 'Money', types: [], capabilities: ['view_finance'], mobile: true },
  { href: '/notifications', label: 'Notifications', icon: Bell, group: 'Account', types: [], capabilities: [] },
  { href: '/account/password', label: 'Account', icon: Settings, group: 'Account', types: [], capabilities: [] },
];

export const NAV_GROUPS = ['Overview', 'Day to Day', 'Organisation', 'Money', 'Account'];

/** Items for this organisation type and role, with any super-admin renames/hides applied. Home can never be hidden. */
export function visibleNav(type: string, can: (...caps: string[]) => boolean, overrides: NavOverrides = {}): NavItem[] {
  return NAV
    .filter((i) => (i.types.length === 0 || i.types.includes(type)) && (i.capabilities.length === 0 || i.capabilities.some((c) => can(c))))
    .filter((i) => i.href === '/' || !overrides[i.href]?.hidden)
    .map((i) => (overrides[i.href]?.label ? { ...i, label: overrides[i.href]!.label! } : i));
}

/** Up to five items for the phone bottom bar, keeping the order above. */
export function mobileNav(items: NavItem[]): NavItem[] {
  return items.filter((i) => i.mobile).slice(0, 5);
}
