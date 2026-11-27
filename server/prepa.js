'use strict';
/* Prépa de commande (Jean-Luc, 2026-11-27) — INTERNE : le bon de préparation envoyé à la cuisine / au service préparation.
   Pré-rempli depuis le devis signé (ou la facture), la fiche client et sa demande ; tout reste modifiable.
   Jamais de prix sur le bon. Une colonne « Quantité à préparer » est prévue : Jean-Luc donnera plus tard les quantités détaillées. */
const { esc, nomPropre } = require('./util');
const LC = require('./livraison-client');
const { estLivraison } = require('./devis');

const ROLES = [
  ['regisseurs', 'Régisseur(s)'],
  ['livreurs', 'Livraison'],
  ['personnel', 'Personnel sur l’événement'],
];
const HORAIRES = [
  ['depart', 'Départ du laboratoire'],
  ['livraison', 'Livraison sur place'],
  ['debut', 'Début du service'],
  ['fin', 'Fin du service'],
  ['reprise', 'Reprise du matériel'],
];
const s = (v, n = 200) => String(v ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const txt = (v, n = 3000) => String(v ?? '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const rid6 = () => Math.random().toString(36).slice(2, 8);
const nomUnite = (q, u) => { u = String(u || '').trim(); if (!u) return ''; if (+q > 1 && /^(personne|pièce|portion|plateau|coffret|bouteille|heure|table|chaise|unité|corbeille|gâteau|cocktail|litre)$/.test(u)) return /eau$/.test(u) ? u + 'x' : u + 's'; return u; };
const qteTexte = l => { const q = l.qteDevis; if (q === '' || q == null) return ''; return `${String(q).replace('.', ',')} ${nomUnite(q, l.unite)}`.trim(); };

/* ligne de personnel du devis (serveur, maître d'hôtel, régisseur…) : pas à préparer en cuisine, rappelée dans le cadre « Équipe » */
const RUB_PERSONNEL = 'personnel';
const estPersonnelL = (l, bySlug) => l.personnel === true || (() => { const p = bySlug.get(l.produit); return !!(p && (p.rubrique === RUB_PERSONNEL || (p.autresRubriques || []).includes(RUB_PERSONNEL))); })();

/* allergènes des produits de la commande (fiches du catalogue) */
function allergenesDe(lignes, bySlug) {
  const set = new Set();
  for (const l of lignes || []) for (const a of bySlug.get(l.produit)?.allergenes || []) set.add(a);
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}


/* Détail par produit (Jean-Luc, 2026-11-27) :
   - buffets / formules : ce que le client a choisi (entrées, plats, desserts…) avec le nombre de chacun ;
   - Pack softs en individuel : liste déroulante de tous les softs + nombre ;
   - Matériel traiteur : liste déroulante de tout le matériel + nombre. */
const LISTES = { softs: 'Softs', materiel: 'Matériel', compo: 'Choix du client' };
function listeDe(slug, titre) {
  const t = String(titre || '').toLowerCase();
  if (/pack-softs?/.test(slug || '') || /pack\s+softs?/.test(t)) return 'softs';
  if (/^materiel-traiteur/.test(slug || '') || /mat[ée]riel traiteur/.test(t)) return 'materiel';
  return '';
}
/* choix du client d'une ligne : mode « en portions » = nombre choisi ; sinon chaque choix pour toute la quantité (modifiable) */
function compoDe(l, p) {
  const out = [];
  for (const g of p?.groupes || []) {
    for (const id of l.choix?.[g.id] || []) {
      const [oid, n] = String(id).split(':'); const o = (g.options || []).find(x => x.id === oid);
      if (!o) continue;
      out.push({ groupe: s(String(g.titre || '').replace(/^vos\s+/i, ''), 60).replace(/^./, c => c.toUpperCase()), nom: s(o.label, 120), n: g.mode === 'quantites' ? Math.max(0, Math.round(+n || 0)) : (Number(l.qte) || '') });
    }
  }
  return out;
}
/* listes proposées dans les menus déroulants : softs (La cave de Magnolia : sodas, jus, eaux) et matériel (Indispensables, Mobilier à la location) */
function listesPrepa(produits = []) {
  const nom = p => String(p.titre || '').replace(/\*\*/g, '').trim();
  const uniq = l => [...new Set(l.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const softs = uniq(produits.filter(p => p && !p.fusionneDans && p.rubrique === 'boissons' && ['sodas', 'jus', 'eaux'].includes(p.rangement)).map(nom));
  const HORS_MAT = /chauffeur|photo ?booth|d[ée]coration|tente|pack traiteur|^mat[ée]riel traiteur$/i;
  const materiel = uniq(produits.filter(p => p && !p.fusionneDans && (p.rubrique === 'indispensables' || p.rubrique === 'mobilier-a-la-location' || (p.autresRubriques || []).includes('mobilier-a-la-location'))).map(nom).filter(n => !HORS_MAT.test(n)));
  return { softs, materiel };
}
const itemsTexte = l => (l.items || []).filter(x => x.nom).map(x => `${x.n !== '' && x.n != null ? x.n + ' × ' : ''}${x.nom}`);

/* lignes « À préparer » reprises du devis : titres gardés comme intertitres ; livraison et personnel à part */
function lignesDepuisDevis(devis, bySlug = new Map()) {
  const out = [];
  for (const l of devis?.lignes || []) {
    if (l.type === 'titre') { if (s(l.designation)) out.push({ id: 'l' + rid6(), type: 'titre', designation: s(l.designation, 300) }); continue; }
    if (estLivraison(l) || estPersonnelL(l, bySlug)) continue;
    const p = bySlug.get(l.produit), designation = s(String(l.designation || p?.titre || '').replace(/\*\*/g, ''), 300);
    const liste = listeDe(l.produit, designation), items = liste === 'compo' || !liste ? compoDe(l, p) : [];
    out.push({ id: 'l' + rid6(), type: 'produit', produit: s(l.produit, 160), designation, detail: items.length ? '' : txt(l.detail, 600), qteDevis: Number(l.qte) || '', unite: s(l.unite, 40), qtePrepa: '', note: txt(l.note, 400), allergenes: [...(p?.allergenes || [])], liste: items.length ? 'compo' : liste, items });
  }
  /* un intertitre sans produit en dessous ne sert à rien */
  return out.filter((x, i) => x.type !== 'titre' || (out[i + 1] && out[i + 1].type !== 'titre'));
}
const personnelDuDevis = (devis, bySlug = new Map()) => (devis?.lignes || []).filter(l => l.type !== 'titre' && !estLivraison(l) && estPersonnelL(l, bySlug)).map(l => `${String(l.designation || '').replace(/\*\*/g, '')}${l.qte ? ' × ' + String(l.qte).replace('.', ',') + (l.unite ? ' ' + nomUnite(l.qte, l.unite) : '') : ''}`.trim());

/* bon pré-rempli (rien n'est enregistré) */
function bonDepuis({ devis, client = null, demande = null, facture = null, bySlug = new Map(), entreprise = null }) {
  const e = devis.evenement || {}, a = client ? LC.adresseLivraison(client) : {}, liv = client?.livraison || {};
  const memeVille = !e.cp || !a.cp || a.cp === e.cp;
  const lignes = lignesDepuisDevis(devis, bySlug);
  return {
    id: devis.id, devisId: devis.id, devisNumero: devis.numero || '', factureNumero: facture?.numero || '',
    client: {
      nom: nomPropre(client?.nom || devis.clientNom || demande?.contact?.nom || ''),
      societe: s(entreprise?.nom || client?.societe || demande?.contact?.societe || ''),
      tel: s(client?.tel || demande?.contact?.tel || '', 40),
      email: s(client?.email || demande?.contact?.email || '', 160),
    },
    evenement: {
      type: s(e.type || demande?.evenement?.type || '', 60), date: /^\d{4}-\d\d-\d\d$/.test(e.date || '') ? e.date : (demande?.evenement?.date || ''),
      invites: e.invites || demande?.evenement?.invites || '', lieu: s(e.lieu || '', 160),
      adresse: s(e.adresse || (memeVille ? a.adresse : '') || '', 200), cp: s(e.cp || a.cp || '', 5), ville: s(e.ville || a.ville || '', 80),
    },
    acces: txt(e.livreurs || LC.infosLivreurs(liv), 800),
    contactSurPlace: s([liv.contact, liv.contactTel].filter(Boolean).join(' · '), 160),
    allergies: '',
    horaires: { depart: '', livraison: s(e.horaire || a.horaire || '', 60), debut: '', fin: '', reprise: '' },
    regisseurs: [], livreurs: [], personnel: [],
    personnelDevis: personnelDuDevis(devis, bySlug),
    lignes, remarques: '',
    allergenesProduits: allergenesDe(lignes, bySlug),
    nouveau: true,
  };
}

const personnes = l => (Array.isArray(l) ? l : []).slice(0, 40).map(p => ({ nom: nomPropre(s(p?.nom, 80)), tel: s(p?.tel, 30), email: s(p?.email, 160) })).filter(p => p.nom);

/* ce que l'écran envoie, nettoyé ; les envois, le lien et la création sont gardés de la version précédente */
function nettoyer(b = {}, avant = {}, bySlug = new Map()) {
  const c = b.client || {}, e = b.evenement || {}, h = b.horaires || {};
  const lignes = (Array.isArray(b.lignes) ? b.lignes : []).slice(0, 400).map(l => l?.type === 'titre'
    ? { id: s(l.id, 20) || 'l' + rid6(), type: 'titre', designation: s(l.designation, 300) }
    : { id: s(l?.id, 20) || 'l' + rid6(), type: 'produit', produit: s(l?.produit, 160), designation: s(l?.designation, 300), detail: txt(l?.detail, 600), qteDevis: l?.qteDevis === '' || l?.qteDevis == null ? '' : Math.max(0, Math.min(1e6, +String(l.qteDevis).replace(',', '.') || 0)), unite: s(l?.unite, 40), qtePrepa: s(l?.qtePrepa, 60), note: txt(l?.note, 400), allergenes: (Array.isArray(l?.allergenes) ? l.allergenes : bySlug.get(l?.produit)?.allergenes || []).slice(0, 14).map(x => s(x, 30)), liste: LISTES[l?.liste] ? l.liste : '', items: (Array.isArray(l?.items) ? l.items : []).slice(0, 80).map(x => ({ groupe: s(x?.groupe, 60), nom: s(x?.nom, 120), n: x?.n === '' || x?.n == null ? '' : Math.max(0, Math.min(1e6, Math.round(+String(x.n).replace(',', '.') || 0))) })).filter(x => x.nom) })
    .filter(l => l.designation || l.type === 'produit' && (l.qtePrepa || l.note));
  return {
    id: avant.id || s(b.devisId, 60), devisId: avant.devisId || s(b.devisId, 60), devisNumero: s(b.devisNumero ?? avant.devisNumero, 40), factureNumero: s(b.factureNumero ?? avant.factureNumero, 40),
    client: { nom: nomPropre(s(c.nom, 120)), societe: s(c.societe, 120), tel: s(c.tel, 40), email: s(c.email, 160) },
    evenement: { type: s(e.type, 60), date: /^\d{4}-\d\d-\d\d$/.test(e.date || '') ? e.date : '', invites: Math.max(0, Math.min(100000, parseInt(e.invites, 10) || 0)) || '', lieu: s(e.lieu, 160), adresse: s(e.adresse, 200), cp: s(e.cp, 5).replace(/\D/g, ''), ville: s(e.ville, 80) },
    acces: txt(b.acces, 800), contactSurPlace: s(b.contactSurPlace, 160), allergies: txt(b.allergies, 800),
    horaires: Object.fromEntries(HORAIRES.map(([k]) => [k, s(h[k], 60)])),
    regisseurs: personnes(b.regisseurs), livreurs: personnes(b.livreurs), personnel: personnes(b.personnel),
    personnelDevis: (Array.isArray(b.personnelDevis) ? b.personnelDevis : avant.personnelDevis || []).slice(0, 20).map(x => s(x, 200)).filter(Boolean),
    lignes, remarques: txt(b.remarques, 3000),
    allergenesProduits: allergenesDe(lignes, bySlug).length ? allergenesDe(lignes, bySlug) : [...new Set(lignes.flatMap(l => l.allergenes || []))].sort((x, y) => x.localeCompare(y, 'fr')),
    token: avant.token || '', envois: avant.envois || [],
    creeLe: avant.creeLe || new Date().toISOString(), creePar: avant.creePar || '',
  };
}

const dateLongue = d => { if (!d) return ''; const x = new Date(String(d).length === 10 ? d + 'T12:00:00Z' : d); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }); };
const dateCourte = d => { if (!d) return ''; const x = new Date(String(d).length === 10 ? d + 'T12:00:00Z' : d); return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }); };
const nl = t => esc(t).replace(/\n/g, '<br>');
const lieuTexte = b => [b.evenement.lieu, b.evenement.adresse, [b.evenement.cp, b.evenement.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const titreBon = b => `Bon de préparation · ${b.client.nom || 'client'}${b.evenement.date ? ' · ' + dateCourte(b.evenement.date) : ''}`;

/* détail sous le produit dans le bon : groupés par « Entrées », « Plats »… */
function itemsDoc(l) {
  const it = (l.items || []).filter(x => x.nom); if (!it.length) return '';
  const g = new Map(); for (const x of it) { const k = x.groupe || (l.liste === 'softs' ? 'Softs' : l.liste === 'materiel' ? 'Matériel' : ''); if (!g.has(k)) g.set(k, []); g.get(k).push(x); }
  return `<div class="it">${[...g].map(([k, l2]) => `<div>${k ? `<em>${esc(k)}${l2.length > 1 && l2.every(x => x.n !== '') ? ` · ${l2.reduce((t, x) => t + (+x.n || 0), 0)} au total` : ''}</em>` : ''}<ul>${l2.map(x => `<li><b>${x.n !== '' && x.n != null ? esc(x.n) : '…'}</b> ${esc(x.nom)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}

/* le bon en A4 (aperçu, impression, PDF, lien envoyé à la cuisine) — sans aucun prix */
function documentHtml(b, { R = {}, retour = '', maintenant = new Date(), par = '' } = {}) {
  const E = R.entreprise || {};
  const nomM = E.raisonSociale || 'Magnolia Traiteur';
  const v = x => x ? esc(x) : '<span class="pt"></span>';
  const equipe = (k, lab) => `<div class="eq"><h4>${esc(lab)}</h4>${b[k].length ? `<ul>${b[k].map(p => `<li><b>${esc(p.nom)}</b>${p.tel ? ` <span>${esc(p.tel)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="vide">—</p>'}${k === 'personnel' && b.personnelDevis.length ? `<p class="pd">Prévu au devis : ${esc(b.personnelDevis.join(' · '))}</p>` : ''}</div>`;
  const prod = b.lignes.filter(l => l.type !== 'titre');
  let n = 0;
  const rows = b.lignes.map(l => l.type === 'titre'
    ? `<tr class="ti"><td colspan="5">${esc(l.designation)}</td></tr>`
    : `<tr><td class="no">${++n}</td><td class="nm"><b>${esc(l.designation)}</b>${l.detail ? `<small>${nl(l.detail)}</small>` : ''}${itemsDoc(l)}${(l.allergenes || []).length ? `<small class="al">⚠ ${esc(l.allergenes.join(', '))}</small>` : ''}</td><td class="q">${esc(qteTexte(l)) || '—'}</td><td class="q prep">${esc(l.qtePrepa)}</td><td class="nt">${nl(l.note)}<span class="ok"></span></td></tr>`).join('');
  const hor = HORAIRES.filter(([k]) => b.horaires[k]);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(titreBon(b))}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: A4 portrait; margin: 11mm 10mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #e9e4d8; font-family: Jost, 'Helvetica Neue', Arial, sans-serif; color: #1d2a24; font-size: 9.4pt; line-height: 1.35; }
.barre { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 16px; background: #1d3b2f; color: #f4efe3; font-size: 14px; }
.barre button, .barre a { font: 600 15px Jost, sans-serif; border: 0; border-radius: 999px; padding: 10px 20px; cursor: pointer; background: #c9a56b; color: #1d3b2f; text-decoration: none; }
.barre .g { background: transparent; color: #f4efe3; border: 1px solid rgba(244,239,227,.5); }
.pg { width: 210mm; min-height: 297mm; padding: 11mm 10mm 12mm; margin: 14px auto; background: #fff; box-shadow: 0 4px 22px rgba(0,0,0,.16); }
header { display: flex; align-items: center; gap: 4mm; border-bottom: .6mm solid #b08a4f; padding-bottom: 2.6mm; margin-bottom: 3.4mm; }
.logo img { height: 14mm; width: auto; max-width: 30mm; object-fit: contain; display: block; }
.tx { flex: 1; min-width: 0; }
h1 { font-size: 15pt; letter-spacing: .04em; margin: 0; color: #1d3b2f; font-weight: 600; line-height: 1.1; }
.st { margin: 1mm 0 0; font-size: 10pt; color: #5b4a2e; }
.rf { display: flex; flex-direction: column; text-align: right; font-size: 7.6pt; color: #6b6f68; gap: .6mm; white-space: nowrap; }
.rf b { color: #1d3b2f; font-size: 9pt; }
.blocs { display: grid; grid-template-columns: 1.1fr 1fr; gap: 3mm; margin-bottom: 3mm; }
.bl { border: .3mm solid #d9cfbb; border-radius: 2mm; padding: 2.2mm 3mm; background: #fbf8f1; break-inside: avoid; }
.bl h3 { margin: 0 0 1.4mm; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .08em; color: #b08a4f; }
.bl p { margin: 0 0 .9mm; }
.bl p.l { display: grid; grid-template-columns: 25mm 1fr; }
.bl i { font-style: normal; color: #7a7d75; }
.bl .big { font-size: 11pt; font-weight: 600; color: #1d3b2f; }
.date { font-size: 11pt; font-weight: 600; color: #1d3b2f; }
.date::first-letter { text-transform: uppercase; }
.alerte { border: .5mm solid #b4412f; background: #fdf1ee; border-radius: 2mm; padding: 2mm 3mm; margin-bottom: 3mm; break-inside: avoid; }
.alerte b { color: #b4412f; }
.hor { display: grid; grid-template-columns: repeat(${Math.max(1, hor.length)}, 1fr); gap: 2mm; margin-bottom: 3mm; }
.hor div { border: .3mm solid #b08a4f; border-radius: 2mm; padding: 1.6mm 2.4mm; text-align: center; break-inside: avoid; }
.hor small { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .06em; color: #7a7d75; }
.hor b { font-size: 11.4pt; color: #1d3b2f; }
.equipe { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin-bottom: 3.4mm; }
.eq { border: .3mm solid #d9cfbb; border-radius: 2mm; padding: 1.8mm 2.6mm; break-inside: avoid; }
.eq h4 { margin: 0 0 1mm; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .06em; color: #b08a4f; }
.eq ul { margin: 0; padding: 0; list-style: none; }
.eq li { margin: 0 0 .6mm; } .eq li span { color: #6b6f68; font-size: 8.4pt; }
.eq .vide { margin: 0; color: #aaa; }
.eq .pd { margin: 1mm 0 0; font-size: 7.6pt; color: #8a7a5c; }
h2 { font-size: 11.4pt; color: #fff; background: #1d3b2f; margin: 0; padding: 1.6mm 3mm; border-radius: 2mm 2mm 0 0; letter-spacing: .04em; font-weight: 600; display: flex; justify-content: space-between; }
h2 span { font-weight: 400; font-size: 8.6pt; opacity: .85; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
th { background: #efe8d8; color: #1d3b2f; font-weight: 600; font-size: 7.6pt; text-align: left; padding: 1.4mm 1.8mm; text-transform: uppercase; letter-spacing: .04em; }
td { border: .25mm solid #cfc6b3; padding: 1.6mm 1.8mm; vertical-align: top; }
tr { break-inside: avoid; }
tr.ti td { background: #f6f1e5; font-weight: 600; color: #5b4a2e; text-transform: uppercase; letter-spacing: .05em; font-size: 8pt; }
.no { width: 7mm; text-align: center; color: #888; }
.nm b { font-weight: 600; font-size: 9.6pt; }
.nm small { display: block; color: #5d5f58; font-size: 8pt; margin-top: .6mm; }
.nm small.al { color: #b4412f; }
.it { display: flex; flex-wrap: wrap; gap: 1mm 6mm; margin-top: 1mm; }
.it em { display: block; font-style: normal; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .05em; color: #b08a4f; }
.it ul { margin: .4mm 0 0; padding: 0; list-style: none; font-size: 8.8pt; }
.it li b { display: inline-block; min-width: 7mm; color: #1d3b2f; }
th.q, td.q { width: 26mm; } td.q { font-weight: 600; }
td.prep { background: #fffdf6; }
th.nt, td.nt { width: 52mm; } td.nt { position: relative; padding-right: 9mm; font-size: 8.6pt; }
.ok { position: absolute; right: 1.8mm; top: 1.6mm; width: 4.6mm; height: 4.6mm; border: .35mm solid #1d3b2f; border-radius: 1mm; }
.rq { margin-top: 3.4mm; border: .3mm solid #d9cfbb; border-radius: 2mm; padding: 2.2mm 3mm; break-inside: avoid; }
.rq h3 { margin: 0 0 1mm; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .08em; color: #b08a4f; }
.rq p { margin: 0; }
.sig { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-top: 3.4mm; break-inside: avoid; }
.sig div { border: .3mm solid #b08a4f; border-radius: 2mm; padding: 1.8mm 3mm; height: 17mm; font-size: 8pt; color: #7a7d75; }
.sig b { display: block; color: #1d3b2f; font-size: 8.6pt; }
.pt { display: inline-block; width: 40mm; border-bottom: .25mm dotted #8a8a80; height: 3mm; vertical-align: -.4mm; }
footer { margin-top: 3mm; display: flex; justify-content: space-between; font-size: 7.2pt; color: #8a8d85; border-top: .2mm solid #e3dccb; padding-top: 1mm; }
@media print { body { background: #fff; } .barre { display: none; } .pg { margin: 0; padding: 0; box-shadow: none; width: auto; min-height: 0; } }
@media screen and (max-width: 820px) { .pg { zoom: .46; } }
</style></head><body>
<div class="barre"><span>Bon de préparation · ${prod.length} produit${prod.length > 1 ? 's' : ''} · sans prix</span><button type="button" onclick="window.print()">🖨 Imprimer ou enregistrer en PDF</button>${retour ? `<a class="g" href="${esc(retour)}">← Retour au back-office</a>` : ''}</div>
<section class="pg">
<header><div class="logo"><img src="${esc(E.logo || '/brand/monogramme.svg')}" alt=""></div><div class="tx"><h1>BON DE PRÉPARATION DE COMMANDE</h1><p class="st">${esc(nomM)} · à l’attention de la cuisine et du service préparation</p></div>
<div class="rf">${b.devisNumero ? `<b>Devis ${esc(b.devisNumero)}</b>` : ''}${b.factureNumero ? `<span>Facture ${esc(b.factureNumero)}</span>` : ''}<span>Édité le ${esc(dateCourte(maintenant))}${par ? ' par ' + esc(par) : ''}</span></div></header>
<div class="blocs">
<div class="bl"><h3>Client</h3><p class="big">${v(b.client.nom)}</p>${b.client.societe ? `<p class="l"><i>Société</i> ${esc(b.client.societe)}</p>` : ''}<p class="l"><i>Téléphone</i> ${v(b.client.tel)}</p>${b.contactSurPlace ? `<p class="l"><i>Contact sur place</i> ${esc(b.contactSurPlace)}</p>` : ''}</div>
<div class="bl"><h3>Événement</h3><p class="date">${b.evenement.date ? esc(dateLongue(b.evenement.date)) : v('')}</p><p class="l"><i>Type</i> ${v(b.evenement.type)}</p><p class="l"><i>Invités</i> ${b.evenement.invites ? `<b>${esc(b.evenement.invites)} personnes</b>` : v('')}</p><p class="l"><i>Lieu / livraison</i> <span>${v(lieuTexte(b))}</span></p>${b.acces ? `<p class="l"><i>Accès</i> <span>${nl(b.acces)}</span></p>` : ''}</div>
</div>
${b.allergies || b.allergenesProduits.length ? `<div class="alerte">${b.allergies ? `<p><b>⚠ Allergies / régimes signalés :</b> ${nl(b.allergies)}</p>` : ''}${b.allergenesProduits.length ? `<p><b>Allergènes présents dans la commande :</b> ${esc(b.allergenesProduits.join(', '))}</p>` : ''}</div>` : ''}
${hor.length ? `<div class="hor">${hor.map(([k, lab]) => `<div><small>${esc(lab)}</small><b>${esc(b.horaires[k])}</b></div>`).join('')}</div>` : ''}
<div class="equipe">${ROLES.map(([k, lab]) => equipe(k, lab)).join('')}</div>
<h2>À PRÉPARER <span>${prod.length} produit${prod.length > 1 ? 's' : ''}${b.evenement.invites ? ' · ' + esc(b.evenement.invites) + ' invités' : ''}</span></h2>
<table><thead><tr><th class="no">N°</th><th>Produit et choix</th><th class="q">Quantité du devis</th><th class="q">Quantité à préparer</th><th class="nt">Remarque cuisine · ✓ prêt</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucun produit.</td></tr>'}</tbody></table>
${b.remarques ? `<div class="rq"><h3>Remarques</h3><p>${nl(b.remarques)}</p></div>` : ''}
<div class="sig"><div><b>Préparé par</b>Nom, date et heure</div><div><b>Vérifié au départ par</b>Nom, date et heure</div></div>
<footer><span>Document interne · ${esc(nomM)} · ne pas remettre au client</span><span>${esc(b.client.nom)}${b.evenement.date ? ' · ' + esc(dateCourte(b.evenement.date)) : ''}</span></footer>
</section></body></html>`;
}

/* e-mail : message + résumé lisible dans toutes les messageries (styles en ligne) + lien vers le bon A4 */
function emailHtml(b, { message = '', lien = '', R = {} } = {}) {
  const nomM = R.entreprise?.raisonSociale || 'Magnolia Traiteur';
  const td = 'padding:6px 8px;border:1px solid #ddd3bf;vertical-align:top;font-size:14px';
  const rows = b.lignes.map(l => l.type === 'titre' ? `<tr><td colspan="3" style="${td};background:#f6f1e5;font-weight:600;text-transform:uppercase;font-size:12px;color:#5b4a2e">${esc(l.designation)}</td></tr>`
    : `<tr><td style="${td}"><b>${esc(l.designation)}</b>${l.detail ? `<br><span style="color:#666;font-size:12px">${nl(l.detail)}</span>` : ''}${itemsTexte(l).length ? `<br><span style="font-size:13px">${itemsTexte(l).map(esc).join('<br>')}</span>` : ''}${l.note ? `<br><span style="color:#8a5a1f;font-size:12px">${nl(l.note)}</span>` : ''}</td><td style="${td};white-space:nowrap">${esc(qteTexte(l)) || '—'}</td><td style="${td};white-space:nowrap">${esc(l.qtePrepa) || ''}</td></tr>`).join('');
  const eq = ROLES.map(([k, lab]) => b[k].length ? `<b>${esc(lab)} :</b> ${esc(b[k].map(p => p.nom + (p.tel ? ' (' + p.tel + ')' : '')).join(', '))}<br>` : '').join('');
  const hor = HORAIRES.filter(([k]) => b.horaires[k]).map(([k, lab]) => `${esc(lab)} : <b>${esc(b.horaires[k])}</b>`).join(' · ');
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1d2a24;max-width:680px">
${message ? `<p>${nl(message)}</p>` : ''}
${lien ? `<p><a href="${esc(lien)}" style="display:inline-block;background:#1d3b2f;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Ouvrir le bon de préparation (A4, à imprimer)</a></p>` : ''}
<h2 style="color:#1d3b2f;font-size:18px;margin:18px 0 6px">${esc(b.client.nom)}${b.client.societe ? ' · ' + esc(b.client.societe) : ''}</h2>
<p style="margin:0 0 6px">${b.evenement.date ? `<b>${esc(dateLongue(b.evenement.date))}</b> · ` : ''}${esc(b.evenement.type || '')}${b.evenement.invites ? ` · <b>${esc(b.evenement.invites)} invités</b>` : ''}<br>${esc(lieuTexte(b))}${b.client.tel ? `<br>Téléphone du client : ${esc(b.client.tel)}` : ''}</p>
${hor ? `<p style="margin:0 0 6px">${hor}</p>` : ''}${eq ? `<p style="margin:0 0 6px">${eq}</p>` : ''}
${b.allergies || b.allergenesProduits.length ? `<p style="margin:0 0 6px;color:#b4412f">${b.allergies ? `<b>⚠ Allergies :</b> ${nl(b.allergies)}<br>` : ''}${b.allergenesProduits.length ? `Allergènes de la commande : ${esc(b.allergenesProduits.join(', '))}` : ''}</p>` : ''}
<table style="border-collapse:collapse;width:100%;margin-top:8px"><tr><th style="${td};background:#1d3b2f;color:#fff;text-align:left">À préparer</th><th style="${td};background:#1d3b2f;color:#fff;text-align:left">Qté devis</th><th style="${td};background:#1d3b2f;color:#fff;text-align:left">À préparer</th></tr>${rows}</table>
${b.remarques ? `<p style="margin-top:10px"><b>Remarques :</b><br>${nl(b.remarques)}</p>` : ''}
<p style="color:#888;font-size:12px;margin-top:16px">Document interne ${esc(nomM)} · ne pas transférer au client.</p></div>`;
}

const messageDefaut = (b, expediteur = '') => `Bonjour,\n\nVoici le bon de préparation de la commande de ${b.client.nom || 'notre client'}${b.evenement.date ? ' pour le ' + dateLongue(b.evenement.date) : ''}${b.evenement.invites ? ' (' + b.evenement.invites + ' invités)' : ''}.\nMerci de le vérifier et de me prévenir s’il manque quelque chose.\n\n${expediteur ? expediteur + '\n' : ''}Magnolia Traiteur`;
const smsTexte = (b, lien) => `Magnolia : bon de préparation ${b.client.nom || ''}${b.evenement.date ? ' du ' + dateCourte(b.evenement.date) : ''}${b.evenement.invites ? ', ' + b.evenement.invites + ' pers.' : ''}. A ouvrir : ${lien}`.replace(/\s+/g, ' ');


/* Messages à l'équipe (Jean-Luc, 2026-11-27) : un SMS ou un e-mail par groupe (régisseurs, livraison, personnel), rédigé par l'IA sur consigne */
const NOM_ROLE = { regisseurs: 'régisseurs', livreurs: 'livreurs', personnel: 'personnel sur l’événement' };
function infosRole(b, role) {
  const h = b.horaires || {}, e = b.evenement || {};
  const reg = (b.regisseurs || []).map(p => p.nom + (p.tel ? ' ' + p.tel : '')).join(', ');
  const L = [
    `Événement : ${e.type || 'événement'} de ${b.client.nom || 'notre client'}${b.client.societe ? ' (' + b.client.societe + ')' : ''}, ${e.date ? dateLongue(e.date) : 'date à confirmer'}${e.invites ? ', ' + e.invites + ' invités' : ''}`,
    `Lieu : ${lieuTexte(b) || 'à confirmer'}`,
  ];
  const hor = HORAIRES.filter(([k]) => h[k]).map(([k, lab]) => `${lab} : ${h[k]}`).join(' ; ');
  if (hor) L.push('Horaires : ' + hor);
  if (role === 'livreurs') { if (b.acces) L.push('Accès : ' + b.acces.replace(/\n/g, ' ')); if (b.contactSurPlace) L.push('Contact sur place : ' + b.contactSurPlace); else if (b.client.tel) L.push('Téléphone du client : ' + b.client.tel); }
  if (role === 'regisseurs') { if (b.client.tel) L.push('Téléphone du client : ' + b.client.tel); if (b.contactSurPlace) L.push('Contact sur place : ' + b.contactSurPlace); for (const [k, lab] of ROLES) if (k !== 'regisseurs' && (b[k] || []).length) L.push(`${lab} : ${b[k].map(p => p.nom).join(', ')}`); if (b.allergies) L.push('Allergies signalées : ' + b.allergies.replace(/\n/g, ' ')); }
  if (role === 'personnel' && reg) L.push('Régisseur : ' + reg);
  if (role !== 'personnel' && b.remarques) L.push('Remarques : ' + b.remarques.replace(/\n/g, ' '));
  return L;
}
function modeleMessage(b, role, canal) {
  const e = b.evenement || {}, h = b.horaires || {};
  const quand = e.date ? dateCourte(e.date) : 'date à confirmer';
  if (canal === 'sms') {
    const heure = role === 'livreurs' ? (h.depart ? 'départ labo ' + h.depart : '') + (h.livraison ? (h.depart ? ', ' : '') + 'livraison ' + h.livraison : '') : [h.debut && 'début ' + h.debut, h.fin && 'fin ' + h.fin].filter(Boolean).join(', ') || (h.livraison ? 'arrivée ' + h.livraison : '');
    return { sujet: '', texte: `Magnolia : ${role === 'livreurs' ? 'livraison' : 'événement'} ${b.client.nom || ''} le ${quand}${heure ? ' (' + heure + ')' : ''}. Adresse : ${lieuTexte(b) || 'à confirmer'}.${role === 'livreurs' && b.contactSurPlace ? ' Contact : ' + b.contactSurPlace + '.' : ''} Merci de confirmer.`.replace(/\s+/g, ' ') };
  }
  return { sujet: `Magnolia · ${role === 'livreurs' ? 'Livraison' : 'Événement'} ${b.client.nom || ''} · ${quand}`, texte: `Bonjour,\n\nVoici les informations pour ${role === 'livreurs' ? 'la livraison' : 'l’événement'} du ${quand} :\n\n${infosRole(b, role).map(x => '• ' + x).join('\n')}\n\nMerci de me confirmer votre présence.\n\nMagnolia Traiteur` };
}
function promptMessage({ b, role, canal, consigne = '', texte = '', sujet = '', expediteur = '' }) {
  const sms = canal === 'sms';
  return `Tu rédiges, pour ${expediteur || 'l’équipe'} de Magnolia Traiteur (traiteur événementiel), un ${sms ? 'SMS' : 'e-mail'} INTERNE destiné au groupe « ${NOM_ROLE[role] || role} » qui travaille sur un événement.
Informations du bon de préparation (n’en invente aucune autre ; aucun prix) :
${infosRole(b, role).map(x => '- ' + x).join('\n')}
Règles : français, tutoiement interdit (vouvoiement collectif « vous »), ton direct et cordial, phrases courtes, les heures et l’adresse bien visibles, demande de confirmation à la fin. ${sms ? 'SMS : 320 caractères maximum, sans emoji, commence par « Magnolia : ».' : 'E-mail : 6 à 14 lignes, avec un objet court, signé « Magnolia Traiteur ».'}
${consigne ? 'Consigne de la personne qui envoie (prioritaire) : ' + consigne + '\n' : ''}${texte ? 'Brouillon actuel à améliorer :' + (sms ? '' : '\nObjet : ' + sujet) + '\n' + texte + '\n' : ''}
Réponds uniquement en JSON : {${sms ? '' : '"sujet": "...", '}"texte": "..."}`;
}

module.exports = { NOM_ROLE, modeleMessage, promptMessage, infosRole, LISTES, listesPrepa, compoDe, listeDe, itemsTexte, ROLES, HORAIRES, bonDepuis, lignesDepuisDevis, nettoyer, documentHtml, emailHtml, messageDefaut, smsTexte, titreBon, dateCourte, allergenesDe };
