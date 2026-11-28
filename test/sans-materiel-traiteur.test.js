'use strict';
/* La fiche « Matériel traiteur » est retirée du site (Jean-Luc, 2026-11-28) : plus de vignette, son adresse mène à Les indispensables. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('fiche Matériel traiteur retirée, adresse redirigée', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const c = await app.locals.catalogue.get();
    const p = c.bySlug.get('materiel-traiteur');
    assert.ok(p, 'fiche gardée en base');
    assert.equal(p.statut, 'masque');
    const r = await fetch(base + '/indispensables/materiel-traiteur', { redirect: 'manual' });
    assert.equal(r.status, 301); assert.equal(r.headers.get('location'), '/indispensables');
    for (const u of ['/indispensables', '/mobilier-a-la-location', '/indispensables/tente-de-reception-4-4-m', '/boutique']) {
      const h = await (await fetch(base + u)).text();
      assert.doesNotMatch(h, /href="[^"]*\/materiel-traiteur"/, u);
    }
    for (const s of ['etuve-chauffante-ventilee-10-niveaux', 'verres-a-vin']) assert.notEqual(c.bySlug.get(s)?.statut, 'masque', s + ' reste en ligne');
  } finally { srv.close(); }
});
