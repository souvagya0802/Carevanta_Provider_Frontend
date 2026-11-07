import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, SESSION_RETRY, api, session } from './api';

const KEY = 'carevanta.refreshToken';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('token refresh', () => {
  beforeEach(() => {
    session.clear();
    localStorage.setItem(KEY, 'rt-1');
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([429, 500, 503])('keeps the session when refresh answers %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json(status, { error: { code: 'X', message: 'busy' } }) : json(200, { data: {} }))));
    const err = await api.get('/auth/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe(SESSION_RETRY);
    expect(localStorage.getItem(KEY)).toBe('rt-1');
  });

  it('keeps the session on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await api.get('/auth/me').catch(() => undefined);
    expect(localStorage.getItem(KEY)).toBe('rt-1');
  });

  it.each([401, 403])('signs out when refresh answers %i', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json(status, { error: { code: 'UNAUTHENTICATED', message: 'no' } }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }))));
    const signedOut = vi.fn();
    const off = session.subscribe((s) => { if (!s) signedOut(); });
    await api.get('/auth/me').catch(() => undefined);
    off();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(signedOut).toHaveBeenCalled();
  });

  it('uses the new tokens after a successful refresh', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) return json(200, { data: { accessToken: 'at-2', refreshToken: 'rt-2' } });
      return (init?.headers as Record<string, string>)?.authorization === 'Bearer at-2' ? json(200, { data: { ok: true } }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(api.get<{ data: { ok: boolean } }>('/auth/me')).resolves.toEqual({ data: { ok: true } });
    expect(localStorage.getItem(KEY)).toBe('rt-2');
  });
});
