import { AuthError, HttpError, PermissionError, RateLimitError } from "./errors.js";

/** Thin wrapper around fetch() that speaks the Disband bot API. */
export class REST {
  constructor(client) {
    this.client = client;
    this.baseUrl = client.baseUrl;
  }

  headers() {
    return {
      Authorization: `Bot ${this.client.token}`,
      "Content-Type": "application/json",
      "User-Agent": "@disband/bot (+https://www.disband.dev)",
    };
  }

  async _parse(response) {
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (response.ok) return body;

    const message = body?.error || `Request failed with status ${response.status}`;
    if (response.status === 401) throw new AuthError(401, message, body);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      throw new RateLimitError(429, message, body, Number.isFinite(retryAfter) ? retryAfter : 0);
    }
    if (response.status === 403) throw new PermissionError(403, message, body);
    throw new HttpError(response.status, message, body);
  }

  async request(method, path, body) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(this.client.requestTimeout),
      });
      // A 429 means the request wasn't carried out, so it's safe to send
      // again once the limit resets.
      if (res.status === 429 && this.client.retryRateLimits !== false && attempt < (this.client.maxRetries ?? 3)) {
        const after = Number(res.headers.get("retry-after"));
        const waitMs = Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 1000 * 2 ** attempt, 60_000);
        await res.text().catch(() => undefined);
        this.client._emit?.("debug", `Rate limited on ${method} ${path}; retrying in ${Math.round(waitMs / 1000)}s`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      return this._parse(res);
    }
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body) {
    return this.request("POST", path, body);
  }

  put(path, body) {
    return this.request("PUT", path, body);
  }

  patch(path, body) {
    return this.request("PATCH", path, body);
  }

  delete(path) {
    return this.request("DELETE", path);
  }
}
