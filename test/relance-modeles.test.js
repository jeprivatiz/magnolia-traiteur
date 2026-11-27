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
  } finally { srv.close(); }
});
