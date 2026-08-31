export class DisbandError extends Error {
  constructor(message: string, options?: ErrorOptions);
  name: string;
}

export class HttpError extends DisbandError {
  constructor(status: number, message: string, body?: unknown);
  status: number;
  body?: unknown;
}

export class AuthError extends HttpError {}

export class PermissionError extends HttpError {}

export class RateLimitError extends HttpError {
  constructor(status: number, message: string, body?: unknown, retryAfterSeconds?: number);
  retryAfterSeconds: number;
}
