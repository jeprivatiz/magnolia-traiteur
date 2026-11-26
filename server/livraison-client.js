/* Adresse et horaire de livraison sur la fiche client (Jean-Luc, 2026-11-26).
   La fiche garde l'adresse de facturation (adresse, cp, ville) et, à côté, `livraison` :
   { identique, adresse, cp, ville, horaire, logement, niveau, etage, ascenseur, acces[], digicode, contact, contactTel, remarque }.
   Les cases « pour les livreurs » (étage, ascenseur, maison/appartement, digicode, stationnement…) aident l'équipe à préparer la livraison.
   Mêmes listes que public/admin/admin.js (LIV_*). */
const LOGEMENTS = ['Maison', 'Appartement', 'Entreprise / bureaux', 'Salle de réception', 'Extérieur / jardin'];
const NIVEAUX = ['Rez-de-chaussée', 'En étage'];
const ASCENSEURS = ['Oui', 'Non', 'Monte-charge'];
const ACCES = ['Digicode', 'Interphone', 'Gardien ou badge', 'Escaliers ou marches', 'Couloirs ou portes étroits', 'Stationnement facile devant', 'Stationnement difficile', 'Place de livraison réservée', 'Accès camion difficile', 'Entrée de service / par l’arrière'];
const HORAIRES = ['Matin (8 h – 12 h)', 'Midi (11 h – 13 h)', 'Après-midi (13 h – 17 h)', 'Soir (17 h – 20 h)', 'À préciser avec l’équipe'];

const s = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const dans = (v, l) => (l.includes(v) ? v : '');

/* nettoie la livraison d'une fiche avant enregistrement */
function nette(l) {
  if (!l || typeof l !== 'object') return undefined;
  const o = {
    identique: l.identique === true || l.identique === 'on' || l.identique === 'true',
    adresse: String(l.adresse ?? '').trim().slice(0, 300), cp: s(l.cp, 5).replace(/\D/g, ''), ville: s(l.ville, 80),
    horaire: s(l.horaire, 80), logement: dans(s(l.logement), LOGEMENTS), niveau: dans(s(l.niveau), NIVEAUX),
    etage: s(l.etage, 20), ascenseur: dans(s(l.ascenseur), ASCENSEURS),
    acces: [...new Set((Array.isArray(l.acces) ? l.acces : []).map(x => s(x, 60)).filter(x => ACCES.includes(x)))],
    digicode: s(l.digicode, 40), contact: s(l.contact, 80), contactTel: s(l.contactTel, 30), remarque: String(l.remarque ?? '').trim().slice(0, 1000),
  };
  if (o.niveau !== 'En étage') { o.etage = ''; o.ascenseur = ''; }
  if (!o.acces.includes('Digicode')) o.digicode = '';
  if (o.identique) { o.adresse = ''; o.cp = ''; o.ville = ''; }
  return o;
}

/* adresse où livrer : celle de livraison, ou celle de facturation si « identique » */
function adresseLivraison(c) {
  const l = (c && c.livraison) || {};
  if (l.identique) return { adresse: c.adresse || '', cp: c.cp || '', ville: c.ville || '', horaire: l.horaire || '' };
  return { adresse: l.adresse || '', cp: l.cp || '', ville: l.ville || '', horaire: l.horaire || '' };
}

/* une phrase pour les livreurs : « Appartement · 3e étage, ascenseur : non · Digicode 4512B · Stationnement difficile · Contact sur place : … » */
function infosLivreurs(l) {
  if (!l) return '';
  const etage = l.niveau === 'En étage' ? `étage ${l.etage || '?'}${l.ascenseur ? ', ascenseur : ' + l.ascenseur.toLowerCase() : ''}` : l.niveau === 'Rez-de-chaussée' ? 'rez-de-chaussée' : '';
  const acc = (l.acces || []).map(a => (a === 'Digicode' && l.digicode ? 'digicode ' + l.digicode : a.toLowerCase()));
  const t = [l.logement, etage, ...acc, l.contact || l.contactTel ? 'contact sur place : ' + [l.contact, l.contactTel].filter(Boolean).join(' ') : '', l.remarque].filter(Boolean).join(' · ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

module.exports = { LOGEMENTS, NIVEAUX, ASCENSEURS, ACCES, HORAIRES, nette, adresseLivraison, infosLivreurs };
