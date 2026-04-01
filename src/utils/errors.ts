export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(message: string, code: string, status = 500, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

export class LLMError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "LLM_ERROR", 502, details);
  }
}

export class PipelineStepError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "PIPELINE_ERROR", 500, details);
  }
}

export function toErrorResponse(error: unknown): {
  error: string;
  code: string;
  details?: unknown;
  status: number;
} {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      details: error.details,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      code: "INTERNAL_ERROR",
      status: 500,
    };
  }

  return {
    error: "Unknown error",
    code: "INTERNAL_ERROR",
    details: error,
    status: 500,
  };
}
