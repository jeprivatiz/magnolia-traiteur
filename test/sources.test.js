'use strict';
/* Origine du contact / source des demandes (Jean-Luc, 2026-11-26) : « Site » automatique pour les demandes du site,
   liste déroulante gérable (ajouter, retirer), source du devis = la sienne, sinon celle de la demande, sinon celle du client,
   répartition par origine dans Statistiques, critère de recherche dans Clients. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SRC = require('../server/sources');

test('règles de la source', () => {
  assert.equal(SRC.canalClient({ source: 'site' }), 'Site');
  assert.equal(SRC.canalClient({ source: 'import CRM' }), 'Import');
  assert.equal(SRC.canalClient({ source: 'back-office' }), '');
  assert.equal(SRC.canalClient({ source: 'import CRM', canal: 'Google' }), 'Google');
  assert.equal(SRC.canalDemande({ historique: [{ par: 'site' }] }, null), 'Site', 'ancienne demande du site');
  assert.equal(SRC.canalDemande({ source: 'Téléphone (IA)', historique: [{ par: 'X' }] }, { canal: '1001 salles' }), '1001 salles');
  assert.equal(SRC.canalDevis({}, { canal: 'ABC salles' }, { canal: 'Google' }), 'ABC salles');
  assert.equal(SRC.canalDevis({ canal: 'Bouche à oreille' }, { canal: 'Site' }, null), 'Bouche à oreille');
});

test('source posée, choisie, reprise sur la fiche, statistiques', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    /* demande du site */
    assert.equal((await call('/api/demandes', { method: 'POST', body: { nom: 'claire martin', email: 'claire@ex.test', tel: '06 12 34 56 78', evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp: '91140', ville: 'Villebon', lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } })).status, 200);
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const dm = (await call('/api/admin/demandes')).j[0];
    assert.equal(dm.canal, 'Site'); assert.equal(dm.canalAuto, 'Site');
    const h = (await call('/api/admin/actions/historique-client/' + dm.clientId)).j;
    assert.equal(h.client.canal, 'Site', 'fiche client créée par le site');

    /* liste : ajouter, retirer (« Site » reste) */
    const l0 = (await call('/api/admin/sources')).j.sources;
    assert.ok(['Site', 'Bouche à oreille', '1001 salles', 'ABC salles'].every(x => l0.includes(x)));
    const add = (await call('/api/admin/sources', { method: 'POST', body: { nom: '  Mariages.net ' } })).j;
    assert.equal(add.nom, 'Mariages.net'); assert.ok(add.sources.includes('Mariages.net'));
    assert.equal((await call('/api/admin/sources', { method: 'POST', body: { nom: 'mariages.NET' } })).j.sources.filter(x => /mariages/i.test(x)).length, 1, 'pas de doublon');
    assert.ok(!(await call('/api/admin/sources/retirer', { method: 'POST', body: { nom: 'Instagram' } })).j.sources.includes('Instagram'));
    assert.equal((await call('/api/admin/sources/retirer', { method: 'POST', body: { nom: 'Site' } })).status, 400);

    /* client saisi à la main, sans source, puis devis avec source « 1001 salles » : la fiche la reçoit */
    const n = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'paul durand', email: 'paul@ex.test', source: 'back-office' } })).j;
    const v = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: n.id } })).j;
    let dv = (await call('/api/admin/devis/' + v.id)).j;
    assert.equal(dv.canalAuto, '');
    assert.equal((await call('/api/admin/devis/' + v.id, { method: 'PUT', body: { ...dv, canal: '1001 salles', lignes: [{ designation: 'Buffet', qte: 1, puCents: 120000, tva: 10 }] } })).status, 200);
    dv = (await call('/api/admin/devis/' + v.id)).j;
    assert.equal(dv.canalAuto, '1001 salles'); assert.equal(dv.canal, '1001 salles');
    assert.equal((await call('/api/admin/clients/' + n.id)).j.canal, '1001 salles', 'reportée sur la fiche client');
    /* une fiche qui a déjà une source la garde */
    await call('/api/admin/devis/' + v.id, { method: 'PUT', body: { ...dv, canal: 'Google' } });
    assert.equal((await call('/api/admin/clients/' + n.id)).j.canal, '1001 salles');

    /* recherche multicritère */
    const r = (await call('/api/admin/clients?page=1&canal=' + encodeURIComponent('1001 salles'))).j;
    assert.equal(r.total, 1); assert.equal(r.items[0].id, n.id);
    assert.ok(r.facettes.canal.some(([k, nb]) => k === 'Site' && nb === 1));

    /* statistiques */
    const st = (await call('/api/admin/statistiques')).j.sources;
    const site = st.lignes.find(x => x.source === 'Site'), g = st.lignes.find(x => x.source === 'Google');
    assert.equal(site.demandes, 1);
    assert.equal(g.devis, 1);
    assert.equal(st.total.demandes, 1);
  } finally { srv.close(); }
});
