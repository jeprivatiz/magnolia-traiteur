'use strict';
/* « Demander à l'IA de modifier ce devis » : l'IA est simulée ; le serveur applique les opérations avec les prix du catalogue. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('modifier un devis en langage naturel', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const { createApp } = require('../server/index');
  let reponse = ''; const prompts = [];
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' }, iaAsk: async p => { prompts.push(p); return reponse; }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
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
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.statut !== 'masque' && x.prixCents > 0 && (x.min || 1) >= 5);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } })).status, 200);
    const lignes = [{ type: 'titre', designation: 'Animation' }, { designation: 'DJ soirée', qte: 1, unite: 'forfait', puCents: 60000, tva: 20 }, { designation: 'Colombo', qte: 40, unite: 'portion', puCents: 1250, tva: 10 }];
    reponse = 'Voici : ' + JSON.stringify({ operations: [{ op: 'supprimer', ligne: 1 }, { op: 'ajouter', slug: p.slug, qte: 1, apres: 1 }, { op: 'ajouter', slug: 'n-existe-pas', qte: 2 }, { op: 'quantite', ligne: 2, qte: 80 }, { op: 'invites', nombre: 80 }, { op: 'personnel', serveurs: 2, heures: 5 }], explication: 'DJ remplacé, 80 invités.' });
    const r = await call('/api/admin/ia/modifier-devis', { method: 'POST', body: { consigne: 'Supprime le DJ, mets une contorsionniste, passe à 80 invités, 2 serveurs 5 h', lignes, evenement: { invites: 40 }, remiseCents: 0 } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    assert.match(prompts[0], /1 \| DJ soirée/); assert.ok(!/coutCents/.test(prompts[0]));
    const L = r.j.lignes;
    assert.deepEqual(L.map(l => l.designation), ['Animation', p.titre, 'Colombo', L[3].designation]);
    assert.equal(L[1].qte, p.min, 'quantité remontée au minimum'); assert.equal(L[1].puCents, p.prixCents, 'prix du catalogue');
    assert.equal(L[2].qte, 80); assert.equal(r.j.invites, 80);
    assert.equal(L[3].qte, 10); assert.equal(L[3].puCents, c.reglages.tarifs.personnel.heureCents);
    assert.ok(r.j.changements.some(x => x.type === 'retire' && /DJ/.test(x.texte)));
    assert.equal(r.j.changements.filter(x => x.type === 'ajoute').length, 2, 'prestation inconnue ignorée');
    assert.equal((await call('/api/admin/ia/modifier-devis', { method: 'POST', body: { consigne: '', lignes } })).status, 400);
  } finally { srv.close(); }
});
