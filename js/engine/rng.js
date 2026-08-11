// Deterministischer Zufallsgenerator (mulberry32).
// Jedes Szenario erhält einen Seed, damit Fälle reproduzierbar sind
// (wichtig für Tests und die spätere Fall-Vorschau im Editor).

/** @param {number} seed @returns {() => number} liefert Werte in [0, 1) */
export function createRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministischer Jitter für Vitalwert-Anzeige: hash(seed, key) → [-1, 1) */
export function jitter(seed, key) {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 2654435761);
  }
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 4294967296) * 2 - 1;
}

/** Gewichtete Auswahl ohne Zurücklegen. items: [{weight, ...}] */
export function weightedPick(items, rng) {
  const total = items.reduce((s, it) => s + (it.weight ?? 1), 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight ?? 1;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
