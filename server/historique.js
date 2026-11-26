'use strict';
/*
 * Historique commercial de l'ancien CRM (Teamleader) — Jean-Luc, 2026-11-26.
 * Export des « opportunités » (affaires) depuis 2017 : une ligne = une affaire (client, événement, date, invités, lieu,
 * montant HT, facturé, marge, source, commercial, et pour une affaire perdue : date et motif du refus).
 * - l'import (lancé depuis le back-office, jamais de données client dans le dépôt) range chaque affaire dans `affaires/<clé>`,
 *   rattachée à la fiche du client (même e-mail, sinon même portable) ; un client inconnu est créé ;
 * - la source Teamleader va dans « 🧭 Origine du contact » de la fiche seulement si elle est vide (ou simplement « Import ») ;
 * - une même affaire réimportée (nouvel export plus complet, par exemple avec les affaires perdues) est mise à jour, jamais doublée ;
 * - un import peut être annulé : affaires retirées, fiches créées retirées (si rien d'autre dessus), cases complétées remises.
 * Les totaux par client, les statistiques et les critères de recherche sont calculés à partir des affaires (fonctions pures).
 */
const multer = require('multer');
const { lireTableau } = require('./tableur');
const { rid, sha, nomPropre } = require('./util');
const IC = require('./import-clients');

const sansAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- colonnes de l'export (titres Teamleader, avec ou sans numéro devant : « 3 Evènement ») ---------- */
const COLONNES = [
  ['emailContact', /^adresse e ?mail de contact/],
  ['email', /^client ?: ?(adresse )?e ?mail/],
  ['mobile', /^client ?: ?(mobile|portable|gsm)/],
  ['tel', /^client ?: ?(telephone|tel|fixe)/],
  ['ville', /^client ?: ?ville/],
  ['cp', /^client ?: ?code postal/],
  ['societeClient', /^client ?: ?(societe|entreprise)/],
  ['client', /^(client|contact|societe ou contact|client \/ contact)$/],
  ['lieu', /^lieu/],
  ['evenement', /^(evenement|type d ?evenement|type)$/],
  ['age', /^age/],
  ['dateEvt', /^(date|date de l ?evenement|date evenement|date de la prestation)$/],
  ['pax', /^(nombre )?(pax|invites|convives|personnes)/],
  ['accepteLe', /^date (acceptee|de signature|gagnee)/],
  ['ajouteLe', /^date (ajoutee|de creation|creee)/],
  ['refuseLe', /^date (refusee?|perdue)/],
  ['factureMontant', /^facture.*montant/],
  ['facture', /^facture$/],
  ['marge', /^marge/],
  ['montant', /^(montant|valeur|montant ht|total ht)/],
  ['source', /^(source|origine)/],
  ['commercial', /^(responsabilite|responsable|commercial|vendeur|attribue a)/],
  ['motif', /^(motif|raison).*(refus|perte|perdu)?/],
  ['phase', /^(phase|statut|etat|etape)$/],
  ['titre', /^(titre|nom de l ?affaire|sujet|intitule)$/],
];
const titreNet = h => sansAcc(h).replace(/^\s*\d+\s*/, '').replace(/[^a-z0-9:/]+/g, ' ').replace(/\s*:\s*/g, ' : ').replace(/\s+/g, ' ').trim();
function colonnesDe(entetes) {
  const pos = {};
  entetes.forEach((h, i) => { const t = titreNet(h); const c = COLONNES.find(([k, re]) => pos[k] == null && re.test(t)); if (c) pos[c[0]] = i; });
  return pos;
}
/* le fichier ressemble-t-il à un export d'affaires ? (client + montant + une date d'affaire) */
const estExportAffaires = pos => pos.client != null && pos.montant != null && (pos.accepteLe != null || pos.ajouteLe != null || pos.refuseLe != null || pos.phase != null);

/* ---------- normalisation ---------- */
const euroCents = v => { const s = String(v ?? '').replace(/[\s €]|EUR/gi, ''); if (!s) return null; const x = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); const n = Math.round(parseFloat(x) * 100); return Number.isFinite(n) ? n : null; };
function jour(v) {
  const s = String(v ?? '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return +m[1] >= 2000 && +m[1] <= 2100 ? `${m[1]}-${m[2]}-${m[3]}` : '';
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return +y >= 2000 && +y <= 2100 ? `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; }
  return '';
}
/* « 45 à 50 » -> 50 ; « 100 » -> 100 */
const invites = v => { const n = String(v ?? '').match(/\d+/g); return n ? Math.min(5000, Math.max(...n.map(Number))) : null; };
/* types d'événement : « ANNIVERSAIRE » -> « Anniversaire » */
const enPhrase = v => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!s) return ''; const l = s.toLocaleLowerCase('fr-FR'); return l.charAt(0).toLocaleUpperCase('fr-FR') + l.slice(1); };
const MOTS_MAJ = new Set(['dj', 'jlb', 'bde', 'cse', 'ce', 'sas', 'sarl', 'idf', 'tv']);
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'et', 'sur', 'd', 'l', 'ex']);
const enTitre = v => String(v ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr-FR').replace(/(^|[\s(/'’-])(\p{L}[\p{L}.]*)/gu, (m, a, w, i) => a + (i > 0 && PETITS.has(sansAcc(w)) ? w : MOTS_MAJ.has(sansAcc(w)) || !/[aeiouy]/.test(sansAcc(w)) ? w.toLocaleUpperCase('fr-FR') : w.charAt(0).toLocaleUpperCase('fr-FR') + w.slice(1)));
/* sources Teamleader -> mêmes mots que la liste « Origine du contact » du back-office */
const SOURCES = { '1001 salles': '1001 salles', 'abc salles': 'ABC salles', 'ancien client': 'Ancien client', 'par telephone': 'Téléphone', telephone: 'Téléphone', 'bouche a oreille': 'Bouche à oreille', 'nouveau site magnolia': 'Site', 'site internet': 'Site', mail: 'E-mail', 'what apps': 'WhatsApp', whatsapp: 'WhatsApp', 'delice des antilles': 'Délices des Antilles', 'delices des antilles': 'Délices des Antilles', 'mariage.net': 'Mariage.net', '1001 traiteurs': '1001 traiteurs' };
function sourceNette(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim(); const k = sansAcc(s);
  if (!k || /^(inconnu|inconnue|aucune?|-|\?)$/.test(k)) return '';
  return (SOURCES[k] || enTitre(s)).slice(0, 60);
}
const commercialNet = v => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!s || /^deleted user$/i.test(s)) return s ? 'Ancien compte' : ''; if (/planning/i.test(s)) return ''; return nomPropre(s); };
/* lieu : « (*) LIEU DU CLIENT », « (*) LE LIEU DU CLIENT (traiteur/DJ) » -> « Lieu du client » ; sinon le nom, sans le tiret final */
function lieuNet(v) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  if (/lieu du client/i.test(s)) return 'Lieu du client';
  return enTitre(s.replace(/^\(\*\)\s*/, '').replace(/[\s.-]+$/, '')).slice(0, 80);
}
/* un nom tout en majuscules sur plusieurs mots (« ORA EVENTS ») est une société */
const estSociete = n => { const l = String(n || '').replace(/[^\p{L}]/gu, ''); return l.length > 2 && l === l.toLocaleUpperCase('fr-FR') && /\s/.test(String(n).trim()); };

/* ---------- une ligne -> une affaire ---------- */
function lireAffaire(ligne, pos) {
  const g = k => (pos[k] == null ? '' : String(ligne[pos[k]] ?? '').trim());
  const brutNom = g('client').replace(/\s+/g, ' ').trim();
  const emails = [g('email'), g('emailContact')].flatMap(x => x.split(/[\s;,]+/)).map(x => x.toLowerCase().replace(/^mailto:/, '')).filter(x => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x));
  const tels = [g('mobile'), g('tel')].map(t => IC.normTel(t)).filter(t => t?.ok);
  const refuseLe = jour(g('refuseLe')), accepteLe = jour(g('accepteLe')), ajouteLe = jour(g('ajouteLe')), motif = g('motif').replace(/\s+/g, ' ').slice(0, 200), phase = sansAcc(g('phase'));
  const statut = refuseLe || motif || /perdu|refus|annul/.test(phase) ? 'perdue' : accepteLe || /gagn|accept|sign|factur/.test(phase) ? 'gagnee' : 'ouverte';
  const a = {
    client: estSociete(brutNom) ? brutNom : nomPropre(brutNom), societe: estSociete(brutNom) ? brutNom : g('societeClient'),
    email: [...new Set(emails)][0] || '', autresEmails: [...new Set(emails)].slice(1),
    tel: tels[0]?.tel || '', telE164: tels[0]?.e164 || '', tels: tels.map(t => t.e164),
    ville: g('ville'), cp: (s => (/^\d{5}$/.test(s) ? s : ''))(g('cp').replace(/\s/g, '')),
    titre: g('titre').slice(0, 160), evenement: enPhrase(g('evenement')).slice(0, 60), age: (g('age').match(/\d{1,3}/) || [''])[0],
    dateEvt: jour(g('dateEvt')), invites: invites(g('pax')), invitesTexte: g('pax').slice(0, 30), lieu: lieuNet(g('lieu')),
    ajouteLe, accepteLe, refuseLe, statut, motif: statut === 'perdue' ? motif : '',
    montantHtCents: euroCents(g('montant')) || 0, factureHtCents: euroCents(g('factureMontant')), margeHtCents: euroCents(g('marge')),
    facture: enPhrase(g('facture')), source: sourceNette(g('source')), sourceBrute: g('source').slice(0, 60), commercial: commercialNet(g('commercial')),
  };
  if (a.margeHtCents === 0 && a.montantHtCents) a.margeHtCents = null; /* 0 = marge non saisie (avant 2020) */
  /* clé stable : même client, même date d'ajout, même date d'événement, même montant -> même affaire */
  const qui = a.email || a.telE164 || sansAcc(brutNom);
  a.cle = 'tl_' + sha([qui, a.ajouteLe, a.dateEvt, a.montantHtCents, sansAcc(a.evenement), sansAcc(a.lieu)].join('|')).slice(0, 20);
  a.ok = !!(brutNom || a.email || a.tel);
  return a;
}
/* ---------- export des FACTURES (Teamleader) : une ligne = une facture ----------
   Elles donnent le chiffre réellement facturé (HT, TTC, avoirs déduits), payé ou non, le reste dû, la société qui facture. */
const COLONNES_FACT = [
  ['numero', /^numero de (la )?facture$/], ['entite', /^(entite|societe emettrice)$/], ['client', /^client$/], ['attn', /^(attn|a l attention de|contact)$/],
  ['email', /^(e ?mail|adresse e ?mail)$/], ['tel', /^(telephone|tel|mobile|portable)$/], ['adresse', /^adresse du client/],
  ['date', /^date de comptabilisation$/], ['dateFacture', /^date de la facture$/], ['echeance', /^echeance$/],
  ['paye', /^paye$/], ['payeLe', /^date du paiement$/], ['ht', /^total ht$/], ['ttc', /^total ttc$/],
  ['creditHt', /^montant total credite ht$/], ['creditTtc', /^montant total credite ttc$/], ['du', /^total du$/], ['totalPaye', /^total paye$/],
  ['rappels', /^nombre de rappels$/], ['oppNum', /^numero de l ?opportunite liee$/], ['oppTitre', /^titre de l ?opportunite liee$/],
  ['modes', /^modes de paiement disponibles$/], ['mode', /^mode de paiement$/], ['comm', /^communication structuree$/],
];
function colonnesFact(entetes) {
  const pos = {};
  entetes.forEach((h, i) => { const t = titreNet(h); const c = COLONNES_FACT.find(([k, re]) => pos[k] == null && re.test(t)); if (c) pos[c[0]] = i; });
  return pos;
}
const estExportFactures = pos => pos.numero != null && pos.ht != null && (pos.paye != null || pos.du != null) && pos.client != null;
function lireFacture(ligne, pos) {
  const g = k => (pos[k] == null ? '' : String(ligne[pos[k]] ?? '').trim());
  const brut = g('client').replace(/\s+/g, ' ').trim(), attn = g('attn').replace(/\s+/g, ' ').trim();
  const emails = g('email').split(/[\s;,]+/).map(x => x.toLowerCase()).filter(x => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x));
  const tels = [g('tel')].map(t => IC.normTel(t)).filter(t => t?.ok);
  const adr = g('adresse'), m = adr.match(/\b(\d{5})\s+([^,]+)/);
  /* « ACCENTURE SAS » + « Attn : Sarah OUERTANI » : la fiche est celle de la personne, la société à côté */
  const soc = estSociete(brut) || (attn && brut && nomPropre(attn) !== nomPropre(brut)) ? brut : '';
  const qui = attn && soc ? attn : brut;
  const date = jour(g('date')) || jour(g('dateFacture'));
  const htC = euroCents(g('ht')) || 0, creditC = euroCents(g('creditHt')) || 0, ttcC = euroCents(g('ttc')) || 0, creditTtcC = euroCents(g('creditTtc')) || 0;
  const duC = Math.max(0, euroCents(g('du')) || 0), payeC = euroCents(g('totalPaye')) || 0;
  const f = {
    genre: 'facture', numero: g('numero').slice(0, 40), entite: enTitre(g('entite').replace(/^[.\s]+/, '')).slice(0, 60),
    client: estSociete(qui) ? qui : nomPropre(qui), societe: soc,
    email: emails[0] || '', autresEmails: emails.slice(1), tel: tels[0]?.tel || '', telE164: tels[0]?.e164 || '', tels: tels.map(t => t.e164),
    ville: m ? m[2].trim().slice(0, 60) : '', cp: m ? m[1] : '', adresse: adr.replace(/,?\s*France$/i, '').slice(0, 200),
    date, ajouteLe: date, accepteLe: '', refuseLe: '', dateEvt: '', statut: 'facture',
    htCents: htC, ttcCents: ttcC, creditHtCents: creditC, creditTtcCents: creditTtcC, netHtCents: htC - creditC, netTtcCents: ttcC - creditTtcC,
    payee: g('paye') === '1' || /^(oui|vrai|true)$/i.test(g('paye')) || (duC === 0 && ttcC > 0), payeLe: jour(g('payeLe')), payeCents: payeC, duCents: duC < 2 ? 0 : duC,
    rappels: +g('rappels') || 0, oppNum: g('oppNum').slice(0, 20), oppTitre: g('oppTitre').slice(0, 120), mode: (g('mode') || g('modes')).slice(0, 60), source: '', commercial: '',
  };
  f.cle = 'tf_' + sha([sansAcc(f.entite), f.numero, f.date, g('comm')].join('|')).slice(0, 20);
  f.ok = !!(brut || f.email) && !!f.numero;
  return f;
}

function lireFichier(lignes) {
  const pf = colonnesFact(lignes[0] || []);
  if (estExportFactures(pf)) {
    const vus = new Set(), affaires = []; let doublons = 0, vides = 0;
    for (const l of lignes.slice(1)) { if (!l.some(c => c)) continue; const f = lireFacture(l, pf); if (!f.ok) { vides++; continue; } if (vus.has(f.cle)) { doublons++; continue; } vus.add(f.cle); affaires.push(f); }
    return { pos: pf, genre: 'factures', affaires, doublons, vides };
  }
  const pos = colonnesDe(lignes[0] || []);
  if (!estExportAffaires(pos)) return { pos, affaires: null };
  const vus = new Set(), affaires = [];
  let doublons = 0, vides = 0;
  for (const l of lignes.slice(1)) {
    if (!l.some(c => c)) continue;
    const a = lireAffaire(l, pos);
    if (!a.ok) { vides++; continue; }
    if (vus.has(a.cle)) { doublons++; continue; }
    vus.add(a.cle); affaires.push(a);
  }
  return { pos, genre: 'affaires', affaires, doublons, vides };
}

/* ---------- calculs (fonctions pures) ---------- */
const dateRef = a => a.accepteLe || a.refuseLe || a.ajouteLe || a.dateEvt || '';
const anDe = a => (dateRef(a) || '').slice(0, 4);
const plusFrequent = l => { const m = new Map(); for (const x of l) if (x) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };

/* résumé d'un client : a-t-il commandé, combien de fois, pour combien, quand */
function resumeClient(L) {
  const G = L.filter(a => a.statut === 'gagnee'), P = L.filter(a => a.statut === 'perdue');
  const dates = G.map(a => a.accepteLe || a.dateEvt).filter(Boolean).sort();
  const evts = G.map(a => a.dateEvt).filter(Boolean).sort();
  return {
    affaires: L.length, commandes: G.length, perdues: P.length, ouvertes: L.length - G.length - P.length,
    caHtCents: G.reduce((s, a) => s + (a.montantHtCents || 0), 0),
    premiere: dates[0] || '', derniere: dates[dates.length - 1] || '', dernierEvt: evts[evts.length - 1] || '',
    types: [...new Set(G.concat(P).map(a => a.evenement).filter(Boolean))], commercial: plusFrequent(L.map(a => a.commercial)),
    source: plusFrequent(L.slice().sort((a, b) => dateRef(a).localeCompare(dateRef(b))).slice(0, 1).map(a => a.source)),
    motifs: [...new Set(P.map(a => a.motif).filter(Boolean))],
  };
}
function parClient(affaires) {
  const m = new Map();
  for (const a of affaires) if (a.clientId) { if (!m.has(a.clientId)) m.set(a.clientId, []); m.get(a.clientId).push(a); }
  return new Map([...m].map(([id, L]) => [id, resumeClient(L)]));
}

/* prochaine date « anniversaire » d'un événement passé (même jour et mois), dans les `jours` qui viennent */
function prochaineFois(dateEvt, ref, jours) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEvt || '')) return null;
  const [, m, d] = dateEvt.split('-').map(Number), j0 = new Date(ref + 'T12:00:00Z');
  let x = new Date(Date.UTC(j0.getUTCFullYear(), m - 1, d, 12)); if (x < j0) x = new Date(Date.UTC(j0.getUTCFullYear() + 1, m - 1, d, 12));
  const dans = Math.round((x - j0) / 864e5);
  return dans <= jours ? { date: x.toISOString().slice(0, 10), dans } : null;
}

/* statistiques de tout l'historique : par année, sources, commerciaux, événements, lieux, meilleurs clients, clients à relancer */
function statistiques(affaires, { clients = new Map(), aujourdHui = new Date().toISOString().slice(0, 10) } = {}) {
  if (!affaires.length) return null;
  const G = affaires.filter(a => a.statut === 'gagnee'), P = affaires.filter(a => a.statut === 'perdue');
  const ans = [...new Set(affaires.map(anDe).filter(Boolean))].sort();
  const parAn = ans.map(an => {
    const g = G.filter(a => anDe(a) === an), p = P.filter(a => anDe(a) === an), mg = g.filter(a => a.margeHtCents != null);
    const ca = g.reduce((s, a) => s + a.montantHtCents, 0), caM = mg.reduce((s, a) => s + a.montantHtCents, 0);
    return { an, commandes: g.length, perdues: p.length, caHtCents: ca, panierHtCents: g.length ? Math.round(ca / g.length) : 0,
      margeHtCents: mg.length ? mg.reduce((s, a) => s + a.margeHtCents, 0) : null, margePct: caM ? Math.round(1000 * mg.reduce((s, a) => s + a.margeHtCents, 0) / caM) / 10 : null,
      taux: g.length + p.length && p.length ? Math.round(100 * g.length / (g.length + p.length)) : null, nonFacturees: g.filter(a => /^non/i.test(a.facture)).length,
      clients: new Set(g.map(a => a.clientId || a.email || a.client)).size };
  });
  /* CA par mois (mois de la signature), pour comparer une année à l'autre : CA, nombre de commandes, cumul depuis janvier */
  const parMois = ans.map(an => {
    const mois = Array.from({ length: 12 }, () => ({ caHtCents: 0, commandes: 0 }));
    for (const a of G) { const d = a.accepteLe || a.dateEvt; if (d && d.slice(0, 4) === an) { const m = mois[+d.slice(5, 7) - 1]; m.caHtCents += a.montantHtCents; m.commandes++; } }
    let c = 0; mois.forEach(m => { c += m.caHtCents; m.cumulHtCents = c; });
    return { an, mois };
  });
  /* même chose au mois de l'événement (le chiffre « réalisé » du mois) */
  const ansEvt = [...new Set(G.map(a => (a.dateEvt || '').slice(0, 4)).filter(Boolean))].sort();
  const parMoisEvt = ansEvt.map(an => {
    const mois = Array.from({ length: 12 }, () => ({ caHtCents: 0, commandes: 0 }));
    for (const a of G) { const d = a.dateEvt; if (d && d.slice(0, 4) === an) { const m = mois[+d.slice(5, 7) - 1]; m.caHtCents += a.montantHtCents; m.commandes++; } }
    let c = 0; mois.forEach(m => { c += m.caHtCents; m.cumulHtCents = c; });
    return { an, mois };
  });
  /* regroupements : nombre, CA HT, et une série par année */
  const grouper = (cle, max = 40) => {
    const m = new Map();
    for (const a of affaires) {
      const k = cle(a) || ''; if (!m.has(k)) m.set(k, { nom: k, commandes: 0, perdues: 0, caHtCents: 0, parAn: Object.fromEntries(ans.map(x => [x, 0])) });
      const o = m.get(k);
      if (a.statut === 'gagnee') { o.commandes++; o.caHtCents += a.montantHtCents; if (anDe(a)) o.parAn[anDe(a)] += a.montantHtCents; } else if (a.statut === 'perdue') o.perdues++;
    }
    return [...m.values()].map(o => ({ ...o, taux: o.perdues ? Math.round(100 * o.commandes / (o.commandes + o.perdues)) : null, panierHtCents: o.commandes ? Math.round(o.caHtCents / o.commandes) : 0 }))
      .sort((a, b) => b.caHtCents - a.caHtCents || b.commandes - a.commandes).slice(0, max);
  };
  const motifs = (() => { const m = new Map(); for (const a of P) { const k = a.motif || 'Sans motif'; m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).map(([nom, nb]) => ({ nom, nb })); })();
  /* clients */
  const parC = new Map();
  for (const a of affaires) { const k = a.clientId || 'x:' + (a.email || a.tel || sansAcc(a.client)); if (!parC.has(k)) parC.set(k, []); parC.get(k).push(a); }
  const fiches = [...parC].map(([k, L]) => { const r = resumeClient(L), c = clients.get(k), a0 = L[L.length - 1]; return { id: k.startsWith('x:') ? '' : k, nom: c?.nom || a0.client, societe: c?.societe || a0.societe || '', email: c?.email || a0.email, tel: c?.tel || a0.tel, L, ...r }; });
  const meilleurs = fiches.filter(f => f.commandes).sort((a, b) => b.caHtCents - a.caHtCents).slice(0, 50).map(({ L, ...f }) => f);
  const fideles = fiches.filter(f => f.commandes);
  const ilYa = (d, mois) => { const x = new Date(aujourdHui + 'T12:00:00Z'); x.setUTCMonth(x.getUTCMonth() - mois); return d && d < x.toISOString().slice(0, 10); };
  /* à relancer 1 : ont commandé au moins 2 fois, rien depuis plus d'un an */
  const endormis = fideles.filter(f => f.commandes >= 2 && ilYa(f.derniere, 12) && ilYa(f.dernierEvt || f.derniere, 12)).sort((a, b) => b.caHtCents - a.caHtCents).slice(0, 60).map(({ L, ...f }) => f);
  /* à relancer 2 : la date de leur événement revient dans les 60 jours (anniversaire, soirée d'entreprise annuelle…) et rien de prévu depuis */
  const reviennent = fideles.map(f => {
    const evs = f.L.filter(a => a.statut === 'gagnee' && a.dateEvt && a.dateEvt < aujourdHui);
    const futur = f.L.some(a => a.statut !== 'perdue' && a.dateEvt >= aujourdHui);
    if (futur || !evs.length) return null;
    const best = evs.map(a => ({ a, p: prochaineFois(a.dateEvt, aujourdHui, 60) })).filter(x => x.p && ilYa(x.a.dateEvt, 10)).sort((x, y) => x.p.dans - y.p.dans)[0];
    if (!best) return null;
    const { L, ...g } = f;
    return { ...g, prochaine: best.p.date, dans: best.p.dans, evtPasse: best.a.dateEvt, evtType: best.a.evenement, evtAge: best.a.age, evtHtCents: best.a.montantHtCents };
  }).filter(Boolean).sort((a, b) => a.dans - b.dans || b.caHtCents - a.caHtCents).slice(0, 80);
  const tot = G.reduce((s, a) => s + a.montantHtCents, 0);
  return {
    total: { affaires: affaires.length, commandes: G.length, perdues: P.length, ouvertes: affaires.length - G.length - P.length, caHtCents: tot, panierHtCents: G.length ? Math.round(tot / G.length) : 0,
      clients: fideles.length, recurrents: fideles.filter(f => f.commandes >= 2).length, depuis: affaires.map(dateRef).filter(Boolean).sort()[0] || '', jusque: affaires.map(dateRef).filter(Boolean).sort().pop() || '',
      taux: P.length ? Math.round(100 * G.length / (G.length + P.length)) : null, nonFacturees: G.filter(a => /^non/i.test(a.facture)).length },
    ans, parAn, parMois, parMoisEvt, aujourdHui, sources: grouper(a => a.source), commerciaux: grouper(a => a.commercial), evenements: grouper(a => a.evenement, 25), lieux: grouper(a => a.lieu, 25), motifs,
    meilleurs, endormis, reviennent,
  };
}

/* ---------- factures : résumé d'un client, statistiques ---------- */
function resumeFactures(L) {
  const d = L.map(f => f.date).filter(Boolean).sort();
  return { factures: L.length, netHtCents: L.reduce((t, f) => t + f.netHtCents, 0), netTtcCents: L.reduce((t, f) => t + f.netTtcCents, 0), duCents: L.reduce((t, f) => t + f.duCents, 0), impayees: L.filter(f => f.duCents > 0).length, premiere: d[0] || '', derniere: d[d.length - 1] || '' };
}
function parClientFactures(factures) {
  const m = new Map();
  for (const f of factures) if (f.clientId) { if (!m.has(f.clientId)) m.set(f.clientId, []); m.get(f.clientId).push(f); }
  return new Map([...m].map(([id, L]) => [id, resumeFactures(L)]));
}
function statsFactures(factures, { clients = new Map() } = {}) {
  if (!factures.length) return null;
  const an = f => (f.date || '').slice(0, 4);
  const ans = [...new Set(factures.map(an).filter(Boolean))].sort();
  const parAn = ans.map(a => { const L = factures.filter(f => an(f) === a); return { an: a, factures: L.length, netHtCents: L.reduce((t, f) => t + f.netHtCents, 0), netTtcCents: L.reduce((t, f) => t + f.netTtcCents, 0), payeCents: L.reduce((t, f) => t + f.payeCents, 0), duCents: L.reduce((t, f) => t + f.duCents, 0), impayees: L.filter(f => f.duCents > 0).length, avoirs: L.filter(f => f.creditHtCents > 0).length }; });
  /* même forme que le CA signé par mois : on peut comparer les années de la même façon */
  const parMois = ans.map(a => {
    const mois = Array.from({ length: 12 }, () => ({ caHtCents: 0, commandes: 0 }));
    for (const f of factures) if (an(f) === a) { const m = mois[+f.date.slice(5, 7) - 1]; m.caHtCents += f.netHtCents; m.commandes++; }
    let c = 0; mois.forEach(m => { c += m.caHtCents; m.cumulHtCents = c; });
    return { an: a, mois };
  });
  const entites = [...new Set(factures.map(f => f.entite || ''))].map(e => { const L = factures.filter(f => (f.entite || '') === e); return { nom: e, commandes: L.length, perdues: 0, caHtCents: L.reduce((t, f) => t + f.netHtCents, 0), parAn: Object.fromEntries(ans.map(a => [a, L.filter(f => an(f) === a).reduce((t, f) => t + f.netHtCents, 0)])), duCents: L.reduce((t, f) => t + f.duCents, 0), taux: null, panierHtCents: L.length ? Math.round(L.reduce((t, f) => t + f.netHtCents, 0) / L.length) : 0 }; }).sort((x, y) => y.caHtCents - x.caHtCents);
  const impayees = factures.filter(f => f.duCents > 0).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 300).map(f => { const c = clients.get(f.clientId); return { id: f.clientId || '', nom: c?.nom || f.client, societe: c?.societe || f.societe || '', tel: c?.tel || f.tel, email: c?.email || f.email, numero: f.numero, entite: f.entite, date: f.date, ttcCents: f.netTtcCents, duCents: f.duCents, rappels: f.rappels, oppTitre: f.oppTitre }; });
  return {
    total: { factures: factures.length, netHtCents: factures.reduce((t, f) => t + f.netHtCents, 0), netTtcCents: factures.reduce((t, f) => t + f.netTtcCents, 0), payeCents: factures.reduce((t, f) => t + f.payeCents, 0), duCents: factures.reduce((t, f) => t + f.duCents, 0), impayees: factures.filter(f => f.duCents > 0).length, depuis: factures.map(f => f.date).filter(Boolean).sort()[0] || '' },
    ans, parAn, parMois, entites, impayees,
  };
}

/* critères de recherche d'une fiche (liste Clients) */
function critere(r, aujourdHui = new Date().toISOString().slice(0, 10), rf = null) {
  const fac = { fnb: rf?.factures || 0, fdu: rf?.duCents || 0 };
  if (!r) return { aff: 0, cmd: 0, ca: 0, an: '', types: [], com: '', motifs: [], mois: null, ...fac };
  const mois = r.derniere ? Math.floor((Date.parse(aujourdHui) - Date.parse(r.derniere)) / (30.44 * 864e5)) : null;
  return { aff: r.affaires, cmd: r.commandes, ca: r.caHtCents, an: (r.derniere || '').slice(0, 4), types: r.types, com: r.commercial, motifs: r.motifs, mois, ...fac };
}
function filtre(k, q) {
  const v = x => String(q[x] || '').slice(0, 80);
  const c = v('hcmd');
  if (c === 'oui' && !k.cmd) return false;
  if (c === 'non' && !(k.aff && !k.cmd)) return false;
  if (c === 'jamais' && k.cmd) return false;
  if (/^\d+$/.test(c) && k.cmd < +c) return false;
  if (v('hmontant') && k.ca < +v('hmontant') * 100) return false;
  const an = v('hder');
  if (/^\d{4}$/.test(an) && k.an !== an) return false;
  if (/^plus\d+$/.test(an) && !(k.cmd && k.mois != null && k.mois >= +an.slice(4))) return false;
  if (/^moins\d+$/.test(an) && !(k.cmd && k.mois != null && k.mois < +an.slice(5))) return false;
  if (v('hevt') && !k.types.includes(v('hevt'))) return false;
  if (v('hcom') && k.com !== v('hcom')) return false;
  if (v('hmotif') && !k.motifs.includes(v('hmotif'))) return false;
  if (v('hfac') === 'impaye' && !(k.fdu > 0)) return false;
  if (v('hfac') === 'oui' && !k.fnb) return false;
  if (v('hfac') === 'non' && k.fnb) return false;
  return true;
}
const CRITERES = ['hcmd', 'hmontant', 'hder', 'hevt', 'hcom', 'hmotif', 'hfac'];
function facettes(ks) {
  const n = (m, x) => { if (x) m.set(x, (m.get(x) || 0) + 1); };
  const evt = new Map(), com = new Map(), an = new Map(), mot = new Map();
  for (const k of ks) { k.types.forEach(x => n(evt, x)); n(com, k.com); n(an, k.an); k.motifs.forEach(x => n(mot, x)); }
  const tri = m => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr'));
  return { evt: tri(evt), com: tri(com), ans: [...an].sort((a, b) => b[0].localeCompare(a[0])), motifs: tri(mot), commande: ks.filter(k => k.cmd).length, perdus: ks.filter(k => k.aff && !k.cmd).length, factures: ks.filter(k => k.fnb).length, impayes: ks.filter(k => k.fdu > 0).length };
}

/* ---------- import (routes du back-office) ---------- */
function creerHistorique({ store, sources, log }) {
  const sessions = new Map();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

  async function index() {
    const email = new Map(), tel = new Map(), fiches = new Map();
    for (const { id, data: c } of await store.list('clients')) {
      fiches.set(id, c);
      if (c.email) { const e = String(c.email).trim().toLowerCase(); if (!email.has(e)) email.set(e, id); }
      for (const t of [c.telE164, c.tel, c.telAutre]) for (const x of String(t || '').split('/')) { const k = IC.telCle(x); if (k && !tel.has(k)) tel.set(k, id); }
    }
    return { email, tel, fiches };
  }
  /* fiche d'une affaire : même e-mail ; sans e-mail (ou e-mail inconnu), même portable d'une fiche sans autre e-mail */
  function trouver(a, I) {
    for (const e of [a.email, ...a.autresEmails]) if (e && I.email.has(e)) return I.email.get(e);
    for (const t of a.tels) {
      const id = I.tel.get(IC.telCle(t)); if (!id) continue;
      const c = I.fiches.get(id); if (!a.email || !c?.email) return id;
    }
    return null;
  }
  /* regroupe les affaires d'un même client du fichier (même e-mail ou même portable) */
  function regrouper(affaires, I) {
    const groupes = [], parCle = new Map();
    for (const a of affaires) {
      const cles = [...[a.email, ...a.autresEmails].filter(Boolean).map(e => 'e:' + e), ...(!a.email ? a.tels.map(t => 't:' + IC.telCle(t)) : [])];
      if (!cles.length) cles.push('n:' + sansAcc(a.client));
      let g = cles.map(k => parCle.get(k)).find(Boolean);
      if (!g) { g = { affaires: [], id: null }; groupes.push(g); }
      g.affaires.push(a); for (const k of cles) parCle.set(k, g);
      if (!g.id) g.id = trouver(a, I);
    }
    return groupes;
  }
  async function analyser(S) {
    const I = await index();
    const groupes = regrouper(S.affaires, I);
    const deja = new Set((await store.list(collDe(S))).map(d => d.id));
    if (S.genre === 'factures') {
      const F = S.affaires, ans = {}; for (const f of F) { const y = (f.date || '').slice(0, 4); if (y) ans[y] = (ans[y] || 0) + 1; }
      const ent = {}; for (const f of F) if (f.entite) ent[f.entite] = (ent[f.entite] || 0) + f.netHtCents;
      return { genre: 'factures', affaires: F.length, factures: F.length, netHtCents: F.reduce((t, f) => t + f.netHtCents, 0), duCents: F.reduce((t, f) => t + f.duCents, 0), impayees: F.filter(f => f.duCents > 0).length, avoirs: F.filter(f => f.creditHtCents > 0).length,
        entites: Object.entries(ent).sort((a, b) => b[1] - a[1]), ans, doublons: S.doublons, vides: S.vides,
        clients: groupes.length, retrouves: groupes.filter(g => g.id).length, nouveaux: groupes.filter(g => !g.id).length, dejaImportees: F.filter(f => deja.has(f.cle)).length, colonnes: Object.keys(S.pos) };
    }
    const G = S.affaires.filter(a => a.statut === 'gagnee'), P = S.affaires.filter(a => a.statut === 'perdue');
    const ans = {}; for (const a of S.affaires) { const y = anDe(a); if (y) ans[y] = (ans[y] || 0) + 1; }
    return {
      affaires: S.affaires.length, gagnees: G.length, perdues: P.length, ouvertes: S.affaires.length - G.length - P.length,
      caHtCents: G.reduce((s, a) => s + a.montantHtCents, 0), ans, doublons: S.doublons, vides: S.vides,
      clients: groupes.length, retrouves: groupes.filter(g => g.id).length, nouveaux: groupes.filter(g => !g.id).length,
      dejaImportees: S.affaires.filter(a => deja.has(a.cle)).length,
      sources: Object.entries(S.affaires.reduce((m, a) => { if (a.source) m[a.source] = (m[a.source] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12),
      motifs: P.filter(a => a.motif).length,
      colonnes: Object.keys(S.pos),
    };
  }

  const collDe = S => (S.genre === 'factures' ? 'facturesTl' : 'affaires');
  async function importer(S, meta) {
    const COLL = collDe(S);
    const I = await index();
    const groupes = regrouper(S.affaires, I);
    const now = new Date().toISOString(), liste = new Set((await sources.liste()).map(x => x.toLowerCase()));
    const R = { affairesCrees: 0, affairesMaj: 0, clientsCrees: 0, clientsCompletes: 0, sourcesPosees: 0 };
    /* sources assez fréquentes : ajoutées à la liste déroulante « Origine du contact » */
    const freq = new Map(); for (const a of S.affaires) if (a.source) freq.set(a.source, (freq.get(a.source) || 0) + 1);
    for (const [s, n] of freq) if (n >= 5 && !liste.has(s.toLowerCase())) { await sources.ajouter(s); liste.add(s.toLowerCase()); }
    for (const g of groupes) {
      const L = g.affaires.slice().sort((a, b) => dateRef(a).localeCompare(dateRef(b)));
      const der = L[L.length - 1], prem = L[0];
      const src = L.find(a => a.source)?.source || '';
      let cid = g.id;
      if (!cid) {
        cid = 'c_' + rid(8);
        const avecMail = L.find(a => a.email), avecTel = L.slice().reverse().find(a => a.tel), avecVille = L.slice().reverse().find(a => a.ville || a.cp);
        const nom = (L.slice().reverse().find(a => a.client && !estSociete(a.client)) || der).client;
        const soc = L.slice().reverse().find(a => a.societe)?.societe || '';
        const f = { id: cid, nom, societe: soc, email: avecMail?.email || '', tel: avecTel?.tel || '', telE164: avecTel?.telE164 || '', ville: avecVille?.ville || '', cp: avecVille?.cp || '', departement: IC.departementDe(avecVille?.cp || ''), notes: '' };
        const parts = nom.split(' '); const i = parts.findIndex((w, k) => k >= 1 && /\p{L}{2}/u.test(w) && w === w.toLocaleUpperCase('fr-FR'));
        if (i > 0 && !estSociete(nom)) { f.prenom = parts.slice(0, i).join(' '); f.nomFamille = parts.slice(i).join(' '); }
        await store.set('clients/' + cid, {
          ...f, creeLe: (prem.ajouteLe || prem.accepteLe || now.slice(0, 10)) + 'T12:00:00.000Z', derniereActivite: (der.accepteLe || der.ajouteLe || now.slice(0, 10)) + 'T12:00:00.000Z',
          source: 'import CRM', canal: src || 'Import', histoCree: meta.id, statutContact: 'client existant',
          consentement: { email: true, sms: true, base: 'client existant (a commandé ou demandé un devis à Magnolia)', le: now, source: `historique commercial « ${meta.fichier} »`, par: meta.par },
        });
        if (f.email && !(await store.get('_clientemail/' + sha(f.email)))) await store.set('_clientemail/' + sha(f.email), { id: cid });
        R.clientsCrees++;
      } else {
        const c = await store.get('clients/' + cid);
        if (c) {
          const p = {};
          /* la source Teamleader seulement si la fiche n'en a pas (ou juste « Import ») */
          const canal = String(c.canal ?? '').trim();
          if (src && (!canal || canal === 'Import')) { p.canal = src; R.sourcesPosees++; }
          const avecTel = L.slice().reverse().find(a => a.tel), avecVille = L.slice().reverse().find(a => a.ville || a.cp), soc = L.slice().reverse().find(a => a.societe)?.societe;
          if (!c.tel && avecTel) { p.tel = avecTel.tel; p.telE164 = avecTel.telE164; }
          if (!c.ville && avecVille?.ville) p.ville = avecVille.ville;
          if (!c.cp && avecVille?.cp) { p.cp = avecVille.cp; if (!c.departement) p.departement = IC.departementDe(avecVille.cp); }
          if (!c.societe && soc) p.societe = soc;
          const act = (der.accepteLe || der.ajouteLe) ? (der.accepteLe || der.ajouteLe) + 'T12:00:00.000Z' : '';
          if (act && String(c.derniereActivite || '') < act) p.derniereActivite = act;
          if (Object.keys(p).length) {
            const ap = '_histimports/' + meta.id + '/avant/' + cid;
            const av = (await store.get(ap)) || { id: cid, champs: {} };
            for (const k of Object.keys(p)) if (!(k in av.champs)) av.champs[k] = c[k] === undefined ? null : c[k];
            await store.set(ap, av);
            await store.set('clients/' + cid, { ...c, ...p });
            if (Object.keys(p).some(k => k !== 'derniereActivite')) R.clientsCompletes++;
          }
        }
      }
      for (const a of L) {
        const { ok, cle, ...doc } = a;
        const avant = await store.get(COLL + '/' + cle);
        if (avant) { await store.set('_histimports/' + meta.id + '/prec/' + cle, avant); R.affairesMaj++; } else R.affairesCrees++;
        await store.set(COLL + '/' + cle, { ...doc, id: cle, clientId: avant?.clientId && avant.clientId !== cid && I.fiches.has(avant.clientId) ? avant.clientId : cid, impId: meta.id, origine: 'Teamleader', majLe: now, ...(avant ? { creeImp: avant.creeImp || avant.impId } : { creeImp: meta.id }) });
      }
    }
    return R;
  }

  function routes(A, { sameSite, manager, wrap, audit }) {
    const json = require('express').json({ limit: '1mb' });
    A.post('/actions/historique/fichier', sameSite, manager, upload.single('fichier'), wrap(async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
      let lignes;
      try { lignes = lireTableau(req.file.buffer, req.file.originalname); } catch (e) { return res.status(400).json({ error: e.message }); }
      const r = lireFichier(lignes);
      if (!r.affaires) return res.status(400).json({ error: 'Ce fichier ne ressemble ni à un export d’affaires (opportunités : colonnes « Client », « Montant HT » et « Date acceptée ») ni à un export de factures (« Numéro de facture », « Client », « Total HT », « Payé »). Pour un fichier de contacts, utilisez « ⬆ Importer des contacts ».' });
      if (!r.affaires.length) return res.status(400).json({ error: 'Aucune ligne lisible dans ce fichier.' });
      for (const [k, s] of sessions) if (Date.now() - s.at > 3 * 36e5 || sessions.size > 3) sessions.delete(k);
      const tok = rid(12), S = { tok, fichier: String(req.file.originalname || 'fichier').slice(0, 120), ...r, at: Date.now(), par: req.ctx.name || req.ctx.email || '' };
      sessions.set(tok, S);
      res.json({ ok: true, tok, fichier: S.fichier, ...(await analyser(S)) });
    }));
    A.post('/actions/historique/importer', sameSite, manager, json, wrap(async (req, res) => {
      const S = sessions.get(String(req.body?.tok || ''));
      if (!S) return res.status(410).json({ error: 'Le fichier n’est plus en mémoire (plus de 3 h, ou le site a été remis en ligne entre-temps). Déposez-le à nouveau.' });
      if (S.enCours) return res.status(409).json({ error: 'Cet import est déjà en cours.' });
      S.enCours = true;
      const id = 'hist_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + rid(4).replace(/[^A-Za-z0-9]/g, 'x');
      const meta = { id, fichier: S.fichier, par: S.par };
      await store.set('_histimports/' + id, { id, fichier: S.fichier, genre: S.genre, at: new Date().toISOString(), par: S.par, total: S.affaires.length, statut: 'en cours' });
      try {
        const R = await importer(S, meta);
        await store.set('_histimports/' + id, { ...(await store.get('_histimports/' + id)), statut: 'terminé', finiLe: new Date().toISOString(), compteurs: R });
        audit(req.ctx, 'historique commercial importé', '_histimports/' + id, `${S.fichier} · ${R.affairesCrees} affaire(s) ajoutée(s), ${R.affairesMaj} mise(s) à jour, ${R.clientsCrees} client(s) créé(s)`);
        sessions.delete(S.tok);
        await store.flush?.();
        res.json({ ok: true, id, ...R });
      } catch (e) { S.enCours = false; throw e; }
    }));
    A.get('/actions/historique/imports', wrap(async (req, res) => {
      res.json((await store.list('_histimports')).map(d => d.data).filter(x => x?.at).sort((a, b) => String(b.at).localeCompare(String(a.at))));
    }));
    A.post('/actions/historique/:id/annuler', sameSite, manager, wrap(async (req, res) => {
      const id = req.params.id, doc = await store.get('_histimports/' + id);
      if (!doc) return res.status(404).json({ error: 'Import introuvable.' });
      if (doc.statut === 'annulé') return res.status(400).json({ error: 'Cet import a déjà été annulé.' });
      let affaires = 0, remises = 0, retires = 0, gardes = 0, remis = 0;
      const prec = new Map((await store.list('_histimports/' + id + '/prec')).map(d => [d.id, d.data]));
      for (const COLL of ['affaires', 'facturesTl']) for (const { id: k, data: a } of await store.list(COLL)) {
        if (a.impId !== id) continue;
        if (prec.has(k)) { await store.set(COLL + '/' + k, prec.get(k)); remises++; } else { await store.delete(COLL + '/' + k); affaires++; }
      }
      for (const k of prec.keys()) await store.delete('_histimports/' + id + '/prec/' + k);
      const restantes = new Set([...(await store.list('affaires')), ...(await store.list('facturesTl'))].map(d => d.data?.clientId));
      const lies = new Set();
      for (const k of ['demandes', 'devis', 'factures']) for (const { data } of await store.list(k)) if (data.clientId) lies.add(data.clientId);
      for (const { id: cid, data: c } of await store.list('clients')) {
        if (c.histoCree !== id) continue;
        if (lies.has(cid) || restantes.has(cid) || (c.journal || []).length || c.importIds?.length) { const { histoCree, ...reste } = c; await store.set('clients/' + cid, reste); gardes++; continue; }
        await store.delete('clients/' + cid);
        if (c.email) { const ix = await store.get('_clientemail/' + sha(String(c.email).toLowerCase())); if (ix?.id === cid) await store.delete('_clientemail/' + sha(String(c.email).toLowerCase())); }
        retires++;
      }
      for (const { id: cid, data: av } of await store.list('_histimports/' + id + '/avant')) {
        const c = await store.get('clients/' + cid);
        if (c) { const n = { ...c }; for (const [k, v] of Object.entries(av.champs || {})) { if (v == null) delete n[k]; else n[k] = v; } await store.set('clients/' + cid, n); remis++; }
        await store.delete('_histimports/' + id + '/avant/' + cid);
      }
      await store.set('_histimports/' + id, { ...doc, statut: 'annulé', annuleLe: new Date().toISOString(), annulePar: req.ctx.name || req.ctx.email || '', annulation: { affaires, remises, retires, gardes, remis } });
      audit(req.ctx, 'historique commercial annulé', '_histimports/' + id, `${affaires} affaire(s) retirée(s), ${retires} client(s) retiré(s)`);
      await store.flush?.();
      res.json({ ok: true, affaires, remises, retires, gardes, remis });
    }));
  }
  return { routes, sessions };
}

/* « reste dû » masqué jusqu'en 2027 (Jean-Luc, 2026-11-26) ; même réglage côté back-office : HISTO_RESTE_DU dans public/admin/admin.js */
const AFFICHER_RESTE_DU = false;
module.exports = { AFFICHER_RESTE_DU, resumeFactures, parClientFactures, statsFactures, lireFacture, creerHistorique, lireFichier, lireAffaire, colonnesDe, sourceNette, lieuNet, resumeClient, parClient, statistiques, critere, filtre, facettes, CRITERES, prochaineFois };
