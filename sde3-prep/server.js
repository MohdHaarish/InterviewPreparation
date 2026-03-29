import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

// ── Logging helper ────────────────────────────────────────────────────────
function log(tag, msg, data) {
  const ts = new Date().toISOString()
  if (data !== undefined) console.log(`[${ts}] [${tag}]`, msg, JSON.stringify(data))
  else console.log(`[${ts}] [${tag}]`, msg)
}

try {
  const dotenv = await import('dotenv')
  const result = dotenv.config()
  if (result.error) log('ENV', '❌ Failed to load .env file:', result.error.message)
  else log('ENV', '✅ .env loaded successfully')
} catch (e) {
  log('ENV', '❌ dotenv import failed:', e.message)
}

const pinHash = process.env.PIN_HASH
const jwtSecret = process.env.JWT_SECRET
log('ENV', 'PIN_HASH loaded:', pinHash
  ? `✅ present (starts with: ${pinHash.slice(0, 7)}...)`
  : '❌ NOT SET — login will fail')
log('ENV', 'JWT_SECRET loaded:', jwtSecret
  ? `✅ present (length: ${jwtSecret.length})`
  : '⚠️  NOT SET — using fallback dev-secret')
log('ENV', 'PORT:', process.env.PORT || '3002 (default)')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

// ── Directories ───────────────────────────────────────────────────────────
const distDir      = path.join(__dirname, 'dist')
const dataDir      = path.join(__dirname, 'data')
const uploadsDir   = path.join(__dirname, 'uploads', 'images')
const progressFile = path.join(dataDir, 'progress.json')

log('INIT', 'distDir:', distDir)
log('INIT', 'progressFile:', progressFile)

if (!fs.existsSync(dataDir))    fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

// ── SQLite ────────────────────────────────────────────────────────────────
let db = null
try {
  const Database = (await import('better-sqlite3')).default
  db = new Database(path.join(__dirname, 'notes.db'))

  // Check schema: old = single blob per topic (topic_id PRIMARY KEY, no auto-id)
  //               new = multiple notes per topic (id AUTOINCREMENT, topic_id indexed)
  const cols = db.prepare('PRAGMA table_info(notes)').all()
  const hasTable = cols.length > 0
  const hasAutoId = cols.some(c => c.name === 'id')

  if (!hasTable) {
    // Fresh install — create new schema directly
    db.exec(`
      CREATE TABLE notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id   TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_notes_topic ON notes(topic_id);
    `)
    log('DB', '✅ Notes table created (fresh install)')
  } else if (!hasAutoId) {
    // Old schema detected — migrate
    log('DB', '→ old schema detected, migrating to multi-note schema...')
    db.transaction(() => {
      db.exec('ALTER TABLE notes RENAME TO notes_v1')
      db.exec(`
        CREATE TABLE notes (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id   TEXT NOT NULL,
          content    TEXT NOT NULL DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      db.exec('CREATE INDEX idx_notes_topic ON notes(topic_id)')
      const old = db.prepare("SELECT topic_id, content, updated_at FROM notes_v1 WHERE content != ''").all()
      const ins = db.prepare('INSERT INTO notes (topic_id, content, created_at) VALUES (?, ?, ?)')
      old.forEach(row => ins.run(row.topic_id, row.content, row.updated_at))
      db.exec('DROP TABLE notes_v1')
      log('DB', `✅ Migrated ${old.length} notes from old schema`)
    })()
  } else {
    db.exec('CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic_id)')
    log('DB', '✅ Notes table schema is current')
  }
} catch (e) {
  log('DB', '❌ SQLite init failed:', e.message)
}

// ── JWT / bcrypt ──────────────────────────────────────────────────────────
let jwt = null, bcrypt = null
try { jwt    = (await import('jsonwebtoken')).default; log('AUTH', '✅ jsonwebtoken loaded') } catch (e) { log('AUTH', '❌ jsonwebtoken failed:', e.message) }
try { bcrypt = (await import('bcryptjs')).default;     log('AUTH', '✅ bcryptjs loaded')     } catch (e) { log('AUTH', '❌ bcryptjs failed:', e.message) }

// ── Multer ────────────────────────────────────────────────────────────────
let upload = null
try {
  const multer  = (await import('multer')).default
  const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
      cb(null, `${Date.now()}_${safe}`)
    }
  })
  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true)
      else cb(new Error('Only image files are allowed'))
    }
  })
  log('UPLOAD', '✅ multer configured')
} catch (e) {
  log('UPLOAD', '❌ multer failed:', e.message)
}

// ── Middleware ────────────────────────────────────────────────────────────
app.use(express.json())

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (_req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use((req, _res, next) => {
  log('REQ', `${req.method} ${req.path}`, req.method === 'POST' || req.method === 'PUT'
    ? { bodyKeys: Object.keys(req.body || {}) }
    : undefined)
  next()
})

// ── Auth middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!jwt) { log('AUTH', '❌ requireAuth: jwt not loaded'); return res.status(503).json({ error: 'Auth not configured' }) }
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) { log('AUTH', '❌ requireAuth: no Bearer token'); return res.status(401).json({ error: 'Unauthorized' }) }
  try {
    jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret-change-me')
    next()
  } catch (e) {
    log('AUTH', '❌ requireAuth: token invalid —', e.message)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  log('LOGIN', '→ login attempt received')
  if (!jwt || !bcrypt) { log('LOGIN', '❌ jwt or bcrypt not loaded'); return res.status(503).json({ error: 'Auth not configured' }) }
  const { pin } = req.body || {}
  if (!pin) { log('LOGIN', '❌ no PIN in request body'); return res.status(400).json({ error: 'PIN required' }) }
  log('LOGIN', `→ PIN received: length=${String(pin).length}, having chars="${String(pin)}"`)
  const hash = process.env.PIN_HASH
  if (!hash || hash === 'REPLACE_WITH_BCRYPT_HASH') { log('LOGIN', '❌ PIN_HASH not set'); return res.status(503).json({ error: 'PIN_HASH not set in .env' }) }
  log('LOGIN', `→ PIN_HASH in memory: starts with "${hash}", length=${hash.length}`)
  let match = false
  try { match = await bcrypt.compare(String(pin), hash) } catch (e) { log('LOGIN', '❌ bcrypt.compare error:', e.message); return res.status(500).json({ error: 'Internal error' }) }
  log('LOGIN', match ? '✅ PIN match — issuing token' : '❌ PIN does NOT match hash')
  if (!match) return res.status(401).json({ error: 'Invalid PIN' })
  const token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '30d' })
  log('LOGIN', '✅ Token issued')
  res.json({ token })
})

app.get('/api/auth/verify', requireAuth, (_req, res) => {
  log('AUTH', '✅ /api/auth/verify — token valid')
  res.json({ valid: true })
})

// ── Notes — image upload (must be before /:topicId to avoid route clash) ──
app.post('/api/notes/images/upload', requireAuth, (req, res) => {
  if (!upload) return res.status(503).json({ error: 'Upload not configured' })
  upload.single('image')(req, res, (err) => {
    if (err) { log('UPLOAD', '❌ upload error:', err.message); return res.status(400).json({ error: err.message }) }
    if (!req.file) { log('UPLOAD', '❌ no file in request'); return res.status(400).json({ error: 'No file uploaded' }) }
    log('UPLOAD', `✅ image saved: ${req.file.filename}`)
    res.json({ url: `/uploads/images/${req.file.filename}` })
  })
})

// ── Notes — CRUD ──────────────────────────────────────────────────────────
app.get('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'Notes DB not available' })
  const { topicId } = req.params
  const rows = db.prepare('SELECT id, content, created_at FROM notes WHERE topic_id = ? ORDER BY created_at DESC').all(topicId)
  log('NOTES', `✅ GET [${topicId}]: ${rows.length} notes`)
  res.json({ notes: rows })
})

app.post('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'Notes DB not available' })
  const { topicId } = req.params
  const { content } = req.body || {}
  if (!content) return res.status(400).json({ error: 'content required' })
  const now = new Date().toISOString()
  const result = db.prepare('INSERT INTO notes (topic_id, content, created_at) VALUES (?, ?, ?)').run(topicId, content, now)
  log('NOTES', `✅ POST [${topicId}]: created id=${result.lastInsertRowid}, length=${content.length}`)
  res.json({ id: result.lastInsertRowid, topic_id: topicId, content, created_at: now })
})

app.delete('/api/notes/:noteId', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'Notes DB not available' })
  const id = parseInt(req.params.noteId)
  if (isNaN(id)) return res.status(400).json({ error: 'invalid noteId' })
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id)
  if (result.changes === 0) { log('NOTES', `❌ DELETE id=${id}: not found`); return res.status(404).json({ error: 'not found' }) }
  log('NOTES', `✅ DELETE id=${id}`)
  res.json({ success: true })
})

// ── Static: uploaded images ───────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Progress routes ───────────────────────────────────────────────────────
app.get('/api/progress', (_req, res) => {
  log('PROGRESS', '→ GET /api/progress')
  try {
    if (fs.existsSync(progressFile)) {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
      const summary = Object.keys(data || {}).map(t => `${t}:${Object.values(data[t]?.c||{}).filter(Boolean).length}c`).join(', ')
      log('PROGRESS', `✅ GET: [${summary}]`)
      res.json(data)
    } else {
      log('PROGRESS', '→ GET: no file — returning null')
      res.json(null)
    }
  } catch (e) { log('PROGRESS', '❌ GET error:', e.message); res.json(null) }
})

app.post('/api/progress', (req, res) => {
  log('PROGRESS', '→ POST /api/progress')
  try {
    const data = req.body
    const summary = Object.keys(data || {}).map(t => `${t}:${Object.values(data[t]?.c||{}).filter(Boolean).length}c`).join(', ')
    log('PROGRESS', `→ saving [${summary}]`)
    fs.writeFileSync(progressFile, JSON.stringify(data), 'utf8')
    log('PROGRESS', `✅ saved to ${progressFile}`)
    res.json({ ok: true })
  } catch (e) { log('PROGRESS', '❌ POST error:', e.message); res.status(500).json({ ok: false }) }
})

// ── Frontend static ───────────────────────────────────────────────────────
app.use(express.static(distDir))
app.get(/(.*)/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = process.env.PORT ? Number(process.env.PORT) : 3002
const host = process.env.HOST || '0.0.0.0'

app.listen(port, host, () => {
  log('SERVER', `✅ Running at http://${host}:${port}`)
})
