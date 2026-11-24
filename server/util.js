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

/* date de naissance : « 1980-03-12 » ou « 12/03/1980 » → « 1980-03-12 », sinon vide */
function dateNaissance(v) {
  const t = String(v ?? '').trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) { const f = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (f) m = [0, f[3], f[2].padStart(2, '0'), f[1].padStart(2, '0')]; }
  if (!m) return ''; const d = new Date(+m[1], +m[2] - 1, +m[3]); const ok = d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && +m[1] > 1900 && d <= new Date();
  return ok ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/* Formules de buffet (Jean-Luc, 2026-11-24) : « Buffet antillais — Entrée + plat + dessert » s'affiche sans tiret,
   le nom du buffet sur une ligne puis la formule en dessous, plus petit. Le titre enregistré ne change pas (adresses, recherche). */
const FORMULE_RE = /^(Buffets?\s[^—·()]+?)\s+[—·–-]\s+(\S.*)$/u;
/* taille d'une portion, ajoutée au nom partout où il s'affiche (Jean-Luc, 2026-11-24) : tous les accras = 4 accras, samoussas = 1 samoussa, boudins = 1 boudin.
   Copiée dans public/js/site.js et public/admin/admin.js. */
const PORTIONS = [[/^a?c+ras?\b/i, '1 portion = 4 accras'], [/^sam[ou]+s+as?\b/i, '1 portion = 1 samoussa'], [/^boudins?\b/i, '1 portion = 1 boudin']];
const avecPortion = t => { t = String(t ?? ''); const x = PORTIONS.find(([re]) => re.test(t)); if (!x || t.includes(x[1])) return t; const i = t.indexOf(' : '); return i > 0 ? `${t.slice(0, i)} (${x[1]})${t.slice(i)}` : `${t} (${x[1]})`; };
const coupeTitre = t => { t = avecPortion(t); const m = FORMULE_RE.exec(String(t ?? '').trim()); return m ? [m[1], m[2].charAt(0).toUpperCase() + m[2].slice(1)] : [String(t ?? ''), '']; };
const titreHtml = t => { const [n, f] = coupeTitre(t); return f ? `${esc(n)}<span class="formule">${esc(f)}</span>` : esc(n); };
const titreTexte = t => { const [n, f] = coupeTitre(t); return f ? `${n} (${f.charAt(0).toLowerCase() + f.slice(1)})` : n; };

module.exports = { avecPortion, coupeTitre, titreHtml, titreTexte, dateNaissance, nomPropre, rid, sha, esc, euros, parseEuros, slugify, norm, limiter, dateFr, haversine };
