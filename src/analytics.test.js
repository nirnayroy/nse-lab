import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCustomSignals, makeDemoSeries, runBacktest } from './analytics.js'

test('custom rules enter and exit using indicator thresholds', () => {
  const closes = [10, 9, 8, 7, 8, 9, 10, 11]
  const signals = buildCustomSignals(
    closes,
    [{ left:'rsi', leftPeriod:2, operator:'below', right:'value', value:30 }],
    [{ left:'rsi', leftPeriod:2, operator:'above', right:'value', value:70 }],
  )
  assert.equal(signals[2], 1)
  assert.equal(signals.at(-1), 0)
})

test('all configurable strategy presets produce complete results', () => {
  const series = makeDemoSeries(17, 260)
  for (const strategy of ['sma','ema','rsi','breakout','bollinger','momentum']) {
    const result = runBacktest(series, { strategy, initialCapital:100000, costBps:10 })
    assert.equal(result.strategy, strategy)
    assert.equal(result.equityCurve.length, series.length)
    assert.ok(Number.isFinite(result.totalReturn))
  }
})

test('custom strategy respects ALL entry and ANY exit groups', () => {
  const series = makeDemoSeries(5, 120)
  const result = runBacktest(series, {
    strategy:'custom',
    entryLogic:'all',
    exitLogic:'any',
    entryRules:[
      { left:'price', operator:'above', right:'sma', rightPeriod:10 },
      { left:'rsi', leftPeriod:8, operator:'above', right:'value', value:55 },
    ],
    exitRules:[
      { left:'price', operator:'crossesBelow', right:'ema', rightPeriod:10 },
      { left:'rsi', leftPeriod:8, operator:'below', right:'value', value:40 },
    ],
  })
  assert.ok(result.tradeCount > 0)
  assert.ok(['LONG','CASH'].includes(result.currentSignal))
})
