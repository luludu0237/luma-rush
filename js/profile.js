/* Luma Rush — profil joueur : pseudo et photo choisie parmi les personnages existants (aucune image importée). */
'use strict';
(function (LR) {
  const D = LR.D, E = LR.E, P = LR.P, Pr = (LR.Pr = {});
  const $ = E.$, save = P.save, fmt = E.fmt;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  // Pastille ronde : le personnage choisi, dessiné par le même code que dans le jeu.
  Pr.avatar = function (size, id, skin) { // skin imposé pour les autres joueurs
    const a = id || save.profile.avatar, wrap = el('span', 'avatar');
    wrap.style.width = wrap.style.height = size + 'px';
    wrap.append(LR.UI.charCanvas(a, skin || save.skinByChar[a] || 'default', size, { st: 'idle', t: 0.4 }));
    return wrap;
  };
  Pr.identity = function (size, name) {
    const row = el('span', 'identity');
    row.append(Pr.avatar(size), el('b', null, name || save.profile.name));
    return row;
  };

  // ───────────── Page profil ─────────────
  Pr.render = function () {
    const li = P.level(), s = save.stats, head = $('pfHead'); head.textContent = '';
    const info = el('div', 'pfinfo');
    info.append(el('h3', 'pfname', save.profile.name), el('div', 'lvl', `NIVEAU ${li.level}`));
    const bar = el('div', 'xpbar'), fill = el('i'); fill.style.width = (li.need ? (li.cur / li.need) * 100 : 100) + '%'; bar.append(fill);
    const coins = el('div', 'pill'); coins.append(el('i', 'shard'), el('b', null, fmt(save.coins)));
    info.append(bar, el('small', null, li.need ? `${fmt(li.cur)} / ${fmt(li.need)} XP` : 'Niveau maximum'), coins);
    head.append(Pr.avatar(112), info);
    const grid = (host, rows) => { host.textContent = ''; for (const [k, v] of rows) { const d = el('div'); d.append(el('b', null, String(v)), el('span', null, k)); host.append(d); } };
    grid($('pfProgress'), [['Personnages', `${save.chars.length}/${D.CHARACTERS.length}`], ['Skins', `${save.skins.length}/${D.SKINS.length}`], ['Objets', `${save.items.length}/${D.ITEMS.length}`],
      ['Thèmes', `${save.themes.length}/${D.THEMES.length}`], ['Boss différents vaincus', `${D.BOSSES.filter(b => (save.bosses[b.id] || {}).kills).length}/${D.BOSSES.length}`], ['Succès', `${D.ACHIEVEMENTS.filter(a => save.ach[a.id]).length}/${D.ACHIEVEMENTS.length}`]]);
    grid($('pfRecords'), [['Meilleur score Run', fmt(save.best)], ['Meilleure distance', fmt(save.bestDist) + ' m'], ['Meilleure vague', save.bestWave]]);
    const h = Math.floor(s.playTime / 3600), m = Math.floor((s.playTime % 3600) / 60);
    grid($('pfStats'), [['Parties', s.games], ['Temps de jeu', `${h} h ${String(m).padStart(2, '0')}`], ['Ennemis éliminés', fmt(s.kills)], ['Boss vaincus', s.bosses], ['Éclats gagnés', fmt(s.coinsEarned)], ['Frôlements', fmt(s.near)]]);
    const last = D.ACHIEVEMENTS.filter(a => save.ach[a.id]).sort((a, b) => save.ach[b.id] - save.ach[a.id]).slice(0, 4), host = $('pfAch'); host.textContent = '';
    for (const a of last) { const row = el('div', 'ach done'), m2 = el('div', 'medal'); m2.append(E.wingEl(1, 54)); const body = el('div'); body.append(el('b', null, a.name), el('small', null, a.desc)); row.append(m2, body, el('div', 'rw', '✓')); host.append(row); }
    if (!last.length) host.append(el('p', 'hint', 'Aucun succès pour l’instant.'));
  };

  // ───────────── Modification du pseudo et de la photo (aperçu avant confirmation) ─────────────
  let draft = null, back = 'profile';
  Pr.openEditor = function (from) {
    back = from || 'profile';
    draft = { name: save.profile.name, avatar: save.profile.avatar };
    $('nameInput').value = draft.name;
    Pr.renderEditor(); LR.UI.go('editprofile');
  };
  Pr.renderEditor = function () {
    if (!draft) return;
    const prev = $('avatarPreview'); prev.textContent = '';
    const valid = D.cleanName(draft.name);
    const big = Pr.avatar(112, draft.avatar), sample = el('div', 'sample');
    const row = el('span', 'identity'); row.append(Pr.avatar(34, draft.avatar), el('b', null, valid || draft.name || '…'));
    sample.append(el('small', null, 'Aperçu : voici comment tu apparaîtras'), row);
    prev.append(big, sample);
    $('nameError').textContent = valid ? '' : '3 à 16 caractères : lettres, chiffres, espace, tiret, apostrophe.';
    $('profileSave').disabled = !valid;
    const grid = $('avatarGrid'); grid.textContent = '';
    for (const ch of D.CHARACTERS.filter(c => D.avatarAllowed(save, c.id))) {
      const b = el('button', 'avatarpick' + (draft.avatar === ch.id ? ' on' : ''));
      b.dataset.id = ch.id; b.setAttribute('aria-pressed', draft.avatar === ch.id);
      b.append(Pr.avatar(64, ch.id), el('span', null, ch.name));
      b.onclick = () => { draft.avatar = ch.id; E.sfx('click'); Pr.renderEditor(); };
      grid.append(b);
    }
  };
  $('nameInput').oninput = e => { if (!draft) return; draft.name = e.target.value; const keep = e.target.selectionStart; Pr.renderEditor(); e.target.selectionStart = e.target.selectionEnd = keep; };
  $('profileSave').onclick = () => {
    const name = D.cleanName(draft.name);
    if (!name || !D.avatarAllowed(save, draft.avatar)) return;
    save.profile = { name, avatar: draft.avatar }; P.persist(); E.sfx('power'); LR.UI.toast('Profil mis à jour', '✓');
    draft = null; LR.UI.go(back);
  };
  $('profileCancel').onclick = () => { draft = null; E.sfx('click'); LR.UI.go(back); };
})(window.LR = window.LR || {});
