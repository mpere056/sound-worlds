import type { PaintingPerformance, PaintingPoint, PaintingStroke } from "@reaper-viz/compiler-painting";
import { PixiBackend, sampleCamera } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { PaintingPerformance } from "@reaper-viz/compiler-painting";

export interface PaintingTuning { paperTexture: number; wetness: number; strokeScale: number; reveal: number; }

const LAYER_ORDER = ["sketch", "wash", "terrain", "subject", "rhythm", "texture", "glaze", "signature"];

function colorNumber(value: string): number { return Number.parseInt(value.slice(1), 16); }

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function partialPoints(points: PaintingPoint[], progress: number): PaintingPoint[] {
  if (points.length <= 1 || progress >= 1) return points;
  const keep = Math.max(2, Math.ceil(points.length * Math.max(0.02, progress)));
  return points.slice(0, keep);
}

export class PaintingScene {
  readonly #backend: PixiBackend;
  readonly #performance: PaintingPerformance;
  readonly #paper = new Graphics();
  readonly #paint = new Graphics();
  readonly #wet = new Graphics();
  readonly #signature: Text;
  readonly tuning: PaintingTuning = { paperTexture: 0.72, wetness: 0.82, strokeScale: 1, reveal: 1 };

  constructor(backend: PixiBackend, performance: PaintingPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    backend.layer("painting-paper").addChild(this.#paper);
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

  #transform(point: PaintingPoint, t: number): PaintingPoint {
    const camera = sampleCamera(this.#performance.camera, t);
    const scale = camera.zoom;
    const anchor = camera.anchor ?? [0.5, 0.5];
    return {
      x: (point.x - camera.pos[0]) * scale + this.#backend.width * anchor[0],
      y: (point.y - camera.pos[1]) * scale + this.#backend.height * anchor[1],
    };
  }

  #drawPath(graphics: Graphics, stroke: PaintingStroke, points: PaintingPoint[], t: number, alpha: number, widthScale: number): void {
    if (points.length < 2) return;
    const transformed = points.map((point) => this.#transform(point, t));
    graphics.moveTo(transformed[0]!.x, transformed[0]!.y);
    for (const point of transformed.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.stroke({
      color: colorNumber(stroke.color),
      width: Math.max(0.8, stroke.width * widthScale * this.tuning.strokeScale),
      alpha,
      cap: "round",
      join: "round",
    });
  }

  #drawStroke(stroke: PaintingStroke, t: number): void {
    const age = t - stroke.t;
    if (age < 0) return;
    const revealProgress = stroke.tEnd <= stroke.t ? 1 : Math.min(1, age / Math.max(0.001, stroke.tEnd - stroke.t));
    const alpha = stroke.alpha * Math.min(1, age / 0.18) * this.tuning.reveal;
    const points = partialPoints(stroke.points, revealProgress);
    if (stroke.kind === "wash" || stroke.kind === "glaze") {
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.38, 1.18);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.22, 0.62);
      return;
    }
    if (stroke.kind === "guide") {
      this.#drawPath(this.#paint, stroke, points, t, alpha, 1);
      return;
    }
    if (stroke.kind === "terrain") {
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.35, 2.15);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.82, 1);
      this.#drawPath(this.#wet, stroke, points, t, alpha * 0.18 * this.tuning.wetness, 0.42);
      return;
    }
    if (stroke.kind === "ribbon") {
      this.#drawPath(this.#wet, stroke, points, t, alpha * 0.22 * this.tuning.wetness, 2.8);
      this.#drawPath(this.#paint, stroke, points, t, alpha * 0.72, 1);
      this.#drawPath(this.#wet, { ...stroke, color: "#fff8e8" }, points, t, alpha * 0.26, 0.28);
      return;
    }
    if (stroke.kind === "dab" || stroke.kind === "splatter" || stroke.kind === "stipple") {
      const point = this.#transform(stroke.points[0]!, t);
      const radius = (stroke.radius ?? stroke.width) * (0.45 + 0.55 * revealProgress) * this.tuning.strokeScale;
      this.#paint.circle(point.x, point.y, radius).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.62 });
      this.#paint.circle(point.x + radius * 0.12, point.y - radius * 0.16, radius * 0.58).fill({ color: colorNumber(stroke.color), alpha: alpha * 0.34 });
      if (stroke.kind === "splatter") {
        for (let index = 0; index < 7; index += 1) {
          const angle = (stroke.rotation ?? 0) + index * 2.399;
          const dist = radius * (0.9 + index * 0.21);
          this.#wet.circle(point.x + Math.cos(angle) * dist, point.y + Math.sin(angle) * dist, Math.max(1.5, radius * 0.11))
            .fill({ color: colorNumber(stroke.color), alpha: alpha * 0.38 });
        }
      }
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
    this.#paint.clear();
    this.#wet.clear();
    this.#paper.rect(0, 0, width, height).fill(0xf1eadc);
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
      const point = this.#transform(sig.pos, t);
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
    this.#paint.destroy();
    this.#wet.destroy();
    this.#signature.destroy();
  }
}
