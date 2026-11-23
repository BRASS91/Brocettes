# Theory board: switching on shared theories

The theory board (`#/theories` and the "Theory board" section on every mystery page) is
shared: everyone sees the same theories and votes. It's switched on (Nov 23, 2026) with the
KV namespace `brocettes-theories` bound to the `brocettes` Worker in `wrangler.jsonc`.
If the API ever can't be reached, the board falls back to saving on each device.

## What it uses
- `worker/index.js`: answers `/api/theories` (list, post, vote, delete your own) and hands
  every other request to the static site, so nothing else changes.
- A Cloudflare **KV namespace** bound as `THEORIES`. Everything is stored under one key.
- `wrangler.jsonc`: the Worker config (name, assets, KV binding). `.assetsignore` keeps
  `.git`, `worker/`, `scripts/` and `docs/` off the public site.

## How it was set up (for reference)
1. In the Cloudflare dashboard go to **Storage & Databases → Workers KV → Create**, name it
   `brocettes-theories`, and copy its **ID**.
2. Check the Worker's name under **Workers & Pages** (the site is
   `brocettes.phandelin.workers.dev`, so it's probably `brocettes`).
3. Put the ID and name in `wrangler.jsonc`, commit and push. The next deploy serves the API.

If the Worker's build settings use a custom deploy command instead of `npx wrangler deploy`,
switch it back to the default so the config is picked up.

## Limits and privacy
- Up to 2,000 theories, 500 characters each, names up to 40 characters.
- No sign-in: anyone with the site link can post and vote. Votes are one per device.
  Only the device that posted a theory can delete it.
