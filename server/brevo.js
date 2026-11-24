'use strict';
/*
 * Envois e-mail et SMS via Brevo (https://developers.brevo.com).
 * Sans clé BREVO_API_KEY, rien n'est envoyé : chaque message est seulement noté dans le journal
 * « _outbox » (mode test), ce qui permet de tout vérifier avant l'ouverture.
 */
const API = 'https://api.brevo.com/v3';

/* numéro au format international sans « + » : 06 12 34 56 78 → 33612345678 */
function normPhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^0[1-9]\d{8}$/.test(d)) d = '33' + d.slice(1);
  return /^\d{6,15}$/.test(d) ? d : '';
}
const isEmail = s => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || '').trim());
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function createBrevo({ env = process.env, store, log = console } = {}) {
  const key = env.BREVO_API_KEY || '';
  const from = { name: env.MAIL_FROM_NAME || 'Magnolia Traiteur', email: env.MAIL_FROM || 'infos@magnoliatraiteur.fr' };
  const smsSender = (env.SMS_SENDER || 'Magnolia').replace(/[^A-Za-z0-9]/g, '').slice(0, 11) || 'Magnolia';
  const live = !!key;

  async function record(kind, payload, result) {
    try {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await store?.set('_outbox/' + id, { kind, at: new Date().toISOString(), live, payload, result });
    } catch { /* le journal ne doit jamais bloquer un envoi */ }
  }

  async function call(pathName, body) {
    const r = await fetch(API + pathName, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) throw Object.assign(new Error('Brevo ' + r.status + ' : ' + (data?.message || text)), { status: r.status, data });
    return data;
  }

  async function sendEmail({ to, name = '', subject, html, text, replyTo, bcc, attachment, headers, tags, journal = true }) {
    if (!isEmail(to)) return { skipped: 'adresse invalide' };
    const body = { sender: from, to: [{ email: String(to).trim(), name: name || undefined }], subject, htmlContent: html, textContent: text };
    if (headers && typeof headers === 'object') body.headers = headers;
    if (Array.isArray(tags) && tags.length) body.tags = tags.map(String).slice(0, 5);
    if (replyTo && isEmail(replyTo)) body.replyTo = { email: replyTo };
    if (Array.isArray(attachment) && attachment.length) body.attachment = attachment.slice(0, 3).map(x => ({ name: String(x.name || 'piece-jointe').slice(0, 80), content: String(x.content || '') }));
    if (bcc && isEmail(bcc) && String(bcc).trim().toLowerCase() !== String(to).trim().toLowerCase()) body.bcc = [{ email: String(bcc).trim() }];
    const rec = journal ? record : async () => {};
    if (!live) { await rec('email', body, 'test'); return { test: true }; }
    try { const res = await call('/smtp/email', body); await rec('email', body, res); return res; }
    catch (e) { log.error?.('[brevo] e-mail', e.message); await rec('email', body, { error: e.message }); return { error: e.message }; }
  }

  async function sendSms({ to, content, type = 'transactional', tag, unicode, journal = true }) {
    const recipient = normPhone(to);
    if (!recipient) return { skipped: 'numéro invalide' };
    const body = { sender: smsSender, recipient, content: String(content).slice(0, 612), type: type === 'marketing' ? 'marketing' : 'transactional', unicodeEnabled: unicode ?? /[^\x00-\x7F€éèêàâùûôîïçÉÈÀ]/.test(content) };
    if (tag) body.tag = String(tag).slice(0, 60);
    const rec = journal ? record : async () => {};
    if (!live) { await rec('sms', body, 'test'); return { test: true }; }
    try {
      let res;
      /* adresse de l'API SMS de Brevo : /transactionalSMS/sms ; repli sur /transactionalSMS/send si elle n'existe pas */
      try { res = await call('/transactionalSMS/sms', body); }
      catch (e) { if (e.status !== 404) throw e; res = await call('/transactionalSMS/send', body); }
      await rec('sms', body, res); return res;
    }
    catch (e) { log.error?.('[brevo] sms', e.message); await rec('sms', body, { error: e.message }); return { error: e.message }; }
  }

  return { sendEmail, sendSms, live };
}

module.exports = { createBrevo, normPhone, isEmail, esc };
