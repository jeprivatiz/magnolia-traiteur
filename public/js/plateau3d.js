/* Plateau de fruits de mer en 3D (Jean-Luc, 2026-11-23).
   Plateau, glace, rince-doigts et papier glacé en 3D (three.js, licence MIT, public/vendor/three) ;
   produits et lit d'algues = vraies photos détourées (public/site/plateau, voir SOURCES.md).
   Dressé comme chez le poissonnier : tout à plat sur les algues, en couronnes vers l'intérieur, sans rien superposer ;
   le plateau est petit au départ et grandit avec les produits choisis.
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
    ombre: new THREE.MeshBasicMaterial({ map: texture(128, 128, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, w * .2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(20,30,40,.32)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }), transparent: true, depthWrite: false }),
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

/* ---------------- les produits : vraies photos détourées (Jean-Luc, 2026-11-23 : « des vraies photos, pas de l'IA ») ----------------
   Photos des fiches produits du site (public/site/c/seafood30), détourées et rangées dans public/site/plateau.
   « plat » : photo prise du dessus, posée à plat sur la glace ; « debout » : photo de trois-quarts, tournée vers le regard. */
const PHOTOS = {
  'huitre-g1': 2.1, 'huitre-g2': 2.3, 'huitre-g3': 2.2, 'huitre-p1': 2.1, 'huitre-p2': 1.7, 'huitre-p3': 2.4, 'huitre-u3': 2.5,
  praires: 3.4, bulots: 3.4, 'crevettes-grises': 3, 'crevettes-roses': 3.6, langoustines: 4.6, homard: 3, 'demi-homards': 4.2,
  tourteau: 5.6, 'demi-tourteau': 3.8, oursin: 2.2, caviar: 2.4, 'oeufs-saumon': 2.4, tarama: 2.1, 'tarama-cabillaud': 2.3, 'tarama-oursins': 2.4,
  'saumon-fume': 3.4, anchois: 2.8, blinis: 2.5, citron: 1.35,
};
async function modeles(M) {
  const G = {}, chargeur = new THREE.TextureLoader();
  const ombreGeo = new THREE.PlaneGeometry(1, 1); ombreGeo.rotateX(-Math.PI / 2);
  await Promise.all(Object.entries(PHOTOS).map(([nom, larg]) => chargeur.loadAsync(`/site/plateau/${nom}.webp`).then(t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: .15, side: THREE.DoubleSide, toneMapped: false });
    larg *= 1.35; const h = larg * t.image.height / t.image.width;
    const geo = new THREE.PlaneGeometry(larg, h); geo.rotateX(-Math.PI / 2);
    const g = new THREE.Group(); g.userData.dims = { w: larg, h };
    const om = new THREE.Mesh(ombreGeo, M.ombre); om.position.y = .01; om.scale.set(larg * .9, 1, h * .9); om.renderOrder = 1;
    const plan = new THREE.Mesh(geo, mat); plan.position.y = .03; plan.renderOrder = 2;
    g.add(om, plan);
    G[nom] = g;
  }).catch(() => {})));
  /* rince-doigts : coupelle de verre, eau et rondelle de citron (objet de service, pas un produit) */
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
  [/gillardeau/i, ['huitre-g1', 'huitre-g2', 'huitre-g3'], 6, 2],
  [/utah/i, ['huitre-u3'], 6, 2],
  [/hu[iî]tre/i, ['huitre-p1', 'huitre-p3', 'huitre-p2'], 6, 2],
  [/praire|palourde|clam/i, 'praires', 1, 2],
  [/demi.?homard/i, 'demi-homards', 1, 0],
  [/homard|langouste\b/i, 'homard', 1, 0],
  [/demi.?tourteau/i, 'demi-tourteau', 1, 0],
  [/tourteau|crabe/i, 'tourteau', 1, 0],
  [/langoustine/i, 'langoustines', 1, 1],
  [/crevettes? grise/i, 'crevettes-grises', 1, 1],
  [/crevette|gambas/i, 'crevettes-roses', 1, 1],
  [/bulot|bigorneau/i, 'bulots', 1, 1],
  [/tarama d.?oursin/i, 'tarama-oursins', 1, 0],
  [/oursin/i, 'oursin', 1, 1],
  [/tarama de cabillaud/i, 'tarama-cabillaud', 1, 0],
  [/tarama/i, 'tarama', 1, 0],
  [/caviar/i, 'caviar', 1, 0],
  [/oeufs? de saumon|œufs? de saumon/i, 'oeufs-saumon', 1, 0],
  [/saumon/i, 'saumon-fume', 1, 1],
  [/anchois/i, 'anchois', 1, 1],
  [/blini/i, 'blinis', 1, 1],
];
const typeDe = titre => { const t = String(titre || ''); const x = TYPES.find(([re]) => re.test(t)); return x ? { type: x[1], parUnite: x[2], anneau: x[3] } : null; };

const EXEMPLE = [['Huîtres Gillardeau', 1], ['Huîtres pleine mer', 1], ['Praires', 1], ['Crevettes roses', 1], ['Langoustines', 2], ['Tourteau', 1], ['Demi-homard', 1], ['Bulots', 1], ['Oursin', 1], ['Crevettes grises', 1]];
const MAX_PIECES = 72;

function piecesDe(liste) {
  const out = []; const vus = {};
  for (const [titre, qte] of liste) {
    const t = typeDe(titre); if (!t) continue;
    for (let i = 0; i < qte * t.parUnite; i++) { const k = String(t.type); vus[k] = (vus[k] || 0) + 1; const photo = Array.isArray(t.type) ? t.type[(vus[k] - 1) % t.type.length] : t.type; out.push({ ...t, src: k, cle: k + '#' + vus[k], type: photo }); }
  }
  return out.slice(0, MAX_PIECES);
}

/* ---------------- dressage : comme chez le poissonnier ---------------- */
const R_GLACE = 9.5, R_UTILE = 8.9;
const hGlace = r => .55 + 1.1 * Math.max(0, 1 - (r / R_GLACE) ** 2) ** .8;
/* les grosses pièces et les coupelles au centre, puis des couronnes serrées vers l'extérieur
   (crevettes, langoustines, bulots…, puis huîtres et coquillages, pointe vers le centre), citrons entre les produits.
   Chaque couronne est calculée pour que rien ne se chevauche. Renvoie aussi la taille de plateau nécessaire. */
function dresser(pieces, G) {
  const dims = p => G[p.type]?.userData.dims || { w: 1, h: 1 };
  const n = pieces.length;
  const nCitrons = n ? Math.min(10, 2 + Math.floor(n / 3)) : 0;
  const citrons = Array.from({ length: nCitrons }, (_, i) => ({ cle: 'citron#' + i, type: 'citron', anneau: 2, deco: true }));
  const parAnneau = [0, 1, 2].map(k => pieces.filter(p => p.anneau === k));
  /* citrons glissés entre les groupes de la couronne extérieure (ou du milieu s'il n'y a rien au bord) */
  const kc = parAnneau[2].length ? 2 : 1, ext = parAnneau[kc];
  /* un citron toutes les quelques pièces, régulièrement tout autour */
  const mix = [], pas = Math.max(1, ext.length / Math.max(1, citrons.length));
  let prochain = pas / 2, ci = 0;
  ext.forEach((p, i) => { mix.push(p); if (i + 1 >= prochain && ci < citrons.length) { mix.push(citrons[ci++]); prochain += pas; } });
  while (ci < citrons.length) mix.push(citrons[ci++]);
  parAnneau[kc] = mix;
  const poses = [];
  /* centre */
  /* rien au centre : un citron au milieu, comme chez le poissonnier */
  if (!parAnneau[0].length && citrons.length) { const c0 = citrons.pop(); parAnneau[0].push(c0); const i0 = parAnneau[kc].indexOf(c0); if (i0 >= 0) parAnneau[kc].splice(i0, 1); }
  const C = parAnneau[0].slice().sort((a, b) => dims(b).w * dims(b).h - dims(a).w * dims(a).h);
  let R = 0;
  if (C.length === 1) { const d = dims(C[0]); poses.push({ p: C[0], r: 0, a: 0, rot: 0 }); R = Math.max(d.w, d.h) / 2; }
  else if (C.length > 1) {
    /* la plus grosse au milieu, les autres tout autour */
    const d0 = dims(C[0]); poses.push({ p: C[0], r: 0, a: 0, rot: 0 }); const r0 = Math.max(d0.w, d0.h) / 2;
    const autour = C.slice(1), prof = Math.max(...autour.map(p => dims(p).h)), larg = autour.reduce((s2, p) => s2 + dims(p).w + .15, 0);
    const r = Math.max(r0 + prof / 2 + .1, larg / (2 * Math.PI));
    let acc = 0; autour.forEach(p => { const w = dims(p).w + .15; const a = (acc + w / 2) / Math.max(larg, 2 * Math.PI * r) * Math.PI * 2; acc += w; poses.push({ p, r, a, rot: 0 }); });
    R = r + prof / 2;
  }
  /* les pièces maîtresses du centre sont servies un peu plus grosses */
  if (C.length && !C[0].deco) { const gc = 1.25; poses.forEach(q => { q.r *= gc; q.g = gc; }); R *= gc; }
  /* couronnes : crustacés et coquillages au milieu, huîtres au bord ; les pièces d'une couronne sont réparties tout autour */
  for (const k of [1, 2]) {
    let reste = parAnneau[k].slice();
    while (reste.length) {
      const echant = reste.slice(0, 12).map(p => dims(p).h), prof = Math.max(echant.reduce((a, b) => a + b, 0) / echant.length * 1.05, Math.max(...echant) * .75);
      const rmin = R + (R ? .12 : 0) + prof / 2;
      const tout2 = reste.reduce((t2, p) => t2 + dims(p).w * .92, 0);
      /* tout ce qui reste tient sur une couronne : on la serre au plus près ; sinon on remplit celle-ci */
      /* une seule couronne un peu plus large vaut mieux que plusieurs petites qui se chevauchent */
      const rUne = Math.max(rmin, tout2 / (2 * Math.PI));
      const r = rUne <= rmin + prof * 2.5 ? rUne : rmin;
      const perim = 2 * Math.PI * r;
      const rang = []; let larg = 0;
      for (const p of reste) { const w = dims(p).w * .92; if (larg + w > perim + .01 && rang.length) break; rang.push(p); larg += w; }
      reste = reste.slice(rang.length);
      /* si la couronne n'est pas pleine, les pièces restent serrées par groupe et les vides sont répartis */
      /* couronne clairsemée : les pièces sont servies plus grosses pour couvrir les algues */
      const g = Math.min(1.55, Math.max(1, perim / Math.max(larg, .01) * .8));
      const rg = r + prof * (g - 1) / 2, perimG = 2 * Math.PI * rg;
      const vide = Math.max(0, perimG - larg * g) / rang.length;
      let acc = 0;
      rang.forEach(p => { const w = dims(p).w * .92 * g + vide; const a = (acc + w / 2) / perimG * Math.PI * 2 + k * .4; acc += w; poses.push({ p, r: rg, a, rot: 0, g }); });
      R = rg + prof * g / 2;
    }
  }
  /* taille du plateau : juste ce qu'il faut ; au-delà du grand plateau, on resserre un peu les pièces */
  const besoin = R + .5;
  const taille = Math.max(.42, Math.min(1, besoin / R_UTILE));
  const echelle = besoin > R_UTILE ? R_UTILE / besoin : 1;
  for (const q of poses) {
    q.r *= echelle; q.s = echelle * (q.g || 1);
    q.x = Math.cos(q.a) * q.r; q.z = Math.sin(q.a) * q.r;
    /* pointe vers le centre : le haut de la photo regarde vers l'extérieur */
    q.rot = q.r ? -q.a + Math.PI / 2 : 0;
  }
  poses.forEach(q => { const rr = q.r / taille; q.y = (hGlace(rr) + .08) * taille; q.tilt = Math.atan(Math.max(0, -(hGlace(rr + .2) - hGlace(rr)) / .2)) * .9; q.ang = q.a; });
  /* deux rince-doigts posés sur le bord du plateau */
  const rb = 10.55 * taille;
  poses.push({ p: { cle: 'rince#1', type: 'rinceDoigts', deco: true }, x: Math.cos(.6) * rb, z: Math.sin(.6) * rb, rot: 0, s: Math.max(.7, taille) * 1.1, y: .32 * taille, tilt: 0, ang: .6 });
  poses.push({ p: { cle: 'rince#2', type: 'rinceDoigts', deco: true }, x: Math.cos(.6 + Math.PI) * rb, z: Math.sin(.6 + Math.PI) * rb, rot: 0, s: Math.max(.7, taille) * 1.1, y: .32 * taille, tilt: 0, ang: .6 + Math.PI });
  return { poses, taille, rayon: Math.min(R_UTILE, besoin) };
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
  const M = matieres(); let G = {};
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
      p.set(Math.cos(a) * r, hGlace(Math.min(r, R_GLACE)) - .42 + alea() * .08, Math.sin(a) * r);
      e.set(alea() * 6, alea() * 6, alea() * 6); q.setFromEuler(e);
      const k = .5 + alea() * .9; s.set(k * (.8 + alea() * .5), k * (.6 + alea() * .5), k * (.8 + alea() * .5));
      inst.setMatrixAt(i, m4.compose(p, q, s));
    }
    plateau.add(inst);
  }

  /* les pièces posées (dictionnaire clé → objet), animées quand elles arrivent ou repartent */
  const poseesObj = new Map();
  const pieces = new THREE.Group(); monde.add(pieces);
  /* lit d'algues (vraie photo) posé sur la glace, sous les produits ; sa taille suit celle des produits */
  const lit = new THREE.Group(); monde.add(lit);
  new THREE.TextureLoader().load('/site/plateau/lit-algues.webp', t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const geo = new THREE.RingGeometry(.001, 1, 72, 14); geo.rotateX(-Math.PI / 2); geo.userData.base = geo.attributes.position.array.slice();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: .2, toneMapped: false, side: THREE.DoubleSide }));
    m.renderOrder = 0; lit.add(m);
  });
  let taille = 1, tailleCible = 1, litR = 1, litRCible = 1;
  function appliquer(liste, instant) {
    graine = 11;
    const res = dresser(piecesDe(liste), G), poses = res.poses;
    tailleCible = res.taille; litRCible = Math.min(res.rayon + .7, (R_GLACE - .2) * res.taille);
    if (instant) { taille = tailleCible; litR = litRCible; }
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
    if (o.arrivee < 1) { o.arrivee = Math.min(1, o.arrivee + dt * 2.2); const t = Math.max(0, o.arrivee); y += (1 - t) ** 2 * 3; s *= Math.min(1, t * 2.5); }
    if (o.depart) { o.sortie += dt * 2.5; y += o.sortie ** 2 * 5; s *= Math.max(0, 1 - o.sortie); }
    o.g.position.set(c.x, y, c.z);
    o.g.rotation.set(0, 0, 0);
    o.g.rotateY(-q.ang);
    o.g.rotateZ(-(q.tilt || 0));
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
    const el2 = 1.02 - emballe * .3;
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
    if (Math.abs(taille - tailleCible) > .001 || Math.abs(litR - litRCible) > .001) {
      const k = Math.min(1, dt * 3); taille += (tailleCible - taille) * k; litR += (litRCible - litR) * k;
    }
    plateau.scale.setScalar(taille); emb.scale.setScalar(taille); om.scale.setScalar(.45 + .55 * taille);
    /* le lit d'algues épouse le dôme de glace */
    const litM = lit.children[0];
    if (litM && (litM.userData.t !== taille || litM.userData.r !== litR)) {
      litM.userData.t = taille; litM.userData.r = litR;
      const pa = litM.geometry.attributes.position, b0 = litM.geometry.userData.base;
      for (let i = 0; i < pa.count; i++) { const x = b0[i * 3] * litR, z = b0[i * 3 + 2] * litR; pa.setXYZ(i, x, (hGlace(Math.hypot(x, z) / taille) + .05) * taille, z); }
      pa.needsUpdate = true; litM.geometry.computeBoundingSphere();
    }
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
    if (legende) legende.innerHTML = perso ? `<b>Votre plateau</b> · ${nb} pièce${nb > 1 ? 's' : ''} dressée${nb > 1 ? 's' : ''} sur le plateau` : '<b>Exemple de plateau</b> · ajoutez vos produits, il se compose sous vos yeux';
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
  cadrer();
  relancer();
  modeles(M).then(g => { G = g; majTout(true); el.classList.add('p3-pret'); relancer(); });
}

const racine = document.querySelector('[data-p3]');
if (racine) demarrer(racine);
