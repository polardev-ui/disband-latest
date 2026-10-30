# Publishing `@disband/bot` to npm

This guide walks through building and publishing the JavaScript bot client
(`packages/bot`) to npm so users can `npm install @disband/bot`.

## Prerequisites

- Node.js 18+ with npm
- An npm account (https://www.npmjs.com/signup)
- Logged in: `npm login` (or `npm adduser`)
- For the scoped package `@disband/bot`, you need an npm organization named
  `disband` (https://www.npmjs.com/org/create) — or publish under your own scope
  and update `package.json` `name`.

## 1. Verify the package

```bash
cd packages/bot
npm pack --dry-run
```

Check that `index.js`, `index.d.ts`, and `src/` are included.

## 2. Bump the version

```bash
npm version patch   # or minor / major
```

This updates `package.json` and creates a git tag. For the first publish, `0.1.0` is fine.

## 3. Publish

Scoped packages default to private. Publish publicly:

```bash
npm publish --access public
```

## 4. Verify

```bash
npm view @disband/bot
npm install @disband/bot
node -e "const b = require('@disband/bot'); console.log('ok')"
```

## Automation (GitHub Actions)

Add a workflow (`.github/workflows/publish-npm.yml`) that triggers on a tag like
`bot-js-v*`:

```yaml
name: Publish npm bot
on:
  push:
    tags: ['bot-js-v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: 'https://registry.npmjs.org'
      - run: cd packages/bot && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Store the npm token as a repo secret named `NPM_TOKEN`. Generate it at
https://www.npmjs.com/settings/~/tokens (type: Automation).

## Replacing the zip downloads

Once published, update `docs.disband.dev` to instruct users:

```bash
# JavaScript / TypeScript
npm install @disband/bot

# Python
pip install disband-bot
```

instead of downloading zip files. Remove the zip download links from the docs.

## Notes

- `@disband/bot` is the npm scope/name. Change it in `package.json` if you want a
  different name (e.g., `disband-bot`).
- The package has no runtime dependencies (`"dependencies": {}`), so installs are fast.
- `engines: { node: ">=18" }` ensures a modern runtime.
