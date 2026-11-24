'use strict';
/* Clients › Envoyer un e-mail / un SMS : sélection multicritère, IA, aperçu, essai, envoi, désinscription, historique. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const DIF = require('../server/diffusion');

test('comptage SMS, mention STOP et créneaux', () => {
  const t = DIF.smsFinal('Magnolia Traiteur : Bonjour {prenom}, la fête des mères arrive ! Réservez au 07 63 66 98 92', { prenom: 'Claire' });
  assert.ok(t.endsWith('STOP au [STOP_CODE]'));
  assert.ok(t.includes('Bonjour Claire, la fete des mères arrive !'));
  assert.equal(DIF.comptage(t).sms, 1);
  assert.equal(DIF.comptage('x'.repeat(161)).sms, 2);
  assert.equal(DIF.comptage('😀'.repeat(71)).unicode, true);
  assert.equal(DIF.creneauSms(new Date('2026-11-24T09:00:00Z')).ok, true);
  assert.equal(DIF.creneauSms(new Date('2026-11-29T10:00:00Z')).ok, false, 'dimanche');
  assert.equal(DIF.creneauSms(new Date('2026-12-25T10:00:00Z')).ok, false, 'Noël');
  assert.equal(DIF.creneauSms(new Date('2026-11-24T22:30:00Z')).ok, false, 'nuit');
  assert.ok(DIF.feries(2027).includes('2027-03-29'), 'lundi de Pâques 2027');
  assert.equal(DIF.departement('20190'), '2A'); assert.equal(DIF.departement('97200'), '972');
  assert.equal(DIF.avecLien('Bonjour', 'magnoliatraiteur.fr'), 'Bonjour\nmagnoliatraiteur.fr');
  assert.equal(DIF.avecLien('Voir https://magnoliatraiteur.fr/x', 'magnoliatraiteur.fr'), 'Voir https://magnoliatraiteur.fr/x');
  assert.equal(DIF.lienCourt('https://www.magnoliatraiteur.fr/'), 'magnoliatraiteur.fr');
  assert.equal(DIF.mobile('01 69 00 00 00'), ''); assert.equal(DIF.mobile('+33 7 12 34 56 78'), '33712345678');
});

test('envoi groupé de bout en bout', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  const envoyes = [];
  const brevo = { live: true, sendEmail: async m => { envoyes.push({ k: 'email', ...m }); return { messageId: 'x' }; }, sendSms: async m => { envoyes.push({ k: 'sms', ...m }); return { reference: 'y' }; } };
  const app = await createApp({ brevo, iaAsk: async p => /SMS/.test(p.split('\n')[1]) ? '{"texte":"Magnolia Traiteur : Bonjour {prenom}, -10% sur nos buffets ce mois-ci ! 07 63 66 98 92"}' : '{"objet":"Nouveau buffet libanais","titre":"Le Liban à votre table","corps":"Bonjour {prenom},\\n\\nDécouvrez **15 mezzés**.","bouton":{"texte":"Voir le buffet","lien":"/saveurs-du-monde"}}',
    env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', DB_HOST: '', SITE_URL: 'http://site.test' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const r = await fetch(base + u, { method, redirect: 'manual', headers: form ? { 'content-type': 'application/x-www-form-urlencoded', cookie } : { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque');
    for (const [nom, email, tel, cp, offres] of [['Claire Martin', 'claire@ex.test', '06 12 34 56 78', '92100', '1'], ['Paul Durand', 'paul@ex.test', '01 69 00 00 00', '93200', ''], ['Inès Sow', 'ines@ex.test', '07 11 22 33 44', '91140', '']]) {
      assert.equal((await call('/api/demandes', { method: 'POST', body: { nom, email, tel, evenement: 'Anniversaire', date: '2027-06-12', invites: 40, cp, ville: 'X', offres, lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } })).status, 200);
    }
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const cr = (await call('/api/admin/diffusion/criteres')).j;
    assert.equal(cr.total, 3); assert.equal(cr.email, 3); assert.equal(cr.sms, 2, 'le fixe ne reçoit pas de SMS');
    assert.deepEqual(cr.deps.map(d => d[0]), ['91', '92', '93']);
    const sel = async (canal, x = {}) => (await call('/api/admin/diffusion/selection', { method: 'POST', body: { canal, ...x } })).j;
    assert.equal((await sel('email', { criteres: { deps: ['92', '93'] } })).nb, 2);
    assert.equal((await sel('sms', { criteres: { deps: ['92', '93'] } })).nb, 1);
    assert.equal((await sel('email', { criteres: { accord: true } })).nb, 1, 'seule Claire a coché la case');
    /* Claire a commandé (devis signé) */
    const dem = (await call('/api/admin/demandes')).j.find(d => /claire/i.test(d.contact.nom));
    const dv = await call('/api/admin/actions/devis-depuis-demande/' + dem.id, { method: 'POST' });
    const d = (await call('/api/admin/devis/' + dv.j.id)).j;
    await call('/api/admin/actions/envoyer-devis/' + d.id, { method: 'POST', body: { canaux: ['email'] } });
    assert.equal((await call('/api/devis/' + d.token + '/accepter', { method: 'POST', body: { nom: 'Claire Martin' } })).status, 200);
    await call('/api/admin/diffusion/criteres');
    const s1 = await sel('email', { criteres: { statut: 'commandes', montantMin: 10000 } });
    assert.equal(s1.nb, 1); assert.match(s1.lignes[0].nom, /claire/i);
    assert.equal((await sel('email', { criteres: { statut: 'prospects' } })).nb, 2);
    const tous = await sel('email', {});
    const ines = tous.lignes.find(x => /inès/i.test(x.nom)).id;
    assert.equal((await sel('email', { exclus: [ines] })).nb, 2, 'décoché à la main');
    assert.equal((await sel('email', { mode: 'manuel', inclus: [ines] })).nb, 1, 'choisi un par un');
    /* IA */
    const m = (await call('/api/admin/ia/diffusion-email', { method: 'POST', body: { infos: 'nouveau buffet libanais 15 mezzés' } })).j;
    assert.equal(m.objet, 'Nouveau buffet libanais'); assert.equal(m.bouton.lien, '/saveurs-du-monde');
    const sm = (await call('/api/admin/ia/diffusion-sms', { method: 'POST', body: { infos: 'promo -10 %', nbSms: 1 } })).j;
    assert.match(sm.texte, /Bonjour \{prenom\}/);
    /* aperçus */
    const ap = (await call('/api/admin/diffusion/apercu', { method: 'POST', body: { canal: 'email', message: m, prenom: 'Claire' } })).j;
    assert.match(ap.html, /Bonjour Claire,/); assert.match(ap.html, /<b>15 mezzés<\/b>/); assert.match(ap.html, /Se désinscrire/); assert.match(ap.html, /http:\/\/site\.test\/saveurs-du-monde/);
    const as = (await call('/api/admin/diffusion/apercu', { method: 'POST', body: { canal: 'sms', message: sm } })).j;
    assert.match(as.texte, /\nmagnoliatraiteur\.fr\nSTOP au 36173$/, 'adresse du site avant STOP'); assert.equal(as.sms, 1);
    /* essai */
    assert.equal((await call('/api/admin/diffusion/essai', { method: 'POST', body: { canal: 'email', message: m, a: 'moi@ex.test' } })).status, 200);
    assert.match(envoyes.at(-1).subject, /^\[ESSAI\]/);
    /* envoi réel : la confirmation doit porter le bon nombre */
    assert.equal((await call('/api/admin/diffusion/envoyer', { method: 'POST', body: { canal: 'email', message: m, exclus: [ines], confirme: 3 } })).status, 409);
    const go = await call('/api/admin/diffusion/envoyer', { method: 'POST', body: { canal: 'email', message: m, exclus: [ines], confirme: 2 } });
    assert.equal(go.status, 200, JSON.stringify(go.j));
    for (let i = 0; i < 50 && (await call('/api/admin/diffusion/campagnes/' + go.j.id)).j.statut !== 'termine'; i++) await new Promise(r => setTimeout(r, 20));
    const mails = envoyes.filter(x => x.k === 'email' && x.tags?.[0]?.startsWith('campagne'));
    assert.equal(mails.length, 2); assert.ok(!mails.some(x => x.to === 'ines@ex.test'));
    const claire = mails.find(x => x.to === 'claire@ex.test');
    assert.match(claire.html, /Bonjour Claire,/); assert.ok(claire.headers['List-Unsubscribe']);
    /* historique du client */
    const cid = tous.lignes.find(x => /claire/i.test(x.nom)).id;
    const h = (await call('/api/admin/actions/historique-client/' + cid)).j;
    assert.ok(h.events.some(e => e.type === 'email' && /information envoyé : Nouveau buffet libanais/.test(e.titre)));
    /* désinscription par le lien de l'e-mail */
    const lien = claire.headers['List-Unsubscribe'].slice(1, -1).replace('http://site.test', '');
    assert.match((await call(lien)).j, /Me désinscrire/);
    assert.match((await call(lien.replace(/t=[^&]+/, 't=faux'))).j, /Lien incomplet/);
    assert.match((await call(lien, { method: 'POST', form: 'List-Unsubscribe=One-Click' })).j, /C’est fait/);
    await call('/api/admin/diffusion/criteres');
    assert.equal((await sel('email', {})).nb, 2, 'Claire désinscrite n’est plus proposée');
    assert.equal((await sel('sms', {})).nb, 2, 'les SMS restent possibles');
    assert.ok((await call('/api/admin/actions/historique-client/' + cid)).j.events.some(e => /Désinscrit/.test(e.titre)));
    /* SMS groupé : adresse du site + STOP, type marketing */
    const goS = await call('/api/admin/diffusion/envoyer', { method: 'POST', body: { canal: 'sms', message: sm, confirme: 2 } });
    if (goS.status === 200) {
      for (let i = 0; i < 50 && (await call('/api/admin/diffusion/campagnes/' + goS.j.id)).j.statut !== 'termine'; i++) await new Promise(r => setTimeout(r, 20));
      const sms = envoyes.filter(x => x.k === 'sms' && x.type === 'marketing');
      assert.ok(sms.length >= 1); for (const x of sms) { assert.match(x.content, /magnoliatraiteur\.fr\nSTOP au \[STOP_CODE\]$/); assert.equal(x.content.match(/magnoliatraiteur\.fr/g).length, 1); }
    } else assert.match(goS.j.error, /dimanche|férié|8 h/);
    /* tout autre SMS au client reçoit l'adresse du site ; un SMS qui a déjà un lien vers le site n'est pas doublé ; pas les alertes de l'équipe */
    envoyes.length = 0;
    await call('/api/admin/actions/envoyer-devis/' + d.id, { method: 'POST', body: { canaux: ['sms'] } });
    const dsms = envoyes.find(x => x.k === 'sms');
    assert.ok(dsms, 'SMS du devis'); assert.ok(/site\.test\/devis\//.test(dsms.content) && !/magnoliatraiteur\.fr/.test(dsms.content), dsms.content);
    const camps = (await call('/api/admin/diffusion/campagnes')).j; assert.ok(camps.length >= 1);
    cookie = '';
    assert.equal((await call('/api/admin/diffusion/criteres')).status, 401);
  } finally { srv.close(); }
});
