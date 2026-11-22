/* Back-office Magnolia Traiteur (application d'une seule page, sans dépendance). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = c => c == null || c === '' ? '—' : (Math.round(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €';
  const toCents = v => { const n = parseFloat(String(v ?? '').replace(/\s|€/g, '').replace(',', '.')); return isNaN(n) ? null : Math.round(n * 100); };
  const fromCents = c => c == null ? '' : (c / 100).toFixed(2).replace('.', ',');
  const dateFr = (d, o = { day: 'numeric', month: 'short', year: 'numeric' }) => { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T12:00' : d); return isNaN(x) ? '—' : x.toLocaleDateString('fr-FR', o); };
  const dateH = d => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => { t.className = 'toast'; }, 3800); };
  async function api(url, { method = 'GET', body, form } = {}) {
    const r = await fetch(url, { method, headers: form ? { 'x-mg': '1' } : { 'content-type': 'application/json', 'x-mg': '1' }, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { session = null; render(); throw new Error('Connexion requise.'); }
    if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
    return j;
  }
  const A = '/api/admin';
  const STATUTS = { demande: 'Demande', devis_envoye: 'Devis envoyé', relance: 'Relance', accord: 'Accord', reserve: 'Réservé', refuse: 'Refusé', termine: 'Terminé' };
  const DSTAT = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Signé', refuse: 'Refusé' };
  const UNITES = ['personne', 'pièce', 'portion', 'plateau', 'coffret', 'corbeille', 'gâteau', 'forfait', 'prestation', 'heure', 'location', 'bouteille', 'lot de 6', 'conditionnement', 'litre', 'table', 'chaise', 'km', 'unité'];
  const ALLERGENES = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];
  let session = null, cache = {};

  /* ---------- structure ---------- */
  /* menu « Espace équipe » comme Je Privatise : CRM regroupe Demandes de devis, Suivi client, Devis et Factures */
  const CRM = ['demandes', 'suivi', 'devis', 'factures'];
  const MENU = [
    ['', 'Tableau de bord'],
    ['crm', 'CRM'],
    ['demandes', 'Demandes de devis'],
    ['suivi', 'Suivi client'],
    ['devis', 'Devis'],
    ['factures', 'Factures'],
    ['agenda', 'Agenda'],
    ['clients', 'Clients'],
    ['-'],
    ['catalogue', 'Catalogue'],
    ['lieux', 'Lieux'],
    ['site', 'Photos & textes du site'],
    ['avis', 'Avis clients'],
    ['medias', 'Médiathèque'],
    ['-'],
    ['equipe', 'Équipe & activité'],
    ['outils', 'Outils'],
  ];
  const mem = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* */ } } };
  function shell(inner, cur) {
    const open = CRM.includes(cur) || mem.get('mg_crm') === '1';
    const nb = cache.nouvelles ? String(cache.nouvelles) : '';
    const item = m => m[0] === '-' ? '<hr>'
      : m[0] === 'crm' ? `<button type="button" class="chip crm-btn" data-tab="crm" data-crm aria-expanded="${open}" title="Demandes de devis, Suivi client, Devis, Factures">CRM<span>${nb}</span></button>`
      : `<a href="#/${m[0]}" data-tab="${m[0]}" class="chip${CRM.includes(m[0]) ? ' crm-sub' : ''}${cur === m[0] ? ' on' : ''}"${cur === m[0] ? ' aria-current="page"' : ''}>${m[1]}${m[0] === 'demandes' ? `<span>${nb}</span>` : ''}</a>`;
    return `<div class="bo">
      <aside class="side" id="side"><a class="logo" href="#/"><img src="/brand/monogramme.svg" alt=""><span>Magnolia<small>Back-office</small></span></a>
      <nav class="tabs${open ? ' crm-open' : ''}"><p class="tabs-lab">Espace équipe</p>${MENU.map(item).join('')}</nav>
      <div class="me"><span>${esc(session.nom || session.email)}<small>${session.role === 'manager' ? 'Manager' : 'Collaborateur'}</small></span><a href="/" target="_blank">Voir le site ↗</a><button class="lnk" data-logout>Déconnexion</button></div></aside>
      <div class="main"><header class="mtop"><button class="burger" data-burger aria-label="Menu">☰</button><span class="mtitle">${esc((MENU.find(m => m[0] === cur) || [, ''])[1])}</span></header><div class="content">${inner}</div></div></div>`;
  }
  const page = (titre, actions, body) => `<div class="ph"><h1>${titre}</h1><div class="pa">${actions || ''}</div></div>${body}`;

  /* ---------- routeur ---------- */
  async function render() {
    if (!session) {
      try { const s = await fetch('/api/session').then(r => r.json()); if (s.connecte) session = s; } catch { /* */ }
    }
    if (!session) return login();
    const [route, id, sub] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    const views = { '': dashboard, demandes, suivi, devis, factures, agenda, clients, catalogue, produit, lieux, lieu, site, avis, medias, equipe, outils };
    const fn = route === 'catalogue' && id ? produit : route === 'lieux' && id ? lieu : views[route] || dashboard;
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
  async function dashboard() {
    const s = await api(A + '/stats');
    cache.nouvelles = s.nouvelles;
    const kpi = (v, l, href) => `<a class="kpi" href="${href || '#/'}"><b>${v}</b><span>${l}</span></a>`;
    return page(`Bonjour ${esc((session.nom || '').split(' ')[0])}`, `<a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>`, `
      <div class="kpis">${kpi(s.nouvelles, 'nouvelles demandes', '#/demandes')}${kpi(euros(s.caSigneMoisCents), 'signé ce mois-ci', '#/devis')}${kpi(euros(s.devisEnAttenteCents), 'devis en attente de signature', '#/suivi')}${kpi(euros(s.facturesImpayeesCents), 'factures à encaisser', '#/factures')}${kpi(s.tauxSignature == null ? '—' : s.tauxSignature + ' %', 'taux de signature', '#/suivi')}</div>
      <div class="cols">
        <section class="box"><h2>Suivi client</h2><div class="pipe">${Object.entries(STATUTS).filter(([k]) => k !== 'termine').map(([k, l]) => `<a href="#/suivi" class="pipe-i st-${k}"><b>${s.parStatut[k] || 0}</b><span>${l}</span></a>`).join('')}</div></section>
        <section class="box"><h2>Prochains événements</h2>${s.prochains.length ? `<ul class="list">${s.prochains.map(p => `<li><a href="#/demandes/${p.id}"><b>${dateFr(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${esc(p.nom)} · ${p.invites} pers.</a><span class="pill st-${p.statut}">${STATUTS[p.statut]}</span></li>`).join('')}</ul>` : '<p class="muted">Aucun événement confirmé à venir.</p>'}</section>
        <section class="box"><h2>Devis à relancer</h2>${s.aRelancer.length ? `<ul class="list">${s.aRelancer.map(d => `<li><a href="#/devis/${d.id}"><b>${esc(d.numero)}</b> ${esc(d.client)}</a><span class="muted">envoyé le ${dateFr(d.envoyeLe)}</span></li>`).join('')}</ul>` : '<p class="muted">Rien à relancer : bravo.</p>'}</section>
      </div>`);
  }

  /* ---------- demandes ---------- */
  /* une demande dont le devis est parti passe dans « Suivi client » : ici, seulement celles qui attendent encore leur devis */
  const aTraiter = (d, dv) => d.type !== 'contact' && !d.classee && d.statut === 'demande' && !dv.some(x => x.demandeId === d.id && x.statut !== 'brouillon');
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
    return page('Demandes de devis', '<a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', `
      <p class="muted intro">Les demandes envoyées depuis « Ma sélection » arrivent ici, avec une alerte par e-mail. Dès que leur devis est parti, elles passent dans « Suivi client ».</p>
      <div class="qs-top"><div class="qs-chips">${onglet('todo', 'À traiter', todo.length)}${onglet('msg', 'Messages', msgs.length)}${onglet('done', 'Déjà traitées', done.length)}</div></div>
      ${shown.length ? `<div class="table jp"><table><thead><tr><th>Reçue</th><th>Client</th><th>Événement</th><th>Date</th><th class="n">Invités</th><th>Sélection et message</th><th></th></tr></thead><tbody>${shown.map(row).join('')}</tbody></table></div>`
        : `<div class="vide"><p>${voir === 'todo' ? (list.length ? 'Aucune demande en attente : toutes ont reçu leur devis. Leur suivi est dans « Suivi client ».' : 'Aucune demande de devis pour l’instant.') : 'Rien ici pour l’instant.'}</p></div>`}`);
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
        <section class="box"><h2>Client</h2><p><b>${esc(d.contact?.nom)}</b>${d.contact?.societe ? '<br>' + esc(d.contact.societe) : ''}<br><a href="mailto:${esc(d.contact?.email)}">${esc(d.contact?.email)}</a><br><a href="tel:${esc(d.contact?.tel)}">${esc(d.contact?.tel)}</a></p><p><a class="lnk" href="#/clients/${d.clientId}">Fiche client →</a></p></section>
        <section class="box"><h2>Événement</h2><p><b>${esc(d.evenement?.type)}</b> · ${dateFr(d.evenement?.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}<br>${d.evenement?.invites || '?'} invités · ${esc(d.evenement?.cp)} ${esc(d.evenement?.ville)}<br>${esc(d.evenement?.horaire)}${d.livraison ? `<br>Livraison estimée : ${d.livraison.km} km A/R · ${euros(d.livraison.cents)}` : ''}</p></section>
        <section class="box"><h2>Suivi</h2><label>Statut<select data-statut>${Object.entries(STATUTS).map(([k, l]) => `<option value="${k}"${d.statut === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <ul class="histo">${(d.historique || []).map(h => `<li>${dateH(h.at)} · ${STATUTS[h.statut] || h.statut} <small>${esc(h.par || '')}</small></li>`).join('')}</ul></section>
      </div>
      ${d.message ? `<section class="box"><h2>Message du client</h2><p class="pre">${esc(d.message)}</p></section>` : ''}
      ${(d.lignes || []).length ? `<section class="box"><h2>Sélection du client</h2><div class="table"><table><thead><tr><th>Prestation</th><th>Choix</th><th class="n">Qté</th><th class="n">Estimé</th></tr></thead><tbody>${d.lignes.map(l => `<tr><td><b>${esc(l.titre)}</b>${l.variante ? `<small>${esc(l.variante)}</small>` : ''}</td><td>${esc(l.resume)}${l.personnel ? `<small>+ personnel ${l.personnel.nb} × ${l.personnel.heures} h</small>` : ''}${l.pack ? `<small>+ pack ${esc(l.pack.id)}</small>` : ''}${l.note ? `<small>Note : ${esc(l.note)}</small>` : ''}</td><td class="n">${l.qte} ${esc(l.unite)}</td><td class="n">${l.surDevis ? 'sur devis' : euros(l.totalCents)}</td></tr>`).join('')}<tr class="tot"><td colspan="3">Total estimé (livraison comprise)</td><td class="n">${euros(d.totalEstimeCents)}</td></tr></tbody></table></div></section>` : ''}
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
    return { d, dv, main, envoyeLe, relances, late, last, montant, cat, at, estime: !main };
  }
  async function suivi() {
    const [dem, devisL, eq] = await Promise.all([api(A + '/demandes'), api(A + '/devis'), api(A + '/actions/equipe').catch(() => [])]);
    cache.devisL = devisL; cache.equipe = eq.filter(u => !u.desactive);
    cache.opps = dem.filter(d => d.type !== 'contact').map(d => opportunite(d, devisL));
    return page('Suivi client', '<a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', '<div id="qs"></div>');
  }
  const SV = { p: 'all', o: '', f: 'all', s: '', d1: '', d2: '' };
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
    const owner = o => o.d.commercial || '';
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
    const owners = [...new Set([...(cache.equipe || []).map(u => u.nom).filter(Boolean), ...all.map(owner).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'fr'));
    const arch = SV.f === 'ok' || SV.f === 'ko';
    box.innerHTML = `<div class="qs-owners"><div class="qs-orow"><span class="qs-olab">Période</span>${[['all', 'Tout'], ['mois', 'Mois en cours'], ['mprec', 'Mois dernier'], ['trim', 'Trimestre'], ['an', 'Année'], ['dates', 'De date à date']].map(([k, l]) => `<button type="button" class="qs-own-b${SV.p === k ? ' on' : ''}" data-qp="${k}">${l}</button>`).join('')}${SV.p === 'dates' ? `<span class="qs-dates">du <input type="date" data-qd="d1" value="${esc(SV.d1)}"> au <input type="date" data-qd="d2" value="${esc(SV.d2)}"></span>` : ''}</div>
      <div class="qs-orow"><span class="qs-olab">Commercial</span><button type="button" class="qs-own-b${!SV.o ? ' on' : ''}" data-qo="">Tous</button>${owners.map(n => `<button type="button" class="qs-own-b${SV.o === n ? ' on' : ''}" data-qo="${esc(n)}">${esc(n)}</button>`).join('')}<button type="button" class="qs-own-b${SV.o === '—' ? ' on' : ''}" data-qo="—">Non attribués</button></div>
      <div class="qs-osum"><span><b>${base.length}</b> opportunité${base.length > 1 ? 's' : ''}</span><span><b>${signes.length}</b> signée${signes.length > 1 ? 's' : ''}</span><span><b>${perdus.length}</b> refusée${perdus.length > 1 ? 's' : ''}</span><em>${euros(sum(signes, o => o.montant))} signés</em></div></div>
      <div class="kpis qk">${kpis.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <div class="qs-top"><div class="qs-chips">${arch ? `<button type="button" class="qs-chip" data-qf="all">← Opportunités en cours <b>${cnt('all')}</b></button><span class="qs-title">${SV.f === 'ok' ? 'Opportunités réservées' : 'Opportunités refusées (classées)'}</span>`
        : [['all', 'En cours'], ['late', '⚠ À relancer'], ['sent', 'Envoyées'], ['acc', 'Attente d’acompte'], ['draft', 'En préparation']].map(([k, l]) => `<button type="button" class="qs-chip${SV.f === k ? ' on' : ''}${k === 'late' && cnt('late') ? ' hot' : ''}" data-qf="${k}">${esc(l)} <b>${cnt(k)}</b></button>`).join('')
          + `<span class="qs-sp"></span><button type="button" class="qs-arch ok" data-qf="ok">Voir les opportunités réservées <b>${cnt('ok')}</b></button><button type="button" class="qs-arch ko" data-qf="ko">Voir les opportunités refusées <b>${cnt('ko')}</b></button>`}</div>
        <input class="qs-search" type="search" data-qs placeholder="🔍 Rechercher : nom, société, n° de devis…" aria-label="Rechercher un client" value="${esc(SV.s)}"></div>
      <div id="qsList">${list.length ? list.map(carte).join('') : `<div class="vide"><p>${all.length ? 'Aucune opportunité ici.' : 'Aucune demande pour l’instant. Les demandes envoyées depuis le site et les devis créés ici apparaissent dans ce suivi.'}</p></div>`}</div>`;
  }
  const d1 = x => x ? new Date(x).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const etape = (cls, label, sub, mark) => `<div class="qs-st ${cls}"><div class="qs-dot">${mark || ''}</div><b>${esc(label)}</b><i>${esc(sub || '—')}</i></div>`;
  const btnEtape = (o, k, html) => o.d.statut === 'refuse' ? html : `<button type="button" class="qs-stb" data-qstep="${k}" data-q="${o.d.id}" title="Cliquer pour mettre à jour">${html}</button>`;
  function frise(o) {
    const st = o.d.statut, decided = ['accord', 'reserve', 'termine', 'refuse'].includes(st), sent = !!o.envoyeLe;
    const out = [etape('done', 'Demande', d1(o.d.createdAt) + (o.d.lignes ? ' · site' : ''), '✓')];
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
    if (o.cat === 'draft') return `<span class="qs-tag t-draft">${o.main ? 'Devis en préparation' : 'Nouvelle demande'}</span>`;
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
        <div class="qs-co"><button type="button" class="qs-own-pick${o.d.commercial ? '' : ' none'}" data-qown="${o.d.id}" title="Attribuer ou changer le commercial">👤 ${esc(o.d.commercial || 'Non attribué')} <span aria-hidden="true">▾</span></button></div>
        <div class="qs-ev">${e.type ? '<b>' + esc(e.type) + '</b> · ' : ''}${esc([e.date ? dateFr(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) : 'date à définir', e.invites ? e.invites + ' pers.' : '', e.ville || ''].filter(Boolean).join(' · '))}</div></div></div>
      <div class="qs-right"><div class="qs-amt">${o.montant ? euros(o.montant) : '—'}</div><div class="qs-ht">TTC · ${o.main ? 'devis n° ' + esc(o.main.numero) : 'estimation du site'}</div></div>
      ${frise(o)}
      <div class="qs-foot"><div class="qs-info">${o.d.notes ? `<div class="qs-note">📝 ${esc(String(o.d.notes).slice(0, 140))}</div>` : ''}</div><div class="qs-acts">${o.late ? '' : icons}${['refuse', 'reserve', 'termine'].includes(o.d.statut) ? `<button class="qs-back" type="button" data-qback="${o.d.id}" title="Remettre dans les opportunités en cours">↺ Remettre en cours</button>` : ''}${o.main && o.main.statut !== 'brouillon' ? `<a class="qs-back" href="/devis/${esc(o.main.token)}" target="_blank" title="Le devis tel que le client le voit">📨 ${o.main.statut === 'accepte' ? 'Devis signé' : 'Devis envoyé'}</a>` : ''}<button class="qs-open" type="button" data-qopen="${o.d.id}">${o.cat === 'draft' ? 'Terminer' : 'Ouvrir'}</button></div></div>
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
    box.addEventListener('change', e => { const i = e.target.closest('[data-qd]'); if (i) { SV[i.dataset.qd] = i.value; SV.p = 'dates'; suiviDessin(); } });
    box.addEventListener('click', async e => {
      const t = e.target.closest('button,a'); const o = id => (cache.opps || []).find(x => x.d.id === id);
      if (t?.dataset.qp != null) { SV.p = t.dataset.qp; return suiviDessin(); }
      if (t?.dataset.qo != null) { SV.o = t.dataset.qo; return suiviDessin(); }
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
        const x = o(t.dataset.qown), noms = (cache.equipe || []).map(u => u.nom).filter(Boolean);
        const pop = document.createElement('div'); pop.className = 'qs-om';
        pop.innerHTML = noms.map(n => `<button type="button" data-n="${esc(n)}"${n === x.d.commercial ? ' class="on"' : ''}>${esc(n)}</button>`).join('') + '<button type="button" data-n="">Non attribué</button>';
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

  /* ---------- devis ---------- */
  async function devis(id) {
    if (id === 'nouveau') { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: {} }); location.replace('#/devis/' + r.id); return ''; }
    if (id) return devisEdit(id);
    const list = (await api(A + '/devis')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return page('Devis', '<a class="btn" href="#/devis/nouveau">+ Nouveau devis</a>', list.length ? `<div class="table"><table><thead><tr><th>N°</th><th>Client</th><th>Événement</th><th class="n">Total TTC</th><th>Statut</th><th>Vu par le client</th></tr></thead><tbody>
      ${list.map(d => `<tr data-href="#/devis/${d.id}"><td><b>${esc(d.numero)}</b></td><td>${esc(d.clientNom)}</td><td>${esc(d.evenement?.type || '')} ${dateFr(d.evenement?.date)}</td><td class="n">${euros(tot(d).ttc)}</td><td><span class="pill d-${d.statut}">${DSTAT[d.statut]}</span></td><td>${d.vuLe ? dateH(d.vuLe) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="vide"><p>Aucun devis.</p><p class="muted">Créez un devis depuis une demande (les lignes sont reprises) ou partez d’un devis vierge.</p></div>');
  }
  devis.after = id => { if (id && id !== 'nouveau') return devisEdit.after(id); $$('tr[data-href]').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; })); };

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

  async function devisEdit(id) {
    const [d, clientsL, cat] = await Promise.all([api(A + '/devis/' + id), api(A + '/clients'), cache.produits ? cache.produits : api(A + '/produits')]);
    cache.produits = cat; cache.devis = d; cache.clients = clientsL;
    const modeles = await api(A + '/modeles');
    const signe = d.statut === 'accepte';
    const lock = signe && session.role !== 'manager';
    return page(`Devis ${esc(d.numero)} <span class="pill d-${d.statut}">${DSTAT[d.statut]}</span>`, `<a class="btn ghost" href="#/devis">← Devis</a>${d.statut !== 'brouillon' ? `<a class="btn ghost" href="/devis/${d.token}" target="_blank">Voir comme le client ↗</a>` : ''}`, `
      ${signe ? `<p class="okbox">✓ Signé en ligne par <b>${esc(d.signature?.nom)}</b> le ${dateH(d.signature?.at)}.${lock ? ' Seul le Manager peut le modifier.' : ''}</p>` : ''}
      <form id="dv" class="${lock ? 'lock' : ''}">
      <div class="cols">
        <section class="box"><h2>Client</h2><label>Client<select name="clientId"><option value="">— Choisir —</option>${clientsL.sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map(c => `<option value="${c.id}"${c.id === d.clientId ? ' selected' : ''}>${esc(c.nom)} · ${esc(c.email)}</option>`).join('')}</select></label><p class="muted sm"><a href="#/clients/nouveau">+ Nouveau client</a></p></section>
        <section class="box"><h2>Événement</h2><div class="g2"><label>Type<select name="ev_type">${['Anniversaire', 'Fête de famille', 'Entreprise', 'Mariage', 'Baptême', 'Cocktail', 'Autre'].map(e => `<option${d.evenement?.type === e ? ' selected' : ''}>${e}</option>`).join('')}</select></label><label>Date<input type="date" name="ev_date" value="${esc(d.evenement?.date || '')}"></label><label>Invités<input type="number" name="ev_invites" value="${esc(d.evenement?.invites || '')}"></label><label>Lieu<input name="ev_lieu" value="${esc(d.evenement?.lieu || '')}"></label></div></section>
        <section class="box"><h2>Conditions</h2><div class="g2"><label>Valable jusqu’au<input type="date" name="validiteJusquau" value="${esc(d.validiteJusquau || '')}"></label><label>Acompte<select name="acomptePct">${[0, 20, 30, 40, 50, 100].map(p => `<option value="${p}"${(d.acomptePct ?? 30) === p ? ' selected' : ''}>${p} %</option>`).join('')}</select></label></div>
          <label>Lien de paiement de l’acompte <small>(SumUp, Stripe, banque…)</small><input name="lienPaiement" value="${esc(d.lienPaiement || '')}" placeholder="https://"></label></section>
      </div>
      <section class="box"><label>Texte d’introduction<textarea name="intro" rows="2">${esc(d.intro || '')}</textarea></label></section>
      <section class="box"><div class="bh"><h2>Lignes du devis</h2><div class="row"><select data-addprod class="wide"><option value="">+ Ajouter une prestation du catalogue…</option>${cat.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre)).map(p => `<option value="${esc(p.slug)}">${esc(p.titre)} · ${p.prixCents == null ? 'sur devis' : euros(p.prixCents)}</option>`).join('')}</select><button type="button" class="btn ghost sm" data-addline>+ Ligne libre</button><button type="button" class="btn ghost sm" data-addtitle>+ Titre</button></div></div>
        <div class="table"><table class="lines"><thead><tr><th></th><th>Désignation</th><th class="n">Qté</th><th>Unité</th><th class="n">PU TTC</th><th class="n">Coût TTC</th><th>TVA</th><th class="n">Total TTC</th><th></th></tr></thead><tbody id="lines"></tbody></table></div>
        <div class="totbox"><div class="g2"><label>Remise TTC (€)<input name="remise" value="${fromCents(d.remiseCents || 0)}" inputmode="decimal"></label></div><dl id="totaux"></dl></div></section>
      <section class="box"><label>Conditions particulières<textarea name="conditions" rows="2">${esc(d.conditions || '')}</textarea></label></section>
      <div class="actions sticky"><button class="btn" type="submit">Enregistrer</button><span class="muted" id="dirty"></span></div>
      </form>
      <div class="cols">
        <section class="box"><h2>Envoyer au client</h2><label>Message (facultatif)<textarea rows="3" id="msg" placeholder="Bonjour, voici votre devis…"></textarea></label><div class="row"><label class="chk"><input type="checkbox" id="c-mail" checked> E-mail</label><label class="chk"><input type="checkbox" id="c-sms"> SMS</label></div><button class="btn" data-send>${d.statut === 'brouillon' ? 'Envoyer le devis' : 'Renvoyer le devis'}</button>
          ${(d.envois || []).length ? `<ul class="histo">${d.envois.map(e => `<li>${dateH(e.at)} · ${e.canaux.join(' + ')} <small>${esc(e.par)}</small></li>`).join('')}</ul>` : ''}</section>
        <section class="box"><h2>Relancer</h2><select id="mod">${modeles.map(m => `<option value="${m.id}">${esc(m.nom)}</option>`).join('')}</select><button class="btn ghost" data-relance ${d.statut !== 'envoye' ? 'disabled' : ''}>Envoyer la relance</button>${(d.relances || []).length ? `<ul class="histo">${d.relances.map(r => `<li>${dateH(r.at)} · ${esc(r.modele)}</li>`).join('')}</ul>` : ''}</section>
        <section class="box"><h2>Facturer</h2>${signe ? `<div class="row"><button class="btn ghost" data-fac="acompte">Facture d’acompte</button><button class="btn ghost" data-fac="solde">Facture de solde</button><button class="btn ghost" data-fac="totale">Facture totale</button></div>` : '<p class="muted">Possible dès que le client a signé.</p>'}</section>
      </div>`);
  }
  devisEdit.after = id => {
    const d = cache.devis, form = $('#dv');
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
      $('#totaux').innerHTML = `${t.remise ? `<div><dt>Sous-total</dt><dd>${euros(t.brut)}</dd></div><div><dt>Remise</dt><dd>− ${euros(t.remise)}</dd></div>` : ''}${Object.entries(t.tva).map(([k, v]) => `<div class="sm"><dt>dont TVA ${String(k).replace('.', ',')} %</dt><dd>${euros(v)}</dd></div>`).join('')}<div class="sm"><dt>Total HT</dt><dd>${euros(t.ht)}</dd></div><div class="big"><dt>Total TTC</dt><dd>${euros(t.ttc)}</dd></div>${t.coutConnu ? `<div class="${t.marge < 0 ? 'neg' : 'pos'}"><dt>Marge</dt><dd>${euros(t.marge)} ${t.ttc ? '(' + Math.round(100 * t.marge / t.ttc) + ' %)' : ''}</dd></div>` : ''}<div class="sm"><dt>Acompte ${form.acomptePct.value} %</dt><dd>${euros(Math.round(t.ttc * form.acomptePct.value / 100))}</dd></div>`;
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
    $('[data-addline]').addEventListener('click', () => { lignes.push({ designation: 'Nouvelle ligne', qte: 1, unite: 'forfait', puCents: 0, coutCents: null, tva: 10 }); draw(); dirty(); });
    $('[data-addtitle]').addEventListener('click', () => { lignes.push({ type: 'titre', designation: 'Section' }); draw(); dirty(); });
    $('[data-addprod]').addEventListener('change', e => {
      const p = cache.produits.find(x => x.slug === e.target.value); if (!p) return;
      lignes.push({ designation: p.titre, detail: '', qte: p.min || 1, unite: p.unite || 'unité', puCents: p.prixCents || 0, coutCents: p.coutCents ?? null, tva: p.tva ?? 10, produit: p.slug });
      e.target.value = ''; draw(); dirty();
    });
    form.addEventListener('input', e => { if (!e.target.closest('#lines')) dirty(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const cl = cache.clients.find(c => c.id === f.clientId);
      const next = { ...d, clientId: f.clientId || null, clientNom: cl?.nom || '', evenement: { type: f.ev_type, date: f.ev_date, invites: +f.ev_invites || null, lieu: f.ev_lieu }, validiteJusquau: f.validiteJusquau, acomptePct: +f.acomptePct, lienPaiement: f.lienPaiement, intro: f.intro, conditions: f.conditions, remiseCents: toCents(f.remise) || 0, lignes };
      try { await api(`${A}/devis/${id}`, { method: 'PUT', body: next }); cache.devis = next; $('#dirty').textContent = ''; toast('Devis enregistré.'); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-send]')?.addEventListener('click', async () => {
      if ($('#dirty').textContent) { toast('Enregistrez d’abord vos modifications.', true); return; }
      const canaux = [$('#c-mail').checked && 'email', $('#c-sms').checked && 'sms'].filter(Boolean);
      if (!canaux.length) return toast('Choisissez e-mail et/ou SMS.', true);
      if (!confirm('Envoyer le devis au client maintenant ?')) return;
      try { const r = await api(`${A}/actions/envoyer-devis/${id}`, { method: 'POST', body: { canaux, message: $('#msg').value } }); toast(r.test ? 'Devis prêt (mode test : aucun e-mail réel tant que Brevo n’est pas branché).' : 'Devis envoyé.'); render(); }
      catch (err) { toast(err.message, true); }
    });
    $('[data-relance]')?.addEventListener('click', async () => { try { await api(`${A}/actions/relancer/${id}`, { method: 'POST', body: { modele: $('#mod').value } }); toast('Relance envoyée.'); render(); } catch (err) { toast(err.message, true); } });
    $$('[data-fac]').forEach(b => b.addEventListener('click', async () => { try { const r = await api(`${A}/actions/facture-depuis-devis/${id}`, { method: 'POST', body: { type: b.dataset.fac } }); toast('Facture créée.'); location.hash = '#/factures/' + r.id; } catch (err) { toast(err.message, true); } }));
  };

  /* ---------- factures ---------- */
  async function factures(id) {
    const list = (await api(A + '/factures')).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const f = id && list.find(x => x.id === id);
    const totalF = x => x.totalCents ?? 0;
    return page('Factures', '', `${f ? `<section class="box hl"><h2>Facture ${esc(f.numero)} <span class="pill ${f.payee ? 'd-accepte' : 'd-envoye'}">${f.payee ? 'Payée' : 'À encaisser'}</span></h2><p>${esc(f.client?.nom)} · ${esc(f.objet)} · <b>${euros(totalF(f))}</b></p><div class="row"><a class="btn ghost" href="/facture/${f.token}" target="_blank">Voir / imprimer ↗</a><button class="btn ghost" data-sendf="${f.id}">Envoyer par e-mail</button>${f.payee ? `<button class="btn ghost" data-pay="${f.id}" data-v="0">Marquer non payée</button>` : `<select id="moyen"><option>Virement</option><option>Carte bancaire</option><option>Lien de paiement</option><option>Chèque</option><option>Espèces</option></select><button class="btn" data-pay="${f.id}" data-v="1">Marquer payée</button>`}</div></section>` : ''}
      ${list.length ? `<div class="table"><table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Type</th><th class="n">Montant TTC</th><th>Statut</th></tr></thead><tbody>${list.map(x => `<tr data-href="#/factures/${x.id}"><td><b>${esc(x.numero)}</b></td><td>${dateFr(x.date)}</td><td>${esc(x.client?.nom)}</td><td>${{ acompte: 'Acompte', solde: 'Solde', totale: 'Totale' }[x.type] || ''}</td><td class="n">${euros(totalF(x))}</td><td><span class="pill ${x.payee ? 'd-accepte' : 'd-envoye'}">${x.payee ? 'Payée' : 'À encaisser'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="vide"><p>Aucune facture.</p><p class="muted">Les factures se créent depuis un devis signé (acompte, solde ou totale), avec une numérotation continue.</p></div>'}`);
  }
  factures.after = () => {
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    $$('[data-pay]').forEach(b => b.addEventListener('click', async () => { await api(`${A}/actions/facture-payee/${b.dataset.pay}`, { method: 'POST', body: { payee: b.dataset.v === '1', moyen: $('#moyen')?.value } }); toast('Facture mise à jour.'); render(); }));
    $$('[data-sendf]').forEach(b => b.addEventListener('click', async () => { try { await api(`${A}/actions/envoyer-facture/${b.dataset.sendf}`, { method: 'POST' }); toast('Facture envoyée.'); } catch (e) { toast(e.message, true); } }));
  };

  /* ---------- agenda ---------- */
  async function agenda(id) {
    const items = await api(A + '/actions/agenda');
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
      <div class="cal"><div class="cal-h">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<span>${j}</span>`).join('')}</div><div class="cal-g">${cells}</div></div>
      <div class="cols"><section class="box"><h2>À venir</h2>${aVenir.length ? `<ul class="list">${aVenir.map(x => `<li><a href="${x.lien}"><b>${dateFr(x.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${esc(x.titre)}</a><small class="muted">${esc(x.detail || '')}</small></li>`).join('')}</ul>` : '<p class="muted">Rien de prévu.</p>'}</section>
      <section class="box"><h2>Ajouter un rendez-vous</h2><form id="rdv"><div class="g2"><label>Date<input type="date" name="date" required></label><label>Heure<input type="time" name="heure"></label></div><label>Objet<input name="titre" required placeholder="Dégustation, visite de lieu…"></label><label>Détail<input name="detail"></label><button class="btn">Ajouter</button></form></section></div>`);
  }
  agenda.after = () => {
    $('#rdv')?.addEventListener('submit', async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api(A + '/rdv', { method: 'POST', body: { ...f, titre: (f.heure ? f.heure + ' · ' : '') + f.titre, statut: 'rdv' } }); toast('Rendez-vous ajouté.'); render(); });
  };

  /* ---------- clients ---------- */
  async function clients(id) {
    if (id) return client(id);
    const [list, dem] = await Promise.all([api(A + '/clients'), api(A + '/demandes')]);
    return page('Clients', '<a class="btn" href="#/clients/nouveau">+ Nouveau client</a><input type="search" placeholder="Rechercher…" data-q>', `<div class="table"><table><thead><tr><th>Nom</th><th>Société</th><th>Contact</th><th class="n">Demandes</th><th>Dernière activité</th></tr></thead><tbody>
      ${list.sort((a, b) => String(b.derniereActivite).localeCompare(String(a.derniereActivite))).map(c => `<tr data-href="#/clients/${c.id}"><td><b>${esc(c.nom)}</b></td><td>${esc(c.societe || '')}</td><td>${esc(c.email)}<small>${esc(c.tel || '')}</small></td><td class="n">${dem.filter(d => d.clientId === c.id).length}</td><td>${dateFr(c.derniereActivite)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Aucun client pour le moment.</td></tr>'}</tbody></table></div>`);
  }
  clients.after = id => {
    if (id) return client.after(id);
    $$('tr[data-href]').forEach(tr => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    $('[data-q]')?.addEventListener('input', e => { const q = e.target.value.toLowerCase(); $$('tr[data-href]').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); }); });
  };
  async function client(id) {
    const c = id === 'nouveau' ? { nom: '', email: '', tel: '', societe: '', adresse: '', notes: '' } : await api(A + '/clients/' + id);
    cache.client = c;
    const [dem, dv] = id === 'nouveau' ? [[], []] : await Promise.all([api(A + '/demandes'), api(A + '/devis')]);
    return page(id === 'nouveau' ? 'Nouveau client' : esc(c.nom), '<a class="btn ghost" href="#/clients">← Clients</a>', `<div class="cols"><section class="box"><form id="cf"><label>Nom et prénom<input name="nom" value="${esc(c.nom)}" required></label><label>Société<input name="societe" value="${esc(c.societe || '')}"></label><div class="g2"><label>E-mail<input type="email" name="email" value="${esc(c.email)}" required></label><label>Téléphone<input name="tel" value="${esc(c.tel || '')}"></label></div><label>Adresse de facturation<textarea name="adresse" rows="2">${esc(c.adresse || '')}</textarea></label><label>Notes internes<textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label><button class="btn">Enregistrer</button></form></section>
      <section class="box"><h2>Historique</h2><ul class="list">${dem.filter(d => d.clientId === id).map(d => `<li><a href="#/demandes/${d.id}">${esc(d.ref)} · ${esc(d.evenement?.type || d.sujet || '')} ${dateFr(d.evenement?.date)}</a><span class="pill st-${d.statut}">${STATUTS[d.statut]}</span></li>`).join('')}${dv.filter(x => x.clientId === id).map(x => `<li><a href="#/devis/${x.id}">Devis ${esc(x.numero)} · ${euros(tot(x).ttc)}</a><span class="pill d-${x.statut}">${DSTAT[x.statut]}</span></li>`).join('') || '<li class="muted">Rien pour le moment.</li>'}</ul>${id !== 'nouveau' ? `<button class="btn ghost" data-newdv>+ Devis pour ce client</button>` : ''}</section></div>`);
  }
  client.after = id => {
    $('#cf').addEventListener('submit', async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try {
        if (id === 'nouveau') { const r = await api(A + '/clients', { method: 'POST', body: { ...f, source: 'back-office', creeLe: new Date().toISOString(), derniereActivite: new Date().toISOString() } }); location.hash = '#/clients/' + r.id; }
        else { await api(`${A}/clients/${id}`, { method: 'PUT', body: { ...cache.client, ...f } }); toast('Client enregistré.'); }
      } catch (err) { toast(err.message, true); }
    });
    $('[data-newdv]')?.addEventListener('click', async () => { const r = await api(A + '/actions/devis-vierge', { method: 'POST', body: { clientId: id } }); location.hash = '#/devis/' + r.id; });
  };

  /* ---------- catalogue ---------- */
  async function catalogue() {
    const [rubs, prods] = await Promise.all([api(A + '/rubriques'), api(A + '/produits')]);
    cache.rubriques = rubs.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); cache.produits = prods;
    const r = new URLSearchParams(location.hash.split('?')[1] || '').get('r') || cache.catR || rubs[0]?.slug;
    cache.catR = r;
    const liste = prods.filter(p => p.rubrique === r).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    const rub = rubs.find(x => x.slug === r) || {};
    return page('Catalogue', `<input type="search" placeholder="Rechercher dans tout le catalogue…" data-q>`, `
      <div class="catg"><nav class="rubs">${rubs.map(x => `<a href="#/catalogue?r=${x.slug}" class="${x.slug === r ? 'on' : ''}${x.statut === 'masque' ? ' hid' : ''}">${esc(x.nom)}<small>${prods.filter(p => p.rubrique === x.slug).length}</small></a>`).join('')}<button class="lnk" data-newrub>+ Nouvelle rubrique</button></nav>
      <div><section class="box rubbox"><div class="bh"><h2>${esc(rub.nom || '')}</h2><button class="btn" data-new="${esc(r)}">+ Créer dans « ${esc(rub.nom || '')} »</button></div>
        <form id="rf" class="g3"><label>Nom<input name="nom" value="${esc(rub.nom || '')}"></label><label>Accroche (sur la vignette)<input name="accroche" value="${esc(rub.accroche || '')}" placeholder="ex. Le monde entier à votre table"></label><label>Statut<select name="statut"><option value="visible">Visible</option><option value="masque"${rub.statut === 'masque' ? ' selected' : ''}>Masquée</option></select></label>
        <label class="span3">Texte d’introduction<textarea name="chapo" rows="2">${esc(rub.chapo || '')}</textarea></label>
        <details class="span3 landbox"><summary>Page d’atterrissage : titre et Google</summary><div class="g3"><label>Grand titre de la page<input name="titrePage" value="${esc(rub.titrePage || '')}" placeholder="${esc(rub.nom || '')}"></label><label>Titre dans Google<input name="seoTitre" value="${esc(rub.seoTitre || '')}" maxlength="70" placeholder="vide = grand titre"></label><label>Description dans Google<input name="seoDescription" value="${esc(rub.seoDescription || '')}" maxlength="170" placeholder="vide = texte d’introduction"></label></div></details>
        <div class="span3 phrow">${photoField('photoAccueil', rub.photoAccueil || rub.photo, 'Photo de la vignette')}<div class="row"><label>Ordre<input type="number" name="ordre" value="${rub.ordre ?? 0}" class="num"></label><label>TVA par défaut<select name="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+(rub.tva || 10) === t ? ' selected' : ''}>${t} %</option>`).join('')}</select></label><button class="btn ghost">Enregistrer la rubrique</button></div></div>
        <div class="span3 sousbox"><h3>Spécialités <small class="muted">(vignettes affichées avant les prestations, ex. Buffet libanais, Paëlla party)</small></h3>
          <p class="muted sm">Sans spécialité, la rubrique affiche directement toutes ses prestations. Chaque prestation se range dans une spécialité depuis sa fiche (liste « Spécialité »).</p>
          <label class="stylev">Style des vignettes<select name="styleVignettes"><option value="carte"${(rub.styleVignettes || (rub.slug === 'saveurs-du-monde' ? 'carte' : 'photo')) === 'carte' ? ' selected' : ''}>Carte du monde (pays en doré)</option><option value="photo"${(rub.styleVignettes || (rub.slug === 'saveurs-du-monde' ? 'carte' : 'photo')) === 'photo' ? ' selected' : ''}>Photo de chaque spécialité</option></select></label>
          <div id="sous"></div><button type="button" class="btn ghost sm" data-addsous>+ Ajouter une spécialité</button></div></form></section>
      <div class="row sousfiltre"><label class="pq">Rechercher une prestation<input type="search" data-pq placeholder="Tapez un nom : nems, mafé, paëlla…" autocomplete="off"></label>${(rub.sous || []).length ? `<label>Afficher<select data-sousf><option value="*">Toutes les prestations (${liste.length})</option>${[...rub.sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}">${esc(x.nom)} (${liste.filter(p => p.sous === x.slug).length})</option>`).join('')}<option value="">Sans spécialité (${liste.filter(p => !(rub.sous || []).some(x => x.slug === p.sous)).length})</option></select></label>` : ''}<span class="muted sm" data-pqn></span></div>
      <div class="plist" id="plist">${liste.map(prow).join('') || '<p class="muted">Aucune prestation dans cette rubrique.</p>'}</div></div></div>`);
  }
  const LIEUX_CARTE = [['espagne', 'Espagne'], ['portugal', 'Portugal'], ['italie', 'Italie'], ['grece', 'Grèce'], ['france', 'France'], ['liban', 'Liban'], ['turquie', 'Turquie'], ['maghreb', 'Maghreb (Maroc, Algérie, Tunisie)'], ['maroc', 'Maroc'], ['algerie', 'Algérie'], ['tunisie', 'Tunisie'], ['afrique', 'Afrique (tout le continent)'], ['senegal', 'Sénégal'], ['cote-d-ivoire', 'Côte d’Ivoire'], ['cameroun', 'Cameroun'], ['congo', 'Congo'], ['antilles', 'Antilles'], ['reunion', 'La Réunion'], ['polynesie', 'Polynésie'], ['mexique', 'Mexique'], ['bresil', 'Brésil'], ['perou', 'Pérou'], ['argentine', 'Argentine'], ['etats-unis', 'États-Unis'], ['inde', 'Inde'], ['chine', 'Chine'], ['japon', 'Japon'], ['coree', 'Corée'], ['vietnam', 'Vietnam'], ['thailande', 'Thaïlande']];
  const prow = p => `<a class="prow${p.statut === 'masque' ? ' hid' : ''}" href="#/catalogue/${p.id || p.slug}">${p.photos?.[0]?.src ? `<img src="${esc(p.photos[0].src)}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span><b>${esc(p.titre)}</b><small>${p.prixCents == null ? 'Sur devis' : euros(p.prixCents) + (p.unite ? ' / ' + esc(p.unite) : '')}${p.min > 1 ? ' · min. ' + p.min : ''}</small></span><span class="pill ${p.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${p.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${p.maison ? '<span class="pill">Maison</span>' : ''}${p.sous ? `<span class="pill">${esc(((cache.rubriques || []).find(r => r.slug === p.rubrique)?.sous || []).find(x => x.slug === p.sous)?.nom || '')}</span>` : ''}</a>`;
  catalogue.after = () => {
    $('[data-q]').addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      $('#plist').innerHTML = (q ? cache.produits.filter(p => (p.titre + ' ' + (p.extrait || '')).toLowerCase().includes(q)) : cache.produits.filter(p => p.rubrique === cache.catR)).map(prow).join('') || '<p class="muted">Aucun résultat.</p>';
    });
    $('[data-new]').addEventListener('click', async e => {
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
        <p class="sm muted">${nbSous(x.slug)} prestation(s) · adresse : <a href="/${esc(cache.catR)}/${esc(x.slug || '')}" target="_blank">/${esc(cache.catR)}/${esc(x.slug || '…')} ↗</a> (à donner à l’agence pour la publicité Google)</p>
        <details class="landbox"><summary>Page d’atterrissage : bandeau et Google</summary>
          <div class="landf">${photoField('bp' + i, x.bandeauPhoto || '', 'Photo du bandeau (vide = photo de la vignette)')}<div>
          <label>Grand titre de la page<input data-k="titrePage" value="${esc(x.titrePage || '')}" placeholder="${esc(x.nom || '')}"></label>
          <label>Texte du bandeau<textarea data-k="chapo" rows="4">${esc(x.chapo || '')}</textarea></label>
          <label>Texte du bouton<input data-k="bouton" value="${esc(x.bouton || '')}" placeholder="Voir les propositions"></label>
          <label>Titre dans Google <small class="muted">(vide = grand titre)</small><input data-k="seoTitre" value="${esc(x.seoTitre || '')}" maxlength="70"></label>
          <label>Description dans Google <small class="muted">(vide = texte du bandeau)</small><textarea data-k="seoDescription" rows="2" maxlength="170">${esc(x.seoDescription || '')}</textarea></label></div></div></details>
        <details class="landbox"><summary>Paragraphe de présentation (avant « Nos buffets »)</summary>
          <label>Titre<input data-k="introTitre" value="${esc(x.introTitre || '')}" placeholder="ex. Le goût du partage"></label>
          <label>Texte <small class="muted">(vide = pas de paragraphe)</small><textarea data-k="introTexte" rows="5">${esc(x.introTexte || '')}</textarea></label></details>
        <details class="landbox"><summary>Présentation des prestations</summary>
          <label>Présentation<select data-ps><option value="">Une seule liste (recherche et tri)</option><option value="1"${x.parSections ? ' selected' : ''}>En sections : Nos buffets, puis entrées, plats, desserts et divers à l’unité</option></select></label>
          <p class="muted sm">La section de chaque prestation se choisit dans sa fiche (liste « Section »). Une section vide ne s’affiche pas. Titres des sections :</p>
          <div class="g3">${[['buffets', 'Nos buffets'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité']].map(([k, t]) => `<input data-ts="${k}" value="${esc((x.titresSections || {})[k] || '')}" placeholder="${t}" aria-label="${t}">`).join('')}</div></details><div class="row"><button type="button" class="btn ghost sm" data-up ${i ? '' : 'disabled'}>↑ Monter</button><button type="button" class="btn ghost sm" data-down ${i < sous.length - 1 ? '' : 'disabled'}>↓ Descendre</button><button type="button" class="btn ghost sm ph-del" data-delsous>🗑 Supprimer</button></div></div></div>`).join('') || '<p class="muted sm">Aucune spécialité pour cette rubrique.</p>';
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
      const L = cache.produits.filter(p => p.rubrique === cache.catR && (v === '*' || (v ? p.sous === v : !sous.some(x => x.slug === p.sous))) && (!q || q.split(/\s+/).every(m => sansAcc(p.titre + ' ' + p.slug).includes(m))));
      $('#plist').innerHTML = L.map(prow).join('') || '<p class="muted">Aucune prestation ne correspond.</p>';
      $('[data-pqn]').textContent = q ? `${L.length} résultat${L.length > 1 ? 's' : ''}` : '';
    };
    $('[data-sousf]')?.addEventListener('change', filtrer);
    $('[data-pq]').addEventListener('input', filtrer);
    $('[data-pq]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const a = $('#plist a.prow'); if (a) location.hash = a.getAttribute('href'); } });
    bindPhotos($('#rf'));
    $('#rf').addEventListener('submit', async e => {
      e.preventDefault(); lireSous(); const f = Object.fromEntries(new FormData(e.target)); const rub = cache.rubriques.find(x => x.slug === cache.catR);
      for (const k of Object.keys(f)) if (/^(sp|bp)\d+$/.test(k)) delete f[k];
      const next = { ...rub, ...f, ordre: +f.ordre, tva: +f.tva, sous: sous.map((x, i) => ({ ...x, nom: String(x.nom || '').trim() || 'Sans nom', ordre: i })), sousInit: true };
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
    return page(esc(p.titre), `<a class="btn ghost" href="#/catalogue?r=${esc(p.rubrique)}">← Catalogue</a><a class="btn ghost" href="/${esc(p.rubrique)}/${esc(p.slug)}" target="_blank">Voir sur le site ↗</a>`, `
      <form id="pf">
      <div class="cols c21">
        <section class="box"><h2>Informations</h2>
          <label>Nom<input name="titre" value="${esc(p.titre)}" required></label>
          <div class="g3"><label>Rubrique<select name="rubrique">${rubs.map(r => `<option value="${r.slug}"${r.slug === p.rubrique ? ' selected' : ''}>${esc(r.nom)}</option>`).join('')}</select></label>
          <label>Statut<select name="statut"><option value="visible">Visible sur le site</option><option value="masque"${p.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label>
          <label>Mise en avant<select name="maison"><option value="1">Produit maison (en premier)</option><option value=""${!p.maison ? ' selected' : ''}>Partenaire</option></select></label></div>
          ${(rubs.find(r => r.slug === p.rubrique)?.sous || []).length ? `<label>Spécialité (dans « ${esc(rubs.find(r => r.slug === p.rubrique).nom)} »)<select name="sous"><option value="">Aucune (seulement dans « Tout »)</option>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<option value="${esc(x.slug)}"${x.slug === p.sous ? ' selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label><fieldset class="span3 aussi"><legend>Aussi affichée dans <small class="muted">(un seul produit, plusieurs spécialités : pas de doublon dans la boutique)</small></legend>${[...rubs.find(r => r.slug === p.rubrique).sous].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(x => `<label class="chk"><input type="checkbox" name="autresSous" value="${esc(x.slug)}"${(p.autresSous || []).includes(x.slug) ? ' checked' : ''}> ${esc(String(x.nom).split(' · ')[0])}</label>`).join(' ')}</fieldset>` : ''}
          <label>Section sur la page de la spécialité<select name="rangement"><option value="">Automatique (d’après le nom)</option>${[['buffets', 'Nos buffets'], ['entrees', 'Nos entrées à l’unité'], ['plats', 'Nos plats à l’unité'], ['accompagnements', 'Nos accompagnements à l’unité'], ['desserts', 'Nos desserts à l’unité'], ['divers', 'Produits divers à l’unité']].map(([k, t]) => `<option value="${k}"${p.rangement === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Accroche (cartes et Google)<textarea name="extrait" rows="2">${esc(p.extrait || '')}</textarea></label>
          <label>Description (un paragraphe par ligne)<textarea name="description" rows="4">${esc((p.description || []).join('\n'))}</textarea></label>
        </section>
        <section class="box"><h2>Prix et quantités</h2>
          <label>Prix TTC (€) <small>vide = « Sur devis »</small><input name="prix" value="${fromCents(p.prixCents)}" inputmode="decimal"></label>
          <div class="g2"><label>Par<select name="unite">${[...new Set([p.unite || '', ...UNITES])].map(u => `<option${u === (p.unite || '') ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></label>
          <label>Minimum<select name="min">${[...new Set([1, 2, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, p.min || 1])].sort((a, b) => a - b).map(n => `<option${n === (p.min || 1) ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="g2"><label>Coût de revient TTC (€) <small>pour la marge</small><input name="cout" value="${fromCents(p.coutCents)}" inputmode="decimal"></label>
          <label>TVA<select name="tva">${[5.5, 10, 20].map(t => `<option value="${t}"${+(p.tva ?? 10) === t ? ' selected' : ''}>${String(t).replace('.', ',')} %</option>`).join('')}</select></label></div>
          <label class="chk"><input type="checkbox" name="r_personnel" ${p.regles?.personnel ? 'checked' : ''}> Proposer le personnel de service</label>
          <label class="chk"><input type="checkbox" name="r_packs" ${p.regles?.packs ? 'checked' : ''}> Proposer les packs traiteur</label>
          <label>Variantes (une par ligne, ex. « Entrée & plat »)<textarea name="variantes" rows="2">${esc((p.variantes || []).join('\n'))}</textarea></label>
        </section>
      </div>
      <section class="box"><div class="bh"><h2>Photos et vidéo</h2><div class="row"><label class="btn ghost sm up">+ Ajouter depuis mon ordinateur<input type="file" accept="image/*" multiple hidden data-multi></label><button type="button" class="btn ghost sm" data-pickp>+ Ajouter depuis la médiathèque</button></div></div>
        <p class="muted sm">La photo principale s’affiche sur la vignette de la boutique. Glissez les photos pour changer l’ordre, ou cliquez sur « ★ Principale ».</p>
        <div class="photos" id="photos"></div>
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
    const draw = () => {
      $('#photos').innerHTML = photos.map((ph, i) => vigGalerie(ph.src, i, ph.alt)).join('') || '<p class="muted">Aucune photo.</p>';
    };
    draw();
    const dirty = () => { $('#dirty').textContent = 'Modifications non enregistrées'; };
    form.addEventListener('input', dirty);
    bindPhotos(form);
    $('#photos').addEventListener('input', e => { if (e.target.matches('[data-alt]')) photos[+e.target.closest('[data-i]').dataset.i].alt = e.target.value; });
    $('#photos').addEventListener('click', e => { const f = e.target.closest('[data-i]'); if (!f) return; const i = +f.dataset.i; if (e.target.closest('[data-rm]') && confirmerRetrait()) { photos.splice(i, 1); draw(); dirty(); } if (e.target.closest('[data-main]')) { photos.unshift(...photos.splice(i, 1)); draw(); dirty(); } });
    let dragI = null;
    $('#photos').addEventListener('dragstart', e => { dragI = +e.target.closest('[data-i]').dataset.i; });
    $('#photos').addEventListener('dragover', e => e.preventDefault());
    $('#photos').addEventListener('drop', e => { e.preventDefault(); const t = e.target.closest('[data-i]'); if (t == null || dragI == null) return; const [m] = photos.splice(dragI, 1); photos.splice(+t.dataset.i, 0, m); draw(); dirty(); });
    $('[data-multi]').addEventListener('change', async e => { for (const f of e.target.files) { toast('Envoi de ' + f.name + '…'); try { photos.push({ src: await uploadFile(f), alt: form.titre.value }); draw(); dirty(); } catch (err) { toast(err.message, true); } } toast('Photos ajoutées.'); });
    $('[data-pickp]').addEventListener('click', async () => { const u = await pickMedia(); if (u) { photos.push({ src: u, alt: form.titre.value }); draw(); dirty(); } });
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
      const next = { ...p, titre: f.get('titre'), rubrique: f.get('rubrique'), sous: f.get('rubrique') === p.rubrique ? (f.get('sous') ?? p.sous ?? '') : '', autresSous: f.get('rubrique') === p.rubrique ? f.getAll('autresSous').filter(x => x !== f.get('sous')) : [], rangement: f.get('rangement') ?? p.rangement ?? '', statut: f.get('statut'), maison: !!f.get('maison'), extrait: f.get('extrait'), description: String(f.get('description')).split('\n').map(x => x.trim()).filter(Boolean),
        prixCents: toCents(f.get('prix')), unite: f.get('unite'), min: +f.get('min') || 1, minimumTexte: '', prixTexte: '', coutCents: toCents(f.get('cout')), tva: +f.get('tva'),
        regles: { ...(p.regles || {}), personnel: f.get('r_personnel') ? (p.regles?.personnel || 'service') : null, packs: !!f.get('r_packs') },
        variantes: String(f.get('variantes')).split('\n').map(x => x.trim()).filter(Boolean), photos, video: f.get('video') ? { src: f.get('video'), poster: f.get('poster') || '' } : null,
        sections, details: String(f.get('details')).split('\n').map(x => x.trim()).filter(Boolean), groupes, allergenes: f.getAll('al'), allergenesAuto: false };
      try { await api(`${A}/produits/${id}`, { method: 'PUT', body: next }); cache.p = next; cache.produits = null; $('#dirty').textContent = ''; toast('Enregistré : visible sur le site immédiatement.'); }
      catch (err) { toast(err.message, true); }
    });
  };

  /* ---------- lieux ---------- */
  async function lieux() {
    const list = (await api(A + '/lieux')).sort((a, b) => (b.maison ? 1 : 0) - (a.maison ? 1 : 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
    return page('Lieux de réception', '<button class="btn" data-newl>+ Nouveau lieu</button>', `<div class="plist">${list.map(l => `<a class="prow${l.statut === 'masque' ? ' hid' : ''}" href="#/lieux/${l.slug}">${l.photos?.[0] ? `<img src="${esc(l.photos[0])}" alt="" loading="lazy">` : '<span class="ph0"></span>'}<span><b>${esc(l.nom)}</b><small>${esc(l.ville || '')} · ${l.capacite ? l.capacite + ' pers.' : ''} · ${esc(l.prixTexte || '')}</small></span><span class="pill ${l.statut === 'masque' ? 'd-refuse' : 'd-accepte'}">${l.statut === 'masque' ? 'Masqué' : 'Visible'}</span>${l.maison ? '<span class="pill">Maison</span>' : ''}</a>`).join('')}</div>`);
  }
  lieux.after = () => $('[data-newl]')?.addEventListener('click', async () => { const nom = prompt('Nom du lieu ?'); if (!nom) return; const r = await api(A + '/lieux', { method: 'POST', body: { nom } }); location.hash = '#/lieux/' + r.id; });
  async function lieu(id) {
    const l = await api(A + '/lieux/' + id); cache.l = l;
    return page(esc(l.nom), `<a class="btn ghost" href="#/lieux">← Lieux</a><a class="btn ghost" href="/lieux/${esc(l.slug)}" target="_blank">Voir ↗</a>`, `<form id="lf2"><div class="cols c21"><section class="box"><label>Nom<input name="nom" value="${esc(l.nom)}"></label><label>Description<textarea name="description" rows="5">${esc(l.description || '')}</textarea></label><div class="g2"><label>Adresse<input name="adresse" value="${esc(l.adresse || '')}"></label><label>Ville<input name="ville" value="${esc(l.ville || '')}"></label></div><label>Équipements (un par ligne)<textarea name="equipements" rows="5">${esc((l.equipements || []).join('\n'))}</textarea></label></section>
      <section class="box"><div class="g2"><label>Statut<select name="statut"><option value="visible">Visible</option><option value="masque"${l.statut === 'masque' ? ' selected' : ''}>Masqué</option></select></label><label>Mise en avant<select name="maison"><option value="">Partenaire</option><option value="1"${l.maison ? ' selected' : ''}>Lieu maison (en premier)</option></select></label></div><label>Capacité max<input type="number" name="capacite" value="${esc(l.capacite || '')}"></label><label>Prix affiché<input name="prixTexte" value="${esc(l.prixTexte || '')}" placeholder="Sur devis"></label></section></div>
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
    $('#lf2').addEventListener('submit', async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api(`${A}/lieux/${id}`, { method: 'PUT', body: { ...l, ...f, maison: !!f.maison, capacite: +f.capacite || null, equipements: f.equipements.split('\n').map(x => x.trim()).filter(Boolean), photos } }); toast('Lieu enregistré.'); });
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
        <h3>Chiffres clés</h3><p class="muted sm">Le nombre de prestations se met à jour tout seul. Une note « sur 5 » s’affiche avec des étoiles.</p><div class="g4">${[0, 1, 2, 3].map(i => `<div><input name="ch${i}_v" value="${esc(Ac.chiffres?.[i]?.valeur || '')}" placeholder="4,9/5"><input name="ch${i}_l" value="${esc(Ac.chiffres?.[i]?.label || '')}" placeholder="sur Google"></div>`).join('')}</div></section>
      <section class="box"><h2>Les incontournables</h2><p class="muted sm">Les prestations mises en avant sur l’accueil, dans l’ordre.</p><div class="incs">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<select name="inc${i}"><option value="">—</option>${prods.filter(p => p.statut !== 'masque').sort((a, b) => a.titre.localeCompare(b.titre)).map(p => `<option value="${esc(p.slug)}"${(Ac.incontournables || [])[i] === p.slug ? ' selected' : ''}>${esc(p.titre)}</option>`).join('')}</select>`).join('')}</div></section>
      <section class="box"><h2>Photos des blocs</h2><div class="g2">${photoField('photoMaison', Ac.photoMaison, 'Bloc « La maison Magnolia »')}${photoField('photoCommande', Ac.photoCommande, 'Bloc « Comment commander »')}</div></section>
      <section class="box"><h2>Coordonnées</h2><div class="g2"><label>Téléphone<input name="telephone" value="${esc(R.telephone || '')}"></label><label>E-mail<input name="email" value="${esc(R.email || '')}"></label><label>Adresse<input name="adresse" value="${esc(R.adresse || '')}"></label><label>Horaires<input name="horaires" value="${esc(R.horaires || '')}"></label><label>Slogan<input name="slogan" value="${esc(R.slogan || '')}"></label><label>Instagram<input name="instagram" value="${esc(R.instagram || '')}"></label><label>Note Google<input name="g_note" value="${esc(R.avisGoogle?.note || '')}"></label><label>Nombre d’avis Google<input name="g_nombre" value="${esc(R.avisGoogle?.nombre || '')}"></label></div><label>Mention en bas de page<input name="mentionPied" value="${esc(R.mentionPied || '')}"></label></section>
      <section class="box"><h2>Tarifs communs (TTC)</h2><div class="g3"><label>Livraison (€ / km aller-retour)<input name="km" value="${fromCents(T.kmCents)}"></label><label>Personnel (€ / heure)<input name="ph" value="${fromCents(T.personnel?.heureCents)}"></label><label>Heures minimum<select name="pmin">${[2, 3, 4, 5, 6].map(n => `<option${(T.personnel?.minHeures || 4) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>Petit pack (€ / pers.)<input name="pk0" value="${fromCents(T.packs?.[0]?.prixCents)}"></label><label>Grand pack (€ / pers.)<input name="pk1" value="${fromCents(T.packs?.[1]?.prixCents)}"></label><label>Acompte par défaut<select name="acompte">${[20, 30, 40, 50].map(n => `<option value="${n}"${(T.acomptePct ?? 30) === n ? ' selected' : ''}>${n} %</option>`).join('')}</select></label></div></section>
      <section class="box"><h2>Paiement de l’acompte</h2><p class="muted sm">Affiché au client dès qu’il a signé son devis. Un lien propre à un devis (dans le devis) passe avant le lien général.</p><div class="g2"><label>Lien de paiement par carte (SumUp, Stripe…)<input name="pay_lien" value="${esc(R.paiement?.lien || '')}" placeholder="https://"></label><label>Titulaire du compte<input name="pay_tit" value="${esc(R.paiement?.titulaire || '')}"></label><label>IBAN (virement)<input name="pay_iban" value="${esc(R.paiement?.iban || '')}"></label><label>BIC<input name="pay_bic" value="${esc(R.paiement?.bic || '')}"></label></div></section>
      <section class="box"><h2>Publicité Google Ads</h2><p class="muted sm">Renseignez l’identifiant du compte (AW-…) et les libellés de conversion donnés par Google Ads. Chaque demande de devis envoyée est alors comptée, avec son montant estimé. Rien n’est mesuré sans l’accord du visiteur.</p><div class="g3"><label>Identifiant du compte<input name="ads_id" value="${esc(R.suivi?.googleAdsId || '')}" placeholder="AW-123456789"></label><label>Libellé « demande de devis »<input name="ads_dem" value="${esc(R.suivi?.conversionDemande || '')}"></label><label>Libellé « message de contact »<input name="ads_con" value="${esc(R.suivi?.conversionContact || '')}"></label></div></section>
      <section class="box"><h2>Redirections (bascule de l’ancien site)</h2><p class="muted sm">Une ligne par ancienne adresse : « /ancienne-page /nouvelle-page ». Une ancienne adresse finissant par * couvre toutes les pages qui commencent pareil. Google transfère alors le référencement (redirection 301).</p><textarea name="redirections" rows="5" class="mono" placeholder="/nos-buffets /saveurs-du-monde&#10;/blog/* /conseils">${esc(R.redirections || '')}</textarea></section>
      <section class="box"><h2>Alertes de l’équipe</h2><div class="g2"><label>E-mails prévenus à chaque demande (séparés par des virgules)<input name="al_emails" value="${esc(R.alertes?.emails || '')}"></label><label>Portables prévenus par SMS<input name="al_sms" value="${esc(R.alertes?.sms || '')}" placeholder="06 12 34 56 78"></label></div></section>
      <div class="actions sticky"><button class="btn">Enregistrer</button><span class="muted" id="dirty"></span></div></form>`);
  }
  site.after = async () => {
    const form = $('#sf'); bindPhotos(form);
    const [rubs, lieuxL] = await Promise.all([cache.rubriques || api(A + '/rubriques'), api(A + '/lieux')]);
    const DEST = [['', 'Rechercher ce mot'], ['/boutique', 'La boutique (tout)'], ...rubs.filter(r => r.statut !== 'masque').sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).flatMap(r => [['/' + r.slug, 'Univers · ' + r.nom], ...(r.sous || []).map(x => [`/${r.slug}/${x.slug}`, '   ' + r.nom + ' › ' + x.nom])]),
      ['/lieux', 'Lieux de réception (tous)'], ...lieuxL.filter(l => l.statut !== 'masque').map(l => ['/lieux/' + l.slug, '   Lieu · ' + l.nom]), ['/maison', 'La maison'], ['/temoignages', 'Avis clients'], ['/livraison', 'Zones de livraison'], ['/comment-commander', 'Comment commander'], ['/contact', 'Contact']];
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
        telephone: f.telephone, email: f.email, adresse: f.adresse, horaires: f.horaires, slogan: f.slogan, instagram: f.instagram, mentionPied: f.mentionPied,
        avisGoogle: { ...(R.avisGoogle || {}), note: f.g_note, nombre: f.g_nombre },
        tarifs: { ...T, kmCents: toCents(f.km), acomptePct: +f.acompte, personnel: { ...(T.personnel || {}), heureCents: toCents(f.ph), minHeures: +f.pmin }, packs: (T.packs || []).map((pk, i) => ({ ...pk, prixCents: toCents(f['pk' + i]) ?? pk.prixCents })) },
        alertes: { emails: f.al_emails, sms: f.al_sms },
        suivi: { googleAdsId: String(f.ads_id || '').trim().toUpperCase(), conversionDemande: String(f.ads_dem || '').trim(), conversionContact: String(f.ads_con || '').trim() },
        paiement: { lien: String(f.pay_lien || '').trim(), titulaire: f.pay_tit || '', iban: String(f.pay_iban || '').toUpperCase().replace(/\s+/g, ' ').trim(), bic: String(f.pay_bic || '').toUpperCase().trim() },
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

  /* ---------- équipe et activité ---------- */
  async function equipe() {
    const [users, j, env] = await Promise.all([api(A + '/actions/equipe'), api(A + '/actions/journal'), api(A + '/actions/envois')]);
    const mgr = session.role === 'manager';
    return page('Équipe & activité', '', `<div class="cols">
      <section class="box"><h2>Comptes</h2><ul class="list">${users.map(u => `<li><span><b>${esc(u.nom || u.email)}</b><small>${esc(u.email)}</small></span><span>${mgr ? `<select data-role="${u.id}"><option value="collab">Collaborateur</option><option value="manager"${u.role === 'manager' ? ' selected' : ''}>Manager</option></select> <button class="lnk" data-dis="${u.id}" data-v="${u.desactive ? 0 : 1}">${u.desactive ? 'Réactiver' : 'Désactiver'}</button>` : `<span class="pill">${u.role === 'manager' ? 'Manager' : 'Collaborateur'}</span>`}</span></li>`).join('')}</ul>
        ${mgr ? `<form id="nu"><h3>Ajouter un membre</h3><div class="g2"><label>Nom<input name="nom" required></label><label>E-mail<input type="email" name="email" required></label><label>Mot de passe provisoire<input name="password" minlength="10" required></label><label>Rôle<select name="role"><option value="collab">Collaborateur</option><option value="manager">Manager</option></select></label></div><button class="btn">Créer le compte</button></form>` : ''}
        <form id="pw"><h3>Mon mot de passe</h3><div class="g2"><label>Actuel<input type="password" name="current" required></label><label>Nouveau (10 caractères min.)<input type="password" name="password" minlength="10" required></label></div><button class="btn ghost">Changer</button></form></section>
      <section class="box"><h2>Journal d’activité <span class="pill ${j.intact ? 'd-accepte' : 'd-refuse'}">${j.intact ? 'intact' : 'ALTÉRÉ'}</span></h2><p class="muted sm">Chaque action est enregistrée et chaînée : une modification du journal se verrait.</p><ul class="journal">${j.lignes.map(l => `<li><time>${dateH(l.at)}</time> <b>${esc(l.who)}</b> ${esc(l.op)} <small>${esc(l.resume || l.path)}</small></li>`).join('')}</ul></section></div>
      <section class="box"><h2>E-mails et SMS envoyés ${env.live ? '' : '<span class="pill d-envoye">mode test : Brevo non branché</span>'}</h2><div class="row"><input type="tel" data-testtel placeholder="Portable pour un SMS d’essai (facultatif)" style="max-width:280px"><button class="btn ghost sm" data-test>Envoyer un essai</button></div><ul class="journal">${env.envois.map(e => `<li><time>${dateH(e.at)}</time> ${e.kind === 'sms' ? 'SMS' : 'E-mail'} → <b>${esc(e.kind === 'sms' ? e.payload.recipient : e.payload.to?.[0]?.email)}</b> <small>${esc(e.kind === 'sms' ? e.payload.content : e.payload.subject)}</small></li>`).join('') || '<li class="muted">Aucun envoi.</li>'}</ul></section>`);
  }
  const essaiEnvoi = async () => { try { const r = await api(A + '/actions/envoi-test', { method: 'POST', body: { tel: $('[data-testtel]').value } }); toast(r.live ? `Essai envoyé à ${r.email}.` : 'Mode test : l’essai est noté ci-dessous, rien n’est parti (clé Brevo à brancher).'); render(); } catch (e) { toast(e.message, true); } };
  equipe.after = () => {
    $('[data-test]')?.addEventListener('click', essaiEnvoi);
    $('#nu')?.addEventListener('submit', async e => { e.preventDefault(); try { await api(A + '/actions/equipe', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Compte créé.'); render(); } catch (err) { toast(err.message, true); } });
    $('#pw').addEventListener('submit', async e => { e.preventDefault(); try { await api('/api/auth/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Mot de passe changé.'); e.target.reset(); } catch (err) { toast(err.message, true); } });
    $$('[data-role]').forEach(s => s.addEventListener('change', async () => { try { await api(`${A}/actions/equipe/${s.dataset.role}`, { method: 'PATCH', body: { role: s.value } }); toast('Rôle modifié.'); } catch (err) { toast(err.message, true); render(); } }));
    $$('[data-dis]').forEach(b => b.addEventListener('click', async () => { try { await api(`${A}/actions/equipe/${b.dataset.dis}`, { method: 'PATCH', body: { desactive: b.dataset.v === '1' } }); render(); } catch (err) { toast(err.message, true); } }));
  };

  /* ---------- outils ---------- */
  async function outils() {
    const [mods, pages] = await Promise.all([api(A + '/modeles'), api(A + '/pages')]);
    return page('Outils', '', `<section class="box"><h2>Excel</h2><p class="muted sm">Les fichiers s’ouvrent directement dans Excel. Pour changer beaucoup de prix d’un coup : exportez le catalogue, modifiez les colonnes prix, minimum, coût, TVA, statut ou maison, enregistrez en CSV, puis renvoyez le fichier. Rien n’est créé ni supprimé, et un prix sous le coût est refusé.</p>
      <div class="row">${[['catalogue', 'Catalogue'], ['demandes', 'Demandes'], ['clients', 'Clients'], ['devis', 'Devis'], ['factures', 'Factures']].map(([k, l]) => `<a class="btn ghost sm" href="${A}/actions/export/${k}">⬇ ${l}</a>`).join('')}${session.role === 'manager' ? '<label class="btn sm up">⬆ Mettre à jour le catalogue<input type="file" accept=".csv,text/csv" hidden data-importcat></label>' : ''}</div><div id="impres"></div></section>
      <section class="box"><h2>Modèles de relance</h2><p class="muted sm">Variables : {prenom} {nom} {numero} {evenement} {date} {lien} {montant}</p>${mods.map(m => `<form class="mod" data-id="${m.id}"><div class="g3"><label>Nom<input name="nom" value="${esc(m.nom)}"></label><label>Canal<select name="canal"><option value="email">E-mail</option><option value="sms"${m.canal === 'sms' ? ' selected' : ''}>SMS</option></select></label><label>Sujet<input name="sujet" value="${esc(m.sujet || '')}"></label></div><textarea name="texte" rows="5">${esc(m.texte)}</textarea><button class="btn ghost sm">Enregistrer</button></form>`).join('')}<button class="btn ghost" data-newm>+ Nouveau modèle</button></section>
      <section class="box"><h2>Pages administratives</h2><p class="muted sm">CGV, mentions légales, confidentialité, allergènes… Une ligne courte devient un intertitre.</p>${pages.map(p => `<details><summary>${esc(p.titre)} <small class="muted">${esc(p.url)}</small></summary><form class="pg" data-id="${p.id}"><label>Titre<input name="titre" value="${esc(p.titre)}"></label><textarea name="texte" rows="14">${esc(p.texte)}</textarea><button class="btn ghost sm">Enregistrer</button></form></details>`).join('')}</section>
      ${session.role === 'manager' ? `<section class="box"><h2>Reprendre le catalogue du brouillon</h2><p class="muted sm">Remplace les prestations, rubriques et lieux par ceux du brouillon (data/brouillon.json). Les demandes, devis, factures et clients ne sont pas touchés. À n’utiliser qu’avant l’ouverture.</p><button class="btn ghost" data-reimp>Réimporter le brouillon</button></section>` : ''}`);
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
    $('[data-newm]').addEventListener('click', async () => { await api(A + '/modeles', { method: 'POST', body: { nom: 'Nouveau modèle', canal: 'email', sujet: '', texte: 'Bonjour {prenom},\n\n' } }); render(); });
    $('[data-reimp]')?.addEventListener('click', async () => { if (!confirm('Remplacer tout le catalogue par celui du brouillon ?')) return; const r = await api(A + '/actions/reimporter', { method: 'POST' }); toast(`Réimporté : ${r.produits} prestations.`); });
  };

  render();
})();
