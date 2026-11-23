'use strict';
/*
 * Premier démarrage : la base est remplie avec le contenu du brouillon (data/brouillon.json,
 * récupéré par scripts/recuperer-brouillon.js). Ensuite, tout se gère dans le back-office :
 * la base fait foi et ce fichier n'est plus relu (sauf « Réimporter » dans Outils).
 */
const fs = require('fs');
const path = require('path');
const { slugify } = require('./util');

const DATA = path.join(__dirname, '..', 'data');

/* TVA : 10 % restauration à emporter / livrée, 20 % services, boissons alcoolisées, matériel et lieux */
/* boissons alcoolisées : 20 % ; le reste des boissons et la nourriture : 10 % */
const ALCOOL = /champagne|\bvins?\b|cave|bi[eè]re|open ?bars?|alcool|cidre|whisk|rhum|punch|spritz|mojito|sangria|cr[eé]mant|prosecco|bordeaux|ch[aâ]teau|cuv[ée]e|ros[ée]\b|chardonnay|chablis|\bcru\b|bourgogne|c[oô]tes? d|gris de|shots?|cocktails?/i;
const tvaProduit = p => (p.rubrique === 'boissons' && ALCOOL.test(p.titre) && !/softs?|caf[ée]|d[ée]jeuner|gla[cç]ons/i.test(p.titre)) ? 20 : (TVA_RUBRIQUE[p.rubrique] || 10);
const TVA_RUBRIQUE = { 'personnel': 20, 'musique-animations': 20, 'lieux': 20, 'indispensables': 20 };

/* bulles sous la recherche de l'accueil, dans l'ordre choisi par Jean-Luc (2026-11-23) :
   toute la nourriture d'abord, puis les options, « Lieu à privatiser » en dernier ; sans lien = recherche du mot */
const SUGGESTIONS_ACCUEIL = [
  { label: 'Buffet & cocktail français', lien: '/cocktails-buffets' },
  { label: 'Buffet antillais', lien: '/saveurs-du-monde/buffet-antillais' },
  { label: 'Paëlla', lien: '/saveurs-du-monde/paella-party' },
  { label: 'Couscous party', lien: '/saveurs-du-monde/couscous-party' },
  { label: 'Huîtres', lien: '' },
  { label: 'Barbecue party', lien: '/boutique?q=barbecue' },
  { label: 'Fontaine à chocolat', lien: '' },
  { label: 'Pièces montées', lien: '' },
  { label: 'Candy bar', lien: '' },
  { label: 'Plateau de fruits de mer', lien: '/grand-large' },
  { label: 'DJ', lien: '' },
  { label: 'Louer des verres', lien: '/boutique?q=verres' },
  { label: 'Personnel de service', lien: '/personnel' },
  { label: 'Lieu à privatiser', lien: '/lieux' },
];
/* La maison, à côté de « Une seule maison, une seule demande » : soirée corporate, vraie photo (Unsplash, Jean-Luc 2026-11-22) */
const PHOTO_MAISON_INTRO = 'https://images.unsplash.com/photo-1768508948849-b2ee9e074ab1?auto=format&fit=crop&w=1600&q=80';
/* laboratoire : 15 avenue de Norvège, Villebon-sur-Yvette (Base Adresse Nationale) */
const ORIGINE_LABO = { lat: 48.692674, lon: 2.212317, nom: 'Villebon-sur-Yvette' };
const REGLAGES_DEFAUT = {
  nom: 'Magnolia Traiteur',
  sousNom: 'Traiteur · Événementiel',
  slogan: 'Des saveurs, des idées, votre événement.',
  telephone: '07 63 66 98 92',
  email: 'infos@magnoliatraiteur.fr',
  adresse: '15 avenue de Norvège, 91140 Villebon-sur-Yvette',
  origine: ORIGINE_LABO,
  horaires: 'Du lundi au vendredi de 9 h à 18 h, le samedi de 10 h à 18 h.',
  instagram: 'https://www.instagram.com/magnoliatraiteur/',
  avisGoogle: { note: '4,9', nombre: 'plus de 650', url: 'https://search.google.com/local/reviews?placeid=ChIJQb9vuprX5UcR2-iHFOth55k' },
  mentionPied: 'Paris & Île-de-France · Le Traiteur Antillais est un département de Magnolia Traiteur',
  accueil: {
    surtitre: 'L’art de recevoir, signé Magnolia',
    titre: 'Vos plus beaux moments\nont du goût',
    sousTitre: 'Traiteur, animations et lieux de réception pour tous vos événements.',
    videos: [
      { src: '/site/v/italien-boucle.mp4', poster: '/site/v/italien-boucle.jpg', titre: 'Buffet italien', lien: '/saveurs-du-monde/buffet-italien-entree-plat-dessert' },
      { src: '/site/v/antillais-boucle.mp4', poster: '/site/v/antillais-boucle.jpg', titre: 'Buffet antillais', lien: '/buffet-antillais' },
      { src: '/site/v/chinois-boucle.mp4', poster: '/site/v/chinois-boucle.jpg', titre: 'Buffet chinois', lien: '/buffet-chinois' },
    ],
    chiffres: [
      { valeur: '4,9/5', label: 'Sur Google, plus de 650 avis' },
      { valeur: '800', label: 'plus de 800 prestations par an' },
      { valeur: '7 j/7', label: 'livraison en Île-de-France' },
      { valeur: '1 seule', label: 'demande pour tout votre événement' },
    ],
    photoMaisonIntro: PHOTO_MAISON_INTRO,
    bandeau: ['Saveurs du monde', 'Antillais', 'Chinois', 'Indien', 'Paëlla', 'Libanais', 'Italien', 'Africain', 'Couscous', 'Japonais'],
    suggestions: SUGGESTIONS_ACCUEIL,
    incontournables: ['grand-cocktail-magnolia', 'paella-royale', 'buffet-antillais-entree-plat-dessert', 'buffet-chinois-entrees-plat-dessert', 'buffet-indien-entree-plat-dessert', 'buffet-libanais-6-mezzes-1-plat', 'bar-a-burrata', 'couscous-royal'],
    photoMaison: '/site/c/antilles-menus/buffet-equipe-colombo-20261103-sans-logo-20261106.webp.webp',
    photoCommande: '/site/c/accueil/personnel80-client-20261102.webp',
  },
  logosClients: ['aircaraibes', 'doctolib', 'villedeparis', 'nestle', 'bnpparibas', 'loreal', 'accenture', 'armani', 'radisson', 'canon', 'cnrs', 'bpifrance', 'creditagricole', 'lcl']
    .map(k => ({ src: `/site/logos/${k}.svg`, nom: { aircaraibes: 'Air Caraïbes', doctolib: 'Doctolib', villedeparis: 'Ville de Paris', nestle: 'Nestlé', bnpparibas: 'BNP Paribas', loreal: 'L’Oréal', accenture: 'Accenture', armani: 'Giorgio Armani', radisson: 'Radisson Blu', canon: 'Canon', cnrs: 'CNRS', bpifrance: 'Bpifrance', creditagricole: 'Crédit Agricole', lcl: 'LCL' }[k] })),
  tarifs: {
    kmCents: 100,
    livraisonOfferteCents: 70000, /* livraison offerte dès 700 € TTC de commande (0 = jamais) */
    personnel: { label: 'Personnel de service polyvalent', heureCents: 4188, minHeures: 4 },
    packs: [
      { id: 'petit', label: 'Petit Pack Traiteur éco-responsable', prixCents: 450, detail: 'Matériel de buffet, verres éco-responsables, assiettes biodégradables, couverts en bois et serviettes.' },
      { id: 'grand', label: 'Grand Pack Traiteur · vaisselle en dur', prixCents: 660, detail: 'Tables traiteur, nappages, présentation, verres en verre, assiettes en porcelaine, couverts en inox et serviettes en tissu.' },
    ],
    acomptePct: 30,
    validiteDevisJours: 15,
  },
  evenements: ['Anniversaire', 'Fête de famille', 'Entreprise', 'Mariage', 'Baptême', 'Cocktail', 'Autre'],
  equipe: [
    { nom: 'Romain Goujon', role: 'Directeur commercial', photo: '/site/equipe/romain-goujon.webp', citation: '« Merci Romain de m’avoir guidée dans l’organisation de la soirée d’anniversaire de mes 50 ans, avec 75 invités on a besoin des conseils d’un vrai professionnel ! »', auteur: 'Marie Line Ricard, septembre 2025' },
    { nom: 'Hermine', role: 'Responsable opérationnelle', photo: '/site/equipe/hermine-nb.webp', citation: '« Le jour J, Hermine et son équipe ont été aux petits soins : du buffet aux boissons, en passant par le personnel et l’animation musicale, tout était impeccable. »', auteur: 'Julie Triolet-Bigueur, juin 2025' },
  ],
  alertes: { emails: 'infos@magnoliatraiteur.fr', sms: '' },
};

const MODELES_DEFAUT = [
  { id: 'relance-j3', nom: 'Relance devis (J+3)', canal: 'email', sujet: 'Votre devis Magnolia {numero}', texte: 'Bonjour {prenom},\n\nAvez-vous pu consulter votre devis {numero} pour votre {evenement} du {date} ?\nNous restons à votre disposition pour l’ajuster : quantités, plats, personnel…\n\nVotre devis : {lien}\n\nBelle journée,\nL’équipe Magnolia Traiteur\n07 63 66 98 92' },
  { id: 'relance-j7', nom: 'Relance devis (J+7, disponibilité)', canal: 'email', sujet: 'Nous gardons votre date du {date}', texte: 'Bonjour {prenom},\n\nNous gardons encore votre date du {date}, mais notre planning se remplit vite.\nPour confirmer, il suffit d’accepter le devis en ligne : {lien}\n\nÀ très vite,\nL’équipe Magnolia Traiteur' },
  { id: 'sms-relance', nom: 'SMS de relance', canal: 'sms', sujet: '', texte: 'Magnolia Traiteur : votre devis {numero} vous attend {lien} . Une question ? 07 63 66 98 92' },
  { id: 'merci', nom: 'Remerciement après l’événement', canal: 'email', sujet: 'Merci pour votre confiance', texte: 'Bonjour {prenom},\n\nMerci d’avoir choisi Magnolia Traiteur pour votre {evenement}. Nous espérons que vos invités se sont régalés !\nUn avis Google nous aide beaucoup : https://search.google.com/local/writereview?placeid=ChIJQb9vuprX5UcR2-iHFOth55k\n\nÀ bientôt,\nL’équipe Magnolia Traiteur' },
];

function lireBrouillon() {
  for (const f of ['brouillon.json', 'exemple.json']) {
    try { return { fichier: f, data: JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')) }; } catch { /* suivant */ }
  }
  return { fichier: null, data: null };
}

/* témoignages : extraits du texte de la page /temoignages du brouillon */
function extraireAvis(texte) {
  if (!texte) return [];
  const lignes = texte.split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    if (/^«/.test(l) && l.length > 40) {
      const auteur = lignes[i + 1] && !/^«|★/.test(lignes[i + 1]) ? lignes[i + 1] : '';
      out.push({ texte: l.replace(/^«\s*|\s*»$/g, ''), auteur, note: 5 });
    }
  }
  return out.slice(0, 60);
}

async function seed(store, { force = false, log = console } = {}) {
  const deja = await store.get('site/reglages');
  if (deja && !force) return { fait: false };
  const { fichier, data } = lireBrouillon();
  const now = new Date().toISOString();
  if (!deja) await store.set('site/reglages', { ...REGLAGES_DEFAUT, updatedAt: now });
  if (!(await store.list('modeles')).length) for (const m of MODELES_DEFAUT) await store.set('modeles/' + m.id, m);
  if (!data) { log.log?.('[demarrage] aucun contenu de brouillon trouvé (data/brouillon.json)'); return { fait: true, fichier: null }; }

  let n = 0;
  for (const r of data.rubriques || []) {
    await store.set('rubriques/' + r.slug, {
      slug: r.slug, nom: r.nom, ordre: r.ordre ?? n, photo: r.photo || '', photoAccueil: r.photoAccueil || '',
      chapo: r.chapo || '', accroche: '', statut: 'visible', tva: TVA_RUBRIQUE[r.slug] || 10,
    });
    n++;
  }
  let i = 0;
  for (const p of data.produits || []) {
    const id = p.slug;
    await store.set('produits/' + id, {
      ...p, url: undefined, id, ordre: i++, statut: 'visible', maison: true,
      tva: tvaProduit(p), coutCents: null, allergenes: [], updatedAt: now,
    });
  }
  let j = 0;
  for (const l of data.lieux || []) {
    const adr = l.address || {};
    await store.set('lieux/' + l.slug, {
      slug: l.slug, nom: l.name, description: l.description || '', ordre: j++, statut: 'visible', maison: false,
      adresse: adr.streetAddress || '', ville: adr.addressLocality || '', capacite: l.maximumAttendeeCapacity || null,
      equipements: (l.amenityFeature || []).map(a => a.name), photos: (Array.isArray(l.image) ? l.image : [l.image]).filter(Boolean).map(s => s.replace(/^https:\/\/www\.magnoliatraiteur\.fr/, '')),
      prixTexte: l.offers?.price ? l.offers.price + ' €' : 'Sur devis',
      avis: (l.review || []).map(r => ({ auteur: r.author?.name || '', titre: r.name || '', texte: r.reviewBody || '' })),
    });
  }
  const avis = extraireAvis(data.pages?.['/temoignages']?.texte);
  let k = 0;
  for (const a of avis) await store.set('avis/a' + String(k++).padStart(3, '0'), { ...a, ordre: k, statut: k <= 3 ? 'vedette' : 'visible' });
  /* pages de texte (CGV, mentions…) reprises du brouillon, modifiables ensuite */
  for (const [url, pg] of Object.entries(data.pages || {})) {
    if (['/cgv', '/mentions-legales', '/confidentialite', '/allergenes', '/conseils', '/references'].includes(url)) {
      await store.set('pages/' + slugify(url), { url, titre: (pg.titre || '').replace(/\s*·.*$/, ''), texte: nettoyerPage(pg.texte) });
    }
  }
  log.log?.(`[demarrage] contenu importé depuis ${fichier} : ${n} rubriques, ${i} prestations, ${j} lieux, ${avis.length} avis`);
  return { fait: true, fichier, rubriques: n, produits: i, lieux: j, avis: avis.length };
}

function nettoyerPage(t) {
  return String(t || '').split('\n').filter(l => !/^(Accueil|\[photo )/.test(l.trim())).join('\n').trim();
}

/* Avis clients et logos repris du site actuel magnoliatraiteur.fr (data/avis-magnolia.json, rempli par une action GitHub).
   Importés une fois par version du fichier ; un avis déjà présent (même modifié ou masqué dans le back-office) n'est jamais écrasé. */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateIso(t) {
  const m = String(t || '').toLowerCase().match(/(\d{1,2})\s+(\S+)\s+(\d{4})/);
  if (!m) return '';
  const k = MOIS.indexOf(m[2].replace('fevrier', 'février').replace('aout', 'août').replace('decembre', 'décembre'));
  return k < 0 ? '' : `${m[3]}-${String(k + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
async function importerAvisAncienSite(store, { log = console, fichier = path.join(__dirname, '..', 'data', 'avis-magnolia.json') } = {}) {
  let data;
  try { data = JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch { return { fait: false }; }
  const marque = await store.get('site/avis-ancien-site');
  if (marque?.recupereLe === data.recupereLe) return { fait: false };
  const deja = new Set((await store.list('avis')).map(d => d.id));
  const liste = (data.avis || []).filter(a => a.texte && String(a.texte).length > 5)
    .map(a => ({ ...a, iso: dateIso(a.date) }))
    .sort((a, b) => (b.iso || '').localeCompare(a.iso || '') || (+b.id || 0) - (+a.id || 0));
  let n = 0;
  for (const [i, a] of liste.entries()) {
    const id = 'mt_' + a.id;
    if (deja.has(id)) continue;
    await store.set('avis/' + id, { titre: a.titre || '', texte: a.texte, auteur: a.auteur || '', lieu: a.lieu || '', date: a.date || '', dateIso: a.iso, note: Math.min(5, Math.max(1, +a.note || 5)), photo: /\.(jpe?g|png|webp|gif)$/i.test(a.photo || '') ? a.photo : '', source: 'ancien-site', statut: 'visible', ordre: 1000 + i });
    n++;
  }
  /* logos du bandeau défilant : ceux du site actuel remplacent la liste d'origine (dont les fichiers n'existent pas) */
  const R = await store.get('site/reglages');
  const vus = new Set();
  const logos = (data.logos || []).filter(l => l.logo && !vus.has(l.nom + l.logo) && vus.add(l.nom + l.logo))
    .map(l => ({ src: l.logo, nom: l.nom || '', avisId: l.avisId ? 'mt_' + l.avisId : '' }));
  const existe = src => src && fs.existsSync(path.join(__dirname, '..', 'public', src));
  if (R && logos.length && !(R.logosClients || []).some(l => existe(l.src))) await store.set('site/reglages', { ...R, logosClients: logos });
  await store.set('site/avis-ancien-site', { recupereLe: data.recupereLe, importes: n, at: new Date().toISOString() });
  log.log?.(`[demarrage] ${n} avis et ${logos.length} logos repris de magnoliatraiteur.fr`);
  return { fait: true, avis: n, logos: logos.length };
}

/* Sous-rubriques (« spécialités ») d'un univers : Saveurs du monde → Paëlla, Libanais, Chinois…
   Créées une seule fois au démarrage, avec un premier classement des prestations ; tout se règle ensuite dans le back-office. */
/* textes des pages d'atterrissage des spécialités (modifiables dans le back-office) : [titre de la page, texte du bandeau] */
const SPE_TEXTES = {
  'paella-party': ['Paëlla party', 'La paëlla géante cuisinée devant vos invités ou livrée prête à servir : royale, poulet chorizo, fruits de mer ou végétarienne.'],
  'buffet-libanais': ['Buffet libanais', 'Mezzés froids et chauds, grillades et douceurs orientales, préparés dans notre laboratoire et livrés 7 jours sur 7.'],
  'buffet-chinois': ['Buffet chinois', 'Bouchées vapeur, nems, plats sautés et desserts asiatiques pour vos réceptions, livrés prêts à servir.'],
  'buffet-africain': ['Buffet africain', 'Mafé, yassa, poulet braisé, alloco et accras : les saveurs d’Afrique pour vos fêtes et mariages.'],
  'couscous-party': ['Couscous party', 'Couscous royal, tajines et pâtisseries orientales, servis à volonté pour vos grandes tablées.'],
  'buffet-italien': ['Buffet italien', 'Antipasti, pâtes fraîches, pizzas, burrata et tiramisu : l’Italie généreuse pour vos événements.'],
  'buffet-antillais': ['Buffet antillais', 'Accras, boudins créoles, colombo, rougail et punchs : la cuisine des îles par Magnolia Traiteur.'],
  'buffet-indien': ['Buffet indien', 'Samoussas, currys, biryani, naans et lassis : un buffet parfumé pour vos réceptions.'],
  'specialites-japonaises': ['Sushis et buffet japonais', 'Plateaux de sushis, makis, california et brochettes yakitori, livrés frais pour vos cocktails.'],
};
const SOUS_DEFAUT = {
  'saveurs-du-monde': [
    { slug: 'paella-party', nom: 'Paëlla party', pays: 'Espagne', photo: '/site/c/paella-royale/client-1.webp.webp', mots: ['paella'] },
    { slug: 'buffet-libanais', nom: 'Buffet libanais', pays: 'Liban', photo: '/site/v/libanais-boucle.jpg', video: '/site/v/libanais-boucle.mp4', mots: ['libanais'] },
    { slug: 'buffet-chinois', nom: 'Buffet chinois', pays: 'Chine', photo: '/site/v/chinois-boucle.jpg', video: '/site/v/chinois-boucle.mp4', mots: ['chinois'] },
    { slug: 'buffet-africain', nom: 'Buffet africain', pays: 'Afrique', photo: '/site/v/africain-boucle.jpg', video: '/site/v/africain-boucle.mp4', mots: ['africain'], dossiers: ['africain-'] },
    { slug: 'couscous-party', nom: 'Couscous party', pays: 'Maghreb', photo: '/site/c/couscous-menus/couscous-royal-sans-logo-20261106.webp.webp', mots: ['couscous'] },
    { slug: 'buffet-italien', nom: 'Buffet italien', pays: 'Italie', photo: '/site/v/italien-boucle.jpg', video: '/site/v/italien-boucle.mp4', mots: ['italien'] },
    { slug: 'buffet-antillais', nom: 'Buffet antillais', pays: 'Antilles', photo: '/site/v/antillais-boucle.jpg', video: '/site/v/antillais-boucle.mp4', mots: ['antill'], dossiers: ['antilles-'] },
    { slug: 'buffet-indien', nom: 'Buffet indien', pays: 'Inde', photo: '/site/c/indien-menus/menu-client-1.webp.webp', mots: ['indien'] },
    { slug: 'specialites-japonaises', nom: 'Spécialités japonaises', pays: 'Japon', photo: '/site/c/sushi45.jpg.webp', mots: ['japonais', 'sushi'] },
  ],
};
/* premier classement : mot dans l'adresse de la prestation, sinon dossier de sa photo, sinon voisinage dans la brochure */
function classerSous(produits, sous) {
  const res = new Map();
  const dossier = p => (p.photos?.[0]?.src || '').split('/')[3] || '';
  let prec = '';
  for (const p of [...produits].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))) {
    const s = sous.find(x => x.mots.some(m => p.slug.includes(m))) || sous.find(x => (x.dossiers || []).some(d => dossier(p).startsWith(d)));
    const choix = s ? s.slug : prec;
    if (choix) res.set(p.slug, choix);
    prec = choix;
  }
  return res;
}
/* prix d'achat TTC (en centimes) des plats indiens, par nom de plat (sans accents, en minuscules) */
const PRIX_INDIEN = [
  [/^oignon bhaji/, 650], [/^begnan pakora/, 650], [/^mix pakora/, 750], [/^samossas legumes/, 650],
  [/^chicken tandoori/, 750], [/^agneau tikka$/, 950], [/^prawn salade/, 750], [/^kinkiri/, 650],
  [/^chicken tikka massala/, 1300], [/^chicken shahi korma/, 1300], [/^fish tikka malai/, 950], [/^prawn madras/, 1400],
  [/^agneau shahi korma/, 1500], [/^agneau madras/, 1500], [/^crevettes massala/, 1500],
  [/^riz au safran/, 350], [/^riz (cachemiri|kashmiri)/, 500],
  [/^(hot )?gulab jamun/, 550],
];
/* Buffet libanais à l'unité (Jean-Luc, 2026-11-22) : prix d'achat de référence TTC (en centimes) relevés sur la carte en ligne
   d'un restaurant libanais de l'Essonne ; prix de vente = + 30 %, arrondi aux 10 centimes supérieurs.
   La source et les équivalences (plat le plus proche quand il n'y a pas le même) sont dans tarifs/prix-buffet-libanais.xlsx
   (dossier du projet), jamais sur le site. Baklawa : prix de 3 pièces ramené à la pièce. */
const PRIX_LIBANAIS = [
  [/^houmous/, 700], [/^feuilles de vigne/, 750], [/^salade de boulgh?our/, 750], [/^salade fattouche/, 800],
  [/^roulade de fromage/, 400], [/^roulade de zaatar/, 400], [/^moutabal/, 750], [/^taboule/, 750], [/^caviar d.aubergine/, 750],
  [/^roulade de soujouk/, 400], [/^kebbe/, 400], [/^fatayer/, 400], [/^sanbousek/, 400], [/^falafel/, 400],
  [/^manakish/, 400], [/^rikakat/, 400],
  [/^moussake/, 750], [/^(morceaux de )?chich taouk/, 1000], [/^shawarma poulet/, 1000], [/^kefta/, 1000],
  [/^aubergine fondante/, 1000], [/^daoud bacha/, 1000],
  [/^(boulgh?our|riz)/, 500],
  [/^baklawa/, 133], [/^(mohallabiech|meghli|halawet el jibn|osmaliyeh)/, 600],
];
const BANDEAUX_SPE = {
  'specialites-japonaises': '/site/c/paysages/japon.webp',
  /* table de mezzés (Pexels 39018407, licence Pexels) à la place de la vidéo de l'huile versée : Jean-Luc, 2026-11-22 */
  'buffet-libanais': 'https://images.pexels.com/photos/39018407/pexels-photo-39018407.jpeg?auto=compress&cs=tinysrgb&w=2400',
  /* choix de Jean-Luc (2026-11-22, photo A) : Pexels n° 10521312, licence Pexels (usage commercial gratuit) ; voir data/credits-photos.md */
  'paella-party': 'https://images.pexels.com/photos/10521312/pexels-photo-10521312.jpeg?auto=compress&cs=tinysrgb&w=2400',
  'buffet-antillais': '/site/c/paysages/antilles.webp',
};
/* prestations de l'univers Petits-déjeuners (séparé de Boissons le 2026-11-22) */
const PDJ = /petit-d[ée]jeuner|pause caf[ée]|accueil caf[ée]/i;
/* Buffet indien, reste de la carte du fournisseur (Jean-Luc, 2026-11-22) : [section, nom, prix d'achat TTC en centimes, unité, photo à nous (sinon photo d'ambiance)] */
const N = '/site/c/indien-menus/';
const CARTE_INDIEN = [
  ['entrees', 'Soupe de lentilles (multagni)', 650], ['entrees', 'Velouté de poulet à la crème d’amande', 750], ['entrees', 'Soupe de tomates népalaise (tamatar ko)', 650],
  ['entrees', 'Green plate', 550], ['entrees', 'Bharta mashala', 750],
  ['entrees', 'Samossa à l’agneau', 750, 'portion', N + 'entrees-samossas-portrait-20261102.webp.webp'], ['entrees', 'Pakoras de crevettes', 950],
  ['entrees', 'Achari murg tikka', 850], ['entrees', 'Bollywood kebab', 850], ['entrees', 'Murg malai tikka', 850], ['entrees', 'Nargisi seekh kebab', 850],
  ['entrees', 'Battera tandoori', 1200], ['entrees', 'Gambas tandoori', 1950], ['entrees', 'Mixed grill', 2100], ['entrees', 'Chicken 65', 750], ['entrees', 'Momos', 1100],
  ['plats', 'Poulet makhan paalak', 1300], ['plats', 'Chicken madras', 1300], ['plats', 'Butter chicken', 1300], ['plats', 'Chicken jalfrezi', 1300], ['plats', 'Chicken vindaloo', 1300], ['plats', 'Chicken karahi', 1300],
  ['plats', 'Fish bengali', 1400], ['plats', 'Fish green mashala', 1500], ['plats', 'Prawn rajasthani', 1500], ['plats', 'Crevettes korma', 1500], ['plats', 'Gambas maison', 2100], ['plats', 'Sipi goan', 1700],
  ['plats', 'Baigan mutton', 1500], ['plats', 'Bhuna gosht', 1500], ['plats', 'Agneau kashmiri kofta', 1500], ['plats', 'Shahi keema mattar', 1500], ['plats', 'Agneau palak', 1500], ['plats', 'Agneau rogan josh', 1500],
  ['plats', 'Agneau vindaloo', 1500], ['plats', 'Agneau goan', 1500], ['plats', 'Agneau jalfrezi', 1500], ['plats', 'Agneau tikka mashala', 1500], ['plats', 'Traven karela', 1500],
  ['plats', 'Côtelettes d’agneau népalaises', 1800], ['plats', 'Bhutuwa', 1800], ['plats', 'Chicken chilli', 1700], ['plats', 'Daal jhaneko', 900], ['plats', 'Daal bhaat tarkari', 1700], ['plats', 'Daal bhaat mashu', 2000],
  ['plats', 'Chow chow végétarien', 1300], ['plats', 'Chow chow au poulet', 1500], ['plats', 'Chow chow à l’agneau', 1700], ['plats', 'Chow chow aux crevettes', 1700], ['plats', 'Chow chow royal', 1900],
  ['plats', 'Biryani au poulet', 1500], ['plats', 'Biryani aux crevettes', 1700], ['plats', 'Biryani à l’agneau', 1600], ['plats', 'Biryani royal', 1900], ['plats', 'Biryani aux légumes', 1300],
  ['plats', 'Baigan bhurta', 950], ['plats', 'Palak paneer', 900], ['plats', 'Mattar paneer', 900], ['plats', 'Dal tarka', 900], ['plats', 'Aloo chana mashala', 900], ['plats', 'Légumes shahi korma', 1050], ['plats', 'Mix vegetable', 950],
  ['accompagnements', 'Riz jeera (au cumin)', 500], ['accompagnements', 'Riz mattar pulao (aux petits pois)', 500],
  ['accompagnements', 'Naan', 250, 'pièce'], ['accompagnements', 'Cheese naan', 400, 'pièce', N + 'naan-fromage.webp.webp'], ['accompagnements', 'Cheese naan épicé', 500, 'pièce', N + 'naan-fromage.webp.webp'],
  ['accompagnements', 'Cheese naan à l’ail', 500, 'pièce', N + 'naan-fromage.webp.webp'], ['accompagnements', 'Naan à l’ail ou aux oignons', 400, 'pièce'], ['accompagnements', 'Kashmiri naan', 450, 'pièce'],
  ['accompagnements', 'Keema naan', 500, 'pièce'], ['accompagnements', 'Paratha', 400, 'pièce'], ['accompagnements', 'Masala kulcha', 400, 'pièce'], ['accompagnements', 'Tandoori roti (chapati)', 250, 'pièce'],
  ['desserts', 'Salade de fruits de Goa', 650], ['desserts', 'Pista kulfi', 650], ['desserts', 'Mango kulfi', 650], ['desserts', 'Halwa maison', 450], ['desserts', 'Kheer (riz au lait indien)', 450],
];
const AMBIANCE_INDIEN = ['menu-client-1', 'menu-client-2', 'menu-client-3', 'menu-client-4', 'plat-seul-client-1', 'plat-seul-client-2', 'plat-seul-client-3'].map(n => N + n + '.webp.webp');
const RANGEMENTS = [['buffets', 'Nos buffets'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['fromages', 'Nos fromages'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité']];
/* « Riz oriental : + 1,50 € HT/personne. » → « Riz oriental » (supplément d'un menu, pas un nom de plat) */
const SUPPL = /\s*:\s*\+\s*[\d.,]+\s*€.*$/;
/* accompagnements (riz, gratins, alloco…) : demande de Jean-Luc du 2026-11-22 */
const ACCOMP = /^(riz|boulgh?our|nouilles|gratin|haricots|mini-brochettes? de banane|alloco|attieke|foutou|placali|ablo|semoule|frites|naan|pommes de terre|bananes? plantain|legumes|pates|polenta)/;
/* section automatique d'une prestation (modifiable dans sa fiche) */
function rangementDe(p) {
  if (RANGEMENTS.some(([k]) => k === p.rangement)) return p.rangement;
  const t = String(p.titre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if ((p.groupes || []).length || /^(buffet|paella|couscous|plateau japonais)/.test(t)) return 'buffets';
  if (/pack|animation|piment|wrap|club sandwich|coffret (antillais|chinois|libanais|italien)/.test(t)) return 'divers';
  if (/^(le )?(plateau de fromages?|trio affine)/.test(t)) return 'fromages';
  if (/fruit|gateau|flan|sorbet|blanc manger|puff puff|patisserie|mochi|perles coco|litchi|dessert|tiramisu|baklava|corbeille|mahalabia|maamoul|gulab|halwa|kheer|panna cotta/.test(t)) return 'desserts';
  if (ACCOMP.test(t)) return 'accompagnements';
  if (/acras|samoussa|boudin|bokit|pate antillais|pastel|toast|avocat|salade|chiquetaille|achard|feroce|crabe farci|assortiment d.entrees|nems|bouchee|ravioli|hacao|brochette|houmous|taboule|falafel|moutabal|fattouch|kebbe|feuille|rakakat|sambousek|pakora|bhaji|onion|entree/.test(t)) return 'entrees';
  if (/riz|alloco|attieke|foutou|ablo|placali|thiebou|mijote|soupe|ndole|yassa|saka|tripes|kedjenou|mafe|curry|poulet|niebe|gratin|assiette|plat|canard|porc|crevettes|boulettes|nouilles|agneau|boeuf|kefta|chich|tikka|massala|biryani|naan|dal|legumes/.test(t)) return 'plats';
  return 'divers';
}

/* Spécialités en sections (Nos buffets, entrées, plats, desserts, divers à l'unité) : pour chaque spécialité qui n'a pas encore
   de produits à l'unité, une fiche par plat de ses menus (photos du brouillon). Prix à compléter : « Sur devis ». */
const TITRES_SECTIONS = { 'paella-party': { buffets: 'Nos paëllas' }, 'couscous-party': { buffets: 'Nos couscous' }, 'specialites-japonaises': { buffets: 'Nos plateaux' } };
async function initUniteSpecialites(store, log) {
  const r = await store.get('rubriques/saveurs-du-monde');
  if (!r || r.uniteInit || !(r.sous || []).length) return;
  const prods = (await store.list('produits')).map(d => ({ id: d.id, ...d.data }));
  const RANG = { entrees: 'entrees', mezzes: 'entrees', brochettes: 'entrees', salades: 'entrees', plats: 'plats', accompagnements: 'accompagnements', desserts: 'desserts' };
  const UNITE = { entrees: ['pièce', 5], mezzes: ['portion', 5], brochettes: ['brochette', 5], salades: ['portion', 5], plats: ['portion', 5], accompagnements: ['portion', 5], desserts: ['pièce', 5] }; /* minimum 5 à l'unité (Jean-Luc, 2026-11-23) */
  const vus = new Set(prods.map(p => p.slug)); let ordre = Math.max(0, ...prods.map(p => p.ordre || 0)) + 1, n = 0;
  for (const x of r.sous) {
    const dans = prods.filter(p => p.sous === x.slug);
    const buffets = dans.filter(p => (p.groupes || []).length);
    if (!buffets.length) continue;
    const unites = dans.filter(p => !(p.groupes || []).length);
    const deja = new Set(unites.map(p => slugify(p.titre)));
    const mot = x.slug.split('-').pop();
    for (const g0 of Object.keys(RANG)) {
      const opts = new Map();
      if (unites.filter(p => rangementDe(p) === RANG[g0]).length >= 3) continue; // cette section a déjà ses produits à l'unité
      for (const b of buffets) for (const g of b.groupes || []) if (g.id === g0) for (const o of g.options || []) if (!opts.has(o.label)) opts.set(o.label, o);
      for (const o of opts.values()) {
        const lab = o.label.replace(SUPPL, '');
        const titre = g0 === 'brochettes' && !/^brochette/i.test(lab) ? 'Brochettes ' + lab.charAt(0).toLowerCase() + lab.slice(1) : lab;
        const slug = slugify(titre + ' ' + mot);
        if (vus.has(slug) || deja.has(slugify(titre))) continue; vus.add(slug);
        const [unite, min] = UNITE[g0];
        await store.set('produits/' + slug, { id: slug, slug, rubrique: 'saveurs-du-monde', autresRubriques: [], sous: x.slug, rangement: RANG[g0], titre, prixCents: null, unite, min, extrait: `${titre} : préparé par notre chef et livré prêt à servir.`, description: [], photos: (o.photos || []).slice(0, 1).map(src => ({ src, alt: titre })), video: null, groupes: [], variantes: [], sections: [], details: [], regles: { personnel: 'service', packs: true }, ordre: ordre++, statut: 'visible', maison: true, tva: 10, allergenes: [], aCompleter: true });
        n++;
      }
    }
  }
  const cof = prods.find(p => p.slug === 'coffret-chinois-aux-neuf-saveurs');
  if (cof && !cof.sous) await store.set('produits/' + cof.id, { ...cof, autresRubriques: [...new Set([...(cof.autresRubriques || []), 'saveurs-du-monde'])], sous: 'buffet-chinois', rangement: 'divers' });
  const sous = r.sous.map(x => ({ ...x, parSections: true, titresSections: { ...(TITRES_SECTIONS[x.slug] || {}), ...(x.titresSections || {}) } }));
  await store.set('rubriques/saveurs-du-monde', { ...r, sous, chinoisUnite: true, uniteInit: true });
  if (n) log.log?.(`[demarrage] ${n} plats à l'unité créés dans les spécialités (prix à compléter)`);
}
async function initSousRubriques(store, { log = console } = {}) {
  let n = 0;
  for (const [rub, defs] of Object.entries(SOUS_DEFAUT)) {
    const r = await store.get('rubriques/' + rub);
    if (!r || r.sousInit) continue;
    const sous = defs.map((d, i) => ({ slug: d.slug, nom: d.nom, pays: d.pays, photo: d.photo, video: d.video || '', ordre: i, statut: 'visible' }));
    const prods = (await store.list('produits')).map(d => ({ id: d.id, ...d.data })).filter(p => p.rubrique === rub);
    const cls = classerSous(prods, defs);
    for (const p of prods) if (!p.sous && cls.get(p.slug)) { await store.set('produits/' + p.id, { ...p, sous: cls.get(p.slug) }); n++; }
    await store.set('rubriques/' + rub, { ...r, sous, sousInit: true });
  }
  if (n) log.log?.(`[demarrage] ${n} prestations classées en spécialités`);
  await initUniteSpecialites(store, log);
  // une fois (2026-11-22, décision de Jean-Luc) : prix du Buffet indien = prix d'achat + 30 % (arrondi aux 10 centimes supérieurs).
  // Le prix d'achat est rangé dans « coût de revient » (jamais affiché au client). Les doublons de plats sont retirés.
  const RI = await store.get('rubriques/saveurs-du-monde');
  if (RI && !RI.indienPrix) {
    const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const vus = new Set(); let ni = 0;
    for (const d of (await store.list('produits')).sort((x, y) => (x.data?.ordre ?? 0) - (y.data?.ordre ?? 0))) {
      const p = d.data;
      if (!p || p.sous !== 'buffet-indien' || !p.aCompleter) continue;
      const nom = net(p.titre).split(':')[0].trim();
      if (vus.has(nom)) { await store.delete('produits/' + d.id); continue; }
      vus.add(nom);
      const ligne = PRIX_INDIEN.find(([re]) => re.test(nom));
      if (!ligne) continue;
      const cout = ligne[1];
      await store.set('produits/' + d.id, { ...p, prixCents: Math.ceil(cout * 1.3 / 10) * 10, coutCents: cout, unite: 'portion', min: 5, aCompleter: false });
      ni++;
    }
    await store.set('rubriques/saveurs-du-monde', { ...(await store.get('rubriques/saveurs-du-monde')), indienPrix: true });
    if (ni) log.log?.(`[demarrage] ${ni} prix du Buffet indien posés (achat + 30 %)`);
  }
  // une fois (2026-11-22, accord de Jean-Luc) : le reste de la carte indienne, prix d'achat + 30 %
  const RC = await store.get('rubriques/saveurs-du-monde');
  if (RC && !RC.indienCarte) {
    const prods = (await store.list('produits')).map(d => d.data).filter(Boolean);
    const vus = new Set(prods.map(p => p.slug)); let ordre = Math.max(0, ...prods.map(p => p.ordre || 0)) + 1, nc = 0;
    for (const [rangement, titre, cout, unite = 'portion', photo] of CARTE_INDIEN) {
      const slug = slugify(titre + ' indien');
      if (vus.has(slug)) continue; vus.add(slug);
      const src = photo || AMBIANCE_INDIEN[nc % AMBIANCE_INDIEN.length];
      await store.set('produits/' + slug, { id: slug, slug, rubrique: 'saveurs-du-monde', autresRubriques: [], sous: 'buffet-indien', rangement, titre, prixCents: Math.ceil(cout * 1.3 / 10) * 10, coutCents: cout, unite, min: 5, extrait: `${titre} : spécialité indienne préparée par notre chef et livrée prête à servir.`, description: [], photos: [{ src, alt: titre }], photoAmbiance: !photo, video: null, groupes: [], variantes: [], sections: [], details: [], regles: { personnel: 'service', packs: true }, ordre: ordre++, statut: 'visible', maison: true, tva: 10, allergenes: [], aCompleter: false });
      nc++;
    }
    // titres trop longs (« Chicken tikka massala : poulet mariné… ») : le nom en titre, la description en texte
    for (const p of prods) {
      if (p.rubrique !== 'saveurs-du-monde' || (p.groupes || []).length || !/\s:\s/.test(p.titre || '')) continue;
      const [nom, ...reste] = p.titre.split(/\s:\s/); const desc = reste.join(' : ').trim();
      if (!nom || !desc || nom.length > 60) continue;
      await store.set('produits/' + p.id, { ...p, titre: nom.trim(), extrait: desc.charAt(0).toUpperCase() + desc.slice(1), photos: (p.photos || []).map(f => ({ ...f, alt: nom.trim() })) });
    }
    await store.set('rubriques/saveurs-du-monde', { ...(await store.get('rubriques/saveurs-du-monde')), indienCarte: true });
    if (nc) log.log?.(`[demarrage] ${nc} plats indiens ajoutés (carte complète)`);
  }
  // une fois (2026-11-22, demande de Jean-Luc) : prix des plats libanais à l'unité = prix de référence + 30 %, plus aucun « Sur devis ».
  // Le prix de référence est rangé dans « coût de revient » (jamais affiché). Un prix déjà saisi dans le back-office n'est pas touché.
  const RLp = await store.get('rubriques/saveurs-du-monde');
  if (RLp && !RLp.libanaisPrix) {
    const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let nl = 0;
    for (const d of await store.list('produits')) {
      const p = d.data;
      if (!p || p.sous !== 'buffet-libanais' || (p.groupes || []).length || p.prixCents) continue;
      const ligne = PRIX_LIBANAIS.find(([re]) => re.test(net(p.titre).trim()));
      if (!ligne) continue;
      const cout = ligne[1];
      await store.set('produits/' + d.id, { ...p, prixCents: Math.ceil(Math.round(cout * 1.3) / 10) * 10, coutCents: cout, aCompleter: false });
      nl++;
    }
    await store.set('rubriques/saveurs-du-monde', { ...(await store.get('rubriques/saveurs-du-monde')), libanaisPrix: true });
    if (nl) log.log?.(`[demarrage] ${nl} prix du Buffet libanais posés (référence + 30 %)`);
  }
  // une fois (Jean-Luc, 2026-11-22) : plus de « Sur devis » sur la carte Magnolia. Menu enfant 14,90 € TTC par enfant ;
  // repas servi à table 49,90 € TTC par personne (entrée + plat + dessert de la carte, fromage, softs et café), personnel de service en plus.
  const RCp = await store.get('site/reglages');
  if (RCp && !RCp.carteSansDevis) {
    const me = await store.get('produits/menu-enfant-3-a-12-ans');
    if (me && me.prixCents == null) await store.set('produits/menu-enfant-3-a-12-ans', { ...me, prixCents: 1490, prixTexte: null, unite: 'enfant', aCompleter: false });
    const rt = await store.get('produits/repas-servi-a-table-elabore-par-le-chef');
    if (rt && rt.prixCents == null) await store.set('produits/repas-servi-a-table-elabore-par-le-chef', { ...rt, prixCents: 4990, prixTexte: null, unite: 'personne', regles: { ...(rt.regles || {}), personnel: 'service' }, aCompleter: false });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteSansDevis: true });
  }
  // une fois (Jean-Luc, 2026-11-22) : « Brochettes de Chich Taouk », 1 portion = 4 brochettes ; beignets libanais, 1 portion = 2 pièces
  const RLq = await store.get('rubriques/saveurs-du-monde');
  if (RLq && !RLq.libanaisPortions) {
    const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    for (const d of await store.list('produits')) {
      const p = d.data;
      if (!p || p.sous !== 'buffet-libanais' || (p.groupes || []).length || p.contenuPortion) continue;
      const t = net(p.titre);
      if (/^(morceaux de |brochettes? de )?chich taouk/.test(t)) {
        await store.set('produits/' + d.id, { ...p, titre: 'Brochettes de Chich Taouk', contenuPortion: '4 brochettes', photos: (p.photos || []).map(f => ({ ...f, alt: 'Brochettes de Chich Taouk' })) });
      } else if (/^(kebbe|fatayer|sanbousek|falafel|rikakat|manakish|roulade)/.test(t)) {
        await store.set('produits/' + d.id, { ...p, contenuPortion: '2 pièces' });
      }
    }
    await store.set('rubriques/saveurs-du-monde', { ...(await store.get('rubriques/saveurs-du-monde')), libanaisPortions: true });
  }
  // bandeaux photo des spécialités choisis par Jean-Luc (2026-11-22) : appliqués une fois par spécialité, modifiables ensuite dans le back-office
  const RS = await store.get('rubriques/saveurs-du-monde');
  if (RS) {
    const faits = new Set(RS.bandeauxSpeFaits || []);
    const a_faire = Object.keys(BANDEAUX_SPE).filter(k => !faits.has(k));
    if (a_faire.length) {
      const sous = (RS.sous || []).map(x => a_faire.includes(x.slug) ? { ...x, bandeauPhoto: BANDEAUX_SPE[x.slug], bandeauVideo: '' } : x);
      await store.set('rubriques/saveurs-du-monde', { ...RS, sous, bandeauxSpeFaits: [...faits, ...a_faire] });
    }
  }
  // une fois (2026-11-22, demande de Jean-Luc) : section « Nos accompagnements à l'unité » ; riz, gratins, alloco… y passent
  const RA = await store.get('rubriques/saveurs-du-monde');
  if (RA && !RA.accompInit) {
    let na = 0;
    const tous = await store.list('produits');
    const titres = new Set(tous.map(d => d.data && (d.data.sous + '|' + d.data.titre)));
    for (const d of tous) {
      const p = d.data;
      // doublons « … : + 1,50 € HT/personne. » créés par erreur à partir des suppléments d'un menu
      if (p?.aCompleter && SUPPL.test(p.titre || '')) {
        const net = p.titre.replace(SUPPL, '');
        if (titres.has(p.sous + '|' + net)) { await store.delete('produits/' + d.id); continue; }
        p.titre = net; p.extrait = `${net} : préparé par notre chef et livré prêt à servir.`; p.photos = (p.photos || []).map(f => ({ ...f, alt: net }));
        await store.set('produits/' + d.id, p);
      }
      if (!p || p.rubrique !== 'saveurs-du-monde' || (p.groupes || []).length) continue;
      const t = String(p.titre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!ACCOMP.test(t) || !['plats', 'divers', 'accompagnements', '', undefined, null].includes(p.rangement)) continue;
      const next = { ...p, rangement: 'accompagnements' };
      if (p.sous === 'buffet-indien' && /^riz kashmiri$/i.test(p.titre)) { next.titre = 'Riz cachemiri'; next.extrait = 'Riz cachemiri : préparé par notre chef et livré prêt à servir.'; }
      await store.set('produits/' + d.id, next); na++;
    }
    await store.set('rubriques/saveurs-du-monde', { ...RA, accompInit: true });
    if (na) log.log?.(`[demarrage] ${na} accompagnements rangés dans « Nos accompagnements à l'unité »`);
  }
  // une fois : textes des pages d'atterrissage, pour qu'ils apparaissent (et se modifient) dans le back-office
  for (const d of await store.list('rubriques')) {
    const r = d.data;
    if (!r?.sous?.length || r.speTextes) continue;
    const sous = r.sous.map(x => SPE_TEXTES[x.slug] ? { ...x, titrePage: x.titrePage || SPE_TEXTES[x.slug][0], chapo: x.chapo || SPE_TEXTES[x.slug][1] } : x);
    await store.set('rubriques/' + d.id, { ...r, sous, speTextes: true });
  }
  // une fois (2026-11-22, demande de Jean-Luc) : plus de « à Paris et en Île-de-France » dans les bandeaux et titres (livraison aussi en province)
  const IDF = /,?\s*(à|a) Paris et (en |l’|l')?Île-de-France|\s*en Île-de-France(?=[.,]|$)/g;
  const net = t => typeof t === 'string' ? t.replace(IDF, '').replace(/\s+\./g, '.').trim() : t;
  for (const d of await store.list('rubriques')) {
    const r = d.data; if (!r || r.sansIdf) continue;
    const sous = (r.sous || []).map(x => ({ ...x, titrePage: net(x.titrePage), chapo: net(x.chapo), seoTitre: net(x.seoTitre), seoDescription: net(x.seoDescription) }));
    await store.set('rubriques/' + d.id, { ...r, titrePage: net(r.titrePage), chapo: net(r.chapo), seoTitre: net(r.seoTitre), seoDescription: net(r.seoDescription), sous, sansIdf: true });
  }
  // une fois (2026-11-23, demande de Jean-Luc) : page Buffet antillais, « la cuisine des îles par Magnolia Traiteur » (et non « par Le Traiteur Antillais »)
  const parMagnolia = t => typeof t === 'string' ? t.replace(/par le Traiteur Antillais/gi, 'par Magnolia Traiteur') : t;
  for (const d of await store.list('rubriques')) {
    const r = d.data; if (!r?.sous?.length || r.antillaisMagnolia) continue;
    const sous = r.sous.map(x => ({ ...x, titrePage: parMagnolia(x.titrePage), chapo: parMagnolia(x.chapo), seoTitre: parMagnolia(x.seoTitre), seoDescription: parMagnolia(x.seoDescription), introTitre: parMagnolia(x.introTitre), introTexte: parMagnolia(x.introTexte) }));
    await store.set('rubriques/' + d.id, { ...r, sous, antillaisMagnolia: true });
  }
  // une fois (2026-11-22, choix de Jean-Luc) : nouvelles photos des bandeaux Boutique (coupes qu'on remplit) et La maison (maître d'hôtel)
  const RB = await store.get('site/reglages');
  if (RB && !RB.bandeaux2) {
    const bx = { ...(RB.bandeaux || {}) };
    if (!bx.boutique?.photo || bx.boutique.photo === '/site/c/cocktail10-client-20261104.jpg.webp') bx.boutique = { ...(bx.boutique || {}), photo: '/site/c/accueil/website-home-cocktail-20261110.webp' };
    if (!bx.maison?.photo || bx.maison.photo === RB.accueil?.photoMaison) bx.maison = { ...(bx.maison || {}), photo: '/site/c/personnel80-client-20261102.webp.webp' };
    await store.set('site/reglages', { ...RB, bandeaux: bx, bandeaux2: true });
  }
  // une fois (2026-11-22, demande de Jean-Luc) : plus de « Prix TTC, devis gratuit » dans les bandeaux (déjà dit plus bas)
  const DEVIS = /\s*Prix TTC( par personne)?,? devis gratuit\.?/gi;
  const sd = t => typeof t === 'string' ? t.replace(DEVIS, '').replace(/,? prix TTC,/g, ',').trim() : t;
  for (const d of await store.list('rubriques')) {
    const r = d.data; if (!r || r.sansDevis) continue;
    const sous = (r.sous || []).map(x => ({ ...x, chapo: sd(x.chapo), seoDescription: sd(x.seoDescription) }));
    await store.set('rubriques/' + d.id, { ...r, chapo: sd(r.chapo), sous, sansDevis: true });
  }
  const R0 = await store.get('site/reglages');
  if (R0 && !R0.sansDevis) {
    const bandeaux = Object.fromEntries(Object.entries(R0.bandeaux || {}).map(([k, b]) => [k, { ...b, chapo: sd(b.chapo) }]));
    await store.set('site/reglages', { ...R0, bandeaux, sansDevis: true });
  }
  const R = await store.get('site/reglages');
  if (R && !R.sansIdf) {
    const bandeaux = Object.fromEntries(Object.entries(R.bandeaux || {}).map(([k, b]) => [k, { ...b, titre: net(b.titre), chapo: net(b.chapo) }]));
    const sousTitre = R.accueil?.sousTitre === 'Traiteur, animations et lieux de réception, à Paris et en Île-de-France.' ? 'Traiteur, animations et lieux de réception pour tous vos événements.' : net(R.accueil?.sousTitre);
    await store.set('site/reglages', { ...R, bandeaux, accueil: { ...(R.accueil || {}), sousTitre }, sansIdf: true });
  }
  // une fois (2026-11-22, demande de Jean-Luc) : allergènes probables cochés sur chaque fiche qui n'en a pas encore,
  // d'après le nom et la composition (dans le doute, on coche). Affichés tout de suite ; à faire relire (tableau Excel).
  const RA2 = await store.get('site/reglages');
  if (RA2 && !RA2.allergenesInit) {
    const { allergenesProbables } = require('./allergenes');
    let na = 0;
    for (const d of await store.list('produits')) {
      const x = d.data;
      if (!x || (x.allergenes || []).length) continue;
      const a = allergenesProbables(x);
      if (!a.length) continue;
      await store.set('produits/' + d.id, { ...x, allergenes: a, allergenesAuto: true });
      na++;
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), allergenesInit: true });
    if (na) log.log?.(`[demarrage] allergènes proposés sur ${na} fiches`);
  }
  // une fois (2026-11-22, demande de Jean-Luc) : « Boissons & petits-déjeuners » devient deux univers.
  // « Boissons » reste à sa place ; « Petits-déjeuners » est créé tout à la fin de Nos univers, avec les formules café et petit-déjeuner.
  const RBo = await store.get('rubriques/boissons');
  if (RBo && !RBo.petitsDejInit) {
    const rubs = (await store.list('rubriques')).map(d => d.data).filter(Boolean);
    const PHOTO_PDJ = '/site/c/petits-dejeuners/buffet-petit-dejeuner.webp';
    if (!rubs.some(r => r.slug === 'petits-dejeuners')) {
      await store.set('rubriques/petits-dejeuners', {
        slug: 'petits-dejeuners', nom: 'Petits-déjeuners', ordre: Math.max(0, ...rubs.map(r => r.ordre || 0)) + 1, photo: PHOTO_PDJ, photoAccueil: PHOTO_PDJ,
        chapo: 'Pause café, petit-déjeuner classique ou luxe : de quoi bien commencer la journée de vos invités, livré et installé.', accroche: '', statut: 'visible', tva: 10,
      });
    }
    let np = 0;
    for (const d of await store.list('produits')) {
      const x = d.data;
      if (!x || x.rubrique !== 'boissons' || !PDJ.test(x.titre)) continue;
      await store.set('produits/' + d.id, { ...x, rubrique: 'petits-dejeuners', photos: x.photos?.length ? x.photos : [{ src: PHOTO_PDJ, alt: x.titre }] });
      np++;
    }
    await store.set('rubriques/boissons', { ...RBo, nom: RBo.nom === 'Boissons & petits-déjeuners' ? 'Boissons' : RBo.nom, petitsDejInit: true });
    if (np) log.log?.(`[demarrage] ${np} prestations rangées dans « Petits-déjeuners »`);
  }

  /* « Saveurs du grand large » devient « Plateaux de fruits de mer » (demande de Jean-Luc, 2026-11-22).
     L'adresse /grand-large ne change pas (liens et publicités déjà en place). Une seule fois. */
  const RGL = await store.get('rubriques/grand-large');
  if (RGL && !RGL.nomFruitsDeMer) {
    const vieux = t => !t || /grand large/i.test(t);
    await store.set('rubriques/grand-large', {
      ...RGL,
      nom: vieux(RGL.nom) ? 'Plateaux de fruits de mer' : RGL.nom,
      titrePage: RGL.titrePage && !vieux(RGL.titrePage) ? RGL.titrePage : '',
      seoTitre: RGL.seoTitre && !vieux(RGL.seoTitre) ? RGL.seoTitre : '',
      nomFruitsDeMer: true,
    });
  }

  /* paragraphe de présentation avant « Nos buffets » (essai demandé par Jean-Luc sur le buffet libanais, 2026-11-22).
     Posé une fois par spécialité, modifiable ensuite dans le back-office. */
  const RI2 = await store.get('rubriques/saveurs-du-monde');
  if (RI2 && (RI2.sous || []).some(x => INTROS_SPE[x.slug] && !x.introPosee)) {
    const sous = RI2.sous.map(x => INTROS_SPE[x.slug] && !x.introPosee ? { ...x, introTitre: x.introTitre || INTROS_SPE[x.slug][0], introTexte: x.introTexte || INTROS_SPE[x.slug][1], introPosee: true } : x);
    await store.set('rubriques/saveurs-du-monde', { ...RI2, sous });
  }

  /* phrase d'aide de la recherche (Jean-Luc, 2026-11-22) : « Écrivez ou dites… » ; une fois, si elle avait été enregistrée */
  const RAi = await store.get('site/reglages');
  if (RAi && !RAi.aideEcrivez) {
    const a = RAi.accueil?.aideRecherche;
    const accueil = typeof a === 'string' && a.startsWith('Dites un mot') ? { ...RAi.accueil, aideRecherche: 'Écrivez ou d' + a.slice(1) } : RAi.accueil;
    await store.set('site/reglages', { ...RAi, ...(accueil ? { accueil } : {}), aideEcrivez: true });
  }

  /* Lassi (buffet indien) : nouvelle photo sans texte et choix des parfums, au moins 5 par parfum (Jean-Luc, 2026-11-22). Une fois. */
  for (const d of await store.list('produits')) {
    const x = d.data;
    if (!x || x.lassiParfums || !/^lassi\b/i.test(x.titre || '')) continue;
    await store.set('produits/' + d.id, {
      ...x,
      titre: 'Lassi : boisson traditionnelle au yaourt',
      extrait: 'Boisson indienne fraîche au yaourt, au parfum de votre choix : fraise, vanille ou banane.',
      photos: [{ src: PHOTO_LASSI, alt: 'Lassi' }],
      groupes: [{ id: 'parfums', titre: 'Vos parfums', singulier: 'parfum', mode: 'quantites', minParVariete: 5, facultatif: false,
        aide: 'Indiquez le nombre de lassis pour chaque parfum : au moins 5 par parfum choisi. Exemple pour 10 : 5 fraise et 5 banane, ou 10 vanille.',
        options: ['Fraise', 'Vanille', 'Banane'].map(l => ({ id: l.toLowerCase(), label: l, supCents: 0 })) }],
      lassiParfums: true,
    });
  }

  /* portrait de Romain Goujon envoyé par Jean-Luc (2026-11-22). Une fois, si sa fiche n'a pas déjà une photo. */
  const REq = await store.get('site/reglages');
  if (REq && !REq.photoRomain) {
    const equipe = (REq.equipe || []).map(e => /romain/i.test(e.nom || '') && !e.photo ? { ...e, photo: '/site/equipe/romain-goujon.webp' } : e);
    await store.set('site/reglages', { ...REq, equipe, photoRomain: true });
  }

  /* Hermine en noir et blanc sur fond blanc, à droite de Romain (Jean-Luc, 2026-11-22). Une fois. */
  const RHe = await store.get('site/reglages');
  if (RHe && !RHe.photoHermine) {
    let equipe = (RHe.equipe || []).map(e => /hermine/i.test(e.nom || '') && (!e.photo || e.photo === '/site/c/equipe/hermine.webp') ? { ...e, photo: '/site/equipe/hermine-nb.webp' } : e);
    const h = equipe.find(e => /hermine/i.test(e.nom || '')) || REGLAGES_DEFAUT.equipe.find(e => /hermine/i.test(e.nom));
    const autres = equipe.filter(e => e !== h), iR = autres.findIndex(e => /romain/i.test(e.nom || ''));
    if (h && iR >= 0) equipe = [...autres.slice(0, iR + 1), h, ...autres.slice(iR + 1)];
    await store.set('site/reglages', { ...RHe, equipe, photoHermine: true });
  }

  /* « Buffet libanais · 8 mezzés » devient « Buffet libanais » (Jean-Luc, 2026-11-22). Une fois. */
  const RLb = await store.get('rubriques/saveurs-du-monde');
  if (RLb && !RLb.libanaisCourt) {
    const sous = (RLb.sous || []).map(x => x.slug === 'buffet-libanais' && /mezz/i.test(x.nom || '') ? { ...x, nom: 'Buffet libanais' } : x);
    await store.set('rubriques/saveurs-du-monde', { ...RLb, sous, libanaisCourt: true });
  }

  /* doublons antillais / africain fusionnés (Jean-Luc, 2026-11-22) : on garde la fiche africaine, rattachée aussi à l'antillais ;
     l'autre est masquée et son adresse renvoie vers la fiche gardée. Une fois. */
  const RF = await store.get('site/reglages');
  if (RF && !RF.doublonsFusionnes) {
    let nf = 0;
    for (const [garde, ...autres] of DOUBLONS) {
      const g = await store.get('produits/' + garde);
      if (!g) continue;
      const sous2 = new Set(g.autresSous || []), rubs2 = new Set(g.autresRubriques || []);
      for (const a of autres) {
        const x = await store.get('produits/' + a);
        if (!x || x.fusionneDans) continue;
        if (x.sous && x.sous !== g.sous) sous2.add(x.sous);
        if (x.rubrique !== g.rubrique) rubs2.add(x.rubrique);
        await store.set('produits/' + a, { ...x, statut: 'masque', fusionneDans: garde });
        nf++;
      }
      await store.set('produits/' + garde, { ...g, autresSous: [...sous2], autresRubriques: [...rubs2] });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), doublonsFusionnes: true });
    if (nf) log.log?.(`[demarrage] ${nf} doublons fusionnés`);
  }

  /* photos ajoutées aux fiches qui n'en avaient pas (Jean-Luc, 2026-11-22). Une fois par fiche, si elle est toujours sans photo. */
  for (const [re, src, alt] of PHOTOS_FICHES) {
    for (const d of await store.list('produits')) {
      const x = d.data;
      if (!x || !re.test(x.titre || '') || (x.photos || []).length || x.photoAjoutee) continue;
      await store.set('produits/' + d.id, { ...x, photos: [{ src, alt }], photoAjoutee: true });
    }
  }

  /* vraies photos à la place des photos qui font « IA » (Jean-Luc, 2026-11-22) : posées une fois par fiche et par version,
     modifiables ensuite dans le back-office. Sources dans data/credits-photos-univers.md. */
  for (const [slug, ver, photos] of VRAIES_PHOTOS) {
    const x = await store.get('produits/' + slug);
    if (!x || (x.vraiesPhotos || []).includes(ver)) continue;
    await store.set('produits/' + slug, { ...x, photos: photos.map(([src, alt]) => ({ src, alt })), vraiesPhotos: [...(x.vraiesPhotos || []), ver] });
  }

  /* Buffet antillais — Plat seul (Jean-Luc, 2026-11-23) : plus de vidéo dans la galerie, la photo du colombo de poulet en premier. Une fois. */
  {
    const x = await store.get('produits/buffet-antillais-plat-seul');
    if (x && !x.sansVideo) {
      const COLOMBO = '/site/c/antilles-site/colombo-de-poulet-1-20261101.webp.webp';
      const photos = x.photos || [];
      const c = photos.find(ph => ph.src === COLOMBO);
      const { video, ...reste } = x;
      await store.set('produits/buffet-antillais-plat-seul', { ...reste, photos: c ? [c, ...photos.filter(ph => ph !== c)] : photos, sansVideo: true });
    }
  }

  for (const [slug, src, alt] of PHOTOS_BUFFETS_EN_TETE) {
    const x = await store.get('produits/' + slug);
    if (!x || (x.photoBuffet || '') === src) continue;
    await store.set('produits/' + slug, { ...x, photos: [{ src, alt }, ...(x.photos || []).filter(ph => ph.src !== src)], photoBuffet: src });
  }

  /* plateaux de sushis : compositions, prix et photos du site actuel magnoliatraiteur.fr/plateaux-de-sushis (Jean-Luc, 2026-11-22).
     Une fois. Le plateau 80 pièces n'existe plus et le « Plateau de 75 sushis » des coffrets faisait doublon : masqués, leur adresse renvoie au grand plateau. */
  const RSu = await store.get('site/reglages');
  if (RSu && !RSu.sushisSiteActuel) {
    const modele = await store.get('produits/plateau-japonais-75-pieces');
    if (modele) {
      for (const [i, x] of PLATEAUX_SUSHIS.entries()) {
        const avant = (await store.get('produits/' + x.slug)) || { ...modele, id: x.slug, slug: x.slug, createdAt: new Date().toISOString() };
        await store.set('produits/' + x.slug, {
          ...avant, titre: x.titre, prixCents: x.prixCents, prixTexte: null, unite: 'plateau', min: 1, minimumTexte: null,
          extrait: `${x.pieces} pièces · ${x.pour}`,
          description: [`${x.pieces} pièces, ${x.pour}. Si vous êtes plus nombreux, ajoutez des plateaux.`, 'Préparé le jour de votre événement par nos chefs, avec des ingrédients frais. Baguettes, sauces soja salée et sucrée et wasabi sont offerts, en proportion de la commande.'],
          sections: [{ titre: `Composition (${x.pieces} pièces)`, items: x.compo }],
          photos: [{ src: x.photo, alt: x.titre }], statut: 'visible', sous: 'specialites-japonaises', rubrique: 'saveurs-du-monde', ordre: 51 + i,
          autresRubriques: x.slug === 'plateau-japonais-75-pieces' ? [...new Set([...(avant.autresRubriques || []), 'coffrets-plateaux'])] : (avant.autresRubriques || []),
          fusionneDans: undefined, aCompleter: false,
        });
      }
      for (const slug of ['plateau-japonais-80-pieces', 'plateau-de-75-sushis']) {
        const x = await store.get('produits/' + slug);
        if (x) await store.set('produits/' + slug, { ...x, statut: 'masque', fusionneDans: 'plateau-japonais-75-pieces' });
      }
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), sushisSiteActuel: true });
  }
  /* photos de sushis : on remplace celles encore prises sur l'ancien site par les copies sans logo (une fois) */
  const RSp = await store.get('site/reglages');
  if (RSp && !RSp.sushisSansLogo) {
    for (const x of PLATEAUX_SUSHIS) {
      const p = await store.get('produits/' + x.slug);
      if (p && (p.photos || []).some(ph => String(ph.src || '').startsWith(SUSHI_ANCIENNE_ADRESSE))) {
        await store.set('produits/' + x.slug, { ...p, photos: p.photos.map(ph => String(ph.src || '').startsWith(SUSHI_ANCIENNE_ADRESSE) ? { ...ph, src: x.photo } : ph) });
      }
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), sushisSansLogo: true });
  }
  /* chiffres de l'accueil (Jean-Luc, 2026-11-22) : « 800 / plus de 800 prestations par an » à la place du nombre de prestations en ligne, et « Sur Google, plus de 650 avis ». Une fois. */
  const RSh = await store.get('site/reglages');
  if (RSh && !RSh.chiffre800) {
    const ch = (RSh.accueil?.chiffres || []).map(x => /prestations en ligne/i.test(x.label || '') ? { valeur: '800', label: 'plus de 800 prestations par an' }
      : /sur google/i.test(x.label || '') ? { ...x, label: 'Sur Google, plus de 650 avis' } : x);
    const ag = RSh.avisGoogle && /800/.test(RSh.avisGoogle.nombre || '') ? { ...RSh.avisGoogle, nombre: 'plus de 650' } : RSh.avisGoogle;
    await store.set('site/reglages', { ...RSh, avisGoogle: ag, accueil: { ...(RSh.accueil || {}), chiffres: ch }, chiffre800: true });
  }
  /* bulles de l'accueil : nouvel ordre de Jean-Luc (2026-11-23). Une fois ; modifiables ensuite dans Photos & textes. */
  const RSb = await store.get('site/reglages');
  if (RSb && !RSb.bullesAccueil3) {
    await store.set('site/reglages', { ...RSb, accueil: { ...(RSb.accueil || {}), suggestions: SUGGESTIONS_ACCUEIL }, bullesAccueil3: true });
  }
  /* prix corrigé par Jean-Luc (2026-11-22) : le brouillon avait repris le prix de « Entrées + plat » (21,90 €). Une fois. */
  const RSc = await store.get('site/reglages');
  if (RSc && !RSc.chinois13Prix) {
    const p = await store.get('produits/buffet-chinois-assortiment-13-pieces-salees');
    if (p && p.prixCents === 2190) await store.set('produits/buffet-chinois-assortiment-13-pieces-salees', { ...p, prixCents: 1490 });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), chinois13Prix: true });
  }

  /* photo de La maison : soirée corporate à la place du flambage (Jean-Luc, 2026-11-22). Une fois ; modifiable ensuite. */
  const RSm = await store.get('site/reglages');
  if (RSm && !RSm.photoMaisonCorporate) {
    await store.set('site/reglages', { ...RSm, accueil: { ...(RSm.accueil || {}), photoMaisonIntro: PHOTO_MAISON_INTRO }, photoMaisonCorporate: true });
  }

  /* vignette Boissons : barman qui sert un cocktail à la place de la photo du bar (Jean-Luc, 2026-11-22). Une fois. */
  const RSv = await store.get('site/reglages');
  if (RSv && !RSv.vignetteBoissonsBarman) {
    const b = await store.get('rubriques/boissons');
    if (b && (!b.photoAccueil || String(b.photoAccueil).includes('18853331') || (RSv.vignettesFaites || []).includes('boissons'))) await store.set('rubriques/boissons', { ...b, photoAccueil: VIGNETTES_UNIVERS.boissons });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), vignetteBoissonsBarman: true });
  }

  /* plus aucune page de brochure ni photo avec filigrane dans les fiches (Jean-Luc, 2026-11-22).
     Une fois : retire les pages de brochure (/pages-digital/) ; une fiche qui n'avait que ça reçoit une vraie photo du sujet ;
     les photos avec la marque d'un autre site sont remplacées. Les photos ajoutées ensuite dans le back-office ne sont pas touchées. */
  const RSbr = await store.get('site/reglages');
  if (RSbr && !RSbr.sansBrochure) {
    for (const { id, data: pr } of await store.list('produits')) {
      const avant = pr.photos || [];
      let ph = avant.map(x => PHOTOS_SANS_FILIGRANE[x.src] ? { src: pexels(PHOTOS_SANS_FILIGRANE[x.src][0]), alt: PHOTOS_SANS_FILIGRANE[x.src][1] } : x)
        .filter(x => !/\/pages-digital\/|\/c\/pages\//.test(String(x.src || '')));
      if (ph.length > 1) ph = ph.filter(x => !PHOTOS_A_RETIRER.includes(x.src));
      const vraie = PHOTOS_SANS_BROCHURE[pr.slug || id];
      if (vraie && !ph.some(x => x.src === pexels(vraie[0]))) ph = [{ src: pexels(vraie[0]), alt: vraie[1] }, ...ph];
      if (!ph.length) continue; /* jamais de fiche vidée : on garde l'ancienne photo plutôt que rien */
      if (JSON.stringify(ph) !== JSON.stringify(avant)) await store.set('produits/' + id, { ...pr, photos: ph });
    }
    const brochure = x => /\/pages-digital\/|\/c\/pages\//.test(String((x && x.src) || x || ''));
    for (const { id, data: l } of await store.list('lieux')) {
      const ph = (l.photos || []).filter(x => !brochure(x));
      if (ph.length && ph.length !== (l.photos || []).length) await store.set('lieux/' + id, { ...l, photos: ph });
    }
    for (const { id, data: r } of await store.list('rubriques')) {
      if (brochure(r.photo) && r.photoAccueil && !brochure(r.photoAccueil)) await store.set('rubriques/' + id, { ...r, photo: r.photoAccueil });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), sansBrochure: true });
  }

  /* « Cocktails & buffets français » + paragraphe de présentation (Jean-Luc, 2026-11-22). Une fois : modifiable ensuite dans le back-office. */
  const RCb = await store.get('site/reglages');
  if (RCb && !RCb.cocktailsFrancais) {
    const cb = await store.get('rubriques/cocktails-buffets');
    if (cb) await store.set('rubriques/cocktails-buffets', { ...cb,
      nom: !cb.nom || cb.nom === 'Cocktails & buffets' ? 'Cocktails & buffets français' : cb.nom,
      introTitre: cb.introTitre || INTRO_COCKTAILS[0], introTexte: cb.introTexte || INTRO_COCKTAILS[1] });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), cocktailsFrancais: true });
  }

  /* Buffets : chaque entrée, plat ou dessert choisi se commande en portions, 5 minimum, total = nombre de personnes
     (Jean-Luc, 2026-11-22). Une fois. Pas les accompagnements, ni les choix uniques ou « exactement N » (mezzés), ni les groupes facultatifs. */
  const RPo = await store.get('site/reglages');
  if (RPo && !RPo.buffetsPortions) {
    const sans = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const { id, data: p } of await store.list('produits')) {
      if (!/personne/.test(p.unite || '') || !(p.groupes || []).length || rangementDe(p) !== 'buffets') continue;
      let chg = false;
      const groupes = p.groupes.map(g => {
        const t = sans(g.titre);
        if (g.mode || g.exact || g.facultatif || g.max === 1 || (g.options || []).length < 2) return g;
        if (/accompagn|sauce|boisson|salade|pain|riz|mezz/.test(t) || /pieces/.test(sans(p.titre))) return g; /* mezzés et assortiments de pièces : on choisit des variétés, pas des portions */
        const sg = /dessert/.test(t) ? 'dessert' : /entree/.test(t) ? 'entrée' : /plat/.test(t) ? 'plat' : null;
        if (!sg) return g;
        chg = true;
        return { ...g, mode: 'quantites', minParVariete: 5, singulier: sg };
      });
      if (chg) await store.set('produits/' + id, { ...p, groupes });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), buffetsPortions: true });
  }

  /* La carte Magnolia en sections : Entrées, Plats, Plateau de fromages, Desserts (Jean-Luc, 2026-11-22).
     Pas d'accompagnements : les plats sont déjà accompagnés. Une fois ; chaque fiche reste modifiable (liste « Section »). */
  const RCm = await store.get('site/reglages');
  if (RCm && !RCm.carteSections) {
    const cm = await store.get('rubriques/carte-magnolia');
    if (cm) await store.set('rubriques/carte-magnolia', { ...cm, parSections: true, titresSections: { entrees: 'Nos entrées', plats: 'Nos plats', fromages: 'Nos fromages', desserts: 'Nos desserts', divers: 'Menus et service à table', ...(cm.titresSections || {}) } });
    const sans = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const { id, data: p } of await store.list('produits')) {
      if (p.rubrique !== 'carte-magnolia' || p.rangement) continue;
      const t = sans(p.titre);
      const k = /fromage|trio affine/.test(t) ? 'fromages' : /carpaccio|tartare|foie gras|salade|veloute|terrine|entree/.test(t) ? 'entrees'
        : /paris-brest|millefeuille|opera|entremets|douceur|tarte|dessert|fondant|mousse|gateau/.test(t) ? 'desserts' : /menu|repas|service/.test(t) ? 'divers' : 'plats';
      await store.set('produits/' + id, { ...p, rangement: k });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteSections: true });
  }

  /* La carte Magnolia : titres « Nos entrées, Nos plats, Nos fromages, Nos desserts » (Jean-Luc, 2026-11-23).
     Une fois ; on ne remplace que les anciens titres par défaut, un titre changé au back-office reste. */
  const RCm2 = await store.get('site/reglages');
  if (RCm2 && !RCm2.carteSections2) {
    const cm = await store.get('rubriques/carte-magnolia');
    if (cm) {
      const T = { ...(cm.titresSections || {}) }, anciens = { entrees: 'Les entrées', plats: 'Les plats', fromages: 'Plateau de fromages', desserts: 'Les desserts' };
      const nouveaux = { entrees: 'Nos entrées', plats: 'Nos plats', fromages: 'Nos fromages', desserts: 'Nos desserts' };
      for (const k in nouveaux) if (!T[k] || T[k] === anciens[k]) T[k] = nouveaux[k];
      await store.set('rubriques/carte-magnolia', { ...cm, parSections: true, titresSections: T });
    }
    for (const { id, data: p } of await store.list('produits')) {
      if (p.rubrique === 'carte-magnolia' && /fromage|trio affin/i.test(String(p.titre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && p.rangement !== 'fromages') await store.set('produits/' + id, { ...p, rangement: 'fromages' });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteSections2: true });
  }

  /* Vignette « La carte Magnolia » de l'accueil : souris d'agneau confite à la place du carpaccio sur fond vert (Jean-Luc, 2026-11-23).
     Une fois, et seulement si la photo de la vignette n'a pas été changée au back-office. */
  const RCm3 = await store.get('site/reglages');
  if (RCm3 && !RCm3.carteVignette2) {
    const cm = await store.get('rubriques/carte-magnolia'), ancienne = /carpaccio-de-tomates/;
    if (cm && (!cm.photoAccueil || ancienne.test(cm.photoAccueil))) await store.set('rubriques/carte-magnolia', { ...cm, photoAccueil: '/site/c/carte-magnolia-photos/souris-dagneau-confite.webp.webp' });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteVignette2: true });
  }

  /* Ordre des vignettes d'univers de l'accueil (Jean-Luc, 2026-11-23) : la nourriture d'abord, « Traiteur végétarien et vegan »
     juste après « Coffrets & plateaux », « Petits-déjeuners » juste après « Animations sucrées », puis ce qui n'est pas de la
     nourriture (indispensables, personnel, musique, lieux) à la fin. Le reste garde son ordre. Une fois : réglable ensuite au back-office (champ « Ordre »). */
  const ROv = await store.get('site/reglages');
  if (ROv && !ROv.ordreUnivers2) {
    const rubs = (await store.list('rubriques')).sort((a, b) => (a.data.ordre ?? 99) - (b.data.ordre ?? 99));
    const APRES = { 'traiteur-vegetarien-vegan': 'coffrets-plateaux', 'petits-dejeuners': 'douceurs' };
    const FIN = ['indispensables', 'personnel', 'musique-animations', 'lieux'];
    let L = rubs.filter(r => !APRES[r.id] && !FIN.includes(r.id));
    for (const [slug, apres] of Object.entries(APRES)) {
      const r = rubs.find(x => x.id === slug); if (!r) continue;
      const i = L.findIndex(x => x.id === apres); L.splice(i < 0 ? L.length : i + 1, 0, r);
    }
    L = [...L, ...FIN.map(f => rubs.find(x => x.id === f)).filter(Boolean)];
    for (const [i, r] of L.entries()) if (r.data.ordre !== i + 1) await store.set('rubriques/' + r.id, { ...r.data, ordre: i + 1 });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), ordreUnivers2: true });
  }

  /* Buffet chinois à l'unité : minimum 5 (Jean-Luc, 2026-11-23, « 20 c'est impossible »). Le 20 venait de la valeur par défaut
     (UNITE.entrees = 20 pièces) posée quand les fiches à l'unité ont été créées à partir des options des buffets.
     Une fois ; modifiable ensuite au back-office. La quantité de départ d'une fiche reste son minimum. */
  const RCh = await store.get('site/reglages');
  if (RCh && !RCh.chinoisMin5) {
    for (const { id, data: p } of await store.list('produits')) {
      if (p.sous !== 'buffet-chinois' || !['entrees', 'plats', 'accompagnements', 'desserts'].includes(rangementDe(p)) || p.min === 5) continue;
      await store.set('produits/' + id, { ...p, min: 5, ...(p.minimumTexte ? { minimumTexte: `Minimum de commande : 5 ${p.unite === 'pièce' ? 'pièces' : p.unite === 'portion' ? 'portions' : p.unite + 's'}` } : {}) });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), chinoisMin5: true });
  }

  /* Toutes les fiches à l'unité des spécialités (Saveurs du monde) : minimum 5 (accord de Jean-Luc, 2026-11-23).
     Seulement les unités « pièce / portion / brochette » au-dessus de 5 ; les coffrets, plateaux, corbeilles (minimum 1) et les
     formules « personne » ne bougent pas, sauf « Buffet indien · Entrée + plat ou plat + dessert » : 20 → 10 personnes comme les autres buffets. */
  const RU5 = await store.get('site/reglages');
  if (RU5 && !RU5.unitesMin5) {
    const pl = u => u === 'pièce' ? 'pièces' : u === 'portion' ? 'portions' : u + 's';
    for (const { id, data: p } of await store.list('produits')) {
      if (!p.sous) continue;
      if (/^buffet-indien/.test(id) && p.unite === 'personne' && p.min === 20 && /plat ou plat/i.test(p.titre || '')) {
        await store.set('produits/' + id, { ...p, min: 10, ...(p.minimumTexte ? { minimumTexte: 'Minimum : 10 personnes' } : {}) });
        continue;
      }
      if (!['pièce', 'portion', 'brochette'].includes(p.unite) || !(p.min > 5) || rangementDe(p) === 'buffets') continue;
      await store.set('produits/' + id, { ...p, min: 5, ...(p.minimumTexte ? { minimumTexte: `Minimum de commande : 5 ${pl(p.unite)}` } : {}) });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), unitesMin5: true });
  }

  /* Buffet chinois : carte complète (voir CARTE_CHINOISE). Une fois ; un prix déjà saisi au back-office n'est pas remplacé. */
  const RCc = await store.get('site/reglages');
  if (RCc && !RCc.carteChinoise1) {
    const prixDe = (cents, pcs) => Math.ceil(cents * 1.35 / (pcs || 1) / 10) * 10;
    let ordre = 200;
    for (const [rangement, titre, cents, pcs, photo, existantes] of CARTE_CHINOISE) {
      const prixCents = prixDe(cents, pcs), coutCents = Math.round(cents / (pcs || 1));
      if (existantes.length) {
        for (const id of existantes) {
          const p = await store.get('produits/' + id);
          if (!p || p.prixCents != null) continue;
          await store.set('produits/' + id, { ...p, prixCents, coutCents, unite: pcs ? p.unite : 'portion', min: 5, aCompleter: false });
        }
        continue;
      }
      const slug = slugify(titre + ' chinois');
      if (await store.get('produits/' + slug)) continue;
      const unite = pcs ? 'pièce' : 'portion';
      await store.set('produits/' + slug, { id: slug, slug, rubrique: 'saveurs-du-monde', autresRubriques: [], sous: 'buffet-chinois', rangement, titre, prixCents, coutCents, unite, min: 5,
        extrait: pcs ? `${titre}, vendu à la pièce : préparé par notre chef et livré prêt à servir.` : `${titre} : préparé par notre chef et livré prêt à servir.`, description: [],
        photos: photo ? [{ src: photo, alt: titre }] : [], video: null, groupes: [], variantes: [], sections: [], details: [], regles: { personnel: 'service', packs: true },
        ordre: ordre++, statut: 'visible', maison: true, tva: 10, allergenes: [], aCompleter: false });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteChinoise1: true });
  }

  /* Buffet chinois : prix donnés par Jean-Luc (2026-11-23), plus de « Sur devis » : nems et raviolis aux légumes 1,10 € TTC pièce,
     brochettes poulet à la citronnelle, bœuf fromage et poulet yakitori 1,90 € TTC pièce ;
     nems aux crevettes 1,20 € pièce, perles coco 1 €, mochi 1,20 € ; à la portion : poulet citronnelle 14,90 €, boulettes 12,90 €,
     riz sauté aux légumes 6,80 €, litchis (6 par portion) 1,50 €. Minimum 5. Recherche par titre (le slug dépend de l'import). */
  const RCx = await store.get('site/reglages');
  if (RCx && !RCx.chinoisPrixJL1) {
    const PRIX = { 'nems aux legumes': [110, 'pièce'], 'raviolis aux legumes': [110, 'pièce'], 'brochettes poulet a la citronnelle': [190, null], 'brochettes boeuf fromage': [190, null], 'brochettes poulet yakitori': [190, null],
      'nems aux crevettes': [120, 'pièce'], 'poulet a la citronnelle': [1490, 'portion'], 'boulettes de poulet piquantes et sucrees': [1290, 'portion'],
      'riz saute aux legumes': [680, 'portion'], 'perles coco': [100, 'pièce'], 'mochi': [120, 'pièce'],
      'litchis au sirop': [150, 'portion', 'Litchis au sirop, en portion de 6 litchis : servis frais, prêts à déguster.'] };
    const cle = t => String(t || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    for (const d of await store.list('produits')) {
      const p = { id: d.id, ...d.data };
      if (p.sous !== 'buffet-chinois' || !PRIX[cle(p.titre)]) continue;
      const [prixCents, unite, extrait] = PRIX[cle(p.titre)];
      await store.set('produits/' + p.id, { ...d.data, prixCents, ...(extrait ? { extrait } : {}), unite: unite || p.unite || 'pièce', min: 5, aCompleter: false,
        ...(p.minimumTexte ? { minimumTexte: 'Minimum de commande : 5 ' + ({ brochette: 'brochettes', portion: 'portions' }[unite || p.unite] || 'pièces') } : {}) });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), chinoisPrixJL1: true });
  }

  /* Carte Magnolia : le bandeau du chef (Jean-Luc, 2026-11-23). La page prend d'abord bandeauPhoto, puis photoAccueil (vignette
     de l'accueil), puis photo : on fixe donc bandeauPhoto pour que la vignette d'accueil ne remplace pas le bandeau. Vignette inchangée. */
  const RChef = await store.get('site/reglages');
  if (RChef && !RChef.carteBandeauChef2) {
    const cm = await store.get('rubriques/carte-magnolia');
    if (cm) await store.set('rubriques/carte-magnolia', { ...cm, bandeauPhoto: '/site/c/carte-magnolia-bandeau-chef.webp' });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), carteBandeauChef2: true });
  }

  /* Paëlla royale : retirer de la galerie les 3 photos d'ingrédients seuls (poulet, chorizo, crevettes) (Jean-Luc, 2026-11-23). */
  const RPr = await store.get('site/reglages');
  if (RPr && !RPr.paellaSansIngredients) {
    const p = await store.get('produits/paella-royale');
    if (p && Array.isArray(p.photos)) {
      const photos = p.photos.filter(ph => !String(ph && ph.src || '').includes('/paella-ingredients/'));
      if (photos.length !== p.photos.length) await store.set('produits/paella-royale', { ...p, photos });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), paellaSansIngredients: true });
  }

  /* Pastel de viande : vraie photo de pastels (Wikimedia Commons, « Fataya », Cheikh cherif, CC BY-SA 4.0) à la place de l'image IA (Jean-Luc, 2026-11-23). */
  const RPv = await store.get('site/reglages');
  if (RPv && !RPv.pastelVraiePhoto) {
    const IA = '/site/c/africain-boutique/pastel-de-viande-a-lunite-1.webp.webp', VRAIE = '/site/c/africain-boutique/pastels-viande-vrais.webp';
    for (const { id, data: p } of await store.list('produits')) {
      if (!Array.isArray(p.photos) || !p.photos.some(ph => ph && ph.src === IA)) continue;
      await store.set('produits/' + id, { ...p, photos: p.photos.map(ph => ph && ph.src === IA ? { src: VRAIE, alt: 'Pastels à la viande dorés' } : ph) });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), pastelVraiePhoto: true });
  }

  /* Les indispensables : une vraie photo par fiche matériel (à la place de la photo de serveuse ou de l'absence de photo),
     doublons retirés (chaise bordeaux, 2e bain-marie), photo locale pour les samoussas légumes africains,
     bandeau net de la Carte Magnolia (chef au dressage) (Jean-Luc, 2026-11-23). Sources : data/credits-photos-univers.md. */
  const RMa = await store.get('site/reglages');
  if (RMa && !RMa.materielPhotos1) {
    const M = '/site/c/materiel/';
    const PHOTOS = {
      'petit-pack-traiteur-eco-responsable': ['pack-eco', 'Couverts en bois éco-responsables'],
      'vaisselle-complete': ['vaisselle-complete', 'Assiettes, couverts et verres dressés sur une table'],
      'decoration': ['decoration', 'Tables de mariage décorées de grands bouquets de fleurs blanches'],
      'materiel-traiteur': ['materiel-traiteur', 'Verres à pied rangés sur un rack'],
      'tente-de-reception-4-4-m': ['tente-4x4', 'Tentes de réception carrées à voilages, éclairées le soir'],
      'grand-pack-traiteur-vaisselle-en-dur': ['grand-pack', 'Vaisselle en porcelaine, verres en verre et couverts en inox sur table nappée'],
      'nappage-170-250-cm': ['nappage', 'Table dressée sur une grande nappe blanche'],
      'mange-debout': ['mange-debout', 'Mange-debout sans nappe'],
      'nappe-rectangulaire-170-250-cm': ['nappe-rectangulaire', 'Table rectangulaire avec nappe blanche'],
      'chaise-pliante-de-luxe-en-velours-bordeaux': ['chaise-velours', 'Chaises dorées en velours bordeaux'],
      'verres-en-verre-vin-coupes-a-champagne': ['verres-vin-coupes', 'Coupes à champagne en verre'],
      'verres-reutilisables-eco-responsables': ['verres-reutilisables', 'Gobelets réutilisables empilés'],
      'set-de-vaisselle-complet-par-personne': ['set-complet', 'Assiettes, couverts et verre à pied'],
      'set-de-vaisselle-sans-verrerie-par-personne': ['set-sans-verrerie', 'Assiettes en porcelaine blanche'],
      'set-de-vaisselle-dessert-par-personne': ['set-dessert', 'Assiette à dessert et fourchette'],
      'bain-marie-chafing-dish-premier-modele': ['chafing-dish', 'Bains-marie (chafing dishes) sur un buffet'],
      'four-a-pizza': ['four-pizza-mobile', 'Four à pizza mobile sur remorque'],
      'chauffeur-prive-berlines-et-vans': ['chauffeur-prive', 'Chauffeur ouvrant la porte d’une berline'],
    };
    for (const [id, [f, alt]] of Object.entries(PHOTOS)) {
      const p = await store.get('produits/' + id); if (!p) continue;
      await store.set('produits/' + id, { ...p, photos: [{ src: M + f + '.webp', alt }] });
    }
    const t = await store.get('produits/table-rectangulaire-200-60-cm-6-a-8-personnes');
    if (t && !(t.photos || []).length) await store.set('produits/table-rectangulaire-200-60-cm-6-a-8-personnes', { ...t, photos: [{ src: '/site/c/table-rectangulaire-client-20261101.webp.webp', alt: 'Table pliante rectangulaire sans nappe' }] });
    const ancienne = await store.get('produits/chaises-pliantes-bordeaux'), luxe = await store.get('produits/chaise-pliante-de-luxe-en-velours-bordeaux');
    if (ancienne && luxe) {
      if (luxe.prixCents == null && ancienne.prixCents != null) await store.set('produits/chaise-pliante-de-luxe-en-velours-bordeaux', { ...(await store.get('produits/chaise-pliante-de-luxe-en-velours-bordeaux')), prixCents: ancienne.prixCents, prixTexte: ancienne.prixTexte, unite: ancienne.unite || 'chaise', aCompleter: false });
      await store.delete('produits/chaises-pliantes-bordeaux');
    }
    const bm = await store.get('produits/bain-marie-chafing-dish-premier-modele');
    if (bm) {
      await store.set('produits/bain-marie-chafing-dish-premier-modele', { ...(await store.get('produits/bain-marie-chafing-dish-premier-modele')), titre: 'Bain-marie (chafing dish)' });
      if (await store.get('produits/bain-marie-chafing-dish-second-modele')) await store.delete('produits/bain-marie-chafing-dish-second-modele');
    }
    const SAM = 'https://images.pexels.com/photos/4449068/pexels-photo-4449068.jpeg?auto=compress&cs=tinysrgb&w=1600';
    for (const { id, data: p } of await store.list('produits')) {
      if (!Array.isArray(p.photos) || !p.photos.some(ph => ph && ph.src === SAM)) continue;
      await store.set('produits/' + id, { ...p, photos: p.photos.map(ph => ph && ph.src === SAM ? { ...ph, src: M + 'samoussas-legumes.webp' } : ph) });
    }
    const cm = await store.get('rubriques/carte-magnolia');
    if (cm) await store.set('rubriques/carte-magnolia', { ...cm, photo: '/site/c/carte-magnolia-bandeau-chef.webp' });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), materielPhotos1: true });
  }

  /* paragraphe de présentation de chaque rubrique et de la page Lieux (Jean-Luc, 2026-11-22). Posé une fois, seulement si vide. */
  const RIr = await store.get('site/reglages');
  if (RIr && !RIr.introsRubriques) {
    for (const [slug, [titre, texte]] of Object.entries(INTROS_RUBRIQUES)) {
      const r = await store.get('rubriques/' + slug);
      if (r && !r.introTexte) await store.set('rubriques/' + slug, { ...r, introTitre: r.introTitre || titre, introTexte: texte });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), introsRubriques: true });
  }

  /* paragraphe de présentation de Saveurs du monde (Jean-Luc, 2026-11-22). Une fois : modifiable ensuite dans le back-office. */
  const RSdm = await store.get('site/reglages');
  if (RSdm && !RSdm.introSaveursDuMonde) {
    const sdm = await store.get('rubriques/saveurs-du-monde');
    if (sdm && !sdm.introTexte) await store.set('rubriques/saveurs-du-monde', { ...sdm, introTitre: INTRO_SAVEURS[0], introTexte: INTRO_SAVEURS[1] });
    await store.set('site/reglages', { ...(await store.get('site/reglages')), introSaveursDuMonde: true });
  }

  /* vraies photos à la place des images qui font « IA » (règle de Jean-Luc, 2026-11-22 : 95 % de vraies photos).
     Chaque remplacement est fait une fois, et seulement si la photo n'a pas déjà été changée dans le back-office. */
  const RP = await store.get('site/reglages');
  const fait = new Set(RP?.vraiesPhotosSite || []);
  const aFaire = VRAIES_PHOTOS_SITE.filter(x => !fait.has(x.id));
  if (RP && aFaire.length) {
    for (const x of aFaire) {
      if (x.sous) {
        const r = await store.get('rubriques/saveurs-du-monde');
        if (r) await store.set('rubriques/saveurs-du-monde', { ...r, sous: (r.sous || []).map(s => s.slug === x.sous && (!s.bandeauPhoto || s.bandeauPhoto === x.avant) ? { ...s, bandeauPhoto: x.photo, bandeauVideo: '' } : s) });
      } else if (x.rubrique) {
        const r = await store.get('rubriques/' + x.rubrique);
        if (r && (!r.photoAccueil || r.photoAccueil === x.avant)) await store.set('rubriques/' + x.rubrique, { ...r, photoAccueil: x.photo });
      } else if (x.bandeau) {
        const R = await store.get('site/reglages'); const b = R.bandeaux?.[x.bandeau] || {};
        if (!b.photo || b.photo === x.avant) await store.set('site/reglages', { ...R, bandeaux: { ...(R.bandeaux || {}), [x.bandeau]: { ...b, photo: x.photo } } });
      } else if (x.produit) {
        /* photo principale d'une fiche : remplacée seulement si c'est encore l'ancienne */
        const pr = await store.get('produits/' + x.produit);
        if (pr && (!pr.photos?.length || pr.photos[0].src === x.avant)) await store.set('produits/' + x.produit, { ...pr, photos: [{ src: x.photo, alt: x.alt || pr.titre }, ...(pr.photos || []).filter(ph => ph.src !== x.avant)] });
      } else if (x.accueil) {
        const R = await store.get('site/reglages');
        if (!R.accueil?.[x.accueil] || R.accueil[x.accueil] === x.avant) await store.set('site/reglages', { ...R, accueil: { ...(R.accueil || {}), [x.accueil]: x.photo } });
      }
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), vraiesPhotosSite: [...fait, ...aFaire.map(x => x.id)] });
  }

  /* photos des vignettes « Nos univers » choisies par Jean-Luc (2026-11-22, sources dans data/credits-photos.md).
     Appliquées une fois par univers : modifiables ensuite dans le back-office. */
  const RV = await store.get('site/reglages');
  const faites = new Set(RV?.vignettesFaites || []);
  const nouvelles = Object.keys(VIGNETTES_UNIVERS).filter(k => !faites.has(k));
  if (RV && nouvelles.length) {
    for (const slug of nouvelles) {
      const r = await store.get('rubriques/' + slug);
      if (!r) continue;
      const photo = VIGNETTES_UNIVERS[slug];
      await store.set('rubriques/' + slug, { ...r, photoAccueil: photo, ...(r.bandeauPhoto !== undefined || slug === 'grand-large' ? { bandeauPhoto: photo, bandeauVideo: '' } : {}) });
    }
    await store.set('site/reglages', { ...(await store.get('site/reglages')), vignettesFaites: [...faites, ...nouvelles] });
  }

  /* page Zone de livraison (Jean-Luc, 2026-11-22) : départ exact avenue de Norvège et livraison offerte dès 700 € TTC.
     Posé une fois : modifiable ensuite dans le back-office (Réglages > Tarifs communs). */
  const RL = await store.get('site/reglages');
  if (RL && !RL.zoneLivraison2026) {
    const adresse = !RL.adresse || /^15 rue de Norv/.test(RL.adresse) ? '15 avenue de Norvège, 91140 Villebon-sur-Yvette' : RL.adresse;
    await store.set('site/reglages', { ...RL, adresse, origine: { ...(RL.origine || {}), ...ORIGINE_LABO },
      tarifs: { ...(RL.tarifs || {}), livraisonOfferteCents: RL.tarifs?.livraisonOfferteCents ?? 70000 }, zoneLivraison2026: true });
  }
}

/* [fiche gardée, doublons…] : mêmes produit, prix et minimum */
const DOUBLONS = [
  ['acras-de-morue', 'acras-de-morue-antilles'], ['acras-de-legumes', 'acras-de-legumes-antilles'], ['puff-puff', 'puff-puff-antilles'],
  ['samoussa-legumes', 'samoussa-legumes-antilles'], ['samoussas-legumes', 'samoussas-legumes-antilles'],
  ['samoussas-au-boeuf', 'samoussas-au-boeuf-antilles'], ['samoussas-au-poulet', 'samoussas-au-poulet-antilles'],
  ['toasts-a-l-avocat-et-aux-crevettes', 'toasts-a-l-avocat-et-aux-crevettes-antilles'], ['salade-composee-200-g', 'salade-composee-200-g-antilles'],
  ['avocat-aux-crevettes-200-g', 'avocat-aux-crevettes-200-g-antilles'], ['riz-aux-legumes', 'riz-aux-legumes-antillais'],
  ['salade-de-fruits-exotiques-africain', 'salade-de-fruits-exotiques-antilles'], ['salade-de-4-fruits-de-saison-250-g', 'salade-de-4-fruits-de-saison-250-g-antilles'],
  ['curry-d-agneau-300-g', 'curry-d-agneau-antillais'],
  ['gateau-a-l-ananas-fait-maison-gateau-de-10-parts', 'gateau-a-l-ananas-fait-maison-gateau-de-10-parts-antilles'],
  ['flan-coco-fait-maison-gateau-de-10-parts', 'flan-coco-fait-maison-gateau-de-10-parts-antilles'],
  ['coffret-de-fruits-frais-pour-8-10-pers', 'coffret-de-fruits-frais-pour-8-10-pers-antilles'],
  ['plateau-de-80-mini-club-sandwichs', 'plateau-de-80-mini-club-sandwichs-antilles'],
  ['brochettes-de-fruits-frais-plateau-de-20-brochettes', 'brochettes-de-fruits-frais-plateau-de-20-brochettes-antilles'],
  ['plateau-de-48-mini-wraps-africain', 'plateau-de-48-mini-wraps-antilles'],
  ['corbeille-exotique-3-kg-africain', 'corbeille-exotique-3-kg-antilles'], ['corbeille-exotique-5-kg', 'corbeille-exotique-5-kg-antilles', 'corbeille-exotique-5-kg-2'],
  ['corbeille-exotique-7-kg', 'corbeille-exotique-7-kg-antilles', 'corbeille-exotique-7-kg-2'], ['corbeille-exotique-9-kg', 'corbeille-exotique-9-kg-antilles', 'corbeille-exotique-9-kg-2'],
  ['corbeille-de-fruits-de-saison-9-kg', 'corbeille-de-fruits-de-saison-9-kg-antilles'],
];
/* [titre, photo, texte alternatif] ; sources dans data/credits-photos-univers.md */
/* [fiche, version, [[photo, description]…]] */
/* Buffet chinois, carte complète à l'unité (Jean-Luc, 2026-11-23) : plats livrables de la carte du restaurant partenaire
   (source interne, jamais affichée), prix = prix carte + 35 %, arrondi aux 10 centimes supérieurs, TTC.
   Plats vendus par lot sur la carte (« 4 pièces »…) : prix à la pièce, comme les autres bouchées du site ; le reste à la portion.
   Pas de plats sur plaque chauffante, de fondue, de plats « pour 2 » ni de marmites. Une vraie photo libre par plat
   (sources dans data/credits-photos-univers.md) ; sans photo, le plat n'est pas mis.
   [section, titre, prix carte en centimes, nombre de pièces du lot ou null, photo ou null, fiches existantes équivalentes] */
const CARTE_CHINOISE = [
  ['entrees', 'Potage de crustacés', 620, null, '/site/c/chinois-carte/potage-de-crustaces.webp', []],
  ['entrees', 'Potage aux nids d’hirondelle', 550, null, '/site/c/chinois-carte/potage-aux-nids-d-hirondelle.webp', []],
  ['entrees', 'Potage aux asperges et au crabe', 500, null, '/site/c/chinois-carte/potage-aux-asperges-et-au-crabe.webp', []],
  ['entrees', 'Potage pékinois (piquant)', 450, null, '/site/c/chinois-carte/potage-pekinois-piquant.webp', []],
  ['entrees', 'Potage aux raviolis (porc)', 550, null, '/site/c/chinois-carte/potage-aux-raviolis-porc.webp', []],
  ['entrees', 'Potage aux raviolis (crevettes)', 600, null, '/site/c/chinois-carte/potage-aux-raviolis-crevettes.webp', []],
  ['entrees', 'Soupe aux vermicelles et poulet', 450, null, '/site/c/chinois-carte/soupe-aux-vermicelles-et-poulet.webp', []],
  ['entrees', 'Salade de soja nature', 400, null, '/site/c/chinois-carte/salade-de-soja-nature.webp', []],
  ['entrees', 'Salade chinoise aux crevettes', 550, null, '/site/c/chinois-carte/salade-chinoise-aux-crevettes.webp', []],
  ['entrees', 'Salade chinoise au poulet', 520, null, '/site/c/chinois-carte/salade-chinoise-au-poulet.webp', []],
  ['entrees', 'Rouleaux de printemps', 500, null, '/site/c/chinois-carte/rouleaux-de-printemps.webp', []],
  ['entrees', 'Nems au porc', 480, null, '/site/c/chinois-carte/nems-au-porc.webp', []],
  ['entrees', 'Nems au poulet', 500, null, null, ["nems-au-poulet-chinois"]],
  ['entrees', 'Bò bún (vermicelles de riz aux nems et au bœuf)', 850, null, '/site/c/chinois-carte/bo-bun-vermicelles-de-riz-aux-nems-et-au-boeuf.webp', []],
  ['entrees', 'Omelette au crabe', 550, null, '/site/c/chinois-carte/omelette-au-crabe.webp', []],
  ['entrees', 'Omelette aux crevettes', 550, null, '/site/c/chinois-carte/omelette-aux-crevettes.webp', []],
  ['entrees', 'Omelette aux légumes (foo-yong)', 480, null, '/site/c/chinois-carte/omelette-aux-legumes-foo-yong.webp', []],
  ['entrees', 'Crevettes tempura', 850, 6, '/site/c/chinois-carte/crevettes-tempura.webp', []],
  ['entrees', 'Beignets de crevettes', 850, 6, '/site/c/chinois-carte/beignets-de-crevettes.webp', []],
  ['entrees', 'Raviolis aux crevettes à la vapeur', 450, 4, null, ["hacao-aux-crevettes-chinois", "raviolis-aux-crevettes-chinois"]],
  ['entrees', 'Bouchées aux crevettes à la vapeur', 450, 4, null, ["bouchees-vapeur-aux-crevettes-chinois"]],
  ['entrees', 'Bouchées au porc à la vapeur', 450, 4, null, ["bouchees-au-porc-chinois"]],
  ['entrees', 'Bouchées au bœuf à la vapeur', 450, 4, '/site/c/chinois-carte/bouchees-au-boeuf-a-la-vapeur.webp', []],
  ['entrees', 'Raviolis frits aux crevettes', 680, 6, '/site/c/chinois-carte/raviolis-frits-aux-crevettes.webp', []],
  ['entrees', 'Assortiment de bouchées vapeur', 550, 5, '/site/c/chinois-carte/assortiment-de-bouchees-vapeur.webp', []],
  ['entrees', 'Toasts aux crevettes', 550, 3, '/site/c/chinois-carte/toasts-aux-crevettes.webp', []],
  ['entrees', 'Raviolis frits au porc', 600, 6, '/site/c/chinois-carte/raviolis-frits-au-porc.webp', []],
  ['entrees', 'Raviolis vietnamiens maison', 600, 3, '/site/c/chinois-carte/raviolis-vietnamiens-maison.webp', []],
  ['entrees', 'Raviolis pékinois grillés', 580, 5, '/site/c/chinois-carte/raviolis-pekinois-grilles.webp', []],
  ['entrees', 'Samoussas frits au bœuf', 600, 3, null, ["samoussas-au-boeuf-et-curry-chinois"]],
  ['plats', 'Mijoté de poulet au gingembre et à la ciboulette', 980, null, '/site/c/chinois-carte/mijote-de-poulet-au-gingembre-et-a-la-ciboulette.webp', []],
  ['plats', 'Langouste au gingembre et à la ciboulette', 3400, null, '/site/c/chinois-carte/langouste-au-gingembre-et-a-la-ciboulette.webp', []],
  ['plats', 'Gambas à l’ail à la vapeur', 1250, null, null, ["crevettes-a-l-ail-chinois"]],
  ['plats', 'Crevettes à la sauce piquante', 980, null, '/site/c/chinois-carte/crevettes-a-la-sauce-piquante.webp', []],
  ['plats', 'Crevettes au curry', 980, null, '/site/c/chinois-carte/crevettes-au-curry.webp', []],
  ['plats', 'Crevettes à la sauce aigre-douce', 980, null, '/site/c/chinois-carte/crevettes-a-la-sauce-aigre-douce.webp', []],
  ['plats', 'Grosses crevettes au sel et au poivre', 990, null, '/site/c/chinois-carte/grosses-crevettes-au-sel-et-au-poivre.webp', []],
  ['plats', 'Crevettes sautées aux légumes', 980, null, '/site/c/chinois-carte/crevettes-sautees-aux-legumes.webp', []],
  ['plats', 'Crevettes à l’ananas', 980, null, '/site/c/chinois-carte/crevettes-a-l-ananas.webp', []],
  ['plats', 'Lotte à la sauce aigre-douce', 1200, null, '/site/c/chinois-carte/lotte-a-la-sauce-aigre-douce.webp', []],
  ['plats', 'Lotte à la sauce piquante pékinoise', 1200, null, '/site/c/chinois-carte/lotte-a-la-sauce-piquante-pekinoise.webp', []],
  ['plats', 'Filet de poisson à la sauce piquante', 800, null, '/site/c/chinois-carte/filet-de-poisson-a-la-sauce-piquante.webp', []],
  ['plats', 'Filet de poisson à la sauce aigre-douce', 800, null, '/site/c/chinois-carte/filet-de-poisson-a-la-sauce-aigre-douce.webp', []],
  ['plats', 'Filet de poisson au sel et au poivre', 800, null, '/site/c/chinois-carte/filet-de-poisson-au-sel-et-au-poivre.webp', []],
  ['plats', 'Filet de poisson à la sauce citron', 800, null, '/site/c/chinois-carte/filet-de-poisson-a-la-sauce-citron.webp', []],
  ['plats', 'Saint-Jacques aux légumes', 1150, null, '/site/c/chinois-carte/saint-jacques-aux-legumes.webp', []],
  ['plats', 'Seiches au gingembre et à la ciboulette', 980, null, '/site/c/chinois-carte/seiches-au-gingembre-et-a-la-ciboulette.webp', []],
  ['plats', 'Seiches au sel et au poivre', 980, null, '/site/c/chinois-carte/seiches-au-sel-et-au-poivre.webp', []],
  ['plats', 'Seiches à la sauce piquante', 980, null, '/site/c/chinois-carte/seiches-a-la-sauce-piquante.webp', []],
  ['plats', 'Cuisses de grenouilles à l’impériale (épicées)', 1020, null, '/site/c/chinois-carte/cuisses-de-grenouilles-a-l-imperiale-epicees.webp', []],
  ['plats', 'Poulet aux noix de cajou', 750, null, '/site/c/chinois-carte/poulet-aux-noix-de-cajou.webp', []],
  ['plats', 'Poulet à l’impériale (épicé)', 750, null, '/site/c/chinois-carte/poulet-a-l-imperiale-epice.webp', []],
  ['plats', 'Poulet aux amandes', 750, null, '/site/c/chinois-carte/poulet-aux-amandes.webp', []],
  ['plats', 'Poulet sauté épicé', 750, null, '/site/c/chinois-carte/poulet-saute-epice.webp', []],
  ['plats', 'Poulet à l’ananas', 790, null, '/site/c/chinois-carte/poulet-a-l-ananas.webp', []],
  ['plats', 'Poulet en beignet au citron', 750, null, '/site/c/chinois-carte/poulet-en-beignet-au-citron.webp', []],
  ['plats', 'Poulet au curry', 750, null, '/site/c/chinois-carte/poulet-au-curry.webp', []],
  ['plats', 'Poulet frit du chef à la sichuanaise (épicé)', 800, null, '/site/c/chinois-carte/poulet-frit-du-chef-a-la-sichuanaise-epice.webp', []],
  ['plats', 'Poulet grillé parfumé', 780, null, '/site/c/chinois-carte/poulet-grille-parfume.webp', []],
  ['plats', 'Canard à l’ananas', 900, null, '/site/c/chinois-carte/canard-a-l-ananas.webp', []],
  ['plats', 'Canard laqué', 920, null, null, ["canard-laque-chinois"]],
  ['plats', 'Canard frit aux cinq parfums', 920, null, '/site/c/chinois-carte/canard-frit-aux-cinq-parfums.webp', []],
  ['plats', 'Bœuf au curry', 820, null, '/site/c/chinois-carte/boeuf-au-curry.webp', []],
  ['plats', 'Bœuf à la sauce piquante', 820, null, '/site/c/chinois-carte/boeuf-a-la-sauce-piquante.webp', []],
  ['plats', 'Bœuf aux oignons', 820, null, '/site/c/chinois-carte/boeuf-aux-oignons.webp', []],
  ['plats', 'Porc à la sauce piquante', 790, null, '/site/c/chinois-carte/porc-a-la-sauce-piquante.webp', []],
  ['plats', 'Porc aux champignons noirs et pousses de bambou', 790, null, '/site/c/chinois-carte/porc-aux-champignons-noirs-et-pousses-de-bambou.webp', []],
  ['plats', 'Porc ou poulet à la sauce aigre-douce', 700, null, null, ["porc-aigre-doux-chinois"]],
  ['plats', 'Porc ou poulet au caramel', 780, null, null, ["porc-au-caramel-chinois"]],
  ['plats', 'Porc laqué', 850, null, '/site/c/chinois-carte/porc-laque.webp', []],
  ['plats', 'Travers de porc royal (sucré)', 880, null, '/site/c/chinois-carte/travers-de-porc-royal-sucre.webp', []],
  ['plats', 'Travers de porc au sel et au poivre', 880, null, '/site/c/chinois-carte/travers-de-porc-au-sel-et-au-poivre.webp', []],
  ['accompagnements', 'Chou chinois sauté nature', 500, null, '/site/c/chinois-carte/chou-chinois-saute-nature.webp', []],
  ['accompagnements', 'Soja sauté', 500, null, '/site/c/chinois-carte/soja-saute.webp', []],
  ['accompagnements', 'Champignons noirs sautés', 500, null, '/site/c/chinois-carte/champignons-noirs-sautes.webp', []],
  ['accompagnements', 'Légumes chop suey', 500, null, '/site/c/chinois-carte/legumes-chop-suey.webp', []],
  ['accompagnements', 'Pommes de terre sautées au sel et au poivre', 550, null, '/site/c/chinois-carte/pommes-de-terre-sautees-au-sel-et-au-poivre.webp', []],
  ['accompagnements', 'Nouilles sautées à la viande (poulet ou bœuf)', 620, null, '/site/c/chinois-carte/nouilles-sautees-a-la-viande-poulet-ou-boeuf.webp', []],
  ['accompagnements', 'Nouilles sautées aux crevettes', 650, null, '/site/c/chinois-carte/nouilles-sautees-aux-crevettes.webp', []],
  ['accompagnements', 'Nouilles sautées aux légumes', 500, null, null, ["nouilles-sautees-aux-legumes-chinois"]],
  ['accompagnements', 'Riz sauté du chef (crevettes, porc laqué et œuf)', 500, null, '/site/c/chinois-carte/riz-saute-du-chef-crevettes-porc-laque-et-oeuf.webp', []],
  ['accompagnements', 'Riz sauté au curry (crevettes, porc laqué et œuf)', 500, null, '/site/c/chinois-carte/riz-saute-au-curry-crevettes-porc-laque-et-oeuf.webp', []],
  ['accompagnements', 'Riz sauté à la cantonaise', 430, null, null, ["riz-cantonais-chinois"]],
  ['accompagnements', 'Riz nature', 220, null, '/site/c/chinois-carte/riz-nature.webp', []],
  ['accompagnements', 'Riz gluant à la vapeur', 280, null, '/site/c/chinois-carte/riz-gluant-a-la-vapeur.webp', []],
  ['accompagnements', 'Riz sauté thaï (crevettes, ananas et œuf)', 600, null, '/site/c/chinois-carte/riz-saute-thai-crevettes-ananas-et-oeuf.webp', []],
];
/* « Nos buffets » des spécialités (Jean-Luc, 2026-11-23) : une photo de buffet en tête de chaque formule, choisie d'après son contenu
   (jamais une pièce à l'unité). Les autres photos de la fiche restent dans sa galerie. Sources dans data/credits-photos-univers.md. */
const PHOTOS_BUFFETS_EN_TETE = [
  ['buffet-antillais-entrees-seules', 'https://images.pexels.com/photos/16868526/pexels-photo-16868526.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Plateau d’entrées : beignets, bouchées frites et crevettes'],
  ['buffet-antillais-entree-et-plat-ou-plat-et-dessert', 'https://images.pexels.com/photos/9638804/pexels-photo-9638804.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Repas antillais : riz aux haricots rouges, plats en sauce et dessert'],
  ['buffet-antillais-entree-plat-dessert', '/site/c/antilles-menus/buffet-complet.jpg.webp', 'Buffet antillais complet servi en chafing dishes'],
  ['buffet-indien-entrees-a-l-unite', 'https://images.pexels.com/photos/958547/pexels-photo-958547.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Entrées indiennes : pakoras, naans et chutneys'],
  ['buffet-indien-entree-plat-ou-plat-dessert', 'https://images.pexels.com/photos/7182077/pexels-photo-7182077.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Table indienne : currys, riz et accompagnements'],
  ['buffet-indien-entree-plat-dessert', 'https://images.unsplash.com/photo-1682862279256-b2a9e4f3d22c?auto=format&fit=crop&w=1600&q=80', 'Grand buffet indien : entrées, currys, naans et desserts'],
];
const VRAIES_PHOTOS = [
  /* Traiteur végétarien (Jean-Luc, 2026-11-23) : vraies photos libres Pexels choisies d'après le contenu de chaque formule,
     regardées une à une, sans viande ni poisson visibles. Sources dans data/credits-photos-univers.md */
  ['buffet-vegetarien', 'veg1', [['https://images.pexels.com/photos/2291344/pexels-photo-2291344.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Saladier de salade grecque sur un buffet'], ['https://images.pexels.com/photos/29050581/pexels-photo-29050581.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Tarte aux fromages et aux légumes'], ['https://images.pexels.com/photos/6660071/pexels-photo-6660071.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Plateau de fromages, raisins, fruits secs et pain']]],
  ['petit-cocktail-vegetarien-14-pieces-salees', 'veg1', [['https://images.pexels.com/photos/25916399/pexels-photo-25916399.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Plateau de mini-tartelettes salées végétariennes'], ['https://images.pexels.com/photos/1239312/pexels-photo-1239312.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Toasts tomate, fromage frais et basilic']]],
  ['grand-cocktail-dinatoire-vegetarien-sale-et-sucre', 'veg1', [['https://images.pexels.com/photos/4374578/pexels-photo-4374578.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Plateau de cocktail végétarien : tartinables, crudités, olives et crackers'], ['https://images.pexels.com/photos/5852251/pexels-photo-5852251.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Houmous, crudités, tomates cerises et crackers'], ['https://images.pexels.com/photos/6606003/pexels-photo-6606003.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Tarte au citron meringuée']]],
  /* Toasts à l'avocat et aux crevettes : photo envoyée par Jean-Luc (2026-11-23), sur la fiche et son doublon antillais */
  ['toasts-a-l-avocat-et-aux-crevettes', 'jl1', [['/site/c/antilles-unit/toast-avocat-crevettes-jean-luc-20261123.webp', 'Toasts à l’avocat et aux crevettes']]],
  ['toasts-a-l-avocat-et-aux-crevettes-antilles', 'jl1', [['/site/c/antilles-unit/toast-avocat-crevettes-jean-luc-20261123.webp', 'Toasts à l’avocat et aux crevettes']]],
  /* Buffet chinois, section « Nos buffets » (Jean-Luc, 2026-11-23) : des photos de buffet en chafing dishes, jamais de pièce à l'unité.
     Images tirées de sa vidéo chinois-boucle.mp4 (ses médias). */
  ['buffet-chinois-entrees-plat', 'buffet1', [['/site/c/chinois-menus/buffet-chafing-1.webp', 'Buffet chinois servi en chafing dishes'], ['/site/c/chinois-menus/buffet-chafing-2.webp', 'Rangée de chafing dishes ouverts sur un buffet asiatique'], ['/site/c/chinois-menus/buffet-chafing-3.webp', 'Buffet asiatique : plusieurs plats chauds en chafing dishes']]],
  ['buffet-chinois-assortiment-13-pieces-salees', 'buffet1', [['/site/c/chinois-menus/buffet-chafing-3.webp', 'Buffet asiatique : plusieurs plats chauds en chafing dishes'], ['/site/c/chinois-menus/buffet-chafing-1.webp', 'Buffet chinois servi en chafing dishes'], ['/site/c/chinois-menus/buffet-chafing-2.webp', 'Rangée de chafing dishes ouverts sur un buffet asiatique']]],
  ['buffet-chinois-entrees-plat-dessert', 'buffet1', [['/site/c/chinois-menus/buffet-chafing-2.webp', 'Rangée de chafing dishes ouverts sur un buffet asiatique'], ['/site/c/chinois-menus/buffet-chafing-3.webp', 'Buffet asiatique : plusieurs plats chauds en chafing dishes'], ['/site/c/chinois-menus/buffet-chafing-1.webp', 'Buffet chinois servi en chafing dishes']]],
  /* Buffet libanais, section « Nos buffets » (Jean-Luc, 2026-11-23) : photos de buffets et de grands plateaux selon le texte de chaque fiche,
     jamais de pièce à l'unité. Pexels et Unsplash, licences libres, vérifiées une à une ; sources dans data/credits-photos-univers.md */
  ['buffet-libanais-8-mezzes-au-choix', 'buffet1', [['https://images.pexels.com/photos/19386650/pexels-photo-19386650.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Grande table de mezzés libanais'], ['https://images.unsplash.com/photo-1777891257688-cdf5c386bbb2?auto=format&fit=crop&w=1600&q=80', 'Mezzés et dessert oriental aux noix']]],
  ['buffet-libanais-plat-seul', 'buffet1', [['https://images.unsplash.com/photo-1771285119318-b342c3ecc51c?auto=format&fit=crop&w=1600&q=80', 'Grand plateau de grillades libanaises'], ['https://images.pexels.com/photos/23025180/pexels-photo-23025180.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Kafta, kebbé et mezzés servis à partager']]],
  ['buffet-libanais-6-mezzes-1-plat', 'buffet1', [['https://images.unsplash.com/photo-1786174045055-1eb50942e273?auto=format&fit=crop&w=1600&q=80', 'Plateau de mezzés et de grillades'], ['https://images.pexels.com/photos/19386650/pexels-photo-19386650.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Grande table de mezzés libanais']]],
  ['buffet-libanais-6-mezzes-1-plat-1-dessert', 'buffet1', [['https://images.pexels.com/photos/29177219/pexels-photo-29177219.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Table de buffet libanais : mezzés et plats chauds'], ['https://images.unsplash.com/photo-1777891257688-cdf5c386bbb2?auto=format&fit=crop&w=1600&q=80', 'Mezzés et dessert oriental aux noix']]],
  ['buffet-libanais-8-mezzes-1-plat', 'buffet1', [['https://images.pexels.com/photos/23025180/pexels-photo-23025180.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Kafta, kebbé et mezzés servis à partager'], ['https://images.pexels.com/photos/19386650/pexels-photo-19386650.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Grande table de mezzés libanais']]],
  ['buffet-libanais-8-mezzes-1-plat-1-dessert', 'buffet1', [['https://images.unsplash.com/photo-1777891257688-cdf5c386bbb2?auto=format&fit=crop&w=1600&q=80', 'Mezzés et dessert oriental aux noix'], ['https://images.pexels.com/photos/29177219/pexels-photo-29177219.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Table de buffet libanais : mezzés et plats chauds']]],
  /* Buffet chinois : une vraie photo de buffet en chafing dishes différente par fiche (Pexels), puis les images de sa vidéo */
  ['buffet-chinois-entrees-plat', 'buffet2', [['https://images.pexels.com/photos/39388375/pexels-photo-39388375.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Buffet asiatique en chafing dishes'], ['/site/c/chinois-menus/buffet-chafing-1.webp', 'Buffet chinois servi en chafing dishes']]],
  ['buffet-chinois-assortiment-13-pieces-salees', 'buffet2', [['https://images.pexels.com/photos/2291367/pexels-photo-2291367.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Rangée de chafing dishes ouverts'], ['/site/c/chinois-menus/buffet-chafing-3.webp', 'Buffet asiatique : plats chauds en chafing dishes']]],
  ['buffet-chinois-entrees-plat-dessert', 'buffet2', [['https://images.pexels.com/photos/39388382/pexels-photo-39388382.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Invités qui se servent au buffet asiatique'], ['/site/c/chinois-menus/buffet-chafing-2.webp', 'Rangée de chafing dishes sur un buffet asiatique']]],
  /* Jeux et animations sans photo (Jean-Luc, 2026-11-22) : Pexels et Unsplash, licences libres ; sources dans data/credits-photos-univers.md */
  ['puissance-4-geant', 'v1', [['https://images.pexels.com/photos/3009788/pexels-photo-3009788.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Puissance 4 géant bleu joué en soirée']]],
  ['taureau-mecanique', 'v1', [['https://images.unsplash.com/photo-1539070519374-cd87b6cf7624?auto=format&fit=crop&w=1600&q=80', 'Taureau mécanique sur son matelas gonflable']]],
  ['baby-foot-bonzini-b90', 'v1', [['https://images.pexels.com/photos/10827142/pexels-photo-10827142.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Baby-foot en bois de style café, barres rouges']]],
  ['billard', 'v1', [['https://images.pexels.com/photos/37063421/pexels-photo-37063421.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Billard avec triangle de boules et queues']]],
  ['table-de-ping-pong', 'v1', [['https://images.pexels.com/photos/40213156/pexels-photo-40213156.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Table de ping-pong avec raquettes et balle']]],
  ['cible-de-flechettes-electronique', 'v1', [['https://images.pexels.com/photos/242494/pexels-photo-242494.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Cible de fléchettes électronique']]],
  ['chateau-gonflable-crocodile-petit-format', 'v1', [['https://images.unsplash.com/photo-1740033135773-bf7c886ae45a?auto=format&fit=crop&w=1600&q=80', 'Enfants qui sautent dans un château gonflable']]],
  ['chateau-gonflable-crocodile-grand-format', 'v1', [['https://images.unsplash.com/photo-1765947389722-2e96d8c0aad9?auto=format&fit=crop&w=1600&q=80', 'Grand château gonflable avec obstacles et toboggan sur une pelouse']]],
  ['videobooth-a-360', 'v1', [['https://images.unsplash.com/photo-1765947390055-c5187b491ba0?auto=format&fit=crop&w=1600&q=80', 'Plateau tournant de vidéobooth 360° lors d’un événement']]],
  ['livre-d-or-audio-telephone-a-messages', 'v1', [['https://images.pexels.com/photos/37276787/pexels-photo-37276787.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Téléphone rétro pour livre d’or audio, voile de mariée']]],
  ['photobooth-borne-photo-avec-impressions', 'v1', [['https://images.pexels.com/photos/9342943/pexels-photo-9342943.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Invités qui posent dans le photobooth']]],
  ['hermine-animatrice-pour-les-enfants-de-3-a-8-ans', 'v1', [['https://images.pexels.com/photos/8385028/pexels-photo-8385028.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Maquillage d’enfant pendant une animation']]],
  /* La carte Magnolia, « Menus et service à table » (Jean-Luc, 2026-11-22) : Pexels 36630854 et 25809274, licence Pexels */
  ['menu-enfant-3-a-12-ans', 'v1', [['https://images.pexels.com/photos/36630854/pexels-photo-36630854.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Mini-burgers et cornet de frites']]],
  ['repas-servi-a-table-elabore-par-le-chef', 'v1', [['https://images.pexels.com/photos/25809274/pexels-photo-25809274.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Serveur apportant les assiettes aux convives à table']]],
  /* Buffet italien : grand buffet d'antipasti à la place des tomates confites (Jean-Luc, 2026-11-22) ; Pexels 23388862, licence Pexels */
  ['buffet-italien-entree-plat-dessert', 'v1', [['https://images.pexels.com/photos/23388862/pexels-photo-23388862.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Grand buffet italien : bruschettas, charcuteries, fromages, pains et antipasti'],
    ['/site/c/italien22-produits/buffet-menu.webp.webp', 'Buffet italien généreux de charcuteries, antipasti et spécialités à partager'], ['/site/c/italien22-produits/charcuterie-sans-logo-20261106.webp.webp', 'Planche de charcuteries et fromages italiens'],
    ['/site/c/italien22-produits/mozzarella-tomates-sans-logo-20261106.webp.webp', 'Brochettes mozzarella et tomates cerises'], ['/site/c/italien22-produits/cake-jambon-olives-sans-logo-20261106.webp.webp', 'Cake jambon et olives'],
    ['/site/c/italien22-produits/gressins-sans-logo-20261106.webp.webp', 'Gressins'], ['/site/c/italien22-produits/olives-sans-logo-20261106.webp.webp', 'Olives noires']]],
  ['samoussa-legumes', 'v1', [['https://images.pexels.com/photos/9027521/pexels-photo-9027521.jpeg?auto=compress&cs=tinysrgb&w=1600', 'Samoussas aux légumes croustillants, chutneys vert et tamarin']]],
  ['samoussas-legumes', 'v1', [['/site/c/materiel/samoussas-legumes.webp', 'Samoussas aux légumes dorés dans une corbeille, sauces à côté']]],
];
const PHOTOS_FICHES = [
  [/^air hockey/i, 'https://images.pexels.com/photos/5780929/pexels-photo-5780929.jpeg?auto=compress&cs=tinysrgb&w=1200', 'Table d’air hockey lumineuse'],
];
/* plateaux de sushis du site actuel (prix TTC, TVA 10 %) */
/* photos du site actuel, copiées dans le site et sans le logo « Magnolia For Event » (Jean-Luc, 2026-11-22) */
const SUSHI_ANCIENNE_ADRESSE = 'https://www.magnoliatraiteur.fr/wp-content/uploads/2024/01/';
const PLATEAUX_SUSHIS = [
  { slug: 'plateau-japonais-75-pieces', titre: 'Grand plateau de sushis en assortiment', pieces: 75, prixCents: 9790, pour: 'pour 15 à 20 personnes en cocktail (3 à 4 pièces par personne)',
    photo: '/site/sushis/grand-plateau-75.webp',
    compo: ['9 sushis saumon', '9 sushis crevette', '9 sushis saumon laqué sésame', '4 makis saumon', '8 makis concombre', '8 makis avocat', '8 makis thon cuit mayonnaise', '8 cristal saumon', '8 californias saumon', '4 californias thon cuit mayonnaise oignons frits'] },
  { slug: 'plateau-japonais-38-pieces', titre: 'Plateau de sushis gourmet en assortiment', pieces: 38, prixCents: 6590, pour: 'pour 8 à 9 personnes en cocktail (3 à 4 pièces par personne)',
    photo: '/site/sushis/plateau-gourmet-38.webp',
    compo: ['4 sushis saumon', '4 sushis thon', '6 californias saumon', '6 makis thon mayonnaise', '6 cristal végétarien', '6 crunch thon mayonnaise', '6 rolls saumon'] },
  { slug: 'plateau-californias-et-makis-40-pieces', titre: 'Plateau californias & makis en assortiment', pieces: 40, prixCents: 4720, pour: 'pour 8 à 9 personnes en cocktail (4 à 5 pièces par personne)',
    photo: '/site/sushis/plateau-californias-makis-40.webp',
    compo: ['8 rolls saumon', '4 californias saumon', '4 cristal saumon', '4 cristal thon cuit mayonnaise', '4 californias thon cuit mayonnaise oignons frits', '4 makis saumon', '4 makis thon cuit mayonnaise', '4 makis avocat', '4 makis concombre'] },
  { slug: 'plateau-japonais-36-pieces', titre: 'Plateau premium', pieces: 36, prixCents: 5270, pour: 'pour 8 à 9 personnes en cocktail (4 à 5 pièces par personne)',
    photo: '/site/sushis/plateau-premium-36.webp',
    compo: ['4 sushis thon', '4 sushis saumon', '4 rolls saumon', '8 californias saumon', '8 californias végétariens oignons frits', '4 makis concombre', '4 makis avocat'] },
  { slug: 'plateau-sushi-tout-cuit-20-pieces', titre: 'Plateau sushi tout cuit', pieces: 20, prixCents: 2850, pour: 'pour 4 à 5 personnes en cocktail (4 à 5 pièces par personne)',
    photo: '/site/sushis/plateau-tout-cuit-20.webp',
    compo: ['4 californias thon cuit mayonnaise', '4 californias végétariens', '4 cristal surimi', '4 cristal crevette ebi', '4 californias thon cuit mayonnaise oignons frits'] },
  { slug: 'plateau-de-luxe-42-pieces', titre: 'Plateau de luxe', pieces: 42, prixCents: 6590, pour: 'pour 8 à 9 personnes en cocktail (5 à 6 pièces par personne)',
    photo: '/site/sushis/plateau-de-luxe-42.webp',
    compo: ['7 sushis saumon laqué sésame', '7 sushis thon laqué sésame', '4 levana tartare de saumon, topping avocat', '4 dragons saumon oignons frits', '4 cristal saumon', '8 californias thon cuit mayonnaise oignons frits', '4 makis concombre', '4 makis saumon'] },
];
const INTROS_RUBRIQUES = {
  'carte-magnolia': ['La cuisine du chef, comme au restaurant', 'Carpaccios et tartares, foie gras aux figues, bœuf bourguignon, blanquette de veau, parmentier de canard, tartiflette : la carte Magnolia réunit les grands classiques de la cuisine française, préparés dans notre laboratoire de Villebon-sur-Yvette.\nComposez votre repas à l’unité, entrée, plat et dessert, pour un déjeuner d’entreprise, un dîner de famille ou un mariage. Nous livrons prêt à servir, ou nous dressons sur place avec notre personnel.'],
  'grand-large': ['La mer, fraîche du jour, sur votre table', 'Huîtres Gillardeau, Utah Beach ou pleine mer, homard de Bretagne, langoustines, crevettes, bulots, praires et caviar : nos plateaux de fruits de mer sont ouverts et dressés le jour même, pour garder tout l’iode et la fraîcheur.\nEn plateau à partager, en bar à huîtres ou en complément d’un buffet, ils donnent tout de suite un air de fête à vos réceptions, du dîner entre amis au grand mariage.'],
  'boissons': ['De quoi trinquer, du champagne aux softs', 'Champagne, vins choisis en Bourgogne, à Bordeaux ou en Provence, sangria maison, open bars et softs en bouteilles individuelles : tout pour accompagner votre repas, de l’apéritif au dessert.\nNous livrons vos boissons fraîches avec le reste de votre commande. Ajoutez des glaçons, des verres et un barman, et vous n’avez plus rien à prévoir.'],
  'coffrets-plateaux': ['Des plateaux prêts à partager', 'Coffrets antillais, italien, libanais ou chinois, plateaux de mini-burgers, de mini-clubs et de wraps, fromages de nos régions et charcuteries : des formules pratiques, livrées prêtes à poser sur la table.\nParfaits pour une réunion, un séminaire, un déjeuner au bureau ou un apéritif improvisé : chacun se sert, sans service ni installation.'],
  'animations-salees': ['Le chef cuisine devant vos invités', 'Pizzaiolo et son four, pâtes flambées dans la meule de parmesan, barbecue, chef sushi, bar à huîtres, bar à foie gras, Saint-Jacques à la plancha, stand de burgers : nos animations salées transforment le repas en spectacle.\nVos invités voient les plats préparés sous leurs yeux, échangent avec le chef et se servent chaud. Une vraie animation pour un mariage, un anniversaire ou une soirée d’entreprise.'],
  'douceurs': ['Le sucré en spectacle', 'Fontaine à chocolat, barbe à papa, crêpes, gaufres, churros, pop-corn, candy bar, pièces montées, macarons et corbeilles de fruits : de quoi terminer la fête en beauté, pour les petits comme pour les grands.\nNos animations sucrées sont installées et servies par notre équipe, et nos desserts arrivent prêts à être découpés. Il ne reste plus qu’à souffler les bougies.'],
  'indispensables': ['Tout le nécessaire, livré avec le repas', 'Vaisselle, nappage, tables, chaises, mange-debout, tente de réception, tireuse à bières, photobooth : tout le matériel pour recevoir vos invités dans de bonnes conditions, sans courir chez plusieurs loueurs.\nNous livrons le matériel avec votre commande traiteur, nous l’installons si besoin, puis nous le reprenons après l’événement.'],
  'personnel': ['Une équipe pour servir vos invités', 'Maîtres d’hôtel, serveurs, grilladin, pizzaïolo, régisseur, agent de sécurité : notre personnel de réception s’occupe du service pour que vous profitiez pleinement de votre événement.\nNos équipes installent le buffet, servent vos invités, réapprovisionnent les plats et rangent en fin de soirée. Elles connaissent nos produits et nos animations sur le bout des doigts.'],
  'musique-animations': ['L’ambiance qui fait la soirée', 'DJ, live band, jazz, saxophoniste, pianiste, chanteurs, magicien, mentaliste, caricaturiste, casino, karaoké ou blind test : choisissez l’animation qui ressemble à vos invités.\nPour une ambiance réussie jusqu’au bout de la nuit, ajoutez nos jeux de lumière, la sonorisation, un écran LED ou un vidéoprojecteur. Tout est réservé, livré et installé avec votre traiteur, dans une seule commande.'],
  'traiteur-vegetarien-vegan': ['Tout le goût, sans viande ni poisson', 'Buffets, cocktails dînatoires et plateaux végétariens : des recettes colorées et généreuses, pensées pour que personne ne se sente mis de côté.\nIdéal pour un événement entièrement végétarien, ou pour compléter un buffet classique afin que chaque invité trouve son bonheur.'],
  'petits-dejeuners': ['Bien commencer la journée', 'Viennoiseries, café, thé, jus de fruits frais : nos pauses café et petits-déjeuners accueillent vos équipes, vos clients ou vos invités dès le matin.\nIdéals pour un séminaire, une réunion, une formation ou un lendemain de mariage, ils sont livrés tôt et prêts à servir.'],
  'lieux': ['Le lieu idéal pour votre événement', 'Lofts, péniches sur la Seine, manoir, demeures avec jardin, salles de réception : nous avons sélectionné des lieux où nous avons l’habitude de travailler, de Paris à Versailles, en passant par Boulogne et Sèvres.\nRéservez le lieu et le traiteur ensemble, avec un seul interlocuteur : nous connaissons les cuisines, les accès et les contraintes de chaque endroit, pour que tout se passe bien le jour J.'],
};
const PHOTOS_SANS_BROCHURE = {
  'pizzaiolo-a-domicile': [38539266, 'Pizzaiolo devant son four à bois'],
  'champagne-andre-diligent': [2259243, 'Bouteille de champagne dans un seau à glace'],
  'la-cave-de-magnolia': [11851422, 'Bouteilles de vin et verres'],
  'pack-softs-en-individuel': [7414290, 'Bouteilles de jus et de sodas individuelles'],
  'plateau-de-20-mini-cheeseburgers': [18354206, 'Plateau de mini-burgers'],
  'jeux-de-lumiere': [33539320, 'Jeux de lumière colorés sur une piste de danse'],
  'ambiance-lumiere-et-sonorisation': [39204572, 'Scène décorée avec enceintes et projecteurs'],
  'formule-live-band': [3984822, 'Groupe de musiciens en live'],
  'ecran-led': [30169356, 'Murs d’écrans LED sur scène'],
  'ecran-videoprojecteur': [18999470, 'Présentation projetée sur grand écran devant le public'],
  'animation-drag-queen': [4722585, 'Drag queen en spectacle au micro'],
  'stand-de-churros': [36361401, 'Churros et sauce chocolat'],
  'pause-cafe': [30183083, 'Pause café : boissons chaudes et jus en libre-service'],
  'petit-dejeuner-classique': [27846221, 'Petit-déjeuner : croissants et café'],
  'petit-dejeuner-luxe': [34307858, 'Buffet de petit-déjeuner avec viennoiseries'],
  'saxophoniste-2-heures': [9002848, 'Saxophoniste en concert'],
  'pianiste': [18238124, 'Pianiste au piano à queue'],
  'chanteurs-et-chanteuses': [8041085, 'Chanteuse au micro sur scène'],
  'duo-guitare-voix-2-45-min': [10970319, 'Duo guitare et voix'],
  'jazz-soliste': [8044219, 'Guitariste de jazz'],
  'jazz-trio': [8040897, 'Trio de jazz en concert'],
  'jazz-quatuor': [3984817, 'Quatuor de jazz'],
  'duo-flaming-soul': [9002786, 'Duo de chanteuses soul'],
  'magicien-1-h-30': [35176748, 'Magicien et ses cartes'],
  'faux-serveur': [13375022, 'Serveur avec un plateau de coupes de champagne'],
  'mentaliste-2-30-min': [6254935, 'Mentaliste et jeu de cartes'],
  'caricaturiste-1-h-30': [13541687, 'Caricaturiste en train de dessiner'],
  'ventriloque-2-30-min': [30218072, 'Artiste avec sa marionnette'],
  'contorsionniste-2-4-min': [11496079, 'Contorsionniste'],
  'diseuse-de-bonne-aventure-1-heure': [7181711, 'Tirage de cartes de tarot'],
  'animations-pour-enfants': [8385870, 'Animation d’anniversaire pour enfants'],
  'casino': [7594343, 'Table de roulette de casino'],
  'blind-test': [8763175, 'Amis en plein jeu'],
  'karaoke': [30489716, 'Karaoké entre amis'],
  'escape-game': [5427434, 'Ambiance d’escape game'],
  'mise-en-lumiere-du-lieu': [12689021, 'Salle de réception mise en lumière'],
};
const PHOTOS_SANS_FILIGRANE = {
  '/site/c/tireuse56.jpg.webp': [5858056, 'Bière servie à la tireuse'],
  '/site/c/page40-chocolat.jpg.webp': [38431059, 'Fontaine à chocolat'],
  '/site/c/popcorn55-nouveau-20261030.jpg.webp': [36784776, 'Stand de pop-corn'],
  '/site/c/indien-menus/entrees-samossas-portrait-20261102.webp.webp': [29037272, 'Samossas dorés'],
  '/site/c/indien-menus/chicken-tikka-massala.webp.webp': [6522616, 'Poulet tikka'],
  '/site/c/seafood30/bulots.webp.webp': [37402010, 'Bulots cuits'],
  '/site/c/seafood30/crevettes-roses.webp.webp': [16561736, 'Crevettes roses cuites'],
  '/site/c/libanais-produits/sanbousek.webp.webp': [30168777, 'Sanbousek, chaussons farcis'],
};
const PHOTOS_A_RETIRER = ['/site/c/africain-produits/pastels-au-poisson.webp.webp', '/site/c/africain-produits/avocat-aux-crevettes.webp.webp'];
const INTRO_SAVEURS = ['Toutes les cuisines du monde, sur un seul site',
  'Magnolia est le seul site d’Île-de-France sur lequel vous pouvez commander, pour un même événement, un buffet libanais, un buffet chinois et des cocktails français. Libanais, chinois, japonais, antillais, africain, indien, italien, espagnol ou oriental : chaque cuisine est préparée par un traiteur spécialiste de sa tradition.\nCes traiteurs, nous les avons choisis et testés ces dernières années sur des centaines de prestations. Vous gardez un seul interlocuteur et un seul devis, et vos invités goûtent le meilleur de chaque cuisine.'];
const INTRO_COCKTAILS = ['Cocktails et buffets à la française',
  'Pièces cocktail salées et sucrées, verrines, mini-burgers, plateaux de fromages et de charcuteries, grands buffets froids ou chauds : nos formules sont préparées dans notre laboratoire de Villebon-sur-Yvette, avec des produits frais et de saison.\nSéminaire, afterwork, inauguration, mariage ou anniversaire : choisissez la formule qui vous ressemble, ajustez les quantités au nombre d’invités, puis ajoutez si besoin le personnel de service, la vaisselle et les boissons. Tout arrive prêt à servir, 7 jours sur 7.'];
const INTROS_SPE = {
  'paella-party': ['La paëlla, la fête à partager',
    'Une grande poêle dorée au milieu des invités, et la fête commence. Notre paëlla royale marie poulet, chorizo, crevettes, calamars et moules sur un riz parfumé au safran ; la paëlla de la mer garde le meilleur de l’océan.\nCuisinée devant vos invités ou livrée prête à servir, elle régale aussi bien un anniversaire au jardin qu’un repas d’entreprise.'],
  'buffet-chinois': ['La Chine en bouchées à partager',
    'Nems croustillants, bouchées vapeur et hacao aux crevettes, raviolis, brochettes yakitori : un buffet chinois, c’est d’abord une ribambelle de petites gourmandises à picorer. Viennent ensuite les plats qui ont fait la réputation de cette cuisine : canard laqué, porc au caramel, poulet à la citronnelle, riz cantonais et nouilles sautées.\nPour finir en douceur, perles coco, mochis et litchis. Tout est préparé dans notre laboratoire et livré prêt à servir, pour une soirée conviviale comme pour un cocktail d’entreprise.'],
  'buffet-africain': ['L’Afrique généreuse, en couleurs et en saveurs',
    'Acras de morue, pastels, samoussas et puff-puff pour commencer, puis les grands classiques mijotés longuement : mafé, yassa, thiéboudienne, ndolé, kédjénou ou poulet braisé. Alloco, attiéké, bananes plantains et foutou les accompagnent, comme à la maison.\nUne cuisine chaleureuse et parfumée, servie en buffet pour vos mariages, baptêmes, anniversaires et fêtes de famille, avec des fruits frais et des douceurs coco pour le dessert.'],
  'couscous-party': ['Le couscous, le plat qui rassemble',
    'Semoule légère, légumes fondants, bouillon parfumé aux épices : le couscous est le plat de fête par excellence. Notre couscous royal réunit trois viandes, et le couscous végétarien fait la part belle aux légumes et aux pois chiches.\nPréparé le jour de votre événement et livré bien chaud, il régale facilement un grand nombre d’invités, du mariage à l’anniversaire.'],
  'buffet-italien': ['La dolce vita à votre table',
    'Charcuterie italienne, fromages, salades de pâtes fraîches comme la Belle Toscane ou les mini-pennes à l’italienne, lasagnes à la bolognaise au parmigiano reggiano : notre buffet italien, c’est le goût simple et généreux de l’Italie.\nEt pour finir, un tiramisu fait maison. Une cuisine qui plaît à tous, à partager entre amis, en famille ou entre collègues.'],
  'buffet-antillais': ['Les Antilles, le soleil dans l’assiette',
    'Acras de morue, boudins créoles et samoussas pour l’apéritif, puis colombo de poulet ou de cabri, fricassée de chatrou, rougail saucisse ou vivaneau au court-bouillon : la cuisine antillaise est pleine d’épices et de bonne humeur.\nGratins de bananes plantains ou de christophines, riz et haricots rouges accompagnent les plats, et le flan coco ou le blanc-manger terminent le repas. De quoi faire voyager vos invités, d’un anniversaire à un repas d’entreprise.'],
  'buffet-indien': ['L’Inde, ses épices et ses couleurs',
    'Samossas, bhajias d’oignon et pakoras pour commencer, puis les grands classiques : chicken tikka massala, korma à la crème d’amande, agneau madras ou crevettes massala, servis avec un riz au safran et des naans au fromage.\nPour le dessert, gulab jamun et lassi au parfum de votre choix. Une cuisine parfumée sans être forcément piquante, idéale pour surprendre vos invités.'],
  'specialites-japonaises': ['Le Japon en plateaux à partager',
    'Sushis, makis et californias préparés avec soin et présentés en plateaux prêts à poser sur la table. De 36 à 80 pièces, il y en a pour un apéritif entre amis comme pour un grand cocktail.\nFrais, légers et élégants, nos plateaux japonais se partagent facilement et plaisent à tous les âges.'],
  'buffet-libanais': ['Le Liban, l’art de recevoir à partager',
    'Au Liban, un bon repas se partage : on pose les mezzés au milieu de la table et chacun se sert. Houmous onctueux, moutabal fumé, taboulé bien frais, falafels croustillants et petits feuilletés chauds ouvrent le bal, avant les grillades marinées et les douceurs orientales.\nTout est préparé dans notre laboratoire avec des produits frais, puis livré prêt à servir pour votre soirée, votre séminaire ou votre mariage. Une cuisine généreuse et colorée, qui met tout le monde d’accord, végétariens compris.'],
};
/* lassi sans texte incrusté (Pexels 18142603, licence Pexels) */
const PHOTO_LASSI = 'https://images.pexels.com/photos/18142603/pexels-photo-18142603.jpeg?auto=compress&cs=tinysrgb&w=1200';
const pexels = id => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
/* lot 1 des vraies photos (Pexels, licence libre ; sources dans data/credits-photos-univers.md) */
const VRAIES_PHOTOS_SITE = [
  { id: 'bandeau-boutique-1', bandeau: 'boutique', avant: '/site/c/accueil/website-home-cocktail-20261110.webp', photo: pexels(8252824) },
  { id: 'animations-salees-1', rubrique: 'animations-salees', avant: '/site/c/barbecue40-client-20261031.jpg.webp', photo: pexels(34027185) },
  { id: 'couscous-party-1', sous: 'couscous-party', avant: '', photo: pexels(36984667) },
  { id: 'buffet-antillais-1', sous: 'buffet-antillais', avant: '/site/c/paysages/antilles.webp', photo: pexels(2120356) },
  /* Jean-Luc (2026-11-23) préfère finalement l'ancien bandeau antillais : les îles et l'océan, grandes feuilles tropicales devant (photo de son brouillon) */
  { id: 'buffet-antillais-2', sous: 'buffet-antillais', avant: pexels(2120356), photo: '/site/c/paysages/antilles.webp' },
  { id: 'japonais-1', sous: 'specialites-japonaises', avant: '/site/c/paysages/japon.webp', photo: pexels(33368124) },
  { id: 'accueil-maison-1', accueil: 'photoMaison', avant: '/site/c/antilles-menus/buffet-equipe-colombo-20261103-sans-logo-20261106.webp.webp', photo: pexels(34321369) },
  { id: 'buffet-africain-1', produit: 'buffet-africain-entree-plat-ou-plat-dessert', avant: '/site/c/africain-produits/accras-de-morue.webp.webp', photo: pexels(28736731), alt: 'Buffet africain servi par nos cuisiniers' },
  { id: 'escape-game-2', produit: 'escape-game', avant: pexels(5427434), photo: pexels(29483111), alt: 'Énigme à résoudre contre la montre' },
  { id: 'blind-test-2', produit: 'blind-test', avant: pexels(8763175), photo: pexels(15880877), alt: 'Équipe qui célèbre une bonne réponse' },
  { id: 'fromages-1', produit: 'le-trio-affine', avant: '/site/c/plateaux35-fromages.jpg.webp', photo: pexels(2992308), alt: 'Plateau de fromages affinés, noix et fruits' },
  { id: 'fromages-2', produit: 'plateau-de-fromages', avant: '/site/c/cocktail7-photos/mini-clubs.webp.webp', photo: pexels(2992308), alt: 'Plateau de fromages, noix et fruits' },
];
const VIGNETTES_UNIVERS = {
  'traiteur-vegetarien-vegan': pexels(41063196),
  'grand-large': pexels(39143859),
  // vraies photos à la place des images qui font « IA » (Jean-Luc, 2026-11-22)
  'cocktails-buffets': pexels(34279947), // plateaux de petits fours, sans verres
  'saveurs-du-monde': pexels(27294729),
  'boissons': pexels(5531479), // barman qui sert un cocktail (Jean-Luc ne voulait pas d'un bar)
};

module.exports = { RANGEMENTS, rangementDe, SPE_TEXTES, initSousRubriques, classerSous, SOUS_DEFAUT, importerAvisAncienSite, dateIso, seed, REGLAGES_DEFAUT, MODELES_DEFAUT, extraireAvis };
