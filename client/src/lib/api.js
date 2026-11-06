import { authErrorMessage, getFirebaseAuth } from './firebase';

// Vercel serves the browser and /api on one origin. Runtime service bindings
// cannot be read by this static bundle; VITE_API_URL is only for separate hosts.
const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const expiredCodes = new Set(['auth/user-token-expired', 'auth/invalid-user-token', 'auth/user-disabled', 'auth/user-not-found']);

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function expireSession(auth, account) {
  if (account && auth.currentUser?.uid === account.uid) {
    window.dispatchEvent(new CustomEvent('spendwise:session-expired', { detail: { uid: account.uid } }));
  }
}

export async function request(path, options = {}) {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const account = auth.currentUser;
  const method = options.method || 'GET';
  for (let attempt = 0; attempt < 2; attempt++) {
    const headers = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (account) {
      if (auth.currentUser?.uid !== account.uid) throw new ApiError('Your sign-in changed. Please try again.', 401, 'AUTH_CHANGED');
      try { headers.Authorization = `Bearer ${await account.getIdToken(attempt > 0)}`; }
      catch (error) {
        const expired = expiredCodes.has(error.code);
        if (expired) expireSession(auth, account);
        throw new ApiError(authErrorMessage(error), expired ? 401 : 0, error.code);
      }
    }
    let response;
    try {
      response = await fetch(`${baseUrl}/api${path}`, {
        ...options, method, headers, credentials: 'omit',
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError('Cannot connect to SpendWise. Check that the server is running and try again.', 0, 'NETWORK_ERROR');
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    // Firebase normally refreshes automatically. Retry once if the server
    // rejects a token, then clear only the account that made this request.
    if (response.status === 401 && account && attempt === 0) continue;
    if (!response.ok) {
      if (response.status === 401) expireSession(auth, account);
      throw new ApiError(payload?.error?.message || 'Something went wrong. Please try again.', response.status, payload?.error?.code, payload?.error?.details);
    }
    if (response.status !== 204 && payload === null) throw new ApiError('The server returned an invalid response. Please try again.', 502, 'INVALID_RESPONSE');
    return payload;
  }
}

export function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  });
  return params.toString();
}
