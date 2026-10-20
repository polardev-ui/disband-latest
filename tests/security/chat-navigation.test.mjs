import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/contexts/AppContext.tsx", "utf8");
const ast = ts.createSourceFile(
  "AppContext.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
// Exercise the actual callbacks with a small state adapter; no database or React DOM is needed.
function callback(name, bindings) {
  let body;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      body = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(body, `callback ${name} exists`);
  const js = ts.transpileModule(`const run = ${body};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js}; return run;`)(
    ...Object.values(bindings),
  );
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function navigation() {
  const details = deferred(),
    state = {
      messages: ["old"],
      loading: false,
      channel: "old",
      server: "old",
      loads: [],
    };
  const bindings = {
    markActivity() {},
    persistActiveServerChannel() {},
    viewModeRef: { current: "space" },
    activeServerRef: { current: "old" },
    activeChannelRef: { current: "old" },
    activeDmRef: { current: null },
    activeGroupRef: { current: null },
    setViewMode() {},
    setActiveServerId(id) {
      state.server = id;
    },
    setActiveChannelId(id) {
      state.channel = id;
    },
    setActiveDmThreadId() {},
    setActiveGroupChatId() {},
    setMessages(rows) {
      state.messages = rows;
    },
    setMessagesLoading(value) {
      state.loading = value;
    },
    setChannelHasMore() {},
    clearServerIndicator() {},
    loadServerDetails: () => details.promise,
    getLastChannelId: () => null,
    async loadMessages(id) {
      state.loads.push(id);
      if (state.fetchAlreadyFinished) return;
      state.messages = [`message:${id}`];
      state.loading = false;
    },
  };
  return {
    state,
    bindings,
    details,
    select: callback("selectServer", bindings),
  };
}
test("server navigation preserves messages loaded by the fallback channel selector", async () => {
  const n = navigation();
  const pending = n.select("new");
  assert.equal(n.state.channel, null);
  assert.deepEqual(n.state.messages, []);
  n.bindings.activeChannelRef.current = "new-channel";
  n.state.channel = "new-channel";
  n.state.messages = ["already loaded"];
  n.state.loading = false;
  n.state.fetchAlreadyFinished = true; // deduplicated request already resolved before selectServer resumes
  n.details.resolve([{ id: "new-channel", type: "text" }]);
  await pending;
  assert.equal(n.state.loading, false);
  assert.deepEqual(n.state.messages, ["already loaded"]);
  assert.equal(n.state.channel, "new-channel");
});
test("late server navigation cannot take over a newer server or DM", async () => {
  for (const mode of ["space", "dm"]) {
    const n = navigation();
    const pending = n.select("new");
    n.bindings.activeServerRef.current = mode === "space" ? "newer" : "new";
    n.bindings.viewModeRef.current = mode;
    n.state.messages = ["newer conversation"];
    n.details.resolve([{ id: "stale", type: "text" }]);
    await pending;
    assert.deepEqual(n.state.loads, []);
    assert.deepEqual(n.state.messages, ["newer conversation"]);
  }
});
test("clicking the current server does not clear messages or leave a skeleton", async () => {
  const n = navigation();
  await n.select("old");
  assert.deepEqual(n.state.messages, ["old"]);
  assert.equal(n.state.loading, false);
});
test("group read actually executes the lazy PostgREST request", async () => {
  let sent = 0;
  const mark = callback("markGroupReadNow", {
    getSupabaseClient: () => ({
      rpc: (name, args) => {
        assert.equal(name, "mark_group_read");
        assert.equal(args.p_group_id, "group");
        return {
          then(resolve) {
            sent++;
            resolve({ error: null });
          },
        };
      },
    }),
  });
  await mark("group");
  assert.equal(sent, 1);
});
