import type { LumenfallSlab, LumenfallWorld } from "./types.js";

const LANE_COUNT = 4;
const ROW_COUNT = 48;
const ROW_SPACING = 1.18;
const LANE_SPACING = 1.42;
const HERO_RADIUS = 0.16;

function hash01(row: number, lane: number, salt: number): number {
  const value = Math.sin(row * 127.1 + lane * 311.7 + salt * 71.3) * 43758.5453123;
  return value - Math.floor(value);
}

export function createNocturneCausewayWorld(seed: string): LumenfallWorld {
  const slabs: LumenfallSlab[] = [];
  for (let row = 0; row < ROW_COUNT; row += 1) {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const x = (lane - (LANE_COUNT - 1) / 2) * LANE_SPACING + (hash01(row, lane, 2) - 0.5) * 0.08;
      const z = 4 - row * ROW_SPACING + (hash01(row, lane, 3) - 0.5) * 0.07;
      const width = 1.22 + hash01(row, lane, 5) * 0.13;
      const depth = 1.72 + hash01(row, lane, 7) * 0.08;
      const thickness = 0.2 + hash01(row, lane, 11) * 0.11;
      const centerY = -thickness / 2;
      const wet = hash01(row, lane, 13) > 0.42 || lane === 1;
      slabs.push({
        id: `causeway:${row}:${lane}`,
        center: [x, centerY, z],
        size: [width, thickness, depth],
        yaw: (hash01(row, lane, 17) - 0.5) * 0.08,
        material: wet ? "wet-basalt" : "dry-basalt",
        contactPoint: [x, HERO_RADIUS, z],
        contactNormal: [0, 1, 0],
        row,
        lane,
      });
    }
  }
  return {
    worldId: "nocturne-causeway-graybox",
    worldSeed: `${seed}:nocturne-causeway-v1`,
    gravity: [0, -9.81, 0],
    heroRadius: HERO_RADIUS,
    slabs,
    laneCount: LANE_COUNT,
    rowCount: ROW_COUNT,
    rowSpacing: ROW_SPACING,
    laneSpacing: LANE_SPACING,
    bounds: { min: [-3.4, -0.35, 4 - (ROW_COUNT - 1) * ROW_SPACING - 0.7], max: [3.4, 0.2, 4.7] },
  };
}
