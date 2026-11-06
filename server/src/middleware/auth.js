import { firebaseAuth } from '../config/firebase.js';
import { AppError } from '../services/errors.js';

const invalidTokenCodes = new Set(['auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token', 'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found']);

export async function requireAuth(req, res, next) {
  const match = req.get('Authorization')?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  try {
    // Verify project, signature, expiry, revocation and disabled-account state.
    // A browser-supplied user_id is never authority.
    req.auth = await firebaseAuth.verifyIdToken(match[1], true);
    req.user = { id: req.auth.uid };
  } catch (error) {
    if (invalidTokenCodes.has(error.code)) throw new AppError(401, 'UNAUTHENTICATED', 'Your sign-in expired. Please sign in again.');
    throw error;
  }
  next();
}
