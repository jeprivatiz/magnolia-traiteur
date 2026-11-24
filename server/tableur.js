'use strict';
/*
 * Lecture et écriture de tableaux Excel (.xlsx) et CSV, sans dépendance.
 * - lireTableau(buffer, nomFichier) -> { lignes: [[cellule, ...], ...] } (la première ligne = les titres)
 * - ecrireXlsx(feuilles) -> Buffer d'un classeur .xlsx  (feuilles = [{ nom, lignes, largeurs }])
 */
const zlib = require('zlib');

/* ---------- zip ---------- */
function lireZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Fichier Excel illisible (archive incomplète).');
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10), taille = buf.readUInt32LE(p + 20);
    const ln = buf.readUInt16LE(p + 28), le = buf.readUInt16LE(p + 30), lc = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + ln);
    files.set(nom, { methode, taille, off });
    p += 46 + ln + le + lc;
  }
  return nom => {
    const f = files.get(nom); if (!f) return null;
    const debut = f.off + 30 + buf.readUInt16LE(f.off + 26) + buf.readUInt16LE(f.off + 28);
    const data = buf.subarray(debut, debut + f.taille);
    return (f.methode === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
  };
}
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function ecrireZip(fichiers) {
  const parts = [], centre = []; let off = 0;
  for (const [nom, contenu] of fichiers) {
    const data = Buffer.from(contenu, 'utf8'), comp = zlib.deflateRawSync(data), nm = Buffer.from(nom, 'utf8'), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    parts.push(h, nm, comp); centre.push(c, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centre), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(fichiers.length, 8); e.writeUInt16LE(fichiers.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

/* ---------- xml ---------- */
const deXml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e.toLowerCase()]);
const enXml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const texteSi = x => { const t = []; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g; let m; while ((m = re.exec(x))) t.push(m[1] || ''); return deXml(t.join('')); };
const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

/* date Excel (nombre de jours depuis 1899-12-30) */
const dateExcel = n => { const d = new Date(Math.round((n - 25569) * 864e5)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };

function lireXlsx(buf) {
  const lire = lireZip(buf);
  const wb = lire('xl/workbook.xml');
  if (!wb) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx).');
  /* première feuille du classeur */
  const rid = (wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/) || wb.match(/<sheet\b[^>]*\bid="([^"]+)"/) || [])[1];
  const rels = lire('xl/_rels/workbook.xml.rels') || '';
  let cible = '';
  for (const m of rels.matchAll(/<Relationship\b([^>]*)>/g)) if (new RegExp(`\\bId="${rid}"`).test(m[1])) cible = (m[1].match(/Target="([^"]+)"/) || [])[1] || '';
  const chemin = !cible ? 'xl/worksheets/sheet1.xml' : cible.startsWith('/') ? cible.slice(1) : 'xl/' + cible.replace(/^\.\//, '');
  const sheet = lire(chemin) || lire('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('Feuille introuvable dans le classeur.');
  const ss = [];
  const sst = lire('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(texteSi(m[1]));
  /* styles de date (pour transformer 45123 en 2023-07-15) */
  const dates = new Set();
  const st = lire('xl/styles.xml');
  if (st) {
    const persos = new Map(); for (const m of st.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) persos.set(+m[1], deXml(m[2]));
    const xfs = (st.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || '';
    let i = 0;
    for (const m of xfs.matchAll(/<xf\b([^>]*)\/?>/g)) {
      const id = +((m[1].match(/numFmtId="(\d+)"/) || [])[1] || 0);
      const code = persos.get(id) || '';
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (code && /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/^[#0.,%\s]+$/.test(code))) dates.add(i);
      i++;
    }
  }
  const lignes = [];
  for (const r of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const num = +(((r[1] || r[3] || '').match(/\br="(\d+)"/) || [])[1] || lignes.length + 1);
    const cells = [];
    let auto = 0;
    for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = c[1], body = c[2] || '';
      const ref = (a.match(/\br="([A-Z]+\d*)"/) || [])[1];
      const col = ref ? colIndex(ref) : auto; auto = col + 1;
      const t = (a.match(/\bt="([^"]+)"/) || [])[1] || 'n';
      const s = +((a.match(/\bs="(\d+)"/) || [])[1] || -1);
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = ss[+v] ?? '';
      else if (t === 'inlineStr') val = texteSi(body);
      else if (t === 'b') val = v === '1' ? 'VRAI' : 'FAUX';
      else if (v != null) {
        val = deXml(v);
        if (t === 'n' && val !== '') {
          const n = +val;
          if (dates.has(s) && n > 0 && n < 2958466) val = dateExcel(n);
          else if (Number.isFinite(n) && /e/i.test(val)) val = n.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 10 });
        }
      }
      cells[col] = String(val);
    }
    while (lignes.length < num - 1) lignes.push([]);
    lignes.push(Array.from(cells, x => x ?? ''));
  }
  return lignes;
}

/* ---------- csv ---------- */
function lireCsv(buf) {
  let txt;
  if (buf[0] === 0xff && buf[1] === 0xfe) txt = new TextDecoder('utf-16le').decode(buf.subarray(2));
  else {
    try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { txt = new TextDecoder('windows-1252').decode(buf); }
  }
  txt = txt.replace(/^﻿/, '');
  const premiere = txt.slice(0, txt.search(/\r?\n|$/));
  const sep = [';', '\t', ',', '|'].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const lignes = []; let ligne = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { ligne.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; ligne.push(cell); lignes.push(ligne); ligne = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || ligne.length) { ligne.push(cell); lignes.push(ligne); }
  return lignes;
}

function lireTableau(buf, nom = '') {
  if (!buf || !buf.length) throw new Error('Fichier vide.');
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (/\.xls$/i.test(nom) && !zip) throw new Error('Ancien format Excel (.xls) : dans Excel, faites « Fichier › Enregistrer sous » et choisissez « Classeur Excel (.xlsx) » ou « CSV », puis déposez ce nouveau fichier.');
  if (/\.(numbers|ods)$/i.test(nom)) throw new Error('Format non pris en charge : exportez le fichier en Excel (.xlsx) ou en CSV.');
  const brut = zip ? lireXlsx(buf) : lireCsv(buf);
  const lignes = brut.map(l => l.map(c => String(c ?? '').replace(/ /g, ' ').trim()));
  while (lignes.length && lignes[lignes.length - 1].every(c => !c)) lignes.pop();
  while (lignes.length && lignes[0].every(c => !c)) lignes.shift();
  return lignes;
}

/* ---------- écriture xlsx ---------- */
const lettre = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
function ecrireXlsx(feuilles) {
  const f = [];
  f.push(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
  f.push(['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  f.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${feuilles.map((s, i) => `<sheet name="${enXml(s.nom).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
  f.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  /* style 1 = titre en gras sur fond crème ; style 2 = texte (garde le 0 des téléphones et codes postaux) */
  f.push(['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1F3A2E"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3EBDD"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
  feuilles.forEach((s, i) => {
    const cols = s.largeurs ? `<cols>${s.largeurs.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"${s.texte ? ' style="2"' : ''}/>`).join('')}</cols>` : '';
    const rows = s.lignes.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => v == null || v === '' ? '' : typeof v === 'number' ? `<c r="${lettre(c)}${r + 1}"${r === 0 ? ' s="1"' : ''}><v>${v}</v></c>` : `<c r="${lettre(c)}${r + 1}" t="inlineStr" s="${r === 0 ? 1 : 2}"><is><t xml:space="preserve">${enXml(v)}</t></is></c>`).join('')}</row>`).join('');
    f.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${i === 0 ? ' tabSelected="1"' : ''}>${r1Frozen(s)}</sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`]);
  });
  return ecrireZip(f);
}
const r1Frozen = s => s.figer === false ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';

module.exports = { lireTableau, lireXlsx, lireCsv, ecrireXlsx };
