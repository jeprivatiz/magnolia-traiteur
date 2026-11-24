'use strict';
/* « Laisser un commentaire » sur la page du devis : gardé sur le devis, envoyé au commercial du devis (e-mail + SMS). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('commentaire du client sur son devis → commercial prévenu, visible dans le back-office', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const envois = [];
  const brevo = { live: false, async sendEmail(o) { envois.push({ k: 'email', ...o }); return { test: true }; }, async sendSms(o) { envois.push({ k: 'sms', ...o }); return { test: true }; } };
  const { createApp } = require('../server/index');
  const app = await createApp({ brevo, env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, anonyme } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', ...(anonyme ? {} : { cookie }) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc && !anonyme) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    await call('/api/admin/site', { method: 'PUT', body: { alertes: { personnes: [{ nom: 'Jean-Luc Bernard', tel: '0600000000', email: 'jl@example.test' }, { nom: 'Romain Goujon', tel: '0611111111', email: 'romain@example.test' }] } } });
    const cl = await call('/api/admin/clients', { method: 'POST', body: { nom: 'sophie durand', email: 'sophie@example.test', tel: '0699999999' } });
    const id = (await call('/api/admin/actions/devis-vierge', { method: 'POST', body: { clientId: cl.j.id } })).j.id;
    const d = (await call('/api/admin/devis/' + id)).j;
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...d, commercial: { nom: 'Romain Goujon', tel: '0611111111' }, lignes: [{ designation: 'Colombo de poulet', qte: 10, unite: 'portion', puCents: 1250, tva: 10 }] } });
    // brouillon : pas de commentaire possible
    assert.equal((await call(`/api/devis/${d.token}/commentaire`, { method: 'POST', body: { texte: 'Bonjour' }, anonyme: true })).status, 404);
    // l'aperçu montre le cadre, mais désactivé
    const ap = (await call('/api/admin/devis/' + id + '/apercu')).j;
    assert.match(ap, /Laisser un commentaire/); assert.doesNotMatch(ap, /data-com="/);
    assert.equal((await call('/api/admin/actions/envoyer-devis/' + id, { method: 'POST', body: { canaux: ['email'] } })).status, 200);
    const page = (await call('/devis/' + d.token, { anonyme: true })).j;
    assert.match(page, /Laisser un commentaire/); assert.match(page, new RegExp(`data-com="${d.token}"`)); assert.match(page, /<b>Romain Goujon<\/b>, votre conseiller, le reçoit/);
    envois.length = 0;
    assert.equal((await call(`/api/devis/${d.token}/commentaire`, { method: 'POST', body: { texte: ' ' }, anonyme: true })).status, 400);
    const r = await call(`/api/devis/${d.token}/commentaire`, { method: 'POST', body: { texte: 'Nous serons finalement 45.\nPeut-on avoir un fraisier ?' }, anonyme: true });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const mail = envois.find(e => e.k === 'email'), sms = envois.find(e => e.k === 'sms');
    assert.equal(mail?.to, 'romain@example.test', 'e-mail au commercial du devis (adresse reprise d’Équipe & activité)');
    assert.equal(mail.replyTo, 'sophie@example.test', 'il peut répondre directement au client');
    assert.match(mail.subject, /Commentaire de Sophie DURAND sur le devis/);
    assert.match(mail.html, /fraisier/);
    assert.equal(sms?.to, '0611111111'); assert.match(sms.content, /Sophie DURAND a commenté le devis .*fraisier/);
    assert.notEqual(sms.lien, false, 'le SMS reçoit le lien magnoliatraiteur.fr');
    assert.ok(!envois.some(e => e.to === 'jl@example.test'), 'pas envoyé aux autres');
    const apres = (await call('/api/admin/devis/' + id)).j;
    assert.equal(apres.commentaires.length, 1); assert.equal(apres.commentaires[0].nom, 'Sophie DURAND');
    // un enregistrement du back-office (sans le champ) ne l'efface pas
    await call('/api/admin/devis/' + id, { method: 'PUT', body: { ...apres, commentaires: [], titre: 'Mariage' } });
    assert.equal((await call('/api/admin/devis/' + id)).j.commentaires.length, 1);
    assert.match((await call('/devis/' + d.token, { anonyme: true })).j, /fraisier/, 'le client revoit son commentaire');
    const h = (await call('/api/admin/actions/historique-client/' + cl.j.id)).j;
    assert.ok(JSON.stringify(h).includes('Commentaire du client'), 'dans l’historique du client');
  } finally { srv.close(); }
});
