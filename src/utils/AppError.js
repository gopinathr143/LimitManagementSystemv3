export class AppError extends Error {
  constructor(message, statusCode, code, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message, code = 'UNAUTHENTICATED', details) {
    return new AppError(message, 401, code, details);
  }

  static forbidden(message, code = 'FORBIDDEN', details) {
    return new AppError(message, 403, code, details);
  }

  static notFound(message, code = 'NOT_FOUND', details) {
    return new AppError(message, 404, code, details);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(message, 409, code, details);
  }
}
