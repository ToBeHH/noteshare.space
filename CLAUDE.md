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

## Build constraints (do not "modernise" casually)

The production images are pinned to **`node:16-alpine3.16`**. Both halves of that pin are
load-bearing:

- **`alpine3.16`** is the last Alpine with **OpenSSL 1.1**, which the **Prisma 4** musl
  query engine links against. On 3.17+ the backend dies at runtime with
  `Unable to require libquery_engine-linux-musl.so.node`.
- **`node:16`** because SvelteKit `1.0.0-next.544` + Vite 3 are from 2022.

Moving off Node 16 means moving Prisma **and** the whole SvelteKit/Vite stack at the same
time. See "Node 16 is EOL" below for the measured state of that.

The Dockerfiles used in production are **not** the ones in this repo — they live in
`/cloud/noteshare/build/` on the server, so that `git reset --hard` here can't clobber
them. If you change `server/Dockerfile` or `webapp/Dockerfile` here, nothing happens to
the deployment.

## Security posture

### What was fixed (2026-09-11, commit `9d07b34`)

Production closure went from **3 critical + 21 high** to **0 critical**:

| Change | Why |
|---|---|
| `class-validator` 0.13.2 → 0.14.4 | **CRITICAL** GHSA-fj58-h2fr-3pp2 (SQLi/XSS). Genuinely reachable — `validateOrReject()` runs on every POST/DELETE `/api/note`. Also drags `validator` 13.7.0 → 13.15.x (2 highs). |
| **removed `sqlite3`** | **CRITICAL** tar advisories came in through `sqlite3` → `node-gyp`/`@mapbox/node-pre-gyp`. The package was **never imported anywhere** — Prisma ships its own SQLite engine. Removing it also killed ~10 highs (cacache, make-fetch-happen, ip, socks, semver, minimatch…) and removed the need for `python3/make/g++` in the build image. |
| **removed `body-parser`** | Declared but unused; the code uses `express.json()`. |
| `crypto-js` 4.1.1 → 4.2.0 | **CRITICAL** GHSA-xwcq-pm8m-c4vf (PBKDF2 1.3M× weaker than standard). |
| `katex` 0.16.0 → 0.16.47 | 4 moderates, and it *is* real surface — KaTeX output is injected with `{@html}`. |
| `@sveltejs/adapter-node` → devDependencies | It's a build-time adapter whose `build/` output is self-contained. Dropped rollup, picomatch, minimatch, brace-expansion (4 highs) out of the runtime image. |
| `express` → 4.21.2, `bloom-filters` → 3.0.4, `crc` → 4.3.2, `express-rate-limit` → 6.11.2 | Assorted highs; `bloom-filters` 3.0.4 drops the vulnerable lodash. |

**The crypto-js bump was the scary one.** GHSA-xwcq-pm8m-c4vf is about `CryptoJS.PBKDF2`
defaults changing (1 iteration/SHA1 → 250 000/SHA256). `decrypt_v1` does *not* use PBKDF2 —
`AES.decrypt(ciphertext, passphrase)` derives its key with **EvpKDF**, which 4.2.0 did not
touch. Verified empirically: `decrypt.test.ts` known-answer vectors, **6/6 pass** on
node:16-alpine3.16 after the bump. Old notes still decrypt.

### What is deliberately left, and why

| Finding | Assessment |
|---|---|
| `svelte <=5.55.6` — 9 high SSR XSS advisories | **Not reachable.** Every one of them needs a pattern this codebase does not contain: grep confirms **no** spread attributes in markup, **no** `<svelte:element>`, **no** `bind:innerText`/`bind:textContent`/`contenteditable`, **no** `<textarea>`. Fixing it means Svelte 3 → 5 *and* SvelteKit 1.0-next → 2, i.e. rewriting the frontend. Not worth it for advisories that cannot fire. |
| `qs` moderate (server, via express 4) | Express 4 pins its own `qs`. The app never reads `req.query`, so `qs.parse` is never even invoked. Clearing it needs express 5 + express-rate-limit 7+. |
| devDependency advisories (`vitest`, `happy-dom`, `@babel/traverse`, `form-data`, `tar`) | Never reach the server: the Dockerfiles run `npm ci` → `npm run build` → **`npm prune --production`**. They also don't fire during the build — `vitest`/`happy-dom` criticals need the test runner to actually run, which the image build never does. |
| Markdown → `{@html}` in `Code.svelte` / `Math.svelte` | Inherent to the app: a note author can attempt XSS against a note *viewer*. Client-side only, does not touch the server. highlight.js and KaTeX (with default `trust: false`) escape their output. |

### Node 16 is EOL — the real remaining risk

`npm audit` says nothing about the runtime, and that's where the actual unpatched
CVE surface is. **Node 16 went EOL 2023-09-11** and **Alpine 3.16 went EOL 2024-05-23**
(so its OpenSSL 1.1 is also unpatched). Nothing in that stack will ever get another
security fix.

Mitigating context for this deployment: the containers bind to `127.0.0.1` only, sit
behind nginx, and terminate no TLS themselves — so the OpenSSL exposure is close to nil and
HTTP-parser DoS bugs are largely absorbed by nginx first.

See the bottom of this file for the measured feasibility of moving off it.

### Re-auditing

Always audit the **production** closure — the full audit is mostly devDependency noise:

```bash
cd server && npm audit --package-lock-only --omit=dev
cd webapp && npm audit --package-lock-only --omit=dev
```

`--package-lock-only` means you don't need `node_modules` installed. Note that plain
`npm audit fix` **fails with ERESOLVE** in `webapp/` (the SvelteKit-next peer graph is
unsatisfiable to npm); edit `package.json` and re-run `npm install --package-lock-only`
instead.

## Development

`npm ci` in each subproject. Local Node must be **16** for a faithful build; a modern Node
will produce a lockfile the production image can't install.

```bash
cd server  && npx dotenv -e .env.test -- npx vitest run unit   # 23 tests
cd webapp  && npx vitest run src/lib/crypto/decrypt.test.ts    # 6 crypto known-answer tests
```

Note `npm test` in `server/` also runs `prisma migrate reset`, which wants a database —
`vitest run unit` alone is enough for a quick check. The unit tests **require `.env.test`
to be loaded**; without it 5 tests in `note.post.controller.unit.test.ts` fail on
`expected 'undefined/note/1234' to match /^http[s]?:\/\//` because `FRONTEND_URL` is
unset. That's a harness mistake, not a regression — don't go chasing it.

### Verifying a change the way it actually ships

Local `npm ci` on an Apple-silicon Mac is *not* a faithful test (different arch, different
Node). Build in the production image instead:

```bash
docker run --rm -v "$PWD/server:/app" -w /app node:16-alpine3.16 \
  sh -c "npm ci && npx prisma generate && npm run build && npx dotenv -e .env.test -- npx vitest run unit"
```

For a full pre-merge check, push the branch and build it on the server against the real
`/cloud/noteshare/build/*.Dockerfile`, which is what production uses.

## Conventions

- Keep `master` deployable — it is what the server pulls.
- Do security work on a branch, verify in `node:16-alpine3.16`, then merge.
- When bumping anything the webapp depends on, **run the crypto known-answer tests**.
- When bumping anything the server depends on, check that a garbage POST still returns
  `400` — that is `class-validator` doing its job, and it is the only input validation
  there is.
