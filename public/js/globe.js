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
  let actif = -1, map = null, geo = null, marque = null, carteVoir = null;

  /* ---------- en-tête et image de fond ---------- */
  /* photo du bandeau en haut de page : elle prend l'ambiance du pays choisi (Jean-Luc, 2026-11-22) */
  const hero = document.querySelector('.phero');
  let heroImgs = null, heroVisible = 0;
  function majBandeau(x) {
    if (!hero || !x.photo) return;
    if (!heroImgs) {
      heroImgs = [0, 1].map(() => { const im = document.createElement('img'); im.className = 'phero-pays'; im.alt = ''; im.decoding = 'async'; hero.insertBefore(im, hero.querySelector('.phero-c')); return im; });
    }
    const cur = heroImgs[heroVisible], next = heroImgs[1 - heroVisible];
    if (cur.classList.contains('on') && cur.getAttribute('src') === x.photo) return;
    const go = () => { next.classList.add('on'); cur.classList.remove('on'); hero.classList.add('pays-on'); heroVisible = 1 - heroVisible; };
    if (next.getAttribute('src') === x.photo && next.complete) go();
    else { next.onload = go; next.src = x.photo; }
  }
  /* préchargement discret des photos des pays */
  addEventListener('load', () => setTimeout(() => items.forEach(x => { if (x.photo) { const i = new Image(); i.src = x.photo; } }), 1500));
  function majTete(x) {
    $('[data-sm-titre]').textContent = x.pays || x.nom;
    const ss = $('[data-sm-sous]'); if (ss) ss.hidden = true;
    const ph = $('[data-sm-phrase]'); if (ph) ph.textContent = x.phrase || '';
    const t = $('[data-sm-tete]'); t.classList.remove('entre'); void t.offsetWidth; t.classList.add('entre');
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
    const x = items[actif], c = centreDe(x);
    const cache = Math.abs(ecart(c[0])) > 84 && (map.getProjection()?.type || 'globe') === 'globe';
    root.classList.toggle('sm-cache', cache);
    const pave = paveVisible(actif);
    if (cache || !pave) { trait.setAttribute('d', ''); return; }
    const R = root.getBoundingClientRect(), P = pave.getBoundingClientRect();
    const pt = map.project(c);
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
  const boucleFleche = () => { majFleche(); majOrbites(); flecheAnim = requestAnimationFrame(boucleFleche); };

  /* ---------- satellites et station spatiale en orbite (Jean-Luc, 2026-11-23) ----------
     orbites circulaires inclinées autour du globe, dessinées en SVG au-dessus de la carte ;
     elles tournent dans le même sens que la Terre et passent derrière elle. */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ORBITES = [
    // rayon (× rayon du globe), inclinaison du plan, rotation du plan, phase de départ, vitesse (rad/s), station ?
    [1.10, 0.38, -0.40, 0.0, 0.34], [1.15, 0.62, 0.50, 2.1, 0.30], [1.21, 0.30, 1.20, 4.0, 0.26],
    [1.13, 0.85, -1.05, 1.0, 0.32], [1.25, 0.48, 0.10, 3.1, 0.23], [1.18, 1.05, -0.70, 5.2, 0.28],
    [1.28, 0.70, 0.90, 0.6, 0.21], [1.12, 1.30, 1.60, 2.8, 0.31], [1.23, 0.22, -1.40, 4.6, 0.25],
    [1.17, 0.55, 0.30, 1.7, 0.20, true],
  ];
  let orbSvg = null, orbT0 = performance.now();
  function creerOrbites(box) {
    orbSvg = document.createElementNS(SVGNS, 'svg'); orbSvg.setAttribute('class', 'sm-orbites'); orbSvg.setAttribute('aria-hidden', 'true');
    orbSvg.innerHTML = `<defs>
      <linearGradient id="sm-panneau" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a4a66"/><stop offset="1" stop-color="#12263a"/></linearGradient>
      <linearGradient id="sm-corps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e3bf"/><stop offset=".5" stop-color="#c9a46a"/><stop offset="1" stop-color="#8a6a36"/></linearGradient>
      <linearGradient id="sm-module" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#cfd3d6"/><stop offset="1" stop-color="#8d9499"/></linearGradient>
      <g id="sm-sat"><path d="M-9 0H-4M4 0H9" stroke="#d9d4c7" stroke-width="1.2"/>
        <rect x="-26" y="-5.5" width="17" height="11" rx="1" fill="url(#sm-panneau)" stroke="#c9a46a" stroke-width=".6"/><path d="M-20.3-5.5v11M-14.6-5.5v11M-26 0h17" stroke="#c9a46a" stroke-width=".4" opacity=".8"/>
        <rect x="9" y="-5.5" width="17" height="11" rx="1" fill="url(#sm-panneau)" stroke="#c9a46a" stroke-width=".6"/><path d="M14.7-5.5v11M20.4-5.5v11M9 0h17" stroke="#c9a46a" stroke-width=".4" opacity=".8"/>
        <rect x="-5" y="-6" width="10" height="12" rx="2" fill="url(#sm-corps)" stroke="#7a5c2c" stroke-width=".5"/>
        <path d="M0-6v-3.5" stroke="#d9d4c7" stroke-width=".8"/><circle cx="0" cy="-10.5" r="2.4" fill="#f6f1e8" stroke="#8d9499" stroke-width=".5"/></g>
      <g id="sm-station"><path d="M-46 0H46" stroke="#cfd3d6" stroke-width="2.2"/><path d="M-46 0H46" stroke="#8d9499" stroke-width=".6" stroke-dasharray="2 2"/>
        ${[-40, -27, 27, 40].map(x => `<rect x="${x - 4}" y="-25" width="8" height="21" fill="url(#sm-panneau)" stroke="#c9a46a" stroke-width=".6"/><rect x="${x - 4}" y="4" width="8" height="21" fill="url(#sm-panneau)" stroke="#c9a46a" stroke-width=".6"/><path d="M${x}-25v50M${x - 4}-14.5h8M${x - 4}14.5h8" stroke="#c9a46a" stroke-width=".35" opacity=".8"/>`).join('')}
        <rect x="-17" y="-5" width="34" height="10" rx="4" fill="url(#sm-module)" stroke="#6f777c" stroke-width=".5"/>
        <rect x="-6" y="-9" width="12" height="18" rx="4" fill="url(#sm-module)" stroke="#6f777c" stroke-width=".5"/>
        <rect x="17" y="-3.5" width="9" height="7" rx="3" fill="url(#sm-corps)" stroke="#7a5c2c" stroke-width=".5"/>
        <rect x="-26" y="-3.5" width="9" height="7" rx="3" fill="url(#sm-module)" stroke="#6f777c" stroke-width=".5"/>
        <path d="M-6-9l-6-6M6 9l5 5" stroke="#cfd3d6" stroke-width="1"/><circle cx="-12" cy="-15" r="2" fill="#f6f1e8"/></g>
      <radialGradient id="sm-lune-ombre" cx=".85" cy=".8" r=".9"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
      <mask id="sm-masque-terre" maskUnits="userSpaceOnUse" x="-1500" y="-1500" width="5000" height="5000"><rect x="-1500" y="-1500" width="5000" height="5000" fill="#fff"/><circle class="sm-masque-disque" r="0" fill="#000"/></mask>
    <clipPath id="sm-clip-lune"><rect class="sm-clip-lune-r" x="0" y="0" width="10000" height="10000"/></clipPath>
    </defs><g clip-path="url(#sm-clip-lune)"><g class="sm-lune-masque"><g class="sm-lune-pos"><g class="sm-lune">
      <image href="/site/lune/lune.png" x="-1" y="-1" width="2" height="2"/>
      <circle r="1" fill="url(#sm-lune-ombre)"/>
    </g></g></g></g>` + ORBITES.map(o => `<path class="sm-orbite${o[5] ? ' station' : ''}" d=""/>`).join('') + ORBITES.map(o => `<use class="sm-engin" href="#${o[5] ? 'sm-station' : 'sm-sat'}"/>`).join('');
    box.appendChild(orbSvg);
  }
  /* point d'une orbite : repère écran (x à droite, y en haut, z vers nous) */
  function pointOrbite(o, th, R) {
    const r = o[0] * R, x0 = r * Math.cos(th), s = r * Math.sin(th);
    const y0 = s * Math.sin(o[1]), z = s * Math.cos(o[1]);
    const cw = Math.cos(o[2]), sw = Math.sin(o[2]);
    return [x0 * cw - y0 * sw, x0 * sw + y0 * cw, z];
  }
  /* la Lune (Jean-Luc, 2026-11-23) : grande orbite au-delà des satellites, très lente ; elle entre dans le cadre,
     le traverse, en ressort, passe derrière la Terre (cachée par le disque du globe), puis revient */
  const LUNE = [2.3, -0.22, -0.1, -0.4, 0.11];
  function majLune(ctr, R, t) {
    const [x, y, z] = pointOrbite(LUNE, LUNE[3] + LUNE[4] * t, R);
    const g = orbSvg.querySelector('.sm-lune-pos'), rl = R * .17 * (1 + .12 * z / (LUNE[0] * R));
    g.setAttribute('transform', `translate(${(ctr.x + x).toFixed(1)} ${(ctr.y - y).toFixed(1)})`);
    g.firstElementChild.setAttribute('transform', `scale(${rl.toFixed(2)})`);
    const disque = orbSvg.querySelector('.sm-masque-disque');
    disque.setAttribute('cx', ctr.x.toFixed(1)); disque.setAttribute('cy', ctr.y.toFixed(1)); disque.setAttribute('r', (R * 1.004).toFixed(1));
    /* derrière la Terre : le disque du globe la masque ; devant : rien ne la masque */
    /* sur ordinateur, elle passe derrière la colonne des pays : on ne la dessine qu'à droite de celle-ci */
    const pv = mobile() ? null : bande.getBoundingClientRect(), bx = orbSvg.getBoundingClientRect();
    orbSvg.querySelector('.sm-clip-lune-r').setAttribute('x', pv && pv.width ? Math.round(pv.right - bx.left + 18) : 0);
    const m = g.parentNode; if (z < 0) m.setAttribute('mask', 'url(#sm-masque-terre)'); else m.removeAttribute('mask');
  }
  function majOrbites() {
    if (!orbSvg || !map) return;
    const globe = (map.getProjection()?.type || 'globe') === 'globe';
    orbSvg.style.display = globe ? '' : 'none'; if (!globe) return;
    const ctr = map.project(map.getCenter()), R = 512 * Math.pow(2, map.getZoom()) / (2 * Math.PI);
    const t = (performance.now() - orbT0) / 1000;
    const cache = (x, y, z) => z < 0 && x * x + y * y < R * R * 1.002;
    majLune(ctr, R, t);
    const chemins = orbSvg.querySelectorAll('.sm-orbite'), engins = orbSvg.querySelectorAll('.sm-engin');
    ORBITES.forEach((o, i) => {
      /* tracé de l'orbite : on saute la partie cachée derrière la Terre */
      let d = '', lev = true;
      for (let k = 0; k <= 96; k++) {
        const [x, y, z] = pointOrbite(o, k / 96 * Math.PI * 2, R);
        if (cache(x, y, z)) { lev = true; continue; }
        d += `${lev ? 'M' : 'L'}${(ctr.x + x).toFixed(1)} ${(ctr.y - y).toFixed(1)}`; lev = false;
      }
      chemins[i].setAttribute('d', d);
      /* l'engin : orienté le long de sa trajectoire, un peu plus grand quand il passe devant */
      const th = o[3] + o[4] * t, [x, y, z] = pointOrbite(o, th, R), [x2, y2] = pointOrbite(o, th + .02, R);
      const ang = Math.atan2(-(y2 - y), x2 - x) * 180 / Math.PI;
      const ech = (o[5] ? 1.25 : .8) * (1 + .22 * z / (o[0] * R)) * Math.max(.55, Math.min(1.2, R / 260));
      const e = engins[i];
      e.setAttribute('transform', `translate(${(ctr.x + x).toFixed(1)} ${(ctr.y - y).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${ech.toFixed(3)})`);
      e.style.opacity = cache(x, y, z) ? 0 : z < 0 ? .75 : 1;
    });
  }

  /* ---------- choix d'une spécialité ---------- */
  let arcAnim = 0;
  /* état de départ : aucun pays, bandeau d'arrivée, titre d'invitation (2e clic sur le pays choisi, Jean-Luc 2026-11-23) */
  const titre0 = $('[data-sm-titre]').textContent, phrase0 = $('[data-sm-phrase]')?.textContent || '';
  function deselectionner() {
    actif = -1;
    $$('[data-sm-i]').forEach(p => p.classList.remove('on'));
    const ss = $('[data-sm-sous]'); if (ss) ss.hidden = false;
    $('[data-sm-titre]').textContent = titre0; const ph = $('[data-sm-phrase]'); if (ph) ph.textContent = phrase0;
    const t = $('[data-sm-tete]'); t.classList.remove('entre'); void t.offsetWidth; t.classList.add('entre');
    if (heroImgs) { heroImgs.forEach(im => im.classList.remove('on')); hero.classList.remove('pays-on'); }
    trait.setAttribute('d', ''); root.classList.remove('sm-cache');
    if (!map || !geo) return;
    marque && marque.remove(); carteVoir && carteVoir.remove(); marque = carteVoir = null;
    cancelAnimationFrame(arcAnim);
    map.getSource('choix').setData({ type: 'FeatureCollection', features: [] });
    map.getSource('arc').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [PARIS, PARIS] } });
    map.flyTo({ center: [20, 22], zoom: zoomBase() + .35, duration: calme ? 0 : 1600, essential: true });
  }
  function choisir(i, { voler = true, bandeau = true } = {}) {
    if (i === actif) { deselectionner(); return; }
    actif = i;
    $$('[data-sm-i]').forEach(p => p.classList.toggle('on', +p.dataset.smI === i));
    const x = items[i]; if (!x) return;
    majTete(x);
    if (bandeau) majBandeau(x);
    if (mobile()) pauseBande(8000);
    if (!map || !geo) return;
    const c = centreDe(x);
    map.getSource('choix').setData({ type: 'FeatureCollection', features: geo.features.filter(f => x.ids.includes(f.id)) });
    /* point qui clignote + case « Voir nos propositions » */
    marque && marque.remove(); carteVoir && carteVoir.remove();
    const el = document.createElement('div'); el.className = 'sm-point'; el.innerHTML = '<i></i><i></i><b></b>';
    marque = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
    const box = document.createElement('a'); box.className = 'sm-case'; box.href = x.href;
    box.innerHTML = `${x.vignette ? `<img src="${esc(x.vignette)}" alt="">` : ''}<span><b>${esc(x.nom)}</b><small>Voir nos propositions →</small></span>`;
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
  /* ---------- téléphone : la bande de pavés défile toute seule, en boucle, de gauche à droite (Jean-Luc, 2026-11-22) ----------
     elle s'arrête dès qu'on la touche et repart quelques secondes après ; les pavés restent cliquables */
  const bande = $('[data-sm-paves]');
  bande.addEventListener('click', e => { const p = e.target.closest('[data-sm-i]'); if (!p) return; e.preventDefault(); choisir(+p.dataset.smI); });
  [...bande.children].forEach(li => { const c = li.cloneNode(true); c.classList.add('sm-copie'); c.setAttribute('aria-hidden', 'true'); c.querySelector('a').tabIndex = -1; bande.appendChild(c); });
  let bandeArret = 0, bandePos = -1, bandeT = 0;
  const largeurJeu = () => { const c = bande.querySelector('.sm-copie'); return c ? c.offsetLeft - bande.firstElementChild.offsetLeft : 0; };
  function pauseBande(ms) { bandeArret = Math.max(bandeArret, performance.now() + ms); bandePos = -1; }
  ['touchstart', 'pointerdown', 'wheel'].forEach(ev => bande.addEventListener(ev, () => pauseBande(4000), { passive: true }));
  bande.addEventListener('touchend', () => pauseBande(3500), { passive: true });
  function paveVisible(i) {
    const L = $$(`[data-sm-i="${i}"]`); if (!mobile()) return L[0];
    const B = bande.getBoundingClientRect();
    return L.find(p => { const r = p.getBoundingClientRect(); return r.right > B.left + 10 && r.left < B.right - 10; }) || null;
  }
  function defile(t) {
    requestAnimationFrame(defile);
    const dt = bandeT ? Math.min(.1, (t - bandeT) / 1000) : 0; bandeT = t;
    if (!mobile() || performance.now() < bandeArret) return;
    const W = largeurJeu(); if (!W) return;
    if (bandePos < 0) bandePos = bande.scrollLeft || W;
    bandePos -= 32 * dt; // pixels par seconde ; les pavés glissent vers la droite
    if (bandePos <= 0) bandePos += W;
    if (bandePos > W * 1.5) bandePos -= W;
    bande.scrollLeft = Math.round(bandePos);
  }
  requestAnimationFrame(defile);

  /* ---------- globe ---------- */
  function zoomBase() { const b = map.getContainer(); const w = b.clientWidth - (mobile() ? 0 : 380), h = b.clientHeight - (mobile() ? 0 : 270); return Math.log2(Math.max(260, Math.min(w, h)) / 512) + (mobile() ? .95 : 1.3); }
  /* rotation permanente (Jean-Luc, 2026-11-22) : la Terre tourne tout doucement d'ouest en est ;
     quand le pays choisi passe derrière, elle accélère pour le faire revenir vite de l'autre côté. */
  let tour = true, pause = 0, vitesse = 0, tPrec = 0;
  const LENT = 5, VITE = 75; // degrés par seconde
  const ecart = lon => { const d = ((lon - map.getCenter().lng) % 360 + 540) % 360 - 180; return d; }; // -180..180, négatif = à gauche
  function arreterTour() { tour = false; vitesse = 0; $('[data-sm-act="tour"]')?.setAttribute('aria-pressed', 'false'); }
  function boucleTour(t) {
    requestAnimationFrame(boucleTour);
    const dt = tPrec ? Math.min(.1, (t - tPrec) / 1000) : 0; tPrec = t;
    if (!map || !tour || performance.now() < pause || map.isMoving()) { vitesse = 0; return; }
    /* le pays file vers la gauche : dès qu'il va disparaître (bord gauche), on accélère jusqu'à son retour à droite */
    const d = actif >= 0 ? ecart(centreDe(items[actif])[0]) : 0;
    const cible = d < -70 || d > 110 ? VITE : LENT;
    vitesse += (cible - vitesse) * Math.min(1, dt * 2.2);
    const c = map.getCenter();
    map.jumpTo({ center: [c.lng + vitesse * dt, c.lat] });
  }
  function demarrer() {
    const ml = window.maplibregl; if (!ml) return;
    try { const cv = document.createElement('canvas'); if (!(cv.getContext('webgl2') || cv.getContext('webgl'))) return; } catch (e) { return; }
    const box = $('[data-sm-map]');
    creerOrbites(box);
    try {
      map = new ml.Map({
        container: box, attributionControl: false, center: [15, 30], zoom: 1.4, minZoom: .6, maxZoom: 5, renderWorldCopies: false,
        style: { version: 8, projection: { type: 'globe' }, sources: {}, layers: [{ id: 'mer', type: 'background', paint: { 'background-color': '#10261c' } }],
          sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, .9, 4, .3], 'sky-color': '#ffffff', 'horizon-color': '#e2c495', 'fog-color': '#ffffff', 'sky-horizon-blend': .6, 'horizon-fog-blend': .8, 'fog-ground-blend': 1 } },
        cooperativeGestures: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        /* taille du globe fixe (Jean-Luc) : on le fait tourner, on ne zoome pas */
        scrollZoom: false, boxZoom: false, doubleClickZoom: false, touchZoomRotate: false, keyboard: false,
      });
    } catch (e) { return; }
    root.smMap = map;
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
      const pad = () => map.setPadding(mobile() ? { left: 0, top: 0, right: 0, bottom: 40 } : { left: Math.min(380, box.clientWidth * .3), top: 250, right: 0, bottom: 30 });
      pad(); addEventListener('resize', pad);
      map.setZoom(zoomBase());

      /* survol et clic sur un pays */
      const tip = document.createElement('div'); tip.className = 'zl-tip sm-tip'; tip.hidden = true; box.appendChild(tip);
      let survol = null;
      const speDe = id => items.findIndex(x => x.ids.includes(id));
      map.on('mousemove', 'terres', e => {
        const f = e.features[0]; if (!f) return;
        const k = speDe(f.id);
        if (k < 0) { if (survol != null) map.setFeatureState({ source: 'pays', id: survol }, { survol: false }); survol = null; tip.hidden = true; map.getCanvas().style.cursor = ''; return; }
        if (survol !== f.id) { if (survol != null) map.setFeatureState({ source: 'pays', id: survol }, { survol: false }); survol = f.id; map.setFeatureState({ source: 'pays', id: survol }, { survol: true }); }
        map.getCanvas().style.cursor = 'pointer';
        tip.innerHTML = `<b>${esc(items[k].nom)}</b><span>${esc(items[k].pays || f.properties.nom)} · touchez pour voir</span>`;
        tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`; tip.hidden = false;
      });
      map.on('mouseleave', 'terres', () => { if (survol != null) map.setFeatureState({ source: 'pays', id: survol }, { survol: false }); survol = null; tip.hidden = true; map.getCanvas().style.cursor = ''; });
      map.on('click', 'terres', e => { const f = e.features[0]; const k = f ? speDe(f.id) : -1; if (k >= 0) choisir(k); });

      /* rotation lente au repos */
      /* on la fait tourner au doigt ou à la souris : la rotation reprend toute seule 2,5 s après */
      const repos = () => { pause = performance.now() + 2500; };
      ['mousedown', 'touchstart'].forEach(ev => box.addEventListener(ev, repos, { passive: true }));
      map.on('dragend', repos); map.on('moveend', e => { if (e.originalEvent) repos(); });

      /* boutons */
      const ctrl = $('[data-sm-ctrl]'); ctrl.hidden = false;
      if (!tour) ctrl.querySelector('[data-sm-act="tour"]').setAttribute('aria-pressed', 'false');
      ctrl.addEventListener('click', e => {
        const b = e.target.closest('[data-sm-act]'); if (!b) return;
        if (b.dataset.smAct === '3d') { const g = (map.getProjection()?.type || 'globe') === 'globe'; root.classList.toggle('sm-plat', g); map.setPaintProperty('choix', 'fill-extrusion-color', g ? '#ffffff' : '#d4b07a'); map.setPaintProperty('choix-bord', 'line-color', g ? '#ffffff' : '#f6e7c8'); map.setProjection({ type: g ? 'mercator' : 'globe' }); b.setAttribute('aria-pressed', String(!g)); if (g) map.easeTo({ zoom: Math.max(1, zoomBase() - .2), duration: 600 }); }
        if (b.dataset.smAct === 'tour') { if (tour) arreterTour(); else { tour = true; pause = 0; b.setAttribute('aria-pressed', 'true'); } }
        if (b.dataset.smAct === 'reset') { if (actif < 0) { map.flyTo({ center: [20, 22], zoom: zoomBase() + .35, duration: 1400 }); return; } const c = centreDe(items[actif]); map.flyTo({ center: [c[0] - (mobile() ? 0 : 6), Math.max(-35, Math.min(45, c[1] - 4))], zoom: zoomBase() + .35, duration: 1400 }); }
      });

      /* au départ : la Terre tourne, puis se pose sur la première spécialité */
      /* à l'arrivée : aucun pays choisi, la Terre tourne doucement en montrant l'Europe et l'Afrique */
      map.jumpTo({ center: [20, 22], zoom: zoomBase() + .35 });
      $('[data-sm-act="tour"]').setAttribute('aria-pressed', String(tour));
      boucleFleche();
      requestAnimationFrame(boucleTour);
    });
    addEventListener('resize', () => map && map.resize());
  }
  if (window.maplibregl) demarrer(); else addEventListener('load', demarrer);
})();
