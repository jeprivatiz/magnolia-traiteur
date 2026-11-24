'use strict';
/*
 * Factures comme dans un CRM (Jean-Luc, 2026-11-24) :
 *  - chaque règlement du client (acompte 1, 2, 3… puis solde) est noté sur la facture du devis : montant, date, moyen ;
 *  - la facture indique au client chaque acompte versé avec sa date et le solde restant dû ;
 *  - statuts : à envoyer, non réglée (en retard si l'échéance est passée), réglée, archivée, annulée par un avoir.
 * Numérotation légale : une facture émise ne se supprime jamais, on l'annule par un avoir (série A-année-n°).
 */
const { totaux, regleAcompte } = require('./devis');

const MOYENS = ['Virement', 'Carte bancaire', 'Lien de paiement', 'Chèque', 'Espèces', 'Chèques vacances / CESU', 'Autre'];

/* montant dû, réglé, reste ; une ancienne facture « payée » sans liste de règlements compte comme réglée */
function etat(f) {
  const t = totaux(f);
  const dueCents = Math.max(0, t.ttcCents - (f.dejaRegleCents || 0));
  const reglements = (f.reglements || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.at).localeCompare(String(b.at)));
  let regleCents = reglements.reduce((s, r) => s + (r.montantCents || 0), 0);
  if (!reglements.length && f.payee) regleCents = dueCents;
  const resteCents = Math.max(0, dueCents - regleCents);
  return { ttcCents: t.ttcCents, dueCents, regleCents, resteCents, tropPercuCents: Math.max(0, regleCents - dueCents), reglements, payee: f.type === 'avoir' || (dueCents > 0 && resteCents === 0) || (dueCents === 0 && regleCents > 0) };
}

/* échéance du solde : 10 jours avant l'événement (règle CGV), sinon à réception */
function echeance(f, T = {}) {
  if (f.echeance) return f.echeance;
  const delai = T.delaiDeuxFoisJours ?? 10;
  const ev = f.evenementDate;
  if (!ev || !/^\d{4}-\d\d-\d\d$/.test(ev)) return '';
  const d = new Date(ev + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - delai);
  const e = d.toISOString().slice(0, 10), emise = String(f.date || '').slice(0, 10);
  return emise && e < emise ? emise : e;
}

function statut(f, T = {}, today = new Date().toISOString().slice(0, 10)) {
  if (f.type === 'avoir') return 'avoir';
  if (f.annuleeParAvoir) return 'annulee';
  const e = etat(f);
  if (f.archivee) return 'archivee';
  if (e.payee) return 'reglee';
  if (!f.envoyeeLe) return 'a_envoyer';
  const ech = echeance(f, T);
  return ech && ech < today ? 'retard' : 'non_reglee';
}
const STATUTS = { a_envoyer: 'À envoyer', non_reglee: 'Non réglée', retard: 'En retard', reglee: 'Réglée', archivee: 'Archivée', annulee: 'Annulée (avoir)', avoir: 'Avoir' };

/* « 1 250,50 », « 1250 », « 1 250 € » → centimes (null si ce n'est pas un montant) */
function centimesTexte(q) {
  const x = String(q || '').replace(/[\s €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(x)) return null;
  return Math.round(parseFloat(x) * 100);
}

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* recherche : client, société, e-mail, n° de facture ou de devis, montant (total, reste ou un règlement) */
function correspond(f, q) {
  const brut = String(q || '').trim();
  if (!brut) return true;
  const e = etat(f), cents = centimesTexte(brut);
  if (cents != null && [e.ttcCents, e.dueCents, e.resteCents, f.totalCents, ...e.reglements.map(r => r.montantCents)].some(v => v != null && (v === cents || Math.floor(v / 100) === cents / 100))) return true;
  const hay = sansAccent([f.numero, f.devisNumero, f.client?.nom, f.client?.societe, f.client?.email, f.objet, f.factureNumero].join(' '));
  return sansAccent(brut).split(/\s+/).every(m => hay.includes(m));
}

/* règlements du client : nouvelle ligne propre */
function nouveauReglement(b = {}, par = '', rid) {
  const montantCents = Math.round(Number(b.montantCents));
  if (!Number.isFinite(montantCents) || montantCents <= 0) throw new Error('Indiquez le montant reçu.');
  const date = /^\d{4}-\d\d-\d\d$/.test(String(b.date || '')) ? b.date : new Date().toISOString().slice(0, 10);
  const moyen = MOYENS.includes(b.moyen) ? b.moyen : 'Virement';
  return { id: 'r_' + rid(6), montantCents, date, moyen, note: String(b.note || '').slice(0, 200), par, at: new Date().toISOString() };
}

/* remet à jour les champs résumés (payee, totalCents…) que lisent le tableau de bord, l'espace client et les exports */
function resume(f) {
  const e = etat(f);
  const dernier = e.reglements[e.reglements.length - 1];
  return { ...f, totalCents: e.dueCents, regleCents: e.regleCents, resteCents: e.resteCents, payee: e.payee, payeeLe: e.payee ? (f.payeeLe || dernier?.at || new Date().toISOString()) : null, moyen: dernier?.moyen || f.moyen || '' };
}

/* nom de l'acompte : « 1er acompte », « 2e acompte »… ; le dernier qui solde la facture s'appelle « Solde » */
function libelles(f) {
  const e = etat(f);
  let cumul = 0;
  return e.reglements.map((r, i) => {
    cumul += r.montantCents;
    const solde = cumul >= e.dueCents && i === e.reglements.length - 1 && e.reglements.length > 1;
    return { ...r, libelle: e.reglements.length === 1 && cumul >= e.dueCents ? 'Règlement' : solde ? 'Solde' : (i === 0 ? '1er' : (i + 1) + 'e') + ' acompte' };
  });
}

/* acompte attendu quand on enregistre le premier règlement d'un devis signé */
function montantPropose(f, devis, T) {
  const e = etat(f);
  if (!e.reglements.length && devis) { const a = regleAcompte(e.ttcCents, devis, T); return Math.min(a.cents, e.resteCents); }
  return e.resteCents;
}

module.exports = { MOYENS, STATUTS, etat, echeance, statut, correspond, centimesTexte, nouveauReglement, resume, libelles, montantPropose };
