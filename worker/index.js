/* Brocettes Companion API: the shared theory board.
   Serves /api/theories from Cloudflare KV (binding THEORIES); every other path falls
   through to the static site (binding ASSETS). See docs/theory-board.md. */
const KEY = "theories";
const MAX_THEORIES = 2000;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const bad = (error, status = 400) => json({ error }, status);
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const publicView = ({ token, ...t }) => t; // never hand out other people's delete tokens

async function readAll(env) { return (await env.THEORIES.get(KEY, "json")) || []; }
async function writeAll(env, list) { await env.THEORIES.put(KEY, JSON.stringify(list)); }

async function api(request, env, path) {
  if (!env.THEORIES) return bad("Theory storage isn't connected yet", 503);
  const list = await readAll(env);
  if (request.method === "GET" && path === "/api/theories") {
    const m = new URL(request.url).searchParams.get("mystery");
    return json({ theories: list.filter((t) => !m || t.mystery === m).map(publicView) });
  }
  if (!["POST", "DELETE"].includes(request.method)) return bad("Method not allowed", 405);
  let body;
  try { body = await request.json(); } catch { return bad("Expected JSON"); }

  if (request.method === "POST" && path === "/api/theories") {
    const mystery = clean(body.mystery, 80), author = clean(body.author, 40), text = clean(body.text, 500);
    if (!/^[a-z0-9-]+$/.test(mystery)) return bad("Unknown mystery");
    if (!author || !text) return bad("Name and theory are both needed");
    if (list.length >= MAX_THEORIES) return bad("The board is full", 507);
    const t = { id: crypto.randomUUID().slice(0, 8), mystery, author, text, at: new Date().toISOString(), votes: [], token: crypto.randomUUID() };
    list.push(t);
    await writeAll(env, list);
    return json(t, 201); // the creator gets the token so they can delete it later
  }
  if (request.method === "POST" && path === "/api/theories/vote") {
    const t = list.find((x) => x.id === body.id), voter = clean(body.voter, 64);
    if (!t || !voter) return bad("Unknown theory", 404);
    t.votes = t.votes.includes(voter) ? t.votes.filter((v) => v !== voter) : [...t.votes, voter];
    await writeAll(env, list);
    return json(publicView(t));
  }
  if (request.method === "DELETE" && path === "/api/theories") {
    const i = list.findIndex((x) => x.id === body.id);
    if (i < 0) return bad("Unknown theory", 404);
    if (list[i].token !== body.token) return bad("Only the person who posted it can delete it", 403);
    list.splice(i, 1);
    await writeAll(env, list);
    return json({ ok: true });
  }
  return bad("Not found", 404);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path.startsWith("/api/")) return api(request, env, path);
    return env.ASSETS.fetch(request);
  },
};
