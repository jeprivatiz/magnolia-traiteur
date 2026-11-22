/* Saveurs du monde : globe 3D (MapLibre 5, projection globe, sans fond de carte externe).
   Pavés des spécialités à gauche ; un clic fait tourner la Terre, une flèche part du pavé vers le pays,
   le pays se soulève en or, un point clignote et une case « Voir nos propositions » apparaît. */
(function () {
  'use strict';
  const root = document.querySelector('[data-sm]');
  if (!root) return;
  const $ = (s, el = root) => el.querySelector(s), $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const items = JSON.parse($('[data-sm-data]').textContent || '[]');
  const PARIS = JSON.parse(root.dataset.smParis || '[2.35,48.86]');
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  const paves = $$('[data-sm-i]');
  let actif = 0, map = null, geo = null, marque = null, carteVoir = null;

  /* ---------- en-tête et image de fond ---------- */
  const fonds = $$('[data-sm-fond]');
  let fondVisible = 0;
  function majTete(x) {
    $('[data-sm-titre]').textContent = x.pays || x.nom;
    $('[data-sm-plat]').innerHTML = x.plat ? `${x.plat.photo ? `<img src="${esc(x.plat.photo)}" alt="">` : ''}<span><b>${esc(x.plat.titre)}</b><small>${esc(x.plat.prix)}</small></span>` : '';
    const voir = $('[data-sm-voir]'); voir.href = x.href;
    const t = $('[data-sm-tete]'); t.classList.remove('entre'); void t.offsetWidth; t.classList.add('entre');
    if (x.photo && fonds.length === 2) {
      const suivant = fonds[1 - fondVisible];
      const go = () => { suivant.classList.add('on'); fonds[fondVisible].classList.remove('on'); fondVisible = 1 - fondVisible; };
      if (suivant.getAttribute('src') === x.photo) go();
      else { suivant.onload = go; suivant.src = x.photo; }
      if (suivant.tagName !== 'IMG') go();
    }
  }

  /* ---------- géométrie ---------- */
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  function grandCercle(a, b, n = 96) {
    const [l1, p1, l2, p2] = [rad(a[0]), rad(a[1]), rad(b[0]), rad(b[1])];
    const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (!d) return [a, b];
    return Array.from({ length: n + 1 }, (_, i) => {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2), y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2), z = A * Math.sin(p1) + B * Math.sin(p2);
      return [deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))];
    });
  }
  /* centre d'une spécialité : réglé, sinon centre du plus grand morceau de ses pays */
  function centreDe(x) {
    if (x.centre) return x.centre;
    let best = null, aire = -1;
    for (const f of (geo?.features || [])) {
      if (!x.ids.includes(f.id)) continue;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polys) {
        let a = [180, 90, -180, -90]; for (const [lo, la] of p[0]) { a[0] = Math.min(a[0], lo); a[1] = Math.min(a[1], la); a[2] = Math.max(a[2], lo); a[3] = Math.max(a[3], la); }
        const s = (a[2] - a[0]) * (a[3] - a[1]); if (s > aire) { aire = s; best = [(a[0] + a[2]) / 2, (a[1] + a[3]) / 2]; }
      }
    }
    return best || PARIS;
  }

  /* ---------- flèche du pavé vers le pays (SVG au-dessus du globe) ---------- */
  const svg = $('[data-sm-fleche]'), trait = $('[data-sm-trait]');
  let flecheAnim = 0, flecheT0 = 0;
  function majFleche() {
    if (!map || actif < 0) { trait.setAttribute('d', ''); return; }
    const x = items[actif], pave = paves[actif]; if (!pave) return;
    const R = root.getBoundingClientRect(), P = pave.getBoundingClientRect();
    const c = centreDe(x), pt = map.project(c);
    const mob = mobile();
    const sx = mob ? P.left + P.width / 2 - R.left : P.right - R.left + 6, sy = mob ? P.bottom - R.top + 6 : P.top + P.height / 2 - R.top;
    const ex = pt.x + (map.getContainer().getBoundingClientRect().left - R.left), ey = pt.y + (map.getContainer().getBoundingClientRect().top - R.top);
    const d = mob
      ? `M${sx},${sy} C${sx},${sy + (ey - sy) * .55} ${ex},${ey - (ey - sy) * .6} ${ex},${ey - 10}`
      : `M${sx},${sy} C${sx + (ex - sx) * .45},${sy} ${ex - (ex - sx) * .3},${ey - 90} ${ex - 6},${ey - 8}`;
    trait.setAttribute('d', d);
    svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
    if (flecheT0) {
      const L = trait.getTotalLength(), k = Math.min(1, (performance.now() - flecheT0) / 900);
      trait.style.strokeDasharray = L; trait.style.strokeDashoffset = L * (1 - (1 - Math.pow(1 - k, 3)));
      if (k >= 1) { flecheT0 = 0; trait.style.strokeDasharray = ''; trait.style.strokeDashoffset = ''; }
    }
  }
  const boucleFleche = () => { majFleche(); flecheAnim = requestAnimationFrame(boucleFleche); };

  /* ---------- choix d'une spécialité ---------- */
  let arcAnim = 0;
  function choisir(i, { voler = true } = {}) {
    actif = i;
    paves.forEach((p, k) => p.classList.toggle('on', k === i));
    const x = items[i]; if (!x) return;
    majTete(x);
    if (mobile()) paves[i]?.scrollIntoView({ behavior: calme ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
    if (!map || !geo) return;
    arreterTour();
    const c = centreDe(x);
    map.getSource('choix').setData({ type: 'FeatureCollection', features: geo.features.filter(f => x.ids.includes(f.id)) });
    /* point qui clignote + case « Voir nos propositions » */
    marque && marque.remove(); carteVoir && carteVoir.remove();
    const el = document.createElement('div'); el.className = 'sm-point'; el.innerHTML = '<i></i><i></i><b></b>';
    marque = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
    const box = document.createElement('a'); box.className = 'sm-case'; box.href = x.href;
    box.innerHTML = `<small>${esc(x.pays || '')}</small><b>${esc(x.nom)}</b><span>Voir nos propositions →</span>`;
    carteVoir = new maplibregl.Marker({ element: box, anchor: mobile() ? 'top' : 'bottom-left', offset: mobile() ? [0, 18] : [14, -14] }).setLngLat(c).addTo(map);
    /* la Terre tourne vers le pays */
    if (voler) map.flyTo({ center: [c[0] - (mobile() ? 0 : 6), Math.max(-35, Math.min(45, c[1] - 4))], zoom: zoomBase() + .35, duration: calme ? 0 : 2200, essential: true, curve: 1.2 });
    /* trajet depuis Paris, tracé petit à petit */
    cancelAnimationFrame(arcAnim);
    const pts = grandCercle(PARIS, c), src = map.getSource('arc'), t0 = performance.now() + (calme ? 0 : 700);
    const pas = t => {
      const k = calme ? 1 : Math.max(0, Math.min(1, (t - t0) / 1600));
      src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.slice(0, Math.max(2, Math.round(pts.length * (1 - Math.pow(1 - k, 2))))) } });
      if (k < 1) arcAnim = requestAnimationFrame(pas);
    };
    arcAnim = requestAnimationFrame(pas);
    flecheT0 = calme ? 0 : performance.now() + 200;
  }
  paves.forEach(p => p.addEventListener('click', e => { e.preventDefault(); choisir(+p.dataset.smI); }));
  majTete(items[0] || {});

  /* ---------- globe ---------- */
  function zoomBase() { const b = map.getContainer(); const w = b.clientWidth - (mobile() ? 0 : 380), h = b.clientHeight - (mobile() ? 0 : 200); return Math.log2(Math.max(260, Math.min(w, h)) / 512) + (mobile() ? .95 : 1.3); }
  let tour = !calme, tourId = 0;
  function arreterTour() { tour = false; clearTimeout(tourId); $('[data-sm-act="tour"]')?.setAttribute('aria-pressed', 'false'); }
  function demarrer() {
    const ml = window.maplibregl; if (!ml) return;
    try { const cv = document.createElement('canvas'); if (!(cv.getContext('webgl2') || cv.getContext('webgl'))) return; } catch (e) { return; }
    const box = $('[data-sm-map]');
    try {
      map = new ml.Map({
        container: box, attributionControl: false, center: [15, 30], zoom: 1.4, minZoom: .6, maxZoom: 5, renderWorldCopies: false,
        style: { version: 8, projection: { type: 'globe' }, sources: {}, layers: [{ id: 'mer', type: 'background', paint: { 'background-color': '#10261c' } }],
          sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, .9, 4, .3], 'sky-color': '#1d3b2f', 'horizon-color': '#c9a46a', 'fog-color': '#1d3b2f', 'sky-horizon-blend': .6, 'horizon-fog-blend': .8, 'fog-ground-blend': 1 } },
        cooperativeGestures: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
      });
    } catch (e) { return; }
    map.on('error', () => {});
    map.on('load', async () => {
      try { [geo] = await Promise.all([fetch('/data/monde.json').then(r => r.json())]); } catch (e) { return; }
      let points = [];
      try { points = await fetch('/data/monde-points.json').then(r => r.json()); } catch (e) { /* sans points */ }
      root.classList.add('pret');
      const nos = new Set(items.flatMap(x => x.ids));
      map.addSource('pays', { type: 'geojson', data: geo });
      map.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: points.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p } })) } });
      map.addSource('choix', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('arc', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [PARIS, PARIS] } } });
      map.addLayer({ id: 'terres', type: 'fill', source: 'pays', paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'survol'], false], '#3d6a55', ['in', ['id'], ['literal', [...nos]]], '#24493a', '#1a3a2d'], 'fill-opacity': .92 } });
      map.addLayer({ id: 'points', type: 'circle', source: 'points', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], .6, .7, 2, 1.3, 4, 2.4], 'circle-color': '#d9bc86', 'circle-opacity': .75 } });
      map.addLayer({ id: 'frontieres', type: 'line', source: 'pays', paint: { 'line-color': '#c9a46a', 'line-opacity': .22, 'line-width': .5 } });
      map.addLayer({ id: 'choix', type: 'fill-extrusion', source: 'choix', paint: { 'fill-extrusion-color': '#d4b07a', 'fill-extrusion-height': 260000, 'fill-extrusion-base': 0, 'fill-extrusion-opacity': .95, 'fill-extrusion-vertical-gradient': true } });
      map.addLayer({ id: 'choix-bord', type: 'line', source: 'choix', paint: { 'line-color': '#f6e7c8', 'line-width': 1.4 } });
      map.addLayer({ id: 'arc-halo', type: 'line', source: 'arc', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#e2c495', 'line-width': 7, 'line-opacity': .18, 'line-blur': 3 } });
      map.addLayer({ id: 'arc', type: 'line', source: 'arc', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#f1dcb0', 'line-width': 1.8 } });
      /* Paris, notre point de départ */
      const pa = document.createElement('div'); pa.className = 'sm-paris'; pa.innerHTML = '<i></i><span>Paris</span>';
      new ml.Marker({ element: pa, anchor: 'left', offset: [-5, 0] }).setLngLat(PARIS).addTo(map);
      const pad = () => map.setPadding(mobile() ? { left: 0, top: 0, right: 0, bottom: 40 } : { left: Math.min(380, box.clientWidth * .3), top: 170, right: 0, bottom: 40 });
      pad(); addEventListener('resize', pad);
      map.setZoom(zoomBase());

      /* survol et clic sur un pays */
      const tip = document.createElement('div'); tip.className = 'zl-tip sm-tip'; tip.hidden = true; box.appendChild(tip);
      let survol = null;
      const speDe = id => items.findIndex(x => x.ids.includes(id));
      map.on('mousemove', 'terres', e => {
        const f = e.features[0]; if (!f) return;
        if (survol !== f.id) { if (survol != null) map.setFeatureState({ source: 'pays', id: survol }, { survol: false }); survol = f.id; map.setFeatureState({ source: 'pays', id: survol }, { survol: true }); }
        const k = speDe(f.id);
        map.getCanvas().style.cursor = k >= 0 ? 'pointer' : '';
        tip.innerHTML = k >= 0 ? `<b>${esc(items[k].nom)}</b><span>${esc(f.properties.nom)} · touchez pour voir</span>` : `<b>${esc(f.properties.nom)}</b><span>Une envie d’ailleurs ? Appelez-nous</span>`;
        tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`; tip.hidden = false;
      });
      map.on('mouseleave', 'terres', () => { if (survol != null) map.setFeatureState({ source: 'pays', id: survol }, { survol: false }); survol = null; tip.hidden = true; map.getCanvas().style.cursor = ''; });
      map.on('click', 'terres', e => { const f = e.features[0]; const k = f ? speDe(f.id) : -1; if (k >= 0) choisir(k); });

      /* rotation lente au repos */
      const tourner = () => { if (!tour) return; const c = map.getCenter(); map.easeTo({ center: [c.lng + 25, c.lat], duration: 7000, easing: t => t }); };
      map.on('moveend', () => { if (tour) tourId = setTimeout(tourner, 0); });
      ['mousedown', 'touchstart', 'wheel'].forEach(ev => box.addEventListener(ev, arreterTour, { passive: true }));

      /* boutons */
      const ctrl = $('[data-sm-ctrl]'); ctrl.hidden = false;
      if (!tour) ctrl.querySelector('[data-sm-act="tour"]').setAttribute('aria-pressed', 'false');
      ctrl.addEventListener('click', e => {
        const b = e.target.closest('[data-sm-act]'); if (!b) return;
        if (b.dataset.smAct === '3d') { const g = (map.getProjection()?.type || 'globe') === 'globe'; map.setProjection({ type: g ? 'mercator' : 'globe' }); b.setAttribute('aria-pressed', String(!g)); if (g) map.easeTo({ zoom: Math.max(1, zoomBase() - .2), duration: 600 }); }
        if (b.dataset.smAct === 'tour') { if (tour) arreterTour(); else { tour = true; b.setAttribute('aria-pressed', 'true'); tourner(); } }
        if (b.dataset.smAct === 'reset') { arreterTour(); const c = centreDe(items[actif] || {}); map.flyTo({ center: [c[0] - (mobile() ? 0 : 6), Math.max(-35, Math.min(45, c[1] - 4))], zoom: zoomBase() + .35, duration: 1400 }); }
      });

      /* au départ : la Terre tourne, puis se pose sur la première spécialité */
      choisir(0, { voler: false });
      const c0 = centreDe(items[0] || {});
      map.jumpTo({ center: [c0[0] - 70, 20] });
      map.flyTo({ center: [c0[0] - (mobile() ? 0 : 6), Math.max(-35, Math.min(45, c0[1] - 4))], zoom: zoomBase() + .35, duration: calme ? 0 : 3200, essential: true });
      tour = false; $('[data-sm-act="tour"]').setAttribute('aria-pressed', 'false');
      boucleFleche();
    });
    addEventListener('resize', () => map && map.resize());
  }
  if (window.maplibregl) demarrer(); else addEventListener('load', demarrer);
})();
