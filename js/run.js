/* Luma Rush — RUN MODE : course infinie, obstacles, bonus, événements, compétences et boss tous les 10 000 points. */
'use strict';
(function (LR) {
  const D = LR.D, E = LR.E, B = LR.B, G = LR.G, P = LR.P, Run = (LR.Run = {});
  const { rand, clamp, rgba, rr, glowAt, HZ, HZ2, GOLD, M1, M2, FONT } = E;
  const { GRAVITY, JUMP_V, DBL_V, RISE_CUT, SPEED_BASE, UNITS_PER_M, PTS_PER_M, OT, PBOX } = D;
  const fmt = E.fmt;

  const POW = {
    shield: { name: 'Bouclier', color: '#4dffb8', dur: 0 },
    magnet: { name: 'Aimant', color: '#b18cff', dur: 10 },
    hyper: { name: 'Hyper', color: '#ff9f1c', dur: 4.5 },
    x2: { name: 'Score x2', color: '#3ef2ff', dur: 12 },
    star: { name: 'Étoile x3', color: '#ffe14d', dur: 6 },
  };
  Run.POW = POW;
  const EVENTS = [
    { id: 'gold', name: 'RUÉE D’ÉCLATS', sub: 'Aucun obstacle : ramasse tout !', dur: 6, color: '#ffd34d', m: 0 },
    { id: 'moon', name: 'GRAVITÉ LUNAIRE', sub: 'Sauts géants', dur: 10, color: '#b18cff', m: 0 },
    { id: 'warp', name: 'HYPERVITESSE', sub: 'Vitesse +30 % · score x2', dur: 7, color: '#3ef2ff', m: 500 },
    { id: 'rift', name: 'FAILLE DIMENSIONNELLE', sub: 'Des créatures d’un autre monde !', dur: 10, color: '#a66bff', m: 300 },
    { id: 'stars', name: 'PLUIE D’ÉTOILES', sub: 'Attrape les étoiles filantes', dur: 8, color: '#ffe14d', m: 400 },
    { id: 'meteor', name: 'PLUIE DE MÉTÉORES', sub: 'Surveille les impacts !', dur: 10, color: '#ff8a3e', m: 700 },
    { id: 'dark', name: 'BLACK-OUT', sub: 'La ville s’éteint…', dur: 9, color: '#a66bff', m: 900 },
  ];
  const ECLIPSE = { id: 'eclipse', name: 'ÉCLIPSE DORÉE', sub: 'Événement extrêmement rare · éclats x5', dur: 9, color: '#ffd34d' };
  const PATTERNS = [
    { m: 0, w: 6, arc: true, make: x => [ob('spike', x)] },
    { m: 0, w: 4, arc: true, make: x => [ob('block', x)] },
    { m: 90, w: 4, make: x => [ob('droneLo', x)] },
    { m: 200, w: 3, arc: true, make: x => [ob('spike', x), ob('spike', x + 30)] },
    { m: 260, w: 3, rift: true, make: x => [ob('saw', x)] },
    { m: 300, w: 3, make: x => [ob('crawler', x + 220)] }, // part de plus loin : il roule plus vite que le décor
    { m: 340, w: 2, rift: true, make: x => [ob('skel', x + 140)] },
    { m: 380, w: 3, make: x => [ob('laser', x)] },
    { m: 420, w: 2, rift: true, make: x => [ob('bat', x + 100)] },
    { m: 520, w: 2, arc: true, make: x => [ob('totem', x)] },
    { m: 640, w: 2, make: (x, s) => [ob('block', x), ob('droneLo', x + s * 0.62)] },
    { m: 760, w: 2, noMoon: true, shortHop: true, make: x => [ob('droneHi', x - 9), ob('spike', x)] }, // petit saut obligatoire
    { m: 860, w: 2, make: (x, s) => [ob('laser', x), ob('spike', x + s * 0.6)] },
    { m: 900, w: 2, rift: true, make: (x, s) => [ob('skel', x + 140), ob('bat', x + 140 + s * 0.75)] },
    { m: 1000, w: 2, arc: true, make: x => [ob('spike', x), ob('spike', x + 30), ob('spike', x + 60)] },
    { m: 1200, w: 2, make: (x, s) => [ob('droneLo', x), ob('droneLo', x + s * 0.45)] },
  ];
  const RIFT_PAL = ['Faille', '#05010f', '#2a0a4a', '#6a2a9a', '#0c0418', '#a66bff'];
  const GOLD_PAL = ['Éclipse', '#120a00', '#4a3000', '#d9a01a', '#1a1000', '#ffd34d'];

  let R = null, PL = null;
  Run.get = () => R;
  Run.player = () => PL;
  const save = () => P.save;

  function ob(type, x) {
    const d = OT[type], o = { type, d, x, y: d.y, w: d.w, h: d.h, t: rand(0, 6), gap: 1e9, passed: false, under: false, dead: false, ph: rand(0, 6) };
    if (type === 'rock') o.poly = Array.from({ length: 8 }, () => rand(0.75, 1.1));
    return o;
  }
  const pbox = () => { const b = PL.sliding ? PBOX.slide : PBOX.stand; return { x: E.PX + b[0], y: PL.alt + b[1], w: b[2], h: b[3] }; };
  const obox = o => { const b = o.d.box; return { x: o.x + b[0], y: o.y + b[1], w: b[2], h: b[3] }; };

  Run.start = function (demo) {
    const s = save(), mods = demo ? D.mods(s, s.char) : G.mods;
    R = {
      demo, t: 0, dist: 0, speed: demo ? 260 : SPEED_BASE * 0.6, score: 0, coins: 0, mult: D.rankFor(s.completed), rankStart: D.rankFor(s.completed), mods,
      obs: [], shards: [], pows: [], mets: [], cores: [], shots: [], sinceSpawn: 0, nextSpawn: 700, nextPower: rand(220, 380), nextEvent: rand(420, 620),
      event: null, lastEvent: '', meteorT: 0, zone: demo ? 0 : -1, power: { shield: false, magnet: 0, hyper: 0, x2: 0, star: 0 }, grace: 0,
      combo: 0, comboT: 0, recordDone: s.bestDist < 50, demoT: 1.2, demoRel: 0, nextMilestone: 1000,
      nextBoss: D.BOSS_EVERY, boss: null, bossCount: 0, bossHit: false, bossWonT: 0, coreT: 0,
      laser: 0, skShield: 0, drone: 0, droneT: 0, droneShots: [], usedShieldPower: false, eggDone: false, capsules: 0, eclipse: false, greed: false,
    };
    PL = {
      alt: 0, vy: 0, onGround: true, air: mods.airJumps, held: false, buf: 0, fresh: false, sliding: false, slideT: 0, slideHeld: false,
      slideQ: false, fast: false, runT: 0, squash: 0, blinkT: 2, blink: 0, ant: 0.35, antV: 0, spin: 0, trail: [], dead: false, jet: 0, deadT: 0, victoryT: 0,
    };
    B.clear();
    if (!demo) { E.setZone(0); E.override = null; }
  };
  const mult = () => R.mult * (R.power.x2 > 0 ? 2 : 1) * (R.power.star > 0 ? 3 : 1) * (R.event && R.event.id === 'warp' ? 2 : 1);
  Run.mult = mult;

  // ───────────── Commandes ─────────────
  Run.pressJump = () => { if (!PL || PL.dead) return; PL.held = true; PL.buf = 0.14; PL.fresh = true; };
  Run.releaseJump = () => { if (PL) PL.held = false; };
  // Toucher bref : saut complet (la montée est maintenue automatiquement jusqu'au sommet).
  Run.tapJump = () => { Run.pressJump(); if (PL && !PL.dead) PL.autoHold = JUMP_V / GRAVITY + 0.02; };
  Run.tapControls = false;
  Run.pressSlide = () => {
    if (!PL || PL.dead) return;
    PL.slideHeld = true; PL.autoHold = 0;
    if (PL.jet > 0) return;
    if (PL.onGround) startSlide();
    else { PL.fast = true; PL.slideQ = true; if (PL.vy > 0) PL.vy = 0; } // en l'air : plongeon, puis glissade à l'atterrissage
  };
  Run.releaseSlide = () => { if (PL) PL.slideHeld = false; };
  Run.releaseAll = () => { if (PL) { PL.held = false; PL.slideHeld = false; } };
  function startSlide() { if (!PL.sliding) E.sfx('slide'); PL.sliding = true; PL.slideT = 0.42; PL.slideQ = false; }
  function jump(v, dbl) {
    const GY = E.GY, PX = E.PX;
    PL.vy = v; PL.onGround = false; PL.sliding = false; PL.fast = false; PL.slideQ = false; PL.buf = 0; PL.squash = -0.35;
    const c = palNow().glow;
    if (dbl) { PL.air--; PL.spin = 1; E.emit(PX, GY - PL.alt - 10, 1, { c, life: 0.35, size: 34, kind: 2 }); }
    else { PL.air = R.mods.airJumps; E.emit(PX, GY - 2, 8, { c: '#ffffff', sp: 120, life: 0.35, size: 7, ang: Math.PI, spread: 0.8, w: true }); }
    E.sfx(dbl ? 'dbl' : 'jump');
    if (!R.demo) { P.stat('jumps'); if (dbl) P.stat('doubleJumps'); }
  }
  function land() {
    const impact = -PL.vy;
    PL.alt = 0; PL.vy = 0; PL.onGround = true; PL.air = R.mods.airJumps; PL.fast = false;
    PL.squash = Math.min(0.5, impact / 2200);
    if (impact > 500) E.emit(E.PX, E.GY - 1, 6, { c: '#ffffff', sp: 140, life: 0.3, size: 6, ang: -Math.PI / 2, spread: 1.4, w: true });
    if (PL.slideQ || PL.slideHeld) startSlide();
  }
  let palCache = null, palT = -1;
  function palNow() {
    if (palT !== E.clock) { palT = E.clock; const s = save(); palCache = R && !R.demo ? G.pal(E.clock) : E.palette(s.char, s.skinByChar[s.char] || 'default', E.clock); }
    return palCache;
  }

  function updatePlayer(dt, dx) {
    const PX = E.PX, GY = E.GY, moon = R.event && R.event.id === 'moon', g = GRAVITY * (moon ? 0.5 : 1), jm = moon ? 0.82 : 1;
    if (PL.autoHold > 0 && (PL.autoHold -= dt) <= 0) PL.held = false;
    if (PL.jet > 0) { // jetpack : vol stable au-dessus des obstacles
      PL.jet -= dt; PL.onGround = false; PL.sliding = false;
      PL.alt += (170 - PL.alt) * Math.min(1, dt * 4); PL.vy = 0;
      if (Math.random() < dt * 40) E.emit(PX - 8, GY - PL.alt + 2, 1, { c: HZ2, sp: 200, life: 0.3, size: 8, ang: Math.PI / 2 + 0.3, spread: 0.3, w: true });
      if (PL.jet <= 0) PL.vy = -100;
    } else {
      if (PL.buf > 0) {
        if (PL.onGround) jump(JUMP_V * jm, false);
        else if (PL.fresh && PL.air > 0) jump(DBL_V * jm * R.mods.dblBoost, true);
        PL.fresh = false; PL.buf -= dt;
      }
      if (!PL.onGround) {
        let gg = g;
        if (PL.vy > 0 && !PL.held) gg *= RISE_CUT;
        if (PL.fast) gg *= 2.8;
        PL.vy -= gg * dt; PL.alt += PL.vy * dt;
        if (PL.alt <= 0) land();
      }
    }
    if (PL.sliding) {
      PL.slideT -= dt;
      if (PL.slideT <= 0 && !PL.slideHeld) PL.sliding = false;
      else if (Math.random() < dt * 30) E.emit(PX - 16, GY - 1, 1, { c: GOLD, sp: 260, life: 0.3, size: 6, ang: Math.PI + 0.35, spread: 0.35, g: 600, w: true, kind: 1 });
    } else if (PL.onGround && PL.slideHeld) startSlide();
    PL.runT += dt * (8 + R.speed / 45);
    PL.squash += (0 - PL.squash) * Math.min(1, dt * 12);
    if (PL.spin > 0) PL.spin = Math.max(0, PL.spin - dt / 0.38);
    if (PL.blink > 0) PL.blink -= dt; else if ((PL.blinkT -= dt) <= 0) { PL.blink = 0.12; PL.blinkT = rand(2, 5); }
    if (PL.victoryT > 0) PL.victoryT -= dt;
    const at = 0.35 + clamp(PL.vy / 1800, -0.5, 0.5) + (PL.sliding ? 0.6 : 0);
    PL.antV += ((at - PL.ant) * 160 - PL.antV * 10) * dt; PL.ant += PL.antV * dt;
    if (PL.onGround && !PL.sliding && Math.random() < dt * 14) E.emit(PX - 8, GY - 1, 1, { c: palNow().glow, sp: 60, life: 0.35, size: 6, ang: Math.PI + 0.5, spread: 0.4, w: true });
    for (const t of PL.trail) t.x -= dx;
    PL.trail.unshift({ x: PX - 6, y: GY - PL.alt - (PL.sliding ? 13 : 30) });
    if (PL.trail.length > 24) PL.trail.pop();
  }

  // ───────────── Génération ─────────────
  const addShard = (x, alt) => R.shards.push({ x, alt, t: rand(0, 6), mag: false });
  function spawnPower(x, m) {
    const pw = R.power;
    if (m > 800 && Math.random() < 0.06) { R.pows.push({ x, alt: 56, type: 'capsule', t: 0 }); return; }
    const opts = Object.keys(POW).filter(k => (k === 'shield' ? !pw.shield : pw[k] <= 0) && (k !== 'star' || m > 600));
    if (opts.length) R.pows.push({ x, alt: 56, type: opts[Math.floor(Math.random() * opts.length)], t: 0 });
  }
  function spawn(m) {
    const r = R, x0 = E.VW + 60, s = r.speed, ev = r.event ? r.event.id : '';
    if (r.boss) { // pendant un boss : seulement des noyaux d'énergie
      r.cores.push({ x: x0, alt: Math.random() < 0.6 ? 24 : 96, t: 0 });
      return s * 1.3;
    }
    if (ev === 'gold' || ev === 'eclipse') { for (let i = 0; i < 14; i++) addShard(x0 + i * 34, 26 + 70 * (0.5 + 0.5 * Math.sin(i * 0.55))); return 14 * 34 + 160; }
    if (ev === 'stars') r.pows.push({ x: x0 + rand(80, 200), alt: rand(60, 150), type: 'star', t: 0, falling: true });
    // Commandes « toucher pour sauter » : le saut est toujours complet, on retire donc le motif qui exige un petit saut.
    let pool = PATTERNS.filter(p => m >= p.m && !(p.noMoon && ev === 'moon') && !(p.shortHop && Run.tapControls));
    if (ev === 'rift') pool = PATTERNS.filter(p => p.rift && m >= Math.min(p.m, 340));
    if (!pool.length) pool = PATTERNS.filter(p => p.m === 0); // repli : jamais de génération vide
    let k = Math.random() * pool.reduce((a, p) => a + p.w, 0), pat = pool[0];
    for (const p of pool) if ((k -= p.w) <= 0) { pat = p; break; }
    let right = x0;
    for (const o of pat.make(x0, s)) { r.obs.push(o); right = Math.max(right, o.x + o.w); }
    const gap = D.gapFor(s, m, Math.random()) * (ev === 'meteor' ? 1.6 : ev === 'moon' ? 1.5 : 1);
    if (pat.arc && Math.random() < 0.45) { // arc d'éclats qui suit exactement la trajectoire d'un saut complet
      const T = 2 * JUMP_V / GRAVITY, cx = (x0 + right) / 2;
      for (let i = 0; i < 7; i++) { const t = (i / 6) * T; addShard(cx + (t - T / 2) * s, JUMP_V * t - 0.5 * GRAVITY * t * t + 24); }
    } else if (Math.random() < 0.5) {
      const hi = m > 150 && Math.random() < 0.18, n = clamp(Math.floor((gap * 0.5) / 34), 3, 8);
      for (let i = 0; i < n; i++) addShard(right + gap * 0.25 + i * 34, hi ? 196 : 24);
    }
    if (m >= r.nextPower) { spawnPower(right + gap * 0.5, m); r.nextPower = m + rand(380, 700); }
    // Secret : l'œuf doré, très haut, rarement.
    if (!r.eggDone && m > 600 && Math.random() < 0.012) { r.eggDone = true; r.pows.push({ x: right + gap * 0.5, alt: 250, type: 'egg', t: 0 }); }
    return right - x0 + gap;
  }
  function spawnMeteor() {
    const clash = x => R.obs.some(o => !o.dead && Math.abs(o.x + o.w / 2 - x) < 180);
    let gx = E.PX + rand(180, 420) + R.speed * 1.2;
    if (clash(gx)) gx += 260;
    if (!clash(gx)) R.mets.push({ gx, t: 1.2, T: 1.2 });
  }
  function impact(gx) {
    if (!R.obs.some(o => !o.dead && Math.abs(o.x + o.w / 2 - gx) < 130)) R.obs.push(ob('rock', gx - 18));
    E.emit(gx, E.GY, 30, { c: HZ2, sp: 420, life: 0.7, size: 12, ang: -Math.PI / 2, spread: 1.3, g: 900, w: true });
    E.emit(gx, E.GY, 1, { c: HZ, life: 0.45, size: 70, kind: 2, w: true });
    E.shake(7, 0.25); E.sfx('smash');
  }
  function stepEvent(dt, m) {
    const r = R;
    if (!r.event) {
      if (m < r.nextEvent || r.boss) return;
      const pool = EVENTS.filter(e => e.id !== r.lastEvent && m >= e.m);
      const e = Math.random() < 0.006 ? ECLIPSE : pool[Math.floor(Math.random() * pool.length)];
      r.event = { id: e.id, t: e.dur, def: e }; r.lastEvent = e.id; r.meteorT = 0.8;
      LR.UI.banner(e.name, e.sub, e.color); E.sfx(e.id === 'eclipse' ? 'rare' : 'event');
      if (e.id === 'rift') E.override = RIFT_PAL;
      if (e.id === 'eclipse') { E.override = GOLD_PAL; r.eclipse = true; save().flags.eclipse = true; P.checkAch(); }
      return;
    }
    const e = r.event; e.t -= dt;
    if (e.id === 'meteor' && (r.meteorT -= dt) <= 0) { spawnMeteor(); r.meteorT = rand(0.8, 1.4); }
    if (e.id === 'warp' && Math.random() < dt * 30) E.streak('#3ef2ff', 20, E.GY + 30);
    if (e.id === 'eclipse' && Math.random() < dt * 20) E.emit(rand(0, E.VW), -10, 1, { c: GOLD, sp: 60, life: 2, size: 6, ang: Math.PI / 2, g: 60 });
    if (e.t <= 0) {
      r.event = null; r.nextEvent = m + rand(500, 850); E.override = null;
      E.floatText('ÉVÉNEMENT SURVÉCU', E.PX + 70, E.GY - 150, e.def.color, 16); P.stat('events');
    }
  }

  // ───────────── Boss ─────────────
  function startBoss() {
    const s = save(), def = s.flags.summonNeant ? D.byId(D.BOSSES, 'neant') : D.pickBoss(s, Math.random);
    s.flags.summonNeant = false;
    const scale = D.bossScale(R.bossCount, P.level().level);
    R.boss = B.create(def, 'run', scale, D.bossAggression(R.bossCount, P.level().level)); R.bossHit = false; R.coreT = 1.2;
    s.bosses[def.id] = s.bosses[def.id] || { kills: 0, seen: 0 }; s.bosses[def.id].seen++;
    R.obs.forEach(o => { if (o.x > E.VW) o.dead = true; });
    E.music.boss = true; E.sfx('alarm'); E.shake(10, 0.6);
    LR.UI.banner('⚠ ' + def.name, def.title, def.col);
    LR.UI.bossBar(R.boss);
  }
  function bossCtx() { return { mode: 'run', px: E.PX, pa: PL.alt + 22, speed: R.speed, summon }; }
  function summon(type, x) {
    if (type === 'drone' || type === 'droneLo') R.obs.push(ob('droneLo', E.VW + 40));
    else if (type === 'skel') R.obs.push(ob('skel', E.VW + 60));
    else if (type === 'bat') R.obs.push(ob('bat', E.VW + 40 + rand(0, 120)));
  }
  function hitBoss(n) {
    const b = R.boss; if (!b || b.state !== 'fight') return;
    E.floatText('-' + n.toFixed(n < 1 ? 1 : 0), b.x + rand(-20, 20), E.GY - b.alt - 40, '#ffffff', 16);
    if (B.damage(b, n)) bossDefeated();
  }
  function bossDefeated() {
    const b = R.boss, s = save();
    E.sfx('boom'); E.shake(16, 0.8); E.flash = 0.7;
    E.emit(b.x, E.GY - b.alt, 60, { c: b.def.col, sp: 600, life: 1.2, size: 14 });
    LR.UI.banner('VICTOIRE !', b.def.name + ' vaincu', '#4dffb8');
    const bundle = D.bossReward(b.def, s, R.bossCount);
    s.bosses[b.id].kills++;
    if (!R.bossHit) s.flags.bossNoHit = true;
    P.stat('bosses');
    P.reward(bundle, `boss:${P.game.id}:${R.bossCount}`, 'Boss vaincu : ' + b.def.name);
    R.score += 5000 * R.mult; R.bossWonT = 1.8; PL.victoryT = 1.6;
    R.bossCount++; R.nextBoss = R.score + D.BOSS_EVERY;
    E.music.boss = false;
  }

  // ───────────── Compétences ─────────────
  Run.useSkill = function (i) {
    if (!R || R.demo || PL.dead) return;
    G.use(i, (id, sl) => {
      const PX = E.PX, GY = E.GY;
      if (id === 'jetpack') { PL.jet = sl.dur; PL.sliding = false; }
      else if (id === 'shield') R.skShield = sl.dur;
      else if (id === 'hyper') R.power.hyper = Math.max(R.power.hyper, sl.dur);
      else if (id === 'magnet') R.power.magnet = Math.max(R.power.magnet, sl.dur);
      else if (id === 'laser') { R.laser = sl.dur; E.sfx('laser'); }
      else if (id === 'drone') R.drone = sl.dur;
      else if (id === 'bomb') {
        E.sfx('boom'); E.shake(10, 0.4); E.flash = 0.3;
        E.emit(PX, GY - PL.alt - 22, 1, { c: '#ff9f1c', life: 0.5, size: 320, kind: 2 });
        E.emit(PX, GY - PL.alt - 22, 40, { c: '#ff9f1c', sp: 600, life: 0.6, size: 12 });
        for (const o of R.obs) if (!o.dead && Math.abs(o.x - PX) < 340) smash(o, true);
        B.hz.length = 0;
        if (R.boss) hitBoss(2 * R.mods.laser);
      }
      PL.victoryT = 0.25;
    });
  };

  // ───────────── Mise à jour ─────────────
  Run.update = function (dt) {
    const r = R, PX = E.PX, GY = E.GY;
    let target = r.demo ? 260 : D.speedAt(r.dist);
    if (r.event && r.event.id === 'warp') target *= 1.3;
    if (r.power.hyper > 0) target *= 1.45;
    if (r.boss) target = Math.min(target, D.speedAt(r.dist) * 0.9);
    if (PL.dead) target = 0;
    r.speed += (target - r.speed) * Math.min(1, dt * (PL.dead ? 4 : 2.5));
    const dx = r.speed * dt;
    r.t += dt; r.dist += dx; E.bgX += dx;
    if (!PL.dead) updatePlayer(dt, dx);
    else PL.deadT += dt;
    if (r.demo) demoAI(dt);
    else if (!PL.dead) {
      const m = r.dist / UNITS_PER_M, pw = r.power;
      G.step(dt);
      r.score += (dx / UNITS_PER_M) * PTS_PER_M * mult();
      for (const k of ['magnet', 'x2', 'star']) if (pw[k] > 0) pw[k] -= dt;
      if (pw.hyper > 0) { pw.hyper -= dt; if (Math.random() < dt * 40) E.streak('#ff9f1c', 20, GY + 30); if (pw.hyper <= 0) r.grace = 1.2; }
      if (r.grace > 0) r.grace -= dt;
      if (r.skShield > 0) r.skShield -= dt;
      if (r.laser > 0) { r.laser -= dt; laserTick(dt); }
      if (r.drone > 0 || r.mods.permaDrone) droneTick(dt);
      if (r.comboT > 0 && (r.comboT -= dt) <= 0) r.combo = 0;
      r.sinceSpawn += dx;
      if (r.sinceSpawn >= r.nextSpawn) { r.sinceSpawn = 0; r.nextSpawn = spawn(m); }
      stepEvent(dt, m);
      const z = Math.floor(m / 1000);
      if (z !== r.zone) { r.zone = z; E.setZone(z); LR.UI.banner(`ZONE ${z + 1}`, E.zone(z)[0], E.zone(z)[5]); }
      if (m >= r.nextMilestone) { // récompense de distance
        const k = r.nextMilestone / 1000, bonus = 20 * k;
        r.coins += bonus; r.nextMilestone += 1000;
        E.floatText(`${fmt(k * 1000)} m · +${bonus} ◆`, PX + 90, GY - 170, GOLD, 18); E.sfx('mission');
        if (k === 1 && !G.shieldUsed && !r.usedShieldPower) { save().flags.noshield = true; P.checkAch(); }
      }
      if (!r.recordDone && m >= save().bestDist) {
        r.recordDone = true; E.floatText('RECORD DE DISTANCE !', PX + 80, GY - 140, GOLD, 20); E.sfx('mission');
        E.emit(PX + 40, GY - 120, 30, { c: GOLD, sp: 380, life: 0.8, size: 10, g: 400 });
      }
      P.stat('dist', Math.floor(m), true);
      if (!r.boss && !r.event && r.score >= r.nextBoss) startBoss();
      if (r.boss) {
        B.update(r.boss, dt, bossCtx());
        if (r.boss.state === 'dead' && (r.bossWonT -= dt) <= 0) { r.boss = null; LR.UI.bossBar(null); LR.UI.flushReveals(); }
      }
      B.stepHazards(dt, dx, 'run');
    }
    moveEntities(dt, dx);
    if (!r.demo && !PL.dead) collide();
    E.stepFx(dt, dx);
  };
  function demoAI(dt) { // le menu montre le personnage qui court et saute tout seul
    const r = R;
    if ((r.demoT -= dt) <= 0) { PL.buf = 0.1; PL.fresh = true; PL.held = true; r.demoRel = rand(0.05, 0.3); r.demoT = rand(1.4, 3.2); }
    if (r.demoRel > 0 && (r.demoRel -= dt) <= 0) PL.held = false;
  }
  function laserTick(dt) {
    const range = 520 + 40 * (save().upgrades.laser || 0), PX = E.PX;
    for (const o of R.obs) if (!o.dead && o.x > PX && o.x < PX + range) smash(o, true);
    if (R.boss && R.boss.state === 'fight') hitBoss(3.5 * R.mods.laser * dt / 0.7);
  }
  function droneTick(dt) {
    const rate = R.mods.droneRate * (R.drone > 0 ? 1 : 0.45);
    if ((R.droneT -= dt * rate) > 0) return;
    R.droneT = 1.3;
    const PX = E.PX, dx0 = PX - 18, da = PL.alt + 70;
    let tgt = null;
    for (const o of R.obs) if (!o.dead && o.x > PX + 40 && o.x < PX + 420 && (!tgt || o.x < tgt.x)) tgt = o;
    if (tgt) { R.droneShots.push({ x: dx0, a: da, tx: tgt.x + tgt.w / 2, ta: obox(tgt).y + 10, o: tgt, t: 0 }); E.sfx('shoot'); }
    else if (R.boss && R.boss.state === 'fight') { const c = B.center(R.boss); R.droneShots.push({ x: dx0, a: da, tx: c.x, ta: c.a, boss: true, t: 0 }); E.sfx('shoot'); }
  }

  function moveEntities(dt, dx) {
    const r = R, PX = E.PX, GY = E.GY;
    for (let i = r.obs.length - 1; i >= 0; i--) {
      const o = r.obs[i];
      o.x -= dx + (PL.dead ? 0 : (o.d.vx || 0) * dt); o.t += dt;
      if (o.d.bob) o.y = o.d.y + o.d.bob * (0.5 + 0.5 * Math.sin(o.t * 3 + o.ph));
      if (o.d.wave) o.y = o.d.y + o.d.wave * Math.sin(o.t * 4 + o.ph);
      if (o.type === 'rock' && !o.dead && Math.random() < dt * 25) E.emit(o.x + rand(8, 28), GY - rand(8, 22), 1, { c: HZ2, sp: 40, life: 0.6, size: 7, g: -120, w: true });
      if (o.x + o.w < -120) r.obs.splice(i, 1);
    }
    const pcy = PL.alt + (PL.sliding ? 10 : 22), magR = r.power.magnet > 0 || r.power.hyper > 0 ? r.mods.magnetR : 0;
    for (let i = r.shards.length - 1; i >= 0; i--) {
      const s = r.shards[i]; s.t += dt;
      if (s.mag) {
        const ax = PX - s.x, ay = pcy - s.alt, d = Math.hypot(ax, ay) || 1, v = (1000 + r.speed) * dt;
        if (d < v) { s.x = PX; s.alt = pcy; } else { s.x += (ax / d) * v; s.alt += (ay / d) * v; }
      } else { s.x -= dx; if (magR && !PL.dead && Math.hypot(PX - s.x, pcy - s.alt) < magR) s.mag = true; }
      if (!PL.dead && !r.demo && Math.abs(s.x - PX) < 22 && Math.abs(s.alt - pcy) < 28) { r.shards.splice(i, 1); collect(s); continue; }
      if (s.x < -40) r.shards.splice(i, 1);
    }
    for (let i = r.pows.length - 1; i >= 0; i--) {
      const p = r.pows[i]; p.x -= dx; p.t += dt;
      if (p.falling) p.alt = Math.max(20, p.alt - 40 * dt);
      const pa = p.alt + Math.sin(p.t * 3) * 6;
      if (!PL.dead && !r.demo && Math.abs(p.x - PX) < 30 && Math.abs(pa - pcy) < 40) { r.pows.splice(i, 1); activate(p.type, p.x, pa); continue; }
      if (p.x < -40) r.pows.splice(i, 1);
    }
    for (let i = r.cores.length - 1; i >= 0; i--) {
      const c = r.cores[i]; c.x -= dx; c.t += dt;
      if (!PL.dead && Math.abs(c.x - PX) < 28 && Math.abs(c.alt - pcy) < 36) {
        r.cores.splice(i, 1); E.sfx('power');
        if (r.boss) { const b = B.center(r.boss); r.shots.push({ x: PX, a: pcy, t: 0, tx: b.x, ta: b.a }); }
        continue;
      }
      if (c.x < -40) r.cores.splice(i, 1);
    }
    for (let i = r.shots.length - 1; i >= 0; i--) { // tirs à tête chercheuse vers le boss
      const s = r.shots[i]; s.t += dt;
      if (r.boss) { const b = B.center(r.boss); s.tx = b.x; s.ta = b.a; }
      const ax = s.tx - s.x, ay = s.ta - s.a, d = Math.hypot(ax, ay) || 1, v = 900 * dt;
      if (d < v + 20) { r.shots.splice(i, 1); hitBoss(1 * r.mods.dmg * r.mods.melee); E.sfx('hit'); E.emit(s.tx, GY - s.ta, 14, { c: '#ffffff', sp: 300, life: 0.4, size: 8 }); continue; }
      s.x += (ax / d) * v; s.a += (ay / d) * v;
      if (Math.random() < 0.6) E.emit(s.x, GY - s.a, 1, { c: palNow().glow, life: 0.3, size: 8 });
    }
    for (let i = r.droneShots.length - 1; i >= 0; i--) {
      const s = r.droneShots[i]; s.t += dt;
      if (s.o) { s.tx = s.o.x + s.o.w / 2; s.ta = obox(s.o).y + 10; }
      const ax = s.tx - s.x, ay = s.ta - s.a, d = Math.hypot(ax, ay) || 1, v = 1100 * dt;
      if (d < v + 10) { r.droneShots.splice(i, 1); if (s.o && !s.o.dead) smash(s.o, true); if (s.boss) hitBoss(0.5 * r.mods.droneRate); continue; }
      s.x += (ax / d) * v; s.a += (ay / d) * v;
    }
    for (let i = r.mets.length - 1; i >= 0; i--) {
      const mt = r.mets[i]; mt.gx -= dx; mt.t -= dt;
      if (mt.t <= 0) { r.mets.splice(i, 1); impact(mt.gx); }
    }
  }

  function collide() {
    const pb = pbox(), flying = PL.jet > 0;
    for (const o of R.obs) {
      if (o.dead || o.passed) continue;
      const b = obox(o);
      if (b.x > pb.x + pb.w) continue;
      if (b.x + b.w < pb.x) { o.passed = true; if (o.gap < 9) nearMiss(); if (o.under) P.stat('slideUnder'); continue; }
      if (!flying && D.overlap(pb, b)) { hit(o); if (PL.dead) return; continue; }
      const gap = b.y >= pb.y + pb.h ? b.y - (pb.y + pb.h) : pb.y - (b.y + b.h);
      if (gap < o.gap && !flying) o.gap = gap;
      if (o.d.slide && PL.sliding) o.under = true;
    }
    const h = B.hitTest(pb);
    if (h) { if (protectedHit()) { h.life = 0; h.t = 99; const i = B.hz.indexOf(h); if (i >= 0) B.hz.splice(i, 1); } else if (!flying || h.k === 'beam') hit(null); }
    if (R.boss && B.bodyHits(R.boss, pb)) hit(null);
  }
  // Protection active ? (hyper, bouclier de compétence, invulnérabilité) — sinon le bonus bouclier se brise.
  function protectedHit() { return R.power.hyper > 0 || R.skShield > 0 || R.grace > 0; }
  function hit(o) {
    const r = R;
    if (r.power.hyper > 0 || r.skShield > 0) { if (o) smash(o); return; }
    if (r.grace > 0) return;
    if (r.boss) r.bossHit = true; // un vrai coup reçu pendant le boss (même absorbé par le bonus bouclier)
    if (r.power.shield) {
      r.power.shield = false; r.grace = 1; r.usedShieldPower = true; if (o) smash(o);
      E.sfx('shield'); E.flash = 0.35; E.floatText('BOUCLIER BRISÉ', E.PX + 30, E.GY - PL.alt - 84, POW.shield.color, 16); return;
    }
    if (G.trySecond()) { // seconde chance
      r.grace = 2.2; E.flash = 0.8; if (o) smash(o);
      for (const x of r.obs) if (!x.dead && x.x < E.PX + 260 && x.x > E.PX - 40) smash(x, true);
      B.hz.length = 0;
      E.floatText('SECONDE CHANCE !', E.PX + 40, E.GY - PL.alt - 90, '#ff3e8a', 20); return;
    }
    die();
  }
  function smash(o, quiet) {
    if (o.dead) return;
    o.dead = true;
    const b = obox(o), cx = o.x + o.w / 2, cy = E.GY - b.y - Math.min(b.h, 40) / 2, pts = 150 * mult();
    E.emit(cx, cy, 26, { c: HZ, sp: 420, life: 0.6, size: 10, g: 700, w: true });
    E.emit(cx, cy, 10, { c: HZ2, sp: 300, life: 0.5, size: 8, kind: 1, g: 500, w: true });
    R.score += pts; E.floatText('+' + fmt(pts), cx, cy - 30, HZ2, 16);
    E.sfx('smash'); if (!quiet) E.shake(5, 0.15); P.stat('smash');
  }
  function nearMiss() {
    const pts = 250 * mult(); R.score += pts;
    E.floatText('FRÔLÉ ! +' + fmt(pts), E.PX + 24, E.GY - PL.alt - 72, '#3ef2ff', 17);
    E.emit(E.PX, E.GY - PL.alt - 22, 10, { c: '#3ef2ff', sp: 260, life: 0.4, size: 7, kind: 1 });
    E.sfx('near'); P.stat('near');
  }
  function collect(s) {
    const r = R, v = r.event && r.event.id === 'eclipse' ? 5 : 1;
    r.coins += v; r.combo++; r.comboT = 0.8; r.score += 50 * mult();
    E.sfx('coin', r.combo);
    E.emit(s.x, E.GY - s.alt, 6, { c: GOLD, sp: 160, life: 0.35, size: 9 });
    P.stat('coins', v);
  }
  function activate(type, x, alt) {
    const pw = R.power, GY = E.GY, PX = E.PX;
    if (type === 'capsule') {
      R.capsules++; E.sfx('rare'); E.flash = 0.3;
      E.emit(x, GY - alt, 30, { c: '#b65cff', sp: 340, life: 0.7, size: 12 });
      E.floatText('CAPSULE DE FAILLE !', PX + 50, GY - PL.alt - 90, '#b65cff', 18);
      P.reward({ loot: 'capsule' }, `cap:${P.game.id}:${R.capsules}`, 'Capsule de faille (Run)');
      return;
    }
    if (type === 'egg') {
      const s = save(); E.sfx('rare'); E.flash = 0.6;
      E.emit(x, GY - alt, 50, { c: GOLD, sp: 400, life: 1, size: 12 });
      E.floatText('???', PX + 40, GY - PL.alt - 90, GOLD, 26);
      s.flags.egg = true; s.stats.secrets++;
      P.reward({ coins: 500, skin: 'fantome' }, 'egg-first', 'Œuf doré') || P.reward({ coins: 300 }, 'egg:' + P.game.id, 'Œuf doré');
      return;
    }
    const P0 = POW[type];
    if (type === 'shield') { pw.shield = true; R.usedShieldPower = true; } else pw[type] = P0.dur;
    E.sfx('power'); E.flash = 0.25;
    E.emit(x, GY - alt, 26, { c: P0.color, sp: 320, life: 0.6, size: 12 });
    E.emit(x, GY - alt, 1, { c: P0.color, life: 0.5, size: 60, kind: 2 });
    E.floatText(P0.name.toUpperCase() + ' !', PX + 40, GY - PL.alt - 84, P0.color, 20);
    P.stat('powers');
  }
  function die() {
    PL.dead = true; PL.deadT = 0; E.flash = 0.8; E.shake(16, 0.6);
    const col = palNow(), cy = E.GY - PL.alt - 24;
    E.emit(E.PX, cy, 50, { c: col.glow, sp: 520, life: 1.1, size: 12, g: 500 });
    E.emit(E.PX, cy, 24, { c: '#ffffff', sp: 380, life: 0.8, size: 8, kind: 1, g: 300 });
    E.emit(E.PX, cy, 1, { c: col.glow, life: 0.6, size: 110, kind: 2 });
    E.sfx('death'); Run.releaseAll();
    LR.UI.onDeath();
  }
  // Résumé transmis à l'écran de fin.
  Run.summary = () => ({ mode: 'run', score: Math.floor(R.score), dist: Math.floor(R.dist / UNITS_PER_M), coins: R.coins, near: P.game.stats.near || 0, bosses: R.bossCount, rankStart: R.rankStart });
  Run.hud = () => ({ score: Math.floor(R.score), mult: mult(), base: R.mult, coins: R.coins, power: R.power, skShield: R.skShield, boss: R.boss });

  // ───────────── Rendu ─────────────
  Run.render = function (g) {
    const r = R, GY = E.GY, PX = E.PX, clock = E.clock;
    E.beginFrame(g);
    E.drawBackdrop(g, E.bgX, clock);
    E.drawAmbient(g, clock, r.speed);
    drawMarkers(g);
    drawShards(g); drawPows(g); drawCores(g); drawObs(g); drawMeteors(g);
    if (r.boss) B.draw(g, r.boss, clock);
    B.drawHazards(g, clock);
    if (!PL.dead || PL.deadT < 0.05) drawPlayer(g);
    drawShots(g);
    E.drawFx(g);
    const dark = (r.event && r.event.id === 'dark') || (r.boss && r.boss.dark && r.boss.state === 'fight');
    if (dark) drawDark(g);
    E.vignette(g);
  };
  function post(g, x, label, c, big) {
    const GY = E.GY;
    g.strokeStyle = c; g.globalAlpha = 0.7; g.lineWidth = big ? 2 : 1; g.setLineDash([4, 5]);
    g.beginPath(); g.moveTo(x, GY); g.lineTo(x, GY - (big ? 150 : 110)); g.stroke(); g.setLineDash([]);
    g.globalAlpha = 1; g.fillStyle = c; g.font = `800 ${big ? 13 : 11}px ${FONT}`; g.textAlign = 'center';
    g.fillText(label, x, GY - (big ? 158 : 116));
    if (big) glowAt(g, c, x, GY - 150, 26, 0.6);
  }
  function drawMarkers(g) {
    if (R.demo) return;
    const PX = E.PX, s = save();
    for (let k = Math.max(500, Math.ceil((R.dist - PX - 40) / UNITS_PER_M / 500) * 500); ; k += 500) {
      const x = PX + k * UNITS_PER_M - R.dist;
      if (x > E.VW + 40) break;
      post(g, x, `${fmt(k)} m`, 'rgba(255,255,255,0.55)', false);
    }
    if (s.bestDist >= 50) { const x = PX + s.bestDist * UNITS_PER_M - R.dist; if (x > -40 && x < E.VW + 60) post(g, x, `RECORD ${fmt(s.bestDist)} m`, GOLD, true); }
  }
  function drawShards(g) {
    const GY = E.GY;
    for (const s of R.shards) {
      const x = s.x, y = GY - s.alt, k = Math.cos(s.t * 4), sw = 7 * Math.max(0.2, Math.abs(k));
      glowAt(g, GOLD, x, y, 18, 0.55);
      g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + sw, y); g.lineTo(x, y + 10); g.lineTo(x - sw, y); g.closePath();
      g.fillStyle = k > 0 ? '#fff3b0' : '#ffc23d'; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x - 1, y - 6, 2, 4);
    }
  }
  function drawPowIcon(g, type, x, y, c) {
    g.fillStyle = c; g.strokeStyle = c;
    if (type === 'shield') E.drawIcon(g, 'rpg:25', x, y, 20);
    else if (type === 'magnet') E.drawIcon(g, 'v:magnet', x, y, 22, c);
    else if (type === 'hyper') E.drawIcon(g, 'v:hyper', x, y, 22, c);
    else if (type === 'star') { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? 4.5 : 10; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.fill(); }
    else { g.font = `italic 900 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x2', x, y + 1); g.textBaseline = 'alphabetic'; }
  }
  function drawPows(g) {
    const GY = E.GY, clock = E.clock;
    for (const p of R.pows) {
      const x = p.x, y = GY - p.alt - Math.sin(p.t * 3) * 6;
      if (p.type === 'egg') { glowAt(g, GOLD, x, y, 30, 0.8); g.fillStyle = '#ffe9a0'; g.beginPath(); g.ellipse(x, y, 9, 12, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(x - 3, y - 6, 3, 4); continue; }
      if (p.type === 'capsule') {
        glowAt(g, '#b65cff', x, y, 44, 0.8);
        rr(g, x - 13, y - 17, 26, 34, 10); g.fillStyle = '#1a0a30'; g.fill(); g.strokeStyle = '#b65cff'; g.lineWidth = 2.5; g.stroke();
        g.fillStyle = '#b65cff'; g.fillRect(x - 13, y - 2, 26, 4); E.drawIcon(g, 'rpg:71', x, y - 9 + Math.sin(clock * 4), 14); continue;
      }
      const c = POW[p.type].color;
      glowAt(g, c, x, y, 42, 0.7);
      g.beginPath(); g.arc(x, y, 16, 0, Math.PI * 2); g.fillStyle = 'rgba(10,4,30,0.8)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = c; g.stroke();
      g.setLineDash([4, 6]); g.lineDashOffset = -p.t * 20; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 21, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      drawPowIcon(g, p.type, x, y, c);
    }
  }
  function drawCores(g) {
    const GY = E.GY;
    for (const c of R.cores) {
      const y = GY - c.alt, col = R.boss ? R.boss.def.col2 : '#3ef2ff', s = 9 + Math.sin(c.t * 8) * 2;
      glowAt(g, col, c.x, y, 30, 0.9);
      g.save(); g.translate(c.x, y); g.rotate(c.t * 3); g.fillStyle = '#fff'; g.fillRect(-s / 2, -s / 2, s, s); g.restore();
    }
  }
  function drawShots(g) {
    const GY = E.GY;
    for (const s of R.shots) { glowAt(g, '#ffffff', s.x, GY - s.a, 16, 1); }
    for (const s of R.droneShots) { glowAt(g, '#3ef2ff', s.x, GY - s.a, 10, 1); }
    if (R.laser > 0 && !PL.dead) {
      const y = GY - PL.alt - 26, len = 520 + 40 * (save().upgrades.laser || 0), c = palNow().glow;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(c, 0.35); g.fillRect(E.PX + 10, y - 9, len, 18);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(E.PX + 10, y - 2, len, 4);
      g.globalCompositeOperation = 'source-over';
    }
    if ((R.drone > 0 || R.mods.permaDrone) && !PL.dead && !R.demo) {
      const x = E.PX - 18, y = GY - PL.alt - 70 + Math.sin(E.clock * 4) * 4;
      glowAt(g, '#3ef2ff', x, y, 18, R.drone > 0 ? 0.8 : 0.4);
      g.fillStyle = M2; g.beginPath(); g.ellipse(x, y, 11, 6, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#3ef2ff'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = '#3ef2ff'; g.beginPath(); g.arc(x + 3, y, 2.5, 0, 7); g.fill();
    }
  }
  function drawCrate(g, x, yb, w, h, t) {
    const top = yb - h, gr = g.createLinearGradient(0, top, 0, yb);
    gr.addColorStop(0, M2); gr.addColorStop(1, M1);
    rr(g, x, top, w, h, 5); g.fillStyle = gr; g.fill();
    g.save(); g.clip(); g.strokeStyle = rgba(HZ2, 0.25); g.lineWidth = 5; g.beginPath();
    for (let i = -h; i < w; i += 14) { g.moveTo(x + i, yb); g.lineTo(x + i + h, top); }
    g.stroke(); g.restore();
    rr(g, x, top, w, h, 5); g.strokeStyle = HZ; g.lineWidth = 2; g.stroke();
    rr(g, x + 7, top + 8, w - 14, Math.min(12, h - 14), 3); g.fillStyle = 'rgba(8,2,20,0.9)'; g.fill();
    const ex = x + w / 2 + Math.sin(t * 3) * (w / 2 - 12);
    glowAt(g, HZ, ex, top + 14, 12, 0.9); g.fillStyle = '#fff'; g.fillRect(ex - 2, top + 12, 4, 4);
  }
  Run.drawCrate = drawCrate;
  Run.drawObstacle = function (g, o) {
    const GY = E.GY, x = o.x, yb = GY - o.y, w = o.w, h = o.h, t = o.t;
    if (o.type === 'spike') {
      const cx = x + w / 2, top = yb - h, gr = g.createLinearGradient(0, top, 0, yb);
      gr.addColorStop(0, M2); gr.addColorStop(1, M1);
      glowAt(g, HZ, cx, top + 6, 22, 0.5 + 0.3 * Math.sin(t * 8));
      g.beginPath(); g.moveTo(x, yb); g.lineTo(x + w, yb); g.lineTo(cx + 3, top + 8); g.lineTo(cx - 3, top + 8); g.closePath();
      g.fillStyle = gr; g.fill(); g.lineWidth = 2; g.strokeStyle = HZ; g.stroke();
      g.strokeStyle = rgba(HZ, 0.55); g.lineWidth = 1.5; g.beginPath();
      for (const f of [0.3, 0.6]) { const yy = yb - h * f, half = (w / 2) * (1 - f) + 2; g.moveTo(cx - half + 3, yy); g.lineTo(cx + half - 3, yy); }
      g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, top + 5, 3.5, 0, Math.PI * 2); g.fill();
    } else if (o.type === 'block') drawCrate(g, x, yb, w, h, t);
    else if (o.type === 'totem') { drawCrate(g, x, yb, w, h / 2, t); drawCrate(g, x, yb - h / 2, w, h / 2, t + 1.5); }
    else if (o.type === 'droneLo' || o.type === 'droneHi') {
      const cx = x + w / 2, cy = yb - h / 2 + Math.sin(t * 5) * 2, rw = 12 + Math.sin(t * 60) * 6;
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath();
      g.moveTo(cx - 16 - rw / 2, cy - 14); g.lineTo(cx - 16 + rw / 2, cy - 14); g.moveTo(cx + 16 - rw / 2, cy - 14); g.lineTo(cx + 16 + rw / 2, cy - 14); g.stroke();
      g.strokeStyle = M2; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 16, cy - 13); g.lineTo(cx - 8, cy - 5); g.moveTo(cx + 16, cy - 13); g.lineTo(cx + 8, cy - 5); g.stroke();
      const gr = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); gr.addColorStop(0, M2); gr.addColorStop(1, M1);
      g.beginPath(); g.ellipse(cx, cy, w / 2, h / 2 - 2, 0, 0, Math.PI * 2); g.fillStyle = gr; g.fill(); g.strokeStyle = HZ; g.lineWidth = 2; g.stroke();
      const ex = cx - 6 + Math.sin(t * 2.5) * 6;
      glowAt(g, HZ, ex, cy, 16, 0.95); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, cy, 3, 0, Math.PI * 2); g.fill();
      if (Math.sin(t * 9) > 0) { g.fillStyle = HZ2; g.fillRect(cx + w / 2 - 6, cy - 1, 3, 3); }
    } else if (o.type === 'laser') {
      const cx = x + w / 2, fl = 0.75 + Math.random() * 0.25, by = yb - 12;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(HZ, 0.22 * fl); g.fillRect(cx - 9, -20, 18, by + 20);
      g.fillStyle = rgba(HZ, 0.55 * fl); g.fillRect(cx - 4, -20, 8, by + 20);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(cx - 1.5, -20, 3, by + 20);
      g.strokeStyle = 'rgba(255,194,221,0.8)'; g.lineWidth = 1.2; g.beginPath();
      let yy = by; g.moveTo(cx, yy); while (yy > 0) { yy -= rand(10, 22); g.lineTo(cx + rand(-7, 7), yy); }
      g.stroke(); g.globalCompositeOperation = 'source-over';
      rr(g, cx - 13, yb - 14, 26, 14, 4); g.fillStyle = M2; g.fill(); g.strokeStyle = HZ; g.lineWidth = 2; g.stroke();
      glowAt(g, HZ2, cx, yb + 3, 14, 0.7);
    } else if (o.type === 'crawler') {
      const cx = x + w / 2, bob = Math.abs(Math.sin(t * 18)) * 2;
      g.strokeStyle = HZ2; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i < 4; i++) { const lx = x + 6 + i * 8; g.moveTo(lx, yb - 8 - bob); g.lineTo(lx - 4 + Math.sin(t * 30 + i * 2) * 3, yb); }
      g.stroke();
      const gr = g.createLinearGradient(0, yb - 26, 0, yb); gr.addColorStop(0, M2); gr.addColorStop(1, M1);
      g.beginPath(); g.ellipse(cx, yb - 8 - bob, w / 2, 16, 0, Math.PI, 0); g.closePath(); g.fillStyle = gr; g.fill(); g.strokeStyle = HZ; g.lineWidth = 2; g.stroke();
      glowAt(g, HZ, x + 10, yb - 15 - bob, 12, 0.85);
      g.fillStyle = '#fff'; g.fillRect(x + 6, yb - 17 - bob, 3, 3); g.fillRect(x + 12, yb - 17 - bob, 3, 3);
    } else if (o.type === 'rock') {
      const cx = x + w / 2, cy = yb - h / 2;
      glowAt(g, HZ2, cx, cy, 30, 0.5);
      g.beginPath();
      o.poly.forEach((k, i) => { const a = Math.PI + (i / (o.poly.length - 1)) * Math.PI, px = cx + Math.cos(a) * (w / 2) * k, py = yb + Math.sin(a) * h * k; i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.closePath(); g.fillStyle = '#2a1410'; g.fill(); g.strokeStyle = HZ2; g.lineWidth = 2; g.stroke();
    } else if (o.type === 'saw') {
      const cx = x + w / 2, cy = yb - h / 2;
      g.strokeStyle = rgba(HZ, 0.35); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, GY); g.lineTo(cx, cy); g.stroke(); // rail
      glowAt(g, HZ, cx, cy, 30, 0.6);
      g.save(); g.translate(cx, cy); g.rotate(t * 14);
      g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r2 = i % 2 ? 12 : 17; g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); } g.closePath();
      g.fillStyle = '#c9cfe0'; g.fill(); g.strokeStyle = HZ; g.lineWidth = 1.5; g.stroke();
      g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fillStyle = HZ; g.fill();
      g.restore();
    } else if (o.type === 'skel') {
      glowAt(g, '#a66bff', x + w / 2, yb - 24, 26, 0.45);
      if (!E.drawSprite(g, 'skel', 'run', Math.floor(t * 9), x + w / 2, yb, { facing: -1 })) drawCrate(g, x, yb, w, h, t);
    } else if (o.type === 'bat') {
      glowAt(g, '#a66bff', x + w / 2, yb - h / 2, 24, 0.45);
      if (!E.drawSprite(g, 'bat', 'run', Math.floor(t * 14), x + w / 2, yb + 4, { facing: -1 })) { g.fillStyle = HZ; g.fillRect(x, yb - h, w, h); }
    }
  };
  function drawObs(g) { for (const o of R.obs) if (!o.dead) Run.drawObstacle(g, o); }
  function drawMeteors(g) {
    const GY = E.GY;
    for (const mt of R.mets) {
      const p = 1 - mt.t / mt.T, tx = mt.gx, sx = tx + 260 * (1 - p), sy = GY - (GY + 40) * (1 - p);
      const a = 0.4 + 0.6 * Math.abs(Math.sin(p * 18));
      g.strokeStyle = rgba(HZ, a); g.lineWidth = 2; g.beginPath(); g.ellipse(tx, GY + 2, 26 - 10 * p, 6 - 2 * p, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = rgba(HZ, a); g.font = `900 16px ${FONT}`; g.textAlign = 'center'; g.fillText('!', tx, GY - 10);
      g.globalCompositeOperation = 'lighter';
      const tr = g.createLinearGradient(sx + 90, sy - 120, sx, sy); tr.addColorStop(0, 'rgba(255,138,62,0)'); tr.addColorStop(1, 'rgba(255,200,120,0.85)');
      g.strokeStyle = tr; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx + 90, sy - 120); g.lineTo(sx, sy); g.stroke();
      g.globalCompositeOperation = 'source-over';
      glowAt(g, HZ2, sx, sy, 30, 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, 6, 0, Math.PI * 2); g.fill();
    }
  }
  function drawPlayer(g) {
    const pal = palNow(), PX = E.PX, GY = E.GY, y = GY - PL.alt, sh = 1 - Math.min(PL.alt / 220, 0.75);
    g.fillStyle = `rgba(0,0,0,${0.4 * sh})`; g.beginPath(); g.ellipse(PX, GY + 2, 18 * sh + 4, 4 * sh + 1, 0, 0, Math.PI * 2); g.fill();
    const tr = PL.trail, n = tr.length;
    if (n > 1) {
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      for (let i = 0; i < n - 1; i++) {
        const f = 1 - i / n; g.strokeStyle = rgba(pal.glow, f * (pal.ghost ? 0.25 : 0.45)); g.lineWidth = 2 + f * 9;
        g.beginPath(); g.moveTo(tr[i].x, tr[i].y); g.lineTo(tr[i + 1].x, tr[i + 1].y); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    const st = PL.dead ? 'dead' : PL.victoryT > 0 && PL.onGround ? 'victory' : PL.sliding ? 'slide' : PL.jet > 0 ? 'jump' : !PL.onGround ? (PL.vy > 0 ? 'jump' : 'fall') : 'run';
    const pose = { st, t: E.clock, runT: PL.runT, vy: PL.vy, squash: PL.squash, blink: PL.blink > 0, ant: PL.ant, spin: PL.spin, alpha: 1, facing: 1 };
    if (R.power.hyper > 0) for (let i = 3; i >= 1; i--) { pose.alpha = 0.36 / i; E.drawChar(g, charId(), PX - i * 16, y, pose, pal); }
    pose.alpha = R.grace > 0 && Math.floor(E.clock * 18) % 2 ? 0.35 : 1;
    E.drawChar(g, charId(), PX, y, pose, pal);
    if (PL.jet > 0) { glowAt(g, HZ2, PX - 8, y + 4, 18, 0.9); }
    const cy = y - (PL.sliding ? 12 : 24);
    if (R.power.shield || R.skShield > 0) {
      const r = 34 + Math.sin(E.clock * 6) * 1.5, c = R.skShield > 0 ? '#7df9ff' : POW.shield.color;
      glowAt(g, c, PX, cy, 52, 0.3);
      g.beginPath(); g.arc(PX, cy, r, 0, Math.PI * 2); g.fillStyle = rgba(c, 0.07); g.fill(); g.strokeStyle = rgba(c, 0.85); g.lineWidth = 2; g.stroke();
    }
    if (R.power.hyper > 0) glowAt(g, POW.hyper.color, PX, cy, 64, 0.55);
    if (R.power.magnet > 0) { const k = (E.clock * 1.4) % 1; g.strokeStyle = rgba(POW.magnet.color, (1 - k) * 0.6); g.lineWidth = 2; g.beginPath(); g.arc(PX, cy, 18 + k * 70, 0, Math.PI * 2); g.stroke(); }
  }
  const charId = () => (R.demo ? save().char : G.charId);
  function drawDark(g) {
    const e = R.event, k = e && e.id === 'dark' ? Math.max(0, Math.min(1, (e.def.dur - e.t) / 0.8, e.t / 0.8)) : 0.85;
    const GY = E.GY, cx = E.PX + 60, cy = GY - PL.alt - 22;
    const gr = g.createRadialGradient(cx, cy, 50, cx, cy, 330);
    gr.addColorStop(0, 'rgba(2,0,10,0)'); gr.addColorStop(0.55, 'rgba(2,0,10,0.78)'); gr.addColorStop(1, 'rgba(2,0,10,0.94)');
    g.globalAlpha = k; g.fillStyle = gr; g.fillRect(-20, -20, E.VW + 40, E.VH + 40); g.globalAlpha = 1;
    const blink = 0.55 + 0.45 * Math.sin(E.clock * 12); // balises de danger : le black-out doit rester jouable
    for (const o of R.obs) {
      if (o.dead) continue;
      const b = obox(o), ty = o.type === 'laser' ? GY - o.y - 6 : GY - b.y - Math.min(b.h, 50);
      glowAt(g, HZ, o.x + o.w / 2, ty, 16, k * blink);
    }
    for (const h of B.hz) if (h.k === 'orb') glowAt(g, h.col, h.x, GY - h.a, 14, k);
    for (const s of R.shards) glowAt(g, GOLD, s.x, GY - s.alt, 10, 0.5 * k);
    for (const c of R.cores) glowAt(g, '#ffffff', c.x, GY - c.alt, 14, k);
  }
})(window.LR = window.LR || {});
