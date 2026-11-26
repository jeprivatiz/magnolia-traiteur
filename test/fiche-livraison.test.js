'use strict';
/* Fiche client (Jean-Luc, 2026-11-26) : Prénom et Nom séparés, Client / Prestataire, adresse et horaire de livraison,
   infos pour les livreurs, reprises sur le devis créé depuis une demande du site. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LC = require('../server/livraison-client');

test('livraison-client : nettoyage et phrase pour les livreurs', () => {
  const l = LC.nette({ identique: 'on', adresse: 'x', niveau: 'En étage', etage: '3', ascenseur: 'Non', acces: ['Digicode', 'Stationnement difficile', 'pirate'], digicode: '4512B', logement: 'Appartement', horaire: '18 h 30' });
  assert.equal(l.identique, true); assert.equal(l.adresse, '', 'identique : pas de 2e adresse');
  assert.deepEqual(l.acces, ['Digicode', 'Stationnement difficile']);
  assert.equal(LC.infosLivreurs(l), 'Appartement · étage 3, ascenseur : non · digicode 4512B · stationnement difficile');
  assert.equal(LC.nette({ niveau: 'Rez-de-chaussée', etage: '4', ascenseur: 'Oui' }).etage, '');
  assert.deepEqual(LC.adresseLivraison({ adresse: '1 rue A', cp: '91140', ville: 'Villebon', livraison: l }), { adresse: '1 rue A', cp: '91140', ville: 'Villebon', horaire: '18 h 30' });
});

test('fiche client : prénom / nom, livraison, et devis depuis une demande du site', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    /* deux cases → « Prénom NOM » */
    const n = (await call('/api/admin/clients', { method: 'POST', body: { prenom: 'jean-luc', nomFamille: 'bernard', nom: 'jean-luc bernard', email: 'jl@example.test', genre: 'client',
      livraison: { identique: false, adresse: '3 allée des Roses', cp: '91300', ville: 'Massy', horaire: 'Soir (17 h – 20 h)', niveau: 'En étage', etage: '2', ascenseur: 'Oui', acces: ['Interphone'] } } })).j;
    let c = (await call('/api/admin/clients/' + n.id)).j;
    assert.equal(c.nom, 'Jean-Luc BERNARD'); assert.equal(c.prenom, 'Jean-Luc'); assert.equal(c.nomFamille, 'BERNARD'); assert.equal(c.genre, 'client');
    assert.equal(c.livraison.ville, 'Massy'); assert.equal(c.livraison.etage, '2');
    /* nom complet changé ailleurs (ancien écran, IA) : les deux cases suivent */
    await call('/api/admin/clients/' + n.id, { method: 'PUT', body: { ...c, nom: 'Paul DURAND' } });
    c = (await call('/api/admin/clients/' + n.id)).j;
    assert.equal(c.prenom, 'Paul'); assert.equal(c.nomFamille, 'DURAND');
    /* demande du site : nouvelle fiche « Client », code postal / ville / horaire dans la livraison */
    const pr = (await call('/api/admin/produits')).j.find(p => p.prixCents && p.statut !== 'masque');
    const r = await call('/api/demandes', { method: 'POST', body: { nom: 'Claire MARTIN', email: 'claire@example.test', tel: '0612345678', evenement: 'Anniversaire', date: '2027-03-14', invites: 30, cp: '92160', ville: 'Antony', horaire: 'Midi (11 h – 13 h)', km: 30, lignes: [{ slug: pr.slug, qte: pr.min || 10 }] } });
    assert.equal(r.status, 200);
    const cl = (await call('/api/admin/clients?par=10&q=claire')).j.items[0];
    const fc = (await call('/api/admin/clients/' + cl.id)).j;
    assert.equal(fc.genre, 'client'); assert.equal(fc.livraison.ville, 'Antony'); assert.equal(fc.livraison.horaire, 'Midi (11 h – 13 h)');
    /* le livreur complète la fiche, puis on crée le devis : adresse, horaire et infos livreurs repris */
    await call('/api/admin/clients/' + cl.id, { method: 'PUT', body: { ...fc, livraison: { ...fc.livraison, adresse: '8 rue Velpeau', logement: 'Maison', acces: ['Stationnement difficile'] } } });
    const dm = (await call('/api/admin/demandes')).j.find(x => x.clientId === cl.id);
    const dv = (await call('/api/admin/actions/devis-depuis-demande/' + dm.id, { method: 'POST' })).j;
    const devis = (await call('/api/admin/devis/' + dv.id)).j;
    assert.equal(devis.evenement.adresse, '8 rue Velpeau'); assert.equal(devis.evenement.cp, '92160'); assert.equal(devis.evenement.horaire, 'Midi (11 h – 13 h)');
    assert.equal(devis.evenement.livreurs, 'Maison · stationnement difficile');
    const page = await fetch(base + '/api/admin/devis/' + dv.id + '/apercu', { headers: { cookie } }).then(x => x.text());
    assert.match(page, /Livraison : 8 rue Velpeau, 92160 Antony/); assert.match(page, /Horaire de livraison : Midi/);
    assert.doesNotMatch(page, /stationnement difficile/i, 'infos livreurs jamais montrées au client');
  } finally { srv.close(); }
});
