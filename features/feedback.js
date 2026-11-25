/* Feedback: a speech-bubble button (top right, beside search) opens a sheet for app ideas
   and bug reports; #/feedback lists everyone's, with votes. Stored by /api/feedback
   (worker/index.js); falls back to this device only if the API can't be reached. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const API = "api/feedback", LOCAL = "bro.feedback.local.v1", ME = "bro.me.v1", MINE = "bro.feedback.mine.v1";
  const KINDS = [["idea", "Idea"], ["bug", "Something's broken"], ["other", "Other"]];
  const me = () => { let m = B.store.get(ME); if (!m) { m = { voter: Math.random().toString(36).slice(2) + Date.now().toString(36), name: "" }; B.store.set(ME, m); } return m; };
  const mine = () => B.store.get(MINE) || {};
  let shared = null;

  async function list() {
    try {
      const r = await fetch(API, { headers: { accept: "application/json" } });
      if (!r.ok || !(r.headers.get("content-type") || "").includes("json")) throw new Error(r.status);
      shared = true; return (await r.json()).items || [];
    } catch { shared = false; return B.store.get(LOCAL) || []; }
  }
  async function send(body, method = "POST", path = "") {
    if (shared === null) await list();
    if (shared) {
      const r = await fetch(API + path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Couldn't send that. Try again in a moment.");
      return data;
    }
    const all = B.store.get(LOCAL) || [];
    if (path === "/vote") { const f = all.find((x) => x.id === body.id); if (f) f.votes = f.votes.includes(body.voter) ? f.votes.filter((v) => v !== body.voter) : [...f.votes, body.voter]; B.store.set(LOCAL, all); return f; }
    if (method === "DELETE") { all.splice(all.findIndex((x) => x.id === body.id), 1); B.store.set(LOCAL, all); return {}; }
    const f = { id: Math.random().toString(36).slice(2, 10), author: body.author, kind: body.kind, text: body.text, at: new Date().toISOString(), votes: [], token: "local" };
    all.push(f); B.store.set(LOCAL, all); return f;
  }
  async function post(kind, author, text) {
    const sub = B.pushEndpoint ? await B.pushEndpoint() : "";
    const f = await send({ kind, author, text, sub });
    B.store.set(MINE, { ...mine(), [f.id]: f.token });
    B.store.set(ME, { ...me(), name: author });
    return f;
  }

  const formHTML = (id) => `<form class="fb-form stack" data-fb-form>
      <fieldset class="seg fb-kinds"><legend class="sr">What kind of feedback?</legend>
        ${KINDS.map(([k, label], i) => `<label class="pill"><input type="radio" name="kind" value="${k}" ${i ? "" : "checked"}><span>${label}</span></label>`).join("")}</fieldset>
      <label class="stack" style="gap:4px"><span class="sub">Your suggestion</span>
        <textarea id="${id}-text" name="text" rows="4" maxlength="1000" required placeholder="It'd be great if the app could…"></textarea></label>
      <div class="row wrap"><label class="grow-field"><span class="sr">Your name</span><input name="author" maxlength="40" required placeholder="Your name" value="${esc(me().name)}"></label>
        <button type="submit" class="btn">Send</button></div>
      <p class="sub fb-msg" role="status"></p></form>`;

  // ---------- the sheet ----------
  const sheet = document.createElement("div");
  sheet.className = "search-sheet fb-sheet"; sheet.id = "feedback-sheet"; sheet.hidden = true;
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-labelledby", "fb-title");
  sheet.innerHTML = `<div class="search-backdrop" data-close-fb></div>
    <div class="search-panel"><div class="between"><h2 id="fb-title" style="border:0;padding:0">Suggest something</h2><button type="button" class="search-close" data-close-fb>Close</button></div>
      <p class="sub" style="margin-top:-6px">Ideas for the app, or something that's not working. Everyone can see and vote on them.</p>
      <div class="fb-body">${formHTML("fbs")}</div>
      <p class="sub"><a href="#/feedback">See all suggestions</a> · <a href="#/notify">Get notified about new ones</a></p></div>`;
  document.body.append(sheet);
  const fab = document.querySelector(".feedback-fab");
  let timer = null;
  function open() {
    clearTimeout(timer);
    sheet.hidden = false; document.body.classList.add("sheet-open");
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("open")));
    sheet.querySelector("textarea").focus({ preventScroll: true });
  }
  function close(restore = true) {
    if (sheet.hidden) return;
    sheet.classList.remove("open"); document.body.classList.remove("sheet-open");
    timer = setTimeout(() => { sheet.hidden = true; resetSheet(); }, (B.reducedMotion ? B.reducedMotion() : matchMedia("(prefers-reduced-motion: reduce)").matches) ? 0 : 260);
    if (restore) fab?.focus({ preventScroll: true });
  }
  const resetSheet = () => { if (sheet.querySelector(".fb-thanks")) sheet.querySelector(".fb-body").innerHTML = formHTML("fbs"); };
  fab?.addEventListener("click", open);
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-fb]")) close();
    else if (e.target.closest("a[href^='#']")) close(false);
    else if (e.target.closest("[data-fb-again]")) { sheet.querySelector(".fb-body").innerHTML = formHTML("fbs"); sheet.querySelector("textarea").focus(); }
  });
  document.addEventListener("keydown", (e) => { if (!sheet.hidden && e.key === "Escape") { e.preventDefault(); close(); } });
  window.addEventListener("hashchange", () => close(false));

  // Both the sheet and the page use the same form.
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest("[data-fb-form]");
    if (!f) return;
    e.preventDefault();
    const d = new FormData(f), text = String(d.get("text") || "").trim(), author = String(d.get("author") || "").trim();
    const msg = f.querySelector(".fb-msg"), btn = f.querySelector("button[type=submit]");
    if (!text || !author) { msg.textContent = "Add your suggestion and your name."; return; }
    btn.disabled = true; msg.textContent = "Sending…";
    try {
      await post(String(d.get("kind") || "idea"), author, text);
      if (f.closest(".fb-sheet")) {
        f.closest(".fb-body").innerHTML = `<div class="card fb-thanks"><b>Thanks, ${esc(author)}!</b><span class="sub">${shared ? "Your suggestion is on the board for everyone to see." : "Saved on this device (the shared board isn't reachable right now)."}</span>
          <div class="row wrap"><a class="btn" href="#/feedback">See all suggestions</a><button type="button" class="btn ghost" data-fb-again>Suggest another</button></div></div>`;
      } else { f.reset(); f.querySelector("[name=author]").value = author; msg.textContent = "Thanks! It's on the board."; fillPage(); }
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });

  // ---------- #/feedback ----------
  const KIND_LABEL = { idea: "Idea", bug: "Bug", other: "Other" };
  function card(f) {
    const voted = f.votes.includes(me().voter), own = mine()[f.id];
    return `<div class="card"><div class="between"><span class="badge ${f.kind === "bug" ? "b-dead" : f.kind === "idea" ? "b-claimed" : "b-plain"}">${KIND_LABEL[f.kind] || "Idea"}</span>
        <span class="sub">${esc(f.author)} · ${new Date(f.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
      <span style="white-space:pre-line">${esc(f.text)}</span>
      <div class="between"><span>${own ? `<button type="button" class="linkish" data-fb-del="${esc(f.id)}">Delete</button>` : ""}</span>
        <button type="button" class="vote" aria-pressed="${voted}" data-fb-vote="${esc(f.id)}" aria-label="${voted ? "Remove your vote" : "Me too"}">▲ ${f.votes.length}</button></div></div>`;
  }
  async function fillPage() {
    const box = B.app.querySelector("[data-fb-page]");
    if (!box) return;
    const items = await list();
    const sort = box.dataset.sort || "top";
    items.sort(sort === "new" ? (a, b) => b.at.localeCompare(a.at) : (a, b) => b.votes.length - a.votes.length || b.at.localeCompare(a.at));
    box.innerHTML = `${shared === false ? `<p class="sub">The shared board isn't reachable, so suggestions are saved on this device only.</p>` : ""}
      <div class="between"><h2 style="border:0;padding:0">${items.length} suggestion${items.length === 1 ? "" : "s"}</h2>
        <nav class="seg" aria-label="Sort"><a href="javascript:void 0" role="button" data-fb-sort="top" aria-current="${sort === "top"}">Top</a><a href="javascript:void 0" role="button" data-fb-sort="new" aria-current="${sort === "new"}">Newest</a></nav></div>
      ${items.map(card).join("") || `<p class="empty">Nothing yet. Be the first.</p>`}`;
  }
  B.app.addEventListener("click", async (e) => {
    const v = e.target.closest("[data-fb-vote]"), del = e.target.closest("[data-fb-del]"), s = e.target.closest("[data-fb-sort]");
    if (s) { B.app.querySelector("[data-fb-page]").dataset.sort = s.dataset.fbSort; fillPage(); return; }
    try {
      if (v) { await send({ id: v.dataset.fbVote, voter: me().voter }, "POST", "/vote"); fillPage(); }
      if (del && confirm("Delete your suggestion?")) { await send({ id: del.dataset.fbDel, token: mine()[del.dataset.fbDel] }, "DELETE"); fillPage(); }
    } catch (err) { alert(err.message); }
  });

  B.pages.feedback = {
    render: () => `<a class="back" href="#/">‹ Home</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">For the app</span><h1>Suggestions</h1></div>
      <p class="sub">Ideas and bug reports from the table. Vote for the ones you want too.</p>
      <div class="card">${formHTML("fbp")}</div>
      <div class="stack" data-fb-page><p class="sub">Loading suggestions…</p></div>`,
    tab: "home",
  };
  B.after.push((page) => { if (page === "feedback") fillPage(); });
  B.explore.push(["#/feedback", "Suggestions", "Ideas and bug reports for the app"]);
})();
