'use strict';
/* Livraison : 1 € TTC du km aller-retour, offerte dès 700 € TTC de commande (Jean-Luc, 2026-11-22). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lignesDepuisDemande } = require('../server/devis');

test('la ligne de livraison est à 0 € quand la livraison est offerte', () => {
  const tarifs = { kmCents: 100, livraisonOfferteCents: 70000 };
  const payante = lignesDepuisDemande({ lignes: [], evenement: { ville: 'Versailles' }, livraison: { km: 37, cents: 3700 } }, { bySlug: new Map() }, tarifs);
  const offerte = lignesDepuisDemande({ lignes: [], evenement: { ville: 'Versailles' }, livraison: { km: 37, cents: 0, offerte: true } }, { bySlug: new Map() }, tarifs);
  assert.equal(payante.at(-1).puCents, 100);
  assert.equal(offerte.at(-1).puCents, 0);
  assert.match(offerte.at(-1).designation, /offerte/);
});
