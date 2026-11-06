import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';

const mocks = vi.hoisted(() => ({
  request: vi.fn(), listener: null, auth: { currentUser: null, authStateReady: vi.fn() },
  onIdTokenChanged: vi.fn(), signOut: vi.fn(), createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(), updateProfile: vi.fn(), unsubscribe: vi.fn(),
  signInWithPopup: vi.fn(), setCustomParameters: vi.fn(),
}));
vi.mock('../lib/api', () => ({ request: mocks.request }));
vi.mock('../lib/firebase', async importOriginal => ({ ...await importOriginal(), getFirebaseAuth: () => mocks.auth }));
vi.mock('firebase/auth', () => ({ onIdTokenChanged: mocks.onIdTokenChanged, signOut: mocks.signOut,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword, signInWithEmailAndPassword: mocks.signInWithEmailAndPassword, updateProfile: mocks.updateProfile,
  signInWithPopup: mocks.signInWithPopup,
  GoogleAuthProvider: class { providerId = 'google.com'; setCustomParameters = mocks.setCustomParameters; },
}));

const profile = { id: 'firebase-qa-user', name: 'QA Student', email: 'qa@example.test' };
function SessionProbe() {
  const { user, loading, error, initialize, authenticate, logout } = useAuth();
  const [actionError, setActionError] = useState(null);
  return <>
    <p>{loading ? 'Loading session' : user ? user.name : 'Signed out'}</p>
    <button onClick={() => logout().catch(setActionError)}>Log out</button>
    <button onClick={initialize}>Retry</button>
    <button onClick={() => authenticate('register', { name: 'QA Student', email: 'QA@example.test', password: 'Password123' }).catch(setActionError)}>Register</button>
    <button onClick={() => { setActionError(null); void authenticate('google').catch(setActionError); }}>Google sign-in</button>
    {(error || actionError) && <p role="alert">{(error || actionError).message}</p>}
  </>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.currentUser = { uid: profile.id, getIdToken: vi.fn().mockResolvedValue('id-token') };
  mocks.auth.authStateReady.mockResolvedValue();
  mocks.request.mockResolvedValue({ data: profile });
  mocks.onIdTokenChanged.mockImplementation((_auth, listener) => {
    mocks.listener = listener;
    queueMicrotask(() => listener(mocks.auth.currentUser));
    return mocks.unsubscribe;
  });
  mocks.signOut.mockImplementation(async () => {
    mocks.auth.currentUser = null;
    mocks.listener?.(null);
  });
  mocks.updateProfile.mockResolvedValue();
});

it('restores a Firebase sign-in and loads the verified server profile', async () => {
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  expect(await screen.findByText('QA Student')).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith('/auth/me');
});

it('logout clears Firebase persistence and the authenticated view without a backend request', async () => {
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('QA Student');
  mocks.request.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(await screen.findByText('Signed out')).toBeInTheDocument();
  expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  expect(mocks.request).not.toHaveBeenCalled();
});

it('a Firebase logout failure stays visible without claiming success', async () => {
  mocks.signOut.mockRejectedValueOnce(new Error('Could not clear the local sign-in.'));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('QA Student');
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not clear the local sign-in.');
  expect(screen.getByText('QA Student')).toBeInTheDocument();
});

it('a delayed profile response cannot restore an account after logout', async () => {
  let finish;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Loading session');
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
  await act(async () => { finish({ data: profile }); });
  expect(screen.getByText('Signed out')).toBeInTheDocument();
  expect(screen.queryByText('QA Student')).not.toBeInTheDocument();
});

it('registration waits for the display name before opening the workspace', async () => {
  mocks.auth.currentUser = null;
  const account = { uid: profile.id, getIdToken: vi.fn().mockResolvedValue('updated-token') };
  mocks.createUserWithEmailAndPassword.mockImplementation(async () => {
    mocks.auth.currentUser = account;
    mocks.listener(account);
    return { user: account };
  });
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Signed out');
  await userEvent.click(screen.getByRole('button', { name: 'Register' }));
  expect(await screen.findByText('QA Student')).toBeInTheDocument();
  expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith(mocks.auth, 'qa@example.test', 'Password123');
  expect(mocks.updateProfile).toHaveBeenCalledWith(account, { displayName: 'QA Student' });
  expect(account.getIdToken).toHaveBeenCalledWith(true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.updateProfile.mock.invocationCallOrder[0]).toBeLessThan(mocks.request.mock.invocationCallOrder[0]);
});

it('startup API failures support retry while retaining the Firebase account', async () => {
  mocks.request.mockRejectedValueOnce(Object.assign(new Error('Workspace is temporarily unavailable.'), { status: 503 }));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Workspace is temporarily unavailable.');
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('QA Student')).toBeInTheDocument();
  expect(mocks.signOut).not.toHaveBeenCalled();
});

it('Google sign-in opens the workspace only after fetching the verified server profile', async () => {
  mocks.auth.currentUser = null;
  const account = { uid: profile.id };
  mocks.signInWithPopup.mockImplementation(async () => {
    mocks.auth.currentUser = account;
    mocks.listener(account);
    return { user: account };
  });
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Signed out');
  await userEvent.click(screen.getByRole('button', { name: 'Google sign-in' }));
  expect(await screen.findByText('QA Student')).toBeInTheDocument();
  expect(mocks.signInWithPopup).toHaveBeenCalledWith(mocks.auth, expect.objectContaining({ providerId: 'google.com' }));
  expect(mocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledWith('/auth/me');
  expect(mocks.updateProfile).not.toHaveBeenCalled();
});

it('a blocked Google popup leaves the app signed out and allows another attempt', async () => {
  mocks.auth.currentUser = null;
  mocks.signInWithPopup.mockRejectedValueOnce(Object.assign(new Error('Firebase error'), { code: 'auth/popup-blocked' }));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Signed out');
  await userEvent.click(screen.getByRole('button', { name: 'Google sign-in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Allow pop-ups for this site and try again.');
  expect(mocks.request).not.toHaveBeenCalled();
  expect(screen.getByText('Signed out')).toBeInTheDocument();
  mocks.signInWithPopup.mockImplementationOnce(async () => {
    mocks.auth.currentUser = { uid: profile.id };
    return { user: mocks.auth.currentUser };
  });
  await userEvent.click(screen.getByRole('button', { name: 'Google sign-in' }));
  expect(await screen.findByText('QA Student')).toBeInTheDocument();
});

it('Google sign-in signs back out if the server cannot verify its workspace profile', async () => {
  mocks.auth.currentUser = null;
  mocks.signInWithPopup.mockImplementationOnce(async () => {
    mocks.auth.currentUser = { uid: profile.id };
    return { user: mocks.auth.currentUser };
  });
  mocks.request.mockRejectedValueOnce(Object.assign(new Error('Workspace is temporarily unavailable.'), { status: 503 }));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Signed out');
  await userEvent.click(screen.getByRole('button', { name: 'Google sign-in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Workspace is temporarily unavailable.');
  expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  expect(screen.getByText('Signed out')).toBeInTheDocument();
  expect(screen.queryByText('QA Student')).not.toBeInTheDocument();
});

it.each([
  ['auth/popup-closed-by-user', 'Google sign-in was cancelled.'],
  ['auth/internal-error', 'Google sign-in could not start. Check your connection and try again.'],
  ['auth/operation-not-allowed', 'Google sign-in is not enabled'],
  ['auth/account-exists-with-different-credential', 'Please sign in using that method.'],
])('Google sign-in explains %s without making a profile request', async (code, message) => {
  mocks.auth.currentUser = null;
  mocks.signInWithPopup.mockRejectedValueOnce(Object.assign(new Error('Firebase error'), { code }));
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('Signed out');
  await userEvent.click(screen.getByRole('button', { name: 'Google sign-in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(screen.getByText('Signed out')).toBeInTheDocument();
});

it('an account change hides the previous profile and ignores its stale expiry events', async () => {
  render(<AuthProvider><SessionProbe /></AuthProvider>);
  await screen.findByText('QA Student');
  let finish;
  mocks.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => {
    mocks.auth.currentUser = { uid: 'another-user' };
    mocks.listener(mocks.auth.currentUser);
  });
  expect(screen.queryByText('QA Student')).not.toBeInTheDocument();
  await act(async () => {
    window.dispatchEvent(new CustomEvent('spendwise:session-expired', { detail: { uid: profile.id } }));
    finish({ data: { id: 'another-user', name: 'Another member' } });
  });
  expect(screen.getByText('Another member')).toBeInTheDocument();
  expect(mocks.signOut).not.toHaveBeenCalled();
});
