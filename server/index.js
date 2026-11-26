'use strict';
/*
 * Serveur Magnolia Traiteur : site vitrine + boutique + espace client + back-office.
 * Même pile que JEPRIVATIZ : Node.js/Express, MySQL chez Hostinger (fichier JSON en local), Brevo.
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { createStore } = require('./store');
const { createBrevo, isEmail } = require('./brevo');
const { createCatalogue } = require('./catalogue');
const { seed, importerAvisAncienSite, initSousRubriques } = require('./seed');
const views = require('./views');
const { preparerAlerte } = require('./relances');
const STATS = require('./statistiques');
const ANC = require('./anciens');
const { verrouLivraison, verrouPersonnel, marquerPersonnel, raisonsDevisManuel, regleAcompte, totaux, controleMarge, prochainNumero, lignesDepuisDemande, estimerLigne, choixDepuisNote, totalSupplements } = require('./devis');
const { rid, sha, esc, euros, limiter, dateFr, slugify, nomPropre, dateNaissance, titreTexte } = require('./util');
const LIVR = require('../public/js/livraison-paliers');
const ACHATS = require('./achats');
const { creerImportClients, normTel, departementDe } = require('./import-clients');
const IA = require('./ia');
const SEO = require('./seo');
const TXT = require('./textes');
const DIF = require('./diffusion');
const PROFIL = require('./profil-contact');
const LC = require('./livraison-client');
const FAC = require('./factures');
const { creerEntreprises } = require('./entreprises');
const DR = require('./droits');
const SRC = require('./sources');
const HIST = require('./historique');
const TAR = require('./tarifs');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function loadDotEnv(file = path.join(ROOT, '.env')) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch { /* variables fournies par l'hébergeur */ }
}

const COLLECTIONS = ['produits', 'rubriques', 'lieux', 'avis', 'demandes', 'clients', 'devis', 'factures', 'rdv', 'modeles', 'pages'];
const PIPELINE = ['demande', 'devis_envoye', 'relance', 'accord', 'reserve', 'refuse', 'termine'];

/* « /ancienne-page /nouvelle-page » par ligne ; une ancienne adresse finissant par * couvre tout ce qui commence pareil */
function redirectionPour(texte, chemin) {
  const p = decodeURIComponent(chemin).replace(/\/+$/, '') || '/';
  for (const ligne of String(texte || '').split('\n')) {
    const [de, vers] = ligne.trim().split(/\s+/);
    if (!de || !vers || !de.startsWith('/') || !/^(\/(?!\/)|https:\/\/)/.test(vers)) continue;
    const src = de.replace(/\/+$/, '') || '/';
    if (src.endsWith('*') ? p.startsWith(src.slice(0, -1)) : p === src) return vers;
  }
  return null;
}

async function createApp(opts = {}) {
  loadDotEnv();
  const env = { ...process.env, ...(opts.env || {}) };
  const log = opts.log || console;
  const store = opts.store || createStore(env);
  await store.init();
  /* produits supprimés au back-office (Jean-Luc 2026-11-25) : une pierre tombale _produitsSupprimes/<id> empêche qu'une
     reprise de démarrage, une tâche de fond ou un vieil onglet du back-office ne recrée la fiche */
  const produitsSupprimes = new Set((await store.list('_produitsSupprimes')).map(d => d.id));
  if (!store._gardeSupprimes) {
    const setBrut = store.set.bind(store);
    store.set = async (p, data) => { if (typeof p === 'string' && p.startsWith('produits/') && produitsSupprimes.has(p.slice(9))) return; return setBrut(p, data); };
    store._gardeSupprimes = true;
  }
  await seed(store, { log });
  await importerAvisAncienSite(store, { log });
  await initSousRubriques(store, { log });
  const cat = createCatalogue(store);
  const brevo = opts.brevo || createBrevo({ env, store, log });
  const ia = IA.createIa({ env, ask: opts.iaAsk, log });
  /* règle de Jean-Luc (2026-11-24) : chaque SMS envoyé à un client contient l'adresse du site (Mon entreprise › Site internet),
     ajoutée à la fin s'il n'a pas déjà un lien vers le site ; pas pour les alertes envoyées à l'équipe */
  const lienSms = async () => DIF.lienCourt((await cat.get()).reglages?.entreprise?.site ?? 'magnoliatraiteur.fr');
  {
    const smsBrut = brevo.sendSms.bind(brevo);
    brevo.sendSms = async (o = {}) => o.lien === false ? smsBrut(o) : smsBrut({ ...o, content: DIF.avecLien(o.content, await lienSms().catch(() => ''), [DIF.lienCourt(SITE)]) });
  }
  const prod = env.NODE_ENV === 'production';
  const SITE = (env.SITE_URL || 'http://localhost:' + (env.PORT || 3000)).replace(/\/$/, '');
  const uploadDir = path.resolve(env.UPLOAD_DIR || path.join(ROOT, 'var', 'uploads'));
  fs.mkdirSync(uploadDir, { recursive: true });

  /* ---------- comptes de l'équipe ---------- */
  async function findUserByEmail(email) {
    const idx = await store.get('_useremail/' + sha(String(email).trim().toLowerCase()));
    return idx ? { id: idx.id, ...(await store.get('_users/' + idx.id)) } : null;
  }
  async function createUser({ email, name, role, password, droits, prenom, nomFamille, portable }) {
    email = String(email || '').trim().toLowerCase();
    if (!isEmail(email)) throw Object.assign(new Error('E-mail invalide.'), { status: 400 });
    if (await findUserByEmail(email)) throw Object.assign(new Error('Ce compte existe déjà.'), { status: 409 });
    if (String(password || '').length < 10) throw Object.assign(new Error('Mot de passe : 10 caractères minimum.'), { status: 400 });
    const id = 'u_' + rid(9);
    const d = droits ? DR.nettoyer(droits) : null;
    await store.set('_users/' + id, { email, name: String(name || '').trim(), role: d ? DR.roleDe(d) : role === 'manager' ? 'manager' : 'collab', ...(d ? { droits: d } : {}), ...(prenom !== undefined ? { prenom, nomFamille } : {}), ...(portable ? { portable } : {}), passHash: await bcrypt.hash(password, 11), createdAt: new Date().toISOString(), disabled: false });
    await store.set('_useremail/' + sha(email), { id });
    return id;
  }
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD && !(await store.list('_users')).length) {
    await createUser({ email: env.ADMIN_EMAIL, name: env.ADMIN_NAME || 'Liam Bernard', role: 'manager', password: env.ADMIN_PASSWORD });
    log.log?.('[comptes] compte Manager créé pour ' + env.ADMIN_EMAIL);
  }
  /* réparation : une note, un appel ou des vœux ajoutés sur une fiche créée dans le back-office ont pu être rangés sous « clients/undefined » ;
     on les remet sur la vraie fiche (même e-mail, sinon même nom) puis on retire ce document */
  {
    const perdu = await store.get('clients/undefined');
    if (perdu) {
      const vrai = (await store.list('clients')).find(x => x.id !== 'undefined' && ((perdu.email && x.data.email === perdu.email) || (!perdu.email && x.data.nom === perdu.nom)));
      if (vrai) { const j = [...(vrai.data.journal || [])]; for (const e of perdu.journal || []) if (!j.some(x => x.id === e.id)) j.push(e); await store.set('clients/' + vrai.id, { ...vrai.data, journal: j.sort((x, y) => String(x.at).localeCompare(String(y.at))), anniversaires: [...new Set([...(vrai.data.anniversaires || []), ...(perdu.anniversaires || [])])], ...(perdu.naissance && !vrai.data.naissance ? { naissance: perdu.naissance } : {}) }); }
      await store.delete('clients/undefined');
    }
  }
  /* une seule fois (Jean-Luc, 2026-11-24) : pictogrammes abandonnés, les vignettes gardent leurs photos ; on vide les choix déjà faits */
  if (!(await store.get('_migr/sansPictos'))) {
    for (const { id, data: r } of await store.list('rubriques')) if (r && 'picto' in r) { const { picto, ...reste } = r; await store.set('rubriques/' + id, reste); }
    await store.set('_migr/sansPictos', { at: new Date().toISOString() });
  }
  /* une seule fois (règle de Jean-Luc, 2026-11-24) : « Demandes de devis » ne garde que les demandes sur lesquelles personne n'est intervenu ;
     les demandes déjà travaillées (devis, note, appel, rendez-vous, attribution, changement d'étape) passent dans « Suivi client » */
  if (!(await store.get('_migr/priseEnCharge'))) {
    const devisL = (await store.list('devis')).map(x => x.data), clientsL = await store.list('clients'), rdvL = (await store.list('rdv')).map(x => x.data).filter(Boolean);
    for (const { id, data: d } of await store.list('demandes')) {
      if (!d || d.type === 'contact' || d.priseEnCharge) continue;
      const c = clientsL.find(x => x.id === d.clientId)?.data || (d.contact?.email && clientsL.find(x => x.data?.email === d.contact.email)?.data) || null;
      const apres = t => t && String(t) >= String(d.createdAt || '');
      const traces = [
        ...devisL.filter(v => v.demandeId === id).map(v => ({ at: v.createdAt, par: v.commercial?.nom || v.creePar || '', quoi: 'devis' })),
        ...(d.historique || []).slice(1).filter(h => h.par && !/^site|client/i.test(h.par)).map(h => ({ at: h.at, par: h.par, quoi: 'étape' })),
        ...(d.relancesNotees || []).map(r => ({ at: r.at, par: r.par || '', quoi: 'appel' })),
        ...(c?.journal || []).filter(j => apres(j.at) && ['note', 'appel', 'voeux'].includes(j.type)).map(j => ({ at: j.at, par: j.par || '', quoi: j.type })),
        ...rdvL.filter(r => c && r.clientId === (d.clientId || c.id) && apres(r.createdAt)).map(r => ({ at: r.createdAt, par: r.par || '', quoi: 'rendez-vous' })),
        ...(d.notes ? [{ at: d.updatedAt || d.createdAt, par: '', quoi: 'note' }] : []),
        ...(d.commercial && d.statut === 'demande' && (d.historique || [])[0]?.par !== 'site' ? [{ at: d.createdAt, par: d.commercial, quoi: 'attribution' }] : []),
        ...(d.statut !== 'demande' ? [{ at: d.updatedAt || d.createdAt, par: '', quoi: 'étape' }] : [])
      ].filter(x => x.at).sort((x, y) => String(x.at).localeCompare(String(y.at)));
      if (!traces.length) continue;
      const t = traces.find(x => x.par) || traces[0];
      await store.set('demandes/' + id, { ...d, commercial: d.commercial || t.par || '', priseEnCharge: { at: traces[0].at, par: t.par || '', quoi: traces[0].quoi, reprise: true } });
    }
    await store.set('_migr/priseEnCharge', { at: new Date().toISOString() });
  }
  /* une seule fois (règle de Jean-Luc, 2026-11-24) : fiches existantes en « Prénom NOM » (factures déjà émises inchangées) */
  if (!(await store.get('_migr/nomsClients'))) {
    for (const { id, data: c } of await store.list('clients')) { const n = nomPropre(c.nom); if (c.nom && n !== c.nom) await store.set('clients/' + id, { ...c, nom: n }); }
    for (const { id, data: d } of await store.list('demandes')) { const n = nomPropre(d.contact?.nom); if (d.contact?.nom && n !== d.contact.nom) await store.set('demandes/' + id, { ...d, contact: { ...d.contact, nom: n } }); }
    for (const { id, data: v } of await store.list('devis')) { const n = nomPropre(v.clientNom); if (v.clientNom && n !== v.clientNom) await store.set('devis/' + id, { ...v, clientNom: n }); }
    await store.set('_migr/nomsClients', { at: new Date().toISOString() });
  }
  /* une seule fois (demande de Jean-Luc, 2026-11-24) : le compte nommé « Manager » s'appelle Liam Bernard, partout où ce nom était repris */
  if (!(await store.get('_migr/nomManager'))) {
    const NOM = 'Liam Bernard', ren = x => x === 'Manager' ? NOM : x;
    const parMaj = l => Array.isArray(l) ? l.map(x => x && x.par === 'Manager' ? { ...x, par: NOM } : x) : l;
    for (const { id, data: u } of await store.list('_users')) if (String(u.name || '').trim() === 'Manager') await store.set('_users/' + id, { ...u, name: NOM });
    for (const { id, data: d } of await store.list('demandes')) {
      const next = { ...d };
      if ('commercial' in d) next.commercial = ren(d.commercial);
      if (d.relancesNotees) next.relancesNotees = parMaj(d.relancesNotees);
      if (d.historique) next.historique = parMaj(d.historique);
      if (JSON.stringify(next) !== JSON.stringify(d)) await store.set('demandes/' + id, next);
    }
    for (const { id, data: v } of await store.list('devis')) {
      const next = { ...v };
      if ('creePar' in v) next.creePar = ren(v.creePar);
      if (v.commercial?.nom === 'Manager') next.commercial = { ...v.commercial, nom: NOM };
      if (v.envois) next.envois = parMaj(v.envois);
      if (v.relances) next.relances = parMaj(v.relances);
      if (JSON.stringify(next) !== JSON.stringify(v)) await store.set('devis/' + id, next);
    }
    for (const { id, data: c } of await store.list('clients')) if ((c.journal || []).some(j => j.par === 'Manager')) await store.set('clients/' + id, { ...c, journal: parMaj(c.journal) });
    await store.set('_migr/nomManager', { at: new Date().toISOString() });
  }
  /* une seule fois (demande de Jean-Luc, 2026-11-24) : « Hot Gulab Jamun » faisait doublon avec « Gulab Jamun » (même plat, même prix, même photo).
     On retire la fiche à l'unité et le choix « Hot Gulab Jamun » des formules du Buffet indien ; on garde « Gulab Jamun ». */
  if (!(await store.get('_migr/sansHotGulab'))) {
    const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const estHot = t => /^hot gulab jamun\b/.test(net(t));
    for (const { id, data: p } of await store.list('produits')) {
      if (!p) continue;
      if (estHot(p.titre)) { await store.delete('produits/' + id); continue; }
      if ((p.groupes || []).some(g => (g.options || []).some(o => o.id === 'hot-gulab-jamun' || estHot(o.label))))
        await store.set('produits/' + id, { ...p, groupes: p.groupes.map(g => ({ ...g, options: (g.options || []).filter(o => !(o.id === 'hot-gulab-jamun' || estHot(o.label))) })) });
    }
    await store.set('_migr/sansHotGulab', { at: new Date().toISOString() });
  }
  /* une seule fois (demande de Jean-Luc, 2026-11-25) : la fiche « La cave de Magnolia » (Vins rouges, blancs et rosés, « Sur devis ») est retirée du catalogue,
     et c'est la page Boissons qui prend ce nom, avec le sous-titre « Du vin au soft, en passant par les alcools. » (l'adresse /boissons ne change pas). */
  if (!(await store.get('_migr/caveMagnolia'))) {
    const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    for (const { id, data: p } of await store.list('produits')) {
      if (p && (p.slug === 'la-cave-de-magnolia' || id === 'la-cave-de-magnolia' || (p.rubrique === 'boissons' && net(p.titre) === 'la cave de magnolia'))) await store.delete('produits/' + id);
    }
    const rb = await store.get('rubriques/boissons');
    if (rb) await store.set('rubriques/boissons', { ...rb, nom: 'La cave de Magnolia', titrePage: rb.titrePage ? 'La cave de Magnolia' : rb.titrePage, chapo: 'Du vin au soft, en passant par les alcools.' });
    await store.set('_migr/caveMagnolia', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : nouvelle règle du Buffet indien, C = prix de la carte du restaurant (TTC).
     Prix de vente = C × 1,35 (arrondi aux 10 centimes du dessus, comme avant) ; prix d'achat = C × 0,90.
     C = prix d'achat posé au départ (règle C × 1,30) s'il colle encore au prix de vente, sinon prix de vente ÷ 1,30. */
  if (!(await store.get('_migr/indien135'))) {
    let n = 0; const ex = [];
    for (const { id, data: p } of await store.list('produits')) {
      if (!p || p.sous !== 'buffet-indien' || p.prixCents == null) continue;
      const c = p.coutCents != null && Math.abs(Math.ceil(p.coutCents * 1.3 / 10) * 10 - p.prixCents) <= 10 ? p.coutCents : Math.round(p.prixCents / 1.3);
      const prix = Math.ceil(c * 1.35 / 10) * 10, cout = Math.round(c * 0.9);
      if (ex.length < 5) ex.push([p.slug, p.prixCents, prix, p.coutCents, cout]);
      await store.set('produits/' + id, { ...p, prixCents: prix, coutCents: cout, updatedAt: new Date().toISOString() });
      n++;
    }
    cat.invalidate?.();
    await store.set('_migr/indien135', { at: new Date().toISOString(), fiches: n, exemples: ex });
    if (n) console.log(`[demarrage] Buffet indien : ${n} fiches passées à carte × 1,35 (achat carte × 0,90)`);
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : Magnolia loue des FLÛTES à champagne, pas des coupes. La fiche devient « Verres à vin et flûtes à champagne »,
     photo verre à vin + flûte (Pexels 19408256, Luis Felipe Pérez), casiers de 36, location dès 36 verres (1 casier). Prix inchangé, adresse inchangée
     (la fiche Open bar y renvoie). Les textes Google sont vidés pour être réécrits avec le nouveau nom. */
  if (!(await store.get('_migr/verresFlutes'))) {
    const SLUG = 'verres-en-verre-vin-coupes-a-champagne';
    for (const { id, data: p } of await store.list('produits')) {
      if (!p || (p.slug !== SLUG && id !== SLUG)) continue;
      const q = { ...p,
        titre: 'Verres à vin et flûtes à champagne',
        extrait: 'Verres à vin et flûtes à champagne en verre, loués par casiers de 36.',
        description: ['Verres à vin et flûtes à champagne en verre, loués par casiers de 36.'],
        sousPhoto: ['Verres à vin et flûtes à champagne en verre, loués en casiers de 36 pour servir vos invités avec élégance lors d’un vin d’honneur, d’un cocktail ou d’un dîner. La location se fait à partir de 36 verres, soit un casier.'],
        sousPhotoAuto: false,
        min: 36, unite: p.unite || 'verre', minimumTexte: null,
        photos: [{ src: '/site/c/materiel/verres-vin-flutes.webp', alt: 'Un verre à vin et une flûte à champagne sur une table de réception' }],
        sections: [{ note: null, apres: null, titre: 'Caractéristiques', paragraphes: [], items: ['Verres à vin et flûtes à champagne en verre', 'Conditionnement : casier de 36 verres', 'Location à partir de 36 verres (1 casier)'] }],
        details: (p.details || []).map(d => /minimum de commande/i.test(d) ? 'Location à partir de 36 verres (1 casier). Hors frais de livraison.' : d),
        seoTitre: '', seoDescription: '' };
      delete q.seoAuto;
      if (!q.details.some(d => /36 verres/.test(d))) q.details.unshift('Location à partir de 36 verres (1 casier). Hors frais de livraison.');
      await store.set('produits/' + id, q);
    }
    await store.set('_migr/verresFlutes', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : plus de « (par personne) » dans les noms des fiches et des vignettes (ex. Set de vaisselle
     complet) : l'unité « personne » s'affiche déjà au prix et au choix de la quantité. Adresses des fiches inchangées. */
  if (!(await store.get('_migr/sansParPersonne'))) {
    const PP = /\s*\(\s*par\s+pers(?:onne|\.)?\s*\)/gi;
    for (const { id, data: p } of await store.list('produits')) {
      if (!p || !PP.test(String(p.titre || '') + ' ' + String(p.seoTitre || ''))) continue;
      PP.lastIndex = 0;
      await store.set('produits/' + id, { ...p, titre: String(p.titre || '').replace(PP, '').trim(), ...(p.seoTitre ? { seoTitre: String(p.seoTitre).replace(PP, '').replace(/\s{2,}/g, ' ').trim() } : {}) });
      PP.lastIndex = 0;
    }
    await store.set('_migr/sansParPersonne', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : set de vaisselle dessert à 2,90 € TTC par personne (plus de « Sur devis ») ;
     composition : une petite assiette à dessert, une petite cuillère et une fourchette ; prix d'achat 1,50 € HT = 1,80 € TTC (coutCents en TTC, TVA 20 %) */
  if (!(await store.get('_migr/setDessertPrix'))) {
    const SLUG = 'set-de-vaisselle-dessert-par-personne';
    const p = await store.get('produits/' + SLUG);
    const T = 'Une petite assiette à dessert, une petite cuillère et une fourchette, pour chaque invité.';
    if (p) await store.set('produits/' + SLUG, { ...p, prixCents: 290, prixTexte: null, unite: p.unite || 'personne', extrait: T,
      description: ['Le set de vaisselle dessert de chaque invité : une petite assiette à dessert, une petite cuillère et une fourchette.'], coutCents: 180, tva: 20 });
    await store.set('_migr/setDessertPrix', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : chaise pliante de luxe en velours bordeaux = sa propre photo (rangs de chaises dans un salon doré, piano à queue), à la place de l'ancienne */
  if (!(await store.get('_migr/chaiseVeloursPhoto'))) {
    const SLUG = 'chaise-pliante-de-luxe-en-velours-bordeaux';
    const p = await store.get('produits/' + SLUG);
    if (p) await store.set('produits/' + SLUG, { ...p, photos: [{ src: '/site/c/materiel/chaises-velours-bordeaux-salon.webp', alt: 'Chaises pliantes en velours bordeaux installées en rangs dans un salon doré, devant un piano à queue' }, ...(p.photos || []).slice(1)] });
    await store.set('_migr/chaiseVeloursPhoto', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : 2e photo de la galerie des chaises en velours bordeaux = lot de chaises pliantes (sa photo, fond blanc) */
  if (!(await store.get('_migr/chaiseVeloursPhoto2'))) {
    const SLUG = 'chaise-pliante-de-luxe-en-velours-bordeaux', SRC = '/site/c/materiel/chaises-velours-bordeaux-lot.webp';
    const p = await store.get('produits/' + SLUG);
    if (p) { const ph = (p.photos || []).filter(x => x?.src !== SRC); await store.set('produits/' + SLUG, { ...p, photos: [...ph.slice(0, 1), { src: SRC, alt: 'Chaises pliantes en velours bordeaux à structure dorée, en rangs, sur fond blanc' }, ...ph.slice(1)] }); }
    await store.set('_migr/chaiseVeloursPhoto2', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : photo du verre à bière 50 cl = sa propre photo (verre en polypropylène givré), détourée sur fond blanc */
  if (!(await store.get('_migr/gobeletBierePhoto'))) {
    const SLUG = 'gobelet-reutilisable-a-biere-50-cl';
    for (const { id, data: p } of await store.list('produits')) {
      if (!p || (p.slug !== SLUG && id !== SLUG)) continue;
      await store.set('produits/' + id, { ...p, photos: [{ src: '/site/c/materiel/gobelet-biere-50cl.webp', alt: 'Verre à bière 50 cl en polypropylène givré, sur fond blanc' }] });
    }
    await store.set('_migr/gobeletBierePhoto', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : nos verres réutilisables sont blancs translucides, pas rouges → photo de son propre verre en polypropylène givré (fond blanc) */
  if (!(await store.get('_migr/verresReutilisablesPhoto'))) {
    const SLUG = 'verres-reutilisables-eco-responsables';
    for (const { id, data: p } of await store.list('produits')) {
      if (!p || (p.slug !== SLUG && id !== SLUG)) continue;
      await store.set('produits/' + id, { ...p, photos: [{ src: '/site/c/materiel/verres-reutilisables-blancs.webp', alt: 'Verre réutilisable en polypropylène blanc translucide' }] });
    }
    await store.set('_migr/verresReutilisablesPhoto', { at: new Date().toISOString() });
  }
  /* La cave de Magnolia refaite (Jean-Luc, 2026-11-25) : catégories avec photo, boissons reprises d'une carte de traiteur, champagne André Diligent en grand (server/cave.js) */
  { const n = await require('./cave').initCave(store); if (n) console.log(`[demarrage] La cave de Magnolia : ${n} boissons créées`); }
  /* une seule fois (Jean-Luc, 2026-11-25) : la fiche « Verres à vin et flûtes à champagne » devient TROIS fiches louées au rack, 36 € TTC le rack,
     achat 12 € HT le rack (coutCents en TTC, TVA 20 % comme partout) : Verres à vin (rack de 36), Flûtes à champagne (rack de 49), Verres tumbler (rack de 36).
     L'ancienne fiche est masquée et renvoie (301) vers Verres à vin ; partout où elle était proposée (open bars, Mobilier et matériel à la location),
     les nouvelles fiches prennent sa place. */
  if (!(await store.get('_migr/verresTroisRacks'))) {
    const ANCIEN = 'verres-en-verre-vin-coupes-a-champagne';
    const base = await store.get('produits/' + ANCIEN);
    if (base) {
      const caution = (base.details || []).filter(d => /caution/i.test(d));
      const VERRES = [
        { slug: 'verres-a-vin', titre: 'Verres à vin', n: 36, nom: 'verres à vin', photo: 'verres-a-vin', alt: 'Rangées de verres à vin en verre sur un comptoir de bar',
          pour: 'pour servir vos vins rouges, blancs et rosés lors d’un vin d’honneur, d’un cocktail ou d’un dîner' },
        { slug: 'flutes-a-champagne', titre: 'Flûtes à champagne', n: 49, nom: 'flûtes à champagne', photo: 'flutes-a-champagne', alt: 'Flûtes à champagne en verre alignées sur une table de réception nappée de blanc',
          pour: 'pour servir le champagne et les vins pétillants à vos invités, au vin d’honneur comme au moment des toasts' },
        { slug: 'verres-tumbler', titre: 'Verres tumbler', n: 36, nom: 'verres tumbler', photo: 'verres-tumbler', alt: 'Verres tumbler en verre empilés sur un plateau de bar',
          pour: 'pour l’eau, les softs, les jus et les cocktails, au bar comme à table' },
      ];
      let i = 0;
      for (const v of VERRES) {
        const p = { ...base, id: v.slug, slug: v.slug, titre: v.titre, statut: 'visible', fusionneDans: undefined,
          prixCents: 3600, coutCents: Math.round(1200 * 1.2) /* 12 € HT le rack */, tva: 20, prixTexte: null, unite: 'rack', min: 1, minimumTexte: null, aCompleter: false,
          extrait: `Rack de ${v.n} ${v.nom} en verre, 36 € TTC le rack.`,
          description: [`Rack de ${v.n} ${v.nom} en verre, 36 € TTC le rack.`],
          sousPhoto: [`Nos ${v.nom} en verre sont loués par rack de ${v.n}, ${v.pour}. Livrés propres dans leur rack et repris après votre événement : vous n’avez rien à laver.`],
          sousPhotoAuto: false,
          photos: [{ src: `/site/c/materiel/${v.photo}.webp`, alt: v.alt }],
          sections: [{ note: null, apres: null, titre: 'Caractéristiques', paragraphes: [], items: [`${v.titre} en verre`, `Conditionnement : rack de ${v.n} ${v.nom}`, 'Prix : 36 € TTC le rack']}],
          details: [`Location par rack de ${v.n} ${v.nom}. Hors frais de livraison.`, ...caution],
          ordre: (base.ordre ?? 0) + i * 0.01, seoTitre: '', seoDescription: '', createdAt: new Date().toISOString() };
        delete p.seoAuto; delete p.fusionneDans;
        if (!(await store.get('produits/' + v.slug))) await store.set('produits/' + v.slug, p);
        i++;
      }
      await store.set('produits/' + ANCIEN, { ...(await store.get('produits/' + ANCIEN)), statut: 'masque', fusionneDans: 'verres-a-vin' });
      /* les fiches qui proposaient l'ancienne */
      const LIEES = [
        { slug: 'verres-a-vin', titre: 'Verres à vin', texte: 'Rack de 36 verres à vin en verre, 36 € TTC le rack.' },
        { slug: 'flutes-a-champagne', titre: 'Flûtes à champagne', texte: 'Rack de 49 flûtes à champagne en verre, 36 € TTC le rack.' },
      ];
      for (const { id, data: x } of await store.list('produits')) {
        if (!x || id === ANCIEN) continue;
        let change = false; const y = { ...x };
        if ((x.liees || []).some(l => l.slug === ANCIEN)) { y.liees = x.liees.flatMap(l => l.slug === ANCIEN ? LIEES : [l]); change = true; }
        if ((x.propositions || []).some(b => (b.slugs || []).includes(ANCIEN))) {
          y.propositions = x.propositions.map(b => ({ ...b, slugs: (b.slugs || []).flatMap(s => s === ANCIEN ? VERRES.map(v => v.slug) : [s]) })); change = true;
        }
        if (change) await store.set('produits/' + id, y);
      }
    }
    await store.set('_migr/verresTroisRacks', { at: new Date().toISOString() });
  }
  /* une seule fois (Jean-Luc, 2026-11-25) : photos de SON tumbler (verre droit haut), vide puis avec citronnade, sur fond blanc */
  if (!(await store.get('_migr/tumblerPhotos'))) {
    const p = await store.get('produits/verres-tumbler');
    if (p) await store.set('produits/verres-tumbler', { ...p, photos: [
      { src: '/site/c/materiel/verres-tumbler-1.webp', alt: 'Verre tumbler en verre, vide, sur fond blanc' },
      { src: '/site/c/materiel/verres-tumbler-2.webp', alt: 'Verre tumbler rempli de citronnade avec glaçons et rondelles de citron' }] });
    await store.set('_migr/tumblerPhotos', { at: new Date().toISOString() });
  }

  /* ---------- titres et descriptions « dans Google » (Jean-Luc, 2026-11-24) ----------
     À chaque démarrage : les cases vides des produits, rubriques et spécialités sont remplies (jamais un texte tapé à la main).
     Puis l'IA réécrit en arrière-plan les textes de produits posés par le modèle simple (une seule fois par produit). */
  const espacesSeo = t => String(t || '').replace(/\s+/g, ' ').trim();
  async function remplirSeoCatalogue() {
    const prods = await store.list('produits'), ec = SEO.extraitsCommuns(prods.map(d => d.data));
    let n = 0;
    for (const { id, data: p } of prods) { if (p && SEO.remplirProduit(p, { extraitsCommuns: ec })) { await store.set('produits/' + id, p); n++; } }
    for (const { id, data: r } of await store.list('rubriques')) { if (r && SEO.remplirRubrique(r)) { await store.set('rubriques/' + id, r); n++; } }
    if (n) log.log?.(`[google] ${n} fiche(s) : titre ou description Google rempli automatiquement`);
    return n;
  }
  await remplirSeoCatalogue();
  /* fiches dont un texte Google vient encore du modèle simple : l'IA peut l'améliorer */
  const seoAAmeliorer = p => p?.seoAuto && !p.seoAuto.ia && (p.seoAuto.essais || 0) < 2 && (('titre' in p.seoAuto && p.seoTitre === p.seoAuto.titre) || ('description' in p.seoAuto && p.seoDescription === p.seoAuto.description));
  let seoIaEnCours = null;
  async function seoIaLot({ taille = 20, maxLots = 100 } = {}) {
    if (!ia.actif) return 0;
    let faits = 0;
    for (let lot = 0; lot < maxLots; lot++) {
      const c = await cat.get();
      const nomsRub = Object.fromEntries(c.rubriques.map(r => [r.slug, r.nom])), nomsSous = Object.fromEntries(c.rubriques.flatMap(r => (r.sous || []).map(x => [x.slug, x.nom])));
      const tous = (await store.list('produits')).filter(d => d.data);
      const file = tous.filter(d => seoAAmeliorer(d.data)).sort((a, b) => (a.data.statut === 'masque') - (b.data.statut === 'masque')).slice(0, taille);
      if (!file.length) break;
      let rep;
      try { rep = IA.json(await ia.demander(SEO.promptSeo(file.map(d => SEO.infosIa({ ...d.data, slug: d.id }, nomsRub, nomsSous))), { effort: 'low', maxTokens: 8000 })); }
      catch (e) {
        log.error?.('[google ia]', e.message);
        for (const d of file) { const p = await store.get('produits/' + d.id); if (p?.seoAuto) await store.set('produits/' + d.id, { ...p, seoAuto: { ...p.seoAuto, essais: (p.seoAuto.essais || 0) + 1 } }); }
        break;
      }
      const parSlug = new Map((Array.isArray(rep) ? rep : []).map(x => [String(x?.slug || ''), x]));
      const pris = new Set(tous.filter(d => !file.some(f => f.id === d.id)).map(d => d.data.seoTitre).filter(Boolean));
      for (const d of file) {
        const p = await store.get('produits/' + d.id); if (!p) continue;
        const r = parSlug.get(d.id) || {}, auto = { ...(p.seoAuto || {}) };
        let t = SEO.titreValide(r.titre), desc = SEO.descriptionValide(r.description);
        if (t && pris.has(t)) t = null;
        /* seulement les cases encore égales au texte automatique : un texte tapé entre-temps est gardé */
        if (t && 'titre' in auto && p.seoTitre === auto.titre) { p.seoTitre = t; auto.titre = t; pris.add(t); }
        if (desc && 'description' in auto && p.seoDescription === auto.description) { p.seoDescription = desc; auto.description = desc; }
        if (t || desc) { auto.ia = true; faits++; } else auto.essais = (auto.essais || 0) + 1;
        p.seoAuto = auto;
        await store.set('produits/' + d.id, p);
      }
      cat.invalidate();
    }
    if (faits) log.log?.(`[google ia] ${faits} produit(s) : titre et description Google rédigés par l'IA`);
    return faits;
  }
  /* « Description sous la photo » vide : 2-3 phrases écrites une seule fois par l'IA (Jean-Luc, 2026-11-24).
     `sousPhotoAuto` = { texte } une fois posée (même vidée ensuite à la main, on ne la remet pas), { essais } si l'IA a échoué. */
  const sousPhotoVide = p => !(Array.isArray(p?.sousPhoto) ? p.sousPhoto : [p?.sousPhoto]).some(x => String(x || '').trim());
  const sousPhotoAFaire = p => p && sousPhotoVide(p) && !p.sousPhotoAuto?.texte && (p.sousPhotoAuto?.essais || 0) < 2;
  async function sousPhotoIaLot({ taille = 15, maxLots = 100 } = {}) {
    if (!ia.actif) return 0;
    let faits = 0;
    for (let lot = 0; lot < maxLots; lot++) {
      const c = await cat.get();
      const nomsRub = Object.fromEntries(c.rubriques.map(r => [r.slug, r.nom])), nomsSous = Object.fromEntries(c.rubriques.flatMap(r => (r.sous || []).map(x => [x.slug, x.nom])));
      const file = (await store.list('produits')).filter(d => sousPhotoAFaire(d.data)).sort((a, b) => (a.data.statut === 'masque') - (b.data.statut === 'masque')).slice(0, taille);
      if (!file.length) break;
      let rep;
      try { rep = IA.json(await ia.demander(TXT.promptSousPhoto(file.map(d => TXT.infosProduit({ ...d.data, slug: d.id }, nomsRub, nomsSous))), { effort: 'low', maxTokens: 12000 })); }
      catch (e) {
        log.error?.('[sous la photo ia]', e.message);
        for (const d of file) { const p = await store.get('produits/' + d.id); if (p) await store.set('produits/' + d.id, { ...p, sousPhotoAuto: { ...(p.sousPhotoAuto || {}), essais: (p.sousPhotoAuto?.essais || 0) + 1 } }); }
        break;
      }
      const parSlug = new Map((Array.isArray(rep) ? rep : []).map(x => [String(x?.slug || ''), x]));
      for (const d of file) {
        const p = await store.get('produits/' + d.id); if (!p) continue;
        if (!sousPhotoVide(p)) continue; /* écrite à la main entre-temps */
        const t = TXT.texteValide(parSlug.get(d.id)?.texte);
        if (t) { p.sousPhoto = [t]; p.sousPhotoAuto = { texte: t }; faits++; }
        else p.sousPhotoAuto = { ...(p.sousPhotoAuto || {}), essais: (p.sousPhotoAuto?.essais || 0) + 1 };
        await store.set('produits/' + d.id, p);
      }
      cat.invalidate();
    }
    if (faits) log.log?.(`[sous la photo ia] ${faits} produit(s) : description sous la photo rédigée par l'IA`);
    return faits;
  }
  /* une seule tâche à la fois ; relancée après chaque création ou modification de produit */
  const lancerSeoIa = () => {
    if (!ia.actif || seoIaEnCours) return seoIaEnCours;
    seoIaEnCours = seoIaLot().catch(e => log.error?.('[google ia]', e)).then(() => sousPhotoIaLot()).catch(e => log.error?.('[sous la photo ia]', e)).finally(() => { seoIaEnCours = null; });
    return seoIaEnCours;
  };
  if (!opts.noTimers && env.JP_NO_TIMERS !== '1') setTimeout(lancerSeoIa, 30e3).unref?.();

  /* ---------- journal d'activité chaîné (toute modification se voit) ---------- */
  let auditQueue = Promise.resolve();
  function audit(ctx, op, p, resume = '') {
    auditQueue = auditQueue.then(async () => {
      const meta = (await store.get('_auditmeta/last')) || { hash: '0'.repeat(64), n: 0 };
      const n = meta.n + 1;
      const row = { n, at: new Date().toISOString(), uid: ctx.uid, who: ctx.name || ctx.email || '', op, path: p, resume, prev: meta.hash };
      row.hash = sha(JSON.stringify(row));
      await store.set('_audit/' + String(n).padStart(10, '0'), row);
      await store.set('_auditmeta/last', { hash: row.hash, n });
    }).catch(e => log.error?.('[journal]', e.message));
    return auditQueue;
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('X-Version', views.V); /* le back-office se recharge seul après une mise en ligne */
    req.cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => { try { return [k, decodeURIComponent(v.join('='))]; } catch { return [k, '']; } }));
    next();
  });
  const setCookie = (res, name, val, maxAgeSec) => res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${prod ? '; Secure' : ''}`);

  app.use(async (req, res, next) => {
    try {
      req.ctx = { role: 'visitor' };
      const tok = req.cookies.mg_s;
      if (tok) {
        const s = await store.get('_sessions/' + sha(tok));
        if (s && s.expires > Date.now()) {
          const u = await store.get('_users/' + s.userId);
          if (u && !u.disabled) req.ctx = { uid: s.userId, role: u.role, email: u.email, name: u.name, session: sha(tok), droits: DR.droitsDe(u) };
        }
      }
      const ct = req.cookies.mg_c;
      if (ct) { const s = await store.get('_csessions/' + sha(ct)); if (s && s.expires > Date.now()) req.client = { id: s.clientId, session: sha(ct) }; }
      next();
    } catch (e) { next(e); }
  });

  const json = express.json({ limit: '2mb' });
  const sameSite = (req, res, next) => (req.get('x-mg') === '1' ? next() : res.status(403).json({ error: 'Requête refusée.' }));
  const isTeam = req => req.ctx.role === 'manager' || req.ctx.role === 'collab';
  const team = (req, res, next) => (isTeam(req) ? next() : res.status(401).json({ error: 'Connexion requise.' }));
  /* droits détaillés (server/droits.js) : peut('prix'), peut('fichiers')… ; « Administrateur » a tout */
  const nomDroit = k => (DR.DROITS.find(d => d.k === k) || {}).nom || k;
  const refus = (res, k) => res.status(403).json({ error: `Vous n’avez pas le droit « ${nomDroit(k)} ». Demandez-le à un administrateur (Équipe & activité).` });
  const peut = (...ks) => (req, res, next) => { const k = ks.find(x => !req.ctx.droits?.[x]); return k ? refus(res, k) : next(); };
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const publicWrites = limiter(+(env.PUBLIC_WRITE_LIMIT || 20), 10 * 60e3);
  const loginTries = limiter(10, 15 * 60e3);

  /* ---------- fichiers statiques ---------- */
  app.get('/sante', wrap(async (req, res) => {
    const c = await cat.get();
    res.set('Cache-Control', 'no-store').json({ ok: true, base: env.DB_HOST ? 'MySQL' : 'fichier local', brevo: brevo.live ? 'actif' : 'mode test', ia: ia.actif ? 'active' : 'clé à ajouter', prestations: c.produits.length, rubriques: c.rubriques.length, lieux: c.lieux.length });
  }));
  app.use(express.static(PUBLIC, { maxAge: prod ? '7d' : 0, index: false, setHeaders: (res, p) => { if (/\.(webp|jpe?g|png|svg|mp4|woff2?)$/.test(p)) res.set('Cache-Control', 'public, max-age=2592000'); } }));
  app.use('/media', express.static(uploadDir, { maxAge: '30d' }));
  app.get('/robots.txt', (req, res) => env.SITE_NOINDEX === '1' ? res.type('text/plain').send('User-agent: *\nDisallow: /\n') : res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /devis/\nDisallow: /facture/\nDisallow: /espace-client\nSitemap: ${SITE}/sitemap.xml\n`));
  app.get('/sitemap.xml', wrap(async (req, res) => {
    const c = await cat.get();
    const urls = ['/', '/boutique', '/lieux', '/maison', '/zone-de-livraison', '/comment-commander', '/temoignages', '/contact',
      ...c.rubriques.filter(r => r.statut !== 'masque').map(r => '/' + r.slug),
      ...c.produits.filter(p => p.statut !== 'masque').map(p => `/${p.rubrique}/${p.slug}`),
      ...c.lieux.filter(l => l.statut !== 'masque').map(l => '/lieux/' + l.slug)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${esc(SITE + u)}</loc></url>`).join('')}</urlset>`);
  }));

  /* ---------- API publique ---------- */
  /* pages du site trouvées par la recherche (ex. « zone de livraison » sur téléphone → la page, pas la boutique) */
  const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(w => w.length > 3 ? w.replace(/s$/, '') : w).join(' '); /* « livraisons » = « livraison » */
  const PAGES_RECHERCHE = [
    { titre: 'Nos zones de livraison', href: '/zone-de-livraison', info: 'Carte, frais de livraison par paliers, offerte au-delà de 2 500 € TTC', mots: ['zone de livraison', 'zones de livraison', 'livraison', 'livrer', 'livrez', 'frais de livraison', 'tarif livraison', 'prix livraison', 'zone', 'livraison offerte', 'livraison gratuite', 'flotte', 'camion', 'vehicule'] },
    { titre: 'Avis clients', href: '/temoignages', info: 'Ce que disent nos clients', mots: ['avis', 'avis clients', 'temoignages', 'temoignage', 'note google'] },
    { titre: 'La maison', href: '/maison', info: 'Qui sommes-nous', mots: ['la maison', 'maison', 'qui sommes nous'] },
    { titre: 'Comment commander', href: '/comment-commander', info: 'Les étapes de votre demande', mots: ['comment commander', 'commander', 'commande', 'devis'] },
    { titre: 'Contact', href: '/contact', info: 'Téléphone, e-mail, formulaire', mots: ['contact', 'contacter', 'telephone', 'adresse', 'email'] },
    { titre: 'Mon espace client', href: '/espace-client', info: 'Vos devis et factures', mots: ['espace client', 'mon espace', 'mon compte', 'compte', 'facture', 'factures'] },
  ];
  /* page visée : tous les mots tapés appartiennent à un des mots-clés (ex. « zone livraison », « livraison ») */
  function pageRecherchee(q) {
    const n = norm(q); if (n.length < 3) return null;
    return PAGES_RECHERCHE.find(p => p.mots.map(norm).some(m => m === n || (n.length >= 4 && m.split(' ').length > 1 && n.split(' ').every(w => w.length < 3 || m.split(' ').includes(w))))) || null;
  }
  function pagesTrouvees(q) {
    const n = norm(q); if (n.length < 3) return [];
    return PAGES_RECHERCHE.filter(p => p.mots.map(norm).some(m => m.startsWith(n) || n.includes(m) && m.length >= 4));
  }
  app.get('/api/recherche', wrap(async (req, res) => {
    const c = await cat.get();
    const q = String(req.query.q || '').slice(0, 80);
    const pages = pagesTrouvees(q).map(p => ({ titre: p.titre, href: p.href, photo: '', prix: p.info, rubrique: 'Page du site', page: true }));
    const r = pages.concat(cat.search(c, q, 8).map(p => ({ titre: p.titre, href: `/${p.rubrique}/${p.slug}`, photo: p.photos?.[0]?.src || '', prix: p.prixCents == null ? 'Sur devis' : euros(p.prixCents) + (p.unite ? ' / ' + p.unite : ''), rubrique: c.rubriques.find(x => x.slug === p.rubrique)?.nom || '' })));
    res.set('Cache-Control', 'public, max-age=60').json({ q, resultats: r.slice(0, 10) });
  }));

  async function upsertClient({ nom, email, tel, societe }, ev = null) {
    /* demande de devis du site : fiche « Client » ; code postal, ville et horaire repris dans l'adresse de livraison si elle est vide */
    const livDe = cl => { const l = cl?.livraison; if (!ev || !(ev.cp || ev.ville || ev.horaire) || (l && (l.identique || l.adresse || l.cp || l.ville || l.horaire))) return {}; return { livraison: LC.nette({ ...(l || {}), cp: ev.cp, ville: ev.ville, horaire: ev.horaire }) }; };
    email = String(email).trim().toLowerCase();
    const idx = await store.get('_clientemail/' + sha(email));
    const now = new Date().toISOString();
    if (idx) {
      const cl = await store.get('clients/' + idx.id);
      /* client connu : un formulaire public ne remplace jamais ses coordonnées (seulement les cases vides) */
      if (cl) { await store.set('clients/' + idx.id, { ...cl, nom: cl.nom || nom, tel: cl.tel || tel, societe: cl.societe || societe, ...(cl.genre || !ev || (cl.metiers || []).length || (cl.djStyles || []).length || cl.independant || cl.remuneration ? {} : { genre: 'client' }), ...livDe(cl), derniereActivite: now }); return { id: idx.id, nouveau: false }; }
    }
    const id = 'c_' + rid(8);
    await store.set('clients/' + id, { id, nom, email, tel, societe, genre: 'client', ...livDe(null), notes: '', creeLe: now, derniereActivite: now, source: 'site', canal: 'Site' });
    await store.set('_clientemail/' + sha(email), { id });
    return { id, nouveau: true };
  }

  async function lienEspace(clientId, jours = 30) {
    const tok = rid(24);
    await store.set('_clinks/' + sha(tok), { clientId, expires: Date.now() + jours * 86400e3 });
    return SITE + '/espace-client?t=' + tok;
  }

  async function alerterEquipe(sujet, html, sms) {
    const R = (await cat.get()).reglages;
    const mails = String(R.alertes?.emails || env.ALERT_EMAILS || '').split(/[,;\s]+/).filter(isEmail);
    for (const m of mails) await brevo.sendEmail({ to: m, subject: sujet, html, text: html.replace(/<[^>]+>/g, ' ') });
    for (const t of String(R.alertes?.sms || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean)) await brevo.sendSms({ to: t, content: sms || sujet, lien: false });
  }

  const s = (v, n = 200) => String(v ?? '').trim().slice(0, n);
  app.post('/api/demandes', sameSite, json, wrap(async (req, res) => {
    if (!publicWrites(req.ip)) return res.status(429).json({ error: 'Trop d’envois. Réessayez dans quelques minutes ou appelez-nous.' });
    const b = req.body || {};
    const c = await cat.get();
    const T = c.reglages.tarifs || {};
    const contact = { nom: nomPropre(s(b.nom, 120)), email: s(b.email, 160).toLowerCase(), tel: s(b.tel, 30), societe: s(b.societe, 120) };
    if (!contact.nom || !isEmail(contact.email)) return res.status(400).json({ error: 'Merci d’indiquer votre nom et un e-mail valide.' });
    const lignesIn = Array.isArray(b.lignes) ? b.lignes.slice(0, 80) : [];
    if (!lignesIn.length && b.type !== 'contact') return res.status(400).json({ error: 'Votre sélection est vide.' });
    const lignes = lignesIn.map(l => {
      const p = c.bySlug.get(s(l.slug, 120));
      const est = estimerLigne(l, p, T);
      const choix = {};
      for (const g of p?.groupes || []) { const ids = (l.choix?.[g.id] || []).filter(id => (g.options || []).some(o => o.id === String(id).replace(/:\d+$/, ''))).slice(0, 30); if (ids.length) choix[g.id] = ids; }
      return {
        slug: p ? p.slug : s(l.slug, 120), titre: p ? p.titre : s(l.titre, 160), rubrique: p?.rubrique || s(l.rubrique, 60), unite: p?.unite || s(l.unite, 40),
        qte: est.qte, prixCents: p?.prixCents ?? null, supCents: est.supCents, supplements: est.supplements, totalCents: est.totalCents, surDevis: est.surDevis,
        variante: (p?.variantes || []).includes(l.variante) ? l.variante : '', choix, resume: s(l.resume, 400), note: s(l.note, 500),
        personnel: l.personnel?.nb ? { nb: Math.min(50, Math.max(1, +l.personnel.nb | 0)), heures: Math.min(24, Math.max(T.personnel?.minHeures || 4, +l.personnel.heures | 0)) } : null,
        pack: l.pack?.id && (T.packs || []).some(x => x.id === l.pack.id) ? { id: l.pack.id, nb: Math.max(1, +l.pack.nb | 0) } : null,
      };
    });
    const km = Math.min(2000, Math.max(0, Math.round(+b.km || 0)));
    const sousTotal = lignes.reduce((t, l) => t + l.totalCents, 0);
    const hz = LIVR.horsZone(b.cp), kmC = hz ? 0 : LIVR.kmCents(T, sousTotal), offerte = !!(km && !hz && kmC === 0); /* prix du km selon le palier ; hors Île-de-France = nous consulter */
    const { id: clientId, nouveau } = await upsertClient(contact, b.type === 'contact' ? null : { cp: s(b.cp, 5), ville: s(b.ville, 80), horaire: s(b.horaire, 60) });
    if (b.offres === true || b.offres === '1' || b.offres === 'on') { const cl = await store.get('clients/' + clientId); if (cl && !cl.consentement?.email) await store.set('clients/' + clientId, { ...cl, consentement: { email: true, sms: true, le: new Date().toISOString(), source: 'case cochée sur le site', base: 'consentement' } }); }
    const id = 'd_' + rid(8);
    const ref = await prochainNumero(store, 'demande');
    const demande = {
      id, ref, type: b.type === 'contact' ? 'contact' : 'devis', clientId, contact,
      evenement: { type: s(b.evenement, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '', invites: Math.min(10000, Math.max(0, +b.invites | 0)), cp: s(b.cp, 5), ville: s(b.ville, 80), horaire: s(b.horaire, 60) },
      livraison: km ? { km, kmCents: kmC, cents: km * kmC, ...(offerte ? { offerte: true } : {}), ...(hz ? { horsZone: true } : {}) } : null,
      lignes, sousTotalCents: sousTotal, totalEstimeCents: sousTotal + km * kmC,
      message: s(b.message, 3000), sujet: s(b.sujet, 80), statut: 'demande', historique: [{ at: new Date().toISOString(), statut: 'demande', par: 'site' }],
      createdAt: new Date().toISOString(), ip: req.ip, canal: 'Site', /* source de la demande : venue du site */
    };
    await store.set('demandes/' + id, demande);
    const lien = await lienEspace(clientId);
    const R = c.reglages;
    let auto = null;
    if (demande.type === 'devis') {
      try { auto = await devisAutomatique(demande); }
      catch (e) { console.error('devis automatique', e); auto = { essaye: new Date().toISOString(), envoye: false, raisons: ['erreur pendant la préparation automatique'] }; }
      const d0 = (await store.get('demandes/' + id)) || demande;
      await store.set('demandes/' + id, { ...d0, devisAuto: auto });
    }
    if (auto?.envoye) return res.json({ ok: true, ref, totalEstimeCents: auto.ttcCents, devisEnvoye: true, espace: nouveau ? lien.replace(SITE, '') : '/espace-client' });
    const recap = lignes.map(l => `<li>${esc(titreTexte(l.titre))}${l.variante ? ' · ' + esc(l.variante) : ''} — ${l.qte} ${esc(l.unite || '')}${l.surDevis ? ' (sur devis)' : ' · ' + euros(l.totalCents)}</li>`).join('');
    brevo.sendEmail({ to: contact.email, name: contact.nom, subject: `Magnolia Traiteur : votre demande ${ref} est bien reçue`, replyTo: R.email,
      html: `<p>Bonjour ${esc(contact.nom.split(' ')[0])},</p><p>Merci pour votre demande${demande.evenement.date ? ' pour le ' + esc(dateFr(demande.evenement.date)) : ''}. Notre équipe vérifie les disponibilités et revient vers vous rapidement avec votre devis.</p>${recap ? `<ul>${recap}</ul><p>Total estimé : <b>${euros(demande.totalEstimeCents)} TTC</b> (à confirmer).</p>` : ''}<p>Suivez votre demande dans votre espace : <a href="${lien}">Mon espace Magnolia</a></p><p>À très vite,<br>L’équipe Magnolia Traiteur<br>${esc(R.telephone)}</p>`,
      text: `Merci pour votre demande ${ref}. Votre espace : ${lien}` }).catch(() => {});
    alerterEquipe(`Nouvelle ${demande.type === 'contact' ? 'question' : 'demande de devis'} ${ref} : ${contact.nom}`, `<p><b>${esc(contact.nom)}</b> ${esc(contact.societe)} · ${esc(contact.email)} · ${esc(contact.tel)}</p><p>${esc(demande.evenement.type)} · ${esc(dateFr(demande.evenement.date))} · ${demande.evenement.invites} invités · ${esc(demande.evenement.ville)}</p><ul>${recap}</ul><p>${esc(demande.message)}</p>${auto?.raisons?.length ? `<p><b>Devis à préparer à la main :</b> ${esc(auto.raisons.join(' ; '))}.</p>` : ''}<p><a href="${SITE}/admin#/demandes/${id}">Ouvrir dans le back-office</a></p>`, `Magnolia : nouvelle demande ${ref} de ${contact.nom}, ${demande.evenement.invites} pers. le ${demande.evenement.date}`).catch(() => {});
    /* le lien direct vers l'espace n'est rendu qu'à un nouveau client ; un client connu le reçoit par e-mail */
    res.json({ ok: true, ref, totalEstimeCents: demande.totalEstimeCents, espace: nouveau ? lien.replace(SITE, '') : '/espace-client' });
  }));

  /* ---------- désinscription des e-mails d'information (lien en bas de chaque e-mail groupé, et bouton « Se désinscrire » de Gmail / Apple Mail) ---------- */
  async function desinscrire(id, t) {
    const c = id && await store.get('clients/' + id);
    if (!c || !DIF.jetonOk(await secretDesinscription(), id, t)) return null;
    if (!c.desinscrit?.email) { const now = new Date().toISOString(); await store.set('clients/' + id, { ...c, desinscrit: { ...(c.desinscrit || {}), email: true, le: c.desinscrit?.le || now, leEmail: now } }); profilsCache = null; }
    return c;
  }
  app.get('/desinscription', wrap(async (req, res) => {
    const id = s(req.query.c, 40), t = s(req.query.t, 40), ok = id && (await store.get('clients/' + id)) && DIF.jetonOk(await secretDesinscription(), id, t);
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').type('html').send(DIF.pageDesinscription({ etat: ok ? 'demander' : 'invalide', action: '/desinscription?c=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(t), R: (await cat.get()).reglages }));
  }));
  app.post('/desinscription', express.urlencoded({ extended: false }), wrap(async (req, res) => {
    const c = await desinscrire(s(req.query.c, 40), s(req.query.t, 40));
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').type('html').send(DIF.pageDesinscription({ etat: c ? 'fait' : 'invalide', R: (await cat.get()).reglages }));
  }));

  /* ---------- espace client (lien magique par e-mail) ---------- */
  const lienTries = limiter(5, 60 * 60e3);
  app.post('/api/client/lien', sameSite, json, wrap(async (req, res) => {
    const email = s(req.body?.email, 160).toLowerCase();
    if (!lienTries(req.ip) || !lienTries('m|' + email)) return res.status(429).json({ error: 'Trop de demandes. Réessayez plus tard.' });
    const idx = isEmail(email) ? await store.get('_clientemail/' + sha(email)) : null;
    if (idx) {
      const lien = await lienEspace(idx.id, 1);
      await brevo.sendEmail({ to: email, subject: 'Votre lien de connexion Magnolia', html: `<p>Bonjour,</p><p>Voici votre lien pour ouvrir votre espace Magnolia (valable 24 heures) :</p><p><a href="${lien}">Ouvrir mon espace</a></p>`, text: lien });
    }
    res.json({ ok: true });
  }));
  app.get('/espace-client', wrap(async (req, res) => {
    const c = await cat.get();
    if (req.query.t) {
      const l = await store.get('_clinks/' + sha(String(req.query.t)));
      if (!l || l.expires < Date.now()) return res.send(views.espaceConnexion(c, 'Ce lien a expiré : demandez-en un nouveau ci-dessous.'));
      const tok = rid(32);
      await store.set('_csessions/' + sha(tok), { clientId: l.clientId, expires: Date.now() + 90 * 86400e3 });
      setCookie(res, 'mg_c', tok, 90 * 86400);
      return res.redirect('/espace-client');
    }
    if (!req.client) return res.send(views.espaceConnexion(c));
    const client = await store.get('clients/' + req.client.id);
    if (!client) return res.send(views.espaceConnexion(c));
    const demandes = (await store.list('demandes')).map(d => d.data).filter(d => d.clientId === req.client.id && d.type !== 'contact').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const devis = (await store.list('devis')).map(d => d.data).filter(d => d.clientId === req.client.id && d.statut !== 'brouillon');
    const factures = (await store.list('factures')).map(d => d.data).filter(f => f.clientId === req.client.id);
    res.set('Cache-Control', 'no-store').send(views.espace(c, { client, demandes, devis, factures }));
  }));
  app.post('/espace-client/deconnexion', wrap(async (req, res) => {
    if (req.client) await store.delete('_csessions/' + req.client.session);
    setCookie(res, 'mg_c', '', 0);
    res.redirect('/espace-client');
  }));

  /* ---------- devis et factures en ligne (lien privé) ---------- */
  async function devisParToken(token) {
    const idx = await store.get('_devistoken/' + sha(token));
    return idx ? store.get('devis/' + idx.id) : null;
  }
  app.get('/devis/:token', wrap(async (req, res, next) => {
    const d = await devisParToken(req.params.token);
    if (!d || d.statut === 'brouillon') return next();
    const c = await cat.get();
    if (!d.vuLe) { await store.set('devis/' + d.id, { ...d, vuLe: new Date().toISOString() }); }
    res.set('Cache-Control', 'no-store').send(views.devisPage(c, d, totaux(d), { client: await store.get('clients/' + d.clientId), demande: d.demandeId ? await store.get('demandes/' + d.demandeId) : null }));
  }));
  app.post('/api/devis/:token/:action(accepter|refuser)', sameSite, json, wrap(async (req, res) => {
    const d = await devisParToken(req.params.token);
    if (!d || d.statut !== 'envoye') return res.status(400).json({ error: 'Ce devis ne peut plus être modifié en ligne.' });
    const now = new Date().toISOString();
    const accepte = req.params.action === 'accepter';
    const nom = s(req.body?.nom, 120);
    if (accepte && nom.length < 3) return res.status(400).json({ error: 'Merci d’indiquer votre nom.' });
    const next = { ...d, statut: accepte ? 'accepte' : 'refuse', ...(accepte ? { signature: { nom, at: now, ip: req.ip, ua: s(req.get('user-agent'), 200) } } : { refuseLe: now }) };
    await store.set('devis/' + d.id, next);
    if (d.demandeId) await changerStatut(d.demandeId, accepte ? 'accord' : 'refuse', 'client (en ligne)');
    const t = totaux(d);
    if (accepte) {
      const cl = await store.get('clients/' + d.clientId); const R = (await cat.get()).reglages;
      const ac = regleAcompte(t.ttcCents, d, R.tarifs);
      if (cl?.email) brevo.sendEmail({ to: cl.email, name: cl.nom, replyTo: R.email, subject: `Magnolia Traiteur : votre devis ${d.numero} est signé`,
        html: `<p>Bonjour ${esc((cl.nom || '').split(' ')[0])},</p><p>Merci pour votre confiance ! Votre devis ${esc(d.numero)} (${euros(t.ttcCents)} TTC) est bien signé.</p><p>Pour réserver définitivement votre date, il reste à régler ${ac.total ? `la totalité (${euros(ac.cents)})` : `l’acompte de ${ac.pct} % (${euros(ac.cents)})`} : <a href=\"${SITE}/devis/${d.token}\">voir le devis et payer</a>.</p><p>À très vite,<br>L’équipe Magnolia Traiteur<br>${esc(R.telephone)}</p>`,
        text: `Votre devis ${d.numero} est signé. Paiement : ${SITE}/devis/${d.token}` }).catch(e => log.error?.(e));
    }
    alerterEquipe(`Devis ${d.numero} ${accepte ? 'SIGNÉ' : 'refusé'} par le client`, `<p>Le devis ${esc(d.numero)} (${euros(t.ttcCents)} TTC) a été ${accepte ? 'signé en ligne par <b>' + esc(nom) + '</b>' : 'refusé'}.</p><p><a href="${SITE}/admin#/devis/${d.id}">Ouvrir</a></p>`, `Magnolia : devis ${d.numero} ${accepte ? 'signé' : 'refusé'}`).catch(() => {});
    res.json({ ok: true });
  }));
  /* commentaire laissé par le client sur son devis : gardé sur le devis et envoyé au commercial du devis (e-mail + SMS) */
  app.post('/api/devis/:token/commentaire', sameSite, json, wrap(async (req, res) => {
    if (!publicWrites(req.ip)) return res.status(429).json({ error: 'Trop d’envois. Réessayez dans quelques minutes ou appelez-nous.' });
    const d = await devisParToken(req.params.token);
    if (!d || d.statut === 'brouillon') return res.status(404).json({ error: 'Devis introuvable.' });
    const texte = String(req.body?.texte ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
    if (texte.length < 2) return res.status(400).json({ error: 'Écrivez votre commentaire.' });
    if ((d.commentaires || []).length >= 50) return res.status(400).json({ error: 'Trop de commentaires sur ce devis : appelez-nous.' });
    const cl = await store.get('clients/' + d.clientId);
    const nom = nomPropre(cl?.nom || d.clientNom || '') || 'Le client';
    const now = new Date().toISOString();
    await store.set('devis/' + d.id, { ...d, commentaires: [...(d.commentaires || []), { at: now, texte, nom }] });
    /* destinataire : le commercial du devis (coordonnées à jour dans Équipe & activité), sinon les alertes de l'équipe */
    const R = (await cat.get()).reglages, P = (R.alertes?.personnes || []).filter(x => x.nom);
    const c0 = d.commercial === null ? null : (d.commercial || P[0] || null);
    const users = c0?.nom ? (await store.list('_users')).map(x => x.data).filter(u => u && !u.disabled) : [];
    const memeNom = n => x => nomCle(x) === nomCle(n);
    const uCom = c0?.nom ? users.find(u => nomCle(u.name) === nomCle(c0.nom)) : null;
    const com = c0?.nom ? { nom: c0.nom, email: P.find(memeNom(c0.nom))?.email || c0.email || uCom?.email || '', tel: P.find(memeNom(c0.nom))?.tel || c0.tel || uCom?.portable || '' } : null;
    const t = totaux(d), lien = `${SITE}/admin#/devis/${d.id}`;
    const sujet = `Commentaire de ${nom} sur le devis ${d.numero}`;
    const html = `<p>Bonjour${com?.nom ? ' ' + esc(com.nom.split(' ')[0]) : ''},</p><p><b>${esc(nom)}</b>${cl?.societe ? ' (' + esc(cl.societe) + ')' : ''} a laissé un commentaire sur le devis <b>${esc(d.numero)}</b> (${euros(t.ttcCents)} TTC) :</p><blockquote style="border-left:3px solid #c9a45c;margin:12px 0;padding:8px 14px;background:#f7f3ea">${esc(texte).replace(/\n/g, '<br>')}</blockquote><p>${cl?.tel ? `Téléphone : <a href="tel:${esc(cl.tel.replace(/\s/g, ''))}">${esc(cl.tel)}</a><br>` : ''}${cl?.email ? `E-mail : <a href="mailto:${esc(cl.email)}">${esc(cl.email)}</a><br>` : ''}<a href="${lien}">Ouvrir le devis dans le back-office</a></p>`;
    const court = texte.replace(/\s+/g, ' ');
    const sms = `Magnolia : ${nom} a commenté le devis ${d.numero} : « ${court.length > 200 ? court.slice(0, 197) + '…' : court} »${cl?.tel ? ' Tél. ' + cl.tel : ''}`;
    try {
      if (com?.email || com?.tel) {
        if (com.email) await brevo.sendEmail({ to: com.email, name: com.nom, replyTo: cl?.email || undefined, subject: sujet, html, text: html.replace(/<[^>]+>/g, ' ') });
        if (com.tel) await brevo.sendSms({ to: com.tel, content: sms });
      } else await alerterEquipe(sujet, html, sms);
    } catch (e) { log.error?.(e); }
    res.json({ ok: true });
  }));
  app.get('/facture/:token', wrap(async (req, res, next) => {
    const idx = await store.get('_facturetoken/' + sha(req.params.token));
    const f = idx ? await store.get('factures/' + idx.id) : null;
    if (!f) return next();
    res.set('Cache-Control', 'no-store').send(views.facturePage(await cat.get(), f, totaux(f)));
  }));

  async function changerStatut(demandeId, statut, par) {
    const d = await store.get('demandes/' + demandeId);
    if (!d || d.statut === statut) return;
    await store.set('demandes/' + demandeId, priseDe({ ...d, statut, historique: [...(d.historique || []), { at: new Date().toISOString(), statut, par }] }, par, 'étape : ' + statut));
  }
  /* première action de l'équipe sur une demande (devis, e-mail, SMS, appel, note, rendez-vous, attribution, étape) :
     elle quitte « Demandes de devis » et passe dans « Suivi client », au nom de celui qui l'a traitée (s'il n'y avait personne) */
  const equipier = par => { const n = String(par || '').trim(); return n && !/^(site|client)\b/i.test(n) ? n : ''; };
  function priseDe(d, par, quoi) {
    if (!d || d.type === 'contact' || d.priseEnCharge) return d;
    const qui = equipier(par);
    return { ...d, commercial: d.commercial || qui, priseEnCharge: { at: new Date().toISOString(), par: qui, quoi } };
  }
  async function prendreEnCharge(f, par, quoi) {
    for (const { id, data: d } of await store.list('demandes')) {
      if (!d || d.priseEnCharge || d.type === 'contact' || !f({ ...d, id })) continue;
      await store.set('demandes/' + id, priseDe(d, par, quoi));
    }
  }
  const demandesDuClient = c => d => d.clientId === c.id || (!!c.email && String(d.contact?.email || '').toLowerCase() === String(c.email).toLowerCase());

  /* avis déposé par un client : publié seulement après relecture de l'équipe */
  app.post('/api/avis', sameSite, json, wrap(async (req, res) => {
    if (!publicWrites(req.ip)) return res.status(429).json({ error: 'Trop d’envois. Réessayez plus tard.' });
    const b = req.body || {};
    if (b.site) return res.json({ ok: true }); /* robot */
    const avis = { auteur: s(b.auteur, 80), email: s(b.email, 160).toLowerCase(), evenement: s(b.evenement, 40), note: Math.min(5, Math.max(1, +b.note | 0 || 5)), texte: s(b.texte, 1500), statut: 'attente', source: 'site', ordre: 99, createdAt: new Date().toISOString() };
    if (!avis.auteur || !isEmail(avis.email) || avis.texte.length < 20) return res.status(400).json({ error: 'Merci d’indiquer votre prénom, votre e-mail et quelques phrases (20 caractères minimum).' });
    const id = 'a_' + rid(8);
    await store.set('avis/' + id, avis);
    alerterEquipe(`Nouvel avis à relire : ${avis.note}/5 de ${avis.auteur}`, `<p><b>${'★'.repeat(avis.note)}</b> ${esc(avis.auteur)} (${esc(avis.evenement)})</p><blockquote>${esc(avis.texte)}</blockquote><p><a href="${SITE}/admin#/avis">Publier ou masquer dans le back-office</a></p>`, `Magnolia : nouvel avis ${avis.note}/5 de ${avis.auteur} à relire.`).catch(e => log.error?.(e));
    res.json({ ok: true });
  }));

  /* ---------- connexion de l'équipe ---------- */
  app.post('/api/auth/login', sameSite, json, wrap(async (req, res) => {
    const email = s(req.body?.email, 160).toLowerCase();
    if (!loginTries(req.ip + '|' + email)) return res.status(429).json({ error: 'Trop d’essais. Réessayez dans 15 minutes.' });
    const u = await findUserByEmail(email);
    const ok = u && !u.disabled && await bcrypt.compare(String(req.body?.password || ''), u.passHash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
    const tok = rid(32);
    await store.set('_sessions/' + sha(tok), { userId: u.id, expires: Date.now() + 30 * 86400e3, at: new Date().toISOString() });
    setCookie(res, 'mg_s', tok, 30 * 86400);
    audit({ uid: u.id, name: u.name }, 'connexion', '');
    res.json({ ok: true });
  }));
  app.post('/api/auth/logout', sameSite, wrap(async (req, res) => {
    if (req.ctx.session) await store.delete('_sessions/' + req.ctx.session);
    setCookie(res, 'mg_s', '', 0);
    res.json({ ok: true });
  }));
  /* mot de passe oublié : lien valable 1 heure, envoyé par e-mail ; même réponse que le compte existe ou non */
  app.post('/api/auth/forgot', sameSite, json, wrap(async (req, res) => {
    const email = s(req.body?.email, 160).toLowerCase();
    if (!loginTries('oubli|' + req.ip)) return res.status(429).json({ error: 'Trop de demandes. Réessayez dans 15 minutes.' });
    const u = isEmail(email) ? await findUserByEmail(email) : null;
    if (u && !u.disabled) {
      const tok = rid(32);
      await store.set('_resets/' + sha(tok), { userId: u.id, expires: Date.now() + 3600e3 });
      const lien = `${SITE}/connexion#reset=${tok}`;
      await brevo.sendEmail({ to: email, name: u.name, subject: 'Magnolia : choisir un nouveau mot de passe',
        html: `<p>Bonjour,</p><p>Pour choisir un nouveau mot de passe du back-office Magnolia, ouvrez ce lien (valable 1 heure) :</p><p><a href="${lien}">Choisir mon mot de passe</a></p><p>Si vous n’avez rien demandé, ignorez ce message.</p>`,
        text: `Nouveau mot de passe (lien valable 1 heure) : ${lien}` });
      audit({ uid: u.id, name: u.name }, 'mot de passe oublié : lien envoyé', '');
    }
    res.json({ ok: true });
  }));
  app.post('/api/auth/reset', sameSite, json, wrap(async (req, res) => {
    const tok = s(req.body?.token, 80);
    const r = tok ? await store.get('_resets/' + sha(tok)) : null;
    if (!r || r.expires < Date.now()) return res.status(400).json({ error: 'Ce lien a expiré. Redemandez-en un.' });
    if (String(req.body?.password || '').length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum.' });
    const u = await store.get('_users/' + r.userId);
    if (!u || u.disabled) return res.status(400).json({ error: 'Compte désactivé.' });
    await store.set('_users/' + r.userId, { ...u, passHash: await bcrypt.hash(String(req.body.password), 11) });
    await store.delete('_resets/' + sha(tok));
    /* toutes les anciennes connexions de ce compte sont fermées */
    for (const d of await store.list('_sessions')) if (d.data?.userId === r.userId) await store.delete('_sessions/' + d.id);
    audit({ uid: r.userId, name: u.name }, 'mot de passe réinitialisé', '');
    res.json({ ok: true });
  }));
  app.get('/api/session', (req, res) => res.set('Cache-Control', 'no-store').json({ connecte: isTeam(req), role: req.ctx.role, nom: req.ctx.name || '', email: req.ctx.email || '', droits: req.ctx.droits || {} }));
  app.post('/api/auth/password', sameSite, json, team, wrap(async (req, res) => {
    const u = await store.get('_users/' + req.ctx.uid);
    if (!u || !(await bcrypt.compare(String(req.body?.current || ''), u.passHash))) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    if (String(req.body?.password || '').length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum.' });
    await store.set('_users/' + req.ctx.uid, { ...u, passHash: await bcrypt.hash(String(req.body.password), 11) });
    audit(req.ctx, 'mot de passe changé', '');
    res.json({ ok: true });
  }));

  /* ---------- back-office : API ---------- */
  const A = express.Router();
  A.use(team);
  /* ---------- « voir seulement ses opportunités » : demandes, devis et factures dont on est le commercial,
     plus celles sans commercial (nouvelles demandes du site pas encore prises en charge) ---------- */
  const nomCle = x => String((typeof x === 'string' ? x : x?.nom) || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  async function visibles(req) {
    if (req.ctx.droits?.toutes) return null;
    if (req._vis) return req._vis;
    const [dem, dv, fa, R] = await Promise.all([store.list('demandes'), store.list('devis'), store.list('factures'), store.get('site/reglages')]);
    const D = dem.map(x => ({ ...x.data, id: x.data?.id || x.id })), V = dv.map(x => ({ ...x.data, id: x.data?.id || x.id })), F = fa.map(x => ({ ...x.data, id: x.data?.id || x.id }));
    const moi = new Set([nomCle(req.ctx.name)]);
    for (const p of (R || {}).alertes?.personnes || []) if (p?.nom && p.email && String(p.email).trim().toLowerCase() === String(req.ctx.email || '').toLowerCase()) moi.add(nomCle(p.nom));
    moi.delete('');
    const demById = new Map(D.map(d => [d.id, d])), devById = new Map(V.map(v => [v.id, v]));
    const devisDe = id => V.filter(v => v.demandeId === id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const comDem = d => { const l = devisDe(d.id); const m = l.find(x => x.statut === 'accepte') || l.find(x => x.statut === 'envoye') || l[0]; return nomCle(d.commercial) || nomCle(m?.commercial); };
    const comDevis = v => nomCle(v.commercial) || (v.demandeId && demById.has(v.demandeId) ? nomCle(demById.get(v.demandeId).commercial) : '');
    const comFac = f => nomCle(f.commercial) || (f.devisId && devById.has(f.devisId) ? comDevis(devById.get(f.devisId)) : '');
    const ok = n => !n || moi.has(n);
    req._vis = { moi, demandes: new Set(D.filter(d => ok(comDem(d))).map(d => d.id)), devis: new Set(V.filter(v => ok(comDevis(v))).map(v => v.id)), factures: new Set(F.filter(f => ok(comFac(f))).map(f => f.id)) };
    return req._vis;
  }
  const OPP = ['demandes', 'devis', 'factures'];
  const voitDoc = async (req, coll, id) => { const v = OPP.includes(coll) ? await visibles(req) : null; return !v || v[coll].has(id); };
  /* droits par écran, et opportunités des autres commerciaux introuvables par leur adresse */
  const ROUTES_DOC = [
    [/^\/actions\/(?:envoyer-devis|relancer|dupliquer-devis|facture-depuis-devis|reglement-devis)\/([^/]+)/, 'devis'],
    [/^\/devis\/([^/]+)\/apercu/, 'devis'],
    [/^\/factures\/([^/]+)\/apercu/, 'factures'],
    [/^\/actions\/(?:facture|facture-reglement|facture-reglement-retirer|facture-payee|envoyer-facture|relancer-facture|archiver-facture|avoir-facture)\/([^/]+)/, 'factures'],
    [/^\/actions\/devis-depuis-demande\/([^/]+)/, 'demandes'],
  ];
  A.use(wrap(async (req, res, next) => {
    const p = req.path, dr = req.ctx.droits || {};
    if (/^\/(?:factures(?:\/|$)|actions\/(?:factures$|facture\/|facture-|envoyer-facture|relancer-facture|archiver-facture|avoir-facture|reglement-devis))/.test(p) && !dr.factures) return refus(res, 'factures');
    if (/^\/(?:diffusion\/|ia\/diffusion-)/.test(p) && !dr.diffusion) return refus(res, 'diffusion');
    if (/^\/ia\/(?:seo|texte-produit)$/.test(p) && !dr.produits) return refus(res, 'produits');
    if (/^\/actions\/(?:journal|envois)$/.test(p) && !dr.equipe) return refus(res, 'equipe');
    if (req.method !== 'GET') {
      const coll = p.split('/')[1];
      const besoin = { produits: 'produits', rubriques: 'produits', lieux: 'produits', avis: 'site', modeles: 'outils', pages: 'outils' }[coll];
      if (besoin && !dr[besoin]) return refus(res, besoin);
    }
    for (const [re, coll] of ROUTES_DOC) { const m = p.match(re); if (m && !(await voitDoc(req, coll, decodeURIComponent(m[1])))) return res.status(404).json({ error: 'Introuvable : ce dossier est suivi par un autre commercial.' }); }
    next();
  }));
  /* tableau de bord : ?com=Nom filtre tout sur un commercial (« — » = sans commercial), comme le sélecteur du Suivi client */
  A.get('/stats', wrap(async (req, res) => {
    const [dem, dv, fa, us, rdv0, reg] = await Promise.all([store.list('demandes'), store.list('devis'), store.list('factures'), store.list('_users'), store.list('rdv'), store.get('site/reglages')]);
    const demandesTous = dem.map(d => d.data).filter(Boolean), devisTous = dv.map(d => d.data).filter(Boolean), facturesTous = fa.map(d => d.data).filter(Boolean);
    const nomDe = x => String((typeof x === 'string' ? x : x?.nom) || '').trim();
    /* commercial d'une demande : celui de la fiche, sinon celui de son devis principal (même règle que le Suivi client) */
    const devisDe = id => devisTous.filter(v => v.demandeId === id).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const aTraiterSrv = d => d.type !== 'contact' && !d.classee && !d.priseEnCharge && d.statut === 'demande' && !devisDe(d.id).length;
    const comDem = d => { const l = devisDe(d.id); const m = l.find(x => x.statut === 'accepte') || l.find(x => x.statut === 'envoye') || l[0]; return nomDe(d.commercial) || nomDe(m?.commercial); };
    const demById = new Map(demandesTous.map(d => [d.id, d]));
    const comDevis = v => nomDe(v.commercial) || (v.demandeId && demById.has(v.demandeId) ? nomDe(demById.get(v.demandeId).commercial) : '');
    const devById = new Map(devisTous.map(v => [v.id, v]));
    const comFac = f => nomDe(f.commercial) || (f.devisId && devById.has(f.devisId) ? comDevis(devById.get(f.devisId)) : '');
    const vis = await visibles(req); /* « seulement ses opportunités » : le tableau de bord ne montre que les siennes */
    const com = vis ? '' : String(req.query.com || '').trim();
    const ok = n => !com || (com === '—' ? !n : n === com);
    const demandes = demandesTous.filter(d => ok(comDem(d)) && (!vis || vis.demandes.has(d.id))), devis = devisTous.filter(v => ok(comDevis(v)) && (!vis || vis.devis.has(v.id))), factures = req.ctx.droits.factures ? facturesTous.filter(f => ok(comFac(f)) && (!vis || vis.factures.has(f.id))) : [];
    const ici = d => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const aujourdHui = ici(new Date()), mois = aujourdHui.slice(0, 7);
    const parStatut = Object.fromEntries(PIPELINE.map(k => [k, demandes.filter(d => d.statut === k && d.type !== 'contact').length]));
    const signes = devis.filter(d => d.statut === 'accepte');
    const moisSigne = d => { const t = d.signature?.at || d.accepteLe || d.updatedAt; return t ? ici(new Date(t)).slice(0, 7) : ''; };
    /* chiffre d'affaires signé des 6 derniers mois (petit graphique) */
    const n0 = new Date(aujourdHui + 'T12:00:00');
    const serie = [...Array(6)].map((_, i) => { const d = new Date(n0.getFullYear(), n0.getMonth() - 5 + i, 15); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); return { mois: k, cents: signes.filter(x => moisSigne(x) === k).reduce((t, x) => t + totaux(x).ttcCents, 0) }; });
    const tranches = devis.filter(d => ['accepte', 'refuse'].includes(d.statut));
    const enAttente = devis.filter(d => d.statut === 'envoye');
    const persos = ((reg || {}).alertes?.personnes || []).map(x => nomDe(x));
    const commerciaux = vis ? [req.ctx.name].filter(Boolean) : [...new Set([...us.map(u => u.data).filter(u => u && !u.disabled).map(u => nomDe(u.name)), ...persos, ...demandesTous.map(comDem), ...devisTous.map(comDevis)].filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
    const rdvDuJour = rdv0.map(d => d.data).filter(r => r && r.clientId && r.type && !r.fait && r.date === aujourdHui && (!vis || !(r.commerciaux || []).length || r.commerciaux.some(n => vis.moi.has(nomCle(n)))) && (!com || !(r.commerciaux || []).length || (com !== '—' && r.commerciaux.includes(com))));
    res.set('Cache-Control', 'no-store').json({
      com, commerciaux, siennes: !!vis,
      nouvellesTous: demandesTous.filter(d => aTraiterSrv(d) && (!vis || vis.demandes.has(d.id))).length,
      nouvelles: demandes.filter(aTraiterSrv).length,
      parStatut,
      caSigneMoisCents: signes.filter(d => moisSigne(d) === mois).reduce((t, d) => t + totaux(d).ttcCents, 0),
      caSigneCents: signes.reduce((t, d) => t + totaux(d).ttcCents, 0),
      caSigneAnneeCents: signes.filter(d => moisSigne(d).startsWith(mois.slice(0, 4))).reduce((t, d) => t + totaux(d).ttcCents, 0),
      serieCa: serie,
      devisEnAttenteCents: enAttente.reduce((t, d) => t + totaux(d).ttcCents, 0),
      devisEnAttente: enAttente.length,
      facturesImpayeesCents: factures.filter(f => f.type !== 'avoir' && !f.annuleeParAvoir).reduce((t, f) => t + FAC.etat(f).resteCents, 0),
      facturesImpayees: factures.filter(f => f.type !== 'avoir' && !f.annuleeParAvoir && FAC.etat(f).resteCents > 0).length,
      tauxSignature: tranches.length ? Math.round(100 * signes.length / tranches.length) : null,
      signes: signes.length, tranches: tranches.length,
      prochains: demandes.filter(d => d.evenement?.date >= aujourdHui && ['accord', 'reserve'].includes(d.statut)).sort((a, b) => a.evenement.date.localeCompare(b.evenement.date)).slice(0, 6).map(d => { const m = devisDe(d.id).find(x => x.statut === 'accepte'); return { id: d.id, date: d.evenement.date, nom: d.contact?.nom, type: d.evenement.type || '', ville: d.evenement.ville || '', invites: d.evenement.invites, statut: d.statut, montantCents: m ? totaux(m).ttcCents : d.totalEstimeCents || null, commercial: comDem(d) }; }),
      anniversaires: await anniversaires(14),
      rdvJour: rdvDuJour.sort((a, b) => a.heure.localeCompare(b.heure)).map(r => ({ id: r.id, clientId: r.clientId, clientNom: r.clientNom, type: r.type, heure: r.heure, motif: r.motif, lien: r.lien, commerciaux: r.commerciaux })),
      aRelancer: devis.filter(d => d.statut === 'envoye' && d.envoyeLe && Date.now() - Date.parse(d.derniereRelance || d.envoyeLe) > 3 * 86400e3).map(d => ({ id: d.id, numero: d.numero, client: d.clientNom, envoyeLe: d.envoyeLe, jours: Math.floor((Date.now() - Date.parse(d.derniereRelance || d.envoyeLe)) / 86400e3), montantCents: totaux(d).ttcCents, commercial: comDevis(d) })),
    });
  }));

  /* statistiques par rubrique : marge moyenne du catalogue + ventes signées des 12 derniers mois (server/statistiques.js) */
  A.get('/statistiques', wrap(async (req, res) => {
    const [rub, prod, dv, li, dm] = await Promise.all([store.list('rubriques'), store.list('produits'), store.list('devis'), store.list('lieux'), store.list('demandes')]);
    const vis = await visibles(req); /* « seulement ses opportunités » : seulement ses devis */
    const devis = dv.map(d => ({ ...d.data, id: d.data?.id || d.id })).filter(v => !vis || vis.devis.has(v.id));
    const demandesL = dm.map(d => ({ ...d.data, id: d.data?.id || d.id })).filter(d => !vis || vis.demandes.has(d.id));
    const sources = SRC.parSource({ demandes: demandesL, devis, clients: (await annuaireServeur()).canaux, totaux });
    const affaires = await affairesVisibles(req);
    const factTl = await facturesTlVisibles(req), annu = await annuaireServeur();
    const historiqueStats = affaires.length || factTl.length ? { ...(affaires.length ? HIST.statistiques(affaires, { clients: annu.canaux }) : { vide: true, ans: [], parAn: [], parMois: [], parMoisEvt: [], sources: [], commerciaux: [], evenements: [], lieux: [], motifs: [], meilleurs: [], endormis: [], reviennent: [], total: null }), factures: HIST.statsFactures(factTl, { clients: annu.canaux }) } : null;
    res.set('Cache-Control', 'no-store').json({ ...STATS.statistiques({ rubriques: rub.map(d => d.data).filter(Boolean), produits: prod.map(d => d.data).filter(Boolean), lieux: li.map(d => d.data).filter(Boolean), devis }), sources, historique: historiqueStats, siennes: !!vis });
  }));

  A.get('/site', wrap(async (req, res) => res.json((await store.get('site/reglages')) || {})));
  /* chaque partie des réglages a son droit : tarifs = « Modifier les prix », coordonnées et banque = « Mon entreprise », alertes = « Gérer l'équipe » */
  const GARDE_SITE = { tarifs: 'prix', alertes: 'equipe', devisAuto: 'equipe', devisAutoSms: 'equipe', entreprise: 'entreprise', paiement: 'entreprise', adresse: 'entreprise', telephone: 'entreprise', email: 'entreprise' };
  const stable = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
  A.put('/site', sameSite, json, wrap(async (req, res) => {
    const before = (await store.get('site/reglages')) || {};
    const body = { ...(req.body || {}) }; delete body.updatedAt;
    const changes = Object.keys(body).filter(k => stable(body[k]) !== stable(before[k]));
    const refuses = changes.filter(k => !req.ctx.droits[GARDE_SITE[k] || 'site']);
    if (refuses.length && refuses.length === changes.length) return refus(res, GARDE_SITE[refuses[0]] || 'site');
    for (const k of refuses) { if (k in before) body[k] = before[k]; else delete body[k]; } /* le reste de l'écran est enregistré, la partie interdite reste telle quelle */
    await store.set('site/reglages', { ...before, ...body, updatedAt: new Date().toISOString() });
    cat.invalidate(); audit(req.ctx, 'réglages du site modifiés', 'site/reglages');
    res.json({ ok: true });
  }));

  /* code postal -> département, téléphone -> format SMS (comme pour les fiches importées) */
  function ficheClientNette(data, before) {
    if (typeof data.cp === 'string') { data.cp = data.cp.replace(/\s/g, ''); if (data.cp !== (before?.cp || '')) data.departement = departementDe(data.cp) || data.departement || ''; }
    if (typeof data.tel === 'string' && data.tel !== (before?.tel || '')) { const t = normTel(data.tel); data.telE164 = t?.ok ? t.e164 : ''; if (t?.ok) data.tel = t.tel; }
    if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();
    /* profil prestataire (métiers, DJ…) : listes propres, sans doublon */
    for (const k of ['metiers', 'djStyles']) if (k in data) { data[k] = PROFIL.uniques((Array.isArray(data[k]) ? data[k] : []).map(x => String(x || '').trim().slice(0, 60))).slice(0, 30); if (!data[k].length) delete data[k]; }
    for (const k of ['independant', 'permis', 'nePasContacter']) if (k in data && typeof data[k] !== 'boolean') data[k] = data[k] === 'on' || data[k] === 'true' || data[k] === true;
    if ('djDepuis' in data) { const an = String(data.djDepuis || '').match(/(19|20)\d{2}/); data.djDepuis = an ? an[0] : ''; }
    /* adresse et horaire de livraison + infos pour les livreurs (server/livraison-client.js) */
    if ('livraison' in data) { const l = LC.nette(data.livraison); if (l) data.livraison = l; else delete data.livraison; }
  }
  /* Prénom et Nom dans deux cases (Jean-Luc, 2026-11-26) : le nom affiché reste « Prénom NOM ».
     Si seul le nom complet a changé (IA, ancien écran), les deux cases sont recoupées à partir de lui. */
  function nomsClient(data, before) {
    const aParts = data.prenom !== undefined || data.nomFamille !== undefined;
    const pn = aParts ? nomPropre(data.prenom || '', data.nomFamille || '') : '';
    const partsAvant = before ? nomPropre(before.prenom || '', before.nomFamille || '') : '';
    if (aParts && pn && !(typeof data.nom === 'string' && before && data.nom !== before.nom && pn === partsAvant)) {
      data.nom = pn; data.prenom = nomPropre(data.prenom || '', ''); data.nomFamille = String(data.nomFamille || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('fr-FR');
      return;
    }
    if (typeof data.nom === 'string') { data.nom = nomPropre(data.nom); if (aParts || (before && data.nom !== before.nom)) { const d = decoupeNomClient(data.nom); data.prenom = d.prenom; data.nomFamille = d.nomFamille; } }
  }
  function decoupeNomClient(n) {
    const w = String(n || '').trim().split(/\s+/).filter(Boolean); if (w.length < 2) return { prenom: '', nomFamille: w[0] || '' };
    let i = w.findIndex((x, k) => k >= 1 && /\p{L}{2}/u.test(x) && x === x.toLocaleUpperCase('fr-FR')); if (i < 1) i = 1;
    return { prenom: w.slice(0, i).join(' '), nomFamille: w.slice(i).join(' ') };
  }
  /* listes de la fiche « Profil prestataire » : métiers et styles de DJ proposés, plus ceux déjà tapés */
  A.get('/actions/profil-contact', wrap(async (req, res) => {
    const { facettes } = await annuaireServeur();
    const avec = (base, vus) => [...base, ...vus.map(x => x[0]).filter(x => !base.includes(x)).sort((a, b) => a.localeCompare(b, 'fr'))];
    res.json({ metiers: avec(PROFIL.METIERS, facettes.metiers), djStyles: avec(PROFIL.DJ_STYLES, facettes.dj), contactDe: facettes.contactDe.map(x => x[0]) });
  }));
  /* ---------- import du fichier clients (Excel / CSV) ---------- */
  const importClients = creerImportClients({ store, log });
  importClients.routes(A, { sameSite, manager: peut('fichiers'), wrap, audit });
  /* ---------- historique commercial de l'ancien CRM (Teamleader) : affaires depuis 2017 (server/historique.js) ---------- */
  const historique = HIST.creerHistorique({ store, sources: { liste: () => SOURCES.liste(), ajouter: n => SOURCES.ajouter(n) }, log });
  historique.routes(A, { sameSite, manager: peut('fichiers'), wrap, audit });
  /* affaires visibles : toutes, ou « seulement ses opportunités » = les siennes et celles sans commercial */
  async function affairesVisibles(req) {
    const vis = await visibles(req);
    const L = (await store.list('affaires')).map(d => d.data).filter(Boolean);
    return vis ? L.filter(a => !nomCle(a.commercial) || vis.moi.has(nomCle(a.commercial))) : L;
  }
  /* factures de l'ancien CRM : seulement pour qui a le droit « Factures » */
  async function facturesTlVisibles(req) {
    if (!req.ctx.droits?.factures) return [];
    return (await store.list('facturesTl')).map(d => d.data).filter(Boolean);
  }

  /* ---------- entreprises : plusieurs contacts reliés à une même fiche entreprise (server/entreprises.js) ---------- */
  const ENT = creerEntreprises({ store, log, totaux });
  ENT.routes(A, { sameSite, json, wrap, audit });
  ENT.synchro().catch(e => log.warn?.('Entreprises : reprise impossible', e.message));
  /* ---------- clients : recherche et pages côté serveur (le fichier importé compte ~60 000 fiches) ---------- */
  const sansAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const telK = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
  let idxClients = null;
  async function annuaireServeur() {
    const v = (await Promise.all(['clients', 'demandes', 'devis', 'factures', 'affaires', 'facturesTl'].map(k => store.version(k)))).join('|') + '|' + new Date().toISOString().slice(0, 10);
    if (idxClients?.v === v) return idxClients;
    const [cl, dem, dv, fac, aff, ftl] = await Promise.all(['clients', 'demandes', 'devis', 'factures', 'affaires', 'facturesTl'].map(k => store.list(k)));
    const histoFac = HIST.parClientFactures(ftl.map(d => d.data).filter(Boolean));
    /* historique commercial (Teamleader) : a commandé, combien de fois, pour combien, quand */
    const histo = HIST.parClient(aff.map(d => d.data).filter(Boolean)), jourIci = new Date().toISOString().slice(0, 10);
    const nbDem = new Map(), lies = new Set(), extra = new Map(), commande = new Set();
    const plus = (id, t) => { if (!id) return; extra.set(id, (extra.get(id) || '') + ' ' + t); };
    for (const { data: d } of dem) { if (!d.clientId) continue; lies.add(d.clientId); if (d.type !== 'contact') nbDem.set(d.clientId, (nbDem.get(d.clientId) || 0) + 1); plus(d.clientId, [d.ref, d.contact?.nom, d.contact?.email].join(' ')); }
    for (const { data: d } of dv) { if (d.clientId) { lies.add(d.clientId); plus(d.clientId, d.numero); if (d.statut === 'accepte' || d.signature) commande.add(d.clientId); } }
    for (const { data: d } of fac) { if (d.clientId) { lies.add(d.clientId); plus(d.clientId, d.numero); if (d.type !== 'avoir' && !d.annulee && !d.annuleeParAvoir) commande.add(d.clientId); } }
    const items = cl.map(({ id, data: c }) => ({
      c: { ...c, id, journal: undefined, canal: SRC.canalClient(c) }, id, nb: nbDem.get(id) || 0, lie: lies.has(id) || histo.has(id) || histoFac.has(id) || (c.journal || []).length > 0,
      importe: c.source === 'import CRM', last: String(c.derniereActivite || ''), verrou: lies.has(id) || histo.has(id) || histoFac.has(id),
      /* « Clients » (Jean-Luc, 2026-11-26) : toutes les personnes sans entreprise renseignée, qu'elles aient commandé ou non */
      acheteur: !c.entrepriseId && !String(c.societe || '').trim(),
      hay: sansAcc(texteFiche(c) + ' ' + (extra.get(id) || '')),
      tels: [c.tel, c.telE164, c.telAutre].map(telK).filter(Boolean),
      k: { ...critereClient(c), h: HIST.critere(histo.get(id), jourIci, histoFac.get(id)) },
      histo: histo.get(id) || null, fac: histoFac.get(id) || null,
    }));
    items.sort((a, b) => b.last.localeCompare(a.last));
    idxClients = { v, items, facettes: { ...facettesClients(items), histo: HIST.facettes(items.map(a => a.k.h)) }, canaux: new Map(items.map(a => [a.id, a.c])) };
    return idxClients;
  }
  /* recherche au clavier : TOUTES les cases de la fiche (anciennes et nouvelles), sauf les données techniques */
  const HORS_RECHERCHE = new Set(['id', 'journal', 'consentement', 'desinscrit', 'importId', 'importIds', 'importCree', 'telE164', 'entrepriseId', 'creeLe', 'derniereActivite', 'statutContact', 'caCrmCents', '_maj']);
  function texteFiche(c) {
    const out = [];
    const walk = v => { if (v == null || typeof v === 'boolean') return; if (Array.isArray(v)) v.forEach(walk); else if (typeof v === 'object') Object.values(v).forEach(walk); else out.push(String(v)); };
    for (const [k, v] of Object.entries(c || {})) if (!HORS_RECHERCHE.has(k)) walk(v);
    if (c?.civilite === 'Mme') out.push('madame'); if (c?.civilite === 'M.') out.push('monsieur');
    if (c?.independant) out.push('independant independante'); if (c?.permis) out.push('permis de conduire');
    if (c?.nePasContacter) out.push('ne pas contacter');
    return out.join(' ');
  }
  /* recherche multicritère de la liste Clients (listes déroulantes) */
  function critereClient(c) {
    const dep = String(c.departement || DIF.departement(c.cp) || '').toUpperCase();
    return {
      metiers: Array.isArray(c.metiers) ? c.metiers : [], dj: Array.isArray(c.djStyles) ? c.djStyles : [], contactDe: String(c.contactDe || '').trim(), fonction: String(c.fonction || '').replace(/\s+/g, ' ').trim(),
      dep, civ: c.civilite === 'Mme' || c.civilite === 'M.' ? c.civilite : '', pro: !!String(c.societe || '').trim(),
      email: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(c.email || '').trim()), mobile: !!DIF.mobile(c.telE164 || c.tel),
      stopEmail: !!c.desinscrit?.email, stopSms: !!c.desinscrit?.sms, npc: !!c.nePasContacter || !!(c.desinscrit?.email && c.desinscrit?.sms),
      indep: c.independant === true, permis: c.permis === true, ville: String(c.ville || '').trim(), canal: SRC.canalClient(c),
    };
  }
  function facettesClients(items) {
    const m = { metiers: new Map(), dj: new Map(), contactDe: new Map(), dep: new Map(), canal: new Map(), fonction: new Map() };
    const n = (map, x) => { if (x) map.set(x, (map.get(x) || 0) + 1); };
    for (const { k } of items) { k.metiers.forEach(x => n(m.metiers, x)); k.dj.forEach(x => n(m.dj, x)); n(m.contactDe, k.contactDe); n(m.dep, k.dep); n(m.canal, k.canal); n(m.fonction, k.fonction); }
    const tri = map => [...map].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr'));
    return {
      metiers: tri(m.metiers), dj: tri(m.dj), canal: tri(m.canal), sansCanal: items.filter(a => !a.k.canal).length, contactDe: tri(m.contactDe), fonction: tri(m.fonction).slice(0, 300), dep: [...m.dep].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true })),
      indep: items.filter(a => a.k.indep).length, permis: items.filter(a => a.k.permis).length, npc: items.filter(a => a.k.npc).length,
    };
  }
  const CRIT_CLIENTS = [...HIST.CRITERES, 'canal', 'metier', 'dj', 'contactDe', 'fonction', 'dep', 'civ', 'pro', 'joignable', 'indep', 'permis', 'npc'];
  function filtrerCriteres(items, q) {
    const v = x => String(q[x] || '').slice(0, 80);
    if (!CRIT_CLIENTS.some(x => v(x))) return items;
    return items.filter(({ k }) => {
      if (v('metier') && !(v('metier') === '*' ? k.metiers.length : k.metiers.includes(v('metier')))) return false;
      if (v('dj') && !k.dj.includes(v('dj'))) return false;
      if (v('contactDe') && k.contactDe !== v('contactDe')) return false;
      if (v('fonction') && sansAcc(k.fonction) !== sansAcc(v('fonction'))) return false;
      if (v('canal') && k.canal !== (v('canal') === 'aucune' ? '' : v('canal'))) return false;
      if (v('dep') && !(v('dep') === 'idf' ? ['75', '77', '78', '91', '92', '93', '94', '95'].includes(k.dep) : v('dep') === 'aucun' ? !k.dep : k.dep === v('dep'))) return false;
      if (v('civ') && k.civ !== (v('civ') === 'aucune' ? '' : v('civ'))) return false;
      if (v('pro') === 'pro' && !k.pro) return false;
      if (v('pro') === 'part' && k.pro) return false;
      const j = v('joignable');
      if (j === 'email' && !(k.email && !k.stopEmail)) return false;
      if (j === 'sms' && !(k.mobile && !k.stopSms)) return false;
      if (j === 'les2' && !(k.email && !k.stopEmail && k.mobile && !k.stopSms)) return false;
      if (j === 'aucun' && ((k.email && !k.stopEmail) || (k.mobile && !k.stopSms))) return false;
      if (v('indep') && !k.indep) return false;
      if (v('permis') && !k.permis) return false;
      if (v('npc') === 'oui' && !k.npc) return false;
      if (v('npc') === 'non' && k.npc) return false;
      if (!HIST.filtre(k.h, q)) return false;
      return true;
    });
  }
  function filtrerClients(items, q) {
    const words = sansAcc(q).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    const chiffres = String(q).replace(/[\s.+()-]/g, '');
    if (/^\d{3,}$/.test(chiffres)) { const k = chiffres.length >= 9 ? chiffres.slice(-9) : chiffres.replace(/^0+/, ''); const l = items.filter(a => a.tels.some(t => t.includes(k)) || a.hay.includes(chiffres)); if (l.length) return l; }
    return items.filter(a => words.every(w => a.hay.includes(w) || (/^\d{3,}$/.test(w) && a.tels.some(t => t.includes(w.replace(/^0+/, ''))))));
  }
  A.get('/clients', wrap(async (req, res, next) => {
    const q = req.query;
    if (q.q === undefined && q.page === undefined && !q.vue && !q.ids) return next();
    const { items, facettes } = await annuaireServeur();
    res.set('Cache-Control', 'no-store');
    /* clients « en activité » : tous, sauf les contacts importés qui n'ont encore ni demande, ni devis, ni note */
    if (q.vue === 'actifs') return res.json(items.filter(a => !a.importe || a.lie).map(a => a.c));
    if (q.ids) { const ids = new Set(String(q.ids).split(',').slice(0, 200)); return res.json(items.filter(a => ids.has(a.id)).map(a => a.c)); }
    let l = filtrerCriteres(filtrerClients(items, String(q.q || '').slice(0, 80)), q);
    if (q.vue === 'clients') l = l.filter(a => a.acheteur);
    /* tri par colonne sur toute la liste (Jean-Luc, 2026-11-26) ; cases vides toujours à la fin */
    const TRI = { nom: a => a.c.nom, societe: a => a.c.societe, contact: a => a.c.email || a.c.tel, ville: a => a.c.ville || a.c.cp, demandes: a => a.nb, activite: a => a.last, commandes: a => a.k.h.cmd, montant: a => a.k.h.ca, derniere: a => a.histo?.derniere || '' };
    if (TRI[q.tri] && !(q.tri === 'activite' && q.sens !== 'asc')) {
      const f = TRI[q.tri], sens = q.sens === 'desc' ? -1 : 1, col = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
      const vide = v => v === '' || v == null || (['demandes', 'commandes', 'montant'].includes(q.tri) && !v);
      l = [...l].sort((x, y) => { const a = f(x), b = f(y), va = vide(a), vb = vide(b); if (va || vb) return va === vb ? 0 : va ? 1 : -1; return sens * (typeof a === 'number' ? a - b : col.compare(String(a).trim(), String(b).trim())); });
    }
    if (q.filtre === 'importes') l = l.filter(a => a.importe); else if (q.filtre === 'autres') l = l.filter(a => !a.importe);
    const par = Math.min(200, Math.max(10, parseInt(q.par, 10) || 50)), page = Math.max(1, parseInt(q.page, 10) || 1);
    res.json({ total: l.length, tous: items.length, importes: items.filter(a => a.importe).length, acheteurs: items.filter(a => a.acheteur).length, entreprises: await ENT.nombre(), facettes, page, par, items: l.slice((page - 1) * par, page * par).map(a => ({ ...a.c, nbDemandes: a.nb, verrou: a.verrou, histo: a.histo ? { commandes: a.histo.commandes, perdues: a.histo.perdues, caHtCents: a.histo.caHtCents, derniere: a.histo.derniere } : null, fac: a.fac ? { factures: a.fac.factures, netHtCents: a.fac.netHtCents, duCents: a.fac.duCents } : null })), effacables: q.ids === undefined && q.avecIds ? l.filter(a => !a.verrou).map(a => a.id) : undefined });
  }));

  /* effacer des contacts cochés (Jean-Luc, 2026-11-24) : jamais un contact qui a une demande, un devis ou une facture ;
     chaque effacement est gardé dans _effacements/<id> pour pouvoir tout remettre */
  /* supprimer des produits cochés dans le catalogue (Jean-Luc 2026-11-25) : fiches gardées dans un lot pour « Annuler »,
     pierre tombale pour qu'elles ne reviennent jamais (redémarrage, reprises) ; retirées des incontournables de l'accueil */
  A.post('/actions/produits/supprimer', sameSite, json, peut('produits'), wrap(async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter(x => /^[A-Za-z0-9_-]{1,120}$/.test(x)))].slice(0, 5000);
    if (!ids.length) return res.status(400).json({ error: 'Aucun produit coché.' });
    const lot = 'ps_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + rid(5).replace(/[^A-Za-z0-9]/g, 'x');
    const at = new Date().toISOString(), par = req.ctx.name || req.ctx.email || '';
    const fiches = [];
    for (const id of ids) {
      const p = await store.get('produits/' + id);
      if (!p) continue;
      fiches.push({ id, data: p });
      await store.set('_produitsSupprimes/' + id, { id, at, par, lot, titre: p.titre || '' });
      produitsSupprimes.add(id);
      await store.delete('produits/' + id);
    }
    if (!fiches.length) return res.status(404).json({ error: 'Ces produits n’existent plus.' });
    await store.set('_effacementsProduits/' + lot, { id: lot, at, par, statut: 'supprimé', fiches });
    const reg = await store.get('site/reglages');
    const inc = reg?.accueil?.incontournables;
    if (Array.isArray(inc) && inc.some(s => produitsSupprimes.has(s))) await store.set('site/reglages', { ...reg, accueil: { ...reg.accueil, incontournables: inc.filter(s => !produitsSupprimes.has(s)) } });
    cat.invalidate();
    audit(req.ctx, 'produits supprimés', '_effacementsProduits/' + lot, fiches.map(f => f.data.titre || f.id).join(', ').slice(0, 500));
    await store.flush?.();
    res.json({ ok: true, lot, supprimes: fiches.length });
  }));
  A.post('/actions/produits/supprimer/:lot/remettre', sameSite, peut('produits'), wrap(async (req, res) => {
    const lot = String(req.params.lot), doc = await store.get('_effacementsProduits/' + lot);
    if (!doc || doc.statut !== 'supprimé') return res.status(404).json({ error: 'Rien à remettre.' });
    let remis = 0;
    for (const { id, data } of doc.fiches || []) {
      produitsSupprimes.delete(id); await store.delete('_produitsSupprimes/' + id);
      if (!(await store.get('produits/' + id))) { await store.set('produits/' + id, data); remis++; }
    }
    await store.set('_effacementsProduits/' + lot, { ...doc, statut: 'remis', remisLe: new Date().toISOString() });
    cat.invalidate(); audit(req.ctx, 'produits remis', '_effacementsProduits/' + lot, remis + ' fiche(s)');
    await store.flush?.();
    res.json({ ok: true, remis });
  }));
  A.post('/actions/effacer-clients', sameSite, peut('effacerContacts'), json, wrap(async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).filter(x => /^[A-Za-z0-9_-]{1,120}$/.test(x)))].slice(0, 100000);
    if (!ids.length) return res.status(400).json({ error: 'Aucun contact coché.' });
    const { items } = await annuaireServeur();
    const parId = new Map(items.map(a => [a.id, a]));
    const lot = 'eff_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + rid(5).replace(/[^A-Za-z0-9]/g, 'x');
    const gardes = [], effaces = [];
    for (const id of ids) {
      const a = parId.get(id);
      if (!a) continue;
      if (a.verrou) { gardes.push(a.c.nom || a.c.email || id); continue; }
      const c = await store.get('clients/' + id);
      if (!c) continue;
      await store.set('_effacements/' + lot + '/' + id, { id, data: c });
      await store.delete('clients/' + id);
      if (c.email) { const k = '_clientemail/' + sha(String(c.email).toLowerCase()); const ix = await store.get(k); if (ix?.id === id) await store.delete(k); }
      effaces.push(id);
    }
    if (effaces.length) {
      await store.set('_effacements/' + lot, { id: lot, at: new Date().toISOString(), par: req.ctx.name || req.ctx.email || '', nb: effaces.length, statut: 'effacé' });
      audit(req.ctx, 'contacts effacés', '_effacements/' + lot, `${effaces.length} contact(s)`);
      await store.flush?.();
    }
    res.json({ ok: true, lot: effaces.length ? lot : null, effaces: effaces.length, gardes: gardes.length, exemplesGardes: gardes.slice(0, 5) });
  }));
  A.post('/actions/effacer-clients/:lot/remettre', sameSite, peut('effacerContacts'), wrap(async (req, res) => {
    const lot = String(req.params.lot);
    const doc = await store.get('_effacements/' + lot);
    if (!doc || doc.statut !== 'effacé') return res.status(404).json({ error: 'Rien à remettre.' });
    let remis = 0;
    for (const { id, data } of await store.list('_effacements/' + lot)) {
      const cid = data?.id || id;
      if (data?.data && !(await store.get('clients/' + cid))) {
        await store.set('clients/' + cid, data.data);
        if (data.data.email) { const k = '_clientemail/' + sha(String(data.data.email).toLowerCase()); if (!(await store.get(k))) await store.set(k, { id: cid }); }
        remis++;
      }
      await store.delete('_effacements/' + lot + '/' + id);
    }
    await store.set('_effacements/' + lot, { ...doc, statut: 'remis', remisLe: new Date().toISOString() });
    audit(req.ctx, 'contacts remis', '_effacements/' + lot, `${remis} contact(s)`);
    await store.flush?.();
    res.json({ ok: true, remis });
  }));
  A.get('/actions/effacer-clients/historique', wrap(async (req, res) => {
    res.json((await store.list('_effacements')).map(d => d.data).filter(d => d?.statut).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10));
  }));

  /* ---------- source des demandes de devis (server/sources.js) ---------- */
  const SOURCES = SRC.creerSources({ store });
  /* demandes et devis : `canalAuto` = la source qui s'applique (la leur, sinon celle de la demande, sinon celle du client) */
  async function avecCanal(coll, docs) {
    if (coll !== 'demandes' && coll !== 'devis') return docs;
    const { canaux } = await annuaireServeur();
    const demById = coll === 'devis' ? new Map((await store.list('demandes')).map(x => [x.data?.id || x.id, { ...x.data, id: x.data?.id || x.id }])) : null;
    return docs.map(d => ({ ...d, canalAuto: coll === 'demandes' ? SRC.canalDemande(d, canaux.get(d.clientId)) : SRC.canalDevis(d, d.demandeId ? demById.get(d.demandeId) : null, canaux.get(d.clientId)) }));
  }
  A.get('/sources', wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store').json({ sources: await SOURCES.liste() });
  }));
  /* retirer une source de la liste déroulante : les fiches qui l'ont déjà la gardent */
  A.post('/sources/retirer', sameSite, json, wrap(async (req, res) => {
    const nom = SRC.propre(req.body?.nom);
    if (nom.toLowerCase() === 'site') return res.status(400).json({ error: '« Site » est posé automatiquement sur les demandes du site : il reste dans la liste.' });
    const sources = await SOURCES.retirer(nom);
    audit(req.ctx, 'source retirée', '_sources/liste', nom);
    res.json({ ok: true, sources });
  }));
  A.post('/sources', sameSite, json, wrap(async (req, res) => {
    const r = await SOURCES.ajouter(req.body?.nom);
    audit(req.ctx, 'source ajoutée', '_sources/liste', r.nom);
    res.json({ ok: true, nom: r.nom, sources: r.liste });
  }));

  A.get('/:coll', wrap(async (req, res, next) => {
    if (!COLLECTIONS.includes(req.params.coll)) return next();
    const vis = OPP.includes(req.params.coll) ? await visibles(req) : null;
    const docs = (await store.list(req.params.coll)).map(d => ({ id: d.id, ...d.data, _maj: d.updatedAt })).filter(d => !vis || vis[req.params.coll].has(d.id));
    res.set('Cache-Control', 'no-store').json(await avecCanal(req.params.coll, docs));
  }));
  A.get('/:coll/:id', wrap(async (req, res, next) => {
    if (!COLLECTIONS.includes(req.params.coll)) return next();
    const d = await store.get(req.params.coll + '/' + req.params.id);
    if (!d || !(await voitDoc(req, req.params.coll, req.params.id))) return res.status(404).json({ error: 'Introuvable.' });
    res.set('Cache-Control', 'no-store').json((await avecCanal(req.params.coll, [{ id: req.params.id, ...d }]))[0]);
  }));
  /* tous les montants « prix… » et « cout… » d'une fiche (variantes comprises) : sans le droit « Modifier les prix », ils ne doivent pas bouger */
  const empreintePrix = o => { const out = []; const walk = (x, ch) => { if (Array.isArray(x)) x.forEach((y, i) => walk(y, ch + '.' + i)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (/prix|cout/i.test(k) && (v == null || typeof v !== 'object')) { if (v != null && v !== '') out.push(ch + '.' + k + '=' + v); } else walk(v, ch + '.' + k); } }; walk(o, ''); return out.sort().join('|'); };
  A.put('/:coll/:id', sameSite, json, wrap(async (req, res, next) => {
    const { coll, id } = req.params;
    if (!COLLECTIONS.includes(coll) || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return next();
    if (coll === 'produits' && produitsSupprimes.has(id)) return res.status(410).json({ error: 'Ce produit a été supprimé du catalogue. Rechargez la page.' });
    const before = await store.get(coll + '/' + id);
    if (before && !(await voitDoc(req, coll, id))) return res.status(404).json({ error: 'Introuvable : ce dossier est suivi par un autre commercial.' });
    let data = { ...(req.body || {}) };
    delete data._maj; delete data.canalAuto;
    if ('canal' in data) data.canal = SRC.propre(data.canal);
    if (coll === 'produits' && before && !req.ctx.droits.prix && empreintePrix(data) !== empreintePrix(before)) return refus(res, 'prix');
    if (coll === 'devis') {
      if (before && before.statut === 'accepte' && !req.ctx.droits.devisSignes) return res.status(403).json({ error: 'Ce devis est signé : il faut le droit « Modifier un devis signé » pour le changer.' });
      const cDev = await cat.get();
      if (Array.isArray(data.lignes)) data.lignes = marquerPersonnel(data.lignes, cDev);
      if (Array.isArray(data.lignes) && !req.ctx.droits.admin) { /* livraison et personnel : seul un administrateur change leur prix ou les offre */
        const v = verrouLivraison(before, data.lignes, cDev.reglages?.tarifs || {});
        if (v.erreur) return res.status(403).json({ error: v.erreur });
        data.lignes = verrouPersonnel(before, v.lignes, cDev, cDev.reglages?.tarifs || {});
      }
      const err = controleMarge(data);
      if (err.length) return res.status(400).json({ error: 'Marge négative bloquée : ' + err.join(' ') });
      data.token = before?.token || data.token;
      if (before) { if (before.modele) data.modele = true; else delete data.modele; } /* ⭐ Modèle : changé seulement par son bouton (un devis ouvert avant ne l'efface pas) */
      if (before?.commentaires) data.commentaires = before.commentaires; /* écrits par le client : jamais effacés par un enregistrement du back-office */
    }
    if (coll === 'demandes' && before && data.statut && data.statut !== before.statut) data.historique = [...(before.historique || []), { at: new Date().toISOString(), statut: data.statut, par: req.ctx.name || req.ctx.email }];
    if (coll === 'demandes' && before) {
      if (before.priseEnCharge && !data.priseEnCharge) data.priseEnCharge = before.priseEnCharge;
      const bouge = (data.statut && data.statut !== before.statut) || (data.commercial || '') !== (before.commercial || '') || (data.notes || '') !== (before.notes || '') || (data.relancesNotees || []).length !== (before.relancesNotees || []).length;
      if (bouge) data = priseDe(data, data.commercial && data.commercial !== before.commercial ? data.commercial : (req.ctx.name || req.ctx.email), data.commercial !== before.commercial ? 'attribution' : 'suivi');
    }
    if (coll === 'produits' && !data.slug) data.slug = id;
    if (coll === 'produits' || coll === 'rubriques') {
      /* cases Google : un texte tapé est gardé ; une case vide est remplie ; un produit renommé reçoit des textes à son nouveau nom */
      const garder = (o, b) => { if (o && !o.seoAuto && b?.seoAuto) o.seoAuto = b.seoAuto; if (o?.seoAuto && b && espacesSeo(b.titre || b.nom) !== espacesSeo(o.titre || o.nom)) { for (const [c, k] of [['seoTitre', 'titre'], ['seoDescription', 'description']]) if (k in o.seoAuto && o[c] === o.seoAuto[k]) o[c] = ''; o.seoAuto = { ...o.seoAuto, ia: false, essais: 0 }; } };
      garder(data, before);
      if (coll === 'rubriques') for (const x of Array.isArray(data.sous) ? data.sous : []) garder(x, (before?.sous || []).find(y => y.slug === x.slug));
      if (coll === 'produits') SEO.remplirProduit(data); else SEO.remplirRubrique(data);
    }
    /* fiche ouverte avant que l'IA écrive la description sous la photo : on ne l'efface pas en enregistrant */
    if (coll === 'produits' && before?.sousPhotoAuto?.texte && !data.sousPhotoAuto?.texte && sousPhotoVide(data)) { data.sousPhoto = before.sousPhoto; data.sousPhotoAuto = before.sousPhotoAuto; }
    if (coll === 'clients') nomsClient(data, before);
    if (coll === 'clients' && 'naissance' in data) data.naissance = dateNaissance(data.naissance);
    if (coll === 'clients') ficheClientNette(data, before);
    if (coll === 'clients') { await ENT.avantClient(data, before); profilsCache = null; } /* envois groupés : la fiche corrigée se voit tout de suite */
    if (coll === 'demandes' && typeof data.contact?.nom === 'string') data.contact = { ...data.contact, nom: nomPropre(data.contact.nom) };
    if (coll === 'clients') { if (before?.journal) data.journal = before.journal; else delete data.journal; } /* notes et appels de l'historique jamais effacés par une fiche ouverte avant */
    data.updatedAt = new Date().toISOString();
    await store.set(coll + '/' + id, data);
    /* source choisie sur une demande ou un devis : la fiche client qui n'en a pas encore la reçoit aussi */
    if ((coll === 'demandes' || coll === 'devis') && data.canal && data.clientId && data.canal !== (before?.canal || '')) {
      const cl = await store.get('clients/' + data.clientId);
      if (cl && !SRC.canalClient(cl)) await store.set('clients/' + data.clientId, { ...cl, canal: data.canal });
    }
    if (['produits', 'rubriques', 'lieux', 'avis', 'pages'].includes(coll)) cat.invalidate();
    if (coll === 'produits') setTimeout(lancerSeoIa, 2000).unref?.();
    /* fiche client corrigée (nom, société, e-mail, téléphone) : on reporte sur ses demandes, pour que le Suivi client affiche la même chose */
    if (coll === 'clients' && before) {
      for (const { data: dm } of await store.list('demandes')) {
        if (dm.clientId !== id) continue;
        const contact = { ...(dm.contact || {}), nom: data.nom || '', email: data.email || '', tel: data.tel || '', societe: data.societe || '' };
        if (JSON.stringify(contact) !== JSON.stringify(dm.contact || {})) await store.set('demandes/' + dm.id, { ...dm, contact });
      }
    }
    audit(req.ctx, before ? 'modification' : 'création', coll + '/' + id, data.titre || data.nom || data.numero || data.ref || '');
    res.json({ ok: true, id });
  }));
  A.post('/:coll', sameSite, json, wrap(async (req, res, next) => {
    const { coll } = req.params;
    if (!COLLECTIONS.includes(coll) || ['devis', 'factures', 'demandes'].includes(coll)) return next();
    let id = coll === 'produits' || coll === 'lieux' ? slugify(req.body?.titre || req.body?.nom) : coll === 'rubriques' ? slugify(req.body?.nom) : coll.slice(0, 1) + '_' + rid(7);
    if (await store.get(coll + '/' + id) || (coll === 'produits' && produitsSupprimes.has(id))) id = id + '-' + rid(3).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    const data = { ...(req.body || {}), createdAt: new Date().toISOString() };
    if (coll === 'produits' && !req.ctx.droits.prix) for (const k of Object.keys(data)) if (/prix|cout/i.test(k)) delete data[k]; /* nouvelle fiche sans prix : « Sur devis » */
    if (coll === 'clients') { nomsClient(data, null); data.id = id; }
    if (coll === 'clients' && 'naissance' in data) data.naissance = dateNaissance(data.naissance);
    if (coll === 'clients') ficheClientNette(data, null);
    if (coll === 'clients') await ENT.avantClient(data, null);
    if (coll === 'produits') Object.assign(data, { id, slug: id, statut: data.statut || 'masque', maison: true, photos: data.photos || [], description: data.description || [], sections: data.sections || [], groupes: [], variantes: [], details: [], regles: data.regles || { packs: true, personnel: 'service' }, ordre: -1 });
    if (coll === 'lieux') Object.assign(data, { slug: id, statut: data.statut || 'masque', photos: data.photos || [], equipements: data.equipements || [] });
    if (coll === 'rubriques') Object.assign(data, { slug: id, statut: data.statut || 'visible', ordre: data.ordre ?? 99, tva: data.tva || 10 });
    if (coll === 'produits') SEO.remplirProduit(data); if (coll === 'rubriques') SEO.remplirRubrique(data);
    await store.set(coll + '/' + id, data);
    cat.invalidate();
    if (coll === 'produits') setTimeout(lancerSeoIa, 2000).unref?.();
    audit(req.ctx, 'création', coll + '/' + id, data.titre || data.nom || '');
    res.json({ ok: true, id });
  }));
  A.delete('/:coll/:id', sameSite, wrap(async (req, res, next) => {
    const { coll, id } = req.params;
    if (!COLLECTIONS.includes(coll)) return next();
    if (['produits', 'lieux', 'rubriques'].includes(coll)) return res.status(400).json({ error: 'Pour le catalogue, on masque au lieu de supprimer.' });
    if (coll === 'devis' && !req.ctx.droits.effacerDevis) return refus(res, 'effacerDevis');
    if (!(await voitDoc(req, coll, id))) return res.status(404).json({ error: 'Introuvable.' });
    if (coll === 'factures') return res.status(400).json({ error: 'Une facture ne se supprime pas : créez un avoir.' });
    const before = await store.get(coll + '/' + id);
    if (coll === 'devis' && before) {
      /* un devis signé ou déjà facturé reste dans l'historique du client */
      if (before.statut === 'accepte') return res.status(400).json({ error: `Le devis ${before.numero} est signé : il ne peut pas être effacé.` });
      if ((await store.list('factures')).some(f => f.data.devisId === id)) return res.status(400).json({ error: `Le devis ${before.numero} a une facture : il ne peut pas être effacé.` });
    }
    if (before) await store.set('_corbeille/' + coll + '-' + id + '-' + Date.now(), { path: coll + '/' + id, data: before, par: req.ctx.name, at: new Date().toISOString() });
    await store.delete(coll + '/' + id);
    cat.invalidate();
    audit(req.ctx, 'suppression (corbeille)', coll + '/' + id);
    res.json({ ok: true });
  }));

  /* devis à partir d'une demande */
  A.post('/actions/devis-depuis-demande/:id', sameSite, wrap(async (req, res) => {
    const d = await store.get('demandes/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Demande introuvable.' });
    res.json({ ok: true, id: await devisDepuisDemande(d, req.ctx) });
  }));
  /* adresse et horaire de livraison du devis : ceux de la demande, sinon ceux de la fiche client (Jean-Luc, 2026-11-26) */
  function evLivraison(d, cl) {
    const e = d.evenement || {}, a = cl ? LC.adresseLivraison(cl) : {};
    const memeVille = !e.cp || !a.cp || a.cp === e.cp;
    return { adresse: e.adresse || (memeVille ? a.adresse || '' : ''), cp: e.cp || a.cp || '', ville: e.ville || a.ville || '', horaire: e.horaire || a.horaire || '', livreurs: cl ? LC.infosLivreurs(cl.livraison) : '' };
  }
  async function devisDepuisDemande(d, ctx, extra = {}) {
    await prendreEnCharge(x => x.id === d.id, ctx?.name || ctx?.email, 'devis créé');
    const c = await cat.get();
    const T = c.reglages.tarifs || {};
    const id = 'v_' + rid(8), token = rid(18);
    const numero = await prochainNumero(store, 'devis');
    const validite = new Date(Date.now() + (T.validiteDevisJours || 15) * 86400e3).toISOString().slice(0, 10);
    const devis = {
      id, numero, token, demandeId: d.id, clientId: d.clientId, clientNom: d.contact?.nom || '', statut: 'brouillon',
      evenement: { type: d.evenement?.type, date: d.evenement?.date, invites: d.evenement?.invites, ...evLivraison(d, await store.get('clients/' + d.clientId).catch(() => null)) },
      intro: `Madame, Monsieur, suite à votre demande, voici notre proposition pour votre ${String(d.evenement?.type || 'événement').toLowerCase()}.`,
      lignes: lignesDepuisDemande(d, c, T), remiseCents: 0, acomptePct: null, validiteJusquau: validite,
      conditions: 'Prix TTC. Acompte à la signature, solde au plus tard 7 jours avant l’événement. Nombre définitif d’invités à confirmer 7 jours avant.',
      lienPaiement: '', createdAt: new Date().toISOString(), creePar: ctx.name,
    };
    Object.assign(devis, extra);
    await store.set('devis/' + id, devis);
    await store.set('_devistoken/' + sha(token), { id });
    audit(ctx, 'devis créé', 'devis/' + id, numero);
    return id;
  }
  /* ---------- commande préparée par l'IA (Suivi client › « ✨ Commande avec l'IA ») ---------- */
  const iaLimit = limiter(+(env.AI_LIMIT_PER_HOUR || 300), 3600e3);
  const iaErreur = (res, e) => res.status(e.code === 'not_granted' ? 503 : 502).json({ error: e.code === 'not_granted' ? 'L’IA n’est pas encore activée : ajoutez la variable ANTHROPIC_API_KEY dans Railway.' : e.code === 'refused' ? 'L’IA a refusé cette demande. Reformulez le texte.' : 'L’IA n’a pas répondu correctement. Réessayez.', code: e.code || 'ai_failed' });
  A.get('/ia/etat', wrap(async (req, res) => { const R = (await cat.get()).reglages; res.json({ actif: ia.actif, evenements: R.evenements || [], tarifs: { ...(R.tarifs || {}), livraisonPaliers: LIVR.paliers(R.tarifs) }, origine: R.origine || null }); }));
  A.post('/ia/fiche', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const texte = s(req.body?.texte, 6000);
    if (texte.length < 5) return res.status(400).json({ error: 'Écrivez ou dictez d’abord les infos du client.' });
    const R = (await cat.get()).reglages, evts = R.evenements || [];
    try { res.json({ fiche: IA.nettoyerFiche(IA.json(await ia.demander(IA.promptFiche(texte, evts, new Date().toISOString().slice(0, 10)))), evts) }); }
    catch (e) { iaErreur(res, e); }
  }));
  A.post('/ia/produits', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const c = await cat.get(), compact = IA.catalogueCompact(c);
    const fiche = IA.nettoyerFiche(req.body?.fiche || {}, c.reglages.evenements || []);
    const fichePourIa = { type: fiche.type, date: fiche.date, horaire: fiche.horaire, invites: fiche.invites, ville: fiche.ville, budgetTTC: fiche.budget, precisions: fiche.notes };
    /* l'IA part d'abord des anciens devis les plus proches (signés en priorité), puis ajoute les compléments souvent pris avec */
    const { vis, liste } = await tousLesDevis(req), texte = s(req.body?.texte, 6000);
    const prox = ANC.proches(liste, { type: fiche.type, invites: fiche.invites, budgetCents: (+fiche.budget || 0) * 100, texte: [texte, fiche.notes].join(' ') }, 3);
    const anciens = prox.map(x => ({ numero: x.d.numero, statut: x.d.statut === 'accepte' ? 'signé' : 'non signé', modele: !!x.d.modele, type: x.d.evenement?.type || '', invites: +x.d.evenement?.invites || null,
      lignes: (x.d.lignes || []).filter(l => l.produit && compact.visibles.some(p => p.slug === l.produit)).map(l => ({ slug: l.produit, qte: l.qte })) })).filter(x => x.lignes.length);
    try {
      const rep = IA.json(await ia.demander(IA.promptProduits(fichePourIa, texte, compact, c.reglages.tarifs || {}, anciens), { effort: 'medium', maxTokens: 6000 }));
      const articles = IA.nettoyerArticles(Array.isArray(rep) ? rep : rep?.articles, c, compact.visibles);
      const b = !Array.isArray(rep) && rep?.base ? prox.find(x => x.d.numero === String(rep.base).trim()) : null;
      const comp = ANC.complements(liste, articles.map(a => ({ produit: a.slug, designation: a.titre })), c).filter(x => x.slug);
      res.json({ articles, base: b ? carteDe(vis, b.d, { pourquoi: b.pourquoi }) : null, complements: comp });
    }
    catch (e) { iaErreur(res, e); }
  }));
  /* « ✨ Proposer avec l'IA » à côté des cases Google (produit, rubrique ou spécialité) : propose, n'enregistre rien */
  A.post('/ia/seo', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const b = req.body || {}, type = ['produit', 'rubrique', 'sous'].includes(b.type) ? b.type : 'produit';
    const c = await cat.get();
    const nomsRub = Object.fromEntries(c.rubriques.map(r => [r.slug, r.nom])), nomsSous = Object.fromEntries(c.rubriques.flatMap(r => (r.sous || []).map(x => [x.slug, x.nom])));
    let item, modele;
    if (type === 'produit') {
      const p = { ...((await store.get('produits/' + s(b.id, 120))) || {}), ...(b.titre ? { titre: s(b.titre, 200) } : {}), ...(b.extrait ? { extrait: s(b.extrait, 600) } : {}) };
      if (!p.titre) return res.status(404).json({ error: 'Produit introuvable.' });
      item = SEO.infosIa({ ...p, slug: s(b.id, 120) }, nomsRub, nomsSous); modele = SEO.modeleProduit(p);
    } else {
      const r = c.rubriques.find(x => x.slug === s(b.rubrique, 120));
      const x = type === 'sous' ? { ...((r?.sous || []).find(y => y.slug === s(b.slug, 120)) || {}), slug: s(b.slug, 120) } : { ...(r || {}) };
      if (b.nom) x.nom = s(b.nom, 200); if (b.chapo) x.chapo = s(b.chapo, 1000);
      if (!x.nom) return res.status(404).json({ error: 'Rubrique introuvable.' });
      const nb = c.produits.filter(p => p.rubrique === r?.slug && (type === 'rubrique' || p.sous === x.slug) && p.statut !== 'masque');
      item = { slug: x.slug || 'page', nom: x.titrePage || x.nom, rubrique: type === 'sous' ? 'page de la spécialité (rubrique ' + (r?.nom || '') + ')' : 'page de la rubrique', specialite: '', prix: '', infos: [x.chapo, 'Exemples : ' + nb.slice(0, 15).map(p => p.titre).join(', ')].filter(Boolean).join(' ').slice(0, 600) };
      modele = type === 'sous' ? SEO.modeleSous(x) : SEO.modeleRubrique(x);
    }
    if (!ia.actif) return res.json({ ...modele, ia: false });
    try {
      const rep = IA.json(await ia.demander(SEO.promptSeo([item]), { effort: 'low', maxTokens: 1500 }));
      const r = (Array.isArray(rep) ? rep[0] : rep) || {};
      res.json({ titre: SEO.titreValide(r.titre) || modele.titre, description: SEO.descriptionValide(r.description) || modele.description, ia: true });
    } catch (e) { res.json({ ...modele, ia: false }); }
  }));
  /* « ✨ Améliorer avec l'IA » à côté de la Description / de la Description sous la photo : propose, n'enregistre rien */
  A.post('/ia/texte-produit', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const b = req.body || {}, champ = b.champ === 'sousPhoto' ? 'sousPhoto' : 'description';
    const p = await store.get('produits/' + s(b.id, 120));
    if (!p) return res.status(404).json({ error: 'Produit introuvable.' });
    const c = await cat.get();
    const nomsRub = Object.fromEntries(c.rubriques.map(r => [r.slug, r.nom])), nomsSous = Object.fromEntries(c.rubriques.flatMap(r => (r.sous || []).map(x => [x.slug, x.nom])));
    const lignes = (Array.isArray(b.lignes) ? b.lignes : String(b.lignes || '').split('\n')).map(x => s(x, 1500)).filter(Boolean).slice(0, 40);
    const fiche = { ...p, ...(b.titre ? { titre: s(b.titre, 200) } : {}), ...(champ === 'sousPhoto' && b.description ? { description: String(b.description).split('\n').map(x => s(x, 1500)).filter(Boolean) } : {}) };
    try {
      const rep = IA.json(await ia.demander(TXT.promptAmeliorer(TXT.infosProduit({ ...fiche, slug: s(b.id, 120) }, nomsRub, nomsSous), champ, lignes), { effort: 'medium', maxTokens: 6000 }));
      const l = TXT.lignesValides(rep?.lignes, champ);
      if (!l) return res.status(502).json({ error: 'La proposition de l’IA ne convenait pas (trop longue ou mention interdite). Réessayez.' });
      res.json({ lignes: l });
    } catch (e) { iaErreur(res, e); }
  }));
  A.post('/ia/modifier-devis', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const consigne = s(req.body?.consigne, 3000);
    if (consigne.length < 3) return res.status(400).json({ error: 'Écrivez ce que l’IA doit changer.' });
    const c = await cat.get(), compact = IA.catalogueCompact(c), T = c.reglages.tarifs || {};
    const etat = { lignes: (Array.isArray(req.body?.lignes) ? req.body.lignes : []).slice(0, 300), evenement: req.body?.evenement || {}, remiseCents: Math.max(0, Math.round(+req.body?.remiseCents || 0)) };
    try {
      const rep = IA.json(await ia.demander(IA.promptModif({ ...etat, consigne, compact, tarifs: T }), { effort: 'medium', maxTokens: 4000 }));
      res.json(IA.appliquerModif(rep, etat, c, compact.visibles, T));
    } catch (e) { iaErreur(res, e); }
  }));
  A.post('/actions/commande-ia', sameSite, json, wrap(async (req, res) => {
    const c = await cat.get(), T = c.reglages.tarifs || {};
    const f = IA.nettoyerFiche(req.body?.fiche || {}, c.reglages.evenements || []);
    const nom = nomPropre(f.prenom || '', f.nom || '');
    if (!nom) return res.status(400).json({ error: 'Indiquez au moins le nom du client.' });
    if (f.email && !isEmail(f.email)) return res.status(400).json({ error: 'L’e-mail du client n’est pas valide.' });
    const { visibles } = IA.catalogueCompact(c);
    const articles = IA.nettoyerArticles(req.body?.articles, c, visibles);
    if (!articles.length) return res.status(400).json({ error: 'Cochez au moins une prestation.' });
    /* client : retrouvé par son e-mail (seules les cases vides sont complétées), sinon créé */
    const now = new Date().toISOString(), canalIa = SRC.propre(req.body?.canal);
    let clientId = null;
    if (f.email) {
      const idx = await store.get('_clientemail/' + sha(f.email)), cl = idx && await store.get('clients/' + idx.id);
      const lv0 = cl?.livraison, livVide = !lv0 || !(lv0.identique || lv0.adresse || lv0.cp || lv0.ville || lv0.horaire);
      if (cl) { clientId = idx.id; await store.set('clients/' + clientId, { ...cl, nom: cl.nom || nom, tel: cl.tel || f.tel, societe: cl.societe || f.societe, adresse: cl.adresse || f.adresse, ...(livVide && (f.adresse || f.cp || f.horaire) ? { livraison: LC.nette({ adresse: f.adresse, cp: f.cp, ville: f.ville, horaire: f.horaire }) } : {}), derniereActivite: now, ...(canalIa && !SRC.canalClient(cl) ? { canal: canalIa } : {}) }); }
    }
    if (!clientId) {
      clientId = 'c_' + rid(8);
      await store.set('clients/' + clientId, { id: clientId, nom, prenom: nomPropre(f.prenom || '', ''), nomFamille: String(f.nom || '').trim().toLocaleUpperCase('fr-FR'), genre: 'client', email: f.email, tel: f.tel, societe: f.societe, adresse: f.adresse, cp: f.cp || '', ville: f.ville || '', livraison: LC.nette({ identique: true, horaire: f.horaire }), notes: '', creeLe: now, derniereActivite: now, source: 'téléphone (IA)', ...(canalIa ? { canal: canalIa } : {}) });
      if (f.email) await store.set('_clientemail/' + sha(f.email), { id: clientId });
    }
    /* plats à supplément (coq roussi + 5 € la part) retrouvés dans la note de l'IA : ligne « Supplément » sur le devis */
    const lignes = articles.map(a => { const p = c.bySlug.get(a.slug), choix = choixDepuisNote(a.note, p, a.qte), est = estimerLigne({ qte: a.qte, choix }, p, T);
      return { slug: a.slug, titre: a.titre, rubrique: a.rubrique, unite: a.unite, qte: a.qte, prixCents: a.prixCents, supCents: 0, supplements: est.supplements,
        totalCents: (a.prixCents || 0) * a.qte + totalSupplements(est.supplements), surDevis: a.prixCents == null, variante: '', choix, resume: '', note: a.note, personnel: null, pack: null }; });
    if (f.serveurs) lignes[0].personnel = { nb: f.serveurs, heures: Math.max(T.personnel?.minHeures || 4, +f.heures || 0) };
    if (f.vaisselle && (T.packs || []).some(x => x.id === f.vaisselle)) lignes[0].pack = { id: f.vaisselle, nb: +f.invites || lignes[0].qte };
    const km = Math.min(2000, Math.max(0, Math.round(+req.body?.km || 0)));
    const sousTotal = lignes.reduce((t, l) => t + l.totalCents, 0), hz = LIVR.horsZone(f.cp), kmC = hz ? 0 : LIVR.kmCents(T, sousTotal), offerte = !!(km && !hz && kmC === 0);
    const id = 'd_' + rid(8), ref = await prochainNumero(store, 'demande'), par = req.ctx.name || req.ctx.email || 'équipe';
    const demande = {
      id, ref, type: 'devis', source: 'Téléphone (IA)', ...(canalIa ? { canal: canalIa } : {}), clientId, contact: { nom, email: f.email, tel: f.tel, societe: f.societe },
      evenement: { type: f.type, date: f.date, invites: +f.invites || 0, cp: f.cp, ville: f.ville, adresse: f.adresse, horaire: f.horaire },
      livraison: km ? { km, kmCents: kmC, cents: km * kmC, ...(offerte ? { offerte: true } : {}), ...(hz ? { horsZone: true } : {}) } : null,
      lignes, sousTotalCents: sousTotal, totalEstimeCents: sousTotal + km * kmC,
      message: [f.notes, 'Commande préparée avec l’IA à partir de : ' + s(req.body?.texte, 6000)].filter(Boolean).join('\n\n'), statut: 'demande',
      historique: [{ at: now, statut: 'demande', par }], createdAt: now, commercial: par, priseEnCharge: { at: now, par, quoi: 'commande prise par l’équipe' },
    };
    await store.set('demandes/' + id, demande);
    audit(req.ctx, 'commande préparée avec l’IA', 'demandes/' + id, ref);
    const devisId = await devisDepuisDemande(demande, req.ctx, { iaDraft: true, ...(req.body?.base ? { inspireDe: s(req.body.base, 40) } : {}) });
    res.json({ ok: true, demandeId: id, devisId, ref });
  }));
  /* plusieurs devis pour un même client : copie d'un devis (lignes, événement, textes) en nouveau brouillon */
  A.post('/actions/dupliquer-devis/:id', sameSite, json, wrap(async (req, res) => {
    const src = await store.get('devis/' + req.params.id);
    if (!src) return res.status(404).json({ error: 'Devis introuvable.' });
    const T = (await cat.get()).reglages.tarifs || {};
    const id = 'v_' + rid(8), token = rid(18);
    const numero = await prochainNumero(store, 'devis');
    const copie = { id, numero, token, clientId: src.clientId || null, clientNom: src.clientNom || '', demandeId: src.demandeId || null, statut: 'brouillon',
      evenement: { ...(src.evenement || {}) }, lignes: (src.lignes || []).map(l => ({ ...l })), remiseCents: src.remiseCents || 0, remisePct: src.remisePct ?? null, acomptePct: src.acomptePct ?? null,
      commercial: src.commercial, titre: src.titre || '', intro: src.intro || '', conditions: src.conditions || '', lienPaiement: src.lienPaiement || '', copieDe: src.numero,
      validiteJusquau: new Date(Date.now() + (T.validiteDevisJours || 15) * 86400e3).toISOString().slice(0, 10), createdAt: new Date().toISOString(), creePar: req.ctx.name };
    await store.set('devis/' + id, copie);
    await store.set('_devistoken/' + sha(token), { id });
    audit(req.ctx, 'devis dupliqué', 'devis/' + id, `${numero} (copie de ${src.numero})`);
    res.json({ ok: true, id, numero });
  }));
  A.post('/actions/devis-vierge', sameSite, json, wrap(async (req, res) => {
    const T = (await cat.get()).reglages.tarifs || {};
    const clientId = req.body?.clientId || null;
    const cl = clientId ? await store.get('clients/' + clientId) : null;
    const id = 'v_' + rid(8), token = rid(18);
    const numero = await prochainNumero(store, 'devis');
    await store.set('devis/' + id, { id, numero, token, clientId, clientNom: cl?.nom || '', statut: 'brouillon', evenement: {}, lignes: [], remiseCents: 0, acomptePct: null, validiteJusquau: new Date(Date.now() + (T.validiteDevisJours || 15) * 86400e3).toISOString().slice(0, 10), createdAt: new Date().toISOString(), creePar: req.ctx.name });
    await store.set('_devistoken/' + sha(token), { id });
    audit(req.ctx, 'devis créé', 'devis/' + id, numero);
    res.json({ ok: true, id });
  }));

  /* ---------- « 📂 Partir d'un ancien devis » (server/anciens.js) ----------
     Recherche dans TOUS les anciens devis (tous commerciaux, toutes dates) : le nom du client d'un dossier
     suivi par un autre commercial est masqué pour qui ne voit que ses opportunités, ses lignes restent réutilisables. */
  async function tousLesDevis(req) {
    const vis = await visibles(req);
    cAnc = await cat.get();
    return { vis, liste: (await store.list('devis')).map(x => ({ ...x.data, id: x.data?.id || x.id })).filter(d => d && d.numero) };
  }
  let cAnc = null;
  const carteDe = (vis, d, extra = {}) => ({ ...ANC.carte(d, { masquer: !!vis && !vis.devis.has(d.id), c: cAnc }), ...extra });
  /* référence d'un devis en cours : type, invités, produits (ceux du devis, sinon ceux de sa demande) et texte de la demande */
  async function refDevis(d) {
    const dem = d.demandeId ? await store.get('demandes/' + d.demandeId) : null;
    const cl = [...new Set((d.lignes || []).map(ANC.cle).filter(Boolean))];
    if (!cl.length && dem) for (const l of dem.lignes || []) if (l.slug) cl.push('p:' + l.slug);
    return { sauf: d.id, type: d.evenement?.type || dem?.evenement?.type, invites: d.evenement?.invites || dem?.evenement?.invites, cles: cl, texte: [d.titre, dem?.message].filter(Boolean).join(' ') };
  }
  A.get('/anciens-devis', wrap(async (req, res) => {
    const { vis, liste } = await tousLesDevis(req), q = req.query || {};
    const f = { q: s(q.q, 200), type: s(q.type, 80), invites: +q.invites || 0, budgetMin: +q.bmin || 0, budgetMax: +q.bmax || 0, du: s(q.du, 10), au: s(q.au, 10), com: s(q.com, 80), signes: q.signes === '1', modeles: q.modeles === '1', sauf: s(q.pour, 40), tri: s(q.tri, 20) };
    const R = ANC.rechercher(liste, f, cAnc);
    let proches = [];
    const cur = f.sauf ? liste.find(d => d.id === f.sauf) : null;
    if (cur) proches = ANC.proches(liste, { ...(await refDevis(cur)), invites: +q.refInvites || cur.evenement?.invites, type: s(q.refType, 80) || cur.evenement?.type }).map(x => carteDe(vis, x.d, { pourquoi: x.pourquoi }));
    const commerciaux = [...new Set(liste.map(d => d.commercial?.nom || '').filter(Boolean))].sort((a, b) => a.localeCompare(b));
    res.set('Cache-Control', 'no-store').json({ total: R.length, resultats: R.slice(0, 60).map(d => carteDe(vis, d)), proches, commerciaux, types: [...new Set(liste.map(d => d.evenement?.type).filter(Boolean))].sort() });
  }));
  A.post('/anciens-devis/complements', sameSite, json, wrap(async (req, res) => {
    const { liste } = await tousLesDevis(req);
    const L = (Array.isArray(req.body?.lignes) ? req.body.lignes : []).slice(0, 300).map(l => ({ type: l?.type, produit: s(l?.produit, 160), designation: s(l?.designation, 300), unite: s(l?.unite, 40), supplement: l?.supplement }));
    res.json({ complements: ANC.complements(liste, L, await cat.get()) });
  }));
  A.post('/anciens-devis/:id/reprendre', sameSite, json, wrap(async (req, res) => {
    const src = await store.get('devis/' + req.params.id);
    if (!src) return res.status(404).json({ error: 'Ancien devis introuvable.' });
    const c = await cat.get();
    const r = ANC.reprendre(src, { invites: +req.body?.invites || 0 }, c, c.reglages.tarifs || {});
    audit(req.ctx, 'ancien devis repris', 'devis/' + req.params.id, src.numero);
    res.json({ ...r, source: { id: req.params.id, numero: src.numero, titre: src.titre || '', type: src.evenement?.type || '', invites: +src.evenement?.invites || null, conditions: src.conditions || '' } });
  }));
  A.post('/actions/modele-devis/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    const on = !!req.body?.modele, next = { ...d }; if (on) next.modele = true; else delete next.modele;
    await store.set('devis/' + req.params.id, next);
    audit(req.ctx, on ? 'devis marqué modèle ⭐' : 'devis retiré des modèles', 'devis/' + req.params.id, d.numero);
    res.json({ ok: true, modele: on });
  }));

  function remplir(modele, vars) { return String(modele || '').replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? ''); }

  A.get('/devis/:id/apercu', wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).send('Devis introuvable.');
    const c = await cat.get();
    res.set('Cache-Control', 'no-store').send(views.devisPage(c, d, totaux(d), { apercu: true, client: await store.get('clients/' + d.clientId), demande: d.demandeId ? await store.get('demandes/' + d.demandeId) : null }));
  }));
  A.get('/factures/:id/apercu', wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).send('Facture introuvable.');
    res.set('Cache-Control', 'no-store').send(views.facturePage(await cat.get(), f, totaux(f), { apercu: true }));
  }));
  /* envoi groupé (comme Team Leader) : plusieurs devis du même client dans UN e-mail / SMS,
     chaque devis gardant son propre lien et sa propre signature. « apercu » = rien n'est envoyé. */
  const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  /* e-mail de devis : chaque lieu à privatiser du devis en 3 photos (une grande, deux petites), avec son nom et sa capacité */
  function lieuxMailHtml(c, d) {
    const abs = u => /^https?:\/\//.test(u) ? u : SITE + (String(u).startsWith('/') ? '' : '/') + u;
    return views.lieuxDuDevis(c, d).map(l => {
      const ph = [...new Set((l.photos || []).filter(Boolean))].slice(0, 3).map(abs);
      const im = (u, h) => `<img src="${esc(u)}" alt="${esc(l.nom)}" width="100%" style="display:block;width:100%;height:${h}px;object-fit:cover;border:0">`;
      const photos = !ph.length ? '' : ph.length === 1 ? `<tr><td colspan="2">${im(ph[0], 260)}</td></tr>`
        : `<tr><td colspan="2" style="padding-bottom:4px">${im(ph[0], 260)}</td></tr><tr><td width="50%" style="padding-right:2px">${im(ph[1], 130)}</td><td width="50%" style="padding-left:2px">${ph[2] ? im(ph[2], 130) : ''}</td></tr>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3d9c4;border-radius:10px;overflow:hidden;margin:14px 0;background:#f6f1e8;border-collapse:separate">${photos}<tr><td colspan="2" style="padding:14px 16px"><p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#b08a4f">Votre lieu de réception${l.ville ? ' · ' + esc(l.ville) : ''}</p><p style="margin:4px 0 6px;font-size:20px;color:#1d3b2f"><b>${esc(l.nom)}</b></p>${l.capacite ? `<p style="margin:0 0 6px">Jusqu’à ${esc(l.capacite)} personnes</p>` : ''}${l.description ? `<p style="margin:0;color:#5d6661">${esc(String(l.description).slice(0, 220).replace(/\s+\S*$/, ''))}${String(l.description).length > 220 ? '…' : ''}</p>` : ''}</td></tr></table>`;
    }).join('');
  }
  function messageDevis(cl, liste, msg, R, c = null) {
    const prenom = esc((cl.nom || '').split(' ')[0]);
    const plusieurs = liste.length > 1, ev = liste[0].evenement || {};
    const intro = msg ? `<p>${esc(msg).replace(/\n/g, '<br>')}</p>` : `<p>${plusieurs ? `Voici nos ${liste.length} propositions` : 'Voici votre devis'} pour votre ${esc(String(ev.type || 'événement').toLowerCase())}${ev.date ? ' du ' + esc(dateFr(ev.date)) : ''}${plusieurs ? ' : choisissez celle qui vous convient et signez-la en ligne.' : '.'}</p>`;
    const bloc = (d, i) => { const lien = `${SITE}/devis/${d.token}`, nom = d.titre || (plusieurs ? 'Proposition ' + LETTRES[i] : 'Votre devis');
      return `<div style="border:1px solid #e3d9c4;border-radius:10px;padding:14px 16px;margin:12px 0"><p style="margin:0 0 4px"><b>${esc(nom)}</b> · devis ${esc(d.numero)}</p><p style="margin:0 0 10px">${euros(totaux(d).ttcCents)} TTC${d.validiteJusquau ? ` · valable jusqu’au ${esc(dateFr(d.validiteJusquau))}` : ''}</p><a href="${lien}" style="background:#1d3b2f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block">Consulter et signer ${plusieurs ? 'cette proposition' : 'mon devis'}</a></div>`; };
    const lieuxH = c ? lieuxMailHtml(c, { lignes: liste.flatMap(d => d.lignes || []), evenement: liste[0].evenement }) : '';
    const html = `<p>Bonjour ${prenom},</p>${intro}${lieuxH}${liste.map(bloc).join('')}<p>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p>`;
    const sujet = plusieurs ? `Vos ${liste.length} devis Magnolia Traiteur` : `Votre devis Magnolia Traiteur ${liste[0].numero}`;
    const text = liste.map((d, i) => `${d.titre || (plusieurs ? 'Proposition ' + LETTRES[i] : 'Devis')} ${d.numero} (${euros(totaux(d).ttcCents)} TTC) : ${SITE}/devis/${d.token}`).join('\n');
    const sms = plusieurs ? `Magnolia Traiteur : vos ${liste.length} devis sont prêts. ${liste.map((d, i) => `${d.titre || 'Proposition ' + LETTRES[i]} (${euros(totaux(d).ttcCents)}) : ${SITE}/devis/${d.token}`).join(' · ')}`
      : `Magnolia Traiteur : votre devis ${liste[0].numero} (${euros(totaux(liste[0]).ttcCents)} TTC) est prêt. Consultez-le et signez en ligne : ${SITE}/devis/${liste[0].token}`;
    return { sujet, html, text, sms };
  }
  A.post('/actions/envoyer-devis-groupe', sameSite, json, wrap(async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(x => s(x, 40)))].slice(0, 20);
    if (!ids.length) return res.status(400).json({ error: 'Cochez au moins un devis.' });
    const liste = [];
    for (const id of ids) {
      const d = await store.get('devis/' + id);
      if (!d || !(await voitDoc(req, 'devis', id))) return res.status(404).json({ error: 'Devis introuvable.' });
      if (!(d.lignes || []).length) return res.status(400).json({ error: `Le devis ${d.numero} est vide.` });
      const err = controleMarge(d); if (err.length) return res.status(400).json({ error: `Devis ${d.numero} : marge négative bloquée. ` + err.join(' ') });
      liste.push(d);
    }
    if (new Set(liste.map(d => d.clientId)).size > 1) return res.status(400).json({ error: 'Les devis cochés ne sont pas pour le même client.' });
    const cl = await store.get('clients/' + liste[0].clientId);
    if (!cl?.email) return res.status(400).json({ error: 'Ce client n’a pas d’e-mail.' });
    liste.sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
    const R = (await cat.get()).reglages, msg = s(req.body?.message, 2000), canaux = (req.body?.canaux || ['email']).filter(x => ['email', 'sms'].includes(x));
    const m = messageDevis(cl, liste, msg, R, await cat.get());
    if (req.body?.apercu) return res.json({ apercu: true, a: cl.email, tel: cl.tel || '', ...m });
    if (canaux.includes('email')) await brevo.sendEmail({ to: cl.email, name: cl.nom, replyTo: R.email, subject: m.sujet, html: m.html, text: m.text });
    if (canaux.includes('sms') && cl.tel) await brevo.sendSms({ to: cl.tel, content: m.sms });
    const now = new Date().toISOString();
    for (const d of liste) {
      await store.set('devis/' + d.id, { ...d, statut: d.statut === 'accepte' ? 'accepte' : 'envoye', envoyeLe: d.envoyeLe || now, envois: [...(d.envois || []), { at: now, canaux, par: req.ctx.name, groupe: liste.length > 1 ? liste.map(x => x.numero) : undefined }] });
      if (d.demandeId) await changerStatut(d.demandeId, 'devis_envoye', req.ctx.name);
      audit(req.ctx, 'devis envoyé', 'devis/' + d.id, liste.length > 1 ? `${d.numero} (envoi groupé de ${liste.length})` : d.numero);
    }
    res.json({ ok: true, nb: liste.length, test: !brevo.live });
  }));
  /* envoi d'un devis au client (bouton « Envoyer le devis », ou envoi automatique par l'IA) */
  async function envoyerDevis(d, { canaux = ['email'], message = '', par = '', ia = false } = {}) {
    const cl = await store.get('clients/' + d.clientId);
    const c = await cat.get(); const R = c.reglages;
    const lien = `${SITE}/devis/${d.token}`;
    const t = totaux(d);
    const now = new Date().toISOString();
    const msg = s(message, 2000);
    if (canaux.includes('email')) await brevo.sendEmail({ to: cl.email, name: cl.nom, replyTo: R.email, subject: `Votre devis Magnolia Traiteur ${d.numero}`,
      html: `<p>Bonjour ${esc((cl.nom || '').split(' ')[0])},</p>${msg ? `<p>${esc(msg).replace(/\n/g, '<br>')}</p>` : `<p>Voici votre devis pour votre ${esc(String(d.evenement?.type || 'événement').toLowerCase())}${d.evenement?.date ? ' du ' + esc(dateFr(d.evenement.date)) : ''} : <b>${euros(t.ttcCents)} TTC</b>.</p>`}${lieuxMailHtml(c, d)}<p><a href="${lien}" style="background:#1d3b2f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block">Consulter et signer mon devis</a></p><p>Il est valable jusqu’au ${esc(dateFr(d.validiteJusquau))}.</p><p>L’équipe Magnolia Traiteur<br>${esc(R.telephone)}</p>`,
      text: `Votre devis ${d.numero} : ${lien}` });
    if (canaux.includes('sms') && cl.tel) await brevo.sendSms({ to: cl.tel, content: `Magnolia Traiteur : votre devis ${d.numero} (${euros(t.ttcCents)} TTC) est prêt. Consultez-le et signez en ligne : ${lien}` });
    const envoi = { at: now, canaux, par: ia ? 'IA' : par, ...(ia ? { ia: true } : {}) };
    await store.set('devis/' + d.id, { ...d, statut: d.statut === 'accepte' ? 'accepte' : 'envoye', envoyeLe: d.envoyeLe || now, envois: [...(d.envois || []), envoi] });
    if (d.demandeId) await changerStatut(d.demandeId, 'devis_envoye', ia ? 'IA (envoi automatique)' : par);
    return { lien, ttcCents: t.ttcCents };
  }
  A.post('/actions/envoyer-devis/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    const err = controleMarge(d);
    if (err.length) return res.status(400).json({ error: 'Marge négative bloquée : ' + err.join(' ') });
    if (!(d.lignes || []).length) return res.status(400).json({ error: 'Le devis est vide.' });
    const cl = await store.get('clients/' + d.clientId);
    if (!cl?.email) return res.status(400).json({ error: 'Ce devis n’a pas de client avec un e-mail.' });
    const { lien } = await envoyerDevis(d, { canaux: req.body?.canaux || ['email'], message: req.body?.message, par: req.ctx.name });
    audit(req.ctx, 'devis envoyé', 'devis/' + d.id, d.numero);
    res.json({ ok: true, lien, test: !brevo.live });
  }));

  /* ---------- envoi automatique (Jean-Luc, 2026-11-24) : demande du site complète (produits du catalogue avec prix, quantités
     au minimum, choix faits, date, invités, adresse, téléphone) → devis créé et envoyé tout de suite, quel que soit le montant ;
     l'équipe est prévenue pour rappeler le client. Sinon la demande reste dans « Demandes de devis », avec la raison. ---------- */
  const IA_CTX = { uid: 'ia', name: 'IA', email: '' };
  const DEVIS_AUTO_SMS = '06 58 22 69 69';
  async function devisAutomatique(demande) {
    const c = await cat.get(), R = c.reglages;
    const auto = { essaye: new Date().toISOString() };
    if (R.devisAuto === false) return { ...auto, envoye: false, raisons: ['envoi automatique désactivé dans le back-office'] };
    const raisons = raisonsDevisManuel(demande, c, R.tarifs || {});
    if (raisons.length) return { ...auto, envoye: false, raisons };
    const cl = await store.get('clients/' + demande.clientId);
    if (!cl?.email) return { ...auto, envoye: false, raisons: ['fiche client sans e-mail'] };
    /* la demande passe tout de suite dans « Suivi client », sans commercial : l'équipe choisit qui rappelle */
    await store.set('demandes/' + demande.id, { ...demande, priseEnCharge: { at: auto.essaye, par: '', quoi: 'devis envoyé par l’IA', ia: true } });
    const id = await devisDepuisDemande({ ...demande, priseEnCharge: true }, IA_CTX, { commercial: null, auto: true,
      intro: `Madame, Monsieur, merci pour votre demande. Voici notre proposition pour votre ${String(demande.evenement?.type || 'événement').toLowerCase()}, établie aussitôt à partir de votre sélection.` });
    const d = await store.get('devis/' + id);
    const err = controleMarge(d);
    if (err.length || !(d.lignes || []).length) {
      await store.set('demandes/' + demande.id, { ...demande });
      return { ...auto, envoye: false, devisId: id, raisons: err.length ? err : ['devis vide'] };
    }
    const prenom = (cl.nom || '').split(' ')[0];
    const { lien, ttcCents } = await envoyerDevis(d, { canaux: ['email', ...(cl.tel ? ['sms'] : [])], ia: true,
      message: `Merci pour votre demande${demande.evenement?.date ? ' pour le ' + dateFr(demande.evenement.date) : ''}. Votre devis est prêt : ${euros(totaux(d).ttcCents)} TTC. Vous pouvez le consulter et le signer en ligne dès maintenant.\nUn conseiller Magnolia vous appelle très vite pour vérifier les détails avec vous${prenom ? ', ' + prenom : ''}.` });
    audit(IA_CTX, 'devis envoyé automatiquement', 'devis/' + id, d.numero);
    const ct = demande.contact || {}, e = demande.evenement || {};
    alerterEquipe(`✨ Devis ${d.numero} envoyé par l’IA à ${ct.nom} : à rappeler`,
      `<p>La demande <b>${esc(demande.ref)}</b> était complète : l’IA a créé le devis <b>${esc(d.numero)}</b> (${euros(ttcCents)} TTC) et l’a envoyé tout de suite au client, par e-mail${cl.tel ? ' et SMS' : ''}.</p><p><b>Merci de rappeler le client</b> : <b>${esc(ct.nom)}</b> ${esc(ct.societe || '')} · <a href="tel:${esc(ct.tel)}">${esc(ct.tel)}</a> · ${esc(ct.email)}</p><p>${esc(e.type)} · ${esc(dateFr(e.date))} · ${e.invites} invités · ${esc([e.cp, e.ville].filter(Boolean).join(' '))}</p>${demande.message ? `<p>Message du client : « ${esc(demande.message)} »</p>` : ''}<p><a href="${SITE}/admin#/devis/${id}">Ouvrir le devis</a> · <a href="${lien}">Voir ce que voit le client</a></p>`,
      `Magnolia : devis ${d.numero} (${euros(ttcCents)}) envoyé par l'IA à ${ct.nom}, ${e.invites} pers. le ${dateFr(e.date)}. Rappelez le client : ${ct.tel}`).catch(() => {});
    /* SMS d'avertissement (Jean-Luc, 2026-11-25) : chaque devis parti tout seul est signalé à ce numéro (modifiable dans Demandes de devis) */
    const deja = new Set(String(R.alertes?.sms || '').split(/[,;]+/).map(x => x.replace(/\D/g, '').slice(-9)).filter(Boolean));
    for (const t of String(R.devisAutoSms ?? DEVIS_AUTO_SMS).split(/[,;]+/).map(x => x.trim()).filter(Boolean)) {
      if (deja.has(t.replace(/\D/g, '').slice(-9))) continue; /* déjà prévenu par les alertes de l'équipe */
      await brevo.sendSms({ to: t, lien: false, content: `Magnolia Traiteur : demande de devis reçue sur le site, devis envoyé par l'IA. ${ct.nom}, ${euros(ttcCents)} TTC, ${e.invites} pers. le ${dateFr(e.date)}. Tél. client : ${ct.tel}` }).catch(() => {});
    }
    return { ...auto, envoye: true, devisId: id, numero: d.numero, ttcCents, raisons: [] };
  }

  A.post('/actions/relancer/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    const m = await store.get('modeles/' + s(req.body?.modele, 60));
    if (!d || !m) return res.status(404).json({ error: 'Devis ou modèle introuvable.' });
    const cl = await store.get('clients/' + d.clientId);
    const vars = { prenom: (cl?.nom || '').split(' ')[0], nom: cl?.nom || '', numero: d.numero, evenement: String(d.evenement?.type || 'événement').toLowerCase(), date: dateFr(d.evenement?.date), lien: `${SITE}/devis/${d.token}`, montant: euros(totaux(d).ttcCents) };
    if (m.canal === 'sms') await brevo.sendSms({ to: cl?.tel, content: remplir(m.texte, vars) });
    else await brevo.sendEmail({ to: cl?.email, name: cl?.nom, subject: remplir(m.sujet, vars), html: esc(remplir(m.texte, vars)).replace(/\n/g, '<br>'), text: remplir(m.texte, vars) });
    const now = new Date().toISOString();
    await store.set('devis/' + d.id, { ...d, derniereRelance: now, relances: [...(d.relances || []), { at: now, modele: m.nom, par: req.ctx.name }] });
    if (d.demandeId) await changerStatut(d.demandeId, 'relance', req.ctx.name);
    audit(req.ctx, 'relance envoyée', 'devis/' + d.id, m.nom);
    res.json({ ok: true });
  }));

  /* ---------- factures (CRM) : règlements en plusieurs acomptes, envoi, relances, archives, avoirs ---------- */
  async function creerFacture(d, type, ctx) {
    const cl = await store.get('clients/' + d.clientId);
    const t = totaux(d);
    const autres = (await store.list('factures')).map(x => x.data).filter(f => f.devisId === d.id && !f.annuleeParAvoir && f.type !== 'avoir');
    const acompteFacture = autres.filter(f => f.type === 'acompte').reduce((s2, f) => s2 + totaux(f).ttcCents, 0);
    let lignes = d.lignes, remiseCents = d.remiseCents || 0, dejaRegleCents = 0;
    if (type === 'acompte') {
      const acR = regleAcompte(t.ttcCents, d, (await cat.get()).reglages.tarifs);
      const montant = acR.cents;
      /* acompte réparti au prorata des taux de TVA du devis */
      lignes = Object.entries(t.tva).map(([taux, tv]) => { const ttc = tv + Math.round(tv / (taux / 100)); return { designation: `Acompte ${acR.pct} % sur devis ${d.numero} (TVA ${taux} %)`, qte: 1, unite: '', puCents: Math.round(montant * ttc / t.ttcCents), tva: +taux }; });
      if (lignes.length) lignes[lignes.length - 1].puCents += montant - lignes.reduce((s2, l) => s2 + l.puCents, 0); /* le centime d'arrondi va sur la dernière ligne */
      remiseCents = 0;
    } else if (type === 'solde' || (type === 'totale' && acompteFacture)) dejaRegleCents = acompteFacture;
    const id = 'f_' + rid(8), token = rid(18);
    const numero = await prochainNumero(store, 'facture');
    const f = FAC.resume({ id, numero, token, type, devisId: d.id, devisNumero: d.numero, clientId: d.clientId, client: { nom: cl?.nom || d.clientNom || '', societe: cl?.societe || '', email: cl?.email || '', tel: cl?.tel || '', adresse: [cl?.adresse, [cl?.cp, cl?.ville].filter(Boolean).join(' ')].filter(Boolean).join('\n') },
      objet: `${d.evenement?.type || 'Événement'} du ${dateFr(d.evenement?.date)}`, evenementDate: d.evenement?.date || '', commercial: d.commercial?.nom || '', date: new Date().toISOString().slice(0, 10), lignes, remiseCents, remisePct: remiseCents ? d.remisePct ?? null : null, dejaRegleCents, reglements: [], payee: false, createdAt: new Date().toISOString(), creePar: ctx.name });
    await store.set('factures/' + id, f);
    await store.set('_facturetoken/' + sha(token), { id });
    audit(ctx, 'facture créée', 'factures/' + id, numero);
    return f;
  }
  const tarifs = async () => (await cat.get()).reglages.tarifs || {};
  /* liste enrichie : reste à payer, échéance, statut (à envoyer, non réglée, en retard, réglée, archivée…) */
  A.get('/actions/factures', wrap(async (req, res) => {
    const T = await tarifs();
    const vis = await visibles(req);
    const l = (await store.list('factures')).map(x => x.data).filter(Boolean).filter(f => !vis || vis.factures.has(f.id)).map(f => { const e = FAC.etat(f); return { ...f, lignes: undefined, etat: { dueCents: e.dueCents, regleCents: e.regleCents, resteCents: e.resteCents, ttcCents: e.ttcCents, nb: e.reglements.length }, statutF: FAC.statut(f, T), echeance: FAC.echeance(f, T), reglements: e.reglements }; });
    res.json(l.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
  }));
  A.get('/actions/facture/:id', wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    const T = await tarifs(), d = f.devisId ? await store.get('devis/' + f.devisId) : null;
    const e = FAC.etat(f);
    res.json({ ...f, etat: { dueCents: e.dueCents, regleCents: e.regleCents, resteCents: e.resteCents, ttcCents: e.ttcCents, tropPercuCents: e.tropPercuCents }, reglements: FAC.libelles(f), statutF: FAC.statut(f, T), echeance: FAC.echeance(f, T), propose: FAC.montantPropose(f, d, T), moyens: FAC.MOYENS, devis: d ? { id: d.id, numero: d.numero, token: d.token } : null });
  }));
  A.post('/actions/facture-depuis-devis/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    if (d.statut !== 'accepte') return res.status(400).json({ error: 'Le devis doit d’abord être accepté.' });
    const type = ['acompte', 'solde', 'totale'].includes(req.body?.type) ? req.body.type : 'totale';
    res.json({ ok: true, id: (await creerFacture(d, type, req.ctx)).id });
  }));
  /* un règlement du client sur un devis signé : la facture du devis est créée (« à envoyer ») ou complétée */
  A.post('/actions/reglement-devis/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    if (d.statut !== 'accepte') return res.status(400).json({ error: 'Le devis doit d’abord être signé par le client.' });
    let r; try { r = FAC.nouveauReglement(req.body, req.ctx.name, rid); } catch (e) { return res.status(400).json({ error: e.message }); }
    const ex = (await store.list('factures')).map(x => x.data).filter(f => f.devisId === d.id && f.type === 'totale' && !f.annuleeParAvoir).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const f = ex || await creerFacture(d, 'totale', req.ctx);
    r.at = new Date().toISOString(); /* après la création de la facture, pour l'historique */
    const next = FAC.resume({ ...f, reglements: [...(f.reglements || []), r] });
    await store.set('factures/' + f.id, next);
    if (d.demandeId) await changerStatut(d.demandeId, 'reserve', req.ctx.name);
    audit(req.ctx, 'règlement enregistré', 'factures/' + f.id, `${f.numero} · ${euros(r.montantCents)} · ${r.moyen}`);
    res.json({ ok: true, id: f.id, numero: f.numero, cree: !ex, resteCents: next.resteCents });
  }));
  A.post('/actions/facture-reglement/:id', sameSite, json, wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    if (f.type === 'avoir' || f.annuleeParAvoir) return res.status(400).json({ error: 'Cette facture est annulée par un avoir.' });
    let r; try { r = FAC.nouveauReglement(req.body, req.ctx.name, rid); } catch (e) { return res.status(400).json({ error: e.message }); }
    const base = !(f.reglements || []).length && f.payee ? { ...f, payee: false } : f; /* ancienne facture « payée » sans détail : on repart de zéro */
    const next = FAC.resume({ ...base, reglements: [...(f.reglements || []), r] });
    await store.set('factures/' + f.id, next);
    const d = f.devisId && await store.get('devis/' + f.devisId);
    if (d?.demandeId) await changerStatut(d.demandeId, 'reserve', req.ctx.name);
    audit(req.ctx, 'règlement enregistré', 'factures/' + f.id, `${f.numero} · ${euros(r.montantCents)} · ${r.moyen}`);
    res.json({ ok: true, resteCents: next.resteCents, payee: next.payee });
  }));
  A.post('/actions/facture-reglement-retirer/:id', sameSite, json, wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    const r = (f.reglements || []).find(x => x.id === req.body?.rid);
    if (!r) return res.status(404).json({ error: 'Règlement introuvable.' });
    const next = FAC.resume({ ...f, archivee: false, reglements: f.reglements.filter(x => x.id !== r.id), reglementsRetires: [...(f.reglementsRetires || []), { ...r, retireLe: new Date().toISOString(), retirePar: req.ctx.name }] });
    await store.set('factures/' + f.id, next);
    audit(req.ctx, 'règlement retiré', 'factures/' + f.id, `${f.numero} · ${euros(r.montantCents)}`);
    res.json({ ok: true });
  }));
  /* ancien bouton « Marquer payée » : ajoute un règlement du reste dû */
  A.post('/actions/facture-payee/:id', sameSite, json, wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    const e = FAC.etat(f);
    let next;
    if (req.body?.payee) next = FAC.resume({ ...f, reglements: [...(f.reglements || []), FAC.nouveauReglement({ montantCents: e.resteCents || e.dueCents, moyen: req.body?.moyen }, req.ctx.name, rid)] });
    else next = FAC.resume({ ...f, payee: false, archivee: false, reglements: [] });
    await store.set('factures/' + f.id, next);
    const d = await store.get('devis/' + f.devisId);
    if (req.body?.payee && d?.demandeId) await changerStatut(d.demandeId, 'reserve', req.ctx.name);
    audit(req.ctx, req.body?.payee ? 'facture payée' : 'facture non payée', 'factures/' + f.id, f.numero);
    res.json({ ok: true });
  }));
  /* e-mail de la facture : chaque acompte versé avec sa date, puis le solde restant dû */
  function factureMail(f, R, { message = '', relance = false } = {}) {
    const e = FAC.etat(f), regs = FAC.libelles(f), lien = `${SITE}/facture/${f.token}`, prenom = esc((f.client?.nom || '').split(' ')[0]);
    const ech = FAC.echeance(f, R.tarifs || {});
    const avoir = f.type === 'avoir';
    const ligne = (a, b, gras) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e7e1d3${gras ? ';font-weight:700' : ''}">${a}</td><td style="padding:6px 10px;border-bottom:1px solid #e7e1d3;text-align:right;white-space:nowrap${gras ? ';font-weight:700' : ''}">${b}</td></tr>`;
    const tableau = avoir ? '' : `<table style="border-collapse:collapse;min-width:300px;margin:12px 0;background:#fbf8f1;border:1px solid #e7e1d3">${ligne('Montant de la facture (TTC)', euros(e.dueCents))}${regs.map(r => ligne(`${esc(r.libelle)} versé le ${esc(dateFr(r.date))} <small style="color:#6b6b6b">(${esc(r.moyen)})</small>`, '− ' + euros(r.montantCents))).join('')}${ligne(e.resteCents ? 'Solde restant dû' : 'Solde', e.resteCents ? euros(e.resteCents) : 'Facture entièrement réglée ✓', true)}</table>`;
    const intro = message ? `<p>${esc(message).replace(/\n/g, '<br>')}</p>`
      : avoir ? `<p>Veuillez trouver votre avoir ${esc(f.numero)} de ${euros(e.ttcCents)} TTC, qui annule la facture ${esc(f.factureNumero || '')}.</p>`
      : relance ? `<p>Sauf erreur de notre part, le solde de votre facture ${esc(f.numero)} (${esc(f.objet || '')}) n’a pas encore été réglé${ech ? ` ; il était attendu au plus tard le ${esc(dateFr(ech))}` : ''}.</p>`
      : `<p>Veuillez trouver votre facture ${esc(f.numero)} pour votre ${esc(String(f.objet || 'événement').toLowerCase())}.</p>`;
    const P = R.paiement || {};
    const payer = e.resteCents && !avoir ? `${/^https:\/\//.test(P.lien || '') ? `<p><a href="${esc(P.lien)}" style="background:#b8913a;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block">Régler par carte</a></p>` : ''}${P.iban ? `<p style="font-size:14px">Par virement : ${esc(P.titulaire || 'Magnolia Traiteur')} · IBAN <b>${esc(P.iban)}</b>${P.bic ? ' · BIC ' + esc(P.bic) : ''} · référence <b>${esc(f.numero)}</b></p>` : ''}${ech && !relance ? `<p>Solde à régler au plus tard le <b>${esc(dateFr(ech))}</b>.</p>` : ''}` : '';
    const html = `<div style="font-family:Arial,sans-serif;color:#1f2a24;line-height:1.5"><p>Bonjour ${prenom},</p>${intro}${tableau}${payer}<p><a href="${lien}" style="background:#1d3b2f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block">${avoir ? 'Voir l’avoir' : 'Voir et imprimer la facture'}</a></p><p>${relance ? 'Si votre règlement est déjà parti, merci de ne pas tenir compte de ce message. ' : ''}Merci pour votre confiance,<br>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p></div>`;
    const text = [`Bonjour,`, message || (relance ? `Le solde de votre facture ${f.numero} reste à régler.` : `Votre ${avoir ? 'avoir' : 'facture'} ${f.numero}.`), ...regs.map(r => `${r.libelle} versé le ${dateFr(r.date)} : ${euros(r.montantCents)}`), avoir ? '' : `Solde restant dû : ${euros(e.resteCents)}`, lien].filter(Boolean).join('\n');
    const sujet = relance ? `Rappel : solde de votre facture Magnolia Traiteur ${f.numero}` : `Votre ${avoir ? 'avoir' : 'facture'} Magnolia Traiteur ${f.numero}${!avoir && e.reglements.length && e.resteCents ? ' · solde ' + euros(e.resteCents) : ''}`;
    const sms = relance ? `Magnolia Traiteur : rappel, le solde de ${euros(e.resteCents)} de votre facture ${f.numero} reste a regler. Voir : ${lien}` : `Magnolia Traiteur : votre facture ${f.numero} est disponible${e.resteCents ? `, solde restant du ${euros(e.resteCents)}` : ''}. Voir : ${lien}`;
    return { to: f.client?.email || '', tel: f.client?.tel || '', sujet, html, text, sms, lien };
  }
  async function envoiFacture(req, res, relance) {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    if (!f.client?.tel || !f.client?.email) { const cl = f.clientId && await store.get('clients/' + f.clientId); if (cl) f.client = { ...f.client, email: f.client?.email || cl.email || '', tel: f.client?.tel || cl.tel || '' }; }
    const R = (await cat.get()).reglages;
    const m = factureMail(f, R, { message: s(req.body?.message, 3000), relance });
    if (req.body?.apercu) return res.json({ ok: true, ...m });
    const canaux = (Array.isArray(req.body?.canaux) ? req.body.canaux : ['email']).filter(k => ['email', 'sms'].includes(k));
    if (!canaux.length) return res.status(400).json({ error: 'Choisissez e-mail et/ou SMS.' });
    if (canaux.includes('email') && !isEmail(m.to)) return res.status(400).json({ error: 'Ce client n’a pas d’adresse e-mail : complétez sa fiche.' });
    if (canaux.includes('sms') && !m.tel) return res.status(400).json({ error: 'Ce client n’a pas de téléphone : complétez sa fiche.' });
    if (canaux.includes('email')) await brevo.sendEmail({ to: m.to, name: f.client?.nom, replyTo: R.email, subject: m.sujet, html: m.html, text: m.text });
    if (canaux.includes('sms')) await brevo.sendSms({ to: m.tel, content: m.sms });
    const now = new Date().toISOString(), e = FAC.etat(f);
    const trace = { at: now, canaux, par: req.ctx.name, regleCents: e.regleCents, resteCents: e.resteCents };
    await store.set('factures/' + f.id, relance ? { ...f, relances: [...(f.relances || []), trace] } : { ...f, envoyeeLe: f.envoyeeLe || now, envois: [...(f.envois || []), trace] });
    audit(req.ctx, relance ? 'relance facture' : 'facture envoyée', 'factures/' + f.id, f.numero);
    res.json({ ok: true, lien: m.lien, test: !brevo.live });
  }
  A.post('/actions/envoyer-facture/:id', sameSite, json, wrap((req, res) => envoiFacture(req, res, false)));
  A.post('/actions/relancer-facture/:id', sameSite, json, wrap((req, res) => envoiFacture(req, res, true)));
  A.post('/actions/archiver-facture/:id', sameSite, json, wrap(async (req, res) => {
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    const archivee = req.body?.archivee !== false;
    if (archivee && !FAC.etat(f).payee && !f.annuleeParAvoir && f.type !== 'avoir') return res.status(400).json({ error: 'Seule une facture entièrement réglée s’archive : elle reste dans « Non réglées » tant qu’il reste un solde.' });
    await store.set('factures/' + f.id, { ...f, archivee, archiveeLe: archivee ? new Date().toISOString() : null });
    audit(req.ctx, archivee ? 'facture archivée' : 'facture désarchivée', 'factures/' + f.id, f.numero);
    res.json({ ok: true });
  }));
  /* une facture émise ne s'efface pas : l'avoir l'annule (numérotation continue A-année-n°) */
  A.post('/actions/avoir-facture/:id', sameSite, json, wrap(async (req, res) => {
    if (!req.ctx.droits.factures) return refus(res, 'factures');
    const f = await store.get('factures/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Facture introuvable.' });
    if (f.type === 'avoir' || f.annuleeParAvoir) return res.status(400).json({ error: 'Cette facture est déjà annulée.' });
    const id = 'f_' + rid(8), token = rid(18), numero = await prochainNumero(store, 'avoir');
    const motif = s(req.body?.motif, 300);
    const a = { id, numero, token, type: 'avoir', factureId: f.id, factureNumero: f.numero, devisId: f.devisId, devisNumero: f.devisNumero, clientId: f.clientId, client: f.client, objet: `Avoir sur la facture ${f.numero}${motif ? ' · ' + motif : ''}`, motif, date: new Date().toISOString().slice(0, 10), lignes: f.lignes, remiseCents: f.remiseCents || 0, dejaRegleCents: f.dejaRegleCents || 0, reglements: [], createdAt: new Date().toISOString(), creePar: req.ctx.name };
    a.totalCents = FAC.etat(a).dueCents; a.payee = true;
    await store.set('factures/' + id, a);
    await store.set('_facturetoken/' + sha(token), { id });
    await store.set('factures/' + f.id, { ...f, annuleeParAvoir: { id, numero, le: a.createdAt, par: req.ctx.name } });
    audit(req.ctx, 'avoir créé', 'factures/' + id, `${numero} annule ${f.numero}`);
    res.json({ ok: true, id, numero });
  }));

  /* ---------- appels et visios programmés avec un client (fiche client) : agenda des commerciaux, invitation au client, rappel avant l'heure ---------- */
  const parisMs = (date, heure = '09:00') => {
    const [y, m, d] = date.split('-').map(Number), [h, mi] = heure.split(':').map(Number), g = Date.UTC(y, m - 1, d, h, mi);
    const vu = tz => new Date(new Date(g).toLocaleString('en-US', { timeZone: tz }));
    return g - (vu('Europe/Paris') - vu('UTC'));
  };
  const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function icsRdv(r, R) {
    const debut = parisMs(r.date, r.heure), fin = debut + (r.duree || 30) * 6e4;
    const t = x => String(x || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const quoi = r.type === 'visio' ? 'Visio' : 'Appel';
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Magnolia Traiteur//Back-office//FR', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${r.id}@magnoliatraiteur.fr`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(debut)}`, `DTEND:${icsDate(fin)}`,
      `SUMMARY:${t(quoi + ' Magnolia Traiteur' + (r.clientNom ? ' · ' + r.clientNom : ''))}`, `DESCRIPTION:${t([r.motif, r.lien ? 'Lien de la visio : ' + r.lien : '', R?.telephone ? 'Magnolia Traiteur : ' + R.telephone : ''].filter(Boolean).join('\n'))}`,
      ...(r.lien ? [`LOCATION:${t(r.lien)}`, `URL:${r.lien}`] : []), 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Rappel', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  const quandFr = r => `${dateFr(r.date, { weekday: 'long', day: 'numeric', month: 'long' })} à ${r.heure.replace(':', ' h ')}`;
  async function personnesDuRdv(r) {
    const R = (await cat.get()).reglages, P = (R.alertes?.personnes || []).filter(x => x.nom);
    const users = (await store.list('_users')).map(d => d.data).filter(u => !u.disabled);
    const qui = r.commerciaux?.length ? r.commerciaux : [...new Set([...P.map(x => x.nom), ...users.map(u => u.name)])];
    return qui.map(nom => { const p = P.find(x => nomCle(x.nom) === nomCle(nom)) || {}, u = users.find(x => nomCle(x.name) === nomCle(nom)) || {}; return { nom, email: p.email || u.email || '', tel: p.tel || u.portable || '' }; });
  }
  A.post('/actions/rdv-client/:id', sameSite, json, wrap(async (req, res) => {
    const c0 = await store.get('clients/' + req.params.id), c = c0 && { ...c0, id: req.params.id }; /* une fiche créée dans le back-office n'a pas toujours son id dans le document */
    if (!c) return res.status(404).json({ error: 'Client introuvable.' });
    if (String(c.societe || '').trim() && !c.entrepriseId) { /* Société pas encore reliée à sa fiche entreprise (site, import) : on la relie tout de suite */
      const d = { ...c0 }; await ENT.avantClient(d, { ...c0, societe: '' });
      if (d.entrepriseId) { await store.set('clients/' + req.params.id, d); c.entrepriseId = d.entrepriseId; }
    }
    const b = req.body || {}, type = b.type === 'visio' ? 'visio' : 'appel';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.heure || '')) return res.status(400).json({ error: 'Choisissez la date et l’heure.' });
    if (parisMs(b.date, b.heure) < Date.now() - 36e5) return res.status(400).json({ error: 'Cette date est déjà passée.' });
    await prendreEnCharge(demandesDuClient(c), req.ctx.name || req.ctx.email, type === 'visio' ? 'visio programmée' : 'appel programmé');
    const R = (await cat.get()).reglages;
    const id = 'r_' + rid(7), duree = [15, 30, 45, 60, 90].includes(+b.duree) ? +b.duree : 30;
    const perso = /^https:\/\/\S+$/.test(String(b.lienVisio || '').trim()) ? String(b.lienVisio).trim().slice(0, 300) : '';
    const lien = type === 'visio' ? perso || `https://meet.jit.si/MagnoliaTraiteur-${slugify(c.nom || 'client').replace(/-/g, '')}-${rid(6).replace(/[^A-Za-z0-9]/g, '')}` : '';
    const commerciaux = (Array.isArray(b.commerciaux) ? b.commerciaux : []).map(x => s(x, 80)).filter(Boolean).slice(0, 20);
    const reste = parisMs(b.date, b.heure) - Date.now();
    const r = { id, clientId: c.id, clientNom: c.nom || '', type, date: b.date, heure: b.heure, duree, motif: s(b.motif, 600), commerciaux, lien,
      titre: `${b.heure} · ${type === 'visio' ? '🎥 Visio' : '📞 Appel'} ${c.nom || ''}`.trim(), detail: s(b.motif, 600), statut: type, par: req.ctx.name || '', createdAt: new Date().toISOString(), envoye: {}, rappels: Object.fromEntries(RAPPELS.filter(([, ms]) => reste <= ms).map(([k]) => [k, 'inutile'])) };
    const ics = { name: 'rendez-vous-magnolia.ics', content: Buffer.from(icsRdv(r, R)).toString('base64') };
    const prenom = c.prenom || String(c.nom || '').split(' ')[0] || '';
    const avec = commerciaux.length === 1 ? ' avec ' + commerciaux[0] : '';
    if (b.envoyerEmail && c.email) {
      const x = await brevo.sendEmail({ to: c.email, name: c.nom, replyTo: R.email, subject: `Magnolia Traiteur : ${type === 'visio' ? 'notre visio' : 'notre appel'} ${quandFr(r)}`, attachment: [ics],
        html: `<p>Bonjour ${esc(prenom)},</p><p>${type === 'visio' ? `Nous vous proposons un rendez-vous en <b>visio</b>${esc(avec)} <b>${esc(quandFr(r))}</b> (environ ${duree} minutes).` : `Nous vous appellerons${esc(avec)} <b>${esc(quandFr(r))}</b>${c.tel ? ' au ' + esc(c.tel) : ''}.`}</p>${r.motif ? `<p>Objet : ${esc(r.motif)}</p>` : ''}${lien ? `<p><a href="${esc(lien)}" style="background:#1d3b2f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block">Rejoindre la visio</a></p><p style="font-size:13px;color:#666">Le lien s’ouvre sur ordinateur, tablette ou téléphone, sans rien installer : ${esc(lien)}</p>` : ''}<p>Le rendez-vous est joint à ce message : ouvrez-le pour l’ajouter à votre agenda.</p><p>À bientôt,<br>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p>`,
        text: `${type === 'visio' ? 'Visio' : 'Appel'} Magnolia Traiteur ${quandFr(r)}. ${r.motif || ''} ${lien}` });
      r.envoye.email = !x?.error && !x?.skipped;
    }
    if (b.envoyerSms && c.tel) {
      const x = await brevo.sendSms({ to: c.tel, content: `Magnolia Traiteur : ${type === 'visio' ? 'visio' : 'appel'}${avec} ${quandFr(r)}.${lien ? ' Lien : ' + lien : ''}`, lien: !lien });
      r.envoye.sms = !x?.error && !x?.skipped;
    }
    await store.set('rdv/' + id, r);
    /* chaque commercial concerné reçoit le rendez-vous pour son propre agenda (Google, iPhone…) */
    for (const p of await personnesDuRdv(r)) if (p.email) brevo.sendEmail({ to: p.email, name: p.nom, subject: `${type === 'visio' ? 'Visio' : 'Appel'} avec ${c.nom || 'un client'} ${quandFr(r)}`, attachment: [ics],
      html: `<p>${type === 'visio' ? 'Visio' : 'Appel'} programmé par ${esc(r.par)} avec <b>${esc(c.nom || '')}</b>${c.tel ? ' (' + esc(c.tel) + ')' : ''} <b>${esc(quandFr(r))}</b>.</p>${r.motif ? `<p>Motif : ${esc(r.motif)}</p>` : ''}${lien ? `<p>Lien de la visio : <a href="${esc(lien)}">${esc(lien)}</a></p>` : ''}<p><a href="${SITE}/admin#/clients/${c.id}">Ouvrir la fiche client</a></p>`, text: `${r.titre} ${quandFr(r)} ${lien}` }).catch(() => {});
    await store.set('clients/' + c.id, { ...(await store.get('clients/' + c.id)), derniereActivite: new Date().toISOString() });
    audit(req.ctx, type === 'visio' ? 'visio programmée' : 'appel programmé', 'rdv/' + id, `${c.nom} ${b.date} ${b.heure}`);
    res.json({ ok: true, id, lien, envoye: r.envoye, test: !brevo.live });
  }));
  /* rappels aux commerciaux concernés (règle de Jean-Luc, 2026-11-24) : SMS sur le portable + e-mail, 24 h, 4 h et 1 h avant.
     Vérifié chaque minute ; chaque rappel envoyé est noté sur le rendez-vous (jamais deux fois, même après un redémarrage).
     Rappel manqué (serveur arrêté) : on envoie seulement le plus proche encore utile ; un rendez-vous pris tard n'a que les rappels encore à venir. */
  const RAPPELS = [['24h', 24 * 36e5, 'demain'], ['4h', 4 * 36e5, 'dans 4 h'], ['1h', 36e5, 'dans 1 h']];
  async function rappelsRdv(now = Date.now()) {
    let n = 0;
    for (const { id, data: r } of await store.list('rdv')) {
      if (!r.clientId || !r.type || r.fait || !r.date || !r.heure) continue;
      const t = parisMs(r.date, r.heure); if (t <= now) continue;
      const faits = r.rappels || {}, dus = RAPPELS.filter(([k, ms]) => !faits[k] && t - now <= ms);
      if (!dus.length) continue;
      const [k, , quand] = dus[dus.length - 1];
      const c = await store.get('clients/' + r.clientId) || {};
      const jour = new Date(t).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) === new Date(now).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) ? 'aujourd’hui' : quandFr(r).split(' à ')[0];
      const txt = `Rappel Magnolia (${quand}) : ${r.type === 'visio' ? 'visio' : 'appel'} ${jour} à ${r.heure.replace(':', 'h')} avec ${r.clientNom}${c.tel ? ' ' + c.tel : ''}${r.motif ? '. ' + r.motif.slice(0, 90) : ''}${r.lien ? ' ' + r.lien : ''}`;
      for (const p of await personnesDuRdv(r)) {
        if (p.tel) await brevo.sendSms({ to: p.tel, content: txt, lien: false });
        if (p.email) await brevo.sendEmail({ to: p.email, name: p.nom, subject: `Rappel (${quand}) : ${r.type === 'visio' ? 'visio' : 'appel'} avec ${r.clientNom}`, html: `<p>${esc(txt)}</p><p><a href="${SITE}/admin#/clients/${r.clientId}">Ouvrir la fiche client</a></p>`, text: txt });
      }
      const at = new Date(now).toISOString();
      await store.set('rdv/' + id, { ...r, rappels: { ...faits, ...Object.fromEntries(dus.map(([x]) => [x, x === k ? at : 'passé'])) } });
      n++;
    }
    return n;
  }
  app.locals.rappelsRdv = rappelsRdv;

  /* ---------- anniversaires des clients : rappel sur le tableau de bord et dans l'agenda, message de vœux par e-mail ou SMS ---------- */
  function prochainAnniv(naissance, ref = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(naissance || '')) return null;
    const [y, m, d] = naissance.split('-').map(Number), j0 = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    let a = new Date(j0.getFullYear(), m - 1, d); if (a < j0) a = new Date(j0.getFullYear() + 1, m - 1, d);
    const iso = `${a.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { date: iso, dans: Math.round((a - j0) / 864e5), age: a.getFullYear() - y };
  }
  async function anniversaires(jours = 14) {
    const out = [];
    for (const { id, data: c } of await store.list('clients')) {
      const a = prochainAnniv(c.naissance); if (!a || a.dans > jours) continue;
      out.push({ id, nom: c.nom, tel: c.tel || '', email: c.email || '', ...a, souhaite: (c.anniversaires || []).includes(a.date.slice(0, 4)), stopEmail: !!c.desinscrit?.email, stopSms: !!c.desinscrit?.sms });
    }
    return out.sort((x, y) => x.dans - y.dans);
  }
  A.get('/actions/anniversaires', wrap(async (req, res) => res.json(await anniversaires(Math.min(366, +req.query.jours || 14)))));
  A.post('/actions/anniversaire/:id', sameSite, json, wrap(async (req, res) => {
    const c0 = await store.get('clients/' + req.params.id), c = c0 && { ...c0, id: req.params.id }; /* une fiche créée dans le back-office n'a pas toujours son id dans le document */
    if (!c) return res.status(404).json({ error: 'Client introuvable.' });
    const canal = req.body?.canal === 'sms' ? 'sms' : 'email', R = (await cat.get()).reglages;
    const prenom = c.prenom || String(c.nom || '').split(' ').filter(w => w !== w.toLocaleUpperCase('fr-FR') || w.length < 2)[0] || String(c.nom || '').split(' ')[0] || '';
    const texte = s(req.body?.texte, 600) || `Joyeux anniversaire ${prenom} ! Toute l’équipe Magnolia Traiteur vous souhaite une très belle journée.`;
    if (canal === 'sms') { if (!c.tel) return res.status(400).json({ error: 'Pas de téléphone sur la fiche.' }); const r = await brevo.sendSms({ to: c.tel, content: texte }); if (r?.error || r?.skipped) return res.status(400).json({ error: 'SMS non parti : ' + (r.error || r.skipped) }); }
    else { if (!c.email) return res.status(400).json({ error: 'Pas d’e-mail sur la fiche.' }); const r = await brevo.sendEmail({ to: c.email, name: c.nom, replyTo: R.email, subject: `Joyeux anniversaire ${prenom} !`, html: `<p>${esc(texte)}</p><p>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p>`, text: texte }); if (r?.error || r?.skipped) return res.status(400).json({ error: 'E-mail non parti : ' + (r.error || r.skipped) }); }
    const now = new Date().toISOString(), an = prochainAnniv(c.naissance, new Date(Date.now() - 3 * 864e5))?.date.slice(0, 4) || now.slice(0, 4);
    await store.set('clients/' + c.id, { ...c, anniversaires: [...new Set([...(c.anniversaires || []), an])], journal: [...(c.journal || []), { id: rid(6), at: now, type: 'note', texte: `🎂 Message d’anniversaire envoyé par ${canal === 'sms' ? 'SMS' : 'e-mail'} : « ${texte} »`, par: req.ctx.name || '' }] });
    audit(req.ctx, 'anniversaire souhaité', 'clients/' + c.id, canal);
    res.json({ ok: true });
  }));

  /* ---------- historique complet d'un client (fiche CRM) : demandes, devis, signatures, factures, règlements, e-mails et SMS, appels, notes ---------- */
  const telCourt = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('0033')) d = d.slice(4); else if (d.startsWith('33') && d.length === 11) d = d.slice(2); return d.replace(/^0/, ''); };
  A.get('/actions/historique-client/:id', wrap(async (req, res) => {
    const c0 = await store.get('clients/' + req.params.id), c = c0 && { ...c0, id: req.params.id }; /* une fiche créée dans le back-office n'a pas toujours son id dans le document */
    if (!c) return res.status(404).json({ error: 'Client introuvable.' });
    const [dem, dv, fac, out, rdv, camps] = await Promise.all(['demandes', 'devis', 'factures', '_outbox', 'rdv', '_campagnes'].map(k => store.list(k).then(l => l.map(x => x.data))));
    const vis = await visibles(req); /* « seulement ses opportunités » : les dossiers des autres commerciaux n'apparaissent pas */
    const demandes = dem.filter(d => d.clientId === c.id && (!vis || vis.demandes.has(d.id)));
    const devisL = dv.filter(d => (d.clientId === c.id || (d.demandeId && demandes.some(x => x.id === d.demandeId))) && (!vis || vis.devis.has(d.id)));
    const facts = req.ctx.droits.factures ? fac.filter(f => (f.clientId === c.id || devisL.some(d => d.id === f.devisId)) && (!vis || vis.factures.has(f.id))) : [];
    const mails = [c.email, ...demandes.map(d => d.contact?.email)].filter(Boolean).map(x => String(x).trim().toLowerCase());
    const tels = [c.tel, ...demandes.map(d => d.contact?.tel)].map(telCourt).filter(x => x.length >= 8);
    const ev = [];
    const add = (at, type, titre, o = {}) => { if (at) ev.push({ at, type, titre, ...o }); };
    const lbl = { demande: 'Demande', devis_envoye: 'Devis envoyé', relance: 'Relance', accord: 'Accord du client', reserve: 'Réservé (acompte reçu)', refuse: 'Refusé', termine: 'Terminé' };
    for (const d of demandes) {
      const e = d.evenement || {};
      add(d.createdAt, 'demande', d.type === 'contact' ? `Message reçu : ${d.sujet || 'question'}` : `Demande de devis ${d.ref || ''}`.trim(), { detail: [e.type, e.date ? dateFr(e.date) : '', e.invites ? e.invites + ' pers.' : '', e.ville].filter(Boolean).join(' · ') + (d.message ? '\n« ' + String(d.message).slice(0, 400) + ' »' : ''), montantCents: d.totalEstimeCents || null, montantLib: 'estimé', par: d.source || (d.lignes?.length ? 'site' : ''), lien: '#/demandes/' + d.id });
      for (const h of (d.historique || []).slice(1)) if (!['devis_envoye', 'relance'].includes(h.statut)) add(h.at, 'statut', 'Étape : ' + (lbl[h.statut] || h.statut), { par: h.par, ref: d.ref, lien: '#/demandes/' + d.id });
      for (const r of d.relancesNotees || []) add(r.at, r.how === 'appel' ? 'appel' : 'note', r.how === 'appel' ? 'Appel téléphonique' : 'Relance faite (notée)', { par: r.par, ref: d.ref });
      if (d.notes) add(d.updatedAt || d.createdAt, 'note', 'Note sur la demande ' + (d.ref || ''), { detail: d.notes, fixe: true });
    }
    const lies = []; /* envois déjà montrés : on ne répète pas l'e-mail correspondant */
    for (const d of devisL) {
      const t = totaux(d), num = d.numero || '';
      add(d.createdAt, 'devis', `Devis ${num} préparé${d.auto ? ' par l’IA' : ''}`, { montantCents: t.ttcCents, par: d.auto ? '' : d.commercial?.nom || '', lien: '#/devis/' + d.id, statutDevis: d.statut });
      for (const x of d.envois || []) { add(x.at, 'envoi', `Devis ${num} envoyé par ${x.ia ? 'l’IA' : x.par || 'l’équipe'}`, { detail: (x.ia ? 'Envoi automatique, aussitôt la demande reçue, ' : '') + 'par ' + (x.canaux || ['email']).map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' et '), montantCents: t.ttcCents, par: x.ia ? '✨ IA' : x.par, lien: d.token ? '/devis/' + d.token : '' }); lies.push([x.at, num]); }
      if (d.vuLe) add(d.vuLe, 'vu', `Le client a ouvert le devis ${num}`);
      for (const r of d.relances || []) { add(r.at, 'relance', `Relance : ${r.modele || ''}`.trim(), { detail: 'Devis ' + num, par: r.par }); lies.push([r.at, num, true]); }
      for (const m of d.commentaires || []) add(m.at, 'commentaire', `Commentaire du client sur le devis ${num}`, { detail: m.texte, lien: '#/devis/' + d.id });
      if (d.signature) add(d.signature.at, 'signe', `Devis ${num} signé en ligne`, { detail: 'Signé par ' + (d.signature.nom || ''), montantCents: t.ttcCents, lien: d.token ? '/devis/' + d.token : '' });
      if (d.refuseLe) add(d.refuseLe, 'refus', `Devis ${num} refusé par le client`);
    }
    const typeF = { acompte: 'd’acompte', solde: 'de solde', totale: '' };
    for (const f of facts) {
      if (f.type === 'avoir') { add(f.createdAt, 'facture', `Avoir ${f.numero} (annule la facture ${f.factureNumero || ''})`, { montantCents: -(f.totalCents || 0), detail: f.motif || '', par: f.creePar || '', lien: '#/factures/' + f.id }); continue; }
      add(f.createdAt, 'facture', `Facture ${typeF[f.type] || ''} ${f.numero} créée`.replace(/\s+/g, ' '), { montantCents: f.totalCents, detail: f.devisNumero ? 'Devis ' + f.devisNumero : '', par: f.creePar || '', lien: '#/factures/' + f.id });
      const can = x => (x.canaux || ['email']).map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' et ');
      if (f.envois?.length) for (const x of f.envois) { add(x.at, 'envoi', `Facture ${f.numero} envoyée par ${can(x)}`, { detail: x.regleCents ? `Acomptes versés ${euros(x.regleCents)} · solde ${euros(x.resteCents)}` : '', par: x.par, lien: f.token ? '/facture/' + f.token : '' }); lies.push([x.at, f.numero]); }
      else if (f.envoyeeLe) { add(f.envoyeeLe, 'envoi', `Facture ${f.numero} envoyée par e-mail`, { lien: f.token ? '/facture/' + f.token : '' }); lies.push([f.envoyeeLe, f.numero]); }
      for (const x of f.relances || []) { add(x.at, 'relance', `Relance du solde : facture ${f.numero}`, { detail: `par ${can(x)} · solde ${euros(x.resteCents)}`, par: x.par }); lies.push([x.at, f.numero]); }
      if (f.reglements?.length) for (const r of FAC.libelles(f)) add(r.at || r.date, 'paiement', `${r.libelle} reçu le ${dateFr(r.date)} : facture ${f.numero}`, { montantCents: r.montantCents, detail: r.moyen + (r.note ? ' · ' + r.note : ''), par: r.par });
      else if (f.payee && f.payeeLe) add(f.payeeLe, 'paiement', `Règlement reçu : facture ${f.numero}`, { montantCents: f.totalCents, detail: f.moyen || '' });
      if (f.annuleeParAvoir) add(f.annuleeParAvoir.le, 'note', `Facture ${f.numero} annulée par l’avoir ${f.annuleeParAvoir.numero}`, { par: f.annuleeParAvoir.par });
      if (f.archiveeLe && f.archivee) add(f.archiveeLe, 'note', `Facture ${f.numero} archivée (réglée)`);
    }
    const proche = (at, txt) => lies.some(([x, num, rel]) => Math.abs(Date.parse(x) - Date.parse(at)) < 120000 && (rel || (num && String(txt).includes(num))));
    for (const o of out) {
      const p = o.payload || {}, ko = o.result?.error ? ' (échec : ' + o.result.error + ')' : o.result === 'test' ? ' (mode essai, non parti)' : '';
      if (o.kind === 'email' && (p.to || []).some(t => mails.includes(String(t.email || '').toLowerCase())) && !proche(o.at, p.subject)) add(o.at, 'email', 'E-mail envoyé : ' + (p.subject || ''), { detail: ko.trim() });
      if (o.kind === 'sms' && tels.length && tels.includes(telCourt(p.recipient)) && !proche(o.at, p.content)) add(o.at, 'sms', 'SMS envoyé', { detail: String(p.content || '').slice(0, 300) + ko });
    }
    for (const cp of camps) if ((cp.ids || []).includes(c.id)) {
      const ko = (cp.echecs || []).find(x => x.id === c.id);
      add(cp.at, cp.canal === 'sms' ? 'sms' : 'email', cp.canal === 'sms' ? 'SMS d’information envoyé' : 'E-mail d’information envoyé : ' + (cp.message?.objet || ''), { par: cp.par, detail: (cp.canal === 'sms' ? String(cp.message?.texte || '').slice(0, 300) : '') + (ko ? ' (échec : ' + ko.raison + ')' : cp.live ? '' : ' (mode essai, non parti)') });
    }
    if (c.desinscrit?.email) add(c.desinscrit.leEmail || c.desinscrit.le, 'note', 'Désinscrit des e-mails d’information');
    if (c.desinscrit?.sms) add(c.desinscrit.leSms || c.desinscrit.le, 'note', 'Ne veut plus de SMS d’information');
    for (const r of rdv) if (r.clientId === c.id) {
      if (r.type) { add(r.createdAt, 'rdv', `${r.type === 'visio' ? 'Visio' : 'Appel'} programmé ${quandFr(r)}`, { detail: [r.motif, r.commerciaux?.length ? 'Avec ' + r.commerciaux.join(', ') : 'Toute l’équipe', r.envoye?.email || r.envoye?.sms ? 'Invitation envoyée au client par ' + [r.envoye.email ? 'e-mail' : '', r.envoye.sms ? 'SMS' : ''].filter(Boolean).join(' et ') : ''].filter(Boolean).join('\n'), par: r.par, lien: r.lien || '' }); continue; }
      add(r.date + 'T' + (/^\d\d:\d\d/.test(r.titre) ? r.titre.slice(0, 5) : '09:00'), 'rdv', 'Rendez-vous : ' + r.titre, { detail: r.detail || '' });
    }
    for (const j of c.journal || []) add(j.at, j.type === 'appel' ? 'appel' : 'note', j.type === 'appel' ? 'Appel téléphonique' : 'Note', { detail: j.texte, par: j.par, jid: j.id });
    if (c.creeLe) add(c.creeLe, 'client', 'Fiche client créée', { par: c.source || '' });
    /* historique commercial de l'ancien CRM (Teamleader) : une ligne par affaire, au jour de la signature (ou du refus) */
    const factTlC = (await facturesTlVisibles(req)).filter(f => f.clientId === c.id).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    for (const f of factTlC) add(f.date + 'T11:00:00', 'factureTl', `Facture ${f.numero}${f.oppTitre ? ' · ' + f.oppTitre : ''}`, { montantCents: f.netTtcCents, montantLib: 'TTC', detail: [f.entite, f.duCents ? `Reste dû ${euros(f.duCents)}` : f.payeLe ? 'Payée le ' + dateFr(f.payeLe) : 'Payée', f.creditHtCents ? 'avoir ' + euros(f.creditHtCents) + ' HT' : '', 'Ancien CRM (Teamleader)'].filter(Boolean).join(' · ') });
    const affaires = (await affairesVisibles(req)).filter(a => a.clientId === c.id).sort((a, b) => String(b.dateEvt || b.accepteLe).localeCompare(String(a.dateEvt || a.accepteLe)));
    for (const a of affaires) {
      const quoi = [a.evenement || 'Événement', a.age ? a.age + ' ans' : '', a.dateEvt ? 'le ' + dateFr(a.dateEvt) : '', a.invites ? a.invites + ' pers.' : ''].filter(Boolean).join(' · ');
      const detail = [a.lieu ? '📍 ' + a.lieu : '', a.source ? '🧭 ' + a.source : '', a.statut === 'gagnee' && a.facture ? 'Facturé : ' + a.facture : '', a.motif ? 'Motif : ' + a.motif : '', 'Ancien CRM (Teamleader)'].filter(Boolean).join(' · ');
      const jourA = (a.statut === 'perdue' ? a.refuseLe : a.accepteLe) || a.ajouteLe || a.dateEvt;
      add(jourA ? jourA + 'T12:00:00' : '', a.statut === 'perdue' ? 'affairePerdue' : 'affaire', `${a.statut === 'gagnee' ? 'Commande' : a.statut === 'perdue' ? 'Affaire perdue' : 'Affaire en cours'} : ${quoi}`, { montantCents: a.montantHtCents, montantLib: 'HT', detail, par: a.commercial || '' });
    }
    ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const signes = devisL.filter(d => d.statut === 'accepte');
    res.json({
      client: { ...c, canalAuto: SRC.canalClient(c) }, events: ev,
      facturesTl: factTlC.length ? { ...HIST.resumeFactures(factTlC), liste: factTlC.map(f => ({ numero: f.numero, entite: f.entite, date: f.date, netHtCents: f.netHtCents, netTtcCents: f.netTtcCents, duCents: f.duCents, payeLe: f.payeLe, oppTitre: f.oppTitre, creditHtCents: f.creditHtCents })) } : null,
      historique: affaires.length ? { ...HIST.resumeClient(affaires), affaires: affaires.map(a => ({ id: a.id, statut: a.statut, evenement: a.evenement, age: a.age, dateEvt: a.dateEvt, accepteLe: a.accepteLe, refuseLe: a.refuseLe, invites: a.invites, lieu: a.lieu, montantHtCents: a.montantHtCents, margeHtCents: a.margeHtCents, facture: a.facture, source: a.source, commercial: a.commercial, motif: a.motif })) } : null,
      rdv: rdv.filter(r => r.clientId === c.id && r.type).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)),
      demandes: demandes.map(d => ({ id: d.id, ref: d.ref, statut: d.statut, type: d.type, evenement: d.evenement, createdAt: d.createdAt, commercial: d.commercial || '', canal: SRC.canalDemande(d, c) })),
      devis: devisL.map(d => ({ id: d.id, numero: d.numero, statut: d.statut, ttcCents: totaux(d).ttcCents, token: d.statut !== 'brouillon' ? d.token : '', evenement: d.evenement, createdAt: d.createdAt, commercial: d.commercial?.nom || '' })),
      factures: facts.map(f => { const e = FAC.etat(f); return { id: f.id, numero: f.numero, type: f.type, totalCents: f.totalCents, regleCents: e.regleCents, resteCents: e.resteCents, nbReglements: e.reglements.length, payee: e.payee, annulee: !!f.annuleeParAvoir, archivee: !!f.archivee, payeeLe: f.payeeLe, moyen: f.moyen }; }),
      resume: { signeCents: signes.reduce((s2, d) => s2 + totaux(d).ttcCents, 0), regleCents: facts.filter(f => f.type !== 'avoir' && !f.annuleeParAvoir).reduce((s2, f) => s2 + FAC.etat(f).regleCents, 0), aEncaisserCents: facts.filter(f => f.type !== 'avoir' && !f.annuleeParAvoir).reduce((s2, f) => s2 + FAC.etat(f).resteCents, 0), nbDevis: devisL.length, nbSignes: signes.length, nbDemandes: demandes.filter(d => d.type !== 'contact').length },
    });
  }));
  /* note ou appel ajouté depuis la fiche client */
  A.post('/actions/client-journal/:id', sameSite, json, wrap(async (req, res) => {
    const c0 = await store.get('clients/' + req.params.id), c = c0 && { ...c0, id: req.params.id }; /* une fiche créée dans le back-office n'a pas toujours son id dans le document */
    if (!c) return res.status(404).json({ error: 'Client introuvable.' });
    const texte = s(req.body?.texte, 2000), type = req.body?.type === 'appel' ? 'appel' : 'note';
    if (req.body?.supprimer) { await store.set('clients/' + c.id, { ...c, journal: (c.journal || []).filter(j => j.id !== req.body.supprimer) }); return res.json({ ok: true }); }
    if (type === 'note' && !texte) return res.status(400).json({ error: 'Écrivez la note.' });
    const now = new Date().toISOString();
    await store.set('clients/' + c.id, { ...c, derniereActivite: now, journal: [...(c.journal || []), { id: rid(6), at: now, type, texte, par: req.ctx.name || req.ctx.email || '' }] });
    await prendreEnCharge(demandesDuClient(c), req.ctx.name || req.ctx.email, type === 'appel' ? 'appel noté' : 'note');
    audit(req.ctx, type === 'appel' ? 'appel noté' : 'note client', 'clients/' + c.id, texte.slice(0, 80));
    res.json({ ok: true });
  }));

  /* ---------- envois groupés : Clients › « Envoyer un e-mail » / « Envoyer un SMS » ----------
     sélection multicritère faite ici (le fichier clients peut compter des dizaines de milliers de fiches),
     rédaction par l'IA, aperçu, envoi d'essai, envoi réel en arrière-plan, une trace par envoi (_campagnes) relue par l'historique client */
  let profilsCache = null;
  async function lesProfils() {
    if (profilsCache && Date.now() - profilsCache.at < 30e3) return profilsCache.l;
    const [cl, dem, dv, fa] = await Promise.all(['clients', 'demandes', 'devis', 'factures'].map(k => store.list(k)));
    const l = DIF.profils({ clients: cl.filter(x => x.data).map(x => ({ ...x.data, id: x.data.id || x.id })), demandes: dem.map(x => x.data), devis: dv.map(x => x.data), factures: fa.map(x => x.data), totaux });
    profilsCache = { at: Date.now(), l };
    return l;
  }
  let secretP = null; /* une seule lecture / création, même si plusieurs envois partent en même temps */
  function secretDesinscription() {
    if (env.UNSUBSCRIBE_SECRET) return Promise.resolve(env.UNSUBSCRIBE_SECRET);
    return (secretP ||= (async () => {
      let x = await store.get('_secret/desinscription');
      if (!x) { x = { v: rid(32) }; await store.set('_secret/desinscription', x); }
      return x.v;
    })().catch(e => { secretP = null; throw e; }));
  }
  const lienDesinscription = async id => SITE + '/desinscription?c=' + encodeURIComponent(id) + '&t=' + DIF.jeton(await secretDesinscription(), id);
  const canalDe = v => (v === 'sms' ? 'sms' : 'email');
  const critDe = b => ({ statut: ['commandes', 'prospects'].includes(b?.statut) ? b.statut : '', montantMin: Math.max(0, Math.round(+b?.montantMin || 0)), deps: (Array.isArray(b?.deps) ? b.deps : []).map(x => s(x, 3)).slice(0, 120), types: (Array.isArray(b?.types) ? b.types : []).map(x => s(x, 60)).slice(0, 40), pro: ['pro', 'part'].includes(b?.pro) ? b.pro : '', accord: !!b?.accord, metiers: (Array.isArray(b?.metiers) ? b.metiers : []).map(x => s(x, 60)).slice(0, 40), dj: (Array.isArray(b?.dj) ? b.dj : []).map(x => s(x, 60)).slice(0, 40), contactDe: (Array.isArray(b?.contactDe) ? b.contactDe : []).map(x => s(x, 80)).slice(0, 60), civ: ['Mme', 'M.'].includes(b?.civ) ? b.civ : '' });
  /* destinataires : mode « critères » (tous ceux qui correspondent, moins ceux décochés) ou « un par un » (seulement ceux cochés) */
  function destinataires(l, canal, b) {
    const base = DIF.filtrer(l, canal, critDe(b?.criteres));
    if (b?.mode === 'manuel') { const ins = new Set((b.inclus || []).map(String)); return DIF.filtrer(l, canal, {}).filter(p => ins.has(p.id)); }
    const ex = new Set((b?.exclus || []).map(String));
    return base.filter(p => !ex.has(p.id));
  }
  A.get('/diffusion/criteres', wrap(async (req, res) => {
    profilsCache = null; /* chaque ouverture de l'écran repart de données fraîches */
    const l = await lesProfils(), deps = new Map(), types = new Map(), mets = new Map(), djs = new Map(), cde = new Map();
    const plus1 = (m, x) => { if (x) m.set(x, (m.get(x) || 0) + 1); };
    for (const p of l) { for (const d of p.deps) plus1(deps, d); for (const t of p.types) plus1(types, t); p.metiers.forEach(x => plus1(mets, x)); p.dj.forEach(x => plus1(djs, x)); plus1(cde, p.contactDe); }
    const parNb = m => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'fr'));
    const R = (await cat.get()).reglages;
    res.json({
      total: l.length, email: DIF.filtrer(l, 'email').length, sms: DIF.filtrer(l, 'sms').length,
      stopEmail: l.filter(p => p.stopEmail).length, stopSms: l.filter(p => p.stopSms).length,
      deps: [...deps].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true })), types: [...types].sort((a, b) => b[1] - a[1]), metiers: parNb(mets), dj: parNb(djs), contactDe: parNb(cde),
      ia: ia.actif, brevo: brevo.live, lienSms: await lienSms(), moi: { email: req.ctx.email || '', tel: String(R.alertes?.sms || '').split(/[,;]/)[0].trim() }, creneauSms: DIF.creneauSms(),
    });
  }));
  A.post('/diffusion/selection', sameSite, json, wrap(async (req, res) => {
    const l = await lesProfils(), canal = canalDe(req.body?.canal), b = req.body || {};
    const choisis = destinataires(l, canal, b), ids = new Set(choisis.map(p => p.id));
    /* liste affichée : en mode critères, ceux qui correspondent ; en mode un par un, tout le fichier joignable */
    const k = critDe(b.criteres);
    let vue = b.mode === 'manuel' ? DIF.filtrer(l, canal, { q: b.q }) : DIF.filtrer(l, canal, { ...k, q: b.q });
    if (b.seulementCoches) vue = vue.filter(p => ids.has(p.id));
    vue.sort((a, c) => (c.totalCents - a.totalCents) || String(c.derniere).localeCompare(String(a.derniere)));
    const page = Math.max(0, +b.page | 0), N = 50;
    res.json({
      nb: choisis.length, correspondent: b.mode === 'manuel' ? null : DIF.filtrer(l, canal, k).length, vue: vue.length, page, pages: Math.ceil(vue.length / N),
      lignes: vue.slice(page * N, page * N + N).map(p => ({ id: p.id, nom: p.nom, societe: p.societe, contact: canal === 'email' ? p.email : p.tel, deps: p.deps, totalCents: p.totalCents, nbCommandes: p.nbCommandes, derniere: p.derniere, coche: ids.has(p.id) })),
    });
  }));
  /* rédaction par l'IA */
  A.post('/ia/diffusion-email', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const infos = s(req.body?.infos, 6000);
    if (infos.length < 5) return res.status(400).json({ error: 'Écrivez d’abord les informations à faire passer.' });
    try { res.json(IA.nettoyerEmail(IA.json(await ia.demander(IA.promptEmail(infos, { ton: s(req.body?.ton, 60), site: SITE }), { effort: 'medium' })), SITE)); }
    catch (e) { iaErreur(res, e); }
  }));
  A.post('/ia/diffusion-sms', sameSite, json, wrap(async (req, res) => {
    if (!iaLimit(req.ctx.uid)) return res.status(429).json({ error: 'Trop de demandes : réessayez dans une minute.' });
    const infos = s(req.body?.infos, 4000), nbSms = Math.min(3, Math.max(1, +req.body?.nbSms | 0 || 1));
    if (infos.length < 5) return res.status(400).json({ error: 'Écrivez d’abord les informations à faire passer.' });
    /* place restante une fois la mention STOP ajoutée (format standard : 160 puis 153 caractères par SMS) */
    const L = await lienSms();
    const max = (nbSms === 1 ? 160 : nbSms * 153) - (DIF.STOP_AFFICHE.length + 1) - (L ? L.length + 1 : 0);
    try {
      let texte = '';
      for (let essai = 0; essai < 2; essai++) {
        texte = DIF.versGsm(s(IA.json(await ia.demander(IA.promptSms(infos, { nbSms, max: max - 8 - essai * 15 }))).texte, 700));
        if (DIF.comptage(DIF.smsFinal(texte, { prenom: 'Alexandra', lien: L })).sms <= nbSms) break;
      }
      res.json({ texte });
    } catch (e) { iaErreur(res, e); }
  }));
  /* message propre, tel qu'il partira */
  function messageDe(b, canal) {
    const m = b?.message || {};
    if (canal === 'sms') return { texte: s(m.texte, 700) };
    const bouton = m.bouton && s(m.bouton.texte, 40) ? { texte: s(m.bouton.texte, 40), lien: s(m.bouton.lien, 300) } : null;
    return { objet: s(m.objet, 150), titre: s(m.titre, 150), corps: s(m.corps, 8000), photo: /^(\/|https:\/\/)/.test(s(m.photo, 400)) ? s(m.photo, 400) : '', bouton };
  }
  const verifier = async (m, canal) => canal === 'sms' ? (!m.texte ? 'Écrivez le SMS.' : DIF.comptage(DIF.smsFinal(m.texte, { prenom: 'Alexandra', lien: await lienSms() })).sms > 3 ? 'Le SMS est trop long : 3 SMS au maximum.' : '') : (!m.objet ? 'Écrivez l’objet de l’e-mail.' : !m.corps ? 'Écrivez le texte de l’e-mail.' : '');
  A.post('/diffusion/apercu', sameSite, json, wrap(async (req, res) => {
    const canal = canalDe(req.body?.canal), m = messageDe(req.body, canal), R = (await cat.get()).reglages;
    const prenom = DIF.prenomDe(req.body?.prenom) || 'Alexandra';
    if (canal === 'sms') { const t = DIF.smsFinal(m.texte, { prenom, lien: await lienSms() }); return res.json({ texte: t.replace(DIF.STOP, DIF.STOP_AFFICHE), ...DIF.comptage(t) }); }
    res.json({ html: DIF.emailHtml({ ...m, prenom, R, site: SITE, lienDesinscription: SITE + '/desinscription', apercu: true }) });
  }));
  async function envoyerUn(canal, m, p, R, extra = {}) {
    const prenom = DIF.prenomDe(p.nom);
    if (canal === 'sms') {
      const t = DIF.smsFinal(m.texte, { prenom }), k = DIF.comptage(t);
      return brevo.sendSms({ to: p.mobile || p.tel, content: t, type: 'marketing', tag: extra.tag || 'information', unicode: k.unicode, journal: extra.journal });
    }
    const lien = p.id ? await lienDesinscription(p.id) : SITE + '/desinscription';
    return brevo.sendEmail({ to: p.email, name: p.nom, subject: m.objet, replyTo: R.email, tags: [extra.tag || 'information'], journal: extra.journal,
      headers: p.id ? { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
      html: DIF.emailHtml({ ...m, prenom, R, site: SITE, lienDesinscription: lien }), text: DIF.emailTexte({ ...m, prenom, R, site: SITE, lienDesinscription: lien }) });
  }
  A.post('/diffusion/essai', sameSite, json, wrap(async (req, res) => {
    const canal = canalDe(req.body?.canal), m = messageDe(req.body, canal), R = (await cat.get()).reglages;
    const err = await verifier(m, canal); if (err) return res.status(400).json({ error: err });
    const a = s(req.body?.a, 160);
    if (canal === 'sms') {
      if (!DIF.mobile(a)) return res.status(400).json({ error: 'Indiquez votre numéro de portable (06 ou 07).' });
      const cr = DIF.creneauSms(); if (!cr.ok) return res.status(400).json({ error: cr.raison });
    } else if (!isEmail(a)) return res.status(400).json({ error: 'Indiquez votre adresse e-mail.' });
    const r = await envoyerUn(canal, { ...m, objet: m.objet ? '[ESSAI] ' + m.objet : '' }, { id: '', nom: req.ctx.name || '', email: a, tel: a, mobile: DIF.mobile(a) }, R, { tag: 'essai' });
    if (r?.error || r?.skipped) return res.status(502).json({ error: 'L’envoi d’essai a échoué : ' + (r.error || r.skipped) });
    res.json({ ok: true, test: !!r?.test });
  }));
  const campagnesEnCours = new Map();
  A.post('/diffusion/envoyer', sameSite, json, wrap(async (req, res) => {
    const canal = canalDe(req.body?.canal), m = messageDe(req.body, canal), R = (await cat.get()).reglages;
    const err = await verifier(m, canal); if (err) return res.status(400).json({ error: err });
    if (canal === 'sms') { const cr = DIF.creneauSms(); if (!cr.ok) return res.status(400).json({ error: cr.raison }); }
    profilsCache = null;
    const liste = destinataires(await lesProfils(), canal, req.body);
    if (!liste.length) return res.status(400).json({ error: 'Aucun destinataire sélectionné.' });
    if (+req.body?.confirme !== liste.length) return res.status(409).json({ error: `Le nombre de destinataires a changé (${liste.length}). Vérifiez puis confirmez à nouveau.`, nb: liste.length });
    const id = 'cp_' + rid(8), now = new Date().toISOString();
    const nbSms = canal === 'sms' ? DIF.comptage(DIF.smsFinal(m.texte, { prenom: 'Alexandra', lien: await lienSms() })).sms : 0;
    const camp = { id, canal, message: m, criteres: critDe(req.body?.criteres), mode: req.body?.mode === 'manuel' ? 'manuel' : 'criteres', nb: liste.length, nbSms, ids: liste.map(p => p.id), envoyes: 0, echecs: [], statut: 'en_cours', live: brevo.live, at: now, par: req.ctx.name || req.ctx.email || '' };
    await store.set('_campagnes/' + id, camp);
    audit(req.ctx, canal === 'sms' ? 'SMS groupé envoyé' : 'e-mail groupé envoyé', '_campagnes/' + id, `${liste.length} destinataires · ${m.objet || m.texte.slice(0, 60)}`);
    res.json({ ok: true, id, nb: liste.length });
    /* envoi en arrière-plan, 5 à la fois pour l'e-mail, un par un pour le SMS ; avancement enregistré régulièrement */
    campagnesEnCours.set(id, camp);
    (async () => {
      const file = [...liste], par = canal === 'sms' ? 1 : 5;
      let n = 0;
      const travail = async () => {
        for (let p = file.shift(); p; p = file.shift()) {
          try { const r = await envoyerUn(canal, m, p, R, { tag: 'campagne-' + id, journal: false }); if (r?.error || r?.skipped) camp.echecs.push({ id: p.id, nom: p.nom, raison: String(r.error || r.skipped).slice(0, 160) }); }
          catch (e) { camp.echecs.push({ id: p.id, nom: p.nom, raison: e.message.slice(0, 160) }); }
          camp.envoyes++;
          if (++n % 25 === 0) await store.set('_campagnes/' + id, camp).catch(() => {});
        }
      };
      await Promise.all(Array.from({ length: par }, travail));
      camp.statut = 'termine'; camp.fini = new Date().toISOString(); camp.echecs = camp.echecs.slice(0, 500);
      await store.set('_campagnes/' + id, camp);
      campagnesEnCours.delete(id);
    })().catch(e => log.error?.('[diffusion]', e.message));
  }));
  const resumeCampagne = c => ({ id: c.id, canal: c.canal, objet: c.message?.objet || '', texte: c.canal === 'sms' ? c.message?.texte || '' : '', nb: c.nb, nbSms: c.nbSms || 0, envoyes: c.envoyes, nbEchecs: (c.echecs || []).length, echecs: (c.echecs || []).slice(0, 20), statut: c.statut, live: c.live, at: c.at, fini: c.fini || '', par: c.par });
  A.get('/diffusion/campagnes', wrap(async (req, res) => {
    const l = (await store.list('_campagnes')).map(x => campagnesEnCours.get(x.id) || x.data).filter(c => !req.query.canal || c.canal === req.query.canal);
    res.json(l.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30).map(resumeCampagne));
  }));
  A.get('/diffusion/campagnes/:id', wrap(async (req, res) => {
    const c = campagnesEnCours.get(req.params.id) || await store.get('_campagnes/' + req.params.id);
    if (!c) return res.status(404).json({ error: 'Envoi introuvable.' });
    res.json(resumeCampagne(c));
  }));

  A.get('/actions/agenda', wrap(async (req, res) => {
    const [dem, rdv, vis] = await Promise.all([store.list('demandes'), store.list('rdv'), visibles(req)]);
    const items = [
      ...dem.map(d => d.data).filter(d => !vis || vis.demandes.has(d.id)).filter(d => d.evenement?.date && d.type !== 'contact' && d.statut !== 'refuse').map(d => ({ id: d.id, type: 'evenement', date: d.evenement.date, titre: `${d.contact?.nom || ''} · ${d.evenement.type || ''}`, detail: `${d.evenement.invites || ''} pers. · ${d.evenement.ville || ''} · ${d.evenement.horaire || ''}`, statut: d.statut, commercial: d.commercial || '', lien: '#/demandes/' + d.id })),
      ...rdv.filter(r => !vis || !(r.data.commerciaux || []).length || r.data.commerciaux.some(n => vis.moi.has(nomCle(n)))).map(r => ({ id: r.id, type: 'rdv', ...r.data, visio: r.data.lien || '', lien: r.data.clientId ? '#/clients/' + r.data.clientId : '#/agenda' })),
      ...(await anniversaires(400)).map(a => ({ id: 'anniv-' + a.id, type: 'anniversaire', date: a.date, titre: '🎂 ' + a.nom, detail: `Anniversaire (${a.age} ans)`, statut: 'anniv', lien: '#/clients/' + a.id })),
    ];
    res.json(items.sort((a, b) => String(a.date).localeCompare(String(b.date))));
  }));

  /* équipe */
  /* fiche d'un membre : Prénom, Nom (en MAJUSCULES) et Portable ; les anciens comptes n'ont qu'un nom complet, découpé à l'affichage */
  const decouperNom = n => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); if (w.length < 2) return { prenom: w[0] || '', nomFamille: '' }; let i = w.findIndex((x, k) => k >= 1 && /\p{L}{2}/u.test(x) && x === x.toLocaleUpperCase('fr-FR')); if (i < 1) i = 1; return { prenom: w.slice(0, i).join(' '), nomFamille: w.slice(i).join(' ') }; };
  const partiesNom = u => { if (u.prenom !== undefined) return { prenom: u.prenom || '', nomFamille: u.nomFamille || '' }; const d = decouperNom(u.name); return { ...d, nomFamille: d.nomFamille.toLocaleUpperCase('fr-FR') }; };
  const portableNet = v => { const t = String(v || '').trim(); if (!t) return { ok: true, tel: '' }; const n = normTel(t); return n?.ok ? { ok: true, tel: n.tel } : { ok: false }; };
  A.get('/actions/equipe', wrap(async (req, res) => res.json((await store.list('_users')).map(d => ({ id: d.id, email: d.data.email, nom: d.data.name, ...partiesNom(d.data), portable: d.data.portable || '', role: d.data.role, droits: DR.droitsDe(d.data), desactive: !!d.data.disabled, creeLe: d.data.createdAt })))));
  A.get('/actions/droits', (req, res) => res.json({ droits: DR.DROITS, modeles: DR.MODELES }));
  /* on ne donne jamais un droit qu'on n'a pas soi-même (sinon : se créer un compte Administrateur) */
  const droitsInterdits = (req, d) => DR.CLES.filter(k => d[k] && !req.ctx.droits[k]);
  const adminsActifs = async sauf => (await store.list('_users')).filter(x => x.id !== sauf && !x.data.disabled && DR.droitsDe(x.data).admin).length;
  async function mailAcces({ email, nom, password }, par) {
    const R = (await cat.get()).reglages || {};
    const lien = SITE + '/admin';
    const prenom = esc(String(nom || '').split(' ')[0]);
    return brevo.sendEmail({ to: email, name: nom, subject: 'Vos accès au back-office Magnolia Traiteur',
      html: `<p>Bonjour ${prenom},</p><p>${esc(par || 'L’équipe')} vous a créé un accès au back-office de Magnolia Traiteur.</p><p><b>Adresse :</b> <a href="${esc(lien)}">${esc(lien)}</a><br><b>E-mail :</b> ${esc(email)}<br><b>Mot de passe provisoire :</b> ${esc(password)}</p><p>Après votre première connexion, changez ce mot de passe dans « Équipe &amp; activité › Mon mot de passe ».</p><p>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p>`,
      text: `Bonjour, vos accès au back-office Magnolia Traiteur : ${lien} — e-mail ${email} — mot de passe provisoire ${password}. Changez-le après votre première connexion.` });
  }
  A.post('/actions/equipe', sameSite, json, peut('equipe'), wrap(async (req, res) => {
    const b = req.body || {};
    const droits = b.droits ? DR.nettoyer(b.droits) : DR.nettoyer(b.role === 'manager' ? { admin: true } : DR.COLLAB_AVANT);
    const trop = droitsInterdits(req, droits); if (trop.length) return refus(res, trop[0]);
    const prenom = String(b.prenom ?? '').trim(), nomF = String(b.nomFamille ?? '').trim();
    const nomComplet = b.prenom !== undefined ? nomPropre(prenom, nomF) : nomPropre(String(b.nom || '').trim());
    if (b.prenom !== undefined && (!prenom || !nomF)) return res.status(400).json({ error: 'Écrivez le prénom et le nom.' });
    if (nomComplet.length < 2) return res.status(400).json({ error: 'Écrivez le prénom et le nom.' });
    const tel = portableNet(b.portable); if (!tel.ok) return res.status(400).json({ error: 'Portable illisible : écrivez-le comme 06 12 34 56 78.' });
    b.nom = nomComplet;
    try {
      const parts = decouperNom(nomComplet);
      const id = await createUser({ email: b.email, name: nomComplet.slice(0, 80), password: b.password, droits, prenom: b.prenom !== undefined ? nomPropre(prenom, '') : parts.prenom, nomFamille: b.prenom !== undefined ? nomF.toLocaleUpperCase('fr-FR') : parts.nomFamille, portable: tel.tel });
      audit(req.ctx, 'compte créé', '_users/' + id, b.email);
      let mail = null;
      if (b.envoyerAcces) { const r = await mailAcces({ email: String(b.email).trim().toLowerCase(), nom: nomPropre(String(b.nom).trim()), password: String(b.password) }, req.ctx.name); mail = { ok: !r?.error, live: brevo.live, erreur: r?.error || '' }; }
      res.json({ ok: true, id, mail });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  }));
  A.patch('/actions/equipe/:id', sameSite, json, peut('equipe'), wrap(async (req, res) => {
    const u = await store.get('_users/' + req.params.id); if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
    const b = req.body || {}, moi = req.params.id === req.ctx.uid;
    const avant = DR.droitsDe(u);
    if (avant.admin && !req.ctx.droits.admin) return res.status(403).json({ error: 'Seul un Administrateur peut modifier le compte d’un Administrateur.' });
    let droits = b.droits ? DR.nettoyer(b.droits) : ['manager', 'collab'].includes(b.role) ? DR.nettoyer(b.role === 'manager' ? { admin: true } : DR.COLLAB_AVANT) : null;
    if (droits && JSON.stringify(droits) === JSON.stringify(avant)) droits = null;
    if (moi && (b.desactive || droits)) return res.status(400).json({ error: 'Vous ne pouvez pas changer vos propres droits ni désactiver votre compte : demandez-le à un autre administrateur.' });
    if (droits) { const trop = droitsInterdits(req, droits); if (trop.length) return refus(res, trop[0]); }
    if (avant.admin && !u.disabled && (b.desactive || (droits && !droits.admin)) && !(await adminsActifs(req.params.id))) return res.status(400).json({ error: 'Il doit toujours rester au moins un Administrateur actif.' });
    const next = { ...u };
    if (typeof b.desactive === 'boolean') next.disabled = b.desactive;
    if (droits) { next.droits = droits; next.role = DR.roleDe(droits); }
    if (typeof b.nom === 'string') { const n = b.nom.trim().slice(0, 80); if (n.length < 2) return res.status(400).json({ error: 'Écrivez le prénom et le nom.' }); next.name = n; const pn = decouperNom(n); next.prenom = pn.prenom; next.nomFamille = pn.nomFamille; }
    if (typeof b.prenom === 'string' || typeof b.nomFamille === 'string') {
      const cur = partiesNom(u);
      const pr = nomPropre(String(b.prenom ?? cur.prenom).trim(), ''), nf = String(b.nomFamille ?? cur.nomFamille).trim().toLocaleUpperCase('fr-FR');
      if (!pr || !nf) return res.status(400).json({ error: 'Écrivez le prénom et le nom.' });
      next.prenom = pr; next.nomFamille = nf; next.name = (pr + ' ' + nf).slice(0, 80);
    }
    if (typeof b.portable === 'string') { const t = portableNet(b.portable); if (!t.ok) return res.status(400).json({ error: 'Portable illisible : écrivez-le comme 06 12 34 56 78.' }); next.portable = t.tel; }
    if (b.password) { if (String(b.password).length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum.' }); next.passHash = await bcrypt.hash(String(b.password), 11); }
    await store.set('_users/' + req.params.id, next);
    audit(req.ctx, droits ? 'droits modifiés' : 'compte modifié', '_users/' + req.params.id, u.email + (droits ? ' : ' + (droits.admin ? 'Administrateur' : DR.DROITS.filter(d => droits[d.k]).map(d => d.nom).join(', ') || 'aucun droit') : ''));
    if (b.desactive) for (const d of await store.list('_sessions')) if (d.data?.userId === req.params.id) await store.delete('_sessions/' + d.id); /* compte désactivé : déconnecté tout de suite */
    res.json({ ok: true });
  }));
  /* essai d'envoi : un e-mail à la personne connectée, et un SMS si un numéro est donné */
  A.post('/actions/envoi-test', sameSite, json, wrap(async (req, res) => {
    const u = await store.get('_users/' + req.ctx.uid);
    if (!u?.email) return res.status(400).json({ error: 'Compte sans e-mail.' });
    const rMail = await brevo.sendEmail({ to: u.email, name: u.name, subject: 'Magnolia : e-mail d’essai', html: '<p>Bonjour,</p><p>Ceci est un e-mail d’essai envoyé depuis le back-office Magnolia. S’il est arrivé, les e-mails partent bien.</p>', text: 'E-mail d’essai du back-office Magnolia.' });
    /* SMS : au numéro saisi, sinon aux portables des « Alertes de l’équipe » */
    const R = (await cat.get()).reglages;
    const tels = (s(req.body?.tel, 30) ? [s(req.body.tel, 30)] : String(R.alertes?.sms || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean)).slice(0, 5);
    const sms = [];
    for (const tel of tels) {
      const r = await brevo.sendSms({ to: tel, content: 'Magnolia : SMS d’essai envoyé depuis le back-office.', lien: false });
      sms.push({ tel, erreur: r?.error || r?.skipped || '' });
    }
    audit(req.ctx, 'envoi d’essai', '', tels.length ? 'e-mail + SMS' : 'e-mail');
    res.json({ ok: true, live: brevo.live, email: u.email, erreurMail: rMail?.error || '', sms });
  }));
  /* ---------- Excel : export (CSV « ; » lisible par Excel en français) et mise à jour des prix ---------- */
  const csv = (rows) => '\ufeff' + rows.map(r => r.map(v => { const x = v == null ? '' : String(v); return /[;"\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(';')).join('\r\n');
  const eurCsv = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
  A.get('/actions/export/:quoi', peut('fichiers'), wrap(async (req, res) => {
    const q = req.params.quoi; let rows;
    if (['factures', 'reglements'].includes(q) && !req.ctx.droits.factures) return refus(res, 'factures');
    const vis = await visibles(req), voit = (coll, d) => !vis || vis[coll].has(d.id);
    if (q === 'catalogue') {
      const c = await cat.get(); const rubs = new Map(c.rubriques.map(r => [r.slug, r.nom]));
      rows = [['Code (ne pas modifier)', 'Prestation', 'Rubrique', 'Prix de vente TTC (€)', 'Par', 'Minimum', 'Prix d’achat TTC (€)', 'TVA %', 'Statut (visible / masque)', 'Maison (oui / non)'],
        ...c.produits.map(p => [p.slug, p.titre, rubs.get(p.rubrique) || p.rubrique, eurCsv(p.prixCents), p.unite || '', p.min || '', eurCsv(p.coutCents), p.tva ?? '', p.statut || 'visible', p.maison ? 'oui' : 'non'])];
    } else if (q === 'demandes') {
      rows = [['Réf.', 'Reçue le', 'Type', 'Nom', 'Société', 'E-mail', 'Téléphone', 'Événement', 'Date', 'Invités', 'Code postal', 'Ville', 'Estimé TTC (€)', 'Étape'],
        ...(await store.list('demandes')).map(d => d.data).filter(d => voit('demandes', d)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(d => [d.ref, String(d.createdAt || '').slice(0, 10), d.type, d.contact?.nom, d.contact?.societe, d.contact?.email, d.contact?.tel, d.evenement?.type || d.sujet, d.evenement?.date, d.evenement?.invites, d.evenement?.cp, d.evenement?.ville, eurCsv(d.totalEstimeCents), d.statut])];
    } else if (q === 'clients') {
      rows = [['Nom', 'Société', 'E-mail', 'Téléphone', 'Autre téléphone', 'Adresse', 'Code postal', 'Ville', 'Département', 'Créé le', 'Dernière activité', 'Source', 'Accepte les e-mails', 'Accepte les SMS'],
        ...(await store.list('clients')).map(d => d.data).map(c => [c.nom, c.societe, c.email, c.tel, c.telAutre, c.adresse, c.cp, c.ville, c.departement, String(c.creeLe || '').slice(0, 10), String(c.derniereActivite || '').slice(0, 10), c.source,
          c.desinscrit?.email ? 'non (désinscrit)' : c.consentement?.email ? 'oui' : '', c.desinscrit?.sms ? 'non (STOP)' : c.consentement?.sms ? 'oui' : ''])];
    } else if (q === 'factures') {
      const T = (await cat.get()).reglages.tarifs || {};
      const docs = (await store.list('factures')).map(d => d.data).filter(d => voit('factures', d)).sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
      rows = [['N° facture', 'Type', 'Date', 'Client', 'Société', 'E-mail', 'N° devis', 'Objet', 'Total TTC (€)', 'Total HT (€)', 'Déjà réglé (€)', 'Reste dû (€)', 'Échéance', 'Nombre de règlements', 'Détail des règlements', 'Statut', 'Envoyée le', 'Relances'],
        ...docs.map(f => { const e = FAC.etat(f), t = totaux(f), sg = f.type === 'avoir' ? -1 : 1; return [f.numero, { acompte: 'Acompte', solde: 'Solde', totale: 'Facture', avoir: 'Avoir' }[f.type] || '', f.date, f.client?.nom, f.client?.societe, f.client?.email, f.devisNumero, f.objet, eurCsv(sg * e.dueCents), eurCsv(sg * t.htCents), eurCsv(e.regleCents), eurCsv(f.type === 'avoir' ? 0 : e.resteCents), FAC.echeance(f, T), e.reglements.length, e.reglements.map(r => `${r.date} ${r.moyen} ${eurCsv(r.montantCents)}`).join(' | '), FAC.STATUTS[FAC.statut(f, T)], String(f.envoyeeLe || '').slice(0, 10), (f.relances || []).length]; })];
    } else if (q === 'reglements') {
      const docs = (await store.list('factures')).map(d => d.data).filter(d => voit('factures', d));
      rows = [['Date', 'Montant (€)', 'Moyen de paiement', 'N° facture', 'Client', 'N° devis', 'Note', 'Saisi par'],
        ...docs.flatMap(f => FAC.libelles(f).map(r => [r.date, eurCsv(r.montantCents), r.moyen, f.numero, f.client?.nom, f.devisNumero, [r.libelle, r.note].filter(Boolean).join(' · '), r.par])).sort((a, b) => String(a[0]).localeCompare(String(b[0])))];
    } else if (q === 'devis') {
      const docs = (await store.list(q)).map(d => d.data).filter(d => voit('devis', d));
      rows = [[q === 'devis' ? 'N° devis' : 'N° facture', 'Client', 'Date', 'Total TTC (€)', 'Total HT (€)', 'Marge HT (€, lignes avec prix d’achat)', 'Statut'],
        ...docs.map(d => { const t = totaux(d); return [d.numero, d.clientNom || d.client?.nom, String(d.envoyeLe || d.date || d.createdAt || '').slice(0, 10), eurCsv(q === 'factures' ? d.totalCents ?? t.ttcCents : t.ttcCents), eurCsv(t.htCents), eurCsv(t.margeCents), q === 'factures' ? (d.payee ? 'payée' : 'à encaisser') : d.statut]; })];
    } else return res.status(404).json({ error: 'Export inconnu.' });
    audit(req.ctx, 'export Excel', '', q);
    res.set('Content-Disposition', `attachment; filename="magnolia-${q}-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8').send(csv(rows));
  }));
  /* mise à jour par fichier : seules les colonnes prix, minimum, coût, TVA, statut et maison sont reprises ; jamais de création ni de suppression */
  A.post('/actions/import-catalogue', sameSite, express.json({ limit: '2mb' }), peut('fichiers', 'prix'), wrap(async (req, res) => {
    const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes.slice(0, 2000) : [];
    const cents = v => { const x = String(v ?? '').replace(/\s|€/g, '').replace(',', '.'); if (x === '') return null; const n = Math.round(parseFloat(x) * 100); return Number.isFinite(n) && n >= 0 ? n : undefined; };
    let maj = 0; const erreurs = [];
    for (const [i, l] of lignes.entries()) {
      const slug = String(l.code || '').trim(); if (!slug) continue;
      const p = await store.get('produits/' + slug);
      if (!p) { erreurs.push(`Ligne ${i + 2} : code « ${slug} » inconnu.`); continue; }
      const prix = cents(l.prix), cout = cents(l.cout);
      if (prix === undefined || cout === undefined) { erreurs.push(`Ligne ${i + 2} : montant illisible.`); continue; }
      const next = { ...p, prixCents: prix, coutCents: cout };
      if (l.min !== undefined && String(l.min).trim() !== '') next.min = Math.max(1, parseInt(l.min, 10) || 1);
      if ([5.5, 10, 20].includes(parseFloat(String(l.tva || '').replace(',', '.')))) next.tva = parseFloat(String(l.tva).replace(',', '.'));
      if (['visible', 'masque'].includes(String(l.statut || '').trim().toLowerCase())) next.statut = String(l.statut).trim().toLowerCase();
      if (['oui', 'non'].includes(String(l.maison || '').trim().toLowerCase())) next.maison = String(l.maison).trim().toLowerCase() === 'oui';
      if (prix != null && cout != null && prix < cout) { erreurs.push(`Ligne ${i + 2} (${p.titre}) : prix sous le coût, ligne ignorée.`); continue; }
      if (JSON.stringify(next) !== JSON.stringify(p)) { await store.set('produits/' + slug, { ...next, updatedAt: new Date().toISOString() }); maj++; }
    }
    cat.invalidate();
    audit(req.ctx, 'catalogue mis à jour par fichier', 'produits', maj + ' prestation(s)');
    res.json({ ok: true, maj, erreurs });
  }));
  /* prix d'achat et fournisseurs depuis l'Excel de Jean-Luc : 1) analyse et rapprochement par nom, 2) application des lignes cochées */
  A.post('/actions/import-achats/analyser', sameSite, peut('prix'), multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).single('fichier'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
    const prods = (await store.list('produits')).map(d => d.data);
    try { res.json(ACHATS.analyser(req.file.buffer, req.file.originalname, prods)); } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  /* fournisseurs : combien de fiches en utilisent un ; le supprimer de toutes les fiches (prix d'achat inchangés) */
  const aLeFournisseur = (p, nom) => ACHATS.fournisseursDe(p).some(x => x.toLowerCase() === nom.toLowerCase());
  A.get('/actions/fournisseurs/compter', peut('prix'), wrap(async (req, res) => {
    const nom = String(req.query.nom || '').trim();
    res.json({ n: nom ? (await store.list('produits')).filter(d => aLeFournisseur(d.data, nom)).length : 0 });
  }));
  A.post('/actions/fournisseurs/supprimer', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const nom = String(req.body?.nom || '').trim(); if (!nom) return res.status(400).json({ error: 'Nom du fournisseur manquant.' });
    let fiches = 0;
    for (const d of await store.list('produits')) {
      if (!aLeFournisseur(d.data, nom)) continue;
      const { fournisseur, ...p } = d.data;
      await store.set('produits/' + d.id, { ...p, fournisseurs: ACHATS.fournisseursDe(d.data).filter(x => x.toLowerCase() !== nom.toLowerCase()), updatedAt: new Date().toISOString() });
      fiches++;
    }
    cat.invalidate(); audit(req.ctx, 'fournisseur supprimé', 'produits', nom + ' · ' + fiches + ' fiche(s)');
    res.json({ ok: true, fiches });
  }));
  /* mettre un fournisseur sur toute une catégorie (rubrique, ou rubrique › sous-catégorie) ; en option, prix d'achat
     des fiches qui n'en ont pas = prix de vente ÷ (1 + pct %) — les prix d'achat déjà tapés ne changent jamais */
  /* prix d'achat de toute une catégorie : prix d'achat HT = prix de vente HT − pct % (même TVA des deux côtés, gardé en TTC dans coutCents).
     Le pourcentage est tapé dans le back-office : il n'est jamais écrit dans le code. Prix de vente inchangés. */
  A.post('/actions/achats/categorie', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const rubrique = String(req.body?.rubrique || ''), sous = String(req.body?.sous || ''), pct = Number(req.body?.pct), remplacer = req.body?.remplacer !== false;
    if (!rubrique) return res.status(400).json({ error: 'Catégorie manquante.' });
    if (!(pct > 0 && pct < 100)) return res.status(400).json({ error: 'Pourcentage invalide.' });
    let fiches = 0;
    for (const d of await store.list('produits')) {
      const p = d.data; if (!p || p.prixCents == null || (p.rubrique !== rubrique && !(p.autresRubriques || []).includes(rubrique)) || (sous && p.sous !== sous)) continue;
      if (!remplacer && p.coutCents != null) continue;
      await store.set('produits/' + d.id, { ...p, coutCents: Math.round(p.prixCents * (1 - pct / 100)), updatedAt: new Date().toISOString() });
      fiches++;
    }
    cat.invalidate(); audit(req.ctx, 'prix d’achat calculé sur une catégorie', 'produits', rubrique + (sous ? ' › ' + sous : '') + ' · ' + fiches + ' fiche(s)');
    res.json({ ok: true, fiches });
  }));
  A.post('/actions/fournisseurs/appliquer', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const nom = String(req.body?.nom || '').trim().slice(0, 80), rubrique = String(req.body?.rubrique || ''), sous = String(req.body?.sous || ''), pct = Number(req.body?.pct) || 0;
    if (!nom) return res.status(400).json({ error: 'Nom du fournisseur manquant.' });
    if (!rubrique) return res.status(400).json({ error: 'Catégorie manquante.' });
    if (pct < 0 || pct >= 1000) return res.status(400).json({ error: 'Pourcentage invalide.' });
    let fiches = 0, couts = 0;
    for (const d of await store.list('produits')) {
      const p0 = d.data; if (p0.rubrique !== rubrique || (sous && p0.sous !== sous)) continue;
      const { fournisseur, ...p } = p0;
      const fourn = [nom, ...ACHATS.fournisseursDe(p0).filter(x => x.toLowerCase() !== nom.toLowerCase())];
      const calc = pct > 0 && p.coutCents == null && p.prixCents != null;
      await store.set('produits/' + d.id, { ...p, fournisseurs: fourn, ...(calc ? { coutCents: Math.round(p.prixCents / (1 + pct / 100)) } : {}), updatedAt: new Date().toISOString() });
      fiches++; if (calc) couts++;
    }
    cat.invalidate(); audit(req.ctx, 'fournisseur sur une catégorie', 'produits', rubrique + (sous ? ' › ' + sous : '') + ' · ' + fiches + ' fiche(s)');
    res.json({ ok: true, fiches, couts });
  }));
  A.post('/actions/import-achats/appliquer', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const r = await ACHATS.appliquer(store, req.body?.lignes, { ht: !!req.body?.ht });
    cat.invalidate();
    audit(req.ctx, 'prix d’achat et fournisseurs importés', 'produits', r.maj + ' fiche(s)');
    res.json({ ok: true, ...r });
  }));
  A.get('/actions/journal', wrap(async (req, res) => {
    const rows = (await store.list('_audit')).map(d => d.data).sort((a, b) => a.n - b.n);
    let prev = '0'.repeat(64), intact = true;
    for (const r of rows) { const { hash, ...rest } = r; if (r.prev !== prev || sha(JSON.stringify(rest)) !== hash) { intact = false; break; } prev = hash; }
    res.json({ intact, total: rows.length, lignes: rows.slice(-300).reverse() });
  }));
  A.get('/actions/envois', wrap(async (req, res) => res.json({ live: brevo.live, envois: (await store.list('_outbox')).map(d => d.data).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100) })));

  /* photos et vidéos : envoyées depuis le back-office, rangées hors du dossier de l'application */
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };
  A.post('/actions/upload', sameSite, (req, res, next) => upload.single('fichier')(req, res, err => err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (60 Mo maximum).' : 'Envoi impossible.' }) : next()), wrap(async (req, res) => {
    const f = req.file; if (!f) return res.status(400).json({ error: 'Aucun fichier.' });
    const ext = EXT[f.mimetype]; if (!ext) return res.status(415).json({ error: 'Format non pris en charge (JPG, PNG, WebP, MP4, PDF).' });
    const nom = slugify(path.parse(f.originalname || 'photo').name).slice(0, 40) + '-' + rid(5).toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + ext;
    fs.writeFileSync(path.join(uploadDir, nom), f.buffer);
    await store.set('_assets/' + nom.replace(/\./g, '_'), { nom, type: f.mimetype, octets: f.size, at: new Date().toISOString(), par: req.ctx.name });
    audit(req.ctx, 'fichier envoyé', '/media/' + nom);
    res.json({ ok: true, url: '/media/' + nom });
  }));
  A.get('/actions/bandeaux-defaut', (req, res) => res.json(views.BANDEAUX_DEFAUT));
  A.get('/actions/medias', wrap(async (req, res) => {
    const envoyes = (await store.list('_assets')).map(d => ({ url: '/media/' + d.data.nom, type: d.data.type, at: d.data.at }));
    const site = [];
    const walk = (dir, base) => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, base + '/' + e.name); else if (/\.(webp|jpe?g|png|mp4)$/i.test(e.name)) site.push({ url: base + '/' + e.name, type: /mp4$/i.test(e.name) ? 'video/mp4' : 'image' }); } } catch { /* */ } };
    walk(path.join(PUBLIC, 'site'), '/site');
    res.json({ envoyes: envoyes.sort((a, b) => b.at.localeCompare(a.at)), site });
  }));
  A.post('/actions/reimporter', sameSite, peut('admin'), wrap(async (req, res) => {
    const r = await seed(store, { force: true, log }); await importerAvisAncienSite(store, { log }); await initSousRubriques(store, { log });
    cat.invalidate(); audit(req.ctx, 'catalogue réimporté depuis le brouillon', '');
    res.json({ ok: true, ...r });
  }));
  /* ---------- Validation tarifs (Jean-Luc, 2026-11-26) : fiches fournisseurs, document A4 à faire signer, scans signés ----------
     Tout est interne : rien de cela n'est lu par les pages du site. Droit « Modifier les prix » (comme les prix d'achat). */
  const priveDir = path.resolve(env.PRIVATE_DIR || path.join(path.dirname(uploadDir), 'prive'), 'tarifs');
  fs.mkdirSync(priveDir, { recursive: true });
  const catalogueBrut = async () => { const [rub, prod] = await Promise.all([store.list('rubriques'), store.list('produits')]); return { rubriques: rub.map(d => d.data).filter(Boolean), produits: prod.map(d => d.data).filter(Boolean) }; };
  const fournisseursTarifs = async () => (await store.list('tarifsFournisseurs')).map(d => ({ ...d.data, id: d.data?.id || d.id })).sort((a, b) => TAR.libelleFournisseur(a).localeCompare(TAR.libelleFournisseur(b), 'fr'));
  const cleOk = c => /^[a-z0-9-]+$/.test(String(c || ''));
  /* Jean-Luc (2026-11-26) : tarifs garantis 6 mois reconductibles (matières premières), et non 12 : une fois, les choix déjà enregistrés à 12 passent à 6 */
  if (!(await store.get('_migr/tarifs6mois'))) {
    for (const d of await store.list('tarifsSpecialites')) if (d.data?.duree === 12) await store.set('tarifsSpecialites/' + d.id, { ...d.data, duree: TAR.DUREE_DEFAUT });
    await store.set('_migr/tarifs6mois', { at: new Date().toISOString() });
  }
  /* liste des profils (Restaurant, Traiteur, Poissonnier…) : modifiable depuis la fiche (Jean-Luc, 2026-11-26) ; retirer un profil ne touche pas les fiches qui l'ont */
  const profilsTarifs = async () => { const d = await store.get('tarifsProfils/liste'); return d?.liste ? d.liste : [...TAR.PROFILS]; };
  const majuscule = t => t.charAt(0).toLocaleUpperCase('fr-FR') + t.slice(1);
  A.post('/tarifs/profils', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const nom = majuscule(String(req.body?.nom || '').replace(/\s+/g, ' ').trim().slice(0, 60));
    if (!nom) return res.status(400).json({ error: 'Indiquez le nom du profil.' });
    const l = await profilsTarifs();
    const deja = l.find(x => x.toLowerCase() === nom.toLowerCase());
    if (!deja) { const autre = l.indexOf('Autre'); if (autre >= 0) l.splice(autre, 0, nom); else l.push(nom); await store.set('tarifsProfils/liste', { liste: l }); audit(req.ctx, 'profil fournisseur ajouté', 'tarifsProfils/liste', nom); }
    res.json({ ok: true, nom: deja || nom, profils: l });
  }));
  A.post('/tarifs/profils/retirer', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const nom = String(req.body?.nom || '');
    const l = (await profilsTarifs()).filter(x => x !== nom);
    await store.set('tarifsProfils/liste', { liste: l });
    audit(req.ctx, 'profil fournisseur retiré', 'tarifsProfils/liste', nom);
    res.json({ ok: true, profils: l });
  }));
  A.get('/tarifs', peut('prix'), wrap(async (req, res) => {
    const { rubriques, produits } = await catalogueBrut();
    const choix = new Map((await store.list('tarifsSpecialites')).map(d => [d.id, d.data]));
    const F = await fournisseursTarifs(), parId = new Map(F.map(f => [f.id, f]));
    res.set('Cache-Control', 'no-store').json({
      specialites: TAR.specialites(rubriques, produits).map(s => { const c = choix.get(s.cle); const f = c?.fournisseurId && parId.get(c.fournisseurId); return { ...s, fournisseur: f ? TAR.libelleFournisseur(f) : '', imprimeLe: c?.imprimeLe || '' }; }),
      fournisseurs: F.map(f => ({ id: f.id, libelle: TAR.libelleFournisseur(f), profil: f.profil || '', ville: f.ville || '', scans: (f.scans || []).length })),
      profils: await profilsTarifs(), durees: TAR.DUREES,
    });
  }));
  A.get('/tarifs/specialite/:cle', peut('prix'), wrap(async (req, res) => {
    if (!cleOk(req.params.cle)) return res.status(400).json({ error: 'Spécialité inconnue.' });
    const { rubriques, produits } = await catalogueBrut();
    const spe = TAR.specialites(rubriques, produits).find(s => s.cle === req.params.cle);
    const L = spe && TAR.produitsDe(spe.cle, rubriques, produits);
    if (!L) return res.status(404).json({ error: 'Spécialité introuvable.' });
    const c = (await store.get('tarifsSpecialites/' + spe.cle)) || {};
    /* fournisseurs déjà notés sur les fiches produits de cette spécialité (Catalogue) : proposés pour remplir la fiche */
    const bySlug = new Map(produits.map(p => [p.slug, p]));
    const notes = [...new Set(L.flatMap(x => ACHATS.fournisseursDe(bySlug.get(x.slug) || {})))];
    res.set('Cache-Control', 'no-store').json({ spe, produits: L.map(x => ({ ...x, quantite: (c.quantites || {})[x.slug] || x.quantite, quantiteDefaut: x.quantite, habituelCents: (c.habituels || {})[x.slug] ?? null, retire: (c.exclus || []).includes(x.slug) })), choix: { fournisseurId: c.fournisseurId || '', duree: c.duree || TAR.DUREE_DEFAUT, imprimeLe: c.imprimeLe || '' }, fournisseursFiches: notes });
  }));
  const choixSpe = async (cle, b = {}) => {
    const avant = (await store.get('tarifsSpecialites/' + cle)) || {};
    const q = {}; for (const [k, v] of Object.entries(b.quantites || {})) if (cleOk(k) && String(v || '').trim()) q[k] = String(v).trim().slice(0, 80);
    const c = { ...avant, fournisseurId: String(b.fournisseurId ?? avant.fournisseurId ?? '').slice(0, 40), exclus: Array.isArray(b.exclus) ? b.exclus.filter(cleOk).slice(0, 2000) : avant.exclus || [], quantites: b.quantites ? q : avant.quantites || {}, habituels: b.habituels ? Object.fromEntries(Object.entries(b.habituels).filter(([k, v]) => cleOk(k) && Number.isInteger(v) && v > 0 && v < 1e7)) : avant.habituels || {}, duree: TAR.DUREES.includes(+b.duree) ? +b.duree : avant.duree || TAR.DUREE_DEFAUT, updatedAt: new Date().toISOString() };
    await store.set('tarifsSpecialites/' + cle, c);
    return c;
  };
  A.put('/tarifs/specialite/:cle', sameSite, json, peut('prix'), wrap(async (req, res) => {
    if (!cleOk(req.params.cle)) return res.status(400).json({ error: 'Spécialité inconnue.' });
    res.json({ ok: true, choix: await choixSpe(req.params.cle, req.body) });
  }));
  /* « Tarif client habituel TTC » : liste collée (nom + prix par ligne, ex. la carte du fournisseur) rapprochée des produits de la spécialité */
  A.post('/tarifs/specialite/:cle/habituels', sameSite, json, peut('prix'), wrap(async (req, res) => {
    if (!cleOk(req.params.cle)) return res.status(400).json({ error: 'Spécialité inconnue.' });
    const { rubriques, produits } = await catalogueBrut();
    const L = TAR.produitsDe(req.params.cle, rubriques, produits);
    if (!L) return res.status(404).json({ error: 'Spécialité introuvable.' });
    const lignes = TAR.lireListePrix(req.body?.texte);
    if (!lignes.length) return res.status(400).json({ error: 'Aucune ligne lisible : une ligne par produit, le nom puis le prix (ex. « Chicken Tikka ; 12,50 »).' });
    const r = TAR.rapprocherPrix(lignes, L);
    const avant = (await store.get('tarifsSpecialites/' + req.params.cle)) || {};
    await store.set('tarifsSpecialites/' + req.params.cle, { ...avant, habituels: { ...(avant.habituels || {}), ...r.prix }, updatedAt: new Date().toISOString() });
    audit(req.ctx, 'tarifs clients habituels importés', 'tarifs/' + req.params.cle, Object.keys(r.prix).length + ' produit(s)');
    res.json({ ok: true, ...r, sansPrix: L.filter(x => !(x.slug in r.prix) && !(avant.habituels || {})[x.slug]).map(x => x.titre) });
  }));
  /* le document A4 : enregistre la date d'impression et sert une page autonome (Imprimer / Enregistrer en PDF) */
  A.get('/tarifs/document/:cle', peut('prix'), wrap(async (req, res) => {
    if (!cleOk(req.params.cle)) return res.status(400).send('Spécialité inconnue.');
    const { rubriques, produits } = await catalogueBrut();
    const spe = TAR.specialites(rubriques, produits).find(s => s.cle === req.params.cle);
    const L = spe && TAR.produitsDe(spe.cle, rubriques, produits);
    if (!L) return res.status(404).send('Spécialité introuvable.');
    const c = (await store.get('tarifsSpecialites/' + spe.cle)) || {};
    const f = c.fournisseurId ? await store.get('tarifsFournisseurs/' + c.fournisseurId) : null;
    const lignes = L.filter(x => !(c.exclus || []).includes(x.slug)).map(x => ({ ...x, quantite: (c.quantites || {})[x.slug] || x.quantite, habituelCents: (c.habituels || {})[x.slug] || null }));
    await store.set('tarifsSpecialites/' + spe.cle, { ...c, imprimeLe: new Date().toISOString() });
    audit(req.ctx, 'document tarifs préparé', 'tarifs/' + spe.cle, lignes.length + ' produit(s)');
    res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').type('html').send(TAR.documentHtml({ spe, lignes, fournisseur: f || {}, R: (await store.get('site/reglages')) || {}, duree: c.duree || TAR.DUREE_DEFAUT, prepareur: req.ctx.name || '' }));
  }));
  A.get('/tarifs/fournisseurs/:id', peut('prix'), wrap(async (req, res) => {
    const f = await store.get('tarifsFournisseurs/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Fiche introuvable.' });
    const specs = (await store.list('tarifsSpecialites')).filter(d => d.data?.fournisseurId === req.params.id).map(d => d.id);
    res.set('Cache-Control', 'no-store').json({ ...f, id: req.params.id, specialites: specs });
  }));
  A.post('/tarifs/fournisseurs', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const id = 'f' + rid(8).toLowerCase().replace(/[^a-z0-9]/g, '');
    const f = { ...TAR.ficheFournisseur(req.body), id, scans: [], createdAt: new Date().toISOString(), par: req.ctx.name };
    if (!f.entreprise && !f.nom) return res.status(400).json({ error: 'Indiquez au moins le nom de l’entreprise ou le nom du contact.' });
    await store.set('tarifsFournisseurs/' + id, f);
    audit(req.ctx, 'fiche fournisseur créée', 'tarifsFournisseurs/' + id, TAR.libelleFournisseur(f));
    res.json({ ok: true, fournisseur: f });
  }));
  A.put('/tarifs/fournisseurs/:id', sameSite, json, peut('prix'), wrap(async (req, res) => {
    const avant = await store.get('tarifsFournisseurs/' + req.params.id);
    if (!avant) return res.status(404).json({ error: 'Fiche introuvable.' });
    const f = { ...TAR.ficheFournisseur(req.body, avant), updatedAt: new Date().toISOString() };
    if (!f.entreprise && !f.nom) return res.status(400).json({ error: 'Indiquez au moins le nom de l’entreprise ou le nom du contact.' });
    await store.set('tarifsFournisseurs/' + req.params.id, f);
    audit(req.ctx, 'fiche fournisseur modifiée', 'tarifsFournisseurs/' + req.params.id, TAR.libelleFournisseur(f));
    res.json({ ok: true, fournisseur: { ...f, id: req.params.id } });
  }));
  A.delete('/tarifs/fournisseurs/:id', sameSite, peut('prix'), wrap(async (req, res) => {
    const f = await store.get('tarifsFournisseurs/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Fiche introuvable.' });
    if ((f.scans || []).length) return res.status(409).json({ error: 'Cette fiche contient des documents signés : retirez-les d’abord si vous voulez vraiment la supprimer.' });
    await store.delete('tarifsFournisseurs/' + req.params.id);
    for (const d of await store.list('tarifsSpecialites')) if (d.data?.fournisseurId === req.params.id) await store.set('tarifsSpecialites/' + d.id, { ...d.data, fournisseurId: '' });
    audit(req.ctx, 'fiche fournisseur supprimée', 'tarifsFournisseurs/' + req.params.id, TAR.libelleFournisseur(f));
    res.json({ ok: true });
  }));
  /* scan du document signé (PDF ou photo, depuis l'ordinateur ou l'iPhone) : rangé dans le dossier du fournisseur, jamais public */
  const SCAN_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
  const uploadScan = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
  A.post('/tarifs/fournisseurs/:id/scans', sameSite, peut('prix'), (req, res, next) => uploadScan.single('fichier')(req, res, err => err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop lourd (30 Mo maximum).' : 'Envoi impossible.' }) : next()), wrap(async (req, res) => {
    const f = await store.get('tarifsFournisseurs/' + req.params.id);
    if (!f) return res.status(404).json({ error: 'Fiche introuvable.' });
    const x = req.file; if (!x) return res.status(400).json({ error: 'Aucun fichier.' });
    const ext = SCAN_EXT[x.mimetype] || (/\.(heic|heif)$/i.test(x.originalname || '') ? 'heic' : '');
    if (!ext) return res.status(415).json({ error: 'Format non pris en charge : PDF ou photo (JPG, PNG, HEIC).' });
    const nom = req.params.id + '-' + Date.now().toString(36) + '-' + rid(6).toLowerCase().replace(/[^a-z0-9]/g, '') + '.' + ext;
    fs.writeFileSync(path.join(priveDir, nom), x.buffer);
    const spe = cleOk(req.body?.specialite) ? req.body.specialite : '';
    const scan = { nom, original: String(x.originalname || 'scan.' + ext).slice(0, 120), type: x.mimetype, octets: x.size, at: new Date().toISOString(), par: req.ctx.name || '', specialite: spe, specialiteNom: String(req.body?.specialiteNom || '').slice(0, 80), signeLe: /^\d{4}-\d{2}-\d{2}$/.test(req.body?.signeLe || '') ? req.body.signeLe : '', note: String(req.body?.note || '').slice(0, 300) };
    await store.set('tarifsFournisseurs/' + req.params.id, { ...f, scans: [scan, ...(f.scans || [])] });
    audit(req.ctx, 'document signé déposé', 'tarifsFournisseurs/' + req.params.id, scan.original);
    res.json({ ok: true, scan });
  }));
  A.get('/tarifs/fournisseurs/:id/scans/:nom', peut('prix'), wrap(async (req, res) => {
    const f = await store.get('tarifsFournisseurs/' + req.params.id);
    const s = (f?.scans || []).find(x => x.nom === req.params.nom);
    if (!s || !/^[a-z0-9-]+\.[a-z]+$/.test(s.nom)) return res.status(404).send('Document introuvable.');
    const fic = path.join(priveDir, s.nom);
    if (!fs.existsSync(fic)) return res.status(404).send('Fichier introuvable sur le serveur.');
    res.set('Cache-Control', 'private, no-store').set('X-Robots-Tag', 'noindex');
    if (s.type) res.type(s.type);
    res.set('Content-Disposition', `${'telecharger' in req.query ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(s.original)}`);
    res.sendFile(fic);
  }));
  A.delete('/tarifs/fournisseurs/:id/scans/:nom', sameSite, peut('prix'), wrap(async (req, res) => {
    const f = await store.get('tarifsFournisseurs/' + req.params.id);
    const s = (f?.scans || []).find(x => x.nom === req.params.nom);
    if (!s) return res.status(404).json({ error: 'Document introuvable.' });
    await store.set('tarifsFournisseurs/' + req.params.id, { ...f, scans: f.scans.filter(x => x.nom !== s.nom) });
    try { fs.renameSync(path.join(priveDir, s.nom), path.join(priveDir, 'retire-' + s.nom)); } catch { /* */ }
    audit(req.ctx, 'document signé retiré', 'tarifsFournisseurs/' + req.params.id, s.original);
    res.json({ ok: true });
  }));

  app.use('/api/admin', A);

  /* back-office (application d'une seule page) */
  const adminHtml = () => fs.readFileSync(path.join(PUBLIC, 'admin', 'index.html'), 'utf8').replace(/__V__/g, views.V);
  app.get(['/admin', '/connexion'], (req, res) => res.set('Cache-Control', 'no-store').type('html').send(adminHtml()));

  /* ---------- pages du site ---------- */
  const page = fn => wrap(async (req, res, next) => { const c = await cat.get(); let html = await fn(c, req, res, next); if (html) { if (apercu(req)) { res.set('X-Robots-Tag', 'noindex').set('Cache-Control', 'no-store'); html = bandeauApercu(html, req._masque); } res.send(html); } });
  /* « Voir la présentation sur le site » depuis le back-office : l'équipe connectée voit la page comme un client, même masquée */
  const apercu = req => 'apercu' in req.query && (req.ctx.role === 'manager' || req.ctx.role === 'collab');
  const bandeauApercu = (html, masque) => html.replace(/(<body[^>]*>)/, `$1<div class="apercu-bo" role="status"><span><b>Aperçu de l’équipe</b> · ${masque ? `cette page est <em>masquée</em> : les clients ne la voient pas encore` : 'voici la page telle que vos clients la voient'}</span><button type="button" onclick="window.close()">Fermer l’aperçu</button></div>`);
  app.get('/', page(c => views.home(c)));
  app.get('/boutique', page((c, req, res) => {
    /* plusieurs univers choisis dans le pavé de recherche de l'accueil : /boutique?u=carte-magnolia,douceurs */
    const choix = String(req.query.u || '').split(',').map(x => x.trim()).filter(Boolean);
    const us = views.universListe(c).filter(u => choix.includes(u.slug));
    /* un seul univers présenté en sections (La carte Magnolia) → sa vraie page, avec ses titres Nos entrées, Nos plats… */
    const r1 = us.length === 1 && c.rubriques.find(r => r.slug === us[0].slug && r.parSections);
    if (r1) { const q = new URLSearchParams(req.query); q.delete('u'); return res.redirect(302, '/' + r1.slug + (q.toString() ? '?' + q : '')); }
    if (us.length) {
      const liste = us.flatMap(u => u.prods || []).filter((p, i, a) => a.indexOf(p) === i);
      const chips = `<div class="chips scroll-x">${us.map(u => `<a class="chip on" href="${u.href}">${esc(u.nom)}${u.prods ? ` <small>${u.prods.length}</small>` : ''}</a>`).join('')}</div>`;
      /* paragraphe de présentation adapté aux univers choisis (Jean-Luc, 2026-11-23) */
      const noms = us.map(u => u.nom), liste2 = noms.length > 1 ? noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1] : noms[0];
      const intro = { titre: us.length > 1 ? 'Tous vos univers, réunis sur une seule page' : `Bienvenue dans l’univers ${noms[0]}`,
        texte: `Vous avez choisi ${liste2} : excellent choix ! ${us.length > 1 ? 'Toutes les propositions de ces univers vous attendent ici, côte à côte, pour composer votre événement d’un seul coup d’œil.' : 'Toutes ses propositions vous attendent ici.'}\nFaites votre choix${us.length > 1 ? ' : un clic sur une pastille pour n’afficher qu’un univers' : ''}, ouvrez les fiches pour découvrir photos, prix et détails, puis ajoutez vos coups de cœur à votre sélection. Quand tout vous plaît, demandez votre devis : un seul interlocuteur s’occupe de tout, de la première idée jusqu’au dernier invité.` };
      return views.boutique(c, { intro, titre: 'Vos univers', chapo: us.map(u => u.nom).join(', '), liste, chips, path: '/boutique?u=' + us.map(u => u.slug).join(','), photo: us[0].photo });
    }
    const pg = req.query.q && pageRecherchee(req.query.q);
    if (pg) return res.redirect(302, pg.href); /* « zone de livraison » tapé dans la recherche → la page */
    return views.boutique(c, { q: s(req.query.q, 80), titre: req.query.q ? 'Recherche' : 'La boutique' });
  }));
  app.get('/lieux', page((c, req) => views.lieux(c, req.query)));
  app.get('/lieux/:slug', page((c, req, res, next) => { const l = c.lieux.find(x => x.slug === req.params.slug && x.statut !== 'masque'); return l ? views.lieu(c, l) : next(); }));
  app.get('/ma-selection', page(c => views.selection(c)));
  app.get('/maison', page(c => views.maison(c)));
  app.get('/zone-de-livraison', page(c => views.livraison(c)));
  app.get(['/livraison', '/zones-de-livraison'], (req, res) => res.redirect(301, '/zone-de-livraison'));
  app.get('/comment-commander', page(c => views.commander(c)));
  app.get('/temoignages', page(c => views.temoignages(c)));
  app.get('/contact', page(c => views.contact(c)));
  for (const [u, t] of [['/cgv', 'Conditions générales de vente'], ['/mentions-legales', 'Mentions légales'], ['/confidentialite', 'Confidentialité'], ['/allergenes', 'Allergènes'], ['/conseils', 'Nos conseils'], ['/references', 'Nos références']]) app.get(u, page(c => views.legal(c, u, t)));
  /* pages spécialités du brouillon : gardées pour le référencement */
  const SPECIALITES = { '/buffet-antillais': ['Buffet antillais', 'antillais'], '/buffet-chinois': ['Buffet chinois', 'chinois'], '/buffet-indien': ['Buffet indien', 'indien'], '/paella': ['Paëlla', 'paella'], '/traiteur-vegetarien-vegan': ['Traiteur végétarien et vegan', 'vegetarien vegan'], '/art-de-surprendre': ['L’art de surprendre', 'magicien'] };
  app.get(Object.keys(SPECIALITES), page((c, req, res) => {
    const VERS = { '/buffet-antillais': 'buffet-antillais', '/buffet-chinois': 'buffet-chinois', '/buffet-indien': 'buffet-indien', '/paella': 'paella-party' };
    const sm = c.rubriques.find(x => x.slug === 'saveurs-du-monde');
    if (VERS[req.path] && views.sousVisibles(sm).some(y => y.slug === VERS[req.path])) { res.redirect(301, '/saveurs-du-monde/' + VERS[req.path]); return; }
    const [titre, q] = SPECIALITES[req.path];
    const r = c.rubriques.find(x => x.slug === req.path.slice(1));
    const liste = r ? c.byRub.get(r.slug) : q.split(" ").flatMap(w => cat.search(c, w, 200)).filter((p, i, a) => a.indexOf(p) === i);
    return views.boutique(c, { titre, liste, path: req.path, photo: liste[0]?.photos?.[0]?.src, chapo: r?.chapo || '' });
  }));
  app.get('/:rub', page((c, req, res, next) => {
    const r = c.rubriques.find(x => x.slug === req.params.rub && (x.statut !== 'masque' || apercu(req)));
    if (!r) return next();
    req._masque = r.statut === 'masque';
    if (views.sousVisibles(r).length) return views.pageSpecialites(c, r);
    const p3 = r.slug === 'grand-large' && r.plateau3d !== false ? views.plateau3dHtml(c, r, c.byRub.get(r.slug)) : '';
    return views.boutique(c, { intro: { titre: r.introTitre, texte: r.introTexte }, rub: r.slug, titre: r.nom, chapo: r.chapo || r.accroche, photo: r.bandeauPhoto || r.photoAccueil || r.photo, path: '/' + r.slug, liste: c.byRub.get(r.slug), sections: views.sectionsRub(r, c.byRub.get(r.slug)), avant: p3, scripts: p3 ? `<script src="/js/plateau.js?v=${views.V}" defer></script>` : '' });
  }));
  app.get('/:rub/:slug', page((c, req, res, next) => {
    const ru = c.rubriques.find(x => x.slug === req.params.rub && (x.statut !== 'masque' || apercu(req)));
    if (ru && views.sousVisibles(ru).length) {
      if (req.params.slug === 'tout') return views.specialite(c, ru, null);
      const x = (apercu(req) ? ru.sous || [] : views.sousVisibles(ru)).find(y => y.slug === req.params.slug);
      if (x) { req._masque = ru.statut === 'masque' || x.statut === 'masque'; return views.specialite(c, ru, x); }
    }
    const p = c.bySlug.get(req.params.slug);
    if (p && p.fusionneDans) { const q = c.bySlug.get(p.fusionneDans); if (q && q.statut !== 'masque') { res.redirect(301, `/${q.rubrique}/${q.slug}`); return; } }
    if (!p || (p.statut === 'masque' && !apercu(req))) return next();
    req._masque = p.statut === 'masque';
    if (p.rubrique !== req.params.rub && !(p.autresRubriques || []).includes(req.params.rub)) { res.redirect(301, `/${p.rubrique}/${p.slug}`); return; }
    return views.produit(c, p);
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Introuvable.' }));
  /* redirections 301 réglées dans le back-office (bascule de l'ancien site) */
  app.use(wrap(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const c = await cat.get();
    const cible = redirectionPour(c.reglages.redirections, req.path);
    return cible ? res.redirect(301, cible) : next();
  }));
  app.use(wrap(async (req, res) => res.status(404).send(views.erreur(await cat.get()))));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    log.error?.('[erreur]', err);
    if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Erreur du serveur. Réessayez.' });
    res.status(500).send('<p style="font-family:sans-serif;padding:2em">Une erreur est survenue. Réessayez dans un instant, ou appelez le 07 63 66 98 92.</p>');
  });

  /* alerte 24 h : vérifiée chaque heure, envoyée seulement de 8 h à 20 h (heure de Paris) */
  async function alerte24h(now = Date.now()) {
    const h = +new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date(now));
    if (h < 8 || h >= 20) return null;
    const a = await preparerAlerte(store, { site: SITE, esc }, now);
    if (a) { await alerterEquipe(a.sujet, a.html, a.sms); log.log?.(`[alerte 24 h] ${a.demandes} demande(s), ${a.devis} devis`); }
    return a;
  }
  app.locals.alerte24h = alerte24h;
  if (!opts.noTimers && env.JP_NO_TIMERS !== '1') {
    setTimeout(() => alerte24h().catch(e => log.error?.('[alerte 24 h]', e)), 60e3).unref();
    setInterval(() => alerte24h().catch(e => log.error?.('[alerte 24 h]', e)), 36e5).unref();
    setInterval(() => rappelsRdv().catch(e => log.error?.('[rappel rdv]', e)), 6e4).unref();
  }

  app.locals.store = store;
  app.locals.seoIa = () => lancerSeoIa() || Promise.resolve(0);
  app.locals.remplirSeo = remplirSeoCatalogue;
  app.locals.catalogue = cat;
  return app;
}

if (require.main === module) {
  createApp().then(app => {
    const port = +(process.env.PORT || 3000);
    app.listen(port, () => console.log(`Magnolia Traiteur : http://localhost:${port}`));
    /* arrêt demandé par l'hébergeur (mise en ligne) : on termine d'écrire la base avant de quitter */
    for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { Promise.resolve(app.locals.store.flush?.()).catch(e => console.error(e)).finally(() => process.exit(0)); });
  }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { createApp, redirectionPour };
