'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { redirectionPour } = require('../server/index');

test('redirections 301 de l’ancien site', () => {
  const t = '/nos-buffets /saveurs-du-monde\n/blog/* /conseils\n\nmauvaise ligne\n/externe //pirate.example\n/ok https://www.magnoliatraiteur.fr/';
  assert.equal(redirectionPour(t, '/nos-buffets'), '/saveurs-du-monde');
  assert.equal(redirectionPour(t, '/nos-buffets/'), '/saveurs-du-monde');
  assert.equal(redirectionPour(t, '/blog/recette-12'), '/conseils');
  assert.equal(redirectionPour(t, '/autre'), null);
  assert.equal(redirectionPour(t, '/externe'), null);
  assert.equal(redirectionPour(t, '/ok'), 'https://www.magnoliatraiteur.fr/');
});
