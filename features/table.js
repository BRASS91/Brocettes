/* Table mode (beta): a character's sheet as a live tracker for play night.
   HP, temp HP, death saves, conditions, spell slots, class resources and hit dice,
   with short and long rests. Saved on this device only (localStorage). #/table/<id> */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const KEY = (id) => `bro.table.${id}.v1`;
  const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
  const FULL = { 1: 4, 2: 3, 3: 2 }; // a level 5 full caster
  // reset: "long" (back on a long rest), "short" (back on a short or long rest),
  // "short1" (all back on a long rest, one back on a short rest), "none" (only by hand).
  const DEFAULTS = {
    broc: { slots: FULL, die: 6, res: [["Sorcery Points", 5, "long"], ["Innate Sorcery", 2, "long"], ["Luck Points", 3, "long"], ["Tides of Chaos", 1, "long"]] },
    francis: { slots: { 1: 4, 2: 2 }, die: 10, res: [["Lay on Hands (HP pool)", 25, "long"], ["Channel Divinity", 2, "short1"], ["Free Divine Smite", 1, "long"], ["Free Find Steed", 1, "long"]] },
    levon: { slots: {}, die: 12, res: [["Rage", 3, "short1"], ["Storm's Thunder", 3, "long"], ["Large Form", 1, "long"]] },
    vexhar: { slots: FULL, die: 6, res: [["Arcane Recovery", 1, "long"]] },
    blue: { slots: FULL, die: 8, res: [["Bardic Inspiration", 4, "short"]] },
    allyanna: { slots: {}, pact: { level: 3, count: 2 }, die: 8, res: [["Healing Light (d6 pool)", 6, "long"], ["Magical Cunning", 1, "long"], ["Healing Hands", 1, "long"], ["Celestial Revelation", 1, "long"]] },
    caine: { slots: FULL, die: 8, res: [["Channel Divinity", 2, "short1"], ["Healer's Kit uses", 10, "none", 3]] },
  };

  function fresh(c) {
    const d = DEFAULTS[c.id] || { slots: {}, die: 8, res: [] };
    const hp = c.sheet?.hp || 10;
    return {
      hp, max: hp, temp: 0, insp: false, conc: false, conds: [], death: { s: 0, f: 0 },
      slots: Object.entries(d.slots).map(([lvl, max]) => ({ lvl: Number(lvl), max, used: 0 })),
      pact: d.pact ? { ...d.pact, used: 0 } : null,
      res: d.res.map(([name, max, reset, used = 0]) => ({ name, max, reset, used })),
      hd: { max: c.level || 1, used: 0, die: d.die }, notes: "",
    };
  }
  const load = (c) => { const s = B.store.get(KEY(c.id)); return s && s.v === 1 ? s.st : fresh(c); };
  const save = (c, st) => B.store.set(KEY(c.id), { v: 1, st });

  const pips = (n, used, act, i) => Array.from({ length: n }, (_, k) => `<button type="button" class="pip${k < n - used ? " full" : ""}" data-t="${act}" data-i="${i}" data-k="${k}" aria-label="${k < n - used ? "Use one" : "Get one back"}"></button>`).join("");
  const counter = (val, act, i) => `<div class="counter"><button type="button" data-t="${act}" data-i="${i}" data-d="-1">−</button><b>${val}</b><button type="button" data-t="${act}" data-i="${i}" data-d="1">+</button></div>`;
  const RESET = { long: "long rest", short: "short rest", short1: "long rest (1 on a short)", none: "by hand" };

  function paint(c, st) {
    const s = c.sheet || {}, down = st.hp <= 0;
    return `
      <div class="tm-hp card ${down ? "down" : ""}">
        <div class="between"><span class="eyebrow">Hit points</span><label class="sub tm-max">Max <input type="number" inputmode="numeric" value="${st.max}" data-t="max" min="1"></label></div>
        <div class="tm-hpnum"><b>${st.hp}</b><span>/ ${st.max}</span>${st.temp ? `<em>+${st.temp} temp</em>` : ""}</div>
        <div class="tm-row tm-steps">${[-10, -5, -1, 1, 5, 10].map((d) => `<button type="button" data-t="hp" data-d="${d}">${d > 0 ? "+" + d : "−" + -d}</button>`).join("")}</div>
        <div class="tm-row"><input type="number" inputmode="numeric" placeholder="Amount" data-amt min="0"><button type="button" class="bad" data-t="dmg">Damage</button><button type="button" class="good" data-t="heal">Heal</button><button type="button" data-t="temp">Set temp</button></div>
        ${down ? `<div class="tm-death"><span class="eyebrow">Death saves</span>
          <div class="between"><span>Successes</span><span>${[0, 1, 2].map((k) => `<button type="button" class="pip ok${k < st.death.s ? " full" : ""}" data-t="ds" data-k="${k}" aria-label="Success ${k + 1}"></button>`).join("")}</span></div>
          <div class="between"><span>Failures</span><span>${[0, 1, 2].map((k) => `<button type="button" class="pip no${k < st.death.f ? " full" : ""}" data-t="df" data-k="${k}" aria-label="Failure ${k + 1}"></button>`).join("")}</span></div></div>` : ""}
      </div>
      <div class="tiles tm-stats">
        <div class="tile"><span>AC</span><b>${esc(s.ac ?? "—")}</b></div>
        <div class="tile"><span>Initiative</span><b>${esc(s.initiative ?? "—")}</b></div>
        <div class="tile"><span>${s.spellcasting ? "Spell DC" : "Speed"}</span><b>${esc(s.spellcasting ? s.spellcasting.dc : (s.speed || "—"))}</b></div>
      </div>
      <div class="tm-row tm-toggles">
        <button type="button" class="toggle" aria-pressed="${st.insp}" data-t="insp">Heroic Inspiration</button>
        <button type="button" class="toggle" aria-pressed="${st.conc}" data-t="conc">Concentrating</button>
      </div>
      <details class="sheet-fold" ${st.conds.length ? "open" : ""}><summary>Conditions${st.conds.length ? ` · ${st.conds.length}` : ""}</summary>
        <div class="chips">${CONDITIONS.map((x) => `<button type="button" class="chip toggle" aria-pressed="${st.conds.includes(x)}" data-t="cond" data-x="${x}">${x}</button>`).join("")}</div></details>
      ${st.slots.length || st.pact ? `<div class="card"><span class="eyebrow">Spell slots</span>
        ${st.slots.map((sl, i) => `<div class="tm-line"><span>${["", "1st", "2nd", "3rd", "4th", "5th"][sl.lvl] || sl.lvl + "th"}</span><span class="pips">${pips(sl.max, sl.used, "slot", i)}</span><span class="tm-edit">${counter(sl.max, "slotmax", i)}</span></div>`).join("")}
        ${st.pact ? `<div class="tm-line"><span>Pact (${st.pact.level === 3 ? "3rd" : st.pact.level})</span><span class="pips">${pips(st.pact.count, st.pact.used, "pact", 0)}</span><span class="sub">short rest</span></div>` : ""}</div>` : ""}
      <div class="card"><span class="eyebrow">Resources</span>
        ${st.res.map((r, i) => `<div class="tm-line"><span>${esc(r.name)}<br><span class="sub">${RESET[r.reset] || ""}</span></span>
          ${r.max <= 12 ? `<span class="pips">${pips(r.max, r.used, "res", i)}</span>` : counter(r.max - r.used, "respool", i)}
          <span class="tm-edit">${counter(r.max, "resmax", i)}<button type="button" class="linkish" data-t="resdel" data-i="${i}">Remove</button></span></div>`).join("") || `<p class="empty">None yet.</p>`}
        <div class="tm-edit tm-add"><input placeholder="New tracker, e.g. Potion of Healing" data-newname><input type="number" inputmode="numeric" value="1" min="1" data-newmax style="width:64px">
          <select data-newreset>${Object.entries(RESET).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><button type="button" data-t="resadd">Add</button></div>
        <div class="tm-line"><span>Hit Dice (d${st.hd.die})</span><span class="pips">${pips(st.hd.max, st.hd.used, "hd", 0)}</span></div>
      </div>
      <div class="tm-row"><button type="button" data-t="short">Short rest</button><button type="button" data-t="long">Long rest</button><button type="button" class="toggle" data-t="edit" aria-pressed="${!!editing}">Edit trackers</button></div>
      ${s.attacks ? `<details class="sheet-fold"><summary>Attacks</summary><ul class="sheet-list">${s.attacks.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
      ${s.spells?.length ? `<details class="sheet-fold"><summary>Spells</summary>${s.spells.map(([l, n]) => `<p><b>${esc(l)}:</b> ${esc(n)}</p>`).join("")}</details>` : ""}
      <label class="stack" style="gap:4px"><span class="eyebrow">Notes for tonight</span><textarea rows="3" data-t="notes" placeholder="Bless on Levon, owe Blue 2 gp…">${esc(st.notes)}</textarea></label>
      <p class="sub">Beta: these numbers live on this device only, start from the D&amp;D Beyond sheet and class defaults, and may not match your sheet exactly. Use Edit trackers to fix them. <button type="button" class="linkish" data-t="reset">Start over</button></p>`;
  }

  let editing = false;
  function render(id) {
    const e = B.ALL.get(id);
    if (!e || e.type !== "character") return `<h1>Who's playing?</h1><div class="party big">${B.D.characters.filter((c) => c.status === "active").map((c) => `<a class="pc" href="#/table/${c.id}"><img src="${esc(B.tokenOf(c))}" alt=""><b>${esc(c.name)}</b></a>`).join("")}</div>`;
    const c = e.obj;
    editing = false;
    return `<a class="back" href="#/e/${c.id}">‹ ${esc(c.name)}'s page</a>
      <div class="tm-head">${B.tokenOf(c) ? `<img src="${esc(B.tokenOf(c))}" alt="">` : ""}<div class="stack" style="gap:2px"><span class="eyebrow">Table mode <span class="beta">Beta</span></span><h1>${esc(c.name)}</h1></div></div>
      <div id="tm" class="stack${editing ? " editing" : ""}">${paint(c, load(c))}</div>`;
  }

  function act(c, el) {
    const st = load(c), t = el.dataset.t, i = Number(el.dataset.i), k = Number(el.dataset.k), d = Number(el.dataset.d);
    const amtEl = B.app.querySelector("[data-amt]"), amt = Math.max(0, Number(amtEl?.value) || 0);
    const clampHp = () => { st.hp = Math.max(0, Math.min(st.max, st.hp)); if (st.hp > 0) st.death = { s: 0, f: 0 }; };
    const damage = (n) => { const fromTemp = Math.min(st.temp, n); st.temp -= fromTemp; st.hp -= n - fromTemp; clampHp(); };
    // Tapping the k-th pip: full pips are on the left, so tapping one uses it, tapping an empty one refills to there.
    const tapPip = (o, max) => { const left = max - o.used; o.used = k < left ? max - k : max - k - 1; o.used = Math.max(0, Math.min(max, o.used)); };
    switch (t) {
      case "hp": d < 0 ? damage(-d) : (st.hp += d, clampHp()); break;
      case "dmg": damage(amt); break;
      case "heal": st.hp += amt; clampHp(); break;
      case "temp": st.temp = amt; break;
      case "ds": st.death.s = k < st.death.s ? k : k + 1; break;
      case "df": st.death.f = k < st.death.f ? k : k + 1; break;
      case "insp": st.insp = !st.insp; break;
      case "conc": st.conc = !st.conc; break;
      case "cond": { const x = el.dataset.x; st.conds = st.conds.includes(x) ? st.conds.filter((y) => y !== x) : [...st.conds, x]; break; }
      case "slot": tapPip(st.slots[i], st.slots[i].max); break;
      case "pact": tapPip(st.pact, st.pact.count); break;
      case "res": tapPip(st.res[i], st.res[i].max); break;
      case "hd": tapPip(st.hd, st.hd.max); break;
      case "respool": st.res[i].used = Math.max(0, Math.min(st.res[i].max, st.res[i].used - d)); break;
      case "slotmax": st.slots[i].max = Math.max(0, st.slots[i].max + d); st.slots[i].used = Math.min(st.slots[i].used, st.slots[i].max); break;
      case "resmax": st.res[i].max = Math.max(1, st.res[i].max + d); st.res[i].used = Math.min(st.res[i].used, st.res[i].max); break;
      case "resdel": st.res.splice(i, 1); break;
      case "resadd": {
        const name = B.app.querySelector("[data-newname]").value.trim();
        if (!name) return;
        st.res.push({ name, max: Math.max(1, Number(B.app.querySelector("[data-newmax]").value) || 1), reset: B.app.querySelector("[data-newreset]").value, used: 0 });
        break;
      }
      case "short":
        st.res.forEach((r) => { if (r.reset === "short") r.used = 0; if (r.reset === "short1") r.used = Math.max(0, r.used - 1); });
        if (st.pact) st.pact.used = 0;
        break;
      case "long":
        st.hp = st.max; st.temp = 0; st.death = { s: 0, f: 0 }; st.conc = false;
        st.slots.forEach((s) => (s.used = 0)); if (st.pact) st.pact.used = 0;
        st.res.forEach((r) => { if (r.reset !== "none") r.used = 0; });
        st.hd.used = 0;
        st.conds = st.conds.filter((x) => x !== "Unconscious");
        break;
      case "edit": editing = !editing; break;
      case "reset": if (!confirm(`Start ${c.name}'s table mode over from the sheet?`)) return; Object.assign(st, fresh(c)); break;
      default: return;
    }
    save(c, st);
    const box = B.app.querySelector("#tm");
    box.innerHTML = paint(c, st);
    box.classList.toggle("editing", editing);
    if (["dmg", "heal", "temp"].includes(t)) { const a = B.app.querySelector("[data-amt]"); if (a) a.value = ""; }
  }

  B.pages.table = { render: (id) => render(id), tab: "party" };
  B.after.push((page, id) => {
    if (page !== "table") return;
    const c = B.ALL.get(id)?.obj;
    if (!c || !B.app.querySelector("#tm")) return;
    B.app.querySelector("#tm").addEventListener("click", (e) => { const el = e.target.closest("[data-t]"); if (el && el.tagName !== "TEXTAREA" && el.tagName !== "INPUT") act(c, el); });
    B.app.querySelector("#tm").addEventListener("change", (e) => {
      const el = e.target, st = load(c);
      if (el.dataset.t === "max") { st.max = Math.max(1, Number(el.value) || st.max); st.hp = Math.min(st.hp, st.max); save(c, st); B.app.querySelector("#tm").innerHTML = paint(c, st); }
      if (el.dataset.t === "notes") { st.notes = el.value; save(c, st); }
    });
  });
  B.hooks["character-top"] = [...(B.hooks["character-top"] || []), (c) => c.status === "active" ? `<a class="card tm-cta" href="#/table/${c.id}"><div class="between"><b>Table mode <span class="beta">Beta</span></b><span class="sub">Open →</span></div><span class="sub">Track HP, slots and resources during play</span></a>` : ""];
  B.explore.push(["#/table", "Table mode (beta)", "Track HP, slots and resources at the table"]);
})();
