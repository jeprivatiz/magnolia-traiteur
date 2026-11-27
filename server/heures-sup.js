'use strict';
/*
 * Heures supplémentaires de l'équipe (Jean-Luc, 2026-11-27) — Back-office › Équipe & activité.
 * Chacun déclare ses heures sup : jour, heure de début et de fin, sur quoi il a travaillé.
 * Règles : du lundi au vendredi, seulement AVANT 8 h ou APRÈS 18 h (la journée 8 h – 18 h = horaires normaux) ;
 * samedi et dimanche : toute la journée. Une plage qui finit avant son début passe minuit (ex. 22:00 → 01:00).
 * Chacun voit les siennes ; la personne qui gère l'équipe (droit « equipe ») voit tout, filtre et totalise.
 */
const MATIN = 8 * 60, SOIR = 18 * 60, JOUR = 24 * 60;
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const minutesDe = h => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(h || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const jourSem = d => new Date(d + 'T12:00:00Z').getUTCDay();
const lendemain = d => new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
const semaine = d => { const j = jourSem(d); return j >= 1 && j <= 5; };
const duree = m => { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; };

/* plage [a, b[ en minutes sur un jour donné : en semaine, aucune minute entre 8 h et 18 h */
const horsJournee = (d, a, b) => !semaine(d) || b <= MATIN || a >= SOIR;

/* vérifie une déclaration ; rend { erreur } ou { date, debut, fin, minutes } */
function verifier({ date, debut, fin } = {}, aujourdhui = new Date().toISOString().slice(0, 10)) {
  if (!dateOk(date)) return { erreur: 'Choisissez le jour où vous avez travaillé.' };
  if (date > aujourdhui) return { erreur: 'Ce jour n’est pas encore passé : on déclare les heures supplémentaires une fois faites.' };
  const a = minutesDe(debut), b0 = minutesDe(fin);
  if (a == null || b0 == null) return { erreur: 'Choisissez l’heure de début et l’heure de fin.' };
  if (a === b0) return { erreur: 'L’heure de fin doit être différente de l’heure de début.' };
  const nom = JOURS[jourSem(date)];
  const refus = `Le ${nom}, les heures supplémentaires ne peuvent être faites qu’avant 8 h ou après 18 h. Entre 8 h et 18 h, ce sont les horaires normaux de travail.`;
  if (b0 > a) {
    if (!horsJournee(date, a, b0)) return { erreur: refus + (semaine(date) && a < MATIN && b0 > MATIN ? ' Arrêtez la plage à 08:00, ou déclarez deux plages.' : semaine(date) && a < SOIR && b0 > SOIR ? ' Commencez la plage à 18:00.' : '') };
    return { date, debut: hhmm(a), fin: hhmm(b0), minutes: b0 - a };
  }
  /* passe minuit : [a, 24 h[ ce jour-là puis [0, b0[ le lendemain */
  if (!horsJournee(date, a, JOUR)) return { erreur: refus + ' Commencez la plage à 18:00 ou après.' };
  const d2 = lendemain(date);
  if (!horsJournee(d2, 0, b0)) return { erreur: `La plage continue le ${JOURS[jourSem(d2)]} matin après 8 h : arrêtez-la à 08:00 au plus tard.` };
  return { date, debut: hhmm(a), fin: hhmm(b0), minutes: JOUR - a + b0 };
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

function routes(app, A, { sameSite, json, wrap, audit, store, brevo, SITE, peutEquipe, log = console }) {
  const gere = req => !!req.ctx.droits?.equipe;
  const tout = async () => (await store.list('heuresSup')).map(d => ({ id: d.id, ...d.data })).filter(x => x.date);
  const lienDe = t => SITE + '/heures/' + t;
  const ctxDe = (uid, u) => ({ uid, name: u.name || u.email, email: u.email, role: u.role });

  /* enregistre une déclaration (back-office ou mini-application) ; rend { erreur, status } ou la déclaration */
  async function creer(ctx, cible, b) {
    const v = verifier(b);
    if (v.erreur) return { erreur: v.erreur };
    const quoi = String(b.quoi || '').replace(/\r/g, '').trim().slice(0, 2000);
    if (quoi.length < 3) return { erreur: 'Indiquez sur quoi vous avez travaillé.' };
    const doublon = (await tout()).filter(x => x.uid === cible.uid).find(x => chevauche(x, v));
    if (doublon) return { erreur: `Cette plage chevauche une déclaration déjà faite (${doublon.date.split('-').reverse().join('/')}, ${doublon.debut} – ${doublon.fin}).` };
    const id = 'hs' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
    const x = { uid: cible.uid, nom: cible.nom, ...v, quoi, createdAt: new Date().toISOString(), par: ctx.name || ctx.email, ...(b.depuis ? { depuis: b.depuis } : {}) };
    await store.set('heuresSup/' + id, x);
    audit(ctx, 'heures supplémentaires déclarées', 'heuresSup/' + id, `${cible.nom} : ${v.date} ${v.debut} – ${v.fin} (${duree(v.minutes)})${b.depuis === 'telephone' ? ' · depuis son téléphone' : ''}`);
    return { id, ...x };
  }

  /* ---------- back-office ---------- */
  A.get('/actions/heures-sup', wrap(async (req, res) => {
    const q = req.query || {}, admin = gere(req);
    let L = await tout();
    if (!admin) L = L.filter(x => x.uid === req.ctx.uid);
    else if (q.qui) L = L.filter(x => x.uid === String(q.qui));
    if (dateOk(q.du)) L = L.filter(x => x.date >= q.du);
    if (dateOk(q.au)) L = L.filter(x => x.date <= q.au);
    L.sort((a, b) => b.date.localeCompare(a.date) || String(b.debut).localeCompare(String(a.debut)));
    const users = (await store.list('_users')).filter(d => d.data && (admin || d.id === req.ctx.uid));
    const liens = users.map(d => ({ uid: d.id, nom: d.data.name || d.data.email, portable: d.data.portable || '', desactive: !!d.data.disabled, lien: d.data.hsLien ? lienDe(d.data.hsLien) : '', lienEnvoyeLe: d.data.hsLienEnvoyeLe || '' }));
    res.json({ admin, liste: L, totaux: totaux(L), minutes: L.reduce((s, x) => s + (x.minutes || 0), 0), liens });
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
    if (x.uid !== req.ctx.uid && !gere(req)) return res.status(403).json({ error: 'Vous ne pouvez retirer que vos propres heures.' });
    await store.delete('heuresSup/' + req.params.id);
    audit(req.ctx, 'heures supplémentaires retirées', 'heuresSup/' + req.params.id, `${x.nom} : ${x.date} ${x.debut} – ${x.fin}`);
    res.json({ ok: true });
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
    const mois = new Date().toISOString().slice(0, 7);
    noStore(res).json({ nom: p.u.name || '', liste: mien.slice(0, 30).map(({ uid, ...x }) => x), moisMinutes: mien.filter(x => x.date.startsWith(mois)).reduce((s, x) => s + x.minutes, 0) });
  }));
  app.post('/api/heures/:t', sameSite, json, wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).json({ error: 'Lien invalide ou coupé : demandez un nouveau lien à votre responsable.' });
    const r = await creer(ctxDe(p.uid, p.u), { uid: p.uid, nom: p.u.name || p.u.email }, { ...(req.body || {}), depuis: 'telephone' });
    if (r.erreur) return res.status(400).json({ error: r.erreur });
    res.json({ ok: true, ...r });
  }));
  app.delete('/api/heures/:t/:id', sameSite, wrap(async (req, res) => {
    const p = await parJeton(req.params.t);
    if (!p) return res.status(404).json({ error: 'Lien invalide.' });
    const x = await store.get('heuresSup/' + req.params.id);
    if (!x || x.uid !== p.uid) return res.status(404).json({ error: 'Déclaration introuvable.' });
    await store.delete('heuresSup/' + req.params.id);
    audit(ctxDe(p.uid, p.u), 'heures supplémentaires retirées', 'heuresSup/' + req.params.id, `${x.nom} : ${x.date} ${x.debut} – ${x.fin} · depuis son téléphone`);
    res.json({ ok: true });
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
ul{list-style:none;margin:0;padding:0}li{border-top:1px solid #e7ebe8;padding:10px 0;display:flex;gap:10px;align-items:flex-start}li:first-child{border-top:0}li div{flex:1}li b{color:var(--vert)}li p{margin:2px 0 0;font-size:14px;color:var(--gris);white-space:pre-line}
.suppr{width:auto;background:none;color:var(--rouge);font-size:14px;padding:4px 6px}.total{font-size:15px;color:var(--gris);margin:0 0 6px}.astuce{font-size:13px;color:var(--gris);text-align:center;margin-top:6px}
</style></head><body>`;
  if (invalide) return tete + `<header><small>Magnolia Traiteur</small><h1>Lien invalide</h1></header><main><div class="carte"><p>Ce lien n’existe pas ou a été remplacé par un nouveau. Demandez à votre responsable de vous renvoyer votre lien par SMS.</p></div></main></body></html>`;
  const opts = [];
  for (let m = 0; m < JOUR; m += 15) opts.push(`<option value="${hhmm(m)}">${hhmm(m).replace(':', ' h ')}</option>`);
  return tete + `<header><small>Magnolia Traiteur</small><h1>Bonjour ${esc(nom)}, vos heures supplémentaires</h1></header>
<main>
<form class="carte" id="f" novalidate><h2>Déclarer des heures</h2>
<p class="regle">Du lundi au vendredi : seulement <b>avant 8 h</b> ou <b>après 18 h</b>. Le samedi et le dimanche : toute la journée.</p>
<label for="date">Jour travaillé</label><input type="date" id="date" name="date" required>
<div class="deux"><div><label for="debut">De</label><select id="debut" name="debut">${opts.join('')}</select></div><div><label for="fin">À</label><select id="fin" name="fin">${opts.join('')}</select></div></div>
<div class="duree" id="duree" aria-live="polite"></div>
<label for="quoi">Sur quoi avez-vous travaillé ?</label><textarea id="quoi" name="quoi" placeholder="ex. Mariage Dupont à Versailles : service et rangement" required></textarea>
<button type="button" class="micro" id="micro">🎤 Dicter</button>
<div id="msg" aria-live="polite"></div>
<button class="go" id="go">Valider mes heures</button></form>
<section class="carte"><h2>Mes dernières déclarations</h2><p class="total" id="tot"></p><ul id="liste"><li><div>Chargement…</div></li></ul></section>
<p class="astuce">Astuce iPhone : touchez « Partager » puis « Sur l’écran d’accueil » pour garder cette page comme une application.</p>
</main>
<script>
(function(){
var API='/api/heures/${esc(jeton)}', $=function(s){return document.querySelector(s)};
var JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
function auj(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function min(h){var p=h.split(':');return +p[0]*60+ +p[1]}
function duree(m){var h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+String(r).padStart(2,'0'):''):r+' min'}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function jsem(d){return new Date(d+'T12:00:00').getDay()}
function dateFr(d){var j=jsem(d);var p=d.split('-');return JOURS[j]+' '+(+p[2])+'/'+p[1]}
$('#date').value=auj();$('#date').max=auj();
function defaut(){var we=[0,6].indexOf(jsem($('#date').value||auj()))>=0;if(!$('#debut').dataset.touche){$('#debut').value=we?'09:00':'18:00';$('#fin').value=we?'13:00':'20:00'}verif()}
function verif(){var d=$('#date').value,a=min($('#debut').value),b=min($('#fin').value),el=$('#duree'),err='';
 if(!d){el.textContent='';return ''}
 var sem=jsem(d)>=1&&jsem(d)<=5,m=b>a?b-a:1440-a+b;
 if(a===b)err='L’heure de fin doit être différente de l’heure de début.';
 else if(sem&&b>a&&!(b<=480||a>=1080))err='Le '+JOURS[jsem(d)]+', les heures supplémentaires ne peuvent être faites qu’avant 8 h ou après 18 h.';
 else if(sem&&b<a&&a<1080)err='Le '+JOURS[jsem(d)]+', une plage qui passe minuit doit commencer à 18 h ou après.';
 el.className=err?'err':'duree';el.textContent=err||('Durée : '+duree(m)+(b<a?' (jusqu’au lendemain)':''));return err}
$('#date').addEventListener('change',defaut);['#debut','#fin'].forEach(function(s){$(s).addEventListener('change',function(){$(s).dataset.touche='1';verif()})});defaut();
function charger(){fetch(API,{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
 if(j.error){$('#liste').innerHTML='<li><div class="err">'+esc(j.error)+'</div></li>';return}
 $('#tot').textContent='Ce mois-ci : '+duree(j.moisMinutes||0);
 $('#liste').innerHTML=j.liste.length?j.liste.map(function(x){return '<li><div><b>'+dateFr(x.date)+'</b> · '+x.debut+' – '+x.fin+' · '+duree(x.minutes)+'<p>'+esc(x.quoi)+'</p></div><button type="button" class="suppr" data-id="'+x.id+'">Retirer</button></li>'}).join(''):'<li><div>Aucune déclaration pour l’instant.</div></li>';
})}
$('#liste').addEventListener('click',function(e){var b=e.target.closest('[data-id]');if(!b||!confirm('Retirer cette déclaration ?'))return;fetch(API+'/'+b.dataset.id,{method:'DELETE',headers:{'x-mg':'1'}}).then(charger)});
$('#f').addEventListener('submit',function(e){e.preventDefault();var m=$('#msg');m.className='';m.textContent='';
 var err=verif();if(err){m.className='err';m.textContent=err;return}
 if($('#quoi').value.trim().length<3){m.className='err';m.textContent='Indiquez sur quoi vous avez travaillé.';$('#quoi').focus();return}
 $('#go').disabled=true;$('#go').textContent='Envoi…';
 fetch(API,{method:'POST',headers:{'content-type':'application/json','x-mg':'1'},body:JSON.stringify({date:$('#date').value,debut:$('#debut').value,fin:$('#fin').value,quoi:$('#quoi').value})}).then(function(r){return r.json()}).then(function(j){
  if(j.error){m.className='err';m.textContent=j.error}else{m.className='ok';m.textContent='✅ C’est enregistré à votre nom : '+dateFr(j.date)+', '+j.debut+' – '+j.fin+' ('+duree(j.minutes)+').';$('#quoi').value='';charger()}
 }).catch(function(){m.className='err';m.textContent='Pas de connexion : réessayez dans un instant.'}).then(function(){$('#go').disabled=false;$('#go').textContent='Valider mes heures'})});
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null;
$('#micro').addEventListener('click',function(){var bt=this;if(rec){rec.stop();return}
 if(!SR){alert('Touchez le micro 🎤 du clavier de votre téléphone pour dicter.');$('#quoi').focus();return}
 rec=new SR();rec.lang='fr-FR';rec.interimResults=false;rec.continuous=true;var base=$('#quoi').value;
 rec.onresult=function(ev){var t='';for(var i=0;i<ev.results.length;i++)t+=ev.results[i][0].transcript;$('#quoi').value=(base?base+' ':'')+t};
 rec.onend=function(){rec=null;bt.classList.remove('on');bt.textContent='🎤 Dicter'};
 try{rec.start();bt.classList.add('on');bt.textContent='■ Arrêter la dictée'}catch(e){rec=null}});
charger();
})();
</script></body></html>`;
}

module.exports = { verifier, totaux, duree, chevauche, routes, pageMobile, MATIN, SOIR };
