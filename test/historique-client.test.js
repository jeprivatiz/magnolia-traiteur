'use strict';
/* Fiche client : tout l'historique (demande, devis envoyé, vu, signé, facture, règlement, e-mails, notes, appels). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('historique complet d’un client, notes et appels conservés', async () => {
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
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    const dm = await call('/api/demandes', { method: 'POST', body: { nom: 'Claire Martin', email: 'claire@example.test', tel: '06 12 34 56 78', evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } });
    assert.equal(dm.status, 200, JSON.stringify(dm.j));
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const dem = (await call('/api/admin/demandes')).j[0];
    const dv = await call('/api/admin/actions/devis-depuis-demande/' + dem.id, { method: 'POST' });
    const d = (await call('/api/admin/devis/' + dv.j.id)).j;
    assert.equal((await call('/api/admin/actions/envoyer-devis/' + d.id, { method: 'POST', body: { canaux: ['email'] } })).status, 200);
    await call('/devis/' + d.token);
    assert.equal((await call('/api/devis/' + d.token + '/accepter', { method: 'POST', body: { nom: 'Claire Martin' } })).status, 200);
    const fa = await call('/api/admin/actions/facture-depuis-devis/' + d.id, { method: 'POST', body: { type: 'acompte' } });
    await call('/api/admin/actions/facture-payee/' + fa.j.id, { method: 'POST', body: { payee: true, moyen: 'Virement' } });
    const cid = dem.clientId;
    assert.equal((await call('/api/admin/actions/client-journal/' + cid, { method: 'POST', body: { type: 'note', texte: 'Préfère être appelée le soir' } })).status, 200);
    assert.equal((await call('/api/admin/actions/client-journal/' + cid, { method: 'POST', body: { type: 'appel', texte: '' } })).status, 200);
    /* une fiche corrigée ne doit pas effacer les notes */
    const cl = (await call('/api/admin/clients/' + cid)).j;
    await call('/api/admin/clients/' + cid, { method: 'PUT', body: { ...cl, journal: [], societe: 'Martin & Fils' } });
    const h = (await call('/api/admin/actions/historique-client/' + cid)).j;
    const types = h.events.map(e => e.type);
    for (const t of ['demande', 'devis', 'envoi', 'vu', 'signe', 'facture', 'paiement', 'note', 'appel']) assert.ok(types.includes(t), 'manque ' + t + ' dans ' + types.join(','));
    assert.ok(h.events.some(e => e.type === 'email' && /bien reçue/.test(e.titre)), 'e-mail d’accusé de réception');
    assert.ok(!h.events.some(e => e.type === 'email' && /Votre devis Magnolia/.test(e.titre)), 'l’e-mail du devis n’est pas répété (déjà « Devis envoyé »)');
    assert.equal(h.client.societe, 'Martin & Fils');
    assert.ok(h.events.find(e => e.type === 'note').detail.includes('soir'));
    assert.equal(h.resume.nbSignes, 1); assert.ok(h.resume.regleCents > 0 && h.resume.signeCents > 0);
    const dates = h.events.map(e => e.at); assert.deepEqual(dates, [...dates].sort().reverse(), 'du plus récent au plus ancien');
    const jid = h.events.find(e => e.type === 'note').jid;
    await call('/api/admin/actions/client-journal/' + cid, { method: 'POST', body: { supprimer: jid } });
    assert.ok(!(await call('/api/admin/actions/historique-client/' + cid)).j.events.some(e => e.jid === jid));
    cookie = '';
    assert.equal((await call('/api/admin/actions/historique-client/' + cid)).status, 401);
  } finally { srv.close(); }
});
