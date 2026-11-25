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
  docs.set('produits/vieille-eau', { slug: 'vieille-eau', rubrique: 'boissons', titre: 'Eau', description: ['Eau.', 'Livré frais avec le reste de votre commande.'] });
  docs.set('produits/barman', { ...require('../server/cave').BARMAN, sousPhoto: ['Prévoyez environ un barman pour 30 à 40 invités, jusqu’à 5 barmans, pour 4 heures minimum.'] });
  docs.set('produits/bar-a-cocktails-4-h-au-cocktail', { slug: 'bar-a-cocktails-4-h-au-cocktail', rubrique: 'boissons', titre: 'Bar à cocktails (tarif au cocktail)', unite: 'cocktail', min: 1 });
  docs.set('produits/chablis', { slug: 'chablis', rubrique: 'boissons', titre: 'Chablis', statut: 'visible' });
  docs.set('produits/sangria-maison-au-litre', { slug: 'sangria-maison-au-litre', rubrique: 'boissons', titre: 'Sangria', statut: 'visible' });
  docs.set('produits/champagne-andre-diligent', { slug: 'champagne-andre-diligent', rubrique: 'boissons', titre: 'Champagne André Diligent', prixCents: 2850, statut: 'visible' });
  assert.equal(await initCave(store), CAVE_PRODUITS.length + AJOUTS_CAVE.length);
  const rhum = docs.get('produits/rhum-trois-rivieres-blanc-50-70-cl');
  assert.equal(rhum.prixCents, 2490);
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
  const bm = docs.get('produits/barman');
  assert.equal(bm.prixCents, 27000);
  assert.equal(bm.unite, 'barman');
  /* 3 barmans, 6 heures : 3 × (270 + 2 × 39) = 1 044 € */
  assert.equal((bm.prixCents + bm.groupes[0].options.find(o => o.id === '6h').supCents) * 3, 104400);
  assert.equal(docs.get('produits/bordeaux-rose-manoir-de-la-valette').prixCents, 1668);
  assert.equal(docs.get('produits/chateau-la-gordonne-verite-du-terroir').prixCents, 1790);
  assert.equal(docs.get('produits/eau-vittel-1-l').statut, 'masque');
  assert.equal(docs.get('produits/eau-plate-cristaline-1-5-l').prixCents, 250);
  assert.equal(docs.get('produits/coca-cola-1-5-l').photos[0].src, '/site/c/cave/coca-cola-1-5-l.webp');
  assert.equal(docs.get('produits/eau-petillante-1-5-l').prixCents, 250);
  assert.match(docs.get('produits/eau-plate-cristaline-1-5-l').photos[0].src, /cristaline-plate-bouteille\.webp/);
  assert.equal(docs.get('produits/eau-plate-cristaline-1-5-l').statut, 'masque');
  assert.equal(docs.get('produits/eau-evian-1-5-l').prixCents, 250);
  assert.equal(docs.get('produits/eau-san-pellegrino-1-5-l').coutCents, 242);
  assert.equal(docs.get('produits/eau-evian-1-5-l').coutCents, 99);
  assert.equal(docs.get('produits/eau-san-pellegrino-1-5-l').statut, 'visible');
  assert.equal(docs.get('produits/eau-badoit-50-cl').statut, 'masque');
  assert.equal(docs.get('produits/chateau-minuty-prestige-rose').prixCents, 3590);
  assert.equal(docs.get('produits/pepsi-max-1-5-l').prixCents, 350);
  assert.equal(docs.get('produits/rose-saint-tropez-cotes-de-provence').photos[0].src, '/site/c/cave/rose-saint-tropez.webp');
  { const ob = docs.get('produits/open-bar-vins-et-champagnes'); if (ob) { assert.equal(ob.prixCents, 27000); assert.equal(ob.prixAffiche, undefined); assert.equal(ob.groupes[0].titre, 'Heures supplémentaires'); assert.equal(ob.liees.length, 1); } }
  assert.equal(docs.get('produits/barman').video.src, '/site/v/produits/barman.mp4');
  assert.equal(docs.get('produits/chateau-minuty-prestige-rose').photos[0].src, '/site/c/cave/rose-minuty-prestige.webp');
  assert.equal(docs.get('produits/marrenon-luberon-classique-rose').photos[0].src, '/site/c/cave/rose-marrenon-classique.webp');
  { const g = docs.get('produits/barman').groupes.find(x => x.id === 'duree'); assert.equal(g.titre, 'Heures supplémentaires'); assert.equal(g.options.find(o => o.id === '6h').supCents, 7800); assert.match(g.options.find(o => o.id === '6h').label, /^2 heures supplémentaires/); }
  assert.equal(docs.get('produits/chateau-minuty-prestige-rose').coutCents, 1548);
  assert.equal(docs.get('produits/chateau-minuty-prestige-rose').fournisseurs[0], 'Metro');
  assert.equal(docs.get('produits/marrenon-luberon-classique-rose').prixCents, 1908);
  assert.equal(docs.get('produits/marrenon-luberon-classique-rose').coutCents, 659);
  assert.equal(docs.get('produits/rose-saint-tropez-cotes-de-provence').prixCents, 1950);
  assert.equal(docs.get('produits/rose-saint-tropez-cotes-de-provence').coutCents, 683);
  assert.equal(docs.get('produits/bar-a-cocktails-4-h-au-cocktail').min, 30);
  assert.equal(docs.get('produits/bar-a-cocktails-4-h-au-cocktail').video.src, '/site/v/produits/bar-a-cocktails.mp4');
  assert.equal(docs.get('produits/nuiton-beaunoy-hautes-cotes-de-beaune-grande-cuvee-rouge').prixCents, 2400);
  assert.equal(docs.get('produits/gin-bombay-sapphire-70-cl').prixCents, 3790);
  assert.equal(docs.get('produits/rhum-havana-club-especial-70-cl').statut, 'masque');
  assert.equal(docs.get('produits/barman').sousPhoto[0], 'Prévoyez environ un barman pour 30 à 40 invités. À vous de faire le calcul.');
  assert.ok(![...docs.values()].some(d => JSON.stringify(d).includes('Livré frais')));
  assert.equal(docs.get('produits/jomo-the-vert-menthe-citron-35-cl').statut, 'masque');
  assert.equal(docs.get('rubriques/boissons').titresSections.sodas, 'Sodas');
  assert.equal(await initCave(store), 0);
});

test('bar à cocktails : le texte commence par « Notre barman prépare devant vos invités »', () => {
  const { texteBarCocktails: f } = require('../server/cave');
  assert.equal(f('Un barman prépare devant les invités trois cocktails choisis parmi cinq, ou des créations à la demande, pendant 4 heures. Le nombre de cocktails est fixé à l’avance.'),
    'Notre barman prépare devant vos invités trois cocktails choisis parmi cinq, ou des créations à la demande. Le nombre de cocktails est fixé à l’avance.');
  assert.equal(f('Pendant 4 heures, un barman prépare devant vos invités trois cocktails. La durée minimum pour un barman est de 4h.'),
    'Notre barman prépare devant vos invités trois cocktails. La durée minimum pour un barman est de 4h.');
});
