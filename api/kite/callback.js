import crypto from 'node:crypto'
import { cookies, nextSixAmIst, seal, setCookie, unseal } from './_shared.js'

export default async function handler(req, res) {
  const { request_token: requestToken, status, state: stateToken } = req.query || {}
  const savedState = unseal(cookies(req).kite_oauth_state || '')
  const returnedState = unseal(Array.isArray(stateToken) ? stateToken[0] : stateToken || '')
  const freshState = returnedState && Date.now() - returnedState.createdAt <= 600000
  const matchesCookie = !savedState || savedState.state === returnedState?.state
  if (status !== 'success' || !requestToken || !freshState || !matchesCookie) {
    console.warn('Zerodha callback validation failed', { status, hasRequestToken: Boolean(requestToken), hasReturnedState: Boolean(returnedState), hasStateCookie: Boolean(savedState), freshState: Boolean(freshState), matchesCookie })
    res.statusCode = 302
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Location', '/?kite=error&code=callback_validation')
    return res.end()
  }
  const checksum = crypto.createHash('sha256').update(`${process.env.KITE_API_KEY}${requestToken}${process.env.KITE_API_SECRET}`).digest('hex')
  const body = new URLSearchParams({ api_key: process.env.KITE_API_KEY, request_token: requestToken, checksum })
  const response = await fetch('https://api.kite.trade/session/token', { method: 'POST', headers: { 'X-Kite-Version': '3', 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') {
    console.error('Zerodha token exchange failed', { status: response.status, errorType: result.error_type || 'unknown', message: result.message || 'unknown' })
    res.statusCode = 302
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Location', '/?kite=error&code=token_exchange')
    return res.end()
  }
  const expiresAt = nextSixAmIst()
  setCookie(res, 'kite_session', seal({ accessToken: result.data.access_token, userId: result.data.user_id, expiresAt: expiresAt.toISOString() }), { maxAge: Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) })
  res.statusCode = 302
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Location', '/?kite=connected')
  res.end()
}
