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
        this.#effects.roundRect(x - brickWidth / 2 - 6, y - brickHeight / 2 - 6, brickWidth + 12, brickHeight + 12, 9)
          .fill({ color: colorNumber(brick.color), alpha: this.tuning.glow * 0.12 });
        this.#board.roundRect(x - brickWidth / 2, y - brickHeight / 2, brickWidth, brickHeight, 6)
          .fill({ color: colorNumber(brick.color), alpha: 0.94 })
          .stroke({ color: 0xffffff, width: 2, alpha: 0.26 });
        if (brick.cells > 1) {
          for (let cell = 1; cell < brick.cells; cell += 1) {
            const cellX = x - brickWidth / 2 + brickWidth * cell / brick.cells;
            this.#board.moveTo(cellX, y - brickHeight / 2 + 4).lineTo(cellX, y + brickHeight / 2 - 4)
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
    this.#board.roundRect(width / 2 - 120, paddleY, 240, 34, 14).fill({ color: 0x79e6ff, alpha: 0.9 });
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
