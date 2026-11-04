// Warrior Kindle for challenges. Pure string builders, like kindleArt.js.
// scene: "ready" (crouch then flex), "fire" (draw and release a flaming arrow),
// "go" (jump with a shout). Animations live in kindle.css under .kw.
const BODY = "M0-118C14-86 62-62 62-2C62 52 32 88 0 88C-32 88-62 52-62-2C-62-26-48-44-36-58C-33-36-20-26-12-30C-22-62-10-96 0-118Z";
const BELLY = "M0-40C8-22 44-6 44 28C44 62 24 82 0 82C-24 82-44 62-44 28C-44-6-8-22 0-40Z";

function body() {
  return `<path d="${BODY}" fill="#E8590C"/><path d="${BODY}" fill="#F97316" transform="translate(0,-3) scale(.95)"/><path d="${BELLY}" fill="#FBBF24"/><path d="${BELLY}" fill="#FDE68A" transform="translate(0,10) scale(.6)"/><path d="M-50-2C-52 22-44 50-26 70" fill="none" stroke="#FDBA74" stroke-width="5" stroke-linecap="round" opacity=".8"/><ellipse cx="-22" cy="2" rx="7" ry="3" transform="rotate(-35 -22 2)" fill="#fff" opacity=".55"/><path class="tip" d="M0-118C9-98 15-84 9-66C1-80-5-96 0-118Z" fill="#FDBA74" opacity=".75"/>`;
}
function eye(cx, px, sq) {
  return `<ellipse cx="${cx}" cy="31" rx="9.5" ry="10" fill="#fff"/><circle cx="${cx + px}" cy="32" r="6.5" fill="#6B2D0E"/><circle cx="${cx + px}" cy="32" r="3.6" fill="#1F0A02"/><circle cx="${cx + px - 2}" cy="29" r="2" fill="#fff"/><circle cx="${cx + px + 2.5}" cy="35" r="1" fill="#fff"/><ellipse class="lid${sq ? " sq" : ""}" cx="${cx}" cy="31" rx="10" ry="10.5" fill="#FDE68A"/>`;
}
function face(o) {
  const brow = o.hype ? "M-35 14Q-20 3-6 13M35 14Q20 3 6 13" : "M-35 9L-6 23M35 9L6 23";
  const mouth = o.mouth === "shout"
    ? '<path d="M-9 66Q0 69 9 66L8 70Q0 73-8 70Z" fill="#fff"/><ellipse class="mouth" cx="0" cy="75" rx="11" ry="9" fill="#7A1F0F"/><ellipse cx="0" cy="80" rx="6.5" ry="3.5" fill="#F0756B"/>'
    : o.mouth === "line"
      ? '<path d="M-8 71L8 71" stroke="#7A1F0F" stroke-width="3.5" stroke-linecap="round"/>'
      : '<path d="M-9 70Q0 77 9 70" fill="none" stroke="#7A1F0F" stroke-width="3.5" stroke-linecap="round"/>';
  const slash = '<path d="M-48 41L-43 40L-39 59ZM-41 38L-36 38L-32 56ZM-34 36L-29 37L-26 53Z" fill="#B91C1C"/>';
  const paint = `${slash}<g transform="scale(-1,1)">${slash}</g>`;
  const must = '<path d="M-30 61Q-30 49-14 53Q-4 55 0 57Q4 55 14 53Q30 49 30 61Q22 57 14 61Q6 64 0 61Q-6 64-14 61Q-22 57-30 61Z" fill="#3B1708"/><path d="M-14 55Q-6 57 0 59" fill="none" stroke="#7A4A2A" stroke-width="1.5" stroke-linecap="round"/>';
  return `${eye(-17, o.px || 0, o.sq)}${eye(17, o.px || 0, o.sq)}<path d="${brow}" fill="none" stroke="#3B1708" stroke-width="6.5" stroke-linecap="round"/>${paint}${must}${mouth}`;
}
function band() {
  return '<path d="M-62-3Q0-18 62-3L62 11Q0-5-62 11Z" fill="#DC2626"/><path d="M-60-1Q0-15 60-1L60 2Q0-12-60 2Z" fill="#EF4444"/><path d="M-62 8Q0-8 62 8L62 11Q0-5-62 11Z" fill="#991B1B"/><circle cx="0" cy="-4" r="6.5" fill="#FBBF24"/><circle cx="0" cy="-4" r="3.5" fill="#F59E0B"/><g transform="translate(62,3)"><g class="t1"><path d="M0 0Q26-10 46 6L42 16Q24 2 0 12Z" fill="#DC2626"/><path d="M0 0Q26-10 46 6L44 9Q24-4 0 4Z" fill="#EF4444"/></g><g class="t2"><path d="M0 6Q22 8 40 26L33 32Q20 20 0 16Z" fill="#B91C1C"/></g><ellipse cx="0" cy="3" rx="7" ry="6" fill="#B91C1C"/></g>';
}
const limb = () => '<path d="M-56 40L-92 40" stroke="#C2410C" stroke-width="19" stroke-linecap="round"/><path d="M-56 38.5L-92 38.5" stroke="#F97316" stroke-width="14" stroke-linecap="round"/><path d="M-58 33L-90 33" stroke="#FDBA74" stroke-width="3" stroke-linecap="round" opacity=".7"/>';
const fore = () => '<path d="M-92 40L-92 6" stroke="#C2410C" stroke-width="19" stroke-linecap="round"/><path d="M-93.5 40L-93.5 6" stroke="#F97316" stroke-width="14" stroke-linecap="round"/><path d="M-98 36L-98 10" stroke="#FDBA74" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="-92" cy="-6" r="12.5" fill="#D97706"/><circle cx="-92.5" cy="-7" r="11.5" fill="#FBBF24"/><path d="M-98-10L-98-3M-92-12L-92-4M-86-10L-86-3" stroke="#B45309" stroke-width="1.4" stroke-linecap="round"/>';
function arm(mirror, u, f, bump) {
  const inner = `<g class="ua ${u}">${limb()}${bump ? `<g transform="translate(-78,29)"><circle class="${bump}" r="10" fill="#EA580C"/><path d="M-5-3Q0-7 5-3" stroke="#FDBA74" stroke-width="2" fill="none" stroke-linecap="round"/></g>` : ""}<g class="fa ${f}">${fore()}</g></g>`;
  return mirror ? `<g transform="scale(-1,1)">${inner}</g>` : inner;
}
const aura = (c) => `<g transform="translate(0,-8) scale(1.25)"><path class="aura ${c}" d="${BODY}" fill="#F97316"/></g>`;
function sparks(cls, n) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out += `<circle class="spark ${cls}" style="--dx:${Math.round(Math.cos(a) * (70 + (i % 3) * 18))}px;--dy:${Math.round(Math.sin(a) * (70 + (i % 2) * 20) - 20)}px;animation-delay:${i % 2 ? 0.03 : 0}s" cx="0" cy="20" r="${i % 2 ? 3 : 4}" fill="${i % 2 ? "#F97316" : "#FBBF24"}"/>`;
  }
  return out;
}
const wrap = (title, desc, inner) =>
  `<svg class="kw" width="100%" viewBox="0 0 380 340" role="img"><title>${title}</title><desc>${desc}</desc><g transform="translate(190,170)">${inner}</g></svg>`;
const shadow = (cls) => `<ellipse class="${cls}" cx="0" cy="98" rx="54" ry="9" fill="#000" opacity=".28"/>`;

function ready() {
  return wrap("Kindle ready for battle", "Kindle crouches, then pops up and flexes both arms with a burst of sparks.",
    `${shadow("s1sh")}${aura("s1a")}<g class="s1b">${arm(0, "s1u", "s1f", "s1bump")}${arm(1, "s1u", "s1f", "s1bump")}<g class="breathe">${body()}${face({ mouth: "smirk" })}${band()}</g></g>${sparks("s1sp", 10)}`);
}
function fire() {
  const armsFire = `<g class="ua" style="transform:rotate(18deg)">${limb()}<g class="fa" style="transform:rotate(-90deg)">${fore()}</g></g><g transform="scale(-1,1)"><g class="ua" style="transform:rotate(55deg)">${limb()}<g class="fa" style="transform:rotate(46deg)">${fore()}</g></g></g>`;
  const arrow = '<g class="s2ar"><path d="M-112 17L43 17" stroke="#E5D3B3" stroke-width="3.2" stroke-linecap="round"/><path d="M-128 17L-110 9L-110 25Z" fill="#F97316"/><path d="M-124 17L-112 12L-112 22Z" fill="#FDE68A"/><path d="M34 17L41 10M34 17L41 24M28 17L35 10M28 17L35 24" stroke="#EF4444" stroke-width="2.2" stroke-linecap="round"/><g class="s2fl"><path d="M43 17L70 6L60 17L70 28Z" fill="#F97316"/><path d="M43 17L60 11L54 17L60 23Z" fill="#FDE68A"/></g></g><g class="s2sl"><path d="M60 8L130 8M70 17L150 17M60 26L130 26" stroke="#FDBA74" stroke-width="2" stroke-linecap="round"/></g>';
  const bow = '<g class="s2bow"><path d="M-118-46Q-162 18-118 82" fill="none" stroke="#7C2D12" stroke-width="8" stroke-linecap="round"/><path d="M-118-46Q-162 18-118 82" fill="none" stroke="#B45309" stroke-width="5" stroke-linecap="round"/><path d="M-121-40Q-156 18-121 76" fill="none" stroke="#F59E0B" stroke-width="1.5" stroke-linecap="round"/><path d="M-118-46L-118 17L-118 82" fill="none" stroke="#F2EDE8" stroke-width="1.8"><animate attributeName="d" dur="3.6s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.1;0.52;0.54;1" keySplines="0.3 0 0.2 1;0 0 1 1;0.1 0.9 0.2 1;0 0 1 1" values="M-118 -46 L-118 17 L-118 82;M-118 -46 L43 17 L-118 82;M-118 -46 L43 17 L-118 82;M-118 -46 L-118 17 L-118 82;M-118 -46 L-118 17 L-118 82"/></path></g>';
  return wrap("Kindle firing a flaming arrow", "Kindle draws a bow, holds with tension, then releases a flaming arrow and recoils.",
    `${shadow("")}${aura("s2a")}<g class="s2b"><g class="s2tr">${armsFire}</g><g class="breathe">${body()}${face({ mouth: "line", px: -3, sq: 1 })}${band()}</g></g>${bow}${arrow}<circle class="s2ring" cx="-118" cy="17" r="14" fill="none" stroke="#FBBF24" stroke-width="4"/><circle class="s2ring b" cx="-118" cy="17" r="9" fill="none" stroke="#F97316" stroke-width="3"/>`);
}
function go() {
  return wrap("Kindle shouting let's go", "Kindle crouches, jumps with both fists raised and a shout, lands hard, and sparks burst out.",
    `${shadow("s3sh")}<ellipse class="s3ring" cx="0" cy="98" rx="46" ry="9" fill="none" stroke="#FBBF24" stroke-width="4"/>${aura("s3a")}<g class="s3b">${arm(0, "s3u", "s3f", "")}${arm(1, "s3u", "s3f", "")}<g class="breathe">${body()}${face({ mouth: "shout", hype: 1 })}${band()}</g></g>${sparks("s3sp", 12)}`);
}

export function warriorSvg(scene) {
  return scene === "fire" ? fire() : scene === "go" ? go() : ready();
}
