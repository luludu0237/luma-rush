/* Luma Rush — catalogue de contenu + logique pure (sans DOM). Chargé par le jeu et par test.js (Node). */
'use strict';
(function (root) {
  const I = typeof module !== 'undefined' && module.exports ? require('./input-core.js') : root.LR.I;
  const VERSION = '3.3.0';

  // ───────────── Profil : pseudo et photo (un personnage existant, aucune image importée) ─────────────
  const DEFAULT_NAME = 'Coursier';
  // 3 à 16 caractères : lettres (accents compris), chiffres, espace, _ - ’. Renvoie null si invalide.
  function cleanName(v) {
    if (typeof v !== 'string') return null;
    const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
    return /^[\p{L}\p{N} _'’-]{3,16}$/u.test(s) ? s : null;
  }

  // ───────────── Physique & course ─────────────
  const GRAVITY = 2600, JUMP_V = 900, DBL_V = 760, RISE_CUT = 2.2;
  const SPEED_BASE = 380, SPEED_MAX = 820, UNITS_PER_M = 40, PTS_PER_M = 10;
  const BOSS_EVERY = 10000; // points entre deux boss en RUN MODE
  // EASY : le Run sans boss. La vitesse monte plus lentement (jamais sous la vitesse de départ : les obstacles restent franchissables),
  // les obstacles sont plus espacés et les gains sont réduits.
  const EASY = { ramp: 0.6, gap: 1.2, gains: 0.5 };
  // Pack de vies, en éclats gagnés en jouant. Utilisable en EASY seulement : les classements RUN et BATTLE ne s'achètent pas.
  const LIFE_PACK = { lives: 7, price: 700, max: 14, perGame: 3 };

  // Obstacles : dessin (w,h), altitude du bas (y), hitbox [dx, dy, w, h]. bob = amplitude de va-et-vient vertical.
  const OT = {
    spike:   { w: 30, h: 42, y: 0, box: [8, 0, 14, 34] },
    block:   { w: 40, h: 44, y: 0, box: [4, 0, 32, 40] },
    totem:   { w: 40, h: 86, y: 0, box: [4, 0, 32, 82] },
    droneLo: { w: 48, h: 26, y: 36, box: [6, 2, 36, 22], slide: true },
    droneHi: { w: 48, h: 26, y: 150, box: [6, 2, 36, 22] },
    laser:   { w: 20, h: 1400, y: 34, box: [4, 0, 12, 1400], slide: true },
    crawler: { w: 36, h: 26, y: 0, box: [5, 0, 26, 22], vx: 150 },
    rock:    { w: 36, h: 28, y: 0, box: [6, 0, 24, 24] },
    saw:     { w: 34, h: 34, y: 8, box: [6, 6, 22, 22], bob: 60 },       // scie orbitale : monte et descend
    skel:    { w: 34, h: 48, y: 0, box: [9, 0, 16, 40], vx: 70 },        // squelette de faille (sprite)
    bat:     { w: 40, h: 26, y: 48, box: [8, 4, 24, 16], slide: true, vx: 60, wave: 14 }, // chauve-souris (sprite)
  };
  const PBOX = { stand: [-13, 2, 26, 42], slide: [-21, 2, 40, 20] };

  // ───────────── Raretés ─────────────
  const RARITY = {
    common:    { name: 'Commun', color: '#b9c2dc', order: 0, value: 60 },
    rare:      { name: 'Rare', color: '#3ea8ff', order: 1, value: 150 },
    epic:      { name: 'Épique', color: '#b65cff', order: 2, value: 400 },
    legendary: { name: 'Légendaire', color: '#ffb13e', order: 3, value: 1000 },
    mythic:    { name: 'Mythique', color: '#ff3e8a', order: 4, value: 3000 },
  };
  const RARITIES = Object.keys(RARITY);
  // Probabilités affichées au joueur (en %).
  const LOOT_TABLES = {
    capsule: { common: 50, rare: 32, epic: 13, legendary: 4.5, mythic: 0.5 },
    boss:    { rare: 55, epic: 30, legendary: 12, mythic: 3 },
    rare:    { rare: 70, epic: 24, legendary: 5.5, mythic: 0.5 },
    epic:    { epic: 80, legendary: 18, mythic: 2 },
    legendary: { legendary: 92, mythic: 8 },
    mythic:  { mythic: 100 },
  };

  // ───────────── Personnages ─────────────
  // kind 'vector' = dessiné par le code ; 'sprite' = planche d'images fournie. attack : 'ranged' (arme) ou 'melee'.
  const CHARACTERS = [
    { id: 'luma', name: 'Luma', rarity: 'common', kind: 'vector', price: 0, attack: 'ranged', hp: 5, speed: 1,
      desc: 'Coursier de lumière, fidèle depuis la première course.', perk: { id: 'cd', val: 0.1, text: 'Polyvalent : recharge des compétences −10 %' },
      col: { body: '#6ff7ff', body2: '#2b6bff', glow: '#3ef2ff' } },
    { id: 'pixel', name: 'Pixel', rarity: 'common', kind: 'vector', price: 600, attack: 'ranged', hp: 5, speed: 1,
      desc: 'Un vieux robot 8-bit qui refuse la retraite.', perk: { id: 'none', text: 'Cosmétique : aucun bonus, tout le style' },
      col: { body: '#7dff8a', body2: '#1f8f4a', glow: '#7dff8a' } },
    { id: 'striker', name: 'Striker', rarity: 'rare', kind: 'sprite', sprite: 'striker', price: 1500, attack: 'melee', hp: 5, speed: 1.1,
      desc: 'Lame rapide à l’écharpe de feu. Frappe avant qu’on la voie.', perk: { id: 'agile', val: 0.2, text: 'Agile : double saut +20 %, esquive rechargée 30 % plus vite' },
      col: { glow: '#ff7a3e' } },
    { id: 'bastion', name: 'Bastion', rarity: 'rare', kind: 'vector', price: 1800, attack: 'ranged', hp: 5, speed: 0.9,
      desc: 'Un mur blindé sur deux jambes. Lent, mais il encaisse.', perk: { id: 'tank', val: 0.4, text: 'Résistant : +2 PV, bouclier +40 %' },
      col: { body: '#c9d2e8', body2: '#4a5578', glow: '#8fb2ff' } },
    { id: 'kael', name: 'Kael', rarity: 'epic', kind: 'vector', price: 3000, attack: 'melee', hp: 5, speed: 1,
      desc: 'Rōnin cybernétique à la lame de plasma, maître du combo en trois coups.', perk: { id: 'blade', val: 0.25, text: 'Combattant : +1 PV, dégâts de mêlée +25 %' },
      col: { body: '#e6ecff', body2: '#2e2460', glow: '#c77dff', visor: '#0b0618', eye: '#7df9ff' } },
    { id: 'volt', name: 'Volt', rarity: 'epic', kind: 'vector', price: null, req: { level: 8 }, attack: 'ranged', hp: 5, speed: 1,
      desc: 'Sphère d’ingénierie toujours suivie de son mini-drone.', perk: { id: 'drone', val: 1, text: 'Technologique : drone personnel permanent' },
      col: { body: '#ffe14d', body2: '#ff8a1e', glow: '#ffd34d' } },
    { id: 'nova', name: 'Nova', rarity: 'legendary', kind: 'vector', price: 6000, req: { level: 15 }, attack: 'ranged', hp: 5, speed: 1.05,
      desc: 'Une étoile qui a choisi de courir. Son énergie brûle tout.', perk: { id: 'power', val: 0.35, text: 'Offensive : attaque et laser +35 %' },
      col: { body: '#ffffff', body2: '#ff5df0', glow: '#ff9df5' } },
    { id: 'ossian', name: 'Ossian', rarity: 'legendary', kind: 'sprite', sprite: 'skel', price: null, req: { boss: 'roios' }, attack: 'melee', hp: 5, speed: 1,
      desc: 'Un squelette de faille libéré par la chute du Roi-Os.', perk: { id: 'undying', val: 1, text: 'Immortel : une seconde chance gratuite par partie' },
      col: { glow: '#d8e2ff' } },
    { id: 'nocturne', name: 'Nocturne', rarity: 'mythic', kind: 'sprite', sprite: 'bat', price: null, req: { boss: 'nuee' }, attack: 'ranged', hp: 4, speed: 1.2,
      desc: 'Héritière de la Nuée. Ne touche presque jamais le sol.', perk: { id: 'flight', val: 1, text: 'Vol : un saut aérien supplémentaire' },
      col: { glow: '#b18cff', tint: '#c9a6ff' } },
    { id: 'spectre', name: 'Spectre', rarity: 'mythic', kind: 'vector', price: null, req: { secret: 'konami' }, secret: true, attack: 'ranged', hp: 5, speed: 1,
      desc: 'Personne ne sait d’où il vient. Certains disent : d’un vieux code.', perk: { id: 'none', text: 'Cosmétique : traînée spectrale' },
      col: { body: '#e9f2ff', body2: '#7c8cff', glow: '#bcd0ff' } },
  ];

  // ───────────── Skins (palettes applicables à tout personnage) ─────────────
  const SKINS = [
    { id: 'default', name: 'Original', rarity: 'common', price: 0, style: 'Original' },
    { id: 'braise', name: 'Braise', rarity: 'rare', price: 300, style: 'Feu', pal: { body: '#ffc14d', body2: '#ff3e5e', glow: '#ff8a3e' }, fx: 'fire' },
    { id: 'menthe', name: 'Menthe', rarity: 'common', price: 600, style: 'Nature', pal: { body: '#9dffc8', body2: '#13a383', glow: '#4dffb0' } },
    { id: 'glace', name: 'Glace', rarity: 'rare', price: null, req: { level: 6 }, style: 'Glace', pal: { body: '#e6fbff', body2: '#5fb8ff', glow: '#9fe6ff' }, fx: 'ice' },
    { id: 'cyber', name: 'Cyberpunk', rarity: 'epic', price: 900, style: 'Cyberpunk', pal: { body: '#ff3ea5', body2: '#2a1460', glow: '#3ef2ff' } },
    { id: 'neant', name: 'Néant', rarity: 'epic', price: 1200, style: 'Ombre', pal: { body: '#4a2b80', body2: '#130829', glow: '#a66bff', eye: '#e0b8ff' } },
    { id: 'aurum', name: 'Aurum', rarity: 'legendary', price: 2500, style: 'Robot doré', pal: { body: '#fff1a8', body2: '#d0901a', glow: '#ffd34d' }, fx: 'gold' },
    { id: 'galaxie', name: 'Galaxie', rarity: 'legendary', price: null, req: { level: 30 }, style: 'Galaxie', pal: { body: '#6b4dff', body2: '#14063a', glow: '#c79bff' }, fx: 'stars' },
    { id: 'prisme', name: 'Prisme', rarity: 'legendary', price: 4000, style: 'Prisme', rainbow: true },
    { id: 'fantome', name: 'Fantôme', rarity: 'epic', price: null, req: { secret: 'egg' }, secret: true, style: 'Fantôme', pal: { body: '#f2f7ff', body2: '#9fb4d9', glow: '#e6f0ff' }, ghost: true },
    { id: 'retro', name: '8-bit', rarity: 'rare', price: null, req: { secret: 'word' }, secret: true, style: 'Secret', pal: { body: '#9bbc0f', body2: '#306230', glow: '#8bac0f' } },
    // Exclusifs aux boss (50 % de chance à chaque victoire).
    { id: 'chrome', name: 'Chrome Oméga', rarity: 'epic', boss: 'omega', style: 'Boss', pal: { body: '#e8eef8', body2: '#5a6a8a', glow: '#ff3e6c' } },
    { id: 'omegared', name: 'Œil Rouge', rarity: 'legendary', boss: 'omega', style: 'Boss', pal: { body: '#ff5a6e', body2: '#3a0614', glow: '#ff2e4c' } },
    { id: 'ivoire', name: 'Os d’ivoire', rarity: 'epic', boss: 'roios', style: 'Boss', pal: { body: '#fff8e6', body2: '#b8a67a', glow: '#fff1c2' } },
    { id: 'sepulcre', name: 'Sépulcre', rarity: 'legendary', boss: 'roios', style: 'Boss', pal: { body: '#5c6b5a', body2: '#1a2418', glow: '#9dff8a' } },
    { id: 'encre', name: 'Nuit d’encre', rarity: 'epic', boss: 'nuee', style: 'Boss', pal: { body: '#3b2a66', body2: '#0b0618', glow: '#8f6bff' } },
    { id: 'lune', name: 'Lune pâle', rarity: 'legendary', boss: 'nuee', style: 'Boss', pal: { body: '#f6f0ff', body2: '#8d84b8', glow: '#ffffff' } },
    { id: 'lave', name: 'Lave vive', rarity: 'epic', boss: 'magma', style: 'Boss', pal: { body: '#ffb13e', body2: '#a01d00', glow: '#ff6a1e' }, fx: 'fire' },
    { id: 'obsidienne', name: 'Obsidienne', rarity: 'legendary', boss: 'magma', style: 'Boss', pal: { body: '#2b2233', body2: '#05030a', glow: '#ff5a1e' } },
    { id: 'eclipse', name: 'Éclipse', rarity: 'legendary', boss: 'eclipse', style: 'Boss', pal: { body: '#1a1030', body2: '#000000', glow: '#ffd34d' } },
    { id: 'aurore', name: 'Aurore prismatique', rarity: 'mythic', boss: 'eclipse', style: 'Boss', rainbow: true },
    { id: 'abysse', name: 'Abysse', rarity: 'mythic', boss: 'neant', style: 'Boss', pal: { body: '#0b0b14', body2: '#000000', glow: '#ff3e8a' } },
  ];

  // ───────────── Compétences actives ─────────────
  // dur en s, cd en s. up = amélioration permanente liée.
  const SKILLS = [
    { id: 'jetpack', name: 'Jetpack', price: 800, icon: 'v:jetpack', dur: 3, cd: 22, up: 'jetpack', desc: 'Vole quelques secondes au-dessus des obstacles et des attaques au sol.' },
    { id: 'shield', name: 'Bouclier', price: 0, icon: 'rpg:25', dur: 4, cd: 20, up: 'shield', desc: 'Bulle qui absorbe les collisions et les attaques pendant sa durée.' },
    { id: 'hyper', name: 'Hypervitesse', price: 1000, icon: 'v:hyper', dur: 3, cd: 26, up: 'cd', desc: 'Accélère et pulvérise les dangers traversés.' },
    { id: 'laser', name: 'Laser', price: 900, icon: 'gun:2,3', dur: 0.7, cd: 14, up: 'laser', desc: 'Rayon d’énergie droit devant : détruit obstacles et ennemis.' },
    { id: 'bomb', name: 'Bombe énergétique', price: 1100, icon: 'gun:1,2', dur: 0, cd: 24, up: 'laser', desc: 'Onde de choc qui frappe tout autour de toi.' },
    { id: 'magnet', name: 'Aimant', price: 500, icon: 'v:magnet', dur: 8, cd: 20, up: 'magnet', desc: 'Attire les éclats et bonus proches.' },
    { id: 'second', name: 'Seconde chance', price: 1500, icon: 'gun:0,0', dur: 0, cd: 0, uses: 1, passive: true, desc: 'Survis une fois à un coup fatal (1 fois par partie, automatique).' },
    { id: 'drone', name: 'Drone protecteur', price: 1300, icon: 'v:drone', dur: 12, cd: 30, up: 'drone', desc: 'Un drone t’accompagne et tire sur les dangers.' },
  ];
  const UPGRADES = [
    { id: 'shield', name: 'Bouclier longue durée', desc: '+0,8 s de bouclier par niveau', max: 5, base: 220 },
    { id: 'jetpack', name: 'Réservoir de jetpack', desc: '+0,5 s de vol par niveau', max: 5, base: 220 },
    { id: 'laser', name: 'Cristal de laser', desc: '+20 % de puissance laser et bombe par niveau', max: 5, base: 260 },
    { id: 'magnet', name: 'Bobine d’aimant', desc: '+40 de portée et +1 s par niveau', max: 5, base: 200 },
    { id: 'drone', name: 'Processeur de drone', desc: '+15 % de cadence et de dégâts par niveau', max: 5, base: 260 },
    { id: 'coins', name: 'Prospecteur', desc: '+5 % d’éclats gagnés par niveau', max: 5, base: 300 },
    { id: 'cd', name: 'Surcadençage', desc: '−5 % de temps de recharge par niveau', max: 5, base: 320 },
  ];
  const upgradePrice = (id, lvl) => { const u = UPGRADES.find(x => x.id === id); return u && lvl < u.max ? Math.round(u.base * Math.pow(1.8, lvl) / 10) * 10 : null; };

  // ───────────── Armes (BATTLE, personnages à distance) — icônes du pack d'armes ─────────────
  const WEAPONS = [
    { id: 'blaster', name: 'Blaster néon', rarity: 'common', price: 0, icon: [5, 2], dmg: 12, rate: 0.24, speed: 950, desc: 'Fiable, équilibré.' },
    { id: 'smg', name: 'Mitraillette pulse', rarity: 'rare', price: 900, icon: [2, 2], dmg: 6, rate: 0.085, speed: 1000, spread: 0.08, desc: 'Cadence infernale, faibles dégâts.' },
    { id: 'revolver', name: 'Revolver lourd', rarity: 'rare', price: 1000, icon: [1, 0], dmg: 34, rate: 0.6, speed: 1200, desc: 'Lent mais chaque balle compte.' },
    { id: 'shotgun', name: 'Fusil à dispersion', rarity: 'epic', price: 1300, icon: [3, 0], dmg: 8, rate: 0.7, speed: 850, pellets: 5, spread: 0.35, desc: 'Cinq plombs : dévastateur de près.' },
    { id: 'laser', name: 'Pistolet laser', rarity: 'epic', price: 1700, icon: [2, 3], dmg: 16, rate: 0.3, speed: 1500, pierce: 2, desc: 'Traverse deux ennemis.' },
    { id: 'railgun', name: 'Railgun', rarity: 'legendary', price: 2600, icon: [3, 2], dmg: 70, rate: 1.0, speed: 2200, pierce: 99, desc: 'Transperce toute la ligne.' },
    { id: 'rocket', name: 'Lance-roquettes', rarity: 'legendary', price: 2400, icon: [4, 0], dmg: 40, rate: 1.1, speed: 650, splash: 80, desc: 'Explosion de zone.' },
  ];

  // ───────────── Objets rares (icônes du pack RPG 16x16, index = ligne*8 + colonne) ─────────────
  const ITEM_DEFS = [
    ['Lame du coursier', 'c', 'dmg'], ['Épée du gardien', 'r', 'dmg'], ['Rapière d’argent', 'c', 'dmg'], ['Cimeterre des dunes', 'r', 'dmg'],
    ['Lame de braise', 'e', 'dmg'], ['Épée d’émeraude', 'e', 'dmg'], ['Lame solaire', 'l', 'dmg'], ['Excalumen', 'm', 'dmg'],
    ['Lance de patrouille', 'c', 'dmg'], ['Lance au ruban', 'r', 'speed'], ['Trident des abysses', 'e', 'dmg'], ['Grande lame', 'r', 'dmg'],
    ['Hachette', 'c', 'dmg'], ['Hache double', 'r', 'dmg'], ['Pioche de mineur', 'c', 'coins'], ['Hallebarde lunaire', 'e', 'dmg'],
    ['Arc de chasse', 'c', 'speed'], ['Arbalète', 'r', 'dmg'], ['Arc long', 'c', 'speed'], ['Arc runique', 'e', 'cd'],
    ['Bâton noueux', 'c', 'cd'], ['Bâton de lierre', 'r', 'cd'], ['Crosse dorée', 'l', 'cd'], ['Sceptre de rubis', 'l', 'xp'],
    ['Bouclier de bois', 'c', 'shield'], ['Pavois d’acier', 'r', 'shield'], ['Rondache de bronze', 'c', 'hp'], ['Égide dorée', 'l', 'shield'],
    ['Fiole écarlate', 'c', 'hp'], ['Élixir de vie', 'r', 'hp'], ['Fiole d’azur', 'c', 'cd'], ['Potion de mana', 'r', 'cd'],
    ['Pendentif saphir', 'r', 'coins'], ['Collier étoilé', 'e', 'xp'], ['Collier de croc', 'c', 'dmg'], ['Amulette du crâne', 'e', 'dmg'],
    ['Parchemin de givre', 'r', 'cd'], ['Parchemin de feu', 'r', 'dmg'], ['Carte au trésor', 'e', 'coins'], ['Pierre runique', 'e', 'xp'],
    ['Anneau d’or', 'r', 'coins'], ['Anneau saphir', 'e', 'cd'], ['Anneau de rubis', 'e', 'dmg'], ['Anneau d’émeraude', 'l', 'xp'],
    ['Heaume de garde', 'c', 'hp'], ['Heaume nasal', 'r', 'hp'], ['Heaume du croisé', 'e', 'hp'], ['Heaume cornu', 'l', 'hp'],
    ['Bottes de cuir', 'c', 'speed'], ['Solerets d’acier', 'r', 'speed'], ['Bottes ailées', 'l', 'speed'], ['Bottes de voyage', 'c', 'speed'],
    ['Chapeau d’oracle', 'r', 'xp'], ['Chapeau d’archimage', 'e', 'xp'], ['Diadème', 'l', 'coins'], ['Capuche d’ombre', 'e', 'speed'],
    ['Pagne tressé', 'c', 'hp'], ['Plastron', 'r', 'hp'], ['Armure cornue', 'e', 'hp'], ['Armure dorée', 'm', 'hp'],
    ['Gant de cuir', 'c', 'dmg'], ['Gant de combat', 'r', 'dmg'], ['Gantelet', 'r', 'shield'], ['Gantelet d’acier', 'e', 'shield'],
    ['Pomme croquante', 'c', 'hp'], ['Fromage affiné', 'c', 'coins'], ['Œuf au plat', 'c', 'xp'], ['Part de tarte', 'c', 'hp'],
    ['Clé de bronze', 'r', 'coins'], ['Clé d’argent', 'e', 'coins'], ['Bougie éternelle', 'l', 'cd'], ['Calice des failles', 'm', 'coins'],
  ];
  const RCODE = { c: 'common', r: 'rare', e: 'epic', l: 'legendary', m: 'mythic' };
  const EFFECT = {
    dmg: { text: v => `Dégâts +${v} %`, vals: [4, 7, 11, 16, 25] },
    speed: { text: v => `Vitesse en Battle +${v} %`, vals: [3, 5, 8, 12, 18] },
    coins: { text: v => `Éclats gagnés +${v} %`, vals: [3, 5, 8, 12, 20] },
    xp: { text: v => `Expérience +${v} %`, vals: [4, 7, 11, 16, 25] },
    cd: { text: v => `Recharge des compétences −${v} %`, vals: [3, 5, 8, 12, 18] },
    shield: { text: v => `Durée du bouclier +${v} %`, vals: [8, 14, 22, 32, 50] },
    hp: { text: v => `+${v} PV en Battle`, vals: [1, 1, 2, 2, 3] },
  };
  const ITEMS = ITEM_DEFS.map(([name, r, eff], i) => {
    const rarity = RCODE[r], val = EFFECT[eff].vals[RARITY[rarity].order];
    return { id: 'i' + i, idx: i, name, rarity, eff, val, effText: EFFECT[eff].text(val) };
  });

  // ───────────── Thèmes ─────────────
  // zones : 4 palettes [ciel haut, ciel milieu, horizon, sol, accent]. sky : style du décor. amb : particules d'ambiance.
  const THEMES = [
    { id: 'cyber', name: 'Cyberpunk', price: 0, sky: 'city', amb: null, music: 0, accent: '#3ef2ff', desc: 'La ville néon originelle.',
      zones: [['Crépuscule néon', '#070220', '#2b0b52', '#8a2a7a', '#140630', '#3ef2ff'], ['Aurore glacée', '#010c1c', '#06324f', '#138a8a', '#03131f', '#8cff6d'],
        ['Fournaise', '#120306', '#4d0f1c', '#c2551d', '#1a0508', '#ffd34d'], ['Abysse électrique', '#02021a', '#0c1266', '#4a35c4', '#05031f', '#ff5df0']] },
    { id: 'ice', name: 'Monde glacé', price: 800, sky: 'ice', amb: 'snow', music: 1, accent: '#9fe6ff', desc: 'Glaciers, aurores et neige qui tombe.',
      zones: [['Banquise', '#020a1a', '#0d3358', '#5fa9c9', '#0a1a2c', '#9fe6ff'], ['Aurore boréale', '#010814', '#063a3a', '#1fb39a', '#04161a', '#7dffcf'],
        ['Nuit polaire', '#000814', '#0a1440', '#3a4d9a', '#050a1c', '#c9d8ff'], ['Cristal', '#08061a', '#2a1a5a', '#8a7ad9', '#0c0820', '#e6dcff']] },
    { id: 'volcano', name: 'Monde volcanique', price: 1200, sky: 'volcano', amb: 'embers', music: 2, accent: '#ff8a3e', desc: 'Roche en fusion et pluie de braises.',
      zones: [['Coulée', '#0d0202', '#3d0a06', '#b8380f', '#160403', '#ff8a3e'], ['Cendres', '#0a0808', '#2e2420', '#7a4a32', '#120c0a', '#ffb13e'],
        ['Cœur ardent', '#140000', '#5a0a00', '#ff4a0a', '#1c0300', '#ffd34d'], ['Obsidienne', '#050208', '#1a0a20', '#5a1a3a', '#0a0410', '#ff5a8a']] },
    { id: 'galaxy', name: 'Galaxie', price: null, req: { level: 4 }, sky: 'galaxy', amb: 'stars', music: 3, accent: '#c79bff', desc: 'Nébuleuses et astéroïdes flottants.',
      zones: [['Nébuleuse', '#05010f', '#1f0a3d', '#6b2a8a', '#0a0418', '#c79bff'], ['Bras spiral', '#01030f', '#0a1f4a', '#2a6ab0', '#03081a', '#7dd3ff'],
        ['Supernova', '#0f0208', '#3d0a2a', '#d94a7a', '#14040c', '#ffd34d'], ['Vide', '#000000', '#060614', '#1a1a3a', '#030308', '#ffffff']] },
    { id: 'forest', name: 'Forêt magique', price: null, req: { level: 10 }, sky: 'forest', amb: 'fireflies', music: 4, accent: '#8cff6d', desc: 'Arbres géants, champignons et lucioles.',
      zones: [['Sous-bois', '#020a06', '#0a2a1a', '#2a7a4a', '#06140a', '#8cff6d'], ['Clairière', '#03081a', '#1a2a5a', '#5a8a6a', '#08140c', '#ffe14d'],
        ['Brume', '#06080c', '#1c2a2a', '#5a7a7a', '#0a1010', '#c9fff0'], ['Lune des fées', '#0a0418', '#2a1450', '#8a5ac9', '#0c0818', '#ff9df5']] },
    { id: 'future', name: 'Univers futuriste', price: null, req: { boss: 'omega' }, sky: 'future', amb: null, music: 5, accent: '#ffffff', desc: 'Mégastructures blanches et anneaux orbitaux.',
      zones: [['Station', '#050a14', '#16304a', '#6aa0c9', '#0a121c', '#ffffff'], ['Orbite', '#000408', '#08203a', '#3a7ab0', '#040a12', '#7df9ff'],
        ['Solaris', '#0a0a10', '#3a2a1a', '#d9a05a', '#120e0a', '#ffd34d'], ['Hyperespace', '#04001a', '#1a0a5a', '#5a3ad9', '#08041c', '#ff5df0']] },
  ];

  // ───────────── Boss ─────────────
  // weight : chance relative d'apparition ; minKills : nombre de boss déjà vaincus requis ; first : récompense spéciale au premier kill.
  const BOSSES = [
    { id: 'omega', name: 'SENTINELLE OMÉGA', title: 'Gardienne de la piste', weight: 10, minKills: 0, hp: 1000, runHp: 12, col: '#ff3e6c', col2: '#3ef2ff',
      first: { theme: 'future' }, coins: 450, lore: 'Une IA de sécurité devenue folle depuis l’ouverture des failles.' },
    { id: 'roios', name: 'ROI-OS', title: 'Souverain des cryptes', weight: 10, minKills: 1, hp: 1200, runHp: 14, col: '#e8e0c8', col2: '#9dff8a',
      first: { char: 'ossian' }, coins: 550, lore: 'Le roi d’un royaume oublié, traîné dans le monde néon par une faille.' },
    { id: 'nuee', name: 'NUÉE NOCTURNE', title: 'Reine des chauves-souris', weight: 9, minKills: 2, hp: 1150, runHp: 14, col: '#b18cff', col2: '#ff3e8a',
      first: { char: 'nocturne' }, coins: 600, lore: 'Mille ailes, un seul cri. Elle éteint les villes qu’elle survole.' },
    { id: 'magma', name: 'COLOSSE MAGMA', title: 'Cœur du volcan', weight: 8, minKills: 3, hp: 1650, runHp: 16, col: '#ff8a3e', col2: '#ffd34d',
      first: { loot: 'epic' }, coins: 700, lore: 'Un golem de roche en fusion. Chaque pas fait trembler la piste.' },
    { id: 'eclipse', name: 'PRISME ÉCLIPSE', title: 'Entité rare', weight: 2, minKills: 3, hp: 1500, runHp: 16, col: '#ffd34d', col2: '#ff5df0', rare: true,
      first: { loot: 'legendary' }, coins: 1000, lore: 'Une entité cristalline qu’on n’aperçoit qu’une fois sur des dizaines.' },
    { id: 'neant', name: 'LE NÉANT', title: '???', weight: 0, minKills: 0, hp: 2000, runHp: 18, col: '#ff3e8a', col2: '#ffffff', secret: true,
      first: { loot: 'mythic' }, coins: 1500, lore: 'Ton reflet, nourri par chaque course perdue.' },
  ];

  // ───────────── Ennemis du BATTLE MODE ─────────────
  // cost : budget de vague ; from : vague d'apparition ; fly : volant.
  const ENEMIES = {
    scarab:  { name: 'Scarabot', hp: 20, speed: 230, dmg: 1, cost: 1, from: 1, w: 34, h: 24, coins: 2, score: 100, desc: 'Petit robot rapide' },
    bat:     { name: 'Chauve-souris de faille', hp: 16, speed: 170, dmg: 1, cost: 1, from: 1, w: 30, h: 22, fly: true, coins: 2, score: 100, desc: 'Volante, imprévisible' },
    skel:    { name: 'Squelette de faille', hp: 60, speed: 85, dmg: 1, cost: 2, from: 2, w: 26, h: 46, coins: 4, score: 250, desc: 'Résistant, frappe au contact' },
    bomber:  { name: 'Kamikaze', hp: 26, speed: 170, dmg: 2, cost: 2, from: 3, w: 30, h: 30, coins: 3, score: 200, desc: 'Explose près de toi' },
    drone:   { name: 'Drone tireur', hp: 32, speed: 120, dmg: 1, cost: 2, from: 4, w: 44, h: 24, fly: true, coins: 4, score: 250, desc: 'Tire à distance' },
    turret:  { name: 'Pylône sniper', hp: 50, speed: 0, dmg: 1, cost: 3, from: 6, w: 30, h: 44, coins: 5, score: 350, desc: 'Laser chargé, à esquiver en sautant' },
    golem:   { name: 'Golem blindé', hp: 170, speed: 60, dmg: 2, cost: 4, from: 7, w: 44, h: 56, coins: 8, score: 600, desc: 'Très résistant, fonce sur toi' },
    goldbat: { name: 'Chauve-souris dorée', hp: 30, speed: 260, dmg: 0, cost: 0, from: 2, w: 30, h: 22, fly: true, coins: 40, score: 800, desc: 'Rare : fuit, mais rapporte gros', rare: true },
  };
  const MINIBOSSES = {
    captain: { name: 'Capitaine Os', base: 'skel', hp: 420, scale: 2, speed: 95, dmg: 2, coins: 60, score: 3000 },
    alpha:   { name: 'Golem Alpha', base: 'golem', hp: 650, scale: 1.5, speed: 70, dmg: 2, coins: 80, score: 4000 },
  };
  const WAVE_BOOSTS = [
    { id: 'power', name: 'Puissance', text: 'Dégâts +20 %', icon: 'rpg:6' },
    { id: 'rate', name: 'Frénésie', text: 'Cadence d’attaque +15 %', icon: 'rpg:61' },
    { id: 'vital', name: 'Vitalité', text: '+1 PV max et soin', icon: 'rpg:29' },
    { id: 'heal', name: 'Soin complet', text: 'Tous les PV restaurés', icon: 'gun:2,1' },
    { id: 'swift', name: 'Vélocité', text: 'Vitesse +12 %', icon: 'rpg:50' },
    { id: 'focus', name: 'Concentration', text: 'Recharge des compétences −15 %', icon: 'rpg:70' },
    { id: 'crit', name: 'Œil de lynx', text: '15 % de coups critiques (x2)', icon: 'rpg:19' },
    { id: 'leech', name: 'Vampirisme', text: '+1 PV tous les 20 ennemis', icon: 'rpg:35' },
    { id: 'greed', name: 'Cupidité', text: 'Éclats +25 % cette partie', icon: 'rpg:40' },
  ];

  // ───────────── Missions, quotidien, hebdo, succès, niveaux ─────────────
  const MISSIONS = [
    { id: 'coins', scope: 'run', stat: 'coins', goals: [25, 50, 90, 150], text: n => `Ramasse ${n} éclats en une partie` },
    { id: 'dist', scope: 'run', stat: 'dist', goals: [300, 700, 1300, 2200, 3500], text: n => `Parcours ${n} m en une partie` },
    { id: 'near', scope: 'run', stat: 'near', goals: [2, 5, 9], text: n => `Réussis ${n} frôlements en une partie` },
    { id: 'jumps', scope: 'total', stat: 'jumps', goals: [40, 100, 220], text: n => `Saute ${n} fois` },
    { id: 'slides', scope: 'total', stat: 'slideUnder', goals: [8, 20, 45], text: n => `Glisse sous ${n} obstacles` },
    { id: 'powers', scope: 'total', stat: 'powers', goals: [3, 7, 14], text: n => `Attrape ${n} bonus` },
    { id: 'events', scope: 'total', stat: 'events', goals: [1, 3, 6], text: n => `Survis à ${n} événement${n > 1 ? 's' : ''}` },
    { id: 'smash', scope: 'total', stat: 'smash', goals: [3, 8, 16], text: n => `Pulvérise ${n} obstacles` },
    { id: 'dbl', scope: 'total', stat: 'doubleJumps', goals: [15, 40, 90], text: n => `Fais ${n} doubles sauts` },
    { id: 'games', scope: 'total', stat: 'games', goals: [3, 8, 15], text: n => `Termine ${n} parties` },
    { id: 'boss', scope: 'total', stat: 'bosses', goals: [1, 2, 4], text: n => `Bats ${n} boss` },
    { id: 'kills', scope: 'total', stat: 'kills', goals: [30, 80, 200], text: n => `Élimine ${n} ennemis en Battle` },
    { id: 'wave', scope: 'run', stat: 'wave', goals: [3, 6, 10], text: n => `Atteins la vague ${n} en Battle` },
    { id: 'skills', scope: 'total', stat: 'skillsUsed', goals: [5, 15, 30], text: n => `Utilise ${n} compétences` },
  ];
  const DAILY = [
    { id: 'd_dist', stat: 'dist', goals: [1500, 3000], reward: [90, 160], text: n => `Parcours ${n} m` },
    { id: 'd_coins', stat: 'coins', goals: [100, 220], reward: [80, 150], text: n => `Ramasse ${n} éclats` },
    { id: 'd_kills', stat: 'kills', goals: [30, 70], reward: [90, 170], text: n => `Élimine ${n} ennemis` },
    { id: 'd_waves', stat: 'wavesCleared', goals: [5, 10], reward: [90, 170], text: n => `Termine ${n} vagues` },
    { id: 'd_skills', stat: 'skillsUsed', goals: [5, 12], reward: [70, 130], text: n => `Utilise ${n} compétences` },
    { id: 'd_near', stat: 'near', goals: [5, 12], reward: [80, 150], text: n => `Réussis ${n} frôlements` },
    { id: 'd_games', stat: 'games', goals: [3, 6], reward: [60, 120], text: n => `Termine ${n} parties` },
    { id: 'd_boss', stat: 'bosses', goals: [1, 2], reward: [150, 300], text: n => `Bats ${n} boss` },
  ];
  const ACHIEVEMENTS = [
    { id: 'first_boss', name: 'Premier sang de faille', desc: 'Battre son premier boss', test: s => s.stats.bosses >= 1, reward: { coins: 300, xp: 200 } },
    { id: 'score10k', name: 'Cinq chiffres', desc: 'Atteindre 10 000 points en Run', test: s => s.best >= 10000, reward: { coins: 200 } },
    { id: 'score50k', name: 'Légende de la piste', desc: 'Atteindre 50 000 points en Run', test: s => s.best >= 50000, reward: { coins: 800, loot: 'epic' } },
    { id: 'dist5k', name: 'Marathon', desc: 'Parcourir 5 000 m en une partie', test: s => s.bestDist >= 5000, reward: { coins: 600 } },
    { id: 'wave10', name: 'Survivant', desc: 'Atteindre la vague 10 en Battle', test: s => s.bestWave >= 10, reward: { coins: 500 } },
    { id: 'waves20', name: 'Gladiateur', desc: 'Terminer 20 vagues au total', test: s => s.stats.wavesCleared >= 20, reward: { coins: 300 } },
    { id: 'coins1k', name: 'Pluie d’éclats', desc: 'Collecter 1 000 éclats au total', test: s => s.stats.coinsEarned >= 1000, reward: { coins: 150 } },
    { id: 'coins10k', name: 'Fortune néon', desc: 'Collecter 10 000 éclats au total', test: s => s.stats.coinsEarned >= 10000, reward: { coins: 600, loot: 'rare' } },
    { id: 'chars3', name: 'Petite équipe', desc: 'Débloquer 3 personnages', test: s => s.chars.length >= 3, reward: { coins: 200 } },
    { id: 'chars10', name: 'Collectionneur', desc: 'Débloquer 10 personnages', test: s => s.chars.length >= 10, reward: { coins: 2000, loot: 'legendary' } },
    { id: 'noshield', name: 'Sans filet', desc: 'Parcourir 1 000 m sans aucun bouclier', test: s => !!s.flags.noshield, reward: { coins: 300 } },
    { id: 'boss_nohit', name: 'Intouchable', desc: 'Battre un boss sans subir de dégâts', test: s => !!s.flags.bossNoHit, reward: { coins: 600, loot: 'rare' } },
    { id: 'bosses10', name: 'Chasseur de failles', desc: 'Vaincre 10 boss', test: s => s.stats.bosses >= 10, reward: { coins: 1000, loot: 'epic' } },
    { id: 'near50', name: 'Frôleur', desc: '50 frôlements au total', test: s => s.stats.near >= 50, reward: { coins: 200 } },
    { id: 'kills500', name: 'Exterminateur', desc: 'Éliminer 500 ennemis', test: s => s.stats.kills >= 500, reward: { coins: 500 } },
    { id: 'elites25', name: 'Tueur d’élites', desc: 'Éliminer 25 élites', test: s => s.stats.elites >= 25, reward: { coins: 400 } },
    { id: 'level10', name: 'Vétéran', desc: 'Atteindre le niveau 10', test: s => levelInfo(s.xp).level >= 10, reward: { coins: 500 } },
    { id: 'level25', name: 'Maître des failles', desc: 'Atteindre le niveau 25', test: s => levelInfo(s.xp).level >= 25, reward: { coins: 1500, loot: 'legendary' } },
    { id: 'games50', name: 'Accro', desc: 'Jouer 50 parties', test: s => s.stats.games >= 50, reward: { coins: 300 } },
    { id: 'items20', name: 'Antiquaire', desc: 'Posséder 20 objets différents', test: s => s.items.length >= 20, reward: { coins: 400 } },
    { id: 'mythic', name: 'Mythe vivant', desc: 'Obtenir un objet mythique', test: s => s.items.some(id => (ITEMS.find(i => i.id === id) || {}).rarity === 'mythic'), reward: { coins: 500 } },
    { id: 'themes', name: 'Globe-trotteur', desc: 'Posséder tous les thèmes', test: s => THEMES.every(t => s.themes.includes(t.id)), reward: { coins: 600 } },
    { id: 'egg', name: 'Curieux', desc: 'Trouver l’œuf doré', secret: true, test: s => !!s.flags.egg, reward: { coins: 250 } },
    { id: 'konami', name: 'Vieux réflexes', desc: 'Entrer un très vieux code au menu', secret: true, test: s => !!s.flags.konami, reward: { coins: 200 } },
    { id: 'word', name: 'Il connaît mon nom', desc: 'Écrire le nom du héros au menu', secret: true, test: s => !!s.flags.word, reward: { coins: 150 } },
    { id: 'room', name: 'La salle cachée', desc: 'Trouver la salle cachée', secret: true, test: s => !!s.flags.room, reward: { coins: 500 } },
    { id: 'neant', name: 'Face au Néant', desc: 'Vaincre le Néant', secret: true, test: s => (s.bosses.neant || {}).kills > 0, reward: { coins: 1000 } },
    { id: 'eclipse_ev', name: 'Éclipse dorée', desc: 'Vivre l’éclipse dorée en Run', secret: true, test: s => !!s.flags.eclipse, reward: { coins: 300 } },
  ];
  const LEVEL_REWARDS = {
    2: { coins: 150 }, 3: { skill: 'magnet' }, 4: { theme: 'galaxy' }, 5: { coins: 200, note: '3e emplacement de compétence' },
    6: { skin: 'glace' }, 7: { loot: 'rare' }, 8: { char: 'volt' }, 10: { theme: 'forest', loot: 'epic' },
    12: { skill: 'drone', note: '2e emplacement de relique' }, 15: { coins: 500, note: 'Nova disponible en boutique' }, 18: { loot: 'epic' },
    20: { weapon: 'railgun', coins: 800 }, 25: { loot: 'legendary' }, 30: { skin: 'galaxie' }, 35: { loot: 'legendary', coins: 1500 },
    40: { loot: 'mythic' }, 50: { coins: 5000 },
  };
  const levelReward = L => LEVEL_REWARDS[L] || { coins: 60 + 15 * L };
  const MAX_LEVEL = 50;
  const xpNeed = L => Math.round(100 * Math.pow(L, 1.5));
  function levelInfo(xp) {
    let L = 1, rest = Math.max(0, xp | 0);
    while (L < MAX_LEVEL && rest >= xpNeed(L)) { rest -= xpNeed(L); L++; }
    return { level: L, cur: rest, need: L < MAX_LEVEL ? xpNeed(L) : 0 };
  }
  const skillSlots = save => (levelInfo(save.xp).level >= 5 ? 3 : 2);
  const relicSlots = save => (levelInfo(save.xp).level >= 12 ? 2 : 1);

  // ───────────── Ressources graphiques livrées et leur licence (vérifiées sur les pages d'origine) ─────────────
  // path : préfixe dans assets/. commercial : l'usage commercial est autorisé par le texte de la licence.
  const ASSET_CREDITS = [
    { path: 'characters/striker/', name: 'Striker (Cyberpunk Character Pack)', author: 'oco', url: 'https://oco.itch.io/cyberpunk-character-pack',
      license: 'Page de l’auteur : usage commercial et modification autorisés, revente des fichiers seuls interdite. Crédit facultatif.', commercial: true },
    { path: 'enemies/', name: 'Dark Fantasy Monsters (démo) : squelette, chauve-souris', author: 'jfranci_px', url: null,
      license: 'License.txt de l’archive : usage commercial et modification autorisés, redistribution des fichiers seuls interdite. Crédit apprécié.', commercial: true },
    { path: 'items/rpg-items.png', name: '16x16 RPG Item Pack', author: 'Alex’s Assets', url: 'https://alexs-assets.itch.io/16x16-rpg-item-pack',
      license: 'Creative Commons Zero v1.0 (CC0) : domaine public.', commercial: true },
    { path: 'items/guns.png', name: '16x16 Micro Pixel Art Gun Pack', author: 'AystarGames', url: 'https://aystargames.itch.io/16x16-micro-pixel-art-gun-pack',
      license: 'CC0 : domaine public.', commercial: true },
  ];

  // ───────────── Hasard reproductible ─────────────
  function mulberry(a) { return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function weekKey(d) { // semaine ISO
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return t.getUTCFullYear() + '-S' + Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }

  // ───────────── Règles de jeu pures ─────────────
  const L = {
    GRAVITY, JUMP_V, DBL_V, RISE_CUT, SPEED_BASE, SPEED_MAX, UNITS_PER_M, PTS_PER_M, BOSS_EVERY, EASY, LIFE_PACK, OT, PBOX, MISSIONS,
    VERSION, DEFAULT_NAME, ASSET_CREDITS, RARITY, RARITIES, LOOT_TABLES, CHARACTERS, SKINS, SKILLS, UPGRADES, WEAPONS, ITEMS, EFFECT, THEMES, BOSSES, ENEMIES, MINIBOSSES,
    WAVE_BOOSTS, DAILY, ACHIEVEMENTS, LEVEL_REWARDS, MAX_LEVEL, levelReward, xpNeed, levelInfo, skillSlots, relicSlots,
    mulberry, hashStr, dayKey, weekKey, upgradePrice,
    speedAt: d => SPEED_BASE + (SPEED_MAX - SPEED_BASE) * (1 - Math.exp(-d / 60000)),
    // Écart entre deux motifs : jamais moins que la portée d'un saut complet + une marge de réaction.
    gapFor: (speed, meters, r) => speed * (0.85 + r * 0.75) * Math.max(0.72, 1 - meters / 6000) + 140,
    overlap: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
    rankFor: completed => 1 + Math.floor(completed / 3),
    makeMission(rank, rnd, activeIds) {
      const pool = MISSIONS.filter(m => !activeIds.includes(m.id));
      const def = (pool.length ? pool : MISSIONS)[Math.floor(rnd() * (pool.length || MISSIONS.length))];
      const tier = Math.min(def.goals.length - 1, Math.floor((rank - 1) / 2) + (rnd() < 0.3 ? 1 : 0));
      return { id: def.id, goal: def.goals[tier], progress: 0, reward: 50 + tier * 50 + rank * 10, done: false };
    },
  };
  const byId = (list, id) => list.find(x => x.id === id);
  L.byId = byId;

  // Effets cumulés : personnage + améliorations + reliques. Utilisé par les deux modes.
  L.mods = function (save, charId) {
    const ch = byId(CHARACTERS, charId) || CHARACTERS[0], up = id => save.upgrades[id] || 0, m = { dmg: 0, speed: 0, coins: 0, xp: 0, cd: 0, shield: 0, hp: 0 };
    for (const rid of save.relics) { const it = rid && byId(ITEMS, rid); if (it && save.items.includes(rid)) m[it.eff] += it.val; }
    const p = ch.perk;
    return {
      ch,
      hp: ch.hp + m.hp + (p.id === 'tank' ? 2 : 0) + (p.id === 'blade' ? 1 : 0),
      dmg: 1 + m.dmg / 100 + (p.id === 'power' ? p.val : 0),
      melee: p.id === 'blade' ? 1 + p.val : 1,
      speed: ch.speed * (1 + m.speed / 100),
      coins: 1 + 0.05 * up('coins') + m.coins / 100,
      xp: 1 + m.xp / 100,
      cdMult: Math.max(0.5, (1 - 0.05 * up('cd')) * (1 - m.cd / 100) * (p.id === 'cd' ? 1 - p.val : 1)),
      shieldDur: (1 + m.shield / 100) * (p.id === 'tank' ? 1 + p.val : 1),
      laser: (1 + 0.2 * up('laser')) * (p.id === 'power' ? 1 + p.val : 1),
      magnetR: 240 + 40 * up('magnet'),
      droneRate: 1 + 0.15 * up('drone'),
      dblBoost: p.id === 'agile' ? 1 + p.val : 1,
      dashCd: p.id === 'agile' ? 0.7 : 1,
      airJumps: p.id === 'flight' ? 2 : 1,
      freeSecond: p.id === 'undying',
      permaDrone: p.id === 'drone',
    };
  };
  L.skillStats = function (save, id, mods) {
    const s = byId(SKILLS, id), up = k => save.upgrades[k] || 0;
    let dur = s.dur;
    if (id === 'jetpack') dur += 0.5 * up('jetpack');
    if (id === 'shield') dur = (dur + 0.8 * up('shield')) * mods.shieldDur;
    if (id === 'magnet') dur += up('magnet');
    return { dur, cd: s.cd * mods.cdMult, uses: s.uses || 0 };
  };

  // Conditions de déblocage.
  L.reqMet = function (save, req) {
    if (!req) return true;
    if (req.level && levelInfo(save.xp).level < req.level) return false;
    if (req.boss && !((save.bosses[req.boss] || {}).kills > 0)) return false;
    if (req.secret && !save.flags[req.secret]) return false;
    return true;
  };
  L.reqText = function (req) {
    if (!req) return '';
    if (req.level) return `Niveau ${req.level}`;
    if (req.boss) return `Vaincre ${byId(BOSSES, req.boss).name}`;
    if (req.secret) return 'Secret à découvrir';
    return '';
  };
  const KINDS = { char: ['chars', CHARACTERS], skill: ['skills', SKILLS], weapon: ['weapons', WEAPONS], skin: ['skins', SKINS], theme: ['themes', THEMES], item: ['items', ITEMS] };
  L.owns = (save, kind, id) => (kind === 'upgrade' ? false : save[KINDS[kind][0]].includes(id));
  L.priceOf = function (save, kind, id) {
    if (kind === 'upgrade') return upgradePrice(id, save.upgrades[id] || 0);
    if (kind === 'capsule') return 450;
    if (kind === 'lifepack') return LIFE_PACK.price;
    const def = byId(KINDS[kind][1], id);
    return def && def.price != null && !def.boss ? def.price : null;
  };
  // Achat atomique : soit tout réussit (débit + attribution), soit rien ne change.
  L.buy = function (save, kind, id, rng) {
    if (kind === 'lifepack' && save.lives + LIFE_PACK.lives > LIFE_PACK.max) return { ok: false, reason: 'Réserve de vies pleine' };
    if (kind !== 'upgrade' && kind !== 'capsule' && kind !== 'lifepack') {
      const def = byId(KINDS[kind][1], id);
      if (!def) return { ok: false, reason: 'Objet inconnu' };
      if (L.owns(save, kind, id)) return { ok: false, reason: 'Déjà possédé' };
      if (!L.reqMet(save, def.req)) return { ok: false, reason: L.reqText(def.req) };
    }
    const price = L.priceOf(save, kind, id);
    if (price == null) return { ok: false, reason: kind === 'upgrade' ? 'Niveau max' : 'Non achetable' };
    if (save.coins < price) return { ok: false, reason: 'Pas assez d’éclats' };
    let got = null;
    if (kind === 'capsule') got = L.rollItem(save, rng || Math.random, LOOT_TABLES.capsule);
    save.coins -= price;
    if (kind === 'upgrade') save.upgrades[id] = (save.upgrades[id] || 0) + 1;
    else if (kind === 'capsule') applyLoot(save, got);
    else if (kind === 'lifepack') save.lives += LIFE_PACK.lives;
    else save[KINDS[kind][0]].push(id);
    return { ok: true, price, got };
  };

  // Consomme une vie de la réserve, dans la limite autorisée par partie.
  L.useLife = function (save, usedThisGame) {
    if (usedThisGame >= LIFE_PACK.perGame || !(save.lives > 0)) return false;
    save.lives--;
    return true;
  };

  // Butin : rareté tirée selon la table, puis un objet NON possédé de cette rareté ; sinon compensation en éclats.
  L.rollRarity = function (rng, table) {
    const tot = Object.values(table).reduce((a, b) => a + b, 0);
    let k = rng() * tot;
    for (const r of RARITIES) if (table[r] && (k -= table[r]) <= 0) return r;
    return RARITIES.filter(r => table[r]).pop();
  };
  L.rollItem = function (save, rng, table) {
    const rarity = L.rollRarity(rng, table), pool = ITEMS.filter(i => i.rarity === rarity && !save.items.includes(i.id));
    if (!pool.length) return { kind: 'coins', rarity, amount: RARITY[rarity].value, dupe: true };
    return { kind: 'item', rarity, id: pool[Math.floor(rng() * pool.length)].id };
  };
  function applyLoot(save, got) {
    if (got.kind === 'item') { if (!save.items.includes(got.id)) save.items.push(got.id); }
    else save.coins += got.amount;
  }
  // Skin exclusif de boss : 50 % de chance ; jamais de doublon (si tous possédés → éclats).
  L.rollBossSkin = function (save, bossId, rng) {
    if (rng() >= 0.5) return null;
    const pool = SKINS.filter(s => s.boss === bossId && !save.skins.includes(s.id));
    if (!pool.length) return { kind: 'coins', rarity: 'epic', amount: 250, dupe: true };
    return { kind: 'skin', id: pool[Math.floor(rng() * pool.length)].id };
  };

  // Attribution idempotente d'un lot de récompenses. claimId déjà vu → rien n'est crédité deux fois.
  L.grant = function (save, bundle, claimId, rng) {
    if (claimId) { if (save.claimed.includes(claimId)) return null; save.claimed.push(claimId); if (save.claimed.length > 400) save.claimed.splice(0, save.claimed.length - 400); }
    rng = rng || Math.random;
    const out = [];
    const add = (kind, id) => {
      if (!L.owns(save, kind, id)) { save[KINDS[kind][0]].push(id); out.push({ kind, id }); return; }
      const amount = Math.max(100, Math.round((L.priceOf(save, kind, id) || 400) / 2)); // déjà possédé : compensation
      save.coins += amount; out.push({ kind: 'coins', amount, dupe: true });
    };
    if (bundle.coins) { save.coins += bundle.coins; save.stats.coinsEarned += bundle.coins; out.push({ kind: 'coins', amount: bundle.coins }); }
    if (bundle.char) add('char', bundle.char);
    if (bundle.skin) add('skin', bundle.skin);
    if (bundle.theme) add('theme', bundle.theme);
    if (bundle.skill) add('skill', bundle.skill);
    if (bundle.weapon) add('weapon', bundle.weapon);
    if (bundle.loot) { const got = L.rollItem(save, rng, LOOT_TABLES[bundle.loot]); applyLoot(save, got); out.push(got); }
    if (bundle.bossSkin) { const got = L.rollBossSkin(save, bundle.bossSkin, rng); if (got) { if (got.kind === 'skin') save.skins.push(got.id); else save.coins += got.amount; out.push(got); } }
    if (bundle.xp) out.push(...L.addXp(save, bundle.xp, rng));
    return out;
  };
  // Ajoute de l'XP et crédite chaque palier une seule fois.
  L.addXp = function (save, xp, rng) {
    save.xp += Math.max(0, Math.round(xp));
    const lvl = levelInfo(save.xp).level, out = [{ kind: 'xp', amount: Math.round(xp) }];
    while (save.levelClaimed < lvl) {
      save.levelClaimed++;
      const got = L.grant(save, levelReward(save.levelClaimed), 'lvl:' + save.levelClaimed, rng);
      out.push({ kind: 'level', level: save.levelClaimed, got: got || [] });
    }
    return out;
  };
  L.checkAchievements = function (save, rng) {
    const out = [];
    for (const a of ACHIEVEMENTS) {
      if (save.ach[a.id] || !a.test(save)) continue;
      save.ach[a.id] = Date.now();
      out.push({ kind: 'ach', id: a.id, got: L.grant(save, a.reward, 'ach:' + a.id, rng) || [] });
    }
    return out;
  };

  // Boss : choix pondéré parmi ceux débloqués ; difficulté croissante mais plafonnée.
  L.pickBoss = function (save, rng) {
    const total = save.stats.bosses, pool = BOSSES.filter(b => b.weight > 0 && total >= b.minKills);
    if (total === 0) return byId(BOSSES, 'omega');
    let k = rng() * pool.reduce((a, b) => a + b.weight, 0);
    for (const b of pool) if ((k -= b.weight) <= 0) return b;
    return pool[0];
  };
  // Difficulté progressive : les PV montent peu (plafond ×1,8) ; c'est surtout la cadence des attaques qui augmente (plafond ×1,6).
  L.bossScale = (encounter, level) => Math.min(1.8, 1 + 0.12 * encounter + 0.008 * level);
  L.bossAggression = (encounter, level) => Math.min(1.6, 1 + 0.1 * encounter + 0.008 * level);
  L.bossReward = function (boss, save, encounter) {
    const first = !((save.bosses[boss.id] || {}).kills > 0);
    const bundle = { coins: Math.round(boss.coins * (1 + 0.15 * encounter)), loot: 'boss', bossSkin: boss.id, xp: 300 + 60 * encounter };
    if (first && boss.first) Object.assign(bundle, boss.first);
    return bundle;
  };

  // Composition d'une vague (budget croissant, ennemis débloqués progressivement).
  L.waveList = function (wave, rng) {
    if (wave % 5 === 0) return [];
    let budget = 5 + Math.round(wave * 2.6);
    const types = Object.keys(ENEMIES).filter(k => ENEMIES[k].cost > 0 && wave >= ENEMIES[k].from), list = [];
    while (budget > 0) {
      const ok = types.filter(k => ENEMIES[k].cost <= budget);
      if (!ok.length) break;
      const k = ok[Math.floor(rng() * ok.length)]; list.push(k); budget -= ENEMIES[k].cost;
    }
    if (wave >= 2 && rng() < 0.25) list.push('goldbat');
    return list;
  };
  L.miniBossFor = wave => (wave % 5 === 3 ? (Math.floor(wave / 5) % 2 ? 'alpha' : 'captain') : null);
  L.eliteChance = wave => Math.min(0.25, 0.02 + wave * 0.012);
  L.enemyScale = wave => 1 + 0.09 * (wave - 1);

  // Défis du jour / de la semaine, tirés de façon reproductible à partir de la date.
  L.makeTasks = function (key, count, weekly) {
    const rng = mulberry(hashStr(key)), pool = DAILY.slice(), out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const d = pool.splice(Math.floor(rng() * pool.length), 1)[0], hard = rng() < 0.4 ? 1 : 0, k = weekly ? 6 : 1;
      out.push({ id: d.id, goal: d.goals[hard] * k, reward: d.reward[hard] * (weekly ? 4 : 1), progress: 0, done: false });
    }
    return out;
  };
  L.taskText = t => byId(DAILY, t.id).text(t.goal);
  L.taskStat = t => byId(DAILY, t.id).stat;
  L.streakReward = n => ({ coins: 40 * Math.min(7, n), loot: n % 7 === 0 ? 'rare' : undefined });

  // Classement local : top 10 par mode.
  L.submitScore = function (save, mode, entry) {
    const list = mode === 'easy' ? save.easy.board : save.board[mode], key = mode === 'battle' ? 'wave' : 'score';
    list.push(entry); list.sort((a, b) => b[key] - a[key] || (b.score || 0) - (a.score || 0)); list.splice(10);
    return list.indexOf(entry);
  };

  // ───────────── Sauvegarde : format v2, migration v1, nettoyage ─────────────
  const STAT_KEYS = ['games', 'runs', 'battles', 'playTime', 'coinsEarned', 'bosses', 'wavesCleared', 'kills', 'elites', 'near', 'dist', 'skillsUsed', 'jumps', 'secrets'];
  L.freshSave = function () {
    return {
      v: 2, coins: 0, xp: 0, levelClaimed: 1, best: 0, bestDist: 0, bestWave: 0, completed: 0, missions: [],
      chars: ['luma'], char: 'luma', skins: ['default'], skinByChar: {}, skills: ['shield'], loadout: ['shield', null, null],
      upgrades: {}, weapons: ['blaster'], weapon: 'blaster', items: [], relics: [null, null], themes: ['cyber'], theme: 'cyber',
      ach: {}, flags: {}, bosses: {}, claimed: [], stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])),
      lives: 0, easy: { best: 0, bestDist: 0, board: [] }, daily: null, weekly: null, streak: { last: '', count: 0, claimed: '' }, board: { run: [], battle: [] }, sfx: true, music: true,
      profile: { name: DEFAULT_NAME, avatar: 'luma' }, keys: I.defaultKeys(), keyLabels: {}, touch: { portrait: {}, landscape: {} }, runControls: 'buttons',
      opts: { sfxVol: 0.8, musicVol: 0.6, quality: 'auto', shake: true },
    };
  };
  // Photo de profil : tout personnage non secret, ou secret déjà débloqué.
  L.avatarAllowed = (save, id) => { const c = byId(CHARACTERS, id); return !!c && (!c.secret || save.chars.includes(id)); };
  L.cleanName = cleanName;

  // Ancienne sauvegarde (v1) → v2. Le score passe à 10 points par mètre, donc l'ancien record est ×10.
  L.migrateV1 = function (v1) {
    const s = L.freshSave();
    if (!v1 || typeof v1 !== 'object') return s;
    const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
    s.coins = num(v1.coins); s.best = num(v1.best) * PTS_PER_M; s.bestDist = num(v1.bestDist); s.completed = num(v1.completed);
    s.missions = Array.isArray(v1.missions) ? v1.missions : [];
    const map = id => (id === 'luma' ? 'default' : id);
    if (Array.isArray(v1.skins)) for (const id of v1.skins.map(map)) if (byId(SKINS, id) && !s.skins.includes(id)) s.skins.push(id);
    if (v1.skin && s.skins.includes(map(v1.skin))) s.skinByChar.luma = map(v1.skin);
    s.sfx = v1.sfx !== false; s.music = v1.music !== false;
    s.flags.migratedV1 = true;
    return s;
  };
  // Remet chaque champ dans un état valide sans jamais effacer de progression légitime.
  L.sanitize = function (raw) {
    const s = Object.assign(L.freshSave(), raw && typeof raw === 'object' ? raw : {});
    const num = v => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
    for (const k of ['coins', 'xp', 'best', 'bestDist', 'bestWave', 'completed']) s[k] = num(s[k]);
    s.levelClaimed = Math.max(1, num(s.levelClaimed));
    s.lives = Math.min(LIFE_PACK.max, num(s.lives));
    const ez = s.easy && typeof s.easy === 'object' ? s.easy : {};
    s.easy = { best: num(ez.best), bestDist: num(ez.bestDist), board: (Array.isArray(ez.board) ? ez.board : []).filter(e => e && typeof e === 'object').slice(0, 10) };
    const ids = (arr, list) => [...new Set((Array.isArray(arr) ? arr : []).filter(id => byId(list, id)))];
    s.chars = ids(s.chars, CHARACTERS); if (!s.chars.includes('luma')) s.chars.unshift('luma');
    s.skins = ids(s.skins, SKINS); if (!s.skins.includes('default')) s.skins.unshift('default');
    s.skills = ids(s.skills, SKILLS); if (!s.skills.includes('shield')) s.skills.unshift('shield');
    s.weapons = ids(s.weapons, WEAPONS); if (!s.weapons.includes('blaster')) s.weapons.unshift('blaster');
    s.themes = ids(s.themes, THEMES); if (!s.themes.includes('cyber')) s.themes.unshift('cyber');
    s.items = ids(s.items, ITEMS);
    if (!s.chars.includes(s.char)) s.char = 'luma';
    if (!s.weapons.includes(s.weapon)) s.weapon = 'blaster';
    if (!s.themes.includes(s.theme)) s.theme = 'cyber';
    const sbc = s.skinByChar && typeof s.skinByChar === 'object' ? s.skinByChar : {};
    s.skinByChar = {}; for (const c in sbc) if (s.chars.includes(c) && s.skins.includes(sbc[c])) s.skinByChar[c] = sbc[c];
    const lo = Array.isArray(s.loadout) ? s.loadout.slice(0, 3) : [];
    s.loadout = [0, 1, 2].map(i => (s.skills.includes(lo[i]) && lo.indexOf(lo[i]) === i ? lo[i] : null));
    const rl = Array.isArray(s.relics) ? s.relics : [];
    s.relics = [0, 1].map(i => (s.items.includes(rl[i]) && rl.indexOf(rl[i]) === i ? rl[i] : null));
    const up = s.upgrades && typeof s.upgrades === 'object' ? s.upgrades : {};
    s.upgrades = {}; for (const u of UPGRADES) if (up[u.id]) s.upgrades[u.id] = Math.min(u.max, num(up[u.id]));
    const st = s.stats && typeof s.stats === 'object' ? s.stats : {};
    s.stats = Object.fromEntries(STAT_KEYS.map(k => [k, num(st[k])]));
    for (const k of ['ach', 'flags', 'bosses']) if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
    for (const b in s.bosses) { const v = s.bosses[b]; if (!byId(BOSSES, b) || !v || typeof v !== 'object') delete s.bosses[b]; else s.bosses[b] = { kills: num(v.kills), seen: num(v.seen) }; }
    s.claimed = Array.isArray(s.claimed) ? s.claimed.filter(x => typeof x === 'string').slice(-400) : [];
    s.missions = (Array.isArray(s.missions) ? s.missions : []).filter(m => m && byId(MISSIONS, m.id) && +m.goal > 0).slice(0, 3)
      .map(m => ({ id: m.id, goal: +m.goal, progress: +m.progress || 0, reward: +m.reward || 50, done: !!m.done }));
    const brd = s.board && typeof s.board === 'object' ? s.board : {};
    s.board = { run: (Array.isArray(brd.run) ? brd.run : []).slice(0, 10), battle: (Array.isArray(brd.battle) ? brd.battle : []).slice(0, 10) };
    if (!s.streak || typeof s.streak !== 'object') s.streak = { last: '', count: 0, claimed: '' };
    const pr = s.profile && typeof s.profile === 'object' ? s.profile : {};
    s.profile = { name: cleanName(pr.name) || DEFAULT_NAME, avatar: L.avatarAllowed(s, pr.avatar) ? pr.avatar : 'luma' };
    s.keys = I.sanitizeKeys(s.keys);
    const kl = s.keyLabels && typeof s.keyLabels === 'object' ? s.keyLabels : {};
    s.keyLabels = Object.fromEntries(Object.entries(kl).filter(([c, v]) => /^[A-Za-z0-9]{1,20}$/.test(c) && typeof v === 'string' && v.length <= 3));
    s.touch = I.sanitizeTouch(s.touch);
    // Commandes du RUN. 2.8 enregistrait « tap » d'office : on passe aux deux boutons, en gardant « zones » (choix volontaire).
    const rc = raw && raw.runControls;
    s.runControls = ['buttons', 'tap', 'zones'].includes(rc) ? rc : raw && raw.runTouch === 'zones' ? 'zones' : 'buttons';
    delete s.runTouch;
    const o = s.opts && typeof s.opts === 'object' ? s.opts : {}, vol = (v, d) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
    s.opts = { sfxVol: vol(o.sfxVol, 0.8), musicVol: vol(o.musicVol, 0.6), quality: ['auto', 'high', 'low'].includes(o.quality) ? o.quality : 'auto', shake: o.shake !== false };
    s.sfx = s.sfx !== false; s.music = s.music !== false; s.v = 2;
    return s;
  };
  // Transfert de sauvegarde entre appareils : fichier JSON ou code (le même JSON en base64).
  L.exportJson = save => JSON.stringify({ app: 'luma-rush', v: 2, date: new Date().toISOString(), save });
  L.encodeSave = save => { const b = new TextEncoder().encode(L.exportJson(save)); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  L.decodeSave = function (text) {
    text = String(text == null ? '' : text).trim();
    if (!text) throw new Error('Aucun code à importer');
    let json = text;
    if (text[0] !== '{') {
      let bin;
      try { bin = atob(text.replace(/\s+/g, '')); } catch (e) { throw new Error('Code illisible'); }
      json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    }
    let obj;
    try { obj = JSON.parse(json); } catch (e) { throw new Error('Code illisible'); }
    if (!obj || obj.app !== 'luma-rush' || !obj.save || typeof obj.save !== 'object') throw new Error('Ce n’est pas une sauvegarde Luma Rush');
    return L.sanitize(obj.save); // données externes : toujours nettoyées
  };
  L.refillMissions = function (s) {
    s.missions = s.missions.filter(m => !m.done);
    while (s.missions.length < 3) s.missions.push(L.makeMission(L.rankFor(s.completed), Math.random, s.missions.map(m => m.id)));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.LR = Object.assign(root.LR || {}, { D: L });
})(this);
