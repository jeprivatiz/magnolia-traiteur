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
  const UNITES = ['personne', 'pièce', 'portion', 'plateau', 'coffret', 'corbeille', 'gâteau', 'forfait', 'prestation', 'heure', 'location', 'bouteille', 'lot de 6', 'conditionnement', 'litre', 'table', 'chaise', 'km', 'unité'];
  const ALLERGENES = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];
  let session = null, cache = {};
  /* droits détaillés du compte connecté (Équipe & activité) ; « Administrateur » a tout */
  const peut = k => !!session?.droits?.[k];
  const DROIT_ECRAN = { factures: 'factures', catalogue: 'produits', lieux: 'produits', site: 'site', avis: 'site', medias: 'site', entreprise: 'entreprise', outils: ['outils', 'fichiers'] };
  const voitEcran = r => { const d = DROIT_ECRAN[r]; return !d || [].concat(d).some(peut); };

  /* ---------- structure ---------- */
  /* menu « Espace équipe » comme Je Privatise : CRM regroupe Demandes de devis, Suivi client, Devis et Factures */
  const CRM = ['demandes', 'suivi', 'devis', 'factures', 'clients'];
  const MENU = [
    ['', 'Tableau de bord'],
    ['crm', 'CRM'],
    ['demandes', 'Demandes de devis'],
    ['suivi', 'Suivi client'],
    ['devis', 'Devis'],
    ['factures', 'Factures'],
    ['clients', 'Clients'],
    ['agenda', 'Agenda'],
    ['-'],
    ['catalogue', 'Catalogue'],
    ['lieux', 'Lieux'],
    ['site', 'Photos & textes du site'],
    ['avis', 'Avis clients'],
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
      : m[0] === 'crm' ? `<button type="button" class="chip crm-btn" data-tab="crm" data-crm aria-expanded="${open}" title="Demandes de devis, Suivi client, Devis, Factures, Clients">CRM<span>${nb}</span></button>`
      : `<a href="#/${m[0]}" data-tab="${m[0]}" class="chip${CRM.includes(m[0]) ? ' crm-sub' : ''}${cur === m[0] ? ' on' : ''}"${cur === m[0] ? ' aria-current="page"' : ''}>${m[1]}${m[0] === 'demandes' ? `<span>${nb}</span>` : ''}</a>`;
    return `<div class="bo">
      <aside class="side" id="side"><a class="logo" href="#/"><img src="/brand/monogramme.svg" alt=""><span>Magnolia<small>Back-office</small></span></a><a class="go-site" href="/" target="_blank" rel="noopener">🌐 Aller sur le site ↗</a>
      <nav class="tabs${open ? ' crm-open' : ''}"><p class="tabs-lab">Espace équipe</p>${MENU.filter(m => m[0] === '-' || m[0] === 'crm' || voitEcran(m[0])).filter((m, i, l) => m[0] !== '-' || (i > 0 && l[i - 1][0] !== '-' && i < l.length - 1)).map(item).join('')}</nav>
      <div class="me"><span>${esc(session.nom || session.email)}<small>${peut('admin') ? 'Administrateur' : peut('toutes') ? 'Équipe' : 'Commercial · ses dossiers'}</small></span><button class="lnk" data-logout>Déconnexion</button></div></aside>
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
    const views = { '': dashboard, demandes, suivi, devis, factures, agenda, clients, catalogue, produit, lieux, lieu, site, avis, medias, entreprise, equipe, outils };
    let fn = route === 'catalogue' && id ? produit : route === 'lieux' && id ? lieu : views[route] || dashboard;
    if (!voitEcran(route)) fn = sansAcces;
    if (!peut('toutes') && typeof SV !== 'undefined') { SV.o = ''; mem.set('mg_commercial', ''); } /* « seulement ses opportunités » : pas de filtre sur un autre commercial */
    if (CRM.includes(route)) mem.set('mg_crm_last', route);
    if (!cache.nouvelles && cache.nouvelles !== 0) api(A + '/demandes').then(l => { cache.nouvelles = l.filter(d => aTraiter(d, cache.devisL || [])).length; $$('#side .chip[data-tab=demandes] span, #side .crm-btn span').forEach(x => { x.textContent = cache.nouvelles || ''; }); }).catch(() => {});
    app.innerHTML = shell('<p class="muted">Chargement…</p>', route === 'produit' ? 'catalogue' : route);
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
    const s = await api(A + '/stats' + (SV.o ? '?com=' + encodeURIComponent(SV.o) : ''));
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

  /* ---------- demandes ---------- */
  /* règle de Jean-Luc : ici, seulement les demandes sur lesquelles personne n'est intervenu ; dès la première action
     (devis, e-mail, SMS, appel, note, rendez-vous, attribution), elles passent dans « Suivi client » */
  const aTraiter = (d, dv) => d.type !== 'contact' && !d.classee && !d.priseEnCharge && d.statut === 'demande' && !dv.some(x => x.demandeId === d.id);
  async function demandes(id) {
    if (id) return demande(id);
    const [list0, dv] = await Promise.all([api(A + '/demandes'), api(A + '/devis')]);
    const list = list0.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    cache.devisL = dv;
    const todo = list.filter(d => aTraiter(d, dv)), msgs = list.filter(d => d.type === 'contact' && !d.classee), done = list.filter(d => !todo.includes(d) && !msgs.includes(d));
    cache.nouvelles = todo.length;
    const voir = demandes.voir || 'todo', shown = voir === 'done' ? done : voir === 'msg' ? msgs : todo;
    const tel = t => String(t || '').replace(/[^\d+]/g, '');
    const action = d => {
      if (d.type === 'contact') return `<button class="lnk sm" type="button" data-classer="${d.id}">Déjà traité : classer</button>`;
      const x = dv.filter(v => v.demandeId === d.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
      return `${x ? `<a class="btn sm" href="#/devis/${x.id}">${x.statut === 'brouillon' ? 'Terminer le devis' : 'Ouvrir le devis'}</a>` : `<button class="btn sm" type="button" data-mk="${d.id}">Créer un devis</button>`}${voir === 'todo' ? `<button class="lnk sm" type="button" data-classer="${d.id}">Déjà traitée : classer</button>` : ''}`;
    };
    const row = d => `<tr data-href="#/demandes/${d.id}"${d.statut === 'demande' && !d.vue ? ' class="new"' : ''}>
      <td>${new Date(d.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}<small>${esc(d.ref)}</small></td>
      <td><b>${esc(d.contact?.nom)}</b>${d.contact?.societe ? `<small class="ink">${esc(d.contact.societe)}</small>` : ''}<small>${esc(d.contact?.email)}${d.contact?.tel ? `<br><a href="tel:${esc(tel(d.contact.tel))}">${esc(d.contact.tel)}</a>` : ''}</small></td>
      <td>${d.type === 'contact' ? `<b>Message</b><small>${esc(d.sujet || '')}</small>` : `<b>${esc(d.evenement?.type || '—')}</b><small>${esc([d.evenement?.cp, d.evenement?.ville].filter(Boolean).join(' '))}${d.evenement?.horaire ? ' · ' + esc(d.evenement.horaire) : ''}</small>`}</td>
      <td>${d.evenement?.date ? dateFr(d.evenement.date, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</td>
      <td class="n">${d.evenement?.invites || '—'}</td>
      <td>${(d.lignes || []).length ? `<b>${d.lignes.length} prestation${d.lignes.length > 1 ? 's' : ''}</b> · ${euros(d.totalEstimeCents)}<small>${esc(d.lignes.slice(0, 3).map(l => l.titre).join(', '))}${d.lignes.length > 3 ? '…' : ''}</small>` : ''}${d.message ? `<small class="msg">${esc(String(d.message).slice(0, 160))}${String(d.message).length > 160 ? '…' : ''}</small>` : ''}</td>
      <td class="act">${action(d)}</td></tr>`;
    const onglet = (k, l, n) => `<button type="button" class="qs-chip${voir === k ? ' on' : ''}" data-voir="${k}">${l} <b>${n}</b></button>`;
    return page('Demandes de devis', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', `
      <p class="muted intro">Les demandes envoyées depuis le site arrivent ici, avec une alerte par e-mail. Dès que quelqu’un s’en occupe (devis, e-mail, SMS, appel, note, rendez-vous ou attribution à un commercial), elles passent dans « Suivi client », à son nom.</p>
      <div class="qs-top"><div class="qs-chips">${onglet('todo', 'À traiter', todo.length)}${onglet('msg', 'Messages', msgs.length)}${onglet('done', 'Déjà traitées', done.length)}</div></div>
      ${shown.length ? `<div class="table jp"><table><thead><tr><th>Reçue</th><th>Client</th><th>Événement</th><th>Date</th><th class="n">Invités</th><th>Sélection et message</th><th></th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`
        : `<div class="vide"><p>${voir === 'todo' ? (list.length ? 'Aucune demande en attente : elles sont toutes prises en charge. Leur suivi est dans « Suivi client ».' : 'Aucune demande de devis pour l’instant.') : 'Rien ici pour l’instant.'}</p></div>`}`);
  }
  demandes.after = id => {
    if (id) return demande.after(id);
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; }));
    $$('[data-voir]').forEach(b => b.addEventListener('click', () => { demandes.voir = b.dataset.voir; render(); }));
    $$('[data-mk]').forEach(b => b.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${b.dataset.mk}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; }));
    $$('[data-classer]').forEach(b => b.addEventListener('click', async () => { const d = await api(`${A}/demandes/${b.dataset.classer}`); await api(`${A}/demandes/${d.id}`, { method: 'PUT', body: { ...d, classee: true } }); toast('Demande classée : elle reste visible dans « Déjà traitées ».'); render(); }));
  };
  async function demande(id) {
    const d = await api(A + '/demandes/' + id);
    const dv = (await api(A + '/devis')).filter(x => x.demandeId === id);
    cache.demande = d;
    return page(`${esc(d.ref)} · ${esc(d.contact?.nom)}`, `<a class="btn ghost" href="#/demandes">← Demandes</a>${d.type !== 'contact' ? `<button class="btn" data-mkdevis>${dv.length ? 'Nouveau devis' : 'Créer le devis'}</button>` : ''}`, `
      <div class="cols">
        <section class="box"><h2>Client</h2><p><b>${esc(d.contact?.nom)}</b>${d.contact?.societe ? '<br>' + esc(d.contact.societe) : ''}<br><a href="mailto:${esc(d.contact?.email)}">${esc(d.contact?.email)}</a><br><a href="tel:${esc(d.contact?.tel)}">${esc(d.contact?.tel)}</a></p><p><a class="lnk" href="#/clients/${d.clientId}">Fiche client → (corriger le nom, la société, l’e-mail ou le téléphone)</a></p></section>
        <section class="box"><h2>Événement</h2><p><b>${esc(d.evenement?.type)}</b> · ${dateFr(d.evenement?.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<br>${d.evenement?.invites || '?'} invités · ${esc(d.evenement?.cp)} ${esc(d.evenement?.ville)}<br>${esc(d.evenement?.horaire)}${d.livraison ? `<br>Livraison estimée : ${d.livraison.km} km A/R · ${d.livraison.offerte ? 'offerte' : euros(d.livraison.cents)}` : ''}</p></section>
        <section class="box"><h2>Suivi</h2><label>Statut<select data-statut>${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}"${d.statut === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <ul class="histo">${(d.historique || []).map(h => `<li>${dateH(h.at)} · ${STATUTS[h.statut] || h.statut} <small>${esc(h.par || '')}</small></li>`).join('')}</ul></section>
      </div>
      ${d.message ? `<section class="box"><h2>Message du client</h2><p class="pre">${esc(d.message)}</p></section>` : ''}
      ${(d.lignes || []).length ? `<section class="box"><h2>Sélection du client</h2><div class="table"><table><thead><tr><th>Prestation</th><th>Choix</th><th class="n">Qté</th><th class="n">Estimé</th></tr></thead><tbody>${d.lignes.map(l => `<tr><td><b>${titreHtml(l.titre)}</b>${l.variante ? `<small>${esc(l.variante)}</small>` : ''}</td><td>${esc(l.resume)}${l.personnel ? `<small>+ personnel ${l.personnel.nb} × ${l.personnel.heures} h</small>` : ''}${l.pack ? `<small>+ pack ${esc(l.pack.id)}</small>` : ''}${l.note ? `<small>Note : ${esc(l.note)}</small>` : ''}</td><td class="n">${l.qte} ${esc(l.unite)}</td><td class="n">${l.surDevis ? 'sur devis' : euros(l.totalCents)}</td></tr>`).join('')}<tr class="tot"><td colspan="3">Total estimé (livraison comprise)</td><td class="n">${euros(d.totalEstimeCents)}</td></tr></tbody></table></div></section>` : ''}
      <section class="box"><h2>Devis liés</h2>${dv.length ? `<ul class="list">${dv.map(x => `<li><a href="#/devis/${x.id}"><b>${esc(x.numero)}</b></a><span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : '<p class="muted">Pas encore de devis : « Créer le devis » reprend toutes les lignes de la sélection, avec le personnel, les packs et la livraison.</p>'}</section>
      <section class="box"><h2>Notes internes</h2><textarea rows="3" data-notes placeholder="Visible seulement par l’équipe">${esc(d.notes || '')}</textarea><button class="btn ghost sm" data-savenotes>Enregistrer la note</button></section>`);
  }
  demande.after = id => {
    $('[data-statut]')?.addEventListener('change', async e => { await api(`${A}/demandes/${id}`, { method: 'PUT', body: { ...cache.demande, statut: e.target.value } }); toast('Statut mis à jour.'); render(); });
    $('[data-savenotes]')?.addEventListener('click', async () => { await api(`${A}/demandes/${id}`, { method: 'PUT', body: { ...cache.demande, notes: $('[data-notes]').value } }); toast('Note enregistrée.'); });
    $('[data-mkdevis]')?.addEventListener('click', async () => { const r = await api(`${A}/actions/devis-depuis-demande/${id}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; });
  };

  /* ---------- suivi client : une fiche par opportunité et sa frise (Demande → Devis envoyé → Relance → Accord client → Réservé / Refusé), comme Je Privatise ---------- */
  const H1 = 36e5;
  const OUVERT = ['demande', 'devis_envoye', 'relance'];
  function opportunite(d, devisL) {
    const dv = devisL.filter(x => x.demandeId === d.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const main = dv.find(x => x.statut === 'accepte') || dv.find(x => x.statut === 'envoye') || dv[0];
    const h = d.historique || [], at = st => (h.filter(x => x.statut === st).pop() || {}).at;
    const envoyeLe = main && main.statut !== 'brouillon' ? main.envoyeLe : at('devis_envoye');
    const relances = [...(main?.relances || []).map(r => ({ at: r.at, how: /sms/i.test(r.modele || '') ? 'SMS' : 'e-mail' })), ...(d.relancesNotees || [])]
      .filter(r => r.at).sort((x, y) => String(x.at).localeCompare(String(y.at)));
    const last = [d.createdAt, envoyeLe, ...relances.map(r => r.at), ...h.map(x => x.at)].filter(Boolean).map(String).sort().pop();
    const age = (Date.now() - Date.parse(last)) / H1;
    const late = OUVERT.includes(d.statut) && age >= 24 && age < 720 ? Math.floor(age) : 0;
    const montant = main ? tot(main).ttc : d.totalEstimeCents;
    const cat = d.statut === 'refuse' ? 'ko' : ['reserve', 'termine'].includes(d.statut) ? 'ok' : d.statut === 'accord' ? 'acc' : !envoyeLe ? 'draft' : late ? 'late' : 'sent';
    return { d, dv, main, envoyeLe, relances, late, last, montant, cat, at, estime: !main, com: String(d.commercial || main?.commercial?.nom || '').trim() };
  }
  async function suivi() {
    const [dem, devisL, eq, cl, fac, R] = await Promise.all([api(A + '/demandes'), api(A + '/devis'), api(A + '/actions/equipe').catch(() => []), api(A + '/clients?vue=actifs').catch(() => []), api(A + '/factures').catch(() => []), cache.R ? Promise.resolve(cache.R) : api(A + '/site').catch(() => ({}))]);
    cache.devisL = devisL; cache.equipe = eq.filter(u => !u.desactive); cache.R = cache.R || R;
    cache.opps = dem.filter(d => d.type !== 'contact' && !aTraiter(d, devisL)).map(d => opportunite(d, devisL));
    cache.annuaire = annuaire(cl, dem, devisL, fac);
    if (SV.o == null) { const m = mem.get('mg_commercial'); SV.o = m != null ? m : ''; }
    return page('Suivi client', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', `<p class="muted intro">Vos opportunités en cours, d’un coup d’œil. Une commande prise au téléphone ? Bouton « ✨ Devis avec l’IA » : tapez ou dictez tout en vrac, l’IA prépare la fiche client et le devis avec le catalogue.</p>
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
    const list = all.filter(o => inF(o, SV.f) && (!S || S.split(/\s+/).every(w => hay(o).includes(w))))
      .sort((x, y) => (y.late - x.late) || String(y.last).localeCompare(String(x.last)));
    const owners = commerciaux();
    const arch = SV.f === 'ok' || SV.f === 'ko';
    box.innerHTML = `<div class="qs-owners"><div class="qs-orow"><span class="qs-olab">Période</span>${[['all', 'Tout'], ['mois', 'Mois en cours'], ['mprec', 'Mois dernier'], ['trim', 'Trimestre'], ['an', 'Année'], ['dates', 'De date à date']].map(([k, l]) => `<button type="button" class="qs-own-b${SV.p === k ? ' on' : ''}" data-qp="${k}">${l}</button>`).join('')}${SV.p === 'dates' ? `<span class="qs-dates">du <input type="date" data-qd="d1" value="${esc(SV.d1)}"> au <input type="date" data-qd="d2" value="${esc(SV.d2)}"></span>` : ''}</div>
      <div class="qs-orow qs-who-row"><span class="qs-olab">Commercial</span><label class="qs-csel"><span aria-hidden="true">👤</span><select data-qcom aria-label="Choisir le commercial"><option value=""${!SV.o ? ' selected' : ''}>Tous les commerciaux</option>${owners.map(n => `<option value="${esc(n)}"${SV.o === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="—"${SV.o === '—' ? ' selected' : ''}>Non attribuées</option></select></label><button type="button" class="qs-own-b${!SV.o ? ' on' : ''}" data-qo="">Tous en même temps</button>
        <div class="qs-cname${SV.o ? ' perso' : ''}">${!SV.o ? 'Vous voyez <b>toutes les opportunités</b>, tous commerciaux confondus' : SV.o === '—' ? 'Vous voyez les opportunités <b>sans commercial</b>' : `Vous voyez les fiches de <b>${esc(SV.o)}</b>`}</div></div>
      <div class="qs-osum"><span><b>${base.length}</b> opportunité${base.length > 1 ? 's' : ''}</span><span><b>${signes.length}</b> signée${signes.length > 1 ? 's' : ''}</span><span><b>${perdus.length}</b> refusée${perdus.length > 1 ? 's' : ''}</span><em>${euros(sum(signes, o => o.montant))} signés</em></div></div>
      <div class="kpis qk">${kpis.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <div class="qs-top"><div class="qs-chips">${arch ? `<button type="button" class="qs-chip" data-qf="all">← Opportunités en cours <b>${cnt('all')}</b></button><span class="qs-title">${SV.f === 'ok' ? 'Opportunités réservées' : 'Opportunités refusées (classées)'}</span>`
        : [['all', 'En cours'], ['late', '⚠ À relancer'], ['sent', 'Envoyées'], ['acc', 'Attente d’acompte'], ['draft', 'Devis à envoyer']].map(([k, l]) => `<button type="button" class="qs-chip${SV.f === k ? ' on' : ''}${k === 'late' && cnt('late') ? ' hot' : ''}" data-qf="${k}">${esc(l)} <b>${cnt(k)}</b></button>`).join('')
          + `<span class="qs-sp"></span><button type="button" class="qs-arch ok" data-qf="ok">Voir les opportunités réservées <b>${cnt('ok')}</b></button><button type="button" class="qs-arch ko" data-qf="ko">Voir les opportunités refusées <b>${cnt('ko')}</b></button>`}</div>
        <input class="qs-search" type="search" data-qs placeholder="🔍 Rechercher : nom, société, n° de devis…" aria-label="Rechercher un client" value="${esc(SV.s)}"></div>
      <div id="qsList">${list.length ? list.map(carte).join('') : `<div class="vide"><p>${all.length ? 'Aucune opportunité ici.' : 'Aucune demande pour l’instant. Les demandes envoyées depuis le site et les devis créés ici apparaissent dans ce suivi.'}</p></div>`}</div>`;
  }
  const d1 = x => x ? new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const etape = (cls, label, sub, mark) => `<div class="qs-st ${cls}"><div class="qs-dot">${mark || ''}</div><b>${esc(label)}</b><i>${esc(sub || '—')}</i></div>`;
  const btnEtape = (o, k, html) => o.d.statut === 'refuse' ? html : `<button type="button" class="qs-stb" data-qstep="${k}" data-q="${o.d.id}" title="Cliquer pour mettre à jour">${html}</button>`;
  function frise(o) {
    const st = o.d.statut, decided = ['accord', 'reserve', 'termine', 'refuse'].includes(st), sent = !!o.envoyeLe;
    const out = [etape('done', 'Demande', d1(o.d.createdAt) + (o.d.source ? ' · ' + (/IA/.test(o.d.source) ? '✨ IA' : 'tél.') : o.d.lignes ? ' · site' : ''), '✓')];
    out.push(sent ? etape('done', 'Devis envoyé', d1(o.envoyeLe), '✓') : `<button type="button" class="qs-stb" data-qdevis="${o.d.id}" title="Préparer le devis">${etape('now', 'Devis à envoyer', o.main ? 'brouillon' : 'à préparer')}</button>`);
    const rel = o.relances[o.relances.length - 1];
    const relB = h => sent && !decided ? `<button type="button" class="qs-stb" data-qrel="${o.d.id}" title="Relancer le client">${h}</button>` : h;
    out.push(relB(o.late && sent ? etape('warn', 'À relancer', 'depuis ' + (o.late >= 48 ? Math.floor(o.late / 24) + ' jours' : o.late + ' h'), '!')
      : rel ? etape(decided ? 'done' : 'now', 'Relancé', d1(rel.at) + ' · ' + rel.how, decided ? '✓' : '')
      : etape(decided ? 'skip' : sent ? 'opt' : '', 'Relance', decided ? 'pas utile' : sent ? '+ relancer' : '—')));
    if (st === 'refuse') out.push(etape('lost', 'Refusé', 'classé · ' + d1(o.at('refuse')), '✕'));
    else {
      const acc = ['accord', 'reserve', 'termine'].includes(st), sig = o.main?.statut === 'accepte' && o.main.signature;
      out.push(btnEtape(o, 'accord', acc ? etape('done acc', 'Accord client', sig ? 'signé en ligne · ' + d1(o.main.signature.at) : d1(o.at('accord') || o.at('reserve')), '✓') : etape('opt', 'Accord client', '+ en attente d’acompte')));
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
  function carte(o) {
    const c = o.d.contact || {}, e = o.d.evenement || {}, tel = String(c.tel || '').replace(/[^\d+]/g, ''), first = (c.nom || '').split(' ')[0];
    const ini = (c.nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const ouvert = OUVERT.includes(o.d.statut) || o.d.statut === 'accord';
    const icons = `${tel ? `<a class="qs-ic" href="tel:${esc(tel)}" data-qappel="${o.d.id}" title="Appeler ${esc(c.tel)}" aria-label="Appeler">📞</a>` : ''}${o.envoyeLe && ouvert && c.email ? `<button class="qs-ic" type="button" data-qrel="${o.d.id}" data-canal="mail" title="Relancer par e-mail" aria-label="Relancer par e-mail">✉</button>` : ''}${o.envoyeLe && ouvert && tel ? `<button class="qs-ic" type="button" data-qrel="${o.d.id}" data-canal="sms" title="Relancer par SMS" aria-label="Relancer par SMS">💬</button>` : ''}`;
    return `<article class="qs-card${o.late ? ' late' : ''}${o.cat === 'ko' ? ' lost' : ''}" data-open="${o.d.id}">
      <div class="qs-who"><div class="qs-av">${esc(ini)}</div><div><div class="qs-nm">${esc(c.nom || '—')}${badge(o)}</div>
        <div class="qs-co">${esc([c.societe, c.tel || c.email].filter(Boolean).join(' · '))}</div>
        <div class="qs-co"><button type="button" class="qs-own-pick${o.com ? '' : ' none'}" data-qown="${o.d.id}" title="Attribuer ou changer le commercial">👤 ${esc(o.com || 'Non attribué')} <span aria-hidden="true">▾</span></button></div>
        <div class="qs-ev">${e.type ? '<b>' + esc(e.type) + '</b> · ' : ''}${esc([e.date ? dateFr(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date à définir', e.invites ? e.invites + ' pers.' : '', e.ville || ''].filter(Boolean).join(' · '))}</div></div></div>
      <div class="qs-right"><div class="qs-amt">${o.montant ? euros(o.montant) : '—'}</div><div class="qs-ht">TTC · ${o.main ? 'devis n° ' + esc(o.main.numero) : 'estimation du site'}</div></div>
      ${frise(o)}
      <div class="qs-foot"><div class="qs-info">${o.d.notes ? `<div class="qs-note">📝 ${esc(String(o.d.notes).slice(0, 140))}</div>` : ''}</div><div class="qs-acts">${o.late ? '' : icons}${['refuse', 'reserve', 'termine'].includes(o.d.statut) ? `<button class="qs-back" type="button" data-qback="${o.d.id}" title="Remettre dans les opportunités en cours">↺ Remettre en cours</button>` : ''}${o.main && o.main.statut !== 'brouillon' ? `<a class="qs-back" href="/devis/${esc(o.main.token)}" target="_blank" title="Le devis tel que le client le voit">📨 ${o.main.statut === 'accepte' ? 'Devis signé' : 'Devis envoyé'}</a>` : ''}${o.d.clientId ? `<a class="qs-back" href="#/clients/${esc(o.d.clientId)}" title="Tout ce qui s’est passé avec ce client">🕘 Historique</a>` : ''}<button class="qs-open" type="button" data-qopen="${o.d.id}">${o.cat === 'draft' ? 'Terminer' : 'Ouvrir'}</button></div></div>
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
    box.addEventListener('click', async e => {
      const t = e.target.closest('button,a'); const o = id => (cache.opps || []).find(x => x.d.id === id);
      if (t?.dataset.qp != null) { SV.p = t.dataset.qp; return suiviDessin(); }
      if (t?.dataset.qo != null) { SV.o = t.dataset.qo; mem.set('mg_commercial', SV.o); return suiviDessin(); }
      if (t?.dataset.qf) { SV.f = t.dataset.qf; return suiviDessin(); }
      if (t?.dataset.qappel) { majDemande(t.dataset.qappel, d => ({ ...d, relancesNotees: [...(d.relancesNotees || []), { at: new Date().toISOString(), how: 'appel', par: session.nom }] })); return; }
      if (t?.dataset.qfait) { e.stopPropagation(); return majDemande(t.dataset.qfait, d => ({ ...d, statut: d.statut === 'devis_envoye' ? 'relance' : d.statut, relancesNotees: [...(d.relancesNotees || []), { at: new Date().toISOString(), how: 'noté', par: session.nom }] }), 'Relance notée.'); }
      if (t?.dataset.qrel) {
        const x = o(t.dataset.qrel); if (!x?.main) return toast('Pas encore de devis envoyé à relancer.', true);
        const canal = t.dataset.canal || (x.d.contact?.email ? 'mail' : 'sms');
        const nom = canal === 'sms' ? 'SMS de relance' : (x.relances.length ? 'Relance à 7 jours' : 'Relance à 3 jours');
        if (!confirm(`Envoyer « ${nom} » à ${x.d.contact?.nom || 'ce client'} par ${canal === 'sms' ? 'SMS' : 'e-mail'} ?`)) return;
        try { await api(`${A}/actions/relancer/${x.main.id}`, { method: 'POST', body: { modele: canal === 'sms' ? 'sms-relance' : x.relances.length ? 'relance-j7' : 'relance-j3' } }); await majDemande(x.d.id, d => d, 'Relance envoyée.'); } catch (err) { toast(err.message, true); }
        return;
      }
      if (t?.dataset.qdevis) { const x = o(t.dataset.qdevis); if (x?.main) { location.hash = '#/devis/' + x.main.id; return; } const r = await api(`${A}/actions/devis-depuis-demande/${t.dataset.qdevis}`, { method: 'POST' }); location.hash = '#/devis/' + r.id; return; }
      if (t?.dataset.qstep) {
        const k = t.dataset.qstep, x = o(t.dataset.q), cur = x.d.statut;
        const next = k === cur ? (k === 'reserve' ? 'accord' : x.envoyeLe ? 'devis_envoye' : 'demande') : k;
        return majDemande(x.d.id, d => ({ ...d, statut: next }), 'Étape : ' + STATUTS[next]);
      }
      if (t?.dataset.qback) { const x = o(t.dataset.qback); return majDemande(x.d.id, d => ({ ...d, statut: x.envoyeLe ? 'devis_envoye' : 'demande' }), 'Remis dans les opportunités en cours.'); }
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


  /* ---------- commande avec l'IA (comme « ✨ Devis avec l'IA » de Je Privatise) :
     infos du client en vrac (texte ou dictée) → fiche client → prestations du catalogue → devis pré-rempli à vérifier ---------- */
  function micPour(btn, ta, msg, fin) {
    if (!btn || !ta) return; const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, base = '';
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
    const st = { step: 1, texte: '', f: null, art: [], km: '', villes: [] };
    const m = document.createElement('div'); m.className = 'modal aq-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    const tete = (h, sub) => `<div class="aq-h"><div><p class="aq-eye">✨ Devis avec l’IA</p><h2>${h}</h2>${sub ? `<p class="muted">${sub}</p>` : ''}</div><button type="button" class="x" data-aqx aria-label="Fermer">×</button></div>
      <ol class="aq-steps">${['Infos du client', 'Fiche client', 'Commande'].map((t, i) => `<li class="${st.step === i + 1 ? 'on' : st.step > i + 1 ? 'done' : ''}">${st.step > i + 1 ? '✓' : i + 1} ${t}</li>`).join('')}</ol>`;
    const opt = (list, cur, first) => `<option value="">${first}</option>${list.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}`;
    const kmAR = (lat, lon) => { const r = x => x * Math.PI / 180, d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(r(lat - O.lat) / 2) ** 2 + Math.cos(r(O.lat)) * Math.cos(r(lat)) * Math.sin(r(lon - O.lon) / 2) ** 2)); return Math.max(10, Math.round(d * 1.3 * 2)); };
    const visibles = prods.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre));
    const totaux = () => {
      const presta = st.art.filter(a => a.on).reduce((t, a) => t + (a.prixCents || 0) * a.qte, 0);
      const f = st.f || {}, pers = f.serveurs ? (T.personnel?.heureCents || 4188) * f.serveurs * Math.max(T.personnel?.minHeures || 4, +f.heures || 0) : 0;
      const pk = (T.packs || []).find(x => x.id === f.vaisselle), pack = pk ? pk.prixCents * (+f.invites || 0) : 0;
      const seuil = T.livraisonOfferteCents ?? 70000, km = +st.km || 0, offerte = km && seuil > 0 && presta >= seuil, liv = km && !offerte ? km * (T.kmCents || 100) : 0;
      return { presta, pers, pack, liv, offerte, total: presta + pers + pack + liv };
    };
    const draw = () => {
      if (st.step === 1) m.innerHTML = `<div class="modal-in aq-in">${tete('Décrivez la commande du client', 'Tapez ou dictez tout en vrac : nom, téléphone, e-mail, date, nombre d’invités, ville de livraison, ce qu’il veut manger, le personnel… L’IA prépare la fiche client et la commande avec le catalogue Magnolia (prix TTC, minimums). Rien n’est envoyé au client.')}
        ${conf.actif ? '' : '<p class="aq-warn">L’IA n’est pas encore activée sur le site : il faut ajouter la clé <b>ANTHROPIC_API_KEY</b> dans les variables Railway. En attendant, vous pouvez créer le devis à la main (« + Nouveau devis »).</p>'}
        <div class="aq-nrow"><textarea id="aqTexte" rows="7" placeholder="ex. Sophie Durand, 06 12 34 56 78, sophie.durand@gmail.com, anniversaire de ses 40 ans le 14 mars, 40 personnes à Massy 91300, livraison 19 h, buffet antillais avec accras et colombo de poulet, 2 serveurs 5 h, vaisselle en dur">${esc(st.texte)}</textarea><button type="button" class="aq-mic" id="aqMic" title="Dicter" aria-label="Dicter">🎤</button></div><p class="aq-nmsg" id="aqNMsg"></p>
        <div class="aq-f"><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn ghost" data-aqx>Annuler</button><button type="button" class="btn" id="aqGo"${conf.actif ? '' : ' disabled'}>✨ Préparer la fiche client</button></div></div>`;
      else if (st.step === 2) { const f = st.f;
        m.innerHTML = `<div class="modal-in aq-in">${tete('Vérifiez la fiche client', 'L’IA a rempli ce qu’elle a compris. Corrigez si besoin, puis composez la commande.')}
        <form id="aqForm" class="aq-g" autocomplete="off">
          <label>Prénom<input name="prenom" value="${esc(f.prenom)}" data-prenom></label><label>NOM<input name="nom" value="${esc(f.nom)}" data-nomfam></label>
          <label>Téléphone<input name="tel" type="tel" value="${esc(f.tel)}"></label><label>E-mail<input name="email" type="email" value="${esc(f.email)}"></label>
          <label>Société<input name="societe" value="${esc(f.societe)}"></label><label>Événement<select name="type">${opt(conf.evenements || [], f.type, 'Choisir')}</select></label>
          <label>Date<input name="date" type="date" value="${esc(f.date)}"></label><label>Heure de livraison<input name="horaire" value="${esc(f.horaire)}" placeholder="ex. 19 h"></label>
          <label>Invités<input name="invites" type="number" min="1" inputmode="numeric" value="${esc(f.invites)}"></label><label>Budget TTC (€)<input name="budget" type="number" min="0" inputmode="numeric" value="${esc(f.budget)}"></label>
          <label>Code postal de livraison<input name="cp" inputmode="numeric" maxlength="5" value="${esc(f.cp)}"></label><label>Ville<select name="ville">${st.villes.length ? st.villes.map(v => `<option${v.nom === f.ville ? ' selected' : ''}>${esc(v.nom)}</option>`).join('') : `<option>${esc(f.ville || 'D’abord le code postal')}</option>`}</select></label>
          <label class="aq-wide">Adresse de livraison<input name="adresse" value="${esc(f.adresse)}"></label>
          <label>Livraison (km aller-retour)<input name="km" type="number" min="0" inputmode="numeric" value="${esc(st.km)}"><small class="muted" id="aqKm">${st.km ? `${euros(st.km * (T.kmCents || 100))} TTC, offerte dès ${euros(T.livraisonOfferteCents ?? 70000)} TTC` : 'Calculé avec le code postal'}</small></label>
          <label>Vaisselle<select name="vaisselle">${opt((T.packs || []).map(p => [p.id, `${p.label} (${euros(p.prixCents)} TTC/pers.)`]), f.vaisselle, 'Pas de pack vaisselle')}</select></label>
          <label>Serveurs<input name="serveurs" type="number" min="0" inputmode="numeric" value="${esc(f.serveurs)}"></label><label>Heures de service<input name="heures" type="number" min="0" inputmode="numeric" value="${esc(f.heures)}"><small class="muted">${euros(T.personnel?.heureCents || 4188)} TTC/h, ${T.personnel?.minHeures || 4} h minimum</small></label>
          <label class="aq-wide">Notes pour le devis<textarea name="notes" rows="3">${esc(f.notes)}</textarea></label>
        </form>
        <div class="aq-f"><button type="button" class="btn ghost" data-aqback="1">← Modifier le texte</button><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn" id="aqProd">✨ Composer la commande</button></div></div>`;
        const cp = m.querySelector('[name=cp]'), vi = m.querySelector('[name=ville]'), km = m.querySelector('[name=km]');
        const majKm = () => { const v = st.villes.find(x => x.nom === vi.value); if (v) { st.km = kmAR(v.lat, v.lon); km.value = st.km; m.querySelector('#aqKm').textContent = `${euros(st.km * (T.kmCents || 100))} TTC, offerte dès ${euros(T.livraisonOfferteCents ?? 70000)} TTC`; } };
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
          <div class="aq-as">${st.art.map(ligne).join('') || '<p class="muted">L’IA n’a rien trouvé dans le catalogue : ajoutez les prestations ci-dessous.</p>'}</div>
          <select class="aq-add" data-aqadd><option value="">+ Ajouter une prestation du catalogue…</option>${visibles.map(p => `<option value="${esc(p.slug)}">${esc(titreTexte(p.titre))} · ${p.prixCents == null ? 'prix à confirmer' : euros(p.prixCents)}</option>`).join('')}</select>
          <dl class="aq-tot"><dt>Prestations</dt><dd>${euros(t.presta)}</dd>${t.pers ? `<dt>Personnel (${st.f.serveurs} × ${Math.max(T.personnel?.minHeures || 4, +st.f.heures || 0)} h)</dt><dd>${euros(t.pers)}</dd>` : ''}${t.pack ? `<dt>Pack vaisselle</dt><dd>${euros(t.pack)}</dd>` : ''}${st.km ? `<dt>Livraison (${st.km} km A/R)</dt><dd>${t.offerte ? 'offerte' : euros(t.liv)}</dd>` : ''}<dt class="g">Total estimé TTC</dt><dd class="g">${euros(t.total)}</dd></dl>
          <div class="aq-f"><button type="button" class="btn ghost" data-aqback="2">← Modifier la fiche</button><span class="aq-msg" id="aqMsg"></span><span class="aq-sp"></span><button type="button" class="btn" id="aqMake"${st.art.some(a => a.on) ? '' : ' disabled'}>Préparer le devis</button></div></div>`;
      }
      if (st.step === 1) { const ta = m.querySelector('#aqTexte'); ta.oninput = () => { st.texte = ta.value; }; micPour(m.querySelector('#aqMic'), ta, m.querySelector('#aqNMsg'), () => { st.texte = ta.value; }); }
    };
    const lireForm = () => { const f = new FormData(m.querySelector('#aqForm')), g = k => String(f.get(k) ?? '').trim(); st.f = { prenom: g('prenom'), nom: g('nom'), tel: g('tel'), email: g('email'), societe: g('societe'), type: g('type'), date: g('date'), horaire: g('horaire'), invites: +g('invites') || '', budget: +g('budget') || '', cp: g('cp'), ville: st.villes.length ? g('ville') : st.f.ville, adresse: g('adresse'), vaisselle: g('vaisselle'), serveurs: +g('serveurs') || '', heures: +g('heures') || '', notes: g('notes') }; st.km = +g('km') || ''; };
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
        try { st.art = (await api(A + '/ia/produits', { method: 'POST', body: { fiche: st.f, texte: st.texte } })).articles.map(a => ({ ...a, on: true })); st.step = 3; draw(); }
        catch (err) { occupe('#aqProd', false, `<span class="err">${esc(err.message)}</span>`); }
        return;
      }
      if (e.target.closest('#aqMake')) {
        occupe('#aqMake', true, '<span class="muted">Création du devis…</span>');
        try {
          const r = await api(A + '/actions/commande-ia', { method: 'POST', body: { fiche: st.f, km: st.km, texte: st.texte, articles: st.art.filter(a => a.on).map(a => ({ slug: a.slug, qte: a.qte, note: a.note })) } });
          m.remove(); toast('✨ Devis préparé avec l’IA : vérifiez les lignes et le message, enregistrez, puis envoyez.'); location.hash = '#/devis/' + r.devisId;
        } catch (err) { occupe('#aqMake', false, `<span class="err">${esc(err.message)}</span>`); }
      }
    });
    draw(); document.body.append(m); m.querySelector('#aqTexte')?.focus();
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-aiq]')) commandeIa(); });

  /* ---------- devis ---------- */
  async function devis(id) {
    if (id === 'nouveau') { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: {} }); location.replace('#/devis/' + r.id); return ''; }
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
    return page('Devis', '<button type="button" class="btn ghost aq-btn" data-aiq>✨ Devis avec l’IA</button><a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', list.length ? `${filtre}<div class="row sel-bar">${peut('effacerDevis') ? '<button type="button" class="btn danger sm" data-effacer disabled>🗑 Effacer</button>' : ''}<span class="muted sm" data-nbsel>Cochez les devis à effacer.</span></div><div class="table"><table><thead><tr><th class="ck"><input type="checkbox" data-tout aria-label="Tout cocher" title="Tout cocher"></th><th>N°</th><th>Client</th><th>Nature de l’événement</th><th>Date</th><th class="n">Personnes</th><th>Commercial</th><th class="n">Total TTC</th><th>Statut</th><th>Vu par le client</th></tr></thead><tbody>
      ${list.map(d => `<tr data-href="#/devis/${d.id}"><td class="ck">${effacable(d) ? `<input type="checkbox" data-sel="${esc(d.id)}" data-num="${esc(d.numero)}" data-st="${esc(d.statut)}" aria-label="Sélectionner ${esc(d.numero)}">` : '<span title="Devis signé : ne peut pas être effacé">🔒</span>'}</td><td class="nw"><b>${esc(d.numero)}</b>${(d.commentaires || []).length ? ` <span title="${d.commentaires.length} commentaire(s) du client">💬</span>` : ''}</td><td>${esc(d.clientNom)}</td><td>${esc(d.evenement?.type || '—')}</td><td class="nw">${d.evenement?.date ? dateFr(d.evenement.date) : '—'}</td><td class="n nw">${d.evenement?.invites ? esc(d.evenement.invites) + ' pers.' : '—'}</td><td>${esc(comDe(d) || '—')}</td><td class="n">${euros(tot(d).ttc)}</td><td><span class="pill d-${d.statut}">${DSTAT[d.statut]}</span></td><td>${d.vuLe ? dateH(d.vuLe) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vide"><p>Aucun devis.</p><p class="muted">Créez un devis depuis une demande (les lignes sont reprises) ou partez d’un devis vierge.</p></div>');
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

  function tot(d) {
    const L = (d.lignes || []).filter(l => l.type !== 'titre');
    const brut = L.reduce((s, l) => s + Math.round((l.puCents || 0) * (+l.qte || 0)), 0);
    const remise = Math.min(brut, d.remiseCents || 0);
    const cout = L.reduce((s, l) => s + Math.round((l.coutCents || 0) * (+l.qte || 0)), 0);
    const ratio = brut ? (brut - remise) / brut : 1;
    let ht = 0; const tva = {};
    for (const l of L) { const t = Math.round((l.puCents || 0) * (+l.qte || 0) * ratio); const h = Math.round(t / (1 + (l.tva ?? 10) / 100)); ht += h; tva[l.tva ?? 10] = (tva[l.tva ?? 10] || 0) + t - h; }
    return { brut, remise, ttc: brut - remise, ht, tva, cout, marge: brut - remise - cout, coutConnu: L.some(l => l.coutCents) };
  }

  /* même règle que le serveur (server/devis.js) : totalité sous 800 € TTC, 50 % au-dessus, sauf pourcentage forcé */
  function regleAcompte(ttc, d, T = {}) {
    const seuil = T.seuilAcompteCents ?? 80000, delai = T.delaiDeuxFoisJours ?? 10, force = d.acomptePct != null && d.acomptePct !== '';
    const ref = d.signature?.at ? new Date(d.signature.at) : new Date(), ev = d.evenement?.date ? new Date(d.evenement.date + 'T12:00:00') : null;
    const proche = !!ev && !Number.isNaN(+ev) && (ev - ref) / 86400e3 < delai;
    const raison = force ? '' : ttc < seuil ? 'seuil' : proche ? 'proche' : '';
    const pct = force ? +d.acomptePct : raison ? 100 : (T.acomptePct ?? 50);
    return { pct, auto: !force, seuil, delai, raison, cents: Math.round(ttc * pct / 100), total: pct >= 100 };
  }

  async function devisEdit(id) {
    const [d, clientsL, cat] = await Promise.all([api(A + '/devis/' + id), api(A + '/clients?vue=actifs'), cache.produits ? cache.produits : api(A + '/produits')]);
    if (d.clientId && !clientsL.some(c => c.id === d.clientId)) clientsL.push(...await api(A + '/clients?ids=' + encodeURIComponent(d.clientId)).catch(() => []));
    cache.produits = cat; cache.devis = d; cache.clients = clientsL;
    const [modeles, R0, tous, facsL] = await Promise.all([api(A + '/modeles'), cache.R ? cache.R : api(A + '/site'), api(A + '/devis'), api(A + '/actions/factures').catch(() => [])]);
    cache.R = R0; cache.tousDevis = tous;
    const facsDv = facsL.filter(x => x.devisId === d.id);
    const signe = d.statut === 'accepte';
    const lock = signe && !peut('devisSignes');
    return page(`Devis ${esc(d.numero)} <span class="pill d-${d.statut}">${DSTAT[d.statut]}</span>`, `<a class="btn ghost" href="#/devis">← Devis</a><button class="btn ghost" type="button" data-dup>⧉ Dupliquer ce devis</button>${d.clientId ? `<button class="btn ghost" type="button" data-newcl>+ Nouveau devis pour ce client</button>` : ''}${d.statut !== 'brouillon' ? `<a class="btn ghost" href="/devis/${d.token}" target="_blank">Voir comme le client ↗</a>` : ''}`, `
      ${d.iaDraft && d.statut === 'brouillon' ? '<p class="aq-info">✨ Devis préparé avec l’IA à partir de la commande du client : vérifiez les lignes, les quantités et le texte, enregistrez, puis envoyez-le.</p>' : ''}
      ${(d.commentaires || []).length ? `<section class="box dv-coms"><h2>💬 Commentaires du client <small class="muted">(${d.commentaires.length})</small></h2><p class="muted sm">Laissés sur la page du devis : le commercial les reçoit par e-mail et SMS.</p><ul>${d.commentaires.slice().reverse().map(m => `<li><p>${esc(m.texte).replace(/\n/g, '<br>')}</p><small>${esc(m.nom || 'Client')} · ${dateH(m.at)}</small></li>`).join('')}</ul></section>` : ''}
      ${signe ? `<p class="okbox">✓ Signé en ligne par <b>${esc(d.signature?.nom)}</b> le ${dateH(d.signature?.at)}.${lock ? ' Il faut le droit « Modifier un devis signé » pour le changer.' : ''}</p>` : ''}
      <form id="dv" class="${lock ? 'lock' : ''}">
      <div class="cols">
        <section class="box"><h2>Client</h2><label class="dv-clq">Chercher dans tous les clients <small>(dont le fichier importé)</small><input type="search" data-dvclq placeholder="🔍 Nom, téléphone, e-mail, ville…" autocomplete="off"></label><label>Client<select name="clientId"><option value="">— Choisir —</option>${clientsL.sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map(c => `<option value="${c.id}"${c.id === d.clientId ? ' selected' : ''}>${esc(c.nom)} · ${esc(c.email)}</option>`).join('')}</select></label><p class="muted sm"><a href="#/clients/nouveau">+ Nouveau client</a>${d.clientId ? ` · <a href="#/clients/${esc(d.clientId)}">Fiche client</a>` : ''}</p>${(() => { const autres = (cache.tousDevis || []).filter(x => x.clientId && x.clientId === d.clientId && x.id !== d.id); return autres.length ? `<p class="sm"><b>Autres devis de ce client</b></p><ul class="histo">${autres.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => `<li><a href="#/devis/${x.id}">${esc(x.numero)}</a> · ${euros(tot(x).ttc)} <span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : ''; })()}${d.copieDe ? `<p class="muted sm">Copie du devis ${esc(d.copieDe)}.</p>` : ''}</section>
        <section class="box"><h2>Événement</h2><div class="g2"><label>Nature de l’événement<input name="ev_type" list="dv-natures" value="${esc(d.evenement?.type || '')}" placeholder="Choisissez ou écrivez" maxlength="80"><datalist id="dv-natures">${[...new Set([...(R0.evenements || []), 'Anniversaire', 'Mariage', 'Baptême', 'Communion', 'Fête de famille', 'Séminaire', 'Soirée d’entreprise', 'Cocktail', 'Repas de fin d’année', 'Pot de départ', 'Inauguration', 'Funérailles'])].map(e => `<option value="${esc(e)}">`).join('')}</datalist></label><label>Date<input type="date" name="ev_date" value="${esc(d.evenement?.date || '')}"></label><label>Nombre de personnes<input type="number" name="ev_invites" value="${esc(d.evenement?.invites || '')}"></label><label>Lieu<input name="ev_lieu" value="${esc(d.evenement?.lieu || '')}"></label></div></section>
        <section class="box"><h2>Conditions</h2><div class="g2"><label>Valable jusqu’au<input type="date" name="validiteJusquau" value="${esc(d.validiteJusquau || '')}"></label><label>Acompte<select name="acomptePct"><option value="">Automatique</option>${[0, 20, 30, 40, 50, 100].map(p => `<option value="${p}"${d.acomptePct != null && d.acomptePct !== '' && +d.acomptePct === p ? ' selected' : ''}>${p} % (forcé)</option>`).join('')}</select></label></div><p class="muted sm">Automatique : totalité à la signature sous ${euros(R0.tarifs?.seuilAcompteCents ?? 80000)} TTC ou si l’événement a lieu dans moins de ${R0.tarifs?.delaiDeuxFoisJours ?? 10} jours ; sinon acompte de ${R0.tarifs?.acomptePct ?? 50} %.</p>
          ${(() => { const P = (R0.alertes?.personnes || []).filter(x => x.nom); const cur = d.commercial?.nom || (P.find(x => x.email && x.email === session.email) || P[0] || {}).nom || ''; const L = [...P]; if (d.commercial?.nom && !P.some(x => x.nom === d.commercial.nom)) L.unshift(d.commercial); return `<label>Commercial (nom et téléphone sur le devis)<select name="commercial"><option value="">— Aucun —</option>${L.map(x => `<option value="${esc(x.nom)}"${x.nom === cur ? ' selected' : ''}>${esc(x.nom)}${x.tel ? ' · ' + esc(x.tel) : ''}</option>`).join('')}</select></label><p class="muted sm">La liste vient de <a href="#/equipe">Équipe &amp; activité</a> › Alertes de l’équipe (nom, portable, e-mail).</p>`; })()}
          <label>Lien de paiement de l’acompte <small>(SumUp, Stripe, banque…)</small><input name="lienPaiement" value="${esc(d.lienPaiement || '')}" placeholder="https://"></label></section>
      </div>
      <section class="box"><label>Nom de la proposition <small>(facultatif, ex. « Formule buffet antillais » : affiché dans l’e-mail quand vous envoyez plusieurs devis)</small><input name="titre" value="${esc(d.titre || '')}" maxlength="120"></label><label>Texte d’introduction<textarea name="intro" rows="2">${esc(d.intro || '')}</textarea></label></section>
      ${lock ? '' : `<section class="box ia-modif"><h2>✨ Demander à l’IA de modifier ce devis</h2><p class="muted sm">Écrivez ou dictez ce qu’il faut changer, par exemple : « Supprime le DJ et mets une contorsionniste à la place », « passe à 80 invités », « ajoute 2 serveurs pendant 5 h ». L’IA vous montre les changements avant de les appliquer. Vous pouvez toujours modifier les lignes vous-même.</p>
        <textarea id="iam-t" rows="2" placeholder="Ex. : supprime le DJ et mets une contorsionniste à la place"></textarea><div class="row"><button type="button" class="btn aq-btn" data-iam>✨ Proposer la modification</button><button type="button" class="btn ghost sm" data-iam-mic>🎤 Dicter</button><span id="iam-msg" class="muted sm"></span></div><div id="iam-res"></div></section>`}
      <section class="box"><div class="bh"><h2>Lignes du devis</h2><div class="row"><select data-addprod class="wide"><option value="">+ Ajouter une prestation du catalogue…</option>${cat.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre)).map(p => `<option value="${esc(p.slug)}">${esc(titreTexte(p.titre))} · ${p.prixCents == null ? 'sur devis' : euros(p.prixCents)}</option>`).join('')}</select><button type="button" class="btn ghost sm" data-addline>+ Ligne libre</button><button type="button" class="btn ghost sm" data-addtitle>+ Titre</button></div></div>
        <div class="table"><table class="lines"><thead><tr><th></th><th>Désignation</th><th class="n">Qté</th><th>Unité</th><th class="n">PU TTC</th><th class="n">Coût TTC</th><th>TVA</th><th class="n">Total TTC</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
        <div class="totbox"><div class="g2"><label>Remise TTC (€)<input name="remise" value="${fromCents(d.remiseCents || 0)}" inputmode="decimal"></label></div><dl id="totaux"></dl></div></section>
      <section class="box"><label>Conditions particulières<textarea name="conditions" rows="2">${esc(d.conditions || '')}</textarea></label></section>
      <div class="actions sticky"><button class="btn" type="submit">Enregistrer</button><button class="btn ghost" type="button" data-voir>👁 Voir le devis</button><span class="muted" id="dirty"></span></div>
      </form>
      <div class="cols">
        <section class="box"><h2>Envoyer au client</h2><label>Message (facultatif)<textarea rows="3" id="msg" placeholder="Bonjour, voici votre devis…"></textarea></label><div class="row"><label class="chk"><input type="checkbox" id="c-mail" checked> E-mail</label><label class="chk"><input type="checkbox" id="c-sms"> SMS</label></div>${(() => { const autres = (cache.tousDevis || []).filter(x => x.clientId && x.clientId === d.clientId && x.id !== d.id && x.statut !== 'refuse');
            if (!autres.length) return '';
            const L = [d, ...autres].sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
            return `<div class="grp"><p class="sm"><b>Devis de ce client à envoyer ensemble</b> <small class="muted">(un seul e-mail, chaque devis se signe séparément)</small></p>${L.map(x => `<label class="chk grp-l"><input type="checkbox" data-grp="${esc(x.id)}" ${x.id === d.id || x.statut === 'brouillon' ? 'checked' : ''}> <span><b>${esc(x.numero)}</b>${x.titre ? ' · ' + esc(x.titre) : ''} · ${euros(tot(x).ttc)} <span class="pill d-${x.statut}">${DSTAT[x.statut]}</span>${x.id === d.id ? ' <small class="muted">(celui-ci)</small>' : ''}</span></label>`).join('')}</div>`; })()}
          <div class="row"><button class="btn" type="button" data-sendgrp hidden></button><button class="btn" data-send>${d.statut === 'brouillon' ? 'Envoyer le devis' : 'Renvoyer le devis'}</button><button class="btn ghost" type="button" data-apmail>✉️ Aperçu de l’e-mail</button><button class="btn ghost" type="button" data-voir>👁 Voir le devis</button></div>
          ${(d.envois || []).length ? `<ul class="histo">${d.envois.map(e => `<li>${dateH(e.at)} · ${e.canaux.join(' + ')} <small>${esc(e.par)}</small></li>`).join('')}</ul>` : ''}</section>
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
    const body = $('#lines');
    const draw = () => {
      body.innerHTML = lignes.map((l, i) => l.type === 'titre'
        ? `<tr class="t" data-i="${i}"><td class="h">⋮⋮</td><td colspan="7"><input data-f="designation" value="${esc(l.designation)}" placeholder="Titre de section"></td><td><button type="button" class="x" data-del>×</button></td></tr>`
        : `<tr data-i="${i}" class="${l.coutCents && l.puCents < l.coutCents ? 'neg' : ''}"><td class="h" title="Déplacer">⋮⋮</td><td><input data-f="designation" value="${esc(l.designation)}"><input data-f="detail" class="sub" value="${esc(l.detail || '')}" placeholder="Détail (facultatif)"></td>
           <td><input data-f="qte" class="num" value="${esc(l.qte)}" inputmode="decimal"></td><td><select data-f="unite">${[...new Set([l.unite, ...UNITES])].map(u => `<option${u === l.unite ? ' selected' : ''}>${esc(u || '')}</option>`).join('')}</select></td>
           <td><input data-f="puCents" class="num" value="${fromCents(l.puCents)}" inputmode="decimal"></td><td><input data-f="coutCents" class="num" value="${fromCents(l.coutCents)}" inputmode="decimal" placeholder="—"></td>
           <td><select data-f="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+l.tva === t ? ' selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></td><td class="n">${euros(Math.round((l.puCents || 0) * (+l.qte || 0)))}</td><td><button type="button" class="x" data-del aria-label="Supprimer">×</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Aucune ligne : ajoutez une prestation du catalogue ou une ligne libre.</td></tr>';
      const t = tot({ lignes, remiseCents: toCents(form.remise.value) || 0 });
      $('#totaux').innerHTML = `${t.remise ? `<div><dt>Sous-total</dt><dd>${euros(t.brut)}</dd></div><div><dt>Remise</dt><dd>− ${euros(t.remise)}</dd></div>` : ''}${Object.entries(t.tva).map(([k, v]) => `<div class="sm"><dt>dont TVA ${String(k).replace('.', ',')} %</dt><dd>${euros(v)}</dd></div>`).join('')}<div class="sm"><dt>Total HT</dt><dd>${euros(t.ht)}</dd></div><div class="big"><dt>Total TTC</dt><dd>${euros(t.ttc)}</dd></div>${t.coutConnu ? `<div class="${t.marge < 0 ? 'neg' : 'pos'}"><dt>Marge</dt><dd>${euros(t.marge)} ${t.ttc ? '(' + Math.round(100 * t.marge / t.ttc) + ' %)' : ''}</dd></div>` : ''}${(() => { const a = regleAcompte(t.ttc, { acomptePct: form.acomptePct.value, evenement: { date: form.ev_date.value }, signature: d.signature }, cache.R?.tarifs); return `<div class="sm"><dt>${a.total ? `À payer à la signature (totalité${a.raison === 'proche' ? ', événement dans moins de ' + a.delai + ' jours' : ''})` : `Acompte ${a.pct} %`}</dt><dd>${euros(a.cents)}</dd></div>`; })()}`;
    };
    draw();
    const dirty = () => { $('#dirty').textContent = 'Modifications non enregistrées'; };
    body.addEventListener('input', e => {
      const tr = e.target.closest('[data-i]'); const l = lignes[+tr.dataset.i]; const f = e.target.dataset.f;
      if (!f) return;
      l[f] = ['puCents', 'coutCents'].includes(f) ? toCents(e.target.value) : f === 'tva' ? +e.target.value : f === 'qte' ? parseFloat(String(e.target.value).replace(',', '.')) || 0 : e.target.value;
      const cell = tr.children[7]; if (cell && l.type !== 'titre') cell.textContent = euros(Math.round((l.puCents || 0) * (+l.qte || 0)));
      tr.classList.toggle('neg', !!(l.coutCents && l.puCents < l.coutCents));
      const t = tot({ lignes, remiseCents: toCents(form.remise.value) || 0 }); draw.totOnly ? 0 : 0; $('#totaux').innerHTML = ''; draw(); dirty();
      const again = $(`[data-i="${tr.dataset.i}"] [data-f="${f}"]`); if (again && again.tagName === 'INPUT') { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      void t;
    });
    body.addEventListener('change', e => { if (e.target.tagName === 'SELECT') body.dispatchEvent(new Event('input', { bubbles: true })) ; });
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
    form.acomptePct.addEventListener('change', draw);
    form.ev_date.addEventListener('change', draw);
    $('[data-addline]').addEventListener('click', () => { lignes.push({ designation: 'Nouvelle ligne', qte: 1, unite: 'forfait', puCents: 0, coutCents: null, tva: 10 }); draw(); dirty(); });
    $('[data-addtitle]').addEventListener('click', () => { lignes.push({ type: 'titre', designation: 'Section' }); draw(); dirty(); });
    $('[data-addprod]').addEventListener('change', e => {
      const p = cache.produits.find(x => x.slug === e.target.value); if (!p) return;
      lignes.push({ designation: avecPortion(p.titre), detail: '', qte: p.min || 1, unite: p.unite || 'unité', puCents: p.prixCents || 0, coutCents: p.coutCents ?? null, tva: p.tva ?? 10, produit: p.slug });
      e.target.value = ''; draw(); dirty();
    });
    form.addEventListener('input', e => { if (!e.target.closest('#lines, .ia-modif')) dirty(); });
    /* « Demander à l'IA de modifier ce devis » : proposition → changements affichés → Appliquer ou Annuler */
    const iamT = $('#iam-t'), iamMsg = $('#iam-msg'), iamRes = $('#iam-res');
    if (iamT) {
      micPour($('[data-iam-mic]'), iamT, iamMsg);
      const proposer = async () => {
        const consigne = iamT.value.trim(); if (consigne.length < 3) { iamMsg.innerHTML = '<span class="err">Écrivez d’abord ce que l’IA doit changer.</span>'; return; }
        const b = $('[data-iam]'); b.disabled = true; iamMsg.textContent = 'L’IA prépare la modification… (quelques secondes)'; iamRes.innerHTML = '';
        try {
          const r = await api(A + '/ia/modifier-devis', { method: 'POST', body: { consigne, lignes, remiseCents: toCents(form.remise.value) || 0, evenement: { type: form.ev_type.value, date: form.ev_date.value, invites: +form.ev_invites.value || null, lieu: form.ev_lieu.value } } });
          iamMsg.textContent = '';
          const avant = tot({ lignes, remiseCents: toCents(form.remise.value) || 0 }).ttc, apres = tot({ lignes: r.lignes, remiseCents: r.remiseCents }).ttc;
          const ico = { ajoute: '＋', retire: '−', modifie: '✎' };
          iamRes.innerHTML = `<div class="iam-prop">${r.explication ? `<p><b>${esc(r.explication)}</b></p>` : ''}${r.changements.length ? `<ul class="iam-ch">${r.changements.map(x => `<li class="c-${x.type}"><span>${ico[x.type]}</span>${esc(x.texte)}</li>`).join('')}</ul><p>Total TTC : ${euros(avant)} → <b>${euros(apres)}</b></p><div class="row"><button type="button" class="btn" data-iam-ok>✓ Appliquer</button><button type="button" class="btn ghost" data-iam-no>Annuler</button></div>` : '<p class="muted">Aucun changement proposé. Reformulez votre demande.</p>'}</div>`;
          $('[data-iam-ok]')?.addEventListener('click', () => {
            lignes = r.lignes; form.remise.value = fromCents(r.remiseCents || 0);
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
      const next = { ...d, clientId: f.clientId || null, clientNom: cl?.nom || '', evenement: { type: f.ev_type, date: f.ev_date, invites: +f.ev_invites || null, lieu: f.ev_lieu }, validiteJusquau: f.validiteJusquau, titre: String(f.titre || '').trim(), acomptePct: f.acomptePct === '' ? null : +f.acomptePct, commercial: (() => { const x = [...(cache.R?.alertes?.personnes || []), d.commercial || {}].find(p => p.nom && p.nom === f.commercial); return x ? { nom: x.nom, tel: x.tel || '', email: x.email || '' } : null; })(), lienPaiement: f.lienPaiement, intro: f.intro, conditions: f.conditions, remiseCents: toCents(f.remise) || 0, lignes };
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
  const CL = { q: '', page: 1, filtre: '', k: {}, sel: new Set() };
  /* recherche multicritère de la liste Clients (demande de Jean-Luc, 2026-11-24) */
  const urlClients = () => `${A}/clients?par=50&page=${CL.page}&filtre=${CL.filtre}&q=${encodeURIComponent(CL.q)}${Object.entries(CL.k).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')}`;
  const compteClients = n => `<b>${Number(n).toLocaleString('fr-FR')}</b> contact${n > 1 ? 's' : ''}`;
  function filtresClients(F, total) {
    const n = x => Number(x).toLocaleString('fr-FR');
    const sel = (k, lab, opts) => `<label class="cl-crit"><span>${lab}</span><select data-ck="${k}"${CL.k[k] ? ' class="on"' : ''}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(CL.k[k] || '') === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
    const liste = (l, tous) => [['', tous], ...l.map(([v, c]) => [v, `${esc(v)} (${n(c)})`])];
    const nb = Object.values(CL.k).filter(Boolean).length;
    return `<details class="box cl-multi"${nb || mem.get('mg_clmulti') === '1' ? ' open' : ''}><summary>🔎 Recherche multicritère${nb ? ` <span class="cl-nbk">${nb} critère${nb > 1 ? 's' : ''}</span>` : ''}<span class="cl-cpt" data-clcpt aria-live="polite">${compteClients(total)}</span></summary>
      <div class="cl-gr"><p class="cl-gt">👤 Le contact</p><div class="cl-crits">
        ${sel('pro', 'Particulier ou entreprise', [['', 'Tous'], ['part', 'Particuliers'], ['pro', 'Entreprises (société renseignée)']])}
        ${sel('civ', 'Civilité', [['', 'Toutes'], ['Mme', 'Madame'], ['M.', 'Monsieur'], ['aucune', 'Non renseignée']])}
        ${sel('dep', 'Département', [['', 'Tous'], ['idf', 'Toute l’Île-de-France'], ...F.dep.map(([v, c]) => [v, `${esc(v)} (${n(c)})`]), ['aucun', 'Inconnu']])}
        ${sel('contactDe', 'Contact de (apporté par)', liste(F.contactDe, 'Tout le monde'))}</div></div>
      <div class="cl-gr"><p class="cl-gt">🎭 Prestataires et talents</p><div class="cl-crits">
        ${sel('metier', 'Métier', [['', 'Tous (clients compris)'], ['*', 'Tous les prestataires'], ...F.metiers.map(([v, c]) => [v, `${esc(v)} (${n(c)})`])])}
        ${sel('dj', 'Style de DJ', liste(F.dj, 'Tous'))}
        ${sel('indep', 'Indépendant(e)', [['', 'Peu importe'], ['1', `Oui (${n(F.indep)})`]])}
        ${sel('permis', 'Permis de conduire', [['', 'Peu importe'], ['1', `Oui (${n(F.permis)})`]])}</div></div>
      <div class="cl-gr"><p class="cl-gt">✉ Pour le joindre</p><div class="cl-crits">
        ${sel('joignable', 'Joignable par', [['', 'Peu importe'], ['email', 'E-mail'], ['sms', 'SMS (portable)'], ['les2', 'E-mail et SMS'], ['aucun', 'Ni e-mail ni SMS']])}
        ${sel('npc', 'NE PAS CONTACTER', [['', 'Peu importe'], ['non', 'Sauf « ne pas contacter »'], ['oui', `Seulement « ne pas contacter » (${n(F.npc)})`]])}</div></div>
      <div class="row cl-res"><span class="cl-cpt grand" data-clcpt>${compteClients(total)}</span><span class="muted sm">correspondent à votre sélection</span>${nb ? '<button type="button" class="btn ghost sm" data-ckclear>✕ Effacer les critères</button>' : ''}</div></details>`;
  }
  async function clients(id, sub) {
    if (id === 'entreprises') return sub ? ficheEntreprise(sub) : entreprises();
    if ((id === 'email' || id === 'sms') && !peut('diffusion')) return sansAcces();
    if (id === 'importer' && !peut('fichiers')) return sansAcces();
    if (id === 'email' || id === 'sms') return diffusion(id);
    if (id === 'importer') return importerClients();
    if (id === 'appels') return appelsClients();
    if (id) return client(id);
    const r = await api(urlClients());
    return page('Clients', `${peut('fichiers') ? '<a class="btn ghost" href="#/clients/importer">⬆ Importer des clients</a>' : ''}<a class="btn" href="#/clients/nouveau">+ Nouveau client</a>`, `
      ${ongletsClients('')}${bandeauClients('', r.tous, r.entreprises)}<div class="cl-bar"><input type="search" placeholder="🔍 Chercher dans toutes les cases des fiches : nom, téléphone, e-mail, société, ville, métier, remarque, rue…" data-q value="${esc(CL.q)}" aria-label="Rechercher un client">
        <div class="cl-f">${[['', `Tous (${r.tous.toLocaleString('fr-FR')})`], ['importes', `Fichier importé (${r.importes.toLocaleString('fr-FR')})`], ['autres', 'Site et back-office']].map(([k, l]) => `<button type="button" class="qs-own-b${CL.filtre === k ? ' on' : ''}" data-clf="${k}">${l}</button>`).join('')}</div></div>
      ${CL.dernier ? `<div class="okbox cl-remet"><span>🗑 ${CL.dernier.nb.toLocaleString('fr-FR')} contact${CL.dernier.nb > 1 ? 's' : ''} effacé${CL.dernier.nb > 1 ? 's' : ''}.</span><button type="button" class="btn ghost sm" data-clremet>↶ Remettre</button></div>` : ''}<div id="clMulti">${filtresClients(r.facettes, r.total)}</div><div id="clTable">${tableClients(r)}</div>`);
  }
  function tableClients(r) {
    const pages = Math.max(1, Math.ceil(r.total / r.par));
    const ef = peut('effacerContacts'), libres = r.items.filter(c => !c.verrou);
    const ckTete = ef ? `<th class="ck"><input type="checkbox" data-cltout aria-label="Cocher toute la page" title="Cocher toute la page"${libres.length && libres.every(c => CL.sel.has(c.id)) ? ' checked' : ''}></th>` : '';
    const ck = c => !ef ? '' : c.verrou ? '<td class="ck" title="A une demande, un devis ou une facture : ne peut pas être effacé">🔒</td>' : `<td class="ck"><input type="checkbox" data-clsel="${esc(c.id)}" aria-label="Cocher ${esc(c.nom || '')}"${CL.sel.has(c.id) ? ' checked' : ''}></td>`;
    return `${ef ? `<div class="row sel-bar cl-sel"><button type="button" class="btn danger sm" data-cleff${CL.sel.size ? '' : ' disabled'}>🗑 Effacer${CL.sel.size ? ' ' + CL.sel.size.toLocaleString('fr-FR') + ' contact' + (CL.sel.size > 1 ? 's' : '') : ''}</button><span class="muted sm">${CL.sel.size ? `${CL.sel.size.toLocaleString('fr-FR')} coché${CL.sel.size > 1 ? 's' : ''} · <button type="button" class="lnk" data-clnone>Tout décocher</button>` : 'Cochez les contacts à effacer.'}${r.total > libres.length ? ` · <button type="button" class="lnk" data-clall>Cocher les ${r.total.toLocaleString('fr-FR')} contacts de cette recherche</button>` : ''}</span></div>` : ''}<div class="table"><table><thead><tr>${ckTete}<th>Nom</th><th>Société</th><th>Contact</th><th>Ville</th><th class="n">Demandes</th><th>Dernière activité</th><th></th></tr></thead><tbody>
      ${r.items.map(c => `<tr data-href="#/clients/${esc(c.id)}">${ck(c)}<td><b>${esc(c.nom || '—')}</b>${c.nePasContacter ? ' <span class="pill d-refuse" title="NE PAS CONTACTER">⛔</span>' : ''}${(c.metiers || []).length ? `<small class="cl-met">🎭 ${esc(c.metiers.join(', '))}</small>` : ''}${c.source === 'import CRM' ? '<small class="cl-imp">fichier importé</small>' : ''}</td><td>${esc(c.societe || '')}</td><td>${esc(c.email || '')}<small>${esc(c.tel || '')}</small></td><td>${esc([c.cp, c.ville].filter(Boolean).join(' '))}</td><td class="n">${c.nbDemandes || ''}</td><td>${dateFr(c.derniereActivite)}</td><td class="n"><a class="qs-back cl-edit" href="#/clients/${esc(c.id)}?edit=1" title="Modifier la fiche">✏ Modifier</a></td></tr>`).join('') || `<tr><td colspan="${ef ? 8 : 7}" class="muted">${r.tous ? 'Aucun client ne correspond.' : 'Aucun client pour le moment.'}</td></tr>`}</tbody></table></div>
      ${r.total > r.par ? `<div class="cl-pages"><button type="button" class="btn ghost sm" data-clp="-1"${r.page <= 1 ? ' disabled' : ''}>‹ Précédents</button><span>${((r.page - 1) * r.par + 1).toLocaleString('fr-FR')} à ${Math.min(r.total, r.page * r.par).toLocaleString('fr-FR')} sur ${r.total.toLocaleString('fr-FR')}</span><button type="button" class="btn ghost sm" data-clp="1"${r.page >= pages ? ' disabled' : ''}>Suivants ›</button></div>` : `<p class="muted sm cl-nb">${r.total.toLocaleString('fr-FR')} client${r.total > 1 ? 's' : ''}</p>`}`;
  }
  clients.after = (id, sub) => {
    if (id === 'entreprises') return sub ? ficheEntreprise.after(sub) : entreprises.after();
    if (id === 'email' || id === 'sms') return diffusion.after(id);
    if (id === 'importer') return importerClients.after();
    if (id === 'appels') return appelsClients.after();
    if (id) return client.after(id);
    const recharger = async (multi) => { try { const r = await api(urlClients()); $('#clTable').innerHTML = tableClients(r); if (multi) { $('#clMulti').innerHTML = filtresClients(r.facettes, r.total); brancherMulti(); } else $$('[data-clcpt]').forEach(x => { x.innerHTML = compteClients(r.total); x.classList.remove('pop'); void x.offsetWidth; x.classList.add('pop'); }); brancher(); } catch (e) { toast(e.message, true); } };
    const brancherMulti = () => {
      $$('[data-ck]').forEach(x => x.addEventListener('change', () => { CL.k[x.dataset.ck] = x.value; CL.page = 1; recharger(true); }));
      $('[data-ckclear]')?.addEventListener('click', () => { CL.k = {}; CL.page = 1; recharger(true); });
      $('.cl-multi')?.addEventListener('toggle', e => mem.set('mg_clmulti', e.target.open ? '1' : '0'));
    };
    brancherMulti();
    const brancher = () => {
      $$('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a') && !e.target.closest('.ck')) location.hash = tr.dataset.href; }));
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
  const bandeauClients = (cur, nC, nE) => `<div class="cl-vue"><span class="cl-vue-lab">Afficher</span><div class="cl-vue-rail">${[['', '👤', 'Contacts', nC], ['entreprises', '🏢', 'Entreprises', nE]].map(([k, i, l, n]) => `<a href="#/clients${k ? '/' + k : ''}" class="cl-vue-c${cur === k ? ' on' : ''}"${cur === k ? ' aria-current="page"' : ''}><span class="cl-vue-i">${i}</span>${l}${n != null ? ` <small>${Number(n).toLocaleString('fr-FR')}</small>` : ''}</a>`).join('')}</div></div>`;
  const EN = { q: '', page: 1, filtre: '' };
  async function entreprises() {
    const [r, rc] = await Promise.all([api(`${A}/entreprises?par=50&page=${EN.page}&filtre=${EN.filtre}&q=${encodeURIComponent(EN.q)}`), api(`${A}/clients?par=10&page=1&q=`).catch(() => ({ tous: null }))]);
    return page('Clients', `<a class="btn" href="#/clients/entreprises/nouvelle">+ Nouvelle entreprise</a>`, `
      ${ongletsClients('')}${bandeauClients('entreprises', rc.tous, r.tous)}<div class="cl-bar"><input type="search" placeholder="🔍 Nom de l’entreprise, SIRET, ville, nom d’un contact…" data-q value="${esc(EN.q)}" aria-label="Rechercher une entreprise">
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
  const ongletsClients = cur => `<nav class="df-tabs" aria-label="Clients">${[['', '👥 Liste des clients'], ['email', '✉️ Envoyer un e-mail'], ['sms', '💬 Envoyer un SMS'], ['appels', '📞 Programmer un appel']].filter(([k]) => peut('diffusion') || !['email', 'sms'].includes(k)).map(([k, l]) => `<a href="#/clients${k ? '/' + k : ''}" class="df-tab${cur === k ? ' on' : ''}"${cur === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;
  const DFK = canal => 'mg_dif_' + canal;
  const MONTANTS = [[0, 'Peu importe'], [10000, 'Plus de 100 €'], [30000, 'Plus de 300 €'], [50000, 'Plus de 500 €'], [100000, 'Plus de 1 000 €'], [200000, 'Plus de 2 000 €'], [500000, 'Plus de 5 000 €'], ['autre', 'Autre montant…']];
  const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
  function etatDif(canal) {
    let s = null; try { s = JSON.parse(mem.get(DFK(canal)) || 'null'); } catch { /* */ }
    return { criteres: { statut: '', montantMin: 0, deps: [], types: [], pro: '', accord: false, metiers: [], dj: [], contactDe: [], civ: '', ...(s?.criteres || {}) }, mode: s?.mode === 'manuel' ? 'manuel' : 'criteres', exclus: [], inclus: [], q: '', page: 0, seulementCoches: false,
      infos: s?.infos || '', nbSms: s?.nbSms || 1, ton: s?.ton || '', message: s?.message || (canal === 'sms' ? { texte: '' } : { objet: '', titre: '', corps: '', photo: '', bouton: { texte: '', lien: '' } }), essai: s?.essai || '' };
  }
  const garderDif = (canal, st) => mem.set(DFK(canal), JSON.stringify({ criteres: st.criteres, mode: st.mode, infos: st.infos, nbSms: st.nbSms, ton: st.ton, message: st.message, essai: st.essai }));
  async function diffusion(canal) {
    const conf = await api(A + '/diffusion/criteres'); cache.dif = { canal, conf, st: etatDif(canal) };
    const st = cache.dif.st, sms = canal === 'sms', k = st.criteres;
    if (!st.essai) st.essai = sms ? conf.moi.tel : conf.moi.email;
    const autre = k.montantMin && !MONTANTS.some(([v]) => v === k.montantMin);
    const deps = [...conf.deps].sort((a, b) => (IDF.includes(b[0]) - IDF.includes(a[0])) || a[0].localeCompare(b[0], 'fr', { numeric: true }));
    const chip = (attr, v, l, on) => `<button type="button" class="qs-own-b df-chip${on ? ' on' : ''}" data-${attr}="${esc(v)}" aria-pressed="${on}">${l}</button>`;
    const joignables = sms ? conf.sms : conf.email;
    return page('Clients', '<a class="btn ghost" href="#/clients/nouveau">+ Nouveau client</a>', `${ongletsClients(canal)}
      <p class="df-intro">${sms ? 'Un SMS d’information (nouveautés, offres, fêtes…) envoyé aux clients choisis. Le SMS part au nom de <b>Magnolia</b> avec la mention obligatoire « STOP au 36173 » pour se désabonner.' : 'Un e-mail d’information aux couleurs de Magnolia, envoyé aux clients choisis depuis infos@magnoliatraiteur.fr. Un lien « Se désinscrire » est ajouté en bas, comme la loi l’exige.'} ${joignables} client${joignables > 1 ? 's' : ''} sur ${conf.total} ${sms ? 'ont un numéro de portable' : 'ont une adresse e-mail'}${(sms ? conf.stopSms : conf.stopEmail) ? ` (${sms ? conf.stopSms : conf.stopEmail} désinscrit${(sms ? conf.stopSms : conf.stopEmail) > 1 ? 's' : ''} jamais contacté${(sms ? conf.stopSms : conf.stopEmail) > 1 ? 's' : ''})` : ''}.</p>
      ${conf.brevo ? '' : '<p class="aq-warn">Brevo n’est pas branché sur ce site : rien ne partira vraiment (mode essai). La clé BREVO_API_KEY doit être dans les variables Railway.</p>'}
      <div class="df-cols">
        <section class="box df-qui"><h2><span class="df-n">1</span> À qui ?</h2>
          <div class="df-mode" role="radiogroup">${chip('mode', 'criteres', 'Selon les critères', st.mode === 'criteres')}${chip('mode', 'manuel', 'Choisir un par un', st.mode === 'manuel')}</div>
          <div class="df-crit"${st.mode === 'manuel' ? ' hidden' : ''}>
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
            <div class="aq-nrow"><textarea rows="4" data-infos placeholder="${sms ? 'ex. fête des mères dimanche 30 mai, -10 % sur tous les buffets commandés avant le 20 mai, livraison offerte dès 700 €' : 'ex. nouveau buffet libanais, 15 mezzés, à partir de 24,90 € par personne, livraison 7 j/7 en Île-de-France, réservez pour les fêtes de fin d’année, offre -10 % jusqu’au 15 décembre avec le code NOEL10'}">${esc(st.infos)}</textarea><button type="button" class="aq-mic" data-dmic title="Dicter" aria-label="Dicter">🎤</button></div>
            <div class="row df-iarow">${sms ? `<label>Longueur<select data-nbsms>${[1, 2, 3].map(n => `<option value="${n}"${+st.nbSms === n ? ' selected' : ''}>${n} SMS (${n === 1 ? 160 : n * 153} caractères)</option>`).join('')}</select></label>` : `<label>Ton<select data-ton>${['', 'Chaleureux', 'Festif', 'Élégant', 'Professionnel (entreprises)', 'Offre promotionnelle'].map(t => `<option value="${esc(t)}"${st.ton === t ? ' selected' : ''}>${t || 'Au choix de l’IA'}</option>`).join('')}</select></label>`}
              <button type="button" class="btn aq-btn" data-redige${conf.ia ? '' : ' disabled'}>✨ Rédiger avec l’IA</button></div>
            <p class="df-iamsg" data-iamsg>${conf.ia ? '' : '<span class="err">L’IA n’est pas activée (clé ANTHROPIC_API_KEY absente de Railway).</span>'}</p></div>
          <div data-champs>${champsMessage(canal, st.message)}</div>
          <div class="row df-voir"><button type="button" class="btn voir-site" data-voir>👁 ${sms ? 'Voir le SMS' : 'Voir le mail'}</button></div>
        </section>
      </div>
      <section class="box df-env"><h2><span class="df-n">3</span> Envoyer</h2>
        <div class="df-essai"><label>${sms ? 'Faire un essai sur mon portable' : 'Faire un essai sur mon e-mail'}<input data-essai value="${esc(st.essai)}" ${sms ? 'type="tel" inputmode="tel" placeholder="06 12 34 56 78"' : 'type="email" placeholder="vous@exemple.fr"'}></label><button type="button" class="btn ghost" data-essaib>Envoyer l’essai</button></div>
        ${sms && !conf.creneauSms.ok ? `<p class="aq-warn">⏰ ${esc(conf.creneauSms.raison)}</p>` : ''}
        <div class="df-go"><button type="button" class="btn df-big" data-envoyer>Envoyer</button><p class="muted sm" data-cout></p></div>
        <div data-suivi></div>
        <h3 class="df-h3">Derniers envois</h3><ul class="list df-hist" data-hist><li class="muted">Chargement…</li></ul>
      </section>`);
  }
  function champsMessage(canal, m) {
    if (canal === 'sms') return `<label>Texte du SMS<textarea rows="5" data-m="texte" placeholder="Magnolia Traiteur : Bonjour {prenom}, …">${esc(m.texte || '')}</textarea></label>
      <p class="df-cpt" data-cpt></p><p class="muted sm">{prenom} est remplacé par le prénom de chaque client. L’adresse du site${cache.dif?.conf?.lienSms ? ' (' + esc(cache.dif.conf.lienSms) + ')' : ''} et la mention « STOP au 36173 » sont ajoutées automatiquement à la fin (elles comptent dans la longueur). Les accents ê, â, î, ô, û et ç sont remplacés (fete, garcon) pour rester au format SMS standard, 3 fois moins cher.</p>`;
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
    const sel = () => ({ canal, criteres: k, mode: st.mode, exclus: st.exclus, inclus: st.inclus });
    const garder = () => garderDif(canal, st);
    const charger = async () => {
      const my = ++seq;
      const r = await api(A + '/diffusion/selection', { method: 'POST', body: { ...sel(), q: st.q, page: st.page, seulementCoches: st.seulementCoches } }).catch(e => { toast(e.message, true); return null; });
      if (!r || my !== seq) return;
      nb = r.nb;
      $('[data-nb]').textContent = r.nb.toLocaleString('fr-FR');
      $('[data-nbl]').textContent = (r.nb > 1 ? 'destinataires' : 'destinataire') + (st.mode === 'criteres' && r.correspondent !== r.nb ? ` (${r.correspondent - r.nb} décoché${r.correspondent - r.nb > 1 ? 's' : ''} à la main)` : '');
      $('[data-dlist]').innerHTML = r.lignes.length ? r.lignes.map(p => `<li><label class="df-cl${p.coche ? ' on' : ''}"><input type="checkbox" data-cid="${esc(p.id)}"${p.coche ? ' checked' : ''}><span class="qs-av">${esc(initiales(p.nom))}</span><span class="df-t"><b>${esc(p.nom || '—')}</b><small>${esc([p.societe, p.contact].filter(Boolean).join(' · '))}</small></span><span class="df-m">${p.totalCents ? euros(p.totalCents) : '<span class="muted">pas de commande</span>'}<small>${esc(p.deps.join(', '))}${p.derniere ? (p.deps.length ? ' · ' : '') + dateFr(p.derniere) : ''}</small></span></label></li>`).join('')
        : `<li class="muted df-vide">${st.q ? 'Aucun client trouvé.' : st.mode === 'manuel' && st.seulementCoches ? 'Aucun client coché.' : 'Aucun client ne correspond à ces critères.'}</li>`;
      $('[data-dpages]').innerHTML = r.pages > 1 ? `<button type="button" class="btn ghost sm" data-pg="-1"${st.page ? '' : ' disabled'}>‹ Précédents</button><span class="muted sm">Page ${st.page + 1} / ${r.pages} · ${r.vue.toLocaleString('fr-FR')} clients</span><button type="button" class="btn ghost sm" data-pg="1"${st.page + 1 < r.pages ? '' : ' disabled'}>Suivants ›</button>` : '';
      const go = $('[data-envoyer]');
      go.textContent = r.nb ? `${sms ? '💬' : '✉️'} Envoyer à ${r.nb.toLocaleString('fr-FR')} client${r.nb > 1 ? 's' : ''}` : 'Choisissez des destinataires';
      go.disabled = !r.nb || (sms && !conf.creneauSms.ok);
      majCout();
    };
    const recharger = () => { st.page = 0; garder(); charger(); };
    /* critères */
    $$('[data-mode]').forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.mode; $$('[data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); $('.df-crit').hidden = st.mode === 'manuel'; recharger(); }));
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
      if (st.mode === 'criteres') { if (tout) st.exclus = []; else { const r = await api(A + '/diffusion/selection', { method: 'POST', body: { ...sel(), exclus: [], q: st.q, page: 0 } }); if (r.vue > 50 || !st.q) { st.mode = 'manuel'; st.inclus = []; $$('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === 'manuel')); $('.df-crit').hidden = true; toast('Plus personne n’est coché : cochez les clients un par un.'); } else st.exclus = [...new Set([...st.exclus, ...$$('[data-cid]').map(x => x.dataset.cid)])]; } }
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
      p.innerHTML = t ? `<b>${c.car}</b> / ${c.sms <= 1 ? (c.unicode ? 70 : 160) : c.sms * (c.unicode ? 67 : 153)} caractères · <b class="${c.sms > +st.nbSms ? 'err' : ''}">${c.sms} SMS</b> par client${c.sms > 3 ? ' · <span class="err">trop long (3 SMS au maximum)</span>' : c.sms > +st.nbSms ? ` · <span class="err">plus long que les ${st.nbSms} SMS choisis</span>` : ''}${c.unicode ? ' · <span class="err">caractère spécial (emoji…) : 70 caractères par SMS</span>' : ''}` : '';
      majCout();
    };
    function majCout() { const p = $('[data-cout]'); if (!p) return; if (!sms) { p.textContent = nb ? 'Chaque client reçoit son propre e-mail, avec son prénom.' : ''; return; } const c = smsCompte((st.message.texte || '').trim()); p.textContent = nb && c.sms ? `${(nb * c.sms).toLocaleString('fr-FR')} crédit${nb * c.sms > 1 ? 's' : ''} SMS Brevo utilisé${nb * c.sms > 1 ? 's' : ''} (${c.sms} par client).` : ''; }
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
      const ok = await confirmer(`<h2>Envoyer ${sms ? 'ce SMS' : 'cet e-mail'} à <b>${nb.toLocaleString('fr-FR')}</b> client${nb > 1 ? 's' : ''} ?</h2>
        <p>${sms ? `Texte : « ${esc(st.message.texte.slice(0, 120))}${st.message.texte.length > 120 ? '…' : ''} »<br>${c.sms} SMS par client, soit <b>${(nb * c.sms).toLocaleString('fr-FR')} crédits SMS</b>.` : `Objet : <b>${esc(st.message.objet)}</b>`}</p>
        <p class="muted sm">L’envoi ne peut pas être annulé une fois parti. Avez-vous fait un essai sur ${sms ? 'votre portable' : 'votre e-mail'} ?</p>`, `Oui, envoyer à ${nb.toLocaleString('fr-FR')} client${nb > 1 ? 's' : ''}`);
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
  };
  const HFILTRES = [['', 'Tout'], ['dv', 'Devis'], ['pay', 'Factures et règlements'], ['msg', 'E-mails, SMS et relances'], ['note', 'Notes et appels']];
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
    return page('Clients', '<a class="btn ghost" href="#/clients/nouveau">+ Nouveau client</a>', `${ongletsClients('appels')}
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
    return page(esc(c.nom || 'Client'), `<a class="btn ghost" href="#/suivi">← Suivi client</a><button type="button" class="btn hc-editbtn" data-hedit>✏ Modifier la fiche</button><button type="button" class="btn ghost hc-rdvbtn" data-hrdv>📞 Programmer un appel / une visio</button><button class="btn" data-newdv>+ Devis pour ce client</button>`, `
      <section class="box hc-edit" id="hcEdit"${/[?&]edit=1/.test(location.hash) ? '' : ' hidden'}><div class="hc-th"><h2>✏ Modifier la fiche de ${esc(c.nom || 'ce client')}</h2><button type="button" class="lnk" data-hcancel>Fermer</button></div><p class="muted sm">Corrigez ce qui a changé (nom, téléphone, e-mail, adresse…) puis « Enregistrer ». Les demandes et le suivi client sont mis à jour en même temps.</p><form id="cf">${formClient(c)}<div class="row"><button class="btn">Enregistrer la fiche</button><button type="button" class="btn ghost" data-hcancel>Annuler</button></div></form></section>
      ${formRdv(c)}
      <section class="box hc-head"><div class="hc-who"><span class="qs-av hc-av">${esc(initiales(c.nom))}</span><div><div class="hc-nm">${esc(c.nom || '—')} <button type="button" class="hc-pen" data-hedit title="Modifier la fiche" aria-label="Modifier la fiche">✏</button></div>${c.societe ? `<div class="hc-co">${c.entrepriseId ? `<a class="hc-ent" href="#/clients/entreprises/${esc(c.entrepriseId)}" title="Ouvrir la fiche de l’entreprise">🏢 ${esc(c.societe)} ›</a>` : esc(c.societe)}${c.fonction ? ' · ' + esc(c.fonction) : ''}</div>` : c.fonction ? `<div class="hc-co">${esc(c.fonction)}</div>` : ''}
        <div class="hc-ct">${tel ? `<a class="qs-pill" href="tel:${esc(tel)}" data-happel>📞 ${esc(c.tel)}</a>` : ''}${c.email ? `<a class="qs-pill" href="mailto:${esc(c.email)}">✉ ${esc(c.email)}</a>` : ''}</div>
        ${an ? `<div class="hc-anniv${an.dans <= 14 ? ' bientot' : ''}">🎂 Né(e) le ${dateFr(c.naissance, { day: 'numeric', month: 'long', year: 'numeric' })} · ${an.age - (an.dans ? 1 : 0)} ans · ${an.dans === 0 ? '<b>anniversaire aujourd’hui !</b>' : an.dans <= 14 ? `<b>anniversaire dans ${an.dans} jour${an.dans > 1 ? 's' : ''}</b>` : 'anniversaire le ' + dateFr(an.date, { day: 'numeric', month: 'long' })}${an.dans <= 14 ? ` <button type="button" class="qs-pill" data-anniv="${esc(c.id)}" data-canal="email">✉ Souhaiter par e-mail</button><button type="button" class="qs-pill" data-anniv="${esc(c.id)}" data-canal="sms">💬 par SMS</button>` : ''}</div>` : `<div class="hc-since"><button type="button" class="lnk" data-hedit>🎂 Ajouter sa date de naissance</button></div>`}<div class="hc-since">Client depuis le ${dateFr(c.creeLe || h.events[h.events.length - 1]?.at)}${coms.length ? ' · suivi par ' + esc(coms.join(', ')) : ''}</div>${c.source === 'import CRM' || c.consentement ? `<div class="hc-since hc-cons">${c.source === 'import CRM' ? '📥 Repris du fichier clients de l’ancien CRM' : '✓ Client existant'}${c.consentement ? ` · accepte nos ${[c.consentement.email && !c.desinscrit?.email ? 'e-mails' : '', c.consentement.sms && !c.desinscrit?.sms ? 'SMS' : ''].filter(Boolean).join(' et ') || '—'}` : ''}${c.desinscrit?.email || c.desinscrit?.sms ? ` · <b>désinscrit des ${[c.desinscrit.email ? 'e-mails' : '', c.desinscrit.sms ? 'SMS' : ''].filter(Boolean).join(' et ')}</b>` : ''}${c.caCrmCents ? ` · déjà commandé (ancien CRM) : ${euros(c.caCrmCents)}` : ''}${c.derniereCommande ? ` · dernière commande le ${dateFr(c.derniereCommande)}` : ''}</div>` : ''}</div></div>
        <div class="kpis qk hc-k"><div><b>${euros(r.signeCents)}</b><span>signé (TTC)</span></div><div><b>${euros(r.regleCents)}</b><span>déjà réglé</span></div><div><b>${euros(r.aEncaisserCents)}</b><span>factures à encaisser</span></div><div><b>${r.nbSignes} / ${r.nbDevis}</b><span>devis signés</span></div></div></section>
      <div class="hc-cols">
        <section class="box hc-tl"><div class="hc-th"><h2>Tout l’historique</h2><span class="muted sm">${h.events.length} événement${h.events.length > 1 ? 's' : ''}</span></div>
          <div class="hc-add"><textarea rows="2" data-hnote placeholder="Ajouter une note : ce que le client a dit au téléphone, une préférence, un rappel…"></textarea><div class="row"><button type="button" class="btn sm" data-hadd="note">🗒 Ajouter la note</button><button type="button" class="btn ghost sm" data-hadd="appel">📞 Noter un appel</button></div></div>
          <div class="hc-f">${HFILTRES.map(([k, l]) => `<button type="button" class="qs-own-b${HF.f === k ? ' on' : ''}" data-hf="${k}">${l}</button>`).join('')}</div>
          <ol class="hc-list" id="hcList">${friseClient(h.events)}</ol></section>
        <div class="hc-side">
          <section class="box hc-rqbox"><div class="hc-th"><h2>🔒 Remarque</h2><span class="muted sm">visible seulement par l’équipe</span></div><textarea rows="4" data-rq placeholder="Ex. : client exigeant sur la ponctualité, préfère le vin rouge, code portail 1234…">${esc(c.notes || '')}</textarea><div class="row"><button type="button" class="btn sm" data-rqsave>Enregistrer la remarque</button><span class="muted sm" data-rqok></span></div><p class="muted sm">Jamais montrée au client : ni sur le site, ni sur les devis, ni dans les e-mails ou SMS.</p></section>
          ${boxProfil(c)}
          <section class="box hc-rdvs"><div class="hc-th"><h2>Appels et visios</h2><button type="button" class="lnk" data-hrdv>+ Programmer</button></div>${listeRdv(h.rdv || [])}</section>
          <section class="box"><h2>Devis</h2>${h.devis.length ? `<ul class="list">${[...h.devis].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(x => `<li><a href="#/devis/${x.id}"><b>${esc(x.numero)}</b> · ${euros(x.ttcCents)}<small class="muted"> ${esc([x.evenement?.type, x.evenement?.date ? dateFr(x.evenement.date) : ''].filter(Boolean).join(' · '))}</small></a><span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun devis.</p>'}</section>
          <section class="box"><h2>Factures et règlements</h2>${h.factures.length ? `<ul class="list">${h.factures.map(x => `<li><a href="#/factures/${x.id}"><b>${esc(x.numero)}</b> · ${x.type === 'avoir' ? '− ' : ''}${euros(x.totalCents)}<small class="muted"> ${{ acompte: 'acompte', solde: 'solde', totale: '', avoir: 'avoir' }[x.type] || ''}${x.type !== 'avoir' && !x.annulee && x.regleCents && x.resteCents ? ` · réglé ${euros(x.regleCents)}, reste ${euros(x.resteCents)}` : ''}</small></a><span class="pill ${x.annulee ? 'd-refuse' : x.type === 'avoir' ? 'd-expire' : x.payee ? 'd-accepte' : 'd-envoye'}">${x.annulee ? 'Annulée' : x.type === 'avoir' ? 'Avoir' : x.payee ? (x.archivee ? 'Archivée' : 'Réglée') + (x.moyen ? ' · ' + esc(x.moyen) : '') : x.regleCents ? 'Acompte reçu' : 'À encaisser'}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune facture.</p>'}</section>
          <section class="box"><h2>Demandes</h2>${h.demandes.length ? `<ul class="list">${h.demandes.map(d => `<li><a href="#/demandes/${d.id}"><b>${esc(d.ref || '')}</b> · ${esc(d.evenement?.type || (d.type === 'contact' ? 'message' : ''))} ${d.evenement?.date ? dateFr(d.evenement.date) : ''}</a><span class="pill st-${d.statut}">${STATUTS[d.statut] || ''}</span></li>`).join('')}</ul>` : '<p class="muted">Aucune demande.</p>'}</section>
        </div></div>`);
  }
  /* profil prestataire / DJ / origine (fichier contacts « MADER », 2026-11-24) */
  const aProfil = c => !!((c.metiers || []).length || c.independant || c.permis || c.remuneration);
  const aDj = c => !!((c.djStyles || []).length || c.djDepuis || c.djTarifs || (c.metiers || []).includes('DJ'));
  function boxProfil(c) {
    const puce = t => `<span class="pf-p">${esc(t)}</span>`;
    const lignes = [];
    if (c.nePasContacter) lignes.push('<p class="pf-npc">⛔ NE PAS CONTACTER <small>(aucun e-mail ni SMS d’information)</small></p>');
    if (aProfil(c)) lignes.push(`<div class="pf-g"><p class="pf-t">🎭 Prestataire</p>${(c.metiers || []).length ? `<div class="pf-ps">${c.metiers.map(puce).join('')}</div>` : ''}<p class="sm">${[c.independant ? '✓ Indépendant(e)' : '', c.permis ? '🚗 Permis de conduire' : '', c.remuneration ? '💶 Rémunération : ' + esc(c.remuneration) : ''].filter(Boolean).join(' · ')}</p></div>`);
    if (aDj(c)) lignes.push(`<div class="pf-g"><p class="pf-t">🎧 DJ</p>${(c.djStyles || []).length ? `<div class="pf-ps">${c.djStyles.map(puce).join('')}</div>` : ''}<p class="sm">${[c.djDepuis ? 'DJ depuis ' + esc(c.djDepuis) : '', c.djTarifs ? 'Tarifs : ' + esc(c.djTarifs) + ' €' : ''].filter(Boolean).join(' · ')}</p></div>`);
    if (c.contactDe || c.siteWeb || c.pays || c.civilite) lignes.push(`<div class="pf-g"><p class="pf-t">🤝 Origine</p><p class="sm">${[c.civilite ? (c.civilite === 'Mme' ? 'Madame' : 'Monsieur') : '', c.contactDe ? 'Contact de <b>' + esc(c.contactDe) + '</b>' : '', c.pays ? esc(c.pays) : '', c.siteWeb ? `<a href="${esc(/^https?:/i.test(c.siteWeb) ? c.siteWeb : 'https://' + c.siteWeb)}" target="_blank" rel="noopener">${esc(String(c.siteWeb).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))} ↗</a>` : ''].filter(Boolean).join(' · ')}</p></div>`);
    return `<section class="box pf-box"><div class="hc-th"><h2>Profil</h2><button type="button" class="lnk" data-hedit>✏ Compléter</button></div>${lignes.join('') || '<p class="muted sm">Métiers, DJ, « contact de »… : rien de renseigné. « Compléter » pour les ajouter.</p>'}</section>`;
  }
  function casesProfil(c) {
    const D = cache.profilDef || { metiers: [], djStyles: [], contactDe: [] };
    const coches = (nom, base, choisis) => { const l = [...base, ...(choisis || []).filter(x => !base.includes(x))]; return `<div class="pf-cases">${l.map(x => `<label class="pf-c"><input type="checkbox" name="${nom}" value="${esc(x)}"${(choisis || []).includes(x) ? ' checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>`; };
    return `<details class="pf-d"${aProfil(c) ? ' open' : ''}><summary>🎭 Profil prestataire / talent <small class="muted">(serveur, barman, DJ, magicien…)</small></summary>
        <p class="pf-l">Métiers</p>${coches('_metiers', D.metiers, c.metiers)}
        <div class="g2"><label class="check"><input type="checkbox" name="independant"${c.independant ? ' checked' : ''}> Indépendant(e) <small class="muted">(auto-entrepreneur…)</small></label><label class="check"><input type="checkbox" name="permis"${c.permis ? ' checked' : ''}> A le permis de conduire</label></div>
        <label>Rémunération demandée<input name="remuneration" value="${esc(c.remuneration || '')}" placeholder="ex. 15 € de l’heure, 130 € la soirée"></label></details>
      <details class="pf-d"${aDj(c) ? ' open' : ''}><summary>🎧 DJ <small class="muted">(styles, expérience, tarifs)</small></summary>
        <p class="pf-l">Styles de musique</p>${coches('_djStyles', D.djStyles, c.djStyles)}
        <div class="g2"><label>DJ depuis <small class="muted">(année)</small><input name="djDepuis" value="${esc(c.djDepuis || '')}" inputmode="numeric" maxlength="4" placeholder="ex. 2015"></label><label>Tarifs <small class="muted">(€ la soirée)</small><input name="djTarifs" value="${esc(c.djTarifs || '')}" placeholder="ex. 250, 300"></label></div></details>
      <details class="pf-d"${c.contactDe || c.siteWeb || c.pays ? ' open' : ''}><summary>🤝 Origine du contact</summary>
        <div class="g2"><label>Contact de <small class="muted">(qui nous l’a apporté)</small><input name="contactDe" value="${esc(c.contactDe || '')}" list="pfCde" autocomplete="off"><datalist id="pfCde">${D.contactDe.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label><label>Site internet<input name="siteWeb" value="${esc(c.siteWeb || '')}" placeholder="www…"></label></div>
        <div class="g2"><label>Pays <small class="muted">(si pas la France)</small><input name="pays" value="${esc(c.pays || '')}"></label><label class="check pf-npcc"><input type="checkbox" name="nePasContacter"${c.nePasContacter ? ' checked' : ''}> ⛔ NE PAS CONTACTER <small class="muted">(bloque aussi les e-mails et SMS d’information)</small></label></div></details>`;
  }
  const formClient = c => `<div class="g2 pf-id"><label>Civilité<select name="civilite"><option value="">—</option>${[['Mme', 'Madame'], ['M.', 'Monsieur']].map(([v, l]) => `<option value="${v}"${c.civilite === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label>Prénom et NOM<input name="nom" value="${esc(c.nom)}" required data-nomclient placeholder="ex. Jean-Luc BERNARD"></label></div><div class="g2"><label>Société <small class="muted">(reliée à sa fiche entreprise)</small><input name="societe" value="${esc(c.societe || '')}" list="entL" autocomplete="off" data-soc><datalist id="entL"></datalist></label><label>Fonction <small class="muted">(dans l’entreprise)</small><input name="fonction" value="${esc(c.fonction || '')}" placeholder="ex. assistante de direction"></label></div>${c.entrepriseId && !c.id ? `<input type="hidden" name="entrepriseId" value="${esc(c.entrepriseId)}">` : ''}<div class="g2"><label>E-mail<input type="email" name="email" value="${esc(c.email || '')}"></label><label>Téléphone<input name="tel" value="${esc(c.tel || '')}" inputmode="tel"></label></div><div class="g2"><label>Date de naissance <small class="muted">(rappel de son anniversaire)</small><input type="date" name="naissance" value="${esc(c.naissance || '')}" max="${new Date().toISOString().slice(0, 10)}"></label></div><label>Adresse de facturation<textarea name="adresse" rows="2">${esc(c.adresse || '')}</textarea></label><div class="g2"><label>Code postal<input name="cp" value="${esc(c.cp || '')}" inputmode="numeric" maxlength="5"></label><label>Ville<input name="ville" value="${esc(c.ville || '')}"></label></div><label>🔒 Remarque <small class="muted">(visible seulement par l’équipe, jamais par le client)</small><textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label>${casesProfil(c)}<fieldset class="df-fs"><legend>E-mails et SMS d’information</legend><label class="check"><input type="checkbox" name="_accord"${c.consentement?.email ? ' checked' : ''}> A accepté de recevoir nos offres</label><label class="check"><input type="checkbox" name="_stopEmail"${c.desinscrit?.email ? ' checked' : ''}> Ne plus lui envoyer d’e-mails d’information</label><label class="check"><input type="checkbox" name="_stopSms"${c.desinscrit?.sms ? ' checked' : ''}> Ne plus lui envoyer de SMS d’information</label></fieldset>`;
  client.after = id => {
    $('#cf').addEventListener('submit', async e => {
      e.preventDefault(); const fd = new FormData(e.target), f = Object.fromEntries(fd);
      f.metiers = fd.getAll('_metiers'); f.djStyles = fd.getAll('_djStyles'); delete f._metiers; delete f._djStyles;
      for (const k of ['independant', 'permis', 'nePasContacter']) f[k] = !!f[k];
      const now = new Date().toISOString(), c0 = cache.client || {}, ds = c0.desinscrit || {}, cs = c0.consentement || {};
      if (f.nePasContacter && !c0.nePasContacter) { f._stopEmail = 'on'; f._stopSms = 'on'; }
      const stopE = !!f._stopEmail, stopS = !!f._stopSms, acc = !!f._accord; delete f._stopEmail; delete f._stopSms; delete f._accord;
      if (stopE !== !!ds.email || stopS !== !!ds.sms) f.desinscrit = { ...ds, email: stopE, sms: stopS, le: ds.le || now, ...(stopE && !ds.email ? { leEmail: now } : {}), ...(stopS && !ds.sms ? { leSms: now } : {}) };
      if (acc !== !!cs.email) f.consentement = acc ? { ...cs, email: true, sms: true, le: now, source: 'back-office' } : { ...cs, email: false, sms: false, le: now, source: 'back-office' };
      try {
        if (id === 'nouveau') { const r = await api(A + '/clients', { method: 'POST', body: { ...f, source: 'back-office', creeLe: new Date().toISOString(), derniereActivite: new Date().toISOString() } }); location.hash = f.entrepriseId ? '#/clients/entreprises/' + f.entrepriseId : '#/clients/' + r.id; }
        else { const cur = await api(A + '/clients/' + id); await api(`${A}/clients/${id}`, { method: 'PUT', body: { ...cur, ...f } }); toast('Fiche enregistrée.'); if (/[?&]edit=1/.test(location.hash)) location.hash = '#/clients/' + id; else render(); }
      } catch (err) { toast(err.message, true); }
    });
    $('[data-newdv]')?.addEventListener('click', async () => { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: { clientId: id } }); location.hash = '#/devis/' + r.id; });
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
    const nbRub = slug => slug === 'lieux' ? nbLieux : prods.filter(p => p.rubrique === slug).length;
    cache.rubriques = rubs.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); cache.produits = prods;
    const r = new URLSearchParams(location.hash.split('?')[1] || '').get('r') || cache.catR || rubs[0]?.slug;
    cache.catR = r;
    const liste = prods.filter(p => p.rubrique === r).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    const rub = rubs.find(x => x.slug === r) || {};
    return page('Catalogue', `<input type="search" placeholder="Rechercher dans tout le catalogue…" data-q>`, `
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
      <div class="row sousfiltre"><label class="pq">Rechercher une prestation<input type="search" data-pq placeholder="Tapez un nom : nems, mafé, paëlla…" autocomplete="off"></label>${(rub.sous || []).length ? `<label>Afficher<select data-sousf><option value="*">Toutes les prestations (${liste.length})</option>${[...rub.sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}">${esc(x.nom)} (${liste.filter(p => p.sous === x.slug).length})</option>`).join('')}<option value="">Sans spécialité (${liste.filter(p => !(rub.sous || []).some(x => x.slug === p.sous)).length})</option></select></label>` : ''}<label>Classement<select data-tri><option value="">Ordre du site</option><option value="az">Ordre alphabétique (A → Z)</option><option value="za">Ordre alphabétique (Z → A)</option><option value="p+">Prix croissant</option><option value="p-">Prix décroissant</option></select></label><label>Visibilité<select data-vis><option value="">Tous les produits (${liste.length})</option><option value="visible">Produits visibles (${liste.filter(p => p.statut !== 'masque').length})</option><option value="masque">Produits masqués (${liste.filter(p => p.statut === 'masque').length})</option></select></label><span class="muted sm" data-pqn></span></div>
      <div class="plist" id="plist">${liste.map(prow).join('') || '<p class="muted">Aucune prestation dans cette rubrique.</p>'}</div></div></section></div></div>`);
  }
  const LIEUX_CARTE = [['espagne', 'Espagne'], ['portugal', 'Portugal'], ['italie', 'Italie'], ['grece', 'Grèce'], ['france', 'France'], ['liban', 'Liban'], ['turquie', 'Turquie'], ['maghreb', 'Maghreb (Maroc, Algérie, Tunisie)'], ['maroc', 'Maroc'], ['algerie', 'Algérie'], ['tunisie', 'Tunisie'], ['afrique', 'Afrique (tout le continent)'], ['senegal', 'Sénégal'], ['cote-d-ivoire', 'Côte d’Ivoire'], ['cameroun', 'Cameroun'], ['congo', 'Congo'], ['antilles', 'Antilles'], ['reunion', 'La Réunion'], ['polynesie', 'Polynésie'], ['mexique', 'Mexique'], ['bresil', 'Brésil'], ['perou', 'Pérou'], ['argentine', 'Argentine'], ['etats-unis', 'États-Unis'], ['inde', 'Inde'], ['chine', 'Chine'], ['japon', 'Japon'], ['coree', 'Corée'], ['vietnam', 'Vietnam'], ['thailande', 'Thaïlande']];
  const prow = p => `<a class="prow${p.statut === 'masque' ? ' hid' : ''}" href="#/catalogue/${p.id || p.slug}">${p.photos?.[0]?.src ? `<img src="${esc(p.photos[0].src)}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span><b>${titreHtml(p.titre)}</b><small>${p.prixCents == null ? 'Sur devis' : euros(p.prixCents) + (p.unite ? ' / ' + esc(p.unite) : '')}${p.min > 1 ? ' · min. ' + p.min : ''}</small></span><span class="pill ${p.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${p.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${p.maison ? '<span class="pill">Maison</span>' : ''}${p.sous ? `<span class="pill">${esc(((cache.rubriques || []).find(r => r.slug === p.rubrique)?.sous || []).find(x => x.slug === p.sous)?.nom || '')}</span>` : ''}</a>`;
  catalogue.after = () => {
    $('[data-q]').addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim(); if (cache.catR === 'lieux') $('.prodbox').hidden = !q;
      $('#plist').innerHTML = (q ? cache.produits.filter(p => (p.titre + ' ' + (p.extrait || '')).toLowerCase().includes(q)) : cache.produits.filter(p => p.rubrique === cache.catR)).map(prow).join('') || '<p class="muted">Aucun résultat.</p>';
    });
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
          <div class="g3">${[['animations', 'Nos animations'], ['corbeilles', 'Nos corbeilles de fruits'], ['pieces-montees', 'Nos pièces montées'], ['buffets', 'Nos buffets'], ['mezzes-froids', 'Nos mezzés froids à l’unité'], ['mezzes-chauds', 'Nos mezzés chauds à l’unité'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['fromages', 'Nos fromages'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité'], ['location', 'En location']].map(([k, t]) => `<input data-ts="${k}" value="${esc((x.titresSections || {})[k] || '')}" placeholder="${t}" aria-label="${t}">`).join('')}</div></details><div class="row"><button type="button" class="btn ghost sm" data-up ${i ? '' : 'disabled'}>↑ Monter</button><button type="button" class="btn ghost sm" data-down ${i < sous.length - 1 ? '' : 'disabled'}>↓ Descendre</button><button type="button" class="btn ghost sm ph-del" data-delsous>🗑 Supprimer</button></div></div></div>`).join('') || '<p class="muted sm">Aucune spécialité pour cette rubrique.</p>';
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
      let L = cache.produits.filter(p => p.rubrique === cache.catR && (v === '*' || (v ? p.sous === v : !sous.some(x => x.slug === p.sous))) && (!q || q.split(/\s+/).every(m => sansAcc(p.titre + ' ' + p.slug).includes(m))));
      const tri = $('[data-tri]').value, vis = $('[data-vis]').value;
      if (vis) L = L.filter(p => (p.statut === 'masque') === (vis === 'masque'));
      const nom = (a, b) => String(a.titre || '').localeCompare(String(b.titre || ''), 'fr', { sensitivity: 'base' });
      if (tri === 'az') L.sort(nom); else if (tri === 'za') L.sort((a, b) => nom(b, a));
      else if (tri === 'p+' || tri === 'p-') L.sort((a, b) => (a.prixCents == null) - (b.prixCents == null) || (tri === 'p-' ? -1 : 1) * ((a.prixCents || 0) - (b.prixCents || 0)) || nom(a, b));
      $('#plist').innerHTML = L.map(prow).join('') || '<p class="muted">Aucune prestation ne correspond.</p>';
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
    const triM = memo('tri-prods'); if (triM) { $('[data-tri]').value = triM; filtrer(); }
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
  const vignette = (x, tag) => `<${tag} class="mt" ${tag === 'a' ? `href="${esc(x.url)}" target="_blank"` : 'type="button"'} data-u="${esc(x.url)}" title="${esc(x.url)}"><span class="mt-img">${/mp4$/i.test(x.url) ? `<video src="${esc(x.url)}#t=0.5" muted preload="metadata"></video><i>▶</i>` : `<img src="${esc(x.url)}" loading="lazy" decoding="async" alt="">`}</span><small>${esc(nomFichier(x.url))}</small></${tag}>`;
  const ordreMedias = l => [...l.filter(x => !x.url.startsWith('/site/avis/')), ...l.filter(x => x.url.startsWith('/site/avis/'))];
  function grilleMedias(box, items, tag) {
    let liste = items, n = 0; const PAQ = 120;
    const fin = document.createElement('div'); fin.className = 'mgrid-fin';
    const suite = () => { box.insertAdjacentHTML('beforeend', liste.slice(n, n + PAQ).map(x => vignette(x, tag)).join('')); n += PAQ; box.appendChild(fin); };
    const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting) && n < liste.length) suite(); }, { root: box.closest('.modal-in') ? box : null, rootMargin: '400px' });
    io.observe(fin);
    const filtrer = q => { q = q.trim().toLowerCase(); liste = q ? items.filter(x => x.url.toLowerCase().includes(q)) : items; n = 0; box.innerHTML = ''; suite(); const c = box.parentElement.querySelector('[data-mcount]'); if (c) c.textContent = liste.length + ' fichier' + (liste.length > 1 ? 's' : ''); };
    filtrer('');
    return filtrer;
  }
  async function pickMedia() {
    const m = await api(A + '/actions/medias');
    return new Promise(resolve => {
      const dlg = document.createElement('div'); dlg.className = 'modal';
      const all = [...m.envoyes, ...m.site];
      dlg.innerHTML = `<div class="modal-in"><div class="bh"><h2>Médiathèque</h2><input type="search" placeholder="Filtrer par nom…" data-mq><button class="x" data-close aria-label="Fermer">×</button></div><p class="muted sm" data-mcount></p><div class="mgrid"></div></div>`;
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
    const [p, rubs] = await Promise.all([api(A + '/produits/' + id), cache.rubriques || api(A + '/rubriques')]);
    cache.rubriques = rubs; cache.p = p;
    const sec = s => `${s.titre || ''}\n${(s.items || []).join('\n')}${(s.paragraphes || []).length ? '\n' + s.paragraphes.map(x => '> ' + x).join('\n') : ''}${s.note ? '\n# ' + s.note : ''}${s.apres ? '\n## ' + s.apres : ''}`;
    return page(titreHtml(p.titre), `<a class="btn ghost" href="#/catalogue?r=${esc(p.rubrique)}">← Catalogue</a><a class="btn voir-site" href="/${esc(p.rubrique)}/${esc(p.slug)}?apercu=1" target="_blank">👁 Voir la présentation sur le site</a>`, `
      <form id="pf">
      <div class="cols c21">
        <section class="box"><h2>Informations</h2>
          <label>Nom<input name="titre" value="${esc(p.titre)}" required><small class="muted">Formule de buffet : écrivez « Buffet antillais — Entrée + plat ». Sur le site, la formule s’affiche à la ligne sous le nom, sans le tiret.</small></label>
          <div class="g3"><label>Rubrique<select name="rubrique">${rubs.map(r => `<option value="${r.slug}"${r.slug === p.rubrique ? ' selected' : ''}>${esc(r.nom)}</option>`).join('')}</select></label>
          <label>Statut<select name="statut"><option value="visible">Visible sur le site</option><option value="masque"${p.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label>
          <label>Mise en avant<select name="maison"><option value="1">Produit maison (en premier)</option><option value=""${!p.maison ? ' selected' : ''}>Partenaire</option></select></label></div>
          ${(rubs.find(r => r.slug === p.rubrique)?.sous || []).length ? `<label>Spécialité (dans « ${esc(rubs.find(r => r.slug === p.rubrique).nom)} »)<select name="sous"><option value="">Aucune (seulement dans « Tout »)</option>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}"${x.slug === p.sous ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label><fieldset class="span3 aussi"><legend>Aussi affichée dans <small class="muted">(un seul produit, plusieurs spécialités : pas de doublon dans la boutique)</small></legend>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<label class="chk"><input type="checkbox" name="autresSous" value="${esc(x.slug)}"${(p.autresSous || []).includes(x.slug) ? ' checked' : ''}> ${esc(String(x.nom).split(' · ')[0])}</label>`).join(' ')}</fieldset>` : ''}
          <label>Section sur la page (spécialité ou rubrique en sections)<select name="rangement"><option value="">Automatique (d’après le nom)</option>${[['animations', 'Nos animations'], ['corbeilles', 'Nos corbeilles de fruits'], ['pieces-montees', 'Nos pièces montées'], ['buffets', 'Nos buffets'], ['mezzes-froids', 'Nos mezzés froids à l’unité'], ['mezzes-chauds', 'Nos mezzés chauds à l’unité'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['fromages', 'Nos fromages'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité'], ['location', 'En location']].map(([k, t]) => `<option value="${k}"${p.rangement === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <div class="sp-edit"><span class="sp-lab">Description sous la photo <small class="muted">(s’affiche juste sous la photo de la page produit. Au collage, les lignes vides sont retirées ; une ligne vide que vous ajoutez avec Entrée reste visible.)</small></span>
          <div class="sp-barre"><button type="button" class="btn ghost sm ia-btn" data-sp-ia title="L’IA propose une version enrichie ; relisez puis enregistrez">✨ Améliorer avec l’IA</button><button type="button" class="btn ghost sm" data-gras title="Mettre la sélection en gras (ou l’enlever)"><b>G</b> Gras</button><button type="button" class="btn ghost sm" data-titres-gras title="Met en gras les lignes écrites tout en MAJUSCULES">Titres en MAJUSCULES en gras</button><button type="button" class="btn ghost sm" data-sans-gras title="Retire le gras de la sélection (ou de tout le texte)">Retirer le gras</button></div>
          <div class="sp-zone" contenteditable="true" role="textbox" aria-multiline="true" data-sp-edit data-vide="Ex. NOS MINI PIÈCES puis, à la ligne, pain polaire - saumon fumé - fromage frais"></div>
          <textarea name="sousPhoto" hidden>${esc((p.sousPhoto || []).join('\n'))}</textarea></div>
          <label>Accroche (cartes et Google)<textarea name="extrait" rows="2">${esc(p.extrait || '')}</textarea></label>
          <label>Description (un paragraphe par ligne)<textarea name="description" rows="4" data-colle>${esc((p.description || []).join('\n'))}</textarea></label>
          <div class="ia-ligne"><button type="button" class="btn ghost sm ia-btn" data-desc-ia>✨ Améliorer la description avec l’IA</button><small class="muted">L’IA propose une version enrichie ; relisez-la puis enregistrez.</small></div>
          ${seoBloc('produit', p.seoTitre, p.seoDescription, ` data-id="${esc(p.id || p.slug)}"`)}
        </section>
        <section class="box"><h2>Prix et quantités</h2>${peut('prix') ? '' : '<p class="muted sm">🔒 Les prix sont verrouillés pour votre compte (droit « Modifier les prix »).</p>'}
          <label>Prix TTC (€) <small>vide = « Sur devis »</small><input name="prix" value="${fromCents(p.prixCents)}" inputmode="decimal"${peut('prix') ? '' : ' readonly class="verrou"'}></label>
          <div class="g2"><label>Par<select name="unite">${[...new Set([p.unite || '', ...UNITES])].map(u => `<option${u === (p.unite || '') ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
          <label>Contenu <small>ex. « 4 brochettes », vide = rien d’affiché</small><input name="contenuPortion" value="${esc(p.contenuPortion || '')}" placeholder="4 brochettes"></label></div>
          <div class="g2"><label>Minimum<select name="min">${[...new Set([1, 2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, p.min || 1])].sort((a, b) => a - b).map(n => `<option${n === (p.min || 1) ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="g2"><label>Coût de revient TTC (€) <small>pour la marge</small><input name="cout" value="${fromCents(p.coutCents)}" inputmode="decimal"${peut('prix') ? '' : ' readonly class="verrou"'}></label>
          <label>TVA<select name="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+(p.tva ?? 10) === t ? ' selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label></div>
          <label class="chk"><input type="checkbox" name="r_personnel" ${p.regles?.personnel ? 'checked' : ''}> Proposer le personnel de service</label>
          <label class="chk"><input type="checkbox" name="r_packs" ${p.regles?.packs ? 'checked' : ''}> Proposer les packs traiteur</label>
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
      <section class="box"><h2>Choix proposés au client</h2><p class="muted sm">Un groupe par bloc : première ligne « Titre du groupe | nombre de choix max | exact ou max », puis une option par ligne « Nom | supplément TTC en € ».</p>
        <textarea name="groupes" rows="8" class="mono">${esc((p.groupes || []).map(g => `${g.titre || ''} | ${g.max || ''} | ${g.exact ? 'exact' : 'max'}${g.facultatif ? ' | facultatif' : ''}\n${(g.options || []).map(o => `${o.label}${o.supCents ? ' | ' + fromCents(o.supCents) : ''}`).join('\n')}`).join('\n\n'))}</textarea>
        ${(p.variantes || []).length && (p.groupes || []).length ? `<h3 class="fg-t">Groupes proposés selon la formule</h3><p class="muted sm">Quand le client choisit une formule, seuls les groupes cochés pour cette formule restent affichés ; les autres disparaissent et leurs choix sont retirés. (Après avoir ajouté un groupe ou une formule, enregistrez pour le voir ici.)</p>
        <div class="fg-wrap"><table class="fg"><thead><tr><th>Groupe</th>${p.variantes.map(v => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${p.groupes.map(g => `<tr><td>${esc(g.titre || '')}</td>${p.variantes.map(v => `<td><input type="checkbox" name="fg" value="${esc(JSON.stringify([g.titre || '', v]))}" ${!(g.variantes || []).length || g.variantes.includes(v) ? 'checked' : ''} aria-label="${esc((g.titre || '') + ' : ' + v)}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}</section>
      <section class="box"><h2>Allergènes</h2><p class="muted sm">Cochez les allergènes présents : ils s’affichent sur la fiche du site, dans un encadré « Allergènes » sous le bouton de devis.</p>${p.allergenesAuto ? '<p class="sm" style="color:#8a5a00">Cochés automatiquement d’après le nom et la composition du plat : à vérifier avec la cuisine. Enregistrez la fiche pour confirmer.</p>' : ''}<div class="allerg">${ALLERGENES.map(a => `<label class="chk"><input type="checkbox" name="al" value="${a}" ${(p.allergenes || []).includes(a) ? 'checked' : ''}> ${a}</label>`).join('')}</div></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button><span class="muted" id="dirty"></span></div>
      </form>`);
  }
  produit.after = id => {
    const p = cache.p, form = $('#pf');
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
      const affiche = l => { ed.innerHTML = l.map(t => `<div>${ligneHtml(t) || '<br>'}</div>`).join(''); ed.classList.toggle('vide', !l.length); };
      const lit = () => {
        /* copie hors écran : le gras devient **…**, puis innerText donne les lignes comme à l'écran */
        const c = ed.cloneNode(true);
        c.querySelectorAll('span[style*="font-weight"]').forEach(x => { if (/bold|[6-9]00/.test(x.style.fontWeight)) { const b = document.createElement('b'); b.append(...x.childNodes); x.replaceWith(b); } });
        /* chaque morceau de texte en gras est entouré d'étoiles (un gras qui couvre plusieurs lignes reste ligne par ligne) */
        const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT), nodes = []; let n;
        while ((n = w.nextNode())) if (n.parentElement.closest('b, strong') && n.nodeValue.trim()) nodes.push(n);
        nodes.forEach(t => { t.nodeValue = '**' + t.nodeValue + '**'; });
        c.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px;white-space:pre-wrap';
        document.body.append(c); const txt = c.innerText; c.parentNode.removeChild(c);
        return lignesSousPhoto(txt.replace(/\*\*\*\*/g, '').replace(/\*\*([ \t]+)\*\*/g, '$1').split('\n').map(l => l.replace(/\*\*(\s+)/g, '$1**').replace(/(\s+)\*\*/g, '**$1').replace(/^\*\*\*\*$/, '')).join('\n'));
      };
      const sync = () => { ta.value = lit().join('\n'); ed.classList.toggle('vide', !ed.textContent.trim()); };
      affiche(lignesSousPhoto(ta.value));
      try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch {}
      ed.addEventListener('input', () => { sync(); dirty(); });
      /* « ✨ Améliorer avec l'IA » : texte proposé dans l'éditeur, enregistré seulement avec « Enregistrer » */
      const iaTexte = async (btn, champ, lignes, poser) => {
        const lib = btn.textContent; btn.disabled = true; btn.textContent = '✨ L’IA rédige…';
        try {
          const r = await api(A + '/ia/texte-produit', { method: 'POST', body: { id, champ, lignes, titre: form.titre.value, description: form.description.value } });
          poser(r.lignes); dirty(); toast('Proposition de l’IA posée : relisez puis enregistrez.');
        } catch (err) { toast(err.message, true); }
        finally { btn.disabled = false; btn.textContent = lib; }
      };
      $('[data-sp-ia]', form)?.addEventListener('click', e => iaTexte(e.currentTarget, 'sousPhoto', lit(), l => { affiche(l); sync(); }));
      $('[data-desc-ia]', form)?.addEventListener('click', e => iaTexte(e.currentTarget, 'description', form.description.value.split('\n'), l => { form.description.value = l.join('\n'); }));
      ed.addEventListener('paste', e => {
        const txt = e.clipboardData?.getData('text/plain'); if (txt == null) return;
        e.preventDefault();
        const html = lignesNettes(txt).map(esc).join('<br>');
        if (!document.execCommand('insertHTML', false, html)) { const sel = getSelection(); if (sel.rangeCount) { const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createRange().createContextualFragment(html)); } }
        sync(); dirty();
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
        return { ...old, variantes: gv && gv.length && gv.length < vars.length ? gv : null, id: old.id || 'g' + gi, titre, max: +max || null, exact: mode === 'exact', facultatif: fac === 'facultatif', options: b.slice(1).map((o, oi) => { const [label, sup] = o.split('|').map(x => x.trim()); const oo = (old.options || []).find(x => x.label === label) || {}; return { ...oo, id: oo.id || 'o' + oi + '-' + label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30), label, supCents: toCents(sup) || 0 }; }) };
      });
      const next = { ...p, titre: f.get('titre'), rubrique: f.get('rubrique'), sous: f.get('rubrique') === p.rubrique ? (f.get('sous') ?? p.sous ?? '') : '', autresSous: f.get('rubrique') === p.rubrique ? f.getAll('autresSous').filter(x => x !== f.get('sous')) : [], rangement: f.get('rangement') ?? p.rangement ?? '', statut: f.get('statut'), maison: !!f.get('maison'), extrait: f.get('extrait'), seoTitre: String(f.get('seoTitre') || '').trim(), seoDescription: String(f.get('seoDescription') || '').replace(/\s+/g, ' ').trim(), description: lignesNettes(f.get('description')), sousPhoto: lignesSousPhoto(f.get('sousPhoto')),
        prixCents: toCents(f.get('prix')), unite: f.get('unite'), contenuPortion: String(f.get('contenuPortion') || '').trim(), min: +f.get('min') || 1, minimumTexte: '', prixTexte: '', coutCents: toCents(f.get('cout')), tva: +f.get('tva'),
        regles: { ...(p.regles || {}), personnel: f.get('r_personnel') ? (p.regles?.personnel || 'service') : null, packs: !!f.get('r_packs') },
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
    return page(esc(l.nom), `<a class="btn ghost" href="#/lieux">← Lieux</a><a class="btn ghost" href="/lieux/${esc(l.slug)}" target="_blank">Voir ↗</a>`, `<form id="lf2"><div class="cols c21"><section class="box"><label>Nom<input name="nom" value="${esc(l.nom)}"></label><label>Description<textarea name="description" rows="5">${esc(l.description || '')}</textarea></label><div class="g2"><label>Adresse<input name="adresse" value="${esc(l.adresse || '')}"></label><label>Ville<input name="ville" value="${esc(l.ville || '')}"></label></div><label>Équipements (un par ligne)<textarea name="equipements" rows="5">${esc((l.equipements || []).join('\n'))}</textarea></label></section>
      <section class="box"><div class="g2"><label>Statut<select name="statut"><option value="visible">Visible</option><option value="masque"${l.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label><label>Mise en avant<select name="maison"><option value="">Partenaire</option><option value="1"${l.maison ? ' selected' : ''}>Lieu maison (en premier)</option></select></label></div><label>Capacité max<input type="number" name="capacite" value="${esc(l.capacite || '')}"></label><label>Prix affiché<input name="prixTexte" value="${esc(l.prixTexte || '')}" placeholder="Sur devis"></label></section></div>
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
    $('#lf2').addEventListener('submit', async e => { e.preventDefault(); const fd = new FormData(e.target), { typeAutre, ...f } = Object.fromEntries(fd); const type = f.type === '__autre' ? (typeAutre || '').trim() : f.type; const evenements = fd.getAll('evenements'); await api(`${A}/lieux/${id}`, { method: 'PUT', body: { ...l, ...f, type, evenements, maison: !!f.maison, capacite: +f.capacite || null, equipements: f.equipements.split('\n').map(x => x.trim()).filter(Boolean), photos } }); Object.assign(l, { type, departement: f.departement, evenements }); toast('Lieu enregistré.'); });
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
      <section class="box" data-tarifs><h2>Tarifs communs (TTC)${peut('prix') ? '' : ' <span class="pill">🔒 verrouillés pour votre compte</span>'}</h2><div class="g3"><label>Livraison (€ / km aller-retour)<input name="km" value="${fromCents(T.kmCents)}"></label><label>Livraison offerte dès (€ TTC de commande, 0 = jamais)<input name="offerte" inputmode="decimal" value="${fromCents(T.livraisonOfferteCents ?? 70000)}"></label><label>Personnel (€ / heure)<input name="ph" value="${fromCents(T.personnel?.heureCents)}"></label><label>Heures minimum<select name="pmin">${[2, 3, 4, 5, 6].map(n => `<option${(T.personnel?.minHeures || 4) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Petit pack (€ / pers.)<input name="pk0" value="${fromCents(T.packs?.[0]?.prixCents)}"></label><label>Grand pack (€ / pers.)<input name="pk1" value="${fromCents(T.packs?.[1]?.prixCents)}"></label><label>Acompte par défaut<select name="acompte">${[20, 30, 40, 50].map(n => `<option value="${n}"${(T.acomptePct ?? 50) === n ? ' selected' : ''}>${n} %</option>`).join('')}</select></label><label>Paiement total en dessous de (€ TTC)<input name="seuilAcompte" value="${fromCents(T.seuilAcompteCents ?? 80000)}" inputmode="decimal"></label></div></section>
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
        tarifs: { ...T, kmCents: toCents(f.km), livraisonOfferteCents: toCents(f.offerte) ?? 0, acomptePct: +f.acompte, seuilAcompteCents: toCents(f.seuilAcompte) ?? 80000, personnel: { ...(T.personnel || {}), heureCents: toCents(f.ph), minHeures: +f.pmin }, packs: (T.packs || []).map((pk, i) => ({ ...pk, prixCents: toCents(f['pk' + i]) ?? pk.prixCents })) },
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

  /* ---------- médiathèque ---------- */
  async function medias() {
    const m = await api(A + '/actions/medias'); cache.medias = m;
    return page('Médiathèque', '<label class="btn up">+ Envoyer des photos ou vidéos<input type="file" accept="image/*,video/mp4" multiple hidden data-up></label>', `<p class="muted">${m.envoyes.length} fichiers envoyés depuis le back-office · ${m.site.length} photos et vidéos reprises du brouillon. Les photos de téléphone sont réduites automatiquement avant l’envoi.</p>
      <div class="bh"><input type="search" placeholder="Filtrer par nom…" data-mq><span class="muted sm" data-mcount></span></div><div class="mgrid big"></div>`);
  }
  medias.after = () => {
    const m = cache.medias; const filtrer = grilleMedias($('.mgrid.big'), ordreMedias([...m.envoyes, ...m.site]), 'a');
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
      const on = !!d[x.k], grise = lecture || (d.admin && x.k !== 'admin');
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
  async function equipe() {
    const gere = peut('equipe');
    const [users, conf, j, env, R] = await Promise.all([api(A + '/actions/equipe'), api(A + '/actions/droits'), gere ? api(A + '/actions/journal') : null, gere ? api(A + '/actions/envois') : null, gere ? api(A + '/site') : null]);
    cache.droitsConf = conf; cache.equipeUsers = users;
    const DR = conf.droits;
    const moi = users.find(u => u.email === session.email);
    if (gere) {
      const al = R.alertes || {};
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
    return page('Équipe & activité', gere ? '<button type="button" class="btn eq-add" data-nouveau>+ Ajouter une personne</button>' : '', `${nouveau}
      ${gere ? `<section class="box"><h2>Les comptes de l’équipe <small class="muted">(${users.filter(u => !u.desactive).length} actif${users.filter(u => !u.desactive).length > 1 ? 's' : ''})</small></h2><p class="muted sm">Chaque personne a ses propres cases. Un menu non autorisé disparaît de son back-office, et le serveur refuse l’action même si on essaie autrement.</p><ul class="eq-liste">${users.map(carte).join('')}</ul></section>` : ''}
      <div class="cols">
      <section class="box"><h2>Mon compte</h2>${moi ? `<p class="eq-res"><b>Vos droits :</b> ${esc(resumeDroits(moi.droits, DR))}</p>` : ''}
        <form id="pw"><h3>Mon mot de passe</h3><div class="g2"><label>Actuel<input type="password" name="current" required></label><label>Nouveau (10 caractères min.)<input type="password" name="password" minlength="10" required></label></div><button class="btn ghost">Changer</button></form></section>
      ${gere ? `<section class="box pli${plie('journal') ? ' ferme' : ''}" data-pli="journal"><h2><button type="button" class="pli-btn" data-plibtn aria-expanded="${!plie('journal')}"><span class="pli-fl" aria-hidden="true">▼</span>Journal d’activité <span class="pill ${j.intact ? 'd-accepte' : 'd-refuse'}">${j.intact ? 'intact' : 'ALTÉRÉ'}</span><small class="pli-nb">${j.total} action${j.total > 1 ? 's' : ''}</small></button></h2><div class="pli-corps"><p class="muted sm">Chaque action est enregistrée et chaînée : une modification du journal se verrait.</p><ul class="journal">${j.lignes.map(l => `<li><time>${dateH(l.at)}</time> <b>${esc(l.who)}</b> ${esc(l.op)} <small>${esc(l.resume || l.path)}</small></li>`).join('')}</ul></div></section>` : ''}</div>
      ${gere ? `<section class="box"><h2>Alertes de l’équipe</h2><p class="muted sm">Ces personnes sont prévenues à chaque nouvelle demande (e-mail et SMS) et reçoivent le récapitulatif des dossiers sans action depuis 24 h.</p><div id="alp"></div><div class="row"><button type="button" class="btn ghost sm" data-addal>+ Ajouter une personne à prévenir</button><button type="button" class="btn sm" data-saveal>Enregistrer les alertes</button></div></section>
      <section class="box pli${plie('envois') ? ' ferme' : ''}" data-pli="envois"><h2><button type="button" class="pli-btn" data-plibtn aria-expanded="${!plie('envois')}"><span class="pli-fl" aria-hidden="true">▼</span>E-mails et SMS envoyés ${env.live ? '' : '<span class="pill d-envoye">mode test : Brevo non branché</span>'}<small class="pli-nb">${env.envois.length} envoi${env.envois.length > 1 ? 's' : ''}</small></button></h2><div class="pli-corps"><div class="row"><input type="tel" data-testtel placeholder="Portable pour un SMS d’essai (sinon : ceux des alertes)" style="max-width:320px"><button class="btn ghost sm" data-test>Envoyer un essai</button></div><ul class="journal">${env.envois.map(e => `<li><time>${dateH(e.at)}</time> ${e.kind === 'sms' ? 'SMS' : 'E-mail'} → <b>${esc(e.kind === 'sms' ? e.payload.recipient : e.payload.to?.[0]?.email)}</b> <small>${esc(e.kind === 'sms' ? e.payload.content : e.payload.subject)}</small>${e.result?.error ? ` <span class="pill d-refuse">refusé : ${esc(e.result.error)}</span>` : e.live && e.result && e.result !== 'test' ? ' <span class="pill d-accepte">accepté par Brevo</span>' : ''}</li>`).join('') || '<li class="muted">Aucun envoi.</li>'}</ul></div></section>` : ''}`);
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
  const drawAl = () => { $('#alp').innerHTML = alertePers.map((x, i) => `<div class="g3 alp" data-i="${i}"><label>Nom<input data-k="nom" value="${esc(x.nom || '')}" placeholder="Prénom Nom"></label><label>Portable (SMS)<input type="tel" data-k="tel" value="${esc(x.tel || '')}" placeholder="06 12 34 56 78"></label><label>E-mail<input type="email" data-k="email" value="${esc(x.email || '')}"></label><button type="button" class="lnk" data-delal="${i}">Retirer</button></div>`).join('') || '<p class="muted sm">Personne n’est prévenu pour l’instant.</p>'; };
  const lireAl = () => { $$('#alp .alp').forEach(row => { const x = alertePers[+row.dataset.i]; row.querySelectorAll('[data-k]').forEach(inp => { x[inp.dataset.k] = inp.value.trim(); }); }); return alertePers; };
  equipe.after = () => {
    $('#pw').addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Mot de passe changé.'); e.target.reset(); } catch (err) { toast(err.message, true); } });
    if (!peut('equipe')) return;
    const DR = cache.droitsConf.droits;
    drawAl();
    $('[data-addal]')?.addEventListener('click', () => { lireAl(); alertePers.push({ nom: '', tel: '', email: '' }); drawAl(); $$('#alp [data-k="nom"]').pop()?.focus(); });
    $('#alp')?.addEventListener('click', e => { const b = e.target.closest('[data-delal]'); if (!b) return; lireAl(); alertePers.splice(+b.dataset.delal, 1); drawAl(); });
    $('[data-saveal]')?.addEventListener('click', async () => {
      const L = lireAl().filter(x => x.nom || x.tel || x.email);
      try { await api(A + '/site', { method: 'PUT', body: { alertes: { personnes: L, emails: L.map(x => x.email).filter(Boolean).join(', '), sms: L.map(x => x.tel).filter(Boolean).join(', ') } } }); if (cache.R) cache.R.alertes = { personnes: L, emails: L.map(x => x.email).filter(Boolean).join(', '), sms: L.map(x => x.tel).filter(Boolean).join(', ') }; toast('Alertes enregistrées.'); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-test]')?.addEventListener('click', essaiEnvoi);
    /* « + Ajouter une personne » */
    const box = $('#eqNouveau'), cases = $('[data-casesnu]');
    const montrer = v => { box.hidden = !v; if (v) { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); $('input[name=prenom]', box).focus(); } };
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
      const ix = { code: col(/^code/i), prix: col(/^prix/i), min: col(/^minimum/i), cout: col(/^co[uû]t/i), tva: col(/^tva/i), statut: col(/^statut/i), maison: col(/^maison/i) };
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
