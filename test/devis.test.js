'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { totaux, controleMarge } = require('../server/devis');

test('totaux : TVA déduite des prix TTC, ligne par ligne', () => {
  const t = totaux({ lignes: [
    { designation: 'Buffet', qte: 30, puCents: 2200, tva: 10 },
    { designation: 'Serveur', qte: 4, puCents: 4188, tva: 20 },
    { type: 'titre', designation: 'Section' },
  ] });
  assert.equal(t.ttcCents, 30 * 2200 + 4 * 4188);
  assert.equal(t.tva[10], 66000 - Math.round(66000 / 1.1));
  assert.equal(t.tva[20], 16752 - Math.round(16752 / 1.2));
  assert.equal(t.htCents + t.tva[10] + t.tva[20], t.ttcCents);
});

test('totaux : la remise est répartie et ne dépasse jamais le total', () => {
  const t = totaux({ remiseCents: 1000, lignes: [{ qte: 1, puCents: 5000, tva: 10 }] });
  assert.equal(t.ttcCents, 4000);
  assert.equal(totaux({ remiseCents: 99999, lignes: [{ qte: 1, puCents: 5000 }] }).ttcCents, 0);
});

test('marge négative bloquée', () => {
  assert.deepEqual(controleMarge({ lignes: [{ designation: 'A', qte: 1, puCents: 1000, coutCents: 800 }] }), []);
  assert.equal(controleMarge({ lignes: [{ designation: 'A', qte: 1, puCents: 700, coutCents: 800 }] }).length, 2);
  assert.equal(controleMarge({ remiseCents: 500, lignes: [{ designation: 'A', qte: 1, puCents: 1000, coutCents: 800 }] }).length, 1);
});
