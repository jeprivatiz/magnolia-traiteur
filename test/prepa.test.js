'use strict';
/* Prépa de commande (Jean-Luc, 2026-11-27) : bon de préparation pré-rempli depuis un devis signé, sans prix, enregistré, imprimable, envoyé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

let vuParIa = '';
test('bon de préparation de commande', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, iaAsk: async p => { vuParIa = p; return JSON.stringify({ texte: 'Magnolia : RDV 16 h, passer par l’entrée de service.' }); }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
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
    // listes déroulantes : softs et matériel
    assert.ok(g.listes.softs.some(n => /Coca/i.test(n)), JSON.stringify(g.listes.softs));
    assert.ok(g.listes.materiel.some(n => /Bain-marie|chafing/i.test(n)));
    // détail d'une ligne : softs + nombre, gardés à l'enregistrement et sur le bon
    const b3 = { ...g2.bon, lignes: [...g2.bon.lignes, { type: 'produit', designation: 'Pack softs', liste: 'softs', items: [{ nom: 'Coca-Cola (1,5 L)', n: '12' }, { nom: '', n: 3 }] }] };
    const s3 = (await call('/api/admin/prepa/' + id, { method: 'PUT', body: b3 })).j;
    const ps = s3.bon.lignes.find(l => l.liste === 'softs');
    assert.deepEqual(ps.items, [{ groupe: '', nom: 'Coca-Cola (1,5 L)', n: 12 }]);
    assert.match((await call('/api/admin/prepa/' + id + '/document')).j, /<b>12<\/b> Coca-Cola/);
    // message au groupe des livreurs : modèle, IA, envoi SMS
    const mo = (await call('/api/admin/prepa/' + id + '/ia', { method: 'POST', body: { role: 'livreurs', canal: 'sms', modele: true } })).j;
    assert.match(mo.texte, /^Magnolia : livraison Marcel DURAND/);
    assert.match(mo.texte, /16 h/);
    const ia = await call('/api/admin/prepa/' + id + '/ia', { method: 'POST', body: { role: 'livreurs', canal: 'sms', consigne: 'passer par l’entrée de service' } });
    assert.equal(ia.status, 200, JSON.stringify(ia.j)); assert.match(ia.j.texte, /entrée de service/);
    assert.match(vuParIa, /entrée de service/); assert.match(vuParIa, /17 h 30/); assert.doesNotMatch(vuParIa, /€/);
    assert.equal((await call('/api/admin/prepa/' + id + '/message', { method: 'POST', body: { role: 'livreurs', canal: 'sms', texte: 'Coucou', a: [{ nom: 'Romain GOUJON' }] } })).status, 400);
    const ms = await call('/api/admin/prepa/' + id + '/message', { method: 'POST', body: { role: 'livreurs', canal: 'sms', texte: mo.texte, a: [{ nom: 'Romain GOUJON', tel: '06 20 30 40 50' }, { nom: 'Sans tel' }] } });
    assert.equal(ms.status, 200, JSON.stringify(ms.j)); assert.deepEqual(ms.j.a, ['Romain GOUJON']); assert.deepEqual(ms.j.sans, ['Sans tel']);
    assert.equal(ms.j.envois.slice(-1)[0].groupe, 'livreurs');
  } finally { srv.close(); }
});

test('bon de préparation : choix du client d’un buffet avec le nombre de chaque', () => {
  const P = require('../server/prepa');
  const p = { slug: 'buffet', titre: 'Buffet antillais — Plat seul', groupes: [
    { id: 'g1', titre: 'Vos plats', mode: 'quantites', options: [{ id: 'a', label: 'Colombo de poulet' }, { id: 'b', label: 'Colombo de porc' }] },
    { id: 'g2', titre: 'Vos accompagnements', mode: null, options: [{ id: 'r', label: 'Riz nature' }] }] };
  const L = P.lignesDepuisDevis({ lignes: [{ produit: 'buffet', designation: p.titre, detail: 'Plats : …', qte: 40, unite: 'personne', choix: { g1: ['a:25', 'b:15'], g2: ['r'] } }, { produit: 'pack-softs-en-individuel', designation: 'Pack softs en individuel', qte: 40 }, { produit: 'materiel-traiteur', designation: 'Matériel traiteur', qte: 1 }] }, new Map([['buffet', p]]));
  assert.equal(L[0].liste, 'compo');
  assert.equal(L[0].detail, '');
  assert.deepEqual(L[0].items, [{ groupe: 'Plats', nom: 'Colombo de poulet', n: 25 }, { groupe: 'Plats', nom: 'Colombo de porc', n: 15 }, { groupe: 'Accompagnements', nom: 'Riz nature', n: 40 }]);
  assert.equal(L[1].liste, 'softs'); assert.equal(L[2].liste, 'materiel');
  const html = P.documentHtml({ ...P.nettoyer({ lignes: L, client: {}, evenement: {}, horaires: {} }), personnelDevis: [] });
  assert.match(html, /Plats · 40 au total/);
});

test('bon de préparation : nappes avec taille, couleur, extensible ou non', () => {
  const P = require('../server/prepa');
  assert.equal(P.listeDe('nappe-rectangulaire', 'Nappe rectangulaire 170 × 250 cm'), 'nappes');
  assert.deepEqual(P.listesPrepa([{ titre: 'Nappage — 170 × 250 cm' }]).nappes, ['170 × 250 cm']);
  const b = P.nettoyer({ lignes: [{ type: 'produit', designation: 'Nappage', liste: 'nappes', items: [{ nom: '170 × 250 cm', couleur: 'Noire', type: 'Extensible', n: '12' }] }], client: {}, evenement: {}, horaires: {} });
  assert.match(P.documentHtml({ ...b, personnelDevis: [] }), /<b>12<\/b> 170 × 250 cm · nappe noire · extensible/);
});

test('bon de préparation : unités au pluriel (« 3 nappes »)', () => {
  const P = require('../server/prepa');
  const b = P.nettoyer({ lignes: [{ type: 'produit', designation: 'Nappe', qteDevis: 3, unite: 'nappe' }, { type: 'produit', designation: 'Plateau', qteDevis: 2, unite: 'plateau' }, { type: 'produit', designation: 'Vin', qteDevis: 1, unite: 'bouteille' }, { type: 'produit', designation: 'Livraison', qteDevis: 12, unite: 'km' }], client: {}, evenement: {}, horaires: {} });
  const h = P.documentHtml({ ...b, personnelDevis: [] });
  for (const x of ['3 nappes', '2 plateaux', '1 bouteille<', '12 km']) assert.ok(h.includes(x), x);
});

test('prépa : formule entrée/plat/dessert sans choix → listes par groupe', () => {
  const P = require('../server/prepa');
  const p = { slug: 'buffet-x', groupes: [{ id: 'entrees', titre: 'Vos entrées', options: [{ id: 'a', label: 'Accras' }] }, { id: 'plats', titre: 'Vos plats', options: [{ id: 'b', label: 'Colombo' }] }, { id: 'duree', titre: 'Durée', options: [{ id: 'h', label: '4 h' }] }] };
  const by = new Map([['buffet-x', p]]);
  const L = P.lignesDepuisDevis({ lignes: [{ produit: 'buffet-x', designation: 'Buffet', qte: 20, unite: 'personne' }] }, by);
  assert.equal(L[0].liste, 'compo'); assert.deepEqual(L[0].items, []);
  assert.deepEqual(P.choixProduits(L, by), { 'buffet-x': [{ groupe: 'Entrées', options: ['Accras'] }, { groupe: 'Plats', options: ['Colombo'] }] });
});

test('prépa : quantité à préparer remplie d’après les choix', () => {
  const P = require('../server/prepa');
  assert.equal(P.qteAuto({ liste: 'compo', items: [{ groupe: 'Entrées', nom: 'Accras', n: 30 }, { groupe: 'Entrées', nom: 'Boudins', n: 30 }, { groupe: 'Plats', nom: 'Colombo', n: 30 }, { groupe: 'Desserts', nom: '', n: 5 }] }), '60 entrées · 30 plats');
  assert.equal(P.qteAuto({ liste: 'nappes', items: [{ nom: '170 × 250 cm', n: 8 }, { nom: '240 × 300 cm', n: 4 }] }), '12 nappes');
  assert.equal(P.qteAuto({ liste: 'compo', items: [] }), '');
});

test('prépa : ligne de nappes du devis → taille, couleur, extensible, nombre', () => {
  const P = require('../server/prepa');
  const L = P.lignesDepuisDevis({ lignes: [{ produit: 'nappage-170-250-cm', designation: 'Nappage — 170 × 250 cm', qte: 3, unite: 'nappe' }] }, new Map());
  assert.equal(L[0].liste, 'nappes');
  assert.deepEqual(L[0].items, [{ nom: '170 × 250 cm', couleur: 'Blanche', type: 'Non extensible', n: 3 }]);
  assert.equal(L[0].qtePrepa, '3 nappes');
  const vieux = P.completerLignes([{ type: 'produit', produit: 'nappe-noire', designation: 'Nappe noire extensible 240 x 300 cm', qteDevis: 2, liste: '', items: [], qtePrepa: '' }]);
  assert.equal(vieux[0].liste, 'nappes');
  assert.deepEqual(vieux[0].items[0], { nom: '240 × 300 cm', couleur: 'Noire', type: 'Extensible', n: 2 });
});

test('prépa : bon de récupération = lignes « À récupérer » seulement', () => {
  const P = require('../server/prepa');
  const by = new Map([['tables', { slug: 'tables', rubrique: 'mobilier-a-la-location', titre: 'Tables rectangulaires' }], ['champ', { slug: 'champ', rubrique: 'boissons', titre: 'Champagne' }]]);
  const d = { id: 'd1', numero: 'D-1', evenement: { date: '2026-12-12', adresse: '1 rue A', cp: '91300', ville: 'Massy' }, lignes: [{ produit: 'tables', designation: 'Tables rectangulaires', qte: 5, unite: 'table' }, { produit: 'champ', designation: 'Champagne', qte: 10, unite: 'bouteille' }, { produit: 'nappage-170-250-cm', designation: 'Nappage 170 × 250 cm', qte: 3, unite: 'nappe' }] };
  const b = P.bonDepuis({ devis: d, bySlug: by });
  assert.deepEqual(b.lignes.map(l => l.recup), [true, false, true]);
  const n = P.nettoyer({ ...b, recuperation: { date: '2026-12-13', heure: '10 h', lieu: '' }, recuperateurs: [{ nom: 'paul durand', tel: '0612345678' }] }, {}, by);
  assert.equal(n.recuperation.heure, '10 h'); assert.equal(n.recuperateurs[0].nom, 'Paul DURAND');
  const html = P.documentHtml(n, { recup: true });
  assert.match(html, /BON DE RÉCUPÉRATION/); assert.match(html, /Tables rectangulaires/); assert.doesNotMatch(html, /Champagne/); assert.match(html, /Paul DURAND/);
  const sms = P.modeleMessage(n, 'recuperateurs', 'sms').texte;
  assert.match(sms, /récupération/); assert.match(sms, /10 h/); assert.match(sms, /Tables/);
});
