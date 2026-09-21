import asyncio
import io
import unittest

from disband_bot.client import Client
from disband_bot.errors import HttpError
from disband_bot.rest import _NoRedirect


class _Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return b'{"messages": []}'


class _Opener:
    def __init__(self):
        self.request = None
        self.timeout = None

    def open(self, request, timeout):
        self.request = request
        self.timeout = timeout
        return _Response()


class TransportTests(unittest.TestCase):
    def test_api_base_requires_https_except_explicit_loopback(self):
        for url in ("http://example.com", "http://localhost:8080", "file:///tmp/api", "https://user:pass@example.com", "https://example.com/#fragment"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                Client("token", base_url=url)
        Client("token", base_url="http://127.0.0.1:8080", allow_insecure_localhost=True)

    def test_paths_and_query_values_are_encoded_and_requests_have_timeout(self):
        client = Client("token", gateway_timeout=45)
        opener = _Opener()
        client._rest.opener = opener
        client.list_messages("channel/../other", before="id&limit=999")
        self.assertIn("/channels/channel%2F..%2Fother/messages", opener.request.full_url)
        self.assertIn("before=id%26limit%3D999", opener.request.full_url)
        self.assertEqual(opener.timeout, 55.0)
        self.assertEqual(opener.request.get_header("Authorization"), "Bot token")

    def test_redirect_handler_refuses_auth_token_forwarding(self):
        self.assertIsNone(_NoRedirect().redirect_request(None, io.BytesIO(), 302, "Found", {}, "https://other.example"))

    def test_async_one_time_handler_runs_without_a_current_event_loop(self):
        client = Client("token")
        seen = []

        @client.once("messageCreate")
        async def receive(value):
            seen.append(value)

        client._emit("messageCreate", "first")
        client._emit("messageCreate", "second")
        self.assertEqual(seen, ["first"])

    def test_async_handler_failure_reaches_error_listener_in_running_loop(self):
        client = Client("token")
        errors = []
        client.on("error", lambda error: errors.append(str(error)))

        @client.on("messageCreate")
        async def fail(_value):
            raise RuntimeError("handler failed")

        async def emit_and_wait():
            client._emit("messageCreate", "event")
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        asyncio.run(emit_and_wait())
        self.assertEqual(errors, ["handler failed"])


if __name__ == "__main__":
    unittest.main()
