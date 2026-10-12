import { kiteConfigured, sendJson, session } from './_shared.js'

export default function handler(req, res) {
  const configured = kiteConfigured()
  const current = configured ? session(req) : null
  sendJson(res, 200, {
    configured,
    connected: Boolean(current?.accessToken),
    expiresAt: current?.expiresAt || null,
    loading: false,
  })
}
