'use strict';
/* Suivi client > « Réserver » (Jean-Luc, 2026-11-27) : acompte reçu → devis accepté, facture créée avec le règlement et le reste dû, fiche « Réservé ». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('réserver une fiche à réception de l’acompte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
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
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents >= 1000 && x.statut !== 'masque');
    const qte = Math.max(Math.ceil(200000 / p.prixCents), p.min || 1);
    assert.equal((await call('/api/demandes', { method: 'POST', body: { nom: 'Marcel Durand', email: 'marcel@example.test', tel: '06 12 34 56 78', evenement: 'Mariage', date: '2027-06-12', invites: 80, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: p.slug, qte }] } })).status, 200);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const dem = (await call('/api/admin/demandes')).j.find(d => d.contact?.nom === 'Marcel DURAND' || /Marcel/.test(d.contact?.nom));
    assert.ok(dem);
    // montant manquant : refusé, rien ne change
    assert.equal((await call('/api/admin/actions/reserver/' + dem.id, { method: 'POST', body: { montantCents: 0 } })).status, 400);
    // chèque d'acompte reçu
    const r = await call('/api/admin/actions/reserver/' + dem.id, { method: 'POST', body: { montantCents: 100000, moyen: 'Chèque', date: '2026-11-27', note: 'chèque n° 42' } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.match(r.j.numero, /^F-\d{4}-\d{4}$/);
    assert.equal(r.j.resteCents, r.j.devisTtcCents - 100000);
    const dv = (await call('/api/admin/devis/' + r.j.devisId)).j;
    assert.equal(dv.statut, 'accepte');
    assert.ok(dv.signature || dv.accordManuel);
    const d2 = (await call('/api/admin/demandes/' + dem.id)).j;
    assert.equal(d2.statut, 'reserve');
    const f = (await call('/api/admin/actions/facture/' + r.j.id)).j;
    assert.equal(f.reglements.length, 1); assert.equal(f.reglements[0].moyen, 'Chèque'); assert.equal(f.reglements[0].note, 'chèque n° 42');
    assert.equal(f.etat.resteCents, r.j.devisTtcCents - 100000);
    // un second règlement (le solde) complète la même facture
    const r2 = await call('/api/admin/actions/reserver/' + dem.id, { method: 'POST', body: { montantCents: r.j.resteCents, moyen: 'Virement' } });
    assert.equal(r2.j.id, r.j.id); assert.equal(r2.j.resteCents, 0); assert.equal(r2.j.payee, true);
  } finally { srv.close(); }
});
