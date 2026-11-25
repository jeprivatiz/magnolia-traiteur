'use strict';
/* Calculs des devis et factures. Tous les prix sont saisis et affichés TTC ; la TVA est déduite ligne par ligne. */
const { avecPortion, norm, titreTexte } = require('./util');
const LIVR = require('../public/js/livraison-paliers');

/* Suppléments « par part » (Jean-Luc, 2026-11-25 : coq roussi + 5 € TTC la part dans les buffets antillais).
   Une option d'un groupe « en portions » (mode quantites) qui a un supplément ne change pas le prix par personne :
   elle s'ajoute à part, en bas, « Supplément coq roussi : 15 parts × 5 € ». Renvoie [{ id, label, n, puCents, coutCents }]. */
function supplementsParPart(l, p) {
  const out = [];
  for (const g of p?.groupes || []) {
    if (g.mode !== 'quantites') continue;
    for (const id of l.choix?.[g.id] || []) {
      const [oid, n] = String(id).split(':'); const o = (g.options || []).find(x => x.id === oid);
      const nb = Math.max(0, Math.round(+n || 0));
      if (o?.supCents && nb) out.push({ id: o.id, label: o.label, n: nb, puCents: o.supCents, coutCents: o.coutCents ?? null });
    }
  }
  return out;
}
const totalSupplements = s => (s || []).reduce((t, x) => t + x.n * x.puCents, 0);

/* l'IA (devis préparé au téléphone) ne coche pas les portions : on retrouve dans sa note les plats à supplément
   (« plats : colombo de poulet × 20, coq roussi × 20 ») ; sans nombre, toutes les parts de la ligne. */
function choixDepuisNote(note, p, qte) {
  const choix = {}, txt = ' ' + norm(note).replace(/[’']/g, ' ') + ' ';
  for (const g of p?.groupes || []) {
    if (g.mode !== 'quantites') continue;
    for (const o of g.options || []) {
      if (!o.supCents) continue;
      const lab = norm(o.label).replace(/[’']/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp('\\b' + lab + '\\b').test(txt)) continue;
      const m = new RegExp(lab + '\\s*(?:[×x:(]\\s*)(\\d+)').exec(txt) || new RegExp('(\\d+)\\s*(?:parts?|portions?)?\\s*(?:de\\s+|du\\s+)?' + lab).exec(txt);
      const n = Math.min(qte, m ? +m[1] : qte);
      if (n > 0) (choix[g.id] = choix[g.id] || []).push(o.id + ':' + n);
    }
  }
  return choix;
}

function totaux(doc) {
  const lignes = (doc.lignes || []).filter(l => l.type !== 'titre');
  const brutCents = lignes.reduce((s, l) => s + Math.round((l.puCents || 0) * (Number(l.qte) || 0)), 0);
  const remiseCents = Math.min(brutCents, Math.max(0, Math.round(doc.remiseCents || 0)));
  const ratio = brutCents ? (brutCents - remiseCents) / brutCents : 1;
  const tva = {};
  let htCents = 0;
  for (const l of lignes) {
    const ttc = Math.round((l.puCents || 0) * (Number(l.qte) || 0) * ratio);
    const taux = Number(l.tva ?? 10);
    const ht = Math.round(ttc / (1 + taux / 100));
    htCents += ht;
    tva[taux] = (tva[taux] || 0) + (ttc - ht);
  }
  const coutCents = lignes.reduce((s, l) => s + Math.round((l.coutCents || 0) * (Number(l.qte) || 0)), 0);
  const ttcCents = brutCents - remiseCents;
  const m = marge(doc);
  return { brutCents, remiseCents, ttcCents, htCents, tva, coutCents, margeCents: m.margeHtCents, marge: m };
}

/* Marge d'un devis (Jean-Luc, 2026-11-25) — INTERNE, jamais montrée au client.
   Prix de vente et prix d'achat sont saisis TTC ; la marge est calculée HORS TAXES (la TVA n'est pas un gain) :
   vente HT (après remise) − achat HT, avec le taux de TVA de la ligne pour les deux.
   Une ligne sans prix d'achat n'est PAS comptée à 0 : elle est listée « prix d'achat manquant » et laissée hors du calcul. */
function marge(doc) {
  const lignes = (doc.lignes || []).filter(l => l.type !== 'titre');
  const brut = lignes.reduce((s, l) => s + Math.round((l.puCents || 0) * (Number(l.qte) || 0)), 0);
  const remise = Math.min(brut, Math.max(0, Math.round(doc.remiseCents || 0)));
  const ratio = brut ? (brut - remise) / brut : 1;
  let venteHtCents = 0, achatHtCents = 0, achatTtcCents = 0, venteTtcCents = 0;
  const manquants = [];
  for (const l of lignes) {
    const qte = Number(l.qte) || 0;
    if (!qte) continue;
    const taux = Number(l.tva ?? 10);
    if (l.coutCents == null || l.coutCents === '') { manquants.push(String(l.designation || 'Ligne sans nom').replace(/\*\*/g, '')); continue; }
    const vTtc = Math.round((l.puCents || 0) * qte * ratio), aTtc = Math.round(l.coutCents * qte);
    venteTtcCents += vTtc; achatTtcCents += aTtc;
    venteHtCents += Math.round(vTtc / (1 + taux / 100)); achatHtCents += Math.round(aTtc / (1 + taux / 100));
  }
  const margeHtCents = venteHtCents - achatHtCents;
  return { venteHtCents, venteTtcCents, achatHtCents, achatTtcCents, margeHtCents, pct: venteHtCents ? Math.round(1000 * margeHtCents / venteHtCents) / 10 : null, manquants, connu: lignes.length > manquants.length };
}

/* prix d'achat d'une ligne venant du site : prix d'achat de la fiche + prix d'achat des options payantes choisies.
   null (= « prix d'achat manquant ») si la fiche n'en a pas, ou si une option avec supplément n'a pas le sien. */
function coutLigne(l, p) {
  if (!p || p.coutCents == null) return null;
  const qte = Math.max(1, Number(l.qte) || 1);
  let cout = p.coutCents;
  for (const g of p.groupes || []) {
    for (const id of l.choix?.[g.id] || []) {
      const [oid, n] = String(id).split(':'); const o = (g.options || []).find(x => x.id === oid);
      if (!o) continue;
      if (g.mode === 'quantites' && o.supCents) continue; /* supplément par part : prix d'achat sur sa propre ligne */
      if (o.coutCents == null) { if (o.supCents) return null; continue; }
      cout += n ? Math.round(o.coutCents * n / qte) : o.coutCents;
    }
  }
  return cout;
}

/* marge négative bloquée : une ligne vendue sous son coût, ou un total sous le coût total */
function controleMarge(doc) {
  const erreurs = [];
  for (const l of doc.lignes || []) {
    if (l.type === 'titre') continue;
    if (l.coutCents != null && l.coutCents > 0 && (l.puCents || 0) < l.coutCents) erreurs.push(`« ${l.designation} » est vendu sous son coût.`);
  }
  const t = totaux(doc);
  if (t.coutCents > 0 && t.margeCents < 0) erreurs.push('La remise rend la marge totale négative.');
  return erreurs;
}

/* Règle d'acompte (Jean-Luc, 2026-11-24) : commande sous 800 € TTC = paiement de la totalité à la signature ;
   à partir de 800 € TTC = acompte de 50 %. Un devis peut forcer un autre pourcentage (champ acomptePct). */
function regleAcompte(ttcCents, doc = {}, T = {}, now = new Date()) {
  const seuil = T.seuilAcompteCents ?? 80000, delai = T.delaiDeuxFoisJours ?? 10;
  const force = doc.acomptePct != null && doc.acomptePct !== '' && !Number.isNaN(+doc.acomptePct);
  /* événement dans moins de 10 jours (à la signature, ou aujourd'hui si pas encore signé) : pas de paiement en 2 fois */
  const ref = doc.signature?.at ? new Date(doc.signature.at) : now;
  const ev = doc.evenement?.date ? new Date(doc.evenement.date + 'T12:00:00') : null;
  const proche = !!ev && !Number.isNaN(+ev) && (ev - ref) / 86400e3 < delai;
  const raison = force ? '' : ttcCents < seuil ? 'seuil' : proche ? 'proche' : '';
  const pct = force ? +doc.acomptePct : raison ? 100 : (T.acomptePct ?? 50);
  return { pct, auto: !force, seuil, delai, raison, cents: Math.round(ttcCents * pct / 100), total: pct >= 100 };
}

async function prochainNumero(store, type) {
  const an = new Date().getFullYear();
  const key = `compteurs/${type}-${an}`;
  const c = (await store.get(key)) || { n: 0 };
  c.n += 1;
  await store.set(key, c);
  return `${type === 'devis' ? 'D' : type === 'facture' ? 'F' : type === 'avoir' ? 'A' : 'R'}-${an}-${String(c.n).padStart(4, '0')}`;
}

/* une demande du site (lignes de sélection) devient des lignes de devis */
function lignesDepuisDemande(demande, catalogue, tarifs = {}) {
  const out = [];
  for (const l of demande.lignes || []) {
    const p = catalogue.bySlug.get(l.slug);
    out.push({
      designation: avecPortion(l.titre) + (l.variante ? ' · ' + l.variante : ''),
      detail: [l.resume, l.note ? 'Note : ' + l.note : ''].filter(Boolean).join(' — '),
      qte: Number(l.qte) || 1, unite: l.unite || p?.unite || '',
      puCents: (l.prixCents ?? p?.prixCents ?? 0) + (l.supCents || 0), coutCents: coutLigne(l, p),
      tva: p?.tva ?? 10, produit: l.slug,
    });
    for (const x of supplementsParPart(l, p)) {
      out.push({ designation: 'Supplément ' + x.label.toLowerCase(), detail: `${titreTexte(l.titre)} · ${x.n} part${x.n > 1 ? 's' : ''} × ${(x.puCents / 100).toLocaleString('fr-FR')} € TTC`, qte: x.n, unite: 'part', puCents: x.puCents, coutCents: x.coutCents, tva: p?.tva ?? 10, supplement: x.id });
    }
    if (l.personnel?.nb) {
      out.push({ designation: tarifs.personnel?.label || 'Personnel de service', detail: `${l.personnel.nb} pers. × ${l.personnel.heures} h`, qte: l.personnel.nb * l.personnel.heures, unite: 'heure', puCents: tarifs.personnel?.heureCents || 4188, coutCents: null, tva: 20 });
    }
    if (l.pack?.id) {
      const pk = (tarifs.packs || []).find(x => x.id === l.pack.id);
      if (pk) out.push({ designation: pk.label, detail: pk.detail, qte: l.pack.nb || l.qte, unite: 'personne', puCents: pk.prixCents, coutCents: null, tva: 20 });
    }
  }
  if (demande.livraison?.km) {
    /* prix du km du palier de la commande (Jean-Luc, 2026-11-25) : celui enregistré avec la demande, sinon recalculé */
    if (demande.livraison.horsZone || LIVR.horsZone(demande.evenement?.cp)) {
      out.push({ designation: 'Livraison hors Île-de-France (sur consultation)', detail: `${demande.evenement?.ville || ''} · environ ${demande.livraison.km} km aller-retour · tarif à préciser par l’équipe`, qte: 1, unite: 'forfait', puCents: 0, coutCents: null, tva: 20 });
      return out;
    }
    const pu = demande.livraison.kmCents ?? (demande.livraison.offerte ? 0 : LIVR.kmCents(tarifs, demande.sousTotalCents || 0));
    const offerte = pu === 0;
    const des = LIVR.offerteDes(tarifs);
    out.push({ designation: offerte ? 'Livraison et reprise (offerte)' : 'Livraison et reprise', detail: `${demande.evenement?.ville || ''} · ${demande.livraison.km} km aller-retour${offerte ? (des != null ? ` · offerte au-delà de ${LIVR.eur(des)} TTC de commande` : '') : ` · ${LIVR.eur(pu)} TTC du km selon le montant de la commande`}`, qte: demande.livraison.km, unite: 'km', puCents: pu, coutCents: null, tva: 20 });
  }
  return out;
}

/* estimation d'une ligne de sélection (contrôle serveur du total affiché au client) */
function estimerLigne(l, p, tarifs = {}) {
  const qte = Math.max(1, Math.min(100000, Math.round(Number(l.qte) || 1)));
  const base = p?.prixCents ?? null;
  let sup = 0;
  for (const g of p?.groupes || []) {
    const choisis = (l.choix?.[g.id] || []);
    if (g.mode === 'quantites') continue; /* suppléments par part : comptés à part */
    for (const id of choisis) { const [oid] = String(id).split(':'); const o = (g.options || []).find(x => x.id === oid); if (o?.supCents) sup += o.supCents; }
  }
  const supplements = supplementsParPart(l, p);
  let total = base == null ? 0 : (base + sup) * qte + totalSupplements(supplements);
  if (l.personnel?.nb) total += (tarifs.personnel?.heureCents || 4188) * l.personnel.nb * Math.max(tarifs.personnel?.minHeures || 4, l.personnel.heures || 0);
  if (l.pack?.id) { const pk = (tarifs.packs || []).find(x => x.id === l.pack.id); if (pk) total += pk.prixCents * (l.pack.nb || qte); }
  return { qte, supCents: sup, supplements, totalCents: total, surDevis: base == null };
}

/* Envoi automatique du devis (Jean-Luc, 2026-11-24) : une demande du site part toute seule, devis compris,
   seulement si TOUT est connu. Renvoie la liste des raisons qui obligent l'équipe à la traiter à la main (vide = envoi automatique). */
function raisonsDevisManuel(demande, catalogue, T = {}, now = new Date()) {
  const r = [];
  if (demande.type !== 'devis') return ['message, pas une demande de devis'];
  const lignes = demande.lignes || [];
  if (!lignes.length) r.push('sélection vide');
  for (const l of lignes) {
    const p = catalogue.bySlug.get(l.slug), nom = `« ${String(l.titre || l.slug || '').replace(/\*\*/g, '')} »`;
    if (!p || p.statut === 'masque') { r.push(`${nom} n’est pas dans le catalogue (à créer ou à rechercher)`); continue; }
    if (p.prixCents == null || l.prixCents == null || l.surDevis) { r.push(`${nom} n’a pas de prix (sur devis)`); continue; }
    if (p.aCompleter) r.push(`${nom} est une fiche à compléter`);
    if ((Number(l.qte) || 0) < Math.max(1, +p.min || 1)) r.push(`${nom} : quantité sous le minimum (${p.min})`);
    for (const g of p.groupes || []) {
      if (g.facultatif || (g.options || []).length < 2 && !g.mode) continue;
      if ((g.variantes || []).length && (p.variantes || []).length && !g.variantes.includes(l.variante)) continue; /* groupe d'une autre formule */
      const ch = l.choix?.[g.id] || [];
      if (g.mode === 'quantites') { const n = ch.reduce((t, x) => t + (+String(x).split(':')[1] || 0), 0); if (n !== +l.qte) r.push(`${nom} : choix « ${g.titre || 'options'} » incomplets`); continue; }
      if (!ch.length) r.push(`${nom} : aucun choix pour « ${g.titre || 'options'} »`);
      else if (g.exact && g.max && ch.length !== +g.max) r.push(`${nom} : il faut ${g.max} choix pour « ${g.titre || 'options'} »`);
    }
  }
  const e = demande.evenement || {};
  const jours = +(T.devisAutoDelaiJours ?? 2);
  const ev = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? Date.parse(e.date + 'T12:00:00') : NaN;
  const auj = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(ev)) r.push('date de l’événement manquante');
  else if ((ev - auj) / 86400e3 < jours) r.push(`événement dans moins de ${jours} jours : disponibilité à vérifier`);
  if (!(+e.invites > 0)) r.push('nombre d’invités manquant');
  if (!e.ville || !(+demande.livraison?.km > 0)) r.push('adresse de livraison manquante (distance inconnue)');
  if (LIVR.horsZone(e.cp)) r.push('livraison hors Île-de-France : tarif à proposer au client');
  if (!String(demande.contact?.tel || '').replace(/\D/g, '')) r.push('pas de téléphone pour rappeler le client');
  return [...new Set(r)];
}

module.exports = { raisonsDevisManuel, regleAcompte, totaux, controleMarge, prochainNumero, lignesDepuisDemande, estimerLigne, marge, coutLigne, supplementsParPart, totalSupplements, choixDepuisNote };
