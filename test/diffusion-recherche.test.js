'use strict';
/* Contacts › recherche multicritère → « Envoyer un SMS / un e-mail » aux contacts trouvés (Jean-Luc, 2026-11-27) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('envoi aux contacts trouvés par la recherche Contacts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const envoyes = [];
  let credits = 1000;
  const brevo = { live: true, compte: async () => ({ live: true, sms: credits, email: null }), sendEmail: async m => { envoyes.push({ k: 'email', ...m }); return { messageId: 'x' }; }, sendSms: async m => { envoyes.push({ k: 'sms', ...m }); return { reference: 'y' }; } };
  const app = await createApp({ brevo, env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', DB_HOST: '', SITE_URL: 'http://site.test' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    for (const c of [
      { nom: 'Claire MARTIN', email: 'claire@ex.test', tel: '06 12 34 56 78', metiers: ['DJ'] },
      { nom: 'Paul DURAND', email: 'paul@ex.test', tel: '01 69 00 00 00', metiers: ['DJ'] },
      { nom: 'Zoé PETIT', email: 'zoe@ex.test', tel: '07 11 22 33 44', metiers: ['DJ'], nePasContacter: true },
      { nom: 'Inès SOW', email: 'ines@ex.test', tel: '07 55 66 77 88', metiers: ['Serveur'] },
    ]) assert.equal((await call('/api/admin/clients', { method: 'POST', body: c })).status, 200);
    /* la liste Contacts donne le nombre de contacts joignables */
    const l = (await call('/api/admin/clients?par=50&page=1&q=&metier=DJ')).j;
    assert.equal(l.total, 3);
    assert.deepEqual(l.joignables, { email: 2, sms: 1 }, '« ne pas contacter » jamais compté, le fixe ne reçoit pas de SMS');
    const recherche = { q: '', filtre: '', vue: '', k: { metier: 'DJ' } };
    const sel = async canal => (await call('/api/admin/diffusion/selection', { method: 'POST', body: { canal, mode: 'recherche', recherche } })).j;
    const s1 = await sel('sms'); assert.equal(s1.nb, 1); assert.equal(s1.nonJoignables, 2);
    const s2 = await sel('email'); assert.equal(s2.nb, 2); assert.deepEqual(s2.lignes.map(x => x.nom).sort(), ['Claire MARTIN', 'Paul DURAND']);
    /* crédits SMS */
    assert.equal((await call('/api/admin/diffusion/credits')).j.sms, 1000);
    credits = 0;
    const m = { texte: 'Magnolia Traiteur : Bonjour {prenom}, soirées DJ en décembre ?' };
    const ko = await call('/api/admin/diffusion/envoyer', { method: 'POST', body: { canal: 'sms', mode: 'recherche', recherche, message: m, confirme: 1 } });
    if (ko.status !== 400 || !/crédits SMS|dimanche|jour férié|nuit|entre/i.test(ko.j.error)) assert.fail(JSON.stringify(ko));
    /* e-mail à tous les contacts trouvés */
    const ok = await call('/api/admin/diffusion/envoyer', { method: 'POST', body: { canal: 'email', mode: 'recherche', recherche, message: { objet: 'Soirées DJ', corps: 'Bonjour {prenom},\n\nÊtes-vous libre ?' }, confirme: 2 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.j));
    for (let i = 0; i < 50 && envoyes.length < 2; i++) await new Promise(r => setTimeout(r, 20));
    assert.deepEqual(envoyes.map(e => e.to).sort(), ['claire@ex.test', 'paul@ex.test']);
    assert.ok(envoyes.every(e => /desinscription/.test(e.html)));
  } finally { srv.close(); }
});
