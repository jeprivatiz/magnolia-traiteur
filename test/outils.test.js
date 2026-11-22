'use strict';
/* Mot de passe oublié, avis clients avec modération, export et mise à jour du catalogue par fichier. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('outils du back-office', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, t };
  };
  const store = app.locals.store;
  try {
    // mot de passe oublié : même réponse pour un compte inconnu ; le lien remplace le mot de passe
    assert.equal((await call('/api/auth/forgot', { method: 'POST', body: { email: 'inconnu@x.test' } })).status, 200);
    assert.equal((await call('/api/auth/forgot', { method: 'POST', body: { email: 'chef@magnolia.test' } })).status, 200);
    const mail = (await store.list('_outbox')).map(d => d.data).find(e => /nouveau mot de passe/i.test(e.payload?.subject || ''));
    const tok = mail.payload.htmlContent.match(/reset=([\w-]+)/)[1];
    assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token: tok, password: 'court' } })).status, 400);
    assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token: tok, password: 'nouveau-mot-de-passe' } })).status, 200);
    assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token: tok, password: 'nouveau-mot-de-passe' } })).status, 400, 'lien à usage unique');
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'nouveau-mot-de-passe' } })).status, 200);

    // avis : en attente, invisible tant que l'équipe ne l'a pas publié
    assert.equal((await call('/api/avis', { method: 'POST', body: { auteur: 'Claire, Massy', email: 'c@x.test', note: 5, evenement: 'Anniversaire', texte: 'Un buffet magnifique, tout le monde a adoré !' } })).status, 200);
    let page = await fetch(base + '/temoignages').then(r => r.text());
    assert.doesNotMatch(page, /Un buffet magnifique/);
    const av = (await call('/api/admin/avis')).j.find(a => a.statut === 'attente');
    await call('/api/admin/avis/' + av.id, { method: 'PUT', body: { ...av, statut: 'visible' } });
    page = await fetch(base + '/temoignages').then(r => r.text());
    assert.match(page, /Un buffet magnifique/);

    // export du catalogue puis mise à jour d'un prix par fichier
    const ex = await call('/api/admin/actions/export/catalogue');
    assert.match(ex.t, /^\ufeff?Code \(ne pas modifier\);Prestation/);
    const p = (await app.locals.catalogue.get()).produits.find(x => x.prixCents > 0);
    const r = await call('/api/admin/actions/import-catalogue', { method: 'POST', body: { lignes: [{ code: p.slug, prix: '99,50', cout: '' }, { code: 'nexiste-pas', prix: '1' }, { code: p.slug, prix: '10', cout: '20' }] } });
    assert.equal(r.j.maj, 1);
    assert.equal(r.j.erreurs.length, 2);
    assert.equal((await store.get('produits/' + p.slug)).prixCents, 9950);
  } finally { srv.close(); }
});
