export class RenderClock {
  readonly fps: number;
  readonly durationSec: number;
  readonly frameCount: number;

  constructor(fps: number, durationSec: number) {
    if (!(fps > 0) || !Number.isFinite(fps)) throw new RangeError("fps must be positive and finite");
    if (!(durationSec >= 0) || !Number.isFinite(durationSec)) throw new RangeError("durationSec must be non-negative and finite");
    this.fps = fps;
    this.durationSec = durationSec;
    this.frameCount = Math.ceil(durationSec * fps);
  }

  timeAt(frameIndex: number): number {
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex > this.frameCount) {
      throw new RangeError(`frame index ${frameIndex} is outside 0..${this.frameCount}`);
    }
    return Math.min(this.durationSec, frameIndex / this.fps);
  }

  frameAt(timeSec: number): number {
    const clamped = Math.max(0, Math.min(this.durationSec, timeSec));
    return Math.min(this.frameCount, Math.floor(clamped * this.fps + 1e-9));
  }

  *frames(): IterableIterator<{ frame: number; t: number }> {
    for (let frame = 0; frame < this.frameCount; frame += 1) {
      yield { frame, t: this.timeAt(frame) };
    }
  }
}
