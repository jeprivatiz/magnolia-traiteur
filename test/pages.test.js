'use strict';
/* Les pages publiques principales répondent (garde-fou contre une page cassée par une retouche). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('pages publiques principales en 200', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  try {
    const c = await app.locals.catalogue.get();
    const pages = ['/', '/boutique', '/boutique?q=paella', '/lieux', '/maison', '/temoignages', '/livraison', '/comment-commander', '/contact', '/ma-selection', '/espace-client', '/cgv'];
    for (const r of c.rubriques.filter(x => x.statut !== 'masque')) {
      pages.push('/' + r.slug);
      for (const x of r.sous || []) pages.push(`/${r.slug}/${x.slug}`);
    }
    const p = c.produits.find(x => x.statut !== 'masque'); if (p) pages.push(`/${p.rubrique}/${p.slug}`);
    const l = c.lieux[0]; if (l) pages.push('/lieux/' + l.slug);
    for (const u of pages) {
      const r = await fetch(base + u, { redirect: 'manual' });
      assert.ok(r.status === 200 || r.status === 301, `${u} → ${r.status}`);
    }
    /* le sur-titre « Un voyage à votre table » ne doit pas être collé au bandeau photo */
    const sm = await (await fetch(base + '/saveurs-du-monde')).text();
    if (sm.includes('id="specialites"')) assert.match(sm, /class="[^"]*apres-bandeau[^"]*" id="specialites"/, 'espace sous le bandeau de Saveurs du monde');
  } finally { srv.close(); }
});
