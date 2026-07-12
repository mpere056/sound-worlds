import type { MarbleMotionMix } from "@reaper-viz/compiler-marble";
import { MarbleLiveCertaintyWindow, type MarbleLiveWindowSnapshot } from "./marble-live-window.js";
import type {
  MarbleLiveBodyState,
  MarbleLiveNoteIntent,
  MarbleLivePlatformPlacement,
  MarbleLiveReservedCollider,
  MarbleLiveSolveRequest,
  MarbleLiveSolveSuccess,
} from "./marble-live-solver-protocol.js";

export interface MarbleLiveSolveContext {
  motionMix: MarbleMotionMix;
  marble: MarbleLiveBodyState;
  notes: readonly MarbleLiveNoteIntent[];
  reservedColliders: readonly MarbleLiveReservedCollider[];
}

export class MarbleLiveRollingCoordinator {
  readonly #window: MarbleLiveCertaintyWindow;
  readonly #pending = new Map<number, Set<string>>();
  readonly #placements = new Map<string, MarbleLivePlatformPlacement>();
  #nextRequestId = 1;

  constructor(totalPlatformCount: number, windowSize = 5) {
    this.#window = new MarbleLiveCertaintyWindow(totalPlatformCount, windowSize);
  }

  request(context: MarbleLiveSolveContext): MarbleLiveSolveRequest | undefined {
    const batch = this.#window.requestSolveBatch();
    if (!batch.length) return undefined;
    const noteById = new Map(context.notes.map((note) => [note.platformId, note]));
    const notes = batch.map((slot) => {
      const note = noteById.get(slot.id);
      if (!note) throw new Error(`Missing live note intent for ${slot.id}`);
      return { ...note };
    });
    const requestId = this.#nextRequestId++;
    const solveGeneration = batch[0]!.solveGeneration!;
    this.#pending.set(requestId, new Set(batch.map((slot) => slot.id)));
    return {
      type: "solve-live-window",
      requestId,
      solveGeneration,
      motionMix: { ...context.motionMix },
      marble: { ...context.marble, position: [...context.marble.position], velocity: [...context.marble.velocity] },
      notes,
      reservedColliders: context.reservedColliders.map((collider) => ({
        ...collider,
        position: [...collider.position],
        rotation: [...collider.rotation],
        size: [...collider.size],
      })),
    };
  }

  apply(result: MarbleLiveSolveSuccess): void {
    const pending = this.#pending.get(result.requestId);
    if (!pending) throw new Error(`Unknown or stale live solve request ${result.requestId}`);
    const ids = result.placements.map((placement) => placement.platformId);
    if (ids.length !== pending.size || ids.some((id) => !pending.has(id))) throw new Error("Live solver returned a mismatched platform batch");
    if (result.placements.some((placement) => placement.clearance < 0)) throw new Error("Live solver returned an intersecting platform placement");
    this.#window.certify(ids, result.solveGeneration);
    for (const placement of result.placements) this.#placements.set(placement.platformId, structuredClone(placement));
    this.#pending.delete(result.requestId);
  }

  invalidatePending(): void {
    this.#pending.clear();
    this.#window.invalidateSolving();
  }

  consumeNext(platformId: string): MarbleLivePlatformPlacement {
    this.#window.consumeNext(platformId);
    const placement = this.#placements.get(platformId);
    if (!placement) throw new Error(`Missing certified placement for ${platformId}`);
    return structuredClone(placement);
  }

  snapshot(): MarbleLiveWindowSnapshot {
    return this.#window.snapshot();
  }
}
