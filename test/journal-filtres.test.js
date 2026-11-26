'use strict';
/* Journal d'activité filtré par personne et par dates + temps passé (Jean-Luc, 2026-11-26) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('journal : filtres personne / dates, chaîne intacte, temps passé', async () => {
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
    assert.equal((await romain('/api/admin/actions/journal')).status, 403, 'journal réservé au droit Équipe');
    assert.equal((await romain('/api/admin/actions/presence', { method: 'POST' })).status, 200);
    await chef('/api/admin/actions/presence', { method: 'POST' });
    await new Promise(r => setTimeout(r, 50));

    const eq = (await chef('/api/admin/actions/equipe')).j;
    const idR = eq.find(u => u.email === 'romain@magnolia.test').id, idC = eq.find(u => u.email === 'chef@magnolia.test').id;
    const tout = (await chef('/api/admin/actions/journal')).j;
    assert.equal(tout.intact, true);
    assert.ok(tout.nb >= 1);
    const pc = tout.personnes.find(p => p.cle === idC), pr = tout.personnes.find(p => p.cle === idR);
    assert.ok(pc && pr, 'les deux comptes sont dans la liste');
    assert.ok(pc.minutes >= 1 && pr.minutes >= 1, 'une minute comptée au premier signe');
    assert.equal(pr.jours, 1);
    assert.ok(tout.depuis, 'date de début du comptage');

    const seulR = (await chef('/api/admin/actions/journal?qui=' + idR)).j;
    assert.ok(seulR.lignes.every(l => l.uid === idR));
    const seulC = (await chef('/api/admin/actions/journal?qui=' + idC)).j;
    assert.ok(seulC.lignes.length >= 1 && seulC.lignes.every(l => l.uid === idC), 'la création du compte de Romain est une action du chef');

    const vide = (await chef('/api/admin/actions/journal?du=2020-01-01&au=2020-01-31')).j;
    assert.equal(vide.nb, 0); assert.equal(vide.personnes.find(p => p.cle === idR).minutes, 0, 'pas de temps hors période');
    const inv = (await chef('/api/admin/actions/journal?du=2099-01-01&au=2020-01-01')).j;
    assert.equal(inv.du, '2020-01-01', 'dates inversées remises dans l’ordre');
    assert.equal(inv.nb, tout.nb);
    assert.equal((await chef('/api/admin/actions/journal')).j.intact, true, 'les filtres ne touchent pas la chaîne');
  } finally { srv.close(); }
});
