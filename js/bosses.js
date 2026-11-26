/* Luma Rush — boss (communs au RUN MODE et au BATTLE MODE) et dangers qu'ils génèrent. */
'use strict';
(function (LR) {
  const D = LR.D, E = LR.E, B = (LR.B = {});
  const { rand, rgba, rr, glowAt } = E;

  // ───────────── Dangers ─────────────
  // orb : projectile ; beam : rayon horizontal (avec préavis) ; strike : colonne au sol (avec préavis) ; wave : onde au sol.
  const hz = (B.hz = []);
  B.clear = () => { hz.length = 0; };
  B.orb = (x, a, vx, va, o = {}) => hz.push(Object.assign({ k: 'orb', x, a, vx, va, g: 0, r: 9, col: '#ff3e6c', life: 6 }, o));
  B.beam = (a0, a1, tele, act, col, x0 = -40, x1 = 9999) => hz.push({ k: 'beam', a0, a1, x0, x1, tele, act, col, t: 0 });
  B.strike = (x, w, tele, act, col, h = 2000, anchored = true) => hz.push({ k: 'strike', x, w, h, tele, act, col, t: 0, anchored });
  B.wave = (x, dir, sp, h, col, anchored = true) => hz.push({ k: 'wave', x, dir, sp, h, w: 26, col, anchored, life: 5 });
  B.stepHazards = function (dt, dx, mode) {
    for (let i = hz.length - 1; i >= 0; i--) {
      const h = hz[i];
      if (h.k === 'orb') {
        h.va -= h.g * dt; h.x += h.vx * dt; h.a += h.va * dt;
        if (h.roll && h.a <= h.r) { h.a = h.r; h.va = 0; h.vx = h.roll; }
        if (h.bounce && h.a <= h.r) { h.a = h.r; h.va = Math.abs(h.va) * 0.6; }
        if (mode === 'run' && h.anchored) h.x -= dx;
        h.life -= dt;
        if (h.life <= 0 || h.x < -80 || h.x > E.VW + 200 || h.a < -40 || h.a > 1400) hz.splice(i, 1);
      } else if (h.k === 'beam' || h.k === 'strike') {
        h.t += dt; if (h.anchored && mode === 'run') h.x -= dx;
        if (h.t > h.tele + h.act) hz.splice(i, 1);
      } else if (h.k === 'wave') {
        h.x += h.dir * h.sp * dt - (h.anchored && mode === 'run' ? dx : 0); h.life -= dt;
        if (h.life <= 0 || h.x < -60 || h.x > E.VW + 60) hz.splice(i, 1);
      }
    }
  };
  // Renvoie le danger qui touche la boîte du joueur ({x,y,w,h} en altitude), ou null.
  B.hitTest = function (pb) {
    for (const h of hz) {
      if (h.k === 'orb') {
        const cx = Math.max(pb.x, Math.min(h.x, pb.x + pb.w)), cy = Math.max(pb.y, Math.min(h.a, pb.y + pb.h));
        if ((cx - h.x) ** 2 + (cy - h.a) ** 2 < h.r * h.r) return h;
      } else if (h.k === 'beam') {
        if (h.t > h.tele && pb.y < h.a1 && pb.y + pb.h > h.a0 && pb.x + pb.w > h.x0 && pb.x < h.x1) return h;
      } else if (h.k === 'strike') {
        if (h.t > h.tele && pb.x + pb.w > h.x - h.w / 2 && pb.x < h.x + h.w / 2 && pb.y < h.h) return h;
      } else if (h.k === 'wave') {
        if (pb.x + pb.w > h.x - h.w / 2 && pb.x < h.x + h.w / 2 && pb.y < h.h) return h;
      }
    }
    return null;
  };
  B.drawHazards = function (g, clock) {
    const GY = E.GY;
    for (const h of hz) {
      if (h.k === 'orb') {
        const y = GY - h.a;
        glowAt(g, h.col, h.x, y, h.r * 3, 0.9);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(h.x, y, h.r * 0.55, 0, Math.PI * 2); g.fill();
        if (h.bone) { g.save(); g.translate(h.x, y); g.rotate(clock * 12); g.fillStyle = '#f2ead2'; g.fillRect(-h.r, -2.5, h.r * 2, 5); g.beginPath(); g.arc(-h.r, 0, 4, 0, 7); g.arc(h.r, 0, 4, 0, 7); g.fill(); g.restore(); }
      } else if (h.k === 'beam') {
        const y0 = GY - h.a1, hh = h.a1 - h.a0, x0 = Math.max(-20, h.x0), x1 = Math.min(E.VW + 20, h.x1);
        if (h.t < h.tele) {
          const k = Math.floor(h.t * 10) % 2;
          g.strokeStyle = rgba(h.col, 0.35 + 0.4 * k); g.lineWidth = 2; g.setLineDash([10, 8]);
          g.strokeRect(x0, y0, x1 - x0, hh); g.setLineDash([]);
          g.fillStyle = rgba(h.col, 0.08); g.fillRect(x0, y0, x1 - x0, hh);
        } else {
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = rgba(h.col, 0.35); g.fillRect(x0, y0, x1 - x0, hh);
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x0, y0 + hh * 0.4, x1 - x0, Math.max(2, hh * 0.2));
          g.globalCompositeOperation = 'source-over';
        }
      } else if (h.k === 'strike') {
        if (h.t < h.tele) {
          const p = h.t / h.tele;
          g.strokeStyle = rgba(h.col, 0.5 + 0.5 * Math.abs(Math.sin(p * 20))); g.lineWidth = 2;
          g.beginPath(); g.ellipse(h.x, GY + 2, h.w * (0.9 - p * 0.3), 6, 0, 0, Math.PI * 2); g.stroke();
          g.fillStyle = rgba(h.col, 0.9); g.font = `900 16px ${E.FONT}`; g.textAlign = 'center'; g.fillText('!', h.x, GY - 10);
        } else {
          const top = Math.max(-20, GY - h.h), f = 1 - (h.t - h.tele) / h.act;
          g.globalCompositeOperation = 'lighter';
          g.fillStyle = rgba(h.col, 0.5 * f); g.fillRect(h.x - h.w / 2, top, h.w, GY - top);
          g.fillStyle = `rgba(255,255,255,${0.8 * f})`; g.fillRect(h.x - h.w / 6, top, h.w / 3, GY - top);
          g.globalCompositeOperation = 'source-over';
        }
      } else if (h.k === 'wave') {
        glowAt(g, h.col, h.x, GY - h.h / 2, h.h, 0.8);
        g.fillStyle = rgba(h.col, 0.85); g.beginPath(); g.moveTo(h.x - h.w / 2, GY); g.quadraticCurveTo(h.x, GY - h.h * 2, h.x + h.w / 2, GY); g.fill();
      }
    }
  };

  // ───────────── Boss ─────────────
  const SIZE = { omega: [120, 90], roios: [64, 98], nuee: [110, 60], magma: [110, 120], eclipse: [90, 110], neant: [50, 92] };
  const FLY = { omega: 1, nuee: 1, eclipse: 1, neant: 1 };
  B.create = function (def, mode, scale, aggr = 1) {
    const hp = Math.round((mode === 'run' ? def.runHp : def.hp) * scale);
    return { def, id: def.id, mode, scale, aggr, next: null, last: -1, windup: 0, hp, maxHp: hp, x: E.VW + 160, alt: FLY[def.id] ? 160 : 0, vx: 0, va: 0, t: 0, phase: 0, atkT: 2.2,
      state: 'enter', hurt: 0, facing: -1, queue: [], swoop: null, dark: false, dmgTaken: 0, w: SIZE[def.id][0], h: SIZE[def.id][1], deathT: 0 };
  };
  B.box = b => ({ x: b.x - b.w / 2, y: b.alt + (FLY[b.id] ? -b.h / 2 : 0), w: b.w, h: b.h });
  B.center = b => ({ x: b.x, a: b.alt + (FLY[b.id] ? 0 : b.h / 2) });
  // Inflige des dégâts ; change de phase à 60 % et 30 %. Renvoie true si le boss tombe.
  B.damage = function (b, n) {
    if (b.state !== 'fight' || n <= 0) return false;
    b.hp = Math.max(0, b.hp - n); b.hurt = 0.12; b.dmgTaken += n;
    const r = b.hp / b.maxHp, ph = r <= 0.3 ? 2 : r <= 0.6 ? 1 : 0;
    if (ph > b.phase) {
      b.phase = ph; b.queue.length = 0; b.atkT = 1.2;
      LR.E.sfx('alarm'); LR.E.shake(8, 0.4);
      b.next = null; b.windup = 0;
      LR.UI.banner(ph === 2 ? 'RAGE FINALE' : 'PHASE 2', b.def.name, b.def.col);
      if (b.id === 'nuee') b.dark = true;
    }
    if (b.hp <= 0) { b.state = 'dead'; b.deathT = 0; B.clear(); return true; }
    return false;
  };
  const later = (b, t, fn) => b.queue.push({ t, fn });

  // ctx : { mode, px, pa (centre du joueur), VW, summon(type, x) }
  const WINDUP = 0.5;
  // Distance préférée de chaque attaque (même ordre que ATTACKS) : en BATTLE, le boss adapte son choix à la position du joueur.
  const PREF = {
    omega: ['any', 'far', 'any'], roios: ['far', 'near', 'any', 'any'], nuee: ['near', 'far', 'any'],
    magma: ['far', 'any', 'near'], eclipse: ['any', 'far', 'near'], neant: ['any', 'near', 'near', 'any', 'any'],
  };
  function choose(b, c) {
    const d = Math.abs(c.px - b.x);
    const weights = PREF[b.id].map(p => (b.mode !== 'battle' || p === 'any' ? 1.5 : (p === 'near') === (d < 240) ? 3 : 0.5));
    return LR.I.pickAttack(ATTACKS[b.id].length, b.last, weights, Math.random);
  }
  const ATTACKS = {
    omega: [
      (b, c) => { const n = b.phase ? 5 : 3; for (let i = 0; i < n; i++) later(b, i * 0.22, () => aimed(b, c, 440 + b.phase * 60, b.def.col, i)); },
      (b, c) => beamAt(b, c, b.def.col2, 0.9 - b.phase * 0.1, 0.45),
      (b, c) => { if (b.phase) later(b, 0.7, () => beamAt(b, c, b.def.col2, 0.8, 0.4)); c.summon(c.mode === 'run' ? 'droneLo' : 'drone', b.x); if (b.phase) later(b, 0.5, () => c.summon(c.mode === 'run' ? 'droneLo' : 'drone', b.x)); },
    ],
    roios: [
      (b, c) => { const n = 3 + b.phase; for (let i = 0; i < n; i++) later(b, i * 0.3, () => bone(b, c, i)); },
      (b, c) => { slam(b, c, '#9dff8a'); if (b.phase) later(b, 0.6, () => slam(b, c, '#9dff8a')); },
      (b, c) => { c.summon(c.mode === 'run' ? 'skel' : 'skel', b.x); if (b.phase) later(b, 0.6, () => c.summon('skel', b.x)); },
      (b, c) => { if (!b.phase) return slam(b, c, '#9dff8a'); rain(b, c, 3 + b.phase, '#e8e0c8'); },
    ],
    nuee: [
      (b, c) => { b.swoop = { t: 0, from: b.x, fa: b.alt, ta: c.mode === 'run' ? 56 : c.pa, tx: c.mode === 'run' ? -120 : c.px }; LR.E.sfx('dash'); },
      (b, c) => { for (let i = 0; i < 3 + b.phase; i++) later(b, i * 0.35, () => sonic(b, c, i)); },
      (b, c) => { for (let i = 0; i < 2 + b.phase; i++) later(b, i * 0.3, () => c.summon('bat', b.x)); },
    ],
    magma: [
      (b, c) => { for (let i = 0; i < 2 + b.phase; i++) later(b, i * 0.35, () => fireball(b, c, i)); },
      (b, c) => rain(b, c, 3 + b.phase, b.def.col),
      (b, c) => { if (c.mode === 'run') { B.orb(b.x - 60, 22, -(260 + c.speed), 0, { r: 20, col: b.def.col, anchored: false }); } else charge(b, c); },
    ],
    eclipse: [
      (b, c) => { const lanes = c.mode === 'run' ? [[0, 28], [30, 70]] : [[0, 40], [60, 110], [130, 200]]; let i = Math.floor(rand(0, lanes.length)); for (let k = 0; k < 3 + b.phase; k++) { const L = lanes[(i + k) % lanes.length]; later(b, k * 0.75, () => B.beam(L[0], L[1], 0.6, 0.3, k % 2 ? b.def.col : b.def.col2)); } },
      (b, c) => { const n = 5 + b.phase * 2; for (let i = 0; i < n; i++) { const a = c.mode === 'run' ? 0 : Math.PI + (i / (n - 1) - 0.5) * 1.6; if (c.mode === 'run') { if (i % 2) B.orb(b.x - 40, i % 4 === 1 ? 16 : 52, -460 - i * 25, 0, { col: i % 2 ? b.def.col : b.def.col2 }); } else B.orb(b.x, b.alt, Math.cos(a) * 380, Math.sin(-a) * 380, { col: b.def.col2 }); } },
      (b, c) => { if (c.mode === 'battle') { b.x = rand(120, E.VW - 120); b.alt = rand(140, 220); LR.E.emit(b.x, E.GY - b.alt, 30, { c: b.def.col, sp: 300, life: 0.5, size: 10 }); } else beamAt(b, c, b.def.col, 0.7, 0.35); },
    ],
    neant: [
      (b, c) => ATTACKS.omega[0](b, c), (b, c) => ATTACKS.roios[1](b, c), (b, c) => ATTACKS.nuee[0](b, c), (b, c) => ATTACKS.eclipse[0](b, c), (b, c) => ATTACKS.magma[1](b, c),
    ],
  };
  function aimed(b, c, sp, col, i) {
    if (c.mode === 'run') { const low = i % 2 === 0; B.orb(b.x - 50, low ? 18 : 48, -sp - 60, 0, { col }); return; }
    const dx = c.px - b.x, da = c.pa - b.alt, d = Math.hypot(dx, da) || 1;
    B.orb(b.x, b.alt, (dx / d) * sp, (da / d) * sp, { col });
  }
  function beamAt(b, c, col, tele, act) {
    if (c.mode === 'run') { const high = Math.random() < 0.5; B.beam(high ? 30 : 0, high ? 80 : 28, tele, act, col); }
    else { const a = Math.max(0, c.pa - 24); B.beam(a, a + 48, tele, act, col); }
  }
  function bone(b, c, i) {
    if (c.mode === 'run') B.orb(b.x - 40, b.alt + 60, -220 - i * 40, 420, { g: 1400, r: 10, roll: -260 - c.speed * 0.1, anchored: true, bone: true, col: '#e8e0c8' });
    else { const tx = c.px + rand(-60, 60), T = 1.1, vx = (tx - b.x) / T; B.orb(b.x, b.alt + b.h, vx, 0.5 * 1400 * T - (b.alt + b.h) / T, { g: 1400, r: 10, bone: true, col: '#e8e0c8' }); }
  }
  function slam(b, c, col) {
    LR.E.shake(9, 0.3); LR.E.sfx('boom');
    if (c.mode === 'run') B.wave(b.x - 40, -1, 320 + c.speed, 28 + b.phase * 4, col, false);
    else { B.wave(b.x - 30, -1, 360, 30, col, false); B.wave(b.x + 30, 1, 360, 30, col, false); }
  }
  function rain(b, c, n, col) {
    for (let i = 0; i < n; i++) {
      // RUN : colonnes basses (sautables) qui atteignent le joueur au milieu de leur phase active, espacées de 0,8 s.
      if (c.mode === 'run') { const x = E.PX + c.speed * (1.05 + i * 0.8); later(b, 0, () => B.strike(x, 34, 0.9, 0.35, col, 62)); continue; }
      const x = Math.max(40, Math.min(E.VW - 40, c.px + (i - (n - 1) / 2) * 110 + rand(-20, 20)));
      later(b, i * 0.12, () => B.strike(x, 40, 0.9, 0.35, col));
    }
  }
  function sonic(b, c, i) {
    if (c.mode === 'run') B.orb(b.x - 50, i % 2 ? 50 : 16, -420, 0, { r: 13, col: b.def.col });
    else { const dir = c.px < b.x ? -1 : 1; B.orb(b.x, c.pa + (i % 2 ? 30 : -10), dir * 380, 0, { r: 13, col: b.def.col }); }
  }
  function fireball(b, c, i) {
    const tx = c.mode === 'run' ? E.PX + 260 + i * 130 + c.speed * 0.8 : c.px + rand(-80, 80), T = 1.0;
    B.orb(b.x, b.alt + b.h * 0.7, (tx - b.x) / T - (c.mode === 'run' ? c.speed * 0.2 : 0), 0.5 * 1400 * T - (b.alt + b.h * 0.7) / T, { g: 1400, r: 11, col: '#ff6a1e', fire: tx });
  }
  function charge(b, c) { b.charge = { t: 0, dir: c.px < b.x ? -1 : 1 }; LR.E.sfx('alarm'); }

  // Mise à jour d'un boss. En RUN, il reste à droite de l'écran ; en BATTLE, il se déplace dans l'arène.
  B.update = function (b, dt, c) {
    b.t += dt; if (b.hurt > 0) b.hurt -= dt;
    const VW = E.VW, fly = FLY[b.id], homeX = c.mode === 'run' ? VW - 140 : null;
    if (b.state === 'dead') { b.deathT += dt; if (Math.random() < 0.5) LR.E.emit(b.x + rand(-b.w / 2, b.w / 2), E.GY - b.alt - rand(0, b.h), 2, { c: b.def.col, sp: 300, life: 0.6, size: 12 }); return; }
    if (b.state === 'enter') {
      const tx = c.mode === 'run' ? homeX : VW * 0.72;
      b.x += (tx - b.x) * Math.min(1, dt * 2);
      if (Math.abs(b.x - tx) < 6) { b.state = 'fight'; b.atkT = 1.4; }
      return;
    }
    // Déplacement
    if (b.swoop) {
      const s = b.swoop; s.t += dt;
      const p = Math.min(1, s.t / 1.3), back = p > 0.5;
      b.x = back ? s.tx + (s.from - s.tx) * ((p - 0.5) * 2) : s.from + (s.tx - s.from) * (p * 2);
      b.alt = back ? s.ta + (s.fa - s.ta) * ((p - 0.5) * 2) : s.fa + (s.ta - s.fa) * Math.sin(p * Math.PI);
      if (p >= 1) { b.swoop = null; b.x = s.from; b.alt = s.fa; }
    } else if (b.charge) {
      const ch = b.charge; ch.t += dt;
      if (ch.t > 0.6) b.x += ch.dir * 620 * dt;
      if (b.x < 60 || b.x > VW - 60 || ch.t > 2.4) { b.x = Math.max(60, Math.min(VW - 60, b.x)); b.charge = null; LR.E.shake(10, 0.3); LR.E.sfx('boom'); }
    } else if (c.mode === 'run') {
      b.x += (homeX - b.x) * Math.min(1, dt * 3);
      b.alt = (fly ? 150 : 70) + Math.sin(b.t * 1.6) * 14;
    } else if (fly) {
      b.x += (VW * (0.5 + 0.32 * Math.sin(b.t * 0.45)) - b.x) * Math.min(1, dt * 1.5);
      b.alt += ((b.id === 'neant' ? 120 : 190) + Math.sin(b.t * 1.3) * 20 - b.alt) * Math.min(1, dt * 2);
    } else {
      const dir = Math.sign(c.px - b.x);
      if (Math.abs(c.px - b.x) > 140) b.x += dir * 55 * b.scale * dt;
      b.alt = 0;
    }
    b.facing = c.mode === 'run' ? -1 : c.px < b.x ? -1 : 1;
    // Attaques
    for (let i = b.queue.length - 1; i >= 0; i--) { const q = b.queue[i]; if ((q.t -= dt) <= 0) { b.queue.splice(i, 1); q.fn(); } }
    for (const h of hz) if (h.fire != null && h.k === 'orb' && h.a <= h.r + 2) { B.strike(h.x, 34, 0.05, c.mode === 'run' ? 0.6 : 0.9, '#ff6a1e', c.mode === 'run' ? 64 : 120, c.mode === 'run'); h.life = 0; }
    if (b.swoop || b.charge) return;
    b.atkT -= dt * (1 + 0.25 * b.phase) * b.aggr;
    // L'attaque suivante est choisie avant d'être lancée : le boss l'annonce, le joueur a le temps de réagir.
    if (b.next === null && b.atkT <= WINDUP) { b.next = choose(b, c); b.windup = Math.max(0.01, b.atkT); LR.E.sfx('windup'); }
    if (b.windup > 0) b.windup = Math.max(0, b.windup - dt);
    if (b.atkT <= 0) {
      const k = b.next === null ? choose(b, c) : b.next;
      ATTACKS[b.id][k](b, c); b.last = k; b.next = null; b.windup = 0;
      b.atkT = b.id === 'neant' ? 1.7 : 2.3;
    }
  };
  // Le corps du boss blesse-t-il le joueur ? (piqués, charges, contact en BATTLE)
  B.bodyHits = (b, pb) => b.state === 'fight' && (b.mode === 'battle' || b.swoop) && D.overlap(pb, B.box(b));

  // ───────────── Dessin des boss ─────────────
  B.draw = function (g, b, clock) {
    const GY = E.GY, cy = GY - b.alt - (FLY[b.id] ? 0 : b.h / 2), x = b.x, col = b.def.col, col2 = b.def.col2;
    const fade = b.state === 'dead' ? Math.max(0, 1 - b.deathT / 1.6) : 1;
    if (fade <= 0) return;
    g.save(); g.globalAlpha = fade;
    if (b.hurt > 0) g.globalAlpha *= 0.6;
    glowAt(g, col, x, cy, b.w * 1.1, 0.35 + 0.1 * Math.sin(clock * 3));
    if (!FLY[b.id] && b.mode === 'run') { // plateforme de faille sous les boss terrestres en RUN
      g.fillStyle = rgba(col2, 0.25); g.beginPath(); g.ellipse(x, GY - b.alt + 6, b.w * 0.7, 10, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(col2, 0.8); g.lineWidth = 2; g.stroke();
    }
    const fn = DRAW[b.id];
    if (b.windup > 0 && b.state === 'fight') { // annonce : le boss se contracte et un anneau se referme
      const k = b.windup / WINDUP;
      g.strokeStyle = rgba('#ffffff', 0.85 - k * 0.5); g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, cy, b.w * 0.55 + 46 * k, 0, Math.PI * 2); g.stroke();
      g.fillStyle = col; g.font = `900 22px ${E.FONT}`; g.textAlign = 'center'; g.fillText('!', x, cy - b.h / 2 - 22);
      const sq = 1 + 0.06 * Math.sin(clock * 40);
      g.translate(x, cy); g.scale(sq, 2 - sq); g.translate(-x, -cy);
    }
    fn(g, b, x, cy, clock, col, col2);
    g.restore();
  };
  const DRAW = {
    omega(g, b, x, y, t, col, col2) {
      g.save(); g.translate(x, y);
      g.strokeStyle = rgba(col2, 0.6); g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 70, 18, Math.sin(t) * 0.2, 0, Math.PI * 2); g.stroke();
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.lineTo(Math.cos(a) * 46, Math.sin(a) * 40); } g.closePath();
      const gr = g.createLinearGradient(0, -40, 0, 40); gr.addColorStop(0, E.M2); gr.addColorStop(1, E.M1); g.fillStyle = gr; g.fill(); g.strokeStyle = col; g.lineWidth = 3; g.stroke();
      for (const s of [-1, 1]) { rr(g, s * 52 - 10, -10, 20, 26, 5); g.fillStyle = E.M2; g.fill(); g.stroke(); glowAt(g, col2, s * 52, 22, 14, 0.8); }
      g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fillStyle = '#0a0418'; g.fill();
      const ex = Math.sin(t * 2) * 6; glowAt(g, b.phase ? '#ff2e4c' : col, ex, 0, 26, 1); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, 0, 6, 0, Math.PI * 2); g.fill();
      g.restore();
    },
    roios(g, b, x, y, t, col, col2) {
      const feet = y + b.h / 2, moving = b.mode === 'battle' && !b.charge;
      E.drawSprite(g, 'skel', b.queue.length ? 'attack' : moving ? 'run' : 'idle', Math.floor(t * 7), x, feet, { scale: 2, facing: b.facing, tint: b.phase === 2 ? '#9dff8a' : null });
      const hx = x + b.facing * 2, hy = feet - 96; // couronne et yeux
      g.fillStyle = E.GOLD; g.beginPath(); g.moveTo(hx - 16, hy + 6); g.lineTo(hx - 16, hy - 8); g.lineTo(hx - 8, hy); g.lineTo(hx, hy - 12); g.lineTo(hx + 8, hy); g.lineTo(hx + 16, hy - 8); g.lineTo(hx + 16, hy + 6); g.closePath(); g.fill();
      glowAt(g, col2, hx, hy + 20, 18, 0.7 + 0.3 * Math.sin(t * 6));
    },
    nuee(g, b, x, y, t, col) {
      E.drawSprite(g, 'bat', b.swoop ? 'attack' : 'run', Math.floor(t * 12), x, y + 32, { scale: 2.6, facing: b.facing, tint: '#d9c2ff', tintMode: 'soft' });
      for (const s of [-1, 1]) { glowAt(g, '#ff3e8a', x + s * 9 * b.facing + b.facing * 4, y - 4, 12, 0.9); g.fillStyle = '#fff'; g.fillRect(x + s * 9 * b.facing + b.facing * 4 - 2, y - 6, 4, 4); } // yeux
      for (let i = 0; i < 4; i++) { const a = t * 2 + i * 1.57; E.drawSprite(g, 'bat', 'run', Math.floor(t * 14 + i), x + Math.cos(a) * 80, y + 10 + Math.sin(a) * 30, { scale: 0.8, facing: b.facing, tint: '#d9c2ff', tintMode: 'soft' }); }
    },
    magma(g, b, x, y, t, col, col2) {
      g.save(); g.translate(x, y + (b.charge ? Math.sin(t * 30) * 2 : 0));
      if (b.mode === 'battle') g.scale(b.facing < 0 ? 1 : -1, 1);
      const rock = '#2a1410';
      g.fillStyle = rock; rr(g, -40, -55, 80, 90, 18); g.fill();
      g.fillStyle = '#3a1c14'; rr(g, -30, -78, 60, 34, 12); g.fill();
      for (const s of [-1, 1]) { g.fillStyle = rock; rr(g, s * 52 - 16, -40 + Math.sin(t * 3 + s) * 6, 32, 46, 12); g.fill(); }
      g.fillStyle = rock; rr(g, -34, 30, 26, 30, 8); g.fill(); rr(g, 8, 30, 26, 30, 8); g.fill();
      g.strokeStyle = b.phase === 2 ? col2 : col; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-20, -40); g.lineTo(-6, -10); g.lineTo(-16, 20); g.moveTo(16, -45); g.lineTo(6, -5); g.lineTo(20, 25); g.stroke();
      glowAt(g, col2, -10, -62, 14, 1); glowAt(g, col2, 10, -62, 14, 1);
      g.fillStyle = '#fff'; g.fillRect(-13, -64, 6, 4); g.fillRect(7, -64, 6, 4);
      g.restore();
    },
    eclipse(g, b, x, y, t, col, col2) {
      g.save(); g.translate(x, y);
      for (let i = 0; i < 6; i++) { const a = t * (1 + b.phase * 0.5) + i * 1.047; g.save(); g.translate(Math.cos(a) * 70, Math.sin(a) * 38); g.rotate(a); g.fillStyle = i % 2 ? col : col2; g.beginPath(); g.moveTo(0, -10); g.lineTo(5, 0); g.lineTo(0, 10); g.lineTo(-5, 0); g.fill(); g.restore(); }
      const s = 1 + Math.sin(t * 3) * 0.05; g.scale(s, s);
      const gr = g.createLinearGradient(-30, -55, 30, 55); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, col2); gr.addColorStop(1, '#1a0830');
      g.beginPath(); g.moveTo(0, -55); g.lineTo(32, 0); g.lineTo(0, 55); g.lineTo(-32, 0); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill(); glowAt(g, col, 0, 0, 24, 1);
      g.restore();
    },
    neant(g, b, x, y, t) {
      const pal = { body: '#0b0b14', body2: '#000000', glow: '#ff3e8a', visor: '#ff3e8a', eye: '#ffffff', tint: '#1a0a1a' };
      g.save(); g.translate(x, y + b.h / 2); g.scale(1.8, 1.8);
      E.drawChar(g, LR.G.charId || 'luma', 0, 0, { st: b.swoop ? 'jump' : 'run', t, runT: t * 12, facing: b.facing, alpha: 0.95 }, pal);
      g.restore();
      glowAt(g, '#ff3e8a', x, y, 60, 0.4 + 0.2 * Math.sin(t * 5));
    },
  };
})(window.LR = window.LR || {});
