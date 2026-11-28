'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../server/devis');

const p = { slug: 'b', titre: 'Buffet antillais — Plat seul', prixCents: 1490, tva: 10, coutCents: 500,
  groupes: [{ id: 'plats', mode: 'quantites', options: [{ id: 'colombo', label: 'Colombo de poulet', supCents: 0 }, { id: 'coq-roussi', label: 'Coq roussi', supCents: 500 }] }] };

test('coq roussi : + 5 € par part, sur une ligne à part du devis', () => {
  const l = { slug: 'b', titre: p.titre, qte: 30, choix: { plats: ['colombo:15', 'coq-roussi:15'] } };
  const est = D.estimerLigne(l, p);
  assert.strictEqual(est.totalCents, 1490 * 30 + 15 * 500);
  const lignes = D.lignesDepuisDemande({ lignes: [{ ...l, prixCents: 1490, supCents: est.supCents }] }, { bySlug: new Map([['b', p]]) });
  assert.strictEqual(lignes[0].puCents, 1490);
  assert.strictEqual(lignes[1].designation, 'Supplément coq roussi');
  assert.strictEqual(lignes[1].qte, 15);
  assert.strictEqual(lignes[1].puCents, 500);
});

test('devis préparé par l’IA : parts de coq roussi lues dans la note', () => {
  assert.deepStrictEqual(D.choixDepuisNote('plats : colombo de poulet × 20, coq roussi × 10', p, 30), { plats: ['coq-roussi:10'] });
  assert.deepStrictEqual(D.choixDepuisNote('Coq roussi pour tout le monde', p, 30), { plats: ['coq-roussi:30'] });
  assert.deepStrictEqual(D.choixDepuisNote('colombo de poulet', p, 30), {});
});

test('christophines : + 3 € TTC par personne sur le prix de la formule', () => {
  const f = { slug: 'buffet-antillais-plat-seul', prixCents: 1990, groupes: [{ id: 'acc', options: [{ id: 'riz', label: 'Riz nature', supCents: 0 }, { id: 'chr', label: 'Gratin de christophines', supCents: 300 }] }] };
  const e = D.estimerLigne({ qte: 20, choix: { acc: ['riz', 'chr'] } }, f);
  assert.strictEqual(e.supCents, 300);
  assert.strictEqual(e.totalCents, (1990 + 300) * 20);
});
