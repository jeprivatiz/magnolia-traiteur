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

const REGLAGES_DEFAUT = {
  nom: 'Magnolia Traiteur',
  sousNom: 'Traiteur · Événementiel',
  slogan: 'Des saveurs, des idées, votre événement.',
  telephone: '07 63 66 98 92',
  email: 'infos@magnoliatraiteur.fr',
  adresse: '15 rue de Norvège, 91140 Villebon-sur-Yvette',
  origine: { lat: 48.6948, lon: 2.2287, nom: 'Villebon-sur-Yvette' },
  horaires: 'Du lundi au vendredi de 9 h à 18 h, le samedi de 10 h à 18 h.',
  instagram: 'https://www.instagram.com/magnoliatraiteur/',
  avisGoogle: { note: '4,9', nombre: 'plus de 800', url: 'https://search.google.com/local/reviews?placeid=ChIJQb9vuprX5UcR2-iHFOth55k' },
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
      { valeur: '4,9/5', label: 'sur Google, plus de 800 avis' },
      { valeur: '377', label: 'prestations en ligne' },
      { valeur: '7 j/7', label: 'livraison en Île-de-France' },
      { valeur: '1 seule', label: 'demande pour tout votre événement' },
    ],
    bandeau: ['Saveurs du monde', 'Antillais', 'Chinois', 'Indien', 'Paëlla', 'Libanais', 'Italien', 'Africain', 'Couscous', 'Japonais'],
    suggestions: ['Paëlla', 'Buffet antillais', 'DJ', 'Huîtres', 'Louer des verres', 'Personnel de service', 'Lieux', 'Barbecue', 'Fontaine à chocolat', 'Pièce montée', 'Candy bar', 'Fruits de mer'],
    incontournables: ['grand-cocktail-magnolia', 'paella-royale', 'buffet-antillais-entree-plat-dessert', 'buffet-chinois-entrees-plat-dessert', 'buffet-indien-entree-plat-dessert', 'buffet-libanais-6-mezzes-1-plat', 'bar-a-burrata', 'couscous-royal'],
    photoMaison: '/site/c/antilles-menus/buffet-equipe-colombo-20261103-sans-logo-20261106.webp.webp',
    photoCommande: '/site/c/accueil/personnel80-client-20261102.webp',
  },
  logosClients: ['aircaraibes', 'doctolib', 'villedeparis', 'nestle', 'bnpparibas', 'loreal', 'accenture', 'armani', 'radisson', 'canon', 'cnrs', 'bpifrance', 'creditagricole', 'lcl']
    .map(k => ({ src: `/site/logos/${k}.svg`, nom: { aircaraibes: 'Air Caraïbes', doctolib: 'Doctolib', villedeparis: 'Ville de Paris', nestle: 'Nestlé', bnpparibas: 'BNP Paribas', loreal: 'L’Oréal', accenture: 'Accenture', armani: 'Giorgio Armani', radisson: 'Radisson Blu', canon: 'Canon', cnrs: 'CNRS', bpifrance: 'Bpifrance', creditagricole: 'Crédit Agricole', lcl: 'LCL' }[k] })),
  tarifs: {
    kmCents: 100,
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
    { nom: 'Hermine', role: 'Responsable opérationnelle', photo: '/site/c/equipe/hermine.webp', citation: '« Le jour J, Hermine et son équipe ont été aux petits soins : du buffet aux boissons, en passant par le personnel et l’animation musicale, tout était impeccable. »', auteur: 'Julie Triolet-Bigueur, juin 2025' },
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
  'buffet-antillais': ['Buffet antillais', 'Accras, boudins créoles, colombo, rougail et punchs : la cuisine des îles par Le Traiteur Antillais.'],
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
const RANGEMENTS = [['buffets', 'Nos buffets'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité']];
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
  const UNITE = { entrees: ['pièce', 20], mezzes: ['portion', 10], brochettes: ['brochette', 10], salades: ['portion', 10], plats: ['portion', 10], accompagnements: ['portion', 10], desserts: ['pièce', 10] };
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
      await store.set('produits/' + d.id, { ...p, prixCents: Math.ceil(cout * 1.3 / 10) * 10, coutCents: cout, unite: 'portion', min: 10, aCompleter: false });
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
      await store.set('produits/' + slug, { id: slug, slug, rubrique: 'saveurs-du-monde', autresRubriques: [], sous: 'buffet-indien', rangement, titre, prixCents: Math.ceil(cout * 1.3 / 10) * 10, coutCents: cout, unite, min: 10, extrait: `${titre} : spécialité indienne préparée par notre chef et livrée prête à servir.`, description: [], photos: [{ src, alt: titre }], photoAmbiance: !photo, video: null, groupes: [], variantes: [], sections: [], details: [], regles: { personnel: 'service', packs: true }, ordre: ordre++, statut: 'visible', maison: true, tva: 10, allergenes: [], aCompleter: false });
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

  /* « Buffet libanais · 8 mezzés » devient « Buffet libanais » (Jean-Luc, 2026-11-22). Une fois. */
  const RLb = await store.get('rubriques/saveurs-du-monde');
  if (RLb && !RLb.libanaisCourt) {
    const sous = (RLb.sous || []).map(x => x.slug === 'buffet-libanais' && /mezz/i.test(x.nom || '') ? { ...x, nom: 'Buffet libanais' } : x);
    await store.set('rubriques/saveurs-du-monde', { ...RLb, sous, libanaisCourt: true });
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
}

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
const VIGNETTES_UNIVERS = {
  'traiteur-vegetarien-vegan': pexels(41063196),
  'grand-large': pexels(39143859),
};

module.exports = { RANGEMENTS, rangementDe, SPE_TEXTES, initSousRubriques, classerSous, SOUS_DEFAUT, importerAvisAncienSite, dateIso, seed, REGLAGES_DEFAUT, MODELES_DEFAUT, extraireAvis };
