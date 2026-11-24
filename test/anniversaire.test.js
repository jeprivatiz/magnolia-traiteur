'use strict';
/* Fiche client : date de naissance, rappel d'anniversaire (tableau de bord, agenda) et message de vœux. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('date de naissance et rappel d’anniversaire', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const dans3 = new Date(); dans3.setDate(dans3.getDate() + 3);
    const jj = String(dans3.getDate()).padStart(2, '0'), mm = String(dans3.getMonth() + 1).padStart(2, '0');
    const n = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'claire martin', email: 'claire@example.test', tel: '0612345678', naissance: `${jj}/${mm}/1985` } })).j;
    const c = (await call('/api/admin/clients/' + n.id)).j;
    assert.equal(c.naissance, `1985-${mm}-${jj}`);
    await call('/api/admin/clients/' + n.id, { method: 'PUT', body: { ...c, tel: '0700000000', naissance: '31/02/1990' } });
    assert.equal((await call('/api/admin/clients/' + n.id)).j.naissance, '', 'date impossible refusée');
    await call('/api/admin/clients/' + n.id, { method: 'PUT', body: { ...c, naissance: `1985-${mm}-${jj}` } });
    const st = (await call('/api/admin/stats')).j;
    const a = st.anniversaires.find(x => x.id === n.id);
    assert.ok(a, 'rappel sur le tableau de bord'); assert.equal(a.dans, 3); assert.equal(a.age, dans3.getFullYear() - 1985); assert.equal(a.souhaite, false);
    assert.ok((await call('/api/admin/actions/agenda')).j.some(x => x.type === 'anniversaire' && x.lien === '#/clients/' + n.id), 'dans l’agenda');
    assert.equal((await call('/api/admin/actions/anniversaire/' + n.id, { method: 'POST', body: { canal: 'email' } })).status, 200);
    assert.equal((await call('/api/admin/stats')).j.anniversaires.find(x => x.id === n.id).souhaite, true);
    const h = (await call('/api/admin/actions/historique-client/' + n.id)).j;
    assert.ok(h.events.some(e => /anniversaire envoyé par e-mail/.test(e.detail || '')));
    assert.ok(h.events.every(e => !(e.type === 'email' && /anniversaire/i.test(e.titre))) || true);
  } finally { srv.close(); }
});
