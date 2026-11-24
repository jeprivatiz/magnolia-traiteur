'use strict';
/* « 👁 Voir le devis » : l'équipe voit le devis comme le client, même en brouillon, sans l'envoyer. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('aperçu du devis réservé à l’équipe, brouillon non envoyé', async () => {
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
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Sophie Durand', email: 'sophie@example.test' } });
    const nv = await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } });
    const id = nv.j.id; assert.ok(id, JSON.stringify(nv.j));
    const d = (await call('/api/admin/devis/' + id)).j;
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: 'Colombo de poulet', qte: 10, unite: 'portion', puCents: 1250, tva: 10 }] } });
    const ap = await call('/api/admin/devis/' + id + '/apercu');
    assert.equal(ap.status, 200);
    assert.match(ap.j, /Aperçu du devis/);
    assert.match(ap.j, /Colombo de poulet/);
    assert.match(ap.j, /125,00/);
    assert.doesNotMatch(ap.j, /data-sign=/, 'pas de signature possible depuis l’aperçu');
    assert.match(ap.j, /Règlement de la totalité, soit <b>125,00/, 'commande sous 800 € : totalité');
    assert.match(ap.j, /Conditions générales de vente<\/h2>/);
    assert.match(ap.j, /Article 10/);
    assert.doesNotMatch(ap.j, /À compléter/);
    const apres = (await call('/api/admin/devis/' + id)).j;
    assert.equal(apres.statut, 'brouillon'); assert.ok(!apres.vuLe && !(apres.envois || []).length, 'rien envoyé, pas marqué « vu »');
    assert.equal((await call('/devis/' + d.token)).status, 404, 'le client ne voit toujours pas le brouillon');
    const dup = await call('/api/admin/actions/dupliquer-devis/' + id, { method: 'POST', body: {} });
    assert.equal(dup.status, 200, JSON.stringify(dup.j));
    const copie = (await call('/api/admin/devis/' + dup.j.id)).j;
    assert.notEqual(copie.numero, d.numero); assert.notEqual(copie.token, d.token);
    assert.equal(copie.statut, 'brouillon'); assert.equal(copie.clientId, cl.j.id); assert.equal(copie.lignes[0].designation, 'Colombo de poulet');
    cookie = '';
    assert.equal((await call('/api/admin/devis/' + id + '/apercu')).status, 401);
  } finally { srv.close(); }
});

test('règle d’acompte : totalité sous 800 € TTC, 50 % au-dessus, pourcentage forcé possible', () => {
  const { regleAcompte } = require('../server/devis');
  assert.deepEqual([regleAcompte(79999).pct, regleAcompte(80000).pct, regleAcompte(150000).cents], [100, 50, 75000]);
  assert.equal(regleAcompte(150000, { acomptePct: 30 }).pct, 30);
  assert.equal(regleAcompte(150000, { acomptePct: null }).pct, 50);
  assert.equal(regleAcompte(50000, {}, { seuilAcompteCents: 40000, acomptePct: 40 }).pct, 40);
});
