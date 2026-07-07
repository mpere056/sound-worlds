import type { PaintingPerformance, PaintingPoint, PaintingStroke } from "@reaper-viz/compiler-painting";
import { PixiBackend, sampleCamera } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { PaintingPerformance } from "@reaper-viz/compiler-painting";

export interface PaintingTuning { paperTexture: number; wetness: number; strokeScale: number; reveal: number; }

const LAYER_ORDER = ["sketch", "wash", "terrain", "subject", "rhythm", "texture", "glaze", "signature"];

interface ProjectedPoint { x: number; y: number; z: number; scale: number; }

function colorNumber(value: string): number { return Number.parseInt(value.slice(1), 16); }

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }

function partialPoints(points: PaintingPoint[], progress: number): PaintingPoint[] {
  if (points.length <= 1 || progress >= 1) return points;
  const keep = Math.max(2, Math.ceil(points.length * Math.max(0.02, progress)));
  return points.slice(0, keep);
}

export class PaintingScene {
  readonly #backend: PixiBackend;
  readonly #performance: PaintingPerformance;
  readonly #paper = new Graphics();
  readonly #shadow = new Graphics();
  readonly #paint = new Graphics();
  readonly #wet = new Graphics();
  readonly #signature: Text;
  readonly tuning: PaintingTuning = { paperTexture: 0.72, wetness: 0.82, strokeScale: 1, reveal: 1 };

  constructor(backend: PixiBackend, performance: PaintingPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    backend.layer("painting-paper").addChild(this.#paper);
    backend.layer("painting-shadow").addChild(this.#shadow);
    backend.layer("painting-paint").addChild(this.#paint);
    backend.layer("painting-wet").addChild(this.#wet);
    this.#signature = new Text({
      text: performance.statics.signature.text.toUpperCase(),
      style: {
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: 26,
        fontStyle: "italic",
        fill: 0x26323b,
        letterSpacing: 2,
      },
    });
    this.#signature.anchor.set(0, 0.5);
    backend.layer("painting-signature").addChild(this.#signature);
  }

  #project(point: PaintingPoint, t: number): ProjectedPoint {
    const camera = sampleCamera(this.#performance.camera, t);
    const z = point.z ?? 0;
    const depthScale = clamp(1 + z / 920, 0.68, 1.34);
    const scale = camera.zoom * depthScale;
    const anchor = camera.anchor ?? [0.5, 0.5];
    const yDepthLift = -z * 0.18;
    return {
      x: (point.x - camera.pos[0]) * scale + this.#backend.width * anchor[0],
      y: (point.y + yDepthLift - camera.pos[1]) * scale + this.#backend.height * anchor[1],
      z,
      scale,
    };
  }

  #drawPathShadow(stroke: PaintingStroke, points: PaintingPoint[], t: number, alpha: number, widthScale: number): void {
    if (points.length < 2) return;
    const projected = points.map((point) => this.#project(point, t));
    const avgZ = projected.reduce((sum, point) => sum + point.z, 0) / projected.length;
    const avgScale = projected.reduce((sum, point) => sum + point.scale, 0) / projected.length;
    const offset = clamp(14 + avgZ * 0.035, 5, 28);
    this.#shadow.moveTo(projected[0]!.x + offset, projected[0]!.y + offset * 0.62);
    for (const point of projected.slice(1)) this.#shadow.lineTo(point.x + offset, point.y + offset * 0.62);
    this.#shadow.stroke({
      color: 0x253525,
      width: Math.max(2, stroke.width * widthScale * this.tuning.strokeScale * avgScale),
      alpha: alpha * clamp(0.1 + (avgZ + 320) / 1200, 0.08, 0.26),
      cap: "round",
      join: "round",
    });
  }

  #drawPath(graphics: Graphics, stroke: PaintingStroke, points: PaintingPoint[], t: number, alpha: number, widthScale: number): void {
    if (points.length < 2) return;
    const projected = points.map((point) => this.#project(point, t));
    const avgScale = projected.reduce((sum, point) => sum + point.scale, 0) / projected.length;
    graphics.moveTo(projected[0]!.x, projected[0]!.y);
    for (const point of projected.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.stroke({
      color: colorNumber(stroke.color),
      width: Math.max(0.8, stroke.width * widthScale * this.tuning.strokeScale * avgScale),
      alpha,
      cap: "round",
      join: "round",
    });
  }

  #fillPolygon(stroke: PaintingStroke, points: PaintingPoint[], t: number, alpha: number): void {
    if (points.length < 3) return;
    const projected = points.map((point) => this.#project(point, t));
    const avgZ = projected.reduce((sum, point) => sum + point.z, 0) / projected.length;
    const shadowOffset = clamp(18 + avgZ * 0.035, 7, 34);
    this.#shadow.moveTo(projected[0]!.x + shadowOffset, projected[0]!.y + shadowOffset * 0.58);
    for (const point of projected.slice(1)) this.#shadow.lineTo(point.x + shadowOffset, point.y + shadowOffset * 0.58);
    this.#shadow.closePath().fill({ color: 0x263426, alpha: alpha * 0.12 });

    this.#paint.moveTo(projected[0]!.x, projected[0]!.y);
    for (const point of projected.slice(1)) this.#paint.lineTo(point.x, point.y);
    this.#paint.closePath().fill({ color: colorNumber(stroke.color), alpha });
    this.#drawPath(this.#wet, { ...stroke, color: "#fff8e8" }, points, t, alpha * 0.22 * this.tuning.wetness, 0.08);
    this.#drawPath(this.#paint, stroke, points, t, alpha * 0.68, 0.11);
  }

  #sourceCenter(): PaintingPoint {
    return { x: this.#performance.resolution.w * 0.5, y: this.#performance.resolution.h * 0.48, z: 0 };
  }

  #radialCopies(point: PaintingPoint, copies: number): PaintingPoint[] {
    const center = this.#sourceCenter();
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.hypot(dx, dy);
    const baseAngle = Math.atan2(dy, dx);
    return Array.from({ length: copies }, (_, index) => {
      const angle = baseAngle + index / copies * Math.PI * 2;
      const fold = 1 + Math.pow(distance / Math.max(1, this.#performance.resolution.w * 0.5), 2) * 0.22;
      const copy: PaintingPoint = {
        x: center.x + Math.cos(angle) * distance * fold,
        y: center.y + Math.sin(angle) * distance * fold,
      };
      if (point.z !== undefined) copy.z = point.z;
      return copy;
    });
  }

  #drawCymaticRing(point: ProjectedPoint, stroke: PaintingStroke, radius: number, alpha: number, widthScale: number, phase: number): void {
    const lobes = Math.max(6, Math.round(stroke.symmetry ?? 10));
    const steps = lobes * 12;
    const modulation = 0.028 + Math.min(0.08, stroke.roughness * 0.045);
    for (let band = 0; band < 2; band += 1) {
      const bandRadius = radius * (1 + band * 0.09);
      for (let index = 0; index <= steps; index += 1) {
        const angle = index / steps * Math.PI * 2;
        const pulse = 1 + Math.sin(angle * lobes + phase + band * 0.7) * modulation;
        const x = point.x + Math.cos(angle) * bandRadius * pulse;
        const y = point.y + Math.sin(angle) * bandRadius * pulse * 0.88;
        if (index === 0) this.#paint.moveTo(x, y);
        else this.#paint.lineTo(x, y);
      }
      this.#paint.stroke({
        color: colorNumber(stroke.color),
        width: Math.max(0.8, stroke.width * widthScale * point.scale * (band === 0 ? 1 : 0.34)),
        alpha: alpha * (band === 0 ? 1 : 0.36),
        cap: "round",
        join: "round",
      });
    }
  }

  #drawWashField(stroke: PaintingStroke, t: number, alpha: number, revealProgress: number, age: number): void {
    const point = this.#project(stroke.points[0] ?? this.#sourceCenter(), t);
    const radius = (stroke.radius ?? stroke.width * 4) * point.scale * (0.42 + 0.58 * revealProgress);
    const stain = stroke.stain ?? 0.42;
    const wetLife = clamp(1 - age / 5.5, 0, 1);
    this.#paint.circle(point.x, point.y, radius).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.13 * stain });
    this.#paint.circle(point.x, point.y, radius * 0.42).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.08 * stain });
    this.#wet.circle(point.x, point.y, radius * (0.66 + age * 0.018)).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.1 * wetLife * this.tuning.wetness });
    this.#wet.circle(point.x, point.y, radius * 0.34).fill({ color: 0xffffff, alpha: alpha * 0.024 * wetLife });
  }

  #drawRing(stroke: PaintingStroke, t: number, alpha: number, revealProgress: number, age: number): void {
    const point = this.#project(stroke.points[0] ?? this.#sourceCenter(), t);
    const radius = (stroke.radius ?? stroke.width * 8) * point.scale * (0.2 + 0.8 * revealProgress);
    const width = Math.max(1, stroke.width * this.tuning.strokeScale * point.scale);
    const stain = stroke.stain ?? 0.58;
    const wetLife = clamp(1 - age / 2.8, 0, 1);
    this.#shadow.circle(point.x + 10, point.y + 7, radius).stroke({ color: 0x253525, width: width * 1.2, alpha: alpha * 0.08 * stain });
    this.#paint.circle(point.x, point.y, radius * 0.98).stroke({ color: colorNumber(stroke.color), width: width * 0.52, alpha: alpha * 0.48 * stain });
    this.#paint.circle(point.x, point.y, radius * 0.82).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.026 * stain });
    this.#drawCymaticRing(point, stroke, radius, alpha * 0.5 * stain, 0.45, age * 1.7 + (stroke.rotation ?? 0));
    if (wetLife > 0) {
      this.#wet.circle(point.x, point.y, radius * (0.92 + age * 0.12)).stroke({
        color: 0xffffff,
        width: Math.max(0.7, width * 0.18),
        alpha: alpha * 0.22 * wetLife * this.tuning.wetness,
      });
    }
  }

  #drawBloom(stroke: PaintingStroke, t: number, alpha: number, revealProgress: number, age: number): void {
    const copies = Math.max(4, Math.round(stroke.symmetry ?? (stroke.kind === "stipple" ? 12 : stroke.kind === "splatter" ? 10 : 8)));
    const source = stroke.points[0] ?? this.#sourceCenter();
    const radius = (stroke.radius ?? stroke.width) * (0.35 + 0.65 * revealProgress) * this.tuning.strokeScale;
    const ringAlpha = alpha * (stroke.kind === "bloom" ? 0.2 : 0.28);
    const stain = stroke.stain ?? 0.62;
    const wetLife = clamp(1 - age / 3.6, 0, 1);
    for (const [index, copy] of this.#radialCopies(source, copies).entries()) {
      const point = this.#project(copy, t);
      const localRadius = radius * point.scale * (index % 2 === 0 ? 1 : 0.72);
      const shadowOffset = clamp(8 + point.z * 0.03, 4, 22);
      this.#shadow.ellipse(point.x + shadowOffset, point.y + shadowOffset * 0.56, localRadius * 0.96, localRadius * 0.46)
        .fill({ color: 0x253525, alpha: alpha * 0.07 * stain });
      this.#paint.circle(point.x, point.y, localRadius * (1 + Math.min(age, 4) * 0.035)).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.23 * stain });
      this.#paint.circle(point.x - localRadius * 0.16, point.y - localRadius * 0.18, localRadius * 0.52)
        .fill({ color: colorNumber(stroke.color), alpha: alpha * 0.16 * stain });
      for (let satellite = 0; satellite < 3; satellite += 1) {
        const satAngle = (stroke.rotation ?? 0) + index * 0.74 + satellite * 2.094;
        const satDist = localRadius * (1.25 + satellite * 0.52);
        const satRadius = localRadius * (0.18 - satellite * 0.035);
        this.#paint.circle(point.x + Math.cos(satAngle) * satDist, point.y + Math.sin(satAngle) * satDist, Math.max(1.2, satRadius))
          .fill({ color: colorNumber(stroke.color), alpha: alpha * 0.11 * stain });
      }
      this.#wet.circle(point.x, point.y, localRadius * 1.82).stroke({
        color: colorNumber(stroke.color),
        width: Math.max(0.8, stroke.width * 0.16 * point.scale),
        alpha: ringAlpha * (0.38 + wetLife * 0.62),
      });
      if (stroke.kind === "splatter") {
        for (let dot = 0; dot < 3; dot += 1) {
          const angle = (stroke.rotation ?? 0) + dot * 2.094 + index * 0.31;
          const distance = localRadius * (1.25 + dot * 0.38);
          this.#wet.circle(point.x + Math.cos(angle) * distance, point.y + Math.sin(angle) * distance, Math.max(1.4, localRadius * 0.09))
            .fill({ color: colorNumber(stroke.color), alpha: alpha * (0.08 * stain + 0.18 * wetLife) });
        }
      }
    }
  }

  #drawStroke(stroke: PaintingStroke, t: number): void {
    const age = t - stroke.t;
    if (age < 0) return;
    const revealProgress = stroke.tEnd <= stroke.t ? 1 : Math.min(1, age / Math.max(0.001, stroke.tEnd - stroke.t));
    const alpha = stroke.alpha * Math.min(1, age / 0.18) * this.tuning.reveal;
    const points = partialPoints(stroke.points, revealProgress);
    if (stroke.kind === "ring") {
      this.#drawRing(stroke, t, alpha, revealProgress, age);
      return;
    }
    if (stroke.kind === "bloom") {
      this.#drawBloom(stroke, t, alpha, revealProgress, age);
      return;
    }
    if (stroke.kind === "wash" || stroke.kind === "glaze") {
      if (points.length <= 1) {
        this.#drawWashField(stroke, t, alpha, revealProgress, age);
        return;
      }
      if (points.length >= 3 && revealProgress >= 0.6) {
        this.#fillPolygon(stroke, points, t, alpha * (stroke.kind === "glaze" ? 0.32 : 0.42));
      } else {
        this.#drawPathShadow(stroke, points, t, alpha * 0.25, 0.8);
        this.#drawPath(this.#paint, stroke, points, t, alpha * 0.38, 1.18);
        this.#drawPath(this.#paint, stroke, points, t, alpha * 0.22, 0.62);
      }
      return;
    }
    if (stroke.kind === "guide") {
      this.#drawPath(this.#paint, stroke, points, t, alpha, 1);
      return;
    }
    if (stroke.kind === "terrain") {
      this.#drawPathShadow(stroke, points, t, alpha, 1.65);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.35, 2.15);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.82, 1);
      this.#drawPath(this.#wet, stroke, points, t, alpha * 0.18 * this.tuning.wetness, 0.42);
      return;
    }
    if (stroke.kind === "ribbon") {
      this.#drawPathShadow(stroke, points, t, alpha, 1.55);
      this.#drawPath(this.#wet, stroke, points, t, alpha * 0.22 * this.tuning.wetness, 2.8);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.72, 1);
      this.#drawPath(this.#wet, { ...stroke, color: "#fff8e8" }, points, t, alpha * 0.26, 0.28);
      return;
    }
    if (stroke.kind === "dab" || stroke.kind === "splatter" || stroke.kind === "stipple") {
      this.#drawBloom(stroke, t, alpha, revealProgress, age);
      return;
    }
  }

  auditFrame(t: number): string[] {
    const painted = this.#performance.statics.strokes.filter((stroke) => stroke.t <= t).length;
    const next = this.#performance.statics.strokes.find((stroke) => stroke.t > t);
    return [
      "PAINTING AUDIT",
      `${painted}/${this.#performance.statics.strokes.length} marks painted`,
      next ? `NEXT ${next.kind} · ${next.role} · ${next.t.toFixed(3)}s` : "FINAL CANVAS",
    ];
  }

  renderFrame(t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    this.#paper.clear();
    this.#shadow.clear();
    this.#paint.clear();
    this.#wet.clear();
    this.#paper.rect(0, 0, width, height).fill(0xf1eadc);
    this.#paper.poly([0, 0, width, 0, width, height, 0, height]).fill({ color: 0xd8dfc2, alpha: 0.18 });
    this.#paper.rect(34, 34, width - 68, height - 68).stroke({ color: 0xc8bda9, width: 2, alpha: 0.38 });
    for (const grain of this.#performance.statics.grain) {
      const alpha = grain.alpha * this.tuning.paperTexture;
      this.#paper.circle(grain.x, grain.y, grain.radius).fill({ color: 0x4f4338, alpha });
    }
    const sorted = [...this.#performance.statics.strokes].sort((a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer) || a.t - b.t);
    for (const stroke of sorted) this.#drawStroke(stroke, t);
    const sig = this.#performance.statics.signature;
    const sigAge = t - sig.t;
    this.#signature.visible = sigAge >= 0;
    if (this.#signature.visible) {
      const point = this.#project(sig.pos, t);
      this.#signature.alpha = Math.min(0.86, sigAge / 0.7);
      this.#signature.position.set(point.x, point.y);
      this.#signature.scale.set(1 + Math.max(0, 1 - sigAge / 0.6) * 0.08);
    }
    const varnishAge = t - Math.max(0, this.#performance.durationSec - 0.8);
    if (varnishAge > 0) {
      const sweep = Math.min(1, varnishAge / 0.8);
      const y = lerp(-220, height + 120, sweep);
      this.#wet.rect(0, y, width, 140).fill({ color: 0xffffff, alpha: 0.055 * (1 - Math.abs(sweep - 0.5)) });
    }
    this.#backend.render();
  }

  destroy(): void {
    this.#paper.destroy();
    this.#shadow.destroy();
    this.#paint.destroy();
    this.#wet.destroy();
    this.#signature.destroy();
  }
}
