'use strict';
/* Validation tarifs (Jean-Luc, 2026-11-26) — INTERNE, back-office seulement, jamais affiché sur le site public.
   Pour chaque spécialité du site (chaque rubrique, et chaque spécialité de Saveurs du monde), on prépare un document A4
   « Tarifs préférentiels accordés à Magnolia Traiteur » que le restaurateur ou le traiteur fournisseur remplit et signe :
   ses coordonnées, puis un tableau photo · produit · quantité · tarif TTC accordé (vide) · observation (vide),
   « Tarifs accordés le », une courte clause d'engagement (durée, confidentialité, parties) et les deux signatures.
   Les fiches fournisseurs sont rangées dans « tarifsFournisseurs/<id> » (jamais lues par les pages du site),
   les choix d'une spécialité (fournisseur, produits retirés, quantités modifiées, durée) dans « tarifsSpecialites/<clé> ».
   Les scans signés sont des fichiers privés (var/prive/tarifs), servis seulement à l'équipe connectée. */
const { esc, titreTexte, norm } = require('./util');
const { RANGEMENTS, rangementDe } = require('./seed');

const PROFILS = ['Restaurant', 'Traiteur', 'Pâtissier', 'Boulanger', 'Chocolatier', 'Producteur', 'Grossiste', 'Caviste', 'Prestataire', 'Autre'];
const DUREES = [6, 12, 24, 36];
const CHAMPS = ['civilite', 'prenom', 'nom', 'fonction', 'entreprise', 'profil', 'adresse', 'cp', 'ville', 'telephone', 'portable', 'email', 'siret', 'tva', 'notes'];

const visible = x => x && x.statut !== 'masque' && !x.fusionneDans;
const nomCourt = s => String(s || '').split(' · ')[0].trim();
const cleSpe = (rub, sous) => rub + (sous ? '--' + sous : '');

/* noms demandés par Jean-Luc (2026-11-26) : « Spécialité antillaise » et non « Buffet antillais » */
const ADJ = [[/ais$/, 'aise'], [/ois$/, 'oise'], [/ien$/, 'ienne'], [/ain$/, 'aine'], [/ais?e?s$/, 'aise'], [/(?<!e)$/, 'e']];
function nomSpecialite(nom) {
  const t = nomCourt(nom);
  const m = t.match(/^(?:buffet|spécialités?)\s+(\p{L}+)$/iu);
  if (!m) return t;
  let a = m[1].toLowerCase();
  for (const [re, v] of ADJ) if (re.test(a)) { a = a.replace(re, v); break; }
  return 'Spécialité ' + a.replace(/ee$/, 'e');
}
const NOMS_RUB = { 'cocktails-buffets': 'Spécialité française (traiteur français)', 'grand-large': 'Plateau de fruits de mer', 'carte-magnolia': 'La carte Magnolia (repas assis)' };
/* rubriques de services (personnel, musique, matériel, lieux) : pas de restaurateur ni de traiteur à faire tarifer */
const HORS = ['personnel', 'musique-animations', 'indispensables', 'mobilier-a-la-location', 'lieux'];
const EN_TETE = ['cocktails-buffets', 'saveurs-du-monde', 'grand-large', 'carte-magnolia'];

/* toutes les spécialités du site : la cuisine française, chaque spécialité de Saveurs du monde, les plateaux de fruits de mer,
   La carte Magnolia ; puis les autres rubriques gourmandes (coffrets, douceurs, cave…) dans un second groupe */
function specialites(rubriques, produits) {
  const P = produits.filter(visible);
  const dans = r => p => p.rubrique === r.slug || (p.autresRubriques || []).includes(r.slug);
  const tete = [], autres = [];
  const rubs = rubriques.filter(r => visible(r) && !HORS.includes(r.slug)).slice()
    .sort((a, b) => ((EN_TETE.indexOf(a.slug) + 1) || 99) - ((EN_TETE.indexOf(b.slug) + 1) || 99) || (a.ordre ?? 0) - (b.ordre ?? 0));
  for (const r of rubs) {
    const out = EN_TETE.includes(r.slug) ? tete : autres;
    const groupe = out === tete ? 'Spécialités' : 'Autres rubriques';
    const sous = (r.sous || []).filter(visible).slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    if (sous.length) {
      for (const s of sous) {
        const n = P.filter(p => p.rubrique === r.slug && (p.sous === s.slug || (p.autresSous || []).includes(s.slug))).length;
        if (n) out.push({ cle: cleSpe(r.slug, s.slug), nom: nomSpecialite(s.nom), rubrique: nomCourt(r.nom), groupe, n });
      }
    } else {
      const n = P.filter(dans(r)).length;
      if (n) out.push({ cle: r.slug, nom: NOMS_RUB[r.slug] || nomCourt(r.nom), rubrique: '', groupe, n });
    }
  }
  return [...tete, ...autres];
}

const PLURIEL = { personne: 'personnes', portion: 'portions', pièce: 'pièces', bouteille: 'bouteilles' };
/* quantité proposée pour le tarif : l'unité de vente (« 1 portion = 2 pièces ») ; modifiable avant impression */
function quantiteDefaut(p) {
  const u = String(p.unite || '').trim() || 'unité';
  return `1 ${u}${p.contenuPortion ? ' = ' + String(p.contenuPortion).trim() : ''}`;
}
const photoDe = p => (p.photos || []).map(x => typeof x === 'string' ? x : x?.src).find(Boolean) || '';

function produitsDe(cle, rubriques, produits) {
  const [rub, sous] = String(cle || '').split('--');
  const r = rubriques.find(x => x.slug === rub);
  if (!r) return null;
  const rang = new Map(RANGEMENTS.map(([k], i) => [k, i]));
  return produits.filter(visible)
    .filter(p => sous ? p.rubrique === rub && (p.sous === sous || (p.autresSous || []).includes(sous)) : p.rubrique === rub || (p.autresRubriques || []).includes(rub))
    .map(p => ({ slug: p.slug, titre: titreTexte(String(p.titre || '').replace(/\*\*/g, '')), photo: photoDe(p), quantite: quantiteDefaut(p), section: rangementDe(p), _o: p.ordre ?? 0 }))
    .sort((a, b) => (rang.get(a.section) ?? 99) - (rang.get(b.section) ?? 99) || a._o - b._o || a.titre.localeCompare(b.titre, 'fr'))
    .map(({ _o, ...x }) => ({ ...x, sectionNom: (RANGEMENTS.find(([k]) => k === x.section) || [, ''])[1] }));
}

/* fiche fournisseur : seulement les champs connus, textes courts */
function ficheFournisseur(body = {}, avant = {}) {
  const f = { ...avant };
  for (const k of CHAMPS) if (k in body) f[k] = String(body[k] ?? '').replace(/\s+$/g, '').slice(0, k === 'notes' || k === 'adresse' ? 1000 : 200);
  if (f.profil && !PROFILS.includes(f.profil)) f.profil = 'Autre';
  if (f.nom) f.nom = f.nom.trim().toLocaleUpperCase('fr-FR');
  if (f.prenom) f.prenom = f.prenom.trim().toLocaleLowerCase('fr-FR').replace(/(^|[-'’\s])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr-FR'));
  return f;
}
const libelleFournisseur = f => [f.entreprise, [f.prenom, f.nom].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Fournisseur sans nom';

/* ---------- mise en page A4 (en millimètres) : la page a une hauteur fixe, rien ne déborde ----------
   Si tout tient sur une seule page, les lignes s'agrandissent (photos plus grandes) ; sinon pages numérotées,
   en-tête rappelé, et le bloc « Tarifs accordés le / clause / signatures » sur la dernière page avec au moins 2 produits. */
const MM = { page: 277, tete1: 70, teteN: 13, th: 7, pied: 8, fin: 66 };
const LIGNE_MIN = 10, LIGNE_MAX = 26, LIGNE_MULTI = 12.5;
function pagination(n) {
  const dispo1 = MM.page - MM.tete1 - MM.th - MM.pied - MM.fin;
  if (n <= Math.floor(dispo1 / LIGNE_MIN)) return { ligne: n ? Math.min(LIGNE_MAX, Math.floor(10 * dispo1 / n) / 10) : LIGNE_MAX, pages: [n] };
  const cap1 = Math.floor((MM.page - MM.tete1 - MM.th - MM.pied) / LIGNE_MULTI);
  const capN = Math.floor((MM.page - MM.teteN - MM.th - MM.pied) / LIGNE_MULTI);
  const capFin = Math.floor((MM.page - MM.teteN - MM.th - MM.pied - MM.fin) / LIGNE_MULTI);
  const pages = [];
  let reste = n;
  while (reste > 0) { const c = Math.min(reste, pages.length ? capN : cap1); pages.push(c); reste -= c; }
  const fin = pages.length === 1 ? Math.floor(dispo1 / LIGNE_MULTI) : capFin;
  if (pages[pages.length - 1] > fin) { const k = Math.min(2, pages[pages.length - 1]); pages[pages.length - 1] -= k; pages.push(k); }
  return { ligne: LIGNE_MULTI, pages };
}

const dateLongue = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
const pointilles = '<span class="pt"></span>';

/* le document à imprimer : page HTML autonome */
function documentHtml({ spe, lignes, fournisseur = {}, R = {}, duree = 12, prepareur = '', maintenant = new Date() }) {
  const E = R.entreprise || {};
  const nomM = E.raisonSociale || 'Magnolia Traiteur';
  const site = String(E.site ?? 'magnoliatraiteur.fr').replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const www = /^www\./i.test(site) ? site : 'www.' + site;
  const F = fournisseur || {};
  const val = v => v ? esc(v) : pointilles;
  const nomF = [F.civilite, F.prenom, F.nom].filter(Boolean).join(' ');
  const villeF = [F.cp, F.ville].filter(Boolean).join(' ');
  const partieF = `<div class="pa"><h3>Le fournisseur</h3>
    <p class="big">${val(F.entreprise)}${F.profil ? ` <span class="tag">${esc(F.profil)}</span>` : ''}</p>
    <p><i>Représenté par</i> ${val(nomF)}${F.fonction ? ', ' + esc(F.fonction) : ''}</p>
    <p><i>Adresse</i> ${F.adresse || villeF ? esc([F.adresse, villeF].filter(Boolean).join(', ')) : pointilles}</p>
    <p><i>Téléphone</i> ${val([F.telephone, F.portable].filter(Boolean).join(' · '))}</p>
    <p><i>E-mail</i> ${val(F.email)}</p>
    <p><i>SIRET</i> ${val(F.siret)}${F.tva ? ` · <i>TVA</i> ${esc(F.tva)}` : ''}</p></div>`;
  const siren = E.siren || (E.siret ? String(E.siret).replace(/\s/g, '').slice(0, 9) : '');
  const partieM = `<div class="pa"><h3>Le bénéficiaire</h3>
    <p class="big">${esc(nomM)}${E.forme ? ', ' + esc(E.forme) : ''}${E.capital ? ` <span class="sm">au capital de ${esc(E.capital)}</span>` : ''}</p>
    <p><i>Adresse</i> ${val(R.adresse)}</p>
    <p><i>Immatriculation</i> ${siren ? `SIREN ${esc(siren)}${E.siret ? ' · SIRET ' + esc(E.siret) : ''}${E.rcs ? ' · RCS ' + esc(E.rcs) : ''}` : pointilles}</p>
    <p>${E.tva ? `<i>TVA</i> ${esc(E.tva)}` : ''}${E.tva && E.ape ? ' · ' : ''}${E.ape ? `<i>APE</i> ${esc(E.ape)}` : ''}${!E.tva && !E.ape ? '<i>TVA</i> ' + pointilles : ''}</p>
    <p><i>Contact</i> ${esc([R.telephone, R.email].filter(Boolean).join(' · ')) || pointilles}</p>
    <p><i>Interlocuteur</i> ${val(prepareur)}</p></div>`;

  const P = pagination(lignes.length);
  const L = P.ligne, photo = Math.max(8, Math.min(22, L - 2));
  const fs = L >= 18 ? 10 : L >= 14 ? 9 : 8.4;
  const ligneHtml = (x, i) => `<tr style="height:${L}mm"><td class="no">${i + 1}</td><td class="ph">${x.photo ? `<img src="${esc(x.photo)}" alt="" style="width:${photo}mm;height:${photo}mm">` : `<span class="noph" style="width:${photo}mm;height:${photo}mm"></span>`}</td><td class="nm"><b>${esc(x.titre)}</b>${x.sectionNom && L >= 14 ? `<small>${esc(x.sectionNom.replace(/ à l’unité$/, ''))}</small>` : ''}</td><td class="qt">${esc(x.quantite)}</td><td class="px"><span>€ TTC</span></td><td class="ob"></td></tr>`;
  const thead = `<thead><tr style="height:${MM.th}mm"><th class="no">N°</th><th class="ph">Photo</th><th class="nm">Produit</th><th class="qt">Quantité<br><small>(poids, nombre)</small></th><th class="px">Tarif TTC accordé</th><th class="ob">Observation</th></tr></thead>`;
  const titre = 'TARIFS PRÉFÉRENTIELS ACCORDÉS À MAGNOLIA TRAITEUR';
  const sousTitre = `pour la commercialisation de nos produits sur le site ${esc(www)}`;
  const ref = 'TP-' + String(spe.cle || norm(spe.nom)).split('--').pop().replace(/^buffet-/, '').replace(/[^a-z0-9]+/gi, '-').toUpperCase().slice(0, 16) + '-' + maintenant.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }).replace(/-/g, '');
  const fin = `<div class="fin" style="height:${MM.fin}mm">
    <p class="accord">Tarifs accordés le : <span class="blanc"></span> / <span class="blanc c"></span> / <span class="blanc l"></span></p>
    <p class="clause"><b>Engagement.</b> Par leur signature, ${esc(nomM)} et le fournisseur désigné ci-dessus conviennent que les tarifs TTC inscrits dans ce tableau, pour la quantité indiquée, s’appliquent à toutes les commandes passées par ${esc(nomM)} en vue de la revente de ces produits, notamment sur ${esc(www)}. Ils sont garantis pendant <b>${duree} mois</b> à compter de la date ci-dessus, puis reconduits par périodes de ${duree} mois, sauf modification annoncée par écrit au moins deux mois à l’avance ; une commande déjà passée reste due au tarif accordé. Le fournisseur garantit que ses produits respectent la réglementation en vigueur (hygiène, traçabilité, information sur les allergènes). <b>Confidentialité :</b> les deux parties gardent confidentiels ces tarifs et le contenu de ce document ; ${esc(nomM)} ne communique jamais le nom ni les coordonnées du fournisseur à ses clients. Les produits non tarifés ne sont pas concernés. Fait en deux exemplaires originaux, dont un pour chaque partie.</p>
    <div class="sig"><div><h4>Pour le fournisseur</h4><p>Nom, fonction et cachet de l’entreprise</p><p>Date et signature, précédées de la mention « Bon pour accord »</p></div><div><h4>Pour ${esc(nomM)}</h4><p>Nom et fonction</p><p>Date et signature</p></div></div></div>`;

  let k = 0;
  const nb = P.pages.length;
  const pages = P.pages.map((c, ip) => {
    const rows = lignes.slice(k, k + c).map((x, j) => ligneHtml(x, k + j)).join('');
    k += c;
    const tete = ip === 0 ? `<header class="t1" style="height:${MM.tete1}mm">
        <div class="tt"><div class="logo">${E.logo ? `<img src="${esc(E.logo)}" alt="">` : '<img src="/brand/monogramme.svg" alt="">'}</div><div class="tx"><h1>${titre}</h1><p class="st">${sousTitre}</p></div><div class="rf"><span>Réf. ${esc(ref)}</span><span>Édité le ${esc(dateLongue(maintenant))}</span></div></div>
        <div class="parties">${partieF}${partieM}</div>
        <p class="spe">${/^spécialité/i.test(spe.nom) ? '' : 'Spécialité : '}<b>${esc(spe.nom)}</b> · ${lignes.length} produit${lignes.length > 1 ? 's' : ''} · merci d’indiquer pour chaque produit le tarif TTC accordé et, si besoin, une observation.</p></header>`
      : `<header class="tn" style="height:${MM.teteN}mm"><b>${titre}</b><span>${esc(spe.nom)} · ${esc(F.entreprise || nomF || '')} · Réf. ${esc(ref)}</span></header>`;
    return `<section class="pg">${tete}<table style="font-size:${fs}pt">${thead}<tbody>${rows}</tbody></table>${ip === nb - 1 ? fin : ''}
      <footer class="pd" style="height:${MM.pied}mm"><span>Document confidentiel · ${esc(nomM)}</span><span class="par">Paraphes : <i></i> <i></i></span><span>Page ${ip + 1} / ${nb}</span></footer></section>`;
  }).join('');

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Tarifs préférentiels · ${esc(spe.nom)}${F.entreprise ? ' · ' + esc(F.entreprise) : ''}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #e9e4d8; font-family: Jost, 'Helvetica Neue', Arial, sans-serif; color: #1d2a24; }
.barre { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap; padding: 10px 16px; background: #1d3b2f; color: #f4efe3; font-size: 14px; }
.barre button { font: 600 15px Jost, sans-serif; border: 0; border-radius: 999px; padding: 10px 20px; cursor: pointer; background: #c9a56b; color: #1d3b2f; }
.barre button.g { background: transparent; color: #f4efe3; border: 1px solid rgba(244,239,227,.5); }
.pg { width: 210mm; height: 297mm; padding: 10mm; margin: 14px auto; background: #fff; box-shadow: 0 4px 22px rgba(0,0,0,.16); display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page; }
.pg:last-child { page-break-after: auto; break-after: auto; }
.t1 { display: flex; flex-direction: column; gap: 2.4mm; overflow: hidden; flex: none; }
.tt { display: flex; align-items: center; gap: 4mm; border-bottom: .6mm solid #b08a4f; padding-bottom: 2.4mm; }
.logo img { height: 14mm; width: auto; max-width: 30mm; object-fit: contain; display: block; }
.tx { flex: 1; min-width: 0; }
h1 { font-size: 13.4pt; letter-spacing: .03em; margin: 0; color: #1d3b2f; font-weight: 600; line-height: 1.15; }
.st { margin: 1mm 0 0; font-size: 9.6pt; color: #5b4a2e; }
.rf { display: flex; flex-direction: column; text-align: right; font-size: 7.2pt; color: #6b6f68; gap: .6mm; white-space: nowrap; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; flex: 1; min-height: 0; }
.pa { border: .3mm solid #d9cfbb; border-radius: 2mm; padding: 2mm 3mm; background: #fbf8f1; overflow: hidden; }
.pa h3 { margin: 0 0 1mm; font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: #b08a4f; }
.pa p { margin: 0 0 .7mm; font-size: 8pt; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pa p.big { font-size: 9.6pt; font-weight: 600; color: #1d3b2f; }
.pa i { font-style: normal; color: #7a7d75; display: inline-block; min-width: 22mm; }
.pa .tag { font-size: 7pt; font-weight: 500; background: #1d3b2f; color: #fff; border-radius: 9px; padding: .2mm 2mm; vertical-align: 1px; }
.pa .sm { font-size: 7.4pt; font-weight: 400; color: #555; }
.pt { display: inline-block; width: 52mm; border-bottom: .25mm dotted #8a8a80; height: 3mm; vertical-align: -.4mm; }
.spe { margin: 0; font-size: 8pt; color: #44463f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spe b { color: #1d3b2f; font-size: 9.4pt; }
.spe span { color: #7a7d75; }
.tn { display: flex; justify-content: space-between; align-items: center; gap: 4mm; border-bottom: .5mm solid #b08a4f; font-size: 8pt; flex: none; margin-bottom: 0; }
.tn b { color: #1d3b2f; font-size: 9pt; }
.tn span { color: #6b6f68; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; flex: none; margin-top: 1.5mm; }
th { background: #1d3b2f; color: #fff; font-weight: 500; font-size: 7.6pt; text-align: left; padding: 0 1.6mm; line-height: 1.1; }
th small { font-weight: 400; opacity: .8; font-size: 6.6pt; }
td { border: .25mm solid #cfc6b3; padding: .6mm 1.6mm; vertical-align: middle; overflow: hidden; }
tr:nth-child(even) td.nm, tr:nth-child(even) td.no, tr:nth-child(even) td.qt { background: #faf7f0; }
.no { width: 8mm; text-align: center; color: #888; font-size: 7.4pt; }
th.no { text-align: center; }
.ph { width: 24mm; text-align: center; padding: .5mm; }
.ph img, .noph { object-fit: cover; border-radius: 1.2mm; display: block; margin: 0 auto; background: #eee6d6; }
.nm { width: 50mm; line-height: 1.15; }
.nm b { font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.nm small { display: block; color: #8a7a5c; font-size: 6.8pt; margin-top: .4mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qt { width: 27mm; font-size: .9em; line-height: 1.15; }
.px { width: 27mm; position: relative; }
.px span { position: absolute; right: 1.6mm; bottom: 1mm; font-size: 6.6pt; color: #9a9a90; }
.ob { width: auto; }
.fin { flex: none; display: flex; flex-direction: column; margin-top: 2.5mm; overflow: hidden; }
.accord { margin: 0 0 1.6mm; font-size: 10pt; font-weight: 600; color: #1d3b2f; }
.blanc { display: inline-block; width: 10mm; border-bottom: .3mm solid #333; height: 4mm; }
.blanc.l { width: 16mm; }
.clause { margin: 0 0 2mm; font-size: 6.9pt; line-height: 1.32; color: #33352f; text-align: justify; }
.sig { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; flex: 1; min-height: 0; }
.sig > div { border: .3mm solid #b08a4f; border-radius: 2mm; padding: 1.8mm 3mm; }
.sig h4 { margin: 0 0 .6mm; font-size: 8.4pt; color: #1d3b2f; }
.sig p { margin: 0; font-size: 6.8pt; color: #7a7d75; }
.pd { margin-top: auto; flex: none; display: flex; justify-content: space-between; align-items: flex-end; font-size: 6.8pt; color: #8a8d85; border-top: .2mm solid #e3dccb; padding-top: 1mm; }
.par i { display: inline-block; width: 12mm; height: 4mm; border: .2mm solid #bbb; border-radius: 1mm; vertical-align: middle; margin-left: 1mm; }
@media print { body { background: #fff; } .barre { display: none; } .pg { margin: 0; box-shadow: none; } }
@media screen and (max-width: 820px) { .pg { zoom: .45; } }
</style></head><body>
<div class="barre"><span>${nb} page${nb > 1 ? 's' : ''} A4 · ${lignes.length} produit${lignes.length > 1 ? 's' : ''}</span><button type="button" onclick="window.print()">🖨 Imprimer ou enregistrer en PDF</button><button type="button" class="g" onclick="window.close()">Fermer</button></div>
${pages}
</body></html>`;
}

module.exports = { nomSpecialite, PROFILS, DUREES, CHAMPS, specialites, produitsDe, quantiteDefaut, ficheFournisseur, libelleFournisseur, pagination, documentHtml, MM };
