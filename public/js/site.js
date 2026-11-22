/* Magnolia Traiteur : petits comportements du site (aucune dépendance). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MG = window.MG || {};
  const T = MG.tarifs || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euros = c => c == null ? 'Sur devis' : (Math.round(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, ' ') + ' €';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
  };
  const toast = (msg, lien) => {
    const t = $('[data-toast]'); if (!t) return;
    t.innerHTML = esc(msg) + (lien ? ` <a href="${lien[1]}">${esc(lien[0])}</a>` : '');
    t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 4200);
  };
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mg': '1' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Envoi impossible. Réessayez ou appelez-nous.');
    return j;
  };

  /* ---------- en-tête, menu, recherche ---------- */
  const top = $('[data-top]');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const openLay = (el) => { if (!el) return; el.hidden = false; requestAnimationFrame(() => el.classList.add('on')); document.body.classList.add('noscroll'); };
  const closeLay = (el) => { if (!el) return; el.classList.remove('on'); document.body.classList.remove('noscroll'); setTimeout(() => { el.hidden = true; }, 250); };
  $$('[data-open-menu]').forEach(b => b.addEventListener('click', () => openLay($('[data-menu]'))));
  $$('[data-close-menu]').forEach(b => b.addEventListener('click', () => closeLay($('[data-menu]'))));
  $('[data-menu]')?.addEventListener('click', e => { if (e.target.matches('[data-menu]')) closeLay(e.target); });
  $$('[data-open-search]').forEach(b => b.addEventListener('click', () => { openLay($('[data-search]')); setTimeout(() => $('[data-search] input')?.focus(), 60); }));
  $$('[data-close-search]').forEach(b => b.addEventListener('click', () => closeLay($('[data-search]'))));
  addEventListener('keydown', e => { if (e.key === 'Escape') { closeLay($('[data-search]')); closeLay($('[data-menu]')); } });

  /* recherche instantanée */
  $$('[data-live-search]').forEach(form => {
    const input = $('input', form), out = form.parentElement.querySelector('[data-live-results]');
    let timer, last = '';
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim();
        if (q === last) return; last = q;
        const sugg = form.parentElement.querySelector('[data-sugg]'); if (sugg) sugg.hidden = q.length >= 2;
        if (q.length < 2) { out.innerHTML = ''; return; }
        const r = await fetch('/api/recherche?q=' + encodeURIComponent(q)).then(x => x.json()).catch(() => ({ resultats: [] }));
        out.innerHTML = r.resultats.length ? r.resultats.map(x => `<a class="live-i" href="${x.href}">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : '<span></span>'}<span><b>${esc(x.titre)}</b><small>${esc(x.rubrique)} · ${esc(x.prix)}</small></span></a>`).join('') + `<a class="live-all" href="/boutique?q=${encodeURIComponent(q)}">Voir tous les résultats pour « ${esc(q)} »</a>`
          : `<p class="live-none">Rien pour « ${esc(q)} ». Appelez-nous au ${esc(MG.tel || '')} : nous trouvons toujours une solution.</p>`;
      }, 160);
    });
  });
  /* dictée vocale (Chrome, Safari) */
  const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  $$('[data-dictee]').forEach(btn => {
    if (!Reco) { btn.hidden = true; return; }
    btn.addEventListener('click', () => {
      const input = btn.closest('form').querySelector('input');
      const r = new Reco(); r.lang = 'fr-FR'; r.interimResults = true;
      btn.classList.add('rec');
      r.onresult = e => { input.value = [...e.results].map(x => x[0].transcript).join(' '); input.dispatchEvent(new Event('input')); };
      r.onend = () => btn.classList.remove('rec');
      r.start();
    });
  });

  /* ---------- accueil : les trois vidéos ---------- */
  const hero = $('[data-hero]');
  if (hero) {
    const panels = $$('[data-hero-panel]', hero);
    const vids = panels.map(p => $('video', p));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const load = v => { if (!v.src && v.dataset.src) v.src = v.dataset.src; };
    const play = v => { load(v); const p = v.play(); if (p) p.catch(() => {}); };
    const mobile = () => matchMedia('(max-width: 760px)').matches;
    let cur = 1, timer;
    const show = i => {
      cur = (i + panels.length) % panels.length;
      panels.forEach((p, k) => p.classList.toggle('on', k === cur));
      $$('[data-dot]', hero).forEach((d, k) => d.classList.toggle('on', k === cur));
      if (mobile()) vids.forEach((v, k) => (k === cur ? play(v) : v.pause()));
    };
    if (!reduce) {
      const start = () => {
        if (mobile()) { show(cur); clearInterval(timer); timer = setInterval(() => show(cur + 1), 6000); }
        else { clearInterval(timer); vids.forEach(play); }
      };
      if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) start(); else vids.forEach(v => v.pause()); }), { threshold: 0.15 }).observe(hero);
      else start();
      /* l'accueil s'ouvre sur les vidéos : on les lance tout de suite, sans attendre l'observateur */
      if (hero.getBoundingClientRect().top < innerHeight) start();
      document.addEventListener('visibilitychange', () => { if (!document.hidden && hero.getBoundingClientRect().bottom > 0) start(); });
      addEventListener('resize', () => { clearTimeout(hero._r); hero._r = setTimeout(start, 200); });
    }
    let x0 = null;
    hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50 && mobile()) { show(cur + (dx < 0 ? 1 : -1)); clearInterval(timer); } x0 = null; });
    show(1);
  }

  /* pavé de recherche de l'accueil : les réponses sont gardées et ne sont plus redemandées */
  const pave = $('[data-pave]');
  if (pave) {
    const evt = store.get('mg_evt', {});
    if (evt.evt) pave.evt.value = evt.evt;
    if (evt.date) pave.date.value = evt.date;
    if (evt.invites) pave.invites.value = evt.invites;
    pave.date.min = new Date().toISOString().slice(0, 10);
    pave.addEventListener('submit', e => {
      e.preventDefault();
      store.set('mg_evt', { evt: pave.evt.value, date: pave.date.value, invites: +pave.invites.value });
      location.href = '/boutique?pour=' + encodeURIComponent(pave.evt.value);
    });
  }

  /* ---------- ma sélection (gardée dans le navigateur) ---------- */
  const sel = {
    all: () => store.get('mg_sel', []),
    save(list) { store.set('mg_sel', list); badge(); },
    add(item) { const l = sel.all(); l.push({ ...item, key: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }); sel.save(l); },
  };
  function badge() {
    const n = sel.all().length;
    $$('[data-sel-count]').forEach(b => { b.textContent = n; b.hidden = !n; });
  }
  badge();

  /* ---------- boutique : filtres et tri sans recharger ---------- */
  const shop = $('[data-shop]');
  if (shop) {
    const grid = $('[data-grid]', shop), cards = $$('[data-card]', grid);
    const count = $('[data-count]', shop);
    const pour = new URLSearchParams(location.search).get('pour');
    const evt = store.get('mg_evt', {});
    if (pour && evt.invites) toast(`${pour} · ${evt.invites} invités${evt.date ? ' · ' + new Date(evt.date + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''} : choisissez vos prestations.`);
    const apply = () => {
      const q = ($('[data-shop-q]', shop)?.value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const words = q.split(/\s+/).filter(Boolean);
      let n = 0;
      cards.forEach(c => {
        const t = c.textContent.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const ok = (!shop._f || c.dataset.rub.split(' ').includes(shop._f)) && words.every(w => t.includes(w));
        c.hidden = !ok; if (ok) n++;
      });
      if (count) count.textContent = n;
    };
    $$('[data-filter]', shop).forEach(a => {
      if (!$('[data-filter=""]', shop)) return; /* page rubrique : vrais liens */
      a.addEventListener('click', e => {
        if (location.pathname !== '/boutique') return;
        e.preventDefault();
        shop._f = a.dataset.filter;
        $$('[data-filter]', shop).forEach(x => x.classList.toggle('on', x === a));
        history.replaceState(null, '', a.dataset.filter ? '/boutique#' + a.dataset.filter : '/boutique');
        apply();
      });
    });
    if (location.hash && location.pathname === '/boutique') $(`[data-filter="${CSS.escape(location.hash.slice(1))}"]`, shop)?.click();
    const qi = $('[data-shop-q]', shop);
    if (qi && location.pathname !== '/boutique') qi.form.addEventListener('submit', e => { e.preventDefault(); apply(); });
    qi?.addEventListener('input', () => { if (!new URLSearchParams(location.search).get('q')) apply(); });
    $('[data-sort]', shop)?.addEventListener('change', e => {
      const v = e.target.value;
      if (v === 'az') { cards.sort((a, b) => a.dataset.titre.localeCompare(b.dataset.titre, 'fr', { sensitivity: 'base' })).forEach(c => grid.appendChild(c)); return; }
      const key = c => (v === 'ordre' ? +c.dataset.ordre : c.dataset.prix === '' ? 1e12 : +c.dataset.prix);
      cards.sort((a, b) => (v === 'desc' ? key(b) - key(a) : key(a) - key(b))).forEach(c => grid.appendChild(c));
    });
  }

  /* ---------- fiche produit : galerie ---------- */
  $$('[data-gal]').forEach(g => {
    const items = $$('[data-gal-item]', g), th = $$('[data-gal-go]', g);
    let i = 0;
    const go = k => {
      i = (k + items.length) % items.length;
      items.forEach((el, n) => { el.hidden = n !== i; if (el.tagName === 'VIDEO') { if (n === i) el.play().catch(() => {}); else el.pause(); } });
      th.forEach((b, n) => b.classList.toggle('on', n === i));
    };
    th.forEach((b, n) => b.addEventListener('click', () => go(n)));
    $('[data-gal-prev]', g)?.addEventListener('click', () => go(i - 1));
    $('[data-gal-next]', g)?.addEventListener('click', () => go(i + 1));
    let x0 = null;
    g.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    g.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
  });

  /* ---------- fiche produit : composer sa prestation ---------- */
  $$('[data-conf]').forEach(form => {
    const P = JSON.parse(form.dataset.conf);
    const body = $('[data-conf-body]', form);
    const perPers = /personne/.test(P.unite || '');
    const qte0 = P.min || 1; /* règle de Jean-Luc : la quantité de départ est toujours le minimum de la prestation */
    const R = P.regles || {};
    const plur = (u, n) => (n > 1 && u && !/[sx]$/.test(u) && !/ de /.test(u) ? u + 's' : u);
    let html = '';
    if (!P.lieu) html += `<div class="conf-q"><span class="lab">Quantité</span><div class="qty"><button type="button" data-q="-1" aria-label="Moins">−</button><input type="number" name="qte" min="${P.min || 1}" value="${qte0}" inputmode="numeric" aria-label="Quantité"><button type="button" data-q="1" aria-label="Plus">+</button></div><span class="unit" data-unit>${esc(plur(P.unite || '', qte0))}</span></div>${P.min > 1 ? `<p class="small">Minimum : ${P.min} ${esc(plur(P.unite || '', P.min))}</p>` : ''}`;
    if ((P.variantes || []).length) html += `<label class="conf-l">Formule<select name="variante">${P.variantes.map(v => `<option>${esc(v)}</option>`).join('')}</select></label>`;
    for (const g of P.groupes || []) {
      const opts = g.options || [];
      const max = g.max || opts.length;
      html += `<fieldset class="conf-g" data-g="${esc(g.id)}" data-max="${max}" data-exact="${g.exact ? 1 : 0}"><legend>${esc(g.titre || 'Vos choix')} <small>${g.exact ? `${max} au choix` : max < opts.length ? `jusqu’à ${max} au choix` : 'au choix'}${g.facultatif ? ' · facultatif' : ''}</small></legend>
        ${g.aide ? `<p class="small">${esc(g.aide)}</p>` : ''}
        <div class="opts">${opts.map(o => `<label class="opt"><input type="checkbox" value="${esc(o.id)}" data-sup="${o.supCents || 0}">${o.photos?.[0] ? `<img src="${esc(o.photos[0])}" alt="" loading="lazy">` : ''}<span>${esc(o.label)}${o.supCents ? `<small>+ ${euros(o.supCents)}</small>` : ''}${o.supDevis ? '<small>sur devis</small>' : ''}</span></label>`).join('')}</div></fieldset>`;
    }
    if (R.personnel && T.personnel) html += `<details class="conf-x"><summary>Personnel de service <small>facultatif · ${euros(T.personnel.heureCents)} TTC / heure</small></summary><p class="small">${T.personnel.minHeures} heures minimum par personne. Le personnel s’ajoute sur une ligne à part.</p><div class="f2"><label>Personnes<select name="pers_nb"><option value="0">Aucune</option>${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option>${n}</option>`).join('')}</select></label><label>Heures<select name="pers_h">${[4, 5, 6, 7, 8, 9, 10, 12].map(n => `<option>${n}</option>`).join('')}</select></label></div></details>`;
    if (R.packs && (T.packs || []).length) html += `<details class="conf-x"><summary>Pack traiteur <small>facultatif · vaisselle, nappage</small></summary>${T.packs.map(pk => `<label class="radio"><input type="radio" name="pack" value="${esc(pk.id)}"><span><b>${esc(pk.label)}</b> · ${euros(pk.prixCents)} TTC / pers.<small>${esc(pk.detail)}</small></span></label>`).join('')}<label class="radio"><input type="radio" name="pack" value="" checked><span>Pas de pack</span></label></details>`;
    html += `<label class="conf-l">Vos annotations et souhaits <small>(facultatif)</small><textarea name="note" rows="2" placeholder="Allergies, présentation, horaire…"></textarea></label>`;
    body.innerHTML = html;

    const q = form.qte;
    const read = () => {
      const qte = q ? Math.max(P.min || 1, +q.value || 0) : 1;
      let sup = 0; const choix = {}, labels = [];
      $$('[data-g]', form).forEach(fs => { const ids = $$('input:checked', fs).map(i => { sup += +i.dataset.sup; labels.push(i.parentElement.querySelector('span').firstChild.textContent); return i.value; }); if (ids.length) choix[fs.dataset.g] = ids; });
      const persNb = +(form.pers_nb?.value || 0), persH = +(form.pers_h?.value || 4);
      const pack = form.querySelector('[name=pack]:checked')?.value || '';
      let total = P.prixCents == null ? null : (P.prixCents + sup) * qte;
      if (total != null && persNb) total += T.personnel.heureCents * persNb * persH;
      const pk = (T.packs || []).find(x => x.id === pack);
      if (total != null && pk) total += pk.prixCents * qte;
      return { qte, sup, choix, labels, persNb, persH, pack, total, variante: form.variante?.value || '', note: form.note?.value.trim() || '' };
    };
    const refresh = () => {
      const r = read();
      const t = $('[data-conf-total]', form);
      if (t) t.textContent = r.total == null ? 'Sur devis' : euros(r.total);
      const u = $('[data-unit]', form); if (u) u.textContent = plur(P.unite || '', r.qte);
      $$('[data-g]', form).forEach(fs => {
        const max = +fs.dataset.max, n = $$('input:checked', fs).length;
        $$('input', fs).forEach(i => { i.disabled = !i.checked && n >= max; i.parentElement.classList.toggle('on', i.checked); });
      });
    };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    $$('[data-q]', form).forEach(b => b.addEventListener('click', () => { const step = perPers && +q.value >= 20 ? 5 : 1; q.value = Math.max(P.min || 1, (+q.value || 0) + (+b.dataset.q) * step); refresh(); }));
    refresh();
    let go = 'add';
    $$('button[type=submit]', form).forEach(b => b.addEventListener('click', () => { go = b.value; }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = read();
      for (const fs of $$('[data-g]', form)) {
        const g = (P.groupes || []).find(x => x.id === fs.dataset.g) || {};
        const n = $$('input:checked', fs).length;
        if (!g.facultatif && n === 0) { toast('Choisissez au moins une option : ' + (g.titre || '')); fs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        if (g.exact && n !== +fs.dataset.max) { toast(`Choisissez exactement ${fs.dataset.max} options : ${g.titre || ''}`); fs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      }
      sel.add({ slug: P.slug, titre: P.titre, photo: P.photo, rubrique: P.rubrique, unite: P.unite, min: P.min, prixCents: P.prixCents, qte: r.qte, variante: r.variante, choix: r.choix, supCents: r.sup, resume: r.labels.join(', '), note: r.note, personnel: r.persNb ? { nb: r.persNb, heures: r.persH } : null, pack: r.pack ? { id: r.pack, nb: r.qte } : null, lieu: !!P.lieu });
      if (go === 'devis') location.href = '/ma-selection';
      else toast('Ajouté à votre sélection.', ['Voir ma sélection', '/ma-selection']);
    });
  });
  const sticky = $('[data-sticky]'), conf = $('[data-conf]');
  if (sticky && conf && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => sticky.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 }).observe(conf);
    $('[data-scroll-conf]')?.addEventListener('click', () => conf.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  /* ---------- code postal → villes et frais de livraison ---------- */
  const R0 = MG.origine || { lat: 48.6948, lon: 2.2287 };
  const kmAR = (lat, lon) => {
    const rad = x => x * Math.PI / 180;
    const d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(lat - R0.lat) / 2) ** 2 + Math.cos(rad(R0.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lon - R0.lon) / 2) ** 2));
    return Math.max(10, Math.round(d * 1.3 * 2)); /* route ≈ 1,3 × vol d'oiseau, aller-retour */
  };
  function villes(scope, onKm) {
    const cp = $('[data-cp]', scope), v = $('[data-ville]', scope), out = $('[data-livr]', scope);
    if (!cp || !v) return;
    let list = [];
    const upd = () => {
      const c = list.find(x => x.nom === v.value);
      const km = c ? kmAR(c.lat, c.lon) : 0;
      if (out && c) out.innerHTML = `Livraison à ${esc(c.nom)} : environ <b>${km} km</b> aller-retour, soit <b>${euros(km * (T.kmCents || 100))}</b> TTC (confirmé dans votre devis).`;
      onKm && onKm(km, c);
    };
    cp.addEventListener('input', async () => {
      const val = cp.value.replace(/\D/g, '').slice(0, 5); cp.value = val;
      if (val.length !== 5) { v.innerHTML = '<option value="">D’abord le code postal</option>'; list = []; upd(); return; }
      try {
        const r = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${val}&fields=nom,centre&format=json`).then(x => x.json());
        list = r.map(x => ({ nom: x.nom, lat: x.centre?.coordinates?.[1], lon: x.centre?.coordinates?.[0] })).filter(x => x.lat);
      } catch { list = []; }
      v.innerHTML = list.length ? list.map(x => `<option>${esc(x.nom)}</option>`).join('') : '<option value="">Ville introuvable</option>';
      upd();
    });
    v.addEventListener('change', upd);
    if (cp.value) cp.dispatchEvent(new Event('input'));
  }
  $$('[data-calc]').forEach(el => villes(el));

  /* ---------- page Ma sélection ---------- */
  const selPage = $('[data-selection]');
  if (selPage) {
    const list = $('[data-sel-list]', selPage), form = $('[data-demande]');
    const evt = store.get('mg_evt', {});
    const contact = store.get('mg_contact', {});
    if (evt.evt) form.evenement.value = evt.evt;
    if (evt.date) form.date.value = evt.date;
    if (evt.invites) form.invites.value = evt.invites;
    form.date.min = new Date().toISOString().slice(0, 10);
    for (const k of ['nom', 'email', 'tel', 'societe', 'cp']) if (contact[k]) form[k].value = contact[k];
    let km = 0;
    const lineTotal = l => {
      if (l.prixCents == null) return null;
      let t = (l.prixCents + (l.supCents || 0)) * l.qte;
      if (l.personnel) t += (T.personnel?.heureCents || 0) * l.personnel.nb * l.personnel.heures;
      const pk = (T.packs || []).find(x => x.id === l.pack?.id); if (pk) t += pk.prixCents * (l.pack.nb || l.qte);
      return t;
    };
    const render = () => {
      const items = sel.all();
      if (!items.length) {
        list.innerHTML = `<div class="empty"><h2>Votre sélection est vide</h2><p>Un cocktail, un buffet du monde, un DJ ? Tout commence dans la boutique.</p><a class="btn btn-vert" href="/boutique">Voir la boutique</a></div>`;
      } else {
        list.innerHTML = items.map(l => {
          const t = lineTotal(l);
          const pk = (T.packs || []).find(x => x.id === l.pack?.id);
          return `<article class="sel-i" data-k="${l.key}">
            ${l.photo ? `<img src="${esc(l.photo)}" alt="">` : '<span class="noimg"></span>'}
            <div class="sel-c"><p class="eyebrow">${esc(l.rubrique || '')}</p><h3>${esc(l.titre)}${l.variante ? ` <small>· ${esc(l.variante)}</small>` : ''}</h3>
            ${l.resume ? `<p class="small">${esc(l.resume)}</p>` : ''}
            ${l.personnel ? `<p class="small">+ Personnel : ${l.personnel.nb} pers. × ${l.personnel.heures} h</p>` : ''}${pk ? `<p class="small">+ ${esc(pk.label)}</p>` : ''}${l.note ? `<p class="small">Note : ${esc(l.note)}</p>` : ''}
            <div class="sel-a">${l.lieu ? '' : `<div class="qty sm"><button type="button" data-d="-1" aria-label="Moins">−</button><input type="number" value="${l.qte}" min="${l.min || 1}" data-qte aria-label="Quantité"><button type="button" data-d="1" aria-label="Plus">+</button></div><span class="small">${esc(l.unite || '')}</span>`}
            <button type="button" class="lnk" data-del>Retirer</button></div></div>
            <b class="sel-p">${t == null ? 'Sur devis' : euros(t)}</b></article>`;
        }).join('') + '<p class="row"><a class="lnk" href="/boutique">+ Ajouter une autre prestation</a></p>';
      }
      const sub = items.reduce((s, l) => s + (lineTotal(l) || 0), 0);
      const fl = km * (T.kmCents || 100);
      $('[data-sel-sub]').textContent = euros(sub);
      $('[data-sel-livr]').textContent = km ? euros(fl) : '—';
      $('[data-sel-total]').textContent = euros(sub + fl) + (items.some(l => l.prixCents == null) ? ' + sur devis' : '');
    };
    list.addEventListener('click', e => {
      const art = e.target.closest('[data-k]'); if (!art) return;
      const items = sel.all(), it = items.find(x => x.key === art.dataset.k); if (!it) return;
      if (e.target.closest('[data-del]')) { sel.save(items.filter(x => x !== it)); render(); return; }
      const d = e.target.closest('[data-d]');
      if (d) { const step = /personne/.test(it.unite || '') && it.qte >= 20 ? 5 : 1; it.qte = Math.max(it.min || 1, it.qte + (+d.dataset.d) * step); if (it.pack) it.pack.nb = it.qte; sel.save(items); render(); }
    });
    list.addEventListener('change', e => {
      if (!e.target.matches('[data-qte]')) return;
      const items = sel.all(), it = items.find(x => x.key === e.target.closest('[data-k]').dataset.k);
      it.qte = Math.max(it.min || 1, +e.target.value || 1); if (it.pack) it.pack.nb = it.qte; sel.save(items); render();
    });
    villes(form, k => { km = k; render(); });
    render();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const items = sel.all();
      if (!items.length) { toast('Ajoutez au moins une prestation.'); return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = $('[data-send]', form); btn.disabled = true; btn.textContent = 'Envoi…';
      const f = Object.fromEntries(new FormData(form));
      store.set('mg_contact', { nom: f.nom, email: f.email, tel: f.tel, societe: f.societe, cp: f.cp });
      store.set('mg_evt', { evt: f.evenement, date: f.date, invites: +f.invites });
      try {
        const r = await post('/api/demandes', { ...f, km, lignes: items });
        sel.save([]);
        conversion('demande', r.ref, r.totalEstimeCents);
        selPage.hidden = true;
        const done = $('[data-done]');
        done.hidden = false;
        done.innerHTML = `<div class="merci"><p class="eyebrow">Demande envoyée</p><h2>Merci ${esc(f.nom.split(' ')[0])} !</h2><p class="lead">Votre demande <b>${esc(r.ref)}</b> est bien reçue. L’équipe vérifie les disponibilités et vous envoie votre devis très vite, par e-mail.</p><p>Un e-mail de confirmation vient de partir à <b>${esc(f.email)}</b>.</p><p class="row"><a class="btn btn-vert" href="${esc(r.espace)}">Suivre ma demande</a><a class="lnk" href="/">Retour à l’accueil</a></p></div>`;
        scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Envoyer ma demande de devis'; }
    });
  }

  /* ---------- contact, espace client, signature du devis ---------- */
  const contactForm = $('[data-contact]');
  contactForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!contactForm.checkValidity()) { contactForm.reportValidity(); return; }
    const f = Object.fromEntries(new FormData(contactForm));
    try { const r = await post('/api/demandes', { ...f, type: 'contact', lignes: [] }); conversion('contact', r.ref); contactForm.innerHTML = `<p class="ok">Merci, votre message est bien envoyé (référence ${esc(r.ref)}). Nous vous répondons vite.</p>`; }
    catch (err) { toast(err.message); }
  });
  const avisForm = $('[data-avis]');
  avisForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!avisForm.checkValidity()) { avisForm.reportValidity(); return; }
    try { await post('/api/avis', Object.fromEntries(new FormData(avisForm))); avisForm.innerHTML = '<p class="ok">Merci beaucoup ! Votre avis sera publié après relecture par l’équipe.</p>'; }
    catch (err) { toast(err.message); }
  });
  const lien = $('[data-lien]');
  lien?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await post('/api/client/lien', { email: lien.email.value }); $('[data-lien-msg]').textContent = 'Si une demande existe avec cette adresse, un lien de connexion vient de vous être envoyé. Pensez à regarder vos courriers indésirables.'; }
    catch (err) { $('[data-lien-msg]').textContent = err.message; }
  });
  const acc = $('[data-accept]');
  if (acc) {
    const token = acc.closest('[data-sign]').dataset.sign;
    acc.addEventListener('submit', async e => {
      e.preventDefault();
      if (!acc.checkValidity()) { acc.reportValidity(); return; }
      try { await post(`/api/devis/${token}/accepter`, { nom: acc.nom.value }); location.reload(); }
      catch (err) { $('[data-accept-msg]').textContent = err.message; }
    });
    $('[data-refuse]', acc)?.addEventListener('click', async () => {
      if (!confirm('Confirmez-vous ne pas donner suite à ce devis ?')) return;
      try { await post(`/api/devis/${token}/refuser`, {}); location.reload(); } catch (err) { $('[data-accept-msg]').textContent = err.message; }
    });
  }
})();

/* ---------- cookies (règles CNIL) et Google Ads ----------
   Sans identifiant Google Ads réglé dans le back-office : rien n'est chargé, pas de bandeau.
   Avec : « Tout refuser » et « Tout accepter » de même poids ; rien de Google avant l'accord ;
   choix gardé 6 mois ; lien « Gérer mes cookies » en bas de page. */
const MG_CONSENT = 'mg_consent', SIX_MOIS = 182 * 864e5;
function lireAccord() { try { const c = JSON.parse(localStorage.getItem(MG_CONSENT)); return c && Date.now() - c.at < SIX_MOIS ? c : null; } catch { return null; } }
function chargerGoogle() {
  const id = document.body.dataset.ads;
  if (!id || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
  window.gtag('js', new Date()); window.gtag('config', id);
  const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(sc);
}
function conversion(type, ref, cents) {
  const to = document.body.dataset['conv' + type[0].toUpperCase() + type.slice(1)];
  if (!to || !lireAccord()?.ads || typeof window.gtag !== 'function') return;
  window.gtag('event', 'conversion', { send_to: to, transaction_id: ref, ...(cents ? { value: cents / 100, currency: 'EUR' } : {}) });
}
function bandeauCookies() {
  if (!document.body.dataset.ads || document.querySelector('.consent')) return;
  const b = document.createElement('div');
  b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookies');
  b.innerHTML = '<p><b>Cookies</b> : avec votre accord, nous mesurons l’efficacité de nos publicités Google. Vous pouvez refuser, le site fonctionne de la même façon.</p><div><button type="button" class="btn btn-vert" data-c="0">Tout refuser</button><button type="button" class="btn btn-vert" data-c="1">Tout accepter</button></div>';
  document.body.appendChild(b);
  b.addEventListener('click', e => {
    const c = e.target.closest('[data-c]'); if (!c) return;
    try { localStorage.setItem(MG_CONSENT, JSON.stringify({ ads: c.dataset.c === '1', at: Date.now() })); } catch { /* navigation privée */ }
    b.remove();
    if (c.dataset.c === '1') chargerGoogle(); else if (window.gtag) location.reload();
  });
}
(function cookies() {
  if (!document.body.dataset.ads) { document.querySelectorAll('[data-cookies]').forEach(a => a.hidden = true); return; }
  const c = lireAccord();
  if (c?.ads) chargerGoogle(); else if (!c) bandeauCookies();
  document.addEventListener('click', e => { if (e.target.closest('[data-cookies]')) { e.preventDefault(); try { localStorage.removeItem(MG_CONSENT); } catch { /* */ } bandeauCookies(); } });
})();

/* pages d'arrivée : vidéo du bandeau, avis « voir plus », clic sur un logo client → son avis */
(() => {
  document.querySelectorAll('.phero.land video').forEach(v => {
    const go = () => { const p = v.play(); if (p) p.catch(() => {}); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); return; }
    go(); document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });
  });
  const plus = document.querySelector('[data-avis-plus]');
  const montrer = el => { if (el && el.hidden) el.hidden = false; };
  const reste = () => document.querySelectorAll('[data-avis-item][hidden]').length;
  const maj = () => { if (!plus) return; const n = reste(); if (!n) plus.closest('p').remove(); else plus.querySelector('small').textContent = `(${n})`; };
  if (plus) plus.addEventListener('click', () => { [...document.querySelectorAll('[data-avis-item][hidden]')].slice(0, +plus.dataset.avisPlus || 24).forEach(montrer); maj(); });
  const cible = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id.startsWith('avis-')) return;
    const el = document.getElementById(id); if (!el) return;
    montrer(el); maj(); requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  window.addEventListener('hashchange', cible); cible();
})();

/* spécialités : la vidéo de la vignette se lance au survol (ordinateur) */
(() => {
  if (!window.matchMedia('(hover: hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.tile.spe').forEach(t => {
    const v = t.querySelector('video[data-survol]'); if (!v) return;
    t.addEventListener('mouseenter', () => { const p = v.play(); if (p) p.then(() => t.classList.add('joue')).catch(() => {}); });
    t.addEventListener('mouseleave', () => { t.classList.remove('joue'); v.pause(); });
  });
})();
