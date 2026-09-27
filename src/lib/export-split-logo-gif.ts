import { createSplitLogoRenderer, type SplitLogoRenderOptions } from "@/lib/render-split-logo-frame";

/** GIF viewers reliably honor 20 ms delays; 50 fps keeps the original runtime. */
export async function exportSplitLogoGif(options: SplitLogoRenderOptions): Promise<Blob> {
  const { GIFEncoder } = await import("gifenc");
  const { canvas, ctx, clock, background, foreground, renderAt } = await createSplitLogoRenderer(options);
  const count = Math.max(1, Math.round(clock.duration / 20));
  const palette = Array.from({ length: 256 }, (_, i) =>
    background.map((base, channel) => Math.round(base + (foreground[channel] - base) * i / 255)));
  const gif = GIFEncoder();
  for (let frame = 0; frame < count; frame++) {
    renderAt(frame * 20);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const indices = new Uint8Array(canvas.width * canvas.height);
    const base = background[0], span = foreground[0] - base;
    for (let pixel = 0; pixel < indices.length; pixel++) {
      indices[pixel] = Math.max(0, Math.min(255, Math.round((pixels[pixel * 4] - base) * 255 / span)));
    }
    gif.writeFrame(indices, canvas.width, canvas.height, {
      palette: frame === 0 ? palette : undefined, repeat: 0, delay: 20, dispose: 2,
    });
    if (frame % 6 === 0 || frame === count - 1) {
      options.onProgress?.(frame + 1, count);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  gif.finish();
  return new Blob([Uint8Array.from(gif.bytes())], { type: "image/gif" });
}
