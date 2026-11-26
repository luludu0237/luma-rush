/* Luma Rush — BATTLE MODE : arène latérale, vagues d'ennemis, mini-boss toutes les 5 vagues (3, 8, 13…), boss toutes les 5 vagues. */
'use strict';
(function (LR) {
  const D = LR.D, E = LR.E, B = LR.B, G = LR.G, P = LR.P, Bt = (LR.Battle = {});
  const { rand, clamp, rgba, rr, glowAt, HZ, HZ2, GOLD, M1, M2, FONT } = E;
  const { GRAVITY, JUMP_V, DBL_V, RISE_CUT, ENEMIES, MINIBOSSES } = D;

  let W = null, PL = null;
  // ax / ay : joystick analogique (-1..1, ay positif vers le bas) ; les booléens viennent du clavier.
  const input = (Bt.input = { left: false, right: false, down: false, attack: false, ax: 0, ay: 0 });
  const resetInput = () => { for (const k in input) input[k] = typeof input[k] === 'number' ? 0 : false; };
  Bt.get = () => W;
  Bt.player = () => PL;
  const save = () => P.save;
  // Hauteurs adaptées aux arènes basses (téléphone en paysage) tout en restant atteignables au saut puis au double saut.
  const plats = () => { const lo = Math.min(118, E.GY * 0.38), hi = Math.min(228, E.GY * 0.68); return [{ x: E.VW * 0.2, w: 150, alt: lo }, { x: E.VW * 0.8, w: 150, alt: lo }, { x: E.VW * 0.5, w: 130, alt: hi }]; };
  // Bords de l'arène : on reste hors de l'encoche et des coins arrondis du téléphone.
  const inArena = (x, margin) => clamp(x, E.safeL + margin, E.VW - E.safeR - margin);
  const flyAlt = () => Math.min(rand(150, 240), E.GY - 70);

  Bt.start = function (opts = {}) {
    const mods = G.mods;
    W = {
      wave: 0, score: 0, coins: 0, kills: 0, enemies: [], bullets: [], drops: [], queue: [], spawnT: 0, boss: null, bossHit: false, bossWonT: 0,
      phase: 'intro', phaseT: 1.2, t: 0, secret: !!opts.secret, laser: 0, shield: 0, hyper: 0, magnet: 0, drone: 0, droneT: 0, ammo: 0,
      swing: 0, leechCount: 0, bossCount: 0, eliteCount: 0, weapon: D.byId(D.WEAPONS, save().weapon) || D.WEAPONS[0], picks: [],
    };
    PL = { x: E.VW * 0.3, alt: 0, vx: 0, vy: 0, facing: 1, onGround: true, plat: null, air: mods.airJumps, held: false, buf: 0, fresh: false,
      hp: mods.hp, maxHp: mods.hp, inv: 1, dashT: 0, dashCd: 0, atkCd: 0, atkT: 0, combo: 0, comboT: 0, hurtT: 0, runT: 0, squash: 0, spin: 0,
      drop: 0, dead: false, deadT: 0, jet: 0, victoryT: 0 };
    resetInput();
    B.clear();
    E.setZone(Math.floor(Math.random() * 4), true);
  };
  const melee = () => G.mods.ch.attack === 'melee';
  const pbox = () => ({ x: PL.x - 13, y: PL.alt + 2, w: 26, h: 42 });

  // ───────────── Commandes ─────────────
  // Attaque mémorisée : un appui plus bref qu'une image déclenche quand même un coup (maintenir = attaque continue).
  Bt.pressAttack = () => { input.attack = true; if (PL && !PL.dead) PL.atkBuf = 0.2; };
  Bt.releaseAttack = () => { input.attack = false; };
  Bt.pressJump = () => { if (!PL || PL.dead) return; PL.held = true; PL.buf = 0.14; PL.fresh = true; };
  Bt.releaseJump = () => { if (PL) PL.held = false; };
  Bt.pressDown = () => { if (!PL || PL.dead) return; input.down = true; if (PL.onGround && PL.plat) { PL.drop = 0.25; PL.onGround = false; PL.plat = null; } else if (!PL.onGround) PL.vy = Math.min(PL.vy, -200); };
  Bt.releaseDown = () => { input.down = false; };
  Bt.dash = function () {
    if (!PL || PL.dead || PL.dashCd > 0) return;
    const dir = input.left ? -1 : input.right ? 1 : PL.facing;
    PL.facing = dir; PL.dashT = 0.18; PL.dashCd = 0.85 * G.mods.dashCd; PL.inv = Math.max(PL.inv, 0.28);
    E.sfx('dash'); E.emit(PL.x, E.GY - PL.alt - 20, 12, { c: G.pal(E.clock).glow, sp: 200, life: 0.3, size: 8, ang: dir > 0 ? Math.PI : 0, spread: 0.5 });
  };
  Bt.releaseAll = () => { resetInput(); if (PL) PL.held = false; };
  // Joystick : vers le bas = descendre d'une plateforme / chute rapide (avec hystérésis pour éviter les doubles déclenchements).
  Bt.setStick = function (x, y) {
    input.ax = x; input.ay = y;
    if (y > 0.72 && !PL_stickDown) { PL_stickDown = true; Bt.pressDown(); }
    else if (y < 0.45 && PL_stickDown) { PL_stickDown = false; Bt.releaseDown(); }
  };
  let PL_stickDown = false;

  // ───────────── Joueur ─────────────
  function jump(v, dbl) {
    PL.vy = v; PL.onGround = false; PL.plat = null; PL.buf = 0; PL.squash = -0.3;
    if (dbl) { PL.air--; PL.spin = 1; E.emit(PL.x, E.GY - PL.alt - 10, 1, { c: G.pal(E.clock).glow, life: 0.35, size: 34, kind: 2 }); } else PL.air = G.mods.airJumps;
    E.sfx(dbl ? 'dbl' : 'jump'); P.stat('jumps'); if (dbl) P.stat('doubleJumps');
  }
  function updatePlayer(dt) {
    const VW = E.VW, mods = G.mods, sp = 290 * mods.speed * G.boost.speed * (W.hyper > 0 ? 1.6 : 1) * (PL.jet > 0 ? 1.3 : 1);
    PL.inv -= dt; PL.dashCd -= dt; PL.atkCd -= dt; PL.drop -= dt; if (PL.hurtT > 0) PL.hurtT -= dt; if (PL.victoryT > 0) PL.victoryT -= dt;
    if (PL.comboT > 0 && (PL.comboT -= dt) <= 0) PL.combo = 0;
    const keys = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dir = keys || (Math.abs(input.ax) > 0.05 ? input.ax : 0); // analogique : la vitesse suit l'inclinaison
    if (dir && PL.atkT <= 0) PL.facing = Math.sign(dir);
    if (PL.coyote > 0) PL.coyote -= dt;
    if (PL.dashT > 0) { PL.dashT -= dt; PL.vx = PL.facing * 900; }
    else { const acc = PL.onGround ? 2600 : 1500; PL.vx += clamp(dir * sp - PL.vx, -acc * dt, acc * dt); }
    PL.x = inArena(PL.x + PL.vx * dt, 16);
    if (PL.jet > 0) {
      PL.jet -= dt; PL.onGround = false; PL.plat = null;
      // En vol, le joystick pilote réellement dans toutes les directions.
      const tv = Math.abs(input.ay) > 0.2 ? -input.ay * 300 : PL.held ? 260 : input.down ? -260 : 0; PL.vy += (tv - PL.vy) * Math.min(1, dt * 6);
      PL.alt = clamp(PL.alt + PL.vy * dt, 0, E.GY - 30);
      if (Math.random() < dt * 40) E.emit(PL.x - PL.facing * 6, E.GY - PL.alt + 2, 1, { c: HZ2, sp: 200, life: 0.3, size: 8, ang: Math.PI / 2, spread: 0.3 });
    } else {
      if (PL.buf > 0) {
        if (PL.onGround || PL.coyote > 0) { PL.coyote = 0; jump(JUMP_V, false); }
        else if (PL.fresh && PL.air > 0) jump(DBL_V * mods.dblBoost, true);
        PL.fresh = false; PL.buf -= dt;
      }
      if (!PL.onGround) {
        let g = GRAVITY; if (PL.vy > 0 && !PL.held) g *= RISE_CUT; if (input.down && PL.vy < 0) g *= 1.8;
        const prev = PL.alt; PL.vy -= g * dt; PL.alt += PL.vy * dt;
        if (PL.vy < 0 && PL.drop <= 0) for (const p of plats()) { // plateformes traversables par-dessous
          if (prev >= p.alt && PL.alt <= p.alt && Math.abs(PL.x - p.x) < p.w / 2) { PL.alt = p.alt; PL.plat = p; landP(); break; }
        }
        if (PL.alt <= 0) { PL.alt = 0; PL.plat = null; landP(); }
      } else if (PL.plat && Math.abs(PL.x - PL.plat.x) > PL.plat.w / 2) { PL.onGround = false; PL.plat = null; PL.vy = 0; PL.coyote = 0.1; PL.air = G.mods.airJumps; }
    }
    if (PL.spin > 0) PL.spin = Math.max(0, PL.spin - dt / 0.38);
    PL.squash += (0 - PL.squash) * Math.min(1, dt * 12);
    PL.runT += dt * 10 * Math.min(1.5, Math.abs(PL.vx) / 200);
    if (PL.atkT > 0) PL.atkT -= dt;
    if (input.attack || PL.atkBuf > 0) attack();
    if (PL.atkBuf > 0) PL.atkBuf -= dt;
  }
  function landP() { const imp = -PL.vy; PL.vy = 0; PL.onGround = true; PL.air = G.mods.airJumps; PL.squash = Math.min(0.4, imp / 2400); if (imp > 520) { E.sfx('land'); E.emit(PL.x, E.GY - PL.alt - 1, 5, { c: '#ffffff', sp: 120, life: 0.25, size: 5, ang: -Math.PI / 2, spread: 1.4 }); } }

  // ───────────── Attaques ─────────────
  const dmgMul = () => G.mods.dmg * G.boost.dmg;
  const crit = () => (Math.random() < G.boost.crit ? 2 : 1);
  function attack() {
    if (PL.atkCd > 0 || PL.dead) return;
    PL.atkBuf = 0;
    const rateK = G.boost.rate * (W.ammo > 0 ? 1.6 : 1);
    if (melee()) {
      PL.combo = PL.comboT > 0 ? (PL.combo + 1) % 3 : 0; PL.comboT = 0.7;
      const big = PL.combo === 2 && G.mods.ch.perk.id === 'blade';
      PL.atkT = 0.32; PL.atkCd = 0.34 / rateK; W.swing++;
      const sw = { id: W.swing, t: 0, dmg: 26 * dmgMul() * G.mods.melee * (big ? 1.6 : 1), range: big ? 96 : 78 };
      W.slash = sw; E.sfx('slash');
    } else {
      const w = W.weapon; PL.atkT = 0.12; PL.atkCd = w.rate / rateK;
      const n = w.pellets || 1, aim = aimAngle();
      for (let i = 0; i < n; i++) {
        const a = aim + (n > 1 ? (i / (n - 1) - 0.5) * w.spread : 0) + (w.spread && n === 1 ? rand(-w.spread, w.spread) : 0);
        W.bullets.push({ x: PL.x + PL.facing * 4, a: PL.alt + 26, vx: Math.cos(a) * w.speed * PL.facing, va: Math.sin(a) * w.speed, dmg: w.dmg * dmgMul() * crit(), pierce: w.pierce || 0, splash: w.splash || 0, life: 1.2, hit: new Set() }); // part du centre : touche aussi un ennemi au contact
      }
      E.sfx('shoot');
      E.emit(PL.x + PL.facing * 22, E.GY - PL.alt - 26, 3, { c: G.pal(E.clock).glow, sp: 120, life: 0.15, size: 8 });
    }
  }
  // Visée assistée : vise la cible la plus proche devant soi (volants compris), angle limité à ±55°.
  function aimAngle() {
    let best = null, bd = 700;
    const consider = (x, a) => { const dx = (x - PL.x) * PL.facing, d = Math.hypot(dx, a - PL.alt - 26); if (dx > -10 && d < bd) { bd = d; best = [Math.max(1, dx), a - PL.alt - 26]; } };
    for (const e of W.enemies) if (!e.dead) consider(e.x, e.alt + (e.def.fly ? 0 : e.h / 2));
    if (W.boss && W.boss.state === 'fight') { const c = B.center(W.boss); consider(c.x, c.a); }
    return best ? clamp(Math.atan2(best[1], best[0]), -0.96, 0.96) : 0;
  }
  function slashTick(dt) {
    const s = W.slash; if (!s) return;
    s.t += dt;
    if (s.t > 0.2) { W.slash = null; return; }
    if (s.t < 0.04) return;
    const x0 = PL.facing > 0 ? PL.x : PL.x - s.range, hb = { x: x0, y: PL.alt - 6, w: s.range, h: 66 };
    for (const e of W.enemies) if (!e.dead && !e.swings.has(s.id) && D.overlap(hb, ebox(e))) { e.swings.add(s.id); hurtEnemy(e, s.dmg * crit(), PL.facing); }
    if (W.boss && W.boss.state === 'fight' && !W.boss['s' + s.id] && D.overlap(hb, B.box(W.boss))) { W.boss['s' + s.id] = 1; hitBoss(s.dmg); }
  }
  function hitBoss(n) {
    const b = W.boss; if (!b) return;
    E.floatText(Math.round(n), b.x + rand(-20, 20), E.GY - b.alt - 30, '#ffffff', 15); E.sfx('hit');
    if (B.damage(b, n)) bossDefeated();
  }

  // ───────────── Ennemis ─────────────
  function spawnEnemy(type, opts = {}) {
    const def = ENEMIES[type], scale = D.enemyScale(W.wave), VW = E.VW, side = opts.x != null ? opts.x : Math.random() < 0.5 ? -30 : VW + 30;
    const elite = !opts.mini && type !== 'goldbat' && Math.random() < D.eliteChance(W.wave);
    const hp = def.hp * scale * (elite ? 2.4 : 1);
    const e = { type, def, x: side, alt: def.fly ? flyAlt() : 0, vx: 0, va: 0, hp, maxHp: hp, facing: side < VW / 2 ? 1 : -1, t: rand(0, 3),
      atkT: rand(1, 2.5), state: 'move', stT: 0, elite, mini: opts.mini || null, sc: opts.scale || 1, hitT: 0, dead: false, deadT: 0, swings: new Set(), life: type === 'goldbat' ? 9 : 1e9,
      speed: def.speed * (elite ? 1.25 : 1) * (opts.speedK || 1), w: def.w * (opts.scale || 1), h: def.h * (opts.scale || 1) };
    if (type === 'turret') { e.x = rand(80 + E.safeL, VW - 80 - E.safeR); e.alt = 0; e.facing = e.x < PL.x ? 1 : -1; E.emit(e.x, E.GY, 20, { c: HZ, sp: 200, life: 0.5, size: 10, ang: -Math.PI / 2, spread: 1 }); }
    if (opts.mini) { const mb = MINIBOSSES[opts.mini]; e.hp = e.maxHp = mb.hp * D.enemyScale(W.wave); e.speed = mb.speed; e.name = mb.name; e.mcoins = mb.coins; e.mscore = mb.score; e.summonT = 6; }
    W.enemies.push(e);
    return e;
  }
  const ebox = e => ({ x: e.x - e.w / 2, y: e.alt + (e.def.fly ? -e.h / 2 : 0), w: e.w, h: e.h });
  function hurtEnemy(e, n, dir) {
    if (e.dead) return;
    e.hp -= n; e.hitT = 0.12;
    if (!e.mini && e.type !== 'golem') { e.vx = dir * 160; if (!e.def.fly) e.va = 120; }
    E.floatText(Math.round(n), e.x + rand(-10, 10), E.GY - e.alt - e.h - 6, n >= 40 ? GOLD : '#ffffff', n >= 40 ? 17 : 13);
    E.emit(e.x, E.GY - e.alt - e.h / 2, 5, { c: e.elite ? GOLD : HZ, sp: 200, life: 0.3, size: 7 });
    E.sfx('hit');
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.dead = true; e.deadT = 0;
    const GY = E.GY, cy = GY - e.alt - e.h / 2;
    E.emit(e.x, cy, 18, { c: e.elite ? GOLD : HZ, sp: 320, life: 0.6, size: 10, g: 500 });
    if (e.type === 'bomber') explode(e.x, e.alt + 15, 1);
    const coins = Math.round((e.mcoins || e.def.coins) * (e.elite ? 4 : 1) * rand(0.8, 1.2));
    for (let i = 0; i < Math.min(8, coins); i++) W.drops.push({ k: 'coin', v: Math.ceil(coins / Math.min(8, coins)), x: e.x + rand(-14, 14), alt: e.alt + e.h / 2, vx: rand(-120, 120), va: rand(200, 420), t: 0 });
    const r = Math.random();
    if (e.elite || e.mini) W.drops.push({ k: 'medkit', x: e.x, alt: e.alt + 20, vx: 0, va: 300, t: 0 });
    else if (r < 0.07) W.drops.push({ k: 'heart', x: e.x, alt: e.alt + 20, vx: 0, va: 300, t: 0 });
    else if (r < 0.12) W.drops.push({ k: 'ammo', x: e.x, alt: e.alt + 20, vx: 0, va: 300, t: 0 });
    else if (r < 0.16) W.drops.push({ k: 'battery', x: e.x, alt: e.alt + 20, vx: 0, va: 300, t: 0 });
    W.score += Math.round((e.mscore || e.def.score) * (e.elite ? 3 : 1) * (1 + 0.1 * W.wave));
    W.kills++; P.stat('kills');
    if (e.elite) { P.stat('elites'); E.floatText('ÉLITE !', e.x, cy - 30, GOLD, 18); if (Math.random() < 0.12) P.reward({ loot: 'rare' }, `elite:${P.game.id}:${W.kills}`, 'Élite vaincue'); }
    if (e.type === 'goldbat') { E.sfx('rare'); E.floatText('JACKPOT !', e.x, cy - 30, GOLD, 20); }
    if (G.boost.leech && W.kills % 20 === 0 && PL.hp < PL.maxHp) { PL.hp++; E.floatText('+1 PV', PL.x, E.GY - PL.alt - 70, '#ff3e8a', 16); }
    E.sfx('smash');
  }
  function explode(x, alt, fromEnemy) {
    E.sfx('boom'); E.shake(8, 0.3);
    E.emit(x, E.GY - alt, 30, { c: HZ2, sp: 420, life: 0.6, size: 12 }); E.emit(x, E.GY - alt, 1, { c: HZ2, life: 0.4, size: 90, kind: 2 });
    if (Math.hypot(PL.x - x, PL.alt + 22 - alt) < 90) hurtPlayer(2);
    if (fromEnemy) for (const o of W.enemies) if (!o.dead && Math.hypot(o.x - x, o.alt - alt) < 90) hurtEnemy(o, 40, Math.sign(o.x - x) || 1);
  }
  function enemyAI(e, dt) {
    const GY = E.GY, dx = PL.x - e.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1, d = e.def;
    e.t += dt; if (e.hitT > 0) e.hitT -= dt; e.stT += dt;
    if ((e.life -= dt) <= 0) { e.dead = true; e.deadT = 1; return; }
    if (e.type !== 'turret' && e.state !== 'charge') e.facing = dir;
    if (d.fly) {
      let tx = PL.x, ta = PL.alt + 70;
      if (e.type === 'drone') { tx = PL.x - dir * 220; ta = 190; }
      if (e.type === 'goldbat') { tx = PL.x - dir * 400; ta = 200 + Math.sin(e.t * 2) * 60; }
      if (e.type === 'bat' && e.state === 'dive') { tx = e.dx; ta = e.da; if (e.stT > 0.8) e.state = 'move'; }
      else if (e.type === 'bat' && (e.atkT -= dt) <= 0) { e.state = 'dive'; e.stT = 0; e.dx = PL.x; e.da = PL.alt + 20; e.atkT = rand(2, 3.5); }
      const k = e.state === 'dive' ? 3 : 1, sp = e.speed * k;
      const vx = clamp(tx - e.x, -sp, sp), va = clamp(ta + Math.sin(e.t * 4) * 20 - e.alt, -sp, sp);
      e.x += (vx + e.vx) * dt; e.alt = clamp(e.alt + va * dt, 30, GY - 20); e.vx *= 0.9;
      if (e.type === 'drone' && (e.atkT -= dt) <= 0) { e.atkT = rand(2, 2.8) / (1 + W.wave * 0.03); const ax = PL.x - e.x, aa = PL.alt + 22 - e.alt, dd = Math.hypot(ax, aa) || 1; B.orb(e.x, e.alt, (ax / dd) * 300, (aa / dd) * 300, { col: HZ, r: 7, life: 3 }); E.sfx('shoot'); }
      return;
    }
    // Ennemis au sol
    if (e.va || e.alt > 0) { e.va -= GRAVITY * dt; e.alt = Math.max(0, e.alt + e.va * dt); if (e.alt === 0) e.va = 0; }
    e.x += e.vx * dt; e.vx *= Math.pow(0.02, dt);
    if (e.type === 'turret') {
      if ((e.atkT -= dt) <= 0) { e.atkT = 3.6; e.facing = dir; B.beam(6, 36, 1.0, 0.3, HZ, e.facing > 0 ? e.x : -40, e.facing > 0 ? E.VW + 40 : e.x); }
      return;
    }
    if (e.type === 'bomber' && adx < 70 && e.state !== 'fuse') { e.state = 'fuse'; e.stT = 0; }
    if (e.state === 'fuse') { if (e.stT > 0.7) { e.dead = true; e.deadT = 0; explode(e.x, 15, 0); } return; }
    if ((e.type === 'golem') && e.state === 'move' && adx < 320 && Math.abs(PL.alt) < 40 && (e.atkT -= dt) <= 0) { e.state = 'wind'; e.stT = 0; e.cdir = dir; }
    if (e.state === 'wind') { if (e.stT > 0.6) { e.state = 'charge'; e.stT = 0; } return; }
    if (e.state === 'charge') { e.x += e.cdir * 460 * dt; e.facing = e.cdir; if (e.stT > 0.8 || e.x < 20 || e.x > E.VW - 20) { e.state = 'move'; e.atkT = rand(2.5, 4); if (e.mini === 'alpha') { B.wave(e.x, -1, 340, 28, '#ffb13e', false); B.wave(e.x, 1, 340, 28, '#ffb13e', false); E.shake(8, 0.3); } } return; }
    if (e.type === 'skel') {
      if (e.state === 'atk') { if (e.stT > 0.45 && !e.struck) { e.struck = true; const hb = { x: e.facing > 0 ? e.x : e.x - 50 * e.sc, y: 0, w: 50 * e.sc, h: 46 * e.sc }; if (D.overlap(hb, pbox())) hurtPlayer(e.mini ? 2 : 1); } if (e.stT > 0.8) { e.state = 'move'; e.atkT = 1.2; } return; }
      if (adx < 44 * e.sc && (e.atkT -= dt) <= 0) { e.state = 'atk'; e.stT = 0; e.struck = false; return; }
      if (e.mini && (e.summonT -= dt) <= 0) { e.summonT = 8; spawnEnemy('skel', { x: e.x - 40 }); spawnEnemy('skel', { x: e.x + 40 }); E.sfx('alarm'); }
      if (e.mini && Math.random() < dt * 0.4) { const T = 1, vx = (PL.x - e.x) / T; B.orb(e.x, 80, vx, 0.5 * 1400 * T - 80 / T, { g: 1400, r: 10, bone: true, col: '#e8e0c8' }); }
    }
    if (e.type === 'scarab' && PL.alt > 60 && e.alt === 0 && Math.random() < dt * 0.8) e.va = 520;
    if (adx > 8) e.x += dir * e.speed * dt * (e.state === 'move' ? 1 : 0);
  }

  // Les ennemis au sol se repoussent doucement : une file reste lisible au lieu d'un seul tas.
  function separate(dt) {
    const g = W.enemies.filter(e => !e.dead && !e.def.fly && e.type !== 'turret');
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
      const a = g[i], b = g[j], min = (a.w + b.w) * 0.42, dx = b.x - a.x;
      if (Math.abs(dx) >= min || Math.abs(a.alt - b.alt) > 20) continue;
      const push = (min - Math.abs(dx)) * Math.min(1, dt * 6) * (dx < 0 ? -1 : 1);
      if (a.state !== 'charge') a.x -= push / 2;
      if (b.state !== 'charge') b.x += push / 2;
    }
  }
  // Rotation du téléphone ou redimensionnement : tout reste dans l'arène.
  Bt.fit = function () {
    if (!W || !PL) return;
    PL.x = inArena(PL.x, 16); PL.alt = Math.min(PL.alt, E.GY - 30);
    if (PL.plat) { PL.plat = null; PL.onGround = false; }
    for (const e of W.enemies) { if (e.type === 'turret') e.x = inArena(e.x, 60); if (e.def.fly) e.alt = Math.min(e.alt, E.GY - 30); }
  };
  // Scène figée pour l'éditeur de commandes : le joueur voit où se placent ses boutons par rapport à l'action.
  Bt.preview = function () {
    Bt.start(); PL.inv = 0; W.phase = 'preview';
    spawnEnemy('scarab', { x: E.VW * 0.66 }); spawnEnemy('skel', { x: E.VW * 0.82 }); spawnEnemy('drone', { x: E.VW * 0.58 });
    for (const e of W.enemies) { e.elite = false; e.hp = e.maxHp; }
  };

  // ───────────── Dégâts au joueur ─────────────
  function hurtPlayer(n) {
    if (PL.dead || PL.inv > 0 || W.hyper > 0 || PL.dashT > 0) return;
    if (W.shield > 0) { E.sfx('shield'); E.emit(PL.x, E.GY - PL.alt - 24, 12, { c: '#7df9ff', sp: 200, life: 0.4, size: 8 }); PL.inv = 0.4; return; }
    if (W.boss) W.bossHit = true;
    PL.hp -= n; PL.inv = 1.0; PL.hurtT = 0.3; E.flash = 0.3; E.shake(8, 0.25); E.sfx('hurt');
    PL.vx = -PL.facing * 260; if (PL.onGround) { PL.vy = 300; PL.onGround = false; PL.plat = null; }
    if (PL.hp <= 0) {
      if (G.trySecond()) { PL.hp = Math.max(2, Math.ceil(PL.maxHp / 2)); PL.inv = 2.2; E.flash = 0.8; E.floatText('SECONDE CHANCE !', PL.x, E.GY - PL.alt - 80, '#ff3e8a', 20); B.hz.length = 0; return; }
      PL.hp = 0; die();
    }
  }
  function die() {
    PL.dead = true; PL.deadT = 0; E.sfx('death'); E.shake(14, 0.5); E.flash = 0.6;
    E.emit(PL.x, E.GY - PL.alt - 24, 40, { c: G.pal(E.clock).glow, sp: 480, life: 1, size: 12, g: 500 });
    Bt.releaseAll(); LR.UI.onDeath();
  }

  // ───────────── Vagues et boss ─────────────
  function nextWave() {
    W.wave++;
    const VW = E.VW;
    if (W.secret) { W.phase = 'boss'; startBoss(D.byId(D.BOSSES, 'neant')); return; }
    P.stat('wave', W.wave, true);
    if (W.wave % 5 === 0) { W.phase = 'boss'; startBoss(D.pickBoss(save(), Math.random)); return; }
    W.queue = D.waveList(W.wave, Math.random);
    const mb = D.miniBossFor(W.wave);
    if (mb) { const m = MINIBOSSES[mb]; spawnEnemy(m.base, { mini: mb, scale: m.scale, x: VW + 40 }); LR.UI.banner(`VAGUE ${W.wave}`, 'Mini-boss : ' + m.name, '#ffb13e'); E.sfx('alarm'); }
    else LR.UI.banner(`VAGUE ${W.wave}`, W.queue.length + ' ennemis', E.accentHex());
    W.phase = 'fight'; W.spawnT = 0.6;
    E.setZone(W.wave - 1);
  }
  function startBoss(def) {
    const s = save(), scale = D.bossScale(W.bossCount, P.level().level);
    W.boss = B.create(def, 'battle', scale, D.bossAggression(W.bossCount, P.level().level)); W.bossHit = false;
    s.bosses[def.id] = s.bosses[def.id] || { kills: 0, seen: 0 }; s.bosses[def.id].seen++;
    E.music.boss = true; E.sfx('alarm'); E.shake(10, 0.6);
    LR.UI.banner('⚠ ' + def.name, def.title + (W.secret ? ' · salle cachée' : ''), def.col);
    LR.UI.bossBar(W.boss);
  }
  function bossCtx() { return { mode: 'battle', px: PL.x, pa: PL.alt + 22, speed: 0, summon: (type, x) => spawnEnemy(type === 'droneLo' ? 'drone' : type, { x: x + rand(-40, 40) }) }; }
  function bossDefeated() {
    const b = W.boss, s = save();
    E.sfx('boom'); E.shake(16, 0.8); E.flash = 0.7;
    E.emit(b.x, E.GY - b.alt, 60, { c: b.def.col, sp: 600, life: 1.2, size: 14 });
    LR.UI.banner('VICTOIRE !', b.def.name + ' vaincu', '#4dffb8');
    const bundle = D.bossReward(b.def, s, W.bossCount); // calculé avant le compteur : la récompense de premier kill en dépend
    s.bosses[b.id].kills++;
    if (!W.bossHit) s.flags.bossNoHit = true;
    if (W.secret) { s.flags.room = true; s.stats.secrets++; }
    P.stat('bosses');
    P.reward(bundle, `boss:${P.game.id}:b${W.bossCount}`, 'Boss vaincu : ' + b.def.name);
    W.score += 8000; W.bossCount++; W.bossWonT = 2; PL.victoryT = 1.8;
    for (const e of W.enemies) if (!e.dead) killEnemy(e);
    E.music.boss = false;
  }
  function waveCleared() {
    W.phase = 'break'; W.phaseT = 1.2;
    const bonus = 15 + 5 * W.wave;
    W.coins += bonus; P.stat('coins', bonus); P.stat('wavesCleared');
    if (PL.hp < PL.maxHp) PL.hp++;
    for (const d of W.drops) if (d.k === 'coin') { W.coins += d.v; P.stat('coins', d.v); }
    W.drops = W.drops.filter(d => d.k !== 'coin');
    E.floatText(`VAGUE ${W.wave} TERMINÉE · +${bonus} ◆`, E.VW / 2, E.GY - 200, '#4dffb8', 20); E.sfx('mission');
    if (W.secret) { W.phase = 'done'; LR.UI.onDeath(true); return; }
  }
  // Choix d'un bonus entre deux vagues (appelé par l'interface).
  Bt.offerBoosts = () => { const pool = D.WAVE_BOOSTS.slice(), out = []; while (out.length < 3) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]); return out; };
  Bt.pickBoost = function (id) {
    const b = G.boost; W.picks.push(id);
    if (id === 'power') b.dmg *= 1.2; else if (id === 'rate') b.rate *= 1.15; else if (id === 'vital') { PL.maxHp++; PL.hp++; }
    else if (id === 'heal') PL.hp = PL.maxHp; else if (id === 'swift') b.speed *= 1.12; else if (id === 'focus') b.cd *= 0.85;
    else if (id === 'crit') b.crit = Math.min(0.6, b.crit + 0.15); else if (id === 'leech') b.leech = 1; else if (id === 'greed') b.greed = true;
    W.phase = 'intro'; W.phaseT = 1.2;
  };
  Bt.needsBoost = () => W && W.phase === 'break' && W.phaseT <= 0;

  // ───────────── Compétences ─────────────
  Bt.useSkill = function (i) {
    if (!W || PL.dead) return;
    G.use(i, (id, sl) => {
      if (id === 'jetpack') { PL.jet = sl.dur; PL.vy = 200; }
      else if (id === 'shield') W.shield = sl.dur;
      else if (id === 'hyper') W.hyper = sl.dur;
      else if (id === 'magnet') W.magnet = sl.dur;
      else if (id === 'drone') W.drone = sl.dur;
      else if (id === 'laser') { W.laser = sl.dur; E.sfx('laser'); }
      else if (id === 'bomb') {
        const dmg = 90 * G.mods.laser, x = PL.x, a = PL.alt + 22;
        E.sfx('boom'); E.shake(10, 0.4); E.flash = 0.3;
        E.emit(x, E.GY - a, 1, { c: '#ff9f1c', life: 0.5, size: 180, kind: 2 }); E.emit(x, E.GY - a, 40, { c: '#ff9f1c', sp: 500, life: 0.6, size: 12 });
        for (const e of W.enemies) if (!e.dead && Math.hypot(e.x - x, e.alt - a) < 180) hurtEnemy(e, dmg, Math.sign(e.x - x) || 1);
        if (W.boss && Math.hypot(W.boss.x - x, B.center(W.boss).a - a) < 220) hitBoss(dmg);
        for (let k = B.hz.length - 1; k >= 0; k--) if (B.hz[k].k === 'orb') B.hz.splice(k, 1);
      }
      PL.atkT = 0.25;
    });
  };
  function skillTicks(dt) {
    for (const k of ['shield', 'hyper', 'magnet', 'drone', 'ammo']) if (W[k] > 0) W[k] -= dt;
    if (W.laser > 0) {
      W.laser -= dt;
      const dps = 130 * G.mods.laser, a0 = PL.alt, a1 = PL.alt + 50;
      for (const e of W.enemies) { const b = ebox(e); if (!e.dead && b.y < a1 && b.y + b.h > a0 && (PL.facing > 0 ? e.x > PL.x : e.x < PL.x)) { e.laserAcc = (e.laserAcc || 0) + dps * dt; if (e.laserAcc > 10) { hurtEnemy(e, e.laserAcc, PL.facing); e.laserAcc = 0; } } }
      if (W.boss && W.boss.state === 'fight') { const b = B.box(W.boss); if (b.y < a1 && b.y + b.h > a0 && (PL.facing > 0 ? W.boss.x > PL.x : W.boss.x < PL.x)) { W.bAcc = (W.bAcc || 0) + dps * dt; if (W.bAcc > 20) { hitBoss(W.bAcc); W.bAcc = 0; } } }
    }
    if (W.hyper > 0) for (const e of W.enemies) if (!e.dead && D.overlap(pbox(), ebox(e)) && !(e.hyT > 0)) { e.hyT = 0.4; hurtEnemy(e, 40 * dmgMul(), PL.facing); }
    for (const e of W.enemies) if (e.hyT > 0) e.hyT -= dt;
    if (W.drone > 0 || G.mods.permaDrone) {
      if ((W.droneT -= dt * G.mods.droneRate * (W.drone > 0 ? 1 : 0.5)) <= 0) {
        W.droneT = 0.55;
        let tgt = null, best = 1e9;
        for (const e of W.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - PL.x, e.alt - PL.alt); if (d < best && d < 420) { best = d; tgt = e; } }
        const dxp = PL.x - PL.facing * 20, dap = PL.alt + 64;
        const tx = tgt ? tgt.x : W.boss && W.boss.state === 'fight' ? W.boss.x : null, ta = tgt ? tgt.alt + tgt.h / 2 : W.boss ? B.center(W.boss).a : 0;
        if (tx != null) { const ax = tx - dxp, aa = ta - dap, d = Math.hypot(ax, aa) || 1; W.bullets.push({ x: dxp, a: dap, vx: (ax / d) * 900, va: (aa / d) * 900, dmg: 10 * G.mods.droneRate, pierce: 0, splash: 0, life: 1, hit: new Set(), drone: true }); }
      }
    }
  }

  // ───────────── Mise à jour ─────────────
  Bt.update = function (dt) {
    const GY = E.GY;
    W.t += dt; E.bgX += 18 * dt;
    if (PL.dead) { PL.deadT += dt; E.stepFx(dt, 0); return; }
    G.step(dt);
    if (W.phase === 'intro' && (W.phaseT -= dt) <= 0) nextWave();
    if (W.phase === 'break') W.phaseT -= dt;
    if (W.phase === 'fight') {
      if (W.queue.length && (W.spawnT -= dt) <= 0) {
        const alive = W.enemies.filter(e => !e.dead && e.type !== 'goldbat').length;
        if (alive < Math.min(10, 4 + Math.floor(W.wave / 2))) { spawnEnemy(W.queue.shift()); W.spawnT = rand(0.5, 1.2) / (1 + W.wave * 0.04); }
        else W.spawnT = 0.4;
      }
      if (!W.queue.length && !W.enemies.some(e => !e.dead && e.type !== 'goldbat')) waveCleared();
    }
    if (W.boss) {
      B.update(W.boss, dt, bossCtx());
      if (W.boss.state === 'dead' && (W.bossWonT -= dt) <= 0) { W.boss = null; LR.UI.bossBar(null); waveCleared(); LR.UI.flushReveals(); }
    }
    updatePlayer(dt);
    skillTicks(dt);
    slashTick(dt);
    for (const e of W.enemies) {
      if (e.dead) { e.deadT += dt; continue; }
      enemyAI(e, dt);
      // Contact : hitbox réduite de 15 % par rapport au dessin, pour ne pas être touché « de peu ».
      const hb = ebox(e), inset = hb.w * 0.075;
      hb.x += inset; hb.w -= inset * 2;
      if (e.type !== 'goldbat' && D.overlap(pbox(), hb) && W.hyper <= 0) hurtPlayer(e.mini ? 2 : e.def.dmg);
    }
    separate(dt);
    W.enemies = W.enemies.filter(e => !e.dead || e.deadT < 0.6);
    // Projectiles du joueur
    for (let i = W.bullets.length - 1; i >= 0; i--) {
      const b = W.bullets[i]; b.x += b.vx * dt; b.a += b.va * dt; b.life -= dt;
      let gone = b.life <= 0 || b.x < -20 || b.x > E.VW + 20 || b.a < 0;
      if (!gone) for (const e of W.enemies) {
        if (e.dead || b.hit.has(e)) continue;
        const eb = ebox(e);
        if (b.x > eb.x && b.x < eb.x + eb.w && b.a > eb.y && b.a < eb.y + eb.h) {
          b.hit.add(e); hurtEnemy(e, b.dmg, Math.sign(b.vx));
          if (b.splash) { for (const o of W.enemies) if (!o.dead && o !== e && Math.hypot(o.x - b.x, o.alt - b.a) < b.splash) hurtEnemy(o, b.dmg * 0.6, Math.sign(o.x - b.x) || 1); E.emit(b.x, GY - b.a, 1, { c: HZ2, life: 0.35, size: b.splash, kind: 2 }); E.sfx('boom'); }
          if (b.pierce-- <= 0) { gone = true; break; }
        }
      }
      if (!gone && W.boss && W.boss.state === 'fight') { const bb = B.box(W.boss); if (b.x > bb.x && b.x < bb.x + bb.w && b.a > bb.y && b.a < bb.y + bb.h) { hitBoss(b.dmg); gone = true; } }
      if (gone) W.bullets.splice(i, 1);
    }
    // Butin au sol
    const magR = W.magnet > 0 ? G.mods.magnetR + 120 : 90;
    for (let i = W.drops.length - 1; i >= 0; i--) {
      const d = W.drops[i]; d.t += dt;
      const dist = Math.hypot(PL.x - d.x, PL.alt + 22 - d.alt);
      if (d.k === 'coin' && dist < magR && d.t > 0.3) { d.x += (PL.x - d.x) * Math.min(1, dt * 10); d.alt += (PL.alt + 22 - d.alt) * Math.min(1, dt * 10); }
      else { d.va -= 1400 * dt; d.x = inArena(d.x + d.vx * dt, 10); d.alt = Math.max(8, d.alt + d.va * dt); if (d.alt <= 8) { d.va = 0; d.vx *= 0.8; } }
      if (dist < 30 && d.t > 0.2) { W.drops.splice(i, 1); pickup(d); continue; }
      if (d.t > 14) W.drops.splice(i, 1);
    }
    B.stepHazards(dt, 0, 'battle');
    const h = B.hitTest(pbox()); if (h) { hurtPlayer(h.k === 'strike' || h.r > 15 ? 2 : 1); if (h.k === 'orb') h.life = 0; }
    if (W.boss && B.bodyHits(W.boss, pbox())) hurtPlayer(2);
    E.stepFx(dt, 0);
  };
  function pickup(d) {
    if (d.k === 'coin') { W.coins += d.v; P.stat('coins', d.v); E.sfx('coin', 2); return; }
    E.sfx('power');
    if (d.k === 'heart') { PL.hp = Math.min(PL.maxHp, PL.hp + 1); E.floatText('+1 PV', PL.x, E.GY - PL.alt - 70, '#ff3e8a', 16); }
    if (d.k === 'medkit') { PL.hp = PL.maxHp; E.floatText('SOIN COMPLET', PL.x, E.GY - PL.alt - 70, '#4dffb8', 16); }
    if (d.k === 'ammo') { W.ammo = 8; E.floatText('MUNITIONS +60 %', PL.x, E.GY - PL.alt - 70, GOLD, 16); }
    if (d.k === 'battery') { G.refreshCooldowns(0.5); E.floatText('RECHARGE !', PL.x, E.GY - PL.alt - 70, '#3ef2ff', 16); }
  }
  Bt.summary = () => ({ mode: 'battle', score: W.score, wave: W.wave, kills: W.kills, coins: W.coins, greed: G.boost.greed, bosses: W.bossCount, rankStart: D.rankFor(save().completed) });
  Bt.hud = () => ({ hp: PL.hp, maxHp: PL.maxHp, wave: W.wave, left: W.queue.length + W.enemies.filter(e => !e.dead && e.type !== 'goldbat').length, score: W.score, coins: W.coins, boss: W.boss, shield: W.shield, weapon: W.weapon, melee: melee() });

  // ───────────── Rendu ─────────────
  const DROP_ICON = { heart: 'gun:0,0', medkit: 'gun:2,1', ammo: 'gun:0,3', battery: 'gun:1,5' };
  Bt.render = function (g) {
    const GY = E.GY, clock = E.clock, ac = E.accentHex();
    E.beginFrame(g);
    E.drawBackdrop(g, E.bgX, clock);
    E.drawAmbient(g, clock, 20);
    for (const p of plats()) { // plateformes néon
      const y = GY - p.alt;
      glowAt(g, ac, p.x, y, p.w * 0.6, 0.25);
      rr(g, p.x - p.w / 2, y, p.w, 10, 4); g.fillStyle = 'rgba(10,4,30,0.85)'; g.fill(); g.strokeStyle = ac; g.lineWidth = 2; g.stroke();
      g.fillStyle = rgba(ac, 0.5); for (let x = p.x - p.w / 2 + 10; x < p.x + p.w / 2 - 10; x += 22) g.fillRect(x, y + 4, 10, 2);
    }
    for (const d of W.drops) {
      const y = GY - d.alt;
      if (d.k === 'coin') { const k = Math.cos(d.t * 6), sw = 6 * Math.max(0.2, Math.abs(k)); glowAt(g, GOLD, d.x, y, 14, 0.5); g.beginPath(); g.moveTo(d.x, y - 8); g.lineTo(d.x + sw, y); g.lineTo(d.x, y + 8); g.lineTo(d.x - sw, y); g.closePath(); g.fillStyle = k > 0 ? '#fff3b0' : '#ffc23d'; g.fill(); }
      else { glowAt(g, '#ffffff', d.x, y - 6, 22, 0.5 + 0.2 * Math.sin(d.t * 6)); E.drawIcon(g, DROP_ICON[d.k], d.x, y - 6 + Math.sin(d.t * 4) * 3, 22); }
    }
    for (const e of W.enemies) drawEnemy(g, e, clock);
    if (W.boss) B.draw(g, W.boss, clock);
    B.drawHazards(g, clock);
    for (const b of W.bullets) { const y = GY - b.a; glowAt(g, b.drone ? '#3ef2ff' : G.pal(clock).glow, b.x, y, b.splash ? 16 : 10, 1); g.fillStyle = '#fff'; g.fillRect(b.x - 3, y - 1.5, 6, 3); }
    drawPlayer(g, clock);
    if (W.slash) {
      const s = W.slash, k = s.t / 0.2, cx = PL.x + PL.facing * 20, cy = GY - PL.alt - 26;
      g.strokeStyle = rgba(G.pal(clock).glow, 1 - k); g.lineWidth = 6 * (1 - k) + 2;
      g.beginPath(); g.arc(cx, cy, s.range * 0.7, PL.facing > 0 ? -1.2 + k : Math.PI + 1.2 - k, PL.facing > 0 ? 0.9 : Math.PI - 0.9, PL.facing < 0); g.stroke();
    }
    if (W.laser > 0) {
      const y = GY - PL.alt - 26, x0 = PL.x + PL.facing * 16, len = PL.facing > 0 ? E.VW - x0 + 20 : -x0 - 20;
      g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(G.pal(clock).glow, 0.35); g.fillRect(x0, y - 12, len, 24);
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(x0, y - 2, len, 4); g.globalCompositeOperation = 'source-over';
    }
    E.drawFx(g);
    if (W.boss && W.boss.dark && W.boss.state === 'fight') {
      const gr = g.createRadialGradient(PL.x, GY - PL.alt - 22, 50, PL.x, GY - PL.alt - 22, 300);
      gr.addColorStop(0, 'rgba(2,0,10,0)'); gr.addColorStop(1, 'rgba(2,0,10,0.9)'); g.fillStyle = gr; g.fillRect(-20, -20, E.VW + 40, E.VH + 40);
      for (const h of B.hz) if (h.k === 'orb') glowAt(g, h.col, h.x, GY - h.a, 14, 1);
      for (const e of W.enemies) if (!e.dead) glowAt(g, HZ, e.x, GY - e.alt - e.h / 2, 14, 0.8);
    }
    E.vignette(g);
  };
  function drawEnemy(g, e, clock) {
    const GY = E.GY, yb = GY - e.alt, f = e.dead ? Math.max(0, 1 - e.deadT / 0.6) : 1;
    if (f <= 0) return;
    g.save(); g.globalAlpha = f;
    if (e.elite || e.type === 'goldbat') glowAt(g, GOLD, e.x, yb - e.h / 2, e.w * 1.2, 0.5 + 0.2 * Math.sin(clock * 6));
    else glowAt(g, e.type === 'skel' || e.type === 'bat' ? '#a66bff' : HZ, e.x, yb - (e.def.fly ? 0 : e.h / 2), e.w * 0.9, 0.3); // lisibilité sur le décor
    const flash = e.hitT > 0 ? '#ffffff' : null, tint = e.type === 'goldbat' ? GOLD : e.elite ? '#ffd34d' : null;
    if (e.type === 'skel') E.drawSprite(g, 'skel', e.dead ? 'dead' : e.state === 'atk' ? 'attack' : 'run', e.dead ? e.deadT * 8 : e.state === 'atk' ? e.stT * 9 : e.t * 9, e.x, yb, { facing: e.facing, scale: e.sc, flash, tint: e.mini ? '#9dff8a' : tint });
    else if (e.type === 'bat' || e.type === 'goldbat') E.drawSprite(g, 'bat', e.dead ? 'dead' : e.state === 'dive' ? 'attack' : 'run', (e.dead ? e.deadT : e.t) * 12, e.x, yb + e.h / 2 + 6, { facing: e.facing, flash, tint });
    else {
      g.translate(e.x, yb); if (e.facing > 0) g.scale(-1, 1); g.scale(e.sc, e.sc);
      if (flash) g.globalAlpha *= 0.6;
      const t = e.t;
      if (e.type === 'scarab') { const o = { type: 'crawler', d: D.OT.crawler, x: -18, y: 0, w: 36, h: 26, t }; g.translate(0, -GY); LR.Run.drawObstacle(g, o); }
      else if (e.type === 'drone') { const o = { type: 'droneLo', d: D.OT.droneLo, x: -24, y: 13, w: 48, h: 26, t }; g.translate(0, -GY); LR.Run.drawObstacle(g, o); }
      else if (e.type === 'turret') {
        g.translate(0, -GY); LR.Run.drawObstacle(g, { type: 'spike', d: D.OT.spike, x: -15, y: 0, w: 30, h: 44, t });
        if (e.atkT < 1) { g.globalAlpha *= 0.5 + 0.5 * Math.sin(clock * 30); glowAt(g, HZ, 0, GY - 40, 22, 1); }
      } else if (e.type === 'bomber') {
        const blink = e.state === 'fuse' && Math.floor(clock * 14) % 2;
        E.drawIcon(g, 'gun:1,2', 0, -16, 34);
        if (blink) glowAt(g, '#ffffff', 0, -16, 26, 1);
        g.strokeStyle = HZ2; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 3; i++) { const lx = -10 + i * 10; g.moveTo(lx, -4); g.lineTo(lx + Math.sin(t * 30 + i) * 4, 0); } g.stroke();
      } else if (e.type === 'golem') {
        g.translate(0, -GY); const k = e.state === 'wind' ? Math.sin(clock * 40) * 2 : 0; g.translate(k, 0);
        LR.Run.drawCrate(g, -22, GY, 44, 28, t); LR.Run.drawCrate(g, -20, GY - 28, 40, 28, t + 1.5);
        g.fillStyle = M2; g.fillRect(-30, GY - 46, 10, 22); g.fillRect(20, GY - 46, 10, 22);
      }
    }
    g.restore();
    if (!e.dead && (e.hp < e.maxHp || e.mini)) { // barre de vie
      const w = Math.max(30, e.w), y = yb - (e.def.fly ? e.h / 2 + 10 : e.h + 10);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x - w / 2, y, w, 4);
      g.fillStyle = e.mini ? '#ffb13e' : e.elite ? GOLD : HZ; g.fillRect(e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
      if (e.mini) { g.fillStyle = '#ffb13e'; g.font = `800 11px ${FONT}`; g.textAlign = 'center'; g.fillText(e.name, e.x, y - 5); }
    }
  }
  function drawPlayer(g, clock) {
    const GY = E.GY, pal = G.pal(clock), y = GY - PL.alt;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(PL.x, GY + 2, 16, 4, 0, 0, Math.PI * 2); g.fill();
    const moving = Math.abs(PL.vx) > 40;
    const st = PL.dead ? 'dead' : PL.hurtT > 0 ? 'hurt' : PL.atkT > 0 ? 'attack' : PL.victoryT > 0 ? 'victory' : PL.dashT > 0 ? 'slide' : !PL.onGround ? (PL.vy > 0 ? 'jump' : 'fall') : moving ? 'run' : 'idle';
    const pose = { st, t: st === 'attack' ? 0.32 - PL.atkT : st === 'dead' ? PL.deadT : clock, runT: PL.runT, vy: PL.vy, squash: PL.squash, spin: PL.spin, facing: PL.facing, alpha: PL.inv > 0 && !PL.dead && Math.floor(clock * 18) % 2 ? 0.4 : 1, blink: false, ant: 0.35 };
    E.drawChar(g, G.charId, PL.x, y, pose, pal);
    const cy = y - 24;
    if (W.shield > 0) { g.beginPath(); g.arc(PL.x, cy, 34, 0, Math.PI * 2); g.strokeStyle = rgba('#7df9ff', 0.85); g.lineWidth = 2; g.stroke(); glowAt(g, '#7df9ff', PL.x, cy, 50, 0.3); }
    if (W.hyper > 0) glowAt(g, '#ff9f1c', PL.x, cy, 60, 0.5);
    if (PL.jet > 0) glowAt(g, HZ2, PL.x - PL.facing * 6, y + 4, 18, 0.9);
    if (W.drone > 0 || G.mods.permaDrone) {
      const x = PL.x - PL.facing * 20, dy = y - 64 + Math.sin(clock * 4) * 4;
      glowAt(g, '#3ef2ff', x, dy, 18, W.drone > 0 ? 0.8 : 0.4); g.fillStyle = M2; g.beginPath(); g.ellipse(x, dy, 11, 6, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#3ef2ff'; g.lineWidth = 1.5; g.stroke();
    }
    // PV au-dessus du joueur en mobile portrait : la barre du HUD reste la référence.
  }
})(window.LR = window.LR || {});
