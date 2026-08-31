export class DisbandError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "DisbandError";
  }
}

/** An error response from the Disband API. */
export class HttpError extends DisbandError {
  constructor(status, message, body) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

/** The bot token was rejected (missing, unknown, or revoked). */
export class AuthError extends HttpError {}

/** The bot lacks the required scope or membership for this action. */
export class PermissionError extends HttpError {}

/** Too many requests — check `retryAfterSeconds`. */
export class RateLimitError extends HttpError {
  constructor(status, message, body, retryAfterSeconds = 0) {
    super(status, message, body);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
