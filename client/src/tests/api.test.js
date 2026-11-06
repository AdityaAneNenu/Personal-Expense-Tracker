import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { request } from '../lib/api';

const mocks = vi.hoisted(() => ({ auth: { currentUser: null, authStateReady: vi.fn() }, token: vi.fn() }));
vi.mock('../lib/firebase', () => ({ getFirebaseAuth: () => mocks.auth, authErrorMessage: error => error.message }));
const reply = (status, body = { data: {} }) => new Response(status === 204 ? null : JSON.stringify(body), { status });
let expired;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.currentUser = { uid: 'firebase-user', getIdToken: mocks.token };
  mocks.auth.authStateReady.mockResolvedValue();
  mocks.token.mockResolvedValue('valid-token');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200)));
  expired = vi.fn();
  window.addEventListener('spendwise:session-expired', expired);
});

afterEach(() => {
  window.removeEventListener('spendwise:session-expired', expired);
  vi.unstubAllGlobals();
});

it('authenticates JSON writes with Firebase bearer tokens and omits cookies', async () => {
  fetch.mockResolvedValueOnce(reply(201, { data: { id: 'firestore-doc' } }));
  const result = await request('/transactions', { method: 'POST', body: { amount: 12.34 } });
  expect(result.data.id).toBe('firestore-doc');
  expect(fetch).toHaveBeenCalledWith('/api/transactions', expect.objectContaining({
    method: 'POST', credentials: 'omit', body: '{"amount":12.34}',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
  }));
});

it('refreshes a rejected ID token once and retries the original request', async () => {
  mocks.token.mockResolvedValueOnce('old-token').mockResolvedValueOnce('fresh-token');
  fetch.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, { data: ['saved'] }));
  expect(await request('/transactions')).toEqual({ data: ['saved'] });
  expect(mocks.token.mock.calls).toEqual([[false], [true]]);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  expect(expired).not.toHaveBeenCalled();
});

it('a second rejection expires the same account and does not loop', async () => {
  fetch.mockImplementation(async () => reply(401, { error: { message: 'Sign in again.', code: 'UNAUTHENTICATED' } }));
  await expect(request('/transactions')).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(expired).toHaveBeenCalledTimes(1);
  expect(expired.mock.calls[0][0].detail.uid).toBe('firebase-user');
});

it('a network failure during token refresh does not sign the user out', async () => {
  fetch.mockResolvedValueOnce(reply(401));
  mocks.token.mockResolvedValueOnce('old-token').mockRejectedValueOnce(Object.assign(new Error('Offline'), { code: 'auth/network-request-failed' }));
  await expect(request('/transactions')).rejects.toMatchObject({ status: 0 });
  expect(expired).not.toHaveBeenCalled();
});

it('a request from an old account cannot retry using a newly signed-in account', async () => {
  fetch.mockImplementationOnce(async () => {
    mocks.auth.currentUser = { uid: 'new-user', getIdToken: vi.fn() };
    return reply(401);
  });
  await expect(request('/transactions', { method: 'DELETE' })).rejects.toMatchObject({ code: 'AUTH_CHANGED' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(expired).not.toHaveBeenCalled();
});

it('permission failures are not retried and aborted requests remain abortable', async () => {
  fetch.mockResolvedValueOnce(reply(403));
  await expect(request('/transactions')).rejects.toMatchObject({ status: 403 });
  expect(fetch).toHaveBeenCalledTimes(1);
  const abort = new DOMException('Aborted', 'AbortError');
  fetch.mockRejectedValueOnce(abort);
  await expect(request('/transactions')).rejects.toBe(abort);
  expect(expired).not.toHaveBeenCalled();
});
