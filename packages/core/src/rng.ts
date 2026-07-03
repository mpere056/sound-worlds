function seedWords(seed: string): [number, number, number, number] {
  let h1 = 0x9e3779b9;
  let h2 = 0x243f6a88;
  let h3 = 0xb7e15162;
  let h4 = 0xdeadbeef;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x85ebca6b);
    h2 = Math.imul(h2 ^ code, 0xc2b2ae35);
    h3 = Math.imul(h3 ^ code, 0x27d4eb2f);
    h4 = Math.imul(h4 ^ code, 0x165667b1);
  }
  const mix = (value: number): number => {
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  };
  const words: [number, number, number, number] = [mix(h1), mix(h2), mix(h3), mix(h4)];
  if (words.every((word) => word === 0)) words[0] = 1;
  return words;
}

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export class Rng {
  readonly #seed: string;
  readonly #state: [number, number, number, number];

  constructor(seed: string) {
    this.#seed = seed;
    this.#state = seedWords(seed);
  }

  nextUint32(): number {
    const state = this.#state;
    const result = Math.imul(rotateLeft(Math.imul(state[1], 5) >>> 0, 7), 9) >>> 0;
    const temporary = (state[1] << 9) >>> 0;
    state[2] ^= state[0]; state[3] ^= state[1]; state[1] ^= state[2]; state[0] ^= state[3];
    state[2] ^= temporary; state[3] = rotateLeft(state[3], 11);
    return result;
  }

  next(): number { return this.nextUint32() / 0x100000000; }

  float(min = 0, max = 1): number {
    if (!(max >= min)) throw new RangeError("Rng.float requires max >= min");
    return min + (max - min) * this.next();
  }

  int(min: number, maxExclusive: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || maxExclusive <= min) {
      throw new RangeError("Rng.int requires integer bounds with maxExclusive > min");
    }
    return min + Math.floor(this.next() * (maxExclusive - min));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Cannot pick from an empty collection");
    return values[this.int(0, values.length)] as T;
  }

  fork(name: string): Rng { return new Rng(`${this.#seed}:${name}`); }
}
