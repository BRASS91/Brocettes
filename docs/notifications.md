# Notifications and suggestions

## What players get
Each phone or computer signs up on **Home → Notifications** (`#/notify`) and picks topics:

| Topic | Sent when | Opens |
|---|---|---|
| New session notes | A new session appears in `data/sessions.json` (checked every 30 minutes) | That session |
| Suggestions | Someone posts in Feedback | `#/feedback` |
| Theory board | Someone posts a theory | That mystery |
| Game night reminder | Tuesdays 21:00 UTC (4pm Eastern / 1pm Pacific) | `#/prep` |

Nobody is notified about something they posted themselves. iPhone/iPad users must add the
site to their Home Screen and open it from there first (iOS 16.4+); the page explains this.

## How it works
- `sw.js` (service worker) shows notifications and opens the right page on tap. It caches nothing.
- `features/notify.js` handles sign-up; `features/feedback.js` the feedback button, sheet and `#/feedback`.
- `worker/index.js` stores subscriptions, suggestions and theories in the `THEORIES` KV namespace
  (keys `push:subs`, `feedback`, `theories`) and sends pushes; `worker/push.js` does Web Push
  (VAPID signing and aes128gcm encryption) with WebCrypto, no packages.
- The VAPID key pair is generated on first use and kept in KV (`push:vapid`), so there's no secret
  to set up. Deleting that key signs everyone out of notifications.
- Crons live in `wrangler.jsonc` (`triggers`). To move the reminder, change both the cron there and
  `REMINDER_CRON` in `worker/index.js` (times are UTC).

## Limits
Up to 200 signed-up devices, 1,000 suggestions (1,000 characters each). No sign-in: anyone with the
link can post and vote; only the device that posted something can delete it.
