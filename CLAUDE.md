# noteshare.space — ToBeHH fork

Fork of [mcndt/noteshare.space](https://github.com/mcndt/noteshare.space): share
end-to-end encrypted Markdown notes from Obsidian.

**Upstream is dead.** Last commit `655973a`, 2023-03-23; the repo is not archived but has
had no code since. Assume nothing will ever be fixed upstream — this fork is where
maintenance happens.

- `origin` → `git@github.com:ToBeHH/noteshare.space.git` (this fork)
- `upstream` → `https://github.com/mcndt/noteshare.space.git` (read-only, for the unlikely
  case something lands there)

## Where this runs

Deployed on the `sh` server (schulz-hess.de) at **https://notes.schulz-hess.de**.

`/cloud/noteshare/src` is a clone of **this fork** and `/cloud/noteshare/update.sh` does
`git fetch origin master && git reset --hard origin/master`, then rebuilds and restarts
only if the resulting image actually changed.

**Consequences to keep in mind:**
- Anything merged to **`master` here is what the server will pick up** on the next manual
  `update.sh`. Nothing auto-deploys — `update.sh` is not in cron.
- The server clone fetches over **HTTPS**, so the fork must stay public (or the server
  needs a deploy key).
- `git reset --hard` means **never edit `/cloud/noteshare/src` on the server** — changes
  there are destroyed on the next update. Local deployment tweaks live in
  `/cloud/noteshare/build/` instead. See `/cloud/noteshare/CLAUDE.md` on the server for the
  deployment side.

## Layout

```
server/     Express + Prisma + SQLite storage backend  (port 8080)
webapp/     SvelteKit frontend, adapter-node           (port 3000)
plugin/     git submodule -> mcndt/obsidian-note-sharing (SSH URL, usually not checked out)
```

The `plugin/` submodule uses an `git@github.com:` URL and is not needed for the server or
webapp build. It stays empty — that's fine, don't "fix" it. The actively maintained plugin
lives at [mcndt/obsidian-quickshare](https://github.com/mcndt/obsidian-quickshare).

## Architecture

- The **plugin encrypts locally** and `POST`s ciphertext to `/api/note`. The key goes in
  the URL **fragment** (`#…`), which browsers never send to the server. The server
  therefore never holds plaintext or keys — this is the property that makes most
  "XSS/injection" advisories here much less interesting than they look.
- `webapp/src/routes/note/[id]/+page.server.ts` fetches the ciphertext **server-side**
  (SSR) from `VITE_SERVER_INTERNAL`, so the browser only ever talks to `/`.
  Decryption happens **client-side** in `webapp/src/lib/crypto/decrypt.ts`.
- Three crypto suites coexist and all must keep working:
  - `v1` — crypto-js `AES.decrypt(text, passphrase)` + `HmacSHA256`. Key derivation is
    **EvpKDF (MD5-based)**, *not* PBKDF2. This matters — see the crypto-js note below.
  - `v2` — WebCrypto AES-CBC with a zero IV + HMAC-SHA256 verify.
  - `v3` — WebCrypto AES-GCM with a real IV.
  `decrypt.test.ts` holds known-answer vectors for v1 and v2. **Run it after touching
  anything crypto-adjacent** — it is the only thing standing between a dependency bump
  and silently unreadable notes.
- Notes expire after 30 days, hardcoded as `EXPIRE_WINDOW_DAYS` in
  `server/src/controllers/note/note.post.controller.ts`.

## Stack

Fully modernized 2026-09-11 off the EOL Node 16 / Alpine 3.16 base.

| | Was (upstream) | Now |
|---|---|---|
| Runtime | Node 16 + Alpine 3.16 (both EOL) | **Node 24 LTS + Debian slim** |
| ORM | Prisma 4 (bundled Rust engine) | **Prisma 7** + `better-sqlite3` driver adapter |
| Server | Express 4, rate-limit 6, helmet 5, pino 8 | **Express 5**, rate-limit 8, helmet 8, pino 10 |
| Frontend | SvelteKit `1.0.0-next.544`, Svelte 3, Vite 3 | **SvelteKit 2, Svelte 5, Vite 8** |
| Markdown | marked 4, svelte-markdown 0.2 | **marked 18**, `@humanspeak/svelte-markdown` |
| Tooling | TS 4.7, vitest 0.17, ts-node, nodemon, c8, eslint 8 | TS 5.9, vitest 3, tsx, eslint 9 flat config |

Two swaps unlocked everything else:

- **Prisma 7** has no bundled query engine — SQLite is reached through a driver
  adapter — which removed the OpenSSL-1.1/musl coupling that pinned the image to
  `alpine3.16`.
- **`@humanspeak/svelte-markdown`** replaced `svelte-markdown`, which was the ceiling
  on the entire frontend: it peer-required Svelte 4 (capping vite-plugin-svelte at 3
  and Vite at 5) and used `marked.Slugger`, removed in marked 7. Forcing marked 18 on
  it fails with `Slugger is not a constructor`.

### ⚠️ Prisma DateTime storage — read before touching the ORM

**Prisma 4 stored DateTime as INTEGER epoch milliseconds. Prisma 7 stores and *binds*
it as ISO-8601 TEXT.** SQLite orders by storage class before value, and INTEGER always
sorts before TEXT — so after the upgrade every legacy row satisfied
`expire_time <= <now as text>` and `deleteExpiredNotes()` purged the entire table on
its first tick, ten minutes after deploy. This happened in production.

`migrations/20260911120000_datetime_integer_to_text` converts legacy rows and is
idempotent (`typeof()`-guarded). `src/db/legacyDateTime.integration.test.ts` covers
both directions.

**The lesson generalises:** a Prisma major upgrade can change the on-disk
representation without changing the schema, and the schema-diff migrations Prisma
generates will not mention it. Before deploying an ORM major bump, dump the raw
column types from a copy of the live database:

```bash
sqlite3 db.sqlite "select id, typeof(expire_time), expire_time from EncryptedNote limit 3;"
```

and check they still look the way the new version writes them.

### Other build constraints

- **`better-sqlite3` is compiled from source** in the build image, so
  `/cloud/noteshare/build/server.Dockerfile` installs `python3 make g++` in the build
  stage. Ad-hoc `docker run node:24-slim npm install` needs the same, or it dies in
  node-gyp — and because npm hides install-script failures, the visible symptom is
  `npx prisma generate` spinning at 100% CPU forever while it tries to fetch the
  package it never installed.
- `tsconfig.json` sets `rootDir: ./src`, so the entrypoint is **`build/server.js`**
  (upstream emitted `build/src/server.js`).
- Vitest needs `resolve.conditions: ['browser']` (see `vite.config.js`), or
  `@testing-library/svelte` gets Svelte 5's **server** build and every `render()` fails
  with `mount(...) is not available on the server`.

## The strikethrough bug (fixed 2026-09-11)

Symptom: a note using `~` to mean "approximately" ("647 km · ~6:35 h") rendered with
large spans struck through on the web, but looked fine in Obsidian.

Cause: **marked follows GFM, which accepts a _single_ tilde as a strikethrough
delimiter.** Obsidian only accepts `~~`. Two unrelated "~approx" values in one
paragraph became `<del>` with everything between them struck out — the note that
prompted this produced **14 bogus `del` tokens**. marked only changed this default in
**v18**; 4, 5, 6, 7, 9, 12, 15, 16 and 17 all produce the same 14.

Fixed twice over: the stack is on marked 18 now, *and* `obsidianStrikethrough` in
`src/lib/marked/extensions.ts` overrides marked's `del` tokenizer to require `~~`.
The explicit rule is kept deliberately — it survives marked changing its mind again.
**It returns `undefined`, not `false`**: marked's `use()` re-runs its own tokenizer
when an override returns exactly `false`, which would reinstate the single-tilde match.

Covered by `src/test/markdown/strikethrough.test.ts`, including that real `~~text~~`
still renders.

## Markdown renderer wiring

`@humanspeak/svelte-markdown` takes custom marked extensions as a **prop**, not via a
global `marked.use()` — the component owns its own marked instance, and the prop is
also how it learns which custom token types (`internal-link`, `tag`, `math-block`, …)
are allowed to reach a renderer. Two traps:

- **Do not spread `marked.defaults` into `options`.** It carries `extensions: null`,
  which overwrites the prop and silently drops every custom token — `[[internal links]]`
  render as literal raw text with no error.
- **`onParsed` must `await tick()`.** The renderer fires the callback from its own
  `$effect`, which can run before the parent's `bind:this={ref}` is assigned.

## Security posture

Production closure (`npm audit --omit=dev`), 2026-09-11:

- **server: 0 vulnerabilities**
- **webapp: 0 vulnerabilities**

Earlier rounds removed 3 criticals: `class-validator` (SQLi/XSS, reachable on every
POST), `crypto-js` (weak PBKDF2), and the `tar` chain that came in via an **unused**
`sqlite3` dependency. The Svelte 5 move cleared the last 2 moderates (SSR XSS
advisories that were in any case unreachable here). `mysql2`/`deepmerge-ts` arrive via
`@prisma/client -> prisma` (the CLI bundles drivers for every database) and are pinned
through `overrides` in `server/package.json`.

Always audit the **production** closure — the full audit is mostly devDependency noise
that `npm prune --omit=dev` strips from the image anyway.

## Development

Local Node should be **24**.

```bash
cd server  && npx prisma generate && npm test   # 39 tests
cd webapp  && npm test                          # 24 tests + 4 pre-existing skips
```

Things that will bite you:

- **`server/npm test` needs `prisma generate` first.** The client is generated into
  `src/generated/prisma` (gitignored), and nothing compiles without it.
- **The server tests require `.env.test`.** The npm scripts load it via `dotenv-cli`;
  running `vitest` directly gives 5 failures in `note.post.controller.unit.test.ts`
  (`expected 'undefined/note/1234' to match /^http[s]?:\/\//`) because `FRONTEND_URL`
  is unset. That is a harness mistake, not a regression.
- **Test files must run serially.** vitest 3 parallelises by file and these integration
  tests share one SQLite database; `test:test` passes `--no-file-parallelism`.
- **The rate-limit tests are timing-coupled.** `.env.test` uses a 2s window because a
  51-request burst no longer fits in the old 100ms one on Node 24, and the sleeps in
  `app.integration.test.ts` deliberately wait just past that window. Change one, change
  the other.
- **`npm run lint` reports ~30 pre-existing issues** in the webapp (mostly `{@html}`
  warnings, which are inherent — highlight.js and KaTeX output — and SvelteKit 2 style
  rules). They predate the migration; prettier is clean.

### Verifying a change the way it actually ships

A Mac has the wrong Node and (usually) the wrong arch. Build in the production image:

```bash
docker run --rm -v "$PWD/server:/app" -w /app node:24-slim sh -c \
  "apt-get update && apt-get install -y python3 make g++ && npm install && npx prisma generate && npm run build && npm test"

docker run --rm -v "$PWD/webapp:/app" -w /app node:24-slim sh -c \
  "npm install && npx svelte-kit sync && npx vitest run"
```

**On Apple Silicon, check the image arch first.** Production is amd64, so a cached
`node:24-slim` can easily be the amd64 variant, which Docker Desktop then runs under
Rosetta — `apt-get` plus a `better-sqlite3` compile that takes ~2 minutes natively runs
for tens of minutes, with no error to explain it. The tell is `/run/rosetta/rosetta` in
`docker top`.

```bash
docker image inspect node:24-slim --format '{{.Architecture}}'   # want arm64 locally
docker pull --platform linux/arm64 node:24-slim
```

Test locally on arm64 for speed; do the final pre-merge check on the server, which is
amd64 and builds against the real `/cloud/noteshare/build/*.Dockerfile`.

## Conventions

- Keep `master` deployable — it is what the server pulls.
- Do risky work on a branch, verify in `node:24-slim`, then merge.
- When bumping anything the webapp depends on, **run the crypto known-answer tests**
  and the markdown tests.
- When bumping anything the server depends on, check that a garbage POST still returns
  `400` — that is `class-validator` doing its job, and it is the only input validation
  there is.
- **Before any ORM major bump, check the raw on-disk column types** (see above). Take a
  copy of the live database first; `/cloud/noteshare/update.sh` does not back it up.
