import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/components/auth/ResendConfirmation.tsx', 'utf8');
const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(ts.isFunctionDeclaration).getText(ast).replace(/^export /, '');
const js = ts.transpileModule(component, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;

// Render the actual component with deterministic hooks and an isolated auth
// transport. Inspect the emitted controls and exercise their event handlers.
function mount(resend, props = {}) {
  const hooks = [];
  let cursor = 0;
  const useState = (initial) => {
    const i = cursor++;
    if (!(i in hooks)) hooks[i] = initial;
    return [hooks[i], (value) => { hooks[i] = value; }];
  };
  const useRef = (initial) => useState({ current: initial })[0];
  const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }) };
  const renderComponent = new Function('React', 'useState', 'useRef', 'getSupabaseClient', 'useI18n', 'mapAuthError', 'LoadingDots',
    `${js}; return ResendConfirmation;`)(React, useState, useRef, () => ({ auth: { resend } }),
    () => ({ t: (s) => s }), (s) => s, 'loading');
  return () => { cursor = 0; return renderComponent({ defaultEmail: 'polar@example.com', ...props }); };
}
const find = (node, predicate) => {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  return node.children.map((child) => find(child, predicate)).find(Boolean);
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('embedded resend cannot submit login and only sends once while pending', async () => {
  const calls = [];
  let finish;
  const render = mount((args) => { calls.push(args); return new Promise((resolve) => { finish = resolve; }); }, { embedded: true, lockEmail: true });
  const tree = render();
  assert.equal(tree.type, 'div');
  assert.equal(tree.props.onSubmit, undefined);
  const button = find(tree, (n) => n.type === 'button');
  assert.equal(button.props.type, 'button');
  button.props.onClick();
  button.props.onClick();
  assert.deepEqual(calls, [{ type: 'signup', email: 'polar@example.com' }]);
  finish({ error: null });
  await flush();
  assert.equal(render().props.role, 'status');
  const login = readFileSync('src/components/auth/AuthScreen.tsx', 'utf8');
  assert.match(login, /<ResendConfirmation[^>]*key=\{email\}[^>]*embedded/);
});

test('standalone resend keeps form submission and catches transport failures for retry', async () => {
  let calls = 0;
  const render = mount(async () => { calls++; if (calls === 1) throw new Error('offline'); return { error: null }; });
  const tree = render();
  assert.equal(tree.type, 'form');
  let prevented = false, stopped = false;
  const event = { preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } };
  tree.props.onSubmit(event);
  await flush();
  assert.ok(prevented && stopped);
  const failed = render();
  assert.ok(find(failed, (n) => n.props.role === 'alert'));
  assert.equal(find(failed, (n) => n.type === 'button').props.disabled, false);
  failed.props.onSubmit(event);
  await flush();
  assert.equal(render().props.role, 'status');
});

test('service errors remain visible without claiming that mail was sent', async () => {
  const render = mount(async () => ({ error: { message: 'Email rate limit exceeded' } }), { embedded: true });
  find(render(), (n) => n.type === 'button').props.onClick();
  await flush();
  const tree = render();
  assert.equal(find(tree, (n) => n.props.role === 'alert').children[0], 'Email rate limit exceeded');
  assert.equal(find(tree, (n) => n.props.role === 'status'), undefined);
});
