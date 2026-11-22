'use strict';
/*
 * Alerte « 24 h » (comme JEPRIVATIZ) :
 *  - un devis envoyé au client sur lequel personne n'a rien fait depuis 24 h (pas d'envoi, de relance ni de modification) ;
 *  - une demande de devis toujours « Demande » 24 h après son arrivée.
 * Un seul e-mail récapitulatif à l'équipe par passage, une seule alerte par période de silence :
 * dès que l'équipe agit, le compteur repart. Rien au-delà de 30 jours (dossier abandonné).
 */
const H24 = 24 * 36e5, J30 = 30 * 864e5;

function derniereAction(d) {
  return [d.envoyeLe, d.updatedAt, ...(d.envois || []).map(e => e && e.at), ...(d.relances || []).map(r => r && r.at), ...(d.historique || []).map(h => h && h.at), d.createdAt]
    .filter(Boolean).map(String).sort().pop() || '';
}
function enRetard(d, ouvert, now) {
  if (!ouvert) return false;
  const t = Date.parse(derniereAction(d));
  if (isNaN(t) || now - t < H24 || now - t > J30) return false;
  return !(d.alerte24hAt && Date.parse(d.alerte24hAt) >= t);
}

async function verifierRetards(store, now = Date.now()) {
  const [dv, dem] = await Promise.all([store.list('devis'), store.list('demandes')]);
  const devis = dv.map(x => x.data).filter(d => enRetard(d, d.statut === 'envoye', now));
  const demandes = dem.map(x => x.data).filter(d => enRetard(d, d.statut === 'demande', now));
  return { devis, demandes };
}

/* marque les dossiers signalés, puis rend le contenu du message (ou null s'il n'y a rien) */
async function preparerAlerte(store, { site, euros, esc }, now = Date.now()) {
  const { devis, demandes } = await verifierRetards(store, now);
  if (!devis.length && !demandes.length) return null;
  const at = new Date(now).toISOString();
  for (const d of devis) await store.set('devis/' + d.id, { ...d, alerte24hAt: at });
  for (const d of demandes) await store.set('demandes/' + d.id, { ...d, alerte24hAt: at });
  const li = [
    ...demandes.map(d => `<li>Demande <a href="${site}/admin#/demandes/${d.id}">${esc(d.ref)}</a> · ${esc(d.contact?.nom)} · ${esc(d.evenement?.type || d.sujet || '')} : pas encore traitée</li>`),
    ...devis.map(d => `<li>Devis <a href="${site}/admin#/devis/${d.id}">${esc(d.numero)}</a> · ${esc(d.clientNom || '')}${euros ? '' : ''} : envoyé, sans nouvelle depuis 24 h</li>`),
  ];
  const n = devis.length + demandes.length;
  return {
    sujet: `Magnolia : ${n} dossier${n > 1 ? 's' : ''} sans action depuis 24 h`,
    html: `<p>Bonjour,</p><p>Ces dossiers attendent une action de l’équipe :</p><ul>${li.join('')}</ul><p>Pensez à relancer le client ou à changer l’étape dans le Suivi client.</p>`,
    sms: `Magnolia : ${n} dossier${n > 1 ? 's' : ''} sans action depuis 24 h. Voir le back-office.`,
    devis: devis.length, demandes: demandes.length,
  };
}

module.exports = { derniereAction, enRetard, verifierRetards, preparerAlerte };
