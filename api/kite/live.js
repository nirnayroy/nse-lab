import WebSocket from 'ws'
import { requireSession } from './_shared.js'

export const config = { maxDuration: 300 }

function parseTicks(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  if (buffer.byteLength < 2) return []
  const count = view.getUint16(0)
  const ticks = []
  let offset = 2
  for (let i = 0; i < count && offset + 2 <= buffer.byteLength; i += 1) {
    const length = view.getUint16(offset); offset += 2
    if (offset + length > buffer.byteLength || length < 8) break
    const instrumentToken = view.getUint32(offset)
    const segment = instrumentToken & 0xff
    const divisor = segment === 3 ? 10000000 : segment === 6 ? 10000 : 100
    ticks.push({ instrumentToken, lastPrice: view.getUint32(offset + 4) / divisor, timestamp: Date.now() })
    offset += length
  }
  return ticks
}

export default function handler(req, res) {
  const current = requireSession(req, res)
  if (!current) return
  const tokens = String(req.query?.tokens || '').split(',').map(Number).filter((token) => Number.isSafeInteger(token) && token > 0).slice(0, 100)
  if (!tokens.length) { res.statusCode = 400; return res.end('No valid instrument tokens') }
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const socket = new WebSocket(`wss://ws.kite.trade?api_key=${encodeURIComponent(process.env.KITE_API_KEY)}&access_token=${encodeURIComponent(current.accessToken)}`)
  const heartbeat = setInterval(()=>res.write(': heartbeat\n\n'),15000)
  socket.on('open',()=>{socket.send(JSON.stringify({a:'subscribe',v:tokens}));socket.send(JSON.stringify({a:'mode',v:['ltp',tokens]}));send('status',{status:'live',tokens})})
  socket.on('message',(data,isBinary)=>{if(isBinary)parseTicks(Buffer.from(data)).forEach((tick)=>send('tick',tick))})
  socket.on('error',(error)=>send('status',{status:'error',message:error.message}))
  socket.on('close',()=>{send('status',{status:'closed'});clearInterval(heartbeat);res.end()})
  req.on('close',()=>{clearInterval(heartbeat);if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close()})
}
