/* Page Zone de livraison : carte 3D de l'Île-de-France (MapLibre, sans fond de carte externe),
   simulateur de frais (1 € TTC du km aller-retour, offerte dès 700 € TTC), trajet animé en arc. */
(function () {
  'use strict';
  const root = document.querySelector('[data-zl]');
  if (!root) return;
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const euros = c => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const O = JSON.parse(root.dataset.zlOrigine), KM = +root.dataset.zlKm || 100, SEUIL = +root.dataset.zlSeuil || 0;
  const TEL = (window.MG && MG.tel) || '';
  const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
  const calme = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rad = x => x * Math.PI / 180;
  const volOiseau = (lat, lon) => 2 * 6371 * Math.asin(Math.sqrt(Math.sin(rad(lat - O.lat) / 2) ** 2 + Math.cos(rad(O.lat)) * Math.cos(rad(lat)) * Math.sin(rad(lon - O.lon) / 2) ** 2));
  const kmAR = (lat, lon) => Math.max(10, Math.round(volOiseau(lat, lon) * 1.3 * 2));

  /* ---------- montant de la commande (prérempli avec la sélection du visiteur) ---------- */
  const m = $('[data-zl-m]'), mout = $('[data-zl-mout]');
  try {
    const sel = JSON.parse(localStorage.getItem('mg_sel') || '[]');
    const sub = sel.reduce((t, l) => t + (l.prixCents == null ? 0 : (l.prixCents + (l.supCents || 0)) * (l.qte || 1)), 0);
    if (sub > 0) m.value = Math.min(+m.max, Math.round(sub / 1000) * 1000);
  } catch (e) { /* pas de sélection */ }
  let choix = null; /* { nom, dep, lat, lon } */
  const majMontant = () => {
    const v = +m.value;
    mout.textContent = euros(v);
    m.style.setProperty('--p', Math.min(100, v / +m.max * 100) + '%');
    m.classList.toggle('ok', SEUIL > 0 && v >= SEUIL);
    rendre();
  };
  m.addEventListener('input', majMontant);

  /* ---------- résultat ---------- */
  const res = $('[data-zl-res]');
  function rendre() {
    if (!choix) return;
    const v = +m.value;
    if (!IDF.includes(choix.dep)) {
      res.className = 'zl-res hors';
      res.innerHTML = `<p class="zl-res-v">${esc(choix.nom)}${choix.dep ? ` <small>${esc(choix.dep)}</small>` : ''}</p>
        <p class="zl-res-p">Hors zone de livraison</p><p>Nous pouvons souvent livrer plus loin : contactez-nous, nous vous faisons une proposition.</p>
        <p class="row"><a class="btn btn-or" href="tel:${esc(TEL.replace(/\s/g, ''))}">Appeler le ${esc(TEL)}</a><a class="btn btn-ghost-light" href="/contact">Nous écrire</a></p>`;
      return;
    }
    const km = kmAR(choix.lat, choix.lon), prix = km * KM, offerte = SEUIL > 0 && v >= SEUIL;
    res.className = 'zl-res' + (offerte ? ' offerte' : '');
    res.innerHTML = `<p class="zl-res-v">${esc(choix.nom)} <small>${esc(choix.dep)}</small></p>
      <p class="zl-res-p">${offerte ? `<s>${euros(prix)}</s> Livraison offerte` : `${euros(prix)} <small>TTC</small>`}</p>
      <p>Environ <b>${km} km</b> aller-retour depuis ${esc(O.nom)}${offerte ? '' : `, à ${euros(KM)} TTC du km`}.</p>
      ${SEUIL > 0 && !offerte ? `<p class="zl-res-plus">Plus que <b>${euros(SEUIL - v)}</b> de commande pour une livraison offerte.</p>` : ''}
      <p class="row"><a class="btn btn-or" href="/boutique">Composer ma sélection</a></p>`;
  }

  /* ---------- recherche : code postal ou nom de ville (API Géo de l'État) ---------- */
  const q = $('[data-zl-q]'), sugg = $('[data-zl-sugg]');
  let tq = 0;
  q.addEventListener('input', () => {
    clearTimeout(tq);
    const val = q.value.trim();
    if (val.length < 2) { sugg.hidden = true; return; }
    tq = setTimeout(async () => {
      const url = /^\d{5}$/.test(val) ? `https://geo.api.gouv.fr/communes?codePostal=${val}&fields=nom,centre,codeDepartement&format=json`
        : /^\d+$/.test(val) ? null : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(val)}&fields=nom,centre,codeDepartement&boost=population&limit=7`;
      if (!url) { sugg.hidden = true; return; }
      let list = [];
      try { list = (await fetch(url).then(r => r.json())).filter(x => x.centre); } catch (e) { list = []; }
      sugg.innerHTML = list.length ? list.map((x, i) => `<li role="option"><button type="button" data-i="${i}">${esc(x.nom)} <small>${esc(x.codeDepartement)}</small></button></li>`).join('') : '<li class="vide">Aucune commune trouvée</li>';
      sugg.hidden = false;
      sugg.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; const x = list[+b.dataset.i]; sugg.hidden = true; q.value = x.nom; choisir({ nom: x.nom, dep: x.codeDepartement, lat: x.centre.coordinates[1], lon: x.centre.coordinates[0] }); };
    }, 220);
  });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sugg.querySelector('button')?.click(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.zl-q')) sugg.hidden = true; });

  /* villes d'exemple */
  $$('[data-zl-ville]').forEach(b => b.addEventListener('click', () => {
    const v = JSON.parse(b.dataset.zlVille);
    q.value = v.nom;
    root.scrollIntoView({ behavior: calme ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => choisir(v), calme ? 0 : 450);
  }));

  /* compteurs animés */
  if ('IntersectionObserver' in window && !calme) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const el = e.target, fin = +el.dataset.zlCount, t0 = performance.now();
      const pas = t => { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(fin * (1 - Math.pow(1 - k, 3))).toLocaleString('fr-FR'); if (k < 1) requestAnimationFrame(pas); };
      requestAnimationFrame(pas);
    }), { threshold: .6 });
    $$('[data-zl-count]').forEach(el => { el.textContent = '0'; io.observe(el); });
  }

  /* ---------- carte 3D ---------- */
  let carte = null, choisirSurCarte = null;
  function choisir(v) { choix = v; rendre(); if (choisirSurCarte) choisirSurCarte(v); }
  majMontant();

  function demarrer() {
    const ml = window.maplibregl;
    if (!ml) return;
    try { const cv = document.createElement('canvas'); if (!(cv.getContext('webgl2') || cv.getContext('webgl'))) return; } catch (e) { return; }
    const box = $('[data-zl-map]');
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const panneau = mobile ? 0 : Math.min(520, $('.zl-panel').getBoundingClientRect().right + 10);
    const pad = { top: mobile ? 10 : 60, bottom: mobile ? 10 : 60, left: panneau, right: mobile ? 0 : 20 };
    const zoomVue = mobile ? Math.log2(box.clientWidth / 390) + 7.75 : Math.max(7.6, Math.min(8.75, Math.log2((box.clientWidth - panneau) / 760) + 8.35));
    const vue = { center: mobile ? [2.46, 48.76] : [2.5, 48.71], zoom: zoomVue, pitch: mobile ? 42 : 52, bearing: -15, padding: pad };
    let map;
    try {
      map = new ml.Map({
        container: box, style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#0f2219' } }] },
        center: vue.center, zoom: vue.zoom, pitch: vue.pitch, bearing: vue.bearing, maxPitch: 70, minZoom: 6, maxZoom: 12, attributionControl: false, dragRotate: true,
        cooperativeGestures: mobile, locale: { 'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer', 'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer', 'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour déplacer la carte' },
      });
    } catch (e) { return; }
    carte = map;
    map.setPadding(pad);
    map.on('error', () => {});
    map.on('load', async () => {
      let geo;
      try { geo = await fetch('/data/idf.json').then(r => r.json()); } catch (e) { return; }
      box.classList.add('pret');
      geo.features.forEach((f, i) => { f.id = i; });
      map.addSource('idf', { type: 'geojson', data: geo });
      const couleurs = { '91': '#c9a46a', '75': '#e8dcc4', '92': '#7fa58f', '93': '#5f8a73', '94': '#6e977f', '78': '#3f6b55', '95': '#4c7a62', '77': '#355e4a' };
      map.addLayer({ id: 'deps', type: 'fill-extrusion', source: 'idf', paint: {
        'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'survol'], false], '#e2c495', ['match', ['get', 'code'], ...Object.entries(couleurs).flat(), '#3f6b55']],
        'fill-extrusion-height': ['case', ['boolean', ['feature-state', 'survol'], false], 3200, ['==', ['get', 'code'], '91'], 2200, 1500],
        'fill-extrusion-base': 0, 'fill-extrusion-opacity': .94, 'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-height-transition': { duration: 500 },
      } });
      /* cercles de distance (vol d'oiseau) avec le prix aller-retour estimé */
      const cercle = (r, w) => {
        const pts = (rr) => Array.from({ length: 129 }, (_, i) => { const a = i / 128 * 2 * Math.PI; return [O.lon + rr / (111.32 * Math.cos(rad(O.lat))) * Math.cos(a), O.lat + rr / 110.57 * Math.sin(a)]; });
        return { type: 'Feature', properties: { r }, geometry: { type: 'Polygon', coordinates: [pts(r + w), pts(r).reverse()] } };
      };
      const rayons = [10, 20, 30, 45];
      map.addSource('cercles', { type: 'geojson', data: { type: 'FeatureCollection', features: rayons.map(r => cercle(r, .22)) } });
      map.addLayer({ id: 'cercles', type: 'fill-extrusion', source: 'cercles', paint: { 'fill-extrusion-color': '#f6e7c8', 'fill-extrusion-base': 2250, 'fill-extrusion-height': 2330, 'fill-extrusion-opacity': .55 } });
      rayons.forEach(r => {
        const el = document.createElement('div'); el.className = 'zl-ring';
        el.innerHTML = `≈ ${euros(Math.round(r * 2.6) * KM)}`;
        new ml.Marker({ element: el, anchor: 'center' }).setLngLat([O.lon + r / (111.32 * Math.cos(rad(O.lat))) * Math.cos(rad(200)), O.lat + r / 110.57 * Math.sin(rad(200))]).addTo(map);
      });
      /* trajet en arc */
      map.addSource('arc', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'arc', type: 'fill-extrusion', source: 'arc', paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': .96 } });

      /* étiquettes des départements */
      const etiq = { '75': [2.345, 48.857, 'Paris'], '92': [2.2, 48.86, ''], '93': [2.47, 48.92, ''], '94': [2.47, 48.76, ''], '91': [2.25, 48.52, 'Essonne'], '78': [1.85, 48.82, 'Yvelines'], '95': [2.12, 49.1, 'Val-d’Oise'], '77': [2.95, 48.62, 'Seine-et-Marne'] };
      Object.entries(etiq).forEach(([code, [lon, lat, nom]]) => {
        const el = document.createElement('div'); el.className = 'zl-dep' + (nom ? '' : ' petit');
        el.innerHTML = `<b>${code}</b>${nom ? `<span>${esc(nom)}</span>` : ''}`;
        new ml.Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]).addTo(map);
      });
      /* laboratoire */
      const lab = document.createElement('div'); lab.className = 'zl-lab';
      lab.innerHTML = '<i></i><span>Notre laboratoire<small>' + esc(O.nom) + '</small></span>';
      new ml.Marker({ element: lab, anchor: 'top', offset: [0, -8] }).setLngLat([O.lon, O.lat]).addTo(map);

      /* survol */
      let survol = null;
      const tip = document.createElement('div'); tip.className = 'zl-tip'; tip.hidden = true; box.appendChild(tip);
      map.on('mousemove', 'deps', e => {
        const f = e.features[0]; if (!f) return;
        if (survol !== f.id) { if (survol != null) map.setFeatureState({ source: 'idf', id: survol }, { survol: false }); survol = f.id; map.setFeatureState({ source: 'idf', id: survol }, { survol: true }); }
        map.getCanvas().style.cursor = 'pointer';
        const km = kmAR(e.lngLat.lat, e.lngLat.lng);
        tip.innerHTML = `<b>${esc(f.properties.nom)} <small>${esc(f.properties.code)}</small></b><span>Ici : environ ${km} km A/R · ${euros(km * KM)} TTC</span>`;
        tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`; tip.hidden = false;
      });
      map.on('mouseleave', 'deps', () => { if (survol != null) map.setFeatureState({ source: 'idf', id: survol }, { survol: false }); survol = null; tip.hidden = true; map.getCanvas().style.cursor = ''; });

      /* clic : commune la plus proche */
      map.on('click', async e => {
        const dans = map.queryRenderedFeatures(e.point, { layers: ['deps'] })[0];
        let v = { nom: dans ? dans.properties.nom : 'Ce lieu', dep: dans ? dans.properties.code : '', lat: e.lngLat.lat, lon: e.lngLat.lng };
        try {
          const r = await fetch(`https://geo.api.gouv.fr/communes?lat=${e.lngLat.lat.toFixed(5)}&lon=${e.lngLat.lng.toFixed(5)}&fields=nom,codeDepartement&format=json`).then(x => x.json());
          if (r[0]) v = { ...v, nom: r[0].nom, dep: r[0].codeDepartement };
        } catch (err) { /* garde le département */ }
        q.value = v.nom; choisir(v);
      });

      /* arc 3D animé : de notre laboratoire jusqu'au lieu */
      let anim = 0, dest = null;
      choisirSurCarte = v => {
        cancelAnimationFrame(anim); arreterTour();
        const dansIdf = IDF.includes(v.dep);
        if (dest) dest.remove();
        const el = document.createElement('div'); el.className = 'zl-dest' + (dansIdf ? '' : ' hors');
        el.innerHTML = `<span>${esc(v.nom)}<small>${dansIdf ? `${kmAR(v.lat, v.lon)} km A/R` : 'Hors zone : nous contacter'}</small></span><i></i>`;
        dest = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([v.lon, v.lat]).addTo(map);
        const d = volOiseau(v.lat, v.lon), N = 160, haut = 3500 + Math.min(16000, d * 260);
        const h0 = 2200, h1 = dansIdf ? (v.dep === '91' ? 2200 : 1500) : 0;
        const kx = 1 / (111.32 * Math.cos(rad(O.lat))), ky = 1 / 110.57;
        const dx = (v.lon - O.lon) / kx, dy = (v.lat - O.lat) / ky, L = Math.hypot(dx, dy) || 1;
        const w = Math.max(.9, Math.min(2.2, d / 22)) * 0.5, nx = -dy / L * w, ny = dx / L * w;
        const seg = i => {
          const t0 = i / N, t1 = (i + 1) / N;
          const p = t => [O.lon + (v.lon - O.lon) * t, O.lat + (v.lat - O.lat) * t];
          const a = p(t0), b = p(t1), tm = (t0 + t1) / 2;
          const base = h0 + (h1 - h0) * tm + Math.sin(Math.PI * tm) * haut;
          return { type: 'Feature', properties: { b: base, h: base + 220 + w * 180, c: dansIdf ? `hsl(${38 - tm * 6}, ${62 + tm * 20}%, ${60 + Math.sin(Math.PI * tm) * 14}%)` : '#f3d9c0' },
            geometry: { type: 'Polygon', coordinates: [[[a[0] + nx * kx, a[1] + ny * ky], [b[0] + nx * kx, b[1] + ny * ky], [b[0] - nx * kx, b[1] - ny * ky], [a[0] - nx * kx, a[1] - ny * ky], [a[0] + nx * kx, a[1] + ny * ky]]] } };
        };
        const tous = Array.from({ length: N }, (_, i) => seg(i));
        const bornes = new ml.LngLatBounds([O.lon, O.lat], [O.lon, O.lat]).extend([v.lon, v.lat]);
        map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
        const cam = map.cameraForBounds(bornes, { padding: mobile ? { top: 90, bottom: 40, left: 40, right: 40 } : { top: 150, bottom: 90, left: panneau + 60, right: 120 }, maxZoom: mobile ? 9 : 9.4 });
        map.setPadding(pad);
        const zc = Math.max(mobile ? 6.4 : 7, Math.min(mobile ? 8.6 : 9, cam ? cam.zoom - (mobile ? .45 : .75) : 9));
        map.easeTo({ center: cam ? cam.center : [v.lon, v.lat], zoom: zc, pitch: 56, bearing: map.getBearing(), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: calme ? 0 : 1400 });
        const src = map.getSource('arc');
        if (calme) { src.setData({ type: 'FeatureCollection', features: tous }); return; }
        const t0 = performance.now(), duree = 1500 + Math.min(1400, d * 25);
        const pas = t => {
          const k = Math.min(1, (t - t0 - 500) / duree);
          if (k > 0) src.setData({ type: 'FeatureCollection', features: tous.slice(0, Math.max(1, Math.round(N * (1 - Math.pow(1 - k, 2))))) });
          if (k < 1) anim = requestAnimationFrame(pas);
        };
        anim = requestAnimationFrame(pas);
      };

      /* rotation lente au repos (s'arrête dès que le visiteur touche la carte) */
      let tour = !calme, tourId = 0;
      const btnTour = $('[data-zl-act="tour"]');
      const tourner = () => { if (!tour) return; map.easeTo({ bearing: map.getBearing() + 12, duration: 6000, easing: x => x }); };
      function arreterTour() { tour = false; clearTimeout(tourId); btnTour.setAttribute('aria-pressed', 'false'); }
      map.on('moveend', () => { if (tour) tourId = setTimeout(tourner, 0); });
      ['mousedown', 'touchstart', 'wheel'].forEach(ev => box.addEventListener(ev, arreterTour, { passive: true }));
      if (tour) setTimeout(tourner, 900); else btnTour.setAttribute('aria-pressed', 'false');

      /* boutons */
      const ctrl = $('[data-zl-ctrl]'); ctrl.hidden = false;
      ctrl.addEventListener('click', e => {
        const b = e.target.closest('[data-zl-act]'); if (!b) return;
        if (b.dataset.zlAct === '3d') { const en3d = map.getPitch() > 10; map.easeTo({ pitch: en3d ? 0 : 55, duration: 900 }); b.setAttribute('aria-pressed', String(!en3d)); }
        if (b.dataset.zlAct === 'tour') { if (tour) arreterTour(); else { tour = true; b.setAttribute('aria-pressed', 'true'); tourner(); } }
        if (b.dataset.zlAct === 'reset') { arreterTour(); map.easeTo({ ...vue, duration: 1200 }); }
      });
      map.addControl(new ml.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right');
      if (choix) choisirSurCarte(choix);
    });
  }
  if (window.maplibregl) demarrer(); else window.addEventListener('load', demarrer);
})();
