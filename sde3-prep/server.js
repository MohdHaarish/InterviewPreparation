import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

const distDir = path.join(__dirname, 'dist')

app.use(express.static(distDir))
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = process.env.PORT ? Number(process.env.PORT) : 3002
const host = process.env.HOST || '0.0.0.0'

app.listen(port, host, () => {
  console.log(`Production server running at http://${host}:${port}`)
})
