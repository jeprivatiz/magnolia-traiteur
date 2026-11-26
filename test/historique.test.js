'use strict';
/* Historique commercial de l'ancien CRM (Teamleader, Jean-Luc 2026-11-26) : lecture de l'export des affaires,
   rattachement aux fiches (e-mail, sinon portable), source posée seulement si vide, réimport sans doublon,
   critères de recherche, statistiques (par année, par mois, clients à relancer), fiche client, annulation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ecrireXlsx } = require('../server/tableur');
const H = require('../server/historique');

const TETE = ['1  Lieu MAGNOLIA FOR EVENT', '3 Evènement', '4 Age Aniv', '5 Date', '6 Nombre PAX', 'Adresse e-mail de contact', 'Client', 'Client: E-mail', 'Client: Mobile', 'Client: Téléphone', 'Client: Ville', 'Date acceptée', 'Date ajoutée', 'Date refusé', 'Facturé', 'Facturé (Montant)', 'Marge', 'Montant HT', 'Source', 'Responsabilité', 'Motif du refus', 'Client: Code postal'];
const L = (o) => TETE.map(t => o[t] ?? '');

test('lecture de l’export : colonnes, statut, montants, sources, lieux', () => {
  const r = H.lireFichier([TETE,
    L({ '1  Lieu MAGNOLIA FOR EVENT': '(*)  LIEU DU CLIENT', '3 Evènement': 'ANNIVERSAIRE', '4 Age Aniv': '50', '5 Date': '2024-06-15', '6 Nombre PAX': '45 à 50', Client: 'marie ESSAI', 'Client: E-mail': 'Marie@Essai.test', 'Client: Mobile': '06 11 22 33 44', 'Date acceptée': '2024-05-02', 'Date ajoutée': '2024-04-20', Facturé: 'Oui', 'Facturé (Montant)': '1940.0', Marge: '0.0', 'Montant HT': '1940.0', Source: 'ABC SALLES', Responsabilité: 'Romain GOUJON' }),
    L({ '3 Evènement': 'MARIAGE', '5 Date': '2025-09-01', Client: 'ORA EVENTS', 'Client: E-mail': 'contact@ora.test', 'Date ajoutée': '2025-03-01', 'Date refusé': '2025-03-20', 'Motif du refus': 'Trop cher', 'Montant HT': '8000', Source: 'MAGNOLIA PRIVATISATION' }),
  ]);
  assert.equal(r.affaires.length, 2);
  const [a, b] = r.affaires;
  assert.equal(a.statut, 'gagnee'); assert.equal(a.email, 'marie@essai.test'); assert.equal(a.client, 'Marie ESSAI');
  assert.equal(a.montantHtCents, 194000); assert.equal(a.margeHtCents, null, 'marge 0 = non saisie'); assert.equal(a.invites, 50);
  assert.equal(a.lieu, 'Lieu du client'); assert.equal(a.source, 'ABC salles'); assert.equal(a.evenement, 'Anniversaire');
  assert.equal(b.statut, 'perdue'); assert.equal(b.motif, 'Trop cher'); assert.equal(b.societe, 'ORA EVENTS'); assert.equal(b.source, 'Magnolia Privatisation');
  assert.equal(H.lireFichier([['Nom', 'E-mail'], ['x', 'y@z.fr']]).affaires, null, 'fichier de contacts refusé');
});

test('import de l’historique dans le back-office', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-hist-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, headers: { ...(form ? {} : { 'content-type': 'application/json' }), 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  const envoyer = async lignes => { const fd = new FormData(); fd.append('fichier', new Blob([ecrireXlsx([{ nom: 'Opps', lignes }])]), 'opps.xlsx'); return call('/api/admin/actions/historique/fichier', { method: 'POST', form: fd }); };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    /* deux fiches déjà là : une avec une vraie source, une « Import » (fichier MADER) retrouvée par le portable */
    const a = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'Alice ESSAI', email: 'alice@essai.test', canal: 'Bouche à oreille', notes: '' } })).j;
    const b = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'Bruno ESSAI', tel: '06 22 33 44 55', canal: 'Import', notes: '' } })).j;
    const an = new Date().getFullYear(), d = n => `${an - n}-03-10`;
    const lignes = [TETE,
      L({ '3 Evènement': 'ANNIVERSAIRE', '5 Date': d(3), Client: 'Alice ESSAI', 'Client: E-mail': 'alice@essai.test', 'Date acceptée': d(3), 'Date ajoutée': d(3), Facturé: 'Oui', 'Montant HT': '2000', Source: '1001 SALLES', Responsabilité: 'Romain GOUJON' }),
      L({ '3 Evènement': 'ANNIVERSAIRE', '5 Date': d(2), Client: 'Alice ESSAI', 'Client: E-mail': 'alice@essai.test', 'Date acceptée': d(2), 'Date ajoutée': d(2), Facturé: 'Oui', 'Montant HT': '3000', Marge: '900', Source: '1001 SALLES', Responsabilité: 'Romain GOUJON' }),
      L({ '3 Evènement': 'MARIAGE', '5 Date': d(1), Client: 'Bruno ESSAI', 'Client: Mobile': '+33 6 22 33 44 55', 'Date acceptée': d(1), 'Date ajoutée': d(1), Facturé: 'Oui', 'Montant HT': '5000', Source: 'ABC SALLES', Responsabilité: 'Jean-Luc BERNARD' }),
      L({ '3 Evènement': 'COCKTAIL', '5 Date': d(1), Client: 'Chloé NOUVELLE', 'Client: E-mail': 'chloe@essai.test', 'Client: Mobile': '0699887766', 'Date acceptée': d(1), 'Date ajoutée': d(1), Facturé: 'Oui', 'Montant HT': '1000', Source: 'ABC SALLES', Responsabilité: 'Jean-Luc BERNARD' }),
    ];
    const up = await envoyer(lignes);
    assert.equal(up.status, 200, JSON.stringify(up.j));
    assert.equal(up.j.affaires, 4); assert.equal(up.j.clients, 3); assert.equal(up.j.retrouves, 2); assert.equal(up.j.nouveaux, 1);
    const imp = await call('/api/admin/actions/historique/importer', { method: 'POST', body: { tok: up.j.tok } });
    assert.equal(imp.status, 200, JSON.stringify(imp.j));
    assert.equal(imp.j.affairesCrees, 4); assert.equal(imp.j.clientsCrees, 1);
    const fiche = async id => (await call('/api/admin/clients/' + id)).j;
    assert.equal((await fiche(a.id)).canal, 'Bouche à oreille', 'source existante gardée');
    assert.equal((await fiche(b.id)).canal, 'ABC salles', '« Import » remplacé par la source Teamleader');
    /* fiche client : résumé + affaires dans la frise */
    const h = (await call('/api/admin/actions/historique-client/' + a.id)).j;
    assert.equal(h.historique.commandes, 2); assert.equal(h.historique.caHtCents, 500000);
    assert.equal(h.events.filter(e => e.type === 'affaire').length, 2);
    /* recherche multicritère */
    const q = async s => (await call('/api/admin/clients?page=1&' + s)).j;
    assert.equal((await q('hcmd=oui')).total, 3);
    assert.equal((await q('hcmd=2')).total, 1);
    assert.equal((await q('hmontant=4000')).total, 2);
    assert.equal((await q('hevt=Mariage')).total, 1);
    assert.equal((await q('hcmd=2&hder=plus12')).total, 1, 'Alice : fidèle sans commande depuis plus d’un an');
    const l = await q('hcmd=oui&tri=montant&sens=desc');
    assert.deepEqual(l.items.map(x => x.histo.caHtCents), [500000, 500000, 100000].sort((x, y) => y - x));
    assert.ok(l.facettes.histo.com.some(([v]) => v === 'Romain GOUJON'));
    /* statistiques */
    const st = (await call('/api/admin/statistiques')).j.historique;
    assert.equal(st.total.commandes, 4); assert.equal(st.total.caHtCents, 1100000);
    assert.equal(st.parMois.find(x => x.an === String(an - 1)).mois[2].caHtCents, 600000, 'mars de l’an dernier');
    assert.equal(st.endormis.length, 1);
    assert.equal(st.sources[0].nom, 'ABC salles');
    /* réimport du même fichier + une affaire perdue : aucun doublon */
    const up2 = await envoyer([...lignes, L({ '3 Evènement': 'MARIAGE', '5 Date': d(0), Client: 'Alice ESSAI', 'Client: E-mail': 'alice@essai.test', 'Date ajoutée': d(0), 'Date refusé': d(0), 'Motif du refus': 'Trop cher', 'Montant HT': '9000' })]);
    assert.equal(up2.j.dejaImportees, 4);
    const imp2 = (await call('/api/admin/actions/historique/importer', { method: 'POST', body: { tok: up2.j.tok } })).j;
    assert.equal(imp2.affairesCrees, 1); assert.equal(imp2.affairesMaj, 4); assert.equal(imp2.clientsCrees, 0);
    const st2 = (await call('/api/admin/statistiques')).j.historique;
    assert.equal(st2.total.commandes, 4); assert.equal(st2.total.perdues, 1); assert.equal(st2.motifs[0].nom, 'Trop cher');
    assert.equal((await q('hmotif=' + encodeURIComponent('Trop cher'))).total, 1);
    /* annulation du 2e import : l'affaire perdue disparaît, les 4 autres restent */
    assert.equal((await call(`/api/admin/actions/historique/${imp2.id}/annuler`, { method: 'POST' })).status, 200);
    assert.equal((await call('/api/admin/statistiques')).j.historique.total.affaires, 4);
    /* annulation du 1er : tout est retiré, Chloé aussi, Bruno retrouve « Import » */
    assert.equal((await call(`/api/admin/actions/historique/${imp.j.id}/annuler`, { method: 'POST' })).status, 200);
    assert.equal((await call('/api/admin/statistiques')).j.historique, null);
    assert.equal((await fiche(b.id)).canal, 'Import');
    assert.equal((await q('q=chloe')).total, 0);
  } finally { srv.close(); }
});
