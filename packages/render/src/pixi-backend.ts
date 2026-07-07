import { Application, Container } from "pixi.js";

export interface PixiBackendOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
  background?: number;
}

export class PixiBackend {
  readonly app: Application;
  readonly width: number;
  readonly height: number;
  readonly #layers = new Map<string, Container>();

  private constructor(app: Application, width: number, height: number) {
    this.app = app;
    this.width = width;
    this.height = height;
  }

  static async create(options: PixiBackendOptions): Promise<PixiBackend> {
    const width = options.width ?? 1080;
    const height = options.height ?? 1920;
    const app = new Application();
    await app.init({
      canvas: options.canvas,
      width,
      height,
      backgroundColor: options.background ?? 0x07111f,
      backgroundAlpha: 1,
      antialias: true,
      autoStart: false,
      preference: "webgl",
      resolution: 1,
    });
    app.ticker.stop();
    return new PixiBackend(app, width, height);
  }

  layer(name: string): Container {
    const existing = this.#layers.get(name);
    if (existing) return existing;
    const layer = new Container({ label: name });
    this.#layers.set(name, layer);
    this.app.stage.addChild(layer);
    return layer;
  }

  render(): void { this.app.render(); }

  readPixelsInto(target: Uint8Array): void {
    const extracted = this.app.renderer.extract.pixels(this.app.stage).pixels;
    if (target.length !== extracted.length) {
      throw new RangeError(`Pixel target length ${target.length} does not match ${extracted.length}`);
    }
    target.set(extracted);
  }

  destroy(options: { context?: boolean } = {}): void {
    this.#layers.clear();
    this.app.destroy({ removeView: false }, { children: true, context: options.context ?? false });
  }
}
