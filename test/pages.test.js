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
    const pages = ['/', '/boutique', '/boutique?q=paella', '/lieux', '/maison', '/temoignages', '/zone-de-livraison', '/comment-commander', '/contact', '/ma-selection', '/espace-client', '/cgv'];
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
    /* « zone de livraison » tapé dans la recherche (téléphone ou ordinateur) mène à la page */
    for (const q of ['zone de livraison', 'Zones de livraison', 'livraison']) {
      const r = await fetch(base + '/boutique?q=' + encodeURIComponent(q), { redirect: 'manual' });
      assert.equal(r.status, 302, q); assert.equal(r.headers.get('location'), '/zone-de-livraison', q);
    }
    assert.equal((await fetch(base + '/livraison', { redirect: 'manual' })).headers.get('location'), '/zone-de-livraison');
    const api = await (await fetch(base + '/api/recherche?q=zone%20de%20liv')).json();
    assert.equal(api.resultats[0].href, '/zone-de-livraison');
        /* le sur-titre « Un voyage à votre table » ne doit pas être collé au bandeau photo */
    const sm = await (await fetch(base + '/saveurs-du-monde')).text();
    assert.match(sm, /class="sm-globe" id="specialites"/, 'globe 3D sous le bandeau de Saveurs du monde');
    const nSpe = (sm.match(/class="sm-pave[ "]/g) || []).length;
    assert.ok(nSpe >= 3, 'chaque spécialité a son pavé à gauche du globe');
    assert.ok(!/class="sm-pave on"/.test(sm), 'aucun pays coché à l’arrivée');
    assert.match(sm, /class="phero[^"]*"><video src="\/site\/v\/monde\/chefs.mp4" poster="\/site\/v\/monde\/chefs.jpg"[^>]*muted[^>]*loop[^>]*playsinline/, "bandeau d’arrivée : vidéo des chefs du monde");
    assert.match(sm, /data-sm-act="3d"[\s\S]*data-sm-act="tour"[\s\S]*data-sm-act="reset"/, 'boutons Vue 3D, Rotation, Recentrer');
    assert.match(sm, /class="sm-phrase"/, 'phrase de présentation de la cuisine sous le nom du pays');
  } finally { srv.close(); }
});
