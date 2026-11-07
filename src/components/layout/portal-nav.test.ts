import { describe, expect, it } from 'vitest';
import { NAV, mobileNav, visibleNav } from './portal-nav';

const allow = (...caps: string[]) => (...wanted: string[]) => wanted.every((c) => caps.includes(c));
const hrefs = (items: ReturnType<typeof visibleNav>) => items.map((i) => i.href);

describe('portal navigation', () => {
  it('every link has a page under app/(portal) or app/', () => {
    // Keep this list in sync with the folders; a typo here would 404 for real users.
    const pages = ['/', '/analytics', '/verification', '/appointments', '/schedules', '/diagnostic-orders', '/pharmacy-orders', '/prescriptions', '/inventory', '/dispatch', '/fleet', '/profile', '/locations', '/services', '/affiliations', '/documents', '/staff', '/finance', '/notifications', '/account/password'];
    for (const item of NAV) expect(pages, item.label).toContain(item.href);
  });

  it('shows a pharmacy its stock and prescriptions but never appointments', () => {
    const items = hrefs(visibleNav('PHARMACY', allow('manage_bookings', 'review_prescriptions', 'manage_inventory')));
    expect(items).toContain('/pharmacy-orders');
    expect(items).toContain('/prescriptions');
    expect(items).toContain('/inventory');
    expect(items).not.toContain('/appointments');
    expect(items).not.toContain('/dispatch');
    expect(items).not.toContain('/services');
  });

  it('hides capability-gated items from a receptionist', () => {
    const items = hrefs(visibleNav('HOSPITAL', allow('manage_bookings')));
    expect(items).toContain('/appointments');
    expect(items).not.toContain('/schedules');
    expect(items).not.toContain('/staff');
    expect(items).not.toContain('/finance');
    expect(items).toContain('/documents');
  });

  it('labels affiliations differently for doctors and facilities', () => {
    const doctor = visibleNav('DOCTOR', allow('manage_affiliations')).find((i) => i.href === '/affiliations');
    const hospital = visibleNav('CLINIC', allow('manage_affiliations')).find((i) => i.href === '/affiliations');
    expect(doctor?.label).toBe('Hospitals & Clinics');
    expect(hospital?.label).toBe('Doctors');
    expect(visibleNav('PHARMACY', allow('manage_affiliations')).some((i) => i.href === '/affiliations')).toBe(false);
  });

  it('applies super-admin renames and hides, but never hides Home', () => {
    const items = visibleNav('HOSPITAL', allow('manage_bookings'), { '/appointments': { label: 'OPD Bookings' }, '/documents': { hidden: true }, '/': { hidden: true } });
    expect(items.find((i) => i.href === '/appointments')?.label).toBe('OPD Bookings');
    expect(hrefs(items)).not.toContain('/documents');
    expect(hrefs(items)[0]).toBe('/');
  });

  it('keeps the phone bottom bar to five items with Home first', () => {
    const bar = mobileNav(visibleNav('AMBULANCE_OPERATOR', allow('manage_dispatch', 'view_finance', 'manage_bookings')));
    expect(bar.length).toBeLessThanOrEqual(5);
    expect(bar[0]?.href).toBe('/');
    expect(hrefs(bar)).toContain('/dispatch');
  });
});
