'use strict';
/*
 * Stockage des documents (même modèle que le prototype : collections / documents JSON).
 * - En ligne : MySQL (Hostinger), activé dès que DB_HOST est défini.
 * - En local : un fichier JSON (var/db.json), pratique pour tester sans base.
 * Chemin d'un document : "collection/id" ou "collection/id/sous-collection/id".
 */
const fs = require('fs');
const path = require('path');

const splitPath = p => {
  const segs = String(p || '').split('/').filter(Boolean);
  return { segs, parent: segs.slice(0, -1).join('/'), id: segs[segs.length - 1] || '' };
};

/* Les grosses collections (fichier clients importé : ~60 000 fiches) sont rangées dans leur propre fichier,
   pour qu'une petite modification ailleurs (une photo, un devis) ne réécrive pas tout le fichier clients.
   Un index par dossier évite de parcourir toute la base à chaque liste. */
const SHARDS = ['clients', '_clientemail', '_imports', 'entreprises', 'affaires', '_histimports'];
const shardOf = k => { const top = k.slice(0, k.indexOf('/') >>> 0); return SHARDS.includes(top) ? top : ''; };

class FileStore {
  constructor(file) {
    this.file = file;
    this.docs = new Map();
    this.parents = new Map(); /* dossier -> Set des chemins */
    this.timers = new Map();
    this.dirty = new Set();
    const lire = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
    const main = lire(file) || {};
    const shards = new Map(SHARDS.map(sh => [sh, lire(this._shardFile(sh))]));
    for (const [k, v] of Object.entries(main)) {
      const sh = shardOf(k);
      if (sh && shards.get(sh)) continue; /* le fichier séparé fait foi */
      this._put(k, v);
      if (sh) this.dirty.add(sh); /* ancienne base d'un seul fichier : on la range au prochain enregistrement */
    }
    for (const [sh, data] of shards) if (data) for (const [k, v] of Object.entries(data)) this._put(k, v);
    if (this.dirty.size) this.dirty.add('');
  }
  _shardFile(sh) { return sh ? this.file.replace(/\.json$/, '') + '.' + sh.replace(/^_/, 'x-') + '.json' : this.file; }
  _put(k, v) {
    if (!this.docs.has(k)) { const par = splitPath(k).parent; let set = this.parents.get(par); if (!set) this.parents.set(par, set = new Set()); set.add(k); }
    this.docs.set(k, v);
  }
  _del(k) {
    if (!this.docs.delete(k)) return;
    const par = splitPath(k).parent, set = this.parents.get(par);
    if (set) { set.delete(k); if (!set.size) this.parents.delete(par); }
  }
  async init() { if (this.dirty.size) await this.flush(); }
  _write(sh) {
    const out = {};
    for (const [k, v] of this.docs) if (shardOf(k) === sh) out[k] = v;
    const f = this._shardFile(sh);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out));
    fs.renameSync(tmp, f);
  }
  _save(k) {
    const sh = shardOf(k);
    this.dirty.add(sh);
    clearTimeout(this.timers.get(sh));
    this.timers.set(sh, setTimeout(() => { this.timers.delete(sh); this.dirty.delete(sh); this._write(sh); }, sh ? 800 : 200));
  }
  async flush() {
    /* fichiers séparés d'abord : si l'écriture est coupée, ils font foi au redémarrage */
    for (const sh of [...SHARDS, '']) {
      if (!this.dirty.has(sh)) continue;
      clearTimeout(this.timers.get(sh)); this.timers.delete(sh); this.dirty.delete(sh);
      this._write(sh);
    }
  }
  async get(p) { const d = this.docs.get(p); return d ? structuredClone(d.data) : null; }
  async set(p, data) { this._put(p, { data: structuredClone(data), updatedAt: Date.now() }); this._save(p); }
  async delete(p) { if (this.docs.has(p)) { this._del(p); this._save(p); } }
  async list(parent) {
    const out = [];
    for (const k of this.parents.get(parent) || []) { const v = this.docs.get(k); out.push({ id: splitPath(k).id, data: structuredClone(v.data), updatedAt: v.updatedAt }); }
    return out;
  }
  async version(parent) {
    let n = 0, max = 0;
    for (const k of this.parents.get(parent) || []) { n++; const u = this.docs.get(k).updatedAt; if (u > max) max = u; }
    return n + ':' + max;
  }
  async close() { await this.flush(); }
}

class MysqlStore {
  constructor(cfg) { this.cfg = cfg; this.pool = null; }
  async init() {
    const mysql = require('mysql2/promise');
    this.pool = mysql.createPool({ ...this.cfg, waitForConnections: true, connectionLimit: 8, charset: 'utf8mb4' });
    await this.pool.query(`CREATE TABLE IF NOT EXISTS docs (
      path VARCHAR(700) NOT NULL PRIMARY KEY,
      parent VARCHAR(700) NOT NULL,
      id VARCHAR(255) NOT NULL,
      data LONGTEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      INDEX idx_parent (parent)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
  }
  async get(p) {
    const [rows] = await this.pool.query('SELECT data FROM docs WHERE path = ?', [p]);
    return rows.length ? JSON.parse(rows[0].data) : null;
  }
  async set(p, data) {
    const s = splitPath(p);
    await this.pool.query(
      'INSERT INTO docs (path, parent, id, data, updated_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)',
      [p, s.parent, s.id, JSON.stringify(data), Date.now()]);
  }
  async delete(p) { await this.pool.query('DELETE FROM docs WHERE path = ?', [p]); }
  async list(parent) {
    const [rows] = await this.pool.query('SELECT id, data, updated_at FROM docs WHERE parent = ?', [parent]);
    return rows.map(r => ({ id: r.id, data: JSON.parse(r.data), updatedAt: Number(r.updated_at) }));
  }
  async version(parent) {
    const [rows] = await this.pool.query('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), 0) AS m FROM docs WHERE parent = ?', [parent]);
    return rows[0].n + ':' + rows[0].m;
  }
  async flush() {}
  async close() { await this.pool?.end(); }
}

function createStore(env = process.env) {
  if (env.DB_HOST) {
    return new MysqlStore({
      host: env.DB_HOST, port: +(env.DB_PORT || 3306),
      user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
    });
  }
  return new FileStore(env.DB_FILE || path.join(__dirname, '..', 'var', 'db.json'));
}

module.exports = { createStore, splitPath, FileStore, MysqlStore };
