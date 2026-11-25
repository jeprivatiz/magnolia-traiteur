'use strict';
/*
 * Import des prix d'achat et des fournisseurs depuis un tableau Excel/CSV (Jean-Luc, 2026-11-25).
 * Colonnes reconnues : nom du produit, prix d'achat, fournisseur (l'ordre et l'intitulé exacts n'ont pas d'importance).
 * Chaque ligne est rapprochée d'une fiche du catalogue par son nom : identique (accents, majuscules et ponctuation ignorés),
 * sinon le nom le plus proche. Rien n'est enregistré avant que l'équipe ait relu et coché les lignes (étape « appliquer »).
 * Prix d'achat et fournisseur restent INTERNES : jamais montrés au client.
 */
const { lireTableau } = require('./tableur');

const VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'd', 'l', 'et', 'a', 'au', 'aux', 'en', 'un', 'une', 'pour', 'par', 'avec', 'sans', 'sur']);
const net = s => String(s || '').replace(/\*\*/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/[^a-z0-9]+/g, ' ').trim();
const mots = s => net(s).split(' ').filter(m => m && !VIDES.has(m)).map(m => m.length > 3 ? m.replace(/(s|x)$/, '') : m);

/* ressemblance de deux noms, de 0 à 1 (mots en commun, un mot peut être le début d'un autre : « choco » ~ « chocolat ») */
function ressemblance(a, b) {
  const A = mots(a), B = mots(b); if (!A.length || !B.length) return 0;
  const pareil = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const commun = A.filter(x => B.some(y => pareil(x, y))).length;
  return (2 * commun) / (A.length + B.length);
}

function colonnes(titres) {
  const t = titres.map(net);
  /* les motifs sont essayés dans l'ordre : « Prix d'achat » passe avant une colonne « Prix » (prix de vente) */
  const trouve = (...res) => { for (const r of res) { const i = t.findIndex(x => r.test(x)); if (i >= 0) return i; } return -1; };
  return {
    nom: trouve(/^(nom|produit|designation|article|libelle|prestation|intitule)/, /produit|designation|libelle|article/),
    achat: trouve(/achat/, /^(cout|prix revient|pa\b|cout de revient)/),
    vente: trouve(/vente/, /^prix( ht| ttc)?$/),
    tva: trouve(/^tva/),
    fournisseur: trouve(/fournisseur|founisseur|fourniseur|^marque|^partenaire|^source/),
    code: trouve(/^code/),
  };
}

const cents = v => {
  if (typeof v === 'number') return Math.round(v * 100);
  const x = String(v ?? '').replace(/[\s €]|eur(os?)?/gi, '').replace(',', '.');
  if (x === '') return null;
  const n = Math.round(parseFloat(x) * 100); return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/* lit le fichier et propose une fiche pour chaque ligne */
function analyser(buffer, nomFichier, produits) {
  const lignes = lireTableau(buffer, nomFichier);
  if (lignes.length < 2) throw new Error('Le fichier est vide (la première ligne doit contenir les titres des colonnes).');
  const ix = colonnes(lignes[0].map(String));
  if (ix.nom < 0 && ix.code < 0) throw new Error('Colonne du nom du produit introuvable : appelez-la « Produit » ou « Nom ».');
  if (ix.achat < 0 && ix.fournisseur < 0) throw new Error('Colonne « Prix d’achat » ou « Fournisseur » introuvable.');
  const index = produits.map(p => ({ p, n: net(p.titre), s: p.slug }));
  const out = [];
  for (const [i, l] of lignes.slice(1).entries()) {
    const nom = String(l[ix.nom] ?? '').trim(), code = ix.code >= 0 ? String(l[ix.code] ?? '').trim() : '';
    if (!nom && !code) continue;
    const achat = ix.achat >= 0 ? cents(l[ix.achat]) : null;
    const fournisseur = ix.fournisseur >= 0 ? String(l[ix.fournisseur] ?? '').trim().slice(0, 120) : '';
    const vente = ix.vente >= 0 ? cents(l[ix.vente]) : null, tva = ix.tva >= 0 ? parseFloat(String(l[ix.tva] ?? '').replace(',', '.')) : NaN;
    const r = { ligne: i + 2, nom: nom || code, achatCents: achat === undefined ? null : achat, achatIllisible: achat === undefined, fournisseur, venteFichierCents: vente ?? null, tvaFichier: [5.5, 10, 20].includes(tva) ? tva : null };
    let ex = code && index.find(x => x.s === code);
    if (!ex) { const n = net(nom); const ids = index.filter(x => x.n === n); if (ids.length === 1) ex = ids[0]; else if (ids.length > 1) ex = ids.find(x => x.p.statut !== 'masque') || ids[0]; }
    if (ex) { out.push({ ...r, statut: 'exact', slug: ex.p.slug, titre: ex.p.titre, score: 1 }); continue; }
    const cands = index.map(x => ({ x, sc: ressemblance(nom, x.p.titre) })).filter(c => c.sc >= 0.5).sort((a, b) => b.sc - a.sc || (a.x.p.statut === 'masque') - (b.x.p.statut === 'masque')).slice(0, 5);
    if (!cands.length) { out.push({ ...r, statut: 'introuvable', propositions: [] }); continue; }
    out.push({ ...r, statut: cands[0].sc >= 0.75 ? 'proche' : 'douteux', slug: cands[0].x.p.slug, titre: cands[0].x.p.titre, score: Math.round(cands[0].sc * 100) / 100, propositions: cands.map(c => ({ slug: c.x.p.slug, titre: c.x.p.titre })) });
  }
  /* les prix du fichier sont-ils HT ? (prix de vente du fichier × TVA ≈ prix du site sur les fiches trouvées) */
  const P = new Map(produits.map(p => [p.slug, p]));
  const rapports = out.filter(x => x.statut === 'exact' && x.venteFichierCents > 0 && P.get(x.slug)?.prixCents > 0).map(x => P.get(x.slug).prixCents / x.venteFichierCents).sort((a, b) => a - b);
  const med = rapports.length ? rapports[Math.floor(rapports.length / 2)] : 1;
  const ht = rapports.length >= 3 && med > 1.04 && med < 1.25;
  /* contrôles : prix d'achat au-dessus du prix de vente du site (souvent une autre unité : bol entier, forfait…), plusieurs lignes sur une même fiche */
  const vus = new Map();
  for (const x of out) {
    if (!x.slug) continue;
    vus.set(x.slug, (vus.get(x.slug) || 0) + 1);
    const p = P.get(x.slug), k = 1 + (x.tvaFichier ?? p?.tva ?? 10) / 100;
    if (x.achatCents != null && p?.prixCents != null && (ht ? x.achatCents * k : x.achatCents) >= p.prixCents) x.alerte = 'achat ≥ prix de vente du site : vérifiez l’unité';
  }
  for (const x of out) if (x.slug && vus.get(x.slug) > 1) x.doublon = vus.get(x.slug);
  return { colonnes: ix, ht, lignes: out };
}

/* applique les lignes cochées : prix d'achat (TTC, ou HT converti avec la TVA de la fiche) et fournisseur */
async function appliquer(store, choix, { ht = false } = {}) {
  let maj = 0; const erreurs = [];
  for (const c of (Array.isArray(choix) ? choix : []).slice(0, 5000)) {
    const slug = String(c.slug || '');
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(slug)) continue;
    const p = await store.get('produits/' + slug);
    if (!p) { erreurs.push(`« ${c.nom || slug} » : fiche introuvable.`); continue; }
    const next = { ...p };
    const taux = [5.5, 10, 20].includes(+c.tva) ? +c.tva : (p.tva ?? 10);
    if (c.achatCents != null && Number.isFinite(+c.achatCents) && +c.achatCents >= 0) next.coutCents = ht ? Math.round(+c.achatCents * (1 + taux / 100)) : Math.round(+c.achatCents);
    const f = typeof c.fournisseur === 'string' ? c.fournisseur.trim().slice(0, 120) : '';
    const liste = fournisseursDe(p);
    if (f && !liste.some(x => x.toLowerCase() === f.toLowerCase())) liste.unshift(f); /* le fournisseur du fichier passe en premier (principal) */
    next.fournisseurs = liste; delete next.fournisseur;
    if (JSON.stringify(next) !== JSON.stringify(p)) { await store.set('produits/' + slug, { ...next, updatedAt: new Date().toISOString() }); maj++; }
  }
  return { maj, erreurs };
}

/* un produit peut avoir plusieurs fournisseurs (le premier = principal) ; ancien champ texte `fournisseur` repris */
const fournisseursDe = p => [...new Set([...(Array.isArray(p?.fournisseurs) ? p.fournisseurs : []), ...(p?.fournisseur ? [p.fournisseur] : [])].map(x => String(x).trim()).filter(Boolean))];

module.exports = { analyser, appliquer, ressemblance, fournisseursDe };
