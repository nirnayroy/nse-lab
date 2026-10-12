import { kiteHeaders, requireSession, sendJson } from './_shared.js'

const DAYS = { '1M': 35, '6M': 190, '1Y': 370, '3Y': 1100, '5Y': 1830 }
const formatDate = (date) => date.toISOString().slice(0, 10)

export default async function handler(req, res) {
  const current = requireSession(req, res)
  if (!current) return
  const token = Number(req.query?.token)
  const days = DAYS[req.query?.range] || DAYS['1Y']
  if (!Number.isSafeInteger(token) || token <= 0) return sendJson(res, 400, { error: 'Invalid instrument token' })
  const to = new Date(), from = new Date(Date.now() - days * 86400000)
  const url = new URL(`https://api.kite.trade/instruments/historical/${token}/day`)
  url.searchParams.set('from', formatDate(from)); url.searchParams.set('to', formatDate(to)); url.searchParams.set('continuous', '0'); url.searchParams.set('oi', '0')
  const response = await fetch(url, { headers: kiteHeaders(current.accessToken) })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') return sendJson(res, response.status || 502, { error: result.message || 'Historical data request failed' })
  const values = result.data.candles.map(([date, open, high, low, close, volume]) => ({ date: date.slice(0,10), open, high, low, close, volume }))
  sendJson(res, 200, { values })
}
