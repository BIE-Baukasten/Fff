// Bundles the habitat into one self-contained HTML page (dist/anima.html).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const r = await build({ entryPoints: ['src/web/app.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2022', legalComments: 'none' });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = readFileSync('src/web/template.html', 'utf8');
let study = 'null';
if (existsSync('results/web-summary.json')) {
  const sum = JSON.parse(readFileSync('results/web-summary.json', 'utf8'));
  const text = existsSync('src/web/study-text.json') ? JSON.parse(readFileSync('src/web/study-text.json', 'utf8')) : {};
  study = JSON.stringify({ ...sum, intro: text.intro || '', findings: text.findings || '' }).replace(/<\//g, '<\\/');
}
html = html.replace('/*STUDY*/null', study).replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/anima.html', html);
console.log('dist/anima.html', (html.length / 1024).toFixed(0) + ' KB');
