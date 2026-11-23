/* Map with pins: a hand-drawn schematic of the region and of Phandalin.
   Pin positions live in data/map.json; everything else comes from locations.json.
   #/map is the region, #/map/town is Phandalin. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  let PINS = null, loading = null;
  let showSession = null; // highlight the places visited in this session

  const load = () => loading || (loading = fetch("data/map.json").then((r) => r.json()).then((j) => { PINS = j; if (B.ready) B.route(); }).catch(() => { PINS = { region: {}, town: {} }; if (B.ready) B.route(); }));
  const at = (v) => (Array.isArray(v) ? { at: v, approx: false } : v);
  const kids = (id) => B.D.locations.filter((l) => l.parent === id);
  const visited = (id, n) => { const l = B.ALL.get(id)?.obj; return !!l && (l.sessions.includes(n) || kids(id).some((k) => k.sessions.includes(n))); };

  // The drawings: simple shapes, labelled, nothing copied from a published map.
  const REGION_ART = `
    <path class="sea" d="M0 0 H150 C120 90 165 160 138 240 C112 320 160 400 128 480 C100 560 150 620 120 700 H0 Z"/>
    <text class="area sea-lbl" x="40" y="380" transform="rotate(-90 40 380)">Sword Coast</text>
    <path class="wood" d="M250 150 C280 90 390 80 470 95 C560 70 660 110 690 180 C720 250 650 290 560 282 C470 300 380 300 320 270 C260 250 225 210 250 150 Z"/>
    <text class="area" x="470" y="150">Neverwinter Wood</text>
    <path class="mtn" d="M470 640 l25 -45 l25 45 M515 640 l30 -55 l30 55 M570 640 l25 -42 l25 42 M630 632 l28 -50 l28 50 M690 628 l24 -40 l24 40 M745 622 l30 -52 l30 52"/>
    <text class="area" x="600" y="672">Sword Mountains</text>
    <path class="mtn" d="M790 120 l26 -48 l26 48 M832 112 l30 -60 l30 60 M880 124 l24 -40 l24 40"/>
    <text class="area" x="820" y="150">Star Mounts</text>
    <path class="road" d="M175 105 C185 200 200 260 200 330 C205 450 210 560 225 700"/>
    <text class="road-lbl" x="150" y="560" transform="rotate(-84 150 560)">High Road</text>
    <path class="road" d="M200 330 C320 345 430 360 520 355 C640 348 760 335 960 320"/>
    <path class="road minor" d="M430 360 C428 410 425 460 420 512"/>
    <path class="road minor" d="M420 512 C480 530 530 560 575 585"/>`;
  const TOWN_ART = `
    <rect class="ground" x="0" y="0" width="1000" height="700" rx="0"/>
    <path class="hill" d="M700 300 C690 200 760 140 860 150 C950 160 980 250 950 320 C920 380 760 390 700 300 Z"/>
    <path class="river" d="M0 560 C200 540 320 600 520 590 C700 580 820 640 1000 620"/>
    <text class="area" x="560" y="640">river</text>
    <path class="road" d="M80 360 H930"/>
    <path class="road" d="M480 40 V660"/>
    <path class="road minor" d="M600 318 C700 300 760 250 812 218 C860 180 890 140 905 110"/>
    <path class="road minor" d="M480 360 C600 400 700 430 770 452"/>
    <path class="road minor" d="M480 360 C420 330 300 300 222 292"/>
    <rect class="square" x="440" y="330" width="80" height="60" rx="6"/>
    <text class="area" x="480" y="410" text-anchor="middle">town square</text>`;

  function pinsFor(kind) {
    const set = PINS?.[kind] || {};
    return Object.entries(set).filter(([id]) => B.ALL.has(id)).map(([id, v]) => ({ id, ...at(v) }));
  }
  function draw(kind) {
    const pins = pinsFor(kind);
    const n = showSession;
    // Pins and labels grow on narrow screens so they stay tappable and readable.
    const s = Math.max(1, 0.55 / ((Math.min(B.app.clientWidth - 32, 688) || 340) / 1000)).toFixed(2);
    const html = pins.map((p) => {
      const l = B.ALL.get(p.id).obj, [x, y] = p.at;
      const on = n == null || visited(p.id, n);
      const town = kind === "region" && p.id === "phandalin";
      return `<g class="pin${on ? "" : " dim"}${n != null && on ? " hit" : ""}${p.approx ? " approx" : ""}${town ? " town" : ""}" data-id="${esc(p.id)}" transform="translate(${x} ${y}) scale(${s})" tabindex="0" role="button" aria-label="${esc(l.name)}">
        <circle class="halo" r="16"/><path class="drop" d="M0 0 C-7 -10 -11 -15 -11 -21 A11 11 0 1 1 11 -21 C11 -15 7 -10 0 0 Z"/><circle class="dot" cy="-21" r="4"/>
        <text y="16">${esc(l.name)}${p.approx ? "?" : ""}</text></g>`;
    }).join("");
    return `<svg class="map ${kind}" viewBox="0 0 1000 700" role="img" aria-label="${kind === "town" ? "Map of Phandalin" : "Map of the region"}"><g class="pz">${kind === "town" ? TOWN_ART : REGION_ART}${html}</g></svg>`;
  }

  function render(arg) {
    if (!PINS) { load(); return `<h1>Map</h1><p class="loading">Unrolling the map…</p>`; }
    const kind = arg === "town" ? "town" : "region";
    const placed = new Set([...Object.keys(PINS.region || {}), ...Object.keys(PINS.town || {})]);
    const isPlaced = (l) => placed.has(l.id) || (l.parent && placed.has(l.parent));
    const unplaced = B.D.locations.filter((l) => !isPlaced(l));
    const sessions = [...B.D.sessions].reverse().filter((s) => pinsFor(kind).some((p) => visited(p.id, s.number)));
    return `<div class="stack" style="gap:4px"><span class="eyebrow">Not to scale · positions approximate</span><h1>${kind === "town" ? "Phandalin" : "The Sword Coast"}</h1></div>
      <nav class="seg" aria-label="Map"><a href="#/map" aria-current="${kind === "region"}">Region</a><a href="#/map/town" aria-current="${kind === "town"}">Phandalin</a></nav>
      <label class="map-filter"><span class="sub">Where we went:</span>
        <select data-map-session><option value="">Every session</option>${sessions.map((s) => `<option value="${s.number}" ${showSession === s.number ? "selected" : ""}>Session ${s.number}: ${esc(s.title)}</option>`).join("")}</select></label>
      <div class="draw">${draw(kind)}</div>
      <div class="card map-info" hidden></div>
      ${unplaced.length ? `<p class="sub">Not on the map: ${unplaced.map((l) => B.link(l.id)).join(", ")}</p>` : ""}`;
  }

  function wire(arg) {
    const svg = B.app.querySelector("svg.map");
    if (!svg) return;
    const pz = B.panZoom(svg, svg.querySelector(".pz"), { min: 0.8, max: 5 });
    svg.parentElement.append(B.zoomButtons(pz));
    const info = B.app.querySelector(".map-info");
    const select = (id) => {
      svg.querySelectorAll(".pin").forEach((p) => p.classList.toggle("sel", p.dataset.id === id));
      if (!id) { info.hidden = true; return; }
      const l = B.ALL.get(id).obj, sub = kids(id);
      info.hidden = false;
      info.innerHTML = `<div class="between"><b>${esc(l.name)}</b><span class="kind">${esc(l.type)}</span></div>
        <span>${esc(l.description)}</span>
        ${sub.length ? `<span class="sub">Inside: ${sub.map((k) => B.link(k.id)).join(", ")}</span>` : ""}
        <span class="sub">Sessions: ${B.sess(l.sessions)}</span>
        <div class="between"><a href="#/e/${encodeURIComponent(id)}">Open page →</a>${id === "phandalin" ? `<a href="#/map/town">Town map →</a>` : ""}</div>`;
    };
    svg.addEventListener("click", (e) => { const p = e.target.closest(".pin"); select(p ? p.dataset.id : null); });
    svg.addEventListener("keydown", (e) => { if (e.key === "Enter") { const p = e.target.closest(".pin"); if (p) select(p.dataset.id); } });
    B.app.querySelector("[data-map-session]")?.addEventListener("change", (e) => { showSession = e.target.value ? Number(e.target.value) : null; B.route(); });
  }

  B.pages.map = { render, tab: "codex" };
  B.after.push((page, arg) => {
    if (page === "map") wire(arg);
    // Place pages link to their pin.
    if (page === "e" && B.ALL.get(arg)?.type === "location" && PINS) {
      const where = PINS.town?.[arg] ? "#/map/town" : PINS.region?.[arg] ? "#/map" : null;
      if (where) B.app.querySelector(".web-link")?.insertAdjacentHTML("afterend", ` <a class="sess" href="${where}">On the map →</a>`);
    }
  });
  load();
  B.explore.push(["#/map", "Map", "The region and Phandalin, with every place we've been"]);
})();
