import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
try {
  const dotenv = await import('dotenv')
  dotenv.config()
} catch {}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

// ── Directories ───────────────────────────────────────────────────────────
const distDir      = path.join(__dirname, 'dist')
const dataDir      = path.join(__dirname, 'data')
const uploadsDir   = path.join(__dirname, 'uploads', 'images')
const progressFile = path.join(dataDir, 'progress.json')

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
  console.log('SQLite notes DB ready')
} catch (e) {
  console.warn('better-sqlite3 not available — notes API disabled:', e.message)
}

// ── JWT / bcrypt ──────────────────────────────────────────────────────────
let jwt = null, bcrypt = null
try { jwt    = (await import('jsonwebtoken')).default } catch {}
try { bcrypt = (await import('bcryptjs')).default      } catch {}

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
} catch {}

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

// ── Auth middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!jwt) return res.status(503).json({ error: 'Auth not configured' })
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    jwt.verify(header.slice(7), process.env.JWT_SECRET || 'dev-secret-change-me')
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  if (!jwt || !bcrypt) return res.status(503).json({ error: 'Auth not configured' })
  const { pin } = req.body || {}
  if (!pin) return res.status(400).json({ error: 'PIN required' })
  const hash = process.env.PIN_HASH
  if (!hash || hash === 'REPLACE_WITH_BCRYPT_HASH')
    return res.status(503).json({ error: 'PIN_HASH not set in .env — run: node generate-pin-hash.js <your-pin>' })
  const match = await bcrypt.compare(String(pin), hash)
  if (!match) return res.status(401).json({ error: 'Invalid PIN' })
  const token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET || 'dev-secret-change-me', { expiresIn: '30d' })
  res.json({ token })
})

app.get('/api/auth/verify', requireAuth, (_req, res) => {
  res.json({ valid: true })
})

// ── Notes routes ──────────────────────────────────────────────────────────
app.get('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'Notes DB not available' })
  const row = db.prepare('SELECT content, updated_at FROM notes WHERE topic_id = ?').get(req.params.topicId)
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json({ content: row.content, updatedAt: row.updated_at })
})

app.put('/api/notes/:topicId', requireAuth, (req, res) => {
  if (!db) return res.status(503).json({ error: 'Notes DB not available' })
  const { content } = req.body || {}
  if (content === undefined) return res.status(400).json({ error: 'content required' })
  const now = new Date().toISOString()
  db.prepare('INSERT OR REPLACE INTO notes (topic_id, content, updated_at) VALUES (?, ?, ?)').run(req.params.topicId, content, now)
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

// ── Progress routes (existing) ────────────────────────────────────────────
app.get('/api/progress', (_req, res) => {
  try {
    if (fs.existsSync(progressFile)) {
      const data = fs.readFileSync(progressFile, 'utf8')
      res.json(JSON.parse(data))
    } else {
      res.json(null)
    }
  } catch {
    res.json(null)
  }
})

app.post('/api/progress', (req, res) => {
  try {
    fs.writeFileSync(progressFile, JSON.stringify(req.body), 'utf8')
    res.json({ ok: true })
  } catch {
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
  console.log(`Server running at http://${host}:${port}`)
})
