/* Notifications: registers the service worker (sw.js), and #/notify lets each device pick
   what it hears about. Sending happens in worker/index.js; see docs/notifications.md. */
(() => {
  const B = window.Brocettes;
  const { esc } = B;
  const PREFS = "bro.push.v1", NUDGE = "bro.push.nudge.v1", ME = "bro.me.v1";
  const TOPICS = [
    ["notes", "New session notes", "When the next session's notes and recap are up"],
    ["suggestions", "Suggestions", "When someone posts an app idea or bug in Feedback"],
    ["theories", "Theory board", "When someone posts a new theory on a mystery"],
    ["reminder", "Game night reminder", "Tuesday afternoon: where we left off and what we promised"],
  ];
  const DEFAULT = ["notes", "suggestions", "reminder"];
  const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const prefs = () => B.store.get(PREFS) || { topics: DEFAULT };

  let reg = null;
  const ready = supported() ? navigator.serviceWorker.register("sw.js").then((r) => (reg = r)).catch(() => null) : Promise.resolve(null);
  // If a notification was tapped while the app was open in a browser that can't navigate it, go there ourselves.
  navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.go) location.href = e.data.go; });

  const subscription = async () => (await ready)?.pushManager.getSubscription() ?? null;
  B.pushEndpoint = async () => { try { return (await subscription())?.endpoint || ""; } catch { return ""; } };

  const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  async function api(path, body) {
    const r = await fetch("api/push/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "The notification service isn't reachable right now.");
    return data;
  }
  async function turnOn(topics) {
    if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.");
    const r = await ready;
    if (!r) throw new Error("This browser couldn't set up notifications.");
    const { publicKey } = await api("key");
    let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
    await api("subscribe", { subscription: sub.toJSON(), topics, name: B.store.get(ME)?.name || "" });
    B.store.set(PREFS, { topics });
  }
  async function save(topics) {
    const sub = await subscription();
    if (sub) await api("subscribe", { subscription: sub.toJSON(), topics, name: B.store.get(ME)?.name || "" });
    B.store.set(PREFS, { topics });
  }
  async function turnOff() {
    const sub = await subscription();
    if (sub) { await api("unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  }

  // ---------- #/notify ----------
  function render() {
    return `<a class="back" href="#/">‹ Home</a>
      <div class="stack" style="gap:4px"><span class="eyebrow">This device</span><h1>Notifications</h1></div>
      <div id="notify-body" class="stack"><p class="sub">Checking this device…</p></div>`;
  }
  async function fill() {
    const box = document.getElementById("notify-body");
    if (!box) return;
    if (!supported()) {
      box.innerHTML = iOS && !installed
        ? `<div class="card"><b>On iPhone and iPad, add the app to your Home Screen first.</b>
            <ol class="steps"><li>Open this site in Safari.</li><li>Tap the Share button, then <b>Add to Home Screen</b>.</li><li>Open Brocettes from your Home Screen and come back here.</li></ol>
            <span class="sub">Apple only allows notifications for web apps opened from the Home Screen (iOS 16.4 or newer).</span></div>`
        : `<div class="card"><b>This browser can't show notifications.</b><span class="sub">Try Chrome, Edge, Firefox or Safari on a recent phone or computer.</span></div>`;
      return;
    }
    const sub = await subscription().catch(() => null);
    const on = !!sub && Notification.permission === "granted";
    const chosen = new Set(prefs().topics);
    const blocked = Notification.permission === "denied";
    box.innerHTML = `
      ${blocked ? `<div class="card warn-card"><b>Notifications are blocked for this site.</b><span class="sub">Allow them in your browser or phone settings for this site, then reload.</span></div>` : ""}
      <div class="card"><div class="between"><b>${on ? "Notifications are on" : "Notifications are off"}</b>${on ? `<span class="badge b-confirmed">On</span>` : `<span class="badge b-plain">Off</span>`}</div>
        <span class="sub">${on ? "Pick what you want to hear about. Changes save right away." : "Choose what you'd like to hear about, then turn them on."}</span></div>
      <fieldset class="card topics" ${blocked ? "disabled" : ""}><legend class="sr">Notify me about</legend>
        ${TOPICS.map(([id, label, sub]) => `<label class="toggle"><input type="checkbox" name="topic" value="${id}" ${chosen.has(id) ? "checked" : ""}><span><b>${esc(label)}</b><span class="sub">${esc(sub)}</span></span></label>`).join("")}
      </fieldset>
      <div class="row wrap">${on
        ? `<button type="button" class="btn" data-n="test">Send me a test</button><button type="button" class="btn ghost" data-n="off">Turn off on this device</button>`
        : `<button type="button" class="btn" data-n="on" ${blocked ? "disabled" : ""}>Turn on notifications</button>`}</div>
      <p class="sub" id="notify-msg" role="status"></p>
      <p class="sub">Each phone or computer signs up on its own. You won't be notified about things you posted yourself.</p>`;
    const msg = (t) => { document.getElementById("notify-msg").textContent = t; };
    const topics = () => [...box.querySelectorAll("input[name=topic]:checked")].map((i) => i.value);
    box.querySelectorAll("input[name=topic]").forEach((i) => i.addEventListener("change", async () => {
      B.store.set(PREFS, { topics: topics() });
      if (on) { try { await save(topics()); msg("Saved."); } catch (e) { msg(e.message); } }
    }));
    box.querySelector("[data-n=on]")?.addEventListener("click", async (e) => {
      e.target.disabled = true; msg("Asking for permission…");
      try { await turnOn(topics()); B.store.set(NUDGE, "done"); await fill(); msg("You're all set. Try a test notification."); }
      catch (err) { e.target.disabled = false; msg(err.message); }
    });
    box.querySelector("[data-n=test]")?.addEventListener("click", async () => {
      msg("Sending…");
      try { await api("test", { endpoint: (await subscription()).endpoint }); msg("Sent. It should arrive in a few seconds."); } catch (e) { msg(e.message); }
    });
    box.querySelector("[data-n=off]")?.addEventListener("click", async () => { await turnOff(); await fill(); msg("Notifications are off on this device."); });
  }

  // ---------- a one-time nudge on Home ----------
  async function nudge() {
    if (!supported() && !(iOS && !installed)) return;
    if (B.store.get(NUDGE) || (supported() && (await subscription().catch(() => null)))) return;
    const after = B.app.querySelector(".party");
    if (!after || B.app.querySelector(".notify-nudge")) return;
    after.insertAdjacentHTML("afterend", `<div class="card notify-nudge"><b>Want a heads-up when new notes land?</b>
      <span class="sub">Get notified about new session notes, suggestions and game night.</span>
      <div class="row"><a class="btn" href="#/notify">Set up notifications</a><button type="button" class="btn ghost" data-nudge-x>Not now</button></div></div>`);
    B.app.querySelector("[data-nudge-x]").addEventListener("click", (e) => { B.store.set(NUDGE, "dismissed"); e.target.closest(".notify-nudge").remove(); });
  }

  B.pages.notify = { render: () => render(), tab: "home" };
  B.after.push((page) => { if (page === "notify") fill(); if (!page) nudge(); });
  B.explore.push(["#/notify", "Notifications", "New notes, suggestions and game night reminders"]);
})();
