// serveren vår, ganske enkel og digg
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const mime = require('mime-types');
const { db, init } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// hvis vi står bak proxy (nginx/cloudflare), stol på X-Forwarded-For
app.set('trust proxy', true);

// sørg for at mapper finnes (ellers blir det kaos)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ORIGINALS_DIR = path.join(UPLOADS_DIR, 'originals');
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');
for (const dir of [UPLOADS_DIR, ORIGINALS_DIR, THUMBS_DIR, path.join(__dirname, 'data')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

app.use(express.static(__dirname));

// Multer-oppsett (hvor filer havner og navn)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ORIGINALS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || `.${mime.extension(file.mimetype) || 'bin'}`;
    const name = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Hjelpere
const isImage = (mimetype) => /^image\//.test(mimetype);
// finn klient-IP (enkel)
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || req.ip;
}

// Sjekk om ip er lov for mappe
function ipAllowed(folderId, ip) {
  if (!folderId) return true; // ingen mappe = åpen
  const f = db.prepare('SELECT allowed_ips FROM folders WHERE id = ?').get(folderId);
  if (!f) return true;
  try {
    const arr = JSON.parse(f.allowed_ips || '[]');
    if (!Array.isArray(arr) || arr.length === 0) return true;
    return arr.includes(ip);
  } catch (e) {
    return true;
  }
}

async function makeThumbnail(srcPath, destPath) {
  try {
    await sharp(srcPath)
      .resize({ width: 400, height: 400, fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(destPath);
    return true;
  } catch (e) {
    console.error('Miniatyr-feil:', e.message);
    return false;
  }
}

// Ruter (API)
app.post('/api/upload', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files || [];
    console.log(`laster opp ${files.length} fil(er)...`);
    const folderId = req.query.folder_id ? parseInt(String(req.query.folder_id), 10) : (req.body && req.body.folder_id) ? parseInt(String(req.body.folder_id), 10) : null;
    const items = [];
    for (const f of files) {
      const createdAt = new Date().toISOString();
      let thumbPath = null;
      if (isImage(f.mimetype)) {
        const thumbName = `${path.parse(f.filename).name}.jpg`;
        const tPath = path.join(THUMBS_DIR, thumbName);
        const ok = await makeThumbnail(f.path, tPath);
        if (ok) thumbPath = path.join('uploads', 'thumbs', thumbName);
      }
      const stmt = db.prepare(`INSERT INTO media (filename, original_name, mimetype, size, thumbnail_path, tags, created_at, folder_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const info = stmt.run(
        f.filename,
        f.originalname,
        f.mimetype,
        f.size,
        thumbPath,
        JSON.stringify([]),
        createdAt,
        folderId
      );
      const id = info.lastInsertRowid;
      items.push({ id, filename: f.filename, original_name: f.originalname, mimetype: f.mimetype, size: f.size, thumbnail_path: thumbPath, created_at: createdAt, url: `/file/${id}`, thumb_url: `/thumb/${id}`, folder_id: folderId });
    }
    console.log('opplasting ferdig');
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/media', (req, res) => {
  const { query = '', tag = '', type = '', sort = 'created_at', order = 'DESC', page = '1', limit = '50', folder_id = '' } = req.query;
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const offset = (p - 1) * l;

  let where = 'WHERE 1=1';
  const params = {};
  if (query) { where += ' AND (original_name LIKE @q OR filename LIKE @q)'; params['q'] = `%${query}%`; }
  if (tag) { where += ' AND json_extract(tags_json, "$[*]") IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value LIKE @t)'; params['t'] = `%${tag}%`; }
  if (type) { where += ' AND mimetype LIKE @type'; params['type'] = `${type}/%`; }
  const hasFolderParam = Object.prototype.hasOwnProperty.call(req.query, 'folder_id');
  if (hasFolderParam) {
    if (folder_id === '') {
      where += ' AND folder_id IS NULL';
    } else {
      where += ' AND folder_id = @fid'; params['fid'] = parseInt(folder_id, 10);
    }
  }

  const sql = `SELECT id, filename, original_name, mimetype, size, thumbnail_path, created_at, tags_json as tags, folder_id
               FROM media_view
               ${where}
               ORDER BY ${sort === 'size' ? 'size' : 'created_at'} ${order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}
               LIMIT @limit OFFSET @offset`;
  const stmt = db.prepare(sql);
  const rows = stmt.all({ ...params, limit: l, offset });
  res.json({ ok: true, items: rows.map(r => ({ ...r, url: `/file/${r.id}`, thumb_url: `/thumb/${r.id}` })) });
});

app.patch('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { tags = null, folder_id = undefined, original_name = undefined } = req.body || {};
  if (tags !== null) {
    db.prepare('UPDATE media SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id);
  }
  if (typeof folder_id !== 'undefined') {
    db.prepare('UPDATE media SET folder_id = ? WHERE id = ?').run(folder_id, id);
  }
  if (typeof original_name !== 'undefined') {
    db.prepare('UPDATE media SET original_name = ? WHERE id = ?').run(String(original_name), id);
  }
  res.json({ ok: true });
});

app.delete('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT filename, thumbnail_path FROM media WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
  db.prepare('DELETE FROM media WHERE id = ?').run(id);
  // remove files
  const orig = path.join(ORIGINALS_DIR, row.filename);
  if (fs.existsSync(orig)) fs.unlinkSync(orig);
  if (row.thumbnail_path) {
    const t = path.join(__dirname, row.thumbnail_path);
    if (fs.existsSync(t)) fs.unlinkSync(t);
  }
  console.log(`slettet media id=${id}`);
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Folders (enkle)
app.get('/api/folders', (req, res) => {
  const { parent_id = '' } = req.query;
  let where = 'WHERE 1=1';
  const params = {};
  if (parent_id === '') {
    where += ' AND parent_id IS NULL';
  } else {
    where += ' AND parent_id = @pid';
    params.pid = parseInt(String(parent_id), 10);
  }
  const rows = db.prepare(`SELECT id, name, allowed_ips, parent_id FROM folders ${where} ORDER BY name ASC`).all(params);
  res.json({ ok: true, items: rows.map(r => ({ ...r, allowed_ips: JSON.parse(r.allowed_ips || '[]') })) });
});
app.get('/api/folders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id, name, allowed_ips, parent_id FROM folders WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, item: { ...row, allowed_ips: JSON.parse(row.allowed_ips || '[]') } });
});
app.post('/api/folders', (req, res) => {
  const { name, allowed_ips = [], parent_id = null } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const info = db.prepare('INSERT INTO folders (name, allowed_ips, parent_id) VALUES (?, ?, ?)').run(name, JSON.stringify(allowed_ips), parent_id);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch('/api/folders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name = null, allowed_ips = null } = req.body || {};
  if (name !== null) db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
  if (allowed_ips !== null) db.prepare('UPDATE folders SET allowed_ips = ? WHERE id = ?').run(JSON.stringify(allowed_ips), id);
  res.json({ ok: true });
});

app.delete('/api/folders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  // refuse delete if has children
  const hasChild = db.prepare('SELECT 1 FROM folders WHERE parent_id = ? LIMIT 1').get(id);
  if (hasChild) return res.status(400).json({ ok: false, error: 'folder has subfolders' });
  // refuse delete if has media
  const hasMedia = db.prepare('SELECT 1 FROM media WHERE folder_id = ? LIMIT 1').get(id);
  if (hasMedia) return res.status(400).json({ ok: false, error: 'folder has files' });
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Beskyttet fil-tilgang
function ensureMediaAccess(req, res, next) {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id, filename, folder_id FROM media WHERE id = ?').get(id);
  if (!row) return res.status(404).send('not found');
  const ip = clientIp(req);
  if (!ipAllowed(row.folder_id, ip)) return res.status(403).send('forbidden');
  req.mediaRow = row;
  next();
}

app.get('/file/:id', ensureMediaAccess, (req, res) => {
  const filePath = path.join(ORIGINALS_DIR, req.mediaRow.filename);
  res.sendFile(filePath);
});

app.get('/thumb/:id', ensureMediaAccess, (req, res) => {
  const row = db.prepare('SELECT thumbnail_path FROM media WHERE id = ?').get(req.mediaRow.id);
  if (!row || !row.thumbnail_path) return res.status(404).send('no thumb');
  res.sendFile(path.join(__dirname, row.thumbnail_path));
});

app.get('/download/:id', ensureMediaAccess, (req, res) => {
  const orig = db.prepare('SELECT original_name FROM media WHERE id = ?').get(req.mediaRow.id);
  const filePath = path.join(ORIGINALS_DIR, req.mediaRow.filename);
  res.download(filePath, orig?.original_name || req.mediaRow.filename);
});

// Deling via tokens
const crypto = require('crypto');
app.post('/share/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const exists = db.prepare('SELECT id FROM media WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ ok: false, error: 'not found' });
  const token = crypto.randomBytes(16).toString('hex');
  const createdAt = new Date().toISOString();
  const { expires_at = null } = req.body || {};
  db.prepare('INSERT INTO shares (token, media_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(token, id, createdAt, expires_at);
  res.json({ ok: true, url: `/share/${token}` });
});

app.get('/share/:token', (req, res) => {
  const { token } = req.params;
  const s = db.prepare('SELECT media_id, expires_at FROM shares WHERE token = ?').get(token);
  if (!s) return res.status(404).send('invalid token');
  if (s.expires_at && new Date(s.expires_at) < new Date()) return res.status(410).send('expired');
  const row = db.prepare('SELECT filename, original_name FROM media WHERE id = ?').get(s.media_id);
  if (!row) return res.status(404).send('not found');
  const filePath = path.join(ORIGINALS_DIR, row.filename);
  res.sendFile(filePath);
});

// Sider (serverer html)
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/bank', (_req, res) => res.sendFile(path.join(__dirname, 'bank.html')));
app.get('/about', (_req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/safety', (_req, res) => res.sendFile(path.join(__dirname, 'safety.html')));
app.get('/api-controls', (_req, res) => res.sendFile(path.join(__dirname, 'api-controls.html')));

init();
app.listen(PORT, () => console.log(`Media Bank server kjører på http://localhost:${PORT} 🚀`));
