'use strict';
/* Titres et descriptions « dans Google » remplis pour tout le catalogue (Jean-Luc, 2026-11-24) ; jamais un texte tapé à la main écrasé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const silence = { log() {}, warn() {}, error() {}, info() {} };
const envDe = dir => ({ DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' });

async function demarrer(dir, iaAsk) {
  const { createApp } = require('../server/index');
  const app = await createApp({ env: envDe(dir), noTimers: true, log: silence, iaAsk });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
  return { app, srv, base, call };
}

test('toutes les fiches ont un titre et une description Google conformes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { app, srv, base, call } = await demarrer(dir);
  try {
    const c = await app.locals.catalogue.get();
    const fiches = [...c.produits, ...c.rubriques, ...c.rubriques.flatMap(r => r.sous || [])];
    assert.ok(fiches.length > 300);
    for (const o of fiches) {
      const nom = o.titre || o.nom;
      assert.ok(o.seoTitre && o.seoTitre.length <= 60, `titre ${nom} : ${o.seoTitre}`);
      assert.ok(o.seoDescription && o.seoDescription.length <= 158 && o.seoDescription.length >= 40, `description ${nom} : ${o.seoDescription}`);
      assert.doesNotMatch(o.seoTitre, /paris\s+et\s+(en\s+)?[îi]le/i, nom);
      assert.doesNotMatch(o.seoTitre + ' ' + o.seoDescription, /himalaya|partenaire|fournisseur|sur devis/i, nom);
    }
    const titres = new Set(c.produits.filter(p => p.statut !== 'masque').map(p => p.seoTitre));
    assert.ok(titres.size > c.produits.filter(p => p.statut !== 'masque').length * 0.97, 'titres presque tous différents');
    /* page produit : le titre Google sert de <title>, sans « Magnolia Traiteur » en double */
    const p = c.produits.find(x => x.statut !== 'masque' && x.sous === 'buffet-antillais');
    const html = await (await fetch(`${base}/${p.rubrique}/${p.slug}`)).text();
    assert.ok(html.includes('<title>' + p.seoTitre.replace(/&/g, '&amp;').replace(/'/g, '&#39;') + '</title>'), html.match(/<title>.*<\/title>/)?.[0]);
    assert.ok(html.includes('name="description" content="'));

    /* texte écrit à la main : gardé, même après un redémarrage */
    const fiche = (await call('/api/admin/produits/' + p.slug)).j;
    await call('/api/admin/produits/' + p.slug, { method: 'PUT', body: { ...fiche, seoTitre: 'Mon titre à moi', seoDescription: '' } });
    let apres = (await call('/api/admin/produits/' + p.slug)).j;
    assert.equal(apres.seoTitre, 'Mon titre à moi');
    assert.ok(apres.seoDescription.length > 40, 'case vidée = remplie à nouveau');
    assert.ok(!('titre' in apres.seoAuto));
    await app.locals.remplirSeo();
    assert.equal((await call('/api/admin/produits/' + p.slug)).j.seoTitre, 'Mon titre à moi');

    /* nouveau produit : textes posés tout seuls, au nom du produit */
    const n = (await call('/api/admin/produits', { method: 'POST', body: { titre: 'Velouté de giraumon', rubrique: 'carte-magnolia', prixCents: 790, unite: 'portion', min: 5 } })).j;
    const np = (await call('/api/admin/produits/' + n.id)).j;
    assert.match(np.seoTitre, /^Velouté de giraumon/);
    assert.match(np.seoDescription, /7,90 € TTC la portion/);
    /* renommé : les textes automatiques suivent le nouveau nom */
    await call('/api/admin/produits/' + n.id, { method: 'PUT', body: { ...np, titre: 'Velouté de potiron' } });
    assert.match((await call('/api/admin/produits/' + n.id)).j.seoTitre, /^Velouté de potiron/);

    /* bouton « ✨ Proposer avec l'IA » sans clé : proposition du modèle simple */
    const pr = (await call('/api/admin/ia/seo', { method: 'POST', body: { type: 'sous', rubrique: 'saveurs-du-monde', slug: 'buffet-antillais' } })).j;
    assert.equal(pr.ia, false); assert.match(pr.titre, /antillais/i);
  } finally { srv.close(); }
});

test('l’IA réécrit les textes automatiques, jamais ceux tapés à la main', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  let appels = 0;
  const iaAsk = prompt => {
    appels++;
    const slugs = [...prompt.matchAll(/^([a-z0-9-]+) \| /gm)].map(m => m[1]);
    return JSON.stringify(slugs.map(s => ({ slug: s, titre: 'Essai ' + s.slice(0, 20) + ' | Magnolia Traiteur', description: 'Une description rédigée par l’IA pour ' + s.slice(0, 40) + ', avec livraison 7 j/7 en Île-de-France pour vos réceptions.' })));
  };
  const { app, srv, call } = await demarrer(dir, iaAsk);
  try {
    const c = await app.locals.catalogue.get();
    const [a, b] = c.produits.filter(p => p.statut !== 'masque').slice(0, 2);
    const fb = (await call('/api/admin/produits/' + b.slug)).j;
    await call('/api/admin/produits/' + b.slug, { method: 'PUT', body: { ...fb, seoDescription: 'Ma description écrite à la main, à ne pas toucher.' } });
    await app.locals.seoIa();
    assert.ok(appels > 0);
    const pa = (await call('/api/admin/produits/' + a.slug)).j, pb = (await call('/api/admin/produits/' + b.slug)).j;
    assert.match(pa.seoTitre, /^Essai /); assert.match(pa.seoDescription, /rédigée par l’IA/); assert.equal(pa.seoAuto.ia, true);
    assert.match(pb.seoTitre, /^Essai /);
    assert.equal(pb.seoDescription, 'Ma description écrite à la main, à ne pas toucher.');
    /* une deuxième passe ne redemande rien */
    const n = appels; await app.locals.seoIa(); assert.equal(appels, n);
  } finally { srv.close(); }
});

test('réponse de l’IA contrôlée', () => {
  const SEO = require('../server/seo');
  assert.equal(SEO.titreValide('Buffet antillais à Paris et en Île-de-France | Magnolia'), null);
  assert.equal(SEO.titreValide('Buffet indien du Palais de l’Himalaya'), null);
  assert.equal(SEO.titreValide('x'.repeat(70)), null);
  assert.equal(SEO.titreValide('Accras de morue, traiteur antillais'), 'Accras de morue, traiteur antillais | Magnolia Traiteur');
  assert.equal(SEO.descriptionValide('Trop court.'), null);
  for (const [t, d] of Object.values({ ...SEO.RUB, ...SEO.SOUS })) { assert.ok(t.length <= 60, t); assert.ok(d.length <= 158, d); }
});
