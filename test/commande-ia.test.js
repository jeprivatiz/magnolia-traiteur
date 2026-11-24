'use strict';
/* « ✨ Commande avec l'IA » du Suivi client : l'IA est simulée ; on vérifie fiche, catalogue, minimums et devis créé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('commande avec l’IA : fiche → prestations → demande + devis', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  let produit = null; const prompts = [];
  const iaAsk = async p => {
    prompts.push(p);
    if (/fiche client/.test(p)) return 'Voici : {"prenom":"Sophie","nom":"Durand","tel":"06 12 34 56 78","email":"Sophie.Durand@example.test","type":"Anniversaire","date":"2027-03-14","invites":40,"cp":"91300","ville":"Massy","serveurs":2,"heures":3,"vaisselle":"grand","notes":"sans porc","budget":null}';
    return JSON.stringify([{ slug: produit.slug, qte: 1, note: 'accras', pourquoi: 'demandé' }, { slug: 'n-existe-pas', qte: 3 }, { slug: produit.slug, qte: 50 }]);
  };
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, iaAsk, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    const c = await app.locals.catalogue.get();
    produit = c.produits.find(p => p.statut !== 'masque' && p.prixCents > 0 && (p.min || 1) >= 5);
    assert.ok(produit);
    assert.equal((await call('/api/admin/ia/fiche', { method: 'POST', body: { texte: 'x' } })).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    assert.equal((await call('/api/admin/ia/etat')).j.actif, true);

    const f = await call('/api/admin/ia/fiche', { method: 'POST', body: { texte: 'Sophie Durand 40 personnes à Massy le 14 mars, buffet antillais' } });
    assert.equal(f.status, 200, JSON.stringify(f.j));
    assert.equal(f.j.fiche.email, 'sophie.durand@example.test');
    assert.equal(f.j.fiche.invites, 40);

    const pr = await call('/api/admin/ia/produits', { method: 'POST', body: { fiche: f.j.fiche, texte: 'buffet' } });
    assert.equal(pr.status, 200, JSON.stringify(pr.j));
    assert.ok(/min \d+/.test(prompts[1]) && /TTC/.test(prompts[1]), 'catalogue avec prix TTC et minimums envoyé à l’IA');
    assert.ok(!/coutCents|Palais de l/i.test(prompts[1]), 'ni coût ni fournisseur dans le prompt');
    assert.equal(pr.j.articles.length, 1, 'prestation inconnue et doublon écartés');
    assert.equal(pr.j.articles[0].qte, produit.min, 'quantité remontée au minimum');

    const cmd = await call('/api/admin/actions/commande-ia', { method: 'POST', body: { fiche: f.j.fiche, km: 24, texte: 'buffet', articles: [{ slug: produit.slug, qte: 2, note: 'accras' }] } });
    assert.equal(cmd.status, 200, JSON.stringify(cmd.j));
    const dv = (await call('/api/admin/devis/' + cmd.j.devisId)).j;
    const l = dv.lignes.find(x => x.produit === produit.slug);
    assert.equal(l.qte, produit.min, 'minimum respecté dans le devis');
    assert.equal(l.puCents, produit.prixCents);
    assert.ok(dv.lignes.some(x => /personnel/i.test(x.designation) && x.qte === 2 * 4), 'personnel : 4 h minimum');
    assert.ok(dv.lignes.some(x => /Grand Pack/.test(x.designation) && x.qte === 40), 'pack vaisselle pour 40');
    assert.ok(dv.lignes.some(x => /livraison/i.test(x.designation) && x.qte === 24));
    assert.equal(dv.iaDraft, true);
    const dem = (await call('/api/admin/demandes/' + cmd.j.demandeId)).j;
    assert.equal(dem.source, 'Téléphone (IA)');
    assert.equal(dem.contact.nom, 'Sophie DURAND', 'fiche en « Prénom NOM »');
    const cl = (await call('/api/admin/clients/' + dem.clientId)).j;
    assert.equal(cl.tel, '06 12 34 56 78');
    /* société corrigée dans la fiche client → reportée sur la demande (carte du Suivi client) */
    assert.equal((await call('/api/admin/clients/' + dem.clientId, { method: 'PUT', body: { ...cl, societe: 'Société corrigée' } })).status, 200);
    assert.equal((await call('/api/admin/demandes/' + cmd.j.demandeId)).j.contact.societe, 'Société corrigée');
    assert.equal((await call('/api/admin/actions/commande-ia', { method: 'POST', body: { fiche: {}, articles: [] } })).status, 400);
  } finally { srv.close(); }
});

test('sans clé ANTHROPIC_API_KEY : message clair', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0), base = 'http://127.0.0.1:' + srv.address().port;
  try {
    let r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mg': '1' }, body: JSON.stringify({ email: 'chef@magnolia.test', password: 'mot-de-passe-essai' }) });
    const cookie = r.headers.get('set-cookie').split(';')[0];
    r = await fetch(base + '/api/admin/ia/fiche', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: JSON.stringify({ texte: 'Sophie Durand 40 personnes' }) });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /ANTHROPIC_API_KEY/);
  } finally { srv.close(); }
});
