/* Luma Rush — classement privé en ligne (Supabase par son API REST, sans bibliothèque). Le jeu reste jouable sans réseau. */
'use strict';
(function (root) {
  const SESSION = 'luma-online-session', PENDING = 'luma-online-pending'; // séparés de la sauvegarde : jamais exportés avec elle
  const MESSAGES = {
    reseau: 'Connexion impossible. Vérifie Internet puis réessaie.',
    code_invalide: 'Code d’invitation inconnu. Vérifie-le avec ton ami.',
    trop_d_essais: 'Trop de codes erronés : patiente un quart d’heure.',
    groupe_plein: 'Ce groupe est complet (30 joueurs).',
    trop_de_groupes: 'Limite atteinte : 10 groupes rejoints, dont 3 créés.',
    nom_invalide: 'Nom du groupe : 3 à 24 caractères.',
    profil_invalide: 'Pseudo ou avatar refusé par le serveur.',
    pas_membre: 'Tu ne fais plus partie de ce groupe.',
    interdit: 'Action réservée au créateur du groupe.',
    anonyme_desactive: 'Connexion invitée désactivée sur le serveur (Supabase : Authentication → Sign In / Providers → Anonymous).',
    base_absente: 'La base du classement n’est pas encore installée.',
    trop_de_demandes: 'Trop de demandes : patiente un moment.',
    score_refuse: 'Score refusé par le serveur.',
    session_perdue: 'Ta connexion au classement a expiré. Rejoins ton groupe avec son code.',
  };
  const fail = code => Object.assign(new Error(MESSAGES[code] || 'Erreur du serveur. Réessaie plus tard.'), { code });

  // Refuse toute clé secrète : elle contournerait les règles de sécurité et ne doit jamais être publiée.
  function isPublicKey(key) {
    if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) return true;
    try { return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch (e) { return false; }
  }

  // Client minimal, testable sans navigateur : fetch et stockage sont fournis par l'appelant.
  function makeClient(cfg, fetchFn, store) {
    const base = String(cfg.supabaseUrl || '').replace(/\/+$/, ''), key = String(cfg.supabaseKey || '');
    const configured = /^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/.test(base) && isPublicKey(key);
    const read = k => { try { return JSON.parse(store.getItem(k)); } catch (e) { return null; } };
    const write = (k, v) => { try { if (v == null) store.removeItem(k); else store.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage bloqué */ } };
    const session = () => { const s = read(SESSION); return s && s.url === base && s.refresh_token ? s : null; };
    async function call(path, body, token) {
      let res, data = null;
      const headers = { apikey: key, 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      try { res = await fetchFn(base + path, { method: 'POST', headers, body: JSON.stringify(body || {}) }); } catch (e) { throw fail('reseau'); }
      try { const t = await res.text(); data = t ? JSON.parse(t) : null; } catch (e) { /* réponse sans JSON */ }
      if (res.ok) return data;
      const msg = String((data && (data.message || data.msg || data.error_code)) || '');
      const code = res.status === 429 ? 'trop_de_demandes' : /anonymous/i.test(msg) ? 'anonyme_desactive' : data && data.code === 'PGRST202' ? 'base_absente' : res.status >= 500 ? 'reseau' : msg;
      throw Object.assign(fail(code), { status: res.status });
    }
    function keep(d) {
      if (!d || !d.access_token) throw fail('serveur');
      write(SESSION, { url: base, access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 });
      return d.access_token;
    }
    let pending = null; // un seul rafraîchissement à la fois : le jeton de rafraîchissement ne sert qu'une fois
    function token(force) {
      const s = session();
      if (s && !force && s.expires_at - Date.now() > 60000) return Promise.resolve(s.access_token);
      if (!pending) pending = (async () => {
        if (!s) return keep(await call('/auth/v1/signup', {}));
        try { return keep(await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })); }
        catch (e) { // une panne réseau ne doit jamais faire perdre l'identité du joueur
          if (e.status === 400 || e.status === 401 || e.status === 403) { write(SESSION, null); throw fail('session_perdue'); }
          throw e;
        }
      })().finally(() => { pending = null; });
      return pending;
    }
    async function rpc(name, args) {
      try { return await call('/rest/v1/rpc/' + name, args, await token()); }
      catch (e) { if (e.status !== 401) throw e; return call('/rest/v1/rpc/' + name, args, await token(true)); }
    }
    // Scores en attente : gardés tant que l'échec vient du réseau.
    let flushing = null;
    function flush() {
      if (!flushing) flushing = (async () => {
        const results = [];
        for (let list = read(PENDING) || []; list.length && session(); list = read(PENDING) || []) {
          let r;
          try { r = await rpc('lr_submit_score', list[0]); }
          catch (e) { if (e.code === 'reseau' || e.code === 'trop_de_demandes') break; r = { error: e.code }; }
          write(PENDING, (read(PENDING) || []).filter(p => p.p_ticket !== list[0].p_ticket));
          results.push(r || {});
        }
        return results;
      })().finally(() => { flushing = null; });
      return flushing;
    }
    const queue = entry => write(PENDING, (read(PENDING) || []).concat(entry).slice(-10));
    return { configured, session, rpc, queue, flush, waiting: () => (read(PENDING) || []).length };
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { makeClient, isPublicKey, MESSAGES }; return; }

  // ───────────── Jeu et interface ─────────────
  const LR = root.LR, D = LR.D, E = LR.E, P = LR.P, Pr = LR.Pr, O = (LR.Online = {});
  const $ = E.$, save = P.save, fmt = E.fmt;
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let client = null;
  const api = () => client || (client = makeClient(LR.CONFIG, (u, o) => fetch(u, Object.assign({ signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined }, o)), localStorage));
  O.reset = () => { client = null; };
  const toast = (a, b) => LR.UI.toast(a, b);

  let ticket = null;
  O.begin = function (mode) {
    const c = api();
    ticket = c.configured && c.session() ? c.rpc('lr_start_game', { p_mode: mode }).catch(() => null) : null;
  };
  O.finish = async function (sum) {
    const t = ticket; ticket = null;
    if (!t) return;
    const id = await t;
    if (!id) { toast('Partie commencée hors ligne : score non classé', '⚠'); return; }
    const int = v => Math.max(0, Math.floor(v || 0)), run = sum.mode === 'run';
    api().queue({ p_ticket: id, p_score: int(sum.score), p_dist: run ? int(sum.dist) : 0, p_wave: run ? 0 : int(sum.wave), p_kills: run ? 0 : int(sum.kills) });
    report(await api().flush());
  };
  function report(results) {
    if (results.some(r => r.best)) toast('Nouveau record envoyé au classement', '★');
    else if (results.some(r => r.error)) toast(MESSAGES.score_refuse, '✕');
    else if (!results.length && api().waiting()) toast('Hors ligne : le score sera envoyé plus tard', '⏳');
  }

  let groups = null, current = null, mode = 'run', adding = false, busy = false, timer = null, view = 0;
  const boardOpen = () => $('board').classList.contains('on') && !$('onlineBox').hidden;
  O.stop = () => { clearInterval(timer); timer = null; };

  const profileSync = () => api().rpc('lr_set_profile', { p_name: save.profile.name, p_avatar: save.profile.avatar });
  async function act(fn) {
    if (busy) return;
    busy = true; $('onlineBox').classList.add('busy');
    try { await fn(); }
    catch (e) { toast(e.message, '✕'); status(e.message, true); }
    finally { busy = false; $('onlineBox').classList.remove('busy'); }
  }
  function status(text, error) { const s = $('olStatus'); if (s) { s.textContent = text || ''; s.classList.toggle('error', !!error); } }
  const button = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.onclick = () => { E.sfx('click'); fn(); }; return b; };
  function field(id, placeholder, max, action, label) {
    const row = el('div', 'ol-form'), input = el('input'), b = button(action, 'primary', () => label(input.value));
    Object.assign(input, { id, placeholder, maxLength: max, autocomplete: 'off', spellcheck: false });
    input.setAttribute('aria-label', placeholder);
    input.onkeydown = e => { if (e.key === 'Enter') b.click(); };
    row.append(input, b);
    return row;
  }
  const enter = async id => { current = id; adding = false; groups = await api().rpc('lr_my_groups'); build(); await loadBoard(); };

  function joinForms(box) {
    const me = el('div', 'setline ol-me');
    me.append(Pr.identity(40), button('MODIFIER PSEUDO ET AVATAR', '', () => Pr.openEditor('board')));
    box.append(me, el('h3', null, 'Rejoindre avec un code'),
      field('olCode', 'Code d’invitation', 14, 'REJOINDRE', v => act(async () => {
        if (!v.trim()) throw fail('code_invalide');
        await profileSync();
        const r = await api().rpc('lr_join_group', { p_code: v });
        if (r.error) throw fail(r.error);
        toast('Groupe rejoint', '✓'); await enter(r.id);
      })),
      el('h3', null, 'Ou créer un groupe privé'),
      field('olName', 'Nom du groupe', 24, 'CRÉER', v => act(async () => {
        if (v.trim().length < 3) throw fail('nom_invalide');
        await profileSync();
        const id = await api().rpc('lr_create_group', { p_name: v });
        toast('Groupe créé : partage son code', '✓'); await enter(id);
      })),
      el('p', 'hint', 'Seuls les membres du groupe voient son classement. Les parties jouées après l’inscription comptent.'));
  }

  function build() {
    const box = $('onlineBox'); box.textContent = '';
    const st = el('p', 'ol-status'); st.id = 'olStatus'; st.setAttribute('role', 'status');
    box.append(st);
    const g = groups && groups.find(x => x.id === current);
    if (!g || adding) {
      joinForms(box);
      if (g) box.append(button('RETOUR AU CLASSEMENT', '', () => { adding = false; build(); loadBoard(); }));
      return;
    }
    if (groups.length > 1) {
      const pick = el('div', 'tabs wide');
      for (const x of groups) { const b = el('button', x.id === current ? 'on' : '', x.name); b.onclick = () => { current = x.id; build(); loadBoard(); }; pick.append(b); }
      box.append(pick);
    }
    const head = el('div', 'panel ol-group'), info = el('div');
    info.append(el('b', null, g.name), el('small', null, `${g.members} joueur${g.members > 1 ? 's' : ''}`), el('code', null, g.code));
    head.append(info, button('PARTAGER LE CODE', 'primary', () => share(g)));
    const tabs = el('div', 'tabs');
    for (const [id, name] of [['run', 'RUN'], ['battle', 'BATTLE']]) { const b = el('button', id === mode ? 'on' : '', name); b.dataset.m = id; b.onclick = () => { mode = id; build(); loadBoard(); }; tabs.append(b); }
    const list = el('div', 'ol-list'); list.id = 'olList';
    const actions = el('div', 'row');
    actions.append(button('ACTUALISER', '', () => loadBoard()), button('AUTRE GROUPE', '', () => { adding = true; build(); }),
      button('QUITTER LE GROUPE', 'danger', () => LR.UI.confirm('Quitter le groupe ?', `Tu ne verras plus le classement de « ${g.name} ». Ta progression dans le jeu est conservée.`, null, () => act(async () => {
        await api().rpc('lr_leave_group', { p_group: g.id }); toast('Groupe quitté', '✓'); current = null; await load();
      }))));
    if (g.owner) actions.append(button('NOUVEAU CODE', '', () => LR.UI.confirm('Changer le code ?', 'L’ancien code ne fonctionnera plus. Les membres actuels restent dans le groupe.', null, () => act(async () => {
      await api().rpc('lr_new_code', { p_group: g.id }); toast('Nouveau code créé', '✓'); await enter(g.id);
    }))));
    box.append(head, tabs, list, actions);
  }

  function share(g) {
    const text = `Rejoins mon groupe Luma Rush « ${g.name} » avec le code ${g.code}`;
    const url = /^https:/.test(location.protocol) ? location.href.split(/[?#]/)[0] : 'https://luludu0237.github.io/luma-rush/';
    const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(`${text} : ${url}`).then(() => toast('Invitation copiée', '✓'), () => toast('Code : ' + g.code, 'ℹ')) : toast('Code : ' + g.code, 'ℹ'));
    if (navigator.share) navigator.share({ text, url }).catch(e => { if (e.name !== 'AbortError') copy(); }); else copy();
  }

  // Classé par score (RUN) ou par vague puis score (BATTLE) ; les égalités partagent le même rang.
  O.rank = function (rows, m) {
    const val = r => (r[m] ? [m === 'battle' ? r[m].wave : r[m].score, r[m].score] : [-1, -1]);
    const sorted = rows.slice().sort((a, b) => val(b)[0] - val(a)[0] || val(b)[1] - val(a)[1] || a.name.localeCompare(b.name));
    let place = 0, prev = '';
    return sorted.map((r, i) => { const k = val(r).join(); if (k !== prev) { place = i + 1; prev = k; } return Object.assign({ place: r[m] ? place : null }, r); });
  };

  async function loadBoard() {
    const g = groups && groups.find(x => x.id === current), mine = ++view, m = mode;
    if (!g || adding) return;
    try {
      const rows = await api().rpc('lr_board', { p_group: g.id });
      const list = $('olList'); if (mine !== view || !list) return;
      list.textContent = '';
      for (const r of O.rank(rows || [], m)) {
        const avatar = D.byId(D.CHARACTERS, r.avatar) ? r.avatar : 'luma';
        const row = el('div', 'ol-row' + (r.me ? ' me' : '') + (r.place && r.place <= 3 ? ' top' + r.place : ''));
        const who = el('span', 'identity'); who.append(Pr.avatar(36, avatar, 'default'), el('b', null, r.name));
        if (r.me) who.append(el('em', null, 'MOI'));
        const score = el('span', 'ol-score');
        if (r[m]) score.append(el('b', null, m === 'run' ? fmt(r[m].score) : 'Vague ' + r[m].wave), el('small', null, m === 'run' ? fmt(r[m].dist) + ' m' : `${fmt(r[m].score)} pts · ${r[m].kills} ennemis`));
        else score.append(el('small', null, 'Pas encore de score'));
        row.append(el('span', 'ol-place', r.place ? String(r.place) : '–'), who, score);
        if (g.owner && !r.me) {
          const x = el('button', 'ol-kick', '×'); x.setAttribute('aria-label', 'Retirer ' + r.name);
          x.onclick = () => LR.UI.confirm('Retirer ce joueur ?', `${r.name} sera retiré du groupe et le code d’invitation changera.`, null, () => act(async () => {
            await api().rpc('lr_remove_member', { p_group: g.id, p_user: r.id }); toast('Joueur retiré, nouveau code créé', '✓'); await enter(g.id);
          }));
          row.append(x);
        }
        list.append(row);
      }
      status(`Actualisé à ${new Date().toLocaleTimeString('fr-FR')} · mise à jour automatique`);
    } catch (e) {
      if (mine !== view) return;
      status(e.message, true);
      if (e.code === 'pas_membre') { current = null; load(); }
    }
  }

  async function load() {
    const c = api(), box = $('onlineBox');
    if (!c.session()) { groups = []; build(); return; } // aucun compte créé tant que le joueur n'a rien demandé
    if (!groups) { box.textContent = ''; box.append(el('p', 'ol-status', 'Connexion au classement…')); }
    try {
      report(await c.flush());
      groups = (await c.rpc('lr_my_groups')) || [];
      if (!groups.some(g => g.id === current)) current = groups.length ? groups[0].id : null;
      if (current) profileSync().catch(() => {});
      build(); await loadBoard();
    } catch (e) {
      if (e.code === 'session_perdue') { groups = []; build(); status(e.message, true); return; }
      box.textContent = ''; const s = el('p', 'ol-status error', e.message); s.id = 'olStatus'; box.append(s, button('RÉESSAYER', 'primary', () => load()));
    }
  }

  O.render = function () {
    O.stop();
    if (!api().configured) {
      $('onlineBox').textContent = '';
      $('onlineBox').append(el('p', 'ol-status', 'Le classement en ligne n’est pas encore configuré. Le classement local reste disponible.'));
      return;
    }
    load();
    timer = setInterval(() => {
      if (!boardOpen()) { if (!$('board').classList.contains('on')) O.stop(); return; }
      if (!document.hidden && !busy && current && !adding) loadBoard();
    }, 15000);
  };
  addEventListener('online', () => { if (api().configured && api().session()) api().flush().then(report); });
})(typeof window !== 'undefined' ? window : this);
