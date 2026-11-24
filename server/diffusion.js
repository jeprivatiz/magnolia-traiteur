'use strict';
/*
 * Envois groupés aux clients (Back-office › Clients › « Envoyer un e-mail » / « Envoyer un SMS ») :
 * profil de chaque client pour la sélection (montant commandé, département, type d'événement),
 * e-mail aux couleurs Magnolia, comptage des SMS, créneaux autorisés pour les SMS publicitaires,
 * lien de désinscription signé.
 */
const crypto = require('crypto');
const { esc, euros } = require('./util');

/* département d'un code postal (Corse : 2A / 2B ; DOM : 971…976) */
function departement(cp) {
  const s = String(cp || '').trim();
  if (!/^\d{5}$/.test(s)) return '';
  if (s.startsWith('97') || s.startsWith('98')) return s.slice(0, 3);
  if (s.startsWith('20')) return +s < 20200 ? '2A' : '2B';
  return s.slice(0, 2);
}
/* codes postaux trouvés dans un texte libre (adresse) */
const cpsDans = t => (String(t || '').match(/\b\d{5}\b/g) || []);

/* portable français ou numéro international : seuls ceux-là peuvent recevoir un SMS */
function mobile(tel) {
  let d = String(tel || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (/^0\d{9}$/.test(d)) d = '33' + d.slice(1);
  if (/^33[67]\d{8}$/.test(d)) return d;
  if (/^33/.test(d)) return ''; /* fixe français */
  return /^\d{8,15}$/.test(d) ? d : '';
}

/* ---------- profil de chaque client pour la sélection ---------- */
function profils({ clients, demandes, devis, factures, totaux }) {
  const parClient = new Map(clients.map(c => [c.id, { c, dem: [], dv: [], fa: [] }]));
  for (const d of demandes) parClient.get(d.clientId)?.dem.push(d);
  const demClient = new Map(demandes.map(d => [d.id, d.clientId]));
  for (const v of devis) parClient.get(v.clientId || demClient.get(v.demandeId))?.dv.push(v);
  for (const f of factures) parClient.get(f.clientId)?.fa.push(f);
  return [...parClient.values()].map(({ c, dem, dv, fa }) => {
    const signes = dv.filter(v => v.statut === 'accepte').map(v => totaux(v).ttcCents);
    /* une facture payée sans devis signé (saisie à la main) compte aussi comme une commande */
    const payeesSeules = fa.filter(f => f.payee && !dv.some(v => v.id === f.devisId && v.statut === 'accepte')).map(f => f.totalCents || 0);
    const commandes = [...signes, ...payeesSeules].filter(x => x > 0);
    const deps = new Set();
    for (const d of dem) { const x = departement(d.evenement?.cp); if (x) deps.add(x); }
    for (const v of dv) { const x = departement(v.evenement?.cp || cpsDans(v.evenement?.adresse || v.evenement?.lieu)[0]); if (x) deps.add(x); }
    if (c.departement) deps.add(String(c.departement).toUpperCase());
    else for (const cp of [c.cp, ...cpsDans(c.adresse)]) { const x = departement(cp); if (x) { deps.add(x); break; } }
    const types = [...new Set([...dem.map(d => d.evenement?.type), ...dv.map(v => v.evenement?.type)].filter(Boolean))];
    const dates = [c.derniereActivite, c.derniereCommande, ...dem.map(d => d.createdAt), ...dv.map(v => v.signature?.at || v.createdAt)].filter(Boolean).sort();
    const stop = c.desinscrit || {}, ok = c.consentement || {};
    const crm = Math.max(0, +c.caCrmCents || 0);
    return {
      id: c.id, nom: c.nom || '', societe: c.societe || '', email: c.email || '', tel: c.tel || '',
      emailOk: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(c.email || '').trim()), mobile: mobile(c.telE164 || c.tel),
      deps: [...deps].sort(), types, pro: !!c.societe,
      nbCommandes: commandes.length + (crm ? 1 : 0), totalCents: commandes.reduce((t, x) => t + x, 0) + crm,
      nbDemandes: dem.filter(d => d.type !== 'contact').length,
      derniere: dates[dates.length - 1] || '',
      accordEmail: !!ok.email, accordSms: !!ok.sms, stopEmail: !!stop.email, stopSms: !!stop.sms,
    };
  });
}

/* critères de la sélection (identiques pour l'e-mail et le SMS) */
function filtrer(liste, canal, k = {}) {
  const min = Math.max(0, Math.round(+k.montantMin || 0)), deps = (k.deps || []).map(String), types = (k.types || []).map(String);
  const q = String(k.q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return liste.filter(p => {
    if (canal === 'email' ? !p.emailOk || p.stopEmail : !p.mobile || p.stopSms) return false;
    if (k.statut === 'commandes' && !p.nbCommandes) return false;
    if (k.statut === 'prospects' && p.nbCommandes) return false;
    if (min && p.totalCents < min) return false;
    if (deps.length && !p.deps.some(d => deps.includes(d))) return false;
    if (types.length && !p.types.some(t => types.includes(t))) return false;
    if (k.pro === 'pro' && !p.pro) return false;
    if (k.pro === 'part' && p.pro) return false;
    if (k.accord && !(canal === 'email' ? p.accordEmail : p.accordSms)) return false;
    if (q && !(p.nom + ' ' + p.societe + ' ' + p.email + ' ' + p.tel).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)) return false;
    return true;
  });
}

/* ---------- SMS : longueur et nombre de messages ---------- */
/* alphabet GSM 7 bits (un SMS = 160 caractères) ; sinon Unicode (70) */
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';
/* mention obligatoire en France pour un SMS publicitaire : Brevo remplace [STOP_CODE] par son numéro (ex. 36173) */
const STOP = 'STOP au [STOP_CODE]';
const STOP_AFFICHE = 'STOP au 36173';
/* remplace les signes typographiques courants par leur équivalent GSM (évite de passer en Unicode, 70 caractères) */
const versGsm = t => String(t || '').replace(/[’‘]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ | /g, ' ')
  .replace(/ç/g, 'c').replace(/[êë]/g, 'e').replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[û]/g, 'u').replace(/[â]/g, 'a').replace(/[ÊË]/g, 'E').replace(/[ÎÏ]/g, 'I').replace(/[Ô]/g, 'O').replace(/[ÛÙ]/g, 'U').replace(/[ÂÀ]/g, 'A').replace(/[È]/g, 'E');
function comptage(texte) {
  const t = String(texte || '').split(STOP).join(STOP_AFFICHE);
  const unicode = [...t].some(ch => !GSM.includes(ch) && !GSM_EXT.includes(ch));
  const car = unicode ? [...t].length : [...t].reduce((n, ch) => n + (GSM_EXT.includes(ch) ? 2 : 1), 0);
  const un = unicode ? 70 : 160, plusieurs = unicode ? 67 : 153;
  const sms = car === 0 ? 0 : car <= un ? 1 : Math.ceil(car / plusieurs);
  return { car, sms, unicode, parSms: sms > 1 ? plusieurs : un };
}
/* texte final d'un SMS d'information : prénom, signature, mention STOP */
/* adresse du site à mettre dans chaque SMS (Mon entreprise › Site internet), sans https:// ni www */
const lienCourt = u => String(u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
/* ajoute l'adresse du site à un SMS qui n'a pas déjà un lien vers le site (avant la mention STOP s'il y en a une) */
function avecLien(texte, lien, autres = []) {
  const t = String(texte || ''), bas = t.toLowerCase();
  if (!lien || [lien, ...autres].filter(Boolean).some(x => bas.includes(String(x).toLowerCase()))) return t;
  const m = t.match(/\n?STOP(\s+au)?\s+(\[STOP_CODE\]|\d+)\s*$/i);
  return m ? t.slice(0, m.index).trimEnd() + '\n' + lien + '\n' + m[0].replace(/^\n/, '') : t.trimEnd() + '\n' + lien;
}
function smsFinal(texte, { prenom = '', lien = '' } = {}) {
  let t = versGsm(texte).replace(/\{prenom\}/gi, prenom || '').replace(/ +([,.])/g, '$1').replace(/Bonjour\s+,/i, 'Bonjour,').trim();
  t = t.replace(/\s*STOP(\s+au)?\s+(\[STOP_CODE\]|\d+)\s*\.?$/i, '').trim();
  return avecLien(t, lien) + '\n' + STOP;
}

/* ---------- créneaux des SMS publicitaires en France : pas avant 8 h, pas après 22 h, ni dimanche ni jour férié ---------- */
function paques(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mois - 1, jour));
}
function feries(y) {
  const p = paques(y), plus = n => new Date(p.getTime() + n * 86400e3).toISOString().slice(0, 10);
  return [`${y}-01-01`, plus(1), `${y}-05-01`, `${y}-05-08`, plus(39), plus(50), `${y}-07-14`, `${y}-08-15`, `${y}-11-01`, `${y}-11-11`, `${y}-12-25`];
}
function heureParis(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'long', hour12: false }).formatToParts(d).map(x => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: +p.hour % 24, minute: +p.minute, semaine: p.weekday };
}
function creneauSms(d = new Date()) {
  const h = heureParis(d);
  if (h.semaine === 'dimanche') return { ok: false, raison: 'Les SMS d’information ne peuvent pas partir le dimanche (règle française). Revenez lundi à partir de 8 h.' };
  if (feries(+h.jour.slice(0, 4)).includes(h.jour)) return { ok: false, raison: 'Aujourd’hui est un jour férié : les SMS d’information ne peuvent pas partir (règle française). Revenez demain à partir de 8 h.' };
  if (h.heure < 8 || h.heure >= 22) return { ok: false, raison: 'Les SMS d’information ne peuvent partir qu’entre 8 h et 22 h (règle française).' };
  return { ok: true };
}

/* ---------- lien de désinscription signé (sans compte, sans mot de passe) ---------- */
const jeton = (secret, id) => crypto.createHmac('sha256', String(secret)).update('desinscription|' + id).digest('base64url').slice(0, 22);
const jetonOk = (secret, id, t) => { const a = Buffer.from(jeton(secret, id)), b = Buffer.from(String(t || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); };

/* ---------- e-mail aux couleurs de Magnolia ---------- */
/* corps : paragraphes séparés par une ligne vide, **gras**, listes « - », liens écrits en clair */
function corpsHtml(texte) {
  const ligne = l => esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:#1d3b2f">$1</a>');
  return String(texte || '').replace(/\r/g, '').split(/\n\s*\n/).map(bloc => {
    const lignes = bloc.split('\n').map(x => x.trim()).filter(Boolean);
    if (!lignes.length) return '';
    /* lignes « - … » regroupées en liste, le reste en paragraphe */
    const parts = []; let cur = null;
    for (const x of lignes) { const li = /^[-•]\s/.test(x); if (!cur || cur.li !== li) parts.push(cur = { li, l: [] }); cur.l.push(li ? x.replace(/^[-•]\s+/, '') : x); }
    return parts.map(g => g.li ? `<ul style="margin:0 0 16px;padding-left:22px">${g.l.map(x => `<li style="margin:0 0 6px">${ligne(x)}</li>`).join('')}</ul>` : `<p style="margin:0 0 ${parts.length > 1 && g === parts[0] ? 8 : 16}px">${g.l.map(ligne).join('<br>')}</p>`).join('');
  }).join('');
}
function emailHtml({ objet = '', titre = '', corps = '', bouton = null, photo = '', prenom = '', R = {}, site = '', lienDesinscription = '#', apercu = false }) {
  const E = R.entreprise || {};
  const abs = u => !u ? '' : /^https?:\/\//.test(u) ? u : site + (u.startsWith('/') ? u : '/' + u);
  const logo = E.logo && !/\.svg(\?|$)/i.test(E.logo) ? abs(E.logo) : '';
  const texte = String(corps || '').replace(/\{prenom\}/gi, prenom || '').replace(/Bonjour\s+,/i, 'Bonjour,');
  const tel = String(R.telephone || '07 63 66 98 92');
  const btn = bouton && bouton.texte && /^https?:\/\//.test(abs(bouton.lien)) ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:#b08a4f;border-radius:999px"><a href="${esc(abs(bouton.lien))}" style="display:inline-block;padding:14px 28px;font:600 16px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(bouton.texte)}</a></td></tr></table>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(objet)}</title></head>
<body style="margin:0;padding:0;background:#f6f1e8">
<div style="display:none;max-height:0;overflow:hidden">${esc(String(texte).replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3ddd2">
<tr><td style="background:#1d3b2f;padding:26px 32px;text-align:center">${logo ? `<img src="${esc(logo)}" alt="Magnolia Traiteur" height="56" style="height:56px;max-width:220px;margin:0 auto 6px;display:block">` : ''}<div style="font:400 30px/1.1 Georgia,'Times New Roman',serif;color:#ffffff;letter-spacing:.5px">Magnolia</div><div style="font:600 11px/1.6 Arial,Helvetica,sans-serif;color:#c9a46a;letter-spacing:4px;text-transform:uppercase">Traiteur</div></td></tr>
${photo ? `<tr><td><img src="${esc(abs(photo))}" alt="" width="600" style="display:block;width:100%;height:auto;max-height:320px;object-fit:cover"></td></tr>` : ''}
<tr><td style="padding:32px 32px 8px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#1b211e">
${titre ? `<h1 style="margin:0 0 18px;font:400 26px/1.25 Georgia,'Times New Roman',serif;color:#1d3b2f">${esc(titre)}</h1>` : ''}
${corpsHtml(texte)}${btn}
</td></tr>
<tr><td style="padding:0 32px 28px;font:15px/1.6 Arial,Helvetica,sans-serif;color:#1b211e">L’équipe Magnolia Traiteur<br><a href="tel:${esc(tel.replace(/\s/g, ''))}" style="color:#1d3b2f;font-weight:bold;text-decoration:none">${esc(tel)}</a> · <a href="mailto:${esc(R.email || 'infos@magnoliatraiteur.fr')}" style="color:#1d3b2f">${esc(R.email || 'infos@magnoliatraiteur.fr')}</a></td></tr>
<tr><td style="background:#efe7da;padding:18px 32px;text-align:center;font:12px/1.6 Arial,Helvetica,sans-serif;color:#5d6661">${esc(E.raisonSociale || 'Magnolia Traiteur')} · ${esc(R.adresse || '15 avenue de Norvège, 91140 Villebon-sur-Yvette')}<br>Livraison 7 j/7 à Paris et dans toute l’Île-de-France · <a href="${esc(site || '')}/" style="color:#5d6661">magnoliatraiteur.fr</a><br><br>Vous recevez cet e-mail car vous êtes client ou avez demandé un devis à Magnolia Traiteur.<br><a href="${esc(lienDesinscription)}" style="color:#1d3b2f;font-weight:bold"${apercu ? ' onclick="return false"' : ''}>Se désinscrire</a> : vous ne recevrez plus nos e-mails d’information.</td></tr>
</table></td></tr></table></body></html>`;
}
function emailTexte({ titre = '', corps = '', bouton = null, prenom = '', R = {}, site = '', lienDesinscription = '' }) {
  return [titre, String(corps || '').replace(/\{prenom\}/gi, prenom || '').replace(/\*\*/g, ''), bouton?.texte && bouton?.lien ? bouton.texte + ' : ' + (/^https?:/.test(bouton.lien) ? bouton.lien : site + bouton.lien) : '',
    'L’équipe Magnolia Traiteur · ' + (R.telephone || '07 63 66 98 92'), 'Se désinscrire : ' + lienDesinscription].filter(Boolean).join('\n\n');
}

/* page publique « Se désinscrire » (simple, aux couleurs Magnolia, sans dépendre du reste du site) */
function pageDesinscription({ etat, action = '', R = {} }) {
  const tel = R.telephone || '07 63 66 98 92';
  const corps = etat === 'demander'
    ? `<h1>Ne plus recevoir nos e-mails d’information ?</h1><p>Vous ne recevrez plus nos nouveautés et offres par e-mail. Vos devis, factures et confirmations de commande continueront d’arriver normalement.</p><form method="post" action="${esc(action)}"><button>Me désinscrire</button></form>`
    : etat === 'fait'
      ? `<h1>C’est fait</h1><p>Vous ne recevrez plus nos e-mails d’information. Merci de votre confiance, et à bientôt peut-être.</p>`
      : `<h1>Lien incomplet</h1><p>Ce lien de désinscription n’est pas valable. Écrivez-nous à <a href="mailto:${esc(R.email || 'infos@magnoliatraiteur.fr')}">${esc(R.email || 'infos@magnoliatraiteur.fr')}</a> ou appelez le ${esc(tel)} : nous vous retirons de la liste tout de suite.</p>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Désinscription · Magnolia Traiteur</title>
<style>:root{color-scheme:light}body{margin:0;background:#f6f1e8;font:17px/1.6 Arial,Helvetica,sans-serif;color:#1b211e}main{max-width:520px;margin:8vh auto;padding:0 16px}.c{background:#fff;border:1px solid #e3ddd2;border-radius:16px;overflow:hidden}.h{background:#1d3b2f;color:#fff;text-align:center;padding:22px;font:30px/1.1 Georgia,serif}.h small{display:block;font:600 11px/1.8 Arial,sans-serif;letter-spacing:4px;color:#c9a46a;text-transform:uppercase}.b{padding:26px 28px 30px}h1{font:400 25px/1.25 Georgia,serif;color:#1d3b2f;margin:0 0 12px}button{background:#b08a4f;color:#fff;border:0;border-radius:999px;padding:14px 28px;font:600 16px Arial,sans-serif;cursor:pointer;margin-top:8px}a{color:#1d3b2f}p.f{text-align:center;font-size:13px;color:#5d6661}</style></head>
<body><main><div class="c"><div class="h">Magnolia<small>Traiteur</small></div><div class="b">${corps}</div></div><p class="f"><a href="/">magnoliatraiteur.fr</a> · ${esc(tel)}</p></main></body></html>`;
}

const prenomDe = nom => { const p = String(nom || '').trim().split(/\s+/)[0] || ''; return p.length > 1 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : ''; };

module.exports = { lienCourt, avecLien, pageDesinscription, filtrer, departement, mobile, profils, comptage, smsFinal, versGsm, STOP, STOP_AFFICHE, creneauSms, feries, jeton, jetonOk, emailHtml, emailTexte, corpsHtml, prenomDe, euros };
