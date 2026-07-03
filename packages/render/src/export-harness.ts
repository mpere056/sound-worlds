import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";

export interface FrameScheduleOptions {
  startSec: number;
  durationSec: number;
  fps: number;
}

export interface ScheduledFrame {
  index: number;
  sourceTimeSec: number;
  outputTimeSec: number;
  durationSec: number;
  keyFrame: boolean;
}

export function buildFrameSchedule(options: FrameScheduleOptions): ScheduledFrame[] {
  const { startSec, durationSec, fps } = options;
  if (!Number.isFinite(startSec) || startSec < 0) throw new RangeError("startSec must be non-negative and finite");
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new RangeError("durationSec must be positive and finite");
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("fps must be positive and finite");
  const frameDuration = 1 / fps;
  const frameCount = Math.ceil(durationSec * fps);
  const keyInterval = Math.max(1, Math.round(fps * 2));
  return Array.from({ length: frameCount }, (_, index) => ({
    index,
    sourceTimeSec: startSec + index * frameDuration,
    outputTimeSec: index * frameDuration,
    durationSec: Math.min(frameDuration, durationSec - index * frameDuration),
    keyFrame: index % keyInterval === 0,
  }));
}

export async function supportsCanvasMp4(width: number, height: number): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false;
  const codec = await getFirstEncodableVideoCodec(["avc"], { width, height, bitrate: QUALITY_HIGH });
  return codec === "avc";
}

export interface CanvasMp4ExportOptions extends FrameScheduleOptions {
  canvas: HTMLCanvasElement;
  renderFrame: (sourceTimeSec: number) => void;
  onProgress?: (completedFrames: number, totalFrames: number) => void;
}

export async function exportCanvasMp4(options: CanvasMp4ExportOptions): Promise<Blob> {
  const schedule = buildFrameSchedule(options);
  if (!(await supportsCanvasMp4(options.canvas.width, options.canvas.height))) {
    throw new Error("This browser does not expose an H.264 WebCodecs encoder");
  }
  const target = new BufferTarget();
  const format = new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target });
  const video = new CanvasSource(options.canvas, {
    codec: "avc",
    bitrate: QUALITY_HIGH,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(video, { frameRate: options.fps });
  await output.start();
  options.onProgress?.(0, schedule.length);
  for (const frame of schedule) {
    options.renderFrame(frame.sourceTimeSec);
    await video.add(frame.outputTimeSec, frame.durationSec, { keyFrame: frame.keyFrame });
    options.onProgress?.(frame.index + 1, schedule.length);
    if ((frame.index + 1) % 8 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  await output.finalize();
  if (!target.buffer) throw new Error("MP4 muxer finalized without producing a buffer");
  return new Blob([target.buffer], { type: format.mimeType });
}

export function captureCanvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Canvas PNG capture returned no data"));
    }, "image/png");
  });
}
