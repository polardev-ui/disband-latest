# Publishing `@disband/bot` to npm

Publish the JavaScript bot client (`packages/bot`) from your terminal.

## Prerequisites

- Node.js 18+ and npm
- npm account with access to the `@disband` scope (or change `name` in `package.json`)
- Logged in: `npm whoami` (if not, run `npm login`)

## Publish a release

```bash
cd packages/bot

# 1) Verify contents
npm pack --dry-run

# 2) (optional) bump version if needed
# npm version patch|minor|major --no-git-tag-version

# 3) Publish (scoped packages must be public)
npm publish --access public
```

## Verify

```bash
npm view @disband/bot version
npm install @disband/bot@latest
```

## Notes

- `files` in `package.json` controls what is published (`index.js`, `index.d.ts`, `src/`).
- No build step: the package ships plain ESM JavaScript.
- If publish fails with scope/auth errors, confirm you are logged into an account that can publish `@disband/bot` and that the scope exists.
- For CI publishing, use an npm automation token in `NODE_AUTH_TOKEN` and run `npm publish --access public` from `packages/bot`.
