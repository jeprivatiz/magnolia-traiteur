'use strict';
/* Appel ou visio programmé depuis la fiche client : agenda, invitation au client (.ics), rappels SMS/e-mail au commercial 24 h, 4 h et 1 h avant. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('appel / visio programmé et rappels au commercial', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  const store = app.locals.store;
  const sorties = async () => (await store.list('_outbox')).map(d => d.data);
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    await call('/api/admin/site', { method: 'PUT', body: { alertes: { personnes: [{ nom: 'Romain Goujon', tel: '0611111111', email: 'romain@example.test' }, { nom: 'Hermine', tel: '0622222222', email: '' }] } } });
    const cl = (await call('/api/admin/clients', { method: 'POST', body: { nom: 'jean-luc bernard', email: 'jl@example.test', tel: '0763669892' } })).j;
    /* rendez-vous dans 2 jours à 14 h 30 (heure de Paris) */
    const j = new Date(Date.now() + 2 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    const avant = (await sorties()).length;
    const v = await call('/api/admin/actions/rdv-client/' + cl.id, { method: 'POST', body: { type: 'visio', date: j, heure: '14:30', duree: 30, motif: 'Menu du mariage', commerciaux: ['Romain Goujon'], envoyerEmail: true, envoyerSms: true } });
    assert.equal(v.status, 200, JSON.stringify(v.j));
    assert.match(v.j.lien, /^https:\/\/meet\.jit\.si\/MagnoliaTraiteur-/);
    const out = (await sorties()).slice(0);
    const auClient = out.find(o => o.kind === 'email' && o.payload.to[0].email === 'jl@example.test');
    assert.ok(auClient, 'invitation e-mail au client');
    assert.match(Buffer.from(auClient.payload.attachment[0].content, 'base64').toString(), /BEGIN:VEVENT[\s\S]*meet\.jit\.si/);
    assert.ok(out.some(o => o.kind === 'sms' && o.payload.recipient === '33763669892' && o.payload.content.includes('meet.jit.si')), 'SMS au client');
    assert.ok(out.some(o => o.kind === 'email' && o.payload.to[0].email === 'romain@example.test'), 'le commercial reçoit le rendez-vous');
    assert.ok(out.length > avant);
    const agl = (await call('/api/admin/actions/agenda')).j; const ag = agl.find(x => x.id === v.j.id); 
    assert.ok(ag && ag.lien === '#/clients/' + cl.id && ag.commerciaux[0] === 'Romain Goujon', 'dans l’agenda de Romain');
    const h = (await call('/api/admin/actions/historique-client/' + cl.id)).j;
    assert.equal(h.rdv.length, 1); assert.ok(h.events.some(e => e.type === 'rdv' && /Visio programmé/.test(e.titre)));
    /* rappels : rien tout de suite, puis 24 h, 4 h, 1 h avant, jamais deux fois */
    const r = (await call('/api/admin/rdv/' + v.j.id)).j;
    const [y, m, d] = j.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d, 14, 30) - (new Date(new Date(Date.UTC(y, m - 1, d, 14, 30)).toLocaleString('en-US', { timeZone: 'Europe/Paris' })) - new Date(new Date(Date.UTC(y, m - 1, d, 14, 30)).toLocaleString('en-US', { timeZone: 'UTC' })));
    const smsRomain = async () => (await sorties()).filter(o => o.kind === 'sms' && o.payload.recipient === '33611111111');
    assert.equal(await app.locals.rappelsRdv(t - 30 * 36e5), 0);
    assert.equal(await app.locals.rappelsRdv(t - 24 * 36e5 + 6e4), 1);
    assert.equal(await app.locals.rappelsRdv(t - 24 * 36e5 + 12e4), 0, 'pas deux fois');
    assert.equal(await app.locals.rappelsRdv(t - 4 * 36e5 + 6e4), 1);
    assert.equal(await app.locals.rappelsRdv(t - 36e5 + 6e4), 1);
    assert.equal(await app.locals.rappelsRdv(t - 30 * 6e4), 0);
    const sms = await smsRomain();
    assert.equal(sms.length, 3, '3 rappels sur le portable de Romain');
    assert.match(sms[0].payload.content, /Rappel Magnolia \(demain\)/); assert.match(sms[2].payload.content, /dans 1 h/);
    assert.ok(!sms.some(o => /STOP/.test(o.payload.content)) && sms.every(o => o.payload.type === 'transactional'));
    assert.ok(!(await sorties()).some(o => o.kind === 'sms' && o.payload.recipient === '33622222222'), 'Hermine n’est pas concernée');
    assert.ok(r.rappels && !Object.keys(r.rappels).length);
    /* rendez-vous pris 3 h avant : seul le rappel d'1 h reste ; serveur arrêté → seul le plus proche est rattrapé */
    const now = Date.now(), dt = new Date(now + 3 * 36e5 + 10 * 6e4);
    const loc = dt.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' });
    const v2 = (await call('/api/admin/actions/rdv-client/' + cl.id, { method: 'POST', body: { type: 'appel', date: loc.slice(0, 10), heure: loc.slice(11, 16), commerciaux: [] } })).j;
    const r2 = (await call('/api/admin/rdv/' + v2.id)).j;
    assert.deepEqual(Object.keys(r2.rappels).sort(), ['24h', '4h']);
    assert.equal(r2.lien, '');
    assert.equal((await call('/api/admin/actions/rdv-client/' + cl.id, { method: 'POST', body: { type: 'appel', date: '2020-01-01', heure: '10:00' } })).status, 400);
  } finally { srv.close(); }
});
