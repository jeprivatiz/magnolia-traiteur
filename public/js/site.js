/* Magnolia Traiteur : petits comportements du site (aucune dépendance). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MG = window.MG || {};
  const T = MG.tarifs || {};
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* formules de buffet : nom sur une ligne, formule en dessous, sans tiret (copie de server/util.js coupeTitre) */
  /* taille d'une portion, ajoutée au nom partout (Jean-Luc, 2026-11-24) — copie de server/util.js PORTIONS */
  const PORTIONS = [[/^a?c+ras?\b/i, '1 portion = 4 accras'], [/^sam[ou]+s+as?\b/i, '1 portion = 1 samoussa'], [/^boudins?\b/i, '1 portion = 1 boudin']];
  const avecPortion = t => { t = String(t ?? ''); const x = PORTIONS.find(([re]) => re.test(t)); if (!x || t.includes(x[1])) return t; const i = t.indexOf(' : '); return i > 0 ? `${t.slice(0, i)} (${x[1]})${t.slice(i)}` : `${t} (${x[1]})`; };
  const titreHtml = t => { t = avecPortion(t); const m = /^(Buffets?\s[^—·()]+?)\s+[—·–-]\s+(\S.*)$/u.exec(String(t ?? '').trim()); return m ? `${esc(m[1])}<span class="formule">${esc(m[2].charAt(0).toUpperCase() + m[2].slice(1))}</span>` : esc(t); };
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

  /* ---------- bouton « Partager » : partage du téléphone (SMS, WhatsApp, mail…) ou copie du lien sur ordinateur ---------- */
  const copier = async (txt) => {
    try { await navigator.clipboard.writeText(txt); return true; } catch { /* ancien navigateur */ }
    const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; } ta.remove(); return ok;
  };
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-partage]'); if (!b) return;
    const url = location.href.split('#')[0];
    const titre = (document.querySelector('h1')?.innerText || document.title).trim().replace(/\s+/g, ' ');
    const tactile = matchMedia('(pointer: coarse)').matches;
    if (navigator.share && tactile) {
      try { await navigator.share({ title: titre, text: titre + ' · Magnolia Traiteur', url }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    toast(await copier(url) ? 'Lien copié : vous pouvez le coller dans un SMS, un e-mail ou WhatsApp.' : 'Copiez ce lien : ' + url);
  });

  /* ---------- bulle « Revenir à la page précédente » (téléphone) : page d'avant sur le site, sinon l'accueil ---------- */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-retour]')) return;
    let duSite = false;
    try { duSite = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { duSite = false; }
    if (duSite && history.length > 1) history.back(); else location.href = '/';
  });

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
        out.innerHTML = r.resultats.length ? r.resultats.map(x => `<a class="live-i${x.page ? ' live-page' : ''}" href="${x.href}">${x.photo ? `<img src="${esc(x.photo)}" alt="">` : x.page ? '<span class="live-ico">→</span>' : '<span></span>'}<span><b>${titreHtml(x.titre)}</b><small>${esc(x.rubrique)} · ${esc(x.prix)}</small></span></a>`).join('') + `<a class="live-all" href="/boutique?q=${encodeURIComponent(q)}">Voir tous les résultats pour « ${esc(q)} »</a>`
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
      const us = $$('[name=u]:checked', pave).map(x => x.value);
      store.set('mg_evt', { evt: pave.evt.value, date: pave.date.value, invites: +pave.invites.value, univers: us });
      const pour = 'pour=' + encodeURIComponent(pave.evt.value);
      location.href = us.length === 1 ? (us[0] === 'lieux' ? '/lieux' : `/${us[0]}?${pour}`) : us.length ? `/boutique?u=${us.join(',')}&${pour}` : '/boutique?' + pour;
    });
    /* « Nos univers » : plusieurs choix possibles ; le champ résume ce qui est coché */
    const ub = $('[data-pave-u]', pave);
    if (ub) {
      const txt = $('[data-pave-u-txt]', ub), vide = txt.textContent;
      const maj = () => { const n = $$('[name=u]:checked', ub).map(x => x.closest('label').textContent.trim()); txt.textContent = n.length ? (n.length > 1 ? `${n[0]} + ${n.length - 1}` : n[0]) : vide; ub.classList.toggle('on', n.length > 0); };
      (evt.univers || []).forEach(v => { const x = $(`[name=u][value="${v}"]`, ub); if (x) x.checked = true; });
      /* chaque case cochée ou décochée est gardée tout de suite : un univers retiré ne revient plus au retour sur l'accueil */
      const garder = () => store.set('mg_evt', { ...store.get('mg_evt', {}), univers: $$('[name=u]:checked', ub).map(x => x.value) });
      const relire = () => { const u = store.get('mg_evt', {}).univers || []; $$('[name=u]', ub).forEach(x => { x.checked = u.includes(x.value); }); maj(); };
      ub.addEventListener('change', () => { maj(); garder(); }); maj();
      addEventListener('pageshow', relire);
      document.addEventListener('click', e => { if (ub.open && !ub.contains(e.target)) ub.open = false; });
    }
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
    const cards = $$('[data-card]', shop);
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
      $$('[data-bloc]', shop).forEach(b => { b.hidden = !$$('[data-card]', b).some(c => !c.hidden); });
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
    /* Saveurs du monde : toujours la page du globe, jamais un filtre mélangé dans la boutique (Jean-Luc, 2026-11-23) */
    /* idem pour une rubrique présentée en sections (La carte Magnolia : entrées, plats, fromages, desserts) */
    const lien = location.pathname === '/boutique' && location.hash && $(`a[data-lien][href="/${CSS.escape(location.hash.slice(1))}"]`, shop);
    if (location.pathname === '/boutique' && location.hash === '#saveurs-du-monde') { location.replace('/saveurs-du-monde'); }
    else if (lien) { location.replace(lien.getAttribute('href')); }
    else
    if (location.hash && location.pathname === '/boutique') $(`[data-filter="${CSS.escape(location.hash.slice(1))}"]`, shop)?.click();
    /* Démonstration des filtres (Jean-Luc, 2026-11-24) : tant que le visiteur n'a rien touché, les boutons
       s'allument doucement l'un après l'autre et les produits changent en fondu, en boucle. Au premier geste
       (clic, toucher, molette, clavier, recherche, tri, défilement vers les produits) la démo s'arrête pour de bon. */
    const row = $('.chips[role="tablist"]', shop), grid = $('[data-grid]', shop);
    if (row && grid && location.pathname === '/boutique' && !location.hash && !new URLSearchParams(location.search).get('q')
      && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const chips = $$('.chip', row);
      const slug = a => a.hasAttribute('data-filter') ? a.dataset.filter : (a.getAttribute('href') || '').slice(1);
      const GESTES = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin'];
      const PAS = 3500, FONDU = 380;
      let k = 0, timer = null, vu = false, fini = false;
      const montre = a => {
        chips.forEach(x => x.classList.toggle('on', x === a));
        /* la rangée défile seule (jamais la page) pour garder le bouton allumé au centre */
        const g = a.offsetLeft - row.offsetLeft - (row.clientWidth - a.offsetWidth) / 2;
        row.scrollTo({ left: Math.max(0, g), behavior: 'smooth' });
        /* la grille ne raccourcit jamais au-dessus du bas de l'écran : rien ne saute */
        const bas = innerHeight - grid.getBoundingClientRect().top;
        grid.style.minHeight = bas > 0 ? Math.ceil(bas) + 'px' : '';
        grid.classList.add('demo-fondu');
        setTimeout(() => { if (fini) return; shop._f = slug(a); apply(); grid.classList.remove('demo-fondu'); }, FONDU);
      };
      const suivant = () => { if (fini) return; k = (k + 1) % chips.length; montre(chips[k]); };
      const marche = () => { if (!fini && vu && !document.hidden && !timer) timer = setInterval(suivant, PAS); };
      const pause = () => { clearInterval(timer); timer = null; };
      const auDefil = () => { if (row.getBoundingClientRect().bottom < 0) stop(); };
      const io = new IntersectionObserver(es => { vu = es[0].isIntersecting; if (vu) marche(); else pause(); });
      function stop() {
        if (fini) return;
        fini = true; pause(); io.disconnect();
        grid.classList.remove('demo-fondu');
        GESTES.forEach(t => shop.removeEventListener(t, stop, true));
        window.removeEventListener('scroll', auDefil);
      }
      /* premier geste du visiteur : la démo s'arrête avant le filtrage normal, son choix reste */
      GESTES.forEach(t => shop.addEventListener(t, stop, { capture: true, passive: true }));
      row.addEventListener('click', () => { grid.style.minHeight = ''; }, true);
      /* le visiteur descend dans les produits : il regarde, on n'y touche plus */
      window.addEventListener('scroll', auDefil, { passive: true });
      io.observe(row);
      document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else marche(); });
    }
    /* catégories (La cave de Magnolia, Jean-Luc 2026-11-25) : on touche une catégorie, seule celle-ci reste à l'écran ;
       « Toutes les catégories » (ou la même vignette) remet tout. L'adresse garde la catégorie (#vins-rouges) pour le retour arrière. */
    const cats = $('[data-cats]', shop);
    if (cats) {
      const blocs = $$('[data-bloc]', shop);
      const choisir = (k, defile) => {
        $$('[data-cat]', cats).forEach(a => a.classList.toggle('on', !!k && a.dataset.cat === k));
        blocs.forEach(b => b.classList.toggle('cat-off', !!k && b.id !== k));
        shop.classList.toggle('cat-choisie', !!k);
        const cible = k ? document.getElementById(k) : cats;
        if (defile && cible) cible.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      };
      $$('[data-cat]', shop).forEach(a => a.addEventListener('click', e => {
        e.preventDefault();
        const k = a.dataset.cat && !a.classList.contains('on') ? a.dataset.cat : '';
        history.replaceState(null, '', k ? '#' + k : location.pathname + location.search);
        choisir(k, true);
      }));
      const h = decodeURIComponent(location.hash.slice(1));
      if (h && blocs.some(b => b.id === h)) choisir(h, false);
    }
    const qi = $('[data-shop-q]', shop);
    if (qi && location.pathname !== '/boutique') qi.form.addEventListener('submit', e => { e.preventDefault(); apply(); });
    qi?.addEventListener('input', () => { if (!new URLSearchParams(location.search).get('q')) apply(); });
    $('[data-sort]', shop)?.addEventListener('change', e => {
      const v = e.target.value;
      if (v === 'az') { cards.sort((a, b) => a.dataset.titre.localeCompare(b.dataset.titre, 'fr', { sensitivity: 'base' })).forEach(c => c.parentElement.appendChild(c)); return; }
      const key = c => (v === 'ordre' ? +c.dataset.ordre : c.dataset.prix === '' ? 1e12 : +c.dataset.prix);
      cards.sort((a, b) => (v === 'desc' ? key(b) - key(a) : key(a) - key(b))).forEach(c => c.parentElement.appendChild(c));
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
    /* règle de Jean-Luc (2026-11-22) : la fiche s'ouvre TOUJOURS sur le minimum de la prestation.
       Si le client a déjà indiqué un nombre d'invités plus grand (pavé de recherche ou devis), on le lui propose en un clic, sans l'imposer. */
    const nbInv = +(store.get('mg_evt', {}).invites) || 0;
    const qte0 = P.min || 1;
    const propInv = perPers && nbInv > qte0 ? nbInv : 0;
    const R = P.regles || {};
    const plur = (u, n) => (n > 1 && u && !/[sx]$/.test(u) && !/ de /.test(u) ? u + 's' : u);
    let html = '';
    if (!P.lieu) html += `<div class="conf-q"><span class="lab">Quantité</span><div class="qty"><button type="button" data-q="-1" aria-label="Moins">−</button><input type="number" name="qte" min="${P.min || 1}" value="${qte0}" inputmode="numeric" aria-label="Quantité"><button type="button" data-q="1" aria-label="Plus">+</button></div><span class="unit" data-unit>${esc(plur(P.unite || '', qte0))}</span></div>${P.min > 1 ? `<p class="small">Minimum : ${P.min} ${esc(plur(P.unite || '', P.min))}</p>` : ''}${propInv ? `<p class="small"><button type="button" class="lnk-inv" data-inv="${propInv}">Mettre ${propInv} ${esc(plur(P.unite || '', propInv))} (vos invités)</button></p>` : ''}`;
    if ((P.variantes || []).length) html += `<label class="conf-l">Formule<select name="variante">${P.variantes.map(v => `<option>${esc(v)}</option>`).join('')}</select></label>`;
    for (const g of P.groupes || []) {
      const opts = (g.options || []).map(o => ({ ...o, label: avecPortion(o.label) }));
      /* « compris dans la formule » (Buffet des traditions) : simple liste cochée d'avance, rien à choisir */
      if (g.compris) { if (opts.length) html += `<div class="conf-inc"${(g.variantes || []).length && (P.variantes || []).length ? ` data-var="${esc(JSON.stringify(g.variantes))}"` : ''}><p class="conf-inc-t">${esc(g.titre || 'Compris dans la formule')}</p><ul>${opts.map(o => `<li>${esc(o.label)}</li>`).join('')}</ul></div>`; continue; }
      const max = g.max || opts.length;
      html += `<fieldset class="conf-g" data-g="${esc(g.id)}"${(g.variantes || []).length && (P.variantes || []).length ? ` data-var="${esc(JSON.stringify(g.variantes))}"` : ''} data-max="${max}" data-exact="${g.exact ? 1 : 0}"><legend>${esc(g.titre || 'Vos choix')} <small>${g.radio ? '' : g.mode === 'quantites' ? `${g.minParVariete || 1} portions minimum par ${esc(g.singulier || 'choix')}` : g.exact ? `${max} au choix` : max < opts.length ? `jusqu’à ${max} au choix` : 'au choix'}${g.facultatif ? ' · facultatif' : ''}</small></legend>
        ${g.aide ? `<p class="small">${esc(g.aide)}</p>` : ''}
        ${g.mode === 'quantites' ? `<p class="gstat" data-gstat aria-live="polite"></p><div class="opts-q">${opts.map(o => `<div class="optq" data-optq>${o.photos?.[0] ? `<img src="${esc(o.photos[0])}" alt="" loading="lazy">` : ''}<span>${esc(o.label)}${o.supCents ? `<small class="optq-sup" title="Supplément de ${euros(o.supCents)} TTC par part">+ ${euros(o.supCents)} / part</small>` : ''}<small class="optq-why" data-why></small></span><span class="optq-c"><button type="button" data-om="-1" aria-label="Moins : ${esc(o.label)}">−</button><input type="number" min="0" step="1" inputmode="numeric" value="0" data-oq="${esc(o.id)}" data-lab="${esc(o.label)}" data-sup="${o.supCents || 0}" aria-label="Portions : ${esc(o.label)}"><button type="button" data-om="1" aria-label="Plus : ${esc(o.label)}">+</button></span></div>`).join('')}</div>` : g.radio ? `<div class="opts-r">${opts.map((o, k) => `<label class="opt-r"><input type="radio" name="r_${esc(g.id)}" value="${esc(o.id)}" data-sup="${o.supCents || 0}"${k === 0 ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>` : `<div class="opts">${opts.map(o => `<label class="opt"><input type="checkbox" value="${esc(o.id)}" data-sup="${o.supCents || 0}">${o.photos?.[0] ? `<img src="${esc(o.photos[0])}" alt="" loading="lazy">` : ''}<span>${esc(o.label)}${o.supCents ? `<small>+ ${euros(o.supCents)}</small>` : ''}${o.supDevis ? '<small>sur devis</small>' : ''}</span></label>`).join('')}</div>`}</fieldset>`;
    }
    if (R.personnel && T.personnel) html += `<details class="conf-x"><summary>Personnel de service <small>facultatif · ${euros(T.personnel.heureCents)} TTC / heure</small></summary><p class="small">${T.personnel.minHeures} heures minimum par personne. Le personnel s’ajoute sur une ligne à part.</p><div class="f2"><label>Personnes<select name="pers_nb"><option value="0">Aucune</option>${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option>${n}</option>`).join('')}</select></label><label>Heures<select name="pers_h">${[4, 5, 6, 7, 8, 9, 10, 12].map(n => `<option>${n}</option>`).join('')}</select></label></div></details>`;
    if (R.packs && (T.packs || []).length) html += `<details class="conf-x"><summary>Pack traiteur <small>facultatif · vaisselle, nappage</small></summary>${T.packs.map(pk => `<label class="radio"><input type="radio" name="pack" value="${esc(pk.id)}"><span><b>${esc(pk.label)}</b> · ${euros(pk.prixCents)} TTC / pers.<small>${esc(pk.detail)}</small></span></label>`).join('')}<label class="radio"><input type="radio" name="pack" value="" checked><span>Pas de pack</span></label></details>`;
    /* autres propositions choisies dans le back-office pour ce produit (ex. Mobilier pour bar à cocktail) */
    (P.propositions || []).forEach(B => {
      html += `<details class="conf-x conf-prop" open><summary>${esc(B.titre)} <small>facultatif · à ajouter à votre sélection</small></summary><div class="props-l">${B.items.map(x => {
        const prix = x.prixCents == null ? esc(x.prixAffiche || 'Sur devis') : `${euros(x.prixCents)} TTC${x.unite ? ' / ' + esc(x.unite) : ''}`;
        const im = x.photo ? `<img src="${esc(x.photo)}" alt="" loading="lazy">` : '<span class="ph"></span>';
        if (x.choix) return `<a class="prop-i lien" href="${esc(x.href)}" target="_blank" rel="noopener">${im}<span class="prop-t"><b>${esc(x.nom)}</b><small>${prix}</small></span><em>Choisir ›</em></a>`;
        return `<div class="prop-i" data-prop="${esc(x.slug)}"><label class="prop-c"><input type="checkbox" data-prop-on aria-label="Ajouter : ${esc(x.nom)}">${im}<span class="prop-t"><b>${esc(x.nom)}</b><small>${prix}${x.contenuPortion ? ` (${esc(x.contenuPortion)})` : ''}${x.min > 1 ? ` · dès ${x.min}` : ''}</small></span></label><div class="qty sm"><button type="button" data-pq="-1" aria-label="Moins">−</button><input type="number" min="${x.min}" value="${x.min}" inputmode="numeric" data-pq-n aria-label="Quantité : ${esc(x.nom)}"><button type="button" data-pq="1" aria-label="Plus">+</button></div></div>`;
      }).join('')}</div></details>`;
    });
    html += `<label class="conf-l">Vos annotations et souhaits <small>(facultatif)</small><textarea name="note" rows="2" placeholder="Allergies, présentation, horaire…"></textarea></label>`;
    body.innerHTML = html;

    const q = form.qte;
    const read = () => {
      const qte = q ? Math.max(P.min || 1, +q.value || 0) : 1;
      let sup = 0; const choix = {}, labels = [], supps = [];
      $$('[data-g]', form).forEach(fs => { if (fs.hidden) return; if ($('[data-oq]', fs)) { const q2 = $$('[data-oq]', fs).filter(i => +i.value > 0); if (q2.length) choix[fs.dataset.g] = q2.map(i => i.dataset.oq + ':' + Math.round(+i.value)); q2.forEach(i => { labels.push(`${i.dataset.lab} × ${Math.round(+i.value)}`); if (+i.dataset.sup) supps.push({ id: i.dataset.oq, label: i.dataset.lab, n: Math.round(+i.value), puCents: +i.dataset.sup }); }); return; } const ids = $$('input:checked', fs).map(i => { sup += +i.dataset.sup; labels.push(i.parentElement.querySelector('span').firstChild.textContent); return i.value; }); if (ids.length) choix[fs.dataset.g] = ids; });
      const persNb = +(form.pers_nb?.value || 0), persH = +(form.pers_h?.value || 4);
      const pack = form.querySelector('[name=pack]:checked')?.value || '';
      let total = P.prixCents == null ? null : (P.prixCents + sup) * qte + supps.reduce((t, x) => t + x.n * x.puCents, 0);
      if (total != null && persNb) total += T.personnel.heureCents * persNb * persH;
      const pk = (T.packs || []).find(x => x.id === pack);
      if (total != null && pk) total += pk.prixCents * qte;
      const props = $$('[data-prop]', form).filter(d => $('[data-prop-on]', d).checked).map(d => { const x = (P.propositions || []).flatMap(B => B.items).find(y => y.slug === d.dataset.prop); return x && { x, n: Math.max(x.min || 1, Math.round(+$('[data-pq-n]', d).value || 0)) }; }).filter(Boolean);
      props.forEach(({ x, n }) => { if (total != null && x.prixCents != null) total += x.prixCents * n; });
      return { props, qte, sup, supps, choix, labels, persNb, persH, pack, total, variante: form.variante?.value || '', note: form.note?.value.trim() || '' };
    };
    /* plats à choisir en portions (règle de Jean-Luc) : le total des portions = le nombre de personnes,
       au moins « minParVariete » portions (5) pour chaque plat choisi, donc au plus floor(personnes / 5) plats différents */
    const regleG = fs => { const g = (P.groupes || []).find(x => x.id === fs.dataset.g) || {}; const mn = g.minParVariete || 1, sg = g.singulier || 'choix'; return { g, mn, sg, sgs: /[sx]$/.test(sg) ? sg : sg + 's' }; };
    const portions = (fs, qte) => {
      const { g, mn, sg, sgs } = regleG(fs);
      const ins = $$('[data-oq]', fs), v = ins.map(i => Math.max(0, Math.round(+i.value || 0)));
      const tot = v.reduce((a, b) => a + b, 0), nb = v.filter(x => x > 0).length, reste = qte - tot;
      const maxF = +fs.dataset.max || ins.length, maxP = Math.floor(qte / mn), maxChoix = Math.max(1, Math.min(maxF, maxP));
      const fem = /ée$/.test(sg), chac = fem ? 'chacune' : 'chacun', diff = n => (fem ? 'différente' : 'différent') + (n > 1 ? 's' : '');
      const st = $('[data-gstat]', fs);
      if (st) {
        st.className = 'gstat ' + (reste === 0 ? 'ok' : reste < 0 ? 'ko' : '');
        st.innerHTML = `<b>${reste === 0 ? `✓ ${tot} portions sur ${qte} : c’est complet` : reste > 0 ? `${reste} portion${reste > 1 ? 's' : ''} restante${reste > 1 ? 's' : ''} sur ${qte}` : `${-reste} portion${reste < -1 ? 's' : ''} de trop (${tot} pour ${qte} personnes)`}</b>`
          + `<span>Le total doit faire ${qte} portions (une par personne), avec ${mn} portions minimum par ${sg}. ${maxF <= maxP ? `Cette formule : jusqu’à ${maxChoix}` : `Pour ${qte} personnes : jusqu’à ${maxChoix}`} ${maxChoix > 1 ? sgs : sg} ${diff(maxChoix)}.</span>`;
      }
      ins.forEach((i, k) => {
        const box = i.closest('[data-optq]'), why = $('[data-why]', box), on = v[k] > 0;
        let bloque = '';
        if (!on && nb >= maxChoix) bloque = maxF <= maxP ? `Cette formule comprend ${maxF} ${maxF > 1 ? sgs : sg} au maximum.` : `Pour ${qte} personnes, ${maxP} ${maxP > 1 ? sgs : sg} au maximum (${mn} portions minimum ${chac}).`;
        else if (!on && reste < mn) bloque = reste > 0 ? `Il ne reste que ${reste} portion${reste > 1 ? 's' : ''} : ajoutez-les à un ${sg} déjà choisi.` : `Toutes les portions sont attribuées.`;
        box.classList.toggle('on', on); box.classList.toggle('off', !!bloque);
        $('[data-om="1"]', box).disabled = !!bloque || (on && reste <= 0);
        $('[data-om="-1"]', box).disabled = !on;
        i.disabled = !!bloque;
        if (why) why.textContent = bloque || (on && v[k] < mn ? `${mn} portions minimum` : '');
      });
      return { tot, mn, sg, sgs };
    };
    form.addEventListener('click', e => {
      const pb = e.target.closest('[data-pq]');
      if (pb) { const d = pb.closest('[data-prop]'), i = $('[data-pq-n]', d), x = (P.propositions || []).flatMap(B => B.items).find(y => y.slug === d.dataset.prop) || {}; i.value = Math.max(x.min || 1, (+i.value || 0) + (+pb.dataset.pq)); $('[data-prop-on]', d).checked = true; refresh(); return; }
      const b = e.target.closest('[data-om]'); if (!b) return;
      const fs = b.closest('[data-g]'), i = $('[data-oq]', b.parentElement), { mn } = regleG(fs);
      const qte = Math.max(P.min || 1, +(q?.value) || 0), tot = $$('[data-oq]', fs).reduce((a, x) => a + Math.max(0, Math.round(+x.value || 0)), 0);
      const cur = Math.max(0, Math.round(+i.value || 0));
      /* + : de 0, on prend d'un coup le minimum (5), ou tout ce qui reste ; − : sous le minimum, on retire le plat */
      if (+b.dataset.om > 0) i.value = cur === 0 ? Math.max(mn, Math.min(qte - tot, mn)) : cur + 1;
      else i.value = cur - 1 < mn ? 0 : cur - 1;
      refresh();
    });
    /* formule choisie : seuls les groupes compris dans la formule restent visibles ; les choix des autres sont décochés */
    const formule = () => {
      const v = form.variante?.value || '';
      $$('[data-var]', form).forEach(fs => { const ok = JSON.parse(fs.dataset.var).includes(v); fs.hidden = !ok; if (!ok) $$('input:checked', fs).forEach(i => { i.checked = false; }); });
    };
    const refresh = () => {
      formule();
      const r = read();
      const t = $('[data-conf-total]', form);
      if (t) t.textContent = r.total == null ? (P.prixAffiche || 'Sur devis') : euros(r.total);
      /* suppléments par part (coq roussi + 5 €) : une ligne chacun, juste au-dessus du total */
      let sp = $('[data-conf-supp]', form);
      if (!sp && t) { sp = document.createElement('div'); sp.className = 'conf-supp'; sp.dataset.confSupp = ''; t.closest('.conf-tot').before(sp); }
      if (sp) { sp.hidden = !r.supps.length; sp.innerHTML = r.supps.map(x => `<p><span>Supplément ${esc(x.label.toLowerCase())}<small>${x.n} part${x.n > 1 ? 's' : ''} × ${euros(x.puCents)}</small></span><b>+ ${euros(x.n * x.puCents)}</b></p>`).join(''); }
      const u = $('[data-unit]', form); if (u) u.textContent = plur(P.unite || '', r.qte);
      $$('[data-prop]', form).forEach(d => d.classList.toggle('on', $('[data-prop-on]', d).checked));
      $$('[data-g]', form).forEach(fs => {
        if ($('[data-oq]', fs)) return portions(fs, r.qte);
        if ($('input[type=radio]', fs)) { $$('input', fs).forEach(i => i.parentElement.classList.toggle('on', i.checked)); return; }
        const max = +fs.dataset.max, n = $$('input:checked', fs).length;
        $$('input', fs).forEach(i => { i.disabled = !i.checked && n >= max; i.parentElement.classList.toggle('on', i.checked); });
      });
    };
    form.addEventListener('input', refresh); form.addEventListener('change', refresh);
    $('[data-inv]', form)?.addEventListener('click', e => { q.value = e.currentTarget.dataset.inv; e.currentTarget.parentElement.remove(); refresh(); });
    $$('[data-q]', form).forEach(b => b.addEventListener('click', () => { const step = perPers && +q.value >= 20 ? 5 : 1; q.value = Math.max(P.min || 1, (+q.value || 0) + (+b.dataset.q) * step); refresh(); }));
    refresh();
    let go = 'add';
    $$('button[type=submit]', form).forEach(b => b.addEventListener('click', () => { go = b.value; }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = read();
      for (const fs of $$('[data-g]', form)) {
        if (fs.hidden) continue;
        const g = (P.groupes || []).find(x => x.id === fs.dataset.g) || {};
        if ($('[data-oq]', fs)) {
          const v = $$('[data-oq]', fs).map(i => Math.max(0, Math.round(+i.value || 0))), tot = v.reduce((a, b) => a + b, 0), mn = g.minParVariete || 1, sg = g.singulier || 'choix';
          let msg = '';
          if (!tot) msg = `Indiquez le nombre voulu pour chaque ${sg}.`;
          else if (v.some(x => x > 0 && x < mn)) msg = `${mn} portions minimum pour chaque ${sg} choisi.`;
          else if (tot !== r.qte) msg = tot < r.qte ? `Il reste ${r.qte - tot} portion${r.qte - tot > 1 ? 's' : ''} à répartir : le total doit faire ${r.qte} (une par personne).` : `${tot - r.qte} portion${tot - r.qte > 1 ? 's' : ''} de trop : le total doit faire ${r.qte} (une par personne).`;
          if (msg) { toast(msg); fs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
          continue;
        }
        const n = $$('input:checked', fs).length;
        if (!g.facultatif && n === 0) { toast('Choisissez au moins une option : ' + (g.titre || '')); fs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
        if (g.exact && n !== +fs.dataset.max) { toast(`Choisissez exactement ${fs.dataset.max} options : ${g.titre || ''}`); fs.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      }
      sel.add({ slug: P.slug, titre: P.titre, photo: P.photo, rubrique: P.rubrique, unite: P.unite, min: P.min, prixCents: P.prixCents, qte: r.qte, variante: r.variante, choix: r.choix, supCents: r.sup, supplements: r.supps, resume: r.labels.join(', '), note: r.note, personnel: r.persNb ? { nb: r.persNb, heures: r.persH } : null, pack: r.pack ? { id: r.pack, nb: r.qte } : null, lieu: !!P.lieu });
      r.props.forEach(({ x, n }) => sel.add({ slug: x.slug, titre: x.titre, photo: x.photo, rubrique: x.rubrique, unite: x.unite, min: x.min, prixCents: x.prixCents, qte: n, variante: '', choix: {}, supCents: 0, supplements: [], resume: '', note: '', personnel: null, pack: null, lieu: false, avec: P.titre }));
      if (go === 'devis') location.href = '/ma-selection';
      else toast(r.props.length ? `Ajouté à votre sélection, avec ${r.props.length > 1 ? r.props.length + ' propositions' : '1 proposition'}.` : 'Ajouté à votre sélection.', ['Voir ma sélection', '/ma-selection']);
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
      const L = window.MGLivr, hors = L && L.horsZone(cp.value);
      if (out && (c || hors)) out.innerHTML = hors ? `<b>${esc(c ? c.nom : 'Ce lieu')} est hors Île-de-France : nous consulter</b> pour la livraison (au ${esc(MG.tel || '')}). Votre demande de devis reste possible.`
        : L ? `Livraison à ${esc(c.nom)} : environ <b>${km} km</b> aller-retour, soit de <b>${euros(L.frais(T, 0, km))}</b> à <b>${euros(km * Math.min(...L.paliers(T).map(x => x.kmCents).filter(Boolean)))}</b> TTC selon le montant de la commande${L.offerteDes(T) != null ? `, <b>offerte au-delà de ${euros(L.offerteDes(T))} TTC</b>` : ''} (confirmé dans votre devis).`
        : `Livraison à ${esc(c.nom)} : environ <b>${km} km</b> aller-retour (confirmé dans votre devis).`;
      onKm && onKm(km, c, hors);
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
    let km = 0, hors = false;
    const lineTotal = l => {
      if (l.prixCents == null) return null;
      let t = (l.prixCents + (l.supCents || 0)) * l.qte + (l.supplements || []).reduce((s, x) => s + x.n * x.puCents, 0);
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
            <div class="sel-c"><p class="eyebrow">${esc(l.rubrique || '')}</p><h3>${titreHtml(l.titre)}${l.variante ? ` <small>· ${esc(l.variante)}</small>` : ''}</h3>
            ${l.resume ? `<p class="small">${esc(l.resume)}</p>` : ''}${(l.supplements || []).map(x => `<p class="small sel-supp">+ Supplément ${esc(x.label.toLowerCase())} : ${x.n} part${x.n > 1 ? 's' : ''} × ${euros(x.puCents)} = <b>${euros(x.n * x.puCents)}</b></p>`).join('')}
            ${l.personnel ? `<p class="small">+ Personnel : ${l.personnel.nb} pers. × ${l.personnel.heures} h</p>` : ''}${pk ? `<p class="small">+ ${esc(pk.label)}</p>` : ''}${l.note ? `<p class="small">Note : ${esc(l.note)}</p>` : ''}
            <div class="sel-a">${l.lieu ? '' : `<div class="qty sm"><button type="button" data-d="-1" aria-label="Moins">−</button><input type="number" value="${l.qte}" min="${l.min || 1}" data-qte aria-label="Quantité"><button type="button" data-d="1" aria-label="Plus">+</button></div><span class="small">${esc(l.unite || '')}</span>`}
            <button type="button" class="lnk" data-del>Retirer</button></div></div>
            <b class="sel-p">${t == null ? 'Sur devis' : euros(t)}</b></article>`;
        }).join('') + '<p class="row"><a class="lnk" href="/boutique">+ Ajouter une autre prestation</a></p>';
      }
      const sub = items.reduce((s, l) => s + (lineTotal(l) || 0), 0);
      /* paliers de livraison (Jean-Luc, 2026-11-25) : prix du km selon le total, et message à chaque palier suivant */
      const L = window.MGLivr, pu = hors ? 0 : L ? L.kmCents(T, sub) : 100, offerte = km && !hors && pu === 0;
      const fl = km * pu;
      $('[data-sel-sub]').textContent = euros(sub);
      $('[data-sel-livr]').textContent = hors ? 'Nous consulter' : km ? (offerte ? 'Offerte' : euros(fl)) : '—';
      const rest = $('[data-sel-offerte]');
      if (rest) {
        const msg = hors ? 'Livraison hors Île-de-France : nous consulter, le tarif sera précisé dans votre devis.' : L ? L.message(T, sub) : '';
        rest.innerHTML = msg ? `${hors || offerte || !L ? '' : `Livraison à <b>${euros(pu)} TTC du km</b> aller-retour pour ce montant. `}${esc(msg)}` : '';
        rest.classList.toggle('proche', !!(L && !hors && L.suivant(T, sub) && L.suivant(T, sub).manqueCents <= 10000));
      }
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
    villes(form, (k, c, h) => { km = k; hors = !!h; render(); });
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
        done.innerHTML = `<div class="merci"><p class="eyebrow">${r.devisEnvoye ? 'Devis envoyé' : 'Demande envoyée'}</p><h2>Merci ${esc(f.nom.split(' ')[0])} !</h2><p class="lead">${r.devisEnvoye ? `Votre devis est prêt : il vient de partir à <b>${esc(f.email)}</b>. Vous pouvez le consulter et le signer en ligne dès maintenant.</p><p>Un conseiller Magnolia vous appelle très vite pour vérifier les détails avec vous.</p>` : `Votre demande <b>${esc(r.ref)}</b> est bien reçue. L’équipe vérifie les disponibilités et vous envoie votre devis très vite, par e-mail.</p><p>Un e-mail de confirmation vient de partir à <b>${esc(f.email)}</b>.</p>`}<p class="row"><a class="btn btn-vert" href="${esc(r.espace)}">${r.devisEnvoye ? 'Voir mon devis' : 'Suivre ma demande'}</a><a class="lnk" href="/">Retour à l’accueil</a></p></div>`;
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
  const cf = $('[data-com] [data-com-form]');
  if (cf) {
    const token = cf.closest('[data-com]').dataset.com;
    cf.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('[data-com-msg]', cf), btn = $('button', cf);
      if (cf.texte.value.trim().length < 2) { msg.textContent = 'Écrivez votre commentaire.'; cf.texte.focus(); return; }
      btn.disabled = true; msg.textContent = 'Envoi…';
      try {
        await post(`/api/devis/${token}/commentaire`, { texte: cf.texte.value });
        const ul = $('.com-liste', cf.parentNode) || cf.parentNode.insertBefore(Object.assign(document.createElement('ul'), { className: 'com-liste' }), cf);
        const li = document.createElement('li'), p = document.createElement('p'), sm = document.createElement('small');
        p.textContent = cf.texte.value.trim(); sm.textContent = 'Envoyé à l’instant'; li.append(p, sm); ul.append(li);
        cf.texte.value = ''; msg.textContent = '✓ Merci, votre commentaire est bien envoyé. Votre conseiller vous répond rapidement.';
      } catch (err) { msg.textContent = err.message; }
      btn.disabled = false;
    });
  }
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

/* page Lieux : la recherche n'envoie que les critères remplis (adresse plus courte, facile à partager) */
document.querySelector('.lsearch')?.addEventListener('submit', e => {
  for (const el of e.target.querySelectorAll('select, input')) if (!el.value) el.disabled = true;
  setTimeout(() => { for (const el of e.target.querySelectorAll('[disabled]')) el.disabled = false; }, 0);
});

/* fiche produit : la description sous la photo ne descend pas plus bas que le pavé de droite
   (jusqu'à « Une question ? ») ; au-delà, « Voir plus ». Sur téléphone : 5 lignes puis « Voir plus ». */
(() => {
  const sp = document.querySelector('[data-sp]'); if (!sp) return;
  const txt = sp.querySelector('.sp-txt'), btn = sp.querySelector('[data-sp-plus]');
  const media = document.querySelector('.fiche-media'), info = document.querySelector('.fiche-info');
  let ouvert = false;
  const ajuste = () => {
    if (ouvert) return;
    sp.classList.remove('coupe');
    const ligne = parseFloat(getComputedStyle(txt).lineHeight) || 24;
    let h = ligne * 5;
    if (matchMedia('(min-width: 861px)').matches && info && media) {
      const fin = (info.querySelector('.aide') || info).getBoundingClientRect().bottom - info.getBoundingClientRect().top;
      h = fin - (txt.getBoundingClientRect().top - media.getBoundingClientRect().top) - ligne * 1.6;
    }
    h = Math.max(h, ligne * 3);
    const trop = txt.scrollHeight > h + 2;
    sp.style.setProperty('--sp-h', Math.floor(h) + 'px');
    sp.classList.toggle('coupe', trop);
    btn.hidden = !trop;
  };
  btn.addEventListener('click', () => {
    ouvert = !ouvert;
    btn.textContent = ouvert ? 'Voir moins' : 'Voir plus';
    if (ouvert) sp.classList.remove('coupe'); else { ajuste(); sp.scrollIntoView({ block: 'nearest' }); }
  });
  ajuste();
  addEventListener('resize', ajuste); addEventListener('load', ajuste);
  document.fonts?.ready.then(ajuste);
  if (window.ResizeObserver && info) new ResizeObserver(ajuste).observe(info);
})();

/* Accueil : la carte de menu qui tourne sur la vignette « La carte Magnolia » ne tourne que lorsqu'il est à l'écran (économie de batterie sur iPhone) */
(function () {
  const t = document.querySelector('.tile .cm-scene')?.closest('.tile');
  if (!t || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => t.classList.toggle('cm-pause', !e.isIntersecting), { threshold: 0 }).observe(t);
})();

/* Accueil : vignettes vidéo (Cocktail, Boissons, DJ…). La vidéo n'est chargée et jouée que lorsque la vignette est à l'écran,
   mise en pause dès qu'elle en sort ; rien si l'utilisateur a demandé moins d'animations (la photo reste). */
(function () {
  const vids = [...document.querySelectorAll('video[data-vignette]')];
  if (!vids.length) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const joue = v => {
    if (!v.src) { v.src = v.dataset.vignette; v.addEventListener('playing', () => v.classList.add('on'), { once: true }); }
    const p = v.play(); if (p) p.catch(() => {});
  };
  const vues = new Set();
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { vues.add(e.target); joue(e.target); } else { vues.delete(e.target); e.target.pause(); } }), { threshold: 0.35 });
  vids.forEach(v => io.observe(v));
  document.addEventListener('visibilitychange', () => { if (document.hidden) vids.forEach(v => v.pause()); else vues.forEach(joue); });
})();

/* Accueil, Saveurs du monde : la provenance du cuisinier affiché (en haut à droite) suit la vidéo.
   Visage n de n×pas−0,5 s à (n+1)×pas−0,5 s ; après le dernier, la vidéo revient au premier. */
(function () {
  document.querySelectorAll('.tile-tag[data-tags]').forEach(tag => {
    const v = tag.parentNode.querySelector('video'); if (!v) return;
    const tags = JSON.parse(tag.dataset.tags), pas = parseFloat(tag.dataset.pas) || 2.6;
    let cur = 0;
    v.addEventListener('timeupdate', () => {
      const i = Math.floor((v.currentTime + 0.5) / pas) % tags.length;
      if (i === cur) return; cur = i;
      tag.classList.add('chg');
      setTimeout(() => { tag.textContent = tags[i]; tag.classList.remove('chg'); }, 250);
    });
  });
})();

/* Têtes de rubrique sur téléphone (Jean-Luc, 2026-11-25) : pages de plus de 20 produits en sections.
   Les vignettes s'affichent d'abord ; un toucher ouvre #section et ne montre qu'elle ; « Toutes les rubriques »
   ou le bouton retour du téléphone ramène aux vignettes. Sur ordinateur, le CSS montre tout comme avant. */
(() => {
  const zone = document.querySelector('[data-rubm]');
  if (!zone) return;
  const blocs = [...zone.querySelectorAll('[data-rubm-bloc]')];
  const tuiles = zone.querySelector('.rubm-tuiles');
  const mobile = matchMedia('(max-width: 860px)');
  let ajoute = false;
  const haut = el => { if (!mobile.matches || !el) return; const bar = zone.querySelector('.shop-bar'); const y = el.getBoundingClientRect().top + scrollY - (bar ? bar.offsetHeight + parseFloat(getComputedStyle(bar).top || 0) : 80) - 8; scrollTo({ top: Math.max(0, y), behavior: 'auto' }); };
  const montre = (defil) => {
    const id = decodeURIComponent(location.hash.slice(1));
    const b = blocs.find(x => x.id === id);
    zone.classList.toggle('rubm-ouvert', !!b);
    blocs.forEach(x => x.classList.toggle('rubm-on', x === b));
    if (defil) haut(b || tuiles);
  };
  zone.addEventListener('click', e => {
    const go = e.target.closest('[data-rubm-go]');
    if (go && mobile.matches) { e.preventDefault(); history.pushState(null, '', '#' + go.dataset.rubmGo); ajoute = true; montre(true); return; }
    if (e.target.closest('[data-rubm-retour]')) {
      if (ajoute) { ajoute = false; history.back(); return; }
      history.replaceState(null, '', location.pathname + location.search); montre(true);
    }
  });
  addEventListener('popstate', () => { ajoute = false; montre(true); });
  addEventListener('hashchange', () => montre(true));
  /* recherche dans la page : on montre toutes les sections pour voir tous les résultats */
  const q = zone.querySelector('[data-shop-q]');
  q?.addEventListener('input', () => zone.classList.toggle('rubm-cherche', !!q.value.trim()));
  montre(false);
  if (zone.classList.contains('rubm-ouvert')) requestAnimationFrame(() => haut(blocs.find(x => x.classList.contains('rubm-on'))));
})();

/* Blog : boutons Tous / Entreprises / Particuliers du bloc de l'accueil, et photos agrandies d'un clic (Jean-Luc, 2026-11-27) */
(() => {
  const bloc = document.querySelector('[data-rep]');
  if (bloc) bloc.addEventListener('click', e => {
    const b = e.target.closest('[data-rep-f]'); if (!b) return;
    const f = b.dataset.repF, cartes = [...bloc.querySelectorAll('.rep-c')];
    const voulues = cartes.filter(x => !f || x.dataset.cat === f).slice(0, 3);
    if (!voulues.length) return; /* rien dans cette catégorie : le lien mène à la page du blog */
    e.preventDefault();
    bloc.querySelectorAll('[data-rep-f]').forEach(x => x.classList.toggle('on', x === b));
    cartes.forEach(x => { x.hidden = !voulues.includes(x); x.classList.toggle('grande', x === voulues[0]); });
    const l = bloc.querySelector('.rep-l'); l.className = 'rep-l n' + voulues.length;
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-zoom]'); if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const lay = document.createElement('div'); lay.className = 'zoom-lay'; lay.setAttribute('role', 'dialog'); lay.setAttribute('aria-label', 'Photo agrandie');
    const img = document.createElement('img'); img.src = a.getAttribute('href'); img.alt = a.querySelector('img')?.alt || '';
    lay.append(img); document.body.append(lay); document.body.classList.add('noscroll');
    const fermer = () => { lay.remove(); document.body.classList.remove('noscroll'); removeEventListener('keydown', esc); };
    const esc = ev => { if (ev.key === 'Escape') fermer(); };
    lay.addEventListener('click', fermer); addEventListener('keydown', esc);
  });
})();
