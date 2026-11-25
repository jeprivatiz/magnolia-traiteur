'use strict';
/* Envoi automatique (Jean-Luc, 2026-11-24) : une demande complète du site repart aussitôt avec son devis, envoyé « par l'IA » ;
   une demande avec une prestation inconnue (ou une info manquante) reste dans « Demandes de devis ». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { raisonsDevisManuel } = require('../server/devis');

test('devis complet envoyé tout seul, demande incomplète laissée à l’équipe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const log = { log() {}, warn() {}, error() {}, info() {} };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const store = app.locals.store;
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque' && !x.aCompleter && !(x.groupes || []).length);
    const date = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const base0 = { tel: '06 12 34 56 78', evenement: 'Anniversaire', date, invites: 40, cp: '91140', ville: 'Villebon-sur-Yvette', km: 24 };
    const envoyer = (nom, extra) => call('/api/demandes', { method: 'POST', body: { ...base0, nom, email: nom.split(' ')[0].toLowerCase() + '@example.test', lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }], ...extra } });

    /* 1. tout est connu : devis créé et envoyé aussitôt */
    const r1 = await envoyer('Alice Complete');
    assert.equal(r1.status, 200); assert.equal(r1.j.devisEnvoye, true);
    /* 2. une prestation qui n'est pas dans le catalogue : reste en attente */
    const r2 = await envoyer('Bruno Inconnu', { lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }, { slug: 'gateau-licorne-inexistant', titre: 'Gâteau licorne', qte: 1 }] });
    assert.equal(r2.status, 200); assert.ok(!r2.j.devisEnvoye);
    /* 3. adresse sans distance : reste en attente */
    const r3 = await envoyer('Chloe Sansadresse', { km: 0 });
    assert.ok(!r3.j.devisEnvoye);

    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const dem = (await call('/api/admin/demandes')).j, dv = (await call('/api/admin/devis')).j;
    const de = n => dem.find(d => d.contact.nom.startsWith(n));
    const a = de('Alice'), b = de('Bruno'), ch = de('Chloe');
    const va = dv.find(v => v.demandeId === a.id);
    assert.ok(va, 'devis créé'); assert.equal(va.statut, 'envoye'); assert.equal(va.auto, true); assert.equal(va.commercial, null);
    assert.equal(va.envois[0].ia, true); assert.deepEqual(va.envois[0].canaux, ['email', 'sms']);
    assert.ok(va.lignes.some(l => l.unite === 'km' && l.qte === 24), 'livraison au kilomètre');
    assert.equal(a.statut, 'devis_envoye'); assert.ok(a.priseEnCharge?.ia, 'passe dans Suivi client'); assert.equal(a.devisAuto.envoye, true);
    assert.ok(!dv.some(v => v.demandeId === b.id)); assert.ok(!b.priseEnCharge); assert.equal(b.statut, 'demande');
    assert.match(b.devisAuto.raisons.join(' '), /Gâteau licorne.*catalogue/);
    assert.match(ch.devisAuto.raisons.join(' '), /adresse/);
    assert.equal((await call('/api/admin/stats')).j.nouvellesTous, 2, 'seules les 2 demandes incomplètes restent à traiter');

    /* timeline du client : « Devis … envoyé par l'IA » */
    const h = (await call('/api/admin/actions/historique-client/' + a.clientId)).j;
    const evs = h.evenements || h.events || h;
    assert.ok(JSON.stringify(evs).includes('envoyé par l’IA'), 'historique : envoyé par l’IA');

    /* envoi manuel : « envoyé par Prénom NOM » */
    const nv = (await call('/api/admin/actions/devis-depuis-demande/' + b.id, { method: 'POST' })).j;
    const vb = await store.get('devis/' + nv.id);
    await store.set('devis/' + nv.id, { ...vb, lignes: vb.lignes.filter(l => l.puCents > 0) });
    assert.equal((await call('/api/admin/actions/envoyer-devis/' + nv.id, { method: 'POST', body: { canaux: ['email'] } })).status, 200);
    const hb = JSON.stringify((await call('/api/admin/actions/historique-client/' + b.clientId)).j);
    assert.ok(hb.includes('envoyé par Liam Bernard'), 'historique : envoyé par le commercial');

    /* e-mail et SMS à l'équipe pour rappeler le client */
    const envois = JSON.stringify((await call('/api/admin/actions/envois')).j);
    assert.ok(envois.includes('envoyé par l’IA à Alice'), 'alerte équipe');
    assert.ok(envois.includes('0658226969') || envois.includes('06 58 22 69 69') || envois.includes('33658226969'), 'SMS au 06 58 22 69 69');
    assert.ok(envois.includes('devis envoyé par l\'IA. Alice'), 'texte du SMS');

    /* interrupteur : désactivé, tout attend l'équipe */
    assert.equal((await call('/api/admin/site', { method: 'PUT', body: { devisAuto: false } })).status, 200);
    const r4 = await envoyer('Denis Arret');
    assert.ok(!r4.j.devisEnvoye);
    const d4 = (await call('/api/admin/demandes')).j.find(d => d.contact.nom.startsWith('Denis'));
    assert.match(d4.devisAuto.raisons[0], /désactivé/);
  } finally { srv.close(); }
});

test('raisons de traitement à la main', () => {
  const p = { slug: 'x', prixCents: 1000, min: 10, groupes: [{ id: 'g', titre: 'Plats', max: 2, exact: true, options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }] };
  const c = { bySlug: new Map([['x', p]]) };
  const d = { type: 'devis', contact: { tel: '0612345678' }, evenement: { date: '2099-01-01', invites: 20, ville: 'Massy' }, livraison: { km: 10 }, lignes: [{ slug: 'x', titre: 'X', qte: 10, prixCents: 1000, choix: { g: ['a', 'b'] } }] };
  assert.deepEqual(raisonsDevisManuel(d, c), []);
  assert.match(raisonsDevisManuel({ ...d, lignes: [{ ...d.lignes[0], qte: 5 }] }, c).join(), /minimum/);
  assert.match(raisonsDevisManuel({ ...d, lignes: [{ ...d.lignes[0], choix: { g: ['a'] } }] }, c).join(), /2 choix/);
  assert.match(raisonsDevisManuel({ ...d, evenement: { ...d.evenement, date: new Date().toISOString().slice(0, 10) } }, c).join(), /moins de 2 jours/);
  assert.match(raisonsDevisManuel({ ...d, contact: {} }, c).join(), /téléphone/);
});
