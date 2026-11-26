/* Luma Rush — interface (menus, boutique, collection…), commandes et boucle principale. */
'use strict';
(function (LR) {
  const D = LR.D, E = LR.E, P = LR.P, G = LR.G, I = LR.I, C = LR.C, Pr = LR.Pr, Run = LR.Run, Bt = LR.Battle;
  const $ = E.$, fmt = E.fmt, save = P.save, UI = (LR.UI = {});
  E.clock = 0; E.bgX = 0;
  let state = 'menu', mode = null, screen = 'hub', prepMode = 'run', lastOpts = {}, deathT = 0, timeScale = 1, countT = 0, lastCount = 0;
  let overReady = false, overAnim = null, hintT = 0, victory = false, afterReveal = null;
  let isTouch = matchMedia('(pointer: coarse)').matches;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const RNAME = r => D.RARITY[r].name;

  // ───────────── Bannières, toasts ─────────────
  UI.toast = function (title, right) {
    const t = el('div', 'toast'); t.append(el('span', null, title), el('b', null, right || ''));
    $('toasts').append(t); setTimeout(() => t.remove(), 2800);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  };
  const bannerQ = []; let bannerT = 0, bannerGap = 0;
  UI.banner = (title, sub, color) => { if (bannerQ.length < 4) bannerQ.push({ title, sub, color }); };
  function clearBanner() { bannerQ.length = 0; if (bannerT > 0) bannerT = 0.001; }
  function stepBanner(dt) {
    const b = $('banner');
    if (bannerT > 0) { if ((bannerT -= dt) <= 0) { b.classList.remove('show'); bannerGap = 0.35; } return; }
    if (bannerGap > 0) { bannerGap -= dt; return; }
    const n = bannerQ.shift(); if (!n) return;
    $('bTitle').textContent = n.title; $('bSub').textContent = n.sub; b.style.setProperty('--c', n.color); b.classList.add('show'); bannerT = 2.1;
  }
  let bossRef = null;
  UI.bossBar = function (b) {
    bossRef = b; $('bossBar').hidden = !b;
    if (b) { $('bossName').textContent = b.def.name; $('bossTitle').textContent = b.def.title; $('bossBar').style.setProperty('--bc', b.def.col); }
  };

  // ───────────── Écrans ─────────────
  const SCREENS = ['hub', 'prep', 'shop', 'collection', 'custom', 'achievements', 'board', 'settings', 'profilePage', 'editprofile', 'keys', 'touchedit', 'pause', 'results', 'boost', 'reveal', 'confirm'];
  function show(id, keep) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    for (const s of SCREENS) { if (keep && keep.includes(s)) continue; const e = $(s), on = s === id; e.classList.toggle('on', on); e.inert = !on; }
    if (['hub', 'prep', 'shop', 'collection', 'custom', 'achievements', 'board', 'settings', 'profilePage', 'editprofile', 'keys', 'touchedit'].includes(id)) screen = id;
  }
  function overlay(id, on) { const e = $(id); e.classList.toggle('on', on); e.inert = !on; }
  function go(id) { E.sfx('click'); RENDER[id] && RENDER[id](); show(id); }
  const RENDER = { profilePage: () => Pr.render(), editprofile: () => Pr.renderEditor(), keys: () => C.renderKeys() };

  // Aperçus de personnages dessinés dans un canvas.
  function charCanvas(charId, skinId, size, pose) {
    const c = E.makeCanvas(size * 2, size * 2), g = c.getContext('2d'), k = (size * 2) / 70;
    c.style.width = c.style.height = size + 'px';
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(35, 60, 18, 4, 0, 0, Math.PI * 2); g.fill();
    E.drawChar(g, charId, 35, 60, Object.assign({ st: 'idle', t: 0.4, runT: 0.6, ant: 0.35, facing: 1 }, pose || {}), E.palette(charId, skinId || 'default', 3.75));
    return c;
  }
  const gem = (r, size) => E.gemEl(r, size || 22);
  function card(o) {
    const c = el('button', 'card-it r-' + (o.rarity || 'common') + (o.cls ? ' ' + o.cls : ''));
    const art = el('div', 'art'); if (o.art) art.append(o.art); c.append(art);
    if (o.rarity) c.append(gem(o.rarity, 20));
    if (o.rarity) { const r = el('span', 'rlabel r-' + o.rarity, RNAME(o.rarity)); c.append(r); }
    c.append(el('div', 'nm', o.name));
    if (o.levels != null) { const lv = el('div', 'lv'); for (let i = 0; i < o.levels[1]; i++) lv.append(el('i', i < o.levels[0] ? 'on' : '')); c.append(lv); }
    if (o.desc) c.append(el('div', 'ds', o.desc));
    if (o.perk) c.append(el('div', 'perk', o.perk));
    if (o.status != null) { const st = el('div', 'st'); if (o.price != null) { st.append(el('i', 'shard'), document.createTextNode(' ' + fmt(o.price))); } else st.textContent = o.status; c.append(st); }
    if (o.onClick) c.onclick = () => o.onClick(c);
    return c;
  }
  const refuse = c => { E.sfx('nope'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); };
  const coinsNow = () => document.querySelectorAll('.coinsNow').forEach(e => { e.textContent = fmt(save.coins); });
  function tabs(host, list, cur, onPick) {
    host.textContent = '';
    for (const [id, label] of list) { const b = el('button', id === cur ? 'on' : '', label); b.onclick = () => { E.sfx('click'); onPick(id); }; host.append(b); }
  }

  // ───────────── Menu principal ─────────────
  let sideTab = 'missions', logoTaps = [];
  RENDER.hub = function () {
    LR.Online.focus(null, false);
    P.ensureTasks();
    const li = P.level();
    drawAvatar();
    $('pfName').textContent = save.profile.name;
    const lv = $('pfLevel'); lv.textContent = ''; lv.append(E.wingEl(Math.floor((li.level - 1) / 10), 34), document.createTextNode('NIV. ' + li.level));
    $('pfXp').style.width = (li.need ? (li.cur / li.need) * 100 : 100) + '%';
    $('pfXpText').textContent = li.need ? `${fmt(li.cur)} / ${fmt(li.need)} XP · ${title(li.level)}` : 'Niveau maximum';
    $('pfCoins').textContent = fmt(save.coins);
    $('runBest').textContent = save.best ? `Record ${fmt(save.best)} pts` : 'Course infinie · boss tous les 10 000 pts';
    $('battleBest').textContent = save.bestWave ? `Meilleure vague : ${save.bestWave}` : 'Vagues d’ennemis · boss toutes les 5 vagues';
    const got = D.ACHIEVEMENTS.filter(a => save.ach[a.id]).length;
    $('achCount').textContent = `${got}/${D.ACHIEVEMENTS.length}`;
    const rank = D.rankFor(save.completed); $('mRank').textContent = rank; $('mMult').textContent = 'x' + rank;
    $('rankPips').querySelectorAll('i').forEach((p, i) => p.classList.toggle('on', i < save.completed % 3));
    tabs($('sideTabs'), [['missions', 'MISSIONS'], ['daily', 'JOUR'], ['weekly', 'SEMAINE']], sideTab, t => { sideTab = t; RENDER.hub(); });
    const body = $('sideBody'); body.textContent = '';
    if (sideTab === 'missions') renderMissions(body, save.missions.map(m => Object.assign({}, m, { cur: m.done ? m.goal : D.byId(D.MISSIONS, m.id).scope === 'run' ? 0 : m.progress })), m => D.byId(D.MISSIONS, m.id).text(m.goal));
    else { const set = sideTab === 'daily' ? save.daily : save.weekly; renderMissions(body, set.tasks.map(t => Object.assign({}, t, { cur: Math.min(t.goal, t.progress) })), D.taskText); }
    const st = P.streakState(), sb = $('streakBtn');
    sb.classList.toggle('ready', st.claimable);
    sb.textContent = st.claimable ? `🔥 Série : jour ${st.count} — récupérer +${D.streakReward(st.count).coins} ◆` : `🔥 Série de ${st.count} jour${st.count > 1 ? 's' : ''} · reviens demain`;
    sb.disabled = !st.claimable;
    coinsNow();
  };
  const title = L => (L >= 40 ? 'Légende' : L >= 25 ? 'Maître des failles' : L >= 15 ? 'Vétéran' : L >= 8 ? 'Coursier' : 'Recrue');
  function renderMissions(host, list, text) {
    host.textContent = '';
    for (const m of list) {
      const row = el('div', 'mission' + (m.done ? ' done' : ''));
      row.innerHTML = '<i class="check"></i><div class="m-body"><div class="m-text"></div><div class="bar"><i></i></div></div><div class="m-side"><b></b><small></small></div>';
      row.querySelector('.m-text').textContent = text(m);
      row.querySelector('.bar i').style.width = Math.min(100, (m.cur / m.goal) * 100) + '%';
      row.querySelector('.m-side b').textContent = '+' + m.reward;
      row.querySelector('.m-side small').textContent = `${fmt(Math.min(m.cur, m.goal))}/${fmt(m.goal)}`;
      host.append(row);
    }
  }

  // ───────────── Préparation (personnage, compétences, arme, reliques) ─────────────
  RENDER.prep = function () {
    $('prepTitle').textContent = prepMode === 'run' ? 'RUN MODE' : 'BATTLE MODE';
    const chars = $('prepChars'); chars.textContent = '';
    for (const ch of D.CHARACTERS.filter(c => save.chars.includes(c.id))) {
      chars.append(card({ art: charCanvas(ch.id, save.skinByChar[ch.id], 80, { st: 'idle' }), name: ch.name, rarity: ch.rarity, perk: ch.perk.text + (prepMode === 'battle' ? ` · ${ch.attack === 'melee' ? 'Mêlée' : 'Distance'} · ${D.mods(save, ch.id).hp} PV` : ''), cls: save.char === ch.id ? 'eq' : '',
        onClick: () => { save.char = ch.id; P.persist(); E.sfx('click'); RENDER.prep(); } }));
    }
    const slots = D.skillSlots(save), sk = $('prepSkills'); sk.textContent = '';
    $('prepSlots').textContent = `${save.loadout.filter(Boolean).length}/${slots} emplacements${slots < 3 ? ' · 3e au niveau 5' : ''}`;
    for (const s of D.SKILLS.filter(s => save.skills.includes(s.id))) {
      const idx = save.loadout.indexOf(s.id), b = el('button', 'chip' + (idx >= 0 ? ' on' : ''));
      b.append(E.iconEl(s.icon, 26, '#3ef2ff'), el('span', null, s.name));
      if (idx >= 0) b.append(el('span', 'key', s.passive ? 'AUTO' : `[${idx + 1}]`));
      b.onclick = () => {
        const lo = save.loadout, i = lo.indexOf(s.id);
        if (i >= 0) lo[i] = null; else { const free = lo.slice(0, slots).indexOf(null); if (free < 0) { refuse(b); return; } lo[free] = s.id; }
        P.persist(); E.sfx('click'); RENDER.prep();
      };
      sk.append(b);
    }
    const ch = D.byId(D.CHARACTERS, save.char), wb = $('prepWeapons'); wb.textContent = '';
    $('prepWeaponBox').hidden = prepMode !== 'battle';
    $('battleWays').hidden = prepMode !== 'battle';
    $('prepWeaponNote').textContent = ch.attack === 'melee' ? `${ch.name} combat en mêlée : l’arme n’est pas utilisée` : '';
    for (const w of D.WEAPONS.filter(w => save.weapons.includes(w.id))) {
      const b = el('button', 'chip' + (save.weapon === w.id ? ' on' : ''));
      b.append(E.iconEl(`gun:${w.icon[0]},${w.icon[1]}`, 28), el('span', null, w.name), el('small', null, `${w.dmg} dég.`));
      b.onclick = () => { save.weapon = w.id; P.persist(); E.sfx('click'); RENDER.prep(); };
      wb.append(b);
    }
    const rs = D.relicSlots(save), rb = $('prepRelics'); rb.textContent = '';
    $('prepRelicSlots').textContent = save.items.length ? `${save.relics.filter(Boolean).length}/${rs} équipée(s)${rs < 2 ? ' · 2e au niveau 12' : ''}` : 'aucun objet pour l’instant : bats des boss ou ouvre des capsules';
    for (const it of D.ITEMS.filter(i => save.items.includes(i.id))) {
      const on = save.relics.indexOf(it.id), b = el('button', 'chip r-' + it.rarity + (on >= 0 ? ' on' : ''));
      b.append(E.iconEl('rpg:' + it.idx, 26), el('span', null, it.name), el('small', null, it.effText));
      b.onclick = () => {
        const r = save.relics, i = r.indexOf(it.id);
        if (i >= 0) r[i] = null; else { const free = r.slice(0, rs).indexOf(null); if (free < 0) { refuse(b); return; } r[free] = it.id; }
        P.persist(); E.sfx('click'); RENDER.prep();
      };
      rb.append(b);
    }
    $('prepHelp').innerHTML = helpHtml(prepMode);
    coinsNow();
  };
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kbd = (m, a) => save.keys[m][a].map(c => `<kbd>${esc(C.label(c))}</kbd>`).join(' ');
  const skillKbd = m => ['skill1', 'skill2', 'skill3'].map(a => `<kbd>${esc(C.label(save.keys[m][a][0]))}</kbd>`).join('');
  function helpHtml(m) {
    if (isTouch) {
      if (m === 'run') return { buttons: 'Bouton <b>SAUT</b> (maintiens = plus haut, 2ᵉ appui en l’air = double saut) · bouton <b>GLISSE</b> (maintiens pour rester au sol ; en l’air = plongeon) · compétences : boutons ronds',
        tap: '<b>Toucher</b> l’écran : sauter (un 2ᵉ toucher en l’air = double saut) · <b>maintenir</b> : glisser · <b>relâcher</b> : se relever · boutons ronds : compétences',
        zones: 'Touche <b>à droite</b> : sauter (maintiens = plus haut, 2ᵉ touche en l’air = double saut) · <b>à gauche</b> : glisser · boutons ronds : compétences' }[save.runControls];
      return '<b>Joystick</b> : se déplacer (la vitesse suit l’inclinaison ; vers le bas = descendre ; en jetpack, vol dans toutes les directions) · SAUT (double saut) · ⚔ : attaquer (maintiens) · ESQUIVE · compétences';
    }
    return m === 'run' ? `${kbd(m, 'jump')} sauter (maintiens = plus haut, encore = double saut) · ${kbd(m, 'slide')} glisser / plonger · ${skillKbd(m)} compétences · ${kbd(m, 'pause')} <kbd>Échap</kbd> pause`
      : `${kbd(m, 'left')} ${kbd(m, 'right')} se déplacer · ${kbd(m, 'jump')} sauter · ${kbd(m, 'attack')} ou clic : attaquer · ${kbd(m, 'dash')} esquive · ${kbd(m, 'down')} descendre · ${skillKbd(m)} compétences · ${kbd(m, 'pause')} <kbd>Échap</kbd> pause`;
  }

  // ───────────── Boutique ─────────────
  let shopTab = 'char';
  const UPICON = { shield: 'rpg:25', jetpack: 'v:jetpack', laser: 'gun:2,3', magnet: 'v:magnet', drone: 'v:drone', coins: 'rpg:40', cd: 'rpg:70' };
  function tryBuy(kind, id, c, onOk) {
    const r = D.buy(save, kind, id);
    if (!r.ok) { refuse(c); UI.toast(r.reason, '✕'); return; }
    P.persist(); E.sfx('power');
    if (kind === 'capsule') { P.queue([r.got], 'Capsule de faille'); openReveals(); }
    else if (kind === 'char' || kind === 'skin' || kind === 'weapon' || kind === 'skill' || kind === 'theme') { P.queue([{ kind, id }], 'Achat'); openReveals(); }
    P.checkAch(); P.persist();
    if (onOk) onOk();
    RENDER.shop();
  }
  RENDER.shop = function () {
    tabs($('shopTabs'), [['char', 'PERSONNAGES'], ['skill', 'COMPÉTENCES'], ['upgrade', 'AMÉLIORATIONS'], ['weapon', 'ARMES'], ['skin', 'SKINS'], ['theme', 'THÈMES'], ['capsule', 'CAPSULES']], shopTab, t => { shopTab = t; RENDER.shop(); });
    const grid = $('shopGrid'); grid.textContent = '';
    const status = (kind, def) => { const owned = D.owns(save, kind, def.id), price = D.priceOf(save, kind, def.id), met = D.reqMet(save, def.req); return { owned, price, met, text: owned ? 'POSSÉDÉ' : !met ? D.reqText(def.req) : price == null ? D.reqText(def.req) || 'Récompense' : null }; };
    if (shopTab === 'char') for (const ch of D.CHARACTERS) {
      if (ch.secret && !save.chars.includes(ch.id)) continue;
      const s = status('char', ch);
      grid.append(card({ art: charCanvas(ch.id, null, 96, { st: 'idle' }), name: ch.name, rarity: ch.rarity, desc: ch.desc, perk: ch.perk.text, cls: s.owned ? 'eq' : !s.met ? 'locked' : s.price != null && save.coins >= s.price ? 'buyable' : '',
        status: s.text || 'ACHETER', price: s.text ? null : s.price, onClick: c => (s.owned || s.text ? refuse(c) : tryBuy('char', ch.id, c)) }));
    }
    if (shopTab === 'skill') for (const sk of D.SKILLS) {
      const s = status('skill', sk), st = D.skillStats(save, sk.id, D.mods(save, save.char));
      const info = sk.passive ? '1 utilisation par partie (automatique)' : `${st.dur ? st.dur.toFixed(1) + ' s · ' : ''}recharge ${Math.round(st.cd)} s`;
      grid.append(card({ art: E.iconEl(sk.icon, 56, '#3ef2ff'), name: sk.name, desc: sk.desc, perk: info, cls: s.owned ? 'eq' : s.price != null && save.coins >= s.price ? 'buyable' : '',
        status: s.text || 'ACHETER', price: s.text ? null : s.price, onClick: c => (s.owned || s.text ? refuse(c) : tryBuy('skill', sk.id, c)) }));
    }
    if (shopTab === 'upgrade') for (const u of D.UPGRADES) {
      const lv = save.upgrades[u.id] || 0, price = D.upgradePrice(u.id, lv);
      grid.append(card({ art: E.iconEl(UPICON[u.id], 52, '#3ef2ff'), name: u.name, desc: u.desc, levels: [lv, u.max], cls: price != null && save.coins >= price ? 'buyable' : lv >= u.max ? 'eq' : '',
        status: price == null ? 'NIVEAU MAX' : 'AMÉLIORER', price, onClick: c => (price == null ? refuse(c) : tryBuy('upgrade', u.id, c)) }));
    }
    if (shopTab === 'weapon') for (const w of D.WEAPONS) {
      const s = status('weapon', w);
      grid.append(card({ art: E.iconEl(`gun:${w.icon[0]},${w.icon[1]}`, 64), name: w.name, rarity: w.rarity, desc: w.desc, perk: `${w.pellets ? w.pellets + '×' : ''}${w.dmg} dégâts · ${(1 / w.rate).toFixed(1)} tirs/s${w.pierce ? ' · perforant' : ''}${w.splash ? ' · zone' : ''}`,
        cls: s.owned ? 'eq' : s.price != null && save.coins >= s.price ? 'buyable' : '', status: s.text || 'ACHETER', price: s.text ? null : s.price, onClick: c => (s.owned || s.text ? refuse(c) : tryBuy('weapon', w.id, c)) }));
    }
    if (shopTab === 'skin') for (const sk of D.SKINS) {
      if (sk.boss || (sk.secret && !save.skins.includes(sk.id))) continue;
      const s = status('skin', sk);
      grid.append(card({ art: charCanvas(save.char, sk.id, 96, { st: 'idle' }), name: sk.name, rarity: sk.rarity, desc: 'Style : ' + sk.style + ' · cosmétique', cls: s.owned ? 'eq' : !s.met ? 'locked' : s.price != null && save.coins >= s.price ? 'buyable' : '',
        status: s.text || 'ACHETER', price: s.text ? null : s.price, onClick: c => (s.owned || s.text ? refuse(c) : tryBuy('skin', sk.id, c)) }));
    }
    if (shopTab === 'theme') for (const t of D.THEMES) grid.append(themeCard(t, true));
    if (shopTab === 'capsule') {
      const odds = D.LOOT_TABLES.capsule, txt = D.RARITIES.map(r => `${RNAME(r)} ${odds[r]} %`).join(' · ');
      grid.append(card({ art: E.iconEl('rpg:71', 64), name: 'Capsule de faille', rarity: 'epic', desc: 'Un objet aléatoire jamais en double. Si toute la rareté tirée est déjà possédée : éclats en compensation.', perk: txt,
        cls: save.coins >= 450 ? 'buyable' : '', status: 'OUVRIR', price: 450, onClick: c => tryBuy('capsule', null, c) }));
      const owned = save.items.length;
      grid.append(card({ art: E.iconEl('rpg:38', 56), name: 'Ta collection', desc: `${owned}/${D.ITEMS.length} objets. Les boss garantissent un objet Rare ou mieux.`, status: 'VOIR', onClick: () => { colTab = 'item'; go('collection'); } }));
    }
    coinsNow();
  };
  function themeCard(t, shop) {
    const owned = save.themes.includes(t.id), price = t.price, met = D.reqMet(save, t.req);
    const sw = el('div'); sw.style.cssText = `width:96px;height:96px;border-radius:16px;background:linear-gradient(180deg,${t.zones[0][1]},${t.zones[0][2]} 55%,${t.zones[0][3]} 70%,${t.zones[0][4]} 72%);box-shadow:inset 0 -26px 0 -24px ${t.zones[0][5]}, 0 0 20px -6px ${t.accent}`;
    const cls = save.theme === t.id ? 'eq' : owned ? '' : !met ? 'locked' : price != null && save.coins >= price ? 'buyable' : '';
    return card({ art: sw, name: t.name, desc: t.desc, cls, status: save.theme === t.id ? 'ÉQUIPÉ' : owned ? 'CHOISIR' : price == null || !met ? D.reqText(t.req) : 'ACHETER', price: !owned && met && price != null ? price : null,
      onClick: c => {
        if (owned) { save.theme = t.id; E.setTheme(t.id); P.persist(); E.sfx('click'); shop ? RENDER.shop() : RENDER.custom(); return; }
        if (price == null || !met) { refuse(c); return; }
        tryBuy('theme', t.id, c, () => { save.theme = t.id; E.setTheme(t.id); P.persist(); }); if (!shop) RENDER.custom();
      } });
  }

  // ───────────── Collection ─────────────
  let colTab = 'char';
  RENDER.collection = function () {
    tabs($('colTabs'), [['char', 'PERSONNAGES'], ['skin', 'SKINS'], ['item', 'OBJETS'], ['boss', 'BESTIAIRE']], colTab, t => { colTab = t; RENDER.collection(); });
    const grid = $('colGrid'); grid.textContent = '';
    let n = 0, tot = 0;
    if (colTab === 'char') for (const ch of D.CHARACTERS) {
      const own = save.chars.includes(ch.id); tot++; if (own) n++;
      const hidden = ch.secret && !own;
      grid.append(card({ art: charCanvas(hidden ? 'luma' : ch.id, null, 96, { st: own ? 'victory' : 'idle', t: 0.2 }), name: hidden ? '???' : ch.name, rarity: ch.rarity, desc: hidden ? 'Un personnage secret…' : ch.desc, perk: hidden ? '' : ch.perk.text,
        cls: own ? (save.char === ch.id ? 'eq' : '') : 'locked', status: own ? (save.char === ch.id ? 'SÉLECTIONNÉ' : 'CHOISIR') : hidden ? 'SECRET' : ch.price != null ? `Boutique · ${fmt(ch.price)} ◆${ch.req ? ' · ' + D.reqText(ch.req) : ''}` : D.reqText(ch.req),
        onClick: c => { if (!own) return refuse(c); save.char = ch.id; P.persist(); E.sfx('click'); RENDER.collection(); } }));
    }
    if (colTab === 'skin') for (const sk of D.SKINS) {
      const own = save.skins.includes(sk.id); tot++; if (own) n++;
      const hidden = sk.secret && !own;
      const how = sk.boss ? `Exclusif : ${D.byId(D.BOSSES, sk.boss).name} (50 %)` : sk.price != null ? `Boutique · ${fmt(sk.price)} ◆` : D.reqText(sk.req);
      grid.append(card({ art: charCanvas(save.char, hidden ? 'default' : sk.id, 96), name: hidden ? '???' : sk.name, rarity: sk.rarity, desc: hidden ? 'Skin secret' : `Style : ${sk.style}`, cls: own ? (save.skinByChar[save.char] === sk.id || (!save.skinByChar[save.char] && sk.id === 'default') ? 'eq' : '') : 'locked',
        status: own ? 'ÉQUIPER' : hidden ? 'SECRET' : how, onClick: c => { if (!own) return refuse(c); save.skinByChar[save.char] = sk.id; P.persist(); E.sfx('click'); RENDER.collection(); } }));
    }
    if (colTab === 'item') for (const it of D.ITEMS) {
      const own = save.items.includes(it.id); tot++; if (own) n++;
      grid.append(card({ art: E.iconEl('rpg:' + it.idx, 56), name: own ? it.name : '???', rarity: it.rarity, desc: own ? 'Relique : ' + it.effText : 'Butin de boss, capsules, élites, succès', cls: own ? (save.relics.includes(it.id) ? 'eq' : '') : 'locked',
        status: own ? (save.relics.includes(it.id) ? 'ÉQUIPÉE' : 'Équiper dans Préparation') : 'NON TROUVÉ', onClick: c => (own ? (prepMode = 'run', go('prep')) : refuse(c)) }));
    }
    if (colTab === 'boss') for (const b of D.BOSSES) {
      const st = save.bosses[b.id] || { kills: 0, seen: 0 }; tot++; if (st.kills) n++;
      const art = el('div'); art.style.cssText = `width:84px;height:84px;border-radius:50%;background:radial-gradient(circle,${b.col}88,transparent 70%);display:grid;place-items:center;font:italic 900 30px var(--display);color:#fff;text-shadow:0 0 18px ${b.col}`;
      art.textContent = st.seen ? b.name.split(' ').map(w => w[0]).join('').slice(0, 2) : '?';
      grid.append(card({ art, name: st.seen ? b.name : '???', rarity: b.secret ? 'mythic' : b.rare ? 'legendary' : 'epic', desc: st.seen ? b.lore : b.secret ? 'On dit qu’une salle cachée existe…' : 'Pas encore rencontré.',
        perk: st.seen ? `Rencontré ${st.seen}× · vaincu ${st.kills}×` : '', cls: st.kills ? '' : 'locked', status: st.kills ? 'VAINCU' : st.seen ? 'À VAINCRE' : 'INCONNU' }));
    }
    $('colCount').textContent = `${n}/${tot}`;
  };

  // ───────────── Personnalisation ─────────────
  RENDER.custom = function () {
    const tg = $('themeGrid'); tg.textContent = '';
    for (const t of D.THEMES) tg.append(themeCard(t, false));
    $('skinFor').textContent = D.byId(D.CHARACTERS, save.char).name;
    const sg = $('skinGrid'); sg.textContent = '';
    for (const sk of D.SKINS.filter(s => save.skins.includes(s.id))) {
      const eq = (save.skinByChar[save.char] || 'default') === sk.id;
      sg.append(card({ art: charCanvas(save.char, sk.id, 96, { st: 'idle' }), name: sk.name, rarity: sk.rarity, desc: 'Style : ' + sk.style, cls: eq ? 'eq' : '', status: eq ? 'ÉQUIPÉ' : 'ÉQUIPER',
        onClick: () => { save.skinByChar[save.char] = sk.id; P.persist(); E.sfx('click'); RENDER.custom(); } }));
    }
    coinsNow();
  };

  // ───────────── Succès ─────────────
  const rewardText = r => [r.coins ? `+${fmt(r.coins)} ◆` : '', r.loot ? `objet ${RNAME(r.loot === 'boss' ? 'rare' : r.loot)}+` : '', r.skin ? 'skin' : '', r.char ? 'personnage' : '', r.theme ? 'thème' : '', r.xp ? `+${r.xp} XP` : ''].filter(Boolean).join(' · ');
  RENDER.achievements = function () {
    const host = $('achList'); host.textContent = '';
    let n = 0;
    for (const a of D.ACHIEVEMENTS) {
      const done = !!save.ach[a.id]; if (done) n++;
      const row = el('div', 'ach' + (done ? ' done' : '')), m = el('div', 'medal');
      m.append(E.wingEl(a.secret ? 3 : done ? 1 : 0, 54));
      const body = el('div'); body.append(el('b', null, a.secret && !done ? '???' : a.name), el('small', null, a.secret && !done ? 'Succès secret : continue d’explorer' : a.desc));
      row.append(m, body, el('div', 'rw', done ? '✓ OBTENU' : a.secret ? '???' : rewardText(a.reward)));
      host.append(row);
    }
    $('achTotal').textContent = `${n}/${D.ACHIEVEMENTS.length}`;
  };

  // ───────────── Classement ─────────────
  let boardTab = 'run', boardView = null;
  function showBoardView() {
    if (!boardView) boardView = LR.CONFIG.supabaseUrl ? 'online' : 'local';
    tabs($('boardViews'), [['online', 'ENTRE AMIS'], ['local', 'CET APPAREIL']], boardView, v => { boardView = v; showBoardView(); });
    $('onlineBox').hidden = boardView !== 'online'; $('localBox').hidden = boardView !== 'local';
    $('boardPill').textContent = boardView === 'online' ? 'En ligne · groupe privé' : 'Local · cet appareil';
    if (boardView === 'online') LR.Online.render(); else LR.Online.stop();
  }
  RENDER.board = function () {
    showBoardView();
    renderLocalBoard();
  };
  function renderLocalBoard() {
    const s = save.stats, h = Math.floor(s.playTime / 3600), m = Math.floor((s.playTime % 3600) / 60);
    const stats = [['Meilleur score Run', fmt(save.best)], ['Meilleure distance', fmt(save.bestDist) + ' m'], ['Meilleure vague', save.bestWave], ['Boss vaincus', s.bosses], ['Éclats gagnés', fmt(s.coinsEarned)],
      ['Personnages', `${save.chars.length}/${D.CHARACTERS.length}`], ['Parties jouées', s.games], ['Temps de jeu', `${h} h ${String(m).padStart(2, '0')}`], ['Ennemis éliminés', fmt(s.kills)], ['Objets', `${save.items.length}/${D.ITEMS.length}`]];
    const sg = $('statGrid'); sg.textContent = '';
    for (const [k, v] of stats) { const d = el('div'); d.append(el('b', null, String(v)), el('span', null, k)); sg.append(d); }
    tabs($('boardTabs'), [['run', 'RUN'], ['battle', 'BATTLE']], boardTab, t => { boardTab = t; renderLocalBoard(); });
    const tb = $('boardTable'), list = save.board[boardTab];
    tb.innerHTML = boardTab === 'run' ? '<tr><th>#</th><th>JOUEUR</th><th>SCORE</th><th>DISTANCE</th><th class="opt">PERSO</th><th class="opt">DATE</th></tr>' : '<tr><th>#</th><th>JOUEUR</th><th>VAGUE</th><th>ENNEMIS</th><th class="opt">PERSO</th><th class="opt">DATE</th></tr>';
    list.forEach((e, i) => {
      const tr = el('tr'), ch = D.byId(D.CHARACTERS, e.char);
      const cells = boardTab === 'run' ? [i + 1, fmt(e.score || 0), fmt(e.dist || 0) + ' m'] : [i + 1, e.wave || 0, e.kills || 0];
      cells.concat([ch ? ch.name : '?', e.date || '']).forEach((c, k) => tr.append(el('td', k >= cells.length ? 'opt' : null, String(c))));
      const who = el('td'); who.append(Pr.identity(28)); tr.insertBefore(who, tr.children[1]);
      tb.append(tr);
    });
    if (!list.length) { const tr = el('tr'), td = el('td', null, 'Aucune partie enregistrée pour l’instant.'); td.colSpan = 6; tr.append(td); tb.append(tr); }
  };

  // ───────────── Réglages ─────────────
  RENDER.settings = function () {
    renderInstall();
    const id = $('setIdentity'); id.textContent = ''; id.append(Pr.identity(40));
    $('sfxVol').value = Math.round(save.opts.sfxVol * 100); $('sfxVolVal').textContent = $('sfxVol').value + ' %';
    $('musicVol').value = Math.round(save.opts.musicVol * 100); $('musicVolVal').textContent = $('musicVol').value + ' %';
    $('qualitySel').value = save.opts.quality; $('shakeChk').checked = save.opts.shake; $('runTouchSel').value = save.runControls;
    $('versionInfo').textContent = `Luma Rush · version ${D.VERSION}`;
    $('sfxBtn').classList.toggle('off', !save.sfx); $('musicBtn').classList.toggle('off', !save.music);
    $('sfxBtn').textContent = 'EFFETS SONORES : ' + (save.sfx ? 'OUI' : 'NON'); $('musicBtn').textContent = 'MUSIQUE : ' + (save.music ? 'OUI' : 'NON');
    $('helpAll').innerHTML = '<b>RUN</b> — ' + helpHtml('run') + '<br><b>BATTLE</b> — ' + helpHtml('battle');
    const cr = $('credits'); cr.textContent = '';
    for (const a of D.ASSET_CREDITS) { const d = el('div'); d.append(el('b', null, a.name), document.createTextNode(` — ${a.author}. ${a.license}${a.url ? ' ' + a.url : ''}`)); cr.append(d); }
    cr.append(el('div', null, 'Code, décors, personnages vectoriels (dont Kael), boss, interface, musique et effets sonores : créations originales de Luma Rush.'));
  };

  // ───────────── Révélation des récompenses ─────────────
  function revealOf(r) {
    if (r.kind === 'item') { const it = D.byId(D.ITEMS, r.id); return { art: E.iconEl('rpg:' + it.idx, 120), name: it.name, rarity: it.rarity, desc: 'Relique · ' + it.effText }; }
    if (r.kind === 'skin') { const s = D.byId(D.SKINS, r.id); return { art: charCanvas(save.char, s.id, 140, { st: 'victory', t: 0.2 }), name: 'Skin : ' + s.name, rarity: s.rarity, desc: 'Style ' + s.style + (s.boss ? ' · exclusif de boss' : '') }; }
    if (r.kind === 'char') { const c = D.byId(D.CHARACTERS, r.id); return { art: charCanvas(c.id, null, 140, { st: 'victory', t: 0.2 }), name: c.name, rarity: c.rarity, desc: 'Nouveau personnage ! ' + c.perk.text }; }
    if (r.kind === 'theme') { const t = D.byId(D.THEMES, r.id); return { art: themeCard(t, true).querySelector('.art').firstChild, name: 'Thème : ' + t.name, rarity: 'epic', desc: t.desc }; }
    if (r.kind === 'skill') { const s = D.byId(D.SKILLS, r.id); return { art: E.iconEl(s.icon, 110, '#3ef2ff'), name: 'Compétence : ' + s.name, rarity: 'rare', desc: s.desc }; }
    if (r.kind === 'weapon') { const w = D.byId(D.WEAPONS, r.id); return { art: E.iconEl(`gun:${w.icon[0]},${w.icon[1]}`, 120), name: w.name, rarity: w.rarity, desc: w.desc }; }
    if (r.kind === 'levelup') return { art: E.wingEl(Math.floor((r.level - 1) / 10), 130), name: 'NIVEAU ' + r.level, rarity: 'legendary', desc: (D.levelReward(r.level).note || 'Nouvelle récompense de palier !') };
    if (r.kind === 'coins') return { art: E.iconEl('rpg:40', 110), name: `+${fmt(r.amount)} éclats`, rarity: r.rarity || 'common', desc: r.dupe ? 'Déjà possédé : compensation en éclats.' : 'Éclats ajoutés au portefeuille.' };
    return null;
  }
  function openReveals(then) {
    if (then) afterReveal = then;
    while (P.reveals.length) {
      const r = P.reveals.shift(), v = revealOf(r);
      if (!v) continue;
      const c = $('revealCard');
      c.className = 'reveal r-' + v.rarity;
      $('rvSource').textContent = r.source || '';
      const art = $('rvArt'); art.textContent = ''; art.append(v.art);
      const rl = $('rvRarity'); rl.textContent = ''; rl.className = 'rlabel r-' + v.rarity; rl.append(gem(v.rarity, 20), document.createTextNode(RNAME(v.rarity)));
      $('rvName').textContent = v.name; $('rvDesc').textContent = v.desc;
      overlay('reveal', false); void c.offsetWidth; overlay('reveal', true);
      E.sfx(D.RARITY[v.rarity].order >= 3 ? 'rare' : 'power');
      if (D.RARITY[v.rarity].order >= 3) E.emit(E.VW / 2, E.VH / 2, 60, { c: D.RARITY[v.rarity].color, sp: 500, life: 1.2, size: 12 });
      return true;
    }
    overlay('reveal', false);
    const f = afterReveal; afterReveal = null; if (f) f();
    if (RENDER[screen] && (state === 'menu')) RENDER[screen]();
    return false;
  }
  // Appelé par les modes (ex. après un boss) : met le jeu en pause le temps d'afficher les récompenses.
  UI.flushReveals = function () {
    if (!P.reveals.length || state !== 'play') return;
    state = 'modal'; releaseInputs();
    openReveals(() => { state = 'resume'; countT = 1.5; lastCount = 0; });
  };

  // ───────────── Confirmation ─────────────
  function confirmBox(titleTxt, text, word, onYes) {
    $('cfTitle').textContent = titleTxt; $('cfText').textContent = text;
    const inp = $('cfInput'); inp.hidden = !word; inp.value = ''; inp.placeholder = word || '';
    overlay('confirm', true); if (word) setTimeout(() => inp.focus(), 50);
    $('cfYes').onclick = () => { if (word && inp.value.trim().toUpperCase() !== word) { refuse($('cfYes')); return; } overlay('confirm', false); onYes(); };
    $('cfNo').onclick = () => overlay('confirm', false);
  }

  // ───────────── Parties ─────────────
  function buildSkillBar() {
    const bar = $('skillBar'); bar.textContent = '';
    G.slots.forEach((s, i) => {
      if (!s) return;
      const b = el('div', 'sk' + (s.passive ? ' passive' : ''));
      b.append(E.iconEl(s.def.icon, 28, '#3ef2ff'));
      if (!s.passive) b.append(el('em', null, C.label(save.keys[mode]['skill' + (i + 1)][0])));
      b.append(el('small', null, s.passive ? 'AUTO' : s.def.name));
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); useSkill(i); });
      s.btn = b; bar.append(b);
    });
  }
  const useSkill = i => { if (state !== 'play') return; (mode === 'run' ? Run : Bt).useSkill(i); };
  function startGame(m, opts) {
    if (state === 'play' || state === 'dying' || state === 'resume') return;
    E.unlockAudio();
    mode = m; lastOpts = opts || {};
    G.begin(m); P.startGame(m); LR.Online.begin(m);
    C.unmount(); E.touchMode = touchModeFor(m); E.resize();
    Run.tapControls = isTouch && save.runControls === 'tap';
    if (m === 'run') Run.start(false); else Bt.start(lastOpts);
    E.clearFx(); clearBanner(); victory = false;
    state = 'play'; hintT = 3.5; show(null); $('hud').classList.add('on');
    $('hHearts').hidden = m !== 'battle'; $('hPows').hidden = m !== 'run';
    setupControls();
    E.music.hot = true; E.music.boss = false;
    for (const k in hudCache) delete hudCache[k];
  }
  // Barre de compétences au clavier / en RUN ; joystick et boutons personnalisables en BATTLE tactile.
  // Mode dont les boutons sont à l'écran (null : clavier, souris ou RUN sans boutons).
  const touchModeFor = m => (isTouch && (m === 'battle' || save.runControls === 'buttons') ? m : null);
  function setupControls() {
    if (touchModeFor(mode)) { $('skillBar').classList.remove('on'); $('skillBar').textContent = ''; C.mount(false, mode); }
    else { C.unmount(); buildSkillBar(); $('skillBar').classList.add('on'); }
  }
  function toMenu() {
    C.unmount(); if (E.touchMode) { E.touchMode = null; E.resize(); }
    mode = null; state = 'menu'; Run.start(true); E.override = null; E.setZone(0, true); E.music.hot = false; E.music.boss = false;
    clearBanner(); UI.bossBar(null); LR.B.clear();
    $('hud').classList.remove('on'); $('skillBar').classList.remove('on'); $('touchRun').classList.remove('on');
    RENDER.hub(); show('hub');
  }
  function pause() {
    if (state === 'resume') { state = 'pause'; $('count').className = ''; show('pause'); return; }
    if (state !== 'play') return;
    state = 'pause'; releaseInputs(); show('pause'); E.sfx('click');
  }
  function resume() { if (state !== 'pause') return; show(null); state = 'resume'; countT = 1.5; lastCount = 0; }
  UI.onDeath = function (won) { if (state !== 'play') return; state = 'dying'; deathT = 0; timeScale = mode === 'run' ? 0.25 : 0.4; victory = !!won; releaseInputs(); };
  function finish() {
    state = 'over';
    const sum = (mode === 'run' ? Run : Bt).summary(), out = P.endGame(sum, G.mods);
    LR.Online.finish(sum);
    $('hud').classList.remove('on'); $('skillBar').classList.remove('on'); $('touchRun').classList.remove('on'); C.release(); C.visible(false); UI.bossBar(null);
    E.music.hot = false; E.music.boss = false;
    $('resTitle').textContent = victory ? 'VICTOIRE' : 'GAME OVER';
    $('resRecord').hidden = !out.record;
    $('resUnit').textContent = mode === 'run' ? 'POINTS' : 'POINTS · VAGUE ' + sum.wave;
    const stats = mode === 'run' ? [[fmt(sum.dist) + ' m', 'Distance'], ['+' + fmt(out.coins), 'Éclats'], [sum.near, 'Frôlés']] : [[sum.wave, 'Vague'], [sum.kills, 'Ennemis'], ['+' + fmt(out.coins), 'Éclats']];
    const sh = $('resStats'); sh.textContent = '';
    for (const [v, k] of stats) { const d = el('div'); d.append(el('b', null, String(v)), el('span', null, k)); sh.append(d); }
    $('resXp').textContent = `+${fmt(out.xpGot)} XP${out.bonus ? ` · +${out.bonus} éclats bonus` : ''}${out.levelsAfter > out.levelsBefore ? ` · NIVEAU ${out.levelsAfter} !` : ''}${sum.bosses ? ` · ${sum.bosses} boss vaincu${sum.bosses > 1 ? 's' : ''}` : ''}`;
    renderMissions($('resMissions'), out.missions, m => D.byId(D.MISSIONS, m.id).text(m.goal));
    const rank = D.rankFor(save.completed);
    $('resRankUp').hidden = !out.rankUp; $('resRankUp').textContent = `RANG ${rank} — multiplicateur x${rank} à la prochaine partie !`;
    $('resHint').hidden = isTouch;
    $('resGroupBtn').hidden = mode !== 'battle' || !LR.Online.hasAccount();
    const rid = $('resIdentity'); rid.textContent = ''; rid.append(Pr.identity(36));
    $('resScore').textContent = '0'; overAnim = { to: sum.score, t: 0 };
    show('results'); overReady = false; setTimeout(() => { overReady = true; }, 450);
    if (out.record) setTimeout(() => E.sfx('mission'), 700);
    if (P.reveals.length) setTimeout(() => { if (state === 'over') openReveals(); }, 900);
  }
  const again = () => { if (overReady && state === 'over' && !$('reveal').classList.contains('on')) startGame(mode, lastOpts); };

  // ───────────── HUD ─────────────
  const hudCache = {};
  const setT = (id, v) => { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } };
  const POWC = { shield: ['#4dffb8', 'rpg:25'], magnet: ['#b18cff', 'v:magnet'], hyper: ['#ff9f1c', 'v:hyper'], x2: ['#3ef2ff', null], star: ['#ffe14d', null] };
  const powEls = {};
  for (const k in POWC) { const d = el('div', 'pw'), s = el('span'); d.style.setProperty('--c', POWC[k][0]); if (POWC[k][1]) s.append(E.iconEl(POWC[k][1], 18, POWC[k][0])); else s.textContent = k === 'x2' ? 'x2' : 'x3'; d.append(s); d.hidden = true; $('hPows').append(d); powEls[k] = d; }
  function updHUD() {
    if (mode === 'run') {
      const h = Run.hud();
      setT('hScore', fmt(h.score)); setT('hMult', 'x' + h.mult); setT('hCoins', fmt(h.coins));
      $('hMult').classList.toggle('hot', h.mult > h.base);
      const beat = save.best > 0 && h.score > save.best; setT('hSub', (beat ? 'RECORD BATTU · ' : 'RECORD ') + fmt(Math.max(save.best, h.score)) + (h.boss ? '' : ` · BOSS À ${fmt(Run.get().nextBoss)}`));
      $('hSub').classList.toggle('beat', beat);
      for (const k in powEls) {
        const v = k === 'shield' ? h.power.shield : h.power[k] > 0;
        if (powEls[k].hidden === !!v) powEls[k].hidden = !v;
        if (v) powEls[k].style.setProperty('--p', k === 'shield' ? 1 : (h.power[k] / Run.POW[k].dur).toFixed(3));
      }
      const th = $('touchRun'); th.classList.toggle('on', isTouch && save.runControls !== 'buttons' && (state === 'play' || state === 'resume')); th.classList.toggle('dim', hintT <= 0);
      const tap = save.runControls === 'tap'; th.classList.toggle('tap', tap);
      setT('thL', tap ? 'TOUCHE : SAUTER · MAINTIENS : GLISSER' : '▼ GLISSER'); setT('thR', tap ? '' : 'SAUTER ▲');
    } else {
      const h = Bt.hud();
      setT('hScore', fmt(h.score)); setT('hMult', 'V' + h.wave); setT('hCoins', fmt(h.coins));
      setT('hSub', h.boss ? `BOSS · VAGUE ${h.wave}` : `VAGUE ${h.wave} · ${h.left} ennemi${h.left > 1 ? 's' : ''}`);
      const key = h.hp + '/' + h.maxHp + (h.shield > 0 ? 's' : '');
      if (hudCache.hearts !== key) {
        hudCache.hearts = key; const host = $('hHearts'); host.textContent = '';
        for (let i = 0; i < h.maxHp; i++) host.append(E.heartEl(i < h.hp, 24));
      }
    }
    for (const s of G.slots) if (s && s.btn) {
      s.btn.style.setProperty('--p', s.passive ? (G.second > 0 ? 0 : 1) : s.cdMax ? (s.cd / s.cdMax).toFixed(3) : 0);
      s.btn.classList.toggle('ready', !s.passive && s.cd <= 0); s.btn.classList.toggle('active', s.active > 0);
    }
    if (E.touchMode) C.visible(state === 'play' || state === 'resume');
    if (bossRef) $('bossFill').style.width = Math.max(0, (bossRef.hp / bossRef.maxHp) * 100) + '%';
  }

  // ───────────── Commandes ─────────────
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let keyBuf = [], wordBuf = '';
  const touches = new Map(), held = new Set(), gestureIds = new Set();
  // RUN tactile : toucher = sauter, maintenir = glisser, relâcher = se relever.
  const gesture = I.makeRunGesture({ tap: () => { if (state === 'play') Run.tapJump(); }, slideStart: () => { if (state === 'play') Run.pressSlide(); }, slideEnd: () => Run.releaseSlide() });
  function releaseInputs() { held.clear(); touches.clear(); gesture.reset(); gestureIds.clear(); C.release(); Run.releaseAll(); Bt.releaseAll(); }
  function press(m, a) {
    if (a.startsWith('skill')) { useSkill(+a.slice(5) - 1); return; }
    if (m === 'run') { if (a === 'jump') Run.pressJump(); else if (a === 'slide') Run.pressSlide(); return; }
    if (a === 'jump') Bt.pressJump(); else if (a === 'down') Bt.pressDown(); else if (a === 'dash') Bt.dash(); else if (a === 'attack') Bt.pressAttack(); else if (a === 'left' || a === 'right') Bt.input[a] = true;
  }
  function release(m, a) {
    if (m === 'run') { if (a === 'jump') Run.releaseJump(); else if (a === 'slide') Run.releaseSlide(); return; }
    if (a === 'jump') Bt.releaseJump(); else if (a === 'down') Bt.releaseDown(); else if (a === 'left' || a === 'right' || a === 'attack') Bt.input[a] = false;
  }
  function secretKeys(e) {
    keyBuf.push(e.code); if (keyBuf.length > 10) keyBuf.shift();
    if (keyBuf.join() === KONAMI.join()) { keyBuf = []; discover('konami', { char: 'spectre' }, 'Code secret'); }
    if (e.key && e.key.length === 1) { wordBuf = (wordBuf + e.key.toUpperCase()).slice(-4); if (wordBuf === 'LUMA') discover('word', { skin: 'retro' }, 'Mot secret'); }
  }
  function discover(flag, bundle, source) {
    if (save.flags[flag]) return;
    save.flags[flag] = true; save.stats.secrets++;
    UI.toast('??? Un secret a été découvert', '★'); E.sfx('rare'); E.flash = 0.5;
    P.reward(bundle, 'secret:' + flag, source); P.checkAch(); P.persist();
    openReveals(() => RENDER[screen] && RENDER[screen]());
  }
  addEventListener('keydown', e => {
    const k = e.code;
    E.unlockAudio();
    if ($('confirm').classList.contains('on')) { if (k === 'Escape') overlay('confirm', false); return; }
    if (C.capture && screen === 'keys') { C.handleCapture(e); return; }
    // Saisie de texte (pseudo, code de sauvegarde) : le jeu ne capte aucune touche.
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { if (k === 'Escape') t.blur(); return; }
    C.learn(e);
    if ($('reveal').classList.contains('on')) { if ((k === 'Space' || k === 'Enter') && !e.repeat) { e.preventDefault(); openReveals(); } return; }
    const playMode = mode || 'run', action = I.actionFor(save.keys, playMode, k);
    if (state === 'play') {
      if (action || k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      if (k === 'Escape' || action === 'pause') { pause(); return; }
      if (action) { held.add(k); press(playMode, action); }
      return;
    }
    if (state === 'resume' || state === 'dying' || state === 'modal') { if (action || k === 'Space') e.preventDefault(); return; }
    if (state === 'preview') { if (k === 'Escape') closeTouchEditor(); return; }
    if (state === 'menu') secretKeys(e);
    const onBtn = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if ((k === 'Space' || k === 'Enter') && onBtn) return; // le bouton focalisé gère lui-même l'activation
    if (k === 'Space') e.preventDefault();
    if (state === 'over') { if ((k === 'Space' || k === 'Enter' || action === 'jump') && !e.repeat) again(); else if (k === 'Escape') toMenu(); }
    else if (state === 'pause') { if (k === 'Escape' || k === 'Enter' || k === 'Space' || action === 'pause') resume(); }
    else if (state === 'menu') {
      if (k === 'Escape' && screen !== 'hub') { E.sfx('click'); if (screen === 'keys') go('settings'); else { RENDER.hub(); show('hub'); } }
      else if ((k === 'Enter' || (k === 'Space' && screen === 'hub')) && (screen === 'hub' || screen === 'prep')) startGame(screen === 'prep' ? prepMode : 'run');
    }
  });
  // Relâchement : une action reste active tant qu'une de ses touches est encore enfoncée.
  addEventListener('keyup', e => {
    held.delete(e.code);
    for (const m of ['run', 'battle']) {
      const a = I.actionFor(save.keys, m, e.code);
      if (a && ![...held].some(c => I.actionFor(save.keys, m, c) === a)) release(m, a);
    }
  });
  const cvs = E.cvs;
  cvs.addEventListener('pointerdown', e => {
    E.unlockAudio();
    if (state !== 'play' || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    let act;
    if (mode === 'run') {
      if (e.pointerType !== 'mouse' && save.runControls === 'buttons') return;
      if (e.pointerType !== 'mouse' && save.runControls === 'tap') { gestureIds.add(e.pointerId); gesture.down(e.pointerId); return; }
      act = e.pointerType === 'mouse' ? 'jump' : e.clientX < E.W * 0.42 ? 'slide' : 'jump'; // zones : gauche = glisser, droite = sauter
    } else { if (e.pointerType !== 'mouse') return; act = 'attack'; }
    touches.set(e.pointerId, act);
    if (act === 'jump') Run.pressJump(); else if (act === 'slide') Run.pressSlide(); else Bt.pressAttack();
  });
  const pUp = e => {
    if (gestureIds.delete(e.pointerId)) { if (e.type === 'pointercancel') gesture.cancel(e.pointerId); else gesture.up(e.pointerId); return; }
    const a = touches.get(e.pointerId); if (!a) return; touches.delete(e.pointerId);
    if (a === 'jump') Run.releaseJump(); else if (a === 'slide') Run.releaseSlide(); else Bt.input.attack = false;
  };
  addEventListener('pointerup', pUp); addEventListener('pointercancel', pUp);
  // Premier toucher sur un appareil hybride : on bascule sur les commandes tactiles, même en pleine partie.
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || isTouch) return;
    isTouch = true;
    if (mode && state === 'play' && touchModeFor(mode)) { E.touchMode = mode; E.resize(); if (mode === 'battle') Bt.fit(); setupControls(); }
  }, true);
  // iOS/Safari n'autorise le son qu'après un geste reconnu : on tente à chaque type de geste.
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click']) addEventListener(ev, () => { E.unlockAudio(); }, true);
  cvs.addEventListener('contextmenu', e => e.preventDefault());

  // ───────────── Éditeur des commandes tactiles ─────────────
  function openTouchEditor(m) {
    G.begin(m); mode = m; state = 'preview';
    E.touchMode = m; E.resize(); if (m === 'battle') Bt.preview(); else Run.start(true); E.clearFx();
    $('hud').classList.remove('on'); show('touchedit'); C.mount(true, m);
  }
  function closeTouchEditor() {
    C.unmount(); P.persist(); E.touchMode = null; E.resize();
    mode = null; state = 'menu'; Run.start(true); LR.B.clear(); go('settings');
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); E.suspendAudio(); P.flush(); } else E.unlockAudio(); });
  addEventListener('pagehide', () => P.flush());
  addEventListener('blur', pause);
  // iOS annonce parfois les nouvelles dimensions en retard (rotation, barre de Safari, clavier) : on observe la taille
  // réellement affichée et on ne recalcule que lorsqu'elle (ou la zone sûre) change.
  const sizeKey = () => `${E.cvs.clientWidth}x${E.cvs.clientHeight}|${JSON.stringify(E.safeArea())}`;
  let lastSize = '', lastOrient = I.orientationOf(innerWidth, innerHeight);
  function refit() {
    const key = sizeKey(); if (key === lastSize) return;
    lastSize = key;
    const o = I.orientationOf(E.cvs.clientWidth || innerWidth, E.cvs.clientHeight || innerHeight), turned = o !== lastOrient; lastOrient = o;
    if (turned && isTouch && state === 'play') pause();
    E.resize();
    if (state === 'preview') { if (mode === 'battle') Bt.preview(); } else if (mode === 'battle') Bt.fit();
    C.release(); C.relayout();
  }
  const refitSoon = () => { refit(); for (const ms of [120, 400, 900]) setTimeout(() => { scrollTo(0, 0); refit(); }, ms); };
  addEventListener('resize', refit);
  addEventListener('orientationchange', refitSoon);
  if (window.visualViewport) visualViewport.addEventListener('resize', refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(E.cvs);
  addEventListener('focusout', () => setTimeout(() => { if (!/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName)) scrollTo(0, 0); }, 150)); // le clavier iOS laisse parfois la page décalée

  // Boutons des menus
  $('runBtn').onclick = () => { prepMode = 'run'; go('prep'); };
  $('battleBtn').onclick = () => { prepMode = 'battle'; go('prep'); };
  $('startBtn').onclick = () => startGame(prepMode);
  const groupBoard = withPlay => { boardView = 'online'; boardTab = 'battle'; LR.Online.focus('battle', withPlay); go('board'); };
  $('soloBtn').onclick = () => startGame('battle');
  $('friendsBtn').onclick = () => groupBoard(true);
  $('groupBoardBtn').onclick = () => groupBoard(false);
  $('resGroupBtn').onclick = () => { if (!overReady) return; toMenu(); groupBoard(true); };
  document.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => go(b.dataset.go); });
  document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => { E.sfx('click'); RENDER.hub(); show('hub'); }; });
  $('settingsBtn').onclick = () => go('settings');
  $('profile').onclick = () => go('profilePage');
  $('profileBtn').onclick = () => go('profilePage');
  $('charsBtn').onclick = () => { colTab = 'char'; go('collection'); };
  $('pfEdit').onclick = () => Pr.openEditor('profilePage');
  $('editProfileBtn').onclick = () => Pr.openEditor('settings');
  $('pfAchBtn').onclick = () => go('achievements');
  $('pfBoardBtn').onclick = () => go('board');
  $('keysBtn').onclick = () => go('keys');
  $('keysBack').onclick = () => { C.capture = null; go('settings'); };
  $('touchEditRunBtn').onclick = () => openTouchEditor('run');
  $('touchEditBtn').onclick = () => openTouchEditor('battle');
  $('teDone').onclick = closeTouchEditor;
  $('touchResetBtn').onclick = () => { C.resetTouch(); UI.toast('Commandes tactiles réinitialisées', '✓'); };
  $('runTouchSel').onchange = e => { save.runControls = e.target.value; P.persist(); E.sfx('click'); };
  $('qualitySel').onchange = e => { save.opts.quality = e.target.value; P.persist(); applyOpts(); E.LK = 0; E.resize(); };
  $('shakeChk').onchange = e => { save.opts.shake = e.target.checked; P.persist(); applyOpts(); };
  for (const [id, key] of [['sfxVol', 'sfxVol'], ['musicVol', 'musicVol']]) {
    $(id).oninput = e => { save.opts[key] = e.target.value / 100; $(id + 'Val').textContent = e.target.value + ' %'; applyOpts(); P.touch(); };
    $(id).onchange = () => { P.persist(); E.sfx('coin', 3); };
  }
  $('streakBtn').onclick = () => { if (P.claimStreak()) { E.sfx('mission'); openReveals(); } RENDER.hub(); };
  $('logo').onclick = () => { // secret : 7 touches rapides sur le logo
    const now = performance.now(); logoTaps = logoTaps.filter(t => now - t < 3000); logoTaps.push(now);
    E.sfx('click');
    if (logoTaps.length >= 7) { logoTaps = []; UI.toast('Une porte s’ouvre quelque part…', '???'); E.sfx('alarm'); setTimeout(() => startGame('battle', { secret: true }), 600); }
  };
  $('resumeBtn').onclick = resume;
  $('quitBtn').onclick = () => { if (mode && P.game && !P.game.ended) { state = 'dying'; deathT = 9; } else toMenu(); }; // quitter = fin de partie comptée normalement
  $('againBtn').onclick = again;
  $('resMenuBtn').onclick = toMenu;
  $('pauseBtn').onclick = e => { e.currentTarget.blur(); pause(); };
  $('rvOk').onclick = () => openReveals();
  $('sfxBtn').onclick = () => { save.sfx = E.prefs.sfx = !save.sfx; P.persist(); RENDER.settings(); E.sfx('click'); };
  $('musicBtn').onclick = () => { save.music = E.prefs.music = !save.music; P.persist(); E.applyMusic(); RENDER.settings(); };
  $('resetBtn').onclick = () => confirmBox('Tout effacer ?', 'Pièces, niveaux, personnages, objets, succès et records seront supprimés définitivement. Tape EFFACER pour confirmer.', 'EFFACER', () => {
    P.reset(); applyOpts(); E.setTheme('cyber'); UI.toast('Progression réinitialisée', '✓'); toMenu();
  });
  function applyOpts() {
    Object.assign(E.prefs, { sfx: save.sfx, music: save.music, sfxVol: save.opts.sfxVol, musicVol: save.opts.musicVol });
    Object.assign(E.opts, { quality: save.opts.quality, shake: save.opts.shake });
    E.applyMusic();
  }
  function showBoosts() {
    state = 'modal'; releaseInputs();
    const h = Bt.hud(); $('boostTitle').textContent = `VAGUE ${h.wave} TERMINÉE`;
    const host = $('boostList'); host.textContent = '';
    for (const b of Bt.offerBoosts()) {
      const btn = el('button'); btn.append(E.iconEl(b.icon, 48), el('b', null, b.name), el('small', null, b.text));
      btn.onclick = () => { E.sfx('power'); Bt.pickBoost(b.id); show(null); state = 'play'; };
      host.append(btn);
    }
    show('boost');
  }

  // ───────────── Boucle principale ─────────────
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    E.clock += rdt;
    E.stepPalette(rdt); stepBanner(rdt);
    if (E.shakeT > 0) E.shakeT -= rdt;
    if (E.flash > 0) E.flash = Math.max(0, E.flash - rdt * 2.2);
    if (state === 'dying') { deathT += rdt; timeScale = Math.min(1, timeScale + rdt * 0.8); if (deathT >= 1.1) finish(); }
    if (state === 'resume') {
      countT -= rdt;
      const n = Math.ceil(countT / 0.5), c = $('count');
      if (countT <= 0) { state = 'play'; c.className = ''; c.textContent = ''; }
      else if (n !== lastCount) { lastCount = n; c.textContent = n; c.className = ''; void c.offsetWidth; c.className = 'pop'; E.sfx('click'); }
    }
    const active = state === 'play' || state === 'dying' || state === 'over' || state === 'menu';
    if (active) {
      const dt = rdt * (state === 'dying' ? timeScale : 1), n = Math.max(1, Math.ceil(dt * 120)); // sous-pas à 120 Hz : pas d'obstacle traversé à haute vitesse
      const M = mode === 'battle' ? Bt : Run;
      for (let i = 0; i < n; i++) M.update(dt / n);
    }
    if (state === 'play' && mode === 'battle' && Bt.needsBoost()) showBoosts();
    if (state === 'play' && E.watchFrame(rdt)) UI.toast('Rendu allégé pour rester fluide', '⚡');
    if (mode && state !== 'menu' && state !== 'over' && state !== 'preview') { if (hintT > 0 && state === 'play') hintT -= rdt; updHUD(); }
    if (overAnim) {
      overAnim.t += rdt;
      const k = Math.min(1, overAnim.t / 0.9);
      $('resScore').textContent = fmt(Math.round(overAnim.to * (1 - Math.pow(1 - k, 3))));
      if (k >= 1) overAnim = null;
    }
    if (Math.floor(E.clock / 2) !== Math.floor((E.clock - rdt) / 2)) P.flush();
    if (state === 'menu' && screen === 'hub' && Math.floor(E.clock * 10) !== Math.floor((E.clock - rdt) * 10)) drawAvatar();
    (mode === 'battle' ? Bt : Run).render(E.ctx);
  }
  function drawAvatar() { // photo de profil : un personnage existant, dessiné par le jeu
    const g = $('avatar').getContext('2d'), a = save.profile.avatar; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 120, 120);
    g.setTransform(1.7, 0, 0, 1.7, 0, 0); E.drawChar(g, a, 35, 64, { st: 'idle', t: E.clock, runT: 0, ant: 0.35, facing: 1, blink: Math.sin(E.clock * 1.3) > 0.97 }, E.palette(a, save.skinByChar[a] || 'default', E.clock));
  }

  // ───────────── Application installée (PWA, app Mac) et transfert de sauvegarde ─────────────
  const UA = navigator.userAgent, IS_MAC_APP = /LumaRushMac/.test(UA);
  const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (screen === 'settings') RENDER.settings(); });
  addEventListener('appinstalled', () => { installEvt = null; UI.toast('Luma Rush est installé', '✓'); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* le jeu marche aussi sans */ });
  if (standalone() && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // évite l'effacement automatique des sauvegardes
  function renderInstall() {
    $('installHelp').innerHTML = IS_MAC_APP ? 'Tu joues dans l’application Mac Luma Rush ✓'
      : standalone() ? 'Luma Rush est installé : plein écran et jeu hors ligne ✓'
      : IS_IOS ? 'Sur iPhone : ouvre le jeu dans <b>Safari</b>, touche <b>Partager</b> puis <b>« Sur l’écran d’accueil »</b>.'
      : installEvt ? 'Installe Luma Rush comme une application : icône, plein écran et jeu hors ligne.'
      : /Safari/.test(UA) && !/Chrome|Chromium|Edg/.test(UA) ? 'Sur Mac avec Safari : menu <b>Fichier → Ajouter au Dock</b>.'
      : 'Dans Chrome ou Edge : icône d’installation dans la barre d’adresse, ou menu ⋮ → <b>Installer Luma Rush</b>.';
    $('installBtn').hidden = !installEvt;
    $('fsBtn').hidden = !(document.fullscreenEnabled && !standalone() && !IS_MAC_APP);
  }
  $('installBtn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* choix annulé */ } installEvt = null; renderInstall(); };
  $('fsBtn').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => UI.toast('Plein écran refusé par le navigateur', '✕')); };
  function xfer(mode) {
    $('xferBox').hidden = false; $('exportRow').hidden = mode !== 'export'; $('importRow').hidden = mode !== 'import';
    const t = $('saveCode'); t.readOnly = mode === 'export'; t.value = mode === 'export' ? D.encodeSave(save) : '';
    t.placeholder = mode === 'import' ? 'Colle ici le code de sauvegarde, ou choisis un fichier' : '';
    E.sfx('click');
  }
  $('exportBtn').onclick = () => xfer('export');
  $('importBtn').onclick = () => xfer('import');
  $('copyCode').onclick = () => {
    const t = $('saveCode'), ok = () => UI.toast('Code copié', '✓');
    const fallback = () => { t.select(); try { if (document.execCommand('copy')) ok(); else throw 0; } catch (e) { UI.toast('Sélectionne le code et copie-le', 'ℹ'); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(ok, fallback); else fallback();
  };
  $('dlCode').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([D.exportJson(save)], { type: 'application/json' }));
    a.download = `luma-rush-sauvegarde-${D.dayKey(new Date())}.json`;
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  $('pickFile').onclick = () => $('importFile').click();
  $('importFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const r = new FileReader(); r.onload = () => doImport(String(r.result)); r.readAsText(f); };
  $('loadCode').onclick = () => doImport($('saveCode').value);
  function doImport(text) {
    let next;
    try { next = D.decodeSave(text); } catch (err) { E.sfx('nope'); UI.toast(err.message || 'Code invalide', '✕'); return; }
    confirmBox('Remplacer la progression ?', `Sauvegarde importée : niveau ${D.levelInfo(next.xp).level}, ${fmt(next.coins)} éclats, record ${fmt(next.best)}. Ta progression actuelle est gardée en copie sur cet appareil.`, null, () => {
      P.replace(next); applyOpts(); E.setTheme(save.theme);
      $('xferBox').hidden = true; UI.toast('Sauvegarde importée', '✓'); toMenu();
    });
  }

  Object.assign(UI, { charCanvas, confirm: confirmBox, go, state: () => state, useSkill, playBattle: () => startGame('battle') });

  // ───────────── Démarrage ─────────────
  const t0 = performance.now();
  const hideSplash = () => setTimeout(() => $('splash').classList.add('gone'), Math.max(0, 700 - (performance.now() - t0)));
  setTimeout(hideSplash, 8000); // filet de sécurité si une image tarde
  E.loadAssets(() => { if (E.assetErrors.length) UI.toast('Images manquantes : dessin de secours utilisé', '⚠'); if (state === 'menu') RENDER[screen](); hideSplash(); },
    k => { $('spFill').style.width = Math.round(k * 100) + '%'; });
  applyOpts();
  E.resize();
  E.setTheme(save.theme);
  Run.start(true);
  for (const w of P.warnings) UI.toast(w, 'ℹ');
  RENDER.hub(); show('hub');
  requestAnimationFrame(frame);
})(window.LR = window.LR || {});
