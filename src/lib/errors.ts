import { logger } from './logger';

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
  constructor(message: string = 'Unauthorized access') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden access') {
    super(403, 'FORBIDDEN', message);
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

export function handleApiError(error: unknown): Response {
  if (error instanceof AppError) {
    const body: Record<string, any> = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (error instanceof ValidationError) {
      body.error.details = error.errors;
    }

    logger.warn(`API Error: ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      ...(error instanceof ValidationError ? { validationErrors: error.errors } : {}),
    });

    return Response.json(body, { status: error.statusCode });
  }

  // Handle standard JS errors or unexpected exceptions
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  logger.error(`Unexpected API Error: ${message}`, error);

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
