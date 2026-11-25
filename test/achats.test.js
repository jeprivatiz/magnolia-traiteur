'use strict';
/* Import des prix d'achat + fournisseurs depuis l'Excel de Jean-Luc ; fournisseur jamais visible côté client. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyser, ressemblance } = require('../server/achats');
const { ecrireXlsx } = require('../server/tableur');

const PRODS = [
  { slug: 'colombo-poulet', titre: 'Colombo de poulet', tva: 10, statut: 'visible' },
  { slug: 'accras-morue', titre: 'Accras de morue', tva: 10, statut: 'visible' },
  { slug: 'mini-tartelettes-chocolat', titre: 'Mini tartelettes au chocolat', tva: 10, statut: 'visible' },
];

test('rapprochement par nom : identique, proche, introuvable ; colonnes reconnues dans n’importe quel ordre', () => {
  const buf = ecrireXlsx([{ nom: 'Achats', lignes: [['Fournisseur', 'Nom du produit', 'Prix d’achat HT'],
    ['Grossiste A', 'COLOMBO DE POULET', 4.2], ['Grossiste B', 'Accra morue', '0,35 €'], ['Grossiste C', 'Tartelettes chocolat mini', 1.1], ['X', 'Pizza 4 fromages', 3]] }]);
  const r = analyser(buf, 'achats.xlsx', PRODS);
  const [a, b, c, d] = r.lignes;
  assert.equal(a.statut, 'exact'); assert.equal(a.slug, 'colombo-poulet'); assert.equal(a.achatCents, 420); assert.equal(a.fournisseur, 'Grossiste A');
  assert.ok(['proche', 'douteux'].includes(b.statut)); assert.equal(b.slug, 'accras-morue'); assert.equal(b.achatCents, 35);
  assert.equal(c.slug, 'mini-tartelettes-chocolat');
  assert.equal(d.statut, 'introuvable');
  assert.ok(ressemblance('Accra morue', 'Accras de morue') >= 0.75);
});

test('import appliqué (HT → TTC), fournisseur sur la fiche, jamais sur la page du site', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, headers: form ? { 'x-mg': '1', cookie } : { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const p = (await call('/api/admin/produits')).j.find(x => x.statut !== 'masque' && x.prixCents > 500 && (x.tva ?? 10) === 10);
    const fd = new FormData();
    fd.append('fichier', new Blob([ecrireXlsx([{ nom: 'A', lignes: [['Produit', 'Prix d’achat', 'Fournisseur'], [p.titre.replace(/\*\*/g, ''), 2, 'Fournisseur Secret Zéphyr']] }])]), 'achats.xlsx');
    const an = await call('/api/admin/actions/import-achats/analyser', { method: 'POST', form: fd });
    assert.equal(an.status, 200, JSON.stringify(an.j));
    const l = an.j.lignes[0]; assert.equal(l.statut, 'exact'); assert.equal(l.slug, p.slug);
    const ap = await call('/api/admin/actions/import-achats/appliquer', { method: 'POST', body: { ht: true, lignes: [{ slug: l.slug, achatCents: l.achatCents, fournisseur: l.fournisseur }] } });
    assert.equal(ap.j.maj, 1);
    const apres = (await call('/api/admin/produits/' + p.slug)).j;
    assert.equal(apres.coutCents, 220, '2 € HT à 10 % = 2,20 € TTC'); assert.deepEqual(apres.fournisseurs, ['Fournisseur Secret Zéphyr']);
    const page = await fetch(`${base}/${p.rubrique}/${p.slug}`).then(r => r.text());
    assert.doesNotMatch(page, /Secret Zéphyr|fournisseur/i);
    const rech = await fetch(`${base}/api/recherche?q=${encodeURIComponent(p.titre.slice(0, 6))}`).then(r => r.text());
    assert.doesNotMatch(rech, /Zéphyr/);
  } finally { srv.close(); }
});
