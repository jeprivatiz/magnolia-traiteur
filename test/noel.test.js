'use strict';
/* Menu de Noël antillais (Jean-Luc, 2026-11-28) : pavé sur la page antillaise, rubrique commandable, prix +30 %, retrait le 5 janvier 2027 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../server/noel');

const silence = { log() {}, warn() {}, error() {}, info() {} };
const envDe = dir => ({ DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' });

test('prix de vente = prix de la carte + 30 %, arrondi aux 10 c supérieurs', () => {
  assert.equal(N.vente(4000), 5200);
  assert.equal(N.vente(110), 150);
  assert.equal(N.vente(4700), 6110);
  assert.equal(N.vente(2000), 2600);
});

test('fin de l’offre le 5 janvier 2027 à minuit, heure de Paris', () => {
  const x = { finLe: '2027-01-05' };
  assert.equal(N.finAtteinte(x, Date.parse('2027-01-04T22:59:00Z')), false);
  assert.equal(N.finAtteinte(x, Date.parse('2027-01-04T23:00:00Z')), true);
  assert.equal(N.finAtteinte({}, Date.now()), false);
});

test('pavé sur la page antillaise, rubrique et fiches commandables, puis tout disparaît après le 4 janvier', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: envDe(dir), noTimers: true, log: silence });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  const vraiNow = Date.now;
  try {
    const antillais = await (await fetch(base + '/saveurs-du-monde/buffet-antillais')).text();
    assert.match(antillais, /class="noel"[^>]*href="\/menu-de-noel"/);
    assert.match(antillais, /Menu de Noël antillais/);
    const r = await fetch(base + '/menu-de-noel');
    assert.equal(r.status, 200);
    const page = await r.text();
    for (const t of ['Nos coffrets de fête', 'Les bouchées de fête, à la pièce', 'Les desserts de fête', 'Bûche coco et fruit de la passion']) assert.ok(page.includes(t), t);
    assert.doesNotMatch(page, /mbl/i);
    /* pas dans les menus de l'accueil */
    const accueil = await (await fetch(base + '/')).text();
    assert.doesNotMatch(accueil, /href="\/menu-de-noel"/);
    const c = await app.locals.catalogue.get();
    const buche = c.bySlug.get('buche-coco-passion');
    assert.equal(buche.prixCents, 5200); assert.equal(buche.coutCents, 4000);
    assert.equal(c.bySlug.get('pate-sale-boeuf-noel').min, 10);
    assert.match(c.bySlug.get('punch-coco-noel').titre, /1 litre/);
    assert.ok(buche.photos.length >= 1 && /images.pexels.com/.test(buche.photos[0].src), 'photo de la bûche');
    assert.ok(c.produits.filter(p => p.noel).every(p => p.photos.length), 'toutes les fiches ont une photo');
    assert.equal(c.bySlug.get('epaule-agneau-confite-noel').min, 6);
    const fiche = await fetch(base + '/menu-de-noel/buche-coco-passion');
    assert.equal(fiche.status, 200);
    assert.match(await fiche.text(), /52,00/);

    /* le 5 janvier 2027 : plus rien */
    Date.now = () => Date.parse('2027-01-05T08:00:00+01:00');
    assert.equal((await fetch(base + '/menu-de-noel')).status, 404);
    assert.equal((await fetch(base + '/menu-de-noel/buche-coco-passion')).status, 404);
    assert.doesNotMatch(await (await fetch(base + '/saveurs-du-monde/buffet-antillais')).text(), /class="noel"/);
    const c2 = await app.locals.catalogue.get();
    assert.ok(!c2.search(c2, 'bûche coco passion', 50).some(p => p.noel));
  } finally { Date.now = vraiNow; srv.close(); }
});
