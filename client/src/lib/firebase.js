import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

let auth;
export function getFirebaseAuth() {
  if (auth) return auth;
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error('Firebase is not configured. Fill in the root .env file and restart SpendWise.');
  }
  const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
  if (useEmulators && !config.projectId.startsWith('demo-')) throw new Error('Firebase emulators require a demo-* project.');
  const app = getApps().length ? getApp() : initializeApp(config);
  const instance = getAuth(app);
  if (useEmulators && !instance.emulatorConfig) {
    const url = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
    if (!/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(url)) throw new Error('The Firebase Auth emulator must use a local address.');
    connectAuthEmulator(instance, url, { disableWarnings: true });
  }
  auth = instance;
  return auth;
}

export function authErrorMessage(error, mode = 'login') {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-login-credentials': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a stronger password with at least 8 characters, a letter, and a number.',
    'auth/password-does-not-meet-requirements': 'This password does not meet the account security requirements. Choose a stronger password.',
    'auth/too-many-requests': 'Too many attempts. Please wait a little and try again.',
    'auth/network-request-failed': 'Cannot reach Firebase. Check your internet connection and try again.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': mode === 'google' ? 'Google sign-in is not enabled for this Firebase project.' : 'Email/password sign-in is not enabled for this Firebase project.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled. You can try again.',
    'auth/cancelled-popup-request': 'Another sign-in window was opened. Please use the latest window.',
    'auth/internal-error': mode === 'google' ? 'Google sign-in could not start. Check your connection and try again.' : 'Could not sign in. Please try again.',
    'auth/account-exists-with-different-credential': 'An account with this email uses another sign-in method. Please sign in using that method.',
    'auth/invalid-api-key': 'The Firebase web configuration is invalid. Check the root .env file.',
    'auth/unauthorized-domain': 'This website address is not authorized in Firebase Authentication.',
    'auth/user-token-expired': 'Your sign-in expired. Please sign in again.',
    'auth/invalid-user-token': 'Your sign-in expired. Please sign in again.',
  };
  return messages[error.code] || (error.code?.startsWith('auth/') ? 'Could not sign in. Please try again.' : error.message);
}
