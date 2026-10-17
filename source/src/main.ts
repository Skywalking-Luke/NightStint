import { boot, G, car, mkBot, scatterPicks, style, addScore, stat, lv, note, showBanner, popText, bar, audio, gameOver, rnd, clamp, hash, pickOf, PLAYER_Y, botX, W, H, ctx, fmtT, $, SH, type Bot, type Game } from "./engine";

// ---------- fictional endurance circuit "Circuit de la Nuit" ----------
type Sec = { name: string; s0: number; len: number; dir: number; k: number; wig: number; lit: boolean };
const RAW: [string, number, number, number, number, boolean][] = [
  ["PIT STRAIGHT", 800, 0, 0, 0, true], ["DUNLOP-STYLE CURVE", 400, 1, 0.6, 0, true], ["THE ESSES", 500, 0, 0.7, 3, false], ["TERTRE KINK", 300, 1, 0.45, 0, false],
  ["LONG STRAIGHT", 1600, 0, 0.05, 0, false], ["CHICANE 1", 260, 0, 0.9, 2, true], ["MID STRAIGHT", 900, 0, 0.05, 0, false], ["CHICANE 2", 260, 0, 0.9, 2, true],
  ["HAIRPIN", 340, -1, 1.0, 0, true], ["FOREST RUN", 1100, 0, 0.35, 4, false], ["INDIANAPOLIS", 360, -1, 0.75, 0, false], ["ARNAGE", 300, 1, 0.95, 0, true], ["PORSCHE-STYLE CURVES", 800, 0, 0.6, 3, false], ["FORD CHICANE", 300, 0, 0.85, 2, true],
];
const SECS: Sec[] = []; let LAP = 0;
for (const r of RAW) { SECS.push({ name: r[0].replace("-STYLE", ""), s0: LAP, len: r[1], dir: r[2], k: r[3], wig: r[4], lit: r[5] }); LAP += r[1]; }
const lapPos = (s: number) => ((s % LAP) + LAP) % LAP;
function secAt(s: number) { const q = lapPos(s); let lo = SECS[0]; for (const x of SECS) if (x.s0 <= q) lo = x; return lo; }
function centerF(s: number) { const sc = secAt(s), t = (lapPos(s) - sc.s0) / sc.len; let c = 5 * Math.sin(s / 260); if (sc.wig) c += 32 * sc.k * Math.sin(t * Math.PI * sc.wig) * Math.sin(t * Math.PI); else c += sc.dir * 70 * sc.k * Math.sin(t * Math.PI); return c; }
const widthF = (s: number) => (secAt(s).k > 0.8 ? 84 : 94);
const base = (L: number) => 290 * Math.pow(1.05, Math.min(L, 9) - 1);
function limitF(s: number) { const sc = secAt(s), t = (lapPos(s) - sc.s0) / sc.len; if (sc.k < 0.3 || t < 0.12 || t > 0.88) return 1e9; return base(G.level) * (1.12 - 0.6 * Math.pow(sc.k, 1.2)); }
const stintLen = (L: number) => 6500 + 1500 * (L - 1);
const DRIVERS = ["ALEX", "BEA", "CHEN", "DANI", "EMIL", "FARA"];
const clockAt = () => 15 + 3 * (G.level - 1) + 3 * clamp((G.pS - G.levelStart) / G.levelLen, 0, 1);
function darkness(h: number) { h = ((h % 24) + 24) % 24; if (h >= 21 || h < 5) return 1; if (h >= 19) return (h - 19) / 2; if (h < 7) return 1 - (h - 5) / 2; return 0; }
const fmtClock = (h: number) => { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };

const PLAYER = car("gt", "#0f8a6a", "#ffd23f", 77);
const GT4 = [["#e8e8e8", "#3b7bd2"], ["#f0c419", "#222"], ["#7a7a80", "#ff7a1a"], ["#38a84a", "#fff"], ["#9b4fd2", "#ffd23f"]].map(([a, b], i) => car("gt4", a, b, 40 + i * 7));
const GT = [["#d23b3b", "#fff"], ["#1f3c8a", "#ffd23f"], ["#ff7a1a", "#111"], ["#222", "#4fd2ff"]].map(([a, b], i) => car("gt", a, b, 60 + i * 9));
const PROTO = [["#111", "#ff2a6a"], ["#e8e8e8", "#d21f2f"], ["#1a5ad2", "#fff"], ["#ff4fa8", "#111"]].map(([a, b], i) => car("proto", a, b, i + 1));

let dmg = 0, push = 0, pushes = 0, nextPushAt = 4000, beamT = 0, failT = 0, fogT = 0, flashCD = 0, puncT = 0, puncDir = 1, fatigueT = 0;
let pending: Bot[] = [], protoAt: number[] = [], slowZones: [number, number][] = [], inSlow = false, stintStartT = 0, par = 0, curSec = "";
const spd = () => base(G.level);
const night = () => darkness(clockAt());

function spawnProto() {
  const s = G.pS - 230, poff = (G.px - centerF(s)) / (widthF(s) / 2 - 7);
  const b = mkBot(s, poff > 0 ? -0.6 : 0.6, G.v * 1.0 + 40, pickOf(PROTO), 0, "proto"); b.ahead = false; b.data = { proto: true, flashed: false, touched: false };
  G.bots.push(b); note("▲ HYPERCAR BEHIND · blue flag", "#4fd2ff", 1400); audio.beep(1500, 0.06); audio.beep(1500, 0.06);
}
function tryFlash() {
  if (flashCD > 0) return; flashCD = 1.5; G.flash = 0.08; audio.beep(1800, 0.05);
  const tgt = G.bots.find((b) => !b.dead && !b.data.proto && b.s - G.pS > 20 && b.s - G.pS < 140 && Math.abs(botX(b) - G.px) < 14);
  if (tgt) { tgt.tOff = tgt.off > 0 ? -0.75 : 0.75; tgt.kind = 0; tgt.t = 99; popText("FLASH · MOVING OVER"); }
}

const game: Game = {
  id: "nightstint", title: "NIGHT STINT", base: "/NightStint/", unit: "STINT", color: "#ffd23f", shadow: "#0f8a6a",
  ogSub: "24H · HEADLIGHTS · HYPERCARS",
  blurb: "GT endurance from afternoon into the dead of night. Thread slower GT4s, flash your lights to clear them, give way to the hypercars screaming up behind, and nurse your damaged car through every driver's stint.",
  controls: "◀ ▶ hold left/right · arrows or A/D<br>BRAKE ↓/S · FLASH lights F/W (slower car ahead moves over) · PUSH Space (charged by points)<br>Yellow SLOW ZONES: stay under 80 km/h · Esc pause · R retry · M mute",
  player: PLAYER, roster: [...GT4, ...GT, ...PROTO],
  picks: {
    L: { name: "LED HI-BEAM", good: true, col: "#fffbd0", desc: "", apply: () => { beamT = 10; failT = 0; showBanner("LED HI-BEAM", "see further · 10 s"); } },
    R: { name: "REPAIR KIT", good: true, col: "#7dff9a", desc: "", apply: () => { dmg = Math.max(0, dmg - 35); showBanner("REPAIR KIT", "damage -35%"); } },
    A: { name: "ADRENALINE", good: true, col: "#ff7ad9", desc: "", apply: () => { G.fx.adr = 4; showBanner("ADRENALINE", "slow-mo focus · 4 s"); } },
    X: { name: "x2 PTS", good: true, col: "#ffd23f", desc: "", apply: () => { G.fx.x2 = 7; showBanner("DOUBLE POINTS", "7 s"); } },
    S: { name: "ROLL CAGE", good: true, col: "#4fd2ff", desc: "", apply: () => { G.shield = true; showBanner("ROLL CAGE", "absorbs one hit"); } },
    P: { name: "PUSH CHARGE", good: true, col: "#ff7a1a", desc: "", apply: () => { if (pushes < 3) pushes++; showBanner("+1 PUSH"); } },
    H: { name: "LIGHTS FAIL", good: false, col: "#333", desc: "", apply: () => { failT = 6; beamT = 0; showBanner("⚠ HEADLIGHT FAILURE", "6 s"); } },
    O: { name: "OIL", good: false, col: "#6a3fa8", desc: "", apply: () => { G.fx.oil = 2.5; showBanner("⚠ OIL", "grip lost"); } },
    U: { name: "PUNCTURE", good: false, col: "#999", desc: "", apply: () => { puncT = 5; puncDir = Math.random() < 0.5 ? -1 : 1; showBanner("⚠ SLOW PUNCTURE", "pulling · slower"); } },
    F: { name: "FOG BANK", good: false, col: "#c8d0d8", desc: "", apply: () => { fogT = 6; showBanner("⚠ FOG BANK", "6 s"); } },
    Z: { name: "FATIGUE", good: false, col: "#3b3b7b", desc: "", apply: () => { fatigueT = 5; showBanner("⚠ DRIVER FATIGUE", "slow reactions · 5 s"); } },
  },
  center: centerF, width: widthF, limit: (s) => limitF(s) * (1 - 0.15 * dmg / 100),
  levelLen: stintLen,
  vmax() {
    let v = spd(); v *= 1 - 0.2 * (dmg / 100); if (puncT > 0) v *= 0.88; if ((G.fx.push || 0) > 0) v *= 1.14;
    if (G.off && Math.abs(G.px - centerF(G.pS)) > widthF(G.pS) / 2 + 2) v *= 0.7;
    return v;
  },
  accel: () => 180 + 10 * G.level, brakeDecel: 380,
  steer: () => 105 * (puncT > 0 ? 0.75 : 1),
  grip: () => ((G.fx.oil || 0) > 0 ? 2 : fatigueT > 0 ? 5 : 30),
  kmh: (v) => v * 1.0,
  start() { dmg = 0; pushes = 0; nextPushAt = 4000; G.pack = true; G.edge = 26; G.dust = "#2f6b2a"; },
  startLevel() {
    stintStartT = G.runT; par = (G.levelLen / (spd() * 0.82)); curSec = "";
    if (G.level > 1) dmg = Math.max(0, dmg - 40);
    beamT = failT = fogT = puncT = fatigueT = 0; push = 0; pending = [];
    const L = G.level, len = G.levelLen, S = G.levelStart;
    const nSlow = Math.round(18 * Math.pow(1.3, L - 1)), nGT = 3 + L;
    for (let i = 0; i < nSlow; i++) { const s = S + 350 + ((i + rnd(0.1, 0.9)) / nSlow) * (len - 600); const b = mkBot(s, rnd(-0.7, 0.7), 0, pickOf(GT4), Math.random() < 0.15 + 0.06 * L ? pickOf([1, 2, 3, 4]) : 0, "gt4"); b.data = { r: rnd(0.62, 0.74), ph: rnd(0, 6) }; pending.push(b); }
    for (let i = 0; i < nGT; i++) { const s = S + 500 + ((i + rnd(0.2, 0.8)) / nGT) * (len - 900); const b = mkBot(s, rnd(-0.5, 0.5), 0, pickOf(GT), 1, "gt"); b.data = { r: rnd(0.86, 0.95), ph: 0 }; pending.push(b); }
    pending.sort((a, c) => a.s - c.s);
    const nP = 2 + 2 * L; protoAt = Array.from({ length: nP }, (_, i) => S + 600 + ((i + rnd(0.2, 0.8)) / nP) * (len - 1000));
    slowZones = []; for (let i = 0; i < Math.min(4, Math.floor(L / 2) + 1); i++) { const s = S + rnd(1200, len - 800); slowZones.push([s, s + 420]); }
    for (let i = 0; i < Math.min(10, 1 + L); i++) G.obs.push({ s: S + rnd(800, len - 300), off: rnd(-0.6, 0.6), w: 8, h: 6, kind: "debris", hit: false });
    scatterPicks(["L", "R", "A", "X", "S", "P"], 6 + L, ["H", "O", "U", "F", "Z"], Math.round(4 * Math.pow(1.4, L - 1)), 400);
    G.objs = [
      { label: `PASS ${8 + 4 * L} GT4 CARS`, cur: () => lv("gt4"), goal: 8 + 4 * L, bonus: 600 + 250 * L, show: () => `(${lv("gt4")})` },
      { label: `${2 + L} CLASS PASSES (GT)`, cur: () => lv("gt"), goal: Math.min(nGT, 2 + L), bonus: 800 + 250 * L, show: () => `(${lv("gt")})` },
      { label: `YIELD ${Math.min(nP, 2 + L)} HYPERCARS CLEAN`, cur: () => lv("yield"), goal: Math.min(nP, 2 + L), bonus: 700 + 200 * L, show: () => `(${lv("yield")})` },
      { label: `DAMAGE ≤ ${Math.max(15, 45 - 5 * L)}%`, cur: () => dmg, goal: Math.max(15, 45 - 5 * L), le: true, atEnd: true, bonus: 1000 + 300 * L },
      { label: `STINT UNDER ${fmtT(par)}`, cur: () => G.runT - stintStartT, goal: par, le: true, atEnd: true, bonus: 1200 + 300 * L },
    ];
    G.v = Math.max(G.v, spd() * 0.5);
    showBanner(`STINT ${L} · ${DRIVERS[(L - 1) % DRIVERS.length]}`, `${fmtClock(clockAt())} · ${night() > 0.5 ? "NIGHT · lights on" : night() > 0 ? "DUSK" : "DAYLIGHT"} · ${nP} hypercars`, 2400);
  },
  tick(dt) {
    G.slow = (G.fx.adr || 0) > 0 ? 0.6 : 1;
    beamT = Math.max(0, beamT - dt); failT = Math.max(0, failT - dt); fogT = Math.max(0, fogT - dt); flashCD = Math.max(0, flashCD - dt); puncT = Math.max(0, puncT - dt); fatigueT = Math.max(0, fatigueT - dt);
    while (pending.length && pending[0].s - G.pS < 420) { const b = pending.shift()!; if (b.s > G.pS + 60) G.bots.push(b); }
    while (protoAt.length && G.pS > protoAt[0]) { protoAt.shift(); spawnProto(); }
    G.bots.forEach((b) => { if (b.s < G.pS - 400 || b.s > G.pS + 1500) b.dead = true; });
    if (G.bots.length > 60) G.bots = G.bots.filter((b) => !b.dead);
    // slow zones
    const was = inSlow; inSlow = slowZones.some(([a, b]) => G.pS > a && G.pS < b);
    if (inSlow && !was) { note("⚑ SLOW ZONE · 80 KM/H", "#ffd23f", 1500); audio.beep(660, 0.25); }
    if (inSlow && G.v > 90) { G.score = Math.max(0, G.score - 220 * dt); stat("speeding", dt); if (Math.floor(G.t * 4) % 4 === 0) popText("SPEEDING IN SLOW ZONE!"); }
    if (!inSlow && was) { note("GREEN · RACING", "#7dff9a", 900); if (!lv("speeding")) { const g = addScore(300, "style"); popText(`DISCIPLINED +${g}`); } }
    // push meter
    while (G.score >= nextPushAt) { nextPushAt += 4000; if (pushes < 3) { pushes++; popText("+PUSH CHARGE"); } }
    if ((G.fx.push || 0) > 0) G.speedFx = 0.1;
    if ((G.fx.oil || 0) > 0) G.lat += Math.sin(G.t * 9) * 45;
    if (puncT > 0) G.lat += puncDir * 20;
    if (dmg > 50) G.lat += Math.sin(G.t * 3) * (dmg - 50) * 0.5;
    const sec = secAt(G.pS).name; if (sec !== curSec) { curSec = sec; if (G.pS - G.levelStart > 100) note(sec, "#ffffffaa", 900); }
    if (night() > 0.5) G.mult = Math.max(G.mult, 1.25);
  },
  botTick(b, dt) {
    if (b.data.proto) {
      b.v = Math.max(b.v, spd() * 1.22);
      const dy = b.s - G.pS, poff = (G.px - centerF(b.s)) / (widthF(b.s) / 2 - 7);
      if (dy < 0 && dy > -140 && Math.abs(poff - b.off) < 0.4 && !b.data.flashed) { b.data.flashed = true; b.tOff = clamp(b.off + (poff > b.off ? -0.8 : 0.8), -0.8, 0.8); audio.beep(2000, 0.04); }
      if (b.ahead && !b.data.yielded && dy > 40) { b.data.yielded = true; if (!b.data.touched) { stat("yield"); style("CLEAN YIELD", 150); } }
      return;
    }
    const lim = limitF(b.s + 40) * 0.9;
    b.v = Math.min(spd() * b.data.r, lim);
    if (b.kind === 4) b.tOff = 0.7 * Math.sin(G.t * 1.4 + b.data.ph);
    void dt;
  },
  onPass(b) { if (b.cls === "gt4") stat("gt4"); if (b.cls === "gt") { stat("gt"); style("CLASS PASS", 150); } if (night() > 0.5 && b.gap <= 6) style("NIGHT NERVE", 80); },
  onHit(b) {
    if (b.data.test) { gameOver("CRASH!"); return true; }
    const hard = b.data.proto || Math.abs(b.v - G.v) > 120 ? 30 : 16; dmg += hard; if (b.data.proto) b.data.touched = true;
    G.v *= 0.85; popText(`CONTACT · DAMAGE ${Math.round(dmg)}%`);
    if (dmg >= 100) gameOver("RETIRED · TOO MUCH DAMAGE");
    return true;
  },
  onObs() { dmg += 12; popText(`DEBRIS · DAMAGE ${Math.round(dmg)}%`); if (dmg >= 100) gameOver("RETIRED · TOO MUCH DAMAGE"); return true; },
  offroad(_side, dt) {
    const c = centerF(G.pS), hw = widthF(G.pS) / 2;
    if (Math.abs(G.px - c) > hw + 20) { dmg += 25 * dt; G.v *= 1 - 1.2 * dt; G.shake = 0.1; G.vxL = -Math.sign(G.px - c) * 40; if (dmg >= 100) gameOver("RETIRED · INTO THE ARMCO"); }
  },
  levelEnd() { return { bonus: Math.round(Math.max(0, par - (G.runT - stintStartT)) * 100) + 500 * G.level, msg: `driver change · ${DRIVERS[G.level % DRIVERS.length]} next` }; },
  hud() {
    const fx: string[] = [], up = (t: string) => fx.push(`<span class="u">${t}</span>`), dn = (t: string) => fx.push(`<span class="d">⚠ ${t}</span>`);
    if (inSlow) dn("SLOW ZONE 80"); if (beamT > 0) up("HI-BEAM " + beamT.toFixed(0)); if ((G.fx.push || 0) > 0) up("PUSH!"); if ((G.fx.adr || 0) > 0) up("ADRENALINE");
    if (failT > 0) dn("NO LIGHTS"); if (fogT > 0) dn("FOG"); if (puncT > 0) dn("PUNCTURE"); if (fatigueT > 0) dn("FATIGUE"); if ((G.fx.oil || 0) > 0) dn("OIL");
    if (night() > 0.5) up("NIGHT x1.25");
    ($("bpush") as HTMLButtonElement).disabled = pushes === 0 || (G.fx.push || 0) > 0;
    $("bpush").innerHTML = `PUSH<br>${"■".repeat(pushes)}${"□".repeat(3 - pushes)}`;
    return { info: `🕒 ${fmtClock(clockAt())} · ${DRIVERS[(G.level - 1) % DRIVERS.length]}<br>STINT ${fmtT(G.runT - stintStartT)} / PAR ${fmtT(par)}`, fx,
      panel: bar("DAMAGE", dmg / 100, dmg > 60 ? "#ff3b3b" : "#ff7a1a") + bar("NIGHT", night(), "#3b3b9b") };
  },
  row(y, s, L, R, c, hw) {
    const sc = secAt(s), band = Math.floor(s / 8);
    ctx.fillStyle = "#123a1a"; ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = (Math.floor(s / 24) & 1) ? "#3c8a34" : "#357d2e"; ctx.fillRect(L - 18, y, R - L + 36, 1);
    if (sc.k > 0.6) { ctx.fillStyle = hash(Math.floor(s / 2)) > 0.5 ? "#d8c08a" : "#cbb37c"; ctx.fillRect(L - 16, y, 14, 1); ctx.fillRect(R + 2, y, 14, 1); }
    ctx.fillStyle = (band & 1) ? "#b8bec4" : "#8a9096"; ctx.fillRect(L - 20, y, 2, 1); ctx.fillRect(R + 18, y, 2, 1);
    for (let bx = 0; bx < W; bx += 6) { if (bx > L - 26 && bx < R + 24) continue; const h = hash(Math.floor((bx - (W / 2 - G.camX)) / 6) * 31 + Math.floor(s / 6)); if (h > 0.5) { ctx.fillStyle = h > 0.85 ? "#2c6e2a" : h > 0.7 ? "#1f5a24" : "#0c2a12"; ctx.fillRect(bx, y, 6, 1); } }
    const sz = slowZones.some(([a, b]) => s > a && s < b);
    ctx.fillStyle = (Math.floor(s / 4) & 1) ? "#4a4c50" : "#46484c"; ctx.fillRect(L, y, R - L, 1);
    ctx.fillStyle = sz ? ((band & 1) ? "#ffd23f" : "#222") : (band & 1) ? "#e03030" : "#f4f4f4"; ctx.fillRect(L, y, 3, 1); ctx.fillRect(R - 3, y, 3, 1);
    ctx.fillStyle = "#e8e8e8"; ctx.fillRect(L + 3, y, 1, 1); ctx.fillRect(R - 4, y, 1, 1);
    if (sc.lit && Math.floor(lapPos(s)) % 90 < 3) { ctx.fillStyle = "#888"; ctx.fillRect(L - 24, y, 3, 1); ctx.fillRect(R + 21, y, 3, 1); }
    const rel = s - (G.levelStart + G.levelLen); if (rel > -6 && rel < 0) for (let x = L; x < R; x += 2) { ctx.fillStyle = ((x >> 1) + Math.floor(rel / 2)) & 1 ? "#fff" : "#111"; ctx.fillRect(x, y, 2, 1); }
    void c; void hw;
  },
  overlay(pY, sx) {
    const n = night(), h = ((clockAt() % 24) + 24) % 24;
    if (h > 17.5 && h < 21) { ctx.fillStyle = `rgba(255,120,40,${0.12 * Math.sin(Math.PI * (h - 17.5) / 3.5)})`; ctx.fillRect(0, 0, W, H); }
    if (h > 4.5 && h < 7.5) { ctx.fillStyle = `rgba(255,170,120,${0.12 * Math.sin(Math.PI * (h - 4.5) / 3)})`; ctx.fillRect(0, 0, W, H); }
    const fog = fogT > 0 ? 0.6 : 0;
    if (n > 0.02 || fog) {
      dk.width = W; dk.height = H; const d = dk.getContext("2d")!;
      d.fillStyle = `rgba(4,6,22,${Math.min(0.92, 0.88 * n + fog * 0.5)})`; d.fillRect(0, 0, W, H);
      d.globalCompositeOperation = "destination-out";
      const cone = (x: number, y: number, len: number, w: number, a: number) => { d.fillStyle = `rgba(0,0,0,${a})`; d.beginPath(); d.moveTo(x - 4, y); d.lineTo(x + 4, y); d.lineTo(x + w, y - len); d.lineTo(x - w, y - len); d.closePath(); d.fill(); };
      const px = Math.round(G.px + sx), py = pY - 10;
      const beam = failT > 0 ? 0.25 : beamT > 0 ? 1.7 : 1;
      cone(px, py, 120 * beam * (fog ? 0.5 : 1), 26 * beam, 0.55); cone(px, py, 70 * beam * (fog ? 0.6 : 1), 16 * beam, 0.9);
      const glow = (x: number, y: number) => { d.fillStyle = "rgba(0,0,0,.45)"; d.beginPath(); d.arc(x, y, 11, 0, 6.3); d.fill(); }; glow(px, pY);
      for (const b of G.bots) { if (b.dead) continue; const y = pY - (b.s - G.pS); if (y < -140 || y > H + 20) continue; const x = Math.round(botX(b) + sx); cone(x, y - 10, b.data.proto ? 110 : 55, b.data.proto ? 22 : 12, 0.6); glow(x, y); }
      for (let y = 0; y < H; y++) { const s = G.pS + (pY - y); const sc = secAt(s); if (sc.lit && Math.floor(lapPos(s)) % 90 < 1) { const c = centerF(s) + sx, hw = widthF(s) / 2; for (const lx of [c - hw - 22, c + hw + 22]) { d.fillStyle = "rgba(0,0,0,.5)"; d.beginPath(); d.arc(lx, y, 26, 0, 6.3); d.fill(); } } }
      d.globalCompositeOperation = "source-over";
      ctx.drawImage(dk, 0, 0);
      // light sources on top
      for (const b of G.bots) { if (b.dead) continue; const y = Math.round(pY - (b.s - G.pS)); if (y < -20 || y > H + 20) continue; const x = Math.round(botX(b) + sx); ctx.fillStyle = "#ff2020"; ctx.fillRect(x - 4, y + SH / 2 - 1, 2, 1); ctx.fillRect(x + 2, y + SH / 2 - 1, 2, 1); ctx.fillStyle = b.data.proto ? "#e8fbff" : "#fff6c8"; ctx.fillRect(x - 4, y - SH / 2, 2, 1); ctx.fillRect(x + 2, y - SH / 2, 2, 1); }
      ctx.fillStyle = "#ff2020"; ctx.fillRect(px - 4, pY + 9, 3, 1); ctx.fillRect(px + 1, pY + 9, 3, 1);
    }
    // blue-flag arrows for hypercars closing in from behind
    for (const b of G.bots) { if (!b.data.proto || b.ahead) continue; const dy = G.pS - b.s; if (dy < 0 || dy > 260) continue; const x = Math.round(botX(b) + sx); if (Math.floor(G.t * 6) & 1) { ctx.fillStyle = "#4fd2ff"; ctx.fillRect(x - 3, H - 8, 6, 2); ctx.fillRect(x - 1, H - 11, 2, 3); } }
    if ((G.fx.oil || 0) > 0) { ctx.fillStyle = "rgba(40,0,60,.12)"; ctx.fillRect(0, 0, W, H); }
  },
  drawObs(o, x, y) { ctx.fillStyle = "#9aa0a8"; ctx.fillRect(x - 4, y - 2, 4, 2); ctx.fillStyle = "#d23b3b"; ctx.fillRect(x, y, 3, 2); ctx.fillStyle = "#333"; ctx.fillRect(x - 2, y + 1, 2, 1); void o; },
  pads: [
    { id: "bflash", label: "FLASH", cls: "y", keys: ["f", "w", "arrowup"], down: () => tryFlash() },
    { id: "bpush", label: "PUSH", cls: "", keys: [" ", "shift", "b"], down: () => { if (pushes > 0 && !(G.fx.push > 0)) { pushes--; G.fx.push = 3; audio.boost(); showBanner("PUSH!", "+14% · 3 s"); } } },
    { id: "bbrake", label: "BRAKE", cls: "brk", down: () => (G.brakePad = true), up: () => (G.brakePad = false) },
  ],
  overLines: () => [["Race clock", fmtClock(clockAt())], ["Damage", Math.round(dmg) + "%"]],
  og() {
    G.level = 3; G.levelStart = -1e9; G.levelLen = 1e12; G.pS = 2400; G.px = centerF(G.pS) - 8; G.camX = centerF(G.pS);
    (game as any).__ogClock = true;
    G.bots = [mkBot(G.pS + 60, 0.45, 0, GT4[0], 0, "gt4"), mkBot(G.pS + 130, -0.35, 0, GT4[2], 0, "gt4"), mkBot(G.pS - 34, 0.5, 0, PROTO[0], 0, "proto")];
    G.bots[2].data = { proto: true }; G.bots[2].ahead = false;
  },
};
const dk = document.createElement("canvas");
boot(game);
