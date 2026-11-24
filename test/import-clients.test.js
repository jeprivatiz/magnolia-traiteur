'use strict';
/* Import du fichier clients (Excel / CSV) : colonnes, doublons, téléphones, lots, annulation, et tenue à 60 000 fiches. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ecrireXlsx, lireTableau } = require('../server/tableur');
const { construire, normTel, fichierModele } = require('../server/import-clients');
const { FileStore } = require('../server/store');

async function demarrer(dir) {
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j, r };
  };
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
  const deposer = async (buf, nom) => { const fd = new FormData(); fd.append('fichier', new Blob([buf]), nom); return call('/api/admin/actions/import-clients/fichier', { method: 'POST', form: fd }); };
  const importer = async (tok, colonnes) => { let debut = 0, r; do { r = await call('/api/admin/actions/import-clients/lot', { method: 'POST', body: { tok, colonnes, debut, consentement: true } }); assert.equal(r.status, 200, JSON.stringify(r.j)); debut = r.j.fait; } while (!r.j.fini); return r.j; };
  return { app, srv, call, deposer, importer };
}

test('normalisation : téléphones (France, Antilles, étranger), noms, codes postaux', () => {
  assert.equal(normTel('612345678').e164, '+33612345678');
  assert.equal(normTel('0033 6 12 34 56 78').tel, '06 12 34 56 78');
  assert.equal(normTel('0696 12 34 56').e164, '+596696123456');
  assert.equal(normTel('+590 690 12 34 56').tel, '06 90 12 34 56');
  assert.equal(normTel('+44 7700 900123').e164, '+447700900123');
  assert.equal(normTel('12').ok, false);
  const { f } = construire(['mme', 'marie-claire', 'de la tour', '1000', 'MC@Exemple.FR', '01 69 00 00 00 / 06 11 22 33 44', '1 234,50 €', '15/06/2024', 'VIP'], ['civilite', 'prenom', 'nomFamille', 'cp', 'email', 'tel', 'caCrm', 'derniereCommande', 'notes'], ['Civ', 'Prénom', 'Nom', 'CP', 'Mail', 'Tél', 'CA', 'Dernière', 'Remarque']);
  assert.equal(f.nom, 'Marie-Claire DE LA TOUR');
  assert.equal(f.civilite, 'Mme');
  assert.equal(f.cp, '01000'); assert.equal(f.departement, '01');
  assert.equal(f.email, 'mc@exemple.fr');
  assert.equal(f.tel, '06 11 22 33 44', 'le portable passe en premier (pour les SMS)');
  assert.equal(f.telAutre, '01 69 00 00 00');
  assert.equal(f.caCrmCents, 123450);
  assert.equal(f.derniereCommande, '2024-06-15');
  assert.equal(f.notes, 'Remarque : VIP');
  assert.equal(construire(['20090'], ['cp'], ['CP']).f.departement, '2A');
  assert.equal(construire(['97139'], ['cp'], ['CP']).f.departement, '971');
});

test('le fichier modèle Excel se relit', () => {
  const l = lireTableau(fichierModele(), 'modele.xlsx');
  assert.equal(l[0][1], 'Prénom');
  assert.equal(l[1][5], '06 12 34 56 78');
});

test('import complet : aperçu, vérification, lots, doublons, fiches existantes jamais écrasées, annulation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-imp-'));
  const { srv, call, deposer, importer } = await demarrer(dir);
  try {
    /* un client déjà connu (venu du site) */
    const ex = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Claire Martin', email: 'claire@exemple.test', tel: '', notes: 'Cliente fidèle', source: 'site' } });
    assert.equal(ex.status, 200);
    const lignes = [['Nom', 'Prénom', 'Portable', 'Email', 'Code postal', 'Ville', 'CA total', 'Type événement']];
    for (let i = 0; i < 2500; i++) lignes.push([`nom${i}`, `prénom${i}`, '06' + String(10000000 + i).slice(-8), `contact${i}@exemple.test`, '91140', 'villebon-sur-yvette', '100', 'Mariage']);
    lignes.push(['MARTIN', 'claire', '0611223344', 'CLAIRE@exemple.test', '75015', 'Paris', '', 'Anniversaire']); /* existe déjà : complété */
    lignes.push(['nom1', 'prénom1', '+33 6 10 00 00 01', '', '', '', '', '']); /* doublon du fichier (même portable) */
    lignes.push(['', '', '', '', '', '', '', '']);
    lignes.push(['Sans', 'Contact', '', '', '', '', '', '']);
    const up = await deposer(ecrireXlsx([{ nom: 'Export', lignes }]), 'export-crm.xlsx');
    assert.equal(up.status, 200, JSON.stringify(up.j));
    assert.equal(up.j.total, 2503, 'la ligne vide est retirée');
    assert.deepEqual(up.j.proposition, ['nomFamille', 'prenom', 'tel', 'email', 'cp', 'ville', 'caCrm', 'notes']);
    const ver = await call('/api/admin/actions/import-clients/verifier', { method: 'POST', body: { tok: up.j.tok, colonnes: up.j.proposition } });
    assert.equal(ver.status, 200, JSON.stringify(ver.j));
    assert.equal(ver.j.nouveaux, 2501); assert.equal(ver.j.completes, 1); assert.equal(ver.j.doublonsFichier, 1); assert.equal(ver.j.sansContact, 1);
    assert.equal((await call('/api/admin/clients?page=1')).j.tous, 1, 'la vérification n’écrit rien');
    /* sans la case de consentement : refusé */
    assert.equal((await call('/api/admin/actions/import-clients/lot', { method: 'POST', body: { tok: up.j.tok, colonnes: up.j.proposition, debut: 0 } })).status, 400);
    const fin = await importer(up.j.tok, up.j.proposition);
    assert.equal(fin.nouveaux, 2501); assert.equal(fin.completes, 1); assert.equal(fin.doublonsFichier, 1);
    const p = (await call('/api/admin/clients?page=1&par=10&q=' + encodeURIComponent('contact42@exemple.test'))).j;
    assert.equal(p.total, 1);
    const c42 = p.items[0];
    assert.equal(c42.nom, 'Prénom42 NOM42');
    assert.equal(c42.telE164, '+33610000042');
    assert.equal(c42.departement, '91');
    assert.equal(c42.ville, 'villebon-sur-yvette', 'la ville reste telle qu’écrite');
    assert.equal(c42.caCrmCents, 10000);
    assert.equal(c42.consentement.sms, true);
    assert.equal(c42.statutContact, 'client existant');
    assert.match(c42.notes, /Type événement : Mariage/);
    /* recherche par téléphone, écrit autrement */
    assert.equal((await call('/api/admin/clients?page=1&q=' + encodeURIComponent('+33 6 10 00 00 42'))).j.items[0].id, c42.id);
    /* client existant : rien d'écrasé, cases vides complétées */
    const claire = (await call('/api/admin/clients/' + ex.j.id)).j;
    assert.equal(claire.nom, 'Claire Martin'.replace('Martin', 'MARTIN'));
    assert.equal(claire.notes.startsWith('Cliente fidèle'), true);
    assert.equal(claire.tel, '06 11 22 33 44');
    assert.equal(claire.cp, '75015');
    /* Suivi client : les contacts importés sans activité ne sont pas chargés d'un bloc */
    assert.equal((await call('/api/admin/clients?vue=actifs')).j.length, 1);
    /* liste en pages + filtre */
    const imp = (await call('/api/admin/clients?page=2&par=50&filtre=importes')).j;
    assert.equal(imp.total, 2501); assert.equal(imp.items.length, 50); assert.equal(imp.tous, 2502);
    /* historique, puis annulation */
    const hist = (await call('/api/admin/actions/import-clients/historique')).j;
    assert.equal(hist.length, 1); assert.equal(hist[0].statut, 'terminé');
    /* un contact importé qui a depuis une demande est gardé */
    await call('/api/demandes', { method: 'POST', body: { nom: 'Prénom7 NOM7', email: 'contact7@exemple.test', tel: '0610000007', type: 'contact', message: 'Bonjour' } });
    const an = await call(`/api/admin/actions/import-clients/${hist[0].id}/annuler`, { method: 'POST' });
    assert.equal(an.status, 200, JSON.stringify(an.j));
    assert.equal(an.j.remis, 1);
    const reste = (await call('/api/admin/clients?page=1&par=10')).j;
    assert.ok(reste.tous <= 3, 'les fiches créées par l’import sont retirées : ' + reste.tous);
    const claire2 = (await call('/api/admin/clients/' + ex.j.id)).j;
    assert.equal(claire2.tel, ''); assert.equal(claire2.cp, undefined); assert.equal(claire2.notes, 'Cliente fidèle');
    /* modèle Excel téléchargeable */
    const m = await call('/api/admin/actions/import-clients/modele.xlsx');
    assert.equal(m.status, 200);
  } finally { srv.close(); }
});

test('60 000 fiches : le stockage reste rapide et les clients sont dans leur propre fichier', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-60k-'));
  const file = path.join(dir, 'db.json');
  fs.writeFileSync(file, JSON.stringify({ 'site/reglages': { data: { a: 1 }, updatedAt: 1 }, 'clients/ancien': { data: { id: 'ancien', nom: 'Ancien' }, updatedAt: 1 } }));
  let s = new FileStore(file); await s.init();
  assert.ok(fs.existsSync(path.join(dir, 'db.clients.json')), 'ancienne base d’un seul fichier rangée');
  for (let i = 0; i < 60000; i++) await s.set('clients/c' + i, { id: 'c' + i, nom: 'Client ' + i, email: `c${i}@exemple.test`, tel: '06 12 34 56 78', notes: 'x'.repeat(120) });
  await s.flush();
  let t = Date.now();
  for (let i = 0; i < 50; i++) await s.list('demandes');
  assert.ok(Date.now() - t < 200, 'lister une petite collection ne parcourt pas les 60 000 clients (' + (Date.now() - t) + ' ms)');
  t = Date.now(); await s.set('site/reglages', { a: 2 }); await s.flush();
  assert.ok(Date.now() - t < 200, 'modifier un réglage ne réécrit pas le fichier clients (' + (Date.now() - t) + ' ms)');
  assert.ok(fs.statSync(file).size < 10000);
  await s.delete('clients/c5'); await s.close();
  s = new FileStore(file); await s.init();
  assert.equal((await s.list('clients')).length, 60000, '60 000 + l’ancien - 1 supprimé');
  assert.equal((await s.get('site/reglages')).a, 2);
  assert.equal(await s.get('clients/c5'), null);
});
