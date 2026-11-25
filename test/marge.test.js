'use strict';
/* Marge des devis (Jean-Luc, 2026-11-25) : prix de vente + prix d'achat sur chaque fiche, marge HT sur les devis,
   prix d'achat JAMAIS visible par le client (site, devis, aperçu). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { marge, coutLigne, lignesDepuisDemande, totaux } = require('../server/devis');

test('marge HT : TVA retirée de la vente et de l’achat, lignes sans prix d’achat signalées et non comptées à 0', () => {
  const m = marge({ lignes: [
    { designation: 'Colombo', qte: 10, puCents: 1100, coutCents: 550, tva: 10 }, /* vente 110 € TTC = 100 HT ; achat 55 € TTC = 50 HT */
    { type: 'titre', designation: 'Section' },
    { designation: 'Livraison', qte: 20, puCents: 100, coutCents: null, tva: 20 },
  ] });
  assert.equal(m.venteHtCents, 10000); assert.equal(m.achatHtCents, 5000); assert.equal(m.achatTtcCents, 5500);
  assert.equal(m.margeHtCents, 5000); assert.equal(m.pct, 50);
  assert.deepEqual(m.manquants, ['Livraison']); assert.equal(m.connu, true);
  /* remise de 10 % répartie sur les lignes : la marge baisse d'autant */
  const r = marge({ remiseCents: 1140, lignes: [{ qte: 10, puCents: 1100, coutCents: 550, tva: 10 }, { qte: 1, puCents: 400, coutCents: 0, tva: 10 }] });
  assert.equal(r.venteHtCents, 9000 + Math.round(360 / 1.1)); assert.equal(r.margeHtCents, r.venteHtCents - 5000);
  assert.equal(totaux({ lignes: [{ qte: 10, puCents: 1100, coutCents: 550, tva: 10 }] }).margeCents, 5000);
  assert.equal(marge({ lignes: [{ designation: 'A', qte: 1, puCents: 1000 }] }).connu, false);
});

test('prix d’achat d’une ligne du site : fiche + options payantes ; option payante sans prix d’achat = manquant', () => {
  const p = { slug: 'b', prixCents: 2000, coutCents: 900, groupes: [{ id: 'g1', options: [{ id: 'o1', supCents: 300, coutCents: 120 }, { id: 'o2', supCents: 0 }, { id: 'o3', supCents: 200 }] }] };
  assert.equal(coutLigne({ qte: 10, choix: { g1: ['o1', 'o2'] } }, p), 1020);
  assert.equal(coutLigne({ qte: 10, choix: { g1: ['o1:5'] } }, p), 960, 'option prise pour 5 des 10 personnes');
  assert.equal(coutLigne({ qte: 10, choix: { g1: ['o3'] } }, p), null);
  assert.equal(coutLigne({ qte: 10 }, { ...p, coutCents: null }), null);
  const L = lignesDepuisDemande({ lignes: [{ slug: 'b', titre: 'Buffet', qte: 10, prixCents: 2000, supCents: 300, choix: { g1: ['o1'] } }] }, { bySlug: new Map([['b', p]]) });
  assert.equal(L[0].puCents, 2300); assert.equal(L[0].coutCents, 1020);
});

test('le prix d’achat ne sort jamais vers le client (fiche du site, devis)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, sans } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie: sans ? '' : cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc && !sans) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const prods = (await call('/api/admin/produits')).j;
    const p = prods.find(x => x.statut !== 'masque' && x.prixCents > 500 && (x.groupes || []).some(g => (g.options || []).length));
    assert.ok(p, 'une fiche avec options');
    const full = (await call('/api/admin/produits/' + p.slug)).j;
    const groupes = full.groupes.map(g => ({ ...g, options: g.options.map(o => ({ ...o, coutCents: 4321 })) }));
    assert.equal((await call('/api/admin/produits/' + p.slug, { method: 'PUT', body: { ...full, coutCents: 98765, groupes } })).status, 200);
    const page = await call(`/${p.rubrique}/${p.slug}`, { sans: true });
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.j, /coutCents|98765|987,65|4321|43,21/);
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'Sophie Durand', email: 'sophie@example.test' } });
    const id = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } })).j.id;
    const d = (await call('/api/admin/devis/' + id)).j;
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, lignes: [{ designation: 'Colombo', qte: 10, unite: 'portion', puCents: 1250, coutCents: 678, tva: 10 }] } });
    const ap = (await call('/api/admin/devis/' + id + '/apercu')).j;
    assert.match(ap, /Colombo/); assert.doesNotMatch(ap, /6,78|67,80|achat|marge/i);
  } finally { srv.close(); }
});
