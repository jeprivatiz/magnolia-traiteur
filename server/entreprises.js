'use strict';
/*
 * Entreprises (demande de Jean-Luc, 2026-11-24) : Back-office › Clients a un bandeau « Contacts / Entreprises ».
 * Une entreprise a sa fiche (nom, SIRET, adresse…) ; plusieurs contacts (fiches clients) peuvent y être reliés par `entrepriseId`.
 * La case « Société » d'un contact reste remplie avec le nom de l'entreprise (devis, factures, recherches l'utilisent déjà).
 * Reprise automatique : un contact qui a une Société mais aucune entreprise reliée (fiches existantes, site, import Excel)
 * est relié à l'entreprise du même nom, créée si besoin (« JEPRIVATIZ SAS » et « Jeprivatiz » = la même).
 */
const { rid } = require('./util');

const sansAcc = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const FORMES = new Set(['sarl', 'sas', 'sasu', 'sa', 'eurl', 'sci', 'snc', 'selarl', 'scop', 'scp', 'ste', 'societe', 'ets', 'etablissements']);
function cleEntreprise(nom) {
  const mots = sansAcc(nom).replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  while (mots.length > 1 && FORMES.has(mots[0])) mots.shift();
  while (mots.length > 1 && FORMES.has(mots[mots.length - 1])) mots.pop();
  return mots.join(' ');
}
const net = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const CHAMPS = ['nom', 'siret', 'tva', 'adresse', 'cp', 'ville', 'tel', 'email', 'site', 'secteur', 'notes'];

function creerEntreprises({ store, log = console, totaux }) {
  let verrou = null, versionVue = '', index = null;

  async function versions() { return (await Promise.all(['clients', 'entreprises'].map(k => store.version(k)))).join('|'); }

  async function nouvelle(nom, extra = {}) {
    const id = 'e_' + rid(8).replace(/[^A-Za-z0-9]/g, 'x');
    const data = { nom: net(nom), cle: cleEntreprise(nom), createdAt: new Date().toISOString(), ...extra };
    await store.set('entreprises/' + id, data);
    return { id, data };
  }

  /* relie les contacts qui ont une Société sans entreprise ; retire le lien des contacts sans Société */
  async function synchro() {
    if (verrou) return verrou;
    verrou = (async () => {
      const v = await versions();
      if (v === versionVue) return;
      const ents = await store.list('entreprises');
      const parCle = new Map(), ids = new Set();
      for (const { id, data } of ents) { ids.add(id); const k = data.cle || cleEntreprise(data.nom); if (k && !parCle.has(k)) parCle.set(k, id); }
      let crees = 0, lies = 0;
      for (const { id, data: c } of await store.list('clients')) {
        if (!c) continue;
        const soc = net(c.societe);
        if (!soc) { if (c.entrepriseId) { const { entrepriseId, ...reste } = c; await store.set('clients/' + id, reste); } continue; }
        if (c.entrepriseId && ids.has(c.entrepriseId)) continue;
        const k = cleEntreprise(soc); if (!k) continue;
        let eid = parCle.get(k);
        if (!eid) { eid = (await nouvelle(soc, { source: 'reprise' })).id; parCle.set(k, eid); ids.add(eid); crees++; }
        await store.set('clients/' + id, { ...c, entrepriseId: eid }); lies++;
      }
      if (crees || lies) log.info?.(`Entreprises : ${crees} créée(s), ${lies} contact(s) relié(s).`);
      versionVue = await versions();
    })().finally(() => { verrou = null; });
    return verrou;
  }

  /* avant l'enregistrement d'une fiche contact : la Société et l'entreprise reliée restent d'accord */
  async function avantClient(data, before) {
    const choisie = data.entrepriseId && data.entrepriseId !== (before?.entrepriseId || '');
    if (choisie) {
      const e = await store.get('entreprises/' + data.entrepriseId);
      if (e) { data.societe = e.nom; return; }
      data.entrepriseId = '';
    }
    const soc = net(data.societe);
    if (soc !== net(before?.societe) || (soc && !data.entrepriseId)) {
      data.entrepriseId = '';
      if (soc) {
        const k = cleEntreprise(soc);
        const trouve = k && (await store.list('entreprises')).find(x => (x.data.cle || cleEntreprise(x.data.nom)) === k);
        data.entrepriseId = trouve ? trouve.id : k ? (await nouvelle(soc, { source: 'fiche contact' })).id : '';
      }
    }
    if (!data.entrepriseId) delete data.entrepriseId;
  }

  async function annuaire() {
    await synchro();
    const v = await versions();
    if (index?.v === v) return index;
    const [ents, cl] = await Promise.all([store.list('entreprises'), store.list('clients')]);
    const contacts = new Map();
    for (const { id, data: c } of cl) if (c?.entrepriseId) { let l = contacts.get(c.entrepriseId); if (!l) contacts.set(c.entrepriseId, l = []); l.push({ id, ...c, journal: undefined }); }
    const items = ents.map(({ id, data: e }) => {
      const l = contacts.get(id) || [];
      const last = [e.updatedAt, e.createdAt, ...l.map(c => c.derniereActivite)].filter(Boolean).map(String).sort().pop() || '';
      return { id, e: { ...e, id }, nb: l.length, last, importe: l.length > 0 && l.every(c => c.source === 'import CRM'),
        noms: l.slice(0, 3).map(c => c.nom).filter(Boolean),
        hay: sansAcc([e.nom, e.siret, e.ville, e.cp, e.secteur, e.email, ...l.map(c => [c.nom, c.email, c.tel].join(' '))].join(' ')) };
    });
    items.sort((a, b) => b.last.localeCompare(a.last) || String(a.e.nom).localeCompare(String(b.e.nom)));
    index = { v, items, contacts };
    return index;
  }

  async function nombre() { try { return (await annuaire()).items.length; } catch { return 0; } }

  /* le nom change : on le reporte sur la case Société des contacts (et sur leurs demandes, comme une fiche contact corrigée) */
  async function reporterNom(id, nom) {
    const ids = new Set();
    for (const { id: cid, data: c } of await store.list('clients')) if (c?.entrepriseId === id) { ids.add(cid); if (c.societe !== nom) await store.set('clients/' + cid, { ...c, societe: nom }); }
    if (ids.size) for (const { id: did, data: d } of await store.list('demandes')) if (ids.has(d.clientId) && d.contact && d.contact.societe !== nom) await store.set('demandes/' + did, { ...d, contact: { ...d.contact, societe: nom } });
  }

  function routes(A, { sameSite, json, wrap, audit }) {
    A.get('/entreprises', wrap(async (req, res) => {
      const { items } = await annuaire();
      const q = sansAcc(req.query.q || '').trim().slice(0, 80), mots = q.split(/\s+/).filter(Boolean);
      let l = mots.length ? items.filter(a => mots.every(w => a.hay.includes(w))) : items;
      if (req.query.filtre === 'avec') l = l.filter(a => a.nb); else if (req.query.filtre === 'sans') l = l.filter(a => !a.nb);
      const par = Math.min(200, Math.max(5, parseInt(req.query.par, 10) || 50)), page = Math.max(1, parseInt(req.query.page, 10) || 1);
      res.set('Cache-Control', 'no-store').json({ total: l.length, tous: items.length, contacts: items.reduce((s, a) => s + a.nb, 0), page, par,
        items: l.slice((page - 1) * par, page * par).map(a => ({ ...a.e, nbContacts: a.nb, derniereActivite: a.last, apercu: a.noms })) });
    }));
    A.get('/entreprises/:id', wrap(async (req, res) => {
      const e = await store.get('entreprises/' + req.params.id);
      if (!e) return res.status(404).json({ error: 'Entreprise introuvable.' });
      const { contacts } = await annuaire();
      const l = (contacts.get(req.params.id) || []).sort((a, b) => String(b.derniereActivite || '').localeCompare(String(a.derniereActivite || '')));
      const ids = new Set(l.map(c => c.id));
      const devis = (await store.list('devis')).map(x => ({ id: x.id, ...x.data })).filter(d => ids.has(d.clientId))
        .map(d => ({ id: d.id, numero: d.numero, statut: d.statut, clientId: d.clientId, clientNom: l.find(c => c.id === d.clientId)?.nom || '', ttcCents: totaux(d).ttcCents, createdAt: d.createdAt, evenement: d.evenement || null }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const signe = devis.filter(d => d.statut === 'accepte');
      res.set('Cache-Control', 'no-store').json({ entreprise: { ...e, id: req.params.id },
        contacts: l.map(c => ({ id: c.id, nom: c.nom, fonction: c.fonction || '', email: c.email || '', tel: c.tel || '', ville: c.ville || '', derniereActivite: c.derniereActivite || '', source: c.source || '' })),
        devis, resume: { nbDevis: devis.length, nbSignes: signe.length, signeCents: signe.reduce((s, d) => s + (d.ttcCents || 0), 0) } });
    }));
    const lire = b => { const o = {}; for (const k of CHAMPS) if (k in (b || {})) o[k] = k === 'notes' || k === 'adresse' ? String(b[k] ?? '').trim() : net(b[k]); if (o.cp) o.cp = o.cp.replace(/\s/g, ''); if (o.email) o.email = o.email.toLowerCase(); return o; };
    A.post('/entreprises', sameSite, json, wrap(async (req, res) => {
      const f = lire(req.body);
      if (!f.nom) return res.status(400).json({ error: 'Indiquez le nom de l’entreprise.' });
      const k = cleEntreprise(f.nom);
      const deja = (await store.list('entreprises')).find(x => (x.data.cle || cleEntreprise(x.data.nom)) === k);
      if (deja) return res.status(409).json({ error: `L’entreprise « ${deja.data.nom} » existe déjà.`, id: deja.id });
      const { id } = await nouvelle(f.nom, { ...f, source: 'back-office', par: req.ctx.name || '' });
      audit(req.ctx, 'création', 'entreprises/' + id, f.nom);
      res.json({ ok: true, id });
    }));
    A.put('/entreprises/:id', sameSite, json, wrap(async (req, res) => {
      const before = await store.get('entreprises/' + req.params.id);
      if (!before) return res.status(404).json({ error: 'Entreprise introuvable.' });
      const f = lire(req.body);
      if ('nom' in f && !f.nom) return res.status(400).json({ error: 'Le nom de l’entreprise ne peut pas être vide.' });
      const nom = f.nom || before.nom, k = cleEntreprise(nom);
      if (k !== (before.cle || cleEntreprise(before.nom))) {
        const deja = (await store.list('entreprises')).find(x => x.id !== req.params.id && (x.data.cle || cleEntreprise(x.data.nom)) === k);
        if (deja) return res.status(409).json({ error: `Une autre fiche s’appelle déjà « ${deja.data.nom} ».`, id: deja.id });
      }
      await store.set('entreprises/' + req.params.id, { ...before, ...f, nom, cle: k, updatedAt: new Date().toISOString() });
      if (nom !== before.nom) await reporterNom(req.params.id, nom);
      audit(req.ctx, 'modification', 'entreprises/' + req.params.id, nom);
      res.json({ ok: true, id: req.params.id });
    }));
    /* relier ou détacher un contact */
    A.post('/entreprises/:id/contacts', sameSite, json, wrap(async (req, res) => {
      const e = await store.get('entreprises/' + req.params.id);
      if (!e) return res.status(404).json({ error: 'Entreprise introuvable.' });
      const cid = String(req.body?.clientId || ''), c = cid && await store.get('clients/' + cid);
      if (!c) return res.status(404).json({ error: 'Contact introuvable.' });
      const nouv = { ...c, updatedAt: new Date().toISOString() };
      if (req.body.retirer) { if (c.entrepriseId !== req.params.id) return res.json({ ok: true }); delete nouv.entrepriseId; nouv.societe = ''; }
      else { nouv.entrepriseId = req.params.id; nouv.societe = e.nom; }
      await store.set('clients/' + cid, nouv);
      for (const { id: did, data: d } of await store.list('demandes')) if (d.clientId === cid && d.contact && (d.contact.societe || '') !== nouv.societe) await store.set('demandes/' + did, { ...d, contact: { ...d.contact, societe: nouv.societe } });
      audit(req.ctx, req.body.retirer ? 'contact détaché' : 'contact relié', 'entreprises/' + req.params.id, c.nom || '');
      res.json({ ok: true });
    }));
    /* supprimer une entreprise : ses contacts restent, simplement détachés */
    A.delete('/entreprises/:id', sameSite, wrap(async (req, res) => {
      const e = await store.get('entreprises/' + req.params.id);
      if (!e) return res.json({ ok: true });
      let n = 0;
      for (const { id: cid, data: c } of await store.list('clients')) if (c?.entrepriseId === req.params.id) { const { entrepriseId, ...reste } = c; await store.set('clients/' + cid, { ...reste, societe: '' }); n++; }
      await store.set('_corbeille/entreprises-' + req.params.id + '-' + Date.now(), { path: 'entreprises/' + req.params.id, data: e, par: req.ctx.name, at: new Date().toISOString() });
      await store.delete('entreprises/' + req.params.id);
      audit(req.ctx, 'suppression (corbeille)', 'entreprises/' + req.params.id, e.nom);
      res.json({ ok: true, detaches: n });
    }));
  }

  return { synchro, avantClient, annuaire, nombre, routes, cleEntreprise };
}

module.exports = { creerEntreprises, cleEntreprise };
