# 📝 Noteshare.space — ToBeHH fork

Share end-to-end encrypted Markdown notes from Obsidian. The plugin encrypts the note
locally and uploads only ciphertext; the key travels in the URL **fragment**, which
browsers never send to the server. Notes expire after 30 days.

![Preview of a noteshare.space shared note](/img/preview.png)

> **This is a maintenance fork of [mcndt/noteshare.space](https://github.com/mcndt/noteshare.space).**
> All the credit for the design and the original implementation goes to
> [Maxime Cannoodt (mcndt)](https://github.com/mcndt). Upstream's last commit was
> 2023-03-23 and it has had no code since, so this fork exists to keep a self-hosted
> instance running on a supported, patched stack.
>
> If you are looking for the public service, it is at
> [noteshare.space](https://noteshare.space). For the Obsidian plugin, see
> [mcndt/obsidian-quickshare](https://github.com/mcndt/obsidian-quickshare).

## What differs from upstream

| | Upstream (2023) | This fork |
|---|---|---|
| Runtime | Node 16 + Alpine 3.16 (both EOL) | Node 24 LTS + Debian slim |
| ORM | Prisma 4 | Prisma 7 + `better-sqlite3` driver adapter |
| Server | Express 4 | Express 5, helmet 8, pino 10, rate-limit 8 |
| Frontend | SvelteKit `1.0.0-next`, Svelte 3, Vite 3 | SvelteKit 2, Svelte 5, Vite 8 |
| Markdown | marked 4 + `svelte-markdown` | marked 18 + `@humanspeak/svelte-markdown` |
| Reverse proxy | Traefik (in compose) | nginx on the host |

Behavioural fixes on top of that:

- **`~` no longer strikes text through.** marked follows GFM, which accepts a *single*
  tilde as a strikethrough delimiter; Obsidian only accepts `~~`. A note using `~` to
  mean "approximately" came out with whole paragraphs struck through.
- **`[[#Heading]]` links are active.** Wiki-links pointing at a heading in the same note
  now scroll to it; links to notes that were never shared stay inert.
- **Rate limits are per client IP.** The app never set `trust proxy`, so behind a reverse
  proxy every request looked like it came from one address and the limits were global.
- **A Prisma 7 data-loss bug is fixed.** See `CLAUDE.md`; anyone upgrading an existing
  Prisma 4 database needs migration `20260911120000_datetime_integer_to_text`.

## Layout

```
server/     Express 5 + Prisma 7 + SQLite storage backend   (port 8080)
webapp/     SvelteKit 2 + Svelte 5 frontend, adapter-node   (port 3000)
plugin/     git submodule -> the Obsidian plugin (SSH URL, normally not checked out)
```

`plugin/` is not needed to build or run anything here and is left empty on purpose.

## Local development

Requires **Node 24**. Each subproject is its own npm package.

```bash
cd server  && npm install && npx prisma generate && npm test   # 39 tests
cd webapp  && npm install && npm test                          # 36 tests
```

`server` will not compile until `prisma generate` has run — the client is generated into
`server/src/generated/` and is gitignored.

To run both together behind a single origin (the way nginx serves them in production),
copy `proxy.example.js` to `proxy.js` and:

```bash
npm install        # in the repo root, dev tooling only
npm run dev        # webapp + server + proxy on http://localhost:5000
```

### Local database

SQLite, via Prisma. Prisma 7 keeps the connection string in `server/prisma.config.ts`
rather than in `schema.prisma`, and reaches the database through the
`better-sqlite3` driver adapter instead of a bundled query engine.

```bash
cd server && npx prisma migrate deploy
```

### Building the way it ships

CI and production both use Node 24 on Debian. To reproduce that locally:

```bash
docker run --rm -v "$PWD/server:/app" -w /app node:24-slim sh -c \
  "apt-get update && apt-get install -y python3 make g++ && npm install && npx prisma generate && npm run build && npm test"
```

`better-sqlite3` is compiled from source, hence the toolchain. On Apple Silicon, check
`docker image inspect node:24-slim --format '{{.Architecture}}'` first — a cached amd64
image runs under Rosetta and turns a two-minute build into half an hour.

## Configuration

Set as environment variables; there are no `.env` files in a container deployment.

**server**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | e.g. `file:/database/db.sqlite` |
| `FRONTEND_URL` | Public base URL. Echoed back to the plugin as `view_url`, so it must match the real host. |
| `ENVIRONMENT` | `dev` relaxes CORS; anything else is same-origin |
| `CLEANUP_INTERVAL_SECONDS` | How often expired notes are swept |
| `POST_LIMIT`, `POST_LIMIT_WINDOW_SECONDS` | Upload rate limit |
| `GET_LIMIT`, `GET_LIMIT_WINDOW_SECONDS` | Read rate limit |

**webapp** — `VITE_SERVER_INTERNAL` and `VITE_BRANDING` are **build arguments**, not
runtime variables: Vite bakes them into the bundle, so changing them means rebuilding
the image.

## Deployment

The reference deployment lives at `/cloud/noteshare` on a single host and is described in
detail in **`CLAUDE.md`**. In outline:

- `docker compose` builds three images from `server/` and `webapp/` — a migration runner
  (`prisma migrate deploy`, gates the backend), the backend, and the frontend. Upstream's
  Traefik and Grafana services are not used.
- Both app containers bind to `127.0.0.1` only.
- **nginx** on the host terminates TLS and does the routing Traefik used to do:
  `/api/` → the server on 8080, everything else → the webapp on 3000.
- Deployment is a deliberate manual step (`update.sh` on the host): it pulls `master`,
  rebuilds, and restarts only if the built image actually changed. Nothing auto-deploys,
  which is why there is no deploy workflow in this repo.

> **Set up TLS.** The key is in the URL fragment, so it is never sent to the server — but
> the ciphertext and the note id are, and the site is useless without HTTPS.

## Security

Both production dependency closures are at **0 known vulnerabilities**, and CI enforces
it on every push (`npm audit --omit=dev --audit-level=high`). Audit the *production*
closure; a full `npm audit` is mostly devDependency noise that `npm prune --omit=dev`
strips out of the images.

Dependabot is configured for `server/`, `webapp/`, the root tooling and the GitHub
Actions themselves. Majors that have historically needed a human — Prisma, marked,
svelte/kit/vite — are deliberately excluded; see `.github/dependabot.yml` for why.

## Contributing

Bugs in the upstream design or the Obsidian plugin belong on
[mcndt's tracker](https://github.com/mcndt/noteshare.space/issues). Issues with this
fork's stack belong here.

`master` is what the production host pulls, so keep it deployable: branch, let CI pass,
then merge.

## License

MIT, as upstream. See [LICENSE](LICENSE).
