'use strict';
/* Catalogue en mémoire (relu après chaque modification du back-office). */
const { norm } = require('./util');

function createCatalogue(store) {
  let cache = null, loading = null;

  async function load() {
    const [rub, prod, lieux, avis, reglages, pages] = await Promise.all([
      store.list('rubriques'), store.list('produits'), store.list('lieux'), store.list('avis'), store.get('site/reglages'), store.list('pages'),
    ]);
    const rubriques = rub.map(d => d.data).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    const produits = prod.map(d => d.data).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    const bySlug = new Map(produits.map(p => [p.slug, p]));
    const byRub = new Map(rubriques.map(r => [r.slug, []]));
    for (const p of produits) {
      if (p.statut === 'masque') continue;
      for (const r of [p.rubrique, ...(p.autresRubriques || [])]) if (byRub.has(r)) byRub.get(r).push(p);
    }
    const lieuxL = lieux.map(d => d.data).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    const index = produits.filter(p => p.statut !== 'masque').map(p => ({
      p, t: norm([p.titre, p.extrait, (p.description || []).join(' '), ...(p.sections || []).flatMap(s => [s.titre, ...(s.items || [])]), ...(p.groupes || []).flatMap(g => (g.options || []).map(o => o.label)), rubriques.find(r => r.slug === p.rubrique)?.nom].join(' ')),
    }));
    cache = {
      reglages: reglages || {}, rubriques, produits, bySlug, byRub, lieux: lieuxL, index,
      avis: avis.map(d => ({ id: d.id, ...d.data })).filter(a => a.statut === 'visible' || a.statut === 'vedette' || !a.statut).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
      pages: Object.fromEntries(pages.map(d => [d.data.url, d.data])),
      loadedAt: Date.now(),
    };
    cache.search = (c, q, limit) => search(c || cache, q, limit);
    return cache;
  }

  /* recherche simple : chaque mot doit apparaître (accents ignorés), titres d'abord */
  function search(c, q, limit = 60) {
    const mots = norm(q).split(/[^a-z0-9]+/).filter(w => w.length > 1).map(w => w.replace(/s$/, ''));
    if (!mots.length) return [];
    const res = [];
    for (const { p, t } of c.index) {
      if (!mots.every(w => t.includes(w))) continue;
      const titre = norm(p.titre);
      res.push({ p, score: mots.reduce((s, w) => s + (titre.includes(w) ? 3 : 1), 0) + (p.maison ? 1 : 0) });
    }
    return res.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.p);
  }

  return {
    search,
    async get() { if (cache) return cache; if (!loading) loading = load().finally(() => { loading = null; }); return loading; },
    invalidate() { cache = null; },
  };
}

/* prix affiché sur une carte : « 24,90 € / personne » ou « Sur devis » */
function prixCourt(p, euros) {
  if (p.prixCents == null) return { prix: p.prixAffiche || 'Sur devis', unite: '' };
  /* corbeille à plusieurs contenances : « dès 78,00 € » */
  if ((p.groupes || []).some(g => g.radio && (g.options || []).length > 1)) return { prix: 'dès ' + euros(p.prixCents), unite: p.unite ? '/ ' + p.unite : '' };
  return { prix: euros(p.prixCents), unite: p.unite ? '/ ' + p.unite + (p.contenuPortion ? ` (${p.contenuPortion})` : '') : '' };
}

module.exports = { createCatalogue, prixCourt };
