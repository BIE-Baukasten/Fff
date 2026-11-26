// ANIMA habitat: real-time life, interaction, introspection, persistence.
import { World } from '../core/world.js';
import { Agent } from '../core/agent.js';
import { NEEDS, NEED_LABEL, SETPOINT, LESIONS, ACTIONS } from '../core/config.js';
import { keyLabel, emotion, mindReader, episodeLabel } from '../core/narrate.js';
import { conditioning, analgesia } from '../experiments/protocols.js';
import { Renderer } from './render.js';

const SAVE_KEY = 'anima.habitat.v1';
const TPS = 6; // simulated ticks per real second at 1×
const NAMES = ['Mira', 'Oli', 'Fenn', 'Juna', 'Kiro', 'Lumi', 'Pima', 'Ilo'];
const $ = id => document.getElementById(id);

let world, agent, renderer, speed = 1, tool = 'look', acc = 0, lastFrame = performance.now(), lastUtter = 0, lastPanel = 0, lastSave = 0;
const trail = [];

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }

function newLife(lesion = 'full', name) {
  const seed = (Date.now() % 100000) + 1;
  world = new World({ seed });
  agent = new Agent({ seed, lesion, world, name: name || NAMES[seed % NAMES.length] });
  agent.note(`${agent.name} ist geschlüpft.`);
  trail.length = 0; lastUtter = 0;
  renderer.resize(world); renderer.pos = null;
  save();
}
function serialise() { return JSON.stringify({ v: 1, savedAt: Date.now(), speed, world: world.toJSON(), agent: agent.toJSON() }); }
function save() { store(SAVE_KEY, serialise()); lastSave = performance.now(); }
function load(json) {
  const o = JSON.parse(json);
  world = World.fromJSON(o.world);
  agent = Agent.fromJSON(o.agent, world);
  renderer.resize(world); renderer.pos = null;
  return o;
}

function step(n) {
  for (let i = 0; i < n && agent.alive; i++) {
    agent.step(world); world.step();
  }
  const us = world.utterances;
  for (; lastUtter < us.length; lastUtter++) renderer.say(us[lastUtter].text, us[lastUtter].babble);
  if (us.length && lastUtter > us.length) lastUtter = us.length;
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if (agent.alive && speed > 0) {
    acc += dt * TPS * speed;
    const n = Math.min(400, Math.floor(acc)); acc -= n;
    if (n) step(n);
  }
  const snap = agent.snapshot(world);
  renderer.draw(world, agent, snap, dt);
  if (now - lastPanel > 220) { lastPanel = now; panels(snap); }
  if (now - lastSave > 15000) save();
  if (!agent.alive && $('overlay').hidden) showDeath();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ panels
function clock() {
  const T = world.t + world.timeOffset, day = Math.floor(T / world.dayLength) + 1, ph = world.phase() * 24;
  return `Tag ${day} · ${String(Math.floor(ph)).padStart(2, '0')}:${String(Math.floor((ph % 1) * 60)).padStart(2, '0')}`;
}
let activeTab = 'inner';
function panels(s) {
  s._episodes = { get: id => agent.mem.get(id) };
  $('name').textContent = agent.name;
  $('clock').textContent = clock() + (agent.lesion !== 'full' ? ` · ${LESIONS[agent.lesion].label}` : '');
  const em = emotion(s); $('mood').textContent = em.label; $('mood').dataset.tone = em.tone;
  if (activeTab === 'inner') inner(s);
  else if (activeTab === 'lang') lang();
  else if (activeTab === 'mem') diary();
  else if (activeTab === 'life') lifeStats(s);
}
function inner(s) {
  $('voice').innerHTML = mindReader(s, agent.lex).map(t => `<p>${esc(t)}</p>`).join('');
  const slots = [];
  for (let i = 0; i < agent.p.wsCapacity; i++) {
    const c = s.contents[i];
    if (!c) { slots.push('<div class="slot empty"><span>frei</span><span></span></div>'); continue; }
    const info = agent.ws.info.get(c.key);
    slots.push(`<div class="slot"><span>${esc(keyLabel(c.key, info))}</span><span class="bar"><i style="width:${Math.min(100, c.a * 55)}%"></i></span></div>`);
  }
  if (!agent.c.gw) slots.unshift('<p class="hint">Ohne globalen Arbeitsraum gibt es keine Auswahl: alles wird parallel und flüchtig verarbeitet.</p>');
  $('ws').innerHTML = (agent.c.gw ? slots : slots.slice(0, 7)).join('');
  $('pre').innerHTML = s.preconscious.filter(p => p.a > 0.08).map(p => `<span title="an der Schwelle zum Bewusstsein">${esc(keyLabel(p.key))}</span>`).join('');
  $('needs').innerHTML = NEEDS.map(k => {
    const v = s.h[k], sp = SETPOINT[k];
    const dev = k === 'temp' ? Math.abs(v - 0.5) * 2.5 : Math.max(0, (sp - v) / sp);
    const cls = dev > 0.6 ? 'crit' : dev > 0.3 ? 'low' : '';
    return `<div class="need"><span>${k === 'temp' ? 'Wärme' : NEED_LABEL[k]}</span><span class="bar"><i class="${cls}" style="width:${v * 100}%"></i><b style="left:${sp * 100}%"></b></span><span class="num">${Math.round(v * 100)}</span></div>`;
  }).join('');
  affectPlot(s);
  const ast = s.ast;
  $('att').innerHTML = [
    ['Aufmerksamkeit', ast.focus ? esc(keyLabel(ast.focus)) + ` <span class="pill">${Math.round(ast.strength * 100)} %</span>` : '—'],
    ['Selbstmodell sagt voraus', ast.predicted ? esc(keyLabel(ast.predicted)) + ` <span class="muted">(Treffer ${Math.round(ast.accuracy * 100)} %)</span>` : '—'],
    ['Erwartung (Pavlov)', `<span class="mono">${s.V.toFixed(2)}</span>`],
    ['Handlung', esc(s.action)],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const pr = s.probs || new Array(8).fill(0);
  const mx = Math.max(...pr, 0.01), ai = ACTIONS.indexOf(s.action);
  $('probs').innerHTML = pr.map((p, i) => `<div class="${i === ai ? 'on' : ''}" style="height:${Math.max(2, (p / mx) * 100)}%" title="${ACTIONS[i]}: ${Math.round(p * 100)} %"></div>`).join('');
}
function affectPlot(s) {
  const cv = $('affect'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  trail.push([s.affect.valence, s.affect.arousal]); if (trail.length > 90) trail.shift();
  const css = getComputedStyle(document.documentElement);
  const ink = css.getPropertyValue('--muted').trim(), acc2 = css.getPropertyValue('--accent').trim(), line = css.getPropertyValue('--line').trim();
  g.clearRect(0, 0, W, H);
  g.strokeStyle = line; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2, 10); g.lineTo(W / 2, H - 10); g.moveTo(10, H / 2); g.lineTo(W - 10, H / 2); g.stroke();
  g.fillStyle = ink; g.font = '20px "IBM Plex Sans", sans-serif';
  g.fillText('−', 14, H / 2 - 8); g.fillText('+', W - 28, H / 2 - 8); g.fillText('erregt', W / 2 + 8, 30); g.fillText('ruhig', W / 2 + 8, H - 16);
  const P = ([v, a]) => [W / 2 + v * (W / 2 - 18), H - 18 - a * (H - 36)];
  g.strokeStyle = acc2; g.globalAlpha = 0.35; g.lineWidth = 3; g.beginPath(); trail.forEach((p, i) => { const [x, y] = P(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.globalAlpha = 1;
  const [x, y] = P(trail[trail.length - 1]); g.fillStyle = acc2; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
}
function lang() {
  const known = agent.lex.known();
  $('lex').innerHTML = known.length ? known.map(w => `<tr><td><b>${esc(w.w)}</b></td><td class="mono">${w.n}</td><td class="mono">${w.said}</td><td>${w.meaning.map(([k, v]) => `${esc(keyLabel(k))} <span class="pill">${v.toFixed(2)}</span>`).join('<br>')}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">Noch keine Wörter. Sprich mit ihm, während es etwas erlebt.</td></tr>';
  const us = world.utterances.slice(-12).reverse();
  $('utter').innerHTML = us.length ? us.map(u => `<li><span class="mono muted">${tclock(u.t)}</span><span class="dot ${u.babble ? '' : 'pos'}"></span><span>${u.babble ? `<i>${esc(u.text)}</i> <span class="muted">(Plappern)</span>` : `<b>${esc(u.text)}</b> <span class="muted">→ ${esc(keyLabel(u.key))}</span>`}</span></li>`).join('') : '<li class="muted">Noch nichts gerufen.</li>';
}
function diary() {
  const notes = agent.log.map(n => ({ t: n.t, text: n.text, v: 0 }));
  const eps = agent.mem.episodes.filter(e => e.event && e.event.type !== 'notice').slice(-40).map(e => ({ t: e.t, text: episodeLabel(e) + (e.labels?.length ? ` – dabei im Sinn: ${e.keys.slice(0, 3).map(k => keyLabel(k)).join(', ')}` : ''), v: e.valence }));
  const all = notes.concat(eps).sort((a, b) => b.t - a.t).slice(0, 40);
  $('diary').innerHTML = all.length ? all.map(e => `<li><span class="mono muted">${tclock(e.t)}</span><span class="dot ${e.v > 0.15 ? 'pos' : e.v < -0.15 ? 'neg' : ''}"></span><span>${esc(e.text)}</span></li>`).join('') : '<li class="muted">Noch keine Erinnerungen.</li>';
  if (!agent.c.memory) $('diary').innerHTML = '<li class="muted">Diesem Wesen fehlt das episodische Gedächtnis.</li>' + $('diary').innerHTML;
}
function tclock(t) { const T = t + world.timeOffset, d = Math.floor(T / world.dayLength) + 1, h = ((T % world.dayLength) / world.dayLength) * 24; return `T${d} ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`; }
function lifeStats(s) {
  const st = agent.stats, days = (agent.body.age / world.dayLength).toFixed(1);
  $('lifeStats').innerHTML = [
    ['Architektur', LESIONS[agent.lesion].label], ['Alter', `${days} Tage (${agent.body.age} Zyklen)`],
    ['Beeren', `${st.eatenGood} bekömmlich, ${st.eatenToxic} giftig`], ['Getrunken', `${st.drinks}×`], ['Gerufen', `${st.calls}× (davon ${st.words} Wörter)`],
    ['Erinnerungen', agent.mem.episodes.length], ['Bekannte Wörter', agent.lex.known().length], ['Gedankenwandern bemerkt', `${agent.ast.driftCount}×`],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(String(v))}</dd>`).join('');
}
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ------------------------------------------------------------------ research tab
function study() {
  const S = window.__ANIMA_STUDY__;
  if (!S) { $('study').innerHTML = '<h3>Die Studie</h3><p class="muted">Ergebnisse der Markerstudie werden beim nächsten Build eingebettet.</p>'; return; }
  const conds = S.conditions;
  const head = `<tr><th>Marker</th>${conds.map(c => `<th title="${esc(S.labels[c])}">${esc(S.short[c])}</th>`).join('')}</tr>`;
  const rows = S.markers.map(m => `<tr><td>${esc(m.label)}</td>${conds.map(c => { const r = m.byCond[c]; return `<td class="${r.pass ? 'pass' : 'fail'}" title="${esc(r.text)}">${r.pass ? '●' : '○'}</td>`; }).join('')}</tr>`).join('');
  $('study').innerHTML = `<h3>Die Studie hinter diesem Wesen</h3>${S.intro}<div class="tablewrap"><table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div><p class="hint">● bestanden (95-%-KI schließt Null aus) · ○ nicht bestanden. N = ${S.n} Individuen. Spalten: Architekturvarianten; Zeilen: Verhaltensmarker aus der Tierbewusstseinsforschung.</p>${S.findings}`;
}
function runTest(kind) {
  const out = $('testOut');
  out.innerHTML = '<p class="muted">Läuft an einer Kopie …</p>';
  setTimeout(() => {
    try {
      let html;
      if (kind === 'analgesia') {
        const r = analgesia(agent, world, { pre: 500, cond: 2500, seed: agent.seed });
        html = `<p>Verletzt verbrachte die Kopie <b>${Math.round(r.injured_post * 100)} %</b> der Zeit am schmerzlindernden Ort (vorher ${Math.round(r.injured_pre * 100)} %), unverletzt <b>${Math.round(r.uninjured_post * 100)} %</b> (vorher ${Math.round(r.uninjured_pre * 100)} %).</p><p class="muted">Ein Marker für Empfindungsfähigkeit gilt als erfüllt, wenn nur das verletzte Tier den Ort bevorzugt.</p>`;
      } else {
        const r = conditioning(agent, world, { mode: kind, seed: agent.seed });
        const ok = r.cr > 0.05;
        html = `<p>${kind === 'trace' ? 'Spur' : 'Verzögerungs'}konditionierung: konditionierte Erwartung nach Ton minus Licht = <b class="mono">${r.cr.toFixed(2)}</b> → ${ok ? '<span class="pass">gelernt</span>' : '<span class="fail">nicht gelernt</span>'}.</p>${spark(r.curvePlus, r.curveMinus)}<p class="muted">${kind === 'trace' ? 'Zwischen Ton und Futter liegt eine Lücke von 18 Zyklen. Beim Menschen gelingt das nur mit bewusster Wahrnehmung (Clark & Squire 1998).' : 'Ton und Futter überlappen; das gelingt auch unbewusst.'}</p>`;
      }
      out.innerHTML = html;
    } catch (e) { out.innerHTML = `<p class="fail">Test fehlgeschlagen: ${esc(e.message)}</p>`; }
  }, 30);
}
function spark(a, b) {
  const W = 300, H = 70, mx = Math.max(0.05, ...a, ...b), mn = Math.min(0, ...a, ...b);
  const P = arr => arr.map((v, i) => `${(i / (arr.length - 1)) * W},${H - 6 - ((v - mn) / (mx - mn)) * (H - 12)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:340px;height:auto" role="img" aria-label="Erwartungsverlauf"><polyline points="${P(b)}" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 3"/><polyline points="${P(a)}" fill="none" stroke="var(--accent)" stroke-width="2.2"/></svg><p class="hint">Türkis: nach Ton (mit Futter gepaart) · gestrichelt: nach Licht (nie gepaart). Rechts endet die Kurve beim erwarteten Futter.</p>`;
}

// ------------------------------------------------------------------ interaction
function setupUI() {
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
    tool = b.dataset.tool; document.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('world').style.cursor = tool === 'hand' ? 'grab' : tool === 'look' ? 'default' : 'copy';
  }));
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => {
    speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  }));
  $('bell').addEventListener('click', () => world.ring('ton', 12, 1));
  $('lamp').addEventListener('click', () => world.ring('licht', 12, 1));
  $('speak').addEventListener('submit', e => {
    e.preventDefault(); const t = $('say').value.trim(); if (!t) return;
    const w = world.say(t); if (w.length) renderer.userSay(w.join(' ')); $('say').value = '';
  });
  const cv = $('world'); let down = false;
  cv.addEventListener('pointermove', e => {
    const [x, y] = renderer.cellAt(e, world);
    world.setHand(x, y, true, tool === 'hand' && down);
  });
  cv.addEventListener('pointerleave', () => { world.setHand(-1, -1, false, false); down = false; });
  cv.addEventListener('pointerdown', e => {
    const [x, y] = renderer.cellAt(e, world); down = true;
    if (tool === 'hand') { world.setHand(x, y, true, true); cv.setPointerCapture?.(e.pointerId); }
    else if (tool !== 'look') world.place(tool, x, y);
  });
  cv.addEventListener('pointerup', () => { down = false; world.hand.stroking = false; });
  cv.addEventListener('dblclick', e => { const [x, y] = renderer.cellAt(e, world); world.setHand(x, y, true, false); world.poke(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    activeTab = b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('[data-panel]').forEach(p => (p.hidden = p.dataset.panel !== activeTab));
    if (activeTab === 'lab') study();
    lastPanel = 0;
  }));
  document.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', () => runTest(b.dataset.test)));
  $('lesionSel').innerHTML = Object.entries(LESIONS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $('nameIn').value = agent.name;
  $('nameBtn').addEventListener('click', () => { const n = $('nameIn').value.trim(); if (n) { agent.name = n; save(); } });
  $('newBtn').addEventListener('click', () => { $('newConfirm').hidden = false; });
  $('newNo').addEventListener('click', () => { $('newConfirm').hidden = true; });
  $('newYes').addEventListener('click', () => { $('newConfirm').hidden = true; newLife($('lesionSel').value); $('nameIn').value = agent.name; });
  $('copySave').addEventListener('click', async () => {
    const txt = serialise();
    try { await navigator.clipboard.writeText(txt); $('copyMsg').textContent = 'Kopiert.'; }
    catch { $('importBox').value = txt; $('importBox').select(); $('copyMsg').textContent = 'Markiert – mit Strg/Cmd+C kopieren.'; }
  });
  $('importBtn').addEventListener('click', () => {
    try { load($('importBox').value); save(); $('importMsg').textContent = `${agent.name} geladen.`; $('nameIn').value = agent.name; }
    catch (e) { $('importMsg').textContent = 'Das ist kein gültiger Spielstand.'; }
  });
  $('ovBtn').addEventListener('click', () => {
    $('overlay').hidden = true;
    if (!agent.alive) newLife(agent.lesion);
  });
  addEventListener('resize', () => renderer.resize(world));
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}
function showDeath() {
  $('ovTitle').textContent = `${agent.name} ist gestorben`;
  $('ovText').textContent = `Ursache: ${agent.body.causeOfDeath}. ${agent.name} wurde ${(agent.body.age / world.dayLength).toFixed(1)} Tage alt, hat ${agent.lex.known().length} Wörter gelernt und ${agent.mem.episodes.length} Erinnerungen gebildet.`;
  $('ovBtn').textContent = 'Ein neues Wesen schlüpfen lassen';
  $('overlay').hidden = false;
}
function showMessage(title, text) { $('ovTitle').textContent = title; $('ovText').textContent = text; $('ovBtn').textContent = 'Weiter'; $('overlay').hidden = false; }

// ------------------------------------------------------------------ boot
function boot() {
  renderer = new Renderer($('world'));
  const saved = store(SAVE_KEY);
  let restored = null;
  if (saved) { try { restored = load(saved); } catch { restored = null; } }
  if (!restored) newLife('full');
  setupUI();
  if (restored) {
    // the organism kept living while the page was closed (up to ~one simulated day)
    const away = Math.max(0, (Date.now() - restored.savedAt) / 1000);
    const n = Math.min(world.dayLength, Math.floor(away * TPS));
    if (n > 30) {
      const before = { ...agent.stats };
      step(n);
      const d = k => agent.stats[k] - before[k];
      showMessage(`${agent.name} hat ohne dich weitergelebt`, agent.alive
        ? `${(n / world.dayLength * 24).toFixed(1)} Stunden seiner Zeit: ${d('eatenGood') + d('eatenToxic')} Beeren gegessen, ${d('drinks')}× getrunken, ${Math.round(d('sleepTicks') / world.dayLength * 24)} Stunden geschlafen, ${d('calls')}× gerufen.`
        : `Während du weg warst, ist ${agent.name} gestorben (${agent.body.causeOfDeath}).`);
      lastUtter = world.utterances.length;
    }
  }
  requestAnimationFrame(frame);
}
boot();
