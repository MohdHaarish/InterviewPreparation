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
  if (result.error) {
    log('ENV', '❌ Failed to load .env file:', result.error.message)
  } else {
    log('ENV', '✅ .env loaded successfully')
  }
} catch (e) {
  log('ENV', '❌ dotenv import failed:', e.message)
}

// ── Log loaded env vars (masked) ──────────────────────────────────────────
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
  db.exec(`CREATE TABLE IF NOT EXISTS notes (
    topic_id   TEXT PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)
  log('DB', '✅ SQLite notes DB ready')
} catch (e) {
  log('DB', '❌ better-sqlite3 not available — notes API disabled:', e.message)
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

// CORS — allow same-origin and the production domain
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
  if (_req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ── Request logger middleware ─────────────────────────────────────────────
app.use((req, _res, next) => {
  log('REQ', `${req.method} ${req.path}`, req.method === 'POST' || req.method === 'PUT'
    ? { bodyKeys: Object.keys(req.body || {}) }
    : undefined)
  next()
})

// ── Auth middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!jwt) {
    log('AUTH', '❌ requireAuth: jwt not loaded')
    return res.status(503).json({ error: 'Auth not configured' })
  }
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    log('AUTH', '❌ requireAuth: no Bearer token in request')
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret-change-me')
    log('AUTH', '✅ requireAuth: token valid')
    next()
  } catch (e) {
    log('AUTH', '❌ requireAuth: token invalid —', e.message)
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  log('LOGIN', '→ login attempt received')

  if (!jwt || !bcrypt) {
    log('LOGIN', '❌ jwt or bcrypt not loaded — jwt:', !!jwt, 'bcrypt:', !!bcrypt)
    return res.status(503).json({ error: 'Auth not configured' })
  }

  const { pin } = req.body || {}
  if (!pin) {
    log('LOGIN', '❌ no PIN in request body')
    return res.status(400).json({ error: 'PIN required' })
  }

  log('LOGIN', `→ PIN received: length=${String(pin).length}, having chars="${String(pin)}"`)

  const hash = process.env.PIN_HASH
  if (!hash || hash === 'REPLACE_WITH_BCRYPT_HASH') {
    log('LOGIN', '❌ PIN_HASH not set in environment')
    return res.status(503).json({ error: 'PIN_HASH not set in .env — run: node generate-pin-hash.js <your-pin>' })
  }

  log('LOGIN', `→ PIN_HASH in memory: starts with "${hash}", length=${hash.length}`)

  let match = false
  try {
    match = await bcrypt.compare(String(pin), hash)
  } catch (e) {
    log('LOGIN', '❌ bcrypt.compare threw error:', e.message)
    return res.status(500).json({ error: 'Internal error during PIN check' })
  }

  log('LOGIN', match ? '✅ PIN match — issuing token' : '❌ PIN does NOT match hash')

  if (!match) return res.status(401).json({ error: 'Invalid PIN' })

  const token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '30d' })
  log('LOGIN', '✅ Token issued successfully')
  res.json({ token })
})

app.get('/api/auth/verify', requireAuth, (_req, res) => {
  log('AUTH', '✅ /api/auth/verify — token valid')
  res.json({ valid: true })
})

// ── Notes routes ──────────────────────────────────────────────────────────
app.get('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) {
    log('NOTES', '❌ GET notes: DB not available')
    return res.status(503).json({ error: 'Notes DB not available' })
  }
  const { topicId } = req.params
  const row = db.prepare('SELECT content, updated_at FROM notes WHERE topic_id = ?').get(topicId)
  if (!row) {
    log('NOTES', `→ GET notes [${topicId}]: not found (404)`)
    return res.status(404).json({ error: 'Not found' })
  }
  log('NOTES', `✅ GET notes [${topicId}]: found, content length=${row.content.length}`)
  res.json({ content: row.content, updatedAt: row.updated_at })
})

app.put('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) {
    log('NOTES', '❌ PUT notes: DB not available')
    return res.status(503).json({ error: 'Notes DB not available' })
  }
  const { content } = req.body || {}
  if (content === undefined) {
    log('NOTES', '❌ PUT notes: content field missing in body')
    return res.status(400).json({ error: 'content required' })
  }
  const { topicId } = req.params
  const now = new Date().toISOString()
  db.prepare('INSERT OR REPLACE INTO notes (topic_id, content, updated_at) VALUES (?, ?, ?)').run(topicId, content, now)
  log('NOTES', `✅ PUT notes [${topicId}]: saved, content length=${content.length}`)
  res.json({ success: true, updatedAt: now })
})

app.post('/api/notes/images/upload', requireAuth, (req, res) => {
  if (!upload) return res.status(503).json({ error: 'Upload not configured' })
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    res.json({ url: `/uploads/images/${req.file.filename}` })
  })
})

// Static: uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Progress routes ───────────────────────────────────────────────────────
app.get('/api/progress', (_req, res) => {
  log('PROGRESS', '→ GET /api/progress')
  try {
    if (fs.existsSync(progressFile)) {
      const raw = fs.readFileSync(progressFile, 'utf8')
      const data = JSON.parse(raw)
      const topics = Object.keys(data || {})
      const completedCounts = topics.map(t => {
        const c = data[t]?.c || {}
        return `${t}:${Object.values(c).filter(Boolean).length}concepts`
      })
      log('PROGRESS', `✅ GET: file exists, topics=[${completedCounts.join(', ')}]`)
      res.json(data)
    } else {
      log('PROGRESS', '→ GET: no progress.json found — returning null')
      res.json(null)
    }
  } catch (e) {
    log('PROGRESS', '❌ GET error:', e.message)
    res.json(null)
  }
})

app.post('/api/progress', (req, res) => {
  log('PROGRESS', '→ POST /api/progress')
  try {
    const data = req.body
    const topics = Object.keys(data || {})
    const completedCounts = topics.map(t => {
      const c = data[t]?.c || {}
      return `${t}:${Object.values(c).filter(Boolean).length}concepts`
    })
    log('PROGRESS', `→ saving topics=[${completedCounts.join(', ')}]`)
    fs.writeFileSync(progressFile, JSON.stringify(data), 'utf8')
    log('PROGRESS', `✅ POST: saved to ${progressFile}`)
    res.json({ ok: true })
  } catch (e) {
    log('PROGRESS', '❌ POST error:', e.message)
    res.status(500).json({ ok: false })
  }
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
