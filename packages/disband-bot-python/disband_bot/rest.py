"""Minimal HTTP layer for the Disband bot API (stdlib only)."""

import json
import urllib.error
import urllib.request

from .errors import AuthError, HttpError, PermissionError, RateLimitError


class REST:
    def __init__(self, client):
        self.client = client
        self.base_url = client.base_url

    def _headers(self):
        return {
            "Authorization": "Bot " + self.client.token,
            "Content-Type": "application/json",
            "User-Agent": "disband-bot (+https://www.disband.dev)",
        }

    def _parse(self, response, raw):
        try:
            body = json.loads(raw.decode("utf-8")) if raw else None
        except (ValueError, UnicodeDecodeError):
            body = None
        if 200 <= response.status < 300:
            return body
        message = (body or {}).get("error") if isinstance(body, dict) else None
        message = message or "Request failed with status %d" % response.status
        if response.status == 401:
            raise AuthError(response.status, message, body)
        if response.status == 429:
            retry = 0
            try:
                retry = float(response.headers.get("Retry-After") or 0)
            except (TypeError, ValueError):
                retry = 0
            raise RateLimitError(response.status, message, body, retry)
        if response.status == 403:
            raise PermissionError(response.status, message, body)
        raise HttpError(response.status, message, body)

    def request(self, method, path, body=None):
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=self._headers(),
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return self._parse(resp, resp.read())
        except urllib.error.HTTPError as e:
            return self._parse(e, e.read())
        except urllib.error.URLError as e:
            raise HttpError(0, "Network error: %s" % e.reason)

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, body=None):
        return self.request("POST", path, body)

    def patch(self, path, body=None):
        return self.request("PATCH", path, body)

    def delete(self, path):
        return self.request("DELETE", path)
