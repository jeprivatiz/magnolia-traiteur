'use strict';
/* Supprimer des produits cochés dans le catalogue (Jean-Luc 2026-11-25) : ils disparaissent du site,
   ne reviennent pas au redémarrage ni par un vieil onglet, « Annuler » les remet. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function demarrer(dir) {
  delete require.cache[require.resolve('../server/index')];
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
  return { srv, call };
}

test('supprimer « Votre événement sur mesure » et « Petit Cocktail Festif » : définitif, puis Annuler', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-psup-'));
  const ids = ['votre-evenement-sur-mesure', 'petit-cocktail-festif'];
  let { srv, call } = await demarrer(dir);
  let lot;
  try {
    const avant = (await call('/api/admin/produits')).j;
    for (const id of ids) assert.ok(avant.some(p => p.id === id || p.slug === id), id + ' existe au départ');
    assert.equal((await call('/cocktails-buffets/votre-evenement-sur-mesure')).status, 200);
    const old = (await call('/api/admin/produits/votre-evenement-sur-mesure')).j;
    const r = await call('/api/admin/actions/produits/supprimer', { method: 'POST', body: { ids } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.equal(r.j.supprimes, 2); lot = r.j.lot;
    const apres = (await call('/api/admin/produits')).j;
    assert.equal(apres.length, avant.length - 2);
    assert.equal((await call('/cocktails-buffets/votre-evenement-sur-mesure')).status, 404);
    assert.ok(!String((await call('/cocktails-buffets')).j).includes('Votre événement sur mesure'));
    /* un vieil onglet qui enregistre la fiche ne la recrée pas */
    const put = await call('/api/admin/produits/votre-evenement-sur-mesure', { method: 'PUT', body: old });
    assert.equal(put.status, 410);
    /* une nouvelle fiche du même nom reçoit une autre adresse */
    const neuf = await call('/api/admin/produits', { method: 'POST', body: { titre: 'Votre événement sur mesure', rubrique: 'cocktails-buffets' } });
    assert.notEqual(neuf.j.id, 'votre-evenement-sur-mesure');
  } finally { srv.close(); }
  /* redémarrage (comme un redéploiement) : les fiches ne reviennent pas */
  ({ srv, call } = await demarrer(dir));
  try {
    const l = (await call('/api/admin/produits')).j;
    for (const id of ids) assert.ok(!l.some(p => p.id === id || p.slug === id), id + ' reste supprimé');
    const re = await call(`/api/admin/actions/produits/supprimer/${lot}/remettre`, { method: 'POST' });
    assert.equal(re.status, 200, JSON.stringify(re.j));
    assert.equal(re.j.remis, 2);
    assert.equal((await call('/cocktails-buffets/votre-evenement-sur-mesure')).status, 200);
    assert.equal((await call(`/api/admin/actions/produits/supprimer/${lot}/remettre`, { method: 'POST' })).status, 404);
  } finally { srv.close(); }
});
