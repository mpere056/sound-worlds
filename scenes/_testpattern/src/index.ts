import { MusicalTime, sampleCurve, type Song } from "@reaper-viz/core";
import { PixiBackend } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export interface TestPatternTuning {
  glow: number;
  gridOpacity: number;
  motion: number;
}

const DEFAULT_TUNING: TestPatternTuning = { glow: 0.72, gridOpacity: 0.22, motion: 1 };

export class TestPatternScene {
  readonly backendKind = "pixi";
  readonly #backend: PixiBackend;
  readonly #song: Song;
  readonly #time: MusicalTime;
  readonly #world = new Graphics();
  readonly #overlay = new Graphics();
  readonly #title: Text;
  readonly #status: Text;
  readonly tuning: TestPatternTuning;

  constructor(backend: PixiBackend, song: Song, tuning: Partial<TestPatternTuning> = {}) {
    this.#backend = backend;
    this.#song = song;
    this.#time = new MusicalTime(song);
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.#title = new Text({
      text: song.meta.name.toUpperCase(),
      style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 52, fontWeight: "700", fill: 0xf4f7ff, letterSpacing: 8 },
    });
    this.#title.position.set(72, 72);
    this.#status = new Text({
      text: "",
      style: { fontFamily: "ui-monospace, monospace", fontSize: 24, fill: 0x8ea4c7, letterSpacing: 2 },
    });
    this.#status.position.set(74, 145);
    this.#backend.layer("world").addChild(this.#world);
    this.#backend.layer("overlay").addChild(this.#overlay, this.#title, this.#status);
  }

  renderFrame(t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    const energy = sampleCurve(this.#song.master.energy, t);
    const beatPhase = this.#time.phase(t, "beat");
    const beat = this.#time.beatAt(t);
    const bar = this.#time.barAt(t);
    const section = this.#time.sectionAt(t);
    this.#world.clear();
    this.#overlay.clear();

    const bands = 24;
    for (let index = 0; index < bands; index += 1) {
      const mix = index / (bands - 1);
      const red = Math.round(7 + 12 * mix + energy * 10);
      const green = Math.round(16 + 18 * mix + energy * 8);
      const blue = Math.round(31 + 35 * mix + energy * 22);
      const color = (red << 16) | (green << 8) | blue;
      this.#world.rect(0, index * height / bands, width, height / bands + 2).fill(color);
    }

    for (let index = 0; index < 70; index += 1) {
      const x = ((index * 277 + 83) % 997) / 997 * width;
      const baseY = ((index * 431 + 29) % 1879) / 1879 * height;
      const drift = ((t * (8 + index % 9) * this.tuning.motion) + index * 17) % height;
      const y = (baseY + drift) % height;
      const radius = 1.5 + (index % 4) * 0.65;
      this.#world.circle(x, y, radius).fill({ color: 0xb8d6ff, alpha: 0.2 + energy * 0.45 });
    }

    const horizon = height * 0.66;
    const vanishX = width * (0.5 + 0.04 * Math.sin(t * 0.18 * this.tuning.motion));
    for (let lane = -5; lane <= 5; lane += 1) {
      this.#world.moveTo(vanishX + lane * 7, horizon)
        .lineTo(width / 2 + lane * 145, height)
        .stroke({ color: 0x79b8ff, width: lane === 0 ? 5 : 2, alpha: this.tuning.gridOpacity });
    }
    for (let row = 0; row < 13; row += 1) {
      const phase = (row / 13 + (t * 0.12 * this.tuning.motion) % (1 / 13)) % 1;
      const eased = phase * phase;
      const y = horizon + eased * (height - horizon);
      const halfWidth = 18 + eased * width * 0.72;
      this.#world.moveTo(vanishX - halfWidth, y).lineTo(vanishX + halfWidth, y)
        .stroke({ color: 0x79b8ff, width: 2 + eased * 4, alpha: this.tuning.gridOpacity * (0.4 + eased) });
    }

    const pulse = Math.max(0, 1 - beatPhase * 5);
    const orbRadius = 64 + energy * 82 + pulse * 34;
    const orbY = height * 0.43 + Math.sin(t * 0.55 * this.tuning.motion) * 42;
    for (let ring = 4; ring >= 1; ring -= 1) {
      this.#world.circle(vanishX, orbY, orbRadius + ring * 34)
        .fill({ color: 0x5db6ff, alpha: this.tuning.glow * 0.018 * ring });
    }
    this.#world.circle(vanishX, orbY, orbRadius).fill({ color: 0xd8f1ff, alpha: 0.82 + energy * 0.18 });
    this.#world.circle(vanishX - orbRadius * 0.2, orbY - orbRadius * 0.22, orbRadius * 0.46)
      .fill({ color: 0xffffff, alpha: 0.52 });

    const progress = Math.max(0, Math.min(1, t / this.#song.meta.durationSec));
    this.#overlay.roundRect(72, height - 120, width - 144, 10, 5).fill({ color: 0xffffff, alpha: 0.14 });
    this.#overlay.roundRect(72, height - 120, (width - 144) * progress, 10, 5).fill(0x8ad9ff);
    this.#status.text = `BAR ${String((bar?.index ?? 0) + 1).padStart(2, "0")}  ·  BEAT ${String(beat + 1).padStart(2, "0")}  ·  ${(section?.kind ?? "unknown").toUpperCase()}`;
    this.#backend.render();
  }

  destroy(): void {
    this.#world.destroy();
    this.#overlay.destroy();
    this.#title.destroy();
    this.#status.destroy();
  }
}
