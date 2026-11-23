'use strict';
/* Pictogrammes des univers (vignettes de l'accueil) : dessins maison au trait fin, sur une grille de 48 × 48.
 * Couleur = currentColor (or sur le site). Choix par rubrique dans le back-office (champ « picto »),
 * sinon pictogramme par défaut d'après l'adresse de la rubrique. */

const P = {
  cocktail: ['Coupes de champagne', `
    <g transform="translate(20.5 9) rotate(15)"><path d="M-4.2 0C-4.2 9-2.6 14 0 15.2C2.6 14 4.2 9 4.2 0Z"/><path d="M-3.8 4.5H3.8"/><path d="M0 15.2V26"/><path d="M-4.2 26H4.2"/></g>
    <g transform="translate(27.5 9) rotate(-15)"><path d="M-4.2 0C-4.2 9-2.6 14 0 15.2C2.6 14 4.2 9 4.2 0Z"/><path d="M-3.8 4.5H3.8"/><path d="M0 15.2V26"/><path d="M-4.2 26H4.2"/></g>
    <path d="M24 6V2.5M20.2 4.4L18.6 2.4M27.8 4.4L29.4 2.4"/>`],
  carte: ['Menu à la fleur de magnolia', `
    <rect x="12.5" y="5.5" width="23" height="37" rx="2"/>
    <path d="M24 10.5C21.2 13.4 21.2 17.6 24 21C26.8 17.6 26.8 13.4 24 10.5Z"/>
    <path d="M24 21C20.2 20.6 17.4 17.6 17.8 13.6C20.4 14.4 22.6 17.2 24 21ZM24 21C27.8 20.6 30.6 17.6 30.2 13.6C27.6 14.4 25.4 17.2 24 21Z"/>
    <path d="M24 21V23.5"/><path d="M18 28H30M19.5 32H28.5M18 36H30"/>`],
  globe: ['Globe', `
    <circle cx="24" cy="24" r="15"/><ellipse cx="24" cy="24" rx="6.5" ry="15"/>
    <path d="M9 24H39M11 16.5H37M11 31.5H37"/>`],
  coquille: ['Coquille Saint-Jacques', `
    <path d="M24 37.5L11.2 27C8 16.5 14.8 8 24 8C33.2 8 40 16.5 36.8 27Z"/>
    <path d="M24 37.5L13.6 13.4M24 37.5L18.6 9.5M24 37.5V8M24 37.5L29.4 9.5M24 37.5L34.4 13.4"/>
    <path d="M20.2 34.4L18.6 41.5H29.4L27.8 34.4"/>`],
  boissons: ['Bouteille et verre', `
    <path d="M14.8 5.5H19.2V12.8C22 14.6 23.2 16.8 23.2 19.8V41.5H10.8V19.8C10.8 16.8 12 14.6 14.8 12.8Z"/>
    <path d="M10.8 25H23.2M10.8 33H23.2"/>
    <path d="M28 17.5H38C38 24.5 36 28 33 28C30 28 28 24.5 28 17.5Z"/><path d="M28.4 21.5H37.6"/><path d="M33 28V39.5M29.5 39.5H36.5"/>`],
  coffret: ['Coffret cadeau', `
    <rect x="9" y="18" width="30" height="6" rx="1"/><path d="M11 24V40H37V24"/><path d="M24 18V40"/>
    <path d="M24 18C20.5 11 13.5 11.5 15.5 15.6C16.8 18 24 18 24 18ZM24 18C27.5 11 34.5 11.5 32.5 15.6C31.2 18 24 18 24 18Z"/>`],
  feuille: ['Feuille', `
    <path d="M12 36C12 20.5 22 11 37 11C37 26 27.5 36 12 36Z"/>
    <path d="M8.5 39.5L31 17"/><path d="M19.5 28.5L26.5 29M19.5 28.5L19 21.5M25.2 22.8L31.4 23.2M25.2 22.8L24.9 16.8"/>`],
  cloche: ['Cloche de service', `
    <path d="M7 35H41"/><path d="M10 35C10 26 16.3 19.8 24 19.8C31.7 19.8 38 26 38 35"/>
    <circle cx="24" cy="17.4" r="2.4"/><path d="M15 31C15.6 28.2 17.6 25.6 20.4 24.4"/><path d="M13 39H35"/>`],
  gateau: ['Petit gâteau', `
    <path d="M14 24C12 18.2 16.6 14.2 20 15.2C21 11 27 11 28 15.2C31.4 14.2 36 18.2 34 24Z"/>
    <path d="M14 24L17 39.5H31L34 24"/><path d="M20 24L21.5 39.5M24 24V39.5M28 24L26.5 39.5"/>
    <circle cx="24" cy="8.6" r="2"/>`],
  cafe: ['Tasse de café', `
    <path d="M12 22H32V28C32 33.8 28 37 22 37C16 37 12 33.8 12 28Z"/>
    <path d="M32 24.5C37 24.5 37 32 32 32"/><path d="M8 40.5H36"/>
    <path d="M17.5 18C15.8 16 19.2 14 17.5 11.5M22.5 18C20.8 16 24.2 14 22.5 11.5M27.5 18C25.8 16 29.2 14 27.5 11.5"/>`],
  couverts: ['Assiette et couverts', `
    <circle cx="24" cy="24" r="10.5"/><circle cx="24" cy="24" r="6.8"/>
    <path d="M6.5 9.5V16.5M9 9.5V16.5M11.5 9.5V16.5M6.5 16.5C6.5 20 11.5 20 11.5 16.5M9 19V38.5"/>
    <path d="M41 38.5V9.5C38.4 11.6 37.6 18.4 38.6 23H41"/>`],
  noeud: ['Nœud papillon', `
    <path d="M21 21L9.2 14.8C7.9 20 7.9 28 9.2 33.2L21 27Z"/><path d="M27 21L38.8 14.8C40.1 20 40.1 28 38.8 33.2L27 27Z"/>
    <rect x="21" y="20.2" width="6" height="7.6" rx="1.6"/><path d="M21 23H15M27 23H33" opacity=".55"/>`],
  musique: ['Notes de musique', `
    <path d="M18.5 34V12.5L36.5 8.5V30"/><path d="M18.5 17.5L36.5 13.5"/>
    <ellipse cx="14.8" cy="34.2" rx="3.9" ry="2.9" transform="rotate(-20 14.8 34.2)"/>
    <ellipse cx="32.8" cy="30.2" rx="3.9" ry="2.9" transform="rotate(-20 32.8 30.2)"/>`],
  lieu: ['Façade à colonnes', `
    <path d="M7 18L24 8L41 18Z"/><path d="M9 18V21.5H39V18"/>
    <path d="M13 21.5V36M18.5 21.5V36M29.5 21.5V36M35 21.5V36"/>
    <path d="M21.5 36V30.5C21.5 27.2 26.5 27.2 26.5 30.5V36"/><path d="M9 36H39M7 39.5H41"/>`],
  toque: ['Toque de chef', `
    <path d="M15 31V26.5C9 26 8.6 17 15.2 17.4C15.6 10.8 23.4 9 26.6 13.6C30.6 10 39 12.8 36.4 20.2C40.6 22.4 38.4 28.6 33 26.8V31"/>
    <rect x="15" y="31" width="18" height="7" rx="1"/><path d="M20 26V31M24 25V31M28 26V31"/>`],
};

/* pictogramme par défaut de chaque univers (adresse de la rubrique) */
const DEFAUT = {
  'cocktails-buffets': 'cocktail', 'carte-magnolia': 'carte', 'saveurs-du-monde': 'globe', 'grand-large': 'coquille',
  boissons: 'boissons', 'coffrets-plateaux': 'coffret', 'traiteur-vegetarien-vegan': 'feuille', 'animations-salees': 'cloche',
  douceurs: 'gateau', 'petits-dejeuners': 'cafe', indispensables: 'couverts', personnel: 'noeud', 'musique-animations': 'musique', lieux: 'lieu',
};

/* En stock (Jean-Luc, 2026-11-23 : « pour l'instant, on garde les photos ») : rien ne s'affiche tant qu'une rubrique
   n'a pas de pictogramme choisi au back-office. r.picto : '' ou 'aucun' = pas de pictogramme, 'auto' = celui prévu pour
   cet univers (DEFAUT), sinon une clé de P. */
const pictoDe = r => { const k = r?.picto; if (k === 'auto') return DEFAUT[r?.slug] || ''; return P[k] ? k : ''; };
const pictoSvg = (k, cls = 'picto') => P[k] ? `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k][1].replace(/\s*\n\s*/g, '')}</svg>` : '';
const liste = () => Object.entries(P).map(([k, [nom]]) => ({ k, nom, svg: pictoSvg(k) }));

module.exports = { PICTOS: P, DEFAUT, pictoDe, pictoSvg, liste };
