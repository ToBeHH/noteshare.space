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

Modernized 2026-09-11 (commit `f6e6a0f`) off the EOL Node 16 / Alpine 3.16 base.

| | Was (upstream) | Now |
|---|---|---|
| Runtime | Node 16 + Alpine 3.16 (both EOL) | **Node 24 LTS + Debian slim** |
| ORM | Prisma 4 (bundled Rust engine) | **Prisma 7** + `better-sqlite3` driver adapter |
| Server | Express 4, rate-limit 6, helmet 5, pino 8 | **Express 5**, rate-limit 8, helmet 8, pino 10 |
| Frontend | SvelteKit `1.0.0-next.544`, Svelte 3, Vite 3 | **SvelteKit 2**, Svelte 4, Vite 5 |
| Markdown | marked 4, svelte-markdown 0.2 | marked 6, svelte-markdown 0.4 |
| Tooling | TS 4.7, vitest 0.17, ts-node, nodemon, c8 | TS 5.9, vitest 3, tsx |

**Prisma 7 is what unlocked the runtime upgrade.** It has no bundled query engine —
the database is reached through a driver adapter — so the OpenSSL-1.1/musl coupling
that pinned the old image to `alpine3.16` is simply gone.

Things to know before changing versions:

- **`svelte-markdown` is the ceiling on everything frontend.** It peer-requires
  `svelte@^4`, which caps `@sveltejs/vite-plugin-svelte` at 3.x, which caps Vite at 5.
  And it uses `marked.Slugger`, removed in **marked 7**, so marked cannot go past 6
  — `overrides` forcing marked 18 makes it throw `Slugger is not a constructor`.
  Breaking that chain means replacing it (see "Remaining work").
- **`better-sqlite3` is compiled from source** in the build image (no prebuilt binary
  for this Node/platform), so `/cloud/noteshare/build/server.Dockerfile` installs
  `python3 make g++` in the build stage. If `npm ci` starts failing with node-gyp
  errors, that is what to look at.
- `tsconfig.json` sets `rootDir: ./src`, so the entrypoint is **`build/server.js`**
  (upstream emitted `build/src/server.js`). The Dockerfile CMD matches.

## The strikethrough bug (fixed 2026-09-11)

Symptom: a note using `~` to mean "approximately" ("647 km · ~6:35 h") rendered with
large spans struck through on the web, but looked fine in Obsidian.

Cause: **marked follows GFM, which accepts a _single_ tilde as a strikethrough
delimiter.** Obsidian only accepts `~~`. Two unrelated "~approx" values in one
paragraph therefore became `<del>` with everything between them struck out. The note
that prompted this produced **14 bogus `del` tokens**.

marked only changed this default in **v18** — 4, 5, 6, 7, 9, 12, 15, 16 and 17 all
produce the same 14 bad tokens, and v18 is unreachable (see the Slugger note above).

Fix: `obsidianStrikethrough` in `src/lib/marked/extensions.ts` overrides marked's `del`
tokenizer to require `~~`, registered in `MarkdownRenderer.svelte` next to the other
extensions. **It returns `undefined`, not `false`** — marked's `use()` re-runs its own
tokenizer when an override returns exactly `false`, which would put the single-tilde
match straight back. An explicit rule is also version-proof, which matters given the
marked ceiling.

Covered by `src/test/markdown/strikethrough.test.ts`, including that real `~~text~~`
still renders.

## Security posture

Production closure (`npm audit --omit=dev`) as of 2026-09-11:

- **server: 0 vulnerabilities.**
- **webapp: 2 moderate**, both `svelte <=5.55.6` SSR XSS advisories.

The svelte ones are **not reachable**: grep confirms the codebase contains none of the
patterns they need — no spread attributes in markup, no `<svelte:element>`, no
`bind:innerText`/`bind:textContent`/`contenteditable`, no `<textarea>`. There is no fix
short of Svelte 5, which `svelte-markdown` blocks.

Earlier rounds removed 3 criticals: `class-validator` (SQLi/XSS, reachable on every
POST), `crypto-js` (weak PBKDF2), and the `tar` chain that came in via an **unused**
`sqlite3` dependency. `mysql2`/`deepmerge-ts` arrive through `@prisma/client -> prisma`
(the CLI bundles drivers for every database); they are pinned via `overrides` in
`server/package.json` and are never loaded by a SQLite-only app.

Always audit the **production** closure — the full audit is mostly devDependency noise
that `npm prune --omit=dev` strips from the image anyway.

## Development

Local Node should be **24**. `npm install` in each subproject.

```bash
cd server  && npx prisma generate && npm test   # 37 tests, needs the generate first
cd webapp  && npm test                          # 24 tests + 4 pre-existing skips
```

Things that will bite you:

- **`server/npm test` needs `prisma generate` first.** The client is generated into
  `src/generated/prisma` (gitignored), and nothing compiles without it.
- **The unit tests require `.env.test`.** The npm scripts load it via `dotenv-cli`;
  running `vitest` directly gives 5 failures in `note.post.controller.unit.test.ts`
  (`expected 'undefined/note/1234' to match /^http[s]?:\/\//`) because `FRONTEND_URL`
  is unset. That is a harness mistake, not a regression.
- **Test files must run serially.** vitest 3 parallelises by file and these integration
  tests share one SQLite database; `test:test` passes `--no-file-parallelism`.
- **The rate-limit tests are timing-coupled.** `.env.test` uses a 2s window because a
  51-request burst no longer fits in the old 100ms one on Node 24, and the sleeps in
  `app.integration.test.ts` deliberately wait just past that window so later tests can
  make requests again. Change one, change the other.

### Verifying a change the way it actually ships

A Mac has neither the right arch nor the right Node. Build in the production image:

```bash
docker run --rm -v "$PWD/server:/app" -w /app node:24-slim sh -c \
  "apt-get update && apt-get install -y python3 make g++ && npm ci && npx prisma generate && npm run build && npm test"
```

For a full pre-merge check, push the branch and build it on the server against the real
`/cloud/noteshare/build/*.Dockerfile` — that is what production uses.

## Remaining work

**Svelte 5 / marked 18.** Replacing `svelte-markdown` with a Svelte-5-compatible
renderer (e.g. `@humanspeak/svelte-markdown`, which already uses marked 18) would
unlock Svelte 5, Vite 7/8 and marked 18, and clear the last 2 moderate advisories.
It is the only thing left on the modernization path — but it swaps out the component
that renders notes, and the custom renderers in `src/lib/marked/renderers/` would need
re-verifying against its API. The strikethrough fix does not depend on it.

## Conventions

- Keep `master` deployable — it is what the server pulls.
- Do risky work on a branch, verify in `node:24-slim`, then merge.
- When bumping anything the webapp depends on, **run the crypto known-answer tests**
  and the markdown tests.
- When bumping anything the server depends on, check that a garbage POST still returns
  `400` — that is `class-validator` doing its job, and it is the only input validation
  there is.
