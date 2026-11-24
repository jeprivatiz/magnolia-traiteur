'use strict';
/* Droits détaillés des membres (Jean-Luc, 2026-11-24) : « + Ajouter une personne » avec cases à cocher,
   appliqués par le serveur (pas seulement des menus cachés). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('droits détaillés : création, opportunités, prix, fichiers, factures, équipe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const session = () => { let cookie = ''; return async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; }; };
  const chef = session(), romain = session(), prod = session(), visiteur = session();
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    const site = nom => visiteur('/api/demandes', { method: 'POST', body: { nom, email: nom.split(' ')[0].toLowerCase() + '@example.test', tel: '06 12 34 56 78', evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp: '91140', ville: 'Villebon-sur-Yvette', lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } });
    for (const n of ['Anne Romain', 'Bruno Steph', 'Carla Libre']) assert.equal((await site(n)).status, 200);

    await chef('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const s0 = (await chef('/api/session')).j;
    assert.equal(s0.droits.admin, true, 'Liam (ancien Manager) garde tout');
    assert.ok((await chef('/api/admin/actions/droits')).j.droits.length >= 10);

    /* + Ajouter une personne : un commercial qui ne voit que ses dossiers, un responsable produits sans les prix */
    const r1 = await chef('/api/admin/actions/equipe', { method: 'POST', body: { nom: 'romain goujon', email: 'romain@magnolia.test', password: 'provisoire-123', envoyerAcces: true, droits: { diffusion: true } } });
    assert.equal(r1.status, 200); assert.ok(r1.j.mail, 'e-mail d’accès préparé');
    /* fiche en trois cases : Prénom, Nom, Portable */
    assert.equal((await chef('/api/admin/actions/equipe', { method: 'POST', body: { prenom: 'hermine', nomFamille: 'durand', portable: '06 1', email: 'h@magnolia.test', password: 'provisoire-123', droits: {} } })).status, 400, 'portable illisible');
    assert.equal((await chef('/api/admin/actions/equipe', { method: 'POST', body: { prenom: 'hermine', nomFamille: 'durand', portable: '0612345678', email: 'h@magnolia.test', password: 'provisoire-123', droits: {} } })).status, 200);
    let uH = (await chef('/api/admin/actions/equipe')).j.find(u => u.email === 'h@magnolia.test');
    assert.equal(uH.nom, 'Hermine DURAND'); assert.equal(uH.prenom, 'Hermine'); assert.equal(uH.nomFamille, 'DURAND'); assert.equal(uH.portable, '06 12 34 56 78');
    await chef('/api/admin/actions/equipe/' + uH.id, { method: 'PATCH', body: { nomFamille: 'Martin-Durand', portable: '+33 7 63 66 98 92' } });
    uH = (await chef('/api/admin/actions/equipe')).j.find(u => u.email === 'h@magnolia.test');
    assert.equal(uH.nom, 'Hermine MARTIN-DURAND'); assert.equal(uH.portable, '07 63 66 98 92');
    const liam = (await chef('/api/admin/actions/equipe')).j.find(u => u.email === 'chef@magnolia.test');
    assert.equal(liam.prenom, 'Liam'); assert.equal(liam.nomFamille, 'BERNARD', 'ancien compte découpé');
    await chef('/api/admin/actions/equipe', { method: 'POST', body: { nom: 'Paula Produits', email: 'paula@magnolia.test', password: 'provisoire-123', droits: { toutes: true, produits: true } } });
    const eq = (await chef('/api/admin/actions/equipe')).j;
    const uR = eq.find(u => u.email === 'romain@magnolia.test');
    assert.equal(uR.nom, 'Romain GOUJON'); assert.equal(uR.droits.toutes, false); assert.equal(uR.droits.diffusion, true); assert.equal(uR.role, 'collab');

    const dem = (await chef('/api/admin/demandes')).j;
    const d = n => dem.find(x => x.contact?.nom?.startsWith(n));
    await chef('/api/admin/demandes/' + d('Anne').id, { method: 'PUT', body: { ...d('Anne'), commercial: 'Romain GOUJON' } });
    await chef('/api/admin/demandes/' + d('Bruno').id, { method: 'PUT', body: { ...d('Bruno'), commercial: 'Stéphanie' } });

    await romain('/api/auth/login', { method: 'POST', body: { email: 'romain@magnolia.test', password: 'provisoire-123' } });
    const sR = (await romain('/api/session')).j;
    assert.equal(sR.droits.toutes, false);
    const vues = (await romain('/api/admin/demandes')).j.map(x => x.contact.nom).sort();
    assert.deepEqual(vues, ['Anne ROMAIN', 'Carla LIBRE'], 'ses demandes + celles que personne n’a prises');
    assert.equal((await romain('/api/admin/demandes/' + d('Bruno').id)).status, 404);
    assert.equal((await romain('/api/admin/actions/devis-depuis-demande/' + d('Bruno').id, { method: 'POST', body: {} })).status, 404);
    const st = (await romain('/api/admin/stats?com=Stéphanie')).j;
    assert.equal(st.siennes, true); assert.deepEqual(st.commerciaux, ['Romain GOUJON']);
    assert.equal((await romain('/api/admin/factures')).status, 403);
    assert.equal((await romain('/api/admin/actions/export/clients')).status, 403);
    assert.equal((await romain('/api/admin/diffusion/criteres')).status, 200);
    assert.equal((await romain('/api/admin/produits/' + p.slug, { method: 'PUT', body: { ...p, titre: 'x' } })).status, 403);
    assert.equal((await romain('/api/admin/actions/equipe', { method: 'POST', body: { nom: 'Pirate', email: 'p@x.test', password: 'aaaaaaaaaa', droits: { admin: true } } })).status, 403);
    assert.equal((await romain('/api/admin/actions/journal')).status, 403);
    assert.equal((await romain('/api/admin/site', { method: 'PUT', body: { slogan: 'pirate' } })).status, 403);

    /* responsable produits : modifie les fiches, mais pas les prix */
    await prod('/api/auth/login', { method: 'POST', body: { email: 'paula@magnolia.test', password: 'provisoire-123' } });
    const fiche = (await prod('/api/admin/produits/' + p.slug)).j;
    assert.equal((await prod('/api/admin/produits/' + p.slug, { method: 'PUT', body: { ...fiche, titre: fiche.titre + ' (maison)' } })).status, 200);
    const fiche2 = (await prod('/api/admin/produits/' + p.slug)).j;
    const refus = await prod('/api/admin/produits/' + p.slug, { method: 'PUT', body: { ...fiche2, prixCents: fiche2.prixCents + 100 } });
    assert.equal(refus.status, 403); assert.match(refus.j.error, /Modifier les prix/);
    assert.equal((await prod('/api/admin/demandes')).j.length, 3, 'voit toutes les opportunités');
    const R = (await chef('/api/admin/site')).j;
    assert.equal((await prod('/api/admin/site', { method: 'PUT', body: { tarifs: { ...(R.tarifs || {}), kmCents: 999 } } })).status, 403);

    /* l'administrateur : jamais sans administrateur, et pas de retrait de ses propres droits */
    const moi = eq.find(u => u.email === 'chef@magnolia.test');
    assert.equal((await chef('/api/admin/actions/equipe/' + moi.id, { method: 'PATCH', body: { droits: { toutes: true } } })).status, 400);
    /* droits changés : effet immédiat */
    assert.equal((await chef('/api/admin/actions/equipe/' + uR.id, { method: 'PATCH', body: { droits: { toutes: true, factures: true, fichiers: true } } })).status, 200);
    assert.equal((await romain('/api/admin/demandes')).j.length, 3);
    assert.equal((await romain('/api/admin/factures')).status, 200);
    assert.equal((await romain('/api/admin/actions/export/clients')).status, 200);
    /* désactivé : déconnecté tout de suite */
    assert.equal((await chef('/api/admin/actions/equipe/' + uR.id, { method: 'PATCH', body: { desactive: true } })).status, 200);
    assert.equal((await romain('/api/admin/demandes')).status, 401);
  } finally { srv.close(); }
});
