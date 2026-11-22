'use strict';
const _fs = require('fs'), _path = require('path');
const _logos = new Map();
function logoExiste(src) { if (!src) return false; if (!src.startsWith('/site/')) return true; if (!_logos.has(src)) _logos.set(src, _fs.existsSync(_path.join(__dirname, '..', 'public', src))); return _logos.get(src); }
/* Pages publiques, rendues par le serveur (rapides et bien référencées par Google). */
const { esc, euros, dateFr } = require('./util');
const { prixCourt } = require('./catalogue');

const V = (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 8) || Date.now().toString(36); /* change à chaque mise en ligne : force le rechargement du CSS et du JS */
const MONO = '<img class="mono" src="/brand/monogramme.svg" alt="" width="40" height="34">';

const icon = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
};

const rubHref = r => '/' + r.slug;
const prodHref = p => '/' + p.rubrique + '/' + p.slug;
const img = (src, alt = '', cls = '', attrs = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''} ${attrs}>` : `<div class="noimg ${cls}" aria-hidden="true">${MONO}</div>`;

/* Google Ads : balise chargée seulement si le compte est renseigné, et en mode consentement (rien n'est mesuré avant l'accord du visiteur) */
const ADS_RE = /^AW-\d{6,14}$/, LAB_RE = /^[A-Za-z0-9_-]{4,64}$/;
function adsTag() { return ''; } /* la balise Google n'est chargée par le navigateur qu'après « Accepter » (règles CNIL) */
function adsConv(R) {
  const S = R.suivi || {}, id = S.googleAdsId;
  if (!ADS_RE.test(id || '')) return '';
  const d = LAB_RE.test(S.conversionDemande || '') ? ` data-conv-demande="${id}/${S.conversionDemande}"` : '';
  const k = LAB_RE.test(S.conversionContact || '') ? ` data-conv-contact="${id}/${S.conversionContact}"` : '';
  return ` data-ads="${id}"` + d + k;
}

function layout(c, { title, description = '', body, path = '/', schema = null, bodyClass = '', image = '' }) {
  const R = c.reglages;
  const fullTitle = title ? `${title} · ${R.nom || 'Magnolia Traiteur'}` : `${R.nom || 'Magnolia Traiteur'} · Traiteur événementiel à Paris et en Île-de-France`;
  const site = (process.env.SITE_URL || 'https://www.magnoliatraiteur.fr').replace(/\/$/, '');
  const rubs = c.rubriques.filter(r => r.statut !== 'masque' && r.slug !== 'lieux');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || R.accueil?.sousTitre || '')}">
<link rel="canonical" href="${esc(site + path)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(site + image)}">` : ''}
<meta name="theme-color" content="#1d3b2f">
<link rel="icon" href="/brand/monogramme.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site.css?v=${V}">
${process.env.SITE_NOINDEX === '1' ? '<meta name="robots" content="noindex, nofollow">' : ''}
${adsTag(R)}
${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body class="${bodyClass}"${adsConv(R)}>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="top" data-top>
  <div class="top-in">
    <button class="burger" type="button" aria-label="Ouvrir le menu" data-open-menu>${icon.menu}</button>
    <a class="brand" href="/" aria-label="${esc(R.nom)}, accueil">${MONO}<span class="brand-txt">Magnolia<small>${esc(R.sousNom || 'Traiteur · Événementiel')}</small></span></a>
    <nav class="nav" aria-label="Principal">
      <button type="button" class="nav-l" data-open-search>${icon.search}<span>Rechercher</span></button>
      <a class="nav-l" href="/boutique">La boutique</a>
      <a class="nav-l" href="/lieux">Lieux</a>
      <a class="nav-l" href="/maison">La maison</a>
      <a class="nav-l" href="/temoignages">Avis clients</a>
      <a class="nav-l" href="/espace-client" aria-label="Mon espace">${icon.user}<span>Mon espace</span></a>
      <a class="nav-sel" href="/ma-selection">${icon.bag}<span>Ma sélection</span><b class="badge" data-sel-count hidden>0</b></a>
    </nav>
  </div>
</header>
<div class="drawer" data-menu hidden>
  <div class="drawer-in" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="drawer-h"><span class="brand-txt">Magnolia<small>${esc(R.sousNom || '')}</small></span><button type="button" class="x" data-close-menu aria-label="Fermer">×</button></div>
    <form class="drawer-s" action="/boutique" role="search"><input type="search" name="q" placeholder="Paëlla, DJ, huîtres…" aria-label="Rechercher"><button aria-label="Rechercher">${icon.search}</button></form>
    <p class="eyebrow">Nos univers</p>
    <ul class="drawer-l">${rubs.map(r => `<li><a href="${rubHref(r)}">${esc(r.nom)}<span>${c.byRub.get(r.slug)?.length || ''}</span></a></li>`).join('')}<li><a href="/lieux">Lieux de réception<span>${c.lieux.filter(l => l.statut !== 'masque').length}</span></a></li></ul>
    <p class="eyebrow">Magnolia</p>
    <ul class="drawer-l small"><li><a href="/maison">La maison</a></li><li><a href="/comment-commander">Comment commander</a></li><li><a href="/livraison">Zones de livraison</a></li><li><a href="/temoignages">Avis clients</a></li><li><a href="/contact">Contact</a></li><li><a href="/espace-client">Mon espace client</a></li></ul>
    <a class="btn btn-or wide" href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">${icon.phone} ${esc(R.telephone)}</a>
  </div>
</div>
<div class="searchlay" data-search hidden>
  <div class="searchlay-in" role="dialog" aria-modal="true" aria-label="Recherche">
    <form action="/boutique" role="search" class="bigsearch" data-live-search>
      ${icon.search}<input type="search" name="q" placeholder="Que recherchez-vous ?" aria-label="Que recherchez-vous ?" autocomplete="off">
      <button type="button" class="mic" data-dictee aria-label="Dicter ma recherche">${icon.mic}</button>
      <button type="button" class="x" data-close-search aria-label="Fermer">×</button>
    </form>
    <div class="live" data-live-results></div>
  </div>
</div>
<main id="contenu">${body}</main>
<footer class="foot">
  <div class="foot-in">
    <div class="foot-brand">${MONO}<p class="brand-txt">Magnolia<small>${esc(R.sousNom || '')}</small></p><p class="slogan">${esc(R.slogan || '')}</p>
      <a class="btn btn-ghost-light" href="/ma-selection">Composer mon événement</a></div>
    <div><h2>Nos univers</h2><ul>${rubs.map(r => `<li><a href="${rubHref(r)}">${esc(r.nom)}</a></li>`).join('')}<li><a href="/lieux">Lieux de réception</a></li></ul></div>
    <div><h2>Magnolia</h2><ul><li><a href="/boutique">La boutique</a></li><li><a href="/ma-selection">Ma sélection</a></li><li><a href="/comment-commander">Comment commander</a></li><li><a href="/livraison">Zones de livraison</a></li><li><a href="/temoignages">Témoignages</a></li><li><a href="/maison">La maison Magnolia</a></li><li><a href="/contact">Contact</a></li><li><a href="/espace-client">Mon espace client</a></li></ul></div>
    <div><h2>Nous joindre</h2><ul class="contact"><li><a href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">${esc(R.telephone)}</a></li><li><a href="mailto:${esc(R.email)}">${esc(R.email)}</a></li><li>${esc(R.adresse)}</li><li>${esc(R.horaires)}</li>${R.instagram ? `<li><a href="${esc(R.instagram)}" rel="noopener">Instagram</a></li>` : ''}</ul></div>
  </div>
  <div class="foot-bas"><p>${esc(R.mentionPied || '')}</p><p><a href="/mentions-legales">Mentions légales</a> · <a href="/confidentialite">Confidentialité</a> · <a href="/cgv">CGV</a> · <a href="/allergenes">Allergènes</a><span data-cookies> · <a href="#cookies">Gérer mes cookies</a></span> · © ${new Date().getFullYear()} ${esc(R.nom)}</p></div>
</footer>
<div class="toast" data-toast role="status" aria-live="polite"></div>
<script>window.MG=${JSON.stringify({ tel: R.telephone, tarifs: R.tarifs, origine: R.origine, evenements: R.evenements }).replace(/</g, '\\u003c')};</script>
<script src="/js/site.js?v=${V}" defer></script>
</body>
</html>`;
}

function card(p, c, { rubNom = true } = {}) {
  const r = c.rubriques.find(x => x.slug === p.rubrique);
  const { prix, unite } = prixCourt(p, euros);
  const ph = p.photos?.[0];
  return `<a class="card" href="${prodHref(p)}" data-card data-rub="${esc([p.rubrique, ...(p.autresRubriques || [])].join(' '))}" data-prix="${p.prixCents ?? ''}" data-ordre="${p.ordre ?? 0}">
    <div class="card-img">${img(ph?.src, ph?.alt || p.titre)}${rubNom && r ? `<span class="tag">${esc(r.nom)}</span>` : ''}${p.video ? '<span class="tag tag-video">Vidéo</span>' : ''}</div>
    <div class="card-b"><h3>${esc(p.titre)}</h3><p>${esc(trunc(p.extrait, 110))}</p>
    <div class="card-f"><span class="prix">${esc(prix)} <small>${esc(unite)}</small></span><span class="more">Découvrir ${icon.arrow}</span></div></div>
  </a>`;
}
const trunc = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

function univers(c) {
  return c.rubriques.filter(r => r.statut !== 'masque' && r.slug !== 'lieux').map(r => `<a class="tile" href="${rubHref(r)}">
    ${img(r.photoAccueil || r.photo, '')}<span class="tile-t"><b>${esc(r.nom)}</b>${r.accroche ? `<small>${esc(r.accroche)}</small>` : `<small>${c.byRub.get(r.slug)?.length || 0} prestations</small>`}</span></a>`).join('')
    + `<a class="tile" href="/lieux">${img(c.lieux[0]?.photos?.[0], '')}<span class="tile-t"><b>Lieux de réception</b><small>${c.lieux.filter(l => l.statut !== 'masque').length} lieux à privatiser</small></span></a>`;
}

function avisBloc(c) {
  const R = c.reglages, a = c.avis.filter(x => x.statut === 'vedette').slice(0, 3);
  const g = R.avisGoogle || {};
  return `<section class="avis band-creme"><div class="wrap avis-in">
    <div class="avis-note"><p class="eyebrow">Avis clients</p><p class="note">${esc(g.note || '4,9')}<small>/5</small></p><p class="stars" aria-label="5 étoiles">★★★★★</p>
    <p>${esc(g.nombre || '')} avis clients : mariages, anniversaires et réceptions d’entreprise.</p>
    <p class="row"><a class="btn btn-line" href="${esc(g.url || '#')}" rel="noopener">Lire nos avis Google</a><a class="lnk" href="/temoignages">Tous les témoignages ${icon.arrow}</a></p></div>
    <div class="avis-l">${a.map((x, i) => `<figure class="quote${i === 0 ? ' big' : ''}"><blockquote>« ${esc(trunc(x.texte, i === 0 ? 320 : 180))} »</blockquote><figcaption>${esc(x.auteur)}</figcaption></figure>`).join('')}</div>
  </div>
  <div class="logos"><p class="eyebrow center">Ils nous font confiance</p><div class="marquee" aria-label="Clients"><div class="marquee-t">${[0, 1].map(k => (R.logosClients || []).map(l => logoExiste(l.src) ? `<img src="${esc(l.src)}" alt="${k ? '' : esc(l.nom)}" loading="lazy">` : `<span class="logo-nom"${k ? ' aria-hidden="true"' : ''}>${esc(l.nom)}</span>`).join('')).join('')}</div></div></div></section>`;
}

function etapes(c) {
  return `<section class="wrap etapes-sec"><div class="etapes-txt"><p class="eyebrow">Sans paiement en ligne</p><h2>Comment commander</h2>
    <ol class="etapes"><li><b>Composez</b><span>Choisissez vos formules et vos plats, avec les prix TTC, les unités et les minimums.</span></li>
    <li><b>Précisez</b><span>Date, nombre d’invités, lieu de livraison : quelques champs, sans paiement.</span></li>
    <li><b>Validons ensemble</b><span>L’équipe vérifie les disponibilités et le montant, puis vous envoie votre devis à signer en ligne.</span></li></ol>
    <a class="btn btn-vert" href="/boutique">Composer mon événement</a></div>
    <div class="etapes-img">${img(c.reglages.accueil?.photoCommande, 'Personnel de réception Magnolia au service d’un buffet')}</div></section>`;
}

function home(c) {
  const R = c.reglages, A = R.accueil || {};
  const vids = (A.videos || []).slice(0, 3);
  const inc = (A.incontournables || []).map(s => c.bySlug.get(s)).filter(p => p && p.statut !== 'masque');
  const body = `
<section class="hero" data-hero>
  <div class="hero-v">${vids.map((v, i) => `<a class="hero-p${i === 1 ? ' mid' : ''}" href="${esc(v.lien || '#')}" data-hero-panel="${i}">
      <video muted loop playsinline preload="${i === 1 ? 'auto' : 'metadata'}" poster="${esc(v.poster)}" data-src="${esc(v.src)}" aria-hidden="true"></video>
      <span class="hero-lab">${icon.play}${esc(v.titre || '')}</span></a>`).join('')}</div>
  <div class="hero-shade"></div>
  <div class="hero-c wrap">
    <p class="eyebrow light">${esc(A.surtitre || '')}</p>
    <h1>${esc(A.titre || '')}</h1>
    <p class="lead">${esc(A.sousTitre || '')}</p>
    <form class="pave" action="/boutique" data-pave>
      <label><span>Événement</span><select name="evt">${(R.evenements || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></label>
      <label><span>Date</span><input type="date" name="date" required></label>
      <label><span>Invités</span><select name="invites">${[10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500].map(n => `<option${n === 30 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button class="btn btn-or">Composer ${icon.arrow}</button>
    </form>
    <a class="hero-g" href="${esc(R.avisGoogle?.url || '#')}" rel="noopener"><span class="stars">★★★★★</span> ${esc(R.avisGoogle?.note || '')}/5 sur Google · ${esc(R.avisGoogle?.nombre || '')} avis</a>
  </div>
  <div class="hero-dots" aria-hidden="true">${vids.map((_, i) => `<i data-dot="${i}"></i>`).join('')}</div>
</section>
<div class="marquee band-vert" aria-label="Nos spécialités du monde"><div class="marquee-t">${[0, 1].map(k => (A.bandeau || []).map(t => `<span${k ? ' aria-hidden="true"' : ''}>${esc(t)}<i>✳</i></span>`).join('')).join('')}</div></div>
<section class="chiffres wrap">${(A.chiffres || []).map(x => `<div><b>${esc(x.valeur)}</b><span>${esc(x.label)}</span></div>`).join('')}</section>
<section class="recherche wrap">
  <h2 class="center">Que recherchez-vous ?</h2><p class="eyebrow center sous-titre">Entrez ou dictez votre envie</p>
  <form class="bigsearch inline" action="/boutique" role="search" data-live-search>${icon.search}<input type="search" name="q" placeholder="Paëlla, DJ, huîtres, personnel…" aria-label="Que recherchez-vous ?" autocomplete="off"><button type="button" class="mic" data-dictee aria-label="Dicter ma recherche">${icon.mic}<span>Dicter</span></button></form>
  <div class="live" data-live-results></div>
  <div class="chips center">${(A.suggestions || []).map(s => `<a class="chip" href="/boutique?q=${encodeURIComponent(s)}">${esc(s)}</a>`).join('')}</div>
</section>
<section class="wrap"><div class="sec-h"><div><p class="eyebrow">Tout pour le plaisir de recevoir</p><h2>Nos univers</h2></div><p>Cocktails, buffets du monde, animations, personnel et lieux : toute la brochure, avec ses prix.</p></div>
  <div class="tiles">${univers(c)}</div></section>
${inc.length ? `<section class="wrap"><div class="sec-h"><div><p class="eyebrow">À partager, à savourer, à célébrer</p><h2>Les incontournables</h2></div><a class="lnk" href="/boutique">Voir toute la boutique ${icon.arrow}</a></div>
  <div class="cards scroller">${inc.map(p => card(p, c)).join('')}</div></section>` : ''}
${etapes(c)}
<section class="maison band-vert"><div class="wrap maison-in"><div><p class="eyebrow light">La maison Magnolia</p><h2>Le plaisir de recevoir, le goût de partager</h2>
  <p>Anniversaire, mariage, fête de famille ou réception professionnelle : cocktails, buffets, spécialités du monde, animations, personnel, matériel, artistes et lieux, réunis dans une seule demande.</p>
  <a class="btn btn-ghost-light" href="/maison">Découvrir la maison</a></div>${img(A.photoMaison, 'L’équipe Magnolia devant un buffet')}</div></section>
${avisBloc(c)}
<section class="cta wrap"><h2>Votre événement commence ici</h2><div class="row"><a class="btn btn-vert" href="/boutique">Composer mon événement</a><a class="lnk" href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">ou appelez le ${esc(R.telephone)}</a></div></section>`;
  const schema = { '@context': 'https://schema.org', '@type': 'Caterer', '@id': '#magnolia', name: R.nom, telephone: R.telephone, email: R.email, address: { '@type': 'PostalAddress', streetAddress: '15 rue de Norvège', postalCode: '91140', addressLocality: 'Villebon-sur-Yvette', addressCountry: 'FR' }, areaServed: 'Île-de-France', aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9', reviewCount: 800 } };
  return layout(c, { body, schema, bodyClass: 'home', description: A.sousTitre, image: vids[0]?.poster });
}

/* Grand bandeau photo en haut des pages d'arrivée (publicité Google Ads) : photo ou vidéo, titre, texte, boutons, ligne de confiance.
   Tout se change dans le back-office › Photos & textes du site › Bandeaux des pages. */
const BANDEAUX_DEFAUT = {
  boutique: { photo: '/site/c/cocktail10-client-20261104.jpg.webp', video: '', titre: 'La boutique Magnolia', chapo: 'Buffets, cocktails, spécialités du monde, boissons, personnel et animations : plus de 350 prestations, prix TTC, livrées 7 jours sur 7 en Île-de-France.', bouton: 'Voir les prestations', ancre: '#prestations' },
  lieux: { photo: '/site/v/lieux-ambiances.jpg', video: '', titre: 'Lieux de réception', chapo: 'Lofts, péniches, demeures et salons à privatiser à Paris et en Île-de-France. Associez votre lieu et votre traiteur dans une seule demande.', bouton: 'Voir les lieux', ancre: '#lieux' },
  temoignages: { photo: '/site/v/temoignages-table.jpg', video: '/site/v/temoignages-table.mp4', titre: 'Avis clients', chapo: 'Mariages, anniversaires, séminaires, fêtes de famille : ils nous ont confié leur événement et le racontent.', bouton: 'Lire les avis', ancre: '#avis' },
  maison: { photo: '', video: '', titre: 'La maison Magnolia', chapo: 'Votre événement commence ici.', bouton: 'Découvrir nos propositions', ancre: '/boutique' },
};
function bandeauDe(c, cle) {
  const R = c.reglages, d = BANDEAUX_DEFAUT[cle] || {}, b = R.bandeaux?.[cle] || {};
  const o = { ...d };
  for (const k of Object.keys(b)) if (b[k] || (k === 'video' && b[k] === '')) o[k] = b[k];
  if (cle === 'maison' && !o.photo) o.photo = R.accueil?.photoMaison || '';
  return o;
}
function bandeau(c, cle, { fil, titre } = {}) {
  const R = c.reglages, B = bandeauDe(c, cle);
  const tel = (R.telephone || '').replace(/\s/g, '');
  const G = R.avisGoogle || {};
  const media = B.video
    ? `<video src="${esc(B.video)}" poster="${esc(B.photo || '')}" autoplay muted loop playsinline preload="metadata" aria-hidden="true" data-autoplay></video>`
    : img(B.photo, '', '', 'fetchpriority="high"').replace(' loading="lazy"', '');
  return `<section class="phero land">${media}<div class="phero-c wrap">${crumbs(fil || [[titre || B.titre]])}<h1>${esc(titre || B.titre)}</h1>${B.chapo ? `<p class="lead">${esc(B.chapo)}</p>` : ''}
  <div class="row land-cta"><a class="btn btn-or" href="${esc(B.ancre || '/boutique')}">${esc(B.bouton || 'Découvrir')}</a><a class="btn btn-ghost-light" href="tel:${esc(tel)}">${icon.phone}<span>${esc(R.telephone || '')}</span></a></div>
  <p class="confiance"><span><span class="etoiles" aria-hidden="true">★★★★★</span> <b>${esc(G.note || '4,9')}/5</b> sur Google${G.nombre ? `, ${esc(G.nombre)} avis` : ''}</span><span>Livraison 7 j/7 en Île-de-France</span><span>Devis gratuit</span></p></div></section>`;
}

function crumbs(list) {
  return `<nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a>${list.map(([t, h]) => h ? ` / <a href="${h}">${esc(t)}</a>` : ` / <span>${esc(t)}</span>`).join('')}</nav>`;
}

function boutique(c, { q = '', rub = '', titre, chapo, photo, path = '/boutique', liste = null }) {
  const rubs = c.rubriques.filter(r => r.statut !== 'masque' && r.slug !== 'lieux');
  const prods = liste || (q ? c.search(c, q, 400) : c.produits.filter(p => p.statut !== 'masque'));
  const r = rubs.find(x => x.slug === rub);
  const body = `
${path === '/boutique' && !q ? bandeau(c, 'boutique') : photo ? `<section class="phero">${img(photo, '')}<div class="phero-c wrap">${crumbs(r ? [['La boutique', '/boutique'], [r.nom]] : [[titre]])}<h1>${esc(titre)}</h1>${chapo ? `<p class="lead">${esc(chapo)}</p>` : ''}</div></section>`
    : `<section class="wrap page-h">${crumbs([[titre]])}<h1>${esc(titre)}</h1><p class="lead">${esc(chapo || 'Toute la brochure, avec ses prix. Ajoutez vos choix à votre sélection, puis demandez votre devis.')}</p></section>`}
<section class="wrap shop" id="prestations" data-shop>
  <div class="shop-bar">
    <div class="chips scroll-x" role="tablist">${liste ? '' : `<a class="chip${!rub ? ' on' : ''}" href="/boutique" data-filter="">Tout <small>${c.produits.filter(p => p.statut !== 'masque').length}</small></a>`}${liste ? '' : rubs.map(x => `<a class="chip${x.slug === rub ? ' on' : ''}" href="/${x.slug}" data-filter="${x.slug}">${esc(x.nom)} <small>${c.byRub.get(x.slug)?.length || 0}</small></a>`).join('')}</div>
    <div class="shop-tools">
      <form class="shop-q" action="/boutique" role="search">${icon.search}<input type="search" name="q" value="${esc(q)}" placeholder="Paëlla, DJ, huîtres…" aria-label="Rechercher dans la boutique" data-shop-q></form>
      <label class="tri"><span class="sr">Trier</span><select data-sort><option value="ordre">Ordre de la brochure</option><option value="asc">Prix croissant</option><option value="desc">Prix décroissant</option></select></label>
    </div>
  </div>
  <p class="count"><span data-count>${prods.length}</span> prestations · tarifs TTC${q ? ` pour « ${esc(q)} »` : ''}</p>
  <div class="cards grid" data-grid>${prods.map(p => card(p, c, { rubNom: !rub })).join('')}</div>
  ${!prods.length ? `<div class="empty"><p>Aucune prestation ne correspond à « ${esc(q)} ».</p><p>Appelez-nous au <a href="tel:${esc(c.reglages.telephone)}">${esc(c.reglages.telephone)}</a> : nous trouvons toujours une solution.</p></div>` : ''}
</section>`;
  return layout(c, { title: titre, description: chapo || (path === '/boutique' && !q ? bandeauDe(c, 'boutique').chapo : ''), body, path, image: path === '/boutique' && !q ? bandeauDe(c, 'boutique').photo : photo });
}

function produit(c, p) {
  const r = c.rubriques.find(x => x.slug === p.rubrique) || { nom: '', slug: p.rubrique };
  const R = c.reglages, T = R.tarifs || {};
  const photos = p.photos || [];
  const proches = (c.byRub.get(p.rubrique) || []).filter(x => x.slug !== p.slug).slice(0, 8);
  const prixTxt = p.prixCents == null ? 'Sur devis' : euros(p.prixCents);
  const media = `
  <div class="gal" data-gal>
    <div class="gal-main">${p.video ? `<video src="${esc(p.video.src)}" poster="${esc(p.video.poster || '')}" muted loop playsinline autoplay preload="metadata" data-gal-item></video>` : ''}
      ${photos.map((ph, i) => `<img src="${esc(ph.src)}" alt="${esc(ph.alt || p.titre)}" ${i || p.video ? 'loading="lazy" hidden' : ''} data-gal-item>`).join('')}
      ${!photos.length && !p.video ? img('', '') : ''}
      ${photos.length + (p.video ? 1 : 0) > 1 ? '<button class="gal-nav prev" type="button" data-gal-prev aria-label="Photo précédente">‹</button><button class="gal-nav next" type="button" data-gal-next aria-label="Photo suivante">›</button>' : ''}</div>
    ${photos.length + (p.video ? 1 : 0) > 1 ? `<div class="gal-th">${p.video ? `<button type="button" data-gal-go="0" class="on vid">${icon.play}</button>` : ''}${photos.map((ph, i) => `<button type="button" data-gal-go="${i + (p.video ? 1 : 0)}"${!i && !p.video ? ' class="on"' : ''}><img src="${esc(ph.src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
  </div>`;
  const sections = (p.sections || []).map(s => `<section class="compo"><h2>${esc(s.titre || '')}</h2>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}${(s.items || []).length ? `<ul class="items">${s.items.map(it => `<li>${esc(it)}</li>`).join('')}</ul>` : ''}${(s.paragraphes || []).map(t => `<p>${esc(t)}</p>`).join('')}${s.apres ? `<p class="note">${esc(s.apres)}</p>` : ''}</section>`).join('');
  const conf = { slug: p.slug, titre: p.titre, prixCents: p.prixCents, unite: p.unite, min: p.min || 1, groupes: p.groupes || [], variantes: p.variantes || [], regles: p.regles || {}, photo: photos[0]?.src || p.video?.poster || '', rubrique: r.nom };
  const body = `
<section class="wrap fiche">
  ${crumbs([['La boutique', '/boutique'], [r.nom, '/' + r.slug], [p.titre]])}
  <div class="fiche-g">
    <div class="fiche-media">${media}</div>
    <div class="fiche-info">
      <p class="eyebrow"><a href="/${esc(r.slug)}">${esc(r.nom)}</a></p>
      <h1>${esc(p.titre)}</h1>
      <p class="fiche-prix"><b>${esc(prixTxt)}</b>${p.prixCents != null ? ` <span>TTC${p.unite ? ' par ' + esc(p.unite) : ''}</span>` : ''}${p.min > 1 ? `<span class="min">· dès ${p.min} ${esc(p.unite || '')}${p.min > 1 && p.unite && !/s$/.test(p.unite) ? 's' : ''}</span>` : ''}</p>
      ${(p.description || [p.extrait]).filter(Boolean).map(t => `<p class="desc">${esc(t)}</p>`).join('')}
      <form class="conf" data-conf='${esc(JSON.stringify(conf))}' novalidate>
        <div data-conf-body></div>
        <div class="conf-tot"><span>Total estimé</span><b data-conf-total>${esc(prixTxt)}</b></div>
        <p class="small">TTC, hors livraison (${esc(euros(T.kmCents || 100))} TTC du km aller-retour depuis ${esc(R.origine?.nom || 'Villebon-sur-Yvette')}).</p>
        <div class="conf-act"><button class="btn btn-line" type="submit" name="go" value="add">Ajouter à ma sélection</button><button class="btn btn-vert" type="submit" name="go" value="devis">Ajouter et demander mon devis</button></div>
      </form>
      ${(p.details || []).length ? `<ul class="details">${p.details.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
      <p class="aide">${icon.phone} Une question ? <a href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">${esc(R.telephone)}</a></p>
    </div>
  </div>
  ${sections ? `<div class="compos">${sections}</div>` : ''}
</section>
${proches.length ? `<section class="wrap"><div class="sec-h"><h2>Dans la même rubrique</h2><a class="lnk" href="/${esc(r.slug)}">${esc(r.nom)} ${icon.arrow}</a></div><div class="cards scroller">${proches.map(x => card(x, c, { rubNom: false })).join('')}</div></section>` : ''}
<div class="stickybar" data-sticky><span><b>${esc(prixTxt)}</b>${p.unite && p.prixCents != null ? ' / ' + esc(p.unite) : ''}</span><button class="btn btn-vert" type="button" data-scroll-conf>Choisir</button></div>`;
  const site = (process.env.SITE_URL || 'https://www.magnoliatraiteur.fr').replace(/\/$/, '');
  const schema = { '@context': 'https://schema.org', '@type': 'Product', name: p.titre, description: p.extrait, category: r.nom, image: photos.map(x => site + x.src), brand: { '@type': 'Brand', name: R.nom }, ...(p.prixCents != null ? { offers: { '@type': 'Offer', price: (p.prixCents / 100).toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', eligibleQuantity: { '@type': 'QuantitativeValue', minValue: p.min || 1 } } } : {}) };
  return layout(c, { title: p.titre, description: p.extrait, body, path: prodHref(p), schema, image: photos[0]?.src, bodyClass: 'p-fiche' });
}

function lieux(c) {
  const L = c.lieux.filter(l => l.statut !== 'masque');
  const body = `${bandeau(c, 'lieux')}
  <section class="wrap" id="lieux"><div class="cards grid">${L.map(l => `<a class="card" href="/lieux/${esc(l.slug)}"><div class="card-img">${img(l.photos?.[0], l.nom)}${l.capacite ? `<span class="tag">Jusqu’à ${l.capacite} pers.</span>` : ''}</div><div class="card-b"><h3>${esc(l.nom)}</h3><p>${esc(l.ville || '')}</p><p>${esc(trunc(l.description, 110))}</p><div class="card-f"><span class="prix">${esc(l.prixTexte || 'Sur devis')}</span><span class="more">Découvrir ${icon.arrow}</span></div></div></a>`).join('')}</div></section>`;
  const B = bandeauDe(c, 'lieux');
  return layout(c, { title: B.titre, description: B.chapo, body, path: '/lieux', image: B.photo });
}

function lieu(c, l) {
  const conf = { slug: 'lieu-' + l.slug, titre: l.nom, prixCents: null, unite: 'location', min: 1, groupes: [], variantes: [], regles: {}, photo: l.photos?.[0] || '', rubrique: 'Lieux de réception', lieu: true };
  const body = `<section class="wrap fiche">${crumbs([['Lieux de réception', '/lieux'], [l.nom]])}
  <div class="fiche-g"><div class="fiche-media"><div class="gal" data-gal><div class="gal-main">${(l.photos || []).map((s, i) => `<img src="${esc(s)}" alt="${esc(l.nom)}" ${i ? 'loading="lazy" hidden' : ''} data-gal-item>`).join('')}${(l.photos || []).length > 1 ? '<button class="gal-nav prev" type="button" data-gal-prev aria-label="Photo précédente">‹</button><button class="gal-nav next" type="button" data-gal-next aria-label="Photo suivante">›</button>' : ''}</div>
  ${(l.photos || []).length > 1 ? `<div class="gal-th">${l.photos.map((s, i) => `<button type="button" data-gal-go="${i}"${!i ? ' class="on"' : ''}><img src="${esc(s)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}</div></div>
  <div class="fiche-info"><p class="eyebrow"><a href="/lieux">Lieux de réception</a></p><h1>${esc(l.nom)}</h1>
  <p class="fiche-prix"><b>${esc(l.prixTexte || 'Sur devis')}</b>${l.capacite ? `<span class="min">· jusqu’à ${l.capacite} personnes</span>` : ''}</p>
  <p class="desc">${esc(l.description)}</p><p class="small">${esc(l.ville || '')}</p>
  <form class="conf" data-conf='${esc(JSON.stringify(conf))}' novalidate><div data-conf-body></div><div class="conf-act"><button class="btn btn-vert" type="submit" name="go" value="devis">Ajouter ce lieu à ma demande</button></div></form>
  ${(l.equipements || []).length ? `<h2 class="h3">Sur place</h2><ul class="tags">${l.equipements.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
  </div></div>
  ${(l.avis || []).length ? `<div class="compos">${l.avis.slice(0, 4).map(a => `<figure class="quote"><blockquote>« ${esc(trunc(a.texte, 300))} »</blockquote><figcaption>${esc(a.auteur)}</figcaption></figure>`).join('')}</div>` : ''}</section>`;
  return layout(c, { title: l.nom, description: l.description, body, path: '/lieux/' + l.slug, image: l.photos?.[0] });
}

function selection(c) {
  const R = c.reglages;
  const body = `<section class="wrap page-h">${crumbs([['Ma sélection']])}<h1>Ma sélection</h1><p class="lead">Ajustez les quantités, puis envoyez votre demande : l’équipe valide avec vous avant toute commande. Aucun paiement sur le site.</p></section>
<section class="wrap sel" data-selection>
  <div class="sel-l" data-sel-list></div>
  <aside class="sel-r">
    <form class="card-form" data-demande novalidate>
      <h2>Votre événement</h2>
      <div class="f2"><label>Type d’événement<select name="evenement" required>${(R.evenements || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></label>
      <label>Date<input type="date" name="date" required></label></div>
      <div class="f2"><label>Nombre d’invités<select name="invites" required><option value="">Choisir…</option>${[10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100, 120, 150, 200, 250, 300, 400, 500, 750, 1000].map(n => `<option>${n}</option>`).join('')}</select></label>
      <label>Horaire de livraison<select name="horaire">${['Matin (8 h – 12 h)', 'Midi (11 h – 13 h)', 'Après-midi (13 h – 17 h)', 'Soir (17 h – 20 h)', 'À préciser avec l’équipe'].map(h => `<option>${h}</option>`).join('')}</select></label></div>
      <div class="f2"><label>Code postal du lieu<input name="cp" inputmode="numeric" maxlength="5" pattern="\\d{5}" required data-cp></label>
      <label>Ville<select name="ville" required data-ville><option value="">D’abord le code postal</option></select></label></div>
      <p class="livr" data-livr>Frais de livraison : ${esc(euros(R.tarifs?.kmCents || 100))} TTC du km aller-retour depuis ${esc(R.origine?.nom || '')}.</p>
      <h2>Vos coordonnées</h2>
      <div class="f2"><label>Prénom et nom<input name="nom" autocomplete="name" required></label><label>Société <small>(facultatif)</small><input name="societe" autocomplete="organization"></label></div>
      <div class="f2"><label>E-mail<input type="email" name="email" autocomplete="email" required></label><label>Téléphone<input type="tel" name="tel" autocomplete="tel" required></label></div>
      <label>Votre message <small>(allergies, déroulé, accès…)</small><textarea name="message" rows="3"></textarea></label>
      <label class="check"><input type="checkbox" name="rgpd" required> J’accepte que Magnolia Traiteur utilise ces informations pour répondre à ma demande (<a href="/confidentialite">confidentialité</a>).</label>
      <div class="sel-tot"><div><span>Sélection</span><b data-sel-sub>0 €</b></div><div><span>Livraison estimée</span><b data-sel-livr>—</b></div><div class="tot"><span>Total estimé TTC</span><b data-sel-total>0 €</b></div></div>
      <button class="btn btn-vert wide" data-send>Envoyer ma demande de devis</button>
      <p class="small center">Votre envoi est une demande à étudier, pas une commande. Réponse rapide, du lundi au samedi.</p>
    </form>
  </aside>
</section>
<section class="wrap done" data-done hidden></section>`;
  return layout(c, { title: 'Ma sélection', body, path: '/ma-selection', bodyClass: 'p-sel' });
}

function texte(c, { titre, chapo = '', html, path, photo = '', land = '', image = '' }) {
  const body = `${land ? bandeau(c, land) : photo ? `<section class="phero">${img(photo, '')}<div class="phero-c wrap">${crumbs([[titre]])}<h1>${esc(titre)}</h1>${chapo ? `<p class="lead">${esc(chapo)}</p>` : ''}</div></section>` : `<section class="wrap page-h">${crumbs([[titre]])}<h1>${esc(titre)}</h1>${chapo ? `<p class="lead">${esc(chapo)}</p>` : ''}</section>`}
  <section class="wrap prose">${html}</section>`;
  return layout(c, { title: titre, description: chapo, body, path, image: image || photo });
}

/* texte brut (pages reprises du brouillon) → paragraphes ; les lignes courtes deviennent des intertitres */
function textToHtml(t) {
  return String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => (l.length < 60 && !/[.:;,]$/.test(l) ? `<h2>${esc(l)}</h2>` : `<p>${esc(l)}</p>`)).join('\n');
}

function maison(c) {
  const R = c.reglages;
  const html = `<div class="cols2"><div><h2>Une seule maison, une seule demande</h2><p>Anniversaire, mariage, fête de famille ou réception professionnelle : Magnolia Traiteur vous propose des idées et des prestations pour construire votre événement à Paris et en Île-de-France.</p><p>Cocktails, buffets, spécialités du monde, repas à composer, animations culinaires, boissons et douceurs ; mais aussi le personnel, le matériel, les artistes et les lieux de la brochure.</p><p>Tout est préparé dans notre laboratoire de Villebon-sur-Yvette et livré 7 jours sur 7.</p><p class="row"><a class="btn btn-vert" href="/boutique">Découvrir nos propositions</a></p></div>${img(R.accueil?.photoCommande, 'Personnel de réception Magnolia')}</div>
  <h2>Vos interlocuteurs</h2><div class="equipe">${(R.equipe || []).map(e => `<figure class="membre">${e.photo ? img(e.photo, e.nom) : `<div class="avatar">${esc((e.nom || '?')[0])}</div>`}<figcaption><b>${esc(e.nom)}</b><span>${esc(e.role)}</span>${e.citation ? `<blockquote>${esc(e.citation)}<cite>${esc(e.auteur || '')}</cite></blockquote>` : ''}</figcaption></figure>`).join('')}</div>`;
  const B = bandeauDe(c, 'maison');
  return texte(c, { titre: B.titre, chapo: B.chapo, html: html + '</section>' + etapes(c) + avisBloc(c) + '<section>', path: '/maison', land: 'maison', image: B.photo });
}

function livraison(c) {
  const R = c.reglages;
  const html = `<p class="lead">Livraison 7 jours sur 7 dans toute l’Île-de-France, depuis notre laboratoire de ${esc(R.origine?.nom || '')}.</p>
  <ul class="deps">${[['75', 'Paris'], ['77', 'Seine-et-Marne'], ['78', 'Yvelines'], ['91', 'Essonne'], ['92', 'Hauts-de-Seine'], ['93', 'Seine-Saint-Denis'], ['94', 'Val-de-Marne'], ['95', 'Val-d’Oise']].map(([n, t]) => `<li><b>${n}</b>${t}</li>`).join('')}</ul>
  <div class="calc" data-calc><h2>Estimez vos frais</h2><p>${esc(euros(R.tarifs?.kmCents || 100))} TTC du kilomètre, aller-retour, depuis ${esc(R.adresse || '')}.</p>
  <div class="f2"><label>Code postal du lieu<input inputmode="numeric" maxlength="5" data-cp></label><label>Ville<select data-ville><option value="">D’abord le code postal</option></select></label></div><p class="livr big" data-livr></p></div>
  <h2>Questions fréquentes</h2>
  <details><summary>Comment les frais sont-ils calculés ?</summary><p>Par l’itinéraire aller-retour entre notre laboratoire et la commune du lieu, à ${esc(euros(R.tarifs?.kmCents || 100))} TTC du kilomètre. L’estimation en ligne est confirmée dans votre devis.</p></details>
  <details><summary>Livrez-vous le week-end ?</summary><p>Oui, 7 jours sur 7. Indiquez l’horaire souhaité dans votre demande.</p></details>
  <details><summary>Et hors Île-de-France ?</summary><p>C’est possible selon votre événement : appelez-nous au ${esc(R.telephone)}.</p></details>
  <details><summary>La reprise du matériel est-elle comprise ?</summary><p>Elle dépend des prestations (matériel, animations, packs) : le devis précise la livraison et la récupération pour chacune.</p></details>
  <p class="row"><a class="btn btn-vert" href="/boutique">Composer ma sélection</a></p>`;
  return texte(c, { titre: 'Zones de livraison', chapo: 'Nous livrons partout en Île-de-France.', html, path: '/livraison' });
}

function commander(c) {
  const html = `<ol class="etapes big"><li><b>Faites vos choix</b><span>Consultez la composition de chaque prestation, les prix TTC, les unités et les minimums, puis ajoutez-les à <a href="/ma-selection">votre sélection</a>. Pour les menus à choix, sélectionnez vos plats directement sur la fiche.</span></li>
  <li><b>Précisez votre événement</b><span>Ajustez les quantités, ajoutez le personnel ou les packs traiteur, une note pour chaque prestation, puis la date, le nombre d’invités, la ville et l’horaire de livraison.</span></li>
  <li><b>Relisez, puis validons votre devis</b><span>Vous recevez une référence et un accès à votre espace client. L’équipe vérifie les disponibilités et vous envoie votre devis, que vous signez en ligne. Un acompte valide la réservation, par un lien de paiement sécurisé.</span></li></ol>
  <h2>Questions fréquentes</h2>
  <details><summary>Est-ce une commande ?</summary><p>Non : votre envoi est une demande à étudier. L’équipe vérifie les disponibilités, les détails et le montant avant validation.</p></details>
  <details><summary>Quand payer ?</summary><p>Après validation du devis : un acompte réserve la date, le solde est réglé avant l’événement. Aucun paiement n’est demandé sur le site.</p></details>
  <details><summary>Puis-je modifier ma sélection ?</summary><p>Oui, à tout moment avant l’envoi ; ensuite l’équipe ajuste le devis avec vous.</p></details>
  <details><summary>Et les allergies ?</summary><p>Indiquez-les dans la note de chaque prestation ou dans votre message ; l’équipe vous répond plat par plat. Voir aussi <a href="/allergenes">l’information allergènes</a>.</p></details>
  <p class="row"><a class="btn btn-vert" href="/boutique">Commencer ma sélection</a></p>`;
  return texte(c, { titre: 'Comment commander', chapo: 'Composez votre réception, nous affinons ensemble.', html, path: '/comment-commander' });
}

function temoignages(c) {
  const R = c.reglages;
  const avis = c.avis;
  const logos = (R.logosClients || []).filter(l => logoExiste(l.src));
  const ids = new Set(avis.map(a => a.id));
  const bande = logos.length ? `<section class="bande-clients" aria-label="Ils nous ont fait confiance"><div class="marquee"><div class="marquee-t">${[0, 1].map(k => logos.map(l => {
    const im = `<img src="${esc(l.src)}" alt="${k ? '' : esc(l.nom)}" title="${esc(l.nom)}" loading="lazy" decoding="async">`;
    return l.avisId && ids.has(l.avisId) ? `<a href="#avis-${esc(l.avisId)}" data-avis-lien="${esc(l.avisId)}"${k ? ' tabindex="-1" aria-hidden="true"' : ''}>${im}</a>` : `<span${k ? ' aria-hidden="true"' : ''}>${im}</span>`;
  }).join('')).join('')}</div></div></section>` : '';
  const PAR = 24;
  const carte = (a, i) => `<figure class="quote" id="avis-${esc(a.id)}"${i >= PAR ? ' hidden' : ''} data-avis-item><p class="stars" aria-label="${a.note || 5} sur 5">${'★'.repeat(a.note || 5)}</p>${a.titre ? `<h3>${esc(a.titre)}</h3>` : ''}<blockquote>« ${esc(a.texte)} »</blockquote>${a.photo ? `<img class="quote-ph" src="${esc(a.photo)}" alt="" loading="lazy" decoding="async">` : ''}<figcaption>${[String(a.auteur || '').replace(/([a-zà-ÿ])([A-ZÀ-Ý][a-zà-ÿ])/g, '$1 · $2'), a.lieu, a.evenement, a.date].filter(Boolean).map(esc).join(' · ')}</figcaption></figure>`;
  const html = `<div class="masonry" data-avis-liste>${avis.map(carte).join('')}</div>${avis.length > PAR ? `<p class="center"><button class="btn btn-line" type="button" data-avis-plus="${PAR}">Voir plus d’avis <small>(${avis.length - PAR})</small></button></p>` : ''}`;
  const form = `<section class="avis-form" id="laisser-un-avis"><h2>Vous avez fêté un moment avec nous ?</h2><p>Racontez-le en quelques mots : votre avis sera publié après relecture par l’équipe.</p>
  <form class="card-form" data-avis novalidate><div class="f2"><label>Prénom et ville<input name="auteur" required maxlength="80" placeholder="Claire, Massy"></label><label>Votre événement<select name="evenement">${(c.reglages.evenements || []).map(e => `<option>${esc(e)}</option>`).join('')}</select></label></div>
  <div class="f2"><label>Votre note<select name="note"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Très bien</option><option value="3">★★★ Bien</option><option value="2">★★ Moyen</option><option value="1">★ Décevant</option></select></label><label>E-mail (jamais publié)<input type="email" name="email" required autocomplete="email"></label></div>
  <label>Votre avis<textarea name="texte" rows="4" required minlength="20" maxlength="1500"></textarea></label><input name="site" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true"><button class="btn btn-vert">Envoyer mon avis</button></form></section>`;
  const B = bandeauDe(c, 'temoignages');
  const body = `${bandeau(c, 'temoignages')}${bande}<section class="wrap avis-page" id="avis"><p class="avis-compte"><b>${avis.length}</b> avis publiés · <a href="${esc(R.avisGoogle?.url || '#')}" target="_blank" rel="noopener">voir aussi nos avis Google</a></p>${html}${form}</section>`;
  return layout(c, { title: B.titre, description: B.chapo, body, path: '/temoignages', image: B.photo });
}

function contact(c) {
  const R = c.reglages;
  const html = `<div class="cols2"><div><h2>Parlons de votre événement</h2><p><a class="big-tel" href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">${esc(R.telephone)}</a></p><p><a href="mailto:${esc(R.email)}">${esc(R.email)}</a></p><p>${esc(R.adresse)}</p><p class="small">${esc(R.horaires)}</p></div>
  <form class="card-form" data-contact novalidate><label>Prénom et nom<input name="nom" required autocomplete="name"></label><div class="f2"><label>E-mail<input type="email" name="email" required autocomplete="email"></label><label>Téléphone<input type="tel" name="tel" autocomplete="tel"></label></div>
  <label>Sujet<select name="sujet"><option>Demande d’information</option><option>Devis sur mesure</option><option>Un devis en cours</option><option>Partenariat / lieu</option><option>Autre</option></select></label>
  <label>Message<textarea name="message" rows="5" required></textarea></label><button class="btn btn-vert">Envoyer</button></form></div>`;
  return texte(c, { titre: 'Contact', chapo: 'Une question, un devis sur mesure ? Nous vous répondons vite.', html, path: '/contact' });
}

function legal(c, url, fallbackTitre) {
  const pg = c.pages[url] || {};
  return texte(c, { titre: pg.titre || fallbackTitre, html: textToHtml(pg.texte) || '<p>Page en cours de rédaction.</p>', path: url });
}

function erreur(c, code = 404) {
  const body = `<section class="wrap page-h">${crumbs([['Page introuvable']])}<h1>Cette page n’existe pas</h1><p class="lead">Le lien est peut-être ancien : tout le catalogue est dans la boutique.</p><p class="row"><a class="btn btn-vert" href="/boutique">Voir la boutique</a><a class="lnk" href="/contact">Nous écrire</a></p></section>`;
  return layout(c, { title: code === 404 ? 'Page introuvable' : 'Erreur', body });
}

/* ---------- espace client, devis et factures (pages privées, non indexées) ---------- */
function espaceConnexion(c, msg = '') {
  const body = `<section class="wrap narrow page-h"><h1>Mon espace Magnolia</h1><p class="lead">Votre menu, vos devis et vos factures au même endroit. Recevez un lien de connexion par e-mail : pas de mot de passe à retenir.</p>
  ${msg ? `<p class="alert">${esc(msg)}</p>` : ''}
  <form class="card-form" data-lien novalidate><label>Votre adresse e-mail<input type="email" name="email" required autocomplete="email"></label><button class="btn btn-vert wide">Recevoir mon lien de connexion</button><p class="small" data-lien-msg></p></form>
  <p class="small">Pas encore de demande ? <a href="/boutique">Composez votre sélection</a> : votre espace s’ouvre avec votre première demande.</p></section>`;
  return layout(c, { title: 'Mon espace', body, path: '/espace-client' });
}

const STATUTS = { demande: 'Demande reçue', devis_envoye: 'Devis envoyé', relance: 'Devis envoyé', accord: 'Devis accepté', reserve: 'Réservé', refuse: 'Clôturé', termine: 'Événement passé' };
function espace(c, { client, demandes, devis, factures }) {
  const body = `<section class="wrap page-h"><h1>Bonjour ${esc((client.nom || '').split(' ')[0])}</h1><p class="lead">Retrouvez ici vos demandes, vos devis et vos factures.</p><form method="post" action="/espace-client/deconnexion"><button class="lnk">Me déconnecter</button></form></section>
  <section class="wrap espace">
  ${demandes.length ? demandes.map(d => {
    const dv = devis.filter(x => x.demandeId === d.id);
    return `<article class="ev"><header><div><p class="eyebrow">${esc(d.evenement?.type || '')} · ${esc(dateFr(d.evenement?.date))}</p><h2>${esc(d.evenement?.invites || '')} invités · ${esc(d.evenement?.ville || '')}</h2></div><span class="pill p-${esc(d.statut)}">${esc(STATUTS[d.statut] || d.statut)}</span></header>
    <p class="small">Référence ${esc(d.ref)} · envoyée le ${esc(dateFr(d.createdAt))}</p>
    <ul class="lignes">${(d.lignes || []).map(l => `<li><span>${esc(l.titre)}${l.resume ? `<small>${esc(l.resume)}</small>` : ''}</span><b>${esc(l.qte)} ${esc(l.unite || '')}</b></li>`).join('')}</ul>
    ${dv.map(x => `<p class="row"><a class="btn btn-vert" href="/devis/${esc(x.token)}">Voir le devis ${esc(x.numero)}</a> <span class="pill p-${esc(x.statut)}">${esc({ envoye: 'À signer', accepte: 'Signé', refuse: 'Refusé', brouillon: 'En préparation' }[x.statut] || '')}</span></p>`).join('')}
    ${factures.filter(f => dv.some(x => x.id === f.devisId)).map(f => `<p><a class="lnk" href="/facture/${esc(f.token)}">Facture ${esc(f.numero)} · ${esc(euros(f.totalCents))}</a></p>`).join('')}
    </article>`;
  }).join('') : '<p>Aucune demande pour le moment.</p>'}
  </section>`;
  return layout(c, { title: 'Mon espace', body, path: '/espace-client' });
}

function devisLignesHtml(d) {
  return `<table class="tab"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU TTC</th><th class="n">Total TTC</th></tr></thead><tbody>
  ${(d.lignes || []).map(l => l.type === 'titre' ? `<tr class="t"><td colspan="4">${esc(l.designation)}</td></tr>` : `<tr><td>${esc(l.designation)}${l.detail ? `<small>${esc(l.detail)}</small>` : ''}</td><td class="n">${esc(l.qte)} ${esc(l.unite || '')}</td><td class="n">${esc(euros(l.puCents))}</td><td class="n">${esc(euros(Math.round(l.puCents * l.qte)))}</td></tr>`).join('')}
  </tbody></table>`;
}
function totauxHtml(t) {
  return `<dl class="totaux">${t.remiseCents ? `<div><dt>Sous-total</dt><dd>${euros(t.brutCents)}</dd></div><div><dt>Remise</dt><dd>− ${euros(t.remiseCents)}</dd></div>` : ''}
  ${Object.entries(t.tva).filter(([, v]) => v).map(([taux, v]) => `<div class="sm"><dt>dont TVA ${String(taux).replace(".", ",")} %</dt><dd>${euros(v)}</dd></div>`).join('')}
  <div class="sm"><dt>Total HT</dt><dd>${euros(t.htCents)}</dd></div><div class="tot"><dt>Total TTC</dt><dd>${euros(t.ttcCents)}</dd></div></dl>`;
}

function devisPage(c, d, t, { client, demande }) {
  const R = c.reglages;
  const signe = d.statut === 'accepte';
  const expire = d.validiteJusquau && d.validiteJusquau < new Date().toISOString().slice(0, 10) && !signe;
  const acompte = Math.round(t.ttcCents * (d.acomptePct ?? R.tarifs?.acomptePct ?? 30) / 100);
  const https = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : '';
  const payer = https(d.lienPaiement) || https(R.paiement?.lien);
  const body = `<section class="wrap doc">
  <header class="doc-h"><div>${MONO}<p class="brand-txt">Magnolia<small>${esc(R.sousNom || '')}</small></p><p class="small">${esc(R.adresse)}<br>${esc(R.telephone)} · ${esc(R.email)}</p></div>
  <div class="doc-ref"><h1>Devis ${esc(d.numero)}</h1><p>Émis le ${esc(dateFr(d.envoyeLe || d.createdAt))}${d.validiteJusquau ? `<br>Valable jusqu’au ${esc(dateFr(d.validiteJusquau))}` : ''}</p><span class="pill p-${esc(d.statut)}">${esc({ envoye: 'À signer', accepte: 'Signé', refuse: 'Refusé', brouillon: 'Brouillon' }[d.statut] || '')}</span></div></header>
  <div class="doc-parties"><div><p class="eyebrow">Client</p><p><b>${esc(client?.nom || '')}</b>${client?.societe ? '<br>' + esc(client.societe) : ''}<br>${esc(client?.email || '')}<br>${esc(client?.tel || '')}</p></div>
  <div><p class="eyebrow">Événement</p><p><b>${esc(d.evenement?.type || demande?.evenement?.type || '')}</b><br>${esc(dateFr(d.evenement?.date || demande?.evenement?.date))}<br>${esc(d.evenement?.invites || demande?.evenement?.invites || '')} invités · ${esc(d.evenement?.lieu || demande?.evenement?.ville || '')}</p></div></div>
  ${d.intro ? `<p class="doc-intro">${esc(d.intro)}</p>` : ''}
  ${devisLignesHtml(d)}
  ${totauxHtml(t)}
  ${d.conditions ? `<p class="small">${esc(d.conditions)}</p>` : ''}
  <div class="sign" data-sign="${esc(d.token)}">
  ${signe ? `<p class="ok">✓ Devis signé en ligne par <b>${esc(d.signature?.nom || '')}</b> le ${esc(dateFr(d.signature?.at, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}.</p>
     ${payer ? `<p>Acompte de <b>${euros(acompte)}</b> (${d.acomptePct ?? R.tarifs?.acomptePct ?? 30} %) pour réserver votre date :</p><p><a class="btn btn-or" href="${esc(payer)}" rel="noopener">Régler l’acompte par carte</a></p>` : ''}
     ${R.paiement?.iban ? `<div class="virement"><p class="eyebrow">${payer ? 'Ou par virement' : `Acompte de ${euros(acompte)} par virement`}</p><p>Titulaire : <b>${esc(R.paiement.titulaire || 'Magnolia Traiteur')}</b><br>IBAN : <b class="mono">${esc(R.paiement.iban)}</b>${R.paiement.bic ? `<br>BIC : <b class="mono">${esc(R.paiement.bic)}</b>` : ''}<br>Référence à indiquer : <b>${esc(d.numero)}</b></p></div>` : ''}
     ${!payer && !R.paiement?.iban ? `<p>L’équipe vous envoie le lien de paiement de l’acompte (${euros(acompte)}).</p>` : ''}`
    : d.statut === 'refuse' ? '<p>Ce devis a été clôturé. Appelez-nous pour en établir un nouveau.</p>'
    : expire ? `<p>Ce devis a expiré. Appelez-nous au ${esc(R.telephone)} : nous le mettons à jour.</p>`
    : `<h2>Bon pour accord</h2><p>Acompte de ${euros(acompte)} (${d.acomptePct ?? R.tarifs?.acomptePct ?? 30} %) à la signature, solde avant l’événement. En signant, vous acceptez les <a href="/cgv" target="_blank">conditions générales de vente</a>.</p>
     <form class="card-form" data-accept novalidate><label>Votre nom et prénom<input name="nom" required autocomplete="name"></label><label class="check"><input type="checkbox" name="ok" required> Je déclare accepter ce devis « bon pour accord ».</label><div class="row"><button class="btn btn-vert">Signer le devis</button><button class="btn btn-line" type="button" data-refuse>Je ne donne pas suite</button></div><p class="small" data-accept-msg></p></form>`}
  </div>
  <p class="row noprint"><button class="btn btn-line" type="button" onclick="print()">Imprimer / PDF</button><a class="lnk" href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">Une question ? ${esc(R.telephone)}</a></p>
  </section>`;
  return layout(c, { title: 'Devis ' + d.numero, body, bodyClass: 'p-doc' }).replace('<head>', '<head><meta name="robots" content="noindex">');
}

function facturePage(c, f, t) {
  const R = c.reglages;
  const body = `<section class="wrap doc">
  <header class="doc-h"><div>${MONO}<p class="brand-txt">Magnolia<small>${esc(R.sousNom || '')}</small></p><p class="small">${esc(R.adresse)}<br>${esc(R.telephone)} · ${esc(R.email)}</p></div>
  <div class="doc-ref"><h1>Facture ${esc(f.numero)}</h1><p>Émise le ${esc(dateFr(f.date))}${f.devisNumero ? `<br>Devis ${esc(f.devisNumero)}` : ''}</p><span class="pill p-${f.payee ? 'accepte' : 'envoye'}">${f.payee ? 'Payée' : 'À régler'}</span></div></header>
  <div class="doc-parties"><div><p class="eyebrow">Client</p><p><b>${esc(f.client?.nom || '')}</b>${f.client?.societe ? '<br>' + esc(f.client.societe) : ''}<br>${esc(f.client?.adresse || '')}<br>${esc(f.client?.email || '')}</p></div><div><p class="eyebrow">Objet</p><p>${esc(f.objet || '')}</p></div></div>
  ${devisLignesHtml(f)}
  ${totauxHtml(t)}
  ${(f.dejaRegleCents || 0) ? `<dl class="totaux"><div><dt>Déjà réglé (acompte)</dt><dd>− ${euros(f.dejaRegleCents)}</dd></div><div class="tot"><dt>Reste à payer</dt><dd>${euros(t.ttcCents - f.dejaRegleCents)}</dd></div></dl>` : ''}
  <p class="small">${esc(f.mentions || 'Paiement à réception. En cas de retard, pénalités au taux légal et indemnité forfaitaire de 40 € pour frais de recouvrement (clients professionnels).')}</p>
  <p class="row noprint"><button class="btn btn-line" type="button" onclick="print()">Imprimer / PDF</button></p></section>`;
  return layout(c, { title: 'Facture ' + f.numero, body, bodyClass: 'p-doc' }).replace('<head>', '<head><meta name="robots" content="noindex">');
}

module.exports = { layout, home, boutique, produit, lieux, lieu, selection, texte, maison, livraison, commander, temoignages, contact, legal, erreur, espaceConnexion, espace, devisPage, facturePage, textToHtml, V, BANDEAUX_DEFAUT };
