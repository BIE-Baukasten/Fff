// Canvas painting of the habitat and the organism.
import { T } from '../core/world.js';
import { DIRS, CHANNELS } from '../core/config.js';
import { hashString } from '../core/rng.js';

const C = {
  grass: ['#7fa35b', '#86aa60', '#7a9d57', '#8bae66'], pond: '#3f8fa0', pondDeep: '#2f7486', cave: '#4a4440', caveFloor: '#5b524b',
  rock: '#8d8a80', rockDark: '#6f6c64', thorn: '#5f4a32', thornSpike: '#c9b48a', bush: '#3f6e35', bushDark: '#30562a',
};
const berryColor = h => `hsl(${355 - h * 85}, 68%, ${46 - h * 6}%)`;

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.pos = null; this.bubbles = []; this.userBubble = null; this.t = 0; this.glow = 0;
  }
  resize(world) {
    const wrap = this.cv.parentElement.clientWidth || 900;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cell = Math.max(10, Math.floor(wrap / world.width));
    this.cv.width = world.width * this.cell * dpr; this.cv.height = world.height * this.cell * dpr;
    this.cv.style.aspectRatio = `${world.width} / ${world.height}`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg = null;
  }
  cellAt(ev, world) {
    const r = this.cv.getBoundingClientRect();
    const x = Math.floor(((ev.clientX - r.left) / r.width) * world.width), y = Math.floor(((ev.clientY - r.top) / r.height) * world.height);
    return [Math.max(0, Math.min(world.width - 1, x)), Math.max(0, Math.min(world.height - 1, y))];
  }
  _terrain(world) {
    const s = this.cell, key = world.terrain.join('');
    if (this.bg && this.bgKey === key) return this.bg;
    const off = document.createElement('canvas'); off.width = world.width * s; off.height = world.height * s;
    const g = off.getContext('2d');
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      const tr = world.terrainAt(x, y), hsh = hashString(`${x},${y}`);
      const px = x * s, py = y * s;
      g.fillStyle = C.grass[hsh % 4]; g.fillRect(px, py, s, s);
      if (tr === T.GRASS) { g.fillStyle = '#6d924c'; for (let k = 0; k < 3; k++) { const ox = ((hsh >> (k * 5)) % s), oy = ((hsh >> (k * 7 + 3)) % s); g.fillRect(px + ox, py + oy, 1.5, 3); } }
      else if (tr === T.POND) { g.fillStyle = (hsh % 3) ? C.pond : C.pondDeep; g.fillRect(px, py, s, s); }
      else if (tr === T.CAVE) { g.fillStyle = C.caveFloor; g.fillRect(px, py, s, s); g.fillStyle = '#00000022'; g.fillRect(px, py + s * 0.7, s, s * 0.3); }
      else if (tr === T.ROCK) {
        g.fillStyle = C.rockDark; g.beginPath(); g.roundRect(px + 1, py + 2, s - 2, s - 3, s * 0.3); g.fill();
        g.fillStyle = C.rock; g.beginPath(); g.roundRect(px + 2, py + 2, s - 5, s - 6, s * 0.3); g.fill();
      } else if (tr === T.THORN) {
        g.fillStyle = C.thorn; g.beginPath(); g.arc(px + s / 2, py + s / 2, s * 0.42, 0, 7); g.fill();
        g.strokeStyle = C.thornSpike; g.lineWidth = 1;
        for (let k = 0; k < 8; k++) { const a = k * 0.785 + (hsh % 10) * 0.1; g.beginPath(); g.moveTo(px + s / 2 + Math.cos(a) * s * 0.2, py + s / 2 + Math.sin(a) * s * 0.2); g.lineTo(px + s / 2 + Math.cos(a) * s * 0.5, py + s / 2 + Math.sin(a) * s * 0.5); g.stroke(); }
      }
    }
    this.bg = off; this.bgKey = key;
    return off;
  }
  draw(world, agent, snap, dt) {
    const g = this.ctx, s = this.cell; this.t += dt;
    g.clearRect(0, 0, world.width * s, world.height * s);
    g.drawImage(this._terrain(world), 0, 0);
    // pond shimmer
    g.strokeStyle = '#ffffff30'; g.lineWidth = 1;
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (world.terrainAt(x, y) === T.POND && (x * 7 + y * 3) % 5 === 0) {
      const o = Math.sin(this.t * 1.5 + x + y) * s * 0.15; g.beginPath(); g.moveTo(x * s + s * 0.2 + o, y * s + s * 0.5); g.lineTo(x * s + s * 0.6 + o, y * s + s * 0.5); g.stroke();
    }
    for (const o of world.objects) this._object(o, world);
    // the human hand
    if (world.hand.active) {
      g.fillStyle = world.hand.stroking ? '#ffe9c8aa' : '#ffffff40';
      g.beginPath(); g.arc(world.hand.x * s + s / 2, world.hand.y * s + s / 2, s * 0.62, 0, 7); g.fill();
    }
    this._creature(world, agent, snap, dt);
    // night
    const L = world.light();
    if (L < 0.85) { g.fillStyle = `rgba(8, 16, 40, ${(0.85 - L) * 0.62})`; g.fillRect(0, 0, world.width * s, world.height * s); }
    // cue indicators
    if (world.cueLevel('ton') > 0) this._badge('♪ Ton', 10, 10);
    if (world.cueLevel('licht') > 0) { g.fillStyle = '#fff6c040'; g.fillRect(0, 0, world.width * s, world.height * s); this._badge('Licht', 70, 10); }
    this._bubbles(world, agent, dt);
  }
  _badge(text, x, y) {
    const g = this.ctx; g.font = '600 12px "IBM Plex Sans", sans-serif';
    const w = g.measureText(text).width + 14;
    g.fillStyle = '#0d1410cc'; g.beginPath(); g.roundRect(x, y, w, 22, 11); g.fill(); g.fillStyle = '#f1f5f1'; g.fillText(text, x + 7, y + 15);
  }
  _object(o, world) {
    const g = this.ctx, s = this.cell, cx = o.x * s + s / 2, cy = o.y * s + s / 2;
    if (o.type === 'bush') {
      g.fillStyle = C.bushDark; g.beginPath(); g.arc(cx, cy + 1, s * 0.46, 0, 7); g.fill();
      g.fillStyle = C.bush; g.beginPath(); g.arc(cx - 1, cy - 1, s * 0.4, 0, 7); g.fill();
      for (let k = 0; k < o.berries; k++) {
        const a = k * 2.1 + o.id; g.fillStyle = berryColor(o.hueMean);
        g.beginPath(); g.arc(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2, s * 0.11, 0, 7); g.fill();
        g.fillStyle = '#ffffff55'; g.beginPath(); g.arc(cx + Math.cos(a) * s * 0.2 - 1, cy + Math.sin(a) * s * 0.2 - 1, s * 0.035, 0, 7); g.fill();
      }
    } else if (o.type === 'pellet') {
      g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(cx, cy, s * 0.22, s * 0.15, 0.3, 0, 7); g.fill();
      g.fillStyle = '#b07a43'; g.beginPath(); g.ellipse(cx - 1, cy - 1, s * 0.12, s * 0.07, 0.3, 0, 7); g.fill();
    } else if (o.type === 'bowl') {
      g.fillStyle = '#e4e8ea'; g.beginPath(); g.ellipse(cx, cy + 2, s * 0.38, s * 0.24, 0, 0, 7); g.fill();
      g.fillStyle = '#5aa6c4'; g.beginPath(); g.ellipse(cx, cy, s * 0.28 * Math.min(1, o.sips / 8 + 0.2), s * 0.14, 0, 0, 7); g.fill();
    } else if (o.type === 'toy') {
      if (o.moth) {
        const f = Math.abs(Math.sin(this.t * 14 + o.id)) * s * 0.22;
        g.fillStyle = '#f2eee0'; g.beginPath(); g.ellipse(cx - f / 2, cy, f / 1.2 + 1, s * 0.14, -0.4, 0, 7); g.ellipse(cx + f / 2, cy, f / 1.2 + 1, s * 0.14, 0.4, 0, 7); g.fill();
        g.fillStyle = '#5b5040'; g.fillRect(cx - 1, cy - s * 0.1, 2, s * 0.2);
      } else {
        g.fillStyle = `hsl(${o.hue * 360}, 70%, 55%)`; g.beginPath(); g.arc(cx, cy, s * 0.26, 0, 7); g.fill();
        g.strokeStyle = '#ffffffcc'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, s * 0.26, -0.6, 0.9); g.stroke();
      }
    }
  }
  _creature(world, agent, snap, dt) {
    const g = this.ctx, s = this.cell, b = agent.body;
    const tx = b.x * s + s / 2, ty = b.y * s + s / 2;
    if (!this.pos || Math.hypot(this.pos[0] - tx, this.pos[1] - ty) > s * 3) this.pos = [tx, ty];
    const k = Math.min(1, dt * 9); this.pos[0] += (tx - this.pos[0]) * k; this.pos[1] += (ty - this.pos[1]) * k;
    const [x, y] = this.pos;
    if (!b.alive) {
      g.fillStyle = '#9a9a92'; g.beginPath(); g.ellipse(x, y + s * 0.1, s * 0.42, s * 0.26, 0, 0, 7); g.fill(); return;
    }
    const v = snap.affect.valence, ar = snap.affect.arousal;
    const breathe = Math.sin(this.t * (b.sleeping ? 1.6 : 3 + ar * 5)) * 0.04;
    const R = s * (0.54 + breathe);
    if (snap.ignitions.length) this.glow = 1;
    this.glow *= Math.pow(0.1, dt);
    if (this.glow > 0.05) { g.strokeStyle = `rgba(63, 195, 189, ${this.glow * 0.8})`; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, R + 4 + (1 - this.glow) * 8, 0, 7); g.stroke(); }
    g.fillStyle = '#00000030'; g.beginPath(); g.ellipse(x, y + R * 0.85, R * 0.9, R * 0.25, 0, 0, 7); g.fill();
    const hue = 195 - v * 35, light = 70 + v * 6;
    const grd = g.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.1, x, y, R * 1.1);
    grd.addColorStop(0, `hsl(${hue}, 60%, ${light + 12}%)`); grd.addColorStop(1, `hsl(${hue + 20}, 45%, ${light - 18}%)`);
    g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, R * 1.05, R * (0.95 - breathe), 0, 0, 7); g.fill();
    if (b.pain > 0.15) { g.fillStyle = `rgba(220, 60, 70, ${Math.min(0.5, b.pain)})`; g.beginPath(); g.ellipse(x, y, R * 1.05, R * 0.95, 0, 0, 7); g.fill(); }
    // eyes follow the focus of attention
    const [fx, fy] = this._focusDir(world, agent, snap);
    const ex = R * 0.36, ey = -R * 0.18;
    for (const sgn of [-1, 1]) {
      const cx = x + sgn * ex, cy = y + ey;
      if (b.sleeping) { g.strokeStyle = '#26323a'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, R * 0.15, 0.2, Math.PI - 0.2); g.stroke(); continue; }
      const open = ar > 0.55 ? 1.15 : 1;
      g.fillStyle = '#fbfdfb'; g.beginPath(); g.ellipse(cx, cy, R * 0.2, R * 0.24 * open, 0, 0, 7); g.fill();
      g.fillStyle = '#1d2a30'; g.beginPath(); g.arc(cx + fx * R * 0.08, cy + fy * R * 0.09, R * 0.1, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + fx * R * 0.08 - 1.2, cy + fy * R * 0.09 - 1.2, R * 0.035, 0, 7); g.fill();
    }
    // mouth: valence
    g.strokeStyle = '#26323a'; g.lineWidth = 1.4; g.beginPath();
    g.moveTo(x - R * 0.18, y + R * 0.3); g.quadraticCurveTo(x, y + R * (0.3 + v * 0.25), x + R * 0.18, y + R * 0.3); g.stroke();
    if (b.sleeping) { g.fillStyle = '#e8eef8'; g.font = `600 ${Math.round(s * 0.45)}px "IBM Plex Sans", sans-serif`; g.fillText('z', x + R * 0.9, y - R * 0.9 - Math.sin(this.t * 2) * 3); }
  }
  _focusDir(world, agent, snap) {
    const f = snap.ast?.focus;
    const sense = agent._lastSense;
    if (f && f.startsWith('sense:') && sense) {
      const c = CHANNELS.indexOf(f.slice(6));
      if (c >= 0) { let best = -1, bv = 0; for (let d = 0; d < 4; d++) { const v = sense[c * 5 + 1 + d]; if (Math.abs(v) > bv) { bv = Math.abs(v); best = d; } } if (best >= 0) return DIRS[best]; }
    }
    if (f === 'touch' || f === 'sense:user' || (f && f.startsWith('word:'))) { const h = world.hand; if (h.active) { const dx = h.x - agent.body.x, dy = h.y - agent.body.y, n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; } return [0, -1]; }
    if (f && f.startsWith('obj:')) return [0, 0.8];
    if (f && f.startsWith('mem:')) return [0.7, -0.7];
    const p = snap.plan; if (p && agent.plan && agent.plan.dir >= 0) return DIRS[agent.plan.dir];
    return [0, 0];
  }
  say(text, babble) { this.bubbles.push({ text, babble, life: 3.2 }); if (this.bubbles.length > 2) this.bubbles.shift(); }
  userSay(text) { this.userBubble = { text, life: 3.5 }; }
  _bubbles(world, agent, dt) {
    const g = this.ctx, s = this.cell;
    const [x, y] = this.pos || [0, 0];
    this.bubbles = this.bubbles.filter(b => (b.life -= dt) > 0);
    this.bubbles.forEach((b, i) => {
      g.font = `${b.babble ? 'italic 500' : '600'} 14px "IBM Plex Sans", sans-serif`;
      const w = g.measureText(b.text).width + 16, bx = Math.min(world.width * s - w - 4, Math.max(4, x - w / 2)), by = Math.max(4, y - s * 1.3 - 26 - i * 28);
      g.globalAlpha = Math.min(1, b.life * 2);
      g.fillStyle = '#fbfdfb'; g.beginPath(); g.roundRect(bx, by, w, 24, 12); g.fill();
      g.fillStyle = b.babble ? '#5a6a60' : '#0d5f5d'; g.fillText(b.text, bx + 8, by + 16.5);
      g.globalAlpha = 1;
    });
    if (this.userBubble && (this.userBubble.life -= dt) > 0) {
      const ub = this.userBubble, h = world.hand;
      g.font = '500 13px "IBM Plex Sans", sans-serif';
      const w = g.measureText('»' + ub.text + '«').width + 16;
      const bx = h.active ? Math.min(world.width * s - w - 4, h.x * s) : 8, by = h.active ? Math.max(4, h.y * s - 34) : world.height * s - 34;
      g.globalAlpha = Math.min(1, ub.life * 2); g.fillStyle = '#1b2520e0'; g.beginPath(); g.roundRect(bx, by, w, 24, 6); g.fill();
      g.fillStyle = '#f1f5f1'; g.fillText('»' + ub.text + '«', bx + 8, by + 16.5); g.globalAlpha = 1;
    }
  }
}
