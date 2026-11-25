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

  // Push apart any two dots closer than minGap (drawing units) so they never stack.
  function spread(pts, minGap) {
    const n = pts.length;
    for (let pass = 0; pass < 80; pass++) {
      let moved = false;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], dist = Math.hypot(dx, dy) || 0.01;
        if (dist < minGap) {
          const push = (minGap - dist) / 2 + 0.01, ux = dist > 0.01 ? dx / dist : Math.cos(i), uy = dist > 0.01 ? dy / dist : Math.sin(i);
          pts[i][0] += ux * push; pts[i][1] += uy * push; pts[j][0] -= ux * push; pts[j][1] -= uy * push; moved = true;
        }
      }
      if (!moved) break;
    }
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
    const size = Math.max(800, 130 * Math.sqrt(ids.length));
    const pos = layout(ids, links, size);
    if (focus) { // pin the focus in the middle
      const [fx, fy] = pos.get(focus); const dx = size / 2 - fx, dy = size / 2 - fy;
      for (const p of pos.values()) { p[0] += dx; p[1] += dy; }
    }
    // Fit the drawing to the laid-out nodes, then size dots and text in screen pixels
    // (u = drawing units per screen pixel) so they stay readable on a phone.
    const boxW = Math.min(B.app.clientWidth - 32, 688) || 340, boxH = Math.min(innerHeight * 0.68, 620);
    const pts = [...pos.values()];
    // The whole web is laid out bigger than the screen and opens on its middle; pinch out to see all of it.
    const so = focus ? 1 : Math.min(2.6, Math.max(1, Math.sqrt(ids.length) / 5));
    let vb, u;
    const fit = () => {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const pad = 60 * (u || 1);
      vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
      u = 1 / Math.min((boxW * so) / vb[2], (boxH * so) / vb[3]);
    };
    // Spacing depends on how big a dot ends up on screen, which depends on the spacing: settle it in a few rounds.
    fit();
    for (let round = 0; round < 4; round++) { spread(pts, (focus ? 40 : 30) * u); fit(); }
    if (so > 1) { const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2, w = boxW * u, h = boxH * u; vb = [cx - w / 2, cy - h / 2, w, h]; }
    const deg = (id) => adj.get(id)?.size || 0;
    const r = (id) => u * (typeOf(id) === "character" ? 13 : 4 + Math.min(6, Math.sqrt(deg(id)) * 1.4));
    // Label priority: the focus, then the party, then the most-connected entries.
    const prio = (id) => (id === focus ? 1e6 : 0) + (typeOf(id) === "character" ? 1e4 : 0) + deg(id);
    const nodes = ids.map((id) => {
      const [x, y] = pos.get(id), e = B.ALL.get(id), rad = r(id), tok = e.type === "character" && B.tokenOf(e.obj);
      const label = e.name.length > 26 ? e.name.slice(0, 24) + "…" : e.name;
      return `<g class="node${id === focus ? " focus" : ""}" data-id="${esc(id)}" data-prio="${prio(id)}" data-r="${(rad / u).toFixed(1)}" data-len="${label.length}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(e.name)}">
        <g class="nz"><circle r="${rad + 2 * u}" fill="${COLORS[e.type]}"/>
        ${tok ? `<image href="${esc(tok)}" x="${-rad}" y="${-rad}" width="${rad * 2}" height="${rad * 2}" clip-path="circle(${rad}px)"/>` : ""}
        </g></g>`;
    }).join("");
    const labels = ids.map((id) => {
      const [x, y] = pos.get(id), e = B.ALL.get(id), rad = r(id);
      const label = e.name.length > 26 ? e.name.slice(0, 24) + "…" : e.name;
      return `<g class="lbl" data-id="${esc(id)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="nz"><text y="${rad + 10 * u}" dominant-baseline="central" style="font-size:${(12 * u).toFixed(1)}px;stroke-width:${(3.5 * u).toFixed(1)}px">${esc(label)}</text></g></g>`;
    }).join("");
    const lines = links.map(([a, b]) => { const [x1, y1] = pos.get(a), [x2, y2] = pos.get(b); return `<line data-a="${esc(a)}" data-b="${esc(b)}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`; }).join("");
    const legend = Object.entries(LABELS).map(([t, label]) => `<button type="button" class="chip legend${hidden.has(t) ? " off" : ""}" data-type="${t}" aria-pressed="${!hidden.has(t)}"><i style="background:${COLORS[t]}"></i>${label}</button>`).join("");
    return `<a class="back" href="${focus ? "#/e/" + encodeURIComponent(focus) : "#/"}">‹ ${focus ? esc(B.nameOf(focus)) : "Home"}</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">${focus ? "Connections around" : "Everything, connected"}</span><h1>${focus ? esc(B.nameOf(focus)) : "Connections"}</h1></div>
      <p class="sub">Drag to move, pinch or scroll to zoom. Names appear as you zoom in; zoom out to see the whole web. Tap a dot to see what it's tied to.${focus ? ` <a href="#/web">See the whole web</a>` : ""}</p>
      <div class="chips">${legend}</div>
      <div class="draw"><svg class="web" data-u="${u}" data-so="${so}" viewBox="${vb.map((v) => v.toFixed(0)).join(" ")}" role="img" aria-label="Connections graph"><g class="pz"><g class="edges">${lines}</g>${nodes}<g class="labels">${labels}</g></g></svg></div>
      <div class="card web-info" hidden></div>`;
  }

  function wire(focus) {
    const svg = B.app.querySelector("svg.web");
    if (!svg) return;
    const nodes = [...svg.querySelectorAll(".node")];
    const lbls = nodes.map((n) => svg.querySelector(`.lbl[data-id="${CSS.escape(n.dataset.id)}"]`));
    const inner = [...svg.querySelectorAll(".nz")];
    let k = 1, queued = false;
    // Names keep a fixed on-screen size, so measure each one once (all are visible at this point).
    const texts = lbls.map((l) => l?.querySelector("text"));
    const dots = nodes.map((n) => n.querySelector("circle"));
    const U = Number(svg.dataset.u) || 1; // drawing units per screen pixel inside a counter-scaled label
    // Hide any label that would overlap a higher-priority one, measured in screen pixels.
    const cull = () => {
      queued = false;
      const sel = svg.classList.contains("has-sel");
      const order = nodes.map((n, i) => {
        const boost = n.classList.contains("sel") ? 3e6 : sel && n.classList.contains("near") ? 2e6 : 0;
        return { n, i, p: Number(n.dataset.prio) + boost };
      }).sort((a, b) => b.p - a.p);
      // Dots are obstacles too, so a name never sits on top of another dot.
      const vis = (n) => !sel || n.classList.contains("sel") || n.classList.contains("near");
      const placed = nodes.map((n, i) => { if (!vis(n)) return null; const r = dots[i].getBoundingClientRect(); return { x: r.left + 1, y: r.top + 1, w: r.width - 2, h: r.height - 2, own: i }; }).filter(Boolean);
      for (const { n, i, p } of order) {
        const L = lbls[i];
        if (!L) continue;
        if (sel && p < 2e6) { L.classList.add("lbl-off"); continue; } // while something's selected, name only it and its neighbours
        const t = texts[i], tr = t?.getBoundingClientRect(); // hidden labels keep their size (visibility, not display)
        if (!tr || !tr.width) continue;
        const dr = dots[i].getBoundingClientRect(), cx = dr.left + dr.width / 2, cy = dr.top + dr.height / 2, rr = dr.width / 2;
        const w = tr.width + 6, h = tr.height + 2;
        const spots = [[0, rr + 2 + h / 2], [0, -(rr + 2 + h / 2)], [rr + 4 + w / 2, 0], [-(rr + 4 + w / 2), 0]];
        let ok = null;
        for (const [ox, oy] of spots) {
          const box = { x: cx + ox - w / 2, y: cy + oy - h / 2, w, h };
          if (!placed.some((b) => b.own !== i && box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)) { ok = [ox, oy, box]; break; }
        }
        L.classList.toggle("lbl-off", !ok);
        if (ok) { t.setAttribute("x", (ok[0] * U).toFixed(1)); t.setAttribute("y", (ok[1] * U).toFixed(1)); placed.push(ok[2]); }
      }
    };
    const scaleNodes = (nk) => {
      k = nk;
      for (const g of inner) g.setAttribute("transform", `scale(${1 / k})`);
      if (!queued) { queued = true; requestAnimationFrame(cull); }
    };
    const pz = B.panZoom(svg, svg.querySelector(".pz"), { min: Math.min(0.5, 0.85 / (Number(svg.dataset.so) || 1)), max: 12, onChange: scaleNodes });
    document.fonts?.ready.then(() => requestAnimationFrame(cull));
    svg.parentElement.append(B.zoomButtons(pz));
    const info = B.app.querySelector(".web-info");
    const select = (id, dim = true) => {
      svg.classList.toggle("has-sel", !!id && dim);
      svg.querySelectorAll(".node").forEach((n) => n.classList.remove("sel", "near"));
      svg.querySelectorAll("line").forEach((l) => l.classList.remove("hot"));
      if (!id) { info.hidden = true; requestAnimationFrame(cull); return; }
      svg.querySelector(`.node[data-id="${CSS.escape(id)}"]`)?.classList.add("sel");
      const near = [];
      svg.querySelectorAll("line").forEach((l) => {
        if (l.dataset.a === id || l.dataset.b === id) { l.classList.add("hot"); near.push(l.dataset.a === id ? l.dataset.b : l.dataset.a); }
      });
      near.forEach((n) => svg.querySelector(`.node[data-id="${CSS.escape(n)}"]`)?.classList.add("near"));
      requestAnimationFrame(cull);
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
