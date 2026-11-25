'use strict';
/* Statistiques par rubrique (Jean-Luc, 2026-11-25) : marge moyenne du catalogue et ventes signées par mois */
const test = require('node:test');
const assert = require('node:assert/strict');
const { statistiques } = require('../server/statistiques');

const rubriques = [
  { slug: 'cocktails-buffets', nom: 'Cocktail et buffet français', ordre: 1 },
  { slug: 'saveurs-du-monde', nom: 'Saveurs du monde', ordre: 2, sous: [{ slug: 'antillais', nom: 'Buffet antillais · par Magnolia', ordre: 1 }, { slug: 'indien', nom: 'Buffet indien', ordre: 2 }] },
  { slug: 'cachee', nom: 'Masquée', ordre: 3, statut: 'masque' },
  { slug: 'indispensables', nom: 'Indispensables', ordre: 4 },
  { slug: 'mobilier-a-la-location', nom: 'Mobilier et matériel à la location', ordre: 5 },
];
const produits = [
  { slug: 'mini', titre: 'Mini burgers', rubrique: 'cocktails-buffets', prixCents: 1000, coutCents: 600, tva: 10 }, /* 40 % */
  { slug: 'verrine', titre: 'Verrines', rubrique: 'cocktails-buffets', prixCents: 1000, coutCents: 200, tva: 10 }, /* 80 % */
  { slug: 'sans', titre: 'Sans achat', rubrique: 'cocktails-buffets', prixCents: 1000, tva: 10 },
  { slug: 'masque', titre: 'Masqué', rubrique: 'cocktails-buffets', prixCents: 1000, coutCents: 0, statut: 'masque' },
  { slug: 'colombo', titre: 'Colombo de poulet', rubrique: 'saveurs-du-monde', sous: 'antillais', prixCents: 2200, coutCents: 1100, tva: 10 },
  { slug: 'chaise', titre: 'Chaise velours', rubrique: 'indispensables', autresRubriques: ['mobilier-a-la-location'], prixCents: 1200, coutCents: 300, tva: 20 },
];
const signe = (id, at, lignes, extra = {}) => ({ id, statut: 'accepte', signature: { at }, lignes, ...extra });

test('marge moyenne du catalogue : même calcul que le pavé du Catalogue, dans l’ordre des vignettes', () => {
  const s = statistiques({ rubriques, produits, devis: [], maintenant: new Date('2026-11-25T12:00:00Z') });
  assert.deepEqual(s.rubriques.map(r => r.slug), ['cocktails-buffets', 'saveurs-du-monde', 'indispensables', 'mobilier-a-la-location']);
  const c = s.rubriques[0].catalogue;
  assert.equal(c.pct, 60); assert.equal(c.avecMarge, 2); assert.equal(c.sansAchat, 1);
  assert.equal(s.rubriques[1].sous[0].nom, 'Buffet antillais'); assert.equal(s.rubriques[1].sous[0].catalogue.pct, 50);
  assert.equal(s.rubriques[3].catalogue.pct, 75, 'produit « aussi dans » compté dans la rubrique');
  assert.equal(s.mois.length, 12); assert.equal(s.mois[11], '2026-11'); assert.equal(s.mois[0], '2025-12');
});

test('ventes signées : CA et marge HT par rubrique et par mois, remise répartie, lignes sans prix d’achat hors marge', () => {
  const devis = [
    signe('d1', '2026-11-10T10:00:00Z', [
      { produit: 'mini', designation: 'Mini burgers', qte: 10, puCents: 1100, coutCents: 550, tva: 10 }, /* 100 HT, marge 50 */
      { designation: 'Supplément cheddar', supplement: 'x', qte: 10, puCents: 110, coutCents: null, tva: 10 }, /* 10 HT, inconnue */
      { designation: 'Colombo de poulet (portion)', qte: 10, puCents: 2200, coutCents: 1100, tva: 10 }, /* trouvé par le titre : 200 HT, marge 100 */
      { designation: 'Livraison', qte: 1, puCents: 1200, coutCents: null, tva: 20 }, /* hors rubrique */
      { produit: 'chaise', designation: 'Chaise', qte: 10, puCents: 1200, coutCents: 300, tva: 20 }, /* 100 HT, marge 75 */
    ]),
    signe('d2', '2026-10-02T10:00:00Z', [{ produit: 'mini', qte: 10, puCents: 1100, coutCents: 550, tva: 10 }], { remiseCents: 1100 }), /* 90 HT, marge 40 */
    signe('vieux', '2024-01-01T10:00:00Z', [{ produit: 'mini', qte: 10, puCents: 1100, coutCents: 550, tva: 10 }]),
    { id: 'envoye', statut: 'envoye', lignes: [{ produit: 'mini', qte: 100, puCents: 1100, coutCents: 0 }] },
  ];
  const s = statistiques({ rubriques, produits, devis, maintenant: new Date('2026-11-25T12:00:00Z') });
  const cb = s.rubriques[0].ventes;
  assert.equal(cb.venteHtCents, 10000 + 1000 + 9000); assert.equal(cb.margeHtCents, 5000 + 4000);
  assert.equal(cb.venteConnueHtCents, 19000); assert.equal(cb.devis, 2);
  assert.equal(cb.serie[11].venteHtCents, 11000); assert.equal(cb.serie[10].margeHtCents, 4000);
  assert.equal(s.rubriques[1].ventes.venteHtCents, 20000); assert.equal(s.rubriques[1].sous[0].ventes.margeHtCents, 10000);
  assert.equal(s.rubriques[2].ventes.margeHtCents, 7500); assert.equal(s.rubriques[3].ventes.margeHtCents, 7500, 'chaise comptée dans les deux rubriques');
  assert.equal(s.total.venteHtCents, 10000 + 1000 + 20000 + 1000 + 10000 + 9000, 'total compté une seule fois');
  assert.equal(s.autres.venteHtCents, 1000);
});

test('meilleurs produits : marge % du catalogue et ventes signées par produit (suppléments rattachés)', () => {
  const devis = [signe('d1', '2026-11-10T10:00:00Z', [
    { produit: 'mini', designation: 'Mini burgers', qte: 10, puCents: 1100, coutCents: 550, tva: 10 },
    { designation: 'Supplément cheddar', supplement: 'x', qte: 10, puCents: 110, coutCents: 0, tva: 10 },
  ])];
  const s = statistiques({ rubriques, produits, devis, maintenant: new Date('2026-11-25T12:00:00Z') });
  const mini = s.produits.find(p => p.slug === 'mini'), verrine = s.produits.find(p => p.slug === 'verrine');
  assert.equal(mini.pct, 40); assert.equal(mini.venteHtCents, 11000); assert.equal(mini.margeHtCents, 6000); assert.equal(mini.devis, 1);
  assert.equal(verrine.pct, 80); assert.equal(verrine.venteHtCents, 0);
  assert.equal(s.produits.find(p => p.slug === 'colombo').rubrique, 'Buffet antillais');
  assert.ok(!s.produits.some(p => p.slug === 'sans' || p.slug === 'masque'), 'sans prix d’achat ni vente, ou masqué : absent');
});
