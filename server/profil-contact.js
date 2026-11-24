'use strict';
/*
 * Profil d'un contact (demande de Jean-Luc, 2026-11-24, fichier « MADER ») :
 * le fichier contacts contient aussi des prestataires et talents (serveurs, barmen, DJ, magiciens…).
 * Nouvelles cases de la fiche, regroupées en 3 cadres :
 *   🎭 Profil prestataire : métiers (plusieurs), indépendant(e), permis de conduire, rémunération demandée
 *   🎧 DJ : styles de musique (plusieurs), DJ depuis (année), tarifs
 *   🤝 Origine : « contact de » (qui l'a apporté), site internet, pays
 * Ces cases se cherchent dans Clients (recherche multicritère) et dans les envois groupés e-mail / SMS.
 */
const sansAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* métiers : libellé affiché + mots qui le reconnaissent (titre de colonne ou texte libre) */
const METIERS = [
  ['Serveur / serveuse', /^serv(eur|euse)/],
  ['Barman / barmaid', /^barm(an|aid)|^bar ?tender/],
  ['Régisseur', /^regisseu/],
  ['Vigile / agent de sécurité', /^vigile|securite|agent de surete/],
  ['Agent de nettoyage', /^nettoyage|menage|plonge/],
  ['Cuisinier / traiteur', /^traiteur|^cuisin|^chef\b/],
  ['DJ', /^dj$|^d j$|^disc ?jockey/],
  ['Chanteur / musicien', /chanteu|musicien/],
  ['Animateur karaoké', /karaoke/],
  ['Magicien', /^magicien/],
  ['Mentaliste', /^mentalis/],
  ['Hypnotiseur', /^hypnotis/],
  ['Diseuse de bonne aventure', /bonne aventure|voyant/],
  ['Caricaturiste', /^caricatur/],
  ['Photographe', /^photograph/],
  ['Décorateur / décoratrice', /^decorat/],
];
const DJ_STYLES = ['Généraliste', 'Années 80', 'Disco', 'Électro', 'House', 'Techno', 'Rap', 'RnB', 'Tropical', 'Latino', 'Oriental', 'Afro', 'Antillais / zouk', 'Funk', 'Jazz', 'Rock', 'Variété française'];

const metierDe = t => { const k = sansAcc(t); if (!k) return ''; const m = METIERS.find(([, re]) => re.test(k)); return m ? m[0] : ''; };
const styleDe = t => {
  const k = sansAcc(t); if (!k || /^\d+( ans?)?$/.test(k)) return ''; /* « 18 », « 20 ans » : pas un style */
  const s = DJ_STYLES.find(x => sansAcc(x) === k);
  if (s) return s;
  if (/^(annees|years) ?80/.test(k) || k === '80s' || k === '80') return 'Années 80';
  if (/^electr/.test(k)) return 'Électro';
  if (/^r ?n ?b$/.test(k)) return 'RnB';
  if (/zouk|antill|kompa/.test(k)) return 'Antillais / zouk';
  if (/generali/.test(k)) return 'Généraliste';
  if (/variete/.test(k)) return 'Variété française';
  return String(t).trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR').replace(/^\p{L}/u, c => c.toLocaleUpperCase('fr-FR'));
};
/* « 1 », « oui », « x », « vrai »… = case cochée */
const oui = v => /^(1|oui|o|x|y|yes|vrai|true|ok)$/i.test(String(v ?? '').trim());
const non = v => /^(0|non|n|no|faux|false|-)$/i.test(String(v ?? '').trim());
const liste = v => String(v ?? '').split(/\s*[,;/|]\s*|\s+et\s+/).map(x => x.trim()).filter(Boolean);
const uniques = l => [...new Set(l.filter(Boolean))];

/* cases de la fiche (clé, libellé) utilisées par l'import, la fiche et les filtres */
const CASES = {
  metiers: 'Métiers', independant: 'Indépendant(e)', permis: 'Permis de conduire', remuneration: 'Rémunération demandée',
  djStyles: 'Styles de DJ', djDepuis: 'DJ depuis', djTarifs: 'Tarifs DJ', contactDe: 'Contact de', siteWeb: 'Site internet', pays: 'Pays',
};

module.exports = { METIERS: METIERS.map(m => m[0]), DJ_STYLES, CASES, metierDe, styleDe, oui, non, liste, uniques, sansAcc };
