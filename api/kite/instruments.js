import { kiteHeaders, requireSession, sendJson } from './_shared.js'

const caches = {
  stock: { expires: 0, values: [] },
  option: { expires: 0, values: [] },
}

export function parseCsv(text) {
  const lines = text.trim().split('\n')
  const headers = lines.shift().split(',').map((item) => item.trim())
  const indexes = Object.fromEntries(headers.map((name, index) => [name, index]))
  return lines.map((line) => {
    const cells = line.split(',').map((item) => item.trim())
    return {
      token: Number(cells[indexes.instrument_token]),
      symbol: cells[indexes.tradingsymbol],
      name: cells[indexes.name],
      exchange: cells[indexes.exchange],
      segment: cells[indexes.segment],
      instrumentType: cells[indexes.instrument_type],
      expiry: cells[indexes.expiry] || null,
      strike: Number(cells[indexes.strike]) || null,
      lotSize: Number(cells[indexes.lot_size]) || null,
    }
  }).filter((item) => item.token && item.symbol)
}

export default async function handler(req, res) {
  const current = requireSession(req, res)
  if (!current) return
  const query = String(req.query?.q || '').trim().toLowerCase().slice(0, 80)
  const type = req.query?.type === 'option' ? 'option' : 'stock'
  const cache = caches[type]
  if (query.length < 2) return sendJson(res, 200, { values: [] })
  if (Date.now() > cache.expires) {
    const exchange = type === 'option' ? 'NFO' : 'NSE'
    const response = await fetch(`https://api.kite.trade/instruments/${exchange}`, { headers: kiteHeaders(current.accessToken) })
    if (!response.ok) return sendJson(res, response.status, { error: 'Unable to load Zerodha instrument catalogue' })
    cache.expires = Date.now() + 6 * 3600000
    cache.values = parseCsv(await response.text()).filter((item) => type === 'stock' || item.instrumentType === 'CE' || item.instrumentType === 'PE')
  }
  const values = cache.values.filter((item) => `${item.symbol} ${item.name} ${item.strike || ''} ${item.instrumentType || ''}`.toLowerCase().includes(query)).slice(0, 25)
  sendJson(res, 200, { values, count: cache.values.length })
}
