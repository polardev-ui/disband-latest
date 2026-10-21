// Exercise the HTTP purchase handler with real Supabase client requests and
// JWT signing, replacing only the remote Apple/Auth/PostgREST responses.
// Suppress only the runtime server startup when importing the production
// entrypoint; deployed Edge Functions always register their handler.
const originalServe = Deno.serve;
Deno.serve = (() => ({})) as unknown as typeof Deno.serve;
const { handleRequest } = await import("./index.ts");
Deno.serve = originalServe;

const userId = "00000000-0000-4000-8000-000000000001";
const bundleId = "com.wsgpolar.disband";
const dbUrl = "https://purchase-test.supabase.co";
const production = "api.storekit.itunes.apple.com";
const sandbox = "api.storekit-sandbox.itunes.apple.com";
const key = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const pkcs8 = new Uint8Array(
  await crypto.subtle.exportKey("pkcs8", key.privateKey),
);
for (
  const [name, value] of Object.entries({
    SUPABASE_URL: dbUrl,
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    APPSTORE_KEY_ID: "TESTKEY",
    APPSTORE_ISSUER_ID: "test-issuer",
    APPSTORE_BUNDLE_ID: bundleId,
    APPSTORE_ENVIRONMENT: "Production",
    APPSTORE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${
      btoa(String.fromCharCode(...pkcs8))
    }\n-----END PRIVATE KEY-----`,
  })
) Deno.env.set(name, value);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const jws = (value: unknown) => `hint.${btoa(JSON.stringify(value))}.signature`;

interface Options {
  environment?: string;
  product?: string;
  appleStatus?: number;
  statusFailure?: boolean;
  missingStatus?: boolean;
  failTable?: string;
  failRead?: boolean;
  owner?: string;
  accountToken?: string;
  /** Defaults to true so the pre-existing sandbox scenarios keep working. */
  sandboxAllowed?: boolean;
}

async function scenario(
  options: Options,
  run: (state: {
    tx: Record<string, unknown>;
    requests: URL[];
    writes: Record<string, unknown[]>;
    verify: (serverId?: string) => Promise<Response>;
    notify: () => Promise<Response>;
  }) => Promise<void>,
) {
  const tx = {
    transactionId: "200000000000001",
    originalTransactionId: "200000000000000",
    bundleId,
    productId: options.product ?? "dev.disband.aero.monthly",
    type: options.product ? "Consumable" : "Auto-Renewable Subscription",
    purchaseDate: Date.now(),
    ...(!options.product ? { expiresDate: Date.now() + 86400000 } : {}),
    environment: options.environment ?? "Sandbox",
    appAccountToken: options.accountToken ?? userId,
    quantity: 2,
  };
  const requests: URL[] = [];
  const writes: Record<string, unknown[]> = {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    if ([production, sandbox].includes(url.host)) {
      const expectedHost = tx.environment === "Sandbox" ? sandbox : production;
      if (url.host !== expectedHost) return json({ errorCode: 4040010 }, 404);
      if (url.pathname.includes("/transactions/")) {
        return json({ signedTransactionInfo: jws(tx) });
      }
      if (options.statusFailure) return json({ errorCode: 5000001 }, 500);
      return json({
        data: [{
          lastTransactions: options.missingStatus ? [] : [{
            status: options.appleStatus ?? 1,
            signedTransactionInfo: jws(tx),
            signedRenewalInfo: jws({ autoRenewStatus: 1 }),
          }],
        }],
      });
    }
    if (url.origin !== dbUrl) throw new Error(`Unexpected request: ${url}`);
    if (url.pathname === "/auth/v1/user") return json({ id: userId });
    const table = url.pathname.split("/").pop()!;
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (options.failRead) {
        return json({ code: "XX000", message: "Database unavailable" }, 500);
      }
      if (table === "apple_products") {
        return json([{
          grants: options.product ? "catalyst" : "aero",
          quantity: 1,
          active: true,
        }]);
      }
      if (table === "apple_transactions") {
        return json(options.owner ? [{ user_id: options.owner }] : []);
      }
      if (table === "apple_sandbox_testers") {
        return json(
          options.sandboxAllowed === false
            ? []
            : [{ user_id: userId, expires_at: null }],
        );
      }
      throw new Error(`Unexpected table read: ${table}`);
    }
    if (table === options.failTable) {
      return json({ code: "XX000", message: "Write failed" }, 500);
    }
    (writes[table] ??= []).push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 201 });
  };
  try {
    await run({
      tx,
      requests,
      writes,
      verify: (serverId) =>
        handleRequest(
          new Request(`${dbUrl}/functions/v1/appstore/verify`, {
            method: "POST",
            headers: { authorization: "Bearer test-user-token" },
            body: JSON.stringify({ transactionId: tx.transactionId, serverId }),
          }),
        ),
      notify: () =>
        handleRequest(
          new Request(`${dbUrl}/functions/v1/appstore/notifications`, {
            method: "POST",
            body: JSON.stringify({
              signedPayload: jws({
                notificationType: "DID_RENEW",
                data: { signedTransactionInfo: jws(tx) },
              }),
            }),
          }),
        ),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("allowlisted App Review sandbox purchase grants Aero on Production", async () => {
  await scenario({ sandboxAllowed: true }, async ({ verify, requests, writes }) => {
    const response = await verify();
    assert(response.status === 200, `Expected success, got ${response.status}`);
    assert(
      (await response.json()).granted === "aero:active",
      "Aero was not granted",
    );
    const apple = requests.filter((u) =>
      [production, sandbox].includes(u.host)
    );
    assert(
      apple.length === 3,
      "Expected production miss, sandbox transaction, sandbox status",
    );
    assert(
      apple[0].host === production && apple[1].host === sandbox &&
        apple[2].host === sandbox,
      "Transaction and status environments differ",
    );
    const row = writes.subscriptions[0] as Record<string, unknown>;
    assert(
      row.provider === "apple" && row.plan === "aero" &&
        row.status === "active",
      "Wrong subscription grant",
    );
  });
});

Deno.test("unlisted account cannot turn a sandbox purchase into an entitlement", async () => {
  await scenario({ sandboxAllowed: false }, async ({ verify, writes }) => {
    const response = await verify();
    assert(response.status === 403, `Expected refusal, got ${response.status}`);
    const reply = await response.json();
    assert(reply.terminal === true, "Refusal was not marked terminal");
    assert(
      Object.keys(writes).length === 0,
      "Refused sandbox purchase wrote an entitlement",
    );
  });
});

Deno.test("sandbox renewal for an unlisted account is acknowledged without granting", async () => {
  await scenario({ sandboxAllowed: false }, async ({ notify, writes }) => {
    assert((await notify()).status === 200, "Sandbox renewal was not acknowledged");
    assert(
      Object.keys(writes).length === 0,
      "Unlisted sandbox renewal wrote an entitlement",
    );
  });
});

Deno.test("production purchase keeps both Apple calls in production", async () => {
  await scenario(
    { environment: "Production" },
    async ({ verify, requests }) => {
      assert((await verify()).status === 200, "Production purchase failed");
      assert(
        !requests.some((u) => u.host === sandbox),
        "Production purchase queried sandbox",
      );
    },
  );
});

for (
  const [appleStatus, expected] of [[2, "canceled"], [3, "past_due"], [
    4,
    "active",
  ], [5, "canceled"]] as const
) {
  Deno.test(`subscription status ${appleStatus} maps to ${expected}`, async () => {
    await scenario({ appleStatus }, async ({ verify, writes }) => {
      assert((await verify()).status === 200, "Status update failed");
      const row = writes.subscriptions[0] as Record<string, unknown>;
      assert(row.status === expected, "Wrong plan status");
      assert(
        row.plan === (expected === "canceled" ? "free" : "aero"),
        "Wrong plan",
      );
    });
  });
}

for (
  const options of [
    { statusFailure: true },
    { missingStatus: true },
    { failTable: "apple_transactions" },
    { failTable: "subscriptions" },
    { failRead: true },
  ]
) {
  Deno.test(`failed verification remains retryable: ${JSON.stringify(options)}`, async () => {
    await scenario(options, async ({ verify }) => {
      const response = await verify();
      assert(
        response.status === 503,
        `Expected retryable error, got ${response.status}`,
      );
      const reply = await response.json();
      assert(
        !reply.ok && typeof reply.error === "string",
        "Failure was acknowledged as delivered",
      );
    });
  });
}

Deno.test("Catalyst write failure is not acknowledged as delivered", async () => {
  await scenario({
    product: "dev.disband.catalyst.single",
    failTable: "server_catalysts",
  }, async ({ verify }) => {
    assert(
      (await verify("00000000-0000-4000-8000-000000000002")).status === 503,
      "Failed delivery was accepted",
    );
  });
});

Deno.test("Catalyst purchase delivers the requested units to its destination", async () => {
  await scenario(
    { product: "dev.disband.catalyst.single" },
    async ({ verify, writes }) => {
      const serverId = "00000000-0000-4000-8000-000000000002";
      const response = await verify(serverId);
      assert(response.status === 200, "Catalyst delivery failed");
      assert(
        (await response.json()).granted === "catalyst:2",
        "Wrong unit count",
      );
      const rows = writes.server_catalysts[0] as Array<Record<string, unknown>>;
      assert(
        rows.length === 2 && rows.every((row) => row.server_id === serverId),
        "Wrong destination",
      );
    },
  );
});

Deno.test("verify still requires authentication when gateway JWT checking is disabled", async () => {
  const response = await handleRequest(
    new Request(`${dbUrl}/functions/v1/appstore/verify`, {
      method: "POST",
      body: JSON.stringify({ transactionId: "200000000000001" }),
    }),
  );
  assert(
    response.status === 401,
    "Unauthenticated purchase verification was accepted",
  );
});

Deno.test("notification without a Supabase token grants a sandbox renewal", async () => {
  await scenario({}, async ({ notify, writes }) => {
    assert((await notify()).status === 200, "Notification failed");
    assert(writes.subscriptions.length === 1, "Renewal was not granted");
  });
});

Deno.test("notification delivery failures request an Apple retry", async () => {
  await scenario({ failTable: "subscriptions" }, async ({ notify }) => {
    assert((await notify()).status === 503, "Failed renewal was acknowledged");
  });
});

Deno.test("an existing owner or Apple's account token prevents purchase transfer", async () => {
  for (
    const options of [{ owner: "someone-else" }, {
      accountToken: "someone-else",
    }]
  ) {
    await scenario(options, async ({ verify, writes }) => {
      assert(
        (await verify()).status === 409,
        "Purchase transferred to another account",
      );
      assert(
        Object.keys(writes).length === 0,
        "Ownership refusal wrote an entitlement",
      );
    });
  }
});
