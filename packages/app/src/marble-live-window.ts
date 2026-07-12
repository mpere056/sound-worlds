export const MARBLE_LIVE_WINDOW_MIN = 5;
export const MARBLE_LIVE_WINDOW_MAX = 8;

export type MarbleLivePlatformState = "uncertain" | "solving" | "certain" | "spent";

export interface MarbleLivePlatformSlot {
  readonly id: string;
  readonly index: number;
  state: MarbleLivePlatformState;
  solveGeneration?: number;
}

export interface MarbleLiveWindowSnapshot {
  readonly windowSize: number;
  readonly nextImpactIndex: number;
  readonly solveGeneration: number;
  readonly slots: readonly MarbleLivePlatformSlot[];
}

function boundedWindowSize(value: number): number {
  return Math.max(MARBLE_LIVE_WINDOW_MIN, Math.min(MARBLE_LIVE_WINDOW_MAX, Math.round(value)));
}

function platformId(index: number): string {
  return `live-platform:${index}`;
}

export class MarbleLiveCertaintyWindow {
  readonly #windowSize: number;
  readonly #slots: MarbleLivePlatformSlot[];
  #nextImpactIndex = 0;
  #solveGeneration = 0;

  constructor(totalPlatformCount: number, windowSize = MARBLE_LIVE_WINDOW_MIN) {
    const total = Math.max(0, Math.floor(totalPlatformCount));
    this.#windowSize = boundedWindowSize(windowSize);
    this.#slots = Array.from({ length: total }, (_, index) => ({ id: platformId(index), index, state: "uncertain" }));
  }

  snapshot(): MarbleLiveWindowSnapshot {
    return {
      windowSize: this.#windowSize,
      nextImpactIndex: this.#nextImpactIndex,
      solveGeneration: this.#solveGeneration,
      slots: this.#slots.map((slot) => ({ ...slot })),
    };
  }

  requestSolveBatch(): readonly MarbleLivePlatformSlot[] {
    this.#solveGeneration += 1;
    const windowEnd = Math.min(this.#slots.length, this.#nextImpactIndex + this.#windowSize);
    const batch: MarbleLivePlatformSlot[] = [];
    for (let index = this.#nextImpactIndex; index < windowEnd; index += 1) {
      const slot = this.#slots[index]!;
      if (slot.state === "certain" || slot.state === "spent") continue;
      slot.state = "solving";
      slot.solveGeneration = this.#solveGeneration;
      batch.push({ ...slot });
    }
    return batch;
  }

  certify(ids: readonly string[], solveGeneration: number): void {
    const requested = new Set(ids);
    for (const slot of this.#slots) {
      if (!requested.has(slot.id)) continue;
      if (slot.state !== "solving" || slot.solveGeneration !== solveGeneration) {
        throw new Error(`Cannot certify stale or inactive live platform ${slot.id}`);
      }
      slot.state = "certain";
    }
    this.#assertCertainPrefix();
  }

  invalidateSolving(): void {
    for (const slot of this.#slots) {
      if (slot.state !== "solving") continue;
      slot.state = "uncertain";
      delete slot.solveGeneration;
    }
  }

  consumeNext(expectedId: string): MarbleLivePlatformSlot {
    const slot = this.#slots[this.#nextImpactIndex];
    if (!slot || slot.id !== expectedId) throw new Error(`Live platform impact out of order: expected ${slot?.id ?? "end"}, received ${expectedId}`);
    if (slot.state !== "certain") throw new Error(`Live platform ${slot.id} is not certified`);
    slot.state = "spent";
    delete slot.solveGeneration;
    this.#nextImpactIndex += 1;
    return { ...slot };
  }

  isComplete(): boolean {
    return this.#nextImpactIndex >= this.#slots.length;
  }

  #assertCertainPrefix(): void {
    let foundGap = false;
    const windowEnd = Math.min(this.#slots.length, this.#nextImpactIndex + this.#windowSize);
    for (let index = this.#nextImpactIndex; index < windowEnd; index += 1) {
      const certain = this.#slots[index]!.state === "certain";
      if (!certain) foundGap = true;
      else if (foundGap) throw new Error(`Live certainty window cannot contain a certified platform after an unresolved gap`);
    }
  }
}
