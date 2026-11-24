'use strict';
/* Fichier contacts « MADER » : métiers, DJ, contact de, NE PAS CONTACTER, lignes d’essai, doublons, entreprises, recherche multicritère. */
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

const H = ['Adr. de facturation: Code postal', 'Adresse e-mail', 'Nom de famille', 'Prénom', 'Entreprises', 'Téléphone', 'adresse postale', 'adresse postale: N°', 'adresse postale: Rue', 'adresse postale: Code postal', 'adresse postale: Ville', 'adresse postale: Pays', 'NE PAS CONTACTER', 'Site web', 'Barman', 'Serveur (euse)', 'DJ', 'Contact de :', 'Société', 'Mobile', 'Genre', 'Rémunération', 'N° Compte IBAN', 'Permis de conduire', 'DJ spécialités', 'DJ experience depuis le', 'indépendant(e)'];
const L = o => H.map(h => o[h] ?? (/^(Barman|Serveur|DJ$|NE PAS|Permis|indép)/.test(h) ? '0' : ''));

test('colonnes du fichier MADER reconnues et lignes nettoyées', () => {
  const { proposer } = require('../server/import-clients');
  const p = proposer(H);
  const m = Object.fromEntries(H.map((h, i) => [h, p[i]]));
  assert.equal(m['adresse postale'], '', 'l’adresse complète n’est pas reprise deux fois');
  assert.equal(m['adresse postale: N°'], 'numero'); assert.equal(m['adresse postale: Ville'], 'ville'); assert.equal(m['adresse postale: Code postal'], 'cp');
  assert.equal(m.Barman, 'metier'); assert.equal(m['Serveur (euse)'], 'metier'); assert.equal(m.DJ, 'metier');
  assert.equal(m['Contact de :'], 'contactDe'); assert.equal(m['NE PAS CONTACTER'], 'nePasContacter');
  assert.equal(m.Mobile, 'tel', 'le portable est le téléphone principal'); assert.equal(m['Téléphone'], 'tel2');
  assert.equal(m['N° Compte IBAN'], '', 'jamais de données bancaires'); assert.equal(m['Société'], 'notes');
  assert.equal(m['DJ spécialités'], 'djStyles'); assert.equal(m['DJ experience depuis le'], 'djDepuis'); assert.equal(m['indépendant(e)'], 'independant');
  const { f } = construire(L({ 'Adresse e-mail': 'p@prosolia.com', 'Nom de famille': ' SOAVE - Soc. Prosolia', 'Prénom': 'Pauline', Genre: 'F', Barman: '1', DJ: '1', 'DJ spécialités': 'ANNEES 80, DISCO, ELECTRO', 'DJ experience depuis le': '2017-01-02 00:00:00', 'adresse postale: N°': '24', 'adresse postale: Rue': 'rue Vavin', 'adresse postale: Code postal': '75006', 'adresse postale: Ville': 'PARIS', 'adresse postale: Pays': 'France', Mobile: '+33 6 07 64 16 73' }), p, H);
  assert.equal(f.nom, 'Pauline SOAVE'); assert.equal(f.societe, 'Prosolia'); assert.equal(f.civilite, 'Mme');
  assert.deepEqual(f.metiers, ['Barman / barmaid', 'DJ']); assert.deepEqual(f.djStyles, ['Années 80', 'Disco', 'Électro']); assert.equal(f.djDepuis, '2017');
  assert.equal(f.adresse, '24 rue Vavin'); assert.equal(f.pays, undefined); assert.equal(f.tel, '06 07 64 16 73');
  const r2 = construire(L({ 'Prénom': 'Inconnu', 'Nom de famille': '-', 'Adresse e-mail': 'x@y.fr', Mobile: '0612345678', Entreprises: 'MOLITOR (SALONS), ROOFTOP MOLITOR' }), p, H).f;
  assert.equal(r2.nom, ''); assert.equal(r2.tel, undefined, 'faux numéro ignoré'); assert.equal(r2.societe, 'MOLITOR (SALONS)'); assert.match(r2.notes, /Autres sociétés : ROOFTOP MOLITOR/);
  assert.equal(construire(L({ 'Prénom': '[TEST AGENT]Jean', 'Adresse e-mail': 'jean@exemple.fr' }), p, H).essai, true);
  assert.equal(construire(L({ 'Prénom': 'Cecilia JEAN-LOUIS', 'Nom de famille': '- DTPJJ PANTIN' }), p, H).f.nom, 'Cecilia JEAN-LOUIS');
});

test('import MADER : doublons fusionnés, NE PAS CONTACTER, entreprises, recherche multicritère, envois groupés, annulation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-mader-'));
  const { srv, call, deposer, importer } = await demarrer(dir);
  try {
    const ex = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Afif BENALI', email: 'afif@exemple.fr', tel: '', notes: 'déjà là', source: 'site' } });
    const lignes = [H,
      L({ 'Adresse e-mail': 'afif@exemple.fr', 'Prénom': 'Afif', Barman: '1', 'Contact de :': 'MARION', Mobile: '07 69 58 65 55' }),
      L({ 'Adresse e-mail': 'afif@exemple.fr', 'Prénom': 'Afif', 'Serveur (euse)': '1', 'Permis de conduire': '1' }), /* doublon : on additionne les métiers */
      L({ 'Adresse e-mail': 'dj@exemple.fr', 'Prénom': 'Alex', 'Nom de famille': 'MARTIN', DJ: '1', 'DJ spécialités': 'GENERALISTE', 'Contact de :': 'JEAN LUC', Genre: 'M', Mobile: '0642871575' }),
      L({ 'Adresse e-mail': 'stop@exemple.fr', 'Prénom': 'Zoé', 'Nom de famille': 'DURAND', 'NE PAS CONTACTER': '1', Mobile: '0611111112', Entreprises: 'SOPRA STERIA' }),
      L({ 'Adresse e-mail': 'rh@sopra.fr', 'Prénom': 'Léa', 'Nom de famille': 'PETIT', Entreprises: 'SOPRA STERIA' }),
      L({ 'Adresse e-mail': 'jean@test.com', 'Prénom': '[TEST AGENT]Jean', 'Nom de famille': '[TEST AGENT]Dupont' }),
    ];
    const up = await deposer(ecrireXlsx([{ nom: 'MADER', lignes, texte: true }]), 'MADER.xlsx');
    assert.equal(up.status, 200, JSON.stringify(up.j));
    const ver = await call('/api/admin/actions/import-clients/verifier', { method: 'POST', body: { tok: up.j.tok, colonnes: up.j.proposition } });
    assert.equal(ver.j.essais, 1); assert.equal(ver.j.nouveaux, 3); assert.equal(ver.j.completes, 1); assert.equal(ver.j.doublonsFichier, 1);
    const fin = await importer(up.j.tok, up.j.proposition);
    assert.equal(fin.nouveaux, 3);
    const afif = (await call('/api/admin/clients/' + ex.j.id)).j;
    assert.deepEqual(afif.metiers, ['Barman / barmaid', 'Serveur / serveuse']); assert.equal(afif.permis, true); assert.equal(afif.contactDe, 'MARION');
    assert.equal(afif.notes, 'déjà là', 'rien d’écrasé');
    const q = async x => (await call('/api/admin/clients?page=1&par=50&' + x)).j;
    const tous = await q('');
    assert.equal(tous.tous, 4);
    assert.ok(tous.facettes.metiers.some(([m, n]) => m === 'DJ' && n === 1));
    assert.deepEqual((await q('metier=DJ')).items.map(c => c.nom), ['Alex MARTIN']);
    assert.equal((await q('metier=*')).total, 2);
    assert.equal((await q('contactDe=MARION')).items[0].id, ex.j.id);
    assert.equal((await q('npc=oui')).items[0].nom, 'Zoé DURAND');
    assert.equal((await q('civ=M.')).total, 1);
    assert.equal((await q('pro=pro')).total, 2);
    assert.equal((await q('q=barman')).total, 1, 'le métier se cherche aussi au clavier');
    const zoe = (await q('npc=oui')).items[0];
    assert.equal(zoe.desinscrit.email, true); assert.equal(zoe.desinscrit.sms, true);
    /* entreprises : SOPRA STERIA, deux contacts */
    const ents = (await call('/api/admin/entreprises?page=1')).j;
    const sopra = ents.items.find(e => e.nom === 'SOPRA STERIA');
    assert.equal(sopra.nbContacts, 2);
    /* envois groupés : le métier filtre, « ne pas contacter » jamais compté */
    const crit = (await call('/api/admin/diffusion/criteres')).j;
    assert.ok(crit.metiers.some(([m]) => m === 'DJ'));
    const sel = (await call('/api/admin/diffusion/selection', { method: 'POST', body: { canal: 'sms', criteres: { metiers: ['DJ'] } } })).j;
    assert.equal(sel.nb, 1);
    const smsTous = (await call('/api/admin/diffusion/selection', { method: 'POST', body: { canal: 'sms', criteres: {} } })).j;
    assert.ok(!smsTous.lignes.some(l => l.nom === 'Zoé DURAND'));
    /* la fiche : listes pour les cases du profil */
    const def = (await call('/api/admin/actions/profil-contact')).j;
    assert.ok(def.metiers.includes('Magicien')); assert.ok(def.contactDe.includes('JEAN LUC'));
    /* annulation : fiches créées retirées, Afif remis comme avant, entreprise vide retirée */
    const hist = (await call('/api/admin/actions/import-clients/historique')).j;
    const an = await call(`/api/admin/actions/import-clients/${hist[0].id}/annuler`, { method: 'POST' });
    assert.equal(an.status, 200, JSON.stringify(an.j));
    assert.equal(an.j.retires, 3);
    const afif2 = (await call('/api/admin/clients/' + ex.j.id)).j;
    assert.equal(afif2.metiers, undefined); assert.equal(afif2.permis, undefined);
    assert.equal((await call('/api/admin/entreprises?page=1')).j.items.length, 0);
  } finally { srv.close(); }
});
