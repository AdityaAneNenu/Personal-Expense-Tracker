import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { env, projectRoot } from '../src/config/env.js';
import { closeFirebase, firebaseApp } from '../src/config/firebase.js';

try {
  if (env.firebase.authEmulator || env.firebase.databaseId !== '(default)') throw new Error('This command publishes rules to the configured live project\'s default Firestore database.');
  const source = await readFile(join(projectRoot, 'firestore.rules'), 'utf8');
  const rules = getSecurityRules(firebaseApp);
  const previous = await rules.getFirestoreRuleset();
  if (previous.source.length === 1 && previous.source[0].content.trim() === source.trim()) {
    console.log(`Firestore rules are already current for ${env.firebase.projectId}.`);
  } else {
    const backupDirectory = join(projectRoot, '.local');
    await mkdir(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(backupDirectory, `firestore-rules-before-${stamp}.json`), JSON.stringify({ project: env.firebase.projectId, name: previous.name, source: previous.source }, null, 2));
    await rules.releaseFirestoreRulesetFromSource(source);
    const published = await rules.getFirestoreRuleset();
    if (!published.source.some(file => file.content.trim() === source.trim())) throw new Error('Published rules did not match the local file.');
    console.log(`Firestore rules published and verified for ${env.firebase.projectId}. Previous rules are backed up in .local/.`);
  }
} catch (error) {
  console.error(`Rules deployment failed: ${error.code || error.message}`);
  process.exitCode = 1;
} finally { await closeFirebase(); }
