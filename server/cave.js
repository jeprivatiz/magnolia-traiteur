'use strict';
/*
 * La cave de Magnolia (Jean-Luc, 2026-11-25) : la page /boissons reprend la carte de boissons d'un traiteur parisien
 * (softs, vins rouges, blancs, rosé ; prix HT passés en TTC puis + 10 %), avec notre champagne André Diligent en grand
 * à la place du leur, un whisky, un gin, un rhum et une vodka (prix constaté chez les traiteurs + 20 %), le tire-bouchon
 * et nos glaçons. Nos open bars, bar à cocktails, bar à shots, sangria et gobelet restent. Les anciens vins sont masqués.
 * La page s'ouvre sur des catégories avec une photo chacune (on touche une catégorie, on ne voit qu'elle).
 * Photos : vraies photos libres (Pexels), regardées une à une ; sources dans data/credits-photos-univers.md.
 */

const px = id => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1200`;

/* catégories de la page, dans l'ordre : [clé, titre, photo de la vignette] */
const CAVE_SECTIONS = [
  ['champagne', 'Notre champagne', '/site/c/cave/andre-diligent-seau.webp'],
  ['eaux', 'Les eaux', px(31107362)],
  ['sodas', 'Sodas', px(35020136)],
  ['jus', 'Jus de fruits', px(8679601)],
  ['vins-rouges', 'Vins rouges', px(29436323)],
  ['vins-blancs', 'Vins blancs', px(20848541)],
  ['vins-roses', 'Vin rosé', px(15006642)],
  ['alcools-forts', 'Alcools forts', px(40025139)],
  ['bars', 'Open bars & cocktails', px(5531479)],
  ['accessoires', 'Accessoires', px(8473124)],
];

/* prix TTC en centimes : HT + TVA (10 % softs, 20 % alcools et objets) + 10 %, arrondi aux 10 centimes du dessus */
const ttc = (ht, tva) => Math.ceil(Math.round(ht * (1 + tva / 100) * 1.1 * 1000) / 10 / 10) * 10;
/* alcools forts : prix d'une bouteille chez les traiteurs (TTC) + 20 % */
const plus20 = e => Math.round(e * 120);

const TIRE = 'Tire-bouchon non fourni : pensez à l’ajouter à votre sélection (rubrique Accessoires).';
const FRAIS = 'Livré frais avec le reste de votre commande.';

/* [section, slug, titre, prix TTC en centimes, TVA, extrait, description, photo, texte de la photo] */
const CAVE_PRODUITS = [
  ['eaux', 'eau-evian-50-cl', 'Eau Evian (50 cl)', ttc(2, 10), 10, 'Eau minérale plate en petite bouteille individuelle de 50 cl.', ['Eau minérale naturelle plate, bouteille individuelle de 50 cl : pratique pour un plateau-repas, une réunion ou un buffet.', FRAIS], px(8101056), 'Bouteille d’eau plate et verre sur une table'],
  ['eaux', 'eau-badoit-50-cl', 'Eau Badoit (50 cl)', ttc(2, 10), 10, 'Eau minérale gazeuse en petite bouteille individuelle de 50 cl.', ['Eau minérale naturellement gazeuse, fines bulles, bouteille individuelle de 50 cl.', FRAIS], px(18212879), 'Bouteille d’eau gazeuse et verre en terrasse'],
  ['eaux', 'eau-vittel-1-l', 'Eau Vittel (1 L)', ttc(3.5, 10), 10, 'Eau minérale plate, grande bouteille de 1 litre, à partager.', ['Eau minérale naturelle plate, bouteille de 1 litre, à poser sur les tables ou au buffet.', FRAIS], px(31107362), 'Bouteilles d’eau et verres sur une table de réunion'],
  ['eaux', 'perrier-fines-bulles-1-l', 'Perrier fines bulles (1 L)', ttc(3.5, 10), 10, 'Eau minérale gazeuse à fines bulles, bouteille de 1 litre.', ['Eau minérale gazeuse Perrier, version fines bulles, bouteille de 1 litre.', FRAIS], px(3023667), 'Bouteille verte d’eau gazeuse'],
  ['sodas', 'paris-cola-33-cl', 'Paris Cola (33 cl)', ttc(3.2, 10), 10, 'Le cola artisanal fabriqué à Paris, en bouteille de verre de 33 cl.', ['Cola artisanal fabriqué à Paris, en bouteille de verre individuelle de 33 cl.', FRAIS], px(4113667), 'Verre de cola avec glaçons'],
  ['sodas', 'paris-cola-zero-33-cl', 'Paris Cola Zéro (33 cl)', ttc(3.2, 10), 10, 'Le cola artisanal de Paris, sans sucres, en bouteille de verre de 33 cl.', ['La version sans sucres du cola artisanal fabriqué à Paris, bouteille de verre individuelle de 33 cl.', FRAIS], px(33469209), 'Verre de cola sans sucres sur glace'],
  ['sodas', 'parismonade-33-cl', 'Parismonade, limonade de Paris (33 cl)', ttc(3.2, 10), 10, 'Limonade artisanale fabriquée à Paris, bouteille de verre de 33 cl.', ['Limonade artisanale fabriquée à Paris, en bouteille de verre individuelle de 33 cl.', FRAIS], px(5836998), 'Limonade versée dans un verre'],
  ['sodas', 'parismonade-75-cl', 'Parismonade, limonade de Paris (75 cl)', ttc(6.6, 10), 10, 'Limonade artisanale fabriquée à Paris, grande bouteille de 75 cl à partager.', ['Limonade artisanale fabriquée à Paris, grande bouteille de verre de 75 cl à partager.', FRAIS], px(12900901), 'Deux bouteilles de limonade en terrasse'],
  ['sodas', 'paris-cola-75-cl', 'Paris Cola (75 cl)', ttc(6.6, 10), 10, 'Le cola artisanal fabriqué à Paris, grande bouteille de 75 cl à partager.', ['Cola artisanal fabriqué à Paris, grande bouteille de verre de 75 cl à partager.', FRAIS], px(8879626), 'Grand verre de cola avec glaçons'],
  ['jus', 'jus-d-orange-alain-milliat-1-l', 'Jus d’orange Alain Milliat (1 L)', ttc(7, 10), 10, 'Pur jus d’orange artisanal Alain Milliat, bouteille de 1 litre.', ['Pur jus d’orange artisanal de la maison Alain Milliat, bouteille de verre de 1 litre.', FRAIS], px(8679601), 'Bouteille de jus d’orange et oranges coupées'],
  ['jus', 'jus-de-pomme-alain-milliat-1-l', 'Jus de pomme Alain Milliat (1 L)', ttc(7, 10), 10, 'Pur jus de pomme artisanal Alain Milliat, bouteille de 1 litre.', ['Pur jus de pomme artisanal de la maison Alain Milliat, bouteille de verre de 1 litre.', FRAIS], px(36794069), 'Verre de jus de pomme et pommes vertes'],
  ['jus', 'jus-de-peche-alain-milliat-1-l', 'Jus de pêche Alain Milliat (1 L)', ttc(7, 10), 10, 'Jus de pêche artisanal Alain Milliat, bouteille de 1 litre.', ['Jus de pêche artisanal de la maison Alain Milliat, bouteille de verre de 1 litre.', FRAIS], px(10673227), 'Bouteille de jus de pêche et pêches'],
  ['jus', 'jomo-citronnade-gingembre-35-cl', 'JOMO citronnade glacée gingembre (35 cl)', ttc(3.9, 10), 10, 'Citronnade glacée au gingembre, bouteille individuelle de 35 cl.', ['Citronnade glacée au gingembre, rafraîchissante et peu sucrée, bouteille individuelle de 35 cl.', FRAIS], px(16411715), 'Citronnade glacée au citron et gingembre'],
  ['jus', 'jomo-the-vert-menthe-citron-35-cl', 'JOMO thé vert glacé menthe citron (35 cl)', ttc(3.9, 10), 10, 'Thé vert glacé à la menthe et au citron, bouteille individuelle de 35 cl.', ['Thé vert glacé à la menthe et au citron, bouteille individuelle de 35 cl.', FRAIS], px(25328043), 'Thé glacé au citron et à la menthe'],
  ['jus', 'jomo-the-blanc-peche-hibiscus-35-cl', 'JOMO thé blanc glacé pêche hibiscus (35 cl)', ttc(3.9, 10), 10, 'Thé blanc glacé à la pêche et à l’hibiscus, bouteille individuelle de 35 cl.', ['Thé blanc glacé à la pêche et à l’hibiscus, bouteille individuelle de 35 cl.', FRAIS], px(36305566), 'Thé glacé à l’hibiscus et citron vert'],
  ['vins-rouges', 'chateau-malijay-mistral-gourmand-rouge', 'Château Malijay « Mistral Gourmand », vin rouge', ttc(12, 20), 20, 'Vin rouge de la vallée du Rhône, bouteille de 75 cl.', ['Un rouge de la vallée du Rhône, gourmand et facile à boire, qui accompagne aussi bien un buffet qu’un repas servi.', 'Bouteille de 75 cl. ' + TIRE], px(33993981), 'Bouteille de vin rouge sur fond noir'],
  ['vins-rouges', 'jean-des-valanges-pinot-noir-rouge', 'Jean des Valanges Pinot noir, vin rouge', ttc(12, 20), 20, 'Pinot noir léger et fruité, bouteille de 75 cl.', ['Un pinot noir léger et fruité, parfait avec les viandes blanches, la charcuterie et les fromages.', 'Bouteille de 75 cl. ' + TIRE], px(9550790), 'Bouteille de vin rouge'],
  ['vins-rouges', 'instant-pinot-noir-2022-rouge', 'Instant Pinot noir 2022, vin rouge', ttc(24, 20), 20, 'Pinot noir 2022, une cuvée plus ambitieuse pour les belles tables. 75 cl.', ['Une cuvée de pinot noir plus ambitieuse, pour un dîner ou une belle réception.', 'Millésime 2022, bouteille de 75 cl. ' + TIRE], px(10226064), 'Bouteille de vin rouge posée sur une table'],
  ['vins-blancs', 'jean-des-valanges-chardonnay-blanc', 'Jean des Valanges Chardonnay, vin blanc', ttc(12, 20), 20, 'Chardonnay frais et rond, bouteille de 75 cl.', ['Un chardonnay frais et rond, idéal à l’apéritif, avec les poissons et les pièces cocktail.', 'Bouteille de 75 cl. ' + TIRE], px(8472736), 'Bouteilles de vin blanc et de vin rouge, verres et raisin'],
  ['vins-blancs', 'pierrick-harang-petit-balthazar-bio-blanc', 'Pierrick Harang « Petit Balthazar » bio, vin blanc', ttc(12, 20), 20, 'Vin blanc issu de l’agriculture biologique, bouteille de 75 cl.', ['Un vin blanc issu de l’agriculture biologique, vif et fruité.', 'Bouteille de 75 cl. ' + TIRE], px(5895443), 'Vin blanc versé dans des verres'],
  ['vins-blancs', 'maison-orcia-viognier-blanc', 'Maison Orcia Viognier, vin blanc', ttc(24, 20), 20, 'Viognier aromatique de la vallée du Rhône, bouteille de 75 cl.', ['Un viognier aromatique de la vallée du Rhône, aux notes de fruits blancs, pour une belle table.', 'Bouteille de 75 cl. ' + TIRE], px(39852931), 'Service d’un vin blanc'],
  ['vins-roses', 'batti-batti-2024-rose', 'Batti Batti 2024, vin rosé', ttc(12, 20), 20, 'Rosé frais et léger, millésime 2024, bouteille de 75 cl.', ['Un rosé frais et léger, parfait pour l’été, les cocktails et les buffets en extérieur.', 'Millésime 2024, bouteille de 75 cl. ' + TIRE], px(15006643), 'Bouteille de vin rosé et verre'],
  ['alcools-forts', 'whisky-jack-daniels-70-cl', 'Whisky Jack Daniel’s Old No. 7 (70 cl)', plus20(45), 20, 'Le whiskey du Tennessee le plus servi dans les bars, bouteille de 70 cl.', ['Le célèbre whiskey du Tennessee, à servir sec, sur glace ou en cocktail (Jack & Coke).', 'Bouteille de 70 cl. À consommer avec modération.'], px(27393241), 'Bouteille de whiskey Jack Daniel’s'],
  ['alcools-forts', 'gin-bombay-sapphire-70-cl', 'Gin Bombay Sapphire (70 cl)', plus20(48), 20, 'Le gin des gin-tonics, bouteille de 70 cl.', ['Un London dry gin aux dix plantes aromatiques, la référence pour vos gin-tonics.', 'Bouteille de 70 cl. À consommer avec modération.'], px(7851381), 'Bouteille de gin Bombay Sapphire et gin-tonic'],
  ['alcools-forts', 'rhum-havana-club-especial-70-cl', 'Rhum Havana Club Especial (70 cl)', plus20(38), 20, 'Rhum cubain ambré, parfait pour les mojitos et les cocktails. 70 cl.', ['Un rhum cubain ambré et doux, parfait pour les mojitos, le punch et les cocktails.', 'Bouteille de 70 cl. À consommer avec modération.'], px(19562093), 'Bouteille de rhum Havana Club'],
  ['alcools-forts', 'vodka-absolut-70-cl', 'Vodka Absolut (70 cl)', plus20(40), 20, 'La vodka suédoise des cocktails et des shots, bouteille de 70 cl.', ['La vodka suédoise la plus connue, pour les cocktails, les shots ou sur glace.', 'Bouteille de 70 cl. À consommer avec modération.'], px(17722186), 'Bouteille de vodka Absolut'],
  ['accessoires', 'tire-bouchon', 'Tire-bouchon', ttc(3.1, 20), 20, 'Pour ouvrir vos bouteilles de vin : nos vins sont livrés sans tire-bouchon.', ['Un tire-bouchon pour ouvrir vos bouteilles de vin le jour J : nos vins sont livrés sans tire-bouchon.', 'Il reste à vous.'], px(8296228), 'Tire-bouchon et bouchons de liège'],
];

/* nos fiches gardées, et leur catégorie */
const CAVE_GARDEES = {
  'champagne-andre-diligent': 'champagne',
  'nos-open-bars': 'bars', 'open-bar-vins-et-champagnes': 'bars', 'open-bar-alcools-forts-a-volonte-5-h': 'bars',
  'bar-a-cocktails-4-h-au-cocktail': 'bars', 'bar-a-shots-a-volonte-1-h-30': 'bars', 'sangria-maison-au-litre': 'bars',
  'livraison-de-glacons-sac-de-20-kg': 'accessoires', 'gobelet-reutilisable-a-biere-50-cl': 'accessoires',
};

/* notre champagne, présenté en grand en tête de page (texte de notre brochure) */
const CHAMPAGNE = {
  extrait: 'Notre champagne de récoltant, de la Côte des Bar. Une valeur sûre pour vos réceptions.',
  description: [
    'Notre champagne de récoltant, une valeur sûre pour vos réceptions.',
    'Au sud de la Champagne, sur la Côte des Bar, dix hectares de vignes donnent naissance à un champagne de récoltant-manipulant : une maison qui accompagne son produit de la vigne à la bouteille, avec un excellent rapport qualité-prix.',
    'Des vins patiemment élevés et assemblés, puis conservés au moins deux ans en cave avant de rejoindre votre table.',
    'Bouteille de 75 cl, livrée fraîche avec votre commande.',
  ],
  photos: [{ src: '/site/c/cave/andre-diligent-seau.webp', alt: 'Deux bouteilles de champagne André Diligent dans un seau à glace, devant des flûtes' }],
};

const INTRO_CAVE = ['Notre cave, livrée avec votre commande',
  'Notre champagne de récoltant André Diligent, des vins choisis pour vos buffets et vos repas, des eaux, des softs artisanaux de Paris, des jus de fruits et quelques alcools pour vos cocktails.\nChoisissez une catégorie, ajoutez vos bouteilles à votre sélection : elles arrivent fraîches avec le reste de votre commande. Tous nos prix sont TTC.'];

/* prix donnés par Jean-Luc après coup (2026-11-25) : posés une fois, seulement si la fiche est encore « Sur devis » */
const PRIX_CAVE = { 'livraison-de-glacons-sac-de-20-kg': 4900 };
async function prixCave(store) {
  if (await store.get('_migr/prixCave1')) return;
  for (const [slug, prixCents] of Object.entries(PRIX_CAVE)) {
    const x = await store.get('produits/' + slug);
    if (x && x.prixCents == null) await store.set('produits/' + slug, { ...x, prixCents, prixTexte: null, unite: x.unite || 'sac', min: x.min || 1 });
  }
  await store.set('_migr/prixCave1', { at: new Date().toISOString() });
}

/* fiches ajoutées après coup (Jean-Luc, 2026-11-25) : rhum Trois-Rivières en tête des alcools forts (35 € puis 24,90 € TTC, photo de la bouteille fournie par Jean-Luc).
   Créées une fois, après la mise en place de la cave (sinon elles seraient masquées avec les anciennes boissons). */
const AJOUTS_CAVE = [
  { slug: 'rhum-trois-rivieres-blanc-50-70-cl', rangement: 'alcools-forts', ordre: 31, titre: 'Rhum blanc agricole Trois-Rivières 50° (70 cl)', prixCents: 2490, tva: 20,
    extrait: 'Le rhum blanc agricole de la Martinique, à 50°, pour le ti-punch, le planteur et les cocktails. 70 cl.',
    description: ['Rhum blanc agricole AOC Martinique de la distillerie Trois-Rivières, à 50°, distillé à partir de pur jus de canne à sucre.', 'Le rhum du ti-punch, du planteur et des cocktails antillais.', 'Bouteille de 70 cl. À consommer avec modération.'],
    photo: ['/site/c/cave/rhum-trois-rivieres-blanc-50.webp', 'Bouteille de rhum blanc agricole Trois-Rivières 50°'] },
];
async function ajoutsCave(store) {
  if (await store.get('_migr/caveAjouts1')) return 0;
  let n = 0;
  for (const x of AJOUTS_CAVE) {
    if (await store.get('produits/' + x.slug)) continue;
    await store.set('produits/' + x.slug, {
      id: x.slug, slug: x.slug, rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], rangement: x.rangement, titre: x.titre, prixCents: x.prixCents, coutCents: null, prixTexte: null,
      unite: 'bouteille', min: 1, minimumTexte: null, extrait: x.extrait, description: x.description, sections: [], details: [],
      photos: [{ src: x.photo[0], alt: x.photo[1] }], video: null, groupes: [], variantes: [], regles: {}, ordre: x.ordre, statut: 'visible', maison: false, tva: x.tva,
      allergenes: [], aCompleter: false, createdAt: new Date().toISOString(),
    });
    n++;
  }
  await store.set('_migr/caveAjouts1', { at: new Date().toISOString(), crees: n });
  return n;
}

/* Open bar vins et champagnes (Jean-Luc, 2026-11-25, texte de son ancien site) : aucun prix de barman ni de verre sur la fiche ;
   des vignettes mènent à la fiche Barman (nombre de barmans et d'heures) et à la fiche Verres en verre.
   Fiche Barman : forfait de son ancien site, 229 € HT pour un barman, lu comme 4 heures minimum → 57,25 € HT = 68,70 € TTC de l'heure (TVA 20 %). */
const BARMAN_HEURE = 6870;
const BARMAN = {
  id: 'barman', slug: 'barman', rubrique: 'personnel', autresRubriques: ['boissons'], sous: '', autresSous: [], rangement: 'bars', titre: 'Barman',
  prixCents: BARMAN_HEURE, coutCents: null, prixTexte: null, unite: 'heure', min: 4, minimumTexte: null,
  extrait: 'Un barman pour servir vos invités au bar : open bar, cocktails, champagne. Un barman pour 30 à 40 invités environ.',
  description: ['Nos barmans tiennent votre bar pendant toute la durée de l’événement : ils servent vos invités, ouvrent et rafraîchissent les bouteilles, gardent le bar propre et rangé.',
    'Comptez un barman pour 30 à 40 invités environ, selon l’événement. Choisissez le nombre de barmans, puis le nombre d’heures (4 heures minimum).'],
  sections: [], details: [], photos: [{ src: px(5531479), alt: 'Barman qui sert un cocktail au bar' }], video: null,
  groupes: [{ id: 'barmans', titre: 'Nombre de barmans', radio: true, max: 1, exact: true, aide: 'Un barman pour 30 à 40 invités environ.',
    options: [1, 2, 3, 4, 5].map(n => ({ id: n + 'b', label: n === 1 ? '1 barman (jusqu’à 40 invités)' : `${n} barmans (jusqu’à ${n * 40} invités)`, supCents: (n - 1) * BARMAN_HEURE })) }],
  variantes: [], regles: { horaire: true }, ordre: 5, statut: 'visible', maison: true, tva: 20, allergenes: [], aCompleter: false,
};
const OPEN_BAR_VC = {
  prixAffiche: 'Selon consommation',
  extrait: 'Un open bar vins et champagnes pour toute la durée de votre événement : vous ne payez que les bouteilles consommées.',
  description: [
    'Mise en place d’un open bar vins et champagnes pour toute la durée de votre événement.',
    'L’avantage de cette formule : vous ne payez que les bouteilles que vous aurez consommées, après un minimum de consommation demandé.',
    'Les bouteilles sont comptées avant le début de votre événement et un inventaire est fait à la fin, tout cela en votre présence.',
  ],
  sections: [{ titre: 'Nous vous installons un stand avec', note: null, apres: null, paragraphes: [], items: [
    'Un ou plusieurs barmans pour servir vos invités (1 pour 30 à 40 personnes environ, selon l’événement)',
    'Un espace bar avec son nappage',
    'Des vasques à champagne',
    'Des glaçons et un bac isotherme pour refroidir les bouteilles',
    'Des verres éco-responsables (vrais verres en option)'] }],
  details: ['Personnel Magnolia obligatoire ; chèque de caution ; seuls les vins et champagnes Magnolia sont servis.'],
  liees: [
    { slug: 'barman', titre: 'Vos barmans', texte: 'Validez le nombre de barmans et d’heures sur la fiche Barman (1 barman pour 30 à 40 invités).' },
    { slug: 'verres-en-verre-vin-coupes-a-champagne', titre: 'Vrais verres en option', texte: 'Pour servir dans de vrais verres, ajoutez-les à votre demande depuis la fiche Verres.' },
  ],
};
/* le texte sous la photo (écrit par l'IA d'après l'ancienne fiche) disait « sans minimum de consommation » : remplacé une fois */
const OPEN_BAR_SOUS_PHOTO = ['Offrez à vos invités les vins et champagnes de la cave Magnolia, servis par nos barmans pendant toute la durée de votre événement.',
  'Les bouteilles sont comptées avant et après l’événement, en votre présence : vous ne payez que celles qui ont été consommées, après un minimum de consommation. Une formule simple et transparente pour vos mariages, réceptions et soirées.'];
async function openBarSousPhoto(store) {
  if (await store.get('_migr/openBarVC2')) return;
  const x = await store.get('produits/open-bar-vins-et-champagnes');
  if (x && (!(x.sousPhoto || []).length || x.sousPhotoAuto || /sans minimum/i.test((x.sousPhoto || []).join(' ')))) await store.set('produits/open-bar-vins-et-champagnes', { ...x, sousPhoto: OPEN_BAR_SOUS_PHOTO, sousPhotoAuto: false });
  await store.set('_migr/openBarVC2', { at: new Date().toISOString() });
}
async function openBarCave(store) {
  await openBarSousPhoto(store);
  if (await store.get('_migr/openBarVC1')) return;
  if (!(await store.get('produits/barman'))) await store.set('produits/barman', { ...BARMAN, createdAt: new Date().toISOString() });
  const x = await store.get('produits/open-bar-vins-et-champagnes');
  if (x) await store.set('produits/open-bar-vins-et-champagnes', { ...x, ...OPEN_BAR_VC });
  await store.set('_migr/openBarVC1', { at: new Date().toISOString() });
}

/* Sodas (Jean-Luc, 2026-11-25) : plus de Paris Cola ni de Parismonade ; Coca-Cola et Coca-Cola Zéro en bouteille de 1,5 L.
   Prix : environ 4,50 € HT chez les traiteurs → TTC (10 %) + 10 % = 5,50 €. */
const SODAS_RETIRES = ['paris-cola-33-cl', 'paris-cola-zero-33-cl', 'parismonade-33-cl', 'parismonade-75-cl', 'paris-cola-75-cl'];
const SODAS_COCA = [
  { slug: 'coca-cola-1-5-l', titre: 'Coca-Cola (1,5 L)', ordre: 14, photo: ['/site/c/cave/coca-cola-1-5-l.webp', 'Bouteille de Coca-Cola 1,5 L'],
    extrait: 'Coca-Cola original, grande bouteille de 1,5 litre à partager.', description: ['Coca-Cola original, grande bouteille de 1,5 litre à partager.', FRAIS] },
  { slug: 'coca-cola-zero-1-5-l', titre: 'Coca-Cola Zéro (1,5 L)', ordre: 14.5, photo: ['/site/c/cave/coca-cola-zero-1-5-l.webp', 'Bouteille de Coca-Cola Zéro 1,5 L'],
    extrait: 'Coca-Cola Zéro sucre, grande bouteille de 1,5 litre à partager.', description: ['Coca-Cola Zéro sucre, grande bouteille de 1,5 litre à partager.', FRAIS] },
];
async function sodasCave(store) {
  if (await store.get('_migr/caveSodas1')) return;
  for (const slug of SODAS_RETIRES) {
    const x = await store.get('produits/' + slug);
    if (x && x.statut !== 'masque') await store.set('produits/' + slug, { ...x, statut: 'masque', masqueCave: true });
  }
  for (const x of SODAS_COCA) {
    if (await store.get('produits/' + x.slug)) continue;
    await store.set('produits/' + x.slug, {
      id: x.slug, slug: x.slug, rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], rangement: 'sodas', titre: x.titre, prixCents: ttc(4.5, 10), coutCents: null, prixTexte: null,
      unite: 'bouteille', min: 1, minimumTexte: null, extrait: x.extrait, description: x.description, sections: [], details: [],
      photos: [{ src: x.photo[0], alt: x.photo[1] }], video: null, groupes: [], variantes: [], regles: {}, ordre: x.ordre, statut: 'visible', maison: false, tva: 10,
      allergenes: [], aCompleter: false, createdAt: new Date().toISOString(),
    });
  }
  await store.set('_migr/caveSodas1', { at: new Date().toISOString() });
}

/* Vins ajoutés par Jean-Luc (2026-11-25), à ses prix TTC (pas de majoration) :
   Château La Gordonne « Vérité du Terroir » (ancienne fiche remise en ligne) et Bordeaux rosé Manoir de la Valette. */
async function vinsCave(store) {
  if (await store.get('_migr/caveVins1')) return;
  const now = new Date().toISOString();
  const g = await store.get('produits/chateau-la-gordonne-verite-du-terroir');
  const gordonne = {
    rangement: 'vins-rouges', titre: 'Château La Gordonne « Vérité du Terroir », vin rouge', prixCents: 1790, prixTexte: null, unite: 'bouteille', min: 1,
    extrait: 'Vin rouge de Provence du Château La Gordonne, cuvée Vérité du Terroir, bouteille de 75 cl.',
    description: ['Un rouge de Provence du Château La Gordonne, cuvée Vérité du Terroir, fruité et généreux, pour vos repas et vos buffets.', 'Bouteille de 75 cl. ' + TIRE],
    statut: 'visible', masqueCave: false, ordre: 26.5, tva: 20,
  };
  if (g) await store.set('produits/chateau-la-gordonne-verite-du-terroir', { ...g, ...gordonne, photos: (g.photos || []).length ? g.photos : [{ src: px(8473211), alt: 'Bouteille et verre de vin rouge, grappe de raisin' }] });
  else await store.set('produits/chateau-la-gordonne-verite-du-terroir', { id: 'chateau-la-gordonne-verite-du-terroir', slug: 'chateau-la-gordonne-verite-du-terroir', rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], coutCents: null, minimumTexte: null, sections: [], details: [], photos: [{ src: px(8473211), alt: 'Bouteille et verre de vin rouge, grappe de raisin' }], video: null, groupes: [], variantes: [], regles: {}, maison: false, allergenes: ['Sulfites'], aCompleter: false, createdAt: now, ...gordonne });
  if (!(await store.get('produits/bordeaux-rose-manoir-de-la-valette'))) await store.set('produits/bordeaux-rose-manoir-de-la-valette', {
    id: 'bordeaux-rose-manoir-de-la-valette', slug: 'bordeaux-rose-manoir-de-la-valette', rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], rangement: 'vins-roses',
    titre: 'Bordeaux rosé Manoir de la Valette AOP', prixCents: 1650, coutCents: null, prixTexte: null, unite: 'bouteille', min: 1, minimumTexte: null,
    extrait: 'Bordeaux rosé AOP du Manoir de la Valette, frais et fruité, bouteille de 75 cl.',
    description: ['Un Bordeaux rosé AOP du Manoir de la Valette, frais et fruité, pour l’apéritif, les buffets et les repas d’été.', 'Bouteille de 75 cl. ' + TIRE],
    sections: [], details: [], photos: [{ src: 'https://images.pexels.com/photos/4906328/pexels-photo-4906328.jpeg?auto=compress&cs=tinysrgb&w=1200', alt: 'Verre de vin rosé' }],
    video: null, groupes: [], variantes: [], regles: {}, ordre: 32.5, statut: 'visible', maison: false, tva: 20, allergenes: ['Sulfites'], aCompleter: false, createdAt: now,
  });
  await store.set('_migr/caveVins1', { at: now });
}

/* Eaux (Jean-Luc, 2026-11-25) : l'eau plate devient la Cristaline 1,5 L à 2,50 € TTC l'unité ; le Perrier est remplacé
   par l'eau pétillante 1,5 L que Magnolia propose déjà (ancien site, page « Nos boissons sans alcool »), au même prix. */
const EAUX_RETIREES = ['eau-evian-50-cl', 'eau-vittel-1-l', 'perrier-fines-bulles-1-l'];
const EAUX_NOUVELLES = [
  { slug: 'eau-plate-cristaline-1-5-l', titre: 'Eau plate Cristaline (1,5 L)', ordre: 10, photo: ['/site/c/cave/cristaline-plate-1-5-l.webp', 'Bouteille d’eau plate Cristaline 1,5 L'],
    extrait: 'Eau de source plate Cristaline, bouteille de 1,5 litre, vendue à l’unité.', description: ['Eau de source plate Cristaline, bouteille de 1,5 litre, vendue à l’unité.', FRAIS] },
  { slug: 'eau-petillante-1-5-l', titre: 'Eau gazeuse Cristaline (1,5 L)', ordre: 10.5, prix: 220, photo: ['/site/c/cave/cristaline-gazeifiee-1-5-l.webp', 'Bouteille de Cristaline gazéifiée 1,5 L'],
    extrait: 'Eau de source gazéifiée Cristaline, bouteille de 1,5 litre, vendue à l’unité.', description: ['Eau de source gazéifiée Cristaline, bouteille de 1,5 litre, vendue à l’unité.', FRAIS] },
];
async function eauxCave(store) {
  if (await store.get('_migr/caveEaux1')) return;
  for (const slug of EAUX_RETIREES) {
    const x = await store.get('produits/' + slug);
    if (x && x.statut !== 'masque') await store.set('produits/' + slug, { ...x, statut: 'masque', masqueCave: true });
  }
  for (const x of EAUX_NOUVELLES) {
    if (await store.get('produits/' + x.slug)) continue;
    await store.set('produits/' + x.slug, {
      id: x.slug, slug: x.slug, rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], rangement: 'eaux', titre: x.titre, prixCents: x.prix || 250, coutCents: null, prixTexte: null,
      unite: 'bouteille', min: 1, minimumTexte: null, extrait: x.extrait, description: x.description, sections: [], details: [],
      photos: [{ src: x.photo[0], alt: x.photo[1] }], video: null, groupes: [], variantes: [], regles: {}, ordre: x.ordre, statut: 'visible', maison: false, tva: 10,
      allergenes: [], aCompleter: false, createdAt: new Date().toISOString(),
    });
  }
  await store.set('_migr/caveEaux1', { at: new Date().toISOString() });
}

/* Photos des Coca-Cola 1,5 L fournies par Jean-Luc (2026-11-25) : posées une fois sur les deux fiches */
async function cocaPhotos(store) {
  if (await store.get('_migr/caveCocaPhotos1')) return;
  for (const x of SODAS_COCA) {
    const d = await store.get('produits/' + x.slug);
    if (d) await store.set('produits/' + x.slug, { ...d, photos: [{ src: x.photo[0], alt: x.photo[1] }] });
  }
  await store.set('_migr/caveCocaPhotos1', { at: new Date().toISOString() });
}

/* Eau gazeuse (Jean-Luc, 2026-11-25) : Cristaline gazéifiée 1,5 L à 2,20 € TTC, avec sa photo */
async function cristalineGaz(store) {
  if (await store.get('_migr/caveCristalineGaz1')) return;
  const x = EAUX_NOUVELLES[1], d = await store.get('produits/' + x.slug);
  if (d) await store.set('produits/' + x.slug, { ...d, titre: x.titre, prixCents: x.prix, extrait: x.extrait, description: x.description, photos: [{ src: x.photo[0], alt: x.photo[1] }] });
  await store.set('_migr/caveCristalineGaz1', { at: new Date().toISOString() });
}

/* Photo de la Cristaline plate fournie par Jean-Luc (2026-11-25), cadrée sur l'étiquette ; la gazeuse recadrée de même */
async function cristalinePlate(store) {
  if (await store.get('_migr/caveCristalinePlate1')) return;
  for (const x of EAUX_NOUVELLES) {
    const d = await store.get('produits/' + x.slug);
    if (d) await store.set('produits/' + x.slug, { ...d, photos: [{ src: x.photo[0] + '?v=2', alt: x.photo[1] }] });
  }
  await store.set('_migr/caveCristalinePlate1', { at: new Date().toISOString() });
}

/* Jean-Luc (2026-11-25) : plus de Badoit ni de Perrier ; catégories Sodas et Jus de fruits ; bandeau de la cave = vidéo sombre où l'on sert du champagne dans des flûtes
   (montage de 2 vidéos Pexels, sources dans data/credits-photos-univers.md) */
async function caveBandeauBadoit(store) {
  if (await store.get('_migr/caveBandeau1')) return;
  for (const slug of ['eau-badoit-50-cl', 'perrier-fines-bulles-1-l']) {
    const x = await store.get('produits/' + slug);
    if (x && x.statut !== 'masque') await store.set('produits/' + slug, { ...x, statut: 'masque', masqueCave: true });
  }
  /* « Sodas » (sans limonades, vignette Coca-Cola) ; « Jus de fruits » seuls : thés glacés et citronnade JOMO retirés */
  for (const slug of ['jomo-citronnade-gingembre-35-cl', 'jomo-the-vert-menthe-citron-35-cl', 'jomo-the-blanc-peche-hibiscus-35-cl']) {
    const x = await store.get('produits/' + slug);
    if (x && x.statut !== 'masque') await store.set('produits/' + slug, { ...x, statut: 'masque', masqueCave: true });
  }
  const rh = AJOUTS_CAVE[0], d = await store.get('produits/' + rh.slug);
  if (d) await store.set('produits/' + rh.slug, { ...d, prixCents: rh.prixCents, photos: [{ src: rh.photo[0], alt: rh.photo[1] }] });
  const rb = await store.get('rubriques/boissons');
  const sec = k => CAVE_SECTIONS.find(x => x[0] === k);
  if (rb) await store.set('rubriques/boissons', { ...rb, bandeauVideo: '/site/v/bandeaux/cave-champagne.mp4', bandeauPoster: '/site/v/bandeaux/cave-champagne.jpg',
    titresSections: { ...(rb.titresSections || {}), sodas: sec('sodas')[1], jus: sec('jus')[1] },
    photosSections: { ...(rb.photosSections || {}), sodas: sec('sodas')[2], jus: sec('jus')[2] } });
  await store.set('_migr/caveBandeau1', { at: new Date().toISOString() });
}

async function initCave(store) {
  await prixCave(store);
  if (await store.get('_migr/caveCercle')) { await openBarCave(store); await sodasCave(store); await vinsCave(store); await eauxCave(store); await cocaPhotos(store); await cristalineGaz(store); await cristalinePlate(store); await caveBandeauBadoit(store); return ajoutsCave(store); }
  const now = new Date().toISOString();
  let n = 0;
  for (const d of await store.list('produits')) {
    const x = d.data;
    if (!x || x.rubrique !== 'boissons') continue;
    const id = x.slug || d.id;
    if (CAVE_GARDEES[id]) {
      const maj = { ...x, rangement: CAVE_GARDEES[id] };
      if (id === 'champagne-andre-diligent') Object.assign(maj, CHAMPAGNE, { ordre: 0, minimumTexte: null, statut: 'visible' });
      await store.set('produits/' + d.id, maj);
    } else if (x.statut !== 'masque' && !CAVE_PRODUITS.some(p => p[1] === id)) {
      await store.set('produits/' + d.id, { ...x, statut: 'masque', masqueCave: true });
    }
  }
  for (const [ordre, [rangement, slug, titre, prixCents, tva, extrait, description, src, alt]] of CAVE_PRODUITS.entries()) {
    if (await store.get('produits/' + slug)) continue;
    await store.set('produits/' + slug, {
      id: slug, slug, rubrique: 'boissons', autresRubriques: [], sous: '', autresSous: [], rangement, titre, prixCents, coutCents: null, prixTexte: null,
      unite: 'bouteille', min: 1, minimumTexte: null, extrait, description, sections: [], details: [],
      photos: [{ src, alt }], video: null, groupes: [], variantes: [], regles: {}, ordre: 10 + ordre, statut: 'visible', maison: false, tva,
      allergenes: tva === 20 && /vin|champagne/i.test(titre) ? ['Sulfites'] : [], aCompleter: false, createdAt: now,
    });
    n++;
  }
  const rb = await store.get('rubriques/boissons');
  if (rb) {
    const ancienne = !rb.introTexte || /Bourgogne, à Bordeaux/.test(rb.introTexte);
    await store.set('rubriques/boissons', {
      ...rb, parSections: true, tuilesSections: true, sectionsVedette: ['champagne'],
      ordreSections: CAVE_SECTIONS.map(s => s[0]),
      titresSections: { ...Object.fromEntries(CAVE_SECTIONS.map(s => [s[0], s[1]])), ...(rb.titresSections || {}) },
      photosSections: { ...Object.fromEntries(CAVE_SECTIONS.map(s => [s[0], s[2]])), ...(rb.photosSections || {}) },
      ...(ancienne ? { introTitre: INTRO_CAVE[0], introTexte: INTRO_CAVE[1] } : {}),
    });
  }
  await store.set('_migr/caveCercle', { at: now, crees: n });
  await openBarCave(store);
  await sodasCave(store);
  await vinsCave(store);
  await eauxCave(store);
  await cocaPhotos(store);
  await cristalineGaz(store);
  await cristalinePlate(store);
  await caveBandeauBadoit(store);
  return n + await ajoutsCave(store);
}

module.exports = { BARMAN, OPEN_BAR_VC, CAVE_SECTIONS, CAVE_PRODUITS, AJOUTS_CAVE, CAVE_GARDEES, INTRO_CAVE, ttc, initCave };
