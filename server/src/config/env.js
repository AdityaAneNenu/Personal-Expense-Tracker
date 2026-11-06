import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
// Tests receive an isolated demo project from the emulator runner. Never load
// live credentials into a test process.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}

const vercel = process.env.VERCEL === '1';
const deploymentOrigin = vercel && process.env.VERCEL_ENV !== 'development' && process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}` : undefined;

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  vercel,
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || deploymentOrigin || 'http://localhost:5173',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
    databaseId: process.env.FIREBASE_DATABASE_ID || '(default)',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    authEmulator: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    firestoreEmulator: process.env.FIRESTORE_EMULATOR_HOST,
  },
};
// Permit this deployment's exact URL as well as an explicitly configured domain.
// Never allow arbitrary *.vercel.app origins.
env.allowedOrigins = [...new Set([env.clientOrigin, deploymentOrigin].filter(Boolean))];

if (!env.firebase.projectId) throw new Error('Set FIREBASE_PROJECT_ID in the root .env file.');
if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) throw new Error('PORT must be a valid TCP port.');
if (!/^https?:\/\/[^/]+$/.test(env.clientOrigin)) throw new Error('CLIENT_ORIGIN must be an HTTP(S) origin without a trailing slash.');
if (env.nodeEnv === 'production' && !env.clientOrigin.startsWith('https://')) throw new Error('Production requires an HTTPS CLIENT_ORIGIN.');

const usingEmulators = Boolean(env.firebase.authEmulator || env.firebase.firestoreEmulator);
if (usingEmulators || env.nodeEnv === 'test') {
  if (!env.firebase.projectId.startsWith('demo-') || !env.firebase.authEmulator || !env.firebase.firestoreEmulator) {
    throw new Error('Firebase tests/emulators require a demo-* project and BOTH Auth and Firestore emulator hosts.');
  }
  for (const host of [env.firebase.authEmulator, env.firebase.firestoreEmulator]) {
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) throw new Error('Firebase emulators must run on loopback addresses.');
  }
  if (env.nodeEnv === 'production') throw new Error('Production cannot use Firebase emulators.');
}
