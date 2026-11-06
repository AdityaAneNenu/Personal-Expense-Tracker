import { firebaseAuth, firestore, usersCollection } from '../config/firebase.js';

export async function getProfile(uid) {
  const account = await firebaseAuth.getUser(uid);
  const profile = { id: account.uid, name: account.displayName || account.email?.split('@')[0] || 'SpendWise member',
    email: account.email || '', created_at: new Date(account.metadata.creationTime).toISOString() };
  const ref = usersCollection.doc(uid);
  await firestore.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    const old = existing.data();
    if (!old || ['name', 'email', 'created_at'].some(key => old[key] !== profile[key])) {
      transaction.set(ref, { name: profile.name, email: profile.email, created_at: profile.created_at,
        ...(!existing.exists ? { revision: 0 } : {}) }, { merge: true });
    }
  });
  return profile;
}
