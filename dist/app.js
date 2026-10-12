const canvas = document.getElementById('priceChart');
const ctx = canvas.getContext('2d');
let chartSeed = 1;

function seededNoise(i, seed=1) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeSeries(count, start, growth, volatility, seed) {
  const data = [start];
  for (let i = 1; i < count; i++) {
    const cycle = Math.sin(i / 8) * .004 + Math.sin(i / 19) * .002;
    const move = growth / count + (seededNoise(i, seed) - .5) * volatility + cycle;
    data.push(Math.max(start * .72, data[i - 1] * (1 + move)));
  }
  return data;
}

function drawChart() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height, pad = {l:10,r:45,t:45,b:24};
  const price = makeSeries(150, 2150, .32, .021, chartSeed);
  const nifty = makeSeries(150, 2150, .23, .014, chartSeed + 4);
  const all = [...price, ...nifty], min = Math.min(...all) * .97, max = Math.max(...all) * 1.03;
  const x = i => pad.l + (i / 149) * (w - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  ctx.clearRect(0,0,w,h); ctx.font = '9px DM Mono';
  for(let i=0;i<5;i++){const yy=pad.t+i*(h-pad.t-pad.b)/4;ctx.strokeStyle='#d9ddd7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();const value=max-(max-min)*i/4;ctx.fillStyle='#89918d';ctx.fillText('₹'+Math.round(value).toLocaleString('en-IN'),w-pad.r+8,yy+3)}
  function line(data,color,dash=[]){ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.setLineDash(dash);ctx.beginPath();data.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.stroke();ctx.setLineDash([])}
  line(nifty,'#9aa49e',[4,5]); line(price,'#0b1713');
  const endX=x(149),endY=y(price[149]);ctx.fillStyle='#c9ff48';ctx.beginPath();ctx.arc(endX,endY,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#07100e';ctx.stroke();
  ['OCT 23','JAN 24','APR 24','JUL 24','OCT 24','JAN 25','APR 25','JUL 25','OCT 25','JAN 26','APR 26','JUL 26'].forEach((m,i)=>{ctx.fillStyle='#8b938f';ctx.fillText(m,pad.l+i*(w-pad.l-pad.r)/11,h-5)});
}

document.querySelectorAll('.ranges button').forEach((button, index) => button.addEventListener('click', () => {
  document.querySelector('.ranges .active')?.classList.remove('active'); button.classList.add('active'); chartSeed = index + 1; drawChart();
}));

const menu = document.getElementById('symbolMenu');
document.getElementById('symbolButton').addEventListener('click', () => menu.classList.toggle('open'));
menu.querySelectorAll('button').forEach((button, index) => button.addEventListener('click', () => {
  document.getElementById('symbolName').textContent = button.dataset.symbol;
  document.querySelector('.symbol small').textContent = `NSE · ${button.dataset.company}`;
  document.getElementById('quotePrice').textContent = button.dataset.price;
  document.querySelector('.company-logo').textContent = button.dataset.symbol[0];
  chartSeed = index * 5 + 2; menu.classList.remove('open'); drawChart();
}));

document.addEventListener('click', e => { if (!e.target.closest('.instrument')) menu.classList.remove('open'); });

document.getElementById('strategyForm').addEventListener('submit', e => {
  e.preventDefault();
  const fast = +document.getElementById('fastWindow').value;
  const slow = +document.getElementById('slowWindow').value;
  if (fast >= slow) { document.getElementById('fastWindow').focus(); return; }
  const costPenalty = document.getElementById('costs').checked ? 2.1 : 0;
  const score = Math.max(8, 46 - Math.abs(fast-24)*.22 - Math.abs(slow-110)*.08 - costPenalty + seededNoise(fast+slow,chartSeed)*5);
  const cagr = (Math.pow(1+score/100,1/3)-1)*100;
  const drawdown = 9 + slow/25 + seededNoise(fast,4)*3;
  document.getElementById('results').animate([{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:420,easing:'ease-out'});
  document.getElementById('totalReturn').textContent = `+${score.toFixed(1)}%`;
  document.getElementById('cagr').textContent = `${cagr.toFixed(1)}%`;
  document.getElementById('drawdown').textContent = `−${drawdown.toFixed(1)}%`;
  document.getElementById('sharpe').textContent = (score/drawdown*.44).toFixed(2);
  document.getElementById('winRate').textContent = `${(49+seededNoise(slow,7)*15).toFixed(1)}%`;
  document.getElementById('alpha').textContent = `+${Math.max(0,score-31.2).toFixed(1)}% alpha`;
  document.getElementById('runTime').textContent = `Ran in ${(0.31+seededNoise(fast,2)*.3).toFixed(2)}s`;
  const capital = +(document.getElementById('capital').value.replace(/\D/g,'')) || 1000000;
  document.getElementById('profitValue').textContent = `₹${Math.round(capital*score/100).toLocaleString('en-IN')} net profit`;
});

const trades = [['04 Oct 2023','21 Nov 2023','LONG','+7.8%'],['12 Jan 2024','08 Mar 2024','LONG','+11.2%'],['27 May 2024','18 Jun 2024','LONG','−3.1%'],['07 Oct 2024','22 Jan 2025','LONG','+14.6%'],['16 Apr 2025','09 Jun 2025','LONG','+5.3%'],['11 Dec 2025','02 Feb 2026','LONG','−2.4%']];
document.getElementById('tradeRows').innerHTML = trades.map(t=>`<tr>${t.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('');
const dialog=document.getElementById('tradesDialog');
document.getElementById('viewTrades').addEventListener('click',()=>dialog.showModal());
document.getElementById('closeDialog').addEventListener('click',()=>dialog.close());
document.getElementById('newStudy').addEventListener('click',()=>{window.scrollTo({top:document.querySelector('.terminal').offsetTop-80,behavior:'smooth'});document.getElementById('fastWindow').focus()});
document.getElementById('themeButton').addEventListener('click',()=>{document.querySelector('.chart-panel').classList.toggle('contrast');drawChart()});
window.addEventListener('resize',drawChart); drawChart();
