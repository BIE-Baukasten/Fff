// Deterministischer Zufallsgenerator (mulberry32) — gleiche Saat, gleiche Welt.

export function createRng(seed) {
  let s = seed >>> 0;
  let spare = null;

  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range(a, b) {
      return a + (b - a) * next();
    },
    int(n) {
      return Math.floor(next() * n);
    },
    chance(p) {
      return next() < p;
    },
    gauss() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u, v, r;
      do {
        u = next() * 2 - 1;
        v = next() * 2 - 1;
        r = u * u + v * v;
      } while (r >= 1 || r === 0);
      const m = Math.sqrt((-2 * Math.log(r)) / r);
      spare = v * m;
      return u * m;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
  };
}

// Macht aus beliebigem Text eine 32-bit-Saat (FNV-1a).
export function seedFromText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
