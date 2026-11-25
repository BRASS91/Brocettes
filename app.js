/* Brocettes Companion: a static, data-driven campaign wiki.
   Everything renders from data/*.json; routes live in the URL hash. */
(() => {
  const FILES = ["sessions", "characters", "npcs", "quests", "mysteries", "items", "locations", "factions", "lore", "ledger"];
  const D = {};
  const ALL = new Map(); // id -> { type, obj, name }
  const app = document.getElementById("app");

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
  const nameOf = (id) => ALL.get(id)?.name ?? id;
  const link = (id, label) => (ALL.has(id) ? `<a href="#/e/${encodeURIComponent(id)}">${esc(label ?? nameOf(id))}</a>` : esc(label ?? id));
  const chip = (id, prefix = "") => (ALL.has(id) ? `<a class="chip" href="#/e/${encodeURIComponent(id)}">${esc(prefix)}${esc(nameOf(id))}</a>` : "");
  // Session 0 is character creation (backstories shared before play); it has no session page.
  const sess = (list) => (list || []).map((n) => n === 0 ? `<span class="sess" title="Session 0: backstories shared before the campaign began">S0</span>` : `<a class="sess" href="#/s/${n}">S${n}</a>`).join(" ");
  const sessTile = (label, n) => n === 0 ? `<div class="tile" title="Session 0: backstories shared before the campaign began"><span>${label}</span><b style="font-size:18px">S0</b></div>` : `<a class="tile" href="#/s/${n}"><span>${label}</span><b style="font-size:18px">S${n}</b></a>`;
  const badge = (text, kind) => `<span class="badge b-${esc(kind || text)}">${esc(cap(text))}</span>`;
  const section = (title, body) => (body ? `<section class="stack"><h2>${esc(title)}</h2>${body}</section>` : "");
  const lastSession = () => D.sessions[D.sessions.length - 1];
  const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const tokenOf = (pc, pose = "standing") => pc?.tokens?.[pose] || pc?.tokens?.standing;
  const KIND = { character: "Party", npc: "NPC", quest: "Quest", mystery: "Mystery", item: "Item", location: "Place", faction: "Faction", lore: "Lore" };
  const CHECK = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>`;
  const RING = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5"/></svg>`;

  // Shared with the feature files (features/*.js), which register pages, home cards and page hooks.
  const B = window.Brocettes = {
    D, ALL, app, esc, cap, nameOf, link, chip, sess, badge, section, lastSession, fmtDate, tokenOf, KIND,
    pages: {},     // route name -> (arg, parts) => html
    hooks: {},     // hook name -> [(obj) => html]
    after: [],     // (page, arg) => void, run after every render
    explore: [     // [href, title, subtitle] cards on the home page
      ["#/prep", "Before next session", "Promises, live quests and who might turn up"],
      ["#/qotd", "Questions & recaps", "Question of the Day and who gave each recap"],
      ["#/quotes", "Quote wall", "The party's funniest and finest lines"],
    ],
    route: () => route(),
  };
  const hook = (name, obj) => (B.hooks[name] || []).map((f) => f(obj)).join("");

  function sessionsOf(obj) {
    const out = new Set();
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o)) {
          if (k === "sessions" && Array.isArray(v)) v.forEach((n) => out.add(n));
          else if (["session", "raised", "resolved", "started", "completed", "first_session", "last_session"].includes(k) && Number.isInteger(v)) out.add(v);
          else walk(v);
        }
      }
    })(obj);
    return [...out].sort((a, b) => a - b);
  }
  // things that point at id (backlinks)
  function backlinks(id) {
    const hits = [];
    for (const [oid, e] of ALL) {
      if (oid === id) continue;
      const o = e.obj;
      const refs = [o.giver, o.holder, o.location, o.parent, o.character, ...(o.related || []), ...(o.factions || []), ...(o.members || []), ...(o.notable_items || []), ...(o.personal_quests || [])];
      if (refs.includes(id)) hits.push(oid);
    }
    return hits;
  }

  Object.assign(B, { sessionsOf: (o) => sessionsOf(o), backlinks: (id) => backlinks(id), describe: (e) => describe(e), store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) } });

  // ---------- views ----------
  function home() {
    const s = lastSession();
    const active = D.quests.filter((q) => q.status === "active" && q.type !== "personal").length;
    const open = D.mysteries.filter((m) => m.status === "open").length;
    const seen = D.npcs.filter((n) => sessionsOf(n).includes(s.number)).map((n) => n.id);
    const pcs = D.characters.filter((c) => c.status === "active");
    const promises = allPromises();
    const waiting = promises.filter((p) => p.age >= 3 && p.last > 0).length;
    const quotes = allQuotes();
    const q = quotes.length ? quotes[Math.floor(Math.random() * quotes.length)] : null;
    return `
      <div class="stack" style="gap:4px">
        <span class="eyebrow">Next up · Session ${s.number + 1}</span>
        <h1>The Brocettes</h1>
        <span class="sub">${esc(D.ledger.in_game_date?.value || "")} · Level ${esc(D.ledger.level?.value ?? "")}</span>
      </div>
      <div class="party small">${pcs.map(pcLink).join("")}</div>
      ${whatsNewCard()}
      <div class="card">
        <div class="between"><h3 style="color:var(--red)">Last time on…</h3><a class="sess" href="#/s/${s.number}">Session ${s.number} · ${fmtDate(s.date)}</a></div>
        <p class="prose">${esc(s.recap || s.overview)}</p>
        ${bigMoments(s)}
        ${s.where_we_left_off ? `<div class="inset"><span class="eyebrow">Where we left off</span><span>${esc(s.where_we_left_off)}</span></div>` : ""}
        <div class="between"><a href="#/recap">Recapping? Big-text version →</a><a href="#/s/${s.number}">Full session →</a></div>
      </div>
      <a class="card prep-teaser" href="#/prep">
        <div class="between"><h3>Before Session ${s.number + 1}</h3><span class="sub">Prep →</span></div>
        <span>${promises.length} promise${promises.length === 1 ? "" : "s"} on the books${waiting ? `, <b class="warn">${waiting} waiting 3+ sessions</b>` : ""} · ${active} active quest${active === 1 ? "" : "s"} · ${open} open myster${open === 1 ? "y" : "ies"}</span>
      </a>
      <div class="tiles">
        <a class="tile" href="#/quests"><b>${active}</b><span>Active quests</span></a>
        <a class="tile" href="#/codex/mysteries"><b>${open}</b><span>Open mysteries</span></a>
        <a class="tile" href="#/party"><b>${D.ledger.party_owes.length}</b><span>Promises owed</span></a>
      </div>
      ${q ? `<a class="card quote" href="#/quotes"><blockquote>“${esc(q.text)}”</blockquote><span class="sub">${esc(q.who)}${q.context ? ", " + esc(q.context) : ""} · Session ${q.session}</span></a>` : ""}
      ${section("Explore", `<div class="explore">${B.explore.map(([href, title, sub]) => `<a class="card" href="${href}"><b>${esc(title)}</b><span class="sub">${esc(sub)}</span></a>`).join("")}</div>`)}
      ${section("Seen last session", seen.length ? `<div class="chips">${seen.map((id) => chip(id)).join("")}</div>` : "")}
      ${section("Every session", `<a class="card" href="#/sessions"><span>All ${D.sessions.length} sessions, newest first →</span></a>`)}`;
  }

  // ---------- recap helpers ----------
  const STAR = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/></svg>`;
  const bigMoments = (s, title = "Big moments") => (s.big_moments || []).length
    ? `<div class="big"><span class="eyebrow">${esc(title)}</span><ul>${s.big_moments.map((m) => `<li>${STAR}<span>${esc(m)}</span></li>`).join("")}</ul></div>` : "";

  // The big-text page for whoever lands the recap at the table.
  function recapPage() {
    const s = lastSession();
    return `<a class="back" href="#/">‹ Home</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">Previously on… · Session ${s.number}</span><h1>${esc(s.title)}</h1></div>
      <div class="read-aloud">
        <p>${esc(s.recap || s.overview)}</p>
        ${bigMoments(s, "Don't forget")}
        ${s.where_we_left_off ? `<div class="inset"><span class="eyebrow">Where we left off</span><span>${esc(s.where_we_left_off)}</span></div>` : ""}
      </div>
      <p class="sub">Need more? <a href="#/s/${s.number}">Scenes and full notes</a> · <a href="#/qotd">Questions of the Day and past recaps</a></p>`;
  }

  // ---------- promises and how long they've waited ----------
  // A promise's "last touched" is the newest session it cites; its age is how many sessions ago that was.
  function allPromises() {
    const last = lastSession().number, L = D.ledger;
    const tag = (arr, dir, whoKey) => arr.map((p) => {
      const lt = Math.max(...(p.sessions || [0]));
      return { ...p, dir, who: p[whoKey], last: lt, age: last - lt };
    });
    return [...tag(L.party_owes, "we owe", "to"), ...tag(L.owed_to_party, "owed to us", "from")];
  }
  function ageBadge(p) {
    if (p.last === 0) return `<span class="badge b-plain" title="From a session 0 backstory">Backstory</span>`;
    if (p.age <= 0) return `<span class="badge b-confirmed">Last session</span>`;
    const kind = p.age >= 6 ? "b-dead" : p.age >= 3 ? "b-rumoured" : "b-plain";
    return `<span class="badge ${kind}" title="Last came up in session ${p.last}">${p.age} session${p.age === 1 ? "" : "s"} ago</span>`;
  }
  // Tapping a promise opens the session where it was made, scrolled to and highlighting that part of the notes.
  const sceneHref = (src) => `#/s/${src.session}/${encodeURIComponent(src.scene)}`;
  const promiseCard = (p) => {
    const where = p.source ? `Session ${p.source.session} · ${esc(p.source.scene)}` : p.last === 0 ? "Session zero backstory" : "";
    const body = `<div class="between"><b>${esc(p.text)}</b>${ageBadge(p)}</div>
      <span class="sub">${p.who ? esc(nameOf(p.who)) + (where ? " · " : "") : ""}${where}</span>`;
    return p.source ? `<a class="card promise" href="${sceneHref(p.source)}">${body}</a>`
      : p.who && ALL.has(p.who) ? `<a class="card promise" href="#/e/${encodeURIComponent(p.who)}">${body}</a>` : `<div class="card">${body}</div>`;
  };
  const discountCard = (d) => `<a class="card promise" href="${d.source ? sceneHref(d.source) : "#/e/" + encodeURIComponent(d.from)}">
      <div class="between"><b>${esc(d.amount)} off at ${esc(nameOf(d.where))}</b><span class="badge b-confirmed">Permanent</span></div>
      <span class="sub">${esc(d.text)} · from ${esc(nameOf(d.from))}${d.source ? ` · Session ${d.source.session}` : ""}</span></a>`;
  const byAge = (a, b) => (a.last === 0) - (b.last === 0) || b.age - a.age;

  // ---------- next-session prep ----------
  function prepPage() {
    const s = lastSession(), n = s.number;
    const promises = allPromises();
    const stale = promises.filter((p) => p.last > 0 && p.age >= 3).sort(byAge);
    const fresh = promises.filter((p) => p.last > 0 && p.age < 3).sort(byAge);
    const touched = (o) => sessionsOf(o).includes(n);
    const live = D.quests.filter((q) => q.status === "active" || q.status === "available");
    const hot = live.filter(touched), cold = live.filter((q) => !touched(q) && q.type !== "personal" && n - Math.max(...sessionsOf(q)) >= 4);
    const myst = D.mysteries.filter((m) => m.status === "open");
    const hotM = myst.filter(touched), coldM = myst.filter((m) => !touched(m) && n - Math.max(...sessionsOf(m)) >= 4);
    const text = [s.where_we_left_off, s.recap].join(" ").toLowerCase();
    const npcs = D.npcs.filter((x) => x.status !== "dead" && (x.last_session === n || [x.name, ...x.aliases].some((a) => a.length > 3 && text.includes(a.toLowerCase()))));
    const givers = [...new Set(hot.map((q) => q.giver).filter((g) => g && ALL.get(g)?.type === "npc"))].filter((g) => !npcs.some((x) => x.id === g));
    const personal = D.characters.filter((c) => c.status === "active").map((c) => [c, c.personal_quests.map((id) => ALL.get(id)?.obj).filter((q) => q && q.status === "active")]).filter(([, qs]) => qs.length);
    const list = (arr) => arr.map((q) => `<a class="card" href="#/e/${q.id}"><div class="between"><b>${esc(q.title || q.question)}</b>${badge(q.status)}</div><span class="sub">Last came up in session ${Math.max(...sessionsOf(q))}</span></a>`).join("");
    return `<a class="back" href="#/">‹ Home</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">Prep · Session ${n + 1}</span><h1>Before we sit down</h1></div>
      ${s.where_we_left_off ? `<div class="inset"><span class="eyebrow">Where we left off</span><span>${esc(s.where_we_left_off)}</span></div>` : ""}
      ${section("Promises gathering dust", stale.length ? stale.map(promiseCard).join("") : `<p class="empty">Nothing has waited more than two sessions. Nice.</p>`)}
      ${section("Quests in play last session", list(hot))}
      ${section("Mysteries that moved last session", list(hotM))}
      ${section("Who might turn up", npcs.length || givers.length ? `<div class="chips">${[...npcs.map((x) => x.id), ...givers].map((id) => chip(id)).join("")}</div>` : "")}
      ${section("Recent promises", fresh.map(promiseCard).join(""))}
      ${section("Personal goals", personal.map(([c, qs]) => `<div class="card"><b>${esc(c.name)}</b><div class="chips">${qs.map((q) => chip(q.id)).join("")}</div></div>`).join(""))}
      ${section("Loose threads (quiet for 4+ sessions)", (() => {
        const all = [...cold, ...coldM].sort((a, b) => Math.max(...sessionsOf(b)) - Math.max(...sessionsOf(a)));
        return all.length ? list(all.slice(0, 8)) + (all.length > 8 ? `<p class="sub">And ${all.length - 8} older ones on the <a href="#/quests/leads">quest board</a> and in <a href="#/codex/mysteries">mysteries</a>.</p>` : "") : "";
      })())}`;
  }

  // ---------- Questions of the Day and recap duty ----------
  function qotdPage() {
    const rows = [...D.sessions].reverse().filter((s) => s.qotd || s.recap_duty);
    const tally = {};
    for (const s of D.sessions) if (s.recap_duty?.by && s.recap_duty.by !== "Paul") tally[s.recap_duty.by] = (tally[s.recap_duty.by] || 0) + 1;
    return `<a class="back" href="#/">‹ Home</a><h1>Questions &amp; recaps</h1>
      <p class="sub">The Question of the Day and who gave the recap, for every session where the notes mention them. The notes bot often skips the question itself, so some are blank.</p>
      ${Object.keys(tally).length ? section("Recaps given", `<div class="chips">${Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([who, k]) => `<span class="chip">${esc(who)} · ${k}</span>`).join("")}</div>`) : ""}
      ${section("By session", rows.map((s) => `<a class="card" href="#/s/${s.number}">
        <div class="between"><b>Session ${s.number}</b><span class="sub">${fmtDate(s.date)}</span></div>
        ${s.qotd ? `<span><span class="sub">Question:</span> ${s.qotd.question ? esc(s.qotd.question) : `<i class="sub">not recorded</i>`}</span>${s.qotd.answers.map((a) => `<span class="sub">${esc(a.who)}: ${esc(a.answer)}</span>`).join("")}` : ""}
        ${s.recap_duty?.by ? `<span><span class="sub">Recap:</span> ${esc(s.recap_duty.by)}${s.recap_duty.how ? ` <span class="sub">(${esc(s.recap_duty.how)})</span>` : ""}${s.recap_duty.inspiration ? ` · inspiration to ${esc(s.recap_duty.inspiration)}` : ""}</span>` : ""}
      </a>`).join(""))}`;
  }

  // ---------- quote wall ----------
  const allQuotes = () => D.sessions.flatMap((s) => (s.quotes || []).map((q) => ({ ...q, session: s.number })));
  function quotesPage() {
    const qs = allQuotes().reverse();
    return `<a class="back" href="#/">‹ Home</a><h1>Quote wall</h1>
      <p class="sub">The party's funniest and finest lines, from the session notes. ${qs.length} so far.</p>
      <div class="quote-wall">${qs.map((q) => `<a class="card quote" href="#/s/${q.session}"><blockquote>“${esc(q.text)}”</blockquote><span class="sub">${esc(q.who)}${q.context ? ", " + esc(q.context) : ""} · S${q.session}</span></a>`).join("") || `<p class="empty">No quotes yet.</p>`}</div>`;
  }

  // ---------- what's new since your last visit (per device) ----------
  // Each entity and session gets a content fingerprint; the device remembers the ones it has seen.
  const SEEN_KEY = "bro.seen.v1";
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  function fp(o) { let h = 2166136261; const s = JSON.stringify(o); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  let FP = null;
  function fingerprints() {
    if (FP) return FP;
    FP = {};
    for (const [id, e] of ALL) FP[id] = fp(e.obj);
    for (const s of D.sessions) FP["s:" + s.number] = fp(s);
    return FP;
  }
  // The first time a device opens the journal, everything counts as already seen.
  function seenMap() { let s = store.get(SEEN_KEY); if (!s) { s = { ...fingerprints() }; store.set(SEEN_KEY, s); } return s; }
  function changes() {
    const now = fingerprints(), seen = seenMap();
    return Object.keys(now).filter((k) => seen[k] !== now[k]).map((k) => ({ key: k, kind: seen[k] ? "Updated" : "New" }));
  }
  function markSeen(keys) {
    const seen = seenMap(), now = fingerprints();
    for (const k of keys || Object.keys(now)) seen[k] = now[k];
    store.set(SEEN_KEY, seen);
  }
  function whatsNewCard() {
    const ch = changes();
    if (!ch.length) return "";
    const label = (c) => c.key.startsWith("s:") ? `<a class="chip new" href="#/s/${c.key.slice(2)}"><i>${c.kind}</i> Session ${c.key.slice(2)}</a>`
      : `<a class="chip new" href="#/e/${encodeURIComponent(c.key)}"><i>${c.kind}</i> ${esc(nameOf(c.key))}</a>`;
    const order = (c) => (c.key.startsWith("s:") ? 0 : c.kind === "New" ? 1 : 2);
    const shown = [...ch].sort((a, b) => order(a) - order(b)).slice(0, 18);
    return `<div class="card whats-new"><div class="between"><h3>New since your last visit</h3><button type="button" class="linkish" data-mark-seen>Mark all read</button></div>
      <div class="chips">${shown.map(label).join("")}${ch.length > shown.length ? `<span class="sub">and ${ch.length - shown.length} more</span>` : ""}</div></div>`;
  }
  app.addEventListener("click", (e) => { if (e.target.closest?.("[data-mark-seen]")) { markSeen(); route(); } });

  function pcLink(c) {
    const img = tokenOf(c);
    return `<a class="pc" href="#/e/${c.id}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}<b>${esc(c.name)}</b><span>${esc((c.class || "").split(" (")[0])} ${esc(c.level ?? "")}</span></a>`;
  }

  function sessionsList() {
    return `<h1>Sessions</h1><div class="stack">${[...D.sessions].reverse().map((s) => `
      <a class="card" href="#/s/${s.number}">
        <div class="between"><span class="eyebrow">Session ${s.number}</span><span class="sub">${fmtDate(s.date)}</span></div>
        <h3>${esc(s.title)}</h3>
      </a>`).join("")}</div>`;
  }

  function sessionView(n) {
    const s = D.sessions.find((x) => x.number === n);
    if (!s) return notFound();
    const prev = D.sessions.find((x) => x.number === n - 1), next = D.sessions.find((x) => x.number === n + 1);
    const mentioned = [...ALL.entries()].filter(([, e]) => sessionsOf(e.obj).includes(n));
    const groups = {};
    for (const [id, e] of mentioned) (groups[e.type] ||= []).push(id);
    const order = ["character", "npc", "quest", "mystery", "item", "location", "faction", "lore"];
    return `
      <a class="back" href="#/sessions">‹ All sessions</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">Session ${s.number} · ${fmtDate(s.date)}</span><h1>${esc(s.title)}</h1></div>
      ${s.recap || s.overview ? `<div class="card"><p class="prose">${esc(s.recap || s.overview)}</p>${bigMoments(s)}</div>` : ""}
      ${s.where_we_left_off ? `<div class="inset"><span class="eyebrow">Where we left off</span><span>${esc(s.where_we_left_off)}</span></div>` : ""}
      ${s.qotd || s.recap_duty?.by ? `<div class="card table-talk">
        ${s.qotd ? `<span><span class="sub">Question of the Day:</span> ${s.qotd.question ? esc(s.qotd.question) : `<i class="sub">not recorded</i>`}</span>${s.qotd.answers.map((a) => `<span class="sub">${esc(a.who)}: ${esc(a.answer)}</span>`).join("")}` : ""}
        ${s.recap_duty?.by ? `<span><span class="sub">Recap by:</span> ${esc(s.recap_duty.by)}${s.recap_duty.how ? ` <span class="sub">(${esc(s.recap_duty.how)})</span>` : ""}${s.recap_duty.inspiration ? ` · inspiration to ${esc(s.recap_duty.inspiration)}` : ""}</span>` : ""}
      </div>` : ""}
      ${section("Said at the table", (s.quotes || []).map((q) => `<div class="card quote"><blockquote>“${esc(q.text)}”</blockquote><span class="sub">${esc(q.who)}${q.context ? ", " + esc(q.context) : ""}</span></div>`).join(""))}
      ${section("Scenes", s.scenes.length ? `<ul style="margin:0;padding-left:20px">${s.scenes.map((x, i) => `<li><button type="button" class="linkish" data-scene="${esc(x)}" title="Jump to this scene in the full notes">${esc(x)}</button></li>`).join("")}</ul>` : "")}
      <details class="sheet-fold notes-fold" data-notes="${s.number}">
        <summary>Full session notes</summary>
        <div class="notes" aria-live="polite"><p class="sub">Loading notes…</p></div>
      </details>
      ${order.filter((t) => groups[t]).map((t) => section(KIND[t] === "Party" ? "Party" : KIND[t] + (t === "mystery" ? " threads" : t === "lore" ? "" : "s"), `<div class="chips">${groups[t].map((id) => chip(id)).join("")}</div>`)).join("")}
      <div class="between">${prev ? `<a href="#/s/${prev.number}">‹ Session ${prev.number}</a>` : "<span></span>"}${next ? `<a href="#/s/${next.number}">Session ${next.number} ›</a>` : ""}</div>`;
  }

  // ---------- full session notes (data/notes/<n>.md, loaded on demand) ----------
  const NOTES = new Map(); // session number -> Promise<string>
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  const plain = (s) => s.replace(/\*\*/g, "").trim();
  function renderNotes(md) {
    const out = []; let para = [], list = [], inScene = false;
    const flushP = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
    const flushL = () => { if (list.length) out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`); list = []; };
    for (const raw of md.split("\n")) {
      const line = raw.trimEnd();
      const h = line.match(/^#{2,6}\s+(.*)$/);
      if (h) {
        flushP(); flushL();
        const title = plain(h[1]);
        if (inScene) out.push(`</section>`);
        out.push(`<section class="scene" data-scene-title="${esc(title)}"><h3 data-title="${esc(title)}">${esc(title)}</h3>`); inScene = true;
      } else if (/^\s*[-*]\s+/.test(line) || /^\s+\S/.test(line)) {
        flushP(); list.push(line.replace(/^\s*(?:[-*]\s+)?/, ""));
      } else if (!line.trim()) { flushP(); flushL(); }
      else { flushL(); para.push(line.trim()); }
    }
    flushP(); flushL();
    if (inScene) out.push(`</section>`);
    return out.join("");
  }
  function loadNotes(fold) {
    const n = Number(fold.dataset.notes), box = fold.querySelector(".notes");
    if (fold.dataset.loaded) return Promise.resolve();
    if (!NOTES.has(n)) NOTES.set(n, fetch(`data/notes/${n}.md`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }));
    return NOTES.get(n).then((md) => { box.innerHTML = renderNotes(md) + `<button type="button" class="linkish" data-hide-notes>Hide full notes ▴</button>`; fold.dataset.loaded = "1"; })
      .catch(() => { NOTES.delete(n); box.innerHTML = `<p class="sub">Couldn't load the full notes for this session. Try again in a moment.</p>`; });
  }
  app.addEventListener("toggle", (e) => { if (e.target.matches?.(".notes-fold") && e.target.open) loadNotes(e.target); }, true);
  app.addEventListener("click", (e) => {
    const hide = e.target.closest?.("[data-hide-notes]");
    if (hide) { const f = hide.closest(".notes-fold"); f.open = false; f.scrollIntoView({ block: "nearest" }); return; }
    const b = e.target.closest?.("[data-scene]");
    if (b) jumpToScene(b.dataset.scene);
  });
  // Open the full notes, highlight the section with this heading, and scroll it into view.
  function jumpToScene(want) {
    const fold = app.querySelector(".notes-fold");
    if (!fold) return;
    fold.open = true;
    loadNotes(fold).then(() => {
      const alt = want.replace(/^recap and /i, "");
      const heads = [...fold.querySelectorAll("h3[data-title]")];
      const h = heads.find((x) => x.dataset.title === want) || heads.find((x) => x.dataset.title === alt);
      const scene = h?.closest(".scene");
      fold.querySelectorAll(".scene.is-target").forEach((x) => x.classList.remove("is-target"));
      if (scene) { void scene.offsetWidth; scene.classList.add("is-target"); }
      // Center the scene on screen; a scene taller than the screen starts at the top so its heading stays visible.
      const fits = scene && scene.offsetHeight < window.innerHeight - 120;
      (scene || fold).scrollIntoView({ behavior: "smooth", block: fits ? "center" : "start" });
    });
  }

  // ---------- search sheet: opened from the magnifying glass on every tab ----------
  const sheet = document.getElementById("search-sheet"), fab = document.querySelector(".search-fab");
  const qIn = document.getElementById("q"), resBox = document.getElementById("results");
  let sheetTimer = null;
  function openSearch(q) {
    clearTimeout(sheetTimer);
    if (typeof q === "string") qIn.value = q;
    resBox.innerHTML = results(qIn.value);
    sheet.hidden = false;
    document.body.classList.add("sheet-open");
    requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add("open"))); // let it paint closed first so it can animate
    qIn.focus({ preventScroll: true });
    qIn.select();
  }
  function closeSearch({ restoreFocus = true } = {}) {
    if (sheet.hidden) return;
    sheet.classList.remove("open");
    document.body.classList.remove("sheet-open");
    sheetTimer = setTimeout(() => { sheet.hidden = true; }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
    if (restoreFocus) fab.focus({ preventScroll: true });
  }
  fab.addEventListener("click", () => openSearch());
  qIn.addEventListener("input", () => { resBox.innerHTML = results(qIn.value); resBox.scrollTop = 0; });
  sheet.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-search]")) closeSearch();
    else if (e.target.closest("a[href^='#']")) closeSearch({ restoreFocus: false }); // following a result
  });
  document.addEventListener("keydown", (e) => {
    if (!sheet.hidden && e.key === "Escape") { e.preventDefault(); closeSearch(); return; }
    if (!sheet.hidden && e.key === "Tab") { // keep focus inside the sheet
      const f = [...sheet.querySelectorAll("input, button, a[href]")].filter((x) => x.offsetParent);
      if (f.length && e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (f.length && !e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      return;
    }
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
    if (sheet.hidden && ((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)))) { e.preventDefault(); openSearch(); }
  });
  window.addEventListener("hashchange", () => closeSearch({ restoreFocus: false })); // back button etc.
  B.openSearch = openSearch;

  function hl(text, q) {
    const t = esc(text);
    if (!q) return t;
    const i = t.toLowerCase().indexOf(esc(q).toLowerCase());
    return i < 0 ? t : t.slice(0, i) + "<mark>" + t.slice(i, i + esc(q).length) + "</mark>" + t.slice(i + esc(q).length);
  }
  function snippet(text, q) {
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return "";
    const a = Math.max(0, i - 50), b = Math.min(text.length, i + q.length + 70);
    return (a ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : "");
  }
  function results(raw) {
    const q = raw.trim().toLowerCase();
    if (q.length < 2) return `<p class="empty">Type at least two letters. Search covers names, other spellings, and everything written about them.</p>`;
    const scored = [];
    for (const [id, e] of ALL) {
      const name = e.name.toLowerCase();
      const aliases = (e.obj.aliases || []).map((a) => a.toLowerCase());
      const alias = aliases.find((a) => a.includes(q));
      const body = JSON.stringify(e.obj).toLowerCase();
      let score = name.startsWith(q) ? 100 : name.includes(q) ? 80 : alias ? 70 : body.includes(q) ? 20 : 0;
      if (!score) continue;
      if (e.type === "npc" || e.type === "character") score += 5;
      let sub = alias && !name.includes(q) ? `Also written “${e.obj.aliases.find((a) => a.toLowerCase().includes(q))}”` : describe(e);
      if (score === 20 || score === 25) { const textBits = Object.values(e.obj).filter((v) => typeof v === "string").join(" · "); sub = snippet(textBits, q) || sub; }
      scored.push({ id, e, score, sub });
    }
    for (const s of D.sessions) {
      const text = [s.title, s.overview, s.where_we_left_off, ...s.scenes].filter(Boolean).join(" · ");
      if (text.toLowerCase().includes(q)) scored.push({ session: s, score: 10, sub: snippet(text, q) });
    }
    scored.sort((a, b) => b.score - a.score);
    if (!scored.length) return `<p class="empty">Nothing found for “${esc(raw)}”.</p>`;
    return scored.slice(0, 40).map((r) => r.session
      ? `<a class="card result" href="#/s/${r.session.number}"><div class="grow"><div class="between"><b>Session ${r.session.number}: ${hl(r.session.title, q)}</b><span class="kind">Notes</span></div><span class="sub">${hl(r.sub, q)}</span></div></a>`
      : `<a class="card result" href="#/e/${encodeURIComponent(r.id)}">${r.e.type === "character" && tokenOf(r.e.obj) ? `<img src="${esc(tokenOf(r.e.obj))}" alt="" width="48" height="48">` : ""}<div class="grow"><div class="between"><b>${hl(r.e.name, q)}</b><span class="kind">${KIND[r.e.type]}</span></div><span class="sub">${hl(r.sub, q)}</span></div></a>`).join("");
  }
  function describe(e) {
    const o = e.obj;
    switch (e.type) {
      case "character": return o.class;
      case "npc": return [o.role, cap(o.status)].filter(Boolean).join(" · ");
      case "quest": return `${cap(o.type)} quest · ${cap(o.status)}`;
      case "mystery": return o.status === "open" ? `Open since Session ${o.raised}` : `Solved: ${o.answer || ""}`;
      case "item": return [o.type, o.holder && o.holder !== "party" ? "held by " + nameOf(o.holder) : o.holder === "party" ? "party loot" : ""].filter(Boolean).join(" · ");
      case "location": return o.type;
      case "faction": return `${o.type} · ${o.standing}`;
      case "lore": return cap(o.category);
    }
    return "";
  }

  function questCard(q) {
    const done = q.objectives.filter((o) => o.done).length;
    return `<a class="card" href="#/e/${q.id}">
      <div class="between"><h3>${esc(q.title)}</h3>${q.objectives.length ? `<span class="badge b-${q.status}">${done} of ${q.objectives.length}</span>` : badge(q.status)}</div>
      <span class="sub">${esc(cap(q.type))} quest${q.giver ? " · from " + esc(nameOf(q.giver)) : q.character ? " · " + esc(nameOf(q.character)) : ""} · since S${q.started}</span>
      ${q.status === "active" && q.objectives.length ? `<div class="stack" style="gap:6px">${q.objectives.map(objective).join("")}</div>` : `<span>${esc(q.summary)}</span>`}
    </a>`;
  }
  const objective = (o) => `<div class="obj ${o.done ? "done" : ""}">${o.done ? CHECK : RING}<span>${esc(o.text)}</span></div>`;

  function quests(tab = "active") {
    const tabs = { active: ["Active", (q) => q.status === "active" && q.type !== "personal"], leads: ["Open leads", (q) => q.status === "available"], personal: ["Personal", (q) => q.type === "personal"], done: ["Done", (q) => ["completed", "failed"].includes(q.status)] };
    const list = D.quests.filter(tabs[tab]?.[1] || tabs.active[1]);
    return `<h1>Quest Board</h1>
      <nav class="seg" aria-label="Quest filter">${Object.entries(tabs).map(([k, [label, f]]) => `<a href="#/quests/${k}" aria-current="${k === tab}">${label} · ${D.quests.filter(f).length}</a>`).join("")}</nav>
      <div class="stack">${list.map(questCard).join("") || `<p class="empty">Nothing here.</p>`}</div>`;
  }

  function codex(tab = "people") {
    const tabs = {
      people: ["People", () => D.npcs.map((n) => card(n.id, describe(ALL.get(n.id)), badge(n.status, n.status)))],
      places: ["Places", () => D.locations.map((l) => card(l.id, (l.parent ? nameOf(l.parent) + " · " : "") + l.type))],
      mysteries: ["Mysteries", () => [...D.mysteries].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.raised - a.raised).map(mysteryCard)],
      lore: ["Lore", () => D.lore.map((l) => card(l.id, l.text))],
      items: ["Items", () => D.items.map((i) => card(i.id, describe(ALL.get(i.id))))],
      factions: ["Factions", () => D.factions.map((f) => card(f.id, describe(ALL.get(f.id))))],
    };
    const t = tabs[tab] ? tab : "people";
    return `<h1>Codex</h1>
      <nav class="seg" aria-label="Codex section">${Object.entries(tabs).map(([k, [label]]) => `<a href="#/codex/${k}" aria-current="${k === t}">${label}</a>`).join("")}</nav>
      <div class="stack">${tabs[t][1]().join("")}</div>`;
  }
  const card = (id, sub, right = "") => `<a class="card" href="#/e/${encodeURIComponent(id)}"><div class="between"><b>${esc(nameOf(id))}</b>${right}</div>${sub ? `<span class="sub">${esc(sub)}</span>` : ""}</a>`;
  function mysteryCard(m) {
    return `<a class="card" href="#/e/${m.id}" ${m.status === "open" ? "" : 'style="opacity:.8"'}>
      <span class="sub">${m.status === "open" ? `Open since Session ${m.raised} · ${m.clues.length} clue${m.clues.length === 1 ? "" : "s"}` : `Solved in Session ${m.resolved}`}</span>
      <h3>${esc(m.question)}</h3>${m.answer ? `<span>${esc(m.answer)}</span>` : ""}</a>`;
  }

  function party() {
    const L = D.ledger;
    const pcs = D.characters.filter((c) => c.status === "active");
    const gone = D.characters.filter((c) => c.status !== "active");
    const list = (arr, who) => arr.map((x) => `<div class="card"><div class="between"><b>${esc(x.text)}</b><span>${sess(x.sessions)}</span></div>${x[who] ? `<span class="sub">${link(x[who])}</span>` : ""}</div>`).join("");
    return `<h1>The Party</h1>
      <span class="sub" style="margin-top:-10px">Level ${esc(L.level.value)} · ${esc(L.in_game_date.value)}</span>
      <div class="party small">${pcs.map(pcLink).join("")}</div>
      ${gone.length ? `<p class="sub">Former companions: ${gone.map((c) => link(c.id)).join(", ")}</p>` : ""}
      ${section("Owed to us", allPromises().filter((p) => p.dir === "owed to us").sort(byAge).map(promiseCard).join(""))}
      ${section("We owe", allPromises().filter((p) => p.dir === "we owe").sort(byAge).map(promiseCard).join(""))}
      <p class="sub">Badges show how many sessions since a promise last came up: amber after 3, red after 6. Tap one to read where it was made.</p>
      ${section("Discounts", (L.discounts || []).length ? L.discounts.map(discountCard).join("") : `<p class="empty">No standing discounts yet. Haggle harder.</p>`)}
      ${section("Property", L.property.map((p) => `<div class="card"><div class="between"><b>${esc(p.text)}</b><span>${sess(p.sessions)}</span></div></div>`).join(""))}
      ${section("Gold log", `<div class="card">${L.gold_log.map((g) => `<div class="between"><span>${esc(g.text)}</span><span style="white-space:nowrap;color:${g.amount_gp < 0 ? "var(--bad)" : "var(--ok)"}">${g.amount_gp > 0 ? "+" : ""}${g.amount_gp} gp <a class="sess" href="#/s/${g.session}">S${g.session}</a></span></div>`).join("")}</div>`)}
      ${L.party_name ? `<p class="sub">${esc(L.party_name.note)}</p>` : ""}`;
  }

  // ---------- entity pages ----------
  function entity(id) {
    const e = ALL.get(id);
    if (!e) return notFound();
    const o = e.obj;
    const back = { character: "#/party", npc: "#/codex/people", quest: "#/quests", mystery: "#/codex/mysteries", item: "#/codex/items", location: "#/codex/places", faction: "#/codex/factions", lore: "#/codex/lore" }[e.type];
    const related = backlinks(id).filter((x) => !(e.type === "character" && ALL.get(x).type === "item"));
    const head = `<a class="back" href="${back}">‹ Back</a>`;
    const appears = sessionsOf(o);
    const foot = `${section("Connected to", related.length ? `<div class="chips">${related.map((r) => chip(r, KIND[ALL.get(r).type] + " · ")).join("")}</div>` : "")}
      ${section("Appears in", appears.length ? `<p>${sess(appears)}</p>` : "")}`;
    const facts = (arr) => (arr || []).map((f) => `<div class="fact">${f.confidence ? badge(f.confidence) : ""}<span>${esc(f.text)}${f.claimed_by ? ` <span class="sub">(${esc(f.claimed_by)}'s word)</span>` : ""} ${sess(f.sessions)}</span></div>`).join("");

    switch (e.type) {
      case "character": {
        const poses = Object.keys(o.tokens || {});
        setTimeout(() => document.querySelectorAll("[data-pose]").forEach((b) => b.addEventListener("click", () => {
          document.getElementById("token").src = o.tokens[b.dataset.pose];
          document.querySelectorAll("[data-pose]").forEach((x) => x.setAttribute("aria-current", x === b));
        })));
        return `${head}
          <div class="hero">${o.tokens ? `<img id="token" src="${esc(tokenOf(o))}" alt="${esc(o.name)}'s token">` : ""}
            ${poses.length > 1 ? `<div class="seg" role="group" aria-label="Token pose">${poses.map((p, i) => `<a href="javascript:void 0" role="button" data-pose="${p}" aria-current="${i === 0}">${cap(p)}</a>`).join("")}</div>` : ""}</div>
          <div class="stack" style="gap:4px"><h1>${esc(o.name)}</h1><span class="sub">${esc(o.class)}${o.ancestry ? " · " + esc(o.ancestry) : ""}${o.level ? " · Level " + o.level : ""}${o.status !== "active" ? " · " + cap(o.status) : ""}</span>
            ${o.aliases?.length ? `<span class="sub">Also written: ${o.aliases.map(esc).join(", ")}</span>` : ""}</div>
          <p class="prose">${esc(o.summary)}</p>
          ${hook("character-top", o)}
          ${sheetView(o.sheet)}
          ${section("Backstory", facts(o.backstory))}
          ${section("Notable items", o.notable_items.length ? `<div class="chips">${o.notable_items.map((i) => chip(i)).join("")}</div>` : "")}
          ${section("Personal quests", o.personal_quests.length ? `<div class="chips">${o.personal_quests.map((i) => chip(i)).join("")}</div>` : "")}
          ${section("Companions", (o.companions || []).map((c) => `<div class="fact"><b>${esc(c.name)}</b><span>${esc(c.text)} ${sess(c.sessions)}</span></div>`).join(""))}
          ${section("Notes", facts(o.notes))}
          ${section("Appears in", `<p>${sess(appears)}</p>`)}
          ${partyStepper(o.id)}`;
      }
      case "npc":
        return `${head}
          <div class="stack" style="gap:4px"><h1>${esc(o.name)}</h1><span class="sub">${esc(o.role)}</span>
            ${o.aliases?.length ? `<span class="sub">Also written: ${o.aliases.map(esc).join(", ")}</span>` : ""}</div>
          <div class="tiles">
            <div class="tile"><span>Status</span><b style="font-size:18px">${esc(cap(o.status))}</b></div>
            ${sessTile("First seen", o.first_session)}
            ${sessTile("Last seen", o.last_session)}
          </div>
          ${o.attitude ? `<p><span class="sub">Attitude toward us:</span> <b>${esc(cap(o.attitude))}</b></p>` : ""}
          ${o.location ? `<p><span class="sub">Usually found:</span> ${link(o.location)}</p>` : ""}
          ${o.factions.length ? `<p><span class="sub">Factions:</span> ${o.factions.map((f) => link(f)).join(", ")}</p>` : ""}
          ${section("What we know", `<div class="card">${facts(o.facts)}</div>`)}
          ${foot}`;
      case "quest":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${esc(cap(o.type))} quest</span><h1>${esc(o.title)}</h1></div>
          <div class="row">${badge(o.status)}<span class="sub">Started S${o.started}${o.completed ? ` · done S${o.completed}` : ""}${o.giver ? " · from " : ""}</span>${o.giver ? link(o.giver) : ""}</div>
          <p class="prose">${esc(o.summary)}</p>
          ${section("Objectives", o.objectives.length ? `<div class="card">${o.objectives.map(objective).join("")}</div>` : "")}
          ${o.reward ? `<p><span class="sub">Reward:</span> ${esc(o.reward)}</p>` : ""}
          ${o.character ? `<p><span class="sub">Whose:</span> ${link(o.character)}</p>` : ""}
          ${foot}`;
      case "mystery":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${o.status === "open" ? `Open since Session ${o.raised}` : `Solved in Session ${o.resolved}`}</span><h1 style="font-size:28px">${esc(o.question)}</h1></div>
          ${o.answer ? `<div class="inset"><span class="eyebrow">Answer</span><span>${esc(o.answer)}</span></div>` : ""}
          ${section("Clues", o.clues.length ? `<div class="card">${o.clues.map((c) => `<div class="fact"><span style="min-width:32px">${sess([c.session])}</span><span>${esc(c.text)}</span></div>`).join("")}</div>` : `<p class="empty">No clues yet.</p>`)}
          ${section("Party theories", o.theories.map((t) => `<div class="inset"><b>${esc(t.by)}</b><span>${esc(t.text)}</span></div>`).join(""))}
          ${hook("mystery", o)}
          ${section("Related", o.related.length ? `<div class="chips">${o.related.map((r) => chip(r)).join("")}</div>` : "")}`;
      case "item":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${esc(o.type)}${o.magical ? " · magical" : ""}</span><h1>${esc(o.name)}</h1></div>
          <p class="prose">${esc(o.description)}</p>
          <p><span class="sub">Held by:</span> ${o.holder === "party" ? "Party loot" : link(o.holder)}</p>
          ${o.found ? `<p><span class="sub">Found:</span> ${esc(o.found.where)} ${sess([o.found.session])}</p>` : ""}`;
      case "location":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${esc(o.type)}</span><h1>${esc(o.name)}</h1></div>
          ${o.parent ? `<p><span class="sub">In:</span> ${link(o.parent)}</p>` : ""}
          <p class="prose">${esc(o.description)}</p>${foot}`;
      case "faction":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${esc(o.type)} · ${esc(o.standing)}</span><h1>${esc(o.name)}</h1></div>
          <p class="prose">${esc(o.description)}</p>
          ${section("Members", `<div class="chips">${o.members.map((m) => chip(m)).join("")}</div>`)}
          ${section("Appears in", `<p>${sess(appears)}</p>`)}`;
      case "lore":
        return `${head}
          <div class="stack" style="gap:4px"><span class="eyebrow">${esc(cap(o.category))}</span><h1>${esc(o.topic)}</h1></div>
          <div class="fact">${badge(o.confidence)}<p class="prose">${esc(o.text)}${o.claimed_by ? ` <span class="sub">(${esc(o.claimed_by)})</span>` : ""}</p></div>
          ${section("Appears in", `<p>${sess(appears)}</p>`)}`;
    }
  }

  // Character sheet stats (from D&D Beyond), shown on a PC's profile.
  function sheetView(s) {
    if (!s) return "";
    const ABIL = ["str", "dex", "con", "int", "wis", "cha"];
    const sign = (n) => (n < 0 ? "−" + Math.abs(n) : "+" + n);
    const list = (arr) => (arr || []).length ? `<ul class="sheet-list">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    const fold = (title, body, open = false) => (body ? `<details class="sheet-fold"${open ? " open" : ""}><summary>${esc(title)}</summary><div class="stack" style="gap:8px">${body}</div></details>` : "");
    const line = (label, text) => (text ? `<p><span class="sub">${esc(label)}:</span> ${esc(text)}</p>` : "");
    const sc = s.spellcasting;
    const tiles = [["AC", s.ac, s.ac_note], ["HP", s.hp], ["Speed", s.speed], ["Initiative", s.initiative], ["Proficiency", s.prof], ["Passive Perc.", s.passive?.perception]];
    return section("Character sheet", `
      <div class="tiles">${tiles.map(([k, v, note]) => `<div class="tile"><span>${esc(k)}</span><b>${esc(v)}</b>${note ? `<span>${esc(note)}</span>` : ""}</div>`).join("")}</div>
      <div class="abil">${ABIL.map((a) => `<div><span>${a.toUpperCase()}</span><b>${sign(s.abilities[a][1])}</b><span>${s.abilities[a][0]}</span></div>`).join("")}</div>
      ${sc ? `<div class="inset"><span class="eyebrow">Spellcasting</span><span>${esc(sc.ability)} · Spell attack ${esc(sc.attack)} · Save DC ${esc(sc.dc)}${sc.extra ? " · " + esc(sc.extra) : ""}</span></div>` : ""}
      ${fold("Attacks", list(s.attacks), true)}
      ${fold("Saves & skills", `<p>${ABIL.map((a) => `<b>${a.toUpperCase()}</b> ${esc(s.saves[a])}`).join(" · ")}</p>${list(s.save_notes)}
        <p><span class="sub">Skills:</span> ${esc(s.skills.join(", "))}</p>
        <p><span class="sub">Passive:</span> Perception ${esc(s.passive.perception)} · Investigation ${esc(s.passive.investigation)} · Insight ${esc(s.passive.insight)}</p>`)}
      ${fold("Spells", s.spells?.length ? s.spells.map(([lvl, names]) => `<p><b>${esc(lvl)}:</b> ${esc(names)}</p>`).join("") : "")}
      ${fold("Features & feats", `${list(s.features)}${line("Feats", (s.feats || []).join(", "))}`)}
      ${fold("Background, senses & gear", `${line("Ancestry", s.ancestry)}${line("Background", s.background)}${line("Senses", s.senses)}${line("Proficiencies", s.proficiencies)}${line("Languages", s.languages)}${line("Gear", s.gear)}`)}
      <p class="sub">From ${esc(s.source)}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">Full sheet</a>` : ""}. Loot from recent sessions may not be on it yet.</p>`);
  }

  const notFound = () => `<h1>Lost in the dark</h1><p>That page doesn't exist. <a href="#/">Back home</a></p>`;

  // ---------- swipe between party members ----------
  // On a party member's page, swiping left/right (or the arrow keys, or the links at the
  // bottom) flips to the next/previous active character with a sliding-card animation.
  const cast = () => D.characters.filter((c) => c.status === "active");
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let slideFrom = 0; // set before navigating: +1 = next page slides in from the right, -1 = from the left
  function neighbours(id) {
    const c = cast(), i = c.findIndex((x) => x.id === id);
    return i < 0 || c.length < 2 ? null : { prev: c[(i - 1 + c.length) % c.length], next: c[(i + 1) % c.length] };
  }
  function partyStepper(id) {
    const n = neighbours(id);
    return n ? `<nav class="pc-step" aria-label="Party members">
      <a href="#/e/${encodeURIComponent(n.prev.id)}" data-pc-step="-1">‹ ${esc(n.prev.name)}</a>
      <span class="sub">Swipe to flip</span>
      <a href="#/e/${encodeURIComponent(n.next.id)}" data-pc-step="1">${esc(n.next.name)} ›</a></nav>` : "";
  }
  function currentPC() {
    const m = location.hash.match(/^#\/e\/([^/]+)$/), id = m && decodeURIComponent(m[1]);
    return id && neighbours(id) ? id : null;
  }
  // What a sideways swipe leads to from here: the next/previous party member (looping), or on a
  // tab's main page the neighbouring tab (Home, Quests, Codex, Party; no looping). Null = no swiping.
  const TAB_PAGES = ["#/", "#/quests", "#/codex", "#/party"];
  function pager() {
    const id = currentPC();
    if (id) { const n = neighbours(id); return { prev: `#/e/${encodeURIComponent(n.prev.id)}`, next: `#/e/${encodeURIComponent(n.next.id)}` }; }
    const parts = location.hash.replace(/^#\/?/, "").split("/");
    const i = ["", "quests", "codex", "party"].indexOf(parts[0]);
    if (i < 0 || (parts.length > (i === 1 || i === 2 ? 2 : 1))) return null; // sub-pages (sessions, entries…) don't swipe tabs
    return { prev: TAB_PAGES[i - 1] || null, next: TAB_PAGES[i + 1] || null };
  }
  // Card follows the finger; the pivot is the middle of what's on screen so tall pages don't swing wildly.
  const cardPose = (dx) => `translateX(${dx}px) rotate(${Math.max(-6, Math.min(6, dx / 60))}deg)`;
  const pivot = () => { app.classList.add("flipping"); app.style.transformOrigin = `50% ${window.scrollY + innerHeight * 0.6 - app.offsetTop}px`; };
  function flip(dir, fromX = 0) {
    const pg = pager();
    if (!pg) return;
    const target = pg[dir > 0 ? "next" : "prev"];
    if (!target) return settle(fromX); // first or last tab: bounce back
    const go = () => { slideFrom = dir; location.hash = target; };
    if (still()) return go();
    pivot();
    const w = innerWidth;
    app.animate([{ transform: cardPose(fromX), opacity: 1 - Math.min(Math.abs(fromX) / w, 1) * 0.4 },
                 { transform: cardPose(-dir * w * 0.9), opacity: 0 }],
                { duration: 200, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).onfinish = go;
    app.style.transform = ""; app.style.opacity = "";
  }
  function slideInIfFlipped() {
    app.getAnimations().forEach((a) => a.cancel());
    app.style.transform = ""; app.style.opacity = ""; app.classList.remove("flipping");
    const dir = slideFrom; slideFrom = 0;
    if (!dir || still()) return;
    app.classList.add("flipping");
    app.style.transformOrigin = `50% ${innerHeight * 0.6}px`;
    app.animate([{ transform: `translateX(${dir * innerWidth * 0.6}px) rotate(${dir * 3}deg) scale(.96)`, opacity: 0 },
                 { transform: "none", opacity: 1 }],
                { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" }).onfinish = () => app.classList.remove("flipping");
  }
  let drag = null;
  app.addEventListener("touchstart", (e) => {
    drag = null;
    if (e.touches.length !== 1 || !pager()) return;
    if (e.target.closest?.("input, textarea, select, svg.web, svg.map, .draw")) return;
    const t = e.touches[0];
    if (t.clientX < 24 || t.clientX > innerWidth - 24) return; // leave the screen edges to the browser's own back/forward swipe
    drag = { x: t.clientX, y: t.clientY, at: Date.now(), dx: 0, axis: null };
  }, { passive: true });
  app.addEventListener("touchmove", (e) => {
    if (!drag) return;
    const t = e.touches[0], dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
      if (drag.axis === "x") pivot();
    }
    if (drag.axis !== "x") return;
    const pg = pager(), open = pg && pg[dx < 0 ? "next" : "prev"];
    drag.dx = open ? dx : dx * 0.3; // resist at the first and last tab
    app.style.transform = cardPose(drag.dx);
    app.style.opacity = String(1 - Math.min(Math.abs(dx) / innerWidth, 1) * 0.4);
  }, { passive: true });
  const endDrag = () => {
    const d = drag; drag = null;
    if (!d || d.axis !== "x") return;
    const fast = Math.abs(d.dx) / Math.max(1, Date.now() - d.at) > 0.5;
    const pg = pager(), open = pg && pg[d.dx < 0 ? "next" : "prev"];
    if (open && (Math.abs(d.dx) > innerWidth * 0.25 || (fast && Math.abs(d.dx) > 40))) return flip(d.dx < 0 ? 1 : -1, d.dx);
    settle(d.dx);
  };
  function settle(dx) { // spring back to where it was
    const back = app.animate([{ transform: cardPose(dx), opacity: app.style.opacity || 1 }, { transform: "none", opacity: 1 }],
                             { duration: still() ? 0 : 180, easing: "ease-out" });
    app.style.transform = ""; app.style.opacity = "";
    back.onfinish = () => { back.cancel(); app.classList.remove("flipping"); };
  }
  app.addEventListener("touchend", endDrag);
  app.addEventListener("touchcancel", endDrag);
  app.addEventListener("click", (e) => {
    const a = e.target.closest?.("[data-pc-step]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); flip(Number(a.dataset.pcStep));
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (pager()) flip(e.key === "ArrowRight" ? 1 : -1);
  });

  // ---------- router ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [page, arg] = parts;
    let html, tab = page || "home";
    switch (page) {
      case "": case undefined: html = home(); tab = "home"; break;
      case "search": // old links: show home underneath and open the search sheet
        history.replaceState(null, "", "#/"); html = home(); tab = "home"; setTimeout(() => openSearch(arg || "")); break;
      case "quests": html = quests(arg); break;
      case "codex": html = codex(arg); break;
      case "party": html = party(); break;
      case "recap": html = recapPage(); tab = "home"; break;
      case "prep": html = prepPage(); tab = "home"; break;
      case "qotd": html = qotdPage(); tab = "home"; break;
      case "quotes": html = quotesPage(); tab = "home"; break;
      case "sessions": html = sessionsList(); tab = "home"; break;
      case "s": html = sessionView(Number(arg)); tab = "home"; break; // #/s/<n>/<scene title> also jumps to that part of the notes
      case "e": {
        html = entity(arg);
        const t = ALL.get(arg)?.type;
        tab = t === "character" ? "party" : t === "quest" ? "quests" : "codex";
        break;
      }
      default:
        if (B.pages[page]) { const p = B.pages[page]; html = p.render(arg, parts); tab = p.tab || "home"; }
        else html = notFound();
    }
    if (page === "e" && ALL.has(arg)) markSeen([arg]);
    if (page === "s") markSeen(["s:" + arg]);
    app.innerHTML = html;
    app.classList.toggle("swipeable", !!pager());
    slideInIfFlipped();
    document.querySelectorAll(".tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.tab === tab ? "page" : "false"));
    const title = app.querySelector("h1")?.textContent;
    document.title = title && page ? `${title} · Brocettes` : "Brocettes Companion";
    if (page !== "search") window.scrollTo(0, 0);
    B.after.forEach((f) => { try { f(page, arg); } catch (err) { console.error(err); } });
    if (page === "s" && parts[2]) jumpToScene(parts[2]);
  }

  // ---------- boot ----------
  Promise.all(FILES.map((f) => fetch(`data/${f}.json`).then((r) => { if (!r.ok) throw new Error(f); return r.json(); })))
    .then((loaded) => {
      FILES.forEach((f, i) => (D[f] = loaded[i]));
      D.sessions.sort((a, b) => a.number - b.number);
      const add = (type, arr, nameKey) => arr.forEach((o) => ALL.set(o.id, { type, obj: o, name: o[nameKey] }));
      add("character", D.characters, "name"); add("npc", D.npcs, "name"); add("quest", D.quests, "title");
      add("mystery", D.mysteries, "question"); add("item", D.items, "name"); add("location", D.locations, "name");
      add("faction", D.factions, "name"); add("lore", D.lore, "topic");
      window.addEventListener("hashchange", route);
      B.ready = true;
      route();
    })
    .catch((err) => { app.innerHTML = `<h1>The tome won't open</h1><p>Couldn't load the campaign data (${esc(err.message)}). Try refreshing.</p>`; });
})();
