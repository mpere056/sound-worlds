import type { MetroPerformance, MetroPoint } from "@reaper-viz/compiler-metro";
import { PixiBackend, sampleCamera } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { MetroPerformance } from "@reaper-viz/compiler-metro";

export interface MetroTuning { lineWeight: number; gridOpacity: number; stationScale: number; }

function colorNumber(value: string): number { return Number.parseInt(value.slice(1), 16); }

interface PolylineMetrics { points: MetroPoint[]; cumulative: number[]; total: number; }

function buildPolylineMetrics(points: MetroPoint[]): PolylineMetrics {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push((cumulative[index - 1] ?? 0) + Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y));
  }
  return { points, cumulative, total: cumulative.at(-1) ?? 0 };
}

function pointAt(polyline: PolylineMetrics, progress: number): MetroPoint {
  if (polyline.points.length < 2 || polyline.total <= 0) return polyline.points[0] ?? { x: 0, y: 0 };
  const target = polyline.total * Math.max(0, Math.min(1, progress));
  for (let index = 1; index < polyline.points.length; index += 1) {
    const startDistance = polyline.cumulative[index - 1] ?? 0;
    const endDistance = polyline.cumulative[index] ?? startDistance;
    if (endDistance >= target || index === polyline.points.length - 1) {
      const length = endDistance - startDistance;
      const alpha = length > 0 ? (target - startDistance) / length : 0;
      return {
        x: polyline.points[index - 1]!.x + (polyline.points[index]!.x - polyline.points[index - 1]!.x) * alpha,
        y: polyline.points[index - 1]!.y + (polyline.points[index]!.y - polyline.points[index - 1]!.y) * alpha,
      };
    }
  }
  return polyline.points.at(-1) ?? { x: 0, y: 0 };
}

function partialPolyline(polyline: PolylineMetrics, progress: number): MetroPoint[] {
  if (progress >= 1) return polyline.points;
  if (polyline.points.length < 2) return polyline.points;
  const target = polyline.total * Math.max(0, progress);
  const result = [polyline.points[0]!];
  for (let index = 1; index < polyline.points.length; index += 1) {
    const endDistance = polyline.cumulative[index] ?? 0;
    if (endDistance >= target) { result.push(pointAt(polyline, progress)); break; }
    result.push(polyline.points[index]!);
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
  readonly #stationLabels: Array<{ stationId: string; text: Text }> = [];
  readonly #lineById: Map<string, MetroPerformance["statics"]["lines"][number]>;
  readonly #stationById: Map<string, MetroPerformance["statics"]["stations"][number]>;
  readonly #edgeById: Map<string, MetroPerformance["statics"]["edges"][number]>;
  readonly #edgePolylines: Map<string, PolylineMetrics>;
  readonly tuning: MetroTuning = { lineWeight: 1, gridOpacity: 0.28, stationScale: 1 };

  constructor(backend: PixiBackend, performance: MetroPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    this.#lineById = new Map(performance.statics.lines.map((line) => [line.id, line]));
    this.#stationById = new Map(performance.statics.stations.map((station) => [station.id, station]));
    this.#edgeById = new Map(performance.statics.edges.map((edge) => [edge.id, edge]));
    this.#edgePolylines = new Map(performance.statics.edges.map((edge) => [edge.id, buildPolylineMetrics(edge.poly)]));
    backend.layer("metro-background").addChild(this.#background);
    backend.layer("metro-map").addChild(this.#map);
    backend.layer("metro-motion").addChild(this.#motion);
    performance.statics.lines.forEach((line, index) => {
      const label = new Text({
        text: `${String(index + 1).padStart(2, "0")}  ${line.name.toUpperCase()}`,
        style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 18, fontWeight: "600", fill: colorNumber(line.color), letterSpacing: 1 },
      });
      label.position.set(65 + (index % 2) * 505, 1780 + Math.floor(index / 2) * 28);
      backend.layer("metro-labels").addChild(label);
      this.#labels.push(label);
    });
    performance.statics.stations.forEach((station) => {
      if (!station.label) return;
      const label = new Text({
        text: station.label.text,
        style: { fontFamily: "Inter, Arial, sans-serif", fontSize: station.label.tier === 0 ? 16 : 13, fontWeight: "600", fill: 0xdce8ed, letterSpacing: 1 },
      });
      backend.layer("metro-station-labels").addChild(label);
      this.#stationLabels.push({ stationId: station.id, text: label });
      this.#labels.push(label);
    });
  }

  #transform(point: MetroPoint, t: number): MetroPoint {
    const bounds = this.#performance.statics.bounds;
    const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    const fullScale = Math.min(900 / sourceWidth, 1480 / sourceHeight);
    const camera = sampleCamera(this.#performance.camera, t);
    const scale = fullScale * camera.zoom;
    const anchor = camera.anchor ?? [0.5, 0.5];
    const offsetX = this.#backend.width / 2 - camera.pos[0] * scale;
    const offsetY = this.#backend.height * anchor[1] - camera.pos[1] * scale;
    return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
  }

  renderFrame(t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    this.#background.clear();
    this.#map.clear();
    this.#motion.clear();
    this.#background.rect(0, 0, width, height).fill(colorNumber(this.#performance.palette.bg));
    const bands = 24;
    for (let index = 0; index < bands; index += 1) {
      const mix = index / (bands - 1);
      const color = ((6 + Math.round(10 * mix)) << 16)
        | ((15 + Math.round(20 * mix)) << 8)
        | (28 + Math.round(32 * mix));
      this.#background.rect(0, index * height / bands, width, height / bands + 1).fill({ color, alpha: 0.72 });
    }
    for (let x = 75; x < width; x += 75) this.#background.moveTo(x, 90).lineTo(x, height - 90).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity * 0.14 });
    for (let y = 138; y < height - 110; y += 72) this.#background.moveTo(55, y).lineTo(width - 55, y).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity * 0.42 });

    for (const edge of this.#performance.statics.edges) {
      const line = this.#lineById.get(edge.lineId);
      const polyline = this.#edgePolylines.get(edge.id);
      if (!line || !polyline) continue;
      const revealDuration = edge.revealT - edge.revealStartT;
      const revealProgress = revealDuration <= 1e-6 ? (t >= edge.revealT ? 1 : 0) : Math.max(0, Math.min(1, (t - edge.revealStartT) / revealDuration));
      if (revealProgress <= 0) continue;
      const points = partialPolyline(polyline, revealProgress).map((point) => this.#transform(point, t));
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
      const point = this.#transform(station.pos, t);
      const scale = this.tuning.stationScale;
      if (station.kind === "interchange") {
        const ringRadius = (18 + (station.lines.length - 1) * 3.5) * scale;
        this.#map.circle(point.x, point.y, ringRadius).fill(0xf5f0df).stroke({ color: 0x06101a, width: 6 });
        this.#map.circle(point.x, point.y, Math.max(7, ringRadius - 12 * scale)).fill(0x0b1b29);
      } else if (station.kind === "cluster" && station.spanPos) {
        const a = this.#transform(station.spanPos[0], t);
        const b = this.#transform(station.spanPos[1], t);
        this.#map.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: 0xf5f0df, width: 13 * scale, cap: "round" });
      } else {
        const line = this.#lineById.get(station.lines[0]!);
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

    for (const schedule of this.#performance.statics.trains) {
      const line = this.#lineById.get(schedule.lineId);
      if (!line || !schedule.stops.length || t < schedule.stops[0]!.arriveT) continue;
      let stopIndex = 0;
      for (let index = 1; index < schedule.stops.length; index += 1) {
        if (schedule.stops[index]!.arriveT > t) break;
        stopIndex = index;
      }
      const stop = schedule.stops[stopIndex]!;
      const station = this.#stationById.get(stop.stationId);
      if (!station) continue;
      let point = this.#transform(station.pos, t);
      if (stopIndex < schedule.stops.length - 1 && t > stop.departT && stop.edgeToNext) {
        const next = schedule.stops[stopIndex + 1]!;
        const edge = this.#edgeById.get(stop.edgeToNext);
        const polyline = this.#edgePolylines.get(stop.edgeToNext);
        if (edge && polyline) {
          const duration = Math.max(1e-6, next.arriveT - stop.departT);
          const raw = Math.max(0, Math.min(1, (t - stop.departT) / duration));
          const eased = stop.sprint ? raw : raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
          point = this.#transform(pointAt(polyline, eased), t);
          if (stop.sprint) this.#motion.moveTo(point.x - 38, point.y).lineTo(point.x, point.y)
            .stroke({ color: colorNumber(line.color), width: 8, alpha: 0.35, cap: "round" });
        }
      }
      this.#motion.roundRect(point.x - 18, point.y - 10, 36, 20, 9)
        .fill(0xf5f0df).stroke({ color: colorNumber(line.color), width: 5 });
      this.#motion.circle(point.x + 8, point.y, 3).fill(colorNumber(line.color));
    }
    for (const entry of this.#stationLabels) {
      const station = this.#stationById.get(entry.stationId);
      if (!station?.label) { entry.text.visible = false; continue; }
      const camera = sampleCamera(this.#performance.camera, t);
      entry.text.visible = station.revealT <= t && (station.label.tier === 0 || camera.zoom >= 1.3);
      if (!entry.text.visible) continue;
      const point = this.#transform(station.pos, t);
      const left = station.label.side === "L";
      entry.text.anchor.set(left ? 1 : 0, 0.5);
      entry.text.position.set(Math.max(65, Math.min(this.#backend.width - 65, point.x + (left ? -18 : 18))), point.y);
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
