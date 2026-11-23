/* Shared theory board: players post theories on open mysteries and vote on them.
   Shared through the site's /api/theories endpoint (worker/index.js, Cloudflare KV).
   Until that endpoint is switched on, theories are kept on this device only. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const API = "api/theories";
  const LOCAL = "bro.theories.local.v1", ME = "bro.me.v1", MINE = "bro.theories.mine.v1";
  let cache = null, shared = null; // shared: true once the API answers, false if it doesn't

  const me = () => { let m = B.store.get(ME); if (!m) { m = { voter: Math.random().toString(36).slice(2) + Date.now().toString(36), name: "" }; B.store.set(ME, m); } return m; };
  const mine = () => B.store.get(MINE) || {};

  async function fetchAll() {
    try {
      const r = await fetch(API, { headers: { accept: "application/json" } });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error(r.status);
      cache = (await r.json()).theories || []; shared = true;
    } catch { cache = B.store.get(LOCAL) || []; shared = false; }
    return cache;
  }
  async function post(body, method = "POST", path = "") {
    if (shared) {
      const r = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't save that");
      return r.json();
    }
    // Local fallback mirrors the API.
    const all = B.store.get(LOCAL) || [];
    if (path === "/vote") { const t = all.find((x) => x.id === body.id); if (t) t.votes = t.votes.includes(body.voter) ? t.votes.filter((v) => v !== body.voter) : [...t.votes, body.voter]; }
    else if (method === "DELETE") all.splice(all.findIndex((x) => x.id === body.id), 1);
    else { const t = { id: Math.random().toString(36).slice(2, 10), mystery: body.mystery, author: body.author, text: body.text, at: new Date().toISOString(), votes: [], token: "local" }; all.push(t); B.store.set(LOCAL, all); return t; }
    B.store.set(LOCAL, all);
    return {};
  }

  const sorted = (list) => [...list].sort((a, b) => b.votes.length - a.votes.length || a.at.localeCompare(b.at));
  function theoryCard(t, withMystery) {
    const voted = t.votes.includes(me().voter), own = mine()[t.id];
    return `<div class="card theory">
      ${withMystery ? `<a class="sub" href="#/e/${encodeURIComponent(t.mystery)}">${esc(B.nameOf(t.mystery))}</a>` : ""}
      <span>${esc(t.text)}</span>
      <div class="between"><span class="sub">${esc(t.author || "Someone")} · ${new Date(t.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span class="row">${own ? `<button type="button" class="linkish" data-th-del="${esc(t.id)}">Delete</button>` : ""}
        <button type="button" class="vote" aria-pressed="${voted}" data-th-vote="${esc(t.id)}" aria-label="${voted ? "Remove your vote" : "Agree"}">▲ ${t.votes.length}</button></span></div></div>`;
  }
  const status = () => shared === false ? `<p class="sub">Shared theories aren't switched on yet, so yours are saved on this device only.</p>` : "";
  const form = (mystery) => `<form class="card theory-form" data-th-form="${esc(mystery || "")}">
    ${mystery ? "" : `<label class="stack" style="gap:4px"><span class="sub">Which mystery?</span><select name="mystery" required>${B.D.mysteries.filter((m) => m.status === "open").map((m) => `<option value="${esc(m.id)}">${esc(m.question)}</option>`).join("")}</select></label>`}
    <textarea name="text" rows="3" maxlength="500" required placeholder="I think…"></textarea>
    <div class="row"><input name="author" maxlength="40" placeholder="Your name" value="${esc(me().name)}" required><button type="submit">Post theory</button></div></form>`;

  // Section on each mystery page; filled in after the page renders.
  B.hooks.mystery = [...(B.hooks.mystery || []), (m) => `<section class="stack" data-th-board="${esc(m.id)}"><h2>Theory board</h2><p class="sub">Loading theories…</p></section>`];
  async function fillBoard(el) {
    const id = el.dataset.thBoard;
    const list = sorted((await fetchAll()).filter((t) => t.mystery === id));
    el.innerHTML = `<h2>Theory board</h2>${list.map((t) => theoryCard(t)).join("") || `<p class="empty">No theories yet. Be the first.</p>`}${form(id)}${status()}`;
  }
  async function fillPage(el) {
    const list = sorted(await fetchAll());
    el.innerHTML = `${form(null)}${status()}${list.map((t) => theoryCard(t, true)).join("") || `<p class="empty">No theories yet.</p>`}`;
  }
  function refresh() {
    const board = B.app.querySelector("[data-th-board]"), page = B.app.querySelector("[data-th-page]");
    if (board) fillBoard(board); if (page) fillPage(page);
  }

  B.pages.theories = { render: () => `<a class="back" href="#/">‹ Home</a><h1>Theory board</h1><p class="sub">What does everyone think is going on? Post a theory on any open mystery and vote for the ones you agree with.</p><div class="stack" data-th-page><p class="sub">Loading theories…</p></div>`, tab: "codex" };
  B.after.push(() => refresh());
  B.app.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-th-form]");
    if (!f) return;
    e.preventDefault();
    const data = new FormData(f), author = String(data.get("author") || "").trim(), text = String(data.get("text") || "").trim();
    const mystery = f.dataset.thForm || String(data.get("mystery"));
    if (!author || !text) return;
    B.store.set(ME, { ...me(), name: author });
    f.querySelector("button[type=submit]").disabled = true;
    try { const t = await post({ mystery, author, text }); if (t.id) B.store.set(MINE, { ...mine(), [t.id]: t.token }); refresh(); }
    catch (err) { alert(err.message); f.querySelector("button[type=submit]").disabled = false; }
  });
  B.app.addEventListener("click", async (e) => {
    const v = e.target.closest("[data-th-vote]"), d = e.target.closest("[data-th-del]");
    if (v) { await post({ id: v.dataset.thVote, voter: me().voter }, "POST", "/vote").catch((err) => alert(err.message)); refresh(); }
    if (d && confirm("Delete your theory?")) { await post({ id: d.dataset.thDel, token: mine()[d.dataset.thDel] }, "DELETE").catch((err) => alert(err.message)); refresh(); }
  });
  B.explore.push(["#/theories", "Theory board", "Post and vote on theories about open mysteries"]);
})();
