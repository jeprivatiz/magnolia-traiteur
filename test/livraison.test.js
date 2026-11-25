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
  assert.equal(d(80000).puCents, 50);
  assert.equal(d(300000).puCents, 0);
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
