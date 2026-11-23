/* Page Plateaux de fruits de mer : boutons − / + de la sélection (même panier « mg_sel » que le reste du site).
   La photo du plateau à gauche est décorative : elle tourne doucement en CSS, sans lien avec les produits choisis. */
(() => {
  const el = document.querySelector('[data-p3]');
  if (!el) return;
  const PRODUITS = JSON.parse(el.querySelector('[data-p3-produits]')?.textContent || '[]');
  const parSlug = new Map(PRODUITS.map(p => [p.slug, p]));
  const lire = () => { try { return JSON.parse(localStorage.getItem('mg_sel') || '[]'); } catch { return []; } };
  const ecrire = l => { try { localStorage.setItem('mg_sel', JSON.stringify(l)); } catch { /* navigation privée */ } document.querySelectorAll('[data-sel-count]').forEach(b => { b.textContent = l.length; b.hidden = !l.length; }); };
  const euros = c => (Math.round(c) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ') + ' €';
  const lignes = () => lire().filter(l => parSlug.has(l.slug) && !l.variante);
  const qteDe = slug => lignes().filter(l => l.slug === slug).reduce((a, l) => a + (+l.qte || 0), 0);
  const total = el.querySelector('[data-p3-total]'), pied = el.querySelector('[data-p3-pied]');

  function majTout() {
    const L = lignes();
    const tot = L.reduce((a, l) => a + (parSlug.get(l.slug).prixCents || 0) * (+l.qte || 0), 0);
    if (total) total.textContent = L.length ? euros(tot) + ' TTC' : '';
    if (pied) pied.hidden = !L.length;
    el.querySelectorAll('[data-p3-ligne]').forEach(li => { const q = qteDe(li.dataset.p3Ligne); li.querySelector('[data-p3-q]').textContent = q; li.classList.toggle('on', q > 0); li.querySelector('[data-p3-moins]').disabled = !q; });
  }
  /* départ = la quantité minimum du produit */
  function changer(slug, d) {
    const P = parSlug.get(slug); if (!P) return;
    const l = lire();
    const i = l.findIndex(x => x.slug === slug && !x.variante);
    const min = P.min || 1;
    if (i < 0) { if (d > 0) l.push({ slug: P.slug, titre: P.titre, photo: P.photo, rubrique: P.rubrique, unite: P.unite, min, prixCents: P.prixCents, qte: min, variante: '', choix: {}, supCents: 0, resume: 'Dressé sur notre plateau de fruits de mer', note: '', personnel: null, pack: null, lieu: false, key: Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }); }
    else { const n = (+l[i].qte || 0) + d; if (n < min) l.splice(i, 1); else l[i].qte = n; }
    ecrire(l); majTout();
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-p3-plus],[data-p3-moins]');
    if (b) changer(b.closest('[data-p3-ligne]').dataset.p3Ligne, b.hasAttribute('data-p3-plus') ? 1 : -1);
  });
  addEventListener('storage', e => { if (e.key === 'mg_sel') majTout(); });
  addEventListener('pageshow', majTout);
  majTout();
})();
