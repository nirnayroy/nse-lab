export function simpleMovingAverage(values, window) {
  return values.map((_, index) => {
    if (index < window - 1) return null
    const slice = values.slice(index - window + 1, index + 1)
    return slice.reduce((sum, value) => sum + value, 0) / window
  })
}

export function calculateAnalytics(series, fast = 20, slow = 100) {
  const closes = series.map((row) => row.close)
  const returns = closes.slice(1).map((value, index) => value / closes[index] - 1)
  const fastMA = simpleMovingAverage(closes, fast)
  const slowMA = simpleMovingAverage(closes, slow)
  let equity = 1
  let peak = 1
  let maxDrawdown = 0
  let wins = 0
  let trades = 0
  const strategy = [1]

  for (let i = 1; i < closes.length; i += 1) {
    const active = fastMA[i - 1] != null && slowMA[i - 1] != null && fastMA[i - 1] > slowMA[i - 1]
    const previousActive = i > 1 && fastMA[i - 2] != null && slowMA[i - 2] != null && fastMA[i - 2] > slowMA[i - 2]
    if (active !== previousActive) trades += 1
    const daily = active ? returns[i - 1] : 0
    if (daily > 0) wins += 1
    equity *= 1 + daily
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1)
    strategy.push(equity)
  }

  const totalReturn = closes.length > 1 ? closes.at(-1) / closes[0] - 1 : 0
  const strategyReturn = equity - 1
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1)
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(returns.length - 1, 1)
  const volatility = Math.sqrt(variance) * Math.sqrt(252)
  const sharpe = volatility ? (mean * 252 - 0.065) / volatility : 0
  const periodYears = Math.max(series.length / 252, 1 / 252)
  const cagr = (closes.at(-1) / closes[0]) ** (1 / periodYears) - 1
  const rollingVol = returns.map((_, index) => {
    const windowReturns = returns.slice(Math.max(0, index - 19), index + 1)
    const avg = windowReturns.reduce((sum, value) => sum + value, 0) / windowReturns.length
    const v = windowReturns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(windowReturns.length - 1, 1)
    return Math.sqrt(v) * Math.sqrt(252)
  })

  return { totalReturn, strategyReturn, cagr, volatility, sharpe, maxDrawdown, trades, winRate: returns.length ? wins / returns.length : 0, fastMA, slowMA, strategy, rollingVol }
}

function relativeStrengthIndex(values, period = 14) {
  const output = Array(values.length).fill(null)
  for (let index = period; index < values.length; index += 1) {
    let gains = 0, losses = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      const change = values[cursor] - values[cursor - 1]
      if (change >= 0) gains += change
      else losses -= change
    }
    const averageGain = gains / period, averageLoss = losses / period
    output[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss)
  }
  return output
}

function exponentialMovingAverage(values, period = 20) {
  const output = Array(values.length).fill(null)
  if (!values.length) return output
  const multiplier = 2 / (Math.max(2, period) + 1)
  let average = values[0]
  for (let index = 0; index < values.length; index += 1) {
    average = index === 0 ? values[index] : values[index] * multiplier + average * (1 - multiplier)
    if (index >= period - 1) output[index] = average
  }
  return output
}

function rollingStatistic(values, period, mode) {
  return values.map((_, index) => {
    if (index < period) return null
    const prior = values.slice(index - period, index)
    if (mode === 'highest') return Math.max(...prior)
    if (mode === 'lowest') return Math.min(...prior)
    const mean = prior.reduce((sum, value) => sum + value, 0) / prior.length
    const variance = prior.reduce((sum, value) => sum + (value - mean) ** 2, 0) / prior.length
    return { mean, deviation: Math.sqrt(variance) }
  })
}

function indicatorSeries(values, source, period, cache) {
  const safePeriod = Math.max(2, Number(period) || 20)
  const key = `${source}:${safePeriod}`
  if (cache.has(key)) return cache.get(key)
  let output
  if (source === 'price') output = values
  else if (source === 'sma') output = simpleMovingAverage(values, safePeriod)
  else if (source === 'ema') output = exponentialMovingAverage(values, safePeriod)
  else if (source === 'rsi') output = relativeStrengthIndex(values, safePeriod)
  else output = rollingStatistic(values, safePeriod, source)
  cache.set(key, output)
  return output
}

function ruleMatches(rule, index, values, cache) {
  const left = indicatorSeries(values, rule.left || 'price', rule.leftPeriod, cache)
  const right = rule.right === 'value'
    ? Array(values.length).fill(Number(rule.value) || 0)
    : indicatorSeries(values, rule.right || 'sma', rule.rightPeriod, cache)
  const currentLeft = left[index], currentRight = right[index]
  if (currentLeft == null || currentRight == null) return false
  if (rule.operator === 'above') return currentLeft > currentRight
  if (rule.operator === 'below') return currentLeft < currentRight
  const previousLeft = left[index - 1], previousRight = right[index - 1]
  if (previousLeft == null || previousRight == null) return false
  if (rule.operator === 'crossesBelow') return currentLeft < currentRight && previousLeft >= previousRight
  return currentLeft > currentRight && previousLeft <= previousRight
}

export function buildCustomSignals(values, entryRules = [], exitRules = [], entryLogic = 'all', exitLogic = 'any') {
  const desired = Array(values.length).fill(0)
  const cache = new Map()
  let active = 0
  const match = (rules, index, logic) => rules.length > 0 && (logic === 'any' ? rules.some(rule => ruleMatches(rule,index,values,cache)) : rules.every(rule => ruleMatches(rule,index,values,cache)))
  for (let index = 1; index < values.length; index += 1) {
    if (!active && match(entryRules,index,entryLogic)) active = 1
    else if (active && match(exitRules,index,exitLogic)) active = 0
    desired[index] = active
  }
  return desired
}

export function runBacktest(series, config = {}) {
  const closes = series.map(row => Number(row.close) || 0)
  const strategy = config.strategy || 'sma'
  const fast = Math.max(2, Number(config.fast) || 20)
  const slow = Math.max(fast + 1, Number(config.slow) || 100)
  const rsiPeriod = Math.max(2, Number(config.rsiPeriod) || 14)
  const rsiBuy = Number(config.rsiBuy) || 30
  const rsiSell = Number(config.rsiSell) || 70
  const breakoutWindow = Math.max(2, Number(config.breakoutWindow) || 20)
  const bandPeriod = Math.max(2, Number(config.bandPeriod) || 20)
  const bandStdDev = Math.max(0.1, Number(config.bandStdDev) || 2)
  const momentumPeriod = Math.max(2, Number(config.momentumPeriod) || 20)
  const momentumEntry = Number(config.momentumEntry) || 0
  const momentumExit = Number(config.momentumExit) || 0
  const initialCapital = Math.max(1, Number(config.initialCapital) || 100000)
  const costRate = Math.max(0, Number(config.costBps) || 0) / 10000
  const fastMA = simpleMovingAverage(closes, fast)
  const slowMA = simpleMovingAverage(closes, slow)
  const rsi = relativeStrengthIndex(closes, rsiPeriod)
  const desired = Array(closes.length).fill(0)

  if (strategy === 'sma') {
    for (let index = 0; index < closes.length; index += 1) desired[index] = fastMA[index] != null && slowMA[index] != null && fastMA[index] > slowMA[index] ? 1 : 0
  } else if (strategy === 'ema') {
    const fastEMA = exponentialMovingAverage(closes,fast), slowEMA = exponentialMovingAverage(closes,slow)
    for (let index = 0; index < closes.length; index += 1) desired[index] = fastEMA[index] != null && slowEMA[index] != null && fastEMA[index] > slowEMA[index] ? 1 : 0
  } else if (strategy === 'rsi') {
    let active = 0
    for (let index = 0; index < closes.length; index += 1) {
      if (rsi[index] != null && rsi[index] <= rsiBuy) active = 1
      if (rsi[index] != null && rsi[index] >= rsiSell) active = 0
      desired[index] = active
    }
  } else if (strategy === 'breakout') {
    let active = 0
    for (let index = breakoutWindow; index < closes.length; index += 1) {
      const prior = closes.slice(index - breakoutWindow, index)
      if (closes[index] > Math.max(...prior)) active = 1
      if (closes[index] < Math.min(...prior.slice(Math.floor(prior.length / 2)))) active = 0
      desired[index] = active
    }
  } else if (strategy === 'bollinger') {
    let active = 0
    const bands = rollingStatistic(closes,bandPeriod,'bands')
    for (let index = 0; index < closes.length; index += 1) {
      const band = bands[index]
      if (band && closes[index] < band.mean - bandStdDev * band.deviation) active = 1
      if (band && closes[index] > band.mean) active = 0
      desired[index] = active
    }
  } else if (strategy === 'momentum') {
    let active = 0
    for (let index = momentumPeriod; index < closes.length; index += 1) {
      const momentum = closes[index] / closes[index - momentumPeriod] - 1
      if (momentum > momentumEntry / 100) active = 1
      if (momentum < momentumExit / 100) active = 0
      desired[index] = active
    }
  } else if (strategy === 'custom') {
    desired.splice(0,desired.length,...buildCustomSignals(closes,config.entryRules,config.exitRules,config.entryLogic,config.exitLogic))
  }

  let equity = initialCapital, peak = initialCapital, maxDrawdown = 0, position = 0, entryPrice = null, wins = 0, closedTrades = 0
  const equityCurve = [initialCapital]
  const trades = []
  for (let index = 1; index < closes.length; index += 1) {
    equity *= 1 + position * (closes[index] / closes[index - 1] - 1)
    const nextPosition = desired[index - 1]
    if (nextPosition !== position) {
      equity *= 1 - costRate
      const side = nextPosition ? 'BUY' : 'SELL'
      if (side === 'BUY') entryPrice = closes[index]
      else if (entryPrice != null) { closedTrades += 1; if (closes[index] > entryPrice) wins += 1; entryPrice = null }
      trades.push({ date: series[index]?.date, side, price: closes[index], equity })
      position = nextPosition
    }
    peak = Math.max(peak, equity)
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1)
    equityCurve.push(equity)
  }
  const benchmarkCurve = closes.map(value => initialCapital * value / Math.max(closes[0], 1))
  const totalReturn = equity / initialCapital - 1
  const benchmarkReturn = benchmarkCurve.at(-1) / initialCapital - 1
  return { strategy, totalReturn, benchmarkReturn, excessReturn: totalReturn - benchmarkReturn, maxDrawdown, tradeCount: trades.length, winRate: closedTrades ? wins / closedTrades : 0, currentSignal: desired.at(-1) ? 'LONG' : 'CASH', equityCurve, benchmarkCurve, trades }
}

export function makeDemoSeries(seed = 11, length = 260) {
  let price = 1820 + seed * 13
  return Array.from({ length }, (_, index) => {
    const noise = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453
    const random = noise - Math.floor(noise)
    const drift = 0.0005 + Math.sin(index / 17) * 0.0022 + (random - 0.5) * 0.027
    const open = price
    price = Math.max(400, price * (1 + drift))
    return {
      date: new Date(Date.now() - (length - index) * 86400000).toISOString().slice(0, 10),
      open,
      high: Math.max(open, price) * (1 + random * 0.009),
      low: Math.min(open, price) * (1 - random * 0.008),
      close: price,
      volume: Math.round(800000 + random * 4200000),
    }
  })
}
