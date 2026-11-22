'use strict';
/* Parcours complet : demande du site → devis → envoi → signature en ligne → factures. Brevo en mode test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('parcours demande → devis → signature → facture', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '' }, log: { log() {}, warn() {}, error() {}, info() {} } });
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
    const cat = app.locals.catalogue; const c = await cat.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    assert.ok(p, 'une prestation avec un prix');

    // 1. demande depuis le site
    const d = await call('/api/demandes', { method: 'POST', body: { nom: 'Claire Martin', email: 'claire@example.test', tel: '0612345678', evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp: '91140', ville: 'Villebon-sur-Yvette', km: 10, lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } });
    assert.equal(d.status, 200, JSON.stringify(d.j));

    // 2. connexion équipe
    assert.equal((await call('/api/admin/stats')).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const dem = (await call('/api/admin/demandes')).j;
    assert.equal(dem.length, 1);
    assert.equal(dem[0].statut, 'demande');

    // 3. devis repris de la demande
    const v = await call('/api/admin/actions/devis-depuis-demande/' + dem[0].id, { method: 'POST' });
    assert.equal(v.status, 200);
    const devis = (await call('/api/admin/devis/' + v.j.id)).j;
    assert.ok(devis.lignes.some(l => l.designation === p.titre), 'ligne de la prestation');
    assert.ok(devis.lignes.some(l => /livraison/i.test(l.designation)), 'ligne de livraison');

    // marge négative refusée à l'enregistrement
    const mauvais = { ...devis, lignes: devis.lignes.map((l, i) => i === 0 ? { ...l, coutCents: (l.puCents || 0) + 100 } : l) };
    assert.equal((await call('/api/admin/devis/' + devis.id, { method: 'PUT', body: mauvais })).status, 400);

    // 4. envoi (mode test) puis signature par le client
    const env = await call('/api/admin/actions/envoyer-devis/' + devis.id, { method: 'POST', body: { canaux: ['email', 'sms'] } });
    assert.equal(env.status, 200, JSON.stringify(env.j));
    const token = env.j.lien.split('/devis/')[1];
    const page = await fetch(base + '/devis/' + token).then(r => r.text());
    assert.match(page, new RegExp(devis.numero));
    assert.equal((await call(`/api/devis/${token}/accepter`, { method: 'POST', body: { nom: 'Claire Martin' } })).status, 200);
    assert.equal((await call('/api/admin/demandes/' + dem[0].id)).j.statut, 'accord');

    // 5. facture d'acompte puis de solde : ensemble = total du devis
    const { totaux } = require('../server/devis');
    const total = totaux(devis).ttcCents;
    const fa = await call('/api/admin/actions/facture-depuis-devis/' + devis.id, { method: 'POST', body: { type: 'acompte' } });
    const fs2 = await call('/api/admin/actions/facture-depuis-devis/' + devis.id, { method: 'POST', body: { type: 'solde' } });
    const A = (await call('/api/admin/factures/' + fa.j.id)).j, S = (await call('/api/admin/factures/' + fs2.j.id)).j;
    assert.equal(A.totalCents, Math.round(total * 0.3));
    assert.equal(A.totalCents + S.totalCents, total);
    assert.match(A.numero, /^F-\d{4}-0001$/);
    // une facture ne se supprime pas
    assert.notEqual((await call('/api/admin/factures/' + fa.j.id, { method: 'DELETE' })).status, 200);

    // 6. les envois sont notés (mode test)
    const out = (await call('/api/admin/actions/envois')).j;
    assert.equal(out.live, false);
    assert.ok(out.envois.length >= 3);
  } finally { srv.close(); }
});
