'use strict';
/*
 * Commande préparée par l'IA (comme « ✨ Devis avec l'IA » de JEPRIVATIZ) :
 * infos du client en vrac (texte ou dictée) → fiche client → prestations du catalogue Magnolia → devis à vérifier.
 * L'IA ne voit que le catalogue visible (titres, prix TTC, unités, minimums) ; jamais de coût d'achat ni de fournisseur.
 * Le serveur revérifie tout ce qu'elle propose : prestation existante et visible, quantité au moins égale au minimum.
 */
const { avecPortion } = require('./util');
const LIVR = require('../public/js/livraison-paliers');

/* client Anthropic : clé ANTHROPIC_API_KEY (variable Railway). opts.ask permet aux tests de simuler l'IA. */
function createIa({ env = process.env, ask, log = console } = {}) {
  const actif = !!(ask || env.ANTHROPIC_API_KEY);
  /* images : photos jointes (JPEG en base64, réduites par le navigateur) pour que l'IA les voie */
  async function demander(prompt, { effort = 'low', maxTokens = 4000, images = [] } = {}) {
    if (ask) return String(await ask(prompt, { images }));
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Clé IA non configurée.'), { code: 'not_granted' });
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const r = await client.messages.create({
        model: env.AI_MODEL || 'claude-opus-5-5',
        max_tokens: maxTokens,
        output_config: { effort },
        messages: [{ role: 'user', content: images.length ? [...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })), { type: 'text', text: String(prompt).slice(0, 150000) }] : String(prompt).slice(0, 150000) }],
      });
      if (r.stop_reason === 'refusal') throw Object.assign(new Error('refus'), { code: 'refused' });
      return r.content.filter(b => b.type === 'text').map(b => b.text).join('');
    } catch (e) {
      if (e.code) throw e;
      log.error?.('[ia]', e.message);
      throw Object.assign(new Error('L’IA n’a pas répondu.'), { code: 'ai_failed' });
    }
  }
  return { actif, demander };
}

/* premier objet ou tableau JSON trouvé dans la réponse */
function json(t) {
  const s = String(t || ''), a = s.search(/[[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (a < 0 || b < a) throw Object.assign(new Error('json'), { code: 'ai_failed' });
  return JSON.parse(s.slice(a, b + 1));
}

const str = (v, n = 200) => (v == null ? '' : String(v).trim().slice(0, n));
const euro = c => (c / 100).toFixed(2).replace('.', ',') + ' €';

function promptFiche(texte, evenements, aujourdhui) {
  return `Tu aides l'équipe de Magnolia Traiteur (traiteur événementiel à Villebon-sur-Yvette, livraison 7 j/7 à Paris et dans toute l'Île-de-France) à créer une fiche client à partir de notes prises au téléphone. Aujourd'hui : ${aujourdhui}.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour, avec ces clés (chaîne vide ou null si l'info n'est pas donnée, n'invente rien) :
{"prenom":"","nom":"","tel":"","email":"","societe":"","type":une valeur EXACTE de ${JSON.stringify(evenements)} ou "","date":"AAAA-MM-JJ (date de l'événement ; si l'année manque, la prochaine occurrence)","horaire":"heure de livraison ou de début, ex. 19 h","invites":nombre d'invités,"cp":"code postal du lieu de livraison (5 chiffres)","ville":"ville de livraison","adresse":"adresse de livraison","serveurs":nombre de serveurs ou maîtres d'hôtel demandés (0 si rien),"heures":nombre d'heures de service (0 si rien),"vaisselle":"petit" (vaisselle jetable éco-responsable) ou "grand" (vaisselle en dur, nappage) ou "","budget":budget TTC en euros (nombre) ou null,"notes":"autres précisions utiles pour le devis (allergies, régimes, horaires, accès…)"}

Notes du commercial :
"""${String(texte).slice(0, 6000)}"""`;
}

/* catalogue compact pour l'IA : une ligne par prestation visible */
function catalogueCompact(c) {
  const rub = new Map((c.rubriques || []).map(r => [r.slug, r]));
  const visibles = (c.produits || []).filter(p => p.statut !== 'masque' && rub.get(p.rubrique)?.statut !== 'masque');
  const lignes = visibles.map(p => {
    const choix = (p.groupes || []).filter(g => !g.compris).flatMap(g => (g.options || []).map(o => o.label && (o.supCents && g.mode === 'quantites' ? `${o.label} (supplément + ${euro(o.supCents)} TTC la part)` : o.label))).filter(Boolean);
    return [p.slug, p.titre, rub.get(p.rubrique)?.nom || p.rubrique,
      p.prixCents == null ? 'prix à confirmer' : euro(p.prixCents) + ' TTC / ' + (p.unite || 'unité'),
      'min ' + (p.min || 1),
      choix.length ? 'au choix : ' + [...new Set([...choix.slice(0, 12), ...choix.filter(x => x.includes('supplément'))])].join(', ') + (choix.length > 12 ? '…' : '') : ''].filter(Boolean).join(' | ');
  });
  return { visibles, texte: lignes.join('\n') };
}

function promptProduits(fiche, texte, compact, tarifs, anciens = []) {
  return `Tu es conseiller commercial chez Magnolia Traiteur. À partir de la demande du client, compose sa commande en choisissant UNIQUEMENT des prestations de la liste ci-dessous (une ligne par prestation : identifiant | titre | rubrique | prix TTC / unité | minimum | choix possibles).
Règles :
- Reprends d'abord ce que le client a demandé explicitement (plats, buffets, quantités). S'il reste vague (« un buffet antillais pour 40 »), propose la formule la plus adaptée et les quantités pour ses invités.
- Quantité : pour une prestation « par personne », mets le nombre d'invités ; pour une prestation à la pièce ou à la portion, une quantité raisonnable pour le nombre d'invités ; JAMAIS moins que le minimum indiqué.
- Ne propose pas le personnel, la livraison ni la vaisselle (déjà gérés à part : personnel ${euro(tarifs.personnel?.heureCents || 4188)} TTC/h, livraison au km aller-retour selon le total de la commande : ${LIVR.tranches(tarifs).map(t => `${t.libelle} → ${t.prix}`).join(', ')} ; hors Île-de-France : sur consultation).
- Si le client donne un budget, respecte-le autant que possible.
- note : les choix du client pour cette prestation (ex. « entrées : accras, boudins »), sinon "". Pour un plat « supplément … la part » (ex. coq roussi), écris le nombre de parts : « plats : colombo de poulet × 20, coq roussi × 20 » (le supplément est ajouté tout seul sur le devis).
- pourquoi : raison courte en français (12 mots maximum).
${anciens.length ? `- Voici d'anciens devis de Magnolia qui ressemblent à cette demande (les signés ont plu à un client) : si l'un d'eux correspond bien, PARS DE CE DEVIS (mêmes prestations), adapte les quantités au nombre d'invités et à la demande, retire ce que le client ne veut pas, ajoute ce qu'il demande en plus. Indique son numéro dans "base" ; sinon "base" vaut "".
Anciens devis proches :
${anciens.map(a => `${a.numero} (${a.statut}${a.modele ? ', modèle' : ''}${a.type ? ', ' + a.type : ''}${a.invites ? ', ' + a.invites + ' invités' : ''}) : ${a.lignes.map(l => l.slug + ' × ' + l.qte).join(', ')}`).join('\n')}
` : ''}Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"base":"${anciens.length ? 'numéro de l’ancien devis repris, ou vide' : ''}","articles":[{"slug":"identifiant","qte":nombre,"note":"","pourquoi":""}]} (20 articles maximum).

Client : ${JSON.stringify(fiche)}

Demande d'origine :
"""${String(texte).slice(0, 6000)}"""

Prestations :
${compact.texte}`;
}

/* fiche lue par l'IA → valeurs propres et sûres */
function nettoyerFiche(j, evenements) {
  const n = v => Math.max(0, Math.round(+v || 0));
  return {
    prenom: str(j.prenom, 60), nom: str(j.nom, 80), tel: str(j.tel, 30), email: str(j.email, 160).toLowerCase(), societe: str(j.societe, 120),
    type: evenements.includes(j.type) ? j.type : '', date: /^\d{4}-\d{2}-\d{2}$/.test(str(j.date)) ? str(j.date) : '', horaire: str(j.horaire, 60),
    invites: Math.min(10000, n(j.invites)) || '', cp: /^\d{5}$/.test(str(j.cp)) ? str(j.cp) : '', ville: str(j.ville, 80), adresse: str(j.adresse, 200),
    serveurs: Math.min(50, n(j.serveurs)) || '', heures: Math.min(24, n(j.heures)) || '', vaisselle: ['petit', 'grand'].includes(j.vaisselle) ? j.vaisselle : '',
    budget: n(j.budget) || '', notes: str(j.notes, 1500),
  };
}

/* propositions de l'IA → lignes vérifiées (prestation visible, quantité ≥ minimum, prix du catalogue) */
function nettoyerArticles(liste, c, visibles) {
  const ok = new Map(visibles.map(p => [p.slug, p])), vus = new Set();
  return (Array.isArray(liste) ? liste : []).map(x => {
    const p = ok.get(str(x?.slug, 160)); if (!p || vus.has(p.slug)) return null; vus.add(p.slug);
    const min = Math.max(1, +p.min || 1);
    return { slug: p.slug, titre: p.titre, rubrique: c.rubriques.find(r => r.slug === p.rubrique)?.nom || '', unite: p.unite || '', prixCents: p.prixCents ?? null, min,
      qte: Math.max(min, Math.min(100000, Math.round(+x.qte || min))), note: str(x.note, 300), pourquoi: str(x.pourquoi, 140), photo: p.photos?.[0]?.src || '' };
  }).filter(Boolean).slice(0, 25);
}

/* ---------- « Demander à l'IA de modifier ce devis » ----------
   L'IA reçoit les lignes actuelles + la consigne de l'équipe (« supprime le DJ et mets une contorsionniste »)
   et répond par une liste d'opérations. Le serveur applique ces opérations lui-même : prix, coût et TVA
   viennent toujours du catalogue, quantité jamais sous le minimum. Rien n'est enregistré : l'équipe valide. */
function promptModif({ lignes, evenement, remiseCents, consigne, compact, tarifs }) {
  const L = (lignes || []).map((l, i) => l.type === 'titre'
    ? `${i} | TITRE | ${str(l.designation, 120)}`
    : `${i} | ${str(l.designation, 120)}${l.detail ? ' (' + str(l.detail, 120) + ')' : ''} | qte ${l.qte} ${l.unite || ''} | ${euro(l.puCents || 0)} TTC l'unité${l.produit ? ' | catalogue : ' + l.produit : ' | ligne libre'}`).join('\n');
  return `Tu es conseiller commercial chez Magnolia Traiteur. Voici un devis en cours. L'équipe te demande une modification. Applique EXACTEMENT ce qui est demandé, rien de plus.
Réponds UNIQUEMENT avec un objet JSON, sans texte autour :
{"operations":[...],"explication":"une phrase en français qui résume ce que tu as fait"}
Opérations possibles (indices = numéros de ligne ci-dessous, ceux du devis AVANT modification) :
- {"op":"supprimer","ligne":3}
- {"op":"quantite","ligne":3,"qte":80}
- {"op":"prix","ligne":3,"puTTC":12.5}  (seulement si l'équipe demande un prix précis)
- {"op":"texte","ligne":3,"designation":"…","detail":"…"}
- {"op":"ajouter","slug":"identifiant du catalogue","qte":40,"detail":"","apres":3}  ("apres" = indice de la ligne après laquelle insérer, -1 pour le début, absent = à la fin ; pour REMPLACER une ligne, supprime-la et ajoute la nouvelle avec "apres" = son indice)
- {"op":"personnel","serveurs":2,"heures":5,"apres":3}  (personnel de service à ${euro(tarifs.personnel?.heureCents || 4188)} TTC l'heure)
- {"op":"libre","designation":"…","detail":"","qte":1,"unite":"forfait","puTTC":150,"tva":20,"apres":3}  (seulement si rien ne convient dans le catalogue ET que l'équipe donne le prix)
- {"op":"titre","designation":"…","apres":3}
- {"op":"invites","nombre":80}  (change le nombre d'invités de l'événement ; si l'équipe le demande, adapte aussi avec "quantite" les lignes vendues par personne)
- {"op":"remise","euros":50}  (remise TTC sur le total ; 0 pour l'enlever)
Règles : choisis les prestations UNIQUEMENT dans le catalogue ci-dessous (une ligne : identifiant | titre | rubrique | prix | minimum) ; quantité jamais sous le minimum. Si la demande est impossible ou floue, renvoie "operations":[] et explique pourquoi dans "explication".

Événement : ${JSON.stringify({ type: evenement?.type || '', date: evenement?.date || '', invites: evenement?.invites || '', lieu: evenement?.lieu || '' })}
Remise actuelle : ${euro(remiseCents || 0)}

Lignes du devis (indice | désignation | quantité | prix TTC | origine) :
${L || '(aucune ligne)'}

Demande de l'équipe :
"""${String(consigne).slice(0, 3000)}"""

Catalogue :
${compact.texte}`;
}

function appliquerModif(rep, { lignes, evenement, remiseCents }, c, visibles, tarifs = {}) {
  const ok = new Map(visibles.map(p => [p.slug, p]));
  const src = (lignes || []).map(l => ({ ...l }));
  const ops = (Array.isArray(rep?.operations) ? rep.operations : []).slice(0, 60);
  const idx = v => { const n = Math.round(+v); return Number.isInteger(n) && n >= 0 && n < src.length ? n : null; };
  const suppr = new Set(), inserts = new Map(), changes = [];
  const pos = v => { const n = Math.round(+v); return v == null || v === '' || Number.isNaN(n) ? 'fin' : n < 0 ? -1 : Math.min(n, src.length - 1); };
  const inserer = (apres, l) => { const k = pos(apres); if (!inserts.has(k)) inserts.set(k, []); inserts.get(k).push(l); };
  let inv = evenement?.invites ?? null, remise = remiseCents || 0;
  for (const o of ops) {
    const op = str(o?.op, 20);
    if (op === 'supprimer') { const i = idx(o.ligne); if (i != null && !suppr.has(i)) { suppr.add(i); changes.push({ type: 'retire', texte: src[i].designation + (src[i].type === 'titre' ? ' (titre)' : ` · ${src[i].qte} ${src[i].unite || ''}`.trimEnd()) }); } }
    else if (op === 'quantite') {
      const i = idx(o.ligne); if (i == null || src[i].type === 'titre') continue;
      const p = src[i].produit ? c.bySlug?.get(src[i].produit) : null, min = Math.max(1, +(p?.min || 1));
      const q = Math.max(p ? min : 0.01, Math.min(100000, +String(o.qte).replace(',', '.') || 0));
      if (q && q !== +src[i].qte) { changes.push({ type: 'modifie', texte: `${src[i].designation} : quantité ${src[i].qte} → ${q}${p && q === min && +o.qte < min ? ' (minimum)' : ''}` }); src[i].qte = q; }
    } else if (op === 'prix') {
      const i = idx(o.ligne), pu = Math.round(+String(o.puTTC).replace(',', '.') * 100); if (i == null || src[i].type === 'titre' || !(pu >= 0)) continue;
      if (pu !== src[i].puCents) { changes.push({ type: 'modifie', texte: `${src[i].designation} : prix ${euro(src[i].puCents || 0)} → ${euro(pu)}` }); src[i].puCents = pu; }
    } else if (op === 'texte') {
      const i = idx(o.ligne); if (i == null) continue;
      const d = str(o.designation, 200), det = o.detail != null ? str(o.detail, 400) : null;
      if (d && d !== src[i].designation) { changes.push({ type: 'modifie', texte: `« ${src[i].designation} » → « ${d} »` }); src[i].designation = d; }
      if (det != null && det !== (src[i].detail || '')) { src[i].detail = det; if (!d) changes.push({ type: 'modifie', texte: `${src[i].designation} : détail modifié` }); }
    } else if (op === 'ajouter') {
      const p = ok.get(str(o.slug, 160)); if (!p) continue;
      const min = Math.max(1, +p.min || 1), q = Math.max(min, Math.min(100000, Math.round(+o.qte || min)));
      const l = { designation: avecPortion(p.titre), detail: str(o.detail, 400), qte: q, unite: p.unite || 'unité', puCents: p.prixCents ?? 0, coutCents: p.coutCents ?? null, tva: p.tva ?? 10, produit: p.slug };
      inserer(o.apres, l); changes.push({ type: 'ajoute', texte: `${p.titre} · ${q} ${p.unite || ''} × ${p.prixCents == null ? 'prix à confirmer' : euro(p.prixCents)}`.replace(/\s+·/, ' ·') });
    } else if (op === 'personnel') {
      const nb = Math.max(1, Math.min(50, Math.round(+o.serveurs || 1))), h = Math.max(tarifs.personnel?.minHeures || 4, Math.min(24, Math.round(+o.heures || 0)));
      inserer(o.apres, { designation: tarifs.personnel?.label || 'Personnel de service', detail: `${nb} pers. × ${h} h`, qte: nb * h, unite: 'heure', puCents: tarifs.personnel?.heureCents || 4188, coutCents: null, tva: 20 });
      changes.push({ type: 'ajoute', texte: `Personnel de service · ${nb} pers. × ${h} h` });
    } else if (op === 'libre') {
      const d = str(o.designation, 200), pu = Math.round(+String(o.puTTC).replace(',', '.') * 100); if (!d || !(pu >= 0)) continue;
      const q = Math.max(0.01, Math.min(100000, +o.qte || 1));
      inserer(o.apres, { designation: d, detail: str(o.detail, 400), qte: q, unite: str(o.unite, 30) || 'forfait', puCents: pu, coutCents: null, tva: [5.5, 10, 20].includes(+o.tva) ? +o.tva : 20 });
      changes.push({ type: 'ajoute', texte: `${d} · ${q} × ${euro(pu)} (ligne libre)` });
    } else if (op === 'titre') {
      const d = str(o.designation, 120); if (!d) continue; inserer(o.apres, { type: 'titre', designation: d }); changes.push({ type: 'ajoute', texte: `Titre « ${d} »` });
    } else if (op === 'invites') {
      const n = Math.max(1, Math.min(10000, Math.round(+o.nombre || 0))); if (n && n !== +inv) { changes.push({ type: 'modifie', texte: `Invités : ${inv || '—'} → ${n}` }); inv = n; }
    } else if (op === 'remise') {
      const r = Math.max(0, Math.round(+String(o.euros).replace(',', '.') * 100) || 0); if (r !== remise) { changes.push({ type: 'modifie', texte: `Remise : ${euro(remise)} → ${euro(r)}` }); remise = r; }
    }
  }
  const out = [...(inserts.get(-1) || [])];
  src.forEach((l, i) => { if (!suppr.has(i)) out.push(l); out.push(...(inserts.get(i) || [])); });
  out.push(...(inserts.get('fin') || []));
  return { lignes: out.slice(0, 300), invites: inv, remiseCents: remise, changements: changes, explication: str(rep?.explication, 400) };
}

/* ---------- envois groupés : e-mail et SMS d'information rédigés par l'IA ---------- */
const MAISON = `Magnolia Traiteur : traiteur événementiel (Villebon-sur-Yvette, 91), livraison 7 j/7 à Paris et dans toute l'Île-de-France. Dix cuisines du monde (antillaise, libanaise, indienne, chinoise, japonaise, italienne, africaine…), la carte du chef, cocktails, buffets, plateaux, animations, personnel de service, vaisselle, lieux de réception. Ton : chaleureux, élégant, simple, vouvoiement.`;
function promptEmail(infos, { ton = '', site = '' } = {}) {
  return `${MAISON}
Rédige un e-mail d'information envoyé à nos clients à partir des informations ci-dessous (données en vrac par l'équipe).
Règles :
- En français, vouvoiement, phrases courtes et claires, sans fautes. N'invente AUCUN prix, date, pourcentage ou offre qui n'est pas dans les informations.
- Commence le corps par « Bonjour {prenom}, » ({prenom} sera remplacé par le prénom du client).
- Corps : 3 à 6 courts paragraphes séparés par une ligne vide. Tu peux mettre en gras avec **…** les 2 ou 3 informations clés, et une liste avec des lignes commençant par « - » si utile. Pas de signature (elle est ajoutée automatiquement), pas de lien de désinscription (ajouté automatiquement).
- objet : accrocheur, 60 caractères maximum, sans majuscules partout, un emoji au plus.
- titre : grand titre affiché en haut de l'e-mail, 8 mots maximum.
- bouton : texte d'un bouton d'action (4 mots maximum, ex. « Demander un devis ») et lien : une adresse donnée dans les informations, sinon "${site}/contact".
${ton ? '- Ton souhaité : ' + ton + '.\n' : ''}Réponds UNIQUEMENT avec un objet JSON, sans texte autour : {"objet":"","titre":"","corps":"","bouton":{"texte":"","lien":""}}

Informations :
"""${String(infos).slice(0, 6000)}"""`;
}
function promptSms(infos, { nbSms = 1, max = 160 } = {}) {
  return `${MAISON}
Rédige un SMS d'information envoyé à nos clients à partir des informations ci-dessous (données en vrac par l'équipe).
Règles impératives :
- ${max} caractères MAXIMUM au total (espaces compris) — c'est ${nbSms} SMS. Compte bien.
- Commence par « Magnolia Traiteur : » puis « Bonjour {prenom}, » ou directement le message si la place manque ({prenom} sera remplacé par le prénom).
- Écris sans accents circonflexes ni ç (ex. « fete », « garcon ») et sans guillemets typographiques, pour que le SMS reste au format standard. Les é è à ù sont permis.
- N'invente AUCUN prix, date ou offre absente des informations. Mets le numéro 07 63 66 98 92 si la place le permet. N'écris PAS l'adresse du site internet : elle est ajoutée automatiquement à la fin.
- N'ajoute PAS la mention STOP (ajoutée automatiquement), ni emoji.
Réponds UNIQUEMENT avec un objet JSON : {"texte":""}

Informations :
"""${String(infos).slice(0, 4000)}"""`;
}
function nettoyerEmail(j, site = '') {
  const b = j?.bouton || {};
  const lien = str(b.lien, 300);
  return { objet: str(j?.objet, 120), titre: str(j?.titre, 120), corps: str(j?.corps, 6000).replace(/\r/g, ''), bouton: { texte: str(b.texte, 40), lien: /^https?:\/\//.test(lien) || lien.startsWith('/') ? lien : site + '/contact' } };
}

module.exports = { promptEmail, promptSms, nettoyerEmail, createIa, json, promptFiche, catalogueCompact, promptProduits, nettoyerFiche, nettoyerArticles, promptModif, appliquerModif };
