'use strict';
/* Ligne de livraison verrouillée (Jean-Luc, 2026-11-25) : un commercial ne peut ni la changer, ni l'offrir, ni la retirer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('un commercial ne touche pas à la ligne de livraison ; l’administrateur oui', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const session = () => { let cookie = ''; return async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; }; };
  const chef = session(), romain = session();
  try {
    await chef('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    await chef('/api/admin/actions/equipe', { method: 'POST', body: { nom: 'romain goujon', email: 'romain@magnolia.test', password: 'provisoire-123', droits: { toutes: true } } });
    await romain('/api/auth/login', { method: 'POST', body: { email: 'romain@magnolia.test', password: 'provisoire-123' } });
    const liv = { designation: 'Livraison et reprise', qte: 40, unite: 'km', puCents: 80, puBaseCents: 100, remisePct: 20, coutCents: 100, tva: 20, livraison: true };
    const buffet = { designation: 'Buffet', qte: 1, puCents: 50000, coutCents: 20000, tva: 10 };
    const n = await chef('/api/admin/actions/devis-vierge', { method: 'POST', body: {} }).catch(() => null);
    let id = n?.j?.id;
    if (!id) { const r = await chef('/api/admin/devis', { method: 'GET' }); id = r.j[0]?.id; }
    assert.ok(id, 'devis créé');
    const dv = (await chef('/api/admin/devis/' + id)).j;
    assert.equal((await chef('/api/admin/devis/' + id, { method: 'PUT', body: { ...dv, lignes: [buffet, liv] } })).status, 200);
    const d1 = (await romain('/api/admin/devis/' + id)).j;
    assert.equal((await romain('/api/admin/devis/' + id, { method: 'PUT', body: { ...d1, lignes: [buffet, { ...liv, puCents: 0, remisePct: 100 }] } })).status, 403, 'offrir');
    assert.equal((await romain('/api/admin/devis/' + id, { method: 'PUT', body: { ...d1, lignes: [buffet] } })).status, 403, 'retirer');
    assert.equal((await romain('/api/admin/devis/' + id, { method: 'PUT', body: { ...d1, lignes: [{ ...buffet, qte: 2 }, liv], remiseCents: 5000 } })).status, 200, 'le reste reste modifiable');
    const d2 = (await chef('/api/admin/devis/' + id)).j;
    assert.equal((await chef('/api/admin/devis/' + id, { method: 'PUT', body: { ...d2, lignes: [buffet, { ...liv, puCents: 0, remisePct: 100 }] } })).status, 200, 'l’administrateur peut l’offrir');
  } finally { srv.close(); }
});
