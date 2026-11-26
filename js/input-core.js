/* Luma Rush — logique pure des commandes (sans DOM) : touches clavier, gestes tactiles du RUN, disposition tactile du BATTLE. */
'use strict';
(function (root) {
  const I = {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ───────────── Clavier ─────────────
  const SKILLS = [['skill1', 'Compétence 1'], ['skill2', 'Compétence 2'], ['skill3', 'Compétence 3']];
  I.ACTIONS = {
    run: [['jump', 'Sauter / double saut'], ['slide', 'Glisser / plonger'], ...SKILLS, ['pause', 'Pause']],
    battle: [['left', 'Aller à gauche'], ['right', 'Aller à droite'], ['jump', 'Sauter'], ['down', 'Descendre / chute rapide'], ['attack', 'Attaquer'], ['dash', 'Esquive'], ...SKILLS, ['pause', 'Pause']],
  };
  const skillKeys = { skill1: ['Digit1', 'Numpad1'], skill2: ['Digit2', 'Numpad2'], skill3: ['Digit3', 'Numpad3'], pause: ['KeyP'] };
  const DEFAULTS = {
    run: Object.assign({ jump: ['Space', 'ArrowUp', 'KeyW'], slide: ['ArrowDown', 'KeyS'] }, skillKeys),
    battle: Object.assign({ left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], jump: ['Space', 'ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
      attack: ['KeyJ', 'KeyX', 'KeyF'], dash: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyC'] }, skillKeys),
  };
  I.MAX_KEYS = 4;
  const copyMode = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.slice()]));
  I.defaultKeys = () => ({ run: copyMode(DEFAULTS.run), battle: copyMode(DEFAULTS.battle) });
  // Échap = pause/retour (fixe) ; Entrée = menus ; les autres sont captées par le navigateur ou le système.
  I.isReserved = code => !code || typeof code !== 'string' || /^(Escape|Tab|Enter|NumpadEnter|CapsLock|NumLock|ScrollLock|PrintScreen|Pause|ContextMenu|Unidentified|Fn|FnLock)$/.test(code) || /^(F\d{1,2}$|Meta|Control|Alt|OS)/.test(code);
  function validMode(mode, m) {
    if (!m || typeof m !== 'object') return false;
    const seen = new Set();
    return I.ACTIONS[mode].every(([a]) => Array.isArray(m[a]) && m[a].length >= 1 && m[a].length <= I.MAX_KEYS && m[a].every(c => !I.isReserved(c) && !seen.has(c) && (seen.add(c), true)));
  }
  // Une configuration invalide (touche vide, doublon, réservée) est remplacée par les touches par défaut du mode concerné uniquement.
  I.sanitizeKeys = function (raw) {
    const out = I.defaultKeys();
    for (const mode in out) if (raw && validMode(mode, raw[mode])) out[mode] = Object.fromEntries(I.ACTIONS[mode].map(([a]) => [a, raw[mode][a].slice()]));
    return out;
  };
  I.actionFor = (keys, mode, code) => { const m = keys[mode]; for (const a in m) if (m[a].includes(code)) return a; return null; };
  // Affecte une touche. Conflit avec une autre action du même mode : refusé, sauf force (la touche est alors déplacée ou échangée).
  I.bindKey = function (keys, mode, action, slot, code, force) {
    if (I.isReserved(code)) return { ok: false, reason: 'reserved' };
    const next = { run: copyMode(keys.run), battle: copyMode(keys.battle) }, m = next[mode], list = m[action];
    const at = list.indexOf(code);
    if (at >= 0) return at === slot ? { ok: true, keys: next } : { ok: false, reason: 'same' };
    const old = slot < list.length ? list[slot] : null;
    if (!old && list.length >= I.MAX_KEYS) return { ok: false, reason: 'full' };
    const other = I.actionFor(next, mode, code);
    if (other) {
      if (!force) return { ok: false, reason: 'conflict', conflict: other };
      const j = m[other].indexOf(code);
      if (m[other].length > 1) m[other].splice(j, 1);
      else if (old) m[other][j] = old; // échange : l'autre action ne reste jamais sans touche
      else return { ok: false, reason: 'wouldEmpty', conflict: other };
    }
    if (old) list[slot] = code; else list.push(code);
    return { ok: true, keys: next };
  };
  I.removeKey = function (keys, mode, action, slot) {
    const next = { run: copyMode(keys.run), battle: copyMode(keys.battle) }, list = next[mode][action];
    if (list.length <= 1) return { ok: false, reason: 'wouldEmpty' };
    list.splice(slot, 1);
    return { ok: true, keys: next };
  };
  const NAMES = { Space: 'Espace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Maj G', ShiftRight: 'Maj D', Backspace: 'Retour', Delete: 'Suppr', Insert: 'Inser', Home: 'Début', End: 'Fin', PageUp: 'Pg ↑', PageDown: 'Pg ↓' };
  const AZERTY = { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A', KeyZ: 'W', Semicolon: 'M', KeyM: ',' };
  // Les codes désignent une position physique ; learned = lettres réellement vues sur le clavier du joueur.
  I.keyLabel = function (code, learned, azerty) {
    if (NAMES[code]) return NAMES[code];
    if (/^Digit\d$/.test(code)) return code.slice(5);
    if (/^Numpad\d$/.test(code)) return 'Pavé ' + code.slice(6);
    if (learned && learned[code]) return learned[code];
    if (azerty && AZERTY[code]) return AZERTY[code];
    return /^Key[A-Z]$/.test(code) ? code.slice(3) : code;
  };

  // ───────────── IA des boss : choix pondéré sans jamais enchaîner deux fois la même attaque ─────────────
  I.pickAttack = function (n, last, weights, rng) {
    const w = Array.from({ length: n }, (_, i) => (n > 1 && i === last ? 0 : (weights && weights[i]) || 1));
    let k = rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i++) if (w[i] && (k -= w[i]) <= 0) return i;
    return w.reduce((best, v, i) => (v ? i : best), 0);
  };

  // ───────────── RUN tactile : toucher = sauter, maintenir = glisser ─────────────
  I.HOLD_MS = 140;
  I.makeRunGesture = function (o) {
    const set = o.setTimer || ((f, ms) => setTimeout(f, ms)), clear = o.clearTimer || (t => clearTimeout(t));
    const ptrs = new Map(); let slider = null;
    function end(id, cancelled) {
      const p = ptrs.get(id); if (!p) return;
      ptrs.delete(id); clear(p.timer);
      if (slider === id) { slider = null; o.slideEnd(); }
      else if (!cancelled && !p.held) o.tap(); // un second doigt maintenu pendant une glissade ne déclenche rien au relâchement
    }
    return {
      down(id) {
        if (ptrs.has(id)) return;
        const p = { held: false, timer: null };
        ptrs.set(id, p);
        p.timer = set(() => { if (ptrs.get(id) !== p) return; p.held = true; if (slider === null) { slider = id; o.slideStart(); } }, o.holdMs || I.HOLD_MS);
      },
      up: id => end(id, false),
      cancel: id => end(id, true),
      reset() { for (const id of [...ptrs.keys()]) end(id, true); },
    };
  };

  // ───────────── Géométrie de l'écran ─────────────
  // Avec des commandes à l'écran, le sol remonte juste assez pour qu'elles tiennent sous l'arène (reserve = leur hauteur en px).
  I.MIN_SKY = 270;
  I.viewMetrics = function (w, h, reserve = 0) {
    const S = Math.min(h / 450, w / 640), VW = w / S, VH = h / S;
    let GY = VH - Math.max(110, VH * 0.28);
    if (reserve) GY = Math.max(I.MIN_SKY, Math.min(GY, (h - reserve) / S));
    return { S, VW, VH, GY };
  };

  // ───────────── Disposition des commandes tactiles (BATTLE et RUN) ─────────────
  I.CONTROLS = [['stick', 'Joystick'], ['attack', 'Attaque'], ['jump', 'Saut'], ['dash', 'Esquive'], ['skill1', 'Compétence 1'], ['skill2', 'Compétence 2'], ['skill3', 'Compétence 3']];
  I.RUN_CONTROLS = [['runSlide', 'Glisse'], ['runJump', 'Saut'], ['runSkill1', 'Compétence 1'], ['runSkill2', 'Compétence 2'], ['runSkill3', 'Compétence 3']];
  I.controlsFor = mode => (mode === 'run' ? I.RUN_CONTROLS : I.CONTROLS);
  I.MIN_TARGET = 44; I.OPACITY = 0.75;
  const NO_SAFE = { t: 0, r: 0, b: 0, l: 0 };
  I.orientationOf = (w, h) => (w > h ? 'landscape' : 'portrait');
  // Disposition par défaut en pixels CSS : { id: { x, y (centre), d (diamètre) } }.
  // RUN : GLISSE sous le pouce gauche, SAUT sous le pouce droit, compétences entre les deux (ou au-dessus s'il manque de place).
  function runLayout(w, h, safe) {
    // En paysage la taille suit la hauteur disponible, pour que le double saut reste entièrement visible au-dessus du sol.
    const d = Math.round(w > h ? clamp(h * 0.34 - safe.b - 18, 72, 108) : clamp(w * 0.27, 88, 120));
    const sk = Math.round(clamp(Math.min(w, h) * 0.125, I.MIN_TARGET, 56)), gap = 10, side = 16;
    const bottom = h - safe.b - 12, left = safe.l + side, right = w - safe.r - side;
    const o = { runSlide: { x: left + d / 2, y: bottom - d / 2, d }, runJump: { x: right - d / 2, y: bottom - d / 2, d } };
    const row = 3 * sk + 2 * gap, between = right - left - 2 * d - 2 * gap;
    const y = between >= row ? bottom - sk / 2 : bottom - d - gap - sk / 2, start = (left + right - row) / 2;
    for (let i = 0; i < 3; i++) o['runSkill' + (i + 1)] = { x: start + sk / 2 + i * (sk + gap), y, d: sk };
    return o;
  }
  I.defaultLayout = function (w, h, safe = NO_SAFE, mode = 'battle') {
    if (mode === 'run') return runLayout(w, h, safe);
    const k = clamp(Math.min(w, h) / 390, 0.8, 1.35), size = (base, lo, hi) => Math.round(clamp(base * k, lo, hi));
    const st = size(112, 92, 150), at = size(76, 62, 96), ju = size(62, 52, 80), da = size(54, 46, 70), sk = size(48, I.MIN_TARGET, 60);
    const m = 14, gap = 10, bottom = h - safe.b - m, left = safe.l + m, right = w - safe.r - m;
    const o = {};
    o.stick = { x: left + 4 + st / 2, y: bottom - st / 2, d: st };
    o.attack = { x: right - at / 2, y: bottom - at / 2 - 4, d: at };
    o.jump = { x: o.attack.x - at / 2 - gap - ju / 2, y: bottom - ju / 2 - 6, d: ju };
    o.dash = { x: o.jump.x - ju / 2 - gap - da / 2, y: bottom - da / 2, d: da };
    const row = 3 * sk + 2 * gap, x0 = o.stick.x + st / 2 + gap, x1 = o.dash.x - da / 2 - gap;
    if (w > h && x1 - x0 >= row) { // paysage : les compétences au centre, entre les deux pouces
      const start = (x0 + x1 - row) / 2;
      for (let i = 0; i < 3; i++) o['skill' + (i + 1)] = { x: start + sk / 2 + i * (sk + gap), y: bottom - sk / 2, d: sk };
    } else { // portrait (ou paysage étroit) : rangée au-dessus des boutons d'action
      const y = bottom - Math.max(st, at + 4) - gap - sk / 2;
      for (let i = 0; i < 3; i++) o['skill' + (i + 1)] = { x: right - sk / 2 - (2 - i) * (sk + gap), y, d: sk };
    }
    return o;
  };
  // Applique les préférences du joueur (positions en fractions de l'écran) et garde chaque commande dans la zone sûre.
  I.resolveLayout = function (saved, w, h, safe = NO_SAFE, mode = 'battle') {
    const base = I.defaultLayout(w, h, safe, mode), mine = (saved && saved[I.orientationOf(w, h)]) || {}, out = {};
    for (const [id] of I.controlsFor(mode)) {
      const b = base[id], u = mine[id] || {};
      const s = clamp(u.s == null ? 1 : u.s, 0.7, 1.5), d = Math.max(I.MIN_TARGET, Math.round(b.d * s));
      const x = u.x == null ? b.x : u.x * w, y = u.y == null ? b.y : u.y * h;
      out[id] = { x: clamp(x, safe.l + 4 + d / 2, w - safe.r - 4 - d / 2), y: clamp(y, safe.t + 4 + d / 2, h - safe.b - 4 - d / 2), d, s, o: clamp(u.o == null ? I.OPACITY : u.o, 0.25, 1) };
    }
    return out;
  };
  // Hauteur occupée en bas par la disposition par défaut : le sol ne bouge pas quand le joueur déplace un bouton.
  I.reservePx = (w, h, safe, mode) => h - Math.min(...Object.values(I.defaultLayout(w, h, safe, mode)).map(p => p.y - p.d / 2)) + 4;
  I.overlaps = function (layout) {
    const ids = Object.keys(layout), out = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = layout[ids[i]], b = layout[ids[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.d + b.d) / 2 - 0.5) out.push([ids[i], ids[j]]);
    }
    return out;
  };
  I.sanitizeTouch = function (raw) {
    const out = { portrait: {}, landscape: {} };
    for (const orient in out) for (const [id] of I.CONTROLS.concat(I.RUN_CONTROLS)) {
      const u = raw && raw[orient] && raw[orient][id];
      if (!u || typeof u !== 'object') continue;
      const e = {};
      for (const [k, lo, hi] of [['x', 0, 1], ['y', 0, 1], ['s', 0.7, 1.5], ['o', 0.25, 1]]) if (Number.isFinite(u[k])) e[k] = clamp(u[k], lo, hi);
      if (Object.keys(e).length) out[orient][id] = e;
    }
    return out;
  };
  // Joystick analogique : zone morte puis réponse progressive. dx, dy en pixels depuis le centre ; r = rayon de la base.
  I.stickVector = function (dx, dy, r, dead = 0.16) {
    const len = Math.hypot(dx, dy);
    if (!len || len / r <= dead) return { x: 0, y: 0, mag: 0 };
    const mag = Math.min(1, (len / r - dead) / (0.85 - dead));
    return { x: (dx / len) * mag, y: (dy / len) * mag, mag };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = I;
  else root.LR = Object.assign(root.LR || {}, { I });
})(this);
