import { kiteHeaders, requireSession, sendJson } from './_shared.js'

export default async function handler(req, res) {
  const current = requireSession(req, res)
  if (!current) return

  const response = await fetch('https://api.kite.trade/orders', {
    headers: kiteHeaders(current.accessToken),
  })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') {
    return sendJson(res, response.status || 502, { error: result.message || 'Order history request failed' })
  }

  const orders = result.data.map((order) => ({
    orderId: order.order_id,
    timestamp: order.order_timestamp || order.exchange_timestamp || null,
    symbol: order.tradingsymbol,
    exchange: order.exchange,
    side: order.transaction_type,
    type: order.order_type,
    product: order.product,
    quantity: order.quantity,
    filledQuantity: order.filled_quantity,
    averagePrice: order.average_price,
    price: order.price,
    status: order.status,
    statusMessage: order.status_message || order.status_message_raw || null,
  })).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))

  sendJson(res, 200, { orders, asOf: new Date().toISOString() })
}
