import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { checkFirebase } from './config/firebase.js';
import { apiRouter } from './routes/index.js';
import { unknownRoute, errorHandler } from './middleware/errors.js';
import { AppError } from './services/errors.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, contentSecurityPolicy: { directives: {
  'script-src': ["'self'", 'https://apis.google.com'],
  'connect-src': ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://*.firebaseapp.com', env.clientOrigin],
  'frame-src': ["'self'", 'https://*.firebaseapp.com'],
  'font-src': ["'self'", 'data:'],
  'style-src': ["'self'", "'unsafe-inline'"],
} } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || origin === env.clientOrigin) return callback(null, true);
  callback(new AppError(403, 'INVALID_ORIGIN', 'This request origin is not allowed.'));
}, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use('/api/transactions/import', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', async (req, res) => res.json({ data: await checkFirebase() }));
app.use('/api', apiRouter, unknownRoute);

if (env.nodeEnv === 'production') {
  const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(clientDirectory));
  app.get('/{*splat}', (req, res) => res.sendFile(`${clientDirectory}/index.html`));
}
app.use(unknownRoute);
app.use(errorHandler);
export default app;
