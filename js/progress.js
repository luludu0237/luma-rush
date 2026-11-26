/* Luma Rush — progression partagée par les deux modes : sauvegarde, statistiques, missions, défis, récompenses. */
'use strict';
(function (LR) {
  const D = LR.D, P = (LR.P = {});
  const KEY = 'luma-rush-v2', BACKUP = 'luma-rush-v2-backup', OLD = 'luma-rush-v1';
  P.warnings = [];
  const read = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return undefined; } };

  // Chargement : v2 → copie de secours → migration v1 → partie neuve. Ne réinitialise jamais une progression existante.
  function load() {
    const cur = read(KEY);
    if (cur && typeof cur === 'object') return D.sanitize(cur);
    if (cur === undefined) P.warnings.push('Sauvegarde illisible : tentative de restauration.');
    const bak = read(BACKUP);
    if (bak && typeof bak === 'object') { P.warnings.push('Progression restaurée depuis la copie de secours.'); return D.sanitize(bak); }
    const v1 = read(OLD);
    if (v1 && typeof v1 === 'object') { P.warnings.push('Ancienne sauvegarde importée : tout est conservé.'); return D.sanitize(D.migrateV1(v1)); }
    return D.freshSave();
  }
  const save = (P.save = load());
  D.refillMissions(save);
  let failed = false, dirty = false;
  P.touch = () => { dirty = true; }; // écriture différée (progression fine)
  P.flush = () => { if (dirty) P.persist(); };
  P.persist = function () {
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(save)); failed = false; return true; }
    catch (e) { if (!failed && LR.UI) LR.UI.toast('Sauvegarde impossible (stockage plein ou bloqué)', '⚠'); failed = true; return false; }
  };
  // Copie de secours au démarrage, uniquement depuis une sauvegarde saine.
  try { const ok = read(KEY); if (ok && typeof ok === 'object') localStorage.setItem(BACKUP, JSON.stringify(ok)); } catch (e) { /* facultatif */ }
  P.persist();
  P.reset = function () {
    const fresh = D.freshSave();
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, fresh, { sfx: save.sfx, music: save.music });
    D.refillMissions(save);
    try { localStorage.removeItem(BACKUP); } catch (e) { /* facultatif */ }
    P.persist();
  };
  // Remplace la progression par une sauvegarde importée ; l'ancienne est d'abord copiée sur cet appareil.
  P.replace = function (next) {
    try { localStorage.setItem('luma-rush-v2-avant-import', JSON.stringify(save)); } catch (e) { /* copie facultative */ }
    for (const k of Object.keys(save)) delete save[k];
    Object.assign(save, next);
    D.refillMissions(save);
    P.persist();
  };
  P.level = () => D.levelInfo(save.xp);

  // ───────────── Défis du jour / de la semaine, série ─────────────
  const today = () => D.dayKey(new Date());
  P.ensureTasks = function () {
    const d = today(), w = D.weekKey(new Date());
    if (!save.daily || save.daily.key !== d) save.daily = { key: d, tasks: D.makeTasks(d, 3, false) };
    if (!save.weekly || save.weekly.key !== w) save.weekly = { key: w, tasks: D.makeTasks('w' + w, 3, true) };
  };
  P.streakState = function () {
    const d = today(), y = D.dayKey(new Date(Date.now() - 86400000)), s = save.streak;
    if (s.claimed === d) return { claimable: false, count: s.count };
    return { claimable: true, count: s.last === y ? s.count + 1 : 1 };
  };
  P.claimStreak = function () {
    const st = P.streakState(); if (!st.claimable) return null;
    const d = today();
    save.streak = { last: d, count: st.count, claimed: d };
    return P.reward(D.streakReward(st.count), 'streak:' + d, `Série de ${st.count} jour${st.count > 1 ? 's' : ''}`);
  };

  // ───────────── Partie en cours ─────────────
  P.game = null;
  P.startGame = function (mode, easy) {
    P.ensureTasks();
    P.game = { mode, easy: !!easy, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), stats: {}, t0: performance.now(), bosses: 0 };
  };
  const TOTALS = { jumps: 'jumps', near: 'near', kills: 'kills', elites: 'elites', skillsUsed: 'skillsUsed', bosses: 'bosses', wavesCleared: 'wavesCleared' };
  const TASK_STATS = ['dist', 'coins', 'kills', 'wavesCleared', 'skillsUsed', 'near', 'games', 'bosses'];
  P.stat = function (name, n = 1, abs) {
    const g = P.game; if (!g) return;
    const prev = g.stats[name] || 0;
    g.stats[name] = abs ? n : prev + n;
    const delta = g.stats[name] - prev;
    if (delta <= 0 || g.easy) return; // EASY : ni statistiques, ni missions, ni défis, ni succès
    if (TOTALS[name]) save.stats[TOTALS[name]] += delta;
    for (const ms of save.missions) { const d = D.byId(D.MISSIONS, ms.id); if (!ms.done && d.stat === name && d.scope === 'total') ms.progress += delta; }
    if (TASK_STATS.includes(name)) for (const set of [save.daily, save.weekly]) if (set) for (const t of set.tasks) if (!t.done && D.taskStat(t) === name) t.progress += delta;
    P.check();
  };
  // Missions, défis et succès terminés → récompense immédiate (une seule fois grâce aux identifiants de réclamation).
  P.check = function () {
    const g = P.game; let changed = false;
    for (const ms of save.missions) {
      if (ms.done) continue;
      const d = D.byId(D.MISSIONS, ms.id), cur = d.scope === 'run' ? (g && g.stats[d.stat]) || 0 : ms.progress;
      if (cur < ms.goal) continue;
      ms.done = true; ms.progress = ms.goal; save.completed++; changed = true;
      save.coins += ms.reward; save.stats.coinsEarned += ms.reward;
      LR.UI.toast('Mission : ' + d.text(ms.goal), '+' + ms.reward); E().sfx('mission');
      if (save.completed % 3 === 0) LR.UI.toast(`Rang ${D.rankFor(save.completed)} atteint !`, 'x' + D.rankFor(save.completed));
    }
    for (const [set, label] of [[save.daily, 'Défi du jour'], [save.weekly, 'Défi de la semaine']]) if (set) set.tasks.forEach((t, i) => {
      if (t.done || t.progress < t.goal) return;
      t.done = true; changed = true;
      const got = D.grant(save, { coins: t.reward, loot: label === 'Défi de la semaine' ? 'rare' : undefined }, `task:${set.key}:${i}`);
      if (got) { LR.UI.toast(`${label} : ${D.taskText(t)}`, '+' + t.reward); E().sfx('mission'); P.queue(got.filter(x => x.kind !== 'coins' || x.dupe), label); }
    });
    if (P.checkAch() || changed) P.persist(); else dirty = true;
  };
  P.checkAch = function () {
    const list = D.checkAchievements(save);
    for (const a of list) {
      const def = D.byId(D.ACHIEVEMENTS, a.id);
      LR.UI.toast('Succès : ' + def.name, '★'); E().sfx('rare');
      P.queue(a.got.filter(x => x.kind !== 'coins' || x.dupe), 'Succès : ' + def.name);
    }
    return list.length > 0;
  };
  // File de révélations (objets, skins, personnages) affichée dès que le jeu le permet.
  P.reveals = [];
  // Les éclats simples passent en notification ; objets, skins, personnages, thèmes et niveaux ont leur révélation.
  P.queue = function (got, source) {
    let coins = 0;
    for (const r of got) {
      if (!r || r.kind === 'xp') continue;
      if (r.kind === 'level') { P.reveals.push({ kind: 'levelup', level: r.level, source }); P.queue(r.got, 'Niveau ' + r.level); continue; }
      if (r.kind === 'coins' && !r.dupe) { coins += r.amount; continue; }
      P.reveals.push(Object.assign({ source }, r));
    }
    if (coins && LR.UI) LR.UI.toast(source || 'Récompense', '+' + coins + ' ◆');
  };
  P.reward = function (bundle, claimId, source) {
    const got = D.grant(save, bundle, claimId);
    if (!got) return null;
    P.queue(got, source);
    P.checkAch(); P.persist();
    return got;
  };
  // Fin de partie : éclats (avec bonus), XP, statistiques, records, classement. Renvoie le résumé affiché.
  P.endGame = function (sum, mods) {
    const g = P.game; if (!g || g.ended) return null;
    g.ended = true;
    if (g.easy) return endEasy(g, sum, mods);
    const bonus = Math.floor(sum.coins * (mods.coins - 1) + (sum.greed ? sum.coins * 0.25 : 0));
    const coins = sum.coins + bonus;
    save.coins += coins; save.stats.coinsEarned += coins;
    save.stats.games++; save.stats.playTime += Math.round((performance.now() - g.t0) / 1000);
    if (g.mode === 'run') { save.stats.runs++; save.stats.dist += sum.dist; } else save.stats.battles++;
    P.stat('games');
    const out = { coins, bonus, record: false, rank: -1 };
    if (g.mode === 'run') {
      out.record = sum.score > save.best; save.best = Math.max(save.best, sum.score); save.bestDist = Math.max(save.bestDist, sum.dist);
      out.rank = D.submitScore(save, 'run', { score: sum.score, dist: sum.dist, char: save.char, date: D.dayKey(new Date()) });
    } else {
      out.record = sum.wave > save.bestWave; save.bestWave = Math.max(save.bestWave, sum.wave);
      out.rank = D.submitScore(save, 'battle', { wave: sum.wave, score: sum.score, kills: sum.kills, char: save.char, date: D.dayKey(new Date()) });
    }
    const xp = Math.round(((g.mode === 'run' ? sum.dist / 5 : sum.kills * 6 + sum.wave * 30) + sum.coins * 2) * mods.xp);
    out.xpGot = xp;
    out.levelsBefore = P.level().level;
    P.reward({ xp }, 'xp:' + g.id, 'Fin de partie');
    out.levelsAfter = P.level().level;
    out.missions = save.missions.map(m => Object.assign({}, m, { cur: m.done ? m.goal : D.byId(D.MISSIONS, m.id).scope === 'run' ? Math.min(m.goal, g.stats[D.byId(D.MISSIONS, m.id).stat] || 0) : m.progress }));
    out.rankUp = D.rankFor(save.completed) > (sum.rankStart || 1);
    D.refillMissions(save);
    P.checkAch(); P.persist();
    return out;
  };
  // Fin de partie EASY : gains réduits et records à part, rien dans les records ni le classement du jeu normal.
  function endEasy(g, sum, mods) {
    const bonus = Math.floor(sum.coins * (mods.coins - 1)), coins = Math.floor((sum.coins + bonus) * D.EASY.gains);
    save.coins += coins;
    const out = { coins, bonus: 0, record: sum.score > save.easy.best, rank: -1, missions: [], rankUp: false };
    save.easy.best = Math.max(save.easy.best, sum.score); save.easy.bestDist = Math.max(save.easy.bestDist, sum.dist);
    out.rank = D.submitScore(save, 'easy', { score: sum.score, dist: sum.dist, char: save.char, date: D.dayKey(new Date()) });
    out.xpGot = Math.round((sum.dist / 5 + sum.coins * 2) * mods.xp * D.EASY.gains);
    out.levelsBefore = P.level().level;
    P.reward({ xp: out.xpGot }, 'xp:' + g.id, 'Fin de partie EASY');
    out.levelsAfter = P.level().level;
    P.persist();
    return out;
  }
  const E = () => LR.E;
})(window.LR = window.LR || {});
