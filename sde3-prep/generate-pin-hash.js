// Usage: node generate-pin-hash.js yourSecretPin
// Then paste the printed hash into .env as PIN_HASH=<hash>

import bcrypt from 'bcryptjs'

const pin = process.argv[2]
if (!pin) {
  console.error('Usage: node generate-pin-hash.js <your-pin>')
  process.exit(1)
}

const hash = await bcrypt.hash(String(pin), 12)
console.log('\nPaste this into your .env file:\n')
console.log('PIN_HASH=' + hash)
console.log('\nAlso set a random JWT_SECRET, e.g.:')
console.log('JWT_SECRET=' + Buffer.from(Math.random().toString(36).repeat(8)).toString('base64').slice(0, 64))
