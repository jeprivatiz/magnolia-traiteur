'use strict';
/* Statistiques par rubrique (Jean-Luc, 2026-11-25) — INTERNE, back-office seulement.
   Pour chaque univers de l'accueil, dans l'ordre des vignettes (de « Cocktail et buffet français » à « Mobilier et matériel à la location ») :
   1. marge moyenne du catalogue : même calcul que le pavé « marge moyenne » du Catalogue = moyenne simple des marges des produits
      visibles qui ont un prix de vente et un prix d'achat inférieur, en % du prix de vente HT (même TVA sur vente et achat) ;
   2. ce qui a été réellement vendu : devis SIGNÉS, mois de la signature (comme le tableau de bord), chiffre d'affaires HT après remise
      et marge HT (même calcul que le cadre « Marge du devis » : une ligne sans prix d'achat compte dans le CA, jamais dans la marge).
   Un produit présent dans plusieurs rubriques (ex. une chaise dans « Indispensables » et « Mobilier et matériel à la location »)
   compte dans chacune : les lignes ne s'additionnent donc pas d'une rubrique à l'autre ; le total général est calculé à part, une seule fois.
   Saveurs du monde : une ligne par spécialité (Buffet antillais, Paëlla party…). */
const { norm } = require('./util');

const NB_MOIS = 12;
const visible = x => x && x.statut !== 'masque';
const aMarge = p => visible(p) && p.prixCents > 0 && p.coutCents != null && p.coutCents !== '' && p.coutCents < p.prixCents;

function margeCatalogue(prods) {
  const L = prods.filter(visible);
  const M = L.filter(aMarge);
  const pct = M.length ? Math.round(1000 * M.reduce((t, p) => t + (p.prixCents - p.coutCents) / p.prixCents, 0) / M.length) / 10 : null;
  return { pct, avecMarge: M.length, produits: L.length, sansAchat: L.filter(p => p.prixCents > 0 && (p.coutCents == null || p.coutCents === '')).length };
}

/* mois de la signature d'un devis (fuseau de Paris), comme le tableau de bord */
const ici = d => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const moisSigne = d => { const t = d.signature?.at || d.accepteLe || d.updatedAt; return t ? ici(new Date(t)).slice(0, 7) : ''; };

function listeMois(aujourdHui) {
  const n0 = new Date(aujourdHui + 'T12:00:00');
  return [...Array(NB_MOIS)].map((_, i) => { const d = new Date(n0.getFullYear(), n0.getMonth() - NB_MOIS + 1 + i, 15); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
}

function statistiques({ rubriques = [], produits = [], devis = [], lieux = [], maintenant = new Date() }) {
  const mois = listeMois(ici(maintenant));
  const idxMois = new Map(mois.map((m, i) => [m, i]));
  const rubs = rubriques.filter(visible).slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const bySlug = new Map(produits.map(p => [p.slug, p]));
  const rubDe = new Map(rubs.map(r => [r.slug, r]));
  /* produits par titre, pour les lignes de devis tapées à la main sans lien vers la fiche (le titre le plus long qui commence la désignation) */
  const parTitre = produits.filter(p => p.titre).map(p => [norm(p.titre).replace(/\s+/g, ' ').trim(), p]).filter(([t]) => t.length >= 4).sort((a, b) => b[0].length - a[0].length);
  const produitDeLigne = l => {
    if (l.produit && bySlug.has(l.produit)) return bySlug.get(l.produit);
    const d = norm(String(l.designation || '').replace(/\*\*/g, '')).replace(/\s+/g, ' ').trim();
    if (!d) return null;
    const t = parTitre.find(([x]) => d === x || d.startsWith(x + ' ') || d.startsWith(x + '·') || d.startsWith(x + ' ·'));
    return t ? t[1] : null;
  };

  const vide = () => ({ venteHtCents: 0, margeHtCents: 0, venteConnueHtCents: 0, devis: new Set(), serie: mois.map(m => ({ mois: m, venteHtCents: 0, margeHtCents: 0 })) });
  const acc = new Map(), accSous = new Map(), accProd = new Map(), total = vide(), autres = vide();
  const get = (map, k) => { if (!map.has(k)) map.set(k, vide()); return map.get(k); };
  const ajoute = (a, i, id, v, m) => {
    a.venteHtCents += v; a.devis.add(id); a.serie[i].venteHtCents += v;
    if (m != null) { a.margeHtCents += m; a.venteConnueHtCents += v; a.serie[i].margeHtCents += m; }
  };

  for (const d of devis) {
    if (!d || d.statut !== 'accepte') continue;
    const i = idxMois.get(moisSigne(d));
    if (i == null) continue;
    const lignes = (d.lignes || []).filter(l => l.type !== 'titre');
    const brut = lignes.reduce((s, l) => s + Math.round((l.puCents || 0) * (Number(l.qte) || 0)), 0);
    const remise = Math.min(brut, Math.max(0, Math.round(d.remiseCents || 0)));
    const ratio = brut ? (brut - remise) / brut : 1;
    let dernier = null; /* un supplément (ligne « Supplément … ») suit la ligne de son produit */
    for (const l of lignes) {
      const qte = Number(l.qte) || 0;
      if (!qte) continue;
      const taux = Number(l.tva ?? 10);
      const vHt = Math.round(Math.round((l.puCents || 0) * qte * ratio) / (1 + taux / 100));
      const sansAchat = l.coutCents == null || l.coutCents === '';
      const mHt = sansAchat ? null : vHt - Math.round(Math.round(l.coutCents * qte) / (1 + taux / 100));
      let cible = null;
      if (l.supplement && dernier) cible = dernier;
      else if (String(l.produit || '').startsWith('lieu-') || /^privatisation · /i.test(l.designation || '')) cible = { rubs: ['lieux'] };
      else {
        const p = produitDeLigne(l);
        if (p) cible = { rubs: [...new Set([p.rubrique, ...(p.autresRubriques || [])])], sous: p.sous ? p.rubrique + '/' + p.sous : null, prod: p.slug };
        else if (/^personnel\b/i.test(l.designation || '') && l.unite === 'heure') cible = { rubs: ['personnel'] };
      }
      if (!l.supplement) dernier = cible;
      ajoute(total, i, d.id, vHt, mHt);
      if (cible?.prod) ajoute(get(accProd, cible.prod), i, d.id, vHt, mHt);
      const rs = (cible?.rubs || []).filter(r => rubDe.has(r));
      if (!rs.length) { ajoute(autres, i, d.id, vHt, mHt); continue; }
      for (const r of rs) ajoute(get(acc, r), i, d.id, vHt, mHt);
      if (cible.sous && rs.includes(cible.sous.split('/')[0])) ajoute(get(accSous, cible.sous), i, d.id, vHt, mHt);
    }
  }

  const ventes = a => ({
    venteHtCents: a.venteHtCents, margeHtCents: a.margeHtCents, venteConnueHtCents: a.venteConnueHtCents,
    pct: a.venteConnueHtCents ? Math.round(1000 * a.margeHtCents / a.venteConnueHtCents) / 10 : null,
    devis: a.devis.size, serie: a.serie,
  });
  const dansRub = r => produits.filter(p => p.rubrique === r.slug || (p.autresRubriques || []).includes(r.slug));
  return {
    mois,
    rubriques: rubs.map(r => {
      if (r.slug === 'lieux' && !r.photo && !r.photoAccueil) r = { ...r, photo: lieux.find(visible)?.photos?.[0] };
      const sous = (r.sous || []).filter(visible).slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      return {
        slug: r.slug, nom: r.nom, sousRubriques: sous.length > 0, photo: r.photoAccueil || r.photo || r.bandeauPhoto || '',
        catalogue: r.slug === 'lieux' ? null : margeCatalogue(dansRub(r)),
        ventes: ventes(acc.get(r.slug) || vide()),
        sous: sous.map(x => ({
          slug: r.slug + '/' + x.slug, nom: String(x.nom || '').split(' · ')[0], photo: x.photo || '',
          catalogue: margeCatalogue(produits.filter(p => p.rubrique === r.slug && (p.sous === x.slug || (p.autresSous || []).includes(x.slug)))),
          ventes: ventes(accSous.get(r.slug + '/' + x.slug) || vide()),
        })),
      };
    }),
    total: ventes(total),
    autres: ventes(autres),
    catalogueTotal: margeCatalogue(produits),
    /* meilleurs produits : chaque produit visible avec sa marge du catalogue (%) et ce qu'il a vendu sur 12 mois */
    produits: produits.filter(p => visible(p) && (aMarge(p) || accProd.has(p.slug))).map(p => {
      const v = accProd.get(p.slug), r = rubDe.get(p.rubrique);
      return {
        slug: p.slug, titre: String(p.titre || '').replace(/\*\*/g, ''), rubrique: r ? (p.sous && (r.sous || []).find(x => x.slug === p.sous) ? String(r.sous.find(x => x.slug === p.sous).nom || '').split(' · ')[0] : r.nom) : '',
        photo: (p.photos || [])[0]?.src || (typeof p.photos?.[0] === 'string' ? p.photos[0] : '') || '', prixCents: p.prixCents ?? null, unite: p.unite || '',
        pct: aMarge(p) ? Math.round(1000 * (p.prixCents - p.coutCents) / p.prixCents) / 10 : null,
        venteHtCents: v ? v.venteHtCents : 0, margeHtCents: v ? v.margeHtCents : 0, devis: v ? v.devis.size : 0,
      };
    }),
  };
}

module.exports = { statistiques, margeCatalogue };
