'use strict';
/* Calculs des devis et factures. Tous les prix sont saisis et affichés TTC ; la TVA est déduite ligne par ligne. */

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
  return { brutCents, remiseCents, ttcCents, htCents, tva, coutCents, margeCents: ttcCents - coutCents };
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

async function prochainNumero(store, type) {
  const an = new Date().getFullYear();
  const key = `compteurs/${type}-${an}`;
  const c = (await store.get(key)) || { n: 0 };
  c.n += 1;
  await store.set(key, c);
  return `${type === 'devis' ? 'D' : type === 'facture' ? 'F' : 'R'}-${an}-${String(c.n).padStart(4, '0')}`;
}

/* une demande du site (lignes de sélection) devient des lignes de devis */
function lignesDepuisDemande(demande, catalogue, tarifs = {}) {
  const out = [];
  for (const l of demande.lignes || []) {
    const p = catalogue.bySlug.get(l.slug);
    out.push({
      designation: l.titre + (l.variante ? ' · ' + l.variante : ''),
      detail: [l.resume, l.note ? 'Note : ' + l.note : ''].filter(Boolean).join(' — '),
      qte: Number(l.qte) || 1, unite: l.unite || p?.unite || '',
      puCents: (l.prixCents ?? p?.prixCents ?? 0) + (l.supCents || 0), coutCents: p?.coutCents ?? null,
      tva: p?.tva ?? 10, produit: l.slug,
    });
    if (l.personnel?.nb) {
      out.push({ designation: tarifs.personnel?.label || 'Personnel de service', detail: `${l.personnel.nb} pers. × ${l.personnel.heures} h`, qte: l.personnel.nb * l.personnel.heures, unite: 'heure', puCents: tarifs.personnel?.heureCents || 4188, coutCents: null, tva: 20 });
    }
    if (l.pack?.id) {
      const pk = (tarifs.packs || []).find(x => x.id === l.pack.id);
      if (pk) out.push({ designation: pk.label, detail: pk.detail, qte: l.pack.nb || l.qte, unite: 'personne', puCents: pk.prixCents, coutCents: null, tva: 20 });
    }
  }
  if (demande.livraison?.km) out.push({ designation: 'Livraison et reprise', detail: `${demande.evenement?.ville || ''} · ${demande.livraison.km} km aller-retour`, qte: demande.livraison.km, unite: 'km', puCents: tarifs.kmCents || 100, coutCents: null, tva: 20 });
  return out;
}

/* estimation d'une ligne de sélection (contrôle serveur du total affiché au client) */
function estimerLigne(l, p, tarifs = {}) {
  const qte = Math.max(1, Math.min(100000, Math.round(Number(l.qte) || 1)));
  const base = p?.prixCents ?? null;
  let sup = 0;
  for (const g of p?.groupes || []) {
    const choisis = (l.choix?.[g.id] || []);
    for (const id of choisis) { const o = (g.options || []).find(x => x.id === id); if (o?.supCents) sup += o.supCents; }
  }
  let total = base == null ? 0 : (base + sup) * qte;
  if (l.personnel?.nb) total += (tarifs.personnel?.heureCents || 4188) * l.personnel.nb * Math.max(tarifs.personnel?.minHeures || 4, l.personnel.heures || 0);
  if (l.pack?.id) { const pk = (tarifs.packs || []).find(x => x.id === l.pack.id); if (pk) total += pk.prixCents * (l.pack.nb || qte); }
  return { qte, supCents: sup, totalCents: total, surDevis: base == null };
}

module.exports = { totaux, controleMarge, prochainNumero, lignesDepuisDemande, estimerLigne };
