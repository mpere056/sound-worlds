import type { MetroPerformance, MetroPoint } from "@reaper-viz/compiler-metro";
import { PixiBackend } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { MetroPerformance } from "@reaper-viz/compiler-metro";

export interface MetroTuning { lineWeight: number; gridOpacity: number; stationScale: number; }

function colorNumber(value: string): number { return Number.parseInt(value.slice(1), 16); }

function pointAt(points: MetroPoint[], progress: number): MetroPoint {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
  const target = lengths.reduce((sum, value) => sum + value, 0) * Math.max(0, Math.min(1, progress));
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    if (travelled + length >= target || index === lengths.length - 1) {
      const alpha = length > 0 ? (target - travelled) / length : 0;
      return {
        x: points[index]!.x + (points[index + 1]!.x - points[index]!.x) * alpha,
        y: points[index]!.y + (points[index + 1]!.y - points[index]!.y) * alpha,
      };
    }
    travelled += length;
  }
  return points[points.length - 1]!;
}

function partialPolyline(points: MetroPoint[], progress: number): MetroPoint[] {
  const end = pointAt(points, progress);
  if (progress >= 1) return points;
  const total = points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y), 0);
  const target = total * Math.max(0, progress);
  let travelled = 0;
  const result = [points[0]!];
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
    if (travelled + length >= target) { result.push(end); break; }
    result.push(points[index]!);
    travelled += length;
  }
  return result;
}

export class MetroScene {
  readonly #backend: PixiBackend;
  readonly #performance: MetroPerformance;
  readonly #background = new Graphics();
  readonly #map = new Graphics();
  readonly #motion = new Graphics();
  readonly #labels: Text[] = [];
  readonly tuning: MetroTuning = { lineWeight: 1, gridOpacity: 0.28, stationScale: 1 };

  constructor(backend: PixiBackend, performance: MetroPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    backend.layer("metro-background").addChild(this.#background);
    backend.layer("metro-map").addChild(this.#map);
    backend.layer("metro-motion").addChild(this.#motion);
    const title = new Text({
      text: "SOUND WORLDS / METRO",
      style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 38, fontWeight: "700", fill: 0xf5f0df, letterSpacing: 5 },
    });
    title.position.set(62, 56);
    const subtitle = new Text({
      text: "M2 LIVE NETWORK  /  TIME FLOWS SOUTH",
      style: { fontFamily: "ui-monospace, monospace", fontSize: 17, fill: 0x92a9bd, letterSpacing: 2 },
    });
    subtitle.position.set(65, 112);
    backend.layer("metro-labels").addChild(title, subtitle);
    this.#labels.push(title, subtitle);
    performance.statics.lines.forEach((line, index) => {
      const label = new Text({
        text: `${String(index + 1).padStart(2, "0")}  ${line.name.toUpperCase()}`,
        style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 18, fontWeight: "600", fill: colorNumber(line.color), letterSpacing: 1 },
      });
      label.position.set(65 + (index % 2) * 505, 1780 + Math.floor(index / 2) * 28);
      backend.layer("metro-labels").addChild(label);
      this.#labels.push(label);
    });
  }

  #transform(point: MetroPoint): MetroPoint {
    const bounds = this.#performance.statics.bounds;
    const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    const scale = Math.min(900 / sourceWidth, 1480 / sourceHeight);
    const offsetX = (this.#backend.width - sourceWidth * scale) / 2 - bounds.minX * scale;
    const offsetY = 220 - bounds.minY * scale;
    return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
  }

  renderFrame(t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    this.#background.clear();
    this.#map.clear();
    this.#motion.clear();
    this.#background.rect(0, 0, width, height).fill(0x07131f);
    this.#background.roundRect(34, 30, width - 68, height - 60, 28)
      .fill({ color: 0x0b1b29, alpha: 0.98 }).stroke({ color: 0x294357, width: 2 });
    for (let x = 75; x < width; x += 75) this.#background.moveTo(x, 170).lineTo(x, 1740).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity * 0.25 });
    for (let y = 220; y < 1740; y += 72) this.#background.moveTo(55, y).lineTo(width - 55, y).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity });

    const lineById = new Map(this.#performance.statics.lines.map((line) => [line.id, line]));
    for (const edge of this.#performance.statics.edges) {
      const line = lineById.get(edge.lineId);
      if (!line) continue;
      const revealDuration = edge.revealT - edge.revealStartT;
      const revealProgress = revealDuration <= 1e-6 ? (t >= edge.revealT ? 1 : 0) : Math.max(0, Math.min(1, (t - edge.revealStartT) / revealDuration));
      if (revealProgress <= 0) continue;
      const fullPoints = edge.poly.map((point) => this.#transform(point));
      const points = partialPolyline(fullPoints, revealProgress);
      this.#map.moveTo(points[0]!.x, points[0]!.y);
      for (const point of points.slice(1)) this.#map.lineTo(point.x, point.y);
      this.#map.stroke({ color: 0x06101a, width: 22 * this.tuning.lineWeight, cap: "round", join: "round" });
      this.#map.moveTo(points[0]!.x, points[0]!.y);
      for (const point of points.slice(1)) this.#map.lineTo(point.x, point.y);
      this.#map.stroke({ color: colorNumber(line.color), width: 13 * this.tuning.lineWeight, cap: "round", join: "round" });
      if (revealProgress < 1) {
        const head = points[points.length - 1]!;
        this.#motion.circle(head.x, head.y, 25).fill({ color: colorNumber(line.color), alpha: 0.12 });
        this.#motion.circle(head.x, head.y, 7).fill(0xf5f0df);
      }
    }
    for (const station of this.#performance.statics.stations) {
      if (station.revealT > t) continue;
      const point = this.#transform(station.pos);
      const scale = this.tuning.stationScale;
      if (station.kind === "interchange") {
        this.#map.circle(point.x, point.y, 18 * scale).fill(0xf5f0df).stroke({ color: 0x06101a, width: 6 });
        this.#map.circle(point.x, point.y, 7 * scale).fill(0x0b1b29);
      } else if (station.kind === "cluster" && station.span) {
        const a = this.#transform({ x: 90 + station.span[0] * 75, y: station.pos.y });
        const b = this.#transform({ x: 90 + station.span[1] * 75, y: station.pos.y });
        this.#map.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xf5f0df, width: 13 * scale, cap: "round" });
      } else {
        const line = lineById.get(station.lines[0]!);
        this.#map.circle(point.x, point.y, 9 * scale).fill(0xf5f0df)
          .stroke({ color: line ? colorNumber(line.color) : 0xffffff, width: 4 });
      }
      const lastHit = station.times.filter((hitT) => hitT <= t).at(-1);
      if (lastHit !== undefined && t - lastHit < 0.35) {
        const age = (t - lastHit) / 0.35;
        this.#motion.circle(point.x, point.y, (14 + age * 38) * scale)
          .stroke({ color: 0xf5f0df, width: 5 * (1 - age), alpha: 1 - age });
      }
    }

    const edgeById = new Map(this.#performance.statics.edges.map((edge) => [edge.id, edge]));
    const stationById = new Map(this.#performance.statics.stations.map((station) => [station.id, station]));
    for (const schedule of this.#performance.statics.trains) {
      const line = lineById.get(schedule.lineId);
      if (!line || !schedule.stops.length || t < schedule.stops[0]!.arriveT) continue;
      let stopIndex = 0;
      for (let index = 1; index < schedule.stops.length; index += 1) {
        if (schedule.stops[index]!.arriveT > t) break;
        stopIndex = index;
      }
      const stop = schedule.stops[stopIndex]!;
      const station = stationById.get(stop.stationId);
      if (!station) continue;
      let point = this.#transform(station.pos);
      if (stopIndex < schedule.stops.length - 1 && t > stop.departT && stop.edgeToNext) {
        const next = schedule.stops[stopIndex + 1]!;
        const edge = edgeById.get(stop.edgeToNext);
        if (edge) {
          const duration = Math.max(1e-6, next.arriveT - stop.departT);
          const raw = Math.max(0, Math.min(1, (t - stop.departT) / duration));
          const eased = stop.sprint ? raw : raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
          point = pointAt(edge.poly.map((source) => this.#transform(source)), eased);
          if (stop.sprint) this.#motion.moveTo(point.x - 38, point.y).lineTo(point.x, point.y)
            .stroke({ color: colorNumber(line.color), width: 8, alpha: 0.35, cap: "round" });
        }
      }
      this.#motion.roundRect(point.x - 18, point.y - 10, 36, 20, 9)
        .fill(0xf5f0df).stroke({ color: colorNumber(line.color), width: 5 });
      this.#motion.circle(point.x + 8, point.y, 3).fill(colorNumber(line.color));
    }
    this.#backend.render();
  }

  destroy(): void {
    this.#background.destroy();
    this.#map.destroy();
    this.#motion.destroy();
    this.#labels.forEach((label) => label.destroy());
  }
}
