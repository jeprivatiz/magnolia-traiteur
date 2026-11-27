'use strict';
/* Heures supplémentaires (Jean-Luc, 2026-11-27) : en semaine avant 9 h / après 18 h seulement, week-end libre ; mini-application par lien personnel. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const HS = require('../server/heures-sup');

const AUJ = '2026-11-27'; /* vendredi */
const v = (date, debut, fin) => HS.verifier({ date, debut, fin }, AUJ);

test('règles des horaires', () => {
  assert.equal(v('2026-11-26', '18:00', '21:30').minutes, 210, 'jeudi soir');
  assert.equal(v('2026-11-26', '06:00', '09:00').minutes, 180, 'jeudi matin');
  assert.equal(v('2026-11-26', '08:00', '09:00').minutes, 60, '8 h – 9 h accepté en semaine (journée à 9 h)');
  assert.match(v('2026-11-26', '10:00', '12:00').erreur, /avant 9 h ou après 18 h/);
  assert.match(v('2026-11-26', '07:00', '10:00').erreur, /Arrêtez la plage à 09:00/);
  assert.match(v('2026-11-26', '17:00', '19:00').erreur, /Commencez la plage à 18:00/);
  assert.equal(v('2026-11-21', '10:00', '16:00').minutes, 360, 'samedi : toute la journée');
  assert.equal(v('2026-11-22', '08:00', '20:00').minutes, 720, 'dimanche');
  assert.equal(v('2026-11-26', '22:00', '01:00').minutes, 180, 'passe minuit');
  assert.match(v('2026-11-26', '23:00', '09:30').erreur, /vendredi matin après 9 h/);
  assert.equal(v('2026-11-27', '23:00', '10:00').minutes, 660, 'vendredi soir → samedi matin');
  assert.match(v('2026-11-28', '10:00', '12:00').erreur, /pas encore passé/);
  assert.match(v('', '10:00', '12:00').erreur, /jour/);
  assert.match(v('2026-11-21', '10:00', '10:00').erreur, /différente/);
});

test('back-office, mini-application et lien par SMS', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '', SITE_URL: 'https://essai.test' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port;
  const mk = () => { let cookie = ''; return async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, j, t }; }; };
  const chef = mk(), romain = mk(), anonyme = mk();
  try {
    await chef('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const cree = await chef('/api/admin/actions/equipe', { method: 'POST', body: { prenom: 'Romain', nomFamille: 'GOUJON', portable: '0622222222', email: 'romain@x.test', password: 'romain-essai-123', droits: { toutes: false } } });
    assert.equal(cree.status, 200, cree.t);
    const uidR = (await chef('/api/admin/actions/equipe')).j.find(u => u.email === 'romain@x.test').id;
    await romain('/api/auth/login', { method: 'POST', body: { email: 'romain@x.test', password: 'romain-essai-123' } });

    const refus = await romain('/api/admin/actions/heures-sup', { method: 'POST', body: { date: '2026-11-25', debut: '09:00', fin: '11:00', quoi: 'Préparation' } });
    assert.equal(refus.status, 400); assert.match(refus.j.error, /avant 9 h ou après 18 h/);
    assert.equal((await romain('/api/admin/actions/heures-sup', { method: 'POST', body: { date: '2026-11-25', debut: '18:00', fin: '21:00', quoi: 'Mariage Dupont' } })).status, 200);
    const chev = await romain('/api/admin/actions/heures-sup', { method: 'POST', body: { date: '2026-11-25', debut: '20:00', fin: '22:00', quoi: 'Rangement' } });
    assert.match(chev.j.error, /chevauche/);
    assert.equal((await romain('/api/admin/actions/heures-sup', { method: 'POST', body: { uid: 'autre', date: '2026-11-22', debut: '10:00', fin: '12:00', quoi: 'x y z' } })).status, 403);
    assert.equal((await chef('/api/admin/actions/heures-sup', { method: 'POST', body: { date: '2026-11-22', debut: '10:00', fin: '14:30', quoi: 'Livraison dimanche' } })).status, 200);

    const vueR = (await romain('/api/admin/actions/heures-sup')).j;
    assert.equal(vueR.admin, false); assert.equal(vueR.liste.length, 1, 'Romain ne voit que les siennes');
    const vueC = (await chef('/api/admin/actions/heures-sup')).j;
    assert.equal(vueC.liste.length, 2); assert.equal(vueC.minutes, 450);
    assert.deepEqual(vueC.totaux.map(t => t.minutes), [270, 180], 'total par personne, du plus grand au plus petit'); assert.equal(vueC.totaux[1].nom, 'Romain GOUJON');
    assert.equal((await chef('/api/admin/actions/heures-sup?qui=' + uidR)).j.liste.length, 1, 'filtre par personne');
    assert.equal((await chef('/api/admin/actions/heures-sup?du=2026-11-24&au=2026-11-30')).j.liste.length, 1, 'filtre par période');

    /* lien personnel envoyé par SMS (mode test), puis mini-application */
    const l = (await chef('/api/admin/actions/heures-sup/lien/' + uidR, { method: 'POST', body: { sms: true } })).j;
    assert.match(l.lien, /^https:\/\/essai\.test\/heures\/[\w-]{20,}$/);
    const sms = (await chef('/api/admin/actions/envois')).j.envois.find(e => e.kind === 'sms' && /heures supplémentaires/.test(e.payload.content));
    assert.ok(sms && sms.payload.content.includes(l.lien) && /622222222/.test(sms.payload.recipient));
    const t = l.lien.split('/heures/')[1];
    const page = await anonyme('/heures/' + t);
    assert.equal(page.status, 200); assert.match(page.t, /Bonjour Romain/); assert.match(page.t, /apple-mobile-web-app-capable/);
    assert.equal((await anonyme('/heures/' + t + '/manifest.webmanifest')).j.start_url, '/heures/' + t);
    const mob = await anonyme('/api/heures/' + t, { method: 'POST', body: { date: '2026-11-21', debut: '09:00', fin: '12:00', quoi: 'Buffet samedi' } });
    assert.equal(mob.status, 200, mob.t); assert.equal(mob.j.nom, 'Romain GOUJON');
    assert.match((await anonyme('/api/heures/' + t, { method: 'POST', body: { date: '2026-11-24', debut: '12:00', fin: '14:00', quoi: 'x y z' } })).j.error, /avant 9 h/);
    const ma = (await anonyme('/api/heures/' + t)).j; assert.equal(ma.liste.length, 2); assert.ok(!('uid' in ma.liste[0]));
    const vue2 = (await chef('/api/admin/actions/heures-sup?qui=' + uidR)).j.liste;
    assert.equal(vue2.find(x => x.date === '2026-11-21').depuis, 'telephone', 'arrive à son nom dans le back-office');
    /* nouveau lien : l'ancien est coupé */
    await chef('/api/admin/actions/heures-sup/lien/' + uidR, { method: 'POST', body: { nouveau: true } });
    assert.equal((await anonyme('/heures/' + t)).status, 404);
    assert.equal((await anonyme('/api/heures/' + t)).status, 404);
    /* retrait : Romain retire la sienne, pas celle du chef */
    const idC = vueC.liste.find(x => x.date === '2026-11-22').id;
    assert.equal((await romain('/api/admin/actions/heures-sup/' + idC, { method: 'DELETE' })).status, 403);
    assert.equal((await chef('/api/admin/actions/heures-sup/' + idC, { method: 'DELETE' })).status, 200);
  } finally { srv.close(); }
});
