// Kindle's drawn animations. These build SVG/HTML strings from fixed shapes only
// (no user text), which Kindle.jsx renders. Styles live in kindle.css.
const O = "M0-118C14-86 62-62 62-2C62 52 32 88 0 88C-32 88-62 52-62-2C-62-26-48-44-36-58C-33-36-20-26-12-30C-22-62-10-96 0-118Z";
const M = "M0-40C8-22 44-6 44 28C44 62 24 82 0 82C-24 82-44 62-44 28C-44-6-8-22 0-40Z";
const I = "M0-2C8 10 38 24 38 50C38 68 20 78 0 78C-20 78-38 68-38 50C-38 24-8 10 0-2Z";
const T = "M0 0C8-22 24-34 16-64C32-46 42-18 34 0Z";
const BR = "#4A1D0B", PK = "#FB7185", RD = "#EF4423", HD = "#FF8A1F", YL = "#FFD54F", CU = "#C2410C";

const st = (d, w, c) => `<path d="${d}" fill="none" stroke="${c || RD}" stroke-width="${w || 13}" stroke-linecap="round"/>`;
const ln = (a, b, c, d, w, col) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${col || HD}" stroke-width="${w || 8}" stroke-linecap="round"/>`;
const fist = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r || 10}" fill="${HD}"/>`;
const hand = (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="${HD}" stroke="${CU}" stroke-width="2"/>`;
const happyEyes = `<path d="M-17 27Q-12 19-7 27M7 27Q12 19 17 27" fill="none" stroke="${BR}" stroke-width="3" stroke-linecap="round"/>`;
const openEyes = `<ellipse cx="-17" cy="32" rx="9" ry="11" fill="#fff"/><ellipse cx="17" cy="32" rx="9" ry="11" fill="#fff"/><ellipse cx="-16" cy="34" rx="5.5" ry="8" fill="${BR}"/><ellipse cx="18" cy="34" rx="5.5" ry="8" fill="${BR}"/><circle cx="-14" cy="30" r="2.4" fill="#fff"/><circle cx="20" cy="30" r="2.4" fill="#fff"/>`;
const bigMouth = `<path d="M-11 50Q0 72 11 50Z" fill="${BR}"/><ellipse cx="0" cy="62" rx="5.5" ry="3.2" fill="#FF8A80"/>`;
const smirk = `<path d="M-8 53Q2 62 12 50" fill="none" stroke="${BR}" stroke-width="3" stroke-linecap="round"/>`;
const cheeks = `<ellipse cx="-31" cy="52" rx="7" ry="4.2" fill="${PK}" opacity=".75"/><ellipse cx="31" cy="52" rx="7" ry="4.2" fill="${PK}" opacity=".75"/>`;
const DOWNL = "M-58 28Q-76 38-74 56";

export const POSES = {
  thumbs: { name: "Thumbs up", say: "Nailed it!", L: st(DOWNL), R: st("M58 28Q88 22 86 4") + fist(86, -4, 14) + ln(79, -8, 76, -26, 10) + `<path d="M78 -2Q87 2 96 -2M78 5Q87 9 96 5" fill="none" stroke="${CU}" stroke-width="2.5" stroke-linecap="round"/>`, face: happyEyes + cheeks + bigMouth },
  peace: { name: "Peace sign", say: "Peace out, task!", L: st(DOWNL), R: st("M58 28Q82 14 80-6") + fist(80, -8) + ln(76, -10, 69, -34, 7) + ln(85, -10, 92, -34, 7), face: happyEyes + cheeks + bigMouth },
  dab: { name: "Dab", say: "Too easy.", L: "", R: st("M58 26L106-28") + fist(108, -30), face: openEyes + cheeks + smirk, oL: st("M-58 26Q-34 -4 8 22") + fist(10, 22) },
  pump: { name: "Fist pump", say: "Yes! Let’s gooo!", L: st(DOWNL), R: st("M58 28Q84 12 78-14") + fist(78, -18), face: happyEyes + cheeks + bigMouth },
  flex: { name: "Flex", say: "Strong work.", L: st("M-58 28Q-88 30-84-6") + fist(-84, -10), R: st("M58 28Q88 30 84-6") + fist(84, -10), face: openEyes + cheeks + smirk },
  spin: { name: "Spin", say: "Whoa, look at you go!", L: st("M-58 28L-92 18"), R: st("M58 28L92 18"), face: happyEyes + cheeks + bigMouth },
  salute: { name: "Salute", say: "Task complete, boss.", L: st(DOWNL), R: "", face: openEyes + cheeks + smirk, oR: st("M58 28Q90 8 30 6") + ln(30, 6, 2, 10, 10) + ln(30, 6, 2, 10, 4, YL) },
  clap: { name: "Clap", say: "Bravo! Bravo!", L: "", R: "", face: happyEyes + cheeks + bigMouth, oL: st("M-58 30Q-54 68-22 74") + hand(-13, 74), oR: st("M58 30Q54 68 22 74") + hand(13, 74), extra: `<g class="kd-mk">${ln(0, 60, 0, 48, 3, YL)}${ln(-9, 62, -16, 54, 3, YL)}${ln(9, 62, 16, 54, 3, YL)}</g>` },
  shimmy: { name: "Shimmy", say: "Do the done dance!", L: st("M-58 28Q-86 42-80 66"), R: st("M58 30Q86 44 80 68"), face: happyEyes + cheeks + bigMouth },
  wave: { name: "Wave", say: "Another one down!", L: st(DOWNL), R: st("M58 28Q82 18 86-6"), face: openEyes + cheeks + bigMouth },
};
export const POSE_KEYS = Object.keys(POSES);

let lastPose = "";
export function pickPose() {
  let key;
  do {
    key = POSE_KEYS[Math.floor(Math.random() * POSE_KEYS.length)];
  } while (key === lastPose && POSE_KEYS.length > 1);
  lastPose = key;
  return key;
}

const body = (inner) => `<path d="${O}" fill="${RD}"/><path d="${M}" fill="${HD}"/><path d="${I}" fill="${YL}"/>${inner}`;

export function poseHtml(key, size = 210) {
  const p = POSES[key] || POSES.wave;
  return `<svg class="kd kd-p-${key}" viewBox="-110 -150 250 260" width="${size}" height="${Math.round(size * 1.04)}" aria-hidden="true" focusable="false"><g class="kd-all"><g class="kd-gL">${p.L || ""}</g><g class="kd-gR">${p.R || ""}</g>${body(`<g class="kd-eyes">${p.face}</g>`)}<g class="kd-oL">${p.oL || ""}</g><g class="kd-oR">${p.oR || ""}</g>${p.extra || ""}</g></svg>`;
}

export function thinkingHtml(size = 110) {
  const eyes = `<g class="kd-eyes"><ellipse cx="-17" cy="32" rx="9" ry="11" fill="#fff"/><ellipse cx="17" cy="32" rx="9" ry="11" fill="#fff"/><g class="kd-pupils"><ellipse cx="-16" cy="34" rx="5.5" ry="8" fill="${BR}"/><ellipse cx="18" cy="34" rx="5.5" ry="8" fill="${BR}"/><circle cx="-14" cy="30" r="2.4" fill="#fff"/><circle cx="20" cy="30" r="2.4" fill="#fff"/></g></g>`;
  const bubbles = `<circle class="kd-tb" cx="70" cy="-56" r="5" fill="${YL}"/><circle class="kd-tb kd-tb2" cx="90" cy="-82" r="8" fill="${YL}"/><circle class="kd-tb kd-tb3" cx="104" cy="-120" r="13" fill="${YL}"/>`;
  return `<svg class="kd kd-think" viewBox="-100 -150 230 255" width="${size}" height="${Math.round(size * 1.1)}" aria-hidden="true" focusable="false"><g class="kd-all"><g>${st(DOWNL)}${st("M58 30Q76 40 74 58")}</g>${body(eyes + cheeks + `<ellipse cx="0" cy="56" rx="4" ry="5" fill="${BR}"/>`)}</g>${bubbles}</svg>`;
}

export function confettiHtml(n = 14) {
  const cols = [YL, RD, "#60A5FA", "#34D399", "#A78BFA", PK];
  let h = "";
  for (let i = 0; i < n; i++) {
    h += `<span class="kd-cf" style="left:${Math.round(Math.random() * 96)}%;background:${cols[i % cols.length]};animation-duration:${(1.6 + Math.random() * 1.4).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></span>`;
  }
  return h;
}

// ---- Streak scenes -------------------------------------------------------
let blueMode = false;
const arm = (d, c) => `<path ${c ? `class="${c}"` : ""} d="${d}" fill="none" stroke="${RD}" stroke-width="13" stroke-linecap="round"/>`;
const FACE = {
  happy: `${happyEyes}${cheeks}${bigMouth}`,
  amazed: `<ellipse cx="-17" cy="31" rx="11" ry="13" fill="#fff"/><ellipse cx="17" cy="31" rx="11" ry="13" fill="#fff"/><ellipse cx="-16" cy="33" rx="4.5" ry="6.5" fill="${BR}"/><ellipse cx="18" cy="33" rx="4.5" ry="6.5" fill="${BR}"/><path d="M-22 22L-20 27L-15 29L-20 31L-22 36L-24 31L-29 29L-24 27Z" fill="#fff"/><path d="M12 22L14 27L19 29L14 31L12 36L10 31L5 29L10 27Z" fill="#fff"/>${cheeks}<ellipse cx="0" cy="60" rx="6" ry="8" fill="${BR}"/><ellipse cx="0" cy="64" rx="3.5" ry="2.5" fill="#FF8A80"/>`,
  blow: `<path d="M-17 27Q-12 31-7 27M7 27Q12 31 17 27" fill="none" stroke="${BR}" stroke-width="3" stroke-linecap="round"/>${cheeks}<ellipse cx="6" cy="58" rx="5" ry="6" fill="${BR}"/>`,
};
function K(cx, cy, s, face, arms, cls) {
  const co = blueMode ? "kd-pO" : "", cm = blueMode ? "kd-pM" : "", ci = blueMode ? "kd-pI" : "";
  return `<g transform="translate(${cx},${cy}) scale(${s})"><g class="kd-kin"><g class="${cls || ""}"><g class="kd-kb">${arms}<path class="${co}" d="${O}" fill="${RD}"/><path class="${cm}" d="${M}" fill="${HD}"/><path class="${ci}" d="${I}" fill="${YL}"/>${FACE[face]}</g></g></g></g>`;
}
const tg = (x, y, s, c, d) => `<g transform="translate(${x},${y}) scale(${s})"><path class="kd-tg" style="animation-delay:${d}s" d="${T}" fill="${c}"/></g>`;
const star = (x, y, s, c, d) => `<path class="kd-tw" style="animation-delay:${d}s" d="M${x} ${y - s}L${x + s * 0.3} ${y - s * 0.3}L${x + s} ${y}L${x + s * 0.3} ${y + s * 0.3}L${x} ${y + s}L${x - s * 0.3} ${y + s * 0.3}L${x - s} ${y}L${x - s * 0.3} ${y - s * 0.3}Z" fill="${c}"/>`;
const emb = (x, y, n) => Array.from({ length: n }, (_, i) => `<circle class="kd-em" style="animation-delay:${i * 0.6}s" cx="${x + i * 9 - n * 4}" cy="${y}" r="2.5" fill="${i % 2 ? YL : HD}"/>`).join("");
const X = (i) => 40 + i * 43.33;

const SCENES = {
  row: { t: "2.1s", line: "Another flame on the fire.", svg(idx) {
    let f = "";
    for (let i = 0; i < 7; i++) {
      if (i < idx) f += tg(X(i) - 10, 338, 0.6, i % 2 ? HD : RD, i * 0.2);
      else if (i === idx) f += `<g transform="translate(${X(i) - 10},338) scale(.6)"><path d="${T}" fill="#3A2A22"/></g><g transform="translate(${X(i) - 10},338) scale(.6)"><path class="kd-ign" style="--t:2.05s" d="${T}" fill="${YL}"/></g><circle class="kd-ring" style="--t:2.05s" cx="${X(i)}" cy="320" r="10" fill="none" stroke="${YL}" stroke-width="2"/>`;
      else f += `<g transform="translate(${X(i) - 10},338) scale(.6)"><path d="${T}" fill="#3A2A22"/></g>`;
    }
    const litTo = idx > 0 ? X(idx - 1) : 40;
    const seg = idx > 0 ? `<rect class="kd-seg" x="${litTo}" y="361" width="43.3" height="8" fill="${HD}"/><g class="kd-hd"><circle cx="${litTo}" cy="365" r="12" fill="${YL}" opacity=".3"/><circle cx="${litTo}" cy="365" r="6" fill="${YL}"/></g>` : "";
    return `<ellipse class="kd-glow" style="--t:2s" cx="170" cy="330" rx="140" ry="90" fill="${HD}"/>${star(52, 130, 12, YL, 0)}${star(292, 110, 15, "#FFB74D", 0.5)}${star(70, 210, 8, YL, 1)}${star(285, 200, 9, YL, 1.4)}${K(170, 255, 0.85, "amazed", arm("M-58 28L-98 8M58 28L98 8"), "kd-hop")}<rect x="40" y="361" width="260" height="8" rx="4" fill="#3A2A22"/><rect x="40" y="361" width="${Math.max(0, litTo - 40)}" height="8" rx="4" fill="${HD}"/>${seg}${f}`;
  } },
  log: { t: "2.0s", line: "One more log on the fire.", svg() {
    const arms = arm("M-58 30Q-76 40-74 58") + arm("M58 28Q82 18 84-6", "kd-arm");
    return `<ellipse class="kd-glow" style="--t:1.9s" cx="250" cy="350" rx="110" ry="70" fill="${HD}"/>${K(85, 300, 0.7, "happy", arms, "kd-hop")}<g transform="translate(131,248)"><rect class="kd-lg" width="46" height="12" rx="6" fill="#9A5B33"/></g><rect x="214" y="372" width="70" height="13" rx="6" fill="#7C4A2D" transform="rotate(10 249 378)"/><rect x="214" y="372" width="70" height="13" rx="6" fill="#9A5B33" transform="rotate(-10 249 378)"/><g class="kd-gr" style="--g:1.9s">${tg(228, 372, 0.8, RD, 0)}${tg(246, 374, 1.1, HD, 0.4)}${tg(262, 372, 0.75, RD, 0.8)}</g><circle class="kd-ring" style="--t:1.9s" cx="250" cy="330" r="12" fill="none" stroke="${YL}" stroke-width="2"/>${emb(250, 330, 5)}`;
  } },
  pass: { t: "2.0s", line: "Passing the spark along.", svg(idx) {
    let c = "";
    for (let i = 0; i < 7; i++) {
      const x = X(i);
      c += `<rect x="${x - 9}" y="360" width="18" height="44" rx="4" fill="#F3E3D0"/><line x1="${x}" y1="360" x2="${x}" y2="352" stroke="#4A3A33" stroke-width="2"/>`;
      if (i < idx) c += tg(x - 6, 352, 0.32, i % 2 ? HD : RD, i * 0.2);
      else if (i === idx) c += `<g transform="translate(${x - 6},352) scale(.32)"><path class="kd-ign" style="--t:2s" d="${T}" fill="${YL}"/></g><circle class="kd-ring" style="--t:2s" cx="${x}" cy="338" r="8" fill="none" stroke="${YL}" stroke-width="2"/>`;
    }
    const dx = X(idx) - 214, dy = 168;
    const arms = arm("M-58 30Q-76 40-74 58") + arm("M58 28Q82 14 86 0");
    return `<style>.kd-st .kd-sp{animation-name:kd-sp-run}@keyframes kd-sp-run{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}55%{transform:translate(${dx * 0.55}px,-34px)}100%{opacity:1;transform:translate(${dx}px,${dy}px)}}</style>${star(60, 150, 10, YL, 0)}${star(285, 120, 13, "#FFB74D", 0.7)}${K(170, 250, 0.8, "happy", arms, "kd-hop")}<circle class="kd-sp" cx="214" cy="170" r="7" fill="${YL}"/><circle class="kd-sp" style="animation-delay:1s" cx="214" cy="170" r="4" fill="#FFF4E6"/>${c}`;
  } },
  aura: { t: "2.3s", line: "Your flame is growing.", svg() {
    let a = "";
    for (let k = 6; k >= 1; k--) a += `<g transform="translate(170,330) scale(${1 + k * 0.1})"><path d="${O}" fill="${HD}" opacity="${0.05 + 0.02 * (7 - k)}"/></g>`;
    return `${a}<g transform="translate(170,330) scale(1.75)"><path class="kd-auraN" d="${O}" fill="${YL}"/></g>${star(55, 120, 12, YL, 0)}${star(290, 100, 14, "#FFB74D", 0.6)}${K(170, 330, 1.0, "amazed", arm("M-58 28L-92 4M58 28L92 4"), "kd-bump")}`;
  } },
  blue: { t: "2.6s", line: "Your flame turned blue.", svg() {
    let o = "";
    for (let i = 0; i < 8; i++) {
      const a = (i * 45 * Math.PI) / 180;
      o += `<circle cx="${Math.cos(a) * 128}" cy="${Math.sin(a) * 128}" r="${i % 2 ? 3 : 4.5}" fill="${i % 2 ? "#BAE6FD" : "#38BDF8"}"/>`;
    }
    return `<g transform="translate(170,235)"><g class="kd-orb">${o}</g></g>${K(170, 290, 1.0, "amazed", arm("M-58 28L-92 4M58 28L92 4"), "kd-hop")}`;
  } },
  fan: { t: "2.4s", line: "Fanning the flames.", svg() {
    let p = "";
    [0, 0.5, 1].forEach((d) => { p += `<path class="kd-puff" style="animation-delay:${0.7 + d}s" d="M0 0Q10-9 20 0" transform="translate(118,297)" fill="none" stroke="#BAE6FD" stroke-width="3" stroke-linecap="round"/>`; });
    const arms = arm("M-58 30Q-76 40-74 58") + arm("M58 30Q76 40 74 58");
    return `<ellipse class="kd-glow" style="--t:2.2s" cx="255" cy="350" rx="100" ry="70" fill="${HD}"/>${K(80, 310, 0.7, "blow", arms, "kd-hop")}${p}<g class="kd-gr" style="--g:1.6s">${tg(225, 372, 0.8, RD, 0)}${tg(243, 374, 1.05, HD, 0.3)}${tg(261, 372, 0.9, RD, 0.6)}${tg(277, 374, 0.7, HD, 0.9)}</g><rect x="212" y="372" width="80" height="12" rx="6" fill="#7C4A2D"/>${emb(255, 335, 6)}`;
  } },
};
const NORMAL_SCENES = ["row", "log", "pass", "aura", "fan"];

export function pickStreakScene(streakDay) {
  if (streakDay > 0 && streakDay % 30 === 0) return "blue";
  return NORMAL_SCENES[Math.floor(Math.random() * NORMAL_SCENES.length)];
}

export function streakSceneHtml(key, to) {
  const scene = SCENES[key] || SCENES.row;
  const day = Math.max(1, Number(to) || 1);
  blueMode = key === "blue";
  const idx = (day - 1) % 7;
  return `<div class="kd-st" style="--t:${scene.t}"><svg class="kd-sc" viewBox="0 0 340 450" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${scene.svg(idx)}</svg><div class="kd-cnt"><div class="kd-num"><span class="kd-a">${day - 1}</span><span class="kd-b">${day}</span></div><p class="kd-lab">day streak</p></div><p class="kd-line">${scene.line}</p></div>`;
}
