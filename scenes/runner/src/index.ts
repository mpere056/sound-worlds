import { sampleTerrain, type RunnerPerformance } from "@reaper-viz/compiler-runner";
import { sampleCurve } from "@reaper-viz/core";
import { PixiBackend } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { RunnerPerformance } from "@reaper-viz/compiler-runner";

export interface RunnerTuning {
  terrainContrast: number;
  trail: number;
  parallax: number;
}

export class RunnerScene {
  readonly #backend: PixiBackend;
  readonly #performance: RunnerPerformance;
  readonly #background = new Graphics();
  readonly #world = new Graphics();
  readonly #runner = new Graphics();
  readonly #title: Text;
  readonly #status: Text;
  readonly tuning: RunnerTuning = { terrainContrast: 0.8, trail: 0.72, parallax: 1 };

  constructor(backend: PixiBackend, performance: RunnerPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    this.#title = new Text({
      text: "WAVEFORM RUNNER",
      style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 48, fontWeight: "700", fill: 0xf2f8ff, letterSpacing: 7 },
    });
    this.#title.position.set(68, 70);
    this.#status = new Text({
      text: "",
      style: { fontFamily: "ui-monospace, monospace", fontSize: 21, fill: 0x7f9ec5, letterSpacing: 2 },
    });
    this.#status.position.set(71, 135);
    backend.layer("runner-background").addChild(this.#background);
    backend.layer("runner-world").addChild(this.#world);
    backend.layer("runner-character").addChild(this.#runner);
    backend.layer("runner-overlay").addChild(this.#title, this.#status);
  }

  #screenY(height: number, runnerHeight: number, baseline: number, scale: number): number {
    return baseline - (height - runnerHeight) * scale * 0.56;
  }

  #drawTerrainLayer(
    graphics: Graphics,
    runnerX: number,
    worldX: number,
    runnerHeight: number,
    baseline: number,
    scale: number,
    factor: number,
    offsetY: number,
    color: number,
    alpha: number,
  ): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    const leftWorld = worldX * factor - runnerX / scale;
    const rightWorld = leftWorld + width / scale;
    const step = 0.5;
    graphics.moveTo(0, height);
    for (let x = leftWorld; x <= rightWorld + step; x += step) {
      const screenX = (x - leftWorld) * scale;
      const terrainHeight = sampleTerrain(this.#performance.statics.terrain, x);
      graphics.lineTo(screenX, this.#screenY(terrainHeight, runnerHeight, baseline + offsetY, scale));
    }
    graphics.lineTo(width, height).closePath().fill({ color, alpha });
  }

  renderFrame(t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    const xCurve = this.#performance.curves.x;
    const speedCurve = this.#performance.curves.speed;
    const energyCurve = this.#performance.curves.energy;
    if (!xCurve || !speedCurve || !energyCurve) throw new Error("Runner performance is missing required curves");
    const worldX = sampleCurve(xCurve, t);
    const speed = sampleCurve(speedCurve, t);
    const energy = sampleCurve(energyCurve, t);
    const runnerHeight = sampleTerrain(this.#performance.statics.terrain, worldX);
    const runnerX = width * 0.36;
    const baseline = height * 0.69;
    const scale = width / 25;
    this.#background.clear();
    this.#world.clear();
    this.#runner.clear();

    const bands = 18;
    for (let index = 0; index < bands; index += 1) {
      const mix = index / (bands - 1);
      const color = ((5 + Math.round(12 * mix)) << 16)
        | ((12 + Math.round(17 * mix)) << 8)
        | (27 + Math.round(38 * mix + energy * 18));
      this.#background.rect(0, index * height / bands, width, height / bands + 2).fill(color);
    }
    for (let index = 0; index < 65; index += 1) {
      const x = ((index * 239 + 73) % 1013) / 1013 * width;
      const y = ((index * 383 + 47) % 911) / 911 * height * 0.52;
      const drift = (worldX * (0.08 + (index % 5) * 0.018) * this.tuning.parallax) % width;
      this.#background.circle((x - drift + width) % width, y, 1.2 + index % 3)
        .fill({ color: 0x9ecfff, alpha: 0.16 + energy * 0.26 });
    }
    this.#drawTerrainLayer(this.#background, runnerX, worldX, runnerHeight, baseline, scale, 0.18 * this.tuning.parallax, -360, 0x132b4b, 0.46);
    this.#drawTerrainLayer(this.#background, runnerX, worldX, runnerHeight, baseline, scale, 0.38 * this.tuning.parallax, -230, 0x17365a, 0.62);
    this.#drawTerrainLayer(this.#background, runnerX, worldX, runnerHeight, baseline, scale, 0.62 * this.tuning.parallax, -115, 0x1c456c, 0.78);

    const leftWorld = worldX - runnerX / scale;
    const rightWorld = leftWorld + width / scale;
    const surface: Array<{ x: number; y: number }> = [];
    for (let x = leftWorld; x <= rightWorld + 0.25; x += 0.25) {
      surface.push({ x: (x - leftWorld) * scale, y: this.#screenY(sampleTerrain(this.#performance.statics.terrain, x), runnerHeight, baseline, scale) });
    }
    for (let stratum = 5; stratum >= 1; stratum -= 1) {
      this.#world.moveTo(0, height);
      for (const point of surface) {
        const ripple = Math.sin(point.x * 0.018 + stratum * 1.7) * (5 + stratum * 2);
        this.#world.lineTo(point.x, point.y + stratum * 48 + ripple);
      }
      this.#world.lineTo(width, height).closePath().fill({
        color: 0x102845 + stratum * 0x030609,
        alpha: 0.56 + stratum * 0.05 * this.tuning.terrainContrast,
      });
    }
    if (surface.length) {
      this.#world.moveTo(surface[0]!.x, surface[0]!.y);
      for (const point of surface.slice(1)) this.#world.lineTo(point.x, point.y);
      this.#world.stroke({ color: 0x70d9ff, width: 7, alpha: 0.64 + energy * 0.3 });
      this.#world.moveTo(surface[0]!.x, surface[0]!.y + 17);
      for (const point of surface.slice(1)) this.#world.lineTo(point.x, point.y + 17);
      this.#world.stroke({ color: 0x3775c1, width: 2, alpha: 0.8 });
    }
    for (let index = 0; index < 20; index += 1) {
      const length = 38 + (index % 6) * 24 + speed * 4;
      const y = 200 + ((index * 83) % 1180);
      const x = ((index * 167 - worldX * 68) % (width + 250) + width + 250) % (width + 250) - 100;
      this.#world.moveTo(x, y).lineTo(x - length, y)
        .stroke({ color: 0x71bfff, width: 2 + energy * 2, alpha: this.tuning.trail * (0.12 + energy * 0.25) });
    }

    const groundY = baseline - 8;
    const gait = t * (8 + speed * 0.55);
    const legSwing = Math.sin(gait) * 24;
    const armSwing = Math.sin(gait + Math.PI) * 19;
    const lean = Math.max(-0.28, Math.min(0.28,
      (sampleTerrain(this.#performance.statics.terrain, worldX + 0.2) - sampleTerrain(this.#performance.statics.terrain, worldX - 0.2)) * 0.5));
    for (let ring = 4; ring >= 1; ring -= 1) {
      this.#runner.circle(runnerX, groundY - 94, 38 + ring * 18)
        .fill({ color: 0x4ec9ff, alpha: this.tuning.trail * ring * 0.016 });
    }
    this.#runner.moveTo(runnerX - 18, groundY - 63).lineTo(runnerX - 28 + legSwing, groundY)
      .stroke({ color: 0xdff8ff, width: 15, cap: "round" });
    this.#runner.moveTo(runnerX + 4, groundY - 62).lineTo(runnerX + 30 - legSwing, groundY)
      .stroke({ color: 0xb8eaff, width: 15, cap: "round" });
    this.#runner.moveTo(runnerX - 7, groundY - 128).lineTo(runnerX - 34 + armSwing, groundY - 70)
      .stroke({ color: 0xc9f2ff, width: 13, cap: "round" });
    this.#runner.moveTo(runnerX + 8, groundY - 124).lineTo(runnerX + 38 - armSwing, groundY - 78)
      .stroke({ color: 0x8fddff, width: 13, cap: "round" });
    this.#runner.roundRect(runnerX - 23, groundY - 143, 46, 84, 20)
      .fill({ color: 0xbdeeff, alpha: 0.95 });
    this.#runner.circle(runnerX + lean * 35, groundY - 170, 25)
      .fill(0xf0fbff);
    for (let trail = 1; trail <= 7; trail += 1) {
      this.#runner.moveTo(runnerX - 32 - trail * 14, groundY - 105 + trail * 2)
        .lineTo(runnerX - 90 - trail * 26 - speed * 3, groundY - 105 + trail * 2)
        .stroke({ color: 0x54c7ff, width: Math.max(1, 7 - trail), alpha: this.tuning.trail * (0.33 - trail * 0.035) });
    }
    this.#status.text = `R1 WORLD  ·  ${this.#performance.statics.terrain.source.toUpperCase()}  ·  ${worldX.toFixed(1)} / ${this.#performance.statics.worldLength.toFixed(1)} WU`;
    this.#backend.render();
  }

  destroy(): void {
    this.#background.destroy();
    this.#world.destroy();
    this.#runner.destroy();
    this.#title.destroy();
    this.#status.destroy();
  }
}
