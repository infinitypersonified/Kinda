const KO = "M0-118C14-86 62-62 62-2C62 52 32 88 0 88C-32 88-62 52-62-2C-62-26-48-44-36-58C-33-36-20-26-12-30C-22-62-10-96 0-118Z";
const KM = "M0-40C8-22 44-6 44 28C44 62 24 82 0 82C-24 82-44 62-44 28C-44-6-8-22 0-40Z";
const KI = "M0-2C8 10 38 24 38 50C38 68 20 78 0 78C-20 78-38 68-38 50C-38 24-8 10 0-2Z";
const KARMS = {
  down: "M-58 28Q-76 38-74 56M58 30Q76 40 74 58",
  up: "M-58 28Q-82 18-84-6M58 28Q82 18 84-6",
  wave: "M-58 28Q-82 18-86-6M58 30Q76 40 74 58",
};
const KBROWN = "#4A1D0B";

function kStroke(context, d, color, width) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke(new Path2D(d));
  context.restore();
}
function kFill(context, d, color) {
  context.fillStyle = color;
  context.fill(new Path2D(d));
}
function kEllipse(context, x, y, rx, ry, color, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

// Draws Kindle the flame mascot. Moods: happy, proud, celebrate, cheer.
export function drawKindle(context, cx, cy, scale, mood = "happy") {
  context.save();
  context.translate(cx, cy);
  context.scale(scale, scale);
  if (mood === "celebrate") {
    [[-70, -70, 5, "#FFD54F"], [72, -80, 4, "#60A5FA"], [-40, -110, 3, "#FB7185"], [48, -112, 3, "#34D399"], [0, -132, 4, "#A78BFA"], [-88, -30, 3, "#34D399"], [88, -40, 3, "#FFD54F"]]
      .forEach(([x, y, r, color]) => kEllipse(context, x, y, r, r, color));
  }
  if (mood === "proud") kFill(context, "M-86-82L-82-74L-74-70L-82-66L-86-58L-90-66L-98-70L-90-74Z", "#FFD54F");
  if (mood === "cheer") kFill(context, "M98-44C86-56 98-70 106-60C114-70 126-56 114-44L106-34Z", "#FB7185");
  kStroke(context, mood === "celebrate" ? KARMS.up : mood === "cheer" ? KARMS.wave : KARMS.down, "#EF4423", 13);
  kFill(context, KO, "#EF4423");
  kFill(context, KM, "#FF8A1F");
  kFill(context, KI, "#FFD54F");
  const arcs = mood === "proud" || mood === "celebrate";
  if (arcs) {
    kStroke(context, "M-17 27Q-12 19-7 27M7 27Q12 19 17 27", KBROWN, 3);
  } else {
    kEllipse(context, -17, 32, 9, 11, "#fff");
    kEllipse(context, 17, 32, 9, 11, "#fff");
    kEllipse(context, -16, 34, 5.5, 8, KBROWN);
    kEllipse(context, 18, 34, 5.5, 8, KBROWN);
    kEllipse(context, -14, 30, 2.4, 2.4, "#fff");
    kEllipse(context, 20, 30, 2.4, 2.4, "#fff");
  }
  kEllipse(context, -31, 52, 7, 4.2, "#FB7185", 0.75);
  kEllipse(context, 31, 52, 7, 4.2, "#FB7185", 0.75);
  if (mood === "happy" || mood === "proud") {
    kStroke(context, "M-9 52Q0 64 9 52", KBROWN, 3);
  } else {
    kFill(context, "M-11 50Q0 72 11 50Z", KBROWN);
    kEllipse(context, 0, 62, 5.5, 3.2, "#FF8A80");
  }
  context.restore();
}

// A small PNG of Kindle, used in the PDFs.
export function kindleDataUrl(mood = "happy", px = 240) {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = Math.round(px * 1.15);
  const context = canvas.getContext("2d");
  if (!context) return null;
  drawKindle(context, px / 2, canvas.height * 0.62, px / 230, mood);
  return canvas.toDataURL("image/png");
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawSpark(context, x, y, radius, color, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x, y - radius);
  context.quadraticCurveTo(x + radius * 0.18, y - radius * 0.18, x + radius, y);
  context.quadraticCurveTo(x + radius * 0.18, y + radius * 0.18, x, y + radius);
  context.quadraticCurveTo(x - radius * 0.18, y + radius * 0.18, x - radius, y);
  context.quadraticCurveTo(x - radius * 0.18, y - radius * 0.18, x, y - radius);
  context.fill();
  context.restore();
}

function drawRosette(context, x, y, radius) {
  context.save();
  context.translate(x, y);
  context.shadowColor = "rgba(0, 0, 0, 0.48)";
  context.shadowBlur = 34;
  context.shadowOffsetY = 18;
  context.beginPath();
  for (let index = 0; index < 48; index += 1) {
    const angle = (Math.PI * 2 * index) / 48 - Math.PI / 2;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.955;
    const pointX = Math.cos(angle) * pointRadius;
    const pointY = Math.sin(angle) * pointRadius;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  const metal = context.createLinearGradient(-radius, -radius, radius, radius);
  metal.addColorStop(0, "#fff0bc");
  metal.addColorStop(0.24, "#e5b961");
  metal.addColorStop(0.52, "#fff4d0");
  metal.addColorStop(0.78, "#a9642c");
  metal.addColorStop(1, "#f5d686");
  context.fillStyle = metal;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(255, 247, 215, 0.82)";
  context.stroke();

  context.beginPath();
  context.arc(0, 0, radius * 0.91, 0, Math.PI * 2);
  context.fillStyle = "#123035";
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = "#855126";
  context.stroke();
  context.beginPath();
  context.arc(0, 0, radius * 0.86, 0, Math.PI * 2);
  const enamel = context.createRadialGradient(-radius * 0.34, -radius * 0.42, 4, 0, 0, radius);
  enamel.addColorStop(0, "#31585a");
  enamel.addColorStop(0.58, "#17393d");
  enamel.addColorStop(1, "#0b2228");
  context.fillStyle = enamel;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 228, 166, 0.78)";
  context.stroke();
  context.restore();
}

function drawStatTile(context, stat, x, y, width, height) {
  context.save();
  roundedRect(context, x, y, width, height, 20);
  const fill = context.createLinearGradient(x, y, x + width, y + height);
  fill.addColorStop(0, "rgba(39, 72, 73, 0.94)");
  fill.addColorStop(1, "rgba(17, 43, 48, 0.94)");
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(223, 181, 100, 0.42)";
  context.stroke();
  context.fillStyle = "#d9b866";
  context.fillRect(x + 24, y + 22, 4, height - 44);
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#d5c9ad";
  context.font = "700 19px Arial, sans-serif";
  context.fillText(String(stat.label).toUpperCase(), x + 48, y + 39, width - 72);
  context.fillStyle = "#fff1cd";
  context.font = "700 42px Georgia, serif";
  context.fillText(String(stat.value), x + 48, y + 82, width - 72);
  context.restore();
}

function drawMarkSeal(context, mark) {
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.beginPath();
  context.arc(756, 393, 43, 0, Math.PI * 2);
  const seal = context.createLinearGradient(720, 350, 792, 436);
  seal.addColorStop(0, "#fff4d0");
  seal.addColorStop(0.52, "#e5b961");
  seal.addColorStop(1, "#a9642c");
  context.fillStyle = seal;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(255, 247, 215, 0.94)";
  context.stroke();
  context.beginPath();
  context.arc(756, 393, 34, 0, Math.PI * 2);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(95, 55, 24, 0.62)";
  context.stroke();
  context.fillStyle = "#392716";
  context.font = `700 ${String(mark).length > 3 ? 17 : 23}px Georgia, serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(mark), 756, 393, 58);
  context.restore();
}

function cardBlob({
  title,
  headline,
  subtitle,
  stats = [],
  days = [],
  displayValue,
  displayLabel,
  ribbonText,
  mark,
  filename,
  mood = "happy",
  kind = "weekly",
}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot create a share image.");

  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, "#091c24");
  background.addColorStop(0.52, "#17363a");
  background.addColorStop(1, "#081920");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1350);

  const glow = context.createRadialGradient(540, 610, 30, 540, 610, 610);
  glow.addColorStop(0, "rgba(207, 151, 68, 0.2)");
  glow.addColorStop(0.58, "rgba(77, 117, 96, 0.08)");
  glow.addColorStop(1, "rgba(5, 20, 26, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1080, 1350);

  const stars = [
    [105, 220, 10], [942, 245, 7], [117, 556, 6], [966, 605, 10],
    [116, 870, 8], [959, 910, 6], [194, 1100, 5], [882, 1128, 8],
    [247, 302, 4], [846, 365, 4], [211, 785, 4], [858, 814, 5],
  ];
  stars.forEach(([x, y, radius], index) =>
    drawSpark(context, x, y, radius, index % 2 ? "#f5d686" : "#fff3ca", 0.76)
  );

  roundedRect(context, 38, 38, 1004, 1274, 44);
  context.lineWidth = 3;
  context.strokeStyle = "rgba(235, 196, 118, 0.62)";
  context.stroke();
  roundedRect(context, 55, 55, 970, 1240, 34);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(255, 241, 202, 0.22)";
  context.stroke();

  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = "#f3d48b";
  context.font = "700 22px Arial, sans-serif";
  context.fillText("K I N D A   ·   THE MOMENTUM COLLECTION", 540, 112);
  context.fillStyle = "#fff0cc";
  context.font = "700 54px Georgia, serif";
  context.fillText(String(headline || title).toUpperCase(), 540, 218, 850);
  context.fillStyle = "#c8d1c5";
  context.font = "500 24px Arial, sans-serif";
  context.fillText(String(subtitle || "").toUpperCase(), 540, 263, 850);

  drawRosette(context, 540, 563, 257);
  drawSpark(context, 358, 472, 11, "#fff0bd");
  drawSpark(context, 720, 493, 8, "#f3d48b");
  drawSpark(context, 727, 685, 10, "#fff0bd");
  drawKindle(context, 540, 570, 1.42, mood);
  if (kind === "badge" && mark) drawMarkSeal(context, mark);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.5)";
  context.shadowBlur = 15;
  context.shadowOffsetY = 8;
  context.beginPath();
  context.moveTo(244, 734);
  context.lineTo(836, 734);
  context.lineTo(809, 785);
  context.lineTo(836, 836);
  context.lineTo(244, 836);
  context.lineTo(271, 785);
  context.closePath();
  const ribbon = context.createLinearGradient(244, 734, 836, 836);
  ribbon.addColorStop(0, "#e5b961");
  ribbon.addColorStop(0.5, "#fff0bd");
  ribbon.addColorStop(1, "#bd7a36");
  context.fillStyle = ribbon;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 2;
  context.strokeStyle = "rgba(255, 247, 215, 0.92)";
  context.stroke();
  context.fillStyle = "#2b251a";
  context.font = "700 46px Georgia, serif";
  context.textAlign = "center";
  context.fillText(
    String(ribbonText || `${displayValue ?? ""} ${displayLabel || ""}`).trim().toUpperCase(),
    540,
    800,
    540,
  );
  context.restore();

  const isBadge = kind === "badge";
  const tileWidth = isBadge ? 832 : kind === "streak" ? 404 : 382;
  const tileGap = isBadge ? 0 : 24;
  const tileX = isBadge ? 124 : (1080 - (tileWidth * 2 + tileGap)) / 2;
  const tileY = isBadge ? 966 : kind === "streak" ? 941 : 905;
  const tileHeight = isBadge ? 112 : 94;
  stats.slice(0, isBadge ? 1 : 4).forEach((stat, index) => {
    const column = isBadge ? 0 : index % 2;
    const row = isBadge ? 0 : Math.floor(index / 2);
    drawStatTile(
      context,
      stat,
      tileX + column * (tileWidth + tileGap),
      tileY + row * (tileHeight + 17),
      tileWidth,
      tileHeight,
    );
  });

  if (kind === "weekly" && days.length) {
    context.fillStyle = "#d9bd7d";
    context.font = "700 17px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("SEVEN DAYS, ONE STORY", 540, 1150);
    const gap = 96;
    const startX = 540 - (gap * 3);
    days.slice(0, 7).forEach((day, index) => {
      const x = startX + index * gap;
      const y = 1192;
      const active = Number(day.done) > 0;
      context.beginPath();
      context.arc(x, y, 22, 0, Math.PI * 2);
      context.fillStyle = active ? "#e5b961" : "rgba(9, 28, 36, 0.72)";
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = active ? "#fff0bd" : "rgba(223, 181, 100, 0.54)";
      context.stroke();
      context.fillStyle = active ? "#2b251a" : "#bdc8bb";
      context.font = "700 18px Arial, sans-serif";
      context.fillText(String(day.done || "·"), x, y + 6);
      context.fillStyle = "#bdc8bb";
      context.font = "600 15px Arial, sans-serif";
      context.fillText(String(day.label).slice(0, 3).toUpperCase(), x, y + 44);
    });
  }

  context.fillStyle = "rgba(224, 214, 188, 0.8)";
  context.font = "600 17px Arial, sans-serif";
  context.textAlign = "center";
  context.fillText("SMALL STEPS. LASTING MOMENTUM.", 540, 1270);
  context.fillStyle = "#f3d48b";
  context.font = "700 19px Arial, sans-serif";
  context.fillText("KINDA.APP", 540, 1300);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn’t create the share image.")), "image/png"))
    .then(blob => ({ blob, filename }));
}

export async function shareProgressCard(card) {
  const { blob, filename } = await cardBlob(card);
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: card.title, text: card.subtitle, files: [file] });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}

export function socialShareUrl(channel, text, url) {
  const message = `${text} ${url}`;
  if (channel === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(message)}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
