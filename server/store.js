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

class FileStore {
  constructor(file) {
    this.file = file;
    this.docs = new Map();
    this.timer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [k, v] of Object.entries(raw)) this.docs.set(k, v);
    } catch { /* base vide */ }
  }
  async init() {}
  _save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.docs)));
      fs.renameSync(tmp, this.file);
    }, 200);
  }
  async flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.docs))); } }
  async get(p) { const d = this.docs.get(p); return d ? structuredClone(d.data) : null; }
  async set(p, data) { this.docs.set(p, { data: structuredClone(data), updatedAt: Date.now() }); this._save(); }
  async delete(p) { this.docs.delete(p); this._save(); }
  async list(parent) {
    const out = [];
    for (const [k, v] of this.docs) {
      const s = splitPath(k);
      if (s.parent === parent) out.push({ id: s.id, data: structuredClone(v.data), updatedAt: v.updatedAt });
    }
    return out;
  }
  async version(parent) {
    let n = 0, max = 0;
    for (const [k, v] of this.docs) if (splitPath(k).parent === parent) { n++; if (v.updatedAt > max) max = v.updatedAt; }
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
