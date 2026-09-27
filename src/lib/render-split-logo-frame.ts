import { splitLogoTimeline, type SplitLogoTiming } from "@/components/ui/SplitLogoLoader";

export interface SplitLogoRenderOptions {
  size: number;
  timing: SplitLogoTiming;
  light: boolean;
  showLabel: boolean;
  onProgress?: (done: number, total: number) => void;
}

function easing(x1: number, y1: number, x2: number, y2: number, progress: number) {
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
    if (x < progress) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
}

function position(time: number, start: number, length: number, curve: [number, number, number, number]) {
  if (time <= start) return 0;
  if (time >= start + length) return 1;
  return easing(...curve, (time - start) / length);
}

export async function createSplitLogoRenderer({ size, timing, light, showLabel }: SplitLogoRenderOptions) {
  const logo = new Image();
  logo.src = "/logo.png";
  await logo.decode();
  const clock = splitLogoTimeline(timing);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * 3);
  canvas.height = Math.round(size * 2.7);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  const background: [number, number, number] = light ? [232, 233, 237] : [17, 20, 26];
  const foreground: [number, number, number] = light ? [0, 0, 0] : [255, 255, 255];
  const scale = Math.min(canvas.width / 768, canvas.height / 692);
  const x = (canvas.width - 768 * scale) / 2 + 256 * scale;
  const y = (canvas.height - 692 * scale) / 2 + 202 * scale;

  function paintSlice(cropX: number, cropY: number, cropW: number, cropH: number, dx: number, dy: number) {
    ctx!.save();
    ctx!.beginPath();
    ctx!.rect(x + (cropX + dx) * scale, y + (cropY + dy) * scale, cropW * scale, cropH * scale);
    ctx!.clip();
    ctx!.drawImage(logo, 122, 106, 256, 288, x + dx * scale, y + dy * scale, 256 * scale, 288 * scale);
    ctx!.restore();
  }

  function renderAt(time: number) {
    ctx!.fillStyle = `rgb(${background.join(",")})`;
    ctx!.fillRect(0, 0, canvas.width, canvas.height);
    ctx!.filter = light ? "brightness(0)" : "none";
    for (let row = 0; row < 7; row++) {
      const start = clock.exitStart + Math.abs(row - 3) * timing.stagger;
      const dx = 540 * position(time, start, timing.exit, [.55, 0, .8, .25]);
      paintSlice(0, row * 288 / 7, 256, 288 / 7, dx, 0);
    }
    for (let column = 0; column < 5; column++) {
      const start = clock.enterStart + Math.abs(column - 2) * timing.stagger;
      const dy = -520 * (1 - position(time, start, timing.enter, [.2, .8, .2, 1]));
      paintSlice(column * 256 / 5, 0, 256 / 5, 288, 0, dy);
    }
    ctx!.filter = "none";
    if (showLabel) {
      ctx!.font = `${Math.max(9, Math.round(size * .1))}px Arial, sans-serif`;
      ctx!.textAlign = "center";
      ctx!.fillStyle = light ? "#636b79" : "#8d96a5";
      ctx!.fillText("Loading Disband", canvas.width / 2, canvas.height - Math.max(12, Math.round(size * .25)));
    }
  }

  return { canvas, ctx, clock, background, foreground, renderAt };
}
