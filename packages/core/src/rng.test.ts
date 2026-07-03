import { describe, expect, it } from "vitest";
import { Rng } from "./rng.js";

describe("Rng", () => {
  it("repeats byte-for-byte from the same string seed", () => {
    const a = new Rng("song:metro");
    const b = new Rng("song:metro");
    expect(Array.from({ length: 20 }, () => a.nextUint32()))
      .toEqual(Array.from({ length: 20 }, () => b.nextUint32()));
  });

  it("keeps named forks independent of parent consumption", () => {
    const parent = new Rng("song");
    const before = parent.fork("flowers").nextUint32();
    for (let index = 0; index < 100; index += 1) parent.next();
    expect(parent.fork("flowers").nextUint32()).toBe(before);
    expect(parent.fork("trains").nextUint32()).not.toBe(before);
  });
});
