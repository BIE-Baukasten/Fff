// Zeichnet das Becken: Algen als weiche Textur, Lichtflecken, Meeresschnee und die Wesen.

import { WORLD_W, WORLD_H, COLS, ROWS } from './world.js';

const TAU_R = Math.PI * 2;

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
    this.follow = null;
    this.highlight = null;
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.tex = document.createElement('canvas');
    this.tex.width = COLS;
    this.tex.height = ROWS;
    this.texCtx = this.tex.getContext('2d');
    this.img = this.texCtx.createImageData(COLS, ROWS);
    this.snow = [];
    for (let i = 0; i < 140; i++) {
      this.snow.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, z: 0.3 + Math.random() * 0.7, p: Math.random() * TAU_R });
    }
    this.resize();
  }

  setWorld(world) {
    this.world = world;
    this.follow = null;
    this.highlight = null;
    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 1 };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.dpr = dpr;
    this.clampCam();
  }

  // Maßstab: Bildschirmpixel (CSS) pro Welteinheit.
  get scale() {
    const fit = Math.max(this.cssW / WORLD_W, this.cssH / WORLD_H);
    return fit * this.cam.zoom;
  }

  clampCam() {
    const s = this.scale;
    const halfW = this.cssW / s / 2;
    const halfH = this.cssH / s / 2;
    this.cam.x = Math.min(WORLD_W - halfW, Math.max(halfW, this.cam.x));
    this.cam.y = Math.min(WORLD_H - halfH, Math.max(halfH, this.cam.y));
    if (halfW * 2 >= WORLD_W) this.cam.x = WORLD_W / 2;
    if (halfH * 2 >= WORLD_H) this.cam.y = WORLD_H / 2;
  }

  toWorld(sx, sy) {
    const s = this.scale;
    return { x: this.cam.x + (sx - this.cssW / 2) / s, y: this.cam.y + (sy - this.cssH / 2) / s };
  }

  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.cam.zoom = Math.min(8, Math.max(1, this.cam.zoom * factor));
    const after = this.toWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  pan(dx, dy) {
    const s = this.scale;
    this.cam.x -= dx / s;
    this.cam.y -= dy / s;
    this.clampCam();
  }

  paintAlgae(day) {
    const w = this.world;
    const d = this.img.data;
    for (let i = 0; i < w.algae.length; i++) {
      const a = Math.min(1.6, w.algae[i]);
      const L = w.light[i] * day;
      const k = i * 4;
      // Tiefsee → Seegras, aufgehellt durch Licht.
      d[k] = 6 + a * 34 + L * 22;
      d[k + 1] = 22 + a * 92 + L * 46;
      d[k + 2] = 34 + a * 34 + L * 58;
      d[k + 3] = 255;
    }
    this.texCtx.putImageData(this.img, 0, 0);
  }

  draw(selected) {
    const ctx = this.ctx;
    const w = this.world;
    const day = w.dayFactor();
    const night = Math.min(1, Math.max(0, (0.55 - day) / 0.35));

    if (this.follow) {
      const c = w.byId.get(this.follow);
      if (c) {
        this.cam.x += (c.x - this.cam.x) * 0.15;
        this.cam.y += (c.y - this.cam.y) * 0.15;
        this.clampCam();
      }
    }

    const s = this.scale;
    const ox = this.cssW / 2 - this.cam.x * s;
    const oy = this.cssH / 2 - this.cam.y * s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.paintAlgae(day);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.tex, ox, oy, WORLD_W * s, WORLD_H * s);

    // Lichtkegel von oben.
    ctx.globalCompositeOperation = 'lighter';
    for (const b of w.blobs) {
      const gx = ox + b.x * s;
      const gy = oy + b.y * s;
      const r = b.r * 1.3 * s;
      const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
      grad.addColorStop(0, `rgba(120, 190, 200, ${0.13 * day})`);
      grad.addColorStop(1, 'rgba(120, 190, 200, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Trübes Wasser: ein schlammiger Schleier.
    if (w.murk()) {
      ctx.fillStyle = 'rgba(46, 38, 20, 0.42)';
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }

    // Nacht legt sich übers Becken.
    if (night > 0) {
      ctx.fillStyle = `rgba(2, 6, 22, ${night * 0.55})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }

    // Meeresschnee.
    ctx.fillStyle = 'rgba(210, 235, 230, 0.35)';
    for (const p of this.snow) {
      if (!this.reducedMotion) {
        p.y += 0.12 * p.z;
        p.x += Math.sin(w.t * 0.01 + p.p) * 0.08;
        if (p.y > WORLD_H) p.y -= WORLD_H;
      }
      const sx = ox + p.x * s;
      const sy = oy + p.y * s;
      if (sx < -2 || sy < -2 || sx > this.cssW + 2 || sy > this.cssH + 2) continue;
      ctx.globalAlpha = 0.25 + 0.4 * p.z;
      ctx.fillRect(sx, sy, 1.2 * p.z + 0.3, 1.2 * p.z + 0.3);
    }
    ctx.globalAlpha = 1;

    // Biolumineszenz: nachts leuchten die Wesen.
    const hl = this.highlight;
    if (night > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      for (const c of w.creatures) {
        const sx = ox + c.x * s;
        const sy = oy + c.y * s;
        const r = c.g.size * s * 3.2;
        if (sx < -r || sy < -r || sx > this.cssW + r || sy > this.cssH + r) continue;
        const dim = hl && w.displayClade(c.clade)?.id !== hl ? 0.2 : 1;
        ctx.globalAlpha = night * 0.22 * dim;
        ctx.fillStyle = colorOf(c.g, 70, 55);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, TAU_R);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const c of w.creatures) this.drawCreature(c, ox, oy, s, hl);

    if (selected) {
      const c = selected.alive ? selected : null;
      if (c) {
        const sx = ox + c.x * s;
        const sy = oy + c.y * s;
        ctx.strokeStyle = 'rgba(240, 180, 94, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, c.g.size * s * 1.6 + 5, 0, TAU_R);
        ctx.stroke();
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = 'rgba(240, 180, 94, 0.45)';
        ctx.beginPath();
        ctx.arc(sx, sy, c.g.sense * s, 0, TAU_R);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  drawCreature(c, ox, oy, s, hl) {
    const ctx = this.ctx;
    const sx = ox + c.x * s;
    const sy = oy + c.y * s;
    const grow = Math.min(1, 0.55 + c.age / 400);
    const r = c.g.size * s * grow;
    if (sx < -r * 4 || sy < -r * 4 || sx > this.cssW + r * 4 || sy > this.cssH + r * 4) return;
    if (!this.reducedMotion) c.wiggle = (c.wiggle || 0) + 0.15 + c.thrust * 0.6;
    const dim = hl && this.world.displayClade(c.clade)?.id !== hl;
    ctx.globalAlpha = dim ? 0.22 : 1;

    const ca = Math.cos(c.a);
    const sa = Math.sin(c.a);
    const len = r * 1.5;
    const wid = r * 0.9;

    // Schwanzflosse.
    const sway = Math.sin(c.wiggle || 0) * 0.55;
    const tx = sx - ca * len * 0.9;
    const ty = sy - sa * len * 0.9;
    const ta = c.a + Math.PI + sway;
    ctx.fillStyle = colorOf(c.g, 55, 42);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(ta - 0.5) * r * 1.1, ty + Math.sin(ta - 0.5) * r * 1.1);
    ctx.lineTo(tx + Math.cos(ta + 0.5) * r * 1.1, ty + Math.sin(ta + 0.5) * r * 1.1);
    ctx.closePath();
    ctx.fill();

    // Körper.
    ctx.fillStyle = c.hurt > 0 ? '#ffc2b8' : colorOf(c.g, 68, 60);
    ctx.beginPath();
    ctx.ellipse(sx, sy, len, wid, c.a, 0, TAU_R);
    ctx.fill();

    // Rückenzeichnung zeigt die Energie: je satter, desto heller der Streifen.
    const fill = Math.max(0, Math.min(1, c.energy / c.maxE));
    ctx.fillStyle = `rgba(255, 255, 240, ${0.12 + fill * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(sx - ca * len * 0.15, sy - sa * len * 0.15, len * 0.55, wid * 0.32, c.a, 0, TAU_R);
    ctx.fill();

    // Auge.
    if (r > 2.2) {
      const ex = sx + ca * len * 0.55 - sa * wid * 0.35;
      const ey = sy + sa * len * 0.55 + ca * wid * 0.35;
      ctx.fillStyle = '#071018';
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(0.8, r * 0.18), 0, TAU_R);
      ctx.fill();
    }

    // Angriffslust: rote Kiefer.
    if (c.attacking) {
      ctx.strokeStyle = c.bite > 0 ? '#ffd0c4' : 'rgba(255, 122, 107, 0.9)';
      ctx.lineWidth = Math.max(1, r * 0.22);
      ctx.beginPath();
      ctx.arc(sx + ca * len * 0.7, sy + sa * len * 0.7, r * 0.6, c.a - 0.9, c.a + 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function colorOf(g, sat, light) {
  const key = `_c${sat}_${light}`;
  if (!g[key]) g[key] = `hsl(${g.hue.toFixed(0)} ${sat}% ${light}%)`;
  return g[key];
}

export function cladeColor(clade, sat = 68, light = 60) {
  return `hsl(${clade.hue.toFixed(0)} ${sat}% ${light}%)`;
}
