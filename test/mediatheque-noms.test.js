'use strict';
/* Médiathèque (Jean-Luc 2026-11-27) : donner un nom à une image (recherche + texte alternatif sur le site),
   prévenir si une image est encore utilisée, supprimer une ou plusieurs images. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('nommer, vérifier l’usage et supprimer des images de la médiathèque', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-med-'));
  delete require.cache[require.resolve('../server/index')];
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body, form } = {}) => {
    const headers = { 'x-mg': '1', cookie }; if (!form) headers['content-type'] = 'application/json';
    const r = await fetch(base + u, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, j };
  };
  try {
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    /* une image sans texte alternatif sur l'accueil reçoit le nom donné */
    const accueil = String((await call('/')).j);
    const tag = (accueil.match(/<img\b[^>]*>/g) || []).find(t => /\ssrc="\/site\/[^"]+"/.test(t) && /\salt=""/.test(t) && !/aria-hidden/.test(t));
    assert.ok(tag, 'une image sans alt sur l’accueil');
    const src = tag.match(/\ssrc="([^"]+)"/)[1];
    const r = await call('/api/admin/actions/media-nom', { method: 'PUT', body: { url: src, nom: 'Buffet antillais de mariage' } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.ok(String((await call('/')).j).includes(`alt="Buffet antillais de mariage"`));
    const m = (await call('/api/admin/actions/medias')).j;
    assert.equal(m.site.find(x => x.url === src).nom, 'Buffet antillais de mariage');
    assert.equal((await call('/api/admin/actions/media-nom', { method: 'PUT', body: { url: '/../etc/passwd', nom: 'x' } })).status, 400);

    /* image d'une fiche produit : signalée comme utilisée */
    const prod = (await call('/api/admin/produits')).j.find(p => p.photos?.[0]?.src?.startsWith('/site/'));
    const u1 = prod.photos[0].src;
    const us = (await call('/api/admin/actions/medias/usages', { method: 'POST', body: { urls: [u1] } })).j.usages;
    assert.ok(us[u1].some(l => l.includes(prod.titre)), JSON.stringify(us));

    /* envoyer deux images, puis les supprimer d'un coup */
    const envoi = async n => { const fd = new FormData(); fd.append('fichier', new Blob([Buffer.from('RIFF0000WEBPVP8 ')], { type: 'image/webp' }), n + '.webp'); return (await call('/api/admin/actions/upload', { method: 'POST', form: fd })).j.url; };
    const a = await envoi('essai-a'), b = await envoi('essai-b');
    assert.ok(fs.existsSync(path.join(dir, 'up', path.basename(a))));
    const s = await call('/api/admin/actions/medias/supprimer', { method: 'POST', body: { urls: [a, b, u1] } });
    assert.equal(s.j.n, 3);
    assert.ok(!fs.existsSync(path.join(dir, 'up', path.basename(a))));
    const m2 = (await call('/api/admin/actions/medias')).j;
    assert.ok(!m2.envoyes.some(x => x.url === a || x.url === b));
    assert.ok(!m2.site.some(x => x.url === u1), 'image du brouillon retirée de la médiathèque');
  } finally { srv.close(); }
});
