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
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return this._parse(res);
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body) {
    return this.request("POST", path, body);
  }

  patch(path, body) {
    return this.request("PATCH", path, body);
  }

  delete(path) {
    return this.request("DELETE", path);
  }
}
