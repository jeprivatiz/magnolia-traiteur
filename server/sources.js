'use strict';
/* Source des demandes de devis (Jean-Luc, 2026-11-26) : par quel canal le client nous a trouvés.
   - demande envoyée depuis le site : « Site », posé automatiquement ;
   - saisie à la main (devis, fiche client, commande prise au téléphone) : liste déroulante, et l'équipe peut créer une nouvelle source ;
   - fiches reprises du fichier de l'ancien CRM : « Import ».
   Champ `canal` sur la fiche client, la demande et le devis. Un devis sans source prend celle de sa demande, puis celle du client ;
   une demande sans source prend « Site » si elle vient du site, sinon celle du client.
   (L'ancien champ technique `source` des fiches — 'site', 'import CRM', 'back-office'… — est gardé tel quel.) */

const DEFAUT = ['Site', 'Bouche à oreille', 'Ancien client', '1001 salles', 'ABC salles', 'Google', 'Facebook', 'Instagram', 'Salon ou événement', 'Téléphone', 'Import'];
const DOC = '_sources/liste';

const propre = v => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

/* source d'une fiche client : celle choisie, sinon déduite de son origine */
function canalClient(c) {
  if (!c) return '';
  if (c.canal != null && propre(c.canal)) return propre(c.canal);
  if (c.source === 'site') return 'Site';
  if (c.source === 'import CRM') return 'Import';
  return '';
}
const duSite = d => !!d && !d.source && (d.historique || [])[0]?.par === 'site';
function canalDemande(d, client) {
  if (!d) return '';
  if (propre(d.canal)) return propre(d.canal);
  if (duSite(d)) return 'Site';
  return canalClient(client);
}
function canalDevis(v, demande, client) {
  if (!v) return '';
  if (propre(v.canal)) return propre(v.canal);
  return demande ? canalDemande(demande, client) : canalClient(client);
}

function creerSources({ store }) {
  async function liste() {
    const doc = await store.get(DOC);
    const l = Array.isArray(doc?.liste) ? doc.liste.map(propre).filter(Boolean) : DEFAUT.slice();
    return [...new Set(l)];
  }
  async function ajouter(nom) {
    nom = propre(nom);
    if (!nom) throw Object.assign(new Error('Indiquez le nom de la source.'), { status: 400 });
    const l = await liste();
    const deja = l.find(x => x.toLowerCase() === nom.toLowerCase());
    if (deja) return { liste: l, nom: deja };
    const next = [...l, nom];
    await store.set(DOC, { liste: next, updatedAt: new Date().toISOString() });
    return { liste: next, nom };
  }
  async function retirer(nom) {
    nom = propre(nom).toLowerCase();
    const next = (await liste()).filter(x => x.toLowerCase() !== nom);
    await store.set(DOC, { liste: next, updatedAt: new Date().toISOString() });
    return next;
  }
  return { liste, ajouter, retirer };
}

/* « D'où viennent nos clients » (Statistiques) : sur les 12 derniers mois, par source :
   demandes reçues, devis envoyés, devis signés, taux de signature, chiffre d'affaires TTC et HT signé */
function parSource({ demandes = [], devis = [], clients = new Map(), totaux, maintenant = new Date() }) {
  const depuis = new Date(maintenant.getTime() - 365 * 86400e3).toISOString();
  const demById = new Map(demandes.filter(Boolean).map(d => [d.id, d]));
  const acc = new Map();
  const get = k => { k = k || ''; if (!acc.has(k)) acc.set(k, { source: k, demandes: 0, devis: 0, envoyes: 0, signes: 0, caTtcCents: 0, caHtCents: 0, clients: new Set() }); return acc.get(k); };
  for (const d of demandes) {
    if (!d || d.type === 'contact' || String(d.createdAt || '') < depuis) continue;
    const a = get(canalDemande(d, clients.get(d.clientId)));
    a.demandes++; if (d.clientId) a.clients.add(d.clientId);
  }
  for (const v of devis) {
    if (!v || !v.numero || v.modele) continue;
    const signe = v.statut === 'accepte', t = String((signe && (v.signature?.at || v.accepteLe)) || v.envoyeLe || v.createdAt || '');
    if (t < depuis) continue;
    const dem = v.demandeId ? demById.get(v.demandeId) : null;
    const a = get(canalDevis(v, dem, clients.get(v.clientId)));
    a.devis++;
    if (v.statut !== 'brouillon') a.envoyes++;
    if (v.clientId) a.clients.add(v.clientId);
    if (signe) {
      a.signes++;
      const T = totaux ? totaux(v) : null;
      a.caTtcCents += T?.ttcCents ?? T?.totalCents ?? 0;
      a.caHtCents += T?.htCents ?? 0;
    }
  }
  const l = [...acc.values()].map(a => ({ ...a, clients: a.clients.size, taux: a.envoyes ? Math.round(100 * a.signes / a.envoyes) : null }));
  l.sort((x, y) => (!x.source) - (!y.source) || y.caTtcCents - x.caTtcCents || y.demandes - x.demandes || y.devis - x.devis);
  const somme = k => l.reduce((t, x) => t + x[k], 0);
  return { depuis: depuis.slice(0, 10), lignes: l, total: { demandes: somme('demandes'), devis: somme('devis'), envoyes: somme('envoyes'), signes: somme('signes'), caTtcCents: somme('caTtcCents'), caHtCents: somme('caHtCents') } };
}

module.exports = { DEFAUT, canalClient, canalDemande, canalDevis, creerSources, parSource, propre };
