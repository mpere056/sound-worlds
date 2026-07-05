import { evaluateTrajectory, sampleTerrain, type RunnerPerformance } from "@reaper-viz/compiler-runner";
import { sampleCurve } from "@reaper-viz/core";
import { PixiBackend, sampleCamera } from "@reaper-viz/render";
import { Graphics } from "pixi.js";

export type { RunnerPerformance } from "@reaper-viz/compiler-runner";

export interface RunnerTuning {
  terrainContrast: number;
  glow: number;
  trail: number;
  parallax: number;
}

const RUNNER_CORE_OFFSET = 96;

function colorNumber(value: string | undefined, fallback: number): number {
  return value?.startsWith("#") ? Number.parseInt(value.slice(1), 16) : fallback;
}

function mixColor(a: number, b: number, amount: number): number {
  const mix = (shift: number): number => {
    const av = (a >> shift) & 0xff;
    const bv = (b >> shift) & 0xff;
    return Math.round(av + (bv - av) * amount);
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

function glyphColor(performance: RunnerPerformance, role: string, colorIndex: number): number {
  const base = colorNumber(performance.palette.roles[role] ?? performance.palette.roles.lead, 0x70d9ff);
  const tint = (colorIndex % 12) / 11;
  return mixColor(base, tint < 0.5 ? 0xffffff : 0x7ed8ff, 0.12 + Math.abs(tint - 0.5) * 0.18);
}

function roleColor(performance: RunnerPerformance, roles: readonly string[], fallback: number): number {
  for (const role of roles) {
    const value = performance.palette.roles[role];
    if (value) return colorNumber(value, fallback);
  }
  return fallback;
}

function gaitPhase(stepTimes: readonly number[], t: number, speed: number): number {
  if (stepTimes.length < 2) return t * (1.6 + speed * 0.04);
  if (t <= stepTimes[0]!) {
    const interval = Math.max(0.2, stepTimes[1]! - stepTimes[0]!);
    return (t - stepTimes[0]!) / interval;
  }
  for (let index = 1; index < stepTimes.length; index += 1) {
    const next = stepTimes[index]!;
    if (t <= next) {
      const prev = stepTimes[index - 1]!;
      return index - 1 + (t - prev) / Math.max(0.2, next - prev);
    }
  }
  const last = stepTimes[stepTimes.length - 1]!;
  const prev = stepTimes[stepTimes.length - 2]!;
  return stepTimes.length - 1 + (t - last) / Math.max(0.2, last - prev);
}

export class RunnerScene {
  readonly #backend: PixiBackend;
  readonly #performance: RunnerPerformance;
  readonly #stepTimes: number[];
  readonly #background = new Graphics();
  readonly #worldGlow = new Graphics();
  readonly #world = new Graphics();
  readonly #runnerGlow = new Graphics();
  readonly #runner = new Graphics();
  readonly #glyphGlow = new Graphics();
  readonly #glyphs = new Graphics();
  readonly tuning: RunnerTuning = { terrainContrast: 0.8, glow: 0.74, trail: 0.72, parallax: 1 };

  constructor(backend: PixiBackend, performance: RunnerPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    this.#stepTimes = performance.events.filter((event) => event.type === "runner.step").map((event) => event.t);
    this.#worldGlow.blendMode = "add";
    this.#runnerGlow.blendMode = "add";
    this.#glyphGlow.blendMode = "add";
    backend.layer("runner-background").addChild(this.#background);
    backend.layer("runner-world").addChild(this.#worldGlow, this.#world);
    backend.layer("runner-character").addChild(this.#runnerGlow, this.#glyphGlow, this.#runner, this.#glyphs);
  }

  #screenY(worldY: number, cameraY: number, anchorY: number, scale: number): number {
    return anchorY - (worldY - cameraY) * scale * 0.56;
  }

  #drawTerrainLayer(
    graphics: Graphics,
    runnerX: number,
    cameraX: number,
    cameraY: number,
    baseline: number,
    scale: number,
    factor: number,
    offsetY: number,
    color: number,
    alpha: number,
  ): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    const leftWorld = cameraX * factor - (runnerX / scale + 4);
    const rightWorld = leftWorld + width / scale;
    const step = 0.5;
    graphics.moveTo(0, height);
    for (let x = leftWorld; x <= rightWorld + step; x += step) {
      const screenX = (x - leftWorld) * scale;
      const terrainHeight = sampleTerrain(this.#performance.statics.terrain, x);
      graphics.lineTo(screenX, this.#screenY(terrainHeight, cameraY, baseline + offsetY, scale));
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
    const pose = evaluateTrajectory(this.#performance.statics.trajectory.segments, t, xCurve, this.#performance.statics.terrain);
    const camera = sampleCamera(this.#performance.camera, t);
    const pulseZoom = this.#performance.events.reduce((zoom, event) => {
      if (!["jump.land", "ground.pulse"].includes(event.type)) return zoom;
      const age = t - event.t;
      return age >= 0 && age <= 0.5 ? zoom + 0.018 * Math.exp(-8 * age) : zoom;
    }, 0);
    const worldX = pose.x;
    const speed = sampleCurve(speedCurve, t);
    const energy = sampleCurve(energyCurve, t);
    const runnerX = width * 0.36;
    const baseline = height * 0.62;
    const scale = (width / 25) * Math.max(0.65, camera.zoom + pulseZoom);
    const cameraX = camera.pos[0];
    const cameraY = camera.pos[1];
    const bgColor = colorNumber(this.#performance.palette.bg, 0x07131f);
    const bassColor = roleColor(this.#performance, ["bass", "kick"], 0x1c456c);
    const leadColor = roleColor(this.#performance, ["lead", "keys", "vocals"], 0x70d9ff);
    const keysColor = roleColor(this.#performance, ["keys", "pads", "lead"], 0x9ecfff);
    const kickColor = roleColor(this.#performance, ["kick", "percussion"], 0x63d6ff);
    const snareColor = roleColor(this.#performance, ["snare", "clap", "percussion"], 0xf4fbff);
    const terrainColor = mixColor(bgColor, bassColor, 0.58);
    const surfaceColor = mixColor(leadColor, 0xffffff, 0.18);
    const runnerBody = mixColor(leadColor, 0xffffff, 0.66);
    const runnerShadow = mixColor(leadColor, bgColor, 0.24);
    const glow = this.tuning.glow * (0.72 + energy * 0.45);
    this.#background.clear();
    this.#worldGlow.clear();
    this.#world.clear();
    this.#runnerGlow.clear();
    this.#runner.clear();
    this.#glyphGlow.clear();
    this.#glyphs.clear();

    const bands = 18;
    for (let index = 0; index < bands; index += 1) {
      const bandMix = index / (bands - 1);
      const color = mixColor(bgColor, mixColor(leadColor, bassColor, 0.45), 0.1 + bandMix * 0.22 + energy * 0.08);
      this.#background.rect(0, index * height / bands, width, height / bands + 2).fill(color);
    }
    for (let index = 0; index < 65; index += 1) {
      const x = ((index * 239 + 73) % 1013) / 1013 * width;
      const y = ((index * 383 + 47) % 911) / 911 * height * 0.52;
      const drift = (worldX * (0.08 + (index % 5) * 0.018) * this.tuning.parallax) % width;
      this.#background.circle((x - drift + width) % width, y, 1.2 + index % 3)
        .fill({ color: mixColor(keysColor, 0xffffff, 0.28), alpha: 0.16 + energy * 0.26 });
    }
    this.#drawTerrainLayer(this.#background, runnerX, cameraX, cameraY, baseline, scale, 0.18 * this.tuning.parallax, -360, mixColor(bgColor, bassColor, 0.34), 0.46);
    this.#drawTerrainLayer(this.#background, runnerX, cameraX, cameraY, baseline, scale, 0.38 * this.tuning.parallax, -230, mixColor(bgColor, bassColor, 0.46), 0.62);
    this.#drawTerrainLayer(this.#background, runnerX, cameraX, cameraY, baseline, scale, 0.62 * this.tuning.parallax, -115, mixColor(bgColor, bassColor, 0.6), 0.78);

    const leftWorld = cameraX - (runnerX / scale + 4);
    const rightWorld = leftWorld + width / scale;
    const surface: Array<{ x: number; y: number }> = [];
    for (let x = leftWorld; x <= rightWorld + 0.25; x += 0.25) {
      surface.push({ x: (x - leftWorld) * scale, y: this.#screenY(sampleTerrain(this.#performance.statics.terrain, x), cameraY, baseline, scale) });
    }
    for (let stratum = 5; stratum >= 1; stratum -= 1) {
      this.#world.moveTo(0, height);
      for (const point of surface) {
        const ripple = Math.sin(point.x * 0.018 + stratum * 1.7) * (5 + stratum * 2);
        this.#world.lineTo(point.x, point.y + stratum * 48 + ripple);
      }
      this.#world.lineTo(width, height).closePath().fill({
        color: mixColor(bgColor, terrainColor, 0.14 + stratum * 0.08),
        alpha: 0.56 + stratum * 0.05 * this.tuning.terrainContrast,
      });
    }
    if (surface.length) {
      this.#worldGlow.moveTo(surface[0]!.x, surface[0]!.y);
      for (const point of surface.slice(1)) this.#worldGlow.lineTo(point.x, point.y);
      this.#worldGlow.stroke({ color: surfaceColor, width: 28, alpha: glow * 0.1, cap: "round", join: "round" });
      this.#worldGlow.moveTo(surface[0]!.x, surface[0]!.y);
      for (const point of surface.slice(1)) this.#worldGlow.lineTo(point.x, point.y);
      this.#worldGlow.stroke({ color: surfaceColor, width: 14, alpha: glow * 0.18, cap: "round", join: "round" });
      this.#world.moveTo(surface[0]!.x, surface[0]!.y);
      for (const point of surface.slice(1)) this.#world.lineTo(point.x, point.y);
      this.#world.stroke({ color: surfaceColor, width: 7, alpha: 0.64 + energy * 0.3 });
      this.#world.moveTo(surface[0]!.x, surface[0]!.y + 17);
      for (const point of surface.slice(1)) this.#world.lineTo(point.x, point.y + 17);
      this.#world.stroke({ color: mixColor(surfaceColor, bassColor, 0.48), width: 2, alpha: 0.8 });
    }
    for (let index = 0; index < 20; index += 1) {
      const length = 38 + (index % 6) * 24 + speed * 4;
      const y = 200 + ((index * 83) % 1180);
      const x = ((index * 167 - worldX * 68) % (width + 250) + width + 250) % (width + 250) - 100;
      this.#worldGlow.moveTo(x, y).lineTo(x - length, y)
        .stroke({ color: leadColor, width: 6 + energy * 5, alpha: glow * this.tuning.trail * 0.06, cap: "round" });
      this.#world.moveTo(x, y).lineTo(x - length, y)
        .stroke({ color: mixColor(leadColor, 0xffffff, 0.22), width: 2 + energy * 2, alpha: this.tuning.trail * (0.12 + energy * 0.25) });
    }

    for (const glyph of this.#performance.statics.glyphs) {
      const mergeAge = t - glyph.mergeT;
      const spawnX = (glyph.spawnPos.x - leftWorld) * scale;
      const spawnY = this.#screenY(glyph.spawnPos.y, cameraY, baseline, scale);
      const mergeX = (glyph.mergePos.x - leftWorld) * scale;
      const mergeY = this.#screenY(glyph.mergePos.y, cameraY, baseline, scale) - RUNNER_CORE_OFFSET;
      const color = glyphColor(this.#performance, glyph.role, glyph.colorIndex);
      if (glyph.mode === "beam" && t >= glyph.beamStartT && t <= glyph.mergeT) {
        const raw = (t - glyph.beamStartT) / Math.max(1e-6, glyph.mergeT - glyph.beamStartT);
        const progress = raw * raw * (3 - 2 * raw);
        const x = spawnX + (mergeX - spawnX) * progress;
        const y = spawnY + (mergeY - spawnY) * progress;
        this.#glyphGlow.moveTo(x, y).lineTo(mergeX, mergeY)
          .stroke({ color, width: 18, alpha: glow * (0.08 + progress * 0.2), cap: "round" });
        this.#glyphGlow.circle(x, y, 28 + 7 * Math.sin(progress * Math.PI)).fill({ color, alpha: glow * 0.12 });
        this.#glyphs.moveTo(x, y).lineTo(mergeX, mergeY)
          .stroke({ color, width: 5, alpha: 0.18 + progress * 0.55, cap: "round" });
        this.#glyphs.circle(x, y, 12 + 5 * Math.sin(progress * Math.PI)).fill({ color, alpha: 0.92 });
        this.#glyphs.circle(x, y, 23).stroke({ color, width: 3, alpha: 0.38 });
      }
      if (mergeAge >= 0 && mergeAge <= 0.42) {
        const alpha = 1 - mergeAge / 0.42;
        const radius = 16 + mergeAge * 105;
        this.#glyphGlow.circle(mergeX, mergeY, radius + 12).stroke({ color, width: 14 * alpha, alpha: glow * alpha * 0.28 });
        this.#glyphGlow.circle(mergeX, mergeY, Math.max(6, 22 * alpha)).fill({ color, alpha: glow * alpha * 0.18 });
        this.#glyphs.circle(mergeX, mergeY, radius).stroke({ color, width: 6 * alpha, alpha });
        this.#glyphs.circle(mergeX, mergeY, Math.max(2, 11 * alpha)).fill({ color, alpha });
      }
    }

    const groundY = this.#screenY(pose.y, cameraY, baseline, scale) - 8;
    const gait = gaitPhase(this.#stepTimes, t, speed);
    const legSwing = Math.sin(gait * Math.PI) * 24;
    const armSwing = -Math.sin(gait * Math.PI) * 19;
    const lean = pose.grounded
      ? Math.max(-0.28, Math.min(0.28, (sampleTerrain(this.#performance.statics.terrain, worldX + 0.2) - sampleTerrain(this.#performance.statics.terrain, worldX - 0.2)) * 0.5))
      : Math.max(-0.34, Math.min(0.34, pose.vy * 0.012));
    for (let ring = 4; ring >= 1; ring -= 1) {
      this.#runnerGlow.circle(runnerX, groundY - 94, 38 + ring * 20)
        .fill({ color: leadColor, alpha: glow * this.tuning.trail * ring * 0.026 });
    }
    const trailPoints: Array<{ x: number; y: number; alpha: number; radius: number }> = [];
    for (let trail = 24; trail >= 1; trail -= 1) {
      const trailT = Math.max(0, t - trail / 45);
      const trailPose = evaluateTrajectory(this.#performance.statics.trajectory.segments, trailT, xCurve, this.#performance.statics.terrain);
      const screenX = (trailPose.x - leftWorld) * scale;
      if (screenX < -80 || screenX > width + 80) continue;
      trailPoints.push({
        x: screenX,
        y: this.#screenY(trailPose.y, cameraY, baseline, scale) - RUNNER_CORE_OFFSET,
        alpha: this.tuning.trail * (0.04 + (24 - trail) / 24 * 0.26),
        radius: 3 + (24 - trail) / 24 * 11,
      });
    }
    if (trailPoints.length > 1) {
      this.#runnerGlow.moveTo(trailPoints[0]!.x, trailPoints[0]!.y);
      for (const point of trailPoints.slice(1)) this.#runnerGlow.lineTo(point.x, point.y);
      this.#runnerGlow.stroke({ color: leadColor, width: 24, alpha: glow * this.tuning.trail * 0.12, cap: "round", join: "round" });
      this.#runnerGlow.moveTo(trailPoints[0]!.x, trailPoints[0]!.y);
      for (const point of trailPoints.slice(1)) this.#runnerGlow.lineTo(point.x, point.y);
      this.#runnerGlow.stroke({ color: mixColor(leadColor, 0xffffff, 0.2), width: 13, alpha: glow * this.tuning.trail * 0.16, cap: "round", join: "round" });
      this.#runner.moveTo(trailPoints[0]!.x, trailPoints[0]!.y);
      for (const point of trailPoints.slice(1)) this.#runner.lineTo(point.x, point.y);
      this.#runner.stroke({ color: leadColor, width: 7, alpha: this.tuning.trail * 0.22, cap: "round", join: "round" });
      for (const point of trailPoints) this.#runner.circle(point.x, point.y, point.radius).fill({ color: mixColor(leadColor, 0xffffff, 0.3), alpha: point.alpha });
    }
    this.#runnerGlow.ellipse(runnerX, groundY - 94, 86 + energy * 18, 126 + energy * 26)
      .fill({ color: leadColor, alpha: glow * 0.07 });
    this.#runnerGlow.circle(runnerX + lean * 35, groundY - 170, 48)
      .fill({ color: runnerBody, alpha: glow * 0.13 });
    this.#runner.moveTo(runnerX - 18, groundY - 63).lineTo(runnerX - 28 + legSwing, groundY)
      .stroke({ color: mixColor(runnerBody, runnerShadow, 0.18), width: 15, cap: "round" });
    this.#runner.moveTo(runnerX + 4, groundY - 62).lineTo(runnerX + 30 - legSwing, groundY)
      .stroke({ color: mixColor(runnerBody, leadColor, 0.25), width: 15, cap: "round" });
    this.#runner.moveTo(runnerX - 7, groundY - 128).lineTo(runnerX - 34 + armSwing, groundY - 70)
      .stroke({ color: mixColor(runnerBody, 0xffffff, 0.12), width: 13, cap: "round" });
    this.#runner.moveTo(runnerX + 8, groundY - 124).lineTo(runnerX + 38 - armSwing, groundY - 78)
      .stroke({ color: mixColor(runnerBody, leadColor, 0.38), width: 13, cap: "round" });
    const stretch = pose.grounded ? 1 : 1 + Math.max(-0.12, Math.min(0.2, pose.vy * 0.008));
    this.#runner.roundRect(runnerX - 23, groundY - 143 - (stretch - 1) * 42, 46, 84 * stretch, 20)
      .fill({ color: runnerBody, alpha: 0.95 })
      .stroke({ color: runnerShadow, width: 3, alpha: 0.36 });
    this.#runner.circle(runnerX + lean * 35, groundY - 170, 25)
      .fill(mixColor(runnerBody, 0xffffff, 0.4));
    for (const event of this.#performance.events) {
      const age = t - event.t;
      if (age < 0 || age > 0.42 || !["jump.takeoff", "jump.land", "ground.pulse"].includes(event.type)) continue;
      const alpha = 1 - age / 0.42;
      const radius = 18 + age * 150;
      this.#runnerGlow.ellipse(runnerX, baseline, radius + 14, radius * 0.3)
        .stroke({ color: event.type === "jump.land" ? snareColor : kickColor, width: 18 * alpha, alpha: glow * alpha * 0.2 });
      this.#runner.ellipse(runnerX, baseline, radius, radius * 0.24)
        .stroke({ color: event.type === "jump.land" ? snareColor : kickColor, width: 6 * alpha, alpha });
    }
    this.#backend.render();
  }

  destroy(): void {
    this.#background.destroy();
    this.#worldGlow.destroy();
    this.#world.destroy();
    this.#runnerGlow.destroy();
    this.#runner.destroy();
    this.#glyphGlow.destroy();
    this.#glyphs.destroy();
  }
}
