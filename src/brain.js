// Ein winziges vorwärtsgerichtetes Netz: Eingaben → 8 versteckte Neuronen → Ausgaben.
// Zwei Ausgaben werden als Gedächtnis zurückgeführt, so entsteht ein Hauch von Zustand.

import { dtanh } from './detmath.js';
import { N_IN, N_HID, N_OUT } from './genome.js';

export function think(w, input, hidden, output) {
  let k = 0;
  for (let h = 0; h < N_HID; h++) {
    let sum = 0;
    for (let i = 0; i < N_IN; i++) sum += input[i] * w[k++];
    hidden[h] = dtanh(sum);
  }
  for (let o = 0; o < N_OUT; o++) {
    let sum = 0;
    for (let h = 0; h < N_HID; h++) sum += hidden[h] * w[k++];
    output[o] = dtanh(sum);
  }
}

// Gewicht von Eingang i zu verstecktem Neuron h.
export function weightIn(w, i, h) {
  return w[h * N_IN + i];
}

// Gewicht von verstecktem Neuron h zu Ausgang o.
export function weightOut(w, h, o) {
  return w[N_IN * N_HID + o * N_HID + h];
}
