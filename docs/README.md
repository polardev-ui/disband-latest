# Disband Docs

Documentation site for [Disband](https://www.disband.dev) — an open chat platform
with servers, channels, DMs, group chats, voice/video calls and private notes.

Static HTML with no build step or dependencies. Edit a file, refresh the browser.

Includes client-side search (`/` or `Cmd/Ctrl+K`), scroll-reveal animations that
respect `prefers-reduced-motion`, copy buttons on code blocks, and light/dark
theming that follows the OS.

## Viewing it

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Pages

| File | Covers |
| --- | --- |
| `index.html` | What Disband is, feature and client overview |
| `getting-started.html` | Local setup, environment variables, migrations, iOS build |
| `architecture.html` | How the clients, Next.js app and Supabase fit together |
| `data-model.html` | Every Postgres table and its purpose |
| `security.html` | Row Level Security, the permission model, privileged functions |
| `realtime.html` | Postgres change streams, broadcast channels, common traps |
| `api.html` | The HTTP route handlers that actually exist |
| `bots.html` | What you can build today, plus the proposed bot API |
| `contributing.html` | Conventions for working on the codebase |

## Accuracy

Content describes Disband **v1.0.26** as it actually behaves. Anything not yet
built is labelled `Planned` and called out in the text.

The most important instance: **there is no bot API.** No bot accounts, tokens,
invite flow or gateway exist in the codebase. `bots.html` says so plainly, then
documents the intended design: bots are **self-hosted** by their developer and
**invited to a server** by its owner, authenticating with a bot token against
Disband's own API. Bot developers never receive Supabase credentials.

Please keep that distinction if you edit it — documenting features that do not
exist wastes more developer time than having no docs at all.

## Regenerating the search index

`assets/search-index.json` is generated from the page HTML. After editing
content, rebuild it so search stays accurate (see the snippet in
`contributing.html`), or search will return stale text.

## Deploying

Any static host works — GitHub Pages, Netlify, Vercel, Cloudflare Pages — since
there is no build step. Point it at this directory.
