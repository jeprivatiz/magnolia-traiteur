'use strict';
/* Page Entreprises (page d'arrivée publicité « traiteur entreprise », 2026-11-28) : page, menu, demande marquée Entreprise */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('page Entreprises et demande entreprise', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, redirect: 'manual', headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, loc: r.headers.get('location') };
  };
  try {
    const pg = await call('/entreprises');
    assert.equal(pg.status, 200);
    for (const t of ['Traiteur pour les entreprises', 'Chorus Pro', 'Livraison 7 j/7', 'interlocuteur dédié', 'data-entreprise', 'href="/petits-dejeuners"', 'href="/boissons"', 'href="/lieux"', 'FAQPage', 'coffret-bois-9-cases.webp']) assert.ok(pg.j.includes(t), t);
    assert.ok((await call('/')).j.includes('href="/entreprises"'), 'lien depuis l’accueil et le menu');
    assert.equal((await call('/traiteur-entreprise')).loc, '/entreprises');

    // sans société : refusé
    assert.equal((await call('/api/demandes', { method: 'POST', body: { entreprise: true, nom: 'Paul Durand', email: 'paul@societe.test', lignes: [] } })).status, 400);
    const d = await call('/api/demandes', { method: 'POST', body: { entreprise: true, societe: 'Société Test', nom: 'paul durand', email: 'paul@societe.test', tel: '0612345678', evenement: 'Séminaire', date: '2027-03-10', invites: 80, cp: '92100', paiement: 'Chorus Pro', message: 'Séminaire avec déjeuner', lignes: [] } });
    assert.equal(d.status, 200, JSON.stringify(d.j));
    assert.ok(d.j.ref);

    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const dem = (await call('/api/admin/demandes')).j;
    assert.equal(dem.length, 1);
    assert.equal(dem[0].entreprise, true);
    assert.equal(dem[0].type, 'devis');
    assert.equal(dem[0].paiement, 'Chorus Pro');
    assert.equal(dem[0].contact.societe, 'Société Test');
    assert.equal(dem[0].evenement.invites, 80);
    assert.equal(dem[0].canal, 'Site · page Entreprises');
    assert.equal(dem[0].devisAuto?.envoye, false);
  } finally { srv.close(); }
});
