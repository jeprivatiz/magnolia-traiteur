'use strict';
/* Règle de Jean-Luc : « Demandes de devis » ne garde que les demandes sur lesquelles personne n'est intervenu ;
   à la première action, la demande passe dans « Suivi client », au nom de celui qui l'a traitée. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('une demande travaillée quitte « Demandes de devis » et passe dans le Suivi client', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const log = { log() {}, warn() {}, error() {}, info() {} };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const store = app.locals.store;
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    const site = nom => call('/api/demandes', { method: 'POST', body: { nom, email: nom.split(' ')[0].toLowerCase() + '@example.test', tel: '06 12 34 56 78', evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } });
    for (const n of ['Anne Vue', 'Bruno Note', 'Carla Devis', 'Denis Attribue', 'Emma Rdv']) assert.equal((await site(n)).status, 200);
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const dem = async () => (await call('/api/admin/demandes')).j;
    const de = async n => (await dem()).find(d => d.contact.nom.startsWith(n));
    const stats = async () => (await call('/api/admin/stats')).j;
    assert.equal((await stats()).nouvellesTous, 5);

    /* simplement ouverte : reste à traiter */
    const a = await de('Anne'); await call('/api/admin/demandes/' + a.id, { method: 'PUT', body: { ...a, vue: true } });
    assert.ok(!(await de('Anne')).priseEnCharge);

    /* note sur la fiche client */
    const b = await de('Bruno');
    assert.equal((await call('/api/admin/actions/client-journal/' + b.clientId, { method: 'POST', body: { type: 'appel', texte: 'Rappelé, il veut le menu' } })).status, 200);
    const b2 = await de('Bruno'); assert.equal(b2.priseEnCharge.quoi, 'appel noté'); assert.equal(b2.commercial, 'Liam Bernard');

    /* devis créé (même pas encore envoyé) */
    const cd = await de('Carla');
    await call('/api/admin/actions/devis-depuis-demande/' + cd.id, { method: 'POST' });
    assert.equal((await de('Carla')).priseEnCharge.quoi, 'devis créé');

    /* attribuée à Romain : c'est Romain le responsable */
    const d = await de('Denis'); await call('/api/admin/demandes/' + d.id, { method: 'PUT', body: { ...d, commercial: 'Romain Goujon' } });
    const d2 = await de('Denis'); assert.equal(d2.commercial, 'Romain Goujon'); assert.equal(d2.priseEnCharge.par, 'Romain Goujon');
    /* une fiche ouverte avant ne l'efface pas */
    await call('/api/admin/demandes/' + d.id, { method: 'PUT', body: { ...d, commercial: 'Romain Goujon', vue: true } });
    assert.ok((await de('Denis')).priseEnCharge);

    /* appel programmé */
    const e = await de('Emma');
    const j = new Date(Date.now() + 2 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    assert.equal((await call('/api/admin/actions/rdv-client/' + e.clientId, { method: 'POST', body: { type: 'appel', date: j, heure: '10:00', commerciaux: ['Hermine'] } })).status, 200);
    assert.equal((await de('Emma')).priseEnCharge.quoi, 'appel programmé');

    assert.equal((await stats()).nouvellesTous, 1, 'seule la demande d’Anne reste dans Demandes de devis');

    /* reprise des demandes existantes : un appel déjà noté avant cette règle suffit */
    const a3 = await store.get('demandes/' + a.id);
    await store.set('demandes/' + a.id, { ...a3, relancesNotees: [{ at: new Date().toISOString(), how: 'appel', par: 'Stéphanie' }] });
    await store.delete('_migr/priseEnCharge'); await store.flush();
  } finally { srv.close(); }
  const app2 = await createApp({ env, noTimers: true, log });
  const a4 = (await app2.locals.store.list('demandes')).map(x => x.data).find(d => d.contact.nom.startsWith('Anne'));
  assert.equal(a4.commercial, 'Stéphanie'); assert.ok(a4.priseEnCharge.reprise);
});
