'use strict';
/* Menu de Noël antillais (Jean-Luc, 2026-11-28)
   Une rubrique « Menu de Noël antillais » (adresse /menu-de-noel), ouverte depuis un petit pavé animé de la page Buffet antillais,
   avec les produits de la carte des fêtes d'un partenaire (jamais nommé sur le site).
   Prix d'achat = prix de la carte du partenaire (coutCents) ; prix de vente = prix d'achat + 30 %, arrondi aux 10 c supérieurs.
   Tout disparaît du site automatiquement le 5 janvier 2027 à minuit (champ `finLe`, lu par server/catalogue.js). */

const SLUG = 'menu-de-noel';
const FIN = '2027-01-05';
/* + 30 %, arrondi aux 10 centimes au-dessus (calcul en entiers pour éviter les erreurs d'arrondi) */
const vente = c => Math.ceil(c * 13 / 100) * 10;

const DEUX_SEMAINES = 'À commander au moins 15 jours avant votre fête';
const LIQUEUR = 'Une liqueur antillaise douce au fruit de la passion, en bouteille d’un litre. À consommer avec modération.';
const PIECES = 'Par 10 pièces minimum. ' + DEUX_SEMAINES;

/* [slug, section, titre, achat (centimes), unité, minimum, texte du minimum, accroche, lignes « sous le prix », tva, options] */
const PRODUITS = [
  /* ---------- coffrets ---------- */
  ['coffret-festif-antillais', 'buffets', 'Coffret festif antillais · 45 pièces', 7500, 'coffret', 1, DEUX_SEMAINES,
    'Un grand coffret de bouchées antillaises pour l’apéritif de Noël : mini bokits, pâtés salés, verrines et buns, prêts à servir.',
    ['Tout l’apéritif des fêtes dans un seul coffret, à poser sur la table :', '',
      '- **10 mini bokits** : jambon de Noël, morue et poulet fumé',
      '- **15 pâtés salés** : porc, poulet fumé et morue',
      '- **10 verrines** : avocat-crevette et saumon fumé-tzatziki',
      '- **10 buns** : poulet cajun ou bœuf au fromage', '',
      'Composition fixe, au moins deux saveurs de chaque.']],
  ['coffret-festif-antillais-gourmand', 'buffets', 'Coffret festif gourmand · pain au beurre et chocolat', 11000, 'coffret', 1, DEUX_SEMAINES,
    'Le coffret festif de 45 pièces, avec en plus un pain au beurre de 1 kg et 2 litres de chocolat antillais, comme aux Antilles le soir de Noël.',
    ['Le coffret festif de 45 pièces, et la tradition antillaise en plus :', '',
      '- **10 mini bokits**, **15 pâtés salés**, **10 verrines** et **10 buns**',
      '- **1 pain au beurre** de 1 kg, moelleux et doré',
      '- **2 litres de chocolat antillais**, parfumé aux épices', '',
      'Composition fixe.']],
  ['coffret-30-mini-bokits', 'buffets', 'Coffret de 30 mini bokits', 4700, 'coffret', 1, DEUX_SEMAINES,
    'Trente petits bokits dorés et garnis : jambon fumé, morue et poulet fumé.',
    ['Le sandwich frit de la Guadeloupe, en format bouchée :', '', '- **30 mini bokits** : jambon fumé, morue et poulet fumé', '', 'Composition fixe, au moins deux saveurs.']],
  ['coffret-30-pates-sales', 'buffets', 'Coffret de 30 pâtés salés', 2300, 'coffret', 1, DEUX_SEMAINES,
    'Trente petits pâtés salés feuilletés : porc, poulet fumé et morue.',
    ['Les petits pâtés feuilletés des fêtes antillaises :', '', '- **30 pâtés salés** : porc, poulet fumé et morue', '', 'Composition fixe, au moins deux saveurs.']],

  /* ---------- bouchées à la pièce ---------- */
  ['pate-sale-boeuf-noel', 'entrees', 'Pâté salé au bœuf', 110, 'pièce', 10, PIECES, 'Petit chausson feuilleté garni de bœuf épicé.'],
  ['pate-sale-morue-noel', 'entrees', 'Pâté salé à la morue épicée', 110, 'pièce', 10, PIECES, 'Petit chausson feuilleté garni de morue relevée aux épices.'],
  ['pate-sale-poulet-noel', 'entrees', 'Pâté salé au poulet', 100, 'pièce', 10, PIECES, 'Petit chausson feuilleté garni de poulet.'],
  ['pate-sale-porc-noel', 'entrees', 'Pâté salé au porc', 100, 'pièce', 10, PIECES, 'Petit chausson feuilleté garni de porc, la recette des fêtes.'],
  ['pate-sale-lambis-noel', 'entrees', 'Pâté salé au lambi', 190, 'pièce', 10, PIECES, 'Petit chausson feuilleté garni de lambi, le coquillage des Antilles.'],
  ['mini-bokit-jambon-noel', 'entrees', 'Mini bokit au jambon de Noël', 190, 'pièce', 10, PIECES, 'Petit pain frit, doré et moelleux, garni de jambon de Noël.'],
  ['mini-bokit-poulet-fume', 'entrees', 'Mini bokit au poulet fumé', 180, 'pièce', 10, PIECES, 'Petit pain frit, doré et moelleux, garni de poulet fumé.'],
  ['mini-bokit-crevettes-morue', 'entrees', 'Mini bokit crevettes et morue épicées', 190, 'pièce', 10, PIECES, 'Petit pain frit, doré et moelleux, garni de crevettes et de morue relevées.'],
  ['verrine-avocat-crevette-noel', 'entrees', 'Verrine avocat et crevette', 220, 'pièce', 10, PIECES, 'Crème d’avocat et crevettes, fraîche et légère.'],
  ['verrine-saumon-tzatziki-noel', 'entrees', 'Verrine saumon fumé et tzatziki', 220, 'pièce', 10, PIECES, 'Saumon fumé sur un tzatziki frais au concombre.'],
  ['bun-boeuf-effiloche-fromage', 'entrees', 'Bun au bœuf effiloché et fromage', 200, 'pièce', 10, PIECES, 'Petit pain brioché garni de bœuf effiloché fondant et de fromage.'],
  ['bun-poulet-cajun', 'entrees', 'Bun au poulet cajun épicé', 200, 'pièce', 10, PIECES, 'Petit pain brioché garni de poulet mariné aux épices cajun.'],
  ['finger-creme-saumon', 'entrees', 'Finger à la crème de saumon', 200, 'pièce', 10, PIECES, 'Petit pain long garni d’une crème onctueuse au saumon.'],
  ['navette-poulet-fume', 'entrees', 'Navette au poulet fumé', 170, 'pièce', 10, PIECES, 'Petite navette briochée garnie de poulet fumé.'],
  ['navette-jambon-noel', 'entrees', 'Navette au jambon de Noël', 190, 'pièce', 10, PIECES, 'Petite navette briochée garnie de jambon de Noël.'],
  ['navette-saumon-fume', 'entrees', 'Navette au saumon fumé', 190, 'pièce', 10, PIECES, 'Petite navette briochée garnie de saumon fumé.'],
  ['navette-beurre-morue', 'entrees', 'Navette au beurre de morue', 190, 'pièce', 10, PIECES, 'Petite navette briochée tartinée de beurre de morue.'],

  /* ---------- plats et jambon de Noël ---------- */
  ['epaule-agneau-confite-noel', 'plats', 'Épaule d’agneau confite', 1800, 'personne', 6, 'À partir de 6 personnes. ' + DEUX_SEMAINES,
    'Épaule d’agneau cuite longuement jusqu’à devenir fondante, servie avec riz au safran et mousseline de patate douce.',
    ['Le plat du réveillon, cuit doucement pendant des heures :', '', '- **Épaule d’agneau confite**, fondante', '- **Riz au safran**', '- **Mousseline de patate douce**']],
  ['gambas-curry-coco-noel', 'plats', 'Gambas au curry et lait de coco', 1600, 'personne', 6, 'À partir de 6 personnes. ' + DEUX_SEMAINES,
    'Gambas mijotées dans une sauce curry et coco, servies avec riz au safran et mousseline de patate douce.',
    ['Un plat de fête parfumé et doux :', '', '- **Gambas** dans une sauce **curry et lait de coco**', '- **Riz au safran**', '- **Mousseline de patate douce**']],
  ['gigot-agneau-entier-noel', 'plats', 'Gigot d’agneau entier', 7500, 'gigot', 1, DEUX_SEMAINES,
    'Un beau gigot d’agneau entier, cuit et prêt à trancher sur la table de fête. Vendu seul, sans accompagnement.'],
  ['jambon-noel-plateau-10', 'plats', 'Jambon de Noël tranché · plateau pour 10 personnes', 2600, 'plateau', 1, null,
    'Le jambon de Noël antillais, laqué et parfumé, tranché et dressé sur plateau pour 10 personnes.'],
  ['jambon-noel-plateau-5', 'plats', 'Jambon de Noël tranché · plateau pour 5 personnes', 1800, 'plateau', 1, null,
    'Le jambon de Noël antillais, laqué et parfumé, tranché et dressé sur plateau pour 5 personnes.'],
  ['jambon-noel-entier-os', 'plats', 'Jambon de Noël entier à l’os', 6500, 'jambon', 1, null,
    'Le jambon de Noël entier, cuit avec son os, à présenter sur la table et à trancher devant vos invités.'],

  /* ---------- accras, boudin, pain au beurre ---------- */
  ['pate-accras-250', 'accompagnements', 'Pâte à accras à frire · 250 g (environ 15 accras)', 800, 'barquette', 1, DEUX_SEMAINES,
    'La pâte à accras prête à frire chez vous : environ 15 accras bien chauds, aux légumes, à la morue ou aux crevettes.', null, 10,
    [{ id: 'garniture', titre: 'Garniture', radio: true, max: 1, exact: true, options: [['legumes', 'Aux légumes', 0], ['morue', 'À la morue', 200], ['crevettes', 'Aux crevettes', 400]] }]],
  ['pate-accras-500', 'accompagnements', 'Pâte à accras à frire · 500 g (environ 30 accras)', 1400, 'barquette', 1, DEUX_SEMAINES,
    'La pâte à accras prête à frire chez vous : environ 30 accras bien chauds, aux légumes, à la morue ou aux crevettes.', null, 10,
    [{ id: 'garniture', titre: 'Garniture', radio: true, max: 1, exact: true, options: [['legumes', 'Aux légumes', 0], ['morue', 'À la morue', 200], ['crevettes', 'Aux crevettes', 400]] }]],
  ['boudin-lambis-noel', 'accompagnements', 'Boudin de lambi', 2700, 'kg', 1, 'Livré sous vide',
    'Le boudin antillais au lambi, bien relevé, livré sous vide : il n’y a plus qu’à le réchauffer.'],
  ['pain-au-beurre-noel', 'accompagnements', 'Pain au beurre', 2000, 'kg', 1, null,
    'Le pain au beurre des Antilles, brioché et moelleux, à déguster avec le chocolat le matin de Noël.'],

  /* ---------- desserts ---------- */
  ['buche-coco-passion', 'desserts', 'Bûche coco et fruit de la passion', 4000, 'bûche', 1, 'Pour 10 à 12 personnes. ' + DEUX_SEMAINES,
    'Une bûche de Noël légère, à la noix de coco et au fruit de la passion, pour 10 à 12 personnes.'],
  ['mont-blanc-coco-passion', 'desserts', 'Mont-Blanc coco et passion · 12 parts', 3700, 'gâteau', 1, DEUX_SEMAINES,
    'Le gâteau Mont-Blanc des Antilles, à la noix de coco, relevé d’une pointe de fruit de la passion. 12 parts.'],
  ['mont-blanc-coco-noel', 'desserts', 'Mont-Blanc coco · 12 parts', 3000, 'gâteau', 1, DEUX_SEMAINES,
    'Le gâteau Mont-Blanc des Antilles, tout en douceur à la noix de coco. 12 parts.'],

  /* ---------- boissons ---------- */
  ['chocolat-antillais', 'divers', 'Chocolat antillais', 900, 'litre', 1, null,
    'Le chocolat chaud épais des Antilles, parfumé à la cannelle, à la muscade et au zeste de citron vert.', null, 10,
    [{ id: 'lait', titre: 'Lait', radio: true, max: 1, exact: true, options: [['classique', 'Classique', 0], ['sans-lactose', 'Sans lactose', 200]] }]],
  ['punch-coco-noel', 'divers', 'Punch coco · 1 litre', 2000, 'bouteille', 1, null, 'Le punch crémeux à la noix de coco, incontournable des fêtes antillaises. À consommer avec modération.', null, 20],
  ['punch-ananas-noel', 'divers', 'Punch ananas · 1 litre', 2200, 'bouteille', 1, null, 'Un punch fruité à l’ananas, doux et parfumé. À consommer avec modération.', null, 20],
  ['punch-orange-gingembre-noel', 'divers', 'Punch orange et gingembre · 1 litre', 2000, 'bouteille', 1, null, 'Un punch à l’orange relevé de gingembre. À consommer avec modération.', null, 20],
  ['punch-passion-noel', 'divers', 'Punch fruit de la passion · 1 litre', 2500, 'bouteille', 1, null, 'Un punch acidulé au fruit de la passion. À consommer avec modération.', null, 20],
  ['liqueur-antillaise-noel', 'divers', 'Liqueur au fruit de la passion · 1 litre', 1800, 'bouteille', 1, null, LIQUEUR, null, 20],
  ['planteur-noel', 'divers', 'Planteur · 1 litre', 1800, 'bouteille', 1, null, 'Le planteur aux jus de fruits exotiques et au rhum, en bouteille d’un litre. À consommer avec modération.', null, 20],
];

/* photos : celles de Magnolia déjà sur le site (mêmes produits ou très proches) ; les autres sont ajoutées depuis le back-office */
const U = n => '/site/c/antilles-unit/' + n;
const PHOTOS = {
  'coffret-festif-antillais': [U('produit-19.webp.webp'), U('produit-22.webp.webp')],
  'coffret-festif-antillais-gourmand': [U('produit-22.webp.webp'), U('produit-19.webp.webp')],
  'coffret-30-mini-bokits': [U('produit-24.webp.webp'), U('produit-4.webp.webp'), U('produit-25.webp.webp')],
  'coffret-30-pates-sales': [U('produit-18.webp.webp'), U('produit-17.webp.webp')],
  'pate-sale-boeuf-noel': [U('produit-17.webp.webp')], 'pate-sale-morue-noel': [U('produit-16.webp.webp')],
  'pate-sale-poulet-noel': [U('produit-16.webp.webp')], 'pate-sale-porc-noel': [U('produit-18.webp.webp')], 'pate-sale-lambis-noel': [U('produit-17.webp.webp')],
  'mini-bokit-jambon-noel': [U('produit-4.webp.webp')], 'mini-bokit-poulet-fume': [U('produit-25.webp.webp')], 'mini-bokit-crevettes-morue': [U('produit-4.webp.webp')],
  'verrine-avocat-crevette-noel': [U('produit-15.webp.webp')],
  'epaule-agneau-confite-noel': ['/site/c/carte-magnolia-photos/souris-dagneau-confite.webp.webp'],
  'pate-accras-250': [U('produit-13.webp.webp'), '/site/c/antilles-menus/accras-client-20261101.webp.webp'],
  'pate-accras-500': ['/site/c/antilles-menus/accras-client-20261101.webp.webp', U('produit-13.webp.webp')],
  'boudin-lambis-noel': [U('produit-10.webp.webp')],
  'mont-blanc-coco-passion': [U('produit-37.webp.webp')], 'mont-blanc-coco-noel': [U('produit-37.webp.webp')],
};

/* photos libres Pexels (Jean-Luc, 2026-11-28 : « des photos sur les bûches et les produits ») ; sources : data/credits-photos-noel.md */
const PX = id => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
const PHOTOS_LIBRES = {
  'buche-coco-passion': [12777807, 5702931],
  'jambon-noel-entier-os': [14007234, 15362097], 'jambon-noel-plateau-10': [9670690, 15362097], 'jambon-noel-plateau-5': [9670692, 15362097],
  'gigot-agneau-entier-noel': [36984986, 36984985], 'epaule-agneau-confite-noel': [36984985],
  'gambas-curry-coco-noel': [10718120, 17591565],
  'chocolat-antillais': [6208116], 'pain-au-beurre-noel': [7568494], 'coffret-festif-antillais-gourmand': [7568494, 6208116],
  'punch-coco-noel': [7791891], 'punch-ananas-noel': [20205971], 'punch-orange-gingembre-noel': [4443464], 'punch-passion-noel': [6895933],
  'liqueur-antillaise-noel': [22234051], 'planteur-noel': [32435283],
  'verrine-saumon-tzatziki-noel': [18238323], 'bun-boeuf-effiloche-fromage': [32689260], 'bun-poulet-cajun': [6166370], 'finger-creme-saumon': [27741997],
  'navette-poulet-fume': [32892670, 12689175], 'navette-jambon-noel': [32892670, 12689175], 'navette-saumon-fume': [12689175, 32892670], 'navette-beurre-morue': [12689175, 32892670],
};

const RUBRIQUE = {
  slug: SLUG, nom: 'Menu de Noël antillais', titrePage: 'Menu de Noël antillais',
  chapo: 'Bokits, pâtés salés, jambon de Noël, bûche coco-passion et punchs : toute la carte des fêtes, à commander jusqu’au 1er janvier.',
  accroche: 'La carte des fêtes antillaises',
  introTitre: 'Noël et le Nouvel An aux couleurs des Antilles',
  introTexte: 'Choisissez vos produits, ajoutez-les à votre sélection, puis envoyez votre demande : nous vous confirmons votre commande très vite.\nLes produits des fêtes se commandent au moins 15 jours à l’avance, dans la limite des quantités disponibles.',
  parSections: true, discret: true, finLe: FIN, statut: 'visible', tva: 10,
  ordreSections: ['buffets', 'entrees', 'plats', 'accompagnements', 'desserts', 'divers'],
  titresSections: {
    buffets: 'Nos coffrets de fête', entrees: 'Les bouchées de fête, à la pièce', plats: 'Les plats et le jambon de Noël',
    accompagnements: 'Accras, boudin et pain au beurre', desserts: 'Les desserts de fête', divers: 'Chocolat antillais, punchs et liqueurs',
  },
  seoTitre: 'Menu de Noël antillais · traiteur des fêtes',
  seoDescription: 'Bokits, pâtés salés, jambon de Noël, plats de fête, bûche coco-passion et punchs : commandez votre menu de Noël antillais, livré 7 j/7.',
  photo: '/site/c/antilles-menus/buffet-complet.jpg.webp', ordre: 99,
};

function fiche([slug, rangement, titre, achat, unite, min, minimumTexte, extrait, sousPhoto, tva = 10, groupes = []], i) {
  return {
    id: slug, slug, rubrique: SLUG, autresRubriques: [], rangement,
    titre, prixCents: vente(achat), coutCents: achat, prixTexte: null, unite, min, minimumTexte: minimumTexte || null,
    extrait, description: [extrait], sousPhoto: sousPhoto || null, sousPhotoAuto: false,
    photos: (PHOTOS[slug] || []).map(src => ({ src, alt: titre })), video: null, sections: [], details: [], variantes: [],
    groupes: groupes.map(g => ({ ...g, options: g.options.map(([id, label, sup]) => ({ id, label, supCents: vente(sup), coutCents: sup })) })),
    regles: {}, ordre: i, statut: 'visible', maison: false, tva, allergenes: [], aCompleter: false,
    finLe: FIN, noel: true, creeLe: new Date().toISOString(),
  };
}

/* une seule fois : crée la rubrique et les fiches (jamais réécrites ensuite : Jean-Luc les modifie dans le back-office) */
async function initNoel(store) {
  await creerNoel(store);
  await photosNoel(store);
  await punchsUnLitre(store);
}
/* une seule fois (Jean-Luc, 2026-11-28) : les punchs sont vendus en bouteille de 1 litre ; titre complété s'il n'a pas été retouché */
async function punchsUnLitre(store) {
  if (await store.get('_migr/menuNoelPunch1L')) return;
  for (const slug of ['punch-coco-noel', 'punch-ananas-noel', 'punch-orange-gingembre-noel', 'punch-passion-noel']) {
    const p = await store.get('produits/' + slug);
    if (p && !/litre/i.test(p.titre || '')) await store.set('produits/' + slug, { ...p, titre: p.titre + ' · 1 litre', minimumTexte: p.minimumTexte || 'Bouteille de 1 litre' });
  }
  /* liqueur : parfum fruit de la passion (Jean-Luc, 2026-11-28) */
  const l = await store.get('produits/liqueur-antillaise-noel');
  if (l && l.titre === 'Liqueur antillaise · 1 litre') await store.set('produits/liqueur-antillaise-noel', { ...l, titre: 'Liqueur au fruit de la passion · 1 litre', extrait: LIQUEUR, description: [LIQUEUR], seoTitre: null, seoAuto: null });
  await store.set('_migr/menuNoelPunch1L', { at: new Date().toISOString() });
}
async function creerNoel(store) {
  if (await store.get('_migr/menuNoel1')) return;
  if (!(await store.get('rubriques/' + SLUG))) await store.set('rubriques/' + SLUG, { ...RUBRIQUE });
  let n = 0;
  for (const [i, x] of PRODUITS.entries()) {
    if (await store.get('produits/' + x[0])) continue;
    await store.set('produits/' + x[0], fiche(x, i)); n++;
  }
  await store.set('_migr/menuNoel1', { at: new Date().toISOString(), fiches: n });
}
/* une seule fois : ajoute les photos libres aux fiches (après les photos Magnolia déjà posées, sans doublon) */
async function photosNoel(store) {
  if (await store.get('_migr/menuNoelPhotos1')) return;
  let n = 0;
  for (const [slug, ids] of Object.entries(PHOTOS_LIBRES)) {
    const p = await store.get('produits/' + slug); if (!p) continue;
    const deja = new Set((p.photos || []).map(x => x.src));
    const plus = ids.map(PX).filter(src => !deja.has(src)).map(src => ({ src, alt: p.titre }));
    if (!plus.length) continue;
    await store.set('produits/' + slug, { ...p, photos: [...(p.photos || []), ...plus] }); n++;
  }
  await store.set('_migr/menuNoelPhotos1', { at: new Date().toISOString(), fiches: n });
}

/* fin d'une offre de saison : « 2027-01-05 » = le 5 janvier 2027 à minuit, heure de Paris */
function finAtteinte(x, now = Date.now()) {
  if (!x || !x.finLe || !/^\d{4}-\d{2}-\d{2}$/.test(x.finLe)) return false;
  return now >= Date.parse(x.finLe + 'T00:00:00+01:00');
}
function prochaineFin(listes, now = Date.now()) {
  let t = Infinity;
  for (const x of listes) if (x && x.finLe && /^\d{4}-\d{2}-\d{2}$/.test(x.finLe)) { const v = Date.parse(x.finLe + 'T00:00:00+01:00'); if (v > now && v < t) t = v; }
  return t;
}

module.exports = { SLUG, FIN, PRODUITS, RUBRIQUE, PHOTOS_LIBRES, vente, initNoel, finAtteinte, prochaineFin };
