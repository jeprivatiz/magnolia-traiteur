/* Back-office Magnolia Traiteur (application d'une seule page, sans dépendance). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* formules de buffet : nom sur une ligne, formule en dessous, sans tiret (copie de server/util.js coupeTitre) */
  const PORTIONS = [[/^a?c+ras?\b/i, '1 portion = 4 accras'], [/^sam[ou]+s+as?\b/i, '1 portion = 1 samoussa'], [/^boudins?\b/i, '1 portion = 1 boudin']]; /* copie de server/util.js */
  const avecPortion = t => { t = String(t ?? ''); const x = PORTIONS.find(([re]) => re.test(t)); if (!x || t.includes(x[1])) return t; const i = t.indexOf(' : '); return i > 0 ? `${t.slice(0, i)} (${x[1]})${t.slice(i)}` : `${t} (${x[1]})`; };
  const coupeTitre = t => { t = avecPortion(t); const m = /^(Buffets?\s[^—·()]+?)\s+[—·–-]\s+(\S.*)$/u.exec(String(t ?? '').trim()); return m ? [m[1], m[2].charAt(0).toUpperCase() + m[2].slice(1)] : [String(t ?? ''), '']; };
  const titreHtml = t => { const [n, f] = coupeTitre(t); return f ? `${esc(n)}<span class="formule">${esc(f)}</span>` : esc(n); };
  const titreTexte = t => { const [n, f] = coupeTitre(t); return f ? `${n} (${f.charAt(0).toLowerCase() + f.slice(1)})` : n; };
  const euros = c => c == null || c === '' ? '—' : (Math.round(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €';
  /* prix d'achat : saisi et affiché HORS TAXES (Jean-Luc, 2026-11-25), gardé en TTC dans la fiche (coutCents) pour les calculs */
  const achatHt = (ttc, t) => ttc == null || ttc === '' ? null : Math.round(ttc / (1 + (+t || 10) / 100));
  const achatTtc = (ht, t) => ht == null ? null : Math.round(ht * (1 + (+t || 10) / 100));
  const toCents = v => { const n = parseFloat(String(v ?? '').replace(/\s|€/g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100); };
  const fromCents = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
  const dateFr = (d, o = { day: 'numeric', month: 'short', year: 'numeric' }) => { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T12:00' : d); return isNaN(x) ? '—' : x.toLocaleDateString('fr-FR', o); };
  const dateH = d => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 3800); };
  async function api(url, { method = 'GET', body, form } = {}) {
    const r = await fetch(url, { method, headers: form ? { 'x-mg': '1' } : { 'content-type': 'application/json', 'x-mg': '1' }, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    verifierVersion(r.headers.get('x-version'));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { session = null; render(); throw new Error('Connexion requise.'); }
    if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
    return j;
  }
  const A = '/api/admin';
  /* temps passé sur le back-office (estimation) : un signe par minute tant qu'on s'en sert,
     c'est-à-dire onglet visible ET un geste (clic, frappe, défilement) dans les 5 dernières minutes */
  let dernierGeste = Date.now(), dernierSigne = 0;
  const signeDeVie = () => {
    if (typeof session === 'undefined' || !session || document.hidden || Date.now() - dernierGeste > 5 * 60e3 || Date.now() - dernierSigne < 50e3) return;
    dernierSigne = Date.now();
    fetch(A + '/actions/presence', { method: 'POST', headers: { 'x-mg': '1' } }).catch(() => {});
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove']) addEventListener(ev, () => { dernierGeste = Date.now(); signeDeVie(); }, { passive: true, capture: true });
  setInterval(signeDeVie, 60e3);
  document.addEventListener('visibilitychange', signeDeVie);
  /* cases « Titre / Description dans Google » (rubrique, spécialité, produit) + « ✨ Proposer avec l'IA » */
  const seoN = (v, max) => `${String(v || '').length} / ${max} caractères`;
  function seoBloc(type, titre, desc, attrs = '', sousRow = false) {
    const k = n => sousRow ? `data-k="${n}"` : `name="${n}"`;
    return `<div class="seobox" data-seo="${type}"${attrs}><div class="seohead"><b>Référencement Google</b><button type="button" class="btn ghost sm" data-seo-ia>✨ Proposer avec l’IA</button></div>
      <label>Titre dans Google <small class="muted" data-seo-n="60">${seoN(titre, 60)}</small><input ${k('seoTitre')} data-seo-t value="${esc(titre || '')}" maxlength="70"></label>
      <label>Description dans Google <small class="muted" data-seo-n="155">${seoN(desc, 155)}</small><textarea ${k('seoDescription')} data-seo-d rows="3" maxlength="170">${esc(desc || '')}</textarea></label>
      <p class="muted sm">Rempli automatiquement si la case est vide. Un texte que vous écrivez vous-même n’est jamais remplacé. Pensez à enregistrer après une proposition de l’IA.</p></div>`;
  }
  document.addEventListener('input', e => {
    const c = e.target.closest?.('[data-seo-t],[data-seo-d]'); if (!c) return;
    const n = c.closest('label')?.querySelector('[data-seo-n]'); if (n) { n.textContent = seoN(c.value, +n.dataset.seoN); n.classList.toggle('trop', c.value.length > +n.dataset.seoN); }
  });
  document.addEventListener('click', async e => {
    const btn = e.target.closest?.('[data-seo-ia]'); if (!btn) return;
    const box = btn.closest('[data-seo]'), type = box.dataset.seo, r = new URLSearchParams(location.hash.split('?')[1] || '').get('r') || cache.catR;
    const body = { type };
    if (type === 'produit') { body.id = box.dataset.id; body.titre = $('#pf [name=titre]')?.value; body.extrait = $('#pf [name=extrait]')?.value; }
    else if (type === 'rubrique') { body.rubrique = r; body.nom = $('#rf [name=nom]')?.value; body.chapo = $('#rf [name=chapo]')?.value; }
    else { const row = box.closest('.sousrow'); body.rubrique = r; body.slug = box.dataset.slug; body.nom = row && $('[data-n]', row)?.value; body.chapo = row && $('[data-k=chapo]', row)?.value; }
    const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ L’IA rédige…';
    try {
      const rep = await api(A + '/ia/seo', { method: 'POST', body });
      for (const [sel, v] of [['[data-seo-t]', rep.titre], ['[data-seo-d]', rep.description]]) { const el = $(sel, box); if (el && v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
      toast(rep.ia ? 'Proposition de l’IA posée : relisez puis enregistrez.' : 'Proposition posée (modèle simple, l’IA n’a pas répondu) : relisez puis enregistrez.');
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = lib; }
  });
  /* « Prénom NOM » (même règle que server/util.js nomPropre) : appliqué dès qu'on quitte la case du nom */
  const majPrenom = w => w.toLocaleLowerCase('fr-FR').replace(/(^|[-'’\s])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr-FR'));
  function nomPropre(v) {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim(); if (!t) return '';
    const w = t.split(' '); if (w.length === 1) return /^\p{Lu}[\p{Lu}'’-]+$/u.test(t) ? t : majPrenom(t);
    const tout = x => /\p{L}{2}/u.test(x) && x === x.toLocaleUpperCase('fr-FR') && x !== x.toLocaleLowerCase('fr-FR');
    let i = w.findIndex((x, k) => k >= 1 && tout(x)); if (i < 1) i = 1;
    return majPrenom(w.slice(0, i).join(' ')) + ' ' + w.slice(i).join(' ').toLocaleUpperCase('fr-FR');
  }
  document.addEventListener('focusout', e => { const i = e.target; if (!i.matches || !String(i.value || "").trim()) return; if (i.matches("input[data-nomclient]")) i.value = nomPropre(i.value); else if (i.matches("input[data-prenom]")) i.value = majPrenom(i.value.trim()); else if (i.matches("input[data-nomfam]")) i.value = i.value.trim().toLocaleUpperCase("fr-FR"); });
  const STATUTS = { demande: 'Demande', devis_envoye: 'Devis envoyé', relance: 'Relance', accord: 'Accord', reserve: 'Réservé', refuse: 'Refusé', termine: 'Terminé' };
  const DSTAT = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Signé', refuse: 'Refusé' };
  const UNITES = ['personne', 'pièce', 'portion', 'plateau', 'coffret', 'corbeille', 'gâteau', 'forfait', 'prestation', 'heure', 'location', 'bouteille', 'cocktail', 'lot de 6', 'conditionnement', 'litre', 'table', 'chaise', 'km', 'unité'];
  const ALLERGENES = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];
  let session = null, cache = {};
  /* ---------- source des demandes de devis (Jean-Luc, 2026-11-26) : par où le client nous a trouvés ----------
     « Site » automatique pour les demandes du site ; à la main : liste déroulante, avec « ➕ Créer une nouvelle source… ». Calcul : server/sources.js */
  const NOUV_SRC = '__nouvelle';
  const canalDe = c => !c ? '' : String(c.canal || '').trim() || c.canalAuto || (c.source === 'site' ? 'Site' : c.source === 'import CRM' ? 'Import' : '');
  async function chargerSources(force) { if (!cache.sources || force) cache.sources = (await api(A + '/sources').catch(() => ({ sources: [] }))).sources || []; return cache.sources; }
  const selSource = (name, val, attrs = '') => { const l = [...(cache.sources || [])]; if (val && !l.includes(val)) l.push(val); return `<select name="${name}" data-source${attrs}><option value="">— À indiquer —</option>${l.map(x => `<option${x === val ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="${NOUV_SRC}">➕ Créer une nouvelle origine…</option><option value="__gerer">⚙ Gérer la liste (ajouter, supprimer)…</option></select>`; };
  /* fenêtre « Gérer la liste des origines » : ajouter, supprimer (les fiches qui l'ont déjà la gardent) */
  function gererSources(apres) {
    const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const draw = () => { m.innerHTML = `<div class="modal-in src-in"><div class="bh"><h2>🧭 Origines du contact</h2><button type="button" class="x" data-x aria-label="Fermer">×</button></div>
      <p class="muted sm">La liste proposée sur les fiches clients, les demandes et les devis. Supprimer une origine la retire seulement de la liste : les fiches qui l’ont déjà la gardent. « Site » est posé automatiquement sur les demandes du site.</p>
      <ul class="src-l">${(cache.sources || []).map(x => `<li><span>${pillSource(x)}</span>${x === 'Site' ? '<small class="muted">automatique</small>' : `<button type="button" class="btn ghost sm" data-srdel="${esc(x)}">🗑 Supprimer</button>`}</li>`).join('')}</ul>
      <form class="row src-add"><input name="nom" placeholder="Nouvelle origine (ex. Mariages.net)" maxlength="60" required><button class="btn sm">➕ Ajouter</button></form>
      <div class="row"><button type="button" class="btn" data-x>Terminé</button></div></div>`; };
    draw(); document.body.appendChild(m);
    const fermer = () => { m.remove(); apres?.(); };
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-x]')) return fermer();
      const b = e.target.closest('[data-srdel]'); if (!b) return;
      try { cache.sources = (await api(A + '/sources/retirer', { method: 'POST', body: { nom: b.dataset.srdel } })).sources; toast(`« ${b.dataset.srdel} » retirée de la liste.`); draw(); } catch (err) { toast(err.message, true); }
    });
    m.addEventListener('submit', async e => {
      e.preventDefault(); const nom = e.target.nom.value.trim(); if (!nom) return;
      try { cache.sources = (await api(A + '/sources', { method: 'POST', body: { nom } })).sources; toast(`« ${nom} » ajoutée à la liste.`); draw(); m.querySelector('input[name=nom]')?.focus(); } catch (err) { toast(err.message, true); }
    });
  }
  const rafraichirSelects = () => { for (const x of document.querySelectorAll('select[data-source]')) { const v = x.dataset.prev ?? x.value, l = [...(cache.sources || [])]; if (v && !l.includes(v)) l.push(v); x.innerHTML = `<option value="">— À indiquer —</option>${l.map(y => `<option${y === v ? ' selected' : ''}>${esc(y)}</option>`).join('')}<option value="${NOUV_SRC}">➕ Créer une nouvelle origine…</option><option value="__gerer">⚙ Gérer la liste (ajouter, supprimer)…</option>`; x.value = v; } };
  const pillSource = v => v ? `<span class="src-pill" title="Origine du contact : par où le client nous a trouvés">🧭 ${esc(v)}</span>` : '';
  document.addEventListener('focusin', e => { const s = e.target.closest?.('select[data-source]'); if (s && s.value !== NOUV_SRC && s.value !== '__gerer') s.dataset.prev = s.value; });
  document.addEventListener('change', async e => {
    const s = e.target.closest?.('select[data-source]'); if (!s) return;
    const avant = s.dataset.prev ?? ([...s.options].find(o => o.defaultSelected && o.value !== NOUV_SRC && o.value !== '__gerer')?.value || '');
    if (s.value === '__gerer') { e.stopImmediatePropagation(); s.value = avant; s.dataset.prev = avant; gererSources(rafraichirSelects); return; }
    if (s.value !== NOUV_SRC) { s.dataset.prev = s.value; return; }
    e.stopImmediatePropagation();
    const prev = avant;
    const nom = (prompt('Nom de la nouvelle origine ?\n(ex. Mariages.net, Salon du mariage, LinkedIn, Recommandation d’un lieu…)') || '').trim();
    if (!nom) { s.value = prev; return; }
    try {
      const r = await api(A + '/sources', { method: 'POST', body: { nom } });
      cache.sources = r.sources;
      for (const x of document.querySelectorAll('select[data-source]')) if (![...x.options].some(o => o.value === r.nom)) x.querySelector(`option[value="${NOUV_SRC}"]`).insertAdjacentHTML('beforebegin', `<option>${esc(r.nom)}</option>`);
      s.value = r.nom; s.dataset.prev = r.nom;
      s.dispatchEvent(new Event('change', { bubbles: true }));
      toast(`Source « ${r.nom} » ajoutée à la liste.`);
    } catch (err) { s.value = prev; toast(err.message, true); }
  }, true);
  /* droits détaillés du compte connecté (Équipe & activité) ; « Administrateur » a tout */
  const peut = k => !!session?.droits?.[k];
  const DROIT_ECRAN = { factures: 'factures', catalogue: 'produits', achats: 'prix', tarifs: 'prix', lieux: 'produits', site: 'site', avis: 'site', blog: 'site', medias: 'site', entreprise: 'entreprise', outils: ['outils', 'fichiers'], equipe: 'equipe' /* réservé au manager (Jean-Luc, 2026-11-27) */ };
  const voitEcran = r => { const d = DROIT_ECRAN[r]; return !d || [].concat(d).some(peut); };

  /* ---------- structure ---------- */
  /* menu « Espace équipe » comme Je Privatise : CRM regroupe Demandes de devis, Suivi client, Devis et Factures */
  const CRM = ['demandes', 'suivi', 'devis', 'factures', 'clients', 'statistiques', 'tarifs'];
  const MENU = [
    ['', 'Tableau de bord'],
    ['crm', 'CRM'],
    ['demandes', 'Demandes de devis'],
    ['suivi', 'Suivi client'],
    ['devis', 'Devis'],
    ['factures', 'Factures'],
    ['clients', 'Contacts'],
    ['statistiques', 'Statistiques'],
    ['tarifs', 'Validation tarifs'],
    ['agenda', 'Agenda'],
    ['-'],
    ['catalogue', 'Catalogue'],
    ['lieux', 'Lieux'],
    ['site', 'Photos & textes du site'],
    ['avis', 'Avis clients'],
    ['blog', 'Blog · reportages'],
    ['medias', 'Médiathèque'],
    ['-'],
    ['entreprise', 'Mon entreprise'],
    ['equipe', 'Équipe & activité'],
    ['outils', 'Outils'],
  ];
  const mem = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
  function shell(inner, cur) {
    const open = CRM.includes(cur) || mem.get('mg_crm') === '1';
    const nb = cache.nouvelles ? String(cache.nouvelles) : '';
    const item = m => m[0] !== '-' && m[0] !== 'crm' && !voitEcran(m[0]) ? '' : m[0] === '-' ? '<hr>'
      : m[0] === 'crm' ? `<button type="button" class="chip crm-btn" data-tab="crm" data-crm aria-expanded="${open}" title="Demandes de devis, Suivi client, Devis, Factures, Clients, Statistiques, Validation tarifs">CRM<span>${nb}</span></button>`
      : `<a href="#/${m[0]}" data-tab="${m[0]}" class="chip${CRM.includes(m[0]) ? ' crm-sub' : ''}${cur === m[0] ? ' on' : ''}"${cur === m[0] ? ' aria-current="page"' : ''}>${m[1]}${m[0] === 'demandes' ? `<span>${nb}</span>` : m[0] === 'blog' && cache.blogDu ? '<span title="Reportage à préparer">1</span>' : ''}</a>`;
    return `<div class="bo">
      <aside class="side" id="side"><a class="logo" href="#/"><img src="/brand/monogramme.svg" alt=""><span>Magnolia<small>Back-office</small></span></a><a class="go-site" href="/" target="_blank" rel="noopener">🌐 Aller sur le site ↗</a>
      <nav class="tabs${open ? ' crm-open' : ''}"><p class="tabs-lab">Espace équipe</p>${MENU.filter(m => m[0] === '-' || m[0] === 'crm' || voitEcran(m[0])).filter((m, i, l) => m[0] !== '-' || (i > 0 && l[i - 1][0] !== '-' && i < l.length - 1)).map(item).join('')}</nav>
      <div class="me"><span>${esc(session.nom || session.email)}<small>${peut('admin') ? 'Administrateur' : peut('toutes') ? 'Équipe' : 'Commercial · ses dossiers'}</small></span><span class="me-act"><button class="lnk" data-monmdp>🔑 Mot de passe</button><button class="lnk" data-logout>Déconnexion</button></span></div></aside>
      <div class="main"><header class="mtop"><button class="burger" data-burger aria-label="Menu">☰</button><span class="mtitle">${esc((MENU.find(m => m[0] === cur) || [, ''])[1])}</span><a class="go-site sm" href="/" target="_blank" rel="noopener">🌐 Le site ↗</a></header><div class="content">${inner}</div></div></div>`;
  }
  const sansAcces = async () => `<div class="ph"><h1>Accès non autorisé</h1></div><section class="box"><p>Votre compte n’a pas le droit d’ouvrir cet écran.</p><p class="muted sm">Un administrateur peut vous le donner dans <b>Équipe &amp; activité</b>, en cochant la case qui correspond.</p><a class="btn" href="#/">← Tableau de bord</a></section>`;
  const page = (titre, actions, body) => `<div class="ph"><h1>${titre}</h1><div class="pa">${actions || ''}</div></div>${body}`;

  /* ---------- routeur ---------- */
  /* nouvelle version en ligne alors que l'onglet est resté ouvert : on recharge
     au prochain changement d'écran (rien n'est perdu), et un bandeau le propose tout de suite */
  const MA_VERSION = (document.querySelector('script[src*="admin.js?v="]')?.src.match(/v=([^&]+)/) || [])[1] || '';
  let versionPerimee = false;
  function verifierVersion(v) {
    if (!v || !MA_VERSION || v === MA_VERSION || versionPerimee) return;
    versionPerimee = true;
    const b = document.createElement('div');
    b.className = 'maj-bandeau';
    b.innerHTML = '<span>Une nouvelle version du back-office est en ligne.</span><button type="button" class="btn sm">Recharger</button>';
    b.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(b);
  }
  async function render() {
    if (versionPerimee) { location.reload(); return; }
    if (!session) {
      try { const s = await fetch('/api/session').then(r => r.json()); if (s.connecte) session = s; } catch { /* */ }
    }
    if (!session) return login();
    const [route, id, sub] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    const views = { '': dashboard, statistiques, tarifs, demandes, suivi, devis, factures, agenda, clients, catalogue, produit, achats, lieux, lieu, site, avis, blog, medias, entreprise, equipe, outils };
    let fn = route === 'catalogue' && id ? produit : route === 'lieux' && id ? lieu : views[route] || dashboard;
    if (!voitEcran(route)) fn = sansAcces;
    if (!peut('toutes') && typeof SV !== 'undefined') { SV.o = ''; mem.set('mg_commercial', ''); } /* « seulement ses opportunités » : pas de filtre sur un autre commercial */
    if (CRM.includes(route)) mem.set('mg_crm_last', route);
    if (!cache.sources) await chargerSources();
    if (cache.blogDu == null && peut('site')) { cache.blogDu = false; api(A + '/blog/etat').then(e => { cache.blogDu = !!(e.actif && e.aFaire); if (cache.blogDu) render(); }).catch(() => {}); }
    if (!cache.nouvelles && cache.nouvelles !== 0) api(A + '/demandes').then(l => { cache.nouvelles = l.filter(d => aTraiter(d, cache.devisL || [])).length; $$('#side .chip[data-tab=demandes] span, #side .crm-btn span').forEach(x => { x.textContent = cache.nouvelles || ''; }); }).catch(() => {});
    app.innerHTML = shell('<p class="muted">Chargement…</p>', route === 'produit' || route === 'achats' ? 'catalogue' : route);
    bindShell();
    try {
      const html = await fn(id, sub);
      $('.content').innerHTML = html;
      fn.after && fn.after(id, sub);
    } catch (e) { $('.content').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    scrollTo(0, 0);
  }
  addEventListener('hashchange', render);
  function bindShell() {
    $('[data-monmdp]')?.addEventListener('click', monMotDePasse);
    $('[data-logout]')?.addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); session = null; render(); });
    $('[data-burger]')?.addEventListener('click', () => $('#side').classList.toggle('open'));
    $$('#side nav a').forEach(a => a.addEventListener('click', () => $('#side').classList.remove('open')));
    /* CRM : la flèche ouvre et referme le groupe ; un clic depuis une autre rubrique rouvre la dernière rubrique CRM utilisée */
    $('[data-crm]')?.addEventListener('click', e => {
      const nav = e.currentTarget.parentElement, cur = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
      if (!CRM.includes(cur)) { mem.set('mg_crm', '1'); location.hash = '#/' + (mem.get('mg_crm_last') || 'suivi'); return; }
      const open = !nav.classList.contains('crm-open');
      nav.classList.toggle('crm-open', open); e.currentTarget.setAttribute('aria-expanded', open); mem.set('mg_crm', open ? '1' : '0');
    });
  }

  function login() {
    const reset = (location.hash.match(/reset=([\w-]+)/) || [])[1];
    const head = '<img src="/brand/monogramme.svg" alt=""><h1>Magnolia<small>Back-office</small></h1>';
    if (reset) {
      app.innerHTML = `<div class="login"><form id="rf">${head}<p class="muted">Choisissez votre nouveau mot de passe (10 caractères minimum).</p>
        <label>Nouveau mot de passe<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
        <button class="btn">Enregistrer</button><p class="err" id="lerr"></p></form></div>`;
      $('#rf').addEventListener('submit', async e => {
        e.preventDefault();
        try { await api('/api/auth/reset', { method: 'POST', body: { token: reset, password: e.target.password.value } }); history.replaceState(null, '', '/admin'); toast('Mot de passe enregistré : connectez-vous.'); login(); }
        catch (err) { $('#lerr').textContent = err.message; }
      });
      return;
    }
    app.innerHTML = `<div class="login"><form id="lf">${head}
      <label>E-mail<input type="email" name="email" required autocomplete="username"></label>
      <label>Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">Se connecter</button><p class="err" id="lerr"></p>
      <button type="button" class="lnk" data-oubli>Mot de passe oublié ?</button></form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); session = null; render(); }
      catch (err) { $('#lerr').textContent = err.message; }
    });
    $('[data-oubli]').addEventListener('click', async () => {
      const email = $('#lf').email.value.trim();
      if (!email) { $('#lerr').textContent = 'Écrivez d’abord votre e-mail ci-dessus.'; return; }
      try { await api('/api/auth/forgot', { method: 'POST', body: { email } }); $('#lerr').textContent = ''; toast('Si ce compte existe, un lien vient de partir par e-mail.'); }
      catch (err) { $('#lerr').textContent = err.message; }
    });
  }

  /* ---------- tableau de bord ---------- */
  /* refait le 2026-11-24 (Jean-Luc : « plus moderne, plus sexy ») : bandeau photo, choix du commercial en haut
     (même mémoire que le Suivi client et l'Agenda), chiffres en cartes, frise du suivi, journée et événements */
  const ICO = {
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
    euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10.5h9M4 13.5h9"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12"/><path d="M12 9c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1"/>',
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const ico = (k, cls = '') => `<svg class="db-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
  const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const eurosRond = c => c == null ? '—' : Math.round(c / 100).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' €';
  async function dashboard() {
    if (SV.o == null) { const m = mem.get('mg_commercial'); SV.o = m != null ? m : ''; }
    const [s, blogE] = await Promise.all([api(A + '/stats' + (SV.o ? '?com=' + encodeURIComponent(SV.o) : '')), peut('site') ? api(A + '/blog/etat').catch(() => null) : null]);
    cache.nouvelles = s.nouvellesTous;
    const noms = s.commerciaux || [];
    if (SV.o && SV.o !== '—' && !noms.includes(SV.o)) noms.push(SV.o);
    const prenom = esc((session.nom || '').split(' ')[0] || '');
    const auj = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const h = new Date().getHours(), salut = h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
    const qui = !SV.o ? 'de <b>toute l’équipe</b>' : SV.o === '—' ? 'des fiches <b>sans commercial</b>' : `de <b>${esc(SV.o)}</b>`;
    const pl = (n, a, b) => n + ' ' + (n > 1 ? b : a);
    const faits = [s.nouvelles ? pl(s.nouvelles, 'demande à traiter', 'demandes à traiter') : '', (s.rdvJour || []).length ? pl(s.rdvJour.length, 'appel ou visio aujourd’hui', 'appels ou visios aujourd’hui') : '', s.aRelancer.length ? pl(s.aRelancer.length, 'devis à relancer', 'devis à relancer') : ''].filter(Boolean);
    const resume = `Activité ${qui}${faits.length ? ' : ' + faits.join(', ').replace(/, ([^,]*)$/, ' et $1') + '.' : ' : tout est à jour, belle journée.'}`;
    const chip = (v, label, av) => `<button type="button" class="db-who-c${SV.o === v ? ' on' : ''}" data-dbcom="${esc(v)}" aria-pressed="${SV.o === v}"><span class="db-av">${av}</span>${esc(label)}</button>`;
    const rail = chip('', 'Toute l’équipe', ico('team')) + noms.map(n => chip(n, n, esc(initiales(n)))).join('') + (SV.o === '—' ? chip('—', 'Sans commercial', '?') : '');
    /* chiffre d'affaires signé : 6 derniers mois */
    const serie = s.serieCa || [], max = Math.max(1, ...serie.map(x => x.cents));
    const barres = serie.map((x, i) => `<span class="db-bar${i === serie.length - 1 ? ' cur' : ''}" title="${MOIS_C[+x.mois.slice(5) - 1]} : ${eurosRond(x.cents)}"><i style="height:${Math.max(4, Math.round(x.cents / max * 100))}%"></i><em>${MOIS_C[+x.mois.slice(5) - 1].replace('.', '')}</em></span>`).join('');
    const taux = s.tauxSignature, R = 26, C = 2 * Math.PI * R;
    const anneau = `<svg class="db-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${R}"/><circle class="v" cx="32" cy="32" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - (taux || 0) / 100)).toFixed(1)}"/></svg>`;
    const kpi = (href, k, v, l, sub, cls = '') => `<a class="db-k ${cls}" href="${href}"><span class="db-k-i">${ico(k)}</span><b>${v}</b><span class="db-k-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</a>`;
    /* frise du suivi client */
    const ETAPES = [['demande', 'Demandes'], ['devis_envoye', 'Devis envoyés'], ['relance', 'Relances'], ['accord', 'Accords'], ['reserve', 'Réservés'], ['refuse', 'Refusés']];
    const tot = ETAPES.reduce((t, [k]) => t + (s.parStatut[k] || 0), 0);
    const frise = `<div class="db-pipe-bar">${tot ? ETAPES.filter(([k]) => s.parStatut[k]).map(([k]) => `<i class="p-${k}" style="flex:${s.parStatut[k]}"></i>`).join('') : '<i class="p-vide" style="flex:1"></i>'}</div>
      <div class="db-pipe-l">${ETAPES.map(([k, l]) => `<a href="#/suivi" class="p-${k}"><span></span><b>${s.parStatut[k] || 0}</b>${l}</a>`).join('')}</div>`;
    const vide = (k, t, lien) => `<div class="db-vide">${ico(k)}<p>${t}</p>${lien || ''}</div>`;
    const jour = d => { const x = new Date(d + 'T12:00'); return `<span class="db-date-t"><small>${x.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')}</small><b>${x.getDate()}</b><small>${MOIS_C[x.getMonth()].replace('.', '')}</small></span>`; };
    const rdv = (s.rdvJour || []).map(r => `<li><a class="db-row" href="#/clients/${esc(r.clientId)}"><span class="db-heure">${esc(r.heure.replace(':', ' h '))}</span><span class="db-t"><b>${r.type === 'visio' ? '🎥' : '📞'} ${esc(r.clientNom)}</b><small>${esc([r.motif, r.commerciaux?.length ? r.commerciaux.join(', ') : 'toute l’équipe'].filter(Boolean).join(' · '))}</small></span></a>${r.lien ? `<a class="db-pill" href="${esc(r.lien)}" target="_blank" rel="noopener">Rejoindre</a>` : ''}</li>`).join('');
    const anniv = (s.anniversaires || []).map(a => `<li><a class="db-row" href="#/clients/${esc(a.id)}"><span class="db-heure gift">${a.dans === 0 ? 'Auj.' : a.dans === 1 ? 'Demain' : dateFr(a.date, { day: 'numeric', month: 'short' })}</span><span class="db-t"><b>${esc(a.nom)}</b><small>${a.age} ans</small></span></a><span class="db-ab">${a.souhaite ? '<span class="pill d-accepte">✓ Souhaité</span>' : `${a.email && !a.stopEmail ? `<button type="button" class="db-pill ghost" data-anniv="${esc(a.id)}" data-canal="email" title="Envoyer un e-mail">✉</button>` : ''}${a.tel && !a.stopSms ? `<button type="button" class="db-pill ghost" data-anniv="${esc(a.id)}" data-canal="sms" title="Envoyer un SMS">💬</button>` : ''}`}</span></li>`).join('');
    const evts = s.prochains.map(p => `<li><a class="db-row" href="#/demandes/${p.id}">${jour(p.date)}<span class="db-t"><b>${esc(p.nom)}</b><small>${esc([p.type, p.ville, p.invites ? p.invites + ' pers.' : ''].filter(Boolean).join(' · '))}</small></span><span class="db-r">${p.montantCents ? `<b>${eurosRond(p.montantCents)}</b>` : ''}<span class="pill st-${p.statut}">${STATUTS[p.statut]}</span></span></a></li>`).join('');
    const relances = s.aRelancer.sort((a, b) => b.jours - a.jours).map(d => `<li><a class="db-row" href="#/devis/${d.id}"><span class="db-jours${d.jours >= 7 ? ' chaud' : ''}"><b>${d.jours}</b>j</span><span class="db-t"><b>${esc(d.client || '—')}</b><small>${esc(d.numero)} · envoyé le ${dateFr(d.envoyeLe, { day: 'numeric', month: 'short' })}${!SV.o && d.commercial ? ' · ' + esc(d.commercial) : ''}</small></span><span class="db-r"><b>${eurosRond(d.montantCents)}</b><span class="db-go">Relancer ${ico('arrow')}</span></span></a></li>`).join('');
    return `<div class="db">
      <section class="db-hero">
        <div class="db-hero-in">
          <p class="db-jour">${esc(auj)}</p>
          <h1>${salut} ${prenom}</h1>
          <p class="db-resume">${resume}</p>
          <div class="db-cta"><button type="button" class="btn db-or" data-aiq>✨ Devis avec l’IA</button><a class="btn db-blanc" href="#/devis/nouveau">+ Nouveau devis</a></div>
        </div>
        <div class="db-who"><span class="db-who-lab">Tableau de bord de</span><div class="db-who-rail">${rail}</div></div>
      </section>
      ${blogE?.actif && blogE.aFaire ? `<a class="db-blog" href="#/blog/nouveau"><span>📝</span><span><b>Blog : c’est le moment de préparer le prochain reportage.</b><small>Quelques lignes + vos photos, l’IA rédige et met en page tout le reportage.</small></span><span class="btn sm">✨ Écrire</span></a>` : ''}
      <div class="db-kpis">
        <a class="db-k db-ca" href="#/devis"><span class="db-k-i">${ico('euro')}</span><span class="db-k-l">Signé ce mois-ci</span><b>${eurosRond(s.caSigneMoisCents)}</b><small>${eurosRond(s.caSigneAnneeCents)} depuis janvier</small><span class="db-bars">${barres}</span></a>
        ${kpi('#/demandes', 'inbox', s.nouvelles, s.nouvelles > 1 ? 'nouvelles demandes' : 'nouvelle demande', s.nouvelles ? 'à traiter maintenant' : 'rien en attente', s.nouvelles ? 'hot' : '')}
        ${kpi('#/suivi', 'pen', eurosRond(s.devisEnAttenteCents), 'devis en attente de signature', pl(s.devisEnAttente || 0, 'devis envoyé', 'devis envoyés'))}
        ${kpi('#/factures', 'card', eurosRond(s.facturesImpayeesCents), 'factures à encaisser', pl(s.facturesImpayees || 0, 'facture ouverte', 'factures ouvertes'))}
        <a class="db-k db-taux" href="#/suivi">${anneau}<b>${taux == null ? '—' : taux + ' %'}</b><span class="db-k-l">taux de signature</span><small>${s.tranches ? `${s.signes} signé${s.signes > 1 ? 's' : ''} sur ${s.tranches}` : 'pas encore de réponse'}</small></a>
      </div>
      <section class="db-card db-pipe"><div class="db-h"><h2>Suivi client</h2><a class="db-lien" href="#/suivi">Ouvrir ${ico('arrow')}</a></div>${frise}</section>
      <div class="db-grid">
        <div class="db-col">
        <section class="db-card"><div class="db-h"><h2>${ico('phone')} Aujourd’hui</h2><a class="db-lien" href="#/clients/appels">Programmer ${ico('arrow')}</a></div>${rdv ? `<ul class="db-list">${rdv}</ul>` : vide('phone', 'Aucun appel ni visio prévu aujourd’hui.')}</section>
        ${anniv ? `<section class="db-card"><div class="db-h"><h2>${ico('gift')} Anniversaires des clients</h2></div><ul class="db-list">${anniv}</ul></section>` : ''}
        </div>
        <div class="db-col">
        <section class="db-card"><div class="db-h"><h2>${ico('bell')} Devis à relancer</h2>${relances ? `<span class="db-nb">${s.aRelancer.length}</span>` : ''}</div>${relances ? `<ul class="db-list">${relances}</ul>` : vide('bell', 'Rien à relancer : bravo.')}</section>
        </div>
        <div class="db-col">
        <section class="db-card"><div class="db-h"><h2>${ico('cal')} Prochains événements</h2><a class="db-lien" href="#/agenda">Agenda ${ico('arrow')}</a></div>${evts ? `<ul class="db-list">${evts}</ul>` : vide('cal', 'Aucun événement confirmé à venir.')}</section>
        </div>
      </div>
    </div>`;
  }
  dashboard.after = () => {
    $$('[data-anniv]').forEach(b => b.addEventListener('click', () => souhaiter(b.dataset.anniv, b.dataset.canal, () => render())));
    const rail = $('.db-who-rail'), on = rail?.querySelector('.on');
    if (on && rail.scrollWidth > rail.clientWidth) rail.scrollLeft = on.offsetLeft - rail.clientWidth / 2 + on.offsetWidth / 2;
    $$('[data-dbcom]').forEach(b => b.addEventListener('click', async () => {
      if (SV.o === b.dataset.dbcom) return;
      SV.o = b.dataset.dbcom; mem.set('mg_commercial', SV.o);
      $$('[data-dbcom]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      $('.db')?.classList.add('db-charge');
      try { const html = await dashboard(); const c = $('.content'); if (c && location.hash.replace(/^#\/?/, '') === '') { c.innerHTML = html; dashboard.after(); } }
      catch (e) { toast(e.message, true); $('.db')?.classList.remove('db-charge'); }
    }));
  };

  /* ---------- Validation tarifs (Jean-Luc, 2026-11-26) ----------
     Pour chaque spécialité du site : la fiche du restaurateur / traiteur fournisseur (enregistrée, réutilisable), les produits
     à faire tarifer (cases à cocher pour en retirer), puis le document A4 « Tarifs préférentiels accordés à Magnolia Traiteur »
     à imprimer et faire signer. Le scan signé se dépose ensuite dans la fiche du fournisseur (#/tarifs/f/<id>).
     Interne : rien n'apparaît sur le site. Serveur : server/tarifs.js et routes /api/admin/tarifs/*. */
  const VT = { spe: mem.get('mg_vt_spe') || '', data: null, liste: null };
  /* même calcul que server/tarifs.js pagination() : nombre de pages A4 du document */
  const vtPages = n => { const M = { page: 277, t1: 70, tn: 13, th: 9, pd: 8, fin: 66 }, d1 = M.page - M.t1 - M.th - M.pd - M.fin; if (n <= Math.floor(d1 / 10)) return 1; const c1 = Math.floor((M.page - M.t1 - M.th - M.pd) / 12.5), cn = Math.floor((M.page - M.tn - M.th - M.pd) / 12.5), cf = Math.floor((M.page - M.tn - M.th - M.pd - M.fin) / 12.5); const p = []; let r = n; while (r > 0) { const c = Math.min(r, p.length ? cn : c1); p.push(c); r -= c; } const f = p.length === 1 ? Math.floor(d1 / 12.5) : cf; return p.length + (p[p.length - 1] > f ? 1 : 0); };
  const formFournisseur = (f, profils) => `<div class="g3"><label>Civilité<select name="civilite">${['', 'M.', 'Mme'].map(x => `<option${(f.civilite || '') === x ? ' selected' : ''} value="${x}">${x || '—'}</option>`).join('')}</select></label><label>Prénom<input name="prenom" data-prenom value="${esc(f.prenom || '')}" autocomplete="off"></label><label>Nom<input name="nom" data-nomfam value="${esc(f.nom || '')}" autocomplete="off"></label></div>
    <div class="g2"><label>Fonction <small class="muted">(gérant, chef, responsable commercial…)</small><input name="fonction" value="${esc(f.fonction || '')}"></label><label>Profil<select name="profil" data-vtprofil>${optionsProfils(profils, f.profil)}</select></label></div>
    <label>Nom de l’entreprise <small class="muted">(restaurant, traiteur…)</small><input name="entreprise" value="${esc(f.entreprise || '')}"></label>
    <label>Adresse<input name="adresse" value="${esc(f.adresse || '')}"></label>
    <div class="g2"><label>Code postal<input name="cp" value="${esc(f.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="ville" value="${esc(f.ville || '')}"></label></div>
    <div class="g3"><label>Téléphone<input name="telephone" value="${esc(f.telephone || '')}" inputmode="tel"></label><label>Portable<input name="portable" value="${esc(f.portable || '')}" inputmode="tel"></label><label>E-mail<input type="email" name="email" value="${esc(f.email || '')}"></label></div>
    <div class="g2"><label>SIRET <small class="muted">(14 chiffres)</small><input name="siret" value="${esc(f.siret || '')}" inputmode="numeric"></label><label>N° de TVA intracommunautaire<input name="tva" value="${esc(f.tva || '')}"></label></div>
    <label>🔒 Remarque <small class="muted">(jamais imprimée)</small><textarea name="notes" rows="2">${esc(f.notes || '')}</textarea></label>`;
  /* profils (Restaurant, Traiteur, Poissonnier…) : « ➕ Créer un nouveau profil » sur le moment, « ⚙ Gérer la liste » (Jean-Luc, 2026-11-26) */
  const optionsProfils = (profils, val) => { const l = [...profils]; if (val && !l.includes(val)) l.push(val); return `<option value="">— Choisir —</option>${l.map(x => `<option${val === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="__nouveau">➕ Créer un nouveau profil…</option><option value="__gerer">⚙ Gérer la liste (supprimer)…</option>`; };
  const rafraichirProfils = () => { for (const x of $$('select[data-vtprofil]')) { const v = x.dataset.prev ?? ''; x.innerHTML = optionsProfils(VT.liste.profils, v); x.value = v; } };
  function gererProfils() {
    const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const draw = () => { m.innerHTML = `<div class="modal-in src-in"><div class="bh"><h2>Profils des fournisseurs</h2><button type="button" class="x" data-x aria-label="Fermer">×</button></div>
      <p class="muted sm">Supprimer un profil le retire seulement de la liste : les fiches qui l’ont déjà le gardent.</p>
      <ul class="src-l">${VT.liste.profils.map(x => `<li><span><b>${esc(x)}</b></span><button type="button" class="btn ghost sm" data-prdel="${esc(x)}">🗑 Supprimer</button></li>`).join('')}</ul>
      <form class="row src-add"><input name="nom" placeholder="Nouveau profil (ex. Fromager)" maxlength="60" required><button class="btn sm">➕ Ajouter</button></form>
      <div class="row"><button type="button" class="btn" data-x>Terminé</button></div></div>`; };
    draw(); document.body.appendChild(m);
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-x]')) { m.parentNode.removeChild(m); rafraichirProfils(); return; }
      const b = e.target.closest('[data-prdel]'); if (!b) return;
      try { VT.liste.profils = (await api(A + '/tarifs/profils/retirer', { method: 'POST', body: { nom: b.dataset.prdel } })).profils; toast(`« ${b.dataset.prdel} » retiré de la liste.`); draw(); } catch (err) { toast(err.message, true); }
    });
    m.addEventListener('submit', async e => {
      e.preventDefault(); const nom = e.target.nom.value.trim(); if (!nom) return;
      try { VT.liste.profils = (await api(A + '/tarifs/profils', { method: 'POST', body: { nom } })).profils; toast(`« ${nom} » ajouté à la liste.`); draw(); m.querySelector('input[name=nom]')?.focus(); } catch (err) { toast(err.message, true); }
    });
  }
  document.addEventListener('focusin', e => { const s = e.target.closest?.('select[data-vtprofil]'); if (s && !s.value.startsWith('__')) s.dataset.prev = s.value; });
  document.addEventListener('change', async e => {
    const s = e.target.closest?.('select[data-vtprofil]'); if (!s) return;
    const avant = s.dataset.prev ?? '';
    if (s.value === '__gerer') { s.value = avant; gererProfils(); return; }
    if (s.value !== '__nouveau') { s.dataset.prev = s.value; return; }
    const nom = (prompt('Nom du nouveau profil ?\n(ex. Poissonnier, Fromager, Boucher…)') || '').trim();
    if (!nom) { s.value = avant; return; }
    try {
      const r = await api(A + '/tarifs/profils', { method: 'POST', body: { nom } });
      VT.liste.profils = r.profils;
      for (const x of $$('select[data-vtprofil]')) { const v = x === s ? r.nom : (x.dataset.prev ?? x.value); x.innerHTML = optionsProfils(r.profils, v); x.value = v; x.dataset.prev = v; }
      toast(`Profil « ${r.nom} » créé et choisi.`);
    } catch (err) { s.value = avant; toast(err.message, true); }
  });
  async function tarifs(id, sub) {
    if (id === 'f') return ficheFournisseurTarifs(sub);
    if (id === 'comparatif') return comparatifTarifs();
    if (id !== 'grille') return listeFournisseurs();
    const L = await api(A + '/tarifs'); VT.liste = L;
    if (!L.specialites.some(s => s.cle === VT.spe)) VT.spe = L.specialites[0]?.cle || '';
    VT.data = VT.spe ? await api(A + '/tarifs/specialite/' + VT.spe) : null;
    const groupes = []; for (const s of L.specialites) { const g = groupes.find(x => x.g === s.groupe); g ? g.l.push(s) : groupes.push({ g: s.groupe, l: [s] }); }
    const opt = s => `<option value="${esc(s.cle)}"${s.cle === VT.spe ? ' selected' : ''}>${esc(s.nom)} (${s.n})${s.fournisseur ? ' · ' + esc(s.fournisseur) : ''}${s.nbFournisseurs > 1 ? ` (+${s.nbFournisseurs - 1} autre${s.nbFournisseurs > 2 ? 's' : ''})` : ''}</option>`;
    const selSpe = `<select data-vtspe aria-label="Spécialité">${groupes.map(g => g.g ? `<optgroup label="${esc(g.g)}">${g.l.map(opt).join('')}</optgroup>` : g.l.map(opt).join('')).join('')}</select>`;
    return page('🧾 Préparer une grille de tarifs', `<a class="btn ghost" href="#/tarifs">← Mes fournisseurs</a><a class="btn vt-or" href="#/tarifs/comparatif">⚖ Comparatif des tarifs</a>`, `
      <p class="muted vt-intro">Préparez le document <b>« Tarifs préférentiels accordés à Magnolia Traiteur »</b> pour chaque spécialité : le restaurateur ou le traiteur y inscrit ses tarifs TTC, signe, et vous déposez ensuite le scan dans son dossier. Tout reste interne : le fournisseur n’apparaît jamais sur le site.</p>
      <section class="box vt-box"><h2><span class="vt-n">1</span> Spécialité</h2>${selSpe}${VT.data?.choix.imprimeLe ? `<p class="muted sm vt-der">Dernier document préparé le ${dateFr(VT.data.choix.imprimeLe, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>` : ''}</section>
      <section class="box vt-box" id="vtF">${vtBlocFournisseur()}</section>
      <section class="box vt-box" id="vtP">${vtBlocProduits()}</section>
      <div class="actions sticky vt-act"><label class="vt-duree">Tarifs garantis<select data-vtduree>${L.durees.map(d => `<option value="${d}"${(VT.data?.choix.duree || 6) === d ? ' selected' : ''}>${d} mois</option>`).join('')}</select></label><button type="button" class="btn vt-or" data-vtdoc>🖨 Préparer le document A4</button><button type="button" class="btn" data-vtmail>✉ Envoyer par e-mail</button><span class="muted sm" id="vtInfo"></span></div>`);
  }
  function vtBlocFournisseur() {
    const D = VT.data, L = VT.liste; if (!D) return '';
    const f = L.fournisseurs.find(x => x.id === D.choix.fournisseurId);
    const notes = (D.fournisseursFiches || []).filter(n => !L.fournisseurs.some(x => x.libelle.toLowerCase().includes(n.toLowerCase())));
    const G = (D.grilles || []).map(g => ({ ...g, f: L.fournisseurs.find(x => x.id === g.id) })).filter(g => g.f);
    const puces = G.length ? `<div class="vt-grilles"><span class="muted sm">Fournisseurs consultés pour cette spécialité :</span>${G.map(g => `<button type="button" class="vt-gr${g.id === D.choix.fournisseurId ? ' on' : ''}" data-vtgr="${esc(g.id)}">${esc(g.f.libelle)}<small>${g.accordes ? g.accordes + ' tarif' + (g.accordes > 1 ? 's' : '') + ' accordé' + (g.accordes > 1 ? 's' : '') : 'aucun tarif accordé saisi'}</small></button>`).join('')}</div>` : '';
    return `<h2><span class="vt-n">2</span> Le fournisseur de cette spécialité</h2>
      <p class="muted sm">Vous pouvez consulter plusieurs fournisseurs pour une même spécialité : choisissez-en un autre dans la liste, il aura sa propre grille (produits cochés, tarifs). Le <a href="#/tarifs/comparatif">comparatif</a> les met côte à côte.</p>${puces}
      <div class="vt-frow"><select data-vtf aria-label="Fournisseur"><option value="">— Aucun (cases vides, à remplir à la main) —</option>${L.fournisseurs.map(x => `<option value="${esc(x.id)}"${x.id === D.choix.fournisseurId ? ' selected' : ''}>${esc(x.libelle)}${x.ville ? ' · ' + esc(x.ville) : ''}</option>`).join('')}<option value="+">+ Nouvelle fiche fournisseur…</option></select>
      ${f ? `<a class="btn ghost sm" href="#/tarifs/f/${esc(f.id)}">✏ Modifier la fiche · 📎 dossier${f.scans ? ' (' + f.scans + ')' : ''}</a>` : ''}</div>
      ${notes.length ? `<p class="muted sm vt-note">Noté sur les fiches produits (Catalogue) : ${notes.map(n => `<button type="button" class="lnk" data-vtnote="${esc(n)}">${esc(n)}</button>`).join(', ')} — cliquez pour créer sa fiche.</p>` : ''}
      <div id="vtNew" hidden><form id="vtNf" class="vt-new"><p class="muted sm">La fiche est enregistrée une fois pour toutes : vous la retrouverez pour les autres spécialités.</p>${formFournisseur({}, L.profils)}<div class="row"><button class="btn">Enregistrer la fiche</button><button type="button" class="btn ghost" data-vtnfx>Annuler</button></div></form></div>`;
  }
  const vtEu = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';
  const vtCents = v => Math.round(parseFloat(String(v).replace(/\s/g, '').replace(',', '.')) * 100);
  function vtBlocProduits() {
    const D = VT.data; if (!D) return '<p class="muted">Aucune spécialité.</p>';
    let sec = null;
    const rows = D.produits.map(p => { const h = p.sectionNom && p.sectionNom !== sec ? `<li class="vt-sec">${esc(p.sectionNom)}</li>` : ''; sec = p.sectionNom; return h + `<li class="vt-p${p.retire ? ' off' : ''}"><label class="vt-ck"><input type="checkbox" data-vtck="${esc(p.slug)}"${p.retire ? '' : ' checked'} aria-label="Garder ${esc(p.titre)} sur le document"></label>${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : '<span class="vt-noph"></span>'}<span class="vt-t">${esc(p.titre)}</span><span class="vt-px"><label class="vt-q">Tarif client habituel<span class="vt-eu"><input data-vthab="${esc(p.slug)}" value="${vtEu(p.habituelCents)}" inputmode="decimal" placeholder="vide" maxlength="9"> €</span></label><label class="vt-q vt-acc">Tarif préférentiel accordé<span class="vt-eu"><input data-vtacc="${esc(p.slug)}" value="${vtEu(p.accordeCents)}" inputmode="decimal" placeholder="à saisir" maxlength="9"> €</span></label></span></li>`; }).join('');
    return `<h2><span class="vt-n">3</span> Produits du tableau</h2><p class="muted sm">Décochez les produits à retirer avant d’imprimer. Les colonnes Quantité, Tarif préférentiel et Observation restent vides sur le document : le restaurateur ou le traiteur les remplit. <b>Quand vous recevez le document signé</b>, saisissez ici ses « Tarifs préférentiels accordés » : ils alimentent le comparatif.</p>
      <details class="vt-imp"><summary>📋 Remplir « Tarif client habituel » depuis une liste de prix</summary><p class="muted sm">Collez la carte du fournisseur : une ligne par produit, le nom puis le prix TTC (ex. « Chicken Tikka ; 12,50 »). Chaque ligne est rapprochée du produit qui porte le même nom. La case reste vide sur le document si aucun prix n’est trouvé.</p><textarea data-vtimp rows="6" placeholder="Collez la liste ici, ou glissez-déposez le fichier dans ce cadre.&#10;Samossa poulet ; 6,50&#10;Chicken Tandoori ; 14,90"></textarea><div class="row"><label class="btn ghost sm vt-fic">📄 Ouvrir un fichier (.txt, .csv)<input type="file" data-vtimpf hidden></label><button type="button" class="btn sm" data-vtimpgo>Remplir les prix</button><button type="button" class="btn ghost sm" data-vthabx>Vider tous les tarifs habituels</button></div><div data-vtimpres></div></details>
      <div class="vt-bar"><span id="vtNb"></span><button type="button" class="btn ghost sm" data-vttout="1">Tout cocher</button><button type="button" class="btn ghost sm" data-vttout="0">Tout décocher</button></div><ul class="vt-list">${rows}</ul>`;
  }
  tarifs.after = (id, sub) => {
    if (id === 'f') return ficheFournisseurTarifs.after(sub);
    if (id === 'comparatif') return comparatifTarifs.after();
    if (id !== 'grille') return listeFournisseurs.after();
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
    const D = VT.data; if (!D) return;
    if (VT.allerProduits) { VT.allerProduits = false; const P = $('#vtP'); if (P) setTimeout(() => { P.scrollIntoView({ behavior: 'smooth', block: 'start' }); P.classList.add('vt-flash'); setTimeout(() => P.classList.remove('vt-flash'), 2200); }, 60); }
    const exclus = () => $$('[data-vtck]').filter(c => !c.checked).map(c => c.dataset.vtck);
    const habituels = () => Object.fromEntries($$('[data-vthab]').map(i => [i.dataset.vthab, vtCents(i.value)]).filter(([, v]) => v > 0));
    const accordes = () => Object.fromEntries($$('[data-vtacc]').map(i => [i.dataset.vtacc, vtCents(i.value)]).filter(([, v]) => v > 0));
    const quantites = () => Object.fromEntries($$('[data-vtq]').map(i => [i.dataset.vtq, i.value.trim()]).filter(([k, v]) => v && v !== D.produits.find(p => p.slug === k)?.quantiteDefaut));
    const compte = () => { const n = $$('[data-vtck]').filter(c => c.checked).length, p = vtPages(n); $('#vtNb').innerHTML = `<b>${n}</b> produit${n > 1 ? 's' : ''} sur ${D.produits.length} dans le tableau`; $('[data-vtmail]').disabled = !n; $('#vtInfo').textContent = n ? `${n} produit${n > 1 ? 's' : ''} · ${p === 1 ? 'tient sur 1 page A4' : p + ' pages A4, numérotées'}` : 'Cochez au moins un produit.'; $('[data-vtdoc]').disabled = !n; };
    let t = null;
    const sauver = (immediat) => { clearTimeout(t); const go = () => api(A + '/tarifs/specialite/' + VT.spe, { method: 'PUT', body: { fournisseurId: D.choix.fournisseurId, exclus: exclus(), quantites: quantites(), habituels: habituels(), accordes: accordes(), duree: +$('[data-vtduree]').value } }); if (immediat) return go(); t = setTimeout(() => go().catch(e => toast(e.message, true)), 500); };
    compte();
    $('[data-vtspe]').addEventListener('change', e => { VT.spe = e.target.value; mem.set('mg_vt_spe', VT.spe); render(); });
    $$('[data-vtck]').forEach(c => c.addEventListener('change', () => { c.closest('.vt-p').classList.toggle('off', !c.checked); compte(); sauver(); }));
    $$('[data-vttout]').forEach(b => b.addEventListener('click', () => { $$('[data-vtck]').forEach(c => { c.checked = b.dataset.vttout === '1'; c.closest('.vt-p').classList.toggle('off', !c.checked); }); compte(); sauver(); }));
    $$('[data-vtq]').forEach(i => i.addEventListener('input', () => sauver()));
    $('[data-vtduree]').addEventListener('change', () => sauver());
    $$('[data-vthab],[data-vtacc]').forEach(i => { i.addEventListener('input', () => sauver()); i.addEventListener('change', () => { const v = vtCents(i.value); i.value = v > 0 ? vtEu(v) : ''; }); });
    $('[data-vthabx]')?.addEventListener('click', () => { if (!confirm('Vider tous les tarifs clients habituels de cette spécialité ?')) return; $$('[data-vthab]').forEach(i => { i.value = ''; }); sauver(true).then(() => toast('Tarifs habituels vidés.')).catch(e => toast(e.message, true)); });
    const vtFichier = async f => { if (!f) return; try { const t = await f.text(); if (!/\d/.test(t)) return toast('Ce fichier ne contient pas de prix lisibles.', true); $('[data-vtimp]').value = t; $('[data-vtimpgo]').click(); } catch (err) { toast('Fichier illisible : ' + err.message, true); } };
    $('[data-vtimpf]')?.addEventListener('change', e => { vtFichier(e.target.files[0]); e.target.value = ''; });
    const vtZone = $('[data-vtimp]'); if (vtZone) { vtZone.addEventListener('dragover', e => { e.preventDefault(); vtZone.classList.add('vt-drop'); }); vtZone.addEventListener('dragleave', () => vtZone.classList.remove('vt-drop')); vtZone.addEventListener('drop', e => { e.preventDefault(); vtZone.classList.remove('vt-drop'); vtFichier(e.dataTransfer.files[0]); }); }
    $('[data-vtimpgo]')?.addEventListener('click', async () => {
      try {
        await sauver(true);
        const r = await api(A + '/tarifs/specialite/' + VT.spe + '/habituels', { method: 'POST', body: { texte: $('[data-vtimp]').value } });
        VT.dernierImport = r; toast(r.trouves.length + ' prix posés.'); render();
      } catch (e) { toast(e.message, true); }
    });
    if (VT.dernierImport) { const r = VT.dernierImport; VT.dernierImport = null; const d = $('.vt-imp'); d.open = true; d.querySelector('[data-vtimpres]').innerHTML = `<p class="vt-ok">✓ ${r.trouves.length} prix posé${r.trouves.length > 1 ? 's' : ''}.</p>${r.nonTrouves.length ? `<p class="muted sm"><b>${r.nonTrouves.length} ligne${r.nonTrouves.length > 1 ? 's' : ''} de la liste sans produit correspondant :</b> ${r.nonTrouves.map(x => esc(x.nom)).join(', ')}.</p>` : ''}${r.sansPrix.length ? `<p class="muted sm"><b>${r.sansPrix.length} produit${r.sansPrix.length > 1 ? 's' : ''} sans tarif habituel :</b> ${r.sansPrix.map(esc).join(', ')}.</p>` : ''}`; }
    const vtOuvrir = async fid => {
      try { await sauver(true); await api(A + '/tarifs/specialite/' + VT.spe, { method: 'PUT', body: { fournisseurId: fid } }); toast(fid ? 'Grille de ce fournisseur ouverte.' : 'Aucun fournisseur : les cases seront vides.'); render(); } catch (err) { toast(err.message, true); }
    };
    $$('[data-vtgr]').forEach(b => b.addEventListener('click', () => { if (b.dataset.vtgr !== D.choix.fournisseurId) vtOuvrir(b.dataset.vtgr); }));
    const nouveau = (pre = '') => { $('#vtNew').hidden = false; const f = $('#vtNf'); f.reset(); if (pre) f.entreprise.value = pre; f.querySelector(pre ? '[name=prenom]' : '[name=entreprise]').focus(); };
    $('[data-vtf]').addEventListener('change', async e => {
      if (e.target.value === '+') return nouveau();
      $('#vtNew').hidden = true;
      await vtOuvrir(e.target.value);
    });
    $$('[data-vtnote]').forEach(b => b.addEventListener('click', () => { $('[data-vtf]').value = '+'; nouveau(b.dataset.vtnote); }));
    $('[data-vtnfx]')?.addEventListener('click', () => { $('#vtNew').hidden = true; $('[data-vtf]').value = D.choix.fournisseurId || ''; });
    $('#vtNf')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const r = await api(A + '/tarifs/fournisseurs', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        await sauver(true);
        await api(A + '/tarifs/specialite/' + VT.spe, { method: 'PUT', body: { fournisseurId: r.fournisseur.id } });
        toast('Fiche enregistrée et choisie : cochez maintenant les produits.'); VT.allerProduits = true; render();
      } catch (err) { toast(err.message, true); }
    });
    $('[data-vtmail]').addEventListener('click', async () => { try { await sauver(true); vtEnvoyerMail(); } catch (err) { toast(err.message, true); } });
    $('[data-vtdoc]').addEventListener('click', async () => {
      const w = window.open('about:blank', '_blank'); // ouvert tout de suite, sinon Safari bloque la fenêtre
      try { await sauver(true); const url = `${A}/tarifs/document/${VT.spe}?t=${Date.now()}`; if (w) w.location = url; else location.href = url; }
      catch (err) { w?.close(); toast(err.message, true); }
    });
  };

  /* Écran d'accueil de Validation tarifs (Jean-Luc, 2026-11-26) : la liste de tous les fournisseurs, avec recherche ; on enchaîne ensuite sur la fiche ou la grille */
  async function listeFournisseurs() {
    const L = await api(A + '/tarifs'); VT.liste = L;
    const nomS = c => L.specialites.find(s => s.cle === c)?.nom || c;
    const jour = d => dateFr(d, { day: 'numeric', month: 'short', year: 'numeric' });
    const statut = f => f.scans ? `<span class="pill d-accepte">📎 Signé reçu${f.signeLe ? ' · ' + jour(f.signeLe) : ''}</span>` : f.envoyeLe ? `<span class="pill d-envoye">✉ Envoyé le ${jour(f.envoyeLe)}</span>` : f.specialites.length ? '<span class="pill">🧾 Grille à envoyer</span>' : '<span class="pill">À compléter</span>';
    const rows = L.fournisseurs.map(f => `<tr data-href="#/tarifs/f/${esc(f.id)}" data-vtq="${esc([f.libelle, f.profil, f.ville, f.telephone, f.email, ...f.specialites.map(nomS)].join(' ').toLowerCase())}"><td><b>${esc(f.entreprise || f.contact || 'Sans nom')}</b>${f.entreprise && f.contact ? `<small class="vt-sub">${esc(f.contact)}</small>` : ''}</td><td>${esc(f.profil)}${f.ville ? `<small class="vt-sub">${esc(f.ville)}</small>` : ''}</td><td>${f.specialites.length ? f.specialites.map(c => `<button type="button" class="vt-chip" data-vtgo="${esc(f.id)}" data-cle="${esc(c)}" title="Ouvrir sa grille">${esc(nomS(c))} ›</button>`).join('') : '<span class="muted sm">aucune spécialité</span>'}</td><td>${f.telephone ? `<a href="tel:${esc(f.telephone.replace(/\s/g, ''))}">${esc(f.telephone)}</a>` : ''}${f.email ? `<small class="vt-sub"><a href="mailto:${esc(f.email)}">${esc(f.email)}</a></small>` : ''}</td><td>${statut(f)}</td><td class="n"><a class="qs-back" href="#/tarifs/f/${esc(f.id)}">Fiche ›</a></td></tr>`).join('');
    return page('🧾 Validation tarifs', `<a class="btn vt-or" href="#/tarifs/f/nouveau">➕ Nouveau fournisseur</a><a class="btn ghost" href="#/tarifs/grille">🧾 Préparer une grille</a><a class="btn ghost" href="#/tarifs/comparatif">⚖ Comparatif</a>`, `
      <p class="muted vt-intro">Tous vos fournisseurs. Cliquez sur un fournisseur pour ouvrir sa fiche (coordonnées, spécialités, documents signés), ou sur une de ses spécialités pour préparer sa grille de tarifs, l’imprimer ou l’envoyer par e-mail. Tout reste interne : jamais visible sur le site.</p>
      <section class="box vt-box"><div class="vt-lbar"><input type="search" data-vtrech placeholder="🔍 Rechercher un fournisseur, une spécialité, une ville…" aria-label="Rechercher"><span class="muted sm" data-vtnb>${L.fournisseurs.length} fournisseur${L.fournisseurs.length > 1 ? 's' : ''}</span></div>
      ${L.fournisseurs.length ? `<div class="table vt-lf"><table><thead><tr><th>Fournisseur</th><th>Profil</th><th>Spécialités</th><th>Contact</th><th>Statut</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">Aucun fournisseur pour le moment. Commencez par « ➕ Nouveau fournisseur ».</p>'}</section>`);
  }
  listeFournisseurs.after = () => {
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; }));
    $$('[data-vtgo]').forEach(b => b.addEventListener('click', async () => {
      try { await api(A + '/tarifs/specialite/' + b.dataset.cle, { method: 'PUT', body: { fournisseurId: b.dataset.vtgo } }); VT.spe = b.dataset.cle; mem.set('mg_vt_spe', VT.spe); VT.allerProduits = true; location.hash = '#/tarifs/grille'; } catch (err) { toast(err.message, true); }
    }));
    const r = $('[data-vtrech]'); if (!r) return;
    r.addEventListener('input', () => { const q = r.value.trim().toLowerCase(); let n = 0; $$('tr[data-vtq]').forEach(tr => { const ok = !q || tr.dataset.vtq.includes(q); tr.hidden = !ok; if (ok) n++; }); $('[data-vtnb]').textContent = `${n} fournisseur${n > 1 ? 's' : ''}`; });
  };
  /* Envoi de la grille par e-mail (Jean-Luc, 2026-11-26) : lettre à en-tête modifiable + aperçu ; le PDF est fabriqué ici, depuis le document A4 lui-même */
  async function vtEnvoyerMail() {
    const L = await api(A + '/tarifs/specialite/' + VT.spe + '/lettre');
    const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const deja = (L.envois || []).map(e => `Déjà envoyé le ${dateFr(e.at, { day: 'numeric', month: 'long', year: 'numeric' })} à ${esc(e.to)}${e.par ? ' par ' + esc(e.par) : ''}`).join('<br>');
    m.innerHTML = `<div class="modal-in vt-mail"><div class="bh"><h2>✉ Envoyer la grille par e-mail</h2><button type="button" class="x" data-x aria-label="Fermer">×</button></div>
      <p class="muted sm">${L.fournisseur ? `Pour <b>${esc(L.fournisseur)}</b>. ` : ''}Le document A4 de cette spécialité part en <b>pièce jointe (PDF)</b>. Le fournisseur vous répond avec la grille signée : déposez-la ensuite dans son dossier.${deja ? `<br><span class="vt-deja">${deja}</span>` : ''}</p>
      <div class="vt-mg"><form class="vt-mf"><label>À (e-mail du fournisseur)<input type="email" name="to" value="${esc(L.to)}" required placeholder="contact@fournisseur.fr"></label><label>Objet<input name="objet" value="${esc(L.objet)}" maxlength="200"></label><label>Lettre<textarea name="texte" rows="16">${esc(L.texte)}</textarea></label><p class="muted sm">Votre nom, ${esc(L.signature)}, et les coordonnées de Magnolia sont ajoutés en signature.</p>
      <div class="row"><button class="btn vt-or" data-vtgo>✉ Envoyer avec la grille en PDF</button><button type="button" class="btn ghost" data-x>Annuler</button></div><p class="muted sm" data-vtst></p></form>
      <div class="vt-ap"><span class="muted sm">Aperçu de l’e-mail</span><iframe title="Aperçu de l’e-mail" data-vtap></iframe></div></div></div>`;
    document.body.appendChild(m);
    const f = m.querySelector('form'), st = m.querySelector('[data-vtst]');
    const fermer = () => m.parentNode && m.parentNode.removeChild(m);
    let t = null;
    const apercu = async () => { try { const r = await api(A + '/tarifs/specialite/' + VT.spe + '/envoyer', { method: 'POST', body: { apercu: true, texte: f.texte.value } }); m.querySelector('[data-vtap]').srcdoc = r.html; } catch (e) { /* l'aperçu n'empêche rien */ } };
    apercu(); f.texte.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apercu, 500); });
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) fermer(); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = f.querySelector('[data-vtgo]'); b.disabled = true;
      const ifr = document.createElement('iframe'); ifr.className = 'vt-pdfgen'; ifr.setAttribute('aria-hidden', 'true');
      try {
        st.textContent = 'Préparation du PDF (quelques secondes)…';
        await new Promise((ok, ko) => { ifr.onload = ok; ifr.onerror = ko; ifr.src = `${A}/tarifs/document/${VT.spe}?pdf=1&t=${Date.now()}`; document.body.appendChild(ifr); });
        const pdf = await ifr.contentWindow.versPdf();
        st.textContent = 'Envoi de l’e-mail…';
        const r = await api(A + '/tarifs/specialite/' + VT.spe + '/envoyer', { method: 'POST', body: { to: f.to.value.trim(), objet: f.objet.value, texte: f.texte.value, pdf } });
        fermer(); toast(r.live ? `E-mail envoyé à ${f.to.value.trim()}, avec la grille en PDF.` : 'Mode essai : e-mail préparé mais pas envoyé (Brevo non branché ici).');
      } catch (err) { st.textContent = ''; toast(err.message, true); b.disabled = false; }
      finally { ifr.remove(); }
    });
  }
  /* Comparatif des tarifs (Jean-Luc, 2026-11-26) : les fournisseurs d'un même produit côte à côte, le moins cher en vert */
  async function comparatifTarifs() {
    const C = await api(A + '/tarifs/comparatif'); VT.comp = C;
    const spe = C.specialites.some(s => s.cle === VT.compSpe) ? VT.compSpe : '';
    const L = C.lignes.filter(l => !spe || l.spe === spe), F = C.fournisseurs.filter(f => L.some(l => l.prix[f.id]));
    const parF = new Map(F.map(f => [f.id, f]));
    const gagne = new Map(); for (const l of L) gagne.set(l.meilleur.id, (gagne.get(l.meilleur.id) || 0) + 1);
    let sec = null;
    const lignes = L.map(l => { const h = !spe && l.speNom !== sec ? `<tr class="vt-csec"><td colspan="${F.length + 2}">${esc(l.speNom)}</td></tr>` : ''; sec = l.speNom; const t = l.meilleur.type; return h + `<tr><td class="vt-cp">${l.photo ? `<img src="${esc(l.photo)}" alt="" loading="lazy">` : '<span class="vt-noph"></span>'}<b>${esc(l.titre)}</b></td>${F.map(f => { const p = l.prix[f.id]; if (!p) return '<td class="n muted">—</td>'; const best = f.id === l.meilleur.id && Object.keys(l.prix).length > 1; return `<td class="n${best ? ' vt-best' : ''}">${p.acc ? `<b>${euros(p.acc)}</b>` : '<span class="muted sm">non accordé</span>'}${p.hab ? `<small>habituel ${euros(p.hab)}</small>` : ''}</td>`; }).join('')}<td class="vt-cm"><b>${euros(l.meilleur.cents)}</b><small>${esc(parF.get(l.meilleur.id)?.libelle || '')}${t === 'hab' ? ' · tarif habituel' : ''}${l.ecart ? ` · ${euros(l.ecart)} de moins` : ''}</small></td></tr>`; }).join('');
    const opt = `<select data-vtcs aria-label="Spécialité"><option value="">Toutes les spécialités (${C.lignes.length} produits)</option>${C.specialites.map(s => `<option value="${esc(s.cle)}"${s.cle === spe ? ' selected' : ''}>${esc(s.nom)} (${C.lignes.filter(l => l.spe === s.cle).length})</option>`).join('')}</select>`;
    return page('⚖ Comparatif des tarifs fournisseurs', `<button type="button" class="btn ghost" data-vtcprint>🖨 Imprimer</button><a class="btn ghost" href="#/tarifs">← Mes fournisseurs</a>`, `
      <p class="muted vt-intro">Pour chaque produit, les tarifs de chaque fournisseur côte à côte. <b>En vert, le moins cher</b> : on compare le tarif préférentiel accordé (saisi une fois le document signé reçu) ; s’il n’y en a encore aucun pour ce produit, le tarif client habituel. Interne : jamais visible sur le site.</p>
      <section class="box vt-box"><div class="vt-cbar">${opt}${F.length ? `<span class="vt-cres">${F.map(f => `<span class="pill">${esc(f.libelle)} : <b>${gagne.get(f.id) || 0}</b> meilleur${(gagne.get(f.id) || 0) > 1 ? 's' : ''} tarif${(gagne.get(f.id) || 0) > 1 ? 's' : ''}</span>`).join('')}</span>` : ''}</div>
      ${L.length ? `<div class="table vt-comp"><table><thead><tr><th>Produit</th>${F.map(f => `<th class="n">${esc(f.libelle)}</th>`).join('')}<th>Meilleur tarif</th></tr></thead><tbody>${lignes}</tbody></table></div>` : '<p class="muted">Aucun tarif saisi pour le moment. Dans Validation tarifs, choisissez la spécialité et le fournisseur, puis remplissez « Tarif préférentiel accordé » (ou « Tarif client habituel ») : le comparatif se remplit tout seul.</p>'}</section>`);
  }
  comparatifTarifs.after = () => {
    $('[data-vtcs]')?.addEventListener('change', e => { VT.compSpe = e.target.value; render(); });
    $('[data-vtcprint]')?.addEventListener('click', () => print());
  };

  /* fiche fournisseur + son dossier : les documents signés scannés (PDF ou photo), datés, à voir ou télécharger */
  async function ficheFournisseurTarifs(id) {
    const L = VT.liste || (VT.liste = await api(A + '/tarifs'));
    if (id === 'nouveau') return page('Nouvelle fiche fournisseur', '<a class="btn ghost" href="#/tarifs">← Mes fournisseurs</a>', `<section class="box vt-box"><h2>🍽 Ses spécialités</h2><p class="muted sm">Cochez ce qu’il propose : après « Créer la fiche », vous arrivez directement sur ses produits.</p><div class="vt-specs">${L.specialites.map(s => `<label class="vt-spk"><input type="checkbox" data-vtspk="${esc(s.cle)}"> ${esc(s.nom)}</label>`).join('')}</div></section><section class="box vt-box"><h2>Coordonnées</h2><form id="vtFf">${formFournisseur({}, L.profils)}<button class="btn">Créer la fiche</button></form></section>`);
    const f = await api(A + '/tarifs/fournisseurs/' + id); VT.fiche = f;
    const nomSpe = c => L.specialites.find(s => s.cle === c)?.nom || '';
    const specs = (f.specialites || []).map(nomSpe).filter(Boolean);
    const scans = (f.scans || []).map(s => { const u = `${A}/tarifs/fournisseurs/${esc(id)}/scans/${esc(s.nom)}`; const img = /^image\/(jpeg|png|webp)/.test(s.type); return `<li class="vt-scan">${img ? `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt=""></a>` : `<a class="vt-pdf" href="${u}" target="_blank" rel="noopener">${/pdf/.test(s.type) ? 'PDF' : '📄'}</a>`}<span class="vt-st"><b>${esc(s.specialiteNom || nomSpe(s.specialite) || 'Document signé')}</b><small>${s.signeLe ? 'Signé le ' + dateFr(s.signeLe, { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' : ''}déposé le ${dateFr(s.at, { day: 'numeric', month: 'long', year: 'numeric' })}${s.par ? ' par ' + esc(s.par) : ''}</small>${s.note ? `<small class="vt-sn">${esc(s.note)}</small>` : ''}<small class="muted">${esc(s.original)} · ${Math.max(1, Math.round(s.octets / 1024)).toLocaleString('fr-FR')} Ko</small></span><span class="vt-sa"><a class="btn ghost sm" href="${u}" target="_blank" rel="noopener">👁 Voir</a><a class="btn ghost sm" href="${u}?telecharger">⬇ Télécharger</a><button type="button" class="btn ghost sm danger" data-vtrm="${esc(s.nom)}">🗑 Retirer</button></span></li>`; }).join('');
    const titre = [f.entreprise, [f.prenom, f.nom].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    return page('🧾 ' + esc(titre || 'Fournisseur'), '<a class="btn ghost" href="#/tarifs">← Mes fournisseurs</a>', `
      <section class="box vt-box"><h2>🍽 Spécialités de ce fournisseur</h2><p class="muted sm">Cochez ce qu’il propose (ex. Plateau de fruits de mer pour un poissonnier), décochez ce qui ne le concerne pas, puis « Enregistrer la fiche » en bas : vous arrivez directement sur ses produits.</p>
        <div class="vt-specs">${L.specialites.map(s => `<label class="vt-spk"><input type="checkbox" data-vtspk="${esc(s.cle)}"${(f.specialites || []).includes(s.cle) ? ' checked' : ''}> ${esc(s.nom)}</label>`).join('')}</div></section>
      <section class="box vt-box vt-dos"><h2>📎 Dossier : documents signés</h2>
        <p class="muted sm">Une fois le tableau rempli et signé, scannez-le (ou prenez-le en photo avec l’iPhone) et déposez-le ici. Il reste dans le dossier du fournisseur, avec sa date, pour vérifier ses tarifs à tout moment. Jamais visible sur le site.</p>
        <form id="vtSf" class="vt-drop"><label class="vt-zone" data-vtzone><input type="file" name="fichier" accept="application/pdf,image/*,.heic" required hidden data-vtfile><span class="vt-zi">⬆</span><b>Déposer le scan signé</b><small data-vtfn>PDF ou photo · cliquez ou glissez le fichier ici</small></label>
          <div class="g3"><label>Spécialité<select name="specialite">${L.specialites.map(s => `<option value="${esc(s.cle)}"${(f.specialites || [])[0] === s.cle ? ' selected' : ''}>${esc(s.nom)}</option>`).join('')}<option value="">Autre document</option></select></label><label>Signé le<input type="date" name="signeLe" value="${new Date().toLocaleDateString('sv-SE')}"></label><label>Note <small class="muted">(facultatif)</small><input name="note" maxlength="300" placeholder="ex. remise 5 % au-delà de 100 pièces"></label></div>
          <button class="btn vt-or" disabled data-vtenv>📎 Enregistrer dans le dossier</button></form>
        ${scans ? `<ul class="vt-scans">${scans}</ul>` : '<p class="muted vt-vide">Aucun document signé pour le moment.</p>'}
        ${(f.envois || []).length ? `<h3 class="vt-h3">✉ Grilles envoyées par e-mail</h3><ul class="vt-envois">${f.envois.slice().reverse().map(e => `<li><b>${esc(e.specialiteNom || nomSpe(e.specialite) || '')}</b> · le ${dateFr(e.at, { day: 'numeric', month: 'long', year: 'numeric' })} à ${esc(e.to)}${e.par ? ' par ' + esc(e.par) : ''}${e.test ? ' <span class="muted sm">(essai)</span>' : ''}</li>`).join('')}</ul>` : ''}
      </section>
      <section class="box vt-box"><h2>Coordonnées</h2><form id="vtFf">${formFournisseur(f, L.profils)}<div class="row"><button class="btn">Enregistrer la fiche</button><button type="button" class="btn ghost danger" data-vtdel>Supprimer la fiche</button></div></form></section>`);
  }
  ficheFournisseurTarifs.after = id => {
    const L = VT.liste;
    $('#vtFf')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const body = Object.fromEntries(new FormData(e.target));
        /* après l'enregistrement, la fiche se ferme : retour à Validation tarifs, directement sur le choix des produits (Jean-Luc, 2026-11-26) */
        let fini = '#/tarifs/grille';
        if (id === 'nouveau') {
          const r = await api(A + '/tarifs/fournisseurs', { method: 'POST', body });
          const cles = $$('[data-vtspk]').filter(c => c.checked).map(c => c.dataset.vtspk);
          if (cles.length) { await api(A + '/tarifs/fournisseurs/' + r.fournisseur.id + '/specialites', { method: 'POST', body: { cles } }); VT.spe = cles[0]; mem.set('mg_vt_spe', VT.spe); await api(A + '/tarifs/specialite/' + VT.spe, { method: 'PUT', body: { fournisseurId: r.fournisseur.id } }); toast('Fiche créée : voici ses produits.'); }
          else { toast('Fiche créée.'); fini = '#/tarifs'; }
        }
        else {
          await api(A + '/tarifs/fournisseurs/' + id, { method: 'PUT', body });
          const cles = $$('[data-vtspk]').filter(c => c.checked).map(c => c.dataset.vtspk);
          const perdues = (VT.fiche?.specialites || []).filter(c => !cles.includes(c));
          if (perdues.length && !confirm(`Retirer ce fournisseur de : ${perdues.map(c => L.specialites.find(s => s.cle === c)?.nom || c).join(', ')} ? Ses tarifs saisis pour ${perdues.length > 1 ? 'ces spécialités' : 'cette spécialité'} seront effacés.`)) { $$('[data-vtspk]').forEach(c => { if (perdues.includes(c.dataset.vtspk)) c.checked = true; }); return; }
          const r = await api(A + '/tarifs/fournisseurs/' + id + '/specialites', { method: 'POST', body: { cles } });
          /* on ouvre la spécialité qu'on vient de cocher, sinon une des siennes, avec sa grille */
          const cible = r.ajoutees[0] || (cles.includes(VT.spe) ? VT.spe : cles[0]);
          if (cible) { VT.spe = cible; mem.set('mg_vt_spe', cible); await api(A + '/tarifs/specialite/' + cible, { method: 'PUT', body: { fournisseurId: id } }); }
          toast(cible ? 'Fiche enregistrée : voici ses produits.' : 'Fiche enregistrée.');
          if (!cible) fini = '#/tarifs';
        }
        VT.liste = null; VT.allerProduits = true; location.hash = fini;
      } catch (err) { toast(err.message, true); }
    });
    $('[data-vtdel]')?.addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement cette fiche fournisseur ?')) return;
      try { await api(A + '/tarifs/fournisseurs/' + id, { method: 'DELETE' }); toast('Fiche supprimée.'); VT.liste = null; location.hash = '#/tarifs'; } catch (err) { toast(err.message, true); }
    });
    const inp = $('[data-vtfile]'), zone = $('[data-vtzone]');
    if (!inp) return;
    const choisi = () => { const x = inp.files[0]; $('[data-vtfn]').textContent = x ? `${x.name} · ${Math.max(1, Math.round(x.size / 1024)).toLocaleString('fr-FR')} Ko` : 'PDF ou photo · cliquez ou glissez le fichier ici'; zone.classList.toggle('ok', !!x); $('[data-vtenv]').disabled = !x; };
    inp.addEventListener('change', choisi);
    ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('sur'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, () => zone.classList.remove('sur')));
    zone.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) { inp.files = e.dataTransfer.files; choisi(); } });
    $('#vtSf').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target), sel = e.target.specialite;
      fd.append('specialiteNom', sel.value ? sel.options[sel.selectedIndex].text : '');
      const b = $('[data-vtenv]'); b.disabled = true; b.textContent = 'Envoi en cours…';
      try { await api(`${A}/tarifs/fournisseurs/${id}/scans`, { method: 'POST', form: fd }); toast('Document signé enregistré dans le dossier.'); VT.liste = null; render(); }
      catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '📎 Enregistrer dans le dossier'; }
    });
    $$('[data-vtrm]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Retirer ce document du dossier ?')) return;
      try { await api(`${A}/tarifs/fournisseurs/${id}/scans/${b.dataset.vtrm}`, { method: 'DELETE' }); toast('Document retiré.'); render(); } catch (err) { toast(err.message, true); }
    }));
  };

  /* ---------- statistiques (Jean-Luc, 2026-11-25) ----------
     Pour chaque univers de l'accueil, dans l'ordre des vignettes : marge moyenne du catalogue (même calcul que le pavé du Catalogue)
     et ce qui a été réellement vendu sur 12 mois (devis signés : CA HT, marge HT, courbe par mois). Calcul : server/statistiques.js */
  async function statistiques() {
    const s = await api(A + '/statistiques');
    cache.stats = s;
    const pctTxt = v => v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    const moisL = m => MOIS_C[+m.slice(5) - 1] + ' ' + m.slice(0, 4);
    const T = s.total, C = s.catalogueTotal;
    const photo = (u, cls) => u ? `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} st-sansphoto'}))">` : `<span class="${cls} st-sansphoto"></span>`;
    /* nombre animé : data-n = valeur finale (compte de 0 à la valeur à l'ouverture) */
    const anim = (v, fmt) => v == null ? '—' : `<span data-n="${v}" data-f="${fmt}">${fmt === 'e' ? eurosRond(v) : pctTxt(v)}</span>`;
    /* barres horizontales : marge moyenne du catalogue, une ligne par rubrique (et par spécialité de Saveurs du monde) */
    const barreCat = (x, sousL) => {
      const c = x.catalogue;
      const lab = c ? `${c.avecMarge} produit${c.avecMarge > 1 ? 's' : ''} avec prix d’achat${c.sansAchat ? ` · <a href="#/catalogue?sansmarge=1">${c.sansAchat} sans</a>` : ''}` : 'pas de prix d’achat sur les lieux';
      return `<li class="st-cr${sousL ? ' st-sous' : ''}" title="${esc(x.nom)} : ${c?.pct == null ? 'marge inconnue' : pctTxt(c.pct) + ' de marge moyenne'}">${photo(x.photo, 'st-av')}<span class="st-cn"><b>${esc(x.nom)}</b><small>${lab}</small></span>
        <span class="st-ct"><i class="st-gx" style="width:${c?.pct == null ? 0 : Math.max(1.5, Math.min(100, c.pct))}%"></i></span><span class="st-cv${c?.pct == null ? ' vide' : ''}">${pctTxt(c?.pct)}</span></li>`;
    };
    /* du plus fort au plus faible (Jean-Luc 2026-11-25) : rubriques triées par marge moyenne, et les spécialités de Saveurs du monde aussi, sous leur rubrique ; sans marge connue = en bas */
    const parMarge = L => L.slice().sort((a, b) => (b.catalogue?.pct ?? -1) - (a.catalogue?.pct ?? -1));
    const lignesCat = parMarge(s.rubriques).map(r => barreCat(r) + parMarge(r.sous || []).map(x => barreCat(x, true)).join('')).join('');
    /* courbe par mois : la barre = CA HT signé, la partie dorée = la marge HT */
    const histo = (v, grand) => {
      const max = Math.max(1, ...v.serie.map(x => x.venteHtCents));
      return `<div class="st-h${grand ? ' grand' : ''}" role="img" aria-label="Chiffre d’affaires HT et marge HT par mois">${v.serie.map((x, i) => `<span class="st-hb${i === v.serie.length - 1 ? ' cur' : ''}" style="--i:${i}" title="${moisL(x.mois)} : ${eurosRond(x.venteHtCents)} HT vendus · ${eurosRond(x.margeHtCents)} de marge"><span class="st-hc"><i class="ca" style="height:${x.venteHtCents ? Math.max(3, x.venteHtCents / max * 100) : 0}%"><i class="mg" style="height:${x.venteHtCents ? Math.max(0, Math.min(100, x.margeHtCents / x.venteHtCents * 100)) : 0}%"></i></i></span><em>${MOIS_C[+x.mois.slice(5) - 1].replace('.', '').slice(0, grand ? 5 : 1)}</em></span>`).join('')}</div>`;
    };
    /* une carte par rubrique, avec la photo de sa vignette */
    const carte = (x, parent) => {
      const v = x.ventes, c = x.catalogue;
      return `<article class="st-card${v.venteHtCents ? '' : ' st-rien'}"><header class="st-ph">${photo(x.photo, 'st-phi')}<h3>${parent ? `<small>${esc(parent)}</small>` : ''}${esc(x.nom)}</h3><span class="st-pill" title="Marge moyenne du catalogue">catalogue ${c ? pctTxt(c.pct) : '—'}</span></header>
        <div class="st-cb">${v.venteHtCents ? `<div class="st-nums"><span><b>${eurosRond(v.venteHtCents)}</b><small>vendus HT</small></span><span><b>${eurosRond(v.margeHtCents)}</b><small>de marge HT</small></span><span><b>${pctTxt(v.pct)}</b><small>marge réelle</small></span></div>${histo(v)}
        <p class="st-foot">${v.devis} devis signé${v.devis > 1 ? 's' : ''}${v.venteConnueHtCents < v.venteHtCents ? ` · marge connue sur ${Math.round(100 * v.venteConnueHtCents / v.venteHtCents)} % des ventes` : ''}</p>`
        : '<p class="st-foot">Aucun devis signé sur les 12 derniers mois.</p>'}</div></article>`;
    };
    const cartes = s.rubriques.flatMap(r => r.sous?.length ? [carte(r), ...r.sous.map(x => carte(x, r.nom))] : [carte(r)]).join('');
    /* sections repliables (Jean-Luc 2026-11-25) : le back-office se souvient de ce qui est replié (mémoire du navigateur) */
    const replie = statistiques.replie();
    const pli = (k, titre, corps, cls = '') => `<details class="db-card st-pli ${cls}" data-pli="${k}"${replie.includes(k) ? '' : ' open'}><summary class="db-h"><h2>${titre}</h2><span class="st-chev" aria-hidden="true"></span></summary><div class="st-pc">${corps}</div></details>`;
    const p1 = s.mois[0], p2 = s.mois[s.mois.length - 1];
    /* d'où viennent nos clients (Jean-Luc, 2026-11-26) : une ligne par origine du contact, 12 derniers mois */
    const S = s.sources || { lignes: [], total: {} }, maxCa = Math.max(1, ...S.lignes.map(x => x.caTtcCents)), maxDm = Math.max(1, ...S.lignes.map(x => x.demandes + x.devis));
    const blocSources = S.lignes.length ? `<p class="muted sm">Depuis le ${dateFr(S.depuis)} : demandes reçues et devis, rangés selon l’origine du contact (« Site » automatique pour les demandes du site ; à la main, sur la fiche client, la demande ou le devis). Montants TTC des devis signés.</p>
      <div class="table"><table class="src-t"><thead><tr><th>Origine</th><th class="n">Demandes</th><th class="n">Devis envoyés</th><th class="n">Signés</th><th class="n">Taux</th><th>Signé TTC</th></tr></thead><tbody>
      ${S.lignes.map(x => `<tr${x.source ? '' : ' class="src-vide"'}><td>${x.source ? `<a href="#/clients" data-stsrc="${esc(x.source)}" title="Voir les contacts de cette origine">${pillSource(x.source)}</a>` : '<span class="muted">Non renseignée</span>'}<i class="src-bar" style="width:${Math.round(100 * (x.demandes + x.devis) / maxDm)}%"></i></td><td class="n">${x.demandes}</td><td class="n">${x.envoyes}</td><td class="n">${x.signes}</td><td class="n">${x.taux == null ? '—' : x.taux + ' %'}</td><td><b>${euros(x.caTtcCents)}</b><i class="src-bar or" style="width:${Math.round(100 * x.caTtcCents / maxCa)}%"></i></td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="n">${S.total.demandes}</td><td class="n">${S.total.envoyes}</td><td class="n">${S.total.signes}</td><td class="n">${S.total.envoyes ? Math.round(100 * S.total.signes / S.total.envoyes) + ' %' : '—'}</td><td><b>${euros(S.total.caTtcCents)}</b></td></tr></tbody></table></div>${S.lignes.some(x => !x.source) ? '<p class="muted sm">« Non renseignée » : indiquez l’origine sur la fiche du client (« Origine du contact ») ou sur le devis.</p>' : ''}`
      : '<div class="db-vide"><p>Aucune demande ni devis sur les 12 derniers mois.</p></div>';
    return `<div class="db st">
      <section class="db-hero st-hero"><div class="db-hero-in">
        <p class="db-jour">${moisL(p1)} → ${moisL(p2)}${s.siennes ? ' · vos devis' : ''}</p>
        <h1>Statistiques</h1>
        <p class="db-resume">Ce que rapporte chaque univers du site, dans l’ordre des vignettes de l’accueil. Montants hors taxes, marge = prix de vente − prix d’achat.</p></div>
        <div class="st-kpis">
          <span><b>${anim(C.pct, 'p')}</b><small>marge moyenne du catalogue</small></span>
          <span><b>${anim(T.venteHtCents, 'e')}</b><small>vendus HT en 12 mois</small></span>
          <span><b>${anim(T.margeHtCents, 'e')}</b><small>de marge HT · ${pctTxt(T.pct)}</small></span>
        </div></section>
      <div class="st-outils"><button type="button" class="st-tc" data-stplier="1">▴ Tout replier</button><button type="button" class="st-tc" data-stplier="0">▾ Tout déplier</button></div>
      <div class="st-duo">
        ${pli('classement', '🏆 Le classement', `<div class="st-tri">${[['e', 'Marge en €'], ['r', 'Marge réelle %'], ['c', 'Marge catalogue %']].map(([k, l]) => `<button type="button" class="st-tc${(statistiques.tri || 'e') === k ? ' on' : ''}" data-sttri="${k}" aria-pressed="${(statistiques.tri || 'e') === k}">${l}</button>`).join('')}</div>
          <ol class="st-rank" data-strank></ol>`, 'st-podium')}
        ${pli('mois', `${ico('euro')} Ventes signées par mois`, `${T.venteHtCents ? histo(T, true) : '<div class="db-vide"><p>Aucun devis signé sur les 12 derniers mois : les courbes se rempliront avec les premières signatures.</p></div>'}
          <p class="st-leg"><span><i class="ca"></i>Chiffre d’affaires HT</span><span><i class="mg"></i>dont marge HT</span></p>`, 'st-mois')}
      </div>
      ${pli('historique', '📜 Historique commercial depuis 2017', blocHistorique(s.historique), 'st-hist')}
      ${pli('sources', '🧭 D’où viennent nos clients', blocSources)}
      ${pli('produits', '⭐ Meilleurs produits', `<div class="st-tri">${[['p', 'Marge %'], ['ca', 'Chiffre d’affaires'], ['m', 'Marge en €'], ['f', 'Marge la plus faible']].map(([k, l]) => `<button type="button" class="st-tc${(statistiques.triP || 'p') === k ? ' on' : ''}" data-sttrip="${k}" aria-pressed="${(statistiques.triP || 'p') === k}">${l}</button>`).join('')}
          <select class="st-sel" data-strubp aria-label="Rubrique"><option value="">Toutes les rubriques</option>${[...new Set((s.produits || []).map(x => x.rubrique).filter(Boolean))].map(n => `<option${statistiques.rubP === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
          <label class="st-loupe"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input type="search" data-stqp placeholder="Rechercher un produit…" aria-label="Rechercher un produit" value="${esc(statistiques.qP || '')}" autocomplete="off"></label></div>
          <p class="muted sm" data-stpinfo></p><ol class="st-rank st-prods" data-stprods></ol><div class="st-plus" data-stplus></div>`)}
      ${pli('rubriques', 'Marge moyenne du catalogue par rubrique', `<p class="muted sm">Moyenne des marges des produits visibles qui ont un prix d’achat, en % du prix de vente HT (le même calcul que le pavé « marge moyenne » du Catalogue), <b>de la meilleure à la plus faible</b>. <a href="#/catalogue">Ouvrir le Catalogue →</a></p>
        <ul class="st-cl">${lignesCat}</ul>`)}
      ${pli('rapporte', 'Ce que chaque rubrique rapporte', `<p class="st-leg st-leg0"><span><i class="ca"></i>CA HT par mois</span><span><i class="mg"></i>dont marge</span></p>
        <div class="st-grid">${cartes}</div>
        <p class="muted sm st-note">Devis signés, au mois de la signature. Un produit rangé dans deux rubriques (par exemple une chaise dans « Indispensables » et « Mobilier et matériel à la location ») compte dans les deux ; le total du haut le compte une seule fois.${s.autres.venteHtCents ? ` Livraison, packs et lignes hors catalogue : ${eurosRond(s.autres.venteHtCents)} HT.` : ''}</p>`, 'st-rapp')}
    </div>`;
  }
  /* ---------- historique commercial de l'ancien CRM (Teamleader), Jean-Luc 2026-11-26 ----------
     CA HT par année (et marge quand elle est connue), sources, commerciaux, événements, lieux, motifs de refus, meilleurs clients,
     clients à relancer. Calcul : server/historique.js (statistiques). */
  /* Jean-Luc (2026-11-26) : « reste dû » et « taux de signature » masqués pour l'instant, à réactiver en 2027
     (les données restent en base : passer ces deux réglages à true suffit) */
  const HISTO_RESTE_DU = false, HISTO_TAUX = false;
  function blocHistorique(H) {
    if (!H) return `<div class="db-vide"><p>Importez l’export des affaires de l’ancien CRM pour voir ici le chiffre d’affaires année par année, les sources, les commerciaux, les meilleurs clients et les clients à relancer.</p>${peut('fichiers') ? '<p><a class="btn" href="#/clients/historique">📜 Importer l’historique commercial</a></p>' : ''}</div>`;
    const T = H.total || { commandes: 0, perdues: 0, caHtCents: 0, panierHtCents: 0, clients: 0, recurrents: 0, taux: null, nonFacturees: 0 }, F = H.factures, n = v => (v || 0).toLocaleString('fr-FR');
    const pc = v => v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    const maxCa = Math.max(1, ...H.parAn.map(x => x.caHtCents));
    const barres = `<div class="st-h grand hs-ans" role="img" aria-label="Chiffre d’affaires HT signé par année">${H.parAn.map((x, i) => `<span class="st-hb${i === H.parAn.length - 1 ? ' cur' : ''}" style="--i:${i}" title="${x.an} : ${eurosRond(x.caHtCents)} HT signés · ${n(x.commandes)} commandes${x.margeHtCents != null ? ' · marge ' + eurosRond(x.margeHtCents) : ''}"><b class="hs-v">${x.caHtCents ? (x.caHtCents / 1e8).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M€' : ''}</b><span class="st-hc"><i class="ca" style="height:${Math.max(3, x.caHtCents / maxCa * 100)}%"><i class="mg" style="height:${x.margeHtCents != null && x.caHtCents ? Math.max(0, Math.min(100, x.margeHtCents / x.caHtCents * 100)) : 0}%"></i></i></span><em>${x.an}</em></span>`).join('')}</div>
      <p class="st-leg"><span><i class="ca"></i>Chiffre d’affaires HT signé</span><span><i class="mg"></i>dont marge HT (saisie à partir de 2020)</span></p>`;
    const tableAns = `<div class="hs-wrap"><table class="hs-t"><thead><tr><th>Année</th><th class="n">Commandes</th><th class="n">Clients</th><th class="n">CA HT signé</th><th class="n">Panier moyen</th><th class="n">Marge</th>${T.perdues && HISTO_TAUX ? '<th class="n">Perdues</th><th class="n">Taux de signature</th>' : ''}</tr></thead><tbody>${H.parAn.slice().reverse().map(x => `<tr><td><b>${x.an}</b></td><td class="n">${n(x.commandes)}</td><td class="n">${n(x.clients)}</td><td class="n"><b>${eurosRond(x.caHtCents)}</b></td><td class="n">${eurosRond(x.panierHtCents)}</td><td class="n">${x.margePct == null ? '—' : pc(x.margePct)}</td>${T.perdues && HISTO_TAUX ? `<td class="n">${n(x.perdues)}</td><td class="n">${x.taux == null ? '—' : x.taux + ' %'}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
    /* classements : sources, commerciaux, événements, lieux (une ligne cliquable ouvre les contacts correspondants) */
    const groupe = (L, crit, ansG = H.ans) => {
      const max = Math.max(1, ...L.map(x => x.caHtCents));
      return `<div class="hs-wrap"><table class="hs-t hs-g"><thead><tr><th></th><th class="n">${crit === 'fac' ? 'Factures' : 'Commandes'}</th><th class="n">CA HT</th><th class="n">Panier moyen</th>${T.perdues && HISTO_TAUX ? '<th class="n">Taux</th>' : ''}<th class="hs-sp">${esc(ansG[0] || '')} → ${esc(ansG[ansG.length - 1] || '')}</th></tr></thead><tbody>${L.filter(x => x.commandes || x.perdues).map(x => { const vals = ansG.map(a => x.parAn[a] || 0), mx = Math.max(1, ...vals); return `<tr><td>${crit && crit !== 'fac' && x.nom ? `<a href="#/clients" data-hsk="${crit}" data-hsv="${esc(x.nom)}" title="Voir ces contacts">${esc(x.nom)}</a>` : esc(x.nom || 'Non renseigné')}<i class="src-bar or" style="width:${Math.round(100 * x.caHtCents / max)}%"></i></td><td class="n">${n(x.commandes)}</td><td class="n"><b>${eurosRond(x.caHtCents)}</b></td><td class="n">${eurosRond(x.panierHtCents)}</td>${T.perdues && HISTO_TAUX ? `<td class="n">${x.taux == null ? '—' : x.taux + ' %'}</td>` : ''}<td class="hs-sp"><span class="hs-spark" aria-hidden="true">${vals.map(v => `<i style="height:${Math.max(v ? 8 : 2, v / mx * 100)}%"></i>`).join('')}</span></td></tr>`; }).join('')}</tbody></table></div>`;
    };
    const motifs = H.motifs.length ? `<ul class="hs-mot">${H.motifs.map(m => `<li><span>${esc(m.nom)}</span><i class="src-bar" style="width:${Math.round(100 * m.nb / H.motifs[0].nb)}%"></i><b>${n(m.nb)}</b></li>`).join('')}</ul>` : '<div class="db-vide"><p>Pas encore de motifs de refus : l’export importé ne contient que des affaires signées. Exportez aussi les affaires <b>perdues</b> de Teamleader (avec la colonne « Motif du refus ») et déposez-les dans Contacts › 📜 Importer l’historique commercial.</p></div>';
    const ligneClient = (c, extra) => `<li class="hs-c">${c.id ? `<a class="hs-cn" href="#/clients/${esc(c.id)}">` : '<span class="hs-cn">'}<b>${esc(c.nom || '—')}</b><small>${esc([c.societe, c.tel, c.email].filter(Boolean).join(' · '))}</small>${c.id ? '</a>' : '</span>'}<span class="hs-cm">${extra}</span><span class="hs-ca"><b>${eurosRond(c.caHtCents)}</b><small>${c.commandes} commande${c.commandes > 1 ? 's' : ''}</small></span></li>`;
    const meilleurs = `<ol class="hs-cl">${H.meilleurs.slice(0, 30).map((c, i) => ligneClient(c, `<span class="st-rn">${['🥇', '🥈', '🥉'][i] || i + 1}</span> ${esc(c.types.slice(0, 3).join(', '))}${c.derniere ? ' · dernière le ' + dateFr(c.derniere) : ''}`)).join('')}</ol>`;
    const quand = d => d === 0 ? '<b>aujourd’hui</b>' : d === 1 ? '<b>demain</b>' : `dans <b>${d} jours</b>`;
    const reviennent = H.reviennent.length ? `<p class="muted sm">Leur événement a eu lieu à cette période de l’année (anniversaire, fête d’entreprise, gala…) et rien n’est prévu depuis : le bon moment pour les rappeler.</p><ol class="hs-cl">${H.reviennent.map(c => ligneClient(c, `🔔 ${quand(c.dans)} · ${esc(c.evtType || 'événement')}${c.evtAge ? ' ' + esc(c.evtAge) + ' ans' : ''} le ${dateFr(c.evtPasse)} (${eurosRond(c.evtHtCents)} HT)`)).join('')}</ol>` : '<div class="db-vide"><p>Aucun dans les 60 prochains jours.</p></div>';
    const endormis = H.endormis.length ? `<p class="muted sm">Clients qui ont commandé au moins 2 fois, mais plus rien depuis plus d’un an. <a href="#/clients" data-hsk="relance" class="lnk">Voir les ${n(H.endormis.length)} dans Contacts (pour un e-mail ou un SMS groupé) →</a></p><ol class="hs-cl">${H.endormis.map(c => ligneClient(c, `💤 dernière commande le ${dateFr(c.derniere)} · ${esc(c.types.slice(0, 2).join(', '))}`)).join('')}</ol>` : '<div class="db-vide"><p>Aucun client fidèle endormi.</p></div>';
    const blocFactures = !F ? '' : `<div class="st-kpis hs-kpis"><span><b>${eurosRond(F.total.netHtCents)}</b><small>facturés HT (avoirs déduits) · ${n(F.total.factures)} factures depuis ${dateFr(F.total.depuis, { month: 'short', year: 'numeric' })}</small></span><span><b>${eurosRond(F.total.payeCents)}</b><small>encaissés TTC</small></span>${HISTO_RESTE_DU ? `<span><b class="hs-dn">${eurosRond(F.total.duCents)}</b><small>reste dû TTC · ${n(F.total.impayees)} factures pas soldées</small></span>` : ''}</div>
      <h3 class="hs-h3">Par année (date de la facture)</h3><div class="hs-wrap"><table class="hs-t"><thead><tr><th>Année</th><th class="n">Factures</th><th class="n">Facturé HT</th><th class="n">Facturé TTC</th><th class="n">Encaissé TTC</th>${HISTO_RESTE_DU ? '<th class="n">Reste dû</th><th class="n">Pas soldées</th>' : ''}</tr></thead><tbody>${F.parAn.slice().reverse().map(x => `<tr><td><b>${x.an}</b></td><td class="n">${n(x.factures)}</td><td class="n"><b>${eurosRond(x.netHtCents)}</b></td><td class="n">${eurosRond(x.netTtcCents)}</td><td class="n">${eurosRond(x.payeCents)}</td>${HISTO_RESTE_DU ? `<td class="n">${x.duCents ? `<span class="hs-dn">${eurosRond(x.duCents)}</span>` : '—'}</td><td class="n">${x.impayees || '—'}</td>` : ''}</tr>`).join('')}</tbody></table></div>
      <h3 class="hs-h3">Par société qui facture</h3>${groupe(F.entites, 'fac', F.ans)}
      ${HISTO_RESTE_DU ? `<h3 class="hs-h3">💶 Factures pas soldées (${n(F.impayees.length)})</h3><p class="muted sm">Les plus récentes d’abord. Vérifiez dans votre comptabilité avant de relancer : une facture ancienne peut avoir été réglée autrement ou passée en perte.</p>
      <ol class="hs-cl">${F.impayees.map(f => `<li class="hs-c">${f.id ? `<a class="hs-cn" href="#/clients/${esc(f.id)}">` : '<span class="hs-cn">'}<b>${esc(f.nom || '—')}</b><small>${esc([f.societe, f.tel, f.email].filter(Boolean).join(' · '))}</small>${f.id ? '</a>' : '</span>'}<span class="hs-cm">Facture ${esc(f.numero)} du ${dateFr(f.date)} · ${esc(f.entite || '')}${f.oppTitre ? ' · ' + esc(f.oppTitre) : ''}${f.rappels ? ` · ${f.rappels} rappel${f.rappels > 1 ? 's' : ''}` : ''}</span><span class="hs-ca"><b class="hs-dn">${eurosRond(f.duCents)}</b><small>sur ${eurosRond(f.ttcCents)} TTC</small></span></li>`).join('')}</ol>` : ''}`;
    const onglets = [['mois', '📅 Par mois (comparer)', '<div data-hsmois></div>'], ...(F ? [['factures', HISTO_RESTE_DU ? `💶 Factures et impayés (${n(F.total.impayees)})` : '💶 Factures', blocFactures]] : []), ...(H.vide ? [] : [['ans', '📈 Par année', barres + tableAns], ['sources', '🧭 Sources', groupe(H.sources, 'canal')], ['commerciaux', '👤 Commerciaux', groupe(H.commerciaux, 'hcom')], ['evenements', '🎉 Événements', groupe(H.evenements, 'hevt')], ['lieux', '📍 Lieux', groupe(H.lieux, '')], ...(HISTO_TAUX || H.motifs.length ? [['motifs', '✕ Motifs de refus', motifs]] : []), ['meilleurs', '🏆 Meilleurs clients', meilleurs], ['reviennent', `🔔 À relancer : la date revient (${H.reviennent.length})`, reviennent], ['endormis', `💤 Fidèles endormis (${H.endormis.length})`, endormis]])];
    const on = statistiques.hOng || 'mois';
    return `<div class="st-kpis hs-kpis">${H.vide ? '' : `<span><b><span data-n="${T.caHtCents}" data-f="e">${eurosRond(T.caHtCents)}</span></b><small>signés HT (affaires) · ${dateFr(T.depuis, { month: 'short', year: 'numeric' })} → ${dateFr(T.jusque, { month: 'short', year: 'numeric' })}</small></span>`}${F ? `<span><b>${eurosRond(F.total.netHtCents)}</b><small>facturés HT (factures)</small></span>${HISTO_RESTE_DU ? `<span><b class="hs-dn">${eurosRond(F.total.duCents)}</b><small>reste dû TTC</small></span>` : ''}` : ''}${H.vide ? '' : `<span><b>${n(T.commandes)}</b><small>commandes · panier moyen ${eurosRond(T.panierHtCents)} HT</small></span><span><b>${n(T.clients)}</b><small>clients · ${n(T.recurrents)} ont commandé plusieurs fois</small></span>${HISTO_TAUX ? `<span><b>${T.taux == null ? '—' : T.taux + ' %'}</b><small>${T.taux == null ? 'taux de signature (il manque les affaires perdues)' : 'taux de signature'}</small></span>` : ''}`}</div>
      ${F && !H.vide ? '<p class="muted sm">Deux chiffres à ne pas additionner : le <b>signé</b> vient des affaires (ce que l’équipe a vendu, au mois de la signature), le <b>facturé</b> vient des factures (au mois de la facture, avoirs déduits).</p>' : ''}
      <div class="st-tri hs-ong" role="tablist">${onglets.map(([k, l]) => `<button type="button" class="st-tc${on === k ? ' on' : ''}" data-hsong="${k}" role="tab" aria-selected="${on === k}">${l}</button>`).join('')}</div>
      ${onglets.map(([k, , c]) => `<div class="hs-pane" data-hspane="${k}"${on === k ? '' : ' hidden'}>${c}</div>`).join('')}
      ${!H.vide && T.nonFacturees ? `<p class="muted sm st-note">${n(T.nonFacturees)} commandes signées sont marquées « non facturées » dans l’ancien CRM (souvent des annulations) : elles comptent dans le chiffre signé.</p>` : ''}`;
  }
  /* CA par mois (Jean-Luc, 2026-11-26 : « très important pour faire des comparaisons ») :
     deux années côte à côte mois par mois, écart, cumul depuis janvier à la même date, et le tableau de toutes les années */
  statistiques.hMois = () => {
    const H = cache.stats?.historique, el = $('[data-hsmois]'); if (!H || !el) return;
    const F = H.factures, bases = [...(H.vide ? [] : [['sig', 'Signé (mois de la signature)'], ['evt', 'Signé (mois de l’événement)']]), ...(F ? [['fac', 'Facturé (mois de la facture)']] : [])];
    const base = bases.some(b => b[0] === statistiques.hBase) ? statistiques.hBase : bases[0][0], L = base === 'fac' ? F.parMois : base === 'evt' ? H.parMoisEvt : H.parMois;
    if (!L?.length) { el.innerHTML = '<div class="db-vide"><p>Aucune commande.</p></div>'; return; }
    const ans = L.map(x => x.an), auj = H.aujourdHui || new Date().toISOString().slice(0, 10), anCour = auj.slice(0, 4), moisCour = +auj.slice(5, 7);
    const a1 = ans.includes(statistiques.hA1) ? statistiques.hA1 : ans.includes(anCour) ? anCour : ans[ans.length - 1];
    const a2 = ans.includes(statistiques.hA2) ? statistiques.hA2 : ans[Math.max(0, ans.indexOf(a1) - 1)];
    const D = Object.fromEntries(L.map(x => [x.an, x.mois]));
    const M1 = D[a1], M2 = D[a2] || M1;
    const max = Math.max(1, ...M1.map(m => m.caHtCents), ...M2.map(m => m.caHtCents));
    const ecart = (x, y) => !y ? (x ? '<span class="hs-up">nouveau</span>' : '—') : (() => { const p = Math.round(100 * (x - y) / y); return `<span class="${p >= 0 ? 'hs-up' : 'hs-dn'}">${p > 0 ? '+' : ''}${p} %</span>`; })();
    const sel = (k, v) => `<select class="st-sel" data-hsan="${k}" aria-label="Année">${ans.slice().reverse().map(a => `<option${a === v ? ' selected' : ''}>${a}</option>`).join('')}</select>`;
    /* cumul depuis janvier à la même date : pour l'année en cours, jusqu'au mois en cours */
    const jusque = a1 === anCour ? moisCour : 12;
    const c1 = M1[jusque - 1].cumulHtCents, c2 = M2[jusque - 1].cumulHtCents;
    const MOISL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const groupes = `<div class="hs-cmp" role="img" aria-label="Chiffre d’affaires HT par mois : ${a1} comparé à ${a2}">${M1.map((m, i) => `<span class="hs-cm${a1 === anCour && i + 1 === moisCour ? ' cur' : ''}" title="${MOISL[i]} ${a1} : ${eurosRond(m.caHtCents)} HT (${m.commandes} commandes) · ${MOISL[i]} ${a2} : ${eurosRond(M2[i].caHtCents)} HT"><span class="hs-cb"><i class="b2" style="height:${M2[i].caHtCents / max * 100}%"></i><i class="b1" style="height:${m.caHtCents / max * 100}%"></i></span><em>${MOIS_C[i]}</em></span>`).join('')}</div>
      <p class="st-leg"><span><i class="b1"></i>${a1}</span><span><i class="b2"></i>${a2}</span></p>`;
    const table = `<div class="hs-wrap"><table class="hs-t"><thead><tr><th>Mois</th><th class="n">${a1}</th><th class="n">${a2}</th><th class="n">Écart</th><th class="n">Cumul ${a1}</th><th class="n">Cumul ${a2}</th><th class="n">Écart</th></tr></thead><tbody>${M1.map((m, i) => `<tr${a1 === anCour && i + 1 === moisCour ? ' class="hs-cur"' : ''}><td><b>${MOISL[i]}</b></td><td class="n"><b>${eurosRond(m.caHtCents)}</b><small>${m.commandes} ${base === 'fac' ? 'fact.' : 'cmd'}</small></td><td class="n">${eurosRond(M2[i].caHtCents)}<small>${M2[i].commandes} ${base === 'fac' ? 'fact.' : 'cmd'}</small></td><td class="n">${ecart(m.caHtCents, M2[i].caHtCents)}</td><td class="n">${a1 === anCour && i + 1 > moisCour ? '—' : eurosRond(m.cumulHtCents)}</td><td class="n">${eurosRond(M2[i].cumulHtCents)}</td><td class="n">${a1 === anCour && i + 1 > moisCour ? '—' : ecart(m.cumulHtCents, M2[i].cumulHtCents)}</td></tr>`).join('')}</tbody></table></div>`;
    /* toutes les années : un tableau mois × année, plus la case est foncée, plus le mois a rapporté */
    const tout = Math.max(1, ...L.flatMap(x => x.mois.map(m => m.caHtCents)));
    const ansR = ans.slice().reverse();
    const carte = `<div class="hs-wrap"><table class="hs-t hs-heat"><thead><tr><th>Mois</th>${ansR.map(a => `<th class="n">${a}</th>`).join('')}</tr></thead><tbody>${MOISL.map((ml, i) => `<tr><td><b>${MOIS_C[i]}</b></td>${ansR.map(a => { const v = D[a][i].caHtCents; return `<td class="n" style="--h:${(v / tout).toFixed(3)}" title="${ml} ${a} : ${eurosRond(v)} HT · ${D[a][i].commandes} commandes">${v ? Math.round(v / 100000).toLocaleString('fr-FR') + ' k€' : '—'}</td>`; }).join('')}</tr>`).join('')}<tr class="tot"><td>Total</td>${ansR.map(a => `<td class="n">${Math.round(D[a][11].cumulHtCents / 100000).toLocaleString('fr-FR')} k€</td>`).join('')}</tr></tbody></table></div>`;
    el.innerHTML = `<div class="hs-bar"><span class="st-tri">${bases.map(([k, l]) => `<button type="button" class="st-tc${base === k ? ' on' : ''}" data-hsbase="${k}" aria-pressed="${base === k}">${l}</button>`).join('')}</span><span class="hs-vs">Comparer ${sel('1', a1)} avec ${sel('2', a2)}</span></div>
      <div class="st-kpis hs-kpis hs-cumul"><span><b>${eurosRond(c1)}</b><small>${a1} · de janvier à fin ${MOISL[jusque - 1]}${a1 === anCour ? ' (mois en cours compris)' : ''}</small></span><span><b>${eurosRond(c2)}</b><small>${a2} · même période</small></span><span><b>${ecart(c1, c2)}</b><small>d’une année à l’autre</small></span></div>
      ${groupes}${table}
      <h3 class="hs-h3">Toutes les années, mois par mois (HT, en milliers d’euros)</h3>${carte}
      <p class="muted sm st-note">${base === 'fac' ? 'Factures rangées au mois de la facture, avoirs déduits : le chiffre facturé ce mois-là (toutes sociétés : JLB Event, Magnolia Traiteur, Liam Event…).' : base === 'evt' ? 'Rangé au mois de l’événement : le chiffre réellement réalisé ce mois-là (les événements à venir déjà signés sont comptés dans leur mois).' : 'Rangé au mois de la signature (date acceptée) : le chiffre vendu ce mois-là par l’équipe.'} Ancien CRM (Teamleader), montants hors taxes.</p>`;
    $$('[data-hsbase]', el).forEach(b => b.addEventListener('click', () => { statistiques.hBase = b.dataset.hsbase; statistiques.hMois(); }));
    $$('[data-hsan]', el).forEach(x => x.addEventListener('change', () => { statistiques['hA' + x.dataset.hsan] = x.value; statistiques.hMois(); }));
  };
  /* classement : Saveurs du monde est remplacée par ses spécialités (Buffet antillais, Paëlla party…) */
  statistiques.classement = () => {
    const s = cache.stats, el = $('[data-strank]'); if (!s || !el) return;
    const tri = statistiques.tri || 'e';
    const L = s.rubriques.flatMap(r => r.sous?.length ? r.sous : [r]);
    const val = x => tri === 'e' ? x.ventes.margeHtCents : tri === 'r' ? x.ventes.pct : x.catalogue?.pct;
    const R = L.filter(x => val(x) != null && val(x) > 0).sort((a, b) => val(b) - val(a)).slice(0, 8);
    const max = Math.max(1, ...R.map(val));
    const fmt = v => tri === 'e' ? eurosRond(v) : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    const pc = v => v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    const det = x => tri === 'e' ? `${eurosRond(x.ventes.venteHtCents)} vendus · ${pc(x.ventes.pct)}` : tri === 'r' ? `${eurosRond(x.ventes.margeHtCents)} sur ${eurosRond(x.ventes.venteHtCents)} vendus` : `${x.catalogue.avecMarge} produit${x.catalogue.avecMarge > 1 ? 's' : ''} avec prix d’achat`;
    el.innerHTML = R.length ? R.map((x, i) => `<li class="st-ri${i < 3 ? ' top' : ''}" style="--i:${i}"><span class="st-rn">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${x.photo ? `<img class="st-av" src="${esc(x.photo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'st-av st-sansphoto'}))">` : '<span class="st-av st-sansphoto"></span>'}<span class="st-rt"><b>${esc(x.nom)}</b><small>${esc(det(x))}</small><span class="st-rb"><i style="width:${Math.max(3, val(x) / max * 100)}%"></i></span></span><span class="st-rv">${fmt(val(x))}</span></li>`).join('')
      : `<li class="db-vide"><p>${tri === 'c' ? 'Aucun prix d’achat saisi pour le moment.' : 'Le classement se remplira avec les premiers devis signés.'}</p></li>`;
  };
  statistiques.replie = () => { try { return JSON.parse(mem.get('mg_st_replie') || '[]'); } catch { return []; } };
  /* meilleurs produits : marge % du catalogue (pour l'instant), puis chiffre d'affaires quand les devis signés arriveront */
  statistiques.produits = () => {
    const s = cache.stats, el = $('[data-stprods]'); if (!s || !el) return;
    const tri = statistiques.triP || 'p', rub = statistiques.rubP || '', nb = statistiques.nbP || 20;
    const val = x => tri === 'p' || tri === 'f' ? x.pct : tri === 'ca' ? x.venteHtCents : x.margeHtCents;
    const L = (s.produits || []).filter(x => (!rub || x.rubrique === rub) && val(x) != null && (tri === 'f' || tri === 'p' || val(x) > 0))
      .sort((a, b) => tri === 'f' ? val(a) - val(b) : val(b) - val(a));
    const max = Math.max(1, ...L.map(x => Math.abs(val(x))));
    /* loupe (Jean-Luc 2026-11-25) : filtre par nom ou rubrique, chaque produit garde son rang dans le classement */
    const q = sansAccent(statistiques.qP || '').trim(), mots = q.split(/\s+/).filter(Boolean);
    const V = L.map((x, i) => ({ x, i })).filter(({ x }) => !mots.length || mots.every(m => sansAccent(x.titre + ' ' + x.rubrique).includes(m)));
    const pc = v => v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
    const fmt = v => tri === 'p' || tri === 'f' ? pc(v) : eurosRond(v);
    const det = x => [x.rubrique, x.prixCents != null ? euros(x.prixCents) + (x.unite ? ' / ' + x.unite : '') : '', tri === 'ca' || tri === 'm' ? `${x.devis} devis · marge ${pc(x.pct)}` : x.venteHtCents ? eurosRond(x.venteHtCents) + ' vendus' : ''].filter(Boolean).join(' · ');
    const info = $('[data-stpinfo]');
    if (info) info.textContent = mots.length ? `${V.length} produit${V.length > 1 ? 's' : ''} trouvé${V.length > 1 ? 's' : ''} pour « ${statistiques.qP.trim()} », avec leur rang dans le classement.` : tri === 'p' || tri === 'f' ? `${L.length} produit${L.length > 1 ? 's' : ''} avec prix d’achat : marge en % du prix de vente HT.` : `Devis signés des 12 derniers mois, hors taxes : ${L.length} produit${L.length > 1 ? 's' : ''} vendu${L.length > 1 ? 's' : ''}.`;
    el.innerHTML = V.length ? V.slice(0, nb).map(({ x, i }) => `<li class="st-ri${i < 3 && tri !== 'f' ? ' top' : ''}${tri === 'f' && val(x) < 15 ? ' bas' : ''}" style="--i:${Math.min(i, 12)}"><span class="st-rn">${tri !== 'f' ? ['🥇', '🥈', '🥉'][i] || i + 1 : i + 1}</span>${x.photo ? `<img class="st-av" src="${esc(x.photo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'st-av st-sansphoto'}))">` : '<span class="st-av st-sansphoto"></span>'}<a class="st-rt" href="#/catalogue/${esc(x.slug)}"><b>${esc(x.titre)}</b><small>${esc(det(x))}</small><span class="st-rb"><i style="width:${Math.max(3, Math.abs(val(x)) / max * 100)}%"></i></span></a><span class="st-rv">${fmt(val(x))}</span></li>`).join('')
      : `<li class="db-vide"><p>${mots.length ? 'Aucun produit de ce classement ne correspond à cette recherche.' : tri === 'ca' || tri === 'm' ? 'Le chiffre d’affaires par produit apparaîtra avec les premiers devis signés. En attendant, le classement par marge % est à jour.' : 'Aucun produit avec prix d’achat dans cette rubrique.'}</p></li>`;
    const plus = $('[data-stplus]');
    if (plus) plus.innerHTML = V.length > nb ? `<button type="button" class="st-tc" data-stplusb>Voir ${Math.min(20, V.length - nb)} de plus (${V.length - nb} restants)</button>` : '';
    $('[data-stplusb]')?.addEventListener('click', () => { statistiques.nbP = nb + 20; statistiques.produits(); });
  };
  statistiques.after = () => {
    $$('[data-stsrc]').forEach(a => a.addEventListener('click', () => { CL.k = { canal: a.dataset.stsrc }; CL.page = 1; CL.q = ''; mem.set('mg_clmulti', '1'); }));
    /* historique : onglets, et liens vers les contacts correspondants */
    $$('[data-hsong]').forEach(b => b.addEventListener('click', () => { statistiques.hOng = b.dataset.hsong; $$('[data-hsong]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); $$('[data-hspane]').forEach(p => { p.hidden = p.dataset.hspane !== b.dataset.hsong; }); }));
    $$('[data-hsk]').forEach(a => a.addEventListener('click', () => { const k = a.dataset.hsk; CL.k = k === 'relance' ? { hcmd: '2', hder: 'plus12' } : { [k]: a.dataset.hsv, ...(k === 'canal' ? {} : { hcmd: 'oui' }) }; CL.tri = 'montant'; CL.sens = 'desc'; CL.page = 1; CL.q = ''; CL.vue = ''; mem.set('mg_clmulti', '1'); }));
    statistiques.classement();
    statistiques.produits();
    statistiques.hMois();
    const sauve = () => mem.set('mg_st_replie', JSON.stringify($$('[data-pli]').filter(d => !d.open).map(d => d.dataset.pli)));
    $$('[data-pli]').forEach(d => d.addEventListener('toggle', sauve));
    $$('[data-stplier]').forEach(b => b.addEventListener('click', () => { const r = b.dataset.stplier === '1'; $$('[data-pli]').forEach(d => { d.open = !r; }); sauve(); }));
    $$('[data-sttrip]').forEach(b => b.addEventListener('click', () => {
      statistiques.triP = b.dataset.sttrip; statistiques.nbP = 20;
      $$('[data-sttrip]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      statistiques.produits();
    }));
    $('[data-stqp]')?.addEventListener('input', e => { statistiques.qP = e.target.value; statistiques.nbP = 20; statistiques.produits(); });
    $('[data-strubp]')?.addEventListener('change', e => { statistiques.rubP = e.target.value; statistiques.nbP = 20; statistiques.produits(); });
    $$('[data-sttri]').forEach(b => b.addEventListener('click', () => {
      statistiques.tri = b.dataset.sttri;
      $$('[data-sttri]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      statistiques.classement();
    }));
    /* chiffres qui défilent jusqu'à leur valeur (rien si l'utilisateur a demandé moins d'animations) */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('.st [data-n]').forEach(e => {
      const fin = +e.dataset.n, f = e.dataset.f, t0 = performance.now(), D = 1100;
      const pas = t => { const k = Math.min(1, (t - t0) / D), v = fin * (1 - Math.pow(1 - k, 3)); e.textContent = f === 'e' ? eurosRond(Math.round(v)) : (Math.round(v * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %'; if (k < 1) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    });
  };

  /* ---------- demandes ---------- */
  /* règle de Jean-Luc : ici, seulement les demandes sur lesquelles personne n'est intervenu ; dès la première action
     (devis, e-mail, SMS, appel, note, rendez-vous, attribution), elles passent dans « Suivi client » */
  const aTraiter = (d, dv) => d.type !== 'contact' && !d.classee && !d.priseEnCharge && d.statut === 'demande' && !dv.some(x => x.demandeId === d.id);
  async function demandes(id) {
    if (id) return demande(id);
    const [list0, dv, R0, prods] = await Promise.all([api(A + '/demandes'), api(A + '/devis'), cache.R ? null : api(A + '/site').catch(() => null), cache.produits || api(A + '/produits').catch(() => null)]);
    if (R0) cache.R = R0; if (prods) cache.produits = prods;
    const chiffresDemande = d => { const x = dv.filter(v => v.demandeId === d.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); const m = x.find(v => v.statut === 'accepte') || x.find(v => v.statut === 'envoye') || x[0]; return m ? k4Html(chiffres(m), '#/devis/' + m.id) + `<small>devis n° ${esc(m.numero)}</small>` : (d.lignes || []).length ? k4Html(chiffres(d, { lignes: lignesDemande(d), ttc: d.totalEstimeCents })) + '<small>estimation du site</small>' : ''; };
    const autoOn = (cache.R || {}).devisAuto !== false;
    const list = list0.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    cache.devisL = dv;
    const todo = list.filter(d => aTraiter(d, dv)), msgs = list.filter(d => d.type === 'contact' && !d.classee), done = list.filter(d => !todo.includes(d) && !msgs.includes(d));
    cache.nouvelles = todo.length;
    const voir = demandes.voir || 'todo', shown = voir === 'done' ? done : voir === 'msg' ? msgs : todo;
    const tel = t => String(t || '').replace(/[^\d+]/g, '');
    const action = d => {
      if (d.type === 'contact') return `<button class="lnk sm" type="button" data-classer="${d.id}">Déjà traité : classer</button>`;
      const x = dv.filter(v => v.demandeId === d.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      return `${x ? `<a class="btn sm" href="#/devis/${x.id}">${x.statut === 'brouillon' ? 'Terminer le devis' : 'Ouvrir le devis'}</a>` : `<button class="btn sm" type="button" data-mk="${d.id}">Créer un devis</button><button class="btn ghost sm anc-btn" type="button" data-mkanc="${d.id}" title="Créer le devis en reprenant un ancien devis proche">📂 Ancien devis</button>`}${voir === 'todo' ? `<button class="lnk sm" type="button" data-classer="${d.id}">Déjà traitée : classer</button>` : ''}`;
    };
    const row = d => `<tr data-href="#/demandes/${d.id}"${d.statut === 'demande' && !d.vue ? ' class="new"' : ''}>
      <td>${new Date(d.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<small>${esc(d.ref)}</small>${pillSource(canalDe(d))}</td>
      <td><b>${esc(d.contact?.nom)}</b>${d.contact?.societe ? `<small class="ink">${esc(d.contact.societe)}</small>` : ''}<small>${esc(d.contact?.email)}${d.contact?.tel ? `<br><a href="tel:${esc(tel(d.contact.tel))}">${esc(d.contact.tel)}</a>` : ''}</small></td>
      <td>${d.type === 'contact' ? `<b>Message</b><small>${esc(d.sujet || '')}</small>` : `<b>${esc(d.evenement?.type || '—')}</b><small>${esc([d.evenement?.cp, d.evenement?.ville].filter(Boolean).join(' '))}${d.evenement?.horaire ? ' · ' + esc(d.evenement.horaire) : ''}</small>`}</td>
      <td>${d.evenement?.date ? dateFr(d.evenement.date, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</td>
      <td class="n">${d.evenement?.invites || '—'}</td>
      <td>${(d.lignes || []).length ? `<b>${d.lignes.length} prestation${d.lignes.length > 1 ? 's' : ''}</b> · ${euros(d.totalEstimeCents)}<small>${esc(d.lignes.slice(0, 3).map(l => l.titre).join(', '))}${d.lignes.length > 3 ? '…' : ''}</small>` : ''}${d.message ? `<small class="msg">${esc(String(d.message).slice(0, 160))}${String(d.message).length > 160 ? '…' : ''}</small>` : ''}</td>
      <td class="k4c">${d.type === 'contact' ? '' : chiffresDemande(d)}</td>
      <td class="act">${action(d)}${d.devisAuto && !d.devisAuto.envoye && (d.devisAuto.raisons || []).length ? `<small class="da-why" title="Pourquoi l’IA n’a pas envoyé le devis toute seule">À faire à la main : ${esc(d.devisAuto.raisons.slice(0, 2).join(' ; '))}${d.devisAuto.raisons.length > 2 ? '…' : ''}</small>` : ''}</td></tr>`;
    const onglet = (k, l, n) => `<button type="button" class="qs-chip${voir === k ? ' on' : ''}" data-voir="${k}">${l} <b>${n}</b></button>`;
    return page('Demandes de devis', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn anc-btn" href="#/devis/nouveau?anciens=1">📂 Partir d’un ancien devis</a><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', `
      <p class="muted intro">Les demandes envoyées depuis le site arrivent ici, avec une alerte par e-mail. Dès que quelqu’un s’en occupe (devis, e-mail, SMS, appel, note, rendez-vous ou attribution à un commercial), elles passent dans « Suivi client », à son nom.</p>
      <section class="box da-box"><label class="chk"><input type="checkbox" data-devisauto${autoOn ? ' checked' : ''}${peut('equipe') ? '' : ' disabled title="Réservé aux personnes qui gèrent l’équipe"'}> <b>✨ Envoi automatique des devis complets : ${autoOn ? 'activé' : 'désactivé'}</b></label><p class="muted sm">Quand une demande du site ne contient que des prestations du catalogue, avec leur prix, les quantités minimum, la date, le nombre d’invités, l’adresse et le téléphone, l’IA crée le devis et l’envoie aussitôt au client (e-mail et SMS), quel que soit le montant. L’équipe est prévenue par e-mail et SMS pour rappeler le client, et la demande passe dans « Suivi client ». Sinon, la demande reste ici, avec la raison.</p><div class="row da-sms"><label>📱 SMS « devis envoyé par l’IA » à ce(s) portable(s)<input type="tel" data-dasms value="${esc((cache.R || {}).devisAutoSms ?? '06 58 22 69 69')}" placeholder="06 12 34 56 78 (plusieurs : séparés par une virgule)"${peut('equipe') ? '' : ' disabled'}></label>${peut('equipe') ? '<button type="button" class="btn sm" data-dasmsok>Enregistrer</button>' : ''}</div></section>
      <div class="qs-top"><div class="qs-chips">${onglet('todo', 'À traiter', todo.length)}${onglet('msg', 'Messages', msgs.length)}${onglet('done', 'Déjà traitées', done.length)}</div></div>
      ${shown.length ? `<div class="table jp"><table><thead><tr><th>Reçue</th><th>Client</th><th>Événement</th><th>Date</th><th class="n">Invités</th><th>Sélection et message</th><th class="n">Montants 🔒</th><th></th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`
        : `<div class="vide"><p>${voir === 'todo' ? (list.length ? 'Aucune demande en attente : elles sont toutes prises en charge. Leur suivi est dans « Suivi client ».' : 'Aucune demande de devis pour l’instant.') : 'Rien ici pour l’instant.'}</p></div>`}`);
  }
  demandes.after = id => {
    if (id) return demande.after(id);
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; }));
    $$('[data-voir]').forEach(b => b.addEventListener('click', () => { demandes.voir = b.dataset.voir; render(); }));
    $('[data-dasmsok]')?.addEventListener('click', async () => {
      const v = $('[data-dasms]').value.trim();
      try { await api(A + '/site', { method: 'PUT', body: { devisAutoSms: v } }); if (cache.R) cache.R.devisAutoSms = v; toast(v ? 'Numéro enregistré : un SMS y partira à chaque devis envoyé par l’IA.' : 'Plus de SMS pour les devis envoyés par l’IA.'); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-devisauto]')?.addEventListener('change', async e => {
      const on = e.target.checked;
      try { await api(A + '/site', { method: 'PUT', body: { devisAuto: on } }); if (cache.R) cache.R.devisAuto = on; toast(on ? 'Envoi automatique activé.' : 'Envoi automatique désactivé : toutes les demandes attendront l’équipe.'); render(); }
      catch (err) { e.target.checked = !on; toast(err.message, true); }
    });
    $$('[data-mk]').forEach(b => b.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${b.dataset.mk}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; }));
    $$('[data-mkanc]').forEach(b => b.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${b.dataset.mkanc}`, { method: 'POST' }); location.hash = '#/devis/' + r.id + '?anciens=1'; }));
    $$('[data-classer]').forEach(b => b.addEventListener('click', async () => { const d = await api(`${A}/demandes/${b.dataset.classer}`); await api(`${A}/demandes/${d.id}`, { method: 'PUT', body: { ...d, classee: true } }); toast('Demande classée : elle reste visible dans « Déjà traitées ».'); render(); }));
  };
  async function demande(id) {
    const d = await api(A + '/demandes/' + id);
    const dv = (await api(A + '/devis')).filter(x => x.demandeId === id);
    cache.demande = d;
    return page(`${esc(d.ref)} · ${esc(d.contact?.nom)}`, `<a class="btn ghost" href="#/demandes">← Demandes</a>${d.type !== 'contact' ? `<button class="btn anc-btn" data-mkdevisanc>📂 Partir d’un ancien devis</button><button class="btn" data-mkdevis>${dv.length ? 'Nouveau devis' : 'Créer le devis'}</button>` : ''}`, `
      <div class="cols">
        <section class="box"><h2>Client</h2><p><b>${esc(d.contact?.nom)}</b>${d.contact?.societe ? '<br>' + esc(d.contact.societe) : ''}<br><a href="mailto:${esc(d.contact?.email)}">${esc(d.contact?.email)}</a><br><a href="tel:${esc(d.contact?.tel)}">${esc(d.contact?.tel)}</a></p><label class="src-lab">🧭 Origine du contact <small class="muted">(par où le client nous a trouvés)</small>${selSource('canal', canalDe(d), ' data-dmsrc')}</label><p><a class="lnk" href="#/clients/${d.clientId}">Fiche client → (corriger le nom, la société, l’e-mail ou le téléphone)</a></p></section>
        <section class="box"><h2>Événement</h2><p><b>${esc(d.evenement?.type)}</b> · ${dateFr(d.evenement?.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<br>${d.evenement?.invites || '?'} invités · ${esc(d.evenement?.cp)} ${esc(d.evenement?.ville)}<br>${esc(d.evenement?.horaire)}${d.livraison ? `<br>Livraison estimée : ${d.livraison.km} km A/R · ${d.livraison.horsZone ? 'hors Île-de-France, tarif à proposer' : d.livraison.offerte ? 'offerte' : euros(d.livraison.cents) + (d.livraison.kmCents != null ? ` (${euros(d.livraison.kmCents)}/km)` : '')}` : ''}</p></section>
        <section class="box"><h2>Suivi</h2><label>Statut<select data-statut>${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}"${d.statut === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <ul class="histo">${(d.historique || []).map(h => `<li>${dateH(h.at)} · ${STATUTS[h.statut] || h.statut}${h.statut === 'devis_envoye' && /^IA\b/.test(h.par || '') ? ' par <b>l’IA</b> ✨' : ''} <small>${/^IA\b/.test(h.par || '') ? '' : esc(h.par || '')}</small></li>`).join('')}</ul>${d.devisAuto ? `<p class="sm ${d.devisAuto.envoye ? 'ok' : 'muted'}">${d.devisAuto.envoye ? `✨ Devis ${esc(d.devisAuto.numero || '')} créé et envoyé automatiquement par l’IA dès la réception de la demande.` : `Pas d’envoi automatique : ${esc((d.devisAuto.raisons || []).join(' ; '))}.`}</p>` : ''}</section>
      </div>
      ${d.message ? `<section class="box"><h2>Message du client</h2><p class="pre">${esc(d.message)}</p></section>` : ''}
      ${(d.lignes || []).length ? `<section class="box"><h2>Sélection du client</h2><div class="table"><table><thead><tr><th>Prestation</th><th>Choix</th><th class="n">Qté</th><th class="n">Estimé</th></tr></thead><tbody>${d.lignes.map(l => `<tr><td><b>${titreHtml(l.titre)}</b>${l.variante ? `<small>${esc(l.variante)}</small>` : ''}</td><td>${esc(l.resume)}${l.personnel ? `<small>+ personnel ${l.personnel.nb} × ${l.personnel.heures} h</small>` : ''}${l.pack ? `<small>+ pack ${esc(l.pack.id)}</small>` : ''}${l.note ? `<small>Note : ${esc(l.note)}</small>` : ''}</td><td class="n">${l.qte} ${esc(l.unite)}</td><td class="n">${l.surDevis ? 'sur devis' : euros(l.totalCents)}</td></tr>`).join('')}<tr class="tot"><td colspan="3">Total estimé (livraison comprise)</td><td class="n">${euros(d.totalEstimeCents)}</td></tr></tbody></table></div></section>` : ''}
      <section class="box"><h2>Devis liés</h2>${dv.length ? `<ul class="list">${dv.map(x => `<li><a href="#/devis/${x.id}"><b>${esc(x.numero)}</b></a><span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : '<p class="muted">Pas encore de devis : « Créer le devis » reprend toutes les lignes de la sélection, avec le personnel, les packs et la livraison.</p>'}</section>
      <section class="box"><h2>Notes internes</h2><textarea rows="3" data-notes placeholder="Visible seulement par l’équipe">${esc(d.notes || '')}</textarea><button class="btn ghost sm" data-savenotes>Enregistrer la note</button></section>`);
  }
  demande.after = id => {
    $('[data-dmsrc]')?.addEventListener('change', async e => { const v = e.target.value; if (v === NOUV_SRC) return; try { await api(`${A}/demandes/${id}`, { method: 'PUT', body: { ...cache.demande, canal: v } }); cache.demande.canal = v; toast(v ? `Source enregistrée : ${v}.` : 'Source retirée.'); } catch (err) { toast(err.message, true); } });
    $('[data-statut]')?.addEventListener('change', async e => { await api(`${A}/demandes/${id}`, { method: 'PUT', body: { ...cache.demande, statut: e.target.value } }); toast('Statut mis à jour.'); render(); });
    $('[data-savenotes]')?.addEventListener('click', async () => { await api(`${A}/demandes/${id}`, { method: 'PUT', body: { ...cache.demande, notes: $('[data-notes]').value } }); toast('Note enregistrée.'); });
    $('[data-mkdevis]')?.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${id}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; });
    $('[data-mkdevisanc]')?.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${id}`, { method: 'POST' }); location.hash = '#/devis/' + r.id + '?anciens=1'; });
  };

  /* ---------- suivi client : une fiche par opportunité et sa frise (Demande → Devis envoyé → Relance → Accord client → Réservé / Refusé), comme Je Privatise ---------- */
  const H1 = 36e5;
  const OUVERT = ['demande', 'devis_envoye', 'relance'];
  function opportunite(d, devisL) {
    const dv = devisL.filter(x => x.demandeId === d.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const main = dv.find(x => x.statut === 'accepte') || dv.find(x => x.statut === 'envoye') || dv[0];
    const h = d.historique || [], at = st => (h.filter(x => x.statut === st).pop() || {}).at;
    const envoyeLe = main && main.statut !== 'brouillon' ? main.envoyeLe : at('devis_envoye');
    const relances = [...(main?.relances || []).map(r => ({ at: r.at, how: /sms/i.test(r.modele || '') ? 'SMS' : 'e-mail', envoi: true })), ...(d.relancesNotees || []).map(r => ({ ...r, envoi: !!r.modele }))]
      .filter(r => r.at).sort((x, y) => String(x.at).localeCompare(String(y.at)));
    const last = [d.createdAt, envoyeLe, ...relances.map(r => r.at), ...h.map(x => x.at)].filter(Boolean).map(String).sort().pop();
    const age = (Date.now() - Date.parse(last)) / H1;
    const late = OUVERT.includes(d.statut) && age >= 24 && age < 720 ? Math.floor(age) : 0;
    const montant = main ? tot(main).ttc : d.totalEstimeCents;
    const cat = d.statut === 'refuse' ? 'ko' : ['reserve', 'termine'].includes(d.statut) ? 'ok' : d.statut === 'accord' ? 'acc' : !envoyeLe ? 'draft' : late ? 'late' : 'sent';
    const e0 = (main?.envois || [])[0], envoyePar = e0 ? (e0.ia ? 'l’IA ✨' : e0.par || '') : '';
    const nRel = Math.max(0, relances.filter(r => r.envoi && (!d.reactiveeLe || String(r.at) > d.reactiveeLe)).length);
    return { d, dv, main, envoyeLe, nRel, envoyePar, relances, late, last, montant, cat, at, estime: !main, com: String(d.commercial || main?.commercial?.nom || '').trim() };
  }
  async function suivi() {
    const [dem, devisL, eq, cl, fac, R, prods] = await Promise.all([api(A + '/demandes'), api(A + '/devis'), api(A + '/actions/equipe').catch(() => []), api(A + '/clients?vue=actifs').catch(() => []), api(A + '/factures').catch(() => []), cache.R ? Promise.resolve(cache.R) : api(A + '/site').catch(() => ({})), cache.produits || api(A + '/produits').catch(() => null)]);
    if (prods) cache.produits = prods;
    cache.devisL = devisL; cache.equipe = eq.filter(u => !u.desactive); cache.R = cache.R || R;
    cache.opps = dem.filter(d => d.type !== 'contact' && !aTraiter(d, devisL)).map(d => opportunite(d, devisL));
    cache.annuaire = annuaire(cl, dem, devisL, fac);
    if (SV.o == null) { const m = mem.get('mg_commercial'); SV.o = m != null ? m : ''; }
    return page('Suivi client', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn anc-btn" href="#/devis/nouveau?anciens=1">📂 Partir d’un ancien devis</a><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', `<p class="muted intro">Vos opportunités en cours, d’un coup d’œil. Une commande prise au téléphone ? Bouton « ✨ Devis avec l’IA » : tapez ou dictez tout en vrac, l’IA prépare la fiche client et le devis avec le catalogue.</p>
      <div class="cf-box"><label class="cf-lab" for="cfQ">Retrouver un client et tout son historique</label><div class="cf-in"><input id="cfQ" type="search" data-cf autocomplete="off" placeholder="🔍 Nom, prénom, téléphone, e-mail, société ou n° de devis…" aria-label="Rechercher un client"><div class="cf-res" id="cfRes" hidden></div></div></div>
      <div id="qs"></div>`);
  }
  /* commerciaux : comptes du back-office + personnes de « Alertes de l’équipe » (la liste du devis) + noms déjà attribués */
  const commerciaux = () => [...new Set([...(cache.equipe || []).map(u => u.nom), ...(cache.R?.alertes?.personnes || []).map(x => x.nom), ...(cache.opps || []).map(o => o.com)].map(n => String(n || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  /* ---------- recherche d'un client (nom, prénom, téléphone, e-mail, société, n° de devis / demande / facture) ---------- */
  const sansAccent = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const telCourt = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('0033')) d = d.slice(4); else if (d.startsWith('33') && d.length === 11) d = d.slice(2); return d.replace(/^0/, ''); };
  function annuaire(cl, dem, devisL, fac) {
    return cl.map(c => {
      const ds = dem.filter(d => d.clientId === c.id), vs = devisL.filter(v => v.clientId === c.id || ds.some(d => d.id === v.demandeId)), fs = fac.filter(f => f.clientId === c.id || vs.some(v => v.id === f.devisId));
      const tels = [c.tel, ...ds.map(d => d.contact?.tel)].filter(Boolean);
      const last = [c.derniereActivite, ...ds.map(d => d.createdAt), ...vs.map(v => v.createdAt)].filter(Boolean).map(String).sort().pop() || '';
      const dv = [...vs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      return { c, nb: ds.filter(d => d.type !== 'contact').length, nbDevis: vs.length, dv, last,
        hay: sansAccent([c.nom, c.societe, c.email, ...ds.map(d => [d.contact?.nom, d.contact?.email, d.contact?.societe, d.ref].join(' ')), ...vs.map(v => v.numero), ...fs.map(f => f.numero)].join(' ')),
        tels: tels.map(telCourt).filter(x => x.length >= 6) };
    });
  }
  function chercherClients(q) {
    const words = sansAccent(q).trim().split(/\s+/).filter(Boolean); if (!words.length) return [];
    const telQ = q.replace(/[\s.+()-]/g, '');
    if (/^\d{3,}$/.test(telQ)) { const k = telCourt(telQ) || telQ; const l = (cache.annuaire || []).filter(a => a.tels.some(t => t.includes(k)) || a.hay.includes(telQ)); if (l.length) return l.sort((x, y) => String(y.last).localeCompare(String(x.last))).slice(0, 12); }
    return (cache.annuaire || []).filter(a => words.every(w => { const dg = w.replace(/\D/g, ''); return a.hay.includes(w) || (dg.length >= 3 && dg === w && a.tels.some(t => t.includes(telCourt(dg) || dg))); }))
      .sort((x, y) => String(y.last).localeCompare(String(x.last))).slice(0, 12);
  }
  const initiales = n => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  function dessinerRecherche(q) {
    const box = $('#cfRes'); if (!box) return;
    if (!q.trim()) { box.hidden = true; box.innerHTML = ''; return; }
    const l = chercherClients(q);
    box.hidden = false;
    /* contacts du fichier importé (pas encore de demande ni de devis) : cherchés sur le serveur */
    clearTimeout(dessinerRecherche.t);
    if (l.length < 12 && q.trim().length >= 2) dessinerRecherche.t = setTimeout(async () => {
      try {
        const r = await api(A + '/clients?par=20&q=' + encodeURIComponent(q.trim()));
        if (($('[data-cf]')?.value || '') !== q) return;
        const deja = new Set(l.map(a => a.c.id)), plus = r.items.filter(c => !deja.has(c.id)).slice(0, 12 - l.length).map(c => ({ c, nb: c.nbDemandes || 0, nbDevis: 0, last: c.derniereActivite || '', importe: c.source === 'import CRM' }));
        if (plus.length) dessinerListe(box, q, [...l, ...plus]);
      } catch { /* recherche locale déjà affichée */ }
    }, 250);
    dessinerListe(box, q, l);
  }
  function dessinerListe(box, q, l) {
    box.innerHTML = l.length ? l.map((a, i) => `<a class="cf-r${i ? '' : ' on'}" href="#/clients/${esc(a.c.id)}"><span class="qs-av">${esc(initiales(a.c.nom))}</span><span class="cf-t"><b>${esc(a.c.nom || '—')}</b><small>${esc([a.c.societe, a.c.tel, a.c.email].filter(Boolean).join(' · '))}</small></span><span class="cf-m">${a.nbDevis ? `${a.nbDevis} devis${a.dv ? ` · dernier n° ${esc(a.dv.numero)} <span class="pill d-${a.dv.statut}">${DSTAT[a.dv.statut] || ''}</span>` : ''}` : a.nb ? a.nb + ' demande' + (a.nb > 1 ? 's' : '') : a.importe ? 'fichier clients importé' : 'aucun devis'}<small>${a.last ? 'dernière activité le ' + dateFr(a.last) : ''}</small></span><span class="cf-go">Historique ›</span></a>`).join('')
      : `<p class="cf-none">Aucun client ne correspond à « ${esc(q)} ». Essayez le nom seul, les derniers chiffres du téléphone ou le n° du devis.</p>`;
  }
  const SV = { p: 'all', o: null, f: 'all', s: '', d1: '', d2: '' };
  function suiviDessin() {
    const box = $('#qs'); if (!box) return;
    const all = cache.opps || [];
    const R = (() => { const n = new Date(), y = n.getFullYear(), m = n.getMonth(), D = (a, b, c) => new Date(a, b, c).getTime();
      if (SV.p === 'mois') return [D(y, m, 1), D(y, m + 1, 1)]; if (SV.p === 'mprec') return [D(y, m - 1, 1), D(y, m, 1)];
      if (SV.p === 'trim') { const t = m - m % 3; return [D(y, t, 1), D(y, t + 3, 1)]; } if (SV.p === 'an') return [D(y, 0, 1), D(y + 1, 0, 1)];
      if (SV.p === 'dates') { const a = SV.d1 ? Date.parse(SV.d1 + 'T00:00:00') : -Infinity, b = SV.d2 ? Date.parse(SV.d2 + 'T00:00:00') + 864e5 : Infinity; return a > -Infinity || b < Infinity ? [a, b] : null; }
      return null; })();
    const inR = x => { if (!R) return true; const t = Date.parse(x || ''); return !isNaN(t) && t >= R[0] && t < R[1]; };
    const inP = o => !R || [o.d.createdAt, o.envoyeLe, o.last, ...(o.d.historique || []).map(h => h.at)].some(inR);
    const owner = o => o.com;
    const mine = o => !SV.o || (SV.o === '—' ? !owner(o) : owner(o) === SV.o);
    const base = all.filter(o => mine(o) && inP(o));
    const sum = (l, f) => l.reduce((a, o) => a + (f(o) || 0), 0);
    const signes = base.filter(o => ['acc', 'ok'].includes(o.cat)), perdus = base.filter(o => o.cat === 'ko');
    const kpis = [[base.filter(o => !['ok', 'ko'].includes(o.cat)).length, 'opportunités en cours'], [base.filter(o => ['sent', 'late'].includes(o.cat)).length, 'en attente de réponse'],
      [base.filter(o => o.late).length, 'sans nouvelles depuis 24 h'], [euros(sum(signes, o => o.montant)), 'chiffre d’affaires signé (TTC)'],
      [signes.length + perdus.length ? Math.round(signes.length / (signes.length + perdus.length) * 100) + ' %' : '—', 'opportunités gagnées']];
    const inF = (o, k) => !mine(o) || !inP(o) ? false : k === 'all' ? !['ok', 'ko'].includes(o.cat) : k === 'sent' ? ['sent', 'late'].includes(o.cat) : o.cat === k;
    const cnt = k => all.filter(o => inF(o, k)).length;
    const hay = o => [o.d.contact?.nom, o.d.contact?.societe, o.d.contact?.email, o.d.contact?.tel, o.d.ref, o.d.evenement?.type, o.d.evenement?.ville, ...o.dv.map(x => x.numero)].join(' ').toLowerCase();
    const S = SV.s.trim().toLowerCase();
    const motifOk = o => SV.f !== 'ko' || !SV.motif || (o.d.motifRefus || 'Sans raison') === SV.motif;
    const list = all.filter(o => inF(o, SV.f) && motifOk(o) && (!S || S.split(/\s+/).every(w => hay(o).includes(w))))
      .sort((x, y) => (y.late - x.late) || String(y.last).localeCompare(String(x.last)));
    const owners = commerciaux();
    const arch = SV.f === 'ok' || SV.f === 'ko';
    box.innerHTML = `<div class="qs-owners"><div class="qs-orow"><span class="qs-olab">Période</span>${[['all', 'Tout'], ['mois', 'Mois en cours'], ['mprec', 'Mois dernier'], ['trim', 'Trimestre'], ['an', 'Année'], ['dates', 'De date à date']].map(([k, l]) => `<button type="button" class="qs-own-b${SV.p === k ? ' on' : ''}" data-qp="${k}">${l}</button>`).join('')}${SV.p === 'dates' ? `<span class="qs-dates">du <input type="date" data-qd="d1" value="${esc(SV.d1)}"> au <input type="date" data-qd="d2" value="${esc(SV.d2)}"></span>` : ''}</div>
      <div class="qs-orow qs-who-row"><span class="qs-olab">Commercial</span><label class="qs-csel"><span aria-hidden="true">👤</span><select data-qcom aria-label="Choisir le commercial"><option value=""${!SV.o ? ' selected' : ''}>Tous les commerciaux</option>${owners.map(n => `<option value="${esc(n)}"${SV.o === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="—"${SV.o === '—' ? ' selected' : ''}>Non attribuées</option></select></label><button type="button" class="qs-own-b${!SV.o ? ' on' : ''}" data-qo="">Tous en même temps</button>
        <div class="qs-cname${SV.o ? ' perso' : ''}">${!SV.o ? 'Vous voyez <b>toutes les opportunités</b>, tous commerciaux confondus' : SV.o === '—' ? 'Vous voyez les opportunités <b>sans commercial</b>' : `Vous voyez les fiches de <b>${esc(SV.o)}</b>`}</div></div>
      <div class="qs-osum"><span><b>${base.length}</b> opportunité${base.length > 1 ? 's' : ''}</span><span><b>${signes.length}</b> signée${signes.length > 1 ? 's' : ''}</span><span><b>${perdus.length}</b> refusée${perdus.length > 1 ? 's' : ''}</span><em>${euros(sum(signes, o => o.montant))} signés</em></div></div>
      <div class="kpis qk">${kpis.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <div class="qs-top"><div class="qs-chips">${arch ? `<button type="button" class="qs-chip" data-qf="all">← Opportunités en cours <b>${cnt('all')}</b></button><span class="qs-title">${SV.f === 'ok' ? 'Opportunités réservées' : 'Opportunités refusées (classées)'}</span>${SV.f === 'ko' ? (() => { const m = new Map(); all.filter(o => inF(o, 'ko')).forEach(o => { const k = o.d.motifRefus || 'Sans raison'; m.set(k, (m.get(k) || 0) + 1); }); return m.size ? `<div class="qs-motifs"><span class="muted sm">Raisons :</span>${[...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<button type="button" class="qs-chip${SV.motif === k ? ' on' : ''}" data-qmotif="${esc(k)}">${esc(k)} <b>${n}</b></button>`).join('')}</div>` : ''; })() : ''}`
        : [['all', 'En cours'], ['late', '⚠ À relancer'], ['sent', 'Envoyées'], ['acc', 'Attente d’acompte'], ['draft', 'Devis à envoyer']].map(([k, l]) => `<button type="button" class="qs-chip${SV.f === k ? ' on' : ''}${k === 'late' && cnt('late') ? ' hot' : ''}" data-qf="${k}">${esc(l)} <b>${cnt(k)}</b></button>`).join('')
          + `<span class="qs-sp"></span><button type="button" class="qs-arch ok" data-qf="ok">Voir les opportunités réservées <b>${cnt('ok')}</b></button><button type="button" class="qs-arch ko" data-qf="ko">Voir les opportunités refusées <b>${cnt('ko')}</b></button>`}</div>
        <input class="qs-search" type="search" data-qs placeholder="🔍 Rechercher : nom, société, n° de devis…" aria-label="Rechercher un client" value="${esc(SV.s)}"></div>
      <div id="qsList">${list.length ? list.map(carte).join('') : `<div class="vide"><p>${all.length ? 'Aucune opportunité ici.' : 'Aucune demande pour l’instant. Les demandes envoyées depuis le site et les devis créés ici apparaissent dans ce suivi.'}</p></div>`}</div>`;
  }
  const d1 = x => x ? new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const etape = (cls, label, sub, mark) => `<div class="qs-st ${cls}"><div class="qs-dot">${mark || ''}</div><b>${esc(label)}</b><i>${esc(sub || '—')}</i></div>`;
  const btnEtape = (o, k, html) => o.d.statut === 'refuse' ? html : `<button type="button" class="qs-stb" data-qstep="${k}" data-q="${o.d.id}" title="Cliquer pour mettre à jour">${html}</button>`;
  /* sous « Accord client » : validé en ligne par le client, ou validé par le commercial qui a cliqué (Jean-Luc, 2026-11-27) */
  function accordPar(o) {
    const h = (o.d.historique || []).filter(x => x.statut === 'accord' || x.statut === 'reserve').pop();
    if (h && /en ligne/.test(h.par || '')) return 'validé en ligne · ' + d1(h.at);
    const par = o.main?.accordManuel?.par || h?.par || '';
    const at = (o.d.historique || []).filter(x => x.statut === 'accord').pop()?.at || o.main?.accordManuel?.at || h?.at;
    return (par ? 'validé par ' + par : 'validé') + (at ? ' · ' + d1(at) : '');
  }
  function frise(o) {
    const st = o.d.statut, decided = ['accord', 'reserve', 'termine', 'refuse'].includes(st), sent = !!o.envoyeLe;
    const out = [etape('done', 'Demande', d1(o.d.createdAt) + (o.d.source ? ' · ' + (/IA/.test(o.d.source) ? '✨ IA' : 'tél.') : o.d.lignes ? ' · site' : ''), '✓')];
    out.push(sent ? etape('done', 'Devis envoyé', d1(o.envoyeLe) + (o.envoyePar ? ' · par ' + o.envoyePar : ''), '✓') : `<button type="button" class="qs-stb" data-qdevis="${o.d.id}" title="Préparer le devis">${etape('now todo', 'Devis à envoyer', o.main ? 'brouillon, pas encore envoyé' : 'à préparer')}</button>`);
    const rel = o.relances[o.relances.length - 1];
    const relB = h => `<button type="button" class="qs-stb" data-qrel="${o.d.id}" title="Choisir un modèle et envoyer une relance">${h}</button>`;
    out.push(relB(o.late && sent ? etape('warn', 'À relancer', 'depuis ' + (o.late >= 48 ? Math.floor(o.late / 24) + ' jours' : o.late + ' h'), '!')
      : o.nRel ? etape('done relok', `✓ Relance ${Math.min(o.nRel, NB_RELANCES)} envoyée`, d1(rel.at) + ' · ' + rel.how + (o.nRel < NB_RELANCES && !decided ? ` · prochaine : relance ${o.nRel + 1}${o.nRel + 1 === NB_RELANCES ? ' (dernière)' : ''}` : ''), '✓')
      : rel ? etape('done relok', '✓ Relance notée', d1(rel.at) + ' · ' + rel.how, '✓')
      : etape(decided ? 'skip' : 'opt', 'Relance', decided ? 'si besoin' : '+ relancer')));
    if (st === 'refuse') out.push(etape('lost', 'Refusé', (o.d.motifRefus ? o.d.motifRefus + ' · ' : 'classé · ') + d1(o.at('refuse')), '✕'));
    else {
      const acc = ['accord', 'reserve', 'termine'].includes(st), sig = o.main?.statut === 'accepte' && o.main.signature;
      out.push(btnEtape(o, 'accord', acc ? etape('done acc', 'Accord client', sig ? 'validé en ligne · ' + d1(o.main.signature.at) : accordPar(o), '✓') : etape('opt', 'Accord client', '+ en attente d’acompte')));
      out.push(btnEtape(o, 'reserve', ['reserve', 'termine'].includes(st) ? etape('done', 'Réservé', 'acompte reçu · ' + d1(o.at('reserve')), '✓') : etape('opt', 'Réservé', acc ? 'en attente d’acompte' : '+ réserver')));
      if (!acc) out.push(btnEtape(o, 'refuse', etape('opt refuse', 'Refusé', 'si le client refuse')));
    }
    let lastI = -1; out.forEach((x, i) => { if (/class="qs-st (done|now|warn|lost)/.test(x)) lastI = i; });
    for (let i = 1; i <= lastI; i++) out[i] = out[i].replace('class="qs-st ', 'class="qs-st reach ');
    return `<div class="qs-tl">${out.join('')}</div>`;
  }
  function badge(o) {
    if (o.cat === 'ko') return '<span class="qs-tag t-ko">Refusé · classé</span>';
    if (o.cat === 'ok') return `<span class="qs-tag t-ok">${o.d.statut === 'termine' ? 'Terminé' : 'Réservé'}</span>`;
    if (o.cat === 'acc') return '<span class="qs-tag t-acc">En attente d’acompte</span>';
    if (o.late) return `<span class="qs-tag t-late">${o.late >= 48 ? Math.floor(o.late / 24) + ' jours' : o.late + ' h'} sans nouvelles</span>`;
    if (o.cat === 'draft') return `<span class="qs-tag t-draft">Devis à envoyer</span>`;
    return `<span class="qs-tag t-sent">${o.relances.length ? 'Relancé' : 'Envoyé'}</span>`;
  }
  /* « Réserver » (Jean-Luc, 2026-11-27) : le cadre « Acompte reçu » s'ouvre sous la frise ; à la validation, le règlement va
     sur la facture du devis (créée au besoin, avec le reste dû) et la fiche quitte « En cours » pour « Réservé ». */
  const MOYENS_RG = ['Chèque', 'Virement', 'Espèces', 'Carte bancaire', 'Lien de paiement', 'Chèques vacances / CESU', 'Autre'];
  function formReserver(o) {
    const ttc = o.montant || 0, ac = regleAcompte(ttc, o.main || o.d, cache.R?.tarifs);
    const today = new Date().toISOString().slice(0, 10);
    const attendu = !ttc ? '' : ac.total ? `Totalité attendue${ac.raison === 'proche' ? ' (événement dans moins de ' + ac.delai + ' jours)' : ac.raison === 'seuil' ? ' (commande de moins de ' + euros(ac.seuil) + ')' : ''} : <b>${euros(ac.cents)}</b>` : `Acompte de ${ac.pct} % attendu : <b>${euros(ac.cents)}</b> sur ${euros(ttc)}, solde ${ac.delai} jours avant l’événement`;
    return `<form class="qs-rsv" data-rsvform="${o.d.id}">
      <div class="qs-rsv-h"><b>💶 Acompte reçu</b><span class="muted sm">${attendu}${o.main ? ` · devis n° ${esc(o.main.numero)}` : ''}</span></div>
      <div class="qs-rsv-g"><label>Montant reçu (€ TTC)<input name="montant" inputmode="decimal" required value="${ttc ? fromCents(ac.cents) : ''}" placeholder="ex. 450"></label>
        <label>Mode de paiement<select name="moyen">${MOYENS_RG.map(m => `<option>${esc(m)}</option>`).join('')}</select></label>
        <label>Date de réception<input type="date" name="date" required value="${today}" max="${today}"></label>
        <label>Note (facultatif)<input name="note" placeholder="ex. chèque n° 1234, banque…"></label></div>
      <p class="muted sm">La facture est créée (ou complétée) automatiquement dans <b>Factures</b> avec ce règlement et le reste dû, et la fiche passe dans « Réservés ».</p>
      <div class="row"><button class="btn" type="submit">✓ Valider : acompte reçu</button><button class="btn ghost" type="button" data-rsvx>Annuler</button><button class="btn ghost sm" type="button" data-rsvsans="${o.d.id}" title="Passer en Réservé sans enregistrer de paiement">Réserver sans paiement</button></div>
    </form>`;
  }
  /* « Relancer » (Jean-Luc, 2026-11-27) : cadre sous la frise avec la liste des modèles de relance (déjà remplis avec le nom
     du client, le n° et le lien du devis), texte modifiable, ✨ IA, puis « Envoyer ». La relance est notée et l'étape passe en vert. */
  function formRelance(o) {
    const R = SV.rel, D = R.data;
    if (!D) return `<div class="qs-rsv qs-rel" data-relform="${o.d.id}"><p class="muted">Chargement des modèles de relance…</p></div>`;
    const m = D.modeles.find(x => x.id === R.mod) || D.modeles[0];
    if (!m) return `<div class="qs-rsv qs-rel"><p>Aucun modèle de relance. Ajoutez-en dans Outils › Modèles.</p><div class="row"><button class="btn ghost" type="button" data-relx>Fermer</button></div></div>`;
    const sms = m.canal === 'sms', dest = sms ? D.tel : D.email;
    return `<form class="qs-rsv qs-rel" data-relform="${o.d.id}">
      <div class="qs-rsv-h"><b>✉ Relance ${Math.min((o.nRel || 0) + 1, NB_RELANCES)}${(o.nRel || 0) + 1 >= NB_RELANCES ? ' (dernière)' : ''} · ${esc(o.d.contact?.nom || 'le client')}</b><span class="muted sm">${D.relances ? D.relances + ' relance' + (D.relances > 1 ? 's' : '') + ' déjà envoyée' + (D.relances > 1 ? 's' : '') + ' · ' : ''}${D.devis ? 'devis n° ' + esc(D.devis.numero) : 'pas encore de devis envoyé : relance de la demande ' + esc(D.ref)}</span></div>
      <label class="qs-rel-mod">Modèle de relance<select name="modele" data-relmod>${D.modeles.map(x => `<option value="${esc(x.id)}"${x.id === m.id ? ' selected' : ''}>${x.canal === 'sms' ? '💬 ' : '✉ '}${esc(x.nom)}</option>`).join('')}</select></label>
      <p class="sm qs-rel-to">${sms ? '💬 SMS' : '✉ E-mail'} envoyé à <b>${dest ? esc(dest) : `<span class="err">aucun ${sms ? 'portable' : 'e-mail'} sur la fiche</span>`}</b></p>
      ${sms ? '' : `<label>Objet<input name="sujet" value="${esc(m.sujet)}"></label>`}
      <label>Message <small class="muted">(modifiable, ou dictez avec le micro 🎤)</small><textarea name="texte" rows="${sms ? 3 : 9}">${esc(m.texte)}</textarea></label>
      <div class="qs-rel-ia"><input name="consigne" placeholder="Consigne pour l’IA (facultatif) : plus court, proposer un appel…" aria-label="Consigne pour l’IA"><button class="btn ghost" type="button" data-relia>✨ Réécrire avec l’IA</button></div>
      ${(o.nRel || 0) + 1 >= NB_RELANCES && ['demande', 'devis_envoye', 'relance'].includes(o.d.statut) ? `<p class="sm qs-rel-der">⚠ C’est la dernière relance : une fois envoyée, la fiche passe en <b>Refusé</b> (« Sans réponse après ${NB_RELANCES} relances »). Si le client revient, bouton « ↺ Réactiver la fiche ».</p>` : ''}
      <div class="row"><button class="btn" type="submit"${dest ? '' : ' disabled'}>📨 Envoyer la relance</button><button class="btn ghost" type="button" data-relvoir>👁 ${sms ? 'Voir le SMS' : 'Voir le mail'}</button><button class="btn ghost" type="button" data-relx>Annuler</button></div>
    </form>`;
  }
  /* « Refusé » (Jean-Luc, 2026-11-27) : une raison est toujours demandée avant de classer la fiche ; « Autre… » en crée une,
     qui reviendra ensuite dans la liste (raisons déjà utilisées sur les fiches). */
  /* nombre de relances avant de classer la fiche : à la dernière, elle passe en « Refusé » toute seule (même valeur dans server/index.js) */
  const NB_RELANCES = 3;
  const MOTIFS_REFUS = ['Sans réponse après ' + NB_RELANCES + ' relances', 'Pas de budget', 'Trop cher', 'Le client ne répond plus', 'Date indisponible', 'A choisi un autre traiteur', 'Événement annulé ou reporté', 'Hors zone de livraison'];
  const motifsRefus = () => [...new Set([...MOTIFS_REFUS, ...(cache.opps || []).map(x => String(x.d.motifRefus || '').trim()).filter(Boolean)])];
  function formRefus(o) {
    return `<form class="qs-rsv qs-ref" data-refform="${o.d.id}"><input type="hidden" name="motif" value="">
      <div class="qs-rsv-h"><b>✕ Pourquoi ${esc(o.d.contact?.nom || 'le client')} refuse ?</b><span class="muted sm">Choisissez une raison : elle est obligatoire pour classer la fiche.</span></div>
      <div class="qs-ref-l">${motifsRefus().map(m => `<button type="button" class="qs-ref-b" data-refm="${esc(m)}">${esc(m)}</button>`).join('')}<button type="button" class="qs-ref-b autre" data-refm="">+ Autre raison…</button></div>
      <label class="qs-ref-autre" hidden>Nouvelle raison<input name="autre" maxlength="80" placeholder="ex. A préféré faire lui-même"></label>
      <div class="row"><button class="btn danger" type="submit" disabled>✕ Classer en refusé</button><button class="btn ghost" type="button" data-refx>Annuler</button></div>
    </form>`;
  }
  async function ouvrirRelance(id, canal) {
    const x = (cache.opps || []).find(y => y.d.id === id); if (!x) return;
    SV.rsv = null; SV.rel = { id, canal, data: null }; suiviDessin();
    try {
      const D = await api(`${A}/actions/relance-modeles-demande/${id}`);
      if (SV.rel?.id !== id) return;
      const em = D.modeles.filter(m => m.canal !== 'sms'), sm = D.modeles.filter(m => m.canal === 'sms');
      const def = canal === 'sms' ? sm[0] : em[Math.min(x.nRel || 0, em.length - 1)] || D.modeles[0];
      SV.rel = { id, canal, data: D, mod: def?.id }; suiviDessin();
      const f = $(`[data-relform="${id}"]`); f?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) { SV.rel = null; suiviDessin(); toast(err.message, true); }
  }
  function carte(o) {
    const c = o.d.contact || {}, e = o.d.evenement || {}, tel = String(c.tel || '').replace(/[^\d+]/g, ''), first = (c.nom || '').split(' ')[0];
    const ini = (c.nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const ouvert = OUVERT.includes(o.d.statut) || o.d.statut === 'accord';
    const icons = `${tel ? `<a class="qs-ic" href="tel:${esc(tel)}" data-qappel="${o.d.id}" title="Appeler ${esc(c.tel)}" aria-label="Appeler">📞</a>` : ''}${o.envoyeLe && ouvert && c.email ? `<button class="qs-ic" type="button" data-qrel="${o.d.id}" data-canal="mail" title="Relancer par e-mail" aria-label="Relancer par e-mail">✉</button>` : ''}${o.envoyeLe && ouvert && tel ? `<button class="qs-ic" type="button" data-qrel="${o.d.id}" data-canal="sms" title="Relancer par SMS" aria-label="Relancer par SMS">💬</button>` : ''}`;
    return `<article class="qs-card${o.late ? ' late' : ''}${o.cat === 'ko' ? ' lost' : ''}" data-open="${o.d.id}">
      <div class="qs-who"><div class="qs-av">${esc(ini)}</div><div><div class="qs-nm">${esc(c.nom || '—')}${badge(o)}</div>
        <div class="qs-co">${esc([c.societe, c.tel || c.email].filter(Boolean).join(' · '))}</div>
        <div class="qs-co"><button type="button" class="qs-own-pick${o.com ? '' : ' none'}" data-qown="${o.d.id}" title="Attribuer ou changer le commercial">👤 ${esc(o.com || 'Non attribué')} <span aria-hidden="true">▾</span></button></div>
        <div class="qs-ev">${e.type ? '<b>' + esc(e.type) + '</b> · ' : ''}${esc([e.date ? dateFr(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date à définir', e.invites ? e.invites + ' pers.' : '', e.ville || ''].filter(Boolean).join(' · '))}${canalDe(o.main) || canalDe(o.d) ? ' ' + pillSource(canalDe(o.main) || canalDe(o.d)) : ''}</div></div></div>
      <div class="qs-right">${k4Html(o.main ? chiffres(o.main) : chiffres(o.d, { lignes: lignesDemande(o.d), ttc: o.d.totalEstimeCents }), o.main ? '#/devis/' + o.main.id : '')}<div class="qs-ht">${o.main ? 'devis n° ' + esc(o.main.numero) : 'estimation du site'}</div></div>
      ${frise(o)}${SV.rsv === o.d.id ? formReserver(o) : ''}${SV.rel?.id === o.d.id ? formRelance(o) : ''}${SV.refus === o.d.id ? formRefus(o) : ''}
      <div class="qs-foot"><div class="qs-info">${o.d.notes ? `<div class="qs-note">📝 ${esc(String(o.d.notes).slice(0, 140))}</div>` : ''}</div><div class="qs-acts">${o.late ? '' : icons}${['refuse', 'reserve', 'termine'].includes(o.d.statut) ? `<button class="qs-back" type="button" data-qback="${o.d.id}" title="Remettre dans les opportunités en cours">${o.d.statut === 'refuse' ? '↺ Réactiver la fiche' : '↺ Remettre en cours'}</button>` : ''}${o.main && o.main.statut !== 'brouillon' ? `<a class="qs-back" href="/devis/${esc(o.main.token)}" target="_blank" title="Le devis tel que le client le voit">📨 ${o.main.statut === 'accepte' ? 'Devis signé' : 'Devis envoyé'}</a>` : ''}${!o.main && !['refuse', 'termine'].includes(o.d.statut) ? `<button class="qs-back anc-q" type="button" data-qanc="${o.d.id}" title="Créer le devis en reprenant un ancien devis proche">📂 Ancien devis</button>` : ''}${o.d.clientId ? `<a class="qs-back" href="#/clients/${esc(o.d.clientId)}" title="Tout ce qui s’est passé avec ce client">🕘 Historique</a>` : ''}<button class="qs-open" type="button" data-qopen="${o.d.id}">${o.cat === 'draft' ? 'Terminer' : 'Ouvrir'}</button></div></div>
      ${o.late ? `<div class="qs-alert"><b>⚠ Plus de 24 h sans nouvelles.</b> <span>${o.envoyeLe ? `Rappelez ${esc(first || 'ce client')} ou relancez-le.` : `La demande de ${esc(first || 'ce client')} attend son devis.`}</span><span class="sp"></span>${tel ? `<a class="qs-pill dark" href="tel:${esc(tel)}" data-qappel="${o.d.id}">📞 Appeler</a>` : ''}${o.envoyeLe && c.email ? `<button class="qs-pill" type="button" data-qrel="${o.d.id}" data-canal="mail">✉ Relancer par e-mail</button>` : ''}${o.envoyeLe && tel ? `<button class="qs-pill" type="button" data-qrel="${o.d.id}" data-canal="sms">💬 Relancer par SMS</button>` : ''}${o.envoyeLe ? '' : `<button class="qs-pill dark" type="button" data-qdevis="${o.d.id}">✎ Préparer le devis</button>`}<button class="qs-pill" type="button" data-qfait="${o.d.id}">✓ Relance faite (noter)</button></div>` : ''}
    </article>`;
  }
  async function majDemande(id, f, msg) {
    const d = await api(`${A}/demandes/${id}`);
    await api(`${A}/demandes/${id}`, { method: 'PUT', body: f(d) });
    if (msg) toast(msg);
    const [dem, devisL] = await Promise.all([api(A + '/demandes'), api(A + '/devis')]);
    cache.devisL = devisL; cache.opps = dem.filter(x => x.type !== 'contact').map(x => opportunite(x, devisL)); suiviDessin();
  }
  suivi.after = () => {
    suiviDessin();
    const box = $('#qs');
    box.addEventListener('input', e => { if (e.target.matches('[data-qs]')) { SV.s = e.target.value; const p = e.target.selectionStart; suiviDessin(); const i = $('[data-qs]'); i.focus(); i.setSelectionRange(p, p); } });
    box.addEventListener('change', e => { if (e.target.matches('[data-qcom]')) { SV.o = e.target.value; mem.set('mg_commercial', SV.o); return suiviDessin(); } const i = e.target.closest('[data-qd]'); if (i) { SV[i.dataset.qd] = i.value; SV.p = 'dates'; suiviDessin(); } });
    const q = $('[data-cf]');
    q?.addEventListener('input', () => dessinerRecherche(q.value));
    q?.addEventListener('keydown', e => {
      const l = $$('#cfRes .cf-r'); if (!l.length) return; let i = l.findIndex(x => x.classList.contains('on'));
      if (e.key === 'Enter') { e.preventDefault(); location.hash = l[Math.max(0, i)].getAttribute('href'); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault();
      l[i]?.classList.remove('on'); i = (i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length; l[i].classList.add('on'); l[i].scrollIntoView({ block: 'nearest' });
    });
    box.addEventListener('change', e => {
      if (!e.target.matches('[data-relmod]') || !SV.rel?.data) return;
      SV.rel.mod = e.target.value; suiviDessin();
    });
    box.addEventListener('input', e => { const f = e.target.closest('[data-refform]'); if (f && e.target.name === 'autre') f.querySelector('[type=submit]').disabled = !e.target.value.trim(); });
    box.addEventListener('submit', async e => {
      const rf = e.target.closest('[data-refform]');
      if (rf) {
        e.preventDefault();
        const motif = (rf.motif.value || rf.autre.value).trim().replace(/\s+/g, ' ');
        if (!motif) { toast('Choisissez une raison du refus.', true); return; }
        SV.refus = null;
        return majDemande(rf.dataset.refform, d => ({ ...d, statut: 'refuse', motifRefus: motif.charAt(0).toUpperCase() + motif.slice(1) }), 'Classé en refusé · ' + motif);
      }
      const g = e.target.closest('[data-relform]');
      if (g) {
        e.preventDefault();
        const x = (cache.opps || []).find(y => y.d.id === g.dataset.relform), b = g.querySelector('[type=submit]');
        b.disabled = true; b.textContent = 'Envoi…';
        try {
          var r = await api(`${A}/actions/relancer-demande/${x.d.id}`, { method: 'POST', body: { modele: g.modele.value, sujet: g.sujet?.value || '', texte: g.texte.value } });
          SV.rel = null; const fin = r?.refuse; await majDemande(x.d.id, d => d, fin ? `✓ Dernière relance envoyée : la fiche passe en Refusé (sans réponse après ${NB_RELANCES} relances).` : '✓ Relance envoyée à ' + (x.d.contact?.nom || 'au client') + '.');
        } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '📨 Envoyer la relance'; }
        return;
      }
      const f = e.target.closest('[data-rsvform]'); if (!f) return; e.preventDefault();
      const montantCents = Math.round((nombreFr(f.montant.value) || 0) * 100);
      if (!(montantCents > 0)) { toast('Indiquez le montant reçu.', true); return f.montant.focus(); }
      const b = f.querySelector('[type=submit]'); b.disabled = true; b.textContent = 'Enregistrement…';
      try {
        const r = await api(`${A}/actions/reserver/${f.dataset.rsvform}`, { method: 'POST', body: { montantCents, moyen: f.moyen.value, date: f.date.value, note: f.note.value } });
        SV.rsv = null;
        await majDemande(f.dataset.rsvform, d => d, `✓ Réservé : ${euros(montantCents)} reçus, facture ${r.numero} ${r.cree ? 'créée' : 'mise à jour'}${r.resteCents > 0 ? ' · reste dû ' + euros(r.resteCents) : ' · réglée'}.`);
      } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = '✓ Valider : acompte reçu'; }
    });
    box.addEventListener('click', async e => {
      const t = e.target.closest('button,a'); const o = id => (cache.opps || []).find(x => x.d.id === id);
      if (t?.dataset.qp != null) { SV.p = t.dataset.qp; return suiviDessin(); }
      if (t?.dataset.qo != null) { SV.o = t.dataset.qo; mem.set('mg_commercial', SV.o); return suiviDessin(); }
      if (t?.dataset.qf) { SV.f = t.dataset.qf; return suiviDessin(); }
      if (t?.dataset.qappel) { majDemande(t.dataset.qappel, d => ({ ...d, relancesNotees: [...(d.relancesNotees || []), { at: new Date().toISOString(), how: 'appel', par: session.nom }] })); return; }
      if (t?.dataset.qfait) { e.stopPropagation(); return majDemande(t.dataset.qfait, d => ({ ...d, statut: d.statut === 'devis_envoye' ? 'relance' : d.statut, relancesNotees: [...(d.relancesNotees || []), { at: new Date().toISOString(), how: 'noté', par: session.nom }] }), 'Relance notée.'); }
      if (t?.dataset.qrel) { e.stopPropagation(); return ouvrirRelance(t.dataset.qrel, t.dataset.canal); }
      if (t?.dataset.relx != null) { SV.rel = null; return suiviDessin(); }
      if (t?.dataset.relvoir != null) {
        const f = t.closest('form'), D = SV.rel.data, m = D.modeles.find(y => y.id === f.modele.value), sms = m.canal === 'sms';
        const corps = esc(f.texte.value).replace(/\n/g, '<br>');
        const md = document.createElement('div'); md.className = 'modal';
        md.innerHTML = `<div class="modal-in apm"><div class="bh"><h2>${sms ? 'Le SMS tel que le client le recevra' : 'Le mail tel que le client le recevra'}</h2><button class="x" data-close aria-label="Fermer">×</button></div>
          <p class="sm"><b>De :</b> Magnolia Traiteur${sms ? '' : ' &lt;' + esc(cache.R?.email || 'infos@magnoliatraiteur.fr') + '&gt;'}<br><b>À :</b> ${esc(sms ? D.tel : D.email) || '—'}${sms ? '' : `<br><b>Objet :</b> ${esc(f.sujet.value)}`}</p>
          ${sms ? `<div class="apm-sms"><div>${corps}</div></div>` : '<iframe class="apm-f" sandbox title="Aperçu du mail"></iframe>'}
          <div class="row"><button class="btn" type="button" data-envoyer>📨 Envoyer la relance</button><button class="btn ghost" type="button" data-close>Fermer</button></div></div>`;
        document.body.append(md);
        if (!sms) md.querySelector('iframe').srcdoc = `<meta charset="utf-8"><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;padding:8px 14px">${corps}</body>`;
        md.addEventListener('click', ev => { if (ev.target === md || ev.target.closest('[data-close]')) md.remove(); else if (ev.target.closest('[data-envoyer]')) { md.remove(); f.requestSubmit(); } });
        return;
      }
      if (t?.dataset.relia != null) {
        const f = t.closest('form'), x = o(f.dataset.relform), m = SV.rel.data.modeles.find(y => y.id === f.modele.value);
        t.disabled = true; const lab = t.textContent; t.textContent = '✨ L’IA écrit…';
        try {
          const r = await api(`${A}/ia/relance`, { method: 'POST', body: { demandeId: x.d.id, canal: m.canal, sujet: f.sujet?.value || '', texte: f.texte.value, consigne: f.consigne.value } });
          if (f.sujet && r.sujet) f.sujet.value = r.sujet; f.texte.value = r.texte; toast('Texte réécrit par l’IA : relisez-le avant d’envoyer.');
        } catch (err) { toast(err.message, true); }
        t.disabled = false; t.textContent = lab; return;
      }
      if (t?.dataset.qanc) { const r = await api(`${A}/actions/devis-depuis-demande/${t.dataset.qanc}`, { method: 'POST' }); location.hash = '#/devis/' + r.id + '?anciens=1'; return; }
      if (t?.dataset.qdevis) { const x = o(t.dataset.qdevis); if (x?.main) { location.hash = '#/devis/' + x.main.id; return; } const r = await api(`${A}/actions/devis-depuis-demande/${t.dataset.qdevis}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; return; }
      if (t?.dataset.rsvx != null) { SV.rsv = null; return suiviDessin(); }
      if (t?.dataset.rsvsans) { SV.rsv = null; return majDemande(t.dataset.rsvsans, d => ({ ...d, statut: 'reserve' }), 'Étape : ' + STATUTS.reserve); }
      if (t?.dataset.refx != null) { SV.refus = null; return suiviDessin(); }
      if (t?.dataset.refm != null) { const f = t.closest('form'); f.querySelectorAll('[data-refm]').forEach(b => b.classList.toggle('on', b === t)); f.motif.value = t.dataset.refm; const au = f.querySelector('.qs-ref-autre'); au.hidden = t.dataset.refm !== ''; if (!au.hidden) au.querySelector('input').focus(); f.querySelector('[type=submit]').disabled = t.dataset.refm === ''; return; }
      if (e.target.closest('.qs-rsv')) return;
      if (t?.dataset.qstep === 'refuse') { SV.rel = null; SV.rsv = null; SV.refus = SV.refus === t.dataset.q ? null : t.dataset.q; suiviDessin(); $(`[data-refform="${t.dataset.q}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
      if (t?.dataset.qmotif != null) { SV.motif = SV.motif === t.dataset.qmotif ? '' : t.dataset.qmotif; return suiviDessin(); }
      if (t?.dataset.qstep === 'reserve' && !['reserve', 'termine'].includes(o(t.dataset.q)?.d.statut)) {
        SV.rsv = SV.rsv === t.dataset.q ? null : t.dataset.q; suiviDessin();
        const f = $(`[data-rsvform="${t.dataset.q}"]`); if (f) { f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); f.montant.focus(); f.montant.select(); }
        return;
      }
      if (t?.dataset.qstep) {
        const k = t.dataset.qstep, x = o(t.dataset.q), cur = x.d.statut;
        const next = k === cur ? (k === 'reserve' ? 'accord' : x.envoyeLe ? 'devis_envoye' : 'demande') : k;
        return majDemande(x.d.id, d => ({ ...d, statut: next }), 'Étape : ' + STATUTS[next]);
      }
      if (t?.dataset.qback) { const x = o(t.dataset.qback); return majDemande(x.d.id, d => ({ ...d, statut: x.envoyeLe ? 'devis_envoye' : 'demande', ...(d.statut === 'refuse' ? { reactiveeLe: new Date().toISOString(), motifRefus: '' } : {}) }), x.d.statut === 'refuse' ? 'Fiche réactivée : elle revient dans les opportunités en cours.' : 'Remis dans les opportunités en cours.'); }
      if (t?.dataset.qown) {
        const x = o(t.dataset.qown), noms = commerciaux();
        const pop = document.createElement('div'); pop.className = 'qs-om';
        pop.innerHTML = noms.map(n => `<button type="button" data-n="${esc(n)}"${n === x.com ? ' class="on"' : ''}>${esc(n)}</button>`).join('') + '<button type="button" data-n="">Non attribué</button>';
        t.after(pop);
        pop.addEventListener('click', ev => { const b = ev.target.closest('[data-n]'); if (!b) return; ev.stopPropagation(); majDemande(x.d.id, d => ({ ...d, commercial: b.dataset.n }), b.dataset.n ? 'Attribué à ' + b.dataset.n : 'Commercial retiré.'); });
        setTimeout(() => document.addEventListener('click', () => pop.remove(), { once: true }));
        return;
      }
      if (t?.dataset.qopen) { location.hash = '#/demandes/' + t.dataset.qopen; return; }
      if (t) return;
      const card = e.target.closest('[data-open]'); if (card && !e.target.closest('.qs-om')) location.hash = '#/demandes/' + card.dataset.open;
    });
  };



  /* ---------- dictée partout (Jean-Luc, 2026-11-27) : chaque zone de texte du back-office a son micro 🎤.
     Un clic dans une case fait apparaître le micro dans son coin ; le texte dicté s'insère là où est le curseur.
     Les cases qui ont déjà leur propre bouton « 🎤 Dicter » (data-mic-propre) sont laissées telles quelles. ---------- */
  {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const TYPES_OK = new Set(['', 'text', 'search', 'url']);
    const dictable = el => {
      if (!el || el.disabled || el.readOnly || el.dataset?.micPropre || el.closest?.('[data-nomic], .login')) return false;
      if (el.isContentEditable && el.matches('[contenteditable="true"]')) return true;
      if (el.tagName === 'TEXTAREA') return true;
      return el.tagName === 'INPUT' && TYPES_OK.has((el.getAttribute('type') || '').toLowerCase()) && !/numeric|decimal|tel|email/.test(el.inputMode || '');
    };
    const bt = document.createElement('button');
    bt.type = 'button'; bt.className = 'mic-flot'; bt.hidden = true; bt.title = 'Dicter dans cette case'; bt.setAttribute('aria-label', 'Dicter dans cette case'); bt.textContent = '🎤';
    const bulle = document.createElement('div'); bulle.className = 'mic-bulle'; bulle.hidden = true; bulle.setAttribute('role', 'status');
    document.body.append(bt, bulle);
    let cible = null, rec = null;
    const placer = () => {
      if (!cible || !cible.isConnected) { cacher(); return; }
      const r = cible.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || !r.width) { bt.hidden = true; return; }
      const grand = cible.tagName !== 'INPUT' && r.height > 60;
      bt.hidden = false;
      bt.style.left = Math.max(4, r.right - 40) + 'px';
      bt.style.top = (grand ? r.bottom - 40 : r.top + (r.height - 34) / 2) + 'px';
      bulle.style.left = Math.max(8, Math.min(innerWidth - 268, r.right - 260)) + 'px';
      bulle.style.top = Math.max(8, r.top - 38) + 'px';
    };
    const cacher = () => { if (rec) rec.stop(); bt.hidden = true; bulle.hidden = true; cible?.classList.remove('mic-cible'); cible = null; };
    const dire = (t, err) => { bulle.textContent = t; bulle.hidden = !t; bulle.classList.toggle('err', !!err); };
    /* texte dicté inséré au curseur (case) ou à la sélection (éditeur visuel) */
    const inserer = (el, avant, apres, txt) => {
      const sep = avant && !/\s$/.test(avant) ? ' ' : '';
      el.value = avant + sep + txt + (apres && !/^\s/.test(apres) && txt ? ' ' : '') + apres;
      const pos = (avant + sep + txt).length; try { el.setSelectionRange(pos, pos); } catch { /* */ }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const demarrer = () => {
      if (!SR) { dire('Dictée indisponible sur ce navigateur. Sur iPhone : touchez le micro du clavier. Sur ordinateur : Chrome, Edge ou Safari.', true); setTimeout(() => dire(''), 6000); return; }
      const el = cible; if (!el) return;
      const ce = el.isContentEditable;
      const caret = ce ? 0 : (el.selectionStart ?? el.value.length), fin = ce ? 0 : (el.selectionEnd ?? caret);
      const avant = ce ? '' : el.value.slice(0, caret), apres = ce ? '' : el.value.slice(fin);
      let ok = '';
      rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = !ce; rec.continuous = true;
      rec.onresult = ev => {
        let tmp = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i], t = r[0].transcript.trim();
          if (!r.isFinal) { tmp += ' ' + t; continue; }
          if (ce) { el.focus(); document.execCommand('insertText', false, (ok ? ' ' : '') + t); el.dispatchEvent(new Event('input', { bubbles: true })); }
          ok = (ok + ' ' + t).trim();
        }
        if (!ce) inserer(el, avant, apres, (ok + tmp).trim());
      };
      rec.onerror = ev => dire(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Le micro est bloqué : autorisez-le dans le navigateur, puis réessayez.' : ev.error === 'no-speech' ? 'Je n’ai rien entendu : réessayez en parlant près du micro.' : 'La dictée s’est arrêtée. Réessayez.', true);
      rec.onend = () => { rec = null; bt.classList.remove('on'); bt.textContent = '🎤'; if (!bulle.classList.contains('err')) dire(''); };
      try { rec.start(); bt.classList.add('on'); bt.textContent = '■'; dire('🔴 Je vous écoute… touchez ■ pour arrêter.'); } catch { rec = null; dire('Impossible de démarrer la dictée ici.', true); }
    };
    /* le bouton ne prend pas le focus : la case reste active et le curseur ne bouge pas */
    bt.addEventListener('pointerdown', e => e.preventDefault());
    bt.addEventListener('mousedown', e => e.preventDefault());
    bt.addEventListener('click', () => { if (rec) rec.stop(); else demarrer(); });
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (el === bt) return;
      if (!dictable(el)) { if (cible && el !== cible) cacher(); return; }
      if (cible !== el) { if (rec) rec.stop(); cible?.classList.remove('mic-cible'); cible = el; el.classList.add('mic-cible'); }
      placer();
    });
    document.addEventListener('focusout', e => { if (e.target === cible) setTimeout(() => { if (document.activeElement !== cible) cacher(); }, 150); });
    addEventListener('scroll', () => { if (cible) placer(); }, { capture: true, passive: true });
    addEventListener('resize', () => { if (cible) placer(); });
    addEventListener('hashchange', cacher);
    window.visualViewport?.addEventListener('resize', () => { if (cible) placer(); });
  }
  /* ---------- commande avec l'IA (comme « ✨ Devis avec l'IA » de Je Privatise) :
     infos du client en vrac (texte ou dictée) → fiche client → prestations du catalogue → devis pré-rempli à vérifier ---------- */
  function micPour(btn, ta, msg, fin) {
    if (!btn || !ta) return; ta.dataset.micPropre = '1'; const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, base = '';
    const dire = h => { if (msg) msg.innerHTML = h; };
    btn.onclick = () => {
      if (!SR) { dire('<span class="err">La dictée n’est pas disponible sur ce navigateur. Sur iPhone, utilisez le micro 🎤 du clavier ; sur ordinateur, Chrome, Edge ou Safari.</span>'); return; }
      if (rec) { rec.stop(); return; }
      rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true;
      base = ta.value.trim(); let ok = '';
      rec.onresult = ev => { let tmp = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const r = ev.results[i]; if (r.isFinal) ok += r[0].transcript.trim() + ' '; else tmp += r[0].transcript; } ta.value = [base, (ok + tmp).trim()].filter(Boolean).join(base && !/[.,;]$/.test(base) ? ', ' : ' '); ta.dispatchEvent(new Event('input')); };
      rec.onerror = ev => dire(`<span class="err">${ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Le micro est bloqué : autorisez-le dans le navigateur, puis réessayez.' : ev.error === 'no-speech' ? 'Je n’ai rien entendu : réessayez en parlant près du micro.' : 'La dictée s’est arrêtée. Réessayez.'}</span>`);
      rec.onend = () => { rec = null; btn.classList.remove('on'); if (!/err/.test(msg?.innerHTML || '')) dire(''); fin?.(); };
      try { rec.start(); btn.classList.add('on'); dire('<span class="muted">🔴 Je vous écoute… parlez, puis appuyez à nouveau sur 🎤 pour arrêter.</span>'); } catch { rec = null; dire('<span class="err">Impossible de démarrer la dictée ici.</span>'); }
    };
  }
  async function commandeIa() {
    document.querySelector('.aq-modal')?.remove();
    const conf = await api(A + '/ia/etat').catch(() => ({ actif: false, evenements: [], tarifs: {} }));
    const prods = cache.produits || await api(A + '/produits').catch(() => []); cache.produits = prods;
    const T = conf.tarifs || {}, O = conf.origine || { lat: 48.692674, lon: 2.212317 };
    const st = { step: 1, texte: '', f: null, art: [], km: '', villes: [], canal: '' };
    await chargerSources();
    const m = document.createElement('div'); m.className = 'modal aq-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const tete = (h, sub) => `<div class="aq-h"><div><p class="aq-eye">✨ Devis avec l’IA</p><h2>${h}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><button type="button" class="x" data-aqx aria-label="Fermer">×</button></div>
      <ol class="aq-steps">${['Infos du client', 'Fiche client', 'Commande'].map((t, i) => `<li class="${st.step === i + 1 ? 'on' : st.step > i + 1 ? 'done' : ''}">${st.step > i + 1 ? '✓' : i + 1} ${t}</li>`).join('')}</ol>`;
    const opt = (list, cur, first) => `<option value="">${first}</option>${list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}`;
    const kmAR = (lat, lon) => { const r = x => x * Math.PI / 180, d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(r(lat - O.lat) / 2) ** 2 + Math.cos(r(O.lat)) * Math.cos(r(lat)) * Math.sin(r(lon - O.lon) / 2) ** 2)); return Math.max(10, Math.round(d * 1.3 * 2)); };
    const visibles = prods.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre));
    const kmTxt = k => { const L = window.MGLivr; if (L && L.horsZone(m.querySelector('[name=cp]')?.value)) return 'Hors Île-de-France : tarif à proposer au client'; return L ? `${L.tranches(T).filter(t => t.kmCents).map(t => euros(k * t.kmCents)).join(' / ')} TTC selon le montant (offerte au-delà de ${euros(L.offerteDes(T) ?? 0)})` : ''; };
    const totaux = () => {
      const presta = st.art.filter(a => a.on).reduce((t, a) => t + (a.prixCents || 0) * a.qte, 0);
      const f = st.f || {}, pers = f.serveurs ? (T.personnel?.heureCents || 4188) * f.serveurs * Math.max(T.personnel?.minHeures || 4, +f.heures || 0) : 0;
      const pk = (T.packs || []).find(x => x.id === f.vaisselle), pack = pk ? pk.prixCents * (+f.invites || 0) : 0;
      const km = +st.km || 0, pu = window.MGLivr ? MGLivr.kmCents(T, presta) : 100, offerte = km && pu === 0, liv = km * pu; /* paliers de livraison */
      return { presta, pers, pack, liv, offerte, total: presta + pers + pack + liv };
    };
    const draw = () => {
      if (st.step === 1) m.innerHTML = `<div class="modal-in aq-in">${tete('Décrivez la commande du client', 'Tapez ou dictez tout en vrac : nom, téléphone, e-mail, date, nombre d’invités, ville de livraison, ce qu’il veut manger, le personnel… L’IA prépare la fiche client et la commande avec le catalogue Magnolia (prix TTC, minimums). 📂 Elle part de l’ancien devis le plus proche (signés en priorité) et vous propose les compléments souvent pris avec. Rien n’est envoyé au client.')}
        ${conf.actif ? '' : '<p class="aq-warn">L’IA n’est pas encore activée sur le site : il faut ajouter la clé <b>ANTHROPIC_API_KEY</b> dans les variables Railway. En attendant, vous pouvez créer le devis à la main (« + Nouveau devis »).</p>'}
        <div class="aq-nrow"><textarea id="aqTexte" rows="7" placeholder="ex. Sophie Durand, 06 12 34 56 78, sophie.durand@gmail.com, anniversaire de ses 40 ans le 14 mars, 40 personnes à Massy 91300, livraison 19 h, buffet antillais avec accras et colombo de poulet, 2 serveurs 5 h, vaisselle en dur">${esc(st.texte)}</textarea><button type="button" class="aq-mic" id="aqMic" title="Dicter" aria-label="Dicter">🎤</button></div><p class="aq-nmsg" id="aqNMsg"></p>
        <div class="aq-f"><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn ghost" data-aqx>Annuler</button><button type="button" class="btn" id="aqGo"${conf.actif ? '' : ' disabled'}>✨ Préparer la fiche client</button></div></div>`;
      else if (st.step === 2) { const f = st.f;
        m.innerHTML = `<div class="modal-in aq-in">${tete('Vérifiez la fiche client', 'L’IA a rempli ce qu’elle a compris. Corrigez si besoin, puis composez la commande.')}
        <form id="aqForm" class="aq-g" autocomplete="off">
          <label>Prénom<input name="prenom" value="${esc(f.prenom)}" data-prenom></label><label>NOM<input name="nom" value="${esc(f.nom)}" data-nomfam></label>
          <label>Téléphone<input name="tel" type="tel" value="${esc(f.tel)}"></label><label>E-mail<input name="email" type="email" value="${esc(f.email)}"></label>
          <label>Société<input name="societe" value="${esc(f.societe)}"></label><label>🧭 Origine du contact <small class="muted">(par où le client nous a trouvés)</small>${selSource('canal', st.canal || '')}</label><label>Événement<select name="type">${opt(conf.evenements || [], f.type, 'Choisir')}</select></label>
          <label>Date<input name="date" type="date" value="${esc(f.date)}"></label><label>Heure de livraison<input name="horaire" value="${esc(f.horaire)}" placeholder="ex. 19 h"></label>
          <label>Invités<input name="invites" type="number" min="1" inputmode="numeric" value="${esc(f.invites)}"></label><label>Budget TTC (€)<input name="budget" type="number" min="0" inputmode="numeric" value="${esc(f.budget)}"></label>
          <label>Code postal de livraison<input name="cp" inputmode="numeric" maxlength="5" value="${esc(f.cp)}"></label><label>Ville<select name="ville">${st.villes.length ? st.villes.map(v => `<option${v.nom === f.ville ? ' selected' : ''}>${esc(v.nom)}</option>`).join('') : `<option>${esc(f.ville || 'D’abord le code postal')}</option>`}</select></label>
          <label class="aq-wide">Adresse de livraison<input name="adresse" value="${esc(f.adresse)}"></label>
          <label>Livraison (km aller-retour)<input name="km" type="number" min="0" inputmode="numeric" value="${esc(st.km)}"><small class="muted" id="aqKm">${st.km ? kmTxt(st.km) : 'Calculé avec le code postal'}</small></label>
          <label>Vaisselle<select name="vaisselle">${opt((T.packs || []).map(p => [p.id, `${p.label} (${euros(p.prixCents)} TTC/pers.)`]), f.vaisselle, 'Pas de pack vaisselle')}</select></label>
          <label>Serveurs<input name="serveurs" type="number" min="0" inputmode="numeric" value="${esc(f.serveurs)}"></label><label>Heures de service<input name="heures" type="number" min="0" inputmode="numeric" value="${esc(f.heures)}"><small class="muted">${euros(T.personnel?.heureCents || 4188)} TTC/h, ${T.personnel?.minHeures || 4} h minimum</small></label>
          <label class="aq-wide">Notes pour le devis<textarea name="notes" rows="3">${esc(f.notes)}</textarea></label>
        </form>
        <div class="aq-f"><button type="button" class="btn ghost" data-aqback="1">← Modifier le texte</button><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn" id="aqProd">✨ Composer la commande</button></div></div>`;
        const cp = m.querySelector('[name=cp]'), vi = m.querySelector('[name=ville]'), km = m.querySelector('[name=km]');
        const majKm = () => { const v = st.villes.find(x => x.nom === vi.value); if (v) { st.km = kmAR(v.lat, v.lon); km.value = st.km; m.querySelector('#aqKm').textContent = kmTxt(st.km); } };
        const villes = async () => { const c = cp.value.replace(/\D/g, '').slice(0, 5); cp.value = c; if (c.length !== 5) return;
          try { st.villes = (await fetch(`https://geo.api.gouv.fr/communes?codePostal=${c}&fields=nom,centre&format=json`).then(x => x.json())).map(x => ({ nom: x.nom, lat: x.centre?.coordinates?.[1], lon: x.centre?.coordinates?.[0] })).filter(x => x.lat); } catch { st.villes = []; }
          const want = st.f.ville && st.villes.find(v => v.nom.toLowerCase() === st.f.ville.toLowerCase());
          vi.innerHTML = st.villes.length ? st.villes.map(v => `<option${want && v === want ? ' selected' : ''}>${esc(v.nom)}</option>`).join('') : '<option value="">Ville introuvable</option>'; if (!st.km || want) majKm(); };
        cp.addEventListener('input', villes); vi.addEventListener('change', majKm); km.addEventListener('input', () => { st.km = +km.value || ''; });
        if (cp.value && !st.villes.length) villes();
      } else {
        const t = totaux(), ligne = (a, i) => `<div class="aq-a${a.on ? ' on' : ''}"><input type="checkbox" data-aqon="${i}"${a.on ? ' checked' : ''} aria-label="Garder">${a.photo ? `<img src="${esc(a.photo)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'aq-noph'}))">` : '<span class="aq-noph"></span>'}
          <div class="aq-at"><b>${titreHtml(a.titre)}</b><small>${esc([a.rubrique, a.prixCents == null ? 'prix à confirmer' : euros(a.prixCents) + ' TTC / ' + (a.unite || 'unité'), 'minimum ' + a.min].filter(Boolean).join(' · '))}</small>${a.pourquoi ? `<em>✨ ${esc(a.pourquoi)}</em>` : ''}
          <input class="aq-note" data-aqnote="${i}" value="${esc(a.note)}" placeholder="Choix du client, précisions (facultatif)"></div>
          <label class="aq-q">Quantité<input type="number" min="${a.min}" inputmode="numeric" data-aqq="${i}" value="${a.qte}"><small>${a.prixCents == null ? '—' : euros(a.prixCents * a.qte)}</small></label></div>`;
        m.innerHTML = `<div class="modal-in aq-in">${tete('La commande proposée', `Pour ${esc([st.f.prenom, st.f.nom].filter(Boolean).join(' ') || 'le client')}${st.f.invites ? ' · ' + st.f.invites + ' invités' : ''} · décochez ce qui ne convient pas, ajustez les quantités (jamais sous le minimum), ajoutez une prestation si besoin.`)}
          ${st.base ? `<div class="anc-base"><p>📂 L’IA est partie de l’ancien devis <b>${esc(st.base.numero)}</b> <span class="pill d-${st.base.statut}">${DSTAT[st.base.statut] || ''}</span>${st.base.modele ? ' ⭐' : ''}, le plus proche de la demande, puis l’a adapté (invités, prix actuels du catalogue).</p><small class="muted">${esc([st.base.clientNom, st.base.type, st.base.invites ? st.base.invites + ' invités' : '', euros(st.base.ttcCents) + ' TTC à l’époque'].filter(Boolean).join(' · '))}${st.base.pourquoi?.length ? ' · ' + esc(st.base.pourquoi.join(', ')) : ''}</small></div>` : ''}
          <div class="aq-as">${st.art.map(ligne).join('') || '<p class="muted">L’IA n’a rien trouvé dans le catalogue : ajoutez les prestations ci-dessous.</p>'}</div>
          ${(() => { const C = (st.comp || []).filter(x => !st.art.some(a => a.slug === x.slug)); return C.length ? `<div class="anc-comp"><h3>🧩 Souvent pris avec <small class="muted">d’après les anciens devis signés</small></h3><div class="anc-cg">${C.map(x => `<div class="anc-ci">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : '<span class="anc-ph">🧩</span>'}<span><b>${esc(x.designation)}</b><small>${euros(x.puCents)}${x.unite ? ' / ' + esc(x.unite) : ''} · dans ${x.n} devis signé${x.n > 1 ? 's' : ''} sur ${x.sur}</small></span><button type="button" class="btn ghost sm" data-aqcomp="${esc(x.slug)}">+ Ajouter</button></div>`).join('')}</div></div>` : ''; })()}
          <select class="aq-add" data-aqadd><option value="">+ Ajouter une prestation du catalogue…</option>${visibles.map(p => `<option value="${esc(p.slug)}">${esc(titreTexte(p.titre))} · ${p.prixCents == null ? 'prix à confirmer' : euros(p.prixCents)}</option>`).join('')}</select>
          <dl class="aq-tot"><dt>Prestations</dt><dd>${euros(t.presta)}</dd>${t.pers ? `<dt>Personnel (${st.f.serveurs} × ${Math.max(T.personnel?.minHeures || 4, +st.f.heures || 0)} h)</dt><dd>${euros(t.pers)}</dd>` : ''}${t.pack ? `<dt>Pack vaisselle</dt><dd>${euros(t.pack)}</dd>` : ''}${st.km ? `<dt>Livraison (${st.km} km A/R)</dt><dd>${t.offerte ? 'offerte' : euros(t.liv)}</dd>` : ''}<dt class="g">Total estimé TTC</dt><dd class="g">${euros(t.total)}</dd></dl>
          <div class="aq-f"><button type="button" class="btn ghost" data-aqback="2">← Modifier la fiche</button><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn" id="aqMake"${st.art.some(a => a.on) ? '' : ' disabled'}>Préparer le devis</button></div></div>`;
      }
      if (st.step === 1) { const ta = m.querySelector('#aqTexte'); ta.oninput = () => { st.texte = ta.value; }; micPour(m.querySelector('#aqMic'), ta, m.querySelector('#aqNMsg'), () => { st.texte = ta.value; }); }
    };
    const lireForm = () => { const f = new FormData(m.querySelector('#aqForm')), g = k => String(f.get(k) ?? '').trim(); st.f = { prenom: g('prenom'), nom: g('nom'), tel: g('tel'), email: g('email'), societe: g('societe'), type: g('type'), date: g('date'), horaire: g('horaire'), invites: +g('invites') || '', budget: +g('budget') || '', cp: g('cp'), ville: st.villes.length ? g('ville') : st.f.ville, adresse: g('adresse'), vaisselle: g('vaisselle'), serveurs: +g('serveurs') || '', heures: +g('heures') || '', notes: g('notes') }; st.km = +g('km') || ''; st.canal = g('canal') === NOUV_SRC ? '' : g('canal'); };
    const occupe = (id, on, html) => { const b = m.querySelector(id), msg = m.querySelector('#aqMsg'); if (b) b.disabled = on; if (msg) msg.innerHTML = html || ''; };
    const ajout = p => { const min = Math.max(1, +p.min || 1); return { slug: p.slug, titre: p.titre, rubrique: '', unite: p.unite || '', prixCents: p.prixCents ?? null, min, qte: Math.max(min, p.unite === 'personne' ? +st.f.invites || min : min), note: '', pourquoi: '', photo: p.photos?.[0]?.src || '', on: true }; };
    m.addEventListener('input', e => {
      const q = e.target.closest('[data-aqq]'); if (q) { const a = st.art[+q.dataset.aqq]; a.qte = Math.max(1, Math.round(+q.value || 0)); q.nextElementSibling.textContent = a.prixCents == null ? '—' : euros(a.prixCents * a.qte); return; }
      const n = e.target.closest('[data-aqnote]'); if (n) st.art[+n.dataset.aqnote].note = n.value;
    });
    m.addEventListener('change', e => {
      const q = e.target.closest('[data-aqq]'); if (q) { const a = st.art[+q.dataset.aqq]; if (a.qte < a.min) { a.qte = a.min; toast(`Minimum ${a.min} pour « ${a.titre} ».`); } draw(); return; }
      const ad = e.target.closest('[data-aqadd]'); if (ad) { const p = visibles.find(x => x.slug === ad.value); if (p && !st.art.some(a => a.slug === p.slug)) st.art.push(ajout(p)); draw(); }
    });
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-aqx]')) { m.remove(); return; }
      const bk = e.target.closest('[data-aqback]'); if (bk) { st.step = +bk.dataset.aqback; draw(); return; }
      const on = e.target.closest('[data-aqon]'); if (on) { st.art[+on.dataset.aqon].on = on.checked; draw(); return; }
      const cp = e.target.closest('[data-aqcomp]'); if (cp) { const p = visibles.find(x => x.slug === cp.dataset.aqcomp); if (p && !st.art.some(a => a.slug === p.slug)) { st.art.push({ ...ajout(p), pourquoi: 'souvent pris avec ces produits' }); draw(); } return; }
      if (e.target.closest('#aqGo')) {
        st.texte = m.querySelector('#aqTexte').value.trim(); if (st.texte.length < 5) { occupe('#aqGo', false, '<span class="err">Écrivez ou dictez d’abord les infos du client.</span>'); return; }
        occupe('#aqGo', true, '<span class="muted">L’IA lit la demande…</span>');
        try { st.f = (await api(A + '/ia/fiche', { method: 'POST', body: { texte: st.texte } })).fiche; st.villes = []; st.km = ''; st.step = 2; draw(); }
        catch (err) { occupe('#aqGo', false, `<span class="err">${esc(err.message)}</span>`); }
        return;
      }
      if (e.target.closest('#aqProd')) {
        lireForm(); if (!st.f.nom && !st.f.prenom) { occupe('#aqProd', false, '<span class="err">Indiquez au moins le nom du client.</span>'); return; }
        occupe('#aqProd', true, '<span class="muted">L’IA compose la commande avec le catalogue…</span>');
        try { const r = await api(A + '/ia/produits', { method: 'POST', body: { fiche: st.f, texte: st.texte } }); st.art = r.articles.map(a => ({ ...a, on: true })); st.base = r.base || null; st.comp = r.complements || []; st.step = 3; draw(); }
        catch (err) { occupe('#aqProd', false, `<span class="err">${esc(err.message)}</span>`); }
        return;
      }
      if (e.target.closest('#aqMake')) {
        occupe('#aqMake', true, '<span class="muted">Création du devis…</span>');
        try {
          const r = await api(A + '/actions/commande-ia', { method: 'POST', body: { fiche: st.f, km: st.km, canal: st.canal || '', texte: st.texte, base: st.base?.numero || '', articles: st.art.filter(a => a.on).map(a => ({ slug: a.slug, qte: a.qte, note: a.note })) } });
          m.remove(); toast('✨ Devis préparé avec l’IA : vérifiez les lignes et le message, enregistrez, puis envoyez.'); location.hash = '#/devis/' + r.devisId;
        } catch (err) { occupe('#aqMake', false, `<span class="err">${esc(err.message)}</span>`); }
      }
    });
    draw(); document.body.append(m); m.querySelector('#aqTexte')?.focus();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-aiq]')) commandeIa(); });

  /* ---------- devis ---------- */
  async function devis(id) {
    if (id === 'nouveau') { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: {} }); location.replace('#/devis/' + r.id + (/[?&]anciens=1/.test(location.hash) ? '?anciens=1' : '')); return ''; }
    if (id) return devisEdit(id);
    const [tous, eq, R0] = await Promise.all([api(A + '/devis'), cache.equipe ? null : api(A + '/actions/equipe').catch(() => []), cache.R ? null : api(A + '/site')]);
    if (eq) cache.equipe = eq.filter(u => !u.desactive); if (R0) cache.R = R0;
    /* commercial du devis : celui choisi dans le devis ; ancien devis sans choix = premier de la liste (comme sur le devis client) */
    const comDe = d => d.commercial === null ? '' : String(d.commercial?.nom || (cache.R?.alertes?.personnes || []).find(x => x.nom)?.nom || '').trim();
    if (SV.o == null) { const m = mem.get('mg_commercial'); SV.o = m != null ? m : ''; }
    const noms = [...new Set([...commerciaux(), ...tous.map(comDe)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const qui = SV.o && (SV.o === '—' || noms.includes(SV.o)) ? SV.o : '';
    const list = tous.filter(d => !qui || (qui === '—' ? !comDe(d) : comDe(d) === qui)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const effacable = d => d.statut !== 'accepte';
    const filtre = `<div class="dv-who"><span class="qs-olab">Commercial</span><label class="qs-csel"><span aria-hidden="true">👤</span><select data-dvcom aria-label="Choisir le commercial"><option value=""${!qui ? ' selected' : ''}>Tous les commerciaux</option>${noms.map(n => `<option value="${esc(n)}"${qui === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="—"${qui === '—' ? ' selected' : ''}>Sans commercial</option></select></label><span class="muted sm">${list.length} devis${qui ? ` · ${euros(list.reduce((t, d) => t + tot(d).ttc, 0))} TTC` : ''}</span></div>`;
    if (tous.length && !list.length) return page('Devis', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', filtre + '<div class="vide"><p>Aucun devis pour ce commercial.</p></div>');
    return page('Devis', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', list.length ? `${filtre}<div class="row sel-bar">${peut('effacerDevis') ? '<button type="button" class="btn danger sm" data-effacer disabled>🗑 Effacer</button>' : ''}<span class="muted sm" data-nbsel>Cochez les devis à effacer.</span></div><div class="table"><table><thead><tr><th class="ck"><input type="checkbox" data-tout aria-label="Tout cocher" title="Tout cocher"></th><th>N°</th><th>Client</th><th>Nature de l’événement</th><th>Date</th><th class="n">Personnes</th><th>Commercial</th><th class="n">Montants 🔒</th><th>Statut</th><th>Vu par le client</th></tr></thead><tbody>
      ${list.map(d => `<tr data-href="#/devis/${d.id}"><td class="ck">${effacable(d) ? `<input type="checkbox" data-sel="${esc(d.id)}" data-num="${esc(d.numero)}" data-st="${esc(d.statut)}" aria-label="Sélectionner ${esc(d.numero)}">` : '<span title="Devis signé : ne peut pas être effacé">🔒</span>'}</td><td class="nw"><b>${esc(d.numero)}</b>${d.modele ? ' <span title="Modèle de l’équipe">⭐</span>' : ''}${(d.commentaires || []).length ? ` <span title="${d.commentaires.length} commentaire(s) du client">💬</span>` : ''}</td><td>${esc(d.clientNom)}${canalDe(d) ? `<small>${pillSource(canalDe(d))}</small>` : ''}</td><td>${esc(d.evenement?.type || '—')}</td><td class="nw">${d.evenement?.date ? dateFr(d.evenement.date) : '—'}</td><td class="n nw">${d.evenement?.invites ? esc(d.evenement.invites) + ' pers.' : '—'}</td><td>${comDe(d) ? esc(comDe(d)) : d.auto ? '<span class="pill ia-pill" title="Devis créé et envoyé automatiquement par l’IA">✨ IA</span>' : '—'}</td><td class="k4c">${k4Html(chiffres(d), '#/devis/' + d.id)}</td><td><span class="pill d-${d.statut}">${DSTAT[d.statut]}</span></td><td>${d.vuLe ? dateH(d.vuLe) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vide"><p>Aucun devis.</p><p class="muted">Créez un devis depuis une demande (les lignes sont reprises) ou partez d’un devis vierge.</p></div>');
  }
  devis.after = id => {
    if (id && id !== 'nouveau') return devisEdit.after(id);
    $('[data-dvcom]')?.addEventListener('change', e => { SV.o = e.target.value; mem.set('mg_commercial', SV.o); render(); });
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (e.target.closest('.ck')) return; location.hash = tr.dataset.href; }));
    /* cases à cocher + « Effacer » (le devis part dans la corbeille ; signés et facturés protégés) */
    const coches = () => $$('[data-sel]').filter(x => x.checked);
    const maj = () => { const n = coches().length; const b = $('[data-effacer]'); if (!b) return; b.disabled = !n; b.textContent = n ? `🗑 Effacer ${n} devis` : '🗑 Effacer'; $('[data-nbsel]').textContent = n ? `${n} devis coché${n > 1 ? 's' : ''}` : 'Cochez les devis à effacer.'; const t = $('[data-tout]'); const all = $$('[data-sel]'); t.checked = all.length > 0 && n === all.length; t.indeterminate = n > 0 && n < all.length; };
    $$('[data-sel]').forEach(x => x.addEventListener('change', maj));
    $('[data-tout]')?.addEventListener('change', e => { $$('[data-sel]').forEach(x => { x.checked = e.target.checked; }); maj(); });
    $('[data-effacer]')?.addEventListener('click', async () => {
      const L = coches(); if (!L.length) return;
      const envoyes = L.filter(x => x.dataset.st !== 'brouillon').length;
      if (!confirm(`Effacer définitivement ${L.length > 1 ? 'ces ' + L.length + ' devis' : 'le devis ' + L[0].dataset.num} ?\n\n${L.map(x => x.dataset.num).join(', ')}${envoyes ? `\n\nAttention : ${envoyes} de ces devis a déjà été envoyé au client. Son lien ne fonctionnera plus.` : ''}`)) return;
      let ok = 0; const err = [];
      for (const x of L) { try { await api(`${A}/devis/${x.dataset.sel}`, { method: 'DELETE' }); ok++; } catch (e) { err.push(e.message); } }
      if (err.length) toast((ok ? `${ok} devis effacé(s). ` : '') + err.join(' '), true); else toast(`${ok} devis effacé${ok > 1 ? 's' : ''}.`);
      render();
    });
  };

  /* ---------- les 4 chiffres d'un devis (Jean-Luc, 2026-11-25) : HT · TTC · Marge HT · Marge % — INTERNE à l'équipe ----------
     Une ligne sans prix d'achat n'est jamais comptée à 0 : point d'exclamation rouge, avec la liste des produits et un lien vers leur fiche. */
  const ficheDe = slug => slug && (cache.produits || []).find(x => x.slug === slug);
  const coutDepuisFiche = (l, p) => { /* même règle que le serveur (server/devis.js, coutLigne) */
    if (!p || p.coutCents == null) return null;
    const q = Math.max(1, +l.qte || 1); let c = p.coutCents;
    for (const g of p.groupes || []) for (const id of l.choix?.[g.id] || []) {
      const [oid, n] = String(id).split(':'); const o = (g.options || []).find(x => x.id === oid);
      if (!o || (g.mode === 'quantites' && o.supCents)) continue;
      if (o.coutCents == null) { if (o.supCents) return null; continue; }
      c += n ? Math.round(o.coutCents * n / q) : o.coutCents;
    }
    return c;
  };
  /* lignes d'un devis, avec le prix d'achat repris de la fiche s'il a été tapé après la création du devis (comme à l'ouverture du devis) */
  const lignesChiffrees = d => (d.lignes || []).map(l => {
    if (l.type === 'titre' || l.coutCents != null || !l.produit) return l;
    const p = ficheDe(l.produit);
    return p && p.coutCents != null && (p.prixCents == null || l.puCents === p.prixCents) ? { ...l, coutCents: p.coutCents } : l;
  });
  /* demande du site sans devis : estimation à partir de la sélection du client et des fiches du catalogue */
  const lignesDemande = d => (d.lignes || []).filter(l => !l.surDevis).flatMap(l => {
    const p = ficheDe(l.slug), q = +l.qte || 1, pu = (l.prixCents ?? p?.prixCents ?? 0) + (l.supCents || 0), nom = titreTexte(l.titre || p?.titre || '');
    const out = [{ designation: nom, produit: l.slug, qte: q, puCents: pu, coutCents: coutDepuisFiche(l, p), tva: p?.tva ?? 10 }];
    const reste = (l.totalCents ?? pu * q) - pu * q; /* personnel, pack… compris dans l'estimation : sans prix d'achat */
    if (reste > 0) out.push({ designation: nom + ' · ' + (l.personnel ? 'personnel' : 'pack et suppléments'), qte: 1, puCents: reste, coutCents: null, tva: 10 });
    return out;
  });
  function chiffres(d, opt = {}) {
    const L = (opt.lignes || lignesChiffrees(d)).filter(l => l.type !== 'titre');
    const t = tot({ ...d, lignes: L }); const g = t.mg;
    let ht = t.ht, ttc = t.ttc;
    if (opt.ttc != null && opt.ttc > ttc) { ht += Math.round((opt.ttc - ttc) / 1.2); ttc = opt.ttc; } /* livraison, etc. de l'estimation du site (TVA 20 %) */
    const manq = L.filter(l => +l.qte && (l.coutCents == null || l.coutCents === '')).map(l => ({ nom: String(l.designation || 'Ligne sans nom').replace(/\*\*/g, ''), p: ficheDe(l.produit) }));
    return { ht, ttc, marge: g.connu ? g.marge : null, pct: g.connu && g.vHt ? Math.round(1000 * g.marge / g.vHt) / 10 : null, manq };
  }
  const k4Html = (c, lien) => {
    if (!c || !c.ttc) return '<div class="k4 vide"><span class="muted sm">Montant à définir</span></div>';
    const pc = c.pct == null ? '—' : String(c.pct).replace('.', ',') + ' %', cl = c.marge == null ? '' : c.marge < 0 ? ' neg' : ' pos';
    const pop = c.manq.length ? `<span class="k4m" data-k4m tabindex="0" role="button" aria-label="Produits sans prix d’achat" title="${c.manq.length} produit${c.manq.length > 1 ? 's' : ''} sans prix d’achat : ${esc(c.manq.map(x => x.nom).join(', '))}">!<span class="k4pop"><b>⚠ ${c.manq.length} produit${c.manq.length > 1 ? 's' : ''} sans prix d’achat</b><small>non compté${c.manq.length > 1 ? 's' : ''} dans la marge : elle est partielle</small>${c.manq.map(x => x.p ? `<a href="#/catalogue/${esc(x.p.id || x.p.slug)}">${esc(x.nom)} <i>✏ corriger la fiche</i></a>` : `<span>${esc(x.nom)} <i>${lien ? `<a href="${lien}">ligne libre : à taper dans le devis</a>` : 'ligne libre'}</i></span>`).join('')}</span></span>` : '';
    return `<div class="k4${c.manq.length ? ' partiel' : ''}" title="🔒 Visible seulement par l’équipe">
      <div><small>HT</small><b>${euros(c.ht)}</b></div><div class="ttc"><small>TTC</small><b>${euros(c.ttc)}</b></div>
      <div class="mg${cl}"><small>Marge HT${pop}</small><b>${c.marge == null ? '—' : euros(c.marge)}</b></div><div class="mg${cl}"><small>Marge</small><b>${pc}</b></div></div>`;
  };
  /* clic sur le point d'exclamation : ouvre la liste (sans ouvrir la carte ou la ligne) ; un lien de la liste mène à la fiche */
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-k4m]');
    if (!m) { $$('[data-k4m].on').forEach(x => x.classList.remove('on')); return; }
    e.stopPropagation();
    if (e.target.closest('.k4pop a')) return;
    e.preventDefault(); const on = !m.classList.contains('on'); $$('[data-k4m].on').forEach(x => x.classList.remove('on')); m.classList.toggle('on', on);
  }, true);
  /* ligne de livraison (même règle que server/devis.js) : hors remise globale, verrouillée sans le droit Administrateur */
  const estLivraison = l => !!(l && (l.livraison || l.unite === 'km'));
  /* ligne de personnel (serveurs, barman, maître d'hôtel, régisseur…) : prix et remise réservés à l'administrateur, hors remise globale */
  const estPersonnel = l => !!(l && l.type !== 'titre' && (l.personnel === true || (l.produit && (cache.produits || []).some(p => p.slug === l.produit && (p.rubrique === 'personnel' || (p.autresRubriques || []).includes('personnel'))))));
  const horsRemise = l => estLivraison(l) || estPersonnel(l);
  function tot(d) {
    const L = (d.lignes || []).filter(l => l.type !== 'titre');
    const brut = L.reduce((s, l) => s + Math.round((l.puCents || 0) * (+l.qte || 0)), 0);
    const hors = L.filter(l => !horsRemise(l)).reduce((s, l) => s + Math.round((l.puCents || 0) * (+l.qte || 0)), 0);
    const remise = Math.min(hors, d.remiseCents || 0);
    const cout = L.reduce((s, l) => s + Math.round((l.coutCents || 0) * (+l.qte || 0)), 0);
    const r = hors ? (hors - remise) / hors : 1, ratio = l => (horsRemise(l) ? 1 : r);
    let ht = 0; const tva = {};
    for (const l of L) { const t = Math.round((l.puCents || 0) * (+l.qte || 0) * ratio(l)); const h = Math.round(t / (1 + (l.tva ?? 10) / 100)); ht += h; tva[l.tva ?? 10] = (tva[l.tva ?? 10] || 0) + t - h; }
    return { brut, remise, ttc: brut - remise, ht, tva, cout, mg: margeDevis(L, ratio) };
  }
  /* marge du devis : même calcul que le serveur (server/devis.js, marge) — HORS TAXES, interne à l'équipe.
     Une ligne sans prix d'achat n'est pas comptée à 0 : elle est listée « prix d'achat manquant ». */
  function margeDevis(L, ratio) {
    let vHt = 0, aHt = 0, aTtc = 0; const manquants = [];
    for (const l of L) {
      const q = +l.qte || 0; if (!q) continue; const k = 1 + (l.tva ?? 10) / 100;
      if (l.coutCents == null || l.coutCents === '') { manquants.push(String(l.designation || 'Ligne sans nom').replace(/\*\*/g, '')); continue; }
      const v = Math.round((l.puCents || 0) * q * ratio(l)), a = Math.round(l.coutCents * q);
      vHt += Math.round(v / k); aHt += Math.round(a / k); aTtc += a;
    }
    const m = vHt - aHt;
    return { vHt, aHt, aTtc, marge: m, pct: vHt ? Math.round(1000 * m / vHt) / 10 : null, manquants, connu: L.filter(l => +l.qte).length > manquants.length };
  }
  const margeHtml = t => {
    const g = t.mg, pc = g.pct == null ? '' : String(g.pct).replace('.', ',') + ' %';
    return `<h3>💰 Marge du devis <small>🔒 visible seulement par l’équipe, jamais par le client</small></h3>
      ${g.connu ? `<dl><div><dt>Vente HT ${g.manquants.length ? '<small>(lignes avec prix d’achat)</small>' : ''}</dt><dd>${euros(g.vHt)}</dd></div><div><dt>Achat HT</dt><dd>${euros(g.aHt)} <small>(${euros(g.aTtc)} TTC)</small></dd></div>
      <div class="big ${g.marge < 0 ? 'neg' : 'pos'}"><dt>Ce que l’on gagne (marge HT)</dt><dd>${euros(g.marge)}${pc ? ' · ' + pc : ''}</dd></div></dl>
      <p class="muted sm">Calcul hors taxes : la TVA collectée sur la vente est reversée à l’État, celle payée sur les achats est récupérée. Les prix restent saisis TTC.</p>` : '<p class="muted sm">Aucune ligne n’a encore de prix d’achat : la marge ne peut pas être calculée.</p>'}
      ${g.manquants.length ? `<p class="mg-manq">⚠ Prix d’achat manquant sur ${g.manquants.length} ligne${g.manquants.length > 1 ? 's' : ''} (non comptée${g.manquants.length > 1 ? 's' : ''} dans la marge) : ${g.manquants.map(esc).join(' · ')}. <small>Tapez-le dans la colonne « Achat HT », ou sur la fiche produit du catalogue.</small></p>` : g.connu ? '<p class="ok sm">✓ Toutes les lignes ont un prix d’achat.</p>' : ''}`;
  };

  /* même règle que le serveur (server/devis.js) : totalité sous 800 € TTC, 50 % au-dessus, sauf pourcentage forcé */
  function regleAcompte(ttc, d, T = {}) {
    const seuil = T.seuilAcompteCents ?? 80000, delai = T.delaiDeuxFoisJours ?? 10, force = d.acomptePct != null && d.acomptePct !== '';
    const ref = d.signature?.at ? new Date(d.signature.at) : new Date(), ev = d.evenement?.date ? new Date(d.evenement.date + 'T12:00:00') : null;
    const proche = !!ev && !Number.isNaN(+ev) && (ev - ref) / 86400e3 < delai;
    const raison = force ? '' : ttc < seuil ? 'seuil' : proche ? 'proche' : '';
    const pct = force ? +d.acomptePct : raison ? 100 : (T.acomptePct ?? 50);
    return { pct, auto: !force, seuil, delai, raison, cents: Math.round(ttc * pct / 100), total: pct >= 100 };
  }

  /* ---------- « 📂 Partir d'un ancien devis » (Jean-Luc, 2026-11-25, comme dans Teamleader) ----------
     Recherche dans TOUS les anciens devis, ⭐ modèles en tête, aperçu rapide, puis « Utiliser ce devis » :
     lignes reprises aux prix actuels du catalogue, quantités pour le nombre d'invités, sans les remises (server/anciens.js). */
  /* marge HT de l'ancien devis (🔒 interne) : pour savoir quel devis gagné était le plus intéressant */
  const ancMarge = x => x.marge ? `<p class="anc-mg ${x.marge.cents < 0 ? 'neg' : x.marge.pct >= 30 ? 'top' : ''}" title="Marge hors taxes, visible seulement par l’équipe">💰 Marge <b>${euros(x.marge.cents)} HT</b>${x.marge.pct != null ? ` · <b>${String(x.marge.pct).replace('.', ',')} %</b>` : ''}${x.marge.manquants ? `<small>⚠ ${x.marge.manquants} ligne${x.marge.manquants > 1 ? 's' : ''} sans prix d’achat, non comptée${x.marge.manquants > 1 ? 's' : ''}</small>` : ''}</p>` : '<p class="anc-mg nc">💰 Marge inconnue <small>(pas de prix d’achat sur ces lignes)</small></p>';
  const ancCarte = (x, { use = true } = {}) => `<article class="anc-c${x.modele ? ' star' : ''}" data-ancid="${esc(x.id)}">
      <div class="anc-h"><b>${esc(x.numero)}</b><button type="button" class="anc-star${x.modele ? ' on' : ''}" data-ancstar="${esc(x.id)}" title="${x.modele ? 'Retirer des modèles' : 'Marquer comme modèle : il apparaîtra en tête de liste'}" aria-label="Modèle">${x.modele ? '⭐' : '☆'}</button><span class="pill d-${x.statut}">${DSTAT[x.statut] || x.statut}</span></div>
      <p class="anc-cl">${esc(x.clientNom || '—')}${x.titre ? ` · <i>${esc(x.titre)}</i>` : ''}</p>
      <p class="anc-m">${x.type ? `<span>🎉 ${esc(x.type)}</span>` : ''}${x.date ? `<span>📅 ${dateFr(x.date)}</span>` : ''}${x.invites ? `<span>👥 ${x.invites}</span>` : ''}<b>${euros(x.ttcCents)}</b></p>
      ${ancMarge(x)}
      <ul class="anc-p">${x.produits.map(p => `<li>${esc(p)}</li>`).join('')}${x.nbLignes > x.produits.length ? `<li class="muted">+ ${x.nbLignes - x.produits.length} autre${x.nbLignes - x.produits.length > 1 ? 's' : ''}</li>` : ''}</ul>
      ${x.pourquoi?.length ? `<p class="anc-why">💡 ${esc(x.pourquoi.join(' · '))}</p>` : ''}
      <p class="anc-by muted sm">${x.commercial ? esc(x.commercial) + ' · ' : ''}créé le ${dateFr(String(x.createdAt).slice(0, 10))}</p>
      <div class="anc-a"><button type="button" class="btn ghost sm" data-ancvoir="${esc(x.id)}">👁 Aperçu</button>${use ? `<button type="button" class="btn sm" data-ancuse="${esc(x.id)}">Utiliser ce devis</button>` : ''}</div></article>`;
  async function ancStar(id, on) {
    try { await api(`${A}/actions/modele-devis/${id}`, { method: 'POST', body: { modele: on } }); toast(on ? '⭐ Marqué comme modèle : il sera proposé en tête de liste.' : 'Retiré des modèles.'); return true; }
    catch (e) { toast(e.message, true); return false; }
  }
  /* rapport de reprise lisible : prix changés, produits supprimés, quantités, remises */
  const ancRapport = r => {
    const R = r.rapport, out = [];
    if (R.invitesAvant && R.invitesApres && R.invitesAvant !== R.invitesApres) out.push(`👥 Quantités recalculées pour <b>${R.invitesApres} invités</b> (l’ancien devis était pour ${R.invitesAvant})${R.quantites ? ` : ${R.quantites} ligne${R.quantites > 1 ? 's' : ''} ajustée${R.quantites > 1 ? 's' : ''}` : ''}.`);
    if (R.prix.length) out.push(`💶 <b>Prix mis à jour</b> avec le catalogue actuel : ${R.prix.map(p => `${esc(p.nom)} <s>${euros(p.avant)}</s> → <b>${euros(p.apres)}</b>`).join(' · ')}.`);
    else out.push('✓ Tous les prix sont déjà ceux du catalogue actuel.');
    if (R.options.length) out.push(`⚠ Option payante choisie à l’époque, prix gardé : ${R.options.map(esc).join(' · ')}. <small>Vérifiez l’option.</small>`);
    if (R.supprimes.length) out.push(`<span class="err">⚠ N’existe plus dans le catalogue (ligne gardée à l’ancien prix, à vérifier ou supprimer) : ${R.supprimes.map(esc).join(' · ')}.</span>`);
    if (R.masques.length) out.push(`⚠ Masqué sur le site : ${R.masques.map(esc).join(' · ')}.`);
    if (R.remises) out.push('✂ Les remises de l’ancien devis ne sont pas reprises.');
    if (R.livraison) out.push('🚚 Livraison reprise telle quelle : vérifiez la distance du nouveau client.');
    return `<ul class="anc-rap">${out.map(x => `<li>${x}</li>`).join('')}</ul>`;
  };
  /* fenêtre de recherche. opts : { pour, invites, type, nbLignes, onUse(r, mode) } */
  async function anciensDevis(opts = {}) {
    document.querySelector('.anc-modal')?.remove();
    const m = document.createElement('div'); m.className = 'modal anc-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const F = { q: '', type: '', invites: '', bmin: '', bmax: '', du: '', au: '', com: '', signes: false, modeles: false, tri: '' };
    let data = null, vue = 'liste', courant = null;
    const tous = () => [...(data?.proches || []), ...(data?.resultats || [])];
    const filtre = () => Object.entries(F).some(([k, v]) => k !== 'tri' && v && v !== false);
    const qs = () => { const p = new URLSearchParams(); if (opts.pour) p.set('pour', opts.pour); if (opts.invites) p.set('refInvites', opts.invites); if (opts.type) p.set('refType', opts.type); for (const [k, v] of Object.entries(F)) if (v) p.set(k, v === true ? '1' : v); return p.toString(); };
    const avecTri = () => !!F.tri;
    const charger = async () => { try { data = await api(A + '/anciens-devis?' + qs()); } catch (e) { toast(e.message, true); data = { resultats: [], proches: [], total: 0, commerciaux: [], types: [] }; } dessinRes(); };
    const tete = `<div class="aq-h"><div><p class="aq-eye">📂 Partir d’un ancien devis</p><h2>Retrouvez un devis qui ressemble à la demande</h2><p class="muted">Tous les devis de l’équipe, toutes dates, signés ou non. ⭐ = modèles de l’équipe, toujours en tête. « Utiliser ce devis » reprend les lignes aux <b>prix actuels</b>, pour le nombre d’invités du nouveau client, sans les remises.</p></div><button type="button" class="x" data-ancx aria-label="Fermer">×</button></div>`;
    const dessin = () => {
      m.innerHTML = `<div class="modal-in anc-in">${tete}
        <form class="anc-f" autocomplete="off" onsubmit="return false">
          <label class="anc-q">Mot-clé <small>(produit, client, nom de la proposition, n°)</small><input type="search" name="q" placeholder="🔍 ex. buffet antillais, mariage, accras, Dupont…" value="${esc(F.q)}"></label>
          <label>Type d’événement<select name="type"><option value="">Tous</option></select></label>
          <label>Invités <small>(± 20 %)</small><input type="number" name="invites" min="1" inputmode="numeric" value="${esc(F.invites)}" placeholder="ex. 50"></label>
          <label class="anc-plus">Budget TTC de<input type="number" name="bmin" min="0" inputmode="numeric" value="${esc(F.bmin)}" placeholder="€"></label>
          <label class="anc-plus">à<input type="number" name="bmax" min="0" inputmode="numeric" value="${esc(F.bmax)}" placeholder="€"></label>
          <label class="anc-plus">Période du<input type="date" name="du" value="${esc(F.du)}"></label>
          <label class="anc-plus">au<input type="date" name="au" value="${esc(F.au)}"></label>
          <label class="anc-plus">Commercial<select name="com"><option value="">Tous</option></select></label>
          <div class="anc-ck"><label class="anc-tri">Trier par<select name="tri">${[['', 'Pertinence (⭐ modèles, signés, récents)'], ['marge', '💰 Meilleure marge en €'], ['margePct', '💰 Meilleure marge en %'], ['montant', 'Montant TTC le plus élevé'], ['recent', 'Plus récents']].map(([v, l]) => `<option value="${v}"${F.tri === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="chk"><input type="checkbox" name="signes"${F.signes ? ' checked' : ''}> Signés seulement</label><label class="chk"><input type="checkbox" name="modeles"${F.modeles ? ' checked' : ''}> ⭐ Modèles seulement</label><button type="button" class="lnk sm anc-plusb" data-ancplus>⚙ Plus de filtres (budget, période, commercial)</button><button type="button" class="lnk sm" data-ancraz>Effacer les filtres</button></div>
        </form>
        <div class="anc-res" id="ancRes"><p class="muted">Recherche…</p></div></div>`;
      const f = m.querySelector('.anc-f');
      f.addEventListener('input', e => { const el = e.target; if (!el.name) return; F[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim(); clearTimeout(f._t); f._t = setTimeout(charger, el.type === 'search' ? 300 : 150); });
    };
    const dessinRes = () => {
      const res = m.querySelector('#ancRes'); if (!res) return;
      const f = m.querySelector('.anc-f');
      const sel = (n, L) => { const s2 = f.elements[n], cur = F[n]; s2.innerHTML = '<option value="">Tous</option>' + L.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join(''); };
      sel('type', data.types || []); sel('com', data.commerciaux || []);
      const pr = !filtre() && !avecTri() && (data.proches || []).length;
      res.innerHTML = `${pr ? `<h3 class="anc-t">💡 Devis proches de cette demande <small class="muted">(type d’événement, invités, produits ; signés en premier)</small></h3><div class="anc-g">${data.proches.map(x => ancCarte(x)).join('')}</div>` : ''}
        <h3 class="anc-t">${filtre() ? `${data.total} devis trouvé${data.total > 1 ? 's' : ''}` : 'Tous les anciens devis'}${F.tri === 'marge' || F.tri === 'margePct' ? ' <small class="muted">· les plus rentables d’abord</small>' : ''}${data.total > 60 ? ' <small class="muted">(60 premiers : affinez la recherche)</small>' : ''}</h3>
        ${data.resultats.length ? `<div class="anc-g">${data.resultats.map(x => ancCarte(x)).join('')}</div>` : '<p class="muted">Aucun ancien devis ne correspond : élargissez la recherche (moins de filtres, autre mot-clé).</p>'}`;
    };
    const apercu = x => {
      vue = 'apercu'; courant = x;
      m.querySelector('.modal-in').innerHTML = `<div class="aq-h"><div><p class="aq-eye">📂 Aperçu de l’ancien devis</p><h2>${esc(x.numero)} <span class="pill d-${x.statut}">${DSTAT[x.statut] || ''}</span>${x.modele ? ' ⭐' : ''}</h2><p class="muted">${esc([x.clientNom, x.type, x.date ? dateFr(x.date) : '', x.invites ? x.invites + ' invités' : '', x.lieu].filter(Boolean).join(' · '))}</p></div><button type="button" class="x" data-ancx aria-label="Fermer">×</button></div>
        ${ancMarge(x)}<div class="anc-ap"><table class="anc-tl"><thead><tr><th>Désignation</th><th class="n">Qté</th><th class="n">PU TTC</th></tr></thead><tbody>${x.lignes.map(l => l.titre ? `<tr class="t"><td colspan="3">${esc(l.designation)}</td></tr>` : `<tr><td>${titreHtml(l.designation)}</td><td class="n">${esc(l.qte)} ${esc(l.unite)}</td><td class="n">${euros(l.puCents)}</td></tr>`).join('')}</tbody></table><p class="anc-tot">Total TTC de l’époque <b>${euros(x.ttcCents)}</b></p>${x.masque ? '' : `<p class="sm"><a href="#/devis/${esc(x.id)}" target="_blank">Ouvrir ce devis dans un nouvel onglet ↗</a></p>`}</div>
        <div class="aq-f"><button type="button" class="btn ghost" data-ancback>← Retour aux résultats</button><span class="aq-sp"></span><button type="button" class="btn ghost" data-ancstar="${esc(x.id)}">${x.modele ? '⭐ Modèle' : '☆ Marquer comme modèle'}</button><button type="button" class="btn" data-ancuse="${esc(x.id)}">Utiliser ce devis</button></div>`;
    };
    const utiliser = async id => {
      let r; try { r = await api(`${A}/anciens-devis/${id}/reprendre`, { method: 'POST', body: { invites: +opts.invites || 0 } }); } catch (e) { toast(e.message, true); return; }
      vue = 'confirm';
      const deja = +opts.nbLignes > 0;
      m.querySelector('.modal-in').innerHTML = `<div class="aq-h"><div><p class="aq-eye">📂 Reprendre ${esc(r.source.numero)}</p><h2>${r.lignes.filter(l => l.type !== 'titre').length} lignes prêtes pour le nouveau client</h2><p class="muted">Rien n’est encore enregistré : vous pourrez tout retravailler, puis « Enregistrer ».</p></div><button type="button" class="x" data-ancx aria-label="Fermer">×</button></div>
        ${ancRapport(r)}
        <div class="aq-f"><button type="button" class="btn ghost" data-ancback>← Retour</button><span class="aq-sp"></span>${deja ? `<button type="button" class="btn ghost" data-ancok="ajouter">＋ Ajouter à la suite des ${opts.nbLignes} lignes</button><button type="button" class="btn" data-ancok="remplacer">Remplacer les lignes actuelles</button>` : '<button type="button" class="btn" data-ancok="remplacer">✓ Utiliser ce devis</button>'}</div>`;
      m._r = r;
    };
    m.addEventListener('click', async e => {
      if (e.target === m || e.target.closest('[data-ancx]')) { m.remove(); return; }
      const st = e.target.closest('[data-ancstar]'); if (st) {
        const id = st.dataset.ancstar, x = tous().find(y => y.id === id) || courant, on = !x?.modele;
        if (!(await ancStar(id, on))) return;
        for (const y of tous()) if (y.id === id) y.modele = on; if (courant?.id === id) courant.modele = on;
        if (vue === 'apercu') apercu(courant); else m.querySelectorAll(`[data-ancid="${id}"]`).forEach(c => { c.classList.toggle('star', on); const b = c.querySelector('.anc-star'); b.classList.toggle('on', on); b.textContent = on ? '⭐' : '☆'; });
        return;
      }
      if (e.target.closest('[data-ancplus]')) { m.querySelector('.anc-f').classList.toggle('ouvert'); return; }
      if (e.target.closest('[data-ancraz]')) { for (const k of Object.keys(F)) F[k] = typeof F[k] === 'boolean' ? false : ''; dessin(); charger(); return; }
      if (e.target.closest('[data-ancback]')) { vue = 'liste'; dessin(); dessinRes(); return; }
      const v = e.target.closest('[data-ancvoir]'); if (v) { const x = tous().find(y => y.id === v.dataset.ancvoir); if (x) apercu(x); return; }
      const u = e.target.closest('[data-ancuse]'); if (u) { u.disabled = true; await utiliser(u.dataset.ancuse); return; }
      const ok = e.target.closest('[data-ancok]'); if (ok && m._r) { opts.onUse?.(m._r, ok.dataset.ancok); m.remove(); }
    });
    /* le bouton ☆ d'une carte change sa propre classe ; dans l'aperçu, c'est un bouton texte */
    dessin(); document.body.append(m);
    charger().then(() => { if (opts.direct) utiliser(opts.direct); else if (opts.apercu) { const x = tous().find(y => y.id === opts.apercu); if (x) apercu(x); } });
    return m;
  }

  async function devisEdit(id) {
    const [d, clientsL, cat] = await Promise.all([api(A + '/devis/' + id), api(A + '/clients?vue=actifs'), cache.produits ? cache.produits : api(A + '/produits')]);
    if (d.clientId && !clientsL.some(c => c.id === d.clientId)) clientsL.push(...await api(A + '/clients?ids=' + encodeURIComponent(d.clientId)).catch(() => []));
    cache.produits = cat; cache.devis = d; cache.clients = clientsL;
    const [modeles, R0, tous, facsL, lieuxD] = await Promise.all([api(A + '/modeles'), cache.R ? cache.R : api(A + '/site'), api(A + '/devis'), api(A + '/actions/factures').catch(() => []), api(A + '/lieux').catch(() => [])]);
    cache.lieuxDevis = lieuxD;
    cache.R = R0; cache.tousDevis = tous;
    const facsDv = facsL.filter(x => x.devisId === d.id);
    const signe = d.statut === 'accepte';
    const lock = signe && !peut('devisSignes');
    return page(`Devis ${esc(d.numero)} <span class="pill d-${d.statut}">${DSTAT[d.statut]}</span>`, `<a class="btn ghost" href="#/devis">← Devis</a>${lock ? '' : '<button class="btn anc-btn" type="button" data-ancopen>📂 Partir d’un ancien devis</button>'}<button class="btn ghost" type="button" data-dvstar title="Les modèles sont proposés en tête quand on part d’un ancien devis">${d.modele ? '⭐ Modèle' : '☆ Marquer comme modèle'}</button><button class="btn ghost" type="button" data-dup>⧉ Dupliquer ce devis</button>${d.clientId ? `<button class="btn ghost" type="button" data-newcl>+ Nouveau devis pour ce client</button>` : ''}${d.statut !== 'brouillon' ? `<a class="btn ghost" href="/devis/${d.token}" target="_blank">Voir comme le client ↗</a>` : ''}`, `
      ${d.iaDraft && d.statut === 'brouillon' ? '<p class="aq-info">✨ Devis préparé avec l’IA à partir de la commande du client : vérifiez les lignes, les quantités et le texte, enregistrez, puis envoyez-le.</p>' : ''}
      ${(d.commentaires || []).length ? `<section class="box dv-coms"><h2>💬 Commentaires du client <small class="muted">(${d.commentaires.length})</small></h2><p class="muted sm">Laissés sur la page du devis : le commercial les reçoit par e-mail et SMS.</p><ul>${d.commentaires.slice().reverse().map(m => `<li><p>${esc(m.texte).replace(/\n/g, '<br>')}</p><small>${esc(m.nom || 'Client')} · ${dateH(m.at)}</small></li>`).join('')}</ul></section>` : ''}
      ${signe ? `<p class="okbox">✓ ${d.signature ? `Signé en ligne par <b>${esc(d.signature.nom)}</b> le ${dateH(d.signature.at)}` : d.accordManuel ? `Accepté : ${esc(String(d.accordManuel.comment || 'acompte reçu').toLowerCase())}, noté par <b>${esc(d.accordManuel.par || 'l’équipe')}</b> le ${dateH(d.accordManuel.at)}` : 'Accepté par le client'}.${lock ? ' Il faut le droit « Modifier un devis signé » pour le changer.' : ''}</p>` : ''}
      <form id="dv" class="${lock ? 'lock' : ''}">
      <div class="cols">
        <section class="box"><h2>Client</h2><label class="dv-clq">Chercher dans tous les clients <small>(dont le fichier importé)</small><input type="search" data-dvclq placeholder="🔍 Nom, téléphone, e-mail, ville…" autocomplete="off"></label><label>Client<select name="clientId"><option value="">— Choisir —</option>${clientsL.sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map(c => `<option value="${c.id}"${c.id === d.clientId ? ' selected' : ''}>${esc(c.nom)} · ${esc(c.email)}</option>`).join('')}</select></label><label class="src-lab">🧭 Origine du contact <small>(par où le client nous a trouvés)</small>${selSource('canal', canalDe(d))}</label><p class="muted sm"><a href="#/clients/nouveau">+ Nouveau client</a>${d.clientId ? ` · <a href="#/clients/${esc(d.clientId)}">Fiche client</a>` : ''}</p>${(() => { const autres = (cache.tousDevis || []).filter(x => x.clientId && x.clientId === d.clientId && x.id !== d.id); return autres.length ? `<p class="sm"><b>Autres devis de ce client</b></p><ul class="histo">${autres.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => `<li><a href="#/devis/${x.id}">${esc(x.numero)}</a> · ${euros(tot(x).ttc)} <span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : ''; })()}${d.copieDe ? `<p class="muted sm">Copie du devis ${esc(d.copieDe)}.</p>` : ''}${d.inspireDe ? `<p class="muted sm">📂 Préparé à partir de l’ancien devis ${esc(d.inspireDe)}.</p>` : ''}</section>
        <section class="box"><h2>Événement</h2><div class="g2"><label>Nature de l’événement<input name="ev_type" list="dv-natures" value="${esc(d.evenement?.type || '')}" placeholder="Choisissez ou écrivez" maxlength="80"><datalist id="dv-natures">${[...new Set([...(R0.evenements || []), 'Anniversaire', 'Mariage', 'Baptême', 'Communion', 'Fête de famille', 'Séminaire', 'Soirée d’entreprise', 'Cocktail', 'Repas de fin d’année', 'Pot de départ', 'Inauguration', 'Funérailles'])].map(e => `<option value="${esc(e)}">`).join('')}</datalist></label><label>Date<input type="date" name="ev_date" value="${esc(d.evenement?.date || '')}"></label><label>Nombre de personnes<input type="number" name="ev_invites" value="${esc(d.evenement?.invites || '')}"></label><label>Lieu <small class="muted">(salle, nom du lieu)</small><input name="ev_lieu" value="${esc(d.evenement?.lieu || '')}"></label></div>
          <div class="dv-liv"><div class="hc-th"><p class="pf-l">🚚 Livraison</p>${lock ? '' : '<button type="button" class="lnk" data-dvlivcl>↺ Reprendre la fiche client</button>'}</div>
          <label>Adresse de livraison<textarea name="ev_adresse" rows="2">${esc(d.evenement?.adresse || '')}</textarea></label><div class="g2"><label>Code postal<input name="ev_cp" value="${esc(d.evenement?.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="ev_ville" value="${esc(d.evenement?.ville || '')}"></label></div><label>🕐 Horaire de livraison<input name="ev_horaire" value="${esc(d.evenement?.horaire || '')}" list="dvH" placeholder="ex. 18 h 30" autocomplete="off"><datalist id="dvH">${LIV_HORAIRES.map(h => `<option value="${esc(h)}">`).join('')}</datalist></label>
          <label>📦 Infos pour les livreurs <small class="muted">(🔒 jamais montrées au client)</small><textarea name="ev_livreurs" rows="3" placeholder="Étage, ascenseur, digicode, stationnement… (repris de la fiche client)">${esc(d.evenement?.livreurs || '')}</textarea></label>
          ${lock ? '' : '<div class="row"><button type="button" class="btn ghost sm" data-dvkm>🚚 Calculer les frais de livraison</button><span class="muted sm" data-dvkmmsg></span></div>'}</div></section>
        <section class="box"><h2>Conditions</h2><div class="g2"><label>Valable jusqu’au<input type="date" name="validiteJusquau" value="${esc(d.validiteJusquau || '')}"></label><label>Acompte<select name="acomptePct"><option value="">Automatique</option>${[0, 20, 30, 40, 50, 100].map(p => `<option value="${p}"${d.acomptePct != null && d.acomptePct !== '' && +d.acomptePct === p ? ' selected' : ''}>${p} % (forcé)</option>`).join('')}</select></label></div><p class="muted sm">Automatique : totalité à la signature sous ${euros(R0.tarifs?.seuilAcompteCents ?? 80000)} TTC ou si l’événement a lieu dans moins de ${R0.tarifs?.delaiDeuxFoisJours ?? 10} jours ; sinon acompte de ${R0.tarifs?.acomptePct ?? 50} %.</p>
          ${(() => { const P = (R0.alertes?.personnes || []).filter(x => x.nom); const cur = d.commercial?.nom || (P.find(x => x.email && x.email === session.email) || P[0] || {}).nom || ''; const L = [...P]; if (d.commercial?.nom && !P.some(x => x.nom === d.commercial.nom)) L.unshift(d.commercial); return `<label>Commercial (nom et téléphone sur le devis)<select name="commercial"><option value="">— Aucun —</option>${L.map(x => `<option value="${esc(x.nom)}"${x.nom === cur ? ' selected' : ''}>${esc(x.nom)}${x.tel ? ' · ' + esc(x.tel) : ''}</option>`).join('')}</select></label><p class="muted sm">La liste vient de <a href="#/equipe/alertes">Équipe &amp; activité</a> › Alertes de l’équipe (nom, portable, e-mail).</p>`; })()}
          <label>Lien de paiement de l’acompte <small>(SumUp, Stripe, banque…)</small><input name="lienPaiement" value="${esc(d.lienPaiement || '')}" placeholder="https://"></label></section>
      </div>
      <section class="box"><label>Nom de la proposition <small>(facultatif, ex. « Formule buffet antillais » : affiché dans l’e-mail quand vous envoyez plusieurs devis)</small><input name="titre" value="${esc(d.titre || '')}" maxlength="120"></label><label>Texte d’introduction<textarea name="intro" rows="2">${esc(d.intro || '')}</textarea></label></section>
      ${lock || d.statut === 'accepte' ? '' : '<section class="box anc-box" id="ancProches" hidden></section>'}
      ${lock ? '' : `<section class="box ia-modif"><h2>✨ Demander à l’IA de modifier ce devis</h2><p class="muted sm">Écrivez ou dictez ce qu’il faut changer, par exemple : « Supprime le DJ et mets une contorsionniste à la place », « passe à 80 invités », « ajoute 2 serveurs pendant 5 h ». L’IA vous montre les changements avant de les appliquer. Vous pouvez toujours modifier les lignes vous-même.</p>
        <textarea id="iam-t" rows="2" placeholder="Ex. : supprime le DJ et mets une contorsionniste à la place"></textarea><div class="row"><button type="button" class="btn aq-btn" data-iam>✨ Proposer la modification</button><button type="button" class="btn ghost sm" data-iam-mic>🎤 Dicter</button><span id="iam-msg" class="muted sm"></span></div><div id="iam-res"></div></section>`}
      <section class="box"><div class="bh"><h2>Lignes du devis</h2><div class="row"><select data-addprod class="wide"><option value="">+ Ajouter une prestation du catalogue…</option>${cat.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre)).map(p => `<option value="${esc(p.slug)}">${esc(titreTexte(p.titre))} · ${p.prixCents == null ? 'sur devis' : euros(p.prixCents)}</option>`).join('')}${lieuxD.length ? `<optgroup label="Lieux à privatiser (3 photos sur le devis)">${lieuxD.sort((a, b) => a.nom.localeCompare(b.nom)).map(l => `<option value="lieu-${esc(l.slug)}">📍 ${esc(l.nom)}${l.capacite ? ' · ' + l.capacite + ' pers.' : ''}${l.statut === 'masque' ? ' (masqué)' : ''}</option>`).join('')}</optgroup>` : ''}</select><button type="button" class="btn ghost sm" data-addline>+ Ligne libre</button><button type="button" class="btn ghost sm" data-addtitle>+ Titre</button></div></div>
        <div class="table"><table class="lines"><thead><tr><th></th><th>Désignation</th><th class="n">Qté</th><th>Unité</th><th class="n">PU TTC</th><th class="n" title="Réduction sur cette ligne, en % — le client voit le prix barré et le prix remisé">Remise</th><th class="n" title="Prix d’achat HT à l’unité — interne, jamais montré au client">Achat HT 🔒</th><th>TVA</th><th class="n">Total TTC</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
        <div class="totbox"><div class="g2"><label>Remise sur le total du devis<span class="remg"><input name="remise" value="${d.remisePct ? String(d.remisePct).replace('.', ',') : fromCents(d.remiseCents || 0)}" inputmode="decimal" placeholder="0"><select name="remiseMode" aria-label="Remise en euros ou en pourcentage"><option value="eur">€ TTC</option><option value="pct"${d.remisePct ? ' selected' : ''}>%</option></select></span><small class="muted">Pour une remise sur un seul produit : colonne « Remise » de la ligne. La remise sur le total ne s’applique ni à la livraison ni au personnel. La marge 💰 ci-dessous se met à jour pendant que vous tapez. 🔒 Le client voit la remise, jamais la marge.</small></label></div><dl id="totaux"></dl></div><div class="mg-box" id="marge"></div>${lock ? '' : '<div class="anc-comp" id="ancComp" hidden></div>'}</section>
      <section class="box"><label>Conditions particulières<textarea name="conditions" rows="2">${esc(d.conditions || '')}</textarea></label></section>
      <div class="actions sticky"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-voir>👁 Voir le devis</button><span class="muted" id="dirty"></span></div>
      </form>
      <div class="cols">
        <section class="box"><h2>Envoyer au client</h2><label>Message (facultatif)<textarea rows="3" id="msg" placeholder="Bonjour, voici votre devis…"></textarea></label><div class="row"><label class="chk"><input type="checkbox" id="c-mail" checked> E-mail</label><label class="chk"><input type="checkbox" id="c-sms"> SMS</label></div>${(() => { const autres = (cache.tousDevis || []).filter(x => x.clientId && x.clientId === d.clientId && x.id !== d.id && x.statut !== 'refuse');
            if (!autres.length) return '';
            const L = [d, ...autres].sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
            return `<div class="grp"><p class="sm"><b>Devis de ce client à envoyer ensemble</b> <small class="muted">(un seul e-mail, chaque devis se signe séparément)</small></p>${L.map(x => `<label class="chk grp-l"><input type="checkbox" data-grp="${esc(x.id)}" ${x.id === d.id || x.statut === 'brouillon' ? 'checked' : ''}> <span><b>${esc(x.numero)}</b>${x.titre ? ' · ' + esc(x.titre) : ''} · ${euros(tot(x).ttc)} <span class="pill d-${x.statut}">${DSTAT[x.statut]}</span>${x.id === d.id ? ' <small class="muted">(celui-ci)</small>' : ''}</span></label>`).join('')}</div>`; })()}
          <div class="row"><button class="btn" type="button" data-sendgrp hidden></button><button class="btn" data-send>${d.statut === 'brouillon' ? 'Envoyer le devis' : 'Renvoyer le devis'}</button><button class="btn ghost" type="button" data-apmail>✉️ Aperçu de l’e-mail</button><button class="btn ghost" type="button" data-voir>👁 Voir le devis</button></div>
          ${(d.envois || []).length ? `<ul class="histo">${d.envois.map(e => `<li>${dateH(e.at)} · Devis envoyé par ${e.ia ? '<b>l’IA</b> ✨ (automatique)' : '<b>' + esc(e.par || 'l’équipe') + '</b>'} · ${e.canaux.map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' + ')}</li>`).join('')}</ul>` : ''}</section>
        <section class="box"><h2>Relancer</h2><select id="mod">${modeles.map(m => `<option value="${m.id}">${esc(m.nom)}</option>`).join('')}</select><button class="btn ghost" data-relance ${d.statut !== 'envoye' ? 'disabled' : ''}>Envoyer la relance</button>${(d.relances || []).length ? `<ul class="histo">${d.relances.map(r => `<li>${dateH(r.at)} · ${esc(r.modele)}</li>`).join('')}</ul>` : ''}</section>
        <section class="box"><h2>💶 Règlements du client</h2>${signe ? (() => {
            const fx = facsDv.find(x => x.type === 'totale' && !x.annuleeParAvoir);
            const ttc = tot(d).ttc, reste = fx ? fx.etat.resteCents : ttc;
            const ac = regleAcompte(ttc, d, cache.R?.tarifs);
            const prop = fx ? reste : ac.cents;
            const today = new Date().toISOString().slice(0, 10);
            return `${fx ? `<p class="sm"><a href="#/factures/${fx.id}"><b>Facture ${esc(fx.numero)}</b></a> ${pillF(fx)} · réglé ${euros(fx.etat.regleCents)} · <b>reste ${euros(reste)}</b></p>${(fx.reglements || []).length ? `<ul class="histo">${fx.reglements.map(r => `<li>${dateFr(r.date)} · ${euros(r.montantCents)} · ${esc(r.moyen)}</li>`).join('')}</ul>` : ''}` : `<p class="muted sm">Le premier règlement crée la facture dans <a href="#/factures">Factures</a> (à envoyer au client). ${ac.total ? 'Totalité attendue' : 'Acompte de ' + ac.pct + ' % attendu'} : <b>${euros(ac.cents)}</b>.</p>`}
            ${fx && !reste ? '<p class="ok sm">✓ Devis entièrement réglé.</p>' : `<div class="g2 dv-rg"><label>Montant reçu (€)<input id="rg-m" inputmode="decimal" value="${fromCents(prop)}"></label><label>Date<input type="date" id="rg-d" value="${today}" max="${today}"></label><label>Moyen<select id="rg-mo">${['Virement', 'Carte bancaire', 'Lien de paiement', 'Chèque', 'Espèces', 'Chèques vacances / CESU', 'Autre'].map(m => `<option>${m}</option>`).join('')}</select></label><label>Note<input id="rg-n" placeholder="facultatif"></label></div><button class="btn" type="button" data-rgdv>+ Enregistrer le règlement</button>`}
            <details class="fa-avoir"><summary>Autres factures (acompte seul, solde)</summary><div class="row"><button class="btn ghost sm" data-fac="acompte">Facture d’acompte</button><button class="btn ghost sm" data-fac="solde">Facture de solde</button><button class="btn ghost sm" data-fac="totale">Facture totale</button></div>${facsDv.filter(x => x !== fx).map(x => `<p class="sm"><a href="#/factures/${x.id}">${esc(x.numero)}</a> ${pillF(x)}</p>`).join('')}</details>`; })() : '<p class="muted">Possible dès que le client a signé.</p>'}</section>
      </div>`);
  }
  devisEdit.after = id => {
    const d = cache.devis, form = $('#dv');
    /* recherche d'un client dans tout le fichier (60 000 contacts importés ne tiennent pas dans une liste) */
    const clq = $('[data-dvclq]');
    clq?.addEventListener('input', () => {
      clearTimeout(clq._t);
      clq._t = setTimeout(async () => {
        const q = clq.value.trim(), sel = form.elements.clientId; if (q.length < 2) return;
        try {
          const r = await api(A + '/clients?par=30&q=' + encodeURIComponent(q));
          for (const c of r.items) if (!cache.clients.some(x => x.id === c.id)) cache.clients.push(c);
          const cur = sel.value;
          sel.innerHTML = `<option value="">— ${r.total ? r.total + ' client' + (r.total > 1 ? 's' : '') + ' trouvé' + (r.total > 1 ? 's' : '') + (r.total > 30 ? ' (30 premiers)' : '') + ' : choisir' : 'Aucun client trouvé'} —</option>` + (cur && !r.items.some(c => c.id === cur) ? `<option value="${esc(cur)}" selected>${esc(cache.clients.find(c => c.id === cur)?.nom || 'Client actuel')}</option>` : '') + r.items.map(c => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.nom)} · ${esc(c.email || c.tel || '')}${c.ville ? ' · ' + esc(c.ville) : ''}</option>`).join('');
          if (r.items.length === 1 && !cur) { sel.value = r.items[0].id; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        } catch (e) { toast(e.message, true); }
      }, 300);
    });
    let lignes = (d.lignes || []).map(l => ({ ...l }));
    /* prix d'achat saisi sur la fiche après la création du devis : repris pour la marge (seulement si la ligne est au prix de la fiche, sans supplément) */
    for (const l of lignes) {
      if (l.type === 'titre' || l.coutCents != null || !l.produit) continue;
      const p = (cache.produits || []).find(x => x.slug === l.produit);
      if (p && p.coutCents != null && (p.prixCents == null || l.puCents === p.prixCents)) l.coutCents = p.coutCents;
    }
    const body = $('#lines');
    /* remise sur le total : en € TTC, ou en % du sous-total (recalculée quand les lignes changent) */
    const nombre = v => Math.max(0, parseFloat(String(v || '').replace(',', '.')) || 0);
    const remiseCts = () => {
      if (form.remiseMode.value !== 'pct') return toCents(form.remise.value) || 0;
      const brut = lignes.filter(l => l.type !== 'titre' && !horsRemise(l)).reduce((s2, l) => s2 + Math.round((l.puCents || 0) * (+l.qte || 0)), 0); /* la livraison n'est jamais remisée */
      return Math.round(brut * Math.min(100, nombre(form.remise.value)) / 100);
    };
    /* draw(false) : seulement les totaux et la marge — pendant la frappe, on ne redessine pas les cases (sinon « 3 » devient « 3,00 » et le curseur saute) */
    const draw = (cases = true) => {
      if (cases) body.innerHTML = lignes.map((l, i) => l.type === 'titre'
        ? `<tr class="t" data-i="${i}"><td class="h">⋮⋮</td><td colspan="8"><input data-f="designation" value="${esc(l.designation)}" placeholder="Titre de section"></td><td><button type="button" class="x" data-del>×</button></td></tr>`
        : `<tr data-i="${i}" class="${l.coutCents && l.puCents < l.coutCents ? 'neg' : ''}"><td class="h" title="Déplacer">⋮⋮</td><td><input data-f="designation" value="${esc(l.designation)}"><input data-f="detail" class="sub" value="${esc(l.detail || '')}" placeholder="Détail (facultatif)"></td>
           <td><input data-f="qte" class="num" value="${esc(l.qte)}" inputmode="decimal"></td><td><select data-f="unite">${[...new Set([l.unite, ...UNITES])].map(u => `<option${u === l.unite ? ' selected' : ''}>${esc(u || '')}</option>`).join('')}</select></td>
           <td><input data-f="puCents" class="num" value="${fromCents(l.puBaseCents ?? l.puCents)}" inputmode="decimal"></td><td class="rem"><span class="remi"><input data-f="remisePct" class="num pct" value="${l.remisePct ? String(l.remisePct).replace('.', ',') : ''}" placeholder="0" inputmode="decimal" aria-label="Remise en %"> %</span>${l.remisePct ? `<small>= ${euros(l.puCents)}</small>` : ''}${l.coutCents != null && l.puCents ? `<small class="mgl ${l.puCents > l.coutCents ? 'pos' : 'neg'}" title="Marge de cette ligne (interne)">marge ${String(Math.round(1000 * (l.puCents - l.coutCents) / l.puCents) / 10).replace('.', ',')} %</small>` : ''}</td><td><input data-f="coutCents" class="num${l.coutCents == null && +l.qte ? ' manq' : ''}" value="${fromCents(achatHt(l.coutCents, l.tva ?? 10))}" inputmode="decimal" placeholder="manquant" title="Prix d’achat HT à l’unité"></td>
           <td><select data-f="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+l.tva === t ? ' selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></td><td class="n">${euros(Math.round((l.puCents || 0) * (+l.qte || 0)))}</td><td><button type="button" class="x" data-del aria-label="Supprimer">×</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">Aucune ligne : ajoutez une prestation du catalogue ou une ligne libre.</td></tr>';
      if (cases && !peut('admin')) lignes.forEach((l, i) => { /* 🔒 livraison : seul un administrateur la change, l'offre ou la retire */
        if (l.type === 'titre') return;
        const tr = body.querySelector(`[data-i="${i}"]`); if (!tr) return;
        if (estPersonnel(l) && !estLivraison(l)) { /* 🔒 personnel : prix, remise, achat et TVA bloqués ; le nombre de personnes × heures reste libre */
          tr.classList.add('liv-lock'); tr.title = '🔒 Personnel : seul un administrateur peut changer le prix ou faire une remise. Vous pouvez changer la quantité.';
          tr.querySelectorAll('[data-f="puCents"], [data-f="remisePct"], [data-f="coutCents"], [data-f="tva"], [data-f="unite"]').forEach(x => { x.disabled = true; });
          return;
        }
        if (!estLivraison(l)) return;
        tr.classList.add('liv-lock'); tr.title = '🔒 Ligne de livraison : seul un administrateur peut la modifier ou l’offrir.';
        tr.querySelectorAll('input, select').forEach(x => { if (x.dataset.f === 'detail' || x.dataset.f === 'designation') return; x.disabled = true; });
        tr.querySelector('[data-del]')?.replaceWith(Object.assign(document.createElement('span'), { className: 'lock-i', textContent: '🔒' }));
        const h = tr.querySelector('.h'); if (h) h.textContent = '🔒';
      });
      const t = tot({ lignes, remiseCents: remiseCts() });
      $('#marge').innerHTML = margeHtml(t);
      $('#totaux').innerHTML = `${t.remise ? `<div><dt>Sous-total</dt><dd>${euros(t.brut)}</dd></div><div><dt>Remise${form.remiseMode.value === 'pct' ? ' ' + String(nombre(form.remise.value)).replace('.', ',') + ' %' : ''}</dt><dd>− ${euros(t.remise)}</dd></div>` : ''}${Object.entries(t.tva).map(([k, v]) => `<div class="sm"><dt>dont TVA ${String(k).replace('.', ',')} %</dt><dd>${euros(v)}</dd></div>`).join('')}<div class="sm"><dt>Total HT</dt><dd>${euros(t.ht)}</dd></div><div class="big"><dt>Total TTC</dt><dd>${euros(t.ttc)}</dd></div>${(() => { const a = regleAcompte(t.ttc, { acomptePct: form.acomptePct.value, evenement: { date: form.ev_date.value }, signature: d.signature }, cache.R?.tarifs); return `<div class="sm"><dt>${a.total ? `À payer à la signature (totalité${a.raison === 'proche' ? ', événement dans moins de ' + a.delai + ' jours' : ''})` : `Acompte ${a.pct} %`}</dt><dd>${euros(a.cents)}</dd></div>`; })()}`;
    };
    draw();
    const dirty = () => { $('#dirty').textContent = 'Modifications non enregistrées'; clearTimeout(dirty._t); dirty._t = setTimeout(() => majComp?.(), 600); };
    body.addEventListener('input', e => {
      const tr = e.target.closest('[data-i]'); const l = lignes[+tr.dataset.i]; const f = e.target.dataset.f;
      if (!f) return;
      /* remise sur une ligne : le prix tapé reste le prix de base (puBaseCents), puCents = prix remisé utilisé partout (totaux, marge, factures) */
      if (f === 'remisePct') {
        const pc = Math.min(100, nombre(e.target.value));
        if (pc) { if (l.puBaseCents == null) l.puBaseCents = l.puCents || 0; l.remisePct = pc; l.puCents = Math.round(l.puBaseCents * (1 - pc / 100)); }
        else { if (l.puBaseCents != null) l.puCents = l.puBaseCents; delete l.puBaseCents; delete l.remisePct; }
      } else if (f === 'puCents' && l.remisePct) { l.puBaseCents = toCents(e.target.value) || 0; l.puCents = Math.round(l.puBaseCents * (1 - l.remisePct / 100)); }
      else l[f] = f === 'coutCents' ? achatTtc(toCents(e.target.value), l.tva ?? 10) : f === 'puCents' ? toCents(e.target.value) : f === 'tva' ? +e.target.value : f === 'qte' ? parseFloat(String(e.target.value).replace(',', '.')) || 0 : e.target.value;
      const cell = tr.children[8]; if (cell && l.type !== 'titre') cell.textContent = euros(Math.round((l.puCents || 0) * (+l.qte || 0)));
      tr.classList.toggle('neg', !!(l.coutCents && l.puCents < l.coutCents));
      if (e.target.tagName === 'SELECT') draw(); else draw(false);
      dirty();
    });
    /* en quittant une case : mise en forme (3 → 3,00), prix remisé et marge de la ligne ; la case suivante garde le curseur */
    body.addEventListener('change', e => {
      if (e.target.tagName === 'SELECT') return;
      setTimeout(() => {
        const a = document.activeElement, tr = a?.closest?.('#lines [data-i]'), f = a?.dataset?.f;
        draw();
        const b = tr && f ? $(`#lines [data-i="${tr.dataset.i}"] [data-f="${f}"]`) : null;
        if (b) { b.focus(); try { b.select(); } catch { /* select : pas de sélection */ } }
      });
    });
    body.addEventListener('click', e => { if (e.target.closest('[data-del]')) { lignes.splice(+e.target.closest('[data-i]').dataset.i, 1); draw(); dirty(); } });
    /* déplacer une ligne en la glissant */
    let from = null;
    body.addEventListener('pointerdown', e => { if (e.target.classList.contains('h')) { from = +e.target.closest('[data-i]').dataset.i; e.target.closest('tr').classList.add('drag'); } });
    addEventListener('pointerup', e => {
      if (from == null) return;
      const tr = document.elementFromPoint(e.clientX, e.clientY)?.closest('#lines [data-i]');
      if (tr) { const to = +tr.dataset.i; const [m] = lignes.splice(from, 1); lignes.splice(to, 0, m); dirty(); }
      from = null; draw();
    });
    form.remise.addEventListener('input', () => { draw(); dirty(); });
    form.remiseMode.addEventListener('change', () => { draw(); dirty(); form.remise.focus(); });
    form.acomptePct.addEventListener('change', draw);
    form.ev_date.addEventListener('change', draw);
    $('[data-addline]').addEventListener('click', () => { lignes.push({ designation: 'Nouvelle ligne', qte: 1, unite: 'forfait', puCents: 0, coutCents: null, tva: 10 }); draw(); dirty(); });
    $('[data-addtitle]').addEventListener('click', () => { lignes.push({ type: 'titre', designation: 'Section' }); draw(); dirty(); });
    /* 🚚 adresse et horaire de livraison : repris de la fiche client (cases vides seulement, ou toutes avec le bouton) */
    const livClient = async (tout) => {
      const cid = form.elements.clientId.value; if (!cid) { if (tout) toast('Choisissez d’abord le client.', true); return; }
      let c; try { c = await api(A + '/clients/' + cid); } catch { return; }
      const a = adresseLivraison(c), info = infosLivreurs(c.livraison), val = { ev_adresse: a.adresse, ev_cp: a.cp, ev_ville: a.ville, ev_horaire: a.horaire, ev_livreurs: info };
      if (!Object.values(val).some(Boolean)) { if (tout) toast('La fiche de ce client n’a pas encore d’adresse de livraison.', true); return; }
      let n = 0; for (const [k, v] of Object.entries(val)) if (v && (tout || !form.elements[k].value.trim()) && form.elements[k].value !== v) { form.elements[k].value = v; n++; }
      if (n) { dirty(); if (tout) toast('Adresse et horaire de livraison repris de la fiche client.'); }
    };
    $('[data-dvlivcl]')?.addEventListener('click', () => livClient(true));
    form.elements.clientId.addEventListener('change', () => livClient(false));
    if (!form.classList.contains('lock') && d.statut === 'brouillon' && d.clientId && !form.elements.ev_adresse.value && !form.elements.ev_cp.value) livClient(false);
    /* 🚚 frais de livraison : distance aller-retour depuis Magnolia (centre de la commune), prix du km selon les paliers */
    $('[data-dvkm]')?.addEventListener('click', async () => {
      const msg = $('[data-dvkmmsg]'), cp = form.elements.ev_cp.value.replace(/\D/g, ''), ville = form.elements.ev_ville.value.trim();
      if (cp.length !== 5) { msg.textContent = 'Indiquez le code postal de livraison.'; return; }
      const T = cache.R?.tarifs || {}, L = window.MGLivr, O = cache.R?.origine?.lat ? cache.R.origine : { lat: 48.692674, lon: 2.212317 };
      const vrais = lignes.filter(l => l.type !== 'titre'), ex = vrais.find(estLivraison);
      if (ex && !peut('admin')) { msg.textContent = '🔒 Il y a déjà une ligne de livraison : seul un administrateur peut la changer.'; return; }
      if (L && L.horsZone(cp)) {
        if (!vrais.some(l => /hors Île-de-France/i.test(l.designation || ''))) { lignes.push({ designation: 'Livraison hors Île-de-France (sur consultation)', detail: `${ville} · tarif à préciser par l’équipe`, qte: 1, unite: 'forfait', puCents: 0, coutCents: null, tva: 20 }); draw(); dirty(); }
        msg.textContent = 'Hors Île-de-France : tarif à proposer au client (ligne ajoutée à 0 €).'; return;
      }
      msg.textContent = 'Calcul de la distance…';
      let communes = []; try { communes = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom,centre&format=json`).then(x => x.json()); } catch { }
      const sans = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
      const v = communes.find(x => sans(x.nom) === sans(ville)) || communes[0], ctr = v?.centre?.coordinates;
      if (!ctr) { msg.textContent = 'Commune introuvable pour ce code postal.'; return; }
      if (!ville) form.elements.ev_ville.value = v.nom;
      const r = x => x * Math.PI / 180, lat = ctr[1], lon = ctr[0];
      const km = Math.max(10, Math.round(2 * 6371 * Math.asin(Math.sqrt(Math.sin(r(lat - O.lat) / 2) ** 2 + Math.cos(r(O.lat)) * Math.cos(r(lat)) * Math.sin(r(lon - O.lon) / 2) ** 2)) * 1.3 * 2));
      const horsLiv = vrais.filter(l => !estLivraison(l)).reduce((t, l) => t + Math.round((l.puCents || 0) * (+l.qte || 0)), 0);
      const pu = L ? L.kmCents(T, horsLiv) : 100, cout = L ? L.coutKmCents(T) : 100, base = Math.max(pu, cout), remisePct = base > pu ? Math.round(1000 * (1 - pu / base)) / 10 : 0;
      const ligne = { designation: pu === 0 ? 'Livraison et reprise (offerte)' : 'Livraison et reprise', detail: `${v.nom} · ${km} km aller-retour${pu === 0 ? '' : remisePct ? ' · remise selon le montant de la commande' : ''}`, qte: km, unite: 'km', puCents: pu, coutCents: cout, tva: 20, livraison: true, ...(remisePct ? { puBaseCents: base, remisePct } : {}) };
      if (ex) Object.keys(ex).forEach(k => delete ex[k]), Object.assign(ex, ligne); else lignes.push(ligne);
      draw(); dirty();
      msg.textContent = `≈ ${km} km aller-retour × ${euros(pu)} = ${euros(km * pu)} TTC${ex ? ' (ligne mise à jour)' : ' (ligne ajoutée)'}.`;
    });
    $('[data-addprod]').addEventListener('change', e => {
      const lv = (cache.lieuxDevis || []).find(x => 'lieu-' + x.slug === e.target.value);
      if (lv) { const pr = /(\d[\d\s]*)/.exec(String(lv.prixTexte || '').replace(/\u202f/g, ' ')); lignes.push({ designation: 'Privatisation · ' + lv.nom, detail: [lv.ville, lv.capacite ? 'jusqu’à ' + lv.capacite + ' personnes' : ''].filter(Boolean).join(' · '), qte: 1, unite: 'forfait', puCents: pr ? +pr[1].replace(/\s/g, '') * 100 : 0, coutCents: null, tva: 20, produit: 'lieu-' + lv.slug }); e.target.value = ''; draw(); dirty(); toast('Lieu ajouté : ses 3 photos apparaîtront sur le devis du client.'); return; }
      const p = cache.produits.find(x => x.slug === e.target.value); if (!p) return;
      lignes.push({ designation: avecPortion(p.titre), detail: '', qte: p.min || 1, unite: p.unite || 'unité', puCents: p.prixCents || 0, coutCents: p.coutCents ?? null, tva: p.tva ?? 10, produit: p.slug, ...(p.rubrique === 'personnel' || (p.autresRubriques || []).includes('personnel') ? { personnel: true } : {}) });
      e.target.value = ''; draw(); dirty();
    });
    form.addEventListener('input', e => { if (!e.target.closest('#lines, .ia-modif')) dirty(); });
    /* ---------- 📂 Partir d'un ancien devis ---------- */
    const nbL = () => lignes.filter(l => l.type !== 'titre').length;
    const utiliserAncien = (r, mode) => {
      lignes = mode === 'ajouter' ? [...lignes, ...r.lignes] : r.lignes;
      if (!form.ev_type.value && r.source.type) form.ev_type.value = r.source.type;
      if (!form.ev_invites.value && r.source.invites) form.ev_invites.value = r.source.invites;
      if (!form.titre.value && r.source.titre) form.titre.value = r.source.titre;
      d.inspireDe = r.source.numero;
      draw(); dirty();
      toast(`📂 Lignes de ${r.source.numero} reprises aux prix actuels : retravaillez-les, puis « Enregistrer ».`);
      $('#lines')?.closest('.box')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const ouvrirAnciens = (extra = {}) => anciensDevis({ pour: id, invites: +form.ev_invites.value || null, type: form.ev_type.value, nbLignes: nbL(), onUse: utiliserAncien, ...extra });
    $('[data-ancopen]')?.addEventListener('click', () => ouvrirAnciens());
    $('[data-dvstar]')?.addEventListener('click', async e => { const b = e.currentTarget, on = !d.modele; if (await ancStar(id, on)) { d.modele = on; b.textContent = on ? '⭐ Modèle' : '☆ Marquer comme modèle'; } });
    const boxP = $('#ancProches');
    const proches = async () => {
      if (!boxP) return;
      try {
        const q = new URLSearchParams({ pour: id }); if (form.ev_invites.value) q.set('refInvites', form.ev_invites.value); if (form.ev_type.value) q.set('refType', form.ev_type.value);
        const r = await api(A + '/anciens-devis?' + q);
        const P = (r.proches || []).slice(0, 3);
        boxP.hidden = !P.length && nbL() > 0;
        boxP.innerHTML = `<div class="bh"><h2>💡 Devis proches de cette demande</h2><button type="button" class="btn anc-btn sm" data-ancall>📂 Chercher dans tous les anciens devis${r.total ? ` (${r.total})` : ''}</button></div>
          ${P.length ? `<p class="muted sm">Trouvés automatiquement d’après le type d’événement, le nombre d’invités et les produits, signés en premier. « Utiliser ce devis » reprend ses lignes aux prix actuels, sans les remises.</p><div class="anc-g">${P.map(x => ancCarte(x)).join('')}</div>` : '<p class="muted sm">Aucun ancien devis vraiment proche pour l’instant : indiquez le type d’événement et le nombre d’invités, ou cherchez par mot-clé.</p>'}`;
      } catch { boxP.hidden = true; }
    };
    boxP?.addEventListener('click', async e => {
      if (e.target.closest('[data-ancall]')) return ouvrirAnciens();
      const v = e.target.closest('[data-ancvoir]'); if (v) return ouvrirAnciens({ apercu: v.dataset.ancvoir });
      const u = e.target.closest('[data-ancuse]'); if (u) return ouvrirAnciens({ direct: u.dataset.ancuse });
      const st = e.target.closest('[data-ancstar]'); if (st) { const on = !st.classList.contains('on'); if (await ancStar(st.dataset.ancstar, on)) { st.classList.toggle('on', on); st.textContent = on ? '⭐' : '☆'; st.closest('.anc-c')?.classList.toggle('star', on); } }
    });
    if (boxP) { proches(); form.ev_type.addEventListener('change', proches); form.ev_invites.addEventListener('change', proches); }
    if (/[?&]anciens=1/.test(location.hash)) { history.replaceState(null, '', '#/devis/' + id); setTimeout(() => ouvrirAnciens(), 50); }
    /* 🧩 souvent pris avec : d'après les anciens devis signés qui contiennent les mêmes produits */
    const boxC = $('#ancComp'); let sigC = '';
    const majComp = async () => {
      if (!boxC) return;
      const L = lignes.filter(l => l.type !== 'titre').map(l => ({ produit: l.produit || '', designation: l.designation, unite: l.unite, supplement: l.supplement || '' }));
      const sig = JSON.stringify(L.map(l => l.produit || l.designation)); if (sig === sigC) return; sigC = sig;
      if (!L.length) { boxC.hidden = true; return; }
      try {
        const r = await api(A + '/anciens-devis/complements', { method: 'POST', body: { lignes: L } });
        boxC._c = r.complements;
        boxC.hidden = !r.complements.length;
        boxC.innerHTML = `<h3>🧩 Souvent pris avec ces produits <small class="muted">d’après les anciens devis signés : ce à quoi on ne pense pas toujours</small></h3><div class="anc-cg">${r.complements.map((x, i) => `<div class="anc-ci">${x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : '<span class="anc-ph">🧩</span>'}<span><b>${esc(x.designation)}</b><small>${euros(x.puCents)}${x.unite ? ' / ' + esc(x.unite) : ''} · dans ${x.n} devis signé${x.n > 1 ? 's' : ''} sur ${x.sur}</small></span><button type="button" class="btn ghost sm" data-ancadd="${i}">+ Ajouter</button></div>`).join('')}</div>`;
      } catch { boxC.hidden = true; }
    };
    boxC?.addEventListener('click', e => {
      const b = e.target.closest('[data-ancadd]'); if (!b) return;
      const x = boxC._c[+b.dataset.ancadd]; if (!x) return;
      const l = { ...x.ligne }, inv = +form.ev_invites.value || 0;
      if (l.unite === 'personne' && inv) l.qte = Math.max(+l.qte || 1, inv);
      lignes.push(l); draw(); dirty(); toast(`« ${x.designation} » ajouté au devis.`);
    });
    majComp();
    /* « Demander à l'IA de modifier ce devis » : proposition → changements affichés → Appliquer ou Annuler */
    const iamT = $('#iam-t'), iamMsg = $('#iam-msg'), iamRes = $('#iam-res');
    if (iamT) {
      micPour($('[data-iam-mic]'), iamT, iamMsg);
      const proposer = async () => {
        const consigne = iamT.value.trim(); if (consigne.length < 3) { iamMsg.innerHTML = '<span class="err">Écrivez d’abord ce que l’IA doit changer.</span>'; return; }
        const b = $('[data-iam]'); b.disabled = true; iamMsg.textContent = 'L’IA prépare la modification… (quelques secondes)'; iamRes.innerHTML = '';
        try {
          const r = await api(A + '/ia/modifier-devis', { method: 'POST', body: { consigne, lignes, remiseCents: remiseCts(), evenement: { type: form.ev_type.value, date: form.ev_date.value, invites: +form.ev_invites.value || null, lieu: form.ev_lieu.value } } });
          iamMsg.textContent = '';
          const avant = tot({ lignes, remiseCents: remiseCts() }).ttc, apres = tot({ lignes: r.lignes, remiseCents: r.remiseCents }).ttc;
          const ico = { ajoute: '＋', retire: '−', modifie: '✎' };
          iamRes.innerHTML = `<div class="iam-prop">${r.explication ? `<p><b>${esc(r.explication)}</b></p>` : ''}${r.changements.length ? `<ul class="iam-ch">${r.changements.map(x => `<li class="c-${x.type}"><span>${ico[x.type]}</span>${esc(x.texte)}</li>`).join('')}</ul><p>Total TTC : ${euros(avant)} → <b>${euros(apres)}</b></p><div class="row"><button type="button" class="btn" data-iam-ok>✓ Appliquer</button><button type="button" class="btn ghost" data-iam-no>Annuler</button></div>` : '<p class="muted">Aucun changement proposé. Reformulez votre demande.</p>'}</div>`;
          $('[data-iam-ok]')?.addEventListener('click', () => {
            lignes = r.lignes; if (r.remiseCents !== remiseCts()) { form.remiseMode.value = 'eur'; form.remise.value = fromCents(r.remiseCents || 0); }
            if (r.invites) form.ev_invites.value = r.invites;
            iamRes.innerHTML = ''; iamT.value = ''; draw(); dirty();
            toast('Modification appliquée : vérifiez les lignes, puis cliquez sur Enregistrer.');
          });
          $('[data-iam-no]')?.addEventListener('click', () => { iamRes.innerHTML = ''; });
        } catch (err) { iamMsg.innerHTML = `<span class="err">${esc(err.message)}</span>`; }
        finally { b.disabled = false; }
      };
      $('[data-iam]').addEventListener('click', proposer);
      iamT.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); proposer(); } });
    }
    const enregistrer = async () => {
      const f = Object.fromEntries(new FormData(form));
      const cl = cache.clients.find(c => c.id === f.clientId);
      const next = { ...d, clientId: f.clientId || null, clientNom: cl?.nom || '', canal: f.canal === NOUV_SRC ? (d.canal || '') : (f.canal || ''), evenement: { ...(d.evenement || {}), type: f.ev_type, date: f.ev_date, invites: +f.ev_invites || null, lieu: f.ev_lieu, adresse: String(f.ev_adresse || '').trim(), cp: String(f.ev_cp || '').replace(/\D/g, '').slice(0, 5), ville: String(f.ev_ville || '').trim(), horaire: String(f.ev_horaire || '').trim(), livreurs: String(f.ev_livreurs || '').trim() }, validiteJusquau: f.validiteJusquau, titre: String(f.titre || '').trim(), acomptePct: f.acomptePct === '' ? null : +f.acomptePct, commercial: (() => { const x = [...(cache.R?.alertes?.personnes || []), d.commercial || {}].find(p => p.nom && p.nom === f.commercial); return x ? { nom: x.nom, tel: x.tel || '', email: x.email || '' } : null; })(), lienPaiement: f.lienPaiement, intro: f.intro, conditions: f.conditions, remiseCents: remiseCts(), remisePct: form.remiseMode.value === 'pct' && nombre(f.remise) ? Math.min(100, nombre(f.remise)) : null, lignes };
      await api(`${A}/devis/${id}`, { method: 'PUT', body: next }); cache.devis = next; $('#dirty').textContent = '';
    };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      try { await enregistrer(); toast('Devis enregistré.'); } catch (err) { toast(err.message, true); }
    });
    /* « Voir le devis » : enregistre si besoin, puis ouvre le devis tel que le client le recevra (rien n'est envoyé) */
    $$('[data-voir]').forEach(b => b.addEventListener('click', async () => {
      const w = window.open('about:blank', '_blank'); // ouvert tout de suite, sinon Safari bloque la fenêtre
      try {
        if ($('#dirty').textContent && !form.classList.contains('lock')) { await enregistrer(); toast('Devis enregistré.'); }
        const url = `${A}/devis/${id}/apercu?t=${Date.now()}`;
        if (w) w.location.href = url; else location.href = url;
      } catch (err) { if (w) w.close(); toast(err.message, true); }
    }));
    /* envoi groupé */
    const grpIds = () => $$('[data-grp]').filter(x => x.checked).map(x => x.dataset.grp);
    const majGrp = () => {
      const b = $('[data-sendgrp]'), n = grpIds().length, seul = $('[data-send]'); if (!b || !$$('[data-grp]').length) return;
      b.hidden = n < 2; b.textContent = `📨 Envoyer les ${n} devis`;
      if (seul) { seul.textContent = n >= 2 ? 'Envoyer ce devis uniquement' : (d.statut === 'brouillon' ? 'Envoyer le devis' : 'Renvoyer le devis'); seul.classList.toggle('ghost', n >= 2); }
    };
    $$('[data-grp]').forEach(x => x.addEventListener('change', majGrp)); majGrp();
    const canauxChoisis = () => [$('#c-mail').checked && 'email', $('#c-sms').checked && 'sms'].filter(Boolean);
    $('[data-sendgrp]')?.addEventListener('click', async () => {
      if ($('#dirty').textContent) { toast('Enregistrez d’abord vos modifications.', true); return; }
      const ids = grpIds(), canaux = canauxChoisis(); if (!canaux.length) return toast('Choisissez e-mail et/ou SMS.', true);
      const noms = $$('[data-grp]').filter(x => x.checked).map(x => x.closest('label').querySelector('b').textContent);
      if (!confirm(`Envoyer ces ${ids.length} devis au client en un seul message ?\n\n${noms.join(', ')}`)) return;
      try { const r = await api(A + '/actions/envoyer-devis-groupe', { method: 'POST', body: { ids, canaux, message: $('#msg').value } }); toast(r.test ? `${r.nb} devis prêts (mode test : aucun e-mail réel tant que Brevo n’est pas branché).` : `${r.nb} devis envoyés en un seul message.`); render(); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-apmail]')?.addEventListener('click', async () => {
      if ($('#dirty').textContent) { toast('Enregistrez d’abord vos modifications.', true); return; }
      const ids = $$('[data-grp]').length ? grpIds() : [id]; if (!ids.length) return toast('Cochez au moins un devis.', true);
      try {
        const r = await api(A + '/actions/envoyer-devis-groupe', { method: 'POST', body: { ids, apercu: true, message: $('#msg').value } });
        const m = document.createElement('div'); m.className = 'modal';
        m.innerHTML = `<div class="modal-in apm"><div class="bh"><h2>Aperçu de l’e-mail</h2><button class="x" data-close aria-label="Fermer">×</button></div><p class="sm"><b>À :</b> ${esc(r.a)}<br><b>Objet :</b> ${esc(r.sujet)}</p><iframe class="apm-f" sandbox title="Aperçu de l’e-mail"></iframe>${$('#c-sms').checked && r.tel ? `<p class="sm"><b>SMS au ${esc(r.tel)} :</b> ${esc(r.sms)}</p>` : ''}<p class="muted sm">Rien n’a été envoyé.</p></div>`;
        document.body.append(m); m.querySelector('iframe').srcdoc = `<meta charset="utf-8"><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;color:#222;padding:8px 14px">${r.html}</body>`;
        const fermer = () => m.remove(); m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) fermer(); });
      } catch (err) { toast(err.message, true); }
    });
    $('[data-send]')?.addEventListener('click', async () => {
      if ($('#dirty').textContent) { toast('Enregistrez d’abord vos modifications.', true); return; }
      const canaux = [$('#c-mail').checked && 'email', $('#c-sms').checked && 'sms'].filter(Boolean);
      if (!canaux.length) return toast('Choisissez e-mail et/ou SMS.', true);
      if (!confirm('Envoyer le devis au client maintenant ?')) return;
      try { const r = await api(`${A}/actions/envoyer-devis/${id}`, { method: 'POST', body: { canaux, message: $('#msg').value } }); toast(r.test ? 'Devis prêt (mode test : aucun e-mail réel tant que Brevo n’est pas branché).' : 'Devis envoyé.'); render(); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-dup]')?.addEventListener('click', async () => {
      if ($('#dirty').textContent && !confirm('Des modifications ne sont pas enregistrées : elles ne seront pas dans la copie. Continuer ?')) return;
      try { const r = await api(`${A}/actions/dupliquer-devis/${id}`, { method: 'POST', body: {} }); toast(`Copie créée : devis ${r.numero}.`); location.hash = '#/devis/' + r.id; } catch (err) { toast(err.message, true); }
    });
    $('[data-newcl]')?.addEventListener('click', async () => { try { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: { clientId: d.clientId } }); location.hash = '#/devis/' + r.id; } catch (err) { toast(err.message, true); } });
    $('[data-relance]')?.addEventListener('click', async () => { try { await api(`${A}/actions/relancer/${id}`, { method: 'POST', body: { modele: $('#mod').value } }); toast('Relance envoyée.'); render(); } catch (err) { toast(err.message, true); } });
    $('[data-rgdv]')?.addEventListener('click', async ev => {
      const montantCents = toCents($('#rg-m').value);
      if (!montantCents || montantCents <= 0) return toast('Indiquez le montant reçu.', true);
      const btn = ev.currentTarget; btn.disabled = true;
      try { const r = await api(`${A}/actions/reglement-devis/${id}`, { method: 'POST', body: { montantCents, date: $('#rg-d').value, moyen: $('#rg-mo').value, note: $('#rg-n').value } }); toast(`Règlement enregistré${r.cree ? ` : facture ${r.numero} créée, à envoyer au client` : ` sur la facture ${r.numero}`}.`); location.hash = '#/factures/' + r.id; }
      catch (err) { btn.disabled = false; toast(err.message, true); }
    });
    $$('[data-fac]').forEach(b => b.addEventListener('click', async () => { try { const r = await api(`${A}/actions/facture-depuis-devis/${id}`, { method: 'POST', body: { type: b.dataset.fac } }); toast('Facture créée.'); location.hash = '#/factures/' + r.id; } catch (err) { toast(err.message, true); } }));
  };

  /* ---------- factures (CRM) : recherche, onglets, plusieurs acomptes, envoi avec aperçu, relances, archives, avoirs ---------- */
  const FA = { q: '', onglet: 'ouvertes' };
  const FSTAT = { a_envoyer: ['À envoyer', 'd-brouillon'], non_reglee: ['Non réglée', 'd-envoye'], retard: ['En retard', 'd-refuse'], reglee: ['Réglée', 'd-accepte'], archivee: ['Archivée', 'd-brouillon'], annulee: ['Annulée (avoir)', 'd-refuse'], avoir: ['Avoir', 'd-expire'] };
  const FONGLETS = [['ouvertes', 'Non réglées', x => ['a_envoyer', 'non_reglee', 'retard'].includes(x.statutF)], ['reglees', 'Réglées', x => x.statutF === 'reglee'], ['archivees', 'Archivées', x => x.statutF === 'archivee'], ['avoirs', 'Avoirs et annulées', x => ['avoir', 'annulee'].includes(x.statutF)], ['toutes', 'Toutes', () => true]];
  const sansAcc = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /* même recherche que le serveur (server/factures.js) : client, société, e-mail, n° facture/devis, montant */
  function factureCorrespond(f, q) {
    const brut = String(q || '').trim(); if (!brut) return true;
    const x = brut.replace(/[\s €]/g, '').replace(',', '.');
    if (/^\d+(\.\d{1,2})?$/.test(x)) { const c = Math.round(parseFloat(x) * 100); if ([f.etat.ttcCents, f.etat.dueCents, f.etat.resteCents, f.totalCents, ...(f.reglements || []).map(r => r.montantCents)].some(v => v != null && (v === c || Math.floor(v / 100) === c / 100))) return true; }
    const hay = sansAcc([f.numero, f.devisNumero, f.client?.nom, f.client?.societe, f.client?.email, f.objet, f.factureNumero].join(' '));
    return sansAcc(brut).split(/\s+/).every(m => hay.includes(m));
  }
  const pillF = x => { const s = FSTAT[x.statutF] || ['', '']; return `<span class="pill ${s[1]}">${s[0]}</span>`; };
  function tableFactures(list) {
    if (!list.length) return `<div class="vide"><p>${FA.q ? 'Aucune facture ne correspond à « ' + esc(FA.q) + ' ».' : 'Aucune facture dans cet onglet.'}</p><p class="muted">Une facture se crée toute seule dès qu’un règlement du client est enregistré sur un devis signé (encadré « Règlements du client » du devis).</p></div>`;
    return `<div class="table jp fa-table"><table><thead><tr><th>N°</th><th>Client</th><th>Objet</th><th class="n">Total TTC</th><th class="n">Réglé</th><th class="n">Reste dû</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>${list.map(x => `<tr data-href="#/factures/${x.id}"><td><b>${esc(x.numero)}</b><small>${dateFr(x.date)}</small></td><td><b>${esc(x.client?.nom || '')}</b>${x.client?.societe ? `<small>${esc(x.client.societe)}</small>` : ''}</td><td>${esc(x.objet || '')}${x.devisNumero ? `<small>Devis ${esc(x.devisNumero)}</small>` : ''}</td><td class="n">${x.type === 'avoir' ? '− ' : ''}${euros(x.etat.dueCents)}</td><td class="n">${x.type === 'avoir' ? '' : euros(x.etat.regleCents)}${x.etat.nb > 1 ? `<small>${x.etat.nb} règlements</small>` : ''}</td><td class="n"><b>${x.type === 'avoir' || x.annuleeParAvoir ? '—' : euros(x.etat.resteCents)}</b></td><td>${x.echeance && x.etat.resteCents && x.type !== 'avoir' ? dateFr(x.echeance) : '—'}</td><td>${pillF(x)}${x.envoyeeLe ? `<small>envoyée le ${dateFr(x.envoyeeLe)}</small>` : ''}${(x.relances || []).length ? `<small>${x.relances.length} relance${x.relances.length > 1 ? 's' : ''}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  async function factures(id) {
    if (id) return factureFiche(id);
    const list = await api(A + '/actions/factures');
    cache.facturesL = list;
    const ouv = list.filter(x => ['a_envoyer', 'non_reglee', 'retard'].includes(x.statutF));
    const mois = new Date().toISOString().slice(0, 7);
    const encMois = list.filter(x => x.type !== 'avoir').reduce((t, x) => t + (x.reglements || []).filter(r => String(r.date).startsWith(mois)).reduce((u, r) => u + r.montantCents, 0), 0);
    const retard = ouv.filter(x => x.statutF === 'retard');
    return page('🧾 Factures', `<a class="btn ghost" href="${A}/actions/export/factures">⬇ Factures (Excel)</a><a class="btn ghost" href="${A}/actions/export/reglements">⬇ Règlements (Excel)</a>`, `
      <div class="kpis qk"><div><b>${euros(ouv.reduce((t, x) => t + x.etat.resteCents, 0))}</b><span>reste à encaisser (${ouv.length} facture${ouv.length > 1 ? 's' : ''})</span></div><div><b>${ouv.filter(x => x.statutF === 'a_envoyer').length}</b><span>factures à envoyer au client</span></div><div class="${retard.length ? 'fa-alerte' : ''}"><b>${euros(retard.reduce((t, x) => t + x.etat.resteCents, 0))}</b><span>en retard (${retard.length}) : à relancer</span></div><div><b>${euros(encMois)}</b><span>encaissé ce mois-ci</span></div></div>
      <div class="cl-bar"><input type="search" placeholder="🔍 Rechercher un client, un n° de facture ou de devis, un montant…" data-faq value="${esc(FA.q)}" aria-label="Rechercher une facture"></div>
      <nav class="df-tabs" data-fatabs>${FONGLETS.map(([k, l, fn]) => `<a href="#/factures" class="df-tab${FA.onglet === k ? ' on' : ''}" data-fo="${k}">${l} <small>${list.filter(fn).length}</small></a>`).join('')}</nav>
      <p class="muted sm" data-faqinfo></p>
      <div id="faTable"></div>`);
  }
  factures.after = id => {
    if (id) return factureFiche.after(id);
    const montrer = () => {
      const all = cache.facturesL || [];
      const fn = (FONGLETS.find(o => o[0] === FA.onglet) || FONGLETS[0])[2];
      /* une recherche regarde dans toutes les factures du client, réglées et archivées comprises */
      const l = FA.q.trim() ? all.filter(x => factureCorrespond(x, FA.q)) : all.filter(fn);
      $('[data-faqinfo]').textContent = FA.q.trim() ? `${l.length} facture${l.length > 1 ? 's' : ''} trouvée${l.length > 1 ? 's' : ''} dans tous les onglets.` : '';
      $('[data-fatabs]').style.opacity = FA.q.trim() ? '.55' : '';
      $('#faTable').innerHTML = tableFactures(l);
      $$('#faTable tr[data-href]').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    };
    $('[data-faq]').addEventListener('input', e => { FA.q = e.target.value; montrer(); });
    $$('[data-fo]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); FA.onglet = a.dataset.fo; FA.q = ''; $('[data-faq]').value = ''; $$('[data-fo]').forEach(b => b.classList.toggle('on', b === a)); montrer(); }));
    montrer();
  };

  async function factureFiche(id) {
    const f = await api(A + '/actions/facture/' + id);
    cache.facture = f;
    const e = f.etat, avoir = f.type === 'avoir', fermee = avoir || f.annuleeParAvoir;
    const today = new Date().toISOString().slice(0, 10);
    const histo = [
      ...(f.reglements || []).map(r => [r.at || r.date, `💶 ${esc(r.libelle)} de <b>${euros(r.montantCents)}</b> reçu le ${dateFr(r.date)} (${esc(r.moyen)})${r.par ? ' · saisi par ' + esc(r.par) : ''}`]),
      ...(f.envois || []).map(x => [x.at, `✉ Facture envoyée au client par ${x.canaux.map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' + ')}${x.regleCents ? ` · acomptes ${euros(x.regleCents)}, solde ${euros(x.resteCents)}` : ''} <small>${esc(x.par || '')}</small>`]),
      ...(!(f.envois || []).length && f.envoyeeLe ? [[f.envoyeeLe, '✉ Facture envoyée au client par e-mail']] : []),
      ...(f.relances || []).map(x => [x.at, `🔔 Relance du solde (${euros(x.resteCents)}) par ${x.canaux.map(k => k === 'sms' ? 'SMS' : 'e-mail').join(' + ')} <small>${esc(x.par || '')}</small>`]),
      ...(f.reglementsRetires || []).map(r => [r.retireLe, `Règlement de ${euros(r.montantCents)} du ${dateFr(r.date)} retiré (erreur de saisie) <small>${esc(r.retirePar || '')}</small>`]),
      ...(f.archivee && f.archiveeLe ? [[f.archiveeLe, '🗄 Facture archivée']] : []),
      ...(f.annuleeParAvoir ? [[f.annuleeParAvoir.le, `Annulée par l’avoir <a href="#/factures/${f.annuleeParAvoir.id}">${esc(f.annuleeParAvoir.numero)}</a>`]] : []),
      [f.createdAt, `${avoir ? 'Avoir' : 'Facture'} créé${avoir ? '' : 'e'}${f.creePar ? ' par ' + esc(f.creePar) : ''}`], /* en dernier : à la même minute, la création reste sous le 1er règlement */
    ].filter(h => h[0]).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    const moyens = f.moyens || ['Virement', 'Carte bancaire', 'Chèque', 'Espèces'];
    return page(`${avoir ? 'Avoir' : 'Facture'} ${esc(f.numero)} ${pillF(f)}`, `<a class="btn ghost" href="#/factures">← Factures</a><a class="btn ghost" href="${A}/factures/${f.id}/apercu" target="_blank" rel="noopener">👁 Voir la facture</a>`, `
      <section class="box hl fa-tete"><div class="fa-qui"><p><b><a href="#/clients/${esc(f.clientId || '')}">${esc(f.client?.nom || '')}</a></b>${f.client?.societe ? ' · ' + esc(f.client.societe) : ''}</p><p class="muted sm">${esc(f.objet || '')}${f.devis ? ` · <a href="#/devis/${f.devis.id}">Devis ${esc(f.devis.numero)}</a>` : ''}${avoir && f.factureId ? ` · <a href="#/factures/${f.factureId}">Facture ${esc(f.factureNumero)}</a>` : ''}${f.commercial ? ' · ' + esc(f.commercial) : ''}</p></div>
        <div class="kpis qk fa-k"><div><b>${avoir ? '− ' : ''}${euros(e.dueCents)}</b><span>${avoir ? 'montant de l’avoir' : 'total de la facture (TTC)'}</span></div>${avoir ? '' : `<div><b>${euros(e.regleCents)}</b><span>déjà réglé${(f.reglements || []).length > 1 ? ` (${f.reglements.length} règlements)` : ''}</span></div><div class="${e.resteCents && f.echeance && f.echeance < today && !fermee ? 'fa-alerte' : ''}"><b>${fermee ? '—' : euros(e.resteCents)}</b><span>solde restant dû</span></div><div><b>${f.echeance && e.resteCents && !fermee ? dateFr(f.echeance) : '—'}</b><span>échéance du solde</span></div>`}</div>
        ${e.tropPercuCents ? `<p class="err">Attention : ${euros(e.tropPercuCents)} reçus en trop.</p>` : ''}</section>
      ${avoir ? '' : `<section class="box"><h2>💶 Règlements du client <small class="muted">(acomptes, solde)</small></h2>
        ${(f.reglements || []).length ? `<div class="table"><table><thead><tr><th></th><th>Date</th><th>Moyen</th><th class="n">Montant</th><th>Note</th><th></th></tr></thead><tbody>${f.reglements.map(r => `<tr><td><b>${esc(r.libelle)}</b></td><td>${dateFr(r.date)}</td><td>${esc(r.moyen)}</td><td class="n"><b>${euros(r.montantCents)}</b></td><td>${esc(r.note || '')}<small class="muted">${esc(r.par || '')}</small></td><td class="n">${fermee ? '' : `<button class="lnk" type="button" data-rret="${esc(r.id)}" title="Retirer ce règlement (erreur de saisie)">Retirer</button>`}</td></tr>`).join('')}<tr class="fa-solde"><td colspan="3"><b>Solde restant dû</b></td><td class="n"><b>${euros(e.resteCents)}</b></td><td colspan="2"></td></tr></tbody></table></div>` : (f.payee ? '<p class="muted">Facture marquée payée (sans détail des règlements).</p>' : '<p class="muted">Aucun règlement reçu pour l’instant.</p>')}
        ${fermee || (e.payee && !e.resteCents) ? '' : `<form id="frg" class="fa-rg"><h3>${(f.reglements || []).length ? 'Ajouter un acompte ou le solde' : 'Enregistrer un règlement'}</h3><div class="g4"><label>Montant reçu (€ TTC)<input name="montant" inputmode="decimal" required value="${fromCents(f.propose || e.resteCents)}"></label><label>Date du règlement<input type="date" name="date" required value="${today}" max="${today}"></label><label>Moyen de paiement<select name="moyen">${moyens.map(m => `<option>${esc(m)}</option>`).join('')}</select></label><label>Note <small class="muted">(facultatif)</small><input name="note" placeholder="ex. chèque n° 1234"></label></div><div class="row"><button class="btn" type="submit">+ Enregistrer ce règlement</button>${e.resteCents ? `<button class="btn ghost" type="button" data-solde="${e.resteCents}">Mettre le solde (${euros(e.resteCents)})</button>` : ''}</div></form>`}</section>`}
      ${f.annuleeParAvoir ? '' : `<section class="box"><h2>✉ Envoyer au client</h2><p class="muted sm">${avoir ? 'L’avoir' : 'La facture'} part par e-mail avec ${avoir ? 'son montant' : 'chaque acompte versé, sa date et le solde restant dû'}, et un lien pour la voir et l’imprimer.${f.client?.email ? ` Adresse : <b>${esc(f.client.email)}</b>` : ' <b class="err">Pas d’e-mail sur la fiche client.</b>'}</p>
        <label>Message personnel <small class="muted">(facultatif, remplace la phrase d’introduction)</small><textarea id="fmsg" rows="3" placeholder="Bonjour, suite à votre acompte, voici votre facture…"></textarea></label>
        <div class="row"><label class="chk"><input type="checkbox" id="fc-mail" checked> E-mail</label><label class="chk"><input type="checkbox" id="fc-sms"${f.client?.tel ? '' : ' disabled'}> SMS${f.client?.tel ? '' : ' <small class="muted">(pas de portable)</small>'}</label></div>
        <div class="row"><button class="btn" type="button" data-fenv="0">✉ Envoyer la facture au client</button>${!avoir && e.resteCents && (f.envois || []).length ? '<button class="btn ghost" type="button" data-fenv="1">🔔 Relancer le client (solde dû)</button>' : ''}</div>
        <div id="fApercu"></div></section>`}
      <div class="cols">
        <section class="box"><h2>Historique de la facture</h2>${histo.length ? `<ul class="histo">${histo.map(h => `<li>${dateH(h[0])} · ${h[1]}</li>`).join('')}</ul>` : ''}</section>
        <section class="box"><h2>Classement</h2>
          ${f.archivee ? '<p class="muted sm">Facture réglée et archivée.</p><button class="btn ghost" type="button" data-farch="0">Remettre dans « Réglées »</button>'
            : fermee ? '<p class="muted sm">' + (avoir ? 'Un avoir est définitif.' : 'Facture annulée : elle reste dans l’onglet « Avoirs et annulées ».') + '</p>'
            : e.payee ? '<p class="muted sm">Facture entièrement réglée : vous pouvez l’archiver.</p><button class="btn" type="button" data-farch="1">🗄 Archiver la facture</button>'
            : '<p class="muted sm">Elle reste dans « Non réglées » tant qu’il reste un solde. Une fois payée, elle pourra être archivée.</p>'}
          ${!fermee && peut('factures') ? `<details class="fa-avoir"><summary>Annuler cette facture (avoir)</summary><p class="muted sm">Une facture émise ne se supprime jamais (numérotation légale). L’avoir l’annule et porte son propre numéro.</p><label>Motif<input id="amotif" placeholder="ex. événement annulé, erreur de facturation"></label><button class="btn ghost danger" type="button" data-avoir>Créer l’avoir</button></details>` : ''}</section>
      </div>`);
  }
  factureFiche.after = id => {
    const f = cache.facture;
    const recharger = () => render();
    const frg = $('#frg');
    frg?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const montantCents = toCents(frg.montant.value);
      if (!montantCents || montantCents <= 0) return toast('Indiquez le montant reçu.', true);
      if (f.etat.resteCents && montantCents > f.etat.resteCents && !confirm(`Le montant dépasse le solde dû (${euros(f.etat.resteCents)}). Enregistrer quand même ?`)) return;
      try { const r = await api(`${A}/actions/facture-reglement/${id}`, { method: 'POST', body: { montantCents, date: frg.date.value, moyen: frg.moyen.value, note: frg.note.value } }); toast(r.payee ? 'Règlement enregistré : la facture est réglée.' : `Règlement enregistré. Reste dû : ${euros(r.resteCents)}. Pensez à envoyer la facture.`); recharger(); } catch (err) { toast(err.message, true); }
    });
    $('[data-solde]')?.addEventListener('click', b => { frg.montant.value = fromCents(+b.currentTarget.dataset.solde); frg.montant.focus(); });
    $$('[data-rret]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Retirer ce règlement ? (à faire seulement en cas d’erreur de saisie : il restera noté dans l’historique)')) return;
      try { await api(`${A}/actions/facture-reglement-retirer/${id}`, { method: 'POST', body: { rid: b.dataset.rret } }); toast('Règlement retiré.'); recharger(); } catch (err) { toast(err.message, true); }
    }));
    $$('[data-fenv]').forEach(b => b.addEventListener('click', async () => {
      const relance = b.dataset.fenv === '1';
      const canaux = [$('#fc-mail').checked && 'email', $('#fc-sms').checked && 'sms'].filter(Boolean);
      if (!canaux.length) return toast('Choisissez e-mail et/ou SMS.', true);
      const url = `${A}/actions/${relance ? 'relancer' : 'envoyer'}-facture/${id}`, message = $('#fmsg').value;
      try {
        const ap = await api(url, { method: 'POST', body: { apercu: true, message } });
        const box = $('#fApercu');
        box.innerHTML = `<div class="fa-ap"><p class="sm"><b>Aperçu ${relance ? 'de la relance' : 'de l’e-mail'}</b> · rien n’est encore parti.</p><p class="sm">À : <b>${esc(ap.to || '(pas d’e-mail)')}</b><br>Objet : <b>${esc(ap.sujet)}</b></p>${canaux.includes('email') ? '<iframe class="fa-frame" sandbox title="Aperçu de l’e-mail"></iframe>' : ''}${canaux.includes('sms') ? `<p class="sm"><b>SMS :</b> ${esc(ap.sms)}</p>` : ''}<div class="row"><button class="btn" type="button" data-fok>${relance ? '🔔 Confirmer la relance' : '✉ Confirmer l’envoi au client'}</button><button class="btn ghost" type="button" data-fko>Annuler</button><a class="btn ghost" href="${A}/factures/${id}/apercu" target="_blank" rel="noopener">👁 Voir la facture</a></div></div>`;
        const fr = box.querySelector('iframe'); if (fr) fr.srcdoc = ap.html;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        box.querySelector('[data-fko]').addEventListener('click', () => { box.innerHTML = ''; });
        box.querySelector('[data-fok]').addEventListener('click', async ev => {
          ev.currentTarget.disabled = true;
          try { const r = await api(url, { method: 'POST', body: { canaux, message } }); toast(r.test ? 'Prêt (mode essai : rien n’est parti tant que Brevo n’est pas branché).' : relance ? 'Relance envoyée au client.' : 'Facture envoyée au client.'); recharger(); } catch (err) { ev.currentTarget.disabled = false; toast(err.message, true); }
        });
      } catch (err) { toast(err.message, true); }
    }));
    $$('[data-farch]').forEach(b => b.addEventListener('click', async () => { try { await api(`${A}/actions/archiver-facture/${id}`, { method: 'POST', body: { archivee: b.dataset.farch === '1' } }); toast(b.dataset.farch === '1' ? 'Facture archivée.' : 'Facture remise dans « Réglées ».'); recharger(); } catch (err) { toast(err.message, true); } }));
    $('[data-avoir]')?.addEventListener('click', async () => {
      if (!confirm(`Créer un avoir qui annule la facture ${f.numero} ? C’est définitif.`)) return;
      try { const r = await api(`${A}/actions/avoir-facture/${id}`, { method: 'POST', body: { motif: $('#amotif').value } }); toast(`Avoir ${r.numero} créé.`); location.hash = '#/factures/' + r.id; } catch (err) { toast(err.message, true); }
    });
  };


  /* ---------- agenda ---------- */
  async function agenda(id) {
    const [tous, eq, R0] = await Promise.all([api(A + '/actions/agenda'), cache.equipe ? Promise.resolve(null) : api(A + '/actions/equipe').catch(() => []), cache.R ? Promise.resolve(null) : api(A + '/site').catch(() => ({}))]);
    if (eq) cache.equipe = eq.filter(u => !u.desactive); if (R0) cache.R = R0;
    const qui = mem.get('mg_commercial') || '', noms = commerciaux();
    const items = tous.filter(x => !qui || (qui === '—' ? !(x.commerciaux?.length || x.commercial) : x.commerciaux ? !x.commerciaux.length || x.commerciaux.includes(qui) : x.type === 'evenement' ? !x.commercial || x.commercial === qui : true));
    const base = id ? new Date(id + '-01T12:00') : new Date();
    const y = base.getFullYear(), m = base.getMonth();
    const first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ym = (yy, mm) => { const d = new Date(yy, mm, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const today = key(new Date());
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const k = key(d);
      const ev = items.filter(x => x.date === k);
      cells += `<div class="cal-d${d.getMonth() !== m ? ' out' : ''}${k === today ? ' today' : ''}"><span>${d.getDate()}</span>${ev.map(x => `<a href="${x.lien}" class="cal-e st-${x.statut || 'rdv'}" title="${esc(x.detail || '')}">${esc(x.titre)}</a>`).join('')}</div>`;
    }
    const aVenir = items.filter(x => x.date >= today).slice(0, 20);
    return page('Agenda', `<a class="btn ghost" href="#/agenda/${ym(y, m - 1)}">←</a><span class="mois">${first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span><a class="btn ghost" href="#/agenda/${ym(y, m + 1)}">→</a>`, `
      <div class="ag-who"><span class="qs-olab">Agenda de</span><label class="qs-csel"><span aria-hidden="true">👤</span><select data-agcom aria-label="Choisir le commercial"><option value="">Tous les commerciaux</option>${noms.map(n => `<option value="${esc(n)}"${qui === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label><span class="muted sm">${qui ? 'Ses appels, visios et événements, plus ceux de toute l’équipe.' : 'Tous les rendez-vous de l’équipe.'}</span></div>
      <div class="cal"><div class="cal-h">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<span>${j}</span>`).join('')}</div><div class="cal-g">${cells}</div></div>
      <div class="cols"><section class="box"><h2>À venir</h2>${aVenir.length ? `<ul class="list">${aVenir.map(x => `<li><a href="${x.lien}"><b>${dateFr(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${esc(x.titre)}</a><small class="muted">${esc(x.detail || '')}</small></li>`).join('')}</ul>` : '<p class="muted">Rien de prévu.</p>'}</section>
      <section class="box"><h2>Ajouter un rendez-vous</h2><form id="rdv"><div class="g2"><label>Date<input type="date" name="date" required></label><label>Heure<input type="time" name="heure"></label></div><label>Objet<input name="titre" required placeholder="Dégustation, visite de lieu…"></label><label>Détail<input name="detail"></label><button class="btn">Ajouter</button></form></section></div>`);
  }
  agenda.after = () => {
    $('[data-agcom]')?.addEventListener('change', e => { mem.set('mg_commercial', e.target.value); SV.o = e.target.value; render(); });
    $('#rdv')?.addEventListener('submit', async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api(A + '/rdv', { method: 'POST', body: { ...f, titre: (f.heure ? f.heure + ' · ' : '') + f.titre, statut: 'rdv' } }); toast('Rendez-vous ajouté.'); render(); });
  };

  /* ---------- clients (liste en pages : le fichier importé compte des dizaines de milliers de fiches) ---------- */
  const CL = { q: '', page: 1, filtre: '', k: {}, sel: new Set(), vue: '', tri: 'activite', sens: 'desc' };
  /* recherche multicritère de la liste Clients (demande de Jean-Luc, 2026-11-24) */
  const urlClients = () => `${A}/clients?par=50&page=${CL.page}&filtre=${CL.filtre}${CL.vue ? '&vue=' + CL.vue : ''}&tri=${CL.tri}&sens=${CL.sens}&q=${encodeURIComponent(CL.q)}${Object.entries(CL.k).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')}`;
  const compteClients = n => `<b>${Number(n).toLocaleString('fr-FR')}</b> contact${n > 1 ? 's' : ''}`;
  function filtresClients(F, total) {
    const n = x => Number(x).toLocaleString('fr-FR');
    const sel = (k, lab, opts) => `<label class="cl-crit"><span>${lab}</span><select data-ck="${k}"${CL.k[k] ? ' class="on"' : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(CL.k[k] || '') === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const liste = (l, tous) => [['', tous], ...l.map(([v, c]) => [v, `${esc(v)} (${n(c)})`])];
    const nb = Object.values(CL.k).filter(Boolean).length;
    return `<details class="box cl-multi"${nb || mem.get('mg_clmulti') === '1' ? ' open' : ''}><summary>🔎 Recherche multicritère${nb ? ` <span class="cl-nbk">${nb} critère${nb > 1 ? 's' : ''}</span>` : ''}<span class="cl-cpt" data-clcpt aria-live="polite">${compteClients(total)}</span></summary>
      <div class="cl-gr"><p class="cl-gt">👤 Le contact</p><div class="cl-crits">
        ${sel('canal', '🧭 Origine du contact (source)', [['', 'Toutes les sources'], ...(F.canal || []).map(([v, c]) => [v, `${esc(v)} (${n(c)})`]), ['aucune', `Non renseignée (${n(F.sansCanal || 0)})`]])}
        ${sel('pro', 'Particulier ou entreprise', [['', 'Tous'], ['part', 'Particuliers'], ['pro', 'Entreprises (société renseignée)']])}
        ${sel('civ', 'Civilité', [['', 'Toutes'], ['Mme', 'Madame'], ['M.', 'Monsieur'], ['aucune', 'Non renseignée']])}
        ${sel('dep', 'Département', [['', 'Tous'], ['idf', 'Toute l’Île-de-France'], ...F.dep.map(([v, c]) => [v, `${esc(v)} (${n(c)})`]), ['aucun', 'Inconnu']])}
        ${sel('fonction', '💼 Fonction (ex. Responsable de salle)', liste(F.fonction || [], 'Toutes'))}
        ${sel('contactDe', 'Contact de (apporté par)', liste(F.contactDe, 'Tout le monde'))}</div></div>
      <div class="cl-gr"><p class="cl-gt">🎭 Prestataires et talents</p><div class="cl-crits">
        ${sel('metier', 'Métier', [['', 'Tous (clients compris)'], ['*', 'Tous les prestataires'], ...F.metiers.map(([v, c]) => [v, `${esc(v)} (${n(c)})`])])}
        ${sel('dj', 'Style de DJ', liste(F.dj, 'Tous'))}
        ${sel('indep', 'Indépendant(e)', [['', 'Peu importe'], ['1', `Oui (${n(F.indep)})`]])}
        ${sel('permis', 'Permis de conduire', [['', 'Peu importe'], ['1', `Oui (${n(F.permis)})`]])}</div></div>
      ${filtresHisto(F.histo, sel, liste, n)}
      <div class="cl-gr"><p class="cl-gt">✉ Pour le joindre</p><div class="cl-crits">
        ${sel('joignable', 'Joignable par', [['', 'Peu importe'], ['email', 'E-mail'], ['sms', 'SMS (portable)'], ['les2', 'E-mail et SMS'], ['aucun', 'Ni e-mail ni SMS']])}
        ${sel('npc', 'NE PAS CONTACTER', [['', 'Peu importe'], ['non', 'Sauf « ne pas contacter »'], ['oui', `Seulement « ne pas contacter » (${n(F.npc)})`]])}</div></div>
      <div class="row cl-res"><span class="cl-cpt grand" data-clcpt>${compteClients(total)}</span><span class="muted sm">correspondent à votre sélection</span>${nb ? '<button type="button" class="btn ghost sm" data-ckclear>✕ Effacer les critères</button>' : ''}</div></details>`;
  }
  /* historique commercial de l'ancien CRM (Jean-Luc, 2026-11-26) : a commandé ou non, combien, quand, quel événement */
  function filtresHisto(H, sel, liste, n) {
    if (!H || !(H.commande || H.perdus || H.factures)) return '';
    const eu = v => Number(v).toLocaleString('fr-FR') + ' € HT et plus';
    return `<div class="cl-gr cl-gr-h"><p class="cl-gt">🛍 Historique commercial (ancien CRM, depuis 2017)</p><div class="cl-crits">
        ${sel('hcmd', 'A commandé', [['', 'Peu importe'], ['oui', `Oui, au moins une fois (${n(H.commande)})`], ['2', '2 fois ou plus'], ['3', '3 fois ou plus'], ['5', '5 fois ou plus'], ...(H.perdus ? [['non', `Devis refusé, jamais commandé (${n(H.perdus)})`]] : []), ['jamais', 'N’a jamais commandé']])}
        ${sel('hder', 'Dernière commande', [['', 'Peu importe'], ['moins12', 'Dans les 12 derniers mois'], ['plus12', 'Il y a plus d’un an'], ['plus24', 'Il y a plus de 2 ans'], ['plus36', 'Il y a plus de 3 ans'], ...H.ans.map(([v, c]) => [v, `En ${v} (${n(c)})`])])}
        ${sel('hmontant', 'Montant total commandé', [['', 'Peu importe'], ...[500, 1000, 2000, 3000, 5000, 10000, 20000].map(v => [String(v), eu(v)])])}
        ${sel('hevt', 'Type d’événement', liste(H.evt, 'Tous'))}
        ${sel('hcom', 'Commercial (ancien CRM)', liste(H.com, 'Tous'))}
        ${H.motifs.length ? sel('hmotif', 'Motif du refus', liste(H.motifs, 'Tous')) : ''}
        ${H.factures ? sel('hfac', 'Factures (ancien CRM)', [['', 'Peu importe'], ['oui', `A au moins une facture (${n(H.factures)})`], ...(HISTO_RESTE_DU ? [['impaye', `Facture pas soldée (${n(H.impayes)})`]] : []), ['non', 'Aucune facture']]) : ''}</div></div>`;
  }
  async function clients(id, sub) {
    if (id === 'entreprises') return sub ? ficheEntreprise(sub) : entreprises();
    if ((id === 'email' || id === 'sms') && !peut('diffusion')) return sansAcces();
    if ((id === 'importer' || id === 'historique') && !peut('fichiers')) return sansAcces();
    if (id === 'historique') return importerHistorique();
    if (id === 'email' || id === 'sms') return diffusion(id);
    if (id === 'importer') return importerClients();
    if (id === 'appels') return appelsClients();
    const vueNouv = id === 'clients' ? 'clients' : '';
    if (id && !vueNouv) return client(id);
    if (CL.vue !== vueNouv) { CL.vue = vueNouv; CL.page = 1; CL.sel.clear(); }
    const r = await api(urlClients());
    return page(CL.vue ? 'Clients' : 'Liste des contacts', `${peut('fichiers') ? '<a class="btn ghost" href="#/clients/importer">⬆ Importer des contacts</a><a class="btn ghost" href="#/clients/historique">📜 Importer l’historique commercial</a>' : ''}<a class="btn" href="#/clients/nouveau">+ Nouveau contact</a>`, `
      ${ongletsClients('')}${bandeauClients(CL.vue, r.tous, r.entreprises, r.acheteurs)}${CL.vue ? '<p class="muted sm cl-vue-txt">🛍 Toutes les personnes qui n’ont pas d’entreprise renseignée.</p>' : ''}<div class="cl-bar"><input type="search" placeholder="🔍 Chercher dans toutes les cases des fiches : nom, téléphone, e-mail, société, ville, métier, remarque, rue…" data-q value="${esc(CL.q)}" aria-label="Rechercher un client">
        <div class="cl-f">${[['', `Tous (${(CL.vue ? r.acheteurs : r.tous).toLocaleString('fr-FR')})`], ['importes', `Fichier importé (${r.importes.toLocaleString('fr-FR')})`], ['autres', 'Site et back-office']].map(([k, l]) => `<button type="button" class="qs-own-b${CL.filtre === k ? ' on' : ''}" data-clf="${k}">${l}</button>`).join('')}</div></div>
      ${CL.dernier ? `<div class="okbox cl-remet"><span>🗑 ${CL.dernier.nb.toLocaleString('fr-FR')} contact${CL.dernier.nb > 1 ? 's' : ''} effacé${CL.dernier.nb > 1 ? 's' : ''}.</span><button type="button" class="btn ghost sm" data-clremet>↶ Remettre</button></div>` : ''}<div id="clMulti">${filtresClients(r.facettes, r.total)}</div><div id="clTable">${tableClients(r)}</div>`);
  }
  /* après une recherche : envoyer un SMS ou un e-mail aux contacts trouvés (Jean-Luc, 2026-11-27) */
  const rechercheActive = () => !!(CL.q.trim() || CL.filtre || Object.values(CL.k).some(Boolean));
  function barreEnvoi(r) {
    if (!peut('diffusion') || !rechercheActive() || !r.joignables) return '';
    const j = r.joignables, n = x => Number(x).toLocaleString('fr-FR');
    return `<div class="cl-env" role="region" aria-label="Envoyer aux contacts trouvés"><p>🔎 <b>${n(r.total)}</b> contact${r.total > 1 ? 's' : ''} trouvé${r.total > 1 ? 's' : ''}<small>${n(j.sms)} joignable${j.sms > 1 ? 's' : ''} par SMS · ${n(j.email)} par e-mail (désinscrits et « ne pas contacter » jamais comptés)</small></p>
      <button type="button" class="btn" data-clenv="sms"${j.sms ? '' : ' disabled'}>💬 Envoyer un SMS <small>(${n(j.sms)})</small></button><button type="button" class="btn or" data-clenv="email"${j.email ? '' : ' disabled'}>✉️ Envoyer un e-mail <small>(${n(j.email)})</small></button></div>`;
  }
  /* résumé lisible de la recherche, repris sur l'écran d'envoi */
  function resumeRecherche() {
    const out = [];
    if (CL.q.trim()) out.push(`Mot cherché : « ${CL.q.trim()} »`);
    if (CL.vue === 'clients') out.push('Clients (sans entreprise)');
    if (CL.filtre) out.push(CL.filtre === 'importes' ? 'Fichier importé' : 'Site et back-office');
    $$('[data-ck]').forEach(x => { if (!x.value) return; const lab = x.closest('label')?.querySelector('span')?.textContent || x.dataset.ck; out.push(`${lab.replace(/^[^\p{L}]+/u, '')} : ${(x.selectedOptions[0]?.textContent || x.value).replace(/\s*\([\d\s\u00a0\u202f]+\)$/, '')}`); });
    return out;
  }
  function envoyerARecherche(canal) {
    let st = {}; try { st = JSON.parse(mem.get(DFK(canal)) || '{}') || {}; } catch { /* */ }
    st.mode = 'recherche'; st.recherche = { q: CL.q.trim(), filtre: CL.filtre, vue: CL.vue, k: { ...CL.k }, resume: resumeRecherche() };
    mem.set(DFK(canal), JSON.stringify(st));
    location.hash = '#/clients/' + canal;
  }
  function tableClients(r) {
    const pages = Math.max(1, Math.ceil(r.total / r.par));
    const ef = peut('effacerContacts'), libres = r.items.filter(c => !c.verrou);
    const ckTete = ef ? `<th class="ck"><input type="checkbox" data-cltout aria-label="Cocher toute la page" title="Cocher toute la page"${libres.length && libres.every(c => CL.sel.has(c.id)) ? ' checked' : ''}></th>` : '';
    const ck = c => !ef ? '' : c.verrou ? '<td class="ck" title="A une demande, un devis ou une facture : ne peut pas être effacé">🔒</td>' : `<td class="ck"><input type="checkbox" data-clsel="${esc(c.id)}" aria-label="Cocher ${esc(c.nom || '')}"${CL.sel.has(c.id) ? ' checked' : ''}></td>`;
    return `${barreEnvoi(r)}${ef ? `<div class="row sel-bar cl-sel"><button type="button" class="btn danger sm" data-cleff${CL.sel.size ? '' : ' disabled'}>🗑 Effacer${CL.sel.size ? ' ' + CL.sel.size.toLocaleString('fr-FR') + ' contact' + (CL.sel.size > 1 ? 's' : '') : ''}</button><span class="muted sm">${CL.sel.size ? `${CL.sel.size.toLocaleString('fr-FR')} coché${CL.sel.size > 1 ? 's' : ''} · <button type="button" class="lnk" data-clnone>Tout décocher</button>` : 'Cochez les contacts à effacer.'}${r.total > libres.length ? ` · <button type="button" class="lnk" data-clall>Cocher les ${r.total.toLocaleString('fr-FR')} contacts de cette recherche</button>` : ''}</span></div>` : ''}<div class="table"><table><thead><tr>${ckTete}${[['nom', 'Nom'], ['societe', 'Société'], ['contact', 'Contact'], ['ville', 'Ville'], ['demandes', 'Demandes', 'n'], ['montant', 'Commandé (HT)', 'n'], ['activite', CL.tri === 'activite' && CL.sens === 'asc' ? 'Première activité' : 'Dernière activité']].map(([k, l, cls]) => `<th class="cl-th${cls ? ' ' + cls : ''}${CL.tri === k ? ' on' : ''}"${CL.tri === k ? ` aria-sort="${CL.sens === 'asc' ? 'ascending' : 'descending'}"` : ''}><button type="button" data-cltri="${k}" title="Trier par ${esc(l.toLowerCase())}">${l}<span class="cl-fl">${CL.tri === k ? (CL.sens === 'asc' ? '▲' : '▼') : '▲▼'}</span></button></th>`).join('')}<th></th></tr></thead><tbody>
      ${r.items.map(c => `<tr data-href="#/clients/${esc(c.id)}">${ck(c)}<td><b>${esc(c.nom || '—')}</b>${c.nePasContacter ? ' <span class="pill d-refuse" title="NE PAS CONTACTER">⛔</span>' : ''}${(c.metiers || []).length ? `<small class="cl-met">🎭 ${esc(c.metiers.join(', '))}</small>` : ''}${c.source === 'import CRM' ? '<small class="cl-imp">fichier importé</small>' : ''}${canalDe(c) && canalDe(c) !== 'Import' ? `<small class="cl-src">${pillSource(canalDe(c))}</small>` : ''}</td><td>${esc(c.societe || '')}</td><td>${esc(c.email || '')}<small>${esc(c.tel || '')}</small></td><td>${esc([c.cp, c.ville].filter(Boolean).join(' '))}</td><td class="n">${c.nbDemandes || ''}</td><td class="n cl-cmd">${c.histo?.commandes ? `<b>${eurosRond(c.histo.caHtCents)}</b><small>${c.histo.commandes} commande${c.histo.commandes > 1 ? 's' : ''} · ${esc(String(c.histo.derniere || '').slice(0, 4))}</small>` : c.histo?.perdues ? '<small class="muted">n’a pas commandé</small>' : c.fac?.factures ? `<b>${eurosRond(c.fac.netHtCents)}</b><small>${c.fac.factures} facture${c.fac.factures > 1 ? 's' : ''}</small>` : ''}${HISTO_RESTE_DU && c.fac?.duCents ? `<small class="hs-dn">reste dû ${eurosRond(c.fac.duCents)}</small>` : ''}</td><td>${dateFr(c.derniereActivite)}</td><td class="n"><a class="qs-back cl-edit" href="#/clients/${esc(c.id)}?edit=1" title="Modifier la fiche">✏ Modifier</a></td></tr>`).join('') || `<tr><td colspan="${ef ? 9 : 8}" class="muted">${r.tous ? 'Aucun client ne correspond.' : 'Aucun client pour le moment.'}</td></tr>`}</tbody></table></div>
      ${r.total > r.par ? `<div class="cl-pages"><button type="button" class="btn ghost sm" data-clp="-1"${r.page <= 1 ? ' disabled' : ''}>‹ Précédents</button><span>${((r.page - 1) * r.par + 1).toLocaleString('fr-FR')} à ${Math.min(r.total, r.page * r.par).toLocaleString('fr-FR')} sur ${r.total.toLocaleString('fr-FR')}</span><button type="button" class="btn ghost sm" data-clp="1"${r.page >= pages ? ' disabled' : ''}>Suivants ›</button></div>` : `<p class="muted sm cl-nb">${r.total.toLocaleString('fr-FR')} ${CL.vue ? 'client' : 'contact'}${r.total > 1 ? 's' : ''}</p>`}`;
  }
  clients.after = (id, sub) => {
    if (id === 'entreprises') return sub ? ficheEntreprise.after(sub) : entreprises.after();
    if (id === 'email' || id === 'sms') return diffusion.after(id);
    if (id === 'importer') return importerClients.after();
    if (id === 'historique') return importerHistorique.after();
    if (id === 'appels') return appelsClients.after();
    if (id && id !== 'clients') return client.after(id);
    const recharger = async (multi) => { try { const r = await api(urlClients()); $('#clTable').innerHTML = tableClients(r); if (multi) { $('#clMulti').innerHTML = filtresClients(r.facettes, r.total); brancherMulti(); } else $$('[data-clcpt]').forEach(x => { x.innerHTML = compteClients(r.total); x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop'); }); brancher(); } catch (e) { toast(e.message, true); } };
    const brancherMulti = () => {
      $$('[data-ck]').forEach(x => x.addEventListener('change', () => { CL.k[x.dataset.ck] = x.value; CL.page = 1; recharger(true); }));
      $('[data-ckclear]')?.addEventListener('click', () => { CL.k = {}; CL.page = 1; recharger(true); });
      $('.cl-multi')?.addEventListener('toggle', e => mem.set('mg_clmulti', e.target.open ? '1' : '0'));
    };
    brancherMulti();
    const brancher = () => {
      $$('[data-clenv]').forEach(b => b.addEventListener('click', () => envoyerARecherche(b.dataset.clenv)));
      $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a') && !e.target.closest('.ck')) location.hash = tr.dataset.href; }));
      /* tri : 1er clic = A → Z (ou le plus récent / le plus grand), 2e clic = l'inverse */
      $$('[data-cltri]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.cltri; if (CL.tri === k) CL.sens = CL.sens === 'asc' ? 'desc' : 'asc'; else { CL.tri = k; CL.sens = ['activite', 'demandes', 'montant'].includes(k) ? 'desc' : 'asc'; } CL.page = 1; recharger(); }));
      /* cases à cocher + « Effacer » (Jean-Luc, 2026-11-24) */
      const majSel = () => { const b = $('[data-cleff]'); if (!b) return; b.disabled = !CL.sel.size; b.textContent = '🗑 Effacer' + (CL.sel.size ? ` ${CL.sel.size.toLocaleString('fr-FR')} contact${CL.sel.size > 1 ? 's' : ''}` : ''); };
      $$('[data-clsel]').forEach(x => x.addEventListener('change', () => { if (x.checked) CL.sel.add(x.dataset.clsel); else CL.sel.delete(x.dataset.clsel); majSel(); }));
      $('[data-cltout]')?.addEventListener('change', e => { $$('[data-clsel]').forEach(x => { x.checked = e.target.checked; if (x.checked) CL.sel.add(x.dataset.clsel); else CL.sel.delete(x.dataset.clsel); }); recharger(); });
      $('[data-clnone]')?.addEventListener('click', () => { CL.sel.clear(); recharger(); });
      $('[data-clall]')?.addEventListener('click', async () => { try { const r = await api(urlClients() + '&avecIds=1&par=10'); r.effacables.forEach(x => CL.sel.add(x)); toast(`${r.effacables.length.toLocaleString('fr-FR')} contacts cochés${r.total > r.effacables.length ? ` (${(r.total - r.effacables.length).toLocaleString('fr-FR')} protégés 🔒 laissés de côté)` : ''}.`); recharger(); } catch (e) { toast(e.message, true); } });
      $('[data-cleff]')?.addEventListener('click', async () => {
        const n = CL.sel.size; if (!n) return;
        if (!confirm(`Effacer ${n > 1 ? 'ces ' + n.toLocaleString('fr-FR') + ' contacts' : 'ce contact'} ?\n\nLes contacts qui ont une demande, un devis ou une facture sont protégés et ne seront pas effacés.\nVous pourrez tout remettre avec « ↶ Remettre ».`)) return;
        try {
          const r = await api(A + '/actions/effacer-clients', { method: 'POST', body: { ids: [...CL.sel] } });
          CL.sel.clear();
          CL.dernier = r.lot ? { lot: r.lot, nb: r.effaces } : null;
          toast(`${r.effaces.toLocaleString('fr-FR')} contact${r.effaces > 1 ? 's' : ''} effacé${r.effaces > 1 ? 's' : ''}.${r.gardes ? ` ${r.gardes} protégé${r.gardes > 1 ? 's' : ''} 🔒 gardé${r.gardes > 1 ? 's' : ''}.` : ''}`);
          render();
        } catch (e) { toast(e.message, true); }
      });
      const rb = $('[data-clremet]'); if (rb) rb.onclick = async () => {
        try { const r = await api(`${A}/actions/effacer-clients/${encodeURIComponent(CL.dernier.lot)}/remettre`, { method: 'POST' }); CL.dernier = null; toast(`${r.remis.toLocaleString('fr-FR')} contact${r.remis > 1 ? 's' : ''} remis.`); render(); } catch (e) { toast(e.message, true); }
      };
      $$('[data-clp]').forEach(b => b.addEventListener('click', () => { CL.page += +b.dataset.clp; recharger(); window.scrollTo(0, 0); }));
    };
    brancher();
    const q = $('[data-q]');
    q?.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(() => { CL.q = q.value.trim(); CL.page = 1; recharger(); }, 250); });
    $$('[data-clf]').forEach(b => b.addEventListener('click', () => { CL.filtre = b.dataset.clf; CL.page = 1; $$('[data-clf]').forEach(x => x.classList.toggle('on', x === b)); recharger(); }));
  };


  /* ---------- entreprises : bandeau « Contacts / Entreprises » (Jean-Luc, 2026-11-24) ----------
     une fiche entreprise (nom, SIRET, adresse…) à laquelle plusieurs contacts sont reliés */
  const bandeauClients = (cur, nC, nE, nA) => `<div class="cl-vue"><span class="cl-vue-lab">Afficher</span><div class="cl-vue-rail">${[['', '👥', 'Tous les contacts', nC], ['entreprises', '🏢', 'Entreprises', nE], ['clients', '🛍', 'Clients', nA]].map(([k, i, l, n]) => `<a href="#/clients${k ? '/' + k : ''}" class="cl-vue-c${cur === k ? ' on' : ''}"${cur === k ? ' aria-current="page"' : ''}><span class="cl-vue-i">${i}</span>${l}${n != null ? ` <small>${Number(n).toLocaleString('fr-FR')}</small>` : ''}</a>`).join('')}</div></div>`;
  const EN = { q: '', page: 1, filtre: '' };
  async function entreprises() {
    const [r, rc] = await Promise.all([api(`${A}/entreprises?par=50&page=${EN.page}&filtre=${EN.filtre}&q=${encodeURIComponent(EN.q)}`), api(`${A}/clients?par=10&page=1&q=`).catch(() => ({ tous: null }))]);
    return page('Entreprises', `<a class="btn" href="#/clients/entreprises/nouvelle">+ Nouvelle entreprise</a>`, `
      ${ongletsClients('')}${bandeauClients('entreprises', rc.tous, r.tous, rc.acheteurs)}<div class="cl-bar"><input type="search" placeholder="🔍 Nom de l’entreprise, SIRET, ville, nom d’un contact…" data-q value="${esc(EN.q)}" aria-label="Rechercher une entreprise">
        <div class="cl-f">${[['', `Toutes (${r.tous.toLocaleString('fr-FR')})`], ['avec', 'Avec des contacts'], ['sans', 'Sans contact']].map(([k, l]) => `<button type="button" class="qs-own-b${EN.filtre === k ? ' on' : ''}" data-enf="${k}">${l}</button>`).join('')}</div></div>
      <div id="enTable">${tableEntreprises(r)}</div>`);
  }
  function tableEntreprises(r) {
    const pages = Math.max(1, Math.ceil(r.total / r.par));
    return `<div class="table"><table><thead><tr><th>Entreprise</th><th>SIRET</th><th>Contacts</th><th>Ville</th><th class="n">Nb</th><th>Dernière activité</th><th></th></tr></thead><tbody>
      ${r.items.map(e => `<tr data-href="#/clients/entreprises/${esc(e.id)}"><td><span class="en-nm"><span class="en-av">🏢</span><b>${esc(e.nom || '—')}</b></span></td><td>${esc(e.siret || '')}</td><td class="en-ap">${esc((e.apercu || []).join(', '))}${e.nbContacts > (e.apercu || []).length ? ' …' : ''}</td><td>${esc([e.cp, e.ville].filter(Boolean).join(' '))}</td><td class="n">${e.nbContacts || ''}</td><td>${dateFr(e.derniereActivite)}</td><td class="n"><a class="qs-back cl-edit" href="#/clients/entreprises/${esc(e.id)}" title="Ouvrir la fiche">Ouvrir ›</a></td></tr>`).join('') || `<tr><td colspan="7" class="muted">${r.tous ? 'Aucune entreprise ne correspond.' : 'Aucune entreprise pour le moment. Elles se créent toutes seules quand un contact a une société, ou avec « + Nouvelle entreprise ».'}</td></tr>`}</tbody></table></div>
      ${r.total > r.par ? `<div class="cl-pages"><button type="button" class="btn ghost sm" data-enp="-1"${r.page <= 1 ? ' disabled' : ''}>‹ Précédentes</button><span>${((r.page - 1) * r.par + 1).toLocaleString('fr-FR')} à ${Math.min(r.total, r.page * r.par).toLocaleString('fr-FR')} sur ${r.total.toLocaleString('fr-FR')}</span><button type="button" class="btn ghost sm" data-enp="1"${r.page >= pages ? ' disabled' : ''}>Suivantes ›</button></div>` : `<p class="muted sm cl-nb">${r.total.toLocaleString('fr-FR')} entreprise${r.total > 1 ? 's' : ''}</p>`}`;
  }
  entreprises.after = () => {
    const recharger = async () => { try { const r = await api(`${A}/entreprises?par=50&page=${EN.page}&filtre=${EN.filtre}&q=${encodeURIComponent(EN.q)}`); $('#enTable').innerHTML = tableEntreprises(r); brancher(); } catch (e) { toast(e.message, true); } };
    const brancher = () => {
      $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
      $$('[data-enp]').forEach(b => b.addEventListener('click', () => { EN.page += +b.dataset.enp; recharger(); window.scrollTo(0, 0); }));
    };
    brancher();
    const q = $('[data-q]');
    q?.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(() => { EN.q = q.value.trim(); EN.page = 1; recharger(); }, 250); });
    $$('[data-enf]').forEach(b => b.addEventListener('click', () => { EN.filtre = b.dataset.enf; EN.page = 1; $$('[data-enf]').forEach(x => x.classList.toggle('on', x === b)); recharger(); }));
  };
  const formEntreprise = e => `<label>Nom de l’entreprise<input name="nom" value="${esc(e.nom || '')}" required placeholder="ex. JEPRIVATIZ"></label><div class="g2"><label>SIRET <small class="muted">(14 chiffres)</small><input name="siret" value="${esc(e.siret || '')}" inputmode="numeric"></label><label>N° de TVA intracommunautaire<input name="tva" value="${esc(e.tva || '')}"></label></div><label>Secteur d’activité<input name="secteur" value="${esc(e.secteur || '')}" placeholder="ex. banque, agence événementielle, mairie…"></label><label>Adresse<textarea name="adresse" rows="2">${esc(e.adresse || '')}</textarea></label><div class="g2"><label>Code postal<input name="cp" value="${esc(e.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="ville" value="${esc(e.ville || '')}"></label></div><div class="g2"><label>Téléphone (standard)<input name="tel" value="${esc(e.tel || '')}" inputmode="tel"></label><label>E-mail (général, comptabilité…)<input type="email" name="email" value="${esc(e.email || '')}"></label></div><label>Site internet<input name="site" value="${esc(e.site || '')}" placeholder="ex. www.entreprise.fr"></label><label>🔒 Remarque <small class="muted">(visible seulement par l’équipe)</small><textarea name="notes" rows="3">${esc(e.notes || '')}</textarea></label>`;
  async function ficheEntreprise(id) {
    if (id === 'nouvelle') return page('Nouvelle entreprise', '<a class="btn ghost" href="#/clients/entreprises">← Entreprises</a>', `<section class="box hc-form"><form id="enf">${formEntreprise({})}<button class="btn">Créer l’entreprise</button></form></section>`);
    const h = await api(A + '/entreprises/' + id); cache.ent = h;
    const e = h.entreprise, r = h.resume, tel = String(e.tel || '').replace(/[^\d+]/g, '');
    const site = e.site ? (/^https?:/i.test(e.site) ? e.site : 'https://' + e.site) : '';
    return page('🏢 ' + esc(e.nom), `<a class="btn ghost" href="#/clients/entreprises">← Entreprises</a><a class="btn" href="#/clients/nouveau?ent=${esc(id)}">+ Nouveau contact</a>`, `
      <section class="box hc-head en-head"><div class="hc-who"><span class="qs-av hc-av en-avg">${esc(initiales(e.nom))}</span><div><div class="hc-nm">${esc(e.nom)}</div><div class="hc-co">${esc([e.secteur, e.siret ? 'SIRET ' + e.siret : '', [e.cp, e.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</div>
        <div class="hc-ct">${tel ? `<a class="qs-pill" href="tel:${esc(tel)}">📞 ${esc(e.tel)}</a>` : ''}${e.email ? `<a class="qs-pill" href="mailto:${esc(e.email)}">✉ ${esc(e.email)}</a>` : ''}${site ? `<a class="qs-pill" href="${esc(site)}" target="_blank" rel="noopener">🌐 ${esc(e.site)}</a>` : ''}</div>
        ${e.notes ? `<div class="hc-rq">🔒 ${esc(e.notes)}</div>` : ''}</div></div>
        <div class="kpis qk hc-k"><div><b>${h.contacts.length}</b><span>contact${h.contacts.length > 1 ? 's' : ''}</span></div><div><b>${r.nbDevis}</b><span>devis</span></div><div><b>${r.nbSignes}</b><span>devis signé${r.nbSignes > 1 ? 's' : ''}</span></div><div><b>${euros(r.signeCents)}</b><span>signé (TTC)</span></div></div></section>
      <div class="hc-cols">
        <div>
          <section class="box"><div class="hc-th"><h2>Contacts de l’entreprise <small class="muted">(${h.contacts.length})</small></h2><a class="lnk" href="#/clients/nouveau?ent=${esc(id)}">+ Nouveau contact</a></div>
            ${h.contacts.length ? `<ul class="en-cts">${h.contacts.map(c => `<li class="cf-r en-ct"><span class="qs-av">${esc(initiales(c.nom))}</span><a class="cf-t" href="#/clients/${esc(c.id)}"><b>${esc(c.nom || '—')}</b><small>${esc([c.fonction, c.tel, c.email].filter(Boolean).join(' · '))}</small></a><span class="cf-m"><small>${c.derniereActivite ? 'activité le ' + dateFr(c.derniereActivite) : ''}</small></span><span class="en-acts"><a class="qs-back" href="#/clients/${esc(c.id)}">🕘 Fiche</a><button type="button" class="qs-back" data-detach="${esc(c.id)}" title="Retirer ce contact de l’entreprise (sa fiche est gardée)">✕ Détacher</button></span></li>`).join('')}</ul>` : '<p class="muted">Aucun contact relié pour l’instant.</p>'}
            <div class="en-lier"><label>Relier un contact existant<input type="search" data-enlq placeholder="🔍 Nom, téléphone, e-mail du contact…" autocomplete="off"></label><div class="cf-res" data-enlr hidden></div></div></section>
          <section class="box"><h2>Devis de l’entreprise</h2>${h.devis.length ? `<ul class="list">${h.devis.map(x => `<li><a href="#/devis/${esc(x.id)}"><b>${esc(x.numero)}</b> · ${euros(x.ttcCents)}<small class="muted"> ${esc([x.clientNom, x.evenement?.type, x.evenement?.date ? dateFr(x.evenement.date) : ''].filter(Boolean).join(' · '))}</small></a><span class="pill d-${x.statut}">${DSTAT[x.statut] || ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun devis pour les contacts de cette entreprise.</p>'}</section>
        </div>
        <section class="box hc-form"><h2>Informations</h2><form id="enf">${formEntreprise(e)}<div class="row"><button class="btn">Enregistrer</button><button type="button" class="btn ghost danger" data-endel>🗑 Supprimer l’entreprise</button></div></form><p class="muted sm">Changer le nom met à jour la case « Société » de tous ses contacts. Supprimer l’entreprise garde ses contacts (ils sont seulement détachés).</p></section>
      </div>`);
  }
  ficheEntreprise.after = id => {
    $('#enf').addEventListener('submit', async ev => {
      ev.preventDefault(); const f = Object.fromEntries(new FormData(ev.target));
      try {
        if (id === 'nouvelle') { const r = await api(A + '/entreprises', { method: 'POST', body: f }); location.hash = '#/clients/entreprises/' + r.id; }
        else { await api(A + '/entreprises/' + id, { method: 'PUT', body: f }); toast('Fiche entreprise enregistrée.'); render(); }
      } catch (err) { toast(err.message, true); }
    });
    if (id === 'nouvelle') return setTimeout(() => $('#enf input[name=nom]')?.focus(), 50);
    $('[data-endel]')?.addEventListener('click', async () => {
      if (!confirm(`Supprimer l’entreprise « ${cache.ent.entreprise.nom} » ?\n\nSes ${cache.ent.contacts.length} contact(s) sont gardés : ils sont seulement détachés.`)) return;
      try { await api(A + '/entreprises/' + id, { method: 'DELETE' }); toast('Entreprise supprimée.'); location.hash = '#/clients/entreprises'; } catch (err) { toast(err.message, true); }
    });
    const lier = async (clientId, retirer) => { try { await api(`${A}/entreprises/${id}/contacts`, { method: 'POST', body: { clientId, retirer } }); toast(retirer ? 'Contact détaché.' : 'Contact relié à l’entreprise.'); render(); } catch (err) { toast(err.message, true); } };
    $$('[data-detach]').forEach(b => b.addEventListener('click', () => { if (confirm('Retirer ce contact de l’entreprise ? Sa fiche est gardée.')) lier(b.dataset.detach, true); }));
    const q = $('[data-enlq]'), res = $('[data-enlr]');
    q.addEventListener('input', () => {
      clearTimeout(q._t); const v = q.value.trim();
      if (v.length < 2) { res.hidden = true; return; }
      q._t = setTimeout(async () => {
        try { const r = await api(`${A}/clients?par=8&page=1&q=${encodeURIComponent(v)}`); res.hidden = false;
          res.innerHTML = r.items.length ? r.items.map((c, i) => `<a class="cf-r${i ? '' : ' on'}" href="#" data-enl="${esc(c.id)}"><span class="qs-av">${esc(initiales(c.nom))}</span><span class="cf-t"><b>${esc(c.nom || '—')}</b><small>${esc([c.societe, c.tel, c.email].filter(Boolean).join(' · '))}</small></span><span class="cf-go">${c.entrepriseId === id ? 'Déjà relié' : 'Relier ›'}</span></a>`).join('') : `<p class="cf-none">Aucun contact ne correspond. <a href="#/clients/nouveau?ent=${esc(id)}">+ Créer le contact</a></p>`;
        } catch (err) { toast(err.message, true); }
      }, 250);
    });
    res.addEventListener('click', e => { const a = e.target.closest('[data-enl]'); if (!a) return; e.preventDefault(); const c = a.dataset.enl; const cur = a.querySelector('.cf-go').textContent; if (cur !== 'Déjà relié') lier(c, false); });
  };

  /* ---------- importer l'historique commercial de l'ancien CRM (Teamleader : affaires depuis 2017) ----------
     Jean-Luc dépose l'export des opportunités tel quel : chaque affaire est rattachée à la fiche du client (même e-mail ou portable),
     les clients inconnus sont créés, la source va dans « Origine du contact » si elle est vide. Réimporter ne crée pas de doublon. */
  const HIM = {};
  async function importerHistorique() {
    const hist = await api(A + '/actions/historique/imports').catch(() => []);
    const n = v => (v || 0).toLocaleString('fr-FR');
    return page('Importer l’historique commercial', '<a class="btn ghost" href="#/clients">← Contacts</a><a class="btn ghost" href="#/statistiques">📊 Statistiques</a>', `
      <p class="muted intro">Déposez l’export des <b>affaires (opportunités)</b> ou des <b>factures</b> de votre ancien CRM, tel quel : le type de fichier est reconnu tout seul. Chaque affaire est rangée sur la fiche du client (retrouvé par son e-mail, sinon son portable) : <b>a commandé ou non</b>, combien de fois, pour quel montant, quand, quel événement, quel lieu, quel commercial, et le <b>motif du refus</b> pour une affaire perdue. Les clients inconnus sont créés. La source va dans « 🧭 Origine du contact » seulement si la fiche n’en a pas. Rien d’autre n’est écrasé, réimporter un export plus complet ne crée aucun doublon, et un import peut toujours être annulé.</p>
      <section class="box imp-step"><h2><span class="imp-n">1</span> Choisissez le fichier</h2>
        <label class="imp-drop" id="himDrop"><input type="file" id="himFile" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden><b>📄 Cliquez ici ou glissez l’export des affaires ou des factures</b><small>Excel (.xlsx) ou CSV · colonnes reconnues d’office : Client, Client: E-mail, Client: Mobile, Évènement, Date, Nombre PAX, Lieu, Date acceptée, Date refusé, Motif du refus, Montant HT, Facturé, Marge, Source, Responsabilité…</small></label>
        <p class="imp-err" id="himErr" hidden></p></section>
      <div id="himSuite"></div>
      <section class="box"><h2>Historiques déjà importés</h2>${hist.length ? `<div class="table"><table><thead><tr><th>Date</th><th>Fichier</th><th class="n">Affaires</th><th class="n">Ajoutées</th><th class="n">Contacts créés</th><th>État</th><th></th></tr></thead><tbody>${hist.map(h => `<tr><td>${dateH(h.at)}<small>${esc(h.par || '')}</small></td><td>${esc(h.fichier)}</td><td class="n">${n(h.total)}</td><td class="n">${n(h.compteurs?.affairesCrees)}</td><td class="n">${n(h.compteurs?.clientsCrees)}</td><td>${h.statut === 'annulé' ? `<span class="pill d-refuse">Annulé</span><small>${dateH(h.annuleLe)}</small>` : h.statut === 'terminé' ? '<span class="pill d-accepte">Terminé</span>' : `<span class="pill d-envoye">${esc(h.statut || '')}</span>`}</td><td>${h.statut === 'terminé' ? `<button type="button" class="btn ghost sm" data-himannul="${esc(h.id)}">↶ Annuler cet import</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun pour le moment.</p>'}</section>`);
  }
  function etapeHisto(r) {
    const n = x => (x || 0).toLocaleString('fr-FR');
    if (r.genre === 'factures') {
      const ans = Object.entries(r.ans || {}).sort(), max = Math.max(1, ...ans.map(([, v]) => v));
      return `<section class="box imp-step"><h2><span class="imp-n">2</span> Ce que contient « ${esc(r.fichier)} » : des factures</h2>
      <div class="kpis qk imp-k"><div><b>${n(r.factures)}</b><span>factures</span></div><div><b>${eurosRond(r.netHtCents)}</b><span>facturés HT (avoirs déduits)</span></div>${HISTO_RESTE_DU ? `<div><b>${n(r.impayees)}</b><span>pas soldées</span></div><div><b>${eurosRond(r.duCents)}</b><span>reste dû TTC</span></div>` : ''}</div>
      <div class="him-ans" role="img" aria-label="Factures par année">${ans.map(([a, v]) => `<span title="${a} : ${n(v)} factures"><small>${n(v)}</small><i style="height:${Math.max(4, v / max * 100)}%"></i><em>${a}</em></span>`).join('')}</div>
      <div class="kpis qk imp-k"><div><b>${n(r.clients)}</b><span>clients différents</span></div><div><b>${n(r.retrouves)}</b><span>déjà dans vos contacts</span></div><div><b>${n(r.nouveaux)}</b><span>nouveaux contacts créés</span></div><div><b>${n(r.dejaImportees)}</b><span>factures déjà importées (mises à jour)</span></div></div>
      ${r.entites?.length ? `<p class="sm"><b>Sociétés :</b> ${r.entites.map(([e, v]) => `${esc(e)} (${eurosRond(v)} HT)`).join(' · ')}</p>` : ''}
      <p class="okbox sm him-info">ℹ️ Le chiffre <b>facturé</b> reste séparé du chiffre <b>signé</b> des affaires : ils ne s’additionnent pas.</p>
      <div class="row"><button type="button" class="btn" data-himgo>🧾 Importer les ${n(r.factures)} factures</button><span class="muted sm">Quelques secondes à une minute.</span></div><div id="himProg"></div></section>`;
    }
    const ans = Object.entries(r.ans || {}).sort();
    const max = Math.max(1, ...ans.map(([, v]) => v));
    return `<section class="box imp-step"><h2><span class="imp-n">2</span> Ce que contient « ${esc(r.fichier)} »</h2>
      <div class="kpis qk imp-k"><div><b>${n(r.affaires)}</b><span>affaires</span></div><div><b>${n(r.gagnees)}</b><span>signées (commandes)</span></div><div><b>${n(r.perdues)}</b><span>perdues${r.motifs ? ` · ${n(r.motifs)} avec motif` : ''}</span></div><div><b>${eurosRond(r.caHtCents)}</b><span>signé HT</span></div></div>
      <div class="him-ans" role="img" aria-label="Affaires par année">${ans.map(([a, v]) => `<span title="${a} : ${n(v)} affaires"><small>${n(v)}</small><i style="height:${Math.max(4, v / max * 100)}%"></i><em>${a}</em></span>`).join('')}</div>
      <div class="kpis qk imp-k"><div><b>${n(r.clients)}</b><span>clients différents</span></div><div><b>${n(r.retrouves)}</b><span>déjà dans vos contacts (même e-mail ou portable)</span></div><div><b>${n(r.nouveaux)}</b><span>nouveaux contacts créés</span></div><div><b>${n(r.dejaImportees)}</b><span>affaires déjà importées (mises à jour)</span></div></div>
      ${r.sources?.length ? `<p class="sm"><b>Sources :</b> ${r.sources.map(([s2, v]) => `${esc(s2)} (${n(v)})`).join(' · ')}</p>` : ''}
      ${!r.perdues && HISTO_TAUX ? '<p class="okbox sm him-info">ℹ️ Ce fichier ne contient que des affaires <b>signées</b> : pas encore de taux de signature ni de motifs de refus. Pour les avoir, faites un 2e export Teamleader des affaires <b>perdues</b> (avec la colonne « Motif du refus ») et déposez-le ici : il s’ajoutera sans doublon.</p>' : ''}
      ${r.doublons ? `<p class="muted sm">${n(r.doublons)} ligne(s) en double dans le fichier, comptées une seule fois.</p>` : ''}
      <div class="row"><button type="button" class="btn" data-himgo>📜 Importer les ${n(r.affaires)} affaires</button><span class="muted sm">Quelques secondes à une minute.</span></div><div id="himProg"></div></section>`;
  }
  importerHistorique.after = () => {
    const err = m => { const e = $('#himErr'); e.textContent = m || ''; e.hidden = !m; };
    const envoyer = async file => {
      err(''); if (!file) return;
      $('#himSuite').innerHTML = `<section class="box"><p>Lecture de « ${esc(file.name)} »…</p></section>`;
      const fd = new FormData(); fd.append('fichier', file);
      try { HIM.r = await api(A + '/actions/historique/fichier', { method: 'POST', form: fd }); $('#himSuite').innerHTML = etapeHisto(HIM.r); brancher(); $('#himSuite').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      catch (e) { $('#himSuite').innerHTML = ''; err(e.message); }
    };
    const drop = $('#himDrop');
    $('#himFile').addEventListener('change', e => envoyer(e.target.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('on'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); envoyer(e.dataTransfer.files[0]); });
    function brancher() {
      const go = $('[data-himgo]');
      go.addEventListener('click', async () => {
        go.disabled = true; go.textContent = 'Import en cours… gardez cette page ouverte';
        try {
          const r = await api(A + '/actions/historique/importer', { method: 'POST', body: { tok: HIM.r.tok } });
          const n = x => (x || 0).toLocaleString('fr-FR');
          $('#himProg').innerHTML = `<div class="okbox imp-rap"><b>✓ Historique importé.</b><ul><li><b>${n(r.affairesCrees)}</b> ${HIM.r.genre === 'factures' ? 'factures' : 'affaires'} ajoutées${r.affairesMaj ? `, <b>${n(r.affairesMaj)}</b> mises à jour` : ''}</li><li><b>${n(r.clientsCrees)}</b> nouveaux contacts créés</li><li><b>${n(r.clientsCompletes)}</b> fiches existantes complétées (cases vides seulement)</li><li><b>${n(r.sourcesPosees)}</b> origines du contact renseignées</li></ul><p class="row"><a class="btn" href="#/statistiques">📊 Voir les statistiques</a><a class="btn ghost" href="#/clients" data-himvoir>👤 Voir les clients qui ont commandé</a></p></div>`;
          go.hidden = true;
          $('[data-himvoir]')?.addEventListener('click', () => { CL.k = { hcmd: 'oui' }; CL.tri = 'montant'; CL.sens = 'desc'; CL.page = 1; CL.q = ''; CL.vue = ''; mem.set('mg_clmulti', '1'); });
          toast('Historique importé.');
        } catch (x) { toast(x.message, true); go.disabled = false; go.textContent = 'Réessayer l’import'; }
      });
    }
    $$('[data-himannul]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Annuler cet import ?\n\nLes affaires de cet import seront retirées des fiches, les contacts créés par lui seront retirés (sauf ceux qui ont depuis une demande, un devis ou une note), et les cases complétées seront remises comme avant.')) return;
      b.disabled = true; b.textContent = 'Annulation…';
      try { const r = await api(`${A}/actions/historique/${encodeURIComponent(b.dataset.himannul)}/annuler`, { method: 'POST' }); toast(`Import annulé : ${r.affaires.toLocaleString('fr-FR')} affaire(s) et ${r.retires.toLocaleString('fr-FR')} contact(s) retirés.`); render(); }
      catch (x) { toast(x.message, true); b.disabled = false; b.textContent = '↶ Annuler cet import'; }
    }));
  };

  /* ---------- importer le fichier clients de l'ancien CRM ---------- */
  const IMP = {};
  async function importerClients() {
    const hist = await api(A + '/actions/import-clients/historique').catch(() => []);
    const n = v => (v || 0).toLocaleString('fr-FR');
    return page('Importer des clients', '<a class="btn ghost" href="#/clients">← Clients</a>', `
      <p class="muted intro">Reprenez le fichier clients de votre ancien logiciel (Excel ou CSV), même très gros (60 000 contacts et plus). Rien n’est écrasé : si un client existe déjà (même e-mail ou même téléphone), seules ses cases vides sont complétées. Et un import peut toujours être annulé.</p>
      <section class="box imp-step"><h2><span class="imp-n">1</span> Choisissez le fichier</h2>
        <label class="imp-drop" id="impDrop"><input type="file" id="impFile" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden><b>📄 Cliquez ici ou glissez le fichier</b><small>Excel (.xlsx) ou CSV · la première ligne doit contenir les titres des colonnes</small></label>
        <p class="muted sm">Pas encore de fichier ? <a class="lnk" href="${A}/actions/import-clients/modele.xlsx">⬇ Télécharger le fichier modèle Excel</a> (avec deux exemples et le mode d’emploi). Conseil : faites d’abord un essai avec une vingtaine de lignes, puis annulez-le si besoin.</p>
        <p class="imp-err" id="impErr" hidden></p></section>
      <div id="impSuite"></div>
      <section class="box"><h2>Imports déjà faits</h2>${hist.length ? `<div class="table"><table><thead><tr><th>Date</th><th>Fichier</th><th class="n">Lignes</th><th class="n">Créés</th><th class="n">Complétés</th><th>État</th><th></th></tr></thead><tbody>${hist.map(h => `<tr><td>${dateH(h.at)}<small>${esc(h.par || '')}</small></td><td>${esc(h.fichier)}</td><td class="n">${n(h.total)}</td><td class="n">${n(h.compteurs?.nouveaux)}</td><td class="n">${n(h.compteurs?.completes)}</td><td>${h.statut === 'annulé' ? `<span class="pill d-refuse">Annulé</span><small>le ${dateH(h.annuleLe)}</small>` : h.statut === 'terminé' ? '<span class="pill d-accepte">Terminé</span>' : '<span class="pill d-envoye">Interrompu</span>'}</td><td>${h.statut !== 'annulé' && session.role === 'manager' ? `<button type="button" class="btn ghost sm" data-annul="${esc(h.id)}">↶ Annuler cet import</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun import pour le moment.</p>'}</section>`);
  }
  function etapeColonnes() {
    const r = IMP.r;
    const opts = v => r.champs.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
    return `<section class="box imp-step"><h2><span class="imp-n">2</span> Associez chaque colonne à une case</h2>
      <p class="muted sm">« ${esc(r.fichier)} » · <b>${r.total.toLocaleString('fr-FR')}</b> ligne${r.total > 1 ? 's' : ''}. Nous avons deviné chaque case d’après le titre de la colonne : vérifiez et corrigez si besoin. Les colonnes « Autre information » vont dans les notes de la fiche.</p>
      <div class="table imp-cols"><table><thead><tr><th>Colonne du fichier</th><th>Exemples</th><th>Case de la fiche client</th></tr></thead><tbody>
      ${r.entetes.map((h, i) => `<tr><td><b>${esc(h)}</b></td><td class="imp-ex">${r.apercu.map(l => l[i]).filter(Boolean).slice(0, 3).map(v => `<span>${esc(String(v).slice(0, 60))}</span>`).join('') || '<span class="muted">(vide)</span>'}</td><td><select data-col="${i}">${opts(IMP.colonnes[i])}</select></td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button type="button" class="btn" data-verif>Vérifier le fichier</button><span class="muted sm">Rien n’est encore importé.</span></div></section>
      <div id="impVerif"></div>`;
  }
  function etapeVerif(v) {
    const n = x => (x || 0).toLocaleString('fr-FR');
    const ex = v.exemples[0];
    return `<section class="box imp-step"><h2><span class="imp-n">3</span> Ce qui va se passer</h2>
      <div class="kpis qk imp-k"><div><b>${n(v.nouveaux)}</b><span>nouveaux clients créés</span></div><div><b>${n(v.completes)}</b><span>clients déjà connus, complétés</span></div><div><b>${n(v.identiques)}</b><span>déjà connus, rien de nouveau</span></div><div><b>${n(v.doublonsFichier)}</b><span>doublons dans le fichier (regroupés)</span></div><div><b>${n(v.sansCoordonnees)}</b><span>lignes vides ignorées</span></div>${v.essais ? `<div><b>${n(v.essais)}</b><span>lignes d’essai « [TEST…] » ignorées</span></div>` : ''}</div>
      ${v.telIllisibles || v.emailsIllisibles || v.sansContact ? `<p class="muted sm">${[v.telIllisibles ? `${n(v.telIllisibles)} téléphone(s) illisible(s)` : '', v.emailsIllisibles ? `${n(v.emailsIllisibles)} e-mail(s) illisible(s)` : '', v.sansContact ? `${n(v.sansContact)} fiche(s) avec un nom mais ni e-mail ni téléphone` : ''].filter(Boolean).join(' · ')} : ils sont gardés tels quels dans les notes de la fiche.</p>` : ''}
      ${ex ? `<div class="imp-ex1"><p class="muted sm">Exemple : la ligne ${ex.ligne} du fichier donnera cette fiche</p><dl>${[['Nom', ex.nom], ['Société', ex.societe], ['E-mail', ex.email], ['Téléphone', ex.tel + (ex.telE164 ? ' (SMS : ' + ex.telE164 + ')' : '')], ['Autre téléphone', ex.telAutre], ['Adresse', [ex.adresse, ex.cp, ex.ville].filter(Boolean).join(' ')], ['Département', ex.departement], ['Déjà commandé', ex.caCrmCents != null ? euros(ex.caCrmCents) : ''], ['Dernière commande', ex.derniereCommande ? dateFr(ex.derniereCommande) : ''], ['Notes', ex.notes]].filter(x => x[1] && x[1] !== 'undefined').map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('')}</dl></div>` : ''}
      <label class="chk imp-ok"><input type="checkbox" id="impOk"> Je confirme que ces personnes sont nos clients ou nous ont contactés d’elles-mêmes (aucun fichier de prospection acheté). Elles pourront recevoir nos e-mails et SMS ; chaque message garde le lien de désinscription et « STOP ».</label>
      <div class="row"><button type="button" class="btn" data-go disabled>⬆ Importer ${n(v.nouveaux + v.completes)} client${v.nouveaux + v.completes > 1 ? 's' : ''}</button><button type="button" class="btn ghost" data-recol>Modifier les colonnes</button></div>
      <div id="impProg"></div></section>`;
  }
  importerClients.after = () => {
    const err = m => { const e = $('#impErr'); e.textContent = m || ''; e.hidden = !m; };
    const envoyer = async file => {
      err(''); if (!file) return;
      $('#impSuite').innerHTML = `<section class="box"><p>Lecture de « ${esc(file.name)} »…</p></section>`;
      const fd = new FormData(); fd.append('fichier', file);
      try {
        IMP.r = await api(A + '/actions/import-clients/fichier', { method: 'POST', form: fd });
        IMP.colonnes = [...IMP.r.proposition];
        $('#impSuite').innerHTML = etapeColonnes(); brancherColonnes();
      } catch (e) { $('#impSuite').innerHTML = ''; err(e.message); }
    };
    const drop = $('#impDrop');
    $('#impFile').addEventListener('change', e => envoyer(e.target.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('on'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); envoyer(e.dataTransfer.files[0]); });
    function brancherColonnes() {
      $$('[data-col]').forEach(sel => sel.addEventListener('change', () => { IMP.colonnes[+sel.dataset.col] = sel.value; $('#impVerif').innerHTML = ''; }));
      $('[data-verif]').addEventListener('click', async e => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Vérification…';
        try {
          const v = await api(A + '/actions/import-clients/verifier', { method: 'POST', body: { tok: IMP.r.tok, colonnes: IMP.colonnes } });
          $('#impVerif').innerHTML = etapeVerif(v); brancherVerif(v); $('#impVerif').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (x) { toast(x.message, true); }
        b.disabled = false; b.textContent = 'Vérifier le fichier';
      });
    }
    function brancherVerif() {
      const go = $('[data-go]');
      $('#impOk').addEventListener('change', e => { go.disabled = !e.target.checked; });
      $('[data-recol]').addEventListener('click', () => { $('#impVerif').innerHTML = ''; $('[data-verif]').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      go.addEventListener('click', async () => {
        go.disabled = true; $('[data-recol]').disabled = true; $('#impOk').disabled = true;
        const prog = $('#impProg'), total = IMP.r.total;
        prog.innerHTML = `<div class="imp-bar"><i style="width:0"></i></div><p class="sm" id="impTxt">Import en cours… gardez cette page ouverte.</p>`;
        let debut = 0, r = null, essais = 0;
        while (true) {
          try { r = await api(A + '/actions/import-clients/lot', { method: 'POST', body: { tok: IMP.r.tok, colonnes: IMP.colonnes, debut, consentement: true } }); essais = 0; }
          catch (x) { if (++essais <= 3 && !/mémoire|Cochez/.test(x.message)) { await new Promise(ok => setTimeout(ok, 1500 * essais)); continue; } prog.insertAdjacentHTML('beforeend', `<p class="imp-err">${esc(x.message)} L’import s’est arrêté à la ligne ${debut.toLocaleString('fr-FR')} ; ce qui a déjà été importé peut être annulé plus bas.</p>`); return; }
          debut = r.fait;
          $('.imp-bar i', prog).style.width = Math.round(debut / total * 100) + '%';
          $('#impTxt').textContent = `${debut.toLocaleString('fr-FR')} lignes sur ${total.toLocaleString('fr-FR')} (${Math.round(debut / total * 100)} %)…`;
          if (r.fini) break;
        }
        const n = x => (x || 0).toLocaleString('fr-FR');
        prog.innerHTML = `<div class="okbox imp-rap"><b>✓ Import terminé.</b><ul><li><b>${n(r.nouveaux)}</b> nouveaux clients créés</li><li><b>${n(r.completes)}</b> clients déjà connus, complétés</li><li><b>${n(r.identiques)}</b> déjà connus, rien de nouveau</li><li><b>${n(r.doublonsFichier)}</b> doublons du fichier regroupés</li><li><b>${n(r.sansCoordonnees)}</b> lignes vides ignorées</li>${r.essais ? `<li><b>${n(r.essais)}</b> lignes d’essai ignorées</li>` : ''}</ul><div class="row"><a class="btn sm" href="#/clients">Voir les clients</a><button type="button" class="btn ghost sm" data-annul="${esc(r.impId)}">↶ Annuler cet import</button></div></div>`;
        brancherAnnul(prog);
        toast('Import terminé.');
      });
    }
    function brancherAnnul(root = document) {
      $$('[data-annul]', root).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Annuler cet import ?\n\nLes clients créés par cet import seront retirés (sauf ceux qui ont depuis une demande, un devis ou une note), et les cases complétées sur les clients existants seront remises comme avant.')) return;
        b.disabled = true; b.textContent = 'Annulation…';
        try { const r = await api(`${A}/actions/import-clients/${encodeURIComponent(b.dataset.annul)}/annuler`, { method: 'POST' }); toast(`Import annulé : ${r.retires.toLocaleString('fr-FR')} retiré(s), ${r.remis.toLocaleString('fr-FR')} remis comme avant${r.gardes ? `, ${r.gardes} gardé(s) car ils ont une demande ou un devis` : ''}.`); render(); }
        catch (x) { toast(x.message, true); b.disabled = false; b.textContent = '↶ Annuler cet import'; }
      }));
    }
    brancherAnnul();
  };
  /* ---------- Clients › « Envoyer un e-mail » / « Envoyer un SMS » : sélection multicritère, rédaction par l'IA, aperçu, essai, envoi ---------- */
  const ongletsClients = cur => `<nav class="df-tabs" aria-label="Contacts">${[['', '👥 Liste des contacts'], ['email', '✉️ Envoyer un e-mail'], ['sms', '💬 Envoyer un SMS'], ['appels', '📞 Programmer un appel']].filter(([k]) => peut('diffusion') || !['email', 'sms'].includes(k)).map(([k, l]) => `<a href="#/clients${k ? '/' + k : ''}" class="df-tab${cur === k ? ' on' : ''}"${cur === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const DFK = canal => 'mg_dif_' + canal;
  const MONTANTS = [[0, 'Peu importe'], [10000, 'Plus de 100 €'], [30000, 'Plus de 300 €'], [50000, 'Plus de 500 €'], [100000, 'Plus de 1 000 €'], [200000, 'Plus de 2 000 €'], [500000, 'Plus de 5 000 €'], ['autre', 'Autre montant…']];
  const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
  function etatDif(canal) {
    let s = null; try { s = JSON.parse(mem.get(DFK(canal)) || 'null'); } catch { /* */ }
    return { criteres: { statut: '', montantMin: 0, deps: [], types: [], pro: '', accord: false, metiers: [], dj: [], contactDe: [], civ: '', ...(s?.criteres || {}) }, mode: s?.mode === 'manuel' ? 'manuel' : s?.mode === 'recherche' && s?.recherche ? 'recherche' : 'criteres', recherche: s?.recherche || null, exclus: [], inclus: [], q: '', page: 0, seulementCoches: false,
      infos: s?.infos || '', nbSms: s?.nbSms || 1, ton: s?.ton || '', message: s?.message || (canal === 'sms' ? { texte: '' } : { objet: '', titre: '', corps: '', photo: '', bouton: { texte: '', lien: '' } }), essai: s?.essai || '' };
  }
  const garderDif = (canal, st) => mem.set(DFK(canal), JSON.stringify({ criteres: st.criteres, mode: st.mode, recherche: st.recherche, infos: st.infos, nbSms: st.nbSms, ton: st.ton, message: st.message, essai: st.essai }));
  async function diffusion(canal) {
    const [conf, credits] = await Promise.all([api(A + '/diffusion/criteres'), api(A + '/diffusion/credits').catch(() => null)]); cache.dif = { canal, conf, credits, st: etatDif(canal) };
    const st = cache.dif.st, sms = canal === 'sms', k = st.criteres;
    if (!st.essai) st.essai = sms ? conf.moi.tel : conf.moi.email;
    const autre = k.montantMin && !MONTANTS.some(([v]) => v === k.montantMin);
    const deps = [...conf.deps].sort((a, b) => (IDF.includes(b[0]) - IDF.includes(a[0])) || a[0].localeCompare(b[0], 'fr', { numeric: true }));
    const chip = (attr, v, l, on) => `<button type="button" class="qs-own-b df-chip${on ? ' on' : ''}" data-${attr}="${esc(v)}" aria-pressed="${on}">${l}</button>`;
    const joignables = sms ? conf.sms : conf.email;
    return page('Contacts', '<a class="btn ghost" href="#/clients/nouveau">+ Nouveau contact</a>', `${ongletsClients(canal)}
      <p class="df-intro">${sms ? 'Un SMS d’information (nouveautés, offres, fêtes…) envoyé aux clients choisis. Le SMS part au nom de <b>Magnolia</b> avec la mention obligatoire « STOP au 36173 » pour se désabonner.' : 'Un e-mail d’information aux couleurs de Magnolia, envoyé aux clients choisis depuis infos@magnoliatraiteur.fr. Un lien « Se désinscrire » est ajouté en bas, comme la loi l’exige.'} ${joignables} client${joignables > 1 ? 's' : ''} sur ${conf.total} ${sms ? 'ont un numéro de portable' : 'ont une adresse e-mail'}${(sms ? conf.stopSms : conf.stopEmail) ? ` (${sms ? conf.stopSms : conf.stopEmail} désinscrit${(sms ? conf.stopSms : conf.stopEmail) > 1 ? 's' : ''} jamais contacté${(sms ? conf.stopSms : conf.stopEmail) > 1 ? 's' : ''})` : ''}.</p>
      ${conf.brevo ? '' : '<p class="aq-warn">Brevo n’est pas branché sur ce site : rien ne partira vraiment (mode essai). La clé BREVO_API_KEY doit être dans les variables Railway.</p>'}
      <div class="df-cols">
        <section class="box df-qui"><h2><span class="df-n">1</span> À qui ?</h2>
          <div class="df-mode" role="radiogroup">${st.recherche ? chip('mode', 'recherche', '🔎 Les contacts de ma recherche', st.mode === 'recherche') : ''}${chip('mode', 'criteres', 'Selon les critères', st.mode === 'criteres')}${chip('mode', 'manuel', 'Choisir un par un', st.mode === 'manuel')}</div>
          ${st.recherche ? `<div class="df-rech"${st.mode === 'recherche' ? '' : ' hidden'}><p><b>🔎 Les contacts trouvés par votre recherche dans Contacts</b></p><div class="pf-ps">${(st.recherche.resume || []).length ? st.recherche.resume.map(x => `<span class="pf-p">${esc(x)}</span>`).join('') : '<span class="pf-p">Tous les contacts</span>'}</div><p class="muted sm" data-nonj></p><a href="#/clients" class="lnk" data-modrech>← Modifier la recherche</a></div>` : ''}
          <div class="df-crit"${st.mode !== 'criteres' ? ' hidden' : ''}>
            <div class="g2"><label>Clients<select data-k="statut"><option value="">Tous les clients</option><option value="commandes"${k.statut === 'commandes' ? ' selected' : ''}>Ceux qui ont déjà commandé</option><option value="prospects"${k.statut === 'prospects' ? ' selected' : ''}>Ceux qui n’ont pas encore commandé</option></select></label>
            <label>Montant total des commandes<select data-k="montant">${MONTANTS.map(([v, l]) => `<option value="${v}"${(autre ? v === 'autre' : v === (k.montantMin || 0)) ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
            <label class="df-autre"${autre ? '' : ' hidden'}>Plus de (€ TTC)<input type="number" min="0" step="50" inputmode="numeric" data-k="montantLibre" value="${autre ? Math.round(k.montantMin / 100) : ''}" placeholder="ex. 750"></label>
            <div class="g2"><label>Particuliers ou entreprises<select data-k="pro"><option value="">Les deux</option><option value="part"${k.pro === 'part' ? ' selected' : ''}>Particuliers</option><option value="pro"${k.pro === 'pro' ? ' selected' : ''}>Entreprises</option></select></label>
            <label class="check df-accord"><input type="checkbox" data-k="accord"${k.accord ? ' checked' : ''}> Seulement ceux qui ont coché « J’accepte les offres »</label></div>
            <div class="df-lab">Département <small>(aucun choisi = tous)</small></div>
            <div class="df-chips" data-deps>${deps.length ? deps.map(([d, n]) => chip('dep', d, `${esc(d)} <small>${n}</small>`, k.deps.includes(d))).join('') : '<span class="muted sm">Aucun département connu pour le moment.</span>'}</div>
            <div class="g2"><label>Civilité<select data-k="civ"><option value="">Madame et Monsieur</option><option value="Mme"${k.civ === 'Mme' ? ' selected' : ''}>Seulement Madame</option><option value="M."${k.civ === 'M.' ? ' selected' : ''}>Seulement Monsieur</option></select></label></div>
            ${(conf.metiers || []).length ? `<div class="df-lab">🎭 Métier (prestataires) <small>(aucun choisi = tous)</small></div><div class="df-chips" data-mets>${conf.metiers.map(([t, n]) => chip('met', t, `${esc(t)} <small>${n}</small>`, k.metiers.includes(t))).join('')}</div>` : ''}
            ${(conf.dj || []).length ? `<div class="df-lab">🎧 Style de DJ <small>(aucun choisi = tous)</small></div><div class="df-chips">${conf.dj.map(([t, n]) => chip('djs', t, `${esc(t)} <small>${n}</small>`, k.dj.includes(t))).join('')}</div>` : ''}
            ${(conf.contactDe || []).length ? `<div class="df-lab">🤝 Contact de <small>(aucun choisi = tous)</small></div><div class="df-chips">${conf.contactDe.slice(0, 40).map(([t, n]) => chip('cde', t, `${esc(t)} <small>${n}</small>`, k.contactDe.includes(t))).join('')}</div>` : ''}
            ${conf.types.length ? `<div class="df-lab">Type d’événement <small>(aucun choisi = tous)</small></div><div class="df-chips" data-types>${conf.types.slice(0, 24).map(([t, n]) => chip('type', t, `${esc(t)} <small>${n}</small>`, k.types.includes(t))).join('')}</div>` : ''}
          </div>
          <div class="df-compte" aria-live="polite"><b data-nb>…</b><span data-nbl>destinataires</span></div>
          <div class="df-lh"><input type="search" placeholder="Rechercher un client (nom, société…)" data-dq><label class="check sm"><input type="checkbox" data-coches> Voir seulement les cochés</label></div>
          <div class="df-acts row"><button type="button" class="btn ghost sm" data-tout="1">Tout cocher</button><button type="button" class="btn ghost sm" data-tout="0">Tout décocher</button></div>
          <ul class="df-list" data-dlist><li class="muted">Chargement…</li></ul>
          <div class="df-pages row" data-dpages></div>
        </section>
        <section class="box df-msg"><h2><span class="df-n">2</span> Le message</h2>
          <div class="df-ia"><p class="aq-eye">✨ Rédaction avec l’IA</p><p class="muted sm">Mettez les informations en vrac (offre, dates, prix, ce que vous voulez dire) : l’IA rédige ${sms ? 'le SMS' : 'l’e-mail complet, objet compris'}. Vous pouvez ensuite tout corriger.</p>
            <div class="aq-nrow"><textarea rows="4" data-infos placeholder="${sms ? 'ex. fête des mères dimanche 30 mai, -10 % sur tous les buffets commandés avant le 20 mai, livraison offerte au-delà de 2 500 €' : 'ex. nouveau buffet libanais, 15 mezzés, à partir de 24,90 € par personne, livraison 7 j/7 en Île-de-France, réservez pour les fêtes de fin d’année, offre -10 % jusqu’au 15 décembre avec le code NOEL10'}">${esc(st.infos)}</textarea><button type="button" class="aq-mic" data-dmic title="Dicter" aria-label="Dicter">🎤</button></div>
            <div class="row df-iarow">${sms ? `<label>Longueur<select data-nbsms>${[1, 2, 3].map(n => `<option value="${n}"${+st.nbSms === n ? ' selected' : ''}>${n} SMS (${n === 1 ? 160 : n * 153} caractères)</option>`).join('')}</select></label>` : `<label>Ton<select data-ton>${['', 'Chaleureux', 'Festif', 'Élégant', 'Professionnel (entreprises)', 'Offre promotionnelle'].map(t => `<option value="${esc(t)}"${st.ton === t ? ' selected' : ''}>${t || 'Au choix de l’IA'}</option>`).join('')}</select></label>`}
              <button type="button" class="btn aq-btn" data-redige${conf.ia ? '' : ' disabled'}>✨ Rédiger avec l’IA</button></div>
            <p class="df-iamsg" data-iamsg>${conf.ia ? '' : '<span class="err">L’IA n’est pas activée (clé ANTHROPIC_API_KEY absente de Railway).</span>'}</p></div>
          <div data-champs>${champsMessage(canal, st.message)}</div>
          <div class="row df-voir"><button type="button" class="btn voir-site" data-voir>👁 ${sms ? 'Voir le SMS sur un téléphone' : 'Voir le mail avant de l’envoyer'}</button></div>
        </section>
      </div>
      <section class="box df-env"><h2><span class="df-n">3</span> Envoyer</h2>
        <div class="df-essai"><label>${sms ? 'Faire un essai sur mon portable' : 'Faire un essai sur mon e-mail'}<input data-essai value="${esc(st.essai)}" ${sms ? 'type="tel" inputmode="tel" placeholder="06 12 34 56 78"' : 'type="email" placeholder="vous@exemple.fr"'}></label><button type="button" class="btn ghost" data-essaib>Envoyer l’essai</button></div>
        ${sms && !conf.creneauSms.ok ? `<p class="aq-warn">⏰ ${esc(conf.creneauSms.raison)}</p>` : ''}
        <div class="df-go"><button type="button" class="btn df-big" data-envoyer>Envoyer</button><p class="df-cout" data-cout hidden></p></div>
        <div data-suivi></div>
        <h3 class="df-h3">Derniers envois</h3><ul class="list df-hist" data-hist><li class="muted">Chargement…</li></ul>
      </section>`);
  }
  function champsMessage(canal, m) {
    if (canal === 'sms') return `<div class="df-smsz"><div><label>Texte du SMS<textarea rows="7" data-m="texte" placeholder="Magnolia Traiteur : Bonjour {prenom}, …">${esc(m.texte || '')}</textarea></label>
      <p class="df-cpt" data-cpt></p></div><div class="df-mini" aria-label="Le SMS tel qu’il arrivera"><p class="df-mini-h"><b>Magnolia</b>SMS · maintenant</p><div class="df-mini-b" data-mini></div></div></div><p class="muted sm">{prenom} est remplacé par le prénom de chaque client. L’adresse du site${cache.dif?.conf?.lienSms ? ' (' + esc(cache.dif.conf.lienSms) + ')' : ''} et la mention « STOP au 36173 » sont ajoutées automatiquement à la fin (elles comptent dans la longueur). Les accents ê, â, î, ô, û et ç sont remplacés (fete, garcon) pour rester au format SMS standard, 3 fois moins cher.</p>`;
    const b = m.bouton || {};
    return `<label>Objet de l’e-mail<input data-m="objet" value="${esc(m.objet || '')}" maxlength="150" placeholder="ex. Nouveau : notre buffet libanais 🌿"></label>
      <label>Grand titre <small>(en haut de l’e-mail, facultatif)</small><input data-m="titre" value="${esc(m.titre || '')}" maxlength="150"></label>
      <label>Texte<textarea rows="10" data-m="corps" placeholder="Bonjour {prenom},&#10;&#10;…">${esc(m.corps || '')}</textarea></label>
      <p class="muted sm">{prenom} = prénom du client. **mot** = en gras. Une ligne vide = nouveau paragraphe. Une ligne commençant par « - » = liste. La signature Magnolia et le lien « Se désinscrire » sont ajoutés tout seuls.</p>
      <div class="df-photo"><div class="df-ph" data-ph>${m.photo ? `<img src="${esc(m.photo)}" alt="">` : '<span>Pas de photo</span>'}</div><div class="row"><button type="button" class="btn ghost sm" data-photo>🖼 ${m.photo ? 'Changer la photo' : 'Ajouter une photo'}</button>${m.photo ? '<button type="button" class="lnk" data-sansphoto>Retirer</button>' : ''}</div></div>
      <div class="g2"><label>Bouton <small>(texte, facultatif)</small><input data-m="bouton.texte" value="${esc(b.texte || '')}" maxlength="40" placeholder="ex. Demander un devis"></label><label>Lien du bouton<input data-m="bouton.lien" value="${esc(b.lien || '')}" placeholder="ex. /saveurs-du-monde ou https://…"></label></div>`;
  }
  diffusion.after = canal => {
    const { conf, st } = cache.dif, sms = canal === 'sms', k = st.criteres;
    let nb = 0, seq = 0;
    const sel = () => ({ canal, criteres: k, mode: st.mode, exclus: st.exclus, inclus: st.inclus, recherche: st.recherche });
    const garder = () => garderDif(canal, st);
    const charger = async () => {
      const my = ++seq;
      const r = await api(A + '/diffusion/selection', { method: 'POST', body: { ...sel(), q: st.q, page: st.page, seulementCoches: st.seulementCoches } }).catch(e => { toast(e.message, true); return null; });
      if (!r || my !== seq) return;
      nb = r.nb;
      const nj = $('[data-nonj]'); if (nj) nj.textContent = st.mode === 'recherche' ? `${r.correspondent.toLocaleString('fr-FR')} contact${r.correspondent > 1 ? 's' : ''} joignable${r.correspondent > 1 ? 's' : ''} par ${sms ? 'SMS (portable)' : 'e-mail'}${r.nonJoignables ? ` · ${r.nonJoignables.toLocaleString('fr-FR')} autre${r.nonJoignables > 1 ? 's' : ''} sans ${sms ? 'portable' : 'e-mail'}, désinscrit${r.nonJoignables > 1 ? 's' : ''} ou « ne pas contacter » : ${r.nonJoignables > 1 ? 'ils ne recevront rien' : 'il ne recevra rien'}` : ''}.` : '';
      $('[data-nb]').textContent = r.nb.toLocaleString('fr-FR');
      $('[data-nbl]').textContent = (r.nb > 1 ? 'destinataires' : 'destinataire') + (st.mode !== 'manuel' && r.correspondent !== r.nb ? ` (${r.correspondent - r.nb} décoché${r.correspondent - r.nb > 1 ? 's' : ''} à la main)` : '');
      $('[data-dlist]').innerHTML = r.lignes.length ? r.lignes.map(p => `<li><label class="df-cl${p.coche ? ' on' : ''}"><input type="checkbox" data-cid="${esc(p.id)}"${p.coche ? ' checked' : ''}><span class="qs-av">${esc(initiales(p.nom))}</span><span class="df-t"><b>${esc(p.nom || '—')}</b><small>${esc([p.societe, p.contact].filter(Boolean).join(' · '))}</small></span><span class="df-m">${p.totalCents ? euros(p.totalCents) : '<span class="muted">pas de commande</span>'}<small>${esc(p.deps.join(', '))}${p.derniere ? (p.deps.length ? ' · ' : '') + dateFr(p.derniere) : ''}</small></span></label><button type="button" class="qs-back df-edit" data-dedit="${esc(p.id)}" title="Corriger la fiche de ce contact" aria-label="Modifier la fiche">✏<span class="df-edit-t"> Modifier</span></button></li>`).join('')
        : `<li class="muted df-vide">${st.q ? 'Aucun client trouvé.' : st.mode === 'manuel' && st.seulementCoches ? 'Aucun client coché.' : 'Aucun client ne correspond à ces critères.'}</li>`;
      $('[data-dpages]').innerHTML = r.pages > 1 ? `<button type="button" class="btn ghost sm" data-pg="-1"${st.page ? '' : ' disabled'}>‹ Précédents</button><span class="muted sm">Page ${st.page + 1} / ${r.pages} · ${r.vue.toLocaleString('fr-FR')} clients</span><button type="button" class="btn ghost sm" data-pg="1"${st.page + 1 < r.pages ? '' : ' disabled'}>Suivants ›</button>` : '';
      const go = $('[data-envoyer]');
      go.textContent = r.nb ? `${sms ? '💬' : '✉️'} Envoyer à tous (${r.nb.toLocaleString('fr-FR')} contact${r.nb > 1 ? 's' : ''})` : 'Choisissez des destinataires';
      go.disabled = !r.nb || (sms && !conf.creneauSms.ok);
      if (sms) majCpt(); else majCout();
    };
    const recharger = () => { st.page = 0; garder(); charger(); };
    /* critères */
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; st.exclus = []; $$('[data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); $('.df-crit').hidden = st.mode !== 'criteres'; const dr = $('.df-rech'); if (dr) dr.hidden = st.mode !== 'recherche'; recharger(); }));
    /* « Modifier la recherche » : la liste Contacts reprend les mêmes critères */
    $('[data-modrech]')?.addEventListener('click', () => { const R = st.recherche || {}; CL.q = R.q || ''; CL.filtre = R.filtre || ''; CL.vue = R.vue || ''; CL.k = { ...(R.k || {}) }; CL.page = 1; mem.set('mg_clmulti', '1'); });
    $('[data-k=statut]').addEventListener('change', e => { k.statut = e.target.value; recharger(); });
    $('[data-k=pro]').addEventListener('change', e => { k.pro = e.target.value; recharger(); });
    $('[data-k=accord]').addEventListener('change', e => { k.accord = e.target.checked; recharger(); });
    $('[data-k=montant]').addEventListener('change', e => { const v = e.target.value; $('.df-autre').hidden = v !== 'autre'; if (v === 'autre') { $('[data-k=montantLibre]').focus(); return; } k.montantMin = +v; recharger(); });
    $('[data-k=montantLibre]').addEventListener('input', e => { k.montantMin = Math.max(0, Math.round(+e.target.value || 0)) * 100; clearTimeout(e.target._t); e.target._t = setTimeout(recharger, 350); });
    const bascule = (attr, liste) => $$(`[data-${attr}]`).forEach(b => b.addEventListener('click', () => { const v = b.dataset[attr], i = liste.indexOf(v); if (i < 0) liste.push(v); else liste.splice(i, 1); b.classList.toggle('on', i < 0); b.setAttribute('aria-pressed', i < 0); recharger(); }));
    bascule('dep', k.deps); bascule('type', k.types); bascule('met', k.metiers); bascule('djs', k.dj); bascule('cde', k.contactDe);
    $('[data-k=civ]').addEventListener('change', e => { k.civ = e.target.value; recharger(); });
    $('[data-dq]').addEventListener('input', e => { st.q = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(() => { st.page = 0; charger(); }, 250); });
    $('[data-coches]').addEventListener('change', e => { st.seulementCoches = e.target.checked; st.page = 0; charger(); });
    $('[data-dlist]').addEventListener('click', e => { const b = e.target.closest('[data-dedit]'); if (b) { e.preventDefault(); ficheEnFenetre(b.dataset.dedit, () => charger()); } });
    $('[data-dlist]').addEventListener('change', e => {
      const id = e.target.dataset.cid; if (!id) return;
      const on = e.target.checked; e.target.closest('.df-cl').classList.toggle('on', on);
      const l = st.mode === 'manuel' ? st.inclus : st.exclus, garderDans = st.mode === 'manuel' ? on : !on, i = l.indexOf(id);
      if (garderDans && i < 0) l.push(id); if (!garderDans && i >= 0) l.splice(i, 1);
      charger();
    });
    $('[data-dpages]').addEventListener('click', e => { const b = e.target.closest('[data-pg]'); if (!b) return; st.page = Math.max(0, st.page + +b.dataset.pg); charger(); $('.df-lh').scrollIntoView({ block: 'nearest' }); });
    $$('[data-tout]').forEach(b => b.addEventListener('click', async () => {
      const tout = b.dataset.tout === '1';
      if (st.mode !== 'manuel') { if (tout) st.exclus = []; else { const r = await api(A + '/diffusion/selection', { method: 'POST', body: { ...sel(), exclus: [], q: st.q, page: 0 } }); if (r.vue > 50 || !st.q) { st.mode = 'manuel'; st.inclus = []; $$('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === 'manuel')); $('.df-crit').hidden = true; toast('Plus personne n’est coché : cochez les clients un par un.'); } else st.exclus = [...new Set([...st.exclus, ...$$('[data-cid]').map(x => x.dataset.cid)])]; } }
      else if (tout) { const ids = $$('[data-cid]').map(x => x.dataset.cid); st.inclus = [...new Set([...st.inclus, ...ids])]; toast('Clients de cette page cochés.'); }
      else st.inclus = [];
      charger();
    }));
    /* message */
    const lireChamps = () => { $$('[data-m]').forEach(x => { const [a, b] = x.dataset.m.split('.'); if (b) { st.message[a] = st.message[a] || {}; st.message[a][b] = x.value; } else st.message[a] = x.value; }); garder(); };
    const majCpt = () => {
      if (!sms) return;
      const t = (st.message.texte || '').trim(), c = smsCompte(t);
      const p = $('[data-cpt]'); if (!p) return;
      const mini = $('[data-mini]'); if (mini) mini.textContent = t ? smsTexte(t) : '';
      p.innerHTML = t ? `<b>${c.car}</b> / ${c.sms <= 1 ? (c.unicode ? 70 : 160) : c.sms * (c.unicode ? 67 : 153)} caractères · <b class="${c.sms > 3 ? 'err' : ''}">${c.sms} SMS</b> par message${c.sms > 3 ? ' · <span class="err">trop long (3 SMS au maximum)</span>' : ''}${c.unicode ? ' · <span class="err">caractère spécial (emoji…) : 70 caractères par SMS</span>' : ''}${nb ? `<br>📱 <b>${nb.toLocaleString('fr-FR')}</b> destinataire${nb > 1 ? 's' : ''} × ${c.sms} SMS = <b>${(nb * c.sms).toLocaleString('fr-FR')} SMS au total</b>${cache.dif.credits?.sms != null ? ` · <span class="${nb * c.sms > cache.dif.credits.sms ? 'err' : ''}">${cache.dif.credits.sms.toLocaleString('fr-FR')} crédits SMS restants</span>` : ''}` : ''}` : '';
      majCout();
    };
    function majCout() {
      const p = $('[data-cout]'); if (!p) return;
      const cr = cache.dif.credits, f = x => Number(x).toLocaleString('fr-FR'), go = $('[data-envoyer]');
      let html = '', ko = false;
      if (!sms) {
        if (nb) { html = `✉️ <b>${f(nb)}</b> e-mail${nb > 1 ? 's' : ''} : chaque contact reçoit son propre e-mail, avec son prénom.`; if (cr?.email != null) { ko = nb > cr.email; html += ` Forfait Brevo : <b>${f(cr.email)}</b> e-mail${cr.email > 1 ? 's' : ''} encore autorisé${cr.email > 1 ? 's' : ''}${ko ? ' : <b>pas assez</b>, réduisez la sélection.' : '.'}`; } }
      } else {
        const c = smsCompte((st.message.texte || '').trim()), total = nb * c.sms;
        if (nb && (st.message.texte || '').trim()) {
          html = `💬 <b>${f(nb)}</b> destinataire${nb > 1 ? 's' : ''} × <b>${c.sms}</b> SMS par message = <b>${f(total)} SMS</b> (crédit${total > 1 ? 's' : ''} Brevo).`;
          if (cr?.sms != null) { ko = total > cr.sms; html += ` Crédits SMS restants sur Brevo : <b>${f(cr.sms)}</b>${ko ? ` · <b>il en manque ${f(total - cr.sms)}</b> : rechargez Brevo ou réduisez la sélection.` : ` · il en restera ${f(cr.sms - total)} après l’envoi.`}`; }
          else if (cr?.erreur) html += ' (crédits Brevo illisibles pour le moment)';
          if (c.sms > 3) { ko = true; html += ' Le message dépasse 3 SMS : raccourcissez-le.'; }
        } else if (nb) html = `💬 <b>${f(nb)}</b> destinataire${nb > 1 ? 's' : ''}. Écrivez le SMS pour voir le nombre de SMS envoyés.${cr?.sms != null ? ` Crédits SMS restants sur Brevo : <b>${f(cr.sms)}</b>.` : ''}`;
      }
      p.hidden = !html; p.innerHTML = html; p.classList.toggle('ko', ko); p.classList.toggle('okc', !!html && !ko && (sms ? cr?.sms != null : cr?.email != null));
      if (go && nb) go.disabled = ko || (sms && !conf.creneauSms.ok);
    }
    const lier = () => {
      $$('[data-m]').forEach(x => x.addEventListener('input', () => { lireChamps(); majCpt(); }));
      $('[data-photo]')?.addEventListener('click', async () => { const u = await pickMedia(); if (u) { lireChamps(); st.message.photo = u; garder(); redessiner(); } });
      $('[data-sansphoto]')?.addEventListener('click', () => { lireChamps(); st.message.photo = ''; garder(); redessiner(); });
      majCpt();
    };
    const redessiner = () => { $('[data-champs]').innerHTML = champsMessage(canal, st.message); lier(); };
    lier();
    const ta = $('[data-infos]'); ta.addEventListener('input', () => { st.infos = ta.value; garder(); });
    micPour($('[data-dmic]'), ta, $('[data-iamsg]'), () => { st.infos = ta.value; garder(); });
    $('[data-nbsms]')?.addEventListener('change', e => { st.nbSms = +e.target.value; garder(); majCpt(); });
    $('[data-ton]')?.addEventListener('change', e => { st.ton = e.target.value; garder(); });
    $('[data-redige]').addEventListener('click', async e => {
      const b = e.currentTarget, msg = $('[data-iamsg]'); st.infos = ta.value.trim();
      if (st.infos.length < 5) { msg.innerHTML = '<span class="err">Écrivez d’abord les informations à faire passer.</span>'; ta.focus(); return; }
      const deja = sms ? st.message.texte : st.message.corps;
      if (deja && deja.trim() && !(await confirmer(`<h2>Remplacer ${sms ? 'le SMS' : 'l’e-mail'} déjà écrit ?</h2><p>La proposition de l’IA va remplacer le texte actuel.</p>`, 'Oui, remplacer'))) return;
      b.disabled = true; msg.innerHTML = '<span class="muted">✨ L’IA rédige… (10 à 30 secondes)</span>';
      try {
        const r = await api(A + '/ia/diffusion-' + (sms ? 'sms' : 'email'), { method: 'POST', body: { infos: st.infos, nbSms: st.nbSms, ton: st.ton } });
        if (sms) st.message.texte = r.texte; else st.message = { ...st.message, objet: r.objet, titre: r.titre, corps: r.corps, bouton: r.bouton };
        garder(); redessiner(); msg.innerHTML = '<span class="ok">✓ Proposition prête : relisez et corrigez si besoin.</span>';
        $('[data-champs]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (err) { msg.innerHTML = `<span class="err">${esc(err.message)}</span>`; }
      b.disabled = false;
    });
    $('[data-voir]').addEventListener('click', async () => { lireChamps(); await apercuDiffusion(canal, st.message, sms ? '' : 'Alexandra'); });
    /* essai et envoi */
    $('[data-essai]').addEventListener('input', e => { st.essai = e.target.value.trim(); garder(); });
    $('[data-essaib]').addEventListener('click', async e => {
      lireChamps(); const b = e.currentTarget; b.disabled = true;
      try { const r = await api(A + '/diffusion/essai', { method: 'POST', body: { canal, message: st.message, a: st.essai } }); toast(r.test ? 'Mode essai : rien n’est parti (Brevo non branché).' : sms ? 'SMS d’essai envoyé : regardez votre téléphone.' : 'E-mail d’essai envoyé : regardez votre boîte de réception.'); }
      catch (err) { toast(err.message, true); }
      b.disabled = false;
    });
    $('[data-envoyer]').addEventListener('click', async () => {
      lireChamps();
      const err = sms ? (!st.message.texte?.trim() ? 'Écrivez d’abord le SMS.' : smsCompte(st.message.texte).sms > 3 ? 'Le SMS est trop long (3 SMS au maximum).' : '') : (!st.message.objet?.trim() ? 'Écrivez d’abord l’objet de l’e-mail.' : !st.message.corps?.trim() ? 'Écrivez d’abord le texte de l’e-mail.' : '');
      if (err) { toast(err, true); return; }
      const c = sms ? smsCompte(st.message.texte) : null;
      const ok = await confirmer(`<h2>Envoyer ${sms ? 'ce SMS' : 'cet e-mail'} à <b>${nb.toLocaleString('fr-FR')}</b> contact${nb > 1 ? 's' : ''} ?</h2>
        <p>${sms ? `Texte : « ${esc(st.message.texte.slice(0, 120))}${st.message.texte.length > 120 ? '…' : ''} »<br>${c.sms} SMS par client, soit <b>${(nb * c.sms).toLocaleString('fr-FR')} crédits SMS</b>.` : `Objet : <b>${esc(st.message.objet)}</b>`}</p>
        <p class="muted sm">L’envoi ne peut pas être annulé une fois parti. Avez-vous fait un essai sur ${sms ? 'votre portable' : 'votre e-mail'} ?</p>`, `Oui, envoyer à ${nb.toLocaleString('fr-FR')} contact${nb > 1 ? 's' : ''}`);
      if (!ok) return;
      const go = $('[data-envoyer]'); go.disabled = true;
      try {
        const r = await api(A + '/diffusion/envoyer', { method: 'POST', body: { ...sel(), message: st.message, confirme: nb } });
        toast('Envoi lancé.'); suivre(r.id);
      } catch (e2) { toast(e2.message, true); go.disabled = false; charger(); }
    });
    const ligneHist = c => `<li><span><b>${esc(c.canal === 'sms' ? (c.texte || '').slice(0, 70) + ((c.texte || '').length > 70 ? '…' : '') : c.objet)}</b><small class="muted"> ${dateH(c.at)}${c.par ? ' · ' + esc(c.par) : ''}</small></span><span class="pill ${c.statut === 'termine' ? (c.nbEchecs ? 'd-envoye' : 'd-accepte') : 'd-brouillon'}">${c.statut === 'termine' ? `${(c.nb - c.nbEchecs).toLocaleString('fr-FR')} / ${c.nb.toLocaleString('fr-FR')} envoyés${c.live ? '' : ' (essai)'}` : `en cours ${c.envoyes} / ${c.nb}`}</span></li>`;
    const hist = async () => { const l = await api(A + '/diffusion/campagnes?canal=' + canal).catch(() => []); const box = $('[data-hist]'); if (box) box.innerHTML = l.length ? l.map(ligneHist).join('') : '<li class="muted">Aucun envoi pour le moment.</li>'; };
    const suivre = async id => {
      const box = $('[data-suivi]'); if (!box) return;
      const c = await api(A + '/diffusion/campagnes/' + id).catch(() => null); if (!c) return;
      const pc = c.nb ? Math.round(100 * c.envoyes / c.nb) : 100;
      box.innerHTML = `<div class="df-prog${c.statut === 'termine' ? ' fini' : ''}"><div class="df-bar"><i style="width:${pc}%"></i></div><p>${c.statut === 'termine' ? `✓ Terminé : <b>${(c.nb - c.nbEchecs).toLocaleString('fr-FR')}</b> ${sms ? 'SMS' : 'e-mails'} envoyés${c.live ? '' : ' (mode essai, rien n’est vraiment parti)'}${c.nbEchecs ? `, ${c.nbEchecs} échec${c.nbEchecs > 1 ? 's' : ''} : ${c.echecs.slice(0, 5).map(x => esc(x.nom + ' (' + x.raison + ')')).join(', ')}` : ''}. Chaque envoi est noté dans l’historique du client.` : `Envoi en cours… ${c.envoyes.toLocaleString('fr-FR')} / ${c.nb.toLocaleString('fr-FR')}. Vous pouvez quitter cette page, l’envoi continue.`}</p></div>`;
      hist();
      if (c.statut !== 'termine' && location.hash.startsWith('#/clients/' + canal)) setTimeout(() => suivre(id), 2000);
      else { const go = $('[data-envoyer]'); if (go) go.disabled = false; }
    };
    hist(); charger();
  };
  /* comptage SMS identique au serveur (server/diffusion.js) */
  const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà', GSM7X = '^{}\\[~]|€';
  const versGsm = t => String(t || '').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ | /g, ' ').replace(/ç/g, 'c').replace(/[êë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[û]/g, 'u').replace(/[â]/g, 'a').replace(/[ÊË]/g, 'E').replace(/[ÎÏ]/g, 'I').replace(/[Ô]/g, 'O').replace(/[ÛÙ]/g, 'U').replace(/[ÂÀ]/g, 'A').replace(/[È]/g, 'E');
  function smsCompte(texte) {
    const lien = cache.dif?.conf?.lienSms || '', b = versGsm(texte).replace(/\{prenom\}/gi, 'Alexandra').trim();
    const t = b + (lien && !b.toLowerCase().includes(lien.toLowerCase()) ? '\n' + lien : '') + '\nSTOP au 36173';
    const uni = [...t].some(ch => !GSM7.includes(ch) && !GSM7X.includes(ch));
    const car = uni ? [...t].length : [...t].reduce((n, ch) => n + (GSM7X.includes(ch) ? 2 : 1), 0);
    return { car, unicode: uni, sms: car <= (uni ? 70 : 160) ? 1 : Math.ceil(car / (uni ? 67 : 153)) };
  }
  /* texte final tel qu'il arrivera (aperçu du petit téléphone) */
  function smsTexte(texte) {
    const lien = cache.dif?.conf?.lienSms || '', b = versGsm(texte).replace(/\{prenom\}/gi, 'Alexandra').trim();
    return b + (lien && !b.toLowerCase().includes(lien.toLowerCase()) ? '\n' + lien : '') + '\nSTOP au 36173';
  }
  function confirmer(html, oui) {
    return new Promise(res => {
      const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.innerHTML = `<div class="modal-in df-conf">${html}<div class="row df-cf"><button type="button" class="btn ghost" data-non>Annuler</button><button type="button" class="btn" data-oui>${esc(oui)}</button></div></div>`;
      const fin = v => { m.remove(); res(v); };
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-non]')) fin(false); if (e.target.closest('[data-oui]')) fin(true); });
      document.body.append(m); m.querySelector('[data-oui]').focus();
    });
  }
  async function apercuDiffusion(canal, message, prenom) {
    const sms = canal === 'sms';
    let r; try { r = await api(A + '/diffusion/apercu', { method: 'POST', body: { canal, message, prenom } }); } catch (e) { toast(e.message, true); return; }
    const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    m.innerHTML = sms
      ? `<div class="df-tel-wrap"><button type="button" class="x df-x" data-x aria-label="Fermer">×</button><div class="df-tel" aria-label="Aperçu du SMS sur un téléphone"><div class="df-ile"></div><div class="df-st"><b>${heure}</b><span>▂▄▆ 5G ▭</span></div>
          <div class="df-hd"><span class="df-av">M</span><b>Magnolia</b><small>SMS</small></div>
          <div class="df-fil"><p class="df-date">Aujourd’hui ${heure}</p><div class="df-bulle">${(() => { const L = cache.dif?.conf?.lienSms; let h = esc(r.texte); if (L) h = h.split(esc(L)).join(`<u class="df-lien">${esc(L)}</u>`); return h.replace(/\n/g, '<br>'); })()}</div></div>
          <div class="df-saisie"><span>SMS</span></div></div>
          <p class="df-tel-info">${r.car} caractères · ${r.sms} SMS par client${r.unicode ? ' · contient un caractère spécial' : ''}<br>Exemple avec le prénom « Alexandra ».</p></div>`
      : `<div class="modal-in df-mail"><div class="df-mh"><div><p class="aq-eye">Aperçu de l’e-mail</p><p class="sm"><b>De :</b> Magnolia Traiteur &lt;infos@magnoliatraiteur.fr&gt;<br><b>Objet :</b> ${esc(message.objet || '(sans objet)')}</p></div><button type="button" class="x" data-x aria-label="Fermer">×</button></div>
          <div class="df-mt"><button type="button" class="qs-own-b on" data-lg="100%">💻 Ordinateur</button><button type="button" class="qs-own-b" data-lg="390px">📱 iPhone</button></div><div class="df-mf"><iframe title="Aperçu de l’e-mail" sandbox="allow-same-origin"></iframe></div><p class="muted sm">Exemple avec le prénom « ${esc(prenom || 'Alexandra')} ».</p></div>`;
    document.body.append(m);
    if (!sms) { const f = m.querySelector('iframe'); f.srcdoc = r.html; m.querySelectorAll('[data-lg]').forEach(b => b.addEventListener('click', () => { f.style.width = b.dataset.lg; m.querySelectorAll('[data-lg]').forEach(x => x.classList.toggle('on', x === b)); })); }
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); });
  }
  /* ---------- fiche client : coordonnées + tout l'historique en frise (comme un CRM) ---------- */
  const HTYPES = {
    demande: ['📥', 'Demande', 'dem'], statut: ['➜', 'Étape', 'st'], devis: ['📄', 'Devis', 'dv'], envoi: ['📨', 'Envoi', 'dv'], vu: ['👁', 'Vu', 'dv'], relance: ['🔔', 'Relance', 'msg'],
    signe: ['✍', 'Signature', 'ok'], commentaire: ['💬', 'Commentaire client', 'msg'], refus: ['✕', 'Refus', 'ko'], facture: ['🧾', 'Facture', 'pay'], paiement: ['💶', 'Règlement', 'ok'], email: ['✉', 'E-mail', 'msg'], sms: ['💬', 'SMS', 'msg'],
    appel: ['📞', 'Appel', 'note'], note: ['🗒', 'Note', 'note'], rdv: ['📅', 'Rendez-vous', 'note'], client: ['👤', 'Client', 'st'],
    affaire: ['🛍', 'Commande (ancien CRM)', 'crm'], factureTl: ['🧾', 'Facture (ancien CRM)', 'crm'], affairePerdue: ['✕', 'Affaire perdue (ancien CRM)', 'crm'],
  };
  const HFILTRES = [['', 'Tout'], ['dv', 'Devis'], ['pay', 'Factures et règlements'], ['msg', 'E-mails, SMS et relances'], ['note', 'Notes et appels'], ['crm', '🛍 Ancien CRM']];
  const HF = { f: '' };
  function friseClient(evs) {
    const l = evs.filter(e => !HF.f || (HTYPES[e.type] || [])[2] === HF.f || (HF.f === 'pay' && e.type === 'paiement') || (HF.f === 'dv' && ['signe', 'refus'].includes(e.type)));
    if (!l.length) return `<p class="muted hc-vide">${evs.length ? 'Rien de ce type pour ce client.' : 'Rien pour le moment.'}</p>`;
    let mois = '';
    return l.map(e => {
      const t = HTYPES[e.type] || ['•', '', 'st'], m = new Date(e.at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const head = m !== mois ? `<li class="hc-mois">${esc(m)}</li>` : ''; mois = m;
      const ext = e.lien && e.lien.startsWith('/');
      return `${head}<li class="hc-e k-${t[2]} t-${e.type}"><span class="hc-dot" aria-hidden="true">${t[0]}</span><div class="hc-b"><div class="hc-l1"><b>${esc(e.titre)}</b>${e.montantCents ? `<span class="hc-amt">${euros(e.montantCents)}${e.montantLib ? ' <small>' + esc(e.montantLib) + '</small>' : ''}</span>` : ''}</div>
        <div class="hc-l2">${esc(new Date(e.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}${e.par ? ' · ' + esc(e.par) : ''}${e.statutDevis ? ` <span class="pill d-${e.statutDevis}">${DSTAT[e.statutDevis] || ''}</span>` : ''}</div>
        ${e.detail ? `<div class="hc-d">${esc(e.detail)}</div>` : ''}${e.lien || e.jid ? `<div class="hc-a">${e.lien ? `<a class="lnk" href="${esc(e.lien)}"${ext ? ' target="_blank"' : ''}>${ext ? 'Voir comme le client ↗' : 'Ouvrir →'}</a>` : ''}${e.jid ? `<button type="button" class="lnk hc-del" data-hdel="${esc(e.jid)}">Supprimer</button>` : ''}</div>` : ''}</div></li>`;
    }).join('');
  }
  /* historique commercial de l'ancien CRM (Teamleader) sur la fiche client (Jean-Luc, 2026-11-26) */
  function resumeHisto(H, FT) {
    const fac = FT ? `<span>🧾 <b>${FT.factures}</b> facture${FT.factures > 1 ? 's' : ''} · <b>${eurosRond(FT.netHtCents)}</b> HT facturés${HISTO_RESTE_DU ? (FT.duCents ? ` · <b class="hs-dn">reste dû ${euros(FT.duCents)}</b>` : ' · tout est réglé') : ''}</span>` : '';
    if (!H) return FT ? `<div class="hc-histo">${fac}<small>ancien CRM (Teamleader)</small></div>` : '';
    const an = d => String(d || '').slice(0, 4);
    const periode = H.commandes ? (an(H.premiere) === an(H.derniere) ? 'en ' + an(H.derniere) : `de ${an(H.premiere)} à ${an(H.derniere)}`) : '';
    return `<div class="hc-histo${H.commandes ? '' : ' non'}"><span class="hc-hb">${H.commandes ? `🛍 A commandé <b>${H.commandes} fois</b>` : '✕ N’a pas commandé'}</span>${H.commandes ? `<span><b>${eurosRond(H.caHtCents)}</b> HT ${esc(periode)}</span><span>dernière commande le <b>${dateFr(H.derniere)}</b></span>` : ''}${H.perdues ? `<span>${H.perdues} affaire${H.perdues > 1 ? 's' : ''} perdue${H.perdues > 1 ? 's' : ''}${H.motifs.length ? ' : ' + esc(H.motifs.join(', ')) : ''}</span>` : ''}${H.types.length ? `<span>${esc(H.types.join(', '))}</span>` : ''}${H.commercial ? `<span>suivi par ${esc(H.commercial)}</span>` : ''}${fac}<small>ancien CRM (Teamleader)</small></div>`;
  }
  function boxFacturesTl(FT) {
    if (!FT) return '';
    return `<section class="box hc-aff"><div class="hc-th"><h2>🧾 Factures <small class="muted">(ancien CRM)</small></h2><span class="muted sm">${FT.factures}</span></div><ul class="list">${FT.liste.map(f => `<li><span><b>${esc(f.numero)}</b> · ${dateFr(f.date)} · ${euros(f.netTtcCents)} TTC<small class="muted">${esc([f.entite, f.oppTitre, f.creditHtCents ? 'avoir ' + euros(f.creditHtCents) + ' HT' : ''].filter(Boolean).join(' · '))}</small></span>${HISTO_RESTE_DU ? `<span class="pill ${f.duCents ? 'd-refuse' : 'd-accepte'}">${f.duCents ? 'Reste ' + euros(f.duCents) : 'Payée'}</span>` : ''}</li>`).join('')}</ul></section>`;
  }
  function boxHisto(H) {
    if (!H) return '';
    const L = H.affaires || [];
    return `<section class="box hc-aff"><div class="hc-th"><h2>🛍 Commandes passées <small class="muted">(ancien CRM)</small></h2><span class="muted sm">${L.length} affaire${L.length > 1 ? 's' : ''}</span></div><ul class="list">${L.map(a => `<li><span><b>${esc(a.evenement || 'Événement')}${a.age ? ' ' + esc(a.age) + ' ans' : ''}</b> · ${a.dateEvt ? dateFr(a.dateEvt) : '—'}${a.invites ? ' · ' + a.invites + ' pers.' : ''} · ${eurosRond(a.montantHtCents)} HT<small class="muted">${esc([a.lieu, a.source ? '🧭 ' + a.source : '', a.commercial, a.motif ? 'Motif : ' + a.motif : ''].filter(Boolean).join(' · '))}</small></span><span class="pill ${a.statut === 'gagnee' ? (/^non/i.test(a.facture) ? 'd-envoye' : 'd-accepte') : a.statut === 'perdue' ? 'd-refuse' : 'd-envoye'}">${a.statut === 'gagnee' ? (/^non/i.test(a.facture) ? 'Signée, non facturée' : 'Signée') : a.statut === 'perdue' ? 'Perdue' : 'En cours'}</span></li>`).join('')}</ul></section>`;
  }
  /* anniversaire : prochaine date, nombre de jours, âge atteint ce jour-là */
  function annivInfo(n) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n || '')) return null;
    const [y, m, d] = n.split('-').map(Number), t = new Date(), j0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    let a = new Date(j0.getFullYear(), m - 1, d); if (a < j0) a = new Date(j0.getFullYear() + 1, m - 1, d);
    return { date: `${a.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dans: Math.round((a - j0) / 864e5), age: a.getFullYear() - y };
  }
  async function souhaiter(id, canal, fin) {
    if (!confirm(`Envoyer un message « Joyeux anniversaire » par ${canal === 'sms' ? 'SMS' : 'e-mail'} ?`)) return;
    try { await api(`${A}/actions/anniversaire/${id}`, { method: 'POST', body: { canal } }); toast('Message d’anniversaire envoyé.'); fin && fin(); } catch (err) { toast(err.message, true); }
  }
  /* ---------- appels et visios programmés depuis la fiche client ---------- */
  const auj = () => new Date().toLocaleDateString('sv-SE');
  function listeRdv(l) {
    const a = l.filter(r => !r.fait && (r.date + 'T' + r.heure) >= new Date(Date.now() - 36e5).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T')), p = l.filter(r => !a.includes(r)).reverse().slice(0, 5);
    const li = r => `<li class="hr-i${r.fait ? ' fait' : ''}"><div><b>${r.type === 'visio' ? '🎥 Visio' : '📞 Appel'} · ${dateFr(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} à ${esc(r.heure.replace(':', ' h '))}</b><small>${esc([r.motif, r.commerciaux?.length ? 'avec ' + r.commerciaux.join(', ') : 'toute l’équipe', r.envoye?.email || r.envoye?.sms ? 'invitation envoyée' : ''].filter(Boolean).join(' · '))}</small></div>
      <div class="hr-a">${r.lien && !r.fait ? `<a class="qs-pill dark" href="${esc(r.lien)}" target="_blank" rel="noopener">Rejoindre la visio ↗</a><button type="button" class="qs-pill" data-rcopy="${esc(r.lien)}">Copier le lien</button>` : ''}${r.fait ? '<span class="pill d-accepte">Fait</span>' : `<button type="button" class="qs-pill" data-rfait="${esc(r.id)}">✓ Fait</button>`}<button type="button" class="lnk hc-del" data-rdel="${esc(r.id)}">Supprimer</button></div></li>`;
    return a.length || p.length ? `<ul class="hr-l">${a.map(li).join('')}</ul>${p.length ? `<p class="muted sm hr-pt">Passés</p><ul class="hr-l">${p.map(li).join('')}</ul>` : ''}` : '<p class="muted">Aucun appel prévu. « + Programmer » pour en ajouter un.</p>';
  }
  function formRdv(c) {
    const noms = commerciaux(), moi = session.nom || '';
    return `<section class="box hc-edit hc-rdvf" id="hcRdv" hidden><div class="hc-th"><h2>📞 Programmer un appel ou une visio avec ${esc(c.nom || 'ce client')}</h2><button type="button" class="lnk" data-rclose>Fermer</button></div>
      <form id="rdvf"><div class="hr-type"><label class="hr-t"><input type="radio" name="type" value="appel" checked><span>📞 Appel téléphonique</span></label><label class="hr-t"><input type="radio" name="type" value="visio"><span>🎥 Visio</span></label></div>
      <div class="g3"><label>Date<input type="date" name="date" required min="${auj()}" value="${auj()}"></label><label>Heure<input type="time" name="heure" required step="300"></label><label>Durée<select name="duree">${[15, 30, 45, 60, 90].map(m => `<option value="${m}"${m === 30 ? ' selected' : ''}>${m} min</option>`).join('')}</select></label></div>
      <label>Motif de l’appel<textarea name="motif" rows="2" placeholder="ex. Faire le point sur le menu du mariage, confirmer le nombre d’invités…"></textarea></label>
      <fieldset class="df-fs"><legend>Dans l’agenda de</legend><label class="check"><input type="checkbox" data-rtous> Tous les commerciaux</label>${noms.map(n => `<label class="check"><input type="checkbox" name="com" value="${esc(n)}"${n === moi ? ' checked' : ''}> ${esc(n)}</label>`).join('')}<p class="muted sm">Chaque commercial choisi le voit dans l’agenda et reçoit un rappel par SMS sur son portable et par e-mail 24 h, 4 h et 1 h avant (numéros dans Équipe &amp; activité › Alertes de l’équipe).</p></fieldset>
      <div class="hr-visio" hidden><p class="muted sm">Un lien de visio est créé tout seul (Jitsi Meet : gratuit, rien à installer, il s’ouvre dans le navigateur ou sur le téléphone).</p><label>Ou votre propre lien (Google Meet, Zoom, Teams…) <small class="muted">facultatif</small><input name="lienVisio" type="url" placeholder="https://meet.google.com/…"></label></div>
      <fieldset class="df-fs"><legend>Prévenir le client</legend><label class="check"><input type="checkbox" name="envoyerEmail"${c.email ? ' checked' : ' disabled'}> Lui envoyer l’invitation par e-mail${c.email ? ` (${esc(c.email)}), avec le rendez-vous à ajouter à son agenda` : ' (pas d’e-mail sur la fiche)'}</label><label class="check"><input type="checkbox" name="envoyerSms"${c.tel ? '' : ' disabled'}> Lui envoyer aussi un SMS${c.tel ? ` (${esc(c.tel)})` : ' (pas de téléphone sur la fiche)'}</label></fieldset>
      <div class="row"><button class="btn">Programmer</button><button type="button" class="btn ghost" data-rclose>Annuler</button></div></form></section>`;
  }
  function brancherFormRdv(rf, id, fin) {
    rf.addEventListener('change', e => {
      if (e.target.name === 'type') $('.hr-visio', rf).hidden = rf.type.value !== 'visio';
      if (e.target.matches('[data-rtous]')) $$('input[name=com]', rf).forEach(x => { x.checked = false; x.disabled = e.target.checked; });
    });
    rf.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(rf), tous = $('[data-rtous]', rf).checked;
      const body = { type: f.get('type'), date: f.get('date'), heure: f.get('heure'), duree: +f.get('duree'), motif: f.get('motif'), lienVisio: f.get('lienVisio') || '', commerciaux: tous ? [] : f.getAll('com'), envoyerEmail: !!f.get('envoyerEmail'), envoyerSms: !!f.get('envoyerSms') };
      if (!tous && !body.commerciaux.length) return toast('Cochez au moins un commercial (ou « Tous »).', true);
      try { const r = await api(`${A}/actions/rdv-client/${id}`, { method: 'POST', body }); toast((body.type === 'visio' ? 'Visio programmée' : 'Appel programmé') + (r.envoye?.email || r.envoye?.sms ? ' : invitation envoyée au client.' : '.')); fin && fin(); } catch (err) { toast(err.message, true); }
    });
  }
  /* onglet Clients › Programmer un appel : choisir le client, puis le même formulaire que sur la fiche */
  async function appelsClients() {
    const [ag, eq, R0] = await Promise.all([api(A + '/actions/agenda'), cache.equipe ? Promise.resolve(null) : api(A + '/actions/equipe').catch(() => []), cache.R ? Promise.resolve(null) : api(A + '/site').catch(() => ({}))]);
    if (eq) cache.equipe = eq.filter(u => !u.desactive); if (R0) cache.R = R0;
    const maintenant = new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T');
    const l = ag.filter(x => x.clientId && ['appel', 'visio'].includes(x.type) && !x.fait && (x.date + 'T' + x.heure) >= maintenant);
    return page('Contacts', '<a class="btn ghost" href="#/clients/nouveau">+ Nouveau contact</a>', `${ongletsClients('appels')}
      <section class="box ap-box"><h2>📞 Programmer un appel ou une visio</h2><p class="muted sm">1. Cherchez le client. 2. Choisissez la date, l’heure, le motif et le commercial. Le rendez-vous va dans l’agenda et le commercial reçoit ses rappels par SMS (24 h, 4 h et 1 h avant).</p>
        <div class="cf-in"><input type="search" id="apQ" autocomplete="off" placeholder="🔍 Nom, prénom, téléphone, e-mail ou société du client…" aria-label="Rechercher le client"><div class="cf-res" id="apRes" hidden></div></div>
        <div id="apForm"></div></section>
      <section class="box"><h2>Appels et visios à venir <small class="muted">(${l.length})</small></h2>${l.length ? `<ul class="hr-l">${l.map(r => `<li class="hr-i"><div><a href="#/clients/${esc(r.clientId)}"><b>${r.type === 'visio' ? '🎥 Visio' : '📞 Appel'} · ${dateFr(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} à ${esc(r.heure.replace(':', ' h '))} · ${esc(r.clientNom)}</b></a><small>${esc([r.motif, r.commerciaux?.length ? 'avec ' + r.commerciaux.join(', ') : 'toute l’équipe'].filter(Boolean).join(' · '))}</small></div>${r.visio ? `<div class="hr-a"><a class="qs-pill dark" href="${esc(r.visio)}" target="_blank" rel="noopener">Rejoindre la visio ↗</a></div>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun appel prévu pour l’instant.</p>'}</section>`);
  }
  appelsClients.after = () => {
    const q = $('#apQ'), res = $('#apRes');
    const choisir = async cid => {
      res.hidden = true;
      const c = { ...(await api(A + '/clients/' + cid)), id: cid };
      q.value = c.nom || '';
      $('#apForm').innerHTML = formRdv(c).replace(' id="hcRdv" hidden', ' id="hcRdv"').replace('class="box hc-edit hc-rdvf"', 'class="hc-rdvf ap-form"');
      $$('#apForm [data-rclose]').forEach(b => b.addEventListener('click', () => { $('#apForm').innerHTML = ''; q.value = ''; q.focus(); }));
      brancherFormRdv($('#rdvf'), cid, () => render());
      $('#apForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(async () => {
      const v = q.value.trim(); if (!v) { res.hidden = true; return; }
      try { const r = await api(`${A}/clients?par=8&page=1&q=${encodeURIComponent(v)}`); res.hidden = false;
        res.innerHTML = r.items.length ? r.items.map((c, i) => `<a class="cf-r${i ? '' : ' on'}" href="#" data-apc="${esc(c.id)}"><span class="qs-av">${esc(initiales(c.nom))}</span><span class="cf-t"><b>${esc(c.nom || '—')}</b><small>${esc([c.societe, c.tel, c.email].filter(Boolean).join(' · '))}</small></span><span class="cf-go">Choisir ›</span></a>`).join('') : `<p class="cf-none">Aucun client ne correspond. <a href="#/clients/nouveau">+ Créer la fiche</a></p>`;
      } catch (e) { toast(e.message, true); } }, 200); });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const a = $('#apRes .cf-r.on'); if (a) choisir(a.dataset.apc); } });
    res.addEventListener('click', e => { const a = e.target.closest('[data-apc]'); if (!a) return; e.preventDefault(); choisir(a.dataset.apc); });
    q.focus();
  };
  async function client(id) {
    if (id === 'nouveau') {
      const ent = new URLSearchParams(location.hash.split('?')[1] || '').get('ent');
      const e = ent ? await api(A + '/entreprises/' + encodeURIComponent(ent)).then(x => x.entreprise).catch(() => null) : null;
      if (!cache.profilDef) cache.profilDef = await api(A + '/actions/profil-contact').catch(() => null);
      cache.client = { nom: '', email: '', tel: '', societe: e?.nom || '', entrepriseId: e?.id || '', adresse: e?.adresse || '', cp: e?.cp || '', ville: e?.ville || '', notes: '' };
      return page(e ? 'Nouveau contact · ' + esc(e.nom) : 'Nouveau client', e ? `<a class="btn ghost" href="#/clients/entreprises/${esc(e.id)}">← ${esc(e.nom)}</a>` : '<a class="btn ghost" href="#/suivi">← Suivi client</a>', `<section class="box hc-form"><form id="cf">${formClient(cache.client)}<button class="btn">Enregistrer</button></form></section>`);
    }
    const [h, eq, R0, PD] = await Promise.all([api(A + '/actions/historique-client/' + id), cache.equipe ? Promise.resolve(null) : api(A + '/actions/equipe').catch(() => []), cache.R ? Promise.resolve(null) : api(A + '/site').catch(() => ({})), cache.profilDef ? Promise.resolve(null) : api(A + '/actions/profil-contact').catch(() => null)]);
    if (eq) cache.equipe = eq.filter(u => !u.desactive); if (R0) cache.R = R0; if (PD) cache.profilDef = PD;
    const c = h.client; cache.client = c; cache.hist = h;
    const tel = String(c.tel || '').replace(/[^\d+]/g, ''), r = h.resume;
    const coms = [...new Set([...h.devis.map(x => x.commercial), ...(h.demandes || []).map(x => x.commercial)].filter(Boolean))];
    const an = annivInfo(c.naissance);
    return page(esc(c.nom || 'Client'), `<a class="btn ghost" href="#/suivi">← Suivi client</a><button type="button" class="btn hc-editbtn" data-hedit>✏ Modifier la fiche</button><button type="button" class="btn ghost hc-rdvbtn" data-hrdv>📞 Programmer un appel / une visio</button><button class="btn anc-btn" data-newdvanc>📂 Partir d’un ancien devis</button><button class="btn" data-newdv>+ Devis pour ce client</button>`, `
      <section class="box hc-edit" id="hcEdit"${/[?&]edit=1/.test(location.hash) ? '' : ' hidden'}><div class="hc-th"><h2>✏ Modifier la fiche de ${esc(c.nom || 'ce client')}</h2><button type="button" class="lnk" data-hcancel>Fermer</button></div><p class="muted sm">Corrigez ce qui a changé (nom, téléphone, e-mail, adresse…) puis « Enregistrer ». Les demandes et le suivi client sont mis à jour en même temps.</p><form id="cf">${formClient(c)}<div class="row"><button class="btn">Enregistrer la fiche</button><button type="button" class="btn ghost" data-hcancel>Annuler</button></div></form></section>
      ${formRdv(c)}
      <section class="box hc-head"><div class="hc-who"><span class="qs-av hc-av">${esc(initiales(c.nom))}</span><div><div class="hc-nm">${esc(c.nom || '—')} <button type="button" class="hc-pen" data-hedit title="Modifier la fiche" aria-label="Modifier la fiche">✏</button></div>${c.societe ? `<div class="hc-co">${c.entrepriseId ? `<a class="hc-ent" href="#/clients/entreprises/${esc(c.entrepriseId)}" title="Ouvrir la fiche de l’entreprise">🏢 ${esc(c.societe)} ›</a>` : esc(c.societe)}${c.fonction ? ' · ' + esc(c.fonction) : ''}</div>` : c.fonction ? `<div class="hc-co">${esc(c.fonction)}</div>` : ''}
        <div class="hc-ct">${tel ? `<a class="qs-pill" href="tel:${esc(tel)}" data-happel>📞 ${esc(c.tel)}</a>` : ''}${c.email ? `<a class="qs-pill" href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}</div>
        ${an ? `<div class="hc-anniv${an.dans <= 14 ? ' bientot' : ''}">🎂 Né(e) le ${dateFr(c.naissance, { day: 'numeric', month: 'long', year: 'numeric' })} · ${an.age - (an.dans ? 1 : 0)} ans · ${an.dans === 0 ? '<b>anniversaire aujourd’hui !</b>' : an.dans <= 14 ? `<b>anniversaire dans ${an.dans} jour${an.dans > 1 ? 's' : ''}</b>` : 'anniversaire le ' + dateFr(an.date, { day: 'numeric', month: 'long' })}${an.dans <= 14 ? ` <button type="button" class="qs-pill" data-anniv="${esc(c.id)}" data-canal="email">✉ Souhaiter par e-mail</button><button type="button" class="qs-pill" data-anniv="${esc(c.id)}" data-canal="sms">💬 par SMS</button>` : ''}</div>` : `<div class="hc-since"><button type="button" class="lnk" data-hedit>🎂 Ajouter sa date de naissance</button></div>`}<div class="hc-since">Client depuis le ${dateFr(c.creeLe || h.events[h.events.length - 1]?.at)}${coms.length ? ' · suivi par ' + esc(coms.join(', ')) : ''}</div><div class="hc-since hc-src">${canalDe(c) ? `${pillSource(canalDe(c))}${(() => { const a = [...new Set((h.demandes || []).filter(d => d.type !== 'contact').map(d => d.canal).filter(x => x && x !== canalDe(c)))]; return a.length ? ` <small class="muted">puis aussi : ${esc(a.join(', '))}</small>` : ''; })()}` : '<button type="button" class="lnk" data-hedit>🧭 Indiquer l’origine du contact (Site, Bouche à oreille…)</button>'}</div>${c.source === 'import CRM' || c.consentement ? `<div class="hc-since hc-cons">${c.source === 'import CRM' ? '📥 Repris du fichier clients de l’ancien CRM' : '✓ Client existant'}${c.consentement ? ` · accepte nos ${[c.consentement.email && !c.desinscrit?.email ? 'e-mails' : '', c.consentement.sms && !c.desinscrit?.sms ? 'SMS' : ''].filter(Boolean).join(' et ') || '—'}` : ''}${c.desinscrit?.email || c.desinscrit?.sms ? ` · <b>désinscrit des ${[c.desinscrit.email ? 'e-mails' : '', c.desinscrit.sms ? 'SMS' : ''].filter(Boolean).join(' et ')}</b>` : ''}${c.caCrmCents ? ` · déjà commandé (ancien CRM) : ${euros(c.caCrmCents)}` : ''}${c.derniereCommande ? ` · dernière commande le ${dateFr(c.derniereCommande)}` : ''}</div>` : ''}</div></div>
        <div class="kpis qk hc-k"><div><b>${euros(r.signeCents)}</b><span>signé (TTC)</span></div><div><b>${euros(r.regleCents)}</b><span>déjà réglé</span></div><div><b>${euros(r.aEncaisserCents)}</b><span>factures à encaisser</span></div><div><b>${r.nbSignes} / ${r.nbDevis}</b><span>devis signés</span></div></div>${resumeHisto(h.historique, h.facturesTl)}</section>
      <div class="hc-cols">
        <section class="box hc-tl"><div class="hc-th"><h2>Tout l’historique</h2><span class="muted sm">${h.events.length} événement${h.events.length > 1 ? 's' : ''}</span></div>
          <div class="hc-add"><textarea rows="2" data-hnote placeholder="Ajouter une note : ce que le client a dit au téléphone, une préférence, un rappel…"></textarea><div class="row"><button type="button" class="btn sm" data-hadd="note">🗒 Ajouter la note</button><button type="button" class="btn ghost sm" data-hadd="appel">📞 Noter un appel</button></div></div>
          <div class="hc-f">${HFILTRES.map(([k, l]) => `<button type="button" class="qs-own-b${HF.f === k ? ' on' : ''}" data-hf="${k}">${l}</button>`).join('')}</div>
          <ol class="hc-list" id="hcList">${friseClient(h.events)}</ol></section>
        <div class="hc-side">
          <section class="box hc-rqbox"><div class="hc-th"><h2>🔒 Remarque</h2><span class="muted sm">visible seulement par l’équipe</span></div><textarea rows="4" data-rq placeholder="Ex. : client exigeant sur la ponctualité, préfère le vin rouge, code portail 1234…">${esc(c.notes || '')}</textarea><div class="row"><button type="button" class="btn sm" data-rqsave>Enregistrer la remarque</button><span class="muted sm" data-rqok></span></div><p class="muted sm">Jamais montrée au client : ni sur le site, ni sur les devis, ni dans les e-mails ou SMS.</p></section>
          ${boxLivraison(c)}
          ${boxProfil(c)}
          <section class="box hc-rdvs"><div class="hc-th"><h2>Appels et visios</h2><button type="button" class="lnk" data-hrdv>+ Programmer</button></div>${listeRdv(h.rdv || [])}</section>
          <section class="box"><h2>Devis</h2>${h.devis.length ? `<ul class="list">${[...h.devis].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => `<li><a href="#/devis/${x.id}"><b>${esc(x.numero)}</b> · ${euros(x.ttcCents)}<small class="muted"> ${esc([x.evenement?.type, x.evenement?.date ? dateFr(x.evenement.date) : ''].filter(Boolean).join(' · '))}</small></a><span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun devis.</p>'}</section>
          ${boxHisto(h.historique)}${boxFacturesTl(h.facturesTl)}
          <section class="box"><h2>Factures et règlements</h2>${h.factures.length ? `<ul class="list">${h.factures.map(x => `<li><a href="#/factures/${x.id}"><b>${esc(x.numero)}</b> · ${x.type === 'avoir' ? '− ' : ''}${euros(x.totalCents)}<small class="muted"> ${{ acompte: 'acompte', solde: 'solde', totale: '', avoir: 'avoir' }[x.type] || ''}${x.type !== 'avoir' && !x.annulee && x.regleCents && x.resteCents ? ` · réglé ${euros(x.regleCents)}, reste ${euros(x.resteCents)}` : ''}</small></a><span class="pill ${x.annulee ? 'd-refuse' : x.type === 'avoir' ? 'd-expire' : x.payee ? 'd-accepte' : 'd-envoye'}">${x.annulee ? 'Annulée' : x.type === 'avoir' ? 'Avoir' : x.payee ? (x.archivee ? 'Archivée' : 'Réglée') + (x.moyen ? ' · ' + esc(x.moyen) : '') : x.regleCents ? 'Acompte reçu' : 'À encaisser'}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune facture.</p>'}</section>
          <section class="box"><h2>Demandes</h2>${h.demandes.length ? `<ul class="list">${h.demandes.map(d => `<li><a href="#/demandes/${d.id}"><b>${esc(d.ref || '')}</b> · ${esc(d.evenement?.type || (d.type === 'contact' ? 'message' : ''))} ${d.evenement?.date ? dateFr(d.evenement.date) : ''}${d.canal ? `<small class="muted"> · 🧭 ${esc(d.canal)}</small>` : ''}</a><span class="pill st-${d.statut}">${STATUTS[d.statut] || ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune demande.</p>'}</section>
        </div></div>`);
  }
  /* profil prestataire / DJ / origine (fichier contacts « MADER », 2026-11-24) */
  const aProfil = c => !!((c.metiers || []).length || c.independant || c.permis || c.remuneration);
  const aDj = c => !!((c.djStyles || []).length || c.djDepuis || c.djTarifs || (c.metiers || []).includes('DJ'));
  function boxProfil(c) {
    const puce = t => `<span class="pf-p">${esc(t)}</span>`;
    const lignes = [];
    if (c.nePasContacter) lignes.push('<p class="pf-npc">⛔ NE PAS CONTACTER <small>(aucun e-mail ni SMS d’information)</small></p>');
    const presta = genreDe(c) === 'prestataire';
    if (presta && aProfil(c)) lignes.push(`<div class="pf-g"><p class="pf-t">🎭 Prestataire</p>${(c.metiers || []).length ? `<div class="pf-ps">${c.metiers.map(puce).join('')}</div>` : ''}<p class="sm">${[c.independant ? '✓ Indépendant(e)' : '', c.permis ? '🚗 Permis de conduire' : '', c.remuneration ? '💶 Rémunération : ' + esc(c.remuneration) : ''].filter(Boolean).join(' · ')}</p></div>`);
    if (presta && aDj(c)) lignes.push(`<div class="pf-g"><p class="pf-t">🎧 DJ</p>${(c.djStyles || []).length ? `<div class="pf-ps">${c.djStyles.map(puce).join('')}</div>` : ''}<p class="sm">${[c.djDepuis ? 'DJ depuis ' + esc(c.djDepuis) : '', c.djTarifs ? 'Tarifs : ' + esc(c.djTarifs) + ' €' : ''].filter(Boolean).join(' · ')}</p></div>`);
    if (canalDe(c) || c.contactDe || c.siteWeb || c.pays || c.civilite) lignes.push(`<div class="pf-g"><p class="pf-t">🤝 Origine</p><p class="sm">${[canalDe(c) ? 'Origine : <b>' + esc(canalDe(c)) + '</b>' : '', c.civilite ? (c.civilite === 'Mme' ? 'Madame' : 'Monsieur') : '', c.contactDe ? 'Contact de <b>' + esc(c.contactDe) + '</b>' : '', c.pays ? esc(c.pays) : '', c.siteWeb ? `<a href="${esc(/^https?:/i.test(c.siteWeb) ? c.siteWeb : 'https://' + c.siteWeb)}" target="_blank" rel="noopener">${esc(String(c.siteWeb).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))} ↗</a>` : ''].filter(Boolean).join(' · ')}</p></div>`);
    return `<section class="box pf-box"><div class="hc-th"><h2>Profil</h2><button type="button" class="lnk" data-hedit>✏ Compléter</button></div>${lignes.join('') || '<p class="muted sm">Métiers, DJ, « contact de »… : rien de renseigné. « Compléter » pour les ajouter.</p>'}</section>`;
  }
  function casesProfil(c) {
    const D = cache.profilDef || { metiers: [], djStyles: [], contactDe: [] };
    const coches = (nom, base, choisis) => { const l = [...base, ...(choisis || []).filter(x => !base.includes(x))]; return `<div class="pf-cases">${l.map(x => `<label class="pf-c"><input type="checkbox" name="${nom}" value="${esc(x)}"${(choisis || []).includes(x) ? ' checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>`; };
    return `<div class="pf-presta"${genreDe(c) === 'prestataire' ? '' : ' hidden'}><details class="pf-d"${aProfil(c) ? ' open' : ''}><summary>🎭 Profil prestataire / talent <small class="muted">(serveur, barman, DJ, magicien…)</small></summary>
        <p class="pf-l">Métiers</p>${coches('_metiers', D.metiers, c.metiers)}
        <div class="g2"><label class="check"><input type="checkbox" name="independant"${c.independant ? ' checked' : ''}> Indépendant(e) <small class="muted">(auto-entrepreneur…)</small></label><label class="check"><input type="checkbox" name="permis"${c.permis ? ' checked' : ''}> A le permis de conduire</label></div>
        <label>Rémunération demandée<input name="remuneration" value="${esc(c.remuneration || '')}" placeholder="ex. 15 € de l’heure, 130 € la soirée"></label></details>
      <details class="pf-d"${aDj(c) ? ' open' : ''}><summary>🎧 DJ <small class="muted">(styles, expérience, tarifs)</small></summary>
        <p class="pf-l">Styles de musique</p>${coches('_djStyles', D.djStyles, c.djStyles)}
        <div class="g2"><label>DJ depuis <small class="muted">(année)</small><input name="djDepuis" value="${esc(c.djDepuis || '')}" inputmode="numeric" maxlength="4" placeholder="ex. 2015"></label><label>Tarifs <small class="muted">(€ la soirée)</small><input name="djTarifs" value="${esc(c.djTarifs || '')}" placeholder="ex. 250, 300"></label></div></details></div>
      <details class="pf-d" open><summary>🤝 Origine du contact <small class="muted">(source, qui nous l’a apporté)</small></summary>
        <div class="g2"><label>🧭 Source <small class="muted">(par où il nous a trouvés : Site, Bouche à oreille, 1001 salles…)</small>${selSource('canal', canalDe(c))}</label></div>
        <div class="g2"><label>Contact de <small class="muted">(qui nous l’a apporté)</small><input name="contactDe" value="${esc(c.contactDe || '')}" list="pfCde" autocomplete="off"><datalist id="pfCde">${D.contactDe.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label><label>Site internet<input name="siteWeb" value="${esc(c.siteWeb || '')}" placeholder="www…"></label></div>
        <div class="g2"><label>Pays <small class="muted">(si pas la France)</small><input name="pays" value="${esc(c.pays || '')}"></label><label class="check pf-npcc"><input type="checkbox" name="nePasContacter"${c.nePasContacter ? ' checked' : ''}> ⛔ NE PAS CONTACTER <small class="muted">(bloque aussi les e-mails et SMS d’information)</small></label></div></details>`;
  }
  /* lecture du formulaire de fiche client (page de la fiche et fenêtre « ✏ Modifier ») */
  function lireFormClient(form, c0) {
    const fd = new FormData(form), f = Object.fromEntries(fd);
    f.metiers = fd.getAll('_metiers'); f.djStyles = fd.getAll('_djStyles'); delete f._metiers; delete f._djStyles;
    if (f.canal === NOUV_SRC) f.canal = c0.canal || '';
    /* livraison : les cases « liv_… » forment la fiche de livraison */
    if ('liv_horaire' in f) {
      const lv = { identique: !!f.liv_identique, acces: fd.getAll('_liv_acces') };
      for (const k of ['adresse', 'cp', 'ville', 'horaire', 'logement', 'niveau', 'etage', 'ascenseur', 'digicode', 'contact', 'contactTel', 'remarque']) lv[k] = String(f['liv_' + k] ?? '').trim();
      for (const k of Object.keys(f)) if (k.startsWith('liv_') || k === '_liv_acces') delete f[k];
      f.livraison = lv;
    }
    if (f.nomFamille !== undefined) f.nom = [f.prenom, f.nomFamille].map(x => String(x || '').trim()).filter(Boolean).join(' ');
    for (const k of ['independant', 'permis', 'nePasContacter']) f[k] = !!f[k];
    const now = new Date().toISOString(), ds = c0.desinscrit || {}, cs = c0.consentement || {};
    if (f.nePasContacter && !c0.nePasContacter) { f._stopEmail = 'on'; f._stopSms = 'on'; }
    const stopE = !!f._stopEmail, stopS = !!f._stopSms, acc = !!f._accord; delete f._stopEmail; delete f._stopSms; delete f._accord;
    if (stopE !== !!ds.email || stopS !== !!ds.sms) f.desinscrit = { ...ds, email: stopE, sms: stopS, le: ds.le || now, ...(stopE && !ds.email ? { leEmail: now } : {}), ...(stopS && !ds.sms ? { leSms: now } : {}) };
    if (acc !== !!cs.email) f.consentement = acc ? { ...cs, email: true, sms: true, le: now, source: 'back-office' } : { ...cs, email: false, sms: false, le: now, source: 'back-office' };
    return f;
  }
  /* fenêtre par-dessus l'écran : corriger une fiche sans quitter ce qu'on fait (envois groupés…) */
  async function ficheEnFenetre(id, apres) {
    let c; try { [c] = await Promise.all([api(A + '/clients/' + id), cache.profilDef ? null : api(A + '/actions/profil-contact').then(x => { cache.profilDef = x; }).catch(() => null)]); } catch (e) { toast(e.message, true); return; }
    const m = document.createElement('div'); m.className = 'modal df-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = `<div class="modal-in fc-in"><div class="bh"><h2>✏ Fiche de ${esc(c.nom || 'ce contact')}</h2><button type="button" class="x" data-x aria-label="Fermer">×</button></div><form class="hc-form">${formClient(c)}<div class="row"><button class="btn">Enregistrer la fiche</button><button type="button" class="btn ghost" data-x>Annuler</button><a class="lnk" href="#/clients/${esc(id)}" target="_blank" rel="noopener">Ouvrir tout l’historique ↗</a></div></form></div>`;
    document.body.appendChild(m);
    const fermer = () => { m.remove(); document.removeEventListener('keydown', esc1); };
    const esc1 = e => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', esc1);
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) fermer(); });
    setTimeout(() => m.querySelector('input[name=nom]')?.focus(), 50);
    m.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = lireFormClient(e.target, c);
      try { const cur = await api(A + '/clients/' + id); await api(`${A}/clients/${id}`, { method: 'PUT', body: { ...cur, ...f } }); toast('Fiche enregistrée.'); fermer(); apres?.(); } catch (err) { toast(err.message, true); }
    });
  }
  /* Prénom et Nom dans deux cases (Jean-Luc, 2026-11-26) ; les anciennes fiches n'ont que « Prénom NOM » : on le coupe à l'affichage */
  function partiesNomClient(c) {
    if (c.prenom !== undefined || c.nomFamille !== undefined) return { prenom: c.prenom || '', nomFamille: c.nomFamille || '' };
    const w = String(c.nom || '').trim().split(/\s+/).filter(Boolean); if (w.length < 2) return { prenom: '', nomFamille: w[0] || '' };
    let i = w.findIndex((x, k) => k >= 1 && /\p{L}{2}/u.test(x) && x === x.toLocaleUpperCase('fr-FR')); if (i < 1) i = 1;
    return { prenom: w.slice(0, i).join(' '), nomFamille: w.slice(i).join(' ').toLocaleUpperCase('fr-FR') };
  }
  /* Client ou Prestataire (Jean-Luc, 2026-11-26) : un client n'a que ce qu'il faut pour le livrer et le facturer ;
     le profil prestataire (métiers, indépendant, rémunération, DJ) ne s'affiche que pour un prestataire. */
  const genreDe = c => c.genre === 'prestataire' || c.genre === 'client' ? c.genre : (aProfil(c) || aDj(c) ? 'prestataire' : 'client');
  const choixGenre = c => { const g = genreDe(c); return `<div class="cg-choix" role="radiogroup" aria-label="Type de fiche">${[['client', '🧑‍🍳 Client', 'à livrer et facturer'], ['prestataire', '🎭 Prestataire', 'serveur, barman, DJ, artiste…']].map(([v, l, d]) => `<label class="cg-b"><input type="radio" name="genre" value="${v}"${g === v ? ' checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>`; };
  /* adresse et horaire de livraison + cases pour les livreurs (mêmes listes que server/livraison-client.js) */
  const LIV_LOGEMENTS = ['Maison', 'Appartement', 'Entreprise / bureaux', 'Salle de réception', 'Extérieur / jardin'];
  const LIV_ACCES = ['Digicode', 'Interphone', 'Gardien ou badge', 'Escaliers ou marches', 'Couloirs ou portes étroits', 'Stationnement facile devant', 'Stationnement difficile', 'Place de livraison réservée', 'Accès camion difficile', 'Entrée de service / par l’arrière'];
  const LIV_HORAIRES = ['Matin (8 h – 12 h)', 'Midi (11 h – 13 h)', 'Après-midi (13 h – 17 h)', 'Soir (17 h – 20 h)', 'À préciser avec l’équipe'];
  function adresseLivraison(c) { const l = c.livraison || {}; return l.identique ? { adresse: c.adresse || '', cp: c.cp || '', ville: c.ville || '', horaire: l.horaire || '' } : { adresse: l.adresse || '', cp: l.cp || '', ville: l.ville || '', horaire: l.horaire || '' }; }
  function infosLivreurs(l) {
    if (!l) return '';
    const etage = l.niveau === 'En étage' ? `étage ${l.etage || '?'}${l.ascenseur ? ', ascenseur : ' + l.ascenseur.toLowerCase() : ''}` : l.niveau === 'Rez-de-chaussée' ? 'rez-de-chaussée' : '';
    const acc = (l.acces || []).map(a => (a === 'Digicode' && l.digicode ? 'digicode ' + l.digicode : a.toLowerCase()));
    const t = [l.logement, etage, ...acc, l.contact || l.contactTel ? 'contact sur place : ' + [l.contact, l.contactTel].filter(Boolean).join(' ') : '', l.remarque].filter(Boolean).join(' · ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  }
  function formLivraison(c) {
    const l = c.livraison || {}, radio = (nom, liste, cur) => liste.map(v => `<label class="lv-r"><input type="radio" name="${nom}" value="${esc(v)}"${cur === v ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('');
    const etage = l.niveau === 'En étage', digi = (l.acces || []).includes('Digicode');
    return `<fieldset class="df-fs lv-fs" data-lv><legend>🚚 Adresse de livraison</legend>
      <label class="check lv-id"><input type="checkbox" name="liv_identique"${l.identique ? ' checked' : ''}> Identique à l’adresse de facturation</label>
      <div class="lv-adr"${l.identique ? ' hidden' : ''}><label>Adresse<textarea name="liv_adresse" rows="2" placeholder="ex. 12 rue des Lilas, bâtiment B">${esc(l.adresse || '')}</textarea></label><div class="g2"><label>Code postal<input name="liv_cp" value="${esc(l.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="liv_ville" value="${esc(l.ville || '')}"></label></div></div>
      <label>🕐 Horaire de livraison<input name="liv_horaire" value="${esc(l.horaire || '')}" list="lvH" placeholder="ex. 18 h 30, ou choisir un créneau" autocomplete="off"><datalist id="lvH">${LIV_HORAIRES.map(h => `<option value="${esc(h)}">`).join('')}</datalist></label>
      <p class="pf-l">📦 Pour les livreurs</p>
      <div class="lv-l"><span class="lv-q">Type de lieu</span><div class="lv-rs">${radio('liv_logement', LIV_LOGEMENTS, l.logement)}</div></div>
      <div class="lv-l"><span class="lv-q">Niveau</span><div class="lv-rs">${radio('liv_niveau', ['Rez-de-chaussée', 'En étage'], l.niveau)}</div></div>
      <div class="g2 lv-et"${etage ? '' : ' hidden'}><label>Étage n°<input name="liv_etage" value="${esc(l.etage || '')}" inputmode="numeric" placeholder="ex. 3"></label><div class="lv-l"><span class="lv-q">Ascenseur</span><div class="lv-rs">${radio('liv_ascenseur', ['Oui', 'Non', 'Monte-charge'], l.ascenseur)}</div></div></div>
      <div class="pf-cases lv-acc">${LIV_ACCES.map(a => `<label class="pf-c"><input type="checkbox" name="_liv_acces" value="${esc(a)}"${(l.acces || []).includes(a) ? ' checked' : ''}><span>${esc(a)}</span></label>`).join('')}</div>
      <label class="lv-dg"${digi ? '' : ' hidden'}>Code du digicode<input name="liv_digicode" value="${esc(l.digicode || '')}" autocomplete="off"></label>
      <div class="g2"><label>Contact sur place <small class="muted">(si ce n’est pas le client)</small><input name="liv_contact" value="${esc(l.contact || '')}" placeholder="ex. Marie, la gardienne"></label><label>Son téléphone<input name="liv_contactTel" value="${esc(l.contactTel || '')}" inputmode="tel"></label></div>
      <label>Remarque pour les livreurs<textarea name="liv_remarque" rows="2" placeholder="ex. sonner au portail vert, se garer dans la cour, prévoir un diable…">${esc(l.remarque || '')}</textarea></label></fieldset>`;
  }
  /* cases qui s'ouvrent selon le choix : identique, en étage, digicode, client / prestataire */
  document.addEventListener('change', e => {
    const t = e.target, f = t.closest && t.closest('form'); if (!f) return;
    if (t.name === 'liv_identique') { const a = f.querySelector('.lv-adr'); if (a) a.hidden = t.checked; }
    if (t.name === 'liv_niveau') { const a = f.querySelector('.lv-et'); if (a) a.hidden = t.value !== 'En étage'; }
    if (t.name === '_liv_acces' && t.value === 'Digicode') { const a = f.querySelector('.lv-dg'); if (a) a.hidden = !t.checked; }
    if (t.name === 'genre') { const a = f.querySelector('.pf-presta'); if (a) a.hidden = t.value !== 'prestataire'; }
  });
  /* encadré « Livraison » de la fiche client */
  function boxLivraison(c) {
    const a = adresseLivraison(c), l = c.livraison || {}, info = infosLivreurs(l), adr = [a.adresse, [a.cp, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return `<section class="box lv-box"><div class="hc-th"><h2>🚚 Livraison</h2><button type="button" class="lnk" data-hedit>✏ ${adr || a.horaire || info ? 'Modifier' : 'Ajouter'}</button></div>${adr || a.horaire || info ? `${adr ? `<p><b>${esc(adr)}</b>${l.identique ? ' <small class="muted">(même adresse que la facturation)</small>' : ''}</p>` : '<p class="muted sm">Adresse de livraison non renseignée.</p>'}${a.horaire ? `<p class="sm">🕐 ${esc(a.horaire)}</p>` : ''}${info ? `<p class="sm lv-info">📦 ${esc(info)}</p>` : ''}` : '<p class="muted sm">Adresse, horaire et infos pour les livreurs (étage, ascenseur, digicode, stationnement…) : « Ajouter ».</p>'}</section>`;
  }
  const formClient = c => `${choixGenre(c)}<div class="g3 pf-id"><label>Civilité<select name="civilite"><option value="">—</option>${[['Mme', 'Madame'], ['M.', 'Monsieur']].map(([v, l]) => `<option value="${v}"${c.civilite === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>${(p => `<label>Prénom<input name="prenom" value="${esc(p.prenom)}" data-prenom placeholder="ex. Jean-Luc" autocomplete="off"></label><label>Nom<input name="nomFamille" value="${esc(p.nomFamille)}" required data-nomfam placeholder="ex. BERNARD" autocomplete="off"></label>`)(partiesNomClient(c))}</div><div class="g2"><label>Société <small class="muted">(reliée à sa fiche entreprise)</small><input name="societe" value="${esc(c.societe || '')}" list="entL" autocomplete="off" data-soc><datalist id="entL"></datalist></label><label>Fonction <small class="muted">(dans l’entreprise)</small><input name="fonction" value="${esc(c.fonction || '')}" placeholder="ex. assistante de direction"></label></div>${c.entrepriseId && !c.id ? `<input type="hidden" name="entrepriseId" value="${esc(c.entrepriseId)}">` : ''}<div class="g2"><label>E-mail<input type="email" name="email" value="${esc(c.email || '')}"></label><label>Téléphone<input name="tel" value="${esc(c.tel || '')}" inputmode="tel"></label></div><div class="g2"><label>Date de naissance <small class="muted">(rappel de son anniversaire)</small><input type="date" name="naissance" value="${esc(c.naissance || '')}" max="${new Date().toISOString().slice(0, 10)}"></label></div><fieldset class="df-fs lv-fs"><legend>🧾 Adresse de facturation</legend><label>Adresse<textarea name="adresse" rows="2">${esc(c.adresse || '')}</textarea></label><div class="g2"><label>Code postal<input name="cp" value="${esc(c.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="ville" value="${esc(c.ville || '')}"></label></div></fieldset>${formLivraison(c)}<label>🔒 Remarque <small class="muted">(visible seulement par l’équipe, jamais par le client)</small><textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label>${casesProfil(c)}<fieldset class="df-fs"><legend>E-mails et SMS d’information</legend><label class="check"><input type="checkbox" name="_accord"${c.consentement?.email ? ' checked' : ''}> A accepté de recevoir nos offres</label><label class="check"><input type="checkbox" name="_stopEmail"${c.desinscrit?.email ? ' checked' : ''}> Ne plus lui envoyer d’e-mails d’information</label><label class="check"><input type="checkbox" name="_stopSms"${c.desinscrit?.sms ? ' checked' : ''}> Ne plus lui envoyer de SMS d’information</label></fieldset>`;
  client.after = id => {
    $('#cf').addEventListener('submit', async e => {
      e.preventDefault(); const f = lireFormClient(e.target, cache.client || {});
      try {
        if (id === 'nouveau') { const r = await api(A + '/clients', { method: 'POST', body: { ...f, source: 'back-office', creeLe: new Date().toISOString(), derniereActivite: new Date().toISOString() } }); location.hash = f.entrepriseId ? '#/clients/entreprises/' + f.entrepriseId : '#/clients/' + r.id; }
        else { const cur = await api(A + '/clients/' + id); await api(`${A}/clients/${id}`, { method: 'PUT', body: { ...cur, ...f } }); toast('Fiche enregistrée.'); if (/[?&]edit=1/.test(location.hash)) location.hash = '#/clients/' + id; else render(); }
      } catch (err) { toast(err.message, true); }
    });
    $('[data-newdv]')?.addEventListener('click', async () => { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: { clientId: id } }); location.hash = '#/devis/' + r.id; });
    $('[data-newdvanc]')?.addEventListener('click', async () => { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: { clientId: id } }); location.hash = '#/devis/' + r.id + '?anciens=1'; });
    /* Société : propose les entreprises déjà enregistrées pendant la frappe */
    const soc = $('[data-soc]');
    soc?.addEventListener('input', () => { clearTimeout(soc._t); const v = soc.value.trim(); if (v.length < 2) return; soc._t = setTimeout(async () => { try { const r = await api(`${A}/entreprises?par=8&q=${encodeURIComponent(v)}`); $('#entL').innerHTML = r.items.map(e => `<option value="${esc(e.nom)}">${esc([e.ville, e.nbContacts ? e.nbContacts + ' contact' + (e.nbContacts > 1 ? 's' : '') : ''].filter(Boolean).join(' · '))}</option>`).join(''); } catch { /* */ } }, 200); });
    if (id === 'nouveau') return;
    $('[data-rqsave]')?.addEventListener('click', async () => {
      const t = $('[data-rq]').value.trim(), ok = $('[data-rqok]');
      try { const cur = await api(A + '/clients/' + id); await api(`${A}/clients/${id}`, { method: 'PUT', body: { ...cur, notes: t } }); cache.client = { ...cache.client, notes: t }; const n = $('#cf textarea[name=notes]'); if (n) n.value = t; ok.textContent = '✓ Enregistrée'; setTimeout(() => { ok.textContent = ''; }, 2500); } catch (err) { toast(err.message, true); }
    });
    const ed = $('#hcEdit');
    $$('[data-hedit]').forEach(b => b.addEventListener('click', () => { ed.hidden = false; ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => ed.querySelector('input[name=nom]')?.focus({ preventScroll: true }), 350); }));
    $$('[data-hcancel]').forEach(b => b.addEventListener('click', () => { ed.hidden = true; $('#cf').reset(); }));
    if (!ed.hidden) setTimeout(() => ed.querySelector('input[name=nom]')?.focus(), 50);
    $$('[data-anniv]').forEach(b => b.addEventListener('click', () => souhaiter(b.dataset.anniv, b.dataset.canal, () => render())));
    const rp = $('#hcRdv'), rf = $('#rdvf');
    $$('[data-hrdv]').forEach(b => b.addEventListener('click', () => { rp.hidden = false; rp.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $$('[data-rclose]').forEach(b => b.addEventListener('click', () => { rp.hidden = true; }));
    if (/[?&]rdv=1/.test(location.hash)) rp.hidden = false;
    brancherFormRdv(rf, id, () => render());
    $('.hc-rdvs').addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.rcopy) { try { await navigator.clipboard.writeText(t.dataset.rcopy); toast('Lien copié.'); } catch { prompt('Lien de la visio :', t.dataset.rcopy); } return; }
      try {
        if (t.dataset.rfait) { const r = await api(A + '/rdv/' + t.dataset.rfait); await api(A + '/rdv/' + r.id, { method: 'PUT', body: { ...r, fait: new Date().toISOString() } }); toast('Noté comme fait.'); render(); }
        if (t.dataset.rdel && confirm('Supprimer ce rendez-vous ? (le client n’est pas prévenu)')) { await api(A + '/rdv/' + t.dataset.rdel, { method: 'DELETE' }); toast('Rendez-vous supprimé.'); render(); }
      } catch (err) { toast(err.message, true); }
    });
    const recharger = async () => { const h = await api(A + '/actions/historique-client/' + id); cache.hist = h; cache.client = h.client; $('#hcList').innerHTML = friseClient(h.events); $('.hc-th .muted').textContent = h.events.length + ' événement' + (h.events.length > 1 ? 's' : ''); };
    const noter = async (type, texte) => { try { await api(`${A}/actions/client-journal/${id}`, { method: 'POST', body: { type, texte } }); await recharger(); return true; } catch (err) { toast(err.message, true); return false; } };
    $$('[data-hadd]').forEach(b => b.addEventListener('click', async () => { const ta = $('[data-hnote]'); if (await noter(b.dataset.hadd, ta.value.trim())) { ta.value = ''; toast(b.dataset.hadd === 'appel' ? 'Appel noté dans l’historique.' : 'Note ajoutée.'); } }));
    $('[data-happel]')?.addEventListener('click', () => { noter('appel', ''); });
    $('.hc-f').addEventListener('click', e => { const b = e.target.closest('[data-hf]'); if (!b) return; HF.f = b.dataset.hf; $$('.hc-f [data-hf]').forEach(x => x.classList.toggle('on', x === b)); $('#hcList').innerHTML = friseClient(cache.hist.events); });
    $('#hcList').addEventListener('click', async e => { const b = e.target.closest('[data-hdel]'); if (!b || !confirm('Supprimer cette note de l’historique ?')) return; try { await api(`${A}/actions/client-journal/${id}`, { method: 'POST', body: { supprimer: b.dataset.hdel } }); await recharger(); toast('Note supprimée.'); } catch (err) { toast(err.message, true); } });
  };

  /* ---------- catalogue ---------- */
  async function catalogue() {
    const [rubs, prods, lieuxL] = await Promise.all([api(A + '/rubriques'), api(A + '/produits'), api(A + '/lieux').catch(() => [])]);
    /* la rubrique « Lieux de réception » ne contient pas de produits : ses fiches sont dans le menu Lieux (compteur = lieux visibles, comme sur le site) */
    const nbLieux = lieuxL.filter(l => l.statut !== 'masque').length;
    const nbRub = slug => slug === 'lieux' ? nbLieux : prods.filter(p => dansRub(p, slug)).length;
    cache.rubriques = rubs.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); cache.produits = prods;
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('masques')) return pageMasques(rubs, prods);
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('sansmarge')) return pageSansMarge(rubs, prods);
    const r = new URLSearchParams(location.hash.split('?')[1] || '').get('r') || cache.catR || rubs[0]?.slug;
    cache.catR = r;
    const liste = masquesALaFin(prods.filter(p => dansRub(p, r)).sort(ordreSite));
    const rub = rubs.find(x => x.slug === r) || {};
    const titreCat = 'Catalogue' + pavesCat(prods, 'produits');
    return page(titreCat, '', `
      <div class="trouve"><label for="trouveQ">🔍 Trouver un produit <small>dans toutes les rubriques</small></label><input id="trouveQ" type="search" data-q placeholder="Tapez un nom : boudin, nems, champagne, serveur…" autocomplete="off"></div><div id="qres" hidden></div>
      <div class="catg"><nav class="rubs">${rubs.map(x => `<a href="#/catalogue?r=${x.slug}" class="${x.slug === r ? 'on' : ''}${x.statut === 'masque' ? ' hid' : ''}">${esc(x.nom)}<small>${nbRub(x.slug)}</small></a>`).join('')}<button class="lnk" data-newrub>+ Nouvelle rubrique</button></nav>
      <div><section class="box rubbox"><div class="bh"><h2>${esc(rub.nom || '')}</h2><a class="btn voir-site" href="/${esc(r)}?apercu=1" target="_blank">👁 Voir la présentation sur le site</a>${r === 'lieux' ? `<a class="btn" href="#/lieux">Gérer les ${nbLieux} lieux</a>` : `<button class="btn" data-new="${esc(r)}">+ Créer dans « ${esc(rub.nom || '')} »</button>`}</div>
        <form id="rf" class="g3"><label>Nom<input name="nom" value="${esc(rub.nom || '')}"></label><label>Accroche (sur la vignette)<input name="accroche" value="${esc(rub.accroche || '')}" placeholder="ex. Le monde entier à votre table"></label><label>Statut<select name="statut"><option value="visible">Visible</option><option value="masque"${rub.statut === 'masque' ? ' selected' : ''}>Masquée</option></select></label>
        <label class="span3">Texte d’introduction<textarea name="chapo" rows="2">${esc(rub.chapo || '')}</textarea></label>
        <label>Titre du paragraphe de présentation<input name="introTitre" value="${esc(rub.introTitre || '')}" placeholder="ex. Cocktails et buffets à la française"></label>
        <label class="span3">Paragraphe de présentation <small class="muted">(sous le bandeau, centré ; une ligne vide = nouveau paragraphe ; vide = rien)</small><textarea name="introTexte" rows="5">${esc(rub.introTexte || '')}</textarea></label>
        <details class="span3 landbox"><summary>Page d’atterrissage : titre et Google</summary><div class="g3"><label>Grand titre de la page<input name="titrePage" value="${esc(rub.titrePage || '')}" placeholder="${esc(rub.nom || '')}"></label></div>${seoBloc('rubrique', rub.seoTitre, rub.seoDescription)}</details>
        <div class="span3 phrow">${photoField('photoAccueil', rub.photoAccueil || rub.photo, 'Photo de la vignette')}<div class="row"><label>Ordre<input type="number" name="ordre" value="${rub.ordre ?? 0}" class="num"></label><label>TVA par défaut<select name="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+(rub.tva || 10) === t ? ' selected' : ''}>${t} %</option>`).join('')}</select></label><button class="btn ghost">Enregistrer la rubrique</button></div></div>
        <div class="span3 sousbox pliable" data-pli="sous"><div class="plihead"><h3>Spécialités <small class="muted">(${(rub.sous || []).length} · vignettes affichées avant les prestations, ex. Buffet libanais, Paëlla party)</small></h3><button type="button" class="btn ghost sm plibtn" data-plibtn></button></div><div class="plibody">
          <p class="muted sm">Sans spécialité, la rubrique affiche directement toutes ses prestations. Chaque prestation se range dans une spécialité depuis sa fiche (liste « Spécialité »).</p>
          <label class="stylev">Style des vignettes<select name="styleVignettes"><option value="carte"${(rub.styleVignettes || (rub.slug === 'saveurs-du-monde' ? 'carte' : 'photo')) === 'carte' ? ' selected' : ''}>Carte du monde (pays en doré)</option><option value="photo"${(rub.styleVignettes || (rub.slug === 'saveurs-du-monde' ? 'carte' : 'photo')) === 'photo' ? ' selected' : ''}>Photo de chaque spécialité</option></select></label>
          <div id="sous"></div><button type="button" class="btn ghost sm" data-addsous>+ Ajouter une spécialité</button></div></div></form></section>
      ${r === 'lieux' ? `<section class="box"><h2>Les lieux de réception <small class="muted">(${nbLieux} visibles sur le site${lieuxL.length > nbLieux ? `, ${lieuxL.length - nbLieux} masqué${lieuxL.length - nbLieux > 1 ? 's' : ''}` : ''})</small></h2><p class="muted">Les lieux ne sont pas des produits : chaque lieu a sa propre fiche (photos, capacité, type de lieu, événements…) dans le menu <b>Lieux</b>.</p><p><a class="btn" href="#/lieux">Gérer les lieux</a></p></section>` : ''}
      <section class="box pliable prodbox" data-pli="prods"${r === 'lieux' ? ' hidden' : ''}><div class="plihead"><h2>Produits à l’unité <small class="muted">(${liste.length})</small></h2><button type="button" class="btn ghost sm plibtn" data-plibtn></button></div><div class="plibody">
      <div class="row sousfiltre"><label class="pq">Rechercher une prestation<input type="search" data-pq placeholder="Tapez un nom : nems, mafé, paëlla…" autocomplete="off"></label><label class="vuebox">Présentation<select data-vue><option value="cartes">▦ En cartes (Kanban)</option><option value="liste">☰ En liste (prix, marge, fournisseur)</option></select></label>${(rub.sous || []).length ? `<label>Afficher<select data-sousf><option value="*">Toutes les prestations (${liste.length})</option>${[...rub.sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}">${esc(x.nom)} (${liste.filter(p => p.sous === x.slug).length})</option>`).join('')}<option value="">Sans spécialité (${liste.filter(p => !(rub.sous || []).some(x => x.slug === p.sous)).length})</option></select></label>` : ''}<label>Classement<select data-tri><option value="">Ordre du site</option><option value="az">Ordre alphabétique (A → Z)</option><option value="za">Ordre alphabétique (Z → A)</option><option value="p+">Prix croissant</option><option value="p-">Prix décroissant</option></select></label><label>Visibilité<select data-vis><option value="">Tous les produits (${liste.length})</option><option value="visible">Produits visibles (${liste.filter(p => p.statut !== 'masque').length})</option><option value="masque">Produits masqués (${liste.filter(p => p.statut === 'masque').length})</option></select></label><span class="muted sm" data-pqn></span></div>
      <div class="plist" id="plist">${liste.map(prowSel).join('') || '<p class="muted">Aucune prestation dans cette rubrique.</p>'}</div></div></section></div></div>`);
  }
  /* Pavés vert foncé à droite du titre « Catalogue » : chacun est un lien (même classe .nbcat pour les suivants) */
  /* marge moyenne (Jean-Luc 2026-11-25) : moyenne simple des marges en % du prix de vente HT des produits visibles qui ont une marge
     (prix de vente et prix d'achat, achat inférieur à la vente) ; masqués et « sans marge » exclus. Même TVA sur vente et achat : % HT = (vente − achat) / vente */
  const paveMoy = prods => {
    const L = prods.filter(p => p.statut !== 'masque' && p.prixCents > 0 && p.coutCents != null && p.coutCents < p.prixCents);
    if (!L.length) return '';
    const moy = L.reduce((t, p) => t + (p.prixCents - p.coutCents) / p.prixCents, 0) / L.length * 100;
    return `<span class="nbcat nbmoy" data-pave="moyenne" title="Marge moyenne sur ${L.length} produit${L.length > 1 ? 's' : ''} visible${L.length > 1 ? 's' : ''} avec prix d’achat (masqués et sans marge non comptés), en % du prix de vente HT"><b>${moy.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</b><small>marge moyenne</small></span>`;
  };
  const pavesCat = (prods, actif) => {
    const nbVis = prods.filter(p => p.statut !== 'masque').length, nbMasq = prods.length - nbVis, nbSM = prods.filter(sansMarge).length, s = n => n > 1 ? 's' : '';
    const pave = (k, href, n, mot, titre) => `<a class="nbcat${actif === k ? ' on' : ''}" data-pave="${k}" href="${href}" title="${titre}"><b>${n.toLocaleString('fr-FR')}</b><small>${mot}</small></a>`;
    return `<span class="nbpaves">${pave('produits', '#/catalogue', nbVis, 'produit' + s(nbVis), `${nbVis} produit${s(nbVis)} visible${s(nbVis)} sur le site · ${prods.length} au total`)}${pave('masques', '#/catalogue?masques=1', nbMasq, 'masqué' + s(nbMasq), `Voir les ${nbMasq} fiche${s(nbMasq)} masquée${s(nbMasq)} et pourquoi`)}${pave('marge', '#/catalogue?sansmarge=1', nbSM, 'sans marge', `${nbSM} produit${s(nbSM)} visible${s(nbSM)} sans prix d’achat : leur marge ne peut pas être calculée`)}${paveMoy(prods)}</span>`;
  };
  /* produits sans marge (Jean-Luc, 2026-11-25) : visibles, avec un prix de vente, mais sans prix d'achat (ou vendus à perte) */
  /* ligne de la liste « sans marge » : la fiche (lien) + saisie directe du prix d'achat et du fournisseur (Jean-Luc, 2026-11-25) */
  /* liste des fournisseurs de la saisie rapide : ordre alphabétique, un nouveau fournisseur s'ajoute aussitôt à toutes les lignes */
  let SMF = [];
  const trierF = L => [...new Set(L.map(x => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  const smfOptions = sel => `<option value="">Fournisseur (facultatif)</option>${SMF.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="__nouveau">✚ Nouveau fournisseur…</option>`;
  const fgestHtml = () => SMF.map(x => `<span class="fchip" data-fg="${esc(x)}" title="Tapez deux fois pour supprimer">${esc(x)}<button type="button" data-fgdel aria-label="Supprimer ${esc(x)}">×</button></span>`).join('') || '<span class="muted sm">Aucun fournisseur pour l’instant.</span>';
  const smLigne = p => `<div class="smrow" data-smid="${esc(p.id || p.slug)}">${prowSel(p)}${peut('prix') ? `<span class="sm-saisie"><input data-smcout inputmode="decimal" placeholder="Prix d’achat HT €" aria-label="Prix d’achat HT de ${esc(titreTexte(p.titre))}"><select data-smf aria-label="Fournisseur">${smfOptions('')}</select><input data-smfnew placeholder="Nom du nouveau fournisseur" hidden><button type="button" class="btn sm" data-smok title="Enregistrer dans la fiche">✓</button></span>` : ''}</div>`;
  const majFgest = () => { const g = $('[data-fgest]'); if (g) g.innerHTML = fgestHtml(); const n = $('[data-fgn]'); if (n) n.textContent = `(${SMF.length})`; $$('[data-smf]').forEach(s => { const v = SMF.includes(s.value) || s.value === '__nouveau' ? s.value : ''; s.innerHTML = smfOptions(v); }); };
  const supprimerFournisseur = async nom => {
    let n = 0; try { n = (await api(A + '/actions/fournisseurs/compter?nom=' + encodeURIComponent(nom))).n; } catch { /* compte indisponible : on demande quand même */ }
    if (!confirm(`Voulez-vous supprimer le fournisseur « ${nom} » ?\n\nIl sera retiré de la liste${n ? (n === 1 ? ' et de la fiche qui l’utilise' : ` et des ${n} fiches qui l’utilisent`) + ' (leurs prix d’achat ne changent pas)' : ''}.`)) return;
    try { const r = await api(A + '/actions/fournisseurs/supprimer', { method: 'POST', body: { nom } }); SMF = SMF.filter(x => x !== nom); cache.produits = null; majFgest(); toast(`Fournisseur « ${nom} » supprimé${r.fiches ? ` (retiré de ${r.fiches} fiche${r.fiches > 1 ? 's' : ''})` : ''}.`); }
    catch (err) { toast(err.message, true); }
  };
  const apresSansMarge = () => {
    $('[data-acok]')?.addEventListener('click', async e => {
      const [rubrique, sous] = ($('[data-accat]').value || '|').split('|'), pct = +String($('[data-acpct]').value).replace(',', '.').trim(), remplacer = $('[data-acrempl]').checked;
      if (!rubrique) return toast('Choisissez une catégorie.', true);
      if (!(pct > 0 && pct < 100)) return toast('Tapez le pourcentage, par exemple 40.', true);
      const cat = $('[data-accat]').selectedOptions[0].textContent;
      if (!confirm(`Calculer le prix d’achat de ${cat} ?\n\nPrix d’achat HT = prix de vente HT − ${String(pct).replace('.', ',')} %.${remplacer ? '\nLes prix d’achat déjà tapés seront remplacés.' : '\nSeules les fiches sans prix d’achat sont touchées.'}`)) return;
      e.target.disabled = true;
      try { const r = await api(A + '/actions/achats/categorie', { method: 'POST', body: { rubrique, sous, pct, remplacer } }); cache.produits = null; toast(`✓ Prix d’achat calculé sur ${r.fiches} fiche${r.fiches > 1 ? 's' : ''}.`); setTimeout(() => location.reload(), 1200); }
      catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
    $('[data-fcf]')?.addEventListener('change', e => { const n = $('[data-fcfnew]'); n.hidden = e.target.value !== '__nouveau'; if (!n.hidden) n.focus(); });
    $('[data-fcok]')?.addEventListener('click', async e => {
      const [rubrique, sous] = ($('[data-fccat]').value || '|').split('|'), fs = $('[data-fcf]').value;
      const nom = (fs === '__nouveau' ? $('[data-fcfnew]').value : fs).trim(), pctTxt = $('[data-fcpct]').value.trim(), pct = pctTxt ? +pctTxt.replace(',', '.') : 0;
      if (!rubrique) return toast('Choisissez une catégorie.', true);
      if (!nom) return toast('Choisissez ou tapez le fournisseur.', true);
      if (pctTxt && !(pct > 0 && pct < 1000)) return toast('Le pourcentage doit être un nombre, par exemple 30.', true);
      const cat = $('[data-fccat]').selectedOptions[0].textContent;
      if (!confirm(`Mettre le fournisseur « ${nom} » sur ${cat} ?${pct ? `\n\nLes fiches sans prix d’achat recevront : prix de vente ÷ ${(1 + pct / 100).toLocaleString('fr-FR')}.` : ''}`)) return;
      e.target.disabled = true;
      try { const r = await api(A + '/actions/fournisseurs/appliquer', { method: 'POST', body: { nom, rubrique, sous, pct } }); cache.produits = null; toast(`✓ « ${nom} » mis sur ${r.fiches} fiche${r.fiches > 1 ? 's' : ''}${r.couts ? ` · prix d’achat calculé sur ${r.couts} fiche${r.couts > 1 ? 's' : ''}` : ''}.`); setTimeout(() => location.reload(), 1200); }
      catch (err) { toast(err.message, true); e.target.disabled = false; }
    });
    /* recherche pendant la frappe : nom du produit, accents et majuscules ignorés */
    const sansA = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let smCat = '';
    /* catégories en accordéon (Jean-Luc, 2026-11-25) : toutes fermées à l'arrivée, un clic ouvre / referme ;
       pendant une recherche ou sur un bouton de catégorie, celles qui ont des résultats s'ouvrent seules */
    const ouvrir = (sec, on) => { sec.classList.toggle('ouvert', on); $('[data-smtog]', sec)?.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    $$('[data-smtog]').forEach(t => t.addEventListener('click', () => { const sec = t.closest('[data-smrub]'); ouvrir(sec, !sec.classList.contains('ouvert')); }));
    const filtrer = () => {
      const mots = sansA($('[data-smq]')?.value).split(/\s+/).filter(Boolean); let n = 0;
      $$('.smrow').forEach(r => { const ok = (!smCat || r.closest('[data-smrub]')?.dataset.smrub === smCat) && mots.every(m => sansA(r.querySelector('.prow b')?.textContent).includes(m)); r.hidden = !ok; if (ok) n++; });
      $$('[data-smrub]').forEach(sec => { sec.hidden = !$$('.smrow', sec).some(r => !r.hidden); ouvrir(sec, !sec.hidden && (!!mots.length || !!smCat)); });
      $('[data-smqn]').textContent = mots.length || smCat ? (n ? `${n} produit${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''}` : 'Aucun produit sans marge ne correspond.') : '';
    };
    $('[data-smq]')?.addEventListener('input', filtrer);
    $$('[data-smcat]').forEach(b => b.addEventListener('click', () => { smCat = b.dataset.smcat; $$('[data-smcat]').forEach(x => x.classList.toggle('ghost', x !== b)); filtrer(); }));
    /* « taper deux fois » : détecté à la main (l'iPhone n'envoie pas toujours le double-clic) */
    let dernier = { el: null, t: 0 };
    $('[data-fgest]')?.addEventListener('click', e => { const c = e.target.closest('[data-fg]'); if (!c || e.target.closest('[data-fgdel]')) return; const now = Date.now(); if (dernier.el === c && now - dernier.t < 450) { dernier = { el: null, t: 0 }; supprimerFournisseur(c.dataset.fg); } else dernier = { el: c, t: now }; });
    $('[data-fgest]')?.addEventListener('click', e => { const b = e.target.closest('[data-fgdel]'); if (b) supprimerFournisseur(b.closest('[data-fg]').dataset.fg); });
    const enreg = async row => {
      const ci = $('[data-smcout]', row), fi = $('[data-smf]', row), fn = $('[data-smfnew]', row), b = $('[data-smok]', row);
      const cout = toCents(ci.value), f = (fi.value === '__nouveau' ? fn.value : fi.value).trim();
      if (cout == null) { ci.focus(); toast('Tapez le prix d’achat HT, par exemple 4,50.', true); return; }
      b.disabled = true;
      try {
        const id = row.dataset.smid, p = await api(A + '/produits/' + id);
        const fourn = [...new Set([...(p.fournisseurs || []), ...(p.fournisseur ? [p.fournisseur] : [])])];
        if (f && !fourn.some(x => x.toLowerCase() === f.toLowerCase())) fourn.unshift(f);
        const coutTtc = achatTtc(cout, p.tva ?? 10);
        await api(`${A}/produits/${id}`, { method: 'PUT', body: { ...p, coutCents: coutTtc, fournisseurs: fourn, fournisseur: undefined } });
        cache.produits = null;
        if (f && !SMF.some(x => x.toLowerCase() === f.toLowerCase())) { SMF = trierF([...SMF, f]); $$('[data-smf]').forEach(s => { const v = s === fi ? f : s.value; s.innerHTML = smfOptions(v); if (s === fi) { fn.hidden = true; fn.value = ''; } }); majFgest(); }
        if (coutTtc >= (p.prixCents ?? Infinity)) { b.disabled = false; toast('Enregistré, mais le prix d’achat est au-dessus du prix de vente : le produit reste dans la liste (vendu à perte).', true); return; }
        const box = row.closest('section'), suiv = row.nextElementSibling || row.previousElementSibling;
        row.classList.add('sm-ok');
        setTimeout(() => {
          row.parentNode.removeChild(row);
          const n = $$('.smrow', box).length; const sm = box.querySelector('h2 small'); if (sm) sm.textContent = `(${n})`; if (!n) box.parentNode.removeChild(box);
          const tot = $$('.smrow').length; const pv = $('[data-pave="marge"] b'); if (pv) pv.textContent = tot.toLocaleString('fr-FR'); const h = $('.smbox h2 small'); if (h) h.textContent = `(${tot})`; const bc = box.dataset.smrub != null && $(`[data-smcat="${CSS.escape(box.dataset.smrub)}"] b`); if (bc) bc.textContent = n; const bt = $('[data-smcat=""] b'); if (bt) bt.textContent = tot;
          const nx = suiv && suiv.isConnected ? $('[data-smcout]', suiv) : $('[data-smcout]'); nx?.focus();
        }, 350);
        toast('✓ Prix d’achat enregistré dans la fiche.');
      } catch (err) { b.disabled = false; toast(err.message, true); }
    };
    $('.content').addEventListener('click', e => { const b = e.target.closest('[data-smok]'); if (b) enreg(b.closest('.smrow')); });
    $('.content').addEventListener('change', e => { const s = e.target.closest('[data-smf]'); if (!s) return; const n = $('[data-smfnew]', s.closest('.smrow')); n.hidden = s.value !== '__nouveau'; if (!n.hidden) n.focus(); });
    $('.content').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.sm-saisie')) { e.preventDefault(); enreg(e.target.closest('.smrow')); } });
  };
  /* liste des catégories (rubriques et leurs sous-catégories) avec leur nombre de fiches */
  const fcatOptions = (rubs, prods) => '<option value="">Choisir une catégorie…</option>' + rubs.map(r => {
    const P = prods.filter(p => p.rubrique === r.slug); if (!P.length) return '';
    return `<option value="${esc(r.slug)}|">${esc(r.nom)} — toute la rubrique (${P.length})</option>` + (r.sous || []).map(so => { const n = P.filter(p => p.sous === so.slug).length; return n ? `<option value="${esc(r.slug)}|${esc(so.slug)}">${esc(r.nom)} › ${esc(so.nom)} (${n})</option>` : ''; }).join('');
  }).join('');
  function pageSansMarge(rubs, prods) {
    SMF = trierF(prods.flatMap(x => [...(x.fournisseurs || []), ...(x.fournisseur ? [x.fournisseur] : [])]));
    const L = prods.filter(sansMarge), nomRub = sl => rubs.find(x => x.slug === sl)?.nom || sl || 'Sans rubrique';
    const groupes = [...new Set(L.map(p => p.rubrique))].sort((a, b) => rubs.findIndex(x => x.slug === a) - rubs.findIndex(x => x.slug === b));
    const smCats = [['', L.length, 'Tout'], ...groupes.map(g => [g, L.filter(p => p.rubrique === g).length, nomRub(g)])];
    return page('Catalogue' + pavesCat(prods, 'marge'), `<a class="btn ghost" href="#/catalogue">← Retour au catalogue</a>${peut('prix') ? '<a class="btn" href="#/achats">⬆ Importer les prix d’achat (Excel)</a>' : ''}`, `
      <section class="box smbox"><h2>Produits sans marge <small class="muted">(${L.length})</small></h2><p class="muted">Produits visibles sur le site qui ont un prix de vente mais <b>pas de prix d’achat</b> (ou un prix d’achat supérieur au prix de vente) : leur marge ne peut pas être calculée sur les devis. Tapez le prix d’achat <b>HT</b> dans la case à droite (et le fournisseur si vous voulez), puis <b>Entrée</b> ou ✓ : la fiche est enregistrée et le produit disparaît de la liste. Vous pouvez aussi importer votre tableau Excel.</p></section>
      ${peut('prix') ? `<section class="box fourn-gest"><h2>Vos fournisseurs <small class="muted" data-fgn>(${SMF.length})</small></h2><p class="muted sm">Classés par ordre alphabétique. Pour supprimer un fournisseur, <b>tapez deux fois dessus</b> (ou sur ×) : il est retiré de la liste et de toutes les fiches qui l’utilisent.</p><div class="fourn-chips" data-fgest>${fgestHtml()}</div>
        <details class="fcat"><summary>➕ Mettre un fournisseur sur toute une catégorie</summary>
          <p class="muted sm">Par exemple tout le Buffet indien d’un coup. Le fournisseur est ajouté en premier (principal) sur chaque fiche ; les autres fournisseurs de la fiche sont gardés. 🔒 Jamais montré au client.</p>
          <div class="fcat-row"><label>Catégorie<select data-fccat>${fcatOptions(rubs, prods)}</select></label>
          <label>Fournisseur<select data-fcf>${smfOptions('')}</select><input data-fcfnew placeholder="Nom du nouveau fournisseur" hidden></label>
          <label>Prix d’achat des fiches qui n’en ont pas <small>(facultatif)</small><span class="fcat-pct">= prix de vente ÷ (1 + <input data-fcpct inputmode="decimal" placeholder="30" aria-label="Pourcentage ajouté par Magnolia"> %)</span></label></div>
          <p class="muted sm">Laissez le pourcentage vide pour ne toucher à aucun prix d’achat. Avec 30 %, une fiche vendue 13 € reçoit un prix d’achat de 10 € (même TVA des deux côtés, donc le calcul vaut en HT comme en TTC). Les prix d’achat déjà tapés ne changent jamais.</p>
          <button type="button" class="btn" data-fcok>Appliquer à la catégorie</button></details>
        <details class="fcat"><summary>🧮 Calculer le prix d’achat de toute une catégorie</summary>
          <p class="muted sm">Le prix d’achat est calculé à partir du prix de vente de chaque fiche. Les prix de vente ne changent pas. 🔒 Jamais montré au client.</p>
          <div class="fcat-row"><label>Catégorie<select data-accat>${fcatOptions(rubs, prods)}</select></label>
          <label>Calcul<span class="fcat-pct">Prix d’achat HT = prix de vente HT − <input data-acpct inputmode="decimal" placeholder="40" aria-label="Pourcentage retiré"> %</span></label></div>
          <label class="chk"><input type="checkbox" data-acrempl checked> Remplacer aussi les prix d’achat déjà tapés dans ces fiches</label>
          <p class="muted sm">Exemple avec 40 % : une fiche vendue 22,00 € TTC (20,00 € HT) reçoit un prix d’achat de 12,00 € HT.</p>
          <button type="button" class="btn" data-acok>Calculer sur la catégorie</button></details></section>` : ''}
      <section class="box sm-rech"><div class="sm-cats" role="tablist">${smCats.map(([g, n, nom]) => `<button type="button" class="btn sm${g ? ' ghost' : ''}" data-smcat="${esc(g)}">${esc(nom)} <b>${n}</b></button>`).join('')}</div><label>🔎 Rechercher un produit sans marge<input type="search" data-smq placeholder="Tapez un nom : colombo, champagne, nappe…" autocomplete="off"></label><p class="muted sm" data-smqn></p></section>
      ${groupes.map(g => `<section class="box sm-acc" data-smrub="${esc(g)}"><h2><button type="button" class="sm-tog" data-smtog aria-expanded="false"><span>${esc(nomRub(g))} <small class="muted">(${L.filter(p => p.rubrique === g).length})</small></span><i aria-hidden="true">▾</i></button></h2><div class="plist smlist">${L.filter(p => p.rubrique === g).map(smLigne).join('')}</div></section>`).join('') || '<section class="box"><p class="ok">✓ Tous les produits visibles ont un prix d’achat.</p></section>'}`);
  }
  /* Fiches masquées de tout le catalogue (clic sur « + N masqués ») : raison du masquage, Modifier, Rendre visible */
  const raisonMasque = (p, prods) => {
    if (p.fusionneDans) { const g = prods.find(x => (x.id || x.slug) === p.fusionneDans || x.slug === p.fusionneDans); return { k: 'doublon', t: `Doublon : regroupé avec « ${g ? titreTexte(g.titre) : p.fusionneDans} »` }; }
    if (p.masqueCave) return { k: 'cave', t: 'Ancienne boisson, remplacée lors de la refonte de La cave de Magnolia' };
    if (p.sous === 'buffet-chinois' && p.rangement === 'divers') return { k: 'chinois', t: 'Retiré des « Produits divers » du buffet chinois' };
    const manque = [!p.photos?.length && 'pas de photo', p.prixCents == null && 'pas de prix'].filter(Boolean);
    return { k: 'main', t: 'Masqué dans sa fiche (à la main ou à la création)' + (manque.length ? ' · ' + manque.join(', ') : '') };
  };
  const RAISONS_M = [['doublon', 'Doublons'], ['cave', 'Anciennes boissons'], ['chinois', 'Divers du buffet chinois'], ['main', 'Masqués dans leur fiche']];
  function pageMasques(rubs, prods) {
    const L = prods.filter(p => p.statut === 'masque').map(p => ({ p, r: raisonMasque(p, prods) }));
    const nomRub = sl => rubs.find(x => x.slug === sl)?.nom || sl || 'Sans rubrique';
    const rang = sl => { const i = rubs.findIndex(x => x.slug === sl); return i < 0 ? 999 : i; };
    const groupes = [...new Set(L.map(x => x.p.rubrique))].sort((a, b) => rang(a) - rang(b));
    const ligne = ({ p, r }) => `<div class="mrow" data-mk="${r.k}" data-mid="${esc(p.id || p.slug)}">${pchk(p)}${p.photos?.[0]?.src ? `<img src="${esc(p.photos[0].src)}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span class="mtx"><b>${titreHtml(p.titre)}</b><small>${p.prixCents == null ? 'Sur devis' : euros(p.prixCents) + (p.unite ? ' / ' + esc(p.unite) : '')}</small><em class="mwhy mw-${r.k}">${esc(r.t)}</em></span><span class="mact"><a class="btn ghost sm" href="#/catalogue/${esc(p.id || p.slug)}">✏ Modifier la fiche</a><button type="button" class="btn sm" data-mvis>👁 Rendre visible</button></span></div>`;
    return page('Catalogue' + pavesCat(prods, 'masques'), `<a class="btn ghost" href="#/catalogue">← Retour au catalogue</a>`, `
      <section class="box"><h2>Fiches masquées</h2><p class="muted">Ces fiches existent dans le back-office mais <b>ne s’affichent pas sur le site</b>. La raison est écrite en couleur sous chaque nom. « Rendre visible » la remet aussitôt sur le site ; « Modifier la fiche » ouvre la fiche complète. Pour <b>supprimer</b> des fiches, cochez leur petit carré (ou un filtre puis « Tout cocher »).</p>
      <div class="row mfil"><button type="button" class="btn sm on" data-mf="">Toutes (${L.length})</button>${RAISONS_M.map(([k, t]) => { const n = L.filter(x => x.r.k === k).length; return n ? `<button type="button" class="btn ghost sm" data-mf="${k}">${t} (${n})</button>` : ''; }).join('')}</div></section>
      ${groupes.map(g => `<section class="box mgrp"><h2>${esc(nomRub(g))} <small class="muted">(${L.filter(x => x.p.rubrique === g).length})</small></h2><div class="mlist">${L.filter(x => x.p.rubrique === g).map(ligne).join('')}</div></section>`).join('') || '<section class="box"><p class="muted">Aucune fiche masquée : tout le catalogue est visible.</p></section>'}`);
  }
  const apresMasques = () => {
    $$('[data-mf]').forEach(b => b.addEventListener('click', () => {
      $$('[data-mf]').forEach(x => { x.classList.toggle('on', x === b); x.classList.toggle('ghost', x !== b); });
      $$('.mrow').forEach(r => { r.hidden = !!b.dataset.mf && r.dataset.mk !== b.dataset.mf; });
      $$('.mgrp').forEach(g => { g.hidden = !$$('.mrow', g).some(r => !r.hidden); });
    }));
    $('.content').addEventListener('click', async e => {
      const b = e.target.closest('[data-mvis]'); if (!b) return;
      const row = b.closest('.mrow'), id = row.dataset.mid;
      if (row.dataset.mk === 'doublon' && !confirm('Cette fiche est un doublon d’une autre fiche déjà visible. La rendre visible quand même ?')) return;
      b.disabled = true;
      try {
        const p = await api(A + '/produits/' + id);
        await api(`${A}/produits/${id}`, { method: 'PUT', body: { ...p, statut: 'visible' } });
        cache.produits = null; row.classList.add('mok'); b.outerHTML = '<span class="pill d-accepte">Visible sur le site</span>';
        toast('Fiche visible sur le site.');
      } catch (err) { b.disabled = false; toast(err.message, true); }
    });
  };
  /* ---------- import des prix d'achat et fournisseurs (Excel de Jean-Luc) ---------- */
  async function achats() {
    return page('Importer les prix d’achat', '<a class="btn ghost" href="#/catalogue?sansmarge=1">← Produits sans marge</a>', `
      <section class="box"><h2>1. Votre fichier Excel</h2>
        <p>Un tableau avec <b>une ligne par produit</b> et ces colonnes (dans n’importe quel ordre) : <b>Produit</b> (le nom), <b>Prix d’achat</b>, <b>Fournisseur</b>. La première ligne contient les titres.</p>
        <div class="g2"><label>Les prix d’achat du fichier sont<select id="ach-ht"><option value="1">HT (hors taxes)</option><option value="">TTC</option></select></label></div>
        <label class="imp-drop" id="achDrop"><input type="file" id="achFile" accept=".xlsx,.csv,.txt" hidden><b>📄 Cliquez ici ou glissez le fichier</b><small>Excel (.xlsx) ou CSV · rien n’est enregistré avant votre validation</small></label>
        <p class="muted sm">🔒 Prix d’achat et fournisseurs restent internes : jamais montrés aux clients (site, devis, e-mails).</p></section>
      <section class="box" id="achRes" hidden></section>`);
  }
  achats.after = () => {
    let L = [];
    const etiq = { exact: ['ok', '✓ Trouvé'], proche: ['proche', '≈ Nom proche, à vérifier'], douteux: ['douteux', '? Peu sûr, à vérifier'], introuvable: ['manq', '✗ Introuvable'] };
    const dessiner = () => {
      const n = k => L.filter(x => x.statut === k).length, coches = L.filter(x => x.coche && x.slug).length;
      $('#achRes').hidden = false;
      $('#achRes').innerHTML = `<div class="bh"><h2>2. Vérifiez le rapprochement <small class="muted">(${L.length} lignes)</small></h2></div>
        <p class="ach-res"><span class="pill d-accepte">${n('exact')} trouvés</span> <span class="pill ach-p">${n('proche') + n('douteux')} à vérifier</span> <span class="pill d-refuse">${n('introuvable')} introuvables</span></p>
        <div class="row"><button type="button" class="btn ghost sm" data-achtout="proche">Cocher aussi les ${n('proche')} « nom proche »</button><button type="button" class="btn ghost sm" data-achtout="">Tout décocher</button><label class="chk sm"><input type="checkbox" data-achmasq${L.masq ? ' checked' : ''}> Masquer les introuvables</label></div>
        <p class="muted sm">Les lignes cochées seront enregistrées. Pour une ligne « à vérifier » ou « introuvable », choisissez la bonne fiche dans la liste (tapez pour chercher), ou laissez décoché.</p>
        <div class="table"><table class="lines ach"><thead><tr><th></th><th>Ligne</th><th>Dans votre fichier</th><th class="n">Prix d’achat <small>(fichier)</small></th><th>Fournisseur</th><th>Fiche du catalogue</th></tr></thead><tbody>${L.map((x, i) => `<tr class="st-${x.statut}"${L.masq && x.statut === 'introuvable' ? ' hidden' : ''}><td><input type="checkbox" data-ck="${i}"${x.coche ? ' checked' : ''}${x.slug ? '' : ' disabled'}></td><td class="muted">${x.ligne}</td><td><b>${esc(x.nom)}</b><br><small class="ach-e ${etiq[x.statut][0]}">${etiq[x.statut][1]}</small>${x.alerte ? `<br><small class="ach-e manq">⚠ ${esc(x.alerte)}</small>` : ''}${x.doublon ? `<br><small class="ach-e proche">⚠ ${x.doublon} lignes visent cette fiche : la dernière cochée l’emporte</small>` : ''}</td><td class="n">${x.achatIllisible ? '<span class="neg">illisible</span>' : x.achatCents == null ? '—' : euros(x.achatCents)}</td><td>${esc(x.fournisseur || '—')}</td>
          <td><input list="ach-dl" data-fi="${i}" value="${esc(x.slug ? titreTexte((cache.produits.find(p => p.slug === x.slug) || {}).titre || x.titre || '') : '')}" placeholder="Choisir une fiche…" class="wide">${(() => { const p = x.slug && cache.produits.find(y => y.slug === x.slug); return p ? `<small class="muted">sur le site : ${p.prixCents == null ? 'sur devis' : euros(p.prixCents) + ' TTC' + (p.unite ? ' / ' + esc(p.unite) : '')}</small>` : ''; })()}</td></tr>`).join('')}</tbody></table></div>
        <datalist id="ach-dl">${cache.produits.map(p => `<option value="${esc(titreTexte(p.titre))}">`).join('')}</datalist>
        <div class="actions sticky"><button class="btn" data-achok${coches ? '' : ' disabled'}>Enregistrer ${coches} fiche${coches > 1 ? 's' : ''}</button><span class="muted sm">Fiches déjà remplies : le prix d’achat et le fournisseur du fichier remplacent les anciens.</span></div>`;
    };
    const envoyer = async f => {
      if (!f) return; const fd = new FormData(); fd.append('fichier', f);
      $('#achDrop b').textContent = '⏳ Lecture de « ' + f.name + ' »…';
      try {
        if (!cache.produits) cache.produits = await api(A + '/produits');
        const r = await api(A + '/actions/import-achats/analyser', { method: 'POST', form: fd });
        L = r.lignes.map(x => ({ ...x, coche: x.statut === 'exact' && !x.achatIllisible && !x.alerte }));
        if (r.ht) { $('#ach-ht').value = '1'; toast('Les prix de votre fichier sont hors taxes (comparés aux prix du site) : ils seront convertis en TTC.'); }
        dessiner(); $('#achRes').scrollIntoView({ behavior: 'smooth' });
      } catch (e) { toast(e.message, true); }
      $('#achDrop b').textContent = '📄 Cliquez ici ou glissez un autre fichier';
    };
    $('#achFile').addEventListener('change', e => envoyer(e.target.files[0]));
    const dz = $('#achDrop'); dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); }); dz.addEventListener('dragleave', () => dz.classList.remove('on'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('on'); envoyer(e.dataTransfer.files[0]); });
    $('#achRes').addEventListener('change', e => {
      const ck = e.target.dataset.ck, fi = e.target.dataset.fi;
      if (ck != null) { L[+ck].coche = e.target.checked; dessiner(); }
      if (fi != null) { const p = cache.produits.find(x => titreTexte(x.titre) === e.target.value.trim()); const x = L[+fi]; if (p) { x.slug = p.slug; x.titre = p.titre; x.coche = !x.achatIllisible; } else { x.slug = null; x.coche = false; } dessiner(); }
    });
    $('#achRes').addEventListener('click', async e => {
      const t = e.target.closest('[data-achtout]');
      if (t) { for (const x of L) x.coche = t.dataset.achtout ? (x.coche || (x.statut === 'proche' && !x.alerte && !x.achatIllisible)) : false; dessiner(); return; }
      if (e.target.closest('[data-achmasq]')) { L.masq = e.target.checked; dessiner(); return; }
      if (!e.target.closest('[data-achok]')) return;
      const lignes = L.filter(x => x.coche && x.slug).map(x => ({ slug: x.slug, nom: x.nom, achatCents: x.achatIllisible ? null : x.achatCents, fournisseur: x.fournisseur, tva: x.tvaFichier }));
      try { const r = await api(A + '/actions/import-achats/appliquer', { method: 'POST', body: { lignes, ht: !!$('#ach-ht').value } }); cache.produits = null; toast(`✓ ${r.maj} fiche${r.maj > 1 ? 's' : ''} mise${r.maj > 1 ? 's' : ''} à jour.${r.erreurs.length ? ' ' + r.erreurs.join(' ') : ''}`, !!r.erreurs.length); location.hash = '#/catalogue?sansmarge=1'; }
      catch (err) { toast(err.message, true); }
    });
  };
  const LIEUX_CARTE = [['espagne', 'Espagne'], ['portugal', 'Portugal'], ['italie', 'Italie'], ['grece', 'Grèce'], ['france', 'France'], ['liban', 'Liban'], ['turquie', 'Turquie'], ['maghreb', 'Maghreb (Maroc, Algérie, Tunisie)'], ['maroc', 'Maroc'], ['algerie', 'Algérie'], ['tunisie', 'Tunisie'], ['afrique', 'Afrique (tout le continent)'], ['senegal', 'Sénégal'], ['cote-d-ivoire', 'Côte d’Ivoire'], ['cameroun', 'Cameroun'], ['congo', 'Congo'], ['antilles', 'Antilles'], ['reunion', 'La Réunion'], ['polynesie', 'Polynésie'], ['mexique', 'Mexique'], ['bresil', 'Brésil'], ['perou', 'Pérou'], ['argentine', 'Argentine'], ['etats-unis', 'États-Unis'], ['inde', 'Inde'], ['chine', 'Chine'], ['japon', 'Japon'], ['coree', 'Corée'], ['vietnam', 'Vietnam'], ['thailande', 'Thaïlande']];
  const fournisseursConnus = () => [...new Set((cache.produits || []).flatMap(x => [...(x.fournisseurs || []), ...(x.fournisseur ? [x.fournisseur] : [])]).map(x => String(x).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  const sansMarge = p => p.statut !== 'masque' && p.prixCents != null && (p.coutCents == null || p.coutCents >= p.prixCents);
  /* produits visibles d'abord, masqués à la fin, en gardant l'ordre choisi dans chaque groupe (Jean-Luc 2026-11-25) */
  /* un produit est dans une rubrique par sa rubrique principale ou par « Aussi dans ces rubriques » (Jean-Luc 2026-11-25 : Mobilier et matériel à la location) */
  const dansRub = (p, r) => p.rubrique === r || (p.autresRubriques || []).includes(r);
  const masquesALaFin = L => [...L.filter(p => p.statut !== 'masque'), ...L.filter(p => p.statut === 'masque')];
  const ordreSite = (a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0);
  const prow = p => `<a class="prow${p.statut === 'masque' ? ' hid' : ''}" href="#/catalogue/${p.id || p.slug}">${p.photos?.[0]?.src ? `<img src="${esc(p.photos[0].src)}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span><b>${titreHtml(p.titre)}</b><small>${p.prixCents == null ? 'Sur devis' : euros(p.prixCents) + (p.unite ? ' / ' + esc(p.unite) : '')}${p.min > 1 ? ' · min. ' + p.min : ''}</small></span><span class="pill ${p.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${p.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${cache.catR && p.rubrique !== cache.catR && (p.autresRubriques || []).includes(cache.catR) ? `<span class="pill" title="Fiche rangée dans « ${esc(nomRubAdmin(p.rubrique))} », affichée aussi ici (« Aussi dans ces rubriques »)">↪ ${esc(nomRubAdmin(p.rubrique))}</span>` : ''}${p.maison ? '<span class="pill" title="Réglage « Ordre sur le site » de la fiche : produit affiché en premier">★ En premier sur le site</span>' : ''}${sansMarge(p) ? `<span class="pill smpill">${p.coutCents == null ? 'Prix d’achat manquant' : 'Vendu à perte'}</span>` : ''}${p.sous ? `<span class="pill">${esc(((cache.rubriques || []).find(r => r.slug === p.rubrique)?.sous || []).find(x => x.slug === p.sous)?.nom || '')}</span>` : ''}</a>`;
  /* cases à cocher devant chaque produit + « 🗑 Supprimer » groupé, barre en bas d'écran (Jean-Luc 2026-11-25).
     La sélection est vidée à chaque changement d'écran ; « ↶ Annuler » remet les fiches juste après. */
  const nomRubAdmin = slug => (cache.rubriques || []).find(r => r.slug === slug)?.nom || slug;
  const PSEL = new Set();
  let psDernier = null;
  const pchk = p => peut('produits') ? `<label class="pchk" title="Cocher pour supprimer"><input type="checkbox" data-psel="${esc(p.id || p.slug)}"${PSEL.has(p.id || p.slug) ? ' checked' : ''} aria-label="Cocher « ${esc(titreTexte(p.titre))} »"></label>` : '';
  const prowSel = p => peut('produits') ? `<div class="psrow${PSEL.has(p.id || p.slug) ? ' on' : ''}">${pchk(p)}${prow(p)}</div>` : prow(p);
  function majPsBar() {
    let b = $('#psbar');
    if (!b) { b = document.createElement('div'); b.id = 'psbar'; b.className = 'psbar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Produits cochés'); document.body.appendChild(b); b.addEventListener('click', psClic); }
    const enCat = /^#\/catalogue(\?|$)/.test(location.hash || '');
    const n = PSEL.size, s = n > 1 ? 's' : '';
    if (n && enCat) b.innerHTML = `<b>${n} produit${s} coché${s}</b><span class="psbtns"><button type="button" class="btn ghost sm" data-psall>☑ Tout cocher</button><button type="button" class="btn ghost sm" data-psnone>Décocher</button><button type="button" class="btn sm psdel" data-psdel>🗑 Supprimer ${n > 1 ? 'les ' + n : 'ce produit'}</button></span>`;
    else if (psDernier && enCat) b.innerHTML = `<b>${psDernier.n} produit${psDernier.n > 1 ? 's' : ''} supprimé${psDernier.n > 1 ? 's' : ''}</b><span class="psbtns"><button type="button" class="btn sm" data-psundo>↶ Annuler</button><button type="button" class="btn ghost sm" data-psfin>OK</button></span>`;
    b.hidden = !((n || psDernier) && enCat);
    document.body.classList.toggle('avec-psbar', !b.hidden);
  }
  async function psClic(e) {
    if (e.target.closest('[data-psall]')) { $$('[data-psel]').filter(x => !x.closest('[hidden]')).forEach(x => { x.checked = true; PSEL.add(x.dataset.psel); x.closest('.psrow, .qrow, .mrow')?.classList.add('on'); }); return majPsBar(); }
    if (e.target.closest('[data-psnone]')) { PSEL.clear(); $$('[data-psel]').forEach(x => { x.checked = false; x.closest('.psrow, .qrow, .mrow')?.classList.remove('on'); }); return majPsBar(); }
    if (e.target.closest('[data-psfin]')) { psDernier = null; return majPsBar(); }
    if (e.target.closest('[data-psundo]')) {
      try { const r = await api(`${A}/actions/produits/supprimer/${encodeURIComponent(psDernier.lot)}/remettre`, { method: 'POST' }); psDernier = null; cache.produits = null; toast(`${r.remis} produit${r.remis > 1 ? 's' : ''} remis dans le catalogue.`); render(); } catch (err) { toast(err.message, true); }
      return;
    }
    if (e.target.closest('[data-psdel]')) {
      let ids = [...PSEL]; if (!ids.length) return;
      /* dans une rubrique, un produit qui n'y est qu'« aussi » (rangé ailleurs) en est seulement retiré : il reste dans sa rubrique */
      const enCat = /^#\/catalogue(\?|$)/.test(location.hash || '') && cache.catR;
      const lies = enCat ? ids.filter(id => { const p = (cache.produits || []).find(x => (x.id || x.slug) === id); return p && p.rubrique !== cache.catR && (p.autresRubriques || []).includes(cache.catR); }) : [];
      if (lies.length) {
        const nomR = nomRubAdmin(cache.catR), nl = lies.length;
        if (!confirm(`Retirer ${nl > 1 ? 'ces ' + nl + ' produits' : 'ce produit'} de « ${nomR} » ?\n\n${lies.slice(0, 12).map(id => '• ' + titreTexte((cache.produits || []).find(p => (p.id || p.slug) === id)?.titre || id)).join('\n')}\n\n${nl > 1 ? 'Ils ne sont' : 'Il n’est'} pas ${nl > 1 ? 'supprimés' : 'supprimé'} : ${nl > 1 ? 'ils restent' : 'il reste'} dans ${nl > 1 ? 'leur' : 'sa'} rubrique d’origine.`)) return;
        try {
          for (const id of lies) { const p = await api(A + '/produits/' + encodeURIComponent(id)); await api(`${A}/produits/${encodeURIComponent(id)}`, { method: 'PUT', body: { ...p, autresRubriques: (p.autresRubriques || []).filter(x => x !== cache.catR) } }); PSEL.delete(id); }
          toast(`${nl} produit${nl > 1 ? 's' : ''} retiré${nl > 1 ? 's' : ''} de « ${nomR} ».`);
        } catch (err) { toast(err.message, true); return; }
        ids = ids.filter(id => !lies.includes(id));
        if (!ids.length) { cache.produits = null; majPsBar(); render(); return; }
      }
      const noms = ids.map(id => titreTexte((cache.produits || []).find(p => (p.id || p.slug) === id)?.titre || id));
      const n = ids.length;
      if (!confirm(`Supprimer définitivement ${n > 1 ? 'ces ' + n + ' produits' : 'ce produit'} ?\n\n${noms.slice(0, 12).map(x => '• ' + x).join('\n')}${n > 12 ? `\n… et ${n - 12} autre${n - 12 > 1 ? 's' : ''}` : ''}\n\n${n > 1 ? 'Ils disparaissent' : 'Il disparaît'} du site et du back-office, et ne ${n > 1 ? 'reviendront' : 'reviendra'} pas. Les devis déjà faits ne changent pas.\nVous pourrez annuler juste après avec « ↶ Annuler ».`)) return;
      try {
        const r = await api(A + '/actions/produits/supprimer', { method: 'POST', body: { ids } });
        PSEL.clear(); psDernier = { lot: r.lot, n: r.supprimes }; cache.produits = null;
        toast(`${r.supprimes} produit${r.supprimes > 1 ? 's' : ''} supprimé${r.supprimes > 1 ? 's' : ''}.`);
        render();
      } catch (err) { toast(err.message, true); }
    }
  }
  document.addEventListener('change', e => {
    const x = e.target.closest?.('[data-psel]'); if (!x) return;
    if (x.checked) PSEL.add(x.dataset.psel); else PSEL.delete(x.dataset.psel);
    x.closest('.psrow, .qrow, .mrow')?.classList.toggle('on', x.checked);
    majPsBar();
  });
  addEventListener('hashchange', () => { PSEL.clear(); majPsBar(); });
  /* bouton « 🗑 Supprimer ce produit » en haut de la fiche : même suppression, puis retour au catalogue avec « ↶ Annuler » */
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-psdelfiche]'); if (!b) return;
    const p = cache.p || {};
    if (!confirm(`Supprimer définitivement « ${titreTexte(p.titre || b.dataset.psdelfiche)} » ?\n\nIl disparaît du site et du back-office, et ne reviendra pas. Les devis déjà faits ne changent pas.\nVous pourrez annuler juste après avec « ↶ Annuler ».`)) return;
    try {
      const r = await api(A + '/actions/produits/supprimer', { method: 'POST', body: { ids: [b.dataset.psdelfiche] } });
      psDernier = { lot: r.lot, n: r.supprimes }; cache.produits = null;
      toast('Produit supprimé.');
      location.hash = '#/catalogue?r=' + encodeURIComponent(p.rubrique || cache.catR || '');
    } catch (err) { toast(err.message, true); }
  });
  catalogue.after = () => {
    majPsBar();
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('masques')) return apresMasques();
    if (new URLSearchParams(location.hash.split('?')[1] || '').get('sansmarge')) return apresSansMarge();
    /* 🔍 Trouver un produit : toutes les rubriques, sans accents ni majuscules, tous les mots tapés ; la recherche est gardée au retour d'une fiche */
    const sansAccQ = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nomRubQ = p => { const r = (cache.rubriques || []).find(x => x.slug === p.rubrique); const so = (r?.sous || []).find(x => x.slug === p.sous); return (r?.nom || p.rubrique || '') + (so ? ' › ' + so.nom : ''); };
    /* chiffres visibles directement sur chaque résultat (Jean-Luc 2026-11-25) : fournisseur(s), prix de vente TTC, achat HT, marge HT € et % ; case vide si la donnée manque */
    /* chiffres de chaque résultat (Jean-Luc 2026-11-25) : fournisseur, vente TTC, achat HT, marge HT € et % (vide si la donnée manque) ;
       avec le droit « prix », fournisseur / vente / achat se modifient sur place (Entrée ou ✓), marge recalculée en direct */
    const fournQ = p => [...new Set([...(p.fournisseurs || []), ...(p.fournisseur ? [p.fournisseur] : [])])].map(x => String(x).trim()).filter(Boolean);
    const margeQ = (vTtc, aHt, tva) => {
      const vHt = vTtc == null ? null : Math.round(vTtc / (1 + (+tva || 10) / 100));
      const m = vHt != null && aHt != null ? vHt - aHt : null, pc = m != null && vHt ? Math.round(1000 * m / vHt) / 10 : null;
      return { html: m == null ? '' : `${euros(m)} <i>${String(pc).replace('.', ',')} %</i>`, cls: m == null ? '' : m < 0 ? ' qc-neg' : ' qc-pos' };
    };
    const qchif = p => {
      const f = fournQ(p), aHt = achatHt(p.coutCents, p.tva), mg = margeQ(p.prixCents, aHt, p.tva);
      const c = (lab, val, cls = '') => `<span class="qc${cls}"><small>${lab}</small><b>${val}</b></span>`;
      if (!peut('prix')) return `<span class="qchif">${c('Fournisseur', esc(f.join(', ')), ' qc-f')}${c('Vente TTC', p.prixCents == null ? '' : euros(p.prixCents))}${c('Achat HT', aHt == null ? '' : euros(aHt))}${c('Marge HT', mg.html, mg.cls)}</span>`;
      const connus = fournisseursConnus();
      return `<span class="qchif qedit"><label class="qc qc-f"><small>Fournisseur</small><select data-qf><option value="">—</option>${[...new Set([...f, ...connus])].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })).map(x => `<option${x === f[0] ? ' selected' : ''}>${esc(x)}</option>`).join('')}<option value="__nouveau">✚ Nouveau fournisseur…</option></select><input data-qfnew placeholder="Nom du fournisseur" hidden></label>`
        + `<label class="qc"><small>Vente TTC €</small><input data-qv inputmode="decimal" value="${fromCents(p.prixCents)}" placeholder="—"></label>`
        + `<label class="qc"><small>Achat HT €</small><input data-qa inputmode="decimal" value="${fromCents(aHt)}" placeholder="—"></label>`
        + `<span class="qc${mg.cls}" data-qm><small>Marge HT</small><b>${mg.html}</b></span></span>`;
    };
    const qrow = p => `<div class="qrow${p.statut === 'masque' ? ' hid' : ''}${PSEL.has(p.id || p.slug) ? ' on' : ''}" data-qid="${esc(p.id || p.slug)}">${pchk(p)}<a class="qlien" href="#/catalogue/${esc(p.id || p.slug)}">${p.photos?.[0]?.src ? `<img src="${esc(p.photos[0].src)}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span class="qtx"><b>${titreHtml(p.titre)}</b><small>${p.unite ? 'par ' + esc(p.unite) : ''}${p.min > 1 ? ' · min. ' + p.min : ''}</small><span class="qrub">📂 ${esc(nomRubQ(p))}</span></span></a>${qchif(p)}<span class="pill ${p.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${p.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${peut('prix') ? '<button type="button" class="btn sm qok" data-qok hidden>✓ Enregistrer</button>' : ''}<a class="btn sm" href="#/catalogue/${esc(p.id || p.slug)}">✏ Ouvrir la fiche</a></div>`;
    const qProd = row => (cache.produits || []).find(x => (x.id || x.slug) === row.dataset.qid);
    const qMaj = row => {
      const p = qProd(row) || {}, v = toCents($('[data-qv]', row).value), a = toCents($('[data-qa]', row).value), mg = margeQ(v, a, p.tva), m = $('[data-qm]', row);
      m.className = 'qc' + mg.cls; $('b', m).innerHTML = mg.html;
      row.classList.add('qmod'); $('[data-qok]', row).hidden = false;
    };
    const qEnreg = async row => {
      const b = $('[data-qok]', row), vi = $('[data-qv]', row), ai = $('[data-qa]', row), fs = $('[data-qf]', row), fn = $('[data-qfnew]', row);
      const v = toCents(vi.value), a = ai.value.trim() ? toCents(ai.value) : null, f = (fs.value === '__nouveau' ? fn.value : fs.value).trim();
      if (v == null) { vi.focus(); toast('Tapez le prix de vente TTC, par exemple 12,90.', true); return; }
      if (ai.value.trim() && a == null) { ai.focus(); toast('Prix d’achat HT incorrect : tapez par exemple 4,50.', true); return; }
      b.disabled = true;
      try {
        const id = row.dataset.qid, p = await api(A + '/produits/' + id), avant = fournQ(p);
        /* seuls le prix de vente, le prix d'achat et le premier fournisseur changent ; le reste de la fiche est repris tel quel */
        const fourn = f ? [f, ...avant.slice(1).filter(x => x.toLowerCase() !== f.toLowerCase())] : avant.slice(1);
        const next = { ...p, prixCents: v, coutCents: achatTtc(a, p.tva ?? 10), fournisseurs: fourn, fournisseur: undefined };
        await api(`${A}/produits/${id}`, { method: 'PUT', body: next });
        const c = qProd(row); if (c) Object.assign(c, { prixCents: next.prixCents, coutCents: next.coutCents, fournisseurs: fourn, fournisseur: undefined });
        { const pm = $('[data-pave="moyenne"]'); if (pm) pm.outerHTML = paveMoy(cache.produits || []); }
        row.classList.remove('qmod'); row.classList.add('qsave'); setTimeout(() => row.classList.remove('qsave'), 1200);
        b.hidden = true; b.disabled = false;
        if (fs.value === '__nouveau') { fs.insertAdjacentHTML('afterbegin', `<option>${esc(f)}</option>`); fs.value = f; fn.hidden = true; fn.value = ''; }
        toast('✓ Enregistré dans la fiche.');
      } catch (err) { b.disabled = false; toast(err.message, true); }
    };
    $('.content').addEventListener('input', e => { const r = e.target.closest('.qrow'); if (r && e.target.matches('[data-qv], [data-qa], [data-qfnew]')) qMaj(r); });
    $('.content').addEventListener('change', e => { const s = e.target.closest('[data-qf]'); if (!s) return; const r = s.closest('.qrow'), n = $('[data-qfnew]', r); n.hidden = s.value !== '__nouveau'; if (!n.hidden) n.focus(); qMaj(r); });
    $('.content').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.qedit')) { e.preventDefault(); qEnreg(e.target.closest('.qrow')); } });
    $('.content').addEventListener('click', e => { const b = e.target.closest('[data-qok]'); if (b) qEnreg(b.closest('.qrow')); });
    const chercher = () => {
      const brut = $('[data-q]').value, q = sansAccQ(brut).trim();
      try { sessionStorage.setItem('mg-trouve', brut); } catch { /* */ }
      $('.catg').hidden = !!q; $('#qres').hidden = !q;
      if (!q) return;
      const mots = q.split(/\s+/);
      const L = masquesALaFin(cache.produits.filter(p => { const t = sansAccQ(titreTexte(p.titre) + ' ' + p.slug + ' ' + (p.extrait || '')); return mots.every(m => t.includes(m)); }).sort((a, b) => String(titreTexte(a.titre)).localeCompare(String(titreTexte(b.titre)), 'fr', { sensitivity: 'base' })));
      $('#qres').innerHTML = `<p class="qnb">${L.length ? `<b>${L.length}</b> produit${L.length > 1 ? 's' : ''} trouvé${L.length > 1 ? 's' : ''} pour « ${esc(brut.trim())} » — cliquez pour ouvrir la fiche` : `Aucun produit ne contient « ${esc(brut.trim())} ». Essayez un seul mot, ou une autre orthographe.`}</p><div class="qlist">${L.map(qrow).join('')}</div>`;
    };
    $('[data-q]').addEventListener('input', chercher);
    try { const m = sessionStorage.getItem('mg-trouve'); if (m) { $('[data-q]').value = m; chercher(); } } catch { /* */ }
    $('[data-new]')?.addEventListener('click', async e => {
      const titre = prompt('Nom de la nouvelle prestation ?'); if (!titre) return;
      const r = await api(A + '/produits', { method: 'POST', body: { titre, rubrique: e.target.dataset.new, prixCents: null, unite: 'personne', min: 1, statut: 'masque', tva: (cache.rubriques.find(x => x.slug === e.target.dataset.new) || {}).tva || 10 } });
      toast('Créée (masquée tant que vous ne la rendez pas visible).'); location.hash = '#/catalogue/' + r.id;
    });
    $('[data-newrub]').addEventListener('click', async () => { const nom = prompt('Nom de la nouvelle rubrique ?'); if (!nom) return; const r = await api(A + '/rubriques', { method: 'POST', body: { nom } }); location.hash = '#/catalogue?r=' + r.id; });
    const rubC = cache.rubriques.find(x => x.slug === cache.catR) || {};
    let sous = [...(rubC.sous || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => ({ ...x }));
    const slugDe = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
    const nbSous = sl => cache.produits.filter(p => p.rubrique === cache.catR && p.sous === sl).length;
    const lireSous = () => $$('#sous .sousrow').forEach((row, i) => { const x = sous[i]; x.nom = $('[data-n]', row).value; x.pays = $('[data-pays]', row).value; x.statut = $('[data-st]', row).value; x.carte = $('[data-carte]', row).value; x.photo = $('input[type=hidden]', row).value; x.bandeauPhoto = $(`input[name=bp${i}]`, row)?.value || ''; for (const k of ['titrePage', 'chapo', 'bouton', 'seoTitre', 'seoDescription', 'introTitre', 'introTexte']) x[k] = $(`[data-k=${k}]`, row).value.trim(); x.parSections = !!$('[data-ps]', row).value; x.titresSections = Object.fromEntries($$('[data-ts]', row).map(e => [e.dataset.ts, e.value.trim()]).filter(e => e[1])); });
    const drawSous = () => {
      $('#sous').innerHTML = sous.map((x, i) => `<div class="sousrow" data-i="${i}">${photoField('sp' + i, x.photo, 'Photo')}<div class="sousf"><label>Nom<input data-n value="${esc(x.nom || '')}"></label><label>Pays ou région (petit titre doré)<input data-pays value="${esc(x.pays || '')}" placeholder="Liban"></label><label>Pays sur la carte<select data-carte><option value="">Automatique (d’après « Pays ou région »)</option>${LIEUX_CARTE.map(([k, t]) => `<option value="${k}"${x.carte === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><label>Statut<select data-st><option value="visible">Visible</option><option value="masque"${x.statut === 'masque' ? ' selected' : ''}>Masquée</option></select></label>
        <p class="sm muted">${nbSous(x.slug)} prestation(s) · adresse : <a href="/${esc(cache.catR)}/${esc(x.slug || '')}" target="_blank">/${esc(cache.catR)}/${esc(x.slug || '…')} ↗</a> (à donner à l’agence pour la publicité Google)</p>${x.slug ? `<a class="btn ghost sm voir-site" href="/${esc(cache.catR)}/${esc(x.slug)}?apercu=1" target="_blank">👁 Voir la présentation sur le site</a>` : ''}
        <details class="landbox"><summary>Page d’atterrissage : bandeau et Google</summary>
          <div class="landf">${photoField('bp' + i, x.bandeauPhoto || '', 'Photo du bandeau (vide = photo de la vignette)')}<div>
          <label>Grand titre de la page<input data-k="titrePage" value="${esc(x.titrePage || '')}" placeholder="${esc(x.nom || '')}"></label>
          <label>Texte du bandeau<textarea data-k="chapo" rows="4">${esc(x.chapo || '')}</textarea></label>
          <label>Texte du bouton<input data-k="bouton" value="${esc(x.bouton || '')}" placeholder="Voir les propositions"></label>
          ${seoBloc('sous', x.seoTitre, x.seoDescription, ` data-slug="${esc(x.slug || '')}"`, true)}</div></div></details>
        <details class="landbox"><summary>Paragraphe de présentation (avant « Nos buffets »)</summary>
          <label>Titre<input data-k="introTitre" value="${esc(x.introTitre || '')}" placeholder="ex. Le goût du partage"></label>
          <label>Texte <small class="muted">(vide = pas de paragraphe)</small><textarea data-k="introTexte" rows="5">${esc(x.introTexte || '')}</textarea></label></details>
        <details class="landbox"><summary>Présentation des prestations</summary>
          <label>Présentation<select data-ps><option value="">Une seule liste (recherche et tri)</option><option value="1"${x.parSections ? ' selected' : ''}>En sections : Nos buffets, puis entrées, plats, desserts et divers à l’unité</option></select></label>
          <p class="muted sm">La section de chaque prestation se choisit dans sa fiche (liste « Section »). Une section vide ne s’affiche pas. Titres des sections :</p>
          <div class="g3">${[['animations', 'Nos animations'], ['corbeilles', 'Nos corbeilles de fruits'], ['pieces-montees', 'Nos pièces montées'], ['buffets', 'Nos buffets'], ['mezzes-froids', 'Nos mezzés froids à l’unité'], ['mezzes-chauds', 'Nos mezzés chauds à l’unité'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['fromages', 'Nos fromages'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité'], ['location', 'En location'], ['champagne', 'Notre champagne'], ['eaux', 'Les eaux'], ['sodas', 'Sodas'], ['jus', 'Jus de fruits'], ['vins-rouges', 'Vins rouges'], ['vins-blancs', 'Vins blancs'], ['vins-roses', 'Vin rosé'], ['alcools-forts', 'Alcools forts'], ['bars', 'Open bars & cocktails'], ['accessoires', 'Accessoires'], ['musique-live', 'Musique & DJ'], ['son-lumiere', 'Son, lumière & écrans'], ['spectacles', 'Artistes & spectacles'], ['jeux', 'Jeux & animations'], ['enfants', 'Pour les enfants'], ['souvenirs', 'Photos & souvenirs'], ['arts-table', 'Vaisselle & verres'], ['mobilier', 'Tables, chaises & nappes'], ['materiel', 'Matériel de cuisine']].map(([k, t]) => `<input data-ts="${k}" value="${esc((x.titresSections || {})[k] || '')}" placeholder="${t}" aria-label="${t}">`).join('')}</div></details><div class="row"><button type="button" class="btn ghost sm" data-up ${i ? '' : 'disabled'}>↑ Monter</button><button type="button" class="btn ghost sm" data-down ${i < sous.length - 1 ? '' : 'disabled'}>↓ Descendre</button><button type="button" class="btn ghost sm ph-del" data-delsous>🗑 Supprimer</button></div></div></div>`).join('') || '<p class="muted sm">Aucune spécialité pour cette rubrique.</p>';
      bindPhotos($('#sous'));
    };
    drawSous();
    $('#sous').addEventListener('click', e => {
      const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i;
      if (e.target.closest('[data-up]')) { lireSous(); [sous[i - 1], sous[i]] = [sous[i], sous[i - 1]]; drawSous(); }
      if (e.target.closest('[data-down]')) { lireSous(); [sous[i + 1], sous[i]] = [sous[i], sous[i + 1]]; drawSous(); }
      if (e.target.closest('[data-delsous]')) { const n = nbSous(sous[i].slug); if (!confirm(`Supprimer la spécialité « ${sous[i].nom} » ?\n\n${n ? n + ' prestation(s) restent dans la rubrique, sans spécialité. ' : ''}Pensez à enregistrer.`)) return; lireSous(); sous.splice(i, 1); drawSous(); }
    });
    $('[data-addsous]').addEventListener('click', () => { const nom = prompt('Nom de la spécialité ? (ex. Buffet grec)'); if (!nom) return; lireSous(); let sl = slugDe(nom), k = 2; while (sous.some(x => x.slug === sl)) sl = slugDe(nom) + '-' + k++; sous.push({ slug: sl, nom, pays: '', photo: '', statut: 'visible' }); drawSous(); toast('Ajoutée : choisissez sa photo, puis enregistrez.'); });
    const sansAcc = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtrer = () => {
      const v = $('[data-sousf]')?.value ?? '*', q = sansAcc($('[data-pq]').value).trim();
      let L = cache.produits.filter(p => dansRub(p, cache.catR) && (v === '*' || (v ? p.sous === v : !sous.some(x => x.slug === p.sous))) && (!q || q.split(/\s+/).every(m => sansAcc(p.titre + ' ' + p.slug).includes(m))));
      const tri = $('[data-tri]').value, vis = $('[data-vis]').value;
      if (vis) L = L.filter(p => (p.statut === 'masque') === (vis === 'masque'));
      const nom = (a, b) => String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' });
      if (tri === 'az') L.sort(nom); else if (tri === 'za') L.sort((a, b) => nom(b, a)); else if (!tri) L.sort(ordreSite);
      else if (tri === 'p+' || tri === 'p-') L.sort((a, b) => (a.prixCents == null) - (b.prixCents == null) || (tri === 'p-' ? -1 : 1) * ((a.prixCents || 0) - (b.prixCents || 0)) || nom(a, b));
      L = masquesALaFin(L);
      /* présentation en cartes (Kanban) ou en liste avec fournisseur, vente, achat et marge modifiables (Jean-Luc 2026-11-25) */
      const enListe = $('[data-vue]')?.value === 'liste';
      $('#plist').className = enListe ? 'qlist' : 'plist';
      $('#plist').innerHTML = L.map(enListe ? qrow : prowSel).join('') || '<p class="muted">Aucune prestation ne correspond.</p>';
      $('[data-pqn]').textContent = q || vis ? `${L.length} résultat${L.length > 1 ? 's' : ''}` : '';
    };
    $('[data-sousf]')?.addEventListener('change', filtrer);
    /* blocs repliables (Spécialités, Produits à l'unité) : le choix est retenu dans ce navigateur */
    const memo = (k, v) => { try { if (v === undefined) return localStorage.getItem('mg-' + k); localStorage.setItem('mg-' + k, v); } catch { return null; } };
    $$('.pliable').forEach(b => {
      const k = 'pli-' + b.dataset.pli, btn = $('[data-plibtn]', b);
      const pose = ferme => { b.classList.toggle('ferme', ferme); btn.textContent = ferme ? '▾ Afficher' : '▴ Masquer'; btn.setAttribute('aria-expanded', String(!ferme)); };
      pose(memo(k) ? memo(k) === '1' : b.dataset.pli === 'sous');
      btn.addEventListener('click', () => { const f = !b.classList.contains('ferme'); pose(f); memo(k, f ? '1' : '0'); });
      $('.plihead h2, .plihead h3', b).addEventListener('click', () => btn.click());
    });
    const triM = memo('tri-prods'); if (triM) $('[data-tri]').value = triM;
    if (memo('vue-prods') === 'liste') $('[data-vue]').value = 'liste';
    if (triM || memo('vue-prods') === 'liste') filtrer();
    $('[data-vue]').addEventListener('change', e => { memo('vue-prods', e.target.value); filtrer(); });
    $('[data-tri]').addEventListener('change', e => { memo('tri-prods', e.target.value); filtrer(); });
    $('[data-vis]').addEventListener('change', filtrer);
    $('[data-pq]').addEventListener('input', filtrer);
    $('[data-pq]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const a = $('#plist a.prow'); if (a) location.hash = a.getAttribute('href'); } });
    bindPhotos($('#rf'));
    $('#rf').addEventListener('submit', async e => {
      e.preventDefault(); lireSous(); const f = Object.fromEntries(new FormData(e.target)); const rub = cache.rubriques.find(x => x.slug === cache.catR);
      for (const k of Object.keys(f)) if (/^(sp|bp)\d+$/.test(k)) delete f[k];
      const next = { ...rub, ...f, picto: undefined, ordre: +f.ordre, tva: +f.tva, sous: sous.map((x, i) => ({ ...x, nom: String(x.nom || '').trim() || 'Sans nom', ordre: i })), sousInit: true };
      await api(`${A}/rubriques/${cache.catR}`, { method: 'PUT', body: next }); Object.assign(rub, next); toast('Rubrique enregistrée : en ligne immédiatement.'); drawSous();
    });
  };

  /* champ photo : aperçu, envoi depuis l'ordinateur ou le téléphone, ou choix dans la médiathèque */
  /* vignette de galerie (fiche, lieu) : photo, badge « Principale », boutons visibles */
  const vigGalerie = (src, i, alt) => `<figure class="ph${i === 0 ? ' main' : ''}" draggable="true" data-i="${i}"><div class="ph-img"><img src="${esc(src)}" alt="">${i === 0 ? '<span class="ph-badge">★ Photo principale</span>' : ''}</div>
    <div class="ph-act">${i ? '<button type="button" data-main title="Mettre en photo principale">★ Principale</button>' : ''}<button type="button" class="ph-del" data-rm title="Supprimer de la galerie">🗑 Supprimer</button></div>${alt === undefined ? '' : `<input value="${esc(alt || '')}" placeholder="Description (Google)" data-alt>`}</figure>`;
  const confirmerRetrait = () => confirm('Supprimer cette photo de la galerie ?\n\nElle reste dans la médiathèque. Pensez à enregistrer.');
  function photoField(name, val, label) {
    const quoi = /attente/i.test(label) ? 'l’image' : /vid[ée]o/i.test(label) ? 'la vidéo' : 'la photo';
    const apercu = v => v ? (/\.mp4$/i.test(v) ? `<video src="${esc(v)}" muted></video>` : `<img src="${esc(v)}" alt="">`) : `<span>Aucune · cliquez pour choisir</span>`;
    return `<div class="pf" data-pf data-quoi="${quoi}"><span class="lab">${esc(label)}</span><button type="button" class="pf-img" data-pf-open title="Modifier ${quoi}">${apercu(val)}<span class="pf-over">✎ Modifier ${quoi}</span></button><input type="hidden" name="${name}" value="${esc(val || '')}">
      <div class="pf-act"><button type="button" class="btn sm" data-pf-open>✎ Modifier ${quoi}</button><div class="pf-menu" hidden><label class="pf-opt">💻 Depuis mon ordinateur<input type="file" accept="image/*,video/mp4" hidden></label><button type="button" class="pf-opt" data-pick>🖼 Depuis la médiathèque</button><button type="button" class="pf-opt pf-del" data-clear>✕ Retirer ${quoi}</button></div></div><p class="pf-note" hidden>${quoi === 'la vidéo' ? 'Vidéo changée' : 'Photo changée'} : pensez à <b>enregistrer</b>.</p></div>`;
  }
  async function uploadFile(file) {
    const fd = new FormData(); fd.append('fichier', await compress(file));
    const r = await api(A + '/actions/upload', { method: 'POST', form: fd });
    return r.url;
  }
  /* photos réduites à 2000 px avant l'envoi (téléphones : 12 Mo → 500 Ko) */
  async function compress(file) {
    /* photos iPhone (HEIC) : converties ici quand le navigateur sait les lire (Safari), sinon message clair */
    const heic = /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
    if (heic) {
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
        if (blob) return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      } catch {}
      throw new Error('photo au format HEIC (iPhone) que ce navigateur ne sait pas lire. Ouvrez-la dans Aperçu > Fichier > Exporter en JPEG, ou envoyez-la depuis Safari ou l’iPhone.');
    }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600e3) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.85));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : file;
    } catch { return file; }
  }
  /* grille de médias : vignettes carrées avec le nom du fichier, affichées par paquets de 120 au fil du défilement */
  const nomFichier = u => decodeURIComponent(u.split('/').pop()).replace(/(\.\w+)\.\1$/, '$1');
  /* vignette : le nom donné à l'image (Jean-Luc, 2026-11-27) en gras, le nom du fichier en petit dessous ;
     sur la page Médiathèque, une case à cocher dans le coin pour supprimer plusieurs images d'un coup */
  const vignette = (x, tag, coches) => `<${tag} class="mt${coches?.has(x.url) ? ' sel' : ''}" ${tag === 'a' ? `href="${esc(x.url)}" target="_blank"` : 'type="button"'} data-u="${esc(x.url)}" title="${esc(x.nom || x.url)}"><span class="mt-img">${/mp4$/i.test(x.url) ? `<video src="${esc(x.url)}#t=0.5" muted preload="metadata"></video><i>▶</i>` : `<img src="${esc(x.url)}" loading="lazy" decoding="async" alt="${esc(x.nom || '')}">`}${coches ? `<span class="mt-coche" data-coche role="checkbox" aria-checked="${coches.has(x.url)}" aria-label="Cocher cette image" title="Cocher pour supprimer">${coches.has(x.url) ? '✓' : ''}</span>` : ''}</span>${x.nom ? `<b class="mt-nom">${esc(x.nom)}</b>` : coches ? '<em class="mt-sansnom">✎ Donner un nom</em>' : ''}<small>${esc(nomFichier(x.url))}</small></${tag}>`;
  const ordreMedias = l => [...l.filter(x => !x.url.startsWith('/site/avis/')), ...l.filter(x => x.url.startsWith('/site/avis/'))];
  function grilleMedias(box, items, tag, coches) {
    let liste = items, n = 0; const PAQ = 120;
    const fin = document.createElement('div'); fin.className = 'mgrid-fin';
    const suite = () => { box.insertAdjacentHTML('beforeend', liste.slice(n, n + PAQ).map(x => vignette(x, tag, coches)).join('')); n += PAQ; box.appendChild(fin); };
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting) && n < liste.length) suite(); }, { root: box.closest('.modal-in') ? box : null, rootMargin: '400px' });
    io.observe(fin);
    /* recherche dans le nom donné à l'image ET dans le nom du fichier, accents ignorés, chaque mot doit y être */
    const filtrer = q => { const mots = sansAccent(q).trim().split(/\s+/).filter(Boolean); liste = mots.length ? items.filter(x => { const t = sansAccent((x.nom || '') + ' ' + decodeURIComponent(x.url)); return mots.every(m => t.includes(m)); }) : items; n = 0; box.innerHTML = ''; suite(); const c = box.parentElement.querySelector('[data-mcount]'); if (c) c.textContent = liste.length + ' fichier' + (liste.length > 1 ? 's' : ''); };
    filtrer('');
    filtrer.liste = () => liste;
    filtrer.maj = x => { const el = box.querySelector(`[data-u="${CSS.escape(x.url)}"]`); if (el) el.outerHTML = vignette(x, tag, coches); };
    return filtrer;
  }
  /* changer son mot de passe (tout le monde) : Équipe & activité est réservée au manager depuis le 2026-11-27 */
  function monMotDePasse() {
    const dlg = document.createElement('div'); dlg.className = 'modal';
    dlg.innerHTML = `<div class="modal-in mdp-in"><div class="bh"><h2>🔑 Mon mot de passe</h2><button class="x" data-close aria-label="Fermer">×</button></div><form data-mdpf><label>Mot de passe actuel<input type="password" name="current" required autocomplete="current-password"></label><label>Nouveau mot de passe (10 caractères min.)<input type="password" name="password" minlength="10" required autocomplete="new-password"></label><div class="row"><button class="btn">Changer</button><button type="button" class="btn ghost" data-close>Annuler</button></div></form></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', e => { if (e.target.matches('[data-close], .modal')) dlg.remove(); });
    $('[data-mdpf]', dlg).addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Mot de passe changé.'); dlg.remove(); } catch (err) { toast(err.message, true); } });
    $('input', dlg).focus();
  }
  async function pickMedia() {
    const m = await api(A + '/actions/medias');
    return new Promise(resolve => {
      const dlg = document.createElement('div'); dlg.className = 'modal';
      const all = [...m.envoyes, ...m.site];
      dlg.innerHTML = `<div class="modal-in"><div class="bh"><h2>Médiathèque</h2><input type="search" placeholder="Rechercher par nom d’image…" data-mq><button class="x" data-close aria-label="Fermer">×</button></div><p class="muted sm" data-mcount></p><div class="mgrid"></div></div>`;
      document.body.appendChild(dlg);
      const filtrer = grilleMedias($('.mgrid', dlg), ordreMedias(all), 'button');
      const close = v => { dlg.remove(); resolve(v); };
      dlg.addEventListener('click', e => { const b = e.target.closest('[data-u]'); if (b) close(b.dataset.u); if (e.target.matches('[data-close], .modal')) close(null); });
      $('[data-mq]', dlg).addEventListener('input', e => filtrer(e.target.value));
      $('[data-mq]', dlg).focus();
    });
  }
  function bindPhotos(root) {
    $$('[data-pf]', root).forEach(pf => {
      if (pf.dataset.lie) return; pf.dataset.lie = '1';
      const input = $('input[type=hidden]', pf), prev = $('.pf-img', pf), menu = $('.pf-menu', pf), quoi = pf.dataset.quoi;
      const over = `<span class="pf-over">✎ Modifier ${quoi}</span>`;
      const set = u => { input.value = u; prev.innerHTML = (!u ? '<span>Aucune · cliquez pour choisir</span>' : /\.mp4$/i.test(u) ? `<video src="${esc(u)}" muted></video>` : `<img src="${esc(u)}" alt="">`) + over; $('.pf-note', pf).hidden = false; menu.hidden = true; input.dispatchEvent(new Event('input', { bubbles: true })); };
      $$('[data-pf-open]', pf).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); const was = menu.hidden; $$('.pf-menu').forEach(m => { m.hidden = true; }); menu.hidden = !was; }));
      $('input[type=file]', pf).addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; menu.hidden = true; toast('Envoi…'); try { set(await uploadFile(f)); toast('Envoyé. Pensez à enregistrer.'); } catch (err) { toast(err.message, true); } e.target.value = ''; });
      $('[data-pick]', pf).addEventListener('click', async () => { menu.hidden = true; const u = await pickMedia(); if (u) set(u); });
      $('[data-clear]', pf).addEventListener('click', () => set(''));
    });
    if (!window.__pfClose) { window.__pfClose = true; document.addEventListener('click', e => { if (!e.target.closest('.pf-act, [data-pf-open]')) $$('.pf-menu').forEach(m => { m.hidden = true; }); }); }
  }


  async function produit(id) {
    const [p, rubs, prods] = await Promise.all([api(A + '/produits/' + id), cache.rubriques || api(A + '/rubriques'), cache.produits || api(A + '/produits').catch(() => [])]);
    cache.rubriques = rubs; cache.p = p; cache.produits = prods;
    const sec = s => `${s.titre || ''}\n${(s.items || []).join('\n')}${(s.paragraphes || []).length ? '\n' + s.paragraphes.map(x => '> ' + x).join('\n') : ''}${s.note ? '\n# ' + s.note : ''}${s.apres ? '\n## ' + s.apres : ''}`;
    return page(titreHtml(p.titre), `<a class="btn ghost" href="#/catalogue?r=${esc(p.rubrique)}">← Catalogue</a><a class="btn voir-site" href="/${esc(p.rubrique)}/${esc(p.slug)}?apercu=1" target="_blank">👁 Voir la présentation sur le site</a>${peut('produits') ? `<button type="button" class="btn ghost psdelfiche" data-psdelfiche="${esc(p.id || p.slug)}">🗑 Supprimer ce produit</button>` : ''}`, `
      <form id="pf">
      <div class="cols c21">
        <section class="box"><h2>Informations</h2>
          <label>Nom<input name="titre" value="${esc(p.titre)}" required><small class="muted">Formule de buffet : écrivez « Buffet antillais — Entrée + plat ». Sur le site, la formule s’affiche à la ligne sous le nom, sans le tiret.</small></label>
          <div class="g3"><label>Rubrique<select name="rubrique">${rubs.map(r => `<option value="${r.slug}"${r.slug === p.rubrique ? ' selected' : ''}>${esc(r.nom)}</option>`).join('')}</select></label>
          <label>Statut<select name="statut"><option value="visible">Visible sur le site</option><option value="masque"${p.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label>
          <label>Ordre sur le site <small>(visible seulement par l’équipe)</small><select name="maison"><option value="1">En premier</option><option value=""${!p.maison ? ' selected' : ''}>Normal</option></select></label></div>
          <fieldset class="span3 aussi"><legend>Aussi dans ces rubriques <small class="muted">(un seul produit, affiché dans plusieurs rubriques : ex. une table dans « Les indispensables » et dans « Mobilier et matériel à la location »)</small></legend>${rubs.filter(r => r.slug !== p.rubrique && r.slug !== 'lieux').map(r => `<label class="chk"><input type="checkbox" name="autresRubriques" value="${esc(r.slug)}"${(p.autresRubriques || []).includes(r.slug) ? ' checked' : ''}> ${esc(r.nom)}</label>`).join(' ')}</fieldset>
          ${(rubs.find(r => r.slug === p.rubrique)?.sous || []).length ? `<label>Spécialité (dans « ${esc(rubs.find(r => r.slug === p.rubrique).nom)} »)<select name="sous"><option value="">Aucune (seulement dans « Tout »)</option>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}"${x.slug === p.sous ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label><fieldset class="span3 aussi"><legend>Aussi affichée dans <small class="muted">(un seul produit, plusieurs spécialités : pas de doublon dans la boutique)</small></legend>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<label class="chk"><input type="checkbox" name="autresSous" value="${esc(x.slug)}"${(p.autresSous || []).includes(x.slug) ? ' checked' : ''}> ${esc(String(x.nom).split(' · ')[0])}</label>`).join(' ')}</fieldset>` : ''}
          <label>Section sur la page (spécialité ou rubrique en sections)<select name="rangement"><option value="">Automatique (d’après le nom)</option>${[['animations', 'Nos animations'], ['corbeilles', 'Nos corbeilles de fruits'], ['pieces-montees', 'Nos pièces montées'], ['buffets', 'Nos buffets'], ['mezzes-froids', 'Nos mezzés froids à l’unité'], ['mezzes-chauds', 'Nos mezzés chauds à l’unité'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['fromages', 'Nos fromages'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité'], ['location', 'En location'], ['champagne', 'Notre champagne'], ['eaux', 'Les eaux'], ['sodas', 'Sodas'], ['jus', 'Jus de fruits'], ['vins-rouges', 'Vins rouges'], ['vins-blancs', 'Vins blancs'], ['vins-roses', 'Vin rosé'], ['alcools-forts', 'Alcools forts'], ['bars', 'Open bars & cocktails'], ['accessoires', 'Accessoires'], ['musique-live', 'Musique & DJ'], ['son-lumiere', 'Son, lumière & écrans'], ['spectacles', 'Artistes & spectacles'], ['jeux', 'Jeux & animations'], ['enfants', 'Pour les enfants'], ['souvenirs', 'Photos & souvenirs'], ['arts-table', 'Vaisselle & verres'], ['mobilier', 'Tables, chaises & nappes'], ['materiel', 'Matériel de cuisine']].map(([k, t]) => `<option value="${k}"${p.rangement === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="sp-edit"><span class="sp-lab">Description sous la photo <small class="muted">(s’affiche juste sous la photo de la page produit. Au collage, les lignes vides sont retirées ; une ligne vide que vous ajoutez avec Entrée reste visible. « Liste à puces » : une puce par ligne ; Entrée sur une puce vide termine la liste.)</small></span>
          <div class="sp-barre"><button type="button" class="btn ghost sm ia-btn" data-sp-ia title="L’IA propose une version enrichie ; relisez puis enregistrez">✨ Améliorer avec l’IA</button><button type="button" class="btn ghost sm" data-gras title="Mettre la sélection en gras (ou l’enlever)"><b>G</b> Gras</button><button type="button" class="btn ghost sm" data-puces title="Met les lignes sélectionnées (ou la ligne du curseur) en liste à puces ; recliquez pour l’enlever. Astuce : tapez « - » puis espace en début de ligne."><span class="puce-ico" aria-hidden="true"></span> Liste à puces</button><button type="button" class="btn ghost sm" data-titres-gras title="Met en gras les lignes écrites tout en MAJUSCULES">Titres en MAJUSCULES en gras</button><button type="button" class="btn ghost sm" data-sans-gras title="Retire le gras de la sélection (ou de tout le texte)">Retirer le gras</button></div>
          <div class="sp-zone" contenteditable="true" role="textbox" aria-multiline="true" data-sp-edit data-vide="Ex. NOS MINI PIÈCES puis, à la ligne, pain polaire - saumon fumé - fromage frais"></div>
          <div class="ia-ligne"><button type="button" class="btn sm ia-btn ia-maj" data-desc-ia>✨ Mettre à jour la description sous le prix avec l’IA</button><small class="muted">Résume ce texte en une phrase d’accroche affichée sous le prix, puis enregistre.</small></div>
          <textarea name="sousPhoto" hidden>${esc((p.sousPhoto || []).join('\n'))}</textarea></div>
          <label>Accroche (cartes et Google)<textarea name="extrait" rows="2">${esc(p.extrait || '')}</textarea></label>
          <label>Description sous le prix <small class="muted">(un paragraphe par ligne)</small><textarea name="description" rows="4" data-colle>${esc((p.description || []).join('\n'))}</textarea></label>
          <div class="ia-ligne"><button type="button" class="btn sm ia-btn ia-maj" data-desc-ia>✨ Mettre à jour avec l’IA (d’après la description sous la photo)</button><small class="muted">L’IA résume la « Description sous la photo » en une phrase qui donne envie de commander, la pose ici et enregistre la fiche : le site est à jour aussitôt. Recliquez quand vous changez le texte sous la photo.</small></div>
          ${seoBloc('produit', p.seoTitre, p.seoDescription, ` data-id="${esc(p.id || p.slug)}"`)}
        </section>
        <section class="box"><h2>Prix et quantités</h2>${peut('prix') ? '' : '<p class="muted sm">🔒 Les prix sont verrouillés pour votre compte (droit « Modifier les prix »).</p>'}
          <div class="g2 prix-va"><label>Prix de vente TTC (€) <small>prix payé par le client · vide = « Sur devis »</small><input name="prix" value="${fromCents(p.prixCents)}" inputmode="decimal"${peut('prix') ? '' : ' readonly class="verrou"'}></label>
          <label>Prix d’achat HT (€) <small>🔒 interne : jamais montré au client · sert à la marge des devis</small><input name="cout" value="${fromCents(achatHt(p.coutCents, p.tva ?? 10))}" inputmode="decimal" placeholder="à remplir"${peut('prix') ? '' : ' readonly class="verrou"'}></label></div>
          <p class="pf-marge" data-pfmarge></p>
          <div class="fourn" data-fourn><span class="fourn-lab">Fournisseurs <small>🔒 interne : d’où vient le produit, jamais montré au client · le premier est le principal · × = retirer de cette fiche · deux fois dessus = supprimer partout</small></span>
            <div class="fourn-chips" data-fchips></div>
            ${peut('prix') ? `<div class="row fourn-add"><select data-fsel><option value="">+ Ajouter un fournisseur…</option>${fournisseursConnus().map(x => `<option>${esc(x)}</option>`).join('')}<option value="__nouveau">✚ Nouveau fournisseur…</option></select><input data-fnew placeholder="Nom du nouveau fournisseur" hidden><button type="button" class="btn sm" data-fok hidden>Ajouter</button></div>` : ''}</div>
          <div class="g2"><label>Par<select name="unite">${[...new Set([p.unite || '', ...UNITES])].map(u => `<option${u === (p.unite || '') ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
          <label>Contenu <small>ex. « 4 brochettes », vide = rien d’affiché</small><input name="contenuPortion" value="${esc(p.contenuPortion || '')}" placeholder="4 brochettes"></label></div>
          <div class="g2"><label>Minimum<select name="min">${[...new Set([1, 2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, p.min || 1])].sort((a, b) => a - b).map(n => `<option${n === (p.min || 1) ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="g2"><label>TVA<select name="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+(p.tva ?? 10) === t ? ' selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label></div>
          <label class="chk"><input type="checkbox" name="r_personnel" ${p.regles?.personnel ? 'checked' : ''}> Proposer le personnel de service</label>
          <label class="chk"><input type="checkbox" name="r_packs" ${p.regles?.packs ? 'checked' : ''}> Proposer les packs traiteur</label>
          <div class="props" data-props><span class="fourn-lab">Autres propositions pour ce produit <small>ex. sur « Bar à cocktail » : « Mobilier pour bar à cocktail ». Choisissez des produits du catalogue : sur la page de ce produit, le client peut les ajouter à sa sélection en un clic. Elles ne concernent que ce produit.</small></span>
            <div data-props-list></div>
            <button type="button" class="btn ghost sm" data-props-add>+ Ajouter une proposition</button></div>
          <label>Variantes (une par ligne, ex. « Entrée & plat »)<textarea name="variantes" rows="2">${esc((p.variantes || []).join('\n'))}</textarea></label>
        </section>
      </div>
      <section class="box"><div class="bh"><h2>Photos de la galerie <span class="gal-nb" data-galnb></span></h2><span class="gal-etat" data-galetat></span></div>
        <p class="muted sm">Toutes les photos de la galerie sont ici. Chaque photo ajoutée apparaît tout de suite et <b>s’enregistre toute seule</b>. La photo principale (cadre doré) s’affiche sur la vignette de la boutique ; glissez les photos pour changer l’ordre, ou cliquez sur « ★ Principale ».</p>
        <p class="gal-err" data-galerr hidden></p>
        <div class="photos gal-bo" id="photos"></div>
        <h3 class="sub">Vidéo de la fiche <small class="muted">facultatif</small></h3><p class="muted sm">Sur la fiche, la vidéo passe en premier dans la galerie, avant les photos : elle tourne en boucle, sans le son. L’image d’attente s’affiche pendant son chargement (prenez une photo de la galerie). Format : fichier MP4 court (10 à 20 secondes).</p><div class="g2 vfiche">${photoField('video', p.video?.src || '', 'Vidéo (fichier MP4)')}${photoField('poster', p.video?.poster || '', 'Image d’attente')}</div>
      </section>
      <section class="box"><h2>Composition</h2><p class="muted sm">Un bloc par section, séparés par une ligne vide. Première ligne = titre, puis un élément par ligne. « # » = note avant la liste, « ## » = note après, « > » = paragraphe.</p><textarea name="sections" rows="10" class="mono">${esc((p.sections || []).map(sec).join('\n\n'))}</textarea>
        <label>Informations pratiques (une par ligne)<textarea name="details" rows="3">${esc((p.details || []).join('\n'))}</textarea></label></section>
      <section class="box"><h2>Choix proposés au client</h2><p class="muted sm">Un groupe par bloc : première ligne « Titre du groupe | nombre de choix max | exact ou max » (ou « compris » pour une liste affichée comme comprise dans la formule, sans choix à faire, ex. « Compris dans la formule | | compris »), puis une option par ligne « Nom | supplément TTC en € | prix d’achat TTC en € » (le prix d’achat est facultatif, jamais montré au client ; une option avec supplément mais sans prix d’achat est signalée « prix d’achat manquant » sur le devis).</p>
        <textarea name="groupes" rows="8" class="mono">${esc((p.groupes || []).map(g => `${g.titre || ''} | ${g.max || ''} | ${g.compris ? 'compris' : g.exact ? 'exact' : 'max'}${g.facultatif ? ' | facultatif' : ''}\n${(g.options || []).map(o => `${o.label}${o.supCents || o.coutCents != null ? ' | ' + (o.supCents ? fromCents(o.supCents) : '0') : ''}${o.coutCents != null ? ' | ' + fromCents(o.coutCents) : ''}`).join('\n')}`).join('\n\n'))}</textarea>
        ${(p.variantes || []).length && (p.groupes || []).length ? `<h3 class="fg-t">Groupes proposés selon la formule</h3><p class="muted sm">Quand le client choisit une formule, seuls les groupes cochés pour cette formule restent affichés ; les autres disparaissent et leurs choix sont retirés. (Après avoir ajouté un groupe ou une formule, enregistrez pour le voir ici.)</p>
        <div class="fg-wrap"><table class="fg"><thead><tr><th>Groupe</th>${p.variantes.map(v => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${p.groupes.map(g => `<tr><td>${esc(g.titre || '')}</td>${p.variantes.map(v => `<td><input type="checkbox" name="fg" value="${esc(JSON.stringify([g.titre || '', v]))}" ${!(g.variantes || []).length || g.variantes.includes(v) ? 'checked' : ''} aria-label="${esc((g.titre || '') + ' : ' + v)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}</section>
      <section class="box"><h2>Allergènes</h2><p class="muted sm">Cochez les allergènes présents : ils s’affichent sur la fiche du site, dans un encadré « Allergènes » sous le bouton de devis.</p>${p.allergenesAuto ? '<p class="sm" style="color:#8a5a00">Cochés automatiquement d’après le nom et la composition du plat : à vérifier avec la cuisine. Enregistrez la fiche pour confirmer.</p>' : ''}<div class="allerg">${ALLERGENES.map(a => `<label class="chk"><input type="checkbox" name="al" value="${a}" ${(p.allergenes || []).includes(a) ? 'checked' : ''}> ${a}</label>`).join('')}</div></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button><span class="muted" id="dirty"></span></div>
      </form>`);
  }
  produit.after = id => {
    const p = cache.p, form = $('#pf');
    /* marge de la fiche, en direct (HT, interne) */
    const pfMarge = () => {
      const el = $('[data-pfmarge]'); if (!el) return;
      const v = toCents(form.prix.value), a = achatTtc(toCents(form.cout.value), form.tva.value), k = 1 + (+form.tva.value || 10) / 100;
      if (v == null) { el.textContent = ''; return; }
      if (a == null) { el.className = 'pf-marge manq'; el.textContent = '⚠ Prix d’achat manquant : la marge de cette prestation ne sera pas comptée sur les devis.'; return; }
      const m = Math.round(v / k) - Math.round(a / k), pc = v ? Math.round(1000 * m / Math.round(v / k)) / 10 : 0;
      el.className = 'pf-marge ' + (m < 0 ? 'neg' : 'pos');
      el.innerHTML = `💰 Marge : <b>${euros(m)} HT</b> par ${esc(form.unite.value || 'unité')} · <b>${String(pc).replace('.', ',')} %</b> <small>(hors taxes, TVA ${String(form.tva.value).replace('.', ',')} % retirée de la vente et de l’achat)</small>`;
    };
    /* autres propositions (Jean-Luc, 2026-11-25) : encadrés créés à la demande, propres à ce produit,
       chacun avec un titre (« Mobilier pour bar à cocktail ») et des produits du catalogue choisis par recherche */
    const props = (p.propositions || []).map(b => ({ titre: b.titre || '', slugs: [...(b.slugs || [])] }));
    const tousP = () => (cache.produits || []).filter(x => x.slug !== p.slug);
    const nrm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const sale = () => { $('#dirty').textContent = 'Modifications non enregistrées'; };
    const pNom = x => String(x.titre || '').replace(/\s+[—–]\s+/, ' · ');
    const pPrix = x => (x.prixCents == null ? esc(x.prixAffiche || 'Sur devis') : euros(x.prixCents) + ' TTC / ' + esc(x.unite || 'unité'));
    const pLigne = sl => { const x = tousP().find(y => y.slug === sl); return `<span class="pchip${x && x.statut === 'masque' ? ' masq' : ''}">${x?.photos?.[0]?.src ? `<img src="${esc(x.photos[0].src)}" alt="">` : ''}<span>${esc(x ? pNom(x) : sl + ' (introuvable)')}${x ? `<small>${pPrix(x)}${x.statut === 'masque' ? ' · masqué : non affiché' : ''}</small>` : ''}</span><button type="button" data-pdel="${esc(sl)}" aria-label="Retirer">×</button></span>`; };
    const pDraw = () => {
      const el = $('[data-props-list]'); if (!el) return;
      el.innerHTML = props.map((b, i) => `<div class="prop-b" data-pb="${i}"><div class="prop-h"><input data-ptitre value="${esc(b.titre)}" placeholder="Titre, ex. Mobilier pour bar à cocktail" aria-label="Titre de la proposition"><button type="button" class="btn ghost sm" data-pbdel title="Retirer cette proposition">🗑 Retirer</button></div>
        <div class="pchips">${b.slugs.map(pLigne).join('') || '<span class="muted sm">Aucun produit pour l’instant : cherchez-le ci-dessous.</span>'}</div>
        <div class="prop-q"><input type="search" data-pq placeholder="🔍 Chercher un produit du catalogue à proposer…" autocomplete="off"><div class="prop-res" data-pres hidden></div></div></div>`).join('');
    };
    pDraw();
    $('[data-props-add]')?.addEventListener('click', () => { props.push({ titre: '', slugs: [] }); pDraw(); sale(); $$('[data-ptitre]').pop()?.focus(); });
    const pBox = $('[data-props-list]');
    pBox?.addEventListener('input', e => {
      const b = e.target.closest('[data-pb]'); if (!b) return; const i = +b.dataset.pb;
      if (e.target.matches('[data-ptitre]')) { props[i].titre = e.target.value; sale(); return; }
      if (e.target.matches('[data-pq]')) {
        const res = $('[data-pres]', b), mots = nrm(e.target.value).split(/\s+/).filter(Boolean);
        if (!mots.length) { res.hidden = true; return; }
        const L = tousP().filter(x => !props[i].slugs.includes(x.slug) && mots.every(m => nrm(x.titre + ' ' + x.slug).includes(m))).slice(0, 10);
        res.innerHTML = L.map(x => `<button type="button" data-padd="${esc(x.slug)}">${x.photos?.[0]?.src ? `<img src="${esc(x.photos[0].src)}" alt="">` : '<span class="ph0"></span>'}<span>${esc(pNom(x))}<small>${pPrix(x)}${x.statut === 'masque' ? ' · masqué' : ''}</small></span></button>`).join('') || '<p class="muted sm">Aucun produit trouvé. Créez-le d’abord dans le catalogue, puis revenez le choisir ici.</p>';
        res.hidden = false;
      }
    });
    pBox?.addEventListener('click', e => {
      const b = e.target.closest('[data-pb]'); if (!b) return; const i = +b.dataset.pb;
      const add = e.target.closest('[data-padd]'), del = e.target.closest('[data-pdel]');
      if (add) { props[i].slugs.push(add.dataset.padd); pDraw(); sale(); $(`[data-pb="${i}"] [data-pq]`)?.focus(); }
      else if (del) { props[i].slugs = props[i].slugs.filter(x => x !== del.dataset.pdel); pDraw(); sale(); }
      else if (e.target.closest('[data-pbdel]')) { if (props[i].slugs.length && !confirm('Retirer cette proposition de la fiche ?')) return; props.splice(i, 1); pDraw(); sale(); }
    });
    pBox?.addEventListener('keydown', e => { if (e.target.matches('[data-pq]') && e.key === 'Enter') { e.preventDefault(); $('[data-padd]', e.target.closest('[data-pb]'))?.click(); } });
    /* fournisseurs : liste déroulante des fournisseurs déjà connus + « Nouveau fournisseur… » ; plusieurs par produit */
    var fourn = [...new Set([...(p.fournisseurs || []), ...(p.fournisseur ? [p.fournisseur] : [])])];
    const fChips = () => { const el = $('[data-fchips]'); if (el) el.innerHTML = fourn.map((x, i) => `<span class="fchip${i ? '' : ' princ'}">${i ? '' : '★ '}${esc(x)}${peut('prix') ? `<button type="button" data-fdel="${i}" aria-label="Retirer ${esc(x)}">×</button>` : ''}</span>`).join('') || '<span class="muted sm">Aucun fournisseur.</span>'; };
    const fAjout = v => { v = String(v || '').trim(); if (!v || fourn.some(x => x.toLowerCase() === v.toLowerCase())) return; fourn.push(v); fChips(); $('#dirty').textContent = 'Modifications non enregistrées'; };
    fChips();
    $('[data-fsel]')?.addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (v === '__nouveau') { $('[data-fnew]').hidden = $('[data-fok]').hidden = false; $('[data-fnew]').focus(); } else fAjout(v); });
    $('[data-fok]')?.addEventListener('click', () => { fAjout($('[data-fnew]').value); $('[data-fnew]').value = ''; $('[data-fnew]').hidden = $('[data-fok]').hidden = true; });
    $('[data-fnew]')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-fok]').click(); } });
    let dTap = { el: null, t: 0 };
    $('[data-fchips]')?.addEventListener('click', async e => {
      const c = e.target.closest('.fchip'); if (!c || e.target.closest('[data-fdel]') || !peut('prix')) return;
      const now = Date.now(); if (!(dTap.el === c && now - dTap.t < 450)) { dTap = { el: c, t: now }; return; } dTap = { el: null, t: 0 };
      const nom = fourn[$$('.fchip', $('[data-fchips]')).indexOf(c)]; if (!nom) return;
      let n = 0; try { n = (await api(A + '/actions/fournisseurs/compter?nom=' + encodeURIComponent(nom))).n; } catch { /* rien */ }
      if (!confirm(`Voulez-vous supprimer le fournisseur « ${nom} » ?\n\nIl sera retiré de la liste${n ? (n === 1 ? ' et de la fiche qui l’utilise' : ` et des ${n} fiches qui l’utilisent`) : ''}.`)) return;
      try { await api(A + '/actions/fournisseurs/supprimer', { method: 'POST', body: { nom } }); fourn.splice(fourn.indexOf(nom), 1); cache.produits = null; fChips(); $('[data-fsel] option', document) && $$('[data-fsel] option').forEach(o => { if (o.value === nom || o.textContent === nom) o.remove(); }); toast(`Fournisseur « ${nom} » supprimé.`); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-fchips]')?.addEventListener('click', e => { const b = e.target.closest('[data-fdel]'); if (!b) return; fourn.splice(+b.dataset.fdel, 1); fChips(); $('#dirty').textContent = 'Modifications non enregistrées'; });
    pfMarge(); ['prix', 'cout'].forEach(n => form[n].addEventListener('input', pfMarge)); ['tva', 'unite'].forEach(n => form[n].addEventListener('change', pfMarge));
    let photos = (p.photos || []).map(x => ({ ...x }));
    const ajout = `<label class="gal-ajout" data-drop><input type="file" accept="image/*,.heic,.heif" multiple hidden data-multi><span class="ga-plus">+</span><b>Ajouter des photos</b><span>Cliquez ou glissez vos photos ici</span><span class="ga-tel">Sur iPhone : Photothèque ou appareil photo</span></label>
      <button type="button" class="gal-ajout gal-media" data-pickp><span class="ga-plus">▦</span><b>Médiathèque</b><span>Reprendre une photo déjà envoyée</span></button>`;
    const draw = () => {
      $('#photos').innerHTML = photos.map((ph, i) => ph.envoi
        ? `<figure class="ph-envoi"><div class="ph-img"><img src="${esc(ph.src)}" alt=""><span class="ph-sablier">Envoi…</span></div></figure>`
        : vigGalerie(ph.src, i, ph.alt)).join('') + ajout;
      const n = photos.filter(x => !x.envoi).length;
      $('[data-galnb]').textContent = n ? `(${n} photo${n > 1 ? 's' : ''})` : '(aucune photo)';
    };
    draw();
    /* photos enregistrées automatiquement, sans toucher aux autres champs non enregistrés */
    const etat = t => { const e = $('[data-galetat]'); if (e) e.textContent = t; };
    let fileSauve = Promise.resolve(), altT = null;
    const sauvePhotos = () => {
      fileSauve = fileSauve.then(async () => {
        const liste = photos.filter(x => !x.envoi).map(({ src, alt }) => ({ src, alt }));
        etat('Enregistrement…');
        try {
          const base = cache.p || p;
          const next = { ...base, photos: liste };
          await api(`${A}/produits/${id}`, { method: 'PUT', body: next });
          cache.p = next; cache.produits = null; etat('✓ Photos enregistrées');
        } catch (err) { etat(''); toast('Photos non enregistrées : ' + err.message, true); }
      });
      return fileSauve;
    };
    const envoyer = async files => {
      const imgs = [...files].filter(f => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name || ''));
      if (!imgs.length) { toast('Choisissez des photos (JPG, PNG, WebP…).', true); return; }
      const lots = imgs.map(f => { const x = { src: URL.createObjectURL(f), envoi: true, alt: form.titre.value }; photos.push(x); return [f, x]; });
      draw(); etat(`Envoi de ${lots.length} photo${lots.length > 1 ? 's' : ''}…`);
      let ok = 0; const refus = [];
      for (const [f, x] of lots) {
        try { const url = await uploadFile(f); URL.revokeObjectURL(x.src); x.src = url; delete x.envoi; ok++; }
        catch (err) { photos.splice(photos.indexOf(x), 1); refus.push(`« ${f.name} » : ${err.message}`); }
        draw();
      }
      if (ok) await sauvePhotos();
      const msg = $('[data-galerr]');
      if (msg) { msg.hidden = !refus.length; msg.innerHTML = refus.length ? `<b>${refus.length > 1 ? refus.length + ' photos non ajoutées' : 'Photo non ajoutée'}</b><br>${refus.map(esc).join('<br>')}` : ''; }
      if (refus.length) toast(refus.length > 1 ? `${refus.length} photos non ajoutées (voir le message rouge).` : 'Photo non ajoutée (voir le message rouge).', true);
      else toast(ok > 1 ? `${ok} photos ajoutées et enregistrées.` : 'Photo ajoutée et enregistrée.');
    };
    const dirty = () => { $('#dirty').textContent = 'Modifications non enregistrées'; };
    form.addEventListener('input', dirty);
    /* description sous la photo : petit éditeur où le gras se voit tel quel (enregistré en **gras**) */
    {
      const ta = $('[name=sousPhoto]', form), ed = $('[data-sp-edit]', form);
      const ligneHtml = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*\*/g, '');
      /* une ligne « - … » = une puce (enregistrée « - texte », affichée en vraie puce sur le site) */
      const PUCE = /^[-•][\s\u00a0]+/;
      const affiche = l => { ed.innerHTML = l.map(t => PUCE.test(t) ? `<div class="puce">${ligneHtml(t.replace(PUCE, '')) || '<br>'}</div>` : `<div>${ligneHtml(t) || '<br>'}</div>`).join(''); ed.classList.toggle('vide', !l.length); };
      const lit = () => {
        /* copie hors écran : le gras devient **…**, puis innerText donne les lignes comme à l'écran */
        const c = ed.cloneNode(true);
        c.querySelectorAll('span[style*="font-weight"]').forEach(x => { if (/bold|[6-9]00/.test(x.style.fontWeight)) { const b = document.createElement('b'); b.append(...x.childNodes); x.replaceWith(b); } });
        /* chaque morceau de texte en gras est entouré d'étoiles (un gras qui couvre plusieurs lignes reste ligne par ligne) */
        const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), nodes = []; let n;
        while ((n = w.nextNode())) if (n.parentElement.closest('b, strong') && n.nodeValue.trim()) nodes.push(n);
        nodes.forEach(t => { t.nodeValue = '**' + t.nodeValue + '**'; });
        c.querySelectorAll('.puce').forEach(d => { if (d.textContent.trim()) d.prepend('\uE002'); });
        c.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;white-space:pre-wrap';
        document.body.append(c); const txt = c.innerText; c.parentNode.removeChild(c);
        return lignesSousPhoto(txt.replace(/\uE002\s*/g, '\uE002').replace(/\*\*\*\*/g, '').replace(/\*\*([ \t]+)\*\*/g, '$1').split('\n').map(l => l.replace(/\*\*(\s+)/g, '$1**').replace(/(\s+)\*\*/g, '**$1').replace(/^\*\*\*\*$/, '')).join('\n')).map(l => l.replace(/^\uE002\s*/, '- ').replace(/\uE002/g, ''));
      };
      const sync = () => { ta.value = lit().join('\n'); ed.classList.toggle('vide', !ed.textContent.trim()); };
      affiche(lignesSousPhoto(ta.value));
      try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
      /* ligne (bloc) où se trouve le curseur */
      const bloc = () => { const s = getSelection(); if (!s.rangeCount) return null; let n = s.anchorNode; while (n && n.parentNode !== ed) n = n.parentNode; return n && n.nodeType === 1 && ed.contains(n) ? n : null; };
      ed.addEventListener('input', () => {
        /* « - » ou « • » puis espace en début de ligne : la ligne devient une puce */
        const d = bloc();
        if (d && !d.classList.contains('puce')) {
          const t = document.createTreeWalker(d, NodeFilter.SHOW_TEXT).nextNode();
          if (t && /^[-•][ \u00a0]/.test(t.nodeValue) && d.textContent.startsWith(t.nodeValue.slice(0, 2))) {
            const s = getSelection(), o = s.anchorNode === t ? s.anchorOffset : null;
            t.nodeValue = t.nodeValue.slice(2); d.classList.add('puce');
            const r = document.createRange();
            if (!d.textContent) { d.innerHTML = '<br>'; r.setStart(d, 0); } else r.setStart(t, Math.max(0, (o ?? 2) - 2));
            r.collapse(true); s.removeAllRanges(); s.addRange(r);
          }
        }
        sync(); dirty();
      });
      /* Entrée sur une puce vide = fin de la liste ; Retour arrière au début d'une puce = retire la puce */
      ed.addEventListener('keydown', e => {
        if ((e.key !== 'Enter' && e.key !== 'Backspace') || e.shiftKey) return;
        const d = bloc(), s = getSelection(); if (!d || !d.classList.contains('puce') || !s.isCollapsed) return;
        const avant = document.createRange(); avant.selectNodeContents(d); avant.setEnd(s.anchorNode, s.anchorOffset);
        if ((e.key === 'Enter' && !d.textContent.trim()) || (e.key === 'Backspace' && !avant.toString().length)) { e.preventDefault(); d.classList.remove('puce'); sync(); dirty(); }
      });
      /* « ✨ Améliorer avec l'IA » : texte proposé dans l'éditeur, enregistré seulement avec « Enregistrer » */
      const iaTexte = async (btn, champ, lignes, poser) => {
        const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ L’IA rédige…';
        try {
          const r = await api(A + '/ia/texte-produit', { method: 'POST', body: { id, champ, lignes, titre: form.titre.value, description: form.description.value, sousPhoto: ta.value } });
          poser(r.lignes); if (champ !== 'description') { dirty(); toast('Proposition de l’IA posée : relisez puis enregistrez.'); }
        } catch (err) { toast(err.message, true); }
        finally { btn.disabled = false; btn.textContent = lib; }
      };
      $('[data-sp-ia]', form)?.addEventListener('click', e => iaTexte(e.currentTarget, 'sousPhoto', lit(), l => { affiche(l); sync(); }));
      /* « ✨ Mettre à jour … avec l'IA » (Jean-Luc, 2026-11-27) : la description sous le prix est réécrite d'après la
         description sous la photo, puis la fiche est enregistrée aussitôt (le site est à jour sans autre clic) */
      $$('[data-desc-ia]', form).forEach(b => b.addEventListener('click', e => {
        if (!lit().length) { toast('Écrivez d’abord la « Description sous la photo » : l’IA s’en sert pour la description sous le prix.', true); return; }
        const btns = $$('[data-desc-ia]', form); btns.forEach(x => { x.disabled = true; });
        iaTexte(e.currentTarget, 'description', form.description.value.split('\n'), l => {
          form.description.value = l.join('\n');
          form.description.classList.add('ia-pose'); setTimeout(() => form.description.classList.toggle('ia-pose', false), 2500);
          form.requestSubmit();
        }).finally(() => btns.forEach(x => { x.disabled = false; }));
      }));
      ed.addEventListener('paste', e => {
        const txt = e.clipboardData?.getData('text/plain'); if (txt == null) return;
        e.preventDefault();
        /* puces collées (Word, site…) : « • », « ▪ », « - »… en début de ligne deviennent des puces */
        const lc = lignesNettes(txt).map(l => l.replace(/^(?:[•·▪●◦‣]\s*|[-–]\s+)/, '- '));
        const html = lc.map(esc).join('<br>');
        if (!document.execCommand('insertHTML', false, html)) { const sel = getSelection(); if (sel.rangeCount) { const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createRange().createContextualFragment(html)); } }
        if (lc.some(l => PUCE.test(l))) { const l = lit(); affiche(l); finLigne(l.length - 1); }
        sync(); dirty();
      });
      const finLigne = i => { const d = ed.children[i]; if (!d) return; const r = document.createRange(); r.selectNodeContents(d); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); ed.focus(); };
      /* « • Liste à puces » : met (ou enlève) les puces sur les lignes sélectionnées, ou la ligne du curseur */
      $('[data-puces]', form).addEventListener('click', () => {
        const s = getSelection();
        if (!s.rangeCount || !ed.contains(s.anchorNode) || !ed.contains(s.focusNode)) { toast('Cliquez d’abord dans la ligne (ou sélectionnez les lignes) à mettre en liste à puces.', true); return; }
        const r = s.getRangeAt(0), fin = r.cloneRange(), deb = r.cloneRange(), curseur = r.collapsed;
        fin.collapse(false); fin.insertNode(document.createTextNode('\uE001'));
        deb.collapse(true); deb.insertNode(document.createTextNode('\uE000'));
        const brut = lit(), M = /[\uE000\uE001]/;
        let a = brut.findIndex(x => M.test(x)), b = brut.length - 1 - [...brut].reverse().findIndex(x => M.test(x));
        const l = brut.map(x => x.replace(/[\uE000\uE001]/g, '').replace(/^\*\*\*\*$/, ''));
        if (a < 0) { a = b = l.length; l.push(''); }
        const pleines = l.slice(a, b + 1).filter(Boolean), oter = pleines.length && pleines.every(x => PUCE.test(x));
        for (let i = a; i <= b; i++) {
          if (oter) l[i] = l[i].replace(PUCE, '');
          else if (!PUCE.test(l[i]) && (l[i] || a === b)) l[i] = '- ' + l[i];
        }
        affiche(l); sync(); dirty();
        /* les mêmes lignes restent sélectionnées (on peut recliquer pour annuler) */
        const da = ed.children[a], db = ed.children[b];
        if (curseur) finLigne(b);
        else if (da && db) { const rr = document.createRange(); rr.setStart(da, 0); rr.setEnd(db, db.childNodes.length); s.removeAllRanges(); s.addRange(rr); ed.focus(); }
      });
      /* les boutons gardent la sélection du texte */
      $$('.sp-barre button', form).forEach(bt => bt.addEventListener('mousedown', e => e.preventDefault()));
      const selDansEd = () => { const s = getSelection(); return s.rangeCount && !s.isCollapsed && ed.contains(s.anchorNode) && ed.contains(s.focusNode); };
      $('[data-gras]', form).addEventListener('click', () => {
        if (!selDansEd()) { toast('Sélectionnez d’abord les mots à mettre en gras.', true); return; }
        document.execCommand('bold'); sync(); dirty();
      });
      $('[data-sans-gras]', form).addEventListener('click', () => {
        if (selDansEd()) { let k = 0; while (document.queryCommandState('bold') && k++ < 3) document.execCommand('bold'); }
        else affiche(lit().map(l => l.replace(/\*\*/g, '')));
        sync(); dirty();
      });
      $('[data-titres-gras]', form).addEventListener('click', () => {
        let n = 0;
        const l = lit().map(t => { const u = t.replace(/\*\*/g, '').trim(); if (!u || /^\*\*.*\*\*$/.test(t) || !/\p{Lu}.*\p{Lu}/u.test(u) || /\p{Ll}/u.test(u)) return t; n++; return '**' + u + '**'; });
        affiche(l); sync(); if (n) dirty();
        toast(n ? `${n} titre${n > 1 ? 's' : ''} mis en gras.` : 'Aucune ligne tout en majuscules à mettre en gras.', !n);
      });
    }
    /* texte collé (Word, site…) : on retire les lignes vides entre les lignes */
    $$('[data-colle]', form).forEach(t => t.addEventListener('paste', e => {
      const txt = e.clipboardData?.getData('text/plain'); if (txt == null) return;
      e.preventDefault();
      t.setRangeText(lignesNettes(txt).join('\n'), t.selectionStart, t.selectionEnd, 'end'); dirty();
    }));
    bindPhotos(form);
    $('#photos').addEventListener('input', e => { if (e.target.matches('[data-multi]')) e.stopPropagation(); if (e.target.matches('[data-alt]')) { e.stopPropagation(); photos[+e.target.closest('[data-i]').dataset.i].alt = e.target.value; clearTimeout(altT); altT = setTimeout(sauvePhotos, 900); } });
    $('#photos').addEventListener('click', e => { const f = e.target.closest('[data-i]'); if (!f) return; const i = +f.dataset.i; if (e.target.closest('[data-rm]') && confirm('Retirer cette photo de la galerie ?\n\nElle reste dans la médiathèque.')) { photos.splice(i, 1); draw(); sauvePhotos(); } if (e.target.closest('[data-main]')) { photos.unshift(...photos.splice(i, 1)); draw(); sauvePhotos(); } });
    let dragI = null;
    const box = $('#photos');
    box.addEventListener('dragstart', e => { const f = e.target.closest?.('[data-i]'); dragI = f ? +f.dataset.i : null; });
    box.addEventListener('dragend', () => { dragI = null; box.classList.remove('survol'); });
    box.addEventListener('dragover', e => { e.preventDefault(); if (dragI == null) box.classList.add('survol'); });
    box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('survol'); });
    box.addEventListener('drop', e => {
      e.preventDefault(); box.classList.remove('survol');
      if (dragI == null) { if (e.dataTransfer?.files?.length) envoyer(e.dataTransfer.files); return; }
      const t = e.target.closest('[data-i]'); const de = dragI; dragI = null;
      if (t == null || +t.dataset.i === de) return;
      const [m] = photos.splice(de, 1); photos.splice(+t.dataset.i, 0, m); draw(); sauvePhotos();
    });
    box.addEventListener('change', e => { if (e.target.matches('[data-multi]')) { envoyer(e.target.files); e.target.value = ''; } });
    box.addEventListener('click', async e => { if (!e.target.closest('[data-pickp]')) return; const u = await pickMedia(); if (u) { photos.push({ src: u, alt: form.titre.value }); draw(); sauvePhotos(); toast('Photo ajoutée et enregistrée.'); } });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(form);
      const sections = String(f.get('sections') || '').split(/\n\s*\n/).map(b => b.split('\n').map(x => x.trim()).filter(Boolean)).filter(b => b.length).map(b => ({ titre: b[0], items: b.slice(1).filter(x => !/^(#|>)/.test(x)), paragraphes: b.slice(1).filter(x => x.startsWith('>')).map(x => x.replace(/^>\s*/, '')), note: (b.find(x => /^#\s/.test(x)) || '').replace(/^#\s*/, '') || null, apres: (b.find(x => /^##\s/.test(x)) || '').replace(/^##\s*/, '') || null }));
      const oldG = p.groupes || [];
      const groupes = String(f.get('groupes') || '').split(/\n\s*\n/).map(b => b.split('\n').map(x => x.trim()).filter(Boolean)).filter(b => b.length).map((b, gi) => {
        const [titre, max, mode, fac] = b[0].split('|').map(x => x.trim());
        const old = oldG.find(g => g.titre === titre) || oldG[gi] || {};
        const vars = String(f.get('variantes')).split('\n').map(x => x.trim()).filter(Boolean);
        const fg = $$('[name=fg]', form).map(i => [...JSON.parse(i.value), i.checked]).filter(x => x[0] === titre);
        const gv = !vars.length ? null : fg.length ? vars.filter(v => !fg.some(x => x[1] === v && !x[2])) : (old.variantes || null);
        return { ...old, variantes: gv && gv.length && gv.length < vars.length ? gv : null, id: old.id || 'g' + gi, titre, max: +max || null, exact: mode === 'exact', compris: mode === 'compris' || undefined, facultatif: fac === 'facultatif', options: b.slice(1).map((o, oi) => { const [label, sup, achat] = o.split('|').map(x => x.trim()); const oo = (old.options || []).find(x => x.label === label) || {}; return { ...oo, id: oo.id || 'o' + oi + '-' + label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30), label, supCents: toCents(sup) || 0, coutCents: achat ? toCents(achat) : null }; }) };
      });
      const next = { ...p, titre: f.get('titre'), rubrique: f.get('rubrique'), sous: f.get('rubrique') === p.rubrique ? (f.get('sous') ?? p.sous ?? '') : '', autresSous: f.get('rubrique') === p.rubrique ? f.getAll('autresSous').filter(x => x !== f.get('sous')) : [], autresRubriques: f.getAll('autresRubriques').filter(x => x !== f.get('rubrique')), rangement: f.get('rangement') ?? p.rangement ?? '', statut: f.get('statut'), maison: !!f.get('maison'), extrait: f.get('extrait'), seoTitre: String(f.get('seoTitre') || '').trim(), seoDescription: String(f.get('seoDescription') || '').replace(/\s+/g, ' ').trim(), description: lignesNettes(f.get('description')), sousPhoto: lignesSousPhoto(f.get('sousPhoto')),
        prixCents: toCents(f.get('prix')), unite: f.get('unite'), contenuPortion: String(f.get('contenuPortion') || '').trim(), min: +f.get('min') || 1, minimumTexte: '', prixTexte: '', coutCents: achatTtc(toCents(f.get('cout')), +f.get('tva')), fournisseurs: fourn.slice(), fournisseur: undefined, tva: +f.get('tva'),
        regles: { ...(p.regles || {}), personnel: f.get('r_personnel') ? (p.regles?.personnel || 'service') : null, packs: !!f.get('r_packs') },
        propositions: props.map(b => ({ titre: String(b.titre || '').trim(), slugs: b.slugs.slice() })).filter(b => b.slugs.length),
        variantes: String(f.get('variantes')).split('\n').map(x => x.trim()).filter(Boolean), photos: photos.filter(x => !x.envoi).map(({ src, alt }) => ({ src, alt })), video: f.get('video') ? { src: f.get('video'), poster: f.get('poster') || '' } : null,
        sections, details: String(f.get('details')).split('\n').map(x => x.trim()).filter(Boolean), groupes, allergenes: f.getAll('al'), allergenesAuto: false };
      try { await api(`${A}/produits/${id}`, { method: 'PUT', body: next }); cache.p = next; cache.produits = null; $('#dirty').textContent = ''; toast('Enregistré : visible sur le site immédiatement.'); }
      catch (err) { toast(err.message, true); }
    });
  };

  /* découpe un texte en lignes propres : espaces insécables, tabulations et lignes vides retirés */
  function lignesNettes(v) { return String(v || '').replace(/\r\n?|\u2028|\u2029|\v|\f/g, '\n').split('\n').map(x => x.replace(/[\u00a0\t\u200b]+/g, ' ').replace(/ {2,}/g, ' ').trim()).filter(Boolean); }

  /* description sous la photo : garde UNE ligne vide là où vous en mettez (pas de doublons, pas au début ni à la fin) */
  function lignesSousPhoto(v) { const l = String(v || '').replace(/\r\n?|\u2028|\u2029|\v|\f/g, '\n').split('\n').map(x => x.replace(/[\u00a0\t\u200b]+/g, ' ').replace(/ {2,}/g, ' ').trim()).filter((x, i, a) => x || (i > 0 && a[i - 1])); while (l.length && !l[0]) l.shift(); while (l.length && !l[l.length - 1]) l.pop(); return l; }

  /* ---------- lieux ---------- */
  /* mêmes listes que server/seed.js (recherche multicritère de la page Lieux) */
  const TYPES_LIEU = ['Péniche à quai', 'Bateau navigant', 'Loft', 'Appartement', 'Demeure', 'Salle de réception', 'Rooftop', 'Restaurant', 'Jardin ou domaine'];
  const EVENEMENTS_LIEU = ['Anniversaire', 'Mariage', 'Fiançailles', 'Pacs', 'Baptême', 'Bar/Bat Mitzvah', 'Réunion de famille', 'Réception entre amis', 'Soirée étudiante', 'Fête d’entreprise', 'Séminaire', 'Conférence', 'Réunion professionnelle', 'Repas d’affaires', 'After-work', 'Pot de départ', 'Présentation de produits', 'Remise de prix', 'Spectacle'];
  const DEPTS_LIEU = { '75': 'Paris', '77': 'Seine-et-Marne', '78': 'Yvelines', '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise' };
  async function lieux() {
    const list = (await api(A + '/lieux')).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    return page('Lieux de réception', '<button class="btn" data-newl>+ Nouveau lieu</button>', `<div class="plist">${list.map(l => `<a class="prow${l.statut === 'masque' ? ' hid' : ''}" href="#/lieux/${l.slug}">${l.photos?.[0] ? `<img src="${esc(l.photos[0])}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span><b>${esc(l.nom)}</b><small>${l.type ? esc(l.type) + ' · ' : ''}${esc(l.ville || '')} · ${l.capacite ? l.capacite + ' pers.' : ''} · ${esc(l.prixTexte || '')}</small></span><span class="pill ${l.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${l.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${l.maison ? '<span class="pill">Maison</span>' : ''}</a>`).join('')}</div>`);
  }
  lieux.after = () => $('[data-newl]')?.addEventListener('click', async () => { const nom = prompt('Nom du lieu ?'); if (!nom) return; const r = await api(A + '/lieux', { method: 'POST', body: { nom } }); location.hash = '#/lieux/' + r.id; });
  async function lieu(id) {
    const l = await api(A + '/lieux/' + id); cache.l = l;
    return page(esc(l.nom), `<a class="btn ghost" href="#/lieux">← Lieux</a><a class="btn voir-site" data-voirlieu href="/lieux/${esc(l.slug)}?apercu=1" target="_blank" title="Enregistre vos modifications puis ouvre la page du lieu telle que vos clients la voient">👁 Voir la présentation sur le site</a>`, `<form id="lf2"><div class="cols c21"><section class="box"><label>Nom<input name="nom" value="${esc(l.nom)}"></label><label>Description<textarea name="description" rows="5">${esc(l.description || '')}</textarea></label><div class="g2"><label>Adresse<input name="adresse" value="${esc(l.adresse || '')}"></label><label>Ville<input name="ville" value="${esc(l.ville || '')}"></label></div><label>Équipements (un par ligne)<textarea name="equipements" rows="5">${esc((l.equipements || []).join('\n'))}</textarea></label></section>
      <section class="box"><div class="g2"><label>Statut<select name="statut"><option value="visible">Visible</option><option value="masque"${l.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label><label>Ordre sur le site <small>(visible seulement par l’équipe)</small><select name="maison"><option value="">Normal</option><option value="1"${l.maison ? ' selected' : ''}>En premier</option></select></label></div><label>Capacité max<input type="number" name="capacite" value="${esc(l.capacite || '')}"></label><label>Prix affiché<input name="prixTexte" value="${esc(l.prixTexte || '')}" placeholder="Sur devis"></label></section></div>
      <section class="box"><h2>Recherche de la page Lieux</h2><p class="muted sm">Ces trois choix remplissent les listes « Localisation », « Type de lieu » et « Type d’événement » de la recherche, en haut de la page Lieux du site.</p>
        <div class="g2"><label>Localisation (département)<select name="departement"><option value="">— Non précisé —</option>${Object.entries(DEPTS_LIEU).map(([k, v]) => `<option value="${k}"${l.departement === k ? ' selected' : ''}>${esc(v)} (${k})</option>`).join('')}</select></label>
        <label>Type de lieu<select name="type" data-typel>${[...new Set([...TYPES_LIEU, l.type].filter(Boolean))].map(t => `<option${l.type === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}<option value="">— Non précisé —</option><option value="__autre">Autre type (à écrire)…</option></select><input name="typeAutre" placeholder="Ex. : Château, Galerie d’art…" hidden></label></div>
        <p class="lab-ev"><b>Types d’événements possibles dans ce lieu</b></p><div class="checks ev-lieu">${[...new Set([...EVENEMENTS_LIEU, ...(l.evenements || [])])].map(e => `<label><input type="checkbox" name="evenements" value="${esc(e)}"${(l.evenements || []).includes(e) ? ' checked' : ''}> ${esc(e)}</label>`).join('')}</div>
        <p class="row" style="margin-top:8px"><button type="button" class="btn ghost sm" data-evall>Tout cocher</button><button type="button" class="btn ghost sm" data-evnone>Tout décocher</button></p></section>
      <section class="box"><div class="bh"><h2>Photos</h2><div class="row"><label class="btn ghost sm up">+ Ajouter depuis mon ordinateur<input type="file" accept="image/*" multiple hidden data-multi></label><button type="button" class="btn ghost sm" data-pickp>+ Ajouter depuis la médiathèque</button></div></div><div class="photos" id="photos"></div></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button></div></form>`);
  }
  lieu.after = id => {
    const l = cache.l; let photos = [...(l.photos || [])];
    const draw = () => { $('#photos').innerHTML = photos.map((s, i) => vigGalerie(s, i)).join('') || '<p class="muted">Aucune photo.</p>'; };
    draw();
    $('#photos').addEventListener('click', e => { const f = e.target.closest('[data-i]'); if (!f) return; const i = +f.dataset.i; if (e.target.closest('[data-rm]') && confirmerRetrait()) { photos.splice(i, 1); draw(); } if (e.target.closest('[data-main]')) { photos.unshift(...photos.splice(i, 1)); draw(); } });
    let dragI = null;
    $('#photos').addEventListener('dragstart', e => { dragI = +e.target.closest('[data-i]').dataset.i; });
    $('#photos').addEventListener('dragover', e => e.preventDefault());
    $('#photos').addEventListener('drop', e => { e.preventDefault(); const t = e.target.closest('[data-i]'); if (!t) return; const [m] = photos.splice(dragI, 1); photos.splice(+t.dataset.i, 0, m); draw(); });
    $('[data-multi]').addEventListener('change', async e => { for (const f of e.target.files) { try { photos.push(await uploadFile(f)); draw(); } catch (err) { toast(err.message, true); } } });
    $('[data-pickp]').addEventListener('click', async () => { const u = await pickMedia(); if (u) { photos.push(u); draw(); } });
    if (!l.type) $('[data-typel]').value = '';
    $('[data-typel]').addEventListener('change', e => { const a = e.target.value === '__autre', i = $('[name=typeAutre]'); i.hidden = !a; if (a) i.focus(); });
    $('[data-evall]').addEventListener('click', () => document.querySelectorAll('.ev-lieu input').forEach(x => { x.checked = true; }));
    $('[data-evnone]').addEventListener('click', () => document.querySelectorAll('.ev-lieu input').forEach(x => { x.checked = false; }));
    /* « Voir la présentation sur le site » : si la fiche a été modifiée, on enregistre d’abord, puis on ouvre la page publique (aperçu équipe, marche aussi pour un lieu masqué) */
    let modifie = false; const marquer = () => { modifie = true; };
    $('#lf2').addEventListener('input', marquer); $('#lf2').addEventListener('change', marquer);
    for (const [sel, ev] of [['#photos', 'click'], ['#photos', 'drop'], ['[data-multi]', 'change'], ['[data-pickp]', 'click']]) $(sel).addEventListener(ev, marquer);
    $('[data-voirlieu]').addEventListener('click', async e => {
      if (!modifie) return; e.preventDefault();
      const href = e.currentTarget.href, w = window.open('about:blank', '_blank');
      try { await enregistrer(); if (w) w.location.href = href; else location.href = href; } catch (err) { if (w) w.close(); toast(err.message, true); }
    });
    const enregistrer = async () => { const fd = new FormData($('#lf2')), { typeAutre, ...f } = Object.fromEntries(fd); const type = f.type === '__autre' ? (typeAutre || '').trim() : f.type; const evenements = fd.getAll('evenements'); await api(`${A}/lieux/${id}`, { method: 'PUT', body: { ...l, ...f, type, evenements, maison: !!f.maison, capacite: +f.capacite || null, equipements: f.equipements.split('\n').map(x => x.trim()).filter(Boolean), photos } }); Object.assign(l, { type, departement: f.departement, evenements }); modifie = false; toast('Lieu enregistré.'); };
    $('#lf2').addEventListener('submit', async e => { e.preventDefault(); await enregistrer(); });
  };

  /* ---------- photos et textes du site ---------- */
  async function site() {
    const [R, prods, BD] = await Promise.all([api(A + '/site'), cache.produits || api(A + '/produits'), api(A + '/actions/bandeaux-defaut')]);
    cache.R = R; cache.produits = prods;
    const PAGES_B = [['boutique', 'La boutique', '/boutique'], ['lieux', 'Lieux de réception', '/lieux'], ['temoignages', 'Avis clients', '/temoignages'], ['maison', 'La maison', '/maison']];
    const Ac = R.accueil || {};
    const T = R.tarifs || {};
    return page('Photos & textes du site', '<a class="btn ghost" href="/" target="_blank">Voir l’accueil ↗</a>', `<form id="sf">
      <section class="box"><h2>Les trois vidéos de l’accueil</h2><p class="muted sm">Elles défilent en grand sur ordinateur (trois panneaux) et l’une après l’autre sur téléphone. Format conseillé : MP4 muet de 10 à 20 secondes, moins de 3 Mo.</p>
        <div class="g3">${[0, 1, 2].map(i => { const v = (Ac.videos || [])[i] || {}; return `<div class="vcard"><h3>${['Gauche', 'Centre', 'Droite'][i]}</h3>${photoField(`v${i}_src`, v.src, 'Vidéo')}${photoField(`v${i}_poster`, v.poster, 'Image d’attente')}<label>Titre<input name="v${i}_titre" value="${esc(v.titre || '')}"></label><label>Lien au clic<input name="v${i}_lien" value="${esc(v.lien || '')}" placeholder="/buffet-antillais"></label></div>`; }).join('')}</div></section>
      <section class="box"><h2>Bandeaux des pages (pages d’arrivée de la publicité)</h2><label class="chk"><input type="checkbox" name="effetBandeaux" ${R.effetBandeaux !== false ? 'checked' : ''}> Effet « vidéo » sur les photos des bandeaux (zoom lent, sur toutes les pages qui n’ont pas de vidéo)</label><p class="muted sm">Le grand bandeau photo en haut de chaque page. Une vidéo, si elle est choisie, passe devant la photo (la photo s’affiche pendant le chargement).</p>
        <div class="g2">${PAGES_B.map(([k, nom, url]) => { const b0 = R.bandeaux?.[k] || {}, d = { ...(BD[k] || {}) }; if (k === 'maison' && !d.photo) d.photo = Ac.photoMaison || ''; const b = { photo: b0.photo || d.photo, video: b0.video ?? d.video, titre: b0.titre || d.titre, chapo: b0.chapo || d.chapo, bouton: b0.bouton || d.bouton }; return `<div class="vcard bcard"><h3>${nom} <a class="sm" href="${url}" target="_blank">voir ↗</a></h3>${photoField(`b_${k}_photo`, b.photo || '', 'Photo')}${photoField(`b_${k}_video`, b.video || '', 'Vidéo (facultatif)')}<label>Titre<input name="b_${k}_titre" value="${esc(b.titre || '')}" placeholder="${esc(d.titre || '')}"></label><label>Texte<textarea name="b_${k}_chapo" rows="3" placeholder="${esc(d.chapo || '')}">${esc(b.chapo || '')}</textarea></label><label>Bouton<input name="b_${k}_bouton" value="${esc(b.bouton || '')}" placeholder="${esc(d.bouton || '')}"></label>${k === 'boutique' ? `<label>Titre de présentation <small class="muted">(sous le bandeau, au-dessus des filtres)</small><input name="b_boutique_introTitre" value="${esc(b0.introTitre ?? d.introTitre ?? '')}"></label><label>Texte de présentation<textarea name="b_boutique_introTexte" rows="4">${esc(b0.introTexte ?? d.introTexte ?? '')}</textarea></label>` : ''}</div>`; }).join('')}</div></section>
      <section class="box"><h2>Textes de l’accueil</h2><label>Petit titre<input name="surtitre" value="${esc(Ac.surtitre || '')}"></label><label>Grand titre <small class="muted">(appuyez sur Entrée pour passer à la ligne)</small><textarea name="titre" rows="2">${esc(Ac.titre === 'Vos plus beaux moments ont du goût' ? 'Vos plus beaux moments\nont du goût' : (Ac.titre || ''))}</textarea></label><label>Sous-titre<input name="sousTitre" value="${esc(Ac.sousTitre || '')}"></label>
        <label>Bandeau défilant (un mot par ligne)<textarea name="bandeau" rows="4">${esc((Ac.bandeau || []).join('\n'))}</textarea></label>
        <label>Phrase d’aide sous la barre de recherche<input name="aideRecherche" value="${esc(Ac.aideRecherche ?? 'Écrivez ou dites un mot ou deux pour trouver ce que vous voulez. Exemples : paëlla, couscous, libanais.')}" placeholder="(vide = pas de phrase)"></label>
        <h3>Idées de recherche (petits rectangles)</h3><p class="muted sm">Affichées sous la barre de recherche de l’accueil et dans la fenêtre « Rechercher » de toutes les pages. Pour chacune : le texte du rectangle et ce qui s’ouvre au clic.</p><div id="sugg"></div><button type="button" class="btn ghost sm" data-addsugg>+ Ajouter une idée</button>
        <h3>Chiffres clés</h3><p class="muted sm">Les chiffres s’affichent tels que vous les saisissez. Une note « sur 5 » s’affiche avec des étoiles.</p><div class="g4">${[0, 1, 2, 3].map(i => `<div><input name="ch${i}_v" value="${esc(Ac.chiffres?.[i]?.valeur || '')}" placeholder="4,9/5"><input name="ch${i}_l" value="${esc(Ac.chiffres?.[i]?.label || '')}" placeholder="sur Google"></div>`).join('')}</div></section>
      <section class="box"><h2>Les incontournables</h2><p class="muted sm">Les prestations mises en avant sur l’accueil, dans l’ordre.</p><div class="incs">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<select name="inc${i}"><option value="">—</option>${prods.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre)).map(p => `<option value="${esc(p.slug)}"${(Ac.incontournables || [])[i] === p.slug ? ' selected' : ''}>${esc(titreTexte(p.titre))}</option>`).join('')}</select>`).join('')}</div></section>
      <section class="box"><h2>Photos des blocs</h2><div class="g2">${photoField('photoMaison', Ac.photoMaison, 'Bloc « La maison Magnolia »')}${photoField('photoCommande', Ac.photoCommande, 'Bloc « Comment commander »')}</div></section>
      <section class="box"><h2>Coordonnées</h2><div class="g2"><p class="muted sm span2">Téléphone, e-mail, adresse, SIRET, banque… : dans <a href="#/entreprise">🏢 Mon entreprise</a>.</p><label>Horaires<input name="horaires" value="${esc(R.horaires || '')}"></label><label>Slogan<input name="slogan" value="${esc(R.slogan || '')}"></label><label>Instagram<input name="instagram" value="${esc(R.instagram || '')}"></label><label>Note Google<input name="g_note" value="${esc(R.avisGoogle?.note || '')}"></label><label>Nombre d’avis Google<input name="g_nombre" value="${esc(R.avisGoogle?.nombre || '')}"></label></div><label>Mention en bas de page<input name="mentionPied" value="${esc(R.mentionPied || '')}"></label></section>
      <section class="box" data-tarifs><h2>Tarifs communs (TTC)${peut('prix') ? '' : ' <span class="pill">🔒 verrouillés pour votre compte</span>'}</h2><div class="g3"><label>Personnel (€ / heure)<input name="ph" value="${fromCents(T.personnel?.heureCents)}"></label><label>Heures minimum<select name="pmin">${[2, 3, 4, 5, 6].map(n => `<option${(T.personnel?.minHeures || 4) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Petit pack (€ / pers.)<input name="pk0" value="${fromCents(T.packs?.[0]?.prixCents)}"></label><label>Grand pack (€ / pers.)<input name="pk1" value="${fromCents(T.packs?.[1]?.prixCents)}"></label><label>Acompte par défaut<select name="acompte">${[20, 30, 40, 50].map(n => `<option value="${n}"${(T.acomptePct ?? 50) === n ? ' selected' : ''}>${n} %</option>`).join('')}</select></label><label>Paiement total en dessous de (€ TTC)<input name="seuilAcompte" value="${fromCents(T.seuilAcompteCents ?? 80000)}" inputmode="decimal"></label></div>
        <h3 class="lp-t">🚚 Frais de livraison par paliers <small class="muted">prix du km aller-retour TTC selon le total TTC de la commande · 0 = offerte · hors Île-de-France : sur consultation</small></h3>
        <div class="lp">${(() => { const P = window.MGLivr ? MGLivr.paliers(T) : []; const fixes = P.filter(x => x.jusquaCents != null), der = P[P.length - 1] || { kmCents: 0 };
          const rows = [...fixes, { jusquaCents: null, kmCents: null }];
          return rows.map((x, i) => `<div class="lp-r"><span>${i === 0 ? 'Commande de 0 €' : `Commande au-delà de ${fromCents(rows[i - 1].jusquaCents)} €`}</span><label>jusqu’à (€ TTC)<input name="lpj${i}" inputmode="decimal" value="${fromCents(x.jusquaCents)}" placeholder="${i === fixes.length ? 'nouveau palier (facultatif)' : ''}"></label><label>prix du km (€)<input name="lpk${i}" inputmode="decimal" value="${fromCents(x.kmCents)}"></label></div>`).join('')
            + `<div class="lp-r lp-fin"><span>Au-delà du dernier palier</span><label>prix du km (€, 0 = offerte)<input name="lpkfin" inputmode="decimal" value="${fromCents(der.kmCents)}"></label></div><div class="lp-r lp-fin"><span>Coût réel du km pour Magnolia (livreur + véhicule)</span><label>coût du km (€ TTC) : plein tarif des devis, remise selon le palier, compté dans la marge<input name="lpcout" inputmode="decimal" value="${fromCents(window.MGLivr ? MGLivr.coutKmCents(T) : 100)}"></label></div><p class="muted small">Pour retirer un palier, videz sa case « jusqu’à ». Les paliers sont rangés automatiquement du plus petit au plus grand montant.</p>`; })()}</div></section>
      <section class="box"><h2>Publicité Google Ads</h2><p class="muted sm">Renseignez l’identifiant du compte (AW-…) et les libellés de conversion donnés par Google Ads. Chaque demande de devis envoyée est alors comptée, avec son montant estimé. Rien n’est mesuré sans l’accord du visiteur.</p><div class="g3"><label>Identifiant du compte<input name="ads_id" value="${esc(R.suivi?.googleAdsId || '')}" placeholder="AW-123456789"></label><label>Libellé « demande de devis »<input name="ads_dem" value="${esc(R.suivi?.conversionDemande || '')}"></label><label>Libellé « message de contact »<input name="ads_con" value="${esc(R.suivi?.conversionContact || '')}"></label></div></section>
      <section class="box"><h2>Redirections (bascule de l’ancien site)</h2><p class="muted sm">Une ligne par ancienne adresse : « /ancienne-page /nouvelle-page ». Une ancienne adresse finissant par * couvre toutes les pages qui commencent pareil. Google transfère alors le référencement (redirection 301).</p><textarea name="redirections" rows="5" class="mono" placeholder="/nos-buffets /saveurs-du-monde&#10;/blog/* /conseils">${esc(R.redirections || '')}</textarea></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button><span class="muted" id="dirty"></span></div></form>`);
  }
  site.after = async () => {
    if (!peut('prix')) $$('[data-tarifs] input, [data-tarifs] select').forEach(i => { i.readOnly = true; i.classList.add('verrou'); if (i.tagName === 'SELECT') i.addEventListener('mousedown', e => e.preventDefault()); });
    const form = $('#sf'); bindPhotos(form);
    const [rubs, lieuxL] = await Promise.all([cache.rubriques || api(A + '/rubriques'), api(A + '/lieux')]);
    const DEST = [['', 'Rechercher ce mot'], ['/boutique', 'La boutique (tout)'], ...rubs.filter(r => r.statut !== 'masque').sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).flatMap(r => [['/' + r.slug, 'Univers · ' + r.nom], ...(r.sous || []).map(x => [`/${r.slug}/${x.slug}`, '   ' + r.nom + ' › ' + x.nom])]),
      ['/lieux', 'Lieux de réception (tous)'], ...lieuxL.filter(l => l.statut !== 'masque').map(l => ['/lieux/' + l.slug, '   Lieu · ' + l.nom]), ['/maison', 'La maison'], ['/temoignages', 'Avis clients'], ['/zone-de-livraison', 'Nos zones de livraison'], ['/comment-commander', 'Comment commander'], ['/contact', 'Contact']];
    let sugg = (cache.R.accueil?.suggestions || []).map(x => typeof x === 'string' ? { label: x, lien: '' } : { ...x });
    const lireSugg = () => { $$('#sugg .sgrow').forEach((row, i) => { sugg[i].label = $('[data-l]', row).value.trim(); sugg[i].lien = $('[data-d]', row).value; }); return sugg; };
    const drawSugg = () => {
      $('#sugg').innerHTML = sugg.map((x, i) => `<div class="sgrow" data-i="${i}"><input data-l value="${esc(x.label)}" placeholder="Texte du rectangle" aria-label="Texte"><select data-d aria-label="Ouvre">${(DEST.some(d => d[0] === (x.lien || '')) ? DEST : [...DEST, [x.lien, x.lien]]).map(([v, t]) => `<option value="${esc(v)}"${v === (x.lien || '') ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select><button type="button" class="btn ghost sm" data-u ${i ? '' : 'disabled'} title="Monter">↑</button><button type="button" class="btn ghost sm" data-dn ${i < sugg.length - 1 ? '' : 'disabled'} title="Descendre">↓</button><button type="button" class="btn ghost sm" data-x title="Supprimer">🗑</button></div>`).join('') || '<p class="muted sm">Aucune idée.</p>';
    };
    drawSugg();
    $('#sugg').addEventListener('click', e => {
      const row = e.target.closest('[data-i]'); if (!row) return; const i = +row.dataset.i; lireSugg();
      if (e.target.closest('[data-u]')) [sugg[i - 1], sugg[i]] = [sugg[i], sugg[i - 1]];
      else if (e.target.closest('[data-dn]')) [sugg[i + 1], sugg[i]] = [sugg[i], sugg[i + 1]];
      else if (e.target.closest('[data-x]')) sugg.splice(i, 1);
      else return;
      drawSugg(); $('#dirty').textContent = 'Modifications non enregistrées';
    });
    $('[data-addsugg]').addEventListener('click', () => { lireSugg(); sugg.push({ label: '', lien: '' }); drawSugg(); $$('#sugg [data-l]').pop().focus(); });
    form.addEventListener('input', () => { $('#dirty').textContent = 'Modifications non enregistrées'; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form)); const R = cache.R; const T = R.tarifs || {};
      const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
      const next = { ...R,
        accueil: { ...(R.accueil || {}), surtitre: f.surtitre, titre: f.titre, sousTitre: f.sousTitre, bandeau: lines(f.bandeau), aideRecherche: f.aideRecherche ?? '', suggestions: lireSugg().filter(x => x.label),
          videos: [0, 1, 2].map(i => ({ src: f[`v${i}_src`], poster: f[`v${i}_poster`], titre: f[`v${i}_titre`], lien: f[`v${i}_lien`] })).filter(v => v.src),
          chiffres: [0, 1, 2, 3].map(i => ({ valeur: f[`ch${i}_v`], label: f[`ch${i}_l`] })).filter(c => c.valeur),
          incontournables: [0, 1, 2, 3, 4, 5, 6, 7].map(i => f['inc' + i]).filter(Boolean), photoMaison: f.photoMaison, photoCommande: f.photoCommande },
        horaires: f.horaires, slogan: f.slogan, instagram: f.instagram, mentionPied: f.mentionPied,
        avisGoogle: { ...(R.avisGoogle || {}), note: f.g_note, nombre: f.g_nombre },
        tarifs: { ...T, livraisonCoutKmCents: toCents(f.lpcout) ?? 100, livraisonPaliers: [...Object.keys(f).filter(k => /^lpj\d+$/.test(k)).map(k => ({ jusquaCents: toCents(f[k]), kmCents: toCents(f['lpk' + k.slice(3)]) ?? 0 })).filter(x => x.jusquaCents != null && x.jusquaCents > 0), { jusquaCents: null, kmCents: toCents(f.lpkfin) ?? 0 }], acomptePct: +f.acompte, seuilAcompteCents: toCents(f.seuilAcompte) ?? 80000, personnel: { ...(T.personnel || {}), heureCents: toCents(f.ph), minHeures: +f.pmin }, packs: (T.packs || []).map((pk, i) => ({ ...pk, prixCents: toCents(f['pk' + i]) ?? pk.prixCents })) },
        suivi: { googleAdsId: String(f.ads_id || '').trim().toUpperCase(), conversionDemande: String(f.ads_dem || '').trim(), conversionContact: String(f.ads_con || '').trim() },
        redirections: f.redirections || '',
        effetBandeaux: !!f.effetBandeaux,
        bandeaux: Object.fromEntries(['boutique', 'lieux', 'temoignages', 'maison'].map(k => [k, { ...(R.bandeaux?.[k] || {}), photo: f[`b_${k}_photo`] || '', video: f[`b_${k}_video`] || '', titre: (f[`b_${k}_titre`] || '').trim(), chapo: (f[`b_${k}_chapo`] || '').trim(), bouton: (f[`b_${k}_bouton`] || '').trim(), ...(k === 'boutique' ? { introTitre: (f.b_boutique_introTitre ?? '').trim(), introTexte: (f.b_boutique_introTexte ?? '').trim() } : {}) }])) };
      await api(A + '/site', { method: 'PUT', body: next }); cache.R = next; $('#dirty').textContent = ''; toast('Enregistré : en ligne immédiatement.');
    });
  };

  /* ---------- avis ---------- */
  async function avis() {
    const list = (await api(A + '/avis')).sort((a, b) => (b.statut === 'attente') - (a.statut === 'attente') || (a.ordre ?? 0) - (b.ordre ?? 0));
    cache.avis = list;
    return page('Avis clients', '<button class="btn" data-newa>+ Ajouter un avis</button>', `<p class="muted">Les 3 avis « En vedette » apparaissent sur l’accueil ; tous les avis visibles sont sur la page Témoignages.</p><div class="avl">${list.map(a => `<div class="box av${a.statut === 'attente' ? ' hl' : ''}" data-id="${a.id}">${a.statut === 'attente' ? `<p class="sm"><span class="pill d-envoye">À relire</span> ${'★'.repeat(a.note || 5)} · ${esc(a.evenement || '')} · <a href="mailto:${esc(a.email || '')}">${esc(a.email || '')}</a></p>` : ''}<textarea rows="3" data-t>${esc(a.texte)}</textarea><div class="row"><input data-a value="${esc(a.auteur || '')}" placeholder="Auteur, ville · date"><select data-s>${a.statut === 'attente' ? '<option value="attente" selected>À relire</option>' : ''}<option value="visible">Visible</option><option value="vedette"${a.statut === 'vedette' ? ' selected' : ''}>En vedette</option><option value="masque"${a.statut === 'masque' ? ' selected' : ''}>Masqué</option></select><button class="btn ghost sm" data-save>Enregistrer</button></div></div>`).join('')}</div>`);
  }
  avis.after = () => {
    $$('.av').forEach(b => $('[data-save]', b).addEventListener('click', async () => { await api(`${A}/avis/${b.dataset.id}`, { method: 'PUT', body: { ...(cache.avis.find(x => x.id === b.dataset.id) || {}), texte: $('[data-t]', b).value, auteur: $('[data-a]', b).value, statut: $('[data-s]', b).value } }); toast('Avis enregistré.'); render(); }));
    $('[data-newa]').addEventListener('click', async () => { await api(A + '/avis', { method: 'POST', body: { texte: 'Nouvel avis…', auteur: '', statut: 'masque', ordre: -1, note: 5 } }); render(); });
  };

  /* ---------- Blog « Nos événements en reportage » (Jean-Luc, 2026-11-27) ----------
     #/blog : liste + rappel ; #/blog/nouveau : quelques lignes + photos → l'IA rédige ; #/blog/:id : relire, corriger, publier */
  const BLOG_CAT = { entreprise: 'Entreprise', particulier: 'Particulier', maison: 'La maison Magnolia' }; /* « La maison Magnolia » : achats, fournisseurs, nouveaux produits, nouveau département… */
  const BL = {};
  /* photo réduite pour que l'IA la voie (JPEG 1000 px, ~100 Ko) */
  async function miniatureIa(src) {
    const im = new Image(); im.decoding = 'async'; im.src = src;
    await im.decode();
    const k = Math.min(1, 1000 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.72).split(',')[1];
  }
  async function miniaturesIa(photos) { const out = []; for (const p of photos.slice(0, 20)) { try { out.push(await miniatureIa(p.src)); } catch { out.push(null); } } return out; }
  const dateLongue = d => d ? new Date(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':00', ' h').replace(/(\d+):(\d+)/, '$1 h $2') : '—';
  /* galerie de photos du reportage : ajout (clic, glisser, médiathèque), ordre, légende, suppression */
  function galerieBlog(box, photos, { onChange = () => {}, legendes = true } = {}) {
    const draw = () => {
      box.innerHTML = photos.map((ph, i) => ph.envoi
        ? `<figure class="ph-envoi"><div class="ph-img"><img src="${esc(ph.src)}" alt=""><span class="ph-sablier">Envoi…</span></div></figure>`
        : `<figure class="ph${i === 0 ? ' main' : ''}" draggable="true" data-i="${i}"><div class="ph-img"><img src="${esc(ph.src)}" alt="">${i === 0 ? '<span class="ph-badge">★ Grande photo du haut</span>' : ''}</div>
          <div class="ph-act">${i ? '<button type="button" data-main title="Mettre en grande photo du haut">★ En haut</button>' : ''}<button type="button" class="ph-del" data-rm>🗑 Retirer</button></div>${legendes ? `<input value="${esc(ph.legende || '')}" placeholder="Légende (facultatif)" data-leg>` : ''}</figure>`).join('')
        + `<label class="gal-ajout" data-drop><input type="file" accept="image/*,.heic,.heif" multiple hidden data-multi><span class="ga-plus">+</span><b>Ajouter des photos</b><span>Cliquez ou glissez vos photos ici</span><span class="ga-tel">Sur iPhone : Photothèque ou appareil photo</span></label>
          <button type="button" class="gal-ajout gal-media" data-pickp><span class="ga-plus">▦</span><b>Médiathèque</b><span>Reprendre une photo déjà envoyée</span></button>`;
    };
    const envoyer = async files => {
      const imgs = [...files].filter(f => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name || ''));
      if (!imgs.length) return toast('Choisissez des photos (JPG, PNG, WebP…).', true);
      const lots = imgs.map(f => { const x = { src: URL.createObjectURL(f), envoi: true, legende: '' }; photos.push(x); return [f, x]; });
      draw();
      const refus = [];
      for (const [f, x] of lots) {
        try { const url = await uploadFile(f); URL.revokeObjectURL(x.src); x.src = url; delete x.envoi; }
        catch (err) { photos.splice(photos.indexOf(x), 1); refus.push(`« ${f.name} » : ${err.message}`); }
        draw();
      }
      onChange();
      if (refus.length) toast((refus.length > 1 ? refus.length + ' photos non ajoutées. ' : 'Photo non ajoutée. ') + refus[0], true);
      else toast(lots.length > 1 ? `${lots.length} photos ajoutées.` : 'Photo ajoutée.');
    };
    let dragI = null;
    box.addEventListener('change', e => { if (e.target.matches('[data-multi]')) { envoyer(e.target.files); e.target.value = ''; } });
    box.addEventListener('input', e => { if (e.target.matches('[data-leg]')) { photos[+e.target.closest('[data-i]').dataset.i].legende = e.target.value; onChange(true); } });
    box.addEventListener('click', async e => {
      if (e.target.closest('[data-pickp]')) { const u = await pickMedia(); if (u && !/\.mp4$/i.test(u)) { photos.push({ src: u, legende: '' }); draw(); onChange(); } return; }
      const f = e.target.closest('[data-i]'); if (!f) return; const i = +f.dataset.i;
      if (e.target.closest('[data-rm]')) { photos.splice(i, 1); draw(); onChange(); }
      if (e.target.closest('[data-main]')) { photos.unshift(...photos.splice(i, 1)); draw(); onChange(); }
    });
    box.addEventListener('dragstart', e => { const f = e.target.closest?.('[data-i]'); dragI = f ? +f.dataset.i : null; });
    box.addEventListener('dragend', () => { dragI = null; box.classList.remove('survol'); });
    box.addEventListener('dragover', e => { e.preventDefault(); if (dragI == null) box.classList.add('survol'); });
    box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.classList.remove('survol'); });
    box.addEventListener('drop', e => {
      e.preventDefault(); box.classList.remove('survol');
      if (dragI == null) { if (e.dataTransfer?.files?.length) envoyer(e.dataTransfer.files); return; }
      const t = e.target.closest('[data-i]'); const de = dragI; dragI = null;
      if (t == null || +t.dataset.i === de) return;
      const [m] = photos.splice(de, 1); photos.splice(+t.dataset.i, 0, m); draw(); onChange();
    });
    draw();
    return { draw, enCours: () => photos.some(x => x.envoi) };
  }
  async function blog(id) {
    if (id === 'nouveau') return blogNouveau();
    if (id) return blogArticle(id);
    const r = await api(A + '/blog'); BL.l = r;
    const e = r.rappel, g = r.reglages;
    const carte = a => { const p = a.photos?.[0]; return `<a class="bl-c" href="#/blog/${esc(a.id)}"><span class="bl-img">${p ? `<img src="${esc(p.src)}" alt="" loading="lazy">` : '<span class="muted sm">Pas de photo</span>'}</span>
      <span class="bl-t"><span class="row">${a.statut === 'publie' ? '<span class="pill d-accepte">✓ Publié</span>' : '<span class="pill d-envoye">Brouillon à relire</span>'}<small class="muted">${esc(BLOG_CAT[a.categorie] || '')}${a.invites ? ' · ' + a.invites + ' invités' : ''}</small></span>
      <b>${esc(a.titre || 'Sans titre')}</b><small class="muted">${a.statut === 'publie' ? 'Publié le ' + dateFr(a.publieLe) : 'Créé le ' + dateFr(a.createdAt)}${a.creePar ? ' · ' + esc(a.creePar) : ''}</small></span></a>`; };
    const tel = g.tel || g.alertesSms, mail = g.email || g.alertesEmails;
    return page('📝 Blog · nos reportages', `<a class="btn" href="#/blog/nouveau">✨ Nouveau reportage avec l’IA</a><a class="btn ghost" href="/blog" target="_blank" rel="noopener">Voir le blog ↗</a>`, `
      ${e.aFaire && e.actif ? `<section class="box hl bl-rappel"><div><b>⏰ C’est le moment de préparer le prochain reportage.</b><p class="muted sm">${e.dernierePublication ? 'Dernier reportage publié le ' + dateFr(e.dernierePublication) + '.' : 'Aucun reportage publié pour l’instant.'} Quelques lignes + vos photos : l’IA s’occupe du reste.</p></div><a class="btn" href="#/blog/nouveau">✨ Écrire le reportage</a></section>` : ''}
      <p class="muted">Après chaque événement, racontez-le en quelques lignes et ajoutez vos photos : l’IA rédige et met en page tout le reportage. Vous le relisez, vous le corrigez si besoin, puis vous cliquez sur « Publier ». Les reportages publiés s’affichent sur l’accueil (après « Comment commander ») et sur la page <a href="/blog" target="_blank">Le blog</a>.</p>
      ${r.articles.length ? `<div class="bl-l">${r.articles.map(carte).join('')}</div>` : `<section class="box bl-vide"><p><b>Aucun reportage pour l’instant.</b></p><p class="muted">Commencez par le premier : l’événement italien dans le hangar, par exemple.</p><a class="btn" href="#/blog/nouveau">✨ Écrire mon premier reportage</a></section>`}
      <section class="box"><h2>⏰ Rappel automatique</h2>
        <p class="muted sm">Un SMS et un e-mail vous rappellent de préparer le reportage suivant, ${esc(String(e.jours))} jours après la dernière publication (ou le dernier rappel). ${e.actif ? `Prochain rappel : <b>${e.aFaire ? 'aujourd’hui, dès ' + e.heure + ' h' : esc(dateLongue(e.prochain) .replace(/\d+ h( \d+)?$/, e.heure + ' h'))}</b>.` : '<b>Rappel arrêté.</b>'}</p>
        <form id="blRap" class="bl-rap">
          <label class="ck"><input type="checkbox" name="actif"${g.actif ? ' checked' : ''}> Envoyer le rappel</label>
          <div class="g3"><label>Tous les<select name="jours">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => `<option value="${n}"${+g.jours === n ? ' selected' : ''}>${n} jour${n > 1 ? 's' : ''}</option>`).join('')}</select></label>
          <label>À partir de<select name="heure">${[7, 8, 9, 10, 11, 12, 14, 16, 18].map(n => `<option value="${n}"${+g.heure === n ? ' selected' : ''}>${n} h</option>`).join('')}</select></label><span></span></div>
          <div class="g2"><label>Portable(s) pour le SMS <small class="muted">séparés par une virgule</small><input name="tel" value="${esc(g.tel)}" placeholder="${esc(g.alertesSms ? 'Vide = ' + g.alertesSms + ' (alertes de l’équipe)' : '06 12 34 56 78')}"></label>
          <label>E-mail(s) <small class="muted">séparés par une virgule</small><input name="email" value="${esc(g.email)}" placeholder="${esc(g.alertesEmails ? 'Vide = ' + g.alertesEmails : 'infos@magnoliatraiteur.fr')}"></label></div>
          ${!tel && !mail ? '<p class="gal-err">Aucun numéro ni e-mail : indiquez au moins un portable pour recevoir le rappel.</p>' : ''}
          <div class="row"><button class="btn">Enregistrer</button><button type="button" class="btn ghost" data-blessai>📨 M’envoyer un essai</button></div></form></section>`);
  }
  blog.after = id => {
    if (id === 'nouveau') return blogNouveau.after();
    if (id) return blogArticle.after(id);
    const f = $('#blRap');
    f?.addEventListener('submit', async e => {
      e.preventDefault();
      try { await api(A + '/blog/reglages', { method: 'PUT', body: { actif: f.actif.checked, jours: f.jours.value, heure: f.heure.value, tel: f.tel.value, email: f.email.value } }); toast('Rappel enregistré.'); render(); } catch (err) { toast(err.message, true); }
    });
    $('[data-blessai]')?.addEventListener('click', async () => {
      try { await api(A + '/blog/reglages', { method: 'PUT', body: { actif: f.actif.checked, jours: f.jours.value, heure: f.heure.value, tel: f.tel.value, email: f.email.value } }); const r = await api(A + '/blog/rappel-essai', { method: 'POST' }); toast(`Essai envoyé : ${r.sms} SMS, ${r.emails} e-mail${r.emails > 1 ? 's' : ''}.`); } catch (err) { toast(err.message, true); }
    });
  };

  /* écran « Nouveau reportage » : le brouillon (texte + photos) est gardé sur l'appareil tant que l'IA n'a pas écrit */
  const BL_MEM = 'mg_blog_nouveau';
  async function blogNouveau() {
    const r = BL.l || await api(A + '/blog'); BL.l = r;
    let d = {}; try { d = JSON.parse(mem.get(BL_MEM) || '{}') || {}; } catch { d = {}; }
    BL.n = { photos: Array.isArray(d.photos) ? d.photos.filter(p => p && p.src && !/^blob:/.test(p.src)) : [], video: d.video || '' };
    return page('✨ Nouveau reportage', '<a class="btn ghost" href="#/blog">← Tous les reportages</a>', `${r.ia ? '' : '<p class="gal-err">L’IA n’est pas branchée (clé ANTHROPIC_API_KEY manquante dans Railway).</p>'}
      <form id="blN" class="bl-n">
      <section class="box"><h2><span class="df-n">1</span>Racontez l’événement ou l’histoire</h2>
        <p class="muted sm">Quelques lignes suffisent, comme vous le raconteriez à un client : pour qui, où, combien d’invités, ce qui a été servi, l’ambiance, ce qui a plu, une phrase du client si vous l’avez. Pour « La maison Magnolia », racontez simplement l’histoire : un achat, un nouveau fournisseur, un nouveau produit, un nouveau département… L’IA n’invente rien : ce que vous n’écrivez pas, elle ne le dit pas.</p>
        <textarea name="notes" rows="9" placeholder="Ex. : Soirée pour une entreprise italienne (Milan) dans un hangar à Massy, 400 personnes. Buffet italien : antipasti, charcuterie, lasagnes, tiramisu. Bar à spritz à l’arrivée. 14 serveurs et maîtres d’hôtel. Le client nous a dit : « Nos collègues italiens se sont crus à la maison. »">${esc(d.notes || '')}</textarea>
        <div class="row"><button type="button" class="btn ghost sm" data-dictee>🎤 Dicter</button><small class="muted" data-blnb></small><span class="muted sm" data-blmicmsg></span></div>
        <details class="bl-plus"${d.categorie || d.dateEvenement || d.lieu || d.invites ? ' open' : ''}><summary>Préciser (facultatif) : rubrique, date, lieu, invités</summary>
        <div class="g3"><label>Rubrique<select name="categorie"><option value="">L’IA choisit</option>${Object.entries(BLOG_CAT).map(([k, v]) => `<option value="${k}"${d.categorie === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Type d’événement ou d’histoire<select name="typeEvenement"><option value="">L’IA choisit</option>${(r.types || []).map(t => `<option${d.typeEvenement === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Date de l’événement<input type="date" name="dateEvenement" value="${esc(d.dateEvenement || '')}"></label>
        <label>Lieu <small class="muted">(ville ou type de lieu)</small><input name="lieu" value="${esc(d.lieu || '')}" placeholder="ex. Massy (91), un hangar"></label>
        <label>Nombre d’invités<input name="invites" inputmode="numeric" value="${esc(d.invites || '')}" placeholder="ex. 400"></label></div></details>
      </section>
      <section class="box"><div class="bh"><h2><span class="df-n">2</span>Ajoutez vos photos</h2><span class="gal-nb" data-blphn></span></div>
        <p class="muted sm">Mettez toutes les belles photos de l’événement (jusqu’à 40). L’IA les regarde, choisit la plus belle pour le haut de la page, les range et écrit les légendes. Vous pourrez tout changer ensuite.</p>
        <div class="photos gal-bo" id="blPh"></div>
        <h3 class="sub">Vidéo <small class="muted">facultatif</small></h3><div class="row"><span data-blvid class="muted sm">${d.video ? esc(nomFichier(d.video)) : 'Aucune vidéo'}</span><button type="button" class="btn ghost sm" data-blvidp>🎬 Choisir dans la médiathèque</button>${d.video ? '<button type="button" class="btn ghost sm" data-blvidx>✕ Retirer</button>' : ''}</div>
      </section>
      <div class="actions sticky bl-go"><button class="btn db-or" data-blgo>✨ Écrire le reportage avec l’IA</button><span class="muted sm" data-blet>L’IA rédige et met en page en 1 minute environ. Rien n’est publié sans votre accord.</span></div>
      </form>`);
  }
  blogNouveau.after = () => {
    const f = $('#blN'), n = BL.n;
    const garder = () => { const o = Object.fromEntries(new FormData(f)); mem.set(BL_MEM, JSON.stringify({ ...o, photos: n.photos.filter(p => !p.envoi), video: n.video })); $('[data-blphn]').textContent = n.photos.length ? `(${n.photos.length} photo${n.photos.length > 1 ? 's' : ''})` : ''; $('[data-blnb]').textContent = f.notes.value.trim() ? f.notes.value.trim().split(/\s+/).length + ' mots' : ''; };
    const gal = galerieBlog($('#blPh'), n.photos, { onChange: garder, legendes: false });
    f.addEventListener('input', garder); f.addEventListener('change', garder); garder();
    micPour($('[data-dictee]', f), f.notes, $('[data-blmicmsg]', f));
    $('[data-blvidp]').addEventListener('click', async () => { const u = await pickMedia(); if (!u) return; if (!/\.mp4$/i.test(u)) return toast('Choisissez une vidéo (fichier .mp4).', true); n.video = u; garder(); render(); });
    $('[data-blvidx]')?.addEventListener('click', () => { n.video = ''; garder(); render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (f.notes.value.trim().length < 15) { toast('Écrivez quelques lignes sur l’événement.', true); f.notes.focus(); return; }
      if (gal.enCours()) return toast('Attendez la fin de l’envoi des photos.', true);
      if (!n.photos.length && !confirm('Aucune photo : un reportage sans photo est beaucoup moins beau.\n\nContinuer quand même ?')) return;
      const btn = $('[data-blgo]'), et = $('[data-blet]');
      btn.disabled = true; btn.textContent = '✨ L’IA regarde vos photos…';
      const t0 = Date.now(), tic = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); et.textContent = s < 20 ? 'L’IA regarde vos photos et lit vos notes…' : s < 50 ? 'Elle rédige le reportage…' : 'Elle met en page et écrit les légendes… encore quelques secondes.'; btn.textContent = `✨ Rédaction en cours (${s} s)`; }, 1000);
      try {
        const o = Object.fromEntries(new FormData(f));
        const images = (await miniaturesIa(n.photos)).map(x => x || '');
        const r = await api(A + '/ia/blog', { method: 'POST', body: { ...o, photos: n.photos.filter(p => !p.envoi), video: n.video, images } });
        mem.set(BL_MEM, ''); BL.l = null;
        toast('✨ Reportage rédigé : relisez-le, corrigez si besoin, puis publiez.');
        location.hash = '#/blog/' + r.id;
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = '✨ Écrire le reportage avec l’IA'; et.textContent = 'Réessayez : votre texte et vos photos sont gardés.'; }
      finally { clearInterval(tic); }
    });
  };

  /* relecture d'un reportage : tout se corrige à la main, ou en demandant à l'IA */
  async function blogArticle(id) {
    const [a, l] = await Promise.all([api(A + '/blog/' + id), cache.produits ? Promise.resolve(cache.produits) : api(A + '/produits')]);
    cache.produits = l; BL.a = a;
    BL.e = { photos: (a.photos || []).map(p => ({ ...p })), sections: (a.sections || []).map(s => ({ ...s })), produits: [...(a.produits || [])], video: a.video || '' };
    const types = (BL.l?.types) || (await api(A + '/blog')).types;
    const pub = a.statut === 'publie';
    const ch = a.chiffres || [];
    return page(`${esc(a.titre || 'Reportage')} ${pub ? '<span class="pill d-accepte">✓ Publié</span>' : '<span class="pill d-envoye">Brouillon</span>'}`, `<a class="btn ghost" href="#/blog">← Tous les reportages</a><button type="button" class="btn ghost" data-blvoir>👁 Voir le blog</button>`, `
      <section class="box hl bl-ia"><h2>✨ Demander une modification à l’IA</h2>
        <p class="muted sm">Ex. : « plus court », « parle davantage du bar à spritz », « ton plus chaleureux », « ajoute que le montage a pris une journée ». L’IA réécrit le reportage ; vous relisez avant de publier.</p>
        <div class="bl-ia-row"><textarea data-blcons rows="2" placeholder="Votre demande à l’IA… (tapez ou dictez avec 🎤)"></textarea><div class="bl-ia-btns"><button type="button" class="btn ghost" data-blmic>🎤 Dicter</button><button type="button" class="btn" data-blre>✨ Réécrire</button></div></div><p class="muted sm" data-blmicmsg></p>
        <details><summary class="sm">Vos notes de départ</summary><textarea data-blnotes rows="5">${esc(a.notes || '')}</textarea><div class="row"><button type="button" class="btn ghost sm" data-blnotesmic>🎤 Dicter</button><span class="muted sm" data-blmicmsg2></span></div><p class="muted sm">L’IA s’appuie sur ces notes : complétez-les si une information manque (elle n’invente rien).</p></details></section>
      <form id="blA">
      <section class="box"><h2>Titre et présentation</h2>
        <label>Titre du reportage<input name="titre" value="${esc(a.titre || '')}" maxlength="160" required></label>
        <label>Introduction <small class="muted">(en grand, sous la photo)</small><textarea name="chapo" rows="3">${esc(a.chapo || '')}</textarea></label>
        <div class="g3"><label>Rubrique<select name="categorie">${Object.entries(BLOG_CAT).map(([k, v]) => `<option value="${k}"${a.categorie === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Type d’événement ou d’histoire<select name="typeEvenement"><option value="">—</option>${[...new Set([...(types || []), a.typeEvenement].filter(Boolean))].map(t => `<option${a.typeEvenement === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label>Date de l’événement<input type="date" name="dateEvenement" value="${esc(a.dateEvenement || '')}"></label>
        <label>Lieu<input name="lieu" value="${esc(a.lieu || '')}"></label><label>Nombre d’invités<input name="invites" inputmode="numeric" value="${esc(a.invites || '')}"></label></div></section>
      <section class="box"><h2>Chiffres clés <small class="muted">(bandeau sous la photo, 4 maximum)</small></h2>
        <div class="bl-chiffres">${[0, 1, 2, 3].map(i => `<div><input data-chv="${i}" value="${esc(ch[i]?.valeur || '')}" placeholder="${['400', '14', '3', '2 400'][i]}" maxlength="14"><input data-chl="${i}" value="${esc(ch[i]?.libelle || '')}" placeholder="${['invités', 'serveurs', 'buffets', 'pièces cocktail'][i]}" maxlength="40"></div>`).join('')}</div></section>
      <section class="box"><div class="bh"><h2>Le texte</h2><button type="button" class="btn ghost sm" data-secadd>+ Ajouter une partie</button></div><div id="blSec"></div></section>
      <section class="box"><div class="bh"><h2>Photos <span class="gal-nb" data-blphn></span></h2></div>
        <p class="muted sm">La première photo (cadre doré) est la grande photo du haut. Les 5 suivantes forment la mosaïque, la 7e s’affiche en grand plus bas, les autres dans « Toutes les photos ». Glissez-les pour changer l’ordre.</p>
        <div class="photos gal-bo" id="blPh"></div>
        <h3 class="sub">Vidéo <small class="muted">facultatif</small></h3><div class="row"><span data-blvid class="muted sm">${a.video ? esc(nomFichier(a.video)) : 'Aucune vidéo'}</span><button type="button" class="btn ghost sm" data-blvidp>🎬 Choisir dans la médiathèque</button><button type="button" class="btn ghost sm" data-blvidx${a.video ? '' : ' hidden'}>✕ Retirer</button></div></section>
      <section class="box"><h2>Avis du client <small class="muted">(facultatif)</small></h2>
        <p class="muted sm">Seulement une phrase vraiment dite ou écrite par le client.</p>
        <label>Phrase du client<textarea name="citTexte" rows="2">${esc(a.citation?.texte || '')}</textarea></label><label>Qui l’a dite<input name="citAuteur" value="${esc(a.citation?.auteur || '')}" placeholder="ex. Responsable événementiel de l’entreprise"></label></section>
      <section class="box"><h2>Prestations du catalogue liées</h2><p class="muted sm">Affichées dans le reportage avec un lien vers leur fiche (« Toutes disponibles pour votre propre réception »).</p>
        <div class="chips" data-blprods></div><div class="bl-pr-add"><input type="search" data-blpq placeholder="Ajouter une prestation : tapez son nom…"><div class="bl-pr-res" data-blpres></div></div></section>
      <section class="box"><h2>Google</h2><div class="g2"><label>Titre dans Google<input name="seoTitre" value="${esc(a.seoTitre || '')}" maxlength="70"></label><label>Mots-clés <small class="muted">(séparés par une virgule)</small><input name="tags" value="${esc((a.tags || []).join(', '))}"></label></div>
        <label>Description dans Google<textarea name="seoDescription" rows="2" maxlength="170">${esc(a.seoDescription || '')}</textarea></label></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button>${pub ? '<button type="button" class="btn ghost" data-blpub="brouillon">Retirer du site</button>' : '<button type="button" class="btn db-or" data-blpub="publie">✓ Publier sur le site</button>'}<button type="button" class="btn ghost" data-blvoir>👁 Voir le blog</button><button type="button" class="btn ghost bl-del" data-bldel>🗑 Supprimer</button><span class="muted" id="dirty"></span></div>
      </form>`);
  }
  blogArticle.after = id => {
    const f = $('#blA'), e = BL.e;
    const dirty = () => { $('#dirty').textContent = 'Modifications non enregistrées'; };
    const nbPh = () => { $('[data-blphn]').textContent = `(${e.photos.length} photo${e.photos.length > 1 ? 's' : ''})`; };
    galerieBlog($('#blPh'), e.photos, { onChange: () => { dirty(); nbPh(); } }); nbPh();
    const drawSec = () => {
      $('#blSec').innerHTML = e.sections.map((s, i) => `<div class="bl-sec" data-si="${i}"><div class="row"><input data-st value="${esc(s.titre || '')}" placeholder="Intertitre${i === 0 ? ' (facultatif pour la 1re partie)' : ''}"><button type="button" class="btn ghost sm" data-sup title="Monter"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn ghost sm" data-sdn title="Descendre"${i < e.sections.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="btn ghost sm bl-del" data-srm>🗑</button></div><textarea data-sx rows="${Math.min(14, Math.max(4, Math.ceil((s.texte || '').length / 90)))}">${esc(s.texte || '')}</textarea></div>`).join('') || '<p class="muted">Aucun texte : demandez à l’IA de le rédiger, ou ajoutez une partie.</p>';
    };
    drawSec();
    $('#blSec').addEventListener('input', ev => { const b = ev.target.closest('[data-si]'); if (!b) return; const s = e.sections[+b.dataset.si]; if (ev.target.matches('[data-st]')) s.titre = ev.target.value; if (ev.target.matches('[data-sx]')) s.texte = ev.target.value; });
    $('#blSec').addEventListener('click', ev => {
      const b = ev.target.closest('[data-si]'); if (!b) return; const i = +b.dataset.si;
      if (ev.target.closest('[data-srm]')) { if (!confirm('Supprimer cette partie du texte ?')) return; e.sections.splice(i, 1); }
      else if (ev.target.closest('[data-sup]') && i) e.sections.splice(i - 1, 0, ...e.sections.splice(i, 1));
      else if (ev.target.closest('[data-sdn]')) e.sections.splice(i + 1, 0, ...e.sections.splice(i, 1));
      else return;
      drawSec(); dirty();
    });
    $('[data-secadd]').addEventListener('click', () => { e.sections.push({ titre: '', texte: '' }); drawSec(); dirty(); $$('#blSec [data-st]').pop()?.focus(); });
    /* prestations liées */
    const prods = cache.produits || [];
    const drawPr = () => { $('[data-blprods]').innerHTML = e.produits.map((s, i) => { const p = prods.find(x => x.slug === s || x.id === s); return `<span class="chip on">${esc(p ? titreTexte(p.titre) : s)} <button type="button" class="lnk" data-prx="${i}" aria-label="Retirer">✕</button></span>`; }).join('') || '<span class="muted sm">Aucune prestation liée.</span>'; };
    drawPr();
    $('[data-blprods]').addEventListener('click', ev => { const b = ev.target.closest('[data-prx]'); if (!b) return; e.produits.splice(+b.dataset.prx, 1); drawPr(); dirty(); });
    const nrm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    $('[data-blpq]').addEventListener('input', ev => {
      const q = nrm(ev.target.value).trim(); const box = $('[data-blpres]');
      if (q.length < 2) { box.innerHTML = ''; return; }
      const mots = q.split(/\s+/);
      box.innerHTML = prods.filter(p => p.statut !== 'masque' && mots.every(w => nrm(p.titre).includes(w))).slice(0, 8).map(p => `<button type="button" class="pf-opt" data-pradd="${esc(p.slug)}">${esc(titreTexte(p.titre))}</button>`).join('') || '<p class="muted sm">Aucune prestation trouvée.</p>';
    });
    $('[data-blpres]').addEventListener('click', ev => { const b = ev.target.closest('[data-pradd]'); if (!b) return; if (!e.produits.includes(b.dataset.pradd)) e.produits.push(b.dataset.pradd); drawPr(); dirty(); $('[data-blpres]').innerHTML = ''; $('[data-blpq]').value = ''; });
    /* vidéo */
    $('[data-blvidp]').addEventListener('click', async () => { const u = await pickMedia(); if (!u) return; if (!/\.mp4$/i.test(u)) return toast('Choisissez une vidéo (fichier .mp4).', true); e.video = u; $('[data-blvid]').textContent = nomFichier(u); $('[data-blvidx]').hidden = false; dirty(); });
    $('[data-blvidx]').addEventListener('click', () => { e.video = ''; $('[data-blvid]').textContent = 'Aucune vidéo'; $('[data-blvidx]').hidden = true; dirty(); });
    f.addEventListener('input', dirty);
    const donnees = statut => {
      const o = Object.fromEntries(new FormData(f));
      return { ...BL.a, titre: o.titre, chapo: o.chapo, categorie: o.categorie, typeEvenement: o.typeEvenement, dateEvenement: o.dateEvenement, lieu: o.lieu, invites: o.invites,
        chiffres: [0, 1, 2, 3].map(i => ({ valeur: $(`[data-chv="${i}"]`).value, libelle: $(`[data-chl="${i}"]`).value })),
        sections: e.sections, photos: e.photos.filter(p => !p.envoi), video: e.video, produits: e.produits,
        citation: o.citTexte.trim() ? { texte: o.citTexte, auteur: o.citAuteur } : null,
        tags: o.tags.split(','), seoTitre: o.seoTitre, seoDescription: o.seoDescription, notes: $('[data-blnotes]').value, statut: statut || BL.a.statut };
    };
    const enregistrer = async statut => { const r = await api(`${A}/blog/${id}`, { method: 'PUT', body: donnees(statut) }); BL.a = r.article; BL.l = null; $('#dirty').textContent = ''; return r.article; };
    f.addEventListener('submit', async ev => { ev.preventDefault(); try { await enregistrer(); toast('Reportage enregistré.'); } catch (err) { toast(err.message, true); } });
    $$('[data-blvoir]').forEach(b => b.addEventListener('click', async () => { const w = window.open('', '_blank'); try { const a = await enregistrer(); if (w) w.location = '/blog/' + a.slug + '?apercu'; } catch (err) { w?.close(); toast(err.message, true); } }));
    $('[data-blpub]')?.addEventListener('click', async ev => {
      const st = ev.currentTarget.dataset.blpub;
      if (st === 'brouillon' && !confirm('Retirer ce reportage du site ?\n\nIl redevient un brouillon : vous pourrez le republier.')) return;
      try { await enregistrer(st); toast(st === 'publie' ? '🎉 Reportage publié : il est en ligne sur le site et sur l’accueil.' : 'Reportage retiré du site.'); render(); } catch (err) { toast(err.message, true); }
    });
    $('[data-bldel]').addEventListener('click', async () => {
      if (!confirm('Supprimer définitivement ce reportage ?\n\nLes photos restent dans la médiathèque.')) return;
      try { await api(`${A}/blog/${id}`, { method: 'DELETE' }); BL.l = null; toast('Reportage supprimé.'); location.hash = '#/blog'; } catch (err) { toast(err.message, true); }
    });
    micPour($('[data-blmic]'), $('[data-blcons]'), $('[data-blmicmsg]'));
    micPour($('[data-blnotesmic]'), $('[data-blnotes]'), $('[data-blmicmsg2]'));
    $('[data-blre]').addEventListener('click', async ev => {
      const cons = $('[data-blcons]').value.trim();
      if (!cons) { toast('Écrivez ce que l’IA doit changer.', true); $('[data-blcons]').focus(); return; }
      const btn = ev.currentTarget; btn.disabled = true; const lib = btn.textContent; btn.textContent = '✨ L’IA réécrit…';
      try {
        await enregistrer();
        const images = (await miniaturesIa(e.photos)).map(x => x || '');
        await api(A + '/ia/blog', { method: 'POST', body: { id, consigne: cons, notes: $('[data-blnotes]').value, images } });
        toast('✨ Reportage réécrit : relisez-le avant de publier.'); render();
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = lib; }
    });
  };

  /* ---------- médiathèque ---------- */
  async function medias() {
    const m = await api(A + '/actions/medias'); cache.medias = m;
    const nomes = [...m.envoyes, ...m.site].filter(x => x.nom).length;
    return page('Médiathèque', '<label class="btn up">+ Envoyer des photos ou vidéos<input type="file" accept="image/*,video/mp4" multiple hidden data-up></label>', `<p class="muted">${m.envoyes.length} fichiers envoyés depuis le back-office · ${m.site.length} photos et vidéos reprises du brouillon · ${nomes} image${nomes > 1 ? 's' : ''} nommée${nomes > 1 ? 's' : ''}. Les photos de téléphone sont réduites automatiquement avant l’envoi.</p>
      <p class="mq-aide">👆 <b>Cliquez sur une image</b> pour lui donner un nom ou la supprimer. Pour en supprimer plusieurs, <b>cochez la case</b> dans leur coin.</p>
      <div class="bh mq-barre"><input type="search" placeholder="Rechercher par nom d’image ou de fichier…" data-mq><span class="muted sm" data-mcount></span></div>
      <div class="mq-sel" data-msel hidden><b data-mseln></b><button type="button" class="btn ghost sm" data-mtout>Tout cocher (affichées)</button><button type="button" class="btn ghost sm" data-maucun>Tout décocher</button><button type="button" class="btn danger sm" data-msupp>🗑 Supprimer la sélection</button></div>
      <div class="mgrid big"></div>`);
  }
  /* suppression : on prévient si une image sert encore quelque part sur le site, puis on demande confirmation */
  async function supprimerMedias(urls) {
    const { usages } = await api(A + '/actions/medias/usages', { method: 'POST', body: { urls } });
    const utilisees = urls.filter(u => usages[u]?.length), nb = urls.length;
    const quoi = nb > 1 ? `ces ${nb} images` : 'cette image';
    let msg = `Supprimer définitivement ${quoi} de la médiathèque ?`;
    if (utilisees.length) msg += `\n\n⚠ ATTENTION : ${utilisees.length > 1 ? utilisees.length + ' de ces images sont encore utilisées' : nb > 1 ? '1 de ces images est encore utilisée' : 'elle est encore utilisée'} sur le site :\n` + utilisees.slice(0, 8).map(u => '• ' + (nb > 1 ? nomFichier(u) + ' : ' : '') + usages[u].slice(0, 4).join(', ') + (usages[u].length > 4 ? '…' : '')).join('\n') + (utilisees.length > 8 ? '\n…' : '') + '\n\nUne fois supprimée, elle peut disparaître de ces endroits : remplacez-la d’abord si besoin.';
    if (!confirm(msg)) return false;
    const r = await api(A + '/actions/medias/supprimer', { method: 'POST', body: { urls } });
    toast(r.n > 1 ? r.n + ' images supprimées.' : 'Image supprimée.');
    return true;
  }
  /* fiche d'une image : grand aperçu, nom (enregistré pour la recherche et pour Google), suppression */
  function ficheMedia(x, { liste, apres }) {
    const dlg = document.createElement('div'); dlg.className = 'modal mf';
    const video = /mp4$/i.test(x.url);
    const idx = () => liste().findIndex(y => y.url === x.url);
    dlg.innerHTML = `<div class="modal-in mf-in"><div class="bh"><h2>${video ? 'Vidéo' : 'Image'} de la médiathèque</h2><button class="x" data-close aria-label="Fermer">×</button></div>
      <div class="mf-corps"><div class="mf-apercu">${video ? `<video src="${esc(x.url)}" controls muted playsinline></video>` : `<img src="${esc(x.url)}" alt="${esc(x.nom || '')}">`}</div>
      <form class="mf-form" data-mf><label class="mf-lab">Nom de l’image<input name="nom" value="${esc(x.nom || '')}" maxlength="140" placeholder="ex. Buffet antillais sur table de mariage" autocomplete="off" enterkeyhint="done"></label>
        <p class="muted sm">Ce nom s’affiche sous la vignette, sert à retrouver l’image avec la recherche, et décrit la photo à Google sur le site (texte alternatif). Vous pouvez le dicter avec le micro 🎤.</p>
        <div class="row"><button class="btn">Enregistrer le nom</button><button type="button" class="btn ghost" data-msuiv>Enregistrer et image suivante →</button></div>
        <p class="mf-ok" data-mok hidden>✓ Nom enregistré</p>
        <div class="mf-fichier"><span class="muted sm">Fichier : ${esc(nomFichier(x.url))}</span><a class="btn ghost sm" href="${esc(x.url)}" target="_blank">Ouvrir en grand ↗</a><button type="button" class="btn ghost sm" data-mcopie>Copier l’adresse</button></div>
        <button type="button" class="btn danger" data-msup1>🗑 Supprimer cette ${video ? 'vidéo' : 'image'}</button></form></div></div>`;
    document.body.appendChild(dlg);
    const inp = $('[name=nom]', dlg);
    const fermer = () => { dlg.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = e => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', esc_);
    const sauver = async () => {
      const nom = inp.value.replace(/\s+/g, ' ').trim();
      if (nom === (x.nom || '')) return true;
      try { await api(A + '/actions/media-nom', { method: 'PUT', body: { url: x.url, nom } }); x.nom = nom; apres.nom(x); $('[data-mok]', dlg).hidden = false; toast(nom ? 'Nom enregistré.' : 'Nom retiré.'); return true; } catch (err) { toast(err.message, true); return false; }
    };
    $('[data-mf]', dlg).addEventListener('submit', async e => { e.preventDefault(); await sauver(); });
    inp.addEventListener('input', () => { $('[data-mok]', dlg).hidden = true; });
    $('[data-msuiv]', dlg).addEventListener('click', async () => { if (!(await sauver())) return; const l = liste(), i = idx(); fermer(); const y = l[i + 1]; if (y) ficheMedia(y, { liste, apres }); else toast('C’était la dernière image de la liste.'); });
    $('[data-mcopie]', dlg).addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.origin + x.url); toast('Adresse copiée.'); } catch { prompt('Adresse de l’image :', location.origin + x.url); } });
    $('[data-msup1]', dlg).addEventListener('click', async () => { try { if (await supprimerMedias([x.url])) { fermer(); apres.suppr([x.url]); } } catch (err) { toast(err.message, true); } });
    dlg.addEventListener('click', e => { if (e.target.matches('[data-close], .modal')) fermer(); });
    if (matchMedia('(pointer: fine)').matches) inp.focus();
  }
  medias.after = () => {
    const m = cache.medias, coches = new Set();
    let items = ordreMedias([...m.envoyes, ...m.site]);
    const grille = $('.mgrid.big');
    let filtrer = grilleMedias(grille, items, 'button', coches);
    const barre = $('[data-msel]');
    const majSel = () => { barre.hidden = !coches.size; $('[data-mseln]').textContent = coches.size + (coches.size > 1 ? ' images cochées' : ' image cochée'); };
    const refaire = () => { const q = $('[data-mq]').value; filtrer = grilleMedias(grille, items, 'button', coches); filtrer(q); majSel(); };
    const apres = { nom: x => filtrer.maj(x), suppr: urls => { const S = new Set(urls); items = items.filter(x => !S.has(x.url)); urls.forEach(u => coches.delete(u)); cache.medias = { envoyes: m.envoyes.filter(x => !S.has(x.url)), site: m.site.filter(x => !S.has(x.url)) }; refaire(); } };
    grille.addEventListener('click', e => {
      const t = e.target.closest('[data-u]'); if (!t) return;
      const u = t.dataset.u, x = items.find(y => y.url === u); if (!x) return;
      if (e.target.closest('[data-coche]')) { coches.has(u) ? coches.delete(u) : coches.add(u); filtrer.maj(x); majSel(); return; }
      ficheMedia(x, { liste: () => filtrer.liste(), apres });
    });
    $('[data-mtout]').addEventListener('click', () => { filtrer.liste().forEach(x => coches.add(x.url)); refaire(); });
    $('[data-maucun]').addEventListener('click', () => { coches.clear(); refaire(); });
    $('[data-msupp]').addEventListener('click', async () => { const urls = [...coches]; if (!urls.length) return; try { if (await supprimerMedias(urls)) apres.suppr(urls); } catch (err) { toast(err.message, true); } });
    $('[data-up]').addEventListener('change', async e => { let n = 0; for (const f of e.target.files) { try { await uploadFile(f); n++; } catch (err) { toast(err.message, true); } } toast(n + ' fichier(s) envoyé(s).'); render(); });
    $('[data-mq]').addEventListener('input', e => filtrer(e.target.value));
  };

  /* ---------- mon entreprise : tout ce qui sert aux devis, factures et CGV ---------- */
  async function entreprise() {
    const R = await api(A + '/site'); cache.R = R;
    const E = R.entreprise || {}, P = R.paiement || {};
    const ch = (name, label, val, attrs = '') => `<label>${label}<input name="${name}" value="${esc(val || '')}" ${attrs}></label>`;
    return page('🏢 Mon entreprise', '<a class="btn ghost" href="/cgv" target="_blank">Voir les CGV ↗</a>', `<p class="muted">Ces informations apparaissent sur les devis, les factures et les conditions générales de vente. Une modification s’applique tout de suite, y compris aux devis déjà envoyés.</p><form id="ef">
      <section class="box"><h2>Identité</h2><div class="g2">${photoField('logo', E.logo || '', 'Logo sur les devis et factures (vide = logo Magnolia)')}<div>
        ${ch('raisonSociale', 'Raison sociale', E.raisonSociale ?? 'Magnolia Traiteur')}${ch('forme', 'Forme juridique <small>(SAS, SARL…)</small>', E.forme)}${ch('capital', 'Capital social <small>(ex. 10 000 €)</small>', E.capital)}</div></div></section>
      <section class="box"><h2>Coordonnées</h2><div class="g2">${ch('adresse', 'Adresse', R.adresse)}${ch('telephone', 'Téléphone', R.telephone)}${ch('email', 'E-mail', R.email, 'type="email"')}${ch('site', 'Site internet', E.site ?? 'magnoliatraiteur.fr')}</div><p class="muted sm">Aussi affichées sur tout le site (en-tête, pied de page, contact). Le site internet est ajouté à la fin de chaque SMS envoyé aux clients.</p></section>
      <section class="box"><h2>Numéros officiels</h2><div class="g3">${ch('siren', 'SIREN', E.siren ?? '992 979 856')}${ch('siret', 'SIRET <small>(14 chiffres)</small>', E.siret)}${ch('rcs', 'RCS <small>(ville du greffe)</small>', E.rcs ?? 'Évry')}${ch('ape', 'Code APE / NAF <small>(ex. 5621Z)</small>', E.ape)}${ch('tva', 'N° de TVA intracommunautaire', E.tva ?? 'FR31992979856')}${ch('tribunal', 'Tribunal compétent (clients pros)', E.tribunal ?? 'tribunal de commerce d’Évry')}</div></section>
      <section class="box"><h2>Assurance et médiation</h2><div class="g2">${ch('assurance', 'Assurance responsabilité civile pro <small>(compagnie et n° de contrat)</small>', E.assurance)}${ch('mediateur', 'Médiateur de la consommation <small>(nom, site internet)</small>', E.mediateur, 'placeholder="ex. CM2C, www.cm2c.net"')}</div></section>
      <section class="box"><h2>Banque et paiement</h2><p class="muted sm">Affichés au client dès qu’il a signé son devis. Un lien de paiement mis dans un devis passe avant le lien général.</p><div class="g2">${ch('pay_lien', 'Lien de paiement par carte (SumUp, Stripe…)', P.lien, 'placeholder="https://"')}${ch('banque', 'Banque', E.banque)}${ch('pay_tit', 'Titulaire du compte', P.titulaire)}${ch('pay_iban', 'IBAN', P.iban)}${ch('pay_bic', 'BIC', P.bic)}</div></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button><span class="muted" id="dirty"></span></div></form>`);
  }
  entreprise.after = () => {
    const form = $('#ef'); bindPhotos(form);
    form.addEventListener('input', () => { $('#dirty').textContent = 'Modifications non enregistrées'; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form)), t = k => String(f[k] || '').trim();
      const body = { adresse: t('adresse'), telephone: t('telephone'), email: t('email'),
        entreprise: { ...(cache.R.entreprise || {}), logo: t('logo'), raisonSociale: t('raisonSociale'), forme: t('forme'), capital: t('capital'), site: t('site'), siren: t('siren'), siret: t('siret'), rcs: t('rcs'), ape: t('ape').toUpperCase(), tva: t('tva').toUpperCase(), tribunal: t('tribunal'), assurance: t('assurance'), mediateur: t('mediateur'), banque: t('banque') },
        paiement: { ...(cache.R.paiement || {}), lien: t('pay_lien'), titulaire: t('pay_tit'), iban: t('pay_iban').toUpperCase().replace(/\s+/g, ' '), bic: t('pay_bic').toUpperCase() } };
      try { await api(A + '/site', { method: 'PUT', body }); cache.R = { ...cache.R, ...body }; $('#dirty').textContent = ''; toast('Enregistré : en ligne immédiatement.'); } catch (err) { toast(err.message, true); }
    });
  };

  /* ---------- équipe et activité ---------- */
  /* droits détaillés : une case par droit, « Administrateur » coche tout (server/droits.js) */
  const mdpProvisoire = () => { const L = 'abcdefghjkmnpqrstuvwxyz', C = '23456789'; const r = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }; let t = 'Magnolia-'; for (let i = 0; i < 4; i++) t += L[r(L.length)]; for (let i = 0; i < 4; i++) t += C[r(C.length)]; return t; };
  const resumeDroits = (d, DR) => d.admin ? 'Peut tout faire' : DR.filter(x => x.k !== 'admin' && d[x.k]).map(x => x.nom).join(' · ') || 'Aucun droit : voit seulement ses dossiers';
  function casesDroits(d, DR, { lecture = false, attr = '' } = {}) {
    return `<div class="eq-droits"${attr}>${DR.map(x => {
      const on = !!d[x.k], grise = lecture || (d.admin && x.k !== 'admin') || !!x.adminSeul; /* Équipe & activité, Mon entreprise : Administrateur seulement */
      return `<label class="eq-droit${x.k === 'admin' ? ' eq-admin' : ''}${on ? ' on' : ''}"><input type="checkbox" data-droit="${x.k}"${on ? ' checked' : ''}${grise ? ' disabled' : ''}><span><b>${esc(x.nom)}</b><small>${esc(x.k === 'toutes' && !on ? 'Non coché : la personne ne voit que SES demandes, devis et factures, plus les nouvelles demandes du site que personne n’a encore prises.' : x.aide)}</small></span></label>`;
    }).join('')}</div>`;
  }
  const lireDroits = box => Object.fromEntries($$('[data-droit]', box).map(i => [i.dataset.droit, i.checked]));
  /* cocher « Administrateur » coche et grise le reste */
  function lierCases(box) {
    box.addEventListener('change', e => {
      const i = e.target.closest('[data-droit]'); if (!i) return;
      if (i.dataset.droit === 'admin') $$('[data-droit]', box).forEach(x => { if (x === i) return; if (i.checked) { x.dataset.memo = x.checked ? '1' : '0'; x.checked = true; } else x.checked = x.dataset.memo === '1'; x.disabled = i.checked; });
      $$('.eq-droit', box).forEach(l => l.classList.toggle('on', $('input', l).checked));
      box.dispatchEvent(new CustomEvent('droits'));
    });
  }
  /* cadres repliables (flèche) : l'état ouvert / fermé est gardé sur cet appareil */
  const plie = k => mem.get('mg_pli_' + k) === '1';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-plibtn]'); if (!b) return;
    const sec = b.closest('[data-pli]'), ferme = !sec.classList.contains('ferme');
    sec.classList.toggle('ferme', ferme); b.setAttribute('aria-expanded', String(!ferme)); mem.set('mg_pli_' + sec.dataset.pli, ferme ? '1' : '0');
  });
  /* Journal d'activité : filtre par personne, par jour ou de date à date, et temps passé (Jean-Luc, 2026-11-26) */
  const jrnF = { qui: '', du: '', au: '' };
  const jourIci = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const decale = n => { const d = new Date(); d.setDate(d.getDate() + n); return jourIci(d); };
  const PERIODES = {
    jour: () => [jourIci(), jourIci()], hier: () => [decale(-1), decale(-1)], sept: () => [decale(-6), jourIci()],
    mois: () => [jourIci().slice(0, 8) + '01', jourIci()],
    moisP: () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const deb = jourIci(d); const f = new Date(); f.setDate(0); return [deb, jourIci(f)]; },
    tout: () => ['', ''],
  };
  const PER_NOMS = { jour: 'Aujourd’hui', hier: 'Hier', sept: '7 derniers jours', mois: 'Ce mois-ci', moisP: 'Le mois dernier', tout: 'Tout' };
  const duree = mn => !mn ? '—' : mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + String(mn % 60).padStart(2, '0');
  const journalFiltres = j => {
    const actif = Object.keys(PERIODES).find(k => { const [a, b] = PERIODES[k](); return a === jrnF.du && b === jrnF.au; });
    return `<div class="jrn-f" id="jrnF"><label>Personne<select data-jq><option value="">Toute l’équipe</option>${j.personnes.map(p => `<option value="${esc(p.cle)}"${p.cle === jrnF.qui ? ' selected' : ''}>${esc(p.who || 'Sans nom')}</option>`).join('')}</select></label>
      <label>Du<input type="date" data-jdu value="${esc(jrnF.du)}"></label><label>Au<input type="date" data-jau value="${esc(jrnF.au)}"></label>
      <div class="jrn-per">${Object.keys(PERIODES).map(k => `<button type="button" class="chip-mod${k === actif ? ' on' : ''}" data-jper="${k}">${PER_NOMS[k]}</button>`).join('')}</div></div>`;
  };
  const journalRes = j => {
    const lst = j.personnes.filter(p => (p.minutes || p.actions) && (!jrnF.qui || p.cle === jrnF.qui));
    const tot = lst.reduce((s, p) => s + p.minutes, 0);
    const depuis = j.depuis ? dateFr(j.depuis, { day: 'numeric', month: 'long', year: 'numeric' }) : 'aujourd’hui';
    const periode = !j.du && !j.au ? 'depuis le début' : j.du === j.au ? 'le ' + dateFr(j.du, { weekday: 'long', day: 'numeric', month: 'long' }) : (j.du ? 'du ' + dateFr(j.du) : 'jusqu’') + (j.au ? (j.du ? ' au ' : 'au ') + dateFr(j.au) : ' à aujourd’hui');
    let jour = '';
    const lignes = j.lignes.map(l => { const d = jourIci(new Date(l.at)); const tete = d !== jour ? `<li class="jrn-jour">${esc(dateFr(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</li>` : ''; jour = d; return tete + `<li><time>${new Date(l.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time> <b>${esc(l.who)}</b> ${esc(l.op)} <small>${esc(l.resume || l.path)}</small></li>`; }).join('');
    return `<div class="jrn-temps"><h3>⏱ Temps passé sur le back-office <small class="muted">${esc(periode)}</small></h3>
      ${lst.length ? `<table class="jrn-tab"><thead><tr><th>Personne</th><th>Temps</th><th>Jours</th><th>Actions</th></tr></thead><tbody>${lst.map(p => `<tr data-jqui="${esc(p.cle)}"${p.cle === jrnF.qui ? ' class="on"' : ''}><td><b>${esc(p.who || 'Sans nom')}</b></td><td class="jrn-h">${duree(p.minutes)}</td><td>${p.jours || '—'}</td><td>${p.actions || '—'}</td></tr>`).join('')}</tbody>${lst.length > 1 ? `<tfoot><tr><td>Total</td><td class="jrn-h">${duree(tot)}</td><td></td><td>${lst.reduce((s, p) => s + p.actions, 0)}</td></tr></tfoot>` : ''}</table>` : '<p class="muted sm">Personne n’a utilisé le back-office sur cette période.</p>'}
      <p class="muted sm">C’est une estimation : le temps compte quand la personne se sert du back-office (clic, frappe, défilement) avec la page affichée à l’écran ; après 5 minutes sans aucun geste, le compteur s’arrête. Compté depuis le ${esc(depuis)} (avant, ce n’était pas enregistré).</p></div>
      <h3 class="jrn-nb">${j.nb} action${j.nb > 1 ? 's' : ''}${j.nb > j.lignes.length ? ` <small class="muted">(les ${j.lignes.length} plus récentes affichées)</small>` : ''}</h3>
      <ul class="journal">${lignes || '<li class="muted">Aucune action sur cette période.</li>'}</ul>`;
  };
  const rechargerJournal = async () => {
    try {
      const j = await api(A + '/actions/journal?' + new URLSearchParams(jrnF));
      const f = $('#jrnF'); if (f) f.outerHTML = journalFiltres(j);
      $('#jrnRes').innerHTML = journalRes(j);
    } catch (err) { toast(err.message, true); }
  };
  document.addEventListener('change', e => {
    if (!e.target.closest?.('#jrnF')) return;
    if (e.target.matches('[data-jq]')) jrnF.qui = e.target.value;
    else if (e.target.matches('[data-jdu]')) { jrnF.du = e.target.value; if (jrnF.du && (!jrnF.au || jrnF.au < jrnF.du)) jrnF.au = jrnF.du; }
    else if (e.target.matches('[data-jau]')) { jrnF.au = e.target.value; if (jrnF.au && jrnF.du > jrnF.au) jrnF.du = jrnF.au; }
    else return;
    rechargerJournal();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-jper]'); if (b) { [jrnF.du, jrnF.au] = PERIODES[b.dataset.jper](); rechargerJournal(); return; }
    const t = e.target.closest?.('[data-jqui]'); if (t) { jrnF.qui = jrnF.qui === t.dataset.jqui ? '' : t.dataset.jqui; rechargerJournal(); }
  });
  /* Rémunération par action (Jean-Luc, 2026-11-27) : barème € par action + gains de chacun sur la période */
  const remF = { du: '', au: '', qui: '' };
  { const [a, b] = PERIODES.mois(); remF.du = a; remF.au = b; }
  const remFiltres = () => {
    const actif = Object.keys(PERIODES).find(k => { const [a, b] = PERIODES[k](); return a === remF.du && b === remF.au; });
    return `<div class="jrn-f" id="remF"><label>Du<input type="date" data-rdu value="${esc(remF.du)}"></label><label>Au<input type="date" data-rau value="${esc(remF.au)}"></label>
      <div class="jrn-per">${Object.keys(PERIODES).map(k => `<button type="button" class="chip-mod${k === actif ? ' on' : ''}" data-rper="${k}">${PER_NOMS[k]}</button>`).join('')}</div></div>`;
  };
  const remBareme = r => {
    const groupes = [...new Set(r.actions.map(a => a.groupe))];
    const nbPayees = r.actions.filter(a => a.cents > 0).length;
    return `<details class="rem-bar" id="remBar"${nbPayees ? '' : ' open'}><summary>📋 Barème : montant gagné pour chaque action <small class="muted">(${nbPayees ? nbPayees + ' action' + (nbPayees > 1 ? 's' : '') + ' rémunérée' + (nbPayees > 1 ? 's' : '') : 'tout est à 0 € pour l’instant'})</small></summary>
      ${r.modifiable ? '<p class="muted sm">Tapez le montant en euros pour chaque action (laissez 0 si elle ne rapporte rien), puis « Enregistrer le barème ». Les gains se recalculent aussitôt, aussi pour les jours passés.</p>' : '<p class="muted sm">Seul un administrateur peut changer ces montants.</p>'}
      ${groupes.map(g => `<h4 class="rem-g">${esc(g)}</h4><div class="rem-lignes">${r.actions.filter(a => a.groupe === g).map(a => `<label class="rem-l"><span>${esc(a.nom)}${a.unique ? ' <small class="muted">(une fois par fiche et par jour)</small>' : ''}</span><span class="rem-eur"><input type="text" inputmode="decimal" data-remk="${a.k}" value="${a.cents ? (a.cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0'}"${r.modifiable ? '' : ' disabled'}> €</span></label>`).join('')}</div>`).join('')}
      ${r.modifiable ? `<div class="rem-tout"><label>Même montant pour toutes les actions<span class="rem-eur"><input type="text" inputmode="decimal" data-remtout value="2,00"> €</span></label><button type="button" class="btn ghost sm" data-remtoutbtn>Mettre ce montant partout</button><small class="muted">puis « Enregistrer le barème »</small></div>` : ''}
      ${r.modifiable ? `<div class="row"><button type="button" class="btn" data-savebar>Enregistrer le barème</button>${r.majLe ? `<span class="muted sm">Dernière modification : ${esc(dateH(r.majLe))}${r.majPar ? ' par ' + esc(r.majPar) : ''}</span>` : ''}</div>` : ''}</details>`;
  };
  const remRes = r => {
    const periode = !r.du && !r.au ? 'depuis le début' : r.du === r.au ? 'le ' + dateFr(r.du, { weekday: 'long', day: 'numeric', month: 'long' }) : (r.du ? 'du ' + dateFr(r.du) : 'jusqu’') + (r.au ? (r.du ? ' au ' : 'au ') + dateFr(r.au) : ' à aujourd’hui');
    const nom = k => (r.actions.find(a => a.k === k) || {}).nom || k;
    const lst = r.personnes, tot = lst.reduce((s, p) => s + p.totalCents, 0);
    const detail = p => `<tr class="rem-det"><td colspan="3"><table class="jrn-tab rem-dtab"><thead><tr><th>Action</th><th>Nombre</th><th>Montant</th><th>Total</th></tr></thead><tbody>${p.detail.map(d => `<tr><td>${esc(nom(d.k))}<details class="rem-ex"><summary>voir</summary><ul>${d.exemples.map(x => `<li><time>${esc(dateH(x.at))}</time> ${esc(x.resume)}</li>`).join('')}${d.nb > d.exemples.length ? `<li class="muted">… et ${d.nb - d.exemples.length} autre(s)</li>` : ''}</ul></details></td><td>${d.nb}</td><td>${euros(d.cents)}</td><td class="jrn-h">${euros(d.totalCents)}</td></tr>`).join('')}</tbody></table></td></tr>`;
    return `<div class="jrn-temps"><h3>💶 Gains de chacun <small class="muted">${esc(periode)}</small></h3>
      ${lst.length ? `<table class="jrn-tab"><thead><tr><th>Personne</th><th>Actions</th><th>Gains</th></tr></thead><tbody>${lst.map(p => `<tr data-remqui="${esc(p.cle)}"${p.cle === remF.qui ? ' class="on"' : ''}><td><b>${esc(p.who || 'Sans nom')}</b> <small class="muted">${p.cle === remF.qui ? '▲ masquer le détail' : '▼ voir le détail'}</small></td><td>${p.nb}</td><td class="jrn-h">${euros(p.totalCents)}</td></tr>${p.cle === remF.qui ? detail(p) : ''}`).join('')}</tbody>${lst.length > 1 ? `<tfoot><tr><td>Total</td><td>${lst.reduce((s, p) => s + p.nb, 0)}</td><td class="jrn-h">${euros(tot)}</td></tr></tfoot>` : ''}</table>` : '<p class="muted sm">Aucune action de l’équipe sur cette période.</p>'}
      <p class="muted sm">Calculé d’après le Journal d’activité : chaque action d’un membre de l’équipe est multipliée par son montant du barème. Les actions faites automatiquement (IA, site) ne comptent pas. Un devis signé est compté au commercial du devis, le jour de la signature.</p></div>`;
  };
  const remBloc = r => `${remFiltres()}<div id="remRes">${remRes(r)}</div>${remBareme(r)}`;
  let remDer = null;
  const rechargerRem = async () => {
    try { remDer = await api(A + '/actions/remuneration?' + new URLSearchParams({ du: remF.du, au: remF.au })); const b = $('#remBloc'); if (b) b.innerHTML = remBloc(remDer); } catch (err) { toast(err.message, true); }
  };
  document.addEventListener('change', e => {
    if (!e.target.closest?.('#remF')) return;
    if (e.target.matches('[data-rdu]')) { remF.du = e.target.value; if (remF.du && (!remF.au || remF.au < remF.du)) remF.au = remF.du; }
    else if (e.target.matches('[data-rau]')) { remF.au = e.target.value; if (remF.au && remF.du > remF.au) remF.du = remF.au; }
    else return;
    rechargerRem();
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest?.('[data-rper]'); if (b) { [remF.du, remF.au] = PERIODES[b.dataset.rper](); rechargerRem(); return; }
    const t = e.target.closest?.('[data-remqui]'); if (t) { remF.qui = remF.qui === t.dataset.remqui ? '' : t.dataset.remqui; if (remDer) $('#remRes').innerHTML = remRes(remDer); return; }
    if (e.target.closest?.('[data-remtoutbtn]')) { const v = $('[data-remtout]').value; document.querySelectorAll('[data-remk]').forEach(i => { i.value = v; }); toast('Montant mis partout : pensez à « Enregistrer le barème ».'); return; }
    if (e.target.closest?.('[data-savebar]')) {
      const montants = Object.fromEntries([...document.querySelectorAll('[data-remk]')].map(i => [i.dataset.remk, i.value]));
      try { await api(A + '/actions/remuneration/bareme', { method: 'PUT', body: { montants } }); toast('Barème enregistré'); await rechargerRem(); const d = $('#remBar'); if (d) d.open = true; } catch (err) { toast(err.message, true); }
    }
  });
  /* ---------- Heures supplémentaires (Jean-Luc, 2026-11-27 ; server/heures-sup.js) ----------
     Chacun déclare les siennes ; en semaine seulement avant 9 h ou après 18 h, le week-end toute la journée.
     L'admin (droit « equipe ») voit tout : filtre par personne et par période, total par personne, liens de la mini-application. */
  const hsF = { qui: '', per: 'mois', du: '', au: '' };
  let hsDernier = '';
  const HS_PER = [['mois', 'Ce mois-ci'], ['moisP', 'Le mois dernier'], ['sem', 'Cette semaine'], ['m3', 'Les 3 derniers mois'], ['an', 'Cette année'], ['tout', 'Tout'], ['choix', 'Dates au choix…']];
  const hsBornes = () => {
    const t = jourIci();
    if (hsF.per === 'choix') return [hsF.du, hsF.au];
    if (hsF.per === 'sem') { const d = new Date(); const j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return [jourIci(d), t]; }
    if (hsF.per === 'm3') { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 2); return [jourIci(d), t]; }
    if (hsF.per === 'an') return [t.slice(0, 4) + '-01-01', t];
    return (PERIODES[hsF.per] || PERIODES.tout)();
  };
  const HS_J = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const hsJs = d => new Date(d + 'T12:00:00').getDay();
  const hsMin = h => { const [a, b] = String(h).split(':'); return +a * 60 + +b; };
  const hsDuree = m => { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; };
  const hsDate = d => { const [y, m, j] = d.split('-'); return `${HS_J[hsJs(d)]} ${+j}/${m}/${y}`; };
  const HS_HEURES = Array.from({ length: 96 }, (_, i) => String(Math.floor(i / 4)).padStart(2, '0') + ':' + String(i % 4 * 15).padStart(2, '0'));
  const hsOpts = v => HS_HEURES.map(h => `<option value="${h}"${h === v ? ' selected' : ''}>${h.replace(':', ' h ')}</option>`).join('');
  /* même règle que le serveur, pour prévenir tout de suite */
  const hsVerif = (d, deb, fin) => {
    if (!d) return { err: 'Choisissez le jour où vous avez travaillé.' };
    if (d > jourIci()) return { err: 'Ce jour n’est pas encore passé.' };
    const a = hsMin(deb), b = hsMin(fin), sem = hsJs(d) >= 1 && hsJs(d) <= 5;
    if (a === b) return { err: 'L’heure de fin doit être différente de l’heure de début.' };
    const msg = `Le ${HS_J[hsJs(d)]}, les heures supplémentaires ne peuvent être faites qu’avant 9 h ou après 18 h. Entre 9 h et 18 h, ce sont les horaires normaux.`;
    if (b > a) return sem && !(b <= 540 || a >= 1080) ? { err: msg } : { min: b - a };
    if (sem && a < 1080) return { err: msg + ' Une plage qui passe minuit doit commencer à 18 h ou après.' };
    const j2 = (hsJs(d) + 1) % 7; if (j2 >= 1 && j2 <= 5 && b > 540) return { err: `La plage continue le ${HS_J[j2]} matin après 9 h : arrêtez-la à 09 h 00 au plus tard.` };
    return { min: 1440 - a + b, lendemain: true };
  };
  async function hsCharger() {
    const box = $('#heures-sup'); if (!box) return;
    const [du, au] = hsBornes();
    let r; try { r = await api(A + '/actions/heures-sup?' + new URLSearchParams({ qui: hsF.qui, du: du || '', au: au || '' })); } catch (e) { box.innerHTML = `<h2>⏱ Heures supplémentaires</h2><p class="err">${esc(e.message)}</p>`; return; }
    const admin = r.admin, moi = (cache.equipeUsers || []).find(u => u.email === session.email);
    const pers = (cache.equipeUsers || []).filter(u => !u.desactive);
    const we = [0, 6].includes(hsJs(jourIci()));
    const lienMoi = r.liens.find(x => x.uid === moi?.id);
    box.innerHTML = `<h2>⏱ Heures supplémentaires</h2>
      <p class="hs-regle">Du <b>lundi au vendredi</b>, on déclare seulement ce qui est fait <b>avant 9 h</b> ou <b>après 18 h</b> (9 h – 18 h = horaires normaux). Le <b>samedi et le dimanche</b> : toute la journée. ${admin ? 'Vous voyez les heures de toute l’équipe.' : 'Vous voyez seulement les vôtres.'}</p>
      <form class="hs-form" id="hsForm" novalidate>
        ${hsDernier ? `<p class="hs-fait">✅ ${esc(hsDernier)} <b>Pour un autre jour</b> : remplissez à nouveau ci-dessous et enregistrez.</p>` : ''}
        <div class="hs-dire"><button type="button" class="btn hs-dire-btn" data-hsdire>🎤 Dire mes heures</button><span class="muted sm">ex. « J’ai travaillé mardi de 18 h à 20 h sur la création de fiches produits » : l’IA remplit le jour, les heures et coche les cases. Vous vérifiez, puis vous enregistrez.</span>
          <div class="hs-dire-z" data-hsdirez hidden><textarea data-hsphrase rows="2" placeholder="Ou écrivez la phrase ici"></textarea><button type="button" class="btn ghost sm" data-hsremplir>✨ Remplir les cases</button></div><p class="sm" data-hsdmsg aria-live="polite"></p></div>
        <div class="hs-g">
          ${admin ? `<label>Pour<select name="uid">${pers.map(u => `<option value="${u.id}"${u.id === moi?.id ? ' selected' : ''}>${esc(u.nom || u.email)}${u.id === moi?.id ? ' (moi)' : ''}</option>`).join('')}</select></label>` : ''}
          <label>Jour travaillé<input type="date" name="date" value="${jourIci()}" max="${jourIci()}" required></label>
          <label>De<select name="debut">${hsOpts(we ? '09:00' : '18:00')}</select></label>
          <label>À<select name="fin">${hsOpts(we ? '13:00' : '20:00')}</select></label>
        </div>
        <p class="hs-duree" data-hsduree aria-live="polite"></p>
        <fieldset class="hs-taches"><legend>Sur quoi avez-vous travaillé ? <small class="muted">(cochez une ou plusieurs cases)</small></legend>
          ${(r.taches || []).map(g => `<p class="hs-gt">${esc(g.groupe)}</p><div class="hs-cases">${g.taches.map(t => `<label class="hs-case"><input type="checkbox" name="t" value="${esc(t)}"> <span>${esc(t)}</span></label>`).join('')}</div>`).join('')}
          <div class="hs-cases"><label class="hs-case"><input type="checkbox" data-hsautre> <span>Autre…</span></label></div>
          <label data-hsautrebloc hidden>La tâche à ajouter <small class="muted">(elle restera dans la liste pour la prochaine fois)</small><input name="autre" maxlength="60" placeholder="ex. Dégustation avec les mariés"></label></fieldset>
        <label>Précision <small class="muted">(facultatif : client, lieu… ; le micro 🎤 apparaît dans la case)</small><textarea name="precision" rows="2" placeholder="ex. Mariage Dupont à Versailles"></textarea></label>
        <div class="row"><button class="btn">✔ Enregistrer ${admin ? 'les heures' : 'mes heures'}</button></div>
      </form>
      <div class="hs-app"><b>📱 Sur le téléphone</b> <span class="muted sm">Une petite page à son nom, installable sur l’écran d’accueil de l’iPhone : la personne déclare ses heures en 30 secondes et elles arrivent ici à son nom.</span>
        ${admin ? `<div class="hs-envoi"><label>Envoyer le lien par SMS à<select data-hsqui1><option value="">— Choisir une personne —</option>${r.liens.filter(x => !x.desactive).map(x => `<option value="${x.uid}"${x.portable ? '' : ' disabled'}>${esc(x.nom)}${x.portable ? ' · ' + esc(x.portable) : ' (pas de portable)'}</option>`).join('')}</select></label><button type="button" class="btn sm" data-hssms1 disabled>📱 Envoyer le lien</button><span class="muted sm">ou</span><button type="button" class="btn ghost sm" data-hssmsall>📨 À toute l’équipe</button></div>
        <table class="hs-t hs-liens"><thead><tr><th>Personne</th><th>Portable</th><th>Lien</th><th></th></tr></thead><tbody>${r.liens.filter(x => !x.desactive).map(x => `<tr><td>${esc(x.nom)}</td><td>${x.portable ? esc(x.portable) : '<span class="muted">à renseigner (Les comptes de l’équipe)</span>'}</td><td>${x.lien ? (x.lienEnvoyeLe ? `envoyé le ${new Date(x.lienEnvoyeLe).toLocaleDateString('fr-FR')}` : 'créé, pas encore envoyé') : '<span class="muted">pas encore créé</span>'}</td><td class="hs-btns"><button type="button" class="btn ghost sm" data-hssms="${x.uid}"${x.portable ? '' : ' disabled'}>📱 Envoyer par SMS</button>${x.lien ? `<button type="button" class="lnk" data-hscopie="${esc(x.lien)}">Copier le lien</button><button type="button" class="lnk" data-hsnouveau="${x.uid}">Nouveau lien</button>` : ''}</td></tr>`).join('')}</tbody></table>
        <p class="muted sm">« Nouveau lien » coupe l’ancien (téléphone perdu, personne partie). Un compte désactivé ne peut plus rien déclarer. Seul le manager peut supprimer une déclaration (cases à cocher plus bas).</p>`
        : `<div class="row">${moi?.portable ? `<button type="button" class="btn sm" data-hssms="${moi.id}">📱 M’envoyer mon lien par SMS</button>` : '<span class="muted sm">Demandez à votre responsable d’ajouter votre portable à votre compte.</span>'}${lienMoi?.lien ? `<a class="btn ghost sm" href="${esc(lienMoi.lien)}" target="_blank" rel="noopener">Ouvrir ma page</a>` : ''}</div>`}
      </div>
      <h3 class="hs-h3">${admin ? 'Les heures déclarées' : 'Mes heures déclarées'}</h3>
      <div class="hs-filtres">
        ${admin ? `<label>Personne<select data-hsqui><option value="">Toute l’équipe</option>${pers.map(u => `<option value="${u.id}"${u.id === hsF.qui ? ' selected' : ''}>${esc(u.nom || u.email)}</option>`).join('')}</select></label>` : ''}
        <label>Période<select data-hsper>${HS_PER.map(([k, t]) => `<option value="${k}"${k === hsF.per ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        ${hsF.per === 'choix' ? `<label>Du<input type="date" data-hsdu value="${esc(hsF.du)}"></label><label>Au<input type="date" data-hsau value="${esc(hsF.au)}"></label>` : ''}
      </div>
      <div class="hs-recap"><h3>📊 Récapitulatif de la période</h3><table class="hs-t hs-rt"><thead><tr><th>Personne</th><th>Déclarations</th><th>Total d’heures</th></tr></thead><tbody>${r.totaux.map(t => `<tr><td>${esc(t.nom)}</td><td>${t.nb}</td><td><b>${hsDuree(t.minutes)}</b></td></tr>`).join('')}<tr class="hs-rtot"><td>Total</td><td>${r.liste.length}</td><td><b>${hsDuree(r.minutes)}</b></td></tr></tbody></table></div>
      ${admin && r.liste.length ? `<div class="hs-sel"><label class="chk"><input type="checkbox" data-hstout> Tout cocher</label><button type="button" class="btn sm hs-supbtn" data-hssupsel disabled>🗑 Supprimer la sélection</button><span class="muted sm" data-hsnb></span></div>` : ''}
      ${r.liste.length ? `<div class="hs-scroll"><table class="hs-t"><thead><tr><th>Jour</th>${admin ? '<th>Personne</th>' : ''}<th>Horaire et durée</th><th>Sur quoi</th></tr></thead><tbody>${r.liste.map(x => `<tr${admin ? ` data-hsrow="${x.id}"` : ''}><td class="hs-j">${admin ? `<input type="checkbox" class="hs-chk" data-hschk="${x.id}" aria-label="Sélectionner"> ` : ''}${hsDate(x.date)}</td>${admin ? `<td>${esc(x.nom)}</td>` : ''}<td class="hs-hor">${x.debut.replace(':', ' h ')} → ${x.fin.replace(':', ' h ')} · <b>${hsDuree(x.minutes)}</b></td><td class="hs-quoi">${esc(x.quoi)}${x.depuis === 'telephone' ? ' <span class="pill hs-tel" title="Déclaré depuis son téléphone">📱</span>' : ''}${x.par && x.par !== x.nom ? `<small class="muted"> · saisi par ${esc(x.par)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucune heure supplémentaire sur cette période.</p>'}`;
    const f = $('#hsForm'), maj = () => { const v = hsVerif(f.date.value, f.debut.value, f.fin.value), el = $('[data-hsduree]'); el.className = 'hs-duree' + (v.err ? ' err' : ''); el.textContent = v.err || `Durée : ${hsDuree(v.min)}${v.lendemain ? ' (jusqu’au lendemain)' : ''}`; return v; };
    let touche = false;
    f.date.addEventListener('change', () => { if (!touche) { const w = [0, 6].includes(hsJs(f.date.value)); f.debut.value = w ? '09:00' : '18:00'; f.fin.value = w ? '13:00' : '20:00'; } maj(); });
    [f.debut, f.fin].forEach(x => x.addEventListener('change', () => { touche = true; maj(); })); maj();
    /* « 🎤 Dire mes heures » : dictée → l'IA remplit, rien n'est enregistré sans « Enregistrer » */
    const dmsg = (t, bad) => { const el = $('[data-hsdmsg]', f); el.className = 'sm ' + (bad ? 'err' : 'hs-ok'); el.textContent = t; };
    const remplir = async () => {
      const t = $('[data-hsphrase]', f).value.trim(); if (t.length < 4) { dmsg('Dites ou écrivez d’abord vos heures.', true); return; }
      dmsg('✨ Je remplis les cases…');
      try {
        const j = await api(A + '/actions/heures-sup/dictee', { method: 'POST', body: { texte: t } });
        f.date.value = j.date; if (j.debut) { f.debut.value = j.debut; touche = true; } if (j.fin) { f.fin.value = j.fin; touche = true; }
        $$('input[name=t]', f).forEach(c => { c.checked = j.taches.includes(c.value); c.closest('.hs-case').classList.toggle('on', c.checked); });
        const ca = $('[data-hsautre]', f); ca.checked = !!j.autre; ca.closest('.hs-case').classList.toggle('on', !!j.autre); $('[data-hsautrebloc]', f).hidden = !j.autre; f.autre.value = j.autre || '';
        if (j.precision) f.precision.value = j.precision;
        const v = maj(); dmsg(v.err || '✅ Cases remplies : vérifiez, puis « Enregistrer ».' + (j.debut && j.fin ? '' : ' Choisissez les heures qui manquent.'), !!v.err);
      } catch (err) { dmsg(err.message, true); }
    };
    $('[data-hsremplir]', f).addEventListener('click', remplir);
    let recH = null;
    $('[data-hsdire]', f).addEventListener('click', e => {
      const bt = e.currentTarget; if (recH) { recH.stop(); return; }
      $('[data-hsdirez]', f).hidden = false;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) { dmsg('Dictée indisponible sur ce navigateur : écrivez la phrase (ou utilisez le micro du clavier), puis « Remplir les cases ».'); $('[data-hsphrase]', f).focus(); return; }
      recH = new SR(); recH.lang = 'fr-FR'; recH.interimResults = true; recH.continuous = false; let dit = '';
      recH.onresult = ev => { dit = [...ev.results].map(r => r[0].transcript).join(''); $('[data-hsphrase]', f).value = dit; };
      recH.onerror = ev => dmsg(ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Le micro est bloqué : autorisez-le, ou écrivez la phrase.' : 'Je n’ai pas bien entendu : réessayez ou écrivez la phrase.', true);
      recH.onend = () => { recH = null; bt.classList.remove('on'); bt.textContent = '🎤 Dire mes heures'; if (dit.trim()) remplir(); };
      try { recH.start(); bt.classList.add('on'); bt.textContent = '■ J’écoute… cliquez pour arrêter'; dmsg(''); } catch { recH = null; }
    });
    f.addEventListener('change', e => { const c = e.target.closest('.hs-case input'); if (c) c.closest('.hs-case').classList.toggle('on', c.checked); if (e.target.matches('[data-hsautre]')) { $('[data-hsautrebloc]', f).hidden = !e.target.checked; if (e.target.checked) f.autre.focus(); } });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = maj(); if (v.err) { toast(v.err, true); return; }
      const taches = $$('input[name=t]:checked', f).map(c => c.value), autre = $('[data-hsautre]', f).checked ? f.autre.value.trim() : '';
      if ($('[data-hsautre]', f).checked && autre.length < 2) { toast('Écrivez la tâche « Autre ».', true); f.autre.focus(); return; }
      if (!taches.length && !autre) { toast('Cochez au moins une tâche.', true); return; }
      try { const x = await api(A + '/actions/heures-sup', { method: 'POST', body: { uid: f.uid?.value || '', date: f.date.value, debut: f.debut.value, fin: f.fin.value, taches, autre, precision: f.precision.value } }); toast(`Enregistré : ${x.nom}, ${hsDate(x.date)}, ${hsDuree(x.minutes)}.`); hsDernier = `Enregistré : ${x.nom}, ${hsDate(x.date)}, ${x.debut.replace(':', ' h ')} → ${x.fin.replace(':', ' h ')} · ${hsDuree(x.minutes)}.`; await hsCharger(); hsDernier = ''; $('#hsForm [name=date]')?.focus(); } catch (err) { toast(err.message, true); }
    });
    $('[data-hsqui]')?.addEventListener('change', e => { hsF.qui = e.target.value; hsCharger(); });
    $('[data-hsper]').addEventListener('change', e => { hsF.per = e.target.value; if (hsF.per === 'choix' && !hsF.du) { hsF.du = jourIci().slice(0, 8) + '01'; hsF.au = jourIci(); } hsCharger(); });
    $('[data-hsdu]')?.addEventListener('change', e => { hsF.du = e.target.value; hsCharger(); });
    $('[data-hsau]')?.addEventListener('change', e => { hsF.au = e.target.value; hsCharger(); });
    /* suppression : cases à cocher, réservé au manager */
    const coches = () => $$('[data-hschk]').filter(c => c.checked).map(c => c.dataset.hschk);
    const majSel = () => { const n = coches().length, b = $('[data-hssupsel]'); if (!b) return; b.disabled = !n; $('[data-hsnb]').textContent = n ? `${n} déclaration${n > 1 ? 's' : ''} cochée${n > 1 ? 's' : ''}` : ''; $$('[data-hsrow]').forEach(tr => tr.classList.toggle('hs-on', !!$('[data-hschk]', tr)?.checked)); };
    $$('[data-hschk]').forEach(c => c.addEventListener('change', majSel));
    $('[data-hstout]')?.addEventListener('change', e => { $$('[data-hschk]').forEach(c => { c.checked = e.target.checked; }); majSel(); });
    $('[data-hssupsel]')?.addEventListener('click', async () => { const ids = coches(); if (!ids.length || !confirm(`Supprimer définitivement ${ids.length > 1 ? 'ces ' + ids.length + ' déclarations' : 'cette déclaration'} d’heures supplémentaires ?`)) return; try { const x = await api(A + '/actions/heures-sup/supprimer', { method: 'POST', body: { ids } }); toast(`${x.supprimees} déclaration${x.supprimees > 1 ? 's' : ''} supprimée${x.supprimees > 1 ? 's' : ''}.`); hsCharger(); } catch (err) { toast(err.message, true); } });
    $$('[data-hssms]').forEach(b => b.addEventListener('click', async () => { b.disabled = true; try { const x = await api(A + '/actions/heures-sup/lien/' + b.dataset.hssms, { method: 'POST', body: { sms: true } }); toast(x.live ? 'Lien envoyé par SMS.' : 'Mode test : le SMS est noté dans « E-mails et SMS envoyés », rien n’est parti.'); hsCharger(); } catch (err) { toast(err.message, true); b.disabled = false; } }));
    $$('[data-hsnouveau]').forEach(b => b.addEventListener('click', async () => { if (!confirm('Créer un nouveau lien ? L’ancien ne marchera plus. Pensez à envoyer le nouveau par SMS.')) return; try { await api(A + '/actions/heures-sup/lien/' + b.dataset.hsnouveau, { method: 'POST', body: { nouveau: true } }); toast('Nouveau lien créé : l’ancien est coupé.'); hsCharger(); } catch (err) { toast(err.message, true); } }));
    $$('[data-hscopie]').forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.hscopie); toast('Lien copié.'); } catch { prompt('Copiez le lien :', b.dataset.hscopie); } }));
    $('[data-hsqui1]')?.addEventListener('change', e => { $('[data-hssms1]').disabled = !e.target.value; });
    $('[data-hssms1]')?.addEventListener('click', async e => { const sel = $('[data-hsqui1]'), uid = sel.value; if (!uid) return; const nom = sel.selectedOptions[0].textContent.split(' · ')[0]; e.target.disabled = true; try { const x = await api(A + '/actions/heures-sup/lien/' + uid, { method: 'POST', body: { sms: true } }); toast(x.live ? `Lien envoyé par SMS à ${nom}.` : `Mode test : le SMS pour ${nom} est noté dans « E-mails et SMS envoyés », rien n’est parti.`); hsCharger(); } catch (err) { toast(err.message, true); e.target.disabled = false; } });
    $('[data-hssmsall]')?.addEventListener('click', async e => { if (!confirm('Envoyer à chaque personne de l’équipe son lien personnel par SMS ?')) return; e.target.disabled = true; try { const x = await api(A + '/actions/heures-sup/liens-sms', { method: 'POST', body: {} }); toast(`${x.envoyes.length} SMS ${x.live ? 'envoyé(s)' : 'noté(s) en mode test'}${x.rates.length ? ` · pas envoyé à : ${x.rates.map(y => y.nom + ' (' + y.raison + ')').join(', ')}` : ''}.`, !!x.rates.length); hsCharger(); } catch (err) { toast(err.message, true); e.target.disabled = false; } });
  }
  /* Équipe & activité : menu de sous-pages (#/equipe/comptes, /heures, /alertes, /journal, /remuneration, /envois), Jean-Luc 2026-11-27.
     Toute la page est construite une fois ; le menu montre une sous-page à la fois (adresse propre : retour arrière et rechargement OK). */
  const EQ_ONGLETS = [
    ['comptes', '👥', 'Comptes & droits', 'Les personnes, leurs droits, mon mot de passe'],
    ['heures', '⏱', 'Heures supplémentaires', 'Déclarer, consulter, lien téléphone'],
    ['alertes', '🔔', 'Alertes & qui prévenir', 'Carnet, règles selon la demande, simulation'],
    ['journal', '📜', 'Journal d’activité', 'Qui a fait quoi, temps passé'],
    ['remuneration', '💶', 'Rémunération', 'Barème par action, gains de chacun'],
    ['envois', '✉️', 'E-mails & SMS envoyés', 'Historique des envois, essai'],
  ];
  const eqOnglets = gere => EQ_ONGLETS.filter(([k]) => gere || k === 'comptes' || k === 'heures').map(o => o[0] === 'comptes' && !gere ? ['comptes', '👤', 'Mon compte', 'Mes droits, mon mot de passe'] : o);
  const eqCourant = (id, gere) => { const L = eqOnglets(gere).map(o => o[0]); return L.includes(id) ? id : L[0]; };
  const ongletsEquipe = (cur, gere) => `<nav class="eq-menu" aria-label="Sous-pages d’Équipe & activité">${eqOnglets(gere).map(([k, ico, t, d]) => `<a href="#/equipe/${k}" class="eq-onglet${k === cur ? ' on' : ''}" data-eqong="${k}"${k === cur ? ' aria-current="page"' : ''}><span class="eq-ico" aria-hidden="true">${ico}</span><span class="eq-ot"><b>${t}</b><small>${d}</small></span></a>`).join('')}</nav>`;
  const montrerEq = k => {
    $$('[data-eqp]').forEach(d => { d.hidden = d.dataset.eqp !== k; });
    $$('[data-eqong]').forEach(a => { const on = a.dataset.eqong === k; a.classList.toggle('on', on); if (on) { a.setAttribute('aria-current', 'page'); const m = a.parentElement; if (m.scrollWidth > m.clientWidth) m.scrollLeft = a.offsetLeft - (m.clientWidth - a.offsetWidth) / 2; } else a.removeAttribute('aria-current'); });
  };
  async function equipe(id) {
    const gere = peut('equipe'), cur = eqCourant(id, gere);
    const [users, conf, j, env, R, rem] = await Promise.all([api(A + '/actions/equipe'), api(A + '/actions/droits'), gere ? api(A + '/actions/journal?' + new URLSearchParams(jrnF)) : null, gere ? api(A + '/actions/envois') : null, gere ? api(A + '/site') : null, gere ? api(A + '/actions/remuneration?' + new URLSearchParams({ du: remF.du, au: remF.au })) : null]);
    remDer = rem;
    cache.droitsConf = conf; cache.equipeUsers = users;
    const DR = conf.droits;
    const moi = users.find(u => u.email === session.email);
    if (gere) {
      const al = R.alertes || {};
      reglesAl = (Array.isArray(al.regles) ? al.regles : []).map(x => JSON.parse(JSON.stringify(x)));
      defautAl = { mode: 'tous', qui: [], tels: '', emails: '', canal: 'les2', ...(al.defaut || {}) };
      alertePers = Array.isArray(al.personnes) ? al.personnes.map(x => ({ ...x }))
        : (() => { const m = String(al.emails || '').split(/[,;\s]+/).filter(Boolean), t = String(al.sms || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean); return Array.from({ length: Math.max(m.length, t.length) }, (_, i) => ({ nom: '', tel: t[i] || '', email: m[i] || '' })); })();
    }
    const carte = u => {
      const estMoi = u.email === session.email, bloque = estMoi || (u.droits.admin && !peut('admin'));
      const badge = u.desactive ? '<span class="pill eq-off">Désactivé</span>' : u.droits.admin ? '<span class="pill eq-pill-admin">★ Administrateur</span>' : `<span class="pill eq-pill">${DR.filter(x => x.k !== 'admin' && u.droits[x.k]).length} droit(s)</span>`;
      return `<li class="eq-carte${u.desactive ? ' off' : ''}" data-uid="${u.id}">
        <div class="eq-tete"><span class="eq-av">${esc(initiales(u.nom || u.email))}</span>
          <div class="eq-id"><b>${esc(u.nom || u.email)}</b><small>${esc(u.email)}${u.portable ? ' · 📱 ' + esc(u.portable) : ''}${estMoi ? ' · c’est vous' : ''}</small></div>
          <div class="eq-bad">${badge}</div></div>
        ${gere && (!bloque || estMoi) ? `<div class="g3 eq-fiche" data-fiche="${u.id}"><label>Prénom<input data-k="prenom" value="${esc(u.prenom || '')}" data-prenom placeholder="Prénom"></label><label>Nom<input data-k="nomFamille" value="${esc(u.nomFamille || '')}" data-nomfam placeholder="NOM"></label><label>Portable <small>(SMS : rendez-vous, commentaires clients)</small><input type="tel" data-k="portable" value="${esc(u.portable || '')}" placeholder="06 12 34 56 78"></label></div>` : ''}
        <p class="eq-res">${esc(resumeDroits(u.droits, DR))}</p>
        ${gere ? `<div class="row eq-act"><button type="button" class="btn ghost sm" data-ouvrir="${u.id}">🔑 ${bloque ? 'Voir les droits' : 'Modifier les droits'}</button>${!bloque ? `<button type="button" class="lnk" data-dis="${u.id}" data-v="${u.desactive ? 0 : 1}">${u.desactive ? 'Réactiver le compte' : 'Désactiver le compte'}</button>` : ''}</div>
        <div class="eq-panneau" data-pan="${u.id}" hidden>${bloque ? `<p class="muted sm">${estMoi ? 'Vous ne pouvez pas changer vos propres droits : demandez-le à un autre administrateur.' : 'Seul un Administrateur peut changer les droits d’un Administrateur.'}</p>` : ''}${casesDroits(u.droits, DR, { lecture: bloque })}${bloque ? '' : `<div class="row"><button type="button" class="btn sm" data-savedr="${u.id}">Enregistrer les droits</button><span class="muted sm" data-drmsg="${u.id}"></span></div>`}</div>` : ''}
      </li>`;
    };
    const modeles = Object.entries(conf.modeles).map(([k, m]) => `<button type="button" class="chip-mod" data-modele="${k}">${esc(m.nom)}</button>`).join('') + '<button type="button" class="chip-mod" data-modele="">Sur mesure</button>';
    const nouveau = gere ? `<section class="box eq-nouveau" id="eqNouveau" hidden><div class="hc-th"><h2>👤 Ajouter une personne</h2><button type="button" class="lnk" data-fermer>Fermer</button></div>
      <form id="nu"><div class="g2"><label>Prénom<input name="prenom" required placeholder="ex. Romain" data-prenom></label><label>Nom<input name="nomFamille" required placeholder="ex. GOUJON" data-nomfam></label><label>E-mail<input type="email" name="email" required placeholder="prenom@magnoliatraiteur.fr"></label><label>Portable <small>(pour ses SMS de rendez-vous)</small><input type="tel" name="portable" placeholder="06 12 34 56 78"></label>
        <label>Mot de passe provisoire <small>(la personne le changera)</small><span class="eq-mdp"><input name="password" minlength="10" required value="${esc(mdpProvisoire())}"><button type="button" class="btn ghost sm" data-mdp>🔄 Autre</button></span></label>
        <label class="chk eq-mail"><input type="checkbox" name="envoyerAcces" checked> Lui envoyer ses accès par e-mail (lien du back-office, e-mail et mot de passe provisoire)</label></div>
        <h3>Son rôle</h3><p class="muted sm">Choisissez un modèle pour cocher les cases d’un coup, puis ajustez case par case.</p><div class="eq-mods">${modeles}</div>
        <div data-casesnu>${casesDroits(conf.modeles.commercial.droits, DR)}</div>
        <div class="row"><button class="btn">Créer le compte</button><button type="button" class="btn ghost" data-fermer>Annuler</button></div></form></section>` : '';
    return page('Équipe & activité', gere ? '<button type="button" class="btn eq-add" data-nouveau>+ Ajouter une personne</button>' : '', `${ongletsEquipe(cur, gere)}<div data-eqp="comptes">${nouveau}
      ${gere ? `<section class="box"><h2>Les comptes de l’équipe <small class="muted">(${users.filter(u => !u.desactive).length} actif${users.filter(u => !u.desactive).length > 1 ? 's' : ''})</small></h2><p class="muted sm">Chaque personne a ses propres cases. Un menu non autorisé disparaît de son back-office, et le serveur refuse l’action même si on essaie autrement.</p><ul class="eq-liste">${users.map(carte).join('')}</ul></section>` : ''}
      <div class="cols">
      <section class="box"><h2>Mon compte</h2>${moi ? `<p class="eq-res"><b>Vos droits :</b> ${esc(resumeDroits(moi.droits, DR))}</p>` : ''}
        <form id="pw"><h3>Mon mot de passe</h3><div class="g2"><label>Actuel<input type="password" name="current" required></label><label>Nouveau (10 caractères min.)<input type="password" name="password" minlength="10" required></label></div><button class="btn ghost">Changer</button></form></section>
</div></div>
      <div data-eqp="heures"><section class="box hs" id="heures-sup"><h2>⏱ Heures supplémentaires</h2><p class="muted">Chargement…</p></section></div>
      ${gere ? `<div data-eqp="journal"><section class="box pli${plie('journal') ? ' ferme' : ''}" data-pli="journal"><h2><button type="button" class="pli-btn" data-plibtn aria-expanded="${!plie('journal')}"><span class="pli-fl" aria-hidden="true">▼</span>Journal d’activité <span class="pill ${j.intact ? 'd-accepte' : 'd-refuse'}">${j.intact ? 'intact' : 'ALTÉRÉ'}</span><small class="pli-nb">${j.total} action${j.total > 1 ? 's' : ''}</small></button></h2><div class="pli-corps"><p class="muted sm">Chaque action est enregistrée et chaînée : une modification du journal se verrait. Les filtres ne font que trier l’affichage, ils ne changent rien au journal.</p>${journalFiltres(j)}<div id="jrnRes">${journalRes(j)}</div></div></section></div>` : ''}
      ${gere ? `<div data-eqp="remuneration"><section class="box pli${plie('remun') ? ' ferme' : ''}" data-pli="remun"><h2><button type="button" class="pli-btn" data-plibtn aria-expanded="${!plie('remun')}"><span class="pli-fl" aria-hidden="true">▼</span>💶 Rémunération par action</button></h2><div class="pli-corps"><p class="muted sm">Chaque action d’un membre de l’équipe (créer une fiche, envoyer un devis…) lui rapporte le montant fixé dans le barème ci-dessous. Choisissez la période, puis touchez une personne pour voir le détail.</p><div id="remBloc">${remBloc(rem)}</div></div></section></div>` : ''}
      ${gere ? `<div data-eqp="alertes"><section class="box" id="alertes"><h2>Alertes de l’équipe</h2><p class="muted sm">Le carnet des personnes à prévenir. Elles reçoivent le récapitulatif des dossiers sans action depuis 24 h, les avis et les devis signés. Pour les <b>nouvelles demandes de devis</b>, c’est le cadre « Qui prévenir selon la demande » juste en dessous qui décide.</p><div id="alp"></div><div class="row"><button type="button" class="btn ghost sm" data-addal>+ Ajouter une personne à prévenir</button><button type="button" class="btn ghost sm" data-addtous hidden>+ Ajouter toute l’équipe</button><button type="button" class="btn sm" data-saveal>Enregistrer les alertes</button></div></section>
      <section class="box ra" id="regles-alertes"><h2>🔀 Qui prévenir selon la demande</h2><p class="muted sm">À chaque nouvelle demande de devis, les règles sont lues dans l’ordre (1, 2, 3…). <b>Chaque règle qui correspond prévient ses personnes, et elles s’additionnent.</b> Cochez « S’arrêter là » pour ne pas lire les suivantes. Si aucune règle ne correspond, c’est la règle par défaut. Montants en euros TTC.</p>
        <div id="alr"></div>
        <div class="ra-ajout"><span class="muted sm">Règles toutes prêtes (montant et jours modifiables ensuite) :</span><button type="button" class="chip-mod" data-addr="gros">💶 Gros budget (5 000 € et plus)</button><button type="button" class="chip-mod" data-addr="urgent">⏰ Urgente (moins de 7 jours)</button><button type="button" class="chip-mod" data-addr="incomplet">⚠ Demande incomplète</button></div><div class="row"><button type="button" class="btn" data-addr="">+ Créer une règle</button></div>
        <div id="ald"></div>
        <div class="row"><button type="button" class="btn" data-saveal2>Enregistrer les règles</button><span class="muted sm">Les SMS de l’équipe finissent par le lien de la demande sur le site (back-office).</span></div></section>
      <section class="box ra-sim" id="simuler-alerte"><h2>🧪 Simuler une demande</h2><p class="muted sm">Tapez une demande imaginaire pour voir qui serait prévenu, avec les règles affichées au-dessus (même pas encore enregistrées). Rien n’est envoyé.</p>
        <div class="ra-simf"><label>Montant estimé TTC<span class="ra-pair"><input data-sim="montant" inputmode="decimal" value="6 000"><span>€</span></span></label><label>Nombre de personnes<input data-sim="invites" inputmode="numeric" value="80"></label><label>Date de l’événement<input type="date" data-sim="date" value="${new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10)}"></label><label>Situation<select data-sim="situation"><option value="incomplete">Demande incomplète : devis à faire à la main</option><option value="auto">Demande complète : devis envoyé tout seul par l’IA</option><option value="question">Simple question (formulaire Contact)</option></select></label></div>
        <div class="row"><button type="button" class="btn" data-simuler>🧪 Voir qui serait prévenu</button></div><div id="alsim" aria-live="polite"></div></section></div>
      <div data-eqp="envois"><section class="box pli${plie('envois') ? ' ferme' : ''}" data-pli="envois"><h2><button type="button" class="pli-btn" data-plibtn aria-expanded="${!plie('envois')}"><span class="pli-fl" aria-hidden="true">▼</span>E-mails et SMS envoyés ${env.live ? '' : '<span class="pill d-envoye">mode test : Brevo non branché</span>'}<small class="pli-nb">${env.envois.length} envoi${env.envois.length > 1 ? 's' : ''}</small></button></h2><div class="pli-corps"><div class="row"><input type="tel" data-testtel placeholder="Portable pour un SMS d’essai (sinon : ceux des alertes)" style="max-width:320px"><button class="btn ghost sm" data-test>Envoyer un essai</button></div><ul class="journal">${env.envois.map(e => `<li><time>${dateH(e.at)}</time> ${e.kind === 'sms' ? 'SMS' : 'E-mail'} → <b>${esc(e.kind === 'sms' ? e.payload.recipient : e.payload.to?.[0]?.email)}</b> <small>${esc(e.kind === 'sms' ? e.payload.content : e.payload.subject)}</small>${e.result?.error ? ` <span class="pill d-refuse">refusé : ${esc(e.result.error)}</span>` : e.live && e.result && e.result !== 'test' ? ' <span class="pill d-accepte">accepté par Brevo</span>' : ''}</li>`).join('') || '<li class="muted">Aucun envoi.</li>'}</ul></div></section></div>` : ''}`);
  }
  const essaiEnvoi = async () => { try {
    const r = await api(A + '/actions/envoi-test', { method: 'POST', body: { tel: $('[data-testtel]').value } });
    if (!r.live) toast('Mode test : l’essai est noté ci-dessous, rien n’est parti (clé Brevo à brancher).');
    else {
      const ko = [r.erreurMail ? 'e-mail : ' + r.erreurMail : '', ...(r.sms || []).filter(x => x.erreur).map(x => 'SMS ' + x.tel + ' : ' + x.erreur)].filter(Boolean);
      const okSms = (r.sms || []).filter(x => !x.erreur).length;
      if (ko.length) toast('Échec : ' + ko.join(' · '), true);
      else toast(`E-mail d’essai envoyé à ${r.email}` + (okSms ? ` et ${okSms} SMS accepté${okSms > 1 ? 's' : ''} par Brevo.` : '. Aucun SMS : saisissez un portable ou renseignez les « Alertes de l’équipe ».'));
    }
    render(); } catch (e) { toast(e.message, true); } };
  let alertePers = [];
  /* ---------- Qui prévenir selon la demande (server/routage-alertes.js) ---------- */
  let reglesAl = [], defautAl = { mode: 'tous', qui: [], tels: '', emails: '', canal: 'les2' };
  const MODELES_REGLE = {
    gros: { nom: 'Gros budget', montant: { op: 'min', val: 5000 } },
    urgent: { nom: 'Demande urgente', delai: { op: 'moins', jours: 7 } },
    incomplet: { nom: 'Demande incomplète', situation: 'incomplete' },
    '': { nom: '' },
  };
  const nouvelleRegle = k => ({ id: 'r' + Date.now().toString(36), actif: true, montant: { op: '', val: null }, invites: { op: '', val: null }, delai: { op: '', jours: null }, situation: '', qui: [], tels: '', emails: '', canal: 'les2', stop: false, ...JSON.parse(JSON.stringify(MODELES_REGLE[k] || {})) });
  /* membres : carnet des alertes + comptes de l'équipe */
  const membresAl = () => { const m = new Map(); for (const p of alertePers) if (p.nom) m.set(p.nom.toLowerCase(), { nom: p.nom, tel: p.tel, email: p.email }); for (const u of cache.equipeUsers || []) if (u.nom && !u.desactive) { const k = u.nom.toLowerCase(), x = m.get(k); if (x) { x.tel ||= u.portable; x.email ||= u.email; } else m.set(k, { nom: u.nom, tel: u.portable, email: u.email }); } return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')); };
  const choixQui = (sel, attr) => { const M = membresAl(), autres = (sel || []).filter(n => !M.some(x => x.nom === n)); return `<div class="ra-qui">${[...M, ...autres.map(nom => ({ nom, absent: true }))].map(x => `<label class="ra-pers${(sel || []).includes(x.nom) ? ' on' : ''}"><input type="checkbox" ${attr} value="${esc(x.nom)}"${(sel || []).includes(x.nom) ? ' checked' : ''}><span><b>${esc(x.nom)}</b><small>${x.absent ? 'n’est plus dans la liste' : [x.tel ? '📱 ' + esc(x.tel) : '📱 pas de portable', x.email ? '✉ ' + esc(x.email) : '✉ pas d’e-mail'].join(' · ')}</small></span></label>`).join('') || '<p class="muted sm">Ajoutez d’abord des personnes dans « Alertes de l’équipe » ou des comptes d’équipe.</p>'}</div>`; };
  const optsSel = (L, v) => L.map(([k, t]) => `<option value="${k}"${String(v ?? '') === k ? ' selected' : ''}>${t}</option>`).join('');
  /* valeurs proposées dans les listes (Jean-Luc, 2026-11-27) ; une valeur déjà enregistrée hors liste reste proposée */
  const MONTANTS_AL = [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 20000, 30000];
  const JOURS_AL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 21, 30, 45, 60];
  const INVITES_AL = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 1000];
  const valSel = (L, v, lib) => [...new Set([...L, +v].filter(x => Number.isFinite(x) && x > 0))].sort((a, b) => a - b).map(x => `<option value="${x}"${x === +v ? ' selected' : ''}>${lib(x)}</option>`).join('');
  const CANAL_OPTS = [['les2', 'E-mail et SMS'], ['email', 'E-mail seulement'], ['sms', 'SMS seulement']];
  const fmtN = v => v == null || v === '' ? '' : Number(v).toLocaleString('fr-FR');
  const resumeRegle = r => {
    const c = [];
    if (r.montant?.op && r.montant.val != null) c.push(`le montant est ${r.montant.op === 'min' ? 'd’au moins' : 'de moins de'} ${fmtN(r.montant.val)} € TTC`);
    if (r.invites?.op && r.invites.val != null) c.push(`${r.invites.op === 'min' ? 'il y a au moins' : 'il y a moins de'} ${fmtN(r.invites.val)} personnes`);
    if (r.delai?.op && r.delai.jours != null) c.push(`l’événement a lieu dans ${r.delai.op === 'moins' ? 'moins' : 'plus'} de ${r.delai.jours} jours`);
    if (r.situation === 'incomplete') c.push('la demande est incomplète (devis à faire à la main)');
    if (r.situation === 'auto') c.push('le devis est parti tout seul');
    const qui = [...(r.qui || []), ...String(r.tels || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean), ...String(r.emails || '').split(/[,;]+/).map(x => x.trim()).filter(Boolean)];
    return `${c.length ? 'Si ' + c.join(' <b>et</b> ') : 'Pour <b>toutes</b> les demandes'}, prévenir ${qui.length ? '<b>' + esc(qui.join(', ')) + '</b>' : '<span class="ra-err">personne (choisissez au moins une personne)</span>'} par ${({ email: 'e-mail seulement', sms: 'SMS seulement' })[r.canal] || 'e-mail et SMS'}${r.stop ? ', puis s’arrêter là' : ''}.`;
  };
  const drawRegles = () => {
    const box = $('#alr'); if (!box) return;
    for (const r of reglesAl) { if (r.montant?.op && r.montant.val == null) r.montant.val = 5000; if (r.invites?.op && r.invites.val == null) r.invites.val = 100; if (r.delai?.op && r.delai.jours == null) r.delai.jours = r.delai.op === 'moins' ? 3 : 30; }
    box.innerHTML = reglesAl.map((r, i) => `<div class="ra-regle${r.actif === false ? ' off' : ''}" data-r="${i}">
      <div class="ra-tete"><span class="ra-num">${i + 1}</span><input class="ra-nom" data-f="nom" value="${esc(r.nom || '')}" placeholder="Nom de la règle (ex. Gros budget)"><label class="chk"><input type="checkbox" data-f="actif"${r.actif !== false ? ' checked' : ''}> Active</label>
        <span class="ra-ord"><button type="button" class="btn ghost sm" data-mv="-1" title="Monter (plus prioritaire)"${i ? '' : ' disabled'}>↑</button><button type="button" class="btn ghost sm" data-mv="1" title="Descendre"${i < reglesAl.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="lnk" data-delr>Supprimer</button></span></div>
      <h4>Si la demande…</h4>
      <div class="ra-conds">
        <label>Montant estimé TTC<span class="ra-pair"><select data-f="montant.op">${optsSel([['', 'Peu importe'], ['min', 'au moins'], ['max', 'moins de']], r.montant?.op)}</select>${r.montant?.op ? `<select data-f="montant.val" class="ra-val">${valSel(MONTANTS_AL, r.montant.val ?? 5000, v => fmtN(v) + ' €')}</select>` : ''}</span></label>
        <label>Nombre de personnes<span class="ra-pair"><select data-f="invites.op">${optsSel([['', 'Peu importe'], ['min', 'au moins'], ['max', 'moins de']], r.invites?.op)}</select>${r.invites?.op ? `<select data-f="invites.val" class="ra-val">${valSel(INVITES_AL, r.invites.val ?? 100, v => fmtN(v) + ' pers.')}</select>` : ''}</span></label>
        <label>Date de l’événement : dans…<span class="ra-pair"><select data-f="delai.op">${optsSel([['', 'Peu importe'], ['moins', 'moins de (urgent)'], ['plus', 'plus de']], r.delai?.op)}</select>${r.delai?.op ? `<select data-f="delai.jours" class="ra-val">${valSel(JOURS_AL, r.delai.jours ?? 7, v => v + (v > 1 ? ' jours' : ' jour'))}</select>` : ''}</span></label>
        <label>Situation<select data-f="situation">${optsSel([['', 'Peu importe'], ['incomplete', 'Demande incomplète : devis pas parti tout seul'], ['auto', 'Devis envoyé tout seul par l’IA']], r.situation)}</select></label>
      </div>
      <h4>Alors prévenir…</h4>
      ${choixQui(r.qui, 'data-qui')}
      <div class="ra-conds"><label>Autre(s) portable(s) <small class="muted">séparés par une virgule</small><input type="tel" data-f="tels" value="${esc(r.tels || '')}" placeholder="06 12 34 56 78"></label><label>Autre(s) e-mail(s)<input data-f="emails" value="${esc(r.emails || '')}" placeholder="prenom@magnoliatraiteur.fr"></label><label>Par<select data-f="canal">${optsSel(CANAL_OPTS, r.canal || 'les2')}</select></label></div>
      <label class="chk ra-stop"><input type="checkbox" data-f="stop"${r.stop ? ' checked' : ''}> S’arrêter là : si cette règle correspond, ne pas lire les règles suivantes</label>
      <p class="ra-resume">${resumeRegle(r)}</p></div>`).join('') || '<p class="ra-vide">Aucune règle pour l’instant : toute la liste « Alertes de l’équipe » est prévenue à chaque demande. Ajoutez une règle avec les boutons ci-dessous.</p>';
    const d = defautAl;
    $('#ald').innerHTML = `<div class="ra-regle ra-def"><div class="ra-tete"><span class="ra-num">★</span><b>Règle par défaut</b><small class="muted">quand aucune règle ne correspond</small></div>
      <div class="ra-conds"><label>Prévenir<select data-d="mode">${optsSel([['tous', 'toute la liste « Alertes de l’équipe »'], ['choix', 'seulement les personnes choisies']], d.mode)}</select></label><label>Par<select data-d="canal">${optsSel(CANAL_OPTS, d.canal || 'les2')}</select></label></div>
      ${d.mode === 'choix' ? `${choixQui(d.qui, 'data-dqui')}<div class="ra-conds"><label>Autre(s) portable(s)<input type="tel" data-d="tels" value="${esc(d.tels || '')}" placeholder="06 12 34 56 78"></label><label>Autre(s) e-mail(s)<input data-d="emails" value="${esc(d.emails || '')}"></label></div>` : ''}</div>`;
  };
  const nombreFr = v => { const n = parseFloat(String(v ?? '').replace(/\s| | /g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const lireRegles = () => {
    $$('#alr .ra-regle').forEach(el => {
      const r = reglesAl[+el.dataset.r]; if (!r) return;
      el.querySelectorAll('[data-f]').forEach(inp => {
        const [a, b] = inp.dataset.f.split('.');
        const v = inp.type === 'checkbox' ? inp.checked : /val|jours/.test(b || '') ? nombreFr(inp.value) : inp.value.trim();
        if (b) { r[a] = { ...(r[a] || {}), [b]: v }; } else r[a] = v;
      });
      r.qui = [...el.querySelectorAll('[data-qui]:checked')].map(x => x.value);
    });
    const D = $('#ald'); if (D) { D.querySelectorAll('[data-d]').forEach(inp => { defautAl[inp.dataset.d] = inp.value.trim(); }); if (D.querySelector('[data-dqui]')) defautAl.qui = [...D.querySelectorAll('[data-dqui]:checked')].map(x => x.value); }
    return reglesAl;
  };
  const corpsAlertes = () => { const L = lireAl().filter(x => x.nom || x.tel || x.email); lireRegles(); const P = L.map(({ libre, ...x }) => x); return { personnes: P, emails: P.map(x => x.email).filter(Boolean).join(', '), sms: P.map(x => x.tel).filter(Boolean).join(', '), regles: reglesAl, defaut: defautAl }; };
  const enregistrerAlertes = async () => {
    const corps = corpsAlertes();
    const vides = corps.regles.map((r, i) => r.actif !== false && !(r.qui.length || r.tels || r.emails) ? i + 1 : 0).filter(Boolean);
    if (vides.length) return toast(`Règle ${vides.join(', ')} : choisissez au moins une personne à prévenir (ou décochez « Active »).`, true);
    try { await api(A + '/site', { method: 'PUT', body: { alertes: corps } }); const R = await api(A + '/site'); if (cache.R) cache.R.alertes = R.alertes; reglesAl = R.alertes?.regles || []; defautAl = { ...defautAl, ...(R.alertes?.defaut || {}) }; drawRegles(); toast('Alertes et règles enregistrées.'); }
    catch (err) { toast(err.message, true); }
  };
  const simulerAlerte = async () => {
    const out = $('#alsim'); const corps = corpsAlertes();
    const t = Object.fromEntries($$('[data-sim]').map(x => [x.dataset.sim, x.value]));
    if (t.situation === 'question') { t.question = true; t.situation = ''; }
    out.innerHTML = '<p class="muted">Calcul…</p>';
    try {
      const r = await api(A + '/actions/alertes-simuler', { method: 'POST', body: { ...corps, test: t } });
      const p = r.profil;
      const lig = r.detail.map(d => `<li class="ra-d ra-${d.statut}"><b>${d.statut === 'ok' ? '✓' : d.statut === 'non' ? '✗' : '–'} Règle ${d.n} · ${esc(d.nom)}</b> ${d.statut === 'inactive' ? '<small>désactivée</small>' : d.statut === 'sautee' ? '<small>pas lue (une règle au-dessus dit « S’arrêter là »)</small>' : `<small>${d.conditions.length ? d.conditions.map(c => (c.ok ? '✓ ' : '✗ ') + esc(c.txt)).join(' · ') : 'aucune condition : toutes les demandes'}</small>`}</li>`).join('');
      const can = c => c === 'email' ? '✉ E-mail' : '📱 SMS';
      out.innerHTML = `<div class="ra-res"><p class="ra-prof">Demande imaginaire : <b>${(p.montantCents / 100).toLocaleString('fr-FR')} € TTC</b> · <b>${p.invites ?? '?'} pers.</b> · ${p.jours == null ? 'sans date' : p.jours < 0 ? 'date passée' : `dans <b>${p.jours} jour${p.jours > 1 ? 's' : ''}</b>`}${p.question ? ' · simple question' : p.situation === 'auto' ? ' · devis parti tout seul' : ' · incomplète'}</p>
        ${lig ? `<ul class="ra-dl">${lig}</ul>` : ''}${r.parDefaut ? '<p class="ra-def-p">Aucune règle ne correspond : <b>règle par défaut</b>.</p>' : ''}
        <h4>Seraient prévenus (${r.destinataires.length})</h4>
        <ul class="ra-dest">${r.destinataires.map(x => `<li><span class="eq-av">${esc(initiales(x.nom || '?'))}</span><span><b>${esc(x.nom)}</b><small>${x.canaux.map(c => `<span class="pill d-accepte">${can(c)}${c === 'sms' ? ' ' + esc(x.tel) : ' ' + esc(x.email)}</span>`).join(' ')}${x.manque.length ? ` <span class="pill d-refuse">⚠ pas de ${x.manque.join(' ni d’')} renseigné</span>` : ''}</small><small class="muted">au titre de : ${esc(x.regles.join(', '))}</small></span></li>`).join('') || '<li class="muted">Personne : ajoutez des personnes à une règle ou à la règle par défaut.</li>'}</ul></div>`;
    } catch (e) { out.innerHTML = `<p class="ra-err">${esc(e.message)}</p>`; }
  };
  /* Nom : liste déroulante des comptes de l'équipe (Jean-Luc, 2026-11-27) ; portable et e-mail remplis depuis le compte. « Autre personne » = nom tapé. */
  const equipeActive = () => (cache.equipeUsers || []).filter(u => u.nom && !u.desactive).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const membreDe = nom => equipeActive().find(u => u.nom.toLowerCase() === String(nom || '').trim().toLowerCase());
  const drawAl = () => {
    const E = equipeActive(), pris = new Set(alertePers.map(x => String(x.nom || '').toLowerCase()));
    $('#alp').innerHTML = alertePers.map((x, i) => {
      const libre = x.libre || (x.nom && !membreDe(x.nom));
      const opts = `<option value="">— Choisir dans l’équipe —</option>${E.map(u => `<option value="${esc(u.nom)}"${!libre && membreDe(x.nom) === u ? ' selected' : ''}${pris.has(u.nom.toLowerCase()) && membreDe(x.nom) !== u ? ' disabled' : ''}>${esc(u.nom)}</option>`).join('')}<option value="__autre"${libre ? ' selected' : ''}>✏ Autre personne (taper le nom)</option>`;
      return `<div class="g3 alp" data-i="${i}"><label>Nom<select data-alsel>${opts}</select>${libre ? `<input data-k="nom" value="${esc(x.nom || '')}" placeholder="Prénom NOM" class="alp-libre">` : `<input type="hidden" data-k="nom" value="${esc(x.nom || '')}">`}</label><label>Portable (SMS)<input type="tel" data-k="tel" value="${esc(x.tel || '')}" placeholder="06 12 34 56 78"></label><label>E-mail<input type="email" data-k="email" value="${esc(x.email || '')}"></label><button type="button" class="lnk" data-delal="${i}">Retirer</button></div>`;
    }).join('') || '<p class="muted sm">Personne n’est prévenu pour l’instant.</p>';
    const manquants = E.filter(u => !pris.has(u.nom.toLowerCase())).length, b = $('[data-addtous]');
    if (b) { b.hidden = !manquants; b.textContent = `+ Ajouter toute l’équipe (${manquants})`; }
  };
  const choisirMembre = (row, v) => {
    lireAl(); const x = alertePers[+row.dataset.i]; if (!x) return;
    if (v === '__autre') { x.libre = true; if (membreDe(x.nom)) x.nom = ''; }
    else { x.libre = false; const u = membreDe(v); x.nom = u ? u.nom : ''; if (u) { x.tel = u.portable || x.tel || ''; x.email = u.email || x.email || ''; } }
    drawAl(); if (v === '__autre') $(`#alp .alp[data-i="${row.dataset.i}"] .alp-libre`)?.focus();
  };
  const lireAl = () => { $$('#alp .alp').forEach(row => { const x = alertePers[+row.dataset.i]; row.querySelectorAll('[data-k]').forEach(inp => { x[inp.dataset.k] = inp.value.trim(); }); }); return alertePers; };
  equipe.after = id => {
    montrerEq(eqCourant(id, peut('equipe')));
    $$('[data-eqong]').forEach(a => a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); const k = a.dataset.eqong; if (location.hash !== '#/equipe/' + k) history.pushState(null, '', '#/equipe/' + k); montrerEq(k); window.scrollTo({ top: 0 }); }));
    $('#pw').addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Mot de passe changé.'); e.target.reset(); } catch (err) { toast(err.message, true); } });
    hsCharger();
    if (!peut('equipe')) return;
    const DR = cache.droitsConf.droits;
    drawAl();
    $('[data-addal]')?.addEventListener('click', () => { lireAl(); alertePers.push({ nom: '', tel: '', email: '' }); drawAl(); $$('#alp [data-alsel]').pop()?.focus(); });
    $('#alp')?.addEventListener('click', e => { const b = e.target.closest('[data-delal]'); if (!b) return; lireAl(); alertePers.splice(+b.dataset.delal, 1); drawAl(); });
    $('[data-saveal]')?.addEventListener('click', enregistrerAlertes);
    $('[data-saveal2]')?.addEventListener('click', enregistrerAlertes);
    drawRegles();
    /* un nom changé dans le carnet : les cases des règles suivent */
    $('#alp')?.addEventListener('change', e => { const sel = e.target.closest('[data-alsel]'); if (sel) choisirMembre(sel.closest('.alp'), sel.value); else lireAl(); lireRegles(); drawRegles(); });
    $('[data-addtous]')?.addEventListener('click', () => { lireAl(); const pris = new Set(alertePers.map(x => String(x.nom || '').toLowerCase())); for (const u of equipeActive()) if (!pris.has(u.nom.toLowerCase())) alertePers.push({ nom: u.nom, tel: u.portable || '', email: u.email || '' }); alertePers = alertePers.filter(x => x.nom || x.tel || x.email); drawAl(); lireRegles(); drawRegles(); toast('Toute l’équipe est ajoutée : pensez à enregistrer.'); });
    $$('[data-addr]').forEach(b => b.addEventListener('click', () => { lireRegles(); reglesAl.push(nouvelleRegle(b.dataset.addr)); drawRegles(); $$('#alr .ra-nom').pop()?.focus(); }));
    const regBox = $('#regles-alertes');
    regBox?.addEventListener('change', e => { if (e.target.matches('select, input[type=checkbox]')) { lireRegles(); drawRegles(); } });
    regBox?.addEventListener('input', e => { const el = e.target.closest('.ra-regle[data-r]'); if (!el) return; lireRegles(); const r = reglesAl[+el.dataset.r]; const p = el.querySelector('.ra-resume'); if (r && p) p.innerHTML = resumeRegle(r); });
    regBox?.addEventListener('click', e => {
      const el = e.target.closest('.ra-regle[data-r]'); if (!el) return; const i = +el.dataset.r;
      if (e.target.closest('[data-delr]')) { lireRegles(); reglesAl.splice(i, 1); drawRegles(); }
      const mv = e.target.closest('[data-mv]'); if (mv) { lireRegles(); const j = i + +mv.dataset.mv; if (j < 0 || j >= reglesAl.length) return; [reglesAl[i], reglesAl[j]] = [reglesAl[j], reglesAl[i]]; drawRegles(); }
    });
    $('[data-simuler]')?.addEventListener('click', simulerAlerte);
    $('[data-test]')?.addEventListener('click', essaiEnvoi);
    /* « + Ajouter une personne » */
    const box = $('#eqNouveau'), cases = $('[data-casesnu]');
    const montrer = v => { if (v && box.closest('[data-eqp]')?.hidden) { history.pushState(null, '', '#/equipe/comptes'); montrerEq('comptes'); } box.hidden = !v; if (v) { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('input[name=prenom]', box).focus(); } };
    $('[data-nouveau]').addEventListener('click', () => montrer(true));
    $$('[data-fermer]', box).forEach(b => b.addEventListener('click', () => montrer(false)));
    $('[data-mdp]').addEventListener('click', () => { $('input[name=password]', box).value = mdpProvisoire(); });
    lierCases(cases);
    const choisir = k => { $$('.chip-mod', box).forEach(c => c.classList.toggle('on', c.dataset.modele === k)); if (k) { cases.innerHTML = casesDroits(cache.droitsConf.modeles[k].droits, DR); } };
    choisir('commercial');
    $$('.chip-mod', box).forEach(c => c.addEventListener('click', () => choisir(c.dataset.modele)));
    cases.addEventListener('droits', () => $$('.chip-mod', box).forEach(c => c.classList.toggle('on', c.dataset.modele === '')));
    $('#nu').addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        const r = await api(A + '/actions/equipe', { method: 'POST', body: { prenom: f.prenom, nomFamille: f.nomFamille, portable: f.portable, email: f.email, password: f.password, envoyerAcces: !!f.envoyerAcces, droits: lireDroits(cases) } });
        toast(`Compte créé pour ${f.prenom.trim()} ${f.nomFamille.trim().toLocaleUpperCase('fr-FR')}.` + (r.mail ? (r.mail.erreur ? ' L’e-mail d’accès n’est pas parti : ' + r.mail.erreur : r.mail.live ? ' Ses accès lui ont été envoyés par e-mail.' : ' (Mode test : e-mail noté, rien n’est parti.)') : ' Donnez-lui son mot de passe provisoire : ' + f.password), !!r.mail?.erreur);
        render();
      } catch (err) { toast(err.message, true); }
    });
    /* droits d'un compte existant */
    $$('[data-ouvrir]').forEach(b => b.addEventListener('click', () => { const p = $(`[data-pan="${b.dataset.ouvrir}"]`); p.hidden = !p.hidden; b.classList.toggle('on', !p.hidden); }));
    $$('.eq-panneau').forEach(p => { const d = $('.eq-droits', p); if (d) lierCases(d); });
    $$('[data-savedr]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.savedr, d = lireDroits($(`[data-pan="${id}"]`));
      try { await api(`${A}/actions/equipe/${id}`, { method: 'PATCH', body: { droits: d } }); toast('Droits enregistrés : ils s’appliquent dès son prochain clic.'); render(); } catch (err) { toast(err.message, true); }
    }));
    /* Prénom, Nom, Portable : enregistrés dès qu'on quitte la case */
    $$('[data-fiche] input').forEach(i => i.addEventListener('change', async () => { const id = i.closest('[data-fiche]').dataset.fiche; const v = i.dataset.k === 'prenom' ? majPrenom(i.value.trim()) : i.dataset.k === 'nomFamille' ? i.value.trim().toLocaleUpperCase('fr-FR') : i.value; try { await api(`${A}/actions/equipe/${id}`, { method: 'PATCH', body: { [i.dataset.k]: v } }); toast(i.dataset.k === 'portable' ? (v.trim() ? 'Portable enregistré.' : 'Portable retiré.') : 'Nom enregistré.'); if (i.dataset.k !== 'portable') session = null; render(); } catch (err) { toast(err.message, true); render(); } }));
    $$('[data-dis]').forEach(b => b.addEventListener('click', async () => { if (b.dataset.v === '1' && !confirm('Désactiver ce compte ? La personne est déconnectée tout de suite et ne peut plus se connecter (vous pourrez le réactiver).')) return; try { await api(`${A}/actions/equipe/${b.dataset.dis}`, { method: 'PATCH', body: { desactive: b.dataset.v === '1' } }); render(); } catch (err) { toast(err.message, true); } }));
  };

  /* ---------- outils ---------- */
  async function outils() {
    const [mods, pages] = peut('outils') ? await Promise.all([api(A + '/modeles'), api(A + '/pages')]) : [[], []];
    return page('Outils', '', `${peut('fichiers') ? `<section class="box"><h2>Excel</h2><p class="muted sm">Les fichiers s’ouvrent directement dans Excel. Pour changer beaucoup de prix d’un coup : exportez le catalogue, modifiez les colonnes prix, minimum, coût, TVA, statut ou maison, enregistrez en CSV, puis renvoyez le fichier. Rien n’est créé ni supprimé, et un prix sous le coût est refusé.</p>
      <div class="row">${[['catalogue', 'Catalogue'], ['demandes', 'Demandes'], ['clients', 'Clients'], ['devis', 'Devis'], ['factures', 'Factures'], ['reglements', 'Règlements']].filter(([k]) => peut('factures') || !['factures', 'reglements'].includes(k)).map(([k, l]) => `<a class="btn ghost sm" href="${A}/actions/export/${k}">⬇ ${l}</a>`).join('')}${peut('prix') ? '<label class="btn sm up">⬆ Mettre à jour le catalogue<input type="file" accept=".csv,text/csv" hidden data-importcat></label>' : ''}</div><div id="impres"></div></section>` : ''}
      ${peut('outils') ? `<section class="box"><h2>Modèles de relance</h2><p class="muted sm">Variables : {prenom} {nom} {numero} {evenement} {date} {lien} {montant}</p>${mods.map(m => `<form class="mod" data-id="${m.id}"><div class="g3"><label>Nom<input name="nom" value="${esc(m.nom)}"></label><label>Canal<select name="canal"><option value="email">E-mail</option><option value="sms"${m.canal === 'sms' ? ' selected' : ''}>SMS</option></select></label><label>Sujet<input name="sujet" value="${esc(m.sujet || '')}"></label></div><textarea name="texte" rows="5">${esc(m.texte)}</textarea><button class="btn ghost sm">Enregistrer</button></form>`).join('')}<button class="btn ghost" data-newm>+ Nouveau modèle</button></section>
      <section class="box"><h2>Pages administratives</h2><p class="muted sm">CGV, mentions légales, confidentialité, allergènes… Une ligne courte devient un intertitre.</p>${pages.map(p => `<details><summary>${esc(p.titre)} <small class="muted">${esc(p.url)}</small></summary><form class="pg" data-id="${p.id}"><label>Titre<input name="titre" value="${esc(p.titre)}"></label><textarea name="texte" rows="14">${esc(p.texte)}</textarea><button class="btn ghost sm">Enregistrer</button></form></details>`).join('')}</section>` : ''}
      ${peut('admin') ? `<section class="box"><h2>Reprendre le catalogue du brouillon</h2><p class="muted sm">Remplace les prestations, rubriques et lieux par ceux du brouillon (data/brouillon.json). Les demandes, devis, factures et clients ne sont pas touchés. À n’utiliser qu’avant l’ouverture.</p><button class="btn ghost" data-reimp>Réimporter le brouillon</button></section>` : ''}`);
  }
  /* lecture d'un CSV « ; » ou « , » (Excel) avec guillemets */
  function lireCsv(txt) {
    txt = txt.replace(/^\ufeff/, '');
    const sep = (txt.split('\n')[0].match(/;/g) || []).length >= (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"' && txt[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim()));
  }
  outils.after = () => {
    $('[data-importcat]')?.addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const rows = lireCsv(await f.text()); const h = rows.shift() || [];
      const col = re => h.findIndex(x => re.test(x));
      const ix = { code: col(/^code/i), prix: h.findIndex(x => /^prix/i.test(x) && !/achat/i.test(x)), min: col(/^minimum/i), cout: col(/^co[uû]t|^prix d.achat/i), tva: col(/^tva/i), statut: col(/^statut/i), maison: col(/^maison/i) };
      if (ix.code < 0 || ix.prix < 0) { toast('Fichier non reconnu : partez d’un export du catalogue.', true); return; }
      const lignes = rows.map(r => Object.fromEntries(Object.entries(ix).filter(([, i]) => i >= 0).map(([k, i]) => [k, r[i]])));
      try { const r = await api(A + '/actions/import-catalogue', { method: 'POST', body: { lignes } }); $('#impres').innerHTML = `<p class="okbox">${r.maj} prestation(s) mise(s) à jour.</p>${r.erreurs.length ? `<ul class="journal">${r.erreurs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`; }
      catch (err) { toast(err.message, true); }
      e.target.value = '';
    });
    $$('form.mod').forEach(f => f.addEventListener('submit', async e => { e.preventDefault(); await api(`${A}/modeles/${f.dataset.id}`, { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Modèle enregistré.'); }));
    $$('form.pg').forEach(f => f.addEventListener('submit', async e => { e.preventDefault(); const p = await api(`${A}/pages/${f.dataset.id}`); await api(`${A}/pages/${f.dataset.id}`, { method: 'PUT', body: { ...p, ...Object.fromEntries(new FormData(f)) } }); toast('Page enregistrée.'); }));
    $('[data-newm]')?.addEventListener('click', async () => { await api(A + '/modeles', { method: 'POST', body: { nom: 'Nouveau modèle', canal: 'email', sujet: '', texte: 'Bonjour {prenom},\n\n' } }); render(); });
    $('[data-reimp]')?.addEventListener('click', async () => { if (!confirm('Remplacer tout le catalogue par celui du brouillon ?')) return; const r = await api(A + '/actions/reimporter', { method: 'POST' }); toast(`Réimporté : ${r.produits} prestations.`); });
  };

  render();
})();
