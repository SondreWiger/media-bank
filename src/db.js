// enkel DB-modul, vi kjører sqlite fordi det er lett å ha lokalt
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'media.db');

let db; // global-ish ref, chill

function init() { // lager filen hvis den ikke finnes og setter opp skjema
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mimetype TEXT,
      size INTEGER,
      thumbnail_path TEXT,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      allowed_ips TEXT DEFAULT '[]',
      parent_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      media_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
    );

    DROP VIEW IF EXISTS media_view;
    CREATE VIEW media_view AS
      SELECT
        id,
        filename,
        original_name,
        mimetype,
        size,
        thumbnail_path,
        created_at,
        json(tags) AS tags_json,
        folder_id
      FROM media;
  `);

  // prøv å legge til folder_id hvis den ikke finnes
  try {
    db.exec(`ALTER TABLE media ADD COLUMN folder_id INTEGER`);
  } catch (e) {
    // ignorer hvis kolonnen finnes fra før
  }

  // prøv å legge til parent_id på folders hvis den ikke finnes
  try {
    db.exec(`ALTER TABLE folders ADD COLUMN parent_id INTEGER`);
  } catch (e) {
    // ignorer hvis kolonnen finnes fra før
  }
}

// litt proxy-magi så vi kan gjøre db.prepare osv etter init()
module.exports = { db: new Proxy({}, {
  get(_t, prop) {
    if (!db) throw new Error('DB not initialized. Call init() first.');
    return db[prop].bind(db);
  }
}), init };
