# Deploy runbook

`apps/web` = OpenNext → Cloudflare Worker `paper-mill-platform`, D1 database,
Prisma 7 workerd client.

## 1. Before deploying — always

```bash
cd apps/web
npx tsc --noEmit -p tsconfig.json      # must be clean; the deploy build also lints
```

If `prisma/schema.prisma` changed:

```bash
cd ..                                   # repo root
npm run db:generate                     # regenerates the workerd client + patches the wasm compiler
```

## 2. If the schema change needs a DB migration

Migrations here are **hand-written flat `.sql` files** in `prisma/migrations/`
(not `prisma migrate`). Apply them **before** deploying the code that depends on
the new columns, or the live app errors on missing columns.

```bash
cd apps/web
# local dev DB (miniflare, what `next dev` uses):
npx wrangler d1 execute DB --local  --file "<ABSOLUTE path>\prisma\migrations\000X_name.sql"
# production D1:
npx wrangler d1 execute DB --remote --file "<ABSOLUTE path>\prisma\migrations\000X_name.sql"
```

Use an **absolute** `--file` path (relative paths resolve oddly from `apps/web`).
Verify with a `SELECT` afterward.

## 3. Deploy the code

```bash
cd apps/web
npm run build && npx @opennextjs/cloudflare build && npx wrangler deploy
```

- `npm run build` — `next build --turbopack` (~5–7 min, the slow part; turbopack
  is required — webpack can't parse the `.wasm?module` Prisma import)
- `npx @opennextjs/cloudflare build` — compiles the Next output into a Worker
  (`.open-next/worker.js`, ~3 min)
- `npx wrangler deploy` — upload (~30 s)

Total ~10 min.

## 4. Windows gotcha

`@opennextjs/cloudflare build` fails with `EPERM` / `EBUSY` on `.open-next` when a
`next dev`, leftover turbopack worker, or stale `wrangler` process still holds the
folder. Fix:

```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'erp-final' -and $_.CommandLine -match 'next dev|next-server|opennext|turbopack|wrangler' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item -Recurse -Force apps/web/.open-next, apps/web/.next -ErrorAction SilentlyContinue
```

Then re-run the deploy chain. Always kill `next dev` before a deploy.

## 5. Secrets

Runtime secrets are Worker secrets, not `.env`:

```bash
cd apps/web
npx wrangler secret put AUTH_SECRET          # or OPENAI_API_KEY, etc.
npx wrangler secret list
```

Caveat: if a key is present in `apps/web/.env` during `next build`, Next
**inlines** it into the bundle — so to rely on a runtime secret you must also
remove it from `.env` before building.

## 6. Post-deploy verification (don't skip)

```bash
curl -s https://paper-mill-platform.thewalkingjumbo.workers.dev/api/health   # {"status":"ok","db":"ok"}
```

Then a scripted login + hit a couple of authed routes / the changed feature.
`wrangler tail` (no `--status` filter — Next 500s show as HTTP 500 but "Ok" to
Cloudflare) to see the real error behind any redacted "digest" client error.

## 7. Git

- Work on a branch, never `main`.
- Stage **only the files you changed** (this repo carries unrelated pre-existing
  uncommitted UI changes — a blind `git add -A` sweeps them in).
- One deploy = one commit, conventional-commit style.
