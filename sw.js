/* Luma Rush — service worker : tout le jeu est mis en cache à l'installation, puis servi hors ligne.
   À chaque nouvelle version du jeu, changer VERSION (et le ?v= de index.html) pour que les joueurs reçoivent la mise à jour. */
'use strict';
const VERSION = 'luma-rush-3.2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/input-core.js', 'js/controls.js', 'js/profile.js', 'js/data.js', 'js/engine.js', 'js/progress.js', 'js/session.js', 'js/bosses.js', 'js/run.js', 'js/battle.js', 'js/config.js', 'js/online.js', 'js/ui.js',
  'assets/characters/striker/idle.png', 'assets/characters/striker/run.png', 'assets/characters/striker/jump.png', 'assets/characters/striker/dash.png',
  'assets/characters/striker/hit.png', 'assets/characters/striker/death.png', 'assets/characters/striker/slash.png',
  'assets/enemies/skeleton/idle.png', 'assets/enemies/skeleton/move.png', 'assets/enemies/skeleton/attack.png', 'assets/enemies/skeleton/death.png',
  'assets/enemies/bat/idle.png', 'assets/enemies/bat/move.png', 'assets/enemies/bat/attack.png', 'assets/enemies/bat/death.png',
  'assets/items/rpg-items.png', 'assets/items/guns.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];

self.addEventListener('install', e => {
  // 'reload' : sans lui, le cache du navigateur (10 min sur GitHub Pages) peut remplir la nouvelle version avec les anciens fichiers, pour toujours.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('luma-rush-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Cache d'abord (le jeu démarre hors ligne), réseau en secours ; ignoreSearch : les ?v= de index.html pointent vers les mêmes fichiers.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
