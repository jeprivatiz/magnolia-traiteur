'use strict';
/* Suivi client > Relancer (Jean-Luc, 2026-11-27) : modèles remplis pour le devis, texte modifié envoyé et noté. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('relance : modèles remplis, texte modifié, historique', async () => {
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
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Tara Bernard', email: 'tara@example.test', tel: '0612345678' } });
    const id = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } })).j.id;
    const d = (await call('/api/admin/devis/' + id)).j;
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, evenement: { type: 'Anniversaire', date: '2027-03-10', invites: 30 }, lignes: [{ designation: 'Buffet', qte: 30, unite: 'personne', puCents: 2500, tva: 10 }] } });
    const M = (await call('/api/admin/actions/relance-modeles/' + id)).j;
    assert.deepEqual(M.modeles.map(m => m.id).slice(0, 4), ['relance-j3', 'relance-j7', 'relance-derniere', 'sms-relance']);
    assert.match(M.modeles[0].texte, /Bonjour Tara/); assert.ok(M.modeles[0].texte.includes('/devis/' + d.token));
    assert.equal(M.email, 'tara@example.test');
    const r = await call('/api/admin/actions/relancer/' + id, { method: 'POST', body: { modele: 'relance-derniere', sujet: 'Objet modifié', texte: 'Bonjour {prenom}, petit mot perso.' } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const d2 = (await call('/api/admin/devis/' + id)).j;
    assert.equal(d2.relances.length, 1); assert.equal(d2.relances[0].sujet, 'Objet modifié'); assert.equal(d2.relances[0].texte, 'Bonjour Tara, petit mot perso.');
    assert.equal((await call('/api/admin/actions/relance-modeles/' + id)).j.relances, 1);
    // fiche du site sans devis : la relance s'ouvre quand même (modèles « demande »), notée sur la fiche, statut inchangé si déjà en Accord
    const pd = await call('/api/demandes', { method: 'POST', body: { nom: 'Lina Petit', email: 'lina@example.test', tel: '06 11 22 33 44', evenement: 'Anniversaire', date: '2027-04-10', invites: 10, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: (await app.locals.catalogue.get()).produits.find(x => x.prixCents > 0 && x.statut !== 'masque').slug, qte: 50 }] } }); assert.equal(pd.status, 200, JSON.stringify(pd.j));
    const dem = (await call('/api/admin/demandes')).j.find(x => /Lina/.test(x.contact?.nom));
    await call('/api/admin/demandes/' + dem.id, { method: 'PUT', body: { ...dem, statut: 'accord' } });
    const M2 = (await call('/api/admin/actions/relance-modeles-demande/' + dem.id)).j;
    assert.equal(M2.devis, null); assert.equal(M2.modeles[0].id, 'demande-suivi'); assert.match(M2.modeles[0].texte, /Bonjour Lina/);
    assert.equal((await call('/api/admin/actions/relancer-demande/' + dem.id, { method: 'POST', body: { modele: 'demande-suivi' } })).status, 200);
    const dem2 = (await call('/api/admin/demandes/' + dem.id)).j;
    assert.equal(dem2.statut, 'accord'); assert.equal(dem2.relancesNotees.length, 1); assert.equal(dem2.relancesNotees[0].how, 'e-mail');
  } finally { srv.close(); }
});
