'use strict';
/* Droits détaillés des membres de l'équipe (Jean-Luc, 2026-11-24).
   Chaque compte a des cases à cocher ; « Administrateur » donne tout.
   Les anciens comptes gardent ce qu'ils pouvaient faire avant : Manager = Administrateur, Collaborateur = droits courants. */

const DROITS = [
  { k: 'admin', nom: 'Administrateur', aide: 'Peut tout faire, y compris gérer l’équipe et les droits de chacun.' },
  { k: 'toutes', nom: 'Voir toutes les opportunités', aide: 'Sinon, la personne ne voit que ses propres demandes, devis et factures, plus les nouvelles demandes du site que personne n’a encore prises.' },
  { k: 'produits', nom: 'Gérer les produits', aide: 'Catalogue, rubriques et lieux : créer, modifier, masquer, supprimer des fiches et leurs photos.' },
  { k: 'prix', nom: 'Modifier les prix', aide: 'Prix de vente et coûts de revient du catalogue, tarifs de livraison, de personnel et de vaisselle.' },
  { k: 'fichiers', nom: 'Imports et exports de fichiers', aide: 'Télécharger les fichiers Excel, importer des clients, mettre le catalogue à jour par fichier.' },
  { k: 'diffusion', nom: 'Envois groupés e-mail et SMS', aide: 'Envoyer un e-mail ou un SMS à plusieurs clients d’un coup.' },
  { k: 'factures', nom: 'Factures et règlements', aide: 'Créer et envoyer les factures, noter les paiements, faire un avoir.' },
  { k: 'effacerDevis', nom: 'Effacer des devis', aide: 'Mettre des devis à la corbeille (jamais un devis signé ou facturé).' },
  { k: 'effacerContacts', nom: 'Effacer des contacts', aide: 'Cocher des contacts dans Clients et les effacer (jamais un contact qui a une demande, un devis ou une facture). Annulable.' },
  { k: 'devisSignes', nom: 'Modifier un devis signé', aide: 'Changer un devis déjà signé par le client.' },
  { k: 'site', nom: 'Photos et textes du site', aide: 'Bandeaux, textes de l’accueil, avis clients, médiathèque.' },
  { k: 'entreprise', nom: 'Mon entreprise', aide: 'SIRET, assurance, banque et IBAN, logo des devis et factures.' },
  { k: 'outils', nom: 'Modèles de relance et CGV', aide: 'Écran Outils : modèles de relance, CGV et pages légales.' },
  { k: 'equipe', nom: 'Gérer l’équipe', aide: 'Ajouter des personnes, changer leurs droits, alertes de l’équipe, journal d’activité.' },
];
const CLES = DROITS.map(d => d.k);
/* ce que pouvait faire un « Collaborateur » avant les droits détaillés */
const COLLAB_AVANT = { toutes: true, produits: true, prix: true, diffusion: true, factures: true, site: true, outils: true };
/* modèles proposés dans « + Ajouter une personne » */
const MODELES = {
  commercial: { nom: 'Commercial', droits: { diffusion: true } },
  produits: { nom: 'Responsable produits', droits: { toutes: true, produits: true, prix: true, site: true, fichiers: true } },
  bureau: { nom: 'Assistante / comptabilité', droits: { toutes: true, factures: true, fichiers: true, entreprise: true, outils: true } },
  admin: { nom: 'Administrateur', droits: { admin: true } },
};

const tout = () => Object.fromEntries(CLES.map(k => [k, true]));
function nettoyer(d) {
  const o = Object.fromEntries(CLES.map(k => [k, !!(d && d[k] === true)]));
  return o.admin ? tout() : o;
}
/* droits réels d'un compte */
function droitsDe(u) {
  if (!u) return nettoyer({});
  if (u.droits && typeof u.droits === 'object') return nettoyer(u.droits);
  return u.role === 'manager' ? tout() : nettoyer(COLLAB_AVANT);
}
const roleDe = d => (d.admin ? 'manager' : 'collab');

module.exports = { DROITS, CLES, MODELES, droitsDe, nettoyer, roleDe, COLLAB_AVANT };
