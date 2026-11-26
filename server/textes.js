'use strict';
/*
 * Textes des fiches produits rédigés par l'IA (Jean-Luc, 2026-11-24) :
 * - « Description sous la photo » (sousPhoto) : 2-3 phrases posées une fois sur chaque fiche où elle est vide ;
 * - « ✨ Améliorer avec l'IA » : version enrichie de la Description ou de la Description sous la photo, que l'équipe relit puis enregistre.
 * Règles : rien d'inventé (ingrédient, allergène, origine, label, quantité), jamais de fournisseur ni de restaurant partenaire,
 * pas de prix (affiché à côté), pas de « sur devis », pas de « à Paris et en Île-de-France ».
 */

const INTERDIT = /himalaya|palais de|partenaire|fournisseur|restaurant|sur devis|non contractuel/i;
const espaces = s => String(s || '').replace(/\s+/g, ' ').trim();
const texte = (v, n) => espaces(Array.isArray(v) ? v.join(' ') : v).slice(0, n);

/* tout ce que la fiche dit d'elle-même, pour que l'IA n'ait rien à inventer */
function infosProduit(p, nomsRub = {}, nomsSous = {}) {
  const choix = (p.groupes || []).map(g => {
    const opts = (g.options || []).map(o => o.label).filter(Boolean);
    if (!opts.length) return '';
    if (g.compris) return `${g.titre || 'Compris dans la formule'} : ${opts.join(', ')}`;
    const n = g.parPersonne ? ` (${g.parPersonne} ${g.uniteQuantite || 'pièces'} par personne)` : g.max ? ` (${g.max} au choix)` : '';
    return `${g.titre || 'Au choix'}${n} : ${opts.slice(0, 25).join(', ')}`;
  }).filter(Boolean);
  const plus = [...(p.sections || []), ...(p.details || [])].map(x => typeof x === 'string' ? x : [x?.titre, x?.texte, Array.isArray(x?.lignes) ? x.lignes.join(', ') : x?.contenu].filter(Boolean).join(' : ')).filter(Boolean);
  return {
    slug: p.slug || p.id,
    nom: espaces(p.titre),
    rubrique: nomsRub[p.rubrique] || p.rubrique || '',
    specialite: nomsSous[p.sous] || '',
    vente: [p.unite ? 'vendu ' + (p.unite === 'personne' ? 'par personne' : 'à l’unité « ' + p.unite + ' »') : '', p.min > 1 ? 'minimum ' + p.min : '', p.contenuPortion ? 'contenu : ' + p.contenuPortion : ''].filter(Boolean).join(', '),
    infos: texte([p.extrait, ...(Array.isArray(p.description) ? p.description : [p.description])].filter((x, i, a) => x && a.indexOf(x) === i), 700).replace(/[^.]*sur devis[^.]*\.?/gi, ''),
    choix: texte(choix.join(' ; '), 900),
    plus: texte(plus.join(' ; '), 500),
  };
}

const REGLES = `Règles strictes :
- Français impeccable, ton chaleureux, gourmand et professionnel, au « vous ». Pas d'emoji, pas de guillemets, pas de majuscules criardes, pas de markdown.
- N'invente RIEN : aucun ingrédient, allergène, origine, label (bio, fait maison, frais du jour, local…), quantité, durée ou service qui ne figure pas dans les infos. Si les infos sont maigres, parle prudemment de l'usage (occasions, façon de le partager ou de le servir) sans ajouter de faits.
- Pas de prix (il est affiché à côté), pas de « sur devis », pas de superlatif trompeur (« le meilleur », « n°1 »), pas de « gratuit ».
- Ne cite JAMAIS de fournisseur, de restaurant, de partenaire ni d'autre marque que Magnolia Traiteur (sauf une marque qui fait partie du nom du produit). N'écris pas « à Paris et en Île-de-France ».`;

function promptSousPhoto(items) {
  return `Tu rédiges, pour le site de Magnolia Traiteur (traiteur événementiel à Villebon-sur-Yvette, Essonne, qui livre 7 j/7 dans toute l'Île-de-France), le petit texte affiché sous la photo de chaque fiche produit.
Pour CHAQUE produit ci-dessous : 2 ou 3 phrases (entre 180 et 380 caractères en tout) qui donnent envie et aident à choisir : ce que c'est, ce qu'il contient ou ce qu'on peut choisir (d'après les infos), pour quelles occasions.
Chaque texte doit être différent des autres.
${REGLES}
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour : [{"slug":"…","texte":"…"}]

Produits (slug | nom | rubrique | spécialité | vente | infos | choix proposés | autres détails) :
${items.map(i => [i.slug, i.nom, i.rubrique, i.specialite || '-', i.vente || '-', i.infos || '-', i.choix || '-', i.plus || '-'].join(' | ')).join('\n')}`;
}

/* « Description sous la photo » en texte simple (puces « - » et gras ** retirés) */
const sousPhotoTexte = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => String(x || '').replace(/\*\*/g, '').replace(/^[-•]\s+/, '').trim()).filter(Boolean).join('\n').slice(0, 2500);

/* « ✨ Améliorer la description avec l'IA » (Jean-Luc, 2026-11-26) : la Description (sous le tarif) devient une phrase
   d'accroche qui donne envie de commander, écrite d'après la « Description sous la photo » (la description complète du produit). */
function promptDescription(info, sousPhoto, lignes) {
  const sp = sousPhotoTexte(sousPhoto);
  return `Tu rédiges la « Description » de la fiche produit « ${info.nom} » du site de Magnolia Traiteur (traiteur événementiel à Villebon-sur-Yvette, livraison 7 j/7 dans toute l'Île-de-France). Ce texte s'affiche juste sous le prix, à côté du bouton de commande.
But : UNE phrase (deux au maximum, 260 caractères maximum en tout) qui donne envie au client de commander ce produit : ce qui le rend appétissant ou pratique, et pour quelle occasion.
Source principale : la « Description sous la photo » ci-dessous, qui décrit tout le produit. Appuie-toi d'abord sur elle ; n'en recopie pas la liste, résume-la en une accroche. Les autres infos de la fiche servent seulement de complément.
${REGLES}
Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"lignes":["la phrase"]}

Description sous la photo :
${sp || '(vide : appuie-toi sur les infos de la fiche)'}

Infos de la fiche :
nom : ${info.nom}
rubrique : ${info.rubrique}${info.specialite ? ' / ' + info.specialite : ''}
vente : ${info.vente || '-'}
choix proposés : ${info.choix || '-'}
autres détails : ${info.plus || '-'}

Description actuelle (à remplacer) :
${lignes.length ? lignes.join('\n') : '(vide)'}`;
}

function promptAmeliorer(info, champ, lignes) {
  const sp = champ === 'sousPhoto';
  return `Tu améliores un texte de la fiche produit « ${info.nom} » du site de Magnolia Traiteur (traiteur événementiel à Villebon-sur-Yvette, livraison 7 j/7 dans toute l'Île-de-France).
Texte à améliorer : ${sp ? 'la « Description sous la photo » (petit texte affiché juste sous la photo)' : 'la « Description » (un paragraphe par ligne)'}.
Garde TOUTES les informations exactes du texte actuel (compositions, quantités, nombres de pièces, durées, conditions) ; corrige le français ; rends-le plus clair et plus appétissant ; enrichis-le avec les éléments utiles trouvés dans les infos de la fiche (choix proposés, contenu, occasions).
${sp ? 'Longueur : 2 à 4 phrases (380 caractères maximum), sauf si le texte actuel est une liste structurée : garde alors sa structure ligne par ligne ; une ligne de titre peut être entourée de ** pour la mettre en gras.' : 'Longueur : 1 à 3 paragraphes courts (900 caractères maximum en tout).'}
${REGLES}
Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"lignes":["première ligne ou paragraphe", "…"]}

Infos de la fiche :
nom : ${info.nom}
rubrique : ${info.rubrique}${info.specialite ? ' / ' + info.specialite : ''}
vente : ${info.vente || '-'}
infos : ${info.infos || '-'}
choix proposés : ${info.choix || '-'}
autres détails : ${info.plus || '-'}

Texte actuel :
${lignes.length ? lignes.join('\n') : '(vide : rédige-le à partir des infos)'}`;
}

/* contrôle d'un texte rendu par l'IA : null si à rejeter */
function texteValide(t, { min = 80, max = 420 } = {}) {
  t = espaces(t).replace(/^["«»\s]+|["«»\s]+$/g, '').replace(/\*\*/g, '');
  if (t.length > max) { const c = t.slice(0, max), i = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! ')); t = i > min ? c.slice(0, i + 1) : ''; }
  if (!t || t.length < min || INTERDIT.test(t) || /paris\s+et\s+(en\s+)?[îi]le/i.test(t)) return null;
  return t;
}
function lignesValides(l, champ) {
  const lignes = (Array.isArray(l) ? l : [l]).map(x => String(x ?? '').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).slice(0, 30);
  const tout = lignes.join(' ');
  const max = champ === 'sousPhoto' ? 1200 : 1500;
  if (!lignes.length || tout.length < 30 || tout.length > max || INTERDIT.test(tout) || /paris\s+et\s+(en\s+)?[îi]le/i.test(tout)) return null;
  return champ === 'sousPhoto' ? lignes : lignes.map(x => x.replace(/\*\*/g, ''));
}

module.exports = { infosProduit, promptSousPhoto, promptAmeliorer, promptDescription, sousPhotoTexte, texteValide, lignesValides };
