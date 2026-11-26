'use strict';
/* Description sous la photo rédigée par l'IA et bouton « ✨ Améliorer avec l'IA » (Jean-Luc, 2026-11-24). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('description sous la photo posée par l’IA sur les fiches vides, jamais sur un texte tapé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const prompts = [];
  const iaAsk = prompt => {
    prompts.push(prompt);
    const slugs = [...prompt.matchAll(/^([a-z0-9-]+) \| /gm)].map(m => m[1]);
    if (prompt.includes('le petit texte affiché sous la photo')) return JSON.stringify(slugs.map(s => ({ slug: s, texte: `Un texte appétissant pour ${s}, à partager entre invités lors de vos réceptions. Idéal pour un cocktail comme pour un buffet.` })));
    if (prompt.includes('donne envie au client de commander')) return JSON.stringify({ lignes: ['**Accroche** gourmande : des accras croustillants à partager pour vos réceptions.'] });
    if (prompt.includes('Tu améliores un texte')) return JSON.stringify({ lignes: ['**NOS PIÈCES**', 'Une version enrichie, claire et gourmande, de la description actuelle.'] });
    return '[]';
  };
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} }, iaAsk });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const c = await app.locals.catalogue.get();
    const vides = c.produits.filter(p => p.statut !== 'masque' && !(p.sousPhoto || []).length);
    const [a, b] = vides;
    const fb = (await call('/api/admin/produits/' + b.slug)).j;
    await call('/api/admin/produits/' + b.slug, { method: 'PUT', body: { ...fb, sousPhoto: ['Mon texte à moi.'] } });
    const ancienA = (await call('/api/admin/produits/' + a.slug)).j; /* fiche ouverte avant le passage de l'IA */
    await app.locals.seoIa();
    const pa = (await call('/api/admin/produits/' + a.slug)).j;
    assert.match(pa.sousPhoto[0], /^Un texte appétissant pour /);
    assert.equal(pa.sousPhotoAuto.texte, pa.sousPhoto[0]);
    assert.deepEqual((await call('/api/admin/produits/' + b.slug)).j.sousPhoto, ['Mon texte à moi.']);
    /* la fiche ouverte avant, enregistrée ensuite, ne l'efface pas */
    await call('/api/admin/produits/' + a.slug, { method: 'PUT', body: { ...ancienA, extrait: 'modifié' } });
    assert.match((await call('/api/admin/produits/' + a.slug)).j.sousPhoto[0], /^Un texte appétissant/);
    /* vidée volontairement ensuite : pas remise */
    const pa2 = (await call('/api/admin/produits/' + a.slug)).j;
    await call('/api/admin/produits/' + a.slug, { method: 'PUT', body: { ...pa2, sousPhoto: [] } });
    const nSp = () => prompts.filter(x => x.includes('le petit texte affiché sous la photo')).length;
    const n = nSp(); await app.locals.seoIa();
    assert.deepEqual((await call('/api/admin/produits/' + a.slug)).j.sousPhoto, []);
    assert.equal(nSp(), n, 'rien à redemander');
    /* le prompt ne contient pas de prix ni le nom d'un fournisseur */
    const ps = prompts.find(x => x.includes('sous la photo'));
    assert.doesNotMatch(ps, /himalaya/i);
    /* bouton « Améliorer avec l'IA » */
    const r1 = (await call('/api/admin/ia/texte-produit', { method: 'POST', body: { id: a.slug, champ: 'sousPhoto', lignes: ['Texte actuel'] } })).j;
    assert.deepEqual(r1.lignes, ['**NOS PIÈCES**', 'Une version enrichie, claire et gourmande, de la description actuelle.']);
    /* Description : une phrase d'accroche écrite d'après la Description sous la photo (Jean-Luc, 2026-11-26) */
    const r2 = (await call('/api/admin/ia/texte-produit', { method: 'POST', body: { id: a.slug, champ: 'description', lignes: 'Texte actuel', sousPhoto: '**NOS MINI PIÈCES**\n- Accras de morue\n- Boudin créole' } })).j;
    assert.equal(r2.lignes[0], 'Accroche gourmande : des accras croustillants à partager pour vos réceptions.', 'pas de gras dans la Description');
    const pd = prompts.at(-1);
    assert.ok(pd.includes('Texte actuel') && pd.includes('NOS MINI PIÈCES\nAccras de morue\nBoudin créole'), 'la description sous la photo est la source');
    assert.doesNotMatch(pd, /\*\*|^- Accras/m);
  } finally { srv.close(); }
});

test('contrôle des textes de l’IA', () => {
  const T = require('../server/textes');
  assert.equal(T.texteValide('Trop court.'), null);
  assert.equal(T.texteValide('Un buffet préparé par le restaurant de notre partenaire, servi chaud pour vos invités lors de toutes vos réceptions.'), null);
  assert.ok(T.texteValide('Un buffet généreux et coloré, servi chaud pour vos invités, idéal pour vos mariages, anniversaires et soirées d’entreprise.'));
});
