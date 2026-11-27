'use strict';
/*
 * Blog « Nos événements en reportage » (Jean-Luc, 2026-11-27).
 * L'équipe tape quelques lignes et ajoute ses photos dans le back-office › Blog ; l'IA rédige et met en page
 * tout le reportage (titre, chapô, intertitres, chiffres clés, légendes, prestations du catalogue liées).
 * L'article reste en brouillon jusqu'au clic sur « Publier ». Rappel SMS + e-mail tous les N jours (3 par défaut).
 * Règles de l'IA : rien d'inventé (chiffres, nom du client, lieu, avis), jamais de fournisseur ni de prix.
 */
const { slugify } = require('./util');

const CATEGORIES = { entreprise: 'Entreprise', particulier: 'Particulier', maison: 'La maison Magnolia' }; /* « La maison Magnolia » : les histoires de la maison (Jean-Luc, 2026-11-27) */
const TYPES = ['Soirée d’entreprise', 'Séminaire', 'Convention', 'Lancement de produit', 'Inauguration', 'Fête de fin d’année', 'Cocktail d’entreprise', 'Déjeuner d’affaires', 'Mariage', 'Anniversaire', 'Baptême', 'Communion', 'Fête de famille', 'Fiançailles', 'Bar-mitsva', 'Départ en retraite', 'Autre événement',
  'Nouveau produit', 'Nouveau fournisseur', 'Nouveau département', 'Nouvel équipement', 'Coulisses de la maison', 'Vie de la maison'];
const MAX_PHOTOS = 40;
const RAPPEL_DEFAUT = { actif: true, jours: 3, heure: 9 };
const INTERDIT = /himalaya|palais de l|fournisseur|sur devis|non contractuel/i;

const str = (v, n = 300) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, n));
const para = (v, n = 4000) => String(v ?? '').split(/\n+/).map(x => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, n);
const entier = v => { const n = parseInt(String(v ?? '').replace(/\s/g, ''), 10); return Number.isFinite(n) && n > 0 && n < 100000 ? n : null; };
const dateIso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const srcOk = s => typeof s === 'string' && /^\/(media|site)\/[^\s"'<>]+$/.test(s) && !s.includes('..');

/* article propre, quel que soit ce qu'envoie le back-office */
function nettoyerArticle(a = {}, before = null) {
  const photos = (Array.isArray(a.photos) ? a.photos : []).filter(p => p && srcOk(p.src)).slice(0, MAX_PHOTOS).map(p => ({ src: p.src, legende: str(p.legende, 200) }));
  const out = {
    titre: str(a.titre, 160),
    chapo: para(a.chapo, 600).replace(/\n/g, ' '),
    categorie: CATEGORIES[a.categorie] ? a.categorie : 'entreprise',
    typeEvenement: str(a.typeEvenement, 60),
    lieu: str(a.lieu, 120),
    invites: entier(a.invites),
    dateEvenement: dateIso(a.dateEvenement),
    chiffres: (Array.isArray(a.chiffres) ? a.chiffres : []).map(x => ({ valeur: str(x?.valeur, 14), libelle: str(x?.libelle, 40) })).filter(x => x.valeur && x.libelle).slice(0, 4),
    sections: (Array.isArray(a.sections) ? a.sections : []).map(x => ({ titre: str(x?.titre, 120), texte: para(x?.texte, 3000) })).filter(x => x.texte).slice(0, 8),
    citation: a.citation && str(a.citation.texte, 500) ? { texte: str(a.citation.texte, 500).replace(/^[«"\s]+|[»"\s]+$/g, ''), auteur: str(a.citation.auteur, 120) } : null,
    photos,
    video: srcOk(a.video) && /\.mp4$/i.test(a.video) ? a.video : '',
    produits: [...new Set((Array.isArray(a.produits) ? a.produits : []).map(s => str(s, 120)).filter(Boolean))].slice(0, 8),
    tags: [...new Set((Array.isArray(a.tags) ? a.tags : String(a.tags || '').split(',')).map(t => str(t, 40)).filter(Boolean))].slice(0, 8),
    seoTitre: str(a.seoTitre, 70),
    seoDescription: str(a.seoDescription, 170),
    notes: para(a.notes, 6000),
    statut: a.statut === 'publie' ? 'publie' : 'brouillon',
  };
  out.slug = before?.slug || slugify(a.slug || out.titre || 'reportage').slice(0, 80);
  out.publieLe = out.statut === 'publie' ? (before?.publieLe || a.publieLe || new Date().toISOString()) : (before?.publieLe || '');
  return out;
}

/* catalogue visible, une ligne par prestation : l'IA relie l'article aux bonnes fiches (jamais de prix ni de fournisseur) */
function catalogueBlog(c) {
  const rub = new Map((c.rubriques || []).map(r => [r.slug, r]));
  return (c.produits || []).filter(p => p.statut !== 'masque' && rub.get(p.rubrique)?.statut !== 'masque')
    .map(p => `${p.slug} | ${str(p.titre, 90)} | ${rub.get(p.rubrique)?.nom || p.rubrique}`).join('\n');
}

const REGLES = `Règles strictes :
- Français impeccable, ton chaleureux, élégant et professionnel, comme un beau reportage de magazine. Phrases claires, pas de jargon. Pas d'emoji, pas de markdown, pas de majuscules criardes.
- N'invente RIEN de factuel : aucun chiffre (invités, serveurs, pièces, mètres carrés, heures), aucun nom de client, d'entreprise, de lieu ou de ville, aucun plat, aucune anecdote, aucun avis ou citation de client qui ne figure pas dans les notes. Si une info manque, n'en parle pas. Tu peux en revanche décrire avec soin ce qui se voit sur les photos (décor, ambiance, présentation des plats) sans l'exagérer.
- Si les notes ne nomment pas le client, reste discret (« une entreprise italienne », « les mariés »). Si elles le nomment, tu peux le citer.
- Pas de prix, pas de « sur devis », pas de superlatif trompeur (« le meilleur », « n°1 »), pas de « gratuit ».
- Ne cite JAMAIS de restaurant partenaire ni d'autre traiteur : tout est préparé et servi par Magnolia Traiteur. Pour un reportage d'événement, ne cite aucun fournisseur. Pour une histoire de « La maison Magnolia », un producteur ou fournisseur de matières premières peut être nommé SEULEMENT si les notes le nomment.
- N'écris pas « à Paris et en Île-de-France ».`;

function promptArticle({ notes, categorie, typeEvenement, dateEvenement, lieu, invites, photos = [], catalogue, consigne = '', actuel = null, aujourdhui }) {
  const infos = [categorie ? `Clientèle : ${CATEGORIES[categorie] || categorie}` : '', typeEvenement ? `Type d'événement : ${typeEvenement}` : '', dateEvenement ? `Date : ${dateEvenement}` : '', lieu ? `Lieu : ${lieu}` : '', invites ? `Nombre d'invités : ${invites}` : ''].filter(Boolean).join('\n');
  return `Tu es le rédacteur du blog de Magnolia Traiteur (traiteur événementiel à Villebon-sur-Yvette, Essonne, qui livre 7 j/7 dans toute l'Île-de-France). Le blog s'appelle « Nos événements en reportage » : après chaque prestation, un reportage photo raconte l'événement, pour donner envie aux futurs clients (entreprises et particuliers) et montrer concrètement le savoir-faire de la maison. Aujourd'hui : ${aujourdhui}.
${actuel ? `Tu RÉÉCRIS le reportage existant ci-dessous en suivant la demande de l'équipe : « ${String(consigne).slice(0, 1500)} ». Garde tout ce qui n'est pas visé par la demande.` : `Rédige le reportage complet à partir des notes de l'équipe${photos.length ? ' et des photos jointes (numérotées dans l’ordre, de 1 à ' + photos.length + ')' : ''}.`}
Si les notes ne racontent pas un événement client mais la vie de la maison (un achat, un nouveau fournisseur ou producteur, un nouveau produit, un nouvel équipement, la création d'un département ou d'une spécialité, les coulisses de la cuisine, l'équipe…), c'est une histoire de « La maison Magnolia » : categorie "maison", typeEvenement parmi "Nouveau produit", "Nouveau fournisseur", "Nouveau département", "Nouvel équipement", "Coulisses de la maison", "Vie de la maison" ; raconte-la comme un récit des coulisses, à la première personne du pluriel (« nous »), sincère et vivant, en montrant ce que cela change pour les clients ; invites null.
Le texte doit être riche et à la hauteur de l'événement, mais rester agréable à lire : 3 à 5 parties de 1 à 3 paragraphes (350 à 700 mots en tout).
${REGLES}

Réponds UNIQUEMENT avec un objet JSON, sans texte autour :
{"titre":"titre accrocheur du reportage (70 caractères max), qui dit l'événement et ce qui le rend unique",
"chapo":"2 phrases d'introduction (300 caractères max)",
"categorie":"entreprise" (événement d'une entreprise), "particulier" (fête d'un particulier) ou "maison" (histoire de la maison Magnolia, sans client),
"typeEvenement":"une valeur de ${JSON.stringify(TYPES)}",
"lieu":"ville, département ou type de lieu SEULEMENT s'il est donné, sinon \\"\\"",
"invites":nombre d'invités donné dans les notes, sinon null,
"chiffres":[jusqu'à 4 chiffres clés TIRÉS DES NOTES, {"valeur":"400","libelle":"invités"}],
"sections":[{"titre":"intertitre court","texte":"paragraphes séparés par \\n"}],
"citation":{"texte":"phrase du client COPIÉE des notes","auteur":"qui l'a dite"} ou null si les notes ne contiennent aucune phrase du client,
"photos":[{"n":numéro de la photo,"legende":"légende courte et juste (90 caractères max)"}] : TOUTES les photos, dans le meilleur ordre de mise en page (la 1re sera la grande photo du haut : la plus belle, la plus large, qui montre l'événement),
"produits":[identifiants (avant le premier « | ») des prestations du catalogue ci-dessous qui correspondent CLAIREMENT à ce qui a été servi ou fourni, 0 à 6],
"tags":[3 à 6 mots-clés courts],
"seoTitre":"titre pour Google (60 caractères max)",
"seoDescription":"description pour Google (155 caractères max)"}

Infos saisies :
${infos || '(aucune)'}

Notes de l'équipe :
"""${String(notes || '').slice(0, 6000)}"""
${actuel ? `
Reportage actuel :
${JSON.stringify({ titre: actuel.titre, chapo: actuel.chapo, categorie: actuel.categorie, typeEvenement: actuel.typeEvenement, lieu: actuel.lieu, invites: actuel.invites, chiffres: actuel.chiffres, sections: actuel.sections, citation: actuel.citation, photos: (actuel.photos || []).map((p, i) => ({ n: i + 1, legende: p.legende })), produits: actuel.produits, tags: actuel.tags, seoTitre: actuel.seoTitre, seoDescription: actuel.seoDescription })}` : ''}

Catalogue Magnolia (identifiant | prestation | rubrique) :
${catalogue}`;
}

/* réponse de l'IA → champs d'article contrôlés */
function articleDepuisIa(j, { photos = [], slugsValides = new Set(), notes = '' } = {}) {
  if (!j || typeof j !== 'object') throw Object.assign(new Error('Réponse illisible.'), { code: 'ai_failed' });
  const tout = JSON.stringify([j.titre, j.chapo, j.sections, j.citation]);
  if (INTERDIT.test(tout)) j = { ...j, sections: (j.sections || []).map(s => ({ ...s, texte: String(s?.texte || '').split('\n').filter(l => !INTERDIT.test(l)).join('\n') })) };
  /* photos : l'ordre et les légendes de l'IA, sans jamais en perdre ni en ajouter */
  const vus = new Set(), ordre = [];
  for (const x of Array.isArray(j.photos) ? j.photos : []) {
    const i = (+x?.n || 0) - 1;
    if (i >= 0 && i < photos.length && !vus.has(i)) { vus.add(i); ordre.push({ src: photos[i].src, legende: str(x.legende, 200) || photos[i].legende || '' }); }
  }
  photos.forEach((p, i) => { if (!vus.has(i)) ordre.push({ src: p.src, legende: p.legende || '' }); });
  /* citation : gardée seulement si elle figure vraiment dans les notes (sinon l'IA l'aurait inventée) */
  const nrm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let citation = j.citation && j.citation.texte ? j.citation : null;
  if (citation) { const mots = nrm(citation.texte).split(' ').filter(w => w.length > 3); const n = nrm(notes); const trouves = mots.filter(w => n.includes(w)).length; if (!mots.length || trouves / mots.length < 0.7) citation = null; }
  return {
    titre: str(j.titre, 160), chapo: str(j.chapo, 600),
    categorie: CATEGORIES[j.categorie] ? j.categorie : undefined,
    typeEvenement: str(j.typeEvenement, 60), lieu: str(j.lieu, 120), invites: entier(j.invites),
    chiffres: Array.isArray(j.chiffres) ? j.chiffres : [],
    sections: Array.isArray(j.sections) ? j.sections : [],
    citation,
    photos: ordre,
    produits: (Array.isArray(j.produits) ? j.produits : []).map(String).filter(s => slugsValides.has(s)),
    tags: Array.isArray(j.tags) ? j.tags : [],
    seoTitre: str(j.seoTitre, 70), seoDescription: str(j.seoDescription, 170),
  };
}

/* ---------- rappel « préparez le prochain reportage » ---------- */
const heureParis = now => +new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date(now));
function reglagesRappel(R) { const r = { ...RAPPEL_DEFAUT, ...(R?.blog?.rappel || {}) }; r.jours = Math.min(30, Math.max(1, +r.jours || 3)); r.heure = Math.min(20, Math.max(7, +r.heure || 9)); return r; }
/* dernier repère : la dernière publication ou le dernier rappel, le plus récent des deux */
function etatRappel({ articles = [], dernierRappel = null, R = {}, now = Date.now() }) {
  const r = reglagesRappel(R);
  const pub = articles.filter(a => a.statut === 'publie' && a.publieLe).map(a => Date.parse(a.publieLe)).filter(Boolean);
  const dernierePub = pub.length ? Math.max(...pub) : null;
  const rappel = dernierRappel ? Date.parse(dernierRappel) : null;
  const repere = Math.max(dernierePub || 0, rappel || 0);
  const prochain = repere ? repere + r.jours * 86400e3 : now;
  return { ...r, dernierePublication: dernierePub ? new Date(dernierePub).toISOString() : null, dernierRappel: rappel ? new Date(rappel).toISOString() : null, prochain: new Date(prochain).toISOString(), aFaire: now >= prochain };
}
function messageRappel(site, jours) {
  const lien = site.replace(/\/$/, '') + '/admin#/blog/nouveau';
  return {
    sms: `Magnolia : c'est le moment de préparer le prochain reportage du blog ! Quelques lignes + vos photos, l'IA s'occupe du reste : ${lien}`,
    sujet: '📝 Blog Magnolia : préparez le prochain reportage',
    html: `<p>Bonjour,</p><p>Cela fait ${jours} jours depuis le dernier reportage : c'est le moment de préparer le suivant.</p><p>Racontez l'événement en quelques lignes (client, lieu, nombre d'invités, ce qui a été servi, une phrase du client si vous l'avez) et ajoutez vos photos : l'IA rédige et met en page tout le reportage. Vous relisez, puis vous cliquez sur « Publier ».</p><p><a href="${lien}" style="display:inline-block;background:#1d3b2f;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none">✨ Écrire le prochain reportage</a></p>`,
  };
}

/* date qui classe les reportages (Jean-Luc, 2026-11-27) : la date indiquée dans le back-office, sinon celle de la publication */
const dateTri = a => String(a?.dateEvenement || a?.publieLe || a?.createdAt || '').slice(0, 10);
const parDate = (a, b) => dateTri(b).localeCompare(dateTri(a)) || String(b.publieLe || b.createdAt || '').localeCompare(String(a.publieLe || a.createdAt || ''));

module.exports = { dateTri, parDate, CATEGORIES, TYPES, MAX_PHOTOS, nettoyerArticle, catalogueBlog, promptArticle, articleDepuisIa, etatRappel, reglagesRappel, messageRappel, heureParis, srcOk };
