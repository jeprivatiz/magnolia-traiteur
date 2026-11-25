'use strict';
/* « 📂 Partir d'un ancien devis » (Jean-Luc, 2026-11-25) — comme dans Teamleader : les commerciaux retrouvent
   un ancien devis proche de la nouvelle demande (tous commerciaux, toutes dates, signés ou non) et le reprennent
   pour le nouveau client : lignes copiées aux prix ACTUELS du catalogue, quantités recalculées pour le nombre
   d'invités, sans les remises. Aussi : ⭐ Modèle (meilleurs devis en tête), « Devis proches » automatiques et
   compléments « souvent pris avec », calculés sur les anciens devis signés. Fonctions pures (testables). */
const { norm, titreTexte } = require('./util');
const { totaux, marge } = require('./devis');

const net = s => norm(String(s || '').replace(/\*\*/g, '')).replace(/[’']/g, ' ');
const mots = s => net(s).split(/[^a-z0-9]+/).filter(w => w.length > 2).map(w => w.replace(/s$/, ''));
const STOP = new Set(['pour', 'avec', 'les', 'des', 'une', 'aux', 'par', 'sur', 'dan', 'personne', 'invite', 'client', 'veut', 'voudrait', 'nous', 'vous', 'est', 'sont', 'qui', 'que', 'plu', 'tre', 'fait', 'faire', 'bonjour', 'merci']);
const vraies = l => (l || []).filter(x => x && x.type !== 'titre');
const signe = d => d.statut === 'accepte';
/* lignes qui ne se « reprennent » pas comme un produit : livraison (distance du client), suppléments rattachés à un plat */
const estLivraison = l => l.unite === 'km' || /^livraison/i.test(String(l.designation || ''));

/* clé d'une ligne pour comparer les devis entre eux : la fiche du catalogue, sinon le libellé sans chiffres */
function cle(l) {
  if (!l || l.type === 'titre' || estLivraison(l) || l.supplement) return null;
  if (l.produit) return 'p:' + l.produit;
  const t = net(l.designation).replace(/\d+([.,]\d+)?/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? 'd:' + t : null;
}
const cles = d => new Set(vraies(d.lignes).map(cle).filter(Boolean));

/* marge HT d'un ancien devis (interne) : prix d'achat de la ligne, sinon celui de la fiche du catalogue
   si la ligne est encore au prix de la fiche (même règle que l'écran Devis). Lignes sans prix d'achat : hors calcul. */
function margeDe(d, c) {
  const lignes = (d.lignes || []).filter(l => l.type === 'titre' || String(l.designation || '').replace(/\*\*/g, '').trim() || l.puCents).map(l => {
    if (l.type === 'titre' || l.coutCents != null || !l.produit || !c) return l;
    const p = c.bySlug?.get(l.produit), pu = l.puBaseCents ?? l.puCents;
    return p && p.coutCents != null && (p.prixCents == null || pu === p.prixCents) ? { ...l, coutCents: p.coutCents } : l;
  });
  const m = marge({ ...d, lignes });
  return m.connu ? { cents: m.margeHtCents, pct: m.pct, manquants: m.manquants.length } : null;
}

/* carte d'un ancien devis (liste, aperçu rapide) */
function carte(d, { masquer = false, c = null } = {}) {
  const L = vraies(d.lignes), t = totaux(d);
  const cles4 = L.filter(l => !estLivraison(l) && !l.supplement && String(l.designation || '').replace(/\*\*/g, '').trim())
    .map(l => ({ n: titreTexte(String(l.designation || '').replace(/\*\*/g, '').trim()), v: Math.round((l.puBaseCents ?? l.puCents ?? 0) * (+l.qte || 0)) }))
    .sort((a, b) => b.v - a.v).slice(0, 4).map(x => x.n);
  return {
    id: d.id, numero: d.numero, titre: d.titre || '', statut: d.statut, modele: !!d.modele,
    clientNom: masquer ? 'Client d’un autre commercial' : (d.clientNom || ''), masque: !!masquer,
    commercial: d.commercial?.nom || d.creePar || '', createdAt: d.createdAt || '', signeLe: d.signature?.at || '',
    type: d.evenement?.type || '', date: d.evenement?.date || '', invites: +d.evenement?.invites || null, lieu: masquer ? '' : (d.evenement?.lieu || ''),
    ttcCents: t.ttcCents, marge: margeDe(d, c), nbLignes: L.filter(l => String(l.designation || '').replace(/\*\*/g, '').trim()).length, produits: cles4,
    lignes: (d.lignes || []).slice(0, 60).map(l => l.type === 'titre' ? { titre: true, designation: l.designation } : { designation: l.designation, qte: l.qte, unite: l.unite || '', puCents: l.puBaseCents ?? l.puCents ?? 0 }),
  };
}

/* tri : ⭐ modèles, puis signés, puis les plus récents */
const ordre = (a, b) => (b.modele ? 1 : 0) - (a.modele ? 1 : 0) || (signe(b) ? 1 : 0) - (signe(a) ? 1 : 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

/* recherche multicritère dans TOUS les anciens devis */
/* tris proposés : pertinence (⭐ modèles, signés, récents), marge en €, marge en %, montant, plus récents */
function trier(liste, tri, c) {
  if (!tri || tri === 'pertinence') return liste.sort(ordre);
  if (tri === 'recent') return liste.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  if (tri === 'montant') return liste.sort((a, b) => totaux(b).ttcCents - totaux(a).ttcCents);
  const k = tri === 'margePct' ? 'pct' : 'cents', v = new Map(liste.map(d => [d, margeDe(d, c)?.[k] ?? null]));
  return liste.sort((a, b) => (v.get(b) ?? -Infinity) - (v.get(a) ?? -Infinity) || ordre(a, b));
}

function rechercher(liste, f = {}, c = null) {
  const q = mots(f.q).filter(w => !STOP.has(w)), type = net(f.type).trim(), inv = +f.invites || 0, com = net(f.com).trim();
  const bmin = f.budgetMin ? Math.round(+f.budgetMin * 100) : 0, bmax = f.budgetMax ? Math.round(+f.budgetMax * 100) : 0;
  return trier(liste.filter(d => {
    if (!vraies(d.lignes).length || d.id === f.sauf) return false;
    if (f.signes && !signe(d)) return false;
    if (f.modeles && !d.modele) return false;
    if (type && !net(d.evenement?.type).includes(type)) return false;
    if (inv) { const n = +d.evenement?.invites || 0; if (!n || n < inv * 0.8 || n > inv * 1.2) return false; }
    if (bmin || bmax) { const t = totaux(d).ttcCents; if ((bmin && t < bmin) || (bmax && t > bmax)) return false; }
    const quand = d.evenement?.date || String(d.createdAt || '').slice(0, 10);
    if (f.du && quand < f.du) return false;
    if (f.au && quand > f.au) return false;
    if (com && !net(d.commercial?.nom || d.creePar).includes(com)) return false;
    if (q.length) {
      const txt = net([d.numero, d.titre, d.clientNom, d.evenement?.type, d.evenement?.lieu, ...vraies(d.lignes).flatMap(l => [l.designation, l.detail])].join(' '));
      if (!q.every(w => txt.includes(w))) return false;
    }
    return true;
  }), f.tri, c);
}

/* « Devis proches » : ressemblance avec la demande (type d'événement, invités, produits, mots de la demande) */
function proches(liste, ref = {}, n = 6) {
  const type = net(ref.type).trim(), inv = +ref.invites || 0, K = new Set(ref.cles || []), budget = +ref.budgetCents || 0;
  const M = [...new Set(mots(ref.texte).filter(w => !STOP.has(w)))];
  const res = [];
  for (const d of liste) {
    const L = vraies(d.lignes);
    if (!L.length || d.id === ref.sauf) continue;
    let s = 0; const pourquoi = [];
    const t = net(d.evenement?.type).trim();
    if (type && t && (t === type || t.includes(type) || type.includes(t))) { s += 3; pourquoi.push('même type d’événement'); }
    const n2 = +d.evenement?.invites || 0;
    if (inv && n2) { const ecart = Math.abs(n2 - inv) / Math.max(inv, n2); if (ecart <= 0.5) { s += 3 * (1 - ecart / 0.5); if (ecart <= 0.2) pourquoi.push(`${n2} invités`); } }
    if (K.size) {
      const D = cles(d); let com = 0; for (const k of K) if (D.has(k)) com++;
      if (com) { s += 6 * com / Math.max(K.size, 1); pourquoi.push(`${com} produit${com > 1 ? 's' : ''} en commun`); }
    }
    if (M.length) {
      const txt = net([d.titre, d.evenement?.type, ...L.map(l => l.designation)].join(' '));
      const hits = M.filter(w => txt.includes(w)).length;
      if (hits) { s += Math.min(5, hits * 1.2); pourquoi.push('produits demandés'); }
    }
    if (budget) { const tt = totaux(d).ttcCents; if (tt && Math.abs(tt - budget) / Math.max(tt, budget) <= 0.3) { s += 1; pourquoi.push('budget proche'); } }
    if (s < 2.5) continue; /* rien de vraiment commun : pas proposé */
    if (signe(d)) { s += 2; pourquoi.push('signé'); }
    if (d.modele) { s += 2; pourquoi.unshift('⭐ modèle'); }
    res.push({ d, s, pourquoi: [...new Set(pourquoi)] });
  }
  return res.sort((a, b) => b.s - a.s || ordre(a.d, b.d)).slice(0, n);
}

/* quantité recalculée pour le nouveau nombre d'invités */
const FIXES = new Set(['forfait', 'prestation', 'heure', 'km', 'gâteau', 'location']);
function nouvelleQte(l, avant, apres, p) {
  const q = +l.qte || 0;
  if (!avant || !apres || avant === apres || !q) return q;
  const min = Math.max(1, +p?.min || 1);
  if (l.unite === 'personne' || q === avant) return Math.max(min, apres);
  if (FIXES.has(l.unite)) return q;
  return Math.max(min, Math.ceil(q * apres / avant));
}

/* « Utiliser ce devis » : lignes reprises pour le nouveau client (rien n'est enregistré ici). */
function reprendre(src, { invites } = {}, c, T = {}) {
  const avant = +src.evenement?.invites || 0, apres = +invites || avant;
  const rapport = { prix: [], options: [], supprimes: [], masques: [], quantites: 0, remises: false, livraison: false, invitesAvant: avant || null, invitesApres: apres || null };
  const packs = new Map((T.packs || []).map(p => [net(p.label), p]));
  const persLabel = net(T.personnel?.label || 'Personnel de service');
  const lignes = [];
  for (const l0 of src.lignes || []) {
    if (l0.type === 'titre') { lignes.push({ type: 'titre', designation: l0.designation }); continue; }
    const { puBaseCents, remisePct, ...l } = { ...l0 };
    if (remisePct || puBaseCents != null) { rapport.remises = true; l.puCents = puBaseCents ?? l.puCents; }
    const nom = titreTexte(String(l.designation || '').replace(/\*\*/g, ''));
    if (l.produit && !String(l.produit).startsWith('lieu-')) {
      const p = c.bySlug.get(l.produit);
      if (!p) rapport.supprimes.push(nom);
      else {
        if (p.statut === 'masque') rapport.masques.push(nom);
        const prix = p.prixCents;
        /* option payante choisie à l'époque (corbeille plus grande, formule…) : le prix de la ligne la comprend, on le garde et on le signale */
        const options = (p.groupes || []).some(g => g.mode !== 'quantites' && (g.options || []).some(o => o.supCents));
        if (prix != null && prix !== l.puCents) {
          if (options && (l.puCents || 0) > prix) rapport.options.push(nom);
          else { rapport.prix.push({ nom, avant: l.puCents || 0, apres: prix }); l.puCents = prix; l.coutCents = p.coutCents ?? null; }
        } else l.coutCents = p.coutCents ?? l.coutCents ?? null;
        l.tva = p.tva ?? l.tva ?? 10;
      }
      const q = nouvelleQte(l, avant, apres, p);
      if (q !== +l.qte) { rapport.quantites++; l.qte = q; }
    } else if (estLivraison(l)) {
      rapport.livraison = true;
    } else if (l.unite === 'heure' && net(l.designation) === persLabel && T.personnel?.heureCents) {
      if (l.puCents !== T.personnel.heureCents) { rapport.prix.push({ nom, avant: l.puCents || 0, apres: T.personnel.heureCents }); l.puCents = T.personnel.heureCents; }
    } else {
      const pk = packs.get(net(l.designation));
      if (pk && pk.prixCents !== l.puCents) { rapport.prix.push({ nom, avant: l.puCents || 0, apres: pk.prixCents }); l.puCents = pk.prixCents; }
      const q = nouvelleQte(l, avant, apres, null);
      if (q !== +l.qte) { rapport.quantites++; l.qte = q; }
    }
    lignes.push(l);
  }
  return { lignes, rapport };
}

/* « Souvent pris avec » : dans les anciens devis SIGNÉS qui contiennent un des produits du devis,
   ce qui revient le plus souvent et manque ici (vaisselle, nappes, personnel…). */
function complements(liste, lignesActuelles, c, n = 6) {
  const K = new Set(vraies(lignesActuelles).map(cle).filter(Boolean));
  if (!K.size) return [];
  const signes = liste.filter(d => signe(d) && vraies(d.lignes).length).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const compte = new Map(); let base = 0;
  for (const d of signes) {
    const D = cles(d); let lie = false;
    for (const k of K) if (D.has(k)) { lie = true; break; }
    if (!lie) continue;
    base++;
    for (const l of vraies(d.lignes)) {
      const k = cle(l); if (!k || K.has(k)) continue;
      const x = compte.get(k) || { k, n: 0, ligne: l, vus: new Set() };
      if (x.vus.has(d.id)) continue;
      x.vus.add(d.id); x.n++; compte.set(k, x);
    }
  }
  const out = [];
  for (const x of [...compte.values()].sort((a, b) => b.n - a.n)) {
    if (x.n < (base >= 6 ? 2 : 1)) continue; /* peu d'historique : une fois suffit ; ensuite au moins deux devis signés */
    const l = x.ligne;
    if (l.produit && !String(l.produit).startsWith('lieu-')) {
      const p = c.bySlug.get(l.produit);
      if (!p || p.statut === 'masque') continue;
      out.push({ cle: x.k, n: x.n, sur: base, slug: p.slug, designation: titreTexte(p.titre), puCents: p.prixCents ?? 0, unite: p.unite || 'unité', photo: p.photos?.[0]?.src || '',
        ligne: { designation: p.titre, detail: '', qte: Math.max(1, +p.min || 1), unite: p.unite || 'unité', puCents: p.prixCents || 0, coutCents: p.coutCents ?? null, tva: p.tva ?? 10, produit: p.slug } });
    } else {
      const { puBaseCents, remisePct, ...ligne } = l;
      out.push({ cle: x.k, n: x.n, sur: base, designation: titreTexte(String(l.designation || '').replace(/\*\*/g, '')), puCents: puBaseCents ?? l.puCents ?? 0, unite: l.unite || '', photo: '',
        ligne: { ...ligne, puCents: puBaseCents ?? l.puCents ?? 0 } });
    }
    if (out.length >= n) break;
  }
  return out;
}

module.exports = { cle, carte, margeDe, trier, rechercher, proches, reprendre, complements, nouvelleQte };
