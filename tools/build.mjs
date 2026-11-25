// Bündelt index.html und alle Module zu einer einzigen Datei, ohne Abhängigkeiten.
//   dist/gezeitenbecken.html  – vollständiges Dokument, per Doppelklick zu öffnen
//   dist/artifact.html        – nur der Seiteninhalt, für Umgebungen, die Kopf und Rumpf selbst setzen
// Jedes Modul bekommt seinen eigenen Gültigkeitsbereich; Importe werden zu Zuweisungen.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const entryMatch = /<script type="module" src="([^"]+)"><\/script>/.exec(html);
if (!entryMatch) throw new Error('Kein Modul-Einstieg in index.html gefunden.');

const modules = new Map(); // Pfad → { code, deps, exports }
const order = [];

function load(path) {
  if (modules.has(path)) return;
  modules.set(path, null);
  const src = readFileSync(path, 'utf8');
  const deps = [];
  const exportsList = [];
  let code = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, spec) => {
    const dep = resolve(dirname(path), spec);
    deps.push(dep);
    const binds = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => n.replace(/\s+as\s+/, ': '));
    return `const { ${binds.join(', ')} } = __mod[${JSON.stringify(key(dep))}];`;
  });
  if (/^\s*import\s/m.test(code)) throw new Error(`Nicht unterstützter Import in ${path}`);
  code = code.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, name) => {
    exportsList.push(name);
    return `${kind} ${name}`;
  });
  if (/^export\s/m.test(code)) throw new Error(`Nicht unterstützter Export in ${path}`);
  for (const d of deps) load(d);
  modules.set(path, { code, exportsList });
  order.push(path);
}

function key(path) {
  return relative(root, path).split('\\').join('/');
}

load(join(root, entryMatch[1]));

let bundle = "'use strict';\nconst __mod = Object.create(null);\n";
for (const path of order) {
  const { code, exportsList } = modules.get(path);
  bundle += `\n// ── ${key(path)} ──\n__mod[${JSON.stringify(key(path))}] = (() => {\n${code.trim()}\n${
    exportsList.length ? `return { ${exportsList.join(', ')} };` : 'return {};'
  }\n})();\n`;
}
if (bundle.includes('</script')) throw new Error('Das Bündel enthält </script und würde die Seite zerbrechen.');

const inline = `<script>\n(() => {\n${bundle}\n})();\n</script>`;
const full = html.replace(entryMatch[0], inline);

const start = full.indexOf('<!-- @artifact-start -->');
const end = full.indexOf('<!-- @artifact-end -->');
if (start < 0 || end < 0) throw new Error('Artefakt-Markierungen fehlen in index.html.');
const fragment = full
  .slice(start + '<!-- @artifact-start -->'.length, end)
  .split('\n')
  .filter((line) => !/^\s*<\/?(head|body)>\s*$/.test(line) && !/@artifact-script/.test(line))
  .join('\n')
  .trim();

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'gezeitenbecken.html'), full.replace(/\n?<!-- @artifact-(start|end|script) -->/g, ''));
writeFileSync(join(root, 'dist', 'artifact.html'), fragment + '\n');
console.log(`Gebündelt: ${order.length} Module, ${(full.length / 1024).toFixed(1)} KB → dist/gezeitenbecken.html, dist/artifact.html`);
