'use strict';
/* « 📂 Partir d'un ancien devis » : recherche, devis proches, ⭐ modèles, reprise aux prix actuels,
   compléments « souvent pris avec », et Devis avec l'IA qui part de l'ancien devis le plus proche (IA simulée). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ANC = require('../server/anciens');

test('anciens devis : quantités recalculées pour le nombre d’invités', () => {
  assert.equal(ANC.nouvelleQte({ qte: 40, unite: 'personne' }, 40, 60, { min: 10 }), 60);
  assert.equal(ANC.nouvelleQte({ qte: 100, unite: 'pièce' }, 40, 60, { min: 5 }), 150);
  assert.equal(ANC.nouvelleQte({ qte: 1, unite: 'forfait' }, 40, 60, null), 1);
  assert.equal(ANC.nouvelleQte({ qte: 8, unite: 'heure' }, 40, 60, null), 8, 'personnel : heures gardées');
  assert.equal(ANC.nouvelleQte({ qte: 10, unite: 'portion' }, 40, 10, { min: 5 }), 5, 'jamais sous le minimum');
  assert.equal(ANC.cle({ unite: 'km', designation: 'Livraison et reprise' }), null);
  assert.equal(ANC.cle({ designation: 'Nappes 170 × 250', unite: 'pièce' }), 'd:nappes');
});

test('anciens devis : recherche, proches, modèle, reprise, compléments, IA', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const prompts = []; let repIa = null;
  const iaAsk = async p => { prompts.push(p); return JSON.stringify(repIa()); };
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, iaAsk, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
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
    assert.equal((await call('/api/admin/anciens-devis')).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const c = await app.locals.catalogue.get();
    const ok = c.produits.filter(p => p.statut !== 'masque' && p.prixCents > 0 && !(p.groupes || []).length);
    const [buffet, nappe, vaisselle, autre] = [ok.find(p => p.unite === 'personne'), ok[3], ok[4], ok[5]];
    assert.ok(buffet && nappe && vaisselle && autre);
    const L = (p, qte, extra = {}) => ({ designation: p.titre, qte, unite: p.unite, puCents: p.prixCents, coutCents: null, tva: 10, produit: p.slug, ...extra });
    const mk = (id, o) => call('/api/admin/devis/' + id, { method: 'PUT', body: { id, numero: o.numero, token: 'tok' + id, statut: o.statut || 'envoye', clientNom: o.client, evenement: o.ev, lignes: o.lignes, createdAt: o.at || '2026-05-01T10:00:00Z', commercial: { nom: o.com || 'Romain GOUJON' } } });
    /* signé il y a un an : buffet pour 40, ancien prix, remise sur une ligne, produit supprimé depuis, livraison */
    assert.equal((await mk('v_old1', { numero: 'D-2025-0101', statut: 'accepte', client: 'Marie MARTIN', ev: { type: 'Mariage', invites: 40, date: '2025-09-12' }, at: '2025-08-01T10:00:00Z', lignes: [
      { type: 'titre', designation: 'Repas' }, L(buffet, 40, { puCents: buffet.prixCents - 100 }), L(nappe, 10, { puBaseCents: nappe.prixCents, remisePct: 10, puCents: Math.round(nappe.prixCents * 0.9) }),
      { designation: 'Ancien plat retiré', qte: 40, unite: 'portion', puCents: 500, tva: 10, produit: 'plat-qui-n-existe-plus' },
      { designation: 'Livraison et reprise', qte: 30, unite: 'km', puCents: 100, tva: 20 }] })).status, 200);
    assert.equal((await mk('v_old2', { numero: 'D-2026-0042', statut: 'accepte', client: 'Paul DURAND', ev: { type: 'Mariage', invites: 45 }, lignes: [L(buffet, 45), L(nappe, 12), L(vaisselle, 45)] })).status, 200);
    assert.equal((await mk('v_old3', { numero: 'D-2026-0050', statut: 'refuse', client: 'Léa PETIT', ev: { type: 'Séminaire', invites: 120 }, com: 'Stéphanie', lignes: [L(autre, 120)] })).status, 200);
    assert.equal((await mk('v_new', { numero: 'D-2026-0099', statut: 'brouillon', client: 'Nouveau CLIENT', ev: { type: 'Mariage', invites: 50 }, lignes: [] })).status, 200);

    /* recherche : tout, puis filtres */
    let r = (await call('/api/admin/anciens-devis?pour=v_new')).j;
    assert.equal(r.total, 3, 'le devis en cours (vide) n’est pas proposé');
    assert.equal(r.resultats[0].statut, 'accepte', 'signés avant les refusés');
    assert.ok(r.commerciaux.includes('Stéphanie'));
    assert.deepEqual(r.proches.map(x => x.numero).slice(0, 2).sort(), ['D-2025-0101', 'D-2026-0042'], 'devis proches : même type, invités proches');
    assert.ok(!r.proches.some(x => x.numero === 'D-2026-0050'), 'séminaire de 120 : pas proche');
    assert.equal((await call('/api/admin/anciens-devis?invites=52')).j.total, 1, '± 20 % : 45 oui, 40 et 120 non');
    assert.equal((await call('/api/admin/anciens-devis?signes=1')).j.total, 2);
    assert.equal((await call('/api/admin/anciens-devis?com=stephanie')).j.total, 1);
    assert.equal((await call('/api/admin/anciens-devis?q=' + encodeURIComponent('martin'))).j.resultats[0].numero, 'D-2025-0101');
    assert.equal((await call('/api/admin/anciens-devis?du=2026-01-01')).j.total, 2);

    /* ⭐ modèle : en tête, et pas effacé par un enregistrement d'un écran ouvert avant */
    assert.equal((await call('/api/admin/actions/modele-devis/v_old3', { method: 'POST', body: { modele: true } })).status, 200);
    r = (await call('/api/admin/anciens-devis')).j;
    assert.equal(r.resultats[0].numero, 'D-2026-0050'); assert.equal(r.resultats[0].modele, true);
    const v3 = (await call('/api/admin/devis/v_old3')).j; delete v3.modele;
    await call('/api/admin/devis/v_old3', { method: 'PUT', body: v3 });
    assert.equal((await call('/api/admin/devis/v_old3')).j.modele, true);
    assert.equal((await call('/api/admin/anciens-devis?modeles=1')).j.total, 1);

    /* reprise : prix actuels, remise retirée, produit supprimé signalé, quantités pour 50 invités */
    const rp = (await call('/api/admin/anciens-devis/v_old1/reprendre', { method: 'POST', body: { invites: 50 } })).j;
    const lb = rp.lignes.find(l => l.produit === buffet.slug), ln = rp.lignes.find(l => l.produit === nappe.slug);
    assert.equal(lb.puCents, buffet.prixCents, 'prix actuel du catalogue');
    assert.equal(lb.qte, 50, 'par personne : nouveau nombre d’invités');
    assert.equal(ln.puCents, nappe.prixCents); assert.equal(ln.remisePct, undefined, 'remise non reprise');
    assert.ok(rp.rapport.prix.some(p => p.apres === buffet.prixCents));
    assert.deepEqual(rp.rapport.supprimes, ['Ancien plat retiré']);
    assert.equal(rp.rapport.remises, true); assert.equal(rp.rapport.livraison, true);
    assert.equal(rp.lignes[0].type, 'titre');
    assert.equal(rp.source.numero, 'D-2025-0101');

    /* souvent pris avec : la vaisselle revient dans un devis signé contenant le buffet */
    const cp = (await call('/api/admin/anciens-devis/complements', { method: 'POST', body: { lignes: [{ produit: buffet.slug, designation: buffet.titre }] } })).j.complements;
    assert.ok(cp.some(x => x.slug === nappe.slug && x.n === 2 && x.sur === 2), JSON.stringify(cp));
    assert.ok(cp.some(x => x.slug === vaisselle.slug));
    assert.ok(!cp.some(x => x.slug === autre.slug), 'un devis refusé ne compte pas');

    /* Devis avec l'IA : elle reçoit les anciens devis proches et dit lequel elle a repris */
    repIa = () => ({ base: 'D-2026-0042', articles: [{ slug: buffet.slug, qte: 50, note: '', pourquoi: 'comme D-2026-0042' }] });
    const fiche = { prenom: 'Julie', nom: 'Roux', type: 'Mariage', invites: 50, tel: '0612345678' };
    const pr = await call('/api/admin/ia/produits', { method: 'POST', body: { fiche, texte: 'mariage 50 personnes buffet' } });
    assert.equal(pr.status, 200, JSON.stringify(pr.j));
    assert.ok(/D-2026-0042 \(signé/.test(prompts.at(-1)), 'anciens devis proches envoyés à l’IA');
    assert.ok(!/Paul DURAND|Marie MARTIN/.test(prompts.at(-1)), 'jamais le nom des anciens clients dans la demande à l’IA');
    assert.equal(pr.j.base.numero, 'D-2026-0042');
    assert.ok(pr.j.complements.some(x => x.slug === nappe.slug), 'compléments proposés');
    repIa = () => [{ slug: buffet.slug, qte: 50 }];
    assert.equal((await call('/api/admin/ia/produits', { method: 'POST', body: { fiche, texte: 'x' } })).j.base, null, 'ancien format accepté');
    const cmd = await call('/api/admin/actions/commande-ia', { method: 'POST', body: { fiche, km: 0, texte: 'mariage', base: 'D-2026-0042', articles: [{ slug: buffet.slug, qte: 50 }] } });
    assert.equal(cmd.status, 200, JSON.stringify(cmd.j));
    assert.equal((await call('/api/admin/devis/' + cmd.j.devisId)).j.inspireDe, 'D-2026-0042');
  } finally { srv.close(); }
});

test('anciens devis : marge HT sur chaque carte, tri par marge, pas de puce vide', () => {
  const mk = (id, pu, cout, extra = []) => ({ id, numero: id, statut: 'accepte', createdAt: '2026-01-0' + id.length + 'T00:00:00Z', lignes: [{ designation: 'Buffet', qte: 10, unite: 'personne', puCents: pu, coutCents: cout, tva: 10 }, ...extra] });
  const a = mk('a', 2200, 1100), b = mk('bb', 3300, 1100, [{ designation: '**  **', qte: 1, puCents: 0, tva: 10 }, { designation: 'Nappe', qte: 2, unite: 'pièce', puCents: 500, tva: 20 }]), z = mk('ccc', 2000, null);
  const ca = ANC.carte(a), cb = ANC.carte(b), cz = ANC.carte(z);
  assert.equal(ca.marge.cents, 10000); assert.equal(ca.marge.pct, 50);
  assert.equal(cb.marge.manquants, 1, 'ligne sans prix d’achat signalée');
  assert.ok(!cb.produits.some(p => !p.trim()), 'pas de puce vide');
  assert.equal(cb.nbLignes, 2);
  assert.equal(cz.marge, null);
  /* prix d'achat repris de la fiche du catalogue quand la ligne n'en a pas */
  const c = { bySlug: new Map([['buffet', { prixCents: 2000, coutCents: 1000 }]]) };
  assert.equal(ANC.carte({ ...z, lignes: [{ ...z.lignes[0], produit: 'buffet' }] }, { c }).marge.cents, 9091);
  assert.deepEqual(ANC.rechercher([a, b, z], { tri: 'marge' }).map(d => d.id), ['bb', 'a', 'ccc']);
  assert.deepEqual(ANC.rechercher([a, b, z], { tri: 'margePct' }).map(d => d.id), ['bb', 'a', 'ccc']);
});
