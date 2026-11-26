// Runs the full marker battery: 7 lesion conditions × N individuals, in parallel worker threads.
// Usage: node scripts/run-study.mjs [--seeds 12] [--workers 4] [--only full,noGW] [--out results/study.json]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

if (isMainThread) {
  const { LESIONS } = await import('../src/core/config.js');
  const seeds = +arg('seeds', 12), workers = +arg('workers', Math.max(1, os.cpus().length));
  const only = arg('only', null), out = arg('out', 'results/study.json');
  const conds = only ? only.split(',') : Object.keys(LESIONS);
  mkdirSync('results/raw', { recursive: true });
  const jobs = [];
  for (let s = 1; s <= seeds; s++) for (const l of conds) jobs.push({ seed: s, lesion: l });
  const results = [];
  let next = 0, done = 0; const t0 = Date.now();
  await new Promise(resolve => {
    const spawn = () => {
      if (next >= jobs.length) return;
      const job = jobs[next++];
      const cache = `results/raw/${job.lesion}_${job.seed}.json`;
      if (existsSync(cache) && !process.argv.includes('--fresh')) {
        results.push(JSON.parse(readFileSync(cache, 'utf8'))); done++;
        if (done === jobs.length) resolve(); else spawn();
        return;
      }
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
      w.on('message', r => {
        results.push(r); done++;
        writeFileSync(cache, JSON.stringify(r));
        const el = (Date.now() - t0) / 1000;
        console.log(`[${done}/${jobs.length}] ${r.lesion} seed ${r.seed} ${r.ms / 1000 | 0}s  (elapsed ${el | 0}s)`);
        if (done === jobs.length) resolve(); else spawn();
      });
      w.on('error', e => { console.error('worker error', job, e); done++; if (done === jobs.length) resolve(); else spawn(); });
    };
    for (let i = 0; i < workers; i++) spawn();
  });
  results.sort((a, b) => a.lesion.localeCompare(b.lesion) || a.seed - b.seed);
  writeFileSync(out, JSON.stringify({ created: new Date().toISOString(), seeds, conditions: conds, results }, null, 1));
  console.log('wrote', out, results.length, 'individuals');
} else {
  const { rear } = await import('../src/experiments/common.js');
  const { BATTERY, fitness } = await import('../src/experiments/protocols.js');
  const { seed, lesion } = workerData;
  const t0 = Date.now();
  const r = { seed, lesion, markers: {}, timing: {} };
  const { agent, world } = rear(seed, lesion);
  r.rearedAlive = agent.alive;
  r.rearing = { toxicFrac: agent.stats.eatenToxic / Math.max(1, agent.stats.eatenGood + agent.stats.eatenToxic), meanDrive: agent.stats.homeoErr / agent.stats.ticks, words: agent.lex.known().length, episodes: agent.mem.episodes.length };
  if (agent.alive) {
    for (const [k, f] of Object.entries(BATTERY)) {
      const t1 = Date.now();
      try { r.markers[k] = f(agent, world, seed); } catch (e) { r.markers[k] = { error: String(e.stack || e) }; }
      r.timing[k] = Date.now() - t1;
    }
  }
  r.markers.fitness = fitness(seed, lesion);
  r.ms = Date.now() - t0;
  parentPort.postMessage(JSON.parse(JSON.stringify(r)));
}
