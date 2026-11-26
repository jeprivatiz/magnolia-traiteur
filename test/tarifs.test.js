'use strict';
/* Validation tarifs (Jean-Luc, 2026-11-26) : spécialités, fiche fournisseur, document A4, scans signés privés */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../server/tarifs');

test('noms des spécialités et pagination A4', () => {
  assert.equal(T.nomSpecialite('Buffet antillais · par Magnolia'), 'Spécialité antillaise');
  assert.equal(T.nomSpecialite('Buffet chinois'), 'Spécialité chinoise');
  assert.equal(T.nomSpecialite('Buffet indien'), 'Spécialité indienne');
  assert.equal(T.nomSpecialite('Spécialités japonaises'), 'Spécialité japonaise');
  assert.equal(T.nomSpecialite('Paella party'), 'Paella party');
  assert.deepEqual(T.pagination(5).pages, [5]);
  assert.ok(T.pagination(5).ligne > T.pagination(12).ligne, 'peu de produits : lignes et photos plus grandes');
  for (let n = 1; n <= 150; n++) {
    const p = T.pagination(n);
    assert.equal(p.pages.reduce((a, b) => a + b, 0), n);
    assert.ok(p.pages.every(x => x > 0), 'aucune page vide (n=' + n + ')');
  }
});

test('Validation tarifs : fiche fournisseur, choix, document, scan privé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const req = async (u, { method = 'GET', body, form } = {}) => { const r = await fetch(base + u, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { /* */ } return { status: r.status, j, t, type: r.headers.get('content-type') }; };
  try {
    assert.equal((await req('/api/admin/tarifs')).status, 401, 'réservé à l’équipe');
    await req('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const L = (await req('/api/admin/tarifs')).j;
    assert.ok(L.profils.includes('Poissonnier'), 'profil Poissonnier proposé');
    const pr = (await req('/api/admin/tarifs/profils', { method: 'POST', body: { nom: 'fromager' } })).j;
    assert.equal(pr.nom, 'Fromager'); assert.ok(pr.profils.indexOf('Fromager') < pr.profils.indexOf('Autre'));
    assert.equal((await req('/api/admin/tarifs/profils', { method: 'POST', body: { nom: 'FROMAGER' } })).j.profils.filter(x => /fromager/i.test(x)).length, 1, 'pas de doublon');
    const fr = (await req('/api/admin/tarifs/fournisseurs', { method: 'POST', body: { entreprise: 'Fromagerie Essai', profil: 'Fromager' } })).j.fournisseur;
    assert.equal(fr.profil, 'Fromager');
    assert.ok(!(await req('/api/admin/tarifs/profils/retirer', { method: 'POST', body: { nom: 'Fromager' } })).j.profils.includes('Fromager'));
    assert.equal((await req('/api/admin/tarifs/fournisseurs/' + fr.id)).j.profil, 'Fromager', 'la fiche garde son profil');
    await req('/api/admin/tarifs/fournisseurs/' + fr.id, { method: 'DELETE' });
    assert.ok(L.specialites.length > 5);
    assert.ok(!L.specialites.some(s => /personnel|musique|lieux/i.test(s.cle)), 'pas de rubriques de services');
    const spe = L.specialites.find(s => s.n >= 3) || L.specialites[0];
    const d = (await req('/api/admin/tarifs/specialite/' + spe.cle)).j;
    assert.equal(d.produits.length, spe.n);
    assert.equal(d.choix.duree, 6, 'tarifs garantis 6 mois par défaut');

    const f = (await req('/api/admin/tarifs/fournisseurs', { method: 'POST', body: { prenom: 'marie', nom: 'Exemple', entreprise: 'Fournisseur Secret Essai', profil: 'Restaurant', ville: 'Évry' } })).j.fournisseur;
    assert.equal(f.nom, 'EXEMPLE'); assert.equal(f.prenom, 'Marie');
    const retire = d.produits[0].slug;
    await req('/api/admin/tarifs/specialite/' + spe.cle, { method: 'PUT', body: { fournisseurId: f.id, exclus: [retire], quantites: { [d.produits[1].slug]: '1 kg' }, duree: 24 } });
    const doc = await req('/api/admin/tarifs/document/' + spe.cle);
    assert.equal(doc.status, 200);
    assert.match(doc.t, /TARIFS PRÉFÉRENTIELS ACCORDÉS À MAGNOLIA TRAITEUR/);
    assert.match(doc.t, /pour la commercialisation de nos produits sur le site www\.magnoliatraiteur\.fr/);
    assert.match(doc.t, /Fournisseur Secret Essai/); assert.ok(!/1 personne|1 kg/.test(doc.t), 'colonne Quantité vide'); assert.match(doc.t, /Tarif préférentiel TTC accordé à Magnolia Traiteur/); assert.match(doc.t, /Tarif client habituel TTC<\/th><th class="px">Tarif préférentiel/); assert.match(doc.t, /24 mois/); assert.match(doc.t, /rémunération provient exclusivement de la marge/); assert.match(doc.t, /Tarifs accordés le/);
    assert.ok(!doc.t.includes('>' + d.produits[0].titre + '<'), 'produit décoché absent du document');
    assert.equal((doc.t.match(/<td class="no">/g) || []).length, spe.n - 1);

    /* tarif client habituel : liste collée, rapprochée par le nom */
    const t1 = d.produits[1].titre.replace(/\s*\(.*\)\s*$/, '');
    const im = (await req('/api/admin/tarifs/specialite/' + spe.cle + '/habituels', { method: 'POST', body: { texte: `${t1} ; 12,50\nProduit qui n’existe pas ; 3` } })).j;
    assert.equal(im.trouves.length, 1); assert.equal(im.nonTrouves.length, 1);
    const doc2 = await req('/api/admin/tarifs/document/' + spe.cle);
    assert.match(doc2.t, /12,50 €/, 'tarif habituel imprimé');
    assert.equal((await req('/api/admin/tarifs/specialite/' + spe.cle)).j.produits[1].habituelCents, 1250);

    /* deux fournisseurs pour la même spécialité : chacun sa grille, comparatif = le moins cher */
    const g = (await req('/api/admin/tarifs/fournisseurs', { method: 'POST', body: { entreprise: 'Second Essai', profil: 'Traiteur' } })).j.fournisseur;
    const s1 = d.produits[1].slug, s2 = d.produits[2].slug;
    await req('/api/admin/tarifs/specialite/' + spe.cle, { method: 'PUT', body: { fournisseurId: f.id, accordes: { [s1]: 1000, [s2]: 800 } } });
    await req('/api/admin/tarifs/specialite/' + spe.cle, { method: 'PUT', body: { fournisseurId: g.id } });
    const dg = (await req('/api/admin/tarifs/specialite/' + spe.cle)).j;
    assert.equal(dg.choix.fournisseurId, g.id); assert.ok(dg.produits[0].retire, 'reprend les produits décochés'); assert.equal(dg.produits[1].habituelCents, null, 'jamais les prix de l’autre'); assert.equal(dg.grilles.length, 2);
    await req('/api/admin/tarifs/specialite/' + spe.cle, { method: 'PUT', body: { fournisseurId: g.id, accordes: { [s1]: 900, [s2]: 850 } } });
    const cp = (await req('/api/admin/tarifs/comparatif')).j;
    const l1 = cp.lignes.find(l => l.slug === s1), l2 = cp.lignes.find(l => l.slug === s2);
    assert.equal(l1.meilleur.id, g.id); assert.equal(l1.ecart, 100); assert.equal(l2.meilleur.id, f.id);
    assert.equal(cp.fournisseurs.length, 2);
    await req('/api/admin/tarifs/specialite/' + spe.cle, { method: 'PUT', body: { fournisseurId: f.id } });
    assert.equal((await req('/api/admin/tarifs/specialite/' + spe.cle)).j.produits[1].habituelCents, 1250, 'la grille du premier est intacte');

    /* spécialités cochées sur la fiche : cocher ouvre une grille, décocher la retire */
    const autre = L.specialites.find(x => x.cle !== spe.cle).cle;
    const rs = (await req('/api/admin/tarifs/fournisseurs/' + g.id + '/specialites', { method: 'POST', body: { cles: [autre] } })).j;
    assert.deepEqual(rs.ajoutees, [autre]); assert.deepEqual(rs.retirees, [spe.cle]);
    assert.deepEqual((await req('/api/admin/tarifs/fournisseurs/' + g.id)).j.specialites, [autre]);

    /* envoi par e-mail : lettre à en-tête + PDF joint, noté dans le dossier */
    const le = (await req('/api/admin/tarifs/specialite/' + spe.cle + '/lettre')).j;
    assert.match(le.texte, /Suite à notre conversation téléphonique/); assert.match(le.texte, /groupes/);
    const ap = (await req('/api/admin/tarifs/specialite/' + spe.cle + '/envoyer', { method: 'POST', body: { apercu: true, texte: 'Bonjour,\n\nLigne essai' } })).j;
    assert.match(ap.html, /Ligne essai/); assert.match(ap.html, /Pièce jointe/);
    assert.equal((await req('/api/admin/tarifs/specialite/' + spe.cle + '/envoyer', { method: 'POST', body: { to: 'pas-un-mail', texte: 'x', pdf: 'JVBERi0x' } })).status, 400);
    assert.equal((await req('/api/admin/tarifs/specialite/' + spe.cle + '/envoyer', { method: 'POST', body: { to: 'a@b.fr', texte: 'x', pdf: 'pas un pdf' } })).status, 400);
    assert.equal((await req('/api/admin/tarifs/specialite/' + spe.cle + '/envoyer', { method: 'POST', body: { to: 'four@essai.fr', objet: 'Grille', texte: 'Bonjour', pdf: Buffer.from('%PDF-1.3 essai').toString('base64') } })).status, 200);
    const fe = (await req('/api/admin/tarifs/fournisseurs/' + f.id)).j;
    assert.equal(fe.envois.length, 1); assert.equal(fe.envois[0].to, 'four@essai.fr'); assert.equal(fe.email, 'four@essai.fr', 'e-mail retenu sur la fiche');

    /* scan signé : déposé dans le dossier, servi seulement à l'équipe */
    const fd = new FormData();
    fd.append('fichier', new Blob(['%PDF-1.4 essai'], { type: 'application/pdf' }), 'tableau-signe.pdf');
    fd.append('specialite', spe.cle); fd.append('signeLe', '2026-11-26');
    const up = await req('/api/admin/tarifs/fournisseurs/' + f.id + '/scans', { method: 'POST', form: fd });
    assert.equal(up.status, 200, up.t);
    const fiche = (await req('/api/admin/tarifs/fournisseurs/' + f.id)).j;
    assert.equal(fiche.scans.length, 1); assert.deepEqual(fiche.specialites, [spe.cle]);
    const vu = await req('/api/admin/tarifs/fournisseurs/' + f.id + '/scans/' + fiche.scans[0].nom);
    assert.equal(vu.status, 200); assert.match(vu.t, /%PDF/);
    assert.equal((await req('/api/admin/tarifs/fournisseurs/' + f.id, { method: 'DELETE' })).status, 409, 'fiche avec documents signés protégée');
    assert.equal((await fetch(base + '/media/' + fiche.scans[0].nom)).status, 404, 'jamais dans les médias publics');
    const anon = await fetch(base + '/api/admin/tarifs/fournisseurs/' + f.id + '/scans/' + fiche.scans[0].nom);
    assert.equal(anon.status, 401);

    /* jamais sur le site public */
    for (const u of ['/', '/boutique', '/saveurs-du-monde']) { const h = await (await fetch(base + u)).text(); assert.ok(!h.includes('Fournisseur Secret Essai'), u); }
  } finally { srv.close(); await app.locals.store?.close?.(); }
});
