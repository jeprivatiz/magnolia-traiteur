/* Accueil : la vignette « Saveurs du monde » montre un petit globe qui tourne doucement (Jean-Luc, 2026-11-24).
   Globe dessiné en canvas 2D (projection orthographique), sans MapLibre : léger, fluide sur téléphone.
   Terres en points crème, nos pays en or ; il ne tourne que lorsqu'il est visible, image fixe si animations réduites. */
(function () {
  'use strict';
  const tile = document.querySelector('[data-vg]');
  if (!tile) return;
  const cv = tile.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const groupes = JSON.parse(tile.dataset.vg || '[]').map(g => (Array.isArray(g) ? g : [g]).map(String));
  const nos = new Set(groupes.flat());
  const D = Math.PI / 180, INCL = 24 * D, VITESSE = 9; // axe basculé vers nous : l'Europe et l'hémisphère nord bien visibles (Jean-Luc, 2026-11-24) // degrés par seconde
  let pts = null, ors = null, flashs = [], lon0 = 15, W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1, vu = false, t0 = 0, raf = 0;

  /* point dans un polygone (anneaux GeoJSON) */
  const dans = (x, y, ring) => {
    let ok = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
  };
  function charger(monde, points) {
    const polys = [];
    monde.features.filter(f => nos.has(String(f.properties.id))).forEach(f => {
      const P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      P.forEach(p => polys.push(p[0]));
    });
    pts = []; ors = [];
    points.forEach(([x, y]) => (polys.some(r => dans(x, y, r)) ? ors : pts).push([x * D, y * D]));
    /* un point lumineux par spécialité, au centre de ses pays */
    flashs = groupes.map(g => {
      const P = monde.features.filter(f => g.includes(String(f.properties.id))).flatMap(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
      let vx = 0, vy = 0, vz = 0;
      P.forEach(p => p[0].forEach(([x, y]) => { const la = y * D, lo = x * D; vx += Math.cos(la) * Math.cos(lo); vy += Math.cos(la) * Math.sin(lo); vz += Math.sin(la); }));
      return vx || vy || vz ? [Math.atan2(vy, vx), Math.atan2(vz, Math.hypot(vx, vy))] : null;
    }).filter(Boolean);
    /* les petits pays (Liban, Antilles…) n'ont parfois aucun point : on ajoute leur centre */
    monde.features.filter(f => nos.has(String(f.properties.id))).forEach(f => {
      const P = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let sx = 0, sy = 0, n = 0; P.forEach(p => p[0].forEach(([x, y]) => { sx += x; sy += y; n++; }));
      if (n) ors.push([sx / n * D, sy / n * D]);
    });
  }
  function taille() {
    const r = tile.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    R = Math.min(W * .31, H * .25); cx = W / 2; cy = H * .37;
  }
  function dessiner(t) {
    const L = lon0 + (calme ? 0 : VITESSE * (t - t0) / 1000);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    /* halo doré et océan vert profond */
    const halo = ctx.createRadialGradient(cx, cy, R * .9, cx, cy, R * 1.45);
    halo.addColorStop(0, 'rgba(226,196,149,.35)'); halo.addColorStop(1, 'rgba(226,196,149,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.45, 0, 7); ctx.fill();
    const a = (t - t0) / 1000 * .5;
    const orbite = (de, a2) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35); ctx.strokeStyle = 'rgba(226,196,149,.5)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.32, R * .42, 0, de, a2); ctx.stroke(); ctx.restore(); };
    orbite(Math.PI, 2 * Math.PI); // moitié arrière, cachée par le globe
    const mer = ctx.createRadialGradient(cx - R * .35, cy - R * .4, R * .1, cx, cy, R);
    mer.addColorStop(0, '#2f5a43'); mer.addColorStop(.7, '#173a2a'); mer.addColorStop(1, '#0d2419');
    ctx.fillStyle = mer; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    if (pts) {
      const cl = Math.cos(L * D), sl = Math.sin(L * D), ci = Math.cos(INCL), si = Math.sin(INCL);
      const xyz = (lo, la) => {
        const cla = Math.cos(la), x0 = cla * Math.sin(lo), z0 = cla * Math.cos(lo), y0 = Math.sin(la);
        const x = x0 * cl - z0 * sl, z1 = x0 * sl + z0 * cl;
        return [x, y0 * ci - z1 * si, y0 * si + z1 * ci];
      };
      const proj = (lo, la, taille, coul) => {
        const [x, y, z] = xyz(lo, la);
        if (z <= 0) return;
        ctx.globalAlpha = .35 + .65 * z; ctx.fillStyle = coul;
        ctx.beginPath(); ctx.arc(cx + x * R, cy - y * R, taille * (.6 + .4 * z), 0, 7); ctx.fill();
      };
      const p = Math.max(.9, R / 95);
      pts.forEach(([lo, la]) => proj(lo, la, p, '#e9dcc0'));
      ors.forEach(([lo, la]) => proj(lo, la, p * 1.5, '#e2b55f'));
      ctx.globalAlpha = 1;
      /* chaque spécialité s'allume à son tour comme un flash puis s'éteint (Jean-Luc, 2026-11-24) */
      const s = (t - t0) / 1000;
      flashs.forEach(([lo, la], i) => {
        const [x, y, z] = xyz(lo, la); if (z <= .15) return;
        const ph = ((s / 1.1 + i * 2.37) % 3.2) / 3.2; // cycle propre à chaque pays, décalé
        if (ph > .45) return;
        const k = ph / .45, eclat = Math.sin(k * Math.PI), X = cx + x * R, Y = cy - y * R;
        const g = ctx.createRadialGradient(X, Y, 0, X, Y, R * .22);
        g.addColorStop(0, `rgba(255,244,214,${.95 * eclat})`); g.addColorStop(.35, `rgba(242,196,106,${.55 * eclat})`); g.addColorStop(1, 'rgba(242,196,106,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R * .22, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(255,236,190,${.7 * (1 - k)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X, Y, 3 + k * R * .2, 0, 7); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${eclat})`; ctx.beginPath(); ctx.arc(X, Y, 2.2, 0, 7); ctx.fill();
      });
    }
    /* reflet et liseré or */
    const ref = ctx.createRadialGradient(cx - R * .45, cy - R * .5, 0, cx - R * .45, cy - R * .5, R * 1.1);
    ref.addColorStop(0, 'rgba(255,255,255,.16)'); ref.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ref; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(226,196,149,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    orbite(0, Math.PI); // moitié avant
    /* le satellite passe devant puis derrière le globe */
    const sx = Math.cos(a) * R * 1.32, sy = Math.sin(a) * R * .42, rx = sx * Math.cos(-.35) - sy * Math.sin(-.35), ry = sx * Math.sin(-.35) + sy * Math.cos(-.35);
    if (Math.sin(a) > 0 || rx * rx + ry * ry > R * R) { ctx.fillStyle = '#f3e3bf'; ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 2.4, 0, 7); ctx.fill(); }
  }
  function boucle(t) { if (!t0) t0 = t; dessiner(t); raf = vu && !calme ? requestAnimationFrame(boucle) : 0; }
  function relancer() { if (!raf && vu && !calme) raf = requestAnimationFrame(boucle); }

  taille();
  addEventListener('resize', () => { taille(); if (calme || !vu) dessiner(performance.now()); });
  new IntersectionObserver(e => { vu = e[0].isIntersecting; relancer(); }, { rootMargin: '80px' }).observe(tile);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else relancer(); });
  Promise.all([fetch('/data/monde.json').then(r => r.json()), fetch('/data/monde-points.json').then(r => r.json())])
    .then(([m, p]) => { charger(m, p); tile.classList.add('vg-pret'); dessiner(performance.now()); relancer(); })
    .catch(() => { /* la photo de la vignette reste affichée */ });
})();
