'use strict';
/* Lieux à privatiser sur le devis : 3 photos (une grande, deux petites), nom, capacité, description, sur la page client, l'aperçu et l'e-mail. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('un devis avec un lieu montre 3 photos du lieu', async () => {
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
    const lieux = (await call('/api/admin/lieux')).j;
    const L = lieux.find(l => (l.photos || []).length >= 3);
    assert.ok(L, 'un lieu avec au moins 3 photos');
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Sophie Durand', email: 'sophie@example.test' } });
    const id = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } })).j.id;
    const d = (await call('/api/admin/devis/' + id)).j;
    // ligne venue du site (produit lieu-<slug>)
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: L.nom, qte: 1, unite: 'location', puCents: 150000, tva: 20, produit: 'lieu-' + L.slug }, { designation: 'Colombo de poulet', qte: 10, unite: 'portion', puCents: 1250, tva: 10 }] } });
    const ap = (await call('/api/admin/devis/' + id + '/apercu')).j;
    assert.match(ap, /Votre lieu de réception/);
    assert.match(ap, /dl-mos dl-n3/);
    assert.equal((ap.match(/class="dl-ph/g) || []).length, 3, '3 photos');
    for (const p of L.photos.slice(0, 3)) assert.ok(ap.includes(p), p);
    // e-mail
    const m = (await call('/api/admin/actions/envoyer-devis-groupe', { method: 'POST', body: { ids: [id], apercu: true } })).j;
    assert.ok(m.html.includes(L.nom) && m.html.includes(L.photos[0]), 'photo du lieu dans l’e-mail');
    // ligne libre du back-office portant le nom du lieu
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: 'Privatisation · ' + L.nom, qte: 1, unite: 'forfait', puCents: 100000, tva: 20 }] } });
    assert.match((await call('/api/admin/devis/' + id + '/apercu')).j, /dl-n3/);
    // devis sans lieu : rien
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: 'Colombo de poulet', qte: 10, unite: 'portion', puCents: 1250, tva: 10 }] } });
    assert.doesNotMatch((await call('/api/admin/devis/' + id + '/apercu')).j, /dl-lieu"/);
    // lieu avec une seule photo : mise en page à une photo
    const full = (await call('/api/admin/lieux/' + L.slug)).j;
    assert.equal((await call('/api/admin/lieux/' + L.slug, { method: 'PUT', body: { ...full, photos: full.photos.slice(0, 1), capacite: 40 } })).status, 200);
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: L.nom, qte: 1, unite: 'location', puCents: 1, tva: 20, produit: 'lieu-' + L.slug }] } });
    const ap1 = (await call('/api/admin/devis/' + id + '/apercu')).j;
    assert.match(ap1, /dl-n1/); assert.match(ap1, /Jusqu’à 40/);
  } finally { srv.close(); }
});
