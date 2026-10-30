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

function cardBlob({ title, subtitle, stats, filename, mood = "happy" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot create a share image.");
  const background = context.createLinearGradient(0, 0, 1080, 1350);
  background.addColorStop(0, "#fff8f2");
  background.addColorStop(1, "#f1e9df");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1350);
  context.fillStyle = "#c25a2c";
  context.beginPath();
  context.arc(910, 155, 230, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fffdfa";
  roundedRect(context, 72, 72, 936, 1206, 34);
  context.fill();
  context.fillStyle = "#c25a2c";
  context.font = "700 40px Arial, sans-serif";
  context.fillText("kinda", 132, 170);
  drawKindle(context, 132 + context.measureText("kinda").width + 24, 158, 0.21, "happy");
  drawKindle(context, 850, 222, 0.78, mood);
  context.fillStyle = "#242424";
  context.font = "700 68px Arial, sans-serif";
  context.fillText(title, 132, 340, 810);
  context.fillStyle = "#77716b";
  context.font = "400 30px Arial, sans-serif";
  context.fillText(subtitle, 132, 405, 810);
  const top = 500;
  const cardHeight = 150;
  stats.forEach((stat, index) => {
    const y = top + index * (cardHeight + 24);
    context.fillStyle = index % 2 ? "#f8f4ef" : "#fbede6";
    roundedRect(context, 132, y, 816, cardHeight, 24);
    context.fill();
    context.fillStyle = "#242424";
    context.font = "700 58px Arial, sans-serif";
    context.fillText(String(stat.value), 168, y + 94, 300);
    context.fillStyle = "#77716b";
    context.font = "500 28px Arial, sans-serif";
    context.fillText(stat.label, 490, y + 88, 410);
  });
  context.fillStyle = "#77716b";
  context.font = "400 24px Arial, sans-serif";
  context.fillText("Small steps count. Keep showing up.", 132, 1160);
  context.fillStyle = "#c25a2c";
  context.font = "600 24px Arial, sans-serif";
  context.fillText("kinda.app", 132, 1215);
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
