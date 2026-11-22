#!/usr/bin/env node
'use strict';
/*
 * Récupère tout le contenu du brouillon Magnolia (site Next.js hébergé sur Railway) :
 *   - les rubriques, les 377 prestations (textes, prix TTC, options, photos, vidéos),
 *   - les lieux de réception,
 *   - les textes des pages,
 *   - toutes les photos et vidéos, rangées dans public/ au même chemin que sur le brouillon.
 * Résultat : data/brouillon.json + public/site/...
 *
 * Utilisation : node scripts/recuperer-brouillon.js [adresse du brouillon]
 * (lancé automatiquement par GitHub : .github/workflows/recuperer-brouillon.yml)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const BASE = (process.argv[2] || process.env.BROUILLON_URL || 'https://magnolia-dev-39325b26.up.railway.app').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'data', 'brouillon.json');
const SKIP_MEDIA = process.env.SKIP_MEDIA === '1';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { binary = false, tries = 4 } = {}) {
  const u = url.startsWith('http') ? url : BASE + url;
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': 'magnolia-recuperation/1.0' } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (i >= tries) { console.warn('  échec', u, e.message); return null; }
      await sleep(500 * i);
    }
  }
}

/* Next.js envoie les données de la page dans des appels self.__next_f.push([1, "..."]) */
function rscText(html) {
  const out = [];
  const re = /<script>(self\.__next_f\.push\([\s\S]*?\))<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const inner = m[1].slice('self.__next_f.push('.length, -1);
    let arr = null;
    try { arr = JSON.parse(inner); } catch {
      try { arr = vm.runInNewContext('(' + inner + ')', {}, { timeout: 200 }); } catch { arr = null; }
    }
    if (Array.isArray(arr) && typeof arr[1] === 'string') out.push(arr[1]);
  }
  return out.join('');
}

/* extrait l'objet JSON qui suit la clé donnée, en respectant les chaînes */
function objectAfter(s, key, from = 0) {
  const i = s.indexOf(key, from); if (i < 0) return null;
  const j = s.indexOf('{', i); if (j < 0) return null;
  let d = 0, inS = false, esc = false;
  for (let k = j; k < s.length; k++) {
    const c = s[k];
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
    if (c === '"') inS = true;
    else if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) { try { return JSON.parse(s.slice(j, k + 1)); } catch { return null; } } }
  }
  return null;
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
function mainText(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/);
  if (!m) return '';
  return decode(m[0]
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '')
    .replace(/<img[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>/g, '\n[photo $1 | $2]\n')
    .replace(/<\/(p|h1|h2|h3|h4|li|div|section|blockquote|figure|tr|a|button)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

(async () => {
  console.log('Brouillon :', BASE);
  const html = {};
  const boutique = await get('/boutique');
  if (!boutique) throw new Error('La boutique du brouillon est inaccessible.');
  html['/boutique'] = boutique;
  const rsc0 = rscText(boutique);
  const rubriques = (objectAfter(rsc0, '{"rubriques"') || {}).rubriques || [];
  const evenements = (() => { const i = rsc0.indexOf('"evenements":['); if (i < 0) return []; try { const j = rsc0.indexOf('[', i); let d = 0; for (let k = j; k < rsc0.length; k++) { if (rsc0[k] === '[') d++; else if (rsc0[k] === ']' && --d === 0) return JSON.parse(rsc0.slice(j, k + 1)); } } catch { /* */ } return []; })();
  console.log(rubriques.length, 'rubriques');
  const slugs = new Set(['lieux', ...rubriques.map(r => r.slug), ...rubriques.map(r => r.slugLisible)]);
  const links = [...new Set([...boutique.matchAll(/href="(\/[a-z0-9-]+\/[a-z0-9-]+)"/g)].map(m => m[1]).filter(h => slugs.has(h.split('/')[1])))];
  console.log(links.length, 'fiches à lire');

  const produits = [], lieux = [];
  await pool(links, 8, async (u) => {
    const h = await get(u); if (!h) return;
    html[u] = h;
    const s = rscText(h);
    const p = objectAfter(s, '"p":{"id"');
    if (p) { produits.push({ ...p, url: u }); return; }
    const v = jsonLd(h).find(x => x['@type'] === 'EventVenue');
    if (v) lieux.push({ url: u, slug: u.split('/')[2], ...v, texte: mainText(h) });
  });
  const ordre = new Map(links.map((l, i) => [l, i]));
  produits.sort((a, b) => ordre.get(a.url) - ordre.get(b.url));
  lieux.sort((a, b) => ordre.get(a.url) - ordre.get(b.url));
  console.log(produits.length, 'prestations,', lieux.length, 'lieux');

  const pagesList = ['/', '/maison', '/temoignages', '/livraison', '/comment-commander', '/conseils', '/references', '/contact', '/cgv', '/mentions-legales', '/confidentialite', '/allergenes', '/art-de-surprendre', '/buffet-antillais', '/buffet-chinois', '/buffet-indien', '/paella', '/traiteur-vegetarien-vegan', ...rubriques.map(r => r.href)];
  const pages = {};
  await pool([...new Set(pagesList)], 6, async (u) => {
    const h = await get(u); if (!h) return;
    html[u] = h;
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const d = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    pages[u] = { titre: decode(t), description: decode(d), texte: mainText(h) };
  });

  /* marque : monogramme du logo */
  const home = html['/'] || '';
  const svg = (home.match(/<svg class="[^"]*monogramme[^"]*"[\s\S]*?<\/svg>/) || [])[0];
  if (svg) {
    fs.mkdirSync(path.join(PUBLIC, 'brand'), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC, 'brand', 'monogramme.svg'), svg.replace(/<svg class="[^"]*"/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/ aria-hidden="true"/, '').replace('fill="currentColor"', 'fill="#1d3b2f"'));
  }

  /* médias : tout ce qui est sous /site/ sur le brouillon, plus les photos externes (supabase) */
  const data = { source: BASE, recupereLe: new Date().toISOString(), rubriques, evenements, produits, lieux, pages };
  let blob = JSON.stringify(data) + Object.values(html).join('\n');
  const local = new Set();
  for (const m of blob.matchAll(/\/site\/[A-Za-z0-9_\-./%]+?\.(?:webp|jpe?g|png|svg|gif|mp4|webm|avif)/g)) local.add(m[0]);
  for (const m of blob.matchAll(/\/(?:icon\.svg|apple-icon\.png|favicon\.ico)/g)) local.add(m[0]);
  const ext = new Map();
  for (const m of JSON.stringify(data).matchAll(/https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/[^"\s)]+?\.(?:webp|jpe?g|png|mp4)/g)) {
    const url = m[0];
    const e = path.extname(url);
    ext.set(url, '/site/externe/' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + e);
  }
  let json = JSON.stringify(data, null, 1);
  for (const [u, p] of ext) json = json.split(u).join(p);
  json = json.split('https://www.magnoliatraiteur.fr/site/').join('/site/');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log('Données écrites :', path.relative(ROOT, OUT), Math.round(json.length / 1024) + ' Ko');

  if (SKIP_MEDIA) return;
  const jobs = [...[...local].map(p => [BASE + p, p]), ...[...ext].map(([u, p]) => [u, p])];
  console.log(jobs.length, 'photos et vidéos à copier');
  let okN = 0, bytes = 0; const manquants = [];
  await pool(jobs, 10, async ([url, p]) => {
    const dest = path.join(PUBLIC, decodeURIComponent(p).replace(/^\//, ''));
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { okN++; return; }
    const buf = await get(url, { binary: true });
    if (!buf) { manquants.push(p); return; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf); okN++; bytes += buf.length;
  });
  console.log(`Médias : ${okN}/${jobs.length} présents, ${Math.round(bytes / 1048576)} Mo téléchargés.`);
  if (manquants.length) { console.log('Introuvables :'); manquants.slice(0, 50).forEach(m => console.log('  ' + m)); }
  fs.writeFileSync(path.join(ROOT, 'data', 'brouillon-medias.txt'), `${okN}/${jobs.length} médias\n` + manquants.map(m => 'manquant ' + m).join('\n') + '\n');
})().catch(e => { console.error(e); process.exit(1); });
