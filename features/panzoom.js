/* Pan and zoom for an <svg> drawing: drag to pan, pinch or scroll to zoom.
   Used by the map and the connections web. */
(() => {
  const B = window.Brocettes;
  B.panZoom = function panZoom(svg, g, { min = 0.4, max = 6 } = {}) {
    let x = 0, y = 0, k = 1;
    const pts = new Map();
    let start = null, dragged = false;
    const apply = () => g.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
    // Convert a screen point to the SVG's own coordinate space.
    const local = (cx, cy) => {
      const p = svg.createSVGPoint(); p.x = cx; p.y = cy;
      return p.matrixTransform(svg.getScreenCTM().inverse());
    };
    const zoomAt = (cx, cy, factor) => {
      const nk = Math.min(max, Math.max(min, k * factor));
      const p = local(cx, cy);
      x = p.x - (p.x - x) * (nk / k); y = p.y - (p.y - y) * (nk / k); k = nk; apply();
    };
    svg.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { cx: e.clientX, cy: e.clientY, x, y }; dragged = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; start = { dist: Math.hypot(a.x - b.x, a.y - b.y), k, x, y, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; dragged = true; }
    });
    svg.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1 && start && start.cx !== undefined) {
        const m = svg.getScreenCTM(), dx = (e.clientX - start.cx) / m.a, dy = (e.clientY - start.cy) / m.d;
        if (Math.abs(e.clientX - start.cx) + Math.abs(e.clientY - start.cy) > 6) {
          if (!dragged) svg.setPointerCapture?.(e.pointerId); // capture only once it's a real drag, so taps still reach pins
          dragged = true;
        }
        if (dragged) { x = start.x + dx; y = start.y + dy; apply(); }
      } else if (pts.size === 2 && start?.dist) {
        const [a, b] = [...pts.values()];
        const factor = Math.hypot(a.x - b.x, a.y - b.y) / start.dist;
        x = start.x; y = start.y; k = start.k;
        zoomAt(start.mid.x, start.mid.y, factor);
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size === 0) start = null; if (pts.size === 1) { const [p] = [...pts.values()]; start = { cx: p.x, cy: p.y, x, y }; } };
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    svg.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    // A click right after a drag shouldn't open whatever was under the finger.
    svg.addEventListener("click", (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
    apply();
    return {
      zoom: (factor) => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor); },
      reset: () => { x = 0; y = 0; k = 1; apply(); },
      center: (px, py, nk = k) => { const vb = svg.viewBox.baseVal; k = Math.min(max, Math.max(min, nk)); x = vb.x + vb.width / 2 - px * k; y = vb.y + vb.height / 2 - py * k; apply(); },
    };
  };
  // +/− and reset buttons that sit on top of a pan/zoom drawing.
  B.zoomButtons = (pz) => {
    const box = document.createElement("div");
    box.className = "zoom-btns";
    box.innerHTML = `<button type="button" aria-label="Zoom in">+</button><button type="button" aria-label="Zoom out">−</button><button type="button" aria-label="Reset view">⟲</button>`;
    const [inB, outB, resetB] = box.querySelectorAll("button");
    inB.onclick = () => pz.zoom(1.4); outB.onclick = () => pz.zoom(1 / 1.4); resetB.onclick = () => pz.reset();
    return box;
  };
})();
