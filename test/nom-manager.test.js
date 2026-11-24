'use strict';
/* Le compte « Manager » s'appelle Liam Bernard (Jean-Luc, 2026-11-24) ; le nom d'un compte se corrige dans Équipe & activité. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('« Manager » devient Liam Bernard, nom modifiable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', ADMIN_NAME: 'Manager', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    assert.equal((await call('/api/session')).j.nom, 'Liam Bernard');
    const eq = (await call('/api/admin/actions/equipe')).j;
    assert.equal((await call('/api/admin/actions/equipe/' + eq[0].id, { method: 'PATCH', body: { nom: 'x' } })).status, 400);
    await call('/api/admin/actions/equipe/' + eq[0].id, { method: 'PATCH', body: { nom: ' Liam B. ' } });
    assert.equal((await call('/api/session')).j.nom, 'Liam B.');
  } finally { srv.close(); }
});
