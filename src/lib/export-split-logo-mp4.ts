import { createSplitLogoRenderer, type SplitLogoRenderOptions } from "@/lib/render-split-logo-frame";

export async function exportSplitLogoMp4(options: SplitLogoRenderOptions): Promise<Blob> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } = await import("mediabunny");
  const { canvas, clock, renderAt } = await createSplitLogoRenderer(options);
  const count = Math.max(1, Math.round(clock.duration * 60 / 1000));
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: new Quality("high") });
  output.addVideoTrack(source, { frameRate: 60 });
  try {
    await output.start();
    for (let frame = 0; frame < count; frame++) {
      renderAt(frame * 1000 / 60);
      await source.add(frame / 60, 1 / 60);
      if (frame % 6 === 0 || frame === count - 1) options.onProgress?.(frame + 1, count);
    }
    await output.finalize();
    if (!output.target.buffer) throw new Error("MP4 encoder did not produce a file.");
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    throw error;
  }
}
