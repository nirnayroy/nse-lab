import crypto from 'node:crypto'
import { kiteConfigured, seal, setCookie } from './_shared.js'

export default function handler(req, res) {
  if (!kiteConfigured()) {
    res.statusCode = 302
    res.setHeader('Location', '/?kite=not-configured')
    return res.end()
  }
  const state = crypto.randomBytes(24).toString('hex')
  const stateToken = seal({ state, createdAt: Date.now() })
  setCookie(res, 'kite_oauth_state', stateToken, { maxAge: 600 })
  const redirectParams = encodeURIComponent(`state=${encodeURIComponent(stateToken)}`)
  const url = `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(process.env.KITE_API_KEY)}&redirect_params=${redirectParams}`
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', url)
  res.end()
}
