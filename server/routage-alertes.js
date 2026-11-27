'use strict';
/* Qui prévenir selon la demande (Jean-Luc, 2026-11-27) : Équipe & activité › Alertes de l'équipe.
   Des règles, lues dans l'ordre : montant estimé TTC, nombre de personnes, date de l'événement (urgente),
   situation de la demande (incomplète / devis parti tout seul). Chaque règle qui correspond ajoute ses destinataires
   (membre de l'équipe ou numéro / e-mail libre) avec son canal (e-mail, SMS ou les deux). « S'arrêter là » coupe la lecture.
   Aucune règle ne correspond : règle par défaut (toute la liste des alertes, ou des personnes choisies). */

const OPS = ['', 'min', 'max'];
const CANAUX = ['les2', 'email', 'sms'];
const SITUATIONS = { '': 'Peu importe', incomplete: 'Demande incomplète : le devis n’a pas pu partir tout seul', auto: 'Devis envoyé tout seul par l’IA' };
const isEmail = e => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(e || '').trim());
const cle = n => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; };
const liste = v => String(v || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);

/* règle propre (venue du back-office) */
function nette(r, i = 0) {
  r = r || {};
  const cond = (c, max) => { const op = OPS.includes(c?.op) ? c.op : '', val = num(c?.val); return op && val != null ? { op, val: Math.min(val, max) } : { op: '', val: null }; };
  const d = r.delai || {};
  const jours = num(d.jours);
  return {
    id: String(r.id || 'r' + Date.now().toString(36) + i).slice(0, 20),
    nom: String(r.nom || '').trim().slice(0, 80),
    actif: r.actif !== false,
    montant: cond(r.montant, 1e7), invites: cond(r.invites, 1e5),
    delai: (d.op === 'moins' || d.op === 'plus') && jours != null ? { op: d.op, jours: Math.min(Math.round(jours), 3650) } : { op: '', jours: null },
    situation: r.situation in SITUATIONS ? r.situation : '',
    qui: [...new Set((Array.isArray(r.qui) ? r.qui : []).map(x => String(x || '').trim().slice(0, 80)).filter(Boolean))].slice(0, 20),
    tels: liste(r.tels).map(x => x.slice(0, 30)).slice(0, 10).join(', '),
    emails: liste(r.emails).filter(isEmail).slice(0, 10).join(', '),
    canal: CANAUX.includes(r.canal) ? r.canal : 'les2',
    stop: !!r.stop,
  };
}
function nettes(L) { return (Array.isArray(L) ? L : []).slice(0, 30).map(nette); }
function defautNet(d) {
  d = d || {};
  return { mode: d.mode === 'choix' ? 'choix' : 'tous', qui: nette(d).qui, tels: nette(d).tels, emails: nette(d).emails, canal: CANAUX.includes(d.canal) ? d.canal : 'les2' };
}

/* profil d'une demande : ce que les règles regardent */
function profil(demande, auto, now = new Date()) {
  const e = demande?.evenement || {};
  const auj = Date.parse(new Date(now).toISOString().slice(0, 10) + 'T12:00:00');
  const ev = /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? Date.parse(e.date + 'T12:00:00') : NaN;
  const devis = demande?.type !== 'contact';
  return {
    montantCents: Math.max(0, Math.round(+(auto?.ttcCents ?? demande?.totalEstimeCents ?? 0) || 0)),
    invites: +e.invites > 0 ? +e.invites : null,
    jours: Number.isNaN(ev) ? null : Math.round((ev - auj) / 864e5),
    situation: !devis ? '' : auto?.envoye ? 'auto' : 'incomplete',
    question: !devis,
  };
}

const eur = c => (c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';
/* chaque condition : remplie ou non, avec la phrase à montrer dans la simulation */
function examiner(r, p) {
  const c = [];
  if (r.montant.op) { const v = r.montant.val * 100, ok = r.montant.op === 'min' ? p.montantCents >= v : p.montantCents < v; c.push({ ok, txt: `montant ${r.montant.op === 'min' ? 'd’au moins' : 'de moins de'} ${eur(v)} (ici ${eur(p.montantCents)})` }); }
  if (r.invites.op) { const v = r.invites.val, n = p.invites; const ok = n != null && (r.invites.op === 'min' ? n >= v : n < v); c.push({ ok, txt: `${r.invites.op === 'min' ? 'au moins' : 'moins de'} ${v} personnes (ici ${n == null ? 'non indiqué' : n})` }); }
  if (r.delai.op) { const j = p.jours; const ok = j != null && (r.delai.op === 'moins' ? j >= 0 && j < r.delai.jours : j >= r.delai.jours); c.push({ ok, txt: `événement dans ${r.delai.op === 'moins' ? 'moins' : 'plus'} de ${r.delai.jours} jours (ici ${j == null ? 'date non indiquée' : j < 0 ? 'date passée' : j + ' jour' + (j > 1 ? 's' : '')})` }); }
  if (r.situation) c.push({ ok: p.situation === r.situation, txt: SITUATIONS[r.situation].toLowerCase() });
  return { ok: c.every(x => x.ok), conditions: c };
}

/* annuaire = liste des alertes + comptes de l'équipe : nom -> portable / e-mail */
function annuaire(R, users = []) {
  const m = new Map();
  for (const p of R?.alertes?.personnes || []) if (p?.nom) m.set(cle(p.nom), { nom: p.nom, tel: p.tel || '', email: p.email || '' });
  for (const u of users) if (u?.name && !u.disabled) { const k = cle(u.name), x = m.get(k); if (x) { x.tel ||= u.portable || ''; x.email ||= u.email || ''; } else m.set(k, { nom: u.name, tel: u.portable || '', email: u.email || '' }); }
  return m;
}

const canauxDe = c => c === 'email' ? ['email'] : c === 'sms' ? ['sms'] : ['email', 'sms'];
/* qui prévenir pour cette demande : [{ nom, email, tel, canaux: ['email','sms'], regles: ['Gros budget'] }] + le détail règle par règle */
function router(R, users, p) {
  const A = annuaire(R, users), regles = nettes(R?.alertes?.regles), out = new Map(), detail = [];
  const ajouter = (src, canal, pourquoi) => {
    const can = canauxDe(canal);
    const pose = (nom, tel, email) => {
      const k = (email && email.toLowerCase()) || String(tel || '').replace(/\D/g, '').slice(-9) || cle(nom);
      if (!k) return;
      const x = out.get(k) || { nom: nom || '', tel: '', email: '', canaux: [], regles: [], manque: [] };
      if (can.includes('email')) { if (email) { if (!x.canaux.includes('email')) { x.canaux.push('email'); x.email = email; } } else if (!x.manque.includes('e-mail')) x.manque.push('e-mail'); }
      if (can.includes('sms')) { if (tel) { if (!x.canaux.includes('sms')) { x.canaux.push('sms'); x.tel = tel; } } else if (!x.manque.includes('portable')) x.manque.push('portable'); }
      if (!x.regles.includes(pourquoi)) x.regles.push(pourquoi);
      if (!x.nom && nom) x.nom = nom;
      out.set(k, x);
    };
    for (const n of src.qui || []) { const a = A.get(cle(n)); if (a) pose(a.nom, a.tel, a.email); else pose(n, '', ''); }
    const libre = (nom, tel, email) => { pose(nom, tel, email); const k = (email && email.toLowerCase()) || String(tel).replace(/\D/g, '').slice(-9); const x = out.get(k); if (x) x.libre = true; };
    for (const t of liste(src.tels)) libre(t, t, '');
    for (const m of liste(src.emails).filter(isEmail)) libre(m, '', m);
  };
  let arret = false;
  regles.forEach((r, i) => {
    const nom = r.nom || 'Règle ' + (i + 1);
    if (!r.actif) return detail.push({ n: i + 1, nom, statut: 'inactive', conditions: [] });
    if (arret) return detail.push({ n: i + 1, nom, statut: 'sautee', conditions: [] });
    const ex = examiner(r, p);
    if (p.question && !r.situation && !r.montant.op && !r.invites.op && !r.delai.op) ex.ok = false; /* une simple question (formulaire Contact) passe par la règle par défaut */
    detail.push({ n: i + 1, nom, statut: ex.ok ? 'ok' : 'non', conditions: ex.conditions, canal: r.canal, stop: r.stop });
    if (!ex.ok) return;
    ajouter(r, r.canal, nom);
    if (r.stop) arret = true;
  });
  const parDefaut = !detail.some(d => d.statut === 'ok');
  if (parDefaut) {
    const d = defautNet(R?.alertes?.defaut);
    if (d.mode === 'tous') ajouter({ qui: [...A.values()].filter(x => (R?.alertes?.personnes || []).some(p => cle(p.nom) === cle(x.nom))).map(x => x.nom), tels: (R?.alertes?.personnes || []).filter(x => !x.nom).map(x => x.tel).join(','), emails: (R?.alertes?.personnes || []).filter(x => !x.nom).map(x => x.email).join(',') }, d.canal, 'Règle par défaut');
    else ajouter(d, d.canal, 'Règle par défaut');
    /* anciens réglages (avant la liste nominative) : simples cases e-mails / SMS */
    if (d.mode === 'tous' && !(R?.alertes?.personnes || []).length) ajouter({ tels: R?.alertes?.sms, emails: R?.alertes?.emails }, d.canal, 'Règle par défaut');
  }
  for (const x of out.values()) x.manque = x.libre ? [] : x.manque.filter(m => !(m === 'e-mail' ? x.canaux.includes('email') : x.canaux.includes('sms')));
  return { destinataires: [...out.values()], detail, parDefaut };
}

module.exports = { nette, nettes, defautNet, profil, examiner, router, annuaire, SITUATIONS, cle };
