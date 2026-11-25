/* Frais de livraison par paliers (Jean-Luc, 2026-11-25) : le prix du km aller-retour dépend du total TTC de la commande.
   De 0 à 400 € : 1 € · de 401 à 700 € : 0,80 € · de 701 à 990 € : 0,50 € · de 991 à 2 500 € : 0,30 € · plus de 2 500 € : offerte.
   Fichier partagé : utilisé par le serveur (require) et par le site / le back-office (window.MGLivr). Modifiable dans Réglages > Tarifs communs. */
(function (root, f) { const m = f(); if (typeof module === 'object' && module.exports) module.exports = m; else root.MGLivr = m; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* jusquaCents = borne haute INCLUSE du total de commande TTC (null = au-delà, dernier palier) ; kmCents = prix du km aller-retour TTC */
  const DEFAUT = [
    { jusquaCents: 40000, kmCents: 100 },
    { jusquaCents: 70000, kmCents: 80 },
    { jusquaCents: 99000, kmCents: 50 },
    { jusquaCents: 250000, kmCents: 30 },
    { jusquaCents: null, kmCents: 0 },
  ];
  const nb = v => (v === null || v === undefined || v === '' ? null : Math.max(0, Math.round(+v) || 0));
  function paliers(T) {
    const src = Array.isArray(T && T.livraisonPaliers) && T.livraisonPaliers.length ? T.livraisonPaliers : DEFAUT;
    const p = src.map(x => ({ jusquaCents: nb(x.jusquaCents), kmCents: nb(x.kmCents) || 0 }));
    const fixes = p.filter(x => x.jusquaCents != null).sort((a, b) => a.jusquaCents - b.jusquaCents);
    const dernier = p.find(x => x.jusquaCents == null) || { jusquaCents: null, kmCents: fixes.length ? fixes[fixes.length - 1].kmCents : 100 };
    return [...fixes, dernier];
  }
  function indice(T, totalCents) { const p = paliers(T), t = Math.max(0, +totalCents || 0); const i = p.findIndex(x => x.jusquaCents == null || t <= x.jusquaCents); return i < 0 ? p.length - 1 : i; }
  /* prix du km aller-retour TTC pour ce total de commande */
  function kmCents(T, totalCents) { return paliers(T)[indice(T, totalCents)].kmCents; }
  /* frais de livraison TTC : km × prix du km du palier */
  function frais(T, totalCents, km) { return Math.max(0, Math.round(+km || 0)) * kmCents(T, totalCents); }
  /* montant à partir duquel la livraison est offerte (null = jamais) */
  function offerteDes(T) { const p = paliers(T); const i = p.findIndex(x => x.kmCents === 0); return i < 0 ? null : i === 0 ? 0 : p[i - 1].jusquaCents; }
  /* palier suivant (moins cher) : { manqueCents, seuilCents (à dépasser), actuelCents, suivantCents } ou null au dernier palier / déjà offert */
  function suivant(T, totalCents) {
    const p = paliers(T), i = indice(T, totalCents), t = Math.max(0, +totalCents || 0);
    if (p[i].kmCents === 0) return null;
    for (let j = i + 1; j < p.length; j++) if (p[j].kmCents < p[i].kmCents) {
      const seuil = p[j - 1].jusquaCents;
      return { manqueCents: Math.max(1, seuil - t), seuilCents: seuil, actuelCents: p[i].kmCents, suivantCents: p[j].kmCents };
    }
    return null;
  }
  const eur = c => (c / 100).toLocaleString('fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €';
  /* lignes lisibles : « De 0 à 400 € », « De 401 à 700 € », « Plus de 2 500 € » */
  function tranches(T) {
    const p = paliers(T);
    return p.map((x, i) => {
      const de = i === 0 ? 0 : p[i - 1].jusquaCents;
      const deTxt = i === 0 ? '0' : eur(de + 100).replace(/ €$/, '');
      const libelle = x.jusquaCents == null ? `Plus de ${eur(de)}` : `De ${deTxt} à ${eur(x.jusquaCents)}`;
      return { libelle, kmCents: x.kmCents, prix: x.kmCents === 0 ? 'Offerte' : `${eur(x.kmCents)} du km` };
    });
  }
  /* phrase d'encouragement : « Plus que 50 € de commande (au-delà de 700 €) pour passer de 0,80 € à 0,50 € du km aller-retour. » */
  function message(T, totalCents) {
    const s = suivant(T, totalCents);
    if (!s) return kmCents(T, totalCents) === 0 ? 'La livraison vous est offerte.' : '';
    return s.suivantCents === 0
      ? `Plus que ${eur(s.manqueCents)} de commande (au-delà de ${eur(s.seuilCents)} TTC) pour une livraison offerte.`
      : `Plus que ${eur(s.manqueCents)} de commande (au-delà de ${eur(s.seuilCents)} TTC) pour passer de ${eur(s.actuelCents)} à ${eur(s.suivantCents)} TTC du km aller-retour.`;
  }
  /* livraison hors Île-de-France : nous consulter (Jean-Luc, 2026-11-25) */
  const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
  function horsZone(cp) { const c = String(cp || '').replace(/\D/g, ''); return c.length === 5 && !IDF.includes(c.slice(0, 2)); }
  return { DEFAUT, IDF, horsZone, paliers, kmCents, frais, offerteDes, suivant, tranches, message, eur };
});
