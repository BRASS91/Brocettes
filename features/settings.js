/* Settings (#/settings): pick your character (sets the theme and your name), theme, light/dark,
   notifications, motion, installing the app. Saved per device in localStorage "bro.settings.v1";
   the inline script in index.html applies it before first paint. Palettes: themes.css. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const KEY = "bro.settings.v1", ME = "bro.me.v1";
  const MODES = [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]];
  let THEMES = null; // from features/themes.json: { id: { label, light: [page, accent, trim], dark: [...], nav: [light, dark] } }
  fetch("features/themes.json").then((r) => r.json()).then((t) => { THEMES = t; apply(); if (location.hash.startsWith("#/settings")) B.route(); }).catch(() => {});

  const get = () => ({ character: "", theme: "default", mode: "system", motion: "system", ...(B.store.get(KEY) || {}) });
  const set = (patch) => { B.store.set(KEY, { ...get(), ...patch }); apply(); };
  const dark = () => { const m = get().mode; return m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches); };

  function apply() {
    const s = get(), root = document.documentElement;
    root.dataset.theme = s.theme || "default";
    root.dataset.mode = dark() ? "dark" : "light";
    if (s.motion === "reduce") root.dataset.motion = "reduce"; else delete root.dataset.motion;
    const nav = THEMES?.[s.theme]?.nav?.[dark() ? 1 : 0];
    if (nav) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nav);
    markMe();
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", apply);
  B.reducedMotion = () => get().motion === "reduce" || matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ring your own token wherever the party appears.
  function markMe() {
    const me = get().character;
    document.querySelectorAll(".pc").forEach((a) => a.classList.toggle("me", !!me && a.getAttribute("href") === `#/e/${me}`));
  }

  const cast = () => B.D.characters.filter((c) => c.status === "active");
  const swatch = (id) => { const t = THEMES?.[id]; if (!t) return ""; const [p, a, g] = t[dark() ? "dark" : "light"]; return `<span class="swatch" aria-hidden="true" style="background:${p};box-shadow:inset 0 0 0 4px ${g}"><i style="background:${a}"></i></span>`; };

  function render() {
    const s = get(), me = B.store.get(ME) || {};
    const latest = B.lastSession();
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    return `<a class="back" href="#/">‹ Home</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">This device</span><h1>Settings</h1></div>

      <section class="stack"><h2>Who are you?</h2>
        <p class="sub">Your character sets the app's colors and fills in your name for theories and suggestions.</p>
        <fieldset class="pick-pc"><legend class="sr">Your character</legend>
          ${cast().map((c) => `<label class="pick"><input type="radio" name="character" value="${esc(c.id)}" ${s.character === c.id ? "checked" : ""}>
            <span>${B.tokenOf(c) ? `<img src="${esc(B.tokenOf(c))}" alt="">` : ""}<b>${esc(c.name)}</b></span></label>`).join("")}
          <label class="pick"><input type="radio" name="character" value="" ${s.character ? "" : "checked"}><span><span class="no-pc" aria-hidden="true">?</span><b>Just browsing</b></span></label>
        </fieldset></section>

      <section class="stack"><h2>Theme</h2>
        <fieldset class="pick-theme"><legend class="sr">Colors</legend>
          ${THEMES ? Object.entries(THEMES).map(([id, t]) => `<label class="pick-row"><input type="radio" name="theme" value="${id}" ${s.theme === id ? "checked" : ""}>${swatch(id)}<span>${esc(t.label)}${id !== "default" && id === s.character ? ` <span class="sub">(you)</span>` : ""}</span></label>`).join("") : `<p class="sub">Loading themes…</p>`}
        </fieldset></section>

      <section class="stack"><h2>Light or dark</h2>
        <fieldset class="seg"><legend class="sr">Appearance</legend>
          ${MODES.map(([v, label]) => `<label class="pill"><input type="radio" name="mode" value="${v}" ${s.mode === v ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset></section>

      <section class="stack"><h2>Notifications</h2>
        <a class="card" href="#/notify"><div class="between"><b>Notification settings</b><span aria-hidden="true">›</span></div><span class="sub" data-notify-status>New notes, suggestions, theories and game night.</span></a></section>

      <section class="stack"><h2>Your name</h2>
        <label class="stack" style="gap:4px"><span class="sub">Shown on theories and suggestions you post from this device.</span>
          <input class="field" name="myname" maxlength="40" value="${esc(me.name || "")}" placeholder="Your name" autocomplete="nickname"></label></section>

      <section class="stack"><h2>Motion</h2>
        <label class="toggle card"><input type="checkbox" name="motion" ${s.motion === "reduce" ? "checked" : ""}><span><b>Reduce animations</b><span class="sub">Turns off sliding cards and sheets. Your device's own setting is always respected too.</span></span></label></section>

      <section class="stack"><h2>Install the app</h2>
        <div class="card">${installed ? `<b>It's installed.</b><span class="sub">You're using the Home Screen app.</span>`
          : iOS ? `<b>Add it to your Home Screen</b><span class="sub">In Safari, tap Share, then <b>Add to Home Screen</b>. It opens full screen, and on iPhone it's needed for notifications.</span>`
          : `<b>Install it like an app</b><span class="sub">In your browser's menu, choose <b>Install app</b> or <b>Add to Home screen</b>.</span><button type="button" class="btn" data-install hidden>Install now</button>`}</div></section>

      <section class="stack"><h2>About</h2>
        <p class="sub">Notes through Session ${latest.number} (${B.fmtDate(latest.date)}). Settings are saved on this device only.</p>
        <button type="button" class="btn ghost" data-reset style="align-self:flex-start">Reset this device's settings</button></section>`;
  }

  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; document.querySelector("[data-install]")?.removeAttribute("hidden"); });

  function wire() {
    const box = B.app;
    if (installPrompt) box.querySelector("[data-install]")?.removeAttribute("hidden");
    box.querySelector("[name=myname]")?.addEventListener("input", (e) => B.store.set(ME, { ...(B.store.get(ME) || {}), name: e.target.value.trim() }));
    box.querySelector("[data-install]")?.addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; B.route(); });
    box.querySelector("[data-reset]")?.addEventListener("click", () => { if (confirm("Reset theme, character and other settings on this device?")) { B.store.set(KEY, null); apply(); B.route(); } });
    (async () => { // notification status line
      const el = box.querySelector("[data-notify-status]");
      if (!el || !("Notification" in window) || !B.pushEndpoint) return;
      const on = Notification.permission === "granted" && (await B.pushEndpoint());
      el.textContent = on ? "On for this device. Tap to choose topics or send a test." : "Off. Tap to turn on new notes, suggestions and game night reminders.";
    })();
  }
  function onChange(e) {
    const t = e.target;
    if (!t.closest?.("main") || !location.hash.startsWith("#/settings")) return;
    if (t.name === "character") {
      const prevName = B.D.characters.find((c) => c.id === get().character)?.name;
      set({ character: t.value, theme: t.value && THEMES?.[t.value] ? t.value : get().theme });
      const me = B.store.get(ME) || {}, pc = B.D.characters.find((c) => c.id === t.value);
      if (pc && (!me.name || me.name === prevName)) B.store.set(ME, { ...me, name: pc.name }); // only replace a name we filled in
      B.route();
    } else if (t.name === "theme") { set({ theme: t.value }); B.route(); }
    else if (t.name === "mode") { set({ mode: t.value }); B.route(); }
    else if (t.name === "motion") set({ motion: t.checked ? "reduce" : "system" });
  }

  B.app.addEventListener("change", onChange);
  B.pages.settings = { render: () => render(), tab: "home" };
  B.after.push((page) => { markMe(); if (page === "settings") wire(); });
  apply();
})();
