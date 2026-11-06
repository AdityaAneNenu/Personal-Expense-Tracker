import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationDefault, cert, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { env, projectRoot } from './env.js';

function credentials() {
  if (env.firebase.authEmulator) return undefined;
  if (env.firebase.serviceAccountPath) {
    const file = resolve(projectRoot, env.firebase.serviceAccountPath);
    let account;
    try { account = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('Cannot read the Firebase service-account JSON. Check FIREBASE_SERVICE_ACCOUNT_PATH in .env.'); }
    if (account.type !== 'service_account' || account.project_id !== env.firebase.projectId || !account.private_key || !account.client_email) {
      throw new Error('The Firebase service account must belong to FIREBASE_PROJECT_ID and include a private key and client email.');
    }
    return cert({ projectId: account.project_id, clientEmail: account.client_email, privateKey: account.private_key });
  }
  if (env.firebase.clientEmail || env.firebase.privateKey) {
    if (!env.firebase.clientEmail || !env.firebase.privateKey) throw new Error('Set both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or use FIREBASE_SERVICE_ACCOUNT_PATH.');
    return cert({ projectId: env.firebase.projectId, clientEmail: env.firebase.clientEmail, privateKey: env.firebase.privateKey });
  }
  return applicationDefault();
}

const credential = credentials();
export const firebaseApp = initializeApp({ projectId: env.firebase.projectId, ...(credential ? { credential } : {}) });
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp, env.firebase.databaseId);
export const usersCollection = firestore.collection('users');

export async function checkFirebase() {
  // Check the connection without creating documents or reading financial data.
  await usersCollection.limit(1).select().get();
  return { status: 'ok', database: 'firestore', authentication: 'firebase', project_id: env.firebase.projectId };
}

export async function closeFirebase() {
  await firestore.terminate();
  await deleteApp(firebaseApp);
}
