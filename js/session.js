/* Luma Rush — session de jeu commune aux deux modes : personnage, bonus, compétences actives. */
'use strict';
(function (LR) {
  const D = LR.D, G = (LR.G = {});
  G.begin = function (mode) {
    const save = LR.P.save;
    G.mode = mode;
    G.charId = save.char;
    G.skin = save.skinByChar[save.char] || 'default';
    G.mods = D.mods(save, save.char);
    G.boost = { dmg: 1, rate: 1, speed: 1, cd: 1, crit: 0, leech: 0, greed: false }; // bonus de vague (Battle)
    const slots = D.skillSlots(save);
    G.slots = save.loadout.slice(0, slots).map(id => {
      if (!id) return null;
      const s = D.byId(D.SKILLS, id), st = D.skillStats(save, id, G.mods);
      return { id, def: s, dur: st.dur, cdMax: st.cd, cd: 0, active: 0, passive: !!s.passive };
    });
    G.second = (G.slots.some(s => s && s.id === 'second') ? 1 : 0) + (G.mods.freeSecond ? 1 : 0);
    G.shieldUsed = false;
  };
  G.pal = t => LR.E.palette(G.charId, G.skin, t);
  G.has = id => G.slots.some(s => s && s.id === id && s.active > 0);
  G.left = id => { const s = G.slots.find(x => x && x.id === id); return s ? s.active : 0; };
  // Déclenche la compétence d'un emplacement si elle est rechargée. handler(id, slot) applique l'effet propre au mode.
  G.use = function (i, handler) {
    const s = G.slots[i];
    if (!s || s.passive) return false;
    if (s.cd > 0) { LR.E.sfx('nope'); return false; }
    s.cd = s.cdMax * G.boost.cd; s.active = s.dur;
    if (s.id === 'shield') G.shieldUsed = true;
    LR.E.sfx('skill');
    handler(s.id, s);
    LR.P.stat('skillsUsed');
    return true;
  };
  G.step = function (dt) {
    for (const s of G.slots) if (s) { if (s.cd > 0) s.cd = Math.max(0, s.cd - dt); if (s.active > 0) s.active = Math.max(0, s.active - dt); }
  };
  G.refreshCooldowns = k => { for (const s of G.slots) if (s) s.cd *= k; };
  // Seconde chance : consomme une charge et renvoie true si le joueur survit.
  G.trySecond = function () { if (G.second <= 0) return false; G.second--; LR.E.sfx('rare'); return true; };
})(window.LR = window.LR || {});
