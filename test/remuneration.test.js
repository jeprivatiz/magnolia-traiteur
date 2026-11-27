'use strict';
/* Rémunération par action (Jean-Luc, 2026-11-27) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('rémunération : barème, gains par personne, une fois par fiche et par jour, droits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const session = () => { let cookie = ''; return async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; }; };
  const chef = session(), romain = session();
  try {
    await chef('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    await chef('/api/admin/actions/equipe', { method: 'POST', body: { nom: 'romain goujon', email: 'romain@magnolia.test', password: 'provisoire-123', droits: {} } });
    await romain('/api/auth/login', { method: 'POST', body: { email: 'romain@magnolia.test', password: 'provisoire-123' } });
    assert.equal((await romain('/api/admin/actions/remuneration')).status, 403, 'réservé au droit Équipe');

    const r0 = (await chef('/api/admin/actions/remuneration')).j;
    assert.ok(r0.actions.length > 10 && r0.actions.every(a => a.cents === 200), '2 € partout (règle de Jean-Luc du 2026-11-27)');
    assert.equal(r0.modifiable, true);

    /* Romain crée une fiche client puis la modifie trois fois le même jour */
    const c = (await romain('/api/admin/clients', { method: 'POST', body: { nom: 'Marie Dupont', email: 'marie@exemple.test' } })).j;
    assert.ok(c.id);
    for (let i = 0; i < 3; i++) assert.equal((await romain('/api/admin/clients/' + c.id, { method: 'PUT', body: { nom: 'Marie Dupont', email: 'marie@exemple.test', ville: 'Paris ' + i } })).status, 200);

    assert.equal((await romain('/api/admin/actions/remuneration/bareme', { method: 'PUT', body: { montants: { client_cree: 5 } } })).status, 403, 'barème réservé aux administrateurs');
    const s = await chef('/api/admin/actions/remuneration/bareme', { method: 'PUT', body: { montants: { client_cree: '2,50', client_modifie: 1, devis_envoye: -4, inconnu: 9 } } });
    assert.equal(s.status, 200);
    assert.equal(s.j.montants.client_cree, 250); assert.equal(s.j.montants.devis_envoye, 0, 'montant négatif remis à 0'); assert.equal(s.j.montants.inconnu, undefined);

    await new Promise(r => setTimeout(r, 50));
    const r1 = (await chef('/api/admin/actions/remuneration')).j;
    const pr = r1.personnes.find(p => p.who.toLowerCase().includes('romain'));
    assert.ok(pr, 'Romain apparaît');
    const det = Object.fromEntries(pr.detail.map(d => [d.k, d]));
    assert.equal(det.client_cree.nb, 1); assert.equal(det.client_cree.totalCents, 250);
    assert.equal(det.client_modifie.nb, 1, 'trois modifications le même jour = une seule');
    assert.equal(pr.totalCents, 350);
    assert.equal(s.j.montants.note, 0, 'un montant vidé reste à 0 : la reprise 2 € ne passe qu’une fois');
    assert.ok(!r1.personnes.some(p => p.cle === 'ia'), 'l’IA n’est pas payée');

    const vide = (await chef('/api/admin/actions/remuneration?du=2020-01-01&au=2020-01-31')).j;
    assert.equal(vide.personnes.length, 0, 'rien hors période');
    assert.equal((await chef('/api/admin/actions/journal')).j.intact, true);
  } finally { srv.close(); }
});
