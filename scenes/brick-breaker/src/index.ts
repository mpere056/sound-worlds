import { sampleBrickBreakerBall, type BrickBreakerPerformance, type BrickVec2 } from "@reaper-viz/compiler-brick-breaker";
import { PixiBackend } from "@reaper-viz/render";
import { Graphics } from "pixi.js";

export type { BrickBreakerPerformance } from "@reaper-viz/compiler-brick-breaker";

export interface BrickBreakerTuning {
  glow: number;
  fragments: number;
  trail: number;
}

function colorNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

export class BrickBreakerScene {
  readonly backendKind = "pixi";
  readonly tuning: BrickBreakerTuning = { glow: 0.7, fragments: 0.8, trail: 0.55 };
  readonly #backend: PixiBackend;
  readonly #performance: BrickBreakerPerformance;
  readonly #background = new Graphics();
  readonly #board = new Graphics();
  readonly #effects = new Graphics();
  readonly #ball = new Graphics();

  constructor(backend: PixiBackend, performance: BrickBreakerPerformance) {
    this.#backend = backend;
    this.#performance = performance;
    backend.layer("brick-background").addChild(this.#background);
    backend.layer("brick-board").addChild(this.#board);
    backend.layer("brick-effects").addChild(this.#effects);
    backend.layer("brick-ball").addChild(this.#ball);
  }

  #screen(point: BrickVec2): BrickVec2 {
    const board = this.#performance.statics.board;
    const marginX = 105;
    const marginY = 170;
    const width = this.#backend.width - marginX * 2;
    const height = this.#backend.height - marginY * 2;
    return [marginX + (point[0] / board.width + 0.5) * width, marginY + (0.5 - point[1] / board.height) * height];
  }

  #drawBrick(x: number, y: number, width: number, height: number, rotation: number, color: number, alpha: number): void {
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([xSign, ySign]) => {
      const localX = xSign * width / 2;
      const localY = ySign * height / 2;
      return [x + localX * cosine - localY * sine, y + localX * sine + localY * cosine] as const;
    });
    this.#board.moveTo(...corners[0]!);
    for (const corner of corners.slice(1)) this.#board.lineTo(...corner);
    this.#board.closePath().fill({ color, alpha }).stroke({ color: 0xffffff, width: 2, alpha: 0.26 });
  }

  #rotatePoint(x: number, y: number, localX: number, localY: number, rotation: number): BrickVec2 {
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return [x + localX * cosine - localY * sine, y + localX * sine + localY * cosine];
  }

  #paddleX(t: number): number {
    const contacts = this.#performance.statics.paddleContacts;
    if (!contacts.length) return 0;
    const nextIndex = contacts.findIndex((contact) => contact.t >= t);
    if (nextIndex <= 0) return contacts[Math.max(0, nextIndex)]?.x ?? contacts.at(-1)!.x;
    const previous = contacts[nextIndex - 1]!;
    const next = contacts[nextIndex]!;
    const raw = Math.max(0, Math.min(1, (t - previous.t) / Math.max(1e-9, next.t - previous.t)));
    const smooth = raw * raw * raw * (raw * (raw * 6 - 15) + 10);
    return previous.x + (next.x - previous.x) * smooth;
  }

  renderFrame(t: number): void {
    const { width, height } = this.#backend;
    const board = this.#performance.statics.board;
    const scaleX = (width - 210) / board.width;
    const scaleY = (height - 340) / board.height;
    this.#background.clear().rect(0, 0, width, height).fill(0x07111d);
    this.#background.rect(78, 135, width - 156, height - 270).fill({ color: 0x0b1826, alpha: 0.96 });
    this.#board.clear();
    this.#effects.clear();
    const wallColor = colorNumber(this.#performance.palette.roles.wall ?? "#36516a");
    this.#board.roundRect(78, 135, width - 156, height - 270, 18).stroke({ color: wallColor, width: 8, alpha: 0.72 });
    for (const brick of this.#performance.statics.bricks) {
      const [x, y] = this.#screen(brick.position);
      const brickWidth = brick.size[0] * scaleX;
      const brickHeight = brick.size[1] * scaleY;
      if (t < brick.destructionT) {
        this.#drawBrick(x, y, brickWidth + 12, brickHeight + 12, brick.rotation, colorNumber(brick.color), this.tuning.glow * 0.12);
        this.#drawBrick(x, y, brickWidth, brickHeight, brick.rotation, colorNumber(brick.color), 0.94);
        if (brick.cells > 1) {
          for (let cell = 1; cell < brick.cells; cell += 1) {
            const cellX = -brickWidth / 2 + brickWidth * cell / brick.cells;
            const top = this.#rotatePoint(x, y, cellX, -brickHeight / 2 + 4, brick.rotation);
            const bottom = this.#rotatePoint(x, y, cellX, brickHeight / 2 - 4, brick.rotation);
            this.#board.moveTo(...top).lineTo(...bottom)
              .stroke({ color: 0x07111d, width: 2, alpha: 0.45 });
          }
        }
      } else {
        const age = t - brick.destructionT;
        if (age <= 0.5) {
          for (let fragment = 0; fragment < Math.min(8, 3 + brick.cells * 2); fragment += 1) {
            const angle = fragment * 2.399 + brick.energy;
            const distance = age * (90 + brick.energy * 130);
            this.#effects.rect(x + Math.cos(angle) * distance - 4, y + Math.sin(angle) * distance - 4, 8, 8)
              .fill({ color: colorNumber(brick.color), alpha: (1 - age / 0.5) * this.tuning.fragments });
          }
        }
      }
    }
    const paddleY = height - 205;
    const paddleWorldX = this.#paddleX(t);
    const paddleX = this.#screen([paddleWorldX, 0])[0];
    this.#board.roundRect(paddleX - 120, paddleY, 240, 34, 14).fill({ color: 0x79e6ff, alpha: 0.9 });
    for (const segment of this.#performance.statics.ballSegments) {
      if (segment.kind !== "wall" && segment.kind !== "paddle") continue;
      const age = t - segment.t1;
      if (age < 0 || age > 0.16) continue;
      const [hitX, hitY] = this.#screen(segment.to);
      const alpha = (1 - age / 0.16) * 0.34;
      this.#effects.circle(hitX, hitY, 18 + age * 180).stroke({ color: 0x8deeff, width: 4, alpha });
    }
    this.#ball.clear();
    for (let sample = 6; sample >= 1; sample -= 1) {
      const trail = this.#screen(sampleBrickBreakerBall(this.#performance.statics.ballSegments, Math.max(0, t - sample * 0.035)));
      this.#ball.circle(trail[0], trail[1], 8 + (6 - sample) * 1.5).fill({ color: 0x8deeff, alpha: this.tuning.trail * (7 - sample) / 70 });
    }
    const position = this.#screen(sampleBrickBreakerBall(this.#performance.statics.ballSegments, t));
    this.#effects.circle(position[0], position[1], 28).fill({ color: 0x8deeff, alpha: this.tuning.glow * 0.13 });
    this.#ball.circle(position[0], position[1], 17).fill(0xf7fdff).stroke({ color: 0x8deeff, width: 3, alpha: 0.8 });
    this.#backend.render();
  }

  destroy(): void {
    this.#background.destroy();
    this.#board.destroy();
    this.#effects.destroy();
    this.#ball.destroy();
  }
}
