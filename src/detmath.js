// Deterministische Mathematik.
//
// Math.exp, Math.log, Math.sin & Co. dürfen laut Sprachstandard in jeder Engine
// im letzten Bit anders runden, und das tun sie auch (Node und Chrome schon bei
// Math.log). Ein chaotisches Ökosystem verstärkt so ein Bit binnen weniger Tage
// zu einer völlig anderen Geschichte. Diese Fassungen benutzen nur + − × ÷ und
// sqrt, die IEEE 754 exakt vorschreibt; damit ergibt eine Saat in jedem Browser
// dieselbe Welt. Genauigkeit: rund 1e-15 relativ, mehr braucht hier niemand.

// ln 2 in zwei Teilen (wie fdlibm), damit k·LN2_HI exakt bleibt.
const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.4426950408889634;
const SQRT2 = 1.4142135623730951;
const SQRT3 = 1.7320508075688772;
export const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

function pow2(k) {
  let result = 1;
  let base = k >= 0 ? 2 : 0.5;
  let n = k >= 0 ? k : -k;
  while (n > 0) {
    if (n & 1) result *= base;
    base *= base;
    n >>= 1;
  }
  return result;
}

// Zweierpotenzen 2^-1022 … 2^1023, exakt durch fortgesetztes Verdoppeln.
const POW2_BIAS = 1022;
const POW2 = new Float64Array(1023 + POW2_BIAS + 1);
POW2[POW2_BIAS] = 1;
for (let k = 1; k <= 1023; k++) POW2[POW2_BIAS + k] = POW2[POW2_BIAS + k - 1] * 2;
for (let k = 1; k <= 1022; k++) POW2[POW2_BIAS - k] = POW2[POW2_BIAS - k + 1] / 2;

// Kehrwerte 1/i für das Horner-Schema der Taylorreihe von e^r.
const INV = new Float64Array(15);
for (let i = 1; i < 15; i++) INV[i] = 1 / i;

export function dexp(x) {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO; // |r| ≤ 0,35
  let s = 1;
  for (let i = 13; i >= 1; i--) s = 1 + r * INV[i] * s;
  if (k >= -1022) return s * POW2[POW2_BIAS + k];
  // Nur für winzige Ergebnisse: in zwei Schritten skalieren.
  const h = k >> 1;
  return s * pow2(h) * pow2(k - h);
}

export function dlog(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let m = x;
  let e = 0;
  while (m >= 18446744073709551616) {
    m /= 18446744073709551616;
    e += 64;
  }
  while (m < 5.421010862427522e-20) {
    m *= 18446744073709551616;
    e -= 64;
  }
  while (m >= 2) {
    m /= 2;
    e++;
  }
  while (m < 1) {
    m *= 2;
    e--;
  }
  if (m > SQRT2) {
    m /= 2;
    e++;
  }
  // log m = 2·atanh(t) mit t = (m−1)/(m+1), |t| ≤ 0,172
  const t = (m - 1) / (m + 1);
  const t2 = t * t;
  let p = 1 / 27;
  for (let i = 25; i >= 1; i -= 2) p = 1 / i + t2 * p;
  return e * LN2_HI + (e * LN2_LO + 2 * t * p);
}

// Kehrwerte 1/(n·(n−1)) für die Reihen von Sinus und Kosinus.
const TRIG = new Float64Array(21);
for (let n = 2; n <= 20; n++) TRIG[n] = 1 / (n * (n - 1));

function sinPoly(r) {
  const r2 = r * r;
  // r − r³/3! + r⁵/5! − … bis r¹⁹
  let p = 0;
  for (let n = 19; n >= 3; n -= 2) p = (1 - r2 * p) * TRIG[n];
  return r * (1 - r2 * p);
}

function cosPoly(r) {
  const r2 = r * r;
  let p = 0;
  for (let n = 20; n >= 2; n -= 2) p = (1 - r2 * p) * TRIG[n];
  return 1 - r2 * p;
}

export function dsin(x) {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = k & 3; // auch für negative k korrekt (Zweierkomplement)
  if (q === 0) return sinPoly(r);
  if (q === 1) return cosPoly(r);
  if (q === 2) return -sinPoly(r);
  return -cosPoly(r);
}

export function dcos(x) {
  const k = Math.round(x / HALF_PI);
  const r = x - k * HALF_PI;
  const q = k & 3;
  if (q === 0) return cosPoly(r);
  if (q === 1) return -sinPoly(r);
  if (q === 2) return -cosPoly(r);
  return sinPoly(r);
}

export function dtanh(x) {
  if (x > 20) return 1;
  if (x < -20) return -1;
  if (x > -1e-4 && x < 1e-4) return x - (x * x * x) / 3;
  const e = dexp(2 * x);
  return (e - 1) / (e + 1);
}

function datan(z) {
  let sign = 1;
  if (z < 0) {
    z = -z;
    sign = -1;
  }
  let inverted = false;
  if (z > 1) {
    z = 1 / z;
    inverted = true;
  }
  let add = 0;
  if (z > 0.2679491924311227) {
    // atan z = π/6 + atan((z√3 − 1)/(√3 + z))
    z = (z * SQRT3 - 1) / (SQRT3 + z);
    add = PI / 6;
  }
  const z2 = z * z;
  let p = 1 / 31;
  for (let i = 29; i >= 1; i -= 2) p = 1 / i - z2 * p;
  let r = add + z * p;
  if (inverted) r = HALF_PI - r;
  return sign * r;
}

export function datan2(y, x) {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}
