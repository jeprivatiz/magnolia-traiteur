'use strict';
/* Import : colonne « Fonction » reprise sur la fiche (cases vides seulement) + critère « Fonction » de la recherche multicritère (Jean-Luc, 2026-11-26) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ecrireXlsx } = require('../server/tableur');

test('fonction « Responsable de salle » : import sans écraser, puis critère de recherche', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-fct-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const a = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'Alice ESSAI', email: 'alice@salle.test', societe: 'Déjà Là', notes: '' } })).j;
    const b = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'Bruno ESSAI', email: 'bruno@salle.test', fonction: 'Gérant', notes: '' } })).j;
    await call('/api/admin/clients', { method: 'POST', body: { nom: 'Carla ESSAI', email: 'carla@autre.test', notes: '' } });
    const lignes = [['Prénom', 'Nom de famille', 'E-mail', 'Mobile', 'Téléphone fixe', 'Société', 'Fonction'],
      ['Alice', 'ESSAI', 'alice@salle.test', '', '', 'LA PENICHE ESSAI', 'Responsable de salle'],
      ['Bruno', 'ESSAI', 'bruno@salle.test', '', '', 'LE LOFT ESSAI, LE ROOFTOP ESSAI', 'Responsable de salle'],
      ['Denis', 'ESSAI', 'denis@salle.test', '+33 6 10 20 30 40', '', '', 'Responsable de salle']];
    const fd = new FormData(); fd.append('fichier', new Blob([ecrireXlsx([{ nom: 'Salles', lignes }])]), 'salles.xlsx');
    const up = await call('/api/admin/actions/import-clients/fichier', { method: 'POST', form: fd });
    assert.equal(up.status, 200, JSON.stringify(up.j));
    assert.deepEqual(up.j.proposition, ['prenom', 'nomFamille', 'email', 'tel', 'tel2', 'societe', 'fonction']);
    let debut = 0, r; do { r = await call('/api/admin/actions/import-clients/lot', { method: 'POST', body: { tok: up.j.tok, colonnes: up.j.proposition, debut, consentement: true } }); assert.equal(r.status, 200, JSON.stringify(r.j)); debut = r.j.fait; } while (!r.j.fini);
    const fiche = async id => (await call('/api/admin/clients?page=1&par=200')).j.items.find(x => x.id === id);
    const fa = await fiche(a.id || a.client?.id), fb = await fiche(b.id || b.client?.id);
    assert.equal(fa.fonction, 'Responsable de salle'); assert.equal(fa.societe, 'Déjà Là', 'société déjà remplie : gardée');
    assert.equal(fb.fonction, 'Gérant', 'fonction déjà remplie : gardée'); assert.equal(fb.societe, 'LE LOFT ESSAI');
    assert.match(fb.notes, /LE ROOFTOP ESSAI/);
    const l = (await call('/api/admin/clients?page=1&fonction=' + encodeURIComponent('responsable de salle'))).j;
    assert.equal(l.total, 2, 'Alice + Denis');
    assert.ok(l.facettes.fonction.some(([v, n]) => v === 'Responsable de salle' && n === 2));
  } finally { srv.close(); }
});
