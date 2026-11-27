'use strict';
/* Blog « Nos événements en reportage » (Jean-Luc, 2026-11-27) : l'IA rédige, l'équipe relit et publie ; rappel tous les 3 jours. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BLOG = require('../server/blog');

test('rappel : dû 3 jours après la dernière publication ou le dernier rappel', () => {
  const now = Date.parse('2026-11-27T10:00:00Z');
  assert.equal(BLOG.etatRappel({ articles: [], now }).aFaire, true, 'aucun reportage : rappel tout de suite');
  const a = [{ statut: 'publie', publieLe: '2026-11-25T10:00:00Z' }];
  assert.equal(BLOG.etatRappel({ articles: a, now }).aFaire, false);
  assert.equal(BLOG.etatRappel({ articles: a, now: now + 86400e3 }).aFaire, true);
  assert.equal(BLOG.etatRappel({ articles: a, dernierRappel: '2026-11-28T09:00:00Z', now: now + 86400e3 + 3600e3 }).aFaire, false, 'rappel déjà envoyé');
  assert.equal(BLOG.etatRappel({ articles: a, R: { blog: { rappel: { jours: 4 } } }, now: now + 86400e3 }).aFaire, false, '4 jours réglés');
  assert.equal(BLOG.etatRappel({ articles: [{ statut: 'brouillon', publieLe: '' }], now }).aFaire, true, 'un brouillon ne compte pas');
});

test('l’IA rédige le reportage, il reste caché jusqu’à « Publier », puis s’affiche sur l’accueil et /blog', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
  const appels = [];
  let slugCatalogue = '';
  const iaAsk = (prompt, o) => {
    appels.push({ prompt, images: o?.images || [] });
    if (!prompt.includes('Nos événements en reportage')) return '[]';
    const consigne = prompt.includes('Tu RÉÉCRIS');
    return JSON.stringify({
      titre: consigne ? 'Un titre plus court' : '400 invités dans un hangar : une soirée 100 % italienne', chapo: 'Un hangar vide, 400 invités et une seule consigne : faire voyager en Italie.',
      categorie: 'entreprise', typeEvenement: 'Soirée d’entreprise', lieu: 'Massy (91)', invites: 400,
      chiffres: [{ valeur: '400', libelle: 'invités' }, { valeur: '14', libelle: 'serveurs' }],
      sections: [{ titre: '', texte: 'Premier paragraphe.\nDeuxième paragraphe.' }, { titre: 'Le défi', texte: 'Servir sans attente.' }, { titre: 'Le menu', texte: 'Antipasti et lasagnes. Préparé par notre fournisseur.' }],
      citation: { texte: 'Une soirée parfaite, du jamais vu chez nous à Milan', auteur: 'Le client' },
      photos: [{ n: 2, legende: 'Les invités au buffet' }, { n: 2, legende: 'doublon' }, { n: 9, legende: 'inexistante' }],
      produits: [slugCatalogue, 'fiche-inventee'], tags: ['Soirée d’entreprise', 'Buffet italien'], seoTitre: 'Soirée italienne pour 400 invités', seoDescription: 'Reportage',
    });
  };
  const { createApp } = require('../server/index');
  const app = await createApp({ env: { DB_FILE: path.join(dir, 'db.json'), UPLOAD_DIR: path.join(dir, 'up'), ADMIN_EMAIL: 'chef@magnolia.test', ADMIN_PASSWORD: 'mot-de-passe-essai', BREVO_API_KEY: '', DB_HOST: '', ANTHROPIC_API_KEY: '', SITE_URL: 'https://www.magnoliatraiteur.fr' }, noTimers: true, log: { log() {}, warn() {}, error() {}, info() {} }, iaAsk });
  const srv = app.listen(0);
  const base = 'http://127.0.0.1:' + srv.address().port;
  let cookie = '';
  const call = async (u, { method = 'GET', body } = {}) => {
    const r = await fetch(base + u, { method, headers: { 'content-type': 'application/json', 'x-mg': '1', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };
  try {
    const c = await app.locals.catalogue.get();
    slugCatalogue = c.produits.find(p => p.statut !== 'masque').slug;
    assert.doesNotMatch(await (await fetch(base + '/')).text(), /rep-sec/, 'pas de bloc blog sur l’accueil sans reportage publié');
    assert.equal((await call('/api/admin/blog')).status, 401);
    await call('/api/auth/login', { method: 'POST', body: { email: 'chef@magnolia.test', password: 'mot-de-passe-essai' } });
    assert.equal((await call('/api/admin/ia/blog', { method: 'POST', body: { notes: 'court' } })).status, 400, 'il faut quelques lignes');
    const photos = [{ src: '/site/c/cocktail10-client-20261104.jpg.webp' }, { src: '/media/hangar.jpg' }, { src: 'https://ailleurs.example/x.jpg' }];
    const r = await call('/api/admin/ia/blog', { method: 'POST', body: { notes: 'Entreprise italienne, hangar à Massy, 400 personnes, buffet italien, 14 serveurs.', photos, images: ['QUJD'] } });
    assert.equal(r.status, 200, JSON.stringify(r.j));
    const a = r.j.article;
    assert.equal(appels.at(-1).images.length, 1, 'la photo est envoyée à l’IA');
    assert.equal(a.statut, 'brouillon');
    assert.deepEqual(a.photos.map(p => p.src), ['/media/hangar.jpg', '/site/c/cocktail10-client-20261104.jpg.webp'], 'ordre de l’IA, sans doublon ni photo extérieure');
    assert.equal(a.photos[0].legende, 'Les invités au buffet');
    assert.equal(a.citation, null, 'citation absente des notes : retirée');
    assert.deepEqual(a.produits, [slugCatalogue], 'fiche inventée retirée');
    assert.doesNotMatch(JSON.stringify(a.sections), /fournisseur/i, 'jamais de fournisseur');
    assert.equal(a.slug, '400-invites-dans-un-hangar-une-soiree-100-italienne');
    /* brouillon : invisible pour les clients */
    assert.equal((await fetch(base + '/blog/' + a.slug)).status, 404);
    assert.equal((await fetch(base + '/blog/' + a.slug + '?apercu', { headers: { cookie } })).status, 200, 'aperçu de l’équipe');
    /* réécriture avec une consigne */
    const r2 = await call('/api/admin/ia/blog', { method: 'POST', body: { id: a.id, consigne: 'plus court' } });
    assert.equal(r2.j.article.titre, 'Un titre plus court');
    assert.match(appels.at(-1).prompt, /plus court/);
    /* publier */
    const pub = await call('/api/admin/blog/' + a.id, { method: 'PUT', body: { ...r2.j.article, statut: 'publie', citation: { texte: 'Merci pour tout', auteur: 'Giulia' } } });
    assert.equal(pub.status, 200, JSON.stringify(pub.j));
    assert.ok(pub.j.article.publieLe);
    assert.equal(pub.j.article.slug, 'un-titre-plus-court', 'tant qu’il est en brouillon, l’adresse suit le titre');
    a.slug = pub.j.article.slug;
    const page = await (await fetch(base + '/blog/' + a.slug)).text();
    assert.match(page, /Un titre plus court/);
    assert.match(page, /class="ba-chiffres n2"/);
    assert.match(page, /« Merci pour tout »/);
    assert.match(page, /"@type":"BlogPosting"/);
    const accueil = await (await fetch(base + '/')).text();
    assert.match(accueil, /Nos événements en reportage/);
    assert.ok(accueil.indexOf('etapes-sec') < accueil.indexOf('rep-sec'), 'bloc juste après « Comment commander »');
    assert.match(await (await fetch(base + '/blog')).text(), /Un titre plus court/);
    assert.doesNotMatch(await (await fetch(base + '/blog?type=particuliers')).text(), /Un titre plus court/);
    assert.match(await (await fetch(base + '/sitemap.xml')).text(), new RegExp('/blog/' + a.slug));
    /* publier sans photo : refusé */
    const vide = await call('/api/admin/blog', { method: 'POST', body: { titre: 'Sans photo', sections: [{ texte: 'x' }] } });
    assert.equal((await call('/api/admin/blog/' + vide.j.id, { method: 'PUT', body: { ...vide.j.article, statut: 'publie' } })).status, 400);
    /* rappel : rien juste après une publication ; envoyé 3 jours plus tard à 10 h, une seule fois */
    await call('/api/admin/blog/reglages', { method: 'PUT', body: { actif: true, jours: 3, heure: 9, tel: '06 12 34 56 78', email: 'chef@magnolia.test' } });
    assert.equal(await app.locals.rappelBlog(Date.now()), null);
    const dans3 = Date.parse(pub.j.article.publieLe) + 3 * 86400e3;
    const t = new Date(dans3); t.setUTCHours(9, 30); /* 10 h 30 à Paris */
    const envoi = await app.locals.rappelBlog(t.getTime() < dans3 ? t.getTime() + 86400e3 : t.getTime());
    assert.deepEqual(envoi, { sms: 1, emails: 1 });
    assert.equal(await app.locals.rappelBlog(t.getTime() + 86400e3 + 3600e3), null, 'pas deux fois');
    const out = (await call('/api/admin/actions/envois')).j.envois;
    assert.ok(out.some(x => /prochain reportage/.test(JSON.stringify(x)) && /admin#\/blog\/nouveau/.test(JSON.stringify(x))), 'SMS avec le lien du back-office');
    /* suppression */
    assert.equal((await call('/api/admin/blog/' + a.id, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(base + '/blog/' + a.slug)).status, 404);
  } finally { srv.close(); }
});
