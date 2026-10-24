/**
 * Gerador pseudoaleatório com semente (mulberry32): mesma semente, mesma sequência
 * em qualquer máquina. É o que permite o sorteio de posições ser reproduzido num
 * replay ou num servidor online — basta transmitir a semente.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = normalizeSeed(seed);
  }

  /** [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [a, b) */
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}

/** Qualquer entrada vira um inteiro de 32 bits válido (NaN/∞/fração não quebram o gerador). */
export function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

/** Semente nova para uma partida. Usa o gerador criptográfico quando existe. */
export function randomSeed(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0];
  return (Math.random() * 4294967296) >>> 0;
}
