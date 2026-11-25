/* Brocettes Companion API, on Cloudflare KV (binding THEORIES holds everything):
   - /api/theories   shared theory board (see docs/theory-board.md)
   - /api/feedback   app suggestions from the players
   - /api/push/*     push notification sign-up, topics and test (see docs/notifications.md)
   - scheduled()     notices new session notes and sends the game-night reminder
   Every other path falls through to the static site (binding ASSETS). */
import { vapidKeys, sendPush } from "./push.js";

const SITE = "https://brocettes.phandelin.workers.dev";
const TOPICS = ["notes", "suggestions", "theories", "reminder"];
const MAX_THEORIES = 2000, MAX_FEEDBACK = 1000, MAX_SUBS = 200;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const bad = (error, status = 400) => json({ error }, status);
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const publicView = ({ token, sub, ...t }) => t; // never hand out delete tokens or push endpoints
const short = (s, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const read = async (env, key) => (await env.THEORIES.get(key, "json")) || [];
const write = (env, key, list) => env.THEORIES.put(key, JSON.stringify(list));

// ---------- push: send to everyone who picked a topic (except the person who caused it) ----------
async function notify(env, topic, message, exceptEndpoint) {
  const subs = await read(env, "push:subs");
  const targets = subs.filter((s) => s.topics?.includes(topic) && s.endpoint !== exceptEndpoint);
  if (!targets.length) return 0;
  const keys = await vapidKeys(env.THEORIES);
  const gone = new Set();
  await Promise.all(targets.map(async (s) => {
    try { const st = await sendPush(s, { tag: topic, ...message }, keys, SITE); if (st === 404 || st === 410) gone.add(s.endpoint); }
    catch (e) { console.error("push failed", e); }
  }));
  if (gone.size) await write(env, "push:subs", subs.filter((s) => !gone.has(s.endpoint)));
  return targets.length - gone.size;
}
const validSub = (s) => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";

// A tiny shared "list you can add to, vote on and delete your own from" used by theories and feedback.
async function board(request, env, ctx, { key, max, make, onAdd }) {
  const list = await read(env, key);
  const url = new URL(request.url), sub = url.pathname.replace(/^\/api\/[a-z]+/, "").replace(/\/+$/, "");
  if (request.method === "GET" && !sub) return json({ items: list.map(publicView) });
  if (!["POST", "DELETE"].includes(request.method)) return bad("Method not allowed", 405);
  let body;
  try { body = await request.json(); } catch { return bad("Expected JSON"); }
  if (request.method === "POST" && !sub) {
    const made = make(body);
    if (made.error) return bad(made.error);
    if (list.length >= max) return bad("The board is full", 507);
    const item = { id: crypto.randomUUID().slice(0, 8), ...made, at: new Date().toISOString(), votes: [], token: crypto.randomUUID() };
    list.push(item);
    await write(env, key, list);
    if (onAdd) ctx.waitUntil(onAdd(item, clean(body.sub, 1000)).catch((e) => console.error(e)));
    return json(item, 201); // the creator gets the token so they can delete it later
  }
  if (request.method === "POST" && sub === "/vote") {
    const t = list.find((x) => x.id === body.id), voter = clean(body.voter, 64);
    if (!t || !voter) return bad("Not found", 404);
    t.votes = t.votes.includes(voter) ? t.votes.filter((v) => v !== voter) : [...t.votes, voter];
    await write(env, key, list);
    return json(publicView(t));
  }
  if (request.method === "DELETE" && !sub) {
    const i = list.findIndex((x) => x.id === body.id);
    if (i < 0) return bad("Not found", 404);
    if (list[i].token !== body.token) return bad("Only the person who posted it can delete it", 403);
    list.splice(i, 1);
    await write(env, key, list);
    return json({ ok: true });
  }
  return bad("Not found", 404);
}

async function api(request, env, ctx, path) {
  if (!env.THEORIES) return bad("Storage isn't connected yet", 503);

  if (path.startsWith("/api/theories")) {
    const res = await board(request, env, ctx, {
      key: "theories", max: MAX_THEORIES,
      make: (b) => {
        const mystery = clean(b.mystery, 80), author = clean(b.author, 40), text = clean(b.text, 500);
        if (!/^[a-z0-9-]+$/.test(mystery)) return { error: "Unknown mystery" };
        if (!author || !text) return { error: "Name and theory are both needed" };
        return { mystery, author, text };
      },
      onAdd: (t, from) => notify(env, "theories", { title: `New theory from ${t.author}`, body: short(t.text), url: `#/e/${t.mystery}` }, from),
    });
    // The theory board's client reads { theories }.
    if (request.method === "GET" && res.ok) {
      const m = new URL(request.url).searchParams.get("mystery");
      const { items } = await res.json();
      return json({ theories: items.filter((t) => !m || t.mystery === m) });
    }
    return res;
  }

  if (path.startsWith("/api/feedback")) {
    return board(request, env, ctx, {
      key: "feedback", max: MAX_FEEDBACK,
      make: (b) => {
        const author = clean(b.author, 40), text = clean(b.text, 1000), kind = ["idea", "bug", "other"].includes(b.kind) ? b.kind : "idea";
        if (!author || !text) return { error: "Name and suggestion are both needed" };
        return { author, text, kind };
      },
      onAdd: (f, from) => notify(env, "suggestions", { title: `${f.kind === "bug" ? "Bug report" : "New suggestion"} from ${f.author}`, body: short(f.text), url: "#/feedback" }, from),
    });
  }

  if (path === "/api/push/key" && request.method === "GET") return json({ publicKey: (await vapidKeys(env.THEORIES)).pub, topics: TOPICS });
  if (path.startsWith("/api/push/") && request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { return bad("Expected JSON"); }
    const subs = await read(env, "push:subs");
    if (path === "/api/push/subscribe") {
      if (!validSub(body.subscription)) return bad("That doesn't look like a push subscription");
      const topics = (Array.isArray(body.topics) ? body.topics : []).filter((t) => TOPICS.includes(t));
      const rest = subs.filter((s) => s.endpoint !== body.subscription.endpoint);
      if (rest.length >= MAX_SUBS) return bad("Too many devices signed up", 507);
      const { endpoint, keys } = body.subscription;
      rest.push({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, topics, name: clean(body.name, 40), at: new Date().toISOString() });
      await write(env, "push:subs", rest);
      return json({ ok: true, topics });
    }
    if (path === "/api/push/unsubscribe") {
      await write(env, "push:subs", subs.filter((s) => s.endpoint !== body.endpoint));
      return json({ ok: true });
    }
    if (path === "/api/push/test") {
      const s = subs.find((x) => x.endpoint === body.endpoint);
      if (!s) return bad("This device isn't signed up", 404);
      const st = await sendPush(s, { tag: "test", title: "Notifications are on", body: "You'll hear from the Brocettes Companion here.", url: "#/notify" }, await vapidKeys(env.THEORIES), SITE);
      return st >= 200 && st < 300 ? json({ ok: true }) : bad(`The push service said ${st}`, 502);
    }
  }
  return bad("Not found", 404);
}

// ---------- scheduled jobs (crons in wrangler.jsonc) ----------
async function latestSession(env) {
  const r = await env.ASSETS.fetch(new Request(`${SITE}/data/sessions.json`));
  const list = await r.json();
  return list.reduce((a, b) => (b.number > a.number ? b : a));
}
async function checkNewNotes(env) {
  const s = await latestSession(env);
  const seen = Number(await env.THEORIES.get("push:lastSession"));
  if (seen === s.number) return;
  await env.THEORIES.put("push:lastSession", String(s.number));
  if (!seen) return; // first run just remembers where we are
  if (s.number > seen) await notify(env, "notes", { title: `Session ${s.number} notes are in`, body: s.title, url: `#/s/${s.number}` });
}
async function gameNightReminder(env) {
  const s = await latestSession(env);
  await notify(env, "reminder", { title: `Game night: Session ${s.number + 1}`, body: "Check where you left off and what you promised.", url: "#/prep" });
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path.startsWith("/api/")) return api(request, env, ctx, path);
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    if (!env.THEORIES) return;
    ctx.waitUntil(event.cron === REMINDER_CRON ? gameNightReminder(env) : checkNewNotes(env));
  },
};
// Keep in step with "triggers" in wrangler.jsonc. Tuesdays 21:00 UTC (4pm Eastern, 1pm Pacific).
const REMINDER_CRON = "0 21 * * 2";
