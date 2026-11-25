'use strict';
/* Livraison par paliers (Jean-Luc, 2026-11-25) : 0-400 € → 1 €/km, 401-700 → 0,80, 701-990 → 0,50, 991-2 500 → 0,30, au-delà offerte. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lignesDepuisDemande, raisonsDevisManuel } = require('../server/devis');
const L = require('../public/js/livraison-paliers');

test('prix du km selon le montant de la commande', () => {
  const T = {};
  assert.equal(L.kmCents(T, 0), 100);
  assert.equal(L.kmCents(T, 40000), 100);
  assert.equal(L.kmCents(T, 40100), 80);
  assert.equal(L.kmCents(T, 70000), 80);
  assert.equal(L.kmCents(T, 70100), 50);
  assert.equal(L.kmCents(T, 99000), 50);
  assert.equal(L.kmCents(T, 99100), 30);
  assert.equal(L.kmCents(T, 250000), 30);
  assert.equal(L.kmCents(T, 250100), 0);
  assert.equal(L.frais(T, 65000, 40), 3200);
  assert.equal(L.offerteDes(T), 250000);
});

test('message du palier suivant', () => {
  assert.match(L.message({}, 65000), /Plus que 50\s€ .*700\s€.*0,80\s€ à 0,50\s€/);
  assert.match(L.message({}, 240000), /livraison offerte/);
  assert.equal(L.message({}, 300000), 'La livraison vous est offerte.');
});

test('paliers modifiables et rangés', () => {
  const T = { livraisonPaliers: [{ jusquaCents: 50000, kmCents: 60 }, { jusquaCents: 20000, kmCents: 120 }, { jusquaCents: null, kmCents: 0 }] };
  assert.equal(L.kmCents(T, 10000), 120);
  assert.equal(L.kmCents(T, 30000), 60);
  assert.equal(L.kmCents(T, 60000), 0);
});

test('la ligne de livraison du devis suit le palier', () => {
  const c = { bySlug: new Map() };
  const d = k => lignesDepuisDemande({ lignes: [], sousTotalCents: k, evenement: { ville: 'Versailles' }, livraison: { km: 37 } }, c, {}).at(-1);
  assert.equal(d(30000).puCents, 100);
  assert.equal(d(30000).remisePct, undefined);
  assert.equal(d(80000).puCents, 50);
  assert.equal(d(80000).puBaseCents, 100);
  assert.equal(d(80000).remisePct, 50);
  assert.equal(d(50000).remisePct, 20);
  assert.equal(d(150000).remisePct, 70);
  assert.equal(d(300000).puCents, 0);
  assert.equal(d(300000).remisePct, 100);
  assert.equal(d(300000).coutCents, 100);
  assert.match(d(300000).designation, /offerte/);
  assert.equal(lignesDepuisDemande({ lignes: [], livraison: { km: 37, kmCents: 80 } }, c, {}).at(-1).puCents, 80);
});

test('hors Île-de-France : nous consulter', () => {
  assert.equal(L.horsZone('91140'), false);
  assert.equal(L.horsZone('45000'), true);
  const r = raisonsDevisManuel({ type: 'devis', lignes: [], evenement: { cp: '45000', ville: 'Orléans' }, livraison: { km: 200 }, contact: {} }, { bySlug: new Map() }, {});
  assert.ok(r.some(x => /hors Île-de-France/.test(x)));
});

test('devis hors Île-de-France : ligne de livraison à préciser', () => {
  const l = lignesDepuisDemande({ lignes: [], sousTotalCents: 30000, evenement: { ville: 'Orléans', cp: '45000' }, livraison: { km: 260, horsZone: true } }, { bySlug: new Map() }, {}).at(-1);
  assert.match(l.designation, /hors Île-de-France/);
  assert.equal(l.puCents, 0);
});

test('livraison offerte : coût compté dans la marge, jamais bloquée', () => {
  const { marge, controleMarge } = require('../server/devis');
  const liv = lignesDepuisDemande({ lignes: [], sousTotalCents: 300000, evenement: { ville: 'Versailles' }, livraison: { km: 50 } }, { bySlug: new Map() }, {}).at(-1);
  const doc = { lignes: [{ designation: 'Buffet', qte: 100, puCents: 3000, coutCents: 1500, tva: 10 }, liv] };
  const m = marge(doc);
  assert.equal(m.achatTtcCents, 150000 + 5000);
  assert.deepEqual(controleMarge(doc), []);
  assert.deepEqual(controleMarge({ lignes: [liv] }), []);
});

test('remise globale : jamais sur la livraison', () => {
  const { totaux } = require('../server/devis');
  const doc = { remiseCents: 10000, lignes: [{ designation: 'Buffet', qte: 1, puCents: 100000, tva: 10 }, { designation: 'Livraison', qte: 50, unite: 'km', puCents: 50, puBaseCents: 100, remisePct: 50, coutCents: 100, tva: 20, livraison: true }] };
  const t = totaux(doc);
  assert.equal(t.ttcCents, 100000 + 2500 - 10000);
  assert.equal(t.remiseCents, 10000);
  const tout = totaux({ ...doc, remiseCents: 999999 });
  assert.equal(tout.ttcCents, 2500); /* une remise de 100 % laisse la livraison */
});

test('ligne de livraison verrouillée pour un commercial', () => {
  const { verrouLivraison } = require('../server/devis');
  const liv = { designation: 'Livraison et reprise', qte: 40, unite: 'km', puCents: 80, puBaseCents: 100, remisePct: 20, coutCents: 100, tva: 20, livraison: true };
  const avant = { lignes: [{ designation: 'Buffet', qte: 1, puCents: 50000 }, liv] };
  assert.ok(verrouLivraison(avant, [avant.lignes[0], liv]).lignes);
  assert.match(verrouLivraison(avant, [avant.lignes[0]]).erreur, /administrateur/);
  assert.match(verrouLivraison(avant, [avant.lignes[0], { ...liv, puCents: 0, remisePct: 100 }]).erreur, /administrateur/);
  /* ligne ajoutée : prix des paliers imposé */
  const n = verrouLivraison({ lignes: [] }, [{ designation: 'Buffet', qte: 1, puCents: 150000 }, { designation: 'Livraison', qte: 30, unite: 'km', puCents: 0 }]).lignes.at(-1);
  assert.equal(n.puCents, 30); assert.equal(n.remisePct, 70); assert.equal(n.coutCents, 100);
});
