import app from './app.js';
import { env } from './config/env.js';
import { checkFirebase, closeFirebase } from './config/firebase.js';

try {
  await checkFirebase();
  const server = app.listen(env.port, () => console.log(`SpendWise API running at http://localhost:${env.port} (Firebase: ${env.firebase.projectId})`));
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(async () => { await closeFirebase(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  server.on('error', error => { console.error(`Cannot start SpendWise: ${error.code || error.message}`); void closeFirebase().finally(() => { process.exitCode = 1; }); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error(`Cannot start SpendWise: ${error.code || error.message}. Check the root .env and run npm run firebase:check.`);
  await closeFirebase();
  process.exitCode = 1;
}
