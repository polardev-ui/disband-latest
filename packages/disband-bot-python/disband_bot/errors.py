"""Errors raised by the Disband bot client."""


class DisbandError(Exception):
    """Base class for all errors from the Disband API."""


class HttpError(DisbandError):
    """A non-2xx response from the API."""

    def __init__(self, status, message, body=None):
        super().__init__(message)
        self.status = status
        self.body = body


class AuthError(HttpError):
    """The bot token was missing, unknown, or revoked."""


class PermissionError(HttpError):
    """The bot lacks the required scope or membership for this action."""


class RateLimitError(HttpError):
    """Too many requests — respect ``retry_after_seconds``."""

    def __init__(self, status, message, body=None, retry_after_seconds=0):
        super().__init__(status, message, body)
        self.retry_after_seconds = retry_after_seconds
