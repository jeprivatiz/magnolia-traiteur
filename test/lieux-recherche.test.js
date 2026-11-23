'use strict';
/* Page Lieux : recherche multicritère (localisation, type d'événement, type de lieu, convives, mot-clé). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('recherche multicritère de la page Lieux', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const nb = html => (html.match(/class="card" href="\/lieux\//g) || []).length;
  try {
    const c = await app.locals.catalogue.get();
    const visibles = c.lieux.filter(l => l.statut !== 'masque');
    assert.ok(visibles.every(l => l.type && l.departement), 'chaque lieu du brouillon a un type et un département');
    const tout = await (await fetch(base + '/lieux')).text();
    assert.match(tout, /class="lsearch"/);
    for (const lab of ['Localisation', 'Type d’événement', 'Type de lieu', 'Convives', 'Par mot-clé', 'Rechercher']) assert.ok(tout.includes(lab), lab);
    assert.equal(nb(tout), visibles.length);
    const peniches = await (await fetch(base + '/lieux?type=' + encodeURIComponent('Péniche à quai'))).text();
    assert.equal(nb(peniches), visibles.filter(l => l.type === 'Péniche à quai').length);
    const grands = await (await fetch(base + '/lieux?n=150&loc=75')).text();
    assert.equal(nb(grands), visibles.filter(l => l.departement === '75' && l.capacite >= 150).length);
    assert.ok(nb(grands) > 0 && nb(grands) < visibles.length);
    const mot = await (await fetch(base + '/lieux?q=montmartre')).text();
    assert.equal(nb(mot), 1);
    const rien = await (await fetch(base + '/lieux?q=zzzz')).text();
    assert.equal(nb(rien), 0); assert.match(rien, /Aucun lieu/);
  } finally { srv.close(); }
});
