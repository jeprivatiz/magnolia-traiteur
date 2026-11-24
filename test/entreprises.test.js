'use strict';
/* Clients : bandeau Contacts / Entreprises, plusieurs contacts reliés à une même fiche entreprise. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cleEntreprise } = require('../server/entreprises');

test('nom d’entreprise : formes juridiques et accents ignorés', () => {
  assert.equal(cleEntreprise('JEPRIVATIZ SAS'), cleEntreprise('Jeprivatiz'));
  assert.equal(cleEntreprise('Société Générale'), 'generale');
  assert.equal(cleEntreprise('Martin & Fils'), 'martin et fils');
});

test('entreprises : reprise des Sociétés, liens, renommage, détacher, supprimer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  /* deux fiches existantes avec la même société (écrite différemment) avant l'arrivée des entreprises */
  fs.writeFileSync(path.join(dir, 'db.clients.json'), JSON.stringify({
    'clients/c_a': { data: { id: 'c_a', nom: 'Jean-Luc BERNARD', societe: 'JEPRIVATIZ', email: 'a@x.test', derniereActivite: '2026-11-20T10:00:00Z' }, updatedAt: 1 },
    'clients/c_b': { data: { id: 'c_b', nom: 'Liam BERNARD', societe: 'Jeprivatiz SAS', email: 'b@x.test' }, updatedAt: 1 },
    'clients/c_c': { data: { id: 'c_c', nom: 'Claire MARTIN', email: 'c@x.test' }, updatedAt: 1 },
  }));
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
    let l = (await call('/api/admin/entreprises')).j;
    assert.equal(l.tous, 1, 'une seule entreprise pour JEPRIVATIZ et Jeprivatiz SAS');
    const e = l.items[0];
    assert.equal(e.nom, 'JEPRIVATIZ'); assert.equal(e.nbContacts, 2);
    assert.equal((await call('/api/admin/clients?par=10&page=1&q=')).j.entreprises, 1);

    /* fiche entreprise + contacts */
    assert.equal((await call('/api/admin/entreprises/' + e.id, { method: 'PUT', body: { nom: 'JEPRIVATIZ', siret: '99297985600011', ville: 'Alfortville' } })).status, 200);
    let f = (await call('/api/admin/entreprises/' + e.id)).j;
    assert.equal(f.contacts.length, 2); assert.equal(f.entreprise.siret, '99297985600011');

    /* relier un contact existant, puis le détacher */
    assert.equal((await call('/api/admin/entreprises/' + e.id + '/contacts', { method: 'POST', body: { clientId: 'c_c' } })).status, 200);
    assert.equal((await call('/api/admin/clients/c_c')).j.societe, 'JEPRIVATIZ');
    assert.equal((await call('/api/admin/entreprises/' + e.id)).j.contacts.length, 3);
    await call('/api/admin/entreprises/' + e.id + '/contacts', { method: 'POST', body: { clientId: 'c_c', retirer: true } });
    const cc = (await call('/api/admin/clients/c_c')).j; assert.equal(cc.societe, ''); assert.ok(!cc.entrepriseId);

    /* renommer : la Société des contacts suit */
    await call('/api/admin/entreprises/' + e.id, { method: 'PUT', body: { nom: 'Je Privatise' } });
    assert.equal((await call('/api/admin/clients/c_b')).j.societe, 'Je Privatise');

    /* nouvelle fiche contact avec une Société inconnue : entreprise créée ; même nom : même entreprise */
    const n1 = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'paul durand', societe: 'Mairie de Massy' } })).j.id;
    const n2 = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'anne petit', societe: 'mairie de massy' } })).j.id;
    const e1 = (await call('/api/admin/clients/' + n1)).j.entrepriseId, e2 = (await call('/api/admin/clients/' + n2)).j.entrepriseId;
    assert.ok(e1); assert.equal(e1, e2);
    /* changer la Société d'une fiche : reliée à l'autre entreprise */
    const c2 = (await call('/api/admin/clients/' + n2)).j;
    await call('/api/admin/clients/' + n2, { method: 'PUT', body: { ...c2, societe: 'Je Privatise', notes: 'Remarque interne' } });
    const c2b = (await call('/api/admin/clients/' + n2)).j;
    assert.equal(c2b.entrepriseId, e.id); assert.equal(c2b.notes, 'Remarque interne');

    /* doublon refusé */
    assert.equal((await call('/api/admin/entreprises', { method: 'POST', body: { nom: 'MAIRIE DE MASSY' } })).status, 409);
    const nv = await call('/api/admin/entreprises', { method: 'POST', body: { nom: 'Banque Dupont', siret: '123' } });
    assert.equal(nv.status, 200);
    l = (await call('/api/admin/entreprises?filtre=sans')).j; assert.ok(l.items.some(x => x.nom === 'Banque Dupont'));
    assert.equal((await call('/api/admin/entreprises?q=massy')).j.total, 1);

    /* supprimer : contacts gardés, détachés */
    const d = await call('/api/admin/entreprises/' + e1, { method: 'DELETE' });
    assert.equal(d.j.detaches, 1);
    const c1 = (await call('/api/admin/clients/' + n1)).j; assert.equal(c1.nom, 'Paul DURAND'); assert.equal(c1.societe, ''); assert.ok(!c1.entrepriseId);
  } finally { srv.close(); await app.locals.store?.close?.(); }
});
