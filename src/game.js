// ============================================================
// NEIGHBOW — ride your own rainbow
// js13k 2026 entry — theme: UNICORNS AND RAINBOWS
// One button: HOLD to fly & paint a rainbow. Release to fall.
// Your painted rainbows stay solid for a few seconds — land on
// them and gallop along your own arc for double score.
// ============================================================
(() => {
"use strict";

// ---------- canvas / viewport ----------
const C = document.getElementById("c");
const X = C.getContext("2d");
if (!X.roundRect) X.roundRect = function (x, y, w, h) { this.rect(x, y, w, h) };
let LS; try { LS = localStorage } catch (e) { LS = {} }
const VH = 540;              // virtual height (world units)
let S = 1, VW = 960;         // scale, virtual width
const fit = () => {
  const d = Math.min(devicePixelRatio || 1, 2);
  C.width = innerWidth * d;
  C.height = innerHeight * d;
  S = C.height / VH;
  VW = C.width / S;
};
addEventListener("resize", fit);
fit();

// ---------- tiny helpers ----------
const RB = ["#ff4f6b", "#ff9f43", "#ffe74c", "#5ce87b", "#4cc9ff", "#b78bff"];
const PI = Math.PI, TAU = PI * 2;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
// deterministic hash noise (for decor placement / twinkles)
const hash = n => { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); };
// color lerp between [r,g,b] triples
const mix = (a, b, t) => `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`;

const txt = (s, x, y, sz, col, align = "center", w = 900) => {
  X.font = w + " " + sz + "px system-ui,Segoe UI,sans-serif";
  X.textAlign = align;
  X.fillStyle = col;
  X.fillText(s, x, y);
};

// ---------- audio ----------
let AC = null, MG = null, NB = null, muted = +(LS.nb_mute || 0);
const audio = () => {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  MG = AC.createGain();
  MG.gain.value = muted ? 0 : 0.5;
  MG.connect(AC.destination);
  // shared noise buffer
  NB = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
  const d = NB.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  mNext = AC.currentTime + 0.1;
};
const setMute = m => {
  muted = m; LS.nb_mute = m;
  if (MG) MG.gain.setTargetAtTime(m ? 0 : 0.5, AC.currentTime, 0.02);
};
// simple decaying tone
const tone = (f, dur, type = "sine", vol = 0.2, slide = 0, at = 0) => {
  if (!AC) return;
  const t0 = AC.currentTime + at;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(MG);
  o.start(t0); o.stop(t0 + dur + 0.02);
};
// filtered noise burst (clops / hats / whoosh)
const noise = (dur, vol, freq, q = 1, at = 0) => {
  if (!AC) return;
  const t0 = AC.currentTime + at;
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  s.buffer = NB; s.loop = true;
  f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(MG);
  s.start(t0); s.stop(t0 + dur + 0.02);
};
// music: I–V–vi–IV arpeggio loop, scheduled ahead
const M = 440;
const midi = m => M * Math.pow(2, (m - 69) / 12);
const CH = [[48, 52, 55, 60], [43, 47, 50, 59], [45, 48, 52, 57], [41, 45, 48, 57]];
let mStep = 0, mNext = 0;
const STEP = 60 / 132 / 2; // eighth notes @132bpm
const neigh = () => {
  for (let i = 0; i < 4; i++) tone(1000 - i * 70, 0.18, "triangle", 0.09, -420, i * 0.05);
  noise(0.3, 0.05, 2400, 1);
};
const musTick = () => {
  if (!AC || muted) return;
  if (mNext < AC.currentTime) mNext = AC.currentTime + 0.06; // tab was hidden — don't burst-schedule the backlog
  while (mNext < AC.currentTime + 0.15) {
    const ch = CH[(mStep >> 3) & 3], i = mStep & 7;
    const at = mNext - AC.currentTime;
    const arp = [0, 1, 2, 3, 2, 3, 1, 2][i];
    tone(midi(ch[arp] + 12), 0.18, "triangle", 0.055, 0, at);
    if (i == 0 || i == 4) tone(midi(ch[0] - 12), 0.4, "sine", 0.12, 0, at);
    if (!(i & 1)) noise(0.03, 0.02, 7000, 1, at);
    if (i == 3 || i == 6) tone(midi(ch[3] + 12), 0.25, "sine", 0.04, 0, at);
    mNext += STEP; mStep++;
  }
};

// ---------- game state ----------
let state = 0;               // 0 title, 1 play, 2 over
let T = 0;                   // global time (s)
let px, py, pyPrev, vy, dist, spd, meter, hold, air, ride, rideI, stun, ang;
let runPh = 0, hoofFlip = 0, stars = 0, combo = 0, score = 0, shake = 0, deathT = 0, mile = 0;
let best = +(LS.nb_best || 0);
let isl = [], star = [], cloud = [], tr = [], pp = [], pop = [];
let genX = 0, strokeId = 0, emitX = 0, flashT = 0, newBest = 0, starBank = 0;
let SD = 4.5, slid = 0, mEmpty = 0, landT = -9, neighed = 0, rideFlash = 0, lay = 0, lastW = 0;

const FLY_DRAIN = 30, GRASS_REGEN = 26, RIDE_REGEN = 10, STAR_METER = 14;
const FADE = 1.2, TRAIL_W = 17;

// ---------- terrain ----------
const gY = (a, x) => a.base - a.h1 * Math.sin(x * a.f1 + a.p1) - a.h2 * Math.sin(x * a.f2 + a.p2);
const islandAt = x => {
  for (const a of isl) if (x >= a.a && x <= a.b) return a;
  return null;
};
const genTo = xMax => {
  while (genX < xMax) {
    const first = !isl.length;
    const k = clamp(dist / 30000, 0, 1); // long-run squeeze
    const w = first ? 1500 : rnd(lerp(1000, 660, k), lerp(520, 370, k));
    const prev = isl.length ? isl[isl.length - 1].base : 400;
    const a = {
      a: genX, b: genX + w,
      base: first ? 400 : clamp(prev + rnd(70, -70), 330, 465),
      h1: first ? 6 : rnd(26, 10), f1: 1 / rnd(340, 240), p1: rnd(TAU),
      h2: first ? 2 : rnd(12, 4), f2: 1 / rnd(110, 70), p2: rnd(TAU)
    };
    isl.push(a);
    // stars on the island top
    for (let x = a.a + 90; x < a.b - 60; x += rnd(220, 130))
      if (!first || x > 700) star.push({ x, y: gY(a, x) - rnd(120, 45), ph: rnd(TAU), got: 0 });
    // gap after the island
    const gap = first ? 150 : clamp(110 + dist * 0.016, 110, 480) * rnd(1.2, 0.75);
    // star arc across the gap
    const n = 2 + (gap / 70 | 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      star.push({
        x: a.b + gap * t,
        y: gY(a, a.b) - 60 - Math.sin(t * PI) * (60 + gap * 0.3),
        ph: rnd(TAU), got: 0
      });
    }
    // storm clouds once things get going
    if (!first && dist > 500 && Math.random() < clamp(0.3 + dist * 0.00005, 0, 0.9)) {
      cloud.push({
        x: a.a + rnd(w - 100, 100),
        y: rnd(300, 90), w: rnd(52, 38), ph: rnd(TAU), cd: 0
      });
    }
    // a bully camped over the gap, right in the flight lane
    if (!first && dist > 3500 && Math.random() < clamp(0.25 + dist * 0.00006, 0, 0.85)) {
      cloud.push({
        x: a.b + gap * rnd(0.8, 0.2),
        y: gY(a, a.b) - 100 - gap * 0.3 - rnd(70, -30),
        w: rnd(50, 36), ph: rnd(TAU), cd: 0
      });
    }
    genX += w + gap;
  }
};

// ---------- particles / popups ----------
const puff = (x, y, n, col, sp = 90, up = 0, sz = 4, life = 0.6) => {
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU);
    pp.push({ x, y, vx: Math.cos(a) * rnd(sp), vy: Math.sin(a) * rnd(sp) - up, l: rnd(life, life * 0.4), m: 1, col, sz: rnd(sz, sz * 0.5) });
  }
};
const popup = (x, y, s, col = "#fff", sz = 22) => pop.push({ x, y, s, col, sz, l: 1 });

// ---------- reset / start ----------
const reset = () => {
  isl = []; star = []; cloud = []; tr = []; pp = []; pop = [];
  genX = 0; dist = 0; spd = 250;
  genTo(2600);
  // opening ribbon: every run begins riding a rainbow down onto the island
  for (let x = -200; x < 600; x += 14)
    tr.push({ x, y: 250 + (x + 200) * 0.19 + Math.sin(x * 0.012) * 10, t: 0, s: -1 });
  px = 140; py = 250 + 340 * 0.19 + Math.sin(140 * 0.012) * 10; pyPrev = py; vy = 0;
  meter = 100; hold = 0; air = 0; ride = 1; rideI = 0; stun = 0; ang = 0;
  stars = 0; combo = 0; score = 0; shake = 0; mile = 0; newBest = 0; starBank = 0;
  SD = 4.5; slid = 0; mEmpty = 0; landT = -9; neighed = 0; rideFlash = 0; lay = 0;
};
reset();

// ---------- input ----------
const press = () => {
  audio();
  if (AC && AC.state == "suspended") AC.resume();
  if (state == 0) { state = 1; reset(); neigh(); }
  else if (state == 2) { if (T - deathT > 0.7) { state = 1; reset(); neigh(); } }
  else hold = 1;
};
addEventListener("pointerdown", e => { if (e.button > 0) return; e.preventDefault(); press(); });
addEventListener("contextmenu", e => e.preventDefault());
addEventListener("pointerup", () => hold = 0);
addEventListener("pointercancel", () => hold = 0);
addEventListener("blur", () => hold = 0);
addEventListener("keydown", e => {
  if (e.repeat) return;
  if (e.code == "KeyM") { audio(); setMute(muted ? 0 : 1); return; }
  if (e.code == "Space" || e.code == "ArrowUp" || e.code == "KeyW") { e.preventDefault(); press(); }
});
addEventListener("keyup", e => {
  if (e.code == "Space" || e.code == "ArrowUp" || e.code == "KeyW") hold = 0;
});

// ---------- update ----------
const die = () => {
  state = 2; deathT = T; hold = 0;
  shake = 16;
  puff(px, Math.min(py, VH - 20), 26, "#fff", 220, 120, 6, 1);
  for (let i = 0; i < 18; i++) puff(px, Math.min(py, VH - 20), 3, RB[i % 6], 260, 160, 5, 1.2);
  if (score > best) { best = score | 0; LS.nb_best = best; newBest = 1; }
  tone(500, 0.9, "triangle", 0.25, -420);
  noise(0.5, 0.2, 400, 1);
};

const update = dt => {
  T += dt;
  if (state != 1) {
    // menus still need timers to settle: particles, popups, shake, flash
    for (const p of pp) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.m) p.vy += 300 * dt; p.l -= dt; }
    pp = pp.filter(p => p.l > 0);
    for (const t of pop) { t.y -= 30 * dt; t.l -= dt * 0.9; }
    pop = pop.filter(t => t.l > 0);
    shake = Math.max(0, shake - dt * 30);
    flashT = Math.max(0, flashT - dt);
    runPh += dt * 6;
    musTick();
    return;
  }
  musTick();

  // difficulty / speed
  spd = 250 + Math.min(190, dist * 0.011);
  SD = 4.5 - Math.min(1.8, dist * 0.00004); // ribbons dry up faster the deeper you go
  const mv = spd * (ride || lay ? 1.12 : 1) * dt; // riding the rainbow is faster than running
  rideFlash = Math.max(0, rideFlash - dt * 5);
  stun = Math.max(0, stun - dt);
  flashT = Math.max(0, flashT - dt);

  // --- cast & ride: hold = gallop up the rainbow your horn lays beneath you ---
  const climbing = hold && meter > 0 && !stun;
  pyPrev = py;
  if (climbing) {
    if (!lay) { // a fresh cast begins at the hooves — hop clear of the grass
      lay = 1; ride = 0; air = 0; slid = 0;
      py -= 8; vy = Math.min(vy, -80);
      strokeId++; emitX = px - 13;
      if (T - lastW > 0.3) { lastW = T; noise(0.14, 0.1, 2300, 1); }
    }
    vy = lerp(vy, -235, 1 - Math.exp(-7 * dt));
    py += vy * dt;
    meter -= FLY_DRAIN * dt;
  } else if (lay) {
    // finger off the button (or meter dry) — the rainbow ends right here
    lay = 0; air = 1;
  }
  // lay the ribbon just ahead of the front hooves
  if (lay && px - emitX > 12) {
    emitX = px;
    tr.push({ x: px + 30, y: py + 2, t: T, s: strokeId });
    // magic stream from horn down to the road's leading edge
    for (let k = 0; k < 2; k++) {
      const bt = rnd();
      pp.push({ x: px + 24 + rnd(12, -4), y: lerp(py - 46, py + 2, bt) + rnd(5, -5), vx: rnd(30, -10), vy: rnd(-20, -50), l: 0.3, m: 0, col: RB[rnd(6) | 0], sz: 2 });
    }
  }
  if (!lay) { strokeId++; emitX = px - 999; } // sealed stroke never bridges
  if (air) vy = Math.min(vy + 950 * dt, 560);
  if (meter <= 0) {
    meter = 0;
    if (hold && !mEmpty) { // ran dry mid-flight — tell the player loudly
      mEmpty = 1;
      tone(620, 0.45, "triangle", 0.16, -400);
      popup(px, py - 84, "empty!", "#ff97b3", 17);
    }
  }
  if (meter > 20) mEmpty = 0;

  // --- horizontal move & wall check ---
  const px0 = px;
  const nx = px + mv;
  const wallIsl = islandAt(nx);
  if (ride || lay) {
    const gy = wallIsl ? gY(wallIsl, nx) : 9e9;
    if (py > gy + 40) {
      // rode straight into a cliff face — the cast fizzles
      ride = 0; lay = 0; strokeId++; emitX = px - 999; air = 1;
      vy = Math.min(vy + 950 * dt, 560); py += vy * dt;
      if (!slid) { slid = 1; stun = 0.4; shake = 8; noise(0.15, 0.25, 300, 1); }
    } else {
      px = nx;
      if (py > gy - 6) {
        // the ribbon carried us onto grass — step off
        ride = 0; lay = 0; air = 0; py = gy; vy = 0; slid = 0; landT = T;
        if (combo > 1) popup(px, py - 90, "landed", "#fff9", 14);
        combo = 0;
      }
    }
  } else if (wallIsl && !air) {
    // grounded: just follow terrain
    px = nx; py = gY(wallIsl, px); slid = 0;
    meter = Math.min(100, meter + GRASS_REGEN * dt);
    if (combo > 1) popup(px, py - 90, "landed", "#fff9", 14);
    combo = 0;
  } else if (wallIsl) {
    const gy = gY(wallIsl, nx);
    if (py > gy + 60) {
      // slammed into a cliff face — slide down it (fly to escape!)
      vy = Math.min(vy + 950 * dt, 560);
      py += vy * dt;
      if (!slid) { slid = 1; stun = 0.4; shake = 8; noise(0.15, 0.25, 300, 1); }
    } else if (py > gy - 8 && vy >= 0) {
      // touch down on grass (with a forgiving ledge boost)
      px = nx; py = gy; vy = 0;
      air = 0; slid = 0; landT = T;
      puff(px, py, 8, "#cfe8ff", 70, 40, 3, 0.4);
      noise(0.09, 0.18, 900, 1);
      if (combo > 1) popup(px, py - 90, "landed", "#fff9", 14);
      combo = 0;
    } else {
      px = nx; air = 1; py += vy * dt;
    }
  } else {
    // over a gap
    px = nx;
    if (!air) { air = 1; vy = Math.max(vy, 0); }
    if (air) py += vy * dt;
  }
  py = Math.max(py, 46);
  if (py > VH + 70) { die(); return; }

  // --- riding own rainbow ---
  if (ride) {
    // advance along the stroke
    let ok = 0;
    for (; rideI < tr.length - 1; rideI++) {
      const a = tr[rideI], b = tr[rideI + 1];
      if (b.s != a.s) break;
      if (px >= a.x && px <= b.x) {
        if (T - a.t > SD && a.s != -1) break;
        py = lerp(a.y, b.y, (px - a.x) / (b.x - a.x)) + 4; // sink into the sagging ribbon
        ang = lerp(ang, Math.atan2(b.y - a.y, b.x - a.x), 0.3);
        ok = 1;
        break;
      }
      if (px < a.x) { ok = 1; break; } // not there yet (shouldn't happen)
    }
    if (ok) {
      meter = Math.min(100, meter + RIDE_REGEN * dt);
      if (Math.random() < 0.5) pp.push({ x: px + rnd(10, -18), y: py + 4, vx: rnd(-20, -60), vy: rnd(-10, -50), l: 0.4, m: 0, col: RB[rnd(6) | 0], sz: 2 });
    } else {
      // launched off the end of the rainbow!
      const a = tr[Math.max(0, rideI - 1)], b = tr[Math.min(tr.length - 1, rideI)];
      ride = 0; air = 1;
      vy = b != a ? clamp((b.y - a.y) / Math.max(0.01, (b.x - a.x)) * spd, -430, 430) : 0;
    }
  } else if (air && vy > 30 && !climbing) {
    // falling: can we land on a painted rainbow?
    for (let i = tr.length - 1; i > 0; i--) {
      const a = tr[i - 1], b = tr[i];
      if (b.x < px - 30) break;
      if (a.s != b.s) continue;
      const age = T - b.t;
      if (b.s != -1 && (age < 0.3 || age > SD)) continue;
      if (px < a.x || px > b.x) continue;
      const yS = lerp(a.y, b.y, (px - a.x) / (b.x - a.x));
      if (pyPrev <= yS + 14 && py >= yS - 6) {
        ride = 1; rideI = i - 1; air = 0; py = yS; vy = 0; slid = 0; landT = T;
        puff(px, py + 4, 10, RB[rnd(6) | 0], 90, 50, 3, 0.5);
        tone(523, 0.2, "sine", 0.14); tone(659, 0.2, "sine", 0.14, 0, 0.06); tone(784, 0.25, "sine", 0.14, 0, 0.12);
        if (!neighed) { neighed = 1; neigh(); }
        popup(px, py - 60, "RIDE! x2", "#ffe74c", 20);
        break;
      }
    }
  }

  // --- gallop animation & clip-clop ---
  if (!air) {
    const old = runPh;
    runPh += dt * spd * 0.045;
    if ((old % PI) > (runPh % PI)) {
      hoofFlip ^= 1;
      if (ride || lay) {
        // hooves on rainbow ring like glass
        tone(1250 + hoofFlip * 260, 0.1, "sine", 0.07);
        rideFlash = 1;
        puff(px - 16, py, 3, RB[rnd(6) | 0], 60, 40, 2.5, 0.4);
      } else {
        noise(0.045, 0.09, hoofFlip ? 1500 : 1100, 2);
        if (Math.random() < 0.6) puff(px - 16, py, 2, "#d7c4a5", 40, 30, 2.5, 0.35);
      }
    }
  }

  // --- distance & score ---
  dist += px - px0;
  score = dist / 10 + starBank;
  const m = dist / 10 | 0;
  if (m >= mile + 250) {
    mile += 250;
    popup(px, py - 120, mile + "m!", "#fff", 26);
    tone(660, 0.15, "square", 0.1); tone(880, 0.15, "square", 0.1, 0, 0.1); tone(1320, 0.3, "square", 0.1, 0, 0.2);
  }

  // --- stars ---
  for (const s of star) {
    if (s.got) continue;
    const sy = s.y + Math.sin(T * 3 + s.ph) * 5;
    const dx = s.x - px, dy2 = sy - (py - 26);
    const d2 = dx * dx + dy2 * dy2;
    if (d2 < 8100) { s.x -= dx * 6 * dt; s.y -= dy2 * 6 * dt; } // magnet
    if (d2 < 1100) {
      s.got = 1; stars++;
      combo++;
      const pts = 10 * combo * (ride || lay ? 2 : 1);
      starBank += pts;
      meter = Math.min(100, meter + STAR_METER);
      puff(s.x, sy, 8, "#ffe74c", 130, 40, 3, 0.5);
      popup(s.x, sy - 24, "+" + pts, combo > 1 ? "#ffe74c" : "#fff", combo > 1 ? 20 : 16);
      tone(660 * Math.pow(2, Math.min(combo, 14) / 12), 0.25, "sine", 0.2);
      tone(990 * Math.pow(2, Math.min(combo, 14) / 12), 0.2, "sine", 0.08, 0, 0.03);
    }
  }

  // --- storm clouds ---
  for (const c of cloud) {
    c.cd = Math.max(0, c.cd - dt);
    const cy = c.y + Math.sin(T * 1.4 + c.ph) * 10;
    const dx = (c.x - px) / (c.w + 16), dy2 = (cy - (py - 26)) / (c.w * 0.6 + 14);
    if (dx * dx + dy2 * dy2 < 1 && !c.cd) {
      c.cd = 1.4; stun = 0.45; flashT = 0.25;
      meter = Math.max(0, meter - 35);
      vy = Math.max(vy, 160); air = 1; ride = 0; lay = 0;
      strokeId++; emitX = px - 999; // the zap snuffs the cast
      combo = 0;
      shake = 12;
      puff(px, py - 26, 14, "#ffe74c", 200, 0, 3, 0.4);
      tone(180, 0.35, "sawtooth", 0.25, -130);
      noise(0.25, 0.25, 600, 1);
      popup(px, py - 90, "ZAP!", "#ffb3c6", 22);
    }
  }

  // --- housekeeping ---
  genTo(px + VW * 2);
  const cut = px - VW;
  if (isl[0] && isl[0].b < cut) isl.shift();
  star = star.filter(s => !s.got && s.x > cut);
  cloud = cloud.filter(c => c.x > cut - 200);
  // cull the trail from the front only, keeping rideI pointing at the same segment
  let cutN = 0;
  while (cutN < tr.length && ((tr[cutN].s != -1 && T - tr[cutN].t > SD + FADE) || tr[cutN].x <= cut)) cutN++;
  if (cutN) { tr.splice(0, cutN); if (ride) rideI = Math.max(0, rideI - cutN); }

  for (const p of pp) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.m) p.vy += 300 * dt; p.l -= dt; }
  pp = pp.filter(p => p.l > 0);
  for (const t of pop) { t.y -= 30 * dt; t.l -= dt * 0.9; }
  pop = pop.filter(t => t.l > 0);
  shake = Math.max(0, shake - dt * 30);

  // body angle
  let target = 0;
  if (lay) target = clamp(vy * 0.0012, -0.38, 0.3);
  else if (!air && !ride) {
    const a = islandAt(px);
    if (a) target = Math.atan2(gY(a, px + 24) - gY(a, px - 24), 48);
  } else if (air) target = clamp(vy * 0.0009, -0.32, 0.42);
  ang = lerp(ang, target, 1 - Math.exp(-10 * dt));
};

// ---------- drawing ----------
const skyStops = [
  // t, top rgb, bottom rgb  (day → sunset → night → dawn → day)
  [0.00, [105, 185, 255], [205, 239, 255]],
  [0.30, [125, 170, 255], [255, 214, 165]],
  [0.42, [255, 130, 110], [255, 195, 140]],
  [0.55, [24, 24, 68], [80, 60, 120]],
  [0.72, [18, 20, 60], [60, 50, 110]],
  [0.83, [150, 110, 200], [255, 180, 160]],
  [1.00, [105, 185, 255], [205, 239, 255]]
];
const skyAt = ph => {
  let i = 0;
  while (skyStops[i + 1][0] < ph) i++;
  const [t0, a0, b0] = skyStops[i], [t1, a1, b1] = skyStops[i + 1];
  const t = (ph - t0) / (t1 - t0);
  return [mix(a0, a1, t), mix(b0, b1, t), i >= 3 && i <= 4 ? 1 : (i == 2 || i == 5) ? 0.4 : 0];
};

// pre-rendered glowing star (shadowBlur is too expensive to pay per star per frame)
const starCv = document.createElement("canvas");
starCv.width = starCv.height = 56;
{
  const s = starCv.getContext("2d");
  s.translate(28, 28);
  s.fillStyle = "#ffe74c";
  s.shadowColor = "#ffdd00"; s.shadowBlur = 12;
  s.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * PI / 5 - PI / 2, rr = i & 1 ? 4.95 : 11;
    s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath(); s.fill();
  s.shadowBlur = 0;
  s.fillStyle = "#fff8";
  s.beginPath(); s.arc(-2, -3, 2.5, 0, TAU); s.fill();
}
// gradients with fixed coordinates, built once
const SOILG = X.createLinearGradient(0, 300, 0, VH);
SOILG.addColorStop(0, "#a06a45"); SOILG.addColorStop(1, "#6e4630");
const METG = X.createLinearGradient(18, 0, 208, 0);
RB.forEach((c, i) => METG.addColorStop(i / 5, c));
const TITG = X.createLinearGradient(0, VH * 0.30 - 50, 0, VH * 0.30 + 14);
RB.forEach((c, i) => TITG.addColorStop(i / 5, c));
const HORNG = X.createLinearGradient(28, -70, 38, -84);
HORNG.addColorStop(0, "#ffd34d"); HORNG.addColorStop(1, "#fff3b8");

// the star of the show
const drawUni = (x, y, a, galloping, flying) => {
  X.save();
  X.translate(x, y);
  X.rotate(a);
  const q = Math.max(0, 1 - (T - landT) / 0.14) * 0.2; // landing squash
  if (q > 0) X.scale(1 + q, 1 - q);
  const bob = galloping ? Math.sin(runPh * 2) * 2 : Math.sin(T * 3) * 1.5;
  X.translate(0, bob);

  // tail — rainbow ribbons (streams harder while riding)
  const onRB = ride || lay;
  const tw = Math.sin(T * (onRB ? 11 : 7)) * (onRB ? 9 : 6), tl = flying ? 10 : onRB ? 6 : 0;
  for (let i = 0; i < 6; i++) {
    X.strokeStyle = RB[i];
    X.lineWidth = 3.4; X.lineCap = "round";
    X.beginPath();
    X.moveTo(-20, -34 + i * 2.2);
    X.quadraticCurveTo(-38, -38 + i * 2.6 + tw * 0.5, -50 - tl, -26 + i * 3 + tw + (flying ? 8 : 0));
    X.stroke();
  }

  // far legs (darker)
  const leg = (hx, ph, far, back) => {
    let la;
    if (galloping) la = Math.sin(runPh + ph) * 0.8;
    else if (flying || air) la = back ? 0.75 : -0.62;
    else la = Math.sin(T * 2 + ph) * 0.08;
    X.save();
    X.translate(hx, -26);
    X.rotate(la);
    X.strokeStyle = far ? "#ddd2ea" : "#fff";
    X.lineWidth = 7; X.lineCap = "round";
    X.beginPath(); X.moveTo(0, 0); X.lineTo(0, 22); X.stroke();
    X.fillStyle = "#e8b3d0";
    X.beginPath(); X.arc(0, 23, 3.6, 0, TAU); X.fill();
    X.restore();
  };
  leg(-13, 2.5, 1, 1); leg(13, 5.6, 1, 0);

  // body
  X.fillStyle = "#fff";
  X.beginPath(); X.ellipse(0, -32, 24, 15, -0.06, 0, TAU); X.fill();

  // near legs
  leg(-13, 0, 0, 1); leg(13, 3.1, 0, 0);

  // neck + head
  X.strokeStyle = "#fff"; X.lineWidth = 13; X.lineCap = "round";
  X.beginPath(); X.moveTo(13, -38); X.lineTo(26, -58); X.stroke();
  X.fillStyle = "#fff";
  X.beginPath(); X.ellipse(30, -60, 11, 8.5, 0.25, 0, TAU); X.fill();
  // muzzle
  X.fillStyle = "#ffeaf4";
  X.beginPath(); X.ellipse(38.5, -57.5, 5.5, 4.5, 0.25, 0, TAU); X.fill();
  X.fillStyle = "#d78";
  X.beginPath(); X.arc(40.5, -57, 0.9, 0, TAU); X.fill();
  // ear
  X.fillStyle = "#fff";
  X.beginPath(); X.moveTo(24, -66); X.lineTo(27.5, -76); X.lineTo(31, -66); X.closePath(); X.fill();
  // horn
  X.fillStyle = HORNG;
  X.beginPath(); X.moveTo(29.5, -67); X.lineTo(40, -85); X.lineTo(35.5, -65); X.closePath(); X.fill();
  if (flying) {
    X.globalAlpha = 0.5 + Math.sin(T * 14) * 0.2;
    if (meter < 25) X.globalAlpha *= Math.sin(T * 30) > 0 ? 1 : 0.25; // sputtering — almost dry
    X.fillStyle = "#fff7c9";
    X.beginPath(); X.arc(39, -84, 6, 0, TAU); X.fill();
    X.globalAlpha = 1;
  }
  // mane
  for (let i = 0; i < 6; i++) {
    X.strokeStyle = RB[i]; X.lineWidth = 3;
    X.beginPath();
    X.moveTo(12 - i * 0.5, -42 - i * 1.1);
    X.quadraticCurveTo(16 - i * 2 + Math.sin(T * 6 + i) * (onRB ? 4.5 : 2.5), -58 - i * 1.4, 24 - i * 2.3, -66 - i * 0.8);
    X.stroke();
  }
  // forelock
  X.strokeStyle = RB[0]; X.lineWidth = 2.5;
  X.beginPath(); X.moveTo(27, -68); X.quadraticCurveTo(33, -70, 34, -64); X.stroke();
  // eye + blush
  X.fillStyle = "#332";
  X.beginPath(); X.arc(30.5, -61.5, 2.4, 0, TAU); X.fill();
  X.fillStyle = "#fff";
  X.beginPath(); X.arc(31.3, -62.3, 0.9, 0, TAU); X.fill();
  X.fillStyle = "rgba(255,150,180,.45)";
  X.beginPath(); X.arc(34.5, -56, 3, 0, TAU); X.fill();

  X.restore();
};

const drawCloudShape = (x, y, w, col) => {
  X.fillStyle = col;
  X.beginPath();
  X.arc(x - w * 0.55, y, w * 0.5, 0, TAU);
  X.arc(x, y - w * 0.28, w * 0.62, 0, TAU);
  X.arc(x + w * 0.55, y, w * 0.5, 0, TAU);
  X.rect(x - w * 0.55, y, w * 1.1, w * 0.45);
  X.fill();
};

const draw = () => {
  const camX = px - VW * 0.34;
  const ph = (dist / 14000 + 0.06) % 1;
  const [top, bot, night] = skyAt(ph);

  X.setTransform(S, 0, 0, S, 0, 0);
  // sky
  const g = X.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  X.fillStyle = g;
  X.fillRect(0, 0, VW, VH);

  // sun / moon
  X.save();
  const cel = ((ph + 0.25) % 0.5) / 0.5; // 0..1 across sky, twice per cycle
  const cx = VW * (0.15 + cel * 0.7), cy = 150 - Math.sin(cel * PI) * 90;
  if (night < 0.6) {
    X.globalAlpha = 1 - night;
    const sg = X.createRadialGradient(cx, cy, 5, cx, cy, 60);
    sg.addColorStop(0, "#fff7d0"); sg.addColorStop(0.35, "#ffe36e"); sg.addColorStop(1, "rgba(255,220,110,0)");
    X.fillStyle = sg; X.beginPath(); X.arc(cx, cy, 60, 0, TAU); X.fill();
  }
  if (night > 0.3) {
    X.globalAlpha = night;
    X.fillStyle = "#f4f1ff";
    X.beginPath(); X.arc(cx, cy, 22, 0, TAU); X.fill();
    X.fillStyle = top;
    X.beginPath(); X.arc(cx - 9, cy - 6, 18, 0, TAU); X.fill();
    // twinkles
    for (let i = 0; i < 40; i++) {
      const sx = (hash(i) * 3000 - camX * 0.05) % VW, sy = hash(i + 99) * VH * 0.6;
      X.globalAlpha = night * (0.4 + Math.sin(T * 2 + i) * 0.3);
      X.fillStyle = "#fff";
      X.fillRect((sx + VW) % VW, sy, 2, 2);
    }
  }
  X.restore();

  // far mountains (2 parallax layers)
  const ridge = (par, base, amp1, f1, amp2, f2, col) => {
    X.fillStyle = col;
    X.beginPath();
    X.moveTo(0, VH);
    for (let sx = 0; sx <= VW + 40; sx += 40) {
      const wx = sx + camX * par;
      X.lineTo(sx, base - amp1 * Math.sin(wx * f1) - amp2 * Math.sin(wx * f2 + 2));
    }
    X.lineTo(VW, VH);
    X.closePath(); X.fill();
  };
  X.globalAlpha = 0.5;
  ridge(0.15, 330, 70, 0.002, 30, 0.0053, night > 0.5 ? "#2a2550" : "#9f8fd4");
  X.globalAlpha = 0.6;
  ridge(0.3, 400, 55, 0.0032, 22, 0.008, night > 0.5 ? "#241f45" : "#8a79c9");
  X.globalAlpha = 1;

  // decor clouds
  for (let i = 0; i < 6; i++) {
    const wx = (hash(i * 7) * 4000 - camX * 0.4 - T * 6) % (VW + 300) ;
    drawCloudShape((wx + VW + 300) % (VW + 300) - 150, 70 + hash(i * 13) * 160, 34 + hash(i * 3) * 20, "rgba(255,255,255,.6)");
  }

  // camera shake for world layer
  X.save();
  if (shake > 0) X.translate(rnd(shake, -shake) * 0.5, rnd(shake, -shake) * 0.5);
  X.translate(-camX, 0);

  // ---- painted rainbows ----
  // solid segments batch into one path per band; only expiring ones pay per-segment strokes
  X.lineCap = "round"; X.lineJoin = "round";
  // the ribbon sags under the unicorn's weight while ridden
  const dip = ride || lay ? (x => 5 * Math.exp(-(x - px) * (x - px) / 1500)) : (x => 0);
  for (let band = 0; band < 6; band++) {
    X.strokeStyle = RB[band];
    X.lineWidth = TRAIL_W / 6 + 0.7;
    const off = (band - 2.5) * (TRAIL_W / 6);
    const spec = [];
    X.globalAlpha = 0.9;
    X.beginPath();
    let pen = 0;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      if (a.s != b.s || b.x < camX - 20 || a.x > camX + VW + 20) { pen = 0; continue; }
      const age = T - b.t;
      if (b.s == -1 || age < SD - 1) {
        if (!pen) { X.moveTo(a.x, a.y + off + dip(a.x)); pen = 1; }
        X.lineTo(b.x, b.y + off + dip(b.x));
      } else {
        pen = 0;
        if (age < SD + FADE) spec.push(i);
      }
    }
    X.stroke();
    // last second before expiry: blink; after: fade out
    for (const i of spec) {
      const a = tr[i - 1], b = tr[i];
      const age = T - b.t;
      X.globalAlpha = age < SD ? 0.9 * (0.5 + 0.5 * Math.sin(T * 14)) : 0.9 * (1 - (age - SD) / FADE);
      X.beginPath();
      X.moveTo(a.x, a.y + off + dip(a.x));
      X.lineTo(b.x, b.y + off + dip(b.x));
      X.stroke();
    }
  }
  // hoofstrike glow while riding
  if ((ride || lay) && rideFlash > 0) {
    X.globalAlpha = rideFlash * 0.45;
    X.fillStyle = "#fff";
    X.beginPath(); X.ellipse(px - 6, py + 3, 26, 8, 0, 0, TAU); X.fill();
    X.globalAlpha = 1;
  }
  // fresh paint glints
  X.fillStyle = "#fff";
  for (const p of tr) {
    const g = T - p.t;
    if (p.s != -1 && g < 1 && hash(p.x) > 0.7) {
      X.globalAlpha = 1 - g;
      X.fillRect(p.x, p.y - 9 + hash(p.x * 3) * 18, 2.5, 2.5);
    }
  }
  X.globalAlpha = 1;

  // paint head: horn stream while casting, glow dot while the cast glides to its finish
  const casting = state == 1 && hold && meter > 0 && !stun;
  if (casting) {
    const hx = px + 30, hy = py + 2;
    if (casting) {
      // the rainbow pours out of the horn, down to the road's leading edge
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const hx0 = px + 36 * ca + 76 * sa, hy0 = py + 36 * sa - 76 * ca; // horn tip in world space
      X.globalAlpha = 0.55;
      X.lineWidth = 2.2;
      for (let i = 0; i < 6; i++) {
        X.strokeStyle = RB[i];
        X.beginPath();
        X.moveTo(hx0, hy0 + (i - 2.5) * 1.1);
        X.quadraticCurveTo(hx0 + 26 + Math.sin(T * 9 + i) * 3, hy0 + (hy - hy0) * 0.3, hx, hy + (i - 2.5) * (TRAIL_W / 6));
        X.stroke();
      }
    }
    X.globalAlpha = 0.35;
    X.fillStyle = RB[(T * 12 | 0) % 6];
    X.beginPath(); X.arc(hx, hy, 12, 0, TAU); X.fill();
    X.globalAlpha = 0.9;
    X.fillStyle = "#fff";
    X.beginPath(); X.arc(hx, hy, 4.5 + Math.sin(T * 20) * 1.5, 0, TAU); X.fill();
    X.globalAlpha = 1;
  }

  // ---- islands ----
  for (const a of isl) {
    if (a.b < camX - 60 || a.a > camX + VW + 60) continue;
    const x0 = Math.max(a.a, camX - 50), x1 = Math.min(a.b, camX + VW + 50);
    // soil
    X.beginPath();
    X.moveTo(a.a, VH + 60);
    X.lineTo(a.a, gY(a, a.a) + 10);
    for (let x = x0; x <= x1; x += 18) X.lineTo(x, gY(a, x));
    X.lineTo(a.b, gY(a, a.b) + 10);
    X.lineTo(a.b, VH + 60);
    X.closePath();
    X.fillStyle = SOILG; X.fill();
    // grass lip
    X.strokeStyle = "#5ecf63"; X.lineWidth = 12; X.lineCap = "round";
    X.beginPath();
    for (let x = x0; x <= x1; x += 18) {
      const y = gY(a, x) + 2;
      x == x0 ? X.moveTo(x, y) : X.lineTo(x, y);
    }
    X.stroke();
    X.strokeStyle = "#8ae88a"; X.lineWidth = 5;
    X.beginPath();
    for (let x = x0; x <= x1; x += 18) {
      const y = gY(a, x) - 2;
      x == x0 ? X.moveTo(x, y) : X.lineTo(x, y);
    }
    X.stroke();
    // flowers
    for (let x = Math.ceil(x0 / 90) * 90; x < x1; x += 90) {
      const h = hash(x);
      if (h < 0.55) continue;
      const fy = gY(a, x) - 4;
      X.fillStyle = ["#ff8fb3", "#ffe74c", "#c9a0ff"][x / 90 % 3 | 0];
      for (let k = 0; k < 5; k++) {
        X.beginPath();
        X.arc(x + Math.cos(k * TAU / 5) * 3.2, fy - 6 + Math.sin(k * TAU / 5) * 3.2, 2.2, 0, TAU);
        X.fill();
      }
      X.fillStyle = "#fff";
      X.beginPath(); X.arc(x, fy - 6, 2, 0, TAU); X.fill();
    }
  }

  // ---- stars ----
  for (const s of star) {
    if (s.got || s.x < camX - 30 || s.x > camX + VW + 30) continue;
    const sy = s.y + Math.sin(T * 3 + s.ph) * 5;
    X.save();
    X.translate(s.x, sy);
    X.rotate(Math.sin(T * 2 + s.ph) * 0.25);
    X.drawImage(starCv, -28, -28);
    X.restore();
  }

  // ---- storm clouds ----
  for (const c of cloud) {
    if (c.x < camX - 150 || c.x > camX + VW + 150) continue;
    const cy = c.y + Math.sin(T * 1.4 + c.ph) * 10;
    const zap = c.cd > 1.1;
    drawCloudShape(c.x, cy, c.w, zap ? "#8f8fb0" : "#4d4d66");
    // angry face
    X.strokeStyle = "#2b2b3d"; X.lineWidth = 3; X.lineCap = "round";
    X.beginPath(); X.moveTo(c.x - 16, cy - 12); X.lineTo(c.x - 6, cy - 7); X.stroke();
    X.beginPath(); X.moveTo(c.x + 16, cy - 12); X.lineTo(c.x + 6, cy - 7); X.stroke();
    X.fillStyle = "#2b2b3d";
    X.beginPath(); X.arc(c.x - 9, cy - 2, 2.6, 0, TAU); X.arc(c.x + 9, cy - 2, 2.6, 0, TAU); X.fill();
    X.beginPath(); X.arc(c.x, cy + 6, 4, 0.15 * PI, 0.85 * PI); X.stroke();
    if (zap) {
      X.fillStyle = "#ffe74c";
      X.beginPath();
      X.moveTo(c.x - 4, cy + c.w * 0.35);
      X.lineTo(c.x + 6, cy + c.w * 0.35 + 18);
      X.lineTo(c.x, cy + c.w * 0.35 + 18);
      X.lineTo(c.x + 8, cy + c.w * 0.35 + 40);
      X.lineTo(c.x - 6, cy + c.w * 0.35 + 16);
      X.lineTo(c.x + 1, cy + c.w * 0.35 + 16);
      X.closePath(); X.fill();
    }
  }

  // ---- particles ----
  for (const p of pp) {
    X.globalAlpha = clamp(p.l * 2, 0, 1);
    X.fillStyle = p.col;
    X.beginPath(); X.arc(p.x, p.y, p.sz, 0, TAU); X.fill();
  }
  X.globalAlpha = 1;

  // ---- unicorn ----
  if (state != 2) {
    const flying = hold && meter > 0 && !stun && state == 1;
    if (stun > 0 && (T * 20 | 0) % 2) X.globalAlpha = 0.4;
    drawUni(px, py, ang, !air && !ride || ride, flying);
    X.globalAlpha = 1;
  }

  // ---- popups ----
  for (const t of pop) {
    X.globalAlpha = clamp(t.l, 0, 1);
    X.strokeStyle = "#0006"; X.lineWidth = 4;
    X.font = "900 " + t.sz + "px system-ui,Segoe UI,sans-serif";
    X.textAlign = "center";
    X.strokeText(t.s, t.x, t.y);
    X.fillStyle = t.col;
    X.fillText(t.s, t.x, t.y);
  }
  X.globalAlpha = 1;

  // tutorial hints on the first stretch
  if (state == 1 && dist < 2400) {
    X.globalAlpha = clamp(1 - (dist - 2000) / 400, 0, 0.9);
    txt("HOLD — gallop up the rainbow you cast", 620, 250, Math.min(24, VW * 0.05), "#fff");
    txt("let go and the rainbow ends — you fall!", 1300, 230, Math.min(22, VW * 0.045), "#fffc");
    txt("grass & stars refill your rainbow", 2150, 250, Math.min(22, VW * 0.045), "#fffc");
    X.globalAlpha = 1;
  }

  X.restore(); // world

  // storm flash
  if (flashT > 0) {
    X.globalAlpha = flashT * 2;
    X.fillStyle = "#fff";
    X.fillRect(0, 0, VW, VH);
    X.globalAlpha = 1;
  }

  // ---------- UI ----------
  if (state == 1) {
    // rainbow meter
    const mw = 190, mh = 15, mx = 18, my = 18;
    X.fillStyle = "#0005";
    X.beginPath(); X.roundRect(mx - 3, my - 3, mw + 6, mh + 6, 9); X.fill();
    const low = meter < 25 && (T * 6 | 0) % 2;
    if (meter > 0) {
      X.fillStyle = low ? "#ff4f6b" : METG;
      X.beginPath(); X.roundRect(mx, my, mw * meter / 100, mh, 7); X.fill();
    }
    txt("RAINBOW", mx + 4, my + mh + 15, 11, "#ffffffbb", "left", 800);
    // score (gold while riding your rainbow)
    txt((score | 0) + "", VW - 20, 44, 34, ride || lay ? "#ffe74c" : "#fff", "right");
    txt("★ " + stars + (combo > 1 ? "   ×" + combo : ""), VW - 20, 70, 18, "#ffe74c", "right");
    txt((dist / 10 | 0) + "m", VW - 20, 92, 14, "#fffa", "right");
  }

  if (state == 0) {
    // title
    X.fillStyle = "#0003"; X.fillRect(0, 0, VW, VH);
    const tx = VW / 2, ty = VH * 0.30;
    X.save();
    X.translate(0, Math.sin(T * 1.5) * 4);
    X.font = "900 " + Math.min(92, VW * 0.14) + "px system-ui,Segoe UI,sans-serif";
    X.textAlign = "center";
    X.lineWidth = 10; X.strokeStyle = "#fff";
    X.strokeText("NEIGHBOW", tx, ty);
    X.fillStyle = TITG;
    X.fillText("NEIGHBOW", tx, ty);
    X.restore();
    txt("ride your own rainbow", tx, ty + 38, Math.min(22, VW * 0.07), "#fff");
    if (best) txt("best " + best, tx, ty + 66, 16, "#ffe74c");
    X.globalAlpha = 0.6 + Math.sin(T * 4) * 0.4;
    txt("tap / hold SPACE to play", tx, VH * 0.68, Math.min(24, VW * 0.075), "#fff");
    X.globalAlpha = 1;
    if (VW < 620) {
      txt("HOLD = ride your rainbow up", tx, VH * 0.86, 13, "#fffd");
      txt("catch ☆ · dodge clouds · M mute", tx, VH * 0.905, 12, "#fffb");
    } else {
      txt("HOLD = ride the rainbow you cast, upward · let go = it ends · refill on grass & ☆", tx, VH * 0.86, 15, "#fffd");
      txt("catch ☆ · dodge storm clouds · M = mute", tx, VH * 0.905, 14, "#fffb");
    }
    X.font = Math.min(12, VW * 0.037) + "px ui-monospace,Consolas,monospace";
    X.fillStyle = "#ffffff88"; X.textAlign = "center";
    X.fillText('git commit -m "add unicorns and rainbows" 🦄🌈', tx, VH - 14);
  }

  if (state == 2) {
    const a = clamp((T - deathT) * 2, 0, 0.55);
    X.fillStyle = "rgba(20,10,40," + a + ")";
    X.fillRect(0, 0, VW, VH);
    if (T - deathT > 0.5) {
      const tx = VW / 2;
      const hs = Math.min(52, VW * 0.08);
      const og = X.createLinearGradient(0, VH * 0.34 - hs, 0, VH * 0.34);
      RB.forEach((c, i) => og.addColorStop(i / 5, c));
      X.font = "900 " + hs + "px system-ui,Segoe UI,sans-serif";
      X.textAlign = "center";
      X.lineWidth = 7; X.strokeStyle = "#fff";
      X.strokeText("OVER THE RAINBOW", tx, VH * 0.34);
      X.fillStyle = og;
      X.fillText("OVER THE RAINBOW", tx, VH * 0.34);
      txt((score | 0) + "", tx, VH * 0.47, 46, "#ffe74c");
      txt((dist / 10 | 0) + "m  ·  ★ " + stars, tx, VH * 0.54, 20, "#fff");
      if (newBest) {
        X.save();
        X.translate(tx, VH * 0.61);
        X.rotate(Math.sin(T * 5) * 0.08);
        txt("NEW BEST!", 0, 0, 26, "#ffe74c");
        X.restore();
      } else if (best) txt("best " + best, tx, VH * 0.61, 18, "#fffa");
      X.globalAlpha = 0.6 + Math.sin(T * 4) * 0.4;
      txt("tap to gallop again", tx, VH * 0.73, 22, "#fff");
      X.globalAlpha = 1;
    }
  }
};

/*DBG*/
if (location.hash == "#dbg") window.DBG = {
  get: () => ({ state, px, py, vy, air, ride, lay, meter, dist, score, combo, stars, trLen: tr.length }),
  groundAt: x => { const a = islandAt(x); return a ? gY(a, x) : -1 }
};
/*DBG-END*/

// ---------- main loop ----------
let last = performance.now();
const loop = now => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
})();
