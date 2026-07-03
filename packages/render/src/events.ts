import type { PerformanceEvent } from "@reaper-viz/core";

export function eventProgress(event: PerformanceEvent, t: number): number {
  if (event.tEnd === undefined || event.tEnd <= event.t) return t >= event.t ? 1 : 0;
  return Math.max(0, Math.min(1, (t - event.t) / (event.tEnd - event.t)));
}

export class EventCursor {
  readonly #events: readonly PerformanceEvent[];
  readonly #frameDuration: number;
  #previousT: number | null = null;

  constructor(events: readonly PerformanceEvent[], fps = 60) {
    if (!(fps > 0)) throw new RangeError("EventCursor fps must be positive");
    for (let index = 1; index < events.length; index += 1) {
      if ((events[index]?.t ?? 0) < (events[index - 1]?.t ?? 0)) throw new RangeError("EventCursor events must be sorted");
    }
    this.#events = events;
    this.#frameDuration = 1 / fps;
  }

  reset(): void { this.#previousT = null; }

  seek(t: number): void { this.#previousT = t - this.#frameDuration; }

  instantaneousAt(t: number): PerformanceEvent[] {
    let from = this.#previousT ?? (t - this.#frameDuration);
    if (t < from) from = t - this.#frameDuration;
    this.#previousT = t;
    return this.#events.filter((event) => event.tEnd === undefined && event.t > from + 1e-12 && event.t <= t + 1e-12);
  }

  activeAt(t: number): PerformanceEvent[] {
    return this.#events.filter((event) => event.tEnd !== undefined && event.t <= t && t <= event.tEnd);
  }
}

export type InstantHandler<Context> = (event: PerformanceEvent, context: Context) => void;
export type SpanHandler<Context> = (event: PerformanceEvent, progress: number, context: Context) => void;

export class EventRuntime<Context> {
  readonly #cursor: EventCursor;
  readonly #instant = new Map<string, InstantHandler<Context>[]>();
  readonly #spans = new Map<string, SpanHandler<Context>[]>();

  constructor(events: readonly PerformanceEvent[], fps = 60) { this.#cursor = new EventCursor(events, fps); }

  on(type: string, handler: InstantHandler<Context>): this {
    const handlers = this.#instant.get(type) ?? [];
    handlers.push(handler);
    this.#instant.set(type, handlers);
    return this;
  }

  during(type: string, handler: SpanHandler<Context>): this {
    const handlers = this.#spans.get(type) ?? [];
    handlers.push(handler);
    this.#spans.set(type, handlers);
    return this;
  }

  seek(t: number): void { this.#cursor.seek(t); }

  render(t: number, context: Context): void {
    for (const event of this.#cursor.instantaneousAt(t)) {
      for (const handler of this.#instant.get(event.type) ?? []) handler(event, context);
    }
    for (const event of this.#cursor.activeAt(t)) {
      for (const handler of this.#spans.get(event.type) ?? []) handler(event, eventProgress(event, t), context);
    }
  }
}
