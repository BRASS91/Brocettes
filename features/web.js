/* Connections web: who and what is linked to whom, drawn as a zoomable graph.
   #/web shows everything; #/web/<id> centres on one entry and its neighbours. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const COLORS = { character: "#7A1F12", npc: "#2E6A8E", quest: "#A8742A", mystery: "#5A3C7A", item: "#8A5A2B", location: "#2F5D3A", faction: "#4D4D4D", lore: "#9A7B4F" };
  const LABELS = { character: "Party", npc: "People", quest: "Quests", mystery: "Mysteries", item: "Items", location: "Places", faction: "Factions", lore: "Lore" };
  let hidden = new Set(["lore"]);

  // Same references the "Connected to" lists use.
  function edges() {
    const out = new Map();
    for (const [id, e] of B.ALL) {
      const o = e.obj;
      const refs = [o.giver, o.holder, o.location, o.parent, o.character, ...(o.related || []), ...(o.factions || []), ...(o.members || []), ...(o.notable_items || []), ...(o.personal_quests || [])];
      for (const r of refs) if (r && r !== id && B.ALL.has(r)) out.set([id, r].sort().join("|"), [id, r]);
    }
    return [...out.values()];
  }

  // A small, deterministic force layout (Fruchterman–Reingold), run up front so nothing jiggles.
  function layout(ids, links, size) {
    const n = ids.length, idx = new Map(ids.map((id, i) => [id, i]));
    const pos = ids.map((id, i) => { const a = (i / n) * Math.PI * 2 * 7.3; const r = size * (0.15 + 0.3 * ((i * 0.618) % 1)); return [size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r]; });
    const L = links.map(([a, b]) => [idx.get(a), idx.get(b)]).filter(([a, b]) => a !== undefined && b !== undefined);
    const kk = Math.sqrt((size * size) / Math.max(n, 1));
    let t = size / 8;
    const steps = n > 120 ? 260 : 360;
    for (let it = 0; it < steps; it++) {
      const d = pos.map(() => [0, 0]);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
        const dist2 = dx * dx + dy * dy + 0.01, f = (kk * kk) / dist2;
        d[i][0] += dx * f; d[i][1] += dy * f; d[j][0] -= dx * f; d[j][1] -= dy * f;
      }
      for (const [a, b] of L) {
        const dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1], dist = Math.sqrt(dx * dx + dy * dy) + 0.01, f = dist / kk;
        d[a][0] -= dx * f; d[a][1] -= dy * f; d[b][0] += dx * f; d[b][1] += dy * f;
      }
      for (let i = 0; i < n; i++) {
        // gentle pull to the middle keeps loose clusters from drifting off
        d[i][0] += (size / 2 - pos[i][0]) * 0.06 * kk / 10; d[i][1] += (size / 2 - pos[i][1]) * 0.06 * kk / 10;
        const len = Math.hypot(d[i][0], d[i][1]) || 1, m = Math.min(len, t);
        pos[i][0] += (d[i][0] / len) * m; pos[i][1] += (d[i][1] / len) * m;
      }
      t *= 0.985;
    }
    return new Map(ids.map((id, i) => [id, pos[i]]));
  }

  function render(focus) {
    const all = edges();
    const adj = new Map();
    for (const [a, b] of all) { (adj.get(a) || adj.set(a, new Set()).get(a)).add(b); (adj.get(b) || adj.set(b, new Set()).get(b)).add(a); }
    const typeOf = (id) => B.ALL.get(id).type;
    let ids;
    if (focus && B.ALL.has(focus)) {
      const one = [...(adj.get(focus) || [])];
      const two = new Set();
      for (const x of one) for (const y of adj.get(x) || []) if (y !== focus && !one.includes(y)) two.add(y);
      const twoList = [...two].sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0)).slice(0, Math.max(0, 45 - one.length));
      ids = [focus, ...one, ...twoList];
    } else {
      focus = null;
      ids = [...adj.keys()];
    }
    ids = ids.filter((id) => id === focus || !hidden.has(typeOf(id)));
    const keep = new Set(ids);
    const links = all.filter(([a, b]) => keep.has(a) && keep.has(b));
    const size = Math.max(700, 95 * Math.sqrt(ids.length));
    const pos = layout(ids, links, size);
    if (focus) { // pin the focus in the middle
      const [fx, fy] = pos.get(focus); const dx = size / 2 - fx, dy = size / 2 - fy;
      for (const p of pos.values()) { p[0] += dx; p[1] += dy; }
    }
    // Fit the drawing to the laid-out nodes, then size dots and text in screen pixels
    // (u = drawing units per screen pixel) so they stay readable on a phone.
    const xs = [...pos.values()].map((p) => p[0]), ys = [...pos.values()].map((p) => p[1]);
    const pad = 60, vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
    const boxW = Math.min(B.app.clientWidth - 32, 688) || 340, boxH = Math.min(innerHeight * 0.68, 620);
    const u = 1 / Math.min(boxW / vb[2], boxH / vb[3]);
    const deg = (id) => adj.get(id)?.size || 0;
    const r = (id) => u * (typeOf(id) === "character" ? 13 : 4 + Math.min(6, Math.sqrt(deg(id)) * 1.4));
    const showLabel = (id) => focus || typeOf(id) === "character" || deg(id) >= 6;
    const nodes = ids.map((id) => {
      const [x, y] = pos.get(id), e = B.ALL.get(id), rad = r(id), tok = e.type === "character" && B.tokenOf(e.obj);
      return `<g class="node${id === focus ? " focus" : ""}" data-id="${esc(id)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(e.name)}">
        <circle r="${rad + 2}" fill="${COLORS[e.type]}"/>
        ${tok ? `<image href="${esc(tok)}" x="${-rad}" y="${-rad}" width="${rad * 2}" height="${rad * 2}" clip-path="circle(${rad}px)"/>` : ""}
        <text y="${rad + 12 * u}" style="font-size:${(11 * u).toFixed(1)}px;stroke-width:${(3 * u).toFixed(1)}px" class="${showLabel(id) ? "" : "lbl-hide"}">${esc(e.name.length > 26 ? e.name.slice(0, 24) + "…" : e.name)}</text></g>`;
    }).join("");
    const lines = links.map(([a, b]) => { const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b); return `<line data-a="${esc(a)}" data-b="${esc(b)}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join("");
    const legend = Object.entries(LABELS).map(([t, label]) => `<button type="button" class="chip legend${hidden.has(t) ? " off" : ""}" data-type="${t}" aria-pressed="${!hidden.has(t)}"><i style="background:${COLORS[t]}"></i>${label}</button>`).join("");
    return `<a class="back" href="${focus ? "#/e/" + encodeURIComponent(focus) : "#/"}">‹ ${focus ? esc(B.nameOf(focus)) : "Home"}</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">${focus ? "Connections around" : "Everything, connected"}</span><h1>${focus ? esc(B.nameOf(focus)) : "Connections"}</h1></div>
      <p class="sub">Drag to move, pinch or scroll to zoom. Tap a dot to see what it's tied to.${focus ? ` <a href="#/web">See the whole web</a>` : ""}</p>
      <div class="chips">${legend}</div>
      <div class="draw"><svg class="web" viewBox="${vb.map((v) => v.toFixed(0)).join(" ")}" role="img" aria-label="Connections graph"><g class="pz"><g class="edges">${lines}</g>${nodes}</g></svg></div>
      <div class="card web-info" hidden></div>`;
  }

  function wire(focus) {
    const svg = B.app.querySelector("svg.web");
    if (!svg) return;
    const pz = B.panZoom(svg, svg.querySelector(".pz"), { min: 0.5, max: 8 });
    svg.parentElement.append(B.zoomButtons(pz));
    const info = B.app.querySelector(".web-info");
    const select = (id, dim = true) => {
      svg.classList.toggle("has-sel", !!id && dim);
      svg.querySelectorAll(".node").forEach((n) => n.classList.remove("sel", "near"));
      svg.querySelectorAll("line").forEach((l) => l.classList.remove("hot"));
      if (!id) { info.hidden = true; return; }
      svg.querySelector(`.node[data-id="${CSS.escape(id)}"]`)?.classList.add("sel");
      const near = [];
      svg.querySelectorAll("line").forEach((l) => {
        if (l.dataset.a === id || l.dataset.b === id) { l.classList.add("hot"); near.push(l.dataset.a === id ? l.dataset.b : l.dataset.a); }
      });
      near.forEach((n) => svg.querySelector(`.node[data-id="${CSS.escape(n)}"]`)?.classList.add("near"));
      const e = B.ALL.get(id);
      info.hidden = false;
      info.innerHTML = `<div class="between"><b>${esc(e.name)}</b><span class="kind">${B.KIND[e.type]}</span></div>
        <span class="sub">${esc(B.describe(e) || "")}</span>
        <span class="sub">Tied to ${near.length}: ${near.slice(0, 8).map((n) => esc(B.nameOf(n))).join(", ")}${near.length > 8 ? "…" : ""}</span>
        <div class="between"><a href="#/e/${encodeURIComponent(id)}">Open page →</a>${id !== focus ? `<a href="#/web/${encodeURIComponent(id)}">Centre the web here</a>` : ""}</div>`;
    };
    svg.addEventListener("click", (ev) => { const n = ev.target.closest(".node"); select(n ? n.dataset.id : null); });
    svg.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { const n = ev.target.closest(".node"); if (n) select(n.dataset.id); } });
    if (focus) select(focus, false);
    B.app.querySelectorAll(".legend").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.type;
      hidden.has(t) ? hidden.delete(t) : hidden.add(t);
      B.route();
    }));
  }

  B.pages.web = { render: (arg) => render(arg), tab: "codex" };
  B.after.push((page, arg) => {
    if (page === "web") return wire(arg && B.ALL.has(arg) ? arg : null);
    // Every entry page gets a way into the web.
    if (page === "e" && B.ALL.has(arg)) {
      const back = B.app.querySelector(".back");
      if (back) back.insertAdjacentHTML("afterend", `<a class="sess web-link" href="#/web/${encodeURIComponent(arg)}">See connections →</a>`);
    }
  });
  B.explore.push(["#/web", "Connections", "Who and what is tied to whom"]);
})();
