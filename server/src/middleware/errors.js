import { AppError } from '../services/errors.js';

export function unknownRoute(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'API route not found.'));
}

export function errorHandler(error, req, res, _next) {
  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message;
  if ([4, 8, 10, 14].includes(error.code)) {
    status = 503; code = 'FIREBASE_UNAVAILABLE'; message = 'Your workspace is temporarily unavailable. Please try again.';
  } else if (error.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON.';
  } else if (error.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'The request is too large.';
  } else if (status >= 500) {
    console.error(`[${req.method} ${req.path}] ${error.code || error.name}: ${error.message}`);
    code = 'INTERNAL_ERROR'; message = 'The server could not complete your request. Please try again.';
  }
  res.status(status).json({ error: { code, message, ...(error.details ? { details: error.details } : {}) } });
}
