'use strict';
/*
 * Commande préparée par l'IA (comme « ✨ Devis avec l'IA » de JEPRIVATIZ) :
 * infos du client en vrac (texte ou dictée) → fiche client → prestations du catalogue Magnolia → devis à vérifier.
 * L'IA ne voit que le catalogue visible (titres, prix TTC, unités, minimums) ; jamais de coût d'achat ni de fournisseur.
 * Le serveur revérifie tout ce qu'elle propose : prestation existante et visible, quantité au moins égale au minimum.
 */

/* client Anthropic : clé ANTHROPIC_API_KEY (variable Railway). opts.ask permet aux tests de simuler l'IA. */
function createIa({ env = process.env, ask, log = console } = {}) {
  const actif = !!(ask || env.ANTHROPIC_API_KEY);
  async function demander(prompt, { effort = 'low', maxTokens = 4000 } = {}) {
    if (ask) return String(await ask(prompt));
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('Clé IA non configurée.'), { code: 'not_granted' });
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const r = await client.messages.create({
        model: env.AI_MODEL || 'claude-opus-5-5',
        max_tokens: maxTokens,
        output_config: { effort },
        messages: [{ role: 'user', content: String(prompt).slice(0, 150000) }],
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
    const choix = (p.groupes || []).flatMap(g => (g.options || []).map(o => o.label)).filter(Boolean);
    return [p.slug, p.titre, rub.get(p.rubrique)?.nom || p.rubrique,
      p.prixCents == null ? 'prix à confirmer' : euro(p.prixCents) + ' TTC / ' + (p.unite || 'unité'),
      'min ' + (p.min || 1),
      choix.length ? 'au choix : ' + choix.slice(0, 12).join(', ') + (choix.length > 12 ? '…' : '') : ''].filter(Boolean).join(' | ');
  });
  return { visibles, texte: lignes.join('\n') };
}

function promptProduits(fiche, texte, compact, tarifs) {
  return `Tu es conseiller commercial chez Magnolia Traiteur. À partir de la demande du client, compose sa commande en choisissant UNIQUEMENT des prestations de la liste ci-dessous (une ligne par prestation : identifiant | titre | rubrique | prix TTC / unité | minimum | choix possibles).
Règles :
- Reprends d'abord ce que le client a demandé explicitement (plats, buffets, quantités). S'il reste vague (« un buffet antillais pour 40 »), propose la formule la plus adaptée et les quantités pour ses invités.
- Quantité : pour une prestation « par personne », mets le nombre d'invités ; pour une prestation à la pièce ou à la portion, une quantité raisonnable pour le nombre d'invités ; JAMAIS moins que le minimum indiqué.
- Ne propose pas le personnel, la livraison ni la vaisselle (déjà gérés à part : personnel ${euro(tarifs.personnel?.heureCents || 4188)} TTC/h, livraison ${euro(tarifs.kmCents || 100)} TTC/km aller-retour).
- Si le client donne un budget, respecte-le autant que possible.
- note : les choix du client pour cette prestation (ex. « entrées : accras, boudins »), sinon "".
- pourquoi : raison courte en français (12 mots maximum).
Réponds UNIQUEMENT avec un tableau JSON, sans texte autour : [{"slug":"identifiant","qte":nombre,"note":"","pourquoi":""}] (20 lignes maximum).

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

module.exports = { createIa, json, promptFiche, catalogueCompact, promptProduits, nettoyerFiche, nettoyerArticles };
