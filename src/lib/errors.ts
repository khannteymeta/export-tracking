import { warn, error } from './logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message?: string) {
    super(401, 'UNAUTHORIZED', message || 'Unauthorized access');
  }
}

export class ForbiddenError extends AppError {
  constructor(message?: string) {
    super(403, 'FORBIDDEN', message || 'Forbidden access');
  }
}

export class ValidationError extends AppError {
  constructor(public errors: Record<string, string[]>) {
    super(400, 'VALIDATION_ERROR', 'Validation failed');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export function handleApiError(err: unknown): Response {
  if (err instanceof AppError) {
    const body: Record<string, any> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (err instanceof ValidationError) {
      body.error.details = err.errors;
    }

    warn(`API Error: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      ...(err instanceof ValidationError ? { validationErrors: err.errors } : {}),
    });

    return Response.json(body, { status: err.statusCode });
  }

  // Handle standard JS errors or unexpected exceptions
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  error(`Unexpected API Error: ${message}`, err);

  return Response.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    { status: 500 }
  );
}

