import crypto from 'node:crypto'

export const kiteConfigured = () => Boolean(process.env.KITE_API_KEY && process.env.KITE_API_SECRET && process.env.SESSION_SECRET)

export function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((entry) => {
    const [key, ...value] = entry.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }))
}

function encryptionKey() {
  return crypto.createHash('sha256').update(process.env.SESSION_SECRET || '').digest()
}

export function seal(payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function unseal(value) {
  try {
    const data = Buffer.from(value, 'base64url')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12))
    decipher.setAuthTag(data.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'))
  } catch { return null }
}

export function session(req) {
  const token = cookies(req).kite_session
  return token ? unseal(token) : null
}

export function nextSixAmIst() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const ist = new Date(utc + 5.5 * 3600000)
  const next = new Date(ist)
  next.setHours(6, 0, 0, 0)
  if (next <= ist) next.setDate(next.getDate() + 1)
  return new Date(next.getTime() - 5.5 * 3600000)
}

export function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`)
  res.setHeader('Set-Cookie', parts.join('; '))
}

export function kiteHeaders(accessToken) {
  return {
    'X-Kite-Version': '3',
    Authorization: `token ${process.env.KITE_API_KEY}:${accessToken}`,
  }
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

export function requireSession(req, res) {
  const current = session(req)
  if (!current?.accessToken) {
    sendJson(res, 401, { error: 'Zerodha session required', connected: false })
    return null
  }
  return current
}
