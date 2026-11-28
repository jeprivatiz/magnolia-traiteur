'use strict';
/* La brochure Magnolia (Jean-Luc, 2026-11-27) : la brochure papier refaite aux couleurs du site,
   en A4 imprimable, SANS AUCUN PRIX. À la place de chaque prix, un QR code (cliquable dans le PDF)
   qui mène à la page du site : les prix y sont toujours à jour.
   - /brochure : la brochure en page web (format A4, prête à imprimer). ?base=https://… choisit l'adresse des QR codes.
   - /b/:cle : adresse courte des QR codes → la fiche, la spécialité, l'univers ou la page du moment
     (une fiche masquée ou renommée ne casse pas un QR code déjà imprimé).
   - Le PDF (public/brochure/magnolia-traiteur-brochure.pdf) est fabriqué à partir de /brochure par
     scripts/brochure-pdf.js (GitHub › Actions › « Fabriquer la brochure PDF »).
   Photos et titres viennent du catalogue : une fiche masquée disparaît toute seule de la brochure. */
const QR = require('./vendor/qrcode');
const { esc } = require('./util');

const PAGES_SITE = { accueil: '/', lieux: '/lieux', contact: '/contact', 'zone-de-livraison': '/zone-de-livraison', 'comment-commander': '/comment-commander', temoignages: '/temoignages', avis: '/temoignages', 'blog-entreprises': '/blog?type=entreprises', 'blog-maison': '/blog?type=maison', maison: '/maison', boutique: '/boutique', 'ma-selection': '/ma-selection' };

/* adresse réelle d'une clé de QR code */
function cible(c, cle) {
  cle = String(cle || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120);
  if (!cle || cle === 'accueil') return '/';
  if (PAGES_SITE[cle]) return PAGES_SITE[cle];
  if (cle === 'instagram') { const u = String(((c.reglages || {}).instagram) || ''); return /^https:\/\/(www\.)?instagram\.com\//.test(u) ? u : 'https://www.instagram.com/magnoliatraiteur/'; }
  const visible = x => x && x.statut !== 'masque';
  const rubs = c.rubriques.filter(visible);
  const p = c.bySlug.get(cle);
  if (visible(p) && rubs.some(r => r.slug === p.rubrique)) return `/${p.rubrique}/${p.slug}`;
  const r = rubs.find(x => x.slug === cle);
  if (r) return '/' + r.slug;
  for (const ru of rubs) { const s = (ru.sous || []).find(x => x.slug === cle && visible(x)); if (s) return `/${ru.slug}/${s.slug}`; }
  const l = c.lieux.find(x => x.slug === cle && visible(x));
  if (l) return '/lieux/' + l.slug;
  if (p) { /* fiche masquée depuis l'impression : sa spécialité ou son univers */
    const ru = rubs.find(x => x.slug === p.rubrique);
    const s = ru && (ru.sous || []).find(x => x.slug === p.sous && visible(x));
    if (s) return `/${ru.slug}/${s.slug}`;
    if (ru) return '/' + ru.slug;
  }
  return '/boutique?q=' + encodeURIComponent(cle.replace(/-/g, ' '));
}

/* QR code en SVG (modules vert Magnolia, lignes regroupées pour un fichier léger) */
function qrSvg(texte) {
  const q = QR(0, 'M'); q.addData(texte); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) {
    let c0 = -1;
    for (let c = 0; c <= n; c++) {
      const on = c < n && q.isDark(r, c);
      if (on && c0 < 0) c0 = c;
      if (!on && c0 >= 0) { d += `M${c0} ${r}h${c - c0}v1h-${c - c0}z`; c0 = -1; }
    }
  }
  return `<svg class="qr-svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#1d3b2f"/></svg>`;
}

/* texte d'une fiche sans aucun prix (la brochure n'en montre jamais) */
const AVEC_PRIX = /€|\bTTC\b|\bHT\b|sur devis|\beuros?\b/i;
function sansPrix(t) {
  return String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(s => s && !AVEC_PRIX.test(s)).join(' ').trim();
}
function court(t, max = 170) {
  t = sansPrix(t); if (t.length <= max) return t;
  const x = t.slice(0, max); const i = Math.max(x.lastIndexOf('. '), x.lastIndexOf(' · '));
  return (i > max * .55 ? x.slice(0, i + 1) : x.replace(/\s+\S*$/, '') + '…').trim();
}
const photoDe = x => {
  const ph = (x && x.photos) || [];
  const s = ph.map(y => (y && y.src) || y).filter(Boolean);
  return s[0] || '';
};

/* ---------------- contenu ---------------- */
/* chaque page : { t: type, … }. Les fiches sont désignées par leur adresse (slug). */
const FRANCAIS = [
  { slug: 'grand-cocktail-magnolia', tags: ['22 pièces par personne', '16 salées · 6 sucrées', 'Dès 15 personnes'], accroche: 'Un cocktail généreux, une réception qui vous ressemble.',
    chapo: 'Pour vos cocktails déjeunatoires ou dînatoires : des bouchées raffinées, des saveurs variées et une finale sucrée, du premier canapé au dernier petit four.',
    compo: [['Canapés réception gourmands', 'Foie gras, framboise, amande · Fromage ail et fines herbes, crevette marinée · Comté fondu, pastrami · Saint-Jacques, tomate, pesto · Involtini, tomate · Chèvre, ananas · Saumon fumé, citron.'],
      ['Canapés saveurs d’évasion', 'Saumon fumé, tzatziki et concombre sur blini · Coppa, basilic, cake aux olives · Chèvre, figue rôtie, pain aux noix · Foie gras, chutney mangue-abricot, brioche perdue · Thon, piquillos, câpres · Courgette, brebis, pain à la tomate.'],
      ['Canapés saveurs régionales', 'Camembert de Normandie, pomme, pistache · Saumon fumé, crème citronnée, blini de blé noir · Tomate, poivrons marinés, olive, basilic · Crème d’oignon façon Flammekueche, lardon fumé, bretzel.'],
      ['Canapés végétariens', 'Burger coriandre-yuzu, pois gourmand, teriyaki · Sandwich légumes, pain vert aux céréales · Financier tomate, ricotta, mozzarella · Millefeuille brioché de légumes confits.'],
      ['Mini-clubs, wraps & moricettes', 'Clubs saumon fumé-aneth, comté-beurre aux noix, pesto-tomate · Wraps chèvre-légumes du soleil, saumon-ciboulette, poulet-poivrons, pastrami-moutarde · Moricettes tomate-mozzarella, saumon fumé, jambon sec ou coppa.'],
      ['Mini-brochettes & verrines', 'Figue, comté, tomate marinée · Olive Kalamon, mozzarella à la pistache · Serrano, chèvre aux cranberries, ananas · Verrines pesto-parmesan, tartare tomate-thon, guacamole et cocktail de crevettes.'],
      ['6 pièces sucrées', 'Mini macarons (vanille, pistache, café, framboise, citron, chocolat) · Crumble citron, moelleux noisette-praliné, financier citron vert-coco-framboise, chou vanille, amande-poire · Petits fours artistiques et verrines sucrées.']],
    vignettes: ['plateau-de-80-mini-clubs', 'macarons-36-pieces'] },
  { slug: 'cocktail-street-food', tags: ['17 pièces par personne', '12 salées · 5 sucrées', 'Dès 10 personnes'], accroche: 'L’esprit street food, le plaisir de partager.',
    chapo: 'Des incontournables de la street food, des bouchées chaudes et une finale sucrée : partagez un cocktail convivial et généreux.',
    compo: [['Mini-burgers gourmands', 'Pain brioché au sésame, bœuf français, cheddar, sauce ketchup aux oignons et cornichons.'],
      ['Mini croque-monsieur', 'Jambon blanc, emmental et fromage fondant : une bouchée chaude et généreuse.'],
      ['Mini pitas au poulet', 'Poulet cuisiné, légumes, mayonnaise aillée et épices.'],
      ['Mini-clubs en assortiment', 'Saumon fumé et fromage frais · Comté et beurre aux noix · Fromage frais au pesto et tomate séchée.'],
      ['Mini empanadas au bœuf', 'Bœuf, pommes de terre, poivrons, maïs et sauce tomate façon chili.'],
      ['Wraps aux saveurs variées', 'Saumon-concombre · Chorizo et légumes grillés · Chèvre et légumes du soleil · Poulet-poivrons · Pastrami-moutarde.'],
      ['Mini nems croustillants', 'Farce de légumes, viande, poulet ou crevette, dans l’esprit de la tradition vietnamienne.'],
      ['5 pièces sucrées', 'Éclairs vanille, tartelettes cacao-fraise et citron, entremets nougat, fondants au chocolat, moelleux pistache-abricot et coco, croquants chocolat-passion.'],
      ['Ou un grand gâteau d’anniversaire', 'À la place des petits fours : fraisier, framboisier, entremets chocolat ou opéra, de 16 à 40 parts, avec bougies et prénom.']],
    vignettes: ['plateau-de-20-mini-cheeseburgers', 'plateau-de-48-mini-wraps'] },
  { slug: 'petit-cocktail-festif', tags: ['13 pièces salées par personne', 'Dès 10 personnes'], accroche: 'Le plaisir du salé, à vous de choisir le dessert.',
    chapo: 'Un cocktail convivial et gourmand pour recevoir en toute simplicité : un assortiment salé à partager, et vous composez vous-même votre finale sucrée.',
    compo: [['Canapés saveurs régionales', 'Camembert de Normandie, pomme et pistache sur pain au malt · Saumon fumé, crème citronnée sur blini de blé noir · Tomate, poivrons marinés et basilic sur ciabatta · Flammekueche sur bretzel · Poivron au piment d’Espelette et noix de jambon.'],
      ['Canapés végétariens', 'Mini-burger coriandre-yuzu · Sandwich aux légumes · Cake oignon, mascarpone-framboise · Financier tomate-ricotta · Blini, crème de poivron épicée · Cake épinard, mascarpone, pois gourmand.'],
      ['Mini-clubs en assortiment', 'Saumon fumé et aneth · Comté et beurre aux noix · Fromage frais au pesto et tomate.'],
      ['Mini-wraps', 'Chèvre et légumes du soleil · Saumon fumé-ciboulette · Poulet-poivrons · Pastrami et moutarde à l’ancienne.'],
      ['Mille-feuilles de légumes confits', 'De fines couches de légumes confits : une bouchée végétarienne savoureuse et colorée.'],
      ['Krokini caprese', 'Pain de mie grillé, tomate fraîche et confite, mozzarella : une bouchée aux accents italiens.'],
      ['À vous de choisir le dessert', 'Formule entièrement salée : prévoyez votre dessert ou votre gâteau d’anniversaire, ou complétez avec nos plateaux de charcuteries et de fromages.'],
      ['Une réception facile à organiser', 'Plateaux livrés en boîtes traiteur, dans des sacs isothermes : il ne reste qu’à les disposer. Personnel de service et pack traiteur en option.']],
    vignettes: ['plateau-de-80-mini-clubs', 'plateau-de-48-mini-wraps'] },
  { slug: 'cocktail-corporate-magnolia', tags: ['15 pièces par personne', '12 salées · 3 sucrées'], accroche: 'L’équilibre du salé et du sucré, pour des instants à partager.',
    chapo: 'Des bouchées variées pour ouvrir l’appétit, des mini-pièces à partager et une touche sucrée pour terminer : réunissez vos invités autour d’un cocktail convivial.',
    compo: [['Canapés saveurs gourmets', 'Foie de canard, framboise et amande · Crevette et fromage aux herbes · Comté et pastrami · Saint-Jacques au pesto · Saumon citronné.'],
      ['Canapés saveurs d’évasion', 'Saumon, tzatziki et concombre · Coppa et basilic · Chèvre et figue · Foie gras et chutney mangue-abricot · Thon, piquillos et câpres.'],
      ['Canapés végétariens', 'Légumes, ricotta, mozzarella, poivrons, épinards et pois gourmands : un assortiment coloré pour varier les plaisirs.'],
      ['Mini-clubs & mini-wraps', 'Clubs au saumon, au comté ou au pesto · Wraps chèvre-légumes, saumon-ciboulette, poulet-poivrons ou pastrami-moutarde.'],
      ['Mini-brochettes', 'Comté et figue · Mozzarella à la pistache · Serrano, chèvre et ananas · Tomate confite et mozzarella.'],
      ['3 pièces sucrées', 'Macarons, douceurs pâtissières et petits fours : citron, chocolat, vanille, praliné, fruits et autres parfums gourmands.'],
      ['Composez votre réception', 'Complétez avec des plateaux à partager ou une animation culinaire. Pack traiteur et personnel de service en option.']],
    vignettes: ['plateau-de-80-mini-clubs', 'petits-fours-sucres'] },
  { slug: 'cocktail-premium-magnolia', tags: ['22 pièces par personne', '16 salées · 6 sucrées', 'Dès 10 personnes'], accroche: 'Des bouchées raffinées, pour une réception d’exception.',
    chapo: 'Un assortiment sélectionné pour vous : canapés raffinés, mini-pièces froides et chaudes, et une grande finale chocolatée.',
    compo: [['Canapés saveurs d’évasion', 'Saumon fumé, tzatziki, pavot et blini · Coppa, basilic et cake aux olives · Chèvre et figue rôtie · Foie gras, chutney mangue-abricot et brioche perdue · Délice de saumon et œufs de truite · Crevette paprika sur pain aux graines.'],
      ['Canapés végétariens', 'Burger coriandre-yuzu, teriyaki et sésame · Sandwich légumes au pain vert · Financier tomate, ricotta, mozzarella · Millefeuille de légumes confits.'],
      ['Mini-clubs, wraps & brochettes', 'Clubs saumon, comté, chèvre-pesto, poulet rôti-moutarde · Wraps chèvre-légumes, saumon-ciboulette, poulet-poivrons, pastrami · Brochettes tomate confite et mozzarella.'],
      ['Mini-pièces chaudes', 'Mini-pita au poulet épicé · Mini-croque-monsieur, crème de champignons et truffe noire · Mini-black burger au bœuf Charolais et cheddar.'],
      ['6 pièces sucrées', 'Macarons vanille, pistache, café, chocolat, framboise, citron · Douceurs pâtissières · Élégance et chocolat : tartelette chocolat-café, brownie, mini-éclair, entremets praliné-gianduja · Mini-cœurs fondants au chocolat.']],
    vignettes: ['/site/c/chef-dressage-assiette.webp', 'macarons-36-pieces'] },
  { slug: 'buffet-des-traditions', tags: ['3 salades au choix', 'Charcuteries & fromages', '5 pièces sucrées'], accroche: 'Le goût des traditions, le plaisir de recevoir.',
    chapo: 'De l’entrée au dessert, retrouvez les saveurs des grandes tablées : un buffet généreux et convivial, à partager avec vos invités.',
    compo: [['3 salades au choix', 'Taboulé au poulet rôti · Salade grecque, feta et olives Kalamata · Mini-penne à l’italienne · Salade niçoise au thon · Piémontaise · Pommes de terre au thon · Tagliatelles aux deux saumons. Servies en saladiers avec leurs couverts.'],
      ['Cakes salés & terrine de saumon', 'Cake chèvre-courgette · Cake au poulet et au curry · Terrine de saumon et de saumon fumé, en tranches sur planchas en grès noir.'],
      ['Plateaux de charcuteries', 'Jambon à l’ancienne Label Rouge, jambon cru de Parme, pavé au poivre, rôti de porc, mousse de canard au porto, coppa Label Rouge, rôti de bœuf, avec condiments et baguette artisanale.'],
      ['Plateaux de fromages', 'Comté 20 mois AOP, Saint-Nectaire fermier AOP, Roquefort AOP, Brie de Meaux, Selles-sur-Cher AOP, servis avec du pain frais.'],
      ['5 pièces sucrées', 'Mini macarons et petits fours : éclairs vanille, tartelettes cacao-fraise et citron, fondants au chocolat · Douceurs pâtissières et verrines à la mousse de fruits.']],
    vignettes: ['plateau-de-charcuteries', 'plateau-de-fromages'] },
  { slug: 'petit-cocktail-aperitif', tags: ['7 pièces par personne', '5 salées · 2 sucrées'], accroche: 'La convivialité, dès les premières bouchées.',
    chapo: 'Un assortiment salé et sucré pour ouvrir la réception : canapés, mini-clubs, wraps et petites douceurs à savourer ensemble.',
    compo: [['Canapés saveurs régionales', 'Camembert de Normandie et pomme sur pain au malt · Saumon fumé et crème citronnée sur blini · Tomate, poivrons marinés et basilic · Flammekueche sur bretzel · Poivron au piment d’Espelette.'],
      ['Canapés végétariens', 'Mini-burger coriandre-yuzu · Sandwich aux légumes · Cake oignon, mascarpone-framboise · Financier tomate-ricotta · Blini à la crème de poivron.'],
      ['Mini-clubs & wraps', 'Clubs saumon fumé-aneth, comté-beurre aux noix, pesto-tomate · Wraps chèvre-légumes, saumon-ciboulette, poulet-poivrons, pastrami-moutarde.'],
      ['Mini-brochettes', 'Tomate confite et mozzarella : une bouchée fraîche pour compléter l’apéritif.'],
      ['2 pièces sucrées', 'Crumble citron · Moelleux noisette-praliné · Financier citron vert, coco et framboise · Chou vanille · Amande-poire · Biscuit vanille-mangue.'],
      ['À compléter selon vos envies', 'Une formule légère pour commencer la réception : ajoutez des amuse-bouches ou des plateaux de charcuteries et de fromages.']],
    vignettes: ['plateau-de-48-mini-wraps', 'petits-fours-sucres'] },
];

const MONDE = [
  { sous: 'buffet-antillais', titre: 'Buffet antillais', tags: ['Entrée · plat · dessert', 'Dès 10 personnes'], accroche: 'Les saveurs des Antilles, dans une ambiance chaleureuse.',
    chapo: 'Colombo de poulet parfumé, spécialités créoles et buffet généreux : partagez les saveurs des Antilles. Plusieurs formules : entrées seules, plat seul, entrée et plat, ou entrée, plat et dessert.',
    compo: [['Entrées · spécialités des Antilles', '4 pièces maison par personne : accras de morue, boudins créoles, samoussas aux légumes ou au poulet. Livrées avec piment et sauces.'],
      ['Plats · 2 choix maximum', 'Colombo de poulet · Colombo de porc · Curry d’agneau · Fricassée de chatrou · Coq roussi · Cuisse de poulet grillée ou boucanée · Rougail saucisse · Dombrés aux crevettes.'],
      ['Accompagnements · 2 choix maximum', 'Riz nature · Riz aux légumes · Gratin de bananes plantains · Gratin de christophines · Gratin de patates douces et giraumon · Gratin d’igname · Haricots rouges · Mini-brochette de banane.'],
      ['Desserts · 2 choix maximum', 'Salade de fruits exotiques · Flan coco · Gâteau roulé au coco · Sorbet coco maison · Blanc-manger coco · Gâteau à l’ananas.'],
      ['Aussi à l’unité', 'Accras, boudins, bokits, pâtés, crabe farci, coffret « Saveurs pays » : toutes nos spécialités antillaises se commandent aussi à la pièce.'],
      ['Personnel & pack traiteur', 'Le personnel de service et le pack traiteur sont à prévoir en option.']],
    vignettes: ['colombo-de-poulet-antillais', 'boudin-antillais-80-gr'] },
  { sous: 'paella-party', titre: 'Paëlla party', tags: ['400 g par personne', 'Livrée chaude'], accroche: 'Une paëlla dans les règles de l’art.',
    chapo: 'Le secret de notre recette ? L’équilibre entre le riz safrané, les épices, le poulet et les fruits de mer, relevé par notre touche maison. Anniversaire, repas entre amis ou événement d’entreprise : rassemblez vos invités autour d’une paëlla généreuse et colorée.',
    compo: [['Une recette généreuse', 'Oignons et petits pois · Poivrons rouges et verts · Poulet · Moules décortiquées · Calamars · Crevettes du Pacifique · Grosses moules de Nouvelle-Zélande · Chorizo · Riz safrané et mélange d’épices maison.'],
      ['Royale ou de la mer', 'Choisissez la paëlla royale ou la paëlla de la mer, selon vos envies.'],
      ['Livrée chaude', 'Nous livrons au jour et à l’heure convenus, sur Paris et toute l’Île-de-France.'],
      ['Dès 40 personnes : le service « zéro stress »', 'Chafing dishes professionnels et gels chauffants mis gracieusement à votre disposition. Notre livreur installe le matériel et lance le réchauffage ; nous reprenons tout le lendemain.'],
      ['Bon à savoir', 'L’installation du buffet est incluse dans le pack traiteur. Le personnel de service reste à prévoir en option.']],
    vignettes: ['paella-royale', 'paella-de-la-mer'] },
  { sous: 'couscous-party', titre: 'Couscous party', tags: ['Royal ou végétarien', 'Dès 10 personnes'], accroche: 'Le goût du partage, la chaleur du Maghreb.',
    chapo: 'Semoule légère, légumes fondants, bouillon parfumé : notre couscous royal rassemble toutes les générations autour d’un plat généreux, préparé le jour de votre événement.',
    compo: [['Trois viandes', 'Brochette de poulet · Boulette de bœuf · Merguez.'],
      ['Légumes & semoule', 'Poivron, navet, fenouil, courgette, carotte, pois chiches et semoule de grain moyen, légère et bien détachée.'],
      ['Une préparation traditionnelle', 'Des produits frais et des légumes qui mijotent dans un bouillon parfumé aux épices orientales, préparés le jour même.'],
      ['Livraison, réchauffage & installation', 'Livré à température puis réchauffé sur place. Dès 40 personnes : mise en place du buffet, prêt des chafing dishes et reprise du matériel.'],
      ['En option · pâtisseries orientales', 'Miel, amandes, pistaches et fleur d’oranger pour finir en douceur.']],
    vignettes: ['couscous-royal', 'couscous-vegetarien'] },
  { sous: 'buffet-libanais', titre: 'Buffet libanais', tags: ['8 mezzés au choix', 'Formules avec plat et dessert'], accroche: 'Le Liban à partager, tout simplement.',
    chapo: 'Herbes fraîches, textures fondantes et bouchées dorées : composez votre assortiment de mezzés et offrez à vos invités un voyage gourmand aux accents du Liban.',
    compo: [['Mezzés froids', 'Houmous · Feuilles de vigne · Salade de boulgour · Fattouche · Roulade de feta · Roulade de zaatar · Moutabal · Taboulé · Caviar d’aubergine · Roulade de soujouk.'],
      ['Mezzés chauds', 'Kebbé végétarien · Kebbé à la viande · Fatayer aux épinards · Sanbousek · Falafel · Manakish zaatar · Fatayer au fromage · Rikakat au fromage.'],
      ['Plats', 'Chich taouk · Shawarma de poulet · Kefta · Aubergine fondante · Daoud bacha, et leurs versions vegan.'],
      ['Desserts', 'Baklawa · Mohallabieh · Meghli · Halawet el jibn · Osmaliyeh.'],
      ['Pack traiteur & personnel en option', 'Installation du buffet avec tables, nappages et décoration, service à l’assiette, mise en place des desserts et rangement.']],
    vignettes: ['houmous-libanais', 'falafel-libanais'] },
  { sous: 'buffet-chinois', titre: 'Buffet chinois', tags: ['6 pièces apéritives', 'Plat + accompagnement', 'Dès 10 personnes'], accroche: 'Une escapade gourmande aux saveurs de Chine.',
    chapo: 'Bouchées vapeur délicates, nems croustillants et plats généreux : offrez à vos invités un buffet varié, haut en saveurs et en convivialité.',
    compo: [['Entrées apéritives · 6 pièces par personne', 'Bouchées vapeur aux crevettes · Nems au poulet · Nems aux crevettes · Samoussas au bœuf et curry · Hacao aux crevettes.'],
      ['Plats · 2 choix maximum', 'Poulet à la citronnelle · Canard laqué · Porc au caramel · Crevettes à l’ail · Porc aigre-doux · Boulettes de poulet piquantes et sucrées.'],
      ['Accompagnements', 'Riz cantonais · Nouilles sautées aux légumes · Riz sauté aux légumes.'],
      ['Et toute notre carte', 'Potages, raviolis, plats et desserts : plus de cent spécialités chinoises se commandent aussi à l’unité.'],
      ['Livraison ou pack traiteur', 'Livré en barquettes isothermes avec conseils de réchauffage, ou présenté sur buffet avec chauffe-plats en inox. Personnel de service en option.']],
    vignettes: ['canard-laque-chinois', 'nems-au-poulet-chinois'] },
  { sous: 'buffet-italien', titre: 'Buffet italien', tags: ['Entrée · plat · dessert', 'Dès 10 personnes'], accroche: 'La dolce vita à votre table.',
    chapo: 'Tomates parfumées, mozzarella di bufala, charcuteries généreuses et fromages italiens : offrez à vos invités un buffet ensoleillé, gourmand et convivial.',
    compo: [['Entrées', 'Tomates confites aux herbes · Brochettes de mozzarella di bufala et petites tomates · Cake jambon-olives · Gressins à l’huile d’olive · Olives noires et vertes.'],
      ['Grand plateau de charcuterie', 'Jambon Label Rouge, jambon de Parme, pavé au poivre, rôti de porc, mousse de canard au porto, coppa, rôti de bœuf et Spianata, avec pain baguette et tradition.'],
      ['Une salade au choix', 'Mini-pennes à l’italienne (tomates, mozzarella, basilic, olives) ou La Belle Toscane (conchiglie, poulet rôti, tomates cerises, fromage italien).'],
      ['Plateau de fromages', 'Taleggio · Provolone · Gorgonzola.'],
      ['En option', 'Lasagnes à la bolognaise au bœuf charolais et Parmigiano Reggiano, et nos desserts.']],
    vignettes: ['/site/c/italien22-produits/mini-pennes.webp.webp', '/site/c/italien22-produits/buffet-menu.webp.webp'] },
  { sous: 'buffet-indien', titre: 'Buffet indien', tags: ['Entrée · plat · dessert', 'Dès 10 personnes'], accroche: 'L’Inde, une invitation au partage.',
    chapo: 'Épices parfumées, currys onctueux et recettes généreuses : offrez à vos invités une escale haute en couleur, avec des options végétariennes.',
    compo: [['Entrées au choix', 'Samossas au poulet ou aux légumes · Oignon bhajia · Begnan pakora · Mix pakora · Chicken tandoori · Agneau tikka · Chicken tikka salade · Prawn salade · Kinkiri.'],
      ['Plats faits maison · 2 choix maximum', 'Chicken tikka massala · Chicken shahi korma · Fish tikka malai · Prawn madras · Agneau shahi korma · Agneau madras · Crevettes massala.'],
      ['Accompagnements', 'Riz au safran · Riz kashmiri · Naans en option.'],
      ['Desserts · les douceurs des Indes', 'Gulab jamun · Malaï, flan indien à la rose · Lassi aux différents parfums.'],
      ['Toute la carte', 'Tandooris, biryanis, currys, naans… plus de quatre-vingts spécialités indiennes se commandent aussi à l’unité.']],
    vignettes: ['butter-chicken-indien', 'naan-indien'] },
  { sous: 'buffet-africain', titre: 'Buffet africain', tags: ['Entrée + plat ou plat + dessert', 'Dès 10 personnes'], accroche: 'Un voyage gourmand à partager.',
    chapo: 'Un plaisir pour les papilles, une invitation à voyager : épices et savoir-faire révèlent toute la richesse des saveurs africaines.',
    compo: [['Entrées · 2 choix', 'Accras de morue · Samoussas aux légumes ou à la viande · Pastels au poisson · Nems · Avocat aux crevettes · Salade piémontaise · Salade composée · Plateaux de charcuterie, de crevettes ou de saumon fumé.'],
      ['Plats mijotés · 2 choix maximum', 'Thiebou dien · Yassa · Mafé · Kédjénou · Saka saka · Ndolé · Tripes à la tomate · Pépé soupe · Mijoté de poulet aux bananes plantains.'],
      ['Ou grillades', 'Brochette de bœuf aux épices · Tilapia braisé · Poulet fermier braisé · Poisson capitaine frit.'],
      ['Accompagnements · 2 choix', 'Riz blanc · Alloco · Attiéké · Banane plantain ou igname vapeur · Foutou · Placali · Ablo · Bobolo · Chikwangue · Semoule.'],
      ['Desserts · 2 choix', 'Salade de fruits frais · Pyramide de fruits · Tarte tatin · Gâteau coco · Dégué · Plateaux de mangues ou d’ananas.']],
    vignettes: ['poulet-yassa-300-g', 'alloco-300g-pers'] },
  { sous: 'specialites-japonaises', titre: 'Spécialités japonaises', tags: ['Plateaux prêts à présenter', 'Baguettes, sauces et wasabi offerts'], accroche: 'L’élégance du Japon à partager.',
    chapo: 'Sushis, makis et bouchées délicates : nous livrons de très beaux plateaux, prêts à poser sur votre table ou votre buffet, pour un repas ou un cocktail convivial.',
    fiches: ['plateau-japonais-75-pieces', 'plateau-japonais-38-pieces', 'plateau-de-luxe-42-pieces', 'plateau-japonais-36-pieces', 'plateau-californias-et-makis-40-pieces', 'plateau-sushi-tout-cuit-20-pieces', 'chef-sushi-a-domicile'],
    vignettes: ['plateau-japonais-75-pieces', 'chef-sushi-a-domicile'] },
];

const REPAS = { slug: 'repas-servi-a-table-elabore-par-le-chef', tags: ['Menu composé avec le chef', 'Dès 20 personnes'], accroche: 'Un vrai repas de chef, servi à l’assiette.',
  chapo: 'Un repas servi à table, composé avec le chef selon vos envies et les produits de saison : cuisine de marché, avec autant que possible des produits d’Île-de-France. Le menu se construit lors d’un échange entre vous, le chef et votre conseiller.',
  compo: [['Entrées', 'Deux ou trois entrées différentes au maximum par réception, définies avec le chef.'],
    ['Plat de résistance', 'Un ou deux plats au maximum, définis avec le chef, pour un service simultané de tous les convives.'],
    ['Plateau de fromages AOP', 'Brie de Meaux, Comté affiné, Saint-Nectaire, Fourme d’Ambert, Crottin de Chavignol, avec raisin frais, baguettes et petits pains variés : une assiette par table.'],
    ['Dessert', 'Un ou deux desserts différents au maximum, définis avec le chef pâtissier.'],
    ['Boissons', 'Softs à discrétion (eaux plates et gazeuses, Coca-Cola, Coca-Cola Zéro), café et thé en fin de repas.'],
    ['Compris dans la prestation', 'Le chef, les nappages, les assiettes, les couverts, les serviettes et la verrerie. Personnel de service en option.']],
  vignettes: ['souris-d-agneau-confite', 'plateau-de-fromages'] };

const GRILLES = {
  entrees: { eyebrow: 'La carte Magnolia', titre: 'Nos entrées', intro: 'Ouvrez votre repas avec nos entrées fraîches et gourmandes. Entre terre et mer, des saveurs délicates pour régaler vos invités dès la première bouchée. 5 portions minimum du même choix, commande 72 h à l’avance.',
    cle: 'carte-magnolia', items: ['carpaccio-de-tomates', 'tartare-de-noix-de-saint-jacques', 'tartare-de-saumon', 'carpaccio-de-boeuf', 'carpaccio-de-thon', 'foie-gras-et-douceur-de-figues', 'salade-de-jeunes-pousses-aux-gambas', 'le-trio-affine', 'menu-enfant-3-a-12-ans'] },
  desserts: { eyebrow: 'La carte Magnolia', titre: 'Nos desserts', bandeauPhoto: '/site/c/desserts-bandeau.webp', intro: 'Six desserts qui peuvent varier selon la saison, l’humeur du chef et surtout vos désirs. 5 portions minimum du même choix.',
    cle: 'carte-magnolia', items: ['paris-brest-praline', 'millefeuille-a-la-creme', 'opera-chocolat-cafe', 'entremets-chocolat-praline', 'douceur-vanille-passion', 'entremets-poire-caramel'] },
  coffrets: { eyebrow: 'Coffrets & plateaux', titre: 'Nos coffrets gourmands', intro: 'Faites voyager vos invités avec nos coffrets aux saveurs du monde, pour 8 à 10 personnes. À partager, ils sont le complément idéal de vos apéritifs et de vos buffets.',
    cle: 'coffrets-plateaux', items: ['le-coffret-antillais-saveurs-pays', 'coffret-italien-mamma-mia', 'coffret-libanais-du-chef-leon', 'coffret-chinois-aux-neuf-saveurs', 'coffret-crudites-bio-du-jardin', 'coffret-fromages-de-nos-regions', 'coffret-fruits-frais'] },
  plateaux: { eyebrow: 'Coffrets & plateaux', titre: 'Nos plateaux à partager', intro: 'Des plateaux généreux pour réunir vos invités autour de bouchées gourmandes : à l’apéritif, en cocktail ou au buffet, ils donnent à chaque réception le goût de la convivialité.',
    cle: 'coffrets-plateaux', items: ['plateau-de-20-mini-cheeseburgers', 'plateau-de-48-mini-wraps', 'plateau-de-80-mini-clubs', 'plateau-de-20-mini-bokits', 'plateau-de-charcuteries', 'plateau-de-fromages', 'plateau-japonais-75-pieces'] },
  boissons: { eyebrow: 'Les boissons de votre réception', titre: 'La cave de Magnolia', intro: 'Du vin au soft, en passant par les alcools : notre champagne de petit récoltant, une sélection de vins, nos open bars et nos barmans pour servir vos invités.',
    cle: 'boissons', cols: 3, items: ['champagne-andre-diligent', 'open-bar-vins-et-champagnes', 'nos-open-bars', 'bar-a-cocktails-4-h-au-cocktail', 'bar-a-shots-a-volonte-1-h-30', 'sangria-maison-au-litre', 'chateau-minuty-prestige-rose', 'jean-des-valanges-chardonnay-blanc', 'livraison-de-glacons-sac-de-20-kg'] },
  petitsDej: { eyebrow: 'Pour bien commencer la journée', titre: 'Nos petits-déjeuners', intro: 'Réunions matinales, séminaires ou accueil de vos invités : partagez un moment convivial autour d’un buffet gourmand. Dès 20 personnes.',
    cle: 'petits-dejeuners', cols: 3, bandeau: true, items: ['pause-cafe', 'petit-dejeuner-classique', 'petit-dejeuner-luxe'] },
  salees1: { eyebrow: 'Animations culinaires', titre: 'Nos animations salées', intro: 'Du spectacle, des saveurs et de la convivialité : nos animations culinaires éveillent les papilles et réunissent vos invités autour d’un moment gourmand.',
    cle: 'animations-salees', cols: 2, items: ['bar-a-saumon-fume', 'bar-a-foie-gras', 'bar-a-huitres', 'saint-jacques-a-la-plancha', 'animation-ti-punch-acras-et-boudins', 'animation-barbecue'] },
  salees2: { eyebrow: 'Animations culinaires', titre: 'Le spectacle en cuisine', intro: 'Burgers, pâtes, pizzas ou sushis préparés sous les yeux de vos invités : une animation qui fait toujours son effet.',
    cle: 'animations-salees', cols: 2, items: ['stand-a-burgers', 'bar-a-pates', 'bar-a-burrata', 'animation-pates-a-la-meule-de-parmesan', 'pizzaiolo-a-domicile', 'chef-sushi-a-domicile'] },
  sucrees: { eyebrow: 'Animations gourmandes', titre: 'Nos animations sucrées', intro: 'Des animations gourmandes pour petits et grands : offrez à vos invités une pause conviviale, festive et pleine de douceur.',
    cle: 'douceurs', items: ['crepes-a-volonte', 'animation-de-gaufre', 'brioche-perdue', 'animation-barbe-a-papa-a-volonte', 'animation-pop-corn', 'animation-fontaine-a-chocolat', 'animation-sorbet-coco-a-l-antillaise', 'stand-de-churros', 'candy-bar-a-la-location'] },
  corbeilles: { eyebrow: 'Desserts & pâtisseries', titre: 'Corbeilles de fruits & pâtisseries', intro: 'Des compositions fraîches et généreuses à offrir ou à partager, et des petites pâtisseries pour toutes les envies sucrées.',
    cle: 'douceurs', items: ['corbeille-fruits-de-saison', 'corbeille-exotique', 'corbeille-gourmande', 'corbeille-prestige', 'corbeille-love', 'plateau-de-fruits-secs', 'petits-fours-sucres', 'macarons-36-pieces', 'macarons-72-pieces'] },
  gateaux: { eyebrow: 'Desserts & pâtisseries', titre: 'Nos gâteaux & pièces montées', intro: 'Des gâteaux à partager pour vos moments de fête, et des créations spectaculaires pour les grands événements de la vie.',
    cle: 'douceurs', items: ['fraisier-32-parts', 'framboisine-32-parts', 'gateau-chocolat-32-parts', 'tarte-duo-chocolat-10-parts', 'craqueline-16-parts', 'croquant-caramel-16-parts', 'piece-montee-romantica', 'piece-montee-bella-rosa', 'croquembouche-50-parts-200-choux'] },
  indisp1: { eyebrow: 'Notre service location', titre: 'Les indispensables', intro: 'Packs traiteur, vaisselle, tireuse à bière, photo booth et mobilier : tout ce qu’il faut pour une réception réussie, livré et repris par nos équipes.',
    cle: 'indispensables', items: ['petit-pack-traiteur-eco-responsable', 'grand-pack-traiteur-vaisselle-en-dur', 'vaisselle-complete', 'notre-tireuse-a-bieres', 'notre-photo-booth', 'tente-de-reception-4-4-m', 'tables-rectangulaires-2-m-0-60-m', 'nappage-170-250-cm', 'mange-debout'] },
  indisp2: { eyebrow: 'Notre service location', titre: 'Mobilier, verrerie & matériel', intro: 'Des équipements pour composer votre réception dans les moindres détails.',
    cle: 'mobilier-a-la-location', items: ['chaise-pliante-de-luxe-en-velours-bordeaux', 'verres-a-vin', 'flutes-a-champagne', 'verres-tumbler', 'set-de-vaisselle-dessert-par-personne', 'decoration', 'materiel-traiteur', 'chauffeur-prive-berlines-et-vans', 'livre-d-or-audio-telephone-a-messages'] },
  personnel: { eyebrow: 'Nos équipes à votre service', titre: 'Le personnel de votre réception', intro: 'Des professionnels à vos côtés, du premier accueil au dernier service. Minimum 4 heures par personne, heures supplémentaires au même tarif horaire.',
    cle: 'personnel', items: ['personnel-de-service-polyvalent', 'maitre-d-hotel', 'barman', 'grilladin', 'pizzaiolo-personnel', 'regisseur', 'animateur-trice-animations-sucrees-et-salees', 'vigile'] },
  son: { eyebrow: 'Son, lumière & images', titre: 'Donnez le ton de votre événement', intro: 'DJ professionnel, jeux de lumière, sonorisation, écrans : une ambiance sur mesure, installée et réglée par nos équipes.',
    cle: 'musique-animations', items: ['dj-forfait-4-heures', 'dj-forfait-7-heures', 'jeux-de-lumiere', 'ambiance-lumiere-et-sonorisation', 'ecran-led', 'ecran-videoprojecteur', 'videoprojecteur-xgimi', 'enceinte-bose-s1-pro', 'enceinte-bose-l1-pro'] },
  live: { eyebrow: 'Nos animations musicales', titre: 'La musique en live', intro: 'Saxophone, piano, voix, jazz ou grande formation : la musique live donne le ton à votre événement.',
    cle: 'musique-animations', items: ['formule-live-band', 'saxophoniste-2-heures', 'pianiste', 'chanteurs-et-chanteuses', 'duo-guitare-voix-2-45-min', 'duo-flaming-soul', 'jazz-soliste', 'jazz-trio', 'jazz-quatuor'] },
  surprendre: { eyebrow: 'Nos artistes & intervenants', titre: 'L’art de surprendre', intro: 'Magie, mentalisme, caricature ou show : des artistes qui créent la surprise et font parler de votre soirée longtemps après.',
    cle: 'musique-animations', items: ['animation-drag-queen', 'magicien-1-h-30', 'faux-serveur', 'mentaliste-2-30-min', 'caricaturiste-1-h-30', 'ventriloque-2-30-min', 'contorsionniste-2-4-min', 'diseuse-de-bonne-aventure-1-heure', 'hermine-animatrice-pour-les-enfants-de-3-a-8-ans'] },
  jeux: { eyebrow: 'Jeux & animations', titre: 'Faites jouer vos invités', intro: 'Casino, blind test, karaoké, jeux géants ou borne photo : des animations qui rassemblent tous les âges.',
    cle: 'musique-animations', items: ['casino', 'blind-test', 'karaoke', 'escape-game', 'videobooth-a-360', 'puissance-4-geant', 'taureau-mecanique', 'baby-foot-bonzini-b90', 'animations-pour-enfants'] },
};

/* ---------------- rendu ---------------- */
function html(c, opts = {}) {
  const R = c.reglages || {};
  const base = String(opts.base || '').replace(/\/+$/, '');
  const lien = cle => `${base}/b/${cle}`;
  const vis = x => x && x.statut !== 'masque';
  const P = slug => { const p = c.bySlug.get(slug); return vis(p) && c.rubriques.some(r => r.slug === p.rubrique && vis(r)) ? p : null; };
  const rub = slug => c.rubriques.find(r => r.slug === slug && vis(r));
  const sous = slug => { for (const r of c.rubriques) { const s = (r.sous || []).find(x => x.slug === slug && vis(x)); if (s) return s; } return null; };
  const photo = (x, alt = '', cls = '') => x ? `<img src="${esc(x)}" alt="${esc(alt)}"${cls ? ` class="${cls}"` : ''}>` : '<div class="noimg"></div>';
  const vignette = v => v.startsWith('/') ? v : photoDe(P(v));
  const tel = R.telephone || '07 63 66 98 92', telHref = 'tel:' + tel.replace(/\s/g, '');
  const site = (R.entreprise && R.entreprise.siteInternet) || 'magnoliatraiteur.fr';
  const siteTxt = String(site).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const qr = (cle, taille = 'm', legende = 'Voir le prix') => `<a class="qr qr-${taille}" href="${esc(lien(cle))}">${qrSvg(lien(cle))}${legende ? `<span>${esc(legende)}</span>` : ''}</a>`;

  const pages = []; /* [{ id, html(n) }] */
  const dejaVues = new Set();
  const sommaire = [];
  const ajoute = (fn, titreSommaire, niveau = 2) => { const n = pages.length + 1; pages.push(fn); if (titreSommaire) sommaire.push({ n, t: titreSommaire, niveau }); return n; };
  const pied = n => `<footer class="pg-f"><span>Magnolia Traiteur · <a href="${esc(telHref)}">${esc(tel)}</a> · <a href="${esc(lien('accueil'))}">${esc(siteTxt)}</a></span><b>${n}</b></footer>`;

  /* 1. couverture */
  const chiffres = (R.accueil && R.accueil.chiffres) || [];
  const note = (R.avisGoogle && R.avisGoogle.note) || '4,9';
  ajoute(n => `<section class="pg couv" id="p${n}">${photo('/site/c/accueil/website-home-cocktail-20261110.webp', 'Cocktail Magnolia Traiteur', 'couv-img')}
<div class="couv-voile"></div>
<div class="couv-h"><img class="couv-mono" src="/brand/monogramme.svg" alt=""><p class="couv-marque">MAGNOLIA TRAITEUR<small>Traiteur · Événementiel</small></p></div>
<div class="couv-b"><p class="eyebrow or">La brochure ${new Date().getFullYear()}</p>
<h1>Vos événements privés<br>et professionnels</h1>
<p class="couv-sous">Plus de 200 idées pour recevoir : traiteur français, saveurs du monde, animations salées et sucrées, boissons, personnel, location, musique et lieux de réception.</p>
<ul class="couv-chiffres"><li><b>${esc(note)}/5</b><span>sur Google, ${esc((R.avisGoogle && R.avisGoogle.nombre) || 'plus de 650')} avis</span></li><li><b>800</b><span>prestations par an</span></li><li><b>7 j/7</b><span>livraison sur Paris et toute l’Île-de-France</span></li></ul>
<div class="couv-qr">${qr('accueil', 'l', '')}<p><b>Tous nos prix sont en ligne</b>Scannez ou cliquez les QR codes de cette brochure : ils ouvrent la page du site, avec les photos, le prix à jour et la commande.<a href="${esc(telHref)}">${esc(tel)}</a></p></div></div></section>`);

  /* 2. édito + équipe + mode d'emploi */
  const equipe = (R.equipe || []).filter(e => e && e.photo).slice(0, 2);
  ajoute(n => `<section class="pg edito" id="p${n}"><div class="pg-in">
<p class="eyebrow">Magnolia Traiteur</p><h2>Votre événement, de A à Z.</h2>
<p class="lead">Le goût de recevoir, l’art de vous réunir. Anniversaire, mariage, fête de famille, séminaire, salon ou soirée d’entreprise : depuis Villebon-sur-Yvette, nous imaginons, cuisinons, livrons et servons vos réceptions, avec une seule demande et un seul interlocuteur du début à la fin.</p>
<div class="edito-eq">${equipe.map(e => `<figure>${photo(e.photo, e.nom)}<figcaption><b>${esc(e.nom)}</b>${esc(e.role || '')}</figcaption></figure>`).join('')}
<div class="edito-mot"><p>« Nous mettons tout notre savoir-faire au service de votre réception : des saveurs généreuses, des idées pour surprendre vos invités, et une équipe qui s’occupe de tout pour que vous profitiez pleinement de votre événement. »</p><p class="sig">L’équipe Magnolia</p></div></div>
<h3 class="titre-or">Comment utiliser cette brochure</h3>
<ol class="etapes"><li><b>1</b><span><strong>Choisissez</strong>Feuilletez nos univers : cocktails, buffets du monde, animations, boissons, personnel, location et lieux.</span></li>
<li><b>2</b><span><strong>Scannez ou cliquez</strong>Chaque QR code ouvre la bonne page du site : photos, composition, prix toujours à jour et minimum de commande.</span></li>
<li><b>3</b><span><strong>Composez</strong>Ajoutez vos coups de cœur à votre sélection, en ligne, en quelques clics.</span></li>
<li><b>4</b><span><strong>Recevez votre devis</strong>Nous vous répondons très vite avec un devis complet, à signer en ligne.</span></li></ol>
<ul class="chiffres">${(chiffres.length ? chiffres : [{ valeur: note + '/5', label: 'Sur Google' }, { valeur: '800', label: 'prestations par an' }]).slice(0, 4).map(x => `<li><b>${esc(x.valeur)}</b><span>${esc(x.label)}</span></li>`).join('')}</ul>
</div>${pied(n)}</section>`);

  /* 3. sommaire (rempli à la fin) */
  const nSommaire = ajoute(null);

  /* ouverture de chapitre */
  const ouverture = (num, titre, texte, ph, cle, contenu) => ajoute(n => `<section class="pg ouv" id="p${n}">${photo(ph, titre, 'ouv-img')}
<div class="ouv-b"><p class="ouv-num">${num}</p><h2>${esc(titre)}</h2><p>${esc(texte)}</p>
<div class="ouv-pied"><ul>${contenu.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${cle ? qr(cle, 'm', 'Voir sur le site') : ''}</div></div>${pied(n)}</section>`, titre, 1);

  /* page formule : grande photo, composition, QR à la place du prix */
  const formule = (d, eyebrow) => {
    const p = d.slug ? P(d.slug) : null, s = d.sous ? sous(d.sous) : null;
    if (d.slug && !p) return; if (d.sous && !s) return;
    const titre = d.titre || (p ? p.titre : s.nom), cle = d.slug || d.sous;
    const ph = p ? photoDe(p) : (s.bandeauPhoto || s.photo);
    let vign = (d.vignettes || []).map(vignette).filter(Boolean).slice(0, 2);
    let ph2 = ph;
    if (ph2 && dejaVues.has(ph2) && vign.length) { ph2 = vign[0]; vign = vign.slice(1).concat(ph); }
    dejaVues.add(ph2);
    let compo = d.compo || [];
    if (d.fiches) compo = d.fiches.map(P).filter(Boolean).map(f => [f.titre, court(f.extrait || (f.description || [])[0] || '', 190), f.slug]);
    ajoute(n => `<section class="pg form" id="p${n}"><div class="form-ph">${photo(ph2, titre)}<div class="form-voile"></div><div class="form-t"><p class="eyebrow or">${esc(eyebrow)}</p><h2>${esc(titre)}</h2></div></div>
<div class="pg-in form-in"><div class="form-intro"><p class="accroche">${esc(d.accroche || '')}</p><ul class="tags">${(d.tags || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
<p class="chapo">${esc(d.chapo || '')}</p>
<div class="compo">${compo.map(([t, x, slug]) => `<div class="compo-b"><h4>${slug ? `<a href="${esc(lien(slug))}">${esc(t)} ↗</a>` : esc(t)}</h4><p>${esc(x)}</p></div>`).join('')}</div></div>
<div class="form-bas">${qr(cle, 'l', '')}<div class="form-bas-t"><b>Le prix, les photos et la commande</b><span>Scannez ce QR code avec l’appareil photo de votre téléphone, ou cliquez dessus : vous arrivez directement sur la page du site.</span><a href="${esc(lien(cle))}">Voir sur le site →</a></div>${vign.map(v => `<div class="form-vg">${photo(v)}</div>`).join('')}</div>${pied(n)}</section>`, d.sommaire || titre);
  };

  /* page grille : une vignette par fiche, chacune avec son QR code */
  const grille = g => {
    const items = g.items.map(x => typeof x === 'string' ? x : x.slug).map(P).filter(Boolean);
    if (!items.length) return;
    const cols = g.cols || 3;
    const r = rub(g.cle);
    const bandeau = g.bandeauPhoto || (g.bandeau && r ? (r.bandeauPhoto || r.photo) : '');
    ajoute(n => `<section class="pg grille g${cols}${bandeau ? ' avec-bandeau' : ''}" id="p${n}">${bandeau ? `<div class="g-bandeau">${photo(bandeau, g.titre)}</div>` : ''}<div class="pg-in">
<header class="g-h"><div><p class="eyebrow">${esc(g.eyebrow)}</p><h2>${esc(g.titre)}</h2><p class="intro">${esc(g.intro)}</p></div>${g.cle ? qr(g.cle, 's', 'Tout voir') : ''}</header>
<div class="cartes">${items.map(p => `<article class="carte"><div class="carte-ph">${photo(photoDe(p), p.titre)}${qr(p.slug, 's', '')}</div><div class="carte-b"><h3><a href="${esc(lien(p.slug))}">${esc(p.titre)}</a></h3><p>${esc(court(p.extrait || (p.description || [])[0] || '', cols === 2 ? 230 : 140))}</p><a class="voir" href="${esc(lien(p.slug))}">Voir le prix sur le site ↗</a></div></article>`).join('')}</div>
</div>${pied(n)}</section>`, g.titre);
  };

  /* ---------- chapitre 1 : le traiteur français ---------- */
  ouverture('01', 'Le traiteur français', 'Du petit-déjeuner au dîner : cocktails déjeunatoires ou dînatoires, buffets généreux et repas servis à table, des recettes de tradition et des bouchées raffinées préparées pour vos invités.', '/site/c/carte-magnolia-bandeau-chef.webp', 'cocktails-buffets', ['Nos petits-déjeuners', 'Nos cocktails & buffets français', 'La carte Magnolia : entrées, plats, repas servi à table, desserts']);
  /* les petits-déjeuners ouvrent l'offre traiteur : c'est le premier moment de la journée (Jean-Luc, 2026-11-28) */
  grille(GRILLES.petitsDej);
  for (const d of FRANCAIS) formule(d, 'Cocktails & buffets français');
  /* La carte Magnolia */
  grille(GRILLES.entrees);
  const gammes = [['Gamme Tradition', ['boeuf-bourguignon', 'lasagnes-a-la-bolognaise', 'tartiflette', 'saute-de-veau-aux-champignons', 'roti-de-porc', 'parmentier-de-canard']],
    ['Gamme Gourmet', ['blanquette-de-veau', 'filet-mignon-de-porc-sauce-moutarde', 'paupiette-de-veau-sauce-forestiere', 'confit-de-canard', 'dos-de-cabillaud-sauce-citronnee', 'roti-de-boeuf']],
    ['Gamme Prestige', ['magret-de-canard-et-sa-sauce', 'saumon-sauce-beurre-blanc', 'noix-de-saint-jacques-sauce-cremeuse', 'souris-d-agneau-confite']]];
  const accomp = ['Pommes de terre grenaille rôties', 'Gratin dauphinois', 'Purée maison', 'Écrasé de pommes de terre', 'Haricots verts', 'Carottes glacées', 'Champignons poêlés', 'Légumes rôtis', 'Légumes de saison', 'Fondue de poireaux', 'Riz basmati', 'Riz pilaf', 'Risotto aux légumes', 'Tagliatelles fraîches', 'Jeunes pousses', 'Roquette, parmesan et tomates cerises'];
  ajoute(n => `<section class="pg carte-pl" id="p${n}"><div class="pg-in">
<header class="g-h"><div><p class="eyebrow">La carte Magnolia</p><h2>Nos plats</h2><p class="intro">Trois gammes, Tradition, Gourmet et Prestige : recettes conviviales ou assiettes raffinées, en buffet ou servies à table. Les accompagnements sont compris. 5 portions minimum du même choix.</p></div></header>
<div class="gammes">${gammes.map(([t, L]) => { const ps = L.map(P).filter(Boolean); return `<div class="gamme"><div class="gamme-h"><h3>${esc(t)}</h3>${qr(ps[0] ? ps[0].slug : 'carte-magnolia', 's', 'Voir les prix')}</div><ul>${ps.map(p => `<li>${photo(photoDe(p), p.titre)}<a href="${esc(lien(p.slug))}">${esc(p.titre)}</a></li>`).join('')}</ul></div>`; }).join('')}</div>
<div class="accomp"><h3 class="titre-or">Nos accompagnements, compris dans le prix du plat</h3><p>${accomp.map(esc).join(' · ')}</p><p class="petit">Pour les repas servis à table : un plat unique pour tous les convives, avec jusqu’à deux accompagnements. Des adaptations pour les régimes particuliers peuvent être prévues dans votre devis.</p></div>
</div>${pied(n)}</section>`, 'La carte Magnolia : nos plats');
  /* le repas servi à table a sa propre page, avec le salé, avant les desserts (Jean-Luc, 2026-11-28) */
  formule(REPAS, 'La carte Magnolia');
  /* les desserts de la carte suivent le repas servi à table, après tout son salé (Jean-Luc, 2026-11-28) */
  grille(GRILLES.desserts);

  /* ---------- chapitre 2 : saveurs du monde ---------- */
  const sm = rub('saveurs-du-monde');
  if (sm) {
    const ss = MONDE.map(d => sous(d.sous)).filter(Boolean);
    ajoute(n => `<section class="pg monde" id="p${n}"><div class="monde-ph">${photo('/site/c/paysages/antilles.webp', 'Saveurs du monde')}<div class="form-voile"></div><div class="form-t"><p class="ouv-num">02</p><h2>Cocktails & buffets du monde</h2></div></div><div class="pg-in">
<p class="lead">Un monde de saveurs, une même attention. Choisissez l’univers culinaire qui vous ressemble : notre équipe vous accompagne pour composer un menu et un service adaptés à votre réception.</p>
<div class="monde-g">${ss.map(s => `<div class="monde-t">${photo(s.photo && !/\.mp4$/.test(s.photo) ? s.photo : s.bandeauPhoto, s.nom)}<a class="monde-n" href="${esc(lien(s.slug))}"><b>${esc(s.nom)}</b><i>Voir le prix ↗</i></a>${qr(s.slug, 'xs', '')}</div>`).join('')}</div>
</div>${pied(n)}</section>`, 'Saveurs du monde', 1);
    for (const d of MONDE) formule(d, 'Saveurs du monde');
  }
  /* fruits de mer */
  const gl = rub('grand-large');
  if (gl) {
    const fdm = [['huitres-pleine-mer', '6 pièces'], ['huitres-utah-beach', '6 pièces'], ['huitres-gillardeau-n-3', '6 pièces'], ['praires', '6 pièces'], ['langoustines-cuites', '2 pièces'], ['crevettes-roses-bio-de-madagascar', '6 pièces'], ['crevettes-grises', '100 g'], ['bulots-cuits', '300 g'], ['homard-europeen-de-bretagne', '450 à 500 g'], ['demi-homard-europeen-de-bretagne', '200 à 250 g'], ['tourteau-entier-cuit', 'environ 560 g'], ['demi-tourteau-cuit', 'environ 280 g'], ['oursin-selon-la-saison', 'à l’unité'], ['saumon-fume-maison', '200 g'], ['oeufs-de-saumon', '100 g'], ['caviar-imperial-francais', '50 g'], ['anchois-marines', '120 g'], ['tarama', '90 g'], ['tarama-de-cabillaud', '90 g'], ['pot-de-tarama-d-oursins', '90 g'], ['blinis', '4 pièces']]
      .map(([s, q]) => [P(s), q]).filter(x => x[0]);
    ajoute(n => `<section class="pg form" id="p${n}"><div class="form-ph">${photo(gl.bandeauPhoto || gl.photo, 'Plateaux de fruits de mer')}<div class="form-voile"></div><div class="form-t"><p class="eyebrow or">Au grand large</p><h2>Plateaux de fruits de mer</h2></div></div>
<div class="pg-in form-in"><div class="form-intro"><p class="accroche">Le savoir-faire du poissonnier Marc Auguet, l’attention du traiteur.</p><ul class="tags"><li>Poissonnier depuis 1975</li><li>Marchés de Saxe et Monge</li></ul></div>
<p class="chapo">La passion des beaux produits de la mer rencontre l’art de recevoir : huîtres, langoustines, crevettes, homard ou tourteau, présentés sur un lit de glace pilée avec citron et rince-doigts, prêts à prendre place sur votre table ou votre buffet. Composez votre plateau selon vos envies et le nombre de vos invités. Délai de livraison : 48 heures minimum.</p>
<div class="fdm">${fdm.map(([p, q]) => `<a href="${esc(lien(p.slug))}"><b>${esc(p.titre)}</b><i>${esc(q)}</i></a>`).join('')}</div></div>
<div class="form-bas">${qr('grand-large', 'l', '')}<div class="form-bas-t"><b>Composez votre plateau en ligne</b><span>Scannez ou cliquez : choisissez vos produits, voyez les prix à jour et ajoutez-les à votre sélection.</span><a href="${esc(lien('grand-large'))}">Voir sur le site →</a></div>${['huitres-gillardeau-n-3', 'homard-europeen-de-bretagne'].map(vignette).filter(Boolean).map(v => `<div class="form-vg">${photo(v)}</div>`).join('')}</div>${pied(n)}</section>`, 'Plateaux de fruits de mer');
  }

  /* ---------- chapitre 3 : coffrets, plateaux, boissons ---------- */
  ouverture('03', 'Coffrets, plateaux & boissons', 'Des coffrets à partager, des plateaux généreux, notre cave et nos open bars.', vignette('le-coffret-antillais-saveurs-pays') || '/site/c/coffret-bois-9-cases.webp', 'coffrets-plateaux', ['Nos coffrets gourmands', 'Nos plateaux à partager', 'La cave de Magnolia']);
  grille(GRILLES.coffrets); grille(GRILLES.plateaux); grille(GRILLES.boissons);

  /* ---------- chapitre 4 : animations & douceurs ---------- */
  ouverture('04', 'Animations & douceurs', 'Des stands qui font le spectacle, des douceurs pour petits et grands, des corbeilles de fruits et des gâteaux de fête.', vignette('animation-barbecue') || '/site/c/barbecue40-client-20261031.jpg.webp', 'animations-salees', ['Nos animations salées', 'Nos animations sucrées', 'Corbeilles de fruits & pâtisseries', 'Gâteaux & pièces montées']);
  grille(GRILLES.salees1); grille(GRILLES.salees2); grille(GRILLES.sucrees); grille(GRILLES.corbeilles); grille(GRILLES.gateaux);

  /* ---------- chapitre 5 : votre réception de A à Z ---------- */
  ouverture('05', 'Votre réception, dans les moindres détails', 'Location, personnel, son, lumière, musique, artistes et lieux de réception : une seule demande pour tout organiser.', '/site/c/soiree-entreprise-reception.webp', 'indispensables', ['Les indispensables & la location', 'Le personnel de réception', 'Son, lumière, musique & artistes', 'Nos lieux de réception', 'Commander & livraison']);
  grille(GRILLES.indisp1); grille(GRILLES.indisp2); grille(GRILLES.personnel); grille(GRILLES.son); grille(GRILLES.live); grille(GRILLES.surprendre); grille(GRILLES.jeux);

  /* lieux */
  /* bandeau + renvoi vers le moteur de recherche des lieux (Jean-Luc, 2026-11-28). L'adresse se change sans toucher au code :
     variable BROCHURE_LIEUX_URL (par ex. la recherche de Je Privatise plus tard), sinon la page Lieux du site. */
  const lieux = c.lieux.filter(vis).filter(l => (l.photos || []).length).slice(0, 3);
  const rechLieux = /^https?:\/\//.test(opts.lieuxUrl || '') ? opts.lieuxUrl : lien('lieux');
  ajoute(n => `<section class="pg grille g3 avec-bandeau" id="p${n}"><div class="g-bandeau">${photo('/site/c/lieux-bandeau.webp', 'Lieu de réception')}</div><div class="pg-in">
<header class="g-h"><div><p class="eyebrow">Lieux de réception</p><h2>Le lieu de votre événement</h2><p class="intro">Loft, péniche, salle de mariage, domaine ou rooftop : trouvez le lieu idéal grâce à notre recherche multicritère en ligne (localisation, type de lieu, nombre d’invités, type d’événement), puis confiez-nous le traiteur et les prestations.</p></div></header>
${lieux.length ? `<div class="cartes">${lieux.map(l => `<article class="carte"><div class="carte-ph">${photo(photoDe(l), l.nom)}${qr(l.slug, 's', '')}</div><div class="carte-b"><h3><a href="${esc(lien(l.slug))}">${esc(l.nom)}</a></h3><p>${esc(court([l.capacite ? `Jusqu’à ${l.capacite} personnes.` : '', l.resume || l.description || ''].filter(Boolean).join(' '), 140))}</p><a class="voir" href="${esc(lien(l.slug))}">Voir le lieu ↗</a></div></article>`).join('')}</div>` : ''}
</div><div class="form-bas"><a class="qr qr-l" href="${esc(rechLieux)}">${qrSvg(rechLieux)}</a><div class="form-bas-t"><b>Trouvez le lieu qui correspondra à votre demande</b><span>Scannez ce QR code ou cliquez : vous arrivez sur notre moteur de recherche des lieux, avec la localisation, le type de lieu, le nombre d’invités et le type d’événement.</span><a href="${esc(rechLieux)}">Rechercher un lieu →</a></div></div>${pied(n)}</section>`, 'Nos lieux de réception');

  /* commander & livraison */
  ajoute(n => `<section class="pg cmd" id="p${n}"><div class="pg-in">
<p class="eyebrow">Simple et rapide</p><h2>Commander, en toute sérénité</h2>
<ol class="etapes grandes"><li><b>1</b><span><strong>Votre sélection</strong>Sur le site, ajoutez vos prestations à « Ma sélection » : le total s’affiche, livraison comprise.</span></li>
<li><b>2</b><span><strong>Votre demande</strong>Indiquez la date, le lieu et le nombre d’invités : une seule demande pour tout votre événement.</span></li>
<li><b>3</b><span><strong>Votre devis</strong>Nous vous envoyons un devis complet par e-mail et par SMS, à signer en ligne.</span></li>
<li><b>4</b><span><strong>Le jour J</strong>Nous livrons, installons, servons et reprenons le matériel : vous profitez de vos invités.</span></li></ol>
<div class="cmd-2"><div class="cmd-b"><h3 class="titre-or">Nos zones de livraison</h3><p><strong>Livraison 7 j/7 sur Paris et toute l’Île-de-France.</strong> Les frais de livraison dépendent de la distance et du montant de votre commande : ils sont calculés automatiquement sur le site. Plus loin, consultez-nous.</p>${qr('zone-de-livraison', 'm', 'Nos zones')}</div>
<div class="cmd-b"><h3 class="titre-or">Une question, un conseil ?</h3><p>Notre équipe vous répond du lundi au samedi et vous aide à composer votre événement selon vos envies et votre budget.</p><p class="cmd-tel"><a href="${esc(telHref)}">${esc(tel)}</a><a href="mailto:${esc(R.email || 'infos@magnoliatraiteur.fr')}">${esc(R.email || 'infos@magnoliatraiteur.fr')}</a></p>${qr('contact', 'm', 'Nous écrire')}</div></div>
<p class="petit">Les prix, les minimums de commande et la composition de chaque prestation sont indiqués sur le site et confirmés dans votre devis. Allergènes : merci de nous contacter pour toute question.</p>
</div>${pied(n)}</section>`, 'Commander & livraison');

  /* dos */
  ajoute(n => `<section class="pg dos" id="p${n}"><div class="dos-in"><img class="couv-mono" src="/brand/monogramme.svg" alt=""><p class="couv-marque">MAGNOLIA TRAITEUR<small>Traiteur · Événementiel</small></p>
<p class="dos-slogan">${esc(R.slogan || 'Des saveurs, des idées, votre événement.')}</p>
<div class="dos-qr">${qr('accueil', 'xl', '')}<p>Scannez pour découvrir tout le site<br><a href="${esc(lien('accueil'))}">${esc(siteTxt)}</a></p></div>
<ul class="dos-c"><li><a href="${esc(telHref)}">${esc(tel)}</a></li><li><a href="mailto:${esc(R.email || 'infos@magnoliatraiteur.fr')}">${esc(R.email || 'infos@magnoliatraiteur.fr')}</a></li><li>${esc(R.adresse || '')}</li><li>${esc(R.horaires || '')}</li><li>Livraison 7 j/7 sur Paris et toute l’Île-de-France</li></ul>
<p class="dos-m">${esc(R.mentionPied || '')}</p></div></section>`);

  /* sommaire */
  pages[nSommaire - 1] = n => `<section class="pg som" id="p${n}"><div class="pg-in"><p class="eyebrow">Magnolia Traiteur</p><h2>Sommaire</h2><p class="lead">Cliquez sur une rubrique pour y aller directement.</p>
<ol class="som-l">${sommaire.map(x => `<li class="niv${x.niveau}"><a href="#p${x.n}"><span>${esc(x.t)}</span><i></i><b>${x.n}</b></a></li>`).join('')}</ol></div>
<div class="som-plus"><p class="eyebrow">Et aussi, en ligne</p><ul>${[['avis', 'Tous nos avis', 'Ce que disent nos clients'], ['instagram', 'Notre Instagram', '@magnoliatraiteur'], ['blog-entreprises', 'Nos reportages entreprises', 'Séminaires, soirées, inaugurations'], ['blog-maison', 'La maison Magnolia', 'Nos coulisses et nos nouveautés']].map(([k, t, st]) => `<li>${qr(k, 'xs', '')}<a href="${esc(lien(k))}"><b>${esc(t)}</b><span>${esc(st)}</span></a></li>`).join('')}</ul></div>${pied(n)}</section>`;

  const corps = pages.map((fn, i) => fn(i + 1)).join('\n');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brochure Magnolia Traiteur</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/brochure.css?v=${opts.v || ''}"></head>
<body class="brochure">${opts.barre === false ? '' : `<div class="b-barre"><a class="b-ret" href="/">← Le site</a><span>La brochure Magnolia Traiteur · ${pages.length} pages</span>${opts.pdf ? `<a class="b-btn" href="${esc(opts.pdf)}" download>Télécharger le PDF</a>` : ''}<button type="button" class="b-btn" onclick="window.print()">Imprimer</button><button type="button" class="b-btn" id="b-envoyer">Envoyer</button></div>`}
${corps}
${opts.barre === false ? '' : `<script>
/* Retour à la même page de la brochure après avoir ouvert une fiche (Jean-Luc, 2026-11-28) :
   la position est retenue en continu, et rétablie quand on revient en arrière (iPhone et ordinateur). */
(function () {
  var K = 'mg_brochure_y';
  function lire() { try { return +sessionStorage.getItem(K) || 0; } catch (e) { return 0; } }
  function noter() { try { sessionStorage.setItem(K, String(window.scrollY || window.pageYOffset || 0)); } catch (e) {} }
  var t; window.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(noter, 120); }, { passive: true });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) noter(); }, true);
  window.addEventListener('pagehide', noter);
  function remettre() { var y = lire(); if (y > 0 && Math.abs((window.scrollY || 0) - y) > 40 && !location.hash) window.scrollTo(0, y); }
  window.addEventListener('pageshow', function () { remettre(); setTimeout(remettre, 300); });
  window.addEventListener('load', function () { setTimeout(remettre, 50); });
})();
/* bouton « Envoyer » (Jean-Luc, 2026-11-28) : partage du téléphone (SMS, WhatsApp, e-mail…), sinon e-mail prérempli + lien copié */
(function () {
  var b = document.getElementById('b-envoyer'); if (!b) return;
  var lien = location.origin + '/brochure.pdf';
  var titre = 'La brochure Magnolia Traiteur', texte = 'Voici la brochure de Magnolia Traiteur, traiteur et événementiel : ';
  b.addEventListener('click', function () {
    if (navigator.share) { navigator.share({ title: titre, text: texte, url: lien }).catch(function () {}); return; }
    try { navigator.clipboard && navigator.clipboard.writeText(lien); } catch (e) {}
    b.textContent = 'Lien copié ✓'; setTimeout(function () { b.textContent = 'Envoyer'; }, 3000);
    location.href = 'mailto:?subject=' + encodeURIComponent(titre) + '&body=' + encodeURIComponent(texte + lien);
  });
})();
</script>`}
</body></html>`;
}

module.exports = { html, cible, qrSvg, sansPrix, court, FRANCAIS, MONDE, GRILLES, REPAS };
