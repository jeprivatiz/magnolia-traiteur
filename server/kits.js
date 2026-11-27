'use strict';
/* Packs d'organisation (Jean-Luc, 2026-11-27) : le matériel et les consommables internes de Magnolia à ajouter à
   la préparation pour que le stand ou l'animation fonctionne (bar à saumon, churros, pause café…). Ce ne sont PAS des
   produits à vendre : jamais sur le site, seulement dans Prépa de commande. Repris une fois de son ancien logiciel de
   stock (captures du 2026-11-27) ; quantité vide = pas indiquée sur la fiche d'origine, à compléter.
   « mots » = mots du nom d'un produit de la commande qui font proposer le pack (modifiables dans le back-office). */
const { norm } = require('./util');

const c = (nom, n = '') => ({ nom, n });
const TABLE = c('Table traiteur (2 m × 60 cm)'), JUPE_N = c('Nappe noire jupe rectangulaire 60 × 200 cm'), JUPE_B = c('Nappe blanche jupe rectangulaire 60 × 200 cm');

const KITS = [
  { id: 'cocktail-recup', nom: 'Pack orga traiteur cocktails (à récup)', recup: true, mots: ['cocktail', 'pieces cocktail', 'aperitif', 'canape', 'verrine', 'plateau'], composants: [
    c('Table traiteur (2 m × 60 cm)', 2), c('Nappe noire jupe rectangulaire 60 × 200 cm', 2), c('Nappe blanche jupe rectangulaire 60 × 200 cm', 2), c('Soliflores décoration florale', 2), c('Fejka – plante décoration florale', 4),
    c('Tabliers Magnolia noirs', 1), c('Verres à eau et softs éco-responsables', 1), c('Verres vin / champagne éco-responsables', 1), c('Rehausseur de plateau (à l’unité)', 1), c('Torchons', 1)] },
  { id: 'cocktail-jetables', nom: 'Pack traiteur cocktail (jetables)', recup: false, mots: ['cocktail', 'pieces cocktail', 'aperitif', 'canape', 'verrine', 'plateau'], composants: [
    c('Grand plateau or 28 × 42 cm'), c('Petit plateau or 19 × 28 cm'), c('Grand plateau noir 28 × 42 cm'), c('Petit plateau noir 19 × 28 cm'), c('Verre bodega en plastique pour sauce'),
    c('Petites assiettes jetables biodégradables'), c('Grandes assiettes jetables biodégradables'), c('Fourchette en bambou'), c('Couteau en bambou'), c('Petite cuillère en bambou'),
    c('Grandes serviettes blanches jetables'), c('Petites serviettes blanches Magnolia'), c('Grandes serviettes noires jetables'), c('Petites serviettes noires Magnolia'),
    c('Paire de gants en vinyle (taille L)'), c('Sac poubelle 100 L'), c('Carte de visite Magnolia Traiteur')] },
  { id: 'open-bar-recup', nom: 'Pack orga stand open bar vin et champagne (à récup)', recup: true, mots: ['open bar', 'champagne', 'bar a vin', 'vin'], composants: [
    TABLE, JUPE_N, JUPE_B, c('Vasque à champagne grand format'), c('Verres vin / champagne éco-responsables'), c('Pelle à glaçons'), c('Caisse isotherme en polyester')] },
  { id: 'bar-cocktails-recup', nom: 'Pack orga stand bar à cocktails (à récup)', recup: true, mots: ['bar a cocktail', 'mojito', 'barman', 'punch', 'cocktails'], composants: [
    c('Couteau à découpe gâteaux / citron, orange / fromages'), c('Plateau de travail pour découpe'), c('Agitateurs à cocktails'), c('Doseur bouteille'), c('Shaker'), c('Bols Ikea'), c('Pilon pour cocktail'),
    c('Pelle à glaçons'), c('Louche de cuisine'), TABLE, JUPE_N, JUPE_B, c('Fontaine à boissons 8 L'), c('Fontaine à boissons 5 L'), c('Tabliers Magnolia noirs'), c('Vasque à champagne grand format'),
    c('Fejka – plante décoration florale'), c('Verres éco-responsables 25/33 cl')] },
  { id: 'churros-recup', nom: 'Pack orga stand à churros (à récup)', recup: true, mots: ['churros', 'churro'], composants: [
    c('Machine à churros manuelle', 1), c('Machine à pétrin', 1), c('Friteuse', 1), c('Grand bac chafing dish', 1), c('Bouilloire électrique pro 6 L', 1), c('Table traiteur (2 m × 60 cm)', 2),
    c('Nappe noire jupe rectangulaire 60 × 200 cm', 2), c('Soliflores décoration florale', 2), c('Fejka – plante décoration florale', 4), c('Torchons', 3), c('Tabliers Magnolia noirs', 2),
    c('Ciseaux de cuisine', 1), c('Cuillère de service buffet', 2), c('Pince de service', 2), c('Rallonge enrouleur 4 prises', 1), c('Multiprise 5 entrées', 1), c('Balance de cuisine', 1)] },
  { id: 'churros-jetables', nom: 'Pack stand à churros (jetables)', recup: false, mots: ['churros', 'churro'], composants: [
    c('Cornets en carton', 150), c('Petites serviettes blanches Magnolia', 150), c('Verre bodega en plastique pour sauce', 150), c('Pâte à tartiner chocolat / noisette (kg)', 1.5), c('Sucre de canne (kg)', 0.5),
    c('Huile de friture (bidon 25 L)', 0.25), c('Farine T45 (kg)', 2), c('Eau plate Cristaline 1,5 L', 2), c('Sel fin (kg)', 0.25), c('Grand plateau or 28 × 42 cm', 5), c('Paire de gants en vinyle (taille L)', 6), c('Carte de visite Magnolia Traiteur', 20)] },
  { id: 'percolateur-jetables', nom: 'Percolateur à café pour 100 tasses (jetables)', recup: false, mots: ['percolateur', 'cafe', 'the'], composants: [
    c('Gobelet / tasse bambou double paroi 10 cl', 100), c('Agitateurs bois (touillettes)', 100), c('Bûchette de sucre 5 g', 150), c('Café 1 kg', 3), c('Filtre à café', 3), c('Petites serviettes blanches Magnolia', 100)] },
  { id: 'pause-cafe-jetables', nom: 'Pack traiteur pause café (jetables)', recup: false, mots: ['pause cafe', 'cafe', 'the', 'petit dejeuner', 'petit-dejeuner', 'viennoiserie', 'brunch'], composants: [
    c('Café 1 kg'), c('Filtre à café'), c('Jus de pomme 1 L'), c('Jus d’orange brick 1 L'), c('Jus d’ananas 1 L'), c('Bouteille d’eau gazeuse Cristaline 1,5 L'), c('Eau plate Cristaline 50 cl'),
    c('Boîte à thé Earl Grey'), c('Agitateurs bois (touillettes)'), c('Gobelet / tasse bambou double paroi 10 cl'), c('Petites serviettes blanches Magnolia'), c('Petites serviettes noires Magnolia'), c('Carte de visite Magnolia Traiteur')] },
  { id: 'pause-cafe-recup', nom: 'Pack orga pause café / thé (à récup)', recup: true, mots: ['pause cafe', 'cafe', 'the', 'petit dejeuner', 'petit-dejeuner', 'viennoiserie', 'brunch'], composants: [
    c('Machine à café / thé grande capacité'), c('Percolateur à café ou thé professionnel'), c('Carafe – pichet à jus et eau en plexi'), c('Thermos 5 L'), c('Thermos 2,5 L'), c('Verres à eau et softs éco-responsables')] },
  { id: 'saumon-jetables', nom: 'Pack traiteur bar à saumon / foie gras (jetables)', recup: false, mots: ['saumon', 'foie gras'], composants: [
    c('Petit plateau or 19 × 28 cm'), c('Grand plateau or 28 × 42 cm'), c('Petites assiettes jetables biodégradables'), c('Petites serviettes blanches Magnolia'), c('Petites serviettes noires Magnolia'),
    c('Paire de gants en vinyle (taille L)'), c('Petite cuillère en bambou'), c('Rince-doigts')] },
  { id: 'saumon-recup', nom: 'Pack traiteur bar à saumon / foie gras (à récup)', recup: true, mots: ['saumon', 'foie gras'], composants: [
    TABLE, JUPE_N, c('Couteau de cuisine'), c('Grill toaster roller'), c('Bol en inox'), c('Jeux de couverts en dur pour le buffet'), c('Soliflores décoration florale'), c('Fejka – plante décoration florale'),
    c('Tabliers Magnolia noirs'), c('Torchons')] },
];

const s = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const qte = v => v === '' || v == null ? '' : Math.max(0, Math.min(1e6, Math.round((+String(v).replace(',', '.') || 0) * 100) / 100));
function nettoyerKit(k = {}, id) {
  return {
    id: s(id || k.id, 60), nom: s(k.nom, 160) || 'Pack sans nom', recup: !!k.recup,
    mots: [...new Set((Array.isArray(k.mots) ? k.mots : String(k.mots || '').split(',')).map(m => norm(s(m, 60))).filter(m => m.length >= 2))].slice(0, 30),
    composants: (Array.isArray(k.composants) ? k.composants : []).slice(0, 120).map(x => ({ nom: s(x?.nom, 160), n: qte(x?.n) })).filter(x => x.nom),
    note: s(k.note, 600),
  };
}
/* packs proposés pour une commande : un mot du pack présent dans le nom d'un produit (mots entiers) */
function kitsPour(lignes = [], kits = []) {
  const noms = lignes.filter(l => l && l.type !== 'titre' && l.liste !== 'kit').map(l => ' ' + norm(l.designation || '').replace(/[^a-z0-9]+/g, ' ') + ' ');
  return kits.filter(k => (k.mots || []).some(m => { const w = ' ' + norm(m).replace(/[^a-z0-9]+/g, ' ').trim() + ' '; return noms.some(n => n.includes(w) || n.includes(w.replace(/ $/, 's '))); })).map(k => k.id);
}
module.exports = { KITS: KITS.map(k => nettoyerKit(k)), nettoyerKit, kitsPour };
