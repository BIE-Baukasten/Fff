// Verdrahtet Welt, Zeichnung und Journal; enthält die Spielschleife.

import { World, DAY, PARAMS } from './world.js';
import { Renderer, colorOf, cladeColor } from './render.js';
import { drawPopulation, drawTree, drawBrain, treeRows, TREE_ROW } from './charts.js';
import { seedFromText } from './rng.js';

const $ = (id) => document.getElementById(id);
const fmt1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const state = {
  world: null,
  renderer: null,
  paused: false,
  speed: 1,
  tool: 'watch',
  selected: null, // Wesen-Objekt (auch wenn es gestorben ist)
  species: null, // Art-ID, wenn die Artansicht offen ist
  followLine: true,
  view: 'pop',
  lastPanel: 0,
  lastChart: 0,
  eventsShown: '',
  treeRows: [],
};

// ---------- Hilfen ----------

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function speciesButton(clade) {
  const b = el('button', { class: 'sp' + (clade.died !== null ? ' gone' : ''), type: 'button', 'data-clade': clade.id }, clade.name);
  b.style.setProperty('--sw', cladeColor(clade));
  return b;
}

function stamp(t) {
  const c = state.world.clock(t);
  return `T${c.day} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
}

function days(ticks) {
  return fmt1.format(ticks / DAY);
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Welt ----------

function startWorld(seed, warmDays = 0) {
  state.world = new World(seed);
  for (let i = 0; i < warmDays * DAY; i++) state.world.step();
  if (state.renderer) state.renderer.setWorld(state.world);
  else state.renderer = new Renderer($('world'), state.world);
  state.species = null;
  state.eventsShown = '';
  $('seedInput').value = String(seed);
  try {
    history.replaceState(null, '', `#saat-${seed}`);
  } catch {
    /* Manche Rahmen verbieten das; die Saat steht trotzdem im Feld. */
  }
  // Mit einem Tier im Blick beginnen, damit das Gehirn sofort zu sehen ist.
  selectCreature(state.world.creatures[0] || null);
  refreshPanels(true);
}

function seedFromHash() {
  const m = /^#saat-(\d{1,10})$/.exec(location.hash);
  return m ? Number(m[1]) >>> 0 : null;
}

function randomSeed() {
  return Math.floor(Math.random() * 1e6);
}

// ---------- Auswahl ----------

function selectCreature(c) {
  state.selected = c;
  state.species = null;
  state.renderer.highlight = null;
  if (!c) state.renderer.follow = null;
  else if (state.renderer.follow) state.renderer.follow = c.id;
  buildInspector();
}

function showSpecies(id) {
  state.species = id;
  state.renderer.highlight = id;
  buildInspector();
  refreshSpeciesList();
}

function closeSpecies() {
  state.species = null;
  state.renderer.highlight = null;
  buildInspector();
  refreshSpeciesList();
}

// Stirbt das beobachtete Tier, springt die Beobachtung zum ältesten lebenden Kind.
function handleDeath() {
  const c = state.selected;
  if (!c || c.alive || c._handled) return;
  c._handled = true;
  if (state.followLine) {
    const kids = state.world.creatures.filter((k) => k.parent === c.id);
    if (kids.length) {
      kids.sort((a, b) => b.age - a.age);
      const cause = { hunger: 'ist verhungert', age: 'starb an Altersschwäche', eaten: 'wurde gefressen' }[c.cause];
      toast(`Nr. ${c.id} ${cause}. Weiter mit Nachkomme Nr. ${kids[0].id}.`);
      selectCreature(kids[0]);
      return;
    }
  }
  buildInspector();
}

// ---------- Inspektor ----------

const insp = {};

function buildInspector() {
  const root = $('inspector');
  root.replaceChildren();
  for (const k of Object.keys(insp)) delete insp[k];
  if (state.species != null) return buildSpeciesView(root);
  const c = state.selected;
  if (!c) {
    root.append(
      el('h2', {}, 'Beobachtung'),
      el('p', { class: 'empty' }, 'Tippe im Becken ein Wesen an. Hier erscheinen dann sein Lebenslauf und sein Gehirn, das live mitdenkt.'),
    );
    return;
  }
  const w = state.world;
  const shown = w.displayClade(c.clade) || w.clades.get(c.clade);
  root.append(el('h2', {}, 'Beobachtung'));

  insp.eyebrow = el('div', { class: 'eyebrow' });
  const dot = el('span', { class: 'dot' });
  dot.style.background = colorOf(c.g, 68, 60);
  const title = el('h3', { class: 'insp-title' }, dot, shown ? shown.name : 'Unbenannt');
  const sub = el('p', { class: 'insp-sub' });
  if (shown && shown.id !== c.clade) sub.append('Ein noch unbenannter Seitenzweig dieser Art.');
  else if (shown) sub.append(`Gattung ${shown.genus}`);
  root.append(el('div', { class: 'insp-head' }, insp.eyebrow, title, sub));

  if (!c.alive) {
    const cause = { hunger: 'Verhungert', age: 'An Altersschwäche gestorben', eaten: 'Gefressen' }[c.cause];
    root.append(el('p', { class: 'death' }, `${cause} am ${stamp(c.died)}, mit ${days(c.died - c.born)} Tagen und ${c.children} Nachkommen.`));
  }

  const stat = (label, key, extra) => {
    insp[key] = el('dd', {}, '–');
    return el('div', {}, el('dt', {}, label), insp[key], extra || null);
  };
  insp.energyBar = el('div', { class: 'bar-meter' }, el('span'));
  root.append(
    el(
      'dl',
      { class: 'stats' },
      stat('Alter', 'age'),
      stat('Energie', 'energy', insp.energyBar),
      stat('Tempo', 'speed'),
      stat('Größe', 'size'),
      stat('Sichtweite', 'sense'),
      stat('Nachkommen', 'kids'),
    ),
  );

  if (c.alive) {
    insp.brain = el('canvas', { class: 'brain', 'aria-label': 'Das Gehirn dieses Wesens mit seinen aktuellen Signalen' });
    root.append(
      insp.brain,
      el(
        'p',
        { class: 'note' },
        'Links die Sinne, rechts die Handlungen. ',
        el('span', { class: 'amber' }, 'Bernstein'),
        ' verstärkt, ',
        el('span', { class: 'blue' }, 'Blau'),
        ' hemmt; Linien leuchten, solange Signal fließt.',
      ),
    );
  }

  const actions = el('div', { class: 'actions' });
  if (c.alive) {
    const follow = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.renderer.follow === c.id) }, 'Kamera folgt');
    follow.addEventListener('click', () => {
      state.renderer.follow = state.renderer.follow === c.id ? null : c.id;
      if (state.renderer.follow && state.renderer.cam.zoom < 2.5) state.renderer.cam.zoom = 2.5;
      follow.setAttribute('aria-pressed', String(state.renderer.follow === c.id));
    });
    const line = el('button', { class: 'btn', type: 'button', 'aria-pressed': String(state.followLine), title: 'Stirbt das Tier, geht es mit seinem ältesten Kind weiter.' }, 'Familie folgen');
    line.addEventListener('click', () => {
      state.followLine = !state.followLine;
      line.setAttribute('aria-pressed', String(state.followLine));
    });
    actions.append(follow, line);
  } else {
    const kids = state.world.creatures.filter((k) => k.parent === c.id);
    if (kids.length) {
      actions.append(el('button', { class: 'btn', type: 'button', onclick: () => selectCreature(kids[0]) }, `Kind ansehen (${kids.length} leben)`));
    }
    const kin = shown ? state.world.creatures.filter((k) => w.displayClade(k.clade)?.id === shown.id) : [];
    if (kin.length) actions.append(el('button', { class: 'btn', type: 'button', onclick: () => selectCreature(kin[Math.floor(Math.random() * kin.length)]) }, 'Ein anderes Tier der Art'));
  }
  if (shown && shown.established) actions.append(el('button', { class: 'btn', type: 'button', onclick: () => showSpecies(shown.id) }, 'Steckbrief der Art'));
  root.append(actions);
  updateInspector();
}

function updateInspector() {
  const c = state.selected;
  if (state.species != null) return updateSpeciesView();
  if (!c || !insp.age) return;
  insp.eyebrow.textContent = `Exemplar Nr. ${c.id} · Generation ${c.gen}${c.kills ? ` · ${c.kills} erbeutet` : ''}`;
  const age = c.alive ? state.world.t - c.born : c.died - c.born;
  insp.age.textContent = `${days(age)} T`;
  const e = Math.max(0, c.energy / c.maxE);
  insp.energy.textContent = `${fmt0.format(e * 100)} %`;
  insp.energyBar.firstChild.style.width = `${Math.min(100, e * 100)}%`;
  insp.energyBar.classList.toggle('low', e < 0.25);
  insp.speed.textContent = `${fmt0.format(c.speedAvg * 100)} %`;
  insp.size.textContent = fmt1.format(c.g.size);
  insp.sense.textContent = fmt0.format(c.g.sense);
  insp.kids.textContent = String(c.children);
  if (insp.brain && c.alive) drawBrain(insp.brain, c);
}

function buildSpeciesView(root) {
  const w = state.world;
  const clade = w.clades.get(state.species);
  if (!clade) return closeSpecies();
  const close = el('button', { class: 'link', type: 'button', onclick: closeSpecies }, 'Schließen');
  root.append(el('h2', {}, 'Steckbrief', close));
  const dot = el('span', { class: 'dot' });
  dot.style.background = cladeColor(clade);
  insp.eyebrow = el('div', { class: 'eyebrow' });
  root.append(el('div', { class: 'insp-head' }, insp.eyebrow, el('h3', { class: 'insp-title' }, dot, clade.name), el('p', { class: 'insp-sub' }, `Gattung ${clade.genus}`)));

  const parent = w.displayClade(clade.parent);
  const origin = el('p', { class: 'note' });
  if (parent) origin.append('Abgespalten von ', speciesButton(parent), ` am ${stamp(clade.born)}.`);
  else origin.append(`Eingewandert am ${stamp(clade.born)}.`);
  root.append(origin);

  const stat = (label, key) => {
    insp[key] = el('dd', {}, '–');
    return el('div', {}, el('dt', {}, label), insp[key]);
  };
  root.append(
    el(
      'dl',
      { class: 'stats' },
      stat('Bestand', 'pop'),
      stat('Höchststand', 'peak'),
      stat('Jäger', 'hunters'),
      stat('Größe ⌀', 'size'),
      stat('Sicht ⌀', 'sense'),
      stat('Tempo ⌀', 'speed'),
    ),
  );

  const chain = w.lineage(clade.id);
  if (chain.length > 1) {
    const ol = el('ol', { class: 'lineage', 'aria-label': 'Abstammung' });
    for (const c of chain) ol.append(el('li', {}, speciesButton(c)));
    root.append(el('div', {}, el('div', { class: 'eyebrow', style: 'margin-bottom:4px' }, 'Abstammung'), ol));
  }

  const actions = el('div', { class: 'actions' });
  const pickOne = () => {
    const members = w.creatures.filter((k) => w.displayClade(k.clade)?.id === clade.id);
    if (members.length) selectCreature(members.sort((a, b) => b.age - a.age)[0]);
  };
  insp.pick = el('button', { class: 'btn', type: 'button', onclick: pickOne }, 'Ältestes Tier beobachten');
  actions.append(insp.pick);
  root.append(actions);
  updateSpeciesView();
}

function updateSpeciesView() {
  const w = state.world;
  const clade = w.clades.get(state.species);
  if (!clade || !insp.pop) return;
  const st = w.speciesStats(clade.id);
  const status = clade.died !== null ? `ausgestorben ${stamp(clade.died)}` : `lebt seit ${days(w.t - clade.born)} Tagen`;
  insp.eyebrow.textContent = `Art Nr. ${clade.id} · ${status}`;
  insp.pop.textContent = String(st.n);
  insp.peak.textContent = String(clade.peak);
  insp.hunters.textContent = st.n ? `${fmt0.format((st.hunters / st.n) * 100)} %` : '–';
  insp.size.textContent = st.n ? fmt1.format(st.size) : '–';
  insp.sense.textContent = st.n ? fmt0.format(st.sense) : '–';
  insp.speed.textContent = st.n ? `${fmt0.format(st.speed * 100)} %` : '–';
  insp.pick.disabled = st.n === 0;
}

// ---------- Artenliste, Diagramm, Chronik ----------

function refreshSpeciesList() {
  const w = state.world;
  const list = w.livingSpecies();
  $('speciesCount').textContent = list.length ? `${list.length} lebend` : '';
  const ol = $('speciesList');
  ol.replaceChildren();
  if (!list.length) {
    ol.append(el('li', {}, el('p', { class: 'empty' }, 'Das Becken ist leer. Einwanderer sind unterwegs.')));
    return;
  }
  const max = list[0].count;
  for (const { clade, count } of list.slice(0, 9)) {
    const bar = el('span');
    bar.style.width = `${(count / max) * 100}%`;
    bar.style.background = cladeColor(clade);
    const b = el(
      'button',
      { type: 'button', 'data-clade': clade.id, 'aria-pressed': String(state.species === clade.id) },
      el('span', { class: 'name' }, clade.name),
      el('span', { class: 'n' }, String(count)),
      el('span', { class: 'track' }, bar),
    );
    ol.append(el('li', {}, b));
  }
  if (list.length > 9) ol.append(el('li', {}, el('p', { class: 'empty' }, `und ${list.length - 9} kleinere Arten`)));
}

function refreshChronicle() {
  const w = state.world;
  const ev = w.events;
  const key = `${ev.length}:${ev.length ? ev[ev.length - 1].t : 0}`;
  if (key === state.eventsShown) return;
  const firstRender = state.eventsShown === '';
  const prevLast = state.lastEventT ?? -1;
  state.eventsShown = key;
  const ol = $('chronicle');
  ol.replaceChildren();
  const recent = ev.slice(-60).reverse();
  for (const e of recent) {
    const what = el('span', { class: 'what' });
    for (const p of e.parts) {
      if (typeof p === 'string') what.append(p);
      else if (p.clade) {
        const clade = w.clades.get(p.clade);
        what.append(clade ? speciesButton(clade) : 'eine vergessene Art');
      } else if (p.creature) {
        const c = w.byId.get(p.creature);
        if (c) what.append(' ', el('button', { class: 'link', type: 'button', 'data-creature': c.id }, 'Ansehen'));
      }
    }
    const clk = w.clock(e.t);
    const when = el('span', { class: 'when' }, el('b', {}, `Tag ${clk.day}`), `${String(clk.hour).padStart(2, '0')}:${String(clk.minute).padStart(2, '0')}`);
    ol.append(el('li', { class: !firstRender && e.t > prevLast ? 'fresh' : '' }, when, what));
  }
  state.lastEventT = ev.length ? ev[ev.length - 1].t : -1;
}

function refreshCharts() {
  const w = state.world;
  if (state.view === 'pop') drawPopulation($('popChart'), w);
  else state.treeRows = drawTree($('treeChart'), w, state.species);
}

function refreshHud() {
  const w = state.world;
  const c = w.clock();
  $('clockText').textContent = `Tag ${c.day} · ${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
  $('sun').classList.toggle('night', w.isNight());
  $('hudPop').textContent = String(w.creatures.length);
  $('hudSpecies').textContent = String(w.livingSpecies().length);
  $('hudGen').textContent = String(w.records.maxGen);
}

function refreshPanels(force = false) {
  refreshHud();
  refreshSpeciesList();
  refreshChronicle();
  if (force) refreshCharts();
}

// ---------- Schleife ----------

function frame(now) {
  const w = state.world;
  if (!state.paused) {
    if (state.speed === 'max') {
      const start = performance.now();
      do w.step();
      while (performance.now() - start < 24);
    } else {
      for (let i = 0; i < state.speed; i++) w.step();
    }
    handleDeath();
  }
  state.renderer.draw(state.selected);
  updateInspector();
  if (now - state.lastPanel > 300) {
    state.lastPanel = now;
    refreshPanels();
  }
  if (now - state.lastChart > 1000) {
    state.lastChart = now;
    refreshCharts();
  }
  requestAnimationFrame(frame);
}

// ---------- Bedienung ----------

function setPaused(p) {
  state.paused = p;
  $('play').textContent = p ? 'Weiter' : 'Pause';
}

function setSpeed(s) {
  state.speed = s;
  for (const b of $('speeds').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.speed === String(s)));
  if (state.paused) setPaused(false);
}

function setTool(t) {
  state.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
  $('stage').classList.toggle('feeding', t === 'feed');
}

function wireControls() {
  $('play').addEventListener('click', () => setPaused(!state.paused));
  $('speeds').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-speed]');
    if (b) setSpeed(b.dataset.speed === 'max' ? 'max' : Number(b.dataset.speed));
  });
  $('newWorld').addEventListener('click', () => {
    startWorld(randomSeed());
    toast('Ein frisches Becken. Die ersten Siedler treiben ein.');
  });
  $('seedForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = $('seedInput').value.trim();
    if (!raw) return;
    const seed = /^\d{1,10}$/.test(raw) ? Number(raw) >>> 0 : seedFromText(raw);
    startWorld(seed);
    toast(`Welt aus Saat ${seed} gesät.`);
  });
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
  $('zoomIn').addEventListener('click', () => state.renderer.zoomAt(state.renderer.cssW / 2, state.renderer.cssH / 2, 1.5));
  $('zoomOut').addEventListener('click', () => state.renderer.zoomAt(state.renderer.cssW / 2, state.renderer.cssH / 2, 1 / 1.5));

  for (const b of document.querySelectorAll('[data-view]')) {
    b.addEventListener('click', () => {
      state.view = b.dataset.view;
      for (const o of document.querySelectorAll('[data-view]')) o.setAttribute('aria-pressed', String(o === b));
      $('popView').hidden = state.view !== 'pop';
      $('treeView').hidden = state.view !== 'tree';
      refreshCharts();
    });
  }
  $('treeChart').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientY - rect.top - 10) / TREE_ROW);
    const row = state.treeRows[i];
    if (row) {
      showSpecies(row.clade.id);
      refreshCharts();
    }
  });

  // Klicks auf Artnamen und "Ansehen"-Links überall im Journal.
  document.querySelector('.side').addEventListener('click', (e) => {
    const sp = e.target.closest('[data-clade]');
    if (sp) {
      const id = Number(sp.dataset.clade);
      if (state.species === id && sp.closest('#speciesList')) closeSpecies();
      else showSpecies(id);
      if (state.view === 'tree') refreshCharts();
      return;
    }
    const cr = e.target.closest('[data-creature]');
    if (cr) {
      const c = state.world.byId.get(Number(cr.dataset.creature));
      if (c) selectCreature(c);
    }
  });

  // Zeiger im Becken: antippen wählt, ziehen verschiebt, im Futtermodus wird gestreut.
  const canvas = $('world');
  let down = null;
  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const feed = (p) => {
    const wp = state.renderer.toWorld(p.x, p.y);
    state.world.addAlgae(wp.x, wp.y, 0.9, 2);
  };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    down = { ...p, last: p, moved: false, feed: state.tool === 'feed' || e.shiftKey };
    if (down.feed) feed(p);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down) return;
    const p = local(e);
    if (Math.hypot(p.x - down.x, p.y - down.y) > 5) down.moved = true;
    if (down.feed) feed(p);
    else if (down.moved) {
      state.renderer.pan(p.x - down.last.x, p.y - down.last.y);
      state.renderer.follow = null;
    }
    down.last = p;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const p = local(e);
    if (!down.moved && !down.feed) {
      const wp = state.renderer.toWorld(p.x, p.y);
      const c = state.world.creatureNear(wp.x, wp.y, 18 / state.renderer.scale);
      if (c) selectCreature(c);
    }
    down = null;
  });
  canvas.addEventListener('pointercancel', () => (down = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      state.renderer.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPaused(!state.paused);
    } else if (e.key === '1') setSpeed(1);
    else if (e.key === '2') setSpeed(4);
    else if (e.key === '3') setSpeed(16);
    else if (e.key === '4') setSpeed('max');
    else if (e.key === 'f' && state.selected?.alive) {
      state.renderer.follow = state.renderer.follow ? null : state.selected.id;
      buildInspector();
    } else if (e.key === 'Escape') {
      if (state.species != null) closeSpecies();
      else selectCreature(null);
    }
  });

  const ro = new ResizeObserver(() => {
    state.renderer.resize();
    refreshCharts();
  });
  ro.observe($('stage'));
  window.addEventListener('hashchange', () => {
    const s = seedFromHash();
    if (s !== null && s !== state.world.seed) startWorld(s);
  });
}

function boot() {
  // Das Standardbecken läuft schon ein paar Tage, damit es beim Öffnen belebt ist.
  const fromHash = seedFromHash();
  startWorld(fromHash ?? 20261125, fromHash === null ? 5 : 0);
  wireControls();
  refreshCharts();
  requestAnimationFrame(frame);
}

boot();

// Für Neugierige in der Konsole.
window.gezeiten = { state, PARAMS };
