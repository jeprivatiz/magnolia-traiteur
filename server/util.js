'use strict';
const crypto = require('crypto');

const rid = (n = 16) => crypto.randomBytes(n).toString('base64url');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* montants : toujours en centimes TTC, affichés « 1 234,50 € » */
function euros(cents, { decimales = true } = {}) {
  if (cents == null || isNaN(cents)) return '';
  const v = Math.round(cents) / 100;
  const s = v.toLocaleString('fr-FR', { minimumFractionDigits: decimales && v % 1 ? 2 : (decimales ? 2 : 0), maximumFractionDigits: 2 });
  return s.replace(/ /g, ' ') + ' €';
}
const parseEuros = s => {
  if (typeof s === 'number') return Math.round(s * 100);
  const n = parseFloat(String(s || '').replace(/\s|€/g, '').replace(',', '.'));
  return isNaN(n) ? null : Math.round(n * 100);
};

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'sans-titre';
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* limiteur simple en mémoire */
function limiter(max, windowMs) {
  const hits = new Map();
  return key => {
    const now = Date.now(), arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    return arr.length <= max;
  };
}

const dateFr = (iso, opts = { day: 'numeric', month: 'long', year: 'numeric' }) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', ...opts });
};

/* distance à vol d'oiseau (km) */
function haversine(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Nom d'une fiche client : « Prénom NOM » (règle de Jean-Luc, 2026-11-24), ex. « jean-luc bernard » → « Jean-Luc BERNARD ».
   Une seule case « Nom et prénom » : un mot déjà tout en MAJUSCULES (2 lettres ou plus) marque le début du nom ;
   sinon le premier mot est le prénom et le reste le nom (particules comprises : « marie de la fontaine » → « Marie DE LA FONTAINE »).
   Avec deux cases (IA, import) : nomPropre(prenom, nom). Une société ou un nom d'un seul mot reste tel quel, première lettre en majuscule. */
const majPrenom = w => w.toLocaleLowerCase('fr-FR').replace(/(^|[-'’\s])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr-FR'));
const majNom = w => w.toLocaleUpperCase('fr-FR');
function nomPropre(a, b) {
  const net = s => String(s ?? '').replace(/\s+/g, ' ').trim();
  if (b !== undefined) { const p = net(a), n = net(b); return [p && majPrenom(p), n && majNom(n)].filter(Boolean).join(' '); }
  const s = net(a); if (!s) return '';
  const w = s.split(' ');
  if (w.length === 1) return /^\p{Lu}[\p{Lu}'’-]+$/u.test(s) ? s : majPrenom(s);
  const tout = x => /\p{L}{2}/u.test(x) && x === x.toLocaleUpperCase('fr-FR') && x !== x.toLocaleLowerCase('fr-FR');
  let i = w.findIndex((x, k) => k >= 1 && tout(x));
  if (i < 1) i = 1;
  return [majPrenom(w.slice(0, i).join(' ')), majNom(w.slice(i).join(' '))].join(' ');
}

module.exports = { nomPropre, rid, sha, esc, euros, parseEuros, slugify, norm, limiter, dateFr, haversine };
