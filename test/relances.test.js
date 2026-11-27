'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enRetard, preparerAlerte } = require('../server/relances');

const H = 36e5, now = Date.parse('2026-12-01T10:00:00Z');
const iso = t => new Date(t).toISOString();

test('un devis envoyé sans action depuis 48 h est signalé une seule fois', async () => {
  const d = { id: 'v1', numero: 'D-2026-0001', statut: 'envoye', envoyeLe: iso(now - 50 * H) };
  assert.equal(enRetard(d, true, now), true);
  assert.equal(enRetard({ ...d, envoyeLe: iso(now - 30 * H) }, true, now, 48 * H), false);
  assert.equal(enRetard({ ...d, envoyeLe: iso(now - 5 * H) }, true, now), false);
  assert.equal(enRetard({ ...d, relances: [{ at: iso(now - 2 * H) }] }, true, now), false);
  assert.equal(enRetard({ ...d, envoyeLe: iso(now - 40 * 24 * H) }, true, now), false);
  const db = new Map([['devis/v1', d], ['demandes/r1', { id: 'r1', ref: 'R-2026-0001', statut: 'demande', createdAt: iso(now - 26 * H), contact: { nom: 'A' } }], ['demandes/r2', { id: 'r2', statut: 'devis_envoye', createdAt: iso(now - 26 * H) }]]);
  const store = {
    list: async c => [...db].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => ({ id: k.split('/')[1], data: v })),
    set: async (k, v) => db.set(k, v),
  };
  const a = await preparerAlerte(store, { site: 'https://x', esc: s => String(s ?? '') }, now);
  assert.equal(a.devis, 1); assert.equal(a.demandes, 1);
  assert.match(a.html, /D-2026-0001/);
  assert.equal(await preparerAlerte(store, { site: 'https://x', esc: s => s }, now + H), null, 'pas de deuxième alerte');
});
