'use strict';
/* Rémunération par action (Jean-Luc, 2026-11-27).
   Chaque action d'un membre de l'équipe, lue dans le journal d'activité, rapporte le montant fixé dans le barème
   (Équipe & activité › Rémunération par action). Montants à 0 € tant que l'administrateur ne les a pas remplis.
   « une fois par jour » : la même fiche modifiée dix fois le même jour par la même personne ne compte qu'une fois. */

const ACTIONS = [
  { k: 'client_cree', groupe: 'Clients', nom: 'Créer une fiche client', ops: ['création'], coll: 'clients' },
  { k: 'client_modifie', groupe: 'Clients', nom: 'Modifier une fiche client', ops: ['modification'], coll: 'clients', unique: true },
  { k: 'entreprise_creee', groupe: 'Clients', nom: 'Créer une fiche entreprise', ops: ['création'], coll: 'entreprises' },
  { k: 'entreprise_modifiee', groupe: 'Clients', nom: 'Modifier une fiche entreprise', ops: ['modification', 'contact relié'], coll: 'entreprises', unique: true },
  { k: 'note', groupe: 'Clients', nom: 'Écrire une note sur un client', ops: ['note client'] },
  { k: 'appel', groupe: 'Clients', nom: 'Noter un appel passé', ops: ['appel noté'] },
  { k: 'rdv', groupe: 'Clients', nom: 'Programmer un appel ou une visio', ops: ['appel programmé', 'visio programmée'] },
  { k: 'anniversaire', groupe: 'Clients', nom: 'Souhaiter un anniversaire', ops: ['anniversaire souhaité'] },
  { k: 'envoi_groupe', groupe: 'Clients', nom: 'Faire un envoi groupé (e-mail ou SMS)', ops: ['e-mail groupé envoyé', 'SMS groupé envoyé'] },
  { k: 'devis_cree', groupe: 'Devis', nom: 'Créer un devis', ops: ['devis créé', 'devis dupliqué', 'ancien devis repris', 'commande préparée avec l’IA'] },
  { k: 'devis_modifie', groupe: 'Devis', nom: 'Modifier un devis', ops: ['modification'], coll: 'devis', unique: true },
  { k: 'devis_envoye', groupe: 'Devis', nom: 'Envoyer un devis', ops: ['devis envoyé'] },
  { k: 'relance', groupe: 'Devis', nom: 'Relancer un client sur un devis', ops: ['relance envoyée'] },
  { k: 'devis_signe', groupe: 'Devis', nom: 'Devis signé par le client (pour le commercial du devis)', signe: true },
  { k: 'facture_creee', groupe: 'Factures', nom: 'Créer une facture', ops: ['facture créée'] },
  { k: 'facture_envoyee', groupe: 'Factures', nom: 'Envoyer ou relancer une facture', ops: ['facture envoyée', 'relance facture'] },
  { k: 'reglement', groupe: 'Factures', nom: 'Enregistrer un règlement', ops: ['règlement enregistré'] },
  { k: 'produit_cree', groupe: 'Catalogue et site', nom: 'Créer une fiche produit', ops: ['création'], coll: 'produits' },
  { k: 'produit_modifie', groupe: 'Catalogue et site', nom: 'Modifier une fiche produit', ops: ['modification'], coll: 'produits', unique: true },
  { k: 'lieu_cree', groupe: 'Catalogue et site', nom: 'Créer une fiche lieu', ops: ['création'], coll: 'lieux' },
  { k: 'lieu_modifie', groupe: 'Catalogue et site', nom: 'Modifier une fiche lieu', ops: ['modification'], coll: 'lieux', unique: true },
  { k: 'blog_cree', groupe: 'Catalogue et site', nom: 'Écrire un reportage du blog', ops: ['création', 'rédaction IA'], coll: 'blog' },
  { k: 'blog_publie', groupe: 'Catalogue et site', nom: 'Publier un reportage du blog', ops: ['publication'], coll: 'blog' },
];
const PAR_K = new Map(ACTIONS.map(a => [a.k, a]));

/* action du barème qui correspond à une ligne du journal (ou null) */
function actionDe(r) {
  const coll = String(r.path || '').split('/')[0];
  return ACTIONS.find(a => a.ops && a.ops.includes(r.op) && (!a.coll || a.coll === coll)) || null;
}

/* montants saisis en euros (« 2,50 », 2.5) → centimes, bornés */
function nettoyerBareme(montants) {
  const o = {};
  for (const a of ACTIONS) {
    const v = montants?.[a.k];
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
    o[a.k] = Number.isFinite(n) && n > 0 ? Math.min(100000, Math.round(n * 100)) : 0;
  }
  return o;
}

/* gains par personne : rows = lignes du journal ; signes = [{ at, uid, who }] pour les devis signés ;
   personnes = Map(cle -> who) des comptes de l'équipe ; seuls les comptes de l'équipe sont payés (pas l'IA ni le site) */
function calculer({ rows, signes = [], cents, dansJour, jourDe, comptes }) {
  const pers = new Map();
  const vus = new Set();
  const ajout = (uid, who, k, r) => {
    let p = pers.get(uid); if (!p) pers.set(uid, p = { cle: uid, who: comptes.get(uid) || who || '', totalCents: 0, nb: 0, detail: {} });
    const d = p.detail[k] || (p.detail[k] = { k, nb: 0, cents: cents[k] || 0, totalCents: 0, exemples: [] });
    d.nb++; d.totalCents += d.cents; p.nb++; p.totalCents += d.cents;
    if (d.exemples.length < 30) d.exemples.push({ at: r.at, resume: r.resume || r.path || '' });
  };
  for (const r of rows) {
    if (!r.uid || !comptes.has(r.uid)) continue;
    const j = jourDe(r.at); if (!dansJour(j)) continue;
    const a = actionDe(r); if (!a) continue;
    if (a.unique) { const c = [r.uid, a.k, r.path, j].join('|'); if (vus.has(c)) continue; vus.add(c); }
    ajout(r.uid, r.who, a.k, r);
  }
  for (const s of signes) {
    if (!s.uid || !comptes.has(s.uid) || !dansJour(jourDe(s.at))) continue;
    ajout(s.uid, s.who, 'devis_signe', s);
  }
  const personnes = [...pers.values()].map(p => ({ ...p, detail: ACTIONS.map(a => p.detail[a.k]).filter(Boolean) }))
    .sort((a, b) => b.totalCents - a.totalCents || b.nb - a.nb || a.who.localeCompare(b.who, 'fr'));
  return personnes;
}

module.exports = { ACTIONS, PAR_K, actionDe, nettoyerBareme, calculer };
