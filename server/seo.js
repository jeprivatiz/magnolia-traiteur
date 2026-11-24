'use strict';
/*
 * Titres et descriptions « dans Google » (demande de Jean-Luc, 2026-11-24).
 * - Rubriques et spécialités : textes écrits à la main (tables ci-dessous).
 * - Produits : modèle simple tout de suite, puis l'IA (server/ia.js) les réécrit en arrière-plan.
 * - Un texte tapé dans le back-office n'est JAMAIS écrasé : seuls les champs vides ou encore égaux
 *   au texte posé automatiquement (mémorisé dans `seoAuto`) peuvent être remplis ou améliorés.
 * Règles : titre ≤ 60 caractères, description ≤ 158, jamais « à Paris et en Île-de-France » dans un titre,
 * jamais de fournisseur ni de restaurant partenaire, pas de « sur devis ».
 */

const MARQUE = 'Magnolia Traiteur';
const T_MAX = 60, D_MAX = 158;

const RUB = {
  'cocktails-buffets': ['Traiteur cocktail et buffet français | Magnolia Traiteur', 'Cocktails dînatoires, buffets froids et chauds, pièces salées et sucrées faites maison pour vos réceptions. Livraison 7 j/7 en Île-de-France.'],
  'carte-magnolia': ['Carte traiteur à la portion | Magnolia Traiteur', 'Entrées, plats, fromages et desserts cuisinés par nos chefs, à commander à la portion dès 5 parts pour vos repas et réceptions. Livraison 7 j/7.'],
  'saveurs-du-monde': ['Traiteur cuisines du monde | Magnolia Traiteur', 'Buffets antillais, libanais, chinois, indien, italien, africain, japonais, paëlla et couscous party : le monde entier, une seule maison.'],
  'grand-large': ['Plateaux de fruits de mer traiteur | Magnolia Traiteur', 'Huîtres, crevettes, homard, tourteau et langoustines en plateaux de fruits de mer pour vos réceptions et repas de fête. Livraison en Île-de-France.'],
  'boissons': ['Boissons, vins et champagne | Magnolia Traiteur', 'Champagne, vins, softs, open bars et boissons chaudes pour accompagner votre buffet ou votre cocktail, livrés avec votre commande traiteur.'],
  'coffrets-plateaux': ['Coffrets et plateaux traiteur | Magnolia Traiteur', 'Coffrets antillais, italien, libanais, plateaux de mini burgers, de fromages ou de fruits : à partager, prêts à servir. Livraison 7 j/7.'],
  'traiteur-vegetarien-vegan': ['Traiteur végétarien et vegan | Magnolia Traiteur', 'Buffets et cocktails sans viande ni poisson, formules vegan : salades composées, tartes, cakes et desserts faits maison. Livraison en Île-de-France.'],
  'animations-salees': ['Animations culinaires salées | Magnolia Traiteur', 'Pizzaïolo, bar à burrata, barbecue, ti punch et accras : des animations cuisinées devant vos invités pour vos mariages, soirées et séminaires.'],
  'douceurs': ['Animations sucrées et desserts | Magnolia Traiteur', 'Crêpes à volonté, barbe à papa, fontaine à chocolat, sorbets, gâteaux et pièces montées pour régaler vos invités. Livraison en Île-de-France.'],
  'petits-dejeuners': ['Petit-déjeuner et pause café traiteur | Magnolia Traiteur', 'Pause café, petit-déjeuner classique ou luxe pour vos séminaires, réunions et accueils d’invités, dès 20 personnes. Livraison 7 j/7 en Île-de-France.'],
  'indispensables': ['Location de matériel de réception | Magnolia Traiteur', 'Vaisselle, nappage, tables, mange-debout, tente, tireuse à bières, photo booth : tout le matériel pour réussir votre réception, livré et repris.'],
  'personnel': ['Serveurs et maîtres d’hôtel | Magnolia Traiteur', 'Maîtres d’hôtel, serveurs, régisseur, grilladin et pizzaïolo pour le service de votre cocktail ou de votre buffet, 4 heures minimum.'],
  'musique-animations': ['DJ, musiciens et spectacles | Magnolia Traiteur', 'DJ, groupes live, jazz, saxophoniste, magicien, sonorisation, lumières et écran LED pour animer votre mariage, anniversaire ou soirée d’entreprise.'],
  'lieux': ['Lieux de réception à privatiser | Magnolia Traiteur', 'Salles et lieux de réception à privatiser pour vos mariages, anniversaires et événements d’entreprise, avec le traiteur Magnolia en cuisine.'],
};
const SOUS = {
  'paella-party': ['Paëlla party, paëlla géante traiteur | Magnolia Traiteur', 'Paëlla géante cuisinée devant vos invités ou livrée prête à servir : royale, poulet chorizo, fruits de mer ou végétarienne. Pour toutes vos fêtes.'],
  'buffet-libanais': ['Traiteur libanais, buffet de mezzés | Magnolia Traiteur', 'Mezzés froids et chauds, grillades et douceurs orientales pour vos réceptions : buffet libanais complet ou pièces à l’unité. Livraison 7 j/7.'],
  'buffet-chinois': ['Traiteur chinois, buffet asiatique | Magnolia Traiteur', 'Bouchées vapeur, nems, plats sautés et desserts asiatiques : buffet chinois ou plats à l’unité, livrés prêts à servir en Île-de-France.'],
  'buffet-africain': ['Traiteur africain, buffet africain | Magnolia Traiteur', 'Mafé, yassa, poulet braisé, alloco, attiéké et accras : les saveurs d’Afrique pour vos fêtes, mariages et baptêmes. Livraison 7 j/7.'],
  'couscous-party': ['Couscous party, couscous royal traiteur | Magnolia Traiteur', 'Couscous royal ou végétarien et pâtisseries orientales pour vos grandes tablées, anniversaires et fêtes de famille. Livraison en Île-de-France.'],
  'buffet-italien': ['Traiteur italien, buffet italien | Magnolia Traiteur', 'Antipasti, pâtes, burrata, charcuterie italienne et tiramisu : un buffet italien généreux pour vos réceptions. Livraison 7 j/7 en Île-de-France.'],
  'buffet-antillais': ['Traiteur antillais, buffet créole | Magnolia Traiteur', 'Accras, boudins créoles, colombo, rougail et punchs faits maison : buffet antillais complet ou plats à l’unité. Livraison 7 j/7 en Île-de-France.'],
  'buffet-indien': ['Traiteur indien, buffet indien | Magnolia Traiteur', 'Samoussas, currys, biryani, naans et lassis : un buffet indien parfumé pour vos réceptions, ou des plats à l’unité. Livraison 7 j/7.'],
  'specialites-japonaises': ['Traiteur japonais, plateaux de sushis | Magnolia Traiteur', 'Plateaux de sushis, makis et californias en assortiment pour vos cocktails, réunions et soirées. Livraison 7 j/7 en Île-de-France.'],
};

/* mot-clé ajouté au nom du produit quand il ne le dit pas déjà */
const MOT_RUB = {
  'cocktails-buffets': 'traiteur cocktail', 'carte-magnolia': 'traiteur', 'grand-large': 'fruits de mer', boissons: 'boisson pour réception',
  'coffrets-plateaux': 'coffret traiteur', 'traiteur-vegetarien-vegan': 'traiteur végétarien', 'animations-salees': 'animation traiteur',
  douceurs: 'dessert traiteur', 'petits-dejeuners': 'petit-déjeuner traiteur', indispensables: 'location réception', personnel: 'personnel de réception',
  'musique-animations': 'animation de soirée', lieux: 'lieu de réception',
};
const MOT_SOUS = {
  'paella-party': 'paëlla party', 'buffet-libanais': 'traiteur libanais', 'buffet-chinois': 'traiteur chinois', 'buffet-africain': 'traiteur africain',
  'couscous-party': 'couscous party', 'buffet-italien': 'traiteur italien', 'buffet-antillais': 'traiteur antillais', 'buffet-indien': 'traiteur indien',
  'specialites-japonaises': 'traiteur japonais',
};

const INTERDIT = /himalaya|palais de|partenaire|fournisseur|restaurant|sur devis|non contractuel/i;
const IDF_TITRE = /paris\s+et\s+(en\s+)?(l['’]\s*)?[îi]le/i;

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const espaces = s => String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

/* « ALLOCO 300g/pers » → « Alloco 300g/pers » ; « — » → « – » */
function nomNet(t) {
  return espaces(t).replace(/\s+[—·]\s+/g, ' – ').replace(/\b([A-ZÀ-ÖØ-Þ]{4,})\b/g, w => w[0] + w.slice(1).toLowerCase());
}

/* coupe au dernier mot entier qui tient */
function couper(s, n) {
  s = espaces(s);
  if (s.length <= n) return s;
  const c = s.slice(0, n - 1), i = c.lastIndexOf(' ');
  return (i > n * 0.6 ? c.slice(0, i) : c).replace(/[\s,;:–-]+$/, '') + '…';
}

function titreAvecMarque(coeur) {
  for (const suffixe of [' | ' + MARQUE, ' | Magnolia']) if ((coeur + suffixe).length <= T_MAX) return coeur + suffixe;
  return couper(coeur, T_MAX - ' | Magnolia'.length) + ' | Magnolia';
}

const euro = c => (c / 100).toFixed(2).replace('.', ',').replace(',00', '') + ' €';
const UNITE = { personne: 'par personne', heure: 'de l’heure', portion: 'la portion', 'pièce': 'la pièce', plateau: 'le plateau', coffret: 'le coffret', bouteille: 'la bouteille', forfait: 'le forfait', corbeille: 'la corbeille', 'gâteau': 'le gâteau', location: 'la location', enfant: 'par enfant', brochette: 'la brochette', litre: 'le litre', pot: 'le pot' };
function prixTexte(p) {
  if (p.prixCents == null || !(p.prixCents > 0)) return '';
  const u = UNITE[p.unite] || (p.unite ? '/ ' + p.unite : '');
  const min = p.min > 1 && ['personne', 'portion', 'pièce'].includes(p.unite) ? `, dès ${p.min} ${p.unite === 'personne' ? 'personnes' : p.unite === 'portion' ? 'portions' : 'pièces'}` : '';
  return `${(p.variantes || []).length > 1 ? 'À partir de ' : ''}${euro(p.prixCents)} TTC ${u}${min}.`.replace(/\s+/g, ' ');
}

/* phrases utiles du produit : sans prix, minimum, « sur devis », gras ni majuscules criardes */
function phrasesDe(p, extraitsCommuns) {
  const nom = sansAccent(espaces(p.titre));
  const brut = [p.extrait, ...(Array.isArray(p.description) ? p.description : [p.description])].filter(Boolean).map(espaces);
  for (const t of brut) {
    if (extraitsCommuns?.has(t)) continue;
    const phrases = t.split(/(?<=[.!?])\s+|\s+·\s+/).map(x => x.trim())
      .map(x => nom && sansAccent(x).startsWith(nom) ? x.slice(nom.length).replace(/^\s*[:,–-]\s*/, '') : x)
      .filter(x => x && !/€|minimum|tarif|sur devis|^\d/i.test(x) && !IDF_TITRE.test(x) && !INTERDIT.test(x) && x.length > 12 && x !== x.toUpperCase())
      .map(x => x.charAt(0).toUpperCase() + x.slice(1).replace(/([^.!?])$/, '$1.'));
    if (phrases.length) return phrases;
  }
  return [];
}
/* phrases entières qui tiennent dans n caractères (sinon le début de la première, coupé à une virgule) */
function phrasesQuiTiennent(phrases, n) {
  let out = '';
  for (const ph of phrases) { const s = out ? out + ' ' + ph : ph; if (s.length <= n) out = s; else break; }
  if (out || !phrases.length) return out;
  const c = phrases[0].slice(0, n), i = c.lastIndexOf(',');
  const r = i > 25 ? c.slice(0, i) : '';
  return r && (r.match(/\(/g) || []).length === (r.match(/\)/g) || []).length ? r + '.' : '';
}
const phraseDe = (p, ec) => phrasesDe(p, ec).join(' ');

function contientMot(titre, mot) {
  const t = sansAccent(titre);
  return sansAccent(mot).split(' ').filter(w => w.length > 3 && w !== 'traiteur').every(w => t.includes(w.replace(/s$/, '')));
}

/* modèle simple, sans IA */
function modeleProduit(p, { extraitsCommuns } = {}) {
  const nom = nomNet(p.titre || '');
  const mot = MOT_SOUS[p.sous] || MOT_RUB[p.rubrique] || 'traiteur';
  let coeur = nom;
  if (!contientMot(nom, mot) && (nom + ' – ' + mot + ' | Magnolia').length <= T_MAX) coeur = nom + ' – ' + mot;
  const titre = titreAvecMarque(coeur);
  const partout = p.rubrique === 'personnel' || p.rubrique === 'musique-animations';
  const prix = prixTexte(p), prixCourt = prix.replace(/, dès \d+ \S+\.$/, '.');
  const debut = nom + ' par ' + MARQUE;
  const phrases = phrasesDe(p, extraitsCommuns);
  const essais = [];
  for (const fin of partout ? ['Partout en Île-de-France.', 'En Île-de-France.'] : ['Livraison 7 j/7 en Île-de-France.', 'Livraison en Île-de-France.'])
    for (const px of [prix, prixCourt]) essais.push(' ' + [px, fin].filter(Boolean).join(' '));
  let d = '';
  for (const fixe of essais) {
    for (const tete of [debut + ' : ', nom + ' : ']) {
      const ph = phrasesQuiTiennent(phrases.map((x, i) => i ? x : x.charAt(0).toLowerCase() + x.slice(1)), D_MAX - fixe.length - tete.length);
      if (ph) { d = tete + ph + fixe; break; }
    }
    if (d) break;
  }
  if (!d) d = essais.map(f => debut + ', ' + (mot === 'traiteur' ? 'traiteur événementiel' : mot) + '.' + f).find(x => x.length <= D_MAX) || essais.map(f => nom + '.' + f).find(x => x.length <= D_MAX) || nom;
  return { titre, description: couper(d, D_MAX) };
}

function modeleRubrique(r) {
  if (RUB[r.slug]) return { titre: RUB[r.slug][0], description: RUB[r.slug][1] };
  const nom = nomNet(r.titrePage || r.nom || '');
  return { titre: titreAvecMarque(nom), description: couper(phraseDe({ extrait: r.chapo }) || `${nom} par ${MARQUE}, traiteur événementiel. Livraison 7 j/7 en Île-de-France.`, D_MAX) };
}
function modeleSous(x) {
  if (SOUS[x.slug]) return { titre: SOUS[x.slug][0], description: SOUS[x.slug][1] };
  const nom = nomNet(x.titrePage || x.nom || '');
  const ph = phraseDe({ extrait: x.chapo });
  return { titre: titreAvecMarque(/traiteur/i.test(nom) ? nom : nom + ' – traiteur'), description: couper(ph ? ph + ' Livraison 7 j/7 en Île-de-France.' : `${nom} par ${MARQUE}. Livraison 7 j/7 en Île-de-France.`, D_MAX) };
}

/*
 * remplit les champs vides d'un objet (produit, rubrique ou spécialité) ; garde tout texte tapé à la main.
 * `seoAuto` = { titre, description, ia } : les textes posés automatiquement (pour reconnaître ceux qu'on peut encore améliorer).
 * Renvoie true si l'objet a changé.
 */
function remplir(o, modele) {
  const auto = { ...(o.seoAuto || {}) };
  let change = false, m = null;
  for (const [champ, k] of [['seoTitre', 'titre'], ['seoDescription', 'description']]) {
    const v = espaces(o[champ]);
    if (v && v !== auto[k]) { if (k in auto) { delete auto[k]; change = true; } continue; } /* écrit à la main : on n'y touche plus */
    if (v) continue;
    m = m || modele();
    o[champ] = m[k]; auto[k] = m[k]; change = true;
  }
  if (!('titre' in auto) && !('description' in auto)) { if (o.seoAuto) { delete o.seoAuto; change = true; } }
  else if (change) o.seoAuto = auto;
  return change;
}

function remplirProduit(p, opts) { return remplir(p, () => modeleProduit(p, opts)); }
function remplirRubrique(r) {
  let change = remplir(r, () => modeleRubrique(r));
  for (const x of r.sous || []) if (remplir(x, () => modeleSous(x))) change = true;
  /* textes écrits pour les rubriques connues : rien à demander à l'IA */
  for (const o of [r, ...(r.sous || [])]) if (o.seoAuto && !o.seoAuto.ia && (RUB[o.slug] || SOUS[o.slug])) { o.seoAuto.ia = true; change = true; }
  return change;
}

/* extraits partagés par plusieurs produits (« Formules petit-déjeuner et pauses café. ») : pas assez précis pour Google */
function extraitsCommuns(produits) {
  const n = new Map();
  for (const p of produits) { const e = espaces(p.extrait); if (e) n.set(e, (n.get(e) || 0) + 1); }
  return new Set([...n].filter(([, k]) => k > 1).map(([e]) => e));
}

/* ---------- IA ---------- */
function promptSeo(items) {
  return `Tu rédiges le référencement Google (balise title et meta description) des pages produits du site de Magnolia Traiteur, traiteur événementiel installé à Villebon-sur-Yvette (Essonne), qui livre 7 j/7 à Paris et dans toute l'Île-de-France (et parfois en province).
Pour CHAQUE produit ci-dessous, écris :
- "titre" : 60 caractères MAXIMUM espaces compris, qui se termine par " | Magnolia Traiteur" (ou " | Magnolia" si la place manque). Commence par le nom du produit (reformulé proprement, sans majuscules criardes), puis un mot-clé de recherche utile si la place le permet (ex. traiteur antillais, buffet, cocktail, plateau, location, animation).
- "description" : entre 120 et 155 caractères espaces compris, phrase naturelle et engageante qui dit ce qu'est le produit, pour quelle occasion, avec si possible le prix TTC indiqué et « livraison en Île-de-France » (ou « 7 j/7 »).
Règles strictes :
- Français impeccable, ton chaleureux et professionnel. Chaque titre et chaque description doivent être UNIQUES.
- N'invente rien : pas d'ingrédient, de quantité, de label (bio, fait maison, frais du jour…) ou de service qui ne figure pas dans les infos. Pas de superlatif trompeur (« le meilleur », « n°1 »), pas de « gratuit », pas d'emoji, pas de guillemets.
- Ne mets JAMAIS « Paris et Île-de-France » (ni « à Paris et en Île-de-France ») dans le titre.
- Ne cite JAMAIS de fournisseur, de restaurant, de partenaire ni de marque autre que Magnolia Traiteur (sauf une marque qui fait partie du nom du produit, ex. un champagne). N'écris jamais « sur devis ».
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour : [{"slug":"…","titre":"…","description":"…"}]

Produits (slug | nom | rubrique | spécialité | prix | infos) :
${items.map(i => [i.slug, i.nom, i.rubrique, i.specialite || '-', i.prix || 'prix non affiché', i.infos || '-'].join(' | ')).join('\n')}`;
}

function infosIa(p, nomsRub = {}, nomsSous = {}) {
  return {
    slug: p.slug || p.id, nom: espaces(p.titre), rubrique: nomsRub[p.rubrique] || p.rubrique || '', specialite: nomsSous[p.sous] || '',
    prix: prixTexte(p).replace(/\.$/, ''),
    infos: couper([p.extrait, ...(Array.isArray(p.description) ? p.description : [])].filter(Boolean).map(espaces).filter((x, i, a) => a.indexOf(x) === i).join(' ').replace(/[^.]*sur devis[^.]*\.?/gi, ''), 400),
  };
}

/* contrôle d'un texte rendu par l'IA : null si à rejeter */
function titreValide(t) {
  t = espaces(t).replace(/^["«»\s]+|["«»\s]+$/g, '');
  if (!t || t.length > T_MAX || t.length < 15 || IDF_TITRE.test(t) || INTERDIT.test(t)) return null;
  if (!/magnolia/i.test(t)) t = titreAvecMarque(t);
  return t.length <= T_MAX ? t : null;
}
function descriptionValide(d) {
  d = espaces(d).replace(/^["«»\s]+|["«»\s]+$/g, '');
  if (d.length > D_MAX) { const c = d.slice(0, D_MAX), i = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! ')); d = i > 80 ? c.slice(0, i + 1) : ''; }
  if (!d || d.length < 70 || INTERDIT.test(d)) return null;
  return d;
}

module.exports = {
  RUB, SOUS, T_MAX, D_MAX, modeleProduit, modeleRubrique, modeleSous, remplir, remplirProduit, remplirRubrique, extraitsCommuns,
  promptSeo, infosIa, titreValide, descriptionValide, prixTexte, nomNet,
};
