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
const { regleAcompte, totaux, controleMarge, prochainNumero, lignesDepuisDemande, estimerLigne } = require('./devis');
const { rid, sha, esc, euros, limiter, dateFr, slugify, nomPropre, dateNaissance } = require('./util');
const { creerImportClients, normTel, departementDe } = require('./import-clients');
const IA = require('./ia');
const DIF = require('./diffusion');
const FAC = require('./factures');

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
  async function createUser({ email, name, role, password }) {
    email = String(email || '').trim().toLowerCase();
    if (!isEmail(email)) throw Object.assign(new Error('E-mail invalide.'), { status: 400 });
    if (await findUserByEmail(email)) throw Object.assign(new Error('Ce compte existe déjà.'), { status: 409 });
    if (String(password || '').length < 10) throw Object.assign(new Error('Mot de passe : 10 caractères minimum.'), { status: 400 });
    const id = 'u_' + rid(9);
    await store.set('_users/' + id, { email, name: String(name || '').trim(), role: role === 'manager' ? 'manager' : 'collab', passHash: await bcrypt.hash(password, 11), createdAt: new Date().toISOString(), disabled: false });
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
          if (u && !u.disabled) req.ctx = { uid: s.userId, role: u.role, email: u.email, name: u.name, session: sha(tok) };
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
  const manager = (req, res, next) => (req.ctx.role === 'manager' ? next() : res.status(403).json({ error: 'Réservé au Manager.' }));
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
  app.get('/pictos.json', (req, res) => { const P = require('./pictos'); res.json({ liste: P.liste(), defaut: P.DEFAUT }); });
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
    { titre: 'Nos zones de livraison', href: '/zone-de-livraison', info: 'Carte, frais de livraison, livraison offerte dès 700 € TTC', mots: ['zone de livraison', 'zones de livraison', 'livraison', 'livrer', 'livrez', 'frais de livraison', 'tarif livraison', 'prix livraison', 'zone', 'livraison offerte', 'livraison gratuite', 'flotte', 'camion', 'vehicule'] },
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

  async function upsertClient({ nom, email, tel, societe }) {
    email = String(email).trim().toLowerCase();
    const idx = await store.get('_clientemail/' + sha(email));
    const now = new Date().toISOString();
    if (idx) {
      const cl = await store.get('clients/' + idx.id);
      /* client connu : un formulaire public ne remplace jamais ses coordonnées (seulement les cases vides) */
      if (cl) { await store.set('clients/' + idx.id, { ...cl, nom: cl.nom || nom, tel: cl.tel || tel, societe: cl.societe || societe, derniereActivite: now }); return { id: idx.id, nouveau: false }; }
    }
    const id = 'c_' + rid(8);
    await store.set('clients/' + id, { id, nom, email, tel, societe, notes: '', creeLe: now, derniereActivite: now, source: 'site' });
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
        qte: est.qte, prixCents: p?.prixCents ?? null, supCents: est.supCents, totalCents: est.totalCents, surDevis: est.surDevis,
        variante: (p?.variantes || []).includes(l.variante) ? l.variante : '', choix, resume: s(l.resume, 400), note: s(l.note, 500),
        personnel: l.personnel?.nb ? { nb: Math.min(50, Math.max(1, +l.personnel.nb | 0)), heures: Math.min(24, Math.max(T.personnel?.minHeures || 4, +l.personnel.heures | 0)) } : null,
        pack: l.pack?.id && (T.packs || []).some(x => x.id === l.pack.id) ? { id: l.pack.id, nb: Math.max(1, +l.pack.nb | 0) } : null,
      };
    });
    const km = Math.min(2000, Math.max(0, Math.round(+b.km || 0)));
    const sousTotal = lignes.reduce((t, l) => t + l.totalCents, 0);
    const seuil = T.livraisonOfferteCents ?? 70000; /* livraison offerte dès ce montant TTC (0 = jamais) */
    const offerte = !!(km && seuil > 0 && sousTotal >= seuil);
    const { id: clientId, nouveau } = await upsertClient(contact);
    if (b.offres === true || b.offres === '1' || b.offres === 'on') { const cl = await store.get('clients/' + clientId); if (cl && !cl.consentement?.email) await store.set('clients/' + clientId, { ...cl, consentement: { email: true, sms: true, le: new Date().toISOString(), source: 'case cochée sur le site', base: 'consentement' } }); }
    const id = 'd_' + rid(8);
    const ref = await prochainNumero(store, 'demande');
    const demande = {
      id, ref, type: b.type === 'contact' ? 'contact' : 'devis', clientId, contact,
      evenement: { type: s(b.evenement, 40), date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '', invites: Math.min(10000, Math.max(0, +b.invites | 0)), cp: s(b.cp, 5), ville: s(b.ville, 80), horaire: s(b.horaire, 60) },
      livraison: km ? { km, cents: offerte ? 0 : km * (T.kmCents || 100), ...(offerte ? { offerte: true } : {}) } : null,
      lignes, sousTotalCents: sousTotal, totalEstimeCents: sousTotal + (km && !offerte ? km * (T.kmCents || 100) : 0),
      message: s(b.message, 3000), sujet: s(b.sujet, 80), statut: 'demande', historique: [{ at: new Date().toISOString(), statut: 'demande', par: 'site' }],
      createdAt: new Date().toISOString(), ip: req.ip,
    };
    await store.set('demandes/' + id, demande);
    const lien = await lienEspace(clientId);
    const R = c.reglages;
    const recap = lignes.map(l => `<li>${esc(l.titre)}${l.variante ? ' · ' + esc(l.variante) : ''} — ${l.qte} ${esc(l.unite || '')}${l.surDevis ? ' (sur devis)' : ' · ' + euros(l.totalCents)}</li>`).join('');
    brevo.sendEmail({ to: contact.email, name: contact.nom, subject: `Magnolia Traiteur : votre demande ${ref} est bien reçue`, replyTo: R.email,
      html: `<p>Bonjour ${esc(contact.nom.split(' ')[0])},</p><p>Merci pour votre demande${demande.evenement.date ? ' pour le ' + esc(dateFr(demande.evenement.date)) : ''}. Notre équipe vérifie les disponibilités et revient vers vous rapidement avec votre devis.</p>${recap ? `<ul>${recap}</ul><p>Total estimé : <b>${euros(demande.totalEstimeCents)} TTC</b> (à confirmer).</p>` : ''}<p>Suivez votre demande dans votre espace : <a href="${lien}">Mon espace Magnolia</a></p><p>À très vite,<br>L’équipe Magnolia Traiteur<br>${esc(R.telephone)}</p>`,
      text: `Merci pour votre demande ${ref}. Votre espace : ${lien}` }).catch(() => {});
    alerterEquipe(`Nouvelle ${demande.type === 'contact' ? 'question' : 'demande de devis'} ${ref} : ${contact.nom}`, `<p><b>${esc(contact.nom)}</b> ${esc(contact.societe)} · ${esc(contact.email)} · ${esc(contact.tel)}</p><p>${esc(demande.evenement.type)} · ${esc(dateFr(demande.evenement.date))} · ${demande.evenement.invites} invités · ${esc(demande.evenement.ville)}</p><ul>${recap}</ul><p>${esc(demande.message)}</p><p><a href="${SITE}/admin#/demandes/${id}">Ouvrir dans le back-office</a></p>`, `Magnolia : nouvelle demande ${ref} de ${contact.nom}, ${demande.evenement.invites} pers. le ${demande.evenement.date}`).catch(() => {});
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
  app.get('/facture/:token', wrap(async (req, res, next) => {
    const idx = await store.get('_facturetoken/' + sha(req.params.token));
    const f = idx ? await store.get('factures/' + idx.id) : null;
    if (!f) return next();
    res.set('Cache-Control', 'no-store').send(views.facturePage(await cat.get(), f, totaux(f)));
  }));

  async function changerStatut(demandeId, statut, par) {
    const d = await store.get('demandes/' + demandeId);
    if (!d || d.statut === statut) return;
    await store.set('demandes/' + demandeId, { ...d, statut, historique: [...(d.historique || []), { at: new Date().toISOString(), statut, par }] });
  }

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
  app.get('/api/session', (req, res) => res.set('Cache-Control', 'no-store').json({ connecte: isTeam(req), role: req.ctx.role, nom: req.ctx.name || '', email: req.ctx.email || '' }));
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
  A.get('/stats', wrap(async (req, res) => {
    const [dem, dv, fa] = await Promise.all([store.list('demandes'), store.list('devis'), store.list('factures')]);
    const demandes = dem.map(d => d.data), devis = dv.map(d => d.data), factures = fa.map(d => d.data);
    const mois = new Date().toISOString().slice(0, 7);
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const parStatut = Object.fromEntries(PIPELINE.map(k => [k, demandes.filter(d => d.statut === k && d.type !== 'contact').length]));
    const signes = devis.filter(d => d.statut === 'accepte');
    res.json({
      nouvelles: demandes.filter(d => d.statut === 'demande').length,
      parStatut,
      caSigneMoisCents: signes.filter(d => (d.signature?.at || '').startsWith(mois)).reduce((t, d) => t + totaux(d).ttcCents, 0),
      caSigneCents: signes.reduce((t, d) => t + totaux(d).ttcCents, 0),
      devisEnAttenteCents: devis.filter(d => d.statut === 'envoye').reduce((t, d) => t + totaux(d).ttcCents, 0),
      facturesImpayeesCents: factures.filter(f => f.type !== 'avoir' && !f.annuleeParAvoir).reduce((t, f) => t + FAC.etat(f).resteCents, 0),
      tauxSignature: devis.filter(d => ['accepte', 'refuse'].includes(d.statut)).length ? Math.round(100 * signes.length / devis.filter(d => ['accepte', 'refuse'].includes(d.statut)).length) : null,
      prochains: demandes.filter(d => d.evenement?.date >= aujourdHui && ['accord', 'reserve'].includes(d.statut)).sort((a, b) => a.evenement.date.localeCompare(b.evenement.date)).slice(0, 6).map(d => ({ id: d.id, date: d.evenement.date, nom: d.contact?.nom, invites: d.evenement.invites, statut: d.statut })),
      anniversaires: await anniversaires(14),
      rdvJour: (await store.list('rdv')).map(d => d.data).filter(r => r.clientId && r.type && !r.fait && r.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })).sort((a, b) => a.heure.localeCompare(b.heure)).map(r => ({ id: r.id, clientId: r.clientId, clientNom: r.clientNom, type: r.type, heure: r.heure, motif: r.motif, lien: r.lien, commerciaux: r.commerciaux })),
      aRelancer: devis.filter(d => d.statut === 'envoye' && d.envoyeLe && Date.now() - Date.parse(d.derniereRelance || d.envoyeLe) > 3 * 86400e3).map(d => ({ id: d.id, numero: d.numero, client: d.clientNom, envoyeLe: d.envoyeLe })),
    });
  }));

  A.get('/site', wrap(async (req, res) => res.json((await store.get('site/reglages')) || {})));
  A.put('/site', sameSite, json, wrap(async (req, res) => {
    const before = (await store.get('site/reglages')) || {};
    await store.set('site/reglages', { ...before, ...req.body, updatedAt: new Date().toISOString() });
    cat.invalidate(); audit(req.ctx, 'réglages du site modifiés', 'site/reglages');
    res.json({ ok: true });
  }));

  /* code postal -> département, téléphone -> format SMS (comme pour les fiches importées) */
  function ficheClientNette(data, before) {
    if (typeof data.cp === 'string') { data.cp = data.cp.replace(/\s/g, ''); if (data.cp !== (before?.cp || '')) data.departement = departementDe(data.cp) || data.departement || ''; }
    if (typeof data.tel === 'string' && data.tel !== (before?.tel || '')) { const t = normTel(data.tel); data.telE164 = t?.ok ? t.e164 : ''; if (t?.ok) data.tel = t.tel; }
    if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase();
  }
  /* ---------- import du fichier clients (Excel / CSV) ---------- */
  const importClients = creerImportClients({ store, log });
  importClients.routes(A, { sameSite, manager, wrap, audit });

  /* ---------- clients : recherche et pages côté serveur (le fichier importé compte ~60 000 fiches) ---------- */
  const sansAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const telK = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
  let idxClients = null;
  async function annuaireServeur() {
    const v = (await Promise.all(['clients', 'demandes', 'devis', 'factures'].map(k => store.version(k)))).join('|');
    if (idxClients?.v === v) return idxClients;
    const [cl, dem, dv, fac] = await Promise.all(['clients', 'demandes', 'devis', 'factures'].map(k => store.list(k)));
    const nbDem = new Map(), lies = new Set(), extra = new Map();
    const plus = (id, t) => { if (!id) return; extra.set(id, (extra.get(id) || '') + ' ' + t); };
    for (const { data: d } of dem) { if (!d.clientId) continue; lies.add(d.clientId); if (d.type !== 'contact') nbDem.set(d.clientId, (nbDem.get(d.clientId) || 0) + 1); plus(d.clientId, [d.ref, d.contact?.nom, d.contact?.email].join(' ')); }
    for (const { data: d } of dv) { if (d.clientId) { lies.add(d.clientId); plus(d.clientId, d.numero); } }
    for (const { data: d } of fac) { if (d.clientId) { lies.add(d.clientId); plus(d.clientId, d.numero); } }
    const items = cl.map(({ id, data: c }) => ({
      c: { ...c, id, journal: undefined }, id, nb: nbDem.get(id) || 0, lie: lies.has(id) || (c.journal || []).length > 0,
      importe: c.source === 'import CRM', last: String(c.derniereActivite || ''),
      hay: sansAcc([c.nom, c.prenom, c.nomFamille, c.societe, c.email, c.ville, c.cp, extra.get(id)].join(' ')),
      tels: [c.tel, c.telE164, c.telAutre].map(telK).filter(Boolean),
    }));
    items.sort((a, b) => b.last.localeCompare(a.last));
    idxClients = { v, items };
    return idxClients;
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
    const { items } = await annuaireServeur();
    res.set('Cache-Control', 'no-store');
    /* clients « en activité » : tous, sauf les contacts importés qui n'ont encore ni demande, ni devis, ni note */
    if (q.vue === 'actifs') return res.json(items.filter(a => !a.importe || a.lie).map(a => a.c));
    if (q.ids) { const ids = new Set(String(q.ids).split(',').slice(0, 200)); return res.json(items.filter(a => ids.has(a.id)).map(a => a.c)); }
    let l = filtrerClients(items, String(q.q || '').slice(0, 80));
    if (q.filtre === 'importes') l = l.filter(a => a.importe); else if (q.filtre === 'autres') l = l.filter(a => !a.importe);
    const par = Math.min(200, Math.max(10, parseInt(q.par, 10) || 50)), page = Math.max(1, parseInt(q.page, 10) || 1);
    res.json({ total: l.length, tous: items.length, importes: items.filter(a => a.importe).length, page, par, items: l.slice((page - 1) * par, page * par).map(a => ({ ...a.c, nbDemandes: a.nb })) });
  }));

  A.get('/:coll', wrap(async (req, res, next) => {
    if (!COLLECTIONS.includes(req.params.coll)) return next();
    const docs = (await store.list(req.params.coll)).map(d => ({ id: d.id, ...d.data, _maj: d.updatedAt }));
    res.set('Cache-Control', 'no-store').json(docs);
  }));
  A.get('/:coll/:id', wrap(async (req, res, next) => {
    if (!COLLECTIONS.includes(req.params.coll)) return next();
    const d = await store.get(req.params.coll + '/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Introuvable.' });
    res.set('Cache-Control', 'no-store').json({ id: req.params.id, ...d });
  }));
  A.put('/:coll/:id', sameSite, json, wrap(async (req, res, next) => {
    const { coll, id } = req.params;
    if (!COLLECTIONS.includes(coll) || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) return next();
    const before = await store.get(coll + '/' + id);
    let data = { ...(req.body || {}) };
    delete data._maj;
    if (coll === 'devis') {
      if (before && before.statut === 'accepte' && req.ctx.role !== 'manager') return res.status(403).json({ error: 'Un devis signé ne peut être modifié que par le Manager.' });
      const err = controleMarge(data);
      if (err.length) return res.status(400).json({ error: 'Marge négative bloquée : ' + err.join(' ') });
      data.token = before?.token || data.token;
    }
    if (coll === 'demandes' && before && data.statut && data.statut !== before.statut) data.historique = [...(before.historique || []), { at: new Date().toISOString(), statut: data.statut, par: req.ctx.name || req.ctx.email }];
    if (coll === 'produits' && !data.slug) data.slug = id;
    if (coll === 'clients' && typeof data.nom === 'string') data.nom = nomPropre(data.nom);
    if (coll === 'clients' && 'naissance' in data) data.naissance = dateNaissance(data.naissance);
    if (coll === 'clients') ficheClientNette(data, before);
    if (coll === 'demandes' && typeof data.contact?.nom === 'string') data.contact = { ...data.contact, nom: nomPropre(data.contact.nom) };
    if (coll === 'clients') { if (before?.journal) data.journal = before.journal; else delete data.journal; } /* notes et appels de l'historique jamais effacés par une fiche ouverte avant */
    data.updatedAt = new Date().toISOString();
    await store.set(coll + '/' + id, data);
    if (['produits', 'rubriques', 'lieux', 'avis', 'pages'].includes(coll)) cat.invalidate();
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
    if (await store.get(coll + '/' + id)) id = id + '-' + rid(3).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    const data = { ...(req.body || {}), createdAt: new Date().toISOString() };
    if (coll === 'clients' && typeof data.nom === 'string') data.nom = nomPropre(data.nom); if (coll === 'clients') data.id = id;
    if (coll === 'clients' && 'naissance' in data) data.naissance = dateNaissance(data.naissance);
    if (coll === 'clients') ficheClientNette(data, null);
    if (coll === 'produits') Object.assign(data, { id, slug: id, statut: data.statut || 'masque', maison: true, photos: data.photos || [], description: data.description || [], sections: data.sections || [], groupes: [], variantes: [], details: [], regles: data.regles || { packs: true, personnel: 'service' }, ordre: -1 });
    if (coll === 'lieux') Object.assign(data, { slug: id, statut: data.statut || 'masque', photos: data.photos || [], equipements: data.equipements || [] });
    if (coll === 'rubriques') Object.assign(data, { slug: id, statut: data.statut || 'visible', ordre: data.ordre ?? 99, tva: data.tva || 10 });
    await store.set(coll + '/' + id, data);
    cat.invalidate();
    audit(req.ctx, 'création', coll + '/' + id, data.titre || data.nom || '');
    res.json({ ok: true, id });
  }));
  A.delete('/:coll/:id', sameSite, wrap(async (req, res, next) => {
    const { coll, id } = req.params;
    if (!COLLECTIONS.includes(coll)) return next();
    if (['produits', 'lieux', 'rubriques'].includes(coll)) return res.status(400).json({ error: 'Pour le catalogue, on masque au lieu de supprimer.' });
    if (['devis', 'factures'].includes(coll) && req.ctx.role !== 'manager') return res.status(403).json({ error: 'Réservé au Manager.' });
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
  async function devisDepuisDemande(d, ctx, extra = {}) {
    const c = await cat.get();
    const T = c.reglages.tarifs || {};
    const id = 'v_' + rid(8), token = rid(18);
    const numero = await prochainNumero(store, 'devis');
    const validite = new Date(Date.now() + (T.validiteDevisJours || 15) * 86400e3).toISOString().slice(0, 10);
    const devis = {
      id, numero, token, demandeId: d.id, clientId: d.clientId, clientNom: d.contact?.nom || '', statut: 'brouillon',
      evenement: { type: d.evenement?.type, date: d.evenement?.date, invites: d.evenement?.invites, lieu: [d.evenement?.cp, d.evenement?.ville].filter(Boolean).join(' ') },
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
  A.get('/ia/etat', wrap(async (req, res) => { const R = (await cat.get()).reglages; res.json({ actif: ia.actif, evenements: R.evenements || [], tarifs: R.tarifs || {}, origine: R.origine || null }); }));
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
    try { res.json({ articles: IA.nettoyerArticles(IA.json(await ia.demander(IA.promptProduits(fichePourIa, s(req.body?.texte, 6000), compact, c.reglages.tarifs || {}), { effort: 'medium', maxTokens: 6000 })), c, compact.visibles) }); }
    catch (e) { iaErreur(res, e); }
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
    const now = new Date().toISOString();
    let clientId = null;
    if (f.email) {
      const idx = await store.get('_clientemail/' + sha(f.email)), cl = idx && await store.get('clients/' + idx.id);
      if (cl) { clientId = idx.id; await store.set('clients/' + clientId, { ...cl, nom: cl.nom || nom, tel: cl.tel || f.tel, societe: cl.societe || f.societe, adresse: cl.adresse || f.adresse, derniereActivite: now }); }
    }
    if (!clientId) {
      clientId = 'c_' + rid(8);
      await store.set('clients/' + clientId, { id: clientId, nom, email: f.email, tel: f.tel, societe: f.societe, adresse: f.adresse, notes: '', creeLe: now, derniereActivite: now, source: 'téléphone (IA)' });
      if (f.email) await store.set('_clientemail/' + sha(f.email), { id: clientId });
    }
    const lignes = articles.map(a => ({ slug: a.slug, titre: a.titre, rubrique: a.rubrique, unite: a.unite, qte: a.qte, prixCents: a.prixCents, supCents: 0,
      totalCents: (a.prixCents || 0) * a.qte, surDevis: a.prixCents == null, variante: '', choix: {}, resume: '', note: a.note, personnel: null, pack: null }));
    if (f.serveurs) lignes[0].personnel = { nb: f.serveurs, heures: Math.max(T.personnel?.minHeures || 4, +f.heures || 0) };
    if (f.vaisselle && (T.packs || []).some(x => x.id === f.vaisselle)) lignes[0].pack = { id: f.vaisselle, nb: +f.invites || lignes[0].qte };
    const km = Math.min(2000, Math.max(0, Math.round(+req.body?.km || 0)));
    const sousTotal = lignes.reduce((t, l) => t + l.totalCents, 0), seuil = T.livraisonOfferteCents ?? 70000, offerte = !!(km && seuil > 0 && sousTotal >= seuil);
    const id = 'd_' + rid(8), ref = await prochainNumero(store, 'demande'), par = req.ctx.name || req.ctx.email || 'équipe';
    const demande = {
      id, ref, type: 'devis', source: 'Téléphone (IA)', clientId, contact: { nom, email: f.email, tel: f.tel, societe: f.societe },
      evenement: { type: f.type, date: f.date, invites: +f.invites || 0, cp: f.cp, ville: f.ville, adresse: f.adresse, horaire: f.horaire },
      livraison: km ? { km, cents: offerte ? 0 : km * (T.kmCents || 100), ...(offerte ? { offerte: true } : {}) } : null,
      lignes, sousTotalCents: sousTotal, totalEstimeCents: sousTotal + (km && !offerte ? km * (T.kmCents || 100) : 0),
      message: [f.notes, 'Commande préparée avec l’IA à partir de : ' + s(req.body?.texte, 6000)].filter(Boolean).join('\n\n'), statut: 'demande',
      historique: [{ at: now, statut: 'demande', par }], createdAt: now, commercial: par,
    };
    await store.set('demandes/' + id, demande);
    audit(req.ctx, 'commande préparée avec l’IA', 'demandes/' + id, ref);
    const devisId = await devisDepuisDemande(demande, req.ctx, { iaDraft: true });
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
      evenement: { ...(src.evenement || {}) }, lignes: (src.lignes || []).map(l => ({ ...l })), remiseCents: src.remiseCents || 0, acomptePct: src.acomptePct ?? null,
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
  function messageDevis(cl, liste, msg, R) {
    const prenom = esc((cl.nom || '').split(' ')[0]);
    const plusieurs = liste.length > 1, ev = liste[0].evenement || {};
    const intro = msg ? `<p>${esc(msg).replace(/\n/g, '<br>')}</p>` : `<p>${plusieurs ? `Voici nos ${liste.length} propositions` : 'Voici votre devis'} pour votre ${esc(String(ev.type || 'événement').toLowerCase())}${ev.date ? ' du ' + esc(dateFr(ev.date)) : ''}${plusieurs ? ' : choisissez celle qui vous convient et signez-la en ligne.' : '.'}</p>`;
    const bloc = (d, i) => { const lien = `${SITE}/devis/${d.token}`, nom = d.titre || (plusieurs ? 'Proposition ' + LETTRES[i] : 'Votre devis');
      return `<div style="border:1px solid #e3d9c4;border-radius:10px;padding:14px 16px;margin:12px 0"><p style="margin:0 0 4px"><b>${esc(nom)}</b> · devis ${esc(d.numero)}</p><p style="margin:0 0 10px">${euros(totaux(d).ttcCents)} TTC${d.validiteJusquau ? ` · valable jusqu’au ${esc(dateFr(d.validiteJusquau))}` : ''}</p><a href="${lien}" style="background:#1d3b2f;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;display:inline-block">Consulter et signer ${plusieurs ? 'cette proposition' : 'mon devis'}</a></div>`; };
    const html = `<p>Bonjour ${prenom},</p>${intro}${liste.map(bloc).join('')}<p>L’équipe Magnolia Traiteur<br>${esc(R.telephone || '')}</p>`;
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
      if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
      if (!(d.lignes || []).length) return res.status(400).json({ error: `Le devis ${d.numero} est vide.` });
      const err = controleMarge(d); if (err.length) return res.status(400).json({ error: `Devis ${d.numero} : marge négative bloquée. ` + err.join(' ') });
      liste.push(d);
    }
    if (new Set(liste.map(d => d.clientId)).size > 1) return res.status(400).json({ error: 'Les devis cochés ne sont pas pour le même client.' });
    const cl = await store.get('clients/' + liste[0].clientId);
    if (!cl?.email) return res.status(400).json({ error: 'Ce client n’a pas d’e-mail.' });
    liste.sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
    const R = (await cat.get()).reglages, msg = s(req.body?.message, 2000), canaux = (req.body?.canaux || ['email']).filter(x => ['email', 'sms'].includes(x));
    const m = messageDevis(cl, liste, msg, R);
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
  A.post('/actions/envoyer-devis/:id', sameSite, json, wrap(async (req, res) => {
    const d = await store.get('devis/' + req.params.id);
    if (!d) return res.status(404).json({ error: 'Devis introuvable.' });
    const err = controleMarge(d);
    if (err.length) return res.status(400).json({ error: 'Marge négative bloquée : ' + err.join(' ') });
    if (!(d.lignes || []).length) return res.status(400).json({ error: 'Le devis est vide.' });
    const cl = await store.get('clients/' + d.clientId);
    if (!cl?.email) return res.status(400).json({ error: 'Ce devis n’a pas de client avec un e-mail.' });
    const c = await cat.get(); const R = c.reglages;
    const lien = `${SITE}/devis/${d.token}`;
    const t = totaux(d);
    const now = new Date().toISOString();
    const canaux = req.body?.canaux || ['email'];
    const msg = s(req.body?.message, 2000);
    if (canaux.includes('email')) await brevo.sendEmail({ to: cl.email, name: cl.nom, replyTo: R.email, subject: `Votre devis Magnolia Traiteur ${d.numero}`,
      html: `<p>Bonjour ${esc((cl.nom || '').split(' ')[0])},</p>${msg ? `<p>${esc(msg).replace(/\n/g, '<br>')}</p>` : `<p>Voici votre devis pour votre ${esc(String(d.evenement?.type || 'événement').toLowerCase())}${d.evenement?.date ? ' du ' + esc(dateFr(d.evenement.date)) : ''} : <b>${euros(t.ttcCents)} TTC</b>.</p>`}<p><a href="${lien}" style="background:#1d3b2f;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;display:inline-block">Consulter et signer mon devis</a></p><p>Il est valable jusqu’au ${esc(dateFr(d.validiteJusquau))}.</p><p>L’équipe Magnolia Traiteur<br>${esc(R.telephone)}</p>`,
      text: `Votre devis ${d.numero} : ${lien}` });
    if (canaux.includes('sms') && cl.tel) await brevo.sendSms({ to: cl.tel, content: `Magnolia Traiteur : votre devis ${d.numero} (${euros(t.ttcCents)} TTC) est prêt. Consultez-le et signez en ligne : ${lien}` });
    await store.set('devis/' + d.id, { ...d, statut: d.statut === 'accepte' ? 'accepte' : 'envoye', envoyeLe: d.envoyeLe || now, envois: [...(d.envois || []), { at: now, canaux, par: req.ctx.name }] });
    if (d.demandeId) await changerStatut(d.demandeId, 'devis_envoye', req.ctx.name);
    audit(req.ctx, 'devis envoyé', 'devis/' + d.id, d.numero);
    res.json({ ok: true, lien, test: !brevo.live });
  }));

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
      objet: `${d.evenement?.type || 'Événement'} du ${dateFr(d.evenement?.date)}`, evenementDate: d.evenement?.date || '', commercial: d.commercial?.nom || '', date: new Date().toISOString().slice(0, 10), lignes, remiseCents, dejaRegleCents, reglements: [], payee: false, createdAt: new Date().toISOString(), creePar: ctx.name });
    await store.set('factures/' + id, f);
    await store.set('_facturetoken/' + sha(token), { id });
    audit(ctx, 'facture créée', 'factures/' + id, numero);
    return f;
  }
  const tarifs = async () => (await cat.get()).reglages.tarifs || {};
  /* liste enrichie : reste à payer, échéance, statut (à envoyer, non réglée, en retard, réglée, archivée…) */
  A.get('/actions/factures', wrap(async (req, res) => {
    const T = await tarifs();
    const l = (await store.list('factures')).map(x => x.data).filter(Boolean).map(f => { const e = FAC.etat(f); return { ...f, lignes: undefined, etat: { dueCents: e.dueCents, regleCents: e.regleCents, resteCents: e.resteCents, ttcCents: e.ttcCents, nb: e.reglements.length }, statutF: FAC.statut(f, T), echeance: FAC.echeance(f, T), reglements: e.reglements }; });
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
    if (req.ctx.role !== 'manager') return res.status(403).json({ error: 'Réservé au Manager.' });
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
    return qui.map(nom => { const p = P.find(x => x.nom === nom) || {}, u = users.find(x => x.name === nom) || {}; return { nom, email: p.email || u.email || '', tel: p.tel || '' }; });
  }
  A.post('/actions/rdv-client/:id', sameSite, json, wrap(async (req, res) => {
    const c0 = await store.get('clients/' + req.params.id), c = c0 && { ...c0, id: req.params.id }; /* une fiche créée dans le back-office n'a pas toujours son id dans le document */
    if (!c) return res.status(404).json({ error: 'Client introuvable.' });
    const b = req.body || {}, type = b.type === 'visio' ? 'visio' : 'appel';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.heure || '')) return res.status(400).json({ error: 'Choisissez la date et l’heure.' });
    if (parisMs(b.date, b.heure) < Date.now() - 36e5) return res.status(400).json({ error: 'Cette date est déjà passée.' });
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
    const demandes = dem.filter(d => d.clientId === c.id);
    const devisL = dv.filter(d => d.clientId === c.id || (d.demandeId && demandes.some(x => x.id === d.demandeId)));
    const facts = fac.filter(f => f.clientId === c.id || devisL.some(d => d.id === f.devisId));
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
      add(d.createdAt, 'devis', `Devis ${num} préparé`, { montantCents: t.ttcCents, par: d.commercial?.nom || '', lien: '#/devis/' + d.id, statutDevis: d.statut });
      for (const x of d.envois || []) { add(x.at, 'envoi', `Devis ${num} envoyé`, { detail: 'par ' + (x.canaux || ['email']).map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' et '), montantCents: t.ttcCents, par: x.par, lien: d.token ? '/devis/' + d.token : '' }); lies.push([x.at, num]); }
      if (d.vuLe) add(d.vuLe, 'vu', `Le client a ouvert le devis ${num}`);
      for (const r of d.relances || []) { add(r.at, 'relance', `Relance : ${r.modele || ''}`.trim(), { detail: 'Devis ' + num, par: r.par }); lies.push([r.at, num, true]); }
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
    ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const signes = devisL.filter(d => d.statut === 'accepte');
    res.json({
      client: c, events: ev,
      rdv: rdv.filter(r => r.clientId === c.id && r.type).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure)),
      demandes: demandes.map(d => ({ id: d.id, ref: d.ref, statut: d.statut, type: d.type, evenement: d.evenement, createdAt: d.createdAt, commercial: d.commercial || '' })),
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
  const critDe = b => ({ statut: ['commandes', 'prospects'].includes(b?.statut) ? b.statut : '', montantMin: Math.max(0, Math.round(+b?.montantMin || 0)), deps: (Array.isArray(b?.deps) ? b.deps : []).map(x => s(x, 3)).slice(0, 120), types: (Array.isArray(b?.types) ? b.types : []).map(x => s(x, 60)).slice(0, 40), pro: ['pro', 'part'].includes(b?.pro) ? b.pro : '', accord: !!b?.accord });
  /* destinataires : mode « critères » (tous ceux qui correspondent, moins ceux décochés) ou « un par un » (seulement ceux cochés) */
  function destinataires(l, canal, b) {
    const base = DIF.filtrer(l, canal, critDe(b?.criteres));
    if (b?.mode === 'manuel') { const ins = new Set((b.inclus || []).map(String)); return DIF.filtrer(l, canal, {}).filter(p => ins.has(p.id)); }
    const ex = new Set((b?.exclus || []).map(String));
    return base.filter(p => !ex.has(p.id));
  }
  A.get('/diffusion/criteres', wrap(async (req, res) => {
    profilsCache = null; /* chaque ouverture de l'écran repart de données fraîches */
    const l = await lesProfils(), deps = new Map(), types = new Map();
    for (const p of l) { for (const d of p.deps) deps.set(d, (deps.get(d) || 0) + 1); for (const t of p.types) types.set(t, (types.get(t) || 0) + 1); }
    const R = (await cat.get()).reglages;
    res.json({
      total: l.length, email: DIF.filtrer(l, 'email').length, sms: DIF.filtrer(l, 'sms').length,
      stopEmail: l.filter(p => p.stopEmail).length, stopSms: l.filter(p => p.stopSms).length,
      deps: [...deps].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true })), types: [...types].sort((a, b) => b[1] - a[1]),
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
    const [dem, rdv] = await Promise.all([store.list('demandes'), store.list('rdv')]);
    const items = [
      ...dem.map(d => d.data).filter(d => d.evenement?.date && d.type !== 'contact' && d.statut !== 'refuse').map(d => ({ id: d.id, type: 'evenement', date: d.evenement.date, titre: `${d.contact?.nom || ''} · ${d.evenement.type || ''}`, detail: `${d.evenement.invites || ''} pers. · ${d.evenement.ville || ''} · ${d.evenement.horaire || ''}`, statut: d.statut, commercial: d.commercial || '', lien: '#/demandes/' + d.id })),
      ...rdv.map(r => ({ id: r.id, type: 'rdv', ...r.data, visio: r.data.lien || '', lien: r.data.clientId ? '#/clients/' + r.data.clientId : '#/agenda' })),
      ...(await anniversaires(400)).map(a => ({ id: 'anniv-' + a.id, type: 'anniversaire', date: a.date, titre: '🎂 ' + a.nom, detail: `Anniversaire (${a.age} ans)`, statut: 'anniv', lien: '#/clients/' + a.id })),
    ];
    res.json(items.sort((a, b) => String(a.date).localeCompare(String(b.date))));
  }));

  /* équipe */
  A.get('/actions/equipe', wrap(async (req, res) => res.json((await store.list('_users')).map(d => ({ id: d.id, email: d.data.email, nom: d.data.name, role: d.data.role, desactive: !!d.data.disabled, creeLe: d.data.createdAt })))));
  A.post('/actions/equipe', sameSite, json, manager, wrap(async (req, res) => {
    try { const id = await createUser({ email: req.body?.email, name: req.body?.nom, role: req.body?.role, password: req.body?.password }); audit(req.ctx, 'compte créé', '_users/' + id, req.body?.email); res.json({ ok: true, id }); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  }));
  A.patch('/actions/equipe/:id', sameSite, json, manager, wrap(async (req, res) => {
    const u = await store.get('_users/' + req.params.id); if (!u) return res.status(404).json({ error: 'Compte introuvable.' });
    if (req.params.id === req.ctx.uid && (req.body.desactive || req.body.role === 'collab')) return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits.' });
    const next = { ...u };
    if (typeof req.body.desactive === 'boolean') next.disabled = req.body.desactive;
    if (['manager', 'collab'].includes(req.body.role)) next.role = req.body.role;
    if (typeof req.body.nom === 'string') { const n = req.body.nom.trim().slice(0, 80); if (n.length < 2) return res.status(400).json({ error: 'Écrivez le prénom et le nom.' }); next.name = n; }
    if (req.body.password) { if (String(req.body.password).length < 10) return res.status(400).json({ error: 'Mot de passe : 10 caractères minimum.' }); next.passHash = await bcrypt.hash(String(req.body.password), 11); }
    await store.set('_users/' + req.params.id, next);
    audit(req.ctx, 'compte modifié', '_users/' + req.params.id, u.email);
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
  A.get('/actions/export/:quoi', wrap(async (req, res) => {
    const q = req.params.quoi; let rows;
    if (q === 'catalogue') {
      const c = await cat.get(); const rubs = new Map(c.rubriques.map(r => [r.slug, r.nom]));
      rows = [['Code (ne pas modifier)', 'Prestation', 'Rubrique', 'Prix TTC (€)', 'Par', 'Minimum', 'Coût de revient TTC (€)', 'TVA %', 'Statut (visible / masque)', 'Maison (oui / non)'],
        ...c.produits.map(p => [p.slug, p.titre, rubs.get(p.rubrique) || p.rubrique, eurCsv(p.prixCents), p.unite || '', p.min || '', eurCsv(p.coutCents), p.tva ?? '', p.statut || 'visible', p.maison ? 'oui' : 'non'])];
    } else if (q === 'demandes') {
      rows = [['Réf.', 'Reçue le', 'Type', 'Nom', 'Société', 'E-mail', 'Téléphone', 'Événement', 'Date', 'Invités', 'Code postal', 'Ville', 'Estimé TTC (€)', 'Étape'],
        ...(await store.list('demandes')).map(d => d.data).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(d => [d.ref, String(d.createdAt || '').slice(0, 10), d.type, d.contact?.nom, d.contact?.societe, d.contact?.email, d.contact?.tel, d.evenement?.type || d.sujet, d.evenement?.date, d.evenement?.invites, d.evenement?.cp, d.evenement?.ville, eurCsv(d.totalEstimeCents), d.statut])];
    } else if (q === 'clients') {
      rows = [['Nom', 'Société', 'E-mail', 'Téléphone', 'Autre téléphone', 'Adresse', 'Code postal', 'Ville', 'Département', 'Créé le', 'Dernière activité', 'Source', 'Accepte les e-mails', 'Accepte les SMS'],
        ...(await store.list('clients')).map(d => d.data).map(c => [c.nom, c.societe, c.email, c.tel, c.telAutre, c.adresse, c.cp, c.ville, c.departement, String(c.creeLe || '').slice(0, 10), String(c.derniereActivite || '').slice(0, 10), c.source,
          c.desinscrit?.email ? 'non (désinscrit)' : c.consentement?.email ? 'oui' : '', c.desinscrit?.sms ? 'non (STOP)' : c.consentement?.sms ? 'oui' : ''])];
    } else if (q === 'factures') {
      const T = (await cat.get()).reglages.tarifs || {};
      const docs = (await store.list('factures')).map(d => d.data).sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
      rows = [['N° facture', 'Type', 'Date', 'Client', 'Société', 'E-mail', 'N° devis', 'Objet', 'Total TTC (€)', 'Total HT (€)', 'Déjà réglé (€)', 'Reste dû (€)', 'Échéance', 'Nombre de règlements', 'Détail des règlements', 'Statut', 'Envoyée le', 'Relances'],
        ...docs.map(f => { const e = FAC.etat(f), t = totaux(f), sg = f.type === 'avoir' ? -1 : 1; return [f.numero, { acompte: 'Acompte', solde: 'Solde', totale: 'Facture', avoir: 'Avoir' }[f.type] || '', f.date, f.client?.nom, f.client?.societe, f.client?.email, f.devisNumero, f.objet, eurCsv(sg * e.dueCents), eurCsv(sg * t.htCents), eurCsv(e.regleCents), eurCsv(f.type === 'avoir' ? 0 : e.resteCents), FAC.echeance(f, T), e.reglements.length, e.reglements.map(r => `${r.date} ${r.moyen} ${eurCsv(r.montantCents)}`).join(' | '), FAC.STATUTS[FAC.statut(f, T)], String(f.envoyeeLe || '').slice(0, 10), (f.relances || []).length]; })];
    } else if (q === 'reglements') {
      const docs = (await store.list('factures')).map(d => d.data);
      rows = [['Date', 'Montant (€)', 'Moyen de paiement', 'N° facture', 'Client', 'N° devis', 'Note', 'Saisi par'],
        ...docs.flatMap(f => FAC.libelles(f).map(r => [r.date, eurCsv(r.montantCents), r.moyen, f.numero, f.client?.nom, f.devisNumero, [r.libelle, r.note].filter(Boolean).join(' · '), r.par])).sort((a, b) => String(a[0]).localeCompare(String(b[0])))];
    } else if (q === 'devis') {
      const docs = (await store.list(q)).map(d => d.data);
      rows = [[q === 'devis' ? 'N° devis' : 'N° facture', 'Client', 'Date', 'Total TTC (€)', 'Total HT (€)', 'Marge (€)', 'Statut'],
        ...docs.map(d => { const t = totaux(d); return [d.numero, d.clientNom || d.client?.nom, String(d.envoyeLe || d.date || d.createdAt || '').slice(0, 10), eurCsv(q === 'factures' ? d.totalCents ?? t.ttcCents : t.ttcCents), eurCsv(t.htCents), eurCsv(t.margeCents), q === 'factures' ? (d.payee ? 'payée' : 'à encaisser') : d.statut]; })];
    } else return res.status(404).json({ error: 'Export inconnu.' });
    audit(req.ctx, 'export Excel', '', q);
    res.set('Content-Disposition', `attachment; filename="magnolia-${q}-${new Date().toISOString().slice(0, 10)}.csv"`).type('text/csv; charset=utf-8').send(csv(rows));
  }));
  /* mise à jour par fichier : seules les colonnes prix, minimum, coût, TVA, statut et maison sont reprises ; jamais de création ni de suppression */
  A.post('/actions/import-catalogue', sameSite, express.json({ limit: '2mb' }), manager, wrap(async (req, res) => {
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
  A.post('/actions/reimporter', sameSite, manager, wrap(async (req, res) => {
    const r = await seed(store, { force: true, log }); await importerAvisAncienSite(store, { log }); await initSousRubriques(store, { log });
    cat.invalidate(); audit(req.ctx, 'catalogue réimporté depuis le brouillon', '');
    res.json({ ok: true, ...r });
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
    return views.boutique(c, { intro: { titre: r.introTitre, texte: r.introTexte }, rub: r.slug, titre: r.nom, chapo: r.chapo || r.accroche, photo: r.photoAccueil || r.photo, path: '/' + r.slug, liste: c.byRub.get(r.slug), sections: views.sectionsRub(r, c.byRub.get(r.slug)), avant: p3, scripts: p3 ? `<script src="/js/plateau.js?v=${views.V}" defer></script>` : '' });
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
