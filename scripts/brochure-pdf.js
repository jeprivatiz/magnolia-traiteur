'use strict';
/* Fabrique le PDF de la brochure à partir de la page /brochure d'un site en marche.
   node scripts/brochure-pdf.js <adresse du site> [adresse des QR codes] [fichier PDF]
   ex. node scripts/brochure-pdf.js https://magnolia-traiteur-production.up.railway.app
   Il faut Playwright (npm i --no-save playwright && npx playwright install chromium) ; le site lui-même n'en dépend pas.
   Le script signale les pages dont un texte dépasse de son cadre. */
const path = require('path');

(async () => {
  const site = String(process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');
  const base = String(process.argv[3] || site).replace(/\/+$/, '');
  const sortie = process.argv[4] || path.join(__dirname, '..', 'public', 'magnolia-traiteur-brochure.pdf');
  const { chromium } = require('playwright');
  const nav = await chromium.launch();
  const page = await nav.newPage({ viewport: { width: 1000, height: 1400 } });
  const url = `${site}/brochure?impression&base=${encodeURIComponent(base)}`;
  const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
  if (!r || !r.ok()) throw new Error('Page /brochure introuvable : ' + (r && r.status()));
  await page.evaluate(() => document.fonts.ready);
  /* toutes les photos chargées (sinon la page partirait avec des trous) */
  await page.evaluate(async () => { await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok; }))); });
  const soucis = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.pg').forEach((pg, i) => {
      const bas = pg.getBoundingClientRect().bottom - pg.getBoundingClientRect().height * 0.03;
      const pied = pg.querySelector('.form-bas, .som-plus, .pg-f');
      const limite = pied ? pied.getBoundingClientRect().top : bas;
      pg.querySelectorAll('.compo, .cartes, .gammes, .accomp, .fdm, .etapes, .cmd-2, .som-l, .monde-g, .chiffres').forEach(b => {
        if (b.getBoundingClientRect().bottom > limite + 1) out.push(`page ${i + 1} : « ${b.className} » dépasse de ${Math.round(b.getBoundingClientRect().bottom - limite)} px`);
      });
      pg.querySelectorAll('.carte-b p, .compo').forEach(b => { if (b.scrollHeight > b.clientHeight + 2 && getComputedStyle(b).overflow === 'hidden') out.push(`page ${i + 1} : texte coupé`); });
    });
    const sansPhoto = [...document.images].filter(i => !i.naturalWidth).map(i => i.getAttribute('src'));
    return { out, sansPhoto, pages: document.querySelectorAll('.pg').length };
  });
  const brut = sortie.replace(/\.pdf$/, '') + '-brut.pdf';
  await page.pdf({ path: brut, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await nav.close();
  /* photos ramenées à 150 dpi (Ghostscript) : un PDF léger à envoyer par e-mail, les liens des QR codes restent cliquables */
  const fs = require('fs'), { execFileSync } = require('child_process');
  try {
    execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.6', '-dPDFSETTINGS=/ebook',
      '-dDownsampleColorImages=true', '-dColorImageResolution=150', '-dColorImageDownsampleType=/Bicubic', '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode', '-dJPEGQ=82',
      '-sOutputFile=' + sortie, brut]);
    fs.unlinkSync(brut);
  } catch (e) { console.log('Ghostscript absent : PDF non compressé (' + e.message + ')'); fs.renameSync(brut, sortie); }
  console.log(`${(fs.statSync(sortie).size / 1048576).toFixed(1)} Mo`);
  console.log(`${soucis.pages} pages → ${sortie}`);
  for (const s of soucis.out) console.log('⚠ ' + s);
  for (const s of soucis.sansPhoto) console.log('⚠ photo non chargée : ' + s);
})().catch(e => { console.error(e); process.exit(1); });
