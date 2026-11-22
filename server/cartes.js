/* Vignettes « carte du monde » des spécialités : fond commun (public/cartes/monde.svg) + pays en doré.
   Données générées une fois depuis world-atlas (Natural Earth, domaine public) : server/cartes.json. */
const { W, H, pays, points } = require('./cartes.json');

const AFRIQUE = '012,024,204,072,854,108,120,140,148,178,180,262,818,226,232,231,266,270,288,324,624,384,404,426,430,434,450,454,466,478,504,508,516,562,566,646,686,694,706,710,728,729,748,834,768,788,800,894,716,732'.split(',');
/* lieux proposés dans le back-office (liste « Pays sur la carte ») */
const LIEUX = [
  ['espagne', 'Espagne', ['724']], ['portugal', 'Portugal', ['620']], ['italie', 'Italie', ['380']], ['grece', 'Grèce', ['300']], ['france', 'France', ['250']],
  ['liban', 'Liban', ['422']], ['turquie', 'Turquie', ['792']], ['maghreb', 'Maghreb (Maroc, Algérie, Tunisie)', ['504', '012', '788']], ['maroc', 'Maroc', ['504']], ['algerie', 'Algérie', ['012']], ['tunisie', 'Tunisie', ['788']],
  ['afrique', 'Afrique (tout le continent)', AFRIQUE], ['senegal', 'Sénégal', ['686']], ['cote-d-ivoire', 'Côte d’Ivoire', ['384']], ['cameroun', 'Cameroun', ['120']], ['congo', 'Congo', ['178', '180']],
  ['antilles', 'Antilles', ['192', '332', '214', '388', '630'], 'antilles'], ['reunion', 'La Réunion', [], 'reunion'], ['polynesie', 'Polynésie', [], 'polynesie'],
  ['mexique', 'Mexique', ['484']], ['bresil', 'Brésil', ['076']], ['perou', 'Pérou', ['604']], ['argentine', 'Argentine', ['032']], ['etats-unis', 'États-Unis', ['840']],
  ['inde', 'Inde', ['356']], ['chine', 'Chine', ['156']], ['japon', 'Japon', ['392']], ['coree', 'Corée', ['410']], ['vietnam', 'Vietnam', ['704']], ['thailande', 'Thaïlande', ['764']],
];
const sansAccent = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
/* lieu d'une spécialité : choisi dans le back-office, sinon deviné d'après « Pays ou région » */
function lieuDe(x) {
  const k = x.carte || sansAccent(x.pays);
  return LIEUX.find(l => l[0] === k) || LIEUX.find(l => k && sansAccent(l[1]).startsWith(k));
}
function carteSvg(x) {
  const l = lieuDe(x);
  if (!l) return `<svg class="carte" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="/cartes/monde.svg" width="${W}" height="${H}"/></svg>`;
  const sel = l[2].map(id => pays[id]).filter(Boolean);
  let c = l[3] ? points[l[3]] : null;
  if (!c && sel.length) { // centre : moyenne pondérée grossière des centres
    const big = sel.filter(p => !p.petit); const L = big.length ? big : sel;
    c = [L.reduce((s, p) => s + p.c[0], 0) / L.length, L.reduce((s, p) => s + p.c[1], 0) / L.length];
  }
  const petit = l[3] || sel.every(p => p.petit) || ['espagne', 'portugal', 'italie', 'grece', 'liban', 'japon', 'coree', 'tunisie', 'senegal'].includes(l[0]);
  return `<svg class="carte" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="/cartes/monde.svg" width="${W}" height="${H}"/>`
    + (sel.length ? `<path d="${sel.map(p => p.d).join('')}" fill="#c9a56b" stroke="#e3c58f" stroke-width=".5"/>` : '')
    + (c ? `${petit ? `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="13" fill="none" stroke="#c9a56b" stroke-width="1.4"/><circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="22" fill="none" stroke="#c9a56b" stroke-width=".7" opacity=".5"/>` : ''}<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="2.6" fill="#fff"/>` : '')
    + '</svg>';
}
module.exports = { LIEUX, lieuDe, carteSvg };
