'use strict';
/* Effacer des contacts cochés : protégés si demande/devis/facture, droit dédié, « Remettre ». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ecrireXlsx, lireTableau } = require('../server/tableur');
const { construire, normTel, fichierModele } = require('../server/import-clients');
const { FileStore } = require('../server/store');

async function demarrer(dir) {
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, r };
  };
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
  const deposer = async (buf, nom) => { const fd = new FormData(); fd.append('fichier', new Blob([buf]), nom); return call('/api/admin/actions/import-clients/fichier', { method: 'POST', form: fd }); };
  const importer = async (tok, colonnes) => { let debut = 0, r; do { r = await call('/api/admin/actions/import-clients/lot', { method: 'POST', body: { tok, colonnes, debut, consentement: true } }); assert.equal(r.status, 200, JSON.stringify(r.j)); debut = r.j.fait; } while (!r.j.fini); return r.j; };
  return { app, srv, call, deposer, importer };
}

test('effacer des contacts cochés, puis les remettre', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-eff-'));
  const { srv, call } = await demarrer(dir);
  try {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await call('/api/admin/clients', { method: 'POST', body: { nom: 'Test ' + i, email: `t${i}@exemple.fr`, source: 'back-office' } })).j.id);
    /* le contact 0 a un devis : protégé */
    const dv = await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: ids[0] } });
    assert.equal(dv.status, 200, JSON.stringify(dv.j));
    const l = (await call('/api/admin/clients?page=1&par=50&avecIds=1')).j;
    assert.equal(l.items.find(c => c.id === ids[0]).verrou, true);
    assert.equal(l.effacables.length, 4);
    const r = await call('/api/admin/actions/effacer-clients', { method: 'POST', body: { ids } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.equal(r.j.effaces, 4); assert.equal(r.j.gardes, 1);
    assert.equal((await call('/api/admin/clients?page=1')).j.tous, 1);
    assert.equal((await call('/api/admin/clients/' + ids[1])).status, 404);
    const re = await call(`/api/admin/actions/effacer-clients/${r.j.lot}/remettre`, { method: 'POST' });
    assert.equal(re.j.remis, 4);
    assert.equal((await call('/api/admin/clients?page=1')).j.tous, 5);
    assert.equal((await call('/api/admin/clients/' + ids[1])).j.email, 't1@exemple.fr');
    assert.equal((await call(`/api/admin/actions/effacer-clients/${r.j.lot}/remettre`, { method: 'POST' })).status, 404, 'une seule fois');
  } finally { srv.close(); }
});
