'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { sousPhotoHtml } = require('../server/views');

test('description sous la photo : lignes « - » en liste à puces', () => {
  const h = sousPhotoHtml(['NOS MINI PIÈCES', '- Accras', '- **Boudin** créole', '', 'Fin', '• Pâtés', 'pain - saumon']);
  assert.strictEqual(h, '<p>NOS MINI PIÈCES</p><ul class="sp-puces"><li>Accras</li><li><strong>Boudin</strong> créole</li></ul><p class="sp-vide" aria-hidden="true"></p><p>Fin</p><ul class="sp-puces"><li>Pâtés</li></ul><p>pain - saumon</p>');
  assert.strictEqual(sousPhotoHtml(['-5 % sur tout', '**gras**']), '<p>-5 % sur tout</p><p><strong>gras</strong></p>');
});
