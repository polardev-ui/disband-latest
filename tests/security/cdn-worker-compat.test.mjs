import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker, { MediaQuota } from '../../cloudflare/cdn-worker/src/index.js';

const USER = '11111111-2222-4333-8444-555555555555';
const BASE = 'https://cdn.disband.dev';
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

class DigestStream extends WritableStream {
  constructor(algorithm) {
    assert.equal(algorithm, 'SHA-256');
    const hash = createHash('sha256');
    let done;
    let fail;
    const digest = new Promise((resolve, reject) => { done = resolve; fail = reject; });
    super({
      write(chunk) { hash.update(chunk); },
      close() { done(hash.digest()); },
      abort(error) { fail(error); },
    });
    this.digest = digest;
  }
}

function fixture() {
  const objects = new Map();
  const records = [];
  const blocked = new Set();
  const usage = { bytes: 0, objects: 0 };
  const media = {
    async put(key, body, options = {}) {
      const bytes = typeof body === 'string' ? Buffer.from(body) :
        Buffer.from(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body: new Blob([found.bytes]).stream(),
        size: found.bytes.length,
        httpEtag: '"test-etag"',
        customMetadata: found.options.customMetadata ?? {},
        httpMetadata: found.options.httpMetadata ?? {},
        writeHttpMetadata(headers) {
          headers.set('content-type', found.options.httpMetadata?.contentType ?? 'application/octet-stream');
        },
      };
    },
    async delete(key) { objects.delete(key); },
    async head(key) { return objects.has(key) ? {} : null; },
  };
  const quota = {
    idFromName(name) { assert.equal(name, USER); return name; },
    get() { return { async fetch(request, init) {
      const { bytes } = JSON.parse(init.body);
      if (new URL(request).pathname === '/rollback') {
        usage.bytes -= bytes;
        usage.objects -= 1;
      } else {
        usage.bytes += bytes;
        usage.objects += 1;
      }
      return new Response('{}');
    } }; },
  };
  const limit = { async limit() { return { success: true }; } };
  const env = {
    MEDIA: media, MEDIA_QUOTA: quota,
    UPLOAD_RATE_LIMITER: limit, PREVIEW_RATE_LIMITER: limit, GIF_RATE_LIMITER: limit,
    PUBLIC_BASE: BASE, REQUIRE_AUTH: 'true', SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key', SUPABASE_SERVICE_KEY: 'private-test-key',
    ADMIN_SECRET: 'unit-admin-secret', MAX_UPLOAD_MB: '50', MAX_USER_STORAGE_MB: '1024',
    MAX_USER_OBJECTS: '500', ALLOWED_ORIGIN: '*',
  };
  return { env, objects, records, blocked, usage };
}

function uploadRequest(bytes = PNG) {
  const form = new FormData();
  form.append('file', new File([bytes], 'photo.png', { type: 'image/png' }));
  return new Request(`${BASE}/v1/images`, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-length': '1000' }, body: form,
  });
}

test('CDN Worker retains quotas and user keys while registering and quarantining media', async () => {
  const oldFetch = globalThis.fetch;
  const oldDigest = globalThis.crypto.DigestStream;
  globalThis.crypto.DigestStream = DigestStream;
  const state = fixture();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER });
    if (url.includes('/rest/v1/banned_media_hashes')) {
      const sha = new URL(url).searchParams.get('sha256')?.slice(3);
      return Response.json(state.blocked.has(sha) ? [{ sha256: sha }] : []);
    }
    if (url.includes('/rest/v1/media_assets')) {
      state.records.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    if (url.includes('/rest/v1/moderation_actions')) return new Response(null, { status: 201 });
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    assert.equal(typeof MediaQuota, 'function');
    const uploaded = await worker.fetch(uploadRequest(), state.env);
    assert.equal(uploaded.status, 200);
    const { key, url } = await uploaded.json();
    assert.match(key, new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
    assert.equal(url, `${BASE}/v1/images/${key}`);
    assert.equal(state.usage.objects, 1);
    assert.equal(state.records[0].storage_key, key);
    assert.equal(state.records[0].sha256, createHash('sha256').update(PNG).digest('hex'));
    const served = await worker.fetch(new Request(url), state.env);
    assert.equal(served.status, 200);
    assert.deepEqual(new Uint8Array(await served.arrayBuffer()), PNG);
    const flatKey = '01234567-89ab-4cde-8f01-23456789abcd.png';
    state.objects.set(flatKey, { bytes: Buffer.from(PNG), options: { httpMetadata: { contentType: 'image/png' } } });
    assert.equal((await worker.fetch(new Request(`${BASE}/v1/images/${flatKey}`), state.env)).status, 200);

    const sha256 = state.records[0].sha256;
    const unauthorized = await worker.fetch(new Request(`${BASE}/v1/admin/quarantine`, {
      method: 'POST', body: JSON.stringify({ key, sha256 }),
    }), state.env);
    assert.equal(unauthorized.status, 401);
    const quarantined = await worker.fetch(new Request(`${BASE}/v1/admin/quarantine`, {
      method: 'POST', headers: { 'x-admin-secret': state.env.ADMIN_SECRET },
      body: JSON.stringify({ key, sha256 }),
    }), state.env);
    assert.equal(quarantined.status, 200);
    assert.equal(state.objects.has(key), false);
    assert.equal(state.objects.has(`quarantine/${sha256}`), true);
    assert.equal((await worker.fetch(new Request(url), state.env)).status, 404);
    assert.equal((await worker.fetch(new Request(`${BASE}/v1/images/quarantine/${sha256}`), state.env)).status, 400);

    state.blocked.add(sha256);
    const rejected = await worker.fetch(uploadRequest(), state.env);
    assert.equal(rejected.status, 451);
    assert.equal(state.usage.objects, 1);
    assert.equal(state.records.length, 1);
    assert.equal(state.objects.size, 2);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldDigest === undefined) delete globalThis.crypto.DigestStream;
    else globalThis.crypto.DigestStream = oldDigest;
  }
});
