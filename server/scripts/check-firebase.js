import { checkFirebase, closeFirebase, firebaseAuth } from '../src/config/firebase.js';

try {
  const status = await checkFirebase();
  await firebaseAuth.listUsers(1);
  console.log(`Firebase ready: ${status.project_id}. Firestore and Authentication are reachable.`);
} catch (error) {
  console.error(`Firebase check failed: ${error.code || error.message}`);
  process.exitCode = 1;
} finally {
  await closeFirebase();
}
