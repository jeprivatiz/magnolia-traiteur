'use strict';
/* Prépa de commande (Jean-Luc, 2026-11-27) : bon de préparation pré-rempli depuis un devis signé, sans prix, enregistré, imprimable, envoyé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('bon de préparation de commande', async () => {
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
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents >= 1000 && x.statut !== 'masque' && !(x.groupes || []).some(g => !g.facultatif));
    const qte = Math.max(Math.ceil(200000 / p.prixCents), p.min || 1);
    assert.equal((await call('/api/demandes', { method: 'POST', body: { nom: 'Marcel Durand', email: 'marcel@example.test', tel: '06 12 34 56 78', evenement: 'Mariage', date: '2027-06-12', invites: 80, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: p.slug, qte }] } })).status, 200);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const dem = (await call('/api/admin/demandes')).j.find(d => /Marcel/i.test(d.contact?.nom));
    const r = await call('/api/admin/actions/reserver/' + dem.id, { method: 'POST', body: { montantCents: 100000, moyen: 'Chèque' } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const id = r.j.devisId;
    // la liste propose l'événement signé
    const L = (await call('/api/admin/prepa')).j;
    const it = L.devis.find(d => d.devisId === id);
    assert.ok(it && it.confirme && !it.bon && it.date === '2027-06-12');
    // bon pré-rempli : client, événement, lignes du devis, sans prix
    const g = (await call('/api/admin/prepa/' + id)).j;
    assert.equal(g.existe, false);
    assert.equal(g.bon.client.nom, 'Marcel DURAND');
    assert.equal(g.bon.evenement.invites, 80);
    assert.equal(g.bon.evenement.ville, 'Villebon-sur-Yvette');
    const ligne = g.bon.lignes.find(l => l.produit === p.slug);
    assert.ok(ligne && ligne.qteDevis === qte, JSON.stringify(g.bon.lignes));
    assert.ok(!g.bon.lignes.some(l => l.unite === 'km'), 'pas de livraison à préparer');
    assert.ok(!JSON.stringify(g.bon.lignes).match(/Cents/), 'aucun prix dans les lignes');
    assert.ok(g.personnes.some(x => x.groupe === 'Équipe Magnolia'));
    // enregistrement
    const b = { ...g.bon, horaires: { ...g.bon.horaires, livraison: '17 h 30', depart: '16 h' }, regisseurs: [{ nom: 'liam bernard', tel: '06 11 22 33 44' }], livreurs: [{ nom: 'Romain GOUJON' }], personnel: [{ nom: 'Stéphanie' }], allergies: '2 invités sans gluten', lignes: [...g.bon.lignes.map(l => l.produit === p.slug ? { ...l, qtePrepa: '3 plateaux', note: 'sans piment' } : l), { type: 'produit', designation: 'Pain de campagne', qteDevis: '4', qtePrepa: '4 pains' }] };
    const s = await call('/api/admin/prepa/' + id, { method: 'PUT', body: b });
    assert.equal(s.status, 200, JSON.stringify(s.j));
    const g2 = (await call('/api/admin/prepa/' + id)).j;
    assert.equal(g2.existe, true);
    assert.equal(g2.bon.horaires.livraison, '17 h 30');
    assert.equal(g2.bon.regisseurs[0].nom, 'Liam BERNARD');
    assert.equal(g2.bon.lignes.find(l => l.produit === p.slug).qtePrepa, '3 plateaux');
    assert.ok(g2.bon.lignes.some(l => l.designation === 'Pain de campagne'));
    assert.ok((await call('/api/admin/prepa')).j.devis.find(d => d.devisId === id).bon);
    // document A4 : tout y est, aucun prix
    const doc = await call('/api/admin/prepa/' + id + '/document');
    assert.equal(doc.status, 200);
    assert.match(doc.j, /BON DE PRÉPARATION DE COMMANDE/);
    assert.match(doc.j, /Marcel DURAND/); assert.match(doc.j, /17 h 30/); assert.match(doc.j, /Liam BERNARD/); assert.match(doc.j, /3 plateaux/); assert.match(doc.j, /sans gluten/);
    assert.doesNotMatch(doc.j.replace(/<style>[\s\S]*?<\/style>/, ''), /€/);
    // envoi : il faut un destinataire
    assert.equal((await call('/api/admin/prepa/' + id + '/envoyer', { method: 'POST', body: { canaux: ['email'], a: [] } })).status, 400);
    const e = await call('/api/admin/prepa/' + id + '/envoyer', { method: 'POST', body: { canaux: ['email', 'sms'], a: [{ nom: 'Cuisine', email: 'cuisine@example.test', tel: '06 98 76 54 32' }], message: 'Bonjour' } });
    assert.equal(e.status, 200, JSON.stringify(e.j));
    assert.match(e.j.lien, /\/preparation\/[\w-]{16,}$/);
    // le lien s'ouvre sans connexion
    const tok = e.j.lien.split('/').pop();
    const pub = await fetch(base + '/preparation/' + tok);
    assert.equal(pub.status, 200);
    const html = await pub.text();
    assert.match(html, /Marcel DURAND/); assert.doesNotMatch(html, /Retour au back-office/);
    assert.equal((await fetch(base + '/preparation/zzzzzzzzzzzzzzzzzzzzzzzz')).status, 404);
    assert.equal((await call('/api/admin/prepa/' + id)).j.bon.envois.length, 1);
  } finally { srv.close(); }
});
