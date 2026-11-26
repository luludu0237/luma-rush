/* Luma Rush — moteur partagé : canvas, effets, audio, sprites, personnages, décors des thèmes. */
'use strict';
(function (LR) {
  const D = LR.D, E = (LR.E = {});
  const $ = (E.$ = id => document.getElementById(id));
  const rand = (E.rand = (a, b) => a + Math.random() * (b - a));
  const clamp = (E.clamp = (v, a, b) => (v < a ? a : v > b ? b : v));
  E.fmt = n => Math.floor(n).toLocaleString('fr-FR');
  const FONT = (E.FONT = '"Avenir Next", "Trebuchet MS", ui-rounded, system-ui, sans-serif');
  E.HZ = '#ff3e6c'; E.HZ2 = '#ffb13e'; E.GOLD = '#ffd34d'; E.M1 = '#1d1236'; E.M2 = '#35225e';
  E.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const rgba = (E.rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; });
  const hex2rgb = (E.hex2rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; });
  const css = (E.css = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);
  const cssA = (E.cssA = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const hsl2hex = (E.hsl2hex = (h, s, l) => {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  });
  const rr = (E.rr = (g, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  });
  const makeCanvas = (E.makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; });

  const glowCache = new Map();
  const glow = (E.glow = c => {
    let s = glowCache.get(c);
    if (!s) {
      s = makeCanvas(64, 64);
      const g = s.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.22, rgba(c, 0.55)); gr.addColorStop(0.55, rgba(c, 0.14)); gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache.set(c, s);
    }
    return s;
  });
  const glowAt = (E.glowAt = (g, c, x, y, r, a) => {
    if (a <= 0) return;
    const op = g.globalCompositeOperation, ga = g.globalAlpha;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a) * ga;
    g.drawImage(glow(c), x - r, y - r, r * 2, r * 2);
    g.globalCompositeOperation = op; g.globalAlpha = ga;
  });

  // ───────────── Qualité graphique ─────────────
  E.touchMode = null; // 'run' | 'battle' quand des boutons sont affichés à l'écran
  E.safe = { t: 0, r: 0, b: 0, l: 0 }; E.safeL = 0; E.safeR = 0;
  // env() n'est pas lisible en JS : on le mesure sur une sonde CSS.
  E.safeArea = () => { const c = getComputedStyle($('safeProbe')), n = v => parseFloat(v) || 0; return { t: n(c.paddingTop), r: n(c.paddingRight), b: n(c.paddingBottom), l: n(c.paddingLeft) }; };
  E.opts = { quality: 'auto', shake: true };
  let autoLow = false, slowT = 0;
  E.low = () => E.opts.quality === 'low' || (E.opts.quality === 'auto' && autoLow);
  // En mode Auto : si les images restent lentes (< 45 i/s) pendant 4 s de jeu, on passe en rendu allégé jusqu'au rechargement.
  E.watchFrame = function (dt) {
    if (autoLow || E.opts.quality !== 'auto') return false;
    slowT = dt > 0.022 ? slowT + dt : Math.max(0, slowT - dt * 2);
    if (slowT < 4) return false;
    autoLow = true; E.resize(); return true;
  };

  // ───────────── Canvas & mise à l'échelle ─────────────
  const cvs = (E.cvs = $('game')), ctx = (E.ctx = cvs.getContext('2d', { alpha: false }));
  E.W = 1; E.H = 1; E.DPR = 1; E.S = 1; E.VW = 640; E.VH = 450; E.GY = 324; E.PX = 96; E.LK = 0;
  E.resize = function () {
    // Taille réellement affichée du canvas plein écran : sur iPhone, innerWidth/innerHeight peuvent être en retard après une rotation.
    E.W = Math.max(1, cvs.clientWidth || innerWidth); E.H = Math.max(1, cvs.clientHeight || innerHeight); E.DPR = Math.min(devicePixelRatio || 1, E.low() ? 1.25 : 2);
    cvs.width = Math.round(E.W * E.DPR); cvs.height = Math.round(E.H * E.DPR);
    E.safe = E.safeArea();
    const reserve = E.touchMode ? LR.I.reservePx(E.W, E.H, E.safe, E.touchMode) : 0;
    Object.assign(E, LR.I.viewMetrics(E.W, E.H, reserve)); // ≥ 640 unités visibles : assez d'anticipation à vitesse max
    E.safeL = E.safe.l / E.S; E.safeR = E.safe.r / E.S;
    E.PX = Math.max(clamp(E.VW * 0.15, 80, 180), E.safeL + 60); // jamais sous l'encoche
    const k = Math.min(2, E.S * E.DPR);
    if (Math.abs(k - E.LK) > 0.05) { E.LK = k; buildTheme(); }
  };

  // ───────────── Particules, textes flottants, secousses ─────────────
  const parts = (E.parts = []), texts = (E.texts = []);
  E.shakeT = 0; E.shakeM = 0; E.flash = 0;
  E.emit = function (x, y, n, o) {
    const sp = o.spread || 0;
    const cap = E.low() ? 220 : 700; if (E.low()) n = Math.ceil(n / 2);
    for (let i = 0; i < n && parts.length < cap; i++) {
      const a = o.ang != null ? o.ang + rand(-sp, sp) : rand(0, 6.283), v = o.sp ? rand(o.sp * 0.3, o.sp) : 0;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: o.life * rand(0.6, 1), max: o.life, size: o.size * rand(0.7, 1.2), c: o.c, g: o.g || 0, w: !!o.w, k: o.kind || 0 });
    }
  };
  E.streak = (c, y0, y1) => { if (parts.length < 700) parts.push({ x: E.VW + 20, y: rand(y0, y1), vx: -rand(1800, 2600), vy: 0, life: 0.5, max: 0.5, size: rand(4, 9), c, g: 0, w: false, k: 1 }); };
  E.floatText = (txt, x, y, c, size) => { if (texts.length < 40) texts.push({ txt, x, y, c, size, life: 1.1, max: 1.1 }); };
  E.shake = (m, t) => { if (E.reduced || !E.opts.shake) return; E.shakeM = Math.max(m, E.shakeT > 0 ? E.shakeM : 0); E.shakeT = Math.max(t, E.shakeT); };
  E.clearFx = () => { parts.length = 0; texts.length = 0; };
  E.stepFx = function (dt, dx) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt - (p.w ? dx : 0); p.y += p.vy * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) if ((texts[i].life -= dt) <= 0) texts.splice(i, 1);
  };
  E.drawFx = function (g) {
    g.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const f = p.life / p.max;
      g.globalAlpha = f;
      if (p.k === 1) { g.strokeStyle = p.c; g.lineWidth = p.size * 0.25; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); g.stroke(); }
      else if (p.k === 2) { g.strokeStyle = p.c; g.lineWidth = 3 * f; g.beginPath(); g.arc(p.x, p.y, p.size * (1 - f) + 4, 0, Math.PI * 2); g.stroke(); }
      else { const s = p.size * (0.4 + f * 0.6); g.drawImage(glow(p.c), p.x - s, p.y - s, s * 2, s * 2); }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (const t of texts) {
      const f = t.life / t.max, pop = 1 + Math.max(0, f - 0.8) * 2, y = t.y - (1 - f) * 40;
      g.globalAlpha = Math.min(1, f * 2);
      g.font = `italic 900 ${Math.round(t.size * pop)}px ${FONT}`;
      g.lineWidth = 4; g.strokeStyle = 'rgba(10,2,30,0.75)'; g.strokeText(t.txt, t.x, y);
      g.fillStyle = t.c; g.fillText(t.txt, t.x, y);
    }
    g.globalAlpha = 1; g.textBaseline = 'alphabetic';
  };

  // ───────────── Audio synthétisé (aucun fichier) ─────────────
  const AC = window.AudioContext || window.webkitAudioContext;
  let ac = null, sfxBus, musicBus, bassF, noiseBuf, nextNoteT = 0, stepN = 0;
  E.music = { theme: 0, hot: false, boss: false, mute: false };
  E.prefs = { sfx: true, music: true, sfxVol: 0.8, musicVol: 0.6 };
  const sfxGain = () => E.prefs.sfxVol * 1.25, musicGain = () => (E.prefs.music ? E.prefs.musicVol * 0.84 : 0); // 0,8 et 0,6 = niveaux d'origine
  function initAudio() {
    ac = new AC();
    const comp = ac.createDynamicsCompressor(), master = ac.createGain();
    master.gain.value = 0.7; master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicGain(); musicBus.connect(master);
    bassF = ac.createBiquadFilter(); bassF.type = 'lowpass'; bassF.frequency.value = 900; bassF.Q.value = 6; bassF.connect(musicBus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextNoteT = ac.currentTime + 0.1;
    setInterval(musicTick, 25);
  }
  E.unlockAudio = function () {
    if (!AC) return;
    if (!ac) { try { initAudio(); } catch (e) { ac = null; return; } }
    if (ac.state === 'suspended') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
  };
  E.suspendAudio = () => { if (ac && ac.state === 'running') ac.suspend(); };
  function tone(type, f0, f1, dur, vol, delay = 0, dest = sfxBus) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, type, delay = 0, dest = sfxBus, f1 = 0) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  const SFX = {
    jump: () => tone('square', 320, 640, 0.13, 0.1),
    dbl: () => { tone('square', 480, 960, 0.12, 0.08); tone('triangle', 960, 1500, 0.1, 0.06, 0.03); },
    coin: n => { const f = 880 * Math.pow(2, Math.min(n || 0, 14) / 12); tone('sine', f, 0, 0.08, 0.12); tone('sine', f * 1.5, 0, 0.12, 0.09, 0.05); },
    slide: () => noise(0.25, 0.16, 2400, 'bandpass', 0, sfxBus, 500),
    power: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, 0.16, 0.13, i * 0.06)),
    shield: () => { noise(0.3, 0.3, 1800, 'lowpass', 0, sfxBus, 200); tone('sawtooth', 300, 90, 0.3, 0.1); },
    smash: () => { noise(0.22, 0.25, 3000, 'lowpass', 0, sfxBus, 250); tone('square', 200, 55, 0.16, 0.09); },
    death: () => { noise(0.8, 0.4, 2500, 'lowpass', 0, sfxBus, 70); tone('sawtooth', 440, 38, 0.85, 0.16); },
    near: () => tone('sine', 1500, 2600, 0.09, 0.08),
    event: () => [0, 0.2].forEach(w => { tone('square', 660, 0, 0.1, 0.07, w); tone('square', 880, 0, 0.1, 0.07, w + 0.1); }),
    mission: () => [784, 988, 1175, 1568].forEach((f, i) => tone('sine', f, 0, 0.28, 0.11, i * 0.08)),
    click: () => tone('sine', 900, 600, 0.05, 0.07),
    nope: () => tone('square', 180, 120, 0.15, 0.07),
    shoot: () => tone('square', 900, 300, 0.07, 0.05),
    slash: () => noise(0.12, 0.2, 4000, 'highpass', 0, sfxBus, 1500),
    hit: () => { tone('square', 260, 120, 0.08, 0.08); noise(0.06, 0.12, 2000, 'lowpass'); },
    hurt: () => { tone('sawtooth', 220, 80, 0.25, 0.14); noise(0.2, 0.2, 1200, 'lowpass'); },
    boom: () => { noise(0.6, 0.45, 1600, 'lowpass', 0, sfxBus, 60); tone('sine', 120, 35, 0.5, 0.3); },
    laser: () => { tone('sawtooth', 1400, 300, 0.5, 0.08); tone('square', 700, 200, 0.5, 0.05); },
    skill: () => { tone('triangle', 600, 1200, 0.15, 0.1); tone('sine', 1200, 1800, 0.15, 0.06, 0.05); },
    alarm: () => [0, 0.35, 0.7].forEach(w => { tone('sawtooth', 440, 660, 0.3, 0.1, w); }),
    rare: () => [523, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone('triangle', f, 0, 0.4, 0.1, i * 0.07)),
    dash: () => noise(0.15, 0.18, 3000, 'bandpass', 0, sfxBus, 800),
    windup: () => tone('sawtooth', 180, 520, 0.4, 0.06),
    land: () => noise(0.06, 0.07, 700, 'lowpass'),
  };
  E.sfx = (name, arg) => { if (!ac || !E.prefs.sfx || ac.state !== 'running') return; try { SFX[name](arg); } catch (e) { /* audio non critique */ } };

  // Une boucle musicale par thème (accords, tempo, timbre). Plus intense en jeu et pendant les boss.
  const SONGS = [
    { bpm: 116, bass: [45, 41, 48, 43], ch: [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74]], lead: 'square' },
    { bpm: 100, bass: [40, 36, 43, 38], ch: [[64, 67, 71], [60, 64, 67], [67, 71, 74], [62, 66, 69]], lead: 'triangle' },
    { bpm: 128, bass: [38, 46, 43, 45], ch: [[62, 65, 69], [58, 62, 65], [55, 58, 62], [57, 61, 64]], lead: 'sawtooth' },
    { bpm: 92, bass: [48, 41, 45, 43], ch: [[64, 67, 71], [65, 69, 72], [64, 69, 72], [62, 67, 71]], lead: 'sine' },
    { bpm: 104, bass: [43, 38, 40, 36], ch: [[67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67]], lead: 'triangle' },
    { bpm: 122, bass: [41, 37, 44, 39], ch: [[65, 68, 72], [61, 65, 68], [68, 72, 75], [63, 67, 70]], lead: 'square' },
  ];
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  function musicTick() {
    if (!ac || !E.prefs.music || ac.state !== 'running' || E.music.mute) return;
    const song = SONGS[E.music.theme] || SONGS[0], step = 60 / (song.bpm + (E.music.boss ? 14 : 0)) / 4, now = ac.currentTime;
    if (nextNoteT < now - 0.05) nextNoteT = now + 0.05;
    while (nextNoteT < now + 0.12) { playStep(song, stepN, nextNoteT - now, step); nextNoteT += step; stepN = (stepN + 1) % 64; }
  }
  function playStep(song, i, d, step) {
    const bar = i >> 4, s = i & 15, hot = E.music.hot, boss = E.music.boss;
    if (s % 2 === 0) tone('sawtooth', hz(song.bass[bar] + (s % 4 === 2 ? 12 : 0)), 0, step * 1.8, hot ? 0.16 : 0.09, d, bassF);
    tone(hot ? song.lead : 'triangle', hz(song.ch[bar][[0, 1, 2, 1][s % 4]] + (s >= 8 ? 12 : 0)), 0, step * (song.lead === 'sine' ? 1.6 : 0.85), hot ? 0.035 : 0.05, d, musicBus);
    if (boss && s % 4 === 2) tone('sawtooth', hz(song.ch[bar][0] - 12), 0, step * 0.9, 0.05, d, musicBus);
    if (!hot) return;
    if (s % 4 === 0 || (boss && s % 4 === 3)) tone('sine', 140, 42, 0.2, 0.55, d, musicBus);
    if (s === 4 || s === 12) noise(0.16, 0.22, 1700, 'bandpass', d, musicBus);
    if (s % 2 === 1) noise(0.035, 0.06, 7500, 'highpass', d, musicBus);
  }
  E.applyMusic = () => { if (!ac) return; musicBus.gain.setTargetAtTime(musicGain(), ac.currentTime, 0.08); sfxBus.gain.setTargetAtTime(sfxGain(), ac.currentTime, 0.08); };

  // ───────────── Images (stockées localement dans assets/) ─────────────
  const IMG = (E.IMG = {});
  const FILES = {
    s_idle: 'characters/striker/idle.png', s_run: 'characters/striker/run.png', s_jump: 'characters/striker/jump.png', s_dash: 'characters/striker/dash.png',
    s_hit: 'characters/striker/hit.png', s_death: 'characters/striker/death.png', s_slash: 'characters/striker/slash.png',
    k_idle: 'enemies/skeleton/idle.png', k_move: 'enemies/skeleton/move.png', k_attack: 'enemies/skeleton/attack.png', k_death: 'enemies/skeleton/death.png',
    b_idle: 'enemies/bat/idle.png', b_move: 'enemies/bat/move.png', b_attack: 'enemies/bat/attack.png', b_death: 'enemies/bat/death.png',
    rpg: 'items/rpg-items.png', guns: 'items/guns.png',
  };
  E.assetErrors = [];
  E.loadAssets = function (done, progress) {
    const total = Object.keys(FILES).length; let left = total;
    const tick = () => { if (progress) progress(1 - left / total); if (left === 0) done(); };
    for (const k in FILES) {
      const im = new Image();
      let retried = false;
      im.onload = () => { IMG[k] = im; left--; tick(); };
      im.onerror = () => {
        if (!retried) { retried = true; setTimeout(() => { im.src = 'assets/' + FILES[k] + '?r=' + Date.now(); }, 400); return; } // échec réseau passager : un nouvel essai
        E.assetErrors.push(FILES[k]); left--; tick(); // le jeu reste jouable : dessin de secours
      };
      im.src = 'assets/' + FILES[k];
    }
  };
  E.ASSET_PATH = k => 'assets/' + FILES[k];

  // Sprites : ax/ay = point d'appui (pieds) dans la case, sc = échelle vers les unités du monde.
  // Chaque animation : [image, x0, y0, largeur case, hauteur case, nb images, images/s, boucle].
  const SPR = (E.SPR = {
    striker: { ax: 48, ay: 68, sc: 1.35, faceLeft: false, a: {
      idle: ['s_idle', 0, 0, 96, 96, 8, 10, 1], run: ['s_run', 0, 0, 96, 96, 8, 15, 1], jump: ['s_jump', 0, 0, 96, 96, 12, 0, 0],
      slide: ['s_dash', 0, 0, 96, 96, 12, 22, 1], hurt: ['s_hit', 0, 0, 96, 96, 4, 14, 0], dead: ['s_death', 0, 0, 96, 96, 16, 16, 0],
      attack: ['s_slash', 0, 0, 128, 96, 16, 48, 0] } },
    skel: { ax: 8, ay: 16, sc: 3.1, faceLeft: true, a: {
      idle: ['k_idle', 0, 0, 16, 16, 4, 6, 1], run: ['k_move', 0, 0, 16, 16, 4, 9, 1], attack: ['k_attack', 0, 0, 16, 16, 4, 10, 0], dead: ['k_death', 0, 0, 16, 16, 4, 8, 0] } },
    bat: { ax: 8, ay: 13, sc: 3, faceLeft: true, a: {
      idle: ['b_idle', 0, 0, 16, 16, 4, 10, 1], run: ['b_move', 0, 0, 16, 16, 4, 14, 1], attack: ['b_attack', 0, 0, 16, 16, 4, 12, 0], dead: ['b_death', 0, 0, 16, 16, 4, 8, 0] } },
  });
  // Recoloration (skins, flash de dégâts) par composition — sans lire les pixels, donc compatible file://.
  const tintCache = new Map();
  function tinted(key, color, mode) {
    const id = key + color + mode;
    let c = tintCache.get(id);
    if (c) return c;
    const im = IMG[key]; if (!im) return null;
    c = makeCanvas(im.width, im.height);
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = mode === 'color' ? 'color' : 'source-atop';
    g.globalAlpha = mode === 'flat' ? 0.75 : mode === 'soft' ? 0.62 : 0.7; // soft : éclaircit les sprites très sombres
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0);
    if (tintCache.size > 160) tintCache.delete(tintCache.keys().next().value);
    tintCache.set(id, c);
    return c;
  }
  // Dessine l'image f d'une animation avec les pieds en (x, y). facing : 1 = droite, -1 = gauche.
  E.drawSprite = function (g, sprId, anim, f, x, y, opt) {
    const s = SPR[sprId], a = s.a[anim] || s.a.idle, src = a[0], n = a[5];
    const fi = a[7] ? ((f % n) + n) % n : clamp(Math.floor(f), 0, n - 1);
    let im = IMG[src];
    if (!im) return false;
    if (opt.flash) im = tinted(src, opt.flash, 'flat') || im;
    else if (opt.tint) im = tinted(src, opt.tint, opt.tintMode || 'color') || im;
    const sc = s.sc * (opt.scale || 1), fw = a[3], fh = a[4];
    g.save(); g.translate(x, y);
    const face = (opt.facing || 1) * (s.faceLeft ? -1 : 1);
    g.scale(face * sc * (1 + (opt.sx || 0)), sc * (1 + (opt.sy || 0)));
    if (opt.rot) g.rotate(opt.rot * (s.faceLeft ? -1 : 1)); // la rotation suit le miroir de la planche
    g.imageSmoothingEnabled = false;
    g.globalAlpha *= opt.alpha == null ? 1 : opt.alpha;
    g.drawImage(im, a[1] + fi * fw, a[2], fw, fh, -s.ax, -s.ay, fw, fh);
    g.restore();
    return true;
  };
  E.animFrame = (sprId, anim, t) => { const a = (SPR[sprId].a[anim] || SPR[sprId].a.idle); return Math.floor(t * a[6]); };
  E.animLen = (sprId, anim) => { const a = SPR[sprId].a[anim]; return a ? a[5] / Math.max(1, a[6]) : 0; };

  // ───────────── Icônes (packs 16x16) ─────────────
  // 'rpg:N' (pack RPG, N = ligne*8+colonne), 'gun:l,c' (pack d'armes, cases de 18 px), 'v:nom' (icône vectorielle).
  E.iconRect = function (spec) {
    const [k, v] = spec.split(':');
    if (k === 'rpg') { const i = +v; return ['rpg', (i % 8) * 16, Math.floor(i / 8) * 16, 16, 16]; }
    if (k === 'gun') { const [r, c] = v.split(',').map(Number); return ['guns', c * 18, r * 18, 18, 18]; }
    return null;
  };
  E.drawIcon = function (g, spec, x, y, size, color) {
    const r = E.iconRect(spec);
    if (r && IMG[r[0]]) { g.imageSmoothingEnabled = false; g.drawImage(IMG[r[0]], r[1], r[2], r[3], r[4], x - size / 2, y - size / 2, size, size); return; }
    const name = spec.split(':')[1], c = color || '#ffffff', s = size / 24;
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
    if (name === 'jetpack') { rr(g, -7, -9, 6, 14, 3); g.fill(); rr(g, 1, -9, 6, 14, 3); g.fill(); g.fillStyle = '#ffb13e'; g.beginPath(); g.moveTo(-6, 6); g.lineTo(-4, 12); g.lineTo(-2, 6); g.moveTo(2, 6); g.lineTo(4, 12); g.lineTo(6, 6); g.fill(); }
    else if (name === 'hyper') { g.beginPath(); g.moveTo(3, -11); g.lineTo(-6, 1); g.lineTo(-1, 1); g.lineTo(-3, 11); g.lineTo(6, -2); g.lineTo(1, -2); g.closePath(); g.fill(); }
    else if (name === 'magnet') { g.lineWidth = 4.5; g.beginPath(); g.arc(0, 1, 6, 0, Math.PI); g.moveTo(6, 1); g.lineTo(6, -7); g.moveTo(-6, 1); g.lineTo(-6, -7); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-8.3, -10, 4.6, 3.5); g.fillRect(3.7, -10, 4.6, 3.5); }
    else if (name === 'drone') { g.beginPath(); g.ellipse(0, 2, 9, 5, 0, 0, Math.PI * 2); g.fill(); g.fillRect(-10, -6, 7, 2); g.fillRect(3, -6, 7, 2); g.fillStyle = '#ff3e6c'; g.beginPath(); g.arc(0, 2, 2.5, 0, 7); g.fill(); }
    else { g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  };
  // Élément DOM : sprite CSS (pixel net) ou petit canvas pour les icônes vectorielles.
  E.iconEl = function (spec, size, color) {
    const r = E.iconRect(spec);
    if (r) {
      const el = document.createElement('i'), k = size / r[3], im = r[0] === 'rpg' ? [128, 144] : [108, 108];
      el.className = 'pxi';
      el.style.cssText = `width:${size}px;height:${size}px;background-image:url(${E.ASSET_PATH(r[0])});background-size:${im[0] * k}px ${im[1] * k}px;background-position:-${r[1] * k}px -${r[2] * k}px`;
      return el;
    }
    const c = makeCanvas(size * 2, size * 2); c.style.width = c.style.height = size + 'px'; c.className = 'pxi';
    E.drawIcon(c.getContext('2d'), spec, size, size, size * 2, color);
    return c;
  };
  // Cœurs, gemmes de rareté et emblèmes : dessins originaux en SVG (couleurs internes, aucune donnée externe).
  const svgEl = (markup, w, h, cls) => { const el = document.createElement('i'); el.className = 'svgi ' + (cls || ''); el.style.width = w + 'px'; el.style.height = h + 'px'; el.innerHTML = markup; return el; };
  E.heartEl = (full, size) => svgEl(`<svg viewBox="0 0 24 22" width="100%" height="100%"><path d="M12 21 2.6 11.6A5.6 5.6 0 0 1 12 4.1a5.6 5.6 0 0 1 9.4 7.5z" fill="${full ? '#ff3e6c' : 'rgba(255,255,255,0.08)'}" stroke="${full ? '#ffd0dc' : 'rgba(255,255,255,0.35)'}" stroke-width="1.6"/>${full ? '<path d="M6.5 7.5a2.6 2.6 0 0 1 3.4-1.2" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>' : ''}</svg>`, size, size * 0.92);
  E.gemEl = (rarity, size) => {
    const c = D.RARITY[rarity].color;
    return svgEl(`<svg viewBox="0 0 24 22" width="100%" height="100%"><path d="M6 2h12l5 6-11 13L1 8z" fill="${c}" stroke="rgba(0,0,0,0.45)" stroke-width="1.2"/><path d="M6 2h12l5 6H1z" fill="rgba(255,255,255,0.35)"/><path d="M1 8h22L12 21z" fill="rgba(0,0,0,0.18)"/><path d="M8 8l4 13 4-13" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/></svg>`, size, size * 0.92, 'gem gem-' + rarity);
  };
  const WING = ['#c9d2e8', '#3ef2ff', '#4dffb8', '#ffd34d'];
  E.wingEl = (tier, width) => {
    const c = WING[Math.max(0, Math.min(3, tier))];
    const wing = 'M30 9C24 3 14 1 2 3c5 2 8 4 10 6-5 0-8 1-10 2 6 1 11 2 14 4-3 1-5 2-6 3 8 1 15-1 20-5z';
    return svgEl(`<svg viewBox="0 0 80 22" width="100%" height="100%"><path d="${wing}" fill="${c}" opacity="0.9"/><path d="${wing}" fill="${c}" opacity="0.9" transform="translate(80 0) scale(-1 1)"/><circle cx="40" cy="11" r="8.5" fill="${c}" stroke="rgba(0,0,0,0.4)" stroke-width="1.2"/><path d="M40 5.5l1.7 3.6 3.9.4-2.9 2.6.8 3.9-3.5-2-3.5 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#fff"/></svg>`, width, width * 0.275);
  };

  // ───────────── Personnages ─────────────
  // Palette finale : couleurs du personnage, remplacées par le skin équipé (arc-en-ciel animé pour Prisme).
  E.palette = function (charId, skinId, t) {
    const ch = D.byId(D.CHARACTERS, charId) || D.CHARACTERS[0], sk = D.byId(D.SKINS, skinId);
    let p = Object.assign({ visor: '#120626', eye: '#ffffff', body: '#e8e0ff', body2: ch.col.glow }, ch.col); // couleurs complètes même pour un sprite (dessin de secours)
    if (sk && sk.rainbow) { const h = Math.floor(((t * 80) % 360) / 15) * 15; p = Object.assign({}, p, { body: hsl2hex(h, 100, 72), body2: hsl2hex((h + 70) % 360, 100, 48), glow: hsl2hex(h, 100, 60) }); }
    else if (sk && sk.pal) p = Object.assign({}, p, sk.pal);
    p.tint = sk && sk.id !== 'default' ? p.body : ch.col.tint || null; // recoloration des sprites
    p.tintMode = ch.id === 'nocturne' ? 'soft' : 'color';
    p.ghost = !!(sk && sk.ghost) || charId === 'spectre';
    p.fx = sk && sk.fx;
    return p;
  };
  // pose : st ('idle','run','jump','fall','slide','hurt','attack','victory','dead'), t, runT, vy, squash, spin, ant, blink, alpha, facing, flash.
  E.drawChar = function (g, charId, x, y, pose, pal) {
    const ch = D.byId(D.CHARACTERS, charId) || D.CHARACTERS[0];
    const a = (pose.alpha == null ? 1 : pose.alpha) * (pal.ghost ? 0.62 : 1);
    if (ch.kind === 'sprite' && IMG[SPR[ch.sprite].a.idle[0]]) return drawSpriteChar(g, ch, x, y, pose, pal, a);
    const fn = VEC[ch.kind === 'sprite' ? 'luma' : charId] || VEC.luma;
    g.save(); g.translate(x, y);
    if ((pose.facing || 1) < 0) g.scale(-1, 1);
    g.globalAlpha *= a;
    glowAt(g, pal.glow, 0, pose.st === 'slide' ? -12 : -26, 40, 0.5);
    if (pose.flash) { g.globalAlpha *= 0.55 + 0.45 * Math.sin(pose.t * 60); }
    fn(g, pose, pal);
    g.restore();
  };
  function drawSpriteChar(g, ch, x, y, pose, pal, alpha) {
    const id = ch.sprite, s = SPR[id], st = pose.st, t = pose.t || 0, o = { facing: pose.facing || 1, tint: pal.tint, alpha, flash: pose.flash ? '#ff3e6c' : null, scale: id === 'bat' ? 1.8 : 1, tintMode: pal.tintMode };
    glowAt(g, pal.glow, x, y - (st === 'slide' ? 12 : 26), 38, 0.4);
    let anim = 'idle', f = 0;
    const flying = id === 'bat';
    if (st === 'run') { anim = 'run'; f = Math.floor(pose.runT * (flying ? 2.2 : 1.6)); }
    else if (st === 'idle' || st === 'victory') { anim = 'idle'; f = E.animFrame(id, 'idle', t); }
    else if (st === 'jump' || st === 'fall') {
      if (id === 'striker') { anim = 'jump'; f = clamp(Math.round(5 - (pose.vy || 0) / 180), 1, 10); }
      else { anim = 'run'; f = Math.floor(t * 14); }
    } else if (st === 'slide') {
      if (id === 'striker') { anim = 'slide'; f = 3 + (Math.floor(t * 18) % 4); }
      else { anim = 'run'; f = Math.floor(t * 10); o.sy = -0.38; o.sx = 0.2; }
    } else if (st === 'attack') {
      anim = 'attack'; f = E.animFrame(id, 'attack', t);
    } else if (st === 'hurt') {
      if (id === 'striker') { anim = 'hurt'; f = E.animFrame(id, 'hurt', t); } else { anim = 'idle'; o.flash = '#ff3e6c'; o.rot = -0.25 * (o.facing); }
    } else if (st === 'dead') {
      if (s.a.dead) { anim = 'dead'; f = E.animFrame(id, 'dead', t); }
      else { anim = 'fall'; o.rot = Math.min(1.4, t * 3) * -o.facing; o.alpha = alpha * Math.max(0, 1 - t); }
    }
    if (pose.spin) o.rot = (o.rot || 0) + (1 - pose.spin) * Math.PI * 2 * o.facing;
    if (pose.squash) { o.sx = (o.sx || 0) + pose.squash * 0.25; o.sy = (o.sy || 0) - pose.squash * 0.25; }
    const hop = st === 'victory' ? -Math.abs(Math.sin(t * 6)) * 14 : flying && st !== 'dead' ? -10 + Math.sin(t * 9) * 3 : 0;
    E.drawSprite(g, id, anim, f, x, y + hop, o);
    if (pal.fx === 'fire' && Math.random() < 0.3) E.emit(x - 6 * o.facing, y - 20, 1, { c: '#ff8a3e', sp: 50, life: 0.4, size: 7, g: -150 });
    if (pal.fx === 'stars' && Math.random() < 0.15) E.emit(x + rand(-14, 14), y - rand(10, 40), 1, { c: '#ffffff', life: 0.5, size: 4 });
  }
  // Petits utilitaires de pose pour les personnages vectoriels.
  const legs = (g, p, pal, x1, x2, w, h) => {
    g.fillStyle = pal.body2;
    if (p.st === 'run') { const s = Math.sin(p.runT); rr(g, x1 + s * 4, -h - Math.max(0, s) * 3, w, h, w / 2); g.fill(); rr(g, x2 - s * 4, -h - Math.max(0, -s) * 3, w, h, w / 2); g.fill(); }
    else if (p.st === 'jump' || p.st === 'fall' || p.st === 'victory') { rr(g, x1 + 1, -h - 3, w, h - 3, w / 2); g.fill(); rr(g, x2, -h - 2, w, h - 3, w / 2); g.fill(); }
    else { rr(g, x1, -h, w, h, w / 2); g.fill(); rr(g, x2, -h, w, h, w / 2); g.fill(); }
  };
  const bodyT = (g, p) => {
    const sq = p.squash || 0, hop = p.st === 'victory' ? -Math.abs(Math.sin(p.t * 6)) * 12 : p.st === 'idle' ? Math.sin(p.t * 3) * 1.2 : 0;
    g.translate(0, hop); g.scale(1 + sq * 0.3, 1 - sq * 0.3);
    if (p.spin > 0) { g.translate(0, -26); g.rotate((1 - p.spin) * Math.PI * 2); g.translate(0, 26); }
    if (p.st === 'hurt') g.rotate(-0.25);
    if (p.st === 'attack') g.translate(3, 0);
    if (p.st === 'dead') { g.rotate(Math.min(1.5, p.t * 3)); }
  };
  const grad = (g, y0, y1, a, b) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  const VEC = {
    luma(g, p, pal) {
      if (p.st === 'slide') {
        g.strokeStyle = pal.body2; g.lineWidth = 2; g.beginPath(); g.moveTo(-12, -22); g.quadraticCurveTo(-22, -28, -32, -25 + Math.sin(p.runT) * 1.5); g.stroke();
        glowAt(g, pal.glow, -32, -25, 8, 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(-32, -25, 2.5, 0, Math.PI * 2); g.fill();
        rr(g, -23, -24, 46, 22, 11); g.fillStyle = grad(g, -24, -2, pal.body, pal.body2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(-12, -19, 6, 2.5, -0.2, 0, Math.PI * 2); g.fill();
        rr(g, 5, -21, 17, 10, 5); g.fillStyle = pal.visor; g.fill();
        g.fillStyle = pal.eye; rr(g, 11, -18.5, 2.6, 5, 1.3); g.fill(); rr(g, 16, -18.5, 2.6, 5, 1.3); g.fill();
        return;
      }
      bodyT(g, p);
      legs(g, p, pal, -10, 3, 7, 12);
      const ant = p.ant == null ? 0.35 : p.ant, tx = -2 - Math.sin(ant) * 13, ty = -48 - Math.cos(ant) * 13;
      g.strokeStyle = pal.body2; g.lineWidth = 2; g.beginPath(); g.moveTo(-2, -46); g.quadraticCurveTo(-2, -54, tx, ty); g.stroke();
      glowAt(g, pal.glow, tx, ty, 9, 0.9); g.fillStyle = '#fff'; g.beginPath(); g.arc(tx, ty, 2.8, 0, Math.PI * 2); g.fill();
      rr(g, -16, -48, 32, 38, 14); g.fillStyle = grad(g, -48, -10, pal.body, pal.body2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.38)'; g.beginPath(); g.ellipse(-8, -40, 5.5, 3, -0.5, 0, Math.PI * 2); g.fill();
      glowAt(g, pal.glow, -5, -21, 9, 0.8); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(-5, -21, 2.6, 0, Math.PI * 2); g.fill();
      rr(g, -2, -42, 20, 14, 7); g.fillStyle = pal.visor; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.stroke();
      const eh = p.blink || p.st === 'dead' ? 1.2 : p.st === 'hurt' ? 3 : 7;
      g.fillStyle = pal.eye; rr(g, 5, -35 - eh / 2, 3, eh, 1.5); g.fill(); rr(g, 11, -35 - eh / 2, 3, eh, 1.5); g.fill();
      glowAt(g, pal.eye, 9.5, -35, 10, 0.35);
    },
    pixel(g, p, pal) {
      const q = v => Math.round(v / 3) * 3; // mouvements « pas à pas » façon 8-bit
      if (p.st === 'slide') { g.fillStyle = pal.body; g.fillRect(-21, -21, 42, 18); g.fillStyle = '#0b1a0b'; g.fillRect(6, -18, 12, 6); g.fillStyle = '#fff'; g.fillRect(9, -16, 3, 3); g.fillRect(14, -16, 3, 3); return; }
      bodyT(g, p);
      const s = p.st === 'run' ? q(Math.sin(p.runT) * 5) : 0;
      g.fillStyle = pal.body2; g.fillRect(-9 + s, -12, 7, 12); g.fillRect(3 - s, -12, 7, 12);
      g.fillStyle = pal.body; g.fillRect(-15, -45, 30, 33);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-12, -42, 6, 3);
      g.fillStyle = '#0b1a0b'; g.fillRect(-3, -39, 18, 12);
      g.fillStyle = '#ffffff'; const eh = p.blink ? 1 : 6; g.fillRect(2, -36, 3, eh); g.fillRect(9, -36, 3, eh);
      g.fillStyle = pal.body2; g.fillRect(-2, -54, 3, 9); g.fillStyle = '#fff'; g.fillRect(-4, -58, 7, 5);
      g.fillStyle = pal.body2; g.fillRect(-12, -24, 9, 3); g.fillRect(-12, -20, 6, 3);
    },
    bastion(g, p, pal) {
      if (p.st === 'slide') { rr(g, -25, -24, 50, 22, 6); g.fillStyle = grad(g, -24, -2, pal.body, pal.body2); g.fill(); g.fillStyle = pal.visor; g.fillRect(6, -19, 16, 6); g.fillStyle = pal.glow; g.fillRect(9, -17, 10, 2); return; }
      bodyT(g, p);
      legs(g, p, pal, -12, 3, 10, 13);
      rr(g, -21, -42, 10, 16, 4); g.fillStyle = pal.body2; g.fill(); rr(g, 11, -42, 10, 16, 4); g.fill(); // épaulières
      rr(g, -15, -47, 30, 36, 6); g.fillStyle = grad(g, -47, -11, pal.body, pal.body2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.strokeRect(-11, -26, 22, 10);
      g.fillStyle = pal.visor; rr(g, -6, -43, 20, 9, 3); g.fill();
      g.fillStyle = pal.glow; g.fillRect(-3, -40, p.blink ? 2 : 14, 3); glowAt(g, pal.glow, 4, -39, 12, 0.5);
    },
    volt(g, p, pal) {
      const r = 18, cy = p.st === 'slide' ? -14 : -26;
      if (p.st !== 'slide') bodyT(g, p);
      const roll = (p.runT || 0) * 0.6;
      g.beginPath(); g.arc(0, cy, r, 0, Math.PI * 2); g.fillStyle = grad(g, cy - r, cy + r, pal.body, pal.body2); g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
      for (let i = 0; i < 3; i++) { const a = roll + i * 2.1; g.beginPath(); g.moveTo(Math.cos(a) * -r, cy + Math.sin(a) * -r); g.lineTo(Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
      g.restore();
      g.beginPath(); g.arc(6, cy - 3, 7, 0, Math.PI * 2); g.fillStyle = pal.visor; g.fill();
      g.beginPath(); g.arc(8, cy - 3, p.blink ? 1 : 3.2, 0, Math.PI * 2); g.fillStyle = pal.eye; g.fill(); glowAt(g, pal.glow, 8, cy - 3, 10, 0.6);
      if (p.st !== 'slide') { const w = 8 + Math.sin((p.t || 0) * 50) * 6; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(-w, cy - r - 4); g.lineTo(w, cy - r - 4); g.stroke(); g.fillStyle = pal.body2; g.fillRect(-1.5, cy - r - 4, 3, 5); }
    },
    nova(g, p, pal) {
      if (p.st === 'slide') {
        g.beginPath(); g.moveTo(-26, -6); g.lineTo(18, -22); g.lineTo(24, -10); g.lineTo(-20, -2); g.closePath(); g.fillStyle = grad(g, -22, -2, pal.body, pal.body2); g.fill();
        glowAt(g, pal.glow, 20, -16, 14, 0.8); return;
      }
      bodyT(g, p);
      const flow = Math.sin((p.t || 0) * 8) * 4 + (p.st === 'run' ? -6 : 0);
      g.beginPath(); g.moveTo(-4, -40); g.quadraticCurveTo(-22 + flow, -24, -26 + flow, -6); g.lineTo(-8, -14); g.closePath(); g.fillStyle = rgba(pal.body2, 0.75); g.fill(); // cape
      legs(g, p, pal, -7, 2, 5, 14);
      g.beginPath(); g.moveTo(0, -42); g.lineTo(9, -26); g.lineTo(4, -12); g.lineTo(-4, -12); g.lineTo(-9, -26); g.closePath(); g.fillStyle = grad(g, -42, -12, pal.body, pal.body2); g.fill();
      const sx = 1, sy = -50, k = 9 + Math.sin((p.t || 0) * 6) * 1.5; // tête-étoile
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? k * 0.45 : k; g.lineTo(sx + Math.cos(a) * rr2, sy + Math.sin(a) * rr2); }
      g.closePath(); g.fillStyle = pal.body; g.fill(); glowAt(g, pal.glow, sx, sy, 22, 0.9);
      g.fillStyle = pal.visor; g.fillRect(2, -52, 2.5, p.blink ? 1 : 4); g.fillRect(6, -52, 2.5, p.blink ? 1 : 4);
    },
    kael(g, p, pal) { // rōnin cybernétique : casque à visière, cape courte, lame de plasma
      const blade = (ang, len) => {
        g.save(); g.translate(7, -26); g.rotate(ang);
        glowAt(g, pal.glow, len * 0.55, 0, len * 0.6, 0.55);
        g.fillStyle = '#ffffff'; rr(g, 2, -1.6, len, 3.2, 1.6); g.fill();
        g.fillStyle = pal.body2; rr(g, -5, -2.5, 8, 5, 2); g.fill(); g.fillStyle = pal.glow; g.fillRect(2, -4, 2, 8);
        g.restore();
      };
      if (p.st === 'slide') {
        rr(g, -22, -20, 40, 16, 7); g.fillStyle = grad(g, -20, -4, pal.body, pal.body2); g.fill();
        rr(g, 8, -27, 14, 12, 5); g.fillStyle = pal.body; g.fill(); g.fillStyle = pal.visor; g.fillRect(12, -24, 9, 4); g.fillStyle = pal.eye; g.fillRect(15, -23, 5, 2);
        g.save(); g.translate(-14, 0); blade(-2.9, 26); g.restore();
        return;
      }
      bodyT(g, p);
      const flow = Math.sin((p.t || 0) * 7) * 3 + (p.st === 'run' ? -6 : 0);
      g.beginPath(); g.moveTo(-5, -40); g.quadraticCurveTo(-20 + flow, -30, -23 + flow, -12); g.lineTo(-9, -17); g.closePath(); g.fillStyle = rgba(pal.body2, 0.85); g.fill();
      legs(g, p, pal, -8, 2, 6, 14);
      rr(g, -10, -39, 20, 26, 6); g.fillStyle = grad(g, -39, -13, pal.body, pal.body2); g.fill();
      g.fillStyle = pal.glow; g.fillRect(-10, -19, 20, 2);
      g.strokeStyle = rgba(pal.glow, 0.7); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-6, -34); g.lineTo(0, -28); g.lineTo(6, -34); g.stroke();
      rr(g, -9, -54, 19, 17, 7); g.fillStyle = pal.body; g.fill();
      g.fillStyle = pal.body2; g.beginPath(); g.moveTo(-7, -53); g.lineTo(-14, -60); g.lineTo(-1, -55); g.closePath(); g.fill();
      rr(g, -3, -49, 14, 6, 3); g.fillStyle = pal.visor; g.fill();
      g.fillStyle = pal.eye; g.fillRect(2, -47.5, p.blink ? 2 : 8, 2.4); glowAt(g, pal.eye, 6, -46, 10, 0.6);
      const k = Math.min(1, (p.t || 0) / 0.2);
      const ang = p.st === 'attack' ? -1.9 + k * 2.9 : p.st === 'run' ? 0.95 : p.st === 'victory' ? -1.45 : p.st === 'jump' || p.st === 'fall' ? -0.5 : 0.55;
      blade(ang, 30);
    },
    spectre(g, p, pal) {
      const fl = Math.sin((p.t || 0) * 4) * 3, h = p.st === 'slide' ? 24 : 46;
      g.translate(0, -4 + fl);
      if (p.st === 'hurt') g.rotate(-0.2);
      g.beginPath(); g.moveTo(-15, -h + 14); g.quadraticCurveTo(-15, -h, 0, -h); g.quadraticCurveTo(15, -h, 15, -h + 14); g.lineTo(15, -4);
      for (let i = 0; i < 5; i++) g.quadraticCurveTo(15 - i * 6 - 3, -4 + (i % 2 ? -5 : 5) + Math.sin((p.t || 0) * 8 + i) * 2, 15 - (i + 1) * 6, -4);
      g.closePath(); g.fillStyle = grad(g, -h, 0, pal.body, rgba(pal.body2, 0.2)); g.fill();
      g.fillStyle = '#0a0620'; g.beginPath(); g.ellipse(3, -h + 16, 3, p.blink ? 0.8 : 5, 0, 0, Math.PI * 2); g.ellipse(10, -h + 16, 3, p.blink ? 0.8 : 5, 0, 0, Math.PI * 2); g.fill();
      glowAt(g, pal.glow, 0, -h / 2, 30, 0.35);
    },
  };

  // ───────────── Thèmes : décors pré-rendus + ambiance ─────────────
  let layerFar = null, layerNear = null, backC = null;
  const LAYER_W = 1400, FAR_H = 170, NEAR_H = 120;
  E.theme = D.THEMES[0];
  const stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.6, 1.8), p: rand(0, 6.28), tw: rand(0.6, 2.4), z: rand(0.3, 1) }));
  const amb = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.5, 1.5), p: rand(0, 6.28) }));
  function mulberry(a) { return D.mulberry(a); }

  function buildSkyline(seed, h, minH, maxH, fill, winA, winP, signs, type) {
    const rnd = mulberry(seed), R2 = (a, b) => a + rnd() * (b - a), LK = E.LK;
    const c = makeCanvas(LAYER_W * LK, h * LK), g = c.getContext('2d');
    g.scale(LK, LK);
    const items = [];
    for (let x = 0; x < LAYER_W;) { const w = R2(36, 100); items.push({ x, w, h: R2(minH, maxH), r: rnd(), r2: rnd() }); x += w + R2(2, 14); }
    for (const b of items) for (const off of [0, -LAYER_W]) { // second passage : raccord sans couture
      const x = b.x + off; if (x + b.w < 0) continue;
      const top = h - b.h, cx = x + b.w / 2;
      g.fillStyle = fill;
      if (type === 'city' || type === 'future') {
        if (type === 'future') { rr(g, x + 4, top, b.w - 8, b.h + 10, Math.min(18, b.w / 3)); g.fill(); if (b.r < 0.3) { g.strokeStyle = fill; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, top + 18, b.w * 0.7, 6, 0, 0, Math.PI * 2); g.stroke(); } }
        else { g.fillRect(x, top, b.w, b.h); if (b.r < 0.25) { g.fillRect(cx - 1, top - 18, 2, 18); g.fillStyle = E.HZ; g.fillRect(cx - 1.5, top - 20, 3, 3); } }
        const wr = mulberry(seed + (b.x | 0));
        for (let yy = top + 8; yy < h - 6; yy += 9) for (let xx = x + 6; xx < x + b.w - 7; xx += 7) {
          if (wr() < winP) { g.fillStyle = type === 'future' ? `rgba(200,240,255,${winA})` : wr() < 0.7 ? `rgba(255,214,140,${winA})` : `rgba(140,230,255,${winA})`; g.fillRect(xx, yy, 3, type === 'future' ? 2 : 4); }
        }
        if (signs && b.r2 < 0.3) { g.save(); g.shadowColor = b.r < 0.5 ? '#ff3ea5' : '#3ef2ff'; g.shadowBlur = 12; g.fillStyle = g.shadowColor; g.fillRect(x + b.w * 0.25, top + 10, 5, Math.min(40, b.h * 0.4)); g.restore(); }
      } else if (type === 'ice' || type === 'volcano') {
        g.beginPath(); g.moveTo(x - 20, h); g.lineTo(cx - b.w * 0.15, top + b.r * 10); g.lineTo(cx + 4, top); g.lineTo(cx + b.w * 0.25, top + 14 + b.r2 * 10); g.lineTo(x + b.w + 20, h); g.closePath(); g.fill();
        if (type === 'ice') { g.fillStyle = `rgba(220,245,255,${winA * 0.5})`; g.beginPath(); g.moveTo(cx - b.w * 0.15, top + b.r * 10); g.lineTo(cx + 4, top); g.lineTo(cx + 2, top + b.h * 0.35); g.closePath(); g.fill(); }
        else if (b.r < 0.5) { g.save(); g.shadowColor = '#ff6a1e'; g.shadowBlur = 10; g.strokeStyle = `rgba(255,120,40,${winA})`; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 4, top + 4); g.lineTo(cx - 4 + b.r2 * 8, top + b.h * 0.4); g.lineTo(cx + 6, top + b.h * 0.7); g.stroke(); g.restore(); }
      } else if (type === 'forest') {
        g.fillRect(cx - 4, top + b.h * 0.45, 8, b.h * 0.55);
        g.beginPath(); g.arc(cx, top + b.h * 0.35, b.w * 0.42, 0, Math.PI * 2); g.arc(cx - b.w * 0.25, top + b.h * 0.5, b.w * 0.3, 0, Math.PI * 2); g.arc(cx + b.w * 0.25, top + b.h * 0.48, b.w * 0.32, 0, Math.PI * 2); g.fill();
        if (signs && b.r2 < 0.35) { g.save(); g.shadowColor = '#ff5df0'; g.shadowBlur = 10; g.fillStyle = '#ff7ae0'; g.beginPath(); g.ellipse(x + b.w * 0.8, h - 8, 7, 5, 0, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.fillRect(x + b.w * 0.8 - 1.5, h - 8, 3, 8); g.restore(); }
      } else { // galaxy : îlots rocheux flottants
        const fy = top + b.h * 0.3;
        g.beginPath(); g.moveTo(x, fy); g.lineTo(x + b.w, fy); g.lineTo(cx + b.w * 0.2, fy + b.h * 0.5); g.lineTo(cx - 6, fy + b.h * 0.7); g.lineTo(x + b.w * 0.2, fy + b.h * 0.4); g.closePath(); g.fill();
        if (b.r < 0.4) { g.fillStyle = `rgba(200,170,255,${winA})`; g.fillRect(cx - 2, fy - 6, 4, 6); }
      }
    }
    return c;
  }
  function buildBackdrop(type) {
    const R = 64, LK = E.LK, w = R * 5, h = R * 2.8, c = makeCanvas(w * LK, h * LK), g = c.getContext('2d'), cx = w / 2, cy = h / 2;
    g.scale(LK, LK);
    if (type === 'city') { // planète à anneaux (identité d'origine)
      const ring = front => {
        g.save(); g.translate(cx, cy); g.rotate(-0.28);
        for (const [rx, lw, col] of [[R * 2.05, 8, 'rgba(255,190,235,0.45)'], [R * 2.3, 2, 'rgba(255,255,255,0.35)'], [R * 1.75, 3, 'rgba(180,140,255,0.5)']]) {
          g.beginPath(); g.ellipse(0, 0, rx, rx * 0.2, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); g.strokeStyle = col; g.lineWidth = lw; g.stroke();
        }
        g.restore();
      };
      ring(false);
      const gr = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      gr.addColorStop(0, '#ffe0f3'); gr.addColorStop(0.45, '#ff6fb5'); gr.addColorStop(1, '#4a1580');
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      g.save(); g.clip(); g.globalAlpha = 0.16; g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(cx - R, cy - R + 14 + i * 21, R * 2, 4 + (i % 2) * 3); g.restore();
      ring(true);
    } else if (type === 'galaxy') { // galaxie spirale
      g.translate(cx, cy);
      for (let arm = 0; arm < 3; arm++) for (let i = 0; i < 220; i++) {
        const t = i / 220, a = arm * 2.09 + t * 5.5, r = t * R * 2.2, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.45;
        g.fillStyle = `rgba(${200 + 55 * (1 - t) | 0},${150 + 60 * t | 0},255,${0.5 * (1 - t)})`; g.fillRect(x + rand(-4, 4), y + rand(-3, 3), 2, 2);
      }
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.7); gr.addColorStop(0, 'rgba(255,240,255,0.95)'); gr.addColorStop(1, 'rgba(180,120,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, R * 0.7, R * 0.35, 0, 0, Math.PI * 2); g.fill();
    } else if (type === 'future') { // anneau orbital et station
      g.strokeStyle = 'rgba(220,240,255,0.55)'; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, cy + 20, R * 2.4, R * 0.5, -0.12, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(cx, cy + 20, R * 2.3, R * 0.45, -0.12, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.fillStyle = '#e8f2ff'; rr(g, cx - 30, cy - 10, 60, 14, 7); g.fill(); g.fillRect(cx - 4, cy - 30, 8, 54); g.fillStyle = '#7df9ff'; g.fillRect(cx - 24, cy - 6, 48, 3);
    } else { // lune (glace, forêt) ou soleil noir (volcan)
      const vol = type === 'volcano', gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      if (vol) { gr.addColorStop(0, '#ffd34d'); gr.addColorStop(0.5, '#ff5a1e'); gr.addColorStop(1, '#5a0a00'); }
      else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, type === 'ice' ? '#cfe8ff' : '#f0ffe0'); gr.addColorStop(1, type === 'ice' ? '#5a7ab0' : '#5a8a6a'); }
      g.beginPath(); g.arc(cx, cy, R * 0.85, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      g.save(); g.clip(); g.fillStyle = vol ? 'rgba(20,0,0,0.85)' : 'rgba(0,0,0,0.12)';
      if (vol) { g.beginPath(); g.arc(cx + R * 0.25, cy, R * 0.8, 0, Math.PI * 2); g.fill(); }
      else for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + rand(-R * 0.5, R * 0.5), cy + rand(-R * 0.5, R * 0.5), rand(4, 12), 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    return c;
  }
  function buildTheme() {
    if (!E.LK) return;
    const T = E.theme, type = T.sky, city = type === 'city' || type === 'future';
    layerFar = buildSkyline(7, FAR_H, 50, 165, type === 'future' ? 'rgba(230,240,255,0.18)' : 'rgba(8,2,24,0.45)', 0.35, city ? 0.22 : 0.4, false, type);
    layerNear = buildSkyline(42, NEAR_H, 28, 112, type === 'future' ? 'rgba(14,24,40,0.92)' : 'rgba(5,1,16,0.9)', 0.75, city ? 0.16 : 0.6, true, type);
    backC = buildBackdrop(type);
  }
  // Palette de zone interpolée en douceur pour que les longues parties restent agréables.
  const pal = (E.pal = { s0: [0, 0, 0], s1: [0, 0, 0], s2: [0, 0, 0], gr: [0, 0, 0], ac: [0, 0, 0] });
  let zoneT = null;
  E.zone = i => E.theme.zones[((i % 4) + 4) % 4];
  E.setZone = function (i, instant) {
    zoneT = E.zone(i);
    if (instant) { const z = zoneT; pal.s0 = hex2rgb(z[1]); pal.s1 = hex2rgb(z[2]); pal.s2 = hex2rgb(z[3]); pal.gr = hex2rgb(z[4]); pal.ac = hex2rgb(z[5]); }
  };
  E.setTheme = function (id) {
    E.theme = D.byId(D.THEMES, id) || D.THEMES[0];
    E.music.theme = D.THEMES.indexOf(E.theme);
    document.documentElement.style.setProperty('--theme', E.theme.accent);
    buildTheme(); E.setZone(0, true);
  };
  E.override = null; // palette spéciale (éclipse dorée, faille, boss)
  E.stepPalette = function (dt) {
    const z = E.override || zoneT; if (!z) return;
    const f = 1 - Math.exp(-dt * 1.2), tgt = { s0: z[1], s1: z[2], s2: z[3], gr: z[4], ac: z[5] };
    for (const k in pal) { const c = hex2rgb(tgt[k]); for (let i = 0; i < 3; i++) pal[k][i] += (c[i] - pal[k][i]) * f; }
  };
  E.accentHex = () => (E.override || zoneT || E.theme.zones[0])[5];

  E.drawBackdrop = function (g, bgX, clock) {
    const VW = E.VW, GY = E.GY;
    const sky = g.createLinearGradient(0, 0, 0, GY);
    sky.addColorStop(0, css(pal.s0)); sky.addColorStop(0.55, css(pal.s1)); sky.addColorStop(1, css(pal.s2));
    g.fillStyle = sky; g.fillRect(-20, -20, VW + 40, GY + 22);
    g.fillStyle = '#fff';
    const span = VW + 40, many = E.theme.sky === 'galaxy';
    for (const s of stars) {
      const x = (((s.x * span - bgX * 0.015 * s.z) % span) + span) % span - 20;
      g.globalAlpha = s.z * (0.35 + 0.65 * Math.abs(Math.sin(clock * s.tw + s.p))) * (many ? 1 : 0.9);
      g.fillRect(x, s.y * GY * 0.8, s.r * (many ? 1.3 : 1), s.r * (many ? 1.3 : 1));
    }
    g.globalAlpha = 1;
    if (E.theme.sky === 'ice') { // aurore boréale animée
      g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 2; b++) {
        g.beginPath();
        for (let x = -20; x <= VW + 20; x += 20) g.lineTo(x, GY * (0.22 + b * 0.1) + Math.sin(x * 0.012 + clock * 0.6 + b) * 18);
        g.lineWidth = 26; g.strokeStyle = b ? 'rgba(160,90,255,0.10)' : 'rgba(80,255,190,0.12)'; g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    if (backC) {
      const pw = backC.width / E.LK, ph = backC.height / E.LK, pspan = VW + pw;
      const pcx = ((((VW * 0.7 + pw / 2 - bgX * 0.004) % pspan) + pspan) % pspan) - pw / 2;
      g.drawImage(backC, pcx - pw / 2, GY * 0.36 - ph / 2, pw, ph);
    }
    if (layerFar) for (let x = -((bgX * 0.12) % LAYER_W); x < VW; x += LAYER_W) g.drawImage(layerFar, x, GY - FAR_H + 4, LAYER_W, FAR_H);
    const hz2 = g.createLinearGradient(0, GY - 110, 0, GY);
    hz2.addColorStop(0, cssA(pal.s2, 0)); hz2.addColorStop(1, cssA(pal.s2, 0.55));
    g.fillStyle = hz2; g.fillRect(-20, GY - 110, VW + 40, 110);
    if (layerNear) for (let x = -((bgX * 0.32) % LAYER_W); x < VW; x += LAYER_W) g.drawImage(layerNear, x, GY - NEAR_H + 2, LAYER_W, NEAR_H);
    E.drawGround(g, bgX);
  };
  E.drawGround = function (g, bgX) {
    const VW = E.VW, VH = E.VH, GY = E.GY, d = VH - GY;
    const gr = g.createLinearGradient(0, GY, 0, VH);
    gr.addColorStop(0, css(pal.gr)); gr.addColorStop(1, '#020008');
    g.fillStyle = gr; g.fillRect(-20, GY, VW + 40, d + 20);
    g.strokeStyle = cssA(pal.ac, 0.22); g.lineWidth = 1; g.beginPath();
    const sp = 60, vx = VW / 2, off = bgX % sp; // sol en perspective : les lignes proches défilent plus vite
    for (let u = -off; u < VW + sp; u += sp) { g.moveTo(u, GY); g.lineTo(vx + (u - vx) * 2.6, VH + 4); }
    for (let i = 1; i <= 7; i++) { const y = GY + d * Math.pow(i / 7, 1.7); g.moveTo(-20, y); g.lineTo(VW + 20, y); }
    g.stroke();
    const hl = g.createLinearGradient(0, GY - 26, 0, GY);
    hl.addColorStop(0, cssA(pal.ac, 0)); hl.addColorStop(1, cssA(pal.ac, 0.28));
    g.fillStyle = hl; g.fillRect(-20, GY - 26, VW + 40, 26);
    g.fillStyle = css(pal.ac); g.fillRect(-20, GY - 1.5, VW + 40, 3);
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(-20, GY - 0.5, VW + 40, 1);
    g.fillStyle = cssA(pal.ac, 0.55);
    for (let x = -(bgX % 140); x < VW + 20; x += 140) g.fillRect(x, GY + 7, 34, 2);
  };
  // Particules d'ambiance du thème (neige, braises, lucioles, poussière d'étoiles).
  E.drawAmbient = function (g, clock, dxRate) {
    const t = E.theme.amb; if (!t || E.low()) return;
    const VW = E.VW, GY = E.GY;
    g.globalCompositeOperation = 'lighter';
    for (const p of amb) {
      let x, y, c, r = 1.5 * p.s;
      if (t === 'snow') { y = ((p.y * GY + clock * 30 * p.s) % (GY + 20)) - 10; x = (((p.x * VW - clock * dxRate * 0.3 * p.s + Math.sin(clock + p.p) * 12) % VW) + VW) % VW; c = '#ffffff'; g.globalAlpha = 0.7; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); continue; }
      if (t === 'embers') { y = GY - ((p.y * GY + clock * 40 * p.s) % GY); x = (((p.x * VW - clock * dxRate * 0.2 + Math.sin(clock * 2 + p.p) * 10) % VW) + VW) % VW; c = '#ff8a3e'; }
      else if (t === 'fireflies') { x = (((p.x * VW + Math.sin(clock * 0.7 + p.p) * 40 - clock * dxRate * 0.1) % VW) + VW) % VW; y = GY - 20 - p.y * GY * 0.6 + Math.cos(clock + p.p) * 20; c = '#d4ff6d'; }
      else { x = p.x * VW; y = p.y * GY * 0.7; c = '#ffffff'; r = 1; }
      glowAt(g, c, x, y, 6 * p.s, 0.5 + 0.5 * Math.sin(clock * 3 + p.p));
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
  E.vignette = function (g) {
    const VW = E.VW, VH = E.VH, vg = g.createRadialGradient(VW / 2, VH * 0.45, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.45, Math.max(VW, VH) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg; g.fillRect(-20, -20, VW + 40, VH + 40);
    if (E.flash > 0) { g.fillStyle = `rgba(255,255,255,${E.flash * 0.6})`; g.fillRect(-20, -20, VW + 40, VH + 40); }
  };
  E.beginFrame = function (g) {
    g.setTransform(E.DPR * E.S, 0, 0, E.DPR * E.S, 0, 0);
    if (E.shakeT > 0) { const a = E.shakeM * Math.min(1, E.shakeT * 4); g.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a); }
  };
})(window.LR = window.LR || {});
