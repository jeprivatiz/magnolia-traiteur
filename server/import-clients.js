'use strict';
/*
 * Import du fichier clients de l'ancien CRM (Excel .xlsx ou CSV), prévu pour ~60 000 contacts.
 * 1. dépôt du fichier -> aperçu + proposition d'association colonne -> champ
 * 2. vérification à blanc (rien n'est écrit) : nouveaux, complétés, doublons, lignes sans coordonnées
 * 3. import par lots de 1 000 (barre de progression côté back-office), rapport final
 * 4. annulation possible : fiches créées retirées (sauf celles qui ont depuis une demande, un devis…),
 *    cases complétées sur les fiches existantes remises comme avant.
 * Une fiche existante n'est jamais écrasée : on remplit seulement ses cases vides. La désinscription (STOP) n'est jamais touchée.
 */
const multer = require('multer');
const { lireTableau, ecrireXlsx } = require('./tableur');
const { rid, sha, nomPropre: nomCommun } = require('./util');

const CHAMPS = [
  ['', '— Ne pas importer —'],
  ['civilite', 'Civilité (M., Mme…)'],
  ['prenom', 'Prénom'],
  ['nomFamille', 'Nom de famille'],
  ['nom', 'Nom et prénom (dans la même case)'],
  ['societe', 'Société'],
  ['email', 'E-mail'],
  ['tel', 'Téléphone portable'],
  ['tel2', 'Autre téléphone (fixe…)'],
  ['adresse', 'Adresse (rue)'],
  ['cp', 'Code postal'],
  ['ville', 'Ville'],
  ['departement', 'Département'],
  ['caCrm', 'Montant déjà commandé (€ TTC)'],
  ['derniereCommande', 'Date de la dernière commande'],
  ['creeLe', 'Client depuis (date)'],
  ['notes', 'Autre information → Notes'],
];
const CLES = new Set(CHAMPS.map(c => c[0]));
const LOT = 1000;

const sansAccent = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* titre de colonne -> champ le plus probable */
function devinerChamp(titre, dejaPris) {
  const t = sansAccent(titre).replace(/[^a-z0-9]+/g, ' ').trim();
  const r = (() => {
    if (!t) return '';
    if (/^(civ|civilite|titre|genre)$/.test(t)) return 'civilite';
    if (/^(prenom|first ?name|prenoms)/.test(t)) return 'prenom';
    if (/(nom (et|&)? ?prenom|prenom (et|&)? ?nom|nom complet|full ?name|contact|client)$/.test(t) && !/societe|entreprise/.test(t)) return 'nom';
    if (/^(nom|name|last ?name|nom de famille|patronyme)( du client)?$/.test(t)) return 'nomFamille';
    if (/(e ?mail|courriel|mail)/.test(t)) return 'email';
    if (/fixe|bureau|domicile|standard|tel 2|telephone 2|autre tel/.test(t)) return 'tel2';
    if (/(tel|phone|portable|mobile|gsm|cellulaire)/.test(t)) return dejaPris.has('tel') ? 'tel2' : 'tel';
    if (/^(cp|code postal|code post|postal|zip)/.test(t)) return 'cp';
    if (/^(ville|commune|localite|city)/.test(t)) return 'ville';
    if (/^(dep|dept|departement)/.test(t)) return 'departement';
    if (/(adresse|rue|address|voie)/.test(t)) return 'adresse';
    if (/(societe|entreprise|raison sociale|company|organisation|structure)/.test(t)) return 'societe';
    if (/(derniere (commande|prestation|vente|facture|achat)|dernier achat|date derniere)/.test(t)) return 'derniereCommande';
    if (/(^ca\b|chiffre d affaires|montant|total|depense)/.test(t)) return 'caCrm';
    if (/(date (de )?creation|cree le|client depuis|premiere commande|date d ajout)/.test(t)) return 'creeLe';
    return 'notes';
  })();
  dejaPris.add(r);
  return r;
}

/* ---------- normalisation ---------- */
/* Prénom « Jean-Luc », nom « BERNARD » (règle de Jean-Luc) */
const prenomPropre = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR').replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('fr-FR'));
const nomPropre = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
const DOM_MOBILE = [['0690', '590'], ['0691', '590'], ['0694', '594'], ['0696', '596'], ['0697', '596'], ['0692', '262'], ['0693', '262'], ['0639', '262']];
const DOM_FIXE = [['0590', '590'], ['0594', '594'], ['0596', '596'], ['0262', '262'], ['0269', '262']];
function normTel(brut) {
  const s = String(brut || '').trim();
  if (!s) return null;
  const inter = s.startsWith('+') || /^00[1-9]/.test(s.replace(/\s/g, ''));
  let d = s.replace(/\D/g, '');
  if (/^00/.test(d) && inter) d = d.slice(2);
  let nat = null;
  if (inter) {
    if (d.startsWith('33') && d.length === 11) nat = '0' + d.slice(2);
    else if (/^(590|594|596|262)/.test(d) && d.length === 12) nat = '0' + d.slice(3);
    else if (d.length >= 8 && d.length <= 15) return { tel: '+' + d, e164: '+' + d, mobile: true, ok: true };
    else return { tel: s, e164: '', mobile: false, ok: false };
  } else if (d.length === 10 && d[0] === '0') nat = d;
  else if (d.length === 9 && /^[1-9]/.test(d)) nat = '0' + d; /* Excel a mangé le 0 */
  else if (d.length === 11 && d.startsWith('33')) nat = '0' + d.slice(2);
  if (!nat) return { tel: s, e164: '', mobile: false, ok: false };
  const ind = (DOM_MOBILE.find(([p]) => nat.startsWith(p)) || DOM_FIXE.find(([p]) => nat.startsWith(p)) || [, '33'])[1];
  return { tel: nat.replace(/(\d{2})(?=\d)/g, '$1 '), e164: '+' + ind + nat.slice(1), mobile: /^0[67]/.test(nat), ok: true };
}
/* 9 derniers chiffres : même numéro quelle que soit l'écriture (06…, +33 6…, 0033…) */
const telCle = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const normEmail = e => { const x = String(e || '').trim().toLowerCase().replace(/^mailto:/, ''); return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x) ? x : null; };
function normCp(v) {
  let d = String(v || '').replace(/\s/g, '');
  if (/^\d{4}$/.test(d)) d = '0' + d; /* 1000 -> 01000 */
  return /^\d{5}$/.test(d) ? d : '';
}
function departementDe(cp) {
  if (!cp) return '';
  if (/^9[78]/.test(cp)) return cp.slice(0, 3);
  if (cp.startsWith('20')) return +cp < 20200 ? '2A' : '2B';
  return cp.slice(0, 2);
}
function normDep(v) {
  const s = String(v || '').toUpperCase();
  const m = s.match(/\b(2A|2B|97\d|\d{1,2})\b/);
  return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) : '';
}
function normDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { const y = m[3].length === 2 ? (+m[3] > 50 ? '19' : '20') + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) return new Date(Math.round((+s - 25569) * 864e5)).toISOString().slice(0, 10);
  return '';
}
function normEuros(v) {
  const s = String(v || '').replace(/[\s €]|EUR/gi, '');
  if (!s) return null;
  const x = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Math.round(parseFloat(x) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* une ligne du fichier -> fiche client */
function construire(ligne, colonnes, entetes) {
  const f = {}, notes = [], soucis = [], tels = [], emails = [];
  const ajout = (k, v) => { f[k] = f[k] ? f[k] + (k === 'adresse' ? ', ' : ' ') + v : v; };
  colonnes.forEach((champ, i) => {
    const v = String(ligne[i] ?? '').trim();
    if (!champ || !v) return;
    switch (champ) {
      case 'email': for (const e of v.split(/[\s;,]+/).filter(Boolean)) { const n = normEmail(e); if (n) emails.push(n); else { soucis.push('email'); notes.push(`${entetes[i] || 'E-mail'} : ${e}`); } } break;
      case 'tel': case 'tel2': for (const t of v.split(/\s*[/;|]\s*|\s+(?:ou|et)\s+/i).filter(Boolean)) { const n = normTel(t); if (n?.ok) tels.push({ ...n, autre: champ === 'tel2' }); else if (n) { soucis.push('tel'); notes.push(`${entetes[i] || 'Téléphone'} : ${t}`); } } break;
      case 'cp': { const cp = normCp(v); if (cp) f.cp = cp; else notes.push(`${entetes[i] || 'Code postal'} : ${v}`); break; }
      case 'departement': { const d = normDep(v); if (d) f.departement = d; break; }
      case 'caCrm': { const c = normEuros(v); if (c != null) f.caCrmCents = (f.caCrmCents || 0) + c; else notes.push(`${entetes[i]} : ${v}`); break; }
      case 'derniereCommande': case 'creeLe': { const d = normDate(v); if (d) { if (!f[champ] || d > f[champ]) f[champ] = d; } else notes.push(`${entetes[i]} : ${v}`); break; }
      case 'notes': notes.push(entetes[i] ? `${entetes[i]} : ${v}` : v); break;
      default: ajout(champ, v);
    }
  });
  if (f.prenom) f.prenom = prenomPropre(f.prenom);
  if (f.nomFamille) f.nomFamille = nomPropre(f.nomFamille);
  /* même règle que partout dans le back-office : « Jean-Luc BERNARD » */
  f.nom = f.nom ? nomCommun(f.nom) : nomCommun(f.prenom || '', f.nomFamille || '');
  if (f.civilite) f.civilite = f.civilite.replace(/^(monsieur|mr)\.?$/i, 'M.').replace(/^(madame|mme)\.?$/i, 'Mme');
  if (!f.departement && f.cp) f.departement = departementDe(f.cp);
  if (emails.length) { f.email = emails[0]; if (emails.length > 1) notes.push('Autre e-mail : ' + emails.slice(1).join(', ')); }
  /* portable d'abord (pour les SMS), puis le reste */
  const tri = [...tels].sort((a, b) => (b.mobile && !b.autre) - (a.mobile && !a.autre));
  const vus = new Set(), uniq = tri.filter(t => !vus.has(telCle(t.e164)) && vus.add(telCle(t.e164)));
  if (uniq[0]) { f.tel = uniq[0].tel; f.telE164 = uniq[0].e164; }
  if (uniq[1]) f.telAutre = uniq.slice(1).map(t => t.tel).join(' / ');
  if (notes.length) f.notes = notes.join('\n');
  return { f, soucis };
}

function creerImportClients({ store, log }) {
  const sessions = new Map();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
  const menage = () => { const lim = Date.now() - 3 * 36e5; for (const [k, s] of sessions) if (s.at < lim) sessions.delete(k); while (sessions.size > 4) sessions.delete(sessions.keys().next().value); };

  /* fiches existantes : retrouver un client par e-mail ou téléphone */
  async function indexClients() {
    const email = new Map(), tel = new Map();
    for (const { id, data: c } of await store.list('clients')) {
      if (c.email) { const e = String(c.email).trim().toLowerCase(); if (!email.has(e)) email.set(e, id); }
      for (const t of [c.telE164, c.tel, c.telAutre]) { const k = telCle(t); if (k && !tel.has(k)) tel.set(k, id); }
    }
    return { email, tel };
  }

  const CHAMPS_FICHE = ['civilite', 'prenom', 'nomFamille', 'nom', 'societe', 'email', 'tel', 'telE164', 'telAutre', 'adresse', 'cp', 'ville', 'departement', 'caCrmCents', 'derniereCommande'];
  /* cases vides de la fiche qu'on peut remplir avec la ligne */
  function completer(c, f) {
    const p = {};
    for (const k of CHAMPS_FICHE) if (f[k] != null && f[k] !== '' && (c[k] == null || c[k] === '')) p[k] = f[k];
    if (p.tel && c.tel) delete p.telE164;
    if (f.notes && !String(c.notes || '').includes(f.notes)) p.notes = (c.notes ? c.notes + '\n' : '') + f.notes;
    return p;
  }

  /* traite les lignes [debut, fin) ; ecrire = false : simple vérification */
  async function traiter(S, colonnes, debut, fin, ecrire, R, meta) {
    const now = new Date().toISOString();
    for (let i = debut; i < fin; i++) {
      const { f, soucis } = construire(S.lignes[i], colonnes, S.entetes);
      if (soucis.includes('tel')) R.telIllisibles++;
      if (soucis.includes('email')) R.emailsIllisibles++;
      if (!f.email && !f.tel && !f.nom && !f.societe) { R.sansCoordonnees++; continue; }
      const ek = f.email || '', tk = telCle(f.telE164 || f.tel);
      const dejaFichier = (ek && S.vus.get('e:' + ek)) || (tk && S.vus.get('t:' + tk));
      const existant = dejaFichier || (ek && S.idx.email.get(ek)) || (tk && S.idx.tel.get(tk));
      const retenir = id => { if (ek) S.vus.set('e:' + ek, id); if (tk) S.vus.set('t:' + tk, id); };
      if (!existant) {
        if (!f.email && !f.tel) R.sansContact++;
        const id = 'c_' + rid(8);
        R.nouveaux++; retenir(id);
        if (R.exemples.length < 5) R.exemples.push({ ligne: i + 2, ...f });
        if (!ecrire) { S.cree.add(id); continue; }
        await store.set('clients/' + id, {
          id, ...f, notes: f.notes || '', creeLe: f.creeLe ? f.creeLe + 'T12:00:00.000Z' : now, derniereActivite: f.derniereCommande ? f.derniereCommande + 'T12:00:00.000Z' : (f.creeLe ? f.creeLe + 'T12:00:00.000Z' : ''),
          source: 'import CRM', importId: meta.id, importCree: meta.id, statutContact: 'client existant',
          consentement: { email: true, sms: true, base: 'client existant (a contacté Magnolia)', le: now, source: `import CRM « ${meta.fichier} »`, par: meta.par },
        });
        if (f.email && !(await store.get('_clientemail/' + sha(f.email)))) await store.set('_clientemail/' + sha(f.email), { id });
        S.idx.email.set(f.email, id); if (tk) S.idx.tel.set(tk, id);
        continue;
      }
      retenir(existant);
      if (dejaFichier) R.doublonsFichier++;
      if (!ecrire) {
        if (!dejaFichier) { if (S.cree.has(existant)) R.doublonsFichier++; else R.completes++; }
        continue;
      }
      const c = await store.get('clients/' + existant);
      if (!c) continue;
      const p = completer(c, f);
      const creeIci = c.importCree === meta.id;
      if (!creeIci) {
        if (!c.consentement) p.consentement = { email: true, sms: true, base: 'client existant (a contacté Magnolia)', le: now, source: `import CRM « ${meta.fichier} »`, par: meta.par };
        if (!c.statutContact) p.statutContact = 'client existant';
        if (!(c.importIds || []).includes(meta.id)) p.importIds = [...(c.importIds || []), meta.id];
      }
      const utiles = Object.keys(p).filter(k => k !== 'importIds');
      if (!dejaFichier) { if (utiles.length) R.completes++; else R.identiques++; }
      if (!Object.keys(p).length) continue;
      if (!creeIci) {
        /* ce qu'il y avait avant, pour pouvoir annuler */
        const ap = '_imports/' + meta.id + '/avant/' + existant;
        const av = (await store.get(ap)) || { id: existant, champs: {} };
        for (const k of Object.keys(p)) if (!(k in av.champs)) av.champs[k] = c[k] === undefined ? null : c[k];
        await store.set(ap, av);
      }
      await store.set('clients/' + existant, { ...c, ...p });
      if (p.email && !(await store.get('_clientemail/' + sha(p.email)))) await store.set('_clientemail/' + sha(p.email), { id: existant });
    }
  }
  const compteurs = () => ({ nouveaux: 0, completes: 0, identiques: 0, doublonsFichier: 0, sansCoordonnees: 0, sansContact: 0, telIllisibles: 0, emailsIllisibles: 0, exemples: [] });
  const lireColonnes = (S, v) => {
    const c = Array.isArray(v) ? v.slice(0, S.entetes.length).map(x => (CLES.has(String(x || '')) ? String(x || '') : '')) : [];
    while (c.length < S.entetes.length) c.push('');
    return c;
  };

  function routes(A, { sameSite, manager, wrap, audit }) {
    const json = require('express').json({ limit: '1mb' });
    const sess = (req, res) => { const S = sessions.get(String(req.body?.tok || '')); if (!S) res.status(410).json({ error: 'Le fichier n’est plus en mémoire (plus de 3 h, ou le site a été remis en ligne entre-temps). Déposez-le à nouveau.' }); return S; };

    A.get('/actions/import-clients/modele.xlsx', wrap(async (req, res) => {
      res.set('Content-Disposition', 'attachment; filename="modele-import-clients-magnolia.xlsx"')
        .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fichierModele());
    }));

    A.post('/actions/import-clients/fichier', sameSite, manager, upload.single('fichier'), wrap(async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
      let lignes;
      try { lignes = lireTableau(req.file.buffer, req.file.originalname); } catch (e) { return res.status(400).json({ error: e.message }); }
      if (lignes.length < 2) return res.status(400).json({ error: 'Le fichier ne contient aucune ligne de client (la première ligne doit contenir les titres des colonnes).' });
      if (lignes.length > 200001) return res.status(400).json({ error: 'Plus de 200 000 lignes : coupez le fichier en plusieurs morceaux.' });
      const n = Math.max(...lignes.slice(0, 50).map(l => l.length));
      const entetes = Array.from({ length: n }, (_, i) => lignes[0][i] || `Colonne ${i + 1}`);
      const data = lignes.slice(1).filter(l => l.some(c => c));
      menage();
      const tok = rid(12);
      sessions.set(tok, { tok, fichier: String(req.file.originalname || 'fichier').slice(0, 120), entetes, lignes: data, at: Date.now(), par: req.ctx.name || req.ctx.email || '' });
      const pris = new Set();
      res.json({ ok: true, tok, fichier: req.file.originalname, total: data.length, entetes, apercu: data.slice(0, 6), proposition: entetes.map(h => devinerChamp(h, pris)), champs: CHAMPS });
    }));

    A.post('/actions/import-clients/verifier', sameSite, manager, json, wrap(async (req, res) => {
      const S = sess(req, res); if (!S) return;
      const colonnes = lireColonnes(S, req.body.colonnes);
      if (!colonnes.some(c => ['email', 'tel', 'tel2', 'nom', 'nomFamille'].includes(c))) return res.status(400).json({ error: 'Associez au moins une colonne au nom, à l’e-mail ou au téléphone.' });
      const V = { ...S, vus: new Map(), cree: new Set(), idx: await indexClients() };
      const R = compteurs();
      await traiter(V, colonnes, 0, S.lignes.length, false, R, { id: '', fichier: S.fichier });
      res.json({ ok: true, total: S.lignes.length, ...R });
    }));

    A.post('/actions/import-clients/lot', sameSite, manager, json, wrap(async (req, res) => {
      const S = sess(req, res); if (!S) return;
      if (req.body.consentement !== true) return res.status(400).json({ error: 'Cochez la case qui confirme que ces contacts sont vos clients.' });
      const colonnes = lireColonnes(S, req.body.colonnes);
      const debut = Math.max(0, parseInt(req.body.debut, 10) || 0);
      if (debut === 0) {
        if (S.imp && !S.imp.fini) return res.status(409).json({ error: 'Cet import est déjà en cours.' });
        const id = 'imp_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '_' + rid(4).replace(/[^A-Za-z0-9]/g, 'x');
        S.imp = { id, fichier: S.fichier, par: S.par, colonnes, R: compteurs(), fini: false, prochain: 0 };
        S.vus = new Map(); S.idx = await indexClients();
        await store.set('_imports/' + id, { id, fichier: S.fichier, at: new Date().toISOString(), par: req.ctx.name || req.ctx.email || '', total: S.lignes.length, statut: 'en cours', colonnes: S.entetes.map((h, i) => [h, colonnes[i]]), compteurs: S.imp.R });
        audit(req.ctx, 'import clients commencé', '_imports/' + id, `${S.fichier} · ${S.lignes.length} ligne(s)`);
      }
      const I = S.imp;
      if (!I) return res.status(400).json({ error: 'Import non commencé.' });
      if (debut !== I.prochain) return res.json({ ok: true, impId: I.id, fait: I.prochain, total: S.lignes.length, fini: I.fini, ...I.R });
      const fin = Math.min(S.lignes.length, debut + LOT);
      await traiter(S, I.colonnes, debut, fin, true, I.R, { id: I.id, fichier: I.fichier, par: I.par });
      I.prochain = fin;
      const doc = await store.get('_imports/' + I.id);
      if (fin >= S.lignes.length) {
        I.fini = true;
        await store.set('_imports/' + I.id, { ...doc, statut: 'terminé', finiLe: new Date().toISOString(), compteurs: I.R });
        audit(req.ctx, 'import clients terminé', '_imports/' + I.id, `${I.R.nouveaux} créé(s), ${I.R.completes} complété(s)`);
        await store.flush?.();
      } else if ((fin / LOT) % 5 === 0) await store.set('_imports/' + I.id, { ...doc, compteurs: I.R, fait: fin });
      res.json({ ok: true, impId: I.id, fait: fin, total: S.lignes.length, fini: I.fini, ...I.R });
    }));

    A.get('/actions/import-clients/historique', wrap(async (req, res) => {
      const l = (await store.list('_imports')).map(d => d.data).sort((a, b) => String(b.at).localeCompare(String(a.at)));
      res.json(l.map(x => ({ ...x, compteurs: { ...x.compteurs, exemples: undefined } })));
    }));

    A.post('/actions/import-clients/:id/annuler', sameSite, manager, wrap(async (req, res) => {
      const id = req.params.id;
      const doc = await store.get('_imports/' + id);
      if (!doc) return res.status(404).json({ error: 'Import introuvable.' });
      if (doc.statut === 'annulé') return res.status(400).json({ error: 'Cet import a déjà été annulé.' });
      for (const S of sessions.values()) if (S.imp?.id === id && !S.imp.fini) return res.status(409).json({ error: 'Cet import est encore en cours : attendez la fin, puis annulez.' });
      const lies = new Set();
      for (const k of ['demandes', 'devis', 'factures']) for (const { data } of await store.list(k)) if (data.clientId) lies.add(data.clientId);
      let retires = 0, gardes = 0, remis = 0;
      for (const { id: cid, data: c } of await store.list('clients')) {
        if (c.importCree !== id) continue;
        if (lies.has(cid) || (c.journal || []).length) { const { importCree, ...reste } = c; await store.set('clients/' + cid, reste); gardes++; continue; }
        await store.delete('clients/' + cid);
        if (c.email) { const ix = await store.get('_clientemail/' + sha(String(c.email).toLowerCase())); if (ix?.id === cid) await store.delete('_clientemail/' + sha(String(c.email).toLowerCase())); }
        retires++;
      }
      for (const { id: cid, data: av } of await store.list('_imports/' + id + '/avant')) {
        const c = await store.get('clients/' + cid);
        if (c) {
          const n = { ...c };
          for (const [k, v] of Object.entries(av.champs || {})) {
            if (k === 'importIds') { n.importIds = (c.importIds || []).filter(x => x !== id); if (!n.importIds.length) delete n.importIds; continue; }
            if (k === 'notes' && v != null && String(c.notes || '').startsWith(String(v))) { n.notes = v; continue; }
            if (v == null) delete n[k]; else n[k] = v;
          }
          await store.set('clients/' + cid, n); remis++;
        }
        await store.delete('_imports/' + id + '/avant/' + cid);
      }
      await store.set('_imports/' + id, { ...doc, statut: 'annulé', annuleLe: new Date().toISOString(), annulePar: req.ctx.name || req.ctx.email || '', annulation: { retires, gardes, remis } });
      audit(req.ctx, 'import clients annulé', '_imports/' + id, `${retires} retiré(s), ${remis} remis comme avant, ${gardes} gardé(s)`);
      await store.flush?.();
      res.json({ ok: true, retires, gardes, remis });
    }));
  }

  return { routes, sessions };
}

/* fichier modèle : les colonnes reconnues d'office, deux exemples, et une feuille d'explications */
function fichierModele() {
  const lignes = [
    ['Civilité', 'Prénom', 'Nom', 'Société', 'E-mail', 'Téléphone portable', 'Autre téléphone', 'Adresse', 'Code postal', 'Ville', 'Montant déjà commandé (€ TTC)', 'Date de la dernière commande', 'Client depuis', 'Type d’événement', 'Remarques'],
    ['Mme', 'Sophie', 'MARTIN', '', 'sophie.martin@exemple.fr', '06 12 34 56 78', '', '12 rue des Lilas', '91140', 'Villebon-sur-Yvette', '850,00', '15/06/2025', '03/02/2021', 'Mariage', 'Allergie aux fruits à coque'],
    ['M.', 'Jean-Pierre', 'DUPONT', 'Société Exemple', 'jp.dupont@exemple.fr', '+33 7 98 76 54 32', '01 69 00 00 00', '5 avenue de la Gare', '75015', 'Paris', '2 340,50', '02/12/2024', '10/09/2019', 'Séminaire', 'Préfère être appelé le matin'],
  ];
  const aide = [
    ['Comment remplir ce fichier'],
    ['1. Gardez la première ligne : ce sont les titres des colonnes. Vos propres titres conviennent aussi : vous associerez chaque colonne à la bonne case au moment de l’import.'],
    ['2. Une ligne = un client. Il faut au moins un nom, un e-mail ou un téléphone.'],
    ['3. Les téléphones peuvent être écrits n’importe comment (06…, +33 6…, 0033 6…, avec ou sans espaces) : ils sont remis au bon format pour les SMS. Les numéros des Antilles (0690, 0696…) sont reconnus.'],
    ['4. Les dates : 15/06/2025 ou 2025-06-15. Les montants : 850 ou 850,00 (en euros TTC).'],
    ['5. Toute autre colonne (type d’événement, remarques…) peut être gardée : elle ira dans les notes de la fiche client.'],
    ['6. Si un client existe déjà (même e-mail ou même téléphone), sa fiche n’est pas écrasée : seules ses cases vides sont complétées.'],
    ['7. Enregistrez en Excel (.xlsx) ou en CSV, puis Back-office › Clients › « Importer des clients ».'],
  ];
  return ecrireXlsx([
    { nom: 'Clients', lignes, largeurs: [10, 14, 16, 20, 28, 20, 18, 26, 12, 22, 16, 16, 14, 18, 30], texte: true },
    { nom: 'Mode d’emploi', lignes: aide, largeurs: [130], figer: false },
  ]);
}

module.exports = { creerImportClients, construire, normTel, telCle, devinerChamp, departementDe, fichierModele, CHAMPS, prenomPropre, nomPropre };
