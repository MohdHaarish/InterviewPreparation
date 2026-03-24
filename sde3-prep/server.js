import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

const distDir = path.join(__dirname, 'dist')
const dataDir = path.join(__dirname, 'data')
const progressFile = path.join(dataDir, 'progress.json')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir)

app.use(express.json())

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

app.use(express.static(distDir))
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = process.env.PORT ? Number(process.env.PORT) : 3002
const host = process.env.HOST || '0.0.0.0'

app.listen(port, host, () => {
  console.log(`Production server running at http://${host}:${port}`)
})
