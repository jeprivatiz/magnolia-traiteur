'use strict';
/* Allergènes probables d'une prestation, d'après son nom, sa description et sa composition (recettes classiques).
   Règle de prudence (Jean-Luc, 2026-11-22) : dans le doute, on coche. La liste est affichée aux clients avec la phrase
   « Merci de nous contacter… » ; elle est à faire relire par les cuisiniers et fournisseurs (export Excel). */

const net = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

/* mots-clés (sans accents, en minuscules) → allergène ; « \b » = début de mot */
const REGLES = [
  ['Gluten', /\b(boulghour|vermicelle|vermicelles|sanbousek|bokit|fraisier|framboisine|craqueline|croquant|opera|foret noire|number cake|layer cake|cheeseburger|pain|pains|naan|nan|kulcha|paratha|roti|chapati|pita|pate|pates|pasta|spaghetti|tagliatelle|penne|lasagne|ravioli|gnocchi|pizza|focaccia|brioche|viennoiserie|croissant|chocolatine|pain au chocolat|crepe|gaufre|burger|wrap|tortilla|fajita|quiche|tarte|tartelette|gateau|cake|biscuit|cookie|sable|feuillete|feuillete|samoussa|samossa|samoussas|samossas|nem|nems|rouleau de printemps|dim sum|gyoza|bao|ravioli|wonton|nouilles|noodle|chow mein|chow chow|udon|ramen|sushi|maki|california|tempura|couscous|semoule|boulgour|taboule|ble|chapelure|pane|panure|beignet|pakora|bhaji|fatayer|sambousek|kebbe|kibbeh|petits? fours?|mignardise|eclair|chou|choux|chouquette|profiterole|paris-brest|fondant|brownie|muffin|cannele|financier|madeleine|tiramisu|biere|momos?|croque|canape|toast|blini|bruschetta|crostini|club|sandwich|panini|bagel|hot.?dog|galette|cracker|gressin|croute|crumble|charlotte|buche|entremets|patisserie|piece montee|wedding cake|cheesecake|churros|donut|baklava|halwa|gulab|sauce soja|teriyaki|chinois|japonais|sauce tartare|empanada|bouchee|vol.au.vent|friand|pizza|ble)\b/],
  ['Crustacés', /\b(crevette|crevettes|gambas|gamba|langoustine|langoustines|homard|langouste|crabe|tourteau|ecrevisse|prawn|prawns|scampi|fruits de mer|seafood|paella|paellas|plateau royal|bisque|surimi|pad thai|nem|nems|dim sum|har gow|tempura)\b/],
  ['Mollusques', /\b(moule|moules|huitre|huitres|calamar|calamars|encornet|encornets|poulpe|seiche|sipi|palourde|palourdes|coquillage|coquillages|bulot|bulots|bigorneau|bigorneaux|saint.jacques|petoncle|escargot|escargots|fruits de mer|seafood|paella|paellas|plateau royal|sauce d.huitre)\b/],
  ['Poissons', /\b(poisson|poissons|fish|saumon|thon|cabillaud|dorade|daurade|sole|truite|anchois|sardine|maquereau|colin|merlu|espadon|tilapia|morue|accras|acras|tarama|caviar|oeufs de lump|sushi|sushis|sashimi|maki|makis|california|chirashi|poke|nuoc.?mam|sauce poisson|pad thai|vietnamien|thai|nem|nems|bouillabaisse|brandade|rillettes de|colombo de poisson|fruits de mer|plateau royal|ceviche|tataki|surimi)\b/],
  ['Œufs', /\b(fraisier|framboisine|craqueline|croquant|opera|foret noire|number cake|layer cake|cheeseburger|oeuf|oeufs|omelette|mayonnaise|mayo|aioli|aioli|tartare|quiche|crepe|gaufre|brioche|gateau|cake|patisserie|macaron|mousse|tiramisu|flan|creme brulee|creme caramel|ile flottante|meringue|pavlova|nougat|financier|madeleine|eclair|chou|choux|chouquette|profiterole|beignet|tortilla|mimosa|cookie|biscuit|petits? fours?|mignardise|viennoiserie|croissant|naan|nan|nouilles|noodle|pates fraiches|tagliatelle|lasagne|ravioli|gnocchi|carbonara|tempura|pane|panure|chapelure|blini|crumble|charlotte|buche|entremets|piece montee|wedding cake|cheesecake|churros|donut|kulfi|kheer|fondant|brownie|muffin|cannele|burger|club|sandwich|bao|dim sum|nem|nems|petit.dejeuner|soufflé|souffle)\b/],
  ['Arachides', /\b(arachide|arachides|cacahuete|cacahuetes|cacahouete|peanut|satay|sate|mafe|pad thai|thai|beurre de cacahuete|africain|senegalais)\b/],
  ['Soja', /\b(soja|soya|tofu|edamame|miso|teriyaki|sushi|sushis|maki|makis|california|chirashi|poke|sashimi|nem|nems|dim sum|gyoza|bao|wok|chow mein|chow chow|chinois|japonais|vietnamien|thai|cantonais|laque|yakitori|tempura|nouilles)\b/],
  ['Lait', /\b(carpaccio|fraisier|framboisine|craqueline|croquant|opera|foret noire|number cake|layer cake|cheeseburger|pop.?corn|lait|lactee|fromage|fromages|creme|beurre|yaourt|yogourt|raita|paneer|mozzarella|burrata|parmesan|chevre|comte|emmental|gruyere|raclette|tartiflette|fondue|gratin|bechamel|butter|makhan|makhani|korma|tikka|malai|kulfi|kheer|lassi|cheese|chocolat|glace|glaces|sorbet|panna cotta|tiramisu|viennoiserie|croissant|brioche|gateau|cake|patisserie|petits? fours?|mignardise|macaron|eclair|chou|choux|profiterole|mousse|flan|creme brulee|quiche|pizza|lasagne|risotto|puree|croque|burger|cafe|petit.dejeuner|naan|nan|kulcha|paratha|halwa|gulab|cheesecake|buche|entremets|piece montee|wedding cake|crepe|gaufre|blanquette|veloute|carbonara|pesto|tzatziki|labneh|feta|halloumi|kunefe|knafeh|plateau de fromages|charcuteries? et fromages|cocktail|buffet|brunch)\b/],
  ['Fruits à coque', /\b(fraisier|framboisine|craqueline|croquant|opera|foret noire|number cake|layer cake|amande|amandes|noisette|noisettes|noix|pistache|pistaches|cajou|pecan|macadamia|praline|frangipane|nougat|macaron|macarons|financier|baklava|korma|shahi|kashmiri|cachemiri|pista|halwa|kheer|biryani royal|mughlai|pesto|muhammara|dukkah|calisson|marzipan|massepain|gianduja|nutella|brownie|cookie|petits? fours?|mignardise|entremets|patisserie|piece montee|buche|granola|muesli|petit.dejeuner|viennoiserie)\b/],
  ['Céleri', /\b(celeri|bouillon|fond de|soupe|veloute|potage|bisque|bolognaise|blanquette|pot.au.feu|couscous|tajine|tagine|waldorf|curry|colombo|massala|masala|madras|vindaloo|jalfrezi|rogan|bhuna|daal|dal|chili con carne|ragout|mijote|navarin|bourguignon|osso buco|minestrone|gaspacho|salade composee)\b/],
  ['Moutarde', /\b(cheeseburger|moutarde|vinaigrette|mayonnaise|mayo|remoulade|sauce|burger|hot.?dog|club|sandwich|curry|massala|masala|madras|vindaloo|jalfrezi|bengali|korma|tikka|tandoori|achari|daal|dal|colombo|indien|charcuterie|salade)\b/],
  ['Sésame', /\b(cheeseburger|sesame|tahini|tahin|houmous|hummus|humus|moutabal|baba ganoush|falafel|falafels|chawarma|shawarma|zaatar|halva|sushi|sushis|maki|makis|california|chinois|japonais|wok|burger|bagel|libanais|mezze|mezzes|mezze|poke|teriyaki|yakitori)\b/],
  ['Sulfites', /\b(foie gras|vin|vins|champagne|cremant|prosecco|cidre|vinaigre|vinaigrette|sangria|cocktail|cocktails|open bar|bar a|biere|aperitif|fruits secs|abricots secs|raisins secs|cornichon|cornichons|moutarde|crevette|crevettes|gambas|fruits de mer|langoustine|chorizo|charcuterie|ti.?punch|rhum|planteur|vin chaud)\b/],
  ['Lupin', /\b(lupin)\b/],
];

/* cuisine par spécialité : ingrédients de base presque toujours présents (sauce soja, ghee et graines de moutarde, tahini…) */
const PAR_SPECIALITE = {
  'buffet-chinois': ['Gluten', 'Soja', 'Sésame'],
  'specialites-japonaises': ['Gluten', 'Soja', 'Sésame', 'Poissons'],
  'buffet-indien': ['Lait', 'Moutarde'],
  'buffet-libanais': ['Sésame'],
};
const ORDRE = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques'];

/* rubriques sans nourriture : pas d'allergènes */
const SANS = new Set(['personnel', 'musique-animations', 'lieux', 'indispensables']);

/* pluriels : « burger » attrape aussi « burgers » */
for (const r of REGLES) r[1] = new RegExp(r[1].source.replace(/\)\\b$/, ')s?\\b'));

function texteProduit(p) {
  const parts = [p.titre, p.extrait, ...(p.description || []), ...(p.details || []),
    ...(p.sections || []).flatMap(s => [s.titre, s.note, ...(s.items || [])]),
    ...(p.groupes || []).flatMap(g => [g.titre, g.label, ...((g.options || g.choix || []).map(o => typeof o === 'string' ? o : (o.label || o.titre || '')))]),
    ...(p.variantes || []).map(v => typeof v === 'string' ? v : (v.label || v.titre || ''))];
  return net(parts.filter(Boolean).join(' · '));
}

function allergenesProbables(p) {
  if (!p || SANS.has(p.rubrique) || (p.tva && p.tva !== 10 && p.rubrique !== 'boissons')) return [];
  const t = texteProduit(p);
  if (/\b(softs?|eau|eaux|jus|glacons|gobelet)\b/.test(net(p.titre)) && !/cocktail|bar|petit|cafe/.test(net(p.titre))) return [];
  const l = new Set(REGLES.filter(([, re]) => re.test(t)).map(([a]) => a));
  for (const a of PAR_SPECIALITE[p.sous] || []) l.add(a);
  return ORDRE.filter(a => l.has(a));
}

module.exports = { allergenesProbables, texteProduit };
