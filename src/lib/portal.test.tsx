import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalProvider, usePortal, type Membership } from './portal';

const me = { id: 'u1', fullName: 'Owner', email: 'o@x', phone: null, status: 'ACTIVE', mustChangePassword: false, roles: [] as string[], permissions: [] as string[] };
vi.mock('./auth', () => ({ useAuth: () => ({ me }) }));

const hospital: Membership = { providerId: 'h1', displayName: 'Tamluk General', type: 'HOSPITAL', status: 'APPROVED', isListed: true, memberRole: 'OWNER', capabilities: ['manage_profile', 'manage_staff', 'view_finance'], joinedAt: null };
const practice: Membership = { providerId: 'd1', displayName: 'Dr. Sen', type: 'DOCTOR', status: 'APPROVED', isListed: true, memberRole: 'OWNER', capabilities: ['manage_profile', 'manage_schedules'], joinedAt: null };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A signed-in browser: a stored refresh token, a refresh endpoint and /portal/me. */
function mockMe(memberships: Membership[]) {
  window.localStorage.setItem('carevanta.refreshToken', 'r');
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/refresh')) return Promise.resolve(json({ data: { accessToken: 'a', refreshToken: 'r' } }));
    if (url.includes('/portal/me')) return Promise.resolve(json({ data: { memberships, ownDoctorProviderId: 'd1' } }));
    if (url.includes('/portal/config')) return Promise.resolve(json({ data: { announcement: null, support: {}, types: { DOCTOR: { words: { noun: 'clinic' } } }, emergencyNumber: '112' } }));
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `unmocked ${url}` } }), { status: 404, headers: { 'content-type': 'application/json' } }));
  }));
}

function Probe() {
  const { org, can, switchOrg, memberships } = usePortal();
  return (
    <div>
      <p data-testid="org">{org?.displayName ?? 'none'}</p>
      <p data-testid="finance">{can('view_finance') ? 'yes' : 'no'}</p>
      {memberships.map((m) => <button key={m.providerId} onClick={() => switchOrg(m.providerId)}>{m.displayName}</button>)}
    </div>
  );
}

const renderProbe = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PortalProvider><Probe /></PortalProvider></QueryClientProvider>);

describe('portal context', () => {
  afterEach(() => { vi.unstubAllGlobals(); me.permissions = []; });

  it('defaults to the first membership and switches organisations', async () => {
    mockMe([hospital, practice]);
    renderProbe();
    expect(await screen.findByText('Tamluk General', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('finance')).toHaveTextContent('yes');
    await userEvent.click(screen.getByRole('button', { name: 'Dr. Sen' }));
    expect(screen.getByTestId('org')).toHaveTextContent('Dr. Sen');
    expect(screen.getByTestId('finance')).toHaveTextContent('no');
    expect(window.localStorage.getItem('carevanta.portal.activeProvider')).toBe('d1');
  });

  it('remembers the last organisation only while the person still belongs to it', async () => {
    window.localStorage.setItem('carevanta.portal.activeProvider', 'd1');
    mockMe([hospital, practice]);
    const first = renderProbe();
    expect(await screen.findByText('Dr. Sen', { selector: 'p' })).toBeInTheDocument();
    first.unmount();
    vi.unstubAllGlobals();
    window.localStorage.setItem('carevanta.portal.activeProvider', 'gone');
    mockMe([hospital]);
    renderProbe();
    expect(await screen.findByText('Tamluk General', { selector: 'p' })).toBeInTheDocument();
  });

  it('lets platform staff act everywhere', async () => {
    me.permissions = ['providers.read'];
    mockMe([{ ...practice, capabilities: [] }]);
    renderProbe();
    expect(await screen.findByText('Dr. Sen', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('finance')).toHaveTextContent('yes');
  });
});
