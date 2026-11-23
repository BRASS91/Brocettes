# Theory board: switching on shared theories

The theory board (`#/theories` and the "Theory board" section on every mystery page) works
right away, but until this is set up each person's theories stay on their own phone.
Sharing them needs one small piece of storage in Cloudflare, next to the site.

## What it uses
- `worker/index.js`: answers `/api/theories` (list, post, vote, delete your own) and hands
  every other request to the static site, so nothing else changes.
- A Cloudflare **KV namespace** bound as `THEORIES`. Everything is stored under one key.
- `wrangler.jsonc.example`: the config that turns this on. It is deliberately *not* named
  `wrangler.jsonc` yet, so pushes keep deploying the site exactly as they do today.

## Steps (about two minutes)
1. In the Cloudflare dashboard go to **Storage & Databases → Workers KV → Create**, name it
   `brocettes-theories`, and copy its **ID**.
2. Check the Worker's name under **Workers & Pages** (the site is
   `brocettes.phandelin.workers.dev`, so it's probably `brocettes`).
3. Send both to Claude, or do it yourself: copy `wrangler.jsonc.example` to `wrangler.jsonc`,
   paste the ID, make `name` match the Worker, commit and push. The next deploy serves the API.

If the Worker's build settings use a custom deploy command instead of `npx wrangler deploy`,
switch it back to the default so the config is picked up.

## Limits and privacy
- Up to 2,000 theories, 500 characters each, names up to 40 characters.
- No sign-in: anyone with the site link can post and vote. Votes are one per device.
  Only the device that posted a theory can delete it.
