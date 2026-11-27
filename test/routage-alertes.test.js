'use strict';
/* Qui prévenir selon la demande (Jean-Luc, 2026-11-27) : règles montant / personnes / date / situation, canal, ordre, règle par défaut. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROUT = require('../server/routage-alertes');

const now = new Date('2026-11-27T08:00:00Z');
const jour = n => new Date(Date.parse('2026-11-27T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const R = { alertes: {
  personnes: [{ nom: 'Jean-Luc BERNARD', tel: '06 11 11 11 11', email: 'jl@x.test' }, { nom: 'Romain GOUJON', tel: '06 22 22 22 22', email: 'romain@x.test' }, { nom: 'Stéphanie', tel: '', email: 'steph@x.test' }],
  regles: [
    { nom: 'Gros budget', montant: { op: 'min', val: 5000 }, qui: ['Romain GOUJON'], canal: 'sms' },
    { nom: 'Urgente', delai: { op: 'moins', jours: 7 }, qui: ['Stéphanie'], canal: 'les2' },
    { nom: 'Incomplète', situation: 'incomplete', tels: '07 00 00 00 00', canal: 'sms', stop: true },
    { nom: 'Jamais lue après stop', qui: ['Jean-Luc BERNARD'] },
  ],
  defaut: { mode: 'tous', canal: 'email' },
} };
const route = (montant, invites, date, auto) => ROUT.router(R, [], ROUT.profil({ type: 'devis', totalEstimeCents: montant * 100, evenement: { date, invites } }, auto, now));

test('les règles s’additionnent dans l’ordre, avec leur canal', () => {
  const r = route(6000, 80, jour(3), { envoye: false, raisons: ['x'] });
  const noms = r.destinataires.map(x => x.nom);
  assert.deepEqual(noms, ['Romain GOUJON', 'Stéphanie', '07 00 00 00 00']);
  assert.deepEqual(r.destinataires[0].canaux, ['sms']);
  assert.deepEqual(r.destinataires[1].canaux, ['email']); assert.deepEqual(r.destinataires[1].manque, ['portable']);
  assert.equal(r.detail[3].statut, 'sautee', '« S’arrêter là »');
  assert.equal(r.parDefaut, false);
});

test('aucune règle ne correspond : règle par défaut = toute la liste, par e-mail', () => {
  const R1 = { alertes: { ...R.alertes, regles: R.alertes.regles.slice(0, 3) } };
  const r = ROUT.router(R1, [], ROUT.profil({ type: 'devis', totalEstimeCents: 80000, evenement: { date: jour(30), invites: 20 } }, { envoye: true, ttcCents: 80000 }, now));
  assert.equal(r.parDefaut, true);
  assert.deepEqual(r.destinataires.map(x => x.email), ['jl@x.test', 'romain@x.test', 'steph@x.test']);
  assert.ok(r.destinataires.every(x => x.canaux.join() === 'email'));
});

test('nombre de personnes, date passée, simple question', () => {
  const R2 = { alertes: { personnes: R.alertes.personnes, regles: [{ nom: 'Grand groupe', invites: { op: 'min', val: 150 }, qui: ['Jean-Luc BERNARD'] }, { nom: 'Toutes', qui: ['Romain GOUJON'] }], defaut: { mode: 'choix', qui: ['Stéphanie'] } } };
  const p = n => ROUT.profil({ type: 'devis', totalEstimeCents: 0, evenement: { date: jour(-2), invites: n } }, { envoye: false }, now);
  assert.deepEqual(ROUT.router(R2, [], p(200)).destinataires.map(x => x.nom), ['Jean-Luc BERNARD', 'Romain GOUJON']);
  assert.deepEqual(ROUT.router(R2, [], p(50)).destinataires.map(x => x.nom), ['Romain GOUJON']);
  const q = ROUT.router(R2, [], ROUT.profil({ type: 'contact', evenement: {} }, null, now));
  assert.deepEqual(q.destinataires.map(x => x.nom), ['Stéphanie'], 'question : règle par défaut');
  const urg = ROUT.examiner(ROUT.nette({ delai: { op: 'moins', jours: 7 } }), p(10));
  assert.equal(urg.ok, false, 'date passée : pas urgente');
});

test('un membre de l’équipe sans fiche d’alerte est trouvé dans les comptes', () => {
  const R3 = { alertes: { personnes: [], regles: [{ nom: 'X', qui: ['Hermine'], canal: 'les2' }] } };
  const r = ROUT.router(R3, [{ name: 'Hermine', portable: '06 33 33 33 33', email: 'hermine@x.test' }], ROUT.profil({ type: 'devis', evenement: {} }, { envoye: false }, now));
  assert.deepEqual(r.destinataires[0].canaux, ['email', 'sms']);
});

test('enregistrement, simulation et vraie alerte', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const env = { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '' };
  const { createApp } = require('../server/index');
  const app = await createApp({ env, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} } });
  const srv = app.listen(0); const base = 'http://127.0.0.1:' + srv.address().port; let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => { const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    const alertes = { personnes: [{ nom: 'Romain GOUJON', tel: '0622222222', email: 'romain@x.test' }, { nom: 'Liam BERNARD', tel: '0644444444', email: 'liam@x.test' }], regles: [{ nom: 'Incomplète', situation: 'incomplete', qui: ['Romain GOUJON'], canal: 'sms', montant: { op: '', val: 3 } }], defaut: { mode: 'choix', qui: ['Liam BERNARD'], canal: 'email' } };
    assert.equal((await call('/api/admin/site', { method: 'PUT', body: { alertes } })).status, 200);
    const R0 = (await call('/api/admin/site')).j.alertes;
    assert.equal(R0.regles[0].montant.op, '', 'condition vide nettoyée'); assert.equal(R0.defaut.mode, 'choix');
    const sim = (await call('/api/admin/actions/alertes-simuler', { method: 'POST', body: { test: { montant: '6 000', invites: 80, date: jour(4), situation: 'incomplete' } } })).j;
    assert.deepEqual(sim.destinataires.map(x => x.nom), ['Romain GOUJON']);
    assert.equal(sim.profil.montantCents, 600000);
    const sim2 = (await call('/api/admin/actions/alertes-simuler', { method: 'POST', body: { test: { montant: 100, situation: 'auto' } } })).j;
    assert.deepEqual(sim2.destinataires.map(x => x.nom), ['Liam BERNARD']); assert.equal(sim2.parDefaut, true);
    /* vraie demande incomplète (sans distance) : SMS à Romain seulement, avec le lien de la demande */
    const c = await app.locals.catalogue.get();
    const p = c.produits.find(x => x.prixCents > 0 && x.statut !== 'masque' && !x.aCompleter && !(x.groupes || []).length);
    const r = await call('/api/demandes', { method: 'POST', body: { nom: 'Alice Test', email: 'alice@example.test', tel: '0612345678', evenement: 'Mariage', date: jour(20), invites: 40, cp: '91140', ville: 'Villebon', km: 0, lignes: [{ slug: p.slug, qte: Math.max(40, p.min || 1) }] } });
    assert.equal(r.status, 200);
    await new Promise(ok => setTimeout(ok, 300));
    const envois = (await call('/api/admin/actions/envois')).j.envois;
    const sms = envois.filter(e => e.kind === 'sms' && /nouvelle demande/.test(e.payload.content));
    assert.equal(sms.length, 1); assert.match(sms[0].payload.recipient, /622222222/); assert.match(sms[0].payload.content, /admin#\/demandes\//);
    assert.ok(!envois.some(e => e.kind === 'email' && e.payload.to?.[0]?.email === 'liam@x.test'), 'Liam pas prévenu');
  } finally { srv.close(); }
});
