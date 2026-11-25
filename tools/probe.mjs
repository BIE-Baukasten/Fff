// Läuft eine Welt headless und druckt einen Verlauf — zum Austarieren der Parameter.
import { World, DAY } from '../src/world.js';
const seed = Number(process.argv[2] || 1);
const days = Number(process.argv[3] || 20);
const w = new World(seed);
const t0 = Date.now();
for (let d = 1; d <= days; d++) {
  for (let i = 0; i < DAY; i++) w.step();
  const sp = w.livingSpecies();
  const avgSize = w.creatures.reduce((s, c) => s + c.g.size, 0) / Math.max(1, w.creatures.length);
  console.log(`Tag ${String(d).padStart(3)} pop ${String(w.creatures.length).padStart(4)} algae ${w.history.at(-1).algae.toFixed(2)} arten ${sp.length} gen ${w.records.maxGen} size ${avgSize.toFixed(1)} clades ${w.clades.size} tod ${JSON.stringify(w.deaths)}`);
}
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const e of w.events.slice(-25)) console.log(`  T${(e.t / DAY).toFixed(1)}: ` + e.parts.map(p => typeof p === 'string' ? p : p.clade ? w.clades.get(p.clade)?.name ?? '?' : '').join(''));
