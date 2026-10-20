function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function cardBlob({ title, subtitle, stats, filename }) {
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
  context.fillText("kinda.", 132, 170);
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
