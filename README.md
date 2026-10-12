# NSE Lab

NSE Lab is a browser-based research workspace for Indian stocks and options. It combines Zerodha Kite market data with time-series analytics, configurable strategy backtesting, and paper forward-testing.

## Features

- NSE equity and NFO options search with live prices and historical candles
- Return, volatility, drawdown, Sharpe ratio, and rolling-risk analytics
- SMA, EMA, RSI, Donchian breakout, Bollinger, and momentum strategy presets
- A custom rule builder with composable entry and exit conditions
- Transaction-cost-aware backtests with equity curves and trade logs
- Browser-persisted paper forward-testing without live order placement
- Clerk authentication and Vercel serverless Kite integration

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Populate `.env.local` with Clerk and Zerodha Kite credentials. Never commit real credentials.

## Validation

```bash
npm test
npm run build
```

## Disclaimer

This project is for research and education only. It is not investment advice, and its backtests do not guarantee future results.
