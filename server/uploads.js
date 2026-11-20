'use strict';
/* File uploads: type allow-list, size limit, magic-byte verification, moderated serving. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const cfg = require('./config');
const { get, run } = require('./db');
const { HttpError } = require('./auth');

const TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, cfg.UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.' + TYPES[file.mimetype])
});
const upload = multer({
  storage,
  limits: { fileSize: cfg.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (TYPES[file.mimetype] ? cb(null, true) : cb(new HttpError(415, 'unsupported_type', 'Use JPG, PNG, WEBP, GIF, MP4, WEBM or MOV')))
});

/** Confirm the file's bytes match its declared type. */
function sniff(file, mime) {
  const fd = fs.openSync(file, 'r'); const b = Buffer.alloc(16); fs.readSync(fd, b, 0, 16, 0); fs.closeSync(fd);
  const hex = b.toString('hex');
  switch (mime) {
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/png': return hex.startsWith('89504e470d0a1a0a');
    case 'image/gif': return b.toString('ascii', 0, 4) === 'GIF8';
    case 'image/webp': return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    case 'video/mp4': case 'video/quicktime': return b.toString('ascii', 4, 8) === 'ftyp';
    case 'video/webm': return hex.startsWith('1a45dfa3');
    default: return false;
  }
}

/** Express middleware: accept one file in field "file", verify it, record it. */
function acceptUpload(kindResolver) {
  const single = upload.single('file');
  return (req, res, next) => single(req, res, (err) => {
    if (err) return next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'too_large', `Max file size is ${cfg.MAX_UPLOAD_MB} MB`) : err);
    if (!req.file) return next(new HttpError(400, 'no_file', 'Attach a file in the "file" field'));
    const f = req.file;
    if (!sniff(f.path, f.mimetype)) { fs.rm(f.path, () => {}); return next(new HttpError(415, 'bad_file', 'File contents do not match its type')); }
    let kind;
    try { kind = kindResolver(req); } catch (e) { fs.rm(f.path, () => {}); return next(e); }
    if (!['gallery', 'product', 'story'].includes(kind.kind) && !f.mimetype.startsWith('image/')) { fs.rm(f.path, () => {}); return next(new HttpError(415, 'image_required', 'Avatars and covers must be images')); }
    const status = cfg.AUTO_APPROVE_UPLOADS ? 'approved' : 'pending';
    const info = run('INSERT INTO uploads (owner_id, creator_id, kind, mime, file, size, caption, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      req.user.id, kind.creatorId || null, kind.kind, f.mimetype, path.basename(f.path), f.size, String(req.body.caption || '').slice(0, 200), status, Date.now());
    req.uploadRow = get('SELECT * FROM uploads WHERE id = ?', Number(info.lastInsertRowid));
    next();
  });
}

/** Serve /uploads/:file — approved files publicly; pending/rejected only to owner or admin. */
function serveUpload(req, res, next) {
  const name = path.basename(req.params.file);
  const row = get('SELECT * FROM uploads WHERE file = ?', name);
  if (!row) return next(new HttpError(404, 'not_found', 'Not found'));
  const can = row.status === 'approved' || (req.user && (req.user.id === row.owner_id || req.user.role === 'admin'));
  if (!can) return next(new HttpError(404, 'not_found', 'Not found'));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', row.status === 'approved' ? 'public, max-age=86400' : 'private, no-store');
  res.type(row.mime);
  res.sendFile(path.join(cfg.UPLOAD_DIR, name), { dotfiles: 'deny' }, (err) => { if (err && !res.headersSent) next(new HttpError(404, 'not_found', 'Not found')); });
}

function deleteUploadFile(row) { if (row) fs.rm(path.join(cfg.UPLOAD_DIR, path.basename(row.file)), () => {}); }

module.exports = { acceptUpload, serveUpload, deleteUploadFile, TYPES };
