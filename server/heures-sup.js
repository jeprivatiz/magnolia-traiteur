'use strict';
/*
 * Heures supplémentaires de l'équipe (Jean-Luc, 2026-11-27 ; journée normale 9 h – 18 h, corrigé le même jour) — Back-office › Équipe & activité.
 * Chacun déclare ses heures sup : jour, heure de début et de fin, sur quoi il a travaillé.
 * Règles : du lundi au vendredi, seulement AVANT 9 h ou APRÈS 18 h (la journée 9 h – 18 h = horaires normaux) ;
 * samedi et dimanche : toute la journée. Une plage qui finit avant son début passe minuit (ex. 22:00 → 01:00).
 * Chacun voit les siennes ; la personne qui gère l'équipe (droit « equipe ») voit tout, filtre et totalise.
 */
const MATIN = 9 * 60, SOIR = 18 * 60, JOUR = 24 * 60;
/* tâches proposées en cases à cocher (Jean-Luc, 2026-11-27) : terrain + actions du site (barème « Rémunération par action ») ;
   « Autre » ajoute une tâche à la liste pour la prochaine fois (document _hsTaches/perso) */
const TACHES = [
  { groupe: 'Sur l’événement', taches: ['Préparation en cuisine', 'Chargement du camion', 'Livraison', 'Installation et mise en place', 'Dressage des buffets', 'Service sur l’événement', 'Bar et boissons', 'Animation culinaire', 'Rangement et retour du matériel', 'Plonge et nettoyage'] },
  { groupe: 'Achats et stock', taches: ['Courses et achats fournisseurs', 'Inventaire (stock, cave, matériel)', 'Entretien du matériel et du camion'] },
  { groupe: 'Clients et devis', taches: ['Appels et rendez-vous clients', 'Fiches clients et entreprises', 'Création et envoi de devis', 'Relances clients', 'Envois groupés e-mail ou SMS', 'Visite de lieu avec un client'] },
  { groupe: 'Factures', taches: ['Factures et règlements'] },
  { groupe: 'Catalogue et site', taches: ['Fiches produits', 'Fiches lieux', 'Reportages du blog', 'Photos et textes du site'] },
  { groupe: 'Bureau', taches: ['Administratif et comptabilité', 'Réunion d’équipe'] },
];
const TOUTES = TACHES.flatMap(g => g.taches);
const cleT = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nomTache = t => { const x = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60); return x ? x[0].toLocaleUpperCase('fr-FR') + x.slice(1) : ''; };
const quoiDe = (taches, precision) => (taches || []).join(', ') + (precision ? (taches?.length ? ' — ' : '') + precision : '');
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const minutesDe = h => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const jourSem = d => new Date(d + 'T12:00:00Z').getUTCDay();
const lendemain = d => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
const semaine = d => { const j = jourSem(d); return j >= 1 && j <= 5; };
const duree = m => { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; };

/* plage [a, b[ en minutes sur un jour donné : en semaine, aucune minute entre 9 h et 18 h */
const horsJournee = (d, a, b) => !semaine(d) || b <= MATIN || a >= SOIR;

/* vérifie une déclaration ; rend { erreur } ou { date, debut, fin, minutes } */
function verifier({ date, debut, fin } = {}, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!dateOk(date)) return { erreur: 'Choisissez le jour où vous avez travaillé.' };
  if (date > aujourdhui) return { erreur: 'Ce jour n’est pas encore passé : on déclare les heures supplémentaires une fois faites.' };
  const a = minutesDe(debut), b0 = minutesDe(fin);
  if (a == null || b0 == null) return { erreur: 'Choisissez l’heure de début et l’heure de fin.' };
  if (a === b0) return { erreur: 'L’heure de fin doit être différente de l’heure de début.' };
  const nom = JOURS[jourSem(date)];
  const refus = `Le ${nom}, les heures supplémentaires ne peuvent être faites qu’avant 9 h ou après 18 h. Entre 9 h et 18 h, ce sont les horaires normaux de travail.`;
  if (b0 > a) {
    if (!horsJournee(date, a, b0)) return { erreur: refus + (semaine(date) && a < MATIN && b0 > MATIN ? ' Arrêtez la plage à 09:00, ou déclarez deux plages.' : semaine(date) && a < SOIR && b0 > SOIR ? ' Commencez la plage à 18:00.' : '') };
    return { date, debut: hhmm(a), fin: hhmm(b0), minutes: b0 - a };
  }
  /* passe minuit : [a, 24 h[ ce jour-là puis [0, b0[ le lendemain */
  if (!horsJournee(date, a, JOUR)) return { erreur: refus + ' Commencez la plage à 18:00 ou après.' };
  const d2 = lendemain(date);
  if (!horsJournee(d2, 0, b0)) return { erreur: `La plage continue le ${JOURS[jourSem(d2)]} matin après 9 h : arrêtez-la à 09:00 au plus tard.` };
  return { date, debut: hhmm(a), fin: hhmm(b0), minutes: JOUR - a + b0 };
}

/* ---------- « 🎤 Dire mes heures » : phrase dictée → jour, heures, tâches cochées (l'IA remplit, la personne valide) ---------- */
function promptDictee(texte, taches, aujourdhui) {
  const j = JOURS[jourSem(aujourdhui)];
  return `Un membre de l'équipe de Magnolia Traiteur dicte ses heures supplémentaires. Aujourd'hui, nous sommes le ${j} ${aujourdhui}.
Lis sa phrase et réponds UNIQUEMENT avec un objet JSON, sans texte autour :
{"date":"AAAA-MM-JJ","debut":"HH:MM","fin":"HH:MM","taches":[...],"autre":"","precision":""}
- date : le jour travaillé, jamais dans le futur. « hier », « mardi », « mardi dernier » = le plus récent jour passé (ou aujourd'hui) qui correspond. Si aucun jour n'est dit : aujourd'hui.
- debut / fin : heures sur 24 h (« 18 h » = 18:00, « 8 h du soir » = 20:00, « minuit » = 00:00). Si la personne donne une durée (« 2 heures à partir de 18 h »), calcule la fin. Laisse "" si l'heure n'est pas dite.
- taches : les noms EXACTS, copiés tels quels, des tâches de cette liste qui correspondent à ce qu'elle a fait (une ou plusieurs) : ${JSON.stringify(taches)}
- autre : seulement si ce qu'elle a fait ne correspond à AUCUNE tâche de la liste, un nom de tâche court (moins de 50 caractères) ; sinon "".
- precision : client, lieu ou détail utile cité (ex. « Mariage Dupont à Versailles ») ; sinon "".
N'invente rien.

Phrase dictée :
« ${String(texte).slice(0, 2000)} »`;
}
const quart = h => { const m = minutesDe(h); if (m == null) return ''; const r = Math.round(m / 15) * 15 % JOUR; return hhmm(r); };
function lireReponse(r, taches, aujourdhui) {
  const connues = new Map(taches.map(t => [cleT(t), t]));
  const T = [...new Set((Array.isArray(r?.taches) ? r.taches : []).map(t => connues.get(cleT(t))).filter(Boolean))];
  let autre = nomTache(r?.autre);
  if (autre && connues.has(cleT(autre))) { if (!T.includes(connues.get(cleT(autre)))) T.push(connues.get(cleT(autre))); autre = ''; }
  const date = dateOk(r?.date) && r.date <= aujourdhui ? r.date : aujourdhui;
  return { date, debut: quart(r?.debut), fin: quart(r?.fin), taches: T, autre, precision: String(r?.precision || '').trim().slice(0, 300) };
}

/* deux déclarations de la même personne qui se chevauchent */
const bornes = x => { const t = Date.parse(x.date + 'T00:00:00Z') / 6e4, a = minutesDe(x.debut); return [t + a, t + a + x.minutes]; };
const chevauche = (x, y) => { const [a, b] = bornes(x), [c, d] = bornes(y); return a < d && c < b; };

/* totaux par personne, triés du plus grand au plus petit */
function totaux(liste) {
  const m = new Map();
  for (const x of liste) { const k = x.uid || x.nom; const t = m.get(k) || { uid: x.uid, nom: x.nom, minutes: 0, nb: 0 }; t.minutes += x.minutes || 0; t.nb++; m.set(k, t); }
  return [...m.values()].sort((a, b) => b.minutes - a.minutes || String(a.nom).localeCompare(String(b.nom), 'fr'));
}

const crypto = require('crypto');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nouveauJeton = () => crypto.randomBytes(18).toString('base64url');

function routes(app, A, { sameSite, json, wrap, audit, store, brevo, ia, SITE, peutEquipe, log = console }) {
  const gere = req => !!req.ctx.droits?.equipe;
  const tout = async () => (await store.list('heuresSup')).map(d => ({ id: d.id, ...d.data })).filter(x => x.date);
  const lienDe = t => SITE + '/heures/' + t;
  const tachesPerso = async () => ((await store.get('_hsTaches/perso'))?.taches || []).filter(Boolean);
  const listeTaches = async () => { const p = await tachesPerso(); return p.length ? [...TACHES, { groupe: 'Ajoutées par l’équipe', taches: p }] : TACHES; };
  const ctxDe = (uid, u) => ({ uid, name: u.name || u.email, email: u.email, role: u.role });

  /* enregistre une déclaration (back-office ou mini-application) ; rend { erreur, status } ou la déclaration */
  async function creer(ctx, cible, b) {
    const v = verifier(b);
    if (v.erreur) return { erreur: v.erreur };
    /* tâches cochées (+ « Autre ») ; ancien champ libre « quoi » encore accepté */
    const perso = await tachesPerso();
    const connues = new Map([...TOUTES, ...perso].map(t => [cleT(t), t]));
    const taches = [];
    for (const t of Array.isArray(b.taches) ? b.taches.slice(0, 40) : []) { const n = connues.get(cleT(t)); if (n && !taches.includes(n)) taches.push(n); }
    const autre = nomTache(b.autre);
    if (autre) {
      const n = connues.get(cleT(autre)) || autre;
      if (!taches.includes(n)) taches.push(n);
      if (!connues.has(cleT(autre)) && perso.length < 200) await store.set('_hsTaches/perso', { taches: [...perso, autre] });
    }
    const precision = String(b.precision ?? (taches.length ? '' : b.quoi) ?? '').replace(/\r/g, '').trim().slice(0, 1000);
    if (!taches.length && precision.length < 3) return { erreur: 'Cochez au moins une tâche (ou « Autre » et écrivez-la).' };
    const quoi = quoiDe(taches, precision);
    const doublon = (await tout()).filter(x => x.uid === cible.uid).find(x => chevauche(x, v));
    if (doublon) return { erreur: `Cette plage chevauche une déclaration déjà faite (${doublon.date.split('-').reverse().join('/')}, ${doublon.debut} – ${doublon.fin}).` };
    const id = 'hs' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const x = { uid: cible.uid, nom: cible.nom, ...v, taches, precision, quoi, createdAt: new Date().toISOString(), par: ctx.name || ctx.email, ...(b.depuis ? { depuis: b.depuis } : {}) };
    await store.set('heuresSup/' + id, x);
    audit(ctx, 'heures supplémentaires déclarées', 'heuresSup/' + id, `${cible.nom} : ${v.date} ${v.debut} – ${v.fin} (${duree(v.minutes)})${b.depuis === 'telephone' ? ' · depuis son téléphone' : ''}`);
    return { id, ...x };
  }

  /* phrase dictée → cases remplies (rien n'est enregistré) */
  const parisAuj = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  async function dictee(req, res) {
    const texte = String(req.body?.texte || '').trim();
    if (texte.length < 4) return res.status(400).json({ error: 'Dites ou écrivez d’abord vos heures.' });
    if (!ia?.actif) return res.status(503).json({ error: 'L’IA n’est pas branchée : remplissez les cases à la main.' });
    const T = (await listeTaches()).flatMap(g => g.taches), auj = parisAuj();
    try {
      const r = IAjson(await ia.demander(promptDictee(texte, T, auj), { effort: 'low', maxTokens: 800 }));
      res.json({ ok: true, ...lireReponse(r, T, auj) });
    } catch (e) { log.error?.('[heures-sup] dictée', e.message); res.status(502).json({ error: 'L’IA n’a pas compris : réessayez ou remplissez les cases à la main.' }); }
  }
  const IAjson = t => { const x = String(t || ''), a = x.indexOf('{'), b = x.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('json'); return JSON.parse(x.slice(a, b + 1)); };
  A.post('/actions/heures-sup/dictee', sameSite, json, peutEquipe, wrap(dictee));

  /* ---------- back-office ---------- */
  A.get('/actions/heures-sup', wrap(async (req, res) => {
    const q = req.query || {}, admin = gere(req);
    if (!admin) return res.status(403).json({ error: 'Réservé au manager. Déclarez vos heures avec votre lien personnel sur le téléphone.' });
    let L = await tout();
    if (!admin) L = L.filter(x => x.uid === req.ctx.uid);
    else if (q.qui) L = L.filter(x => x.uid === String(q.qui));
    if (dateOk(q.du)) L = L.filter(x => x.date >= q.du);
    if (dateOk(q.au)) L = L.filter(x => x.date <= q.au);
    L.sort((a, b) => b.date.localeCompare(a.date) || String(b.debut).localeCompare(String(a.debut)));
    const users = (await store.list('_users')).filter(d => d.data && (admin || d.id === req.ctx.uid));
    const liens = users.map(d => ({ uid: d.id, nom: d.data.name || d.data.email, portable: d.data.portable || '', desactive: !!d.data.disabled, lien: d.data.hsLien ? lienDe(d.data.hsLien) : '', lienEnvoyeLe: d.data.hsLienEnvoyeLe || '' }));
    res.json({ admin, liste: L, totaux: totaux(L), minutes: L.reduce((s, x) => s + (x.minutes || 0), 0), liens, taches: await listeTaches() });
  }));

  A.post('/actions/heures-sup', sameSite, json, wrap(async (req, res) => {
    const b = req.body || {};
    let cible = { uid: req.ctx.uid, nom: req.ctx.name || req.ctx.email };
    if (b.uid && b.uid !== req.ctx.uid) {
      if (!gere(req)) return res.status(403).json({ error: 'Vous ne pouvez déclarer que vos propres heures.' });
      const u = await store.get('_users/' + String(b.uid));
      if (!u) return res.status(400).json({ error: 'Personne introuvable.' });
      cible = { uid: String(b.uid), nom: u.name || u.email };
    }
    const r = await creer(req.ctx, cible, { ...b, depuis: '' });
    if (r.erreur) return res.status(400).json({ error: r.erreur });
    res.json({ ok: true, ...r });
  }));

  A.delete('/actions/heures-sup/:id', sameSite, wrap(async (req, res) => {
    const x = await store.get('heuresSup/' + req.params.id);
    if (!x) return res.status(404).json({ error: 'Déclaration introuvable.' });
    if (!gere(req)) return res.status(403).json({ error: 'Seul le manager peut supprimer une déclaration.' });
    await store.delete('heuresSup/' + req.params.id);
    audit(req.ctx, 'heures supplémentaires retirées', 'heuresSup/' + req.params.id, `${x.nom} : ${x.date} ${x.debut} – ${x.fin}`);
    res.json({ ok: true });
  }));

  A.post('/actions/heures-sup/supprimer', sameSite, json, peutEquipe, wrap(async (req, res) => {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))].slice(0, 500);
    let n = 0;
    for (const id of ids) {
      const x = await store.get('heuresSup/' + id); if (!x) continue;
      await store.delete('heuresSup/' + id); n++;
      audit(req.ctx, 'heures supplémentaires supprimées', 'heuresSup/' + id, `${x.nom} : ${x.date} ${x.debut} – ${x.fin}`);
    }
    res.json({ ok: true, supprimees: n });
  }));

  /* lien personnel de la mini-application : créé au besoin, envoyé par SMS ; « nouveau » coupe l'ancien lien */
  async function preparerLien(uid, { nouveau = false } = {}) {
    const u = await store.get('_users/' + uid);
    if (!u) return null;
    if (!u.hsLien || nouveau) { u.hsLien = nouveauJeton(); await store.set('_users/' + uid, u); }
    return u;
  }
  async function envoyerLien(ctx, uid, u) {
    if (!u.portable) return { erreur: 'pas de portable sur son compte' };
    const prenom = u.prenom || String(u.name || '').split(' ')[0] || '';
    const r = await brevo.sendSms({ to: u.portable, lien: false, content: `Magnolia Traiteur : bonjour ${prenom}, voici votre lien personnel pour déclarer vos heures supplémentaires depuis votre portable : ${lienDe(u.hsLien)} Sur iPhone : Partager puis « Sur l'écran d'accueil ». Ne le transmettez à personne.` }).catch(e => ({ error: e.message }));
    if (r?.error || r?.skipped) return { erreur: r.error || r.skipped };
    await store.set('_users/' + uid, { ...u, hsLienEnvoyeLe: new Date().toISOString() });
    audit(ctx, 'lien heures sup envoyé par SMS', '_users/' + uid, (u.name || u.email) + ' · ' + u.portable);
    return { ok: true };
  }
  A.post('/actions/heures-sup/lien/:uid', sameSite, json, wrap(async (req, res) => {
    const soi = req.params.uid === req.ctx.uid;
    if (!soi && !gere(req)) return res.status(403).json({ error: 'Réservé aux personnes qui gèrent l’équipe.' });
    const u = await preparerLien(req.params.uid, { nouveau: !!req.body?.nouveau });
    if (!u) return res.status(404).json({ error: 'Personne introuvable.' });
    if (req.body?.nouveau) audit(req.ctx, 'nouveau lien heures sup (ancien coupé)', '_users/' + req.params.uid, u.name || u.email);
    let sms = null;
    if (req.body?.sms) { sms = await envoyerLien(req.ctx, req.params.uid, u); if (sms.erreur) return res.status(400).json({ error: 'SMS non envoyé : ' + sms.erreur + '.', lien: lienDe(u.hsLien) }); }
    res.json({ ok: true, lien: lienDe(u.hsLien), sms: !!sms, live: !!brevo.live });
  }));
  A.post('/actions/heures-sup/liens-sms', sameSite, json, peutEquipe, wrap(async (req, res) => {
    const envoyes = [], rates = [];
    for (const d of await store.list('_users')) {
      if (!d.data || d.data.disabled) continue;
      const u = await preparerLien(d.id);
      const r = await envoyerLien(req.ctx, d.id, u);
      (r.ok ? envoyes : rates).push({ nom: u.name || u.email, raison: r.erreur || '' });
    }
    res.json({ ok: true, envoyes, rates, live: !!brevo.live });
  }));

  /* ---------- mini-application téléphone : /heures/<lien personnel> ---------- */
  const parJeton = async t => {
    if (!/^[\w-]{20,40}$/.test(String(t || ''))) return null;
    const d = (await store.list('_users')).find(x => x.data?.hsLien === t);
    return d && !d.data.disabled ? { uid: d.id, u: d.data } : null;
  };
  const noStore = res => res.set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex').set('Referrer-Policy', 'no-referrer');
  app.get('/heures/:t/manifest.webmanifest', wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).end();
    noStore(res).type('application/manifest+json').send(JSON.stringify({ name: 'Mes heures sup · Magnolia', short_name: 'Heures sup', start_url: '/heures/' + req.params.t, scope: '/heures/' + req.params.t, display: 'standalone', background_color: '#f6f1e6', theme_color: '#1f3b2d', lang: 'fr', icons: [{ src: '/apple-icon.png', sizes: '180x180', type: 'image/png' }] }));
  }));
  app.get('/heures/:t', wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    noStore(res).type('html');
    if (!p) return res.status(404).send(pageMobile({ invalide: true }));
    res.send(pageMobile({ jeton: req.params.t, nom: p.u.prenom || p.u.name || '' }));
  }));
  app.get('/api/heures/:t', wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).json({ error: 'Lien invalide ou coupé : demandez un nouveau lien à votre responsable.' });
    const mien = (await tout()).filter(x => x.uid === p.uid).sort((a, b) => b.date.localeCompare(a.date) || String(b.debut).localeCompare(String(a.debut)));
    const auj = parisAuj(), mois = auj.slice(0, 7), d = new Date(auj.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1);
    const moisP = d.toISOString().slice(0, 7);
    const rec = L => ({ nb: L.length, minutes: L.reduce((s, x) => s + (x.minutes || 0), 0) });
    const recap = { mois: rec(mien.filter(x => x.date.startsWith(mois))), moisP: rec(mien.filter(x => x.date.startsWith(moisP))), tout: rec(mien) };
    noStore(res).json({ nom: p.u.name || '', taches: await listeTaches(), liste: mien.slice(0, 30).map(({ uid, ...x }) => x), recap, moisMinutes: recap.mois.minutes });
  }));
  const essais = new Map(); /* 40 dictées par heure et par lien, au plus */
  app.post('/api/heures/:t/dictee', sameSite, json, wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).json({ error: 'Lien invalide ou coupé : demandez un nouveau lien à votre responsable.' });
    const h = Math.floor(Date.now() / 36e5), e = essais.get(p.uid);
    const n = e && e.h === h ? e.n + 1 : 1; essais.set(p.uid, { h, n });
    if (n > 40) return res.status(429).json({ error: 'Trop d’essais : remplissez les cases à la main.' });
    return dictee(req, res);
  }));
  app.post('/api/heures/:t', sameSite, json, wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).json({ error: 'Lien invalide ou coupé : demandez un nouveau lien à votre responsable.' });
    const r = await creer(ctxDe(p.uid, p.u), { uid: p.uid, nom: p.u.name || p.u.email }, { ...(req.body || {}), depuis: 'telephone' });
    if (r.erreur) return res.status(400).json({ error: r.erreur });
    res.json({ ok: true, ...r });
  }));
}

/* page de la mini-application (téléphone d'abord, installable sur l'écran d'accueil) */
function pageMobile({ jeton = '', nom = '', invalide = false }) {
  const tete = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>Mes heures sup · Magnolia</title>
<meta name="theme-color" content="#1f3b2d"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Heures sup"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/apple-icon.png">${jeton ? `<link rel="manifest" href="/heures/${esc(jeton)}/manifest.webmanifest">` : ''}
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@500;600&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--vert:#1f3b2d;--vert2:#2d5640;--creme:#f6f1e6;--or:#b8913a;--txt:#1d2a22;--gris:#5d6a62;--rouge:#b3261e}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--creme);color:var(--txt);font:16px/1.45 Poppins,system-ui,sans-serif;padding:env(safe-area-inset-top) 0 calc(24px + env(safe-area-inset-bottom))}
header{background:var(--vert);color:#fff;padding:22px 18px 18px;border-bottom:3px solid var(--or)}header small{color:#e8d7a9;letter-spacing:.08em;text-transform:uppercase;font-size:12px}header h1{font:600 24px/1.2 Jost,sans-serif;margin:4px 0 0}
main{padding:16px;max-width:520px;margin:0 auto}.carte{background:#fff;border-radius:16px;padding:16px;box-shadow:0 2px 10px rgba(31,59,45,.08);margin-bottom:16px}
h2{font:600 18px Jost,sans-serif;margin:0 0 10px;color:var(--vert)}label{display:block;font-weight:500;margin:12px 0 6px}
input,select,textarea{width:100%;font:inherit;font-size:17px;padding:12px;border:2px solid #cfd8d2;border-radius:12px;background:#fbfdfb;color:var(--txt);-webkit-appearance:none;appearance:none}
select{background:#fbfdfb url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9'%3E%3Cpath d='M1 1l6 6 6-6' stroke='%231f3b2d' stroke-width='2' fill='none'/%3E%3C/svg%3E") no-repeat right 14px center;padding-right:36px}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--vert2);box-shadow:0 0 0 3px rgba(45,86,64,.15)}textarea{min-height:110px;resize:vertical}
.deux{display:grid;grid-template-columns:1fr 1fr;gap:10px}.regle{background:#f1ecdf;border-left:4px solid var(--or);border-radius:8px;padding:10px 12px;font-size:14px;color:#4a4330}
.duree{margin-top:10px;font-weight:600;color:var(--vert)}.err{color:var(--rouge);font-weight:500;margin-top:10px}.ok{background:#e5f2e8;color:#1f5130;border-radius:10px;padding:10px 12px;margin-top:10px;font-weight:500}
button{font:600 17px Poppins,sans-serif;border:0;border-radius:14px;padding:15px;width:100%;cursor:pointer}.go{background:var(--vert);color:#fff;margin-top:16px}.go:disabled{opacity:.6}
.micro{width:auto;padding:8px 12px;font-size:14px;background:#efe6cf;color:var(--vert);border-radius:10px;margin-top:8px}.micro.on{background:var(--rouge);color:#fff}
fieldset{border:0;padding:0;margin:12px 0 0}legend{font-weight:500;padding:0;margin-bottom:6px}legend small,label small{font-weight:400;color:var(--gris)}
.gt{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--or);font-weight:600;margin:12px 0 6px}
.tache{display:flex;align-items:center;gap:10px;margin:6px 0;padding:10px 12px;border:2px solid #cfd8d2;border-radius:12px;background:#fbfdfb;font-weight:400}
.tache input{width:22px;height:22px;flex:none;-webkit-appearance:auto;appearance:auto;accent-color:var(--vert);margin:0;padding:0}.tache.on{border-color:var(--vert2);background:#eaf3ec}
#autreBloc input{margin-top:6px}
.autre-jour{display:block;margin-top:10px;background:var(--vert);color:#fff;font-size:16px;padding:12px}
.recap{width:100%;border-collapse:collapse;font-size:15px}.recap th{text-align:left;font-weight:500;padding:8px 0;border-top:1px solid #e7ebe8}.recap td{padding:8px 0 8px 8px;border-top:1px solid #e7ebe8;text-align:right;color:var(--gris)}.recap tr:first-child th,.recap tr:first-child td{border-top:0}.recap b{color:var(--vert);font-size:17px}.dur{color:var(--vert)}
.dire{background:#f1ecdf;border-radius:14px;padding:12px;margin-bottom:6px;text-align:center}.dire-btn{background:var(--or);color:#fff;font-size:19px;padding:16px}.dire-btn.on{background:var(--rouge)}.dire-aide{font-size:13px;color:var(--gris);margin:8px 0 0}
#phrase{margin-top:10px;min-height:70px}#dmsg{font-size:14px;margin-top:8px}
ul{list-style:none;margin:0;padding:0}li{border-top:1px solid #e7ebe8;padding:10px 0;display:flex;gap:10px;align-items:flex-start}li:first-child{border-top:0}li div{flex:1}li b{color:var(--vert)}li p{margin:2px 0 0;font-size:14px;color:var(--gris);white-space:pre-line}
.suppr{width:auto;background:none;color:var(--rouge);font-size:14px;padding:4px 6px}.total{font-size:15px;color:var(--gris);margin:0 0 6px}.astuce{font-size:13px;color:var(--gris);text-align:center;margin-top:6px}
</style></head><body>`;
  if (invalide) return tete + `<header><small>Magnolia Traiteur</small><h1>Lien invalide</h1></header><main><div class="carte"><p>Ce lien n’existe pas ou a été remplacé par un nouveau. Demandez à votre responsable de vous renvoyer votre lien par SMS.</p></div></main></body></html>`;
  const opts = [];
  for (let m = 0; m < JOUR; m += 15) opts.push(`<option value="${hhmm(m)}">${hhmm(m).replace(':', ' h ')}</option>`);
  return tete + `<header><small>Magnolia Traiteur</small><h1>Bonjour ${esc(nom)}, vos heures supplémentaires</h1></header>
<main>
<form class="carte" id="f" novalidate><h2>Déclarer des heures</h2>
<div class="dire"><button type="button" class="dire-btn" id="dire">🎤 Dire mes heures</button><p class="dire-aide">ex. « J’ai travaillé mardi de 18 h à 20 h sur la création de fiches produits »</p>
<textarea id="phrase" placeholder="Ou écrivez votre phrase ici, puis touchez « Remplir les cases »" hidden></textarea><button type="button" class="micro" id="remplir" hidden>✨ Remplir les cases</button><div id="dmsg" aria-live="polite"></div></div>
<p class="regle">Du lundi au vendredi : seulement <b>avant 9 h</b> ou <b>après 18 h</b>. Le samedi et le dimanche : toute la journée.</p>
<label for="date">Jour travaillé</label><input type="date" id="date" name="date" required>
<div class="deux"><div><label for="debut">De</label><select id="debut" name="debut">${opts.join('')}</select></div><div><label for="fin">À</label><select id="fin" name="fin">${opts.join('')}</select></div></div>
<div class="duree" id="duree" aria-live="polite"></div>
<fieldset class="taches"><legend>Sur quoi avez-vous travaillé ? <small>(cochez une ou plusieurs cases)</small></legend><div id="taches">Chargement…</div>
<label class="tache"><input type="checkbox" id="autreChk"> <span>Autre…</span></label>
<div id="autreBloc" hidden><input id="autre" maxlength="60" placeholder="Écrivez la tâche (elle sera ajoutée à la liste)"></div></fieldset>
<label for="quoi">Précision <small>(facultatif : client, lieu…)</small></label><textarea id="quoi" name="quoi" placeholder="ex. Mariage Dupont à Versailles"></textarea>
<button type="button" class="micro" id="micro">🎤 Dicter</button>
<div id="msg" aria-live="polite"></div>
<button class="go" id="go">Valider mes heures</button></form>
<section class="carte"><h2>Mon récapitulatif</h2><table class="recap" id="recap"></table></section>
<section class="carte"><h2>Mes dernières déclarations</h2><ul id="liste"><li><div>Chargement…</div></li></ul></section>
<p class="astuce">Une erreur ? Prévenez votre responsable : lui seul peut supprimer une déclaration.</p>
<p class="astuce">Astuce iPhone : touchez « Partager » puis « Sur l’écran d’accueil » pour garder cette page comme une application.</p>
</main>
<script>
(function(){
var API='/api/heures/${esc(jeton)}', $=function(s){return document.querySelector(s)};
var JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function auj(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function min(h){var p=h.split(':');return +p[0]*60+ +p[1]}
function duree(m){if(!m)return '0 h';var h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+String(r).padStart(2,'0'):''):r+' min'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function jsem(d){return new Date(d+'T12:00:00').getDay()}
function dateFr(d){var j=jsem(d);var p=d.split('-');return JOURS[j]+' '+(+p[2])+'/'+p[1]}
$('#date').value=auj();$('#date').max=auj();
function defaut(){var we=[0,6].indexOf(jsem($('#date').value||auj()))>=0;if(!$('#debut').dataset.touche){$('#debut').value=we?'09:00':'18:00';$('#fin').value=we?'13:00':'20:00'}verif()}
function verif(){var d=$('#date').value,a=min($('#debut').value),b=min($('#fin').value),el=$('#duree'),err='';
 if(!d){el.textContent='';return ''}
 var sem=jsem(d)>=1&&jsem(d)<=5,m=b>a?b-a:1440-a+b;
 if(a===b)err='L’heure de fin doit être différente de l’heure de début.';
 else if(sem&&b>a&&!(b<=540||a>=1080))err='Le '+JOURS[jsem(d)]+', les heures supplémentaires ne peuvent être faites qu’avant 9 h ou après 18 h.';
 else if(sem&&b<a&&a<1080)err='Le '+JOURS[jsem(d)]+', une plage qui passe minuit doit commencer à 18 h ou après.';
 el.className=err?'err':'duree';el.textContent=err||('Durée : '+duree(m)+(b<a?' (jusqu’au lendemain)':''));return err}
$('#date').addEventListener('change',defaut);['#debut','#fin'].forEach(function(s){$(s).addEventListener('change',function(){$(s).dataset.touche='1';verif()})});defaut();
function charger(){fetch(API,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
 if(j.taches&&!document.querySelector('#taches input'))cases(j.taches);
 if(j.error){$('#liste').innerHTML='<li><div class="err">'+esc(j.error)+'</div></li>';return}
 var R=j.recap||{},lig=function(t,x){x=x||{nb:0,minutes:0};return '<tr><th>'+t+'</th><td>'+x.nb+' déclaration'+(x.nb>1?'s':'')+'</td><td><b>'+duree(x.minutes)+'</b></td></tr>'};
 $('#recap').innerHTML=lig('Ce mois-ci',R.mois)+lig('Le mois dernier',R.moisP)+lig('Depuis le début',R.tout);
 $('#liste').innerHTML=j.liste.length?j.liste.map(function(x){return '<li><div><b>'+dateFr(x.date)+'</b><br>'+x.debut.replace(':',' h ')+' → '+x.fin.replace(':',' h ')+' · <b class="dur">'+duree(x.minutes)+'</b><p>'+esc(x.quoi)+'</p></div></li>'}).join(''):'<li><div>Aucune déclaration pour l’instant.</div></li>';
})}
function cases(T){$('#taches').innerHTML=T.map(function(g){return '<p class="gt">'+esc(g.groupe)+'</p>'+g.taches.map(function(t){return '<label class="tache"><input type="checkbox" name="t" value="'+esc(t)+'"> <span>'+esc(t)+'</span></label>'}).join('')}).join('')}
document.addEventListener('change',function(e){var c=e.target.closest('.tache input');if(c)c.closest('.tache').classList.toggle('on',c.checked);if(e.target.id==='autreChk'){$('#autreBloc').hidden=!e.target.checked;if(e.target.checked)$('#autre').focus()}});
function cochees(){return Array.prototype.map.call(document.querySelectorAll('#taches input:checked'),function(c){return c.value})}
$('#f').addEventListener('submit',function(e){e.preventDefault();var m=$('#msg');m.className='';m.textContent='';
 var err=verif();if(err){m.className='err';m.textContent=err;return}
 var autre=$('#autreChk').checked?$('#autre').value.trim():'';
 if($('#autreChk').checked&&autre.length<2){m.className='err';m.textContent='Écrivez la tâche « Autre ».';$('#autre').focus();return}
 if(!cochees().length&&!autre){m.className='err';m.textContent='Cochez au moins une tâche.';return}
 $('#go').disabled=true;$('#go').textContent='Envoi…';
 fetch(API,{method:'POST',headers:{'content-type':'application/json','x-mg':'1'},body:JSON.stringify({date:$('#date').value,debut:$('#debut').value,fin:$('#fin').value,taches:cochees(),autre:autre,precision:$('#quoi').value})}).then(function(r){return r.json()}).then(function(j){
  if(j.error){m.className='err';m.textContent=j.error}else{m.className='ok';m.innerHTML='✅ C’est enregistré à votre nom : '+dateFr(j.date)+', '+j.debut.replace(':',' h ')+' → '+j.fin.replace(':',' h ')+' · <b>'+duree(j.minutes)+'</b>.<button type="button" class="autre-jour" id="autreJour">+ Déclarer un autre jour</button>';$('#quoi').value='';$('#autre').value='';$('#autreChk').checked=false;$('#autreBloc').hidden=true;Array.prototype.forEach.call(document.querySelectorAll('.tache input'),function(c){c.checked=false;c.closest('.tache').classList.remove('on')});if(autre)$('#taches').innerHTML='';charger()}
 }).catch(function(){m.className='err';m.textContent='Pas de connexion : réessayez dans un instant.'}).then(function(){$('#go').disabled=false;$('#go').textContent='Valider mes heures'})});
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null;
$('#micro').addEventListener('click',function(){var bt=this;if(rec){rec.stop();return}
 if(!SR){alert('Touchez le micro 🎤 du clavier de votre téléphone pour dicter.');$('#quoi').focus();return}
 rec=new SR();rec.lang='fr-FR';rec.interimResults=false;rec.continuous=true;var base=$('#quoi').value;
 rec.onresult=function(ev){var t='';for(var i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;$('#quoi').value=(base?base+' ':'')+t};
 rec.onend=function(){rec=null;bt.classList.remove('on');bt.textContent='🎤 Dicter'};
 try{rec.start();bt.classList.add('on');bt.textContent='■ Arrêter la dictée'}catch(e){rec=null}});
/* « Dire mes heures » : dictée → l'IA remplit jour, heures et cases ; la personne vérifie puis valide */
function remplir(){var t=$('#phrase').value.trim(),d=$('#dmsg');if(t.length<4){d.className='err';d.textContent='Dites ou écrivez d’abord vos heures.';return}
 d.className='';d.textContent='✨ Je remplis les cases…';
 fetch(API+'/dictee',{method:'POST',headers:{'content-type':'application/json','x-mg':'1'},body:JSON.stringify({texte:t})}).then(function(r){return r.json()}).then(function(j){
  if(j.error){d.className='err';d.textContent=j.error;return}
  $('#date').value=j.date;if(j.debut){$('#debut').value=j.debut;$('#debut').dataset.touche='1'}if(j.fin){$('#fin').value=j.fin;$('#fin').dataset.touche='1'}
  Array.prototype.forEach.call(document.querySelectorAll('#taches input'),function(c){c.checked=j.taches.indexOf(c.value)>=0;c.closest('.tache').classList.toggle('on',c.checked)});
  $('#autreChk').checked=!!j.autre;$('#autreBloc').hidden=!j.autre;$('#autre').value=j.autre||'';$('#autreChk').closest('.tache').classList.toggle('on',!!j.autre);
  if(j.precision)$('#quoi').value=j.precision;
  var err=verif();d.className=err?'err':'ok';d.textContent=err?err:'✅ Cases remplies : vérifiez, puis touchez « Valider mes heures ».'+(j.debut&&j.fin?'':' Choisissez les heures qui manquent.');
 }).catch(function(){d.className='err';d.textContent='Pas de connexion : réessayez.'})}
$('#remplir').addEventListener('click',remplir);
/* « + Déclarer un autre jour » : formulaire remis à zéro, retour en haut */
document.addEventListener('click',function(e){if(e.target.id!=='autreJour')return;$('#msg').className='';$('#msg').textContent='';$('#dmsg').textContent='';$('#phrase').value='';$('#date').value=auj();delete $('#debut').dataset.touche;defaut();window.scrollTo({top:0,behavior:'smooth'});setTimeout(function(){$('#date').focus()},400)});
var rec2=null;
$('#dire').addEventListener('click',function(){var bt=this;
 if(rec2){rec2.stop();return}
 $('#phrase').hidden=false;$('#remplir').hidden=false;
 if(!SR){$('#dmsg').className='';$('#dmsg').textContent='Touchez la case ci-dessous puis le micro 🎤 du clavier pour dicter, et « Remplir les cases ».';$('#phrase').focus();return}
 rec2=new SR();rec2.lang='fr-FR';rec2.interimResults=true;rec2.continuous=false;var fin='';
 rec2.onresult=function(ev){var t='';for(var i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;$('#phrase').value=t;fin=t};
 rec2.onerror=function(ev){$('#dmsg').className='err';$('#dmsg').textContent=ev.error==='not-allowed'||ev.error==='service-not-allowed'?'Le micro est bloqué : autorisez-le, ou écrivez votre phrase.':'Je n’ai pas bien entendu : réessayez ou écrivez votre phrase.'};
 rec2.onend=function(){rec2=null;bt.classList.remove('on');bt.textContent='🎤 Dire mes heures';if(fin.trim())remplir()};
 try{rec2.start();bt.classList.add('on');bt.textContent='■ J’écoute… touchez pour arrêter';$('#dmsg').className='';$('#dmsg').textContent=''}catch(e){rec2=null}});
charger();
})();
</script></body></html>`;
}

module.exports = { TACHES, promptDictee, lireReponse, verifier, totaux, duree, chevauche, routes, pageMobile, MATIN, SOIR };
