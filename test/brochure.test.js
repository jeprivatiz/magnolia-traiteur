'use strict';
/* Brochure sans prix (Jean-Luc, 2026-11-27) : aucun prix, des QR codes vers le site, l'enceinte L1 Pro créée. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');

test('brochure : QR codes, aucun prix, adresses courtes /b/', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const r = await fetch(base + '/brochure?base=https://exemple.fr');
    assert.equal(r.status, 200);
    const h = await r.text();
    const texte = h.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(texte, /\d+,\d\d\s*€|€\s*TTC|Sur devis/i, 'aucun prix dans la brochure');
    assert.ok((h.match(/class="qr-svg"/g) || []).length > 150, 'un QR code à la place de chaque prix');
    assert.match(h, /href="https:\/\/exemple\.fr\/b\/grand-cocktail-magnolia"/);
    assert.ok((h.match(/class="pg /g) || []).length >= 40);
    const loc = async k => (await fetch(base + '/b/' + k, { redirect: 'manual' })).headers.get('location');
    assert.equal(await loc('grand-cocktail-magnolia'), '/cocktails-buffets/grand-cocktail-magnolia');
    assert.equal(await loc('buffet-antillais'), '/saveurs-du-monde/buffet-antillais');
    assert.equal(await loc('enceinte-bose-l1-pro'), '/musique-animations/enceinte-bose-l1-pro');
    assert.equal(await loc('lieux'), '/lieux');
    const c = await app.locals.catalogue.get();
    assert.equal(c.bySlug.get('enceinte-bose-l1-pro').prixCents, 7200);
    const acc = await (await fetch(base + '/')).text();
    assert.match(acc, /Télécharger notre brochure/);
  } finally { srv.close(); }
});
