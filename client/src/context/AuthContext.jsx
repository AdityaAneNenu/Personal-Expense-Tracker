import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
import { request } from '../lib/api';
import { authErrorMessage, getFirebaseAuth } from '../lib/firebase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const generation = useRef(0);
  const manualAuth = useRef(false);
  const activeUid = useRef(null);
  const mounted = useRef(false);
  const invalidateRequests = useCallback(() => { generation.current++; }, []);

  const synchronize = useCallback(async account => {
    const attempt = ++generation.current;
    if (!account) {
      activeUid.current = null;
      setUser(null); setError(null); setLoading(false);
      return;
    }
    if (activeUid.current !== account.uid) {
      activeUid.current = account.uid;
      setUser(null); setLoading(true);
    }
    try {
      const response = await request('/auth/me');
      if (mounted.current && attempt === generation.current) {
        setUser(response.data); setError(null);
      }
    } catch (err) {
      if (mounted.current && attempt === generation.current) {
        setUser(null); setError(err.status === 401 ? null : err);
      }
    } finally {
      if (mounted.current && attempt === generation.current) setLoading(false);
    }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const auth = getFirebaseAuth();
      await auth.authStateReady();
      await synchronize(auth.currentUser);
    } catch (err) { setError(err); setLoading(false); }
  }, [synchronize]);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe = () => {};
    let auth;
    try {
      auth = getFirebaseAuth();
      unsubscribe = onIdTokenChanged(auth, account => {
        if (!manualAuth.current) void synchronize(account);
      }, err => { setError(new Error(authErrorMessage(err))); setLoading(false); });
    } catch (err) { setError(err); setLoading(false); }
    const expired = event => {
      if (!auth || auth.currentUser?.uid !== event.detail?.uid) return;
      generation.current++;
      activeUid.current = null;
      setUser(null); setError(null); setLoading(false);
      void signOut(auth).catch(err => { if (mounted.current) setError(new Error(authErrorMessage(err))); });
    };
    window.addEventListener('spendwise:session-expired', expired);
    return () => {
      mounted.current = false; invalidateRequests();
      unsubscribe();
      window.removeEventListener('spendwise:session-expired', expired);
    };
  }, [synchronize, invalidateRequests]);

  async function authenticate(mode, form = {}) {
    if (manualAuth.current) throw new Error('A sign-in attempt is already in progress.');
    const auth = getFirebaseAuth();
    const attempt = ++generation.current;
    manualAuth.current = true;
    let credential;
    try {
      if (mode === 'google') {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        credential = await signInWithPopup(auth, provider);
      } else if (mode === 'register') {
        credential = await createUserWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password);
        await updateProfile(credential.user, { displayName: form.name.trim() });
        await credential.user.getIdToken(true);
      } else {
        credential = await signInWithEmailAndPassword(auth, form.email.trim().toLowerCase(), form.password);
      }
      const response = await request('/auth/me');
      if (!mounted.current || attempt !== generation.current || auth.currentUser?.uid !== credential.user.uid) throw new Error('Your sign-in changed. Please try again.');
      activeUid.current = credential.user.uid;
      setUser(response.data); setError(null); setLoading(false);
      return response.data;
    } catch (err) {
      if (credential && auth.currentUser?.uid === credential.user.uid) await signOut(auth).catch(() => {});
      throw Object.assign(new Error(authErrorMessage(err, mode)), { code: err.code, status: err.status });
    } finally { manualAuth.current = false; }
  }

  async function logout() {
    const auth = getFirebaseAuth();
    generation.current++;
    await signOut(auth);
    activeUid.current = null;
    setUser(null); setError(null); setLoading(false);
  }

  return <AuthContext.Provider value={{ user, loading, error, initialize, authenticate, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
