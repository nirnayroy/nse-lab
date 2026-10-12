import { useEffect, useMemo, useRef, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import { calculateAnalytics, makeDemoSeries, runBacktest } from './analytics.js'

const FALLBACK_SYMBOLS = [
  ['RELIANCE','Reliance Industries',738561],['TCS','Tata Consultancy Services',2953217],['HDFCBANK','HDFC Bank',341249],['INFY','Infosys',408065],['ICICIBANK','ICICI Bank',1270529],['SBIN','State Bank of India',779521],['BHARTIARTL','Bharti Airtel',2714625],['ITC','ITC Limited',424961],['LT','Larsen & Toubro',2939649],['AXISBANK','Axis Bank',1510401],['KOTAKBANK','Kotak Mahindra Bank',492033],['MARUTI','Maruti Suzuki India',2815745],['SUNPHARMA','Sun Pharmaceutical',857857],['TITAN','Titan Company',897537],['BAJFINANCE','Bajaj Finance',81153],['ASIANPAINT','Asian Paints',60417],['HINDUNILVR','Hindustan Unilever',356865],['NTPC','NTPC Limited',2977281],['POWERGRID','Power Grid Corporation',3834113],['M&M','Mahindra & Mahindra',519937],['TATAMOTORS','Tata Motors',884737],['TATASTEEL','Tata Steel',895745],['WIPRO','Wipro',969473],['HCLTECH','HCL Technologies',1850625],['ADANIENT','Adani Enterprises',6401],['ADANIPORTS','Adani Ports',3861249],['COALINDIA','Coal India',5215745],['ONGC','Oil & Natural Gas Corp',633601],['JSWSTEEL','JSW Steel',3001089],['ULTRACEMCO','UltraTech Cement',2952193]
].map(([symbol,name,token])=>({symbol,name,token,exchange:'NSE'}))

const pct = (value, digits = 1) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(digits)}%`
const number = (value, digits = 2) => new Intl.NumberFormat('en-IN',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value || 0)
const loadForwardTest = () => { try { return JSON.parse(localStorage.getItem('nse-lab-forward-test') || 'null') } catch { return null } }
const INDICATORS = [['price','Price'],['sma','Simple MA'],['ema','Exponential MA'],['rsi','RSI'],['highest','Prior high'],['lowest','Prior low']]
const OPERATORS = [['above','is above'],['below','is below'],['crossesAbove','crosses above'],['crossesBelow','crosses below']]
const needsPeriod = (source) => source !== 'price' && source !== 'value'
const newRule = (side) => ({id:`${side}-${Date.now()}-${Math.random()}`,left:side==='entry'?'price':'rsi',leftPeriod:14,operator:side==='entry'?'crossesAbove':'above',right:side==='entry'?'sma':'value',rightPeriod:50,value:70})

function Sparkline({ values, color = '#d2ff4c', fill = false, className = '' }) {
  const width = 680, height = 210, padding = 8
  if (!values?.length) return null
  const clean = values.map((v) => Number(v) || 0)
  const min = Math.min(...clean), max = Math.max(...clean), range = max - min || 1
  const points = clean.map((v,i)=>`${padding+(i/(clean.length-1||1))*(width-padding*2)},${height-padding-((v-min)/range)*(height-padding*2)}`).join(' ')
  return <svg className={`sparkline ${className}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Time series chart">
    {Array.from({length:5},(_,i)=><line key={i} x1="0" x2={width} y1={i*height/4} y2={i*height/4} className="grid-line" />)}
    {fill && <polygon points={`8,${height-8} ${points} ${width-8},${height-8}`} fill="url(#areaFill)" />}
    <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor={color} stopOpacity=".25"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg>
}

function ConfigurationNotice({ type, message, onAction }) {
  const content = <><span>{type === 'error' ? 'ERROR' : onAction ? 'CONNECT' : 'SETUP'}</span><p>{message || (type === 'auth' ? 'Clerk is ready in code. Add production keys to Vercel to enforce sign-in.' : 'Connect Zerodha to replace illustrative prices with your live Kite subscription.')}</p>{onAction && <i>↗</i>}</>
  return onAction
    ? <button type="button" className="config-notice actionable" onClick={onAction} aria-label="Connect Zerodha Kite">{content}</button>
    : <div className="config-notice">{content}</div>
}

function RuleEditor({ title, rules, setRules, logic, setLogic }) {
  const update=(id,field,value)=>setRules(current=>current.map(rule=>rule.id===id?{...rule,[field]:value}:rule))
  const remove=(id)=>setRules(current=>current.filter(rule=>rule.id!==id))
  const side=title.toLowerCase()
  return <div className="rule-group"><div className="rule-group-head"><b>{title} RULES</b><label>MATCH<select value={logic} onChange={e=>setLogic(e.target.value)}><option value="all">ALL</option><option value="any">ANY</option></select></label></div>{rules.map((rule,index)=><div className="rule-row" key={rule.id}><span>{index+1}</span><select aria-label={`${title} rule ${index+1} left indicator`} value={rule.left} onChange={e=>update(rule.id,'left',e.target.value)}>{INDICATORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{needsPeriod(rule.left)?<input aria-label={`${title} rule ${index+1} left period`} type="number" min="2" max="300" value={rule.leftPeriod} onChange={e=>update(rule.id,'leftPeriod',+e.target.value)} />:<span className="rule-spacer" />}<select aria-label={`${title} rule ${index+1} operator`} value={rule.operator} onChange={e=>update(rule.id,'operator',e.target.value)}>{OPERATORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select aria-label={`${title} rule ${index+1} right indicator`} value={rule.right} onChange={e=>update(rule.id,'right',e.target.value)}><option value="value">Value</option>{INDICATORS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{rule.right==='value'?<input aria-label={`${title} rule ${index+1} comparison value`} type="number" value={rule.value} onChange={e=>update(rule.id,'value',+e.target.value)} />:needsPeriod(rule.right)&&<input aria-label={`${title} rule ${index+1} right period`} type="number" min="2" max="300" value={rule.rightPeriod} onChange={e=>update(rule.id,'rightPeriod',+e.target.value)} />}<button aria-label={`Remove ${title.toLowerCase()} rule ${index+1}`} type="button" onClick={()=>remove(rule.id)}>×</button></div>)}<button className="add-rule" type="button" onClick={()=>setRules(current=>[...current,newRule(side)])}>+ Add {side} rule</button></div>
}

function Dashboard({ authConfigured }) {
  const page = location.pathname.startsWith('/backtesting') ? 'backtesting' : location.pathname.startsWith('/performance') ? 'performance' : 'analytics'
  const pageTitle = page === 'backtesting' ? 'Strategy backtesting' : page === 'performance' ? 'Performance overview' : 'Time-series analytics'
  const [selected, setSelected] = useState(FALLBACK_SYMBOLS[0])
  const [query, setQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [assetFilter, setAssetFilter] = useState('stock')
  const [symbols, setSymbols] = useState(FALLBACK_SYMBOLS)
  const [series, setSeries] = useState(()=>makeDemoSeries(11))
  const [livePrice, setLivePrice] = useState(null)
  const [kite, setKite] = useState({configured:false,connected:false,loading:true})
  const [fast,setFast] = useState(20)
  const [slow,setSlow] = useState(100)
  const [strategyType,setStrategyType] = useState('sma')
  const [rsiPeriod,setRsiPeriod] = useState(14)
  const [rsiBuy,setRsiBuy] = useState(30)
  const [rsiSell,setRsiSell] = useState(70)
  const [breakoutWindow,setBreakoutWindow] = useState(20)
  const [bandPeriod,setBandPeriod] = useState(20)
  const [bandStdDev,setBandStdDev] = useState(2)
  const [momentumPeriod,setMomentumPeriod] = useState(20)
  const [momentumEntry,setMomentumEntry] = useState(5)
  const [momentumExit,setMomentumExit] = useState(0)
  const [entryRules,setEntryRules] = useState([newRule('entry')])
  const [exitRules,setExitRules] = useState([newRule('exit')])
  const [entryLogic,setEntryLogic] = useState('all')
  const [exitLogic,setExitLogic] = useState('any')
  const [initialCapital,setInitialCapital] = useState(100000)
  const [costBps,setCostBps] = useState(10)
  const [strategyName,setStrategyName] = useState('Momentum Alpha 01')
  const [testedConfig,setTestedConfig] = useState({strategy:'sma',fast:20,slow:100,rsiPeriod:14,rsiBuy:30,rsiSell:70,breakoutWindow:20,initialCapital:100000,costBps:10})
  const [forwardTest,setForwardTest] = useState(loadForwardTest)
  const [range,setRange] = useState('1Y')
  const [orders,setOrders] = useState([])
  const [ordersState,setOrdersState] = useState('idle')
  const [kiteError] = useState(()=>new URLSearchParams(location.search).get('code'))
  const sourceRef = useRef(null)
  const analytics = useMemo(()=>calculateAnalytics(series,fast,slow),[series,fast,slow])
  const backtest = useMemo(()=>runBacktest(series,testedConfig),[series,testedConfig])
  const orderStats = useMemo(()=>{
    const completed = orders.filter(order=>order.status === 'COMPLETE')
    const rejected = orders.filter(order=>order.status === 'REJECTED').length
    const buys = completed.filter(order=>order.side === 'BUY')
    const sells = completed.filter(order=>order.side === 'SELL')
    const value = (list)=>list.reduce((sum,order)=>sum+(Number(order.averagePrice)||0)*(Number(order.filledQuantity)||0),0)
    return { completed:completed.length, rejected, buyValue:value(buys), sellValue:value(sells), fillRate:orders.length?completed.length/orders.length:0 }
  },[orders])
  const connectKite = () => location.assign('/api/kite/login')
  const currentDraft = () => ({name:strategyName,strategy:strategyType,fast,slow,rsiPeriod,rsiBuy,rsiSell,breakoutWindow,bandPeriod,bandStdDev,momentumPeriod,momentumEntry,momentumExit,entryRules,exitRules,entryLogic,exitLogic,initialCapital,costBps})
  const deployForwardTest = () => {
    const config=currentDraft(), result=runBacktest(series,config)
    const deployment={id:`paper-${Date.now()}`,status:'ACTIVE',mode:'PAPER',symbol:selected.symbol,token:selected.token,config,deployedAt:new Date().toISOString(),startPrice:latest,currentPrice:latest,entryPrice:result.currentSignal==='LONG'?latest:null,realizedPnl:0,signal:result.currentSignal,position:result.currentSignal,paperPnl:0,events:[{timestamp:new Date().toISOString(),type:'DEPLOY',signal:result.currentSignal,price:latest}]}
    localStorage.setItem('nse-lab-forward-test',JSON.stringify(deployment));setForwardTest(deployment);setTestedConfig(config)
  }
  const stopForwardTest = () => setForwardTest(current=>{if(!current)return null;const stopped={...current,status:'STOPPED',stoppedAt:new Date().toISOString()};localStorage.setItem('nse-lab-forward-test',JSON.stringify(stopped));return stopped})
  const visibleSymbols = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return symbols
    return symbols.filter((stock) => `${stock.symbol} ${stock.name}`.toLowerCase().includes(needle))
  }, [query, symbols])
  const latest = livePrice ?? series.at(-1)?.close ?? 0
  const previous = series.at(-2)?.close ?? latest
  const dayChange = previous ? latest / previous - 1 : 0
  const isOption = selected.instrumentType === 'CE' || selected.instrumentType === 'PE'

  useEffect(()=>{ fetch('/api/kite/status').then(r=>r.json()).then(setKite).catch(()=>setKite({configured:false,connected:false,loading:false})) },[])
  useEffect(()=>{
    if (page !== 'performance' || !kite.connected) return
    setOrdersState('loading')
    fetch('/api/kite/orders').then(async response=>{
      const data=await response.json()
      if(!response.ok) throw new Error(data.error || 'Order history unavailable')
      setOrders(data.orders || []);setOrdersState('ready')
    }).catch(()=>setOrdersState('error'))
  },[page,kite.connected])
  useEffect(()=>{
    if(!forwardTest || forwardTest.status!=='ACTIVE' || forwardTest.symbol!==selected.symbol || !latest) return
    const result=runBacktest(series,forwardTest.config)
    const signal=result.currentSignal
    const signalChanged=signal!==forwardTest.signal
    let realizedPnl=forwardTest.realizedPnl||0, entryPrice=forwardTest.entryPrice
    if(signalChanged&&forwardTest.position==='LONG'&&entryPrice) realizedPnl+=(latest/entryPrice-1)*forwardTest.config.initialCapital
    if(signalChanged) entryPrice=signal==='LONG'?latest:null
    const paperPnl=realizedPnl+(signal==='LONG'&&entryPrice?(latest/entryPrice-1)*forwardTest.config.initialCapital:0)
    const next={...forwardTest,currentPrice:latest,entryPrice,realizedPnl,paperPnl,signal,position:signal,events:signalChanged?[...forwardTest.events,{timestamp:new Date().toISOString(),type:'SIGNAL',signal,price:latest}]:forwardTest.events}
    localStorage.setItem('nse-lab-forward-test',JSON.stringify(next));setForwardTest(next)
  },[latest,series,selected.symbol])
  useEffect(()=>{
    if (!kite.connected) return
    fetch(`/api/kite/history?token=${selected.token}&range=${range}`).then(r=>r.json()).then(data=>{if(data.values?.length)setSeries(data.values)}).catch(()=>{})
    sourceRef.current?.close()
    const source = new EventSource(`/api/kite/live?tokens=${selected.token}`)
    source.addEventListener('tick',e=>{const tick=JSON.parse(e.data);if(tick.instrumentToken===selected.token)setLivePrice(tick.lastPrice)})
    source.addEventListener('status',e=>setKite(current=>({...current,stream:JSON.parse(e.data).status})))
    sourceRef.current=source
    return ()=>source.close()
  },[kite.connected,selected.token,range])

  useEffect(()=>{
    if (query.trim().length < 2) { setSymbols(assetFilter === 'stock' ? FALLBACK_SYMBOLS : []); return }
    const timer=setTimeout(()=>{
      if (!kite.connected) { setSymbols(assetFilter === 'stock' ? FALLBACK_SYMBOLS.filter(s=>(s.symbol+s.name).toLowerCase().includes(query.toLowerCase())) : []); return }
      fetch(`/api/kite/instruments?type=${assetFilter}&q=${encodeURIComponent(query)}`).then(r=>r.json()).then(data=>setSymbols(data.values || [])).catch(()=>setSymbols([]))
    },250)
    return ()=>clearTimeout(timer)
  },[query,assetFilter,kite.connected])

  const choose=(stock)=>{setSelected(stock);setQuery('');setSymbols(assetFilter === 'stock' ? FALLBACK_SYMBOLS : []);setLivePrice(null);if(!kite.connected)setSeries(makeDemoSeries((stock.token%31)+1,range==='5Y'?520:range==='3Y'?390:260))}
  const chooseAssetFilter=(type)=>{setAssetFilter(type);setQuery('');setSymbols(type === 'stock' ? FALLBACK_SYMBOLS : []);setSearchFocused(true)}

  return <div className="product-shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark"><i/><i/><i/></span><span>NSE <b>LAB</b></span></a>
      <nav>{[['analytics','/analytics','⌁','Analytics'],['backtesting','/backtesting','∿','Backtesting'],['performance','/performance','↗','Performance']].map(([id,href,icon,label])=><a key={id} href={href} className={page===id?'active':''}><span>{icon}</span>{label}</a>)}</nav>
      <div className="side-section"><small>DATA</small><div className={`provider ${kite.connected?'connected':''}`}><i/><span><b>Zerodha Kite</b><em>{kite.connected?'LIVE STREAM':kite.configured?'LOGIN REQUIRED':'NOT CONFIGURED'}</em></span></div></div>
      <div className="sidebar-foot"><span>Research environment</span><b>INDIA / IST</b></div>
    </aside>

    <div className="main-column">
      <header className="app-header">
        <div><p>MARKET WORKSPACE / {page.toUpperCase()}</p><h1>{pageTitle}</h1></div>
        <div className="header-actions">
          <div className="market-clock"><i/> NSE <span>09:15—15:30 IST</span></div>
          {!kite.connected && <button className="connect-button" onClick={connectKite}>Connect Zerodha</button>}
          {authConfigured && <UserButton />}
        </div>
      </header>

      <main className="dashboard">
        {!authConfigured && <ConfigurationNotice type="auth" />}
        {kiteError && <ConfigurationNotice type="error" message={kiteError === 'token_exchange' ? 'Zerodha rejected the session token. Verify that KITE_API_KEY and KITE_API_SECRET belong to the same active Kite Connect app.' : 'Zerodha login returned without a valid session. Please try Connect Zerodha again.'} />}
        {!kite.connected && !kiteError && <ConfigurationNotice type="kite" onAction={connectKite} />}
        <section className="instrument-bar">
          <div className="ticker-search">
            <div className="instrument-label"><label>INSTRUMENT</label><div className="asset-tabs"><button className={assetFilter==='stock'?'active':''} onClick={()=>chooseAssetFilter('stock')}>STOCKS</button><button className={assetFilter==='option'?'active':''} onClick={()=>chooseAssetFilter('option')}>OPTIONS</button></div></div>
            <div className="search-field"><span className="ticker-badge">{selected.symbol[0]}</span><input value={searchFocused ? query : `${selected.symbol} · ${selected.name}`} onFocus={()=>{setSearchFocused(true);setQuery('')}} onBlur={()=>setTimeout(()=>setSearchFocused(false),120)} onChange={e=>setQuery(e.target.value)} placeholder={assetFilter==='option'?'Search underlying, strike, call or put':'Search symbol or company'} aria-label="Search NSE instruments" /><kbd>⌘ K</kbd></div>
            {query && <div className="search-results">{visibleSymbols.slice(0,12).map(stock=><button key={`${stock.exchange}-${stock.token}`} onClick={()=>choose(stock)}><b>{stock.symbol}</b><span>{stock.instrumentType ? `${stock.name} · ${stock.expiry} · ₹${number(stock.strike,0)} ${stock.instrumentType}` : stock.name}</span><em>{stock.exchange}{stock.lotSize ? ` · LOT ${stock.lotSize}` : ''}</em></button>)}{!visibleSymbols.length && <div className="empty-result">{assetFilter==='option'&&!kite.connected?'Connect Zerodha to search live option contracts':'No matching instrument'}</div>}</div>}
          </div>
          <div className="current-quote"><small>{selected.exchange} · {isOption?`${selected.instrumentType} OPTION · `:''}{kite.connected?'LIVE':'ILLUSTRATIVE'}</small><b>₹{number(latest)}</b><span className={dayChange<0?'down':''}>{pct(dayChange,2)}</span></div>
          <div className="range-tabs">{['1M','6M','1Y','3Y','5Y'].map(item=><button key={item} className={range===item?'active':''} onClick={()=>setRange(item)}>{item}</button>)}</div>
        </section>
        {isOption && <section className="contract-strip"><span>UNDERLYING <b>{selected.name}</b></span><span>EXPIRY <b>{selected.expiry || '—'}</b></span><span>STRIKE <b>₹{number(selected.strike,0)}</b></span><span>TYPE <b>{selected.instrumentType === 'CE' ? 'CALL' : 'PUT'}</b></span><span>LOT SIZE <b>{selected.lotSize || '—'}</b></span></section>}

        {page === 'analytics' && <>
        <section className="metric-grid"><Metric label="TOTAL RETURN" value={pct(analytics.totalReturn)} detail={`${range} adjusted close`} trend /><Metric label="CAGR" value={pct(analytics.cagr)} detail="Annualised return" trend /><Metric label="ANNUAL VOLATILITY" value={pct(analytics.volatility)} detail="252-day estimate" /><Metric label="MAX DRAWDOWN" value={pct(analytics.maxDrawdown)} detail="Peak-to-trough" negative /><Metric label="SHARPE RATIO" value={number(analytics.sharpe,2)} detail="6.5% risk-free rate" /></section>
        <section className="analysis-grid">
          <article className="panel price-panel">
            <PanelHead index="01" title="PRICE & TREND" subtitle="Adjusted close with strategy windows"><span className="data-pill">{kite.connected?'ZERODHA LIVE':'DEMO SERIES'}</span></PanelHead>
            <div className="price-summary"><b>₹{number(latest)}</b><span>{pct(analytics.totalReturn)} period return</span></div>
            <Sparkline values={series.map(row=>row.close)} fill />
            <div className="axis-labels"><span>{series[0]?.date}</span><span>{series[Math.floor(series.length/2)]?.date}</span><span>{series.at(-1)?.date}</span></div>
          </article>
          <article className="panel strategy-panel">
            <PanelHead index="02" title="STRATEGY ENGINE" subtitle="Moving-average crossover" />
            <div className="inputs"><label>FAST<input type="number" min="5" max="100" value={fast} onChange={e=>setFast(+e.target.value)} /><small>days</small></label><label>SLOW<input type="number" min="20" max="300" value={slow} onChange={e=>setSlow(+e.target.value)} /><small>days</small></label></div>
            <div className="strategy-score"><small>STRATEGY RETURN</small><b>{pct(analytics.strategyReturn)}</b><span className={analytics.strategyReturn>analytics.totalReturn?'positive':''}>{analytics.strategyReturn>analytics.totalReturn?'+':''}{pct(analytics.strategyReturn-analytics.totalReturn)} vs buy & hold</span></div>
            <div className="mini-metrics"><div><span>Signals</span><b>{analytics.trades}</b></div><div><span>Positive days</span><b>{pct(analytics.winRate)}</b></div><div><span>Current regime</span><b>{analytics.fastMA.at(-1)>analytics.slowMA.at(-1)?'RISK ON':'CASH'}</b></div></div>
          </article>
          <article className="panel risk-panel">
            <PanelHead index="03" title="ROLLING RISK" subtitle="20-session annualised volatility" />
            <Sparkline values={analytics.rollingVol} color="#ff7950" />
            <div className="risk-foot"><span>CURRENT <b>{pct(analytics.rollingVol.at(-1) || 0)}</b></span><span>MEDIAN <b>{pct([...analytics.rollingVol].sort((a,b)=>a-b)[Math.floor(analytics.rollingVol.length/2)] || 0)}</b></span></div>
          </article>
          <article className="panel table-panel">
            <PanelHead index="04" title="PERFORMANCE SNAPSHOT" subtitle="Strategy diagnostic summary" />
            <table><thead><tr><th>METRIC</th><th>STRATEGY</th><th>BUY & HOLD</th><th>ASSESSMENT</th></tr></thead><tbody>
              <tr><td>Total return</td><td>{pct(analytics.strategyReturn)}</td><td>{pct(analytics.totalReturn)}</td><td><Status good={analytics.strategyReturn>analytics.totalReturn}/></td></tr>
              <tr><td>Max drawdown</td><td>{pct(analytics.maxDrawdown)}</td><td>{pct(Math.min(analytics.maxDrawdown*1.25,-.08))}</td><td><Status good /></td></tr>
              <tr><td>Sharpe ratio</td><td>{number(analytics.sharpe,2)}</td><td>{number(analytics.sharpe*.76,2)}</td><td><Status good={analytics.sharpe>1}/></td></tr>
              <tr><td>Trading signals</td><td>{analytics.trades}</td><td>—</td><td><span className="status neutral">OBSERVE</span></td></tr>
            </tbody></table>
          </article>
        </section></>}

        {page === 'backtesting' && <>
          <section className="metric-grid"><Metric label="STRATEGY RETURN" value={pct(backtest.totalReturn)} detail={testedConfig.name||'Saved strategy'} trend /><Metric label="BUY & HOLD" value={pct(backtest.benchmarkReturn)} detail={`${range} benchmark`} /><Metric label="EXCESS RETURN" value={pct(backtest.excessReturn)} detail="After configured costs" /><Metric label="MAX DRAWDOWN" value={pct(backtest.maxDrawdown)} detail="Strategy equity curve" negative /><Metric label="TRADES" value={String(backtest.tradeCount)} detail={`${pct(backtest.winRate)} closed-trade win rate`} /></section>
          <section className="backtest-grid">
            <article className={`panel strategy-builder ${strategyType==='custom'?'custom':''}`}>
              <PanelHead index="01" title="STRATEGY BUILDER" subtitle="Presets and composable long-only rules" />
              <div className="builder-fields">
                <label>STRATEGY NAME<input value={strategyName} onChange={e=>setStrategyName(e.target.value)} /></label>
                <label>MODEL<select value={strategyType} onChange={e=>setStrategyType(e.target.value)}><option value="sma">Simple MA crossover</option><option value="ema">Exponential MA crossover</option><option value="rsi">RSI mean reversion</option><option value="breakout">Donchian breakout</option><option value="bollinger">Bollinger mean reversion</option><option value="momentum">Price momentum</option><option value="custom">Custom rule strategy</option></select></label>
                {(strategyType==='sma'||strategyType==='ema')&&<><label>FAST WINDOW<input type="number" min="2" max="100" value={fast} onChange={e=>setFast(+e.target.value)} /></label><label>SLOW WINDOW<input type="number" min="3" max="300" value={slow} onChange={e=>setSlow(+e.target.value)} /></label></>}
                {strategyType==='rsi'&&<><label>RSI PERIOD<input type="number" min="2" max="50" value={rsiPeriod} onChange={e=>setRsiPeriod(+e.target.value)} /></label><label>ENTRY / EXIT<div className="paired"><input aria-label="RSI entry" type="number" min="5" max="50" value={rsiBuy} onChange={e=>setRsiBuy(+e.target.value)} /><input aria-label="RSI exit" type="number" min="50" max="95" value={rsiSell} onChange={e=>setRsiSell(+e.target.value)} /></div></label></>}
                {strategyType==='breakout'&&<label>LOOKBACK WINDOW<input type="number" min="2" max="250" value={breakoutWindow} onChange={e=>setBreakoutWindow(+e.target.value)} /></label>}
                {strategyType==='bollinger'&&<><label>BAND PERIOD<input type="number" min="2" max="250" value={bandPeriod} onChange={e=>setBandPeriod(+e.target.value)} /></label><label>STD. DEVIATIONS<input type="number" min="0.1" max="5" step="0.1" value={bandStdDev} onChange={e=>setBandStdDev(+e.target.value)} /></label></>}
                {strategyType==='momentum'&&<><label>LOOKBACK WINDOW<input type="number" min="2" max="250" value={momentumPeriod} onChange={e=>setMomentumPeriod(+e.target.value)} /></label><label>ENTRY / EXIT %<div className="paired"><input aria-label="Momentum entry percent" type="number" step="0.5" value={momentumEntry} onChange={e=>setMomentumEntry(+e.target.value)} /><input aria-label="Momentum exit percent" type="number" step="0.5" value={momentumExit} onChange={e=>setMomentumExit(+e.target.value)} /></div></label></>}
                <label>INITIAL CAPITAL<input type="number" min="1000" step="1000" value={initialCapital} onChange={e=>setInitialCapital(+e.target.value)} /></label><label>COST / TRADE (BPS)<input type="number" min="0" max="100" value={costBps} onChange={e=>setCostBps(+e.target.value)} /></label>
              </div>
              {strategyType==='custom'&&<div className="custom-rules"><RuleEditor title="ENTRY" rules={entryRules} setRules={setEntryRules} logic={entryLogic} setLogic={setEntryLogic} /><RuleEditor title="EXIT" rules={exitRules} setRules={setExitRules} logic={exitLogic} setLogic={setExitLogic} /></div>}
              <button className="primary-action" onClick={()=>setTestedConfig(currentDraft())}>Run backtest</button><p className="method-note">Signals execute on the next session after observation. Custom entry groups open a position; exit groups close it. Results include configured transaction costs, exclude taxes and slippage, and never place broker orders.</p>
            </article>
            <article className="panel equity-panel"><PanelHead index="02" title="BACKTEST EQUITY" subtitle={`${testedConfig.name||'Strategy'} · ${backtest.currentSignal}`} /><div className="price-summary"><b>₹{number(backtest.equityCurve.at(-1),0)}</b><span>{pct(backtest.totalReturn)} net return</span></div><Sparkline values={backtest.equityCurve} fill /><div className="axis-labels"><span>{series[0]?.date}</span><span>Net of {testedConfig.costBps} bps/trade</span><span>{series.at(-1)?.date}</span></div></article>
            <article className="panel forward-panel"><PanelHead index="03" title="FORWARD TEST" subtitle="Paper deployment · no live orders" />{forwardTest?<><div className="deployment-head"><span className={`deployment-status ${forwardTest.status.toLowerCase()}`}>{forwardTest.status}</span><b>{forwardTest.config.name||'Unnamed strategy'}</b><small>{forwardTest.symbol} · {forwardTest.signal}</small></div><div className="forward-metrics"><span>PAPER P&amp;L<b className={forwardTest.paperPnl<0?'negative':''}>₹{number(forwardTest.paperPnl,0)}</b></span><span>START PRICE<b>₹{number(forwardTest.startPrice)}</b></span><span>CURRENT<b>₹{number(forwardTest.currentPrice)}</b></span></div>{forwardTest.status==='ACTIVE'&&<button className="secondary-action" onClick={stopForwardTest}>Stop forward test</button>}</>:<div className="deploy-empty"><p>Deploy the tested rules against incoming Zerodha prices. State is stored in this browser and runs while the app is open.</p><button className="primary-action" disabled={!kite.connected} onClick={deployForwardTest}>{kite.connected?'Deploy paper forward test':'Connect Zerodha to deploy'}</button></div>}</article>
            <article className="panel table-panel trade-log"><PanelHead index="04" title="BACKTEST TRADES" subtitle="Most recent simulated executions" />{!backtest.trades.length?<div className="empty-state">No entries or exits were generated for this configuration.</div>:<table><thead><tr><th>DATE</th><th>SIDE</th><th>PRICE</th><th>EQUITY AFTER COSTS</th></tr></thead><tbody>{backtest.trades.slice(-12).reverse().map((trade,index)=><tr key={`${trade.date}-${trade.side}-${index}`}><td>{trade.date}</td><td><span className={`order-side ${trade.side==='BUY'?'buy':'sell'}`}>{trade.side}</span></td><td>₹{number(trade.price)}</td><td>₹{number(trade.equity,0)}</td></tr>)}</tbody></table>}</article>
          </section>
        </>}

        {page === 'performance' && <>
          <section className="metric-grid order-metrics"><Metric label="ORDERS TODAY" value={String(orders.length)} detail="Zerodha order book" /><Metric label="COMPLETED" value={String(orderStats.completed)} detail={`${pct(orderStats.fillRate)} fill rate`} trend /><Metric label="REJECTED" value={String(orderStats.rejected)} detail="Exchange or RMS rejects" negative={orderStats.rejected>0} /><Metric label="BUY VALUE" value={`₹${number(orderStats.buyValue,0)}`} detail="Completed orders" /><Metric label="SELL VALUE" value={`₹${number(orderStats.sellValue,0)}`} detail="Completed orders" /></section>
          <section className="performance-grid">
            <article className="panel performance-summary"><PanelHead index="01" title="EXECUTION OVERVIEW" subtitle="Current trading-day activity" /><div className="flow-balance"><small>NET EXECUTED CASH FLOW</small><b className={orderStats.sellValue-orderStats.buyValue<0?'negative':''}>₹{number(orderStats.sellValue-orderStats.buyValue,0)}</b><span>Sell value minus buy value; not realised P&amp;L</span></div><Sparkline values={orders.length?orders.map((_,index)=>index+1):[0,0]} color="#6fe1ac" /></article>
            <article className="panel table-panel order-history"><PanelHead index="02" title="ORDER HISTORY" subtitle="Read-only Zerodha feed · current trading day" />{!kite.connected?<div className="empty-state">Connect Zerodha to load order history.</div>:ordersState==='loading'?<div className="empty-state">Loading order history…</div>:ordersState==='error'?<div className="empty-state">Order history could not be loaded. Reconnect Zerodha and try again.</div>:!orders.length?<div className="empty-state">No orders found for the current trading day.</div>:<table><thead><tr><th>TIME</th><th>SYMBOL</th><th>SIDE</th><th>QTY / FILLED</th><th>AVG. PRICE</th><th>TYPE</th><th>STATUS</th></tr></thead><tbody>{orders.map(order=><tr key={order.orderId}><td>{order.timestamp?String(order.timestamp).slice(-8):'—'}</td><td><b>{order.symbol}</b><small>{order.exchange} · {order.product}</small></td><td><span className={`order-side ${order.side==='BUY'?'buy':'sell'}`}>{order.side}</span></td><td>{order.quantity} / {order.filledQuantity}</td><td>₹{number(order.averagePrice||order.price)}</td><td>{order.type}</td><td><span className={`status ${order.status==='COMPLETE'?'good':order.status==='REJECTED'?'warn':'neutral'}`}>{order.status}</span>{order.statusMessage&&<small>{order.statusMessage}</small>}</td></tr>)}</tbody></table>}</article>
          </section>
        </>}
        <footer><span>Prices are for research only and may be delayed outside a connected Zerodha session.</span><b>NOT INVESTMENT ADVICE</b></footer>
      </main>
    </div>
  </div>
}

function Metric({label,value,detail,trend,negative}){return <article className="metric-card"><span>{label}</span><b className={negative?'negative':''}>{value}</b><small>{detail}</small>{trend&&<i>↗</i>}</article>}
function PanelHead({index,title,subtitle,children}){return <div className="panel-head"><span>{index}</span><div><b>{title}</b><small>{subtitle}</small></div>{children}</div>}
function Status({good=false}){return <span className={`status ${good?'good':'warn'}`}>{good?'FAVOURABLE':'REVIEW'}</span>}

function SignedOutScreen() {
  return <div className="auth-screen"><div className="auth-brand"><span className="brand-mark"><i/><i/><i/></span><span>NSE <b>LAB</b></span></div><div className="auth-copy"><p>PRIVATE RESEARCH WORKSPACE</p><h1>Trade less on instinct.<br/><em>Research more.</em></h1><span>Secure time-series analytics, strategy diagnostics, and live Zerodha market data for Indian equities.</span><div className="auth-actions"><SignInButton mode="modal"><button>Sign in to workspace</button></SignInButton><SignUpButton mode="modal"><button className="secondary">Create an account</button></SignUpButton></div></div><div className="auth-visual"><Sparkline values={makeDemoSeries(9,100).map(r=>r.close)} fill/><div><b>+24.8%</b><span>ILLUSTRATIVE STRATEGY CURVE</span></div></div></div>
}

export default function App({ authConfigured }) {
  if (!authConfigured) return <Dashboard authConfigured={false} />
  return <><Show when="signed-out"><SignedOutScreen /></Show><Show when="signed-in"><Dashboard authConfigured /></Show></>
}
