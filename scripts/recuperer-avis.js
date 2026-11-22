#!/usr/bin/env node
'use strict';
/*
 * Récupère les avis clients et les logos d'entreprises du site actuel magnoliatraiteur.fr (page Témoignages) :
 *   - chaque avis : titre, texte, nom, date, lieu, note, photo ;
 *   - le bandeau de logos : nom de l'entreprise, logo, avis lié.
 * Résultat : data/avis-magnolia.json + images dans public/site/avis/.
 * Lancé par GitHub (.github/workflows/recuperer-avis.yml), car le serveur de travail ne joint pas ce site.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = (process.argv[2] || 'https://www.magnoliatraiteur.fr').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'avis-magnolia.json');
const DIR = path.join(ROOT, 'public', 'site', 'avis');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, binary = false) {
  for (let i = 1; i <= 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (magnolia-recuperation)' }, redirect: 'follow' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) { if (i === 4) { console.warn('  échec', url, e.message); return null; } await sleep(800 * i); }
  }
}
const decode = s => String(s || '').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8230;/g, '…').replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&#171;|&laquo;/g, '«').replace(/&#187;|&raquo;/g, '»')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n));
const texte = h => decode(String(h || '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>\s*<p[^>]*>/g, '\n\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/* découpe un bloc <div class="wpmtst-testimonial ... post-ID"> en respectant l'imbrication des div */
function blocs(html) {
  const out = [];
  const re = /<div class="wpmtst-testimonial testimonial post-(\d+)">/g;
  let m;
  while ((m = re.exec(html))) {
    let d = 0, i = m.index;
    const tag = /<\/?div\b[^>]*>/g; tag.lastIndex = i;
    let t;
    while ((t = tag.exec(html))) { if (t[0][1] === '/') { if (--d === 0) { out.push({ id: m[1], html: html.slice(m.index, tag.lastIndex) }); break; } } else d++; }
  }
  return out;
}
function lireAvis(b) {
  const h = b.html;
  const titre = texte((h.match(/testimonial-heading">([\s\S]*?)<\/h3>/) || [])[1]);
  const contenu = (h.match(/testimonial-content">([\s\S]*?)<\/div>\s*<div class="wpmtst-testimonial-field/) || h.match(/testimonial-content">([\s\S]*)/) || [])[1] || '';
  const photo = (contenu.match(/testimonial-image[\s\S]*?<img[^>]*?src="([^"]+)"/) || [])[1] || '';
  const corps = texte(contenu.replace(/<div class="wpmtst-testimonial-image[\s\S]*?<\/div>/, ''));
  const note = (h.match(/class="star" style="display: inline-block;"/g) || []).length || 5;
  const champs = [...h.matchAll(/<div class="wpmtst-testimonial-field testimonial-field ">([\s\S]*?)<\/div>/g)].map(x => x[1]).filter(x => !/strong-rating/.test(x));
  let auteur = '', date = '', lieu = '';
  for (const c of champs) {
    if (/Lieu :/.test(c)) lieu = texte(c.replace(/<span[^>]*>Lieu :<\/span>/, ''));
    else if (/^\s*\d{1,2}\s+\S+\s+\d{4}\s*$/.test(texte(c))) date = texte(c);
    else if (!auteur) auteur = texte(c);
  }
  return { id: b.id, titre, texte: corps, auteur, date, lieu, note: Math.min(5, Math.max(1, note)), photoOrigine: photo };
}

(async () => {
  console.log('Site :', BASE);
  const p1 = await get(BASE + '/temoignages/');
  if (!p1) throw new Error('Page Témoignages inaccessible.');
  const nb = Math.max(1, ...[...p1.matchAll(/\/temoignages\/page\/(\d+)\//g)].map(m => +m[1]));
  console.log(nb, 'pages d’avis');
  const pages = [p1];
  for (let n = 2; n <= nb; n++) { const h = await get(`${BASE}/temoignages/page/${n}/`); if (h) pages.push(h); }
  const vus = new Map();
  for (const h of pages) for (const b of blocs(h)) if (!vus.has(b.id)) vus.set(b.id, lireAvis(b));
  console.log(vus.size, 'avis');

  /* bandeau de logos (page 1) : <div class="entreprise"><a href="…"><img src="…" alt="NOM"></a></div> */
  const logos = [];
  for (const m of p1.matchAll(/<div class="entreprise">\s*<a href="([^"]+)"[^>]*>\s*<img[^>]*?src="([^"]+)"[^>]*?alt="([^"]*)"/g)) {
    const href = decode(m[1]); let avisId = (href.match(/[?&]p=(\d+)/) || [])[1] || '';
    if (!avisId) { const h = await get(href); avisId = h ? ((h.match(/postid-(\d+)/) || h.match(/wpmtst-testimonial testimonial post-(\d+)/) || [])[1] || '') : ''; if (h && avisId && !vus.has(avisId)) { const b = blocs(h)[0]; if (b) vus.set(b.id, lireAvis(b)); } }
    logos.push({ nom: decode(m[3]).trim(), logoOrigine: m[2], avisId });
  }
  console.log(logos.length, 'logos');

  /* images copiées dans public/site/avis/ */
  fs.mkdirSync(DIR, { recursive: true });
  const local = async u => {
    if (!u) return '';
    const big = u.replace(/-\d+x\d+(\.\w+)$/, '$1');
    const ext = (path.extname(big.split('?')[0]) || '.jpg').toLowerCase();
    const nom = crypto.createHash('sha1').update(big).digest('hex').slice(0, 16) + ext;
    const dest = path.join(DIR, nom);
    if (!fs.existsSync(dest)) { const buf = (await get(big, true)) || (await get(u, true)); if (!buf) return ''; fs.writeFileSync(dest, buf); }
    return '/site/avis/' + nom;
  };
  const avis = [...vus.values()];
  for (const a of avis) { a.photo = await local(a.photoOrigine); delete a.photoOrigine; }
  for (const l of logos) { l.logo = await local(l.logoOrigine); delete l.logoOrigine; }

  const data = { source: BASE + '/temoignages/', recupereLe: new Date().toISOString(), logos: logos.filter(l => l.logo), avis };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  console.log('Écrit :', path.relative(ROOT, OUT), data.avis.length, 'avis,', data.logos.length, 'logos');
})().catch(e => { console.error(e); process.exit(1); });
