export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class GoneError extends AppError {
  constructor(message = 'resource is no longer available') {
    super(message, 410, 'GONE');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
