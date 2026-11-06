export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(entity = 'Record') {
  return new AppError(404, 'NOT_FOUND', `${entity} not found.`);
}
