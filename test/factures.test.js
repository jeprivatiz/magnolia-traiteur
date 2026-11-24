'use strict';
/* Factures comme un CRM : règlement sur devis signé → facture « à envoyer », plusieurs acomptes, solde dû, envoi avec aperçu, relance, archive, avoir, recherche et export. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FAC = require('../server/factures');

test('factures : acomptes multiples, solde, archive, avoir', async () => {
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
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Sophie Durand', email: 'sophie@example.test', tel: '0612345678', societe: 'Durand Events' } });
    const id = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } })).j.id;
    const d = (await call('/api/admin/devis/' + id)).j;
    const loin = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, evenement: { type: 'Mariage', date: loin, invites: 100 }, lignes: [{ designation: 'Buffet antillais', qte: 100, unite: 'personne', puCents: 2500, tva: 10 }] } });
    // pas de règlement sur un devis non signé
    assert.equal((await call('/api/admin/actions/reglement-devis/' + id, { method: 'POST', body: { montantCents: 1000 } })).status, 400);
    // envoi puis signature en ligne
    assert.equal((await call('/api/admin/actions/envoyer-devis/' + id, { method: 'POST', body: { canaux: ['email'] } })).status, 200);
    await call('/api/devis/' + d.token + '/accepter', { method: 'POST', body: { nom: 'Sophie Durand', ok: true } });
    let dv = (await call('/api/admin/devis/' + id)).j;
    if (dv.statut !== 'accepte') { await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...dv, statut: 'accepte' } }); dv = (await call('/api/admin/devis/' + id)).j; }
    assert.equal(dv.statut, 'accepte');
    // 1er acompte : la facture se crée toute seule, « à envoyer »
    const r1 = await call('/api/admin/actions/reglement-devis/' + id, { method: 'POST', body: { montantCents: 100000, date: '2026-11-20', moyen: 'Virement' } });
    assert.equal(r1.status, 200, JSON.stringify(r1.j)); assert.ok(r1.j.cree); assert.match(r1.j.numero, /^F-\d{4}-\d{4}$/);
    let L = (await call('/api/admin/actions/factures')).j;
    assert.equal(L.length, 1); assert.equal(L[0].statutF, 'a_envoyer'); assert.equal(L[0].etat.resteCents, 150000);
    // 2e acompte sur le même devis : même facture
    const r2 = await call('/api/admin/actions/reglement-devis/' + id, { method: 'POST', body: { montantCents: 50000, date: '2026-11-22', moyen: 'Chèque', note: 'chèque 1234' } });
    assert.equal(r2.j.id, r1.j.id); assert.ok(!r2.j.cree); assert.equal(r2.j.resteCents, 100000);
    const fid = r1.j.id;
    // l'archive est refusée tant qu'il reste un solde
    assert.equal((await call('/api/admin/actions/archiver-facture/' + fid, { method: 'POST', body: {} })).status, 400);
    // aperçu de l'e-mail : chaque acompte avec sa date + solde
    const ap = (await call('/api/admin/actions/envoyer-facture/' + fid, { method: 'POST', body: { apercu: true } })).j;
    assert.match(ap.html, /1er acompte versé le 20 nov/); assert.match(ap.html, /2e acompte versé le 22 nov/); assert.match(ap.html, /Solde restant dû/); assert.match(ap.html, /1\s000,00/);
    assert.equal(ap.to, 'sophie@example.test');
    let f = (await call('/api/admin/actions/facture/' + fid)).j;
    assert.ok(!f.envoyeeLe, 'l’aperçu n’envoie rien');
    assert.equal((await call('/api/admin/actions/envoyer-facture/' + fid, { method: 'POST', body: { canaux: ['email', 'sms'] } })).status, 200);
    f = (await call('/api/admin/actions/facture/' + fid)).j;
    assert.ok(f.envoyeeLe); assert.equal(f.envois.length, 1); assert.equal(f.envois[0].resteCents, 100000); assert.equal(f.statutF, 'non_reglee');
    // page client de la facture
    const page = (await call('/facture/' + f.token)).j;
    assert.match(page, /1er acompte versé le/); assert.match(page, /Solde restant dû/); assert.match(page, /Acompte reçu/);
    // relance
    const rl = await call('/api/admin/actions/relancer-facture/' + fid, { method: 'POST', body: { apercu: true } });
    assert.match(rl.j.sujet, /Rappel/);
    assert.equal((await call('/api/admin/actions/relancer-facture/' + fid, { method: 'POST', body: { canaux: ['email'] } })).status, 200);
    // recherche (serveur et règles partagées)
    assert.ok(FAC.correspond(f, 'durand')); assert.ok(FAC.correspond(f, f.numero)); assert.ok(FAC.correspond(f, '1000')); assert.ok(FAC.correspond(f, '2 500,00')); assert.ok(!FAC.correspond(f, 'martin'));
    // solde : réglée, puis archivée
    await call('/api/admin/actions/facture-reglement/' + fid, { method: 'POST', body: { montantCents: 100000, date: '2026-11-24', moyen: 'Carte bancaire' } });
    f = (await call('/api/admin/actions/facture/' + fid)).j;
    assert.equal(f.statutF, 'reglee'); assert.equal(f.etat.resteCents, 0); assert.equal(f.reglements[2].libelle, 'Solde');
    assert.equal((await call('/api/admin/actions/archiver-facture/' + fid, { method: 'POST', body: {} })).status, 200);
    L = (await call('/api/admin/actions/factures')).j; assert.equal(L[0].statutF, 'archivee');
    // historique client
    const h = (await call('/api/admin/actions/historique-client/' + cl.j.id)).j;
    assert.ok(h.events.some(e => /1er acompte reçu/.test(e.titre))); assert.ok(h.events.some(e => /Relance du solde/.test(e.titre)));
    assert.equal(h.resume.regleCents, 250000); assert.equal(h.resume.aEncaisserCents, 0);
    // export
    const ex = await call('/api/admin/actions/export/factures'); assert.equal(ex.status, 200); assert.match(ex.j, /Reste dû/);
    const er = await call('/api/admin/actions/export/reglements'); assert.match(er.j, /chèque 1234/);
    // une facture ne s'efface pas : avoir
    assert.equal((await call('/api/admin/factures/' + fid, { method: 'DELETE' })).status, 400);
    const av = await call('/api/admin/actions/avoir-facture/' + fid, { method: 'POST', body: { motif: 'essai' } });
    assert.equal(av.status, 200); assert.match(av.j.numero, /^A-\d{4}-0001$/);
    L = (await call('/api/admin/actions/factures')).j;
    assert.deepEqual(L.map(x => x.statutF).sort(), ['annulee', 'avoir']);
    assert.equal((await call('/api/admin/factures/' + av.j.id + '/apercu')).status, 200);
  } finally { srv.close(); }
});

test('libellés et petite commande', () => {
  const f = { lignes: [{ designation: 'x', qte: 1, puCents: 50000, tva: 10 }], reglements: [{ id: 'a', montantCents: 50000, date: '2026-11-01', moyen: 'Virement' }] };
  assert.equal(FAC.libelles(f)[0].libelle, 'Règlement'); assert.ok(FAC.etat(f).payee);
  assert.equal(FAC.centimesTexte('1 250,50 €'), 125050);
  assert.equal(FAC.echeance({ evenementDate: '2026-12-20', date: '2026-11-01' }), '2026-12-10');
});
