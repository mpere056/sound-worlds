import type { MetroPerformance, MetroPoint } from "@reaper-viz/compiler-metro";
import { PixiBackend } from "@reaper-viz/render";
import { Graphics, Text } from "pixi.js";

export type { MetroPerformance } from "@reaper-viz/compiler-metro";

export interface MetroTuning { lineWeight: number; gridOpacity: number; stationScale: number; }

function colorNumber(value: string): number { return Number.parseInt(value.slice(1), 16); }

export class MetroScene {
  readonly #backend: PixiBackend;
  readonly #performance: MetroPerformance;
  readonly #background = new Graphics();
  readonly #map = new Graphics();
  readonly #labels: Text[] = [];
  readonly tuning: MetroTuning = { lineWeight: 1, gridOpacity: 0.28, stationScale: 1 };

  constructor(backend: PixiBackend, performance: MetroPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    backend.layer("metro-background").addChild(this.#background);
    backend.layer("metro-map").addChild(this.#map);
    const title = new Text({
      text: "SOUND WORLDS / METRO",
      style: { fontFamily: "Inter, Arial, sans-serif", fontSize: 38, fontWeight: "700", fill: 0xf5f0df, letterSpacing: 5 },
    });
    title.position.set(62, 56);
    const subtitle = new Text({
      text: "M1 STATIC NETWORK  /  TIME FLOWS SOUTH",
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

  renderFrame(_t: number): void {
    const width = this.#backend.width;
    const height = this.#backend.height;
    this.#background.clear();
    this.#map.clear();
    this.#background.rect(0, 0, width, height).fill(0x07131f);
    this.#background.roundRect(34, 30, width - 68, height - 60, 28)
      .fill({ color: 0x0b1b29, alpha: 0.98 }).stroke({ color: 0x294357, width: 2 });
    for (let x = 75; x < width; x += 75) this.#background.moveTo(x, 170).lineTo(x, 1740).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity * 0.25 });
    for (let y = 220; y < 1740; y += 72) this.#background.moveTo(55, y).lineTo(width - 55, y).stroke({ color: 0x6d8799, width: 1, alpha: this.tuning.gridOpacity });

    const lineById = new Map(this.#performance.statics.lines.map((line) => [line.id, line]));
    for (const edge of this.#performance.statics.edges) {
      const line = lineById.get(edge.lineId);
      if (!line) continue;
      const points = edge.poly.map((point) => this.#transform(point));
      this.#map.moveTo(points[0]!.x, points[0]!.y);
      for (const point of points.slice(1)) this.#map.lineTo(point.x, point.y);
      this.#map.stroke({ color: 0x06101a, width: 22 * this.tuning.lineWeight, cap: "round", join: "round" });
      this.#map.moveTo(points[0]!.x, points[0]!.y);
      for (const point of points.slice(1)) this.#map.lineTo(point.x, point.y);
      this.#map.stroke({ color: colorNumber(line.color), width: 13 * this.tuning.lineWeight, cap: "round", join: "round" });
    }
    for (const station of this.#performance.statics.stations) {
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
    }
    this.#backend.render();
  }

  destroy(): void {
    this.#background.destroy();
    this.#map.destroy();
    this.#labels.forEach((label) => label.destroy());
  }
}
