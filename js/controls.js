/* Luma Rush — commandes : joystick et boutons tactiles du BATTLE, éditeur de disposition, personnalisation du clavier. */
'use strict';
(function (LR) {
  const E = LR.E, P = LR.P, G = LR.G, I = LR.I, Bt = LR.Battle, Run = LR.Run, C = (LR.C = {});
  const $ = E.$, save = P.save;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // ───────────── Libellés des touches ─────────────
  const azerty = /^fr\b/i.test(navigator.language || '');
  C.label = code => I.keyLabel(code, save.keyLabels, azerty);
  C.keysText = (mode, action) => save.keys[mode][action].map(C.label).join(' / ');
  // On retient la lettre réellement imprimée sur le clavier du joueur (AZERTY, QWERTY, QWERTZ…).
  C.learn = function (e) {
    if (!e.code || !e.key || e.key.length !== 1 || !/\S/.test(e.key) || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || /^(Digit|Numpad)/.test(e.code)) return;
    const v = e.key.toUpperCase();
    if (save.keyLabels[e.code] !== v) { save.keyLabels[e.code] = v; P.touch(); }
  };
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(map => {
    for (const [code, v] of map) if (/^Key/.test(code) && !save.keyLabels[code]) save.keyLabels[code] = v.toUpperCase();
  }).catch(() => { /* facultatif */ });

  // ───────────── Écran de personnalisation du clavier ─────────────
  let tab = 'run';
  C.capture = null;
  C.renderKeys = function () {
    const tabs = $('keyTabs'); tabs.textContent = '';
    for (const [id, name] of [['run', 'RUN MODE'], ['battle', 'BATTLE MODE']]) {
      const b = el('button', id === tab ? 'on' : '', name);
      b.onclick = () => { E.sfx('click'); tab = id; C.capture = null; C.renderKeys(); };
      tabs.append(b);
    }
    const list = $('keyList'); list.textContent = '';
    for (const [action, name] of I.ACTIONS[tab]) {
      const row = el('div', 'keyrow'), slots = el('div', 'keyslots'), keys = save.keys[tab][action];
      row.append(el('span', 'keyname', name), slots);
      const count = Math.min(I.MAX_KEYS, keys.length + 1);
      for (let i = 0; i < count; i++) {
        const waiting = C.capture && C.capture.mode === tab && C.capture.action === action && C.capture.slot === i;
        const wrap = el('span', 'keywrap');
        const b = el('button', 'keycap' + (waiting ? ' waiting' : '') + (i >= keys.length ? ' add' : ''), waiting ? 'Appuie…' : i < keys.length ? C.label(keys[i]) : '+');
        b.setAttribute('aria-label', i < keys.length ? `${name} : touche ${C.label(keys[i])}, modifier` : `${name} : ajouter une touche`);
        b.dataset.action = action; b.dataset.slot = i;
        b.onclick = () => { E.sfx('click'); C.capture = waiting ? null : { mode: tab, action, slot: i }; C.renderKeys(); };
        wrap.append(b);
        if (i < keys.length && keys.length > 1) {
          const x = el('button', 'keydel', '×'); x.setAttribute('aria-label', `Retirer la touche ${C.label(keys[i])} de ${name}`);
          x.onclick = () => { const r = I.removeKey(save.keys, tab, action, i); if (r.ok) apply(r.keys); };
          wrap.append(x);
        }
        slots.append(wrap);
      }
      list.append(row);
    }
    $('keyHint').textContent = C.capture ? 'Appuie sur la nouvelle touche · Échap pour annuler' : 'Clique sur une touche puis appuie sur la nouvelle. Échap met toujours en pause. Enregistrement automatique.';
  };
  function apply(keys) { save.keys = keys; P.persist(); C.capture = null; C.renderKeys(); }
  const actionName = (mode, a) => (I.ACTIONS[mode].find(x => x[0] === a) || [a, a])[1];
  // Appelé par le gestionnaire clavier quand une capture est en cours.
  C.handleCapture = function (e) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape') { C.capture = null; C.renderKeys(); return; }
    C.learn(e);
    const { mode, action, slot } = C.capture, code = e.code, r = I.bindKey(save.keys, mode, action, slot, code);
    if (r.ok) { E.sfx('power'); apply(r.keys); return; }
    E.sfx('nope');
    if (r.reason === 'conflict') {
      C.capture = null; C.renderKeys();
      LR.UI.confirm('Touche déjà utilisée', `« ${C.label(code)} » sert déjà à « ${actionName(mode, r.conflict)} ». La déplacer vers « ${actionName(mode, action)} » ?`, null, () => {
        const f = I.bindKey(save.keys, mode, action, slot, code, true);
        if (f.ok) apply(f.keys); else LR.UI.toast(`Impossible : « ${actionName(mode, r.conflict)} » n’aurait plus de touche`, '✕');
      });
      return;
    }
    LR.UI.toast(r.reason === 'reserved' ? 'Touche réservée au système ou aux menus' : r.reason === 'same' ? 'Cette touche est déjà attribuée à cette action' : 'Maximum atteint', '✕');
  };
  $('keyReset').onclick = () => { const d = I.defaultKeys(), k = { run: save.keys.run, battle: save.keys.battle }; k[tab] = d[tab]; apply(k); LR.UI.toast(`Touches ${tab === 'run' ? 'RUN' : 'BATTLE'} réinitialisées`, '✓'); };
  $('keyResetAll').onclick = () => { apply(I.defaultKeys()); LR.UI.toast('Toutes les touches réinitialisées', '✓'); };

  // ───────────── Commandes tactiles (BATTLE : joystick et actions ; RUN : GLISSE et SAUT) ─────────────
  const root = $('touchBattle');
  let nodes = {}, layout = null, editing = false, selected = 'stick', stickPtr = null, kind = 'battle';
  const downBy = new Map(); // un seul doigt par bouton : pas de double commande
  C.layout = () => layout;
  function resetStick() { stickPtr = null; Bt.setStick(0, 0); if (nodes.stick) nodes.stick.firstChild.style.transform = ''; }
  C.release = function () { if (nodes.stick) resetStick(); downBy.clear(); for (const id in nodes) nodes[id].classList.remove('press'); };

  C.mount = function (edit, mode) {
    editing = !!edit; kind = mode || 'battle'; root.textContent = ''; nodes = {}; stickPtr = null; downBy.clear();
    root.classList.toggle('edit', editing);
    const make = (id, node) => { node.dataset.id = id; node.classList.add('tc'); nodes[id] = node; root.append(node); bind(id, node); };
    const button = (id, cls, text, label) => { const b = el('button', 'tc-btn ' + cls, text); b.setAttribute('aria-label', label); make(id, b); };
    if (kind === 'run') {
      button('runSlide', 'tc-run tc-slide', 'GLISSE', 'Glisser');
      button('runJump', 'tc-run tc-hop', 'SAUT', 'Sauter');
    } else {
      const stick = el('div', 'tc-stick'); stick.append(el('div', 'knob')); stick.setAttribute('aria-label', 'Joystick de déplacement'); make('stick', stick);
      button('attack', 'tc-attack', '⚔', 'Attaque'); button('jump', 'tc-jump', 'SAUT', 'Saut'); button('dash', 'tc-dash', 'ESQUIVE', 'Esquive');
    }
    for (let i = 0; i < 3; i++) {
      const s = G.slots && G.slots[i], n = el('div', 'sk' + (s && s.passive ? ' passive' : '')), id = (kind === 'run' ? 'runSkill' : 'skill') + (i + 1);
      if (s) { n.append(E.iconEl(s.def.icon, 24, '#3ef2ff')); if (s.passive) n.append(el('small', null, 'AUTO')); }
      else if (editing) n.append(el('span', null, String(i + 1)));
      make(id, n);
      if (!s && !editing) n.hidden = true;
      if (s && !editing) s.btn = n;
    }
    root.classList.add('on');
    selected = kind === 'run' ? 'runJump' : 'stick'; // avant la mise en page : l'élément de l'autre mode n'existe pas ici
    C.relayout();
    if (editing) select(selected);
  };
  C.unmount = function () { C.release(); root.classList.remove('on', 'edit'); root.textContent = ''; nodes = {}; };
  C.visible = v => root.classList.toggle('on', v);
  C.relayout = function () {
    if (!Object.keys(nodes).length) return;
    layout = I.resolveLayout(save.touch, E.W, E.H, E.safe, kind);
    for (const id in nodes) {
      const p = layout[id], st = nodes[id].style;
      st.left = p.x - p.d / 2 + 'px'; st.top = p.y - p.d / 2 + 'px'; st.width = st.height = p.d + 'px'; st.opacity = p.o;
    }
    if (editing) updateEditor();
  };

  function moveStick(e) {
    const r = nodes.stick.getBoundingClientRect(), rad = r.width / 2;
    const v = I.stickVector(e.clientX - (r.left + rad), e.clientY - (r.top + rad), rad);
    Bt.setStick(v.x, v.y);
    nodes.stick.firstChild.style.transform = `translate(${v.x * rad * 0.55}px, ${v.y * rad * 0.55}px)`;
  }
  const skillIndex = id => +id.slice(-1) - 1;
  function pressControl(id) {
    if (id === 'runJump') Run.pressJump(); else if (id === 'runSlide') Run.pressSlide();
    else if (id === 'jump') Bt.pressJump(); else if (id === 'dash') Bt.dash(); else if (id === 'attack') Bt.pressAttack();
    else LR.UI.useSkill(skillIndex(id));
  }
  function releaseControl(id) {
    if (id === 'runJump') Run.releaseJump(); else if (id === 'runSlide') Run.releaseSlide();
    else if (id === 'jump') Bt.releaseJump(); else if (id === 'attack') Bt.releaseAttack();
  }
  function bind(id, node) {
    node.addEventListener('contextmenu', e => e.preventDefault());
    node.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      try { node.setPointerCapture(e.pointerId); } catch (err) { /* capture facultative */ }
      if (editing) { startDrag(id, e); return; }
      if (LR.UI.state() !== 'play') return;
      node.classList.add('press');
      if (id === 'stick') { if (stickPtr === null) { stickPtr = e.pointerId; moveStick(e); } return; }
      if (downBy.has(id)) return;
      downBy.set(id, e.pointerId); pressControl(id);
    });
    node.addEventListener('pointermove', e => { if (editing) drag(id, e); else if (id === 'stick' && e.pointerId === stickPtr) moveStick(e); });
    const up = e => {
      if (editing) { endDrag(e); return; }
      if (id === 'stick') { if (e.pointerId === stickPtr) { node.classList.remove('press'); resetStick(); } return; }
      if (downBy.get(id) !== e.pointerId) return;
      downBy.delete(id); node.classList.remove('press'); releaseControl(id);
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) node.addEventListener(ev, up);
  }

  // ───────────── Éditeur ─────────────
  let dragging = null;
  const orient = () => I.orientationOf(E.W, E.H);
  function pref(id) { const o = save.touch[orient()]; return o[id] || (o[id] = {}); }
  function select(id) { selected = id; for (const k in nodes) nodes[k].classList.toggle('selected', k === id); updateEditor(); }
  function updateEditor() {
    if (!layout) return;
    const p = layout[selected];
    $('teName').textContent = (kind === 'run' ? 'RUN · ' : 'BATTLE · ') + I.controlsFor(kind).find(c => c[0] === selected)[1];
    $('teSize').value = Math.round(p.s * 100); $('teSizeVal').textContent = Math.round(p.s * 100) + ' %';
    $('teOpacity').value = Math.round(p.o * 100); $('teOpacityVal').textContent = Math.round(p.o * 100) + ' %';
    $('teOrient').textContent = orient() === 'landscape' ? 'Disposition paysage' : 'Disposition portrait';
    const over = I.overlaps(layout);
    $('teWarn').textContent = over.length ? '⚠ Des commandes se chevauchent' : '';
    for (const k in nodes) nodes[k].classList.toggle('overlap', over.some(pair => pair.includes(k)));
  }
  function startDrag(id, e) { select(id); const p = layout[id]; dragging = { id, ptr: e.pointerId, dx: p.x - e.clientX, dy: p.y - e.clientY }; }
  function drag(id, e) {
    if (!dragging || dragging.ptr !== e.pointerId || dragging.id !== id) return;
    const u = pref(id);
    u.x = Math.min(1, Math.max(0, (e.clientX + dragging.dx) / E.W)); u.y = Math.min(1, Math.max(0, (e.clientY + dragging.dy) / E.H));
    C.relayout();
  }
  function endDrag(e) { if (dragging && dragging.ptr === e.pointerId) { dragging = null; P.persist(); } }
  $('teSize').oninput = e => { pref(selected).s = e.target.value / 100; C.relayout(); };
  $('teOpacity').oninput = e => { pref(selected).o = e.target.value / 100; C.relayout(); };
  $('teSize').onchange = $('teOpacity').onchange = () => P.persist();
  // Ne réinitialise que le mode et l'orientation affichés : les réglages de l'autre mode sont conservés.
  $('teReset').onclick = () => { for (const [id] of I.controlsFor(kind)) delete save.touch[orient()][id]; P.persist(); C.relayout(); E.sfx('click'); };
  C.resetTouch = () => { save.touch = { portrait: {}, landscape: {} }; P.persist(); C.relayout(); };
})(window.LR = window.LR || {});
