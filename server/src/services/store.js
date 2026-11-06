import { firestore, usersCollection } from '../config/firebase.js';
import { AppError } from './errors.js';

const collectionNames = ['categories', 'transactions', 'budgets', 'alerts'];

class UserState {
  constructor(ref, snapshots) {
    this.ref = ref;
    this.userId = ref.id;
    this.now = new Date().toISOString();
    this.data = new Map(snapshots.map(([name, snapshot]) => [name, new Map(snapshot.docs.map(doc => [doc.id, { ...doc.data(), id: doc.id }]))]));
    this.pending = new Map();
  }
  rows(collection) { return [...this.data.get(collection).values()]; }
  get(collection, id) { return this.data.get(collection).get(id); }
  newId(collection) { return this.ref.collection(collection).doc().id; }
  set(collection, row) {
    this.data.get(collection).set(row.id, row);
    const { id, ...data } = row;
    this.pending.set(`${collection}/${id}`, data);
    return row;
  }
  delete(collection, id) {
    this.data.get(collection).delete(id);
    this.pending.set(`${collection}/${id}`, null);
  }
  commit(transaction) {
    for (const [path, data] of this.pending) {
      const [collection, id] = path.split('/');
      const ref = this.ref.collection(collection).doc(id);
      if (data === null) transaction.delete(ref);
      else transaction.set(ref, data);
    }
  }
}

async function load(transaction, ref, names) {
  const snapshots = await Promise.all(names.map(async name => [name, await transaction.get(ref.collection(name))]));
  return new UserState(ref, snapshots);
}

export function readUserData(userId, names = collectionNames) {
  return firestore.runTransaction(transaction => load(transaction, usersCollection.doc(userId), names), { readOnly: true });
}

export function withUserTransaction(userId, operation, idempotency = null) {
  const ref = usersCollection.doc(userId);
  return firestore.runTransaction(async transaction => {
    // Lock this user before any other reads. This serializes concurrent adds,
    // uniqueness checks and threshold calculations across server instances,
    // including queries that initially return no documents.
    const profile = await transaction.get(ref);
    const receiptRef = idempotency ? ref.collection('imports').doc(idempotency.key) : null;
    if (receiptRef) {
      const receipt = await transaction.get(receiptRef);
      if (receipt.exists) {
        if (receipt.data().request_hash !== idempotency.hash) throw new AppError(409, 'IMPORT_CHANGED', 'This import was already saved with different rows. Start a new import for these changes.');
        return { ...receipt.data().result, replayed: true };
      }
    }
    const state = await load(transaction, ref, collectionNames);
    const result = await operation(state);
    if (receiptRef && state.pending.size + 2 > 500) throw new AppError(422, 'IMPORT_TOO_LARGE', 'This import would update too many budget alerts at once. Split the file into smaller imports. Nothing has been saved.');
    // Read everything before writing: Firestore cannot read its own writes.
    transaction.set(ref, { revision: (profile.data()?.revision || 0) + 1, updated_at: state.now }, { merge: true });
    state.commit(transaction);
    if (receiptRef) transaction.set(receiptRef, { request_hash: idempotency.hash, result, created_at: state.now });
    return result;
  }, { maxAttempts: 10 });
}

export const toPaise = amount => Math.round(Number(amount) * 100);
export const amountFields = row => {
  const { amount_paise, ...fields } = row;
  return { ...fields, amount: amount_paise / 100 };
};
