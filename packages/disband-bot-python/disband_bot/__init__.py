"""disband-bot: the official Python client for Disband bots."""

from .client import Client
from .errors import (
    AuthError,
    DisbandError,
    HttpError,
    PermissionError,
    RateLimitError,
)
from .message import Message

__all__ = [
    "Client",
    "Message",
    "DisbandError",
    "HttpError",
    "AuthError",
    "PermissionError",
    "RateLimitError",
]

__version__ = "0.1.0"
