const FLAWS = {
  sole: {
    short: "鞋底磨损",
    deduct: 59,
    x: 56,
    y: 76,
    // corner slots on white shoe image — kept clear of number circles
    lx: 10,
    ly: 90,
    align: "left",
  },
  upper: {
    short: "鞋面脏污",
    deduct: 25,
    x: 66,
    y: 48,
    lx: 94,
    ly: 16,
    align: "right",
  },
  lining: {
    short: "轻度氧化",
    deduct: 19,
    x: 38,
    y: 38,
    lx: 8,
    ly: 14,
    align: "left",
  },
};

const EXPAND_ALL_LIMIT = 3;
const LABEL_PAD = 8;
/** Minimum gap between label box and number circle (px). */
const PIN_GAP = 14;

const scanFrame = document.getElementById("scanFrame");
const shoeWrap = document.getElementById("shoeWrap");
const shoeImg = document.getElementById("shoeImg");
const finalPrice = document.getElementById("finalPrice");
const leaderSvg = document.getElementById("leaderSvg");
const hotspots = [...document.querySelectorAll(".hotspot")];
const labels = [...document.querySelectorAll(".pin-label")];
const flawIds = Object.keys(FLAWS);
const expandAll = flawIds.length <= EXPAND_ALL_LIMIT;

let activeId = null;

function animatePrice(el, to, duration = 900) {
  const start = performance.now();
  const from = 0;

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/** Map a point in shoe-image % space into shoe-wrap % space. */
function shoePctToWrapPct(sx, sy) {
  const shoe = shoeImg.getBoundingClientRect();
  const wrap = shoeWrap.getBoundingClientRect();
  const x = shoe.left + (sx / 100) * shoe.width - wrap.left;
  const y = shoe.top + (sy / 100) * shoe.height - wrap.top;
  return {
    x: (x / wrap.width) * 100,
    y: (y / wrap.height) * 100,
  };
}

function nudgeLabel(el, dx, dy) {
  if (!dx && !dy) return;
  const wrap = shoeWrap.getBoundingClientRect();
  el.style.left = `${parseFloat(el.style.left) + (dx / wrap.width) * 100}%`;
  el.style.top = `${parseFloat(el.style.top) + (dy / wrap.height) * 100}%`;
}

function clampLabelInShoe(el) {
  const shoe = shoeImg.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;

  if (box.left < shoe.left + LABEL_PAD) dx = shoe.left + LABEL_PAD - box.left;
  if (box.right > shoe.right - LABEL_PAD) dx = shoe.right - LABEL_PAD - box.right;
  if (box.top < shoe.top + LABEL_PAD) dy = shoe.top + LABEL_PAD - box.top;
  if (box.bottom > shoe.bottom - LABEL_PAD) dy = shoe.bottom - LABEL_PAD - box.bottom;

  nudgeLabel(el, dx, dy);
}

function rectsConflict(a, b, gap) {
  return !(
    a.right + gap <= b.left ||
    a.left - gap >= b.right ||
    a.bottom + gap <= b.top ||
    a.top - gap >= b.bottom
  );
}

/** Push label away until it clears every number circle. */
function separateFromPins(el) {
  for (let pass = 0; pass < 6; pass += 1) {
    const box = el.getBoundingClientRect();
    let moved = false;

    hotspots.forEach((pin) => {
      const core = pin.querySelector(".core") || pin;
      const cr = core.getBoundingClientRect();
      if (!rectsConflict(box, cr, PIN_GAP)) return;

      const bx = (box.left + box.right) / 2;
      const by = (box.top + box.bottom) / 2;
      const cx = (cr.left + cr.right) / 2;
      const cy = (cr.top + cr.bottom) / 2;
      let vx = bx - cx;
      let vy = by - cy;
      const len = Math.hypot(vx, vy);

      // if nearly coincident, push toward label's preferred side
      if (len < 1) {
        const prefer = el.classList.contains("is-right") ? -1 : 1;
        vx = prefer;
        vy = el.classList.contains("is-center") ? 1 : -0.3;
      } else {
        vx /= len;
        vy /= len;
      }

      const overlapX =
        Math.min(box.right, cr.right + PIN_GAP) -
        Math.max(box.left, cr.left - PIN_GAP);
      const overlapY =
        Math.min(box.bottom, cr.bottom + PIN_GAP) -
        Math.max(box.top, cr.top - PIN_GAP);
      const push = Math.max(overlapX, overlapY, PIN_GAP) + 4;
      nudgeLabel(el, vx * push, vy * push);
      moved = true;
    });

    if (!moved) break;
  }
}

function placeLabel(el, flaw) {
  el.hidden = false;
  el.classList.remove("is-left", "is-right", "is-center");
  el.classList.add(`is-${flaw.align}`);

  const pos = shoePctToWrapPct(flaw.lx, flaw.ly);
  el.style.left = `${pos.x}%`;
  el.style.top = `${pos.y}%`;

  el.style.animation = "none";
  void el.offsetWidth;

  clampLabelInShoe(el);
  void el.offsetWidth;
  separateFromPins(el);
  void el.offsetWidth;
  clampLabelInShoe(el);
  void el.offsetWidth;
  // final pass: numbers win — clear overlap even if near edge
  separateFromPins(el);

  el.style.animation = "";
}

function circleRim(cx, cy, r, tx, ty) {
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: cx + (dx / len) * r,
    y: cy + (dy / len) * r,
  };
}

function rayRectEdge(ox, oy, tx, ty, L, T, R, B) {
  const dx = tx - ox;
  const dy = ty - oy;
  let bestT = Infinity;
  let hit = { x: tx, y: ty };

  const tryEdge = (t, x, y, ok) => {
    if (ok && t > 0.001 && t < bestT) {
      bestT = t;
      hit = { x, y };
    }
  };

  if (Math.abs(dx) > 1e-6) {
    let t = (L - ox) / dx;
    tryEdge(t, L, oy + t * dy, oy + t * dy >= T - 0.5 && oy + t * dy <= B + 0.5);
    t = (R - ox) / dx;
    tryEdge(t, R, oy + t * dy, oy + t * dy >= T - 0.5 && oy + t * dy <= B + 0.5);
  }
  if (Math.abs(dy) > 1e-6) {
    let t = (T - oy) / dy;
    tryEdge(t, ox + t * dx, T, ox + t * dx >= L - 0.5 && ox + t * dx <= R + 0.5);
    t = (B - oy) / dy;
    tryEdge(t, ox + t * dx, B, ox + t * dx >= L - 0.5 && ox + t * dx <= R + 0.5);
  }
  return hit;
}

function drawLeaders(ids) {
  const ns = "http://www.w3.org/2000/svg";
  const fr = scanFrame.getBoundingClientRect();
  leaderSvg.setAttribute("viewBox", `0 0 ${fr.width} ${fr.height}`);
  leaderSvg.replaceChildren();

  ids.forEach((id) => {
    const flaw = FLAWS[id];
    const el = labels.find((n) => n.dataset.id === id);
    const pin = hotspots.find((n) => n.dataset.id === id);
    if (!flaw || !el || !pin || el.hidden) return;

    const core = pin.querySelector(".core") || pin;
    const cr = core.getBoundingClientRect();
    const lr = el.getBoundingClientRect();

    const cx = cr.left + cr.width / 2 - fr.left;
    const cy = cr.top + cr.height / 2 - fr.top;
    const r = Math.max(cr.width, cr.height) / 2 + 1.5;

    const lx = (lr.left + lr.right) / 2 - fr.left;
    const ly = (lr.top + lr.bottom) / 2 - fr.top;
    const L = lr.left - fr.left;
    const R = lr.right - fr.left;
    const T = lr.top - fr.top;
    const B = lr.bottom - fr.top;

    const start = circleRim(cx, cy, r, lx, ly);
    const end = rayRectEdge(cx, cy, lx, ly, L, T, R, B);

    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", start.x.toFixed(1));
    line.setAttribute("y1", start.y.toFixed(1));
    line.setAttribute("x2", end.x.toFixed(1));
    line.setAttribute("y2", end.y.toFixed(1));
    leaderSvg.appendChild(line);
  });
}

function showLabels(ids) {
  labels.forEach((el) => {
    const id = el.dataset.id;
    const on = ids.includes(id);
    if (!on) {
      el.hidden = true;
      return;
    }
    placeLabel(el, FLAWS[id]);
  });
  requestAnimationFrame(() => {
    ids.forEach((id) => {
      const el = labels.find((n) => n.dataset.id === id);
      if (!el || el.hidden) return;
      separateFromPins(el);
      clampLabelInShoe(el);
      separateFromPins(el);
    });
    drawLeaders(ids);
  });
  scanFrame.classList.toggle("has-active", ids.length > 0 && !expandAll);
}

function setActive(id) {
  activeId = id;
  hotspots.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === id);
  });
  if (!expandAll) {
    showLabels(id ? [id] : []);
  } else if (id) {
    showLabels(flawIds);
  }
}

function clearActive() {
  activeId = null;
  hotspots.forEach((btn) => btn.classList.remove("active"));
  if (!expandAll) showLabels([]);
}

function expandLabels() {
  scanFrame.classList.add("expanded");
  showLabels(flawIds);
}

function boot() {
  scanFrame.classList.remove("expanded", "has-active");
  showLabels([]);
  scanFrame.classList.add("scanning");
  animatePrice(finalPrice, 452);

  window.setTimeout(() => {
    scanFrame.classList.add("ready");
  }, 900);

  window.setTimeout(() => {
    if (expandAll) expandLabels();
    else setActive(flawIds[0]);
  }, 1400);
}

hotspots.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = btn.dataset.id;
    if (expandAll) {
      setActive(activeId === id ? null : id);
      return;
    }
    if (activeId === id) {
      clearActive();
      return;
    }
    setActive(id);
  });
});

scanFrame.addEventListener("click", () => {
  if (!expandAll && activeId) clearActive();
  else if (expandAll) clearActive();
});

window.addEventListener("resize", () => {
  if (scanFrame.classList.contains("expanded")) showLabels(flawIds);
  else if (activeId) showLabels([activeId]);
});

document.getElementById("ctaBtn").addEventListener("click", () => {
  clearActive();
  scanFrame.classList.remove("scanning", "ready", "expanded", "has-active");
  void scanFrame.offsetWidth;
  boot();
});

document.getElementById("sellBtn").addEventListener("click", () => {
  const btn = document.getElementById("sellBtn");
  const prev = btn.textContent;
  btn.textContent = "已发起出售";
  btn.disabled = true;
  window.setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 1400);
});

boot();
