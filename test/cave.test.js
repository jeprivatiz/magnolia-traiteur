'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ttc, CAVE_PRODUITS, CAVE_SECTIONS, AJOUTS_CAVE, initCave } = require('../server/cave');

test('prix de la cave : HT → TTC puis + 10 %, arrondi aux 10 centimes du dessus', () => {
  assert.equal(ttc(2, 10), 250);     /* eau 50 cl : 2,00 HT → 2,42 → 2,50 € */
  assert.equal(ttc(3.2, 10), 390);   /* soda 33 cl */
  assert.equal(ttc(7, 10), 850);     /* jus 1 L */
  assert.equal(ttc(12, 20), 1590);   /* vin à 12 € HT */
  assert.equal(ttc(24, 20), 3170);   /* vin à 24 € HT */
  assert.equal(ttc(3.1, 20), 410);   /* tire-bouchon */
  const cles = new Set(CAVE_SECTIONS.map(s => s[0]));
  for (const p of CAVE_PRODUITS) assert.ok(cles.has(p[0]), p[1]);
  assert.equal(new Set(CAVE_PRODUITS.map(p => p[1])).size, CAVE_PRODUITS.length, 'pas de doublon');
});

test('initCave : anciens vins masqués, nos open bars gardés, nouvelles fiches créées une seule fois', async () => {
  const docs = new Map();
  const store = {
    get: async k => docs.get(k) ?? null,
    set: async (k, v) => { docs.set(k, v); },
    list: async col => [...docs].filter(([k]) => k.startsWith(col + '/')).map(([k, data]) => ({ id: k.slice(col.length + 1), data })),
  };
  docs.set('rubriques/boissons', { slug: 'boissons', nom: 'La cave de Magnolia', introTexte: 'Champagne, vins choisis en Bourgogne, à Bordeaux ou en Provence…' });
  docs.set('produits/chablis', { slug: 'chablis', rubrique: 'boissons', titre: 'Chablis', statut: 'visible' });
  docs.set('produits/sangria-maison-au-litre', { slug: 'sangria-maison-au-litre', rubrique: 'boissons', titre: 'Sangria', statut: 'visible' });
  docs.set('produits/champagne-andre-diligent', { slug: 'champagne-andre-diligent', rubrique: 'boissons', titre: 'Champagne André Diligent', prixCents: 2850, statut: 'visible' });
  assert.equal(await initCave(store), CAVE_PRODUITS.length + AJOUTS_CAVE.length);
  const rhum = docs.get('produits/rhum-trois-rivieres-blanc-50-70-cl');
  assert.equal(rhum.prixCents, 3500);
  assert.equal(rhum.statut, 'visible');
  assert.equal(docs.get('produits/chablis').statut, 'masque');
  assert.equal(docs.get('produits/sangria-maison-au-litre').statut, 'visible');
  assert.equal(docs.get('produits/sangria-maison-au-litre').rangement, 'bars');
  const ch = docs.get('produits/champagne-andre-diligent');
  assert.equal(ch.rangement, 'champagne');
  assert.equal(ch.prixCents, 2850);
  assert.match(ch.photos[0].src, /andre-diligent/);
  const r = docs.get('rubriques/boissons');
  assert.ok(r.parSections && r.tuilesSections);
  assert.deepEqual(r.sectionsVedette, ['champagne']);
  assert.match(r.introTitre, /cave/);
  assert.equal(docs.get('produits/paris-cola-33-cl').statut, 'masque');
  assert.equal(docs.get('produits/coca-cola-1-5-l').prixCents, 550);
  assert.ok(docs.get('produits/barman').groupes[0].options.length === 5);
  assert.equal(docs.get('produits/barman').prixCents, 6870);
  assert.equal(docs.get('produits/bordeaux-rose-manoir-de-la-valette').prixCents, 1650);
  assert.equal(docs.get('produits/chateau-la-gordonne-verite-du-terroir').prixCents, 1790);
  assert.equal(await initCave(store), 0);
});
