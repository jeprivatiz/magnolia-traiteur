'use strict';
/* Pages du blog « Nos événements en reportage » : liste (/blog), reportage (/blog/:slug) et bloc de l'accueil. */
const { esc } = require('./util');
const { CATEGORIES } = require('./blog');

const views = () => require('./views'); /* chargé à l'usage : views.js appelle aussi ce fichier (bloc de l'accueil) */
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisAnnee = a => { const d = a.dateEvenement ? new Date(a.dateEvenement + 'T12:00') : a.publieLe ? new Date(a.publieLe) : null; return d && !isNaN(d) ? `${MOIS[d.getMonth()]} ${d.getFullYear()}` : ''; };
const Maj = t => t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
const nbFr = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const surTitre = a => [a.typeEvenement || (a.specialite ? '' : CATEGORIES[a.categorie]), a.invites ? nbFr(a.invites) + ' invités' : ''].filter(Boolean).join(' · ');
const href = a => '/blog/' + a.slug;
/* reportages du blog général : sans ceux des spécialités, réservés au bas de leur page (Jean-Luc, 2026-11-28) */
const general = c => (c.blog || []).filter(a => !a.specialite);
/* spécialité d'un reportage : une page de Saveurs du monde, ou une rubrique entière (Cocktails & buffets français) */
const speDe = (c, a) => {
  if (!a.specialite) return null;
  const x = (c.rubriques.find(r => r.slug === 'saveurs-du-monde')?.sous || []).find(y => y.slug === a.specialite);
  if (x) return { nom: x.nom, href: '/saveurs-du-monde/' + x.slug, parent: ['Saveurs du monde', '/saveurs-du-monde'] };
  const r = c.rubriques.find(y => y.slug === a.specialite && y.statut !== 'masque');
  return r ? { nom: r.nom, href: '/' + r.slug, parent: null } : null;
};
const NOTE_ILLU = 'Photos d’illustration : prestations Magnolia similaires. Les photos de cet événement arriveront bientôt.';
const photo = (src, alt = '', attrs = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${attrs ? ' ' + attrs : ''}>` : '';
const lecture = a => Math.max(1, Math.round([a.chapo, ...(a.sections || []).map(s => s.titre + ' ' + s.texte)].join(' ').split(/\s+/).length / 220));
const paras = (t, cls = '') => String(t || '').split('\n').filter(Boolean).map((p, i) => `<p${i === 0 && cls ? ` class="${cls}"` : ''}>${esc(p)}</p>`).join('');

/* carte d'un reportage (accueil, liste, « d'autres reportages ») */
function carte(a, { grande = false } = {}) {
  const p = a.photos?.[0];
  return `<a class="rep-c${grande ? ' grande' : ''}" href="${href(a)}" data-cat="${esc(a.categorie)}">${photo(p?.src, p?.legende || a.titre)}<span class="badge">${esc(a.specialite ? 'Avis client' : CATEGORIES[a.categorie] || '')}</span><span class="x"><small>${esc(surTitre(a))}</small><b>${esc(a.titre)}</b></span></a>`;
}
const ONGLETS = [['', 'Tous'], ['entreprises', 'Entreprises'], ['particuliers', 'Particuliers'], ['maison', 'La maison Magnolia']];
const ongletsCat = (actif, lien, onglets = ONGLETS) => `<div class="rep-onglets" role="group" aria-label="Filtrer les reportages">${onglets.map(([k, t, h]) => `<a href="${h || '/blog' + (k ? '?type=' + k : '')}"${lien ? '' : ` data-rep-f="${k.replace(/s$/, '')}"`} class="${actif === k ? 'on' : ''}"${actif === k ? ' aria-current="true"' : ''}>${t}</a>`).join('')}</div>`;

/* bloc de l'accueil, juste après « Comment commander » (Jean-Luc, 2026-11-27) : seulement s'il y a des reportages publiés */
/* { entreprises: true } : version de la page Entreprises, seulement les reportages Entreprises et La maison Magnolia,
   sans bouton Particuliers (Jean-Luc, 2026-11-28) */
function encart(c, { entreprises = false } = {}) {
  if (entreprises) return encartEntreprises(c);
  const l = general(c);
  if (!l.length) return '';
  /* les 3 derniers, plus les 3 derniers de chaque catégorie pour les boutons Entreprises / Particuliers */
  const choisis = [...l.slice(0, 3), ...l.filter(a => a.categorie === 'entreprise').slice(0, 3), ...l.filter(a => a.categorie === 'particulier').slice(0, 3), ...l.filter(a => a.categorie === 'maison').slice(0, 3)].filter((a, i, t) => t.indexOf(a) === i);
  return `<section class="rep-sec" data-rep><div class="wrap">
 <div class="rep-tete"><div class="t"><p class="eyebrow">Le blog Magnolia</p><h2>Nos événements en reportage</h2>
 <p class="int">Pour certaines prestations, nous racontons l’événement en photos : soirées d’entreprise, séminaires, mariages, anniversaires… Pour vous inspirer et voir concrètement comment nous travaillons.</p></div>
 ${ongletsCat('', false)}</div>
 <div class="rep-l n${Math.min(3, l.length)}">${choisis.map((a, i) => carte(a, { grande: i === 0 }).replace('<a class', `<a${l.indexOf(a) < 3 ? '' : ' hidden'} class`)).join('')}</div>
 <div class="rep-bas"><p>Un nouveau reportage chaque semaine.</p><a class="btn btn-vert" href="/blog">Voir tous nos reportages</a></div>
</div></section>`;
}

function encartEntreprises(c) {
  const l = general(c).filter(a => a.categorie === 'entreprise' || a.categorie === 'maison');
  if (!l.length) return '';
  const choisis = [...l.slice(0, 3), ...l.filter(a => a.categorie === 'entreprise').slice(0, 3), ...l.filter(a => a.categorie === 'maison').slice(0, 3)].filter((a, i, t) => t.indexOf(a) === i);
  const onglets = [['', 'Tous', '/blog?type=entreprises'], ['entreprises', 'Entreprises'], ['maison', 'La maison Magnolia']];
  return `<section class="rep-sec ent-blog" data-rep><div class="wrap">
 <div class="rep-tete"><div class="t"><p class="eyebrow">Le blog Magnolia</p><h2>Nos événements d’entreprise en reportage</h2>
 <p class="int">Séminaires, soirées, inaugurations : nous racontons certaines de nos prestations en photos, avec les coulisses de la maison Magnolia. Pour vous inspirer et voir concrètement comment nous travaillons.</p></div>
 ${ongletsCat('', false, onglets)}</div>
 <div class="rep-l n${Math.min(3, l.length)}">${choisis.map((a, i) => carte(a, { grande: i === 0 }).replace('<a class', `<a${l.indexOf(a) < 3 ? '' : ' hidden'} class`)).join('')}</div>
 <div class="rep-bas"><p>Un nouveau reportage chaque semaine.</p><a class="btn btn-vert" href="/blog?type=entreprises">Voir nos reportages entreprises</a></div>
</div></section>`;
}

function liste(c, { type = '' } = {}) {
  const V = views();
  const cat = type === 'entreprises' ? 'entreprise' : type === 'particuliers' ? 'particulier' : type === 'maison' ? 'maison' : '';
  const l = general(c).filter(a => !cat || a.categorie === cat);
  const titre = 'Nos événements en reportage';
  const chapo = 'Pour certaines prestations, nous racontons l’événement en photos : soirées d’entreprise, séminaires, mariages, anniversaires… Pour vous inspirer et voir concrètement comment nous travaillons.';
  const body = `<section class="wrap page-h rep-page-h"><nav class="crumbs" aria-label="Fil d’Ariane"><a href="/">Accueil</a> / <span>Le blog</span></nav><p class="eyebrow">Le blog Magnolia</p><h1>${titre}</h1><p class="lead">${chapo}</p>${ongletsCat(cat ? type : '', true)}</section>
  <section class="wrap rep-liste">${l.length ? `<div class="rep-l tous n${Math.min(3, l.length)}">${l.map((a, i) => carte(a, { grande: i === 0 })).join('')}</div>` : `<p class="rep-vide">${cat ? 'Pas encore de reportage dans cette catégorie : ' : ''}nos prochains reportages arrivent très bientôt.</p>`}</section>
  <section class="cta wrap"><h2>Votre événement sera le prochain ?</h2><div class="row"><a class="btn btn-vert" href="/boutique">Composer mon événement</a><a class="lnk" href="tel:${esc((c.reglages.telephone || '').replace(/\s/g, ''))}">ou appelez le ${esc(c.reglages.telephone || '')}</a></div></section>`;
  return V.layout(c, { title: cat ? `${titre} : ${cat === 'entreprise' ? 'entreprises' : cat === 'particulier' ? 'particuliers' : 'la maison Magnolia'}` : titre, description: chapo, body, path: '/blog' + (type && cat ? '?type=' + type : ''), image: l[0]?.photos?.[0]?.src || '' });
}

/* mosaïque de 1 à 5 photos, mise en page selon leur nombre */
function mosaique(ph, legende = '') {
  if (!ph.length) return '';
  return `<figure class="ba-mos"><div class="g n${ph.length}">${ph.map(p => `<a href="${esc(p.src)}" data-zoom>${photo(p.src, p.legende)}</a>`).join('')}</div>${legende ? `<figcaption>${esc(legende)}</figcaption>` : ''}</figure>`;
}

function article(c, a) {
  const V = views(), R = c.reglages;
  const ph = a.photos || [], hero = ph[0];
  const sec = a.sections || [];
  const legendes = l => l.map(p => p.legende).filter(Boolean);
  const mos = ph.slice(1, 6), grande = ph[6], reste = ph.slice(7);
  const prods = (a.produits || []).map(s => c.bySlug.get(s)).filter(p => p && p.statut !== 'masque');
  const rubNom = p => c.rubriques.find(r => r.slug === p.rubrique)?.nom || '';
  const section = (s, i) => s ? `${s.titre ? `<h2>${esc(s.titre)}</h2>` : ''}${paras(s.texte, i === 0 ? 'lettrine' : '')}` : '';
  const meta = [Maj(moisAnnee(a)), a.lieu, a.typeEvenement, `Lecture ${lecture(a)} min`].filter(Boolean);
  const spe = speDe(c, a), speHref = spe ? spe.href : '';
  const autres = spe ? (c.blog || []).filter(x => x.slug !== a.slug && x.specialite === a.specialite).slice(0, 3)
    : [...general(c).filter(x => x.slug !== a.slug && x.categorie === a.categorie), ...general(c).filter(x => x.slug !== a.slug && x.categorie !== a.categorie)].slice(0, 3);
  const mosLeg = legendes(mos);
  const body = `<article class="ba">
 <header class="ba-hero${a.chiffres?.length ? '' : ' sans-chiffres'}">${hero ? photo(hero.src, hero.legende || a.titre, 'fetchpriority="high" loading="eager"') : ''}
  <div class="wrap"><nav class="ba-fil" aria-label="Fil d’Ariane"><a href="/">Accueil</a> · ${spe ? `${spe.parent ? `<a href="${spe.parent[1]}">${esc(spe.parent[0])}</a> · ` : ''}<a href="${esc(speHref)}">${esc(spe.nom)}</a>` : `<a href="/blog">Nos reportages</a> · <span>${esc(CATEGORIES[a.categorie] || '')}</span>`}</nav>
   <h1>${esc(a.titre)}</h1><p class="ba-meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</p></div>
 </header>
 ${a.chiffres?.length ? `<div class="ba-chiffres n${a.chiffres.length}">${a.chiffres.map(x => `<div><b>${esc(x.valeur)}</b><small>${esc(x.libelle)}</small></div>`).join('')}</div>` : ''}
 <div class="ba-corps">
  ${a.chapo ? `<p class="ba-chapo">${esc(a.chapo)}</p>` : ''}
  ${section(sec[0], 0)}
 </div>
 ${mosaique(mos, mosLeg.length === 1 ? mosLeg[0] : '')}${a.illustrations ? `<p class="ba-illu">${NOTE_ILLU}</p>` : ''}
 <div class="ba-corps suite">
  ${section(sec[1], 1)}
  ${prods.length ? `<h2>Les prestations de cet événement</h2><p>Toutes disponibles pour votre propre réception :</p><div class="ba-menu">${prods.map(p => `<a href="/${esc(p.rubrique)}/${esc(p.slug)}">${photo(p.photos?.[0]?.src, '')}<span><small>${esc(rubNom(p))}</small><b>${esc(p.titre)}</b></span></a>`).join('')}</div>` : ''}
  ${a.video ? `<div class="ba-video"><video src="${esc(a.video)}" muted loop playsinline autoplay preload="metadata"></video><div><p class="eyebrow">En vidéo</p><p>Revivez l’ambiance de l’événement.</p></div></div>` : ''}
  ${section(sec[2], 2)}
  ${grande ? `<figure class="ba-photo"><a href="${esc(grande.src)}" data-zoom>${photo(grande.src, grande.legende)}</a>${grande.legende ? `<figcaption>${esc(grande.legende)}</figcaption>` : ''}</figure>` : ''}
  ${a.citation ? `<blockquote class="ba-citation"><p>« ${esc(a.citation.texte)} »</p>${a.citation.auteur ? `<cite>— ${esc(a.citation.auteur)}</cite>` : ''}</blockquote>` : ''}
  ${sec.slice(3).map((s, i) => section(s, i + 3)).join('')}
 </div>
 ${reste.length ? `<section class="ba-galerie wrap"><h2>Toutes les photos</h2><div class="g">${reste.map(p => `<a href="${esc(p.src)}" data-zoom>${photo(p.src, p.legende)}</a>`).join('')}</div></section>` : ''}
 <div class="ba-corps fin">
  ${a.tags?.length ? `<div class="ba-tags">${a.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="ba-cta"><p class="eyebrow light">Votre événement</p><h2>${a.categorie === 'maison' ? 'Et si votre prochain événement était signé Magnolia ?' : `Vous préparez ${a.categorie === 'particulier' ? 'une fête' : 'un événement'} comme celui-ci ?`}</h2>
   <p>Dites-nous le nombre d’invités, la date et le lieu : nous vous envoyons votre devis rapidement.</p>
   <div class="btns"><a class="btn btn-or" href="${spe ? esc(speHref) + (spe.parent ? '#nos-buffets' : '#prestations') : '/boutique'}">${spe ? (spe.parent ? 'Voir nos buffets' : 'Voir nos formules') : 'Composer mon événement'}</a><a class="btn btn-ghost-light" href="tel:${esc((R.telephone || '').replace(/\s/g, ''))}">${esc(R.telephone || '')}</a></div></div>
 </div>
 ${autres.length ? `<section class="ba-autres"><div class="wrap"><p class="eyebrow">Nos reportages</p><h2>D’autres reportages à découvrir</h2><div class="rep-l n${autres.length}">${autres.map(x => carte(x)).join('')}</div><p class="ba-tous"><a class="lnk" href="${spe ? esc(speHref) : '/blog'}">${spe ? 'Revenir à la page ' + esc(spe.nom) : 'Tous nos reportages'} →</a></p></div></section>` : ''}
</article>`;
  const site = (process.env.SITE_URL || 'https://www.magnoliatraiteur.fr').replace(/\/$/, '');
  const schema = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: a.titre, description: a.seoDescription || a.chapo, image: ph.slice(0, 3).map(p => site + p.src), datePublished: a.publieLe || undefined, dateModified: a.updatedAt || a.publieLe || undefined, author: { '@type': 'Organization', name: R.nom || 'Magnolia Traiteur' }, publisher: { '@type': 'Organization', name: R.nom || 'Magnolia Traiteur', logo: { '@type': 'ImageObject', url: site + '/apple-icon.png' } }, mainEntityOfPage: site + href(a), keywords: (a.tags || []).join(', ') || undefined };
  return V.layout(c, { title: a.seoTitre || a.titre, description: a.seoDescription || a.chapo, body, path: href(a), image: hero?.src || '', schema, bodyClass: 'blog-art' });
}

/* bas de la page d'une spécialité : ses reportages publiés (Jean-Luc, 2026-11-28) */
function blocSpecialite(c, x) {
  const l = (c.blog || []).filter(a => a.specialite === x.slug);
  if (!l.length) return '';
  return `<section class="rep-sec spe-blog" id="reportages"><div class="wrap">
 <div class="rep-tete"><div class="t"><p class="eyebrow">Le blog Magnolia</p><h2>Ils l’ont vécu avec nous</h2>
 <p class="int">Des fêtes et des réceptions racontées à partir de l’avis que nos clients nous ont laissé.</p></div></div>
 <div class="rep-l n${Math.min(3, l.length)}">${l.slice(0, 6).map((a, i) => carte(a, { grande: i === 0 && l.length > 2 })).join('')}</div>
</div></section>`;
}

module.exports = { encart, liste, article, carte, blocSpecialite };
