/* Plateau de fruits de mer en 3D (Jean-Luc, 2026-11-23).
   Tout est construit en code avec three.js (licence MIT, public/vendor/three) : aucune image, aucun modèle extérieur.
   Grand plateau blanc, lit de glace pilée, huîtres, crustacés, citrons, rince-doigts, papier glacé et ruban doré.
   Le plateau tourne lentement ; on le fait tourner du doigt (gauche/droite), jamais de zoom.
   Il se compose avec les produits que le client ajoute (sélection « mg_sel » du site). */
import * as THREE from '/vendor/three/three.module.min.js';
import { RoomEnvironment } from '/vendor/three/RoomEnvironment.js';


/* ---------------- petits outils ---------------- */
function hash(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
function bruit(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
let graine = 7;
const alea = () => { graine = (graine * 16807) % 2147483647; return (graine - 1) / 2147483646; };
const col = h => new THREE.Color(h);
/* déforme une géométrie point par point (fn reçoit un Vector3 à modifier) et pose des couleurs par sommet */
function deformer(g, fn, couleur) {
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Color();
  const cols = couleur ? new Float32Array(p.count * 3) : null;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const o = v.clone();
    fn(v, o);
    p.setXYZ(i, v.x, v.y, v.z);
    if (cols) { couleur(o, c, v); cols.set([c.r, c.g, c.b], i * 3); }
  }
  if (cols) g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}
/* donne une couleur unie aux morceaux d'un modèle qui n'ont pas de couleurs par sommet (sinon ils sortiraient noirs) */
function teinter(g, hex) {
  const c = new THREE.Color(hex);
  g.traverse(o => { if (o.isMesh && o.material.vertexColors && !o.geometry.attributes.color) { const n = o.geometry.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); o.geometry.setAttribute('color', new THREE.BufferAttribute(a, 3)); } });
  return g;
}
/* tube dont le rayon varie le long de la courbe (corps de crevette, pattes, algues) */
function tubeVar(courbe, nSeg, nRad, rayon, ecrase = 1) {
  const g = new THREE.TubeGeometry(courbe, nSeg, 1, nRad, false);
  const p = g.attributes.position, fr = courbe.computeFrenetFrames(nSeg, false), v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= nSeg; i++) {
    const t = i / nSeg; courbe.getPointAt(t, c);
    const r = rayon(t);
    for (let j = 0; j <= nRad; j++) {
      const k = i * (nRad + 1) + j;
      v.fromBufferAttribute(p, k).sub(c);
      const n = fr.normals[i], b = fr.binormals[i];
      const a = v.dot(n), bb = v.dot(b);
      v.copy(n).multiplyScalar(a * r).addScaledVector(b, bb * r * ecrase).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
function texture(w, h, dessin) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  dessin(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ---------------- matières ---------------- */
function matieres() {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const citronFace = texture(256, 256, (x, w) => {
    const r = w / 2;
    x.fillStyle = '#f4e27a'; x.beginPath(); x.arc(r, r, r, 0, 7); x.fill();
    x.fillStyle = '#fbf6d8'; x.beginPath(); x.arc(r, r, r * .93, 0, 7); x.fill();
    for (let i = 0; i < 9; i++) {
      const a0 = i / 9 * Math.PI * 2 + .04, a1 = (i + 1) / 9 * Math.PI * 2 - .04;
      const g = x.createRadialGradient(r, r, r * .08, r, r, r * .86);
      g.addColorStop(0, '#fff6b8'); g.addColorStop(1, '#f2d54a');
      x.fillStyle = g; x.beginPath(); x.moveTo(r + Math.cos((a0 + a1) / 2) * r * .1, r + Math.sin((a0 + a1) / 2) * r * .1); x.arc(r, r, r * .86, a0, a1); x.closePath(); x.fill();
    }
    x.fillStyle = '#fffbe3'; x.beginPath(); x.arc(r, r, r * .07, 0, 7); x.fill();
  });
  const saumon = texture(256, 64, (x, w, h) => {
    x.fillStyle = '#f07d55'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { x.strokeStyle = 'rgba(255,225,205,.75)'; x.lineWidth = 2 + (i % 3); x.beginPath(); const X = i * 19 + 4; x.moveTo(X, 0); x.bezierCurveTo(X + 12, h * .3, X - 10, h * .7, X + 6, h); x.stroke(); }
  });
  saumon.wrapS = THREE.RepeatWrapping;
  const M = {
    porcelaine: P({ color: 0xffffff, roughness: .16, clearcoat: 1, clearcoatRoughness: .08, sheen: .2 }),
    glace: P({ color: 0xdcecf6, roughness: .05, metalness: 0, transparent: true, opacity: .78, clearcoat: 1, clearcoatRoughness: .02, ior: 1.31, specularIntensity: 1 }),
    glaceFond: P({ color: 0xd3e6f1, roughness: .28, clearcoat: .8, clearcoatRoughness: .1 }),
    coquille: S({ vertexColors: true, roughness: .78 }),
    nacre: P({ color: 0xf1ecef, roughness: .12, clearcoat: 1, iridescence: .9, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 600], vertexColors: true }),
    chairHuitre: P({ vertexColors: true, roughness: .22, clearcoat: 1, clearcoatRoughness: .05 }),
    carapace: P({ vertexColors: true, roughness: .38, clearcoat: .7, clearcoatRoughness: .2 }),
    chairBlanche: P({ vertexColors: true, roughness: .45, clearcoat: .3 }),
    noir: P({ color: 0x0a0a0a, roughness: .1, clearcoat: 1 }),
    zeste: P({ color: 0xf2cf2a, roughness: .42, clearcoat: .5 }),
    citronFace: P({ map: citronFace, roughness: .3, clearcoat: .9 }),
    verre: P({ color: 0xf4fbff, roughness: .02, transparent: true, opacity: .42, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    eau: P({ color: 0xa9d8ea, roughness: .02, transparent: true, opacity: .7, clearcoat: 1, depthWrite: false }),
    algue: P({ color: 0x2f5a2a, roughness: .35, clearcoat: .6 }),
    salicorne: P({ color: 0x5f8f3a, roughness: .4, clearcoat: .4 }),
    oursin: P({ color: 0x2b1830, roughness: .35, clearcoat: .5 }),
    corail: P({ color: 0xf08a1c, roughness: .3, clearcoat: .9 }),
    or: P({ color: 0xc9a46a, metalness: 1, roughness: .22, clearcoat: .6 }),
    argent: P({ color: 0xd9dde0, metalness: 1, roughness: .18 }),
    caviar: P({ color: 0x15140f, roughness: .12, clearcoat: 1 }),
    oeufs: P({ color: 0xf2651d, roughness: .05, clearcoat: 1, transparent: true, opacity: .92 }),
    saumon: P({ map: saumon, roughness: .35, clearcoat: .6 }),
    tarama: P({ color: 0xf3c2bd, roughness: .5, clearcoat: .2 }),
    taramaOursin: P({ color: 0xf0a46c, roughness: .5, clearcoat: .2 }),
    taramaBlanc: P({ color: 0xf2ddd2, roughness: .5, clearcoat: .2 }),
    blini: S({ color: 0xd9a75e, roughness: .8 }),
    anchois: P({ color: 0xc9ccd0, metalness: .6, roughness: .25, clearcoat: 1 }),
    cellophane: P({ color: 0xffffff, roughness: .04, metalness: 0, transparent: true, opacity: .07, specularIntensity: 1, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 900], side: THREE.DoubleSide, depthWrite: false }),
    ombre: new THREE.MeshBasicMaterial({ map: texture(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false }),
  };
  /* papier glacé : presque invisible de face, brillant et blanc sur les bords (effet de Fresnel), comme un vrai cellophane */
  M.cellophane.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), fr * 0.55);
      gl_FragColor.a = clamp(gl_FragColor.a + fr * 0.6, 0.0, 0.9);`);
  };
  return M;
}

/* ---------------- modèles (géométries partagées, construites une fois) ---------------- */
function modeles(M) {
  const G = {};
  /* huître ouverte sur sa coquille creuse, en forme de goutte */
  const huitre = (teinte, taille) => {
    const g = new THREE.Group();
    const forme = (v, k) => { const t = (v.x + 1) / 2; v.z *= .62 + .38 * (1 - t) ** .7; v.x *= 1.28; v.y *= k; };
    const coq = deformer(new THREE.SphereGeometry(1, 30, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), (v, o) => {
      forme(v, .42); const n = bruit(o.x * 3, o.z * 3, 1) * .09 + Math.sin(Math.hypot(o.x + 1, o.z) * 16) * .025;
      v.x *= 1 + n; v.z *= 1 + n; v.y -= Math.abs(n) * .5;
    }, (o, c) => { const b = (bruit(o.x * 5, o.z * 5, 2) + 1) / 2; c.set(teinte).lerp(col(0x4b5a4c), b * .6).lerp(col(0x2f2a26), Math.max(0, o.y + .25) * 1.4); });
    g.add(new THREE.Mesh(coq, M.coquille));
    const nac = deformer(new THREE.CircleGeometry(.94, 30), (v) => { const x = v.x, z = v.y; v.set(x, 0, -z); forme(v, 1); v.y = .02 - (1 - Math.min(1, Math.hypot(x, z))) * .06; }, (o, c) => { const r = Math.hypot(o.x, o.y); c.set(0xf4eff4).lerp(col(0x7d7590), Math.min(1, Math.max(0, r - .8) * 4.5)); });
    g.add(new THREE.Mesh(nac, M.nacre));
    const chair = deformer(new THREE.SphereGeometry(.7, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), (v, o) => {
      const t = (o.x / .7 + 1) / 2; v.z *= (.58 + .32 * (1 - t)); v.x *= 1.2; v.y *= .2;
      const f = Math.sin(Math.atan2(o.z, o.x) * 18) * .035 * Math.max(0, Math.hypot(o.x, o.z) / .7 - .6); v.x += f; v.z += f; v.y += bruit(o.x * 6, o.z * 6, 3) * .03;
    }, (o, c) => { const r = Math.hypot(o.x, o.z) / .7; c.set(0xd9ccb2).lerp(col(0xbfae94), (bruit(o.x * 7, o.z * 7, 4) + 1) * .3).lerp(col(0x3d3631), Math.min(1, Math.max(0, r - .66) * 4)); });
    const ch = new THREE.Mesh(chair, M.chairHuitre); ch.position.set(-.05, .03, 0); g.add(ch);
    g.scale.setScalar(taille);
    return g;
  };
  G.huitre = huitre(0x8e9a8a, 1);
  G.huitreFine = huitre(0x9a978a, .92);
  G.huitreGrosse = huitre(0x7f8d80, 1.1);

  /* praire : petit coquillage bombé, strié */
  {
    const g = new THREE.Group();
    const geo = deformer(new THREE.SphereGeometry(.6, 24, 14), (v, o) => { v.y *= o.y > 0 ? .55 : .35; v.z *= .9; v.y += Math.sin(Math.hypot(o.x, o.z - .6) * 30) * .012; }, (o, c) => { const s = Math.sin(Math.hypot(o.x, o.z - .6) * 30); c.set(0xb39674).lerp(col(0x6d5236), (s + 1) * .3).lerp(col(0xe6d8c0), Math.max(0, o.y - .1) * .5); });
    g.add(new THREE.Mesh(geo, M.coquille));
    G.praire = g;
  }

  /* crevette : corps en C, anneaux, queue en éventail, tête, antennes */
  const crevette = (base, clair, L) => {
    const g = new THREE.Group();
    const pts = []; for (let i = 0; i <= 10; i++) { const a = -.3 + i / 10 * 3.6; pts.push(new THREE.Vector3(Math.cos(a) * L * .55, Math.sin(i / 10 * Math.PI) * .12 * L, Math.sin(a) * L * .55)); }
    const courbe = new THREE.CatmullRomCurve3(pts);
    const corps = tubeVar(courbe, 60, 12, t => (t < .1 ? .1 + t * 1.6 : t > .82 ? .26 - (t - .82) * 1.1 : .26 - Math.abs(t - .45) * .1) * L * .62, .85);
    const pc = corps.attributes.position, cl = new Float32Array(pc.count * 3), cc = new THREE.Color();
    for (let i = 0; i < pc.count; i++) { const t = Math.floor(i / 13) / 60; const s = (Math.sin(t * 60) + 1) / 2; cc.set(base).lerp(col(clair), s * .45 + (pc.getY(i) < .02 ? .35 : 0)); cl.set([cc.r, cc.g, cc.b], i * 3); }
    corps.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.add(new THREE.Mesh(corps, M.carapace));
    const fin = courbe.getPointAt(0), dir = courbe.getTangentAt(0);
    for (let k = -1; k <= 1; k++) {
      const q = new THREE.Mesh(deformer(new THREE.SphereGeometry(.2 * L, 10, 6), v => { v.x *= 1.6; v.y *= .18; }, (o, c) => c.set(base).lerp(col(0x9a2a10), .25)), M.carapace);
      q.position.copy(fin).addScaledVector(dir, -.18 * L); q.rotation.y = Math.atan2(-dir.z, dir.x) + Math.PI + k * .45; q.position.x += Math.cos(q.rotation.y) * .12 * L; q.position.z -= Math.sin(q.rotation.y) * .12 * L;
      g.add(q);
    }
    const tete = courbe.getPointAt(1), td = courbe.getTangentAt(1);
    const th = new THREE.Mesh(deformer(new THREE.SphereGeometry(.3 * L, 16, 10), v => { v.x *= 1.5; v.y *= .85; }, (o, c) => c.set(base).lerp(col(0xd9461e), .3).lerp(col(clair), Math.max(0, o.y) * .8)), M.carapace);
    th.position.copy(tete).addScaledVector(td, .28 * L); th.rotation.y = Math.atan2(-td.z, td.x); g.add(th);
    for (const s of [-1, 1]) {
      const oe = new THREE.Mesh(new THREE.SphereGeometry(.045 * L, 8, 6), M.noir); oe.position.copy(th.position).addScaledVector(td, .32 * L).add(new THREE.Vector3(-td.z * s * .14 * L, .12 * L, td.x * s * .14 * L)); g.add(oe);
      const a0 = th.position.clone().addScaledVector(td, .35 * L);
      const ant = new THREE.CatmullRomCurve3([a0, a0.clone().addScaledVector(td, .8 * L).add(new THREE.Vector3(-td.z * s * .5 * L, .25 * L, td.x * s * .5 * L)), a0.clone().addScaledVector(td, 1.3 * L).add(new THREE.Vector3(-td.z * s * 1.6 * L, -.05, td.x * s * 1.6 * L))]);
      g.add(new THREE.Mesh(tubeVar(ant, 16, 4, t => .018 * L * (1 - t * .7)), M.carapace));
    }
    return teinter(g, base);
  };
  G.crevette = crevette(0xef6a45, 0xffd2bd, 1);
  G.crevetteGrise = crevette(0xb0896a, 0xe9d8c4, .62);

  /* langoustine : corps allongé rose saumon, longues pinces fines */
  {
    const g = new THREE.Group(), L = 1;
    const base = 0xf09a7e, clair = 0xffe1d2;
    const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5, .05, 0), new THREE.Vector3(-.7, .16, 0), new THREE.Vector3(.4, .2, 0), new THREE.Vector3(1.3, .16, 0)]);
    const corps = tubeVar(courbe, 50, 12, t => (t < .08 ? .12 + t * 2 : t > .55 ? .3 + Math.sin((t - .55) / .45 * Math.PI) * .06 : .26) * L, .78);
    deformer(corps, v => v, (o, c) => { const s = (Math.sin(o.x * 9) + 1) / 2; c.set(base).lerp(col(clair), o.x < .4 ? s * .5 : .2 + Math.max(0, o.y - .2) * 2); });
    g.add(new THREE.Mesh(corps, M.carapace));
    for (let k = -1; k <= 1; k++) { const q = new THREE.Mesh(deformer(new THREE.SphereGeometry(.22, 10, 6), v => { v.x *= 1.5; v.y *= .15; }, (o, c) => c.set(base)), M.carapace); q.position.set(-1.62, .05, k * .15); q.rotation.y = k * .45; g.add(q); }
    for (const s of [-1, 1]) {
      const bras = new THREE.CatmullRomCurve3([new THREE.Vector3(1.15, .1, s * .18), new THREE.Vector3(1.6, .14, s * .55), new THREE.Vector3(2.4, .12, s * .7), new THREE.Vector3(3.1, .08, s * .5)]);
      g.add(new THREE.Mesh(tubeVar(bras, 30, 6, t => t > .7 ? .11 - (t - .7) * .25 : .06 + t * .07), M.carapace));
      const pi = new THREE.CatmullRomCurve3([new THREE.Vector3(3, .08, s * .52), new THREE.Vector3(3.5, .07, s * .38), new THREE.Vector3(3.8, .06, s * .3)]);
      g.add(new THREE.Mesh(tubeVar(pi, 12, 5, t => .05 * (1 - t)), M.carapace));
      const oe = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), M.noir); oe.position.set(1.45, .3, s * .1); g.add(oe);
    }
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const p = new THREE.CatmullRomCurve3([new THREE.Vector3(.6 + i * .15, .05, s * .15), new THREE.Vector3(.5 + i * .15, -.02, s * .55)]); g.add(new THREE.Mesh(tubeVar(p, 6, 4, () => .025), M.carapace)); }
    g.scale.setScalar(.78);
    G.langoustine = teinter(g, 0xf09a7e);
  }

  /* demi-homard : coupé dans la longueur, chair blanche apparente, pince */
  {
    const g = new THREE.Group();
    const rouge = 0xc9311b, sombre = 0x6e1a12;
    const coque = deformer(new THREE.SphereGeometry(1, 34, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), (v, o) => { const w = o.x > .1 ? 1 - (o.x - .1) * .35 : .78 + (o.x + 1) * .12; v.x *= 2.6; v.z *= w; v.y *= .62; if (o.x < .1) v.z *= 1 + Math.max(0, Math.sin(o.x * 22)) * .07; }, (o, c) => { const s = (Math.sin(o.x * 14) + 1) / 2; c.set(rouge).lerp(col(sombre), s * .35 + (bruit(o.x * 6, o.z * 6, 9) + 1) * .15).lerp(col(0xf08a40), Math.max(0, o.y + .1) * 1.2); });
    g.add(new THREE.Mesh(coque, M.carapace));
    const chair = deformer(new THREE.CircleGeometry(1, 34), v => { const x = v.x, z = v.y; const w = x > .1 ? 1 - (x - .1) * .35 : .78 + (x + 1) * .12; v.set(x * 2.5, .04 + (1 - x * x - z * z) * .18, -z * w * .95); v.y += Math.sin(x * 12) * .02; }, (o, c) => { const x = o.x; c.set(0xfbf3ea).lerp(col(0xf0b9a0), (Math.sin(x * 22) + 1) * .18).lerp(col(0xd8452c), Math.min(1, Math.max(0, Math.abs(o.y) - .75) * 5)).lerp(col(0xf2c15c), x > .6 ? (x - .6) * 1.6 : 0); });
    g.add(new THREE.Mesh(chair, M.chairBlanche));
    for (let k = -1; k <= 1; k++) { const q = new THREE.Mesh(deformer(new THREE.SphereGeometry(.38, 12, 6), v => { v.x *= 1.5; v.y *= .15; }, (o, c) => c.set(rouge).lerp(col(sombre), .3)), M.carapace); q.position.set(-2.75, -.05, k * .22); q.rotation.y = k * .5; g.add(q); }
    const pince = deformer(new THREE.SphereGeometry(.5, 20, 12), (v, o) => { v.x *= 1.9; v.y *= .55; v.z *= .9; if (o.x > .3) v.z += Math.sign(o.z) * .08; v.y += bruit(o.x * 5, o.y * 5, o.z * 5) * .05; }, (o, c) => c.set(rouge).lerp(col(sombre), (bruit(o.x * 8, o.y * 8, o.z * 8) + 1) * .3).lerp(col(0xf0c080), Math.max(0, -o.y) * .6));
    const pm = new THREE.Mesh(pince, M.carapace); pm.position.set(2.75, .05, 1.05); pm.rotation.y = -.6; pm.scale.setScalar(1.35); g.add(pm);
    const bras = new THREE.CatmullRomCurve3([new THREE.Vector3(2.2, .05, .2), new THREE.Vector3(2.4, .12, .55), new THREE.Vector3(2.2, .05, .95)]);
    g.add(new THREE.Mesh(tubeVar(bras, 14, 8, () => .16), M.carapace));
    const ant = new THREE.CatmullRomCurve3([new THREE.Vector3(2.5, .2, -.1), new THREE.Vector3(3.5, .35, -.5), new THREE.Vector3(4.6, .1, -1.2)]);
    g.add(new THREE.Mesh(tubeVar(ant, 20, 4, t => .04 * (1 - t * .7)), M.carapace));
    g.scale.setScalar(.82);
    G.demiHomard = teinter(g, 0xc9311b);
  }

  /* tourteau : carapace bombée brun-orangé, pattes articulées, grosses pinces à bout noir */
  {
    const g = new THREE.Group();
    const brun = 0xb5532a, fonce = 0x6b2b16, clair = 0xe59a5a;
    const cara = deformer(new THREE.SphereGeometry(1, 40, 20), (v, o) => { v.x *= 1.75; v.z *= 1.25; v.y *= o.y > 0 ? .62 : .2; const a = Math.atan2(o.z, o.x); v.x *= 1 + Math.sin(a * 9) * .018 * (1 - Math.abs(o.y)); v.z *= 1 + Math.sin(a * 9) * .018 * (1 - Math.abs(o.y)); v.y += bruit(o.x * 5, o.y * 5, o.z * 5) * .03; },
      (o, c) => { const b = (bruit(o.x * 7, o.y * 7, o.z * 7) + 1) / 2; c.set(brun).lerp(col(fonce), b * .5 + Math.max(0, .3 - o.y) * .6).lerp(col(clair), Math.max(0, o.y - .55) * 1.2); });
    const cm = new THREE.Mesh(cara, M.carapace); cm.position.y = .2; g.add(cm);
    const patte = (s, i) => {
      const a = (i - 1.5) * .42 + (s > 0 ? Math.PI : 0);
      const ox = Math.cos(a) * -1.5, oz = Math.sin(a) * 1.05;
      const kx = Math.cos(a) * -2.4, kz = Math.sin(a) * 1.9 + s * .35;
      const fx = Math.cos(a) * -2.9, fz = Math.sin(a) * 2.6 + s * .55;
      const c1 = new THREE.CatmullRomCurve3([new THREE.Vector3(ox, .12, oz), new THREE.Vector3(kx, .42, kz)]);
      const c2 = new THREE.CatmullRomCurve3([new THREE.Vector3(kx, .42, kz), new THREE.Vector3(fx, -.02, fz)]);
      g.add(new THREE.Mesh(tubeVar(c1, 8, 7, t => .13 - t * .02), M.carapace));
      g.add(new THREE.Mesh(tubeVar(c2, 8, 7, t => .11 * (1 - t * .8)), M.carapace));
    };
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) patte(s, i);
    for (const s of [-1, 1]) {
      const b = new THREE.CatmullRomCurve3([new THREE.Vector3(1.3, .15, s * .6), new THREE.Vector3(1.9, .35, s * 1.25), new THREE.Vector3(2.4, .3, s * 1.1)]);
      g.add(new THREE.Mesh(tubeVar(b, 14, 8, t => .2 + t * .05), M.carapace));
      const pin = new THREE.Mesh(deformer(new THREE.SphereGeometry(.42, 18, 12), (v, o) => { v.x *= 1.7; v.y *= .75; }, (o, c) => c.set(brun).lerp(col(clair), Math.max(0, o.y) * .8).lerp(col(0x1a120e), Math.max(0, o.x - .25) * 4)), M.carapace);
      pin.position.set(2.75, .3, s * .95); pin.rotation.y = -s * .45; g.add(pin);
    }
    g.scale.setScalar(.85);
    G.tourteau = teinter(g, 0xb5532a);
    const demi = g.clone(); demi.scale.setScalar(.66); G.demiTourteau = demi;
  }

  /* bulot : coquille en spirale couchée, beige strié */
  {
    const prof = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40; const r = (t < .15 ? t / .15 * .55 : .55 * (1 - (t - .15) / .85) ** 1.1) + Math.abs(Math.sin(t * Math.PI * 7)) * .05 * (1 - t); prof.push(new THREE.Vector2(Math.max(.005, r), t * 1.5)); }
    const geo = deformer(new THREE.LatheGeometry(prof, 22), (v, o) => { const tw = o.y * 4; const x = v.x, z = v.z; v.x = x * Math.cos(tw) - z * Math.sin(tw); v.z = x * Math.sin(tw) + z * Math.cos(tw); v.x += Math.sin(o.y * 3) * .06; },
      (o, c) => { const s = (Math.sin(o.y * 44 + Math.atan2(o.z, o.x) * 2) + 1) / 2; c.set(0xc09d72).lerp(col(0x5e4429), s * .6).lerp(col(0x3e2f22), o.y < .08 ? .7 : 0); });
    const g = new THREE.Group(); const m = new THREE.Mesh(geo, M.coquille); m.rotation.z = -Math.PI / 2 + .25; m.position.set(-.7, .3, 0); g.add(m);
    g.scale.setScalar(.85);
    G.bulot = g;
  }

  /* oursin : demi-sphère violet sombre à piquants, ouvert sur ses langues orangées */
  {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(.72, 22, 12, 0, Math.PI * 2, Math.PI * .28, Math.PI * .72), M.oursin));
    const pics = [];
    const cone = new THREE.ConeGeometry(.035, .55, 4); cone.translate(0, .27, 0);
    for (let i = 0; i < 110; i++) {
      const y = -1 + i / 110 * 1.45, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const c = cone.clone(); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); c.translate(d.x * .66, d.y * .66, d.z * .66); pics.push(c);
    }
    g.add(new THREE.Mesh(fusion(pics), M.oursin));
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(deformer(new THREE.SphereGeometry(.2, 12, 8), v => { v.x *= 1.9; v.y *= .55; v.y += bruit(v.x * 9, v.z * 9, 5) * .02; }), M.corail); const a = i / 5 * Math.PI * 2; l.position.set(Math.cos(a) * .3, .5, Math.sin(a) * .3); l.rotation.y = -a; g.add(l); }
    g.position.y = .15;
    const w = new THREE.Group(); w.add(g); w.scale.setScalar(.85);
    G.oursin = w;
  }

  /* boîte de caviar ouverte, couvercle posé contre */
  {
    const g = new THREE.Group();
    const boite = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .35, 40, 1, true), M.or); boite.position.y = .18; g.add(boite);
    const grains = deformer(new THREE.CircleGeometry(.73, 40), v => { const x = v.x, z = v.y; v.set(x, .34 + bruit(x * 40, z * 40, 1) * .012, -z); }); g.add(new THREE.Mesh(grains, M.caviar));
    const fond = new THREE.Mesh(new THREE.CircleGeometry(.75, 40), M.or); fond.rotation.x = -Math.PI / 2; g.add(fond);
    const cv = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .1, 40), M.or); cv.position.set(.55, .55, -.55); cv.rotation.set(.9, 0, -.4); g.add(cv);
    G.caviar = g;
  }
  /* verrine d'œufs de saumon */
  {
    const g = new THREE.Group();
    const prof = [new THREE.Vector2(.0, 0), new THREE.Vector2(.55, 0), new THREE.Vector2(.68, .5), new THREE.Vector2(.7, .52)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), M.verre));
    const boule = new THREE.SphereGeometry(.075, 8, 6), bs = [];
    for (let i = 0; i < 70; i++) { const a = i * 2.4, r = Math.sqrt(i / 70) * .58; const b = boule.clone(); b.translate(Math.cos(a) * r, .42 + alea() * .06 - r * .05, Math.sin(a) * r); bs.push(b); }
    g.add(new THREE.Mesh(fusion(bs), M.oeufs));
    G.oeufs = g;
  }
  /* rose de saumon fumé */
  {
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 5, r = .1 + t * .5; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const spir = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(spir, 120, .2, 3, false);
    deformer(geo, (v, o) => { v.y = Math.max(0, o.y) * 1.6 + .2 * (1 - Math.hypot(o.x, o.z) / .7); v.y += bruit(o.x * 6, o.y * 6, o.z * 6) * .04; });
    const g = new THREE.Group(); const m = new THREE.Mesh(geo, M.saumon); m.position.y = .05; g.add(m);
    G.saumon = g;
  }
  /* ramequin de tarama */
  const ramequin = (mat) => {
    const g = new THREE.Group();
    const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(.6, 0), new THREE.Vector2(.66, .42), new THREE.Vector2(.6, .44), new THREE.Vector2(.56, .1)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), M.porcelaine));
    g.add(new THREE.Mesh(deformer(new THREE.SphereGeometry(.56, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), (v, o) => { v.y = .34 + v.y * .38 + Math.sin(Math.atan2(o.z, o.x) * 3 + o.y * 9) * .02; }), mat));
    return g;
  };
  G.tarama = ramequin(M.tarama); G.taramaOursin = ramequin(M.taramaOursin); G.taramaBlanc = ramequin(M.taramaBlanc);
  /* coupelle d'anchois marinés */
  {
    const g = ramequin(M.porcelaine).children[0].clone(); const gr = new THREE.Group(); gr.add(g);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(deformer(new THREE.BoxGeometry(1, .04, .14, 8, 1, 1), v => { v.y += Math.sin(v.x * 3 + i) * .03; v.z *= 1 - Math.abs(v.x) * .6; }), M.anchois); f.position.set(0, .36 + i * .03, (i - 2) * .14); f.rotation.y = (i - 2) * .25; gr.add(f); }
    G.anchois = gr;
  }
  /* pile de blinis */
  {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(deformer(new THREE.CylinderGeometry(.45, .45, .12, 24, 1), v => { v.y += bruit(v.x * 4, v.z * 4, i) * .02; }), M.blini); b.position.set(i * .08 - .12, .06 + i * .12, (i % 2) * .05); b.rotation.set(.05 * i, i, 0); g.add(b); }
    G.blinis = g;
  }
  /* citrons : demi-citron et quartier */
  {
    const g = new THREE.Group();
    const peau = new THREE.Mesh(deformer(new THREE.SphereGeometry(.5, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), v => { v.y *= 1.25; v.x *= 1; }), M.zeste);
    peau.rotation.z = Math.PI / 2; g.add(peau);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.5, 32), M.citronFace); face.rotation.y = -Math.PI / 2; face.position.x = -.001; g.add(face);
    const bout = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 6), M.zeste); bout.position.x = .62; g.add(bout);
    g.rotation.z = -.35; g.position.y = .25;
    const w = new THREE.Group(); w.add(g); G.citron = w;
    const q = new THREE.Group();
    const qp = new THREE.Mesh(new THREE.SphereGeometry(.5, 20, 10, 0, Math.PI * .5, 0, Math.PI), M.zeste); qp.scale.set(1, 1, 1.25); q.add(qp);
    const f1 = new THREE.Mesh(new THREE.CircleGeometry(.5, 16, Math.PI / 2, Math.PI), M.citronFace); f1.scale.set(1, 1, 1); q.add(f1);
    q.rotation.set(Math.PI / 2, 0, .3); q.position.y = .05;
    const wq = new THREE.Group(); wq.add(q); G.quartier = wq;
  }
  /* rince-doigts : coupelle de verre, eau et rondelle de citron */
  {
    const g = new THREE.Group();
    const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(.55, 0), new THREE.Vector2(.85, .3), new THREE.Vector2(.92, .62), new THREE.Vector2(.95, .64)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), M.verre));
    const eau = new THREE.Mesh(new THREE.CircleGeometry(.86, 40), M.eau); eau.rotation.x = -Math.PI / 2; eau.position.y = .45; g.add(eau);
    const rond = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .04, 32), [M.zeste, M.citronFace, M.citronFace]); rond.position.set(.15, .47, .05); rond.rotation.x = .05; g.add(rond);
    G.rinceDoigts = g;
  }
  return G;
}
/* fusionne des géométries simples (sans index) en une seule : moins d'appels de dessin, plus fluide sur iPhone */
function fusion(liste) {
  const L = liste.map(g => g.index ? g.toNonIndexed() : g);
  const n = L.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of L) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return r;
}

/* ---------------- du produit du site à ce qu'on pose sur le plateau ---------------- */
/* type de pièce, nombre de pièces par unité vendue, emplacement (0 centre, 1 milieu, 2 bord), place occupée */
const TYPES = [
  [/gillardeau/i, 'huitreGrosse', 6, 2, .95],
  [/utah/i, 'huitre', 6, 2, .9],
  [/hu[iî]tre/i, 'huitreFine', 6, 2, .85],
  [/praire|palourde|clam/i, 'praire', 6, 2, .5],
  [/demi.?homard/i, 'demiHomard', 1, 0, 1.6],
  [/homard|langouste\b/i, 'demiHomard', 2, 0, 1.6],
  [/demi.?tourteau/i, 'demiTourteau', 1, 0, 1.6],
  [/tourteau|crabe/i, 'tourteau', 1, 0, 2.1],
  [/langoustine/i, 'langoustine', 2, 1, .75],
  [/crevettes? grise/i, 'crevetteGrise', 5, 1, .42],
  [/crevette|gambas/i, 'crevette', 6, 1, .6],
  [/bulot|bigorneau/i, 'bulot', 6, 1, .5],
  [/oursin/i, 'oursin', 1, 1, .9],
  [/tarama d.?oursin/i, 'taramaOursin', 1, 2, .7],
  [/tarama de cabillaud/i, 'taramaBlanc', 1, 2, .7],
  [/tarama/i, 'tarama', 1, 2, .7],
  [/caviar/i, 'caviar', 1, 2, .85],
  [/oeufs? de saumon|œufs? de saumon/i, 'oeufs', 1, 2, .75],
  [/saumon/i, 'saumon', 2, 1, .7],
  [/anchois/i, 'anchois', 1, 2, .7],
  [/blini/i, 'blinis', 1, 2, .6],
];
const typeDe = titre => { const t = String(titre || ''); const x = TYPES.find(([re]) => re.test(t)); return x ? { type: x[1], parUnite: x[2], anneau: x[3], place: x[4] } : null; };
/* « tarama d'oursins » doit passer avant « oursin » */
TYPES.splice(TYPES.findIndex(t => t[1] === 'oursin'), 0, ...TYPES.splice(TYPES.findIndex(t => t[1] === 'taramaOursin'), 1));

const EXEMPLE = [['Huîtres Gillardeau', 2], ['Huîtres pleine mer', 1], ['Praires', 1], ['Crevettes roses', 2], ['Langoustines', 3], ['Tourteau', 1], ['Demi-homard', 2], ['Bulots', 1], ['Oursin', 2]];
const MAX_PIECES = 90, TAILLE = 1.35;
for (const t of TYPES) t[4] *= TAILLE;

function piecesDe(liste) {
  const out = []; const vus = {};
  for (const [titre, qte] of liste) {
    const t = typeDe(titre); if (!t) continue;
    for (let i = 0; i < qte * t.parUnite; i++) { vus[t.type] = (vus[t.type] || 0) + 1; out.push({ cle: t.type + '#' + vus[t.type], ...t }); }
  }
  return out.slice(0, MAX_PIECES);
}

/* ---------------- dressage : où poser chaque pièce sur la glace ---------------- */
const R_PLAT = 10.2, R_GLACE = 9.5;
const hGlace = r => .55 + 1.45 * Math.max(0, 1 - (r / R_GLACE) ** 2) ** .8;
function dresser(pieces) {
  /* citrons et rince-doigts : toujours là */
  const deco = [];
  const n = pieces.length;
  const nCitrons = n ? Math.min(8, 4 + Math.floor(n / 14)) : 6;
  for (let i = 0; i < nCitrons; i++) deco.push({ cle: (i % 2 ? 'quartier#' : 'citron#') + i, type: i % 2 ? 'quartier' : 'citron', anneau: 2, place: .6 * TAILLE, deco: true });
  const tout = [...pieces];
  /* groupes du même produit côte à côte ; les citrons s'intercalent entre les groupes du bord */
  const anneaux = [[], [], []];
  for (const p of tout) anneaux[p.anneau].push(p);
  anneaux[0].sort((a, b) => (b.type === 'tourteau') - (a.type === 'tourteau'));
  const bord = anneaux[2], groupes = []; for (const p of bord) { const g = groupes.find(x => x[0].type === p.type); g ? g.push(p) : groupes.push([p]); }
  const bordMix = []; let ci = 0;
  const pasCitron = Math.max(1, Math.round(groupes.length / Math.max(1, deco.length)));
  groupes.forEach((g, i) => { bordMix.push(...g); if ((i + 1) % pasCitron === 0 && ci < deco.length) bordMix.push(deco[ci++]); });
  while (ci < deco.length) bordMix.splice(Math.floor(bordMix.length * (ci / deco.length)), 0, deco[ci++]);
  anneaux[2] = bordMix;
  /* si un anneau déborde, on reporte sur le voisin, puis on réduit un peu la taille de tout */
  const RAYONS = [[0, 3.2], [4.3, 6.3], [7, 8.6]];
  const capa = (k, s) => k === 0 ? Math.PI * 4.8 ** 2 : (RAYONS[k][1] - RAYONS[k][0] + 1.2) * 2 * Math.PI * (RAYONS[k][0] + RAYONS[k][1]) / 2;
  let echelle = 1;
  for (let essai = 0; essai < 7; essai++) {
    const charge = anneaux.map(A => A.reduce((a, p) => a + (p.place * echelle * 2) ** 2 * .8, 0));
    if (charge.every((c, k) => c <= capa(k))) break;
    if (charge[0] > capa(0) && anneaux[0].length > 1) { anneaux[1].push(...anneaux[0].splice(Math.ceil(anneaux[0].length * .6))); continue; }
    if (charge[1] > capa(1)) { const x = anneaux[1].splice(Math.ceil(anneaux[1].length * .7)); anneaux[2].push(...x); }
    echelle *= .9;
  }
  echelle = Math.max(.55, echelle) * TAILLE;
  const poses = [];
  /* centre : grosses pièces, en étoile */
  const C = anneaux[0];
  /* le tourteau trône au milieu, les demi-homards couchés autour, chair vers le haut */
  const auMilieu = C.length && C[0].type === 'tourteau' ? 1 : 0, autour = C.length - auMilieu;
  C.forEach((p, i) => {
    let r = 0, a = 0;
    if (i >= auMilieu && C.length > 1) { const j = i - auMilieu; a = j / autour * Math.PI * 2 + .5; r = auMilieu ? 3.8 : (autour > 1 ? 1.6 + autour * .25 : 0); }
    poses.push({ p, x: Math.cos(a) * r, z: Math.sin(a) * r, rot: p.type === 'demiHomard' ? -a + Math.PI / 2 : -a + Math.PI, s: echelle, lev: p.type === 'demiHomard' ? .6 : .15 });
  });
  /* milieu et bord : en couronne, sur une ou deux rangées */
  for (const k of [1, 2]) {
    const A = anneaux[k]; if (!A.length) continue;
    const [r0, r1] = RAYONS[k];
    const perim = A.reduce((a, p) => a + p.place * 2 * echelle / TAILLE * 1.05, 0);
    const rangs = Math.min(3, Math.max(1, Math.ceil(perim / (2 * Math.PI * ((r0 + r1) / 2)))));
    const par = Math.ceil(A.length / rangs);
    for (let j = 0; j < rangs; j++) {
      const L = A.slice(j * par, (j + 1) * par); if (!L.length) continue;
      const r = rangs === 1 ? (r0 + r1) / 2 : r0 + (r1 - r0) * (j / (rangs - 1));
      const tot = L.reduce((a, p) => a + p.place, 0);
      let acc = j * .37;
      for (const p of L) {
        const a = (acc + p.place / 2) / tot * Math.PI * 2 + k * .3; acc += p.place;
        const radial = p.type === 'langoustine' || p.type === 'crevette' || p.type === 'crevetteGrise' ? -a + Math.PI : p.type.startsWith('huitre') ? -a + Math.PI : -a + alea() * 6;
        poses.push({ p, x: Math.cos(a) * r, z: Math.sin(a) * r, rot: radial, s: echelle });
      }
    }
  }
  /* deux rince-doigts posés sur le bord du plateau */
  poses.push({ p: { cle: 'rince#1', type: 'rinceDoigts', deco: true }, x: Math.cos(.6) * 10.55, z: Math.sin(.6) * 10.55, rot: 0, s: 1.1, table: true });
  poses.push({ p: { cle: 'rince#2', type: 'rinceDoigts', deco: true }, x: Math.cos(.6 + Math.PI) * 10.55, z: Math.sin(.6 + Math.PI) * 10.55, rot: 0, s: 1.1, table: true });
  for (const q of poses) { const r = Math.hypot(q.x, q.z); q.y = q.table ? .32 : hGlace(r) - .12 + (q.p.type.startsWith('huitre') ? .14 : 0) + (q.lev || 0); q.tilt = q.table ? 0 : Math.min(.45, r / R_GLACE * .55); q.ang = Math.atan2(q.z, q.x); }
  return poses;
}

/* ---------------- la scène ---------------- */
function demarrer(el) {
  const zone = el.querySelector('[data-p3-scene]');
  const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch { el.classList.add('p3-sans3d'); return; }
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  zone.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .75;
  const cle = new THREE.DirectionalLight(0xfff4e6, 2.1); cle.position.set(-8, 18, 10); scene.add(cle);
  const contre = new THREE.DirectionalLight(0xdfeaff, 1.1); contre.position.set(10, 8, -12); scene.add(contre);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a30, .5));

  const camera = new THREE.PerspectiveCamera(30, 1, .5, 200);
  const M = matieres(), G = modeles(M);
  const monde = new THREE.Group(); scene.add(monde);
  const plateau = new THREE.Group(); monde.add(plateau);

  /* ombre douce sous le plateau */
  const om = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), M.ombre); om.rotation.x = -Math.PI / 2; om.position.y = -.35; monde.add(om);
  /* grand plateau blanc en porcelaine, large marli */
  {
    const prof = [new THREE.Vector2(0, -.3), new THREE.Vector2(9.6, -.3), new THREE.Vector2(9.9, -.22), new THREE.Vector2(10.0, .1), new THREE.Vector2(10.8, .45), new THREE.Vector2(11.75, .72), new THREE.Vector2(11.9, .7), new THREE.Vector2(11.85, .58), new THREE.Vector2(10.9, .25), new THREE.Vector2(10.1, -.1), new THREE.Vector2(9.7, -.36), new THREE.Vector2(0, -.36)];
    const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), M.porcelaine); plateau.add(m);
    const fil = new THREE.Mesh(new THREE.TorusGeometry(11.82, .035, 6, 160), M.or); fil.rotation.x = Math.PI / 2; fil.position.y = .72; plateau.add(fil);
  }
  /* lit de glace pilée : un dôme et des centaines de petits glaçons */
  {
    const dome = deformer(new THREE.CircleGeometry(R_GLACE + .2, 64, 0, Math.PI * 2), v => { const x = v.x, z = v.y, r = Math.hypot(x, z); v.set(x, hGlace(Math.min(r, R_GLACE)) - .25 + bruit(x * 1.3, z * 1.3, 0) * .08 - (r > R_GLACE ? (r - R_GLACE) * 1.5 : 0), -z); });
    plateau.add(new THREE.Mesh(dome, M.glaceFond));
    const N = matchMedia('(max-width: 700px)').matches ? 900 : 1500;
    const ico = new THREE.IcosahedronGeometry(.24, 0);
    const inst = new THREE.InstancedMesh(ico, M.glace, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const r = Math.sqrt(alea()) * (R_GLACE + .1), a = alea() * Math.PI * 2;
      p.set(Math.cos(a) * r, hGlace(Math.min(r, R_GLACE)) - .3 + alea() * .1, Math.sin(a) * r);
      e.set(alea() * 6, alea() * 6, alea() * 6); q.setFromEuler(e);
      const k = .5 + alea() * .9; s.set(k * (.8 + alea() * .5), k * (.6 + alea() * .5), k * (.8 + alea() * .5));
      inst.setMatrixAt(i, m4.compose(p, q, s));
    }
    plateau.add(inst);
    /* algues et salicornes qui dépassent de la glace, comme chez l'écailler */
    const brins = [];
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + alea() * .2, r = 8.6 + alea() * .9;
      const p0 = new THREE.Vector3(Math.cos(a) * r, hGlace(r) - .1, Math.sin(a) * r);
      const out = new THREE.Vector3(Math.cos(a + .3), 0, Math.sin(a + .3));
      const c = new THREE.CatmullRomCurve3([p0, p0.clone().addScaledVector(out, .7).setY(p0.y + .25), p0.clone().addScaledVector(out, 1.5).setY(p0.y + .05)]);
      brins.push(tubeVar(c, 10, 4, t => .07 * (1 - t * .6)).toNonIndexed());
    }
    plateau.add(new THREE.Mesh(fusion(brins), M.salicorne));
    const algues = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + .4, r = 9.1;
      const p0 = new THREE.Vector3(Math.cos(a) * r, hGlace(r) - .05, Math.sin(a) * r), t = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const c = new THREE.CatmullRomCurve3([p0.clone().addScaledVector(t, -1.2), p0.clone().addScaledVector(t, -.4).setY(p0.y + .12), p0.clone().addScaledVector(t, .5).setY(p0.y + .02), p0.clone().addScaledVector(t, 1.3).setY(p0.y + .1)]);
      algues.push(tubeVar(c, 20, 5, t2 => .22 * Math.sin(Math.PI * (.1 + t2 * .8)), .18).toNonIndexed());
    }
    plateau.add(new THREE.Mesh(fusion(algues), M.algue));
  }

  /* les pièces posées (dictionnaire clé → objet), animées quand elles arrivent ou repartent */
  const poseesObj = new Map();
  const pieces = new THREE.Group(); plateau.add(pieces);
  function appliquer(liste, instant) {
    graine = 11;
    const poses = dresser(piecesDe(liste));
    const vues = new Set();
    poses.forEach((q, i) => {
      vues.add(q.p.cle);
      let o = poseesObj.get(q.p.cle);
      if (!o) {
        const m = G[q.p.type]; if (!m) return;
        const g = new THREE.Group(); const inner = m.clone(); g.add(inner);
        pieces.add(g);
        o = { g, cur: null, arrivee: instant ? 1 : -i * .025 };
        poseesObj.set(q.p.cle, o);
      }
      o.cible = q; o.depart = false;
      if (!o.cur) o.cur = { x: q.x, y: q.y, z: q.z, rot: q.rot, s: q.s };
    });
    for (const [k, o] of poseesObj) if (!vues.has(k)) { o.depart = true; o.sortie = 0; }
  }
  function placer(o, dt) {
    const q = o.cible, c = o.cur, k = Math.min(1, dt * 5);
    c.x += (q.x - c.x) * k; c.y += (q.y - c.y) * k; c.z += (q.z - c.z) * k; c.s += (q.s - c.s) * k;
    let dr = q.rot - c.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); c.rot += dr * k;
    let y = c.y, s = c.s;
    if (o.arrivee < 1) { o.arrivee = Math.min(1, o.arrivee + dt * 1.6); const t = Math.max(0, o.arrivee); const b = t < 1 ? Math.abs(Math.cos(t * Math.PI * 1.5)) * (1 - t) ** 2 : 0; y += b * 6; s *= Math.min(1, t * 3); }
    if (o.depart) { o.sortie += dt * 2.5; y += o.sortie ** 2 * 5; s *= Math.max(0, 1 - o.sortie); }
    o.g.position.set(c.x, y, c.z);
    o.g.rotation.set(0, 0, 0);
    o.g.rotateY(-q.ang);
    o.g.rotateZ(q.tilt * (q.table ? 0 : 1) * -1);
    o.g.rotateY(q.ang + c.rot);
    o.g.scale.setScalar(Math.max(.0001, s));
    o.g.visible = s > .001;
  }

  /* papier glacé : il monte autour du plateau et se ferme en paquet cadeau, noué d'un ruban doré */
  const emb = new THREE.Group(); monde.add(emb);
  const NU = 120, NV = 46;
  const papGeo = new THREE.PlaneGeometry(1, 1, NU, NV);
  const papier = new THREE.Mesh(papGeo, M.cellophane); papier.renderOrder = 3; emb.add(papier);
  const ruban = new THREE.Group(); emb.add(ruban);
  {
    const noeud = new THREE.Mesh(new THREE.TorusGeometry(.8, .22, 10, 40), M.or); noeud.rotation.x = Math.PI / 2; noeud.scale.set(1, 1, .7); ruban.add(noeud);
    for (const s of [-1, 1]) for (const d of [-1, 1]) {
      /* deux boucles de chaque côté : un vrai nœud de ruban plat */
      const ang = d * .55, P2 = (x, y, z) => new THREE.Vector3(s * (x * Math.cos(ang)), y, x * Math.sin(ang) * s + z);
      const boucle = new THREE.CatmullRomCurve3([P2(.2, 0, 0), P2(1.2, .9, .35), P2(2.4, .9, .2), P2(2.6, .2, 0), P2(1.6, -.15, -.2), P2(.2, 0, 0)], true);
      ruban.add(new THREE.Mesh(tubeVar(boucle, 60, 6, () => .38, .14), M.or));
    }
    for (const s of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * .9, -1.4, .3), new THREE.Vector3(s * 1.4, -3, -.2), new THREE.Vector3(s * 1.7, -4.4, .2)]);
      ruban.add(new THREE.Mesh(tubeVar(c, 30, 6, () => .42, .12), M.or));
    }
  }
  const HAUT = 13.5;
  function formePapier(p) {
    /* p = 0 : simple collerette autour du plateau ; p = 1 : paquet fermé, froncé au sommet, avec sa gerbe */
    const pos = papGeo.attributes.position;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, a = u * Math.PI * 2;
        const pli = Math.sin(a * 22 + v * 3) * .18 + bruit(Math.cos(a) * 4, Math.sin(a) * 4, v * 6) * .35;
        let r, y;
        if (v < .72) { const s = v / .72; r = 12.2 + Math.sin(s * Math.PI * .9) * 1.6 - s ** 2.4 * 11.6; y = .4 + s * (HAUT - 1.4); }
        else { const s = (v - .72) / .28; r = .6 + s * 3.6 * (.75 + .25 * Math.sin(a * 7)); y = HAUT - 1 + s * 2.8 - s * s * 1.1; }
        /* ouvert : collerette froncée autour du plateau ; le papier monte avec un léger décalage du bas vers le haut */
        const k = Math.max(0, Math.min(1, p * 1.35 - v * .35)), e = k * k * (3 - 2 * k);
        r = (12.2 + v * 1.4) * (1 - e) + r * e; y = (.4 + v * 1.4) * (1 - e) + y * e;
        r += pli * (.4 + .6 * Math.min(1, v * 2));
        pos.setXYZ(j * (NU + 1) + i, Math.cos(a) * r, y, Math.sin(a) * r);
      }
    }
    pos.needsUpdate = true; papGeo.computeVertexNormals();
    ruban.position.y = HAUT - 1 + .2; ruban.scale.setScalar(Math.max(.001, (p - .75) * 4)); ruban.visible = p > .76;
  }
  let emballe = 0, emballeCible = 0;
  formePapier(0); emb.visible = false;

  /* caméra : vue plongeante, tout le plateau toujours dans le cadre, aucun zoom */
  function cadrer() {
    const w = zone.clientWidth, h = zone.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vfov = camera.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const el2 = .9 - emballe * .25;
    const larg = 12.4 + emballe * 1.4, haut = (12.4 * Math.sin(el2) + (2 + emballe * 13) * Math.cos(el2)) * .85 + 1.5;
    const d = Math.max(larg / Math.tan(hfov / 2), haut / Math.tan(vfov / 2)) + 4;
    camera.position.set(0, Math.sin(el2) * d + 1, Math.cos(el2) * d);
    camera.lookAt(0, .8 + emballe * 4.5, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(cadrer).observe(zone);

  /* rotation lente permanente ; glisser du doigt à gauche ou à droite pour la faire tourner (le défilement vertical reste libre) */
  let angle = .4, vit = .16, glisse = null;
  const cv = renderer.domElement;
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('pointerdown', e => { glisse = { x: e.clientX, a: angle, t: performance.now(), v: 0 }; cv.setPointerCapture?.(e.pointerId); el.classList.add('p3-tient'); });
  cv.addEventListener('pointermove', e => { if (!glisse) return; const now = performance.now(); const na = glisse.a + (e.clientX - glisse.x) / zone.clientWidth * Math.PI * 1.6; glisse.v = (na - angle) / Math.max(.008, (now - glisse.t) / 1000); glisse.t = now; angle = na; });
  const lacher = () => { if (!glisse) return; vit = Math.max(-4, Math.min(4, glisse.v || 0)); glisse = null; el.classList.remove('p3-tient'); };
  cv.addEventListener('pointerup', lacher); cv.addEventListener('pointercancel', lacher);

  let visible = true, dernier = performance.now(), boucle = 0;
  const frame = () => {
    boucle = 0;
    const now = performance.now(), dt = Math.min(.05, (now - dernier) / 1000); dernier = now;
    if (!glisse) { vit += ((reduit ? .05 : .16) - vit) * Math.min(1, dt * 1.2); angle += vit * dt; }
    monde.rotation.y = angle;
    for (const [k, o] of poseesObj) { placer(o, dt); if (o.depart && o.sortie >= 1) { pieces.remove(o.g); poseesObj.delete(k); } }
    if (Math.abs(emballe - emballeCible) > .001) {
      emballe += (emballeCible - emballe) * Math.min(1, dt * 2.2); if (Math.abs(emballe - emballeCible) < .002) emballe = emballeCible;
      emb.visible = emballe > .002; formePapier(emballe); cadrer();
    }
    renderer.render(scene, camera);
    if (visible && !document.hidden) boucle = requestAnimationFrame(frame);
  };
  const relancer = () => { if (!boucle && visible && !document.hidden) { dernier = performance.now(); boucle = requestAnimationFrame(frame); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; relancer(); }, { rootMargin: '120px' }).observe(zone);
  document.addEventListener('visibilitychange', relancer);

  /* ---------------- la composition : sélection du client ---------------- */
  const PRODUITS = JSON.parse(el.querySelector('[data-p3-produits]')?.textContent || '[]');
  const parSlug = new Map(PRODUITS.map(p => [p.slug, p]));
  const lire = () => { try { return JSON.parse(localStorage.getItem('mg_sel') || '[]'); } catch { return []; } };
  const ecrire = l => { try { localStorage.setItem('mg_sel', JSON.stringify(l)); } catch { /* navigation privée */ } document.querySelectorAll('[data-sel-count]').forEach(b => { b.textContent = l.length; b.hidden = !l.length; }); };
  const euros = c => (Math.round(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ') + ' €';
  const lignes = () => lire().filter(l => parSlug.has(l.slug) && !l.variante);
  const qteDe = slug => lignes().filter(l => l.slug === slug).reduce((a, l) => a + (+l.qte || 0), 0);

  const legende = el.querySelector('[data-p3-legende]'), total = el.querySelector('[data-p3-total]'), pied = el.querySelector('[data-p3-pied]');
  function majTout(instant) {
    const L = lignes();
    const perso = L.length > 0;
    const liste = perso ? L.map(l => [parSlug.get(l.slug).titre, +l.qte || 0]) : EXEMPLE;
    appliquer(liste, instant);
    const nb = piecesDe(liste).length;
    if (legende) legende.innerHTML = perso ? `<b>Votre plateau</b> · ${nb} pièce${nb > 1 ? 's' : ''} dressée${nb > 1 ? 's' : ''} sur la glace` : '<b>Exemple de plateau</b> · ajoutez vos produits, il se compose sous vos yeux';
    const tot = L.reduce((a, l) => a + (parSlug.get(l.slug).prixCents || 0) * (+l.qte || 0), 0);
    if (total) total.textContent = perso ? euros(tot) + ' TTC' : '';
    if (pied) pied.hidden = !perso;
    el.querySelectorAll('[data-p3-ligne]').forEach(li => { const q = qteDe(li.dataset.p3Ligne); li.querySelector('[data-p3-q]').textContent = q; li.classList.toggle('on', q > 0); li.querySelector('[data-p3-moins]').disabled = !q; });
  }
  function changer(slug, d) {
    const P = parSlug.get(slug); if (!P) return;
    const l = lire();
    const i = l.findIndex(x => x.slug === slug && !x.variante);
    const min = P.min || 1;
    if (i < 0) { if (d > 0) l.push({ slug: P.slug, titre: P.titre, photo: P.photo, rubrique: P.rubrique, unite: P.unite, min, prixCents: P.prixCents, qte: min, variante: '', choix: {}, supCents: 0, resume: 'Dressé sur notre grand plateau de fruits de mer', note: '', personnel: null, pack: null, lieu: false, key: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }); }
    else { const n = (+l[i].qte || 0) + d; if (n < min) l.splice(i, 1); else l[i].qte = n; }
    ecrire(l); majTout(false);
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-p3-plus],[data-p3-moins]');
    if (b) { const li = b.closest('[data-p3-ligne]'); changer(li.dataset.p3Ligne, b.hasAttribute('data-p3-plus') ? 1 : -1); return; }
    const w = e.target.closest('[data-p3-emballer]');
    if (w) { emballeCible = emballeCible ? 0 : 1; w.setAttribute('aria-pressed', String(!!emballeCible)); w.querySelector('span').textContent = emballeCible ? 'Déballer le plateau' : 'Voir l’emballage cadeau'; relancer(); }
  });
  addEventListener('storage', e => { if (e.key === 'mg_sel') majTout(false); });
  addEventListener('pageshow', () => majTout(true));
  majTout(true);
  cadrer();
  el.classList.add('p3-pret');
  relancer();
}

const racine = document.querySelector('[data-p3]');
if (racine) demarrer(racine);
